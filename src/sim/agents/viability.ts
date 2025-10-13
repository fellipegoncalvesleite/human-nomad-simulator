import type {
  Band,
  BandDemography,
  BandViabilityState,
  CausalTrace,
} from "./types";
import type { BandId, ReasonId, TileId } from "../core/types";
import { getTile } from "../world/generate";
import type { WorldState } from "../world/types";

const MINIMUM_VIABLE_POPULATION = 14;

export function updateBandViabilityStates(world: WorldState): WorldState {
  let bandsById: Record<string, Band> = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((output, band) => {
      output[band.id] = {
        ...band,
        viability: deriveBandViabilityState(world, band),
      };
      return output;
    }, {});

  for (const band of Object.values(bandsById).sort(compareBands)) {
    if (
      band.viability === undefined ||
      band.viability.status !== "nonviable" ||
      band.status === "dispersed"
    ) {
      continue;
    }

    const target = getAbsorptionTarget(
      {
        ...world,
        bands: bandsById as Readonly<Record<BandId, Band>>,
      },
      band,
    );

    if (target !== undefined && band.viability.absorptionOpportunity >= 0.46) {
      const absorbingBand = bandsById[target.id];

      if (absorbingBand === undefined) {
        continue;
      }

      const transferredPopulation = toPopulationCount(band.demography.population);
      const absorbedReasonId = makeViabilityReasonId(world, band.id, "absorption_preferred_over_extinction");
      const absorbedTrace = makeViabilityTrace(
        world,
        band.id,
        "band_absorbed",
        band.position,
        target.position,
        transferredPopulation,
        absorbedReasonId,
      );

      bandsById[target.id] = {
        ...absorbingBand,
        size: Math.round(absorbingBand.demography.population + transferredPopulation),
        demography: recomputeDemographicCounts({
          ...absorbingBand.demography,
          population: absorbingBand.demography.population + transferredPopulation,
          lastPopulationChangeReasonIds: [absorbedReasonId],
        }),
        causalTraces: [...absorbingBand.causalTraces, absorbedTrace].slice(-80),
      };
      bandsById[band.id] = {
        ...band,
        size: 0,
        status: "dispersed",
        demography: recomputeDemographicCounts({
          ...band.demography,
          population: 0,
          growthAccumulator: 0,
          mortalityAccumulator: 0,
          lastPopulationChangeReasonIds: [absorbedReasonId],
          splitPressure: 0,
        }),
        viability: {
          ...band.viability,
          status: target.id === band.parentBandId ? "absorbed" : "absorbed",
          weakBandClassification: "absorbed",
          weakBandFate: "absorbed",
          absorbedByBandId: target.id,
          populationTransferred: transferredPopulation,
          populationRemoved: 0,
          supportSeekingTargetBandId: target.id,
          supportSeekingGrounding: getSupportGrounding(band, target),
          populationConservationSummary: `transferred ${transferredPopulation}; removed 0`,
          reasonIds: [...band.viability.reasonIds, absorbedReasonId].slice(-10),
        },
        causalTraces: [...band.causalTraces, absorbedTrace].slice(-80),
      };
      continue;
    }

    // DEMOGRAPHY-MORTALITY-1 — two collapse paths: (a) the existing tiny-population
    // collapse, and (b) a tight LABOR collapse — a band that has lost almost all of
    // its working adults cannot sustain itself even at a slightly larger size.
    // Both are gated by a high extinction risk so only genuinely-failed, unabsorbed
    // bands collapse (kin-adjacent failing bands are absorbed earlier).
    const lowPopulationCollapse = band.viability.extinctionRisk >= 0.82 && band.demography.population < 9;
    const laborCollapse =
      band.viability.extinctionRisk >= 0.74 &&
      band.demography.workingAdults < 4 &&
      band.demography.population < 16;

    if (lowPopulationCollapse || laborCollapse) {
      const extinctReasonId = makeViabilityReasonId(
        world,
        band.id,
        laborCollapse && !lowPopulationCollapse ? "band_collapse_labor_failure" : "band_extinct_low_population",
      );
      const removedPopulation = toPopulationCount(band.demography.population);

      bandsById[band.id] = {
        ...band,
        size: 0,
        status: "dispersed",
        demography: recomputeDemographicCounts({
          ...band.demography,
          population: 0,
          growthAccumulator: 0,
          mortalityAccumulator: 0,
          lastPopulationChangeReasonIds: [extinctReasonId],
          splitPressure: 0,
        }),
        viability: {
          ...band.viability,
          status: "extinct",
          weakBandClassification: "disappeared_collapsed",
          weakBandFate: "collapsed",
          populationRemoved: removedPopulation,
          populationTransferred: 0,
          populationConservationSummary: `transferred 0; removed ${removedPopulation}`,
          reasonIds: [...band.viability.reasonIds, extinctReasonId].slice(-10),
        },
        causalTraces: [
          ...band.causalTraces,
          makeViabilityTrace(
            world,
            band.id,
            "band_extinct",
            band.position,
            undefined,
            removedPopulation,
            extinctReasonId,
          ),
        ].slice(-80),
      };
    }
  }

  return {
    ...world,
    bands: bandsById as Readonly<Record<BandId, Band>>,
  };
}

function deriveBandViabilityState(world: WorldState, band: Band): BandViabilityState {
  if (band.viability?.status === "absorbed" || band.viability?.status === "extinct") {
    return band.viability;
  }

  const population = toPopulationCount(band.demography.population);
  const pressure = band.pressureState;
  const seasonalSupport = band.seasonalSupport;
  const support = seasonalSupport?.hungerClassification;
  const adultShare = population <= 0 ? 0 : band.demography.workingAdults / population;
  const dependentShare = population <= 0 ? 0 : band.demography.dependents / population;
  const elderShare = population <= 0 ? 0 : band.demography.elders / population;
  const lowPopulationPressure = clamp01((MINIMUM_VIABLE_POPULATION + 8 - population) / 20);
  const stressPressure = clamp01(
    (pressure?.foodStress ?? 0) * 0.28 +
      (pressure?.waterStress ?? 0) * 0.28 +
      (pressure?.riskPressure ?? 0) * 0.18 +
      (pressure?.fatiguePressure ?? 0) * 0.16 +
      (seasonalSupport?.hungerClassification === "crisis_deficit" ? 0.16 : 0) +
      (seasonalSupport?.chronicDeficitStreak ?? 0) / 8 * 0.1 +
      (band.temporarySeparation?.active === true ? 0.08 : 0),
  );
  const viabilityPressure = clamp01(lowPopulationPressure * 0.52 + stressPressure + band.demography.mortalityPressure * 0.2);
  const absorptionOpportunity = getAbsorptionOpportunity(world, band);
  const extinctionRisk = clamp01(
    viabilityPressure * 0.62 +
      lowPopulationPressure * 0.22 -
      absorptionOpportunity * 0.18,
  );
  const status =
    population <= 0 ? "extinct" :
    population < MINIMUM_VIABLE_POPULATION * 0.72 && viabilityPressure > 0.62 ? "nonviable" :
    population < MINIMUM_VIABLE_POPULATION || viabilityPressure > 0.62 ? "fragile" :
    "viable";
  const target = getAbsorptionTarget(world, band);
  const routeConfidence = target === undefined ? 0 : getRouteConfidence(world, band, target);
  const weakBandClassification = classifyWeakBand({
    status,
    population,
    adultShare,
    dependentShare,
    elderShare,
    support,
    absorptionOpportunity,
    targetAvailable: target !== undefined,
    extinctionRisk,
  });
  const weakBandFate = getWeakBandFate(status, weakBandClassification, absorptionOpportunity, extinctionRisk);
  const reasonKind =
    status === "nonviable" ? "band_became_nonviable" :
    status === "fragile" ? "band_became_fragile" :
    "band_survived_fragile_period";

  return {
    bandId: band.id,
    population,
    minimumViablePopulation: MINIMUM_VIABLE_POPULATION,
    viabilityPressure: round2(viabilityPressure),
    extinctionRisk: round2(extinctionRisk),
    absorptionOpportunity: round2(absorptionOpportunity),
    status,
    weakBandClassification,
    weakBandFate,
    ...(target === undefined ? {} : { supportSeekingTargetBandId: target.id }),
    ...(target === undefined ? {} : { supportSeekingGrounding: getSupportGrounding(band, target) }),
    supportSeekingBlockedReason: target === undefined && (status === "fragile" || status === "nonviable")
      ? getSupportBlockedReason(world, band)
      : undefined,
    routeConfidenceToSupport: round2(routeConfidence),
    lastSupportState: support,
    lastStressSummary: getLastStressSummary(band),
    reasonIds: [makeViabilityReasonId(world, band.id, reasonKind)],
  };
}

