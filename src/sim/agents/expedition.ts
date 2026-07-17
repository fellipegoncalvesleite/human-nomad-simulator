// EXPEDITIONARY-2 — the authoritative multi-day expedition lifecycle.
//
// An expedition is a MORE CAPABLE LIFECYCLE of the same task-group/party system that
// `intraSeasonTrips.ts` already owns — not a second simulator. It reuses that module's
// trip record, its passable-route builder, and its physical harvest resolution, and it
// delivers its result through the SAME `recentIntraSeasonTrips` → `humanFoodSupport`
// ledger. What it adds is the physics the daily path never had: real outbound days, a
// physical position while away, provisions that are eaten, a carry ceiling, a return
// leg, and a receipt that only exists once the party is physically home.
//
// THE BOUNDARY (EXPEDITIONARY-2 §1): duration, not distance, decides the path.
// `deriveSameDayRoundTripFeasible` asks whether the round trip fits the genuine
// same-day budget. If it does, the ordinary same-day trip path handles it, unchanged.
// If it does not, the work belongs here — including the former 5–10-tile band that used
// to be LABELLED "overnight"/"continues" while still crediting food instantly on the
// departure day. That instant credit was a teleport, and it is now removed.
//
// Determinism: no randomness. Every branch reads band-known state, the physical world,
// or a deterministic hash of stable identity. Bands and expeditions are iterated in
// sorted id order.
import type { DayNumber, ReasonId, TileId } from "../core/types";
import { hashSeedString } from "../core/seededVariation";
import { getWorldTimeForDay } from "../tick/time";
import type { WorldState } from "../world/types";
import type { DailyAction } from "./dailyActions";
import { deriveCarriedWaterRelief, deriveCarryingRelief } from "./adaptationBoundary";
import {
  KM_PER_TILE,
  deriveAvailableMobilityPools,
  deriveTravelPace,
  recordExpeditionDistance,
  recordWalkingDay,
  selectPartyComposition,
  type TravelContext,
} from "./bandMobility";
import {
  applyActivityOutcomeToMemoryForWorld,
  buildExpeditionRouteTiles,
  compareExpeditionBands,
  deriveTripDurationDays,
  isActiveExpeditionBand,
  isFoodClass,
  resolveExpeditionTargetWork,
  selectExpeditionTripCandidate,
} from "./intraSeasonTrips";
import { effectiveResourceConfidence, type ResourcePatchMemory } from "./resourceKnowledge";
import { observeTileAndNearby } from "./tileObservation";
import {
  SIGNAL_ATTEMPT_CAP,
  appendReceivedSignal,
  findUnderstoodSignal,
  resolveSmokeSignal,
} from "./fireSignals";
import type {
  Band,
  ExpeditionCargo,
  ExpeditionObservation,
  ExpeditionOutcomeReason,
  ExpeditionOutcomeSummary,
  ExpeditionPartyComposition,
  ExpeditionPhase,
  ExpeditionRecord,
  ExpeditionTaskCamp,
  ExpeditionTaskKind,
  IntraSeasonTripRecord,
  ReceivedSmokeSignal,
} from "./types";

// ── Bounds. Every one of these is a hard cap on state or search, never a tuning dial. ──

/** A party covers this many route tiles in one unburdened travel day. */
export const EXPEDITION_BASE_TILES_PER_DAY = 4;
/**
 * Ceiling on how far out an expedition may plan; derived reach is normally far lower.
 * §17 — this is a TECHNICAL search bound, not a behavioral range: at 36 tiles (54 km)
 * a well-found party can physically walk ~100+ km out-and-back inside the duration
 * window, while provisions, pace, fatigue, and candidate selection keep ordinary
 * expeditions far shorter. An arbitrary small cap here must never be what blocks a
 * long journey — the physical budgets are.
 */
export const EXPEDITION_MAX_ROUTE_TILES = 36;
/** A party may not stay out longer than this; exceeding it makes it overdue, then lost. */
export const EXPEDITION_MAX_DURATION_DAYS = 24;
/** Concurrent away parties per band. */
export const EXPEDITION_ACTIVE_CAP = 2;
/** Bounded terminal history per band. */
export const EXPEDITION_OUTCOME_CAP = 6;
/** Bounded carried observations per party. */
export const EXPEDITION_OBSERVATION_CAP = 6;
/** Bounded work days at the target before the party must turn for home. */
export const EXPEDITION_MAX_WORK_DAYS = 3;
/** Harvest units one worker can physically carry home. */
export const EXPEDITION_CARRY_UNITS_PER_WORKER = 0.12;
/**
 * Harvest units one worker eats per day away (trip-local provisioning; never a store).
 *
 * Scale note: harvest units are a fraction of ONE patch's seasonal availability (a
 * per-trip draw is capped around 0.5, see intraSeasonTrips `deriveResourceReturnRecord`),
 * so a party's own subsistence has to be a small fraction of a take — at a larger rate a
 * party mathematically eats its entire cargo on every trip and nothing can ever come
 * home, which is physically wrong rather than merely pessimistic. This is a real,
 * non-trivial cost (a long trip with a poor take can still net ~zero, which is the
 * intended "expeditions are not free" outcome) but it does not make delivery impossible.
 */
export const EXPEDITION_PROVISION_UNITS_PER_WORKER_DAY = 0.0008;

/**
 * The genuine same-day envelope: can a party walk to `distanceTiles` and back within one
 * activity day? This — not a distance constant — is what separates the two paths.
 */
export function deriveSameDayRoundTripFeasible(distanceTiles: number): boolean {
  return distanceTiles * 2 <= EXPEDITION_BASE_TILES_PER_DAY * 2;
}

/** Deterministic expedition identity from stable band/target/day facts. No counters, no clock. */
export function deriveExpeditionId(
  bandId: string,
  targetTileId: TileId,
  taskKind: ExpeditionTaskKind,
  day: DayNumber,
): string {
  const seed = hashSeedString(`expedition:${bandId}:${targetTileId}:${taskKind}:${Number(day)}`);
  return `expedition:${bandId}:${Number(day)}:${taskKind}:${seed.toString(16)}`;
}

/**
 * Working adults currently committed to away parties. The residential band physically
 * does not have these people: they are subtracted exactly once, here, and become
 * available again only when the party reaches home (or is declared lost).
 */
export function getCommittedExpeditionWorkers(band: Band): number {
  return (band.expeditions ?? [])
    .filter((expedition) => isExpeditionAway(expedition.phase))
    .reduce((total, expedition) => total + expedition.partyWorkers, 0);
}

/** Working adults still physically at the residential camp and available for local work. */
export function getResidentialWorkingAdults(band: Band): number {
  return Math.max(0, band.demography.workingAdults - getCommittedExpeditionWorkers(band));
}

function isExpeditionAway(phase: ExpeditionPhase): boolean {
  return phase === "prepared" || phase === "outbound" || phase === "operating" || phase === "returning";
}

function isTerminalPhase(phase: ExpeditionPhase): phase is "completed" | "aborted" | "lost" {
  return phase === "completed" || phase === "aborted" || phase === "lost";
}

/** A party's physical carry ceiling: workers, minus injury, plus any practiced carrying relief. */
export function deriveCarryCapacityUnits(
  band: Band,
  partyWorkers: number,
  injuryLoad: number,
  currentTick: number,
): number {
  const carryingRelief = deriveCarryingRelief(band, currentTick);
  const reliefFactor = 1 + Math.max(0, Math.min(0.24, carryingRelief.relief ?? 0));
  const injuryFactor = Math.max(0.35, 1 - injuryLoad);
  return round4(partyWorkers * EXPEDITION_CARRY_UNITS_PER_WORKER * reliefFactor * injuryFactor);
}

