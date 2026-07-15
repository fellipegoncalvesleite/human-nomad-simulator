// CORE-PIPELINE-DECOMPOSITION-2 — visible-landscape probe candidate family.
//
// A residence-unchanged probe toward a band-KNOWN visible landscape cue (an
// uncertain distant hint the band can see but has not observed). Owns its own
// eligibility (a fresh, confident, unobserved cue in range with a passable edge),
// evidence (the cue + edge memo), benefits/risks (water urgency, route confidence,
// crossing risk), and contribution (the scored logistical_probe candidate). This
// family module depends only on the shared candidate contract, scoring kit, edge
// context, and constants — never on the decision orchestrator. Extracted verbatim
// from bandDecision.ts; behavior is byte-identical.
import { deriveProbeDiminishingReturn } from "../../agents/probeMemory";
import { getLocalUsePressureValue } from "../../agents/pressure";
import { getAnchorHoldBonus } from "../../agents/residentialAnchor";
import type { Band } from "../../agents/types";
import type { TileId } from "../../core/types";
import { getTile } from "../../world/generate";
import type { WorldState } from "../../world/types";
import type {
  CandidateDecision,
  CandidateEvaluationCache,
} from "../decisionCandidateTypes";
import {
  PROBE_DIMINISHING_RETURN_SCORE_WEIGHT,
  VISIBLE_LANDSCAPE_PROBE_SCORE_WEIGHT,
} from "../decisionConstants";
import { getCandidateEdgeMemo } from "../decisionEdgeContext";
import {
  clamp01,
  emptyScoreBreakdown,
  getGridDistance,
  makeReason,
  numericTileIdPart,
  round2,
  scoreDecision,
} from "../decisionScoring";
import type { Action, ScoreBreakdown } from "../types";

import type { DecisionId } from "../../core/types";

export function buildVisibleLandscapeProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  if (currentTile === undefined || currentRecord === undefined) {
    return undefined;
  }

  const cue = (band.visibleLandscapeCues ?? [])
    .filter((entry) =>
      entry.status !== "stale" &&
      entry.confidence >= 0.38 &&
      band.knowledge.observedTiles[entry.approximateTileId] === undefined,
    )
    .sort((left, right) =>
      right.confidence - left.confidence ||
      left.distanceTiles - right.distanceTiles ||
      left.cueId.localeCompare(right.cueId),
    )[0];

  if (cue === undefined) {
    return undefined;
  }

  const targetTile = getTile(world, cue.approximateTileId);
  if (targetTile === undefined) {
    return undefined;
  }

  const distance = getGridDistance(currentTile, targetTile);
  if (distance <= 0 || distance > 10) {
    return undefined;
  }

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, targetTile.id, "expand_known_world", decisionCache);
  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
    return undefined;
  }

  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const targetKindPull = visibleCueProbeKindPull(cue.kind);
  // PERCEPTION-MOBILITY-1C — a chronically poor band that can clearly see nearby
  // WATER should not ignore it forever. This boosts the SCOUT/PROBE value (never a
  // relocation) so the band investigates the cue; observing the shore then feeds
  // the existing, fully-gated residential scorer. Anti-omniscient: the cue is an
  // uncertain visible hint, the probe legitimately observes it, and no hidden water
  // truth, exact target, or direct relocation is used.
  const isWaterCue =
    cue.kind === "visible_water" ||
    cue.kind === "visible_wetland" ||
    cue.kind === "lake_shore_visible" ||
    cue.kind === "delta_like_area" ||
    cue.kind === "river_or_tributary_corridor";
  const probeSupportDebug = band.perCapitaReturn?.supportDebug ?? band.carryingCapacity?.perCapitaReturn?.supportDebug;
  const bandPoorness = clamp01(
    Math.max(
      decisionCache.pressureSnapshot.bandPressureState.foodStress,
      probeSupportDebug?.deficitRatio ?? 0,
    ) + (band.returnTrend?.chronicDecline === true ? 0.2 : 0),
  );
  const nearbyWaterUrgency =
    isWaterCue && !cue.blockedByTerrain ? clamp01(bandPoorness * (distance <= 6 ? 1 : 0.5)) : 0;
  const routeConfidence = clamp01(
    cue.confidence * 0.42 +
      edgeMemo.riverAssessment.knownFordValue * 0.22 +
      edgeMemo.riverAssessment.riverCorridorValue * 0.18 +
      (distance <= 5 ? 0.12 : 0),
  );
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    foodValue: clamp01((currentRecord.observedRichness ?? 0.35) * 0.16),
    waterValue: clamp01((currentRecord.observedWaterAccess ?? 0.35) * 0.16 + (cue.kind === "visible_water" ? cue.confidence * 0.16 : 0) + nearbyWaterUrgency * 0.22),
    memoryConfidence: cue.confidence,
    movementCost: clamp01(distance / 12),
    riskCost: clamp01(
      edgeMemo.riverAssessment.riverCrossingRisk * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.12 +
        (cue.blockedByTerrain ? 0.12 : 0),
    ),
    routeValue: routeConfidence,
    explorationValue: clamp01(cue.confidence * 0.5 + targetKindPull * 0.22 + nearbyWaterUrgency * 0.12),
    frontierProbeValue: clamp01(cue.confidence * 0.62 + targetKindPull * 0.22 + nearbyWaterUrgency * 0.18),
    localSurvivalValue: clamp01((currentRecord.observedRichness ?? 0.35) * 0.18 + (currentRecord.observedWaterAccess ?? 0.35) * 0.14 + nearbyWaterUrgency * 0.3),
    localUsePressure: clamp01(currentUsePressure * 0.14),
    foodStress: decisionCache.pressureSnapshot.bandPressureState.foodStress,
    waterStress: decisionCache.pressureSnapshot.bandPressureState.waterStress,
    mobilityPressure: decisionCache.pressureSnapshot.bandPressureState.mobilityPressure,
    riverCrossingCost: edgeMemo.riverAssessment.riverCrossingCost,
    riverCrossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    riverCorridorValue: edgeMemo.riverAssessment.riverCorridorValue,
    knownFordValue: edgeMemo.riverAssessment.knownFordValue,
    blockedCrossingPenalty: edgeMemo.riverAssessment.blockedCrossingPenalty,
    scoutValue: cue.confidence,
    logisticalProbeValue: cue.confidence,
  };
  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId: targetTile.id,
    prospectTileIds: [targetTile.id],
  };
  const basis = [`visible_landscape:${cue.kind}:${cue.direction}`];
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(targetTile.id), {
    type: "logistical_probe_selected",
    strength: cue.confidence,
    confidence: routeConfidence,
    relatedTileIds: [currentTile.id, targetTile.id],
    bandId: band.id,
    currentTileId: currentTile.id,
    targetTileId: targetTile.id,
    prospectTileIds: [targetTile.id],
    scoutValue: cue.confidence,
    uncertainty: round2(1 - cue.confidence),
    crossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    travelCost: distance,
    basis,
  });
  const diminishingReturn = deriveProbeDiminishingReturn(band.probeMemory, targetTile.id, Number(world.time.tick), {
    waterStress: decisionCache.pressureSnapshot.bandPressureState.waterStress,
    routeConfidence,
    hasAlternativeTarget: (band.visibleLandscapeCues ?? []).length > 1,
    resourceBeliefRelevant: false,
    exhaustedRangeStress: band.exhaustedRangeAudit?.stressLevel ?? 0,
  });
  const probeDiminishingReturnPull = diminishingReturn.probeDiminishingReturnPenalty * PROBE_DIMINISHING_RETURN_SCORE_WEIGHT;

  return {
    action,
    scoreBreakdown,
    score: round2(
      scoreDecision(scoreBreakdown) +
        cue.confidence * VISIBLE_LANDSCAPE_PROBE_SCORE_WEIGHT +
        getAnchorHoldBonus(decisionCache.anchorContext) -
        probeDiminishingReturnPull,
    ),
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 1, {
        type: "scout_before_relocation",
        strength: cue.confidence,
        confidence: routeConfidence,
        relatedTileIds: [currentTile.id, targetTile.id],
        bandId: band.id,
        currentTileId: currentTile.id,
        targetTileId: targetTile.id,
        prospectTileIds: [targetTile.id],
        scoutValue: cue.confidence,
        uncertainty: round2(1 - cue.confidence),
        crossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
        travelCost: distance,
        basis,
      }),
    ],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

export function visibleCueProbeKindPull(kind: NonNullable<Band["visibleLandscapeCues"]>[number]["kind"]): number {
  switch (kind) {
    case "visible_water":
    case "visible_wetland":
    case "lake_shore_visible":
    case "delta_like_area":
    case "river_or_tributary_corridor":
      return 0.22;
    case "greener_lowland":
    case "open_valley":
      return 0.16;
    case "pass_or_saddle":
    case "opposite_bank":
      return 0.12;
    case "higher_ground":
    case "dry_or_barren_country":
      return 0.06;
  }
}

export function updateVisibleLandscapeCueProbeUse(
  band: Band,
  action: Action,
  scoutOrProbeTargetId: TileId | undefined,
): readonly NonNullable<Band["visibleLandscapeCues"]>[number][] | undefined {
  const cues = band.visibleLandscapeCues;
  if (cues === undefined || scoutOrProbeTargetId === undefined || action.type !== "logistical_probe") {
    return cues;
  }

  return cues.map((cue) =>
    cue.approximateTileId === scoutOrProbeTargetId
      ? {
          ...cue,
          status: "partly_checked",
          influencedScoutOrProbeCount: cue.influencedScoutOrProbeCount + 1,
        }
      : cue,
  );
}
