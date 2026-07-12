import type {
  Band,
  BandDispositionState,
  BandEncounterKind,
  BandEncounterOutcome,
  BandEncounterRecord,
  BandEncounterRelation,
  BandMoodKind,
  CarryingCapacityState,
  EncounterPerception,
  EncounterResponseDistribution,
  EncounterResponseKind,
  ExhaustedRangeAudit,
  ExhaustedRangeStatus,
  FrontierCorridorKind,
  FrontierDispersalPressure,
  KnownBandContactMemory,
  NearbyOpportunityGradient,
  RangeSaturationState,
  ReturnTrendDirection,
  ReturnTrendMemory,
  TemporarySeparationPressure,
} from "./types";
import { preserveTerminalBandSnapshots } from "./bandLifecycle";
import { getNearbyBandPressure } from "./crowding";
import { deriveCarryingCapacity } from "./carryingCapacity";
import { deriveCanonicalNutritionState, updateSeasonalSupportState } from "./seasonalSurvival";
import {
  deriveInnerFissionState,
  deriveSocialTensionReadabilityState,
} from "./innerFission";
import { applyBandReadabilityContext } from "./bandEvents";
import { applyProtoCampContext } from "./protoCamps";
import { applyProtoAccessContext } from "./accessNorms";
import { applyResourceEcologyContext } from "./resourceEcologyFoundation";
import { applyVisibleNatureContext } from "./visibleNature";
import { applyForagingLearningAdaptationContext } from "./foragingAdaptation";
import { applyBodyCampSurvivalLogisticsContext } from "./bodyCampLogistics";
import { applyRelationshipMemorySocialEcologyContext } from "./relationshipMemory";
// 2K.8 — second deliberate src/sim consumer of the patch-return/skill view (after the 2K.5
// resourceScout selection hook): the band-known learned-support term for the candidate-vs-current
// opportunity comparison. DECISION-SIDE ONLY — it feeds opportunity scoring, never realized
// carrying capacity / demography (the 2K.8 scope lock). The static-guard importer set is now {
// resourceScout.ts, socialContext.ts }.
import { deriveTileLearnedSupport } from "./patchExploitationKnowledge";
import {
  deriveResourceBeliefOpportunity,
  inferResourceKnowledge,
  updateResourceKnowledgeFromObservation,
  type ResourceBeliefOpportunity,
  type ResourceInferenceCandidate,
} from "./resourceKnowledge";
import { deriveBaseHabitatPotential } from "./habitatYield";
import { deriveResourceClassAvailability } from "./resourceClasses";
import {
  buildTickContextCache,
  getActiveBandsFromCache,
  getLocalBandCountFromCache,
  getLocalPopulationEstimateFromCache,
  getSalientMemorySummary,
  type TickContextCache,
} from "./contextCache";
import { getLocalUsePressureValue } from "./pressure";
import { advanceFrontierIntent } from "./frontierIntent";
import { advanceFrontierResidence } from "./frontierResidence";
import { advanceFrontierShorelineKnowledge } from "./frontierKnowledge";
import { advanceReportedKnowledge } from "./reportedKnowledge";
import { advanceRangeFriction } from "./rangeFriction";
import { advanceVisibleLandscapeCues } from "./landscapeVisibility";
import type { BandId, ReasonId, TickNumber, TileId } from "../core/types";
import { getTile } from "../world/generate";
import { getRiverCrossingForMovement } from "../world/hydrography";
import { isBandPassableDestination } from "../world/passability";
import type { Tile, WorldState } from "../world/types";

const LOCAL_RANGE_RADIUS = 4;
const TREND_WINDOW_SHORT = 4;
const TREND_WINDOW_LONG = 8;

export type SocialContextPerfPhase =
  | "rangeSaturationState"
  | "carryingCapacity"
  | "returnTrend"
  | "seasonalSupport"
  | "exhaustedRangeAudit"
  | "resourceObservation"
  | "resourceInferenceCandidates"
  | "resourceInference"
  | "landscapeVisibility"
  | "frontierDispersal"
  | "frontierCandidateSearch"
  | "nearbyOpportunity"
  | "frontierIntent"
  | "frontierResidence"
  | "frontierKnowledge"
  | "foragingAdaptation"
  | "bodyCampLogistics"
  | "relationshipMemory";

export interface SocialContextProfiler {
  readonly measure: <TResult>(
    phase: SocialContextPerfPhase,
    operation: () => TResult,
  ) => TResult;
  readonly count?: (name: string, amount?: number) => void;
}

function measureContext<TResult>(
  profiler: SocialContextProfiler | undefined,
  phase: SocialContextPerfPhase,
  operation: () => TResult,
): TResult {
  return profiler === undefined ? operation() : profiler.measure(phase, operation);
}

function countContext(
  profiler: SocialContextProfiler | undefined,
  name: string,
  amount = 1,
): void {
  profiler?.count?.(name, amount);
}

export function updateBandContextStates(
  world: WorldState,
  cache = buildTickContextCache(world),
): WorldState {
  const updated = applyBandReadabilityContext(applyRelationshipMemorySocialEcologyContext(applyBodyCampSurvivalLogisticsContext(applyForagingLearningAdaptationContext(applyProtoAccessContext(applyVisibleNatureContext(applyResourceEcologyContext(applyProtoCampContext(applyInnerFissionSocialReadabilityContext(
    advanceRangeFriction(
      advanceReportedKnowledge(
        applyEncounterContext(
          applyDispositionContext(
            applyFrontierOpportunityContext(
              applyRangeSaturationContext(world, cache),
              cache,
            ),
            cache,
          ),
          cache,
        ),
        cache,
      ),
      cache,
    ),
    cache,
  )))))))));
  return preserveTerminalBandSnapshots(world, updated);
}

export function applyRangeSaturationContext(
  world: WorldState,
  cache: TickContextCache,
  profiler?: SocialContextProfiler,
): WorldState {
  const baseBands = getActiveBandsFromCache(world, cache)
    .reduce<Record<string, Band>>((bandsById, band) => {
      const baseRangeSaturation = measureContext(
        profiler,
        "rangeSaturationState",
        () => deriveRangeSaturationState(world, band, cache),
      );
      // Carrying capacity v0 (2J): per-capita return, range-saturation v1 fields,
      // known-unused-habitat, and daughter colonization — derived once per band
      // per tick here, reusing the salient-memory cache (bounded, anti-omniscient).
      const carrying = measureContext(profiler, "carryingCapacity", () => deriveCarryingCapacity(world, band, cache, {
        localUsePressure: baseRangeSaturation.localUsePressure,
        nearbyCrowding: baseRangeSaturation.nearbyCrowding,
        localPopulationEstimate: baseRangeSaturation.localPopulationEstimate,
        riskPenalty: band.pressureState?.riskPressure ?? 0.3,
      }));
      const rangeSaturation = carrying === undefined
        ? baseRangeSaturation
        : {
            ...baseRangeSaturation,
            perCapitaReturnEstimate: carrying.state.perCapitaReturn.perCapitaReturn,
            localPopulationDemand: carrying.rangeV1.localPopulationDemand,
            localLaborCapacity: carrying.rangeV1.localLaborCapacity,
            totalEffectiveYieldWithinRange: carrying.rangeV1.totalEffectiveYieldWithinRange,
            saturation: carrying.rangeV1.saturation,
            densityPhase: carrying.rangeV1.densityPhase,
            recoveryBuffer: carrying.rangeV1.recoveryBuffer,
            highRankPersistence: carrying.rangeV1.highRankPersistence,
          };
      cache.rangeSaturationByBandId.set(band.id, rangeSaturation);

      // Return-trend memory (2J.1): bounded rolling per-capita/support history,
      // updated once per tick (tick-gated so the 3 context passes converge to one
      // final value). Then the exhausted-range audit explains why a stressed band
      // stays / probes / disperses / fails to find a path out of its known range.
      const returnTrend = measureContext(
        profiler,
        "returnTrend",
        () => updateReturnTrend(band.returnTrend, carrying?.state, band.id, world.time.tick),
      );
      const seasonalSupport = measureContext(
        profiler,
        "seasonalSupport",
        () => updateSeasonalSupportState(band.seasonalSupport, carrying?.state, band, world.time),
      );
      const exhaustedRangeAudit = measureContext(
        profiler,
        "exhaustedRangeAudit",
        () => deriveExhaustedRangeAudit(world, band, carrying?.state, returnTrend),
      );
      // Resource belief formation (2K.1B): the band remembers its CURRENT tile's
      // own observed resource-class decomposition. Tick-idempotent across the three
      // passes (converges to the end-of-tick observation); behaviour-neutral.
      const observedKnowledge = measureContext(profiler, "resourceObservation", () => updateResourceKnowledgeFromObservation(
        band.resourceKnowledgeState,
        carrying?.state.resourceClassSummary,
        {
          tileId: band.position,
          tick: world.time.tick,
          season: world.time.season,
          waterStress: band.pressureState?.waterStress ?? 0,
          perCapitaReturn: carrying?.state.perCapitaReturn.perCapitaReturn ?? 0.5,
          anchorTileId: band.residentialAnchor?.anchorTileId,
        },
      ));
      // Low-confidence inference (2K.1E): suspect resource classes at known-but-
      // unforaged candidate places, from each candidate's own band-known record +
      // analogy to the band's direct experience. Runs after observation so it never
      // re-infers the just-observed current tile. Behaviour-neutral.
      const resourceInferenceCandidates = measureContext(
        profiler,
        "resourceInferenceCandidates",
        () => collectResourceInferenceCandidates(world, band, cache),
      );
      profiler?.count?.("resourceInferenceCandidates", resourceInferenceCandidates.length);
      const resourceKnowledgeState = measureContext(profiler, "resourceInference", () => inferResourceKnowledge(
        observedKnowledge ?? band.resourceKnowledgeState,
        resourceInferenceCandidates,
        {
          tick: world.time.tick,
          season: world.time.season,
          anchorTileId: band.residentialAnchor?.anchorTileId,
        },
      ));
      const visibleLandscapeCues = measureContext(
        profiler,
        "landscapeVisibility",
        () => advanceVisibleLandscapeCues(world, {
          ...band,
          ecologicalStressCauses: carrying?.state.ecologicalStressCauses ?? band.ecologicalStressCauses,
        }),
      );

      bandsById[band.id] = {
        ...band,
        rangeSaturation,
        carryingCapacity: carrying === undefined
          ? band.carryingCapacity
          : { ...carrying.state, returnTrend, exhaustedRangeAudit },
        perCapitaReturn: carrying?.state.perCapitaReturn ?? band.perCapitaReturn,
        populationDemand: carrying?.state.populationDemand ?? band.populationDemand,
        daughterColonization: carrying?.state.daughterColonization ?? band.daughterColonization,
        nomadicScalePressure: carrying?.state.nomadicScalePressure ?? band.nomadicScalePressure,
        ecologicalStressCauses: carrying?.state.ecologicalStressCauses ?? band.ecologicalStressCauses,
        visibleLandscapeCues,
        returnTrend: returnTrend ?? band.returnTrend,
        seasonalSupport: seasonalSupport ?? band.seasonalSupport,
        // Compatibility mirror only; all readers of current nourishment use
        // seasonalSupport directly. This prevents the legacy spawn value from
        // remaining a contradictory second hunger state in snapshots.
        hungerPressure: deriveCanonicalNutritionState(seasonalSupport ?? band.seasonalSupport).foodMovementPressure,
        exhaustedRangeAudit: exhaustedRangeAudit ?? band.exhaustedRangeAudit,
        resourceKnowledgeState: resourceKnowledgeState ?? band.resourceKnowledgeState,
      };

      return bandsById;
    }, getInactiveBandsById(world));

  return {
    ...world,
    bands: baseBands as Readonly<Record<BandId, Band>>,
  };
}

