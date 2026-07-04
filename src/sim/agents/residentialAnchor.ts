import { getLocalUsePressureValue } from "./pressure";
import { getSalientMemorySummary, type TickContextCache } from "./contextCache";
import type {
  AnchorDecisionComparison,
  AnchorMemoryRecord,
  AnchorStatus,
  Band,
  DroughtResponse,
  DryMarginMobilityContext,
  DryMarginSeasonalMode,
  ForagingRadiusBasis,
  ForagingRadiusState,
  IntraSeasonActivitySummary,
  ResidentialAction,
  ResidentialAnchorState,
  SeasonalActivityBudget,
  SeasonalResidenceMode,
} from "./types";
import type { ReasonId, Season, TickNumber, TileId, WorldTime } from "../core/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";

const MAX_CATCHMENT_TILES = 16;
const MAX_ANCHOR_MEMORIES = 12;
// Cap on how much of a remembered anchor's tenure a band may "resume" on return.
// Returning to a known refuge restarts holding faster, but never magically
// continues the full old count (checkpoint 2I.3, PART 5).
const ANCHOR_RESUME_CAP = 3;
// A revisited anchor reaches secure_hold at a lower hold value than a fresh one.
const SECURE_HOLD_THRESHOLD = 0.42;
const SECURE_HOLD_THRESHOLD_REVISITED = 0.34;

export interface ResidentialAnchorContext {
  readonly anchor: ResidentialAnchorState;
  readonly foragingRadius: ForagingRadiusState;
  readonly decision: AnchorDecisionComparison;
  // The dry-margin seasonal mode this anchor was derived under. Kept so residence
  // labelling can recognise a wet/green-season dispersal round even when the
  // foraging-radius basis was later overwritten by a stress/risk adjustment.
  readonly seasonalModeKind?: DryMarginSeasonalMode;
}

interface CatchmentTile {
  readonly tileId: TileId;
  readonly distance: number;
  readonly expectedReturn: number;
  readonly roundTripCost: number;
  readonly depletion: number;
  readonly contribution: number;
}

