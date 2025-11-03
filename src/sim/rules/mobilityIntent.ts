import type {
  Band,
  CorridorHeadingSource,
  CorridorHeadingState,
  DaughterColonizationPressure,
  FrontierProbeCadenceState,
  InitialSpawnProfileRole,
  MobilityBehaviorBasis,
  PlaceMemoryRecord,
} from "../agents/types";
import { deriveMobilityBehaviorBasis } from "../agents/mobilityBehaviorBasis";
import type {
  BandId,
  Coord,
  ReasonId,
  TickNumber,
  TileId,
} from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import type {
  MobilityIntent,
  MobilityIntentKind,
  MobilityIntentStatus,
  NormalizedIntensity,
  Reason,
} from "./types";

export interface MobilityIntentEvaluation {
  readonly status: MobilityIntentStatus;
  readonly activeIntent?: MobilityIntent;
  readonly previousIntent?: MobilityIntent;
  readonly lifecycleReason: Reason;
}

interface IntentCandidate {
  readonly intent: MobilityIntent;
  readonly score: number;
}

interface MobilityContext {
  readonly currentTile: Tile;
  readonly currentRecord: KnownTileRecord;
  readonly currentValue: number;
  readonly mobilityPressure: number;
  readonly survivalPressure: number;
  readonly knownTileCount: number;
  readonly profileRole?: InitialSpawnProfileRole;
  readonly previousVector?: Coord;
}

// Affinity above which an ecology/experience signal opens the matching corridor /
// dispersal intent (2I.6). The starting profile feeds these affinities only as a
// decaying weak prior, so it can open an intent at birth but not once experience
// outweighs it.
const CORRIDOR_AFFINITY_THRESHOLD = 0.3;
const DRY_MARGIN_AFFINITY_THRESHOLD = 0.4;

// M0.8-B — shoreline/frontier wandering calming. The pre-existing affinity-driven shore
// probes (`probe_coast` / `probe_wetland_or_lake` / pressure-driven `expand_known_world`)
// re-open every few seasons (the anti-repeat filter then forces the band onto the OTHER
// shore kind), so a settled/parent band on a permanently-high-affinity shore drifts back
// and forth every season. After FRONTIER_PROBE_BURST_LIMIT consecutive `frontier_probe`
// moves the band must re-anchor for FRONTIER_PROBE_COOLDOWN_SEASONS before another such
// probe is OFFERED — turning a continuous drift into bursts-with-rests. This caps cadence
// only; it never forces movement, never reads truth/inferred richness, and leaves survival
// (water/risk/return), local foraging, river/pass corridor following, knowledge-poor
// expansion, and genuine daughter expansion (frontier_dispersal_pressure intents) untouched.
const FRONTIER_PROBE_BURST_LIMIT = 3;
const FRONTIER_PROBE_COOLDOWN_SEASONS = 8;

// True while the band is in its post-burst re-anchor cooldown. Purely DERIVED from the
// cadence state + current tick (no write-back), so it is deterministic and side-effect-free.
// Undefined cadence (never probed, or a fresh daughter) is never cooling.
export function isFrontierProbeCooling(band: Band, world: WorldState): boolean {
  const cadence = band.frontierProbeCadence;

  if (cadence === undefined) {
    return false;
  }

  const seasonsSinceLastProbeMove = world.time.tick - cadence.lastProbeMoveTick;

  return (
    cadence.consecutiveProbeMoves >= FRONTIER_PROBE_BURST_LIMIT &&
    seasonsSinceLastProbeMove < FRONTIER_PROBE_COOLDOWN_SEASONS
  );
}

// Advance the cadence governor when a mobility-intent `frontier_probe` move executes: stamp
// this tick and grow the consecutive-probe run. A rest of a full cooldown since the last
// probe move means the band genuinely re-anchored, so the run restarts at 1 (fresh burst).
export function advanceFrontierProbeCadence(
  prior: FrontierProbeCadenceState | undefined,
  tick: TickNumber,
): FrontierProbeCadenceState {
  const seasonsSinceLast = prior === undefined ? Infinity : tick - prior.lastProbeMoveTick;
  const priorRun =
    prior === undefined || seasonsSinceLast >= FRONTIER_PROBE_COOLDOWN_SEASONS
      ? 0
      : prior.consecutiveProbeMoves;

  return { lastProbeMoveTick: tick, consecutiveProbeMoves: priorRun + 1 };
}

// ---------------------------------------------------------------------------------------------
// M0.9 — Directional Corridor Persistence v0.
// A bounded, anti-omniscient HEADING earned from realized probe/corridor moves. See
// CorridorHeadingState. All influence is a SMALL tie-breaker; it never reads richness, never
// names a target, never forces movement, and works WITH the M0.8-B cadence (it can only bias
// candidates that are already being offered — when the band is cooling, there is nothing to bias).
// ---------------------------------------------------------------------------------------------
const HEADING_STRENGTH_CAP = 0.85;
const HEADING_STRENGTH_STEP = 0.2; // gained per aligned, frontier-expanding step
const HEADING_SEED_STRENGTH = 0.22; // initial strength of a freshly formed/re-seeded heading
const HEADING_ALIGN_MIN = 0.5; // dot ≥ this ⇒ "same direction" (≈ within 60°)
const HEADING_EMA = 0.34; // blend of the new realized direction into the remembered heading
const HEADING_SIDEWAYS_DECAY = 0.78; // strength ×= this on a step that did not clearly progress
const HEADING_REVERSAL_DECAY = 0.4; // strength ×= this when the band turns back
const HEADING_MAX_AGE_SEASONS = 20; // a heading with no progress for this long has fully decayed
// Influence caps (tie-breaker scale): direction blend ≤ this × strength; continuity score bonus
// ≤ this × strength. Both small enough that clearly-better known LOCAL value still wins.
const HEADING_DIRECTION_BLEND = 0.5;
const HEADING_CONTINUITY_BONUS = 0.06;

// Read-time effective strength: a heading fades while the band rests (no progress), so it
// SURVIVES the M0.8-B cooldown at reduced strength (enabling "rest, then continue the heading")
// but is gone after HEADING_MAX_AGE_SEASONS idle. Purely derived → deterministic, no write-back.
export function effectiveCorridorHeadingStrength(
  heading: CorridorHeadingState | undefined,
  tick: TickNumber,
): number {
  if (heading === undefined) {
    return 0;
  }

  const ageSeasons = Math.max(0, Number(tick) - Number(heading.lastProgressTick));
  const ageFactor = Math.max(0, 1 - ageSeasons / HEADING_MAX_AGE_SEASONS);

  return clamp01(heading.strength * ageFactor);
}

// The active heading influence (age-decayed) a band may use as a tie-breaker, or undefined when
// there is no usable heading. Anti-omniscient: only the band's own realized-motion heading.
function getActiveCorridorHeading(
  band: Band,
  world: WorldState,
): { readonly headingVector: Coord; readonly strength: number } | undefined {
  const heading = band.corridorHeading;
  const strength = effectiveCorridorHeadingStrength(heading, world.time.tick);

  if (heading === undefined || strength <= 0.04) {
    return undefined;
  }

  return { headingVector: heading.headingVector, strength };
}

// Blend a candidate's freshly-derived direction toward the remembered heading, by an amount
// proportional to (capped) heading strength. Keeps the band on its recent bearing without
// overriding the ecology-derived corridor direction.
function blendDirectionTowardHeading(
  derived: Coord | undefined,
  heading: { readonly headingVector: Coord; readonly strength: number } | undefined,
): Coord | undefined {
  if (heading === undefined) {
    return derived;
  }

  if (derived === undefined) {
    return heading.headingVector;
  }

  const w = Math.min(0.5, HEADING_DIRECTION_BLEND * heading.strength);

  return normalizeVector(sumVectors([scaleVector(derived, 1 - w), scaleVector(heading.headingVector, w)])) ?? derived;
}

// Small, signed continuity tie-breaker for a frontier candidate: positive when its direction
// continues the heading, mildly negative on a reversal (discourages immediate backtracking).
// Bounded by HEADING_CONTINUITY_BONUS × strength → never beats clearly-better local value.
function corridorHeadingContinuityBonus(
  candidateDirection: Coord | undefined,
  heading: { readonly headingVector: Coord; readonly strength: number } | undefined,
): number {
  if (heading === undefined || candidateDirection === undefined) {
    return 0;
  }

  const alignment = dotVectors(candidateDirection, heading.headingVector); // [-1, 1]

  return HEADING_CONTINUITY_BONUS * heading.strength * alignment;
}

// Advance the heading when a realized probe/corridor MOVE executes. `realizedDirection` is the
// direction actually walked (old→new tile); `knownTileCountNow` is the band's post-move known
// count (frontier expansion signal). Anti-omniscient: derived from the band's own motion +
// observation only.
export function advanceCorridorHeading(
  prior: CorridorHeadingState | undefined,
  realizedDirection: Coord | undefined,
  knownTileCountNow: number,
  source: CorridorHeadingSource,
  reasonId: ReasonId | undefined,
  tick: TickNumber,
): CorridorHeadingState | undefined {
  const direction = realizedDirection === undefined ? undefined : normalizeVector(realizedDirection);

  if (direction === undefined) {
    return prior; // a zero-length move carries no directional information
  }

  const reasonIds = reasonId === undefined ? [] : [reasonId];

  if (prior === undefined) {
    return {
      headingVector: direction,
      strength: HEADING_SEED_STRENGTH,
      source,
      lastProgressTick: tick,
      consecutiveProgressSteps: 1,
      knownTileCountAtProgress: knownTileCountNow,
      reasonIds,
      noOmniscientRichness: true,
    };
  }

  const alignment = dotVectors(prior.headingVector, direction); // [-1, 1]
  const expandedFrontier = knownTileCountNow > prior.knownTileCountAtProgress;

  if (alignment >= HEADING_ALIGN_MIN && expandedFrontier) {
    // Genuine continued progress: blend the heading, strengthen (capped), extend the run.
    const blended =
      normalizeVector(
        sumVectors([scaleVector(prior.headingVector, 1 - HEADING_EMA), scaleVector(direction, HEADING_EMA)]),
      ) ?? prior.headingVector;

    return {
      headingVector: blended,
      strength: clamp01(Math.min(HEADING_STRENGTH_CAP, prior.strength + HEADING_STRENGTH_STEP)),
      source,
      lastProgressTick: tick,
      consecutiveProgressSteps: prior.consecutiveProgressSteps + 1,
      knownTileCountAtProgress: knownTileCountNow,
      reasonIds,
      noOmniscientRichness: true,
    };
  }

  if (alignment < 0) {
    // Turned back. Decay hard; if this reversal opened NEW frontier (rounding a corner), re-seed
    // a fresh heading at modest strength, else keep the old bearing weakly so a momentary wobble
    // does not erase a good heading.
    return {
      headingVector: expandedFrontier ? direction : prior.headingVector,
      strength: clamp01(Math.max(prior.strength * HEADING_REVERSAL_DECAY, expandedFrontier ? HEADING_SEED_STRENGTH : 0)),
      source: expandedFrontier ? source : prior.source,
      lastProgressTick: expandedFrontier ? tick : prior.lastProgressTick,
      consecutiveProgressSteps: expandedFrontier ? 1 : 0,
      knownTileCountAtProgress: knownTileCountNow,
      reasonIds: expandedFrontier ? reasonIds : prior.reasonIds,
      noOmniscientRichness: true,
    };
  }

  // Sideways drift or a step that opened no new frontier (re-treading known shore): hold the
  // bearing but let strength fade so oscillation cannot masquerade as a heading.
  return {
    headingVector: prior.headingVector,
    strength: clamp01(prior.strength * HEADING_SIDEWAYS_DECAY),
    source: prior.source,
    lastProgressTick: prior.lastProgressTick,
    consecutiveProgressSteps: 0,
    knownTileCountAtProgress: knownTileCountNow,
    reasonIds: prior.reasonIds,
    noOmniscientRichness: true,
  };
}

export function evaluateMobilityIntent(
  world: WorldState,
  band: Band,
): MobilityIntentEvaluation {
  const context = getMobilityContext(world, band);

  if (context === undefined) {
    const lifecycleReason = makeIntentReason(world, band.id, "had-no-context", {
      type: "insufficient_known_tiles",
      strength: 1,
      confidence: 0.35,
      relatedTileIds: [band.position],
      knownTileCount: Object.keys(band.knowledge.observedTiles).length,
    });

    return {
      status: "had_no_intent",
      lifecycleReason,
    };
  }

  const previousIntent = band.currentIntent;

  if (previousIntent !== undefined) {
    if (hasCompletedIntent(world, band, previousIntent, context)) {
      return getReplacementEvaluation(world, band, context, previousIntent, "completed_intent");
    }

    if (shouldAbandonIntent(previousIntent, context)) {
      return getReplacementEvaluation(world, band, context, previousIntent, "abandoned_intent");
    }

    if (!isIntentExpired(world, previousIntent)) {
      const lifecycleReason = makeIntentReason(world, band.id, "continued", {
        type: "intent_continuation",
        strength: previousIntent.persistence,
        confidence: previousIntent.confidence,
        relatedTileIds: getIntentRelatedTiles(context.currentTile.id, previousIntent),
        intentKind: previousIntent.kind,
        currentTileId: context.currentTile.id,
        targetTileId: previousIntent.targetTileId,
        directionVector: previousIntent.directionVector,
      });

      return {
        status: "continued_intent",
        activeIntent: previousIntent,
        previousIntent,
        lifecycleReason,
      };
    }

    return getReplacementEvaluation(world, band, context, previousIntent, "changed_intent");
  }

  const selectedIntent = selectNewIntent(world, band, context);

  if (selectedIntent === undefined) {
    const lifecycleReason = makeIntentReason(world, band.id, "no-intent", {
      type: "low_mobility_pressure",
      strength: clamp01(1 - context.mobilityPressure),
      confidence: context.currentRecord.confidence,
      relatedTileIds: [context.currentTile.id],
      currentTileId: context.currentTile.id,
      pressure: context.mobilityPressure,
    });

    return {
      status: "had_no_intent",
      lifecycleReason,
    };
  }

  return {
    status: "changed_intent",
    activeIntent: selectedIntent,
    lifecycleReason: selectedIntent.reason,
  };
}

function getReplacementEvaluation(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  previousIntent: MobilityIntent,
  status: "completed_intent" | "abandoned_intent" | "changed_intent",
): MobilityIntentEvaluation {
  const selectedIntent = selectNewIntent(world, band, context, previousIntent.kind);
  const lifecycleReason = selectedIntent?.reason ?? makeIntentReason(world, band.id, status, {
    type: status === "abandoned_intent" ? "risk_avoidance" : "seasonal_stability",
    strength: status === "abandoned_intent" ? context.survivalPressure : context.currentValue,
    confidence: context.currentRecord.confidence,
    relatedTileIds: [context.currentTile.id],
    currentTileId: context.currentTile.id,
    riskSeverity: context.survivalPressure,
    pressure: context.mobilityPressure,
    currentValue: context.currentValue,
    seasonality: context.currentRecord.observedSeasonalPattern?.reliability ?? 0.5,
  });

  return {
    status,
    activeIntent: selectedIntent,
    previousIntent,
    lifecycleReason,
  };
}

function selectNewIntent(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  previousKind?: MobilityIntentKind,
): MobilityIntent | undefined {
  const candidates = buildIntentCandidates(world, band, context);

  const selected = candidates
    .filter((candidate) => candidate.intent.kind !== previousKind || candidates.length === 1)
    .sort(compareIntentCandidates)[0] ?? candidates.sort(compareIntentCandidates)[0];

  return selected?.intent;
}

// Candidate construction shared by selection and the M0.10 audit reader below.
// Extracted MECHANICALLY from selectNewIntent (no behaviour change).
function buildIntentCandidates(
  world: WorldState,
  band: Band,
  context: MobilityContext,
): IntentCandidate[] {
  const candidates: IntentCandidate[] = [];
  // Mobility behaviour basis is derived lazily here — only when an intent is
  // actually (re)selected, not on every continued-intent tick — so the ecology/
  // experience scan is paid only when it is used (2I.6 performance).
  const basis = deriveMobilityBehaviorBasis(world, band);
  const currentWater = context.currentRecord.observedWaterAccess ?? 0.35;
  const currentRisk = context.currentRecord.observedRisk ?? 0.35;
  const localSufficient =
    context.currentValue >= 0.56 &&
    currentWater >= 0.52 &&
    currentRisk <= 0.48 &&
    band.hungerPressure <= 0.42;

  if (
    localSufficient &&
    (band.frontierDispersal?.pressure ?? 0) < 0.32 &&
    band.consecutiveSeasonsOnTile <= 1 &&
    (basis === undefined || basis.dryMarginAffinity < DRY_MARGIN_AFFINITY_THRESHOLD)
  ) {
    candidates.push(createLocalForagingCandidate(world, band, context));
  }

  if (
    band.parentBandId !== undefined &&
    (band.frontierDispersal?.pressure ?? 0) > 0.2
  ) {
    candidates.push(createDaughterRangeCandidate(world, band, context));
  }

  // Daughter colonization toward a known underused habitat (2J). Manifests the
  // colonization recommendation as a seek_new_range/scout intent toward the
  // remembered/inferred opportunity tile — bounded score so survival still wins.
  const colonization = band.daughterColonization;
  if (
    colonization !== undefined &&
    colonization.bestKnownUnusedHabitatOpportunity !== undefined &&
    (colonization.recommendedAction === "seek_new_range" ||
      colonization.recommendedAction === "fission_toward_opportunity" ||
      colonization.recommendedAction === "probe" ||
      colonization.recommendedAction === "scout")
  ) {
    candidates.push(createColonizationCandidate(world, band, context, colonization));
  }

  const bestKnown = getBestKnownGoodTile(world, band, context.currentTile.id);
  if (
    bestKnown !== undefined &&
    bestKnown.record.tileId !== context.currentTile.id &&
    bestKnown.value > context.currentValue + 0.16
  ) {
    candidates.push(createReturnCandidate(world, band, context, bestKnown));
  }

  if (currentRisk > 0.58 || context.survivalPressure > 0.66) {
    candidates.push(createAvoidRiskCandidate(world, band, context));
  }

  // Water-seeking from ecology/pressure, not profile: low local water, dry-margin
  // ecology, or accumulated water-seeking pressure.
  if (
    currentWater < 0.48 ||
    (basis !== undefined && basis.dryMarginAffinity > DRY_MARGIN_AFFINITY_THRESHOLD) ||
    (basis !== undefined && basis.waterSeekingAffinity > DRY_MARGIN_AFFINITY_THRESHOLD)
  ) {
    candidates.push(createSeekWaterCandidate(world, band, context));
  }

  // Corridor intents are now opened by ECOLOGY/EXPERIENCE affinity (current tile +
  // known terrain + corridor memory), with the starting profile only a decaying
  // weak prior folded into those affinities — not a hard profile gate (2I.6).
  // Affinities are independent, so a band on a river delta can pursue both river
  // and coast behaviour if both are present.
  // M0.8-B: while the band is re-anchoring after a burst of shore probes, do NOT re-open the
  // wandering SHORE-probe kinds (`probe_coast` / `probe_wetland_or_lake`). River/pass corridor
  // following stays available (it is coherent directional travel, not the back-and-forth drift),
  // as do survival / foraging / return / daughter-expansion candidates above.
  const probeCooling = isFrontierProbeCooling(band, world);
  // M0.9: the band's earned, age-decayed directional heading (anti-omniscient — realized motion
  // only). Passed to the frontier candidates as a SMALL tie-breaker so a band keeps a gentle
  // shoreline/corridor bearing instead of re-deriving direction from the value-centroid every
  // selection. Undefined unless a usable heading exists → default behaviour is unchanged.
  const heading = getActiveCorridorHeading(band, world);
  if (basis !== undefined) {
    if (basis.riverAffinity > CORRIDOR_AFFINITY_THRESHOLD) {
      candidates.push(createCorridorCandidate(world, band, context, "follow_river_corridor", basis, heading));
    }

    if (!probeCooling && basis.coastAffinity > CORRIDOR_AFFINITY_THRESHOLD) {
      candidates.push(createCorridorCandidate(world, band, context, "probe_coast", basis, heading));
    }

    if (!probeCooling && basis.wetlandLakeAffinity > CORRIDOR_AFFINITY_THRESHOLD) {
      candidates.push(createCorridorCandidate(world, band, context, "probe_wetland_or_lake", basis, heading));
    }

    if (basis.highlandPassAffinity > CORRIDOR_AFFINITY_THRESHOLD) {
      candidates.push(createCorridorCandidate(world, band, context, "cross_pass", basis, heading));
    }
  }

  // Expand-known-world: a KNOWLEDGE-POOR band (few known tiles) must always be able to learn
  // its surroundings — that is genuine exploration, never suppressed. Only the PRESSURE-driven
  // expand of an already-knowledgeable band is part of the shore-wander cadence, so it rests
  // during the cooldown.
  const expandForKnowledge = context.knownTileCount < 22;
  const expandForPressure = context.mobilityPressure > 0.44;
  if (expandForKnowledge || (expandForPressure && !probeCooling)) {
    candidates.push(createExpandKnownWorldCandidate(world, band, context, heading));
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// M0.10 — AUDIT-ONLY mobility-intent candidate reader. Pure read: derives the
// exact candidate set selectNewIntent would build for this band THIS season
// (kinds, targets, scores) so migration/saturation audits can answer "was a
// greener/downstream candidate generated, and if so why did it lose?" without
// touching selection. Never called by sim runtime code — benchmark/UI only.
// ---------------------------------------------------------------------------
export interface MobilityIntentCandidateAudit {
  readonly kind: MobilityIntentKind;
  readonly targetTileId?: TileId;
  readonly score: number;
  readonly confidence: number;
  readonly persistence: number;
}

export interface MobilityIntentCandidateAuditResult {
  readonly candidates: readonly MobilityIntentCandidateAudit[];
  readonly wouldSelectKind?: MobilityIntentKind;
  readonly wouldSelectTargetTileId?: TileId;
  readonly currentValue: number;
  readonly knownTileCount: number;
  readonly mobilityPressure: number;
}

export function auditMobilityIntentCandidates(
  world: WorldState,
  band: Band,
): MobilityIntentCandidateAuditResult | undefined {
  const context = getMobilityContext(world, band);

  if (context === undefined) {
    return undefined;
  }

  const candidates = buildIntentCandidates(world, band, context);
  const sorted = candidates.slice().sort(compareIntentCandidates);

  return {
    candidates: sorted.map((candidate) => ({
      kind: candidate.intent.kind,
      targetTileId: candidate.intent.targetTileId,
      score: Math.round(candidate.score * 1000) / 1000,
      confidence: Math.round(candidate.intent.confidence * 100) / 100,
      persistence: Math.round(candidate.intent.persistence * 100) / 100,
    })),
    wouldSelectKind: sorted[0]?.intent.kind,
    wouldSelectTargetTileId: sorted[0]?.intent.targetTileId,
    currentValue: Math.round(context.currentValue * 100) / 100,
    knownTileCount: context.knownTileCount,
    mobilityPressure: Math.round(context.mobilityPressure * 100) / 100,
  };
}

function createLocalForagingCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
): IntentCandidate {
  const pressure = context.mobilityPressure;
  const reason = makeIntentReason(world, band.id, "local-foraging", {
    type: "known_site_sufficient",
    strength: context.currentValue,
    confidence: context.currentRecord.confidence,
    relatedTileIds: [context.currentTile.id],
    currentTileId: context.currentTile.id,
    currentValue: context.currentValue,
    pressure,
  });

  return {
    intent: {
      kind: "local_foraging",
      createdAt: world.time,
      expectedHorizonTicks: 2 as TickNumber,
      targetTileId: context.currentTile.id,
      targetRegionId: context.currentTile.regionId,
      reason,
      confidence: context.currentRecord.confidence,
      persistence: clamp01(0.46 + context.currentValue * 0.36 - pressure * 0.18),
    },
    score: context.currentValue * 1.35 - pressure * 0.5,
  };
}

function createReturnCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  target: KnownTileValue,
): IntentCandidate {
  const directionVector = getKnownDirection(world, context.currentTile.id, target.record.tileId);
  const reason = makeIntentReason(world, band.id, "return-good", {
    type: "return_to_known_good_area",
    strength: clamp01(target.value - context.currentValue),
    confidence: target.record.confidence,
    relatedTileIds: [context.currentTile.id, target.record.tileId],
    currentTileId: context.currentTile.id,
    targetTileId: target.record.tileId,
    currentValue: context.currentValue,
    targetValue: target.value,
  });

  return {
    intent: {
      kind: "return_to_known_good_area",
      createdAt: world.time,
      expectedHorizonTicks: 4 as TickNumber,
      targetTileId: target.record.tileId,
      targetRegionId: target.tile.regionId,
      directionVector,
      reason,
      confidence: target.record.confidence,
      persistence: 0.72,
    },
    score: target.value * 1.28 - context.currentValue * 0.45,
  };
}

function createAvoidRiskCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
): IntentCandidate {
  const safest = getSafestKnownTile(world, band, context.currentTile.id);
  const targetTileId = safest?.record.tileId;
  const directionVector =
    targetTileId === undefined
      ? getFrontierDirection(context.currentTile, band)
      : getKnownDirection(world, context.currentTile.id, targetTileId);
  const riskSeverity = context.currentRecord.observedRisk ?? context.survivalPressure;
  const reason = makeIntentReason(world, band.id, "avoid-risk", {
    type: "risk_avoidance",
    strength: context.survivalPressure,
    confidence: context.currentRecord.confidence,
    relatedTileIds: targetTileId === undefined
      ? [context.currentTile.id]
      : [context.currentTile.id, targetTileId],
    currentTileId: context.currentTile.id,
    targetTileId,
    riskSeverity,
    pressure: context.mobilityPressure,
  });

  return {
    intent: {
      kind: "avoid_risk",
      createdAt: world.time,
      expectedHorizonTicks: 3 as TickNumber,
      targetTileId,
      directionVector,
      reason,
      confidence: context.currentRecord.confidence,
      persistence: 0.62,
    },
    score: context.survivalPressure * 1.4,
  };
}

function createSeekWaterCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
): IntentCandidate {
  const target = getBestKnownWaterTile(world, band, context.currentTile.id);
  const currentValue = context.currentRecord.observedWaterAccess ?? 0.35;
  const targetValue = target?.record.observedWaterAccess;
  const targetTileId = target?.record.tileId;
  const directionVector =
    targetTileId === undefined
      ? getFrontierDirection(context.currentTile, band)
      : getKnownDirection(world, context.currentTile.id, targetTileId);
  const reason = makeIntentReason(world, band.id, "seek-water", {
    type: "seek_better_water",
    strength: clamp01((targetValue ?? 0.62) - currentValue + context.mobilityPressure * 0.28),
    confidence: target?.record.confidence ?? context.currentRecord.confidence * 0.74,
    relatedTileIds: targetTileId === undefined
      ? [context.currentTile.id]
      : [context.currentTile.id, targetTileId],
    currentTileId: context.currentTile.id,
    targetTileId,
    currentValue,
    targetValue,
    pressure: context.mobilityPressure,
  });

  return {
    intent: {
      kind: "seek_better_water",
      createdAt: world.time,
      expectedHorizonTicks: 4 as TickNumber,
      targetTileId,
      targetRegionId: target?.tile.regionId,
      directionVector,
      reason,
      confidence: target?.record.confidence ?? 0.58,
      persistence: 0.7,
    },
    score: (targetValue ?? 0.55) * 1.18 + context.mobilityPressure * 0.52 - currentValue * 0.42,
  };
}

function createCorridorCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  kind: MobilityIntentKind,
  basis: MobilityBehaviorBasis,
  heading?: { readonly headingVector: Coord; readonly strength: number },
): IntentCandidate {
  // Ecology/experience-derived corridor direction, then (M0.9) blended toward the band's earned
  // heading so the chosen target continues the recent bearing rather than re-centring on the
  // value-centroid each selection. The blend is capped (≤0.5×strength) — direction only, never
  // a richness/target signal.
  const derivedDirection =
    getKnownCorridorDirection(world, band, context, kind) ??
    context.previousVector ??
    getFrontierDirection(context.currentTile, band);
  const directionVector = blendDirectionTowardHeading(derivedDirection, heading);
  const target = getBestKnownTileAlongDirection(world, band, context.currentTile.id, directionVector);
  const relatedTileIds =
    target === undefined ? [context.currentTile.id] : [context.currentTile.id, target.record.tileId];
  const reason = makeIntentReason(world, band.id, kind, {
    type: kind === "follow_river_corridor" || kind === "cross_pass"
      ? "corridor_following"
      : "frontier_probe",
    strength: getProfileIntentStrength(context, kind, basis),
    confidence: getProfileIntentConfidence(context, kind, basis),
    relatedTileIds,
    intentKind: kind,
    currentTileId: context.currentTile.id,
    targetTileId: target?.record.tileId,
    frontierValue: clamp01(context.mobilityPressure + (22 - context.knownTileCount) * 0.025),
    directionVector,
  });

  return {
    intent: {
      kind,
      createdAt: world.time,
      expectedHorizonTicks: getIntentHorizon(kind),
      targetTileId: target?.record.tileId,
      targetRegionId: target?.tile.regionId ?? context.currentTile.regionId,
      directionVector,
      reason,
      confidence: getProfileIntentConfidence(context, kind, basis),
      persistence: getIntentPersistence(kind, context),
    },
    score:
      getProfileIntentStrength(context, kind, basis) * 1.05 +
      context.mobilityPressure * 0.32 +
      (target?.value ?? 0.32) * 0.38 +
      // M0.9: small signed heading-continuity tie-breaker (≤~0.05) — prefers the corridor kind
      // that continues the recent bearing, mildly penalises an immediate reversal. Bounded so it
      // never beats clearly-better local value or any survival candidate.
      corridorHeadingContinuityBonus(directionVector, heading),
  };
}

function createExpandKnownWorldCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  heading?: { readonly headingVector: Coord; readonly strength: number },
): IntentCandidate {
  // M0.9: bias the unknown-frontier bearing toward the band's earned heading (direction only).
  const derivedDirection =
    getFrontierDirection(context.currentTile, band) ??
    context.previousVector ??
    { x: 1, y: 0 };
  const directionVector = blendDirectionTowardHeading(derivedDirection, heading) ?? derivedDirection;
  const frontierValue = clamp01(
    Math.max(0, 24 - context.knownTileCount) / 24 +
      context.mobilityPressure * 0.35,
  );
  const reason = makeIntentReason(world, band.id, "expand-known-world", {
    type: "frontier_probe",
    strength: frontierValue,
    confidence: 0.58,
    relatedTileIds: [context.currentTile.id],
    intentKind: "expand_known_world",
    currentTileId: context.currentTile.id,
    frontierValue,
    directionVector,
  });

  return {
    intent: {
      kind: "expand_known_world",
      createdAt: world.time,
      expectedHorizonTicks: 4 as TickNumber,
      targetRegionId: context.currentTile.regionId,
      directionVector,
      reason,
      confidence: 0.58,
      persistence: 0.56,
    },
    score:
      frontierValue +
      context.mobilityPressure * 0.28 +
      // M0.9: same bounded heading-continuity tie-breaker as the corridor candidate.
      corridorHeadingContinuityBonus(directionVector, heading),
  };
}

function createColonizationCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  colonization: DaughterColonizationPressure,
): IntentCandidate {
  const opportunity = colonization.bestKnownUnusedHabitatOpportunity;
  const targetTileId = opportunity?.candidateTileId;
  const scout = colonization.recommendedAction === "scout";
  const kind: MobilityIntentKind = scout ? "expand_known_world" : "seek_new_range";
  const directionVector =
    targetTileId === undefined
      ? getFrontierDirection(context.currentTile, band) ?? context.previousVector
      : getKnownDirection(world, context.currentTile.id, targetTileId);
  const reason = makeIntentReason(world, band.id, "daughter-colonization", {
    type: "frontier_dispersal_pressure",
    strength: colonization.pressure,
    confidence: opportunity?.confidence ?? 0.5,
    relatedTileIds: targetTileId === undefined
      ? [context.currentTile.id]
      : [context.currentTile.id, targetTileId],
    bandId: band.id,
    tileId: context.currentTile.id,
    pressure: colonization.pressure,
    bestFrontierTileId: targetTileId,
    preferredCorridor: band.frontierDispersal?.preferredCorridor ?? "unknown",
  });

  return {
    intent: {
      kind,
      createdAt: world.time,
      expectedHorizonTicks: (scout ? 4 : 16) as TickNumber,
      targetTileId,
      targetRegionId: context.currentTile.regionId,
      directionVector,
      reason,
      confidence: clamp01((opportunity?.confidence ?? 0.5) * 0.7 + colonization.pressure * 0.2),
      persistence: clamp01(0.62 + colonization.pressure * 0.2),
    },
    // Bounded so survival/water/risk candidates still outscore casual colonization.
    score: colonization.pressure * 1.15 + (opportunity?.expectedPerCapitaReturn ?? 0.3) * 0.5,
  };
}

function createDaughterRangeCandidate(
  world: WorldState,
  band: Band,
  context: MobilityContext,
): IntentCandidate {
  const targetTileId = band.frontierDispersal?.bestFrontierTileId;
  const directionVector =
    targetTileId === undefined
      ? getFrontierDirection(context.currentTile, band) ?? context.previousVector
      : getKnownDirection(world, context.currentTile.id, targetTileId);
  const pressure = band.frontierDispersal?.pressure ?? 0;
  const reason = makeIntentReason(world, band.id, "daughter-range", {
    type: "frontier_dispersal_pressure",
    strength: pressure,
    confidence: context.currentRecord.confidence,
    relatedTileIds: targetTileId === undefined
      ? [context.currentTile.id]
      : [context.currentTile.id, targetTileId],
    bandId: band.id,
    tileId: context.currentTile.id,
    pressure,
    bestFrontierTileId: targetTileId,
    preferredCorridor: band.frontierDispersal?.preferredCorridor ?? "unknown",
  });

  return {
    intent: {
      kind: "seek_new_range",
      createdAt: world.time,
      expectedHorizonTicks: 18 as TickNumber,
      targetTileId,
      targetRegionId: context.currentTile.regionId,
      directionVector,
      reason,
      confidence: clamp01(context.currentRecord.confidence * 0.74 + pressure * 0.22),
      persistence: clamp01(0.68 + pressure * 0.18),
    },
    score: pressure * 1.18 + (band.rangeSaturation?.saturationPressure ?? 0) * 0.34,
  };
}

function getMobilityContext(world: WorldState, band: Band): MobilityContext | undefined {
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  if (currentTile === undefined || currentRecord === undefined) {
    return undefined;
  }

  const currentValue = getKnownTileValue(currentRecord, band.placeMemory[currentRecord.tileId]);
  const waterPressure = 1 - (currentRecord.observedWaterAccess ?? 0.35);
  const foodPressure = 1 - currentRecord.observedRichness;
  const riskPressure = currentRecord.observedRisk ?? 0.35;
  const knownTileCount = Object.keys(band.knowledge.observedTiles).length;
  const mobilityPressure = clamp01(
    band.hungerPressure * 0.25 +
      band.territorialPressure * 0.12 +
      waterPressure * 0.24 +
      foodPressure * 0.2 +
      riskPressure * 0.16 +
      (band.rangeSaturation?.saturationPressure ?? 0) * 0.14 +
      (band.frontierDispersal?.pressure ?? 0) * 0.18 +
      Math.max(0, band.consecutiveSeasonsOnTile - 1) * 0.1 +
      Math.max(0, 18 - knownTileCount) * 0.018,
  );
  const survivalPressure = clamp01(
    waterPressure * 0.34 +
      foodPressure * 0.26 +
      riskPressure * 0.28 +
      band.hungerPressure * 0.22,
  );

  return {
    currentTile,
    currentRecord,
    currentValue,
    mobilityPressure,
    survivalPressure,
    knownTileCount,
    profileRole: band.initialSpawnReason?.profileRole,
    previousVector: getPreviousMovementVector(world, band),
  };
}

function hasCompletedIntent(
  world: WorldState,
  band: Band,
  intent: MobilityIntent,
  context: MobilityContext,
): boolean {
  if (intent.targetTileId !== undefined && intent.targetTileId === band.position) {
    return true;
  }

  if (
    (intent.kind === "probe_coast" ||
      intent.kind === "probe_wetland_or_lake" ||
      intent.kind === "expand_known_world" ||
      intent.kind === "seek_new_range" ||
      intent.kind === "frontier_dispersal" ||
      intent.kind === "daughter_range_expansion") &&
    getIntentElapsedTicks(world, intent) >= intent.expectedHorizonTicks
  ) {
    return true;
  }

  return intent.kind === "local_foraging" &&
    getIntentElapsedTicks(world, intent) >= intent.expectedHorizonTicks &&
    context.currentValue >= 0.56;
}

function shouldAbandonIntent(intent: MobilityIntent, context: MobilityContext): boolean {
  if (intent.kind === "seek_better_water" || intent.kind === "avoid_risk") {
    return false;
  }

  return context.survivalPressure > 0.7 || (context.currentRecord.observedRisk ?? 0) > 0.72;
}

function isIntentExpired(world: WorldState, intent: MobilityIntent): boolean {
  return getIntentElapsedTicks(world, intent) > intent.expectedHorizonTicks;
}

function getIntentElapsedTicks(world: WorldState, intent: MobilityIntent): number {
  return Math.max(0, world.time.tick - intent.createdAt.tick);
}

interface KnownTileValue {
  readonly tile: Tile;
  readonly record: KnownTileRecord;
  readonly value: number;
}

function getBestKnownGoodTile(
  world: WorldState,
  band: Band,
  currentTileId: TileId,
): KnownTileValue | undefined {
  return getKnownTileValues(world, band)
    .filter((item) => item.record.tileId !== currentTileId)
    .sort(compareKnownTileValues)[0];
}

function getSafestKnownTile(
  world: WorldState,
  band: Band,
  currentTileId: TileId,
): KnownTileValue | undefined {
  return getKnownTileValues(world, band)
    .filter((item) => item.record.tileId !== currentTileId)
    .sort((left, right) => {
      const riskDelta = (left.record.observedRisk ?? 0.35) - (right.record.observedRisk ?? 0.35);

      return riskDelta !== 0 ? riskDelta : compareKnownTileValues(left, right);
    })[0];
}

function getBestKnownWaterTile(
  world: WorldState,
  band: Band,
  currentTileId: TileId,
): KnownTileValue | undefined {
  return getKnownTileValues(world, band)
    .filter((item) => item.record.tileId !== currentTileId)
    .sort((left, right) => {
      const waterDelta =
        (right.record.observedWaterAccess ?? 0.35) - (left.record.observedWaterAccess ?? 0.35);

      return waterDelta !== 0 ? waterDelta : compareKnownTileValues(left, right);
    })[0];
}

function getKnownTileValues(world: WorldState, band: Band): readonly KnownTileValue[] {
  return Object.values(band.knowledge.observedTiles)
    .map((record) => {
      const tile = getTile(world, record.tileId);

      return tile === undefined
        ? undefined
        : {
            tile,
            record,
            value: getKnownTileValue(record, band.placeMemory[record.tileId]),
          };
    })
    .filter((value): value is KnownTileValue => value !== undefined);
}

function getKnownTileValue(
  record: KnownTileRecord,
  memory: PlaceMemoryRecord | undefined,
): number {
  return clamp01(
    record.observedRichness * 0.4 +
      (record.observedWaterAccess ?? 0.35) * 0.28 +
      record.observedAquaticPotential * 0.12 +
      (record.observedStorageSuitability ?? 0.2) * 0.08 +
      record.confidence * 0.08 -
      (record.observedRisk ?? 0.35) * 0.18 +
      (memory?.attachment ?? 0) * 0.1 +
      (memory?.isReturnPlace === true ? 0.08 : 0) +
      (memory?.valences.includes("reliable") === true ? 0.07 : 0) -
      (memory?.valences.includes("avoid_place") === true ? 0.12 : 0),
  );
}

function compareKnownTileValues(left: KnownTileValue, right: KnownTileValue): number {
  if (left.value !== right.value) {
    return right.value - left.value;
  }

  return compareTiles(left.tile, right.tile);
}

function getKnownCorridorDirection(
  world: WorldState,
  band: Band,
  context: MobilityContext,
  intentKind: MobilityIntentKind,
): Coord | undefined {
  const vectors = getKnownTileValues(world, band)
    .filter((item) => item.record.tileId !== context.currentTile.id)
    .filter((item) => tileMatchesIntentCorridor(item.tile, intentKind))
    .map((item) => {
      const vector = getDirectionBetweenCoords(context.currentTile.coord, item.tile.coord);
      const weight = item.record.confidence *
        (1.2 - Math.min(0.8, getCoordDistance(context.currentTile.coord, item.tile.coord) / 8));

      return scaleVector(vector, Math.max(0.08, weight));
    });

  return normalizeVector(sumVectors(vectors));
}

function getBestKnownTileAlongDirection(
  world: WorldState,
  band: Band,
  currentTileId: TileId,
  directionVector: Coord | undefined,
): KnownTileValue | undefined {
  const currentTile = getTile(world, currentTileId);

  if (currentTile === undefined || directionVector === undefined) {
    return undefined;
  }

  return getKnownTileValues(world, band)
    .filter((item) => item.record.tileId !== currentTileId)
    .map((item) => ({
      ...item,
      value: item.value +
        clamp01(dotVectors(getDirectionBetweenCoords(currentTile.coord, item.tile.coord), directionVector)) * 0.18,
    }))
    .sort(compareKnownTileValues)[0];
}

function tileMatchesIntentCorridor(tile: Tile, intentKind: MobilityIntentKind): boolean {
  if (intentKind === "follow_river_corridor") {
    return tile.isRiver || tile.terrainKind === "river_valley";
  }

  if (intentKind === "probe_coast") {
    return tile.isCoastal || tile.terrainKind === "coast" || tile.terrainKind === "wetlands";
  }

  if (intentKind === "probe_wetland_or_lake") {
    return tile.terrainKind === "wetlands" || tile.terrainKind === "lake" || tile.isAquatic;
  }

  if (intentKind === "cross_pass") {
    return tile.terrainKind === "hills" || (tile.elevation > 0.45 && tile.movementCost <= 1.85);
  }

  if (
    intentKind === "seek_new_range" ||
    intentKind === "frontier_dispersal" ||
    intentKind === "daughter_range_expansion"
  ) {
    return (
      tile.isCoastal ||
      tile.isRiverbank ||
      tile.isFloodplain ||
      tile.terrainKind === "wetlands" ||
      (tile.terrainKind === "hills" && tile.movementCost < 1.7)
    );
  }

  return false;
}

// Corridor affinity for a given intent kind, from the ecology/experience basis.
function getCorridorAffinity(basis: MobilityBehaviorBasis, kind: MobilityIntentKind): number {
  if (kind === "follow_river_corridor") {
    return basis.riverAffinity;
  }

  if (kind === "probe_coast") {
    return basis.coastAffinity;
  }

  if (kind === "probe_wetland_or_lake") {
    return basis.wetlandLakeAffinity;
  }

  if (kind === "cross_pass") {
    return basis.highlandPassAffinity;
  }

  if (
    kind === "seek_new_range" ||
    kind === "frontier_dispersal" ||
    kind === "daughter_range_expansion"
  ) {
    return basis.frontierAffinity;
  }

  return 0;
}

// Intent strength now blends current ecology of the tile with the band's derived
// behaviour affinity (which already folds known terrain, corridor memory, and a
// decaying profile prior), so corridor pull tracks where the band lives/learned.
function getProfileIntentStrength(
  context: MobilityContext,
  kind: MobilityIntentKind,
  basis: MobilityBehaviorBasis,
): NormalizedIntensity {
  const current = context.currentRecord;
  const affinity = getCorridorAffinity(basis, kind);

  if (kind === "follow_river_corridor") {
    return clamp01((current.observedWaterAccess ?? 0.35) * 0.34 + current.observedRichness * 0.24 + affinity * 0.4 + 0.12);
  }

  if (kind === "probe_coast" || kind === "probe_wetland_or_lake") {
    return clamp01(current.observedAquaticPotential * 0.36 + current.observedRichness * 0.18 + affinity * 0.4 + 0.1);
  }

  if (kind === "cross_pass") {
    return clamp01(context.currentTile.elevation * 0.26 + (1 - context.currentTile.movementCost / 3) * 0.26 + affinity * 0.4 + 0.1);
  }

  if (
    kind === "seek_new_range" ||
    kind === "frontier_dispersal" ||
    kind === "daughter_range_expansion"
  ) {
    return clamp01((context.mobilityPressure + (context.knownTileCount < 32 ? 0.18 : 0)) * 0.62 + 0.2);
  }

  return clamp01(context.mobilityPressure + Math.max(0, 20 - context.knownTileCount) * 0.02);
}

function getProfileIntentConfidence(
  context: MobilityContext,
  kind: MobilityIntentKind,
  basis: MobilityBehaviorBasis,
): NormalizedIntensity {
  // Confidence bonus comes from the ecology/experience affinity (which the band
  // earned by living there / remembering corridors), not from its spawn profile.
  const affinityBonus = getCorridorAffinity(basis, kind) * 0.2;

  return clamp01(context.currentRecord.confidence * 0.72 + affinityBonus + 0.16);
}

function getIntentPersistence(
  kind: MobilityIntentKind,
  context: MobilityContext,
): NormalizedIntensity {
  if (kind === "local_foraging") {
    return 0.48;
  }

  if (kind === "avoid_risk" || kind === "seek_better_water") {
    return 0.66;
  }

  if (
    kind === "seek_new_range" ||
    kind === "frontier_dispersal" ||
    kind === "daughter_range_expansion"
  ) {
    return 0.8;
  }

  return clamp01(0.58 + context.currentRecord.confidence * 0.18);
}

function getIntentHorizon(kind: MobilityIntentKind): TickNumber {
  if (kind === "local_foraging") {
    return 2 as TickNumber;
  }

  if (kind === "avoid_risk") {
    return 3 as TickNumber;
  }

  if (kind === "follow_river_corridor" || kind === "cross_pass") {
    return 5 as TickNumber;
  }

  if (
    kind === "seek_new_range" ||
    kind === "frontier_dispersal" ||
    kind === "daughter_range_expansion"
  ) {
    return 18 as TickNumber;
  }

  return 4 as TickNumber;
}

function getKnownDirection(
  world: WorldState,
  fromTileId: TileId,
  toTileId: TileId,
): Coord | undefined {
  const fromTile = getTile(world, fromTileId);
  const toTile = getTile(world, toTileId);

  return fromTile === undefined || toTile === undefined
    ? undefined
    : getDirectionBetweenCoords(fromTile.coord, toTile.coord);
}

function getFrontierDirection(currentTile: Tile, band: Band): Coord | undefined {
  const vectors = currentTile.neighbors
    .filter((neighborId) => band.knowledge.observedTiles[neighborId] === undefined)
    .map((neighborId) => parseTileCoord(neighborId))
    .filter((coord): coord is Coord => coord !== undefined)
    .map((coord) => getDirectionBetweenCoords(currentTile.coord, coord));

  return normalizeVector(sumVectors(vectors));
}

function getPreviousMovementVector(world: WorldState, band: Band): Coord | undefined {
  const previousDecisionId = band.decisionHistory[band.decisionHistory.length - 1];
  const previousDecision =
    previousDecisionId === undefined ? undefined : world.decisions[previousDecisionId];
  const fromTileId = previousDecision?.contextSnapshot.currentTileId;

  if (
    previousDecision === undefined ||
    fromTileId === undefined ||
    (previousDecision.action.type !== "move_to_tile" &&
      previousDecision.action.type !== "explore_unknown_neighbor")
  ) {
    return undefined;
  }

  const toTileId = previousDecision.action.type === "move_to_tile"
    ? previousDecision.action.targetTileId
    : previousDecision.action.targetTileId;

  return getKnownDirection(world, fromTileId, toTileId);
}

function getIntentRelatedTiles(
  currentTileId: TileId,
  intent: MobilityIntent,
): readonly TileId[] {
  return intent.targetTileId === undefined
    ? [currentTileId]
    : [currentTileId, intent.targetTileId];
}

function makeIntentReason<TReason extends Omit<Reason, "id" | "relatedEventIds"> & {
  readonly relatedEventIds?: readonly never[];
}>(
  world: WorldState,
  bandId: BandId,
  suffix: string,
  reason: TReason,
): Reason {
  return {
    ...reason,
    id: `reason:intent:${bandId}:${world.time.tick}:${suffix}` as ReasonId,
    relatedEventIds: [],
  } as unknown as Reason;
}

function compareIntentCandidates(left: IntentCandidate, right: IntentCandidate): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.intent.kind !== right.intent.kind) {
    return left.intent.kind.localeCompare(right.intent.kind);
  }

  return String(left.intent.targetTileId ?? "").localeCompare(String(right.intent.targetTileId ?? ""));
}

function compareTiles(left: Tile, right: Tile): number {
  if (left.coord.y !== right.coord.y) {
    return left.coord.y - right.coord.y;
  }

  if (left.coord.x !== right.coord.x) {
    return left.coord.x - right.coord.x;
  }

  return String(left.id).localeCompare(String(right.id));
}

function getDirectionBetweenCoords(from: Coord, to: Coord): Coord {
  return normalizeVector({
    x: to.x - from.x,
    y: to.y - from.y,
  }) ?? { x: 0, y: 0 };
}

function getCoordDistance(from: Coord, to: Coord): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function sumVectors(vectors: readonly Coord[]): Coord {
  return vectors.reduce(
    (total, vector) => ({
      x: total.x + vector.x,
      y: total.y + vector.y,
    }),
    { x: 0, y: 0 },
  );
}

function scaleVector(vector: Coord, scalar: number): Coord {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

function normalizeVector(vector: Coord): Coord | undefined {
  const magnitude = Math.hypot(vector.x, vector.y);

  if (magnitude <= 0.0001) {
    return undefined;
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

function dotVectors(left: Coord, right: Coord): number {
  return left.x * right.x + left.y * right.y;
}

function parseTileCoord(tileId: TileId): Coord | undefined {
  const [, rawX, rawY] = String(tileId).split(":");
  const x = Number(rawX);
  const y = Number(rawY);

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
