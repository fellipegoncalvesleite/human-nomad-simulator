// CORRECTION-6 — same-day target rotation probe.
// Tests the recorded hypothesis: did making exploitation causes IGNORE inspection-only
// visits (CORRECTION-4) remove same-day target rotation, collapsing catchment coverage
// and local receipts on the marginal founder? Measurement only.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

const years = process.argv.includes("--years") ? Number(process.argv[process.argv.indexOf("--years") + 1]) : 40;

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const spawn = await server.ssrLoadModule("/sim/agents/spawn.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");

  // Rebuild the same site scoring the habitat audit uses, so sites match exactly.
  const REACH = 10;
  const scoreWorld = runner.initSimWorld({ kind: "map2" }, "habitat-scoring");
  const tiles = Object.values(scoreWorld.tiles);
  const byCoord = new Map(tiles.map((t) => [`${t.coord.x}:${t.coord.y}`, t]));
  const scoreCenter = (center) => {
    let stock = 0, water = 0, waterTiles = 0, usable = 0;
    for (let dy = -REACH; dy <= REACH; dy += 1) {
      for (let dx = -REACH; dx <= REACH; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > REACH) continue;
        const t = byCoord.get(`${center.coord.x + dx}:${center.coord.y + dy}`);
        if (t === undefined) continue;
        usable += 1;
        water += t.resourceProfile.waterAccess;
        if (t.resourceProfile.waterAccess > 0.55) waterTiles += 1;
        if (t.isAquatic === true) continue;
        for (const p of plantPatches.derivePlantPatchesForTile(t, scoreWorld.time)) {
          stock += p.baseAbundance * p.currentAbundance;
        }
      }
    }
    return { stock: Math.round(stock * 100) / 100, meanWater: usable === 0 ? 0 : water / usable, waterTiles };
  };
  const candidates = [];
  for (const t of tiles) {
    if (t.isAquatic === true) continue;
    if (t.coord.x % 6 !== 0 || t.coord.y % 6 !== 0) continue;
    if (t.coord.x < 12 || t.coord.y < 12 || t.coord.x > 208 || t.coord.y > 128) continue;
    const s = scoreCenter(t);
    if (s.stock <= 0.5 || s.waterTiles === 0) continue;
    candidates.push({ tileId: t.id, ...s });
  }
  candidates.sort((a, b) => b.stock - a.stock || String(a.tileId).localeCompare(String(b.tileId)));
  const sites = {
    ordinary: candidates[Math.floor(candidates.length / 2)],
    marginal:
      candidates.filter((c) => c.stock <= candidates[Math.floor(candidates.length * 0.9)].stock)[0] ??
      candidates[candidates.length - 1],
  };

  const out = {};
  for (const [name, site] of Object.entries(sites)) {
    let world = runner.initSimWorld({ kind: "map2" }, `habitat-${name}`);
    world = spawn.removeInitialBands(world, Object.keys(world.bands));
    world = spawn.spawnCustomBands(world, [{ tileId: site.tileId, population: 22, name: `habitat-${name}` }], `habitat-${name}`);
    const bandId = Object.keys(world.bands)[0];

    const seenTargets = new Set();
    const seenTargetsFirst40 = new Set();
    let foodTrips = 0;
    let inspectionTrips = 0;
    let repeatImmediate = 0;
    let lastTarget;

    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const band = world.bands[bandId];
      if (band === undefined) break;
      for (const trip of band.recentIntraSeasonTrips ?? []) {
        const target = String(trip.targetTileId);
        seenTargets.add(target);
        if (season < 160) seenTargetsFirst40.add(target);
        if (trip.inspectionOnly === true) inspectionTrips += 1;
        else if ((trip.physicalFoodHarvest?.usableSupport ?? 0) > 0) foodTrips += 1;
        if (target === lastTarget) repeatImmediate += 1;
        lastTarget = target;
      }
    }

    const finalBand = world.bands[bandId];
    out[name] = {
      site: site.tileId,
      distinctSameDayTargets: seenTargets.size,
      distinctTargetsFirst40y: seenTargetsFirst40.size,
      productiveFoodTripRecords: foodTrips,
      inspectionOnlyRecords: inspectionTrips,
      immediateRepeatTargets: repeatImmediate,
      finalPopulation: finalBand?.demography.population ?? 0,
    };
  }
  console.log(JSON.stringify({ probe: "same-day-target-rotation", years, out }, null, 1));
} finally {
  await server.close();
}
