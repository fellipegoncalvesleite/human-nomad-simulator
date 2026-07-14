import type { BandId, DecisionId, ReasonId, TileId, TickNumber } from "../core/types";
import type { Action, Decision, NormalizedIntensity } from "../rules/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import { deriveBandTendencies } from "./bandTendency";
import { deriveCampFootholdProfile } from "./campFoothold";
import type {
  Band,
  CampMovementDecisionTrace,
  CampMovementEvidenceRef,
  CampMovementScale,
  CampMovementState,
  CampMovementStatus,
  EstablishmentScopeState,
  EstablishmentOutcome,
  EscapeTargetIntegrityState,
  LocalOrbitTrapState,
  LocalCampShiftRecord,
  NewPlaceEstablishmentState,
  OldCampAnchorDecayRecord,
  PressureReliefCandidate,
  RangeRotationPressureReliefState,
  StagnationEscapeRecord,
  TemporaryCampPurpose,
  TemporaryTaskCampRecord,
} from "./types";
import { getCanonicalFoodStress } from "./seasonalSurvival";

const LOCAL_SHIFT_CAP = 8;
const TEMPORARY_CAMP_CAP = 6;
const OLD_CAMP_DECAY_CAP = 6;
const STAGNATION_ESCAPE_CAP = 8;
const RELIEF_CANDIDATE_CAP = 6;
const RELIEF_REJECTED_CANDIDATE_CAP = 4;
const RELIEF_SEARCH_RADIUS_TILES = 4;
const EVIDENCE_PER_ITEM_CAP = 4;
const BEHAVIOR_DELTA_CAP = 0.22;
const SAMPLE_CAP = 10;

interface ReliefRadiusEntry {
  readonly tile: Tile;
  readonly distance: number;
}

const sortedNeighborIdsByTile = new WeakMap<Tile, readonly TileId[]>();
const reliefRadiusEntriesByTiles = new WeakMap<WorldState["tiles"], Map<string, readonly ReliefRadiusEntry[]>>();

export interface CampMovementInfluence {
  readonly scale: CampMovementScale;
  readonly status: CampMovementStatus;
  readonly actionTypes: readonly Action["type"][];
  readonly targetTileId?: TileId;
  readonly scoreDelta: NormalizedIntensity;
  readonly expectedBenefit: string;
  readonly risk: string;
  readonly behaviorEffectScope: "camp_local" | "recovery_hold" | "stagnation_escape";
  readonly basis: readonly string[];
}

export interface CampMovementDecisionSupport {
  readonly bandId: BandId;
  readonly generatedAtTick: TickNumber;
  readonly influences: readonly CampMovementInfluence[];
  readonly pressureRelief: RangeRotationPressureReliefState;
  readonly stagnationDetected: boolean;
  readonly oldCampPullScore: NormalizedIntensity;
  readonly maxScoreDelta: NormalizedIntensity;
  readonly noNewActions: true;
  readonly boundedBehaviorInfluence: true;
  readonly antiOmniscient: true;
}

export interface CampMovementAdvanceInput {
  readonly world: WorldState;
  readonly previousBand: Band;
  readonly updatedBand: Band;
  readonly decision: Decision;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly crossingBlocked: boolean;
  readonly destinationBlocked: boolean;
  readonly observedTileIds: readonly TileId[];
}

export interface CampMovementProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: TickNumber;
  readonly generatedAtYear: number;
  readonly status: CampMovementStatus;
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly currentEstablishment?: NewPlaceEstablishmentState;
  readonly recentLocalShifts: readonly LocalCampShiftRecord[];
  readonly temporaryTaskCamps: readonly TemporaryTaskCampRecord[];
  readonly oldCampDecay: readonly OldCampAnchorDecayRecord[];
  readonly stagnationFlags: readonly string[];
  readonly stagnationEscapes: readonly StagnationEscapeRecord[];
  readonly passiveCollapseAudit: CampMovementState["passiveCollapseAudit"];
  readonly latestDecisionTrace: CampMovementState["latestDecisionTrace"];
  readonly rangeRotation: RangeRotationPressureReliefState;
  readonly localCampShiftCount: number;
  readonly temporaryCampCount: number;
  readonly establishmentStateCount: number;
  readonly establishmentSuccessCount: number;
  readonly establishmentFailureCount: number;
  readonly recoveryHoldCount: number;
  readonly oldCampDecayCount: number;
  readonly stagnationFlagCount: number;
  readonly stagnationEscapeResponseCount: number;
  readonly passiveCollapseCaseCount: number;
  readonly suspiciousPassiveCollapseCount: number;
  readonly daughterEstablishmentCaseCount: number;
  readonly adaptiveResponseRefCount: number;
  readonly footholdRefCount: number;
  readonly activityRefCount: number;
  readonly eventRefCount: number;
  readonly movementReasonRefCount: number;
  readonly demographyLaborRefCount: number;
  readonly oscillationCaseCount: number;
  readonly reliefCandidateCount: number;
  readonly goodEnoughReliefCandidateCount: number;
  readonly chosenReliefMoveCount: number;
  readonly rejectedReliefCandidateCount: number;
  readonly blockedReliefMoveCount: number;
  readonly scoutProbeBridgeCount: number;
  readonly targetlessEscapeAttemptCount: number;
  readonly repeatedTargetlessEscapeAttemptCount: number;
  readonly escapeResponsesWithTargetCount: number;
  readonly escapeResponsesBlockedCount: number;
  readonly localOrbitTrapCaseCount: number;
  readonly sameClusterShiftCount: number;
  readonly newClusterEstablishmentCount: number;
  readonly establishmentCarryOverCaseCount: number;
  readonly establishmentResetCaseCount: number;
  readonly maxStoredEntriesPerBand: number;
  readonly payloadBytesEstimate: number;
  readonly caps: CampMovementState["caps"];
  readonly integrity: {
    readonly behaviorActive: true;
    readonly localShiftDistinctFromRelocation: boolean;
    readonly temporaryCampsNotSettlement: boolean;
    readonly establishmentNotSettlement: boolean;
    readonly oldAnchorDecayGradual: boolean;
    readonly noNewActions: true;
    readonly noNewEcology: true;
    readonly noSettlementInventoryPropertyAgricultureCultureTerritory: true;
    readonly antiOmniscient: true;
    readonly behaviorInfluenceTraced: boolean;
  };
  readonly technicalProof: {
    readonly localShiftIds: readonly string[];
    readonly temporaryCampIds: readonly string[];
    readonly oldCampDecayIds: readonly string[];
    readonly escapeIds: readonly string[];
    readonly eventRefs: readonly string[];
    readonly footholdRefs: readonly string[];
    readonly adaptiveRefs: readonly string[];
  };
}

interface CampMovementSignals {
  readonly collapsePressure: number;
  readonly currentUsePressure: number;
  readonly movePressure: number;
  readonly localProblemPressure: number;
  readonly oldCampPull: number;
  readonly localFamiliarity: number;
  readonly laborThin: boolean;
  readonly stagnationFlags: readonly string[];
}

interface LocalTarget {
  readonly tileId: TileId;
  readonly score: number;
  readonly basis: readonly string[];
}

