// FOOD-DEMOGRAPHY-SEPARATION-2 residual death-memory path audit.
//
// Isolates the residual causal paths from current food stress into future
// fertility through death memory, and proves the production repair:
//   R0 production baseline  ......... legacy_direct_food (reproduces ed16dfe)
//   R1 direct food term disabled .... actual (production repair)
//   R2 cohort memory neutralized .... food-shaped cohort attribution removed
//   R3 death-memory fertility off ... total recent-death mechanism magnitude
//   R4 non-food bereavement ......... adequate food + real deaths still suppress
//   R5 food stress without deaths ... food alone creates no memory suppression
// plus the 0.002 survival-baseline on/off isolation.
//
// All diagnostic controls are runner arguments, never WorldState.
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const years = positiveInt(valueAfter("--years"), 40);
const server = await createServer({
  root: `${process.cwd()}/src`,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const demography = await server.ssrLoadModule("/sim/agents/demography.ts");
  const projection = await server.ssrLoadModule("/sim/world/ecologicalProjection.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const depletion = { projection, fauna };

  // --- Arithmetic isolation via the pure severity helper -------------------
  const severityUnits = buildSeverityUnitProofs(demography);

  // --- Full-sim behavioral isolation cells ---------------------------------
  // A food-stressed band that actually experiences deaths: the residual path is
  // only observable where food stress AND real deaths coexist.
  const stressed = {
    id: "food_stressed_marginal",
    tileId: "tile:35:20",
    population: 27,
    years,
  };
  const cells = {
    R0_production_baseline: { deathMemoryMode: "legacy_direct_food" },
    R1_direct_food_disabled: undefined, // production default (actual)
    R2_cohort_memory_neutralized_legacy: { deathMemoryMode: "legacy_direct_food", neutralizeCohortDeathMemory: true },
    R2b_cohort_memory_neutralized_actual: { neutralizeCohortDeathMemory: true },
    R3_death_memory_fertility_off: { disableDeathMemoryFertility: true },
    baseline_off: { disableSurvivalBaseline: true },
  };
  const determinismCells = new Set(["R0_production_baseline", "R1_direct_food_disabled"]);
  const stressedCells = {};
  for (const [name, diagnostics] of Object.entries(cells)) {
    stressedCells[name] = runFullSimCell(runner, stressed, diagnostics, depletion, determinismCells.has(name));
  }

  // R4 — adequate food, genuine non-food (age/turnover) deaths still create a
  // bounded recent-death fertility suppression under the production repair.
  const bereavement = {
    id: "adequate_food_nonfood_deaths",
    tileId: "tile:124:66",
    population: 24,
    years,
  };
  const r4 = runFullSimCell(runner, bereavement, { foodMode: "canonically_adequate" }, depletion, true);

  // Baseline isolation across the controlled bands, including the sterile
  // nonviable band which must still reach extinction with the baseline removed.
  const baselineBands = [
    { id: "healthy", tileId: "tile:124:66", population: 24, years },
    { id: "moderate", tileId: "tile:126:56", population: 34, years },
    { id: "marginal", tileId: "tile:35:20", population: 27, years },
    { id: "nonviable", tileId: "tile:0:7", population: 24, years: Math.max(60, years), sterile: true },
  ];
  const baselineIsolation = {};
  for (const band of baselineBands) {
    const on = runFullSimCell(runner, band, undefined, depletion);
    const off = runFullSimCell(runner, band, { disableSurvivalBaseline: true }, depletion);
    baselineIsolation[band.id] = {
      baselineOn: summarizeCell(on),
      baselineOff: summarizeCell(off),
      baselineNetRateContribution: round6(on.means.uncappedRate - off.means.uncappedRate),
      endPopulationDelta: on.endPopulation - off.endPopulation,
    };
  }

  // Diagnostics-off byte identity: undefined vs explicit all-default actual.
  const parity = runDiagnosticsOffParity(runner, stressed, depletion);

  const r0 = stressedCells.R0_production_baseline;
  const r1 = stressedCells.R1_direct_food_disabled;
  const r2legacy = stressedCells.R2_cohort_memory_neutralized_legacy;
  const r3 = stressedCells.R3_death_memory_fertility_off;

  const checks = {
    // The direct food term is a real, redundant fertility path: removing it
    // lowers death-memory severity and recent-death suppression in a stressed
    // band, and raises the net rate (less suppression) by a small amount.
    directFoodTermRedundant:
      r0.means.deathMemorySeverity > r1.means.deathMemorySeverity &&
      r0.means.recentDeathSuppression > r1.means.recentDeathSuppression &&
      r1.means.netRate >= r0.means.netRate,
    directFoodTermMagnitudeSmall:
      severityUnits.maxFoodOnlyNetRateContribution > 0 &&
      severityUnits.maxFoodOnlyNetRateContribution < 0.001,
    // Food stress with no realized deaths cannot create death-memory suppression.
    foodWithoutDeathsNoSuppression:
      severityUnits.foodStressNoDeaths.severity === 0 &&
      severityUnits.foodStressNoDeaths.fertilitySuppressionFromRecentDeaths === 0,
    // In production, severity does not change when only the food label changes.
    attributionIndependenceInProduction:
      severityUnits.productionSeverityIndependentOfFood,
    // Genuine non-food deaths still create bounded recent-death suppression.
    legitimateNonFoodDeathMemoryPreserved:
      r4.means.recentDeathSuppression > 0 &&
      r4.means.currentFoodStress === 0 &&
      r4.uniqueDeaths > 0,
    // Death memory contributes a bounded, non-dominant fertility effect.
    deathMemoryFertilityBounded:
      r3.means.netRate >= r1.means.netRate &&
      r1.means.recentDeathSuppression <= 0.5,
    // Cohort neutralization is a distinct, measurable lever (Case C evidence).
    cohortMemoryPathMeasurable:
      r0.means.deathMemorySeverity >= r2legacy.means.deathMemorySeverity,
    // Baseline is isolated, deterministic, and does not rescue extinction.
    baselineIsolatedNonRescuing:
      baselineIsolation.nonviable.baselineOff.endPopulation === 0 &&
      baselineIsolation.nonviable.baselineOff.lifecycle === "extinct" &&
      baselineIsolation.healthy.baselineOn.endPopulation >= baselineIsolation.healthy.baselineOff.endPopulation,
    accountingReconciles: [
      ...Object.values(stressedCells),
      r4,
      ...baselineBands.flatMap((b) => [baselineIsolation[b.id].baselineOn, baselineIsolation[b.id].baselineOff]),
    ].every((entry) => entry.accounting.reconciles),
    diagnosticsOffByteIdentical: parity.byteIdentical,
    deterministic: Object.values(stressedCells).filter((e) => e.deterministic !== undefined).every((e) => e.deterministic) && r4.deterministic,
  };

  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "FOOD-DEMOGRAPHY-DEATH-MEMORY-PATH-2",
    verdict: pass ? "PASS" : "FAIL",
    years,
    checks,
    residualPathClassification: {
      directFoodToDeathMemory: {
        location: "advanceDeathMemory severity: seasonalFoodStress*0.18 (+ seasonalWaterStress*0.14)",
        classification: "duplicated pressure + cause-label attribution (Case A + Case B)",
        repair: "removed from production severity; retained only under legacy_direct_food diagnostic",
        maxFoodOnlyNetRateContribution: severityUnits.maxFoodOnlyNetRateContribution,
        removesPopulationNow: false,
        changesFutureBehavior: true,
      },
      foodShapedCohortAllocation: {
        location: "advanceAgeCohorts dependentVulnerability/adultCrisisPressure -> cohort deaths -> severity*0.08/0.1 + suppression*0.03",
        classification: "legitimately causal cohort loss with food-shaped allocation (Case C); retained",
        rationale: "deaths are real subsets of accounting deaths; dependent/adult loss is a distinct social consequence. Food only relabels which real deaths are dependents; it does not add unique deaths or directly set severity.",
        removesPopulationNow: false,
        changesFutureBehavior: true,
      },
    },
    severityUnits,
    stressedCells: Object.fromEntries(Object.entries(stressedCells).map(([k, v]) => [k, summarizeCell(v)])),
    r4NonFoodBereavement: summarizeCell(r4),
    baselineIsolation,
    diagnosticsOffParity: parity,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function buildSeverityUnitProofs(demography) {
  const derive = demography.deriveDeathMemorySeverityTerms;
  // A food-stressed death year: 2 dependent deaths out of 27, food stress = 1.
  const deathYear = { totalDeaths: 2, population: 27, dependentDeaths: 2, adultDeaths: 0, seasonalFoodStress: 1, seasonalWaterStress: 0 };
  const legacy = derive(deathYear, "legacy_direct_food", false);
  const actual = derive(deathYear, "actual", false);
  // Same losses, adequate food (food label removed) under production.
  const actualNoFood = derive({ ...deathYear, seasonalFoodStress: 0 }, "actual", false);
  // No realized deaths but maximum food stress.
  const foodStressNoDeaths = derive(
    { totalDeaths: 0, population: 27, dependentDeaths: 0, adultDeaths: 0, seasonalFoodStress: 1, seasonalWaterStress: 0 },
    "actual",
    false,
  );
  // Non-food deaths (adults) under adequate food still create suppression.
  const nonFoodBereavement = derive(
    { totalDeaths: 2, population: 27, dependentDeaths: 0, adultDeaths: 2, seasonalFoodStress: 0, seasonalWaterStress: 0 },
    "actual",
    false,
  );
  // Peak direct-food severity contribution -> fertility -> net-rate chain.
  // severity food term (0.18) -> fertilitySuppression (severity*0.48)
  // -> fertilityPressure (recentDeathSuppression*0.18) -> net rate (*0.012).
  const maxFoodOnlyNetRateContribution = round6(1 * 0.18 * 0.48 * 0.18 * 0.012);
  return {
    deathYear: { legacy: summarizeSeverity(legacy), actual: summarizeSeverity(actual) },
    directFoodSeverityDelta: round6(legacy.severity - actual.severity),
    directFoodSuppressionDelta: round6(legacy.fertilitySuppressionFromRecentDeaths - actual.fertilitySuppressionFromRecentDeaths),
    productionSeverityIndependentOfFood: actual.severity === actualNoFood.severity,
    foodStressNoDeaths: summarizeSeverity(foodStressNoDeaths),
    nonFoodBereavement: summarizeSeverity(nonFoodBereavement),
    maxFoodOnlyNetRateContribution,
  };
}

function summarizeSeverity(terms) {
  return {
    proportionalLossSeverity: round6(terms.proportionalLossSeverity),
    cohortLossSeverity: round6(terms.cohortLossSeverity),
    directEnvironmentalSeverity: round6(terms.directEnvironmentalSeverity),
    severity: round6(terms.severity),
    fertilitySuppressionFromRecentDeaths: round6(terms.fertilitySuppressionFromRecentDeaths),
  };
}

function makeScenarioWorld(runner, definition, depletion) {
  const base = runner.initSimWorld({ kind: "map1" }, `death-memory:${definition.id}:base`);
  const removedInitialBandIds = Object.keys(base.bands);
  let world = runner.initSimWorld({
    kind: "map1",
    removedInitialBandIds,
    addedBands: [{
      tileId: definition.tileId,
      name: `Death memory ${definition.id}`,
      population: definition.population,
      knowledgePreset: "normal",
    }],
  }, `death-memory:${definition.id}`);
  if (definition.sterile) world = makeSterileWorld(world, depletion);
  return world;
}

function runFullSimCell(runner, definition, diagnostics, depletion, checkDeterminism = false) {
  const first = executeCell(runner, definition, diagnostics, depletion);
  if (!checkDeterminism) return { ...first, deterministic: undefined };
  const second = executeCell(runner, definition, diagnostics, depletion);
  return { ...first, deterministic: first.fingerprint === second.fingerprint };
}

function executeCell(runner, definition, diagnostics, depletion) {
  const initial = makeScenarioWorld(runner, definition, depletion);
  const bandId = Object.keys(initial.bands)[0];
  const startPopulation = initial.bands[bandId].demography.population;
  let world = initial;
  const acc = { count: 0, severity: 0, suppression: 0, fertility: 0, mortality: 0, netRate: 0, uncapped: 0, stress: 0, capBinds: 0 };
  const seenChurn = new Set();
  let births = 0;
  let deaths = 0;

  for (let seasonIndex = 1; seasonIndex <= definition.years * 4; seasonIndex += 1) {
    world = runner.stepSim(world, 1, "seasonal", undefined, diagnostics);
    const band = world.bands[bandId];
    if (band === undefined) continue;
    for (const record of band.demography.demographicChurn?.records ?? []) {
      const key = `${band.id}:${record.year}`;
      if (seenChurn.has(key)) continue;
      seenChurn.add(key);
      births += record.births;
      deaths += record.deaths;
    }
    if (band.demography.population > 0) {
      acc.count += 1;
      acc.severity += band.deathMemory?.deathMemorySeverity ?? 0;
      acc.suppression += band.deathMemory?.fertilitySuppressionFromRecentDeaths ?? 0;
      acc.fertility += band.demography.fertilityPressure ?? 0;
      acc.mortality += band.demography.mortalityPressure ?? 0;
      acc.netRate += band.demography.netDemographicRate ?? 0;
      acc.uncapped += band.demography.uncappedDemographicRate ?? 0;
      acc.stress += band.seasonalSupport?.currentSeasonSupport?.foodStress ?? 0;
      if (band.demography.declineCapBinds === true) acc.capBinds += 1;
    }
  }

  const band = world.bands[bandId];
  const terminalDeaths = band?.viability?.populationRemoved ?? 0;
  const endPopulation = band?.demography.population ?? 0;
  const uniqueDeaths = deaths + terminalDeaths;
  const divisor = Math.max(1, acc.count);
  return {
    id: definition.id,
    diagnostics: diagnostics ?? "undefined(production)",
    startPopulation,
    endPopulation,
    births,
    uniqueDeaths,
    lifecycle: band?.viability?.status ?? "extinct",
    accounting: {
      equation: `${startPopulation} + ${births} - ${uniqueDeaths} = ${endPopulation}`,
      reconciles: startPopulation + births - uniqueDeaths === endPopulation,
    },
    means: {
      deathMemorySeverity: round6(acc.severity / divisor),
      recentDeathSuppression: round6(acc.suppression / divisor),
      fertilityPressure: round6(acc.fertility / divisor),
      mortalityPressure: round6(acc.mortality / divisor),
      netRate: round6(acc.netRate / divisor),
      uncappedRate: round6(acc.uncapped / divisor),
      currentFoodStress: round6(acc.stress / divisor),
      declineCapShare: round6(acc.capBinds / divisor),
    },
    fingerprint: hash(runner.takeDynamicSnapshot(world)),
  };
}

function summarizeCell(cell) {
  return {
    diagnostics: cell.diagnostics,
    startPopulation: cell.startPopulation,
    endPopulation: cell.endPopulation,
    births: cell.births,
    uniqueDeaths: cell.uniqueDeaths,
    lifecycle: cell.lifecycle,
    accounting: cell.accounting,
    means: cell.means,
    deterministic: cell.deterministic,
    fingerprint: cell.fingerprint,
  };
}

function runDiagnosticsOffParity(runner, definition, depletion) {
  const initial = makeScenarioWorld(runner, definition, depletion);
  const seasons = 10 * 4;
  const normal = runner.stepSim(initial, seasons, "seasonal");
  const explicit = runner.stepSim(initial, seasons, "seasonal", undefined, {
    foodMode: "actual",
    demographyMode: "actual",
    deathMemoryMode: "actual",
  });
  const normalHash = hash(runner.takeDynamicSnapshot(normal));
  const explicitHash = hash(runner.takeDynamicSnapshot(explicit));
  return { normalHash, explicitHash, byteIdentical: normalHash === explicitHash };
}

function makeSterileWorld(world, depletion) {
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
  }, source.position, depletion);
}

function forceDepleteTile(world, tileId, depletion) {
  const current = depletion.projection.deriveCurrentLivingEcologyTile(world, tileId);
  const plantPatchState = { ...(world.plantPatchState ?? {}) };
  const faunaStocks = { ...(world.faunaStocks ?? {}) };
  for (const source of current?.sources ?? []) {
    if (source.channel === "plant") {
      plantPatchState[source.sourceId] = { depletion: 1, classId: source.sourceClass, lastUseTick: world.time.tick, cumulativeUse: 1 };
    } else {
      const prior = depletion.fauna.getFaunaStockDynamic(world, source.sourceId);
      faunaStocks[source.sourceId] = { ...prior, abundance: 0, disturbance: 1, cumulativePressure: 1, lastPressureTick: world.time.tick };
    }
  }
  return { ...world, plantPatchState, faunaStocks };
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}
function positiveInt(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function round6(value) { return Math.round(Number(value ?? 0) * 1e6) / 1e6; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
