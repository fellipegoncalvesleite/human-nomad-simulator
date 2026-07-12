/*
 * Player-facing band life summaries.
 *
 * Pure UI/readability layer: derives compact, grounded wording from existing
 * band state and activity ledgers. It does not mutate sim state and does not
 * invent activities; every phrase is backed by a trip, range context, pressure,
 * lineage, or residential-move record already present on the band.
 */
import type {
  Band,
  IntraSeasonTripRecord,
  IntraSeasonTripTaskGroupType,
  ResidentialMoveEvent,
} from "../sim/agents/types";
import { classifyMovementContext, deriveFamiliarCountry, type MovementContext } from "../sim/agents/familiarCountry";
import type { StepMode, TickNumber } from "../sim/core/types";
import type { IconName } from "./icons";
import type { BandStatusSummary, StatusTone } from "./bandSummary";
import { deriveBandStatus, deriveBandStatusWithRange } from "./bandSummary";

export interface LifeChip {
  readonly label: string;
  readonly icon: IconName;
  readonly tone?: StatusTone;
  readonly title?: string;
}

export interface ActivityTripDisplay {
  readonly title: string;
  readonly categoryLabel: string;
  readonly categoryKey: ActivityCategoryKey;
  readonly detail: string;
  readonly reason: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
}

export interface BandActivityTimeSummary {
  readonly title: string;
  readonly detail: string;
  readonly chips: readonly LifeChip[];
  readonly topCategoryShare: number;
  readonly repeatedIdenticalRawLabelCount: number;
  readonly tripCount: number;
}

export interface BandLifeSummary {
  readonly status: BandStatusSummary;
  readonly activityLine: string;
  readonly movementLine: string;
  readonly intentLine: string;
  readonly reasonLine: string;
  readonly chips: readonly LifeChip[];
  readonly activitySummary: BandActivityTimeSummary;
}

export interface CampLifeDisplay {
  readonly title: string;
  readonly detail: string;
  readonly reason: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly peopleAtCamp: number;
  readonly assignedPeople: number;
  readonly dependents: number;
  readonly elders: number;
  readonly chips: readonly LifeChip[];
}

type ActivityCategoryKey =
  | "camp"
  | "water"
  | "gathering"
  | "fishing"
  | "hunting"
  | "scouting"
  | "plant_check"
  | "route"
  | "range"
  | "rest";

interface CategorySpec {
  readonly label: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
}

const CATEGORY: Readonly<Record<ActivityCategoryKey, CategorySpec>> = {
  camp: { label: "Camp work", icon: "camp", tone: "settled" },
  water: { label: "Water work", icon: "water", tone: "settled" },
  gathering: { label: "Gathering", icon: "gathering", tone: "settled" },
  fishing: { label: "Fishing", icon: "fishing", tone: "settled" },
  hunting: { label: "Hunting", icon: "hunting", tone: "exploring" },
  scouting: { label: "Scouting", icon: "scout", tone: "exploring" },
  plant_check: { label: "Plant check", icon: "season", tone: "exploring" },
  route: { label: "Route work", icon: "route", tone: "moving" },
  range: { label: "Range work", icon: "range", tone: "exploring" },
  rest: { label: "Camp rest", icon: "rest", tone: "settled" },
};

const SCALE_WINDOW: Readonly<Record<StepMode, number>> = {
  daily: 1,
  weekly: 4,
  monthly: 10,
  seasonal: 24,
};

const SCALE_LABEL: Readonly<Record<StepMode, string>> = {
  daily: "Now",
  weekly: "This week",
  monthly: "This month",
  seasonal: "This season",
};

const TASK_CATEGORY: Readonly<Record<IntraSeasonTripTaskGroupType, ActivityCategoryKey>> = {
  hunting_group: "hunting",
  fishing_group: "fishing",
  plant_gathering_group: "gathering",
  water_group: "water",
  plant_followup_group: "plant_check",
  memory_refresh_group: "scouting",
  local_foraging_group: "camp",
};

