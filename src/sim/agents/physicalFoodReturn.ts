import type { ActivityReturnResourceKind } from "./types";

export const PHYSICAL_FOOD_RETURN_KINDS = [
  "gathered_plant_food",
  "harvested_aquatic_food",
  "hunted_fauna_food",
] as const satisfies readonly ActivityReturnResourceKind[];

const PHYSICAL_FOOD_RETURN_KIND_SET = new Set<ActivityReturnResourceKind>(PHYSICAL_FOOD_RETURN_KINDS);

export function isPhysicalFoodReturnKind(kind: ActivityReturnResourceKind): boolean {
  return PHYSICAL_FOOD_RETURN_KIND_SET.has(kind);
}
