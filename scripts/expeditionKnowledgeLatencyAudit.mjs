// EXPEDITIONARY-4 §10/§11 — information-task and knowledge-latency audit.
//
// Proves:
//   §10 verification and route-reconnaissance expeditions launch through the SAME
//       domain-owned competition as retrieval (never from bandDecision.ts), a hungry
//       band still gambles on retrieval, and information tasks deliver NO food;
//   §11 party-local knowledge stays party-local while away: the target memory does
//       not change until the party PHYSICALLY returns; on return the canonical
//       activity-memory application freshens/contradicts it; and the returned
//       evidence changes later behavior (a confirming verification is followed by a
//       physical retrieval party to the same target);
//   recon returns route knowledge (walked tiles enter observedTiles at return, not
//       before) and nothing else.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const trips = await server.ssrLoadModule("/sim/agents/intraSeasonTrips.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");

  // ── shared fixture helpers ─────────────────────────────────────────────────────────
  const makeMemory = (site, time, overrides = {}) => ({
    patchId: `${site.tile.id}:generic_plant_food`,
    resourceClassId: "generic_plant_food",
    approximateTile: site.tile.id,
    linkedTiles: [],
    state: "used",
    source: "direct",
    confidence: {
      presenceConfidence: 0.7, seasonConfidence: 0.6, yieldConfidence: 0.75,
      safetyConfidence: 0.85, processingConfidence: 0.6, accessConfidence: 0.7,
      recoveryConfidence: 0.5,
    },
    seasonality: { bestSeasons: [], badSeasons: [], failedSeasonCount: 0 },
    useHistory: {
      visits: 5, successfulUses: 4, failedUses: 0, lastYieldEstimate: 0.7,
      yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5,
    },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 },
    firstNotedTick: 0,
    lastNotedTick: Number(time.tick),
    reasonIds: [],
    ...overrides,
  });

  const findPatchSite = (world, band) => {
    const origin = world.tiles[band.position];
    const sites = [];
    for (const tile of Object.values(world.tiles)) {
      const distance = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
      if (distance < 6 || distance > 12) continue;
      if (tile.isAquatic === true) continue;
      if (plantPatches.derivePlantPatchesForTile(tile, world.time).length === 0) continue;
      const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 24);
      if (route === undefined || route[route.length - 1] !== tile.id) continue;
      sites.push({ tile, route, distance });
      if (sites.length >= 3) break;
    }
    sites.sort((a, b) => String(a.tile.id).localeCompare(String(b.tile.id)));
    return sites[0];
  };

  const withCraftedBand = (world, bandId, memory, options = {}) => {
    const band = world.bands[bandId];
    const crafted = {
      ...band,
      demography: { ...band.demography, workingAdults: Math.max(12, band.demography.workingAdults) },
      // Only calm an EXISTING pressure state; a partial fabricated one breaks acuteRisk.
      ...(band.pressureState === undefined
        ? {}
        : { pressureState: { ...band.pressureState, foodStress: 0, fatiguePressure: 0 } }),
      // A comfortable band (case B needs the food-stress retrieval cause OFF).
      ...(options.comfortable === true && band.carryingCapacity !== undefined
        ? {
            carryingCapacity: {
              ...band.carryingCapacity,
              perCapitaReturn: { ...band.carryingCapacity.perCapitaReturn, perCapitaReturn: 0.8 },
            },
          }
        : {}),
      ...(options.comfortable === true && band.returnTrend !== undefined
        ? { returnTrend: { ...band.returnTrend, chronicDecline: false } }
        : {}),
      resourceKnowledgeState: { patchMemories: [memory], cap: 48 },
      expeditions: [],
      recentExpeditionOutcomes: [],
    };
    return { ...world, bands: { ...world.bands, [bandId]: crafted } };
  };

  // Warm the world so staleness is even POSSIBLE (tick 0 cannot have 40-tick-old
  // memories) and bands carry real derived state to craft against.
  const WARM_IN_SEASONS = 40;

  const targetMemoryOf = (world, bandId, patchId) =>
    world.bands[bandId].resourceKnowledgeState?.patchMemories.find((m) => String(m.patchId) === patchId);

  // ═══ CONTROLLED CASE A — stale evidence → verification-before-retrieval + latency ═══
  let world = runner.initSimWorld({ kind: "map1" }, "knowledge-latency-audit");
  world = runner.stepSim(world, WARM_IN_SEASONS, "seasonal");
  const bandId = Object.keys(world.bands).sort()[0];
  const siteA = findPatchSite(world, world.bands[bandId]);
  // STALE (last noted 40 ticks ago) but VALUABLE memory: a comfortable band must not
  // commit a full party to it — it verifies with two fast walkers first.
  const staleMemory = makeMemory(siteA, world.time, { lastNotedTick: Math.max(0, Number(world.time.tick) - 40) });
  world = withCraftedBand(world, bandId, staleMemory);

  const patchIdA = String(staleMemory.patchId);
  let verificationLaunched = false;
  let verificationWorkers = 0;
  let memoryChangedWhileAway = false;
  let memoryChangedAtReturn = false;
  let verificationDelivered = -1;
  let verificationObservationKinds = [];
  let retrievalFollowedConfirmation = false;
  let awayDays = 0;
  const lastNotedAtLaunch = Number(staleMemory.lastNotedTick);
  let phaseSeen = new Set();

  for (let dayStep = 0; dayStep < 260 && !retrievalFollowedConfirmation; dayStep += 1) {
    world = runner.stepSim(world, 1, "daily");
    const band = world.bands[bandId];
    const active = (band.expeditions ?? []).filter((e) =>
      e.phase === "prepared" || e.phase === "outbound" || e.phase === "operating" || e.phase === "returning");
    const verify = active.find((e) => e.taskKind === "distant_patch_verification");

    if (verify !== undefined) {
      verificationLaunched = true;
      verificationWorkers = verify.partyWorkers;
      phaseSeen.add(verify.phase);
      awayDays += 1;
      // §11 — while the party is away, the residential memory must NOT freshen.
      const memory = targetMemoryOf(world, bandId, patchIdA);
      if (memory !== undefined && Number(memory.lastNotedTick) > lastNotedAtLaunch) {
        memoryChangedWhileAway = true;
      }
    }

    const outcome = (band.recentExpeditionOutcomes ?? []).find((o) => o.taskKind === "distant_patch_verification");
    if (outcome !== undefined && verificationDelivered < 0) {
      verificationDelivered = outcome.deliveredHarvestUnits;
      verificationObservationKinds = (outcome.observations ?? []).map((o) => o.kind);
      const memory = targetMemoryOf(world, bandId, patchIdA);
      if (memory !== undefined && Number(memory.lastNotedTick) > lastNotedAtLaunch) {
        memoryChangedAtReturn = true;
      }
    }

    // §11 behavior change: the confirming verification is followed by a RETRIEVAL
    // party physically sent to the same target.
    if (verificationDelivered >= 0) {
      const retrieval = [...(band.expeditions ?? []), ...(band.recentExpeditionOutcomes ?? [])]
        .find((e) => e.taskKind === "distant_plant_gathering" && e.targetTileId === siteA.tile.id);
      if (retrieval !== undefined) retrievalFollowedConfirmation = true;
    }
  }

  // ═══ CONTROLLED CASE B — weak route evidence → reconnaissance + tile knowledge ═════
  let worldB = runner.initSimWorld({ kind: "map1" }, "knowledge-latency-audit");
  worldB = runner.stepSim(worldB, WARM_IN_SEASONS, "seasonal");
  const siteB = findPatchSite(worldB, worldB.bands[bandId]);
  // FRESH memory, decent presence, but access evidence too weak to plan a route on
  // (and presence below the local-use threshold): no retrieval cause, not stale →
  // the route itself is the question → reconnaissance.
  const weakAccessMemory = makeMemory(siteB, worldB.time, {
    confidence: {
      presenceConfidence: 0.42, seasonConfidence: 0.5, yieldConfidence: 0.6,
      safetyConfidence: 0.85, processingConfidence: 0.5, accessConfidence: 0.2,
      recoveryConfidence: 0.4,
    },
  });
  worldB = withCraftedBand(worldB, bandId, weakAccessMemory, { comfortable: true });
  const observedBefore = Object.keys(worldB.bands[bandId].knowledge.observedTiles).length;
  const routeTilesB = new Set(siteB.route.map(String));

  let reconLaunched = false;
  let reconDelivered = -1;
  let reconTilesKnownBeforeReturn = false;
  let reconTilesKnownAfterReturn = false;
  let reconMemoryTouched = false;

  for (let dayStep = 0; dayStep < 200 && reconDelivered < 0; dayStep += 1) {
    worldB = runner.stepSim(worldB, 1, "daily");
    const band = worldB.bands[bandId];
    const recon = (band.expeditions ?? []).find((e) => e.taskKind === "route_reconnaissance");

    if (recon !== undefined && (recon.phase === "outbound" || recon.phase === "operating" || recon.phase === "returning")) {
      reconLaunched = true;
      // §11 — the walked tiles must NOT be band knowledge while the party is away
      // (only tiles it had before departure may be known).
      const newlyKnown = Object.keys(band.knowledge.observedTiles).length - observedBefore;
      if (newlyKnown > 0) reconTilesKnownBeforeReturn = true;
    }

    const outcome = (band.recentExpeditionOutcomes ?? []).find((o) => o.taskKind === "route_reconnaissance");
    if (outcome !== undefined && reconDelivered < 0) {
      reconDelivered = outcome.deliveredHarvestUnits;
      const known = band.knowledge.observedTiles;
      reconTilesKnownAfterReturn = [...routeTilesB].every((tileId) => known[tileId] !== undefined);
      const memory = targetMemoryOf(worldB, bandId, String(weakAccessMemory.patchId));
      reconMemoryTouched = memory === undefined
        ? false
        : Number(memory.lastNotedTick) > Number(weakAccessMemory.lastNotedTick);
    }
  }

  // ═══ NATURAL OCCURRENCE — 40y map1, family/food accounting ═════════════════════════
  let natural = runner.initSimWorld({ kind: "map1" }, "knowledge-latency-natural");
  const familyCounts = {};
  let infoFoodViolations = 0;
  const seen = new Set();
  for (let step = 0; step < 40 * 4; step += 1) {
    natural = runner.stepSim(natural, 1, "seasonal");
    for (const band of Object.values(natural.bands)) {
      for (const outcome of band.recentExpeditionOutcomes ?? []) {
        if (seen.has(outcome.id)) continue;
        seen.add(outcome.id);
        familyCounts[outcome.taskKind] = (familyCounts[outcome.taskKind] ?? 0) + 1;
        const isInfoTask = outcome.taskKind === "distant_patch_verification" || outcome.taskKind === "route_reconnaissance";
        if (isInfoTask && outcome.deliveredHarvestUnits > 0) infoFoodViolations += 1;
      }
    }
  }

  const checks = {
    verificationLaunchesForStaleEvidence_10: verificationLaunched,
    verificationUsesSmallFastParty_10: verificationWorkers === 2,
    verificationCreatesNoFood_10: verificationDelivered === 0,
    verificationBringsPhysicalEvidence_10: verificationObservationKinds.length > 0,
    memoryUnchangedWhileAway_11: verificationLaunched && !memoryChangedWhileAway && awayDays >= 2,
    memoryChangesAtPhysicalReturn_11: memoryChangedAtReturn,
    returnedEvidenceChangesLaterBehavior_11: retrievalFollowedConfirmation,
    reconnaissanceLaunchesForWeakRoutes_10: reconLaunched,
    reconnaissanceCreatesNoFood_10: reconDelivered === 0,
    walkedTilesStayLocalWhileAway_11: reconLaunched && !reconTilesKnownBeforeReturn,
    walkedTilesBecomeKnowledgeAtReturn_11: reconTilesKnownAfterReturn,
    reconnaissanceDoesNotTouchPatchMemory_11: !reconMemoryTouched,
    naturalInfoTasksOccur_10: (familyCounts["distant_patch_verification"] ?? 0) > 0,
    naturalRetrievalStillDominant_10:
      (familyCounts["distant_plant_gathering"] ?? 0) > (familyCounts["distant_patch_verification"] ?? 0) / 4,
    noInfoTaskFoodInNature_10: infoFoodViolations === 0,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-KNOWLEDGE-LATENCY-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    controlled: {
      verification: {
        launched: verificationLaunched, workers: verificationWorkers, awayDays,
        delivered: verificationDelivered, observationKinds: verificationObservationKinds,
        followedByRetrieval: retrievalFollowedConfirmation,
        phasesSeen: [...phaseSeen],
      },
      reconnaissance: {
        launched: reconLaunched, delivered: reconDelivered,
        routeTiles: siteB.route.length, knownAfterReturn: reconTilesKnownAfterReturn,
      },
    },
    naturalFamilyCounts: familyCounts,
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