const RANGE_LABEL: Readonly<Record<MovementContext, { readonly label: string; readonly icon: IconName; readonly tone: StatusTone }>> = {
  within_known_range: { label: "Inside familiar country", icon: "range", tone: "settled" },
  local_camp_shift: { label: "Near a known camp", icon: "camp", tone: "settled" },
  working_known_water: { label: "At known water", icon: "water", tone: "settled" },
  seasonal_round: { label: "Following a seasonal round", icon: "route", tone: "moving" },
  range_edge_probe: { label: "Testing the edge", icon: "scout", tone: "exploring" },
  leaving_familiar_country: { label: "Leaving familiar country", icon: "move", tone: "moving" },
  founding_new_range: { label: "Founding new country", icon: "founding", tone: "exploring" },
  unsettled_no_range: { label: "Still learning the country", icon: "scout", tone: "exploring" },
};

export function deriveBandLifeSummary(
  band: Band,
  currentTick: TickNumber,
  stepMode: StepMode,
): BandLifeSummary {
  const activitySummary = deriveActivityTimeSummary(band, stepMode);
  const latestTrip = getRecentTrips(band)[0];
  const latestTripDisplay = latestTrip === undefined ? undefined : deriveActivityTripDisplay(latestTrip);
  const range = deriveFamiliarCountry(band, currentTick);
  const rangeContext = classifyMovementContext(band, range, currentTick);
  const rangeLabel = RANGE_LABEL[rangeContext];
  const baseStatus = deriveBandStatus(band);
  const rangeStatus = deriveBandStatusWithRange(band, currentTick);
  const pressure = derivePressureChip(band);
  const daughterPressure = band.daughterColonization?.pressure ?? 0;
  const latestMove = band.recentResidentialMoveEvents?.[0];

  const status = ((): BandStatusSummary => {
    if (baseStatus.tone === "gone" || baseStatus.tone === "struggling" || baseStatus.tone === "pressure") {
      return baseStatus;
    }
    if (rangeContext === "founding_new_range" || daughterPressure >= 0.42) {
      return { label: band.parentBandId === undefined ? "Founding range" : "Daughter range", tone: "exploring", icon: "founding" };
    }
    if (latestTripDisplay !== undefined && stepMode === "daily") {
      return {
        label: shortStatusFromActivity(latestTripDisplay),
        tone: latestTripDisplay.tone,
        icon: latestTripDisplay.icon,
      };
    }
    return rangeStatus.label === "Shifting camp locally"
      ? { label: rangeLabel.label, tone: rangeLabel.tone, icon: rangeLabel.icon }
      : rangeStatus;
  })();

  const activityLine =
    latestTripDisplay === undefined
      ? fallbackActivityLine(band, rangeContext, currentTick)
      : stepMode === "daily"
        ? latestTripDisplay.title
        : activitySummary.title;
  const movementLine = deriveMovementLine(band, rangeContext, latestMove);
  const intentLine = deriveIntentLine(band, latestTripDisplay, rangeContext, currentTick);
  const reasonLine = deriveReasonLine(band, latestTripDisplay, rangeContext, activitySummary, currentTick);
  const daughterChip: LifeChip = { label: "Daughter band", icon: "lineage", tone: "exploring" };
  const chips = [
    ...(latestTripDisplay === undefined ? [] : [makeTripChip(latestTripDisplay, latestTrip)]),
    { label: rangeLabel.label, icon: rangeLabel.icon, tone: rangeLabel.tone },
    ...(pressure === undefined ? [] : [pressure]),
    ...(band.parentBandId === undefined ? [] : [daughterChip]),
  ].slice(0, 4);

  return {
    status,
    activityLine,
    movementLine,
    intentLine,
    reasonLine,
    chips,
    activitySummary,
  };
}

