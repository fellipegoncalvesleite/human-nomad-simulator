import type { Band, DemographicChurnRecord } from "./types";

/** Pure read-only interpretation; never consumed by simulation behavior. */
export type DemographicRenewalKind =
  | "not_yet_measured"
  | "renewing"
  | "replacing_losses"
  | "stable_aging"
  | "demographically_stalled"
  | "declining"
  | "critical_remnant"
  | "recovering"
  | "extinct";

export interface DemographicRenewalProjection {
  readonly kind: DemographicRenewalKind;
  readonly label: string;
  readonly summary: string;
  readonly population: number;
  readonly observedYears: number;
  readonly birthsObserved: number;
  readonly deathsObserved: number;
  readonly netPopulationChange: number;
  readonly yearsSinceLastBirth: number;
  readonly dependentShare: number;
  readonly workingAdultShare: number;
  readonly elderShare: number;
  readonly accumulatorBalance: number;
  readonly causeCountsOverlap: true;
  readonly limitations: readonly string[];
}

const LABELS: Readonly<Record<DemographicRenewalKind, string>> = {
  not_yet_measured: "Renewal not yet measured",
  renewing: "Renewing",
  replacing_losses: "Replacing losses",
  stable_aging: "Stable but aging",
  demographically_stalled: "Demographically stalled",
  declining: "Declining",
  critical_remnant: "Critical remnant",
  recovering: "Recovering",
  extinct: "Extinct",
};

export function deriveDemographicRenewal(band: Band): DemographicRenewalProjection {
  const demography = band.demography;
  const population = count(demography.population);
  const records = demography.demographicChurn?.records ?? [];
  const birthsObserved = sum(records, (record) => record.births);
  const deathsObserved = sum(records, (record) => record.deaths);
  const netPopulationChange = sum(records, (record) => record.netPopulationChange);
  const observedYears = records.length;
  const dependents = count(demography.dependents);
  const workingAdults = count(demography.workingAdults);
  const elders = count(demography.elders);
  const dependentShare = share(dependents, population);
  const workingAdultShare = share(workingAdults, population);
  const elderShare = share(elders, population);
  const accumulatorBalance = round2(
    (demography.growthAccumulator ?? 0) - (demography.mortalityAccumulator ?? 0),
  );
  const yearsSinceLastBirth = Math.max(
    trailingYearsWithout(records, (record) => record.births > 0),
    demography.demographicChurn?.yearsSinceLastBirth ?? 0,
  );
  const minimumViablePopulation = band.viability?.minimumViablePopulation ?? 14;
  const recentRecords = records.slice(-Math.min(3, records.length));
  const earlierRecords = records.slice(0, Math.max(0, records.length - recentRecords.length));
  const recentNet = sum(recentRecords, (record) => record.netPopulationChange);
  const earlierNet = sum(earlierRecords, (record) => record.netPopulationChange);
  const extremeRemnant =
    band.viability?.status === "nonviable" ||
    population < Math.ceil(minimumViablePopulation * 0.72) ||
    (population < 16 && workingAdults < 4);
  const structurallySmall =
    population < minimumViablePopulation || band.viability?.status === "fragile";
  const materiallyDeclining =
    recentNet < 0 ||
    netPopulationChange <= -2 ||
    (netPopulationChange < 0 && Math.abs(netPopulationChange) / Math.max(1, population) >= 0.05) ||
    deathsObserved > birthsObserved + 1;
  const recovering =
    earlierRecords.length >= 1 && recentRecords.length >= 2 && earlierNet < 0 && recentNet > 0;
  const agingStructure =
    elderShare >= 0.18 ||
    (observedYears >= 5 && dependentShare < 0.2 && birthsObserved <= deathsObserved);
  const replacingLosses =
    birthsObserved > 0 && deathsObserved > 0 &&
    Math.abs(birthsObserved - deathsObserved) <= Math.max(1, Math.round(population * 0.04)) &&
    Math.abs(netPopulationChange) <= Math.max(1, Math.round(population * 0.04));
  const stalled =
    observedYears >= 5 && !materiallyDeclining &&
    (birthsObserved === 0 || yearsSinceLastBirth >= 5 ||
      (demography.fertilityPressure <= demography.mortalityPressure + 0.02 && accumulatorBalance <= -0.2));

  let kind: DemographicRenewalKind;
  if (population <= 0 || band.viability?.status === "extinct") kind = "extinct";
  else if (extremeRemnant) kind = "critical_remnant";
  else if (recovering) kind = "recovering";
  else if (materiallyDeclining) kind = "declining";
  else if (structurallySmall) kind = "critical_remnant";
  else if (agingStructure) kind = "stable_aging";
  else if (replacingLosses) kind = "replacing_losses";
  else if (stalled) kind = "demographically_stalled";
  else if (observedYears === 0) kind = "not_yet_measured";
  else if (birthsObserved > deathsObserved || netPopulationChange > 0) kind = "renewing";
  else if (observedYears < 5) kind = "not_yet_measured";
  else kind = "demographically_stalled";

  return {
    kind,
    label: LABELS[kind],
    summary: describe(kind, {
      population, observedYears, birthsObserved, deathsObserved, netPopulationChange,
      yearsSinceLastBirth, dependents, workingAdults, elders, recentNet, earlierNet,
    }),
    population,
    observedYears,
    birthsObserved,
    deathsObserved,
    netPopulationChange,
    yearsSinceLastBirth,
    dependentShare: round2(dependentShare),
    workingAdultShare: round2(workingAdultShare),
    elderShare: round2(elderShare),
    accumulatorBalance,
    causeCountsOverlap: true,
    limitations: [
      "Reproductive-capable adults are not modeled separately; working adults are only an age-structure proxy.",
      "Crisis, food, and water death counts are overlapping causal attributions, not additive deaths.",
    ],
  };
}

