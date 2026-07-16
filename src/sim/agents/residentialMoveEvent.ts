// RESIDENTIAL-MOVE-1 — RECORD-ONLY residential relocation events.
//
// Today a band that relocates does so as a single seasonal-boundary jump
// ("season ended, band moved"). This module turns that ALREADY-decided move into a
// legible, explanatory record: a time-span inside the season (start/end day), a
// passability-aware route, a movement kind, a cause, and an arrival status.
//
// HARD CONSTRAINTS (enforced by construction + the audit):
//   - Does NOT create or change any movement decision (it reads the decided move).
//   - Does NOT move band.position daily (band.position still changes only at the
//     boundary, in applyBandDecision; this is a retrospective annotation).
//   - Is NEVER read by yield/support/carrying-capacity/population/stress/mortality.
//   - Routes are passability-aware. A no-land-route move can only show a bounded,
//     explicitly grounded temporary-watercraft annotation; no permanent boat inventory,
//     bridges, docks, or hidden river teleport.
//   - PURE & deterministic: no unseeded random call, no `any`, no UI/render/Zustand imports.
//
// The byte-identical-baseline guarantee comes from the caller gate: when the band
// did NOT relocate this season, the prior ring is returned unchanged (see
// deriveResidentialMoveEventRing). A band that never relocates keeps it undefined.

import { SEASON_LENGTH_DAYS } from "../core/types";
import type {
  BandId,
  DayNumber,
  EventId,
  ReasonId,
  Season,
  TickNumber,
  TileId,
} from "../core/types";
import type { Decision } from "../rules/types";
import type { MobilityIntent, MobilityIntentKind } from "../rules/types";
import type { WorldState } from "../world/types";
import { isBandPassableDestination } from "../world/passability";
// 2K.12: selection-only seasonal-memory reader (band-learned only; no hidden truth).
import { readSeasonalEcologyHint } from "./seasonalEcologyReader";
// INVENTION-1: practiced carrying response relieves a bounded share of the
// dependent/elder hardship terms of a burdened residential move.
import { deriveCarriedWaterRelief, deriveCarryingRelief } from "./adaptationBoundary";
// EXPEDITIONARY-4 §6/§7 — the ONE canonical travel-pace boundary. A whole-band
// residential column derives its pace here (cohorts, possessions, cohesion), so this
// module no longer carries private tiles-per-day constants.
import { deriveTravelPace } from "./bandMobility";
import { deriveTemporaryWatercraftAssessmentForMove } from "./storageSuitability";
import type {
  Band,
  ResidentialMoveCause,
  ResidentialMoveEvent,
  ResidentialMoveKind,
  ResidentialMoveStatus,
  ResidentialMovementHardshipOutcome,
  ResidentialMovementIntentOutcomeRecord,
} from "./types";

const RESIDENTIAL_MOVE_EVENT_RING_CAP = 4;
const RESIDENTIAL_INTENT_OUTCOME_RING_CAP = 12;
// Generous but bounded — residential relocations are short and infrequent (only
// fired when the band actually moved), and pathTiles are record-only (cosmetic,
// excluded from the determinism fingerprint), so the cost never touches baselines.
const RESIDENTIAL_MOVE_PATH_MAX_EXPLORED = 1024;
const RESIDENTIAL_MOVE_PATH_MAX_TILES = 64;

export interface DeriveResidentialMoveEventArgs {
  readonly world: WorldState;
  readonly band: Band;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly decision: Decision;
  readonly prevRing?: readonly ResidentialMoveEvent[];
  readonly executedPathTiles?: readonly TileId[];
  readonly stagedLegIncomplete?: boolean;
}

// THE GATE. When the residence did not move this season, the prior ring is returned
// untouched — this is what keeps a non-relocating world byte-identical. Only a real
// relocation appends one record-only event.
export function deriveResidentialMoveEventRing(
  args: DeriveResidentialMoveEventArgs,
): readonly ResidentialMoveEvent[] | undefined {
  const { world, band, nextPosition, moved, decision, prevRing } = args;

  if (!moved || nextPosition === band.position) {
    return prevRing;
  }

  const event = buildResidentialMoveEvent(
    world,
    band,
    nextPosition,
    decision,
    args.executedPathTiles,
    args.stagedLegIncomplete === true,
  );

  return [event, ...(prevRing ?? [])].slice(0, RESIDENTIAL_MOVE_EVENT_RING_CAP);
}

function buildResidentialMoveEvent(
  world: WorldState,
  band: Band,
  nextPosition: TileId,
  decision: Decision,
  executedPathTiles: readonly TileId[] | undefined,
  stagedLegIncomplete: boolean,
): ResidentialMoveEvent {
  const fromTileId = band.position;
  // The decision executor is authoritative. A completed movement must never be
  // reclassified as rejected because a retrospective path search or an unrelated
  // remembered crossing produced a different answer.
  const route = normalizeExecutedPath(fromTileId, nextPosition, executedPathTiles) ??
    findPassableLandPath(world, fromTileId, nextPosition) ??
    [fromTileId, nextPosition];
  const cause = classifyResidentialMoveCause(band, decision);
  const moveKind = moveKindForCause(cause);
  const reasonIds = [
    decision.primaryReason.id,
    ...decision.secondaryReasons.map((reason) => reason.id),
  ].slice(0, 6) as readonly ReasonId[];
  const status: ResidentialMoveStatus = "arrived";
  const pathTiles = route;
  const distanceTiles = Math.max(1, pathTiles.length - 1);
  const startDay = startDayForKind(moveKind);
  const watercraftDelayDays = 0;
  // EXPEDITIONARY-4 §6/§7 — the column's pace comes from the canonical mobility
  // authority: the whole band moves with its dependents, elders, and camp burden, so
  // it is physically slower than a selected party over the same route. Urgency raises
  // willingness (a force-marching column overreaches), never stamina; the quicker
  // pace is paid as extra hardship risk below. The seasonal decision and endpoint are
  // unchanged — this derives duration/effort of the ALREADY-decided move.
  const ordinaryPace = deriveTravelPace(band, "whole_band_residential_move").tilesPerTravelDay;
  const paceTilesPerDay =
    moveKind === "emergency_water_move"
      ? deriveTravelPace(band, "emergency_residential_move", { urgency: 1 }).tilesPerTravelDay
      : moveKind === "food_pressure_move"
        ? deriveTravelPace(band, "emergency_residential_move", { urgency: 0.5 }).tilesPerTravelDay
        : ordinaryPace;
  const durationDays = Math.max(
    1,
    Math.min(14, Math.ceil(distanceTiles / Math.max(0.2, paceTilesPerDay)) + watercraftDelayDays),
  );
  const endDay = Math.min(SEASON_LENGTH_DAYS - 1, startDay + durationDays);
  const hardship = deriveMigrationHardship(world, band, distanceTiles, status, undefined, paceTilesPerDay, ordinaryPace);
  const hardshipOutcome = classifyResidentialMovementHardshipOutcome({
    hasResidentialIntent: isResidentialMovementIntentKind(decision.mobilityIntent?.kind),
    executionOpportunity: true,
    attempted: true,
    moved: true,
    stagedLegIncomplete,
    destinationInvalidated: false,
    crossingTemporarilyBlocked: false,
    temporaryConstraint: false,
    intentAbandoned: false,
    routeSubstituted: false,
    intendedTileId: decision.mobilityIntent?.targetTileId,
    selectedTileId: getDecisionTargetTileId(decision, nextPosition),
    actualTileId: nextPosition,
  }) ?? "accepted";

  // 2K.12: record-only learned-seasonal CONTEXT about the destination (not a cause — the
  // move scorer is not biased by seasonal memory in 2K.12). Flag default OFF / no relevant
  // learned memory → undefined → byte-identical event.
  const seasonalMemoryContext =
    world.auditOptions?.seasonalEcologyMemoryReadersEnabled === true
      ? deriveSeasonalMoveContext(band, nextPosition, world.time.season)
      : undefined;

  return {
    eventId: `move:${String(band.id)}:${Number(world.time.tick)}:${String(fromTileId)}->${String(nextPosition)}` as EventId,
    bandId: band.id as BandId,
    tick: world.time.tick as TickNumber,
    season: world.time.season as Season,
    startDay: startDay as DayNumber,
    endDay: endDay as DayNumber,
    durationDays: endDay - startDay,
    fromTileId,
    toTileId: nextPosition,
    pathTiles,
    distanceTiles,
    moveKind,
    cause,
    status,
    confidence: clamp01(band.pressureState?.confidence ?? 0.5),
    reasonIds,
    hardshipRisk: hardship.risk,
    hardshipLevel: hardship.level,
    hardshipReason: hardship.reason,
    hardshipOutcome,
    hardshipCautionModifier: hardship.cautionModifier,
    ...(seasonalMemoryContext !== undefined ? { seasonalMemoryContext } : {}),
    noDailyPositionMutation: true,
    noYieldChange: true,
    noSupportChange: true,
    noPopulationChange: true,
    noStressChange: true,
  };
}

