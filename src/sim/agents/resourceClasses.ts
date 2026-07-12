import type { BaseHabitatPotential } from "./types";
import type { NormalizedIntensity } from "../rules/types";
import type { ReasonId, Season, TickNumber, TileId, WorldTime } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";

// Resource Class Framework (checkpoint 2K).
//
// Replaces the single fungible "food/yield" scalar with a TYPED, deterministic
// decomposition of the band's existing habitat potential into a small fixed set of
// abstract resource classes. This is a SUBSTRATE + DEBUG layer only: it explains and
// decomposes the yield behaviour already uses (the food-domain support contributions
// sum to the existing base potential), it does not introduce plants, fauna, species,
// or per-resource ecology. Everything is derived from the band's OWN observed record
// (anti-omniscient, same abstraction as current habitat knowledge) and is bounded to
// a fixed 8-class table, so it is cheap and cache-friendly.

export type ResourceDomain = "food" | "material" | "water" | "medicinal_risk";

export type ResourceClassId =
  | "generic_plant_food"
  | "aquatic_food"
  | "animal_food"
  | "fallback_food"
  | "fiber_material"
  | "fuel_material"
  | "medicinal_or_toxic"
  | "water_resource";

export type ResourceFunctionalKind =
  | "aquatic_fish_like_support"
  | "wetland_plants"
  | "roots_tubers_fallback"
  | "nuts_mast_seeds"
  | "berries_fruits_seasonal"
  | "greens_low_density_forage"
  | "reeds_fiber_fuel"
  | "water_reliability_support"
  | "generic_animal_hunting_placeholder";

// Static, abstract class definitions — categories and contribution SLOTS, not named
// species. The numeric properties are framework placeholders that later ecology
// (plant patches, fauna stocks, storage, toxicity) will refine.
export interface ResourceClassDefinition {
  readonly id: ResourceClassId;
  readonly domain: ResourceDomain;
  // Weight of this class when decomposing food-domain support.
  readonly baseAbundanceContribution: number;
  readonly reliability: NormalizedIntensity;
  readonly seasonalSensitivity: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly accessCostModifier: NormalizedIntensity;
  readonly riskPlaceholder: NormalizedIntensity;
  readonly depletionSensitivity: NormalizedIntensity;
  readonly recoveryPlaceholder: NormalizedIntensity;
  readonly storagePotentialPlaceholder: NormalizedIntensity;
  // 1 = as knowable as terrain today; <1 = will need Resource Knowledge State (2K.1).
  readonly knowledgeVisibilityPlaceholder: NormalizedIntensity;
  readonly functionalKinds: readonly ResourceFunctionalKind[];
  readonly finitePatchiness: NormalizedIntensity;
  readonly pressureLossWeight: NormalizedIntensity;
  readonly regrowthRate: NormalizedIntensity;
  readonly debugLabel: string;
}

