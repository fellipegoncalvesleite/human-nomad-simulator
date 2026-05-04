/*
 * READABILITY-UI-ORGANIZATION-1 — player-language translation layer.
 *
 * PURE UI: no sim imports, no sim computation. Every internal enum a normal
 * (non-Technical) tab renders goes through these maps; anything unmapped falls
 * back to `humanize`, so a raw snake_case token can never reach normal UI.
 * The Technical tab intentionally does NOT use this file — it shows raw keys.
 */

import { humanize } from "../labels";

function lookup(map: Readonly<Record<string, string>>, key: string | undefined | null): string {
  if (key === undefined || key === null || key.length === 0) {
    return "—";
  }

  return map[key] ?? humanize(key);
}

/* ---------------------------------------------------------------- intensity */

// Normal UI never shows raw 0..1 internals; it shows words (Technical keeps
// the numbers).
export function intensityWord(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "—";
  }
  if (value < 0.12) {
    return "barely felt";
  }
  if (value < 0.32) {
    return "mild";
  }
  if (value < 0.55) {
    return "noticeable";
  }
  if (value < 0.78) {
    return "strong";
  }
  return "severe";
}

export function confidenceWord(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "unknown";
  }
  if (value < 0.25) {
    return "barely known";
  }
  if (value < 0.5) {
    return "uncertain";
  }
  if (value < 0.75) {
    return "fairly sure";
  }
  return "well known";
}

/* ------------------------------------------------------------ daily survival */

const LOGISTICS_MODE: Readonly<Record<string, string>> = {
  stable: "Managing day to day",
  strained: "Stretched thin",
  sick: "Sickness in camp",
  overburdened: "Carrying too much",
  weather_pinned: "Pinned down by weather",
  recovering: "Getting back on their feet",
};

const CAPACITY_STATE: Readonly<Record<string, string>> = {
  comfortable: "Hands to spare",
  tight: "Just enough hands",
  strained: "Short of hands",
  overloaded: "Overwhelmed",
};

const FIRE_STATUS: Readonly<Record<string, string>> = {
  not_relevant: "Fire is not a worry",
  useful: "Fires are keeping up",
  limited_by_fuel: "Firewood is short",
  strained: "Hard to keep fires going",
  risky: "Fire has become risky",
};

const SHARING_STATE: Readonly<Record<string, string>> = {
  easy_sharing: "Sharing comes easily",
  watchful_sharing: "Sharing, but watching portions",
  strained_sharing: "Sharing is strained",
  ration_like_caution: "Careful, ration-like sharing",
  relief: "Sharing eased again",
};

const CLEANLINESS_STATE: Readonly<Record<string, string>> = {
  clean: "Camp is clean",
  watchful: "Camp needs watching",
  dirty: "Camp is getting dirty",
  waste_pressure: "Waste is piling up",
  recovering: "Camp is being cleaned up",
};

const SICKNESS_DURATION: Readonly<Record<string, string>> = {
  none: "no sickness",
  short: "a short bout",
  several_days: "several days of sickness",
  season_background: "sickness lingering all season",
};

const SICKNESS_CAUSE: Readonly<Record<string, string>> = {
  bad_water: "bad water",
  spoiled_food: "spoiled food",
  risky_fallback_food: "risky fallback food",
  cold_exposure: "cold and exposure",
  heat_stress: "heat",
  camp_waste: "camp waste",
  crowding: "crowding",
  poor_diet: "a poor diet",
  wetland_insects: "wetland insects",
};

const WEAR_CATEGORY: Readonly<Record<string, string>> = {
  carrying_gear: "Carrying gear",
  cordage_fiber: "Cordage & fiber",
  containers_wraps: "Containers & wraps",
  hunting_gear: "Hunting gear",
  fishing_gear: "Fishing gear",
  fire_processing_material: "Fire & processing kit",
  crossing_lashings: "Crossing lashings",
};

const WEAR_CONDITION: Readonly<Record<string, string>> = {
  good: "in good shape",
  worn: "worn",
  strained: "badly worn",
  failing: "failing",
  recovering: "being repaired",
};

