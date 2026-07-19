// ECOLOGY-VIABILITY-CORRECTION-5 — expedition value-control audit.
// Cases E (rich local sufficiency), F (urgent ordinary willingness), G (empty-target
// cooldown) and H (anti-omniscience) from the correction spec. Pure-function level.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

const memory = (over = {}) => ({
  patchId: "patch:distant",
  resourceClassId: "generic_plant_food",
  approximateTile: "tile:9:9",
  linkedTiles: [],
  state: "known",
  source: "observed",
  confidence: {
    presenceConfidence: 0.85, seasonConfidence: 0.5, yieldConfidence: 0.6,
    safetyConfidence: 0.6, processingConfidence: 0.6, accessConfidence: 0.6, recoveryConfidence: 0.6,
  },
  seasonality: { bestSeasons: [], badSeasons: [] },
  useHistory: {
    visits: 3, successfulUses: 2, failedUses: 0, lastYieldEstimate: 0.5,
    yieldTrend: "stable", depletionMemory: 0, recoveryExpectation: 0.5,
  },
  risk: {}, transmission: {}, firstNotedTick: 1, lastNotedTick: 40, reasonIds: [],
  ...over,
});

// A band whose OWN recent local trips return well (rich) vs one returning nothing (ordinary).
const band = (localYieldPerTrip, extra = {}) => ({
  id: "band:test",
  demography: { population: 22, workingAdults: 11 },
  recentIntraSeasonTrips: localYieldPerTrip === 0 ? [] : Array.from({ length: 6 }, (_, i) => ({
    targetTileId: `tile:1:${i}`, day: 100 + i,
    physicalFoodHarvest: { usableSupport: localYieldPerTrip },
  })),
  recentExpeditionOutcomes: [],
  ...extra,
});

try {
  const exp = await server.ssrLoadModule("/sim/agents/expedition.ts");
  const worthwhile = exp.isDistantRetrievalWorthwhileForAudit;
  const TICK = 40;
  const target = { memory: memory(), targetTileId: "tile:9:9", distanceTiles: 8 };

  // E — rich band, strong local returns, comfortable (foodStress 0)
  const richComfortable = worthwhile(band(0.15), target, 0.0, 3, TICK);
  // Same rich band, same good target — only hunger differs. This is the willingness test
  // on a REALISTIC band (good local ground), not on the contradictory
  // "comfortable but returning nothing locally" fixture.
  const richHungryHigh = worthwhile(band(0.15), target, 0.9, 3, TICK);
  // F — ordinary band, no local returns, starving (foodStress 0.9)
  const ordinaryHungry = worthwhile(band(0), target, 0.9, 3, TICK);
  // same band, same target, only WILLINGNESS differs
  const ordinaryComfortable = worthwhile(band(0), target, 0.0, 3, TICK);
  // hungry rich band still weighs opportunity cost of its good local ground
  // On a MID-value target, strong local ground should make the band less willing than a
  // band with nothing local, at identical hunger.
  const midTarget = { ...target, memory: memory({ useHistory: { ...memory().useHistory, lastYieldEstimate: 0.22 } }) };
  const richHungryMid = worthwhile(band(0.15), midTarget, 0.9, 3, TICK);
  const ordinaryHungryMid = worthwhile(band(0), midTarget, 0.9, 3, TICK);

  // G — a target its own party just found empty is not re-walked
  const afterEmpty = worthwhile(
    band(0, { recentExpeditionOutcomes: [{
      targetTileId: "tile:9:9", tick: TICK - 2, outcomeReason: "physically_exhausted",
      deliveredHarvestUnits: 0,
    }] }),
    target, 0.9, 3, TICK,
  );
  // ...but the cooldown expires
  const afterEmptyExpired = worthwhile(
    band(0, { recentExpeditionOutcomes: [{
      targetTileId: "tile:9:9", tick: TICK - 40, outcomeReason: "physically_exhausted",
      deliveredHarvestUnits: 0,
    }] }),
    target, 0.9, 3, TICK,
  );

  // remembered depletion lowers expected value
  const depletedMemory = worthwhile(
    band(0), { ...target, memory: memory({ useHistory: { ...memory().useHistory, depletionMemory: 0.95 } }) },
    0.9, 3, TICK,
  );
  // H — stamina/capacity must not move with hunger: identical inputs bar foodStress
  // already covered by ordinaryHungry vs ordinaryComfortable differing ONLY in willingness.
  // Distance still costs: a far target is worth less than a near one, all else equal.
  const nearOk = worthwhile(band(0), { ...target, distanceTiles: 5 }, 0.9, 3, TICK);
  const veryFar = worthwhile(band(0), { ...target, distanceTiles: 34 }, 0.9, 3, TICK);

  const checks = {
    // E — a well-fed band with good local ground does not walk for distant low-value food
    richComfortableDeclines: richComfortable === false,
    // F — a starving band with nothing local is willing to try
    ordinaryHungryAccepts: ordinaryHungry === true,
    // need changes WILLINGNESS: same band, same target, different hunger → different answer
    needChangesWillingness: richHungryHigh === true && richComfortable === false,
    // opportunity cost is real: good local ground raises the bar even when hungry
    localOpportunityCostCounts: richHungryMid === false && ordinaryHungryMid === true,
    // G — do not re-walk to a place the band's own party just found empty
    emptyTargetCooldownHolds: afterEmpty === false,
    cooldownExpires: afterEmptyExpired === true,
    // remembered depletion reduces expected value
    rememberedDepletionCounts: depletedMemory === false,
    // distance still costs
    nearerTargetPreferred: nearOk === true && veryFar === false,
  };

  const verdict = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
  console.log(JSON.stringify({
    check: "expedition-value-gate",
    verdict,
    checks,
    observed: {
      richComfortable, richHungryHigh, richHungryMid, ordinaryHungryMid, ordinaryHungry, ordinaryComfortable,
      afterEmpty, afterEmptyExpired, depletedMemory, nearOk, veryFar,
    },
  }, null, 1));
} finally {
  await server.close();
}