// Derive the band's residential anchor + seasonal catchment for this tick.
// Gated to dry-margin-relevant bands (those with a dry-margin context) for v0:
// non-dry-margin bands return undefined and keep their existing behaviour.
// Uses only the band's own known/remembered records — no hidden tile truth.
export function deriveResidentialAnchorContext(
  world: WorldState,
  band: Band,
  dryContext: DryMarginMobilityContext | undefined,
  contextCache?: TickContextCache,
): ResidentialAnchorContext | undefined {
  if (dryContext === undefined) {
    return undefined;
  }

  const anchorTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  if (anchorTile === undefined || currentRecord === undefined) {
    return undefined;
  }

  const comparison = dryContext.stayMoveScout;
  const refuge = dryContext.currentWaterRefuge;
  const seasonalMode = dryContext.seasonalMode;
  const prospect = dryContext.riverProspect;
  const bestWater = dryContext.bestWaterCandidates[0];

  const population = Math.max(1, band.demography.population);
  const dependencyLoad = clamp01((band.demography.dependents + band.demography.elders) / population);
  const fatigue = band.pressureState?.fatiguePressure ?? 0;
  const foodStress = band.pressureState?.foodStress ?? 0;
  const riskPressure = band.pressureState?.riskPressure ?? 0;
  const logisticalCapacity = clamp01(
    band.demography.workingAdults / population - fatigue * 0.3 - foodStress * 0.18,
  );

  // Tethering water: the reliable water the anchor orbits. Prefer the current
  // refuge; if it has failed, fall back to the best known nearby water.
  const currentSecurity = refuge === undefined
    ? 0
    : clamp01(refuge.drySeasonReliability * 0.6 + refuge.reliability * 0.3 - refuge.droughtFailureRisk * 0.4);
  const bestSecurity = bestWater === undefined
    ? 0
    : clamp01(bestWater.drySeasonReliability * 0.6 + bestWater.reliability * 0.3 - bestWater.droughtFailureRisk * 0.4);
  const useBestAsTether =
    refuge === undefined ||
    refuge.sourceKind === "failed_or_unreliable_water" ||
    (bestWater !== undefined && bestSecurity > currentSecurity + 0.12);
  const tetheringWaterTileId = useBestAsTether ? bestWater?.tileId ?? refuge?.tileId : refuge.tileId;
  const anchorWaterSecurity = round2(Math.max(currentSecurity, useBestAsTether ? bestSecurity * 0.82 : 0));

  const droughtSeverity = seasonalMode?.droughtSeverity ?? 0;
  const localFood = clamp01(
    currentRecord.observedRichness * 0.62 + currentRecord.observedAquaticPotential * 0.16,
  );

  const radius = deriveForagingRadius({
    seasonalModeKind: seasonalMode?.mode,
    droughtSeverity,
    dependencyLoad,
    riskPressure,
    anchorWaterSecurity,
    localFood,
  });
  const logisticalRadius = Math.min(
    radius.radiusTiles + 3,
    radius.radiusTiles + 1 + Math.round(logisticalCapacity * 2),
  );

  const catchment = gatherCatchment(world, band, anchorTile, radius.radiusTiles, dryContext, contextCache);
  const catchmentReturnEstimate = estimateCatchmentReturn(catchment);
  const catchmentDepletion = estimateCatchmentDepletion(band, anchorTile.id, catchment);
  const anchorMarginalReturn = round2(clamp01(catchmentReturnEstimate * (1 - catchmentDepletion * 0.85)));

  const placeAttachment = band.placeMemory[band.position]?.attachment ?? 0;
  const uncertainty = prospect?.uncertainty ?? comparison?.uncertaintyPenalty ?? 0.1;
  const bestKnownAlternativeReturn = comparison?.bestKnownAlternativeReturn ?? 0;
  const dependentMoveCost = clamp01(dependencyLoad * 0.42 + fatigue * 0.2);
  const bestKnownAlternativeNet = round2(clamp01(bestKnownAlternativeReturn - 0.1 - dependentMoveCost * 0.3));

  // Light anchor revisitation memory (2I.3): a band returning to a tile it has
  // anchored at before resumes holding faster (successful return) or grows wary
  // (a tile that previously failed it). Read-only here; written post-decision.
  const anchorMemory = band.anchorMemories?.[anchorTile.id];
  const memoryConfidence = anchorMemory?.confidence ?? 0;
  const successfulReturn =
    anchorMemory !== undefined &&
    anchorMemory.successfulHoldCount > anchorMemory.failedHoldCount &&
    anchorMemory.drySeasonReliability > 0.4;
  const failedReturn =
    anchorMemory !== undefined &&
    anchorMemory.failedHoldCount > 0 &&
    anchorMemory.failedHoldCount >= anchorMemory.successfulHoldCount;

  // Hysteresis: reluctance to give up a secured anchor. Scales with water
  // security, dependency load, how long it has been held, and uncertainty.
  // A successful prior return reduces startup uncertainty and adds stickiness.
  const continuousSeasonsAnchored = getPreviousSeasonsAnchored(band, anchorTile.id);
  const resumedSeasonsAnchored =
    continuousSeasonsAnchored === 0 && successfulReturn
      ? Math.min(anchorMemory.anchoredSeasonCount, ANCHOR_RESUME_CAP)
      : 0;
  const seasonsAnchoredSoFar = Math.max(continuousSeasonsAnchored, resumedSeasonsAnchored);
  const effectiveUncertainty = clamp01(uncertainty - (successfulReturn ? memoryConfidence * 0.3 : 0));
  const relocationHysteresis = round2(clamp01(
    anchorWaterSecurity * 0.34 +
      dependencyLoad * 0.28 +
      Math.min(1, seasonsAnchoredSoFar / 5) * 0.2 +
      effectiveUncertainty * 0.16 +
      (successfulReturn ? 0.08 : 0),
  ));

  const holdValueBase =
    anchorMarginalReturn * 0.4 +
    anchorWaterSecurity * (0.28 + dependencyLoad * 0.22) +
    (1 - catchmentDepletion) * 0.14 +
    placeAttachment * 0.1;
  const holdValue = round2(clamp01(
    (holdValueBase + (successfulReturn ? memoryConfidence * 0.08 : 0)) *
      (failedReturn ? 0.85 : 1),
  ));
  const forayValue = round2(clamp01(
    (comparison?.scoutValue ?? 0) * 0.58 +
      (prospect?.prospectStrength ?? 0) * 0.24 +
      logisticalCapacity * 0.2 -
      dependencyLoad * 0.1,
  ));
  const relocateValue = round2(clamp01(
    bestKnownAlternativeNet * 0.82 - relocationHysteresis - dependentMoveCost * 0.2,
  ));

  // A tile that previously failed this band makes drought failure bite sooner.
  const waterFailureThreshold = failedReturn ? 0.34 : 0.28;
  const waterFailureGate = anchorWaterSecurity < waterFailureThreshold && (refuge?.droughtFailureRisk ?? 0) > 0.5;
  const foodCollapseGate = anchorMarginalReturn < 0.18 && catchmentDepletion > 0.5;
  const betterKnownRefugeGate = bestKnownAlternativeNet > holdValue + 0.12;
  const riskGate = riskPressure > 0.7;
  const fatigueGate = fatigue > 0.7;
  const reachableAlternative = bestKnownAlternativeNet > 0.2 || (prospect?.prospectStrength ?? 0) > 0.3;

  const probeAvailable = dryContext.logisticalProbeAvailable;
  const chosenResidentialAction = chooseResidentialAction({
    waterFailureGate,
    foodCollapseGate,
    betterKnownRefugeGate,
    reachableAlternative,
    holdValue,
    forayValue,
    relocateValue,
    probeAvailable,
  });

  const anchorStatus = deriveAnchorStatus({
    waterFailureGate,
    foodCollapseGate,
    reachableAlternative,
    chosenResidentialAction,
    seasonalModeKind: seasonalMode?.mode,
    radiusBasis: radius.basis,
    holdValue,
    secureHoldThreshold: successfulReturn ? SECURE_HOLD_THRESHOLD_REVISITED : SECURE_HOLD_THRESHOLD,
  });
  const droughtResponse = deriveDroughtResponse(seasonalMode?.mode, chosenResidentialAction);

  const startedTick = chosenResidentialAction === "residential_relocation"
    ? world.time.tick
    : getPreviousStartedTick(band, anchorTile.id, world.time);
  const seasonsAnchored = chosenResidentialAction === "residential_relocation" ? 0 : seasonsAnchoredSoFar;

  const reasonIds = [
    makeAnchorReasonId(world.time, band.id, "anchor"),
    makeAnchorReasonId(world.time, band.id, `radius:${radius.basis}`),
    makeAnchorReasonId(world.time, band.id, `decision:${chosenResidentialAction}`),
  ];

  if (anchorMemory !== undefined) {
    reasonIds.push(makeAnchorReasonId(world.time, band.id, "memory:revisited"));

    if (successfulReturn) {
      reasonIds.push(makeAnchorReasonId(world.time, band.id, "memory:successful_return"));
    }

    if (failedReturn) {
      reasonIds.push(makeAnchorReasonId(world.time, band.id, "memory:failed_warned"));
    }

    if (resumedSeasonsAnchored > 0) {
      reasonIds.push(makeAnchorReasonId(world.time, band.id, `memory:resumed:${resumedSeasonsAnchored}`));
    }
  }

  const anchor: ResidentialAnchorState = {
    bandId: band.id,
    anchorTileId: anchorTile.id,
    tetheringWaterTileId,
    startedTick,
    seasonsAnchored,
    foragingRadius: radius.radiusTiles,
    logisticalRadius,
    catchmentTileIds: catchment.map((tile) => tile.tileId),
    catchmentReturnEstimate: round2(catchmentReturnEstimate),
    catchmentDepletion: round2(catchmentDepletion),
    anchorWaterSecurity,
    dependencyLoad: round2(dependencyLoad),
    logisticalCapacity: round2(logisticalCapacity),
    holdValue,
    forayValue,
    relocateValue,
    anchorStatus,
    droughtResponse,
    reasonIds,
  };

  const foragingRadius: ForagingRadiusState = {
    bandId: band.id,
    anchorTileId: anchorTile.id,
    radiusTiles: radius.radiusTiles,
    basis: radius.basis,
    limitingFactors: radius.limitingFactors,
    reachableKnownTileIds: catchment.map((tile) => tile.tileId),
    inferredCorridorDirections: prospect?.corridorDirection === undefined ? [] : [prospect.corridorDirection],
    reasonIds: [makeAnchorReasonId(world.time, band.id, `radius:${radius.basis}`)],
  };

  const decision: AnchorDecisionComparison = {
    bandId: band.id,
    anchorTileId: anchorTile.id,
    holdValue,
    forayValue,
    relocateValue,
    anchorMarginalReturn,
    bestKnownAlternativeNet,
    relocationHysteresis,
    waterFailureGate,
    foodCollapseGate,
    betterKnownRefugeGate,
    riskGate,
    fatigueGate,
    chosenResidentialAction,
    reasonIds: [makeAnchorReasonId(world.time, band.id, `decision:${chosenResidentialAction}`)],
  };

  return { anchor, foragingRadius, decision, seasonalModeKind: seasonalMode?.mode };
}

