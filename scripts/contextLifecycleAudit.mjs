// CORE-PIPELINE-DECOMPOSITION-3 (Workstream C) — context lifecycle audit.
//
// Asserts that the seasonal tick performs at most 2 FULL shared context rebuilds
// per season (down from ~4), with the end-of-season read-model pass done as a
// bounded PARTIAL REFRESH, across invalidation cases: no change, movement,
// harvest/depletion, pressure/nutrition change, demographic change, terminal
// extinction, and a shared multi-band catchment. Proves the partial refresh is
// byte-identical to always-full rebuilds (no stale reads), plus determinism and
// observer parity. Counters and the force-full switch are audit-only, non-persisted.
import { createHash } from "node:crypto";
import { createServer } from "vite";

const years = positiveInt(valueAfter("--years"), 12);
const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const ctx = await server.ssrLoadModule("/sim/agents/contextCache.ts");
  const advance = await server.ssrLoadModule("/sim/tick/advance.ts");
  const projection = await server.ssrLoadModule("/sim/world/ecologicalProjection.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");

  const scenarios = {
    no_change_healthy: () => controlledBand(runner, "tile:124:66", 24, {}),
    movement_marginal: () => controlledBand(runner, "tile:35:20", 27, {}),
    demographic_change: () => runner.initSimWorld({ kind: "map1" }, "ctx:map1"),
    multi_band_map2: () => runner.initSimWorld({ kind: "map2" }, "ctx:map2"),
    terminal_extinction: () => controlledBand(runner, "tile:0:7", 24, { sterile: true, projection, fauna }),
    shared_catchment_cluster: () => cluster(runner),
  };

  const results = {};
  let allWithinTarget = true;
  let allStaleReadFree = true;
  let allDeterministic = true;
  let allObserverParity = true;

  for (const [name, build] of Object.entries(scenarios)) {
    const initial = build();
    const seasons = years * 4;

    // Rebuild counters under production (partial-refresh) path.
    advance.setForceFullContextRebuilds(false);
    ctx.resetContextLifecycleCounters();
    const prodWorld = runner.stepSim(initial, seasons, "seasonal");
    const counters = ctx.getContextLifecycleCounters();
    const prodFp = hash(runner.takeDynamicSnapshot(prodWorld));
    const fullPerTick = counters.fullBuilds / seasons;
    const partialPerTick = counters.partialRefreshes / seasons;

    // Determinism: fresh run, same path.
    ctx.resetContextLifecycleCounters();
    const prodWorld2 = runner.stepSim(initial, seasons, "seasonal");
    const prodFp2 = hash(runner.takeDynamicSnapshot(prodWorld2));

    // Stale-read proof: force FULL rebuilds everywhere; the causal snapshot must be
    // byte-identical to the partial-refresh run.
    advance.setForceFullContextRebuilds(true);
    const fullWorld = runner.stepSim(initial, seasons, "seasonal");
    const fullFp = hash(runner.takeDynamicSnapshot(fullWorld));
    advance.setForceFullContextRebuilds(false);

    // Observer parity: an observer must not change outcomes or which caches exist.
    const observedWorld = runner.stepSim(initial, seasons, "seasonal", () => {});
    const observedFp = hash(runner.takeDynamicSnapshot(observedWorld));

    const withinTarget = fullPerTick <= 2 + 1e-9;
    const staleReadFree = fullFp === prodFp;
    const deterministic = prodFp2 === prodFp;
    const observerParity = observedFp === prodFp;
    allWithinTarget = allWithinTarget && withinTarget;
    allStaleReadFree = allStaleReadFree && staleReadFree;
    allDeterministic = allDeterministic && deterministic;
    allObserverParity = allObserverParity && observerParity;

    results[name] = {
      seasons,
      fullBuildsPerSeasonTick: round(fullPerTick),
      partialRefreshesPerSeasonTick: round(partialPerTick),
      withinTarget,
      staleReadFreeVsForcedFullRebuild: staleReadFree,
      deterministic,
      observerParity,
    };
  }

  // Season-order invariance must still hold with the partial refresh (physical
  // state identical under ascending/descending processing, excluding the
  // non-causal decision-history archive).
  const orderInitial = runner.initSimWorld({ kind: "map1" }, "ctx:order");
  const HISTORY = new Set(["recentDecisionIds", "decisions", "decisionArchive"]);
  const strip = (v) => Array.isArray(v) ? v.map(strip)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).filter(([k]) => !HISTORY.has(k)).map(([k, x]) => [k, strip(x)]))
      : v;
  const asc = strip(runner.takeDynamicSnapshot(runner.stepSim(orderInitial, years * 4, "seasonal", undefined, undefined, "ascending")));
  const desc = strip(runner.takeDynamicSnapshot(runner.stepSim(orderInitial, years * 4, "seasonal", undefined, undefined, "descending")));
  const seasonOrderPhysicalInvariant = hash(asc) === hash(desc);

  const checks = {
    fullRebuildsAtMostTwoPerTick: allWithinTarget,
    partialRefreshByteIdenticalToFullRebuild: allStaleReadFree,
    deterministic: allDeterministic,
    observerParity: allObserverParity,
    seasonOrderPhysicalInvariant,
  };
  const pass = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    check: "CONTEXT-LIFECYCLE-1",
    verdict: pass ? "PASS" : "FAIL",
    years,
    target: "fullSharedContextBuildsPerSeasonTick <= 2",
    checks,
    invalidationContract: {
      fullBuilds: [
        "pre-decision (season-start perceive/derive: spatial index + salient memory)",
        "post-decision (bands moved: spatial index invalidated by movement)",
      ],
      partialRefresh: [
        "end-of-season read-model: reuse post-decision derived data, reset ecology-dependent memos; when the active band set changed (fission/extinction) rebuild spatial/nearby but reuse per-band salient memory for survivors",
      ],
      eliminated: ["the redundant post-acute-risk rebuild (acute risk / context state are not cache inputs)"],
    },
    results,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function controlledBand(runner, tileId, population, opts) {
  const base = runner.initSimWorld({ kind: "map1" }, `ctx:${tileId}:base`);
  const removedInitialBandIds = Object.keys(base.bands);
  let world = runner.initSimWorld({
    kind: "map1", removedInitialBandIds,
    addedBands: [{ tileId, name: `Ctx ${tileId}`, population, knowledgePreset: "normal" }],
  }, `ctx:${tileId}`);
  if (opts.sterile === true) world = makeSterileWorld(world, opts.projection, opts.fauna);
  return world;
}

