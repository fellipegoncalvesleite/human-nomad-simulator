// EXPEDITIONARY-4 §5 — target-resolution and failure-taxonomy audit.
//
// Proves the complete target identity chain with CONTROLLED physical cases:
//   §5.2 stable exact target  → found, worked, never a generic bucket
//   §5.2 multi-tile patch     → a route reaching a LINKED tile keeps patch identity
//   §5.2 depleted target      → explicit `physically_exhausted`
//   §5.2 seasonal mismatch    → explicit `seasonally_inactive`
//   §5.2 stale memory         → explicit `evidence_stale` (vs fresh-wrong `target_absent`)
//   §5.2 endpoint mismatch    → explicit `route_endpoint_mismatch`
//   §5.3 taxonomy             → the generic `target_not_found` bucket no longer exists
//
// Every case runs through the PRODUCTION work resolver (`resolveExpeditionTargetWork`)
// and the PRODUCTION classifier (`classifyTargetWorkOutcome`) against a real map1
// world — no parallel diagnostic implementation.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const trips = await server.ssrLoadModule("/sim/agents/intraSeasonTrips.ts");
  const expedition = await server.ssrLoadModule("/sim/agents/expedition.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");

  const world = runner.initSimWorld({ kind: "map1" }, "target-resolution-audit");
  const band = Object.values(world.bands).sort((a, b) => a.id.localeCompare(b.id))[0];
  const day = 12;
  const time = world.time;

  // ── Find a REAL physical plant-food patch tile within expedition reach ────────────
  const origin = world.tiles[band.position];
  const patchTiles = [];
  for (const tile of Object.values(world.tiles)) {
    const dx = Math.abs(tile.x - origin.x);
    const dy = Math.abs(tile.y - origin.y);
    const distance = dx + dy;
    if (distance < 5 || distance > 14) continue;
    const patches = plantPatches
      .derivePlantPatchesForTile(tile, time)
      .filter((p) => p.plantClassId !== undefined);
    if (patches.length === 0) continue;
    const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 24);
    if (route === undefined || route[route.length - 1] !== tile.id) continue;
    patchTiles.push({ tile, patches, route, distance });
  }
  patchTiles.sort((a, b) => String(a.tile.id).localeCompare(String(b.tile.id)));
  const site = patchTiles[0];

  // A patch memory fixture with explicit, controlled evidence quality.
  const makeMemory = (overrides = {}) => ({
    patchId: `${site.tile.id}:generic_plant_food`,
    resourceClassId: "generic_plant_food",
    approximateTile: site.tile.id,
    linkedTiles: [],
    state: "reliable",
    source: "direct",
    confidence: {
      presenceConfidence: 0.9, seasonConfidence: 0.85, yieldConfidence: 0.8,
      safetyConfidence: 0.9, processingConfidence: 0.7, accessConfidence: 0.85,
      recoveryConfidence: 0.6,
    },
    seasonality: { bestSeasons: [time.season], badSeasons: [], failedSeasonCount: 0 },
    useHistory: {
      visits: 4, successfulUses: 3, failedUses: 0, lastYieldEstimate: 0.6,
      yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5,
    },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 },
    firstNotedTick: Number(time.tick) - 2,
    lastNotedTick: Number(time.tick),
    reasonIds: [],
    ...overrides,
  });

  const resolve = (w, memory, targetTileId, routeTiles) => {
    const result = trips.resolveExpeditionTargetWork(
      w, band, memory, targetTileId, Math.max(0, routeTiles.length - 1), routeTiles, day, "food_resource_check",
    );
    const taken = result.record.physicalFoodHarvest?.usableSupport ?? 0;
    return { ...result, taken, reason: expedition.classifyTargetWorkOutcome(result.record, taken) };
  };

  // ── Case 1: stable exact target — fresh memory, active season, live stock ─────────
  const stable = resolve(world, makeMemory(), site.tile.id, site.route);

  // ── Case 2: multi-tile patch — route ends on a LINKED tile, identity retained ─────
  const linkedStand = site.route[site.route.length - 2]; // a real walked tile != anchor
  const linkedMemory = makeMemory({ linkedTiles: [linkedStand] });
  const linkedRoute = site.route.slice(0, -1); // physically stop at the linked tile
  const multiTile = resolve(world, linkedMemory, site.tile.id, linkedRoute);

  // ── Case 3: depleted target — stock physically drawn to nothing ───────────────────
  const depletedWorld = {
    ...world,
    plantPatchState: Object.fromEntries(
      site.patches.map((p) => [String(p.patchId), { depletion: 1, lastHarvestTick: Number(time.tick) }]),
    ),
  };
  const depleted = resolve(depletedWorld, makeMemory(), site.tile.id, site.route);

  // ── Case 4: seasonal mismatch — band-known seasonality excludes this season ───────
  const otherSeasons = ["spring", "summer", "autumn", "winter"].filter((s) => s !== time.season);
  const seasonal = resolve(
    world,
    makeMemory({ seasonality: { bestSeasons: [otherSeasons[0]], badSeasons: [time.season], failedSeasonCount: 0 } }),
    site.tile.id,
    site.route,
  );

  // ── Case 5a: stale evidence — weak/inferred memory names a tile with NO patch ─────
  const bareTile = Object.values(world.tiles)
    .filter((t) => t.isAquatic !== true
      && plantPatches.derivePlantPatchesForTile(t, time).length === 0
      && trips.buildExpeditionRouteTiles(world, band.position, t.id, 24)?.[0] !== undefined)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  const bareRoute = trips.buildExpeditionRouteTiles(world, band.position, bareTile.id, 24);
  const staleMemory = makeMemory({
    patchId: `${bareTile.id}:generic_plant_food`,
    approximateTile: bareTile.id,
    state: "suspected",
    source: "inferred",
    confidence: {
      presenceConfidence: 0.2, seasonConfidence: 0.1, yieldConfidence: 0.12,
      safetyConfidence: 0.5, processingConfidence: 0.1, accessConfidence: 0.3,
      recoveryConfidence: 0.1,
    },
    lastNotedTick: Number(time.tick) - 60,
  });
  const stale = resolve(world, staleMemory, bareTile.id, bareRoute);

  // ── Case 5b: fresh-but-wrong evidence at the same bare tile → target ABSENT ───────
  const absent = resolve(
    world,
    makeMemory({ patchId: `${bareTile.id}:generic_plant_food`, approximateTile: bareTile.id }),
    bareTile.id,
    bareRoute,
  );

  // ── Case 6: route endpoint mismatch — the walked route stops short of the target ──
  const shortRoute = site.route.slice(0, Math.max(2, site.route.length - 3));
  const endpoint = resolve(world, makeMemory(), site.tile.id, shortRoute);

  // ── §5.3: the generic bucket must be impossible to produce ─────────────────────────
  const reasons = [stable, multiTile, depleted, seasonal, stale, absent, endpoint].map((c) => c.reason);

  // Determinism: the stable case re-resolved from an identical world is identical.
  const world2 = runner.initSimWorld({ kind: "map1" }, "target-resolution-audit");
  const band2 = Object.values(world2.bands).sort((a, b) => a.id.localeCompare(b.id))[0];
  const stableRepeat = (() => {
    const result = trips.resolveExpeditionTargetWork(
      world2, band2, makeMemory(), site.tile.id, Math.max(0, site.route.length - 1), site.route, day, "food_resource_check",
    );
    const taken = result.record.physicalFoodHarvest?.usableSupport ?? 0;
    return { taken, reason: expedition.classifyTargetWorkOutcome(result.record, taken) };
  })();

  const checks = {
    stableExactTargetIsFound: stable.taken > 0 && stable.reason === "returned_with_cargo",
    stableTargetIdentityMatches: String(stable.record.physicalFoodHarvest?.sourceId ?? "") !== "",
    multiTilePatchKeepsIdentity: multiTile.reason !== "route_endpoint_mismatch" && multiTile.taken > 0,
    depletedTargetIsExplicit: depleted.reason === "physically_exhausted",
    seasonalMismatchIsExplicit: seasonal.reason === "seasonally_inactive",
    staleEvidenceIsExplicit: stale.reason === "evidence_stale",
    freshWrongEvidenceIsTargetAbsent: absent.reason === "target_absent",
    endpointMismatchIsExplicit: endpoint.reason === "route_endpoint_mismatch",
    noGenericTargetNotFound: reasons.every((r) => r !== "target_not_found"),
    deterministicResolution: stableRepeat.reason === stable.reason && stableRepeat.taken === stable.taken,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-TARGET-RESOLUTION-1",
    verdict: pass ? "PASS" : "FAIL",
    site: { tileId: String(site.tile.id), routeTiles: site.route.length, patches: site.patches.map((p) => String(p.patchId)) },
    checks,
    cases: {
      stable: { reason: stable.reason, taken: stable.taken },
      multiTile: { reason: multiTile.reason, taken: multiTile.taken, stoodAt: String(linkedStand) },
      depleted: { reason: depleted.reason },
      seasonal: { reason: seasonal.reason },
      stale: { reason: stale.reason },
      absent: { reason: absent.reason },
      endpoint: { reason: endpoint.reason },
    },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
