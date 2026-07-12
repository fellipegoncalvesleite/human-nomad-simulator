import type {
  Band,
  CarryingCapacityState,
  SeasonalHungerClassification,
  SeasonalSupportMode,
  SeasonalSupportSample,
  SeasonalSupportState,
} from "./types";
import type { ReasonId, WorldTime } from "../core/types";

const SEASONAL_MEMORY_WINDOW = 8;
const SHORT_WINDOW = 4;

export interface CanonicalNutritionState {
  readonly currentFoodStress: number;
  readonly recentFoodStress: number;
  readonly chronicFoodStress: number;
  readonly recoveryRelief: number;
  readonly foodMovementPressure: number;
  readonly foodDemographicPressure: number;
  // False ONLY when nutrition has not yet been measured (no physical-food interval
  // has completed for this band): a new/daughter band, an audit fixture with no
  // seasonalSupport, or a migrated legacy snapshot. Distinguishes "unknown / not
  // yet measured" (neutral) from a measured deficit (which can be severe).
  readonly nutritionStateAvailable: boolean;
}

// One authoritative translation from physical-support history into nutritional
// consequences. It never adds support and never reads habitat potential,
// remembered richness, projected trips, or the legacy hungerPressure field.
export function deriveCanonicalNutritionState(
  support: SeasonalSupportState | undefined,
): CanonicalNutritionState {
  if (support === undefined) {
    // UNMEASURED, not starving. `undefined` means the band has not yet completed a
    // physical-food interval (new/daughter/fixture/legacy) — treating that as
    // chronic hunger wrongly punished comfortable bands and daughter bands. It is
    // neutral. A KNOWN zero-food state is a DEFINED support with foodStress≈1 below,
    // which still yields severe stress, so this is not a free-food loophole:
    // production active bands receive a defined seasonalSupport once carrying state
    // exists (their first observed-tile interval), so this branch is transient.
    return {
      currentFoodStress: 0,
      recentFoodStress: 0,
      chronicFoodStress: 0,
      recoveryRelief: 0,
      foodMovementPressure: 0,
      foodDemographicPressure: 0,
      nutritionStateAvailable: false,
    };
  }

  const currentFoodStress = clamp01(support.currentSeasonSupport.foodStress);
  const recentFoodStress = clamp01(1 - support.rolling4SeasonSupport);
  const chronicFoodStress = clamp01(
    (support.chronicDeficitStreak / SEASONAL_MEMORY_WINDOW) * 0.58 +
      (support.deficitSeasonsLast8 / SEASONAL_MEMORY_WINDOW) * 0.42,
  );
  const recoveryRelief = clamp01(support.seasonalRecoveryStreak / SHORT_WINDOW);

  return {
    currentFoodStress: round2(currentFoodStress),
    recentFoodStress: round2(recentFoodStress),
    chronicFoodStress: round2(chronicFoodStress),
    recoveryRelief: round2(recoveryRelief),
    foodMovementPressure: round2(clamp01(
      currentFoodStress * 0.42 + recentFoodStress * 0.34 + chronicFoodStress * 0.34 - recoveryRelief * 0.16,
    )),
    foodDemographicPressure: round2(clamp01(
      currentFoodStress * 0.38 + recentFoodStress * 0.26 + chronicFoodStress * 0.48 - recoveryRelief * 0.14,
    )),
    nutritionStateAvailable: true,
  };
}

export function getCanonicalFoodStress(band: Band): number {
  return deriveCanonicalNutritionState(band.seasonalSupport).foodMovementPressure;
}

export function updateSeasonalSupportState(
  previous: SeasonalSupportState | undefined,
  carrying: CarryingCapacityState | undefined,
  band: Band,
  time: WorldTime,
): SeasonalSupportState | undefined {
  if (carrying === undefined) {
    return previous;
  }

  const support = carrying.perCapitaReturn.supportDebug;
  const yieldState = carrying.seasonalEffectiveYield;
  const seasonalModifier = round2(
    yieldState.basePotential <= 0 ? 1 : yieldState.effectiveYield / yieldState.basePotential,
  );
  // Current nourishment is owned by the canonical physical ledger. Do not feed
  // last tick's behavioral pressure back into food history: that stale loop made
  // a good harvest unable to clear hunger.
  const foodStress = clamp01(support.humanFoodLedger?.foodStress ?? support.deficitRatio);
  const waterStress = clamp01(band.pressureState?.waterStress ?? 0);
  const sample: SeasonalSupportSample = {
    tick: time.tick,
    year: time.year,
    season: time.season,
    rawSupportRatio: support.rawSupportRatio,
    clampedSupportRatio: support.clampedSupportRatio,
    perCapitaReturn: carrying.perCapitaReturn.perCapitaReturn,
    seasonalModifier,
    foodStress: round2(foodStress),
    waterStress: round2(waterStress),
    deficitRatio: support.deficitRatio,
    mode: classifySeasonalMode({
      seasonalModifier,
      foodStress,
      waterStress,
      deficitRatio: support.deficitRatio,
      previous,
    }),
  };

  const sameTick = previous !== undefined && Number(previous.lastUpdatedTick) === Number(time.tick);
  const baseSamples = sameTick ? previous.recentSamples.slice(0, -1) : previous?.recentSamples ?? [];
  const recentSamples = [...baseSamples, sample].slice(-SEASONAL_MEMORY_WINDOW);
  const lastSeasonSupport = baseSamples[baseSamples.length - 1];
  const seasonalHungerStreak = countTrailing(recentSamples, (entry) => isFoodHungry(entry) || isWaterHungry(entry));
  const chronicDeficitStreak = countTrailing(
    recentSamples,
    (entry) => entry.deficitRatio >= 0.16 || entry.rawSupportRatio < 0.88,
  );
  const seasonalRecoveryStreak = countTrailing(
    recentSamples,
    (entry) =>
      entry.rawSupportRatio >= 0.98 &&
      entry.perCapitaReturn >= 0.48 &&
      entry.foodStress < 0.32 &&
      entry.waterStress < 0.42,
  );
  const last4 = recentSamples.slice(-SHORT_WINDOW);
  const deficitSeasonsLast4 = last4.filter((entry) => entry.deficitRatio >= 0.12 || entry.rawSupportRatio < 0.92).length;
  const deficitSeasonsLast8 = recentSamples.filter((entry) => entry.deficitRatio >= 0.12 || entry.rawSupportRatio < 0.92).length;
  const waterStressSeasonsLast4 = last4.filter((entry) => entry.waterStress >= 0.5).length;
  const waterStressSeasonsLast8 = recentSamples.filter((entry) => entry.waterStress >= 0.5).length;
  const rolling4SeasonSupport = round2(mean(last4.map((entry) => entry.clampedSupportRatio)));
  const rolling8SeasonSupport = round2(mean(recentSamples.map((entry) => entry.clampedSupportRatio)));
  const rolling4SeasonReturn = round2(mean(last4.map((entry) => entry.perCapitaReturn)));
  const rolling8SeasonReturn = round2(mean(recentSamples.map((entry) => entry.perCapitaReturn)));
  const hungerClassification = classifyHunger({
    sample,
    deficitSeasonsLast4,
    deficitSeasonsLast8,
    waterStressSeasonsLast8,
    seasonalHungerStreak,
    chronicDeficitStreak,
    seasonalRecoveryStreak,
    previous,
  });
  const chronicDeficitClassification = classifyChronicDeficit({
    sample,
    deficitSeasonsLast8,
    waterStressSeasonsLast8,
    chronicDeficitStreak,
    seasonalRecoveryStreak,
  });

  const baseState: SeasonalSupportState = {
    bandId: band.id,
    lastUpdatedTick: time.tick,
    currentSeasonSupport: sample,
    ...(lastSeasonSupport === undefined ? {} : { lastSeasonSupport }),
    rolling4SeasonSupport,
    rolling8SeasonSupport,
    rolling4SeasonReturn,
    rolling8SeasonReturn,
    returnTrend4Season: round2(sample.perCapitaReturn - rolling4SeasonReturn),
    returnTrend8Season: round2(sample.perCapitaReturn - rolling8SeasonReturn),
    recentSamples,
    seasonalHungerStreak,
    chronicDeficitStreak,
    seasonalRecoveryStreak,
    deficitSeasonsLast4,
    deficitSeasonsLast8,
    waterStressSeasonsLast4,
    waterStressSeasonsLast8,
    hungerClassification,
    chronicDeficitClassification,
    populationStableDespiteRecurringHunger: hasStablePopulationButRecurringHunger(band, deficitSeasonsLast8),
    topSeasonalSupportReasons: getTopSeasonalSupportReasons(carrying, sample),
    reasonIds: makeSeasonalSupportReasonIds(band, time, hungerClassification),
  };
  const nutrition = deriveCanonicalNutritionState(baseState);

  return {
    ...baseState,
    ...nutrition,
  };
}

