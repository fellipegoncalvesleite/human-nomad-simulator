// CORE-PIPELINE-DECOMPOSITION-2 — resource-scout candidate family.
//
// A residence-unchanged INFORMATION action toward the band's best value-of-
// information resource belief (its own bounded patch memories). Owns its own
// perceived context (buildResourceScoutContext — stability, spare labor, cooldown,
// stress, learned skills/seasonal memory), eligibility (a selectable scout target
// with a passable edge), benefits/risks (VOI, reported-knowledge bias, crossing
// risk, anchor hold), and contribution (the scored resource_scout candidate).
// Depends only on the shared candidate contract, scoring kit, edge context, and
// constants — never on the orchestrator. Extracted verbatim; behavior identical.
import { getCanonicalFoodStress } from "../../agents/seasonalSurvival";
import { probeTargetNovelty } from "../../agents/probeMemory";
import { getLocalUsePressureValue } from "../../agents/pressure";
import { getAnchorHoldBonus } from "../../agents/residentialAnchor";
import {
  selectResourceScoutTarget,
  type ResourceScoutCandidate,
  type ResourceScoutContext,
} from "../../agents/resourceScout";
import type { Band } from "../../agents/types";
import type { DecisionId, TileId } from "../../core/types";
import { getTile } from "../../world/generate";
import type { WorldState } from "../../world/types";
import type {
  CandidateDecision,
  CandidateEvaluationCache,
} from "../decisionCandidateTypes";
import {
  PROACTIVE_INFO_COOLDOWN_SEASONS,
  PROACTIVE_INFO_MAX_FOOD_STRESS,
  PROACTIVE_INFO_MAX_MOBILITY_PRESSURE,
  PROACTIVE_INFO_MIN_LABOR,
  PROACTIVE_INFO_PULL,
  RESOURCE_SCOUT_SCORE_WEIGHT,
} from "../decisionConstants";
import { getCandidateEdgeMemo, getReportedKnowledgeTargetBias } from "../decisionEdgeContext";
import {
  clamp01,
  emptyScoreBreakdown,
  makeReason,
  numericTileIdPart,
  round2,
  scoreDecision,
} from "../decisionScoring";
import type { Action, ScoreBreakdown } from "../types";

export function buildResourceScoutContext(world: WorldState, band: Band): ResourceScoutContext {
  const currentTile = getTile(world, band.position);
  const population = Math.max(1, band.demography.population);
  const scoutCapacity = clamp01(band.demography.workingAdults / population);
  const probeRecord = (tileId: TileId) =>
    band.probeMemory?.recentTargets.find((record) => record.tileId === tileId);
  // 2K.6B / INFO-1: is this band currently in PROACTIVE information-seeking mode? Stable
  // (not in survival crisis, not driven to relocate) + has spare labor + its proactive
  // cooldown has elapsed. When true, selectResourceScoutTarget relaxes the VOI floor so an
  // under-known nearby patch becomes a valid scout target (a stable band learns before a
  // crisis); when false the selector is BYTE-IDENTICAL to pre-INFO-1. Deterministic.
  const proactiveFoodStress = getCanonicalFoodStress(band);
  const proactiveMobilityPressure = band.pressureState?.mobilityPressure ?? 0;
  const proactiveLabor = band.carryingCapacity?.populationDemand?.laborCapacity ?? band.size ?? 0;
  const proactiveCooldownOk =
    band.proactiveInfoMemory === undefined ||
    Number(world.time.tick) - Number(band.proactiveInfoMemory.lastProactiveInfoTick) >=
      PROACTIVE_INFO_COOLDOWN_SEASONS;
  const proactiveInfoMode =
    proactiveFoodStress < PROACTIVE_INFO_MAX_FOOD_STRESS &&
    proactiveMobilityPressure < PROACTIVE_INFO_MAX_MOBILITY_PRESSURE &&
    proactiveLabor >= PROACTIVE_INFO_MIN_LABOR &&
    proactiveCooldownOk;
  return {
    currentTileId: band.position,
    currentTick: Number(world.time.tick),
    proactiveInfoMode,
    season: world.time.season,
    waterStress: band.pressureState?.waterStress ?? 0,
    foodStress: band.pressureState?.foodStress ?? 0,
    perCapitaReturn:
      band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
      band.perCapitaReturn?.perCapitaReturn ??
      0.5,
    chronicDecline: band.returnTrend?.chronicDecline === true,
    scoutCapacity,
    exhaustedRangeStress: band.exhaustedRangeAudit?.stressLevel ?? 0,
    distanceTo: (tileId) => {
      const tile = getTile(world, tileId);
      if (tile === undefined || currentTile === undefined) {
        return undefined;
      }
      return Math.abs(tile.coord.x - currentTile.coord.x) + Math.abs(tile.coord.y - currentTile.coord.y);
    },
    probeNovelty: (tileId) => probeTargetNovelty(band.probeMemory, tileId, Number(world.time.tick)),
    probeNoGain: (tileId) => probeRecord(tileId)?.consecutiveNoGain ?? 0,
    // 2K.5: the band's own capped recent rings, so scout selection can derive
    // patch-return readiness (follow-up observation/testing guidance only).
    recentPlantUseTests: band.recentPlantUseTests,
    recentCauseSpecificEvents: band.recentCauseSpecificEvents,
    // 2K.7: the band's PERSISTED learned exploitation skill (from prior seasons — this season's
    // scout has not run yet, so this is competence already held, never about-to-be-gained). Lets
    // a band slightly prefer scouting/testing a KNOWN patch whose class it has learned to use.
    // undefined → byte-identical to pre-2K.7 selection.
    exploitationSkill: band.exploitationSkill,
    // 2K.12: the band's OWN learned seasonal-ecology memory + the reader flag, so scout
    // target selection can carry a bounded, selection-only seasonal bias. Flag default OFF
    // → byte-identical to pre-2K.12 selection.
    seasonalEcologyMemory: band.seasonalEcologyMemory,
    seasonalEcologyReadersEnabled: world.auditOptions?.seasonalEcologyMemoryReadersEnabled === true,
  };
}

// Audit-only helper: lets benchmark tooling inspect the exact resource-scout
// target selected from a band's private known-world state without reimplementing
// this file's scout context construction. Pure; not used by sim behavior.
export function selectResourceScoutTargetForAudit(
  world: WorldState,
  band: Band,
): ResourceScoutCandidate | undefined {
  return selectResourceScoutTarget(band.resourceKnowledgeState, buildResourceScoutContext(world, band));
}

// 2K.1H: general resource_scout candidate. A residence-unchanged INFORMATION action
// toward the best value-of-information resource belief (the band's own bounded patch
// memories). Competes with stay / move / probe; never feeds relocation. It carries the
// anchor-hold bonus (residence stays) so it can beat a blind move when worth scouting.
export function buildResourceScoutCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return undefined;
  }

  const scoutContext = buildResourceScoutContext(world, band);
  const candidate = selectResourceScoutTarget(band.resourceKnowledgeState, scoutContext);

  if (candidate === undefined) {
    return undefined;
  }

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, candidate.targetTileId, "expand_known_world", decisionCache);
  const targetTile = getTile(world, candidate.targetTileId);

  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8 || targetTile === undefined) {
    return undefined;
  }

  // 2K.6B / INFO-1: when the band is proactive-eligible (the scout context computed stability
  // + spare labor + cooldown elapsed — and the selector surfaced this under-known/under-used
  // target only because of that mode), boost the residence-unchanged scout so it occasionally
  // WINS over a comfortable stay — learning before a crisis. A real expansion/refuge move
  // (higher-scoring) still beats it; the cooldown bounds it to ≤1 per window per band; it
  // feeds the scout→plant-test→2K.6-skill chain. (The "known patch, unknown USE" case is a
  // valid proactive target, so we do NOT exclude well-known patches here.)
  const proactiveInfoEligible = scoutContext.proactiveInfoMode === true;
  const proactiveInfoBoost = proactiveInfoEligible ? PROACTIVE_INFO_PULL : 0;
  const reportedTargetBias = getReportedKnowledgeTargetBias(band, candidate.targetTileId, decisionCache, {
    currentTick: world.time.tick,
    targetKnown: band.knowledge.observedTiles[candidate.targetTileId] !== undefined,
    routeEvidence:
      edgeMemo.riverAssessment.knownFordValue > 0.12 ||
      edgeMemo.riverAssessment.riverCorridorValue > 0.12 ||
      candidate.confidenceBefore > 0.32,
    localEvidence: candidate.distance <= 2,
  });

  const currentRecord = band.knowledge.observedTiles[currentTile.id];
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    // Residence-unchanged: keep the local survival value of staying put, plus a small
    // route/risk cost for sending the task group. The pull is the VOI additive below.
    foodValue: clamp01((currentRecord?.observedRichness ?? 0.35) * 0.18),
    waterValue: clamp01((currentRecord?.observedWaterAccess ?? 0.35) * 0.14),
    memoryConfidence: candidate.confidenceBefore,
    movementCost: clamp01(candidate.distance / 12 + candidate.laborCost * 0.2),
    riskCost: clamp01(
      edgeMemo.riverAssessment.riverCrossingRisk * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.14 +
        reportedTargetBias.cautionPenalty * 0.28,
    ),
    localUsePressure: clamp01(currentUsePressure * 0.18),
    routeValue: reportedTargetBias.opportunityBias,
    expectedFutureValue: clamp01(candidate.expectedInfoValue + reportedTargetBias.opportunityBias * 0.12),
    frontierProbeValue: clamp01(candidate.voiScore + reportedTargetBias.opportunityBias * 0.18),
  };

  const action: Action = {
    type: "resource_scout",
    originTileId: currentTile.id,
    targetTileId: candidate.targetTileId,
    scoutKind: candidate.scoutKind,
    targetResourceClass: candidate.targetResourceClass,
  };

  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(candidate.targetTileId), {
    type: "frontier_probe",
    strength: candidate.voiScore,
    confidence: candidate.confidenceBefore,
    relatedTileIds: [currentTile.id, candidate.targetTileId],
    intentKind: "expand_known_world",
    currentTileId: currentTile.id,
    targetTileId: candidate.targetTileId,
    frontierValue: candidate.voiScore,
    isProactiveInfo: proactiveInfoEligible ? true : undefined,
  });

  return {
    action,
    scoreBreakdown,
    score: round2(
      scoreDecision(scoreBreakdown) +
        candidate.voiScore * RESOURCE_SCOUT_SCORE_WEIGHT +
        getAnchorHoldBonus(decisionCache.anchorContext) +
        proactiveInfoBoost,
    ),
    primaryReason,
    secondaryReasons: [],
    riverAssessment: edgeMemo.riverAssessment,
  };
}
