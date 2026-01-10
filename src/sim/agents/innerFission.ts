import type { ReasonId } from "../core/types";
import type {
  Band,
  InnerFissionState,
  InnerFissionStateKind,
  SocialRelationCategory,
  SocialTensionReadabilityState,
  SocialTensionRelationSummary,
} from "./types";
import type { WorldState } from "../world/types";

export function deriveInnerFissionState(world: WorldState, band: Band): InnerFissionState {
  const population = Math.max(1, Math.round(band.demography.population));
  const seasonal = band.seasonalSupport;
  const viability = band.viability;
  const pressure = band.pressureState;
  const recentMove = band.recentResidentialMoveEvents?.[0];
  const supportSeeking =
    viability?.weakBandFate === "support_seeking" ||
    viability?.weakBandClassification === "seeking_support" ||
    viability?.supportSeekingBlockedReason !== undefined;
  const hungerTension = clamp01(
    Math.max(
      seasonal?.currentSeasonSupport.foodStress ?? 0,
      seasonal?.currentSeasonSupport.deficitRatio ?? 0,
      seasonal?.hungerClassification === "seasonal_lean_stress" ? 0.28 : 0,
      seasonal?.hungerClassification === "chronic_food_deficit" ? 0.44 : 0,
      seasonal?.hungerClassification === "chronic_plus_seasonal_stress" ? 0.58 : 0,
      seasonal?.hungerClassification === "crisis_deficit" ? 0.78 : 0,
      band.demography.foodPerPersonStress * 0.78,
    ),
  );
  const waterTension = clamp01(
    Math.max(
      pressure?.waterStress ?? 0,
      seasonal?.currentSeasonSupport.waterStress ?? 0,
      seasonal?.hungerClassification === "seasonal_water_stress" ? 0.34 : 0,
      seasonal?.hungerClassification === "chronic_water_deficit" ? 0.54 : 0,
    ),
  );
  const deathTension = clamp01(
    (band.deathMemory?.deathMemorySeverity ?? 0) * 0.92 +
      (band.deathMemory?.recentDependentDeaths ?? 0) * 0.08 +
      (band.deathMemory?.recentAdultDeaths ?? 0) * 0.1,
  );
  const migrationTension = clamp01(
    (recentMove?.hardshipRisk ?? 0) * 0.72 +
      (recentMove?.hardshipOutcome === "rejected" ? 0.22 : 0) +
      (recentMove?.hardshipOutcome === "delayed" ? 0.16 : 0),
  );
  const supportSeekingTension = clamp01(
    supportSeeking ? 0.34 + (viability?.extinctionRisk ?? 0) * 0.36 : 0,
  );
  const crowdingTension = clamp01(
    Math.max(
      band.demography.householdCrowdingPressure,
      band.rangeSaturation?.saturationPressure ?? 0,
      band.rangeSaturation?.nearbyCrowding ?? 0,
      band.pressureState?.nearbyBandPressure ?? 0,
    ),
  );
  const lowLaborTension = clamp01(
    Math.max(
      band.carryingCapacity === undefined ? 0 : 1 - band.carryingCapacity.populationDemand.laborCapacity / Math.max(1, band.demography.population * 0.48),
      band.demography.workingAdults / population < 0.34 ? 0.42 : 0,
    ),
  );
  const splitPressure = band.demography.splitPressure;
  const fissionScaleTension = clamp01(
    Math.max(
      splitPressure,
      band.nomadicScalePressure?.largeBandFissionPressure ?? 0,
      band.socialPressure.fissionPressure * 0.8,
    ),
  );
  const pressureScore = round2(clamp01(
    fissionScaleTension * 0.22 +
      crowdingTension * 0.18 +
      hungerTension * 0.18 +
      waterTension * 0.12 +
      deathTension * 0.1 +
      migrationTension * 0.1 +
      supportSeekingTension * 0.08 +
      lowLaborTension * 0.12,
  ));
  const splitDelayedReason = getSplitDelayedReason({
    band,
    pressureScore,
    population,
    lowLaborTension,
    recentMoveRisk: recentMove?.hardshipRisk ?? 0,
    viabilityRisk: viability?.extinctionRisk ?? 0,
  });
  const unityRecoveryReason = getUnityRecoveryReason(band, pressureScore);
  const state = classifyInnerFissionState(pressureScore, splitPressure, splitDelayedReason, unityRecoveryReason);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    state,
    pressureScore,
    topCauses: topCauses([
      ["overcrowding / group scale pressure", Math.max(crowdingTension, fissionScaleTension)],
      ["repeated hunger or poor per-capita support", hungerTension],
      ["water stress", waterTension],
      ["recent deaths", deathTension],
      ["migration hardship", migrationTension],
      ["weak-band support seeking", supportSeekingTension],
      ["adult labor strain", lowLaborTension],
    ]),
    splitDelayed: splitDelayedReason !== undefined,
    ...(splitDelayedReason === undefined ? {} : { splitDelayedReason }),
    unityRecovering: unityRecoveryReason !== undefined,
    ...(unityRecoveryReason === undefined ? {} : { unityRecoveryReason }),
    hungerTension: round2(hungerTension),
    waterTension: round2(waterTension),
    deathTension: round2(deathTension),
    migrationTension: round2(migrationTension),
    supportSeekingTension: round2(supportSeekingTension),
    scoutingPressure: round2(clamp01(hungerTension * 0.28 + waterTension * 0.24 + crowdingTension * 0.18 + supportSeekingTension * 0.18)),
    residentialDebatePressure: round2(clamp01(pressureScore * 0.62 + (pressure?.netMovePressure ?? 0) * 0.26)),
    supportSeekingPressure: round2(clamp01(supportSeekingTension + lowLaborTension * 0.18 + deathTension * 0.12)),
    protoIdentityHook: pressureScore >= 0.5 || state === "near_split" || state === "split_delayed",
    eventHooks: getInnerFissionEventHooks(state, {
      hungerTension,
      waterTension,
      deathTension,
      migrationTension,
      supportSeekingTension,
      splitDelayedReason,
    }),
    reasonIds: [`reason:inner-fission:${band.id}:${world.time.tick}:${state}` as ReasonId],
  };
}

