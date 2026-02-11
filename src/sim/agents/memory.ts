import type {
  Band,
  BandMovementRecord,
  KnownCrossingMemory,
  PlaceMemoryRecord,
  PlaceMemoryValence,
  TravelCorridorMemory,
} from "./types";
import type {
  Coord,
  RouteId,
  RiverId,
  Season,
  TickNumber,
  TileId,
} from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import type { Decision } from "../rules/types";
import { getRiverCrossingForMovement, makeRiverCrossingKey } from "../world/hydrography";
import type { WorldState } from "../world/types";

const MAX_TRAVEL_CORRIDOR_MEMORIES = 96;

export interface BandMemoryUpdateInput {
  readonly world: WorldState;
  readonly band: Band;
  readonly decision: Decision;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly observedTileIds: readonly TileId[];
  readonly knownTiles: Readonly<Record<TileId, KnownTileRecord>>;
}

export interface BandMemoryUpdate {
  readonly movementHistory: readonly BandMovementRecord[];
  readonly placeMemory: Readonly<Record<TileId, PlaceMemoryRecord>>;
  readonly travelCorridors: Readonly<Record<RouteId, TravelCorridorMemory>>;
  readonly crossingMemories: Readonly<Record<string, KnownCrossingMemory>>;
}

export function updateBandMemory(input: BandMemoryUpdateInput): BandMemoryUpdate {
  const movementRecord = getMovementRecord(input);
  const movementHistory =
    movementRecord === undefined
      ? input.band.movementHistory
      : [...input.band.movementHistory, movementRecord].slice(-80);
  const travelCorridors =
    movementRecord === undefined
      ? input.band.travelCorridors
      : updateTravelCorridorMemory(input.band.travelCorridors, input.decision, movementRecord);
  const crossingMemories =
    movementRecord === undefined
      ? input.band.crossingMemories
      : updateCrossingMemory(input, movementRecord);
  const placeMemory = updatePlaceMemory({
    ...input,
    movementRecord,
    travelCorridors,
  });

  return {
    movementHistory,
    placeMemory,
    travelCorridors,
    crossingMemories,
  };
}

function getMovementRecord(input: BandMemoryUpdateInput): BandMovementRecord | undefined {
  if (
    !input.moved ||
    (input.decision.action.type !== "move_to_tile" &&
      input.decision.action.type !== "explore_unknown_neighbor")
  ) {
    return undefined;
  }

  return {
    tick: input.world.time.tick,
    time: input.world.time,
    fromTileId: input.band.position,
    toTileId: input.nextPosition,
    action: input.decision.action,
    decisionId: input.decision.id,
    intentKind: input.decision.mobilityIntent?.kind,
    primaryReasonId: input.decision.primaryReason.id,
    directionVector: getDirectionBetweenTileIds(input.band.position, input.nextPosition),
  };
}

function updateTravelCorridorMemory(
  existingCorridors: Readonly<Record<RouteId, TravelCorridorMemory>>,
  decision: Decision,
  movementRecord: BandMovementRecord,
): Readonly<Record<RouteId, TravelCorridorMemory>> {
  const corridorId = makeCorridorId(movementRecord.fromTileId, movementRecord.toTileId);
  const existing = existingCorridors[corridorId];
  const useCount = (existing?.useCount ?? 0) + 1;
  const intentKinds = movementRecord.intentKind === undefined
    ? existing?.intentKinds ?? []
    : addUnique(existing?.intentKinds ?? [], movementRecord.intentKind);

  return compactTravelCorridorMemories({
    ...existingCorridors,
    [corridorId]: {
      id: corridorId,
      fromTileId: movementRecord.fromTileId,
      toTileId: movementRecord.toTileId,
      useCount,
      lastUsedAt: movementRecord.time,
      intentKinds,
      // M0.8: use the STABLE core deliberation breadth (core survival candidates only),
      // NOT `alternativesConsidered.length`. Otherwise merely OFFERING an opt-in candidate
      // (the M0.7 inferred-frontier probe / M0.8 corridor relocation) — winning or not —
      // would inflate this corridor confidence and perturb behaviour. In accepted runs the
      // two are equal (no opt-in candidates), so this is byte-identical there.
      confidence: clamp01(0.24 + useCount * 0.18 + decision.coreDeliberationBreadth * 0.02),
    },
  });
}