const WEATHER_MEMORY: Readonly<Record<string, string>> = {
  cold_exposure: "Cold spells here",
  heat_drought: "Heat and dry spells",
  wet_travel: "Miserable wet travel",
  bad_crossing_season: "A bad season for crossings",
  dry_water_stress: "Water running short",
  floodplain_wetland: "Flooding ground",
};

const OPPORTUNISTIC_FOOD: Readonly<Record<string, string>> = {
  carrion_leftover: "carrion leftovers",
  stranded_fish: "stranded fish",
  eggs_nests: "eggs and nests",
  insects_small_animals: "insects and small animals",
  shellfish_wetland_find: "wetland shellfish",
  post_weather_find: "storm-dropped finds",
};

const SEASONAL_TASK: Readonly<Record<string, string>> = {
  plant_observation: "Watching plants ripen",
  firewood_gathering: "Gathering firewood",
  material_repair: "Repairing gear",
  food_processing: "Processing food",
  camp_maintenance: "Maintaining camp",
  water_management: "Managing water",
  care_work: "Caring for the young and old",
  rest_recovery: "Resting and recovering",
};

const HUNGER_CLASSIFICATION: Readonly<Record<string, string>> = {
  stable: "Eating steadily",
  seasonal_lean_stress: "A lean stretch of the season",
  seasonal_water_stress: "A thirsty stretch of the season",
  seasonal_pulse_recovery: "Recovering as food returns",
  chronic_food_deficit: "Persistently short of food",
  chronic_water_deficit: "Persistently short of water",
  crisis_deficit: "A survival crisis",
  recovery_after_crisis: "Recovering after a crisis",
};

/* ------------------------------------------------------------- food/foraging */

const ADAPTATION_MODE: Readonly<Record<string, string>> = {
  stable: "Fed and settled in their ways",
  pressured: "Feeling food pressure",
  hungry: "Hungry and adjusting",
  desperate: "Desperate for food",
  recovering: "Recovering their diet",
};

const LEARNING_STATUS: Readonly<Record<string, string>> = {
  not_known: "not known yet",
  suspected: "suspected",
  watched: "being watched",
  cautiously_known: "cautiously known",
  known_useful: "known and useful",
  known_poor: "known to be poor",
  known_risky: "known to be risky",
};

const FALLBACK_LEVEL: Readonly<Record<string, string>> = {
  none: "No fallback foods needed",
  watching: "Keeping an eye on fallback foods",
  testing: "Testing fallback foods",
  expanded: "Leaning on fallback foods",
  emergency: "Eating emergency foods",
};

const STORAGE_GRADE: Readonly<Record<string, string>> = {
  none: "won't keep",
  poor: "keeps poorly",
  limited: "keeps a short while",
  good: "keeps well",
  excellent: "keeps very well",
  useful: "useful",
  strong: "strong",
  low: "low",
  medium: "middling",
  high: "high",
};

/* ----------------------------------------------------------------- place/camp */

const CAMP_STATE: Readonly<Record<string, string>> = {
  none: "No special standing",
  repeated_stop: "A repeated stopping place",
  seasonal_return_place: "A place they return to each year",
  refuge_anchor: "A refuge they fall back on",
  activity_base: "A base for work parties",
  remnant_holdout: "A holdout of a shrunken band",
  storage_processing_candidate: "Useful for processing and keeping food",
  crossing_camp: "A known crossing camp",
  fragile_camp_like_place: "A camp-like spot, but fragile",
  contested_camp_like_place: "A camp-like spot others also want",
  stale_remembered_camp: "A camp remembered from before",
  persistent_camp_candidate: "Becoming a lasting camp",
  proto_camp_candidate: "Starting to feel like a camp",
  abandoned_camp_trace: "Traces of an abandoned camp",
};

const CAMP_TREND: Readonly<Record<string, string>> = {
  new: "newly noticed",
  strengthening: "growing in importance",
  weakening: "losing importance",
  recovering: "recovering",
  stale: "fading from memory",
  stable: "holding steady",
};

const CAMP_SEASONAL_IDENTITY: Readonly<Record<string, string>> = {
  dry_refuge_return: "a dry-season refuge",
  wet_spread_place: "a wet-season spreading ground",
  winter_shelter: "a winter shelter",
  spring_pulse_camp: "a spring-flush camp",
  autumn_processing_candidate: "an autumn processing spot",
  seasonal_crossing_camp: "a seasonal crossing camp",
  general_return_place: "a general return place",
};

