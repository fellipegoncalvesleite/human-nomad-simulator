import type { NormalizedIntensity } from "../rules/types";
import type { TickNumber, TileId } from "../core/types";

// Probe recency memory + diminishing returns (checkpoint 2K.1G).
//
// PROBE-QUALITY ONLY. A logistical probe is a residence-unchanged scouting foray; it
// never relocates the band and never changes yield/stress/carrying-capacity. This
// module gives a band a small, bounded, deterministic memory of which targets it has
// recently probed and whether those probes were informative, so that:
//   - repeatedly probing the SAME target with no new information becomes less
//     attractive (diminishing returns), letting the band stay/forage/move instead;
//   - when several plausible probe targets exist, a less-recently-probed one is
//     preferred (target diversity);
// WITHOUT forbidding rational repeated water/refuge rechecking under genuine stress.
// No map scans, no known-tiles sweep, no hidden truth — it reasons only from the
// band's own bounded probe history + the candidate set handed to it.

// Bounded number of distinct recently-probed targets retained per band.
const PROBE_RECENCY_CAP = 6;
// A probe record older than this (in ticks/seasons) is pruned — a band that has not
// rechecked a place in a long time may legitimately rescout it (the loop has "cooled").
const PROBE_RECENCY_DORMANT_TICKS = 24;
// How fast the recency weight fades: a target probed this many ticks ago no longer
// contributes a diminishing-return penalty.
const PROBE_RECENCY_DECAY_TICKS = 12;
// consecutiveNoGain at which the repeat penalty saturates.
const PROBE_NOGAIN_SATURATION = 5;
// consecutiveNoGain (recent) at which we flag an explicit same-target loop.
const PROBE_LOOP_THRESHOLD = 4;
// Hard ceiling on the raw diminishing-return penalty (a normalized intensity).
const PROBE_DR_PENALTY_CAP = 1;

export interface ProbeTargetRecord {
  readonly tileId: TileId;
  readonly lastProbedTick: TickNumber;
  // Recent probes of this target (saturating, bounded by dormancy pruning).
  readonly probeCount: number;
  // Consecutive recent probes that revealed no new known tile (reset on info gain).
  readonly consecutiveNoGain: number;
  readonly lastInfoGainTick?: TickNumber;
}

export interface ProbeRecencyMemory {
  readonly lastProbeTileId?: TileId;
  readonly lastProbeTick?: TickNumber;
  readonly recentTargets: readonly ProbeTargetRecord[];
}

export type ProbeReason =
  | "water_refuge_check"
  | "corridor_check"
  | "resource_belief_check"
  | "exhausted_range_probe"
  | "repeated_water_refuge_check"
  | "mixed";

