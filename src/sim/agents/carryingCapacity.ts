import { deriveBaseHabitatPotential, deriveSeasonalEffectiveYield } from "./habitatYield";
import {
  applyResourceClassPressure,
  deriveResourceClassAvailability,
  deriveResourceClassPressureEffects,
} from "./resourceClasses";
import { deriveFaunaStockGeography, deriveFaunaTileSupportEffect } from "./faunaStock";
import { derivePlantTileSupportEffect } from "./plantStock";
import { deriveHumanFoodSupportLedger } from "./humanFoodSupport";
import { deriveNomadicScalePressure, getNomadicScaleDemandMultiplier } from "./nomadicScale";
import { getLocalUsePressureValue } from "./pressure";
import { getSalientMemorySummary, type TickContextCache } from "./contextCache";
import {
  getBandForagingFootprint,
  getOverlappingBandIds,
  getSharedCatchmentIndex,
  getTileSupportShare,
} from "./sharedCatchment";
import type {
  Band,
  ActivitySubsistenceSupplementState,
  CarryingCapacityState,
  DaughterColonizationAction,
  DaughterColonizationPressure,
  DensityPhase,
  KnownUnusedHabitatBasis,
  KnownUnusedHabitatKind,
  KnownUnusedHabitatOpportunity,
  PerCapitaReturnState,
  PopulationDemandState,
  EcologyStressCauseSummary,
  SeasonalEffectiveYield,
  SupportRatioBreakdown,
} from "./types";
import type { ResourceClassId, ResourceClassPressureEffect } from "./resourceClasses";
import type { BandId } from "../core/types";
import type { ReasonId, TileId, WorldTime } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import { getDepletionYieldMultiplier } from "../world/depletion";
// 2K.9 — THIRD deliberate src/sim consumer of the patch-return/skill view (after the 2K.5
// resourceScout selection hook and the 2K.8 socialContext opportunity term): the band-specific
// learned usable-support term. Guard importer set is now {resourceScout, socialContext,
// carryingCapacity}. This is the FIRST time learned skill touches realized support → demography,
// so it is tightly capped, damped by depletion/crowding, and clamped (surplus bands unaffected).
import { deriveTileLearnedSupport } from "./patchExploitationKnowledge";
import { getTile } from "../world/generate";
import { isBandPassableDestination } from "../world/passability";
import type { WorldState } from "../world/types";
import type { FoodDemographyDiagnostics } from "../diagnostics/foodDemographyDiagnostics";

// Carrying capacity + per-capita return + daughter colonization (checkpoint 2J).
// Bounded (anchor catchment + salient memory candidates), deterministic, and
// anti-omniscient (only the band's own known records). Light effects: it makes
// rich cores finite and surfaces underused habitats without forcing dispersal.

const MAX_CATCHMENT_FOR_YIELD = 16;
const TILE_SUPPORT = 12.5; // adult-equivalents one full-yield catchment tile can support
const MAX_OPPORTUNITY_CANDIDATES = 18;

// 2K.9 learned realized-support bounds (extremely conservative — first time learned skill touches
// realized support/demography). The 2K.8 learnedRankDelta is in [-0.12,+0.12]; SCALE converts the
// POSITIVE part into adult-equivalents, PER_TILE_CAP bounds one tile's contribution, and the
// per-band total saturates (diminishing returns) toward BAND_CAP. Each tile's contribution is
// further damped by depletion (wearMultiplier) and crowding (share), and the whole thing only
// helps DEFICIT bands (the support ratio clamps to 1 for a band already in surplus). Do NOT raise
// these to force migration — the goal is a correct causal bridge, not a tuned pull.
const LEARNED_REALIZED_SCALE = 5; // delta 0.06 (competent) → 0.30 raw adult-equiv per tile
const LEARNED_REALIZED_PER_TILE_CAP = 0.4; // delta 0.12 (processing-resolved) caps here per tile
const LEARNED_REALIZED_BAND_CAP = 1.0; // asymptotic per-band ceiling (adult-equivalents)
const LEARNED_REALIZED_HALF = 0.8; // half-saturation constant for diminishing returns

// Legacy AG11 constants are retained only for the dead compatibility helper at
// the bottom of this module. The canonical carrying path never calls it.
const ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION = 0.06;
const ACTIVITY_SUBSISTENCE_DEMAND_CAP_FRACTION = 0.03;
const ACTIVITY_SUBSISTENCE_ABSOLUTE_CAP = 0.75;

export interface CarryingCapacityResult {
  readonly state: CarryingCapacityState;
  readonly rangeV1: {
    readonly localPopulationDemand: number;
    readonly localLaborCapacity: number;
    readonly totalEffectiveYieldWithinRange: number;
    readonly saturation: number;
    readonly densityPhase: DensityPhase;
    readonly recoveryBuffer: number;
    readonly highRankPersistence: number;
  };
}