/**
 * Tiles a party covers today. Load and injury slow it; practiced carrying/water handling
 * (through the public adaptation boundary only) recover part of that loss. Bounded to at
 * least one tile so a party can never be permanently frozen mid-route.
 */
function deriveTilesPerDay(band: Band, expedition: ExpeditionRecord, currentTick: number): number {
  const carried = expedition.cargo.harvestUnits;
  const capacity = Math.max(0.0001, expedition.cargo.carryCapacityUnits);
  const loadRatio = Math.max(0, Math.min(1, carried / capacity));
  // EXPEDITIONARY-4 §6 — pace comes from the ONE canonical travel-pace boundary, in the
  // travel context this party is physically in: an injured party limps, a loaded return
  // party is slower than its own outbound leg, an information party travels light, and
  // an ordinary resource party walks at party capacity. Urgency (food stress) raises
  // willingness inside the authority; it cannot manufacture stamina. The party's §8
  // pool composition shapes its pace: who walks decides how far the party goes.
  const urgency = Math.max(0, Math.min(1, band.pressureState?.foodStress ?? 0));
  const context: TravelContext =
    expedition.injuryLoad > 0.25
      ? "delayed_or_injured_party"
      : loadRatio > 0
        ? "loaded_return_party"
        : expedition.taskKind === "distant_patch_verification" || expedition.taskKind === "route_reconnaissance"
          ? "selected_reconnaissance_party"
          : "resource_expedition";
  const pace = deriveTravelPace(band, context, {
    loadRatio,
    urgency,
    injuryLoad: expedition.injuryLoad,
    partyComposition: expedition.partyComposition,
  });
  // Practiced carrying/water handling (public adaptation boundary only) recovers part of
  // the load cost — learned technique, kept distinct from bodily conditioning.
  const carryingRelief = deriveCarryingRelief(band, currentTick);
  const waterRelief = deriveCarriedWaterRelief(band, currentTick);
  const reliefFactor =
    1 +
    Math.max(0, Math.min(0.2, carryingRelief.relief ?? 0)) +
    Math.max(0, Math.min(0.1, waterRelief.relief ?? 0));
  return Math.max(1, Math.floor(pace.tilesPerTravelDay * reliefFactor));
}

/**
 * A party establishes a temporary operating base only when the physical route/target
 * justifies it (the walk home is longer than a day) AND the ground can host one
 * (§16 local feasibility: dry, not flood-prone). It is not a settlement, holds
 * nothing, and expires. Establishment costs real labor/provisions (charged by the
 * caller, once); its benefit is equally physical — the party sleeps at its work
 * instead of shuttling to safe ground every evening.
 */
function deriveTaskCampForOperating(
  world: WorldState,
  expedition: ExpeditionRecord,
  day: DayNumber,
): ExpeditionTaskCamp | undefined {
  const homeLegDays = Math.ceil(expedition.routeTileIds.length / EXPEDITION_BASE_TILES_PER_DAY);

  if (homeLegDays < 1 || expedition.taskCamp !== undefined) {
    return expedition.taskCamp;
  }

  const standTile = world.tiles[expedition.positionTileId];

  // §16 — no dry, tolerable ground: no camp. The party pays the nightly shuttle instead.
  if (standTile === undefined || standTile.isAquatic === true || standTile.riskProfile.floodRisk > 0.75) {
    return undefined;
  }

  return {
    tileId: expedition.positionTileId,
    establishedDay: day,
    expiresOnDay: (Number(day) + EXPEDITION_MAX_WORK_DAYS + homeLegDays) as DayNumber,
    reason: homeLegDays > 1 ? "leg_staging" : "repeated_retrieval",
    usedDays: 1,
    noResidentialRelocation: true,
    noStorage: true,
    noTerritoryClaim: true,
  };
}

/** §16 — one-off physical establishment cost: setup labor eats a real provision share. */
const TASK_CAMP_SETUP_PROVISION_WORKER_DAYS = 0.5;
/** §16 — a campless party shuttles to safe ground nightly: real tiles walked per work day. */
const CAMPLESS_BACKTRACK_TILES_PER_WORK_DAY = 4;
/** §16 — the nightly shuttle also costs extra provisions (in worker-day equivalents). */
const CAMPLESS_EXTRA_PROVISION_WORKER_DAYS = 0.5;

/** Provisions the party eats today. Consumed from what it carries — never from a band store. */
function consumeProvisions(expedition: ExpeditionRecord): ExpeditionCargo {
  const eaten = round4(expedition.partyWorkers * EXPEDITION_PROVISION_UNITS_PER_WORKER_DAY);
  return {
    ...expedition.cargo,
    provisionUnitsConsumed: round4(expedition.cargo.provisionUnitsConsumed + eaten),
  };
}

/**
 * Has the party eaten more than the trip can physically justify? Provisions are drawn
 * against what the party can carry/gather; running past that is a real physical failure
 * that forces an early return rather than a free extension.
 */
function provisionsExhausted(expedition: ExpeditionRecord): boolean {
  const budget = round4(
    expedition.partyWorkers * EXPEDITION_PROVISION_UNITS_PER_WORKER_DAY * EXPEDITION_MAX_DURATION_DAYS,
  );
  return expedition.cargo.provisionUnitsConsumed > budget;
}

/**
 * The physical receipt that reaches the residential camp. The party ate part of what it
 * took, and it could only carry so much; both reductions are applied HERE, once, to the
 * receipt resolved at the target. A party that ate more than it took delivers nothing.
 */
function buildReturnedRecord(expedition: ExpeditionRecord, day: DayNumber): IntraSeasonTripRecord | undefined {
  const pending = expedition.pendingReturnRecord;

  if (pending?.physicalFoodHarvest === undefined) {
    return undefined;
  }

  const time = getWorldTimeForDay(day);
  const harvest = pending.physicalFoodHarvest;
  const carried = Math.max(0, Math.min(expedition.cargo.harvestUnits, expedition.cargo.carryCapacityUnits));
  const afterProvisions = Math.max(0, carried - expedition.cargo.provisionUnitsConsumed);
  const takenAtTarget = Math.max(0.0001, harvest.usableSupport);
  const deliveredFraction = Math.max(0, Math.min(1, afterProvisions / takenAtTarget));
  const usableSupport = round4(harvest.usableSupport * deliveredFraction);
  const returnedResourceKind = usableSupport > 0 ? pending.resourceReturn.returnedResourceKind : "none";

  return {
    ...pending,
    // The receipt is dated to the RETURN — this is what makes it enter the season's
    // ledger only now, and only once.
    day,
    tick: time.tick,
    endDay: day,
    physicalFoodHarvest: {
      ...harvest,
      usableSupport,
      reasonIds: [...harvest.reasonIds, `reason:expedition-return:${expedition.id}` as ReasonId],
    },
    resourceReturn: {
      ...pending.resourceReturn,
      returnedResourceKind,
      estimatedReturnValue: usableSupport,
      // The single gate the canonical ledger reads. Nothing the party did before this
      // moment set it true.
      consumedByEconomy: usableSupport > 0,
    },
    reasonIds: [...pending.reasonIds, `reason:expedition-return:${expedition.id}` as ReasonId],
  };
}