function classifySeasonalMode(input: {
  readonly seasonalModifier: number;
  readonly foodStress: number;
  readonly waterStress: number;
  readonly deficitRatio: number;
  readonly previous: SeasonalSupportState | undefined;
}): SeasonalSupportMode {
  if (
    input.previous?.hungerClassification !== undefined &&
    input.previous.hungerClassification !== "stable" &&
    input.deficitRatio < 0.08 &&
    input.foodStress < 0.34
  ) {
    return "recovery";
  }

  if (input.waterStress >= 0.55) {
    return "dry";
  }

  if (input.deficitRatio >= 0.12 || input.foodStress >= 0.46 || input.seasonalModifier < 0.84) {
    return "lean";
  }

  if (input.seasonalModifier > 1.06 || input.foodStress < 0.22) {
    return "pulse";
  }

  if (input.waterStress < 0.28) {
    return "wet";
  }

  return "neutral";
}

function classifyHunger(input: {
  readonly sample: SeasonalSupportSample;
  readonly deficitSeasonsLast4: number;
  readonly deficitSeasonsLast8: number;
  readonly waterStressSeasonsLast8: number;
  readonly seasonalHungerStreak: number;
  readonly chronicDeficitStreak: number;
  readonly seasonalRecoveryStreak: number;
  readonly previous: SeasonalSupportState | undefined;
}): SeasonalHungerClassification {
  if (input.sample.rawSupportRatio < 0.58 || (input.chronicDeficitStreak >= 6 && input.sample.deficitRatio > 0.28)) {
    return "crisis_deficit";
  }

  if (input.chronicDeficitStreak >= 4 && input.seasonalHungerStreak >= 2) {
    return "chronic_plus_seasonal_stress";
  }

  if (input.chronicDeficitStreak >= 4 || input.deficitSeasonsLast8 >= 5) {
    return "chronic_food_deficit";
  }

  if (input.waterStressSeasonsLast8 >= 5) {
    return "chronic_water_deficit";
  }

  if (
    input.seasonalRecoveryStreak > 0 &&
    input.previous !== undefined &&
    input.previous.hungerClassification !== "stable"
  ) {
    return "recovery_after_crisis";
  }

  if (input.sample.mode === "pulse" || input.sample.mode === "recovery") {
    return "seasonal_pulse_recovery";
  }

  if (input.sample.waterStress >= 0.5) {
    return "seasonal_water_stress";
  }

  if (input.sample.deficitRatio >= 0.08 || input.sample.foodStress >= 0.4 || input.deficitSeasonsLast4 >= 1) {
    return "seasonal_lean_stress";
  }

  return "stable";
}