// Bounded, anti-omniscient inference candidates: a few KNOWN, non-current
// opportunity tiles, each decomposed into resource classes from the band's OWN
// observed record (memoized). No full-map scan, no hidden truth. 2K.1E.
const MAX_INFERENCE_CANDIDATE_TILES = 8;

function collectResourceInferenceCandidates(
  world: WorldState,
  band: Band,
  cache: TickContextCache,
): readonly ResourceInferenceCandidate[] {
  const candidateIds = getSalientMemorySummary(cache, band.id)?.knownOpportunityCandidateIds ?? [];
  const candidates: ResourceInferenceCandidate[] = [];

  for (const tileId of candidateIds) {
    if (candidates.length >= MAX_INFERENCE_CANDIDATE_TILES) {
      break;
    }

    if (tileId === band.position) {
      continue; // the current tile is directly observed, not inferred
    }

    const record = band.knowledge.observedTiles[tileId];

    if (record === undefined) {
      continue;
    }

    const base = deriveBaseHabitatPotential(tileId, record, world.time);
    candidates.push({ tileId, summary: deriveResourceClassAvailability(base, record, world.time) });
  }

  return candidates;
}

export function applyFrontierOpportunityContext(
  world: WorldState,
  cache: TickContextCache,
  profiler?: SocialContextProfiler,
): WorldState {
  const baseBands = getActiveBandsFromCache(world, cache)
    .reduce<Record<string, Band>>((bandsById, band) => {
      const rangeSaturation =
        cache.rangeSaturationByBandId.get(band.id) ??
        band.rangeSaturation ??
        deriveRangeSaturationState(world, band, cache);
      const frontierDispersal = measureContext(
        profiler,
        "frontierDispersal",
        () => deriveFrontierDispersalPressure(world, band, rangeSaturation, cache, profiler),
      );
      const nearbyOpportunity = measureContext(
        profiler,
        "nearbyOpportunity",
        () => deriveNearbyOpportunityGradient(world, band, cache, profiler),
      );
      cache.knownOpportunityByBandId.set(band.id, nearbyOpportunity);

      // FrontierIntent v0 (M0.3): persistent, decaying, tick-gated. Advance it from
      // the freshly-derived frontierDispersal/nearbyOpportunity (+ this band's range
      // saturation / return trend / probe memory), all band-known. Tick-gating makes
      // the multiple per-tick context passes converge to one advance per season.
      const bandWithFrontierContext: Band = { ...band, frontierDispersal, nearbyOpportunity, rangeSaturation };
      const frontierIntent = measureContext(
        profiler,
        "frontierIntent",
        () => advanceFrontierIntent(world, bandWithFrontierContext),
      );

      // FrontierResidence v0 (M0.4): emergent, band-known retention earned by a
      // frontier daughter dwelling at a reached locus. Advanced AFTER the intent
      // (it reads the fresh intent to recognise an outward heading), from the same
      // freshly-derived band-known context. Tick-gated like the intent.
      const frontierResidence = measureContext(profiler, "frontierResidence", () => advanceFrontierResidence(world, {
        ...bandWithFrontierContext,
        frontierIntent,
      }));

      // FrontierKnowledge v0 (M0.6): bounded, anti-omniscient shoreline knowledge
      // FORMATION. A band with sustained presence on a water boundary infers the next
      // reachable shore LAND tiles (existence only, never richness), one ring per
      // season, so a reachable far shore can BECOME band-known. M0.7 can use that
      // existence-only knowledge only for a residence-unchanged observation probe.
      const frontierKnowledge = measureContext(profiler, "frontierKnowledge", () => advanceFrontierShorelineKnowledge(world, {
        ...bandWithFrontierContext,
        frontierIntent,
        frontierResidence,
      }));

      bandsById[band.id] = {
        ...band,
        frontierDispersal,
        frontierIntent,
        frontierResidence,
        frontierKnowledge,
        nearbyOpportunity,
      };

      return bandsById;
    }, getInactiveBandsById(world));

  return {
    ...world,
    bands: baseBands as Readonly<Record<BandId, Band>>,
  };
}

export function applyDispositionContext(
  world: WorldState,
  cache: TickContextCache,
): WorldState {
  const baseBands = getActiveBandsFromCache(world, cache)
    .reduce<Record<string, Band>>((bandsById, band) => {
      const disposition = deriveBandDispositionState(world, band, undefined);

      bandsById[band.id] = {
        ...band,
        disposition,
      };

      return bandsById;
    }, getInactiveBandsById(world));

  return {
    ...world,
    bands: baseBands as Readonly<Record<BandId, Band>>,
  };
}

export function applyInnerFissionSocialReadabilityContext(
  world: WorldState,
  cache: TickContextCache,
): WorldState {
  const baseBands = getActiveBandsFromCache(world, cache)
    .reduce<Record<string, Band>>((bandsById, band) => {
      bandsById[band.id] = {
        ...band,
        innerFission: deriveInnerFissionState(world, band),
        socialTension: deriveSocialTensionReadabilityState(world, band),
      };

      return bandsById;
    }, getInactiveBandsById(world));

  return {
    ...world,
    bands: baseBands as Readonly<Record<BandId, Band>>,
  };
}

function deriveRangeSaturationState(
  world: WorldState,
  band: Band,
  cache: TickContextCache,
): RangeSaturationState {
  const tile = getTile(world, band.position);
  const knownRecord = band.knowledge.observedTiles[band.position];
  const nearby = getNearbyBandPressure(world, band, band.position, cache);
  const localUsePressure = getLocalUsePressureValue(band.usePressure[band.position]);
  const localPopulationEstimate = getLocalPopulationEstimateFromCache(world, cache, band.position, LOCAL_RANGE_RADIUS);
  const localBandCount = getLocalBandCountFromCache(world, cache, band.position, LOCAL_RANGE_RADIUS);
  const habitatSuitability = tile === undefined
    ? 0.32
    : getKnownHabitatSuitability(tile, knownRecord);
  const carryingBuffer = tile === undefined ? 0.44 : getHabitatCrowdingBuffer(tile);
  const populationPressure = clamp01(localPopulationEstimate / (52 + carryingBuffer * 72));
  const seasonalStress = clamp01(
    (band.pressureState?.foodStress ?? 0.2) * 0.22 +
      (band.pressureState?.waterStress ?? 0.2) * 0.18 +
      (band.pressureState?.riskPressure ?? 0.2) * 0.12,
  );
  const saturationPressure = clamp01(
    localUsePressure * 0.32 +
      nearby.weightedCrowding * 0.34 +
      populationPressure * 0.28 +
      seasonalStress -
      carryingBuffer * 0.18,
  );
  const effectiveHabitatSuitability = clamp01(
    habitatSuitability - saturationPressure * 0.36 - nearby.weightedCrowding * 0.12,
  );
  const perCapitaReturnEstimate = clamp01(
    effectiveHabitatSuitability * (1 - populationPressure * 0.42) - localUsePressure * 0.14,
  );
  const reasonIds = saturationPressure > 0.24
    ? [makeContextReasonId(world, band.id, "range_saturation_detected", band.position)]
    : [];

  return {
    bandId: band.id,
    focalTileId: band.position,
    localBandCount,
    localPopulationEstimate: round2(localPopulationEstimate),
    localUsePressure: round2(localUsePressure),
    nearbyCrowding: nearby.weightedCrowding,
    effectiveHabitatSuitability: round2(effectiveHabitatSuitability),
    perCapitaReturnEstimate: round2(perCapitaReturnEstimate),
    saturationPressure: round2(saturationPressure),
    confidence: round2(knownRecord?.confidence ?? 0.44),
    reasonIds,
  };
}

