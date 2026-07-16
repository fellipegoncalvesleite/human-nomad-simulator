// EXPEDITIONARY-3 — dynamic mobility audit.
//
// Proves the four mobility concepts are genuinely SEPARATE and that a descriptive
// average never becomes a movement rule:
//   19.1 average is not a minimum/maximum and does not gate the next day
//   19.2 calendar-day mean != active-day mean when rest days exist
//   19.3 different histories -> bounded, reversible conditioning difference
//   19.4 need raises attempted output but never erases physical limits
//   19.5 rest restores fatigue faster than it changes conditioning
//   19.6 malnutrition lowers capacity via EXISTING nutrition state (no duplicate system)
//   19.9 loaded return is slower than unloaded
//   19.14 bounded state
//   19.15 determinism
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");

  const bandWith = (overrides = {}) => ({
    demography: { workingAdults: 10, dependents: 4, elders: 2, foodPerPersonStress: 0, ...(overrides.demography ?? {}) },
    pressureState: { fatiguePressure: 0, foodStress: 0, ...(overrides.pressureState ?? {}) },
    mobility: overrides.mobility,
  });

  // ── 19.1 / 19.2: an average is a description, not a rule ──────────────────────────
  // A history of rest + short + routine + one long day.
  let state = mob.createEmptyMobilityState();
  const days = [
    { km: 0, loaded: 0, active: false },   // rest
    { km: 3.0, loaded: 0, active: true },  // short
    { km: 7.5, loaded: 2.0, active: true },// routine, part loaded
    { km: 24.0, loaded: 6.0, active: true },// one long day
  ];
  days.forEach((d, i) => {
    state = mob.recordWalkingDay(state, {
      day: i, km: d.km, loadedKm: d.loaded, activeTravel: d.active, source: "expedition_outbound",
    });
  });
  const summary = mob.deriveWalkingSummary(state);
  const meanBetweenExtremes =
    summary.activeDayMeanKm > summary.activeDayMinKm && summary.activeDayMeanKm < summary.activeDayMaxKm;
  const calendarDiffersFromActive =
    summary.restDays > 0 && summary.calendarDayMeanKm < summary.activeDayMeanKm;

  // The mean must NOT gate the next day: capacity is derived without reading history.
  const capacityAfterHistory = mob.deriveMobilityCapacity(bandWith({ mobility: state }));
  const freshState = mob.createEmptyMobilityState();
  const capacityFresh = mob.deriveMobilityCapacity(
    bandWith({ mobility: { ...freshState, conditioning: state.conditioning } }),
  );
  // Same conditioning + same conditions => identical capacity regardless of the history
  // means. i.e. history conditions, it does not permit.
  const historyDoesNotGate =
    capacityAfterHistory.currentKmPerActiveDay === capacityFresh.currentKmPerActiveDay;
  // And the long day (24 km) exceeded the routine mean — an average is not a maximum.
  const averageIsNotAMaximum = summary.activeDayMaxKm > capacityAfterHistory.routineKmPerActiveDay;

  // ── 19.3 / 19.5: conditioning is slow, bounded, reversible ────────────────────────
  let active = mob.createEmptyMobilityState();
  let idle = mob.createEmptyMobilityState();
  for (let i = 0; i < 60; i += 1) {
    active = mob.recordWalkingDay(active, { day: i, km: 8, loadedKm: 2, activeTravel: true, source: "expedition_outbound" });
    idle = mob.recordWalkingDay(idle, { day: i, km: 0, loadedKm: 0, activeTravel: false, source: "expedition_operating" });
  }
  const conditioningDiverges = active.conditioning > idle.conditioning;
  const conditioningBounded = active.conditioning <= 1 && idle.conditioning >= 0;
  // Reversible: the conditioned band deconditions when it stops.
  let reversed = active;
  for (let i = 0; i < 60; i += 1) {
    reversed = mob.recordWalkingDay(reversed, { day: i, km: 0, loadedKm: 0, activeTravel: false, source: "expedition_operating" });
  }
  const conditioningReversible = reversed.conditioning < active.conditioning;
  // Slow: 60 hard days must not produce an elite walker.
  const conditioningIsSlow = active.conditioning - mob.createEmptyMobilityState().conditioning < 0.35;

  // ── 19.4: need raises willingness, not stamina ────────────────────────────────────
  const calm = mob.deriveMobilityCapacity(bandWith({}));
  // Urgency is a per-decision circumstance (the expedition passes it from food stress),
  // so it is supplied explicitly rather than read from stored state.
  const desperate = mob.deriveMobilityCapacity(bandWith({}), { urgency: 1 });
  const overreachExceedsRoutine = desperate.overreachKmPerActiveDay > calm.routineKmPerActiveDay;
  // A desperate but WEAK party still cannot outwalk a fed, conditioned one: need scales
  // real capacity rather than replacing it.
  const desperateWeak = mob.deriveMobilityCapacity(bandWith({
    demography: { foodPerPersonStress: 1 },
    pressureState: { foodStress: 1, fatiguePressure: 0.9 },
  }), { urgency: 1 });
  const strongFed = mob.deriveMobilityCapacity(bandWith({
    mobility: { ...mob.createEmptyMobilityState(), conditioning: 0.9 },
  }));
  const needDoesNotCreateStamina = desperateWeak.overreachKmPerActiveDay < strongFed.currentKmPerActiveDay * 1.6;

  // ── 19.6: malnutrition/fatigue lower capacity through EXISTING state ──────────────
  const hungry = mob.deriveMobilityCapacity(bandWith({ demography: { foodPerPersonStress: 1 } }));
  const tired = mob.deriveMobilityCapacity(bandWith({ pressureState: { fatiguePressure: 1, foodStress: 0 } }));
  const nutritionLowersCapacity = hungry.currentKmPerActiveDay < calm.currentKmPerActiveDay;
  const fatigueLowersCapacity = tired.currentKmPerActiveDay < calm.currentKmPerActiveDay;

  // ── 19.9: loaded return is slower ─────────────────────────────────────────────────
  const unloaded = mob.deriveMobilityCapacity(bandWith({}), { loadRatio: 0 });
  const fullyLoaded = mob.deriveMobilityCapacity(bandWith({ }), { loadRatio: 1 });
  const loadedSlower = fullyLoaded.loadedKmPerActiveDay < unloaded.currentKmPerActiveDay;

  // ── conditioning actually changes capacity (mobility is not static) ───────────────
  const lowCond = mob.deriveMobilityCapacity(bandWith({ mobility: { ...freshState, conditioning: 0 } }));
  const highCond = mob.deriveMobilityCapacity(bandWith({ mobility: { ...freshState, conditioning: 1 } }));
  const conditioningChangesCapacity = highCond.routineKmPerActiveDay > lowCond.routineKmPerActiveDay;

  // ── 19.14 / 19.15: bounded + deterministic in production ──────────────────────────
  let world = runner.initSimWorld({ kind: "map1" }, "mobility-audit");
  world = runner.stepSim(world, 30 * 4, "seasonal");
  const histories = Object.values(world.bands).map((band) => (band.mobility?.history?.recentDays ?? []).length);
  const maxHistory = histories.length === 0 ? 0 : Math.max(...histories);
  const bandsWithRealizedWalking = Object.values(world.bands)
    .filter((band) => (band.mobility?.history?.totalKmWalked ?? 0) > 0).length;
  const productionSummaries = Object.values(world.bands).map((band) => mob.deriveWalkingSummary(band.mobility));

  let repeat = runner.initSimWorld({ kind: "map1" }, "mobility-audit");
  repeat = runner.stepSim(repeat, 30 * 4, "seasonal");
  const fp = (w) => JSON.stringify(Object.values(w.bands).map((b) => [b.mobility?.conditioning, b.mobility?.history?.totalKmWalked]));
  const deterministic = fp(world) === fp(repeat);

  const checks = {
    averageLiesBetweenExtremes_19_1: meanBetweenExtremes,
    averageIsNotAMaximum_19_1: averageIsNotAMaximum,
    historyDoesNotGateNextDay_19_1: historyDoesNotGate,
    calendarDayDiffersFromActiveDay_19_2: calendarDiffersFromActive,
    conditioningDivergesWithHistory_19_3: conditioningDiverges,
    conditioningBounded_19_3: conditioningBounded,
    conditioningReversible_19_3: conditioningReversible,
    conditioningIsSlow_19_3: conditioningIsSlow,
    needRaisesAttemptedOutput_19_4: overreachExceedsRoutine,
    needDoesNotCreateStamina_19_4: needDoesNotCreateStamina,
    nutritionLowersCapacity_19_6: nutritionLowersCapacity,
    fatigueLowersCapacity_19_6: fatigueLowersCapacity,
    loadedReturnIsSlower_19_9: loadedSlower,
    conditioningChangesCapacity: conditioningChangesCapacity,
    walkingHistoryBounded_19_14: maxHistory <= mob.WALKING_HISTORY_DAY_CAP,
    realizedWalkingOccursInProduction: bandsWithRealizedWalking > 0,
    deterministic_19_15: deterministic,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "MOBILITY-CAPACITY-1",
    verdict: pass ? "PASS" : "FAIL",
    architecture: "Option B — mobility-role cohorts. NO sex composition exists in canonical population state, so NO male/female average is derived or displayed.",
    kmPerTile: mob.KM_PER_TILE,
    checks,
    controlledHistorySummary: summary,
    capacitySamples: { calm, hungry, tired, desperate, lowCond, highCond, unloaded, fullyLoaded },
    conditioning: { after60ActiveDays: active.conditioning, after60IdleDays: idle.conditioning, afterReversal: reversed.conditioning },
    production: { bandsWithRealizedWalking, maxHistoryDays: maxHistory, summaries: productionSummaries.slice(0, 3) },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
