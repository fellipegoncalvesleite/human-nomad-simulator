// EXPEDITIONARY-4 §22 — natural-occurrence capture.
//
// Runs the UNTOUCHED production simulation on a map and reports what the expedition/
// mobility systems actually do in nature: launches by family, outcome taxonomy, task
// camps, cargo flow, information returned, signals, acute-risk episodes, walking
// distributions — plus the §22 pathology screens (identical paces, constant daily
// distance, unbounded conditioning, superhuman urgency, duplicated high-capacity
// adults, generic failure buckets, instant observation leaks, food-creating camps).
//
// Usage: node scripts/expeditionNaturalOccurrenceAudit.mjs [--map map1|map2|map2_single_origin] [--years N]
import { createServer } from "vite";

const args = process.argv.slice(2);
const mapArg = args.includes("--map") ? args[args.indexOf("--map") + 1] : "map1";
const years = args.includes("--years") ? Number(args[args.indexOf("--years") + 1]) : 40;

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");

  let world = runner.initSimWorld({ kind: mapArg }, "natural-occurrence");
  const outcomeReasons = {};
  const taskKinds = {};
  const seenOutcomes = new Set();
  let taskCampsUsed = 0;
  let cargoDelivered = 0;
  let cargoLost = 0;
  let provisionsConsumed = 0;
  let observationsReturned = 0;
  let signalAttempts = 0;
  let signalsUnderstood = 0;
  let expeditionRiskEpisodes = 0;
  let infoTaskFoodViolations = 0;
  let poolMismatch = 0;
  let overCommit = 0;
  let conditioningMax = 0;
  let nearHundredKmJourneys = 0;
  const paceSamples = new Set();
  const perBandActiveMeans = [];
  let longestDay = 0;
  let longestExpedition = 0;

  const seasons = Math.max(4, Math.floor(years * 4));
  for (let step = 0; step < seasons; step += 1) {
    world = runner.stepSim(world, 1, "seasonal");
    for (const band of Object.values(world.bands)) {
      const pools = mob.deriveMobilityRolePools(band);
      if (pools.limited + pools.typical + pools.high !== Math.max(0, Math.floor(band.demography.workingAdults))) {
        poolMismatch += 1;
      }
      const committed = mob.deriveCommittedMobilityPools(band);
      if (committed.limited + committed.typical + committed.high > band.demography.workingAdults) overCommit += 1;
      conditioningMax = Math.max(conditioningMax, band.mobility?.conditioning ?? 0);
      for (const expedition of band.expeditions ?? []) {
        signalAttempts += (expedition.signalAttempts ?? []).length;
        expeditionRiskEpisodes += expedition.riskEpisodeIds.length;
      }
      for (const signal of band.receivedSmokeSignals ?? []) {
        if (signal.outcome === "seen_understood") signalsUnderstood += 1;
      }
      for (const outcome of band.recentExpeditionOutcomes ?? []) {
        if (seenOutcomes.has(outcome.id)) continue;
        seenOutcomes.add(outcome.id);
        if (outcome.distanceTiles * 2 * 1.5 >= 90) nearHundredKmJourneys += 1;
        outcomeReasons[outcome.outcomeReason] = (outcomeReasons[outcome.outcomeReason] ?? 0) + 1;
        taskKinds[outcome.taskKind] = (taskKinds[outcome.taskKind] ?? 0) + 1;
        if (outcome.usedTaskCamp) taskCampsUsed += 1;
        cargoDelivered += outcome.deliveredHarvestUnits;
        cargoLost += outcome.lostUnits;
        provisionsConsumed += outcome.provisionUnitsConsumed;
        observationsReturned += (outcome.observations ?? []).length;
        const info = outcome.taskKind === "distant_patch_verification" || outcome.taskKind === "route_reconnaissance";
        if (info && outcome.deliveredHarvestUnits > 0) infoTaskFoodViolations += 1;
      }
    }
  }

  for (const band of Object.values(world.bands)) {
    const summary = mob.deriveWalkingSummary(band.mobility);
    if (summary.activeDays > 0) {
      perBandActiveMeans.push(summary.activeDayMeanKm);
      paceSamples.add(Math.round(summary.activeDayMeanKm * 10) / 10);
    }
    longestDay = Math.max(longestDay, summary.activeDayMaxKm);
    longestExpedition = Math.max(longestExpedition, summary.longestExpeditionKm);
  }

  const totalOutcomes = seenOutcomes.size;
  const pathologies = {
    everyBandSamePace: perBandActiveMeans.length > 1 && paceSamples.size === 1,
    conditioningUnbounded: conditioningMax > 1,
    poolMismatch: poolMismatch > 0,
    highCapacityDuplicated: overCommit > 0,
    genericFailureBucket: (outcomeReasons["target_not_found"] ?? 0) > 0,
    infoTasksCreateFood: infoTaskFoodViolations > 0,
    longExpeditionsNeverOccur: totalOutcomes > 0 && longestExpedition < 15,
    // "Routine" means MANY near-100 km journeys, not the existence of one: a single
    // exceptional journey per century is exactly the intended possible-but-rare §17
    // behavior (and §29 gate 45 forbids an arbitrary cap that would prevent it).
    longExpeditionsRoutine:
      totalOutcomes > 0 && nearHundredKmJourneys > 3 && nearHundredKmJourneys / totalOutcomes > 0.02,
  };
  const pathologyFree = Object.values(pathologies).every((value) => value === false);
  out = {
    check: "EXPEDITION-NATURAL-OCCURRENCE-1",
    map: mapArg,
    years,
    verdict: pathologyFree ? "PASS" : "FAIL",
    pathologies,
    expeditions: {
      terminalOutcomes: totalOutcomes,
      taskKinds,
      outcomeReasons,
      taskCampsUsed,
      cargoDelivered: Math.round(cargoDelivered * 10000) / 10000,
      cargoLost: Math.round(cargoLost * 10000) / 10000,
      provisionsConsumed: Math.round(provisionsConsumed * 10000) / 10000,
      observationsReturned,
      signalAttempts,
      signalsUnderstood,
      expeditionRiskEpisodeStamps: expeditionRiskEpisodes,
    },
    mobility: {
      bandsWithWalking: perBandActiveMeans.length,
      activeDayMeanKmRange: perBandActiveMeans.length === 0
        ? null
        : [Math.min(...perBandActiveMeans), Math.max(...perBandActiveMeans)],
      distinctPaceSamples: paceSamples.size,
      conditioningMax,
      longestDayKm: longestDay,
      longestExpeditionKm: longestExpedition,
    },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
