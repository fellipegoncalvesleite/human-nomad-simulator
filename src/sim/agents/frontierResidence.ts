// FrontierResidence v0 (checkpoint M0.4) — Emergent, band-known frontier RETENTION.
//
// WHY THIS EXISTS (M0.3 limitation `improved_reach_without_retention`): with
// FrontierIntent v0 daughters now REACH the frontier (max lineage distance 10→19),
// but they do not HOLD it — `daughtersMaintainNewRange25Years = 0`,
// `frontierPersistenceScore = 0`. The M0.4 return-pull audit showed this is an
// OSCILLATION problem, not an absence of reach: the best daughter already spends
// 15.25 CONSECUTIVE years (and 20+ cumulative) outside the origin radius, but keeps
// stepping back across it toward a marginally-better-KNOWN interior locus (strong
// reformed place attachment ≈0.8–0.96 + band-known inner opportunities at
// per-capita ≈1.0), which breaks the streak before a 25-year range can form.
//
// WHAT THIS DOES: lets a frontier daughter EARN a bounded, decaying retention value
// at the locus she actually dwells in, from her OWN local experience — repeated
// presence, decent local return trend, water/refuge confirmation, band-known
// opportunity nearby, corridor memory, and her own formed place attachment. Once
// that value is established it is used as a narrow tie-breaker to (a) hold the
// frontier locus and (b) damp the inward (toward-origin) backtrack — so fragmented
// frontier presence consolidates into a held new range and natural attachment/
// confidence take over.
//
// HARD SCOPE LOCK (M0.4): no omniscient richness (reads only band-known/scouted/
// inherited fields — never hidden tile truth), no forced daughters (value only
// COMPETES with the remembered origin, never erases it; a poor frontier yields low
// value and is still abandoned), no global attachment weakening, no camps/
// settlements, no yield/stress/mortality/carrying-capacity/plant change, no
// unseeded random call, no `any`, no UI/render/React/Zustand imports. Daughters only — a
// band with no parent (a founder/parent at its origin refuge) never establishes
// residence, so parents keep their refuge. Fully reversible: when she leaves the
// locus or local evidence fades the value decays to `undefined`, leaving no trace.

import type { BandId, Coord, ReasonId, TickNumber, TileId } from "../core/types";
import type { Band, FrontierResidenceValue } from "./types";
import type { WorldState } from "../world/types";
import { getTile } from "../world/generate";

// --- Bounds (all small: a residence-earned tie-breaker, never a teleport/freeze) ---
const MAX_LOCAL_VALUE = 0.8;
const LOCAL_VALUE_GAIN = 0.08; // per supported tick, scaled by evidence — slow accrual
const LOCAL_VALUE_DECAY = 0.06; // per unsupported / left-locus tick — gradual, reversible
const MIN_VALUE_FLOOR = 0.05; // below this the residence is cleared (→ undefined)
const EVIDENCE_THRESHOLD = 0.3; // below this the tick counts as UNsupported (decay)
// Establishment gate — below BOTH of these the value accrues silently (no behaviour).
const ESTABLISH_AGE = 4; // ~1 year of dwelling before residence can act as a hold
const ESTABLISH_VALUE = 0.3;
// Manhattan radius around the anchor within which the daughter counts as "dwelling"
// at the same locus (so a small forage shuffle does not reset residence).
const ANCHOR_RADIUS = 4;
// M0.5 principled return-pull reduction: instead of M0.4's force-magnitude additive
// damp, an established frontier daughter's ORIGIN-WARD memory pull (her attachment /
// return-place / inherited-familiarity / familiar-corridor draw toward an INWARD
// candidate) is multiplicatively DISCOUNTED by up to RETURN_RELIEF×value, floored at
// MIN_ORIGIN_PULL so the remembered origin still COMPETES (never erased). It only ever
// scales an existing pull DOWN (never adds), so it can never push her anywhere unsafe.
const RETURN_RELIEF = 0.85;
const MIN_ORIGIN_PULL = 0.15;
// "Reached a frontier" gates (Manhattan tiles from her LINEAGE origin — the founder's
// ancestral tile, band-known lineage knowledge). Residence must NOT engage near the
// origin (that would just freeze a daughter locally and KILL reach, the M0.4
// regression we saw); it only acts on a locus she has genuinely pushed out to. Three
// thresholds, all matching the audit's Manhattan distance-from-origin metric:
//   ENGAGE   — she must have reached at least the origin-band edge to first establish.
//   ANCHOR   — `established` (the behavioural gate) holds while her consolidated outer
//              ANCHOR is at least this far out (hysteresis; below it she has truly
//              retreated and residence lapses).
//   HOLD     — the behavioural "well" line: she is rewarded for staying / stepping to
//              strictly BEYOND the audit radius (>10) and nudged off positions inside
//              it, so a daughter who would otherwise settle right AT the boundary
//              consolidates one tile out and the >10 streak can actually accumulate.
const REACHED_FRONTIER_ENGAGE = 10;
const ESTABLISHED_ANCHOR_MIN = 9;
const HOLD_TARGET_DISTANCE = 11;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function manhattan(world: WorldState, fromTileId: TileId, toTileId: TileId): number | undefined {
  const fromTile = getTile(world, fromTileId);
  const toTile = getTile(world, toTileId);

  if (fromTile === undefined || toTile === undefined) {
    return undefined;
  }

  return Math.abs(fromTile.coord.x - toTile.coord.x) + Math.abs(fromTile.coord.y - toTile.coord.y);
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

interface FrontierResidenceEvidence {
  readonly localValueEvidence: number;
  readonly localWaterConfidence: number;
  readonly localReturnTrend: number;
  readonly localKnownOpportunity: number;
  readonly confidence: number;
}

// Read ONLY band-known fields at the daughter's CURRENT locus. Every input below is
// the band's own observed/inherited/derived memory — local per-capita return, her
// own place memory (attachment / water stress / reliability valence / visits), the
// band-known opportunity gradient, her corridor memory — never hidden tile truth.
function deriveFrontierResidenceEvidence(
  world: WorldState,
  band: Band,
): FrontierResidenceEvidence {
  const position = band.position;
  const memory = band.placeMemory[position];
  const saturation = band.rangeSaturation;
  const returnTrend = band.returnTrend;
  const nearby = band.nearbyOpportunity;
  const colonization = band.daughterColonization?.bestKnownUnusedHabitatOpportunity;

  // Local return trend (band-known): the band's own per-capita return estimate for
  // its current range, penalised hard for a chronic decline so a genuinely failing
  // frontier scores low (→ unsupported → decays → she is free to retreat).
  const perCapita = saturation?.perCapitaReturnEstimate ?? 0;
  const trendBonus =
    returnTrend === undefined || returnTrend.chronicDecline
      ? 0
      : clamp01(Math.max(0, returnTrend.shortLongDelta) * 0.5 + returnTrend.mean4 * 0.2);
  const chronicPenalty = returnTrend?.chronicDecline === true ? 0.3 : 0;
  const localReturnTrend = clamp01(perCapita * 0.8 + trendBonus - chronicPenalty);

  // Local water/refuge confirmation (band-known): her own place-memory water stress
  // + a "reliable" valence, plus a band-known unused-opportunity water reliability
  // when that opportunity sits at this locus.
  const memoryWaterConfidence =
    memory === undefined
      ? 0
      : clamp01(
          (1 - (memory.lastKnownWaterStress ?? 0.5)) * 0.5 +
            (memory.valences.includes("reliable") ? 0.3 : 0),
        );
  const opportunityWaterConfidence =
    colonization !== undefined && String(colonization.candidateTileId) === String(position)
      ? colonization.waterReliability ?? 0
      : 0;
  const localWaterConfidence = clamp01(Math.max(memoryWaterConfidence, opportunityWaterConfidence * 0.9));

  // Local band-known opportunity near the locus (her own opportunity gradient).
  const localKnownOpportunity = clamp01(
    (nearby?.opportunityStrength ?? 0) * 0.6 + (nearby?.opportunityConfidence ?? 0) * 0.2,
  );

  // Repeated presence + her OWN formed attachment at this locus (not inherited —
  // inherited memory is degraded and points at the origin, not the frontier).
  const presence = clamp01(
    (memory?.attachment ?? 0) * 0.5 + Math.min(1, (memory?.visitCount ?? 0) / 8) * 0.3,
  );

  // Corridor memory the band itself holds (band-known route knowledge).
  const corridorComponent = clamp01(Math.min(1, Object.keys(band.travelCorridors).length / 8) * 0.6);

  const confidence = clamp01((memory?.confidence ?? 0) * 0.6 + localKnownOpportunity * 0.2 + 0.1);

  // Blended local support this tick. Requires multiple aligned band-known signals,
  // not one spike; integrated over residence (so it inherently ramps with dwelling).
  const localValueEvidence = clamp01(
    localReturnTrend * 0.3 +
      localWaterConfidence * 0.24 +
      localKnownOpportunity * 0.2 +
      presence * 0.2 +
      corridorComponent * 0.1,
  );

  return { localValueEvidence, localWaterConfidence, localReturnTrend, localKnownOpportunity, confidence };
}

function makeResidenceReasonId(band: Band, tick: TickNumber): ReasonId {
  return `reason:${String(band.id)}:${String(tick)}:frontier_residence` as ReasonId;
}

// The lineage's ancestral origin: walk up the parent chain (band-known lineage
// knowledge — reading the parent band is an established sim pattern) to the founder
// and take the deepest ancestor's birth tile, falling back to the founder's own
// settled position. This must reference the FOUNDER, not the immediate parent: a
// 2nd-generation daughter is born already-outward at her mother's frontier tile, so
// measuring her reach from her mother would never register as a frontier — it has to
// be measured from where the LINEAGE began, matching the audit's origin metric.
// Bounded walk (guard), deterministic, no tile-truth read (a coordinate, not yield).
function getLineageOriginTileId(world: WorldState, band: Band): TileId | undefined {
  let current = band;
  let origin = current.fissionEvents[0]?.originTileId;

  for (let depth = 0; depth < 32; depth += 1) {
    if (current.parentBandId === undefined) {
      break;
    }

    const parent = world.bands[current.parentBandId];

    if (parent === undefined) {
      break;
    }

    const parentNatal = parent.fissionEvents[0]?.originTileId;

    if (parentNatal === undefined) {
      // The parent is the lineage founder (never fissioned from anyone) — its own
      // settled position is the ancestral origin (founders keep their refuge).
      origin = parent.position;
      break;
    }

    origin = parentNatal;
    current = parent;
  }

  return origin;
}

// Tick-gated advance/decay (mirrors the FrontierIntent / returnTrend pattern: the
// first context pass this tick advances it, later passes see the same tick and
// return the prior value unchanged, so behaviour is deterministic per season).
export function advanceFrontierResidence(
  world: WorldState,
  band: Band,
): FrontierResidenceValue | undefined {
  const tick = world.time.tick;
  const prior = band.frontierResidence;

  if (prior !== undefined && prior.lastUpdatedTick === tick) {
    return prior;
  }

  // Daughters only: a band with no parent is a founder/parent at its origin refuge —
  // it must never establish frontier residence (keeps parents anchored to refuge and
  // guarantees "no parent mass abandonment").
  if (band.parentBandId === undefined) {
    return undefined;
  }

  const position = band.position;
  const evidence = deriveFrontierResidenceEvidence(world, band);
  const supported = evidence.localValueEvidence >= EVIDENCE_THRESHOLD;

  // How far she has pushed out from her own natal origin (band-known), and her
  // outward heading (natal → here) — inherently outward for a far daughter. Deriving
  // the heading from the natal vector (not the drift intent) decouples residence from
  // the shorter-lived M0.3 intent, so it forms and HOLDS even after the intent ages
  // out (the 25-year retention horizon is longer than the intent's ~20-year cap).
  const lineageOriginTileId = getLineageOriginTileId(world, band);

  if (lineageOriginTileId === undefined) {
    return undefined;
  }

  const reachedDistance = manhattan(world, position, lineageOriginTileId) ?? 0;
  const outwardHeading =
    directionBetween(world, lineageOriginTileId, position) ?? prior?.outwardHeading;

  let anchorTileId: TileId;
  let anchorDistanceFromNatal: number;
  let residenceAge: number;
  let priorValue: number;
  let driftedInward = false;

  if (prior === undefined) {
    // ESTABLISH once she has genuinely REACHED a frontier — far from her OWN natal
    // origin — at a locus with some band-known support. No intent dependency: the
    // outward heading comes from her natal vector, so residence is durable past the
    // drift intent. Near-origin daughters never establish (preserves M0.3 reach).
    if (reachedDistance < REACHED_FRONTIER_ENGAGE || evidence.localValueEvidence < EVIDENCE_THRESHOLD) {
      return undefined;
    }

    anchorTileId = position;
    anchorDistanceFromNatal = reachedDistance;
    residenceAge = 1;
    priorValue = 0;
  } else {
    const priorAnchorDistance = manhattan(world, prior.anchorTileId, lineageOriginTileId) ?? 0;
    const distanceFromAnchor = manhattan(world, position, prior.anchorTileId) ?? 0;

    if (reachedDistance > priorAnchorDistance) {
      // She pushed FURTHER out → consolidate the new, farther frontier locus.
      anchorTileId = position;
      anchorDistanceFromNatal = reachedDistance;
      residenceAge = prior.residenceAge + 1;
      priorValue = prior.frontierLocalValue;
    } else if (distanceFromAnchor <= ANCHOR_RADIUS) {
      // Still dwelling at / near her outer anchor → keep accruing residence.
      anchorTileId = prior.anchorTileId;
      anchorDistanceFromNatal = priorAnchorDistance;
      residenceAge = prior.residenceAge + 1;
      priorValue = prior.frontierLocalValue;
    } else {
      // She has drifted INWARD, away from her frontier anchor → keep the anchor (so
      // the inward pull tries to draw her back out) but decay the value: if she keeps
      // retreating it clears and she is free (the origin is competed with, not erased).
      anchorTileId = prior.anchorTileId;
      anchorDistanceFromNatal = priorAnchorDistance;
      residenceAge = prior.residenceAge;
      priorValue = prior.frontierLocalValue;
      driftedInward = true;
    }
  }

  const frontierLocalValue =
    supported && !driftedInward
      ? clamp(priorValue + LOCAL_VALUE_GAIN * evidence.localValueEvidence, 0, MAX_LOCAL_VALUE)
      : priorValue - LOCAL_VALUE_DECAY;

  // Reversible clear: when local value collapses the residence leaves no trace and
  // she is free to retreat (the remembered origin was competed with, never erased).
  if (frontierLocalValue < MIN_VALUE_FLOOR) {
    return undefined;
  }

  // `established` (the behavioural gate) keys on the ANCHOR's distance from natal —
  // her consolidated OUTER reach — not her instantaneous position. So the hold stays
  // engaged to draw her back out when she momentarily steps inward, instead of
  // evaporating the instant she dips across the radius (the fix for a daughter who
  // otherwise settles right AT the boundary). Hysteresis: ESTABLISH to begin the
  // anchor, MAINTAIN to keep acting.
  const established =
    residenceAge >= ESTABLISH_AGE &&
    frontierLocalValue >= ESTABLISH_VALUE &&
    anchorDistanceFromNatal >= ESTABLISHED_ANCHOR_MIN;
  const confidence = clamp01(
    evidence.confidence * 0.6 + Math.min(1, residenceAge / 24) * 0.4,
  );

  return {
    bandId: band.id,
    lastUpdatedTick: tick,
    anchorTileId,
    outwardHeading,
    residenceAge,
    frontierLocalValue: round2(frontierLocalValue),
    frontierConfidence: round2(confidence),
    localWaterConfidence: round2(evidence.localWaterConfidence),
    localReturnTrend: round2(evidence.localReturnTrend),
    localKnownOpportunity: round2(evidence.localKnownOpportunity),
    established,
    reasonIds: established ? [makeResidenceReasonId(band, tick)] : [],
    noOmniscientRichness: true,
  };
}

// Bounded STAY hold at an established frontier locus: a residence-earned bias to HOLD
// the reached range instead of stepping back toward the remembered origin. Applies
// ONLY to the stay option, ONLY when residence is established, and ONLY while she is
// genuinely holding a range beyond the audit origin radius (no penalty for being
// inside — that risked ejecting her toward a worse tile; the retention comes from
// holding the reached locus + resisting inward retreat, never from pushing her
// around). Scaled by the earned local value (so it decays naturally; a poor frontier
// de-establishes and exerts nothing). A tie-breaker that competes with the inward
// place-attachment pull; because it only ever holds a locus whose water/return are
// already band-known-good (those are value components), it never trades away safety.
export function frontierResidenceStayHold(world: WorldState, band: Band): number {
  const residence = band.frontierResidence;

  if (residence === undefined || !residence.established) {
    return 0;
  }

  const lineageOriginTileId = getLineageOriginTileId(world, band);
  const reached =
    lineageOriginTileId === undefined ? undefined : manhattan(world, band.position, lineageOriginTileId);

  if (reached === undefined) {
    return 0;
  }

  // Hold ONLY when she is genuinely holding a range beyond the audit radius. No
  // penalty for being inside (that risked ejecting her toward a worse tile): the
  // retention comes from holding the reached locus + resisting inward retreat, never
  // from pushing her around.
  if (reached < HOLD_TARGET_DISTANCE) {
    return 0;
  }

  return round2(clamp01(residence.frontierLocalValue));
}

// PRINCIPLED return-pull reduction (M0.5, replaces M0.4's force-magnitude inward damp).
// Returns a MULTIPLIER in [MIN_ORIGIN_PULL, 1] applied to a daughter's ORIGIN-WARD
// memory pull (place attachment / return-place / inherited familiarity / familiar
// corridor) for a candidate MOVE. It is 1 (no change) for parents, non-established
// daughters, and OUTWARD / sideways candidates; for an established frontier daughter
// evaluating an INWARD (toward-lineage-origin) candidate it is 1 − RETURN_RELIEF×value,
// floored at MIN_ORIGIN_PULL. So once she has EARNED a strong frontier range, the draw
// of her remembered/inherited origin tiles is discounted (it COMPETES, never erased) —
// which is what tips the oscillation outward WITHOUT a dominating additive term. It
// only ever scales an existing pull DOWN, so it can never push her toward an unsafe
// tile or fabricate value; and because it is gated on `established` (good band-known
// water + return) and decays, she still retreats when the frontier collapses. Her
// attachment to the FRONTIER locus itself is on the STAY option and is left untouched.
export function frontierResidenceOriginPullRelief(
  world: WorldState,
  band: Band,
  destinationTileId: TileId,
): number {
  const residence = band.frontierResidence;

  if (residence === undefined || !residence.established) {
    return 1;
  }

  const lineageOriginTileId = getLineageOriginTileId(world, band);

  if (lineageOriginTileId === undefined) {
    return 1;
  }

  const reached = manhattan(world, band.position, lineageOriginTileId);
  const destinationReached = manhattan(world, destinationTileId, lineageOriginTileId);

  if (reached === undefined || destinationReached === undefined || destinationReached >= reached) {
    // Outward / sideways move (or unknown) → leave the origin-ward pull untouched.
    return 1;
  }

  return round2(clamp(1 - RETURN_RELIEF * clamp01(residence.frontierLocalValue), MIN_ORIGIN_PULL, 1));
}

// Residual INWARD-retreat damp for a candidate MOVE (M0.5). The principled origin-pull
// relief above removes the part of the inward draw that comes from MEMORY (attachment /
// return-place / familiarity / a known opportunity back toward origin). But a frontier
// daughter also returns for a LEGITIMATE band-known reason: the interior she came from
// genuinely has higher observed food / confidence (she has foraged it more than her
// young frontier). Relief cannot — and must not — erase that real knowledge gap, so a
// small residual damp bridges it until the frontier itself becomes band-known-good (a
// future knowledge-formation checkpoint). It ONLY penalises an inward step (never
// rewards outward → cannot push her toward an unsafe tile), is gated on `established`
// (good water + return), scales with earned value, and decays — so she still retreats
// when the frontier collapses. Bounded in [-value, 0]; at the M0.5 weight it is a
// modest tie-breaker, not the M0.4 force-magnitude override.
export function frontierResidenceInwardDamp(
  world: WorldState,
  band: Band,
  destinationTileId: TileId,
): number {
  const residence = band.frontierResidence;

  if (residence === undefined || !residence.established) {
    return 0;
  }

  const lineageOriginTileId = getLineageOriginTileId(world, band);

  if (lineageOriginTileId === undefined) {
    return 0;
  }

  const reached = manhattan(world, band.position, lineageOriginTileId);
  const destinationReached = manhattan(world, destinationTileId, lineageOriginTileId);

  if (reached === undefined || destinationReached === undefined) {
    return 0;
  }

  const inwardStep = clamp(reached - destinationReached, 0, 1);

  return round2(-inwardStep * clamp01(residence.frontierLocalValue));
}