export function deriveActivityTimeSummary(
  band: Band,
  stepMode: StepMode,
): BandActivityTimeSummary {
  const trips = getRecentTrips(band);
  const windowTrips = trips.slice(0, SCALE_WINDOW[stepMode]);
  const campLife = deriveCampLifeDisplay(band, stepMode);

  if (windowTrips.length === 0) {
    return {
      title: campLife?.title ?? fallbackActivityLine(band, "unsettled_no_range", 0 as TickNumber),
      detail: campLife?.detail ?? "No recent activity groups are recorded yet.",
      chips: campLife?.chips ?? [{ label: "At camp", icon: "camp", tone: "settled" }],
      topCategoryShare: 0,
      repeatedIdenticalRawLabelCount: 0,
      tripCount: 0,
    };
  }

  if (stepMode === "daily") {
    const display = deriveActivityTripDisplay(windowTrips[0]);

    return {
      title: display.title,
      detail: display.reason,
      chips: [
        makeTripChip(display, windowTrips[0]),
        makeOutcomeChip(windowTrips[0]),
        ...(campLife === undefined ? [] : [makeCampLifeChip(campLife)]),
      ].slice(0, 3),
      topCategoryShare: 1,
      repeatedIdenticalRawLabelCount: countMostRepeatedRawLabel(windowTrips),
      tripCount: windowTrips.length,
    };
  }

  const counts = countDisplays(windowTrips);
  const top = counts[0];
  const second = counts[1];
  const topShare = top === undefined ? 0 : top.count / windowTrips.length;
  const titlePrefix = SCALE_LABEL[stepMode];
  const mostly = top === undefined ? "camp routines" : lowerFirst(top.label);
  const secondary =
    second === undefined || second.count < 2 || second.count / windowTrips.length < 0.18
      ? ""
      : `, with ${lowerFirst(second.label)}`;
  const routePattern = windowTrips.some((trip) => trip.outcome !== "returns_same_day")
    ? " Some groups are staying out overnight or longer."
    : " Most groups return to camp the same day.";
  const campPattern =
    campLife === undefined
      ? ""
      : ` ${campLife.peopleAtCamp} working adult${campLife.peopleAtCamp === 1 ? "" : "s"} remain at camp.`;
  const detail =
    `${titlePrefix}: mostly ${mostly}${secondary}.` +
    routePattern +
    campPattern +
    describeMemoryPattern(windowTrips);

  return {
    title: `${titlePrefix}: mostly ${mostly}`,
    detail,
    chips: [
      ...counts.slice(0, 2).map((entry) => ({
        label: `${entry.count} ${entry.label}`,
        icon: entry.icon,
        tone: entry.tone,
      })),
      ...(campLife === undefined ? [] : [makeCampLifeChip(campLife)]),
    ].slice(0, 3),
    topCategoryShare: round2(topShare),
    repeatedIdenticalRawLabelCount: countMostRepeatedRawLabel(windowTrips),
    tripCount: windowTrips.length,
  };
}

