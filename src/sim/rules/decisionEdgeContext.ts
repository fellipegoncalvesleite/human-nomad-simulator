// CORE-PIPELINE-DECOMPOSITION-2 — candidate edge / river-crossing assessment.
//
// The per-edge memo and the river-crossing assessment cluster it depends on,
// extracted verbatim from bandDecision.ts. Candidate-family modules that evaluate
// a move/probe edge import getCandidateEdgeMemo from here instead of the
// orchestrator. Behavior is byte-identical to the pre-extraction inline versions.
import { deriveBandTendencies } from "../agents/bandTendency";
import { deriveCrossingPracticeRelief } from "../agents/crossingPractice";
import { deriveReportedKnowledgeTargetBias } from "../agents/reportedKnowledge";
import type { Band } from "../agents/types";
import type { TileId } from "../core/types";
import { getTile } from "../world/generate";
import {
  getRiverCrossingForMovement,
  getSeasonalRiverCrossingState,
  makeRiverCrossingKey,
  type RiverCrossingCapability,
} from "../world/hydrography";
import type { Tile, WorldState } from "../world/types";
import type {
  CandidateEdgeMemo,
  CandidateEvaluationCache,
  RiverMovementAssessment,
} from "./decisionCandidateTypes";
import { clamp01, isBandPassableDestination, measureDecision, round2 } from "./decisionScoring";
import type { MobilityIntentKind } from "./types";

// Per-decision memoized reported-knowledge target bias — a band's own bounded
// second-hand-report influence on a candidate target, cached per decision.
export function getReportedKnowledgeTargetBias(
  band: Band,
  tileId: TileId,
  decisionCache: CandidateEvaluationCache,
  input: Parameters<typeof deriveReportedKnowledgeTargetBias>[2],
): ReturnType<typeof deriveReportedKnowledgeTargetBias> {
  const usableEvidence = input.targetKnown || input.routeEvidence || input.localEvidence === true;
  const key = [
    String(tileId),
    input.currentTick,
    usableEvidence ? "usable" : "unusable",
  ].join("|");
  const cached = decisionCache.reportedBiasByKey.get(key);

  if (cached !== undefined) {
    decisionCache.profiler?.count?.("reportBiasCacheHits");
    return cached;
  }

  const bias = measureDecision(
    decisionCache.profiler,
    "reportBiasIntegration",
    () => deriveReportedKnowledgeTargetBias(band, tileId, input),
  );
  decisionCache.reportedBiasByKey.set(key, bias);
  decisionCache.profiler?.count?.("reportBiasComputed");

  return bias;
}

export function getCandidateEdgeMemo(
  world: WorldState,
  band: Band,
  fromTileId: TileId,
  toTileId: TileId,
  intentKind: MobilityIntentKind | undefined,
  decisionCache: CandidateEvaluationCache,
): CandidateEdgeMemo {
  const edgeKey = `${fromTileId}->${toTileId}:${intentKind ?? "none"}`;
  const existing = decisionCache.edgeScoresByEdgeKey.get(edgeKey);

  if (existing !== undefined) {
    return existing;
  }

  const memo = measureDecision(
    decisionCache.profiler,
    "candidatePassabilityChecks",
    () => {
      const targetTile = getTile(world, toTileId);

      return {
        edgeKey,
        toTilePassable: targetTile !== undefined && isBandPassableDestination(targetTile),
        riverAssessment: getRiverMovementAssessment(world, band, fromTileId, toTileId, intentKind),
      };
    },
  );

  decisionCache.edgeScoresByEdgeKey.set(edgeKey, memo);

  return memo;
}

