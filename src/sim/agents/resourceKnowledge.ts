import type { ResourceClassAvailabilitySummary, ResourceClassContribution, ResourceClassId } from "./resourceClasses";
import type { NormalizedIntensity } from "../rules/types";
import type { BandId, ReasonId, ResourcePatchId, RouteId, Season, TickNumber, TileId } from "../core/types";
import type { PlantClassId, PlantFallbackRole, PlantLifecycleState, PlantPatchAvailability, PlantPatchCondition, PlantStoragePotential } from "./plantPatches";

// Resource Knowledge State + Patch Memory substrate (checkpoint 2K.1A).
//
// STRUCTURE + DEBUG ONLY. These typed, sparse, bounded records define what a band
// CAN store about a resource patch later — distinct from terrain knowledge: a band
// can know a tile / riverbend / wetland edge without knowing which resources are
// usable there, when, whether they are safe, whether processing is needed, whether
// the patch is depleted, or why a past use failed. Nothing here is produced from
// events, inferred, inherited, decayed, or consumed by behaviour yet (those are
// later checkpoints). The container is normally EMPTY this checkpoint.

// What the band believes the patch IS, for this resource class.
export type ResourceKnowledgeStateKind =
  | "unknown"
  | "suspected"
  | "observed"
  | "used"
  | "reliable"
  | "risky"
  | "depleted"
  | "seasonally_bad";

// Where the belief came from (provenance). Distinct from confidence.
export type ResourceKnowledgeSource =
  | "direct"
  | "inherited"
  | "inferred"
  | "encounter_shared"
  | "absorbed"
  | "rumored";

// Component-specific confidence — NOT one generic confidence. Knowing a patch
// exists (presence) is a different, faster-formed belief than knowing when it is
// good (season), how much it yields, whether it is safe, whether it needs
// processing, how reachable it is, or how fast it recovers after use.
export interface ResourceConfidenceProfile {
  readonly presenceConfidence: NormalizedIntensity;
  readonly seasonConfidence: NormalizedIntensity;
  readonly yieldConfidence: NormalizedIntensity;
  readonly safetyConfidence: NormalizedIntensity;
  readonly processingConfidence: NormalizedIntensity;
  readonly accessConfidence: NormalizedIntensity;
  readonly recoveryConfidence: NormalizedIntensity;
}

export interface ResourceSeasonalityMemory {
  readonly bestSeasons: readonly Season[];
  readonly badSeasons: readonly Season[];
  readonly lastConfirmedSeason?: Season;
  readonly lastFailedTick?: TickNumber;
  readonly failedSeasonCount: number;
}

export type ResourceYieldTrend = "unknown" | "rising" | "flat" | "declining";

export interface ResourceUseHistory {
  readonly visits: number;
  readonly successfulUses: number;
  readonly failedUses: number;
  readonly lastUsedTick?: TickNumber;
  readonly lastYieldEstimate: NormalizedIntensity;
  readonly yieldTrend: ResourceYieldTrend;
  readonly depletionMemory: NormalizedIntensity;
  readonly recoveryExpectation: NormalizedIntensity;
}

export interface ResourceRiskMemory {
  readonly poisoningOrBadReaction: boolean;
  readonly badWater: boolean;
  readonly predatorOrAnimalRisk: NormalizedIntensity;
  readonly tabooOrAvoidanceFutureFlag: boolean;
}

export interface PlantObservationMemory {
  readonly plantClassId?: PlantClassId;
  readonly plantPatchId?: ResourcePatchId;
  readonly observedLifecycleState: PlantLifecycleState;
  readonly observedConditionHint: PlantPatchCondition;
  readonly observedSeasonalState: PlantPatchAvailability;
  readonly suspectedProcessingNeed: boolean;
  readonly suspectedSafetyRisk: boolean;
  readonly suspectedStoragePotential: boolean;
  readonly storagePotentialHint?: PlantStoragePotential;
  readonly fallbackRoleHint: PlantFallbackRole;
  readonly fallbackRankHint: NormalizedIntensity;
  readonly observedAvailabilityHint: NormalizedIntensity;
  readonly observedAbundanceHint: NormalizedIntensity;
  readonly confidenceModifier: NormalizedIntensity;
  readonly observationCount: number;
  readonly lastObservedTick: TickNumber;
  readonly trueValueHiddenFromBand: true;
  readonly reasonIds: readonly ReasonId[];
}

export type ResourcePatchLearningOutcome =
  | "confirmed_present"
  | "confirmed_patch_present"
  | "confirmed_seasonal_absent"
  | "found_sign_only"
  | "found_low_abundance"
  | "found_depleted_or_competed"
  | "route_improved_only"
  | "route_failed_or_blocked"
  | "safety_risk_detected"
  | "processing_need_suspected"
  | "fallback_role_identified"
  | "plant_patch_not_confirmed"
  | "belief_refuted"
  | "memory_refreshed_no_new_info";

export type ResourcePatchContradictionKind =
  | "expected_present_found_absent"
  | "expected_seasonal_found_out_of_season"
  | "expected_abundant_found_low"
  | "expected_accessible_found_costly"
  | "expected_accessible_route_blocked"
  | "expected_water_refuge_unconfirmed"
  | "expected_animal_sign_only"
  | "expected_material_low_value"
  | "inferred_belief_unconfirmed"
  | "inherited_belief_stale_or_wrong"
  | "repeated_no_new_information"
  | "memory_refreshed_without_confirmation"
  | "no_contradiction_confirmed"
  | "partial_confirmation";

export interface ResourcePatchLearningMemory {
  readonly lastOutcome: ResourcePatchLearningOutcome;
  readonly lastContradictionKind: ResourcePatchContradictionKind;
  readonly lastOutcomeTick: TickNumber;
  readonly lastFailedTick?: TickNumber;
  readonly confirmationCount: number;
  readonly contradictionCount: number;
  readonly partialConfirmationCount: number;
  readonly noInfoCount: number;
  readonly falseInferenceCount: number;
  readonly seasonalMismatchCount: number;
}

// Transmission placeholders for future inheritance / loss / sharing (not used yet).
export interface ResourceTransmissionMeta {
  readonly sourceBandId?: BandId;
  readonly inheritedFromParent?: boolean;
  readonly detailLoss: NormalizedIntensity;
  readonly practiceReinforced: number;
}

export interface ResourcePatchMemory {
  readonly patchId: ResourcePatchId;
  readonly resourceClassId: ResourceClassId;
  // The patch is anchored to an approximate tile, optionally spanning a few linked
  // tiles, and may hang off a residential anchor and/or a travel corridor.
  readonly approximateTile: TileId;
  readonly linkedTiles: readonly TileId[];
  readonly linkedAnchorId?: TileId;
  readonly linkedCorridorId?: RouteId;
  readonly state: ResourceKnowledgeStateKind;
  readonly source: ResourceKnowledgeSource;
  readonly confidence: ResourceConfidenceProfile;
  readonly seasonality: ResourceSeasonalityMemory;
  readonly useHistory: ResourceUseHistory;
  readonly risk: ResourceRiskMemory;
  readonly plantObservation?: PlantObservationMemory;
  readonly learning?: ResourcePatchLearningMemory;
  readonly transmission: ResourceTransmissionMeta;
  readonly firstNotedTick: TickNumber;
  readonly lastNotedTick: TickNumber;
  readonly reasonIds: readonly ReasonId[];
}

// Sparse, bounded per-band container. No dense per-tile x resource-class grid.
export interface ResourceKnowledgeState {
  readonly patchMemories: readonly ResourcePatchMemory[];
  readonly cap: number;
}