export function deriveCarryingCapacity(
  world: WorldState,
  band: Band,
  cache: TickContextCache | undefined,
  input: {
    readonly localUsePressure: number;
    readonly nearbyCrowding: number;
    readonly localPopulationEstimate: number;
    readonly riskPenalty: number;
    readonly diagnostics?: FoodDemographyDiagnostics;
  },
): CarryingCapacityResult | undefined {
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  if (currentTile === undefined || currentRecord === undefined) {
    return undefined;
  }

  const time = world.time;
  const biomeCompetence = getBiomeCompetence(band);
  const demand = derivePopulationDemand(band);

  // Catchment-aware support (2J.1). The band's bounded foraging footprint is the
  // single source of truth shared with the shared-catchment index, so the tiles it
  // forages and the tiles it competes for are identical. Each tile's support is
  // divided among overlapping bands in proportion to their claim weight: a band
  // alone on a rich delta keeps full support (share == 1) and is NOT nerfed, but
  // several bands on the same support zone split it instead of each owning a
  // private full-yield bubble.
  const sharedIndex = cache === undefined ? undefined : getSharedCatchmentIndex(world, cache);
  const footprint = sharedIndex === undefined
    ? getBandForagingFootprint(world, band)
    : sharedIndex.footprintByBandId.get(band.id) ?? getBandForagingFootprint(world, band);

  let rawReachableSupport = 0;
  let sharedReachableSupport = 0;
  let yieldSum = 0;
  let yieldCount = 0;
  let recoverySum = 0;
  let localUseSum = 0;
  let wearSum = 0;
  let depletionLossSum = 0;
  let resourceClassPressureLossSum = 0;
  let sharedPressureLossSum = 0;
  // FAUNA/AQUATIC-1 — realized support removed by finite animal/aquatic stock
  // shortfall (depletion/disturbance/lean season), plus the realized animal /
  // aquatic support actually drawn, for interpretability + audits.
  let faunaSupportLossSum = 0;
  let faunaCoveredTileCount = 0;
  // ECO-BIOME-1 — realized support removed by finite plant-patch overharvest, the
  // realized plant-food support drawn, and the processing-labor drag (useful but
  // costly foods), for interpretability + audits.
  let plantSupportLossSum = 0;
  let plantCoveredTileCount = 0;
  let processingDragSum = 0;
  let currentYield: SeasonalEffectiveYield | undefined;
  const resourceClassEffectTotals = new Map<ResourceClassId, ResourceClassPressureEffect>();
  const faunaGeo = deriveFaunaStockGeography(world);

  // 2K.9 — band-known learned-support evidence (anti-omniscient; band-own). Undefined when the
  // band has NO learned skill at all → no realized learned support is computed (skill-less bands
  // are byte-identical to pre-2K.9).
  const learnedSupportInput =
    band.exploitationSkill === undefined
      ? undefined
      : {
          currentTick: time.tick,
          recentPlantUseTests: band.recentPlantUseTests,
          recentCauseSpecificEvents: band.recentCauseSpecificEvents,
          exploitationSkill: band.exploitationSkill,
        };
  const learnedPatchMemories = band.resourceKnowledgeState?.patchMemories ?? [];
  const footprintTileIds = new Set<TileId>();
  let learnedSupportRaw = 0; // summed per-tile damped contribution, pre cap/diminishing
  const learnedSupportClasses = new Set<string>();
  const learnedSupportBlocked = new Set<string>();

  for (const footprintTile of footprint) {
    const tileId = footprintTile.tileId;
    const record = band.knowledge.observedTiles[tileId];

    if (record === undefined) {
      continue;
    }
    footprintTileIds.add(tileId);

    const yieldState = computeTileYield(world, band, tileId, record, time, biomeCompetence);
    // M0.14 — persistent wear: realized support from a depleted tile is
    // physically lower (for everyone, including newcomers). Crowding (the
    // shared division below) stays separate: competition is instantaneous,
    // wear is accumulated damage.
    const wearMultiplier = getDepletionYieldMultiplier(world, tileId);
    const share = sharedIndex === undefined
      ? 1
      : getTileSupportShare(sharedIndex, tileId, footprintTile.weight);
    const localUsePressure = getLocalUsePressureValue(band.usePressure[tileId]);
    const classSummary = applyResourceClassPressure(
      deriveResourceClassAvailability(deriveBaseHabitatPotential(tileId, record, time), record, time),
      {
        localUsePressure,
        sharedCatchmentPressure: clamp01(1 - share),
        crowding: Math.max(input.nearbyCrowding, localUsePressure),
      },
    );
    const classEffects = deriveResourceClassPressureEffects(classSummary);
    const resourceClassPressureLoss = Math.min(
      0.32,
      classEffects.reduce((sum, effect) => sum + effect.pressureLoss, 0),
    );
    const classPressureMultiplier = 1 - resourceClassPressureLoss;
    const preDepletionTileSupport = yieldState.effectiveYield * TILE_SUPPORT;
    const soloTileSupport = preDepletionTileSupport * wearMultiplier;
    const classAdjustedSoloTileSupport = soloTileSupport * classPressureMultiplier;

    // FAUNA/AQUATIC-1 — finite-stock multiplier. animal_food / aquatic_food are no
    // longer fungible decomposition shares: where a stock zone covers this tile,
    // its current abundance/disturbance/season physically scales the realized
    // support (like M0.14 wear), so overhunting/overfishing actually costs
    // support that the class renormalisation cannot paper over. Uncovered tiles
    // get factor 1 (generic placeholder, prior behaviour).
    const faunaEffect = deriveFaunaTileSupportEffect(
      world,
      faunaGeo,
      tileId,
      time.season,
      classSummary.contributionByClass,
    );
    // ECO-BIOME-1 — finite plant-patch overharvest multiplier (plant mirror of the
    // fauna multiplier; coupled to generic_plant_food only, capped, so gathering a
    // berry slope / tuber ground down actually costs support until it rests).
    const plantTile = currentTile.id === tileId ? currentTile : getTile(world, tileId);
    const plantEffect = plantTile === undefined
      ? { covered: false, plantMultiplier: 1, plantSupportLoss: 0, processingDrag: 0 }
      : derivePlantTileSupportEffect(world, plantTile, time, classSummary.contributionByClass);
    const faunaAdjustedSoloTileSupport = classAdjustedSoloTileSupport * faunaEffect.faunaMultiplier * plantEffect.plantMultiplier;
    if (faunaEffect.covered) {
      faunaCoveredTileCount += 1;
    }
    if (plantEffect.covered) {
      plantCoveredTileCount += 1;
      processingDragSum += plantEffect.processingDrag;
    }
    accumulateResourceClassEffects(resourceClassEffectTotals, classEffects);

    // 2K.9 — band-specific learned usable-support for THIS occupied tile, from the band's OWN
    // known, matching, safe patch(es) here (deriveTileLearnedSupport already excludes medicinal /
    // toxic / avoided / not-exploitable; a confirmed-problem class yields a negative → blocked).
    // Damped by the SAME depletion (wearMultiplier) and crowding (share) as physical support, so a
    // crowded/depleted range gets little learned support (the anti-sticky guard). NEVER mutates the
    // tile's physical yield/truth — it is added to the BAND's reachable support only.
    if (learnedSupportInput !== undefined) {
      const tileLearned = deriveTileLearnedSupport(tileId, learnedPatchMemories, learnedSupportInput);
      if (tileLearned.support > 0) {
        learnedSupportRaw +=
          Math.min(LEARNED_REALIZED_PER_TILE_CAP, tileLearned.support * LEARNED_REALIZED_SCALE) *
          wearMultiplier *
          share;
        if (tileLearned.bestClass !== undefined) {
          learnedSupportClasses.add(tileLearned.bestClass);
        }
      } else if (tileLearned.support < 0 && tileLearned.blockedClass !== undefined) {
        learnedSupportBlocked.add(tileLearned.blockedClass);
      }
    }

    wearSum += 1 - wearMultiplier;
    depletionLossSum += preDepletionTileSupport - soloTileSupport;
    resourceClassPressureLossSum += soloTileSupport - classAdjustedSoloTileSupport;
    faunaSupportLossSum += classAdjustedSoloTileSupport * (1 - faunaEffect.faunaMultiplier);
    plantSupportLossSum += classAdjustedSoloTileSupport * faunaEffect.faunaMultiplier * (1 - plantEffect.plantMultiplier);
    rawReachableSupport += soloTileSupport;
    sharedReachableSupport += faunaAdjustedSoloTileSupport * share;
    sharedPressureLossSum += faunaAdjustedSoloTileSupport * (1 - share);
    yieldSum += yieldState.effectiveYield;
    recoverySum += yieldState.recoveryBonus;
    localUseSum += yieldState.localUsePenalty;
    yieldCount += 1;

    if (tileId === currentTile.id) {
      currentYield = yieldState;
    }
  }

  // 2K.9 — diminishing-returns saturation toward a tight per-band cap. The learned usable-support
  // a lineage extracts from a range it KNOWS, added to the band's reachable support. Because the
  // support ratio CLAMPS to 1 (below), a band already in surplus is unaffected; this lifts only a
  // DEFICIT band toward viability — the causal bridge that makes a learned niche inhabitable.
  const realizedLearnedSupportDelta =
    learnedSupportRaw <= 0
      ? 0
      : round2(LEARNED_REALIZED_BAND_CAP * (learnedSupportRaw / (learnedSupportRaw + LEARNED_REALIZED_HALF)));
  const realizedLearnedSupportCapApplied = learnedSupportRaw > LEARNED_REALIZED_HALF;

  // 2K.9 (debug only): projected realized support the band WOULD gain at its single best known,
  // matching patch tile OUTSIDE the current footprint — realized only AFTER occupation, never
  // added to current support (no movement forcing). Bounded by the same scaling/cap.
  let candidateProjectedRaw = 0;
  if (learnedSupportInput !== undefined) {
    const projectedTiles = new Set<TileId>();
    for (const memory of learnedPatchMemories) {
      if (footprintTileIds.has(memory.approximateTile) || projectedTiles.has(memory.approximateTile)) {
        continue;
      }
      projectedTiles.add(memory.approximateTile);
      const projected = deriveTileLearnedSupport(memory.approximateTile, learnedPatchMemories, learnedSupportInput);
      if (projected.support > 0) {
        candidateProjectedRaw = Math.max(
          candidateProjectedRaw,
          Math.min(LEARNED_REALIZED_PER_TILE_CAP, projected.support * LEARNED_REALIZED_SCALE),
        );
      }
    }
  }
  const candidateProjectedLearnedSupportDelta =
    candidateProjectedRaw <= 0
      ? 0
      : round2(LEARNED_REALIZED_BAND_CAP * (candidateProjectedRaw / (candidateProjectedRaw + LEARNED_REALIZED_HALF)));

  const basePotential = deriveBaseHabitatPotential(currentTile.id, currentRecord, time);
  const seasonalEffectiveYield = currentYield ?? computeTileYield(world, band, currentTile.id, currentRecord, time, biomeCompetence);
  const meanYield = yieldCount === 0 ? seasonalEffectiveYield.effectiveYield : yieldSum / yieldCount;
  const recoveryBuffer = clamp01(yieldCount === 0 ? seasonalEffectiveYield.recoveryBonus : recoverySum / yieldCount);
  const realizedCatchmentTileCount = yieldCount;
  const highRankPersistence = round2(clamp01(
    basePotential.resourceDiversity * 0.4 + recoveryBuffer * 0.4 + meanYield * 0.2,
  ));

  // Accessibility (travel) cost grows with how far the band ranges; surfaced as
  // accessibilityPenalty. Labour is already inside adult-equivalent demand, so it
  // is not double-counted into support magnitude — the only NEW support pressure
  // is the shared-catchment division, keeping rich habitats plausible when solo.
  const travelCost = clamp01(footprint.length > 8 ? 0.12 : 0.06);
  const overlappingBandIds: readonly BandId[] = sharedIndex === undefined
    ? []
    : getOverlappingBandIds(sharedIndex, band.id);

  // Raw vs clamped support (2J.1): expose the pre-clamp truth so a hidden surplus or
  // deficit is visible. Existing behaviour keeps using the clamped ratio.
  // Learned-resource support remains a diagnostic opportunity projection only.
  // Current nourishment below is replaced by the canonical physical receipt
  // ledger; competence can guide future targets but cannot add calories.
  const adultEquivalentDemand = Math.max(1, demand.adultEquivalentDemand);
  const resourceClassPressureLoss = rawReachableSupport <= 0
    ? 0
    : clamp01(resourceClassPressureLossSum / rawReachableSupport);
  const preliminarySupportFloor = sharedReachableSupport;
  const preliminaryRawSupportRatio = preliminarySupportFloor / adultEquivalentDemand;
  const nomadicScalePressure = deriveNomadicScalePressure(band, {
    rawSupportRatio: preliminaryRawSupportRatio,
    sharedPressurePenalty: rawReachableSupport <= 0
      ? 0
      : clamp01(1 - sharedReachableSupport / rawReachableSupport),
    footprintDepletionPenalty: yieldCount === 0 ? 0 : wearSum / yieldCount,
    resourceClassPressureLoss,
    recoveryBuffer,
    highRankPersistence,
    overlapCount: overlappingBandIds.length,
    activeBandCount: cache?.nonDispersedBandCount ??
      Object.values(world.bands).filter((candidate) => candidate.status !== "dispersed").length,
    time,
  });
  const projectedCatchmentSupport =
    preliminarySupportFloor * (1 - nomadicScalePressure.logisticalInefficiencyPenalty);
  const physicalHumanFoodLedger = deriveHumanFoodSupportLedger(band, adultEquivalentDemand);
  // Diagnostic counterfactual only: hold support at the canonical neutral seam
  // (ratio exactly 1, maintenance rather than surplus). Physical receipts and
  // losses remain visible on the ledger, while the audit excludes an eight-season
  // history wash-in. No production caller supplies this option.
  const humanFoodLedger = input.diagnostics?.foodMode === "canonically_adequate"
    ? {
        ...physicalHumanFoodLedger,
        totalUsableSupport: adultEquivalentDemand,
        populationDemand: adultEquivalentDemand,
        rawSupportRatio: 1,
        foodStress: 0,
        supportUnitContract:
          "diagnostic maintenance adequacy at the canonical ledger seam; physical receipts remain reported separately",
        reasonIds: [
          ...physicalHumanFoodLedger.reasonIds,
          `reason:diagnostic-canonical-adequacy:${band.id}:${Number(time.tick)}` as ReasonId,
        ].slice(-16),
      }
    : physicalHumanFoodLedger;
  const adjustedReachableSupport = humanFoodLedger.totalUsableSupport;
  const rawSupportRatio = adjustedReachableSupport / adultEquivalentDemand;
  const clampedSupportRatio = clamp01(rawSupportRatio);
  const surplusDeficit = adjustedReachableSupport - demand.adultEquivalentDemand;
  const deficitRatio = clamp01(-surplusDeficit / adultEquivalentDemand);
  const sharedPressurePenalty = rawReachableSupport <= 0
    ? 0
    : clamp01(1 - sharedReachableSupport / rawReachableSupport);
  const localUsePenaltyMean = yieldCount === 0 ? 0 : clamp01(localUseSum / yieldCount);
  const supportClampReason =
    rawSupportRatio > 1.05
      ? "raw_support_surplus_hidden_by_clamp"
      : rawSupportRatio < 0.95
        ? "raw_support_deficit_hidden_by_clamp"
        : undefined;
  const resourceClassContributions = [...resourceClassEffectTotals.values()]
    .sort((left, right) =>
      right.pressureLoss === left.pressureLoss
        ? String(left.classId).localeCompare(String(right.classId))
        : right.pressureLoss - left.pressureLoss,
    )
    .slice(0, 8);
  const ecologicalStressCauses = deriveEcologicalStressCauses(time, band.id, {
    deficitRatio,
    sharedPressurePenalty,
    footprintDepletionPenalty: yieldCount === 0 ? 0 : wearSum / yieldCount,
    resourceClassPressureLoss,
    waterAccess: currentRecord.observedWaterAccess ?? 0.35,
    seasonalYield: seasonalEffectiveYield.effectiveYield,
    nomadicScalePressure: nomadicScalePressure.nomadicScalePressure,
    logisticalInefficiency: nomadicScalePressure.logisticalInefficiencyPenalty,
    realizedLearnedSupportDelta,
    resourceKnowledgeCount: band.resourceKnowledgeState?.patchMemories.length ?? 0,
    fallbackReliance: getFallbackFoodReliance(resourceClassContributions),
    chronicReturnDecline: band.returnTrend?.chronicDecline ?? false,
  });

  // Range saturation v1: demand vs supportable capacity, with diversity/recovery
  // letting rich cores hold more before degrading (IFD-style). Shared-catchment
  // pressure lowers supportable capacity, so a crowded shared zone saturates sooner.
  // (M0.11: computed BEFORE the per-capita value so sustained over-capacity can
  // feed the effective return below.)
  // Supportable human capacity follows physically returned usable food. Generic
  // catchment yield remains a non-food ecological projection.
  const supportableCapacity = Math.max(1, adjustedReachableSupport * (0.9 + recoveryBuffer * 0.2));
  const saturation = round2(
    clamp(input.localPopulationEstimate / supportableCapacity, 0, 2.5),
  );

  // M0.11 — Shared-catchment saturation → effective per-capita return.
  // The M0.10 audit showed the "infinite food battery": bands at saturation 1.5+
  // (local population well past shared supportable capacity) still read perCapita
  // ~0.92 because any support ≥ own demand clamps to 1, and fission keeps every
  // band's own demand below its private share forever. The one signal that SEES
  // the multi-band pile-up — saturation (radius-4 population over shared-divided
  // capacity) — fed nothing economic. Here, saturation sustained ABOVE capacity
  // (>1 for at least two consecutive derivations — min with the band's own prior
  // value, so one passing band never bites) reduces the effective return:
  // bounded (≤ 0.5), recoverable the moment local population drops (pure per-tick
  // derivation, no stored stock), deterministic, based only on actual presence
  // and overlap — never truth richness. Existing fission/colonization machinery
  // responds to the lower return on its own; no movement logic is touched.
  const priorSaturation = band.rangeSaturation?.saturation ?? saturation;
  const sustainedOverCapacity = clamp(Math.min(saturation, priorSaturation) - 1, 0, 1.5);
  const saturationPenalty = round2(Math.min(0.5, sustainedOverCapacity * 0.45));

  // Processing and transport losses are already charged on each physical receipt.
  // Keep the projected catchment drag for Technical context, but never charge it
  // a second time against canonical usable support.
  const processingLaborDrag = yieldCount === 0 ? 0 : clamp01(processingDragSum / yieldCount);
  const perCapitaValue = clampedSupportRatio;

  const supportDebug: SupportRatioBreakdown = {
    rawReachableSupport: round2(rawReachableSupport),
    sharedReachableSupport: round2(sharedReachableSupport),
    adjustedReachableSupport: round2(adjustedReachableSupport),
    adultEquivalentDemand: round2(demand.adultEquivalentDemand),
    rawSupportRatio: round2(rawSupportRatio),
    clampedSupportRatio: round2(clampedSupportRatio),
    surplusDeficit: round2(surplusDeficit),
    deficitRatio: round2(deficitRatio),
    sharedPressurePenalty: round2(sharedPressurePenalty),
    localUsePenalty: round2(localUsePenaltyMean),
    // M0.14: mean realized yield share LOST to persistent depletion across the
    // band's footprint (0 = pristine range).
    footprintDepletionPenalty: round2(yieldCount === 0 ? 0 : wearSum / yieldCount),
    accessibilityPenalty: round2(travelCost),
    resourceClassPressureLoss: round2(resourceClassPressureLoss),
    pressureByResourceClass: resourceClassContributions,
    resourceClassContributions,
    sharedPressureLoss: round2(sharedPressureLossSum),
    depletionLoss: round2(depletionLossSum),
    accessCostLoss: 0,
    nomadicScaleLoss: round2(preliminarySupportFloor - projectedCatchmentSupport),
    seasonalLoss: round2(Math.max(0, realizedCatchmentTileCount * TILE_SUPPORT - rawReachableSupport - depletionLossSum)),
    crowdingLoss: round2(sharedPressureLossSum),
    faunaSupportLoss: round2(faunaSupportLossSum),
    animalSupportRaw: round2(humanFoodLedger.physicalFaunaHarvest),
    aquaticSupportRaw: round2(humanFoodLedger.aquaticHarvest),
    faunaCoveredTiles: faunaCoveredTileCount,
    plantSupportLoss: round2(plantSupportLossSum),
    plantSupportRaw: round2(humanFoodLedger.physicalPlantHarvest),
    plantCoveredTiles: plantCoveredTileCount,
    processingLaborDrag: round2(yieldCount === 0 ? 0 : processingDragSum / yieldCount),
    ...(supportClampReason === undefined ? {} : { supportClampReason }),
    ecologicalStressCauses,
    nomadicScalePressure,
    overlappingBandIds,
    realizedCatchmentTileCount,
    // 2K.9 — band-specific learned usable-support (decision-side outputs already shipped in 2K.7/2K.8;
    // this is the first REALIZED contribution). Capped/damped/anti-omniscient; never tile-truth.
    realizedLearnedSupportDelta,
    realizedLearnedSupportCapApplied,
    realizedLearnedSupportSourceClasses: [...learnedSupportClasses].sort(),
    realizedLearnedSupportBlockedReasons: [...learnedSupportBlocked].sort(),
    candidateProjectedLearnedSupportDelta,
    noTruthRichnessLeak: true,
    humanFoodLedger,
    reasonIds: makeSupportDebugReasonIds(time, band.id, {
      sharedPressurePenalty,
      rawSupportRatio,
      surplusDeficit,
      overlapCount: overlappingBandIds.length,
      resourceClassPressureLoss,
      nomadicScalePressure: nomadicScalePressure.nomadicScalePressure,
    }),
  };

  const perCapitaReturn: PerCapitaReturnState = {
    bandId: band.id,
    anchorTileId: band.residentialAnchor?.anchorTileId ?? currentTile.id,
    season: time.season,
    populationDemand: round2(demand.adultEquivalentDemand),
    laborCapacity: round2(demand.laborCapacity),
    totalEffectiveYieldWithinRange: round2(clamp01(adjustedReachableSupport / (MAX_CATCHMENT_FOR_YIELD * TILE_SUPPORT))),
    perCapitaReturn: round2(perCapitaValue),
    travelCostToExploitRange: round2(travelCost),
    crowdingPenalty: round2(clamp01(input.nearbyCrowding)),
    riskPenalty: round2(clamp01(input.riskPenalty)),
    nutritionDeficit: round2(clamp01(0.6 - perCapitaValue)),
    sharedCatchmentPressure: round2(sharedPressurePenalty),
    realizedCatchmentTileCount,
    sustainedOverCapacity: round2(sustainedOverCapacity),
    saturationPenalty,
    supportDebug,
    reasonIds: [
      makeReasonId(time, band.id, perCapitaValue < 0.45 ? "per_capita_return_declined" : "seasonal_effective_yield_updated"),
      ...(saturationPenalty > 0.05
        ? [makeReasonId(time, band.id, "saturation_reduced_per_capita_return")]
        : []),
      ...(nomadicScalePressure.logisticalInefficiencyPenalty > 0.04
        ? [makeReasonId(time, band.id, "nomadic_logistics_reduced_per_capita_return")]
        : []),
    ],
  };

  const densityPhase = getDensityPhase(saturation, realizedCatchmentTileCount);

  const populationDemandState: PopulationDemandState = {
    ...demand,
    nutritionDeficit: perCapitaReturn.nutritionDeficit,
  };

  const knownUnusedHabitat = deriveKnownUnusedHabitat(world, band, cache, {
    time,
    biomeCompetence,
    currentPerCapita: perCapitaValue,
    demand: demand.adultEquivalentDemand,
    sustainedOverCapacity,
    nomadicScalePressure: nomadicScalePressure.nomadicScalePressure,
    resourcePressure: resourceClassPressureLoss,
  });

  const daughterColonization = deriveDaughterColonization(world, band, {
    time,
    saturation,
    perCapita: perCapitaValue,
    opportunity: knownUnusedHabitat,
    laborCapacity: demand.laborCapacity,
    riskPenalty: input.riskPenalty,
    sharedPressure: sharedPressurePenalty,
    overlapCount: overlappingBandIds.length,
    nomadicScalePressure: nomadicScalePressure.nomadicScalePressure,
    largeBandFissionPressure: nomadicScalePressure.largeBandFissionPressure,
    // Prior-tick trend (slow-moving): chronic decline lightly raises dispersal
    // pressure so groups respond to a sustained downturn, not one bad season.
    chronicReturnDecline: band.returnTrend?.chronicDecline ?? false,
  });

  const reasonIds: ReasonId[] = [makeReasonId(time, band.id, "range_saturation_detected")];

  // A rich core that is crowded (saturated or over) but whose recovery/diversity
  // keeps per-capita return acceptable is "still viable" — it should NOT read as
  // collapsing. Per-capita return is what distinguishes it from a poor core that
  // genuinely goes over capacity.
  const richCoreStillViable =
    saturation > 0.75 && highRankPersistence > 0.5 && perCapitaValue > 0.45;

  if (richCoreStillViable) {
    reasonIds.push(makeReasonId(time, band.id, "rich_core_still_viable"));

    if (densityPhase === "over_capacity") {
      reasonIds.push(makeReasonId(time, band.id, "high_rank_habitat_persisted"));
    }
  } else if (densityPhase === "over_capacity") {
    reasonIds.push(makeReasonId(time, band.id, "over_capacity_pressure"));
  } else if (densityPhase === "low_density") {
    reasonIds.push(makeReasonId(time, band.id, "low_density_founder_attachment"));
  }

  // Resource Class Framework (2K): decompose the current-tile habitat potential into
  // typed resource classes and populate conservative per-class pressure slots from the
  // band's existing local-use + shared-catchment pressure. Additive debug/substrate —
  // behaviour still consumes seasonalEffectiveYield / perCapitaReturn unchanged.
  const resourceClassSummary = applyResourceClassPressure(
    deriveResourceClassAvailability(basePotential, currentRecord, time),
    {
      localUsePressure: input.localUsePressure,
      sharedCatchmentPressure: perCapitaReturn.sharedCatchmentPressure,
      crowding: input.nearbyCrowding,
    },
  );

  const state: CarryingCapacityState = {
    bandId: band.id,
    baseHabitatPotential: basePotential,
    seasonalEffectiveYield,
    populationDemand: populationDemandState,
    perCapitaReturn,
    knownUnusedHabitat,
    daughterColonization,
    resourceClassSummary,
    nomadicScalePressure,
    ecologicalStressCauses,
    reasonIds,
  };

  return {
    state,
    rangeV1: {
      localPopulationDemand: round2(demand.adultEquivalentDemand),
      localLaborCapacity: round2(demand.laborCapacity),
      totalEffectiveYieldWithinRange: perCapitaReturn.totalEffectiveYieldWithinRange,
      saturation,
      densityPhase,
      recoveryBuffer,
      highRankPersistence,
    },
  };
}

