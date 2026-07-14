import { createServer } from "vite";
import { readFileSync } from "node:fs";

const server = await createServer({
  root: `${process.cwd()}/src`,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const { initSimWorld } = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const { advanceWorldOneSeason } = await server.ssrLoadModule("/sim/tick/advance.ts");
  const { buildTickContextCache } = await server.ssrLoadModule("/sim/agents/contextCache.ts");
  const { deriveCarryingCapacity } = await server.ssrLoadModule("/sim/agents/carryingCapacity.ts");
  const { updateSeasonalSupportState } = await server.ssrLoadModule("/sim/agents/seasonalSurvival.ts");
  const plant = await server.ssrLoadModule("/sim/agents/plantStock.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const food = await server.ssrLoadModule("/sim/agents/humanFoodSupport.ts");

  const resultA = runAudit();
  const resultB = runAudit();
  const deterministic = JSON.stringify(resultA.fingerprint) === JSON.stringify(resultB.fingerprint);
  const checks = { ...resultA.checks, deterministic };
  const pass = Object.values(checks).every(Boolean);
  const output = {
    check: "LIVING-ECOLOGY-FOOD-PIPELINE-A",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    plant: resultA.plant,
    fauna: resultA.fauna,
    absence: resultA.absence,
    ledger: resultA.ledger,
    liveProduction: resultA.liveProduction,
    fingerprint: resultA.fingerprint,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!pass) process.exitCode = 1;

  function runAudit() {
    const world = initSimWorld({ kind: "map2" });
    const band = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    if (band === undefined) throw new Error("audit world has no band");

    const plantTile = Object.values(world.tiles)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .find((tile) => plant.resolvePlantFoodHarvest(world, tile, world.time, 0.2, false).sourceFound);
    const noPlantTile = Object.values(world.tiles)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .find((tile) => !plant.resolvePlantFoodHarvest(world, tile, world.time, 0.2, false).sourceFound);
    if (plantTile === undefined || noPlantTile === undefined) throw new Error("plant audit fixtures unavailable");

    const plantPreview = plant.resolvePlantFoodHarvest(world, plantTile, world.time, 0.2, false);
    const plantHarvest = plant.resolvePlantFoodHarvest(world, plantTile, world.time, 0.35, true);
    const plantAfter = plant.resolvePlantFoodHarvest(plantHarvest.world, plantTile, world.time, 0.35, false);
    const plantExhausted = plant.resolvePlantFoodHarvest(world, plantTile, world.time, 999, true);
    const plantExhaustedRetry = plant.resolvePlantFoodHarvest(plantExhausted.world, plantTile, world.time, 0.2, true);
    const plantAbsent = plant.resolvePlantFoodHarvest(world, noPlantTile, world.time, 0.2, true);

    const geo = fauna.deriveFaunaStockGeography(world);
    const terrestrial = geo.stocks.find((stock) => stock.faunaClass === "animal_food");
    if (terrestrial === undefined) throw new Error("fauna audit stock unavailable");
    const faunaTile = terrestrial.anchorTileId;
    const noFaunaTile = Object.keys(world.tiles)
      .sort()
      .find((tileId) => !(geo.byTile.get(tileId) ?? []).some((stock) => stock.faunaClass === "animal_food"));
    if (noFaunaTile === undefined) throw new Error("fauna absence tile unavailable");
    const faunaPreview = fauna.resolveFaunaFoodHarvest(world, geo, faunaTile, "animal_food", world.time.season, world.time.tick, 0.2, false);
    const faunaHarvest = fauna.resolveFaunaFoodHarvest(world, geo, faunaTile, "animal_food", world.time.season, world.time.tick, 0.35, true);
    const faunaAfter = fauna.resolveFaunaFoodHarvest(faunaHarvest.world, geo, faunaTile, "animal_food", world.time.season, world.time.tick, 0.2, false);
    const faunaExhausted = fauna.resolveFaunaFoodHarvest(world, geo, faunaTile, "animal_food", world.time.season, world.time.tick, 999, true);
    const faunaExhaustedRetry = fauna.resolveFaunaFoodHarvest(faunaExhausted.world, geo, faunaTile, "animal_food", world.time.season, world.time.tick, 999, true);
    const faunaAbsent = fauna.resolveFaunaFoodHarvest(world, geo, noFaunaTile, "animal_food", world.time.season, world.time.tick, 999, true);

    const plantReceipt = receipt("plant_patch", plantHarvest, 0.03, 0.04);
    const faunaReceipt = receipt("fauna_stock", faunaHarvest, 0.04, 0.06);
    const positiveBand = withReceipts(band, [plantReceipt, faunaReceipt]);
    const absentPlantBand = withReceipts(band, [zeroReceipt("plant_patch", "physical_source_absent")]);
    const absentFaunaBand = withReceipts(band, [zeroReceipt("fauna_stock", "physical_source_absent")]);
    const noFoodBand = withReceipts(band, [
      zeroReceipt("plant_patch", "physical_source_absent"),
      zeroReceipt("fauna_stock", "physical_source_absent"),
    ]);
    const demand = 20;
    const positiveLedger = food.deriveHumanFoodSupportLedger(positiveBand, demand);
    const plantAbsentLedger = food.deriveHumanFoodSupportLedger(absentPlantBand, demand);
    const faunaAbsentLedger = food.deriveHumanFoodSupportLedger(absentFaunaBand, demand);
    const noFoodLedger = food.deriveHumanFoodSupportLedger(noFoodBand, demand);

    const cache = buildTickContextCache(world);
    const carryingInput = {
      localUsePressure: 0,
      nearbyCrowding: 0,
      localPopulationEstimate: band.demography.population,
      riskPenalty: 0,
    };
    const noReceiptCarrying = deriveCarryingCapacity(world, { ...band, recentIntraSeasonTrips: [] }, cache, carryingInput);
    const positiveCarrying = deriveCarryingCapacity(world, positiveBand, cache, carryingInput);
    if (noReceiptCarrying === undefined || positiveCarrying === undefined) throw new Error("carrying fixture unavailable");
    const absenceSeasonal = updateSeasonalSupportState(undefined, noReceiptCarrying.state, noFoodBand, world.time);

    const advanced = advanceWorldOneSeason(world);
    const liveReceipts = Object.values(advanced.bands).flatMap((entry) =>
      (entry.recentIntraSeasonTrips ?? []).map((trip) => trip.physicalFoodHarvest).filter(Boolean),
    );
    const liveConsumed = liveReceipts.filter((entry) => entry.usableSupport > 0);
    const visibleNatureSource = readFileSync("src/sim/agents/visibleNature.ts", "utf8");
    const plantViewSource = sourceBetween(visibleNatureSource, "function plantPatchToCard(", "function deriveAnimalKnowledge(");
    const faunaViewSource = sourceBetween(visibleNatureSource, "function faunaCandidateToCard(", "function deriveVisibleAquaticCards(");

    const checks = {
      plantHarvestBounded: plantHarvest.harvestedAmount > 0 && plantHarvest.harvestedAmount <= plantHarvest.physicalAvailability,
      plantActuallyDepleted: plantAfter.physicalAvailability < plantPreview.physicalAvailability && plantHarvest.depletionApplied > 0,
      plantAbsentZero: plantAbsent.harvestedAmount === 0 && plantAbsent.failureReason === "physical_source_absent",
      plantExhaustedZero: plantExhaustedRetry.harvestedAmount === 0 && plantExhaustedRetry.failureReason === "physically_exhausted",
      faunaHarvestBounded: faunaHarvest.harvestedAmount > 0 && faunaHarvest.harvestedAmount <= faunaHarvest.physicalAvailability,
      faunaActuallyDepleted: faunaAfter.physicalAvailability < faunaPreview.physicalAvailability && faunaHarvest.depletionApplied > 0,
      faunaAbsentZeroEvenHugeRequest: faunaAbsent.harvestedAmount === 0 && faunaAbsent.failureReason === "physical_source_absent",
      faunaExhaustedZero: faunaExhaustedRetry.harvestedAmount === 0 && faunaExhaustedRetry.failureReason === "physically_exhausted",
      plantAbsenceLedgerZero: plantAbsentLedger.physicalPlantHarvest === 0 && plantAbsentLedger.totalUsableSupport === 0,
      faunaAbsenceLedgerZero: faunaAbsentLedger.physicalFaunaHarvest === 0 && faunaAbsentLedger.totalUsableSupport === 0,
      totalAbsenceVisibleDeficit: noFoodLedger.totalUsableSupport === 0 && noFoodLedger.rawSupportRatio === 0 && noFoodLedger.foodStress === 1,
      noGenericDoubleCount: noReceiptCarrying.state.perCapitaReturn.supportDebug.rawReachableSupport > 0 &&
        noReceiptCarrying.state.perCapitaReturn.supportDebug.adjustedReachableSupport === 0 &&
        noReceiptCarrying.state.perCapitaReturn.supportDebug.humanFoodLedger.genericCatchmentFoodConsumed === false,
      receiptCountedOnce: positiveCarrying.state.perCapitaReturn.supportDebug.adjustedReachableSupport === positiveLedger.totalUsableSupport,
      downstreamStressRaised: absenceSeasonal?.currentSeasonSupport.foodStress === 1 && absenceSeasonal.currentSeasonSupport.deficitRatio === 1,
      residualAndStorageExplicitZero: noFoodLedger.transitionalResidual === 0 && noFoodLedger.storageContribution === 0,
      liveProductionReceiptsExist: liveReceipts.length > 0,
      liveProductionConsumesPhysicalFood: liveConsumed.length > 0,
      normalPlantViewDoesNotReadHiddenDepletion: !plantViewSource.includes("world.plantPatchState"),
      normalFaunaViewDoesNotReadCurrentHiddenStock: !faunaViewSource.includes("world.faunaStocks") && !faunaViewSource.includes("getFaunaStockDynamic"),
    };

    const plantSummary = summarizeResolution(plantHarvest, plantAfter, plantAbsent, plantExhaustedRetry);
    const faunaSummary = summarizeResolution(faunaHarvest, faunaAfter, faunaAbsent, faunaExhaustedRetry);
    const ledgerSummary = {
      positive: summarizeLedger(positiveLedger),
      none: summarizeLedger(noFoodLedger),
      carryingWithNoReceipts: {
        projectedGeneric: noReceiptCarrying.state.perCapitaReturn.supportDebug.rawReachableSupport,
        canonicalUsable: noReceiptCarrying.state.perCapitaReturn.supportDebug.adjustedReachableSupport,
      },
      carryingWithReceipts: positiveCarrying.state.perCapitaReturn.supportDebug.adjustedReachableSupport,
    };
    const liveFingerprint = liveReceipts.map(compactReceipt).sort(sortJson);
    const fingerprint = {
      plant: plantSummary,
      fauna: faunaSummary,
      ledger: ledgerSummary,
      live: {
        count: liveFingerprint.length,
        consumed: liveFingerprint.filter((entry) => entry.usable > 0).length,
        sample: liveFingerprint.slice(0, 12),
      },
    };
    return {
      checks,
      plant: plantSummary,
      fauna: faunaSummary,
      absence: {
        plant: summarizeLedger(plantAbsentLedger),
        fauna: summarizeLedger(faunaAbsentLedger),
        total: summarizeLedger(noFoodLedger),
        seasonalFoodStress: absenceSeasonal?.currentSeasonSupport.foodStress,
      },
      ledger: ledgerSummary,
      liveProduction: { receiptCount: liveReceipts.length, consumedCount: liveConsumed.length, examples: liveReceipts.slice(0, 6).map(compactReceipt) },
      fingerprint,
    };
  }
} finally {
  await server.close();
}

function receipt(sourceKind, resolution, transportLoss, processingLoss) {
  const usableSupport = round4(Math.max(0, resolution.harvestedAmount - transportLoss - processingLoss));
  return {
    sourceKind,
    sourceId: resolution.sourceId,
    sourceClass: resolution.sourceClass ?? "controlled",
    knownness: "known_target",
    attempted: true,
    physicalSourceFound: resolution.sourceFound,
    physicalAvailability: resolution.physicalAvailability,
    harvestedAmount: resolution.harvestedAmount,
    depletionApplied: resolution.depletionApplied,
    transportLoss,
    processingLoss,
    usableSupport,
    worldTruthDebugOnly: true,
    reasonIds: [],
  };
}

function zeroReceipt(sourceKind, failureReason) {
  return {
    sourceKind,
    sourceClass: "absent_control",
    knownness: "stale_or_inferred_target",
    attempted: true,
    physicalSourceFound: false,
    physicalAvailability: 0,
    harvestedAmount: 0,
    depletionApplied: 0,
    transportLoss: 0,
    processingLoss: 0,
    usableSupport: 0,
    failureReason,
    worldTruthDebugOnly: true,
    reasonIds: [],
  };
}

function withReceipts(band, receipts) {
  return {
    ...band,
    recentIntraSeasonTrips: receipts.map((physicalFoodHarvest, index) => {
      const positive = physicalFoodHarvest.usableSupport > 0;
      const returnedResourceKind = !positive ? "none" :
        physicalFoodHarvest.sourceKind === "plant_patch" ? "gathered_plant_food" :
        physicalFoodHarvest.sourceKind === "fauna_stock" ? "hunted_fauna_food" :
        "harvested_aquatic_food";
      return {
        tick: 777,
        day: index + 1,
        physicalFoodHarvest,
        resourceReturn: { returnedResourceKind, consumedByEconomy: positive },
      };
    }),
  };
}

function summarizeResolution(harvest, after, absent, exhausted) {
  return {
    sourceId: harvest.sourceId,
    sourceClass: harvest.sourceClass,
    availableBefore: harvest.physicalAvailability,
    harvested: harvest.harvestedAmount,
    depletion: harvest.depletionApplied,
    availableAfter: after.physicalAvailability,
    absentHarvest: absent.harvestedAmount,
    absentReason: absent.failureReason,
    exhaustedHarvest: exhausted.harvestedAmount,
    exhaustedReason: exhausted.failureReason,
  };
}

function summarizeLedger(ledger) {
  return {
    plant: ledger.physicalPlantHarvest,
    fauna: ledger.physicalFaunaHarvest,
    aquatic: ledger.aquaticHarvest,
    residual: ledger.transitionalResidual,
    usable: ledger.totalUsableSupport,
    demand: ledger.populationDemand,
    ratio: ledger.rawSupportRatio,
    foodStress: ledger.foodStress,
    genericConsumed: ledger.genericCatchmentFoodConsumed,
  };
}

function compactReceipt(receipt) {
  return {
    kind: receipt.sourceKind,
    id: receipt.sourceId ?? "absent",
    found: receipt.physicalSourceFound,
    available: receipt.physicalAvailability,
    harvested: receipt.harvestedAmount,
    usable: receipt.usableSupport,
    failure: receipt.failureReason ?? "none",
  };
}

function sortJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source guard markers missing: ${start} -> ${end}`);
  return source.slice(from, to);
}