// Hard cap on remembered patches per band (research basis: forager knowledge is
// salient and bounded, not a complete resource map). Within the recommended 32-64.
export const RESOURCE_KNOWLEDGE_CAP = 48;

export function createEmptyResourceKnowledgeState(): ResourceKnowledgeState {
  return { patchMemories: [], cap: RESOURCE_KNOWLEDGE_CAP };
}

// ---------------------------------------------------------------------------
// Lazy staleness / decay (checkpoint 2K.1C).
//
// Resource beliefs must not be immortal. Decay is LAZY: nothing stored is mutated
// by a per-tick sweep; instead effective (decayed) confidence is derived on demand
// from stalenessTicks = currentTick - lastNotedTick whenever a memory is read,
// ranked, summarised, or about to be evicted. Raw confidence is preserved (it is
// the best-ever-known value); effective confidence is what has survived neglect.
// Decay differs by channel, and durable negative/risk memory (poisoning / bad
// water / taboo-avoid) resists decay and eviction — a band does not forget that a
// place harmed it. Still behaviour-neutral: nothing consumes effective confidence.
const RESOURCE_STALE_TICKS = 32; // ~8 years unobserved
const RESOURCE_DORMANT_TICKS = 80; // ~20 years unobserved
const RESOURCE_DURABLE_RISK_DECAY_MULT = 0.2; // durable risk decays 5x slower
const RESOURCE_DORMANT_PRUNE_RETENTION = 0.32; // dormant + faint + non-durable -> forgotten

interface ResourceDecayChannel {
  readonly rate: number; // fractional confidence lost per stale tick
  readonly floorFrac: number; // never decays below this fraction of raw
}

// Presence/location persists (a band remembers a place exists); access is fairly
// stable (terrain). Yield/season/processing fade faster without re-confirmation.
// Safety decays slowly, and far slower still when a durable risk flag is set.
const RESOURCE_DECAY: {
  readonly presence: ResourceDecayChannel;
  readonly season: ResourceDecayChannel;
  readonly yield: ResourceDecayChannel;
  readonly safety: ResourceDecayChannel;
  readonly processing: ResourceDecayChannel;
  readonly access: ResourceDecayChannel;
  readonly recovery: ResourceDecayChannel;
} = {
  presence: { rate: 0.004, floorFrac: 0.35 },
  season: { rate: 0.015, floorFrac: 0.10 },
  yield: { rate: 0.020, floorFrac: 0.10 },
  safety: { rate: 0.002, floorFrac: 0.70 },
  processing: { rate: 0.020, floorFrac: 0.05 },
  access: { rate: 0.006, floorFrac: 0.40 },
  recovery: { rate: 0.020, floorFrac: 0.00 },
};

export type ResourceStalenessLabel = "fresh" | "stale" | "dormant" | "remembered_location_only";

export interface EffectiveResourceConfidence {
  readonly stalenessTicks: number;
  readonly effectivePresenceConfidence: NormalizedIntensity;
  readonly effectiveSeasonConfidence: NormalizedIntensity;
  readonly effectiveYieldConfidence: NormalizedIntensity;
  readonly effectiveSafetyConfidence: NormalizedIntensity;
  readonly effectiveProcessingConfidence: NormalizedIntensity;
  readonly effectiveAccessConfidence: NormalizedIntensity;
  readonly effectiveRecoveryConfidence: NormalizedIntensity;
  readonly isStale: boolean;
  readonly isDormant: boolean;
  readonly label: ResourceStalenessLabel;
  readonly durableRiskProtected: boolean;
}

export function computeResourceStaleness(memory: ResourcePatchMemory, currentTick: number): number {
  return Math.max(0, currentTick - Number(memory.lastNotedTick));
}

function hasDurableRisk(memory: ResourcePatchMemory): boolean {
  return memory.risk.poisoningOrBadReaction || memory.risk.badWater || memory.risk.tabooOrAvoidanceFutureFlag;
}

function decayChannel(raw: number, channel: ResourceDecayChannel, staleness: number, rateMult: number): number {
  return round2(raw * Math.max(channel.floorFrac, 1 - channel.rate * rateMult * staleness));
}

export function effectiveResourceConfidence(
  memory: ResourcePatchMemory,
  currentTick: number,
): EffectiveResourceConfidence {
  const staleness = computeResourceStaleness(memory, currentTick);
  const durable = hasDurableRisk(memory);
  const safetyMult = durable ? RESOURCE_DURABLE_RISK_DECAY_MULT : 1;
  const confidence = memory.confidence;

  const effectivePresenceConfidence = decayChannel(confidence.presenceConfidence, RESOURCE_DECAY.presence, staleness, 1);
  const effectiveYieldConfidence = decayChannel(confidence.yieldConfidence, RESOURCE_DECAY.yield, staleness, 1);
  const isStale = staleness >= RESOURCE_STALE_TICKS;
  const isDormant = staleness >= RESOURCE_DORMANT_TICKS && !durable;
  const label: ResourceStalenessLabel = isDormant
    ? "remembered_location_only"
    : staleness >= RESOURCE_DORMANT_TICKS
      ? "dormant"
      : isStale
        ? "stale"
        : "fresh";

  return {
    stalenessTicks: staleness,
    effectivePresenceConfidence,
    effectiveSeasonConfidence: decayChannel(confidence.seasonConfidence, RESOURCE_DECAY.season, staleness, 1),
    effectiveYieldConfidence,
    effectiveSafetyConfidence: decayChannel(confidence.safetyConfidence, RESOURCE_DECAY.safety, staleness, safetyMult),
    effectiveProcessingConfidence: decayChannel(confidence.processingConfidence, RESOURCE_DECAY.processing, staleness, 1),
    effectiveAccessConfidence: decayChannel(confidence.accessConfidence, RESOURCE_DECAY.access, staleness, 1),
    effectiveRecoveryConfidence: decayChannel(confidence.recoveryConfidence, RESOURCE_DECAY.recovery, staleness, 1),
    isStale,
    isDormant,
    label,
    durableRiskProtected: durable,
  };
}

// Decay-aware retention: uses EFFECTIVE (faded) confidence + a recency term, so
// neglected memories sink and are evicted first; durable risk salience is NOT
// decayed (the band keeps the warning), and practice still counts.
export function resourcePatchRetentionScore(memory: ResourcePatchMemory, currentTick: number): number {
  const effective = effectiveResourceConfidence(memory, currentTick);
  const peakEffective = Math.max(
    effective.effectivePresenceConfidence,
    effective.effectiveSeasonConfidence,
    effective.effectiveYieldConfidence,
    effective.effectiveSafetyConfidence,
    effective.effectiveProcessingConfidence,
    effective.effectiveAccessConfidence,
    effective.effectiveRecoveryConfidence,
  );
  const riskSalience = (memory.risk.poisoningOrBadReaction ? 0.4 : 0)
    + (memory.risk.badWater ? 0.3 : 0)
    + (memory.risk.tabooOrAvoidanceFutureFlag ? 0.3 : 0)
    + memory.risk.predatorOrAnimalRisk * 0.2;
  const practice = Math.min(0.4, memory.transmission.practiceReinforced * 0.05);
  const recency = Math.max(0, 0.3 - effective.stalenessTicks * 0.004);
  // Inferred / suspected beliefs are weak guesses: penalise them so direct
  // observed/used/reliable memories always win retention and inferred clutter is
  // evicted first (2K.1E).
  const inferredPenalty = memory.source === "inferred" ? 0.15 : 0;

  return round4(peakEffective + riskSalience + practice + recency - inferredPenalty);
}

// Deterministic ordering for retention: highest retention first, patchId tiebreak.
export function rankResourcePatchMemoriesForRetention(
  memories: readonly ResourcePatchMemory[],
  currentTick: number,
): readonly ResourcePatchMemory[] {
  return memories
    .slice()
    .sort((left, right) => {
      const delta = resourcePatchRetentionScore(right, currentTick) - resourcePatchRetentionScore(left, currentTick);

      return delta === 0
        ? String(left.patchId).localeCompare(String(right.patchId))
        : delta;
    });
}

// Lazy forgetting: drop dormant, faint, NON-durable memories (a band genuinely
// forgets a long-abandoned, low-value patch). Durable risk memories are never
// pruned. Called only while a band is already updating its knowledge (no sweep).
export function pruneDormantResourceMemories(
  memories: readonly ResourcePatchMemory[],
  currentTick: number,
): readonly ResourcePatchMemory[] {
  return memories.filter((memory) => {
    const effective = effectiveResourceConfidence(memory, currentTick);

    if (!effective.isDormant) {
      return true;
    }

    return resourcePatchRetentionScore(memory, currentTick) >= RESOURCE_DORMANT_PRUNE_RETENTION;
  });
}

// Enforce the per-band cap by keeping the highest decay-aware retention (bounded).
export function enforceResourceKnowledgeCap(
  state: ResourceKnowledgeState,
  currentTick: number,
): ResourceKnowledgeState {
  if (state.patchMemories.length <= state.cap) {
    return state;
  }

  return {
    ...state,
    patchMemories: rankResourcePatchMemoriesForRetention(state.patchMemories, currentTick).slice(0, state.cap),
  };
}

// Distinct resource classes covered by the band's patch memories (breadth), and a
// normalised 0..1 diversity (breadth over the full class table size).
const RESOURCE_CLASS_COUNT = 8;

export function computeKnowledgeBreadth(state: ResourceKnowledgeState): number {
  const classes = new Set<ResourceClassId>();

  for (const memory of state.patchMemories) {
    classes.add(memory.resourceClassId);
  }

  return classes.size;
}

export function computeKnowledgeDiversity(state: ResourceKnowledgeState): NormalizedIntensity {
  return round2(Math.min(1, computeKnowledgeBreadth(state) / RESOURCE_CLASS_COUNT));
}

// Compact, report/UI-safe summary of the (usually empty) knowledge state. Structure
// only — explicitly carries behaviorCoupled: false.
export interface ResourcePatchMemorySummary {
  readonly patchId: string;
  readonly resourceClassId: ResourceClassId;
  readonly approximateTile: string;
  readonly state: ResourceKnowledgeStateKind;
  readonly source: ResourceKnowledgeSource;
  readonly presenceConfidence: NormalizedIntensity;
  readonly effectivePresenceConfidence: NormalizedIntensity;
  readonly safetyConfidence: NormalizedIntensity;
  readonly stalenessTicks: number;
  readonly stalenessLabel: ResourceStalenessLabel;
  readonly lastNotedTick: number;
}

export interface ResourceKnowledgeSummary {
  readonly totalMemories: number;
  readonly cap: number;
  readonly withinCap: boolean;
  readonly suspectedCount: number;
  readonly observedCount: number;
  readonly usedCount: number;
  readonly reliableCount: number;
  readonly riskyCount: number;
  readonly depletedCount: number;
  readonly seasonallyBadCount: number;
  readonly inheritedCount: number;
  readonly inferredCount: number;
  readonly staleCount: number;
  readonly dormantCount: number;
  readonly durableRiskCount: number;
  readonly knowledgeBreadth: number;
  readonly resourceDiversity: NormalizedIntensity;
  readonly topMemories: readonly ResourcePatchMemorySummary[];
  readonly behaviorCoupled: false;
}

export function summarizeResourceKnowledgeState(
  state: ResourceKnowledgeState,
  currentTick: number,
  topLimit = 6,
): ResourceKnowledgeSummary {
  const memories = state.patchMemories;
  const ranked = rankResourcePatchMemoriesForRetention(memories, currentTick);
  let staleCount = 0;
  let dormantCount = 0;
  let durableRiskCount = 0;

  for (const memory of memories) {
    const effective = effectiveResourceConfidence(memory, currentTick);
    if (effective.durableRiskProtected) durableRiskCount += 1;
    if (effective.isDormant) dormantCount += 1;
    else if (effective.isStale) staleCount += 1;
  }

  return {
    totalMemories: memories.length,
    cap: state.cap,
    withinCap: memories.length <= state.cap,
    suspectedCount: countState(memories, "suspected"),
    observedCount: countState(memories, "observed"),
    usedCount: countState(memories, "used"),
    reliableCount: countState(memories, "reliable"),
    riskyCount: countState(memories, "risky"),
    depletedCount: countState(memories, "depleted"),
    seasonallyBadCount: countState(memories, "seasonally_bad"),
    inheritedCount: countSource(memories, "inherited"),
    inferredCount: countSource(memories, "inferred"),
    staleCount,
    dormantCount,
    durableRiskCount,
    knowledgeBreadth: computeKnowledgeBreadth(state),
    resourceDiversity: computeKnowledgeDiversity(state),
    topMemories: ranked.slice(0, topLimit).map((memory) => {
      const effective = effectiveResourceConfidence(memory, currentTick);

      return {
        patchId: String(memory.patchId),
        resourceClassId: memory.resourceClassId,
        approximateTile: String(memory.approximateTile),
        state: memory.state,
        source: memory.source,
        presenceConfidence: memory.confidence.presenceConfidence,
        effectivePresenceConfidence: effective.effectivePresenceConfidence,
        safetyConfidence: memory.confidence.safetyConfidence,
        stalenessTicks: effective.stalenessTicks,
        stalenessLabel: effective.label,
        lastNotedTick: memory.lastNotedTick as unknown as number,
      };
    }),
    behaviorCoupled: false,
  };
}

// ---------------------------------------------------------------------------
// Observation-based belief formation (checkpoint 2K.1B).
//
// Forms / updates ResourcePatchMemory records from the band's OWN observed
// resource-class decomposition of its CURRENT tile. Deterministic, bounded, and
// behaviour-neutral (nothing reads these for decisions/yield/stress yet). It runs
// in each of the three same-tick context passes; per-(patch,tick) idempotent
// counters + last-pass-wins value refresh make it converge to the band's
// end-of-tick observation, mirroring updateReturnTrend's sameTick semantics.
// Anti-omniscient: the only input is the band's own already-derived summary +
// band-known stress context; no hidden tile truth, no map scan.
const MAX_OBSERVED_CLASSES_PER_TILE = 3;
const OBSERVATION_SALIENCE_THRESHOLD = 0.18;
const PRODUCTIVE_SEASON_AVAILABILITY = 0.25;

export interface ResourceObservationContext {
  readonly tileId: TileId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly waterStress: NormalizedIntensity;
  readonly perCapitaReturn: NormalizedIntensity;
  readonly anchorTileId?: TileId;
  readonly corridorId?: RouteId;
  // 2K.10 — optional provenance of the observation EVENT (e.g. "side_country_probe"). Recorded in
  // the formed memory's reasonIds for audit/debug only; omitted by existing callers → byte-identical.
  readonly observationSource?: string;
}