// Relocation reluctance contributed by a held anchor — fed into the move
// candidate scoring so a whole-band relocation must clear a higher bar.
export function getAnchorRelocationHysteresis(
  context: ResidentialAnchorContext | undefined,
): number {
  if (context === undefined || context.decision.chosenResidentialAction === "residential_relocation") {
    return 0;
  }

  return context.decision.relocationHysteresis;
}

// Score bonus rewarding residence-unchanged actions (stay and logistical_probe
// are both "hold the anchor") when the anchor decision recommends not relocating
// and water is secure. Applied equally to stay and probe so it never reorders
// hold-vs-probe (probe-first is preserved); it only lifts both above relocation.
// Returns 0 when the anchor is breaking/trapped or water has failed, so a band
// still relocates when its refuge genuinely fails.
export function getAnchorHoldBonus(
  context: ResidentialAnchorContext | undefined,
): number {
  if (context === undefined || context.decision.chosenResidentialAction === "residential_relocation") {
    return 0;
  }

  const anchor = context.anchor;

  if (anchor.anchorWaterSecurity < 0.4 || anchor.anchorStatus === "breaking" || anchor.anchorStatus === "trapped") {
    return 0;
  }

  return round2(clamp01(
    anchor.holdValue * 0.5 + anchor.anchorWaterSecurity * 0.4 + context.decision.relocationHysteresis * 0.3,
  ) * 1.3);
}