// Bounded rolling return-trend memory (2J.1). Tick-gated so the multiple context
// passes per tick converge to a single deterministic sample. Distinguishes a one
// bad season dip from a chronic, sustained decline.
function updateReturnTrend(
  previous: ReturnTrendMemory | undefined,
  carrying: CarryingCapacityState | undefined,
  bandId: BandId,
  tick: TickNumber,
): ReturnTrendMemory | undefined {
  if (carrying === undefined) {
    return previous;
  }

  const currentRatio = round2(clamp01(carrying.perCapitaReturn.supportDebug.clampedSupportRatio));
  const currentReturn = round2(clamp01(carrying.perCapitaReturn.perCapitaReturn));
  const sameTick = previous !== undefined && Number(previous.lastUpdatedTick) === Number(tick);
  const priorRatios = previous?.recentSupportRatios ?? [];
  const priorReturns = previous?.recentPerCapitaReturns ?? [];
  const baseRatios = sameTick ? priorRatios.slice(0, -1) : priorRatios;
  const baseReturns = sameTick ? priorReturns.slice(0, -1) : priorReturns;
  const recentSupportRatios = [...baseRatios, currentRatio].slice(-TREND_WINDOW_LONG);
  const recentPerCapitaReturns = [...baseReturns, currentReturn].slice(-TREND_WINDOW_LONG);

  const sampleCount = recentPerCapitaReturns.length;
  const mean4 = mean(recentPerCapitaReturns.slice(-TREND_WINDOW_SHORT));
  const mean8 = mean(recentPerCapitaReturns);
  const shortLongDelta = round2(mean4 - mean8);
  const latest = recentPerCapitaReturns[recentPerCapitaReturns.length - 1] ?? currentReturn;
  const trendDirection: ReturnTrendDirection =
    shortLongDelta > 0.04 ? "rising" : shortLongDelta < -0.04 ? "declining" : "flat";
  const chronicDecline = sampleCount >= 4 && shortLongDelta <= -0.05 && mean4 < 0.45;
  const oneBadSeason = !chronicDecline && sampleCount >= 3 && latest < mean8 - 0.12;

  const reasonIds: ReasonId[] = [];

  if (chronicDecline) {
    reasonIds.push(makeTrendReasonId(bandId, tick, "chronic_return_decline"));
  } else if (trendDirection === "rising") {
    reasonIds.push(makeTrendReasonId(bandId, tick, "return_trend_rising"));
  } else if (oneBadSeason) {
    reasonIds.push(makeTrendReasonId(bandId, tick, "one_bad_season_not_chronic"));
  }

  return {
    bandId,
    lastUpdatedTick: tick,
    recentSupportRatios,
    recentPerCapitaReturns,
    mean4: round2(mean4),
    mean8: round2(mean8),
    shortLongDelta,
    trendDirection,
    chronicDecline,
    oneBadSeason,
    sampleCount,
    reasonIds,
  };
}

// Explains WHY a band stays / probes / disperses / fails to leave a locally
// exhausted known range (2J.1). Never forces movement — it makes the outcome
// legible by combining stress, return trend, known opportunity, route confidence,
// attachment/refuge hold, daughter pressure, and the latest anchor-vs-action trace.
function deriveExhaustedRangeAudit(
  world: WorldState,
  band: Band,
  carrying: CarryingCapacityState | undefined,
  trend: ReturnTrendMemory | undefined,
): ExhaustedRangeAudit | undefined {
  if (carrying === undefined) {
    return undefined;
  }

  const pressure = band.pressureState;
  const stressLevel = clamp01(
    Math.max(
      pressure?.foodStress ?? 0,
      pressure?.waterStress ?? 0,
      (pressure?.riskPressure ?? 0) * 0.8,
      band.rangeSaturation?.saturationPressure ?? 0,
    ),
  );
  const returnTrendDirection = trend?.trendDirection ?? "flat";
  const chronicReturnDecline = trend?.chronicDecline ?? false;
  // Belief-aware opportunity (2K.1F): the band's own resource-belief pull. Debug
  // only here — it explains "probe vs stay vs relocate", it does not force movement.
  const beliefOpportunity = deriveResourceBeliefOpportunity(band.resourceKnowledgeState, {
    currentTileId: band.position,
    currentTick: Number(world.time.tick),
    waterStress: pressure?.waterStress ?? 0,
    perCapitaReturn: carrying.perCapitaReturn.perCapitaReturn,
    chronicDecline: chronicReturnDecline,
  });

  const opp = carrying.knownUnusedHabitat;
  const nearbyOpp = band.nearbyOpportunity;
  const knownUnusedOpportunity = clamp01(
    Math.max(
      opp === undefined ? 0 : opp.expectedPerCapitaReturn * (opp.consideredAsTarget ? 1 : 0.4),
      nearbyOpp?.opportunityStrength ?? 0,
    ),
  );
  const hasViableKnownTarget =
    (opp?.consideredAsTarget ?? false) ||
    (nearbyOpp?.bestKnownOpportunityTileId !== undefined && nearbyOpp.opportunityStrength > 0.12);
  const routeConfidence = clamp01(Math.max(nearbyOpp?.passabilityConfidence ?? 0, bestCorridorConfidence(band)));
  const attachmentHold = clamp01(
    Math.max(band.placeMemory[band.position]?.attachment ?? 0, pressure?.placeAttachmentPull ?? 0),
  );
  const waterRefugeHold = clamp01(
    band.residentialAnchor?.anchorWaterSecurity ?? band.dryMarginContext?.currentWaterRefuge?.reliability ?? 0,
  );
  const daughterPressureWithoutTarget = carrying.daughterColonization.pressure > 0.4 && !hasViableKnownTarget;
  const anchorOverrodeByMovement = band.anchorActionTrace?.overrodeAnchor ?? false;
  // A band can be crowded yet well-provisioned (rich delta in surplus). "Exhausted"
  // requires an actual return shortfall, not just crowding — use the real deficit so
  // a thriving-but-crowded core is not mislabelled as trapped.
  const inDeficit = carrying.perCapitaReturn.supportDebug.deficitRatio > 0.1;

  const status = getExhaustedRangeStatus({
    stressLevel,
    chronicReturnDecline,
    inDeficit,
    hasViableKnownTarget,
    recommendedAction: carrying.daughterColonization.recommendedAction,
    attachmentHold,
    waterRefugeHold,
  });
  // "Probe before relocating": a believable opportunity exists, but a strong hold
  // (water refuge / attachment) or low confidence (inferred-only) suppresses
  // residential movement while still inviting scouting.
  const probeSuggestedBeforeRelocation =
    beliefOpportunity.hasBelievableOpportunity &&
    (waterRefugeHold > 0.5 || attachmentHold > 0.5 || beliefOpportunity.onlyInferred || beliefOpportunity.bestBeliefConfidence < 0.5);

  const reasonIds = makeExhaustedRangeReasonIds(world, band, {
    status,
    chronicReturnDecline,
    hasViableKnownTarget,
    stressLevel,
    daughterPressureWithoutTarget,
    anchorOverrodeByMovement,
    beliefOpportunity,
    probeSuggestedBeforeRelocation,
  });

  return {
    bandId: band.id,
    status,
    stressLevel: round2(stressLevel),
    returnTrendDirection,
    chronicReturnDecline,
    knownUnusedOpportunity: round2(knownUnusedOpportunity),
    hasViableKnownTarget,
    routeConfidence: round2(routeConfidence),
    attachmentHold: round2(attachmentHold),
    waterRefugeHold: round2(waterRefugeHold),
    daughterPressureWithoutTarget,
    anchorOverrodeByMovement,
    beliefOpportunityScore: beliefOpportunity.beliefOpportunityScore,
    onlyInferredOpportunity: beliefOpportunity.onlyInferred,
    probeSuggestedBeforeRelocation,
    reasonIds,
  };
}

function getExhaustedRangeStatus(input: {
  readonly stressLevel: number;
  readonly chronicReturnDecline: boolean;
  readonly inDeficit: boolean;
  readonly hasViableKnownTarget: boolean;
  readonly recommendedAction: CarryingCapacityState["daughterColonization"]["recommendedAction"];
  readonly attachmentHold: number;
  readonly waterRefugeHold: number;
}): ExhaustedRangeStatus {
  // Thriving (a surplus, no chronic decline) is comfortable even when crowded.
  if (!input.chronicReturnDecline && !input.inDeficit) {
    return "comfortable";
  }

  const underReturnPressure = input.chronicReturnDecline || input.inDeficit;

  // Actively leaving toward a known target.
  if (
    input.hasViableKnownTarget &&
    (input.recommendedAction === "seek_new_range" || input.recommendedAction === "fission_toward_opportunity")
  ) {
    return "dispersing";
  }

  // Staying despite a real shortfall, explained by a strong local hold.
  if (underReturnPressure && input.waterRefugeHold > 0.5) {
    return "held_by_water_refuge";
  }

  if (underReturnPressure && input.attachmentHold > 0.5) {
    return "held_by_attachment";
  }

  // Knows somewhere better and is probing toward it.
  if (input.hasViableKnownTarget) {
    return "probing_alternative";
  }

  // Under a real shortfall with nowhere known to go.
  if (underReturnPressure && input.stressLevel > 0.5) {
    return "trapped_no_known_alternative";
  }

  return "marginal_holding";
}

