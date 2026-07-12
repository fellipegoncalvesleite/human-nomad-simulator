import { createServer } from "vite";

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const time = await server.ssrLoadModule("/sim/tick/time.ts");
  const chronicle = await server.ssrLoadModule("/sim/agents/bandChronicle.ts");
  const ui = await server.ssrLoadModule("/ui/bandSummary.ts");
  const first = run(runner, time, chronicle, ui, false);
  const second = run(runner, time, chronicle, ui, false);
  const observed = run(runner, time, chronicle, ui, true);
  const checks = {
    ...first.checks,
    deterministic: JSON.stringify(first.fingerprint) === JSON.stringify(second.fingerprint),
    observerParity: JSON.stringify(first.fingerprint) === JSON.stringify(observed.fingerprint),
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "POST-ECOLOGY terminal extinction / zombie-band audit",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    extinction: first.extinction,
    postExtinction: first.postExtinction,
    demographicReconciliation: first.demographicReconciliation,
    minimalPositiveControl: first.minimalPositiveControl,
    ui: first.ui,
    ecology: first.ecology,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function run(runner, time, chronicle, ui, withObserver) {
  const initial = makeControlledWorld(runner, time, true);
  const bandId = Object.keys(initial.bands)[0];
  const beforeBand = initial.bands[bandId];
  const startPopulation = beforeBand.demography.population;
  let world = runner.stepSim(initial, 1, "seasonal", withObserver ? () => undefined : undefined);
  const extinctAt = world.bands[bandId];
  const extinctionTick = Number(extinctAt.viability?.terminalSnapshot?.tick ?? -1);
  const churn = extinctAt.demography.demographicChurn?.records.at(-1);
  const terminalTraceCount = extinctAt.causalTraces.filter((trace) => trace.kind === "band_extinct").length;
  const frozenSnapshot = JSON.stringify(extinctAt);
  const countersAtExtinction = counters(world, extinctAt);
  const depletionBefore = 0.8;
  world = { ...world, tileDepletion: { ...(world.tileDepletion ?? {}), [extinctAt.position]: depletionBefore } };
  const archivedChronicleAtExtinction = chronicle.deriveBandChronicle(world, extinctAt);
  for (let i = 0; i < 12; i += 1) {
    world = runner.stepSim(world, 1, "seasonal", withObserver ? () => undefined : undefined);
  }
  const after = world.bands[bandId];
  const countersAfter = counters(world, after);
  const stableBandSnapshot = JSON.stringify(after) === frozenSnapshot;
  const archivedChronicleAfter = chronicle.deriveBandChronicle(world, after);
  const positiveInitial = makeControlledWorld(runner, time, false);
  const positiveId = Object.keys(positiveInitial.bands)[0];
  const positiveBefore = positiveInitial.bands[positiveId];
  const positiveWorld = runner.stepSim(positiveInitial, 1, "seasonal", withObserver ? () => undefined : undefined);
  const positiveAfter = positiveWorld.bands[positiveId];
  const accountingEnd = startPopulation + (churn?.births ?? 0) -
    (churn?.elderDeaths ?? 0) - (churn?.dependentDeaths ?? 0) - (churn?.adultDeaths ?? 0);
  const status = ui.deriveBandStatus(after);
  const doing = ui.deriveDoingNow(after);
  const condition = ui.deriveCondition(after);
  const terminalYear = after.viability?.terminalSnapshot?.year;
  const checks = {
    groundedDemographicZero: startPopulation === 1 && (churn?.deaths ?? 0) === 1 && after.demography.population === 0,
    demographicReconciles: accountingEnd === after.demography.population && (churn?.deaths ?? 0) ===
      (churn?.elderDeaths ?? 0) + (churn?.dependentDeaths ?? 0) + (churn?.adultDeaths ?? 0),
    lifecycleTerminal: after.viability?.status === "extinct" && after.status === "dispersed" && after.size === 0,
    exactExtinctionTickRecorded: extinctionTick === 4 && after.viability?.terminalSnapshot?.season === "spring",
    populationRemainsZero: after.demography.population === 0,
    terminalTraceExactlyOnce: terminalTraceCount === 1 && after.causalTraces.filter((trace) => trace.kind === "band_extinct").length === 1,
    bandStateFrozen: stableBandSnapshot,
    decisionsFrozen: countersAfter.decisionHistory === countersAtExtinction.decisionHistory && countersAfter.archiveDecisions === countersAtExtinction.archiveDecisions,
    tripsFrozen: countersAfter.trips === countersAtExtinction.trips,
    nutritionFrozen: countersAfter.foodSamples === countersAtExtinction.foodSamples,
    demographicAccumulatorsFrozen: after.demography.growthAccumulator === 0 && after.demography.mortalityAccumulator === 0,
    animalManagementFrozen: countersAfter.animalState === countersAtExtinction.animalState,
    ideasExperimentsFrozen: countersAfter.practicalState === countersAtExtinction.practicalState,
    observationsFrozen: countersAfter.observations === countersAtExtinction.observations,
    chronicleReadable: archivedChronicleAfter !== undefined && after.deepHistory?.terminalRecord !== undefined,
    chronicleTerminalYearFrozen: terminalYear !== undefined && archivedChronicleAtExtinction.currentEra === archivedChronicleAfter.currentEra,
    uiTerminal: status.tone === "gone" && doing === "Extinct — archival record" && condition.viabilityLabel === "Died out",
    ecologyRecovers: (world.tileDepletion?.[after.position] ?? 0) < depletionBefore,
    minimalPositiveNotFrozen: positiveAfter.demography.population > 0 && positiveAfter.viability?.status !== "extinct" &&
      positiveAfter.decisionHistory.length > positiveBefore.decisionHistory.length,
  };
  return {
    checks,
    extinction: {
      bandId, tick: extinctionTick, terminalSnapshot: after.viability?.terminalSnapshot,
      terminalTraceCount: after.causalTraces.filter((trace) => trace.kind === "band_extinct").length,
    },
    postExtinction: { seasonsAdvanced: 12, before: countersAtExtinction, after: countersAfter },
    demographicReconciliation: {
      startingPopulation: startPopulation,
      births: churn?.births ?? 0,
      elderDeaths: churn?.elderDeaths ?? 0,
      dependentDeaths: churn?.dependentDeaths ?? 0,
      adultDeaths: churn?.adultDeaths ?? 0,
      endingPopulation: after.demography.population,
      causalAttributionNonAdditive: {
        crisis: churn?.crisisDeaths ?? 0,
        water: churn?.waterStressDeaths ?? 0,
        food: churn?.starvationDeaths ?? 0,
        migration: churn?.migrationHardshipDeaths ?? 0,
      },
    },
    minimalPositiveControl: {
      startingPopulation: positiveBefore.demography.population,
      endingPopulation: positiveAfter.demography.population,
      viability: positiveAfter.viability?.status,
      decisionsBefore: positiveBefore.decisionHistory.length,
      decisionsAfter: positiveAfter.decisionHistory.length,
    },
    ui: { status, doing, condition, currentEraAtExtinction: archivedChronicleAtExtinction.currentEra, currentEraAfter: archivedChronicleAfter.currentEra },
    ecology: { depletionBefore, depletionAfter: world.tileDepletion?.[after.position] ?? 0 },
    fingerprint: {
      terminal: after.viability?.terminalSnapshot,
      countersAfter,
      currentEra: archivedChronicleAfter.currentEra,
      depletion: world.tileDepletion?.[after.position] ?? 0,
      positive: { population: positiveAfter.demography.population, viability: positiveAfter.viability?.status },
    },
  };
}

function makeControlledWorld(runner, time, lethal) {
  const base = runner.stepSim(runner.initSimWorld({ kind: "map1" }), 1, "seasonal");
  const source = Object.values(base.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  const controlled = {
    ...source,
    size: 1,
    status: "foraging",
    demography: {
      ...source.demography,
      population: 1,
      dependents: 0,
      workingAdults: 1,
      elders: 0,
      householdCount: 1,
      growthAccumulator: 0,
      mortalityAccumulator: lethal ? 1.1 : 0,
      splitPressure: 0,
    },
    pressureState: {
      ...source.pressureState,
      foodStress: lethal ? 0.9 : 0,
      waterStress: lethal ? 0.9 : 0,
      riskPressure: lethal ? 0.8 : 0,
      fatiguePressure: lethal ? 0.8 : 0,
      netMovePressure: lethal ? 0.9 : 0,
    },
    viability: { ...source.viability, status: "viable", population: 1, reasonIds: source.viability?.reasonIds ?? [] },
  };
  return {
    ...base,
    time: time.getWorldTimeForTick(3),
    bands: { [controlled.id]: controlled },
    decisions: {},
    decisionArchive: { ...base.decisionArchive, totalDecisions: 0, recentDecisionIds: [] },
  };
}

function counters(world, band) {
  return {
    decisionHistory: band.decisionHistory.length,
    archiveDecisions: world.decisionArchive.totalDecisions,
    trips: band.recentIntraSeasonTrips?.length ?? 0,
    foodSamples: band.humanFoodLedger?.samples?.length ?? band.seasonalSupport?.samples?.length ?? 0,
    animalState: JSON.stringify({ knowledge: band.animalPatternKnowledge, management: band.animalManagement }),
    practicalState: JSON.stringify({ problems: band.practicalAdaptation?.problems, ideas: band.practicalAdaptation?.ideas, experiments: band.practicalAdaptation?.experiments }),
    observations: Object.keys(band.knowledge.observedTiles).length,
  };
}
