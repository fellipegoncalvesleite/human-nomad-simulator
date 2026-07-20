// CORRECTION-7 — same-day target churn, counted CORRECTLY.
//
// Supersedes sameDayRotationProbe.mjs, whose counts were an artifact: it re-scanned the
// whole rolling `recentIntraSeasonTrips` buffer (cap 24) every season, so each trip was
// counted many times and its "184 repeats vs 26 productive" ratio was not meaningful.
// This probe identifies each trip ONCE by (day, targetTileId) and reports per-season
// rates. Measurement only; no world mutation.
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
  const sites = {
    rich: withWater[0],
    ordinary: cands[Math.floor(cands.length / 2)],
    marginal: cands.filter((c) => c.stock <= cands[Math.floor(cands.length * 0.9)].stock)[0] ?? cands[cands.length - 1],
  };

  const out = {};
  for (const [name, site] of Object.entries(sites)) {
    let world = runner.initSimWorld({ kind: "map2" }, `habitat-${name}`);
    world = spawn.removeInitialBands(world, Object.keys(world.bands));
    world = spawn.spawnCustomBands(world, [{ tileId: site.tileId, population: 22, name: `habitat-${name}` }], `habitat-${name}`);
    const bandId = Object.keys(world.bands)[0];

    const seen = new Set();              // unique trip identity: day|target
    const targetCounts = new Map();      // target -> unique trip count
    const ordered = [];                  // chronological unique trips
    let seasonsAlive = 0;

    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const band = world.bands[bandId];
      if (band === undefined) break;
      seasonsAlive += 1;
      for (const trip of band.recentIntraSeasonTrips ?? []) {
        const key = `${Number(trip.day)}|${String(trip.targetTileId)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push({
          day: Number(trip.day),
          target: String(trip.targetTileId),
          units: trip.physicalFoodHarvest?.usableSupport ?? 0,
          inspection: trip.inspectionOnly === true,
        });
        targetCounts.set(String(trip.targetTileId), (targetCounts.get(String(trip.targetTileId)) ?? 0) + 1);
      }
    }

    ordered.sort((a, b) => a.day - b.day);
    let consecutiveRepeat = 0;
    for (let i = 1; i < ordered.length; i += 1) if (ordered[i].target === ordered[i - 1].target) consecutiveRepeat += 1;
    const productive = ordered.filter((t) => t.units > 0);
    const topTarget = [...targetCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    out[name] = {
      site: site.tileId,
      seasonsAlive,
      uniqueTrips: ordered.length,
      tripsPerSeason: Math.round((ordered.length / Math.max(1, seasonsAlive)) * 100) / 100,
      distinctTargets: targetCounts.size,
      consecutiveRepeatTrips: consecutiveRepeat,
      consecutiveRepeatRate: ordered.length > 1 ? Math.round((consecutiveRepeat / (ordered.length - 1)) * 1000) / 1000 : 0,
      productiveTrips: productive.length,
      productiveRate: ordered.length ? Math.round((productive.length / ordered.length) * 1000) / 1000 : 0,
      totalUnits: Math.round(productive.reduce((s, t) => s + t.units, 0) * 10000) / 10000,
      unitsPerSeason: Math.round((productive.reduce((s, t) => s + t.units, 0) / Math.max(1, seasonsAlive)) * 10000) / 10000,
      mostVisitedTarget: topTarget ? { tile: topTarget[0], trips: topTarget[1] } : undefined,
      inspectionTrips: ordered.filter((t) => t.inspection).length,
    };
  }
  console.log(JSON.stringify({ probe: "same-day-target-churn", years, out }, null, 1));
} finally {
  await server.close();
}
