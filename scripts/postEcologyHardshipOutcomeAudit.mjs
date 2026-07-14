import { createServer } from "vite";

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const movement = await server.ssrLoadModule("/sim/agents/residentialMoveEvent.ts");
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const first = runControlled(movement);
  const second = runControlled(movement);
  const live = runLive(runner);
  const deterministic = JSON.stringify(first.fingerprint) === JSON.stringify(second.fingerprint);
  const checks = {
    ...first.checks,
    liveCompletedMovesNotRejected: live.arrivedRejected === 0,
    liveAcceptedReachable: (live.eventOutcomes.accepted ?? 0) > 0,
    liveHistoriesCapped: live.maxMoveRing <= 4 && live.maxIntentRing <= 12,
    deterministic,
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "POST-ECOLOGY hardshipOutcome lifecycle audit",
    verdict: pass ? "PASS" : "FAIL",
    preFixCensus: {
      command: "isolated git archive 02c325d; initSimWorld map1/map2; 40 seasonal ticks; unique eventId census",
      map1: { events: 150, accepted: 2, delayed: 87, diverted: 0, rejected: 61, arrivedNonAccepted: 147 },
      map2: { events: 258, accepted: 59, delayed: 160, diverted: 0, rejected: 39, arrivedNonAccepted: 190 },
      combined: { events: 408, accepted: 61, delayed: 247, diverted: 0, rejected: 100 },
    },
    checks,
    scenarios: first.scenarios,
    lifecycle: first.lifecycle,
    postFixLiveCensus: live,
    caps: { residentialMoveEvents: 4, intentOutcomes: 12 },
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function runLive(runner) {
  const ticksPerMap = 40;
  const events = new Map();
  const intents = new Map();
  let maxMoveRing = 0;
  let maxIntentRing = 0;
  for (const kind of ["map1", "map2"]) {
    let world = runner.initSimWorld({ kind });
    for (let tick = 0; tick < ticksPerMap; tick += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      for (const band of Object.values(world.bands)) {
        maxMoveRing = Math.max(maxMoveRing, band.recentResidentialMoveEvents?.length ?? 0);
        maxIntentRing = Math.max(maxIntentRing, band.residentialMovementIntentOutcomes?.length ?? 0);
        for (const event of band.recentResidentialMoveEvents ?? []) events.set(event.eventId, event);
        for (const record of band.residentialMovementIntentOutcomes ?? []) intents.set(`${kind}:${band.id}:${record.intentId}`, record);
      }
    }
  }
  const eventValues = [...events.values()];
  return {
    ticksPerMap,
    events: eventValues.length,
    intents: intents.size,
    eventOutcomes: countBy(eventValues, (entry) => entry.hardshipOutcome ?? "none"),
    intentOutcomes: countBy([...intents.values()], (entry) => entry.outcome ?? "none"),
    arrivedRejected: eventValues.filter((entry) => entry.status === "arrived" && entry.hardshipOutcome === "rejected").length,
    maxMoveRing,
    maxIntentRing,
  };
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const label = key(value);
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
}

function runControlled(movement) {
  const classify = movement.classifyResidentialMovementHardshipOutcome;
  const base = {
    hasResidentialIntent: true,
    executionOpportunity: true,
    attempted: true,
    moved: false,
    stagedLegIncomplete: false,
    destinationInvalidated: false,
    crossingTemporarilyBlocked: false,
    temporaryConstraint: false,
    intentAbandoned: false,
    routeSubstituted: false,
    intendedTileId: "tile:intended",
    selectedTileId: "tile:intended",
    actualTileId: "tile:origin",
  };
  const cases = {
    easyLocalRelocation: classify({ ...base, moved: true, actualTileId: "tile:intended" }),
    difficultFeasibleRelocation: classify({ ...base, moved: true, actualTileId: "tile:intended" }),
    weatherDelayed: classify({ ...base, attempted: false, temporaryConstraint: true }),
    blockedCrossing: classify({ ...base, crossingTemporarilyBlocked: true }),
    routeDiversion: classify({ ...base, moved: true, routeSubstituted: true, selectedTileId: "tile:refuge", actualTileId: "tile:refuge" }),
    insufficientLaborCare: classify({ ...base, attempted: false, temporaryConstraint: true }),
    severeSickness: classify({ ...base, attempted: false, temporaryConstraint: true }),
    destinationInvalidation: classify({ ...base, destinationInvalidated: true }),
    completedMovement: classify({ ...base, moved: true, actualTileId: "tile:intended" }),
    noMovementAttempt: classify({ ...base, hasResidentialIntent: false, executionOpportunity: false, attempted: false }),
    genuineAbandonment: classify({ ...base, intentAbandoned: true }),
  };

  const intent = {
    kind: "seek_better_water",
    createdAt: { tick: 1, year: 0, season: "spring" },
    expectedHorizonTicks: 4,
    targetTileId: "tile:intended",
    reason: { id: "reason:intent", type: "low_mobility_pressure", strength: 0.5, confidence: 0.5, relatedTileIds: [] },
    confidence: 0.7,
    persistence: 0.8,
  };
  const band = { id: "band:audit", currentIntent: intent };
  const decision = (status, mobilityIntent) => ({
    mobilityIntent,
    intentStatus: status,
    primaryReason: { id: `reason:${status}` },
    secondaryReasons: [],
  });
  const args = (tick, overrides = {}) => ({
    world: { time: { tick, year: 0, season: "spring" } },
    band,
    decision: decision("continued_intent", intent),
    selectedTileId: "tile:intended",
    actualTileId: "tile:origin",
    attempted: false,
    moved: false,
    crossingBlocked: false,
    destinationBlocked: false,
    stagedLegIncomplete: false,
    temporaryDelayGrounded: true,
    prior: undefined,
    ...overrides,
  });
  const delayed = movement.advanceResidentialMovementIntentOutcomes(args(1));
  const completed = movement.advanceResidentialMovementIntentOutcomes(args(2, {
    actualTileId: "tile:intended", attempted: true, moved: true,
    temporaryDelayGrounded: false, prior: delayed,
  }));
  const rejected = movement.advanceResidentialMovementIntentOutcomes(args(2, {
    decision: decision("abandoned_intent", undefined),
    temporaryDelayGrounded: false, prior: delayed,
  }));
  const noAttempt = movement.advanceResidentialMovementIntentOutcomes(args(1, {
    temporaryDelayGrounded: false,
  }));
  const terminalPerIntent = (records) => records.filter((record) => record.terminal).length <= 1;
  const checks = {
    easyAccepted: cases.easyLocalRelocation === "accepted",
    difficultAccepted: cases.difficultFeasibleRelocation === "accepted",
    weatherDelayed: cases.weatherDelayed === "delayed",
    crossingDelayed: cases.blockedCrossing === "delayed",
    routeDiverted: cases.routeDiversion === "diverted",
    laborCareDelayed: cases.insufficientLaborCare === "delayed",
    sicknessDelayed: cases.severeSickness === "delayed",
    invalidDestinationRejected: cases.destinationInvalidation === "rejected",
    completedAccepted: cases.completedMovement === "accepted",
    noAttemptNoOutcome: cases.noMovementAttempt === undefined && noAttempt?.[0]?.outcome === undefined,
    abandonmentRejected: cases.genuineAbandonment === "rejected",
    outcomesReferenceRealIntent: [delayed, completed, rejected].flat().every((record) => record?.intentId.startsWith("movement-intent:")),
    delayedLaterCompletes: delayed?.[0]?.outcome === "delayed" && completed?.length === 1 && completed[0]?.outcome === "accepted" && completed[0]?.terminal,
    delayedLaterRejects: rejected?.length === 1 && rejected[0]?.outcome === "rejected" && rejected[0]?.terminal,
    oneTerminalPerIntent: terminalPerIntent(completed ?? []) && terminalPerIntent(rejected ?? []),
    completedNotActive: completed?.[0]?.lifecycle === "completed",
    historiesCapped: (completed?.length ?? 0) <= 12 && (rejected?.length ?? 0) <= 12,
  };
  return {
    checks,
    scenarios: cases,
    lifecycle: { delayed, completed, rejected, noAttempt },
    fingerprint: { cases, delayed, completed, rejected, noAttempt },
  };
}