function summarizeOutcome(
  expedition: ExpeditionRecord,
  phase: "completed" | "aborted" | "lost",
  reason: ExpeditionOutcomeReason,
  deliveredUnits: number,
): ExpeditionOutcomeSummary {
  const time = getWorldTimeForDay(expedition.departedDay);
  return {
    id: expedition.id,
    tick: time.tick,
    taskKind: expedition.taskKind,
    targetTileId: expedition.targetTileId,
    phase,
    outcomeReason: reason,
    distanceTiles: Math.max(0, expedition.routeTileIds.length - 1),
    totalDays: expedition.travelDaysElapsed + expedition.workDaysElapsed,
    partyWorkers: expedition.partyWorkers,
    deliveredHarvestUnits: round4(deliveredUnits),
    provisionUnitsConsumed: expedition.cargo.provisionUnitsConsumed,
    lostUnits: expedition.cargo.lostUnits,
    injuryLoad: expedition.injuryLoad,
    usedTaskCamp: expedition.taskCamp !== undefined,
    // §11 — what the party physically brought home (only meaningful when it returned).
    ...(phase === "completed" && expedition.carriedObservations.length > 0
      ? { observations: expedition.carriedObservations }
      : {}),
  };
}

/** Create a prepared expedition. Called by the decision path when the candidate wins. */
export function createPreparedExpedition(params: {
  readonly band: Band;
  readonly taskKind: ExpeditionTaskKind;
  readonly targetTileId: TileId;
  readonly targetPatchId: string;
  readonly routeTileIds: readonly TileId[];
  readonly partyWorkers: number;
  readonly partyComposition?: ExpeditionPartyComposition;
  readonly day: DayNumber;
}): ExpeditionRecord {
  const { band, taskKind, targetTileId, targetPatchId, routeTileIds, partyWorkers, partyComposition, day } = params;
  const time = getWorldTimeForDay(day);
  const legDays = Math.ceil((routeTileIds.length - 1) / EXPEDITION_BASE_TILES_PER_DAY);
  const plannedDays = Math.min(EXPEDITION_MAX_DURATION_DAYS, legDays * 2 + EXPEDITION_MAX_WORK_DAYS);
  return {
    id: deriveExpeditionId(band.id, targetTileId, taskKind, day),
    bandId: band.id,
    taskKind,
    phase: "prepared",
    originTileId: band.position,
    targetTileId,
    targetPatchId,
    routeTileIds,
    positionTileId: band.position,
    routeIndex: 0,
    departedDay: day,
    departedTick: time.tick,
    plannedReturnDay: (Number(day) + plannedDays) as DayNumber,
    hardDeadlineDay: (Number(day) + EXPEDITION_MAX_DURATION_DAYS) as DayNumber,
    travelDaysElapsed: 0,
    workDaysElapsed: 0,
    partyWorkers,
    ...(partyComposition === undefined ? {} : { partyComposition }),
    cargo: {
      harvestUnits: 0,
      lostUnits: 0,
      provisionUnitsConsumed: 0,
      carryCapacityUnits: deriveCarryCapacityUnits(band, partyWorkers, 0, Number(time.tick)),
    },
    injuryLoad: 0,
    riskEpisodeIds: [],
    carriedObservations: [],
    reasonIds: [`reason:expedition-launch:${band.id}:${Number(day)}:${taskKind}:${targetTileId}` as ReasonId],
    noResidentialRelocation: true,
    bandKnownTargetOnly: true,
  };
}

/** Attach a prepared expedition to a band, respecting the concurrency cap. */
export function attachExpedition(band: Band, expedition: ExpeditionRecord): Band {
  const active = (band.expeditions ?? []).filter((current) => isExpeditionAway(current.phase));

  if (active.length >= EXPEDITION_ACTIVE_CAP) {
    return band;
  }

  return { ...band, expeditions: [...(band.expeditions ?? []), expedition] };
}

interface AdvanceResult {
  readonly world: WorldState;
  readonly expedition: ExpeditionRecord;
  /** Set only on the day the party physically reaches home with something to deposit. */
  readonly depositRecord?: IntraSeasonTripRecord;
  /**
   * EXPEDITIONARY-3 — kilometres the party PHYSICALLY covered today, and whether any of
   * it was under load. Realized history is written from this and nothing else, which is
   * why the reported walking average can never drift from what actually happened.
   */
  readonly walkedKm?: number;
  readonly walkedLoadedKm?: number;
  readonly walkSource?: "expedition_outbound" | "expedition_return" | "expedition_operating";
  /**
   * §13 — a smoke signal the RESIDENTIAL camp physically received today from this
   * party. The only pre-return information channel; bounded meaning only.
   */
  readonly receivedSignal?: ReceivedSmokeSignal;
}