const USE_PRESSURE: Readonly<Record<string, string>> = {
  low: "lightly used",
  worn: "showing wear",
  overused: "overused",
  recovering: "recovering from use",
};

const SEASONAL_ROUND_PHASE: Readonly<Record<string, string>> = {
  dry_refuge_return: "returning to the dry-season refuge",
  late_dry_hold: "holding out late in the dry season",
  wet_dispersal: "spreading out with the rains",
  green_harvest: "working the green flush",
  transition: "between seasonal grounds",
  drought_escape: "escaping drought",
  unknown: "no settled round yet",
};

const SEASONAL_ROUND_OUTCOME: Readonly<Record<string, string>> = {
  followed: "They are following their seasonal round.",
  ignored: "They set their usual round aside this season.",
  blocked_passability: "Their usual round was blocked by hard travel.",
  blocked_water_failure: "Their usual round failed them — the water wasn't there.",
  abandoned_failure: "They abandoned a round that stopped working.",
  none: "No seasonal round has formed yet.",
};

const ROUTE_KIND: Readonly<Record<string, string>> = {
  known_ford: "a known ford",
  remembered_bank: "a remembered riverbank",
  seasonal_detour: "a seasonal detour",
  known_resting_point: "a known resting point",
  lashing_spot: "a lashing spot for crossings",
  water_stop: "a water stop",
  animal_path: "an animal path they follow",
  bad_segment_avoided: "a stretch they avoid",
  worn_path: "a worn, familiar path",
};

const ROUTE_STATUS: Readonly<Record<string, string>> = {
  improving: "getting easier",
  familiar: "familiar",
  strained: "getting harder",
  rewritten: "recently rethought",
  stale: "half-forgotten",
};

const PLACE_CHARACTER: Readonly<Record<string, string>> = {
  reliable_crowded_water: "Reliable but crowded water",
  useful_dirty_camp: "Useful but dirty camp",
  generous_wetland: "A generous wetland",
  cold_route: "A cold route",
  bad_crossing: "A bad crossing",
  annoying_reed_bed: "An annoying reed bed",
  safe_winter_shelter: "A safe winter shelter",
  hungry_forest_edge: "A hungry forest edge",
  risky_animal_trail: "A risky animal trail",
  worn_familiar_camp: "A worn, familiar camp",
  rich_heavy_carry: "Rich ground, heavy carrying",
  good_but_short_lived: "Good, but never lasts",
};

/* -------------------------------------------------------------- social/access */

const ACCESS_STATE: Readonly<Record<string, string>> = {
  none: "No expectations formed",
  familiar_use: "Used often enough to feel familiar",
  expected_return: "They expect to come back here",
  tolerated_shared_use: "Shared use is tolerated",
  kin_tolerated: "Kin are welcome here",
  stranger_watchful: "Watchful around strangers",
  crowded_use: "Crowded, shared use",
  contested_use: "Use of this place is contested",
  avoided_shared_use: "They avoid sharing this place",
  sensitive_place: "A sensitive place for them",
  stale_access_memory: "Old expectations, fading",
};

const ACCESS_PLACE_TYPE: Readonly<Record<string, string>> = {
  water_source: "water source",
  ford_crossing: "ford / crossing",
  wetland_fish_place: "wetland fishing spot",
  plant_patch: "plant patch",
  hunting_route: "hunting route",
  dry_refuge: "dry-season refuge",
  camp_place: "camp place",
  processing_place: "processing spot",
  lookout: "lookout",
  shelter: "shelter",
  gathering_ground: "gathering ground",
};

const REPUTATION_KIND: Readonly<Record<string, string>> = {
  kin_like: "feel like kin",
  helpful: "have been helpful",
  tolerated_familiar: "are familiar and tolerated",
  watchful: "are watched carefully",
  takes_too_much: "take too much",
  unreliable: "are unreliable",
  support_link: "are a source of support",
  stale_unknown: "are barely remembered",
};

const AGGREGATION_TRIGGER: Readonly<Record<string, string>> = {
  fish_wetland_pulse: "a wetland fish run",
  seed_mast_pulse: "a heavy seed year",
  dry_water_refuge: "shared dry-season water",
  known_crossing_bottleneck: "a busy crossing",
  persistent_camp_identity: "a well-known camp",
  support_need: "need for support",
  familiar_bands: "familiar bands nearby",
};

const ABSORPTION_KIND: Readonly<Record<string, string>> = {
  kin_reunion: "a reunion with kin",
  familiar_support: "support from familiar people",
  desperate_shelter: "desperate shelter",
  reluctant_support: "reluctant support",
  labor_gain: "welcome extra hands",
  dependent_burden: "more mouths to feed",
  elder_care_burden: "more elders to care for",
  food_pressure_strain: "strain on shared food",
  seasonal_refuge_absorption: "shelter through a hard season",
  crossing_camp_support: "help at a crossing camp",
  failed_breakaway_return: "a failed breakaway returning",
};

const INNER_FISSION_STATE: Readonly<Record<string, string>> = {
  unified: "The band feels whole",
  strained: "Patience is wearing thin",
  divided: "The camp is divided",
  factional: "Factions are forming",
  near_split: "Close to splitting",
  split_delayed: "A split was put off",
  split_resolved: "A split resolved itself",
};

const WEAK_BAND_FATE: Readonly<Record<string, string>> = {
  viable: "standing on their own",
  stable_remnant: "small but still viable",
  support_seeking: "seeking support from others",
  absorption_candidate: "close to joining another band",
  absorbed: "absorbed into another band",
  collapse_risk: "at risk of collapse",
  collapsed: "collapsed",
};

/* ------------------------------------------------------------------ movement */

const MOVE_KIND: Readonly<Record<string, string>> = {
  residential_relocation: "Moved the whole camp",
  emergency_water_move: "Emergency move for water",
  food_pressure_move: "Moved for food",
  crowding_pressure_move: "Moved away from crowding",
  frontier_probe_residential_shift: "Shifted camp toward new country",
  daughter_colonization_move: "A daughter band set out",
  seasonal_round_move: "Seasonal move",
};

const MOVE_CAUSE: Readonly<Record<string, string>> = {
  water_stress: "water was running short",
  poor_return: "the land was giving too little",
  local_pressure: "local pressure",
  known_opportunity: "a known better place",
  fission_daughter: "the band split",
  frontier_intent: "the pull of new country",
  unknown: "reasons of their own",
};

const MOVE_STATUS: Readonly<Record<string, string>> = {
  planned: "planned",
  in_progress_placeholder: "under way",
  arrived: "arrived",
  delayed_placeholder: "delayed",
  failed_no_route: "failed — no usable route",
};

const HARDSHIP_OUTCOME: Readonly<Record<string, string>> = {
  accepted: "they accepted the hardship",
  delayed: "they waited for a better moment",
  diverted: "they took another way",
  rejected: "they refused the risk",
  risk_only: "risk noted, nothing more",
};

/* -------------------------------------------------------------------- nature */

const KNOWNNESS: Readonly<Record<string, string>> = {
  tracks: "tracks seen",
  sighting: "sighted once",
  repeated_sighting: "seen again and again",
  successful_hunt: "hunted successfully",
  failed_hunt: "a hunt failed",
  stale_route: "an old, fading route",
  reliable_route: "a reliable route",
  camp_visitor: "visits the camp",
  dangerous_encounter: "a dangerous encounter",
  scavenger_sign: "scavenger signs",
};

const ANIMAL_FAMILIARITY_KIND: Readonly<Record<string, string>> = {
  familiar_route: "follow a familiar route",
  hard_to_catch: "are hard to catch",
  wary_of_hunters: "have grown wary of hunters",
  camp_nuisance: "are a nuisance around camp",
  scavenger_risk: "draw scavengers",
  dangerous_but_known: "are dangerous but understood",
  tolerated_proximity: "tolerate people nearby",
  unreliable: "come and go unpredictably",
};

const USEFULNESS: Readonly<Record<string, string>> = {
  low: "of little use",
  useful: "useful",
  promising: "promising",
  high_value: "highly valued",
  risky_value: "valuable but risky",
  unreliable: "unreliable",
  scarce: "too scarce to count on",
};

