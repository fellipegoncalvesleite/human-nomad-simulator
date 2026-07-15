// CORE-PIPELINE-DECOMPOSITION-2 — pressure-relief probe candidate family.
//
// An opt-in, residence-unchanged probe toward a band-known relief tile surfaced by
// the camp-movement pressure-relief bridge (a familiar edge worth checking before
// a crisis relocation). Owns its eligibility (a scout_probe relief strategy with a
// passable edge), evidence (the relief bridge + edge memo), benefits/risks (relief
// score, crossing risk, sickness-wear relief), and its scored logistical_probe
// contribution. Depends only on the shared candidate contract, scoring kit, and
// edge context — never on the orchestrator. Extracted verbatim; behavior identical.
import { getLocalUsePressureValue } from "../../agents/pressure";
import { getAnchorHoldBonus } from "../../agents/residentialAnchor";
import type { Band } from "../../agents/types";
import type { DecisionId } from "../../core/types";
import { getTile } from "../../world/generate";
import type { WorldState } from "../../world/types";
import type {
  CandidateDecision,
  CandidateEvaluationCache,
} from "../decisionCandidateTypes";
import { getCandidateEdgeMemo } from "../decisionEdgeContext";
import {
  clamp01,
  emptyScoreBreakdown,
  makeReason,
  numericTileIdPart,
  round2,
  scoreDecision,
} from "../decisionScoring";
import type { Action, ScoreBreakdown } from "../types";

export function buildPressureReliefProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);
  const relief = decisionCache.campMovementSupport.pressureRelief.scoutProbeBridge;

  if (currentTile === undefined || relief === undefined || relief.actionStrategy !== "scout_probe") {
    return undefined;
  }

  const targetTile = getTile(world, relief.tileId);
  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, relief.tileId, "expand_known_world", decisionCache);

  if (targetTile === undefined || !edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
    return undefined;
  }

  const currentRecord = band.knowledge.observedTiles[currentTile.id];
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    foodValue: clamp01((currentRecord?.observedRichness ?? 0.35) * 0.16),
    waterValue: clamp01((currentRecord?.observedWaterAccess ?? 0.35) * 0.14),
    memoryConfidence: relief.knownness,
    movementCost: relief.crossingTravelCost,
    riskCost: clamp01(edgeMemo.riverAssessment.riverCrossingRisk * 0.26 + relief.uncertainty * 0.12),
    localUsePressure: clamp01(currentUsePressure * 0.18),
    routeValue: relief.sameRiverCountry ? 0.14 : 0.06,
    expectedFutureValue: relief.pressureReliefScore,
    frontierProbeValue: clamp01(relief.pressureReliefScore * 0.72 + (1 - relief.uncertainty) * 0.14),
    recoveryBenefit: relief.campSicknessWearRelief,
    depletionPenalty: clamp01(currentUsePressure * 0.12),
    riverCrossingCost: edgeMemo.riverAssessment.riverCrossingCost,
    riverCrossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    riverCorridorValue: edgeMemo.riverAssessment.riverCorridorValue,
    knownFordValue: edgeMemo.riverAssessment.knownFordValue,
    blockedCrossingPenalty: edgeMemo.riverAssessment.blockedCrossingPenalty,
    logisticalProbeValue: relief.pressureReliefScore,
  };
  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId: relief.tileId,
    prospectTileIds: [relief.tileId],
  };
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(relief.tileId), {
    type: "logistical_probe_selected",
    strength: relief.pressureReliefScore,
    confidence: relief.knownness,
    relatedTileIds: [currentTile.id, relief.tileId],
    bandId: band.id,
    currentTileId: currentTile.id,
    targetTileId: relief.tileId,
    prospectTileIds: [relief.tileId],
    stayValue: 0,
    scoutValue: relief.pressureReliefScore,
    moveValue: 0,
    marginalReturn: relief.supportAdequacy,
    departureThreshold: relief.waterRefugeAdequacy,
    uncertainty: relief.uncertainty,
    socialRisk: 0,
    crossingRisk: relief.crossingTravelCost,
    travelCost: relief.crossingTravelCost,
    basis: [
      relief.reasonLabel,
      relief.betterThanCurrent ? "better than current" : "good-enough relief, not richer-country migration",
      relief.sameRiverCountry ? "river country retained" : "familiar edge checked first",
    ],
  });

  return {
    action,
    scoreBreakdown,
    score: round2(
      scoreDecision(scoreBreakdown) +
        relief.pressureReliefScore * 1.24 +
        getAnchorHoldBonus(decisionCache.anchorContext) +
        (decisionCache.campMovementSupport.pressureRelief.localOrbitTrap.detected ? 0.06 : 0),
    ),
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 36, {
        type: "scout_before_relocation",
        strength: relief.pressureReliefScore,
        confidence: relief.knownness,
        relatedTileIds: [currentTile.id, relief.tileId],
        bandId: band.id,
        currentTileId: currentTile.id,
        targetTileId: relief.tileId,
        prospectTileIds: [relief.tileId],
        stayValue: 0,
        scoutValue: relief.pressureReliefScore,
        moveValue: 0,
        departureThreshold: relief.waterRefugeAdequacy,
        uncertainty: relief.uncertainty,
        socialRisk: 0,
        crossingRisk: relief.crossingTravelCost,
        travelCost: relief.crossingTravelCost,
        basis: ["pressure relief probe", relief.reasonLabel],
      }),
    ],
    riverAssessment: edgeMemo.riverAssessment,
    isOptInCandidate: true,
  };
}
