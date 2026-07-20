// CORRECTION-8 — is the water_check monopoly a genuine unmet need or a re-check loop?
//
// Measures, per habitat: the waterStress trajectory, whether water_check trips ever
// reduce it, how many DISTINCT water targets the band checks, and the memory confidence
// it already holds about the target it is re-checking. Measurement only.
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

  const REACH = 10;
  const scoreWorld = runner.initSimWorld({ kind: "map2" }, "habitat-scoring");
  const tiles = Object.values(scoreWorld.tiles);
  const byCoord = new Map(tiles.map((t) => [`${t.coord.x}:${t.coord.y}`, t]));
  const scoreCenter = (c) => {
    let stock = 0, water = 0, wt = 0, usable = 0;
    for (let dy = -REACH; dy <= REACH; dy += 1) for (let dx = -REACH; dx <= REACH; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > REACH) continue;
      const t = byCoord.get(`${c.coord.x + dx}:${c.coord.y + dy}`);
      if (t === undefined) continue;
      usable += 1; water += t.resourceProfile.waterAccess;
      if (t.resourceProfile.waterAccess > 0.55) wt += 1;
      if (t.isAquatic === true) continue;
      for (const p of plantPatches.derivePlantPatchesForTile(t, scoreWorld.time)) stock += p.baseAbundance * p.currentAbundance;
    }
    return { stock: Math.round(stock * 100) / 100, meanWater: usable ? water / usable : 0, waterTiles: wt };
  };
  const cands = [];
  for (const t of tiles) {
    if (t.isAquatic === true) continue;
    if (t.coord.x % 6 !== 0 || t.coord.y % 6 !== 0) continue;
    if (t.coord.x < 12 || t.coord.y < 12 || t.coord.x > 208 || t.coord.y > 128) continue;
    const s = scoreCenter(t);
    if (s.stock <= 0.5 || s.waterTiles === 0) continue;
    cands.push({ tileId: t.id, ...s });
  }
  cands.sort((a, b) => b.stock - a.stock || String(a.tileId).localeCompare(String(b.tileId)));
  const withWater = cands.filter((c) => c.meanWater >= 0.3 && c.waterTiles >= 8);
  const sites = { rich: withWater[0], ordinary: cands[Math.floor(cands.length / 2)], marginal: cands.filter((c) => c.stock <= cands[Math.floor(cands.length * 0.9)].stock)[0] ?? cands[cands.length - 1] };

  const out = {};
  for (const [name, site] of Object.entries(sites)) {
    let world = runner.initSimWorld({ kind: "map2" }, `habitat-${name}`);
    world = spawn.removeInitialBands(world, Object.keys(world.bands));
    world = spawn.spawnCustomBands(world, [{ tileId: site.tileId, population: 22, name: `habitat-${name}` }], `habitat-${name}`);
    const bandId = Object.keys(world.bands)[0];
    const homeTile = world.tiles[world.bands[bandId].position];

    const waterStressSeries = [];
    const waterTargets = new Map();
    const seen = new Set();
    let seasons = 0;

    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const band = world.bands[bandId];
      if (band === undefined) break;
      seasons += 1;
      if (season % 8 === 0) {
        waterStressSeries.push({
          season,
          waterStress: band.pressureState?.waterStress ?? null,
          foodStress: band.pressureState?.foodStress ?? null,
          population: band.population,
        });
      }
      for (const trip of band.recentIntraSeasonTrips ?? []) {
        const key = `${Number(trip.day)}|${String(trip.targetTileId)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (String(trip.cause) !== "water_check") continue;
        const t = String(trip.targetTileId);
        const prev = waterTargets.get(t) ?? { count: 0, confSum: 0 };
        waterTargets.set(t, {
          count: prev.count + 1,
          confSum: prev.confSum + (trip.resourceReturn?.returnConfidence ?? 0),
        });
      }
    }

    const totalChecks = [...waterTargets.values()].reduce((a, b) => a + b.count, 0);
    const ranked = [...waterTargets.entries()]
      .map(([tile, v]) => ({ tile, count: v.count, meanReturnConfidence: Math.round((v.confSum / v.count) * 1000) / 1000 }))
      .sort((a, b) => b.count - a.count);

    out[name] = {
      site,
      homeTileWaterAccess: homeTile?.resourceProfile?.waterAccess ?? null,
      seasons,
      waterCheckTrips: totalChecks,
      distinctWaterTargets: ranked.length,
      topWaterTargets: ranked.slice(0, 5),
      waterStressSeries,
      waterStressMin: waterStressSeries.reduce((m, s) => Math.min(m, s.waterStress ?? 1), 1),
      waterStressMax: waterStressSeries.reduce((m, s) => Math.max(m, s.waterStress ?? 0), 0),
      triggerThreshold: 0.32,
    };
  }
  console.log(JSON.stringify({ probe: "waterCheckLoop", years, cases: out }, null, 2));
} finally {
  await server.close();
}