export const RESOURCE_CLASSES: readonly ResourceClassDefinition[] = [
  { id: "generic_plant_food", domain: "food", baseAbundanceContribution: 0.34, reliability: 0.6, seasonalSensitivity: 0.6, laborCost: 0.4, accessCostModifier: 0.3, riskPlaceholder: 0.1, depletionSensitivity: 0.58, recoveryPlaceholder: 0.5, storagePotentialPlaceholder: 0.45, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["wetland_plants", "nuts_mast_seeds", "berries_fruits_seasonal", "greens_low_density_forage"], finitePatchiness: 0.68, pressureLossWeight: 0.56, regrowthRate: 0.56, debugLabel: "plant food" },
  { id: "aquatic_food", domain: "food", baseAbundanceContribution: 0.26, reliability: 0.66, seasonalSensitivity: 0.5, laborCost: 0.5, accessCostModifier: 0.4, riskPlaceholder: 0.14, depletionSensitivity: 0.44, recoveryPlaceholder: 0.6, storagePotentialPlaceholder: 0.4, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["aquatic_fish_like_support", "wetland_plants"], finitePatchiness: 0.52, pressureLossWeight: 0.48, regrowthRate: 0.66, debugLabel: "aquatic food (fish-like abstract support)" },
  { id: "animal_food", domain: "food", baseAbundanceContribution: 0.16, reliability: 0.42, seasonalSensitivity: 0.55, laborCost: 0.74, accessCostModifier: 0.6, riskPlaceholder: 0.32, depletionSensitivity: 0.46, recoveryPlaceholder: 0.45, storagePotentialPlaceholder: 0.55, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["generic_animal_hunting_placeholder"], finitePatchiness: 0.74, pressureLossWeight: 0.32, regrowthRate: 0.4, debugLabel: "animal-food opportunity projection; current calories require a physical fauna receipt" },
  { id: "fallback_food", domain: "food", baseAbundanceContribution: 0.12, reliability: 0.78, seasonalSensitivity: 0.3, laborCost: 0.62, accessCostModifier: 0.35, riskPlaceholder: 0.2, depletionSensitivity: 0.3, recoveryPlaceholder: 0.7, storagePotentialPlaceholder: 0.5, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["roots_tubers_fallback", "greens_low_density_forage"], finitePatchiness: 0.42, pressureLossWeight: 0.3, regrowthRate: 0.76, debugLabel: "roots / fallback food" },
  { id: "fiber_material", domain: "material", baseAbundanceContribution: 0, reliability: 0.7, seasonalSensitivity: 0.4, laborCost: 0.45, accessCostModifier: 0.35, riskPlaceholder: 0.08, depletionSensitivity: 0.35, recoveryPlaceholder: 0.6, storagePotentialPlaceholder: 0.7, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["reeds_fiber_fuel"], finitePatchiness: 0.5, pressureLossWeight: 0.18, regrowthRate: 0.62, debugLabel: "fiber material" },
  { id: "fuel_material", domain: "material", baseAbundanceContribution: 0, reliability: 0.72, seasonalSensitivity: 0.35, laborCost: 0.5, accessCostModifier: 0.4, riskPlaceholder: 0.12, depletionSensitivity: 0.45, recoveryPlaceholder: 0.55, storagePotentialPlaceholder: 0.6, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["reeds_fiber_fuel"], finitePatchiness: 0.58, pressureLossWeight: 0.16, regrowthRate: 0.54, debugLabel: "fuel material" },
  { id: "medicinal_or_toxic", domain: "medicinal_risk", baseAbundanceContribution: 0, reliability: 0.5, seasonalSensitivity: 0.5, laborCost: 0.5, accessCostModifier: 0.4, riskPlaceholder: 0.55, depletionSensitivity: 0.4, recoveryPlaceholder: 0.5, storagePotentialPlaceholder: 0.4, knowledgeVisibilityPlaceholder: 0.6, functionalKinds: [], finitePatchiness: 0.64, pressureLossWeight: 0.08, regrowthRate: 0.5, debugLabel: "medicinal / toxic (placeholder)" },
  { id: "water_resource", domain: "water", baseAbundanceContribution: 0.12, reliability: 0.74, seasonalSensitivity: 0.45, laborCost: 0.2, accessCostModifier: 0.25, riskPlaceholder: 0.12, depletionSensitivity: 0.22, recoveryPlaceholder: 0.8, storagePotentialPlaceholder: 0.2, knowledgeVisibilityPlaceholder: 1, functionalKinds: ["water_reliability_support"], finitePatchiness: 0.28, pressureLossWeight: 0.16, regrowthRate: 0.84, debugLabel: "water reliability / water-adjacent support" },
];

const RESOURCE_CLASS_BY_ID = new Map<ResourceClassId, ResourceClassDefinition>(
  RESOURCE_CLASSES.map((definition) => [definition.id, definition]),
);

export interface ResourceClassContribution {
  readonly classId: ResourceClassId;
  readonly domain: ResourceDomain;
  // Derived presence of this class in the tile, from the band's observed signals.
  readonly availability: NormalizedIntensity;
  // Share of food-domain support attributed to this class (0 for non-food domains).
  readonly supportContribution: NormalizedIntensity;
  readonly reliability: NormalizedIntensity;
  readonly seasonalModifier: NormalizedIntensity;
  readonly riskPlaceholder: NormalizedIntensity;
  // Conservative resource-specific pressure slot (decomposed from existing pressure).
  readonly pressure: NormalizedIntensity;
}

export interface ResourceClassPressureEffect {
  readonly classId: ResourceClassId;
  readonly domain: ResourceDomain;
  readonly supportContribution: NormalizedIntensity;
  readonly pressure: NormalizedIntensity;
  readonly pressureLoss: NormalizedIntensity;
  readonly reliability: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly depletionSensitivity: NormalizedIntensity;
  readonly regrowthRate: NormalizedIntensity;
  readonly functionalKinds: readonly ResourceFunctionalKind[];
}

export interface ResourceClassAvailabilitySummary {
  readonly tileId: TileId;
  readonly season: Season;
  readonly contributionByClass: readonly ResourceClassContribution[];
  readonly dominantClass: ResourceClassId;
  readonly resourceDiversity: NormalizedIntensity;
  // Sum of food-domain support contributions. By construction ~= the base potential
  // behaviour already uses, so classes DECOMPOSE the yield rather than replace it.
  readonly totalSupportFromResources: NormalizedIntensity;
  // Food-domain classes whose availability is meaningfully below the dominant class.
  readonly limitingClassFlags: readonly ResourceClassId[];
  readonly sourceReasonId: ReasonId;
}

interface ResourcePressureInputs {
  readonly localUsePressure: number;
  readonly sharedCatchmentPressure: number;
  readonly crowding: number;
}

// Memoized by record snapshot + tick: the availability decomposition is a pure
// function of the band's observed record + the derived base potential + season, all
// stable within a tick. Mirrors deriveBaseHabitatPotential's cache guard so the
// 8-class derivation runs once per record per tick across the three context passes.
const availabilityMemo = new WeakMap<
  KnownTileRecord,
  { readonly tick: TickNumber; readonly tileId: TileId; readonly value: ResourceClassAvailabilitySummary }
>();

export function deriveResourceClassAvailability(
  base: BaseHabitatPotential,
  record: KnownTileRecord,
  time: WorldTime,
): ResourceClassAvailabilitySummary {
  const cached = availabilityMemo.get(record);

  if (cached !== undefined && cached.tick === time.tick && cached.tileId === base.tileId) {
    return cached.value;
  }

  const value = computeResourceClassAvailability(base, record, time);
  availabilityMemo.set(record, { tick: time.tick, tileId: base.tileId, value });

  return value;
}

function computeResourceClassAvailability(
  base: BaseHabitatPotential,
  record: KnownTileRecord,
  time: WorldTime,
): ResourceClassAvailabilitySummary {
  const foraging = base.foragingPotential;
  const aquatic = base.aquaticPotential;
  const plant = base.plantPotential;
  const water = base.waterPotential;
  const diversity = base.resourceDiversity;
  const reliability = clamp01(record.observedSeasonalPattern?.reliability ?? 0.46);
  const risk = clamp01(record.observedRisk ?? 0.3);

  // Abstract, deterministic per-class availability from the band's own observed
  // signals — broad habitat character, not named foods.
  const availabilityById: Record<ResourceClassId, number> = {
    generic_plant_food: clamp01(plant * 0.7 + foraging * 0.3),
    aquatic_food: clamp01(aquatic * 0.95 + water * 0.08),
    animal_food: clamp01(foraging * 0.5 + diversity * 0.18),
    fallback_food: clamp01(foraging * 0.28 + (1 - reliability) * 0.34 + 0.08),
    fiber_material: clamp01(aquatic * 0.4 + water * 0.28 + plant * 0.2),
    fuel_material: clamp01(plant * 0.5 + foraging * 0.22),
    medicinal_or_toxic: clamp01(diversity * 0.34 + risk * 0.22),
    water_resource: clamp01(water),
  };

  // Food-domain support decomposes the existing base potential: weight each food
  // class by availability x baseAbundanceContribution x seasonal reliability, then
  // normalise the food shares to sum to the base potential behaviour already uses.
  const basePotential = clamp01(
    base.foragingPotential * 0.5 + base.aquaticPotential * 0.22 + base.plantPotential * 0.16 + base.waterPotential * 0.12,
  );
  const seasonModifierById: Record<ResourceClassId, number> = {} as Record<ResourceClassId, number>;
  let foodWeightTotal = 0;

  for (const definition of RESOURCE_CLASSES) {
    const seasonModifier = getSeasonalModifier(definition, record, time.season);
    seasonModifierById[definition.id] = seasonModifier;

    if (definition.domain === "food") {
      foodWeightTotal += availabilityById[definition.id] * definition.baseAbundanceContribution * seasonModifier;
    }
  }

  const supportScale = foodWeightTotal > 0 ? basePotential / foodWeightTotal : 0;
  const contributionByClass: ResourceClassContribution[] = [];
  let dominantClass: ResourceClassId = "fallback_food";
  let dominantSupport = -1;
  let dominantFoodAvailability = 0;

  for (const definition of RESOURCE_CLASSES) {
    const availability = availabilityById[definition.id];
    const seasonalModifier = seasonModifierById[definition.id];
    const supportContribution = definition.domain === "food"
      ? round2(clamp01(availability * definition.baseAbundanceContribution * seasonalModifier * supportScale))
      : 0;

    contributionByClass.push({
      classId: definition.id,
      domain: definition.domain,
      availability: round2(availability),
      supportContribution,
      reliability: round2(clamp01(definition.reliability * (0.6 + reliability * 0.4))),
      seasonalModifier: round2(seasonalModifier),
      riskPlaceholder: round2(clamp01(definition.riskPlaceholder + risk * 0.3)),
      pressure: 0,
    });

    if (supportContribution > dominantSupport) {
      dominantSupport = supportContribution;
      dominantClass = definition.id;
    }

    if (definition.domain === "food") {
      dominantFoodAvailability = Math.max(dominantFoodAvailability, availability);
    }
  }

  const limitingClassFlags = contributionByClass
    .filter((entry) => entry.domain === "food" && entry.availability < dominantFoodAvailability * 0.5)
    .map((entry) => entry.classId);
  const totalSupportFromResources = round2(
    clamp01(contributionByClass.reduce((sum, entry) => sum + entry.supportContribution, 0)),
  );

  return {
    tileId: base.tileId,
    season: time.season,
    contributionByClass,
    dominantClass,
    resourceDiversity: round2(diversity),
    totalSupportFromResources,
    limitingClassFlags,
    sourceReasonId: `reason:resource_class:${base.tileId}:${time.tick}:availability_decomposed` as ReasonId,
  };
}

