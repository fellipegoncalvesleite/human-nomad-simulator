// CORE-PIPELINE-CONSOLIDATION-1 — season band-order invariance audit.
//
// The seasonal decision loop processes bands in a canonical id sort. This audit
// re-runs the SAME initial world under ascending (production), descending, and a
// deterministic permuted processing order and compares outcomes by band id. Band
// IDs are never renamed — only the processing order of the same IDs changes.
//
// If final world fingerprints match across all orders, band processing order does
// not confer priority and the season is order-invariant. If they differ, the
// per-band divergence quantifies the order-dependence defect (Hypothesis A).
//
// The order strategy is an audit-only, non-persisted runner argument.
import { createHash } from "node:crypto";
import { createServer } from "vite";

const years = positiveInt(valueAfter("--years"), 4);
const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");

  const scenarios = {
    // Default map worlds (bands spread across the map — light interaction).
    default_map1: () => runner.initSimWorld({ kind: "map1" }, "order-invariance:map1"),
    default_map2: () => runner.initSimWorld({ kind: "map2" }, "order-invariance:map2"),
    // Symmetric competing cluster: several bands packed around a rich tile so
    // their catchments overlap and crowding/shared-resource pressure is maximal —
    // the case most likely to expose processing-order priority.
    competing_cluster: () => makeCluster(runner),
  };

  // The bounded decision-history archive records the most recent decisions:
  //   - recentDecisionIds: the id list, ordered by when decisions were recorded;
  //   - decisions: the retained Decision records keyed by that list;
  //   - decisionArchive: the rolling summary.
  // Its append order (and, at the bounded-window eviction boundary, which records
  // survive) reflects band processing order. It is a history/projection record —
  // NOT read to make causal decisions — so it is excluded from the physical
  // invariant. Every other snapshot field is causal/physical state. Production
  // uses the canonical ascending order deterministically.
  const HISTORY_ARCHIVE_KEYS = new Set(["recentDecisionIds", "decisions", "decisionArchive"]);

  const results = {};
  for (const [name, build] of Object.entries(scenarios)) {
    const initial = build();
    const orders = ["ascending", "descending", "permuted"];
    const runs = {};
    for (const order of orders) {
      const world = runner.stepSim(initial, years * 4, "seasonal", undefined, undefined, order);
      const snapshot = runner.takeDynamicSnapshot(world);
      runs[order] = {
        fullFingerprint: hash(snapshot),
        physicalFingerprint: hash(withoutRecencyArtifact(snapshot, HISTORY_ARCHIVE_KEYS)),
        bands: bandSummaries(world),
        totalPopulation: totalPopulation(world),
      };
    }
    // Determinism of the production (ascending) order itself, fresh run.
    const asc2 = runner.stepSim(initial, years * 4, "seasonal", undefined, undefined, "ascending");
    const ascRepeatFingerprint = hash(runner.takeDynamicSnapshot(asc2));

    const ascPhys = runs.ascending.physicalFingerprint;
    const physicalMatch =
      runs.descending.physicalFingerprint === ascPhys && runs.permuted.physicalFingerprint === ascPhys;
    const fullMatch =
      runs.descending.fullFingerprint === runs.ascending.fullFingerprint &&
      runs.permuted.fullFingerprint === runs.ascending.fullFingerprint;
    // When the physical state matches but the full snapshot differs, prove the
    // difference is confined to the recency artifact.
    const soleDifferenceIsRecencyArtifact = physicalMatch && !fullMatch;
    const perBandDivergence = physicalMatch ? [] : diffBands(runs, orders);

    results[name] = {
      physicalMatch,
      fullMatch,
      soleDifferenceIsRecencyArtifact,
      ascendingDeterministic: ascRepeatFingerprint === runs.ascending.fullFingerprint,
      totalPopulation: {
        ascending: runs.ascending.totalPopulation,
        descending: runs.descending.totalPopulation,
        permuted: runs.permuted.totalPopulation,
      },
      bandCount: runs.ascending.bands.length,
      perBandDivergence,
    };
  }

  const checks = {
    productionDeterministic: Object.values(results).every((r) => r.ascendingDeterministic),
    // The real invariant: physical/causal state is identical under any processing
    // order — no band gains priority from its id sort position.
    physicalOrderInvariant: Object.values(results).every((r) => r.physicalMatch),
    // Any residual full-snapshot difference is confined to the recency archive.
    residualDifferenceIsRecencyArtifactOnly: Object.values(results).every(
      (r) => r.fullMatch || r.soleDifferenceIsRecencyArtifact),
  };
  const pass = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    check: "SEASON-ORDER-INVARIANCE-1",
    verdict: pass ? "PASS" : "FAIL",
    years,
    checks,
    interpretation: pass
      ? "Physical/causal season outcomes are identical under ascending/descending/permuted band processing order: no band gains priority from its id sort position (Hypothesis A's order-priority form REJECTED). The only order-sensitive state is the bounded decision-history archive (recentDecisionIds + retained decisions records + decisionArchive summary), a projection/history record not read to make causal decisions; production uses the canonical ascending order deterministically."
      : "Physical/causal state depends on band processing order: an explicit deterministic resolution rule is required (Hypothesis A CONFIRMED). See perBandDivergence.",
    recencyArtifact: {
      fields: ["decisionArchive.recentDecisionIds", "decisions (retained recent records)", "decisionArchive"],
      classification: "history/projection record; append order and bounded-window eviction reflect recording order; not read for causal decisions; physical outcome is order-invariant",
    },
    results,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function makeCluster(runner) {
  const base = runner.initSimWorld({ kind: "map1" }, "order-invariance:cluster:base");
  const removedInitialBandIds = Object.keys(base.bands);
  // Find a rich anchor tile and its land neighbors to pack bands onto.
  const anchor = "tile:124:66";
  const ring = collectLocalRing(base, anchor, 1).filter((t) => {
    const tile = base.tiles[t];
    return tile !== undefined && tile.isAquatic !== true;
  });
  const tiles = [anchor, ...ring.filter((t) => t !== anchor)].slice(0, 4);
  const addedBands = tiles.map((tileId, i) => ({
    tileId,
    name: `Cluster ${String.fromCharCode(65 + i)}`,
    population: 28,
    knowledgePreset: "normal",
  }));
  return runner.initSimWorld({ kind: "map1", removedInitialBandIds, addedBands }, "order-invariance:cluster");
}