export function derivePopulationDemand(band: Band): PopulationDemandState {
  const demo = band.demography;
  const population = Math.max(0, Math.round(demo.population));
  const dependents = Math.max(0, demo.dependents);
  const adults = Math.max(0, demo.workingAdults);
  const elders = Math.max(0, demo.elders);
  const scaleDemandMultiplier = getNomadicScaleDemandMultiplier(population);
  const baseAdultEquivalentDemand = adults * 1.0 + dependents * 0.65 + elders * 0.85;
  const adultEquivalentDemand = baseAdultEquivalentDemand * scaleDemandMultiplier;
  const fatigue = band.pressureState?.fatiguePressure ?? 0;
  const foodStress = band.pressureState?.foodStress ?? 0;
  const laborCapacity = Math.max(
    0,
    adults * 1.0 + elders * 0.35 - adults * fatigue * 0.2 - adults * foodStress * 0.15 -
      adults * (scaleDemandMultiplier - 1) * 0.18,
  );
  const dependencyLoad = clamp01(population === 0 ? 0 : (dependents + elders) / population);
  const careBurden = clamp01(population === 0 ? 0 : dependents / population);

  return {
    bandId: band.id,
    population,
    adultEquivalentDemand: round2(adultEquivalentDemand),
    laborCapacity: round2(laborCapacity),
    dependencyLoad: round2(dependencyLoad),
    careBurden: round2(careBurden),
    nutritionDeficit: round2(clamp01(foodStress)),
    fertilityPressure: round2(clamp01(demo.fertilityPressure)),
    mortalityPressure: round2(clamp01(demo.mortalityPressure)),
    reasonIds: scaleDemandMultiplier > 1
      ? [`reason:${band.id}:population_demand:nomadic_logistics` as ReasonId]
      : [],
  };
}

