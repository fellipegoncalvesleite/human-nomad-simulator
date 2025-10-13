import type { Band } from "./types";
import type { NomadicScaleClass, NomadicScalePressureState } from "./types";
import type { ReasonId, WorldTime } from "../core/types";

export const NOMADIC_MAX_MOBILE_BANDS_WARNING_COUNT = 36;

interface NomadicScaleInput {
  readonly rawSupportRatio: number;
  readonly sharedPressurePenalty: number;
  readonly footprintDepletionPenalty: number;
  readonly resourceClassPressureLoss: number;
  readonly recoveryBuffer: number;
  readonly highRankPersistence: number;
  readonly overlapCount: number;
  readonly activeBandCount: number;
  readonly time: WorldTime;
}

export function getNomadicScaleClass(population: number): NomadicScaleClass {
  if (population >= 1000) {
    return "failure_warning";
  }

  if (population >= 300) {
    return "mega_band";
  }

  if (population >= 150) {
    return "aggregation";
  }

  if (population >= 80) {
    return "large_band";
  }

  return "normal_band";
}

export function getNomadicScaleDemandMultiplier(population: number): number {
  const large = clamp01((population - 80) / 220);
  const aggregation = clamp01((population - 150) / 350);
  const mega = clamp01((population - 300) / 700);

  return round2(1 + large * 0.06 + aggregation * 0.09 + mega * 0.14);
}

export function deriveNomadicScalePressure(
  band: Band,
  input: NomadicScaleInput,
): NomadicScalePressureState {
  const population = Math.max(0, Math.round(band.demography.population));
  const scaleClass = getNomadicScaleClass(population);
  const large = clamp01((population - 80) / 220);
  const aggregation = clamp01((population - 150) / 350);
  const mega = clamp01((population - 300) / 700);
  const deficit = clamp01(1 - input.rawSupportRatio);
  const pressureLoss = clamp01(
    input.sharedPressurePenalty * 0.34 +
      input.footprintDepletionPenalty * 0.28 +
      input.resourceClassPressureLoss * 0.28,
  );
  const ecologyRelief = clamp01(
    input.highRankPersistence * 0.26 +
      input.recoveryBuffer * 0.16 +
      Math.max(0, input.rawSupportRatio - 1) * 0.16,
  );
  const overlapPressure = clamp01(input.overlapCount / 8);
  const nomadicScalePressure = clamp01(
    large * 0.32 +
      aggregation * 0.26 +
      mega * 0.3 +
      deficit * 0.28 +
      pressureLoss * 0.2 +
      overlapPressure * 0.1 -
      ecologyRelief * 0.18,
  );
  const logisticalInefficiencyPenalty = round2(
    clamp01(
      large * 0.1 +
        aggregation * 0.14 +
        mega * 0.18 +
        deficit * 0.04 +
        pressureLoss * 0.05 -
        ecologyRelief * 0.1,
    ),
  );
  const largeBandFissionPressure = clamp01(
    large * 0.3 +
      aggregation * 0.32 +
      mega * 0.28 +
      deficit * 0.18 +
      input.sharedPressurePenalty * 0.12,
  );
  const aggregationStress = clamp01(
    aggregation * 0.42 +
      mega * 0.34 +
      deficit * 0.16 +
      pressureLoss * 0.18,
  );
  const maxBandCapBlockingFission =
    input.activeBandCount >= NOMADIC_MAX_MOBILE_BANDS_WARNING_COUNT &&
    largeBandFissionPressure > 0.44 &&
    population >= 120;
  const megaBandWarning = population >= 300 || maxBandCapBlockingFission;
  const reasonIds: ReasonId[] = [];

  if (nomadicScalePressure > 0.18) {
    reasonIds.push(makeReasonId(input.time, band.id, "nomadic_scale_pressure"));
  }

  if (logisticalInefficiencyPenalty > 0.04) {
    reasonIds.push(makeReasonId(input.time, band.id, "logistical_inefficiency"));
  }

  if (largeBandFissionPressure > 0.36) {
    reasonIds.push(makeReasonId(input.time, band.id, "large_band_fission_pressure"));
  }

  if (maxBandCapBlockingFission) {
    reasonIds.push(makeReasonId(input.time, band.id, "mobile_band_cap_blocking_fragmentation"));
  }

  if (population >= 1000) {
    reasonIds.push(makeReasonId(input.time, band.id, "mega_band_failure_warning"));
  }

  return {
    bandId: band.id,
    population,
    scaleClass,
    nomadicScalePressure: round2(nomadicScalePressure),
    logisticalInefficiencyPenalty,
    largeBandFissionPressure: round2(largeBandFissionPressure),
    aggregationStress: round2(aggregationStress),
    ecologyRelief: round2(ecologyRelief),
    megaBandWarning,
    maxBandCapBlockingFission,
    reasonIds,
  };
}

function makeReasonId(time: WorldTime, bandId: string, suffix: string): ReasonId {
  return `reason:${bandId}:${time.tick}:nomadic_scale:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
