// Plant physical patch ecology (checkpoint ECO-BIOME-1).
//
// WHY: plantPatches.ts already defines a RICH, causal plant taxonomy
// (PLANT_CLASS_PROFILES: fruit/nuts/tubers/grain/greens/wetland/aquatic +
// fiber/fuel/medicinal, with mast/pulse/window patterns, processing need,
// storage, fallback rank, regrowth profiles, lifecycle/recovery states). But it
// was wired only into KNOWLEDGE/SCOUTING — gathering never depleted a patch
// (`humanUseHistory: { useCount: 0, status: "future" }`), patches were never
// persisted, and plant SUPPORT still came from the abstract `generic_plant_food`
// resource-class share + generic M0.14 tile wear. So a mast year, an exhausted
// tuber ground, and an emergency fallback root behaved identically in the
// economy.
//
// WHAT: the plant mirror of faunaStock.ts. A SPARSE, bounded human-depletion
// overlay (`world.plantPatchState`) on the existing plant-patch geography, with:
//   * gathering-trip + camp/occupation depletion;
//   * class-specific recovery (fast_wetland fast, multi_year_mast / slow_woody /
//     belowground_reserve slow);
//   * a bounded plant support multiplier in carryingCapacity (coupled ONLY to
//     `generic_plant_food`, so it never double-counts fauna's aquatic_food /
//     animal_food, and materials/fuel/reeds stay 0 calories);
//   * stock-grounded gathering return + seasonal-pulse signal for trips.
//
// We do NOT persist full PlantPatch objects per tile (that would be massive). We
// reuse `derivePlantPatchesForTile` (memoized per tile+season) for the static
// food-patch presence + natural seasonality, and store ONLY sparse human
// depletion deviations, exactly like M0.14 tileDepletion / faunaStocks.
//
// ANTI-OMNISCIENCE: depletion is physical truth, experienced through realized
// support and through what a band OBSERVES when present/gathering/scouting —
// never a remote read. Plant knowledge stays in the band's own patch memory /
// plant scout hints (plantUseEligibility / derivePlantScoutObservationHint).
//
// HARD SCOPE LOCK: no storage, no tending/cultivation, no agriculture, no
// per-tile patch object persistence. No unseeded randomness, no any, no UI
// imports. Deterministic.

import { getSharedCatchmentIndex } from "./sharedCatchment";
import type { TickContextCache } from "./contextCache";
import {
  derivePlantPatchesForTile,
  getPlantClassProfile,
  type PlantAbundanceTrend,
  type PlantClassId,
  type PlantFallbackRole,
  type PlantLifecycleState,
  type PlantPatchAvailability,
  type PlantSafetyRisk,
} from "./plantPatches";
import type { ResourceClassContribution } from "./resourceClasses";
import type { ReasonId, Season, TickNumber, TileId, WorldTime } from "../core/types";
import type { Tile, WorldState } from "../world/types";

// Sparse, persisted human-use depletion of one plant patch (keyed by patchId).
// Absent entry ⇒ baseline (no human depletion). `classId` is stored so the
// per-season advance can read the class regrowth rate without re-deriving.
export interface PlantPatchState {
  readonly depletion: number; // [0, 1] — fraction of natural abundance removed by use
  readonly classId: PlantClassId;
  readonly lastUseTick: TickNumber;
  readonly cumulativeUse: number; // debug only
}

// Per-tile food-patch summary used by the support/return path (cheap, memoized).
interface PlantFoodPatch {
  readonly patchId: string;
  readonly classId: PlantClassId;
  readonly baseAbundance: number;
  readonly naturalAvailability: number; // 0..1 this season (from lifecycle), pre human use
  readonly seasonalAvailability: PlantPatchAvailability;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly lifecycleState: PlantLifecycleState;
  readonly depletionSensitivity: number;
  readonly regrowthRate: number;
  readonly laborCost: number;
  readonly seasonalPulseStrength: number;
  readonly fallbackRole: PlantFallbackRole;
  readonly fallbackRank: number;
  readonly safetyRisk: PlantSafetyRisk;
}

export interface PlantTileSupportEffect {
  readonly covered: boolean;
  readonly plantFoodFactor: number; // [PLANT_FACTOR_FLOOR, 1]; 1 = healthy, lower = overharvested
  readonly plantSupportLoss: number; // support fraction removed
  readonly plantMultiplier: number; // [1 - PLANT_LOSS_CAP, 1]
  readonly processingDrag: number; // 0..PROCESSING_DRAG_CAP — labor drag from processing-heavy classes
}

export interface PlantGatherPatchTraceBase {
  readonly patchId: string;
  readonly plantClassId: PlantClassId;
  readonly seasonalAvailability: PlantPatchAvailability;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly lifecycleState: PlantLifecycleState;
  readonly expectedReturnFactor: number;
  readonly currentDepletion: number;
  readonly pressure: number;
  readonly recoveryRate: number;
  readonly fallbackRole: PlantFallbackRole;
  readonly fallbackRank: number;
  readonly laborCost: number;
  readonly safetyRisk: PlantSafetyRisk;
  readonly rawSource: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface PlantFoodHarvestResolution {
  readonly world: WorldState;
  readonly sourceId?: string;
  readonly sourceClass?: string;
  readonly sourceFound: boolean;
  readonly patchId?: string;
  readonly plantClassId?: PlantClassId;
  readonly physicalAvailability: number;
  readonly harvestedAmount: number;
  readonly depletionApplied: number;
  readonly processingLossRate: number;
  readonly failureReason?: "activity_failed" | "physical_source_absent" | "physically_exhausted";
}

// --- tuning constants (conservative; plants are the dominant food, keep gentle) ---

const PLANT_ABUNDANCE_FLOOR = 0.2; // a patch never fully disappears (fallback floor)
const PLANT_FACTOR_FLOOR = 0.58;
const PLANT_LOSS_CAP = 0.1; // max fraction of a tile's food support plant depletion can remove
const PROCESSING_DRAG_CAP = 0.05; // bounded per-capita labor drag from processing-heavy food

const GATHER_DEPLETION_PULL = 0.2; // per-gather pull (× sensitivity × intensity)
const GENERAL_PRESSURE_WEIGHT = 0.55; // camp/occupation pressure on plant patches
const CLAIM_PRESSURE_NORM = 4; // gentler general (occupation) depletion than fauna
const DEPLETION_STRENGTH = 0.5;
const DYNAMIC_DROP_EPSILON = 0.004; // drop entries within this of baseline (must stay small)

// Seasonal-pulse return shaping (trip returns only — never the support multiplier).
const PULSE_RETURN_BONUS = 0.4;
const PLANT_HARVEST_SUPPORT_SCALE = 2.4;

// --- per-tile food-patch geography (memoized by tile reference + season) ---

const tilePatchMemo = new WeakMap<Tile, Map<Season, readonly PlantFoodPatch[]>>();

function plantFoodPatchesAt(tile: Tile, time: WorldTime): readonly PlantFoodPatch[] {
  let bySeasonMemo = tilePatchMemo.get(tile);

  if (bySeasonMemo === undefined) {
    bySeasonMemo = new Map();
    tilePatchMemo.set(tile, bySeasonMemo);
  }

  const cached = bySeasonMemo.get(time.season);

  if (cached !== undefined) {
    return cached;
  }

  const patches = derivePlantPatchesForTile(tile, time);
  const foodPatches: PlantFoodPatch[] = [];

  for (const patch of patches) {
    const profile = getPlantClassProfile(patch.plantClassId);

    // Only generic_plant_food-linked FOOD classes couple to plant support. aquatic
    // plants belong to aquatic_food (fauna owns that multiplier); materials/medicinal
    // are NOT calories and must never reduce/contribute food support here.
    if (profile.domain !== "food" || profile.linkedResourceClassId !== "generic_plant_food") {
      continue;
    }

    foodPatches.push({
      patchId: String(patch.patchId),
      classId: patch.plantClassId,
      baseAbundance: patch.baseAbundance,
      naturalAvailability: patch.currentAbundance,
      seasonalAvailability: patch.currentSeasonalAvailability,
      abundanceTrend: patch.abundanceTrend,
      lifecycleState: patch.lifecycleState,
      depletionSensitivity: patch.depletionSensitivity,
      regrowthRate: patch.regrowthRate,
      laborCost: patch.laborCost,
      seasonalPulseStrength: patch.seasonalPulseStrength,
      fallbackRole: patch.fallbackRole,
      fallbackRank: patch.fallbackRank,
      safetyRisk: patch.safetyRisk,
    });
  }

  bySeasonMemo.set(time.season, foodPatches);

  return foodPatches;
}

function getPlantPatchState(world: WorldState, patchId: string): PlantPatchState | undefined {
  return world.plantPatchState?.[patchId];
}

// Canonical plant harvest owner. This is the only production path that turns a
// plant patch into human food: find a real edible patch, bound the take by its
// current seasonal/depleted availability, and persist the exact physical draw.
export function resolvePlantFoodHarvest(
  world: WorldState,
  tile: Tile,
  time: WorldTime,
  requestedAmount: number,
  activityEligible: boolean,
): PlantFoodHarvestResolution {
  const patches = plantFoodPatchesAt(tile, time);
  if (patches.length === 0) {
    return {
      world,
      sourceFound: false,
      physicalAvailability: 0,
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate: 0,
      failureReason: "physical_source_absent",
    };
  }

  let target = patches[0];
  let targetAvailability = plantHarvestAvailability(world, target);
  for (const patch of patches.slice(1)) {
    const availability = plantHarvestAvailability(world, patch);
    if (availability > targetAvailability || (availability === targetAvailability && patch.patchId < target.patchId)) {
      target = patch;
      targetAvailability = availability;
    }
  }

  if (!activityEligible) {
    return {
      world,
      sourceId: target.patchId,
      sourceClass: target.classId,
      sourceFound: true,
      patchId: target.patchId,
      plantClassId: target.classId,
      physicalAvailability: round4(targetAvailability),
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate: processingLossRate(target),
      failureReason: "activity_failed",
    };
  }

  if (targetAvailability <= 0.0001) {
    return {
      world,
      sourceId: target.patchId,
      sourceClass: target.classId,
      sourceFound: true,
      patchId: target.patchId,
      plantClassId: target.classId,
      physicalAvailability: 0,
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate: processingLossRate(target),
      failureReason: "physically_exhausted",
    };
  }

  const harvestedAmount = Math.min(Math.max(0, requestedAmount), targetAvailability);
  if (harvestedAmount <= 0) {
    return {
      world,
      sourceId: target.patchId,
      sourceClass: target.classId,
      sourceFound: true,
      patchId: target.patchId,
      plantClassId: target.classId,
      physicalAvailability: round4(targetAvailability),
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate: processingLossRate(target),
      failureReason: "activity_failed",
    };
  }

  const previous = world.plantPatchState ?? {};
  const state = previous[target.patchId];
  const currentDepletion = state?.depletion ?? 0;
  const fullSeasonalAvailability = Math.max(
    0.0001,
    target.baseAbundance * target.naturalAvailability * PLANT_HARVEST_SUPPORT_SCALE,
  );
  const nextDepletion = clamp01(currentDepletion + harvestedAmount / fullSeasonalAvailability);
  const nextWorld: WorldState = {
    ...world,
    plantPatchState: {
      ...previous,
      [target.patchId]: {
        depletion: round4(nextDepletion),
        classId: target.classId,
        lastUseTick: time.tick,
        cumulativeUse: round4((state?.cumulativeUse ?? 0) + harvestedAmount),
      },
    },
  };

  return {
    world: nextWorld,
    sourceId: target.patchId,
    sourceClass: target.classId,
    sourceFound: true,
    patchId: target.patchId,
    plantClassId: target.classId,
    physicalAvailability: round4(targetAvailability),
    harvestedAmount: round4(harvestedAmount),
    depletionApplied: round4(harvestedAmount),
    processingLossRate: processingLossRate(target),
  };
}

function plantHarvestAvailability(world: WorldState, patch: PlantFoodPatch): number {
  const depletion = getPlantPatchState(world, patch.patchId)?.depletion ?? 0;
  return Math.max(
    0,
    patch.baseAbundance * patch.naturalAvailability * (1 - depletion) * PLANT_HARVEST_SUPPORT_SCALE,
  );
}

function processingLossRate(patch: PlantFoodPatch): number {
  return clamp(patch.laborCost * 0.12 + (patch.safetyRisk === "high" ? 0.12 : patch.safetyRisk === "moderate" ? 0.05 : 0), 0, 0.24);
}

// --- per-tile support effect (consumed by carryingCapacity) ---

export function derivePlantTileSupportEffect(
  world: WorldState,
  tile: Tile,
  time: WorldTime,
  contributionByClass: readonly ResourceClassContribution[],
): PlantTileSupportEffect {
  const patches = plantFoodPatchesAt(tile, time);
  const plantContribution = foodContribution(contributionByClass, "generic_plant_food");
  const totalFood = totalFoodContribution(contributionByClass);

  if (patches.length === 0 || plantContribution <= 0 || totalFood <= 0) {
    return { covered: false, plantFoodFactor: 1, plantSupportLoss: 0, plantMultiplier: 1, processingDrag: 0 };
  }

  // Realized plant-food factor = baseAbundance-weighted (1 - human depletion) over
  // the tile's generic_plant_food patches. Healthy/unused ⇒ 1 (no loss). Seasonality
  // is already carried by the resource-class seasonal modifier, so the SUPPORT
  // multiplier carries only the NEW physical human-depletion effect (bounded).
  let weightSum = 0;
  let weightedFactor = 0;
  let dragWeight = 0;

  for (const patch of patches) {
    const state = getPlantPatchState(world, patch.patchId);
    const depletion = state?.depletion ?? 0;
    const weight = Math.max(0.05, patch.baseAbundance);
    weightSum += weight;
    weightedFactor += weight * (1 - depletion);
    // Processing-heavy / high-labor classes (tubers, grain, mast) carry a small
    // labor drag proportional to their share — useful but costly, never free.
    dragWeight += weight * patch.laborCost;
  }

  const plantFoodFactor = clamp(weightSum <= 0 ? 1 : weightedFactor / weightSum, PLANT_FACTOR_FLOOR, 1);
  const lossFraction = clamp((plantContribution * (1 - plantFoodFactor)) / totalFood, 0, PLANT_LOSS_CAP);
  const processingDrag = clamp((dragWeight / weightSum) * (plantContribution / totalFood) * 0.12, 0, PROCESSING_DRAG_CAP);

  return {
    covered: true,
    plantFoodFactor: round3(plantFoodFactor),
    plantSupportLoss: round3(plantContribution * (1 - plantFoodFactor)),
    plantMultiplier: round3(1 - lossFraction),
    processingDrag: round3(processingDrag),
  };
}

function foodContribution(contributionByClass: readonly ResourceClassContribution[], classId: string): number {
  for (const entry of contributionByClass) {
    if (entry.classId === classId) {
      return entry.supportContribution;
    }
  }

  return 0;
}

function totalFoodContribution(contributionByClass: readonly ResourceClassContribution[]): number {
  let sum = 0;

  for (const entry of contributionByClass) {
    if (entry.domain === "food") {
      sum += entry.supportContribution;
    }
  }

  return sum;
}

// --- gathering return + seasonal pulse (anti-omniscient experience signals) ---

// Stock-grounded multiplier on a gathering trip's RETURN value. >1 only on a
// seasonal ripening/mast pulse; lower when the patch is overharvested. Returns 1
// when the target tile hosts no generic_plant_food patch (generic placeholder).
export function derivePlantGatherReturnFactor(
  world: WorldState,
  tile: Tile,
  time: WorldTime,
): number {
  const patches = plantFoodPatchesAt(tile, time);

  if (patches.length === 0) {
    return 1;
  }

  let best = 0;

  for (const patch of patches) {
    const state = getPlantPatchState(world, patch.patchId);
    const depletion = state?.depletion ?? 0;
    const pulse = 1 + patch.seasonalPulseStrength * PULSE_RETURN_BONUS;
    const factor = patch.naturalAvailability * (1 - depletion) * pulse;
    best = Math.max(best, factor);
  }

  return clamp(best, PLANT_ABUNDANCE_FLOOR, 1.6);
}

export function derivePlantGatherPatchTrace(
  world: WorldState,
  tile: Tile,
  time: WorldTime,
): PlantGatherPatchTraceBase | undefined {
  const patches = plantFoodPatchesAt(tile, time);

  if (patches.length === 0) {
    return undefined;
  }

  let target = patches[0];
  for (const patch of patches) {
    if (patch.baseAbundance > target.baseAbundance) {
      target = patch;
    }
  }

  const state = getPlantPatchState(world, target.patchId);
  const currentDepletion = state?.depletion ?? 0;
  const expectedReturnFactor = clamp(
    target.naturalAvailability * (1 - currentDepletion) * (1 + target.seasonalPulseStrength * PULSE_RETURN_BONUS),
    PLANT_ABUNDANCE_FLOOR,
    1.6,
  );
  const pressure = clamp01(currentDepletion * target.depletionSensitivity + (target.laborCost >= 0.58 ? 0.04 : 0));

  return {
    patchId: target.patchId,
    plantClassId: target.classId,
    seasonalAvailability: target.seasonalAvailability,
    abundanceTrend: target.abundanceTrend,
    lifecycleState: target.lifecycleState,
    expectedReturnFactor: round3(expectedReturnFactor),
    currentDepletion: round3(currentDepletion),
    pressure: round3(pressure),
    recoveryRate: round3(target.regrowthRate),
    fallbackRole: target.fallbackRole,
    fallbackRank: round3(target.fallbackRank),
    laborCost: round3(target.laborCost),
    safetyRisk: target.safetyRisk,
    rawSource: "plantStock.derivePlantGatherPatchTrace from band-targeted plant activity tile",
    reasonIds: [`reason:plant-gather-trace:${tile.id}:${target.patchId}:${time.tick}` as ReasonId],
  };
}

// --- in-season gathering depletion (physical truth write) ---

export function applyPlantGatherDepletion(
  world: WorldState,
  tile: Tile,
  time: WorldTime,
  intensity: number,
): WorldState {
  const patches = plantFoodPatchesAt(tile, time);

  if (patches.length === 0) {
    return world;
  }

  const clampedIntensity = clamp01(intensity);

  if (clampedIntensity <= 0) {
    return world;
  }

  // Deplete the most abundant generic_plant_food patch at the tile (the one a
  // gathering party would actually work).
  let target = patches[0];
  for (const patch of patches) {
    if (patch.baseAbundance > target.baseAbundance) {
      target = patch;
    }
  }

  const previous = world.plantPatchState ?? {};
  const state = previous[target.patchId];
  const depletion = state?.depletion ?? 0;
  const pull = clampedIntensity * target.depletionSensitivity * GATHER_DEPLETION_PULL;
  const nextDepletion = clamp01(depletion + pull * (1 - depletion));

  return {
    ...world,
    plantPatchState: {
      ...previous,
      [target.patchId]: {
        depletion: round4(nextDepletion),
        classId: target.classId,
        lastUseTick: time.tick,
        cumulativeUse: round4((state?.cumulativeUse ?? 0) + clampedIntensity),
      },
    },
  };
}

// --- seasonal advance (once per season, like advanceTileDepletion / fauna) ---

export function advancePlantPatchState(world: WorldState, cache: TickContextCache): WorldState {
  const previous = world.plantPatchState ?? {};
  const index = getSharedCatchmentIndex(world, cache);
  const tick = world.time.tick;
  const next: Record<string, PlantPatchState> = {};
  const touched = new Set<string>(Object.keys(previous));

  // General camp/occupation pressure: tiles being foraged this season deplete
  // their most-abundant generic_plant_food patch. Sparse — only claimed tiles.
  for (const [tileId, claim] of index.claimsByTileId) {
    const tile = world.tiles[tileId];

    if (tile === undefined) {
      continue;
    }

    const patches = plantFoodPatchesAt(tile, world.time);

    if (patches.length === 0) {
      continue;
    }

    let target = patches[0];
    for (const patch of patches) {
      if (patch.baseAbundance > target.baseAbundance) {
        target = patch;
      }
    }

    const generalPressure = clamp01((claim.totalWeight / CLAIM_PRESSURE_NORM)) * target.depletionSensitivity;
    const state = previous[target.patchId];
    const depletion = state?.depletion ?? 0;
    const gain = generalPressure * GENERAL_PRESSURE_WEIGHT * DEPLETION_STRENGTH * (1 - depletion);
    const recovery = target.regrowthRate * depletion;
    const nextDepletion = clamp01(depletion + gain - recovery);

    if (nextDepletion >= DYNAMIC_DROP_EPSILON) {
      next[target.patchId] = {
        depletion: round4(nextDepletion),
        classId: target.classId,
        lastUseTick: generalPressure > 0.02 ? tick : (state?.lastUseTick ?? tick),
        cumulativeUse: round4((state?.cumulativeUse ?? 0) + generalPressure),
      };
    }

    touched.delete(target.patchId);
  }

  // Recover patches not pressured this season (gathering-trip-depleted ones too).
  for (const patchId of touched) {
    const state = previous[patchId];

    if (state === undefined) {
      continue;
    }

    const regrowthRate = getRegrowthRateForClass(state.classId);
    const nextDepletion = clamp01(state.depletion - regrowthRate * state.depletion - regrowthRate * 0.04);

    if (nextDepletion >= DYNAMIC_DROP_EPSILON) {
      next[patchId] = { ...state, depletion: round4(nextDepletion) };
    }
  }

  return { ...world, plantPatchState: next as Readonly<Record<string, PlantPatchState>> };
}

function getRegrowthRateForClass(classId: PlantClassId): number {
  // Mirror plantPatches.getRegrowthRate via the class profile's regrowth field.
  const profile = getPlantClassProfile(classId);

  switch (profile.regrowthProfile) {
    case "fast_wetland":
      return 0.34;
    case "seasonal_annual":
      return 0.26;
    case "belowground_reserve":
      return 0.16;
    case "multi_year_mast":
      return 0.12;
    case "slow_woody":
      return 0.14;
    default:
      return 0.2;
  }
}

// --- audit / debug summary ---

export interface PlantPatchStateSummary {
  readonly dynamicRecords: number;
  readonly byClass: Readonly<Record<string, number>>;
  readonly meanDepletion: number;
  readonly maxDepletion: number;
  readonly overharvestedPatches: number; // depletion > 0.3
  readonly heavilyOverharvestedPatches: number; // depletion > 0.55
}

export function summarizePlantPatchState(world: WorldState): PlantPatchStateSummary {
  const state = world.plantPatchState ?? {};
  const entries = Object.values(state);
  const byClass: Record<string, number> = {};
  let depletionSum = 0;
  let maxDepletion = 0;
  let over = 0;
  let heavy = 0;

  for (const entry of entries) {
    byClass[entry.classId] = (byClass[entry.classId] ?? 0) + 1;
    depletionSum += entry.depletion;
    maxDepletion = Math.max(maxDepletion, entry.depletion);

    if (entry.depletion > 0.3) {
      over += 1;
    }

    if (entry.depletion > 0.55) {
      heavy += 1;
    }
  }

  return {
    dynamicRecords: entries.length,
    byClass,
    meanDepletion: entries.length === 0 ? 0 : round3(depletionSum / entries.length),
    maxDepletion: round3(maxDepletion),
    overharvestedPatches: over,
    heavilyOverharvestedPatches: heavy,
  };
}

// --- numeric helpers ---

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