function makeExhaustedRangeReasonIds(
  world: WorldState,
  band: Band,
  input: {
    readonly status: ExhaustedRangeStatus;
    readonly chronicReturnDecline: boolean;
    readonly hasViableKnownTarget: boolean;
    readonly stressLevel: number;
    readonly daughterPressureWithoutTarget: boolean;
    readonly anchorOverrodeByMovement: boolean;
    readonly beliefOpportunity: ResourceBeliefOpportunity;
    readonly probeSuggestedBeforeRelocation: boolean;
  },
): readonly ReasonId[] {
  const ids = new Set<ReasonId>();
  const mk = (suffix: string): ReasonId => makeTrendReasonId(band.id, world.time.tick, suffix);

  if (input.chronicReturnDecline) {
    ids.add(mk("chronic_return_decline"));
  }

  // Belief-aware probe/relocation reasons (2K.1F).
  for (const suffix of input.beliefOpportunity.reasonSuffixes) {
    ids.add(mk(suffix));
  }

  if (input.beliefOpportunity.hasBelievableOpportunity) {
    ids.add(mk("known_resource_belief_opportunity"));

    if (input.beliefOpportunity.onlyInferred) {
      ids.add(mk("only_inferred_resource_opportunity"));
    }

    if (input.probeSuggestedBeforeRelocation) {
      ids.add(mk("probe_suggested_before_relocation"));
      ids.add(mk("attachment_or_refuge_suppresses_relocation_not_scouting"));
    }
  } else if (input.stressLevel > 0.5) {
    ids.add(mk("no_believable_resource_alternative"));
  }

  if (input.status === "trapped_no_known_alternative") {
    ids.add(mk("exhausted_known_range"));
    ids.add(mk("no_known_safe_alternative"));
  } else if (!input.hasViableKnownTarget && input.stressLevel > 0.5) {
    ids.add(mk("no_known_safe_alternative"));
  }

  if (input.status === "held_by_attachment") {
    ids.add(mk("attachment_overrides_low_return"));
  }

  if (input.status === "held_by_water_refuge") {
    ids.add(mk("water_refuge_overrides_low_return"));
  }

  if (input.daughterPressureWithoutTarget) {
    ids.add(mk("no_known_safe_alternative"));
  }

  if (input.anchorOverrodeByMovement) {
    ids.add(mk("movement_overrode_anchor_recommendation"));
  }

  return [...ids];
}

function bestCorridorConfidence(band: Band): number {
  let best = 0;

  for (const corridor of Object.values(band.travelCorridors)) {
    if (corridor.confidence > best) {
      best = corridor.confidence;
    }
  }

  return best;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function makeTrendReasonId(bandId: BandId, tick: TickNumber, suffix: string): ReasonId {
  return `reason:${bandId}:${tick}:carrying:${suffix}` as ReasonId;
}

function deriveFrontierDispersalPressure(
  world: WorldState,
  band: Band,
  rangeSaturation: RangeSaturationState,
  cache: TickContextCache,
  profiler?: SocialContextProfiler,
): FrontierDispersalPressure {
  const candidates = measureContext(
    profiler,
    "frontierCandidateSearch",
    () => getFrontierCandidates(world, band, cache, profiler),
  );
  const best = candidates[0];
  const parentOverlap = band.pressureState?.parentCoreOverlap ?? 0;
  const daughterBoost = band.parentBandId === undefined ? 0 : 0.18;
  const safeCorridorBoost = best === undefined ? 0 : best.score * 0.2;
  const stressPenalty = clamp01(
    (band.pressureState?.riskPressure ?? 0) * 0.12 +
      (band.demography.population < 24 ? 0.14 : 0),
  );
  const pressure = clamp01(
    daughterBoost +
      rangeSaturation.saturationPressure * 0.34 +
      parentOverlap * 0.28 +
      (band.pressureState?.nearbyBandPressure ?? 0) * 0.16 +
      safeCorridorBoost -
      stressPenalty,
  );
  const reasonIds = pressure > 0.2
    ? [makeContextReasonId(world, band.id, "frontier_dispersal_pressure", best?.tileId ?? band.position)]
    : [];

  return {
    bandId: band.id,
    pressure: round2(pressure),
    preferredCorridor: best?.corridorKind ?? "unknown",
    frontierCandidateTileIds: candidates.slice(0, 8).map((candidate) => candidate.tileId),
    bestFrontierTileId: best?.tileId,
    reasonIds,
  };
}

// 2K.8 learned-support coupling bounds (decision-side only). The weight keeps the term at the
// 2K.7 delta scale (≤ ±0.12) — deliberately modest so learned skill can tilt a near-comparison
// but never manufacture migration; do NOT raise it to force HEAT multi-region founding. The gate
// makes the term INERT until the band's current marginal return falls below the threshold, so a
// comfortable rich-corridor band is never made stickier (and default comfortable maps stay
// byte-identical).
const LEARNED_SUPPORT_WEIGHT = 1;
const LEARNED_SUPPORT_GATE_RETURN = 0.6;

// Exported for the 2K.8 targeted anti-sticky check (deterministic; pure given band+cache).
export function deriveNearbyOpportunityGradient(
  world: WorldState,
  band: Band,
  cache: TickContextCache,
  profiler?: SocialContextProfiler,
): NearbyOpportunityGradient {
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];
  const currentSuitability = currentTile === undefined
    ? 0
    : getKnownHabitatSuitability(currentTile, currentRecord);
  const candidateTileIds =
    getSalientMemorySummary(cache, band.id)?.knownOpportunityCandidateIds ??
    (Object.keys(band.knowledge.observedTiles) as TileId[]);

  // 2K.8 — band-known learned-support coupling (DECISION-SIDE ONLY). The term is INERT (the
  // gradient is byte-identical to pre-2K.8) unless the band BOTH holds learned skill AND is under
  // low current marginal return — so a comfortable, rich-corridor band is never made stickier, and
  // the term only matters under exactly the crowding/depletion/competition the addendum names. It
  // is applied symmetrically (candidate learned support ADDED, current SUBTRACTED), and it can
  // only attach to a tile where the band has an OBSERVED, skill-matched patch memory — inferred-
  // only side tiles (no patch memory) get nothing. It feeds opportunity scoring, NEVER realized CC.
  const perCapitaReturn =
    band.carryingCapacity?.perCapitaReturn?.perCapitaReturn ??
    band.perCapitaReturn?.perCapitaReturn ??
    0.9;
  const learnedSupportGate =
    band.exploitationSkill === undefined || perCapitaReturn >= LEARNED_SUPPORT_GATE_RETURN
      ? 0
      : clamp01((LEARNED_SUPPORT_GATE_RETURN - perCapitaReturn) / LEARNED_SUPPORT_GATE_RETURN);
  const learnedSupportInput =
    learnedSupportGate === 0
      ? undefined
      : {
          currentTick: world.time.tick,
          recentPlantUseTests: band.recentPlantUseTests,
          recentCauseSpecificEvents: band.recentCauseSpecificEvents,
          exploitationSkill: band.exploitationSkill,
        };
  const patchMemories = band.resourceKnowledgeState?.patchMemories ?? [];
  const tileLearnedSupport = (tileId: TileId): number =>
    learnedSupportInput === undefined
      ? 0
      : LEARNED_SUPPORT_WEIGHT *
        learnedSupportGate *
        deriveTileLearnedSupport(tileId, patchMemories, learnedSupportInput).support;
  const currentLearnedSupport = tileLearnedSupport(band.position);

  let best:
    | {
        readonly tileId: TileId;
        readonly score: number;
        readonly confidence: number;
        readonly riskPenalty: number;
        readonly crowdingPenalty: number;
        readonly biomePenalty: number;
        readonly learnedSupport: number;
      }
    | undefined;
  let knownCandidateCount = 0;
  let candidatesWithLearnedSupport = 0;
  countContext(profiler, "nearbyOpportunityCandidatesConsidered", candidateTileIds.length);

  for (const tileId of candidateTileIds) {
    const record = band.knowledge.observedTiles[tileId];

    if (record === undefined) {
      countContext(profiler, "nearbyOpportunityRejectedMissing");
      continue;
    }

    const tile = getTile(world, record.tileId);

    if (
      tile === undefined ||
      currentTile === undefined ||
      record.tileId === band.position ||
      !isBandPassableDestination(tile)
    ) {
      countContext(profiler, "nearbyOpportunityRejectedPassability");
      continue;
    }

    const distance = getGridDistance(currentTile, tile);

    if (distance > 8) {
      countContext(profiler, "nearbyOpportunityRejectedDistance");
      continue;
    }

    if (!isKnownReachable(world, band, currentTile.id, tile.id)) {
      countContext(profiler, "nearbyOpportunityRejectedReachability");
      continue;
    }

    const crowding = getNearbyBandPressure(world, band, tile.id, cache);
    const riskPenalty = clamp01(record.observedRisk ?? 0.35);
    const crowdingPenalty = crowding.weightedCrowding;
    const biomePenalty = band.biomeAdaptation.mismatchStress * 0.42;
    const suitability = getKnownHabitatSuitability(tile, record);
    // 2K.8: candidate learned support ADDED, current learned support SUBTRACTED (symmetric) —
    // so a skill-matched NON-current patch becomes relatively more viable; both 0 when inert.
    const candidateLearnedSupport = tileLearnedSupport(tile.id);
    const opportunityStrength = clamp01(
      suitability + candidateLearnedSupport -
        currentSuitability - currentLearnedSupport -
        riskPenalty * 0.14 -
        crowdingPenalty * 0.18 -
        biomePenalty * 0.12 -
        distance * 0.018,
    );

    if (opportunityStrength <= 0.08) {
      countContext(profiler, "nearbyOpportunityRejectedLowScore");
      continue;
    }

    const candidate = {
      tileId: tile.id,
      score: opportunityStrength,
      confidence: record.confidence,
      riskPenalty,
      crowdingPenalty,
      biomePenalty,
      learnedSupport: candidateLearnedSupport,
    };
    knownCandidateCount += 1;
    if (candidate.learnedSupport !== 0) {
      candidatesWithLearnedSupport += 1;
    }
    if (
      best === undefined ||
      candidate.score > best.score ||
      (candidate.score === best.score && String(candidate.tileId).localeCompare(String(best.tileId)) < 0)
    ) {
      best = candidate;
    }
  }
  countContext(profiler, "nearbyOpportunityCandidatesAccepted", knownCandidateCount);

  return {
    bandId: band.id,
    currentTileId: band.position,
    bestKnownOpportunityTileId: best?.tileId,
    knownCandidateCount,
    opportunityStrength: round2(best?.score ?? 0),
    opportunityConfidence: round2(best?.confidence ?? 0),
    passabilityConfidence: best === undefined ? 0 : 0.82,
    riskPenalty: round2(best?.riskPenalty ?? 0),
    crowdingPenalty: round2(best?.crowdingPenalty ?? 0),
    biomeMismatchPenalty: round2(best?.biomePenalty ?? 0),
    learnedSupportGate: round2(learnedSupportGate),
    currentLearnedSupport: round2(currentLearnedSupport),
    bestCandidateLearnedSupport: round2(best?.learnedSupport ?? 0),
    candidatesWithLearnedSupport,
    reasonIds: best === undefined
      ? []
      : [makeContextReasonId(world, band.id, "known_better_patch_pull", best.tileId)],
  };
}