// Conservative resource-specific pressure: spreads the band's existing scalar local
// use + shared-catchment pressure across classes weighted by each class's
// availability and depletion sensitivity. Bounded and deterministic; this is a SLOT
// for future per-resource depletion/regrowth, not a real per-resource depletion model.
export function applyResourceClassPressure(
  summary: ResourceClassAvailabilitySummary,
  inputs: ResourcePressureInputs,
): ResourceClassAvailabilitySummary {
  const usePressure = clamp01(inputs.localUsePressure);
  const sharedPressure = clamp01(inputs.sharedCatchmentPressure);
  const crowding = clamp01(inputs.crowding);

  const contributionByClass = summary.contributionByClass.map((entry) => {
    const definition = RESOURCE_CLASS_BY_ID.get(entry.classId);
    const depletionSensitivity = definition?.depletionSensitivity ?? 0.4;
    const pressure = round2(
      clamp01(
        (usePressure * 0.6 + sharedPressure * 0.3 + crowding * 0.2) *
          (0.4 + entry.availability * 0.6) *
          depletionSensitivity *
          (entry.domain === "water" ? 0.6 : 1),
      ),
    );

    return { ...entry, pressure };
  });

  return { ...summary, contributionByClass };
}

export function getResourceClassDefinition(classId: ResourceClassId): ResourceClassDefinition {
  const definition = RESOURCE_CLASS_BY_ID.get(classId);

  if (definition === undefined) {
    throw new Error(`Unknown resource class: ${classId}`);
  }

  return definition;
}

export function deriveResourceClassPressureEffects(
  summary: ResourceClassAvailabilitySummary,
): readonly ResourceClassPressureEffect[] {
  return summary.contributionByClass
    .map((entry): ResourceClassPressureEffect => {
      const definition = getResourceClassDefinition(entry.classId);
      const foodWeight = entry.domain === "food" ? entry.supportContribution : 0;
      const materialPressure = entry.domain === "material" ? entry.pressure * 0.08 : 0;
      const waterPressure = entry.domain === "water" ? entry.pressure * 0.1 : 0;
      const pressureLoss = clamp01(
        foodWeight *
          entry.pressure *
          definition.pressureLossWeight *
          (0.55 + definition.finitePatchiness * 0.28 + definition.laborCost * 0.17) +
          materialPressure +
          waterPressure,
      );

      return {
        classId: entry.classId,
        domain: entry.domain,
        supportContribution: entry.supportContribution,
        pressure: entry.pressure,
        pressureLoss: round2(pressureLoss),
        reliability: entry.reliability,
        laborCost: definition.laborCost,
        depletionSensitivity: definition.depletionSensitivity,
        regrowthRate: definition.regrowthRate,
        functionalKinds: definition.functionalKinds,
      };
    })
    .filter((entry) => entry.supportContribution > 0 || entry.pressureLoss > 0 || entry.pressure > 0);
}

function getSeasonalModifier(
  definition: ResourceClassDefinition,
  record: KnownTileRecord,
  season: Season,
): number {
  const pattern = record.observedSeasonalPattern;
  const sensitivity = definition.seasonalSensitivity;

  if (pattern === undefined) {
    return clamp01(1 - sensitivity * 0.15);
  }

  if (pattern.peakSeasons?.includes(season)) {
    return clamp01(1 - sensitivity * 0.15 + pattern.reliability * 0.2);
  }

  if (pattern.leanSeasons?.includes(season)) {
    return clamp01(1 - sensitivity * 0.45 + pattern.reliability * 0.1);
  }

  return clamp01(1 - sensitivity * 0.25 + pattern.reliability * 0.12);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
