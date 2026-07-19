// Temporary diagnostic probe (ECOLOGY-VIABILITY-CORRECTION-1, Phase 1 evidence).
// No-human ecology equilibrium: removes ALL bands, advances the world, and samples
// physical stocks over time to distinguish initialization transient / equilibrium /
// bounded cycle / drift / collapse / cap saturation.
// Measurement only. No production behavior is altered.
import { createServer } from "vite";

const args = process.argv.slice(2);
const years = args.includes("--years") ? Number(args[args.indexOf("--years") + 1]) : 200;
const kinds = args.includes("--kind") ? [args[args.indexOf("--kind") + 1]] : ["map1", "map2"];

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const spawn = await server.ssrLoadModule("/sim/agents/spawn.ts");
  const plantStock = await server.ssrLoadModule("/sim/agents/plantStock.ts");
  const faunaStock = await server.ssrLoadModule("/sim/agents/faunaStock.ts");

  const sample = (world) => {
    const dyn = world.faunaStocks ?? {};
    let faunaTotal = 0;
    let faunaZero = 0;
    let faunaRecords = 0;
    let faunaAtOrAboveCC = 0;
    const geo = faunaStock.deriveFaunaStockGeography(world);
    const ccById = new Map((geo.stocks ?? []).map((s) => [String(s.id), s.carryingCapacity ?? 0]));
    const byRole = {};
    const roleById = new Map((geo.stocks ?? []).map((s) => [String(s.id), s.trophicRole]));
    for (const [id, d] of Object.entries(dyn)) {
      faunaRecords += 1;
      const v = d.abundance ?? 0;
      faunaTotal += v;
      if (v <= 0.0001) faunaZero += 1;
      // `abundance` is already a FRACTION of the stock's carryingCapacity (0..1).
      if (v >= 0.99) faunaAtOrAboveCC += 1;
      const role = roleById.get(String(id)) ?? "unknown";
      byRole[role] = (byRole[role] ?? 0) + v;
    }
    const ps = plantStock.summarizePlantPatchState(world);
    return {
      faunaTotal: Math.round(faunaTotal * 1000) / 1000,
      faunaRecords,
      faunaZero,
      faunaAtOrAboveCC,
      faunaByRole: Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
      plantDynamicRecords: ps.dynamicRecords,
      plantMeanDepletion: ps.meanDepletion,
      plantMaxDepletion: ps.maxDepletion,
      plantOverharvested: ps.overharvestedPatches,
    };
  };

  for (const kind of kinds) {
    let world = runner.initSimWorld({ kind }, `nohuman-${kind}`);
    world = spawn.removeInitialBands(world, Object.keys(world.bands));
    const bandCount = Object.keys(world.bands).length;

    const series = [];
    series.push({ year: 0, ...sample(world) });
    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const year = Math.floor((season + 1) / 4);
      // dense early sampling (transient), sparse later (equilibrium/drift)
      const isSample = (season + 1) % 4 === 0 && (year <= 10 || year % 10 === 0);
      if (isSample) series.push({ year, ...sample(world) });
    }

    console.log(JSON.stringify({ kind, bandCount, years, series }, null, 1));
  }
} finally {
  await server.close();
}
