import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const years = positiveInt(valueAfter("--years"), 50);
const server = await createServer({
  root: `${process.cwd()}/src`,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const projection = await server.ssrLoadModule("/sim/world/ecologicalProjection.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const renewal = await server.ssrLoadModule("/sim/agents/demographicRenewal.ts");

  const definitions = [
    { id: "healthy", tileId: "tile:124:66", population: 24, years },
    { id: "moderate", tileId: "tile:126:56", population: 34, years },
    { id: "marginal", tileId: "tile:35:20", population: 27, years },
    { id: "recovery", tileId: "tile:124:66", population: 24, years, depletedRing: 6 },
    { id: "nonviable", tileId: "tile:0:7", population: 24, years: Math.max(60, years), sterile: true },
  ];
  const scenarios = {};

  for (const definition of definitions) {
    const initial = makeScenarioWorld(runner, projection, fauna, definition);
    const observed = executeScenario(runner, renewal, initial, definition, true);
    const unobserved = executeScenario(runner, renewal, initial, definition, false);
    scenarios[definition.id] = {
      ...observed,
      observerParity: observed.fingerprint === unobserved.fingerprint,
      repeatedFingerprint: unobserved.fingerprint,
    };
  }

  const healthy = scenarios.healthy;
  const moderate = scenarios.moderate;
  const marginal = scenarios.marginal;
  const recovery = scenarios.recovery;
  const nonviable = scenarios.nonviable;
  const checks = {
    healthyPhysicallySupported: healthy.meanSupportRatio >= 0.95 && healthy.meanFoodStress < 0.4,
    healthyPersists: healthy.endPopulation >= healthy.startPopulation * 0.9 && healthy.births > 0 && healthy.uniqueDeaths > 0,
    moderatePhysicalBand:
      moderate.meanSupportRatio >= 0.55 &&
      moderate.meanSupportRatio < healthy.meanSupportRatio &&
      moderate.meanFoodStress >= 0.15 &&
      moderate.meanFoodStress < marginal.meanFoodStress,
    moderateNotPinnedAtDeclineCap: moderate.declineCapShare < 0.25 && moderate.endPopulation >= moderate.startPopulation * 0.75,
    marginalCausallyVariable: marginal.meanSupportRatio < moderate.meanSupportRatio && marginal.endPopulation > 0 && (marginal.movements > 0 || marginal.adaptationsAttempted > 0),
    recoveryIsPhysical: recovery.initialDepletionApplied && recovery.lateSupportRatio > recovery.earlySupportRatio,
    recoverySurvives: recovery.endPopulation > 0,
    nonviableHasNoFoodFloor: nonviable.meanUsableSupport === 0 && nonviable.meanSupportRatio === 0 && nonviable.meanFoodStress === 1,
    nonviableTerminates: nonviable.endPopulation === 0 && nonviable.lifecycle === "extinct",
    populationReconciles: Object.values(scenarios).every((entry) => entry.accounting.reconciles),
    birthsAndDeathsVisible: [healthy, moderate, marginal].every((entry) => entry.births > 0 && entry.uniqueDeaths > 0),
    observerParity: Object.values(scenarios).every((entry) => entry.observerParity),
    deterministic: Object.values(scenarios).every((entry) => entry.fingerprint === entry.repeatedFingerprint),
    boundedState: Object.values(scenarios).every((entry) => entry.stateCapsHeld),
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "DEMOGRAPHIC-PERSISTENCE-1",
    verdict: pass ? "PASS" : "FAIL",
    years,
    checks,
    scenarios,
    structuralEvaluation: {
      retainedNetRate: "Fast and snapshot-compatible, but gross replacement births are aggregate churn and working-adult cohorts do not cause fertility.",
      separateGrossAccumulators: "Would make births, ordinary deaths, age hazards, and reproductive capacity independently causal; migration/cohort reconciliation and snapshot migration make it a follow-up, not a safe calibration patch.",
      hybridRecommendation: "Follow with separate bounded birth potential, ordinary mortality, and crisis mortality accumulators over aggregate cohorts; retain deterministic integer realization and terminal lifecycle accounting.",
      implementedNow: "No structural rewrite. This checkpoint de-stacks food pressure and exposes the current aggregate limitation explicitly.",
    },
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function makeScenarioWorld(runner, projection, fauna, definition) {
  const base = runner.initSimWorld({ kind: "map1" }, `demographic-persistence:${definition.id}:base`);
  const removedInitialBandIds = Object.keys(base.bands);
  let world = runner.initSimWorld({
    kind: "map1",
    removedInitialBandIds,
    addedBands: [{
      tileId: definition.tileId,
      name: `Persistence ${definition.id}`,
      population: definition.population,
      knowledgePreset: "normal",
    }],
  }, `demographic-persistence:${definition.id}`);
  const band = Object.values(world.bands)[0];
  if (definition.depletedRing !== undefined) {
    for (const tileId of collectLocalRing(world, band.position, definition.depletedRing)) {
      world = forceDepleteTile(world, tileId, projection, fauna);
    }
  }
  if (definition.sterile) world = makeSterileWorld(world, projection, fauna);
  return world;
}

function executeScenario(runner, renewal, initial, definition, withObserver) {
  let world = initial;
  const bandId = Object.keys(initial.bands)[0];
  const startPopulation = initial.bands[bandId].demography.population;
  const start = performance.now();
  const seenChurn = new Set();
  const row = {
    births: 0, deaths: 0, moves: 0, adaptationsAttempted: 0,
    support: 0, usable: 0, demand: 0, stress: 0, samples: 0,
    earlySupport: [], lateSupport: [], declineCapSamples: 0, rateSamples: 0,
    seasonIndex: 0, totalSeasons: definition.years * 4,
  };
  const checkpoints = [{ year: 0, population: startPopulation }];
  let priorPosition = initial.bands[bandId].position;
  const observer = withObserver ? ({ band }) => collectSeason(row, band) : undefined;

  for (let seasonIndex = 1; seasonIndex <= definition.years * 4; seasonIndex += 1) {
    row.seasonIndex = seasonIndex;
    world = runner.stepSim(world, 1, "seasonal", observer);
    const band = world.bands[bandId];
    if (band !== undefined) {
      collectChurn(row, band, seenChurn);
      if (band.position !== priorPosition) row.moves += 1;
      priorPosition = band.position;
      if (!withObserver) collectSeason(row, band);
    }
    if (seasonIndex % (10 * 4) === 0 || seasonIndex === definition.years * 4) {
      checkpoints.push({ year: seasonIndex / 4, population: band?.demography.population ?? 0 });
    }
  }

  const band = world.bands[bandId];
  const terminalDeaths = band?.viability?.populationRemoved ?? 0;
  const endPopulation = band?.demography.population ?? 0;
  const uniqueDeaths = row.deaths + terminalDeaths;
  const responses = band?.practicalAdaptation?.responses ?? [];
  const experiments = band?.practicalAdaptation?.experiments ?? [];
  const stateCapsHeld =
    band?.practicalAdaptation?.caps.held !== false &&
    (band?.resourceKnowledgeState?.patchMemories.length ?? 0) <= 48 &&
    (band?.seasonalSupport?.recentSamples.length ?? 0) <= 8 &&
    (band?.demography.demographicChurn?.records.length ?? 0) <= 10;
  return {
    id: definition.id,
    years: definition.years,
    startPopulation,
    endPopulation,
    births: row.births,
    recordedDeaths: row.deaths,
    terminalDeaths,
    uniqueDeaths,
    accounting: {
      equation: `${startPopulation} + ${row.births} - ${uniqueDeaths} = ${endPopulation}`,
      reconciles: startPopulation + row.births - uniqueDeaths === endPopulation,
    },
    checkpoints,
    meanUsableSupport: round(row.usable / Math.max(1, row.samples)),
    meanDemand: round(row.demand / Math.max(1, row.samples)),
    meanSupportRatio: round(row.support / Math.max(1, row.samples)),
    meanFoodStress: round(row.stress / Math.max(1, row.samples)),
    earlySupportRatio: round(mean(row.earlySupport)),
    lateSupportRatio: round(mean(row.lateSupport)),
    declineCapShare: round(row.declineCapSamples / Math.max(1, row.rateSamples)),
    movements: row.moves,
    adaptationsAttempted: experiments.filter((entry) => entry.attemptSeasons > 0).length,
    adaptationsEffective: responses.filter((entry) => entry.successCount > 0 || entry.lastEfficacy === "clear_success_specific" || entry.lastEfficacy === "partial_success_specific").length,
    fertilityPressure: band?.demography.fertilityPressure ?? 0,
    mortalityPressure: band?.demography.mortalityPressure ?? 0,
    foodFertilitySuppression: band?.demography.foodFertilitySuppression ?? 0,
    foodMortalityContribution: band?.demography.foodMortalityContribution ?? 0,
    severeChronicFoodHazard: band?.demography.foodSevereChronicHazard ?? 0,
    growthAccumulator: band?.demography.growthAccumulator ?? 0,
    mortalityAccumulator: band?.demography.mortalityAccumulator ?? 0,
    renewal: band === undefined ? "extinct" : renewal.deriveDemographicRenewal(band).kind,
    lifecycle: band?.viability?.status ?? "extinct",
    initialDepletionApplied: definition.depletedRing !== undefined,
    stateCapsHeld,
    runtimeMs: round(performance.now() - start),
    fingerprint: hash(runner.takeDynamicSnapshot(world)),
  };
}

function collectSeason(row, band) {
  const ledger = band.carryingCapacity?.perCapitaReturn.supportDebug.humanFoodLedger;
  if (ledger !== undefined) {
    row.support += ledger.rawSupportRatio;
    row.usable += ledger.totalUsableSupport;
    row.demand += ledger.populationDemand;
    row.stress += ledger.foodStress;
    row.samples += 1;
    if (row.seasonIndex <= Math.max(4, Math.floor(row.totalSeasons * 0.2))) row.earlySupport.push(ledger.rawSupportRatio);
    if (row.seasonIndex > Math.floor(row.totalSeasons * 0.8)) row.lateSupport.push(ledger.rawSupportRatio);
  }
  const rate = band.demography.netDemographicRate;
  if (rate !== undefined) {
    row.rateSamples += 1;
    if (rate <= -0.0175) row.declineCapSamples += 1;
  }
}

function collectChurn(row, band, seen) {
  for (const record of band.demography.demographicChurn?.records ?? []) {
    const key = `${band.id}:${record.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    row.births += record.births;
    row.deaths += record.deaths;
  }
}

function makeSterileWorld(world, projection, fauna) {
  const source = Object.values(world.bands)[0];
  const original = world.tiles[source.position];
  const sterileTile = {
    ...original,
    neighbors: [],
    terrainKind: "desert",
    biomeKind: "arid",
    isAquatic: false,
    isRiver: false,
    isRiverbank: false,
    isFloodplain: false,
    isCoastal: false,
    isConfluence: false,
    isEstuary: false,
    isMarshChannel: false,
    riverSegmentId: undefined,
    resourceProfile: {
      ...original.resourceProfile,
      baseRichness: 0,
      waterAccess: 0,
      aquaticPotential: 0,
      wildGrainPotential: 0,
      plantTendingPotential: 0,
      resourceRegenerationRate: 0,
    },
    seasonalProfile: {
      ...original.seasonalProfile,
      peakSeasons: [],
      leanSeasons: ["spring", "summer", "autumn", "winter"],
      reliability: 0,
      expectedWinterStress: 1,
    },
    riskProfile: { ...original.riskProfile, droughtRisk: 1, depletionRisk: 1 },
  };
  const observed = source.knowledge.observedTiles[source.position];
  const band = {
    ...source,
    knowledge: {
      ...source.knowledge,
      observedTiles: {
        [source.position]: {
          ...observed,
          observedRichness: 0,
          observedWaterAccess: 0,
          observedAquaticPotential: 0,
          observedRisk: 1,
          confidence: 1,
        },
      },
      compressedKnownTileSummaries: [],
      knownAreaSummaries: [],
      knownRoutes: [],
      tileObservationHistory: [],
    },
    placeMemory: {},
    travelCorridors: {},
    crossingMemories: {},
  };
  return forceDepleteTile({
    ...world,
    tiles: { ...world.tiles, [source.position]: sterileTile },
    bands: { [band.id]: band },
    decisions: {},
  }, source.position, projection, fauna);
}

function forceDepleteTile(world, tileId, projection, fauna) {
  const current = projection.deriveCurrentLivingEcologyTile(world, tileId);
  const plantPatchState = { ...(world.plantPatchState ?? {}) };
  const faunaStocks = { ...(world.faunaStocks ?? {}) };
  for (const source of current?.sources ?? []) {
    if (source.channel === "plant") {
      plantPatchState[source.sourceId] = { depletion: 1, classId: source.sourceClass, lastUseTick: world.time.tick, cumulativeUse: 1 };
    } else {
      const prior = fauna.getFaunaStockDynamic(world, source.sourceId);
      faunaStocks[source.sourceId] = { ...prior, abundance: 0, disturbance: 1, cumulativePressure: 1, lastPressureTick: world.time.tick };
    }
  }
  return { ...world, plantPatchState, faunaStocks };
}

function collectLocalRing(world, originTileId, radius) {
  const seen = new Set([originTileId]);
  let frontier = [originTileId];
  for (let distance = 0; distance < radius; distance += 1) {
    const next = [];
    for (const tileId of frontier) {
      for (const neighborId of world.tiles[tileId]?.neighbors ?? []) {
        if (seen.has(neighborId)) continue;
        seen.add(neighborId);
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return [...seen].sort();
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}
function positiveInt(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function mean(values) { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function round(value, places = 4) { const scale = 10 ** places; return Math.round(Number(value ?? 0) * scale) / scale; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