function deriveActivitySubsistenceSupplement(
  world: WorldState,
  band: Band,
  time: WorldTime,
  abstractSupportFloor: number,
  adultEquivalentDemand: number,
): ActivitySubsistenceSupplementState | undefined {
  if (world.auditOptions?.activitySubsistenceSupplementEnabled !== true) {
    return undefined;
  }

  const rawByTask = new Map<string, number>();
  let rawGathering = 0;
  let rawHunting = 0;
  let rawFishing = 0;
  let sameDayFoodEligibleShadowNet = 0;
  let delayedFoodTracked = 0;

  for (const trip of band.recentIntraSeasonTrips ?? []) {
    const shadow = trip.shadowSubsistence;
    const isFood = shadow.shadowSupportDomain === "food";
    const isSameDayFood =
      isFood &&
      trip.outcome === "returns_same_day" &&
      shadow.contributesAtBaseSameDay &&
      shadow.shadowNetValue > 0;

    if (!isSameDayFood) {
      if (isFood && shadow.shadowNetValue > 0) {
        delayedFoodTracked += shadow.shadowNetValue;
      }
      continue;
    }

    const weightedNet = shadow.shadowNetValue * shadow.shadowReliability;
    let taskWeightedNet = 0;

    if (
      shadow.shadowReturnKind === "gathered_food_shadow" &&
      (trip.taskGroupType === "plant_gathering_group" || trip.taskGroupType === "local_foraging_group")
    ) {
      taskWeightedNet = weightedNet;
      rawGathering += taskWeightedNet;
    } else if (shadow.shadowReturnKind === "hunted_food_shadow" && trip.taskGroupType === "hunting_group") {
      taskWeightedNet = weightedNet * 0.55;
      rawHunting += taskWeightedNet;
    } else if (shadow.shadowReturnKind === "fish_shadow" && trip.taskGroupType === "fishing_group") {
      taskWeightedNet = weightedNet * 0.8;
      rawFishing += taskWeightedNet;
    }

    if (taskWeightedNet > 0) {
      sameDayFoodEligibleShadowNet += shadow.shadowNetValue;
      rawByTask.set(
        trip.taskGroupType,
        round4((rawByTask.get(trip.taskGroupType) ?? 0) + taskWeightedNet),
      );
    }
  }

  const weightedEligible = rawGathering + rawHunting + rawFishing;
  const proposedSupplement = weightedEligible * ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION;
  const supplementCap = Math.min(
    ACTIVITY_SUBSISTENCE_ABSOLUTE_CAP,
    adultEquivalentDemand * ACTIVITY_SUBSISTENCE_DEMAND_CAP_FRACTION,
  );
  const consumedSupplement = Math.min(proposedSupplement, supplementCap);
  const capScale = proposedSupplement <= 0 ? 0 : consumedSupplement / proposedSupplement;
  const finalSupportWithSupplement = abstractSupportFloor + consumedSupplement;

  return {
    flagEnabled: true,
    supplementFraction: ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION,
    supplementCap: round2(supplementCap),
    abstractSupportFloor: round2(abstractSupportFloor),
    finalSupportWithSupplement: round2(finalSupportWithSupplement),
    activityShadowSameDayFoodEligible: round2(sameDayFoodEligibleShadowNet),
    activityShadowDelayedFoodTracked: round2(delayedFoodTracked),
    supplementFromGathering: round2(rawGathering * ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION * capScale),
    supplementFromHunting: round2(rawHunting * ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION * capScale),
    supplementFromFishing: round2(rawFishing * ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION * capScale),
    supplementFromPlants: 0,
    supplementConsumedByEconomy: true,
    supplementCapApplied: proposedSupplement > supplementCap,
    supplementShareOfFinalSupport: round2(consumedSupplement / Math.max(1, finalSupportWithSupplement)),
    byTaskType: [...rawByTask.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([taskGroupType, shadowNetEligible]) => ({
        taskGroupType: taskGroupType as ActivitySubsistenceSupplementState["byTaskType"][number]["taskGroupType"],
        shadowNetEligible: round2(shadowNetEligible),
        consumedSupport: round2(shadowNetEligible * ACTIVITY_SUBSISTENCE_SUPPLEMENT_FRACTION * capScale),
      })),
    sameDayFoodOnly: true,
    delayedNotConsumed: true,
    waterAndInfoNotConsumed: true,
    plantsZeroed: true,
    noYieldCoupling: true,
    noCarryingCapacityMutation: true,
    noHiddenTruth: true,
    reasonIds: [
      makeReasonId(time, band.id, consumedSupplement > 0
        ? "activity_subsistence_supplement_enabled"
        : "activity_subsistence_supplement_enabled_zero"),
      ...(proposedSupplement > supplementCap
        ? [makeReasonId(time, band.id, "activity_subsistence_supplement_cap_applied")]
        : []),
    ],
  };
}