interface DescriptionEvidence {
  readonly population: number;
  readonly observedYears: number;
  readonly birthsObserved: number;
  readonly deathsObserved: number;
  readonly netPopulationChange: number;
  readonly yearsSinceLastBirth: number;
  readonly dependents: number;
  readonly workingAdults: number;
  readonly elders: number;
  readonly recentNet: number;
  readonly earlierNet: number;
}

function describe(kind: DemographicRenewalKind, evidence: DescriptionEvidence): string {
  const balance = `${evidence.birthsObserved} birth${evidence.birthsObserved === 1 ? "" : "s"} and ${evidence.deathsObserved} death${evidence.deathsObserved === 1 ? "" : "s"} over ${evidence.observedYears} recorded year${evidence.observedYears === 1 ? "" : "s"}`;
  switch (kind) {
    case "extinct": return "No living population remains; the demographic record is archival.";
    case "critical_remnant": return `${evidence.population} people remain, including ${evidence.workingAdults} working adults; survival status takes precedence over a superficially steady headcount.`;
    case "recovering": return `Recent net change is +${evidence.recentNet} after an earlier ${evidence.earlierNet}; recovery is visible but not guaranteed.`;
    case "declining": return `${balance}; net change is ${signed(evidence.netPopulationChange)}, so the headcount is not replacing losses.`;
    case "stable_aging": return `${balance}; the current structure is ${evidence.dependents} dependents, ${evidence.workingAdults} working adults, and ${evidence.elders} elders, so a steady total masks aging risk.`;
    case "replacing_losses": return `${balance}; gross turnover is replacing losses even though net population changes little.`;
    case "demographically_stalled": return `${balance}; no convincing renewal trend is present${evidence.yearsSinceLastBirth >= 5 ? `, with ${evidence.yearsSinceLastBirth} years since a recorded birth` : ""}.`;
    case "renewing": return `${balance}; net change is ${signed(evidence.netPopulationChange)}, with births currently ahead of losses.`;
    case "not_yet_measured": return "Too little annual birth/death history exists to call this band stable, renewing, or declining.";
  }
}

function trailingYearsWithout(records: readonly DemographicChurnRecord[], predicate: (record: DemographicChurnRecord) => boolean): number {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (predicate(records[index])) return records.length - index - 1;
  }
  return records.length;
}

function sum(records: readonly DemographicChurnRecord[], select: (record: DemographicChurnRecord) => number): number {
  return records.reduce((total, record) => total + select(record), 0);
}

function count(value: number): number { return Math.max(0, Math.round(value)); }
function share(value: number, population: number): number { return population <= 0 ? 0 : value / population; }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