function deriveMigrationHardship(
  world: WorldState,
  band: Band,
  distanceTiles: number,
  status: ResidentialMoveStatus,
  temporaryWatercraft: ReturnType<typeof deriveTemporaryWatercraftAssessmentForMove>,
  paceTilesPerDay: number,
  ordinaryPaceTilesPerDay: number,
): {
  readonly risk: number;
  readonly level: "low" | "moderate" | "high" | "severe";
  readonly reason: string;
  readonly cautionModifier: number;
} {
  const population = Math.max(1, band.demography.population);
  const dependentShare = band.demography.dependents / population;
  const elderShare = band.demography.elders / population;
  const foodStress = band.pressureState?.foodStress ?? 0;
  const waterStress = band.pressureState?.waterStress ?? 0;
  const fatigue = band.pressureState?.fatiguePressure ?? 0;
  const seasonalHardship =
    world.time.season === "summer"
      ? 0.12
      : world.time.season === "winter"
        ? 0.08
        : 0;
  // A forced-march pace (beyond the band's OWN ordinary column pace) is paid as extra
  // hardship risk — the quicker escape trades rest, foraging en route, and care time
  // for speed. A column moving at its ordinary derived pace pays exactly 0 here.
  const forcedMarchRisk = Math.max(0, paceTilesPerDay - ordinaryPaceTilesPerDay) * 0.12;
  // INVENTION-1: a practiced carrying response (band's own pre-move state)
  // relieves at most 60% × cap(0.4) = 24% of the dependent/elder burden terms
  // of the move — real but bounded; every other hardship term is fully paid.
  const carryingRelief = deriveCarryingRelief(band, Number(world.time.tick));
  const carryingFactor = 1 - (carryingRelief.active ? carryingRelief.relief : 0) * 0.6;
  // INVENTION-3: carried water (water_storage response) relieves at most
  // 50% × cap(0.28) = 14% of the move's water hardship term — the dry stages
  // are still mostly paid, and leakage/heat already discounted the relief.
  const carriedWater = deriveCarriedWaterRelief(band, Number(world.time.tick), {
    heatContext: world.time.season === "summer",
    routeDurationSteps: Math.max(1, distanceTiles),
  });
  const waterFactor = 1 - (carriedWater.active ? carriedWater.relief : 0) * 0.5;
  const risk = round2(clamp01(
    distanceTiles / 14 * 0.24 +
      (dependentShare * 0.18 + elderShare * 0.16) * carryingFactor +
      foodStress * 0.18 +
      waterStress * 0.22 * waterFactor +
      fatigue * 0.12 +
      seasonalHardship +
      forcedMarchRisk +
      (temporaryWatercraft === undefined ? 0 : temporaryWatercraft.riverRisk * 0.16 + temporaryWatercraft.seasonExposureRisk * 0.12),
  ));
  const level =
    risk >= 0.72 ? "severe" :
    risk >= 0.5 ? "high" :
    risk >= 0.28 ? "moderate" :
    "low";
  const reason =
    temporaryWatercraft?.result === "crossing_success" ? `temporary ${temporaryWatercraft.optionLabel ?? "watercraft"} crossing: ${temporaryWatercraft.shuttleTrips} shuttle trips` :
    temporaryWatercraft?.result === "crossing_delayed_materials" ? "river crossing delayed: materials, labor, or carried load were too costly" :
    temporaryWatercraft?.result === "crossing_partial_success" ? "river crossing partly prepared, but dependents and carrying burden slowed the move" :
    temporaryWatercraft?.result === "materials_missing" ? "route rejected: no passable land route and no known temporary crossing material" :
    temporaryWatercraft?.result === "crossing_abandoned_risk" ? "route rejected: river/current/season made a whole-band crossing too risky" :
    status === "failed_no_route" ? "route rejected: no passable land route" :
    waterStress >= 0.55 ? "hard move: water stress and water gap risk" :
    dependentShare + elderShare >= 0.55 ? "hard move: dependents/elders slow the group" :
    foodStress >= 0.5 ? "hard move: food stress before departure" :
    distanceTiles >= 6 ? "hard move: long residential route" :
    "move hardship low";
  return {
    risk,
    level,
    reason,
    cautionModifier: round2(risk * 0.4),
  };
}