export interface ProbeDiminishingReturn {
  readonly targetTileId: TileId;
  readonly lastProbedTick?: TickNumber;
  readonly recentProbeRepeatCount: number;
  readonly consecutiveNoGain: number;
  // 1 = never/long-ago probed (fully novel); 0 = just probed.
  readonly probeNoveltyScore: NormalizedIntensity;
  // Subtracted (scaled) from the probe candidate score.
  readonly probeDiminishingReturnPenalty: NormalizedIntensity;
  // Rough expectation that this probe reveals something (novelty-weighted).
  readonly probeExpectedInfoGain: NormalizedIntensity;
  readonly sameTargetLoopDetected: boolean;
  // True when water need (stress / no safer alternative / low route confidence)
  // legitimately overrides the diversity penalty — the recheck is rational.
  readonly waterNeedOverridesDiversity: boolean;
  readonly noSaferProbeTarget: boolean;
  readonly probeReason: ProbeReason;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createEmptyProbeRecencyMemory(): ProbeRecencyMemory {
  return { recentTargets: [] };
}

function findRecord(
  memory: ProbeRecencyMemory | undefined,
  tileId: TileId,
): ProbeTargetRecord | undefined {
  return memory?.recentTargets.find((record) => record.tileId === tileId);
}

// Recency weight in [0,1]: 1 if probed this tick, fading to 0 by PROBE_RECENCY_DECAY_TICKS.
function recencyWeight(record: ProbeTargetRecord | undefined, currentTick: number): number {
  if (record === undefined) {
    return 0;
  }
  const ticksSince = Math.max(0, currentTick - Number(record.lastProbedTick));
  return clamp01(1 - ticksSince / PROBE_RECENCY_DECAY_TICKS);
}

// Novelty of probing `tileId` now, given the band's own recent probe history.
export function probeTargetNovelty(
  memory: ProbeRecencyMemory | undefined,
  tileId: TileId,
  currentTick: number,
): number {
  return round2(1 - recencyWeight(findRecord(memory, tileId), currentTick));
}

// 2K.12: how clearly a positively seasonal-biased water prospect must beat the water
// logic's own best (effective novelty + seasonal bias) before the water-check diverts to
// it. A margin so a tiny remembered preference never flaps the choice.
const SEASONAL_PROBE_DIVERT_MARGIN = 0.05;

// Among plausible probe targets, prefer a less-recently-probed one — but only switch
// away from the prospect's own best target when that best is in a detected
// no-information loop AND a meaningfully more novel alternative exists. Otherwise keep
// the water/route logic's choice (no random wandering). Deterministic tie-break by id.
//
// 2K.12: an optional `seasonalBiasByTile` (band-learned, bounded, selection-only — computed
// by the caller from the band's own seasonalEcologyMemory) lets a remembered reliable-water
// prospect win the water-check by a clear margin. When the map is absent (default) or no
// candidate carries a positive bias, this is BYTE-IDENTICAL to the prior behaviour.
export function chooseDiverseProbeTarget(
  candidateTileIds: readonly TileId[],
  bestTileId: TileId,
  memory: ProbeRecencyMemory | undefined,
  currentTick: number,
  seasonalBiasByTile?: Readonly<Record<TileId, number>>,
): { readonly tileId: TileId; readonly noveltyScore: number; readonly switched: boolean } {
  const bestNovelty = probeTargetNovelty(memory, bestTileId, currentTick);

  if (seasonalBiasByTile !== undefined && candidateTileIds.length > 1) {
    const bestEffective = bestNovelty + (seasonalBiasByTile[bestTileId] ?? 0);
    let chosen: TileId | undefined;
    let chosenEffective = -Infinity;
    for (const candidate of candidateTileIds) {
      const candidateBias = seasonalBiasByTile[candidate] ?? 0;
      if (candidate === bestTileId || candidateBias <= 0) {
        continue; // only a POSITIVE remembered seasonal preference may divert a water-check
      }
      const effective = probeTargetNovelty(memory, candidate, currentTick) + candidateBias;
      if (effective <= bestEffective + SEASONAL_PROBE_DIVERT_MARGIN) {
        continue;
      }
      if (effective > chosenEffective || (effective === chosenEffective && (chosen === undefined || String(candidate) < String(chosen)))) {
        chosen = candidate;
        chosenEffective = effective;
      }
    }
    if (chosen !== undefined) {
      return { tileId: chosen, noveltyScore: probeTargetNovelty(memory, chosen, currentTick), switched: true };
    }
  }

  const bestRecord = findRecord(memory, bestTileId);
  const bestInLoop =
    bestRecord !== undefined &&
    bestRecord.consecutiveNoGain >= PROBE_LOOP_THRESHOLD &&
    recencyWeight(bestRecord, currentTick) > 0.4;

  if (!bestInLoop || candidateTileIds.length <= 1) {
    return { tileId: bestTileId, noveltyScore: bestNovelty, switched: false };
  }

  let chosen = bestTileId;
  let chosenNovelty = bestNovelty;
  for (const candidate of candidateTileIds) {
    if (candidate === bestTileId) {
      continue;
    }
    const novelty = probeTargetNovelty(memory, candidate, currentTick);
    // Require a clear novelty margin so we only divert out of a real loop.
    if (
      novelty > chosenNovelty + 0.2 ||
      (novelty > chosenNovelty && String(candidate) < String(chosen))
    ) {
      chosen = candidate;
      chosenNovelty = novelty;
    }
  }

  return { tileId: chosen, noveltyScore: chosenNovelty, switched: chosen !== bestTileId };
}

// Diminishing return for probing `targetTileId` now. Penalty grows with recent,
// repeated, no-information probes of the SAME target and fades with time; it is
// suppressed when water need makes the recheck rational (high water stress, no safer
// alternative target, or low route confidence). Probe-quality only.
export function deriveProbeDiminishingReturn(
  memory: ProbeRecencyMemory | undefined,
  targetTileId: TileId,
  currentTick: number,
  context: {
    readonly waterStress: NormalizedIntensity;
    readonly routeConfidence: NormalizedIntensity;
    readonly hasAlternativeTarget: boolean;
    readonly resourceBeliefRelevant: boolean;
    readonly exhaustedRangeStress: NormalizedIntensity;
  },
): ProbeDiminishingReturn {
  const record = findRecord(memory, targetTileId);
  const recency = recencyWeight(record, currentTick);
  const consecutiveNoGain = record?.consecutiveNoGain ?? 0;
  const repeatFactor = clamp01(consecutiveNoGain / PROBE_NOGAIN_SATURATION);
  const novelty = round2(1 - recency);
  // Only recent AND repeated AND no-gain probing is penalised.
  const rawPenalty = PROBE_DR_PENALTY_CAP * recency * repeatFactor;

  // Water need / lack of a safer alternative / low route confidence make a repeated
  // recheck rational — suppress the diversity penalty (but keep it labelled).
  const noSaferProbeTarget = !context.hasAlternativeTarget;
  const waterNeedOverridesDiversity =
    context.waterStress > 0.5 || noSaferProbeTarget || context.routeConfidence < 0.3;
  const suppression = clamp01(
    Math.max(
      context.waterStress > 0.5 ? 0.85 : 0,
      noSaferProbeTarget ? 0.6 : 0,
      context.routeConfidence < 0.3 ? 0.5 : 0,
    ),
  );
  const penalty = round2(clamp01(rawPenalty * (1 - suppression)));

  const sameTargetLoopDetected =
    consecutiveNoGain >= PROBE_LOOP_THRESHOLD && recency > 0.4;

  const probeReason: ProbeReason =
    context.waterStress > 0.5 && sameTargetLoopDetected
      ? "repeated_water_refuge_check"
      : context.waterStress > 0.5
        ? "water_refuge_check"
        : context.resourceBeliefRelevant
          ? "resource_belief_check"
          : context.exhaustedRangeStress > 0.5
            ? "exhausted_range_probe"
            : context.routeConfidence < 0.4
              ? "corridor_check"
              : "mixed";

  return {
    targetTileId,
    lastProbedTick: record?.lastProbedTick,
    recentProbeRepeatCount: record?.probeCount ?? 0,
    consecutiveNoGain,
    probeNoveltyScore: novelty,
    probeDiminishingReturnPenalty: penalty,
    probeExpectedInfoGain: round2(clamp01(novelty * 0.7 + (1 - repeatFactor) * 0.3)),
    sameTargetLoopDetected,
    waterNeedOverridesDiversity,
    noSaferProbeTarget,
    probeReason,
  };
}

// Record an applied probe. Deterministic, bounded: prunes dormant targets, updates or
// inserts the probed target, resets the no-gain streak on information gain, and caps
// the retained set (evicting the least-recently-probed).
export function recordProbe(
  memory: ProbeRecencyMemory | undefined,
  targetTileId: TileId,
  currentTick: TickNumber,
  infoGained: boolean,
): ProbeRecencyMemory {
  const previous = memory?.recentTargets ?? [];
  const kept = previous.filter(
    (record) =>
      record.tileId !== targetTileId &&
      currentTick - Number(record.lastProbedTick) < PROBE_RECENCY_DORMANT_TICKS,
  );
  const existing = previous.find((record) => record.tileId === targetTileId);
  const updated: ProbeTargetRecord = {
    tileId: targetTileId,
    lastProbedTick: currentTick,
    probeCount: Math.min(99, (existing?.probeCount ?? 0) + 1),
    consecutiveNoGain: infoGained ? 0 : (existing?.consecutiveNoGain ?? 0) + 1,
    lastInfoGainTick: infoGained ? currentTick : existing?.lastInfoGainTick,
  };

  const recentTargets = [updated, ...kept]
    .sort((a, b) => Number(b.lastProbedTick) - Number(a.lastProbedTick))
    .slice(0, PROBE_RECENCY_CAP);

  return {
    lastProbeTileId: targetTileId,
    lastProbeTick: currentTick,
    recentTargets,
  };
}
