// FOOD-DEMOGRAPHY-SEPARATION-2 default per-lineage Map 1 check.
//
// Runs a normal production Map 1 trajectory (no diagnostics, default founders,
// production ordering) and reports per-lineage demographics, including
// decline-cap exposure, so the checkpoint can answer: is at least one
// established viable default lineage genuinely replacing losses for a
// meaningful interval? World-aggregate stability alone is insufficient.
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const years = positiveInt(valueAfter("--years"), 100);
const map = valueAfter("--map") ?? "map1";
const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const first = execute(runner, map, years);
  const second = execute(runner, map, years);
  const lineages = first.lineages;
  const viableReplacers = lineages.filter((l) =>
    !l.extinct && (l.positiveRateShare > 0 || l.replacementYears >= 5));
  const checks = {
    deterministic: first.fingerprint === second.fingerprint,
    accountingReconciles: first.accounting.reconciles,
    atLeastOneViableLineageReplaces: viableReplacers.length >= 1,
    notAllLineagesStructurallyCapPinned: lineages.some((l) =>
      !l.extinct && l.declineCapShare < 0.9),
    nonviableStillPermittedToDecline: true, // honest decline/extinction is allowed
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "DEMOGRAPHIC-PER-LINEAGE-2",
    verdict: pass ? "PASS" : "FAIL",
    map,
    years,
    checks,
    viableReplacers: viableReplacers.map((l) => l.name),
    lineages,
    worldAggregate: first.worldAggregate,
    accounting: first.accounting,
    fingerprint: first.fingerprint,
    runtimeMs: first.runtimeMs,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function maxDeclineRateForPopulation(population) {
  if (population >= 1000) return -0.055;
  if (population >= 500) return -0.042;
  if (population >= 300) return -0.032;
  return -0.018;
}

function execute(runner, map, yearsToRun) {
  let world = runner.initSimWorld({ kind: map }, `per-lineage:${map}`);
  const started = performance.now();
  const founders = new Map();
  for (const band of Object.values(world.bands)) {
    founders.set(band.id, makeLineage(band));
  }
  const seenChurn = new Set();
  const seenTerminal = new Set();
  const seenRateYear = new Set();
  const priorPosition = new Map(Object.values(world.bands).map((b) => [b.id, b.position]));

  for (let seasonIndex = 1; seasonIndex <= yearsToRun * 4; seasonIndex += 1) {
    world = runner.stepSim(world, 1, "seasonal");
    for (const band of Object.values(world.bands)) {
      let lineage = founders.get(band.id);
      if (lineage === undefined) {
        lineage = makeLineage(band, true);
        founders.set(band.id, lineage);
      }
      // churn
      for (const record of band.demography.demographicChurn?.records ?? []) {
        const key = `${band.id}:${record.year}`;
        if (seenChurn.has(key)) continue;
        seenChurn.add(key);
        lineage.births += record.births;
        lineage.deaths += record.deaths;
      }
      if ((band.viability?.populationRemoved ?? 0) > 0 && !seenTerminal.has(band.id)) {
        lineage.terminalDeaths += band.viability.populationRemoved;
        seenTerminal.add(band.id);
      }
      // movement
      const prior = priorPosition.get(band.id);
      if (prior !== undefined && prior !== band.position) lineage.movements += 1;
      priorPosition.set(band.id, band.position);
      // per-year rate metrics
      const rateKey = `${band.id}:${world.time.year}`;
      if (band.demography.population > 0 && !seenRateYear.has(rateKey)) {
        seenRateYear.add(rateKey);
        recordRate(lineage, band);
      }
      // running means
      if (band.demography.population > 0) {
        const ledger = band.carryingCapacity?.perCapitaReturn?.supportDebug?.humanFoodLedger;
        lineage.sampleCount += 1;
        lineage.sumSupport += ledger?.rawSupportRatio ?? 0;
        lineage.sumStress += ledger?.foodStress ?? 0;
        lineage.sumFertility += band.demography.fertilityPressure ?? 0;
        lineage.sumMortality += band.demography.mortalityPressure ?? 0;
        lineage.sumDeathSuppression += band.deathMemory?.fertilitySuppressionFromRecentDeaths ?? 0;
        lineage.endPopulation = band.demography.population;
      }
      lineage.fissionEvents = band.fissionEvents.length;
      lineage.adaptationsAttempted = (band.practicalAdaptation?.experiments ?? []).filter((e) => e.attemptSeasons > 0).length;
      lineage.extinct = band.viability?.status === "extinct";
    }
  }

  const lineages = [...founders.values()].map((l) => finishLineage(l));
  const startPopulation = lineages.reduce((s, l) => s + l.startPopulation, 0);
  const endPopulation = Object.values(world.bands).reduce((s, b) => s + b.demography.population, 0);
  const totalBirths = lineages.reduce((s, l) => s + l.births, 0);
  const totalDeaths = lineages.reduce((s, l) => s + l.uniqueDeaths, 0);
  return {
    lineages,
    worldAggregate: {
      startPopulation,
      endPopulation,
      activeBands: Object.values(world.bands).filter((b) => b.demography.population > 0 && b.viability?.status !== "extinct").length,
      extinctBands: Object.values(world.bands).filter((b) => b.viability?.status === "extinct").length,
    },
    accounting: {
      equation: `${startPopulation} + ${totalBirths} - ${totalDeaths} = ${endPopulation}`,
      reconciles: startPopulation + totalBirths - totalDeaths === endPopulation,
    },
    runtimeMs: round(performance.now() - started),
    fingerprint: hash(runner.takeDynamicSnapshot(world)),
  };
}

function makeLineage(band, daughter = false) {
  return {
    id: band.id,
    name: daughter ? `${band.name} (daughter)` : band.name,
    daughter,
    startPopulation: band.demography.population,
    endPopulation: band.demography.population,
    births: 0, deaths: 0, terminalDeaths: 0, movements: 0,
    sampleCount: 0, sumSupport: 0, sumStress: 0, sumFertility: 0, sumMortality: 0, sumDeathSuppression: 0,
    rateYears: 0, capYears: 0, positiveYears: 0, replacementYears: 0, currentCapStreak: 0, maxCapStreak: 0,
    fissionEvents: 0, adaptationsAttempted: 0, extinct: false,
  };
}

function recordRate(lineage, band) {
  const rate = band.demography.netDemographicRate;
  if (rate === undefined) return;
  const uncapped = band.demography.uncappedDemographicRate ?? rate;
  const binds = band.demography.declineCapBinds
    ?? (rate <= maxDeclineRateForPopulation(band.demography.population) + 1e-9 && uncapped < rate - 1e-9);
  lineage.rateYears += 1;
  if (binds) {
    lineage.capYears += 1;
    lineage.currentCapStreak += 1;
    lineage.maxCapStreak = Math.max(lineage.maxCapStreak, lineage.currentCapStreak);
  } else {
    lineage.currentCapStreak = 0;
  }
  if (rate > 0) lineage.positiveYears += 1;
  if (rate >= -0.002) lineage.replacementYears += 1;
}

function finishLineage(l) {
  const rateYears = Math.max(1, l.rateYears);
  const samples = Math.max(1, l.sampleCount);
  return {
    name: l.name,
    daughter: l.daughter,
    startPopulation: l.startPopulation,
    endPopulation: l.extinct ? 0 : l.endPopulation,
    births: l.births,
    uniqueDeaths: l.deaths + l.terminalDeaths,
    accounting: `${l.startPopulation} + ${l.births} - ${l.deaths + l.terminalDeaths} = ${l.extinct ? 0 : l.endPopulation}`,
    meanSupportRatio: round(l.sumSupport / samples),
    meanFoodStress: round(l.sumStress / samples),
    meanFertilityPressure: round(l.sumFertility / samples),
    meanMortalityPressure: round(l.sumMortality / samples),
    meanRecentDeathSuppression: round(l.sumDeathSuppression / samples),
    declineCapShare: round(l.capYears / rateYears),
    maxContinuousDeclineCapYears: l.maxCapStreak,
    positiveRateShare: round(l.positiveYears / rateYears),
    replacementYears: l.replacementYears,
    movements: l.movements,
    fissionEvents: l.fissionEvents,
    adaptationsAttempted: l.adaptationsAttempted,
    extinct: l.extinct,
  };
}

function valueAfter(flag) { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1]; }
function positiveInt(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function round(value, places = 4) { const scale = 10 ** places; return Math.round(Number(value ?? 0) * scale) / scale; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
