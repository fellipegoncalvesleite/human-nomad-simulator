import type { ReasonId, TickNumber, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import { enforceResourceKnowledgeCap } from "./resourceKnowledge";
import { deriveCareTreatmentRelief } from "./adaptationBoundary";
import type {
  AcuteRiskContext,
  AcuteRiskDurationClass,
  AcuteRiskEffect,
  AcuteRiskEpisode,
  AcuteRiskKind,
  AcuteRiskSeverity,
  AcuteRiskSourceCategory,
  AcuteRiskState,
  AcuteRiskTrace,
  Band,
  IntraSeasonTripRecord,
  PlaceMemoryRecord,
} from "./types";

const RECENT_EPISODE_CAP = 10;
const MAX_EPISODES_PER_BAND_SEASON = 2;
const RECENT_TRIP_SCAN_CAP = 8;
const ACTIVE_EFFECT_CAP: AcuteRiskEffect = {
  activityEfficiencyPenalty: 0.18,
  extraSeasonalStress: 0.14,
  mortalityRiskBump: 0.06,
  movementCautionBump: 0.18,
  knowledgeUpdateWeight: 0.5,
  recoverySeasons: 4,
};

interface AcuteRiskCandidate {
  readonly kind: AcuteRiskKind;
  readonly sourceCategory: AcuteRiskSourceCategory;
  readonly sourceTileId?: TileId;
  readonly sourceResourceId?: string;
  readonly sourceTraceId?: string;
  readonly sourceLabel: string;
  readonly score: number;
  readonly reliability: number;
  readonly confidence: number;
  readonly groundedReasons: readonly string[];
  readonly contributingFactors: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

export function applyAcuteRiskContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((nextBands, band) => {
      nextBands[String(band.id)] = applyAcuteRiskToBand(world, band);

      return nextBands;
    }, {});

  return {
    ...world,
    bands: bands as Readonly<Record<Band["id"], Band>>,
  };
}

export function applyAcuteRiskToBand(world: WorldState, band: Band): Band {
  if (
    band.status === "dispersed" ||
    band.viability?.status === "absorbed" ||
    band.viability?.status === "extinct"
  ) {
    return band;
  }

  if (band.acuteRisk?.lastUpdatedTick === world.time.tick) {
    return band;
  }

  const decayed = decayEpisodes(band.acuteRisk?.recentEpisodes ?? []);
  const candidates = deriveAcuteRiskCandidates(world, band)
    .filter((candidate) => isCandidateBandKnown(band, candidate))
    .sort(compareCandidates);
  const generated = selectEpisodes(world, band, candidates);
  const recentMerged = [...generated, ...decayed].sort(compareEpisodesNewestFirst);
  const recentEpisodes = recentMerged.slice(0, RECENT_EPISODE_CAP);
  const activeEffect = summarizeActiveEffect(recentEpisodes);
  const trace: AcuteRiskTrace = {
    bandId: band.id,
    tick: world.time.tick,
    consideredCandidateCount: candidates.length,
    generatedEpisodeCount: generated.length,
    maxEpisodesPerBandSeason: MAX_EPISODES_PER_BAND_SEASON,
    candidateSourceCategories: uniqueStrings(candidates.map((candidate) => candidate.sourceCategory)) as readonly AcuteRiskSourceCategory[],
    cappedBySeasonLimit: candidates.length > generated.length && generated.length >= MAX_EPISODES_PER_BAND_SEASON,
    usedBandKnownContextOnly: true,
    noFullMapScan: true,
    reasonIds: uniqueReasonIds(candidates.flatMap((candidate) => candidate.reasonIds)),
  };
  const state: AcuteRiskState = {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    latestEpisode: generated[0] ?? band.acuteRisk?.latestEpisode,
    recentEpisodes,
    activeEffect,
    trace,
    memoryCaps: {
      recentEpisodeCap: RECENT_EPISODE_CAP,
      maxEpisodesPerBandSeason: MAX_EPISODES_PER_BAND_SEASON,
    },
    droppedEpisodeCount:
      (band.acuteRisk?.droppedEpisodeCount ?? 0) + Math.max(0, recentMerged.length - RECENT_EPISODE_CAP),
    expiredEpisodeCount:
      (band.acuteRisk?.expiredEpisodeCount ?? 0) +
      (band.acuteRisk?.recentEpisodes ?? []).filter((episode) => episode.remainingRecoverySeasons <= 0).length,
    bounded: true,
    noFullMapScan: true,
    noIndividualPeople: true,
  };
  const withRisk: Band = {
    ...band,
    acuteRisk: state,
    pressureState: applyAcuteEffectToPressureState(band.pressureState, state),
  };

  return generated.length === 0
    ? withRisk
    : applyAcuteRiskMemoryUpdates(withRisk, generated, world.time.tick);
}

function applyAcuteEffectToPressureState(
  pressureState: Band["pressureState"],
  state: AcuteRiskState,
): Band["pressureState"] {
  if (pressureState === undefined) {
    return pressureState;
  }
  const effect = state.activeEffect;
  const acuteReasonIds = uniqueReasonIds(state.recentEpisodes.flatMap((episode) => episode.reasonIds));

  return {
    ...pressureState,
    foodStress: round2(clamp01(pressureState.foodStress + effect.extraSeasonalStress * 0.32)),
    waterStress: round2(clamp01(pressureState.waterStress + effect.extraSeasonalStress * 0.18)),
    fatiguePressure: round2(clamp01(pressureState.fatiguePressure + effect.activityEfficiencyPenalty * 0.62 + effect.extraSeasonalStress * 0.24)),
    riskPressure: round2(clamp01(pressureState.riskPressure + effect.movementCautionBump * 0.44 + effect.mortalityRiskBump * 0.7)),
    mobilityPressure: round2(clamp01(pressureState.mobilityPressure + effect.extraSeasonalStress * 0.14 + effect.movementCautionBump * 0.08)),
    netMovePressure: round2(clamp01(pressureState.netMovePressure + effect.extraSeasonalStress * 0.08 - effect.movementCautionBump * 0.12)),
    sourceReasonIds: uniqueReasonIds([
      ...pressureState.sourceReasonIds,
      ...acuteReasonIds,
      ...(effect.recoverySeasons > 0 ? [`reason:acute-risk:${String(state.bandId)}:${Number(state.lastUpdatedTick)}` as ReasonId] : []),
    ]).slice(-8),
  };
}

function deriveAcuteRiskCandidates(world: WorldState, band: Band): readonly AcuteRiskCandidate[] {
  const currentTile = world.tiles[band.position];
  const recentTrips = (band.recentIntraSeasonTrips ?? []).slice(0, RECENT_TRIP_SCAN_CAP);
  const latestTrip = recentTrips[0];
  const pressure = band.pressureState;
  const support = band.seasonalSupport;
  const currentSupport = support?.currentSeasonSupport;
  const foodStress = pressure?.foodStress ?? currentSupport?.foodStress ?? 0;
  const waterStress = pressure?.waterStress ?? currentSupport?.waterStress ?? 0;
  const fatiguePressure = pressure?.fatiguePressure ?? 0;
  const riskPressure = pressure?.riskPressure ?? currentTile?.riskProfile.depletionRisk ?? 0;
  const season = world.time.season;
  const candidates: AcuteRiskCandidate[] = [];

  const longTrip = recentTrips.find((trip) =>
    trip.outcome === "continues" ||
    trip.distanceTiles >= 3 ||
    trip.activityOutcome === "delayed_return" ||
    trip.activityOutcome === "abandoned_due_to_risk"
  );
  if (season === "winter" || support?.hungerClassification === "seasonal_lean_stress" || support?.hungerClassification === "chronic_plus_seasonal_stress") {
    const travelLoad = longTrip === undefined ? 0 : clamp01(longTrip.distanceTiles / 7 + longTrip.estimatedDurationDays / 10);
    const exposureScore = clamp01(
      (season === "winter" ? 0.26 : 0.08) +
        foodStress * 0.24 +
        waterStress * 0.08 +
        fatiguePressure * 0.18 +
        travelLoad * 0.32 +
        (currentTile?.movementCost ?? 1) * 0.04,
    );
    pushCandidate(candidates, {
      kind: "exposure_or_cold_snap",
      sourceCategory: longTrip === undefined ? "seasonal_stress" : "activity_trace",
      sourceTileId: longTrip?.targetTileId ?? band.position,
      sourceTraceId: tripTraceId(longTrip),
      sourceLabel: longTrip === undefined ? "lean-season camp context" : `${longTrip.taskGroupType} to ${String(longTrip.targetTileId)}`,
      score: exposureScore,
      reliability: longTrip === undefined ? 0.44 : 0.68,
      confidence: longTrip === undefined ? 0.42 : 0.74,
      groundedReasons: [
        season === "winter" ? "winter/lean-season exposure context" : "lean-season stress",
        longTrip === undefined ? "no long trip trace" : "recent long or delayed activity trip",
      ],
      contributingFactors: [`foodStress=${round2(foodStress)}`, `fatigue=${round2(fatiguePressure)}`, `travelLoad=${round2(travelLoad)}`],
      reasonIds: uniqueReasonIds([...(support?.reasonIds ?? []), ...(longTrip?.reasonIds ?? [])]),
    });
  }

  const contaminatedWaterWorks = band.practicalAdaptation?.waterWorks?.tileId === band.position &&
    band.practicalAdaptation.waterWorks.status === "contaminated_seep";
  if (contaminatedWaterWorks || season === "summer" || currentSupport?.mode === "dry" || (currentTile?.riskProfile.droughtRisk ?? 0) > 0.35) {
    const dryScore = clamp01(
      waterStress * 0.42 +
        (currentTile?.riskProfile.droughtRisk ?? 0) * 0.28 +
        fatiguePressure * 0.12 +
        ((currentSupport?.mode === "dry" || season === "summer") ? 0.12 : 0) +
        (latestTrip?.activityOutcome === "failed_due_to_water_risk" ? 0.2 : 0) +
        (contaminatedWaterWorks ? 0.34 : 0),
    );
    pushCandidate(candidates, {
      kind: contaminatedWaterWorks ? "bad_water_sickness" : dryScore >= 0.68 ? "heat_or_drought_exhaustion" : "bad_water_sickness",
      sourceCategory: latestTrip?.activityOutcome === "failed_due_to_water_risk" ? "activity_trace" : "water_context",
      sourceTileId: latestTrip?.targetTileId ?? band.position,
      sourceTraceId: tripTraceId(latestTrip),
      sourceLabel: contaminatedWaterWorks ? "foul dug seep at the current camp" : latestTrip?.activityOutcome === "failed_due_to_water_risk" ? "failed water-risk activity" : "current water/dry context",
      score: dryScore,
      reliability: latestTrip?.activityOutcome === "failed_due_to_water_risk" ? 0.72 : 0.5,
      confidence: latestTrip?.activityOutcome === "failed_due_to_water_risk" ? 0.76 : 0.52,
      groundedReasons: [
        currentSupport?.mode === "dry" ? "dry seasonal support mode" : "water stress context",
        latestTrip?.activityOutcome === "failed_due_to_water_risk" ? "recent water-risk failure" : "current known place water/drought proxy",
        ...(contaminatedWaterWorks ? ["the dug seep smelled or sickened people"] : []),
      ],
      contributingFactors: [`waterStress=${round2(waterStress)}`, `droughtRisk=${round2(currentTile?.riskProfile.droughtRisk ?? 0)}`],
      reasonIds: uniqueReasonIds([...(support?.reasonIds ?? []), ...(latestTrip?.reasonIds ?? [])]),
    });
  }

  for (const trip of recentTrips) {
    const plant = trip.plantPatchTrace;
    if (plant !== undefined) {
      const safety = plantSafetyRiskValue(plant.safetyRisk);
      const scarcity = clamp01(foodStress * 0.35 + plant.fallbackRank * 0.32 + plant.laborCost * 0.18);
      const score = clamp01(safety * 0.48 + scarcity + plant.pressure * 0.12 + (trip.activityOutcome.includes("failed") ? 0.16 : 0));
      pushCandidate(candidates, {
        kind: safety >= 0.5 ? "plant_poisoning_or_irritation" : "spoiled_or_risky_food_sickness",
        sourceCategory: "plant_patch",
        sourceTileId: trip.targetTileId,
        sourceResourceId: plant.patchId,
        sourceTraceId: tripTraceId(trip),
        sourceLabel: `${plant.plantClassId} patch ${plant.patchId}`,
        score,
        reliability: trip.activityOutcome.includes("failed") ? 0.72 : 0.58,
        confidence: plant.safetyRisk === "unknown" ? 0.46 : 0.68,
        groundedReasons: [
          `plant safety risk ${plant.safetyRisk}`,
          plant.fallbackRole === "important" || plant.fallbackRole === "emergency" ? "fallback-food pressure" : "plant gathering trace",
        ],
        contributingFactors: [`fallbackRank=${round2(plant.fallbackRank)}`, `laborCost=${round2(plant.laborCost)}`, `pressure=${round2(plant.pressure)}`],
        reasonIds: uniqueReasonIds([...trip.reasonIds, ...plant.reasonIds]),
      });
    }

    const aquatic = trip.aquaticActivityTrace;
    if (aquatic !== undefined) {
      const score = clamp01(
        aquatic.risk * 0.34 +
          aquatic.laborAccessCost * 0.22 +
          aquatic.pressure * 0.2 +
          aquatic.disturbance * 0.14 +
          (trip.activityOutcome.includes("failed") || trip.activityOutcome === "delayed_return" ? 0.18 : 0),
      );
      pushCandidate(candidates, {
        kind: aquatic.risk >= 0.48 || trip.activityOutcome === "delayed_return" ? "aquatic_accident" : "bad_water_sickness",
        sourceCategory: "aquatic_stock",
        sourceTileId: aquatic.anchorTileId,
        sourceResourceId: aquatic.stockId,
        sourceTraceId: tripTraceId(trip),
        sourceLabel: `${aquatic.aquaticKind} at ${String(aquatic.anchorTileId)}`,
        score,
        reliability: 0.7,
        confidence: 0.7,
        groundedReasons: ["recent aquatic activity trace", aquatic.pressure >= 0.45 ? "pressured water-edge resource" : "water-edge activity risk"],
        contributingFactors: [`risk=${round2(aquatic.risk)}`, `pressure=${round2(aquatic.pressure)}`, `access=${round2(aquatic.laborAccessCost)}`],
        reasonIds: uniqueReasonIds([...trip.reasonIds, ...aquatic.reasonIds]),
      });
    }

    if (
      trip.taskGroupType === "hunting_group" ||
      trip.taskGroupType === "local_foraging_group" ||
      trip.activityOutcome === "abandoned_due_to_risk"
    ) {
      const animalTrace = trip.animalActivityTrace;
      const animalRisk = Math.max(
        animalTrace?.dangerRisk ?? 0,
        ...(band.visibleNature?.faunaCards ?? []).map((card) => card.risk),
      );
      const foragingScore = clamp01(
        riskPressure * 0.3 +
          animalRisk * 0.4 +
          (animalTrace?.dangerClass === "high" ? 0.12 : 0) +
          (animalTrace?.knowledgeUpdate === "danger_caution_added" ? 0.1 : 0) +
          (trip.activityOutcome === "abandoned_due_to_risk" ? 0.28 : 0) +
          (trip.activityOutcome.includes("failed") ? 0.12 : 0) +
          (trip.distanceTiles >= 2 ? 0.08 : 0),
      );
      pushCandidate(candidates, {
        kind:
          animalRisk >= 0.52 && trip.taskGroupType === "hunting_group"
            ? "animal_encounter_injury"
            : foragingScore >= 0.62
              ? "severe_foraging_injury"
              : "minor_foraging_injury",
        sourceCategory: animalTrace !== undefined || animalRisk >= 0.52 ? "fauna_sign" : "activity_trace",
        sourceTileId: animalTrace?.anchorTileId ?? trip.targetTileId,
        sourceResourceId: animalTrace?.stockId,
        sourceTraceId: tripTraceId(trip),
        sourceLabel: animalTrace === undefined
          ? `${trip.taskGroupType} ${trip.activityOutcome}`
          : `${animalTrace.targetArchetypeHint} ${animalTrace.activityOutcome}`,
        score: foragingScore,
        reliability: 0.62,
        confidence: 0.62,
        groundedReasons: [
          trip.taskGroupType,
          trip.activityOutcome,
          animalTrace?.dangerClass === "high" ? "dangerous animal trace" : animalRisk >= 0.52 ? "visible animal danger signs" : "foraging trace risk",
        ],
        contributingFactors: [
          `riskPressure=${round2(riskPressure)}`,
          `animalRisk=${round2(animalRisk)}`,
          ...(animalTrace === undefined ? [] : [`warinessChange=${round2(animalTrace.warinessChange)}`, `pressureApplied=${round2(animalTrace.pressureApplied)}`]),
        ],
        reasonIds: uniqueReasonIds([...trip.reasonIds, ...(animalTrace?.reasonIds ?? [])]),
      });
    }
  }

  const move = (band.recentResidentialMoveEvents ?? []).find((event) =>
    event.hardshipLevel === "high" ||
    event.hardshipLevel === "severe" ||
    event.hardshipOutcome === "delayed" ||
    event.hardshipOutcome === "rejected" ||
    event.hardshipOutcome === "diverted" ||
    event.temporaryWatercraft?.acuteRiskHint !== undefined
  );
  if (move !== undefined || longTrip !== undefined) {
    const moveHardship = move?.hardshipLevel === "severe" ? 0.78 : move?.hardshipLevel === "high" ? 0.62 : 0;
    const routeLoad = longTrip === undefined ? 0 : clamp01(longTrip.roundTripTiles / 12);
    const crossing = move?.temporaryWatercraft;
    const crossingLoad = crossing === undefined
      ? 0
      : clamp01(crossing.riverRisk * 0.38 + crossing.seasonExposureRisk * 0.22 + crossing.shuttleTrips / 12 * 0.24 + (crossing.result === "crossing_abandoned_risk" ? 0.18 : 0));
    const score = clamp01(moveHardship + routeLoad * 0.34 + fatiguePressure * 0.2 + riskPressure * 0.16 + crossingLoad);
    const crossingKind =
      crossing?.acuteRiskHint === "aquatic_accident" ? "aquatic_accident" :
      crossing?.acuteRiskHint === "exposure_or_cold_snap" ? "exposure_or_cold_snap" :
      "travel_accident";
    pushCandidate(candidates, {
      kind: crossing === undefined ? (score >= 0.62 ? "travel_accident" : "minor_foraging_injury") : crossingKind,
      sourceCategory: move === undefined ? "activity_trace" : "travel_route",
      sourceTileId: crossing?.sourceTileId ?? move?.toTileId ?? longTrip?.targetTileId ?? band.position,
      sourceResourceId: move === undefined ? undefined : String(move.eventId),
      sourceTraceId: move === undefined ? tripTraceId(longTrip) : String(move.eventId),
      sourceLabel: crossing === undefined
        ? move === undefined ? "long activity route" : `${move.moveKind} ${move.hardshipOutcome ?? move.status}`
        : `temporary ${crossing.optionLabel ?? "watercraft"} crossing ${crossing.result}`,
      score,
      reliability: move === undefined ? 0.58 : 0.78,
      confidence: move === undefined ? 0.58 : 0.78,
      groundedReasons: crossing === undefined
        ? [move?.hardshipReason ?? "recent long route", move?.hardshipOutcome ?? longTrip?.activityOutcome ?? "route load"]
        : [
            move?.hardshipReason ?? crossing.reason,
            `river risk ${round2(crossing.riverRisk)}`,
            `shuttle trips ${crossing.shuttleTrips}`,
          ],
      contributingFactors: [
        `moveHardship=${round2(moveHardship)}`,
        `routeLoad=${round2(routeLoad)}`,
        `fatigue=${round2(fatiguePressure)}`,
        ...(crossing === undefined ? [] : [`crossingLoad=${round2(crossingLoad)}`, `materialConfidence=${round2(crossing.materialConfidence)}`]),
      ],
      reasonIds: uniqueReasonIds([...(move?.reasonIds ?? []), ...(crossing?.reasonIds ?? []), ...(longTrip?.reasonIds ?? [])]),
    });
  }

  return candidates.slice(0, 12);
}

function pushCandidate(candidates: AcuteRiskCandidate[], candidate: AcuteRiskCandidate): void {
  if (candidate.score < 0.36) {
    return;
  }
  candidates.push({
    ...candidate,
    score: round3(clamp01(candidate.score)),
    reliability: round2(clamp01(candidate.reliability)),
    confidence: round2(clamp01(candidate.confidence)),
    groundedReasons: candidate.groundedReasons.filter((reason) => reason.length > 0).slice(0, 4),
    contributingFactors: candidate.contributingFactors.filter((factor) => factor.length > 0).slice(0, 5),
    reasonIds: uniqueReasonIds(candidate.reasonIds),
  });
}

function selectEpisodes(world: WorldState, band: Band, candidates: readonly AcuteRiskCandidate[]): readonly AcuteRiskEpisode[] {
  const selected: AcuteRiskEpisode[] = [];
  const existingIds = new Set((band.acuteRisk?.recentEpisodes ?? []).map((episode) => episode.id));

  for (const candidate of candidates) {
    if (selected.length >= MAX_EPISODES_PER_BAND_SEASON) {
      break;
    }

    const probability = candidate.score >= 0.82
      ? 0.985
      : clamp01((candidate.score - 0.35) * 0.92);
    const gate = deterministicUnit(world, band, candidate, "gate");
    if (gate > probability) {
      continue;
    }

    const id = makeEpisodeId(world, band, candidate, selected.length);
    if (existingIds.has(id)) {
      continue;
    }
    selected.push(makeEpisode(world, band, candidate, id));
  }

  return selected;
}

// INVENTION-3: which cause group a care/treatment practice must match to
// help this episode (mismatched treatment earns and changes nothing).
function careGroupForKind(kind: AcuteRiskKind): "injury" | "sickness" {
  switch (kind) {
    case "minor_foraging_injury":
    case "severe_foraging_injury":
    case "animal_encounter_injury":
    case "aquatic_accident":
    case "travel_accident":
      return "injury";
    default:
      return "sickness";
  }
}

function makeEpisode(world: WorldState, band: Band, candidate: AcuteRiskCandidate, id: string): AcuteRiskEpisode {
  const severity = severityForCandidate(world, band, candidate);
  const baseEffect = effectForSeverity(candidate.kind, severity, candidate.score);
  // INVENTION-3: a practiced, cause-matched care response bounds part of the
  // episode's weight — recovery shortens by at most one season (never below
  // one) and the mortality bump is damped ≤50%×relief. Everything else is
  // still paid; an unmatched treatment changes nothing.
  const care = deriveCareTreatmentRelief(band, Number(world.time.tick), careGroupForKind(candidate.kind));
  const helpful = care.attempted && care.matched && !care.harmful && care.relief > 0;
  const effect: AcuteRiskEffect = helpful
    ? {
        ...baseEffect,
        mortalityRiskBump: round3(baseEffect.mortalityRiskBump * (1 - care.relief * 0.5)),
        activityEfficiencyPenalty: round3(clamp01(baseEffect.activityEfficiencyPenalty + care.treatmentBurden * 0.08)),
        recoverySeasons: care.relief >= 0.15
          ? Math.max(1, baseEffect.recoverySeasons - 1)
          : baseEffect.recoverySeasons,
      }
    : care.harmful
      ? {
          ...baseEffect,
          mortalityRiskBump: round3(clamp01(baseEffect.mortalityRiskBump + 0.018)),
          extraSeasonalStress: round3(clamp01(baseEffect.extraSeasonalStress + 0.025)),
          activityEfficiencyPenalty: round3(clamp01(baseEffect.activityEfficiencyPenalty + 0.035 + care.treatmentBurden * 0.1)),
          recoverySeasons: Math.min(4, baseEffect.recoverySeasons + 1),
        }
      : care.attempted
        ? {
            ...baseEffect,
            activityEfficiencyPenalty: round3(clamp01(baseEffect.activityEfficiencyPenalty + care.treatmentBurden * 0.06)),
          }
        : baseEffect;
  const context: AcuteRiskContext = {
    sourceCategory: candidate.sourceCategory,
    sourceTileId: candidate.sourceTileId,
    sourceResourceId: candidate.sourceResourceId,
    sourceTraceId: candidate.sourceTraceId,
    sourceLabel: candidate.sourceLabel,
    season: world.time.season,
    confidence: candidate.confidence,
    knownOrObservedByBand: true,
  };
  const memoryUpdates = memoryUpdateLabels(candidate.kind, candidate);

  return {
    id,
    bandId: band.id,
    tick: world.time.tick,
    year: world.time.year,
    season: world.time.season,
    kind: candidate.kind,
    severity,
    durationClass: durationForSeverity(severity),
    context,
    groundedReasons: candidate.groundedReasons,
    contributingFactors: candidate.contributingFactors,
    reliability: candidate.reliability,
    confidence: candidate.confidence,
    effect,
    remainingRecoverySeasons: effect.recoverySeasons,
    ...(care.attempted
      ? {
          careReliefApplied: helpful ? care.relief : 0,
          careResponseId: care.responseId,
          careAttempted: true,
          careMatched: care.matched,
          careHarmApplied: care.harmful ? 0.018 : 0,
          careRecoverySeasonsSaved: baseEffect.recoverySeasons - effect.recoverySeasons,
          careTreatmentBurden: care.treatmentBurden,
          careNote: care.harmful
            ? "the plant preparation worsened the sickness or hurt"
            : helpful
              ? `care shortened recovery ${effect.recoverySeasons < baseEffect.recoverySeasons ? "by a season" : "little"} and damped the worst risk`
              : "care was attempted, but it did not match this trouble",
        }
      : {}),
    affectedStress: effect.extraSeasonalStress > 0,
    affectedActivityEfficiency: effect.activityEfficiencyPenalty > 0,
    affectedMortalityPressure: effect.mortalityRiskBump > 0,
    affectedMovementCaution: effect.movementCautionBump > 0,
    affectedResourceMemory: memoryUpdates.length > 0,
    memoryUpdates,
    reasonIds: candidate.reasonIds,
    noDirectPopulationKill: true,
    noHiddenTruth: true,
  };
}

function effectForSeverity(kind: AcuteRiskKind, severity: AcuteRiskSeverity, score: number): AcuteRiskEffect {
  const severeForaging = kind === "severe_foraging_injury" || kind === "animal_encounter_injury" || kind === "travel_accident";
  const waterOrSickness =
    kind === "bad_water_sickness" ||
    kind === "spoiled_or_risky_food_sickness" ||
    kind === "plant_poisoning_or_irritation" ||
    kind === "heat_or_drought_exhaustion";
  const base =
    severity === "critical" ? 1 :
    severity === "severe" ? 0.72 :
    severity === "moderate" ? 0.44 :
    0.2;
  const scoreScale = clamp01(score);

  return {
    activityEfficiencyPenalty: round3(Math.min(ACTIVE_EFFECT_CAP.activityEfficiencyPenalty, (0.035 + base * 0.075) * (severeForaging ? 1.18 : 1))),
    extraSeasonalStress: round3(Math.min(ACTIVE_EFFECT_CAP.extraSeasonalStress, (0.025 + base * 0.07) * (waterOrSickness ? 1.12 : 1))),
    mortalityRiskBump: round3(Math.min(ACTIVE_EFFECT_CAP.mortalityRiskBump, Math.max(0, base - 0.22) * 0.045 + scoreScale * 0.012)),
    movementCautionBump: round3(Math.min(ACTIVE_EFFECT_CAP.movementCautionBump, 0.035 + base * 0.09)),
    knowledgeUpdateWeight: round3(Math.min(ACTIVE_EFFECT_CAP.knowledgeUpdateWeight, 0.12 + base * 0.25)),
    recoverySeasons: severity === "critical" ? 4 : severity === "severe" ? 3 : severity === "moderate" ? 2 : 1,
  };
}

function summarizeActiveEffect(episodes: readonly AcuteRiskEpisode[]): AcuteRiskEffect {
  const active = episodes.filter((episode) => episode.remainingRecoverySeasons > 0);
  return {
    activityEfficiencyPenalty: round3(Math.min(ACTIVE_EFFECT_CAP.activityEfficiencyPenalty, sum(active.map((episode) => episode.effect.activityEfficiencyPenalty)))),
    extraSeasonalStress: round3(Math.min(ACTIVE_EFFECT_CAP.extraSeasonalStress, sum(active.map((episode) => episode.effect.extraSeasonalStress)))),
    mortalityRiskBump: round3(Math.min(ACTIVE_EFFECT_CAP.mortalityRiskBump, sum(active.map((episode) => episode.effect.mortalityRiskBump)))),
    movementCautionBump: round3(Math.min(ACTIVE_EFFECT_CAP.movementCautionBump, sum(active.map((episode) => episode.effect.movementCautionBump)))),
    knowledgeUpdateWeight: round3(Math.min(ACTIVE_EFFECT_CAP.knowledgeUpdateWeight, sum(active.map((episode) => episode.effect.knowledgeUpdateWeight)))),
    recoverySeasons: active.reduce((max, episode) => Math.max(max, episode.remainingRecoverySeasons), 0),
  };
}

function decayEpisodes(episodes: readonly AcuteRiskEpisode[]): readonly AcuteRiskEpisode[] {
  return episodes
    .map((episode) => ({
      ...episode,
      remainingRecoverySeasons: Math.max(0, episode.remainingRecoverySeasons - 1),
    }))
    .filter((episode) => episode.remainingRecoverySeasons > 0 || episode.effect.knowledgeUpdateWeight >= 0.22)
    .slice(0, RECENT_EPISODE_CAP);
}

function applyAcuteRiskMemoryUpdates(band: Band, episodes: readonly AcuteRiskEpisode[], tick: TickNumber): Band {
  const placeMemory = applyPlaceRiskMemory(band.placeMemory, episodes);
  const resourceKnowledgeState = applyResourceRiskMemory(band, episodes, tick);

  return {
    ...band,
    placeMemory,
    resourceKnowledgeState,
  };
}

function applyPlaceRiskMemory(
  placeMemory: Band["placeMemory"],
  episodes: readonly AcuteRiskEpisode[],
): Band["placeMemory"] {
  let changed = false;
  const next: Record<string, PlaceMemoryRecord> = { ...placeMemory };
  for (const episode of episodes) {
    const tileId = episode.context.sourceTileId;
    if (tileId === undefined) {
      continue;
    }
    const record = next[tileId];
    if (record === undefined) {
      continue;
    }
    const addAvoid = episode.severity === "severe" || episode.severity === "critical";
    const valences = uniqueStrings([
      ...record.valences,
      "risky",
      ...(addAvoid ? ["avoid_place"] : []),
    ]) as PlaceMemoryRecord["valences"];
    next[tileId] = {
      ...record,
      valences,
      confidence: round2(clamp01(record.confidence + episode.effect.knowledgeUpdateWeight * 0.08)),
      reasonIds: uniqueReasonIds([...record.reasonIds, ...episode.reasonIds]).slice(-10),
    };
    changed = true;
  }

  return changed ? next : placeMemory;
}

function applyResourceRiskMemory(
  band: Band,
  episodes: readonly AcuteRiskEpisode[],
  tick: TickNumber,
): Band["resourceKnowledgeState"] {
  const state = band.resourceKnowledgeState;
  if (state === undefined || state.patchMemories.length === 0) {
    return state;
  }
  let changed = false;
  const patchMemories = state.patchMemories.map((memory) => {
    const episode = episodes.find((candidate) =>
      candidate.context.sourceResourceId === String(memory.patchId) ||
      candidate.context.sourceTileId === memory.approximateTile ||
      memory.linkedTiles.some((tileId) => tileId === candidate.context.sourceTileId)
    );
    if (episode === undefined) {
      return memory;
    }
    const poisoning = episode.kind === "plant_poisoning_or_irritation" || episode.kind === "spoiled_or_risky_food_sickness";
    const badWater = episode.kind === "bad_water_sickness" || episode.kind === "heat_or_drought_exhaustion";
    const animalRisk = episode.kind === "animal_encounter_injury" || episode.kind === "aquatic_accident" || episode.kind === "travel_accident";
    if (!poisoning && !badWater && !animalRisk) {
      return memory;
    }
    changed = true;
    return {
      ...memory,
      state: poisoning || badWater ? "risky" : memory.state,
      risk: {
        ...memory.risk,
        poisoningOrBadReaction: memory.risk.poisoningOrBadReaction || poisoning,
        badWater: memory.risk.badWater || badWater,
        predatorOrAnimalRisk: round2(Math.max(memory.risk.predatorOrAnimalRisk, animalRisk ? episode.effect.knowledgeUpdateWeight : 0)),
      },
      confidence: {
        ...memory.confidence,
        safetyConfidence: round2(Math.min(1, memory.confidence.safetyConfidence + episode.effect.knowledgeUpdateWeight * 0.1)),
      },
      useHistory: {
        ...memory.useHistory,
        failedUses: memory.useHistory.failedUses + (poisoning || badWater ? 1 : 0),
        lastUsedTick: tick,
      },
      learning: memory.learning === undefined
        ? memory.learning
        : {
            ...memory.learning,
            lastOutcome: poisoning || badWater ? "safety_risk_detected" : memory.learning.lastOutcome,
            lastOutcomeTick: tick,
            contradictionCount: memory.learning.contradictionCount + (poisoning || badWater ? 1 : 0),
          },
      lastNotedTick: tick,
      reasonIds: uniqueReasonIds([...memory.reasonIds, ...episode.reasonIds]).slice(-12),
    };
  });

  return changed
    ? enforceResourceKnowledgeCap({ ...state, patchMemories }, tick)
    : state;
}

function severityForCandidate(world: WorldState, band: Band, candidate: AcuteRiskCandidate): AcuteRiskSeverity {
  const rarity = deterministicUnit(world, band, candidate, "severity");
  if (candidate.score >= 0.9 && rarity < 0.08) {
    return "critical";
  }
  if (candidate.score >= 0.74 || (candidate.kind === "severe_foraging_injury" && candidate.score >= 0.62)) {
    return "severe";
  }
  if (candidate.score >= 0.54) {
    return "moderate";
  }
  return "minor";
}

function durationForSeverity(severity: AcuteRiskSeverity): AcuteRiskDurationClass {
  switch (severity) {
    case "critical":
      return "week";
    case "severe":
      return "several_days";
    case "moderate":
      return "day";
    case "minor":
      return "hours";
  }
}

function memoryUpdateLabels(kind: AcuteRiskKind, candidate: AcuteRiskCandidate): readonly string[] {
  if (kind === "plant_poisoning_or_irritation" || kind === "spoiled_or_risky_food_sickness") {
    return [`plant/resource caution marked for ${candidate.sourceResourceId ?? candidate.sourceLabel}`];
  }
  if (kind === "bad_water_sickness" || kind === "heat_or_drought_exhaustion") {
    return [`water/place caution marked near ${String(candidate.sourceTileId ?? "current place")}`];
  }
  if (kind === "aquatic_accident") {
    return [`fishing/aquatic caution marked for ${candidate.sourceResourceId ?? candidate.sourceLabel}`];
  }
  if (kind === "animal_encounter_injury") {
    return ["animal danger caution reinforced"];
  }
  if (kind === "travel_accident" || kind === "exposure_or_cold_snap") {
    return [`route/place caution reinforced near ${String(candidate.sourceTileId ?? "recent route")}`];
  }
  return [];
}

function isCandidateBandKnown(band: Band, candidate: AcuteRiskCandidate): boolean {
  const tileId = candidate.sourceTileId;
  if (tileId === undefined) {
    return true;
  }
  if (tileId === band.position) {
    return true;
  }
  if (band.knowledge.observedTiles[tileId] !== undefined) {
    return true;
  }
  return (band.recentIntraSeasonTrips ?? []).some((trip) =>
    trip.targetTileId === tileId ||
    trip.originTileId === tileId ||
    trip.pathTiles.includes(tileId)
  );
}

function tripTraceId(trip: IntraSeasonTripRecord | undefined): string | undefined {
  if (trip === undefined) {
    return undefined;
  }
  return `${String(trip.sourceBandId)}:${Number(trip.day)}:${trip.taskGroupType}:${String(trip.targetTileId)}`;
}

function plantSafetyRiskValue(value: string): number {
  switch (value) {
    case "high":
      return 0.78;
    case "unknown":
      return 0.56;
    case "moderate":
      return 0.44;
    case "low":
    default:
      return 0.08;
  }
}

function makeEpisodeId(world: WorldState, band: Band, candidate: AcuteRiskCandidate, index: number): string {
  return `acute:${String(band.id)}:${Number(world.time.tick)}:${candidate.kind}:${candidate.sourceResourceId ?? candidate.sourceTraceId ?? String(candidate.sourceTileId ?? band.position)}:${index}`;
}

function deterministicUnit(world: WorldState, band: Band, candidate: AcuteRiskCandidate, salt: string): number {
  const seed = `${String(world.seed)}:${world.runSeed ?? 0}:${Number(world.time.tick)}:${String(band.id)}:${candidate.kind}:${candidate.sourceResourceId ?? ""}:${candidate.sourceTraceId ?? ""}:${String(candidate.sourceTileId ?? "")}:${salt}`;
  return (hashString(seed) % 1000000) / 1000000;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compareCandidates(left: AcuteRiskCandidate, right: AcuteRiskCandidate): number {
  const scoreDelta = right.score - left.score;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  const kindDelta = left.kind.localeCompare(right.kind);
  if (kindDelta !== 0) {
    return kindDelta;
  }
  return (left.sourceResourceId ?? left.sourceTraceId ?? String(left.sourceTileId ?? "")).localeCompare(
    right.sourceResourceId ?? right.sourceTraceId ?? String(right.sourceTileId ?? ""),
  );
}

function compareEpisodesNewestFirst(left: AcuteRiskEpisode, right: AcuteRiskEpisode): number {
  const tickDelta = Number(right.tick) - Number(left.tick);
  if (tickDelta !== 0) {
    return tickDelta;
  }
  return left.id.localeCompare(right.id);
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function uniqueReasonIds(values: readonly ReasonId[]): readonly ReasonId[] {
  return uniqueStrings(values.map(String)).slice(0, 12).map((value) => value as ReasonId);
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

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
