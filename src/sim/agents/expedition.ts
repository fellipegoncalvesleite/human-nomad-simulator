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
  buildExpeditionRouteTiles,
  compareExpeditionBands,
  deriveTripDurationDays,
  isActiveExpeditionBand,
  resolveExpeditionTargetWork,
  selectExpeditionTripCandidate,
} from "./intraSeasonTrips";
import type { ResourcePatchMemory } from "./resourceKnowledge";
import type {
  Band,
  ExpeditionCargo,
  ExpeditionObservation,
  ExpeditionOutcomeReason,
  ExpeditionOutcomeSummary,
  ExpeditionPhase,
  ExpeditionRecord,
  ExpeditionTaskCamp,
  ExpeditionTaskKind,
  IntraSeasonTripRecord,
} from "./types";

// ── Bounds. Every one of these is a hard cap on state or search, never a tuning dial. ──

/** A party covers this many route tiles in one unburdened travel day. */
export const EXPEDITION_BASE_TILES_PER_DAY = 4;
/** Ceiling on how far out an expedition may plan; derived reach is normally far lower. */
export const EXPEDITION_MAX_ROUTE_TILES = 24;
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
  const carryingRelief = deriveCarryingRelief(band, currentTick);
  const waterRelief = deriveCarriedWaterRelief(band, currentTick);
  const reliefFactor =
    1 +
    Math.max(0, Math.min(0.2, carryingRelief.relief ?? 0)) +
    Math.max(0, Math.min(0.1, waterRelief.relief ?? 0));
  const loadPenalty = 1 - loadRatio * 0.3;
  const injuryPenalty = Math.max(0.4, 1 - expedition.injuryLoad);
  const raw = EXPEDITION_BASE_TILES_PER_DAY * loadPenalty * injuryPenalty * reliefFactor;
  return Math.max(1, Math.floor(raw));
}

/**
 * A party establishes a temporary operating base only when the physical route/target
 * justifies it: the walk home is longer than a day, so working from the target and
 * sleeping there beats backtracking. It is not a settlement, holds nothing, and expires.
 */