export function deriveCampMovementDecisionSupport(
  world: WorldState,
  band: Band,
): CampMovementDecisionSupport {
  const signals = deriveSignals(band);
  const prior = band.campMovement;
  const pressureRelief = deriveRangeRotationPressureReliefState(world, band, prior, signals);
  const influences: CampMovementInfluence[] = [];
  const chosenRelief = pressureRelief.chosenCandidate;

  if ((prior?.currentEstablishment?.recoveryNeed ?? 0) > 0.2 || prior?.status === "recovering") {
    influences.push({
      scale: "hard_move_recovery",
      status: "recovering",
      actionTypes: ["stay"],
      targetTileId: band.position,
      scoreDelta: round2(Math.min(BEHAVIOR_DELTA_CAP, 0.08 + (prior?.currentEstablishment?.recoveryNeed ?? 0.2) * 0.18)),
      expectedBenefit: "hold long enough for the new camp context to settle",
      risk: "recovery can fail if food or water pressure keeps rising",
      behaviorEffectScope: "recovery_hold",
      basis: ["recent move or unsettled camp", "recovery need"],
    });
  }

  if (
    signals.stagnationFlags.length > 0 &&
    chosenRelief !== undefined &&
    chosenRelief.actionStrategy === "move_to_tile"
  ) {
    influences.push({
      scale: "pressure_relief_move",
      status: "shifting",
      actionTypes: ["move_to_tile"],
      targetTileId: chosenRelief.tileId,
      scoreDelta: round2(Math.min(
        BEHAVIOR_DELTA_CAP,
        0.08 +
          signals.localProblemPressure * 0.14 +
          chosenRelief.pressureReliefScore * 0.14 +
          (pressureRelief.localOrbitTrap.detected ? 0.04 : 0),
      )),
      expectedBenefit: "rotate to a good-enough, less-worn known place without leaving familiar country",
      risk: "the place is relief, not a guaranteed richer home",
      behaviorEffectScope: "camp_local",
      basis: [
        chosenRelief.reasonLabel,
        `use pressure difference ${chosenRelief.usePressureDifference.toFixed(2)}`,
        chosenRelief.betterThanCurrent ? "also better than current" : "not strictly better than current",
        chosenRelief.sameRiverCountry ? "river country retained" : "near familiar country",
      ].slice(0, 4),
    });
  }

  if (
    signals.stagnationFlags.length > 0 &&
    chosenRelief !== undefined &&
    chosenRelief.actionStrategy === "scout_probe"
  ) {
    influences.push({
      scale: "relief_scout_probe",
      status: "probing",
      actionTypes: ["logistical_probe", "resource_scout"],
      targetTileId: chosenRelief.tileId,
      scoreDelta: round2(Math.min(
        BEHAVIOR_DELTA_CAP,
        0.06 +
          signals.localProblemPressure * 0.1 +
          chosenRelief.pressureReliefScore * 0.12 +
          (pressureRelief.localOrbitTrap.detected ? 0.04 : 0),
      )),
      expectedBenefit: "check a plausible less-used relief place before moving everyone",
      risk: "the target is plausible but still uncertain",
      behaviorEffectScope: "stagnation_escape",
      basis: [
        chosenRelief.reasonLabel,
        `uncertainty ${chosenRelief.uncertainty.toFixed(2)}`,
        chosenRelief.sameRiverCountry ? "keeps river/water country in reach" : "stays near familiar country",
      ].slice(0, 4),
    });
  }

  if (
    signals.stagnationFlags.length > 0 &&
    chosenRelief?.actionStrategy !== "move_to_tile"
  ) {
    const localTarget = chooseLocalShiftTarget(world, band, prior);

    if (localTarget !== undefined) {
      influences.push({
        scale: "local_camp_shift",
        status: "shifting",
        actionTypes: ["move_to_tile"],
        targetTileId: localTarget.tileId,
        scoreDelta: round2(Math.min(BEHAVIOR_DELTA_CAP, 0.08 + signals.localProblemPressure * 0.18 + localTarget.score * 0.08)),
        expectedBenefit: "try a nearby camp shift before a larger relocation",
        risk: "a nearby shift can still be the same bad country",
        behaviorEffectScope: "camp_local",
        basis: localTarget.basis,
      });
    }
  }

  if (signals.stagnationFlags.length > 0 && !signals.laborThin) {
    influences.push({
      scale: "temporary_task_camp",
      status: "probing",
      actionTypes: ["logistical_probe", "resource_scout"],
      scoreDelta: round2(Math.min(BEHAVIOR_DELTA_CAP, 0.05 + signals.localProblemPressure * 0.12)),
      expectedBenefit: "test a task camp or scout before moving everyone",
      risk: "a probe gives information or a temporary foothold, not a secure home",
      behaviorEffectScope: "stagnation_escape",
      basis: ["stagnation pressure", "adult labor not completely exhausted"],
    });
  }

  if (signals.stagnationFlags.length > 1 && signals.collapsePressure > 0.52) {
    influences.push({
      scale: "stagnation_escape",
      status: "stagnant",
      actionTypes: ["move_to_tile", "explore_unknown_neighbor", "logistical_probe", "resource_scout"],
      scoreDelta: round2(Math.min(BEHAVIOR_DELTA_CAP, 0.06 + signals.collapsePressure * 0.12)),
      expectedBenefit: "avoid simply waiting in a visibly declining place",
      risk: "escape may be costly, late, or based on weak evidence",
      behaviorEffectScope: "stagnation_escape",
      basis: signals.stagnationFlags.slice(0, 3),
    });
  }

  // CAUSAL-REPAIR-1: a band's stable camp-shift willingness scales its
  // shift/probe influences ±15% (recovery holds untouched), still capped by
  // BEHAVIOR_DELTA_CAP — willing bands shift camp a little sooner, reluctant
  // bands hold a little longer, ecology still decides.
  const shiftWillingnessScale = 1 + deriveBandTendencies(band).campShiftWillingness * 0.15;
  const capped = influences
    .map((influence) =>
      influence.behaviorEffectScope === "recovery_hold"
        ? influence
        : {
            ...influence,
            scoreDelta: round2(Math.min(BEHAVIOR_DELTA_CAP, influence.scoreDelta * shiftWillingnessScale)),
          })
    .filter((influence) => influence.scoreDelta > 0)
    .sort(compareInfluences)
    .slice(0, 5);

  return {
    bandId: band.id,
    generatedAtTick: world.time.tick,
    influences: capped,
    pressureRelief,
    stagnationDetected: signals.stagnationFlags.length > 0,
    oldCampPullScore: prior?.oldCampPullScore ?? signals.oldCampPull,
    maxScoreDelta: capped.reduce((max, influence) => Math.max(max, influence.scoreDelta), 0),
    noNewActions: true,
    boundedBehaviorInfluence: true,
    antiOmniscient: true,
  };
}

export function selectCampMovementInfluenceForAction(
  action: Action,
  support: CampMovementDecisionSupport | undefined,
): CampMovementInfluence | undefined {
  if (support === undefined) {
    return undefined;
  }
  const targetTileId = actionTargetTileId(action);
  return support.influences.find((influence) =>
    influence.actionTypes.includes(action.type) &&
    (influence.targetTileId === undefined || targetTileId === influence.targetTileId));
}

export function advanceCampMovementState(input: CampMovementAdvanceInput): CampMovementState {
  const prior = input.previousBand.campMovement;
  const signals = deriveSignals(input.updatedBand);
  const decisionTrace = buildDecisionTrace(input.decision);
  const distance = tileDistance(input.world, input.previousBand.position, input.nextPosition);
  const rangeRotation = deriveRangeRotationPressureReliefState(input.world, input.updatedBand, prior, signals, {
    input,
    decisionTrace,
    moveDistance: distance,
  });
  const localShift = input.moved &&
    distance <= 2 &&
    (decisionTrace?.scale === "local_camp_shift" || decisionTrace?.scale === "pressure_relief_move") &&
    decisionTrace.scoreDelta > 0
    ? makeLocalShiftRecord(input, distance, decisionTrace)
    : undefined;
  const temporaryCamp = !input.moved && (input.decision.action.type === "logistical_probe" || input.decision.action.type === "resource_scout")
    ? makeTemporaryCampRecord(input, decisionTrace)
    : undefined;
  const currentEstablishment = advanceEstablishment(input, prior?.currentEstablishment, signals, distance);
  const oldCampDecay = capOldCampDecay([
    ...maybeOldCampDecay(input, prior, signals),
    ...(prior?.oldCampDecay ?? []),
  ]);
  const oldCampPullScore = oldCampDecay[0]?.pullAfter ?? Math.max(0.18, signals.oldCampPull);
  const escape = maybeStagnationEscape(input, signals, decisionTrace, localShift, temporaryCamp, rangeRotation);
  const stagnationEscapes = capEscapes([
    ...(escape === undefined ? [] : [escape]),
    ...(prior?.stagnationEscapes ?? []),
  ]);
  const recentLocalShifts = capLocalShifts([
    ...(localShift === undefined ? [] : [localShift]),
    ...(prior?.recentLocalShifts ?? []),
  ]);
  const temporaryTaskCamps = capTemporaryCamps([
    ...(temporaryCamp === undefined ? [] : [temporaryCamp]),
    ...(prior?.temporaryTaskCamps ?? []).map((camp) =>
      camp.expiresAfterTick < input.world.time.tick ? { ...camp, status: "expired" as const } : camp),
  ]);
  const oscillationGuard = updateOscillationGuard(input, prior, localShift);
  const passiveCollapseAudit = derivePassiveCollapseAudit(input.updatedBand, input.world.time.tick, signals, stagnationEscapes);
  const status = deriveStatus(signals, currentEstablishment, localShift, temporaryCamp, passiveCollapseAudit);
  const evidenceRefsWithinCap =
    (currentEstablishment === undefined || currentEstablishment.evidenceRefs.length <= EVIDENCE_PER_ITEM_CAP) &&
    recentLocalShifts.every((entry) => entry.evidenceRefs.length <= EVIDENCE_PER_ITEM_CAP) &&
    temporaryTaskCamps.every((entry) => entry.evidenceRefs.length <= EVIDENCE_PER_ITEM_CAP) &&
    stagnationEscapes.every((entry) => entry.evidenceRefs.length <= EVIDENCE_PER_ITEM_CAP);
  const state: CampMovementState = {
    bandId: input.updatedBand.id,
    lastUpdatedTick: input.world.time.tick,
    status,
    currentEstablishment,
    recentLocalShifts,
    temporaryTaskCamps,
    oldCampPullScore: round2(oldCampPullScore),
    oldCampDecay,
    stagnationFlags: signals.stagnationFlags,
    stagnationEscapes,
    passiveCollapseAudit,
    latestDecisionTrace: decisionTrace,
    rangeRotation,
    oscillationGuard,
    caps: {
      localShiftCap: LOCAL_SHIFT_CAP,
      temporaryCampCap: TEMPORARY_CAMP_CAP,
      oldCampDecayCap: OLD_CAMP_DECAY_CAP,
      stagnationEscapeCap: STAGNATION_ESCAPE_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      capsHeld:
        recentLocalShifts.length <= LOCAL_SHIFT_CAP &&
        temporaryTaskCamps.length <= TEMPORARY_CAMP_CAP &&
        oldCampDecay.length <= OLD_CAMP_DECAY_CAP &&
        stagnationEscapes.length <= STAGNATION_ESCAPE_CAP &&
        evidenceRefsWithinCap,
    },
    integrity: {
      behaviorActive: true,
      boundedBehaviorInfluence: true,
      noSettlement: true,
      noInventoryPropertyStorageEconomy: true,
      noNewEcology: true,
      noCultureTerritoryTradeWar: true,
      antiOmniscient: true,
    },
  };

  return state;
}