function deriveKnownUnusedHabitat(
  world: WorldState,
  band: Band,
  cache: TickContextCache | undefined,
  input: {
    readonly time: WorldTime;
    readonly biomeCompetence: number;
    readonly currentPerCapita: number;
    readonly demand: number;
    readonly sustainedOverCapacity: number;
    readonly nomadicScalePressure: number;
    readonly resourcePressure: number;
  },
): KnownUnusedHabitatOpportunity | undefined {
  const candidateIds = collectOpportunityCandidates(band, cache, {
    includeSideCountryCandidates: world.auditOptions?.daughterColonizationFissionBiasEnabled !== false,
  });

  if (candidateIds.length === 0) {
    return undefined;
  }

  const currentTile = getTile(world, band.position);
  let best: KnownUnusedHabitatOpportunity | undefined;
  let bestScore = -Infinity;

  for (const tileId of candidateIds) {
    const record = band.knowledge.observedTiles[tileId];
    const tile = getTile(world, tileId);

    if (record === undefined || tile === undefined || tile.isAquatic || !isBandPassableDestination(tile)) {
      continue;
    }

    const usePressure = getLocalUsePressureValue(band.usePressure[tileId]);
    const memory = band.placeMemory[tileId];
    const base = deriveBaseHabitatPotential(tileId, record, input.time);
    const yieldState = computeTileYield(world, band, tileId, record, input.time, input.biomeCompetence);
    // Underused = good potential, low local use. Supportable per-capita estimate.
    const expectedPerCapita = clamp01(yieldState.effectiveYield * (1 - usePressure * 0.5));
    const waterReliability = clamp01(record.observedWaterAccess ?? 0.3);
    const distance = currentTile === undefined ? 4 : gridDistance(currentTile.coord, tile.coord);
    const travelCost = clamp01(distance / 12);
    const riskPenalty = clamp01(record.observedRisk ?? 0.3);
    const crowding = usePressure;

    // Only an opportunity if it is meaningfully underused and viable.
    const sideCountryEvidence = getSideCountryOpportunityEvidence(band, tileId);
    const score = base.foragingPotential * 0.4 + waterReliability * 0.24 + (1 - usePressure) * 0.2 -
      travelCost * 0.2 - riskPenalty * 0.18;

    if (score <= bestScore) {
      continue;
    }

    const { kind, basis } = classifyOpportunity(band, tileId, memory, record, sideCountryEvidence > 0);
    const confidence = clamp01(record.confidence * 0.8 + 0.1);
    // M0.13: under sustained over-capacity, equal-or-slightly-poorer KNOWN land
    // becomes competitive — less competition is itself worth something. The
    // comparison margin relaxes from +0.08 down to −0.05 (saturation-gated,
    // bounded, never truth-based, and only for candidates that already pass
    // the water/risk checks below).
    const sideCountryMarginRelaxation =
      sideCountryEvidence > 0 && waterReliability > 0.36 && riskPenalty < 0.48
        ? Math.min(0.1, 0.04 + sideCountryEvidence * 0.06 + input.sustainedOverCapacity * 0.08)
        : 0;
    const pressureMarginRelaxation = Math.min(
      0.12,
      input.nomadicScalePressure * 0.08 + input.resourcePressure * 0.08,
    );
    const competitionMargin =
      0.08 -
      Math.min(0.13, input.sustainedOverCapacity * 0.2) -
      sideCountryMarginRelaxation -
      pressureMarginRelaxation;
    const consideredAsTarget = expectedPerCapita > input.currentPerCapita + competitionMargin && waterReliability > 0.32 && riskPenalty < 0.55;
    const rejectionReason = consideredAsTarget
      ? undefined
      : waterReliability <= 0.32
        ? "insufficient_water_reliability"
        : riskPenalty >= 0.55
          ? "risk_too_high"
          : confidence < 0.3
            ? "low_confidence"
            : "not_better_than_current";
    const suspiciousOpportunityIgnored =
      !consideredAsTarget &&
      expectedPerCapita > input.currentPerCapita + 0.12 &&
      waterReliability > 0.4 &&
      riskPenalty < 0.4 &&
      usePressure < 0.3;

    bestScore = score;
    best = {
      bandId: band.id,
      candidateTileId: tileId,
      opportunityKind: kind,
      baseHabitatPotential: base.foragingPotential,
      expectedEffectiveYield: yieldState.effectiveYield,
      expectedPerCapitaReturn: round2(expectedPerCapita),
      currentUsePressure: round2(usePressure),
      currentCrowding: round2(crowding),
      waterReliability: round2(waterReliability),
      travelCost: round2(travelCost),
      riskPenalty: round2(riskPenalty),
      confidence: round2(confidence),
      consideredAsTarget,
      rejectionReason,
      competitionMarginRelaxed: round2(0.08 - competitionMargin),
      suspiciousOpportunityIgnored,
      basis,
      reasonIds: [makeReasonId(input.time, band.id, consideredAsTarget ? "known_unused_habitat_detected" : rejectionReasonId(rejectionReason))],
    };
  }

  return best;
}