export function updateResourceKnowledgeFromObservation(
  previous: ResourceKnowledgeState | undefined,
  summary: ResourceClassAvailabilitySummary | undefined,
  context: ResourceObservationContext,
): ResourceKnowledgeState | undefined {
  if (summary === undefined) {
    return previous;
  }

  const salient = selectSalientObservations(summary, context);

  if (salient.length === 0) {
    return previous;
  }

  const base = previous ?? createEmptyResourceKnowledgeState();
  const updatedByPatch = new Map<ResourcePatchId, ResourcePatchMemory>();

  for (const contribution of salient) {
    const patchId = makeResourcePatchId(context.tileId, contribution.classId);
    const existing = base.patchMemories.find((memory) => memory.patchId === patchId);
    updatedByPatch.set(patchId, formPatchMemory(existing, patchId, contribution, summary, context));
  }

  // Preserve existing order for updated/unchanged records; append genuinely-new
  // ones in salience order. Deterministic.
  const consumed = new Set<ResourcePatchId>();
  const patchMemories: ResourcePatchMemory[] = [];

  for (const memory of base.patchMemories) {
    const updated = updatedByPatch.get(memory.patchId);

    if (updated !== undefined) {
      patchMemories.push(updated);
      consumed.add(memory.patchId);
    } else {
      patchMemories.push(memory);
    }
  }

  for (const [patchId, memory] of updatedByPatch) {
    if (!consumed.has(patchId)) {
      patchMemories.push(memory);
    }
  }

  // Lazy forgetting + decay-aware cap, both keyed to the current tick (no sweep:
  // this only runs because the band is forming/refreshing a belief this tick).
  const pruned = pruneDormantResourceMemories(patchMemories, Number(context.tick));

  return enforceResourceKnowledgeCap({ ...base, patchMemories: pruned }, Number(context.tick));
}

function selectSalientObservations(
  summary: ResourceClassAvailabilitySummary,
  context: ResourceObservationContext,
): readonly ResourceClassContribution[] {
  return summary.contributionByClass
    .map((contribution) => ({ contribution, salience: observationSalience(contribution, summary, context) }))
    .filter((scored) => scored.salience >= OBSERVATION_SALIENCE_THRESHOLD)
    .sort((left, right) => {
      const delta = right.salience - left.salience;

      return delta === 0
        ? left.contribution.classId.localeCompare(right.contribution.classId)
        : delta;
    })
    .slice(0, MAX_OBSERVED_CLASSES_PER_TILE)
    .map((scored) => scored.contribution);
}

// Salience uses only band-known signals: the class's own derived availability /
// support, dominance, the band's water stress (water/aquatic matter in dry/refuge
// contexts), low per-capita return (fallback matters when stressed), and the
// band's own use pressure (depletion signal). No hidden truth.
function observationSalience(
  contribution: ResourceClassContribution,
  summary: ResourceClassAvailabilitySummary,
  context: ResourceObservationContext,
): number {
  let salience = Math.max(contribution.supportContribution, contribution.availability * 0.5);

  if (contribution.classId === summary.dominantClass) {
    salience += 0.15;
  }

  if (contribution.classId === "water_resource" || contribution.classId === "aquatic_food") {
    salience += context.waterStress * 0.4;
  }

  if (contribution.classId === "fallback_food") {
    salience += clamp01(1 - context.perCapitaReturn) * 0.3;
  }

  salience += contribution.pressure * 0.2;

  return salience;
}

function formPatchMemory(
  existing: ResourcePatchMemory | undefined,
  patchId: ResourcePatchId,
  contribution: ResourceClassContribution,
  summary: ResourceClassAvailabilitySummary,
  context: ResourceObservationContext,
): ResourcePatchMemory {
  // Idempotent across the three same-tick passes: a record already noted this tick
  // refreshes its values but does not re-increment counters.
  const alreadyThisTick = existing !== undefined && Number(existing.lastNotedTick) === Number(context.tick);
  const priorVisits = existing?.useHistory.visits ?? 0;
  const visits = alreadyThisTick ? priorVisits : priorVisits + 1;
  const priorReinforced = existing?.transmission.practiceReinforced ?? 0;
  const practiceReinforced = alreadyThisTick ? priorReinforced : priorReinforced + 1;

  const productiveThisSeason =
    contribution.availability >= PRODUCTIVE_SEASON_AVAILABILITY || contribution.supportContribution > 0.05;
  const bestSeasons = productiveThisSeason
    ? addUniqueSeason(existing?.seasonality.bestSeasons ?? [], context.season)
    : existing?.seasonality.bestSeasons ?? [];
  const distinctSeasons = bestSeasons.length;

  // Component-specific confidence (2K.1A fields): presence rises fastest; yield
  // modest; season only accrues with distinct seasons; safety/access light;
  // processing/recovery NOT raised (the band has not processed or rested it).
  const presenceConfidence = round2(clamp01(0.45 + Math.min(0.4, visits * 0.08)));
  const yieldConfidence = round2(clamp01(0.25 + Math.min(0.3, visits * 0.05) + contribution.supportContribution * 0.2));
  const seasonConfidence = round2(clamp01(0.12 + distinctSeasons * 0.18));
  const safetyConfidence = round2(clamp01(0.2 + Math.min(0.15, visits * 0.03)));
  const processingConfidence = existing?.confidence.processingConfidence ?? 0;
  const accessConfidence = round2(clamp01(0.4 + Math.min(0.25, visits * 0.05)));
  const recoveryConfidence = existing?.confidence.recoveryConfidence ?? 0;

  // State ladder: a single observation is shallow; reliability needs repeated
  // observation across multiple seasons. No risky/depleted/seasonally_bad yet
  // (those require failure/illness signals that do not exist this checkpoint).
  let state: ResourceKnowledgeStateKind;

  if (contribution.availability < 0.12 && presenceConfidence < 0.5) {
    state = "suspected";
  } else if (visits >= 4 && distinctSeasons >= 2 && yieldConfidence > 0.5) {
    state = "reliable";
  } else if (visits >= 2) {
    state = "used";
  } else {
    state = "observed";
  }

  const currentYield = round2(contribution.supportContribution);
  const priorYield = existing?.useHistory.lastYieldEstimate;
  const yieldTrend: ResourceYieldTrend = alreadyThisTick || existing === undefined || priorYield === undefined
    ? existing?.useHistory.yieldTrend ?? "unknown"
    : currentYield > priorYield + 0.03
      ? "rising"
      : currentYield < priorYield - 0.03
        ? "declining"
        : "flat";

  return {
    patchId,
    resourceClassId: contribution.classId,
    approximateTile: context.tileId,
    linkedTiles: [],
    linkedAnchorId: context.anchorTileId,
    linkedCorridorId: context.corridorId,
    state,
    source: "direct",
    confidence: {
      presenceConfidence,
      seasonConfidence,
      yieldConfidence,
      safetyConfidence,
      processingConfidence,
      accessConfidence,
      recoveryConfidence,
    },
    seasonality: {
      bestSeasons,
      badSeasons: existing?.seasonality.badSeasons ?? [],
      lastConfirmedSeason: productiveThisSeason ? context.season : existing?.seasonality.lastConfirmedSeason,
      failedSeasonCount: existing?.seasonality.failedSeasonCount ?? 0,
    },
    useHistory: {
      visits,
      // Observation is not harvest: successful/failed USE counters stay untouched
      // (no harvest/failure events this checkpoint).
      successfulUses: existing?.useHistory.successfulUses ?? 0,
      failedUses: existing?.useHistory.failedUses ?? 0,
      lastUsedTick: existing?.useHistory.lastUsedTick,
      lastYieldEstimate: currentYield,
      yieldTrend,
      // Depletion belief tracks the band's OWN use pressure on the patch (band-known).
      depletionMemory: round2(clamp01(contribution.pressure)),
      recoveryExpectation: existing?.useHistory.recoveryExpectation ?? 0,
    },
    risk: {
      poisoningOrBadReaction: existing?.risk.poisoningOrBadReaction ?? false,
      badWater: existing?.risk.badWater ?? false,
      predatorOrAnimalRisk: round2(clamp01(contribution.riskPlaceholder)),
      tabooOrAvoidanceFutureFlag: existing?.risk.tabooOrAvoidanceFutureFlag ?? false,
    },
    plantObservation: existing?.plantObservation,
    transmission: {
      sourceBandId: existing?.transmission.sourceBandId,
      inheritedFromParent: existing?.transmission.inheritedFromParent,
      detailLoss: existing?.transmission.detailLoss ?? 0,
      practiceReinforced,
    },
    firstNotedTick: existing?.firstNotedTick ?? context.tick,
    lastNotedTick: context.tick,
    reasonIds: [
      `reason:resource_knowledge:${patchId}:${Number(context.tick)}:${context.observationSource ?? "observed"}` as ReasonId,
    ],
  };
}

function makeResourcePatchId(tileId: TileId, classId: ResourceClassId): ResourcePatchId {
  return `patch:${String(tileId)}:${classId}` as ResourcePatchId;
}

// ---------------------------------------------------------------------------
// Daughter fission inheritance (checkpoint 2K.1D).
//
// A daughter band must NOT receive a perfect copy of the parent's resource
// knowledge. Inheritance is partial, bounded, degraded, and source-tagged: the
// daughter learns ABOUT a subset of the parent's patches (biased toward
// high-effective-confidence, recently-practiced, route/known-tile-relevant, and
// durable-risk memories) but at reduced precision, as second-hand knowledge it has
// not personally confirmed. Deterministic, event-time only (no randomness, no
// sweep). Still behaviour-neutral. Uses EFFECTIVE (decayed) confidence as the base,
// so a parent's already-faded belief transmits even weaker.
const DAUGHTER_INHERIT_CAP = 12;

// Per-channel transmission fidelity: presence/access survive best (you can pass on
// "there is a place near the big bend"); yield/season degrade more; safety degrades
// less when durable (you warn your kin about the bad place); processing/recovery
// barely transmit without practice.
const INHERIT_FIDELITY = {
  presence: 0.85,
  access: 0.85,
  yield: 0.60,
  season: 0.55,
  safetyBase: 0.60,
  safetyDurable: 0.85,
  processing: 0.30,
  recovery: 0.30,
};

export interface ResourceInheritanceContext {
  readonly parentBandId: BandId;
  readonly daughterBandId: BandId;
  readonly daughterTileId: TileId;
  readonly currentTick: TickNumber;
  readonly inheritedKnownTileIds: ReadonlySet<TileId>;
  readonly cap?: number;
}

// Pure, deterministic. Returns the daughter's INITIAL resource knowledge — never the
// parent's container by reference, never a full copy.
// ECOLOGY-VIABILITY-CORRECTION-3 (Defect B) — returned verification evidence.
//
// A verification party physically stands at ONE remembered patch and looks without
// taking. Previously its return was applied through the activity-memory writer, i.e.
// the SAME path a failed harvest uses: because `verifyOnly` forces
// `activityEligible = false`, the carried record reads usableSupport 0 /
// "activity_failed", so a verification that physically CONFIRMED the resource wrote a
// failed-harvest result into the very memory it was sent to confirm. Confidence could
// never rise to gathering eligibility, so verification repeated forever and distant
// gathering never became reachable (measured: ordinary founder, 50 of 50 expeditions
// verification, 0 food units, extinct by y80).
//
// This writer applies ONLY what physical presence at that one patch can establish, and
// deliberately does NOT touch the other patches or classes on the tile (that would be a
// general tile observation the party did not make).
//
// Anti-omniscience guards, all load-bearing:
//   - presence confidence is raised only TOWARD the observation's own bounded
//     confidence and never to certainty (one visit is one visit);
//   - `target_confirmed` leaves yieldConfidence UNCHANGED — presence was observed, yield
//     was never attempted, so yield evidence must not move in either direction;
//   - `target_depleted` is the one case that legitimately carries yield evidence,
//     because physical availability was directly observed at ~0. It keeps presence
//     (the patch IS there) and stays distinct from absence;
//   - exact stock is never copied into memory; only the bounded observation kind.
export type VerificationObservationKind = "target_confirmed" | "target_depleted" | "target_absent";

export function applyVerificationObservationToMemory(
  memory: ResourcePatchMemory,
  kind: VerificationObservationKind,
  observedConfidence: number,
  tick: TickNumber,
): ResourcePatchMemory {
  const observed = round2(clamp01(observedConfidence));
  const presence = memory.confidence.presenceConfidence;
  const yieldConf = memory.confidence.yieldConfidence;

  const nextPresence =
    kind === "target_absent"
      ? round2(clamp01(presence * 0.5))
      : round2(clamp01(Math.max(presence, observed)));

  // Only a directly observed empty patch is yield evidence.
  const nextYield = kind === "target_depleted" ? round2(clamp01(yieldConf * 0.6)) : yieldConf;

  return {
    ...memory,
    confidence: {
      ...memory.confidence,
      presenceConfidence: nextPresence,
      yieldConfidence: nextYield,
    },
    // Physical presence refreshes recency for every reached outcome, including absence:
    // the band now knows something current about this patch either way. This is what
    // breaks the loop — staleness no longer re-triggers the same verification forever.
    lastNotedTick: tick,
    reasonIds: [
      ...memory.reasonIds.slice(-3),
      `reason:verification-return:${kind}:${Number(tick)}` as ReasonId,
    ],
  };
}

export function inheritResourceKnowledgeForDaughter(
  parentState: ResourceKnowledgeState | undefined,
  context: ResourceInheritanceContext,
): ResourceKnowledgeState {
  const inheritCap = Math.min(context.cap ?? DAUGHTER_INHERIT_CAP, RESOURCE_KNOWLEDGE_CAP);

  if (parentState === undefined || parentState.patchMemories.length === 0) {
    return { patchMemories: [], cap: RESOURCE_KNOWLEDGE_CAP };
  }

  const currentTick = Number(context.currentTick);
  const candidates = parentState.patchMemories
    .map((memory) => ({ memory, effective: effectiveResourceConfidence(memory, currentTick) }))
    // A daughter does not inherit patches the parent itself has effectively forgotten.
    .filter((entry) => !(entry.effective.isDormant && !entry.effective.durableRiskProtected))
    .map((entry) => ({ memory: entry.memory, score: inheritanceScore(entry.memory, entry.effective, context, currentTick) }))
    .sort((left, right) => {
      const delta = right.score - left.score;

      return delta === 0
        ? String(left.memory.patchId).localeCompare(String(right.memory.patchId))
        : delta;
    })
    .slice(0, inheritCap);

  const patchMemories = candidates.map((entry) =>
    degradeInheritedMemory(entry.memory, effectiveResourceConfidence(entry.memory, currentTick), context),
  );

  return { patchMemories, cap: RESOURCE_KNOWLEDGE_CAP };
}

function inheritanceScore(
  memory: ResourcePatchMemory,
  effective: EffectiveResourceConfidence,
  context: ResourceInheritanceContext,
  currentTick: number,
): number {
  let score = resourcePatchRetentionScore(memory, currentTick); // decay-aware base

  if (context.inheritedKnownTileIds.has(memory.approximateTile)) {
    score += 0.3; // route / known-range relevance
  }

  if (effective.durableRiskProtected) {
    score += 0.3; // safety warnings are always worth passing on
  }

  if (memory.state === "suspected") {
    score -= 0.2; // do not burden the daughter with the parent's hunches
  }

  return score;
}

function degradeInheritedMemory(
  memory: ResourcePatchMemory,
  effective: EffectiveResourceConfidence,
  context: ResourceInheritanceContext,
): ResourcePatchMemory {
  const durable = effective.durableRiskProtected;
  const presence = round2(clamp01(effective.effectivePresenceConfidence * INHERIT_FIDELITY.presence));
  const access = round2(clamp01(effective.effectiveAccessConfidence * INHERIT_FIDELITY.access));
  const yieldConf = round2(clamp01(effective.effectiveYieldConfidence * INHERIT_FIDELITY.yield));
  const season = round2(clamp01(effective.effectiveSeasonConfidence * INHERIT_FIDELITY.season));
  const safety = round2(clamp01(effective.effectiveSafetyConfidence * (durable ? INHERIT_FIDELITY.safetyDurable : INHERIT_FIDELITY.safetyBase)));
  const processing = round2(clamp01(effective.effectiveProcessingConfidence * INHERIT_FIDELITY.processing));
  const recovery = round2(clamp01(effective.effectiveRecoveryConfidence * INHERIT_FIDELITY.recovery));
  const detailLoss = round2(clamp01(0.25 + (1 - presence) * 0.3));
  const state = downgradeInheritedState(memory.state, presence, durable);

  return {
    ...memory,
    // Same patch identity (so the daughter's later direct observation reinforces it),
    // but tagged as inherited second-hand knowledge.
    source: "inherited",
    state,
    confidence: {
      presenceConfidence: presence,
      seasonConfidence: season,
      yieldConfidence: yieldConf,
      safetyConfidence: safety,
      processingConfidence: processing,
      accessConfidence: access,
      recoveryConfidence: recovery,
    },
    useHistory: {
      // The daughter has not personally used the patch.
      visits: 0,
      successfulUses: 0,
      failedUses: 0,
      lastUsedTick: undefined,
      lastYieldEstimate: round2(memory.useHistory.lastYieldEstimate * INHERIT_FIDELITY.yield),
      yieldTrend: "unknown",
      depletionMemory: round2(memory.useHistory.depletionMemory * 0.5),
      recoveryExpectation: 0,
    },
    risk: {
      // Durable safety warnings transmit; precision (predator/animal) is reduced.
      poisoningOrBadReaction: memory.risk.poisoningOrBadReaction,
      badWater: memory.risk.badWater,
      predatorOrAnimalRisk: round2(clamp01(memory.risk.predatorOrAnimalRisk * 0.7)),
      tabooOrAvoidanceFutureFlag: memory.risk.tabooOrAvoidanceFutureFlag,
    },
    plantObservation: degradeInheritedPlantObservation(memory.plantObservation, context),
    transmission: {
      sourceBandId: context.parentBandId,
      inheritedFromParent: true,
      detailLoss,
      practiceReinforced: 0,
    },
    // From the daughter's perspective the belief is newly received now.
    firstNotedTick: context.currentTick,
    lastNotedTick: context.currentTick,
    reasonIds: [`reason:resource_knowledge:${memory.patchId}:${Number(context.currentTick)}:inherited` as ReasonId],
  };
}

function degradeInheritedPlantObservation(
  memory: PlantObservationMemory | undefined,
  context: ResourceInheritanceContext,
): PlantObservationMemory | undefined {
  if (memory === undefined) {
    return undefined;
  }

  return {
    ...memory,
    observedAvailabilityHint: round2(clamp01(memory.observedAvailabilityHint * 0.65)),
    observedAbundanceHint: round2(clamp01(memory.observedAbundanceHint * 0.55)),
    confidenceModifier: round2(clamp01(memory.confidenceModifier * 0.6)),
    fallbackRankHint: round2(clamp01(memory.fallbackRankHint * 0.6)),
    observationCount: 0,
    lastObservedTick: context.currentTick,
    reasonIds: [`reason:resource_knowledge:${memory.plantPatchId ?? "plant_hint"}:${Number(context.currentTick)}:inherited_plant_hint` as ReasonId],
  };
}

function downgradeInheritedState(
  state: ResourceKnowledgeStateKind,
  degradedPresence: number,
  durable: boolean,
): ResourceKnowledgeStateKind {
  if (durable && (state === "risky" || state === "depleted" || state === "seasonally_bad")) {
    return state; // durable negative status survives transmission (reduced precision)
  }

  switch (state) {
    case "reliable":
      return "used";
    case "used":
      return "observed";
    case "observed":
      return degradedPresence < 0.5 ? "suspected" : "observed";
    default:
      return state;
  }
}

function addUniqueSeason(seasons: readonly Season[], season: Season): readonly Season[] {
  return seasons.includes(season) ? seasons : [...seasons, season];
}

// ---------------------------------------------------------------------------
// Low-confidence resource inference (checkpoint 2K.1E).
//
// A band may SUSPECT likely resource classes at places it KNOWS but has not
// directly observed/used — from the terrain/resource cue in its OWN known-tile
// record (the same band-known decomposition observation uses) and from analogy to
// its own prior direct experience of that class. Inference is strictly weaker than
// observation: source='inferred', state='suspected', hard low confidence caps, and
// it NEVER overwrites a real (non-inferred) belief. Bounded (caller passes a small
// candidate set), deterministic, anti-omniscient, behaviour-neutral. If the band
// later directly observes the tile, the observation path upgrades the same patchId
// in place (no duplicate).
const MAX_INFERENCE_CANDIDATES = 8;
const MAX_INFERRED_CLASSES_PER_TILE = 2;
const INFERENCE_MIN_AVAILABILITY = 0.25;
const INFERRED_PRESENCE_CAP = 0.4;
const INFERRED_YIELD_CAP = 0.25;
const INFERRED_ANALOGY_BOOST = 0.1;

// A candidate tile the band KNOWS (has a record for) but is not its current tile,
// with the resource-class decomposition derived from that band-known record.
export interface ResourceInferenceCandidate {
  readonly tileId: TileId;
  readonly summary: ResourceClassAvailabilitySummary;
}

export interface ResourceInferenceContext {
  readonly tick: TickNumber;
  readonly season: Season;
  readonly anchorTileId?: TileId;
}

export function inferResourceKnowledge(
  state: ResourceKnowledgeState | undefined,
  candidates: readonly ResourceInferenceCandidate[],
  context: ResourceInferenceContext,
): ResourceKnowledgeState | undefined {
  if (candidates.length === 0) {
    return state;
  }

  const base = state ?? createEmptyResourceKnowledgeState();

  // Analogy support = resource classes the band has genuine DIRECT experience of.
  const experiencedClasses = new Set<ResourceClassId>();
  for (const memory of base.patchMemories) {
    if (memory.source === "direct" && (memory.state === "observed" || memory.state === "used" || memory.state === "reliable")) {
      experiencedClasses.add(memory.resourceClassId);
    }
  }

  const byPatch = new Map<ResourcePatchId, ResourcePatchMemory>(
    base.patchMemories.map((memory) => [memory.patchId, memory]),
  );
  let changed = false;

  for (const candidate of candidates.slice(0, MAX_INFERENCE_CANDIDATES)) {
    const salientClasses = candidate.summary.contributionByClass
      .filter((contribution) => contribution.availability >= INFERENCE_MIN_AVAILABILITY)
      .sort((left, right) => {
        const delta = right.availability - left.availability;

        return delta === 0 ? left.classId.localeCompare(right.classId) : delta;
      })
      .slice(0, MAX_INFERRED_CLASSES_PER_TILE);

    for (const contribution of salientClasses) {
      const patchId = makeResourcePatchId(candidate.tileId, contribution.classId);
      const existing = byPatch.get(patchId);

      // Never downgrade real knowledge: only create, or refresh an existing inferred.
      if (existing !== undefined && existing.source !== "inferred") {
        continue;
      }

      byPatch.set(
        patchId,
        formInferredMemory(existing, patchId, candidate.tileId, contribution, experiencedClasses.has(contribution.classId), context),
      );
      changed = true;
    }
  }

  if (!changed) {
    return state;
  }

  const consumed = new Set<ResourcePatchId>();
  const patchMemories: ResourcePatchMemory[] = [];

  for (const memory of base.patchMemories) {
    const updated = byPatch.get(memory.patchId);

    if (updated !== undefined && updated !== memory) {
      patchMemories.push(updated);
      consumed.add(memory.patchId);
    } else {
      patchMemories.push(memory);
      consumed.add(memory.patchId);
    }
  }

  for (const [patchId, memory] of byPatch) {
    if (!consumed.has(patchId)) {
      patchMemories.push(memory);
    }
  }

  return enforceResourceKnowledgeCap({ ...base, patchMemories }, Number(context.tick));
}

function formInferredMemory(
  existing: ResourcePatchMemory | undefined,
  patchId: ResourcePatchId,
  tileId: TileId,
  contribution: ResourceClassContribution,
  hasAnalogy: boolean,
  context: ResourceInferenceContext,
): ResourcePatchMemory {
  const availability = contribution.availability;
  const presence = round2(Math.min(INFERRED_PRESENCE_CAP, 0.2 + availability * 0.25 + (hasAnalogy ? INFERRED_ANALOGY_BOOST : 0)));
  const yieldConfidence = round2(Math.min(INFERRED_YIELD_CAP, availability * 0.2));
  const accessConfidence = round2(Math.min(0.3, availability * 0.2));

  return {
    patchId,
    resourceClassId: contribution.classId,
    approximateTile: tileId,
    linkedTiles: [],
    linkedAnchorId: context.anchorTileId,
    linkedCorridorId: undefined,
    state: "suspected",
    source: "inferred",
    confidence: {
      // Hard low caps — always weaker than direct observation (which starts ~0.45).
      presenceConfidence: presence,
      seasonConfidence: 0.05,
      yieldConfidence,
      safetyConfidence: 0.1,
      processingConfidence: 0,
      accessConfidence,
      recoveryConfidence: 0,
    },
    seasonality: {
      bestSeasons: [],
      badSeasons: [],
      lastConfirmedSeason: undefined,
      failedSeasonCount: 0,
    },
    useHistory: {
      visits: 0,
      successfulUses: 0,
      failedUses: 0,
      lastUsedTick: undefined,
      lastYieldEstimate: round2(contribution.supportContribution),
      yieldTrend: "unknown",
      depletionMemory: 0,
      recoveryExpectation: 0,
    },
    risk: {
      poisoningOrBadReaction: false,
      badWater: false,
      predatorOrAnimalRisk: round2(clamp01(contribution.riskPlaceholder * 0.5)),
      tabooOrAvoidanceFutureFlag: false,
    },
    transmission: {
      sourceBandId: undefined,
      inheritedFromParent: undefined,
      detailLoss: round2(clamp01(1 - presence)),
      practiceReinforced: 0,
    },
    firstNotedTick: existing?.firstNotedTick ?? context.tick,
    lastNotedTick: context.tick,
    reasonIds: [`reason:resource_knowledge:${patchId}:${Number(context.tick)}:inferred_${hasAnalogy ? "analogy" : "cue"}` as ReasonId],
  };
}

// ---------------------------------------------------------------------------
// Resource belief opportunity signal (checkpoint 2K.1F).
//
// Summarises, from the band's OWN capped resource knowledge, how strong a believed
// "there may be a better/needed resource somewhere I know of" pull is — used ONLY to
// nudge probe/scout pressure (never relocation/yield/stress). Uses effective decayed
// confidence; direct > inherited > inferred; stale/dormant weak; water/aquatic and
// fallback matter more under the band's own stress. Bounded (capped memories),
// deterministic, anti-omniscient. The resulting probePressure is hard-capped small.
//
// EMPIRICAL CALIBRATION CONSTANT (2K.1F; audited 2K.1F-A), not a historical law.
// 2K.1F-A probe-distribution audit found belief-driven probes cluster under stress
// (~0.99 stressed share), comfortable-band probing is near-zero, and the high-volume
// same-target/zero-gain probe loops in over-capacity/unused-lake are PRE-EXISTING
// water-probe behaviour (identical with this coupling disabled), not caused here.
// Tune only if a future audit proves a real calibration problem.
const BELIEF_PROBE_PRESSURE_CAP = 0.08;
const BELIEF_OPPORTUNITY_MIN = 0.1;

// 2K.3A-A risk-retention guard. Durable risk/caution memory
// (poisoning/bad-reaction, bad water, taboo/avoidance) deliberately raises a
// patch's RETENTION (resourcePatchRetentionScore.riskSalience) — a band does not
// forget a place that harmed it. Architect decision: that is allowed, but a
// remembered risky patch must NOT thereby read as an attractive resource
// OPPORTUNITY. Belief-opportunity scoring otherwise ignores risk, so a retained
// risky patch would keep contributing its full presence/yield pull. This factor
// strongly discounts the opportunity contribution of risk-flagged patches so the
// memory stays caution/debug, never a positive scout/probe attractor. It is NOT
// active avoidance behaviour (no relocation/routing); it only prevents risk from
// being treated as opportunity. Inert until a cause event flags a patch.
const CAUTION_OPPORTUNITY_DISCOUNT = 0.2;

export interface ResourceBeliefOpportunityContext {
  readonly currentTileId: TileId;
  readonly currentTick: number;
  readonly waterStress: NormalizedIntensity;
  readonly perCapitaReturn: NormalizedIntensity;
  readonly chronicDecline: boolean;
}

export interface ResourceBeliefOpportunity {
  readonly beliefOpportunityScore: NormalizedIntensity;
  // The small, hard-capped probe/scout nudge (never relocation).
  readonly probePressure: NormalizedIntensity;
  // The stress-driven subset of probePressure (water/return/decline amplified, and
  // only when a believable opportunity exists). Used to widen probe availability for
  // stressed bands only; ~0 for comfortable bands.
  readonly stressProbePressure: NormalizedIntensity;
  readonly bestBeliefTile?: TileId;
  readonly bestBeliefClass?: ResourceClassId;
  readonly bestBeliefSource?: ResourceKnowledgeSource;
  readonly bestBeliefConfidence: NormalizedIntensity;
  readonly directOpportunityScore: NormalizedIntensity;
  readonly inferredOpportunityScore: NormalizedIntensity;
  readonly inheritedOpportunityScore: NormalizedIntensity;
  readonly fallbackOpportunityScore: NormalizedIntensity;
  readonly waterOrAquaticOpportunityScore: NormalizedIntensity;
  readonly uncertaintyPenalty: NormalizedIntensity;
  readonly stalePenalty: NormalizedIntensity;
  readonly onlyInferred: boolean;
  readonly hasBelievableOpportunity: boolean;
  // Free-form reason suffixes for debug (consumed by the exhausted-range audit).
  readonly reasonSuffixes: readonly string[];
}

export const EMPTY_BELIEF_OPPORTUNITY: ResourceBeliefOpportunity = {
  beliefOpportunityScore: 0,
  probePressure: 0,
  stressProbePressure: 0,
  bestBeliefConfidence: 0,
  directOpportunityScore: 0,
  inferredOpportunityScore: 0,
  inheritedOpportunityScore: 0,
  fallbackOpportunityScore: 0,
  waterOrAquaticOpportunityScore: 0,
  uncertaintyPenalty: 0,
  stalePenalty: 0,
  onlyInferred: false,
  hasBelievableOpportunity: false,
  reasonSuffixes: [],
};

function beliefSourceWeight(source: ResourceKnowledgeSource): number {
  return source === "direct" ? 1 : source === "inherited" ? 0.6 : source === "inferred" ? 0.4 : 0.5;
}

export function deriveResourceBeliefOpportunity(
  state: ResourceKnowledgeState | undefined,
  context: ResourceBeliefOpportunityContext,
): ResourceBeliefOpportunity {
  if (state === undefined || state.patchMemories.length === 0) {
    return EMPTY_BELIEF_OPPORTUNITY;
  }

  let directOpportunityScore = 0;
  let inferredOpportunityScore = 0;
  let inheritedOpportunityScore = 0;
  let fallbackOpportunityScore = 0;
  let waterOrAquaticOpportunityScore = 0;
  let staleWeightedTotal = 0;
  let rawWeightedTotal = 0;
  let best = 0;
  let bestBeliefTile: TileId | undefined;
  let bestBeliefClass: ResourceClassId | undefined;
  let bestBeliefSource: ResourceKnowledgeSource | undefined;
  let bestBeliefConfidence = 0;

  for (const memory of state.patchMemories) {
    // Opportunity is elsewhere — the current tile is what the band is already on.
    if (memory.approximateTile === context.currentTileId) {
      continue;
    }

    const effective = effectiveResourceConfidence(memory, context.currentTick);
    const strength = Math.max(effective.effectivePresenceConfidence, effective.effectiveYieldConfidence);

    if (strength <= 0) {
      continue;
    }

    const staleWeight = effective.isDormant ? 0.2 : effective.isStale ? 0.6 : 1;
    const sourceWeight = beliefSourceWeight(memory.source);
    let classBoost = 0;

    if (memory.resourceClassId === "water_resource" || memory.resourceClassId === "aquatic_food") {
      classBoost += context.waterStress * 0.5;
    }

    if (memory.resourceClassId === "fallback_food") {
      classBoost += clamp01(1 - context.perCapitaReturn) * 0.4;
    }

    // 2K.3A-A guard: durable risk/caution memory may keep this patch RETAINED, but
    // it must not let the patch read as an attractive OPPORTUNITY. Discount the
    // opportunity contribution (not the retention score) for risk-flagged patches.
    const cautionDiscount = hasDurableRisk(memory) ? CAUTION_OPPORTUNITY_DISCOUNT : 1;
    const contribution = clamp01(strength * sourceWeight * staleWeight * (1 + classBoost) * cautionDiscount);
    rawWeightedTotal += strength * sourceWeight;
    staleWeightedTotal += strength * sourceWeight * staleWeight;

    if (memory.source === "direct") {
      directOpportunityScore = Math.max(directOpportunityScore, contribution);
    } else if (memory.source === "inferred") {
      inferredOpportunityScore = Math.max(inferredOpportunityScore, contribution);
    } else if (memory.source === "inherited") {
      inheritedOpportunityScore = Math.max(inheritedOpportunityScore, contribution);
    }

    if (memory.resourceClassId === "fallback_food") {
      fallbackOpportunityScore = Math.max(fallbackOpportunityScore, contribution);
    }

    if (memory.resourceClassId === "water_resource" || memory.resourceClassId === "aquatic_food") {
      waterOrAquaticOpportunityScore = Math.max(waterOrAquaticOpportunityScore, contribution);
    }

    if (contribution > best) {
      best = contribution;
      bestBeliefTile = memory.approximateTile;
      bestBeliefClass = memory.resourceClassId;
      bestBeliefSource = memory.source;
      bestBeliefConfidence = round2(strength);
    }
  }

  const beliefOpportunityScore = round2(best);
  const hasBelievableOpportunity = beliefOpportunityScore >= BELIEF_OPPORTUNITY_MIN;
  const onlyInferred = hasBelievableOpportunity
    && directOpportunityScore < BELIEF_OPPORTUNITY_MIN
    && inheritedOpportunityScore < BELIEF_OPPORTUNITY_MIN
    && inferredOpportunityScore >= BELIEF_OPPORTUNITY_MIN;

  // Probe nudge (hard-capped small): direct memories pull most, inferred least;
  // chronic decline and the band's own water/food stress amplify the relevant class.
  // The base "I know resources exist elsewhere" curiosity is split from the
  // stress-driven part so the two can be coupled differently (2K.1F): base curiosity
  // feeds the latent probe-candidate score, while only the stress-driven part widens
  // probe availability — so unstressed bands do not suddenly scout more.
  const baseProbe = directOpportunityScore * 0.12 + inheritedOpportunityScore * 0.08 + inferredOpportunityScore * 0.05;
  let stressProbe = 0;
  if (context.chronicDecline) {
    stressProbe += beliefOpportunityScore * 0.04;
  }
  stressProbe += waterOrAquaticOpportunityScore * context.waterStress * 0.06;
  stressProbe += fallbackOpportunityScore * clamp01(1 - context.perCapitaReturn) * 0.05;
  const probePressure = round2(Math.min(BELIEF_PROBE_PRESSURE_CAP, clamp01(baseProbe + stressProbe)));
  // Only the stress-amplified, belief-backed part — used to widen probe availability
  // for genuinely stressed bands that also believe in alternatives elsewhere.
  const stressProbePressure = round2(
    Math.min(BELIEF_PROBE_PRESSURE_CAP, hasBelievableOpportunity ? clamp01(stressProbe) : 0),
  );

  const reasonSuffixes: string[] = [];
  if (hasBelievableOpportunity) {
    reasonSuffixes.push("resource_belief_probe_pressure");
    if (directOpportunityScore >= BELIEF_OPPORTUNITY_MIN) reasonSuffixes.push("direct_resource_opportunity");
    if (onlyInferred) reasonSuffixes.push("inferred_resource_opportunity");
    if (waterOrAquaticOpportunityScore >= BELIEF_OPPORTUNITY_MIN && context.waterStress > 0.3) reasonSuffixes.push("water_resource_probe_pressure");
    if (fallbackOpportunityScore >= BELIEF_OPPORTUNITY_MIN && context.perCapitaReturn < 0.5) reasonSuffixes.push("fallback_resource_opportunity");
    if (context.chronicDecline) reasonSuffixes.push("chronic_decline_probe_pressure");
  }

  return {
    beliefOpportunityScore,
    probePressure,
    stressProbePressure,
    bestBeliefTile,
    bestBeliefClass,
    bestBeliefSource,
    bestBeliefConfidence,
    directOpportunityScore: round2(directOpportunityScore),
    inferredOpportunityScore: round2(inferredOpportunityScore),
    inheritedOpportunityScore: round2(inheritedOpportunityScore),
    fallbackOpportunityScore: round2(fallbackOpportunityScore),
    waterOrAquaticOpportunityScore: round2(waterOrAquaticOpportunityScore),
    uncertaintyPenalty: round2(clamp01(1 - bestBeliefConfidence)),
    stalePenalty: round2(clamp01(rawWeightedTotal <= 0 ? 0 : 1 - staleWeightedTotal / rawWeightedTotal)),
    onlyInferred,
    hasBelievableOpportunity,
    reasonSuffixes,
  };
}

function countState(
  memories: readonly ResourcePatchMemory[],
  state: ResourceKnowledgeStateKind,
): number {
  return memories.reduce((total, memory) => total + (memory.state === state ? 1 : 0), 0);
}

function countSource(
  memories: readonly ResourcePatchMemory[],
  source: ResourceKnowledgeSource,
): number {
  return memories.reduce((total, memory) => total + (memory.source === source ? 1 : 0), 0);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