export function deriveCampMovementProfile(world: WorldState, band: Band): CampMovementProfile {
  const state = band.campMovement ?? advanceCampMovementState({
    world,
    previousBand: band,
    updatedBand: band,
    decision: makeSyntheticStayDecision(world, band),
    nextPosition: band.position,
    moved: false,
    crossingBlocked: false,
    destinationBlocked: false,
    observedTileIds: [band.position],
  });
  const foothold = deriveCampFootholdProfile(world, band);
  const profileSignals = deriveSignals(band);
  const rangeRotation =
    state.rangeRotation ?? deriveRangeRotationPressureReliefState(world, band, state, profileSignals);
  const evidence = [
    ...(state.currentEstablishment?.evidenceRefs ?? []),
    ...state.recentLocalShifts.flatMap((shift) => shift.evidenceRefs),
    ...state.temporaryTaskCamps.flatMap((camp) => camp.evidenceRefs),
    ...state.stagnationEscapes.flatMap((escape) => escape.evidenceRefs),
    ...rangeRotation.candidates.flatMap((candidate) => candidate.evidenceRefs),
  ];
  const eventRefs = evidence.flatMap((entry) => entry.eventId === undefined ? [] : [entry.eventId]);
  const establishmentSuccessCount = state.currentEstablishment?.status === "holding" || state.currentEstablishment?.status === "established" ? 1 : 0;
  const establishmentFailureCount = state.currentEstablishment?.status === "failing" ? 1 : 0;
  const payload = JSON.stringify({
    bandId: band.id,
    state,
    rangeRotation,
    footholdRefs: foothold.places.map((place) => place.id).slice(0, SAMPLE_CAP),
  });

  return {
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: world.time.year,
    status: state.status,
    overviewTitle: campMovementOverviewTitle(state),
    overviewLines: campMovementOverviewLines(state),
    currentEstablishment: state.currentEstablishment,
    recentLocalShifts: state.recentLocalShifts,
    temporaryTaskCamps: state.temporaryTaskCamps,
    oldCampDecay: state.oldCampDecay,
    stagnationFlags: state.stagnationFlags,
    stagnationEscapes: state.stagnationEscapes,
    passiveCollapseAudit: state.passiveCollapseAudit,
    latestDecisionTrace: state.latestDecisionTrace,
    rangeRotation,
    localCampShiftCount: state.recentLocalShifts.length,
    temporaryCampCount: state.temporaryTaskCamps.length,
    establishmentStateCount: state.currentEstablishment === undefined ? 0 : 1,
    establishmentSuccessCount,
    establishmentFailureCount,
    recoveryHoldCount: state.stagnationEscapes.filter((escape) => escape.response === "recovery_hold").length,
    oldCampDecayCount: state.oldCampDecay.length,
    stagnationFlagCount: state.stagnationFlags.length,
    stagnationEscapeResponseCount: state.stagnationEscapes.length,
    passiveCollapseCaseCount: state.passiveCollapseAudit?.status === "not_under_collapse_pressure" ? 0 : 1,
    suspiciousPassiveCollapseCount: state.passiveCollapseAudit?.status === "suspicious_passive" ? 1 : 0,
    daughterEstablishmentCaseCount: band.parentBandId === undefined || state.currentEstablishment === undefined ? 0 : 1,
    adaptiveResponseRefCount: evidence.filter((entry) => entry.sourceSystem === "adaptive_human").length,
    footholdRefCount: foothold.places.length + foothold.factors.length,
    activityRefCount: evidence.filter((entry) => entry.activityId !== undefined || entry.sourceSystem === "activity").length,
    eventRefCount: uniqueCount(eventRefs),
    movementReasonRefCount: uniqueCount(evidence.flatMap((entry) => entry.reasonIds.map(String))),
    demographyLaborRefCount: evidence.filter((entry) => entry.sourceSystem === "demography").length,
    oscillationCaseCount: state.oscillationGuard.blockedOscillationCount,
    reliefCandidateCount: rangeRotation.counts.reliefCandidates,
    goodEnoughReliefCandidateCount: rangeRotation.counts.goodEnoughCandidates,
    chosenReliefMoveCount: rangeRotation.counts.chosenReliefMoves,
    rejectedReliefCandidateCount: rangeRotation.counts.rejectedReliefCandidates,
    blockedReliefMoveCount: rangeRotation.counts.blockedReliefMoves,
    scoutProbeBridgeCount: rangeRotation.counts.scoutProbeBridges,
    targetlessEscapeAttemptCount: rangeRotation.targetIntegrity.targetlessAttempts,
    repeatedTargetlessEscapeAttemptCount: rangeRotation.targetIntegrity.repeatedTargetlessAttempts,
    escapeResponsesWithTargetCount: rangeRotation.targetIntegrity.escapeResponsesWithTarget,
    escapeResponsesBlockedCount: rangeRotation.targetIntegrity.escapeResponsesBlocked,
    localOrbitTrapCaseCount: rangeRotation.localOrbitTrap.detected ? 1 : 0,
    sameClusterShiftCount: rangeRotation.counts.sameClusterShifts,
    newClusterEstablishmentCount: rangeRotation.counts.newClusterEstablishments,
    establishmentCarryOverCaseCount: rangeRotation.counts.establishmentCarryOverCases,
    establishmentResetCaseCount: rangeRotation.counts.establishmentResetCases,
    maxStoredEntriesPerBand: Math.max(
      state.recentLocalShifts.length,
      state.temporaryTaskCamps.length,
      state.oldCampDecay.length,
      state.stagnationEscapes.length,
      rangeRotation.candidates.length,
    ),
    payloadBytesEstimate: byteLengthUtf8(payload),
    caps: state.caps,
    integrity: {
      behaviorActive: true,
      localShiftDistinctFromRelocation: state.recentLocalShifts.every((shift) => shift.distance <= 2),
      temporaryCampsNotSettlement: state.temporaryTaskCamps.every((camp) => camp.noSettlement && camp.noInventory),
      establishmentNotSettlement: state.currentEstablishment?.noSettlement ?? true,
      oldAnchorDecayGradual: state.oldCampDecay.every((record) => record.decayAmount <= 0.12 && record.canRecover),
      noNewActions: true,
      noNewEcology: true,
      noSettlementInventoryPropertyAgricultureCultureTerritory: true,
      antiOmniscient: true,
      behaviorInfluenceTraced: state.latestDecisionTrace !== undefined,
    },
    technicalProof: {
      localShiftIds: state.recentLocalShifts.map((entry) => entry.id).slice(0, SAMPLE_CAP),
      temporaryCampIds: state.temporaryTaskCamps.map((entry) => entry.id).slice(0, SAMPLE_CAP),
      oldCampDecayIds: state.oldCampDecay.map((entry) => entry.id).slice(0, SAMPLE_CAP),
      escapeIds: state.stagnationEscapes.map((entry) => entry.id).slice(0, SAMPLE_CAP),
      eventRefs: uniqueStrings(eventRefs).slice(0, SAMPLE_CAP),
      footholdRefs: foothold.places.map((place) => place.id).slice(0, SAMPLE_CAP),
      adaptiveRefs: evidence.filter((entry) => entry.sourceSystem === "adaptive_human").map((entry) => entry.sourceId).slice(0, SAMPLE_CAP),
    },
  };
}

interface RangeRotationAdvanceContext {
  readonly input: CampMovementAdvanceInput;
  readonly decisionTrace: CampMovementDecisionTrace | undefined;
  readonly moveDistance: number;
}

function deriveRangeRotationPressureReliefState(
  world: WorldState,
  band: Band,
  prior: CampMovementState | undefined,
  signals: CampMovementSignals,
  advanceContext?: RangeRotationAdvanceContext,
): RangeRotationPressureReliefState {
  const current = getTile(world, band.position);
  const currentLocalClusterId = current === undefined ? `cluster:unknown:${String(band.position)}` : localClusterId(current);
  const currentLocalRangeId = current === undefined ? `range:unknown:${String(band.position)}` : localRangeId(current);
  const localOrbitTrap = detectLocalOrbitTrap(world, band, prior, signals, currentLocalClusterId);
  const rawCandidates = current === undefined
    ? []
    : collectPressureReliefCandidates(world, band, current, signals, localOrbitTrap);
  const chosenCandidate = choosePressureReliefCandidate(rawCandidates, localOrbitTrap);
  const candidates = rawCandidates
    .map((candidate) => markPressureReliefCandidate(candidate, chosenCandidate))
    .sort(comparePressureReliefCandidatesForDisplay)
    .slice(0, RELIEF_CANDIDATE_CAP);
  const chosenMarked = candidates.find((candidate) => chosenCandidate !== undefined && candidate.id === chosenCandidate.id);
  const rejectedCandidates = candidates
    .filter((candidate) => candidate.status === "rejected" || candidate.status === "blocked")
    .slice(0, RELIEF_REJECTED_CANDIDATE_CAP);
  const scoutProbeBridge = chosenMarked?.actionStrategy === "scout_probe"
    ? chosenMarked
    : candidates.find((candidate) => candidate.actionStrategy === "scout_probe" && candidate.goodEnoughRelief);
  const blockedReason = chosenMarked === undefined
    ? reliefBlockedReason(rawCandidates, signals, localOrbitTrap)
    : undefined;
  const targetIntegrity = deriveTargetIntegrity(prior, signals, advanceContext, blockedReason);
  const establishmentScope = deriveEstablishmentScopeState(world, band, prior, advanceContext);

  return {
    currentLocalClusterId,
    currentLocalRangeId,
    currentUsePressure: round2(signals.currentUsePressure),
    rangeSaturationPressure: round2(band.rangeSaturation?.saturationPressure ?? 0),
    candidates,
    chosenCandidate: chosenMarked,
    rejectedCandidates,
    blockedReason,
    localOrbitTrap: {
      ...localOrbitTrap,
      escalation: chosenMarked?.actionStrategy === "move_to_tile"
        ? "relief_move"
        : chosenMarked?.actionStrategy === "scout_probe"
          ? "scout_probe"
          : blockedReason === undefined
            ? "none"
            : "blocked",
    },
    scoutProbeBridge,
    targetIntegrity,
    establishmentScope,
    counts: {
      reliefCandidates: candidates.length,
      goodEnoughCandidates: candidates.filter((candidate) => candidate.goodEnoughRelief).length,
      chosenReliefMoves: chosenMarked?.actionStrategy === "move_to_tile" ? 1 : 0,
      rejectedReliefCandidates: rejectedCandidates.length,
      blockedReliefMoves: candidates.filter((candidate) => candidate.status === "blocked").length + (blockedReason === undefined ? 0 : 1),
      scoutProbeBridges: scoutProbeBridge === undefined ? 0 : 1,
      sameClusterShifts: establishmentScope.sameClusterShift ? 1 : 0,
      newClusterEstablishments: establishmentScope.newClusterMove ? 1 : 0,
      establishmentCarryOverCases: establishmentScope.carriedOver ? 1 : 0,
      establishmentResetCases: establishmentScope.resetReason === undefined ? 0 : 1,
    },
    caps: {
      candidateCap: RELIEF_CANDIDATE_CAP,
      rejectedCandidateCap: RELIEF_REJECTED_CANDIDATE_CAP,
      searchRadiusTiles: RELIEF_SEARCH_RADIUS_TILES,
      capsHeld: candidates.length <= RELIEF_CANDIDATE_CAP && rejectedCandidates.length <= RELIEF_REJECTED_CANDIDATE_CAP,
    },
    integrity: {
      goodEnoughSeparateFromBetterThanCurrent:
        candidates.some((candidate) => candidate.goodEnoughRelief && !candidate.betterThanCurrent) ||
        rawCandidates.some((candidate) => candidate.goodEnoughRelief && !candidate.betterThanCurrent),
      boundedBehaviorInfluence: true,
      noLongDistanceMigrationForced: true,
      riverFollowingRetained: true,
      noFissionBehaviorChange: true,
      noNewEcology: true,
    },
  };
}

