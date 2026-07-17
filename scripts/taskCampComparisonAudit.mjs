// EXPEDITIONARY-4 §16 — task-camp comparison audit.
//
// The SAME route and task run twice through the production expedition lifecycle:
//   - with a physically feasible task camp (ordinary dry ground);
//   - without one (the only world difference: the stand tile is flood-prone, which
//     plant physics ignores — so the harvest side is identical and every measured
//     difference is the camp's).
// Proves the camp's LEGITIMATE physical value (no nightly shuttle: fewer walked km,
// fewer provisions) and its bounded costs/claims (real establishment cost, owner
// expedition, bounded lifetime + expiry, no food creation, no storage, no territory,
// no residential-position mutation).
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

  let world = runner.initSimWorld({ kind: "map1" }, "task-camp-comparison");
  world = runner.stepSim(world, 4, "seasonal");
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
      presenceConfidence: 0.8, seasonConfidence: 0.7, yieldConfidence: 0.8,
      safetyConfidence: 0.85, processingConfidence: 0.6, accessConfidence: 0.8,
      recoveryConfidence: 0.5,
    },
    seasonality: { bestSeasons: [], badSeasons: [], failedSeasonCount: 0 },
    useHistory: {
      visits: 5, successfulUses: 4, failedUses: 0, lastYieldEstimate: 0.8,
      yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5,
    },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 },
    firstNotedTick: 0, lastNotedTick: tick, reasonIds: [],
  });

  let site;
  for (const tile of Object.values(world.tiles)) {
    const d = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
    if (d < 8 || d > 16 || tile.isAquatic === true) continue;
    if (tile.riskProfile.floodRisk > 0.6) continue; // arm A must be feasible ground
    if (plantPatches.derivePlantPatchesForTile(tile, world.time).length === 0) continue;
    const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 36);
    if (route === undefined || route[route.length - 1] !== tile.id) continue;
    const probe = trips.resolveExpeditionTargetWork(
      world, band, makeMemory(tile), tile.id, d, route, Number(world.time.day ?? 0), "food_resource_check",
      { verifyOnly: true },
    );
    const availability = probe.record.physicalFoodHarvest?.physicalAvailability ?? 0;
    if (probe.record.physicalFoodHarvest?.physicalSourceFound !== true || availability < 0.08) continue;
    if (site === undefined || availability > site.availability) site = { tile, route, availability };
  }

  const runArm = (armWorld) => {
    const armBand = armWorld.bands[bandId];
    const crafted = {
      ...armBand,
      demography: { ...armBand.demography, workingAdults: Math.max(12, armBand.demography.workingAdults) },
      ...(armBand.pressureState === undefined
        ? {}
        : { pressureState: { ...armBand.pressureState, foodStress: 0, fatiguePressure: 0 } }),
      resourceKnowledgeState: { patchMemories: [makeMemory(site.tile)], cap: 48 },
      expeditions: [],
      recentExpeditionOutcomes: [],
      receivedSmokeSignals: [],
    };
    let w = { ...armWorld, bands: { ...armWorld.bands, [bandId]: crafted } };
    const positionBefore = crafted.position;
    const kmBefore = crafted.mobility?.history?.totalKmWalked ?? 0;
    let outcome;
    let sawCamp = false;
    let campRecord;
    let campWhileTerminal = false;
    for (let dayStep = 0; dayStep < 60 && outcome === undefined; dayStep += 1) {
      w = runner.stepSim(w, 1, "daily");
      const b = w.bands[bandId];
      for (const e of b.expeditions ?? []) {
        if (e.taskCamp !== undefined) {
          sawCamp = true;
          campRecord = e.taskCamp;
        }
      }
      outcome = (b.recentExpeditionOutcomes ?? []).find(
        (o) => o.taskKind === "distant_plant_gathering" && o.targetTileId === site.tile.id,
      );
      if (outcome !== undefined && (b.expeditions ?? []).some((e) => e.taskCamp !== undefined)) {
        campWhileTerminal = true;
      }
    }
    const after = w.bands[bandId];
    return {
      outcome,
      sawCamp,
      campRecord,
      campWhileTerminal,
      kmWalked: Math.round(((after.mobility?.history?.totalKmWalked ?? 0) - kmBefore) * 100) / 100,
      residentialMoved: after.position !== positionBefore,
    };
  };

  // Arm A — feasible ground, camp established.
  const withCamp = runArm(world);

  // Arm B — identical world EXCEPT the stand tile is flood-prone (camp infeasible).
  // Plant derivation never reads floodRisk, so the harvest physics are identical.
  const floodedTile = {
    ...site.tile,
    riskProfile: { ...site.tile.riskProfile, floodRisk: 0.9 },
  };
  const worldB = { ...world, tiles: { ...world.tiles, [site.tile.id]: floodedTile } };
  const withoutCamp = runArm(worldB);

  const provisionsCamp = withCamp.outcome?.provisionUnitsConsumed ?? -1;
  const provisionsCampless = withoutCamp.outcome?.provisionUnitsConsumed ?? -1;
  const deliveredCamp = withCamp.outcome?.deliveredHarvestUnits ?? -1;
  const deliveredCampless = withoutCamp.outcome?.deliveredHarvestUnits ?? -1;

  const checks = {
    bothArmsComplete_16: withCamp.outcome !== undefined && withoutCamp.outcome !== undefined,
    campEstablishedOnFeasibleGround_16: withCamp.sawCamp === true && withCamp.outcome?.usedTaskCamp === true,
    noCampOnInfeasibleGround_16: withoutCamp.sawCamp === false && withoutCamp.outcome?.usedTaskCamp === false,
    campSavesNightlyShuttleKm_16: withoutCamp.kmWalked > withCamp.kmWalked,
    campSavesProvisions_16: provisionsCampless > provisionsCamp,
    establishmentCostIsReal_16: provisionsCamp > 0,
    campCreatesNoFood_16:
      deliveredCamp > 0 &&
      deliveredCampless > 0 &&
      deliveredCamp - deliveredCampless <= provisionsCampless - provisionsCamp + 0.0001,
    campHasOwnerAndBoundedLifetime_16:
      withCamp.campRecord !== undefined &&
      Number(withCamp.campRecord.expiresOnDay) > Number(withCamp.campRecord.establishedDay),
    campExpiresWithItsExpedition_16: withCamp.campWhileTerminal === false,
    campClaimsNothing_16:
      withCamp.campRecord?.noStorage === true &&
      withCamp.campRecord?.noTerritoryClaim === true &&
      withCamp.campRecord?.noResidentialRelocation === true,
    noResidentialPositionMutation_16: withCamp.residentialMoved === false && withoutCamp.residentialMoved === false,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "TASK-CAMP-COMPARISON-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    site: { tileId: String(site.tile.id), routeTiles: site.route.length },
    comparison: {
      withCamp: {
        delivered: deliveredCamp, provisions: provisionsCamp,
        kmWalked: withCamp.kmWalked, totalDays: withCamp.outcome?.totalDays, reason: withCamp.outcome?.outcomeReason,
      },
      withoutCamp: {
        delivered: deliveredCampless, provisions: provisionsCampless,
        kmWalked: withoutCamp.kmWalked, totalDays: withoutCamp.outcome?.totalDays, reason: withoutCamp.outcome?.outcomeReason,
      },
    },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
