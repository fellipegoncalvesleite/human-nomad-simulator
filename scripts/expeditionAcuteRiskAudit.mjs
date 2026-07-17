// EXPEDITIONARY-4 §14 — expedition acute-risk audit.
//
// Proves:
//   - an away party's REAL physical exposure (overdue, long legs, heavy load, thin
//     provisions) generates a production acute-risk episode through the CANONICAL
//     authority (applyAcuteRiskToBand), never a parallel expedition-side system;
//   - episodes are deterministic, deduplicated (episode id is the key; a tick is
//     never re-applied; per-expedition cap holds), and carry physical causes;
//   - the episode changes REAL execution: the party's injury load slows its pace,
//     and past 0.5 it abandons cargo and turns for home (injury_forced_return);
//   - deaths never flow through expedition code (no population write exists there);
//   - the same exposure is applied exactly once (re-running the sweep is a no-op).
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const trips = await server.ssrLoadModule("/sim/agents/intraSeasonTrips.ts");
  const acute = await server.ssrLoadModule("/sim/agents/acuteRisk.ts");
  const expedition = await server.ssrLoadModule("/sim/agents/expedition.ts");
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");

  // ── controlled fixture: an away, overdue, heavily loaded, worn-down party ─────────
  let world = runner.initSimWorld({ kind: "map1" }, "expedition-acute-risk");
  world = runner.stepSim(world, 8, "seasonal");
  const bandId = Object.keys(world.bands).sort()[0];
  const band = world.bands[bandId];
  const origin = world.tiles[band.position];
  let targetTile;
  for (const tile of Object.values(world.tiles)) {
    const d = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
    if (d < 8 || d > 12 || tile.isAquatic === true) continue;
    const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 24);
    if (route === undefined || route[route.length - 1] !== tile.id) continue;
    targetTile = { tile, route };
    break;
  }

  const prepared = expedition.createPreparedExpedition({
    band,
    taskKind: "distant_plant_gathering",
    targetTileId: targetTile.tile.id,
    targetPatchId: `${targetTile.tile.id}:generic_plant_food`,
    routeTileIds: targetTile.route,
    partyWorkers: 4,
    day: Number(world.time.day ?? 0),
  });
  const capacity = prepared.cargo.carryCapacityUnits;
  const exposedExpedition = {
    ...prepared,
    phase: "returning",
    routeIndex: Math.max(1, targetTile.route.length - 3),
    positionTileId: targetTile.route[Math.max(1, targetTile.route.length - 3)],
    travelDaysElapsed: 9,
    workDaysElapsed: 3,
    // Overdue: planned window already passed.
    plannedReturnDay: Number(prepared.departedDay) + 6,
    hardDeadlineDay: Number(prepared.departedDay) + 40,
    cargo: {
      ...prepared.cargo,
      harvestUnits: Math.round(capacity * 0.95 * 10000) / 10000,
      provisionUnitsConsumed: 4 * expedition.EXPEDITION_PROVISION_UNITS_PER_WORKER_DAY * 20,
    },
  };
  const craftedBand = {
    ...band,
    ...(band.pressureState === undefined
      ? {}
      : { pressureState: { ...band.pressureState, fatiguePressure: 0.8 } }),
    expeditions: [exposedExpedition],
    acuteRisk: undefined,
  };
  const craftedWorld = { ...world, bands: { ...world.bands, [bandId]: craftedBand } };

  // Canonical authority generates the episode and stamps the party.
  const assessed = acute.applyAcuteRiskToBand(craftedWorld, craftedBand);
  const episodes = (assessed.acuteRisk?.recentEpisodes ?? []).filter(
    (episode) => episode.context.sourceCategory === "expedition_exposure",
  );
  const episode = episodes[0];
  const stamped = (assessed.expeditions ?? [])[0];
  const episodeGenerated = episode !== undefined;
  const episodeHasPhysicalCauses =
    episode !== undefined &&
    episode.groundedReasons.length > 0 &&
    episode.contributingFactors.some((f) => f.startsWith("daysOut=")) &&
    episode.context.sourceTraceId === exposedExpedition.id;
  const partyStamped =
    stamped !== undefined &&
    stamped.injuryLoad > 0 &&
    episode !== undefined &&
    stamped.riskEpisodeIds.includes(episode.id);

  // Exactly-once: the sweep re-run on the SAME tick must change nothing.
  const reassessed = acute.applyAcuteRiskToBand(craftedWorld, assessed);
  const sameTickNoOp = JSON.stringify(reassessed) === JSON.stringify(assessed);

  // Determinism: fresh identical inputs → identical episode ids.
  const assessedAgain = acute.applyAcuteRiskToBand(craftedWorld, craftedBand);
  const deterministicIds =
    JSON.stringify((assessedAgain.acuteRisk?.recentEpisodes ?? []).map((e) => e.id)) ===
    JSON.stringify((assessed.acuteRisk?.recentEpisodes ?? []).map((e) => e.id));

  // ── consequence: injury slows real pace and forces return + cargo abandonment ─────
  const healthyPace = mob.deriveTravelPace(band, "resource_expedition");
  const injuredPace = mob.deriveTravelPace(band, "delayed_or_injured_party", { injuryLoad: 0.6 });
  const injurySlowsPace = injuredPace.kmPerTravelDay < healthyPace.kmPerTravelDay;

  const badlyHurt = {
    ...exposedExpedition,
    phase: "operating",
    routeIndex: targetTile.route.length - 1,
    positionTileId: targetTile.route[targetTile.route.length - 1],
    injuryLoad: 0.6,
    plannedReturnDay: Number(prepared.departedDay) + 40,
  };
  const hurtWorld = {
    ...craftedWorld,
    bands: { ...craftedWorld.bands, [bandId]: { ...craftedBand, expeditions: [badlyHurt] } },
  };
  const afterDay = expedition.expeditionDailyAction.apply(hurtWorld, Number(world.time.day ?? 0) + 1);
  const hurtAfter = (afterDay.bands[bandId].expeditions ?? [])[0];
  const forcedReturn =
    hurtAfter !== undefined &&
    hurtAfter.phase === "returning" &&
    hurtAfter.outcomeReason === "injury_forced_return";
  const cargoAbandoned = hurtAfter !== undefined && hurtAfter.cargo.lostUnits > badlyHurt.cargo.lostUnits;

  // ── no direct population writes in expedition code ─────────────────────────────────
  const expeditionSrc = readFileSync(`${ROOT}/src/sim/agents/expedition.ts`, "utf8");
  const noPopulationWrites = !/population\s*:/.test(expeditionSrc) && !/demography\s*:/.test(expeditionSrc);

  // ── natural occurrence over 40y (informational + capped) ──────────────────────────
  let natural = runner.initSimWorld({ kind: "map1" }, "expedition-acute-natural");
  let naturalExpeditionEpisodes = 0;
  let perExpeditionCapOk = true;
  for (let step = 0; step < 40 * 4; step += 1) {
    natural = runner.stepSim(natural, 1, "seasonal");
    for (const b of Object.values(natural.bands)) {
      for (const e of b.acuteRisk?.recentEpisodes ?? []) {
        if (e.context.sourceCategory === "expedition_exposure") naturalExpeditionEpisodes += 1;
      }
      for (const exp of b.expeditions ?? []) {
        if (exp.riskEpisodeIds.length > 3) perExpeditionCapOk = false;
      }
    }
  }

  const checks = {
    expeditionExposureGeneratesEpisode_14: episodeGenerated,
    episodeHasPhysicalCauses_14: episodeHasPhysicalCauses,
    episodeStampsItsParty_14: partyStamped,
    sameExposureAppliedOnce_14: sameTickNoOp,
    deterministicEpisodeIds_14: deterministicIds,
    injurySlowsRealPace_14: injurySlowsPace,
    severeInjuryForcesReturn_14: forcedReturn,
    injuredPartyAbandonsCargo_14: cargoAbandoned,
    deathsNeverWrittenByExpeditionCode_14: noPopulationWrites,
    perExpeditionEpisodeCapHolds_14: perExpeditionCapOk,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-ACUTE-RISK-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    controlled: {
      episodeId: episode?.id, severity: episode?.severity,
      injuryLoadAfter: stamped?.injuryLoad, riskEpisodeIds: stamped?.riskEpisodeIds,
      healthyKmPerDay: healthyPace.kmPerTravelDay, injuredKmPerDay: injuredPace.kmPerTravelDay,
      forcedReturnReason: hurtAfter?.outcomeReason, lostUnitsAfter: hurtAfter?.cargo.lostUnits,
    },
    natural: { expeditionEpisodeSightings: naturalExpeditionEpisodes },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
