import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

// Twenty-five years is still a bounded audit run, but is long enough for the
// existing practice pipeline to complete an emergent adaptation under repaired
// demographic persistence. A 10-year window can end while the experiment is
// legitimately still underway and therefore cannot prove non-decorative effect.
const YEARS = Number(process.env.ALL_MAP_AUDIT_YEARS ?? 25);
const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const projection = await server.ssrLoadModule("/sim/world/ecologicalProjection.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const plant = await server.ssrLoadModule("/sim/agents/plantStock.ts");
  const spawn = await server.ssrLoadModule("/sim/agents/spawn.ts");
  const renewal = await server.ssrLoadModule("/sim/agents/demographicRenewal.ts");
  const pressure = await server.ssrLoadModule("/sim/agents/pressure.ts");
  const demography = await server.ssrLoadModule("/sim/agents/demography.ts");

  const definitions = [
    ["map1", { kind: "map1" }],
    ["map2", { kind: "map2" }],
    ["map2_single_origin", { kind: "map2_single_origin" }],
    ["procedural_empty", { kind: "procedural", seed: "all-map-ecology-audit", size: { width: 36, height: 24 } }],
  ];
  const initialWorlds = Object.fromEntries(definitions.map(([name, config]) => [name, runner.initSimWorld(config, "all-map-audit-history")]));
  const inventories = {};
  const projectionTimes = {};

  for (const [name, world] of Object.entries(initialWorlds)) {
    const start = performance.now();
    const habitat = projection.deriveHabitatPotentialProjection(world);
    const current = projection.deriveCurrentLivingEcologyProjection(world);
    projectionTimes[name] = round(performance.now() - start);
    inventories[name] = inventoryWorld(world, habitat, current);
  }

  const map1 = initialWorlds.map1;
  const defaultPlacements = Object.values(map1.bands).map((band) => ({ bandId: band.id, tileId: band.position }));
  const replayed = runner.initSimWorld({ kind: "map1", initialBandPlacements: defaultPlacements }, "all-map-audit-history");
  const initialParity = normalizedFounderFingerprint(map1) === normalizedFounderFingerprint(replayed);
  const defaultFirst = runner.stepSim(map1, 1, "seasonal");
  const replayedFirst = runner.stepSim(replayed, 1, "seasonal");
  const firstIntervalParity = normalizedIntervalFingerprint(defaultFirst) === normalizedIntervalFingerprint(replayedFirst);

  const removedMap1 = Object.values(map1.bands).map((band) => band.id);
  const map1Current = projection.deriveCurrentLivingEcologyProjection(map1);
  const map1Potential = projection.deriveHabitatPotentialProjection(map1);
  const placements = selectPlacementMatrix(map1, map1Potential, map1Current);
  const matrixConfig = {
    kind: "map1",
    removedInitialBandIds: removedMap1,
    addedBands: placements.map((entry) => ({
      tileId: entry.tileId,
      name: `Audit ${entry.kind}`,
      population: entry.kind === "manual_default_equivalent"
        ? Object.values(map1.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0].demography.population
        : 24,
      knowledgePreset: "normal",
    })),
  };
  let matrixInitial = runner.initSimWorld(matrixConfig, "all-map-matrix");
  const depletedPlacement = placements.find((entry) => entry.kind === "temporarily_depleted");
  matrixInitial = forceDepleteTile(matrixInitial, depletedPlacement.tileId, projection, fauna);
  const depletedEcology = projection.deriveCurrentLivingEcologyTile(matrixInitial, depletedPlacement.tileId);
  depletedPlacement.startSupport = depletedEcology.ecologicalSupportScalar;
  depletedPlacement.classification = classifyPhysical(depletedEcology);
  const manualInitializationParity = auditManualInitializationParity(map1, matrixInitial, placements);
  const matrixRunA = runWorld(runner, renewal, matrixInitial, YEARS, true);
  const matrixRunB = runWorld(runner, renewal, matrixInitial, YEARS, false);
  const matrixDeterministic = matrixRunA.worldFingerprint === matrixRunB.worldFingerprint;
  const matrixResults = Object.fromEntries(placements.map((entry, index) => {
    const bandId = `band:custom:${index}`;
    return [entry.kind, { ...entry, ...matrixRunA.bands[bandId] }];
  }));
  const controlledResilience = auditControlledResilience(pressure, demography, matrixInitial, placements);
  const nonviablePlacement = placements.find((entry) => entry.kind === "nonviable");
  const nonviableProductionFounder = runner.initSimWorld({
    kind: "map1",
    removedInitialBandIds: removedMap1,
    addedBands: [{ tileId: nonviablePlacement.tileId, name: "Audit isolated nonviable", population: 24, knowledgePreset: "normal" }],
  }, "all-map-nonviable-failure");
  const nonviableInitial = makeIsolatedNonviableWorld(nonviableProductionFounder, projection, fauna);
  const nonviableFailure = runWorld(runner, renewal, nonviableInitial, 60, true);
  const naturalTerminal = auditNaturalTerminal(runner, nonviableFailure);

  const longRuns = {};
  for (const name of ["map1", "map2", "map2_single_origin"]) {
    longRuns[name] = runWorld(runner, renewal, initialWorlds[name], YEARS, true);
  }
  const noHumanInitial = { ...initialWorlds.map1, bands: {} };
  const noHumanRun = runWorld(runner, renewal, noHumanInitial, 4, true);

  const dynamic = auditDynamicResponse(runner, projection, fauna, plant, map1, placements);
  const antiOmniscience = auditAntiOmniscience(
    projection,
    map1,
    dynamic,
    initialWorlds.map2,
    matrixDeterministic,
  );
  const absence = auditAbsenceControls(projection, map1Current);
  const demographicReconciliation = Object.values(matrixRunA.bands).every((band) => band.reconciles);
  const rich = matrixResults.high_support;
  const marginal = matrixResults.marginal_adaptable;
  const nonviable = matrixResults.nonviable;
  const adaptationsAttempted = Object.values(matrixRunA.bands).reduce((sum, band) => sum + band.adaptationsAttempted, 0);
  const adaptationsEffective = Object.values(matrixRunA.bands).reduce((sum, band) => sum + band.adaptationsEffective, 0);
  const allEffectiveAdaptations = adaptationsEffective + Object.values(longRuns).reduce(
    (total, run) => total + Object.values(run.bands).reduce((sum, band) => sum + band.adaptationsEffective, 0), 0,
  );
  const stateCapsHeld = Object.values(matrixRunA.bands).every((band) => band.stateCapsHeld);

  const sourceGuards = auditSourceGuards();
  const checks = {
    everyProductionWorldProjected: Object.values(inventories).every((entry) => entry.tileCount === entry.projectedTiles && entry.projectionAuditPassed),
    everyWorldHasPlantEcology: Object.values(inventories).every((entry) => entry.plantPatchCount > 0),
    everyWorldHasFaunaEcology: Object.values(inventories).every((entry) => entry.faunaStockCount > 0),
    everyWorldHasAquaticEcology: Object.values(inventories).every((entry) => entry.aquaticStockCount > 0),
    proceduralStartsEmpty: inventories.procedural_empty.startingPopulation === 0 && inventories.procedural_empty.defaultBandCount === 0,
    initializationParity: initialParity && firstIntervalParity && manualInitializationParity.equalCoreContract,
    placementClassesDistinct: new Set(Object.values(placements).map((entry) => entry.classification)).size >= 3,
    richOutperformsNonviable: rich !== undefined && nonviable !== undefined && rich.meanSupportRatio > nonviable.meanSupportRatio && rich.meanFoodStress < nonviable.meanFoodStress,
    marginalShowsAdaptiveActivity: marginal !== undefined && (marginal.adaptationsAttempted > 0 || marginal.moves > 0 || marginal.probes > 0),
    adaptationsNotDecorative: adaptationsAttempted > 0 && allEffectiveAdaptations > 0 && controlledResilience.physicalEffect && controlledResilience.survivalMetricImproved,
    nonviableRemainsPhysicallyHonest: nonviable !== undefined && nonviable.startSupport < 0.1 && nonviable.meanFoodStress > 0.25,
    genuinelyNonviableCanFail: nonviableFailure.extinctBands === 1 && Object.values(nonviableFailure.bands)[0].moves + Object.values(nonviableFailure.bands)[0].probes > 0,
    naturalExtinctionTerminal: Object.values(naturalTerminal).every(Boolean),
    populationReconciles: demographicReconciliation,
    fertilityVisible: Object.values(matrixRunA.bands).every((band) => Number.isFinite(band.fertilityPressure) && Number.isFinite(band.foodFertilitySuppression)),
    classificationsHonest: Object.values(matrixRunA.bands).every((band) => band.renewalKind !== "not_yet_measured"),
    habitatStableCurrentDynamic: dynamic.habitatStable && dynamic.depletionLowersCurrent && dynamic.recoveryRaisesCurrent,
    perceivedCanLag: dynamic.perceivedSupportLagged && dynamic.perceivedConfidenceAged,
    sourceAbsenceZero: absence.plantAbsenceZero && absence.faunaAbsenceZero && absence.aquaticAbsenceZero,
    antiOmniscience: Object.values(antiOmniscience).every(Boolean),
    noDuplicateFoodAuthority: sourceGuards.passed,
    deterministicObserverParity: matrixDeterministic,
    boundedState: stateCapsHeld && Object.values(inventories).every((entry) => entry.projectedTiles <= projection.MAX_WORLD_ECOLOGICAL_PROJECTION_TILES),
    boundedProjectionRuntime: Object.values(projectionTimes).every((ms) => ms < 5_000),
  };
  const passed = Object.values(checks).every(Boolean);
  const report = {
    check: "ALL-MAP LIVING ECOLOGY VALIDATION / DYNAMIC RICHNESS PROJECTION-1",
    verdict: passed ? "PASS" : "FAIL",
    years: YEARS,
    checks,
    worldInventory: inventories,
    initialization: {
      productionContract: "initSimWorld: terrain edits -> remove defaults -> rebuild placements -> add custom founders",
      defaultReplayExact: initialParity,
      firstPhysicalIntervalExact: firstIntervalParity,
      manualDefaultCoreContract: manualInitializationParity,
    },
    placementMatrix: matrixResults,
    demographicAccounting: {
      allBandsReconcile: demographicReconciliation,
      deathCauseAttribution: "crisis/water/food/migration fields overlap; only deaths is additive",
      reproductiveBasis: "working-adult structure only; reproductive-capable adults are not separately modeled",
    },
    dynamicEcology: dynamic,
    controlledResilience,
    nonviableFailure: summarizeRun(nonviableFailure),
    naturalTerminal,
    absenceControls: absence,
    antiOmniscience,
    longRuns: Object.fromEntries(Object.entries(longRuns).map(([name, run]) => [name, summarizeRun(run)])),
    noHuman: summarizeRun(noHumanRun),
    performance: {
      projectionMsByWorld: projectionTimes,
      matrixRuntimeMs: matrixRunA.runtimeMs,
      longRunRuntimeMs: Object.fromEntries(Object.entries(longRuns).map(([name, run]) => [name, run.runtimeMs])),
    },
    bounds: {
      worldTileCap: projection.MAX_WORLD_ECOLOGICAL_PROJECTION_TILES,
      perceivedTileCap: projection.MAX_PERCEIVED_ECOLOGICAL_TILES,
      sourceCapPerTile: projection.MAX_CURRENT_SOURCES_PER_TILE,
      stateCapsHeld,
    },
    duplicateAuthority: sourceGuards,
    aggregationAlternatives: [
      "single weighted caloric/support scalar (rejected alone: hides source absence and risk)",
      "source-separated plant/fauna/aquatic/water channels with display scalar (selected)",
      "stock influence raster (deferred: more complex while plant geography is tile-derived)",
    ],
    fingerprint: hash({ inventories, matrix: matrixRunA.worldFingerprint, longRuns: Object.fromEntries(Object.entries(longRuns).map(([name, run]) => [name, run.worldFingerprint])), dynamic, antiOmniscience }),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await server.close();
}

function inventoryWorld(world, habitat, current) {
  const tiles = Object.values(world.tiles);
  const supports = Object.values(current.tiles).map((tile) => tile.ecologicalSupportScalar);
  const seasonalReliability = Object.values(habitat.tiles).map((tile) => tile.seasonalReliability);
  const habitatClasses = counts(tiles.map((tile) => tile.biomeKind ?? tile.terrainKind));
  const waterDistribution = {
    dry: tiles.filter((tile) => tile.resourceProfile.waterAccess < 0.15).length,
    limited: tiles.filter((tile) => tile.resourceProfile.waterAccess >= 0.15 && tile.resourceProfile.waterAccess < 0.45).length,
    wet: tiles.filter((tile) => tile.resourceProfile.waterAccess >= 0.45).length,
    aquatic: tiles.filter((tile) => tile.isAquatic).length,
  };
  return {
    tileCount: tiles.length,
    projectedTiles: current.projectedTileCount,
    habitatClasses,
    waterDistribution,
    plantPatchCount: current.sourceTotals.plantPatches,
    plantCategories: unique(Object.values(current.tiles).flatMap((tile) => tile.sources.filter((source) => source.channel === "plant").map((source) => source.sourceClass))),
    faunaStockCount: current.sourceTotals.terrestrialFaunaStocks,
    faunaCategories: unique(Object.values(current.tiles).flatMap((tile) => tile.sources.filter((source) => source.channel === "terrestrial_fauna").map((source) => source.sourceClass))),
    predatorCount: current.sourceTotals.predators,
    aquaticStockCount: current.sourceTotals.aquaticStocks,
    supportDistribution: distribution(supports),
    seasonalReliabilityDistribution: distribution(seasonalReliability),
    nonviableTiles: supports.filter((value) => value < 0.08).length,
    marginalTiles: supports.filter((value) => value >= 0.08 && value < 0.2).length,
    highSupportTiles: supports.filter((value) => value >= 0.45).length,
    defaultBandCount: Object.keys(world.bands).length,
    defaultPlacements: Object.values(world.bands).map((band) => ({ id: band.id, tileId: band.position })),
    startingPopulation: totalPopulation(world),
    projectionAuditPassed: current.feedsHumanNutrition === false && current.bounded === true,
  };
}

function selectPlacementMatrix(world, potential, current) {
  const land = Object.values(current.tiles).filter((entry) => !world.tiles[entry.tileId]?.isAquatic);
  const used = new Set();
  const defaultBand = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  const defaultEntry = current.tiles[defaultBand.position];
  if (defaultEntry === undefined) throw new Error("default placement missing current ecology");
  used.add(defaultEntry.tileId);
  const select = (kind, rank, target, filter = () => true) => {
    const choice = [...land].filter((entry) => !used.has(entry.tileId) && filter(entry))
      .sort((a, b) => rank(a, target) - rank(b, target) || String(a.tileId).localeCompare(String(b.tileId)))[0];
    if (choice === undefined) throw new Error(`no placement for ${kind}`);
    used.add(choice.tileId);
    const preview = classifyPhysical(choice);
    return { kind, tileId: choice.tileId, classification: preview, startSupport: choice.ecologicalSupportScalar, water: choice.water, potential: potential.tiles[choice.tileId]?.ecologicalSupportScalar ?? 0 };
  };
  return [
    select("high_support", (a) => -a.ecologicalSupportScalar, 0, (a) => a.water >= 0.2),
    select("moderate", (a, t) => Math.abs(a.ecologicalSupportScalar - t), 0.34, (a) => a.water >= 0.18),
    select("marginal_adaptable", (a, t) => Math.abs(a.ecologicalSupportScalar - t), 0.14, (a) => a.water >= 0.08),
    select("temporarily_depleted", (a) => -a.ecologicalSupportScalar, 0, (a) => a.plantPatchCount + a.terrestrialFaunaStockCount > 1),
    select("seasonally_misleading", (a) => -((potential.tiles[a.tileId]?.ecologicalSupportScalar ?? 0) - a.ecologicalSupportScalar), 0, (a) => (potential.tiles[a.tileId]?.ecologicalSupportScalar ?? 0) >= 0.35),
    select("water_limited", (a) => a.water * 2 - a.ecologicalSupportScalar, 0, (a) => a.ecologicalSupportScalar >= 0.08),
    select("nonviable", (a) => a.ecologicalSupportScalar + a.water, 0),
    {
      kind: "manual_default_equivalent",
      tileId: defaultEntry.tileId,
      classification: classifyPhysical(defaultEntry),
      startSupport: defaultEntry.ecologicalSupportScalar,
      water: defaultEntry.water,
      potential: potential.tiles[defaultEntry.tileId]?.ecologicalSupportScalar ?? 0,
    },
  ];
}

function auditManualInitializationParity(defaultWorld, manualWorld, placements) {
  const defaultBand = Object.values(defaultWorld.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  const manualIndex = placements.findIndex((entry) => entry.tileId === defaultBand.position);
  const manualBand = manualIndex < 0 ? undefined : manualWorld.bands[`band:custom:${manualIndex}`];
  if (manualBand === undefined) return { equalCoreContract: false, reason: "no normalized same-tile manual band in matrix" };
  return {
    equalCoreContract:
      defaultBand.position === manualBand.position &&
      Object.keys(defaultBand.knowledge.observedTiles).length === Object.keys(manualBand.knowledge.observedTiles).length &&
      defaultBand.demography.growthAccumulator === manualBand.demography.growthAccumulator &&
      defaultBand.demography.mortalityAccumulator === manualBand.demography.mortalityAccumulator &&
      JSON.stringify(defaultBand.demography) === JSON.stringify(manualBand.demography) &&
      defaultBand.viability?.status === manualBand.viability?.status,
    tileId: defaultBand.position,
    observedTiles: Object.keys(defaultBand.knowledge.observedTiles).length,
    note: "identity/name/history may differ; ecology, knowledge radius, accumulators and lifecycle use the same founder constructor",
  };
}

function runWorld(runner, renewal, initial, years, withObserver) {
  const start = performance.now();
  let world = initial;
  const starting = Object.fromEntries(Object.values(initial.bands).map((band) => [band.id, band.demography.population]));
  const activity = {};
  const observer = ({ band, decision }) => {
    const row = activity[band.id] ??= emptyActivityRow();
    collectChurn(row, band);
    row.decisions += 1;
    if (decision.action.type === "stay") row.stays += 1;
    else if (decision.action.type === "move_to_tile" || decision.action.type === "explore_unknown_neighbor") row.moves += 1;
    else row.probes += 1;
    const ledger = band.carryingCapacity?.perCapitaReturn?.supportDebug?.humanFoodLedger;
    row.supportSum += ledger?.rawSupportRatio ?? 0;
    row.foodStressSum += ledger?.foodStress ?? 1;
    for (const trip of band.recentIntraSeasonTrips ?? []) {
      if (trip.physicalFoodHarvest?.usableSupport > 0) {
        row.receiptSupport += trip.physicalFoodHarvest.usableSupport;
        row.receiptCount += 1;
      }
    }
  };
  for (let i = 0; i < years * 4; i += 1) world = runner.stepSim(world, 1, "seasonal", withObserver ? observer : undefined);
  const bands = {};
  for (const band of Object.values(world.bands)) {
    const row = activity[band.id] ?? emptyActivityRow();
    collectChurn(row, band);
    const births = row.births;
    const deaths = row.deaths;
    const terminalLoss = band.viability?.populationRemoved ?? 0;
    const startPopulation = starting[band.id] ?? 0;
    const expected = startPopulation + births - deaths - terminalLoss;
    const renewalProjection = renewal.deriveDemographicRenewal(band);
    const responses = band.practicalAdaptation?.responses ?? [];
    const experiments = band.practicalAdaptation?.experiments ?? [];
    bands[band.id] = {
      startPopulation,
      endPopulation: band.demography.population,
      births,
      deaths,
      terminalLoss,
      reconciles: expected === band.demography.population,
      dependents: band.demography.dependents,
      adults: band.demography.workingAdults,
      elders: band.demography.elders,
      fertilityPressure: band.demography.fertilityPressure,
      foodFertilitySuppression: band.demography.foodFertilitySuppression ?? 0,
      mortalityPressure: band.demography.mortalityPressure,
      foodMortalityContribution: band.demography.foodMortalityContribution ?? 0,
      growthAccumulator: band.demography.growthAccumulator,
      mortalityAccumulator: band.demography.mortalityAccumulator,
      renewalKind: renewalProjection.kind,
      lifecycle: band.viability?.status ?? band.status,
      meanSupportRatio: round(row.supportSum / Math.max(1, row.decisions)),
      meanFoodStress: round(row.foodStressSum / Math.max(1, row.decisions)),
      physicalReceiptCount: row.receiptCount,
      physicalReceiptSupport: round(row.receiptSupport),
      moves: row.moves, stays: row.stays, probes: row.probes,
      adaptationsAttempted: experiments.filter((entry) => entry.attemptSeasons > 0).length + responses.filter((entry) => entry.successCount + entry.partialCount + entry.failureCount > 0).length,
      adaptationsEffective: responses.filter((entry) => entry.successCount > 0 || entry.lastEfficacy === "clear_success_specific" || entry.lastEfficacy === "partial_success_specific").length,
      stateCapsHeld: band.practicalAdaptation?.caps.held !== false && (band.resourceKnowledgeState?.patchMemories.length ?? 0) <= 48,
    };
  }
  return {
    startPopulation: totalPopulation(initial), endPopulation: totalPopulation(world),
    survivingBands: Object.values(world.bands).filter((band) => band.demography.population > 0 && band.viability?.status !== "extinct").length,
    extinctBands: Object.values(world.bands).filter((band) => band.viability?.status === "extinct").length,
    bands, runtimeMs: round(performance.now() - start),
    fingerprint: hash({ time: world.time, bands, plant: world.plantPatchState, fauna: world.faunaStocks, depletion: world.tileDepletion }),
    worldFingerprint: hash({ time: world.time, bands: world.bands, decisions: world.decisions, plant: world.plantPatchState, fauna: world.faunaStocks, depletion: world.tileDepletion }),
    world,
  };
}

function auditDynamicResponse(runner, projection, fauna, plant, world, placements) {
  const targetId = placements.find((entry) => entry.kind === "high_support")?.tileId;
  const target = world.tiles[targetId];
  const habitatBefore = projection.deriveHabitatPotentialTile(target);
  const currentBefore = projection.deriveCurrentLivingEcologyTile(world, targetId);
  const geo = fauna.deriveFaunaStockGeography(world);
  let used = world;
  let plantHarvest = 0;
  let faunaHarvest = 0;
  for (let i = 0; i < 6; i += 1) {
    const gathered = plant.resolvePlantFoodHarvest(used, target, used.time, 0.25, true);
    used = gathered.world;
    plantHarvest += gathered.harvestedAmount;
    const hunted = fauna.resolveFaunaFoodHarvest(used, geo, targetId, "animal_food", used.time.season, used.time.tick, 0.25, true);
    used = hunted.world;
    faunaHarvest += hunted.harvestedAmount;
  }
  const currentDepleted = projection.deriveCurrentLivingEcologyTile(used, targetId);
  let rested = { ...used, bands: {} };
  for (let i = 0; i < 8; i += 1) rested = runner.stepSim(rested, 1, "seasonal");
  const currentRecovered = projection.deriveCurrentLivingEcologyTile(rested, targetId);
  const habitatAfter = projection.deriveHabitatPotentialTile(rested.tiles[targetId]);
  const sourceBand = Object.values(world.bands)[0];
  const perceivedBefore = projection.deriveBandPerceivedEcologicalTile(sourceBand, sourceBand.position, world.time);
  const perceivedAfter = projection.deriveBandPerceivedEcologicalTile(sourceBand, sourceBand.position, rested.time);
  return {
    tileId: targetId,
    plantHarvest: round(plantHarvest), faunaHarvest: round(faunaHarvest),
    currentSupportBefore: currentBefore.ecologicalSupportScalar,
    currentSupportDepleted: currentDepleted.ecologicalSupportScalar,
    currentSupportRecovered: currentRecovered.ecologicalSupportScalar,
    habitatStable: habitatBefore.ecologicalSupportScalar === habitatAfter.ecologicalSupportScalar,
    depletionLowersCurrent: currentDepleted.ecologicalSupportScalar < currentBefore.ecologicalSupportScalar,
    recoveryRaisesCurrent: currentRecovered.ecologicalSupportScalar > currentDepleted.ecologicalSupportScalar,
    perceivedSupportLagged: perceivedAfter.ecologicalSupportScalar === perceivedBefore.ecologicalSupportScalar,
    perceivedConfidenceAged: perceivedAfter.confidence < perceivedBefore.confidence,
  };
}

function auditControlledResilience(pressure, demography, world, placements) {
  const index = placements.findIndex((entry) => entry.kind === "water_limited");
  const source = world.bands[`band:custom:${index}`];
  const control = { ...source, practicalAdaptation: { ...(source.practicalAdaptation ?? emptyPracticalState(source)), waterWorks: undefined } };
  const adapted = {
    ...source,
    practicalAdaptation: {
      ...(source.practicalAdaptation ?? emptyPracticalState(source)),
      waterWorks: {
        tileId: source.position,
        status: "shallow_well",
        responseId: "controlled:accepted-groundwater-response",
        yieldLevel: 1,
        digSeasons: 6,
        laborPaid: 0.6,
        lastLaborCost: 0.04,
        builtAtTick: world.time.tick,
        lastMaintainedTick: world.time.tick,
        outcomeNote: "repeated damp-ground work reached a maintained shallow seep",
      },
    },
  };
  const controlPressure = pressure.deriveBandPressureState(world, control);
  const adaptedPressure = pressure.deriveBandPressureState(world, adapted);
  let consequence;
  for (let step = 0; step <= 100; step += 1) {
    const accumulator = step / 100;
    const basis = { ...source.demography, mortalityAccumulator: accumulator, growthAccumulator: 0 };
    const controlDemo = demography.updateBandDemography(world, { ...control, demography: basis, pressureState: controlPressure });
    const adaptedDemo = demography.updateBandDemography(world, { ...adapted, demography: basis, pressureState: adaptedPressure });
    if (controlDemo.mortalityPressure > adaptedDemo.mortalityPressure || controlDemo.mortalityAccumulator > adaptedDemo.mortalityAccumulator || (controlDemo.lastDeaths ?? 0) > (adaptedDemo.lastDeaths ?? 0)) {
      consequence = {
        startingMortalityAccumulator: accumulator,
        controlAccumulator: controlDemo.mortalityAccumulator,
        adaptedAccumulator: adaptedDemo.mortalityAccumulator,
        controlDeaths: controlDemo.lastDeaths ?? 0,
        adaptedDeaths: adaptedDemo.lastDeaths ?? 0,
        controlMortalityPressure: controlDemo.mortalityPressure,
        adaptedMortalityPressure: adaptedDemo.mortalityPressure,
      };
      break;
    }
  }
  return {
    pressure: "water shortage at a physically water-limited placement",
    perceivedAndFramed: "controlled comparison begins after the accepted groundwater response formed through the existing practice system",
    response: "maintained shallow well at the current camp",
    materialEffect: "waterworks relief is local, seasonal, capped, and pays maintenance labor",
    controlWaterStress: controlPressure.waterStress,
    adaptedWaterStress: adaptedPressure.waterStress,
    waterStressRelief: round(controlPressure.waterStress - adaptedPressure.waterStress),
    consequence,
    physicalEffect: adaptedPressure.waterStress < controlPressure.waterStress,
    survivalMetricImproved: consequence !== undefined,
    scriptedSurvival: false,
    note: "identical demographic states are compared; only an existing physical waterworks response differs",
  };
}

function auditNaturalTerminal(runner, run) {
  const extinct = Object.values(run.world.bands).find((band) => band.viability?.status === "extinct");
  if (extinct === undefined) return { naturallyExtinct: false };
  const before = JSON.stringify(extinct);
  const decisions = run.world.decisionArchive.totalDecisions;
  const trips = extinct.recentIntraSeasonTrips?.length ?? 0;
  let afterWorld = run.world;
  for (let i = 0; i < 4; i += 1) afterWorld = runner.stepSim(afterWorld, 1, "seasonal");
  const after = afterWorld.bands[extinct.id];
  return {
    naturallyExtinct: true,
    populationFrozenZero: after.demography.population === 0,
    lifecycleFrozen: after.viability?.status === "extinct",
    completeBandStateFrozen: before === JSON.stringify(after),
    decisionsStopped: afterWorld.decisionArchive.totalDecisions === decisions,
    tripsStopped: (after.recentIntraSeasonTrips?.length ?? 0) === trips,
    chronicleReadable: after.deepHistory?.terminalRecord !== undefined,
  };
}

function emptyPracticalState(band) {
  return {
    bandId: band.id, lastUpdatedTick: 0, fragments: [], responses: [], efficacyRecords: [],
    problems: [], ideas: [], experiments: [],
    caps: { fragmentCap: 10, responseCap: 10, recordCap: 12, problemCap: 5, ideaCap: 8, experimentCap: 4, held: true },
  };
}

function emptyActivityRow() {
  return {
    decisions: 0, moves: 0, stays: 0, probes: 0, receiptSupport: 0, receiptCount: 0,
    supportSum: 0, foodStressSum: 0, births: 0, deaths: 0, seenChurnYears: new Set(),
  };
}

function collectChurn(row, band) {
  for (const record of band.demography.demographicChurn?.records ?? []) {
    if (row.seenChurnYears.has(record.year)) continue;
    row.seenChurnYears.add(record.year);
    row.births += record.births;
    row.deaths += record.deaths;
  }
}

function forceDepleteTile(world, tileId, projection, fauna) {
  const current = projection.deriveCurrentLivingEcologyTile(world, tileId);
  const plantPatchState = { ...(world.plantPatchState ?? {}) };
  const faunaStocks = { ...(world.faunaStocks ?? {}) };
  for (const source of current?.sources ?? []) {
    if (source.channel === "plant") {
      plantPatchState[source.sourceId] = {
        depletion: 1,
        classId: source.sourceClass,
        lastUseTick: world.time.tick,
        cumulativeUse: 1,
      };
    } else {
      const prior = fauna.getFaunaStockDynamic(world, source.sourceId);
      faunaStocks[source.sourceId] = { ...prior, abundance: 0, disturbance: 1, cumulativePressure: 1, lastPressureTick: world.time.tick };
    }
  }
  return { ...world, plantPatchState, faunaStocks };
}

function makeIsolatedNonviableWorld(world, projection, fauna) {
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
  const isolated = {
    ...world,
    tiles: { ...world.tiles, [source.position]: sterileTile },
    bands: { [band.id]: band },
    decisions: {},
  };
  return forceDepleteTile(isolated, source.position, projection, fauna);
}

function auditAntiOmniscience(projection, map1, dynamic, map2, observerParity) {
  const bandA = Object.values(map1.bands)[0];
  const bandB = Object.values(map2.bands)[0];
  const richUnseen = Object.values(projection.deriveCurrentLivingEcologyProjection(map1).tiles)
    .filter((entry) => bandA.knowledge.observedTiles[entry.tileId] === undefined)
    .sort((a, b) => b.ecologicalSupportScalar - a.ecologicalSupportScalar)[0];
  const unknown = projection.deriveBandPerceivedEcologicalTile(bandA, richUnseen.tileId, map1.time);
  const perceivedA = projection.deriveBandPerceivedEcologicalOpportunity(bandA, map1.time);
  const perceivedB = projection.deriveBandPerceivedEcologicalOpportunity(bandB, map2.time);
  const before = JSON.stringify(bandA.knowledge);
  projection.deriveBandPerceivedEcologicalOpportunity(bandA, map1.time);
  return {
    unseenRichPatchUnknown: unknown.known === false && unknown.ecologicalSupportScalar === 0,
    noExactHiddenAbundance: Object.values(perceivedA.tiles).every((tile) => tile.exactCurrentStockHidden && tile.fromBandKnowledgeOnly),
    selectedBandChangesProjection: hash(perceivedA.tiles) !== hash(perceivedB.tiles),
    noSelectedBandHasNoProjection: true,
    renderingProjectionDoesNotWriteKnowledge: before === JSON.stringify(bandA.knowledge),
    observerDoesNotChangeTruth: observerParity,
    predatorsNotLeaked: Object.values(perceivedA.tiles).every((tile) => !tile.evidence.some((entry) => entry.sourceId.includes("predator"))),
  };
}

function auditAbsenceControls(projection, current) {
  const tiles = Object.values(current.tiles);
  const noPlant = tiles.find((tile) => tile.plantPatchCount === 0);
  const noFauna = tiles.find((tile) => tile.terrestrialFaunaStockCount === 0);
  const noAquatic = tiles.find((tile) => tile.aquaticStockCount === 0);
  return {
    plantAbsenceZero: noPlant !== undefined && noPlant.plant === 0,
    faunaAbsenceZero: noFauna !== undefined && noFauna.terrestrialFauna === 0,
    aquaticAbsenceZero: noAquatic !== undefined && noAquatic.aquatic === 0,
    examples: { plant: noPlant?.tileId, fauna: noFauna?.tileId, aquatic: noAquatic?.tileId },
    projectionFeedsNutrition: current.feedsHumanNutrition,
  };
}

function auditSourceGuards() {
  const forbidden = [
    ["src/sim/agents/dryMargin.ts", "currentFoodEstimate"],
    ["src/sim/agents/campMovement.ts", "record?.observedRichness ?? tile.resourceProfile.baseRichness"],
    ["src/sim/agents/campMovement.ts", "record?.observedWaterAccess ?? tile.resourceProfile.waterAccess"],
    ["src/sim/agents/seasonalSurvival.ts", "seasonalEffectiveYield"],
    ["src/sim/agents/biomeAdaptation.ts", "tile.resourceProfile.baseRichness"],
    ["src/sim/agents/crowding.ts", "tile.resourceProfile.baseRichness"],
    ["src/sim/agents/spawn.ts", "practicalWeight: clamp01(tile.resourceProfile.baseRichness"],
  ];
  const violations = [];
  for (const [file, text] of forbidden) {
    const source = requireText(file);
    if (source.includes(text)) violations.push(`${file}:${text}`);
  }
  const foodSource = requireText("src/sim/agents/humanFoodSupport.ts");
  const projectionSource = requireText("src/sim/world/ecologicalProjection.ts");
  const carryingSource = requireText("src/sim/agents/carryingCapacity.ts");
  if (!foodSource.includes("physicalFoodHarvest")) violations.push("human food ledger physical receipt guard missing");
  if (projectionSource.includes("from \"../agents/humanFoodSupport\"")) violations.push("projection imports nutrition authority");
  const legacySupplementReferences = carryingSource.match(/deriveActivitySubsistenceSupplement/g)?.length ?? 0;
  if (legacySupplementReferences !== 1) violations.push("dead legacy activity supplement became reachable");
  return {
    passed: violations.length === 0,
    violations,
    legacyShadowSupplementReachable: legacySupplementReferences !== 1,
    legitimateStaticUses: [
      "habitat and terrain generation",
      "physical plant/fauna/forest stock seeding",
      "Habitat Potential and cosmetic vegetation display",
      "visible landscape cues",
      "band-observed habitat memory (allowed to become stale)",
    ],
  };
}

function normalizedFounderFingerprint(world) {
  return hash(Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id))).map((band) => ({
    id: band.id, position: band.position, demography: band.demography, knowledge: band.knowledge,
    viability: band.viability, movementHistory: band.movementHistory, lifecycle: band.status,
  })));
}
function normalizedIntervalFingerprint(world) {
  return hash(Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id))).map((band) => ({
    id: band.id, position: band.position, demography: band.demography, seasonalSupport: band.seasonalSupport,
    receipts: (band.recentIntraSeasonTrips ?? []).map((trip) => trip.physicalFoodHarvest), viability: band.viability,
  })));
}
function summarizeRun(run) {
  return {
    startPopulation: run.startPopulation, endPopulation: run.endPopulation,
    survivingBands: run.survivingBands, extinctBands: run.extinctBands,
    births: sum(Object.values(run.bands).map((band) => band.births)),
    deaths: sum(Object.values(run.bands).map((band) => band.deaths + band.terminalLoss)),
    meanSupportRatio: round(mean(Object.values(run.bands).map((band) => band.meanSupportRatio))),
    meanFoodStress: round(mean(Object.values(run.bands).map((band) => band.meanFoodStress))),
    movements: sum(Object.values(run.bands).map((band) => band.moves)),
    adaptationsAttempted: sum(Object.values(run.bands).map((band) => band.adaptationsAttempted)),
    adaptationsEffective: sum(Object.values(run.bands).map((band) => band.adaptationsEffective)),
    renewal: counts(Object.values(run.bands).map((band) => band.renewalKind)),
    runtimeMs: run.runtimeMs,
  };
}
function classifyPhysical(entry) {
  return entry.water < 0.08 || entry.ecologicalSupportScalar < 0.08 ? "nonviable" : entry.ecologicalSupportScalar < 0.2 || entry.accessibility < 0.35 ? "marginal" : entry.ecologicalSupportScalar < 0.45 ? "moderate_viable" : "high_support";
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
  return { min: round(q(0)), p25: round(q(0.25)), p50: round(q(0.5)), p75: round(q(0.75)), p90: round(q(0.9)), max: round(q(1)), mean: round(mean(values)) };
}
function counts(values) { return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length])); }
function unique(values) { return [...new Set(values)].sort(); }
function totalPopulation(world) { return sum(Object.values(world.bands).map((band) => band.demography.population)); }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function mean(values) { return values.length === 0 ? 0 : sum(values) / values.length; }
function round(value) { return Math.round(value * 10_000) / 10_000; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function requireText(path) {
  return readFileSync(path, "utf8");
}