function deriveTaskCampForOperating(expedition: ExpeditionRecord, day: DayNumber): ExpeditionTaskCamp | undefined {
  const homeLegDays = Math.ceil(expedition.routeTileIds.length / EXPEDITION_BASE_TILES_PER_DAY);

  if (homeLegDays < 1 || expedition.taskCamp !== undefined) {
    return expedition.taskCamp;
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
  readonly day: DayNumber;
}): ExpeditionRecord {
  const { band, taskKind, targetTileId, targetPatchId, routeTileIds, partyWorkers, day } = params;
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
    return { world, expedition: arrived ? { ...moved, taskCamp: deriveTaskCampForOperating(moved, day) } : moved };
  }

  if (withProvisions.phase === "operating") {
    // Information-only tasks never touch a stock; they carry an observation home.
    if (withProvisions.taskKind === "distant_patch_verification" || withProvisions.taskKind === "route_reconnaissance") {
      const observation: ExpeditionObservation = {
        tileId: withProvisions.targetTileId,
        kind: withProvisions.taskKind === "route_reconnaissance" ? "route_passable" : "target_confirmed",
        confidence: 0.62,
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

    // Physical work: draw the distant stock through the SAME harvest resolution a near
    // trip uses. The stock is depleted here, standing at the target. The receipt is not
    // food yet — it becomes cargo.
    const memory = findTargetMemory(band, withProvisions.targetPatchId);

    if (memory === undefined) {
      return {
        world,
        expedition: { ...withProvisions, phase: "returning", outcomeReason: "target_not_found" },
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
    const camp = deriveTaskCampForOperating(withProvisions, day);
    return {
      world: work.world,
      expedition: {
        ...withProvisions,
        phase: doneWorking ? "returning" : "operating",
        workDaysElapsed: workDays,
        pendingReturnRecord: work.record,
        outcomeReason: taken > 0 ? "returned_with_cargo" : "target_not_found",
        cargo: {
          ...withProvisions.cargo,
          harvestUnits: round4(carried),
          lostUnits: round4(withProvisions.cargo.lostUnits + lost),
        },
        ...(camp === undefined ? {} : { taskCamp: { ...camp, usedDays: camp.usedDays + 1 } }),
      },
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

  if (!home) {
    return { world, expedition: moved };
  }

  const depositRecord = buildReturnedRecord(moved, day);
  return { world, expedition: moved, depositRecord };
}

/**
 * The band's own bounded patch memory for the target — band-known evidence only, matched
 * by the patch identity the launch recorded (never by tile shape, which can drift).
 * A party whose remembered patch has since been forgotten finds nothing, which is the
 * physical `target_not_found` case.
 */
function findTargetMemory(band: Band, targetPatchId: string): ResourcePatchMemory | undefined {
  return band.resourceKnowledgeState?.patchMemories?.find((memory) => String(memory.patchId) === targetPatchId);
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

/**
 * EXPEDITIONARY-2 §1/Slice C — consider sending a party to band-known country that the
 * same-day path can no longer reach. The target comes from the trip authority's own
 * bounded patch-memory selection, so an expedition can never aim at hidden country.
 * Every rejection below is a physical constraint, not a score: no capacity, no spare
 * adults, no remembered distant target, no passable route.
 */
function maybeLaunchExpedition(world: WorldState, band: Band, day: DayNumber): Band {
  const active = (band.expeditions ?? []).filter((expedition) => isExpeditionAway(expedition.phase));

  if (active.length >= EXPEDITION_ACTIVE_CAP || Number(day) % EXPEDITION_LAUNCH_CADENCE_DAYS !== 0) {
    return band;
  }

  const partyWorkers = deriveDepartableWorkers(band);

  if (partyWorkers < 2) {
    return band;
  }

  const candidate = selectExpeditionTripCandidate(world, band, Number(day), EXPEDITION_MAX_ROUTE_TILES);

  if (candidate === undefined || active.some((expedition) => expedition.targetTileId === candidate.targetTileId)) {
    return band;
  }

  const route = buildExpeditionRouteTiles(world, band.position, candidate.targetTileId, EXPEDITION_MAX_ROUTE_TILES);

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
    taskKind: "distant_plant_gathering",
    targetTileId: candidate.targetTileId,
    targetPatchId: String(candidate.memory.patchId),
    routeTileIds: route,
    partyWorkers,
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
    const nextExpeditions: ExpeditionRecord[] = [];
    const deposits: IntraSeasonTripRecord[] = [];
    let outcomes = [...(currentBand.recentExpeditionOutcomes ?? [])];

    for (const expedition of [...(currentBand.expeditions ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
      const result = advanceExpeditionOneDay(currentWorld, currentBand, expedition, day);
      currentWorld = result.world;

      if (result.depositRecord !== undefined) {
        deposits.push(result.depositRecord);
      }

      if (isTerminalPhase(result.expedition.phase)) {
        const delivered = result.depositRecord?.physicalFoodHarvest?.usableSupport ?? 0;
        outcomes = [
          summarizeOutcome(
            result.expedition,
            result.expedition.phase,
            result.expedition.outcomeReason ?? (result.expedition.phase === "lost" ? "party_lost" : "returned_information_only"),
            delivered,
          ),
          ...outcomes,
        ].slice(0, EXPEDITION_OUTCOME_CAP);
        // Terminal parties are compacted into bounded history and dropped from the
        // active list — their workers become available again exactly here.
        continue;
      }

      nextExpeditions.push(result.expedition);
    }

    if (deposits.length === 0 && nextExpeditions.length === (currentBand.expeditions ?? []).length) {
      bandsById[band.id] = { ...currentBand, expeditions: nextExpeditions, recentExpeditionOutcomes: outcomes };
      changed = true;
      continue;
    }

    bandsById[band.id] = {
      ...currentBand,
      expeditions: nextExpeditions,
      recentExpeditionOutcomes: outcomes,
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