function classifyChronicDeficit(input: {
  readonly sample: SeasonalSupportSample;
  readonly deficitSeasonsLast8: number;
  readonly waterStressSeasonsLast8: number;
  readonly chronicDeficitStreak: number;
  readonly seasonalRecoveryStreak: number;
}): SeasonalHungerClassification {
  if (input.sample.rawSupportRatio < 0.58 || input.chronicDeficitStreak >= 8) {
    return "crisis_deficit";
  }

  if (input.chronicDeficitStreak >= 4 || input.deficitSeasonsLast8 >= 5) {
    return input.sample.mode === "lean" || input.sample.mode === "dry"
      ? "chronic_plus_seasonal_stress"
      : "chronic_food_deficit";
  }

  if (input.waterStressSeasonsLast8 >= 5) {
    return "chronic_water_deficit";
  }

  if (input.seasonalRecoveryStreak >= 2) {
    return "recovery_after_crisis";
  }

  return "stable";
}

function getTopSeasonalSupportReasons(
  carrying: CarryingCapacityState,
  sample: SeasonalSupportSample,
): readonly string[] {
  const support = carrying.perCapitaReturn.supportDebug;
  const yieldState = carrying.seasonalEffectiveYield;
  const reasons: string[] = [];

  if (sample.mode === "lean") {
    reasons.push("lean season reduced effective yield");
  } else if (sample.mode === "pulse") {
    reasons.push("pulse season improved current return");
  } else if (sample.mode === "dry") {
    reasons.push("dry season raised water urgency");
  } else if (sample.mode === "wet") {
    reasons.push("wet season lowered water urgency");
  } else if (sample.mode === "recovery") {
    reasons.push("recovery season after earlier stress");
  }

  // WHOLE-UI-READABILITY-HISTORY-FUN-1B — these lines render in normal UI
  // (Survival, Overview lead); exact loss values stay in Technical fields.
  if ((support.seasonalLoss ?? 0) > 0.5) {
    reasons.push("the season reduced returns noticeably");
  }
  if ((support.sharedPressureLoss ?? 0) > 0.5) {
    reasons.push("neighboring bands are thinning the shared range");
  }
  if ((support.depletionLoss ?? 0) > 0.5) {
    reasons.push("worn ground gives less than it used to");
  }
  if ((support.faunaSupportLoss ?? 0) > 0.3) {
    reasons.push("animal and water foods are running thin");
  }
  if ((support.plantSupportLoss ?? 0) > 0.3) {
    reasons.push("plant patches are giving thin returns");
  }
  if (yieldState.localUsePenalty > 0.2) {
    reasons.push("the closest ground is overused");
  }
  if (yieldState.recoveryBonus > 0.18) {
    reasons.push("rested ground nearby is bouncing back");
  }

  return reasons.length === 0 ? ["the season is treating them about evenly"] : reasons.slice(0, 5);
}

function hasStablePopulationButRecurringHunger(band: Band, deficitSeasonsLast8: number): boolean {
  const churn = band.demography.demographicChurn;
  if (churn === undefined) {
    return deficitSeasonsLast8 >= 3 && (band.demography.lastBirths ?? 0) === (band.demography.lastDeaths ?? 0);
  }

  return deficitSeasonsLast8 >= 3 && Math.abs(churn.netPopulationChangeLast10Years) <= 2 && churn.deathsLast10Years > 0;
}

function makeSeasonalSupportReasonIds(
  band: Band,
  time: WorldTime,
  classification: SeasonalHungerClassification,
): readonly ReasonId[] {
  return [`reason:seasonal-support:${band.id}:${time.tick}:${classification}` as ReasonId];
}

function isFoodHungry(sample: SeasonalSupportSample): boolean {
  return sample.deficitRatio >= 0.1 || sample.foodStress >= 0.42 || sample.rawSupportRatio < 0.94;
}

function isWaterHungry(sample: SeasonalSupportSample): boolean {
  return sample.waterStress >= 0.5;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countTrailing(
  samples: readonly SeasonalSupportSample[],
  predicate: (sample: SeasonalSupportSample) => boolean,
): number {
  let count = 0;

  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (!predicate(samples[index])) {
      break;
    }
    count += 1;
  }

  return count;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