function collectPressureReliefCandidates(
  world: WorldState,
  band: Band,
  current: Tile,
  signals: CampMovementSignals,
  localOrbitTrap: LocalOrbitTrapState,
): readonly PressureReliefCandidate[] {
  const currentRecord = band.knowledge.observedTiles[current.id];
  const currentSupport = supportAdequacy(current, currentRecord);
  const currentWater = waterRefugeAdequacy(current, currentRecord);
  const currentCluster = localClusterId(current);
  const currentRange = localRangeId(current);
  const nonFoodPressure = nonFoodCampPressure(band, signals);
  const reliefNeeded = clamp01(
    signals.currentUsePressure * 0.34 +
      signals.localProblemPressure * 0.24 +
      (band.rangeSaturation?.saturationPressure ?? 0) * 0.2 +
      nonFoodPressure * 0.22,
  );

  if (reliefNeeded < 0.18) {
    return [];
  }

  const entries = getTilesWithinReliefRadius(world, current, RELIEF_SEARCH_RADIUS_TILES)
    .filter((entry) => entry.tile.id !== current.id && isPlausibleCampTile(entry.tile))
    .map((entry) => makePressureReliefCandidate({
      world,
      band,
      current,
      currentCluster,
      currentRange,
      currentSupport,
      currentWater,
      signals,
      nonFoodPressure,
      localOrbitTrap,
      tile: entry.tile,
      distance: entry.distance,
    }))
    .filter((candidate): candidate is PressureReliefCandidate => candidate !== undefined)
    .sort(comparePressureReliefCandidatesForChoice)
    .slice(0, RELIEF_CANDIDATE_CAP * 2);

  return entries;
}

function makePressureReliefCandidate(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly current: Tile;
  readonly currentCluster: string;
  readonly currentRange: string;
  readonly currentSupport: number;
  readonly currentWater: number;
  readonly signals: CampMovementSignals;
  readonly nonFoodPressure: number;
  readonly localOrbitTrap: LocalOrbitTrapState;
  readonly tile: Tile;
  readonly distance: number;
}): PressureReliefCandidate | undefined {
  const observed = input.band.knowledge.observedTiles[input.tile.id];
  const inferred = input.band.frontierKnowledge?.inferredTiles[input.tile.id];

  if (observed === undefined && inferred === undefined) {
    return undefined;
  }

  const knownness = clamp01(observed?.confidence ?? (inferred?.confidence ?? 0) * 0.72);
  const support = observed === undefined ? 0.38 : supportAdequacy(input.tile, observed);
  const water = observed === undefined ? (inferred?.isNearWaterMargin === true ? 0.46 : 0.34) : waterRefugeAdequacy(input.tile, observed);
  const risk = observed?.observedRisk ?? 0.42;
  const targetUse = localUsePressure(input.band, input.tile.id);
  const usePressureDifference = round2(clamp01(input.signals.currentUsePressure - targetUse));
  const supportDelta = round2(support - input.currentSupport);
  const waterDelta = water - input.currentWater;
  const sameCluster = localClusterId(input.tile) === input.currentCluster;
  const sameRange = localRangeId(input.tile) === input.currentRange;
  const sameRiverCountry = isSameRiverCountry(input.current, input.tile);
  const familiarCountry = observed !== undefined || (inferred !== undefined && input.distance <= RELIEF_SEARCH_RADIUS_TILES);
  const relationToCurrentCluster =
    sameCluster
      ? "same_local_cluster"
      : sameRange || sameRiverCountry
        ? "nearby_known_range"
        : "edge_of_familiar_country";
  const travelCost = clamp01(
    input.distance / (RELIEF_SEARCH_RADIUS_TILES + 1) * 0.42 +
      ((observed?.observedMovementCost ?? 1.4) - 1) * 0.12 +
      (sameRiverCountry ? 0 : 0.08),
  );
  const oldCampPullPenalty = round2(clamp01(input.signals.oldCampPull * (sameCluster ? 0.16 : 0.08)));
  const campSicknessWearRelief = round2(clamp01(
    input.nonFoodPressure * 0.44 +
      usePressureDifference * 0.32 +
      (input.signals.currentUsePressure > 0.55 ? 0.08 : 0) +
      (input.band.rangeSaturation?.saturationPressure ?? 0) * 0.16,
  ));
  const betterThanCurrent = supportDelta > 0.05 || waterDelta > 0.06;
  const strictFoodBetter = supportDelta > 0.05;
  const supportGoodEnough = support >= Math.max(0.28, input.currentSupport - 0.16);
  const waterGoodEnough = water >= Math.max(0.28, Math.min(0.48, input.currentWater - 0.1));
  const routeAcceptable = travelCost <= 0.58 || input.distance <= 2 || sameRiverCountry;
  const pressureReliefScore = round2(clamp01(
    usePressureDifference * 0.38 +
      campSicknessWearRelief * 0.26 +
      support * 0.1 +
      water * 0.1 +
      (sameRiverCountry ? 0.06 : 0) +
      (input.localOrbitTrap.detected && !sameCluster ? 0.08 : 0) -
      travelCost * 0.2 -
      risk * 0.12 -
      oldCampPullPenalty * 0.08,
  ));
  const goodEnoughRelief =
    familiarCountry &&
    supportGoodEnough &&
    waterGoodEnough &&
    routeAcceptable &&
    risk < 0.68 &&
    (usePressureDifference >= 0.06 || campSicknessWearRelief >= 0.22 || input.localOrbitTrap.detected) &&
    pressureReliefScore >= 0.18;
  const blockedReason =
    !familiarCountry
      ? "outside familiar country"
      : !waterGoodEnough
        ? "water/refuge too weak"
        : !supportGoodEnough
          ? "support below good-enough threshold"
          : risk >= 0.68
            ? "risk too high"
            : !routeAcceptable
              ? "travel or crossing burden too high"
              : pressureReliefScore < 0.18
                ? "pressure relief too small"
                : undefined;
  const actionStrategy =
    blockedReason !== undefined
      ? "blocked"
      : observed === undefined || knownness < 0.34 || input.distance > 2
        ? "scout_probe"
        : "move_to_tile";
  const status =
    blockedReason !== undefined
      ? "blocked"
      : actionStrategy === "scout_probe"
        ? "scout_probe"
        : goodEnoughRelief
          ? "good_enough"
          : "rejected";
  const reasonLabel = goodEnoughRelief
    ? betterThanCurrent
      ? "less worn and also somewhat better"
      : "good enough and less exhausted"
    : blockedReason ?? "not enough pressure relief";

  return {
    id: `pressure-relief:${String(input.band.id)}:${String(input.tile.id)}`,
    tileId: input.tile.id,
    distanceTiles: input.distance,
    relationToCurrentCluster,
    knownness: round2(knownness),
    supportAdequacy: round2(support),
    waterRefugeAdequacy: round2(water),
    pressureReliefScore,
    usePressureDifference,
    campSicknessWearRelief,
    crossingTravelCost: round2(travelCost),
    oldCampPullPenalty,
    uncertainty: round2(1 - knownness),
    supportDelta,
    betterThanCurrent,
    strictFoodBetter,
    goodEnoughRelief,
    familiarCountry,
    sameRiverCountry,
    actionStrategy,
    status,
    reasonLabel,
    blockedReason,
    evidenceRefs: capEvidence([
      pressureReliefEvidence(input.band, input.tile.id, reasonLabel, pressureReliefScore),
    ]),
  };
}

function choosePressureReliefCandidate(
  candidates: readonly PressureReliefCandidate[],
  localOrbitTrap: LocalOrbitTrapState,
): PressureReliefCandidate | undefined {
  const viable = candidates
    .filter((candidate) => candidate.goodEnoughRelief && candidate.actionStrategy !== "blocked")
    .sort((left, right) => {
      const leftScore = reliefChoiceScore(left, localOrbitTrap);
      const rightScore = reliefChoiceScore(right, localOrbitTrap);
      return rightScore - leftScore || compareTileIds(left.tileId, right.tileId);
    });

  return viable[0];
}

function reliefChoiceScore(candidate: PressureReliefCandidate, localOrbitTrap: LocalOrbitTrapState): number {
  return candidate.pressureReliefScore +
    (candidate.actionStrategy === "move_to_tile" ? 0.04 : 0) +
    (candidate.sameRiverCountry ? 0.03 : 0) +
    (localOrbitTrap.detected && candidate.relationToCurrentCluster !== "same_local_cluster" ? 0.08 : 0) -
    candidate.crossingTravelCost * 0.08 -
    candidate.uncertainty * 0.04;
}

function markPressureReliefCandidate(
  candidate: PressureReliefCandidate,
  chosen: PressureReliefCandidate | undefined,
): PressureReliefCandidate {
  if (chosen !== undefined && candidate.id === chosen.id) {
    return { ...candidate, status: "chosen" };
  }
  if (candidate.status === "blocked") {
    return candidate;
  }
  if (candidate.actionStrategy === "scout_probe") {
    return candidate;
  }
  if (candidate.goodEnoughRelief) {
    return { ...candidate, status: "good_enough" };
  }
  return { ...candidate, status: "rejected" };
}

function detectLocalOrbitTrap(
  world: WorldState,
  band: Band,
  prior: CampMovementState | undefined,
  signals: CampMovementSignals,
  currentLocalClusterId: string,
): LocalOrbitTrapState {
  const recentMoves = band.movementHistory.slice(-8);
  const microMoves = recentMoves.filter((move) => {
    const from = getTile(world, move.fromTileId);
    const to = getTile(world, move.toTileId);
    return from !== undefined && to !== undefined && tileDistanceByCoord(from, to) <= 1;
  });
  const shiftedTiles = uniqueStrings([
    ...microMoves.flatMap((move) => [String(move.fromTileId), String(move.toTileId)]),
    ...(prior?.recentLocalShifts ?? []).slice(0, 5).flatMap((shift) => [String(shift.fromTileId), String(shift.toTileId)]),
  ]);
  const sameClusterTouches = shiftedTiles.filter((tileId) => {
    const tile = getTile(world, tileId as TileId);
    return tile !== undefined && localClusterId(tile) === currentLocalClusterId;
  }).length;
  const currentTile = getTile(world, band.position);
  const nearCurrentTouches = currentTile === undefined
    ? 0
    : shiftedTiles.filter((tileId) => {
        const tile = getTile(world, tileId as TileId);
        return tile !== undefined && tileDistanceByCoord(currentTile, tile) <= 2;
      }).length;
  const sameClusterLoop =
    shiftedTiles.length > 0 &&
    (
      sameClusterTouches >= Math.max(2, Math.ceil(shiftedTiles.length * 0.68)) ||
      nearCurrentTouches >= Math.max(2, Math.ceil(shiftedTiles.length * 0.8))
    );
  const pressure = round2(clamp01(
    signals.currentUsePressure * 0.38 +
      signals.localProblemPressure * 0.28 +
      (band.rangeSaturation?.saturationPressure ?? 0) * 0.22 +
      (prior?.oscillationGuard.blockedOscillationCount ?? 0) * 0.08,
  ));
  const detected =
    pressure >= 0.42 &&
    (microMoves.length >= 3 || (prior?.recentLocalShifts.filter((shift) => shift.distance <= 1).length ?? 0) >= 2) &&
    sameClusterLoop;

  return {
    detected,
    currentLocalClusterId,
    recentMicroShiftCount: microMoves.length,
    recentDistinctTileCount: shiftedTiles.length,
    sameClusterLoop,
    pressure,
    escalation: "none",
    basis: [
      microMoves.length >= 3 ? "recent whole-band moves are mostly 1-tile moves" : undefined,
      sameClusterLoop ? "recent moves remain inside the same local cluster" : undefined,
      signals.currentUsePressure > 0.35 ? "local use pressure remains high" : undefined,
      (band.rangeSaturation?.saturationPressure ?? 0) > 0.55 ? "range saturation remains high" : undefined,
      (prior?.oscillationGuard.blockedOscillationCount ?? 0) > 0 ? "backtracking guard has fired" : undefined,
    ].filter((entry): entry is string => entry !== undefined).slice(0, 5),
  };
}