function getAbsorptionOpportunity(world: WorldState, band: Band): number {
  const target = getAbsorptionTarget(world, band);

  if (target === undefined) {
    return 0;
  }

  const contactMemory = band.contactMemories[target.id];
  const kinBonus = target.id === band.parentBandId ? 0.3 : 0.16;
  const contactBonus = contactMemory === undefined
    ? 0
    : contactMemory.trustLikeTolerance * 0.24 + contactMemory.familiarity * 0.16;

  return clamp01(0.22 + kinBonus + contactBonus);
}

function getAbsorptionTarget(world: WorldState, band: Band): Band | undefined {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return undefined;
  }

  return Object.values(world.bands)
    .filter((candidate) =>
      candidate.id !== band.id &&
      candidate.status !== "dispersed" &&
      candidate.viability?.status !== "absorbed" &&
      candidate.viability?.status !== "extinct" &&
      (candidate.viability?.extinctionRisk ?? 0) < 0.68 &&
      (candidate.pressureState?.foodStress ?? 0) < 0.72 &&
      (candidate.pressureState?.waterStress ?? 0) < 0.78 &&
      isKin(band, candidate),
    )
    .map((candidate) => {
      const candidateTile = getTile(world, candidate.position);
      const distance = candidateTile === undefined
        ? Number.POSITIVE_INFINITY
        : Math.abs(currentTile.coord.x - candidateTile.coord.x) +
          Math.abs(currentTile.coord.y - candidateTile.coord.y);

      return { candidate, distance };
    })
    .filter(({ distance }) => distance <= 6)
    .sort((left, right) =>
      left.distance === right.distance
        ? String(left.candidate.id).localeCompare(String(right.candidate.id))
        : left.distance - right.distance,
    )[0]?.candidate;
}

function classifyWeakBand(input: {
  readonly status: BandViabilityState["status"];
  readonly population: number;
  readonly adultShare: number;
  readonly dependentShare: number;
  readonly elderShare: number;
  readonly support: BandViabilityState["lastSupportState"] | undefined;
  readonly absorptionOpportunity: number;
  readonly targetAvailable: boolean;
  readonly extinctionRisk: number;
}): NonNullable<BandViabilityState["weakBandClassification"]> {
  if (input.status === "absorbed") {
    return "absorbed";
  }

  if (input.status === "extinct") {
    return "disappeared_collapsed";
  }

  if (input.extinctionRisk >= 0.68) {
    return "collapse_risk";
  }

  if (input.absorptionOpportunity >= 0.46 && input.targetAvailable) {
    return "absorption_candidate";
  }

  if (input.status === "fragile" || input.status === "nonviable") {
    if (input.targetAvailable) {
      return "seeking_support";
    }

    if (input.support === "chronic_food_deficit" || input.support === "chronic_plus_seasonal_stress" || input.support === "crisis_deficit") {
      return "chronic_deficit";
    }

    if (input.adultShare < 0.32) {
      return "labor_poor";
    }

    if (input.dependentShare > 0.48) {
      return "dependent_heavy";
    }

    if (input.elderShare > 0.18) {
      return "elder_heavy";
    }

    return "isolated";
  }

  if (input.population < MINIMUM_VIABLE_POPULATION + 4) {
    return "stable_small_remnant";
  }

  if (input.support === "seasonal_lean_stress" || input.support === "seasonal_water_stress") {
    return "seasonal_hardship_viable";
  }

  return "stable_small_remnant";
}

function getWeakBandFate(
  status: BandViabilityState["status"],
  classification: NonNullable<BandViabilityState["weakBandClassification"]>,
  absorptionOpportunity: number,
  extinctionRisk: number,
): NonNullable<BandViabilityState["weakBandFate"]> {
  if (status === "absorbed") {
    return "absorbed";
  }

  if (status === "extinct") {
    return "collapsed";
  }

  if (classification === "absorption_candidate" && absorptionOpportunity >= 0.46) {
    return "absorption_candidate";
  }

  if (classification === "seeking_support") {
    return "support_seeking";
  }

  if (extinctionRisk >= 0.68 || classification === "collapse_risk") {
    return "collapse_risk";
  }

  if (status === "fragile") {
    return "stable_remnant";
  }

  return "viable";
}

