// EXPEDITIONARY-4 §12/§13 — viewshed + fire/smoke signaling audit.
//
// Proves:
//   §13.4 every detection outcome is physically reachable and deterministic
//         (not_feasible / too_distant / occluded / visibility_suppressed / missed /
//          seen_ambiguous / seen_understood);
//   §13.2 ordinary (unplanned) smoke is NEVER understood — deliberate meaning needs
//         the planned same-band convention;
//   §13.4 a received signal transfers BOUNDED meaning only (no identity, population,
//         task, or resource fields cross);
//   §13   the relay consequence is real: an understood mid-trip "target confirmed"
//         signal lets the retrieval party leave BEFORE the verification party is home;
//   §12   camp viewshed cues stay bounded with direction/distance/occlusion recorded,
//         and the party viewshed produces party-local observations at arrival;
//   §26   the environmental boundary reads present state only (season changes
//         visibility; terrain/wetness changes fire feasibility).
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
  const fire = await server.ssrLoadModule("/sim/agents/fireSignals.ts");
  const env = await server.ssrLoadModule("/sim/agents/environmentBoundary.ts");

  // ── §13.4 pure detection physics: every outcome reachable, deterministic ──────────
  const detect = fire.classifySmokeDetection;
  const outcomes = {
    notFeasible: detect({ distanceTiles: 3, occluded: false, visibilityFactor: 1, strength: 0.05, planned: true }),
    tooDistant: detect({ distanceTiles: 20, occluded: false, visibilityFactor: 1, strength: 0.8, planned: true }),
    occluded: detect({ distanceTiles: 6, occluded: true, visibilityFactor: 1, strength: 0.8, planned: true }),
    suppressed: detect({ distanceTiles: 6, occluded: false, visibilityFactor: 0.4, strength: 0.8, planned: true }),
    missed: detect({ distanceTiles: 13, occluded: false, visibilityFactor: 0.55, strength: 0.15, planned: true }),
    understood: detect({ distanceTiles: 5, occluded: false, visibilityFactor: 1, strength: 0.7, planned: true }),
    ambiguous: detect({ distanceTiles: 5, occluded: false, visibilityFactor: 1, strength: 0.7, planned: false }),
  };
  const allOutcomesReachable =
    outcomes.notFeasible === "not_feasible" &&
    outcomes.tooDistant === "too_distant" &&
    outcomes.occluded === "occluded" &&
    outcomes.suppressed === "visibility_suppressed" &&
    outcomes.missed === "missed" &&
    outcomes.understood === "seen_understood" &&
    outcomes.ambiguous === "seen_ambiguous";

  // Ordinary smoke is ambiguous at best across a deterministic sweep.
  let unplannedNeverUnderstood = true;
  for (let d = 1; d <= 16; d += 1) {
    for (const strength of [0.2, 0.5, 0.8, 1]) {
      for (const vis of [0.4, 0.7, 1]) {
        for (const occluded of [false, true]) {
          if (detect({ distanceTiles: d, occluded, visibilityFactor: vis, strength, planned: false }) === "seen_understood") {
            unplannedNeverUnderstood = false;
          }
        }
      }
    }
  }

  // ── §26 environmental boundary: present state only ─────────────────────────────────
  const world0 = runner.initSimWorld({ kind: "map1" }, "fire-signal-audit");
  const someBand = Object.values(world0.bands).sort((a, b) => a.id.localeCompare(b.id))[0];
  const tileId = someBand.position;
  const summerWorld = { ...world0, time: { ...world0.time, season: "summer" } };
  const winterWorld = { ...world0, time: { ...world0.time, season: "winter" } };
  const seasonChangesVisibility =
    env.deriveEnvironmentalVisibility(winterWorld, tileId).visibilityFactor <
    env.deriveEnvironmentalVisibility(summerWorld, tileId).visibilityFactor;
  const aquaticTile = Object.values(world0.tiles).find((t) => t.isAquatic === true);
  const forestTile = Object.values(world0.tiles)
    .filter((t) => t.terrainKind === "forest")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  const desertOrTundra = Object.values(world0.tiles)
    .filter((t) => t.terrainKind === "desert" || t.terrainKind === "tundra")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  const waterNotFeasible =
    aquaticTile === undefined || env.deriveFireFeasibility(world0, someBand, aquaticTile.id).feasible === false;
  const forestStrongerThanBarren =
    forestTile === undefined || desertOrTundra === undefined ||
    env.deriveFireFeasibility(summerWorld, someBand, forestTile.id).strength >
      env.deriveFireFeasibility(summerWorld, someBand, desertOrTundra.id).strength;

  // ── §13 controlled relay: understood signal → retrieval leaves before return ──────
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
  // A NEAR site (6-8 tiles): a real smoke column at this range reads clearly in fair
  // weather, which is exactly the regime the relay convention is planned for.
  const findPatchSite = (world, band) => {
    const origin = world.tiles[band.position];
    const sites = [];
    for (const tile of Object.values(world.tiles)) {
      const d = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
      if (d < 6 || d > 8 || tile.isAquatic === true) continue;
      if (plantPatches.derivePlantPatchesForTile(tile, world.time).length === 0) continue;
      const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 24);
      if (route === undefined || route[route.length - 1] !== tile.id) continue;
      sites.push({ tile, route, d });
      if (sites.length >= 3) break;
    }
    sites.sort((a, b) => String(a.tile.id).localeCompare(String(b.tile.id)));
    return sites[0];
  };

  let world = runner.initSimWorld({ kind: "map1" }, "fire-signal-audit");
  world = runner.stepSim(world, 40, "seasonal");
  const bandId = Object.keys(world.bands).sort()[0];
  const site = findPatchSite(world, world.bands[bandId]);
  const staleMemory = makeMemory(site, world.time, { lastNotedTick: Math.max(0, Number(world.time.tick) - 40) });
  const band = world.bands[bandId];
  world = {
    ...world,
    bands: {
      ...world.bands,
      [bandId]: {
        ...band,
        demography: { ...band.demography, workingAdults: Math.max(12, band.demography.workingAdults) },
        ...(band.pressureState === undefined
          ? {}
          : { pressureState: { ...band.pressureState, foodStress: 0, fatiguePressure: 0 } }),
        resourceKnowledgeState: { patchMemories: [staleMemory], cap: 48 },
        expeditions: [],
        recentExpeditionOutcomes: [],
        // Clear any signal the band naturally received during warm-in so the
        // controlled assertions read ONLY this fixture's convention.
        receivedSmokeSignals: [],
      },
    },
  };

  let signalUnderstoodReceived = false;
  let signalAttemptRecorded = false;
  let relayLaunchedBeforeReturn = false;
  let signalRecordKeysOk = true;
  let signalCapOk = true;
  let arrivalObservationSeen = false;
  const allowedKeys = new Set(["id", "day", "tick", "direction", "distanceBand", "outcome", "meaning", "aboutTileId", "expiresOnDay"]);

  for (let dayStep = 0; dayStep < 120 && !relayLaunchedBeforeReturn; dayStep += 1) {
    world = runner.stepSim(world, 1, "daily");
    const b = world.bands[bandId];

    for (const signal of b.receivedSmokeSignals ?? []) {
      for (const key of Object.keys(signal)) {
        if (!allowedKeys.has(key)) signalRecordKeysOk = false;
      }
      if (
        signal.outcome === "seen_understood" &&
        signal.meaning === "target_confirmed" &&
        String(signal.aboutTileId) === String(site.tile.id)
      ) {
        signalUnderstoodReceived = true;
      }
    }
    if ((b.receivedSmokeSignals ?? []).length > fire.RECEIVED_SIGNAL_CAP) signalCapOk = false;

    const verify = (b.expeditions ?? []).find((e) => e.taskKind === "distant_patch_verification");
    if (verify !== undefined && (verify.signalAttempts ?? []).length > 0) signalAttemptRecorded = true;
    if (
      verify !== undefined &&
      (verify.phase === "returning" || verify.phase === "operating") &&
      (b.expeditions ?? []).some(
        (e) => e.taskKind === "distant_plant_gathering" && e.targetTileId === verify.targetTileId,
      )
    ) {
      relayLaunchedBeforeReturn = true;
    }
    for (const e of b.expeditions ?? []) {
      if ((e.carriedObservations ?? []).some((o) => o.kind === "distant_feature")) arrivalObservationSeen = true;
    }
  }

  // ── §12 camp viewshed remains bounded with occlusion/direction recorded ───────────
  let natural = runner.initSimWorld({ kind: "map1" }, "fire-signal-natural");
  natural = runner.stepSim(natural, 10 * 4, "seasonal");
  let cueBoundsOk = true;
  let cueFieldsOk = true;
  let partyObservationsInNature = 0;
  for (const b of Object.values(natural.bands)) {
    const cues = b.visibleLandscapeCues ?? [];
    if (cues.length > 6) cueBoundsOk = false;
    for (const cue of cues) {
      if (cue.direction === undefined || cue.distanceTiles === undefined || cue.blockedByTerrain === undefined) {
        cueFieldsOk = false;
      }
    }
    for (const o of b.recentExpeditionOutcomes ?? []) {
      partyObservationsInNature += (o.observations ?? []).length;
    }
  }

  // Determinism: repeat the controlled run and compare received-signal ids.
  const rerun = () => {
    let w = runner.initSimWorld({ kind: "map1" }, "fire-signal-audit");
    w = runner.stepSim(w, 40, "seasonal");
    const b0 = w.bands[bandId];
    w = {
      ...w,
      bands: {
        ...w.bands,
        [bandId]: {
          ...b0,
          demography: { ...b0.demography, workingAdults: Math.max(12, b0.demography.workingAdults) },
          ...(b0.pressureState === undefined
            ? {}
            : { pressureState: { ...b0.pressureState, foodStress: 0, fatiguePressure: 0 } }),
          resourceKnowledgeState: { patchMemories: [staleMemory], cap: 48 },
          expeditions: [],
          recentExpeditionOutcomes: [],
          receivedSmokeSignals: [],
        },
      },
    };
    w = runner.stepSim(w, 30, "daily");
    return (w.bands[bandId].receivedSmokeSignals ?? []).map((s) => s.id).join("|");
  };
  const deterministicSignals = rerun() === rerun();

  const checks = {
    allDetectionOutcomesReachable_13: allOutcomesReachable,
    ordinarySmokeNeverUnderstood_13: unplannedNeverUnderstood,
    seasonChangesVisibility_26: seasonChangesVisibility,
    fireNeedsDryGround_26: waterNotFeasible,
    fuelFollowsTerrain_26: forestStrongerThanBarren,
    plannedSignalUnderstoodInProduction_13: signalUnderstoodReceived,
    signalAttemptRecordedOnParty_13: signalAttemptRecorded,
    relayRetrievalBeforeReturn_13: relayLaunchedBeforeReturn,
    signalTransfersBoundedMeaningOnly_13: signalRecordKeysOk,
    receivedSignalsCapped_13: signalCapOk,
    partyViewshedObservesAtArrival_12: arrivalObservationSeen || partyObservationsInNature > 0,
    campViewshedBounded_12: cueBoundsOk,
    campViewshedRecordsOcclusionDirection_12: cueFieldsOk,
    deterministicSignals_13: deterministicSignals,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "FIRE-SIGNAL-VIEWSHED-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    outcomes,
    controlled: {
      site: String(site.tile.id),
      signalUnderstoodReceived,
      relayLaunchedBeforeReturn,
      arrivalObservationSeen,
    },
    natural: { partyObservationsInNature },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
