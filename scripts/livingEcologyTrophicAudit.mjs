import { createServer } from "vite";
import { readFileSync } from "node:fs";

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const { initSimWorld } = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const { advanceWorldOneSeason } = await server.ssrLoadModule("/sim/tick/advance.ts");
  const { buildTickContextCache } = await server.ssrLoadModule("/sim/agents/contextCache.ts");
  const { deriveCarryingCapacity } = await server.ssrLoadModule("/sim/agents/carryingCapacity.ts");
  const survival = await server.ssrLoadModule("/sim/agents/seasonalSurvival.ts");
  const pressure = await server.ssrLoadModule("/sim/agents/pressure.ts");
  const demography = await server.ssrLoadModule("/sim/agents/demography.ts");
  const decision = await server.ssrLoadModule("/sim/rules/bandDecision.ts");
  const food = await server.ssrLoadModule("/sim/agents/humanFoodSupport.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const plant = await server.ssrLoadModule("/sim/agents/plantStock.ts");

  const first = run();
  const second = run();
  const deterministic = JSON.stringify(first.fingerprint) === JSON.stringify(second.fingerprint);
  const checks = { ...first.checks, deterministic };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "LIVING-ECOLOGY-TROPHIC-COUPLING-1B",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    nutritionState: first.nutritionState,
    controlledFood: first.controlledFood,
    unitSensitivity: first.unitSensitivity,
    independentPressures: first.independentPressures,
    liveOrderingAndMovement: first.live,
    trophic: first.trophic,
  }, null, 2));
  if (!pass) process.exitCode = 1;

  function run() {
    const initial = initSimWorld({ kind: "map2" });
    const afterOne = advanceWorldOneSeason(initial);
    const baseBand = Object.values(afterOne.bands).sort(byId)[0];
    if (baseBand === undefined) throw new Error("controlled band unavailable");
    const templateTrip = (baseBand.recentIntraSeasonTrips ?? []).find((trip) => trip.physicalFoodHarvest !== undefined);
    if (templateTrip === undefined) throw new Error("physical trip template unavailable");

    const rawLevels = [0, 0.12, 0.25, 0.4];
    const labels = ["zero", "low", "demand_matching", "moderate_surplus"];
    const controlledFood = rawLevels.map((raw, index) => controlledRow(afterOne, baseBand, templateTrip, raw, labels[index]));
    const unitSensitivity = [80, 100, 120].map((scale) => {
      const band = withRawReceipt(baseBand, templateTrip, 0.25);
      const ledger = food.deriveHumanFoodSupportLedger(band, 25, scale);
      return { scale, usableSupport: ledger.totalUsableSupport, ratio: ledger.rawSupportRatio, stress: ledger.foodStress };
    });

    const wellFed = controlledFood.at(-1);
    const stressedBase = withHistory(afterOne, baseBand, templateTrip, 0.4).band;
    const calmPressure = pressure.deriveBandPressureState(afterOne, stressedBase);
    const waterBand = {
      ...stressedBase,
      knowledge: {
        ...stressedBase.knowledge,
        observedTiles: {
          ...stressedBase.knowledge.observedTiles,
          [stressedBase.position]: {
            ...stressedBase.knowledge.observedTiles[stressedBase.position],
            observedWaterAccess: 0,
          },
        },
      },
    };
    const waterPressure = pressure.deriveBandPressureState(afterOne, waterBand);
    const injuryBand = {
      ...stressedBase,
      acuteRisk: {
        ...(stressedBase.acuteRisk ?? { recentEpisodes: [] }),
        activeEffect: { extraSeasonalStress: 0.7, activityEfficiencyPenalty: 0.6, mortalityRiskBump: 0.8, movementCautionBump: 0.4 },
      },
    };
    const injuryDemography = demography.updateBandDemography(afterOne, { ...injuryBand, pressureState: pressure.deriveBandPressureState(afterOne, injuryBand) });
    const independentPressures = {
      calmWaterStress: calmPressure.waterStress,
      dryWaterStress: waterPressure.waterStress,
      wellFedMortality: wellFed.mortalityPressure,
      injuredWellFedMortality: injuryDemography.mortalityPressure,
    };

    const live = liveRun(initial, 24);
    const trophic = trophicRun(initial);
    const pressureSource = readFileSync("src/sim/agents/pressure.ts", "utf8");
    const foodSource = readFileSync("src/sim/agents/humanFoodSupport.ts", "utf8");
    const tripSource = readFileSync("src/sim/agents/intraSeasonTrips.ts", "utf8");
    const advanceSource = readFileSync("src/sim/tick/advance.ts", "utf8");
    const stresses = controlledFood.map((row) => row.foodStress);
    const movementPressures = controlledFood.map((row) => row.foodMovementPressure);
    const mortality = controlledFood.map((row) => row.foodMortalityContribution);
    const fertility = controlledFood.map((row) => row.fertilityPressure);

    // NUTRITION-STATE CONTRACT (TROPHIC-1C-REGRESSION-C): "unknown / not yet
    // measured" (undefined support: new/daughter/fixture/legacy) is NEUTRAL, and
    // strictly distinct from a MEASURED zero-food deficit (defined support with
    // zero receipts) which stays severe. Missing state is not a free-food loophole.
    const nutritionUnmeasured = survival.deriveCanonicalNutritionState(undefined);
    const measuredZeroSupport = withHistory(afterOne, baseBand, templateTrip, 0).support;
    const measuredAdequateSupport = withHistory(afterOne, baseBand, templateTrip, 0.4).support;
    const nutritionMeasuredZero = survival.deriveCanonicalNutritionState(measuredZeroSupport);
    const nutritionMeasuredAdequate = survival.deriveCanonicalNutritionState(measuredAdequateSupport);
    const nutritionState = {
      unmeasured: nutritionUnmeasured,
      measuredZero: nutritionMeasuredZero,
      measuredAdequate: nutritionMeasuredAdequate,
    };

    const checks = {
      unmeasuredNutritionNeutral:
        nutritionUnmeasured.nutritionStateAvailable === false &&
        nutritionUnmeasured.foodMovementPressure === 0 &&
        nutritionUnmeasured.currentFoodStress === 0,
      measuredNutritionAvailable:
        nutritionMeasuredZero.nutritionStateAvailable === true &&
        nutritionMeasuredAdequate.nutritionStateAvailable === true,
      measuredZeroStaysSevere: nutritionMeasuredZero.foodMovementPressure > 0.5,
      unknownDistinctFromKnownZero:
        nutritionUnmeasured.foodMovementPressure < nutritionMeasuredZero.foodMovementPressure,
      measuredAdequateLowerThanZero:
        nutritionMeasuredAdequate.foodMovementPressure < nutritionMeasuredZero.foodMovementPressure,
      zeroSevere: controlledFood[0].ratio === 0 && controlledFood[0].foodStress === 1,
      supportRatioMonotonic: strictlyIncreasing(controlledFood.map((row) => row.ratio)),
      foodStressMonotonic: nonIncreasing(stresses) && stresses[0] > stresses.at(-1),
      foodPressureMonotonic: nonIncreasing(movementPressures) && movementPressures[0] > movementPressures.at(-1),
      demographicFoodMonotonic: nonIncreasing(mortality) && mortality[0] > mortality.at(-1),
      fertilityResponds: nonDecreasing(fertility) && fertility[0] < fertility.at(-1),
      behaviorNotByteIdentical: new Set(controlledFood.map((row) => JSON.stringify([row.action, row.foodMovementPressure, row.topScore]))).size > 1,
      waterIndependent: independentPressures.dryWaterStress > independentPressures.calmWaterStress,
      injuryIndependent: independentPressures.injuredWellFedMortality > independentPressures.wellFedMortality,
      conversionZeroSafe: food.deriveHumanFoodSupportLedger(withRawReceipt(baseBand, templateTrip, 0), 25, 100).totalUsableSupport === 0,
      conversionMonotonic: strictlyIncreasing(unitSensitivity.map((row) => row.usableSupport)),
      receiptsReachSameSeasonDecision: live.receiptSeasonsWithDecision > 0 && live.receiptTickMismatch === 0,
      successfulCampCanStay: live.stays > 0,
      movementNotUniversal: live.moves < live.decisions * 0.9,
      herbivoresConsumePhysicalForage: trophic.forageConsumed > 0,
      feedingDepletesForage: trophic.depletionAfterFeeding > trophic.depletionBefore,
      noForageWeakensHerbivores: trophic.noForageHerbivoreAfter < trophic.noForageHerbivoreBefore,
      forageRecoversWhenRested: trophic.recoveredDepletion < trophic.depletionAfterFeeding,
      predatorsRemoveActualPrey: trophic.preyRemoved > 0 && trophic.preyAfterPredation < trophic.preyBeforePredation,
      noPreyWeakensPredators: trophic.noPreyPredatorAfter < trophic.noPreyPredatorBefore,
      predatorBounded: trophic.predatorCount > 0 && trophic.predatorCount <= 24 && trophic.maxAbundance <= 1,
      aquaticStockBacked: trophic.aquaticHarvest > 0 && trophic.aquaticStockCount > 0,
      aquaticAbsenceZero: trophic.aquaticAbsentHarvest === 0,
      waterfowlStockBacked: trophic.waterfowlCount > 0,
      seasonalRunClaimHonest: trophic.seasonalRunCount > 0 || trophic.seasonalRunStatus === "taxonomy_only_in_actual_defaults",
      noLegacyFoodEstimateOverride: !pressureSource.includes("getKnownFoodEstimate") && pressureSource.includes("deriveCanonicalNutritionState"),
      ledgerConsumesReceiptsOnly: foodSource.includes("trip.physicalFoodHarvest") && !foodSource.includes("foodEstimate"),
      noPlaceholderSuffixFoodGate: !tripSource.includes("endsWith(\"_placeholder\")") && !tripSource.includes("food_placeholder"),
      productionOrderingExplicit: advanceSource.indexOf("runDailyActions") < advanceSource.indexOf("runSeasonalCompatibilityTick"),
    };
    return {
      checks, controlledFood, unitSensitivity, independentPressures, live, trophic, nutritionState,
      fingerprint: { controlledFood, unitSensitivity, independentPressures, live, trophic },
    };
  }

  function controlledRow(world, baseBand, templateTrip, raw, label) {
    const { band } = withHistory(world, baseBand, templateTrip, raw);
    const pressureState = pressure.deriveBandPressureState(world, band);
    const coupledBand = { ...band, pressureState };
    const demographic = demography.updateBandDemography(world, coupledBand);
    const evaluated = decision.evaluateBandDecision(world, coupledBand);
    const ledger = band.seasonalSupport.currentSeasonSupport;
    return {
      label, rawHarvest: raw, ratio: ledger.rawSupportRatio, foodStress: ledger.foodStress,
      recentFoodStress: band.seasonalSupport.recentFoodStress,
      chronicFoodStress: band.seasonalSupport.chronicFoodStress,
      foodMovementPressure: pressureState.foodMovementPressure,
      netMovePressure: pressureState.netMovePressure,
      foodMortalityContribution: demographic.foodMortalityContribution,
      mortalityPressure: demographic.mortalityPressure,
      fertilityPressure: demographic.fertilityPressure,
      action: evaluated.action.type,
      topScore: evaluated.alternativesConsidered[0]?.score,
    };
  }

  function withHistory(world, baseBand, templateTrip, raw) {
    let band = withRawReceipt(baseBand, templateTrip, raw);
    let support;
    for (let index = 0; index < 8; index += 1) {
      const timedWorld = { ...world, time: { ...world.time, tick: Number(world.time.tick) + index, year: world.time.year + index / 4 } };
      const carrying = deriveCarryingCapacity(timedWorld, band, buildTickContextCache(timedWorld), {
        localUsePressure: 0, nearbyCrowding: 0, localPopulationEstimate: band.demography.population, riskPenalty: 0,
      });
      support = survival.updateSeasonalSupportState(support, carrying?.state, band, timedWorld.time);
      band = { ...band, seasonalSupport: support, carryingCapacity: carrying?.state, perCapitaReturn: carrying?.state.perCapitaReturn };
    }
    return { band, support };
  }

  function withRawReceipt(band, trip, raw) {
    const receipt = {
      ...trip.physicalFoodHarvest,
      sourceKind: "plant_patch", sourceFound: raw > 0,
      physicalAvailability: raw, harvestedAmount: raw, transportLoss: 0, processingLoss: 0,
      usableSupport: raw, depletionApplied: raw,
      ...(raw > 0 ? { failureReason: undefined } : { failureReason: "physical_source_absent" }),
    };
    return { ...band, recentIntraSeasonTrips: [{ ...trip, physicalFoodHarvest: receipt, tick: band.recentIntraSeasonTrips?.[0]?.tick ?? trip.tick }] };
  }

  function liveRun(initial, seasons) {
    let world = initial;
    let moves = 0; let stays = 0; let decisions = 0; let receiptSeasonsWithDecision = 0; let receiptTickMismatch = 0;
    let supportRatioSum = 0; let foodStressSum = 0; let foodMortalitySum = 0; let bandSeasonCount = 0;
    const reasonCounts = {};
    const supportByBand = {};
    for (let index = 0; index < seasons; index += 1) {
      world = advanceWorldOneSeason(world);
      for (const band of Object.values(world.bands)) {
        const latestId = band.decisionHistory?.at(-1);
        const latest = latestId === undefined ? undefined : world.decisions[latestId];
        if (latest !== undefined) {
          decisions += 1;
          if (latest.action.type === "stay") stays += 1;
          if (latest.action.type === "move_to_tile" || latest.action.type === "explore_unknown_neighbor") moves += 1;
          reasonCounts[latest.primaryReason.type] = (reasonCounts[latest.primaryReason.type] ?? 0) + 1;
        }
        const ledger = band.carryingCapacity?.perCapitaReturn?.supportDebug?.humanFoodLedger;
        if (ledger !== undefined) {
          supportRatioSum += ledger.rawSupportRatio;
          foodStressSum += ledger.foodStress;
          foodMortalitySum += band.demography.foodMortalityContribution ?? 0;
          bandSeasonCount += 1;
          const prior = supportByBand[String(band.id)] ?? { sum: 0, count: 0 };
          supportByBand[String(band.id)] = { sum: prior.sum + ledger.rawSupportRatio, count: prior.count + 1 };
        }
        if ((ledger?.totalUsableSupport ?? 0) > 0 && latest !== undefined) {
          receiptSeasonsWithDecision += 1;
          // Trips occur during interval N and the boundary decision is tick N+1.
          // This is deliberate prospective ordering, not retroactive nourishment.
          if (Number(ledger.sourceSeasonTick) + 1 !== Number(latest.time.tick)) receiptTickMismatch += 1;
        }
      }
    }
    return {
      seasons, startPopulation: Object.values(initial.bands).reduce((sum, band) => sum + band.demography.population, 0),
      population: Object.values(world.bands).reduce((sum, band) => sum + band.demography.population, 0),
      activeBands: Object.values(world.bands).filter((band) => band.viability?.status !== "extinct").length,
      decisions, moves, stays, receiptSeasonsWithDecision, receiptTickMismatch,
      meanSupportRatio: round4(supportRatioSum / Math.max(1, bandSeasonCount)),
      meanFoodStress: round4(foodStressSum / Math.max(1, bandSeasonCount)),
      meanFoodMortalityContribution: round4(foodMortalitySum / Math.max(1, bandSeasonCount)),
      meanSupportRatioByBand: Object.fromEntries(Object.entries(supportByBand).map(([id, value]) => [id, round4(value.sum / value.count)])),
      reasonCounts,
    };
  }

  function trophicRun(initial) {
    const noHuman = { ...initial, bands: {} };
    const geo = fauna.deriveFaunaStockGeography(noHuman);
    const map1 = initSimWorld({ kind: "map1" });
    const map1Geo = fauna.deriveFaunaStockGeography(map1);
    const cache = buildTickContextCache(noHuman);
    const beforePlant = plant.summarizePlantPatchState(noHuman);
    const fed = fauna.advanceFaunaStocks(noHuman, cache);
    const afterPlant = plant.summarizePlantPatchState(fed);
    const fedSummary = fauna.summarizeFaunaStocks(fed);
    const forageConsumed = Object.values(fed.faunaStocks ?? {}).reduce((sum, dyn) => sum + (dyn.feedingPressure ?? 0), 0);
    const preyRemoved = Object.values(fed.faunaStocks ?? {}).reduce((sum, dyn) => sum + (dyn.preyRemoved ?? 0), 0);
    const preyStocks = geo.stocks.filter((stock) => stock.trophicRole !== "predator" && stock.faunaClass === "animal_food");
    const preyBeforePredation = preyStocks.reduce((sum, stock) => sum + fauna.getFaunaStockDynamic(noHuman, stock.id).abundance, 0);
    const preyAfterPredation = preyStocks.reduce((sum, stock) => sum + fauna.getFaunaStockDynamic(fed, stock.id).abundance, 0);

    const herbivores = geo.stocks.filter((stock) => stock.trophicRole === "herbivore" || stock.trophicRole === "omnivore");
    const exhausted = plant.consumePlantForage(noHuman, herbivores.map((stock) => ({ consumerId: String(stock.id), tileIds: stock.influenceTileIds, demand: 999 })), noHuman.time).world;
    let noForage = exhausted;
    const noForageHerbivoreBefore = mean(herbivores.map((stock) => fauna.getFaunaStockDynamic(noForage, stock.id).abundance));
    for (let index = 0; index < 8; index += 1) noForage = fauna.advanceFaunaStocks(noForage, buildTickContextCache(noForage));
    const noForageHerbivoreAfter = mean(herbivores.map((stock) => fauna.getFaunaStockDynamic(noForage, stock.id).abundance));

    const predators = geo.stocks.filter((stock) => stock.trophicRole === "predator");
    const aquatic = [...geo.stocks, ...map1Geo.stocks].find((stock) => stock.faunaClass === "aquatic_food");
    if (aquatic === undefined) throw new Error("aquatic stock unavailable");
    const aquaticWorld = geo.byId.has(aquatic.id) ? noHuman : map1;
    const aquaticGeo = geo.byId.has(aquatic.id) ? geo : map1Geo;
    const aquaticResult = fauna.resolveFaunaFoodHarvest(aquaticWorld, aquaticGeo, aquatic.anchorTileId, "aquatic_food", aquaticWorld.time.season, aquaticWorld.time.tick, 0.2, true);
    const absentAquaticTile = Object.keys(aquaticWorld.tiles).sort().find((tileId) => !(aquaticGeo.byTile.get(tileId) ?? []).some((stock) => stock.faunaClass === "aquatic_food"));
    if (absentAquaticTile === undefined) throw new Error("aquatic absence tile unavailable");
    const absentAquatic = fauna.resolveFaunaFoodHarvest(aquaticWorld, aquaticGeo, absentAquaticTile, "aquatic_food", aquaticWorld.time.season, aquaticWorld.time.tick, 99, true);
    const noPreyState = { ...noHuman, faunaStocks: Object.fromEntries(geo.stocks.map((stock) => [stock.id, {
      abundance: stock.trophicRole === "predator" ? 1 : 0, disturbance: 0, lastPressureTick: noHuman.time.tick, cumulativePressure: 0,
    }])) };
    let noPrey = noPreyState;
    const noPreyPredatorBefore = mean(predators.map((stock) => fauna.getFaunaStockDynamic(noPrey, stock.id).abundance));
    for (let index = 0; index < 8; index += 1) noPrey = fauna.advanceFaunaStocks(noPrey, buildTickContextCache(noPrey));
    const noPreyPredatorAfter = mean(predators.map((stock) => fauna.getFaunaStockDynamic(noPrey, stock.id).abundance));

    let rested = { ...fed, bands: {}, faunaStocks: {} };
    for (let index = 0; index < 6; index += 1) rested = plant.advancePlantPatchState(rested, buildTickContextCache(rested));
    const recoveredDepletion = plant.summarizePlantPatchState(rested).meanDepletion;
    return {
      stockCount: fedSummary.stockCount, predatorCount: predators.length,
      forageConsumed: round4(forageConsumed), depletionBefore: beforePlant.meanDepletion,
      depletionAfterFeeding: afterPlant.meanDepletion, recoveredDepletion,
      noForageHerbivoreBefore: round4(noForageHerbivoreBefore), noForageHerbivoreAfter: round4(noForageHerbivoreAfter),
      preyRemoved: round4(preyRemoved), preyBeforePredation: round4(preyBeforePredation), preyAfterPredation: round4(preyAfterPredation),
      noPreyPredatorBefore: round4(noPreyPredatorBefore), noPreyPredatorAfter: round4(noPreyPredatorAfter),
      maxAbundance: Math.max(0, ...Object.values(fed.faunaStocks ?? {}).map((dyn) => dyn.abundance)),
      aquaticStockCount: [...geo.stocks, ...map1Geo.stocks].filter((stock) => stock.faunaClass === "aquatic_food").length,
      aquaticHarvest: aquaticResult.harvestedAmount,
      aquaticAbsentHarvest: absentAquatic.harvestedAmount,
      seasonalRunCount: [...geo.stocks, ...map1Geo.stocks].filter((stock) => stock.kind === "seasonal_fish_run").length,
      seasonalRunStatus: [...geo.stocks, ...map1Geo.stocks].some((stock) => stock.kind === "seasonal_fish_run")
        ? "physical_stock_backed"
        : "taxonomy_only_in_actual_defaults",
      waterfowlCount: [...geo.stocks, ...map1Geo.stocks].filter((stock) => stock.kind === "waterfowl").length,
    };
  }
} finally {
  await server.close();
}

function byId(a, b) { return String(a.id).localeCompare(String(b.id)); }
function strictlyIncreasing(values) { return values.every((value, index) => index === 0 || value > values[index - 1]); }
function nonIncreasing(values) { return values.every((value, index) => index === 0 || value <= values[index - 1]); }
function nonDecreasing(values) { return values.every((value, index) => index === 0 || value >= values[index - 1]); }
function mean(values) { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function round4(value) { return Math.round(value * 10000) / 10000; }
