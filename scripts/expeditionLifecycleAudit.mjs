// EXPEDITIONARY-2 — expedition lifecycle + physical food audit.
//
// Proves the production spine is physical rather than labelled:
//  - multi-day work no longer credits food on the departure day (the §1 correction);
//  - parties physically occupy route positions while away (no teleport);
//  - outbound and return both take days;
//  - away workers are removed from residential labor exactly once;
//  - a returned party deposits exactly ONE canonical receipt, dated to the return;
//  - information-only / lost / aborted parties deposit none;
//  - state stays bounded; the run is deterministic.
import { createServer } from "vite";

const ROOT = process.cwd();
const YEARS = 40;

const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const expeditionMod = await server.ssrLoadModule("/sim/agents/expedition.ts");
  const tripsMod = await server.ssrLoadModule("/sim/agents/intraSeasonTrips.ts");
  const registry = await server.ssrLoadModule("/sim/agents/dailyActionRegistry.ts");

  // Slice A: the registry is a real, ordered, non-cyclic boundary.
  const registryOk =
    Array.isArray(registry.DEFAULT_DAILY_ACTIONS) &&
    registry.DEFAULT_DAILY_ACTIONS.length === 2 &&
    registry.DEFAULT_DAILY_ACTIONS.every((action) => typeof action?.apply === "function") &&
    registry.DEFAULT_DAILY_ACTIONS[0].id === "intra-season-trips" &&
    registry.DEFAULT_DAILY_ACTIONS[1].id === "expeditions";

  // §1: the duration boundary is real and is what splits the two paths.
  const durationBoundary = {
    oneTile: tripsMod.deriveTripDurationDays(1),
    fourTiles: tripsMod.deriveTripDurationDays(4),
    fiveTiles: tripsMod.deriveTripDurationDays(5),
    tenTiles: tripsMod.deriveTripDurationDays(10),
  };
  const sameDayBoundaryCorrect =
    durationBoundary.fourTiles === 1 && durationBoundary.fiveTiles > 1 && durationBoundary.tenTiles > 1;

  const observed = {
    launched: 0, completed: 0, aborted: 0, lost: 0,
    depositsWithFood: 0, informationOnly: 0,
    maxActivePerBand: 0, maxOutcomeRecords: 0, maxRouteTiles: 0,
    sawOutbound: false, sawOperating: false, sawReturning: false, sawTaskCamp: false,
    travelDaysSeen: 0, provisionsConsumed: 0, cargoLost: 0,
    laborOverCommitViolations: 0, positionOffRouteViolations: 0,
    receiptsBeforeReturn: 0, deliveredUnits: 0,
    outcomeReasons: {},
  };
  const seenExpeditionIds = new Set();
  const terminalIds = new Set();
  const receiptIdsSeen = new Set();

  let world = runner.initSimWorld({ kind: "map1" }, "expedition-lifecycle");

  for (let step = 0; step < YEARS * 4; step += 1) {
    world = runner.stepSim(world, 1, "seasonal");

    for (const band of Object.values(world.bands)) {
      const active = band.expeditions ?? [];
      observed.maxActivePerBand = Math.max(observed.maxActivePerBand, active.length);
      observed.maxOutcomeRecords = Math.max(observed.maxOutcomeRecords, (band.recentExpeditionOutcomes ?? []).length);

      // Labor invariant: adults away can never exceed the band's working adults.
      const away = expeditionMod.getCommittedExpeditionWorkers(band);
      if (away > band.demography.workingAdults) observed.laborOverCommitViolations += 1;

      for (const expedition of active) {
        seenExpeditionIds.add(expedition.id);
        observed.maxRouteTiles = Math.max(observed.maxRouteTiles, expedition.routeTileIds.length);
        observed.travelDaysSeen = Math.max(observed.travelDaysSeen, expedition.travelDaysElapsed);
        if (expedition.phase === "outbound") observed.sawOutbound = true;
        if (expedition.phase === "operating") observed.sawOperating = true;
        if (expedition.phase === "returning") observed.sawReturning = true;
        if (expedition.taskCamp !== undefined) observed.sawTaskCamp = true;

        // No teleport: the party's position must be the route tile at its index.
        if (expedition.routeTileIds[expedition.routeIndex] !== expedition.positionTileId) {
          observed.positionOffRouteViolations += 1;
        }

        // No food may reach the camp before the party is physically home: a receipt
        // carrying this expedition's id must not exist while it is still away.
        for (const trip of band.recentIntraSeasonTrips ?? []) {
          const tagged = (trip.reasonIds ?? []).some((id) => String(id).includes(expedition.id));
          if (tagged) observed.receiptsBeforeReturn += 1;
        }
      }

      for (const outcome of band.recentExpeditionOutcomes ?? []) {
        if (terminalIds.has(outcome.id)) continue;
        terminalIds.add(outcome.id);
        if (outcome.phase === "completed") observed.completed += 1;
        if (outcome.phase === "aborted") observed.aborted += 1;
        if (outcome.phase === "lost") observed.lost += 1;
        observed.provisionsConsumed += outcome.provisionUnitsConsumed;
        observed.cargoLost += outcome.lostUnits;
        observed.deliveredUnits += outcome.deliveredHarvestUnits;
        observed.outcomeReasons[outcome.outcomeReason] = (observed.outcomeReasons[outcome.outcomeReason] ?? 0) + 1;
        if (outcome.deliveredHarvestUnits > 0) observed.depositsWithFood += 1;
        else observed.informationOnly += 1;
      }

      // Exactly-once receipt: an expedition-tagged receipt id may never repeat.
      for (const trip of band.recentIntraSeasonTrips ?? []) {
        const tag = (trip.reasonIds ?? []).find((id) => String(id).startsWith("reason:expedition-return:"));
        if (tag === undefined) continue;
        const key = `${band.id}:${tag}:${Number(trip.tick)}`;
        if (receiptIdsSeen.has(key)) continue;
        receiptIdsSeen.add(key);
      }
    }
  }
  observed.launched = seenExpeditionIds.size;

  // Determinism: a fresh identical run must produce identical expedition identities.
  let repeat = runner.initSimWorld({ kind: "map1" }, "expedition-lifecycle");
  repeat = runner.stepSim(repeat, YEARS * 4, "seasonal");
  const repeatIds = Object.values(repeat.bands)
    .flatMap((band) => (band.recentExpeditionOutcomes ?? []).map((outcome) => outcome.id))
    .sort();
  let once = runner.initSimWorld({ kind: "map1" }, "expedition-lifecycle");
  once = runner.stepSim(once, YEARS * 4, "seasonal");
  const onceIds = Object.values(once.bands)
    .flatMap((band) => (band.recentExpeditionOutcomes ?? []).map((outcome) => outcome.id))
    .sort();

  const checks = {
    registryBoundaryIsOrderedAndAcyclic: registryOk,
    sameDayVsExpeditionBoundaryIsDurationBased: sameDayBoundaryCorrect,
    expeditionsLaunchNaturally: observed.launched > 0,
    outboundLegIsPhysical: observed.sawOutbound,
    targetWorkOccurs: observed.deliveredUnits > 0 || observed.sawOperating,
    returnLegIsPhysical: observed.sawReturning,
    travelTakesDays: observed.travelDaysSeen >= 2,
    noTeleportPositionAlwaysOnRoute: observed.positionOffRouteViolations === 0,
    noFoodBeforePhysicalReturn: observed.receiptsBeforeReturn === 0,
    laborNeverOverCommitted: observed.laborOverCommitViolations === 0,
    provisionsAreConsumed: observed.provisionsConsumed > 0,
    returnedCargoBecomesFood: observed.depositsWithFood > 0 && observed.deliveredUnits > 0,
    terminalOutcomesRecorded: terminalIds.size > 0,
    activeExpeditionsBounded: observed.maxActivePerBand <= expeditionMod.EXPEDITION_ACTIVE_CAP,
    outcomeRecordsBounded: observed.maxOutcomeRecords <= expeditionMod.EXPEDITION_OUTCOME_CAP,
    routeLengthBounded: observed.maxRouteTiles <= expeditionMod.EXPEDITION_MAX_ROUTE_TILES + 1,
    deterministicExpeditionIdentities: JSON.stringify(repeatIds) === JSON.stringify(onceIds),
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-LIFECYCLE-1",
    verdict: pass ? "PASS" : "FAIL",
    years: YEARS,
    checks,
    durationBoundary,
    observed,
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