/** Advance ONE expedition by ONE physical day. Pure; the caller threads the world. */
function advanceExpeditionOneDay(
  world: WorldState,
  band: Band,
  expedition: ExpeditionRecord,
  day: DayNumber,
): AdvanceResult {
  if (isTerminalPhase(expedition.phase)) {
    return { world, expedition };
  }

  // Overdue past the hard window: the party did not come home. No cargo reaches camp.
  if (Number(day) > Number(expedition.hardDeadlineDay)) {
    return {
      world,
      expedition: { ...expedition, phase: "lost", outcomeReason: "party_lost" },
    };
  }

  const withProvisions: ExpeditionRecord = {
    ...expedition,
    cargo: consumeProvisions(expedition),
  };

  // Provisions gone: turn for home now, carrying whatever was already taken.
  if (provisionsExhausted(withProvisions) && withProvisions.phase !== "returning") {
    return {
      world,
      expedition: { ...withProvisions, phase: "returning", outcomeReason: "provisions_ran_out" },
    };
  }

  // §14 — a badly hurt party stops working and turns for home. It abandons the part
  // of its cargo its injured people can no longer physically carry (the injury factor
  // already slows its legs; this is the carrying consequence, applied once here).
  if (withProvisions.injuryLoad >= 0.5 && withProvisions.phase !== "returning") {
    const carryFactor = Math.max(0.35, 1 - withProvisions.injuryLoad);
    const carried = round4(withProvisions.cargo.harvestUnits * carryFactor);
    const abandoned = round4(Math.max(0, withProvisions.cargo.harvestUnits - carried));
    return {
      world,
      expedition: {
        ...withProvisions,
        phase: "returning",
        outcomeReason: "injury_forced_return",
        cargo: {
          ...withProvisions.cargo,
          harvestUnits: carried,
          lostUnits: round4(withProvisions.cargo.lostUnits + abandoned),
        },
      },
    };
  }

  const tilesPerDay = deriveTilesPerDay(band, withProvisions, Number(getWorldTimeForDay(day).tick));
  const lastIndex = withProvisions.routeTileIds.length - 1;

  if (withProvisions.phase === "prepared") {
    return {
      world,
      expedition: { ...withProvisions, phase: "outbound" },
    };
  }

  if (withProvisions.phase === "outbound") {
    const nextIndex = Math.min(lastIndex, withProvisions.routeIndex + tilesPerDay);
    const arrived = nextIndex >= lastIndex;
    const moved: ExpeditionRecord = {
      ...withProvisions,
      routeIndex: nextIndex,
      positionTileId: withProvisions.routeTileIds[nextIndex],
      travelDaysElapsed: withProvisions.travelDaysElapsed + 1,
      phase: arrived ? "operating" : "outbound",
    };
    const outboundKm = (nextIndex - withProvisions.routeIndex) * KM_PER_TILE;
    // §12 — the arriving party's bounded viewshed from its stand (and task camp, when
    // one is set up): a broad water/wetland feature on an adjacent tile is the kind of
    // physically grounded cue a person standing there cannot miss. It stays PARTY-LOCAL
    // until return (§11); no exact quantity, stock, or hidden band state is exposed.
    const arrivalObservation = arrived ? deriveArrivalViewshedObservation(world, moved, day) : undefined;
    // §16 — establishing the camp is real work: setup labor eats a provision share, once.
    const establishedCamp = arrived ? deriveTaskCampForOperating(world, moved, day) : undefined;
    const setupCost =
      arrived && establishedCamp !== undefined && moved.taskCamp === undefined
        ? round4(moved.partyWorkers * EXPEDITION_PROVISION_UNITS_PER_WORKER_DAY * TASK_CAMP_SETUP_PROVISION_WORKER_DAYS)
        : 0;
    return {
      world,
      expedition: arrived
        ? {
            ...moved,
            taskCamp: establishedCamp,
            ...(setupCost <= 0
              ? {}
              : {
                  cargo: {
                    ...moved.cargo,
                    provisionUnitsConsumed: round4(moved.cargo.provisionUnitsConsumed + setupCost),
                  },
                }),
            ...(arrivalObservation === undefined
              ? {}
              : {
                  carriedObservations: [...moved.carriedObservations, arrivalObservation].slice(
                    0,
                    EXPEDITION_OBSERVATION_CAP,
                  ),
                }),
          }
        : moved,
      walkedKm: outboundKm,
      walkedLoadedKm: 0,
      walkSource: "expedition_outbound",
    };
  }

  if (withProvisions.phase === "operating") {
    // §10 — information-only tasks never touch a stock; they carry observations home.
    // The observations are PHYSICAL: the party is standing there and looks.
    if (withProvisions.taskKind === "route_reconnaissance") {
      // The party physically walked this route; what it carries home is the lived
      // answer "this route is walkable to here" plus what it saw along the way. The
      // tiles themselves become band knowledge only at return (§11 latency).
      const observation: ExpeditionObservation = {
        tileId: withProvisions.positionTileId,
        kind: "route_passable",
        confidence: 0.8,
        observedDay: day,
      };
      return {
        world,
        expedition: {
          ...withProvisions,
          phase: "returning",
          workDaysElapsed: withProvisions.workDaysElapsed + 1,
          outcomeReason: "returned_information_only",
          carriedObservations: [...withProvisions.carriedObservations, observation].slice(0, EXPEDITION_OBSERVATION_CAP),
        },
      };
    }

    if (withProvisions.taskKind === "distant_patch_verification") {
      const verifyMemory = findTargetMemory(band, withProvisions.targetPatchId);

      if (verifyMemory === undefined) {
        return {
          world,
          expedition: { ...withProvisions, phase: "returning", outcomeReason: "evidence_stale" },
        };
      }

      // Look WITHOUT taking: the physical lookup runs (found? depleted?) but no stock
      // is touched and no cargo can exist. The record itself is carried home and is
      // applied to canonical patch memory only on physical return.
      const verification = resolveExpeditionTargetWork(
        world,
        band,
        verifyMemory,
        withProvisions.targetTileId,
        Math.max(0, withProvisions.routeTileIds.length - 1),
        withProvisions.routeTileIds,
        day,
        "food_resource_check",
        { verifyOnly: true },
      );
      const harvest = verification.record.physicalFoodHarvest;
      const observation: ExpeditionObservation = {
        tileId: withProvisions.targetTileId,
        kind:
          harvest === undefined || harvest.physicalSourceFound !== true
            ? "target_absent"
            : harvest.physicalAvailability <= 0.001
              ? "target_depleted"
              : "target_confirmed",
        // Physical presence beats remembered belief — but one visit is still one visit.
        confidence: 0.85,
        observedDay: day,
      };
      // §13 — a verification party that finds the target good attempts the PLANNED
      // "target confirmed" smoke convention (it left with exactly this arrangement).
      // The attempt is physical: fuel, wetness, distance, occlusion, and today's air
      // decide whether the camp actually sees and reads it. It costs this party its
      // work moment either way.
      const signal =
        observation.kind === "target_confirmed" &&
        (withProvisions.signalAttempts ?? []).length < SIGNAL_ATTEMPT_CAP
          ? resolveSmokeSignal({
              world,
              band,
              expeditionId: withProvisions.id,
              sourceTileId: withProvisions.positionTileId,
              meaning: "target_confirmed",
              planned: true,
              aboutTileId: withProvisions.targetTileId,
              day,
            })
          : undefined;
      return {
        // verifyOnly never mutates world state; thread the same world through.
        world: verification.world,
        expedition: {
          ...withProvisions,
          phase: "returning",
          workDaysElapsed: withProvisions.workDaysElapsed + 1,
          outcomeReason: "returned_information_only",
          pendingKnowledgeRecord: verification.record,
          carriedObservations: [...withProvisions.carriedObservations, observation].slice(0, EXPEDITION_OBSERVATION_CAP),
          ...(signal === undefined
            ? {}
            : { signalAttempts: [...(withProvisions.signalAttempts ?? []), signal.attempt].slice(0, SIGNAL_ATTEMPT_CAP) }),
        },
        ...(signal?.received === undefined ? {} : { receivedSignal: signal.received }),
      };
    }

    // Physical work: draw the distant stock through the SAME harvest resolution a near
    // trip uses. The stock is depleted here, standing at the target. The receipt is not
    // food yet — it becomes cargo.
    const memory = findTargetMemory(band, withProvisions.targetPatchId);

    if (memory === undefined) {
      // The band forgot this patch while the party was walking to it. That is stale
      // evidence, NOT an absent target — the distinction matters because it should
      // revise how the band trusts old memory, not how it rates the country.
      return {
        world,
        expedition: { ...withProvisions, phase: "returning", outcomeReason: "evidence_stale" },
      };
    }

    const work = resolveExpeditionTargetWork(
      world,
      band,
      memory,
      withProvisions.targetTileId,
      Math.max(0, withProvisions.routeTileIds.length - 1),
      withProvisions.routeTileIds,
      day,
      "food_resource_check",
    );
    const taken = work.record.physicalFoodHarvest?.usableSupport ?? 0;
    const capacity = withProvisions.cargo.carryCapacityUnits;
    const totalTaken = round4(withProvisions.cargo.harvestUnits + taken);
    // The party physically cannot carry more than its ceiling; the excess is left behind.
    const carried = Math.min(totalTaken, capacity);
    const lost = round4(Math.max(0, totalTaken - carried));
    const workDays = withProvisions.workDaysElapsed + 1;
    const doneWorking = workDays >= EXPEDITION_MAX_WORK_DAYS || carried >= capacity || taken <= 0;
    const camp = deriveTaskCampForOperating(world, withProvisions, day);
    // §16 — a party with NO feasible camp shuttles to safe ground every evening: real
    // tiles walked, real extra provisions. A camped party sleeps at its work.
    const campless = camp === undefined;
    const backtrackKm = campless ? CAMPLESS_BACKTRACK_TILES_PER_WORK_DAY * KM_PER_TILE : 0;
    const backtrackProvisions = campless
      ? round4(withProvisions.partyWorkers * EXPEDITION_PROVISION_UNITS_PER_WORKER_DAY * CAMPLESS_EXTRA_PROVISION_WORKER_DAYS)
      : 0;
    return {
      world: work.world,
      expedition: {
        ...withProvisions,
        phase: doneWorking ? "returning" : "operating",
        workDaysElapsed: workDays,
        pendingReturnRecord: work.record,
        outcomeReason: classifyTargetWorkOutcome(work.record, taken),
        cargo: {
          ...withProvisions.cargo,
          harvestUnits: round4(carried),
          lostUnits: round4(withProvisions.cargo.lostUnits + lost),
          ...(backtrackProvisions <= 0
            ? {}
            : { provisionUnitsConsumed: round4(withProvisions.cargo.provisionUnitsConsumed + backtrackProvisions) }),
        },
        ...(camp === undefined ? {} : { taskCamp: { ...camp, usedDays: camp.usedDays + 1 } }),
      },
      ...(backtrackKm <= 0 ? {} : { walkedKm: backtrackKm, walkedLoadedKm: 0, walkSource: "expedition_operating" as const }),
    };
  }

  // returning
  const nextIndex = Math.max(0, withProvisions.routeIndex - tilesPerDay);
  const home = nextIndex <= 0;
  const moved: ExpeditionRecord = {
    ...withProvisions,
    routeIndex: nextIndex,
    positionTileId: withProvisions.routeTileIds[nextIndex],
    travelDaysElapsed: withProvisions.travelDaysElapsed + 1,
    phase: home ? "completed" : "returning",
  };

  const returnKm = (withProvisions.routeIndex - nextIndex) * KM_PER_TILE;
  const loadedKm = withProvisions.cargo.harvestUnits > 0 ? returnKm : 0;

  if (!home) {
    return {
      world,
      expedition: moved,
      walkedKm: returnKm,
      walkedLoadedKm: loadedKm,
      walkSource: "expedition_return",
    };
  }

  const depositRecord = buildReturnedRecord(moved, day);
  return {
    world,
    expedition: moved,
    depositRecord,
    walkedKm: returnKm,
    walkedLoadedKm: loadedKm,
    walkSource: "expedition_return",
  };
}