export interface ResidentialMovementOutcomeEvidence {
  readonly hasResidentialIntent: boolean;
  readonly executionOpportunity: boolean;
  readonly attempted: boolean;
  readonly moved: boolean;
  readonly stagedLegIncomplete: boolean;
  readonly destinationInvalidated: boolean;
  readonly crossingTemporarilyBlocked: boolean;
  readonly temporaryConstraint: boolean;
  readonly intentAbandoned: boolean;
  readonly routeSubstituted: boolean;
  readonly intendedTileId?: TileId;
  readonly selectedTileId?: TileId;
  readonly actualTileId: TileId;
}

export function classifyResidentialMovementHardshipOutcome(
  evidence: ResidentialMovementOutcomeEvidence,
): ResidentialMovementHardshipOutcome | undefined {
  if (!evidence.hasResidentialIntent || !evidence.executionOpportunity) {
    return undefined;
  }
  if (evidence.intentAbandoned || evidence.destinationInvalidated) {
    return "rejected";
  }
  if (!evidence.moved) {
    return evidence.crossingTemporarilyBlocked || evidence.temporaryConstraint || evidence.attempted ? "delayed" : undefined;
  }
  if (evidence.stagedLegIncomplete) {
    return "delayed";
  }
  if (evidence.routeSubstituted) {
    return "diverted";
  }
  return "accepted";
}

export interface AdvanceResidentialIntentOutcomeArgs {
  readonly world: WorldState;
  readonly band: Band;
  readonly decision: Decision;
  readonly selectedTileId: TileId;
  readonly actualTileId: TileId;
  readonly attempted: boolean;
  readonly moved: boolean;
  readonly crossingBlocked: boolean;
  readonly destinationBlocked: boolean;
  readonly stagedLegIncomplete: boolean;
  readonly temporaryDelayGrounded: boolean;
  readonly prior?: readonly ResidentialMovementIntentOutcomeRecord[];
}

export function advanceResidentialMovementIntentOutcomes(
  args: AdvanceResidentialIntentOutcomeArgs,
): readonly ResidentialMovementIntentOutcomeRecord[] | undefined {
  let records = [...(args.prior ?? [])];
  const previous = args.band.currentIntent;
  const active = args.decision.mobilityIntent;

  if (previous !== undefined && isResidentialMovementIntentKind(previous.kind)) {
    if (args.decision.intentStatus === "abandoned_intent" ||
        (args.decision.intentStatus === "changed_intent" && !sameIntent(previous, active))) {
      records = upsertIntentOutcome(records, makeIntentRecord(args, previous, "rejected", "abandoned", false));
    } else if (args.decision.intentStatus === "completed_intent") {
      records = upsertIntentOutcome(records, makeIntentRecord(args, previous, "accepted", "completed", false));
    }
  }

  if (active === undefined || !isResidentialMovementIntentKind(active.kind)) {
    return records.length === 0 ? undefined : records.slice(0, RESIDENTIAL_INTENT_OUTCOME_RING_CAP);
  }

  const outcome = classifyResidentialMovementHardshipOutcome({
    hasResidentialIntent: true,
    executionOpportunity: args.attempted || args.crossingBlocked || args.destinationBlocked || args.temporaryDelayGrounded,
    attempted: args.attempted,
    moved: args.moved,
    stagedLegIncomplete: args.stagedLegIncomplete,
    destinationInvalidated: args.destinationBlocked,
    crossingTemporarilyBlocked: args.crossingBlocked,
    temporaryConstraint: args.temporaryDelayGrounded,
    intentAbandoned: false,
    routeSubstituted: false,
    intendedTileId: active.targetTileId,
    selectedTileId: args.selectedTileId,
    actualTileId: args.actualTileId,
  });
  const lifecycle = outcome === "accepted" || outcome === "diverted" ? "completed" : "active";
  records = upsertIntentOutcome(records, makeIntentRecord(args, active, outcome, lifecycle, args.attempted));
  return records.slice(0, RESIDENTIAL_INTENT_OUTCOME_RING_CAP);
}

