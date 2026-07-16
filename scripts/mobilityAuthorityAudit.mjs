// EXPEDITIONARY-4 §6/§7/§8 — canonical mobility authority audit.
//
// Proves:
//   §6  every relevant travel mode derives pace from ONE boundary (bandMobility):
//       expedition.ts / residentialMoveEvent.ts / migrationWalk.ts consume it and no
//       longer carry private tiles-per-day constants;
//   §7  a whole-band residential column is physically slower and more constrained than
//       a selected adult party over the same route (dependents/elders/possessions),
//       and emergency overreach helps but never turns the column into a scout party;
//   §8  mobility-role pools are conserved against working adults (no phantom adults),
//       high-capacity adults cannot be double-committed, exhaustion of the high pool
//       physically slows the next party, and insufficient labor blocks selection.
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");

  // ── §6 import/use boundary (source-level, like adaptationBoundaryAudit) ───────────
  const src = (path) => readFileSync(`${ROOT}/src/sim/agents/${path}`, "utf8");
  const expeditionSrc = src("expedition.ts");
  const residentialSrc = src("residentialMoveEvent.ts");
  const walkSrc = src("migrationWalk.ts");
  const consumersImportAuthority =
    expeditionSrc.includes('from "./bandMobility"') &&
    residentialSrc.includes('from "./bandMobility"') &&
    walkSrc.includes('from "./bandMobility"');
  // The old private residential pace constants must be gone.
  const noPrivateResidentialPace = !/moveKind === "emergency_water_move" \? 2 :/.test(residentialSrc);

  // ── fixtures ───────────────────────────────────────────────────────────────────────
  const bandWith = (overrides = {}) => ({
    demography: {
      population: 26, workingAdults: 12, dependents: 10, elders: 4,
      foodPerPersonStress: 0, ...(overrides.demography ?? {}),
    },
    pressureState: { fatiguePressure: 0, foodStress: 0, ...(overrides.pressureState ?? {}) },
    bodyCampLogistics: overrides.bodyCampLogistics,
    mobility: overrides.mobility,
    expeditions: overrides.expeditions ?? [],
  });
  const band = bandWith({});

  // ── §7 residential column vs selected party over the same route ───────────────────
  const party = mob.deriveTravelPace(band, "resource_expedition");
  const column = mob.deriveTravelPace(band, "whole_band_residential_move");
  const emergencyColumn = mob.deriveTravelPace(band, "emergency_residential_move", { urgency: 1 });
  const recon = mob.deriveTravelPace(band, "selected_reconnaissance_party", { urgency: 0.6 });
  const loaded = mob.deriveTravelPace(band, "loaded_return_party", { loadRatio: 1 });
  const injured = mob.deriveTravelPace(band, "delayed_or_injured_party", { injuryLoad: 0.6 });
  const routeTiles = 12;
  const partyDays = Math.ceil(routeTiles / party.tilesPerTravelDay);
  const columnDays = Math.ceil(routeTiles / column.tilesPerTravelDay);
  // More dependents/elders → slower column; a lean band's column is quicker.
  const leanColumn = mob.deriveTravelPace(
    bandWith({ demography: { population: 14, workingAdults: 12, dependents: 1, elders: 1 } }),
    "whole_band_residential_move",
  );
  const burdenedColumn = mob.deriveTravelPace(
    bandWith({ demography: { population: 34, workingAdults: 12, dependents: 16, elders: 6 } }),
    "whole_band_residential_move",
  );

  // ── §8 pool conservation across a deterministic sweep ─────────────────────────────
  let conserved = true;
  let gradualShift = true;
  for (let adults = 0; adults <= 40; adults += 1) {
    for (const fatigue of [0, 0.3, 0.7, 1]) {
      const pools = mob.deriveMobilityRolePools(bandWith({
        demography: { workingAdults: adults },
        pressureState: { fatiguePressure: fatigue, foodStress: 0 },
      }));
      if (pools.limited + pools.typical + pools.high !== adults) conserved = false;
      if (pools.limited < 0 || pools.typical < 0 || pools.high < 0) conserved = false;
    }
  }
  // Fatigue moves adults toward the limited pool (gradual role movement, no castes).
  const rested = mob.deriveMobilityRolePools(bandWith({ demography: { workingAdults: 20 } }));
  const exhausted = mob.deriveMobilityRolePools(bandWith({
    demography: { workingAdults: 20 }, pressureState: { fatiguePressure: 1, foodStress: 0 },
  }));
  gradualShift = exhausted.limited > rested.limited && exhausted.high <= rested.high;

  // ── §8 non-reuse: committed adults are unavailable, high pool exhausts ─────────────
  const pools20 = mob.deriveMobilityRolePools(bandWith({ demography: { workingAdults: 20 } }));
  const fastParty = mob.selectPartyComposition(pools20, pools20.high + 1, "fast");
  const awayBand = bandWith({
    demography: { workingAdults: 20 },
    expeditions: [{ phase: "outbound", partyWorkers: pools20.high + 1, partyComposition: fastParty }],
  });
  const availableAfterFast = mob.deriveAvailableMobilityPools(awayBand);
  const highPoolExhausted = availableAfterFast.high === 0;
  const availabilityReconciles =
    availableAfterFast.limited + availableAfterFast.typical + availableAfterFast.high ===
    20 - (pools20.high + 1);
  // The next fast party physically gets NO high-capacity adults → it is slower.
  const secondFast = mob.selectPartyComposition(availableAfterFast, 4, "fast");
  const firstFactor = mob.derivePartyPaceFactor(fastParty);
  const secondFactor = mob.derivePartyPaceFactor(secondFast);
  const exhaustionSlowsNextParty = secondFast !== undefined && secondFactor < firstFactor;
  // Asking for more than is physically present is blocked (insufficient labor).
  const overAsk = mob.selectPartyComposition(availableAfterFast, 100, "fast");
  // Balanced selection preserves the scarce high pool when typical suffices.
  const balanced = mob.selectPartyComposition(pools20, Math.min(4, pools20.typical), "balanced");

  // ── production: pools reconcile for every band over 30y; commitments never exceed ──
  let world = runner.initSimWorld({ kind: "map1" }, "mobility-authority-audit");
  let productionReconciles = true;
  let productionOverCommit = false;
  for (let step = 0; step < 30 * 4; step += 1) {
    world = runner.stepSim(world, 1, "seasonal");
    for (const b of Object.values(world.bands)) {
      const pools = mob.deriveMobilityRolePools(b);
      if (pools.limited + pools.typical + pools.high !== Math.max(0, Math.floor(b.demography.workingAdults))) {
        productionReconciles = false;
      }
      const committed = mob.deriveCommittedMobilityPools(b);
      const total = committed.limited + committed.typical + committed.high;
      if (total > b.demography.workingAdults) productionOverCommit = true;
      const available = mob.deriveAvailableMobilityPools(b);
      if (available.limited < 0 || available.typical < 0 || available.high < 0) productionOverCommit = true;
    }
  }

  const checks = {
    consumersImportAuthority_6: consumersImportAuthority,
    noPrivateResidentialPaceConstants_6: noPrivateResidentialPace,
    residentialSlowerThanSelectedParty_7: column.kmPerTravelDay < party.kmPerTravelDay,
    residentialTakesMoreDaysSameRoute_7: columnDays > partyDays,
    dependentsSlowTheColumn_7: burdenedColumn.kmPerTravelDay < leanColumn.kmPerTravelDay,
    emergencyOverreachHelpsButBounded_7:
      emergencyColumn.kmPerTravelDay > column.kmPerTravelDay &&
      emergencyColumn.kmPerTravelDay < party.kmPerTravelDay,
    reconFasterThanLoaded_6: recon.kmPerTravelDay > loaded.kmPerTravelDay,
    injuredSlowerThanParty_6: injured.kmPerTravelDay < party.kmPerTravelDay,
    poolsConservedSweep_8: conserved,
    fatigueShiftsRolesGradually_8: gradualShift,
    highPoolExhaustsUnderCommitment_8: highPoolExhausted,
    availabilityReconciles_8: availabilityReconciles,
    exhaustionSlowsNextParty_8: exhaustionSlowsNextParty,
    overAskBlocked_8: overAsk === undefined,
    balancedPreservesHighPool_8: balanced !== undefined && balanced.high === 0,
    productionPoolsReconcile_8: productionReconciles,
    productionNeverOverCommits_8: !productionOverCommit,
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "MOBILITY-AUTHORITY-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    comparisonSameRoute: {
      routeTiles,
      selectedParty: { kmPerDay: party.kmPerTravelDay, days: partyDays },
      wholeBandColumn: { kmPerDay: column.kmPerTravelDay, days: columnDays },
      emergencyColumn: { kmPerDay: emergencyColumn.kmPerTravelDay },
      leanColumnKmPerDay: leanColumn.kmPerTravelDay,
      burdenedColumnKmPerDay: burdenedColumn.kmPerTravelDay,
    },
    pools: { rested, exhausted, pools20, fastParty, availableAfterFast, secondFast, firstFactor, secondFactor },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