function deriveTargetIntegrity(
  prior: CampMovementState | undefined,
  signals: CampMovementSignals,
  advanceContext: RangeRotationAdvanceContext | undefined,
  blockedReason: string | undefined,
): EscapeTargetIntegrityState {
  const priorIntegrity = prior?.rangeRotation?.targetIntegrity;
  const previousTargetless = priorIntegrity?.targetlessAttempts ?? 0;
  const previousRepeated = priorIntegrity?.repeatedTargetlessAttempts ?? 0;
  const previousWithTarget = priorIntegrity?.escapeResponsesWithTarget ?? 0;
  const previousBlocked = priorIntegrity?.escapeResponsesBlocked ?? 0;

  if (advanceContext === undefined || signals.stagnationFlags.length === 0) {
    return {
      escapeResponsesWithTarget: previousWithTarget,
      escapeResponsesBlocked: previousBlocked,
      targetlessAttempts: previousTargetless,
      repeatedTargetlessAttempts: previousRepeated,
      latestBlockedReason: priorIntegrity?.latestBlockedReason ?? blockedReason,
    };
  }

  const action = advanceContext.input.decision.action;
  const targetTileId = actionTargetTileId(action);
  const targetRequired = isTargetedEscapeAction(action.type);
  const traceScale = advanceContext.decisionTrace?.scale;
  const escapeLike =
    traceScale === "pressure_relief_move" ||
    traceScale === "relief_scout_probe" ||
    traceScale === "local_camp_shift" ||
    traceScale === "stagnation_escape" ||
    action.type === "move_to_tile" ||
    action.type === "explore_unknown_neighbor" ||
    action.type === "logistical_probe" ||
    action.type === "resource_scout";
  const targetlessNow = escapeLike && targetRequired && targetTileId === undefined;
  const blockedNow = targetlessNow || (escapeLike && blockedReason !== undefined && targetTileId === undefined);
  const withTargetNow = escapeLike && targetTileId !== undefined;
  const latestBlockedReason = targetlessNow
    ? "target missing; escape was blocked instead of counted as a relocation"
    : blockedNow
      ? blockedReason
      : priorIntegrity?.latestBlockedReason ?? blockedReason;

  return {
    escapeResponsesWithTarget: previousWithTarget + (withTargetNow ? 1 : 0),
    escapeResponsesBlocked: previousBlocked + (blockedNow ? 1 : 0),
    targetlessAttempts: previousTargetless + (targetlessNow ? 1 : 0),
    repeatedTargetlessAttempts: previousRepeated + (targetlessNow && previousTargetless > 0 ? 1 : 0),
    latestBlockedReason,
  };
}

function deriveEstablishmentScopeState(
  world: WorldState,
  band: Band,
  prior: CampMovementState | undefined,
  advanceContext: RangeRotationAdvanceContext | undefined,
): EstablishmentScopeState {
  const current = getTile(world, band.position);
  const currentCluster = current === undefined ? `cluster:unknown:${String(band.position)}` : localClusterId(current);
  const previousTileId = advanceContext?.input.previousBand.position;
  const previous = previousTileId === undefined ? undefined : getTile(world, previousTileId);
  const previousCluster = previous === undefined ? prior?.currentEstablishment?.localClusterId : localClusterId(previous);
  const moved = advanceContext?.input.moved === true;
  const traceScale = advanceContext?.decisionTrace?.scale;
  const sameClusterShift = moved && previousCluster !== undefined && previousCluster === currentCluster;
  const newClusterMove = moved && previousCluster !== undefined && previousCluster !== currentCluster;
  const carriedOver = sameClusterShift && (advanceContext?.moveDistance ?? 99) <= 2;
  const scope =
    !moved
      ? "continued_place"
      : carriedOver && traceScale === "pressure_relief_move"
        ? "pressure_relief_shift"
        : carriedOver
          ? "same_cluster_shift"
          : (advanceContext?.moveDistance ?? 0) > 2
            ? "outward_relocation"
            : "new_cluster_establishment";

  return {
    currentLocalClusterId: currentCluster,
    previousLocalClusterId: previousCluster,
    scope,
    sameClusterShift,
    newClusterMove,
    carriedOver,
    carryOverAmount: carriedOver ? 0.58 : 0,
    resetReason: moved && !carriedOver
      ? previousCluster === undefined
        ? "previous cluster unknown"
        : "new local cluster"
      : undefined,
  };
}

function reliefBlockedReason(
  rawCandidates: readonly PressureReliefCandidate[],
  signals: CampMovementSignals,
  localOrbitTrap: LocalOrbitTrapState,
): string | undefined {
  if (signals.stagnationFlags.length === 0 && !localOrbitTrap.detected) {
    return undefined;
  }
  if (rawCandidates.length === 0) {
    return "no known or inferred relief place inside the bounded familiar radius";
  }
  const blocked = rawCandidates.find((candidate) => candidate.blockedReason !== undefined);
  return blocked?.blockedReason ?? "current camp remains the least-bad known option";
}

function pressureReliefEvidence(
  band: Band,
  tileId: TileId,
  label: string,
  confidence: number,
): CampMovementEvidenceRef {
  return {
    sourceSystem: "pressure",
    label: `pressure relief candidate: ${label}`,
    sourceId: `pressure-relief:${String(band.id)}:${String(tileId)}`,
    confidence: round2(confidence),
    tileId,
    reasonIds: band.pressureState?.sourceReasonIds.slice(0, 2) ?? [],
  };
}

function getTilesWithinReliefRadius(
  world: WorldState,
  current: Tile,
  radius: number,
): readonly ReliefRadiusEntry[] {
  let cachedByOrigin = reliefRadiusEntriesByTiles.get(world.tiles);

  if (cachedByOrigin === undefined) {
    cachedByOrigin = new Map<string, readonly ReliefRadiusEntry[]>();
    reliefRadiusEntriesByTiles.set(world.tiles, cachedByOrigin);
  }

  const cacheKey = `${String(current.id)}:${radius}`;
  const cached = cachedByOrigin.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const visited = new Set<TileId>([current.id]);
  const queue: ReliefRadiusEntry[] = [{ tile: current, distance: 0 }];
  const result: ReliefRadiusEntry[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    if (entry.distance >= radius) {
      continue;
    }
    for (const neighborId of getSortedTileNeighborIds(entry.tile)) {
      if (visited.has(neighborId)) {
        continue;
      }
      const tile = getTile(world, neighborId);
      if (tile === undefined) {
        continue;
      }
      visited.add(neighborId);
      const next = { tile, distance: entry.distance + 1 };
      queue.push(next);
      result.push(next);
    }
  }

  const sorted = result.sort((left, right) => left.distance - right.distance || compareTileIds(left.tile.id, right.tile.id));
  cachedByOrigin.set(cacheKey, sorted);
  return sorted;
}

function getSortedTileNeighborIds(tile: Tile): readonly TileId[] {
  const cached = sortedNeighborIdsByTile.get(tile);

  if (cached !== undefined) {
    return cached;
  }

  const sorted = [...tile.neighbors].sort(compareTileIds);
  sortedNeighborIdsByTile.set(tile, sorted);
  return sorted;
}

function supportAdequacy(tile: Tile, record: { readonly observedRichness: number; readonly observedAquaticPotential: number; readonly confidence: number } | undefined): number {
  // A missing memory is unknown, not permission to read habitat truth.  The
  // tile parameter remains for the common scoring signature but support comes
  // exclusively from this band's observation record.
  void tile;
  const richness = record?.observedRichness ?? 0;
  const aquatic = record?.observedAquaticPotential ?? 0;
  const confidence = record?.confidence ?? 0;
  return clamp01(richness * 0.58 + aquatic * 0.18 + confidence * 0.12);
}

function waterRefugeAdequacy(tile: Tile, record: { readonly observedWaterAccess?: number; readonly confidence: number } | undefined): number {
  const water = record?.observedWaterAccess ?? 0;
  const observedLandWaterBonus = record === undefined
    ? 0
    : tile.isRiverbank || tile.isFloodplain || tile.isMarshChannel || tile.terrainKind === "wetlands" ? 0.08 : 0;
  return clamp01(water * 0.86 + observedLandWaterBonus + (record?.confidence ?? 0) * 0.04);
}

function nonFoodCampPressure(band: Band, signals: CampMovementSignals): number {
  const pressure = band.pressureState;
  return clamp01(
    (pressure?.logisticsSicknessActivityPenalty ?? 0) * 0.2 +
      (pressure?.logisticsCampCleanlinessMoveAwayBias ?? 0) * 0.2 +
      (pressure?.logisticsMaterialWearPenalty ?? 0) * 0.16 +
      (pressure?.logisticsCareTravelBurdenBias ?? 0) * 0.12 +
      (pressure?.logisticsCarryConstraintBias ?? 0) * 0.12 +
      (pressure?.fatiguePressure ?? 0) * 0.12 +
      (pressure?.riskPressure ?? 0) * 0.08 +
      (pressure?.crowdingPenalty ?? 0) * 0.1 +
      signals.movePressure * 0.08,
  );
}