export function summarizeIntraSeasonActivity(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly actionType: string;
  readonly moved: boolean;
  readonly context: ResidentialAnchorContext;
  readonly observedTileIds: readonly TileId[];
}): IntraSeasonActivitySummary {
  const { band, context, moved, actionType, observedTileIds, world } = input;
  const anchor = context.anchor;
  const residenceMode = deriveResidenceMode(
    moved,
    anchor,
    context.decision,
    context.foragingRadius.basis,
    context.seasonalModeKind,
  );
  const activityBudget = deriveActivityBudget({
    residenceMode,
    actionType,
    logisticalCapacity: anchor.logisticalCapacity,
    dependencyLoad: anchor.dependencyLoad,
  });
  const fatigueDelta = round2(clamp01(
    activityBudget.farLogisticalForays * 0.32 +
      (moved ? 0.3 : 0.08) +
      activityBudget.scoutingProbes * 0.16 -
      activityBudget.restRecovery * 0.4,
  ));
  const depletionTileIds = moved
    ? [band.position]
    : [anchor.anchorTileId, ...anchor.catchmentTileIds].slice(0, MAX_CATCHMENT_TILES);

  return {
    bandId: band.id,
    residenceMoved: moved,
    residenceMode,
    activityBudget,
    foragingRadius: anchor.foragingRadius,
    expectedFoodGain: round2(clamp01(anchor.catchmentReturnEstimate * (0.7 + activityBudget.nearAnchorForaging * 0.3))),
    expectedWaterSecurity: anchor.anchorWaterSecurity,
    fatigueDelta,
    depletionTileIds: uniqueTileIds(depletionTileIds),
    observationsAdded: observedTileIds.slice(0, MAX_CATCHMENT_TILES),
    reasonIds: [makeAnchorReasonId(world.time, band.id, `activity:${residenceMode}`)],
  };
}

