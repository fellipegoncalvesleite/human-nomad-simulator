import { createServer } from "vite";

const kind = process.argv.includes("--map1") ? "map1" : "map2";
const yearsArg = process.argv.indexOf("--years");
const years = yearsArg >= 0 ? Number(process.argv[yearsArg + 1]) : 100;
const observe = !process.argv.includes("--no-observer");
const noHuman = process.argv.includes("--no-human");
const server = await createServer({ root: `${process.cwd()}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error" });

try {
  const { initSimWorld } = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const { advanceWorldByDays } = await server.ssrLoadModule("/sim/tick/advance.ts");
  const { summarizeFaunaStocks } = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const { summarizePlantPatchState } = await server.ssrLoadModule("/sim/agents/plantStock.ts");
  let world = initSimWorld({ kind });
  if (noHuman) world = { ...world, bands: {} };
  const startPopulation = totalPopulation(world);
  const byBand = Object.fromEntries(Object.values(world.bands).map((band) => [String(band.id), accumulator(band)]));

  for (let season = 0; season < years * 4; season += 1) {
    const observer = ({ band, decision }) => {
      const acc = byBand[String(band.id)] ??= accumulator(band);
      const ledger = band.carryingCapacity?.perCapitaReturn?.supportDebug?.humanFoodLedger;
      acc.decisions += 1;
      if (decision.action.type === "stay") acc.stays += 1;
      else if (decision.action.type === "move_to_tile" || decision.action.type === "explore_unknown_neighbor") acc.moves += 1;
      else acc.probes += 1;
      acc.reasons[decision.primaryReason.type] = (acc.reasons[decision.primaryReason.type] ?? 0) + 1;
      acc.supportSum += ledger?.rawSupportRatio ?? 0;
      acc.foodStressSum += ledger?.foodStress ?? 1;
      acc.foodPressureSum += band.pressureState?.foodMovementPressure ?? 0;
      acc.waterPressureSum += band.pressureState?.waterStress ?? 0;
      acc.riskPressureSum += band.pressureState?.riskPressure ?? 0;
      acc.fatiguePressureSum += band.pressureState?.fatiguePressure ?? 0;
      acc.netMovePressureSum += band.pressureState?.netMovePressure ?? 0;
      acc.foodMortalitySum += band.demography.foodMortalityContribution ?? 0;
      acc.mortalitySum += band.demography.mortalityPressure ?? 0;
      const receipts = band.recentIntraSeasonTrips?.map((trip) => trip.physicalFoodHarvest).filter(Boolean) ?? [];
      acc.receipts += receipts.length;
      acc.usableReceipts += receipts.filter((receipt) => receipt.usableSupport > 0).length;
      for (const receipt of receipts) {
        const key = receipt.usableSupport > 0 ? receipt.sourceKind : receipt.failureReason ?? "zero";
        acc.receiptOutcomes[key] = (acc.receiptOutcomes[key] ?? 0) + 1;
      }
    };
    world = advanceWorldByDays(world, 90, observe ? observer : undefined);
    for (const band of Object.values(world.bands)) {
      const acc = byBand[String(band.id)] ??= accumulator(band);
      acc.finalPopulation = band.demography.population;
      acc.status = band.viability?.status ?? band.status;
      if (world.time.season === "spring") {
        acc.starvationDeaths += band.demography.lastStarvationDeaths ?? 0;
        acc.waterDeaths += band.demography.lastWaterStressDeaths ?? 0;
        acc.crisisDeaths += band.demography.lastCrisisDeaths ?? 0;
        acc.otherDeaths += Math.max(0, (band.demography.lastDeaths ?? 0) - (band.demography.lastStarvationDeaths ?? 0) - (band.demography.lastWaterStressDeaths ?? 0) - (band.demography.lastCrisisDeaths ?? 0));
      }
      if (band.viability?.status === "extinct" && acc.extinctYear === undefined) acc.extinctYear = world.time.year;
    }
  }

  const bands = Object.fromEntries(Object.entries(byBand).map(([id, acc]) => [id, finalize(acc)]));
  console.log(JSON.stringify({
    check: "LIVING-ECOLOGY-WORLD-CAUSAL-DIAGNOSTIC", kind, years, noHuman,
    population: { start: startPopulation, end: totalPopulation(world), active: Object.values(world.bands).filter((band) => band.viability?.status !== "extinct").length },
    decisions: Object.values(bands).reduce((out, band) => ({ moves: out.moves + band.moves, stays: out.stays + band.stays, probes: out.probes + band.probes }), { moves: 0, stays: 0, probes: 0 }),
    fauna: summarizeFaunaStocks(world), plant: summarizePlantPatchState(world), bands,
  }, null, 2));
} finally { await server.close(); }

function accumulator(band) {
  return { startPopulation: band.demography.population, finalPopulation: band.demography.population, status: band.status, decisions: 0, moves: 0, stays: 0, probes: 0, reasons: {}, supportSum: 0, foodStressSum: 0, foodPressureSum: 0, waterPressureSum: 0, riskPressureSum: 0, fatiguePressureSum: 0, netMovePressureSum: 0, foodMortalitySum: 0, mortalitySum: 0, receipts: 0, usableReceipts: 0, receiptOutcomes: {}, starvationDeaths: 0, waterDeaths: 0, crisisDeaths: 0, otherDeaths: 0 };
}
function finalize(acc) {
  const count = Math.max(1, acc.decisions);
  return { ...acc, meanSupportRatio: round(acc.supportSum / count), meanFoodStress: round(acc.foodStressSum / count), meanFoodMovementPressure: round(acc.foodPressureSum / count), meanWaterPressure: round(acc.waterPressureSum / count), meanRiskPressure: round(acc.riskPressureSum / count), meanFatiguePressure: round(acc.fatiguePressureSum / count), meanNetMovePressure: round(acc.netMovePressureSum / count), meanFoodMortality: round(acc.foodMortalitySum / count), meanMortality: round(acc.mortalitySum / count), receiptSuccessRate: round(acc.usableReceipts / Math.max(1, acc.receipts)) };
}
function totalPopulation(world) { return Object.values(world.bands).reduce((sum, band) => sum + band.demography.population, 0); }
function round(value) { return Math.round(value * 10000) / 10000; }