function compactTravelCorridorMemories(
  corridors: Readonly<Record<RouteId, TravelCorridorMemory>>,
): Readonly<Record<RouteId, TravelCorridorMemory>> {
  const entries = Object.values(corridors);

  if (entries.length <= MAX_TRAVEL_CORRIDOR_MEMORIES) {
    return corridors;
  }

  const retainedEntries = entries
    .sort((left, right) => {
      const leftScore = getTravelCorridorRetentionScore(left);
      const rightScore = getTravelCorridorRetentionScore(right);

      return rightScore === leftScore
        ? String(left.id).localeCompare(String(right.id))
        : rightScore - leftScore;
    })
    .slice(0, MAX_TRAVEL_CORRIDOR_MEMORIES)
    .map((corridor) => [corridor.id, corridor] as const);

  return Object.fromEntries(retainedEntries) as Readonly<Record<RouteId, TravelCorridorMemory>>;
}

function getTravelCorridorRetentionScore(corridor: TravelCorridorMemory): number {
  return corridor.useCount * 0.64 + corridor.confidence * 0.28 + corridor.lastUsedAt.tick * 0.0004;
}

function updateCrossingMemory(
  input: BandMemoryUpdateInput,
  movementRecord: BandMovementRecord,
): Readonly<Record<string, KnownCrossingMemory>> {
  const crossing = getRiverCrossingForMovement(
    input.world,
    movementRecord.fromTileId,
    movementRecord.toTileId,
  );

  if (crossing === undefined) {
    return input.band.crossingMemories;
  }

  const crossingKey = makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId);
  const existing = input.band.crossingMemories[crossingKey];
  const useCount = (existing?.useCount ?? 0) + 1;

  return {
    ...input.band.crossingMemories,
    [crossingKey]: {
      riverId: crossing.riverId,
      crossingTileA: crossing.fromTileId,
      crossingTileB: crossing.toTileId,
      crossingClass: crossing.crossingClass,
      firstUsedAt: existing?.firstUsedAt ?? input.world.time,
      lastUsedAt: input.world.time,
      useCount,
      successConfidence: clamp01((existing?.successConfidence ?? 0.34) + 0.16),
      seasonalReliability: clamp01(
        (existing?.seasonalReliability ?? crossing.confidence) * 0.72 +
          (1 - crossing.risk) * 0.28,
      ),
      riskMemory: clamp01(
        (existing?.riskMemory ?? crossing.risk) * 0.76 +
          crossing.risk * 0.24,
      ),
      reasonIds: addUnique(existing?.reasonIds ?? [], input.decision.primaryReason.id).slice(-16),
    },
  };
}

function updatePlaceMemory(
  input: BandMemoryUpdateInput & {
    readonly movementRecord?: BandMovementRecord;
    readonly travelCorridors: Readonly<Record<RouteId, TravelCorridorMemory>>;
  },
): Readonly<Record<TileId, PlaceMemoryRecord>> {
  const placeMemory: Record<string, PlaceMemoryRecord> = {
    ...input.band.placeMemory,
  };
  const tileIdsToUpdate = addUnique(input.observedTileIds, input.nextPosition);

  for (const tileId of tileIdsToUpdate) {
    const knownRecord = input.knownTiles[tileId];

    if (knownRecord === undefined) {
      continue;
    }

    placeMemory[tileId] = updatePlaceMemoryRecord(input, knownRecord);
  }

  return placeMemory as Readonly<Record<TileId, PlaceMemoryRecord>>;
}