function deriveDaughterColonization(
  world: WorldState,
  band: Band,
  input: {
    readonly time: WorldTime;
    readonly saturation: number;
    readonly perCapita: number;
    readonly opportunity: KnownUnusedHabitatOpportunity | undefined;
    readonly laborCapacity: number;
    readonly riskPenalty: number;
    readonly sharedPressure: number;
    readonly overlapCount: number;
    readonly nomadicScalePressure: number;
    readonly largeBandFissionPressure: number;
    readonly chronicReturnDecline: boolean;
  },
): DaughterColonizationPressure {
  const parentRangeSaturation = clamp01(input.saturation);
  const currentPerCapitaStress = clamp01(0.6 - input.perCapita);
  const opportunityScore = input.opportunity === undefined
    ? 0
    : clamp01(input.opportunity.expectedPerCapitaReturn * input.opportunity.confidence);
  const daughterRiskTolerance = clamp01(0.35 + Math.min(1, input.laborCapacity / 22) * 0.4);
  const parentAttachmentPenalty = clamp01(band.placeMemory[band.position]?.attachment ?? 0.3);
  const travelRiskPenalty = clamp01((input.opportunity?.travelCost ?? 0.3) * 0.6 + input.riskPenalty * 0.4);
  // Crowded shared catchments push daughters/scouts toward less-contested range —
  // a light additive term (2J.1), so overlap creates believable dispersal pressure
  // without overwhelming the existing saturation/opportunity drivers.
  const sharedSaturationPressure = clamp01(input.sharedPressure);
  const chronicDeclineBoost = input.chronicReturnDecline ? 0.08 : 0;
  const resourcePressureBoost = clamp01(input.nomadicScalePressure * 0.18);
  const largeBandFissionBoost = clamp01(input.largeBandFissionPressure * 0.2);

  const pressure = clamp01(
    parentRangeSaturation * 0.35 +
      currentPerCapitaStress * 0.25 +
      opportunityScore * 0.25 +
      daughterRiskTolerance * 0.1 +
      sharedSaturationPressure * 0.12 +
      resourcePressureBoost +
      largeBandFissionBoost +
      chronicDeclineBoost -
      parentAttachmentPenalty * 0.2 -
      travelRiskPenalty * 0.2,
  );

  const lowLabor = input.laborCapacity < 10;
  const recommendedAction = getColonizationAction({
    pressure,
    opportunity: input.opportunity,
    lowLabor,
    parentRangeSaturation,
    perCapita: input.perCapita,
  });

  const reasonIds: ReasonId[] = [];

  if (pressure > 0.4) {
    reasonIds.push(makeReasonId(input.time, band.id, "daughter_colonization_pressure_increased"));
  }

  if (input.overlapCount > 0 && sharedSaturationPressure > 0.1 && pressure > 0.32) {
    reasonIds.push(makeReasonId(input.time, band.id, "daughter_pressure_from_shared_saturation"));
  }

  if ((input.nomadicScalePressure > 0.18 || input.largeBandFissionPressure > 0.28) && pressure > 0.32) {
    reasonIds.push(makeReasonId(input.time, band.id, "daughter_pressure_from_nomadic_scale"));
  }

  if (recommendedAction === "scout" || recommendedAction === "probe") {
    reasonIds.push(makeReasonId(input.time, band.id, "daughter_colonization_probe_selected"));
  } else if (lowLabor && pressure > 0.4) {
    reasonIds.push(makeReasonId(input.time, band.id, "daughter_colonization_rejected_low_labor"));
  } else if (input.perCapita > 0.6 && parentRangeSaturation < 0.6) {
    reasonIds.push(makeReasonId(input.time, band.id, "daughter_colonization_rejected_parent_core_viable"));
  }

  return {
    bandId: band.id,
    parentBandId: band.parentBandId,
    pressure: round2(pressure),
    parentRangeSaturation: round2(parentRangeSaturation),
    currentPerCapitaStress: round2(currentPerCapitaStress),
    bestKnownUnusedHabitatOpportunity: input.opportunity,
    daughterRiskTolerance: round2(daughterRiskTolerance),
    parentAttachmentPenalty: round2(parentAttachmentPenalty),
    travelRiskPenalty: round2(travelRiskPenalty),
    recommendedAction,
    reasonIds,
  };
}