export function deriveCampLifeDisplay(
  band: Band,
  stepMode: StepMode,
): CampLifeDisplay | undefined {
  const labor = band.activityLaborSummary;

  if (labor === undefined) {
    return undefined;
  }

  const peopleAtCamp = Math.max(0, Math.round(labor.peopleAtResidentialCenterEstimate));
  const assignedPeople = Math.max(0, Math.round(labor.peopleAssignedToActivityGroups));
  const dependents = Math.max(0, Math.round(band.demography.dependents));
  const elders = Math.max(0, Math.round(band.demography.elders));
  const latestTrip = getRecentTrips(band)[0];
  const latestMove = band.recentResidentialMoveEvents?.[0];
  const recentlyMoved =
    latestMove !== undefined && Math.abs(Number(labor.tick) - Number(latestMove.tick)) <= 4;
  const hasAwayGroup = labor.recentActivityGroupSummaries.some((group) =>
    group.status === "away" ||
    group.status === "overnight" ||
    group.status === "continuing" ||
    group.status === "delayed",
  );
  const returnedFoodKind = latestTrip?.resourceReturn.returnedResourceKind;
  const returnedFood =
    returnedFoodKind === "harvested_aquatic_food" ||
    returnedFoodKind === "hunted_fauna_food" ||
    returnedFoodKind === "gathered_plant_food";
  const waterWork =
    latestTrip?.taskGroupType === "water_group" ||
    (band.pressureState?.waterStress ?? 0) >= 0.36;

  if (peopleAtCamp <= 0 && dependents <= 0 && elders <= 0) {
    return undefined;
  }

  const seed = `${String(band.id)}:${String(labor.day)}:${stepMode}:camp-life`;
  const title = (() => {
    if (recentlyMoved) {
      return pickVariant(seed, [
        "Settling camp after a move",
        "Putting the camp back together",
        "Re-forming camp routines",
      ]);
    }
    if (waterWork) {
      return pickVariant(seed, [
        "Keeping camp close to water",
        "Watching the water place",
        "Holding the water-side camp",
      ]);
    }
    if (returnedFood) {
      return pickVariant(seed, [
        "Preparing returned food",
        "Sorting food at camp",
        "Sharing work around camp",
      ]);
    }
    if (hasAwayGroup) {
      return pickVariant(seed, [
        "Holding camp while parties are out",
        "Keeping the residential center steady",
        "Waiting on returning parties",
      ]);
    }
    if (dependents + elders > 0) {
      return pickVariant(seed, [
        "Watching children and elders",
        "Keeping the household group close",
        "Tending the residential group",
      ]);
    }
    return pickVariant(seed, [
      "Tending camp",
      "Keeping camp work close",
      "Holding the residential center",
    ]);
  })();
  const reason = (() => {
    if (recentlyMoved) {
      return "The last residential move left ordinary camp work visible while the group settles.";
    }
    if (waterWork) {
      return "Water pressure or water memory keeps part of the band anchored near camp.";
    }
    if (returnedFood) {
      return "Recent food work returned to camp, so some labor stays with processing and sharing.";
    }
    if (hasAwayGroup) {
      return "Not everyone is in the trip ledger; some adults remain with the residential group.";
    }
    if (dependents + elders > 0) {
      return "Dependents and elders make camp life visible even when task groups go out.";
    }
    return "The activity ledger tracks task groups, while camp labor stays at the residential center.";
  })();
  const householdLine =
    dependents + elders > 0
      ? `${dependents} dependent${dependents === 1 ? "" : "s"} and ${elders} elder${elders === 1 ? "" : "s"} remain part of the residential group.`
      : "The residential group has no dependent or elder cohort recorded today.";
  const detail =
    `${peopleAtCamp} working adult${peopleAtCamp === 1 ? "" : "s"} at camp; ${assignedPeople} assigned to recorded activity groups. ${householdLine}`;
  const icon: IconName = recentlyMoved ? "settle" : waterWork ? "water" : returnedFood ? "food" : hasAwayGroup ? "camp" : "people";
  const tone: StatusTone = waterWork || recentlyMoved ? "moving" : "settled";
  const campChip: LifeChip = { label: `${peopleAtCamp} at camp`, icon: "camp", tone: "settled", title: reason };
  const householdChip: LifeChip = { label: `${dependents + elders} dependents/elders`, icon: "people", tone: "settled" };
  const awayChip: LifeChip = { label: "Parties out", icon: "activity", tone: "moving" };
  const chips: readonly LifeChip[] = [
    campChip,
    ...(dependents + elders > 0 ? [householdChip] : []),
    ...(hasAwayGroup ? [awayChip] : []),
  ].slice(0, 3);

  return {
    title,
    detail,
    reason,
    icon,
    tone,
    peopleAtCamp,
    assignedPeople,
    dependents,
    elders,
    chips,
  };
}

export function deriveActivityTripDisplay(trip: IntraSeasonTripRecord): ActivityTripDisplay {
  const categoryKey = deriveTripCategory(trip);
  const spec = CATEGORY[categoryKey];
  const variantKey = `${String(trip.sourceBandId)}:${String(trip.day)}:${String(trip.targetTileId)}:${trip.taskGroupType}`;

  if (trip.taskGroupType === "local_foraging_group") {
    return deriveLocalForagingDisplay(trip, variantKey);
  }

  const title = ((): string => {
    switch (trip.taskGroupType) {
      case "hunting_group":
        return pickVariant(variantKey, [
          "Hunting beyond camp",
          "Following animal tracks",
          "Sending a hunting party",
        ]);
      case "fishing_group":
        return pickVariant(variantKey, [
          "Fishing a known shore",
          "Working the water edge",
          "Checking fish places",
        ]);
      case "plant_gathering_group":
        return pickVariant(variantKey, [
          "Gathering at a known patch",
          "Working remembered plant ground",
          "Gathering away from camp",
        ]);
      case "water_group":
        return pickVariant(variantKey, [
          "Checking a water place",
          "Sending a water party",
          "Working known water",
        ]);
      case "plant_followup_group":
        return pickVariant(variantKey, [
          "Testing a remembered plant",
          "Checking plant safety",
          "Following up on a plant patch",
        ]);
      case "memory_refresh_group":
        return pickVariant(variantKey, [
          "Rechecking a known place",
          "Refreshing a route memory",
          "Scouting remembered ground",
        ]);
    }
  })();

  return {
    title,
    categoryLabel: spec.label,
    categoryKey,
    detail: deriveTripDetail(trip),
    reason: deriveTripReason(trip, categoryKey),
    icon: spec.icon,
    tone: spec.tone,
  };
}

function deriveLocalForagingDisplay(
  trip: IntraSeasonTripRecord,
  variantKey: string,
): ActivityTripDisplay {
  const categoryKey = deriveTripCategory(trip);
  const spec = CATEGORY[categoryKey];
  const title = ((): string => {
    switch (trip.resourceClassId) {
      case "aquatic_food":
        return pickVariant(variantKey, [
          "Fishing close to camp",
          "Working a familiar shore",
          "Checking nearby fish places",
        ]);
      case "animal_food":
        return pickVariant(variantKey, [
          "Watching animals near camp",
          "Hunting close to camp",
          "Following nearby animal sign",
        ]);
      case "generic_plant_food":
        return pickVariant(variantKey, [
          "Gathering around camp",
          "Working a known plant patch",
          "Foraging in familiar ground",
        ]);
      case "fallback_food":
        return pickVariant(variantKey, [
          "Gathering fallback foods",
          "Working ordinary foraging ground",
          "Keeping food work close",
        ]);
      default:
        return pickVariant(variantKey, [
          "Foraging around camp",
          "Working familiar ground",
          "Keeping work close to camp",
        ]);
    }
  })();

  return {
    title,
    categoryLabel: spec.label,
    categoryKey,
    detail: deriveTripDetail(trip),
    reason: deriveTripReason(trip, categoryKey),
    icon: spec.icon,
    tone: spec.tone,
  };
}

function deriveTripCategory(trip: IntraSeasonTripRecord): ActivityCategoryKey {
  if (trip.taskGroupType !== "local_foraging_group") {
    return TASK_CATEGORY[trip.taskGroupType];
  }

  switch (trip.resourceClassId) {
    case "aquatic_food":
      return "fishing";
    case "animal_food":
      return "hunting";
    case "generic_plant_food":
    case "fallback_food":
      return "gathering";
    default:
      return "camp";
  }
}

function deriveTripDetail(trip: IntraSeasonTripRecord): string {
  const timing =
    trip.outcome === "returns_same_day"
      ? "returns today"
      : trip.outcome === "overnight"
        ? "stays out overnight"
        : "continues for several days";
  const distance = `${trip.distanceTiles} tile${trip.distanceTiles === 1 ? "" : "s"} out`;
  const result = summarizeReturn(trip);

  return `${capFirst(timing)} · ${distance}${result === "" ? "" : ` · ${result}`}`;
}

function deriveTripReason(
  trip: IntraSeasonTripRecord,
  categoryKey: ActivityCategoryKey,
): string {
  if (trip.activityOutcome === "failed_due_to_season_mismatch") {
    return "They remembered the place, but this season did not match what they expected.";
  }
  if (trip.activityOutcome === "failed_due_to_water_risk") {
    return "They turned back because this water place is remembered as risky.";
  }
  if (trip.activityOutcome === "failed_due_to_low_memory_confidence" || trip.activityOutcome === "target_not_found") {
    return "The memory was weak, so the trip mostly checked whether the place still mattered.";
  }
  if (trip.outcome !== "returns_same_day") {
    return "The target is far enough that a task group ranges away while the camp stays put.";
  }

  switch (categoryKey) {
    case "water":
      return "Water pressure or water memory pulled a small group to a known source.";
    case "fishing":
      return "A known aquatic patch made the nearby water edge worth working.";
    case "hunting":
      return "The band knows animal sign here, but hunting remains uncertain work.";
    case "gathering":
      return "A remembered food patch is close enough for routine gathering.";
    case "plant_check":
      return "They have plant knowledge to verify, not a safe food claim.";
    case "scouting":
    case "route":
      return "The trip refreshes remembered ground instead of chasing unknown richness.";
    case "camp":
      return "The group is using familiar country without shifting the residential camp.";
    case "range":
      return "They are testing the edge of the country they already know.";
    case "rest":
      return "Most people are near camp while small tasks continue.";
  }
}

function summarizeReturn(trip: IntraSeasonTripRecord): string {
  switch (trip.resourceReturn.returnedResourceKind) {
    case "gathered_plant_food":
      return trip.plantPatchTrace === undefined
        ? "some gathered food"
        : `${humanizeInline(trip.plantPatchTrace.plantClassId)} worked (${humanizeInline(trip.plantPatchTrace.seasonalAvailability)})`;
    case "harvested_aquatic_food":
      return "fish found";
    case "hunted_fauna_food":
      return "animals taken";
    case "water_information":
      return "water checked";
    case "plant_information":
      return "plant knowledge";
    case "route_information":
      return "route memory";
    case "food_observation_only":
      return "food sign observed";
    case "none":
      return "";
  }
}

function humanizeInline(value: string): string {
  return value.replace(/_/g, " ");
}

function deriveMovementLine(
  band: Band,
  rangeContext: MovementContext,
  latestMove: ResidentialMoveEvent | undefined,
): string {
  if (latestMove !== undefined) {
    return `${describeMoveCause(latestMove.cause)} over ${latestMove.distanceTiles} tile${latestMove.distanceTiles === 1 ? "" : "s"}`;
  }

  switch (rangeContext) {
    case "within_known_range":
      return "Staying inside familiar country.";
    case "local_camp_shift":
      return "Moving camp within a known local circuit.";
    case "working_known_water":
      return "Keeping close to a known water core.";
    case "seasonal_round":
      return "Following a remembered seasonal circuit.";
    case "range_edge_probe":
      return "Testing the edge of known country.";
    case "leaving_familiar_country":
      return "Moving beyond the range they know well.";
    case "founding_new_range":
      return band.parentBandId === undefined
        ? "Trying to make a new familiar country."
        : "Trying to establish a daughter range.";
    case "unsettled_no_range":
      return "Still building a map of useful places.";
  }
}

function deriveIntentLine(
  band: Band,
  latestTripDisplay: ActivityTripDisplay | undefined,
  rangeContext: MovementContext,
  currentTick: TickNumber,
): string {
  const pressure = band.daughterColonization?.pressure ?? 0;

  if (pressure >= 0.45 && band.parentBandId !== undefined) {
    return "Short-term intent: build enough separate use-space to stop leaning on the parent core.";
  }
  if (rangeContext === "range_edge_probe" || rangeContext === "founding_new_range") {
    return "Short-term intent: turn known edge work into safer future options.";
  }
  if (latestTripDisplay !== undefined) {
    return `Short-term intent: ${lowerFirst(latestTripDisplay.reason)}`;
  }

  return pickVariant(`${String(band.id)}:${String(currentTick)}:intent`, [
    "Short-term intent: keep work close while conditions stay acceptable.",
    "Short-term intent: reuse known places before risking the edge.",
    "Short-term intent: hold the camp and send small groups out.",
  ]);
}