function updatePlaceMemoryRecord(
  input: BandMemoryUpdateInput & {
    readonly movementRecord?: BandMovementRecord;
    readonly travelCorridors: Readonly<Record<RouteId, TravelCorridorMemory>>;
  },
  knownRecord: KnownTileRecord,
): PlaceMemoryRecord {
  const existing = input.band.placeMemory[knownRecord.tileId];
  const isVisited = knownRecord.tileId === input.nextPosition;
  const isIntentTarget = input.decision.mobilityIntent?.targetTileId === knownRecord.tileId;
  const isRouteNode =
    input.movementRecord?.fromTileId === knownRecord.tileId ||
    input.movementRecord?.toTileId === knownRecord.tileId ||
    existing?.valences.includes("route_node") === true;
  const foodEstimate = getKnownFoodEstimate(knownRecord);
  const waterStress = clamp01(1 - (knownRecord.observedWaterAccess ?? 0.35));
  const riskEstimate = knownRecord.observedRisk ?? 0.35;
  const visitCount = (existing?.visitCount ?? 0) + (isVisited ? 1 : 0);
  const seasonsObserved = mergeSeasons(
    existing?.seasonsObserved ?? [],
    knownRecord.seasonsObserved,
    input.world.time.season,
  );
  const returnInfo = getReturnInfo({
    existing,
    input,
    isVisited,
    isIntentTarget,
    visitCount,
  });
  const valences = getPlaceValences({
    existing,
    foodEstimate,
    waterStress,
    riskEstimate,
    returnInfo,
    isRouteNode,
  });
  const attachment = getUpdatedAttachment({
    existing,
    isVisited,
    isIntentTarget,
    moved: input.moved,
    returnInfo,
    foodEstimate,
    waterStress,
    riskEstimate,
  });
  const reasonIds =
    isVisited || isIntentTarget
      ? addUnique(existing?.reasonIds ?? [], input.decision.primaryReason.id).slice(-16)
      : existing?.reasonIds ?? [];

  return {
    tileId: knownRecord.tileId,
    firstObservedAt: existing?.firstObservedAt ?? knownRecord.firstObservedAt,
    lastObservedAt: input.world.time,
    visitCount,
    seasonsObserved,
    lastKnownFoodEstimate: foodEstimate,
    lastKnownWaterStress: waterStress,
    lastKnownRiskEstimate: riskEstimate,
    bestSeason: getBestSeason(existing, input.world.time.season, foodEstimate),
    worstSeason: getWorstSeason(existing, input.world.time.season, waterStress, riskEstimate),
    valences,
    attachment,
    confidence: Math.max(existing?.confidence ?? 0, knownRecord.confidence),
    reasonIds,
    repeatedReturnCount: returnInfo.repeatedReturnCount,
    isReturnPlace: returnInfo.isReturnPlace,
    lastReturnAt: returnInfo.lastReturnAt,
    returnIntervalTicks: returnInfo.returnIntervalTicks,
    seasonalReturnPattern: returnInfo.seasonalReturnPattern,
  };
}

interface ReturnInfoInput {
  readonly existing?: PlaceMemoryRecord;
  readonly input: BandMemoryUpdateInput;
  readonly isVisited: boolean;
  readonly isIntentTarget: boolean;
  readonly visitCount: number;
}

interface ReturnInfo {
  readonly repeatedReturnCount: number;
  readonly isReturnPlace: boolean;
  readonly lastReturnAt?: PlaceMemoryRecord["lastReturnAt"];
  readonly returnIntervalTicks?: TickNumber;
  readonly seasonalReturnPattern?: readonly Season[];
}

function getReturnInfo(info: ReturnInfoInput): ReturnInfo {
  const existing = info.existing;
  const previousVisitCount = existing?.visitCount ?? 0;
  const separatedVisit =
    info.isVisited &&
    previousVisitCount > 0 &&
    (existing?.lastObservedAt.tick ?? info.input.world.time.tick) < info.input.world.time.tick - 1;
  const sustainedStay =
    info.isVisited &&
    !info.input.moved &&
    info.input.decision.action.type === "stay" &&
    previousVisitCount === 1;
  const repeatedIntentTarget = info.isIntentTarget && previousVisitCount > 0;
  const isRepeatedReturn = separatedVisit || sustainedStay || repeatedIntentTarget;
  const repeatedReturnCount = (existing?.repeatedReturnCount ?? 0) + (isRepeatedReturn ? 1 : 0);
  const lastReturnAt = isRepeatedReturn ? info.input.world.time : existing?.lastReturnAt;
  const previousReturnTick = existing?.lastReturnAt?.tick ?? existing?.lastObservedAt.tick;
  const returnIntervalTicks =
    isRepeatedReturn && previousReturnTick !== undefined
      ? Math.max(0, info.input.world.time.tick - previousReturnTick) as TickNumber
      : existing?.returnIntervalTicks;
  const seasonalReturnPattern =
    repeatedReturnCount > 0
      ? mergeSeasons(existing?.seasonalReturnPattern ?? [], [info.input.world.time.season])
      : existing?.seasonalReturnPattern;
  const isReturnPlace =
    repeatedReturnCount > 0 ||
    (info.visitCount >= 2 && (sustainedStay || separatedVisit || repeatedIntentTarget));

  return {
    repeatedReturnCount,
    isReturnPlace,
    lastReturnAt,
    returnIntervalTicks,
    seasonalReturnPattern,
  };
}