function makeIntentRecord(
  args: AdvanceResidentialIntentOutcomeArgs,
  intent: MobilityIntent,
  outcome: ResidentialMovementHardshipOutcome | undefined,
  lifecycle: ResidentialMovementIntentOutcomeRecord["lifecycle"],
  attempted: boolean,
): ResidentialMovementIntentOutcomeRecord {
  const intentId = movementIntentId(intent);
  const existing = args.prior?.find((record) => record.intentId === intentId);
  const reason = outcome === undefined ? "the active intention had no residential execution opportunity this interval" :
    outcome === "accepted" ? "the intended residential movement completed" :
    outcome === "diverted" ? "movement completed at a materially different selected destination" :
    outcome === "rejected" ? "the prior residential intention was abandoned or its destination became invalid" :
    args.destinationBlocked ? "the selected destination was invalid" :
    args.crossingBlocked ? "a temporarily unsafe crossing held the active intention" :
    "care, fatigue, labor, sickness, or provisioning kept the active intention waiting";
  return {
    intentId,
    bandId: args.band.id,
    intentKind: intent.kind,
    createdAtTick: intent.createdAt.tick,
    lastUpdatedTick: args.world.time.tick,
    ...(intent.targetTileId === undefined ? {} : { intendedTileId: intent.targetTileId }),
    selectedTileId: args.selectedTileId,
    actualTileId: args.actualTileId,
    attempted,
    executionCount: (existing?.executionCount ?? 0) + (attempted ? 1 : 0),
    delayCount: (existing?.delayCount ?? 0) + (outcome === "delayed" ? 1 : 0),
    ...(outcome === undefined ? {} : { outcome }),
    lifecycle,
    terminal: lifecycle !== "active",
    reason,
    reasonIds: [args.decision.primaryReason.id, ...args.decision.secondaryReasons.map((entry) => entry.id)].slice(0, 6),
  };
}

function upsertIntentOutcome(
  records: readonly ResidentialMovementIntentOutcomeRecord[],
  next: ResidentialMovementIntentOutcomeRecord,
): ResidentialMovementIntentOutcomeRecord[] {
  const existing = records.find((record) => record.intentId === next.intentId);
  if (existing?.terminal === true) {
    return [...records];
  }
  return [next, ...records.filter((record) => record.intentId !== next.intentId)]
    .slice(0, RESIDENTIAL_INTENT_OUTCOME_RING_CAP);
}

function movementIntentId(intent: MobilityIntent): string {
  return `movement-intent:${intent.kind}:${Number(intent.createdAt.tick)}`;
}

function sameIntent(left: MobilityIntent, right: MobilityIntent | undefined): boolean {
  return right !== undefined && movementIntentId(left) === movementIntentId(right);
}

function isResidentialMovementIntentKind(kind: MobilityIntentKind | undefined): boolean {
  return kind !== undefined && kind !== "local_foraging";
}

function getDecisionTargetTileId(decision: Decision, fallback: TileId): TileId {
  const action = decision.action;
  return action.type === "move_to_tile" ||
    action.type === "explore_unknown_neighbor" ||
    action.type === "logistical_probe" ||
    action.type === "resource_scout"
    ? action.targetTileId
    : fallback;
}

function normalizeExecutedPath(
  fromTileId: TileId,
  toTileId: TileId,
  path: readonly TileId[] | undefined,
): readonly TileId[] | undefined {
  if (path === undefined || path.length < 2 || path[0] !== fromTileId || path[path.length - 1] !== toTileId) {
    return undefined;
  }
  return path.slice(0, RESIDENTIAL_MOVE_PATH_MAX_TILES);
}

// 2K.12: record-only learned-seasonal context about the destination tile. Reads ONLY the
// band's own seasonalEcologyMemory (no hidden truth); returns undefined when nothing is
// remembered. Used purely for legible annotation — never a movement cause or economy input.
function deriveSeasonalMoveContext(
  band: Band,
  tileId: TileId,
  season: Season,
): readonly string[] | undefined {
  const hint = readSeasonalEcologyHint(band.seasonalEcologyMemory, tileId, season);
  if (hint === undefined) {
    return undefined;
  }
  return [`${hint.kind} (bias ${hint.bias}): ${hint.basis}`];
}