function getColonizationAction(input: {
  readonly pressure: number;
  readonly opportunity: KnownUnusedHabitatOpportunity | undefined;
  readonly lowLabor: boolean;
  readonly parentRangeSaturation: number;
  readonly perCapita: number;
}): DaughterColonizationAction {
  if (input.lowLabor) {
    return input.pressure > 0.55 ? "return_or_absorb" : "none";
  }

  if (input.opportunity === undefined || input.pressure < 0.32) {
    return "none";
  }

  if (input.opportunity.consideredAsTarget && input.pressure > 0.62 && input.parentRangeSaturation > 0.75) {
    return "fission_toward_opportunity";
  }

  if (input.opportunity.consideredAsTarget && input.pressure > 0.5) {
    return "seek_new_range";
  }

  if (input.opportunity.confidence < 0.5) {
    return "scout";
  }

  return "probe";
}

function computeTileYield(
  world: WorldState,
  band: Band,
  tileId: TileId,
  record: KnownTileRecord,
  time: WorldTime,
  biomeCompetence: number,
): SeasonalEffectiveYield {
  const base = deriveBaseHabitatPotential(tileId, record, time);
  const usePressureRecord = band.usePressure[tileId];

  return deriveSeasonalEffectiveYield(base, record, time, {
    localUsePressure: getLocalUsePressureValue(usePressureRecord),
    crowding: 0,
    biomeCompetence,
    consecutiveUse: usePressureRecord?.consecutiveUseTicks ?? 0,
    recoveryProgress: usePressureRecord?.recoveryProgress ?? 0.4,
  });
}


function collectOpportunityCandidates(
  band: Band,
  cache: TickContextCache | undefined,
  options?: { readonly includeSideCountryCandidates?: boolean },
): readonly TileId[] {
  const candidates = new Set<TileId>();
  const sideCountryCandidates =
    options?.includeSideCountryCandidates === true ? collectSideCountryOpportunityCandidates(band) : [];
  const salient = getSalientMemorySummary(cache, band.id);

  if (salient !== undefined) {
    for (const tileId of salient.knownOpportunityCandidateIds) {
      candidates.add(tileId);
    }

    for (const tileId of salient.topReturnPlaceIds) {
      candidates.add(tileId);
    }

    for (const tileId of salient.salientInheritedMemoryIds) {
      candidates.add(tileId);
    }

    for (const tileId of salient.knownFrontierTileIds) {
      candidates.add(tileId);
    }
  }

  candidates.delete(band.position);

  return [...new Set<TileId>([...sideCountryCandidates, ...candidates])]
    .filter((tileId) => tileId !== band.position)
    .slice(0, MAX_OPPORTUNITY_CANDIDATES);
}

function collectSideCountryOpportunityCandidates(band: Band): readonly TileId[] {
  return (band.resourceKnowledgeState?.patchMemories ?? [])
    .filter((memory) => {
      const sideProbeEvidence = memory.reasonIds.some((reasonId) => String(reasonId).includes("side_country"));
      const enoughEvidence =
        memory.confidence.presenceConfidence >= 0.36 &&
        memory.confidence.accessConfidence >= 0.3 &&
        memory.confidence.safetyConfidence >= 0.28;

      return sideProbeEvidence && enoughEvidence;
    })
    .sort((left, right) =>
      right.confidence.presenceConfidence === left.confidence.presenceConfidence
        ? String(left.approximateTile).localeCompare(String(right.approximateTile))
        : right.confidence.presenceConfidence - left.confidence.presenceConfidence,
    )
    .map((memory) => memory.approximateTile)
    .slice(0, 6);
}

function getSideCountryOpportunityEvidence(band: Band, tileId: TileId): number {
  const best =
    (band.resourceKnowledgeState?.patchMemories ?? [])
      .filter((memory) => memory.approximateTile === tileId || memory.linkedTiles.includes(tileId))
      .filter((memory) => memory.reasonIds.some((reasonId) => String(reasonId).includes("side_country")))
      .map((memory) =>
        clamp01(
          memory.confidence.presenceConfidence * 0.36 +
            memory.confidence.accessConfidence * 0.32 +
            memory.confidence.safetyConfidence * 0.24 +
            (memory.source === "direct" ? 0.08 : 0),
        ),
      )
      .sort((left, right) => right - left)[0] ?? 0;

  return round2(best);
}

