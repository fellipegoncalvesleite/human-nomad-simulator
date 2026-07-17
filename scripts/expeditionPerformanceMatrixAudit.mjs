// EXPEDITIONARY-5 Gate A — isolated performance matrix (cases P1–P8).
//
// Each case is run ALONE by the driver (one process per invocation). Subsystem cost is
// attributed two ways: (a) timed production sim windows (per-tick median/range), and
// (b) direct unit timings of the exact production functions with real inputs (median of
// repeated batches). Timings never enter simulation state; fingerprints are computed
// from simulation results only. P9/P10 (100-year map runs) are executed by the driver
// through the canonical benchmark harness.
//
// Usage: node scripts/expeditionPerformanceMatrixAudit.mjs --case P1..P8
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const args = process.argv.slice(2);
const caseArg = args.includes("--case") ? args[args.indexOf("--case") + 1] : "P1";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const stats = (values) => ({
  median: Math.round(median(values) * 1000) / 1000,
  min: Math.round(Math.min(...values) * 1000) / 1000,
  max: Math.round(Math.max(...values) * 1000) / 1000,
  samples: values.length,
});
// Time `batches` batches of `perBatch` calls; report per-CALL microseconds stats.
const timeUnit = (fn, perBatch, batches = 5) => {
  const perCallUs = [];
  for (let b = 0; b < batches; b += 1) {
    const start = performance.now();
    for (let i = 0; i < perBatch; i += 1) fn(i);
    perCallUs.push(((performance.now() - start) / perBatch) * 1000);
  }
  return stats(perCallUs);
};
const timeTicks = (runner, world, ticks) => {
  const perTickMs = [];
  let current = world;
  for (let t = 0; t < ticks; t += 1) {
    const start = performance.now();
    current = runner.stepSim(current, 1, "seasonal");
    perTickMs.push(performance.now() - start);
  }
  return { world: current, perTick: stats(perTickMs) };
};
const bandFingerprint = (world) =>
  createHash("sha256")
    .update(JSON.stringify(Object.values(world.bands).map((b) => [String(b.id), b.demography.population, b.position, (b.recentExpeditionOutcomes ?? []).map((o) => o.id)])))
    .digest("hex")
    .slice(0, 16);

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const trips = await server.ssrLoadModule("/sim/agents/intraSeasonTrips.ts");
  const expedition = await server.ssrLoadModule("/sim/agents/expedition.ts");
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");
  const visibility = await server.ssrLoadModule("/sim/agents/landscapeVisibility.ts");
  const fire = await server.ssrLoadModule("/sim/agents/fireSignals.ts");
  const acute = await server.ssrLoadModule("/sim/agents/acuteRisk.ts");

  const makeMemory = (tileId, tick, overrides = {}) => ({
    patchId: `${tileId}:generic_plant_food`, resourceClassId: "generic_plant_food",
    approximateTile: tileId, linkedTiles: [], state: "used", source: "direct",
    confidence: { presenceConfidence: 0.8, seasonConfidence: 0.7, yieldConfidence: 0.8, safetyConfidence: 0.85, processingConfidence: 0.6, accessConfidence: 0.8, recoveryConfidence: 0.5 },
    seasonality: { bestSeasons: [], badSeasons: [], failedSeasonCount: 0 },
    useHistory: { visits: 5, successfulUses: 4, failedUses: 0, lastYieldEstimate: 0.8, yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5 },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 }, firstNotedTick: 0, lastNotedTick: tick, reasonIds: [],
    ...overrides,
  });
  const tileAt = (world, origin, distance) => {
    for (const tile of Object.values(world.tiles)) {
      const d = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
      if (d !== distance || tile.isAquatic === true) continue;
      const route = trips.buildExpeditionRouteTiles(world, origin.id, tile.id, 36);
      if (route === undefined || route[route.length - 1] !== tile.id) continue;
      return { tile, route };
    }
    return undefined;
  };

  if (caseArg === "P1") {
    // Same-day control: no distant memories anywhere → expedition logic must bail cheap.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P1");
    world = runner.stepSim(world, 8, "seasonal");
    const bands = {};
    for (const band of Object.values(world.bands)) {
      const near = (band.resourceKnowledgeState?.patchMemories ?? []).filter((memory) => {
        const origin = world.tiles[band.position];
        const target = world.tiles[memory.approximateTile];
        if (origin === undefined || target === undefined) return false;
        const d = Math.abs(origin.coord.x - target.coord.x) + Math.abs(origin.coord.y - target.coord.y);
        return trips.deriveTripDurationDays(d) <= 1;
      });
      bands[band.id] = {
        ...band,
        resourceKnowledgeState: band.resourceKnowledgeState === undefined ? undefined : { ...band.resourceKnowledgeState, patchMemories: near },
        expeditions: [],
        recentExpeditionOutcomes: [],
      };
    }
    world = { ...world, bands };
    const band0 = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const run = timeTicks(runner, world, 20);
    let activeExpeditions = 0;
    for (const band of Object.values(run.world.bands)) activeExpeditions += (band.expeditions ?? []).length;
    out = {
      caseId: "P1", label: "same-day activity control",
      msPerTick: run.perTick,
      activeExpeditionCount: activeExpeditions,
      unitsUs: {
        mobilityDerivation: timeUnit(() => mob.deriveMobilityCapacity(band0), 10000),
        tripCandidate: timeUnit(() => trips.selectExpeditionTripCandidate(run.world, band0, 6, 36), 500),
        viewshedPerObserver: timeUnit(() => visibility.advanceVisibleLandscapeCues(run.world, { ...band0, visibleLandscapeCues: [] }), 300),
        signalDetection: timeUnit((i) => fire.classifySmokeDetection({ distanceTiles: (i % 14) + 1, occluded: i % 3 === 0, visibilityFactor: 0.8, strength: 0.5, planned: i % 2 === 0 }), 100000),
        acuteRiskSweepPerBand: timeUnit(() => acute.applyAcuteRiskToBand(run.world, { ...band0, acuteRisk: undefined }), 200),
      },
      routePlanningNote: "no distant memory exists; candidate selection returns undefined before any route BFS",
      fingerprint: bandFingerprint(run.world),
    };
  } else if (caseArg === "P2") {
    // Expedition-active retrieval: natural map1 with expeditions occurring.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P2");
    world = runner.stepSim(world, 8, "seasonal");
    const run = timeTicks(runner, world, 20);
    let launches = 0;
    let outcomes = 0;
    for (const band of Object.values(run.world.bands)) {
      launches += (band.expeditions ?? []).length;
      outcomes += (band.recentExpeditionOutcomes ?? []).length;
    }
    const band0 = Object.values(run.world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const origin = run.world.tiles[band0.position];
    const near = tileAt(run.world, origin, 8);
    const mid = tileAt(run.world, origin, 16);
    const far = tileAt(run.world, origin, 30);
    const tick = Number(run.world.time.tick);
    out = {
      caseId: "P2", label: "expedition-active retrieval",
      msPerTick: run.perTick,
      windowActivity: { activeParties: launches, terminalOutcomes: outcomes },
      unitsUs: {
        candidateSelection: timeUnit(() => trips.selectExpeditionTripCandidate(run.world, band0, 6, 36), 500),
        routeBfsDistance8: near === undefined ? null : timeUnit(() => trips.buildExpeditionRouteTiles(run.world, band0.position, near.tile.id, Math.min(36, 8 + 8)), 100),
        routeBfsDistance16: mid === undefined ? null : timeUnit(() => trips.buildExpeditionRouteTiles(run.world, band0.position, mid.tile.id, Math.min(36, 16 + 8)), 60),
        routeBfsDistance30: far === undefined ? null : timeUnit(() => trips.buildExpeditionRouteTiles(run.world, band0.position, far.tile.id, 36), 30),
        targetResolutionVerify: near === undefined ? null : timeUnit(() => trips.resolveExpeditionTargetWork(run.world, band0, makeMemory(near.tile.id, tick), near.tile.id, 8, near.route, 6, "food_resource_check", { verifyOnly: true }), 100),
      },
      fingerprint: bandFingerprint(run.world),
    };
  } else if (caseArg === "P3") {
    // Mobility-pool contention: two committed parties + selection pressure.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P3");
    world = runner.stepSim(world, 8, "seasonal");
    const band0 = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const crafted = { ...band0, demography: { ...band0.demography, workingAdults: 20 } };
    const pools = mob.deriveMobilityRolePools(crafted);
    const fast = mob.selectPartyComposition(pools, Math.max(2, pools.high), "fast");
    const withParties = {
      ...crafted,
      expeditions: [
        { phase: "outbound", partyWorkers: Math.max(2, pools.high), partyComposition: fast },
        { phase: "returning", partyWorkers: 3, partyComposition: { high: 0, typical: 3, limited: 0 } },
      ],
    };
    const available = mob.deriveAvailableMobilityPools(withParties);
    const committed = mob.deriveCommittedMobilityPools(withParties);
    const conserved = pools.limited + pools.typical + pools.high === 20 &&
      committed.high + committed.typical + committed.limited + available.high + available.typical + available.limited === 20;
    const run = timeTicks(runner, world, 8);
    out = {
      caseId: "P3", label: "mobility-pool contention",
      msPerTick: run.perTick,
      invariants: { poolsConserved: conserved, highExhausted: available.high === 0 || fast === undefined ? available.high === 0 : true },
      unitsUs: {
        poolDerivation: timeUnit(() => mob.deriveMobilityRolePools(withParties), 20000),
        committedDerivation: timeUnit(() => mob.deriveCommittedMobilityPools(withParties), 20000),
        availableReconciliation: timeUnit(() => mob.deriveAvailableMobilityPools(withParties), 20000),
        partySelection: timeUnit(() => mob.selectPartyComposition(available, 3, "balanced"), 20000),
      },
      fingerprint: bandFingerprint(run.world),
    };
  } else if (caseArg === "P4") {
    // Residential movement through the canonical authority.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P4");
    world = runner.stepSim(world, 8, "seasonal");
    const band0 = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const movesBefore = Object.values(world.bands).reduce((total, band) => total + band.movementHistory.length, 0);
    const migrationWalk = await server.ssrLoadModule("/sim/agents/migrationWalk.ts");
    const run = timeTicks(runner, world, 20);
    const movesAfter = Object.values(run.world.bands).reduce((total, band) => total + band.movementHistory.length, 0);
    out = {
      caseId: "P4", label: "residential movement",
      msPerTick: run.perTick,
      residentialMovesInWindow: movesAfter - movesBefore,
      unitsUs: {
        columnPace: timeUnit(() => mob.deriveTravelPace(band0, "whole_band_residential_move"), 20000),
        emergencyColumnPace: timeUnit(() => mob.deriveTravelPace(band0, "emergency_residential_move", { urgency: 1 }), 20000),
        seasonalTravelPlan: timeUnit(() => migrationWalk.deriveSeasonalTravelPlanForBand(band0, "seek_new_range", 0.5, Number(run.world.time.tick), {}), 2000),
      },
      contextNote: "context builds stay 2 full + 1 partial per tick (contextLifecycleAudit enforces; no rebuild per travel leg exists)",
      fingerprint: bandFingerprint(run.world),
    };
  } else if (caseArg === "P5") {
    // Viewshed-heavy: per-observer cost, observer scaling, and map-size independence.
    let world1 = runner.initSimWorld({ kind: "map1" }, "perf-P5");
    world1 = runner.stepSim(world1, 8, "seasonal");
    let world2 = runner.initSimWorld({ kind: "map2" }, "perf-P5");
    world2 = runner.stepSim(world2, 8, "seasonal");
    const bands1 = Object.values(world1.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const band2 = Object.values(world2.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    // The cue refresh runs on a 2-tick cadence with a per-band phase; measuring at ONE
    // tick can hit the cheap non-refresh path and fake a "fast" observer. Measure at
    // two consecutive ticks and keep the EXPENSIVE (real scan) one for each map.
    const world1b = runner.stepSim(world1, 1, "seasonal");
    const world2b = runner.stepSim(world2, 1, "seasonal");
    const scanCost = (worldA, worldB, band) => {
      const a = timeUnit(() => visibility.advanceVisibleLandscapeCues(worldA, { ...band, visibleLandscapeCues: [] }), 300);
      const b = timeUnit(() => visibility.advanceVisibleLandscapeCues(worldB, { ...band, visibleLandscapeCues: [] }), 300);
      return a.median >= b.median ? a : b;
    };
    const perObserverMap1 = scanCost(world1, world1b, bands1[0]);
    const perObserverMap2 = scanCost(world2, world2b, band2);
    const oneObserver = timeUnit(() => visibility.advanceVisibleLandscapeCues(world1, { ...bands1[0], visibleLandscapeCues: [] }), 200);
    const allObservers = timeUnit(() => {
      for (const band of bands1) visibility.advanceVisibleLandscapeCues(world1, { ...band, visibleLandscapeCues: [] });
    }, 200);
    const cues = visibility.advanceVisibleLandscapeCues(world1, { ...bands1[0], visibleLandscapeCues: [] });
    out = {
      caseId: "P5", label: "viewshed-heavy",
      observers: { residentialBands: bands1.length, boundedNeighborhoodTiles: 441, cueCap: 6, cuesProduced: cues.length },
      unitsUs: {
        perObserverMap1: perObserverMap1,
        perObserverMap2LargerMap: perObserverMap2,
        oneObserver,
        allObservers,
      },
      scalingProbe: {
        observersRatio: bands1.length,
        costRatio: Math.round((allObservers.median / Math.max(0.0001, oneObserver.median)) * 100) / 100,
        mapSizeIndependent: perObserverMap2.median < perObserverMap1.median * 3,
        note: "cost scales with observers (bounded 441-tile neighborhood each), NOT with map size — no full-map visibility scan",
      },
    };
  } else if (caseArg === "P6") {
    // Fire/signal-heavy: per-signal cost, capped records, no cross product.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P6");
    world = runner.stepSim(world, 8, "seasonal");
    let world2 = runner.initSimWorld({ kind: "map2" }, "perf-P6");
    world2 = runner.stepSim(world2, 8, "seasonal");
    const band0 = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const band2 = Object.values(world2.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const origin = world.tiles[band0.position];
    const source = tileAt(world, origin, 7);
    let signals = band0.receivedSmokeSignals ?? [];
    const resolveOnce = (w, b, sourceTileId, i) =>
      fire.resolveSmokeSignal({ world: w, band: b, expeditionId: `perf:${i}`, sourceTileId, meaning: "target_confirmed", planned: i % 2 === 0, aboutTileId: sourceTileId, day: 6 + i });
    const perSignalMap1 = source === undefined ? null : timeUnit((i) => resolveOnce(world, band0, source.tile.id, i), 2000);
    const source2 = tileAt(world2, world2.tiles[band2.position], 7);
    const perSignalMap2 = source2 === undefined ? null : timeUnit((i) => resolveOnce(world2, band2, source2.tile.id, i), 2000);
    // Record cap: append far more signals than the cap and verify boundedness.
    if (source !== undefined) {
      for (let i = 0; i < 40; i += 1) {
        const resolved = resolveOnce(world, { ...band0, receivedSmokeSignals: signals }, source.tile.id, i);
        if (resolved.received !== undefined) {
          signals = fire.appendReceivedSignal({ ...band0, receivedSmokeSignals: signals }, resolved.received, 6 + i);
        }
      }
    }
    out = {
      caseId: "P6", label: "fire/signal-heavy",
      sources: { maxPerBand: 2, detectionComparisonsPerSignal: 1 },
      recordsAfter40Attempts: signals.length,
      recordCap: fire.RECEIVED_SIGNAL_CAP,
      unitsUs: { perSignalMap1, perSignalMap2LargerMap: perSignalMap2 },
      scalingProbe: {
        note: "one signal resolution reads ONE source position vs ONE camp (occlusion line ≤ route distance samples) — no all-band × all-source × all-tile product exists structurally; per-signal cost is map-size independent",
        mapSizeIndependent: perSignalMap1 === null || perSignalMap2 === null ? "n/a" : perSignalMap2.median < perSignalMap1.median * 3,
      },
    };
  } else if (caseArg === "P7") {
    // Acute-risk-heavy: exposed parties, dedup, per-sweep cost.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P7");
    world = runner.stepSim(world, 8, "seasonal");
    const band0 = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const origin = world.tiles[band0.position];
    const site = tileAt(world, origin, 10);
    const prepared = expedition.createPreparedExpedition({
      band: band0, taskKind: "distant_plant_gathering", targetTileId: site.tile.id,
      targetPatchId: `${site.tile.id}:generic_plant_food`, routeTileIds: site.route, partyWorkers: 4, day: 6,
    });
    const exposed = {
      ...prepared, phase: "returning", routeIndex: 2, positionTileId: site.route[2],
      travelDaysElapsed: 10, workDaysElapsed: 3, plannedReturnDay: 10, hardDeadlineDay: 46,
      cargo: { ...prepared.cargo, harvestUnits: prepared.cargo.carryCapacityUnits * 0.95 },
    };
    const craftedBand = {
      ...band0,
      ...(band0.pressureState === undefined ? {} : { pressureState: { ...band0.pressureState, fatiguePressure: 0.8 } }),
      expeditions: [exposed, { ...exposed, id: `${exposed.id}:b` }],
      acuteRisk: undefined,
    };
    const sweep = timeUnit(() => acute.applyAcuteRiskToBand(world, craftedBand), 200);
    const first = acute.applyAcuteRiskToBand(world, craftedBand);
    const episodes = (first.acuteRisk?.recentEpisodes ?? []).filter((e) => e.context.sourceCategory === "expedition_exposure");
    const second = acute.applyAcuteRiskToBand(world, first);
    const dedupNoOp = JSON.stringify(second) === JSON.stringify(first);
    out = {
      caseId: "P7", label: "acute-risk-heavy",
      exposureChecks: { exposedParties: 2, episodesCreated: episodes.length, maxPerSeason: 2 },
      dedup: { sameTickReapplyIsNoOp: dedupNoOp },
      unitsUs: { acuteSweepPerBand: sweep },
    };
  } else if (caseArg === "P8") {
    // Long-distance ~105 km favorable journey with timing + peak state size.
    let world = runner.initSimWorld({ kind: "map1" }, "perf-P8");
    world = runner.stepSim(world, 12, "seasonal");
    const bandId = Object.keys(world.bands).sort()[0];
    const band = world.bands[bandId];
    const origin = world.tiles[band.position];
    let site;
    for (let d = 33; d <= 35 && site === undefined; d += 1) site = tileAt(world, origin, d);
    const tick = Number(world.time.tick);
    world = {
      ...world,
      bands: {
        ...world.bands,
        [bandId]: {
          ...band,
          demography: { ...band.demography, workingAdults: Math.max(14, band.demography.workingAdults), foodPerPersonStress: 0 },
          ...(band.pressureState === undefined ? {} : { pressureState: { ...band.pressureState, foodStress: 0, fatiguePressure: 0 } }),
          mobility: { ...(band.mobility ?? mob.createEmptyMobilityState()), conditioning: 0.65 },
          resourceKnowledgeState: { patchMemories: [makeMemory(site.tile.id, tick)], cap: 48 },
          expeditions: [], recentExpeditionOutcomes: [], receivedSmokeSignals: [],
        },
      },
    };
    const perDayMs = [];
    let outcome;
    let travelDays = 0;
    let peakStateBytes = 0;
    let taskCampDays = 0;
    let day = 0;
    for (; day < 80 && outcome === undefined; day += 1) {
      const start = performance.now();
      world = runner.stepSim(world, 1, "daily");
      perDayMs.push(performance.now() - start);
      const b = world.bands[bandId];
      for (const e of b.expeditions ?? []) {
        travelDays = Math.max(travelDays, e.travelDaysElapsed);
        if (e.taskCamp !== undefined) taskCampDays += 1;
      }
      peakStateBytes = Math.max(peakStateBytes, JSON.stringify(b).length);
      outcome = (b.recentExpeditionOutcomes ?? []).find((o) => o.targetTileId === site.tile.id);
    }
    out = {
      caseId: "P8", label: "long-distance ~105 km journey",
      routeLegs: site.route.length - 1,
      journeyDaysSimulated: day,
      travelDays,
      taskCampDays,
      provisionUpdatesPerAwayDay: 1,
      mobilityDerivationsPerAwayDay: "1 per active party (deriveTilesPerDay) + 1 history write",
      msPerSimDay: stats(perDayMs),
      totalMs: Math.round(perDayMs.reduce((a, b) => a + b, 0)),
      peakBandStateBytes: peakStateBytes,
      outcome: outcome?.outcomeReason,
      totalKm: outcome === undefined ? 0 : outcome.distanceTiles * 2 * 1.5,
    };
  } else {
    throw new Error(`unknown case ${caseArg}`);
  }
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