/**
 * The band's own bounded patch memory for the target — band-known evidence only, matched
 * by the patch identity the launch recorded (never by tile shape, which can drift).
 * A party whose remembered patch has since been forgotten finds nothing, which is the
 * physical `target_not_found` case.
 */
/**
 * EXPEDITIONARY-4 §5.3 — map the resolved work record onto an explicit expedition
 * outcome. The resolver already knows exactly why nothing came back; collapsing that
 * into a generic `target_not_found` (as the first implementation did) destroys the
 * evidence a band needs to revise memory correctly and makes the natural outcome
 * distribution unreadable. Exported for the target-resolution audit.
 *
 * Precedence is the physical identity chain, outermost failure first:
 * route endpoint → patch existence (fresh vs stale evidence) → stock state →
 * band-known seasonality → the work itself.
 */
export function classifyTargetWorkOutcome(
  record: IntraSeasonTripRecord,
  taken: number,
): ExpeditionOutcomeReason {
  if (taken > 0) {
    return "returned_with_cargo";
  }

  // The physical resolver stamps `failed_due_to_distance` on the record ONLY when the
  // walked route did not end at the target (nor an accepted adjacent stand): the party
  // is standing somewhere that is not the patch, so nothing below it can be judged.
  if (record.activityOutcome === "failed_due_to_distance") {
    return "route_endpoint_mismatch";
  }

  const failureReason = record.physicalFoodHarvest?.failureReason;

  if (failureReason === "physical_source_absent") {
    // No patch at the stand tile. Whether that indicts the COUNTRY or the EVIDENCE
    // depends on how good the evidence was: a fresh, confident memory that turns out
    // wrong means the target is genuinely absent; a stale/inferred one means the band's
    // information failed, not the place.
    return record.physicalFoodHarvest?.knownness === "known_target" ? "target_absent" : "evidence_stale";
  }

  if (failureReason === "physically_exhausted") {
    return "physically_exhausted";
  }

  if (record.activityOutcome === "failed_due_to_season_mismatch") {
    return "seasonally_inactive";
  }

  // The party stood at a real patch and the attempt itself returned nothing.
  return "harvest_failed";
}

function findTargetMemory(band: Band, targetPatchId: string): ResourcePatchMemory | undefined {
  return band.resourceKnowledgeState?.patchMemories?.find((memory) => String(memory.patchId) === targetPatchId);
}

/**
 * §12 — the smallest honest party viewshed: from the tile the party physically stands
 * on, an adjacent broad water/wetland feature is visible and worth remembering.
 * Deterministic (sorted neighbor ids), bounded (one observation per arrival), and
 * broad-cue-only (no stock, no yield, no other band's state).
 */
function deriveArrivalViewshedObservation(
  world: WorldState,
  expedition: ExpeditionRecord,
  day: DayNumber,
): ExpeditionObservation | undefined {
  const standTile = world.tiles[expedition.positionTileId];

  if (standTile === undefined) {
    return undefined;
  }

  for (const neighborId of [...standTile.neighbors].sort((a, b) => String(a).localeCompare(String(b)))) {
    const neighbor = world.tiles[neighborId];

    if (neighbor === undefined) {
      continue;
    }

    if (neighbor.isAquatic === true || neighbor.terrainKind === "wetlands" || neighbor.isRiver === true) {
      return {
        tileId: neighborId,
        kind: "distant_feature",
        confidence: 0.7,
        observedDay: day,
      };
    }
  }

  return undefined;
}

/**
 * EXPEDITIONARY-2 — the expedition daily action. Fires every day so travel legs are
 * genuinely day-granular, and bails immediately for the (common) case of a band with no
 * party away, so the cost is a bounded per-band check rather than a map scan.
 */
export const expeditionDailyAction: DailyAction = {
  id: "expeditions",
  firesOnDayOfSeason(): boolean {
    return true;
  },
  apply(world: WorldState, day: number): WorldState {
    return applyExpeditionDay(world, day as DayNumber);
  },
};

/** Days between launch attempts, so a band cannot spam parties at a distant target. */
const EXPEDITION_LAUNCH_CADENCE_DAYS = 6;

/**
 * How many working adults may physically leave. Bounded by what is left at camp after
 * other parties are already away, and never more than a third of the residential
 * workforce — a band does not empty its camp. Returns 0 when nobody can safely go,
 * which is the physical "insufficient labor" block.
 */
function deriveDepartableWorkers(band: Band): number {
  const available = getResidentialWorkingAdults(band);
  const maxShare = Math.floor(band.demography.workingAdults / 3);
  return Math.max(0, Math.min(available - 2, maxShare));
}

/** Ticks within which a target already tried (any outcome) is not re-targeted by info tasks. */
const INFORMATION_TASK_SUPPRESSION_TICKS = 8;
/** Remembered value below which verification walking is not worth the labor (§10 EV gate). */
const VERIFICATION_MIN_REMEMBERED_VALUE = 0.3;

function wasTargetRecentlyConcluded(band: Band, targetTileId: TileId, currentTick: number): boolean {
  return (band.recentExpeditionOutcomes ?? []).some(
    (outcome) =>
      outcome.targetTileId === targetTileId &&
      currentTick - Number(outcome.tick) <= INFORMATION_TASK_SUPPRESSION_TICKS,
  );
}

function tileGridDistance(world: WorldState, fromTileId: TileId, toTileId: TileId): number | undefined {
  const from = world.tiles[fromTileId];
  const to = world.tiles[toTileId];

  if (from === undefined || to === undefined) {
    return undefined;
  }

  return Math.abs(from.coord.x - to.coord.x) + Math.abs(from.coord.y - to.coord.y);
}

/**
 * §10 — resource/place VERIFICATION candidate: a remembered food patch whose evidence
 * has gone stale/dormant while its remembered value stays high enough to justify
 * walking there to look. Uncertainty alone never launches (the EV gate and the
 * per-target suppression are what keep verification from running continuously).
 */
function selectVerificationCandidate(
  world: WorldState,
  band: Band,
  currentTick: number,
): { readonly memory: ResourcePatchMemory; readonly targetTileId: TileId } | undefined {
  let best: { readonly memory: ResourcePatchMemory; readonly targetTileId: TileId; readonly score: number } | undefined;

  for (const memory of band.resourceKnowledgeState?.patchMemories ?? []) {
    if (!isFoodClass(memory.resourceClassId)) {
      continue;
    }

    const distance = tileGridDistance(world, band.position, memory.approximateTile);

    if (distance === undefined || deriveTripDurationDays(distance) <= 1 || distance > EXPEDITION_MAX_ROUTE_TILES) {
      continue;
    }

    const effective = effectiveResourceConfidence(memory, currentTick);

    // Verification exists FOR degraded evidence: fresh memory needs no verifying.
    if (!effective.isStale && !effective.isDormant) {
      continue;
    }

    // The remembered value must justify the walk (never a generic curiosity walk).
    const rememberedValue = Math.max(memory.confidence.yieldConfidence, memory.useHistory.lastYieldEstimate);

    if (rememberedValue < VERIFICATION_MIN_REMEMBERED_VALUE) {
      continue;
    }

    if (wasTargetRecentlyConcluded(band, memory.approximateTile, currentTick)) {
      continue;
    }

    const score = rememberedValue + (effective.isDormant ? 0.2 : 0.1);

    if (
      best === undefined ||
      score > best.score ||
      (score === best.score && String(memory.patchId) < String(best.memory.patchId))
    ) {
      best = { memory, targetTileId: memory.approximateTile, score };
    }
  }

  return best === undefined ? undefined : { memory: best.memory, targetTileId: best.targetTileId };
}

/**
 * §10 — route/crossing RECONNAISSANCE candidate. Two physical triggers:
 *  (a) a recent expedition physically failed to reach its target
 *      (`route_endpoint_mismatch`) — the route itself needs a bounded re-read;
 *  (b) a valuable remembered patch beyond same-day reach whose ACCESS evidence is
 *      weak — the band knows the place but not the way.
 */
function selectReconnaissanceCandidate(
  world: WorldState,
  band: Band,
  currentTick: number,
): { readonly targetTileId: TileId; readonly targetPatchId: string } | undefined {
  for (const outcome of band.recentExpeditionOutcomes ?? []) {
    if (
      outcome.outcomeReason !== "route_endpoint_mismatch" ||
      currentTick - Number(outcome.tick) > INFORMATION_TASK_SUPPRESSION_TICKS
    ) {
      continue;
    }

    // One bounded re-read per failure: once a reconnaissance has concluded for this
    // tile since the failure, the question is answered until new evidence arrives.
    const reconDoneSince = (band.recentExpeditionOutcomes ?? []).some(
      (other) =>
        other.targetTileId === outcome.targetTileId &&
        other.outcomeReason === "returned_information_only" &&
        Number(other.tick) >= Number(outcome.tick),
    );

    if (!reconDoneSince) {
      return { targetTileId: outcome.targetTileId, targetPatchId: `route:${outcome.targetTileId}` };
    }
  }

  let best: { readonly targetTileId: TileId; readonly patchId: string; readonly score: number } | undefined;

  for (const memory of band.resourceKnowledgeState?.patchMemories ?? []) {
    if (!isFoodClass(memory.resourceClassId)) {
      continue;
    }

    const distance = tileGridDistance(world, band.position, memory.approximateTile);

    if (distance === undefined || deriveTripDurationDays(distance) <= 1 || distance > EXPEDITION_MAX_ROUTE_TILES) {
      continue;
    }

    const effective = effectiveResourceConfidence(memory, currentTick);
    const rememberedValue = Math.max(memory.confidence.yieldConfidence, memory.useHistory.lastYieldEstimate);

    if (
      effective.effectiveAccessConfidence >= 0.35 ||
      effective.effectivePresenceConfidence < 0.4 ||
      rememberedValue < VERIFICATION_MIN_REMEMBERED_VALUE ||
      wasTargetRecentlyConcluded(band, memory.approximateTile, currentTick)
    ) {
      continue;
    }

    const score = rememberedValue + (0.35 - effective.effectiveAccessConfidence);

    if (
      best === undefined ||
      score > best.score ||
      (score === best.score && String(memory.patchId) < String(best.patchId))
    ) {
      best = { targetTileId: memory.approximateTile, patchId: String(memory.patchId), score };
    }
  }

  return best === undefined ? undefined : { targetTileId: best.targetTileId, targetPatchId: best.patchId };
}

/**
 * EXPEDITIONARY-2 §1/Slice C — consider sending a party to band-known country that the
 * same-day path can no longer reach. The target comes from the trip authority's own
 * bounded patch-memory selection, so an expedition can never aim at hidden country.
 * Every rejection below is a physical constraint, not a score: no capacity, no spare
 * adults, no remembered distant target, no passable route.
 *
 * EXPEDITIONARY-4 §10 — three candidate families now COMPETE here, deterministically:
 * physical retrieval (food) wins when a credible distant food target exists; otherwise
 * a stale-but-valuable memory may justify a verification party; otherwise weak route
 * evidence toward valuable country may justify reconnaissance. Information tasks use a
 * small fast party. Camp labor, care, and same-day work already constrain all three
 * through the same departable-worker rule.
 */
function maybeLaunchExpedition(world: WorldState, band: Band, day: DayNumber): Band {
  const active = (band.expeditions ?? []).filter((expedition) => isExpeditionAway(expedition.phase));

  // §13 — smoke on the horizon is a PROMPT: a camp that just read its own party's
  // planned "target confirmed" column does not wait for the ordinary launch rhythm.
  // This is the physical point of the signal — acting days before the party is home.
  const signalPrompt = (band.receivedSmokeSignals ?? []).some(
    (signal) =>
      signal.meaning === "target_confirmed" &&
      Number(signal.expiresOnDay) >= Number(day) &&
      Number(day) - Number(signal.day) <= 2,
  );

  if (active.length >= EXPEDITION_ACTIVE_CAP || (Number(day) % EXPEDITION_LAUNCH_CADENCE_DAYS !== 0 && !signalPrompt)) {
    return band;
  }

  const partyWorkers = deriveDepartableWorkers(band);

  if (partyWorkers < 2) {
    return band;
  }

  const currentTick = Number(getWorldTimeForDay(day).tick);

  // §10 — the three candidate families compete deterministically.
  //  - A HUNGRY band gambles: physical retrieval goes even on stale evidence.
  //  - A comfortable band does NOT commit a full party to stale/dormant evidence — it
  //    sends two fast walkers to VERIFY first. A confirming return freshens the memory
  //    and the retrieval party goes next (returned knowledge changing later behavior);
  //    a contradicting return kills the wasted trip before it was ever walked.
  //  - With no retrieval target at all, stale-but-valuable memory justifies
  //    verification, and weak route evidence toward valuable country justifies
  //    reconnaissance. No candidate, no launch.
  const retrieval = selectExpeditionTripCandidate(world, band, Number(day), EXPEDITION_MAX_ROUTE_TILES);
  const retrievalEvidence =
    retrieval === undefined ? undefined : effectiveResourceConfidence(retrieval.memory, currentTick);
  const foodStress = Math.max(0, Math.min(1, band.pressureState?.foodStress ?? 0));
  // §13 — an UNDERSTOOD "target confirmed" smoke signal from the band's own away party
  // stands in for fresh evidence: the camp saw the planned convention on the horizon,
  // so the retrieval party can leave before the scouts are even home. This is the
  // physical relay value of the signal — bounded meaning changing one real decision.
  const signalConfirmedTarget =
    retrieval !== undefined &&
    findUnderstoodSignal(band, "target_confirmed", retrieval.targetTileId, day) !== undefined;
  const retrievalEvidenceDegraded =
    retrievalEvidence !== undefined &&
    (retrievalEvidence.isStale || retrievalEvidence.isDormant) &&
    !signalConfirmedTarget;
  const verifyBeforeRetrieving =
    retrieval !== undefined &&
    retrievalEvidenceDegraded &&
    foodStress < 0.35 &&
    !wasTargetRecentlyConcluded(band, retrieval.targetTileId, currentTick);
  const verification =
    retrieval === undefined ? selectVerificationCandidate(world, band, currentTick) : undefined;
  const reconnaissance =
    retrieval === undefined && verification === undefined
      ? selectReconnaissanceCandidate(world, band, currentTick)
      : undefined;

  const chosen =
    retrieval !== undefined && !verifyBeforeRetrieving && !(retrievalEvidenceDegraded && foodStress < 0.35)
      ? {
          taskKind: "distant_plant_gathering" as ExpeditionTaskKind,
          targetTileId: retrieval.targetTileId,
          targetPatchId: String(retrieval.memory.patchId),
          linkedTiles: retrieval.memory.linkedTiles,
          // An ordinary gathering party fills from typical walkers first, touching
          // the scarce high-capacity pool only when it must.
          preference: "balanced" as const,
          workers: partyWorkers,
        }
      : verifyBeforeRetrieving && retrieval !== undefined
        ? {
            taskKind: "distant_patch_verification" as ExpeditionTaskKind,
            targetTileId: retrieval.targetTileId,
            targetPatchId: String(retrieval.memory.patchId),
            linkedTiles: retrieval.memory.linkedTiles,
            // Information wants speed, not hands: a small fast party.
            preference: "fast" as const,
            workers: 2,
          }
        : verification !== undefined
          ? {
              taskKind: "distant_patch_verification" as ExpeditionTaskKind,
              targetTileId: verification.targetTileId,
              targetPatchId: String(verification.memory.patchId),
              linkedTiles: verification.memory.linkedTiles,
              preference: "fast" as const,
              workers: 2,
            }
          : reconnaissance !== undefined
            ? {
                taskKind: "route_reconnaissance" as ExpeditionTaskKind,
                targetTileId: reconnaissance.targetTileId,
                targetPatchId: reconnaissance.targetPatchId,
                linkedTiles: [] as readonly TileId[],
                preference: "fast" as const,
                workers: 2,
              }
            : undefined;

  // One party per target — EXCEPT the §13 relay case: a retrieval party may leave for
  // a target the away VERIFICATION party just confirmed by smoke, before it returns.
  const sameTargetActive = active.some((expedition) => expedition.targetTileId === chosen?.targetTileId);
  const relayException =
    chosen !== undefined &&
    chosen.taskKind === "distant_plant_gathering" &&
    signalConfirmedTarget &&
    active.every(
      (expedition) =>
        expedition.targetTileId !== chosen.targetTileId ||
        expedition.taskKind === "distant_patch_verification",
    );

  if (chosen === undefined || (sameTargetActive && !relayException)) {
    return band;
  }

  // §8 — the party is drawn from the AVAILABLE mobility-role pools (present adults
  // only; adults already away are committed elsewhere and cannot be drawn twice).
  const availablePools = deriveAvailableMobilityPools(band);
  const partyComposition = selectPartyComposition(availablePools, chosen.workers, chosen.preference);

  if (partyComposition === undefined) {
    return band;
  }

  // §5.2 (multi-tile patch) — aim at the remembered anchor tile first; when the anchor
  // itself is unreachable, any of the patch's linked tiles is an equally valid physical
  // stand (deterministic order), and reaching one does not lose the patch identity.
  //
  // §25 — the BFS exploration budget is sized to the CANDIDATE's real distance (plus
  // detour slack), not always the global route cap: a target 8 tiles out does not need
  // a 5776-tile search neighbourhood. The path-length cap below is unchanged; a target
  // needing a detour beyond its distance+slack neighbourhood is honestly unreachable.
  const searchBound = (targetTileId: TileId): number => {
    const distance = tileGridDistance(world, band.position, targetTileId);
    return distance === undefined
      ? EXPEDITION_MAX_ROUTE_TILES
      : Math.min(EXPEDITION_MAX_ROUTE_TILES, distance + 8);
  };
  let route = buildExpeditionRouteTiles(world, band.position, chosen.targetTileId, searchBound(chosen.targetTileId));

  if (route === undefined) {
    for (const linkedTileId of [...chosen.linkedTiles].sort((a, b) => String(a).localeCompare(String(b)))) {
      route = buildExpeditionRouteTiles(world, band.position, linkedTileId, searchBound(linkedTileId));

      if (route !== undefined) {
        break;
      }
    }
  }

  // No passable route within the bounded neighbourhood => physically unreachable. The
  // band simply does not go; it never teleports to the target.
  if (route === undefined || route.length - 1 > EXPEDITION_MAX_ROUTE_TILES) {
    return band;
  }

  const legDays = Math.ceil((route.length - 1) / EXPEDITION_BASE_TILES_PER_DAY);

  if (legDays * 2 + 1 > EXPEDITION_MAX_DURATION_DAYS) {
    return band;
  }

  const expedition = createPreparedExpedition({
    band,
    taskKind: chosen.taskKind,
    targetTileId: chosen.targetTileId,
    targetPatchId: chosen.targetPatchId,
    routeTileIds: route,
    partyWorkers: chosen.workers,
    partyComposition,
    day,
  });
  return attachExpedition(band, expedition);
}

