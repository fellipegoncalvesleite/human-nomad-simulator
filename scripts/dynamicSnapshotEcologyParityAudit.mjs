import { createServer } from "vite";
import { createHash } from "node:crypto";

const server = await createServer({
  root: `${process.cwd()}/src`,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const first = runRoundTrip(runner);
  const second = runRoundTrip(runner);
  const checks = {
    ...first.checks,
    deterministic: first.fingerprint === second.fingerprint,
  };
  const pass = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    check: "DYNAMIC-SNAPSHOT living-ecology roundtrip parity",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    stateCounts: first.stateCounts,
    fingerprint: first.fingerprint,
  }, null, 2));

  if (!pass) {
    process.exitCode = 1;
  }
} finally {
  await server.close();
}

function runRoundTrip(runner) {
  const staticWorld = runner.initSimWorld({ kind: "map1" }, "dynamic-snapshot-ecology-parity");
  const advancedWorld = runner.stepSim(staticWorld, 1, "seasonal");
  const snapshot = runner.takeDynamicSnapshot(advancedWorld);
  const roundTripped = runner.mergeDynamicSnapshot(staticWorld, snapshot);
  const plantState = advancedWorld.plantPatchState ?? {};
  const forestState = advancedWorld.forestPatchState ?? {};
  const stateCounts = {
    plantPatchState: Object.keys(plantState).length,
    forestPatchState: Object.keys(forestState).length,
    faunaStocks: Object.keys(advancedWorld.faunaStocks ?? {}).length,
    tileDepletion: Object.keys(advancedWorld.tileDepletion ?? {}).length,
  };
  const stateJson = JSON.stringify({
    tick: Number(roundTripped.time.tick),
    plantPatchState: roundTripped.plantPatchState,
    forestPatchState: roundTripped.forestPatchState,
    faunaStocks: roundTripped.faunaStocks,
    tileDepletion: roundTripped.tileDepletion,
  });
  const fingerprint = createHash("sha256").update(stateJson).digest("hex");

  return {
    checks: {
      realPlantStateExercised: stateCounts.plantPatchState > 0,
      realForestStateExercised: stateCounts.forestPatchState > 0,
      snapshotCarriesPlantState: Object.hasOwn(snapshot, "plantPatchState"),
      snapshotCarriesForestState: Object.hasOwn(snapshot, "forestPatchState"),
      plantRoundtripExact: JSON.stringify(roundTripped.plantPatchState) === JSON.stringify(plantState),
      forestRoundtripExact: JSON.stringify(roundTripped.forestPatchState) === JSON.stringify(forestState),
      existingFaunaRoundtripExact:
        JSON.stringify(roundTripped.faunaStocks) === JSON.stringify(advancedWorld.faunaStocks),
      existingDepletionRoundtripExact:
        JSON.stringify(roundTripped.tileDepletion) === JSON.stringify(advancedWorld.tileDepletion),
      staticTilesPreserved: roundTripped.tiles === staticWorld.tiles,
      sourceWorldUnchanged:
        staticWorld.plantPatchState === undefined && staticWorld.forestPatchState === undefined,
    },
    stateCounts,
    fingerprint,
  };
}