// Update the band's light anchor revisitation memory after a decision is applied
// (2I.3, PART 5). Only tiles the band actually holds (residence unchanged) record
// a held season, so memories stay high-salience and bounded — this is not a camp,
// settlement, claim or stored structure, just "this tile served as a base, and how
// reliable it was." Returns the new bounded memory map, or the band's existing one
// when the band only passed through (relocated) this season.
export function updateAnchorMemories(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly context: ResidentialAnchorContext;
  readonly moved: boolean;
}): Readonly<Record<TileId, AnchorMemoryRecord>> | undefined {
  const { world, band, context, moved } = input;
  const anchor = context.anchor;
  const tileId = anchor.anchorTileId;
  const existing = band.anchorMemories;

  // Only a held season (residence unchanged) records anchoring experience here.
  // A relocation tile earns its memory next season if the band holds there.
  if (moved) {
    return existing;
  }

  const prior = existing?.[tileId];
  const failed =
    anchor.anchorStatus === "breaking" ||
    anchor.anchorStatus === "trapped" ||
    context.decision.waterFailureGate;
  const successful = !failed && anchor.anchorWaterSecurity >= 0.45;

  const anchoredSeasonCount = (prior?.anchoredSeasonCount ?? 0) + 1;
  const successfulHoldCount = (prior?.successfulHoldCount ?? 0) + (successful ? 1 : 0);
  const failedHoldCount = (prior?.failedHoldCount ?? 0) + (failed ? 1 : 0);
  const observedHolds = Math.max(1, successfulHoldCount + failedHoldCount);
  const drySeasonReliability = blendMemory(prior?.drySeasonReliability, anchor.anchorWaterSecurity);
  const averageCatchmentReturn = blendMemory(prior?.averageCatchmentReturn, anchor.catchmentReturnEstimate);
  const confidence = clamp01(
    Math.min(1, anchoredSeasonCount / 5) * 0.6 + (successfulHoldCount / observedHolds) * 0.4,
  );
  const bestSeason =
    prior?.bestSeason === undefined || anchor.catchmentReturnEstimate >= averageCatchmentReturn
      ? world.time.season
      : prior.bestSeason;

  const record: AnchorMemoryRecord = {
    tileId,
    tetheringWaterTileId: anchor.tetheringWaterTileId,
    firstAnchoredTick: prior?.firstAnchoredTick ?? world.time.tick,
    lastAnchoredTick: world.time.tick,
    anchoredSeasonCount,
    successfulHoldCount,
    failedHoldCount,
    bestSeason,
    drySeasonReliability: round2(drySeasonReliability),
    averageCatchmentReturn: round2(averageCatchmentReturn),
    confidence: round2(confidence),
    reasonIds: [makeAnchorReasonId(world.time, band.id, prior === undefined ? "memory:created" : "memory:used")],
  };

  return boundAnchorMemories({ ...(existing ?? {}), [tileId]: record });
}

function blendMemory(previous: number | undefined, current: number): number {
  return previous === undefined ? current : previous * 0.7 + current * 0.3;
}

// Keep only the most salient anchor memories so the map never grows unbounded.
function boundAnchorMemories(
  memories: Record<TileId, AnchorMemoryRecord>,
): Readonly<Record<TileId, AnchorMemoryRecord>> {
  const entries = Object.values(memories);

  if (entries.length <= MAX_ANCHOR_MEMORIES) {
    return memories;
  }

  const kept = entries
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      if (right.lastAnchoredTick !== left.lastAnchoredTick) {
        return Number(right.lastAnchoredTick) - Number(left.lastAnchoredTick);
      }

      return String(left.tileId).localeCompare(String(right.tileId));
    })
    .slice(0, MAX_ANCHOR_MEMORIES);
  const bounded: Record<TileId, AnchorMemoryRecord> = {};

  for (const record of kept) {
    bounded[record.tileId] = record;
  }

  return bounded;
}

function deriveForagingRadius(input: {
  readonly seasonalModeKind: string | undefined;
  readonly droughtSeverity: number;
  readonly dependencyLoad: number;
  readonly riskPressure: number;
  readonly anchorWaterSecurity: number;
  readonly localFood: number;
}): { radiusTiles: number; basis: ForagingRadiusBasis; limitingFactors: readonly string[] } {
  const limitingFactors: string[] = [];
  let radius = 2;
  let basis: ForagingRadiusBasis = "ordinary";

  if (input.seasonalModeKind === "wet_season_dispersal" || input.seasonalModeKind === "green_season_harvest") {
    radius += 1;
    basis = "wet_season_released";
  } else if (input.seasonalModeKind === "drought_emergency" || input.seasonalModeKind === "late_dry_refuge") {
    radius -= 1;
    basis = "water_tethered";
    limitingFactors.push("drought_water_tether");
  } else if (input.seasonalModeKind === "dry_season_consolidation") {
    basis = "water_tethered";
    limitingFactors.push("dry_season_tether");
  }

  if (input.riskPressure > 0.6) {
    radius -= 1;
    basis = "risk_contracted";
    limitingFactors.push("risk_pressure");
  }

  if (input.dependencyLoad > 0.5) {
    radius -= 1;
    limitingFactors.push("dependency_load");
  }

  // Secure water but thin local food pushes the able-bodied to range wider.
  if (basis !== "risk_contracted" && input.anchorWaterSecurity > 0.5 && input.localFood < 0.35 && input.dependencyLoad < 0.55) {
    radius += 1;
    basis = "stress_expanded";
    limitingFactors.push("water_secure_food_low");
  }

  return {
    radiusTiles: Math.max(1, Math.min(3, radius)),
    basis,
    limitingFactors,
  };
}