function localClusterId(tile: Tile): string {
  const river = tile.riverSegmentId ?? (tile.isRiverbank || tile.isFloodplain || tile.isMarshChannel ? "river-edge" : tile.terrainKind);
  return `cluster:${String(river)}:${Math.floor(tile.coord.x / 3)}:${Math.floor(tile.coord.y / 3)}`;
}

function localRangeId(tile: Tile): string {
  const water = tile.riverSegmentId ?? (tile.isCoastal ? "coast" : tile.terrainKind);
  return `range:${String(water)}:${Math.floor(tile.coord.x / 6)}:${Math.floor(tile.coord.y / 6)}`;
}

function isSameRiverCountry(current: Tile, candidate: Tile): boolean {
  return (
    (current.riverSegmentId !== undefined && current.riverSegmentId === candidate.riverSegmentId) ||
    (
      (current.isRiverbank || current.isFloodplain || current.isMarshChannel || current.terrainKind === "wetlands") &&
      (candidate.isRiverbank || candidate.isFloodplain || candidate.isMarshChannel || candidate.terrainKind === "wetlands")
    )
  );
}

function comparePressureReliefCandidatesForChoice(left: PressureReliefCandidate, right: PressureReliefCandidate): number {
  return reliefChoiceScore(right, {
    detected: false,
    currentLocalClusterId: "",
    recentMicroShiftCount: 0,
    recentDistinctTileCount: 0,
    sameClusterLoop: false,
    pressure: 0,
    escalation: "none",
    basis: [],
  }) - reliefChoiceScore(left, {
    detected: false,
    currentLocalClusterId: "",
    recentMicroShiftCount: 0,
    recentDistinctTileCount: 0,
    sameClusterLoop: false,
    pressure: 0,
    escalation: "none",
    basis: [],
  }) || compareTileIds(left.tileId, right.tileId);
}

function comparePressureReliefCandidatesForDisplay(left: PressureReliefCandidate, right: PressureReliefCandidate): number {
  const statusRank = (status: PressureReliefCandidate["status"]): number => {
    switch (status) {
      case "chosen": return 0;
      case "good_enough": return 1;
      case "scout_probe": return 2;
      case "rejected": return 3;
      case "blocked": return 4;
    }
  };
  return statusRank(left.status) - statusRank(right.status) ||
    right.pressureReliefScore - left.pressureReliefScore ||
    compareTileIds(left.tileId, right.tileId);
}

function chooseLocalShiftTarget(
  world: WorldState,
  band: Band,
  prior: CampMovementState | undefined,
): LocalTarget | undefined {
  const current = getTile(world, band.position);
  if (current === undefined) {
    return undefined;
  }
  const blockedBacktrack = prior?.oscillationGuard.lastBlockedPair;
  const candidates = current.neighbors
    .flatMap((neighborId) => {
      const neighbor = getTile(world, neighborId);
      if (neighbor === undefined) {
        return [];
      }
      return [neighbor, ...neighbor.neighbors.map((id) => getTile(world, id)).filter((tile): tile is Tile => tile !== undefined)];
    })
    .filter((tile, index, all) =>
      tile.id !== current.id &&
      all.findIndex((other) => other.id === tile.id) === index &&
      band.knowledge.observedTiles[tile.id] !== undefined &&
      isPlausibleCampTile(tile) &&
      tileDistanceByCoord(current, tile) <= 2 &&
      !(blockedBacktrack !== undefined && blockedBacktrack[0] === band.position && blockedBacktrack[1] === tile.id))
    .map((tile) => scoreLocalShiftTile(band, current, tile))
    .filter((entry): entry is LocalTarget => entry !== undefined)
    .sort((left, right) => right.score - left.score || String(left.tileId).localeCompare(String(right.tileId)));

  return candidates[0];
}