function withoutRecencyArtifact(value, keys) {
  if (Array.isArray(value)) return value.map((v) => withoutRecencyArtifact(v, keys));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) {
      if (keys.has(k)) continue;
      out[k] = withoutRecencyArtifact(value[k], keys);
    }
    return out;
  }
  return value;
}

function bandSummaries(world) {
  return Object.values(world.bands)
    .map((b) => ({
      id: b.id,
      position: b.position,
      population: b.demography.population,
      lifecycle: b.viability?.status ?? "active",
      fingerprint: hash({
        position: b.position,
        population: b.demography.population,
        fertility: b.demography.fertilityPressure,
        mortality: b.demography.mortalityPressure,
        netRate: b.demography.netDemographicRate,
      }),
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function diffBands(runs, orders) {
  const asc = new Map(runs.ascending.bands.map((b) => [b.id, b]));
  const diffs = [];
  for (const order of orders.filter((o) => o !== "ascending")) {
    for (const b of runs[order].bands) {
      const a = asc.get(b.id);
      if (a === undefined) { diffs.push({ order, id: b.id, issue: "band absent in ascending" }); continue; }
      if (a.fingerprint !== b.fingerprint) {
        diffs.push({
          order, id: b.id,
          ascending: { position: a.position, population: a.population },
          [order]: { position: b.position, population: b.population },
        });
      }
    }
  }
  return diffs.slice(0, 40);
}

function collectLocalRing(world, originTileId, radius) {
  const seen = new Set([originTileId]);
  let frontier = [originTileId];
  for (let d = 0; d < radius; d += 1) {
    const next = [];
    for (const tileId of frontier) {
      for (const n of world.tiles[tileId]?.neighbors ?? []) {
        if (seen.has(n)) continue;
        seen.add(n); next.push(n);
      }
    }
    frontier = next;
  }
  return [...seen].sort();
}

function totalPopulation(world) {
  return Object.values(world.bands).reduce((s, b) => s + b.demography.population, 0);
}
function valueAfter(flag) { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; }
function positiveInt(v, f) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : f; }
function hash(v) { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }
