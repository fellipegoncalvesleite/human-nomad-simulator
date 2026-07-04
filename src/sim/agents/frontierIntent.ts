// FrontierIntent v0 (checkpoint M0.3) — Bounded, decaying, anti-omniscient
// sustained-frontier-drift intent.
//
// WHY THIS EXISTS (M0.2 root cause): fission and corridor probing already happen,
// but `FrontierDispersalPressure` is recomputed statelessly every tick, so a
// band-known corridor opportunity never accumulates into SUSTAINED frontier
// intent. Daughters make local hops/loops instead of maintaining outward drift.
// M0.2 evidence: 21 active bands within 10 tiles of origin, 0 daughters sustaining
// a new range for 25+ years, localLoopScore 0.81, classification
// `corridor_probe_without_frontier`.
//
// WHAT THIS DOES: converts REPEATED band-known evidence (corridor memory, repeated
// probes, known-unused opportunity, crowding, poor returns, daughter/frontier
// pressure) into a small PERSISTENT intent that DECAYS over time. It is used only
// to (a) bias daughter/fission targets further along a known corridor, and (b) add
// a bounded pull to logistical-probe / move candidate scoring so a frontier group
// keeps drifting for a while.
//
// HARD SCOPE LOCK (M0.3): no rich-tile migration, no omniscient richness (reads
// only band-known/scouted/inherited fields, never hidden tile truth), no forced
// daughter departure, no global attachment weakening, no all-band nomadism, no
// yield/stress/mortality/carrying-capacity/plant/cause change, no unseeded random call,
// no `any`, no UI/render/React/Zustand imports. Fully reversible: when evidence
// fades the intent decays to `undefined` and leaves no permanent trace.

import type { BandId, Coord, ReasonId, TickNumber, TileId } from "../core/types";
import type {
  Band,
  FrontierCorridorKind,
  FrontierIntentSource,
  FrontierIntentState,
} from "./types";
import type { WorldState } from "../world/types";
import { getTile } from "../world/generate";

// --- Bounds (all intentionally small so intent is a tie-breaker, never a teleport) ---
const MAX_STRENGTH = 0.85;
const STRENGTH_GAIN = 0.16; // per supported tick, scaled by evidence — slow accrual
const STRENGTH_DECAY = 0.08; // per unsupported tick — decays gradually so a band can hold a reached frontier
const MIN_STRENGTH_FLOOR = 0.06; // below this the intent is cleared (→ undefined)
const MAX_AGE_TICKS = 80; // ~20 years hard cap: prevents endless one-direction drift
const MAX_EVIDENCE_STREAK = 24;
const EVIDENCE_THRESHOLD = 0.32; // below this, the tick counts as UNsupported (decay)
const DAUGHTER_INHERIT_FACTOR = 0.6; // degraded inheritance, never a hard lock
const REPEATED_PROBE_COUNT = 2; // probeCount at/above which a probe counts as "repeated"
// A fresh band-known target is only adopted when it lies forward of (or sideways
// to) the anchored heading — cosine >= 0 allows following a corridor that bends
// but blocks the heading from reversing/rotating inward toward origin.
const TARGET_FORWARD_MIN = 0;
// Manhattan distance to the intent target within which a band is treated as having
// "arrived" and earns the stay-hold bonus (consolidate the frontier vs drift home).
const ARRIVAL_DISTANCE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function directionBetween(
  world: WorldState,
  fromTileId: TileId,
  toTileId: TileId,
): Coord | undefined {
  const fromTile = getTile(world, fromTileId);
  const toTile = getTile(world, toTileId);

  if (fromTile === undefined || toTile === undefined) {
    return undefined;
  }

  const dx = toTile.coord.x - fromTile.coord.x;
  const dy = toTile.coord.y - fromTile.coord.y;
  const magnitude = Math.hypot(dx, dy);

  if (magnitude <= 0.0001) {
    return undefined;
  }

  return { x: dx / magnitude, y: dy / magnitude };
}

function dot(a: Coord, b: Coord): number {
  return a.x * b.x + a.y * b.y;
}

interface FrontierIntentEvidence {
  readonly evidenceScore: number;
  readonly source: FrontierIntentSource;
  readonly targetTileId?: TileId;
  readonly directionVector?: Coord;
  readonly preferredCorridor: FrontierCorridorKind;
  readonly confidence: number;
}

// Read ONLY band-known fields. Every input below is derived elsewhere from the
// band's own observed/scouted/inherited memory (frontierDispersal candidates,
// known-unused opportunity, nearby-opportunity gradient, range saturation,
// return trend, probe recency) — never hidden tile truth richness.
function deriveFrontierIntentEvidence(
  world: WorldState,
  band: Band,
): FrontierIntentEvidence {
  const frontier = band.frontierDispersal;
  const frontierPressure = frontier?.pressure ?? 0;
  const colonization = band.daughterColonization;
  const opportunity = colonization?.bestKnownUnusedHabitatOpportunity;
  const nearby = band.nearbyOpportunity;
  const saturation = band.rangeSaturation?.saturationPressure ?? 0;
  const crowding =
    band.pressureState?.nearbyBandPressure ?? band.rangeSaturation?.nearbyCrowding ?? 0;
  const returnTrend = band.returnTrend;
  const isDaughter = band.parentBandId !== undefined;

  // --- Per-source evidence components, each band-known and in [0,1]. ---
  const corridorMemoryEv = clamp01(
    frontierPressure * 0.7 +
      ((frontier?.frontierCandidateTileIds.length ?? 0) > 0 ? 0.12 : 0),
  );
  const knownOpportunityEv =
    opportunity !== undefined
      ? clamp01(
          opportunity.expectedPerCapitaReturn * 0.5 +
            opportunity.confidence * 0.32 -
            opportunity.riskPenalty * 0.24,
        )
      : clamp01((nearby?.opportunityStrength ?? 0) * 0.6);
  const crowdingEv = clamp01(saturation * 0.7 + crowding * 0.45);
  const poorReturnEv = returnTrend === undefined
    ? 0
    : returnTrend.chronicDecline
      ? clamp01(0.4 + Math.max(0, -returnTrend.shortLongDelta))
      : clamp01(Math.max(0, -returnTrend.shortLongDelta) * 0.6);
  const repeatedProbeEv = clamp01(deriveRepeatedProbeSignal(band));
  const daughterEv = isDaughter ? 0.3 : 0;
  // M0.13: SUSTAINED HARDSHIP — chronic flat-bottom misery never trips
  // chronicDecline (nothing left to decline from), so it generated no intent
  // evidence and miserable corridor bands wandered isotropically for centuries.
  // Band-known economics only: the band's own 8-season return mean, and the
  // M0.11 sustained over-capacity signal.
  const sustainedHardshipEv = clamp01(
    Math.max(
      returnTrend === undefined ? 0 : (0.45 - returnTrend.mean8) * 1.4,
      (band.perCapitaReturn?.sustainedOverCapacity ?? 0) * 0.7,
    ),
  );

  // --- Pick the dominant source deterministically (fixed priority on ties). ---
  const ranked: ReadonlyArray<readonly [FrontierIntentSource, number]> = [
    ["known_unused_opportunity", knownOpportunityEv],
    ["corridor_memory", corridorMemoryEv],
    ["repeated_probe", repeatedProbeEv],
    ["crowding", crowdingEv],
    ["poor_return", poorReturnEv],
    ["sustained_hardship", sustainedHardshipEv],
    ["daughter_fission", daughterEv],
  ];
  let source: FrontierIntentSource = "corridor_memory";
  let best = -1;

  for (const [candidateSource, value] of ranked) {
    if (value > best) {
      best = value;
      source = candidateSource;
    }
  }

  // --- Target preference: a band-known frontier/opportunity tile. M0.13: when
  // none exists, the M0.12 corridor-continuation chain provides a LEGAL heading
  // — toward the band's farthest corridor-inferred tile (existence-only
  // direction, never value; the accepted M0.7/M0.8 precedent that inference
  // sets DIRECTION, not worth). Without this, chronically stressed corridor
  // bands had evidence but nowhere band-known to point it.
  const targetTileId =
    frontier?.bestFrontierTileId ??
    opportunity?.candidateTileId ??
    nearby?.bestKnownOpportunityTileId ??
    farthestCorridorInferredTileId(world, band);
  const directionVector =
    targetTileId === undefined ? undefined : directionBetween(world, band.position, targetTileId);
  const preferredCorridor = frontier?.preferredCorridor ?? "unknown";

  // Blended evidence: requires multiple aligned band-known signals, not one spike.
  // Attenuated when there is no concrete band-known target to drift toward.
  const blended = clamp01(
    corridorMemoryEv * 0.32 +
      knownOpportunityEv * 0.3 +
      crowdingEv * 0.22 +
      poorReturnEv * 0.16 +
      sustainedHardshipEv * 0.2 +
      repeatedProbeEv * 0.14 +
      daughterEv * 0.16,
  );
  const evidenceScore = targetTileId === undefined ? blended * 0.4 : blended;
  const confidence = clamp01(
    0.28 +
      corridorMemoryEv * 0.28 +
      (opportunity?.confidence ?? 0) * 0.3 +
      (targetTileId === undefined ? 0 : 0.12),
  );

  return { evidenceScore, source, targetTileId, directionVector, preferredCorridor, confidence };
}

// M0.13: the band's farthest corridor-continuation belief — the head of its own
// M0.12 inference chain. Bounded (≤ the corridor record budget), deterministic
// (distance then id tie-break), existence-only (used for HEADING, never value).
function farthestCorridorInferredTileId(world: WorldState, band: Band): TileId | undefined {
  const inferred = band.frontierKnowledge?.inferredTiles;

  if (inferred === undefined) {
    return undefined;
  }

  const origin = getTile(world, band.position);

  if (origin === undefined) {
    return undefined;
  }

  let best: TileId | undefined;
  let bestDistance = -1;

  for (const record of Object.values(inferred)) {
    if (record.source !== "corridor_continuation_inference") {
      continue;
    }

    const tile = getTile(world, record.tileId);

    if (tile === undefined) {
      continue;
    }

    const tileDistance =
      Math.abs(tile.coord.x - origin.coord.x) + Math.abs(tile.coord.y - origin.coord.y);

    if (
      tileDistance > bestDistance ||
      (tileDistance === bestDistance && best !== undefined && String(record.tileId) < String(best))
    ) {
      best = record.tileId;
      bestDistance = tileDistance;
    }
  }

  return best;
}

// "Repeated probe" signal: a recently, repeatedly probed band-known target — the
// band has been pushing on a frontier seam more than once. Bounded, probe-quality
// only; never reads yield/truth.
function deriveRepeatedProbeSignal(band: Band): number {
  const probe = band.probeMemory;

  if (probe === undefined) {
    return 0;
  }

  let best = 0;

  for (const record of probe.recentTargets) {
    if (record.probeCount >= REPEATED_PROBE_COUNT) {
      best = Math.max(best, clamp01(0.2 + record.probeCount * 0.12));
    }
  }

  return best;
}

function makeIntentReasonId(band: Band, tick: TickNumber, source: FrontierIntentSource): ReasonId {
  return `reason:${String(band.id)}:${String(tick)}:frontier_intent:${source}` as ReasonId;
}

// Tick-gated advance/decay. The several per-tick context passes share the same
// `world.time.tick`; the first pass this tick advances the intent, later passes
// see `lastUpdatedTick === tick` and return the prior value unchanged (idempotent,
// mirroring the returnTrend pattern so behaviour is deterministic per season).
export function advanceFrontierIntent(
  world: WorldState,
  band: Band,
): FrontierIntentState | undefined {
  const tick = world.time.tick;
  const prior = band.frontierIntent;

  if (prior !== undefined && prior.lastUpdatedTick === tick) {
    return prior;
  }

  const evidence = deriveFrontierIntentEvidence(world, band);
  const supported = evidence.evidenceScore >= EVIDENCE_THRESHOLD;
  const priorStrength = prior?.strength ?? 0;
  const age = (prior?.age ?? 0) + 1;

  let strength: number;
  let evidenceStreak: number;
  let source: FrontierIntentSource;
  let targetTileId = prior?.targetTileId;
  let directionVector = prior?.directionVector;
  let preferredCorridor = prior?.preferredCorridor ?? "unknown";

  if (supported) {
    strength = clamp(priorStrength + STRENGTH_GAIN * evidence.evidenceScore, 0, MAX_STRENGTH);
    evidenceStreak = Math.min(MAX_EVIDENCE_STREAK, (prior?.evidenceStreak ?? 0) + 1);
    source = evidence.source;
    preferredCorridor = evidence.preferredCorridor;

    // STICKY DIRECTION (M0.3 retention fix): the held drift direction is anchored
    // once established (a daughter anchors it to her genuinely-outward spawn
    // direction). We only course-correct toward fresh evidence when it is already
    // broadly the same heading (dot >= COURSE_LOCK), and even then never snap — we
    // keep the existing direction. This stops the failure where, after a band
    // colonises a frontier, the "best known frontier candidate" points back at the
    // rich known interior and the direction slowly rotates inward, dragging the
    // band home. The TARGET is only adopted when it lies FORWARD of the held heading.
    if (directionVector === undefined) {
      // No anchored heading yet → take the fresh evidence heading/target.
      directionVector = evidence.directionVector ?? directionVector;
      targetTileId = evidence.targetTileId ?? targetTileId;
    } else if (evidence.targetTileId !== undefined && evidence.directionVector !== undefined) {
      const headingAlignment = dot(directionVector, evidence.directionVector);

      if (headingAlignment >= TARGET_FORWARD_MIN) {
        // Fresh target lies forward of the anchored heading → drift toward it.
        targetTileId = evidence.targetTileId;
      }
      // Otherwise keep the prior forward target/heading (do not rotate inward).
    }
  } else {
    strength = priorStrength - STRENGTH_DECAY;
    evidenceStreak = Math.max(0, (prior?.evidenceStreak ?? 0) - 1);
    source = prior?.source ?? evidence.source;
  }

  // Clear when the intent is no longer justified or has run too long: reversible,
  // and prevents an endless one-direction migration.
  if (strength < MIN_STRENGTH_FLOOR || age > MAX_AGE_TICKS) {
    return undefined;
  }

  const confidence = clamp01(
    evidence.confidence * 0.6 + (evidenceStreak / MAX_EVIDENCE_STREAK) * 0.4,
  );
  const reasonIds = strength > EVIDENCE_THRESHOLD
    ? [makeIntentReasonId(band, tick, source)]
    : [];

  return {
    bandId: band.id,
    lastUpdatedTick: tick,
    targetTileId,
    directionVector,
    preferredCorridor,
    source,
    strength: round2(strength),
    confidence: round2(confidence),
    age,
    evidenceStreak,
    lastEvidenceScore: round2(evidence.evidenceScore),
    reasonIds,
    noOmniscientRichness: true,
  };
}

// Degraded frontier intent for a freshly-split daughter. Returned ONLY when the
// fission is frontier-driven (the caller passes `frontierDriven`); the daughter
// keeps a weakened outward drift so a lineage can sustain frontier range, but it
// is NOT a hard parent-attachment lock (attachment is inherited separately and
// this intent decays on its own if the daughter's own evidence does not renew it).
export function inheritFrontierIntentForDaughter(
  world: WorldState,
  parent: Band,
  daughterBandId: BandId,
  daughterTileId: TileId,
  frontierDriven: boolean,
  tick: TickNumber,
): FrontierIntentState | undefined {
  const parentIntent = parent.frontierIntent;
  const parentStrength = parentIntent?.strength ?? 0;
  // Base the daughter's seed on the stronger of the parent's held intent and the
  // act of frontier fission itself, so even a parent without a saved intent that
  // splits toward the frontier hands the daughter some outward drift.
  // M0.13 FOUNDER JOURNEY: a daughter born from a saturated/crowded parent
  // carries a bounded "seeking new range" persistence even when the fission was
  // not frontier-driven — she keeps testing outward corridors for some seasons
  // instead of instantly becoming an adjacent satellite. Decays exactly like
  // any intent (unsupported ticks), converts to normal residence when she
  // settles (M0.4), never forces departure, never reads truth richness — the
  // seed condition is the parent's OWN saturation/colonization economics.
  const crowdedParentSeed =
    (parent.perCapitaReturn?.sustainedOverCapacity ?? 0) > 0 ||
    (parent.daughterColonization?.pressure ?? 0) >= 0.45 ||
    (parent.rangeSaturation?.saturation ?? 0) >= 1
      ? 0.4
      : 0;
  const seedStrength = Math.max(
    parentStrength * DAUGHTER_INHERIT_FACTOR,
    frontierDriven ? 0.45 : 0,
    crowdedParentSeed,
  );

  if (seedStrength < MIN_STRENGTH_FLOOR) {
    return undefined;
  }

  // Continue outward: prefer the daughter's spawn direction (parent → daughter
  // tile), which is where the frontier split sent her, falling back to the
  // parent's intent direction.
  const spawnDirection =
    directionBetween(world, parent.position, daughterTileId) ?? parentIntent?.directionVector;

  return {
    bandId: daughterBandId,
    lastUpdatedTick: tick,
    targetTileId: parentIntent?.targetTileId,
    directionVector: spawnDirection,
    preferredCorridor: parentIntent?.preferredCorridor ?? "unknown",
    source: "daughter_fission",
    strength: round2(clamp(seedStrength, 0, MAX_STRENGTH)),
    confidence: round2(clamp01((parentIntent?.confidence ?? 0.4) * 0.7 + 0.1)),
    age: 0,
    evidenceStreak: 0,
    lastEvidenceScore: 0,
    reasonIds: [makeIntentReasonId(parent, tick, "daughter_fission")],
    noOmniscientRichness: true,
  };
}

// Signed alignment of a candidate destination with the band's held intent, scaled
// by intent strength. Returns +strength for the exact band-known target, a positive
// nudge for candidates heading broadly the same way as the held drift, and a MILD,
// ASYMMETRIC negative for candidates that backtrack toward origin while the intent
// is active (so a band that has reached a frontier prefers to HOLD rather than drift
// home — staying is neutral, never penalised). Bounded in [-strength, +strength], it
// is a tie-breaker only: it never overrides movement cost, refuge safety, or
// attachment (those terms remain in the scoring sum), and it decays with the intent.
const BACKTRACK_PENALTY_FACTOR = 0.5; // backward (toward-origin) penalty is half the forward reward

export function frontierIntentPull(
  world: WorldState,
  band: Band,
  destinationTileId: TileId,
): number {
  const intent = band.frontierIntent;

  if (intent === undefined || intent.strength < MIN_STRENGTH_FLOOR) {
    return 0;
  }

  // Exact target match → full forward reward.
  if (intent.targetTileId !== undefined && intent.targetTileId === destinationTileId) {
    return clamp01(intent.strength);
  }

  if (intent.directionVector === undefined) {
    return 0;
  }

  const toCandidate = directionBetween(world, band.position, destinationTileId);

  if (toCandidate === undefined) {
    return 0;
  }

  const alignment = clamp(dot(intent.directionVector, toCandidate), -1, 1);

  if (alignment >= 0) {
    return round2(alignment * intent.strength);
  }

  return round2(alignment * intent.strength * BACKTRACK_PENALTY_FACTOR);
}

// Stay-hold value for a band that has reached (or nearly reached) its band-known
// frontier target: a bounded bias to HOLD the frontier rather than drift back
// toward the inherited origin region once outward evidence fades. Applies ONLY to
// the stay option, only when the band is within ARRIVAL_DISTANCE of its target, and
// is scaled by intent strength (so it decays away naturally). It never overrides
// genuine stress/cost terms — it is a tie-breaker that lets a colonised frontier
// stick instead of looping home. Zero when the band is still far from its target
// (so it keeps drifting outward to get there).
export function frontierIntentHold(world: WorldState, band: Band): number {
  const intent = band.frontierIntent;

  if (intent === undefined || intent.strength < MIN_STRENGTH_FLOOR || intent.targetTileId === undefined) {
    return 0;
  }

  const fromTile = getTile(world, band.position);
  const targetTile = getTile(world, intent.targetTileId);

  if (fromTile === undefined || targetTile === undefined) {
    return 0;
  }

  const distance =
    Math.abs(fromTile.coord.x - targetTile.coord.x) + Math.abs(fromTile.coord.y - targetTile.coord.y);
  const proximity = clamp01(1 - distance / ARRIVAL_DISTANCE);

  return round2(intent.strength * proximity);
}

// Aligned-strength a daughter scoring should give a candidate frontier tile,
// based on the PARENT's held intent (so daughter targets are pushed further along
// the known corridor instead of staying local). Same anti-omniscient bounds.
export function parentFrontierIntentAlignment(
  world: WorldState,
  parent: Band,
  candidateTileId: TileId,
): number {
  return frontierIntentPull(world, parent, candidateTileId);
}