const ABUNDANCE: Readonly<Record<string, string>> = {
  scarce: "scarce",
  low: "thin on the ground",
  steady: "steady",
  abundant: "abundant",
};

const ACUTE_KIND: Readonly<Record<string, string>> = {
  minor_foraging_injury: "A minor foraging injury",
  severe_foraging_injury: "A serious foraging injury",
  bad_water_sickness: "Sickness from bad water",
  plant_poisoning_or_irritation: "A bad reaction to a plant",
  aquatic_accident: "An accident in the water",
  animal_encounter_injury: "An injury from an animal",
  exposure_or_cold_snap: "A cold snap caught them out",
  heat_or_drought_exhaustion: "Heat exhaustion",
  travel_accident: "A travel accident",
  acute_dehydration: "Dangerous thirst",
  acute_exposure: "Dangerous exposure",
  acute_food_access_failure: "Suddenly cut off from food",
  acute_animal_encounter: "A dangerous animal encounter",
};

/* ------------------------------------------------------------------- reports */

const REPORT_TOPIC: Readonly<Record<string, string>> = {
  good_fishing: "good fishing",
  reliable_water: "reliable water",
  bad_water_warning: "a bad-water warning",
  animal_danger: "animal danger",
  ford_or_crossing: "a ford or crossing",
  poor_return_warning: "poor foraging",
  crowded_water_warning: "crowded water",
  safe_side_country: "safe side country",
  dry_place_warning: "a dry-place warning",
  rich_plant_patch: "a rich plant patch",
  good_hunting_ground: "good hunting ground",
  shelter_place: "a sheltered place",
};

/* ------------------------------------------------------------------- helpers */

export const logisticsModeLabel = (key: string | undefined): string => lookup(LOGISTICS_MODE, key);
export const capacityStateLabel = (key: string | undefined): string => lookup(CAPACITY_STATE, key);
export const fireStatusLabel = (key: string | undefined): string => lookup(FIRE_STATUS, key);
export const sharingStateLabel = (key: string | undefined): string => lookup(SHARING_STATE, key);
export const cleanlinessLabel = (key: string | undefined): string => lookup(CLEANLINESS_STATE, key);
export const sicknessDurationLabel = (key: string | undefined): string => lookup(SICKNESS_DURATION, key);
export const sicknessCauseLabel = (key: string | undefined): string => lookup(SICKNESS_CAUSE, key);
export const wearCategoryLabel = (key: string | undefined): string => lookup(WEAR_CATEGORY, key);
export const wearConditionLabel = (key: string | undefined): string => lookup(WEAR_CONDITION, key);
export const weatherMemoryLabel = (key: string | undefined): string => lookup(WEATHER_MEMORY, key);
export const opportunisticFoodLabel = (key: string | undefined): string => lookup(OPPORTUNISTIC_FOOD, key);
export const seasonalTaskLabel = (key: string | undefined): string => lookup(SEASONAL_TASK, key);
export const hungerClassificationLabel = (key: string | undefined): string => lookup(HUNGER_CLASSIFICATION, key);
export const adaptationModeLabel = (key: string | undefined): string => lookup(ADAPTATION_MODE, key);
export const learningStatusLabel = (key: string | undefined): string => lookup(LEARNING_STATUS, key);
export const fallbackLevelLabel = (key: string | undefined): string => lookup(FALLBACK_LEVEL, key);
export const storageGradeLabel = (key: string | undefined): string => lookup(STORAGE_GRADE, key);
export const campStateLabel = (key: string | undefined): string => lookup(CAMP_STATE, key);
export const campTrendLabel = (key: string | undefined): string => lookup(CAMP_TREND, key);
export const campSeasonalIdentityLabel = (key: string | undefined): string => lookup(CAMP_SEASONAL_IDENTITY, key);
export const usePressureLabel = (key: string | undefined): string => lookup(USE_PRESSURE, key);
export const seasonalRoundPhaseLabel = (key: string | undefined): string => lookup(SEASONAL_ROUND_PHASE, key);
export const seasonalRoundOutcomeLabel = (key: string | undefined): string => lookup(SEASONAL_ROUND_OUTCOME, key);
export const routeKindLabel = (key: string | undefined): string => lookup(ROUTE_KIND, key);
export const routeStatusLabel = (key: string | undefined): string => lookup(ROUTE_STATUS, key);
export const placeCharacterLabel = (key: string | undefined): string => lookup(PLACE_CHARACTER, key);
export const accessStateLabel = (key: string | undefined): string => lookup(ACCESS_STATE, key);
export const accessPlaceTypeLabel = (key: string | undefined): string => lookup(ACCESS_PLACE_TYPE, key);
export const reputationKindLabel = (key: string | undefined): string => lookup(REPUTATION_KIND, key);
export const aggregationTriggerLabel = (key: string | undefined): string => lookup(AGGREGATION_TRIGGER, key);
export const absorptionKindLabel = (key: string | undefined): string => lookup(ABSORPTION_KIND, key);
export const innerFissionStateLabel = (key: string | undefined): string => lookup(INNER_FISSION_STATE, key);
export const weakBandFateLabel = (key: string | undefined): string => lookup(WEAK_BAND_FATE, key);
export const moveKindLabel = (key: string | undefined): string => lookup(MOVE_KIND, key);
export const moveCauseLabel = (key: string | undefined): string => lookup(MOVE_CAUSE, key);
export const moveStatusLabel = (key: string | undefined): string => lookup(MOVE_STATUS, key);
export const hardshipOutcomeLabel = (key: string | undefined): string => lookup(HARDSHIP_OUTCOME, key);
export const knownnessLabel = (key: string | undefined): string => lookup(KNOWNNESS, key);
export const animalFamiliarityLabel = (key: string | undefined): string => lookup(ANIMAL_FAMILIARITY_KIND, key);
export const usefulnessLabel = (key: string | undefined): string => lookup(USEFULNESS, key);
export const abundanceLabel = (key: string | undefined): string => lookup(ABUNDANCE, key);
export const acuteKindLabel = (key: string | undefined): string => lookup(ACUTE_KIND, key);
export const reportTopicLabel = (key: string | undefined): string => lookup(REPORT_TOPIC, key);