function deriveReasonLine(
  band: Band,
  latestTripDisplay: ActivityTripDisplay | undefined,
  rangeContext: MovementContext,
  activitySummary: BandActivityTimeSummary,
  currentTick: TickNumber,
): string {
  const pressure = derivePressureChip(band);

  if (pressure !== undefined) {
    return `${pressure.label}: ${pressure.title ?? "pressure is shaping daily choices."}`;
  }
  if (latestTripDisplay !== undefined) {
    return latestTripDisplay.reason;
  }
  if (activitySummary.tripCount > 0) {
    return activitySummary.detail;
  }

  switch (rangeContext) {
    case "working_known_water":
      return "The water core is known enough to anchor ordinary camp work.";
    case "range_edge_probe":
      return "They know enough nearby country to make edge checks useful.";
    case "seasonal_round":
      return "Repeated seasonal returns have made this circuit familiar.";
    case "founding_new_range":
      return "Pressure and known edge places are making a separate range plausible.";
    default:
      return pickVariant(`${String(band.id)}:${String(currentTick)}:reason`, [
        "Most signals point to routine work in known country.",
        "Their useful places are close enough for small daily parties.",
        "No strong pressure is pulling the whole camp away right now.",
      ]);
  }
}

function fallbackActivityLine(
  band: Band,
  rangeContext: MovementContext,
  currentTick: TickNumber,
): string {
  if ((band.activityLaborSummary?.peopleAtResidentialCenterEstimate ?? 0) > 0) {
    return pickVariant(`${String(band.id)}:${String(currentTick)}:camp`, [
      "Holding the camp together",
      "Keeping most people near camp",
      "Consolidating around camp",
    ]);
  }

  switch (rangeContext) {
    case "working_known_water":
      return "Working a known water place";
    case "range_edge_probe":
      return "Scouting the edge of known country";
    case "founding_new_range":
      return band.parentBandId === undefined ? "Searching for a new range" : "Establishing a daughter range";
    case "seasonal_round":
      return "Following a familiar route";
    default:
      return "Living from familiar country";
  }
}

function derivePressureChip(band: Band): LifeChip | undefined {
  const food = band.pressureState?.foodStress ?? 0;
  const water = band.pressureState?.waterStress ?? 0;
  const overlap = band.pressureState?.parentCoreOverlap ?? 0;
  const crowding = band.demography?.householdCrowdingPressure ?? 0;
  const founder = band.daughterColonization?.pressure ?? 0;

  if (water >= 0.48) {
    return { label: "Water pressure", icon: "water", tone: "pressure", title: "Known water stress is high." };
  }
  if (food >= 0.48) {
    return { label: "Food pressure", icon: "food", tone: "pressure", title: "Food stress is high." };
  }
  if (founder >= 0.45) {
    return { label: "Founder pressure", icon: "founding", tone: "exploring", title: "Daughter/fission pressure is strong enough to matter." };
  }
  if (overlap >= 0.45) {
    return { label: "Parent overlap", icon: "lineage", tone: "pressure", title: "This band still overlaps a parent core." };
  }
  if (crowding >= 0.52) {
    return { label: "Crowded camp", icon: "pressure", tone: "pressure", title: "Household crowding is high." };
  }
  return undefined;
}

function makeTripChip(display: ActivityTripDisplay, trip: IntraSeasonTripRecord): LifeChip {
  return {
    label: trip.outcome === "returns_same_day" ? "Day trip" : trip.outcome === "overnight" ? "Overnight" : "Long foray",
    icon: display.icon,
    tone: display.tone,
    title: display.detail,
  };
}