export function getRiverMovementAssessment(
  world: WorldState,
  band: Band,
  fromTileId: TileId,
  toTileId: TileId,
  intentKind: MobilityIntentKind | undefined,
): RiverMovementAssessment {
  const capability = getBandRiverCrossingCapability(band);
  const crossing = getRiverCrossingForMovement(world, fromTileId, toTileId);
  const fromTile = world.tiles[fromTileId];
  const toTile = world.tiles[toTileId];
  const memory = crossing === undefined
    ? undefined
    : band.crossingMemories[makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId)];
  const seasonalState =
    crossing === undefined
      ? undefined
      : getSeasonalRiverCrossingState(world, crossing, capability);
  const memoryUseCount = memory?.useCount ?? 0;
  const knownFordValue = crossing === undefined
    ? 0
    : clamp01(
        (crossing.knownFord ? 0.3 : 0) +
          (memory?.successConfidence ?? 0) * 0.34 +
          (memory?.seasonalReliability ?? 0) * 0.24 -
          (memory?.riskMemory ?? crossing.risk) * 0.18,
      );
  const riverCorridorValue = getRiverCorridorValue(fromTile, toTile, intentKind);
  const rawCost = seasonalState?.effectiveCrossingCost ?? 0;
  const rawRisk = seasonalState?.effectiveRisk ?? 0;
  // CAUSAL-REPAIR-1 — one real local learning loop (crossingPractice.ts):
  // repeated successful use of THIS crossing earns a bounded, perishable
  // relief on the crossing risk the decision pays here. The band's stable
  // crossing-caution tendency shifts the risk it perceives ±12% before relief.
  const crossingPracticeRelief = deriveCrossingPracticeRelief(memory, Number(world.time.tick)).relief;
  const crossingCautionScale = 1 + deriveBandTendencies(band).crossingCaution * 0.12;

  return {
    crossing,
    seasonalState,
    capability,
    capabilityLabel: formatRiverCapability(capability),
    riverCrossingCost: round2(clamp01(rawCost / 2.8)),
    riverCrossingRisk: round2(clamp01(rawRisk * crossingCautionScale * (1 - crossingPracticeRelief))),
    riverCorridorValue,
    knownFordValue: round2(knownFordValue),
    blockedCrossingPenalty: seasonalState?.isBlockedWithoutCapability === true ? 1 : 0,
    memoryUseCount,
    crossingPracticeRelief,
  };
}

export function getBandRiverCrossingCapability(band: Band): RiverCrossingCapability {
  const crossingPractice = Object.values(band.crossingMemories).some((memory) =>
    memory.useCount >= 2 && memory.successConfidence >= 0.5);
  const aquaticPractice = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.taskGroupType === "fishing_group" || trip.taskGroupType === "water_group").length >= 3;
  const engineeringResponse = (band.practicalAdaptation?.responses ?? []).some((response) =>
    response.family === "engineering_structure" &&
    (response.status === "forming" || response.status === "active"));
  const fragments = band.practicalAdaptation?.fragments ?? [];
  const componentSubjects = new Set(fragments
    .filter((fragment) => fragment.knowledgeState !== "incorrect" && fragment.knowledgeState !== "dormant")
    .map((fragment) => fragment.subject));
  const componentBasis = componentSubjects.has("buoyancy_under_load") &&
    componentSubjects.has("binding_under_load") &&
    componentSubjects.has("staged_shuttle_crossing");

  return {
    canUseFords: true,
    canUseShallowCrossings: crossingPractice || aquaticPractice || engineeringResponse,
    canAttemptBasicRaftCrossing: engineeringResponse && componentBasis,
  };
}

export function formatRiverCapability(capability: RiverCrossingCapability): string {
  return [
    capability.canUseFords ? "fords" : undefined,
    capability.canUseShallowCrossings ? "shallow" : undefined,
    capability.canAttemptBasicRaftCrossing ? "basic_raft" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("+") || "none";
}

export function getRiverCorridorValue(
  fromTile: Tile | undefined,
  toTile: Tile | undefined,
  intentKind: MobilityIntentKind | undefined,
): number {
  if (fromTile === undefined || toTile === undefined) {
    return 0;
  }

  const sameRiverSegment =
    fromTile.riverSegmentId !== undefined &&
    fromTile.riverSegmentId === toTile.riverSegmentId;
  const bothRiverLandscape =
    (fromTile.isRiverbank || fromTile.isFloodplain || fromTile.isRiver || fromTile.isMarshChannel) &&
    (toTile.isRiverbank || toTile.isFloodplain || toTile.isRiver || toTile.isMarshChannel);
  const confluenceBonus = toTile.isConfluence ? 0.18 : 0;
  const estuaryBonus = toTile.isEstuary ? 0.14 : 0;
  const intentBonus = intentKind === "follow_river_corridor" ? 0.22 : 0;
  const continuity = clamp01(
    (sameRiverSegment ? 0.44 : 0) +
      (bothRiverLandscape ? 0.28 : 0) +
      confluenceBonus +
      estuaryBonus +
      intentBonus,
  );

  return round2(continuity);
}
