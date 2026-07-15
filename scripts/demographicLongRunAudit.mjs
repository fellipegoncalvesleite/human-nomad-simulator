import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const map = valueAfter("--map") ?? "map1";
const years = positiveInt(valueAfter("--years"), 300);
const repeat = process.argv.includes("--repeat");
const allowedMaps = new Set(["map1", "map2", "map2_single_origin", "no_human_map1"]);
if (!allowedMaps.has(map)) throw new Error(`Unsupported --map ${map}`);

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const renewal = await server.ssrLoadModule("/sim/agents/demographicRenewal.ts");
  const config = { kind: map === "no_human_map1" ? "map1" : map };
  let initial = runner.initSimWorld(config, `demographic-long-run:${map}`);
  if (map === "no_human_map1") initial = { ...initial, bands: {}, decisions: {} };
  const observed = execute(runner, renewal, initial, years, true);
  const repeated = repeat ? execute(runner, renewal, initial, years, false) : undefined;
  const checks = {
    completed: observed.completedYears === years,
    populationReconciles: observed.accounting.reconciles,
    observerParity: repeated === undefined || observed.fingerprint === repeated.fingerprint,
    deterministic: repeated === undefined || observed.fingerprint === repeated.fingerprint,
    stateCapsHeld: observed.stateCapsHeld,
    noHumanRemainsNoHuman: map !== "no_human_map1" || (observed.startPopulation === 0 && observed.endPopulation === 0),
    // Viable lineages must not all be permanently pinned at the decline cap:
    // that would indicate the model forces universal structural decline. An
    // honestly nonviable lineage may still sit near the cap and go extinct.
    survivorsNotAllStructurallyCapPinned: !observed.declineCap.allSurvivorsStructurallyCapPinned,
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "DEMOGRAPHIC-PERSISTENCE-LONG-RUN",
    verdict: pass ? "PASS" : "FAIL",
    map,
    years,
    repeat,
    checks,
    result: observed,
    repeated: repeated === undefined ? undefined : {
      fingerprint: repeated.fingerprint,
      endPopulation: repeated.endPopulation,
      activeBands: repeated.activeBands,
      extinctBands: repeated.extinctBands,
      declineCapMatchesObserved:
        JSON.stringify(repeated.declineCap) === JSON.stringify(observed.declineCap),
      runtimeMs: repeated.runtimeMs,
    },
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function execute(runner, renewal, initial, yearsToRun, withObserver) {
  let world = initial;
  const startPopulation = population(world);
  const started = performance.now();
  const seenRecords = new Set();
  const seenTerminal = new Set();
  const priorPositions = new Map(Object.values(world.bands).map((band) => [band.id, band.position]));
  const accounting = {
    births: 0, recordedDeaths: 0, terminalDeaths: 0,
    elderDeaths: 0, dependentDeaths: 0, adultDeaths: 0,
    crisisAttribution: 0, waterAttribution: 0, foodAttribution: 0, movementAttribution: 0,
  };
  const samples = { count: 0, support: 0, demand: 0, ratio: 0, stress: 0, fertility: 0, mortality: 0 };
  // FOOD-DEMOGRAPHY-SEPARATION-2 — per-band, per-year decline-cap exposure.
  // Demography updates once per year (spring), so the net rate is recorded once
  // per (band, year) to keep these as year counts, not season counts.
  const rateByBand = new Map();
  const seenRateYear = new Set();
  let movements = 0;
  const checkpoints = [{ year: 0, population: startPopulation, activeBands: livingBands(world), extinctBands: extinctBands(world), births: 0, uniqueDeaths: 0 }];
  const interval = yearsToRun >= 300 ? 50 : 25;
  const observer = withObserver ? ({ band }) => collectSample(samples, band) : undefined;

  for (let seasonIndex = 1; seasonIndex <= yearsToRun * 4; seasonIndex += 1) {
    world = runner.stepSim(world, 1, "seasonal", observer);
    for (const band of Object.values(world.bands)) {
      collectRecords(accounting, band, seenRecords);
      if ((band.viability?.populationRemoved ?? 0) > 0 && !seenTerminal.has(band.id)) {
        accounting.terminalDeaths += band.viability.populationRemoved;
        seenTerminal.add(band.id);
      }
      const prior = priorPositions.get(band.id);
      if (prior !== undefined && prior !== band.position) movements += 1;
      priorPositions.set(band.id, band.position);
      if (!withObserver) collectSample(samples, band);
      recordDeclineCap(rateByBand, seenRateYear, band, world.time.year);
    }
    if (seasonIndex % (interval * 4) === 0 || seasonIndex === yearsToRun * 4) {
      checkpoints.push({
        year: seasonIndex / 4,
        population: population(world),
        activeBands: livingBands(world),
        extinctBands: extinctBands(world),
        births: accounting.births,
        uniqueDeaths: accounting.recordedDeaths + accounting.terminalDeaths,
      });
    }
  }

  const endPopulation = population(world);
  const uniqueDeaths = accounting.recordedDeaths + accounting.terminalDeaths;
  const active = Object.values(world.bands).filter((band) => band.demography.population > 0 && band.viability?.status !== "extinct" && band.viability?.status !== "absorbed");
  const renewalCounts = {};
  for (const band of active) {
    const kind = renewal.deriveDemographicRenewal(band).kind;
    renewalCounts[kind] = (renewalCounts[kind] ?? 0) + 1;
  }
  const responses = active.flatMap((band) => band.practicalAdaptation?.responses ?? []);
  const experiments = active.flatMap((band) => band.practicalAdaptation?.experiments ?? []);
  const activeIds = new Set(active.map((band) => band.id));
  const declineCap = summarizeDeclineCap(rateByBand, activeIds);
  return {
    completedYears: world.time.year,
    startPopulation,
    endPopulation,
    activeBands: active.length,
    extinctBands: extinctBands(world),
    fissionEvents: Object.values(world.bands).reduce((sum, band) => sum + band.fissionEvents.length, 0),
    births: accounting.births,
    uniqueDeaths,
    accounting: {
      equation: `${startPopulation} + ${accounting.births} - ${uniqueDeaths} = ${endPopulation}`,
      reconciles: startPopulation + accounting.births - uniqueDeaths === endPopulation,
      recordedDeaths: accounting.recordedDeaths,
      terminalDeaths: accounting.terminalDeaths,
      elderDeaths: accounting.elderDeaths,
      dependentDeaths: accounting.dependentDeaths,
      adultDeaths: accounting.adultDeaths,
      overlappingAttributionDoNotSum: {
        crisis: accounting.crisisAttribution,
        water: accounting.waterAttribution,
        food: accounting.foodAttribution,
        movement: accounting.movementAttribution,
      },
    },
    means: {
      physicalUsableSupport: round(samples.support / Math.max(1, samples.count)),
      adultEquivalentDemand: round(samples.demand / Math.max(1, samples.count)),
      supportRatio: round(samples.ratio / Math.max(1, samples.count)),
      foodStress: round(samples.stress / Math.max(1, samples.count)),
      fertilityPressure: round(samples.fertility / Math.max(1, samples.count)),
      mortalityPressure: round(samples.mortality / Math.max(1, samples.count)),
    },
    movements,
    adaptationsAttempted: experiments.filter((entry) => entry.attemptSeasons > 0).length,
    adaptationsEffective: responses.filter((entry) => entry.successCount > 0 || entry.lastEfficacy === "clear_success_specific" || entry.lastEfficacy === "partial_success_specific").length,
    renewal: renewalCounts,
    declineCap,
    checkpoints,
    stateCapsHeld: Object.values(world.bands).every((band) =>
      band.practicalAdaptation?.caps.held !== false &&
      (band.resourceKnowledgeState?.patchMemories.length ?? 0) <= 48 &&
      (band.seasonalSupport?.recentSamples.length ?? 0) <= 8 &&
      (band.demography.demographicChurn?.records.length ?? 0) <= 10),
    runtimeMs: round(performance.now() - started),
    fingerprint: hash(runner.takeDynamicSnapshot(world)),
  };
}

function collectRecords(accounting, band, seen) {
  for (const record of band.demography.demographicChurn?.records ?? []) {
    const key = `${band.id}:${record.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accounting.births += record.births;
    accounting.recordedDeaths += record.deaths;
    accounting.elderDeaths += record.elderDeaths;
    accounting.dependentDeaths += record.dependentDeaths;
    accounting.adultDeaths += record.adultDeaths;
    accounting.crisisAttribution += record.crisisDeaths;
    accounting.waterAttribution += record.waterStressDeaths;
    accounting.foodAttribution += record.starvationDeaths;
    accounting.movementAttribution += record.migrationHardshipDeaths;
  }
}

function maxDeclineRateForPopulation(population) {
  if (population >= 1000) return -0.055;
  if (population >= 500) return -0.042;
  if (population >= 300) return -0.032;
  return -0.018;
}

function recordDeclineCap(rateByBand, seenRateYear, band, year) {
  if (band.demography.population <= 0) return;
  const key = `${band.id}:${year}`;
  if (seenRateYear.has(key)) return;
  seenRateYear.add(key);
  const rate = band.demography.netDemographicRate;
  if (rate === undefined) return;
  const uncapped = band.demography.uncappedDemographicRate ?? rate;
  // Prefer the authoritative flag; fall back to a population-aware comparison so
  // the audit still works on states written before the flag existed.
  const binds = band.demography.declineCapBinds ?? (rate <= maxDeclineRateForPopulation(band.demography.population) + 1e-9 && uncapped < rate - 1e-9);
  const foodStress = band.seasonalSupport?.currentSeasonSupport?.foodStress ?? 0;
  const entry = rateByBand.get(band.id) ?? {
    years: 0, capYears: 0, positiveYears: 0, replacementYears: 0, severeDeficitYears: 0,
    currentCapStreak: 0, maxCapStreak: 0, sumSuppressed: 0, sumUncapped: 0, sumNet: 0,
  };
  entry.years += 1;
  entry.sumUncapped += uncapped;
  entry.sumNet += rate;
  if (binds) {
    entry.capYears += 1;
    entry.currentCapStreak += 1;
    entry.maxCapStreak = Math.max(entry.maxCapStreak, entry.currentCapStreak);
    entry.sumSuppressed += Math.max(0, rate - uncapped);
  } else {
    entry.currentCapStreak = 0;
  }
  if (rate > 0) entry.positiveYears += 1;
  if (rate >= -0.002) entry.replacementYears += 1;
  if (foodStress >= 0.5) entry.severeDeficitYears += 1;
  rateByBand.set(band.id, entry);
}

function summarizeDeclineCap(rateByBand, activeIds) {
  const perBand = {};
  const survivors = [];
  for (const [bandId, entry] of rateByBand.entries()) {
    const years = Math.max(1, entry.years);
    const summary = {
      active: activeIds.has(bandId),
      years: entry.years,
      declineCapShare: round(entry.capYears / years),
      maxContinuousDeclineCapYears: entry.maxCapStreak,
      positiveRateShare: round(entry.positiveYears / years),
      replacementYears: entry.replacementYears,
      severeDeficitYears: entry.severeDeficitYears,
      meanUncappedRate: round(entry.sumUncapped / years, 6),
      meanClampedRate: round(entry.sumNet / years, 6),
      meanRateSuppressedByCap: round(entry.sumSuppressed / years, 6),
    };
    perBand[bandId] = summary;
    if (summary.active) survivors.push(summary);
  }
  const survivorStructurallyCapPinned = (summary) =>
    summary.declineCapShare >= 0.9 && summary.positiveRateShare === 0 && summary.replacementYears === 0;
  const allSurvivorsStructurallyCapPinned = survivors.length > 0 && survivors.every(survivorStructurallyCapPinned);
  return {
    perBand,
    survivorCount: survivors.length,
    survivorMeanDeclineCapShare: round(mean(survivors.map((s) => s.declineCapShare))),
    survivorMaxDeclineCapShare: survivors.length === 0 ? 0 : Math.max(...survivors.map((s) => s.declineCapShare)),
    survivorsWithPositiveInterval: survivors.filter((s) => s.positiveRateShare > 0).length,
    survivorsWithReplacementInterval: survivors.filter((s) => s.replacementYears > 0).length,
    allSurvivorsStructurallyCapPinned,
  };
}

function mean(values) { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }

function collectSample(samples, band) {
  if (band.demography.population <= 0) return;
  const ledger = band.carryingCapacity?.perCapitaReturn.supportDebug.humanFoodLedger;
  if (ledger === undefined) return;
  samples.count += 1;
  samples.support += ledger.totalUsableSupport;
  samples.demand += ledger.populationDemand;
  samples.ratio += ledger.rawSupportRatio;
  samples.stress += ledger.foodStress;
  samples.fertility += band.demography.fertilityPressure;
  samples.mortality += band.demography.mortalityPressure;
}

function population(world) { return Object.values(world.bands).reduce((sum, band) => sum + band.demography.population, 0); }
function livingBands(world) { return Object.values(world.bands).filter((band) => band.demography.population > 0 && band.viability?.status !== "extinct" && band.viability?.status !== "absorbed").length; }
function extinctBands(world) { return Object.values(world.bands).filter((band) => band.viability?.status === "extinct").length; }
function valueAfter(flag) { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1]; }
function positiveInt(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function round(value, places = 4) { const scale = 10 ** places; return Math.round(Number(value ?? 0) * scale) / scale; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
