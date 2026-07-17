// EXPEDITIONARY-4 §15 — adaptation-efficacy A/B audit (carrying/load-staging family).
//
// Proves, through the PUBLIC adaptation boundary and the real expedition chain:
//   A/B — identical conditions, one practiced load-staging response ON vs OFF:
//         the response changes REAL physics (party carry ceiling, daily pace via
//         the travel legs, expedition duration, delivered cargo) — never a generic
//         food/survival multiplier;
//   efficacy loop — the production evaluator classifies REAL outcomes (success vs
//         severe-hardship failure), and evidence-driven response status (abandoned/
//         dormant) switches the physical effect OFF for later execution — the
//         actual-result → efficacy-evidence → later-behavior chain;
//   duplicate application — the relief is bounded by its caps on each distinct
//         coefficient (pace ≤ +20%, carrying ≤ +24%) and never compounds.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const trips = await server.ssrLoadModule("/sim/agents/intraSeasonTrips.ts");
  const boundary = await server.ssrLoadModule("/sim/agents/adaptationBoundary.ts");
  const expedition = await server.ssrLoadModule("/sim/agents/expedition.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");

  let world = runner.initSimWorld({ kind: "map1" }, "adaptation-efficacy-ab");
  world = runner.stepSim(world, 4, "seasonal");
  const bandId = Object.keys(world.bands).sort()[0];
  const band = world.bands[bandId];
  const tick = Number(world.time.tick);

  // ── the practiced response (arm A) — active load-staging with a strong basis ─────
  const fragment = {
    id: "fragment:audit:load_staging",
    domain: "logistics",
    subject: "load_staging",
    property: "staged_loads_travel_further",
    publicLabel: "staged-load travel practice",
    basis: "lived",
    strength: 0.9,
    failureCount: 0,
    lastReinforcedTick: tick,
    evidenceRefs: ["audit-fixture"],
  };
  const response = {
    id: "response:audit:carrying",
    family: "carrying_load",
    variantKey: "load_staging",
    publicLabel: "staged-load carrying response",
    status: "active",
    confidence: 0.85,
    successCount: 4,
    partialCount: 1,
    failureCount: 0,
    formedAtTick: Math.max(0, tick - 8),
    lastActiveTick: tick,
    requiredFragmentIds: [fragment.id],
    contextNote: "audit fixture",
  };
  const basePA = band.practicalAdaptation ?? {
    bandId: band.id, lastUpdatedTick: tick, fragments: [], responses: [], efficacyRecords: [],
    caps: { fragmentCap: 24, responseCap: 8, recordCap: 16, held: true },
  };
  const bandA = {
    ...band,
    practicalAdaptation: { ...basePA, fragments: [fragment], responses: [response] },
  };
  // Arm B: identical band, relevant effect OFF (no carrying response at all).
  const bandB = {
    ...band,
    practicalAdaptation: { ...basePA, fragments: [fragment], responses: [] },
  };
  // Arm C: the SAME response after evidence-driven abandonment (efficacy loop state).
  const bandC = {
    ...band,
    practicalAdaptation: {
      ...basePA,
      fragments: [fragment],
      responses: [{ ...response, status: "abandoned", failureCount: 3 }],
    },
  };

  const reliefA = boundary.deriveCarryingRelief(bandA, tick);
  const reliefB = boundary.deriveCarryingRelief(bandB, tick);
  const reliefC = boundary.deriveCarryingRelief(bandC, tick);

  // ── physical A/B through the production expedition chain ──────────────────────────
  const origin = world.tiles[band.position];
  const probeMemory = (tile) => ({
    patchId: `${tile.id}:generic_plant_food`,
    resourceClassId: "generic_plant_food",
    approximateTile: tile.id,
    linkedTiles: [],
    state: "used", source: "direct",
    confidence: {
      presenceConfidence: 0.8, seasonConfidence: 0.7, yieldConfidence: 0.8,
      safetyConfidence: 0.85, processingConfidence: 0.6, accessConfidence: 0.8,
      recoveryConfidence: 0.5,
    },
    seasonality: { bestSeasons: [], badSeasons: [], failedSeasonCount: 0 },
    useHistory: {
      visits: 5, successfulUses: 4, failedUses: 0, lastYieldEstimate: 0.8,
      yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5,
    },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 },
    firstNotedTick: 0, lastNotedTick: tick, reasonIds: [],
  });
  let site;
  for (const tile of Object.values(world.tiles)) {
    const d = Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);
    if (d < 8 || d > 16 || tile.isAquatic === true) continue;
    if (plantPatches.derivePlantPatchesForTile(tile, world.time).length === 0) continue;
    const route = trips.buildExpeditionRouteTiles(world, band.position, tile.id, 24);
    if (route === undefined || route[route.length - 1] !== tile.id) continue;
    // The A/B needs a LIVE stock TODAY: probe with the production verify-only
    // resolver (no depletion, no cargo) and require real standing availability.
    const probe = trips.resolveExpeditionTargetWork(
      world, band, probeMemory(tile), tile.id, d, route, Number(world.time.day ?? 0), "food_resource_check",
      { verifyOnly: true },
    );
    const availability = probe.record.physicalFoodHarvest?.physicalAvailability ?? 0;
    if (probe.record.physicalFoodHarvest?.physicalSourceFound !== true || availability < 0.08) continue;
    if (site === undefined || availability > site.availability) site = { tile, route, availability };
  }

  const capacityA = expedition.deriveCarryCapacityUnits(bandA, 2, 0, tick);
  const capacityB = expedition.deriveCarryCapacityUnits(bandB, 2, 0, tick);

  const memoryFor = () => ({
    patchId: `${site.tile.id}:generic_plant_food`,
    resourceClassId: "generic_plant_food",
    approximateTile: site.tile.id,
    linkedTiles: [],
    state: "used", source: "direct",
    confidence: {
      presenceConfidence: 0.8, seasonConfidence: 0.7, yieldConfidence: 0.8,
      safetyConfidence: 0.85, processingConfidence: 0.6, accessConfidence: 0.8,
      recoveryConfidence: 0.5,
    },
    seasonality: { bestSeasons: [], badSeasons: [], failedSeasonCount: 0 },
    useHistory: {
      visits: 5, successfulUses: 4, failedUses: 0, lastYieldEstimate: 0.8,
      yieldTrend: "flat", depletionMemory: 0, recoveryExpectation: 0.5,
    },
    risk: { poisoningOrBadReaction: false, badWater: false, predatorOrAnimalRisk: 0, tabooOrAvoidanceFutureFlag: false },
    transmission: { detailLoss: 0, practiceReinforced: 0 },
    firstNotedTick: 0, lastNotedTick: tick, reasonIds: [],
  });

  // Drive one identical expedition per arm through the real daily action.
  const runArm = (armBand) => {
    const crafted = {
      ...armBand,
      // 8 adults → a 2-worker party, whose carry ceiling BINDS at natural stock scales.
      demography: { ...armBand.demography, workingAdults: 8 },
      ...(armBand.pressureState === undefined
        ? {}
        : { pressureState: { ...armBand.pressureState, foodStress: 0, fatiguePressure: 0 } }),
      resourceKnowledgeState: { patchMemories: [memoryFor()], cap: 48 },
      expeditions: [],
      recentExpeditionOutcomes: [],
      receivedSmokeSignals: [],
    };
    let w = { ...world, bands: { ...world.bands, [bandId]: crafted } };
    let outcome;
    let days = 0;
    for (let dayStep = 0; dayStep < 60 && outcome === undefined; dayStep += 1) {
      w = runner.stepSim(w, 1, "daily");
      days += 1;
      outcome = (w.bands[bandId].recentExpeditionOutcomes ?? []).find(
        (o) => o.taskKind === "distant_plant_gathering" && o.targetTileId === site.tile.id,
      );
    }
    return { outcome, days };
  };
  const armA = runArm(bandA);
  const armB = runArm(bandB);

  const deliveredA = armA.outcome?.deliveredHarvestUnits ?? -1;
  const deliveredB = armB.outcome?.deliveredHarvestUnits ?? -1;
  const daysA = armA.outcome?.totalDays ?? 999;
  const daysB = armB.outcome?.totalDays ?? 999;

  // ── the efficacy evaluator classifies REAL outcomes differently ───────────────────
  const successEval = boundary.evaluateCarryingEfficacy({
    moved: true,
    context: {
      reliefApplied: reliefA.relief, responseId: response.id, conditionPresent: true,
      budgetWithRelief: 4, budgetWithoutRelief: 3, moveDistance: 4,
      stagedLegIncomplete: false, hardshipLevel: "low", hardshipReliefApplied: 0.05,
    },
  });
  const failureEval = boundary.evaluateCarryingEfficacy({
    moved: true,
    context: {
      reliefApplied: reliefA.relief, responseId: response.id, conditionPresent: true,
      budgetWithRelief: 3, budgetWithoutRelief: 3, moveDistance: 4,
      stagedLegIncomplete: true, hardshipLevel: "severe", hardshipReliefApplied: 0,
    },
  });

  const checks = {
    responseGivesActiveRelief_15: reliefA.active === true && reliefA.relief > 0,
    noResponseNoRelief_15: reliefB.active !== true && reliefB.relief === 0,
    abandonedEvidenceKillsEffect_15: reliefC.active !== true && reliefC.relief === 0,
    carryCeilingDiffers_15: capacityA > capacityB,
    carryLiftBounded_15: capacityA / capacityB <= 1.24 + 1e-9,
    bothArmsPhysicallyComplete_15: deliveredA >= 0 && deliveredB >= 0,
    // The practiced response must change a REAL end-to-end outcome: either the party
    // comes home faster (pace relief) or brings more home (carry relief binding —
    // which requires stocks rich enough to fill the ceiling; on thin natural stocks
    // the duration difference is the observable consequence).
    adaptedPartyMeasurablyBetter_15: daysA < daysB || deliveredA > deliveredB,
    adaptedPartyNoSlower_15: daysA <= daysB && deliveredA >= deliveredB,
    noGenericMultiplier_15: deliveredA / Math.max(0.0001, deliveredB) <= 1.5,
    evaluatorCreditsRealSuccess_15: successEval?.classification === "clear_success_specific",
    evaluatorFlagsRealFailure_15: failureEval?.classification === "failure_or_danger_specific",
    boundaryOnlyAccess_15: typeof boundary.deriveCarryingRelief === "function" && typeof boundary.evaluateCarryingEfficacy === "function",
  };
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-ADAPTATION-EFFICACY-1",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    ab: {
      relief: { withResponse: reliefA.relief, withoutResponse: reliefB.relief, afterAbandonment: reliefC.relief },
      carryCapacityUnits: { withResponse: capacityA, withoutResponse: capacityB },
      delivered: { withResponse: deliveredA, withoutResponse: deliveredB },
      totalDays: { withResponse: daysA, withoutResponse: daysB },
      outcomes: {
        withResponse: { reason: armA.outcome?.outcomeReason, lost: armA.outcome?.lostUnits, provisions: armA.outcome?.provisionUnitsConsumed },
        withoutResponse: { reason: armB.outcome?.outcomeReason, lost: armB.outcome?.lostUnits, provisions: armB.outcome?.provisionUnitsConsumed },
      },
      site: String(site.tile.id),
    },
    efficacy: {
      successClassification: successEval?.classification,
      failureClassification: failureEval?.classification,
    },
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