export function deriveSocialTensionReadabilityState(
  world: WorldState,
  band: Band,
): SocialTensionReadabilityState {
  const contactSummaries = summarizeContacts(band);
  const toleranceValues = contactSummaries.map((entry) => entry.tolerance);
  const meanTolerance = toleranceValues.length === 0 ? band.cohesion : mean(toleranceValues);
  const maxContactTension = contactSummaries.reduce((max, entry) => Math.max(max, entry.tension), 0);
  const rangeFrictionTension = clamp01(
    (band.recentRangeFrictionEvents ?? []).reduce((sum, event) => sum + rangeFrictionValue(event.tensionLevel), 0) / 4,
  );
  const protectiveVaguenessCount =
    band.reportedKnowledge?.reports.filter((report) => report.sourceBiasKind === "protective_vagueness").length ?? 0;
  const directionBlurredCount =
    band.reportedKnowledge?.reports.filter((report) => report.distortionLevel === "direction_blurred").length ?? 0;
  const crowdedKinResourcePressure = clamp01(
    Math.max(
      band.rangeSaturation?.nearbyCrowding ?? 0,
      band.rangeSaturation?.localUsePressure ?? 0,
      band.ecologicalStressCauses?.sharedCatchmentCrowding ?? 0,
      band.pressureState?.nearbyBandPressure ?? 0,
    ),
  );
  const cohesion = clamp01(Math.min(band.cohesion, band.disposition?.cohesion ?? band.cohesion));
  const socialTensionPressure = round2(clamp01(
    (1 - cohesion) * 0.28 +
      (1 - meanTolerance) * 0.2 +
      maxContactTension * 0.18 +
      crowdedKinResourcePressure * 0.16 +
      rangeFrictionTension * 0.12 +
      Math.min(1, protectiveVaguenessCount + directionBlurredCount) * 0.06,
  ));

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    cohesion: round2(cohesion),
    cohesionStatus: getCohesionStatus(cohesion),
    tolerance: round2(meanTolerance),
    toleranceStatus: getToleranceStatus(meanTolerance),
    hostilityStatus: getHostilityStatus(meanTolerance, maxContactTension),
    crowdedKinResourcePressure: round2(crowdedKinResourcePressure),
    crowdedKinResourcePressureStatus: getCrowdedKinStatus(crowdedKinResourcePressure, contactSummaries),
    socialTensionPressure,
    protectiveVaguenessCount,
    directionBlurredCount,
    protectiveVaguenessStatus: getVaguenessStatus(protectiveVaguenessCount, directionBlurredCount, crowdedKinResourcePressure),
    relationCategories: contactSummaries.slice(0, 6),
    topCauses: topCauses([
      ["low internal cohesion", 1 - cohesion],
      ["low tolerance / hostile contact memory", Math.max(1 - meanTolerance, maxContactTension)],
      ["crowded food/water pressure", crowdedKinResourcePressure],
      ["range-friction notices", rangeFrictionTension],
      ["protective vagueness or blurred directions", Math.min(1, (protectiveVaguenessCount + directionBlurredCount) / 3)],
    ]),
    eventHooks: getSocialTensionEventHooks({
      socialTensionPressure,
      crowdedKinResourcePressure,
      protectiveVaguenessCount,
      directionBlurredCount,
      meanTolerance,
      cohesion,
    }),
    reasonIds: [`reason:social-tension:${band.id}:${world.time.tick}:${getTensionReasonSuffix(socialTensionPressure)}` as ReasonId],
  };
}

