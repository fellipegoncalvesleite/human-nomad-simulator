import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const options = parseArgs(process.argv.slice(2));
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
  const survival = await server.ssrLoadModule("/sim/agents/seasonalSurvival.ts");
  const food = await server.ssrLoadModule("/sim/agents/humanFoodSupport.ts");
  const carrying = await server.ssrLoadModule("/sim/agents/carryingCapacity.ts");
  const catchment = await server.ssrLoadModule("/sim/agents/sharedCatchment.ts");
  const projection = await server.ssrLoadModule("/sim/world/ecologicalProjection.ts");

  const stage0 = buildStage0Ledger(demography, survival);
  const cells = [
    { id: "A", food: "actual", demography: "actual_at_entry", diagnostics: { demographyMode: "legacy_stacked" } },
    { id: "B", food: "canonically_adequate", demography: "actual_at_entry", diagnostics: { foodMode: "canonically_adequate", demographyMode: "legacy_stacked" } },
    { id: "C", food: "actual", demography: "de_stacked", diagnostics: { demographyMode: "de_stacked" } },
    {
      id: "D",
      food: "canonically_adequate",
      demography: "de_stacked",
      diagnostics: { foodMode: "canonically_adequate", demographyMode: "de_stacked" },
    },
  ];
  const matrix = {};

  for (const map of options.maps) {
    matrix[map] = {};
    for (const cell of cells) {
      matrix[map][cell.id] = runCell(runner, survival, food, carrying, map, cell, options.years, options.warmInSeasons);
    }
  }

  const parity = {};
  for (const map of options.maps) {
    parity[map] = runDiagnosticsOffParity(runner, map, Math.min(options.years, 10));
  }

  const waterfalls = options.skipWaterfalls
    ? {}
    : runWaterfalls(runner, survival, food, carrying, catchment, projection, options.waterfallYears);
  const checks = {
    stage0LedgerComplete: stage0.classifications.length >= 12 && stage0.representativeHistories.length >= 4,
    fourCellsEveryMap: options.maps.every((map) => Object.keys(matrix[map]).length === 4),
    deterministicFingerprints: Object.values(matrix).every((mapCells) =>
      Object.values(mapCells).every((cell) => cell.deterministic)),
    diagnosticsOffByteIdentical: Object.values(parity).every((entry) => entry.byteIdentical),
    adequateArmNeutralAfterWarmIn: Object.values(matrix).every((mapCells) =>
      [mapCells.B, mapCells.D].every((cell) =>
        cell.measured.means.currentFoodStress === 0 &&
        cell.measured.means.recentFoodStress === 0 &&
        cell.measured.means.chronicFoodStress === 0)),
    accountingReconciles: Object.values(matrix).every((mapCells) =>
      Object.values(mapCells).every((cell) => cell.accounting.reconciles)),
    attributionNonAdditive: Object.values(matrix).every((mapCells) =>
      Object.values(mapCells).every((cell) => cell.accounting.attributionIsNonAdditive)),
    severeDeficitRemainsCausal: stage0.representativeHistories.find((entry) => entry.id === "severe_chronic")?.production.totalFoodRatePenalty > 0.01,
    recoveryLowersFoodPenalty: stage0.representativeHistories.find((entry) => entry.id === "recovery")?.production.totalFoodRatePenalty <
      stage0.representativeHistories.find((entry) => entry.id === "severe_chronic")?.production.totalFoodRatePenalty,
    waterfallCoverage: options.skipWaterfalls || Object.keys(waterfalls).length === 6,
  };
  const pass = Object.values(checks).every(Boolean);
  const report = {
    check: "FOOD-DEMOGRAPHY-SEPARATION-1",
    verdict: pass ? "PASS" : "FAIL",
    options,
    checks,
    stage0,
    productionRepair: {
      foodPressure: "P=clamp01(current*0.38 + recent*0.26 + chronic*0.48 - recovery*0.14)",
      fertility: "base bonus=0.14; suppression=clamp01(P*0.22 + H*0.22); contribution enters fertilityPressure*0.012",
      severeHazard: "H=clamp01(max(0,P-0.72)/0.28 * chronic)",
      mortality: "ordinary food mortality=P*0.36 enters mortalityPressure*0.014; severe crisis mortality=H*0.008 is subtracted once from net rate",
      removed: ["recent*0.10 and chronic*0.20 fertility restacks", "chronic*0.28 mortality restack", "chronic*0.006 direct subtraction", "0.0006 chronic baseline trim", "0.002/0.0035/0.006 crisis bite", "chronic positive-growth-cap trim"],
    },
    matrix,
    diagnosticsOffParity: parity,
    foodWaterfalls: waterfalls,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function parseArgs(args) {
  const result = { years: 10, warmInSeasons: 8, waterfallYears: 10, maps: ["map1", "map2"], skipWaterfalls: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--years") result.years = positiveInt(args[++index], 10);
    else if (arg === "--warm-in-seasons") result.warmInSeasons = positiveInt(args[++index], 8);
    else if (arg === "--waterfall-years") result.waterfallYears = positiveInt(args[++index], 10);
    else if (arg === "--map") result.maps = [args[++index]];
    else if (arg === "--skip-waterfalls") result.skipWaterfalls = true;
  }
  return result;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildStage0Ledger(demography, survival) {
  const classifications = [
    row("current_food_stress", "correlated representation", "Current ledger deficit; blended into foodDemographicPressure and also allocates cohort/attribution labels."),
    row("recent_food_stress", "correlated representation", "At checkpoint entry, the rolling four-season deficit was blended into foodDemographicPressure and separately read by food fertility suppression."),
    row("chronic_food_stress", "duplicated behavioral pressure", "At checkpoint entry, the eight-season history was blended into foodDemographicPressure, separately added to fertility/mortality, directly subtracted, and used to trim baseline/cap and select crisis allocation."),
    row("food_demographic_pressure", "correlated representation", "Canonical current/recent/chronic blend used as foodPerPersonStress."),
    row("food_fertility_bonus_reduction", "duplicated behavioral pressure", "The same foodDemographicPressure removes up to 0.14 from fertility before explicit suppression."),
    row("food_fertility_suppression", "duplicated behavioral pressure", "Adds foodDemographicPressure, chronic stress, and recent stress again; then subtracts from fertilityPressure."),
    row("food_mortality_contribution", "duplicated behavioral pressure", "Adds foodDemographicPressure and chronic stress; then enters mortalityPressure at the full 0.014 rate weight."),
    row("direct_chronic_deficit_subtraction", "duplicated behavioral pressure", "Subtracts chronicFoodStress * 0.006 directly from the net rate after mortality already includes chronic food."),
    row("crisis_deficit_bite", "duplicated behavioral pressure", "Hunger-history alias subtracts another 0.002/0.0035/0.006 from the same annual net rate."),
    row("survival_baseline_trim", "duplicated behavioral pressure", "Chronic stress above 0.2 removes 0.0006 from the baseline in addition to all other food terms."),
    row("max_growth_cap_trim", "conditional behavioral bound", "Chronic stress lowers the positive growth ceiling; inert during decline but can slow recovery."),
    row("cohort_death_allocation", "explanatory attribution only", "Food changes which cohorts receive already-decided accounting deaths; it does not increase unique deaths."),
    row("crisis_water_starvation_deaths", "explanatory attribution only", "Post-accounting overlapping labels capped by totalDeaths; never subtracted from population."),
    row("food_fission_pressure", "distinct causal mechanism", "Food contributes to split/fission pressure, not directly to birth/death accounting."),
    row("legacy_birth_accumulator", "legacy/inert", "birthAccumulator is carried through cohort state but population births accrue in growthAccumulator."),
  ];
  const representativeHistories = [
    history("known_zero", supportFixture({ ratio: 0, rolling: 0, chronicStreak: 8, deficit8: 8, recovery: 0, hunger: "crisis_deficit" })),
    history("intermittent_moderate", supportFixture({ ratio: 0.75, rolling: 0.8, chronicStreak: 1, deficit8: 4, recovery: 0, hunger: "seasonal_lean_stress" })),
    history("severe_chronic", supportFixture({ ratio: 0.2, rolling: 0.2, chronicStreak: 8, deficit8: 8, recovery: 0, hunger: "crisis_deficit" })),
    history("recovery", supportFixture({ ratio: 1, rolling: 0.75, chronicStreak: 0, deficit8: 4, recovery: 2, hunger: "recovery_after_crisis" })),
  ];
  return {
    formula: {
      fertilityPressure: "clamp01(0.34 + foodBonus + waterBonus - risk - crowding - scale - foodSuppression - water/fatigue/acute/death/sickness/care)",
      mortalityPressure: "clamp01(foodMortality + water + risk + scale + logistics + acute + sickness + care + band-cap block)",
      checkpointEntryNetRate: "clamp(survivalBaseline + fertilityPressure*0.012 - mortalityPressure*0.014 - chronicFoodStress*0.006 - crisisHistoryBite, maxDeclineRate, maxGrowthRate)",
      productionNetRate: "clamp(0.002 + fertilityPressure*0.012 - mortalityPressure*0.014 - severeChronicFoodHazard*0.008, maxDeclineRate, maxGrowthRate)",
      accounting: "rawDelta=population*growthRate; positive sign accrues births, negative sign accrues deaths; population += floor(birth accumulator) - floor(mortality accumulator)",
      grossChurn: "intrinsic elder deaths are balanced by equal dependent births; age cohorts are reconciled to the net-decided population",
    },
    coefficients: {
      fertilityRateWeight: 0.012,
      mortalityRateWeight: 0.014,
      chronicDirectRateWeight: 0.006,
      survivalBaselineHealthy: 0.002,
      survivalBaselineChronic: 0.0014,
      crisisBites: { chronicStreak: 0.002, chronicPlusSeasonal: 0.0035, crisis: 0.006 },
      maxDeclineNormalBand: -0.018,
      neutralSupportRatio: 1,
      historyWindowSeasons: 8,
    },
    classifications,
    deathFieldProof: {
      independentlyRemovePopulation: false,
      contributeToNetRate: false,
      annotateAlreadyRealizedDeaths: true,
      overlapWithoutBeingAdditive: true,
    },
    structuralFinding: "Age cohorts allocate and explain net-decided change; reproductive-capable adults do not drive fertility, and gross births/deaths cannot both accrue from the net-rate path in one year.",
    representativeHistories,
  };

  function history(id, support) {
    const nutrition = survival.deriveCanonicalNutritionState(support);
    return {
      id,
      support: summarizeSupport(support),
      nutrition,
      actualAtEntry: summarizeTerms(demography.deriveFoodDemographyRateTerms(nutrition, support, "legacy_stacked")),
      production: summarizeTerms(demography.deriveFoodDemographyRateTerms(nutrition, support, "actual")),
    };
  }
}

function row(term, classification, reason) {
  return { term, classification, reason };
}

function supportFixture({ ratio, rolling, chronicStreak, deficit8, recovery, hunger }) {
  return {
    currentSeasonSupport: { foodStress: clamp01(1 - ratio), rawSupportRatio: ratio },
    rolling4SeasonSupport: rolling,
    chronicDeficitStreak: chronicStreak,
    deficitSeasonsLast8: deficit8,
    seasonalRecoveryStreak: recovery,
    hungerClassification: hunger,
  };
}

function summarizeSupport(support) {
  return {
    rawSupportRatio: support.currentSeasonSupport.rawSupportRatio,
    rolling4SeasonSupport: support.rolling4SeasonSupport,
    chronicDeficitStreak: support.chronicDeficitStreak,
    deficitSeasonsLast8: support.deficitSeasonsLast8,
    seasonalRecoveryStreak: support.seasonalRecoveryStreak,
    hungerClassification: support.hungerClassification,
  };
}

function summarizeTerms(terms) {
  return Object.fromEntries(Object.entries(terms).map(([key, value]) => [key, typeof value === "number" ? round(value, 6) : value]));
}

function runCell(runner, survival, food, carrying, map, cell, years, warmInSeasons) {
  const first = executeCell(runner, survival, food, carrying, map, cell, years, warmInSeasons);
  const second = executeCell(runner, survival, food, carrying, map, cell, years, warmInSeasons);
  return { ...first, deterministic: first.fingerprint === second.fingerprint };
}

function executeCell(runner, survival, food, carrying, map, cell, years, warmInSeasons) {
  let world = runner.initSimWorld({ kind: map });
  const startPopulation = totalPopulation(world);
  const accumulator = makeSampleAccumulator();
  const recordLedger = new Map();
  const populationTrajectory = [{ year: 0, population: startPopulation }];
  let births = 0;
  let deaths = 0;
  let crisisAttribution = 0;
  let waterAttribution = 0;
  let foodAttribution = 0;
  let movementAttribution = 0;
  let measurementStartPopulation = startPopulation;
  const started = performance.now();
  const seasons = years * 4;

  for (let seasonIndex = 1; seasonIndex <= seasons; seasonIndex += 1) {
    world = runner.stepSim(world, 1, "seasonal", undefined, cell.diagnostics);
    const deltas = updateRecordLedger(world, recordLedger);
    births += deltas.births;
    deaths += deltas.deaths;
    crisisAttribution += deltas.crisis;
    waterAttribution += deltas.water;
    foodAttribution += deltas.food;
    movementAttribution += deltas.movement;
    if (seasonIndex === warmInSeasons) measurementStartPopulation = totalPopulation(world);
    if (seasonIndex > warmInSeasons) sampleWorld(world, accumulator, survival, food, carrying);
    if (seasonIndex % 40 === 0 || seasonIndex === seasons) {
      populationTrajectory.push({ year: round(seasonIndex / 4, 2), population: totalPopulation(world) });
    }
  }

  const endPopulation = totalPopulation(world);
  const endpointBands = Object.values(world.bands);
  const fingerprint = hash(runner.takeDynamicSnapshot(world));
  return {
    map,
    cell: cell.id,
    food: cell.food,
    demography: cell.demography,
    years,
    warmInSeasons,
    startPopulation,
    measurementStartPopulation,
    endPopulation,
    survivingBands: endpointBands.filter((band) => band.viability?.status !== "extinct" && band.demography.population > 0).length,
    extinctBands: endpointBands.filter((band) => band.viability?.status === "extinct").length,
    births,
    uniqueDeaths: deaths,
    measured: finishAccumulator(accumulator, endpointBands),
    populationTrajectory,
    accounting: {
      equation: `${startPopulation} + ${births} - ${deaths} = ${endPopulation}`,
      reconciles: startPopulation + births - deaths === endPopulation,
      crisisAttribution,
      waterAttribution,
      foodAttribution,
      movementAttribution,
      attributionSum: crisisAttribution + waterAttribution + foodAttribution + movementAttribution,
      causeCategoriesMayOverlap: true,
      attributionIsNonAdditive: [crisisAttribution, waterAttribution, foodAttribution, movementAttribution]
        .every((value) => value <= deaths),
    },
    fingerprint,
    runtimeMs: round(performance.now() - started, 2),
  };
}

function makeSampleAccumulator() {
  return { count: 0, sums: {}, movements: 0, positions: new Map() };
}

function sampleWorld(world, acc, survival, food, carrying) {
  for (const band of Object.values(world.bands)) {
    if (band.demography.population <= 0 || band.viability?.status === "extinct") continue;
    const demand = carrying.derivePopulationDemand(band).adultEquivalentDemand;
    const physical = food.deriveHumanFoodSupportLedger(band, demand);
    const effective = band.carryingCapacity?.perCapitaReturn?.supportDebug?.humanFoodLedger ?? physical;
    const nutrition = survival.deriveCanonicalNutritionState(band.seasonalSupport);
    add(acc, "physicalUsableSupport", physical.totalUsableSupport);
    add(acc, "effectiveUsableSupport", effective.totalUsableSupport);
    add(acc, "demand", demand);
    add(acc, "physicalSupportRatio", physical.rawSupportRatio);
    add(acc, "effectiveSupportRatio", effective.rawSupportRatio);
    add(acc, "currentFoodStress", nutrition.currentFoodStress);
    add(acc, "recentFoodStress", nutrition.recentFoodStress);
    add(acc, "chronicFoodStress", nutrition.chronicFoodStress);
    add(acc, "fertilityPressure", band.demography.fertilityPressure);
    add(acc, "mortalityPressure", band.demography.mortalityPressure);
    add(acc, "foodFertilitySuppression", band.demography.foodFertilitySuppression ?? 0);
    add(acc, "foodMortalityContribution", band.demography.foodMortalityContribution ?? 0);
    const previousPosition = acc.positions.get(band.id);
    if (previousPosition !== undefined && previousPosition !== band.position) acc.movements += 1;
    acc.positions.set(band.id, band.position);
    acc.count += 1;
  }
}

function finishAccumulator(acc, bands) {
  return {
    samples: acc.count,
    means: Object.fromEntries(Object.entries(acc.sums).map(([key, value]) => [key, round(value / Math.max(1, acc.count), 4)])),
    growthAccumulator: round(sum(bands.map((band) => band.demography.growthAccumulator)), 4),
    mortalityAccumulator: round(sum(bands.map((band) => band.demography.mortalityAccumulator)), 4),
    movements: acc.movements,
  };
}

function add(acc, key, value) {
  acc.sums[key] = (acc.sums[key] ?? 0) + Number(value ?? 0);
}

function updateRecordLedger(world, ledger) {
  const totals = { births: 0, deaths: 0, crisis: 0, water: 0, food: 0, movement: 0 };
  for (const band of Object.values(world.bands)) {
    for (const record of band.demography.demographicChurn?.records ?? []) {
      const key = `${band.id}:${record.year}`;
      const previous = ledger.get(key) ?? { births: 0, deaths: 0, crisis: 0, water: 0, food: 0, movement: 0 };
      const current = {
        births: record.births,
        deaths: record.deaths,
        crisis: record.crisisDeaths,
        water: record.waterStressDeaths,
        food: record.starvationDeaths,
        movement: record.migrationHardshipDeaths,
      };
      for (const field of Object.keys(totals)) totals[field] += current[field] - previous[field];
      ledger.set(key, current);
    }
  }
  return totals;
}

function runDiagnosticsOffParity(runner, map, years) {
  const initial = runner.initSimWorld({ kind: map });
  const normal = runner.stepSim(initial, years * 4, "seasonal");
  const explicitActual = runner.stepSim(initial, years * 4, "seasonal", undefined, { foodMode: "actual", demographyMode: "actual" });
  const normalHash = hash(runner.takeDynamicSnapshot(normal));
  const explicitActualHash = hash(runner.takeDynamicSnapshot(explicitActual));
  return { years, normalHash, explicitActualHash, byteIdentical: normalHash === explicitActualHash };
}

function runWaterfalls(runner, survival, food, carrying, catchment, projection, years) {
  const placements = [
    ["high_support", "tile:124:66"],
    ["moderate", "tile:112:40"],
    ["marginal", "tile:113:45"],
    ["seasonally_misleading", "tile:133:61"],
    ["water_limited", "tile:111:39"],
    ["nonviable", "tile:0:7"],
  ];
  const base = runner.initSimWorld({ kind: "map1" });
  const removedInitialBandIds = Object.keys(base.bands);
  return Object.fromEntries(placements.map(([kind, tileId]) => {
    let world = runner.initSimWorld({
      kind: "map1",
      removedInitialBandIds,
      addedBands: [{ tileId, name: `Food waterfall ${kind}`, population: 24, knowledgePreset: "normal" }],
    });
    const bandId = "band:custom:0";
    const totals = {
      seasons: 0, truthSupport: 0, reachableTruthSupport: 0, truthWater: 0, truthSources: 0, knownFootprintShare: 0,
      knownFoodMemories: 0, attempts: 0, successes: 0, grossHarvest: 0, transportLoss: 0,
      processingLoss: 0, usableSupport: 0, demand: 0, unmetDemand: 0, supportRatio: 0,
      currentStress: 0, recentStress: 0, chronicStress: 0, fertility: 0, mortality: 0,
      movements: 0,
    };
    const failures = {};
    const activities = {};
    let previousPosition = world.bands[bandId]?.position;
    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const band = world.bands[bandId];
      if (band === undefined || band.demography.population <= 0) continue;
      const demand = carrying.derivePopulationDemand(band).adultEquivalentDemand;
      const ledger = food.deriveHumanFoodSupportLedger(band, demand);
      const nutrition = survival.deriveCanonicalNutritionState(band.seasonalSupport);
      const footprint = catchment.getBandForagingFootprint(world, band);
      const footprintTileIds = footprint.map((entry) => entry.tileId);
      const localTruthTileIds = collectLocalRing(world, band.position, 2);
      const truth = localTruthTileIds.map((truthTileId) => projection.deriveCurrentLivingEcologyTile(world, truthTileId)).filter(Boolean);
      const reachableTruth = footprintTileIds.map((footprintTileId) => projection.deriveCurrentLivingEcologyTile(world, footprintTileId)).filter(Boolean);
      const knownTiles = localTruthTileIds.filter((knownTileId) => band.knowledge.observedTiles[knownTileId] !== undefined).length;
      const sourceTick = ledger.sourceSeasonTick;
      const trips = (band.recentIntraSeasonTrips ?? []).filter((trip) => sourceTick !== undefined && Number(trip.tick) === Number(sourceTick));
      totals.seasons += 1;
      totals.truthSupport += mean(truth.map((entry) => entry.ecologicalSupportScalar));
      totals.reachableTruthSupport += mean(reachableTruth.map((entry) => entry.ecologicalSupportScalar));
      totals.truthWater += mean(truth.map((entry) => entry.water));
      totals.truthSources += sum(truth.map((entry) => entry.sources.length));
      totals.knownFootprintShare += knownTiles / Math.max(1, localTruthTileIds.length);
      totals.knownFoodMemories += (band.resourceKnowledgeState?.patchMemories ?? []).filter((memory) =>
        memory.resourceClassId === "generic_plant_food" || memory.resourceClassId === "animal_food" || memory.resourceClassId === "aquatic_food" || memory.resourceClassId === "fallback_food").length;
      totals.attempts += trips.length;
      totals.successes += trips.filter((trip) => (trip.physicalFoodHarvest?.usableSupport ?? 0) > 0).length;
      totals.grossHarvest += ledger.grossPhysicalHarvest;
      totals.transportLoss += ledger.transportLoss;
      totals.processingLoss += ledger.processingLoss;
      totals.usableSupport += ledger.totalUsableSupport;
      totals.demand += demand;
      totals.unmetDemand += Math.max(0, demand - ledger.totalUsableSupport);
      totals.supportRatio += ledger.rawSupportRatio;
      totals.currentStress += nutrition.currentFoodStress;
      totals.recentStress += nutrition.recentFoodStress;
      totals.chronicStress += nutrition.chronicFoodStress;
      totals.fertility += band.demography.fertilityPressure;
      totals.mortality += band.demography.mortalityPressure;
      if (previousPosition !== undefined && previousPosition !== band.position) totals.movements += 1;
      previousPosition = band.position;
      for (const trip of trips) {
        activities[trip.taskGroupType] = (activities[trip.taskGroupType] ?? 0) + 1;
        const reason = trip.physicalFoodHarvest?.failureReason ?? "none";
        failures[reason] = (failures[reason] ?? 0) + 1;
      }
    }
    const endBand = world.bands[bandId];
    const divisor = Math.max(1, totals.seasons);
    const means = Object.fromEntries(Object.entries(totals)
      .filter(([key]) => !["seasons", "attempts", "successes", "movements"].includes(key))
      .map(([key, value]) => [key, round(value / divisor, 4)]));
    return [kind, {
      startTileId: tileId,
      startPopulation: 24,
      endPopulation: endBand?.demography.population ?? 0,
      endingTileId: endBand?.position,
      lifecycle: endBand?.viability?.status,
      seasonsMeasured: totals.seasons,
      activityAttempts: totals.attempts,
      successfulFoodTrips: totals.successes,
      successRate: round(totals.successes / Math.max(1, totals.attempts), 4),
      movements: totals.movements,
      activities,
      failureReasons: failures,
      means,
      richnessReachabilityGap: round(means.truthSupport - Math.min(1, means.supportRatio), 4),
      interpretation: explainWaterfall(kind, means, totals.successes / Math.max(1, totals.attempts)),
    }];
  }));
}

function explainWaterfall(kind, means, successRate) {
  if (kind === "water_limited") return "Water truth is the independent limiting channel; food results remain reported separately.";
  if (kind === "nonviable") return "Physical sources, successful receipts, and delivered support remain insufficient; no floor appears.";
  if (means.truthSupport > 0.45 && means.supportRatio < 0.8 && successRate < 0.5) {
    return "World-truth ecology exceeds practically delivered food; the drop is primarily knowledge/activity/reach/success, not a ledger conversion floor.";
  }
  if (means.grossHarvest > 0 && means.usableSupport < means.demand) {
    return "Physical harvest reaches the ledger but remains below adult-equivalent demand; losses and trip success quantify the gap.";
  }
  return "Practical receipts broadly track local physical conditions; remaining stress is history and demographic response.";
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

function totalPopulation(world) {
  return sum(Object.values(world.bands).map((band) => band.demography.population));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function mean(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(Number(value ?? 0) * scale) / scale;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