export function applyEncounterContext(
  world: WorldState,
  cache: TickContextCache,
): WorldState {
  const bandsById: Record<string, Band> = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((output, band) => {
      output[band.id] = band;
      return output;
    }, {});
  for (const pair of getEncounterCandidatePairs(world, cache)) {
    const left = bandsById[pair.leftBandId];
    const right = bandsById[pair.rightBandId];
    const encounter = left === undefined || right === undefined
      ? undefined
      : detectEncounter(world, left, right);

    if (encounter === undefined) {
      continue;
    }

    const leftUpdate = applyEncounterToBand(world, left, right, encounter);
    const rightUpdate = applyEncounterToBand(world, right, left, encounter);

    bandsById[left.id] = leftUpdate;
    bandsById[right.id] = rightUpdate;
  }

  return {
    ...world,
    bands: bandsById as Readonly<Record<BandId, Band>>,
  };
}

function detectEncounter(
  world: WorldState,
  left: Band,
  right: Band,
): BandEncounterRecord | undefined {
  if (
    left.status === "dispersed" ||
    right.status === "dispersed" ||
    left.viability?.status === "absorbed" ||
    right.viability?.status === "absorbed" ||
    left.viability?.status === "extinct" ||
    right.viability?.status === "extinct"
  ) {
    return undefined;
  }

  const leftTile = getTile(world, left.position);
  const rightTile = getTile(world, right.position);

  if (leftTile === undefined || rightTile === undefined) {
    return undefined;
  }

  const distance = getGridDistance(leftTile, rightTile);
  const relation = getEncounterRelation(left, right);
  const memoryOverlap = getSharedMemoryOverlap(world, left, right);
  const kind = getEncounterKind(distance, relation, memoryOverlap);

  if (kind === undefined) {
    return undefined;
  }

  const resourcePressure = round2(
    clamp01(
      (left.rangeSaturation?.saturationPressure ?? 0) * 0.28 +
        (right.rangeSaturation?.saturationPressure ?? 0) * 0.28 +
        getLocalUsePressureValue(left.usePressure[left.position]) * 0.18 +
        getLocalUsePressureValue(right.usePressure[right.position]) * 0.18,
    ),
  );
  const crowdingPressure = round2(
    clamp01(
      (left.pressureState?.nearbyBandPressure ?? 0) * 0.4 +
        (right.pressureState?.nearbyBandPressure ?? 0) * 0.4 +
        (distance === 0 ? 0.2 : 0),
    ),
  );
  const tolerance = round2(getEncounterTolerance(relation, left, right, resourcePressure));
  const tension = round2(
    clamp01(
      resourcePressure * 0.36 +
        crowdingPressure * 0.38 +
        (relation === "unrelated" || relation === "unknown" ? 0.18 : 0.04) -
        tolerance * 0.28,
    ),
  );
  const outcome = getEncounterOutcome(relation, tolerance, tension, resourcePressure);
  const anchorTileId = distance === 0 ? left.position : undefined;

  return {
    id: `encounter:${world.time.tick}:${left.id}:${right.id}`,
    tick: world.time.tick,
    time: world.time,
    bandAId: left.id,
    bandBId: right.id,
    tileId: anchorTileId,
    kind,
    relation,
    resourcePressure,
    crowdingPressure,
    tolerance,
    tension,
    outcome,
    reasonIds: [
      makeContextReasonId(world, left.id, "band_encounter_detected", anchorTileId ?? left.position),
      makeContextReasonId(world, right.id, "band_encounter_detected", anchorTileId ?? right.position),
    ],
  };
}

function applyEncounterToBand(
  world: WorldState,
  band: Band,
  otherBand: Band,
  encounter: BandEncounterRecord,
): Band {
  const contactMemory = updateContactMemory(world, band, otherBand, encounter);
  const contactMemories = {
    ...band.contactMemories,
    [otherBand.id]: contactMemory,
  };
  const perception = deriveEncounterPerception(world, band, otherBand, encounter, contactMemory);
  const disposition = deriveBandDispositionState(world, band, encounter);
  const response = deriveEncounterResponseDistribution(world, band, encounter, disposition, perception);
  const temporarySeparation = deriveTemporarySeparationPressure(world, band, response, encounter);
  const adjustedCohesion = clamp01(
    band.cohesion -
      response.splitRisk * 0.025 -
      response.dissentLevel * 0.012 +
      (encounter.relation === "parent_daughter" ? 0.006 : 0),
  );

  return {
    ...band,
    cohesion: round2(adjustedCohesion),
    contactMemories,
    encounterRecords: [...band.encounterRecords, encounter].slice(-24),
    encounterPerceptions: [...band.encounterPerceptions, perception].slice(-24),
    encounterResponses: [...band.encounterResponses, response].slice(-24),
    disposition,
    temporarySeparation,
  };
}

function updateContactMemory(
  world: WorldState,
  band: Band,
  otherBand: Band,
  encounter: BandEncounterRecord,
): KnownBandContactMemory {
  const previous = band.contactMemories[otherBand.id];
  const peaceful =
    encounter.outcome === "tolerated_overlap" ||
    encounter.outcome === "brief_contact" ||
    encounter.outcome === "shared_use";
  const strained =
    encounter.outcome === "tension_increased" ||
    encounter.outcome === "dispute_risk_raised" ||
    encounter.outcome === "one_band_yielded";
  const avoidance =
    encounter.outcome === "mutual_avoidance" ||
    encounter.outcome === "one_band_yielded";
  const contactCount = (previous?.contactCount ?? 0) + 1;
  const relation = getContactMemoryRelation(encounter.relation);
  const familiarity = clamp01(
    (previous?.familiarity ?? (relation === "parent_daughter" ? 0.52 : 0.08)) +
      (peaceful ? 0.08 : 0.03),
  );
  const tension = clamp01(
    (previous?.tension ?? 0) * 0.82 +
      encounter.tension * 0.24 +
      (strained ? 0.08 : 0) -
      (peaceful ? 0.04 : 0),
  );
  const trustLikeTolerance = clamp01(
    (previous?.trustLikeTolerance ?? (relation === "parent_daughter" ? 0.58 : 0.14)) +
      (peaceful ? 0.06 : 0) -
      tension * 0.04,
  );

  return {
    otherBandId: otherBand.id,
    firstContactAt: previous?.firstContactAt ?? world.time,
    lastContactAt: world.time,
    contactCount,
    peacefulContactCount: (previous?.peacefulContactCount ?? 0) + (peaceful ? 1 : 0),
    strainedContactCount: (previous?.strainedContactCount ?? 0) + (strained ? 1 : 0),
    sharedUseCount: (previous?.sharedUseCount ?? 0) + (encounter.outcome === "shared_use" ? 1 : 0),
    avoidanceCount: (previous?.avoidanceCount ?? 0) + (avoidance ? 1 : 0),
    familiarity: round2(familiarity),
    tension: round2(tension),
    trustLikeTolerance: round2(trustLikeTolerance),
    relation,
    reasonIds: [
      ...(previous?.reasonIds ?? []).slice(-5),
      makeContextReasonId(world, band.id, "contact_memory_updated", band.position),
    ],
  };
}

function deriveBandDispositionState(
  world: WorldState,
  band: Band,
  encounter: BandEncounterRecord | undefined,
): BandDispositionState {
  const pressure = band.pressureState;
  const latestTension = encounter?.tension ??
    Object.values(band.contactMemories).sort((left, right) => right.lastContactAt.tick - left.lastContactAt.tick)[0]?.tension ??
    0;
  const kinCalm = encounter?.relation === "parent_daughter" || encounter?.relation === "siblings" ? 0.12 : 0;
  const fear = clamp01((pressure?.waterStress ?? 0) * 0.32 + (pressure?.riskPressure ?? 0) * 0.34 + latestTension * 0.22);
  const anger = clamp01((pressure?.foodStress ?? 0) * 0.22 + latestTension * 0.36 + band.demography.householdCrowdingPressure * 0.12);
  const caution = clamp01((pressure?.riskPressure ?? 0) * 0.34 + latestTension * 0.2 + 0.1);
  const hungerStress = clamp01(pressure?.foodStress ?? band.demography.foodPerPersonStress);
  const waterStress = clamp01(pressure?.waterStress ?? band.seasonalSupport?.currentSeasonSupport.waterStress ?? 0);
  const fatigueStress = clamp01(pressure?.fatiguePressure ?? 0);
  const deathSeverity = band.deathMemory?.deathMemorySeverity ?? 0;
  const socialFracture = band.socialTension?.socialTensionPressure ?? latestTension;
  const fissionPressure = band.innerFission?.pressureScore ?? band.demography.splitPressure;
  const weakPressure = band.viability?.viabilityPressure ?? 0;
  const resourceRecovery = (band.resourceEcology?.support.seasonalResourceModifier ?? 1) > 1.04 ? 0.18 : 0;
  const recoverySignal = clamp01(
    (band.seasonalSupport?.seasonalRecoveryStreak ?? 0) * 0.18 +
      (band.seasonalSupport?.currentSeasonSupport.mode === "pulse" ? 0.34 : 0) +
      resourceRecovery,
  );
  const hardship = band.recentResidentialMoveEvents?.[0]?.hardshipRisk ?? 0;
  const protoCampSafety = band.protoCampMemory?.currentPlace?.campLikeState === "refuge_anchor"
    ? band.protoCampMemory.currentPlace.confidence * 0.24
    : 0;
  const suspicious = clamp01(
    (band.socialTension?.protectiveVaguenessCount ?? 0) * 0.12 +
      (band.socialTension?.directionBlurredCount ?? 0) * 0.1 +
      ((band.socialTension?.tolerance ?? 1) < 0.18 ? 0.34 : 0),
  );
  const confident = clamp01(
    (1 - hungerStress) * 0.16 +
      (band.rangeSaturation?.perCapitaReturnEstimate ?? 0.42) * 0.18 +
      kinCalm,
  );
  const calm = clamp01(
    0.28 +
      kinCalm +
      (band.rangeSaturation?.perCapitaReturnEstimate ?? 0.36) * 0.12 -
      fear * 0.18 -
      anger * 0.12 -
      hungerStress * 0.08,
  );
  const stable = clamp01(calm * 0.6 + confident * 0.3 + protoCampSafety - hungerStress * 0.18 - waterStress * 0.18 - socialFracture * 0.18);
  const shares = normalizeMoodShares([
    ["stable", stable],
    ["calm", calm],
    ["recovering", recoverySignal],
    ["cautious", caution],
    ["fearful", fear],
    ["angry", anger],
    ["hungry", hungerStress],
    ["thirsty", waterStress],
    ["tired", clamp01(fatigueStress * 0.72)],
    ["curious", clamp01((band.frontierDispersal?.pressure ?? 0) * 0.38 + (band.nearbyOpportunity?.opportunityStrength ?? 0) * 0.2)],
    ["confident", confident],
    ["strained", clamp01(latestTension * 0.22 + fissionPressure * 0.2 + socialFracture * 0.18)],
    ["fractured", clamp01((band.innerFission?.state === "factional" || band.innerFission?.state === "near_split" ? 0.44 : 0) + socialFracture * 0.18)],
    ["grieving", clamp01(deathSeverity * 0.72)],
    ["desperate", clamp01(weakPressure * 0.36 + hungerStress * 0.24 + waterStress * 0.24)],
    ["relieved", clamp01(recoverySignal * 0.8 + (band.seasonalSupport?.hungerClassification === "seasonal_pulse_recovery" ? 0.28 : 0))],
    ["restless", clamp01((band.frontierDispersal?.pressure ?? 0) * 0.28 + (band.pressureState?.mobilityPressure ?? 0) * 0.2)],
    ["pressured", clamp01(band.demography.householdCrowdingPressure * 0.24 + hardship * 0.22 + hungerStress * 0.14 + waterStress * 0.14)],
    ["suspicious", suspicious],
  ]);
  const dominantMood = shares
    .slice()
    .sort((left, right) =>
      right.share === left.share
        ? left.mood.localeCompare(right.mood)
        : right.share - left.share,
    )[0]?.mood ?? "calm";

  return {
    tick: world.time.tick,
    time: world.time,
    moodShares: shares,
    dominantMood,
    cohesion: round2(band.cohesion),
    fear: round2(fear),
    anger: round2(anger),
    caution: round2(caution),
    hungerStress: round2(hungerStress),
    fatigueStress: round2(fatigueStress),
    confidence: round2(0.58 + (band.pressureState?.confidence ?? 0.4) * 0.32),
    moodReasons: deriveMoodReasons({
      hungerStress,
      waterStress,
      fatigueStress,
      deathSeverity,
      recoverySignal,
      fissionPressure,
      socialFracture,
      hardship,
      suspicious,
      protoCampSafety,
    }),
    sourceReasonIds: [makeContextReasonId(world, band.id, "band_disposition_updated", band.position)],
  };
}

function deriveEncounterPerception(
  world: WorldState,
  band: Band,
  otherBand: Band,
  encounter: BandEncounterRecord,
  contactMemory: KnownBandContactMemory,
): EncounterPerception {
  const sizeRatio = clamp01(otherBand.demography.population / Math.max(1, band.demography.population * 1.6));
  const relationKinSafety =
    encounter.relation === "parent_daughter" ? 0.76 :
    encounter.relation === "siblings" || encounter.relation === "related_lineage" ? 0.52 :
    0.08;
  const kinSafety = clamp01(relationKinSafety * 0.6 + encounter.tolerance * 0.4);
  const perceivedThreat = clamp01(
    sizeRatio * 0.26 +
      encounter.tension * 0.34 +
      contactMemory.tension * 0.24 -
      kinSafety * 0.24 -
      contactMemory.trustLikeTolerance * 0.12,
  );
  const knownEscapeConfidence = clamp01(
    (band.travelCorridors === undefined ? 0 : Object.keys(band.travelCorridors).length / 12) * 0.28 +
      (band.frontierDispersal?.frontierCandidateTileIds.length ?? 0) * 0.05 +
      (band.nearbyOpportunity?.passabilityConfidence ?? 0) * 0.18,
  );
  const sharedUseConfidence = clamp01(
    contactMemory.sharedUseCount / Math.max(1, contactMemory.contactCount) * 0.5 +
      contactMemory.trustLikeTolerance * 0.34,
  );
  const uncertainty = clamp01(1 - contactMemory.familiarity + (encounter.relation === "unknown" ? 0.18 : 0));

  return {
    encounterId: encounter.id,
    observerBandId: band.id,
    otherBandId: otherBand.id,
    perceivedThreat: round2(perceivedThreat),
    perceivedKinshipSafety: round2(kinSafety),
    perceivedResourceCompetition: round2(clamp01(encounter.resourcePressure + encounter.crowdingPressure * 0.42)),
    knownEscapeConfidence: round2(knownEscapeConfidence),
    knownSharedUseConfidence: round2(sharedUseConfidence),
    uncertainty: round2(uncertainty),
    reasonIds: [makeContextReasonId(world, band.id, "encounter_perception_updated", band.position)],
  };
}

function deriveEncounterResponseDistribution(
  world: WorldState,
  band: Band,
  encounter: BandEncounterRecord,
  disposition: BandDispositionState,
  perception: EncounterPerception,
): EncounterResponseDistribution {
  const vulnerableShare = clamp01((band.demography.dependents + band.demography.elders) / Math.max(1, band.demography.population));
  const avoid = clamp01(disposition.fear * 0.34 + disposition.caution * 0.22 + perception.perceivedThreat * 0.26 + vulnerableShare * 0.12);
  const observe = clamp01(disposition.caution * 0.34 + perception.uncertainty * 0.18 + 0.08);
  const shareUse = clamp01(perception.perceivedKinshipSafety * 0.3 + perception.knownSharedUseConfidence * 0.3 + encounter.tolerance * 0.22);
  const holdGround = clamp01(disposition.confidence * 0.16 + disposition.anger * 0.26 + encounter.resourcePressure * 0.12);
  const confront = clamp01(disposition.anger * 0.24 + encounter.tension * 0.22 - perception.perceivedKinshipSafety * 0.12);
  const flee = clamp01(disposition.fear * 0.26 + perception.perceivedThreat * 0.2 + vulnerableShare * 0.1 - perception.knownEscapeConfidence * 0.08);
  const seekKin = clamp01(
    band.parentBandId === undefined ? 0 : perception.perceivedThreat * 0.12 + vulnerableShare * 0.08,
  );
  const wait = clamp01((1 - band.cohesion) * 0.16 + disposition.fatigueStress * 0.12);
  const responseShares = normalizeResponseShares([
    ["avoid", avoid],
    ["observe", observe],
    ["share_use", shareUse],
    ["hold_ground", holdGround],
    ["confront", confront],
    ["flee", flee],
    ["seek_parent_or_known_band", seekKin],
    ["wait_for_separated_members", wait],
  ]);
  const sorted = responseShares
    .slice()
    .sort((left, right) =>
      right.share === left.share
        ? left.response.localeCompare(right.response)
        : right.share - left.share,
    );
  const dominantResponse = sorted[0]?.response ?? "observe";
  const dissentLevel = clamp01((sorted[1]?.share ?? 0) + (sorted[2]?.share ?? 0) - (sorted[0]?.share ?? 0) * 0.35);
  const splitRisk = clamp01(dissentLevel * (1 - band.cohesion) + encounter.tension * 0.18 + perception.perceivedThreat * 0.12);

  return {
    encounterId: encounter.id,
    bandId: band.id,
    responseShares,
    dominantResponse,
    dissentLevel: round2(dissentLevel),
    splitRisk: round2(splitRisk),
    reasonIds: [makeContextReasonId(world, band.id, "encounter_response_distribution", band.position)],
  };
}

function deriveTemporarySeparationPressure(
  world: WorldState,
  band: Band,
  response: EncounterResponseDistribution,
  encounter: BandEncounterRecord,
): TemporarySeparationPressure {
  const cause =
    response.dominantResponse === "flee" ? "encounter_fear" :
    response.splitRisk > 0.48 ? "encounter_disagreement" :
    encounter.resourcePressure > 0.58 ? "resource_panic" :
    "conflict_avoidance";
  const active = response.splitRisk > 0.44 || response.dominantResponse === "flee";

  return {
    bandId: band.id,
    active,
    cause,
    estimatedSeparatedShare: active ? round2(clamp01(response.dissentLevel * 0.5 + response.splitRisk * 0.24)) : 0,
    reuniteIntent: active ? round2(clamp01(band.cohesion * 0.62 + 0.18)) : 0,
    waitingAtTileId: active ? band.position : undefined,
    expectedReunionHorizonTicks: 3 as TickNumber,
    reasonIds: active
      ? [makeContextReasonId(world, band.id, "temporary_separation_pressure", band.position)]
      : [],
  };
}

interface FrontierCandidate {
  readonly tileId: TileId;
  readonly score: number;
  readonly corridorKind: FrontierCorridorKind;
}

function getFrontierCandidates(
  world: WorldState,
  band: Band,
  cache: TickContextCache,
  profiler?: SocialContextProfiler,
): readonly FrontierCandidate[] {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return [];
  }

  const candidateTileIds =
    getSalientMemorySummary(cache, band.id)?.knownFrontierTileIds ??
    (Object.keys(band.knowledge.observedTiles) as TileId[]);

  const bestCandidates: FrontierCandidate[] = [];
  let acceptedCount = 0;
  countContext(profiler, "frontierCandidatesConsidered", candidateTileIds.length);

  for (const tileId of candidateTileIds) {
    const record = band.knowledge.observedTiles[tileId];

    if (record === undefined) {
      countContext(profiler, "frontierCandidatesRejectedMissing");
      continue;
    }

    const tile = getTile(world, record.tileId);

    if (tile === undefined || !isBandPassableDestination(tile)) {
      countContext(profiler, "frontierCandidatesRejectedPassability");
      continue;
    }

    if (!isKnownReachable(world, band, band.position, tile.id)) {
      countContext(profiler, "frontierCandidatesRejectedReachability");
      continue;
    }

    let unknownNeighborCount = 0;
    for (const neighborId of tile.neighbors) {
      if (band.knowledge.observedTiles[neighborId] === undefined) {
        unknownNeighborCount += 1;
      }
    }

    if (unknownNeighborCount === 0) {
      countContext(profiler, "frontierCandidatesRejectedNoUnknownNeighbor");
      continue;
    }

    const distance = getGridDistance(currentTile, tile);
    const corridorKind = getFrontierCorridorKind(band, tile);
    const corridorValue = corridorKind === "unknown" ? 0.08 : 0.32;
    const pressure = getNearbyBandPressure(world, band, tile.id, cache);
    const suitability = getKnownHabitatSuitability(tile, record);
    const inheritedPenalty = record.knowledgeSource === "personally_observed" ? 0 : 0.08;
    const score = clamp01(
      unknownNeighborCount / Math.max(1, tile.neighbors.length) * 0.34 +
        corridorValue +
        suitability * 0.24 +
        record.confidence * 0.12 -
        pressure.weightedCrowding * 0.16 -
        inheritedPenalty -
        Math.max(0, distance - 8) * 0.018,
    );

    if (score <= 0.18) {
      countContext(profiler, "frontierCandidatesRejectedLowScore");
      continue;
    }

    acceptedCount += 1;
    insertFrontierCandidate(bestCandidates, {
      tileId: tile.id,
      score,
      corridorKind,
    });
  }

  countContext(profiler, "frontierCandidatesAccepted", acceptedCount);
  return bestCandidates;
}

function insertFrontierCandidate(
  candidates: FrontierCandidate[],
  candidate: FrontierCandidate,
): void {
  const index = candidates.findIndex((existing) => compareFrontierCandidates(candidate, existing) < 0);

  if (index === -1) {
    if (candidates.length < 8) {
      candidates.push(candidate);
    }
    return;
  }

  candidates.splice(index, 0, candidate);
  if (candidates.length > 8) {
    candidates.pop();
  }
}

function compareFrontierCandidates(left: FrontierCandidate, right: FrontierCandidate): number {
  return right.score === left.score
    ? String(left.tileId).localeCompare(String(right.tileId))
    : right.score - left.score;
}

function getFrontierCorridorKind(band: Band, tile: Tile): FrontierCorridorKind {
  if (tile.isCoastal) {
    return "coast";
  }

  if (tile.isRiverbank || tile.isRiver || tile.isFloodplain) {
    return tile.isFloodplain ? "floodplain_edge" : "riverbank";
  }

  if (tile.isMarshChannel || tile.terrainKind === "wetlands") {
    return "wetland_edge";
  }

  if (tile.terrainKind === "lake") {
    return "lake_margin";
  }

  if (Object.values(band.crossingMemories).some((memory) => memory.crossingTileA === tile.id || memory.crossingTileB === tile.id)) {
    return "known_crossing";
  }

  if (tile.terrainKind === "hills" && tile.movementCost < 1.6) {
    return "pass_corridor";
  }

  if (tile.riskProfile.droughtRisk > 0.42) {
    return "dry_edge";
  }

  return "unknown";
}

function getLocalPopulationEstimate(world: WorldState, band: Band, tileId: TileId): number {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return band.demography.population;
  }

  return Object.values(world.bands).reduce((total, otherBand) => {
    if (
      otherBand.status === "dispersed" ||
      otherBand.viability?.status === "absorbed" ||
      otherBand.viability?.status === "extinct"
    ) {
      return total;
    }

    const otherTile = getTile(world, otherBand.position);

    if (otherTile === undefined) {
      return total;
    }

    const distance = getGridDistance(tile, otherTile);

    if (distance > LOCAL_RANGE_RADIUS) {
      return total;
    }

    const weight = (LOCAL_RANGE_RADIUS + 1 - distance) / (LOCAL_RANGE_RADIUS + 1);

    return total + otherBand.demography.population * weight;
  }, 0);
}

function getLocalBandCount(world: WorldState, tileId: TileId): number {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return 1;
  }

  return Object.values(world.bands).filter((band) => {
    if (
      band.status === "dispersed" ||
      band.viability?.status === "absorbed" ||
      band.viability?.status === "extinct"
    ) {
      return false;
    }

    const otherTile = getTile(world, band.position);

    return otherTile !== undefined && getGridDistance(tile, otherTile) <= LOCAL_RANGE_RADIUS;
  }).length;
}

function getKnownHabitatSuitability(tile: Tile, record: Band["knowledge"]["observedTiles"][TileId] | undefined): number {
  return clamp01(
    (record?.observedRichness ?? tile.resourceProfile.baseRichness) * 0.36 +
      (record?.observedWaterAccess ?? tile.resourceProfile.waterAccess) * 0.26 +
      (record?.observedAquaticPotential ?? tile.resourceProfile.aquaticPotential) * 0.16 +
      ((record?.observedSeasonalPattern?.reliability ?? tile.seasonalProfile.reliability) * 0.12) +
      (tile.resourceProfile.storageSuitability * 0.06) -
      ((record?.observedRisk ?? getTileRisk(tile)) * 0.14),
  );
}

function getHabitatCrowdingBuffer(tile: Tile): number {
  return clamp01(
    tile.resourceProfile.baseRichness * 0.28 +
      tile.resourceProfile.waterAccess * 0.24 +
      tile.resourceProfile.aquaticPotential * 0.22 +
      (tile.isCoastal || tile.terrainKind === "wetlands" || tile.isFloodplain ? 0.18 : 0) -
      tile.riskProfile.droughtRisk * 0.12 -
      tile.riskProfile.diseaseRisk * 0.08,
  );
}

function isKnownReachable(
  world: WorldState,
  band: Band,
  fromTileId: TileId,
  toTileId: TileId,
): boolean {
  const target = getTile(world, toTileId);

  if (target === undefined || !isBandPassableDestination(target)) {
    return false;
  }

  const fromTile = getTile(world, fromTileId);

  if (fromTile === undefined) {
    return false;
  }

  const distance = getGridDistance(fromTile, target);

  if (distance > 8) {
    return false;
  }

  if (distance <= 1) {
    const crossing = getRiverCrossingForMovement(world, fromTileId, toTileId);

    return crossing === undefined ||
      crossing.crossingClass === "ford" ||
      crossing.crossingClass === "seasonal_ford" ||
      crossing.crossingClass === "shallow_crossing";
  }

  return true;
}

function getEncounterKind(
  distance: number,
  relation: BandEncounterRelation,
  memoryOverlap: number,
): BandEncounterKind | undefined {
  if (distance === 0) {
    return "same_tile";
  }

  if (distance === 1) {
    return "adjacent_contact";
  }

  if (relation === "parent_daughter" && distance <= 3) {
    return "parent_daughter_overlap";
  }

  if (relation === "siblings" && distance <= 3) {
    return "sibling_overlap";
  }

  if (memoryOverlap > 0.24 || distance <= 3) {
    return relation === "unrelated" || relation === "unknown"
      ? "unrelated_overlap"
      : "shared_resource_area";
  }

  return undefined;
}

function getEncounterRelation(left: Band, right: Band): BandEncounterRelation {
  if (left.parentBandId === right.id || right.parentBandId === left.id) {
    return "parent_daughter";
  }

  if (left.parentBandId !== undefined && left.parentBandId === right.parentBandId) {
    return "siblings";
  }

  if (left.lineage?.parentBandId === right.lineage?.parentBandId && left.lineage !== undefined) {
    return "related_lineage";
  }

  return "unrelated";
}

function getContactMemoryRelation(
  relation: BandEncounterRelation,
): KnownBandContactMemory["relation"] {
  if (relation === "parent_daughter" || relation === "siblings") {
    return relation;
  }

  return relation === "unknown" ? "unknown" : "unrelated";
}

function getSharedMemoryOverlap(world: WorldState, left: Band, right: Band): number {
  const rightReturnTiles = new Set(
    Object.values(right.placeMemory)
      .filter((memory) => memory.isReturnPlace || memory.attachment > 0.48)
      .map((memory) => String(memory.tileId)),
  );

  return Object.values(left.placeMemory)
    .filter((memory) => memory.isReturnPlace || memory.attachment > 0.48)
    .map((memory) => {
      if (rightReturnTiles.has(String(memory.tileId))) {
        return clamp01(memory.attachment);
      }

      const leftTile = getTile(world, memory.tileId);

      if (leftTile === undefined) {
        return 0;
      }

      return Object.values(right.placeMemory).some((otherMemory) => {
        const rightTile = getTile(world, otherMemory.tileId);

        return rightTile !== undefined && getGridDistance(leftTile, rightTile) <= 1;
      })
        ? 0.3
        : 0;
    })
    .sort((leftScore, rightScore) => rightScore - leftScore)[0] ?? 0;
}

function getEncounterTolerance(
  relation: BandEncounterRelation,
  left: Band,
  right: Band,
  resourcePressure: number,
): number {
  const kinTolerance =
    relation === "parent_daughter" ? 0.56 :
    relation === "siblings" || relation === "related_lineage" ? 0.34 :
    0.06;
  const abundanceTolerance = clamp01(
      (left.rangeSaturation?.perCapitaReturnEstimate ?? 0.4) * 0.22 +
      (right.rangeSaturation?.perCapitaReturnEstimate ?? 0.4) * 0.22,
  );

  return clamp01(kinTolerance + abundanceTolerance - resourcePressure * 0.18);
}

function getEncounterOutcome(
  relation: BandEncounterRelation,
  tolerance: number,
  tension: number,
  resourcePressure: number,
): BandEncounterOutcome {
  if (tension > 0.68) {
    return "dispute_risk_raised";
  }

  if (tension > 0.48) {
    return "tension_increased";
  }

  if (tolerance > 0.48 && resourcePressure < 0.38) {
    return relation === "parent_daughter" || relation === "siblings"
      ? "shared_use"
      : "tolerated_overlap";
  }

  if (tension > tolerance + 0.12) {
    return "mutual_avoidance";
  }

  return "brief_contact";
}

function deriveMoodReasons(inputs: {
  readonly hungerStress: number;
  readonly waterStress: number;
  readonly fatigueStress: number;
  readonly deathSeverity: number;
  readonly recoverySignal: number;
  readonly fissionPressure: number;
  readonly socialFracture: number;
  readonly hardship: number;
  readonly suspicious: number;
  readonly protoCampSafety: number;
}): readonly string[] {
  const reasons: string[] = [];
  if (inputs.hungerStress >= 0.35) {
    reasons.push("seasonal or chronic hunger is visible");
  }
  if (inputs.waterStress >= 0.35) {
    reasons.push("water stress is shaping decisions");
  }
  if (inputs.fatigueStress >= 0.35) {
    reasons.push("fatigue and labor burden are high");
  }
  if (inputs.deathSeverity >= 0.25) {
    reasons.push("recent deaths are affecting caution");
  }
  if (inputs.recoverySignal >= 0.25) {
    reasons.push("a recovery or pulse season is easing pressure");
  }
  if (inputs.fissionPressure >= 0.35) {
    reasons.push("inner fission pressure is rising");
  }
  if (inputs.socialFracture >= 0.35) {
    reasons.push("social tension is reducing cohesion");
  }
  if (inputs.hardship >= 0.3) {
    reasons.push("movement hardship remains salient");
  }
  if (inputs.suspicious >= 0.25) {
    reasons.push("vague or guarded reports are raising suspicion");
  }
  if (inputs.protoCampSafety >= 0.12) {
    reasons.push("a familiar refuge is buffering stress");
  }

  return reasons.slice(0, 6);
}

function normalizeMoodShares(
  values: readonly (readonly [BandMoodKind, number])[],
): BandDispositionState["moodShares"] {
  const total = values.reduce((sum, [, value]) => sum + Math.max(0, value), 0);

  return values.map(([mood, value]) => ({
    mood,
    share: round2(total <= 0 ? 1 / values.length : Math.max(0, value) / total),
  }));
}

function normalizeResponseShares(
  values: readonly (readonly [EncounterResponseKind, number])[],
): EncounterResponseDistribution["responseShares"] {
  const total = values.reduce((sum, [, value]) => sum + Math.max(0, value), 0);

  return values.map(([response, value]) => ({
    response,
    share: round2(total <= 0 ? 1 / values.length : Math.max(0, value) / total),
  }));
}

function getTileRisk(tile: Tile): number {
  return clamp01(
    tile.riskProfile.floodRisk * 0.34 +
      tile.riskProfile.droughtRisk * 0.34 +
      tile.riskProfile.diseaseRisk * 0.32,
  );
}

interface EncounterCandidatePair {
  readonly leftBandId: BandId;
  readonly rightBandId: BandId;
}

function getEncounterCandidatePairs(
  world: WorldState,
  cache: TickContextCache,
): readonly EncounterCandidatePair[] {
  const pairKeys = new Set<string>();

  for (const bandId of cache.activeBandIds) {
    const band = world.bands[bandId];

    if (band === undefined) {
      continue;
    }

    for (const nearbyId of getLocalEncounterCandidateIds(world, cache, band)) {
      if (nearbyId !== band.id) {
        pairKeys.add(getEncounterPairKey(band.id, nearbyId));
      }
    }
  }

  const memoryTileBands = new Map<string, BandId[]>();

  for (const bandId of cache.activeBandIds) {
    const summary = getSalientMemorySummary(cache, bandId);

    if (summary === undefined) {
      continue;
    }

    for (const tileId of summary.topReturnPlaceIds.slice(0, 12)) {
      const key = String(tileId);
      const ids = memoryTileBands.get(key) ?? [];
      ids.push(bandId);
      memoryTileBands.set(key, ids);
    }
  }

  for (const bandIds of memoryTileBands.values()) {
    const sorted = bandIds.sort(compareBandIds);

    for (let index = 0; index < sorted.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < sorted.length; otherIndex += 1) {
        pairKeys.add(getEncounterPairKey(sorted[index], sorted[otherIndex]));
      }
    }
  }

  return [...pairKeys]
    .sort()
    .map((key) => {
      const [leftBandId, rightBandId] = key.split("|") as [BandId, BandId];

      return { leftBandId, rightBandId };
    });
}

function getLocalEncounterCandidateIds(
  world: WorldState,
  cache: TickContextCache,
  band: Band,
): readonly BandId[] {
  const nearby = cache.nearbyBandsByBandId.get(band.id);

  if (nearby !== undefined) {
    return nearby;
  }

  const bandTile = getTile(world, band.position);

  if (bandTile === undefined) {
    return [];
  }

  return cache.activeBandIds.filter((candidateId) => {
    const candidate = world.bands[candidateId];
    const candidateTile = candidate === undefined ? undefined : getTile(world, candidate.position);

    return (
      candidate !== undefined &&
      candidate.id !== band.id &&
      candidateTile !== undefined &&
      getGridDistance(bandTile, candidateTile) <= 4
    );
  });
}

function getEncounterPairKey(left: BandId, right: BandId): string {
  return compareBandIds(left, right) <= 0
    ? `${left}|${right}`
    : `${right}|${left}`;
}

function getInactiveBandsById(world: WorldState): Record<string, Band> {
  return Object.values(world.bands)
    .filter((band) =>
      band.status === "dispersed" ||
      band.viability?.status === "absorbed" ||
      band.viability?.status === "extinct",
    )
    .reduce<Record<string, Band>>((bandsById, band) => {
      bandsById[band.id] = band;

      return bandsById;
    }, {});
}

function makeContextReasonId(
  world: WorldState,
  bandId: BandId,
  kind: string,
  tileId: TileId,
): ReasonId {
  return `reason:context:${bandId}:${world.time.tick}:${kind}:${tileId}` as ReasonId;
}

function getGridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function compareBands(left: Band, right: Band): number {
  return compareBandIds(left.id, right.id);
}

function compareBandIds(left: BandId, right: BandId): number {
  return String(left).localeCompare(String(right));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