function classifyOpportunity(
  band: Band,
  tileId: TileId,
  memory: Band["placeMemory"][TileId] | undefined,
  record: KnownTileRecord,
  hasSideCountryEvidence = false,
): { kind: KnownUnusedHabitatKind; basis: readonly KnownUnusedHabitatBasis[] } {
  const basis: KnownUnusedHabitatBasis[] = [];
  let kind: KnownUnusedHabitatKind = "known_unused";

  if (record.knowledgeSource === "personally_observed") {
    basis.push("personally_observed");
  } else if (record.knowledgeSource === "inherited_memory" || record.knowledgeSource === "inherited_rumor") {
    basis.push("inherited_memory");
    kind = "inherited_hint";
  }

  if (memory !== undefined) {
    basis.push("remembered_place");
    kind = "remembered_underused";
  }

  if (band.seasonalRound?.phaseRecords.some((phase) => phase.associatedTileIds.includes(tileId)) === true) {
    basis.push("seasonal_round_memory");
  }

  if (hasSideCountryEvidence) {
    basis.push("scout_probe_result");
    kind = "scouted_viable";
  }

  if (basis.length === 0) {
    basis.push("personally_observed");
  }

  return { kind, basis };
}

function getBiomeCompetence(band: Band): number {
  const biome = band.biomeAdaptation.currentBiomeKind;

  if (biome === undefined) {
    return 0.5;
  }

  return clamp01(band.biomeAdaptation.records[biome]?.competence ?? 0.5);
}

function getDensityPhase(saturation: number, realizedCatchmentTileCount: number): DensityPhase {
  if (saturation < 0.4) {
    // A tiny realized catchment is a sparse FOUNDER range, not a comfortable
    // low-density one — avoid the misleading "low_density" label (2J.1).
    return realizedCatchmentTileCount < 3 ? "founder_sparse_range" : "low_density";
  }

  if (saturation < 0.75) {
    return "stable_use";
  }

  if (saturation < 1) {
    return "saturated";
  }

  return "over_capacity";
}

// Reason ids that make the raw vs clamped support situation legible: whether shared
// catchment overlap is degrading support, and whether the clamp is hiding a real
// surplus or deficit (2J.1, requirement 2).
function makeSupportDebugReasonIds(
  time: WorldTime,
  bandId: string,
  input: {
    readonly sharedPressurePenalty: number;
    readonly rawSupportRatio: number;
    readonly surplusDeficit: number;
    readonly overlapCount: number;
    readonly resourceClassPressureLoss: number;
    readonly nomadicScalePressure: number;
  },
): ReasonId[] {
  const reasonIds: ReasonId[] = [];

  reasonIds.push(
    makeReasonId(
      time,
      bandId,
      input.overlapCount > 0 && input.sharedPressurePenalty > 0.05
        ? "shared_catchment_pressure"
        : "private_catchment_no_overlap",
    ),
  );

  if (input.rawSupportRatio > 1.05) {
    reasonIds.push(makeReasonId(time, bandId, "raw_support_surplus_hidden_by_clamp"));
  } else if (input.surplusDeficit < 0) {
    reasonIds.push(makeReasonId(time, bandId, "raw_support_deficit_hidden_by_clamp"));
  }

  if (input.resourceClassPressureLoss > 0.07) {
    reasonIds.push(makeReasonId(time, bandId, "resource_class_pressure_reduced_support"));
  }

  if (input.nomadicScalePressure > 0.18) {
    reasonIds.push(makeReasonId(time, bandId, "nomadic_scale_pressure_reduced_support"));
  }

  return reasonIds;
}

function accumulateResourceClassEffects(
  totals: Map<ResourceClassId, ResourceClassPressureEffect>,
  effects: readonly ResourceClassPressureEffect[],
): void {
  for (const effect of effects) {
    const previous = totals.get(effect.classId);

    if (previous === undefined) {
      totals.set(effect.classId, effect);
      continue;
    }

    totals.set(effect.classId, {
      ...effect,
      supportContribution: round2(previous.supportContribution + effect.supportContribution),
      pressure: round2(Math.max(previous.pressure, effect.pressure)),
      pressureLoss: round2(previous.pressureLoss + effect.pressureLoss),
      reliability: round2((previous.reliability + effect.reliability) / 2),
    });
  }
}

function getFallbackFoodReliance(effects: readonly ResourceClassPressureEffect[]): number {
  const totalFood = effects
    .filter((effect) => effect.domain === "food")
    .reduce((sum, effect) => sum + effect.supportContribution, 0);
  const fallback = effects.find((effect) => effect.classId === "fallback_food")?.supportContribution ?? 0;

  return totalFood <= 0 ? 0 : clamp01(fallback / totalFood);
}

function deriveEcologicalStressCauses(
  time: WorldTime,
  bandId: BandId,
  input: {
    readonly deficitRatio: number;
    readonly sharedPressurePenalty: number;
    readonly footprintDepletionPenalty: number;
    readonly resourceClassPressureLoss: number;
    readonly waterAccess: number;
    readonly seasonalYield: number;
    readonly nomadicScalePressure: number;
    readonly logisticalInefficiency: number;
    readonly realizedLearnedSupportDelta: number;
    readonly resourceKnowledgeCount: number;
    readonly fallbackReliance: number;
    readonly chronicReturnDecline: boolean;
  },
): EcologyStressCauseSummary {
  const unknownResourceUncertainty = input.resourceKnowledgeCount === 0 && input.deficitRatio > 0.08
    ? clamp01(0.22 + input.deficitRatio * 0.42)
    : 0;
  const staleResourceMemory = input.realizedLearnedSupportDelta <= 0 && input.resourceKnowledgeCount > 0 && input.deficitRatio > 0.06
    ? clamp01(0.12 + input.deficitRatio * 0.3)
    : 0;
  const reasonIds: ReasonId[] = [];

  if (input.deficitRatio > 0.05) {
    reasonIds.push(makeReasonId(time, bandId, "food_deficit"));
  }

  if (input.sharedPressurePenalty > 0.08) {
    reasonIds.push(makeReasonId(time, bandId, "shared_catchment_crowding"));
  }

  if (input.footprintDepletionPenalty > 0.05 || input.resourceClassPressureLoss > 0.06) {
    reasonIds.push(makeReasonId(time, bandId, "resource_depletion"));
  }

  if (input.nomadicScalePressure > 0.18) {
    reasonIds.push(makeReasonId(time, bandId, "nomadic_scale_pressure"));
  }

  return {
    foodDeficit: round2(input.deficitRatio),
    sharedCatchmentCrowding: round2(input.sharedPressurePenalty),
    resourceDepletion: round2(clamp01(input.footprintDepletionPenalty * 0.58 + input.resourceClassPressureLoss * 0.42)),
    poorReturnTrend: input.chronicReturnDecline ? 0.72 : 0,
    waterAccessPressure: round2(clamp01(0.42 - input.waterAccess)),
    seasonalScarcity: round2(clamp01(0.42 - input.seasonalYield)),
    nomadicScalePressure: round2(input.nomadicScalePressure),
    logisticalInefficiency: round2(input.logisticalInefficiency),
    unknownResourceUncertainty: round2(unknownResourceUncertainty),
    staleResourceMemory: round2(staleResourceMemory),
    fallbackFoodReliance: round2(input.fallbackReliance),
    poisoningFutureHook: 0,
    badWaterFutureHook: 0,
    predatorDangerFutureHook: 0,
    huntingInjuryFutureHook: 0,
    diseaseFutureHook: 0,
    storageFailureFutureHook: 0,
    reasonIds,
  };
}

function rejectionReasonId(reason: string | undefined): string {
  switch (reason) {
    case "risk_too_high":
      return "known_unused_habitat_rejected_risk";
    case "insufficient_water_reliability":
      return "known_unused_habitat_rejected_water";
    case "low_confidence":
      return "known_unused_habitat_rejected_low_confidence";
    default:
      return "known_unused_habitat_detected";
  }
}

function gridDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function makeReasonId(time: WorldTime, bandId: string, suffix: string): ReasonId {
  return `reason:${bandId}:${time.tick}:carrying:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
