/*
 * UI-STYLE-1 — plain-language label maps. PURE UI: no sim imports, no sim
 * computation. Player-facing components render internal keys through these;
 * the Technical tab keeps the raw keys. Any unmapped key falls back to a
 * humanized form so nothing ever renders as a raw snake_case token.
 */

export function humanize(key: string): string {
  if (key.length === 0) {
    return "";
  }

  const spaced = key.replace(/_/g, " ").trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function lookup(map: Readonly<Record<string, string>>, key: string | undefined): string {
  if (key === undefined) {
    return "—";
  }

  return map[key] ?? humanize(key);
}

const MOBILITY: Readonly<Record<string, string>> = {
  high_mobility: "Highly mobile",
  seasonal_round: "Seasonal round",
  logistical_foraging: "Logistical foraging",
  tethered_to_place: "Tethered to one place",
  sedentary_experiment: "Settling down",
};

const SUBSISTENCE: Readonly<Record<string, string>> = {
  foraging: "Foraging",
  aquatic: "Fishing & shellfish",
  wild_grain_collection: "Wild grain",
  plant_tending: "Plant tending",
  early_agriculture: "Early farming",
  irrigated_agriculture_experiment: "Irrigated farming",
};

const INTENT: Readonly<Record<string, string>> = {
  local_foraging: "Foraging nearby",
  follow_river_corridor: "Following the river",
  probe_wetland_or_lake: "Scouting wetlands",
  probe_coast: "Scouting the coast",
  seek_better_water: "Seeking better water",
  avoid_risk: "Avoiding danger",
  cross_pass: "Crossing the pass",
  return_to_known_good_area: "Returning to good ground",
  expand_known_world: "Exploring the unknown",
  seek_new_range: "Searching for a better place",
  frontier_dispersal: "Pushing the frontier",
  daughter_range_expansion: "Establishing a daughter range",
};

const TERRAIN: Readonly<Record<string, string>> = {
  plains: "Plains",
  forest: "Forest",
  hills: "Hills",
  mountains: "Mountains",
  wetlands: "Wetlands",
  river_valley: "River valley",
  coast: "Coast",
  lake: "Lakeshore",
  desert: "Desert",
  tundra: "Tundra",
};

const VIABILITY: Readonly<Record<string, string>> = {
  viable: "Secure",
  fragile: "Fragile",
  nonviable: "At risk of dying out",
  absorbed: "Absorbed by another band",
  extinct: "Died out",
};

const MOOD: Readonly<Record<string, string>> = {
  stable: "Stable",
  calm: "Calm",
  recovering: "Recovering",
  cautious: "Cautious",
  fearful: "Fearful",
  angry: "Angry",
  hungry: "Hungry",
  thirsty: "Thirsty",
  tired: "Tired",
  curious: "Curious",
  confident: "Confident",
  strained: "Strained",
  fractured: "Fractured",
  grieving: "Grieving",
  desperate: "Desperate",
  relieved: "Relieved",
  restless: "Restless",
  pressured: "Pressured",
  suspicious: "Suspicious",
};

const BAND_STATUS: Readonly<Record<string, string>> = {
  foraging: "Foraging",
  camped: "Camped",
  moving: "On the move",
  splitting: "Splitting",
  settled: "Settled",
  stressed: "Under stress",
  dispersed: "Dispersed",
};

const ACTIVITY_TYPE: Readonly<Record<string, string>> = {
  hunting_group: "Hunting party",
  fishing_group: "Fishing party",
  plant_gathering_group: "Gathering party",
  water_group: "Water run",
  plant_followup_group: "Plant check",
  memory_refresh_group: "Scouting trip",
  local_foraging_group: "Local work party",
};

const TECHNOLOGY: Readonly<Record<string, string>> = {
  basic_foraging: "Basic foraging",
  fishing: "Fishing",
  improved_fishing: "Improved fishing",
  plant_tending: "Plant tending",
  basic_storage: "Food storage",
  ceramic_storage: "Ceramic storage",
  drying_smoking: "Drying & smoking",
  basketry: "Basketry",
  irrigation_experiment: "Irrigation",
  terrace_experiment: "Terracing",
};

const OBJECTIVE: Readonly<Record<string, string>> = {
  local_exploitation: "Working the local patch",
  water_security: "Securing water",
  food_patch_check: "Checking a food patch",
  plant_followup_testing: "Testing a wild plant",
  memory_refresh: "Refreshing what they know",
};

export const mobilityLabel = (key: string | undefined): string => lookup(MOBILITY, key);
export const subsistenceLabel = (key: string | undefined): string => lookup(SUBSISTENCE, key);
export const technologyLabel = (key: string | undefined): string => lookup(TECHNOLOGY, key);
export const intentLabel = (key: string | undefined): string => lookup(INTENT, key);
export const terrainLabel = (key: string | undefined): string => lookup(TERRAIN, key);
export const viabilityLabel = (key: string | undefined): string => lookup(VIABILITY, key);
export const moodLabel = (key: string | undefined): string => lookup(MOOD, key);
export const bandStatusLabel = (key: string | undefined): string => lookup(BAND_STATUS, key);
export const activityTypeLabel = (key: string | undefined): string => lookup(ACTIVITY_TYPE, key);
export const objectiveLabel = (key: string | undefined): string => lookup(OBJECTIVE, key);
export const reasonLabel = (key: string | undefined): string => humanize(key ?? "");