// Cause is derived from the FROM band's pre-decision pressure (what drove the move)
// plus the decided mobility intent. Deterministic priority; never truth-based.
function classifyResidentialMoveCause(band: Band, decision: Decision): ResidentialMoveCause {
  const pressure = band.pressureState;
  const intentKind = decision.mobilityIntent?.kind;
  const water = pressure?.waterStress ?? 0;
  const crowding = Math.max(
    pressure?.nearbyBandPressure ?? 0,
    pressure?.crowdingPenalty ?? 0,
    pressure?.daughterDispersalPressure ?? 0,
  );
  const food = pressure?.foodStress ?? 0;
  const isFrontierIntent =
    intentKind === "follow_river_corridor" ||
    intentKind === "probe_coast" ||
    intentKind === "probe_wetland_or_lake" ||
    intentKind === "cross_pass" ||
    intentKind === "expand_known_world" ||
    intentKind === "seek_new_range" ||
    intentKind === "frontier_dispersal" ||
    intentKind === "daughter_range_expansion";

  if (intentKind === "seek_better_water" || water >= 0.5) {
    return "water_stress";
  }

  if (crowding >= 0.5) {
    return "local_pressure";
  }

  if (food >= 0.5) {
    return "poor_return";
  }

  if (isFrontierIntent) {
    return "frontier_intent";
  }

  if (intentKind === "return_to_known_good_area") {
    return "known_opportunity";
  }

  return "unknown";
}

function moveKindForCause(cause: ResidentialMoveCause): ResidentialMoveKind {
  switch (cause) {
    case "water_stress":
      return "emergency_water_move";
    case "poor_return":
      return "food_pressure_move";
    case "local_pressure":
      return "crowding_pressure_move";
    case "frontier_intent":
      return "frontier_probe_residential_shift";
    case "known_opportunity":
      return "residential_relocation";
    case "fission_daughter":
      return "daughter_colonization_move";
    case "seasonal_refuge_future":
      return "seasonal_strategy_future";
    default:
      return "residential_relocation";
  }
}

// Deterministic plausible start day within the season, per the spec's timing guidance:
// emergencies start early, pressure moves mid-season, planned/known-opportunity later.
function startDayForKind(kind: ResidentialMoveKind): number {
  switch (kind) {
    case "emergency_water_move":
      return 3;
    case "crowding_pressure_move":
      return 24;
    case "food_pressure_move":
      return 30;
    case "frontier_probe_residential_shift":
      return 45;
    case "daughter_colonization_move":
      return 6;
    case "seasonal_strategy_future":
      return 60;
    default:
      return 18;
  }
}

// Deterministic BFS over 4-adjacent PASSABLE land (sorted neighbours for a stable
// tie-break). Returns the inclusive origin→target path, or undefined if the target
// is not reachable on land (recorded as failed_no_route — never a fake water crossing).
function findPassableLandPath(
  world: WorldState,
  originTileId: TileId,
  targetTileId: TileId,
): readonly TileId[] | undefined {
  if (originTileId === targetTileId) {
    return [originTileId];
  }

  const targetTile = world.tiles[targetTileId];

  if (targetTile === undefined || !isBandPassableDestination(targetTile)) {
    return undefined;
  }

  const cameFrom = new Map<TileId, TileId>();
  const visited = new Set<TileId>([originTileId]);
  let frontier: TileId[] = [originTileId];
  let explored = 0;

  while (frontier.length > 0 && explored < RESIDENTIAL_MOVE_PATH_MAX_EXPLORED) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      explored += 1;

      const tile = world.tiles[tileId];

      if (tile === undefined) {
        continue;
      }

      const neighbors = [...tile.neighbors].sort((left, right) => String(left).localeCompare(String(right)));

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }

        const neighbor = world.tiles[neighborId];

        if (neighbor === undefined || !isBandPassableDestination(neighbor)) {
          continue;
        }

        visited.add(neighborId);
        cameFrom.set(neighborId, tileId);

        if (neighborId === targetTileId) {
          return reconstructPath(cameFrom, originTileId, targetTileId);
        }

        next.push(neighborId);
      }
    }

    frontier = next;
  }

  return undefined;
}

function reconstructPath(
  cameFrom: Map<TileId, TileId>,
  originTileId: TileId,
  targetTileId: TileId,
): readonly TileId[] {
  const reversed: TileId[] = [targetTileId];
  let current = targetTileId;

  while (current !== originTileId && reversed.length < RESIDENTIAL_MOVE_PATH_MAX_TILES) {
    const previous = cameFrom.get(current);

    if (previous === undefined) {
      break;
    }

    reversed.push(previous);
    current = previous;
  }

  return reversed.reverse();
}

function manhattan(world: WorldState, fromTileId: TileId, toTileId: TileId): number {
  const from = world.tiles[fromTileId];
  const to = world.tiles[toTileId];

  if (from === undefined || to === undefined) {
    return 0;
  }

  return Math.abs(from.coord.x - to.coord.x) + Math.abs(from.coord.y - to.coord.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
