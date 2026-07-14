import type {
  IntraSeasonTripActivityResult,
  IntraSeasonTripTaskGroupType,
  ActivityReturnResourceKind,
  ActivityReturnSemantics,
} from "./types";
import type { ResourceClassId } from "./resourceClasses";

// POST-ECOLOGY CLOSURE-1 — the single exhaustive semantic registry for activity
// returns. Adding a new kind is a type error until its physicality, nutrition role,
// and material domain are stated here. No behavior is inferred from a string name.
export const ACTIVITY_RETURN_SEMANTICS = {
  none: {
    category: "failed_or_none",
    isPhysical: false,
    contributesToNutrition: false,
    materialDomain: "none",
  },
  food_observation_only: {
    category: "opportunity",
    isPhysical: false,
    contributesToNutrition: false,
    materialDomain: "information",
  },
  gathered_plant_food: {
    category: "physical_food",
    isPhysical: true,
    contributesToNutrition: true,
    materialDomain: "plant_food",
  },
  harvested_aquatic_food: {
    category: "physical_food",
    isPhysical: true,
    contributesToNutrition: true,
    materialDomain: "aquatic_food",
  },
  hunted_fauna_food: {
    category: "physical_food",
    isPhysical: true,
    contributesToNutrition: true,
    materialDomain: "fauna_food",
  },
  gathered_fiber_material: {
    category: "physical_material",
    isPhysical: true,
    contributesToNutrition: false,
    materialDomain: "fiber",
  },
  gathered_fuel_material: {
    category: "physical_material",
    isPhysical: true,
    contributesToNutrition: false,
    materialDomain: "fuel",
  },
  water_information: {
    category: "observation",
    isPhysical: false,
    contributesToNutrition: false,
    materialDomain: "water",
  },
  plant_information: {
    category: "observation",
    isPhysical: false,
    contributesToNutrition: false,
    materialDomain: "information",
  },
  route_information: {
    category: "observation",
    isPhysical: false,
    contributesToNutrition: false,
    materialDomain: "information",
  },
} as const satisfies Record<ActivityReturnResourceKind, ActivityReturnSemantics>;

export const PHYSICAL_FOOD_RETURN_KINDS = [
  "gathered_plant_food",
  "harvested_aquatic_food",
  "hunted_fauna_food",
] as const satisfies readonly ActivityReturnResourceKind[];

export function getActivityReturnSemantics(
  kind: ActivityReturnResourceKind,
): ActivityReturnSemantics {
  return ACTIVITY_RETURN_SEMANTICS[kind];
}

export function isPhysicalFoodReturnKind(kind: ActivityReturnResourceKind): boolean {
  return ACTIVITY_RETURN_SEMANTICS[kind].contributesToNutrition;
}

export function isPhysicalMaterialReturnKind(kind: ActivityReturnResourceKind): boolean {
  return ACTIVITY_RETURN_SEMANTICS[kind].category === "physical_material";
}

export function isInformationalReturnKind(kind: ActivityReturnResourceKind): boolean {
  const category = ACTIVITY_RETURN_SEMANTICS[kind].category;
  return category === "observation" || category === "opportunity";
}

// Boundary-only compatibility. Historical placeholder strings never become food
// without a resolved physical receipt; unrecognized values deterministically become
// `none`. The current app has no live-world importer, so behavioral code never calls
// this parser directly.
export function normalizeLegacyActivityReturnKind(value: unknown): ActivityReturnResourceKind {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIVITY_RETURN_SEMANTICS, value)) {
    return value as ActivityReturnResourceKind;
  }
  return "none";
}

export function classifyActivityReturnKind(input: {
  readonly resourceClassId: ResourceClassId;
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly outcome: IntraSeasonTripActivityResult;
}): ActivityReturnResourceKind {
  const { resourceClassId, taskGroupType, outcome } = input;
  if (ACTIVITY_RESULT_SEMANTICS[outcome] === "failure") return "none";
  if (taskGroupType === "water_group") return "water_information";
  if (taskGroupType === "memory_refresh_group") return "route_information";
  if (taskGroupType === "plant_followup_group" && outcome !== "partial_success") return "plant_information";

  if (outcome === "partial_success" || outcome === "target_found") {
    if (resourceClassId === "fiber_material") return "gathered_fiber_material";
    if (resourceClassId === "fuel_material") return "gathered_fuel_material";
    if (taskGroupType === "hunting_group" || resourceClassId === "animal_food") return "hunted_fauna_food";
    if (taskGroupType === "fishing_group" || resourceClassId === "aquatic_food") return "harvested_aquatic_food";
    return "gathered_plant_food";
  }
  return isFoodResourceClass(resourceClassId) ? "food_observation_only" : "none";
}

const ACTIVITY_RESULT_SEMANTICS = {
  successful_observation: "information",
  target_found: "physical_candidate",
  target_not_found: "failure",
  partial_success: "physical_candidate",
  failed_due_to_distance: "failure",
  failed_due_to_water_risk: "failure",
  failed_due_to_low_memory_confidence: "failure",
  failed_due_to_season_mismatch: "failure",
  delayed_return: "failure",
  abandoned_due_to_risk: "failure",
  returned_with_information: "information",
  no_effect_observed: "failure",
} as const satisfies Record<IntraSeasonTripActivityResult, "information" | "physical_candidate" | "failure">;

function isFoodResourceClass(classId: ResourceClassId): boolean {
  return classId === "generic_plant_food" || classId === "aquatic_food" ||
    classId === "animal_food" || classId === "fallback_food";
}