function scoreLocalShiftTile(band: Band, current: Tile, tile: Tile): LocalTarget | undefined {
  const record = band.knowledge.observedTiles[tile.id];
  if (record === undefined) {
    return undefined;
  }
  const currentRecord = band.knowledge.observedTiles[current.id];
  const currentUse = localUsePressure(band, current.id);
  const targetUse = localUsePressure(band, tile.id);
  const foodGain = record.observedRichness - (currentRecord?.observedRichness ?? 0);
  const waterGain = (record.observedWaterAccess ?? 0) - (currentRecord?.observedWaterAccess ?? 0);
  const pressureRelief = currentUse - targetUse;
  const placeMemory = band.placeMemory[tile.id];
  const score = clamp01(foodGain * 0.32 + waterGain * 0.34 + pressureRelief * 0.28 + (placeMemory?.confidence ?? 0) * 0.1);
  if (score < 0.08) {
    return undefined;
  }
  const basis = [
    foodGain > 0.04 ? "nearby food evidence is better" : undefined,
    waterGain > 0.04 ? "nearby water evidence is better" : undefined,
    pressureRelief > 0.04 ? "nearby use pressure is lower" : undefined,
    placeMemory !== undefined ? "place memory exists" : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  return { tileId: tile.id, score: round2(score), basis: basis.length === 0 ? ["nearby known camp option"] : basis.slice(0, 3) };
}

function deriveSignals(band: Band): CampMovementSignals {
  const pressureState = band.pressureState;
  const currentUsePressure = localUsePressure(band, band.position);
  const collapsePressure = clamp01(Math.max(
    getCanonicalFoodStress(band),
    pressureState?.waterStress ?? 0,
    pressureState?.riskPressure ?? 0,
    band.viability?.viabilityPressure ?? 0,
    band.demography.foodPerPersonStress,
  ));
  const movePressure = pressureState?.netMovePressure ?? pressureState?.mobilityPressure ?? 0;
  const oldCampPull = clamp01((band.placeMemory[band.position]?.attachment ?? 0) * 0.42 + (band.placeMemory[band.position]?.confidence ?? 0) * 0.28 + (band.consecutiveSeasonsOnTile / 10) * 0.3);
  const localFamiliarity = clamp01((band.placeMemory[band.position]?.visitCount ?? 0) / 8 + band.consecutiveSeasonsOnTile * 0.08);
  const localProblemPressure = clamp01(collapsePressure * 0.48 + currentUsePressure * 0.3 + movePressure * 0.22);
  const flags = [
    collapsePressure > 0.38 && band.consecutiveSeasonsOnTile >= 2 ? "decline while holding camp" : undefined,
    currentUsePressure > 0.28 ? "local use pressure is high" : undefined,
    movePressure > 0.34 && oldCampPull > 0.36 ? "old camp pull competes with move pressure" : undefined,
    band.parentBandId !== undefined && band.consecutiveSeasonsOnTile >= 2 && movePressure > 0.24 ? "daughter still testing new country" : undefined,
    band.viability?.extinctionRisk !== undefined && band.viability.extinctionRisk > 0.18 ? "collapse risk is visible" : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  return {
    collapsePressure,
    currentUsePressure,
    movePressure,
    localProblemPressure,
    oldCampPull,
    localFamiliarity,
    laborThin: band.demography.workingAdults <= Math.max(2, Math.ceil(band.demography.population * 0.22)),
    stagnationFlags: flags.slice(0, 5),
  };
}

function advanceEstablishment(
  input: CampMovementAdvanceInput,
  prior: NewPlaceEstablishmentState | undefined,
  signals: CampMovementSignals,
  moveDistance: number,
): NewPlaceEstablishmentState {
  const samePlace = prior !== undefined && prior.tileId === input.nextPosition && !input.moved;
  const previousTile = getTile(input.world, input.previousBand.position);
  const nextTile = getTile(input.world, input.nextPosition);
  const nextClusterId = nextTile === undefined ? `cluster:unknown:${String(input.nextPosition)}` : localClusterId(nextTile);
  const previousClusterId = previousTile === undefined ? prior?.localClusterId : localClusterId(previousTile);
  const sameClusterShift =
    input.moved &&
    prior !== undefined &&
    previousClusterId !== undefined &&
    previousClusterId === nextClusterId &&
    moveDistance <= 2;
  const carriedOver = samePlace || sameClusterShift;
  const startedTick = carriedOver ? prior?.startedTick ?? input.world.time.tick : input.world.time.tick;
  const ageTicks = carriedOver ? (prior?.ageTicks ?? 0) + 1 : Math.max(0, input.updatedBand.consecutiveSeasonsOnTile);
  const pressurePenalty = signals.localProblemPressure * 0.22;
  const scope: NewPlaceEstablishmentState["scope"] =
    !input.moved
      ? "continued_place"
      : sameClusterShift
        ? "same_cluster_shift"
        : moveDistance > 2
          ? "outward_relocation"
          : "new_cluster_establishment";
  const priorFamiliarity = sameClusterShift ? (prior?.localFamiliarity ?? 0) * 0.62 : samePlace ? prior?.localFamiliarity ?? 0 : signals.localFamiliarity;
  const familiarity = clamp01(priorFamiliarity + (input.moved ? 0.08 : 0.06));
  const recoveryNeed = clamp01(
    (samePlace
      ? (prior?.recoveryNeed ?? 0) * 0.72
      : sameClusterShift
        ? Math.min(0.52, (prior?.recoveryNeed ?? 0.18) * 0.58 + moveDistance * 0.08)
        : Math.min(0.68, moveDistance * 0.12 + (input.crossingBlocked ? 0.18 : 0))) +
      (signals.collapsePressure > 0.55 ? 0.08 : 0),
  );
  const confidence = round2(clamp01(
    (samePlace
      ? prior?.confidence ?? 0.28
      : sameClusterShift
        ? Math.max(0.24, (prior?.confidence ?? 0.32) * 0.72)
        : 0.28) +
      familiarity * 0.16 +
      (input.moved ? 0.04 : 0.02) -
      pressurePenalty,
  ));
  const status: NewPlaceEstablishmentState["status"] =
    confidence >= 0.68 && ageTicks >= 3
      ? "established"
      : confidence >= 0.48
        ? "holding"
        : signals.localProblemPressure > 0.5
          ? "failing"
          : ageTicks <= 1
            ? "new"
            : "testing";
  const evidenceRefs = capEvidence([
    movementEvidence(input, input.nextPosition, input.moved ? "arrival starts a new-place test" : "continued camp use builds local familiarity", confidence),
    pressureEvidence(input.updatedBand, signals.localProblemPressure),
    demographyEvidence(input.updatedBand),
  ]);
  return {
    id: `camp-establishment:${String(input.updatedBand.id)}:${String(input.nextPosition)}:${Number(startedTick)}`,
    tileId: input.nextPosition,
    localClusterId: nextClusterId,
    startedTick,
    ageTicks,
    confidence,
    status,
    scope,
    sameClusterShift,
    establishmentCarriedOver: sameClusterShift,
    carryOverFromTileId: sameClusterShift ? input.previousBand.position : undefined,
    resetReason: input.moved && !sameClusterShift ? "new local cluster" : undefined,
    knownBasis: [
      sameClusterShift ? "same local camp cluster" : input.moved ? "recent residential move" : "continued local use",
      sameClusterShift ? "local familiarity carried over partly" : undefined,
      input.updatedBand.parentBandId === undefined ? "lived place evidence" : "daughter building local evidence",
      recoveryNeed > 0.2 ? "recovery need still present" : "recovery need low",
    ].filter((entry): entry is string => entry !== undefined).slice(0, 4),
    recoveryNeed: round2(recoveryNeed),
    oldCampPull: round2(signals.oldCampPull),
    localFamiliarity: round2(familiarity),
    localProblemPressure: round2(signals.localProblemPressure),
    retreatRisk: round2(clamp01(signals.oldCampPull * 0.4 + signals.localProblemPressure * 0.34 - confidence * 0.18)),
    commitHoldTendency: round2(clamp01(confidence * 0.52 + familiarity * 0.34 - recoveryNeed * 0.18)),
    blockedReasons: [
      signals.laborThin ? "adult labor is thin" : undefined,
      signals.currentUsePressure > 0.35 ? "local use pressure remains high" : undefined,
      input.destinationBlocked ? "destination was blocked" : undefined,
      input.crossingBlocked ? "crossing blocked the move" : undefined,
    ].filter((entry): entry is string => entry !== undefined).slice(0, 4),
    evidenceRefs,
    noSettlement: true,
  };
}

function makeLocalShiftRecord(
  input: CampMovementAdvanceInput,
  distance: number,
  trace: CampMovementDecisionTrace | undefined,
): LocalCampShiftRecord {
  const outcome: EstablishmentOutcome = input.destinationBlocked || input.crossingBlocked
    ? "failed"
    : input.updatedBand.pressureState?.netMovePressure !== undefined && input.updatedBand.pressureState.netMovePressure < 0.28
      ? "strengthened"
      : "still_testing";
  return {
    id: `camp-shift:${String(input.updatedBand.id)}:${Number(input.world.time.tick)}:${String(input.previousBand.position)}:${String(input.nextPosition)}`,
    tick: input.world.time.tick,
    fromTileId: input.previousBand.position,
    toTileId: input.nextPosition,
    distance,
    reason: trace?.scale === "pressure_relief_move"
      ? trace.basis[0] ?? "pressure relief shift to a less worn nearby place"
      : trace?.basis[0] ?? "nearby camp shift attempted with existing movement",
    outcome,
    confidence: round2(outcome === "failed" ? 0.22 : 0.46 + Math.min(0.22, distance * 0.04)),
    evidenceRefs: capEvidence([
      movementEvidence(input, input.nextPosition, "nearby residential base moved", 0.62),
      adaptiveEvidence(input),
    ]),
    noSettlement: true,
  };
}

function makeTemporaryCampRecord(
  input: CampMovementAdvanceInput,
  trace: CampMovementDecisionTrace | undefined,
): TemporaryTaskCampRecord {
  const targetTileId = actionTargetTileId(input.decision.action) ?? input.updatedBand.position;
  const purpose = temporaryPurposeForAction(input.decision.action);
  return {
    id: `temporary-task-camp:${String(input.updatedBand.id)}:${Number(input.world.time.tick)}:${String(targetTileId)}`,
    tick: input.world.time.tick,
    originTileId: input.updatedBand.position,
    targetTileId,
    purpose,
    status: input.destinationBlocked || input.crossingBlocked ? "failed" : "active",
    confidence: round2(input.destinationBlocked || input.crossingBlocked ? 0.2 : 0.44),
    expiresAfterTick: (input.world.time.tick + 3) as TickNumber,
    evidenceRefs: capEvidence([
      movementEvidence(input, targetTileId, "residence held while a task camp or probe was tested", 0.54),
      adaptiveEvidence(input),
    ]),
    noSettlement: true,
    noInventory: true,
  };
}

function maybeOldCampDecay(
  input: CampMovementAdvanceInput,
  prior: CampMovementState | undefined,
  signals: CampMovementSignals,
): readonly OldCampAnchorDecayRecord[] {
  const shouldDecay =
    signals.stagnationFlags.length > 0 &&
    (input.moved || input.decision.action.type === "logistical_probe" || input.decision.action.type === "resource_scout" || signals.currentUsePressure > 0.34);
  if (!shouldDecay) {
    return [];
  }
  const tileId = input.previousBand.position;
  const before = prior?.oldCampPullScore ?? signals.oldCampPull;
  const decay = round2(Math.min(0.1, 0.03 + signals.localProblemPressure * 0.08));
  const after = round2(Math.max(0.12, before - decay));
  return [{
    id: `old-camp-decay:${String(input.updatedBand.id)}:${Number(input.world.time.tick)}:${String(tileId)}`,
    tick: input.world.time.tick,
    tileId,
    pullBefore: round2(before),
    pullAfter: after,
    decayAmount: decay,
    reason: input.moved ? "camp pull weakened after a shift away from pressure" : "camp pull weakened by repeated pressure",
    canRecover: true,
  }];
}

function maybeStagnationEscape(
  input: CampMovementAdvanceInput,
  signals: CampMovementSignals,
  trace: CampMovementDecisionTrace | undefined,
  localShift: LocalCampShiftRecord | undefined,
  temporaryCamp: TemporaryTaskCampRecord | undefined,
  rangeRotation: RangeRotationPressureReliefState,
): StagnationEscapeRecord | undefined {
  if (signals.stagnationFlags.length === 0) {
    return undefined;
  }
  const targetTileId = actionTargetTileId(input.decision.action);
  const targetedEscape = isTargetedEscapeAction(input.decision.action.type);
  const response = localShift !== undefined
    ? trace?.scale === "pressure_relief_move" ? "pressure_relief_move" : "minor_camp_shift"
    : temporaryCamp !== undefined
      ? "temporary_task_camp"
      : trace?.scale === "relief_scout_probe"
        ? "scout_probe"
        : input.decision.action.type === "stay" && trace?.scale === "hard_move_recovery"
          ? "recovery_hold"
          : (input.decision.action.type === "move_to_tile" || input.decision.action.type === "explore_unknown_neighbor") && targetTileId !== undefined
            ? "risky_relocation"
            : (input.decision.action.type === "logistical_probe" || input.decision.action.type === "resource_scout") && targetTileId !== undefined
            ? "scout_probe"
            : "no_viable_response";
  const blockedReasons = [
    input.crossingBlocked ? "crossing blocked the response" : undefined,
    input.destinationBlocked ? "destination was blocked" : undefined,
    signals.laborThin ? "adult labor was thin" : undefined,
    targetedEscape && targetTileId === undefined ? "target missing; escape blocked instead of attempted" : undefined,
    response === "no_viable_response" ? rangeRotation.blockedReason ?? "no known relief target was selected" : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  const status: StagnationEscapeRecord["status"] =
    blockedReasons.length > 0 || response === "no_viable_response"
      ? "blocked"
      : input.moved || temporaryCamp !== undefined || response === "scout_probe" || response === "pressure_relief_move"
        ? "trying"
        : response === "recovery_hold"
          ? "helped"
          : "failed";
  const fallbackReason = response === "risky_relocation" && targetTileId !== undefined
    ? "stagnation pressure selected a concrete relocation target"
    : rangeRotation.blockedReason ?? signals.stagnationFlags[0] ?? "stagnation response";
  return {
    id: `stagnation-escape:${String(input.updatedBand.id)}:${Number(input.world.time.tick)}:${response}`,
    tick: input.world.time.tick,
    status,
    response,
    actionType: input.decision.action.type,
    targetTileId,
    reason: trace?.basis[0] ?? fallbackReason,
    blockedReasons,
    evidenceRefs: capEvidence([
      pressureEvidence(input.updatedBand, signals.localProblemPressure),
      movementEvidence(input, targetTileId ?? input.updatedBand.position, blockedReasons.length === 0 ? "stagnation escape response was selected" : "stagnation escape was blocked with an explicit reason", 0.58),
      adaptiveEvidence(input),
    ]),
  };
}

function updateOscillationGuard(
  input: CampMovementAdvanceInput,
  prior: CampMovementState | undefined,
  localShift: LocalCampShiftRecord | undefined,
): CampMovementState["oscillationGuard"] {
  const previous = prior?.recentLocalShifts[0];
  const backtrack = localShift !== undefined &&
    previous !== undefined &&
    previous.fromTileId === localShift.toTileId &&
    previous.toTileId === localShift.fromTileId &&
    Number(input.world.time.tick) - Number(previous.tick) <= 2;
  return {
    recentBacktrackCount: backtrack ? (prior?.oscillationGuard.recentBacktrackCount ?? 0) + 1 : 0,
    blockedOscillationCount: (prior?.oscillationGuard.blockedOscillationCount ?? 0) + (backtrack ? 1 : 0),
    lastBlockedPair: backtrack ? [localShift.toTileId, localShift.fromTileId] : prior?.oscillationGuard.lastBlockedPair,
  };
}

function derivePassiveCollapseAudit(
  band: Band,
  tick: TickNumber,
  signals: CampMovementSignals,
  escapes: readonly StagnationEscapeRecord[],
): CampMovementState["passiveCollapseAudit"] {
  const collapsePressure = Math.max(signals.collapsePressure, band.viability?.extinctionRisk ?? 0);
  if (collapsePressure < 0.48) {
    return {
      bandId: band.id,
      tick,
      status: "not_under_collapse_pressure",
      collapsePressure: round2(collapsePressure),
      recentEscapeCount: escapes.length,
      blockedReasons: [],
    };
  }
  const recent = escapes.filter((escape) => Number(tick) - Number(escape.tick) <= 8);
  const blockedReasons = recent.flatMap((escape) => escape.blockedReasons);
  return {
    bandId: band.id,
    tick,
    status: recent.length > 0
      ? "attempted_escape"
      : blockedReasons.length > 0
        ? "blocked_escape"
        : signals.laborThin
          ? "blocked_escape"
          : "suspicious_passive",
    collapsePressure: round2(collapsePressure),
    recentEscapeCount: recent.length,
    blockedReasons: (blockedReasons.length === 0 && signals.laborThin ? ["adult labor too thin"] : blockedReasons).slice(0, 5),
    lastEscapeId: recent[0]?.id,
  };
}

function deriveStatus(
  signals: CampMovementSignals,
  establishment: NewPlaceEstablishmentState,
  shift: LocalCampShiftRecord | undefined,
  temporaryCamp: TemporaryTaskCampRecord | undefined,
  passive: CampMovementState["passiveCollapseAudit"],
): CampMovementStatus {
  if (shift !== undefined) return "shifting";
  if (temporaryCamp !== undefined) return "probing";
  if (establishment.recoveryNeed > 0.22) return "recovering";
  if (passive?.status === "suspicious_passive" || signals.stagnationFlags.length > 0) return "stagnant";
  if (establishment.status === "established" || establishment.status === "holding") return "established";
  if (establishment.status === "failing") return "unstable";
  return "establishing";
}

function buildDecisionTrace(decision: Decision): CampMovementDecisionTrace | undefined {
  const reason = decision.secondaryReasons.find((entry) => entry.type === "camp_movement_response_selected");
  if (reason === undefined || reason.type !== "camp_movement_response_selected") {
    return {
      decisionId: decision.id,
      actionType: decision.action.type,
      scale: "new_place_establishment",
      targetTileId: actionTargetTileId(decision.action),
      scoreDelta: 0,
      basis: [],
    };
  }
  return {
    decisionId: decision.id,
    actionType: decision.action.type,
    scale: reason.scale as CampMovementScale,
    targetTileId: reason.targetTileId,
    scoreDelta: round2(reason.scoreDelta),
    reasonId: reason.id,
    basis: reason.basis.slice(0, 4),
  };
}

function makeSyntheticStayDecision(world: WorldState, band: Band): Decision {
  return {
    id: `decision:${String(band.id)}:${Number(world.time.tick)}:camp-movement-profile` as DecisionId,
    bandId: band.id,
    time: world.time,
    action: { type: "stay", tileId: band.position },
    primaryReason: {
      id: `reason:${String(band.id)}:${Number(world.time.tick)}:camp-movement-profile` as ReasonId,
      type: "low_mobility_pressure",
      strength: 0,
      confidence: 0,
      relatedTileIds: [band.position],
      relatedEventIds: [],
      currentTileId: band.position,
      pressure: 0,
    },
    secondaryReasons: [],
    alternativesConsidered: [],
    coreDeliberationBreadth: 0,
    contextSnapshot: {
      time: world.time,
      currentTileId: band.position,
      populationEstimate: band.demography.population,
      hungerPressure: getCanonicalFoodStress(band),
      territorialPressure: band.territorialPressure,
      knownTileCount: Object.keys(band.knowledge.observedTiles).length,
      knownSettlementCount: 0,
    },
    intentStatus: "had_no_intent",
  };
}

function temporaryPurposeForAction(action: Action): TemporaryCampPurpose {
  if (action.type === "resource_scout") {
    return action.scoutKind === "water_refuge" ? "refuge_check" : action.scoutKind === "aquatic_patch" ? "water_edge_work" : "food_work";
  }
  return "scout_probe";
}

function campMovementOverviewTitle(state: CampMovementState): string {
  switch (state.status) {
    case "established": return "Camp is holding for now";
    case "recovering": return "Recovering after movement";
    case "shifting": return "Trying a nearby camp shift";
    case "probing": return "Testing a temporary camp or probe";
    case "stagnant": return "Stagnation pressure is visible";
    case "unstable": return "This place is not holding well";
    case "establishing":
    default: return "New-place establishment is still forming";
  }
}

function campMovementOverviewLines(state: CampMovementState): readonly string[] {
  const establishment = state.currentEstablishment;
  return [
    establishment === undefined
      ? "No establishment marker is available yet."
      : `Establishment at the current place is ${establishment.status.replace(/_/g, " ")} with ${Math.round(establishment.confidence * 100)}% confidence.`,
    state.oldCampDecay.length === 0
      ? "Old camp pull has not visibly decayed."
      : "Old camp pull is weakening gradually from recent pressure; it can recover if later evidence supports it.",
    state.stagnationFlags.length === 0
      ? "No stagnation flag is prominent."
      : `Stagnation evidence: ${state.stagnationFlags.slice(0, 2).join("; ")}.`,
  ];
}

function movementEvidence(
  input: CampMovementAdvanceInput,
  tileId: TileId,
  label: string,
  confidence: number,
): CampMovementEvidenceRef {
  return {
    sourceSystem: "movement",
    label,
    sourceId: String(input.decision.id),
    confidence: round2(confidence),
    tileId,
    eventId: `camp-movement-event:${String(input.updatedBand.id)}:${Number(input.world.time.tick)}:${stableKey(label)}`,
    reasonIds: [input.decision.primaryReason.id, ...input.decision.secondaryReasons.map((reason) => reason.id)].slice(0, 3),
  };
}

function adaptiveEvidence(input: CampMovementAdvanceInput): CampMovementEvidenceRef | undefined {
  const trace = input.updatedBand.adaptiveHuman?.latestDecisionTrace;
  if (trace === undefined || trace.scoreDelta <= 0) {
    return undefined;
  }
  return {
    sourceSystem: "adaptive_human",
    label: "adaptive response shaped movement",
    sourceId: trace.responseId ?? trace.selectedIdeaId ?? String(input.decision.id),
    confidence: round2(Math.min(0.82, 0.4 + trace.scoreDelta)),
    tileId: trace.actionType === "stay" ? input.updatedBand.position : actionTargetTileId(input.decision.action),
    reasonIds: trace.reasonId === undefined ? [] : [trace.reasonId],
  };
}

function pressureEvidence(band: Band, pressure: number): CampMovementEvidenceRef {
  return {
    sourceSystem: "pressure",
    label: "camp pressure shaped movement",
    sourceId: `pressure:${String(band.id)}`,
    confidence: round2(pressure),
    tileId: band.position,
    reasonIds: band.pressureState?.sourceReasonIds.slice(0, 3) ?? [],
  };
}

function demographyEvidence(band: Band): CampMovementEvidenceRef {
  return {
    sourceSystem: "demography",
    label: "labor and dependents shape camp movement",
    sourceId: `demography:${String(band.id)}`,
    confidence: round2(clamp01(1 - band.demography.workingAdults / Math.max(1, band.demography.population))),
    tileId: band.position,
    reasonIds: band.demography.lastPopulationChangeReasonIds.slice(0, 3),
  };
}

function capEvidence(items: readonly (CampMovementEvidenceRef | undefined)[]): readonly CampMovementEvidenceRef[] {
  const seen = new Set<string>();
  const result: CampMovementEvidenceRef[] = [];
  for (const item of items) {
    if (item === undefined) {
      continue;
    }
    const key = `${item.sourceSystem}:${item.sourceId}:${item.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...item, reasonIds: item.reasonIds.slice(0, 2) });
    if (result.length >= EVIDENCE_PER_ITEM_CAP) {
      break;
    }
  }
  return result;
}

function capLocalShifts(items: readonly LocalCampShiftRecord[]): readonly LocalCampShiftRecord[] {
  return uniqueById(items).slice(0, LOCAL_SHIFT_CAP);
}

function capTemporaryCamps(items: readonly TemporaryTaskCampRecord[]): readonly TemporaryTaskCampRecord[] {
  return uniqueById(items).slice(0, TEMPORARY_CAMP_CAP);
}

function capOldCampDecay(items: readonly OldCampAnchorDecayRecord[]): readonly OldCampAnchorDecayRecord[] {
  return uniqueById(items).slice(0, OLD_CAMP_DECAY_CAP);
}

function capEscapes(items: readonly StagnationEscapeRecord[]): readonly StagnationEscapeRecord[] {
  return uniqueById(items).slice(0, STAGNATION_ESCAPE_CAP);
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function compareInfluences(left: CampMovementInfluence, right: CampMovementInfluence): number {
  return right.scoreDelta - left.scoreDelta || left.scale.localeCompare(right.scale) || String(left.targetTileId ?? "").localeCompare(String(right.targetTileId ?? ""));
}

function isPlausibleCampTile(tile: Tile): boolean {
  return tile.terrainKind !== "lake" && tile.terrainKind !== "mountains";
}

function localUsePressure(band: Band, tileId: TileId): number {
  const pressure = band.usePressure[tileId];
  return pressure === undefined
    ? 0
    : clamp01(Math.max(
        pressure.recentUseIntensity,
        pressure.foragingPressure,
        pressure.aquaticPressure,
        pressure.waterPressure,
      ));
}

function actionTargetTileId(action: Action): TileId | undefined {
  switch (action.type) {
    case "stay": return action.tileId;
    case "move_to_tile": return action.targetTileId;
    case "explore_unknown_neighbor": return action.targetTileId;
    case "logistical_probe": return action.targetTileId;
    case "resource_scout": return action.targetTileId;
    case "create_temporary_camp": return action.tileId;
    case "create_seasonal_camp": return action.tileId;
    case "intensify_place_use": return action.tileId;
    case "experiment_with_storage": return action.tileId;
    case "experiment_with_plant_tending": return action.tileId;
    case "start_persistent_settlement": return action.tileId;
    case "send_seasonal_outpost": return action.targetTileId;
    case "abandon_expansion_plan": return action.targetTileId;
    case "add_tile_to_route": return action.tileId;
    case "found_daughter_settlement": return action.targetTileId;
    case "claim_influence": return action.targetTileIds[0];
    case "avoid_state_integration": return action.targetTileId;
    default: return undefined;
  }
}

function isTargetedEscapeAction(actionType: Action["type"]): boolean {
  return (
    actionType === "move_to_tile" ||
    actionType === "explore_unknown_neighbor" ||
    actionType === "logistical_probe" ||
    actionType === "resource_scout"
  );
}

function compareTileIds(left: TileId, right: TileId): number {
  return String(left).localeCompare(String(right));
}

function tileDistance(world: WorldState, firstId: TileId, secondId: TileId): number {
  const first = getTile(world, firstId);
  const second = getTile(world, secondId);
  return first === undefined || second === undefined ? 0 : tileDistanceByCoord(first, second);
}

function tileDistanceByCoord(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function uniqueCount(values: readonly string[]): number {
  return uniqueStrings(values).length;
}

function stableKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).toLowerCase();
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): NormalizedIntensity {
  return Math.round(value * 100) / 100;
}