// Build the seasonal catchment from a bounded salient candidate set rather than
// scanning every known tile (2I.3, PART 2). Candidates: the anchor tile, a
// bounded ring-walk outward over the grid to the foraging radius (which covers
// every known tile within range while staying O(radius²) regardless of how many
// tiles the band knows), plus salient water / return / depleted places that fall
// inside the radius (preserving important water, fords and negative memory). Only
// tiles the band actually knows are scored — unknown tiles in the ring are
// dropped, so no hidden tile truth is ever read.
function gatherCatchment(
  world: WorldState,
  band: Band,
  anchorTile: Tile,
  radius: number,
  dryContext: DryMarginMobilityContext,
  contextCache: TickContextCache | undefined,
): readonly CatchmentTile[] {
  const candidateIds = collectCatchmentCandidateIds(world, band, anchorTile, radius, dryContext, contextCache);
  const tiles: CatchmentTile[] = [];

  for (const tileId of candidateIds) {
    const record = band.knowledge.observedTiles[tileId];

    if (record === undefined) {
      continue;
    }

    const tile = getTile(world, tileId);

    if (tile === undefined || tile.isAquatic) {
      continue;
    }

    const distance = gridDistance(anchorTile, tile);

    if (distance > radius) {
      continue;
    }

    const expectedReturn = clamp01(
      record.observedRichness * 0.6 +
        (record.observedWaterAccess ?? 0.3) * 0.24 +
        (record.observedSeasonalPattern?.reliability ?? 0.42) * 0.16,
    );
    const roundTripCost = clamp01(
      (distance / Math.max(1, radius + 1)) * 0.5 + ((record.observedMovementCost ?? tile.movementCost) - 0.9) * 0.16,
    );
    const depletion = getLocalUsePressureValue(band.usePressure[tileId]);
    const contribution = Math.max(0, expectedReturn - roundTripCost) * (1 - depletion);

    tiles.push({ tileId, distance, expectedReturn, roundTripCost, depletion, contribution });
  }

  return tiles
    .sort((left, right) => {
      const delta = right.contribution - left.contribution;

      return delta === 0 ? String(left.tileId).localeCompare(String(right.tileId)) : delta;
    })
    .slice(0, MAX_CATCHMENT_TILES);
}

function collectCatchmentCandidateIds(
  world: WorldState,
  band: Band,
  anchorTile: Tile,
  radius: number,
  dryContext: DryMarginMobilityContext,
  contextCache: TickContextCache | undefined,
): readonly TileId[] {
  const candidates = new Set<TileId>([anchorTile.id]);

  // Bounded ring-walk outward over the grid topology to the foraging radius.
  // Reaches every grid tile within Manhattan range (for <=8-neighbour grids)
  // while touching only O(radius^2) tiles, independent of total known tiles.
  let frontier: TileId[] = [anchorTile.id];

  for (let depth = 0; depth < radius; depth += 1) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      const tile = getTile(world, tileId);

      if (tile === undefined) {
        continue;
      }

      for (const neighborId of tile.neighbors) {
        if (!candidates.has(neighborId)) {
          candidates.add(neighborId);
          next.push(neighborId);
        }
      }
    }

    frontier = next;
  }

  // Preserve important water / fords (the tether and best known waters) and
  // salient return / depleted places even if topology missed them; the distance
  // filter in gatherCatchment keeps only those genuinely within radius.
  if (dryContext.currentWaterRefuge !== undefined) {
    candidates.add(dryContext.currentWaterRefuge.tileId);
  }

  for (const water of dryContext.bestWaterCandidates) {
    candidates.add(water.tileId);
  }

  const salient = getSalientMemorySummary(contextCache, band.id);

  if (salient !== undefined) {
    for (const tileId of salient.topReturnPlaceIds) {
      candidates.add(tileId);
    }

    for (const tileId of salient.topAnchorPlaceIds) {
      candidates.add(tileId);
    }

    for (const tileId of salient.topDepletedPlaceIds) {
      candidates.add(tileId);
    }
  }

  return [...candidates];
}