function classifyInnerFissionState(
  pressureScore: number,
  splitPressure: number,
  splitDelayedReason: string | undefined,
  unityRecoveryReason: string | undefined,
): InnerFissionStateKind {
  if (unityRecoveryReason !== undefined) {
    return "split_resolved";
  }

  if (splitDelayedReason !== undefined && (pressureScore >= 0.42 || splitPressure >= 0.5)) {
    return "split_delayed";
  }

  if (pressureScore >= 0.68 || splitPressure >= 0.62) {
    return "near_split";
  }

  if (pressureScore >= 0.54) {
    return "factional";
  }

  if (pressureScore >= 0.4) {
    return "divided";
  }

  if (pressureScore >= 0.24) {
    return "strained";
  }

  return "unified";
}

function getSplitDelayedReason(input: {
  readonly band: Band;
  readonly pressureScore: number;
  readonly population: number;
  readonly lowLaborTension: number;
  readonly recentMoveRisk: number;
  readonly viabilityRisk: number;
}): string | undefined {
  if (input.pressureScore < 0.32 && input.band.demography.splitPressure < 0.44) {
    return undefined;
  }

  if (input.population < 46) {
    return "population too low for safe daughter fission";
  }

  const dependencyLoad = input.population <= 0
    ? 0
    : (input.band.demography.dependents + input.band.demography.elders) / input.population;

  if (dependencyLoad >= 0.58) {
    return "dependents/elders make a split unsafe";
  }

  if (input.lowLaborTension >= 0.48) {
    return "adult labor too thin for a safe split";
  }

  if (input.recentMoveRisk >= 0.62) {
    return "recent migration hardship makes a split unsafe";
  }

  if (input.viabilityRisk >= 0.56) {
    return "weak-band collapse risk takes priority over splitting";
  }

  return undefined;
}

function getUnityRecoveryReason(band: Band, pressureScore: number): string | undefined {
  const previous = band.innerFission;
  const support = band.seasonalSupport;

  if (
    previous !== undefined &&
    previous.pressureScore >= 0.34 &&
    pressureScore <= 0.22 &&
    (support?.hungerClassification === "stable" || support?.hungerClassification === "seasonal_pulse_recovery" || support?.hungerClassification === "recovery_after_crisis")
  ) {
    return "support recovered and fission pressure eased";
  }

  return undefined;
}

function summarizeContacts(band: Band): readonly SocialTensionRelationSummary[] {
  const summaries: SocialTensionRelationSummary[] = [{
    category: "us",
    grounding: "selected band",
    tolerance: clamp01(band.cohesion),
    tension: clamp01(1 - band.cohesion),
  }];

  for (const contact of Object.values(band.contactMemories)) {
    summaries.push({
      otherBandId: contact.otherBandId,
      category: contactCategory(contact.relation),
      grounding: `contact memory: ${contact.relation}`,
      tolerance: round2(contact.trustLikeTolerance),
      tension: round2(clamp01(contact.tension + contact.strainedContactCount * 0.08 + contact.avoidanceCount * 0.06)),
    });
  }

  for (const known of band.knowledge.knownBands) {
    if (known.bandId === undefined || summaries.some((entry) => entry.otherBandId === known.bandId)) {
      continue;
    }
    summaries.push({
      otherBandId: known.bandId,
      category: "unknown",
      grounding: `known band record: ${known.contactKind}`,
      tolerance: round2(clamp01(0.38 + known.confidence * 0.12)),
      tension: round2(clamp01(0.16 + (1 - known.confidence) * 0.1)),
    });
  }

  return summaries.sort((left, right) =>
    right.tension - left.tension ||
    String(left.otherBandId ?? left.category).localeCompare(String(right.otherBandId ?? right.category)),
  );
}

function contactCategory(relation: "parent_daughter" | "siblings" | "unrelated" | "unknown"): SocialRelationCategory {
  switch (relation) {
    case "parent_daughter":
    case "siblings":
      return "close_kin";
    case "unrelated":
      return "familiar_neighbor";
    default:
      return "unknown";
  }
}