function getSupportGrounding(band: Band, target: Band): string {
  if (band.parentBandId === target.id) {
    return "parent lineage";
  }

  if (target.parentBandId === band.id) {
    return "daughter lineage";
  }

  if (band.parentBandId !== undefined && band.parentBandId === target.parentBandId) {
    return "sibling lineage";
  }

  if (band.contactMemories[target.id] !== undefined) {
    return "contact memory";
  }

  return "known kin relation";
}

function getSupportBlockedReason(world: WorldState, band: Band): string {
  const kin = Object.values(world.bands).filter((candidate) => candidate.id !== band.id && isKin(band, candidate));

  if (kin.length === 0) {
    return "no known kin/contact target";
  }

  const stressed = kin.some((candidate) => (candidate.viability?.extinctionRisk ?? 0) >= 0.68 || (candidate.pressureState?.foodStress ?? 0) >= 0.72);
  if (stressed) {
    return "known kin too stressed";
  }

  return "known kin route too distant or low confidence";
}

function getRouteConfidence(world: WorldState, band: Band, target: Band): number {
  const currentTile = getTile(world, band.position);
  const targetTile = getTile(world, target.position);

  if (currentTile === undefined || targetTile === undefined) {
    return 0;
  }

  const distance = Math.abs(currentTile.coord.x - targetTile.coord.x) + Math.abs(currentTile.coord.y - targetTile.coord.y);
  const contact = band.contactMemories[target.id];
  const distanceConfidence = clamp01(1 - distance / 8);
  const contactConfidence = contact === undefined ? 0 : contact.familiarity * 0.38 + contact.trustLikeTolerance * 0.24;

  return clamp01(distanceConfidence * 0.62 + contactConfidence + (isKin(band, target) ? 0.18 : 0));
}

function getLastStressSummary(band: Band): string {
  const support = band.seasonalSupport;
  const pressure = band.pressureState;

  if (support === undefined && pressure === undefined) {
    return "no current support/stress summary";
  }

  return `support=${support?.hungerClassification ?? "unknown"} food=${round2(pressure?.foodStress ?? 0)} water=${round2(pressure?.waterStress ?? 0)}`;
}

function isKin(left: Band, right: Band): boolean {
  return (
    left.parentBandId === right.id ||
    right.parentBandId === left.id ||
    (left.parentBandId !== undefined && left.parentBandId === right.parentBandId)
  );
}

function recomputeDemographicCounts(demography: BandDemography): BandDemography {
  const population = toPopulationCount(demography.population);
  const dependents = Math.round(population * 0.35);
  const elders = Math.round(population * 0.1);
  const workingAdults = population <= 0 ? 0 : Math.max(1, Math.round(population - dependents - elders));

  return {
    ...demography,
    population,
    growthAccumulator: round4(demography.growthAccumulator ?? 0),
    mortalityAccumulator: round4(demography.mortalityAccumulator ?? 0),
    lastPopulationChangeReasonIds: demography.lastPopulationChangeReasonIds ?? [],
    householdCount: population <= 0 ? 0 : Math.max(1, Math.round(population / 5)),
    dependents,
    workingAdults,
    elders,
  };
}

function makeViabilityTrace(
  world: WorldState,
  bandId: BandId,
  kind: CausalTrace["kind"],
  sourceTileId: TileId,
  targetTileId: TileId | undefined,
  value: number,
  reasonId: ReasonId,
): CausalTrace {
  return {
    id: `trace:${bandId}:${world.time.tick}:${kind}:${sourceTileId}`,
    tick: world.time.tick,
    time: world.time,
    actorId: bandId,
    kind,
    sourceTileId,
    targetTileId,
    fromValue: value,
    toValue: 0,
    reasonId,
  };
}

function makeViabilityReasonId(
  world: WorldState,
  bandId: BandId,
  kind: string,
): ReasonId {
  return `reason:viability:${bandId}:${world.time.tick}:${kind}` as ReasonId;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function toPopulationCount(value: number): number {
  return Math.max(0, Math.round(value));
}