function getPlaceValences(input: {
  readonly existing?: PlaceMemoryRecord;
  readonly foodEstimate: number;
  readonly waterStress: number;
  readonly riskEstimate: number;
  readonly returnInfo: ReturnInfo;
  readonly isRouteNode: boolean;
}): readonly PlaceMemoryValence[] {
  const valences: PlaceMemoryValence[] = [];

  if (input.foodEstimate >= 0.58 && input.waterStress <= 0.48 && input.riskEstimate <= 0.5) {
    valences.push("reliable");
  }

  if (input.riskEstimate >= 0.58) {
    valences.push("risky");
  }

  if (input.foodEstimate >= 0.62 || input.existing?.valences.includes("seasonally_good")) {
    valences.push("seasonally_good");
  }

  if (input.foodEstimate <= 0.34 || input.waterStress >= 0.64) {
    valences.push("seasonally_bad");
  }

  if (input.isRouteNode) {
    valences.push("route_node");
  }

  if (input.returnInfo.isReturnPlace) {
    valences.push("return_place");
  }

  if (input.riskEstimate >= 0.7 || input.waterStress >= 0.74) {
    valences.push("avoid_place");
  }

  return addUnique(input.existing?.valences ?? [], ...valences);
}

function getUpdatedAttachment(input: {
  readonly existing?: PlaceMemoryRecord;
  readonly isVisited: boolean;
  readonly isIntentTarget: boolean;
  readonly moved: boolean;
  readonly returnInfo: ReturnInfo;
  readonly foodEstimate: number;
  readonly waterStress: number;
  readonly riskEstimate: number;
}): number {
  const existingAttachment = input.existing?.attachment ?? 0;
  const visitGain = input.isVisited ? (input.moved ? 0.08 : 0.025) : 0;
  const intentGain = input.isIntentTarget ? 0.04 : 0;
  const returnGain = input.returnInfo.isReturnPlace ? (input.moved ? 0.08 : 0.018) : 0;
  const reliableGain =
    input.foodEstimate >= 0.58 && input.waterStress <= 0.48 && input.riskEstimate <= 0.5
      ? 0.035
      : 0;
  const riskLoss = input.riskEstimate > 0.62 || input.waterStress > 0.68 ? 0.06 : 0;

  return clamp01(existingAttachment + visitGain + intentGain + returnGain + reliableGain - riskLoss);
}

function getKnownFoodEstimate(record: KnownTileRecord): number {
  return clamp01(
    record.observedRichness * 0.58 +
      record.observedAquaticPotential * 0.18 +
      (record.observedStorageSuitability ?? 0.2) * 0.08 +
      (record.observedSeasonalPattern?.reliability ?? 0.5) * 0.16,
  );
}

function getBestSeason(
  existing: PlaceMemoryRecord | undefined,
  season: Season,
  foodEstimate: number,
): Season | undefined {
  return foodEstimate >= 0.58 ? season : existing?.bestSeason;
}

function getWorstSeason(
  existing: PlaceMemoryRecord | undefined,
  season: Season,
  waterStress: number,
  riskEstimate: number,
): Season | undefined {
  return waterStress >= 0.62 || riskEstimate >= 0.62 ? season : existing?.worstSeason;
}

function makeCorridorId(fromTileId: TileId, toTileId: TileId): RouteId {
  return `route:${fromTileId}->${toTileId}` as RouteId;
}

function getDirectionBetweenTileIds(fromTileId: TileId, toTileId: TileId): Coord | undefined {
  const from = parseTileCoord(fromTileId);
  const to = parseTileCoord(toTileId);

  if (from === undefined || to === undefined) {
    return undefined;
  }

  const magnitude = Math.hypot(to.x - from.x, to.y - from.y);

  if (magnitude <= 0.0001) {
    return undefined;
  }

  return {
    x: (to.x - from.x) / magnitude,
    y: (to.y - from.y) / magnitude,
  };
}

function parseTileCoord(tileId: TileId): Coord | undefined {
  const [, rawX, rawY] = String(tileId).split(":");
  const x = Number(rawX);
  const y = Number(rawY);

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function mergeSeasons(
  first: readonly Season[],
  second: readonly Season[],
  extra?: Season,
): readonly Season[] {
  return addUnique(first, ...second, ...(extra === undefined ? [] : [extra]));
}

function addUnique<TValue>(
  existing: readonly TValue[],
  ...values: readonly TValue[]
): readonly TValue[] {
  const next = [...existing];

  for (const value of values) {
    if (!next.includes(value)) {
      next.push(value);
    }
  }

  return next;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