// WHOLE-UI-READABILITY-HISTORY-FUN-1 — player-facing names for abstract
// resource classes ("which food is being tested?"); the sim's debugLabel
// stays in Technical.
const RESOURCE_CLASS_FOOD: Readonly<Record<string, string>> = {
  generic_plant_food: "wild plant foods",
  aquatic_food: "fish and water-edge food",
  animal_food: "hunted game",
  fallback_food: "roots and fallback foods",
  fiber_material: "fiber for cordage and craft",
  fuel_material: "firewood and fuel",
  medicinal_or_toxic: "plants that heal or harm",
  water_resource: "dependable water",
};

export const resourceClassFoodLabel = (key: string | undefined): string => lookup(RESOURCE_CLASS_FOOD, key);

// WHOLE-UI-READABILITY-HISTORY-FUN-1B — the sim's terse social state strings
// ("internal fracture", "open hostility / spiteful silence") compose badly
// when stacked; these render them as parts of one readable sentence.
const COHESION_STATUS: Readonly<Record<string, string>> = {
  "internal fracture": "Fractured from within",
  "badly divided": "Badly divided",
  "strained cohesion": "Holding together under strain",
  "mostly cohesive": "Mostly holding together",
  unified: "Unified",
};

const TOLERANCE_STATUS: Readonly<Record<string, string>> = {
  "open hostility / spiteful silence": "open hostility or spiteful silence",
  "hostile avoidance": "people avoiding each other",
  "watchful tolerance": "watchful tolerance",
  "cautious cooperation": "cautious cooperation",
  "trusted cooperation": "easy, trusted cooperation",
};

const HOSTILITY_STATUS: Readonly<Record<string, string>> = {
  "open hostility / spiteful silence": "open hostility around decisions",
  "resource suspicion": "suspicion around food and portions",
  "watchful unease": "a watchful unease underneath",
  "no strong hostility signal": "no open hostility beneath it",
};

export const cohesionStatusLabel = (key: string | undefined): string => lookup(COHESION_STATUS, key);
export const toleranceStatusLabel = (key: string | undefined): string => lookup(TOLERANCE_STATUS, key);
export const hostilityStatusLabel = (key: string | undefined): string => lookup(HOSTILITY_STATUS, key);
