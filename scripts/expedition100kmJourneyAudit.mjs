// EXPEDITIONARY-4 §17 — controlled ~100 km journey audit.
//
// Proves long multi-day travel is POSSIBLE without being routine:
//   FAVORABLE — a conditioned (not superhuman) selected party, known valuable route
//     (~34 tiles out), calm camp, provisions: physical daily legs, nights out, no
//     teleport, real provision consumption, physical return, total ≥ ~100 km, and
//     bounded post-journey recovery (rest days recorded).
//   UNFAVORABLE — the SAME route with an unconditioned, exhausted, starving band:
//     the journey is infeasible, is aborted/lost, or takes materially longer — the
//     possibility is not free.
//   Not routine — in 40 natural years no band's longest expedition approaches 100 km.
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
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");

  let world = runner.initSimWorld({ kind: "map1" }, "hundred-km-journey");
  world = runner.stepSim(world, 12, "seasonal");
  const bandId = Object.keys(world.bands).sort()[0];
  const band = world.bands[bandId];
  const tick = Number(world.time.tick);
  const origin = world.tiles[band.position];

  const makeMemory = (tile) => ({
    patchId: `${tile.id}:generic_plant_food`,
    resourceClassId: "generic_plant_food",
    approximateTile: tile.id,
    linkedTiles: [],
    state: "used", source: "direct",
    confidence: {
      presenceConfidence: 0.85, seasonConfidence: 0.7, yieldConfidence: 0.85,
      safetyConfidence: 0.85, processingConfidence: 0.6, accessConfidence: 0.85,
      recoveryConfidence: 0.5,
    },
    seasonality: { bestSeasons: [], badSeasons: [], failedSeasonCount: 0 },
    useHistory: {
      visits: 6, successfulUses: 5, failedUses: 0, lastYieldEstimate: 0.85,
      yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5,
    },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 },
    firstNotedTick: 0, lastNotedTick: tick, reasonIds: [],
  });

  // A DISTANT worthwhile target: ~33-35 tiles of route → ≥ ~100 km out-and-back.
  let site;
  for (const tile of Object.values(world.tiles)) {
    const d = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
    if (d < 33 || d > 35 || tile.isAquatic === true) continue;
    if (plantPatches.derivePlantPatchesForTile(tile, world.time).length === 0) continue;
    const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 36);
    if (route === undefined || route[route.length - 1] !== tile.id || route.length - 1 < 33) continue;
    site = { tile, route, d };
    break;
  }

  const runJourney = (fitness) => {
    const crafted = {
      ...band,
      demography: {
        ...band.demography,
        workingAdults: Math.max(14, band.demography.workingAdults),
        foodPerPersonStress: fitness === "favorable" ? 0 : 0.9,
      },
      ...(band.pressureState === undefined
        ? {}
        : {
            pressureState: {
              ...band.pressureState,
              foodStress: fitness === "favorable" ? 0 : 0.6,
              fatiguePressure: fitness === "favorable" ? 0 : 0.95,
            },
          }),
      mobility: {
        ...(band.mobility ?? mob.createEmptyMobilityState()),
        conditioning: fitness === "favorable" ? 0.65 : 0,
      },
      resourceKnowledgeState: { patchMemories: [makeMemory(site.tile)], cap: 48 },
      expeditions: [],
      recentExpeditionOutcomes: [],
      receivedSmokeSignals: [],
    };
    let w = { ...world, bands: { ...world.bands, [bandId]: crafted } };
    const kmBefore = crafted.mobility.history?.totalKmWalked ?? 0;
    let outcome;
    let launched = false;
    let offRouteViolations = 0;
    let travelDaysSeen = 0;
    let launchDay = -1;
    let returnDay = -1;
    let day = 0;
    for (; day < 80 && outcome === undefined; day += 1) {
      w = runner.stepSim(w, 1, "daily");
      const b = w.bands[bandId];
      for (const e of b.expeditions ?? []) {
        if (e.targetTileId !== site.tile.id) continue;
        launched = true;
        if (launchDay < 0) launchDay = day;
        travelDaysSeen = Math.max(travelDaysSeen, e.travelDaysElapsed);
        if (e.routeTileIds[e.routeIndex] !== e.positionTileId) offRouteViolations += 1;
      }
      outcome = (b.recentExpeditionOutcomes ?? []).find((o) => o.targetTileId === site.tile.id);
      if (outcome !== undefined) returnDay = day;
    }
    // Bounded recovery: a few rest days after the terminal outcome.
    let restDaysAfter = 0;
    if (outcome !== undefined) {
      let w2 = w;
      for (let r = 0; r < 8; r += 1) {
        w2 = runner.stepSim(w2, 1, "daily");
      }
      const summary = mob.deriveWalkingSummary(w2.bands[bandId].mobility);
      restDaysAfter = summary.restDays;
    }
    const after = w.bands[bandId];
    return {
      outcome,
      launched,
      offRouteViolations,
      travelDaysSeen,
      journeyDays: launchDay >= 0 && returnDay >= 0 ? returnDay - launchDay : -1,
      kmWalked: Math.round(((after.mobility?.history?.totalKmWalked ?? 0) - kmBefore) * 100) / 100,
      longestExpeditionKm: after.mobility?.history?.longestExpeditionKm ?? 0,
      provisions: outcome?.provisionUnitsConsumed ?? 0,
      restDaysAfter,
    };
  };

  const favorable = runJourney("favorable");
  const unfavorable = runJourney("unfavorable");

  const favorableCompleted = favorable.outcome?.phase === "completed";
  const unfavorableFailedOrMuchSlower =
    unfavorable.launched === false ||
    unfavorable.outcome === undefined ||
    unfavorable.outcome.phase === "lost" ||
    unfavorable.outcome.outcomeReason === "provisions_ran_out" ||
    unfavorable.outcome.outcomeReason === "injury_forced_return" ||
    (favorable.journeyDays > 0 && unfavorable.journeyDays > favorable.journeyDays * 1.5);

  // Not routine: natural 40y — nobody's longest expedition approaches 100 km.
  let natural = runner.initSimWorld({ kind: "map1" }, "hundred-km-natural");
  natural = runner.stepSim(natural, 40 * 4, "seasonal");
  const naturalLongest = Math.max(
    0,
    ...Object.values(natural.bands).map((b) => b.mobility?.history?.longestExpeditionKm ?? 0),
  );

  const checks = {
    distantRouteExists_17: site !== undefined && site.route.length - 1 >= 33,
    favorableJourneyLaunches_17: favorable.launched === true,
    favorableJourneyCompletes_17: favorableCompleted === true,
    physicalDailyLegs_17: favorable.travelDaysSeen >= 10,
    noTeleport_17: favorable.offRouteViolations === 0,
    totalNearOrAbove100km_17: favorable.longestExpeditionKm >= 99,
    provisionsPhysicallyConsumed_17: favorable.provisions > 0,
    boundedRecoveryAfterwards_17: favorable.restDaysAfter > 0,
    unfavorableFailsOrMuchSlower_17: unfavorableFailedOrMuchSlower === true,
    longJourneysNotRoutine_17: naturalLongest < 99,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-100KM-JOURNEY-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    site: { tileId: String(site?.tile.id), routeTiles: (site?.route.length ?? 1) - 1, gridDistance: site?.d },
    favorable: {
      reason: favorable.outcome?.outcomeReason, phase: favorable.outcome?.phase,
      journeyDays: favorable.journeyDays, travelDays: favorable.travelDaysSeen,
      longestExpeditionKm: favorable.longestExpeditionKm, kmWalked: favorable.kmWalked,
      provisions: favorable.provisions, restDaysAfter: favorable.restDaysAfter,
      delivered: favorable.outcome?.deliveredHarvestUnits,
    },
    unfavorable: {
      launched: unfavorable.launched, reason: unfavorable.outcome?.outcomeReason,
      phase: unfavorable.outcome?.phase, journeyDays: unfavorable.journeyDays,
    },
    naturalLongestExpeditionKm: naturalLongest,
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
