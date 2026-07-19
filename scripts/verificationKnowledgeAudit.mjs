// ECOLOGY-VIABILITY-CORRECTION-3 — returned-verification knowledge semantics audit.
// Proves the Defect B writer resolves uncertainty WITHOUT becoming omniscience:
// a confirmed verification must not invent yield evidence, and no outcome may reach
// certainty. Pure-function level; no world mutation.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

try {
  const rk = await server.ssrLoadModule("/sim/agents/resourceKnowledge.ts");
  const apply = rk.applyVerificationObservationToMemory;

  const baseMemory = {
    patchId: "patch:test",
    resourceClassId: "generic_plant_food",
    approximateTile: "tile:1:1",
    linkedTiles: [],
    state: "suspected",
    source: "observed",
    confidence: {
      presenceConfidence: 0.4,
      seasonConfidence: 0.3,
      yieldConfidence: 0.35,
      safetyConfidence: 0.5,
      processingConfidence: 0.5,
      accessConfidence: 0.5,
      recoveryConfidence: 0.5,
    },
    seasonality: { bestSeasons: [], badSeasons: [] },
    useHistory: { lastYieldEstimate: 0.3 },
    risk: {},
    transmission: {},
    firstNotedTick: 1,
    lastNotedTick: 1,
    reasonIds: ["reason:seed"],
  };

  const OBSERVED = 0.85;
  const TICK = 40;
  const confirmed = apply(baseMemory, "target_confirmed", OBSERVED, TICK);
  const depleted = apply(baseMemory, "target_depleted", OBSERVED, TICK);
  const absent = apply(baseMemory, "target_absent", OBSERVED, TICK);

  // A high-presence memory must not be dragged DOWN by a confirmation.
  const alreadyHigh = { ...baseMemory, confidence: { ...baseMemory.confidence, presenceConfidence: 0.95 } };
  const confirmedHigh = apply(alreadyHigh, "target_confirmed", OBSERVED, TICK);

  const checks = {
    // §5 — the core fix: presence rises on physical confirmation, breaking the loop.
    confirmedRaisesPresence: confirmed.confidence.presenceConfidence > baseMemory.confidence.presenceConfidence,
    // ANTI-OMNISCIENCE: yield was never attempted, so yield evidence must not move.
    confirmedLeavesYieldUnchanged:
      confirmed.confidence.yieldConfidence === baseMemory.confidence.yieldConfidence,
    // One visit is one visit — never certainty.
    confirmedNeverCertain: confirmed.confidence.presenceConfidence <= OBSERVED,
    confirmedDoesNotLowerBetterBelief:
      confirmedHigh.confidence.presenceConfidence >= alreadyHigh.confidence.presenceConfidence,
    // Depleted is real, directly-observed yield evidence, and keeps presence.
    depletedLowersYield: depleted.confidence.yieldConfidence < baseMemory.confidence.yieldConfidence,
    depletedKeepsPresence: depleted.confidence.presenceConfidence >= baseMemory.confidence.presenceConfidence,
    // Absence is distinct from depletion in BOTH directions.
    absentLowersPresence: absent.confidence.presenceConfidence < baseMemory.confidence.presenceConfidence,
    depletedDistinctFromAbsent:
      depleted.confidence.presenceConfidence !== absent.confidence.presenceConfidence,
    absentDoesNotInventYieldEvidence:
      absent.confidence.yieldConfidence === baseMemory.confidence.yieldConfidence,
    // Recency refresh is what stops the same verification re-triggering forever.
    everyReachedOutcomeRefreshesRecency:
      Number(confirmed.lastNotedTick) === TICK &&
      Number(depleted.lastNotedTick) === TICK &&
      Number(absent.lastNotedTick) === TICK,
    // Bounded state: reasonIds must not grow without limit.
    reasonIdsBounded: confirmed.reasonIds.length <= 4,
    // No exact stock leaked into memory.
    noStockFieldLeaked: JSON.stringify(confirmed).includes("abundance") === false,
  };

  const verdict = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
  console.log(JSON.stringify({
    check: "verification-knowledge-semantics",
    verdict,
    checks,
    observed: {
      basePresence: baseMemory.confidence.presenceConfidence,
      baseYield: baseMemory.confidence.yieldConfidence,
      confirmed: confirmed.confidence,
      depleted: depleted.confidence,
      absent: absent.confidence,
    },
  }, null, 1));
} finally {
  await server.close();
}