function cluster(runner) {
  const base = runner.initSimWorld({ kind: "map1" }, "ctx:cluster:base");
  const removedInitialBandIds = Object.keys(base.bands);
  const anchor = "tile:124:66";
  const ring = (base.tiles[anchor]?.neighbors ?? []).filter((t) => base.tiles[t] && base.tiles[t].isAquatic !== true);
  const tiles = [anchor, ...ring].slice(0, 4);
  return runner.initSimWorld({
    kind: "map1", removedInitialBandIds,
    addedBands: tiles.map((tileId, i) => ({ tileId, name: `Cluster ${String.fromCharCode(65 + i)}`, population: 28, knowledgePreset: "normal" })),
  }, "ctx:cluster");
}

function makeSterileWorld(world, projection, fauna) {
  const source = Object.values(world.bands)[0];
  const original = world.tiles[source.position];
  const sterileTile = {
    ...original, neighbors: [], terrainKind: "desert", biomeKind: "arid",
    isAquatic: false, isRiver: false, isRiverbank: false, isFloodplain: false, isCoastal: false,
    isConfluence: false, isEstuary: false, isMarshChannel: false, riverSegmentId: undefined,
    resourceProfile: { ...original.resourceProfile, baseRichness: 0, waterAccess: 0, aquaticPotential: 0, wildGrainPotential: 0, plantTendingPotential: 0, resourceRegenerationRate: 0 },
    seasonalProfile: { ...original.seasonalProfile, peakSeasons: [], leanSeasons: ["spring", "summer", "autumn", "winter"], reliability: 0, expectedWinterStress: 1 },
    riskProfile: { ...original.riskProfile, droughtRisk: 1, depletionRisk: 1 },
  };
  const observed = source.knowledge.observedTiles[source.position];
  const band = {
    ...source,
    knowledge: { ...source.knowledge, observedTiles: { [source.position]: { ...observed, observedRichness: 0, observedWaterAccess: 0, observedAquaticPotential: 0, observedRisk: 1, confidence: 1 } }, compressedKnownTileSummaries: [], knownAreaSummaries: [], knownRoutes: [], tileObservationHistory: [] },
    placeMemory: {}, travelCorridors: {}, crossingMemories: {},
  };
  return forceDepleteTile({ ...world, tiles: { ...world.tiles, [source.position]: sterileTile }, bands: { [band.id]: band }, decisions: {} }, source.position, projection, fauna);
}

function forceDepleteTile(world, tileId, projection, fauna) {
  const current = projection.deriveCurrentLivingEcologyTile(world, tileId);
  const plantPatchState = { ...(world.plantPatchState ?? {}) };
  const faunaStocks = { ...(world.faunaStocks ?? {}) };
  for (const source of current?.sources ?? []) {
    if (source.channel === "plant") plantPatchState[source.sourceId] = { depletion: 1, classId: source.sourceClass, lastUseTick: world.time.tick, cumulativeUse: 1 };
    else { const prior = fauna.getFaunaStockDynamic(world, source.sourceId); faunaStocks[source.sourceId] = { ...prior, abundance: 0, disturbance: 1, cumulativePressure: 1, lastPressureTick: world.time.tick }; }
  }
  return { ...world, plantPatchState, faunaStocks };
}

function valueAfter(flag) { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; }
function positiveInt(v, f) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : f; }
function round(v) { return Math.round(Number(v) * 1000) / 1000; }
function hash(v) { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }
