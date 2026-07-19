// Temporary diagnostic probe (ECOLOGY-VIABILITY-CORRECTION-1, Phase 1 evidence).
// Measures the PHYSICAL world before any human behavior: map size, fauna stock
// density, plant patch density, aquatic opportunity, water reliability.
// Scenario construction / measurement only — never band knowledge.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");
  const faunaStock = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const plantStock = await server.ssrLoadModule("/sim/agents/plantStock.ts");

  for (const kind of ["map1", "map2"]) {
    const world = runner.initSimWorld({ kind }, `probe-${kind}`);
    const tiles = Object.values(world.tiles);
    const land = tiles.filter((t) => t.isAquatic !== true);
    const aquatic = tiles.filter((t) => t.isAquatic === true);

    // fauna
    const geo = faunaStock.deriveFaunaStockGeography(world);
    const stocks = geo.stocks ?? [];
    const byRole = {};
    let totalCarrying = 0;
    for (const s of stocks) {
      byRole[s.trophicRole] = (byRole[s.trophicRole] ?? 0) + 1;
      totalCarrying += s.carryingCapacity ?? 0;
    }
    const dyn = world.faunaStocks ?? {};
    let totalStockNow = 0;
    let zeroStocks = 0;
    for (const d of Object.values(dyn)) {
      totalStockNow += d.stock ?? 0;
      if ((d.stock ?? 0) <= 0.0001) zeroStocks += 1;
    }

    // plants: sample land tiles for patch presence + live stock
    let patchCount = 0;
    let liveStock = 0;
    let tilesWithPatches = 0;
    for (const t of land) {
      const patches = plantPatches.derivePlantPatchesForTile(t, world.time);
      if (patches.length > 0) tilesWithPatches += 1;
      patchCount += patches.length;
      for (const p of patches) liveStock += p.baseAbundance * p.currentAbundance;
    }

    // water reliability + aquatic opportunity per land tile
    let reliableWaterTiles = 0;
    let aquaticOpportunityTiles = 0;
    let meanRichness = 0;
    for (const t of land) {
      if (t.resourceProfile.waterAccess > 0.55) reliableWaterTiles += 1;
      if (t.resourceProfile.aquaticPotential > 0.3) aquaticOpportunityTiles += 1;
      meanRichness += t.resourceProfile.baseRichness;
    }

    const plantSummary = plantStock.summarizePlantPatchState(world);

    console.log(JSON.stringify({
      kind,
      tiles: tiles.length,
      landTiles: land.length,
      aquaticTiles: aquatic.length,
      fauna: {
        stockCount: stocks.length,
        GLOBAL_STOCK_CAP: faunaStock.GLOBAL_STOCK_CAP,
        PREDATOR_STOCK_CAP: faunaStock.PREDATOR_STOCK_CAP,
        byRole,
        totalCarryingCapacity: Math.round(totalCarrying * 100) / 100,
        totalStockNow: Math.round(totalStockNow * 100) / 100,
        zeroStocks,
        landTilesPerStock: Math.round((land.length / Math.max(1, stocks.length)) * 10) / 10,
      },
      plants: {
        patchCount,
        tilesWithPatches,
        pctLandTilesWithPatches: Math.round((tilesWithPatches / land.length) * 1000) / 10,
        totalLiveStock: Math.round(liveStock * 100) / 100,
        meanLiveStockPerLandTile: Math.round((liveStock / land.length) * 1000) / 1000,
        summary: plantSummary,
      },
      water: {
        reliableWaterTiles,
        pctLandReliableWater: Math.round((reliableWaterTiles / land.length) * 1000) / 10,
        aquaticOpportunityTiles,
        pctLandAquaticOpportunity: Math.round((aquaticOpportunityTiles / land.length) * 1000) / 10,
      },
      meanBaseRichness: Math.round((meanRichness / land.length) * 1000) / 1000,
    }, null, 2));
  }
} finally {
  await server.close();
}