function getCohesionStatus(cohesion: number): string {
  if (cohesion <= 0.12) return "internal fracture";
  if (cohesion <= 0.32) return "badly divided";
  if (cohesion <= 0.56) return "strained cohesion";
  if (cohesion <= 0.76) return "mostly cohesive";
  return "unified";
}

function getToleranceStatus(tolerance: number): string {
  if (tolerance <= 0.08) return "open hostility / spiteful silence";
  if (tolerance <= 0.28) return "hostile avoidance";
  if (tolerance <= 0.48) return "watchful tolerance";
  if (tolerance <= 0.72) return "cautious cooperation";
  return "trusted cooperation";
}

function getHostilityStatus(tolerance: number, tension: number): string {
  if (tolerance <= 0.08 || tension >= 0.72) return "open hostility / spiteful silence";
  if (tension >= 0.48) return "resource suspicion";
  if (tension >= 0.28) return "watchful unease";
  return "no strong hostility signal";
}

function getCrowdedKinStatus(
  pressure: number,
  contacts: readonly SocialTensionRelationSummary[],
): string {
  const hasKin = contacts.some((entry) => entry.category === "close_kin" || entry.category === "distant_kin");

  if (pressure >= 0.58 && hasKin) {
    return "resource paranoia around related bands";
  }

  if (pressure >= 0.42) {
    return "crowding around food/water";
  }

  if (hasKin) {
    return "kin nearby without strong resource pressure";
  }

  return "no crowded-kin pressure";
}

function getVaguenessStatus(
  protectiveVaguenessCount: number,
  directionBlurredCount: number,
  crowdedKinResourcePressure: number,
): string {
  if (protectiveVaguenessCount > 0 && directionBlurredCount > 0 && crowdedKinResourcePressure >= 0.34) {
    return "suspiciously vague directions under crowding pressure";
  }

  if (protectiveVaguenessCount > 0) {
    return "protective vagueness present in reports";
  }

  if (directionBlurredCount > 0) {
    return "blurred directions present in reports";
  }

  return "no protective-vagueness signal";
}

function rangeFrictionValue(level: "none" | "watchful" | "mild" | "moderate_placeholder"): number {
  switch (level) {
    case "moderate_placeholder":
      return 0.56;
    case "mild":
      return 0.34;
    case "watchful":
      return 0.18;
    default:
      return 0;
  }
}

function getInnerFissionEventHooks(
  state: InnerFissionStateKind,
  input: {
    readonly hungerTension: number;
    readonly waterTension: number;
    readonly deathTension: number;
    readonly migrationTension: number;
    readonly supportSeekingTension: number;
    readonly splitDelayedReason?: string;
  },
): readonly string[] {
  const hooks: string[] = [`inner_fission_state:${state}`];

  if (input.hungerTension >= 0.34) hooks.push("seasonal_hunger_tension");
  if (input.waterTension >= 0.34) hooks.push("water_stress_tension");
  if (input.deathTension >= 0.22) hooks.push("recent_death_tension");
  if (input.migrationTension >= 0.28) hooks.push("migration_hardship_tension");
  if (input.supportSeekingTension >= 0.28) hooks.push("support_seeking_tension");
  if (input.splitDelayedReason !== undefined) hooks.push("split_delayed");

  return hooks.slice(0, 8);
}

function getSocialTensionEventHooks(input: {
  readonly socialTensionPressure: number;
  readonly crowdedKinResourcePressure: number;
  readonly protectiveVaguenessCount: number;
  readonly directionBlurredCount: number;
  readonly meanTolerance: number;
  readonly cohesion: number;
}): readonly string[] {
  const hooks: string[] = [`social_tension:${getTensionReasonSuffix(input.socialTensionPressure)}`];

  if (input.crowdedKinResourcePressure >= 0.34) hooks.push("crowded_resource_pressure");
  if (input.protectiveVaguenessCount > 0) hooks.push("protective_vagueness");
  if (input.directionBlurredCount > 0) hooks.push("direction_blurred");
  if (input.meanTolerance <= 0.28) hooks.push("low_tolerance");
  if (input.cohesion <= 0.34) hooks.push("low_cohesion");

  return hooks.slice(0, 8);
}

function getTensionReasonSuffix(pressure: number): string {
  if (pressure >= 0.62) return "high";
  if (pressure >= 0.38) return "moderate";
  if (pressure >= 0.18) return "watchful";
  return "low";
}

function topCauses(entries: readonly (readonly [string, number])[]): readonly string[] {
  return entries
    .filter((entry) => entry[1] >= 0.12)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map((entry) => `${entry[0]} ${round2(entry[1])}`);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