function applyExpeditionDay(world: WorldState, day: DayNumber): WorldState {
  const bandsById: Record<string, Band> = { ...world.bands };
  let currentWorld = world;
  let changed = false;

  for (const band of Object.values(world.bands).sort(compareExpeditionBands)) {
    if (!isActiveExpeditionBand(band)) {
      continue;
    }

    const launched = maybeLaunchExpedition(currentWorld, bandsById[band.id] ?? band, day);

    if (launched !== (bandsById[band.id] ?? band)) {
      bandsById[band.id] = launched;
      changed = true;
    }

    if ((launched.expeditions ?? []).length === 0) {
      continue;
    }

    const currentBand = launched;
    let mobility = currentBand.mobility;
    const nextExpeditions: ExpeditionRecord[] = [];
    const deposits: IntraSeasonTripRecord[] = [];
    // §11 — knowledge PHYSICALLY carried home by parties that completed their return
    // today. It is applied below, once, through the canonical writers. Lost parties
    // apply nothing: their observations never came home.
    const returnedKnowledgeRecords: { readonly record: IntraSeasonTripRecord; readonly targetPatchId: string }[] = [];
    const returnedReconRouteTiles: TileId[] = [];
    // §13 — smoke the residential camp physically received today (bounded meaning only).
    const receivedSignalsToday: ReceivedSmokeSignal[] = [];
    let outcomes = [...(currentBand.recentExpeditionOutcomes ?? [])];
    // EXPEDITIONARY-3 — realized walking for THIS band on THIS day, accumulated across its
    // parties and written once below. Days with no movement are recorded as rest days,
    // which is precisely what makes the calendar-day mean differ from the active-day mean.
    let dayKm = 0;
    let dayLoadedKm = 0;
    let daySource: "expedition_outbound" | "expedition_return" | "expedition_operating" = "expedition_operating";

    for (const rawExpedition of [...(currentBand.expeditions ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
      // §13 — an overdue party raises the PLANNED "delayed" smoke convention exactly
      // once (parties leave with "smoke if late"). Physical: fuel, occlusion, distance,
      // and today's air decide whether the camp actually sees it.
      let expedition = rawExpedition;

      if (
        !isTerminalPhase(expedition.phase) &&
        Number(day) > Number(expedition.plannedReturnDay) &&
        (expedition.signalAttempts ?? []).length < SIGNAL_ATTEMPT_CAP &&
        !(expedition.signalAttempts ?? []).some((attempt) => attempt.meaning === "delayed")
      ) {
        const delayed = resolveSmokeSignal({
          world: currentWorld,
          band: currentBand,
          expeditionId: expedition.id,
          sourceTileId: expedition.positionTileId,
          meaning: "delayed",
          planned: true,
          aboutTileId: expedition.targetTileId,
          day,
        });
        expedition = {
          ...expedition,
          signalAttempts: [...(expedition.signalAttempts ?? []), delayed.attempt].slice(0, SIGNAL_ATTEMPT_CAP),
        };

        if (delayed.received !== undefined) {
          receivedSignalsToday.push(delayed.received);
        }
      }

      const result = advanceExpeditionOneDay(currentWorld, currentBand, expedition, day);
      currentWorld = result.world;

      if (result.receivedSignal !== undefined) {
        receivedSignalsToday.push(result.receivedSignal);
      }

      if ((result.walkedKm ?? 0) > 0) {
        dayKm += result.walkedKm ?? 0;
        dayLoadedKm += result.walkedLoadedKm ?? 0;
        daySource = result.walkSource ?? daySource;
      }

      if (result.depositRecord !== undefined) {
        deposits.push(result.depositRecord);
      }

      if (isTerminalPhase(result.expedition.phase)) {
        const delivered = result.depositRecord?.physicalFoodHarvest?.usableSupport ?? 0;
        const provisionalReason =
          result.expedition.outcomeReason ?? (result.expedition.phase === "lost" ? "party_lost" : "returned_information_only");
        // §5.3 — harvest physically taken at the target but nothing survived the walk
        // home (the party ate it / the carry ceiling lost it): the RETURN failed, not
        // the target. Distinct from every target-stage failure above.
        const terminalReason: ExpeditionOutcomeReason =
          provisionalReason === "returned_with_cargo" && delivered <= 0 && result.expedition.phase === "completed"
            ? "cargo_return_failed"
            : provisionalReason;
        // Observation only: how far this whole journey actually walked, out and back.
        mobility = recordExpeditionDistance(
          mobility,
          (result.expedition.routeTileIds.length - 1) * 2 * KM_PER_TILE,
        );
        outcomes = [
          summarizeOutcome(
            result.expedition,
            result.expedition.phase,
            terminalReason,
            delivered,
          ),
          ...outcomes,
        ].slice(0, EXPEDITION_OUTCOME_CAP);

        // §11 — ONLY a party that physically completed its return transfers knowledge.
        if (result.expedition.phase === "completed") {
          const knowledgeRecord = result.expedition.pendingReturnRecord ?? result.expedition.pendingKnowledgeRecord;

          if (knowledgeRecord !== undefined) {
            returnedKnowledgeRecords.push({
              record: knowledgeRecord,
              targetPatchId: result.expedition.targetPatchId,
            });
          }

          if (result.expedition.taskKind === "route_reconnaissance") {
            returnedReconRouteTiles.push(...result.expedition.routeTileIds);
          }
        }
        // Terminal parties are compacted into bounded history and dropped from the
        // active list — their workers become available again exactly here.
        continue;
      }

      nextExpeditions.push(result.expedition);
    }

    // The ONE writer of realized walking history: completed physical movement.
    mobility = recordWalkingDay(mobility, {
      day,
      km: round4(dayKm),
      loadedKm: round4(dayLoadedKm),
      activeTravel: dayKm > 0,
      source: daySource,
    });

    // §11 — apply the knowledge that PHYSICALLY arrived today, exactly once, through
    // the canonical writers. Patch evidence goes through the SAME activity-memory
    // application the daily path uses; a reconnaissance party's walked tiles go
    // through the SAME single tile-observation writer the decision path uses.
    // While the party was away none of this touched residential knowledge.
    let resourceKnowledgeState = currentBand.resourceKnowledgeState;

    for (const returned of returnedKnowledgeRecords) {
      const targetMemory = resourceKnowledgeState?.patchMemories.find(
        (memory) => String(memory.patchId) === returned.targetPatchId,
      );

      if (targetMemory === undefined) {
        continue;
      }

      const application = applyActivityOutcomeToMemoryForWorld(
        currentWorld,
        { ...currentBand, resourceKnowledgeState },
        returned.record,
        targetMemory,
      );
      resourceKnowledgeState = application.resourceKnowledgeState;
    }

    const knowledge =
      returnedReconRouteTiles.length === 0
        ? currentBand.knowledge
        : observeTileAndNearby(
            currentWorld,
            currentBand.knowledge,
            [...new Set(returnedReconRouteTiles)]
              .map((tileId) => currentWorld.tiles[tileId])
              .filter((tile): tile is NonNullable<typeof tile> => tile !== undefined)
              .map((tile) => ({ tile, distance: 0 })),
          );

    // §13 — smoke the camp saw today enters the band's bounded, expiring record.
    let receivedSmokeSignals = currentBand.receivedSmokeSignals;

    for (const received of receivedSignalsToday) {
      receivedSmokeSignals = appendReceivedSignal(
        { ...currentBand, receivedSmokeSignals },
        received,
        day,
      );
    }

    if (deposits.length === 0 && nextExpeditions.length === (currentBand.expeditions ?? []).length) {
      bandsById[band.id] = {
        ...currentBand,
        expeditions: nextExpeditions,
        recentExpeditionOutcomes: outcomes,
        mobility,
        resourceKnowledgeState,
        knowledge,
        receivedSmokeSignals,
      };
      changed = true;
      continue;
    }

    bandsById[band.id] = {
      ...currentBand,
      expeditions: nextExpeditions,
      recentExpeditionOutcomes: outcomes,
      mobility,
      resourceKnowledgeState,
      knowledge,
      receivedSmokeSignals,
      ...(deposits.length === 0
        ? {}
        : {
            // The ONE place an expedition's food becomes the band's food: the canonical
            // trip ledger, at the return tick, once.
            recentIntraSeasonTrips: [...deposits, ...(currentBand.recentIntraSeasonTrips ?? [])].slice(0, 24),
            lastIntraSeasonTrip: deposits[0],
          }),
    };
    changed = true;
  }

  return changed ? { ...currentWorld, bands: bandsById as WorldState["bands"] } : world;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