function estimateCatchmentReturn(catchment: readonly CatchmentTile[]): number {
  if (catchment.length === 0) {
    return 0;
  }

  // Mean contribution with a modest breadth bonus (diversification across a
  // wider catchment buffers single-tile depletion), capped.
  const meanContribution = catchment.reduce((sum, tile) => sum + tile.contribution, 0) / catchment.length;
  const breadthBonus = 0.8 + 0.2 * Math.min(1, catchment.length / 6);

  return clamp01(meanContribution * breadthBonus);
}

function estimateCatchmentDepletion(
  band: Band,
  anchorTileId: TileId,
  catchment: readonly CatchmentTile[],
): number {
  if (catchment.length === 0) {
    return getLocalUsePressureValue(band.usePressure[anchorTileId]);
  }

  // Weight the anchor tile's depletion a little more (it is used every season).
  const anchorDepletion = getLocalUsePressureValue(band.usePressure[anchorTileId]);
  const meanDepletion = catchment.reduce((sum, tile) => sum + tile.depletion, 0) / catchment.length;

  return clamp01(anchorDepletion * 0.4 + meanDepletion * 0.6);
}

function chooseResidentialAction(input: {
  readonly waterFailureGate: boolean;
  readonly foodCollapseGate: boolean;
  readonly betterKnownRefugeGate: boolean;
  readonly reachableAlternative: boolean;
  readonly holdValue: number;
  readonly forayValue: number;
  readonly relocateValue: number;
  readonly probeAvailable: boolean;
}): ResidentialAction {
  const breakingPressure = input.waterFailureGate || input.foodCollapseGate || input.betterKnownRefugeGate;

  if (breakingPressure && input.reachableAlternative && input.relocateValue >= input.holdValue - 0.05) {
    return "residential_relocation";
  }

  if (input.probeAvailable && input.forayValue > input.holdValue && input.forayValue >= input.relocateValue) {
    return "logistical_foray";
  }

  if (input.holdValue >= input.relocateValue) {
    return "stay_anchor";
  }

  return input.reachableAlternative ? "residential_relocation" : "stay_anchor";
}

function deriveAnchorStatus(input: {
  readonly waterFailureGate: boolean;
  readonly foodCollapseGate: boolean;
  readonly reachableAlternative: boolean;
  readonly chosenResidentialAction: ResidentialAction;
  readonly seasonalModeKind: string | undefined;
  readonly radiusBasis: ForagingRadiusBasis;
  readonly holdValue: number;
  readonly secureHoldThreshold: number;
}): AnchorStatus {
  if (input.waterFailureGate && !input.reachableAlternative) {
    return "trapped";
  }

  if (input.waterFailureGate || input.foodCollapseGate) {
    return "breaking";
  }

  if (input.chosenResidentialAction === "logistical_foray") {
    return "provisioning_out";
  }

  if (input.radiusBasis === "water_tethered" || input.radiusBasis === "risk_contracted") {
    return "contracting";
  }

  if (input.chosenResidentialAction === "stay_anchor" && input.holdValue > input.secureHoldThreshold) {
    return "secure_hold";
  }

  return "none";
}

function deriveDroughtResponse(
  seasonalModeKind: string | undefined,
  action: ResidentialAction,
): DroughtResponse {
  const dry =
    seasonalModeKind === "drought_emergency" ||
    seasonalModeKind === "late_dry_refuge" ||
    seasonalModeKind === "dry_season_consolidation";

  if (dry) {
    return action === "residential_relocation" ? "escape" : "evasion";
  }

  return action === "residential_relocation" ? "none" : "hold";
}

// Residence-mode labelling (2I.3, PART 3). A wet/green season that releases the
// water tether reads as a dispersed wet-season round — including when the
// residence actually moves, because that movement IS the seasonal dispersal, not
// a transit or a stress relocation. Stress relocations (water/food failure) are
// still distinguished, and residenceMoved stays accurate independently.
function deriveResidenceMode(
  moved: boolean,
  anchor: ResidentialAnchorState,
  decision: AnchorDecisionComparison,
  radiusBasis: ForagingRadiusBasis,
  seasonalModeKind: DryMarginSeasonalMode | undefined,
): SeasonalResidenceMode {
  // Recognise wet/green-season dispersal from the seasonal mode directly, not
  // only the radius basis (which a later stress/risk adjustment can overwrite).
  const wetDispersal =
    radiusBasis === "wet_season_released" ||
    seasonalModeKind === "wet_season_dispersal" ||
    seasonalModeKind === "green_season_harvest";

  if (moved) {
    if (decision.waterFailureGate || decision.foodCollapseGate) {
      return "stress_relocation";
    }

    return wetDispersal ? "dispersed_wet_season_round" : "residential_transit";
  }

  if (wetDispersal) {
    return "dispersed_wet_season_round";
  }

  if (anchor.droughtResponse === "evasion" || anchor.anchorStatus === "secure_hold" || anchor.anchorStatus === "contracting") {
    return "anchored_refuge";
  }

  if (anchor.foragingRadius >= 3) {
    return "dispersed_wet_season_round";
  }

  return "ordinary_foraging_base";
}

function deriveActivityBudget(input: {
  readonly residenceMode: SeasonalResidenceMode;
  readonly actionType: string;
  readonly logisticalCapacity: number;
  readonly dependencyLoad: number;
}): SeasonalActivityBudget {
  let near = 0.5;
  let far = 0.16;
  let scouting = 0.1;
  const social = 0;
  let rest = 0.1;

  if (input.residenceMode === "anchored_refuge") {
    near = 0.56;
    far = 0.16 + input.logisticalCapacity * 0.12;
    rest = 0.1 + input.dependencyLoad * 0.08;
  } else if (input.residenceMode === "dispersed_wet_season_round") {
    near = 0.42;
    far = 0.3;
    scouting = 0.16;
  } else if (input.residenceMode === "residential_transit" || input.residenceMode === "stress_relocation") {
    near = 0.3;
    far = 0.12;
    scouting = 0.12;
    rest = 0.16;
  }

  if (input.actionType === "logistical_probe") {
    far += 0.12;
    scouting += 0.14;
  } else if (input.actionType === "explore_unknown_neighbor") {
    scouting += 0.12;
  }

  far -= input.dependencyLoad * 0.08;

  return normalizeBudget({
    nearAnchorForaging: Math.max(0, near),
    farLogisticalForays: Math.max(0, far),
    scoutingProbes: Math.max(0, scouting),
    socialVisits: Math.max(0, social),
    restRecovery: Math.max(0, rest),
  });
}

function normalizeBudget(budget: SeasonalActivityBudget): SeasonalActivityBudget {
  const total =
    budget.nearAnchorForaging +
    budget.farLogisticalForays +
    budget.scoutingProbes +
    budget.socialVisits +
    budget.restRecovery;
  const safe = total <= 0 ? 1 : total;

  return {
    nearAnchorForaging: round2(budget.nearAnchorForaging / safe),
    farLogisticalForays: round2(budget.farLogisticalForays / safe),
    scoutingProbes: round2(budget.scoutingProbes / safe),
    socialVisits: round2(budget.socialVisits / safe),
    restRecovery: round2(budget.restRecovery / safe),
  };
}

function getPreviousSeasonsAnchored(band: Band, anchorTileId: TileId): number {
  const previous = band.residentialAnchor;

  if (previous === undefined || previous.anchorTileId !== anchorTileId) {
    return 0;
  }

  return previous.seasonsAnchored + 1;
}

function getPreviousStartedTick(band: Band, anchorTileId: TileId, time: WorldTime): TickNumber {
  const previous = band.residentialAnchor;

  return previous !== undefined && previous.anchorTileId === anchorTileId ? previous.startedTick : time.tick;
}

function gridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function uniqueTileIds(tileIds: readonly TileId[]): readonly TileId[] {
  return [...new Set(tileIds)];
}

function makeAnchorReasonId(time: WorldTime, bandId: string, suffix: string): ReasonId {
  return `reason:${bandId}:${time.tick}:anchor:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