function makeOutcomeChip(trip: IntraSeasonTripRecord): LifeChip {
  if (trip.activityOutcome === "partial_success" || trip.activityOutcome === "target_found" || trip.activityOutcome === "successful_observation") {
    return { label: "Useful return", icon: "food", tone: "settled" };
  }
  if (trip.activityOutcome === "returned_with_information") {
    return { label: "Brought news", icon: "memory", tone: "exploring" };
  }
  if (trip.activityOutcome.startsWith("failed")) {
    return { label: "Checked and failed", icon: "uncertain", tone: "struggling" };
  }
  return { label: "Observed", icon: "memory", tone: "moving" };
}

function makeCampLifeChip(display: CampLifeDisplay): LifeChip {
  return {
    label: `${display.peopleAtCamp} at camp`,
    icon: display.icon,
    tone: display.tone,
    title: display.reason,
  };
}

function shortStatusFromActivity(display: ActivityTripDisplay): string {
  switch (display.categoryKey) {
    case "water":
      return "Working water";
    case "fishing":
      return "Fishing";
    case "hunting":
      return "Hunting";
    case "gathering":
      return "Gathering";
    case "plant_check":
      return "Checking plants";
    case "scouting":
      return "Scouting";
    case "route":
      return "Following route";
    case "range":
      return "Testing edge";
    case "camp":
      return "Near camp";
    case "rest":
      return "At camp";
  }
}

function countDisplays(trips: readonly IntraSeasonTripRecord[]): readonly {
  readonly key: ActivityCategoryKey;
  readonly label: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly count: number;
}[] {
  const counts = new Map<ActivityCategoryKey, number>();

  for (const trip of trips) {
    const key = deriveTripCategory(trip);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, ...CATEGORY[key] }))
    .sort((left, right) =>
      right.count === left.count
        ? left.label.localeCompare(right.label)
        : right.count - left.count,
    );
}

function countMostRepeatedRawLabel(trips: readonly IntraSeasonTripRecord[]): number {
  const counts = new Map<string, number>();
  let max = 0;

  for (const trip of trips) {
    counts.set(trip.groupLabel, (counts.get(trip.groupLabel) ?? 0) + 1);
    max = Math.max(max, counts.get(trip.groupLabel) ?? 0);
  }

  return max;
}

function describeMemoryPattern(trips: readonly IntraSeasonTripRecord[]): string {
  const info = trips.filter((trip) =>
    trip.resourceReturn.returnedResourceKind === "route_information" ||
    trip.resourceReturn.returnedResourceKind === "plant_information" ||
    trip.resourceReturn.returnedResourceKind === "water_information",
  ).length;
  const failures = trips.filter((trip) => trip.activityOutcome.startsWith("failed") || trip.activityOutcome === "target_not_found").length;

  if (info >= 2) {
    return " Several trips are memory work rather than food returns.";
  }
  if (failures >= 2) {
    return " Repeated failures are making the remembered places less certain.";
  }
  return "";
}

function getRecentTrips(band: Band): readonly IntraSeasonTripRecord[] {
  return [...(band.recentIntraSeasonTrips ?? [])].sort((left, right) => {
    const dayDelta = Number(right.day) - Number(left.day);

    return dayDelta === 0
      ? String(left.targetTileId).localeCompare(String(right.targetTileId))
      : dayDelta;
  });
}

function describeMoveCause(cause: string): string {
  switch (cause) {
    case "water_stress":
      return "Moved for water";
    case "poor_return":
      return "Left a weak camp";
    case "local_pressure":
      return "Shifted under local pressure";
    case "known_opportunity":
      return "Moved toward a known opportunity";
    case "fission_daughter":
      return "Settled a daughter band";
    case "frontier_intent":
      return "Shifted toward the frontier";
    case "seasonal_refuge_future":
      return "Moved toward a seasonal refuge";
    default:
      return "Shifted camp";
  }
}

function pickVariant(seed: string, variants: readonly string[]): string {
  if (variants.length === 0) {
    return "";
  }
  return variants[hashText(seed) % variants.length];
}

function hashText(text: string): number {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toLowerCase() + value.slice(1);
}

function capFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
