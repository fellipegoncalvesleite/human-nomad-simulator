import type {
  BandId,
  Coord,
  DayNumber,
  DecisionId,
  EventId,
  ReasonId,
  ResourcePatchId,
  RiverId,
  RouteId,
  Season,
  SettlementId,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import type { KnowledgeSourceKind, KnowledgeState } from "../knowledge/types";
import type {
  ResourceClassAvailabilitySummary,
  ResourceClassId,
  ResourceClassPressureEffect,
} from "./resourceClasses";
import type { ResourceKnowledgeState, ResourceKnowledgeStateKind } from "./resourceKnowledge";
import type { BandMobilityState } from "./bandMobility";
import type { ResourceEcologyBandState, ResourceEcologyClassId } from "./resourceEcologyFoundation";
import type { TemporaryWatercraftAssessment } from "./storageSuitability";
import type { VisibleNatureState } from "./visibleNature";
import type { ProbeRecencyMemory } from "./probeMemory";
import type { ResourceScoutDebug, ScoutLearningRingEntry } from "./resourceScout";
import type { PlantUseTestEvent, PlantUseTestRingEntry } from "./plantUseTesting";
import type {
  PlantAbundanceTrend,
  PlantClassId,
  PlantFallbackRole,
  PlantLifecycleState,
  PlantPatchAvailability,
  PlantSafetyRisk,
} from "./plantPatches";
import type { FaunaHabitatType, FaunaStockKind } from "./faunaStock";
import type { AnimalPatternKnowledgeState, ProtoAnimalManagementState } from "./animalLearning";
import type { CauseSpecificEvent, CauseSpecificEventRingEntry } from "./causeSpecificEvent";
import type { ExploitationSkillState } from "./exploitationSkill";
import type {
  Action,
  MobilityIntent,
  MobilityIntentKind,
  NormalizedIntensity,
  Reason,
} from "../rules/types";
import type { BiomeKind, RiverCrossingClass } from "../world/types";

export type BandStatus =
  | "foraging"
  | "camped"
  | "moving"
  | "splitting"
  | "settled"
  | "stressed"
  | "dispersed";

export type MobilityStrategy =
  | "high_mobility"
  | "seasonal_round"
  | "logistical_foraging"
  | "tethered_to_place"
  | "sedentary_experiment";

export type SubsistenceMode =
  | "foraging"
  | "aquatic"
  | "wild_grain_collection"
  | "plant_tending"
  | "early_agriculture"
  | "irrigated_agriculture_experiment";

export type TechnologyTag =
  | "basic_foraging"
  | "fishing"
  | "improved_fishing"
  | "plant_tending"
  | "basic_storage"
  | "ceramic_storage"
  | "drying_smoking"
  | "basketry"
  | "irrigation_experiment"
  | "terrace_experiment";

export interface SocialPressureProfile {
  readonly demographicPressure: number;
  readonly fissionPressure: number;
  readonly leadershipStress: number;
  readonly territorialPressure: number;
  readonly stateAvoidancePressure: number;
  readonly cohesionStress: number;
}

export interface HealthProfile {
  readonly diseaseBurden: number;
  readonly nutritionStress: number;
  readonly injuryBurden: number;
  readonly mortalityRisk: number;
}

export interface BiomeCompetenceRecord {
  readonly biomeKind: BiomeKind;
  readonly familiarity: NormalizedIntensity;
  readonly competence: NormalizedIntensity;
  readonly successfulUseTicks: number;
  readonly lastUpdatedAt: WorldTime;
  readonly confidence: NormalizedIntensity;
}

export interface BiomeAdaptationProfile {
  readonly currentBiomeKind?: BiomeKind;
  readonly records: Readonly<Partial<Record<BiomeKind, BiomeCompetenceRecord>>>;
  readonly mismatchStress: NormalizedIntensity;
}

export type InitialSpawnProfileRole =
  | "delta_coastal_foragers"
  | "river_valley_foragers"
  | "lake_wetland_foragers"
  | "highland_edge_foragers"
  | "dry_margin_foragers";

export interface SpawnSiteScoreBreakdown {
  readonly foodValue: number;
  readonly waterValue: number;
  readonly aquaticValue: number;
  readonly movementCostPenalty: number;
  readonly riskPenalty: number;
  readonly terrainMatch: number;
  readonly profileMatch: number;
  readonly finalScore: number;
}

export type SpawnCriterion =
  | "aquatic_resources"
  | "coastal_access"
  | "river_floodplain"
  | "lake_wetland"
  | "seasonal_abundance"
  | "plant_tending_potential"
  | "wild_grain_potential"
  | "low_movement_cost"
  | "mountain_edge"
  | "pass_corridor"
  | "dry_margin_access"
  | "manageable_risk";

export interface InitialSpawnReason {
  readonly profileRole: InitialSpawnProfileRole;
  readonly selectedTileId: TileId;
  readonly criteria: readonly SpawnCriterion[];
  readonly scoreBreakdown: SpawnSiteScoreBreakdown;
}

export type PlaceMemoryValence =
  | "reliable"
  | "risky"
  | "depleted"
  | "seasonally_good"
  | "seasonally_bad"
  | "route_node"
  | "return_place"
  | "avoid_place";

export interface BandMovementRecord {
  readonly tick: TickNumber;
  readonly time: WorldTime;
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly action: Action;
  readonly decisionId: DecisionId;
  readonly intentKind?: MobilityIntentKind;
  readonly primaryReasonId: ReasonId;
  readonly directionVector?: Coord;
}

// RESIDENTIAL-MOVE-1 — a RECORD-ONLY, explanatory account of a residential
// relocation that the seasonal `bandDecision` ALREADY decided. It does NOT create
// or change any movement decision, does NOT move `band.position` daily, and is
// never read by yield/support/carrying-capacity/population/stress/mortality. Its
// only job is to give the existing "season ended, band jumped" relocation a legible
// time-span (start/end day inside the season), passability-aware route, cause, and
// status. Derived deterministically from the decided move; bounded ring per band;
// daughters do NOT inherit a parent's events.
export type ResidentialMoveKind =
  | "residential_relocation"
  | "emergency_water_move"
  | "food_pressure_move"
  | "crowding_pressure_move"
  | "frontier_probe_residential_shift"
  | "daughter_colonization_move"
  | "seasonal_strategy_future";

export type ResidentialMoveCause =
  | "water_stress"
  | "poor_return"
  | "local_pressure"
  | "known_opportunity"
  | "fission_daughter"
  | "frontier_intent"
  | "seasonal_refuge_future"
  | "unknown";

export type ResidentialMoveStatus =
  | "planned"
  | "in_progress_placeholder"
  | "arrived"
  | "delayed_placeholder"
  | "failed_no_route";

export type ResidentialMovementHardshipOutcome =
  | "accepted"
  | "delayed"
  | "diverted"
  | "rejected";

export interface ResidentialMovementIntentOutcomeRecord {
  readonly intentId: string;
  readonly bandId: BandId;
  readonly intentKind: MobilityIntentKind;
  readonly createdAtTick: TickNumber;
  readonly lastUpdatedTick: TickNumber;
  readonly intendedTileId?: TileId;
  readonly selectedTileId?: TileId;
  readonly actualTileId: TileId;
  readonly attempted: boolean;
  readonly executionCount: number;
  readonly delayCount: number;
  readonly outcome?: ResidentialMovementHardshipOutcome;
  readonly lifecycle: "active" | "completed" | "abandoned";
  readonly terminal: boolean;
  readonly reason: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface ResidentialMoveEvent {
  readonly eventId: EventId;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly startDay: DayNumber;
  readonly endDay: DayNumber;
  readonly durationDays: number;
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly pathTiles: readonly TileId[];
  readonly distanceTiles: number;
  readonly moveKind: ResidentialMoveKind;
  readonly cause: ResidentialMoveCause;
  readonly status: ResidentialMoveStatus;
  readonly confidence: number;
  readonly reasonIds: readonly ReasonId[];
  readonly hardshipRisk?: NormalizedIntensity;
  readonly hardshipLevel?: "low" | "moderate" | "high" | "severe";
  readonly hardshipReason?: string;
  readonly hardshipOutcome?: ResidentialMovementHardshipOutcome;
  readonly hardshipCautionModifier?: NormalizedIntensity;
  readonly temporaryWatercraft?: TemporaryWatercraftAssessment;
  // 2K.12: record-only learned-seasonal CONTEXT about the destination tile (e.g. "this
  // place is remembered as reliable water this season"). It is CONTEXT, NOT a cause — the
  // residential-move scorer is NOT biased by seasonal memory in 2K.12, so this never
  // claims to have driven the move. Present only when the reader flag is on AND the band
  // has a relevant learned memory for the destination. Never read by economy/behaviour.
  readonly seasonalMemoryContext?: readonly string[];
  // Hard, structural record-only guards (mirrors IntraSeasonTripRecord). These are
  // literal `true` so the audit can assert them and a future economy coupling would
  // be a type error here, not a silent behaviour change.
  readonly noDailyPositionMutation: true;
  readonly noYieldChange: true;
  readonly noSupportChange: true;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
}

export type IntraSeasonTripCause =
  | "local_resource_use"
  | "water_check"
  | "food_resource_check"
  | "plant_followup_test"
  | "memory_refresh";

export type IntraSeasonTripTaskGroupType =
  | "hunting_group"
  | "fishing_group"
  | "plant_gathering_group"
  | "water_group"
  | "plant_followup_group"
  | "memory_refresh_group"
  | "local_foraging_group";

export type IntraSeasonTripObjective =
  | "local_exploitation"
  | "water_security"
  | "food_patch_check"
  | "plant_followup_testing"
  | "memory_refresh";

// TIME-1C movement taxonomy. These are the *daily task-group* movement classes
// the trip ledger may emit — every one is a same-base excursion that NEVER moves
// the band's residential/home-range marker (`band.position`).
//
// Deliberately distinct, NON-daily processes that this taxonomy does NOT cover and
// the daily layer must never emit (they live in their own mechanics and clocks):
//   - side_country_scout      → a scouting/probe mechanic (future), not a trip
//   - social_visit_future     → neighbouring-camp visiting (future)
//   - residential_relocation  → seasonal `bandDecision` move, cause-scored, ≤2 tiles
//   - daughter_colonization   → fission placement (`demography.ts`)
//   - seasonal_range_shift / population_front → emergent, season/year/century-scaled
// Conflating any of those with a daily trip is exactly the SPIKE-MOBILITY-1 collapse.
export type IntraSeasonTripMovementType =
  | "local_foraging_loop"
  | "water_trip"
  | "food_patch_trip"
  | "plant_followup_trip"
  | "memory_refresh_trip"
  | "overnight_hunt_or_scout";

// Whether the task group returns to base the same day, stays out a night, or runs a
// multi-day foray. NONE of these relocate the residential marker — a `continues` trip
// is a task group ranging far while the camp stays fixed (the BaYaka multi-day-hunt case).
export type IntraSeasonTripOutcome =
  | "returns_same_day"
  | "overnight"
  | "continues";

export type IntraSeasonTripActivityStatus =
  | "completed_observation";

export type IntraSeasonTripActivityResult =
  | "successful_observation"
  | "target_found"
  | "target_not_found"
  | "partial_success"
  | "failed_due_to_distance"
  | "failed_due_to_water_risk"
  | "failed_due_to_low_memory_confidence"
  | "failed_due_to_season_mismatch"
  | "delayed_return"
  | "abandoned_due_to_risk"
  | "returned_with_information"
  | "no_effect_observed";

export type ActivityReturnResourceKind =
  | "none"
  | "food_observation_only"
  | "gathered_plant_food"
  | "harvested_aquatic_food"
  | "hunted_fauna_food"
  | "gathered_fiber_material"
  | "gathered_fuel_material"
  | "water_information"
  | "plant_information"
  | "route_information";

export type ActivityReturnCategory =
  | "failed_or_none"
  | "physical_food"
  | "physical_material"
  | "observation"
  | "opportunity"
  | "legacy_unresolved"
  | "projection_only";

export type ActivityReturnMaterialDomain =
  | "none"
  | "plant_food"
  | "aquatic_food"
  | "fauna_food"
  | "fiber"
  | "fuel"
  | "water"
  | "information";

export interface ActivityReturnSemantics {
  readonly category: ActivityReturnCategory;
  readonly isPhysical: boolean;
  readonly contributesToNutrition: boolean;
  readonly materialDomain: ActivityReturnMaterialDomain;
}

export interface ActivityResourceReturnRecord {
  readonly returnedResourceKind: ActivityReturnResourceKind;
  readonly semantics: ActivityReturnSemantics;
  readonly estimatedReturnValue: number;
  readonly returnConfidence: number;
  readonly consumedByEconomy: boolean;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityCoupling: boolean;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
  readonly noSupportChange: boolean;
  readonly reasonIds: readonly ReasonId[];
}

// LIVING-ECOLOGY-A — canonical receipt linking one band-known activity target to
// one physical world source. `physicalAvailability` is Technical/debug truth;
// normal decisions never read it. Human support consumes only `usableSupport`.
export type PhysicalFoodSourceKind = "plant_patch" | "fauna_stock" | "aquatic_stock";

export interface PhysicalFoodHarvestRecord {
  readonly sourceKind: PhysicalFoodSourceKind;
  readonly sourceId?: string;
  readonly sourceClass: string;
  readonly knownness: "known_target" | "stale_or_inferred_target";
  readonly attempted: boolean;
  readonly physicalSourceFound: boolean;
  readonly physicalAvailability: number;
  readonly harvestedAmount: number;
  readonly depletionApplied: number;
  readonly transportLoss: number;
  readonly processingLoss: number;
  readonly usableSupport: number;
  readonly failureReason?: "activity_failed" | "physical_source_absent" | "physically_exhausted";
  readonly worldTruthDebugOnly: true;
  readonly reasonIds: readonly ReasonId[];
}

// ACTIVITY-GROUPS-10 — SHADOW subsistence. A normalized, support-LIKE estimate of
// what each activity group's deterministic return would contribute to band
// subsistence IF activity groups fed the band. It is strictly shadow/debug: it is
// never read by yield/support/carrying-capacity/population/stress/fission/relocation,
// and the abstract economy still drives all real behaviour. Not calories — a
// comparison quantity (same 0..~1 scale as per-capita return) so AG10 can audit
// whether daily activity groups could plausibly replace the abstract food system later.
export type ActivityShadowReturnKind =
  | "none"
  | "gathered_food_shadow"
  | "hunted_food_shadow"
  | "fish_shadow"
  | "water_support_shadow"
  | "plant_food_shadow_uncertain"
  | "information_only";

export interface ActivityShadowReturnRecord {
  readonly shadowReturnKind: ActivityShadowReturnKind;
  // Whether this contribution is food (vs water-security support vs pure information).
  readonly shadowSupportDomain: "food" | "water_support" | "information";
  readonly shadowGrossValue: number;
  readonly shadowTravelCost: number;
  readonly shadowRiskPenalty: number;
  readonly shadowNetValue: number;
  // 0..1 dependability of THIS contribution (hunting is high-variance => low even on success).
  readonly shadowReliability: number;
  // Central-place foraging: same-day groups support the base today; overnight/continuing
  // groups only support it AFTER return (still counted, but flagged as delayed).
  readonly contributesAtBaseSameDay: boolean;
  // ECO-SEASON-1: the realized seasonal ecology factor applied to this shadow estimate
  // (1 = season-neutral). It scales the SHADOW gross/reliability only; consumed by the
  // real economy solely through the AG11 supplement path when that flag is ON (OFF by
  // default), exactly as the existing shadow value already was.
  readonly seasonalEcologyModifier: number;
  readonly shadowConsumedByEconomy: false;
  readonly noEconomyCoupling: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface ActivityShadowTaskTypeContribution {
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly count: number;
  readonly grossTotal: number;
  readonly netTotal: number;
}

export interface ActivityShadowReturnKindContribution {
  readonly shadowReturnKind: ActivityShadowReturnKind;
  readonly count: number;
  readonly netTotal: number;
}

export interface ActivityShadowSubsistenceSummary {
  readonly bandId: BandId;
  readonly day: DayNumber;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly recentTripCount: number;
  readonly foodBearingTripCount: number;
  readonly waterSupportTripCount: number;
  readonly informationOnlyTripCount: number;
  readonly noContributionTripCount: number;
  readonly totalShadowGross: number;
  readonly totalShadowNet: number;
  readonly totalFoodShadowNet: number;
  readonly totalWaterSupportShadowNet: number;
  readonly sameDayShadowNet: number;
  readonly delayedShadowNet: number;
  readonly totalShadowTravelCost: number;
  readonly meanFoodTripShadowNet: number;
  readonly meanShadowReliability: number;
  readonly travelCostShareOfGross: number;
  readonly seasonMismatchTripShare: number;
  readonly shadowByTaskType: readonly ActivityShadowTaskTypeContribution[];
  readonly shadowByReturnKind: readonly ActivityShadowReturnKindContribution[];
  readonly peopleAssignedEstimate: number;
  readonly peopleAtResidentialCenterEstimate: number;
  // Current ABSTRACT economy values, for comparison ONLY (read, never written by shadow).
  readonly currentAbstractPerCapitaReturn: number;
  readonly currentAbstractAdjustedSupport: number;
  readonly currentAbstractDemand: number;
  // Heuristic: mean food-trip shadow net / current abstract per-capita return. Both are
  // normalized per-capita-like magnitudes, so a ratio near 1 means a typical successful
  // activity-group return is comparable to the abstract per-capita support the economy
  // currently assumes. Undefined-safe via shadowSupportComparable.
  readonly shadowVsCurrentSupportRatio: number;
  readonly shadowSupportComparable: boolean;
  readonly shadowConsumedByEconomy: false;
  readonly noEconomyCoupling: true;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityCoupling: true;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
  readonly noSupportChange: true;
}

export interface ActivitySubsistenceSupplementTaskContribution {
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly shadowNetEligible: number;
  readonly consumedSupport: number;
}

export interface ActivitySubsistenceSupplementState {
  readonly flagEnabled: true;
  readonly supplementFraction: number;
  readonly supplementCap: number;
  readonly abstractSupportFloor: number;
  readonly finalSupportWithSupplement: number;
  readonly activityShadowSameDayFoodEligible: number;
  readonly activityShadowDelayedFoodTracked: number;
  readonly supplementFromGathering: number;
  readonly supplementFromHunting: number;
  readonly supplementFromFishing: number;
  readonly supplementFromPlants: number;
  readonly supplementConsumedByEconomy: true;
  readonly supplementCapApplied: boolean;
  readonly supplementShareOfFinalSupport: number;
  readonly byTaskType: readonly ActivitySubsistenceSupplementTaskContribution[];
  readonly sameDayFoodOnly: true;
  readonly delayedNotConsumed: true;
  readonly waterAndInfoNotConsumed: true;
  readonly plantsZeroed: true;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityMutation: true;
  readonly noHiddenTruth: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface ActivityOutcomeTypeCount {
  readonly outcome: IntraSeasonTripActivityResult;
  readonly count: number;
}

export interface ActivityOutcomeTaskTypeCount {
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly outcome: IntraSeasonTripActivityResult;
  readonly count: number;
}

export interface ActivityReturnResourceKindCount {
  readonly returnedResourceKind: ActivityReturnResourceKind;
  readonly count: number;
  readonly estimatedReturnValueTotal: number;
}

export interface ActivityOutcomeSummary {
  readonly bandId: BandId;
  readonly day: DayNumber;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly outcomesByType: readonly ActivityOutcomeTypeCount[];
  readonly outcomesByTaskType: readonly ActivityOutcomeTaskTypeCount[];
  readonly returnsByResourceKind: readonly ActivityReturnResourceKindCount[];
  readonly successCount: number;
  readonly partialCount: number;
  readonly failedCount: number;
  readonly informationCount: number;
  readonly noEffectCount: number;
  readonly maxEstimatedReturnValue: number;
  readonly consumedByEconomy: boolean;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityCoupling: boolean;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
  readonly noSupportChange: boolean;
}

export type ActivityMemoryEffectType =
  | "none"
  | "confidence_refreshed"
  | "confidence_lowered"
  | "seasonality_hint_added"
  | "risk_suspicion_added"
  | "water_reliability_refreshed"
  | "plant_caution_refreshed"
  | "route_memory_refreshed"
  | "repeated_use_counter_incremented_placeholder";

export type ActivityMemoryConfidenceChannel =
  | "presenceConfidence"
  | "seasonConfidence"
  | "yieldConfidence"
  | "safetyConfidence"
  | "processingConfidence"
  | "accessConfidence"
  | "recoveryConfidence";

export interface ActivityMemoryConfidenceSnapshot {
  readonly presenceConfidence: number;
  readonly seasonConfidence: number;
  readonly yieldConfidence: number;
  readonly safetyConfidence: number;
  readonly processingConfidence: number;
  readonly accessConfidence: number;
  readonly recoveryConfidence: number;
}

export interface ActivityMemoryEffectRecord {
  readonly sourceBandId: BandId;
  readonly sourceTripDay: DayNumber;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly targetTileId: TileId;
  readonly patchId?: ResourcePatchId;
  readonly resourceClassId?: ResourceClassId;
  readonly activityOutcome: IntraSeasonTripActivityResult;
  readonly effectType: ActivityMemoryEffectType;
  readonly effectSummary: string;
  readonly confidenceBefore?: ActivityMemoryConfidenceSnapshot;
  readonly confidenceAfter?: ActivityMemoryConfidenceSnapshot;
  readonly mainConfidenceChannel?: ActivityMemoryConfidenceChannel;
  readonly confidenceDelta: number;
  readonly reasonIds: readonly ReasonId[];
  readonly noHiddenTruth: true;
  readonly targetKnownMemoryOnly: true;
  readonly noNewResourceDiscovery: true;
  readonly noFoodCoupling: true;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityCoupling: true;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
  readonly noSupportChange: true;
}

export interface ActivityMemoryEffectCount {
  readonly effectType: ActivityMemoryEffectType;
  readonly count: number;
}

export interface ActivityMemoryUpdateSummary {
  readonly bandId: BandId;
  readonly day: DayNumber;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly effectCounts: readonly ActivityMemoryEffectCount[];
  readonly touchedMemoryCount: number;
  readonly confidenceIncreaseTotal: number;
  readonly confidenceDecreaseTotal: number;
  readonly minConfidenceDelta: number;
  readonly maxConfidenceDelta: number;
  readonly latestMemoryEffect?: ActivityMemoryEffectRecord;
  readonly recentMemoryEffects: readonly ActivityMemoryEffectRecord[];
  readonly noHiddenTruth: true;
  readonly targetKnownMemoryOnly: true;
  readonly noNewResourceDiscovery: true;
  readonly noFoodCoupling: true;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityCoupling: true;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
  readonly noSupportChange: true;
}

export type ActivityGroupLaborStatus =
  | "away"
  | "returned"
  | "delayed"
  | "overnight"
  | "continuing";

export type ActivityLaborAllocationConfidence =
  | "estimated_only";

export interface ActivityTypeLaborAllocation {
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly groupCount: number;
  readonly assignedPeopleEstimate: number;
}

export interface ActivityGroupLaborRecord {
  readonly sourceBandId: BandId;
  readonly sourceTripDay: DayNumber;
  readonly sourceTripReasonIds: readonly ReasonId[];
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly groupLabel: string;
  readonly objective: IntraSeasonTripObjective;
  readonly objectiveLabel: string;
  readonly targetTileId: TileId;
  readonly estimatedPeopleCount: number;
  readonly assignedPeopleEstimate: number;
  readonly status: ActivityGroupLaborStatus;
  readonly outcome: IntraSeasonTripOutcome;
  readonly activityResult: IntraSeasonTripActivityResult;
  readonly activityOutcome: IntraSeasonTripActivityResult;
  readonly activityOutcomeSummary: string;
  readonly resourceReturn: ActivityResourceReturnRecord;
  readonly activityMemoryEffect: ActivityMemoryEffectRecord;
}

export interface ActivityLaborSummary {
  readonly bandId: BandId;
  readonly day: DayNumber;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly totalPeople: number;
  readonly workingAdults: number;
  readonly activeActivityGroupCount: number;
  readonly peopleAssignedToActivityGroups: number;
  readonly peopleAwayInActivityGroups: number;
  readonly peopleAtResidentialCenterEstimate: number;
  readonly peopleByActivityType: readonly ActivityTypeLaborAllocation[];
  readonly latestActivityGroupSummary?: ActivityGroupLaborRecord;
  readonly recentActivityGroupSummaries: readonly ActivityGroupLaborRecord[];
  readonly cappedAllocation: boolean;
  readonly impossibleOverAllocationCount: number;
  readonly allocationConfidence: ActivityLaborAllocationConfidence;
  readonly noFoodCoupling: boolean;
  readonly noYieldCoupling: true;
  readonly noCarryingCapacityCoupling: boolean;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
}

// ECO-SEASON-1 — seasonal resource ecology substrate. A deterministic realized
// availability factor for a resource DOMAIN at a tile THIS season, plus what a band
// LEARNS by observing it through activity groups. This is interpretation/memory/
// shadow ONLY: it never mutates support/yield/carrying-capacity/population/stress.
export type SeasonalEcologyDomain =
  | "water_reliability"
  | "local_foraging"
  | "gathering_general"
  | "plant_patch"
  | "fishing"
  | "hunting_game"
  // Future hooks (not computed yet; reserved so later checkpoints don't churn the type):
  | "route_access_future"
  | "dry_season_refuge_future"
  | "wet_season_patch_future";

export type SeasonalEcologyWetDryTendency = "wet" | "dry" | "neutral";

export type SeasonalEcologyTendencyClass =
  | "strong_peak"
  | "peak"
  | "neutral"
  | "lean"
  | "strong_lean";

// Recorded on a trip (debug/observational). `availabilityFactor` is the realized value
// the activity observed; `hiddenTendencyClass` is the underlying patch tendency the band
// does NOT know directly — it only learns through repeated observation.
export interface SeasonalEcologyFactorSummary {
  readonly domain: SeasonalEcologyDomain;
  readonly season: Season;
  readonly availabilityFactor: number;
  readonly baselineFactor: number;
  readonly seasonalDelta: number;
  readonly wetDryTendency: SeasonalEcologyWetDryTendency;
  readonly hiddenTendencyClass: SeasonalEcologyTendencyClass;
  // How the realized season modified the SHADOW interpretation of this activity
  // (never the canonical activityOutcome). "boosted" | "reduced" | "neutral".
  readonly shadowSeasonalResult: "boosted" | "reduced" | "neutral";
  readonly taughtSeasonalHint: boolean;
  readonly driverSummary: string;
  readonly reasonIds: readonly ReasonId[];
}

// Band-level learned seasonal ecology for a tile. SEPARATE from ResourcePatchMemory
// (which the 2K.9 learned-support reader consumes) — nothing in the economy reads this,
// so it cannot affect carrying capacity. Bounded per band; daughters reset on fission.
export interface SeasonalEcologyObservation {
  readonly tileId: TileId;
  readonly domain: SeasonalEcologyDomain;
  readonly observedSeasons: readonly Season[];
  readonly lastObservedSeason: Season;
  readonly lastObservedTick: TickNumber;
  readonly seasonalReliabilityBySeason: Readonly<Partial<Record<Season, number>>>;
  readonly drySeasonConcern: number;
  readonly wetSeasonOpportunity: number;
  readonly repeatedSeasonalSuccessCount: number;
  readonly repeatedSeasonalFailureCount: number;
  readonly reasonIds: readonly ReasonId[];
  readonly noSupportChange: true;
  readonly noCarryingCapacityChange: true;
  readonly noYieldChange: true;
}

export interface IntraSeasonTripRecord {
  readonly day: DayNumber;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly sourceBandId: BandId;
  readonly originTileId: TileId;
  readonly targetTileId: TileId;
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly groupLabel: string;
  readonly estimatedPeopleCount: number;
  readonly objective: IntraSeasonTripObjective;
  readonly objectiveLabel: string;
  readonly startDay: DayNumber;
  readonly endDay: DayNumber;
  readonly activityStatus: IntraSeasonTripActivityStatus;
  readonly distanceTiles: number;
  readonly estimatedDurationDays: number;
  readonly cause: IntraSeasonTripCause;
  readonly movementType: IntraSeasonTripMovementType;
  readonly outcome: IntraSeasonTripOutcome;
  readonly activityResult: IntraSeasonTripActivityResult;
  readonly activityOutcome: IntraSeasonTripActivityResult;
  readonly activityOutcomeReasonIds: readonly ReasonId[];
  readonly activityOutcomeSummary: string;
  readonly resourceReturn: ActivityResourceReturnRecord;
  readonly physicalFoodHarvest?: PhysicalFoodHarvestRecord;
  // ACTIVITY-GROUPS-10: SHADOW subsistence estimate for this trip (never economy-coupled).
  readonly shadowSubsistence: ActivityShadowReturnRecord;
  // ECO-SEASON-1: realized seasonal ecology the activity observed at its target this
  // season (debug/observational; modifies shadow + seasonal memory only).
  readonly seasonalEcology?: SeasonalEcologyFactorSummary;
  readonly plantPatchTrace?: PlantPatchActivityTrace;
  readonly animalActivityTrace?: AnimalActivityTrace;
  readonly aquaticActivityTrace?: AquaticActivityTrace;
  readonly activityMemoryEffect: ActivityMemoryEffectRecord;
  // TIME-1C breadcrumb: the deterministic tile-by-tile outbound route origin→target
  // (inclusive). The trip is logically NOT a teleport even if the UI compresses it —
  // history preserves every crossed tile. Bounded by MAX_TRIP_DISTANCE_TILES + 1.
  readonly pathTiles: readonly TileId[];
  readonly tilesCrossed: number;
  readonly roundTripTiles: number;
  readonly activityDaysRepresented: number;
  readonly resourceClassId?: ResourceClassId;
  readonly resultSummary: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noResidentialRelocation: true;
  readonly noYieldChange: true;
  readonly noStressChange: true;
  readonly noPopulationChange: true;
  readonly noCarryingCapacityChange: true;
  readonly noSupportChange: boolean;
  readonly bandKnownTargetOnly: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPEDITIONARY-LOGISTICAL-MOBILITY-1 — multi-day logistical expedition state.
//
// An expedition is a MORE CAPABLE LIFECYCLE of the same task-group/party system
// that `IntraSeasonTripRecord` already records — not a parallel simulator. A
// same-day trip (<= MAX_TRIP_DISTANCE_TILES) is resolved in one day's reducer by
// intraSeasonTrips; an expedition reaches country BEYOND that daily envelope and
// therefore must physically spend days walking out, working, and walking back.
// It deposits its result through the SAME IntraSeasonTripRecord + the SAME
// canonical food ledger (humanFoodSupport), exactly once, at RETURN.
// ─────────────────────────────────────────────────────────────────────────────

/** What the party is physically going out to do. Only tasks with a real physical outcome system. */
export type ExpeditionTaskKind =
  // Draw a known distant plant patch (physical plant stock).
  | "distant_plant_gathering"
  // Work a known distant fauna stock (physical fauna stock).
  | "distant_hunting"
  // Work a known distant aquatic stock (physical aquatic stock).
  | "distant_fishing"
  // Verify a remembered but stale/uncertain distant patch (information only).
  | "distant_patch_verification"
  // Read a route/crossing toward distant country (information only).
  | "route_reconnaissance";

/** Bounded physical lifecycle of a party that is away from the residential camp. */
export type ExpeditionPhase =
  | "prepared"    // labor committed at camp, not yet departed
  | "outbound"    // physically walking toward the target
  | "operating"   // at/near the target, working (from route or task camp)
  | "returning"   // physically walking home with cargo/information
  | "completed"   // returned and reconciled
  | "aborted"     // gave up and returned (or is returning) without the task done
  | "lost";       // failed to return within the bounded window

/** Why an expedition ended the way it did. Every failure must name a physical reason. */
export type ExpeditionOutcomeReason =
  | "returned_with_cargo"
  | "returned_information_only"
  // EXPEDITIONARY-4 §5.3 — distinct physical causes must NOT collapse into one bucket.
  // (The former generic `target_not_found` no longer exists; every zero-cargo work
  // outcome below names the exact stage of the identity chain that failed.)
  // The party arrived, its evidence was fresh, and the remembered patch genuinely
  // was not there.
  | "target_absent"
  // The evidence itself was stale/inferred/forgotten: either the band no longer
  // remembers the patch it sent the party to, or the memory was too weak to name a
  // real physical source when the party stood at the tile.
  | "evidence_stale"
  // The patch physically exists but its stock is drawn down to nothing (depletion).
  | "physically_exhausted"
  // Band-known seasonality says the patch is not active this season; the party
  // declined to work it rather than pretending a harvest.
  | "seasonally_inactive"
  // The walked route ended somewhere that is NOT the target tile (nor a linked/
  // shore-adjacent stand for it) — physical access failed, not the patch.
  | "route_endpoint_mismatch"
  // The party stood at a real patch, attempted the work, and it returned nothing.
  | "harvest_failed"
  // Harvest was physically taken at the target but nothing survived the return
  // (provisions consumed it / carry ceiling lost it) — the trip, not the target, failed.
  | "cargo_return_failed"
  | "provisions_ran_out"
  | "route_impassable"
  | "injury_forced_return"
  | "season_window_closed"
  | "party_lost";

/**
 * EXPEDITIONARY-4 §8 — aggregate mobility-role counts a party was drawn from.
 * Never individuals, never a sex claim (Option B). Defined here (the type leaf) so
 * both the expedition record and the mobility authority share one shape.
 */
export interface ExpeditionPartyComposition {
  readonly limited: number;
  readonly typical: number;
  readonly high: number;
}

/** What the party physically carries home. Information is not cargo that feeds anyone. */
export interface ExpeditionCargo {
  /** Physical harvest units actually drawn at the target (already depleted from the stock). */
  readonly harvestUnits: number;
  /** Units lost in transit (spoilage/drop/abandonment on a hard leg). */
  readonly lostUnits: number;
  /** Units the party ate to feed itself while away (trip-local provisioning, never a store). */
  readonly provisionUnitsConsumed: number;
  /** The physical receipt resolved at the target; deposited into the ledger only on return. */
  readonly harvestReceipt?: PhysicalFoodHarvestRecord;
  /** Hard carry ceiling this party could physically move home. */
  readonly carryCapacityUnits: number;
}

/** A temporary operating base a party physically establishes when the route/target justifies it. */
export interface ExpeditionTaskCamp {
  readonly tileId: TileId;
  readonly establishedDay: DayNumber;
  readonly expiresOnDay: DayNumber;
  /** Why this camp was physically justified (leg length, repeated retrieval, recovery). */
  readonly reason: "leg_staging" | "repeated_retrieval" | "recovery" | "observation";
  readonly usedDays: number;
  /** Explicit non-claims: a task camp is not a settlement and holds no stores. */
  readonly noResidentialRelocation: true;
  readonly noStorage: true;
  readonly noTerritoryClaim: true;
}

/** The canonical away-party record. Bounded; owned by the activity/party subsystem. */
export interface ExpeditionRecord {
  readonly id: string;
  readonly bandId: BandId;
  readonly taskKind: ExpeditionTaskKind;
  readonly phase: ExpeditionPhase;
  readonly originTileId: TileId;
  readonly targetTileId: TileId;
  /**
   * The band-remembered patch this party was sent to. Carried explicitly so the work
   * day resolves the SAME memory the launch chose: a patch is anchored to an
   * approximate tile but may span linked tiles, so matching on tile alone can miss.
   */
  readonly targetPatchId: string;
  /** Deterministic outbound route origin→target (inclusive). No teleporting. */
  readonly routeTileIds: readonly TileId[];
  /** Where the party physically is right now (an index into routeTileIds). */
  readonly positionTileId: TileId;
  readonly routeIndex: number;
  readonly departedDay: DayNumber;
  readonly departedTick: TickNumber;
  /** Bounded window; exceeding it makes the party overdue then lost. */
  readonly plannedReturnDay: DayNumber;
  readonly hardDeadlineDay: DayNumber;
  readonly travelDaysElapsed: number;
  readonly workDaysElapsed: number;
  /** Aggregate composition — never individual people. */
  readonly partyWorkers: number;
  /**
   * EXPEDITIONARY-4 §8 — which mobility-role pools these workers were drawn from
   * (limited/typical/high). Aggregate counts, conserved against the band's pools; a
   * high-capacity adult committed here is unavailable to every other party until return.
   */
  readonly partyComposition?: ExpeditionPartyComposition;
  readonly cargo: ExpeditionCargo;
  readonly taskCamp?: ExpeditionTaskCamp;
  /** Physical risk actually experienced, per-leg capped (no duplicate application). */
  readonly injuryLoad: number;
  readonly riskEpisodeIds: readonly string[];
  readonly outcomeReason?: ExpeditionOutcomeReason;
  /**
   * The trip record resolved AT THE TARGET on the work day (its stock is already
   * physically depleted). It is carried home as cargo and is NOT food for anyone
   * until the return deposits it into `recentIntraSeasonTrips`. Holding the record
   * rather than rebuilding one at return keeps a single trip-record builder.
   */
  readonly pendingReturnRecord?: IntraSeasonTripRecord;
  /** Information the party is physically carrying home; unavailable to the band until return. */
  readonly carriedObservations: readonly ExpeditionObservation[];
  readonly reasonIds: readonly ReasonId[];
  /** Explicit non-claims, mirrored from the trip contract. */
  readonly noResidentialRelocation: true;
  readonly bandKnownTargetOnly: true;
}

/** A bounded observation a party physically made and is carrying home (latency: not band knowledge yet). */
export interface ExpeditionObservation {
  readonly tileId: TileId;
  readonly kind: "target_confirmed" | "target_absent" | "route_hazard" | "route_passable" | "distant_feature";
  readonly confidence: number;
  readonly observedDay: DayNumber;
}

/**
 * Compacted terminal record of one finished expedition. This is the band's LIVED
 * EVIDENCE about distant work: it is what makes a failed expedition change later
 * behaviour (lower route/target confidence, revised provision estimate) without
 * permanently blacklisting a route from a single weak failure.
 */
export interface ExpeditionOutcomeSummary {
  readonly id: string;
  readonly tick: TickNumber;
  readonly taskKind: ExpeditionTaskKind;
  readonly targetTileId: TileId;
  readonly phase: Extract<ExpeditionPhase, "completed" | "aborted" | "lost">;
  readonly outcomeReason: ExpeditionOutcomeReason;
  readonly distanceTiles: number;
  readonly totalDays: number;
  readonly partyWorkers: number;
  /** Physical units that actually reached the residential camp (0 for information-only/failed). */
  readonly deliveredHarvestUnits: number;
  readonly provisionUnitsConsumed: number;
  readonly lostUnits: number;
  readonly injuryLoad: number;
  readonly usedTaskCamp: boolean;
}

export interface PlantPatchActivityTrace {
  readonly patchId: string;
  readonly plantClassId: PlantClassId;
  readonly seasonalAvailability: PlantPatchAvailability;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly lifecycleState: PlantLifecycleState;
  readonly expectedReturnFactor: number;
  readonly currentDepletion: number;
  readonly pressure: number;
  readonly recoveryRate: number;
  readonly fallbackRole: PlantFallbackRole;
  readonly fallbackRank: number;
  readonly laborCost: number;
  readonly safetyRisk: PlantSafetyRisk;
  readonly depletionApplied: boolean;
  readonly knowledgeUpdate: "confirmed_by_gathering" | "failure_lowered_confidence" | "observed_only";
  readonly memoryUpdate: "resource_memory_update" | "no_memory_update";
  readonly protoCampInfluence: "activity_base_signal" | "fallback_refuge_signal" | "none";
  readonly rawSource: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface AnimalActivityTrace {
  readonly stockId: string;
  readonly faunaKind: FaunaStockKind;
  readonly habitat: FaunaHabitatType;
  readonly anchorTileId: TileId;
  readonly targetArchetypeHint: string;
  readonly targetChosenReason: string;
  readonly habitatBasis: readonly string[];
  readonly habitatSuitability: number;
  readonly expectedReturnFactor: number;
  readonly actualReturnValue: number;
  readonly currentAbundance: number;
  readonly disturbance: number;
  readonly seasonalAvailability: number;
  readonly confidence: number;
  readonly pressure: number;
  readonly pressureApplied: number;
  readonly recoveryRate: number;
  readonly warinessBefore: number;
  readonly warinessChange: number;
  readonly dangerRisk: number;
  readonly dangerClass: "low" | "moderate" | "high";
  // INVENTION-3: a practiced hunting-method response (distance strike, snare
  // line) bounds part of the danger actually paid on this trip. Proof fields:
  // dangerRiskBeforeLearning is the unrelieved value; dangerRisk above is what
  // was paid. Absent when no hunting response was exercised.
  readonly dangerRiskBeforeLearning?: number;
  readonly huntingReliefApplied?: number;
  readonly huntingResponseId?: string;
  readonly huntingVariantKey?: string;
  readonly huntingContextMatched?: boolean;
  readonly huntingPreparationLabor?: number;
  readonly huntingReturnShiftApplied?: number;
  readonly distanceTiles: number;
  readonly travelCost: number;
  readonly laborAccessCost: number;
  readonly activityOutcome: IntraSeasonTripActivityResult;
  readonly outcomeClass: "success" | "partial" | "failure" | "information";
  readonly depletionApplied: boolean;
  readonly knowledgeUpdate:
    | "direct_sighting"
    | "reliable_route_strengthened"
    | "failure_staled_route"
    | "danger_caution_added"
    | "tracks_observed";
  readonly memoryUpdate: "resource_memory_update" | "caution_memory_update" | "no_memory_update";
  readonly protoCampInfluence:
    | "animal_route_signal"
    | "forest_edge_game_signal"
    | "overhunted_scarcity_signal"
    | "danger_avoidance_signal"
    | "none";
  readonly rawSource: string;
  readonly reasonIds: readonly ReasonId[];
  readonly targetKnownMemoryOnly: true;
}

export interface AquaticActivityTrace {
  readonly stockId: string;
  readonly aquaticKind: FaunaStockKind;
  readonly waterContext: FaunaHabitatType;
  readonly anchorTileId: TileId;
  readonly resourceClassId: "aquatic_food";
  readonly expectedReturnFactor: number;
  readonly currentAbundance: number;
  readonly disturbance: number;
  readonly seasonalAvailability: number;
  readonly pressure: number;
  readonly recoveryRate: number;
  readonly risk: number;
  readonly laborAccessCost: number;
  readonly activityOutcome: IntraSeasonTripActivityResult;
  readonly depletionApplied: boolean;
  readonly knowledgeUpdate: "confirmed_by_fishing" | "failure_lowered_confidence" | "observed_only";
  readonly memoryUpdate: "resource_memory_update" | "no_memory_update";
  readonly protoCampInfluence: "aquatic_activity_base_signal" | "lean_season_buffer_signal" | "none";
  readonly rawSource: string;
  readonly reasonIds: readonly ReasonId[];
}

export type AcuteRiskKind =
  | "minor_foraging_injury"
  | "severe_foraging_injury"
  | "bad_water_sickness"
  | "spoiled_or_risky_food_sickness"
  | "plant_poisoning_or_irritation"
  | "aquatic_accident"
  | "animal_encounter_injury"
  | "exposure_or_cold_snap"
  | "heat_or_drought_exhaustion"
  | "travel_accident";

export type AcuteRiskSeverity = "minor" | "moderate" | "severe" | "critical";

export type AcuteRiskDurationClass = "hours" | "day" | "several_days" | "week" | "season_background";

export type AcuteRiskSourceCategory =
  | "activity_trace"
  | "plant_patch"
  | "aquatic_stock"
  | "fauna_sign"
  | "travel_route"
  | "water_context"
  | "seasonal_stress"
  | "current_place";

export interface AcuteRiskContext {
  readonly sourceCategory: AcuteRiskSourceCategory;
  readonly sourceTileId?: TileId;
  readonly sourceResourceId?: string;
  readonly sourceTraceId?: string;
  readonly sourceLabel: string;
  readonly season: Season;
  readonly confidence: NormalizedIntensity;
  readonly knownOrObservedByBand: true;
}

export interface AcuteRiskEffect {
  readonly activityEfficiencyPenalty: NormalizedIntensity;
  readonly extraSeasonalStress: NormalizedIntensity;
  readonly mortalityRiskBump: NormalizedIntensity;
  readonly movementCautionBump: NormalizedIntensity;
  readonly knowledgeUpdateWeight: NormalizedIntensity;
  readonly recoverySeasons: number;
}

export interface AcuteRiskEpisode {
  readonly id: string;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly year: number;
  readonly season: Season;
  readonly kind: AcuteRiskKind;
  readonly severity: AcuteRiskSeverity;
  readonly durationClass: AcuteRiskDurationClass;
  readonly context: AcuteRiskContext;
  readonly groundedReasons: readonly string[];
  readonly contributingFactors: readonly string[];
  readonly reliability: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly effect: AcuteRiskEffect;
  readonly remainingRecoverySeasons: number;
  // INVENTION-3: a practiced care/treatment response can bound part of an
  // episode's recovery and mortality weight. Proof fields; absent when no
  // care response was exercised on this episode.
  readonly careReliefApplied?: number;
  readonly careResponseId?: string;
  readonly careNote?: string;
  readonly careAttempted?: boolean;
  readonly careMatched?: boolean;
  readonly careHarmApplied?: number;
  readonly careRecoverySeasonsSaved?: number;
  readonly careTreatmentBurden?: number;
  readonly affectedStress: boolean;
  readonly affectedActivityEfficiency: boolean;
  readonly affectedMortalityPressure: boolean;
  readonly affectedMovementCaution: boolean;
  readonly affectedResourceMemory: boolean;
  readonly memoryUpdates: readonly string[];
  readonly reasonIds: readonly ReasonId[];
  readonly noDirectPopulationKill: true;
  readonly noHiddenTruth: true;
}

export interface AcuteRiskTrace {
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly consideredCandidateCount: number;
  readonly generatedEpisodeCount: number;
  readonly maxEpisodesPerBandSeason: number;
  readonly candidateSourceCategories: readonly AcuteRiskSourceCategory[];
  readonly cappedBySeasonLimit: boolean;
  readonly usedBandKnownContextOnly: true;
  readonly noFullMapScan: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface AcuteRiskState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly latestEpisode?: AcuteRiskEpisode;
  readonly recentEpisodes: readonly AcuteRiskEpisode[];
  readonly activeEffect: AcuteRiskEffect;
  readonly trace: AcuteRiskTrace;
  readonly memoryCaps: {
    readonly recentEpisodeCap: number;
    readonly maxEpisodesPerBandSeason: number;
  };
  readonly droppedEpisodeCount: number;
  readonly expiredEpisodeCount: number;
  readonly bounded: true;
  readonly noFullMapScan: true;
  readonly noIndividualPeople: true;
}

export interface PlaceMemoryRecord {
  readonly tileId: TileId;
  readonly firstObservedAt: WorldTime;
  readonly lastObservedAt: WorldTime;
  readonly visitCount: number;
  readonly seasonsObserved: readonly Season[];
  readonly lastKnownFoodEstimate?: number;
  readonly lastKnownWaterStress?: number;
  readonly lastKnownRiskEstimate?: number;
  readonly bestSeason?: Season;
  readonly worstSeason?: Season;
  readonly valences: readonly PlaceMemoryValence[];
  readonly attachment: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  readonly repeatedReturnCount: number;
  readonly isReturnPlace: boolean;
  readonly lastReturnAt?: WorldTime;
  readonly returnIntervalTicks?: TickNumber;
  readonly seasonalReturnPattern?: readonly Season[];
}

export interface TravelCorridorMemory {
  readonly id: RouteId;
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly useCount: number;
  readonly lastUsedAt: WorldTime;
  readonly intentKinds: readonly MobilityIntentKind[];
  readonly confidence: NormalizedIntensity;
}

export interface CompressedCorridorSummary {
  readonly id: string;
  readonly corridorCount: number;
  readonly sourceKnowledgeTypes: readonly string[];
  readonly confidence: NormalizedIntensity;
  readonly lastUsedAt: WorldTime;
  readonly broadCorridorRoles: readonly string[];
  readonly canInfluenceDecisions: boolean;
  readonly influenceMode: "decision_relevant" | "ui_debug_only";
}

export interface KnownCrossingMemory {
  readonly riverId: RiverId;
  readonly crossingTileA: TileId;
  readonly crossingTileB: TileId;
  readonly crossingClass: RiverCrossingClass;
  readonly firstUsedAt: WorldTime;
  readonly lastUsedAt: WorldTime;
  readonly useCount: number;
  readonly successConfidence: NormalizedIntensity;
  readonly seasonalReliability: NormalizedIntensity;
  readonly riskMemory: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface PopulationAccountingState {
  readonly population: number;
  readonly growthAccumulator: number;
  readonly mortalityAccumulator: number;
  readonly lastPopulationChangeReasonIds: readonly ReasonId[];
}

export interface BandDemography extends PopulationAccountingState {
  readonly householdCount: number;
  readonly dependents: number;
  readonly workingAdults: number;
  readonly elders: number;
  readonly fertilityPressure: NormalizedIntensity;
  readonly mortalityPressure: NormalizedIntensity;
  readonly foodPerPersonStress: NormalizedIntensity;
  // ECO-TROPHIC-1B: food-only demographic terms derived from the canonical
  // physical-receipt history. Kept separate from water, exposure, sickness,
  // injury, crowding, and movement hardship for Technical causal proof.
  readonly foodMortalityContribution?: NormalizedIntensity;
  readonly foodFertilitySuppression?: NormalizedIntensity;
  readonly foodSevereChronicHazard?: NormalizedIntensity;
  readonly foodSevereChronicRatePenalty?: number;
  readonly baselineFertilityBasis?: NormalizedIntensity;
  readonly healthCareFertilitySuppression?: NormalizedIntensity;
  readonly ordinaryMortalityBasis?: NormalizedIntensity;
  readonly netDemographicRate?: number;
  // FOOD-DEMOGRAPHY-SEPARATION-2 — the annual net rate before the population-band
  // decline/growth clamp, and whether the decline cap actually bound this update.
  // Exposed so the long-run audit can report decline-cap exposure per lineage.
  readonly uncappedDemographicRate?: number;
  readonly declineCapBinds?: boolean;
  readonly householdCrowdingPressure: NormalizedIntensity;
  readonly splitPressure: NormalizedIntensity;
  readonly lastDemographicUpdate: WorldTime;
  readonly sourceReasonIds: readonly ReasonId[];
  // Age-cohort lifecycle accumulators (checkpoint 2J). Persisted so dependents age
  // into adults and adults into elders deterministically over years, rather than
  // cohorts being a fixed ratio of the total. Population stays integer and equal
  // to dependents + workingAdults + elders.
  readonly dependentToAdultAccumulator?: number;
  readonly adultToElderAccumulator?: number;
  readonly elderMortalityAccumulator?: number;
  readonly birthAccumulator?: number;
  readonly lastBirths?: number;
  readonly lastDeaths?: number;
  readonly lastDependentsMatured?: number;
  readonly lastAdultsAged?: number;
  readonly lastEldersDied?: number;
  readonly lastDependentDeaths?: number;
  readonly lastAdultDeaths?: number;
  readonly lastCrisisDeaths?: number;
  readonly lastWaterStressDeaths?: number;
  readonly lastStarvationDeaths?: number;
  readonly lastMigrationHardshipDeaths?: number;
  readonly demographicChurn?: DemographicChurnState;
  readonly noDeathAudit?: NoDeathAuditState;
}

export type SeasonalSupportMode =
  | "pulse"
  | "lean"
  | "dry"
  | "wet"
  | "neutral"
  | "recovery";

export type SeasonalHungerClassification =
  | "stable"
  | "seasonal_lean_stress"
  | "seasonal_water_stress"
  | "seasonal_pulse_recovery"
  | "chronic_food_deficit"
  | "chronic_water_deficit"
  | "chronic_plus_seasonal_stress"
  | "crisis_deficit"
  | "recovery_after_crisis";

export interface SeasonalSupportSample {
  readonly tick: TickNumber;
  readonly year: number;
  readonly season: Season;
  readonly rawSupportRatio: number;
  readonly clampedSupportRatio: NormalizedIntensity;
  readonly perCapitaReturn: NormalizedIntensity;
  readonly seasonalModifier: number;
  readonly foodStress: NormalizedIntensity;
  readonly waterStress: NormalizedIntensity;
  readonly deficitRatio: NormalizedIntensity;
  readonly mode: SeasonalSupportMode;
}

export interface SeasonalSupportState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly currentSeasonSupport: SeasonalSupportSample;
  readonly lastSeasonSupport?: SeasonalSupportSample;
  readonly rolling4SeasonSupport: NormalizedIntensity;
  readonly rolling8SeasonSupport: NormalizedIntensity;
  readonly rolling4SeasonReturn: NormalizedIntensity;
  readonly rolling8SeasonReturn: NormalizedIntensity;
  readonly returnTrend4Season: number;
  readonly returnTrend8Season: number;
  readonly recentSamples: readonly SeasonalSupportSample[];
  readonly seasonalHungerStreak: number;
  readonly chronicDeficitStreak: number;
  readonly seasonalRecoveryStreak: number;
  readonly deficitSeasonsLast4: number;
  readonly deficitSeasonsLast8: number;
  readonly waterStressSeasonsLast4: number;
  readonly waterStressSeasonsLast8: number;
  readonly hungerClassification: SeasonalHungerClassification;
  readonly chronicDeficitClassification: SeasonalHungerClassification;
  // Canonical bounded nutrition consequences. These contain no calories: they
  // summarize only the physical-support samples in `recentSamples`.
  readonly currentFoodStress?: NormalizedIntensity;
  readonly recentFoodStress?: NormalizedIntensity;
  readonly chronicFoodStress?: NormalizedIntensity;
  readonly recoveryRelief?: NormalizedIntensity;
  readonly foodMovementPressure?: NormalizedIntensity;
  readonly foodDemographicPressure?: NormalizedIntensity;
  readonly populationStableDespiteRecurringHunger: boolean;
  readonly topSeasonalSupportReasons: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

export type DeathCauseKind =
  | "elder_senescence"
  | "dependent_vulnerability"
  | "adult_crisis"
  | "starvation_sustained_food_deficit"
  | "water_stress"
  | "labor_collapse"
  | "migration_hardship"
  | "unknown_other";

export interface DemographicChurnRecord {
  readonly year: number;
  readonly births: number;
  readonly deaths: number;
  readonly netPopulationChange: number;
  readonly dependentsMatured: number;
  readonly adultsAged: number;
  readonly elderDeaths: number;
  readonly dependentDeaths: number;
  readonly adultDeaths: number;
  readonly crisisDeaths: number;
  readonly waterStressDeaths: number;
  readonly starvationDeaths: number;
  readonly migrationHardshipDeaths: number;
}

export interface DemographicChurnState {
  readonly latestYear: number;
  readonly records: readonly DemographicChurnRecord[];
  readonly birthsThisYear: number;
  readonly deathsThisYear: number;
  readonly birthsLast10Years: number;
  readonly deathsLast10Years: number;
  readonly netPopulationChangeLast10Years: number;
  readonly yearsSinceLastBirth: number;
  readonly yearsSinceLastDeath: number;
  readonly dependentsMaturedThisYear: number;
  readonly dependentsMaturedLast10Years: number;
  readonly adultsAgedThisYear: number;
  readonly adultsAgedLast10Years: number;
  readonly elderDeathsThisYear: number;
  readonly elderDeathsLast10Years: number;
  readonly dependentDeathsThisYear: number;
  readonly dependentDeathsLast10Years: number;
  readonly adultDeathsThisYear: number;
  readonly adultDeathsLast10Years: number;
  readonly crisisDeathsThisYear: number;
  readonly crisisDeathsLast10Years: number;
  readonly waterStressDeathsThisYear: number;
  readonly waterStressDeathsLast10Years: number;
  readonly starvationDeathsThisYear: number;
  readonly starvationDeathsLast10Years: number;
  readonly migrationHardshipDeathsThisYear: number;
  readonly migrationHardshipDeathsLast10Years: number;
  readonly stablePopulationHidesChurn: boolean;
  readonly demographicOutlook: string;
}

export type NoDeathAuditClassification =
  | "plausible_young_healthy_band"
  | "plausible_small_band_no_elders"
  | "births_deaths_offset_hidden"
  | "suspicious_elder_underdeath"
  | "suspicious_crisis_underdeath"
  | "suspicious_seasonal_hunger_underdeath"
  | "suspicious_chronic_deficit_underdeath"
  | "recent_deaths_observed";

export interface NoDeathAuditState {
  readonly noDeathStreakYears: number;
  readonly noDeath25Years: boolean;
  readonly noDeath50Years: boolean;
  readonly elderHeavyNoDeaths: boolean;
  readonly chronicDeficitNoDeaths: boolean;
  readonly seasonalHungerNoDeaths: boolean;
  readonly suspicious: boolean;
  readonly classification: NoDeathAuditClassification;
  readonly why: string;
}

export interface DeathMemoryState {
  readonly lastUpdatedTick: TickNumber;
  readonly recentDeathCount: number;
  readonly recentDependentDeaths: number;
  readonly recentAdultDeaths: number;
  readonly recentElderDeaths: number;
  readonly deathMemorySeverity: NormalizedIntensity;
  readonly deathMemoryCause?: DeathCauseKind;
  readonly cautionModifier: NormalizedIntensity;
  readonly fertilitySuppressionFromRecentDeaths: NormalizedIntensity;
  readonly avoidPlacePressure: NormalizedIntensity;
  readonly placeTileId?: TileId;
  readonly reasonIds: readonly ReasonId[];
}

export type InnerFissionStateKind =
  | "unified"
  | "strained"
  | "divided"
  | "factional"
  | "near_split"
  | "split_delayed"
  | "split_resolved";

export interface InnerFissionState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly state: InnerFissionStateKind;
  readonly pressureScore: NormalizedIntensity;
  readonly topCauses: readonly string[];
  readonly splitDelayed: boolean;
  readonly splitDelayedReason?: string;
  readonly unityRecovering: boolean;
  readonly unityRecoveryReason?: string;
  readonly hungerTension: NormalizedIntensity;
  readonly waterTension: NormalizedIntensity;
  readonly deathTension: NormalizedIntensity;
  readonly migrationTension: NormalizedIntensity;
  readonly supportSeekingTension: NormalizedIntensity;
  readonly scoutingPressure: NormalizedIntensity;
  readonly residentialDebatePressure: NormalizedIntensity;
  readonly supportSeekingPressure: NormalizedIntensity;
  readonly protoIdentityHook: boolean;
  readonly eventHooks: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

export type SocialRelationCategory =
  | "us"
  | "close_kin"
  | "distant_kin"
  | "familiar_neighbor"
  | "outsider"
  | "unknown";

export interface SocialTensionRelationSummary {
  readonly otherBandId?: BandId;
  readonly category: SocialRelationCategory;
  readonly grounding: string;
  readonly tolerance: NormalizedIntensity;
  readonly tension: NormalizedIntensity;
}

export interface SocialTensionReadabilityState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly cohesion: NormalizedIntensity;
  readonly cohesionStatus: string;
  readonly tolerance: NormalizedIntensity;
  readonly toleranceStatus: string;
  readonly hostilityStatus: string;
  readonly crowdedKinResourcePressure: NormalizedIntensity;
  readonly crowdedKinResourcePressureStatus: string;
  readonly socialTensionPressure: NormalizedIntensity;
  readonly protectiveVaguenessCount: number;
  readonly directionBlurredCount: number;
  readonly protectiveVaguenessStatus: string;
  readonly relationCategories: readonly SocialTensionRelationSummary[];
  readonly topCauses: readonly string[];
  readonly eventHooks: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

export type BandReadableEventCategory =
  | "survival"
  | "demography"
  | "movement"
  | "activity"
  | "adaptation"
  | "body_logistics"
  | "relationship_memory"
  | "weak_band_fate"
  | "death_memory"
  | "inner_fission"
  | "social_tension"
  | "access_norms"
  | "lineage"
  | "camp_place"
  | "resource_ecology"
  | "nature";

export type BandReadableEventSalience = "high" | "medium" | "low";

export interface BandReadableEvent {
  readonly eventId: EventId;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly year: number;
  readonly season: Season;
  readonly category: BandReadableEventCategory;
  readonly salience: BandReadableEventSalience;
  readonly title: string;
  readonly description: string;
  readonly detail?: string;
  readonly stateKey: string;
  readonly rawSource: string;
  readonly rawReason: string;
  readonly sourceReasonIds: readonly ReasonId[];
  readonly relatedBandId?: BandId;
  readonly relatedTileId?: TileId;
  readonly grounded: true;
}

export interface BandEventCountSummary {
  readonly key: string;
  readonly count: number;
}

export interface BandEventLifetimeSummary {
  readonly totalEvents: number;
  readonly byCategory: readonly BandEventCountSummary[];
  readonly bySalience: readonly BandEventCountSummary[];
}

export interface BandEventHistoryState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly recentEvents: readonly BandReadableEvent[];
  readonly last10Years: readonly BandReadableEvent[];
  readonly last25Years: readonly BandReadableEvent[];
  readonly lifetimeSummary: BandEventLifetimeSummary;
  readonly boundedEventLimit: number;
  readonly droppedRecentEventCount: number;
  readonly duplicateSpamFiltered: number;
  readonly reasonIds: readonly ReasonId[];
}

export type CampRumorInterpretationKind = "direct_state" | "interpretation";

export type CampTalkCategory =
  | "survival"
  | "water"
  | "plants"
  | "aquatic"
  | "adaptation"
  | "body_logistics"
  | "relationship_memory"
  | "storage"
  | "forest"
  | "fauna"
  | "acute_risk"
  | "movement"
  | "camp_place"
  | "demography"
  | "inner_fission"
  | "social_tension"
  | "access_norms"
  | "range_knowledge"
  | "everyday";

export type CampTalkTone =
  | "relieved"
  | "worried"
  | "resigned"
  | "tense"
  | "sober"
  | "practical"
  | "annoyed"
  | "light"
  | "watchful";

export type CampTalkSalience = BandReadableEventSalience;

export interface CampTalkRepetitionRecord {
  readonly stateKey: string;
  readonly family: string;
  readonly sourceCategory: CampTalkCategory;
  readonly firstTick: TickNumber;
  readonly lastTick: TickNumber;
  readonly count: number;
  readonly suppressedCount: number;
  readonly lastSummary: string;
  readonly salience: CampTalkSalience;
  readonly relatedTileId?: TileId;
  readonly relatedBandId?: BandId;
  readonly reasonIds: readonly ReasonId[];
}

export interface CampRumorReadabilityItem {
  readonly id: string;
  readonly summary: string;
  readonly category: CampTalkCategory;
  readonly family: string;
  readonly salience: CampTalkSalience;
  readonly tone: CampTalkTone;
  readonly sourceCategory: CampTalkCategory;
  readonly stateKey: string;
  readonly whyShown: string;
  readonly rawSource: string;
  readonly rawReason: string;
  readonly confidenceStatus: string;
  readonly interpretationKind: CampRumorInterpretationKind;
  readonly relatedBandId?: BandId;
  readonly relatedTileId?: TileId;
  readonly reasonIds: readonly ReasonId[];
  readonly occurrenceCount: number;
  readonly compressedRepeatCount: number;
  readonly grounded: true;
}

export interface CampRumorReadabilityState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly items: readonly CampRumorReadabilityItem[];
  readonly itemCap: number;
  readonly droppedItemCount: number;
  readonly suppressedRepeatCount: number;
  readonly repetitionLedger: readonly CampTalkRepetitionRecord[];
  readonly categoryCounts: readonly BandEventCountSummary[];
  readonly salienceCounts: readonly BandEventCountSummary[];
  readonly grounded: true;
  readonly note: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface BandConditionProfileState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly summary: string;
  readonly survivalCondition: string;
  readonly internalCondition: string;
  readonly weakBandCondition: string;
  readonly socialCondition: string;
  readonly topDrivers: readonly string[];
  readonly rawSources: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

export interface BandLineageReadabilityState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly originBandId: BandId;
  readonly parentBandId?: BandId;
  readonly daughterBandIds: readonly BandId[];
  readonly generationDepth: number;
  readonly generationLabel: string;
  readonly lineagePath: readonly BandId[];
  readonly activeStatus: "active" | "dispersed" | "absorbed" | "extinct";
  readonly absorbedByBandId?: BandId;
  readonly relationCategory?: SocialRelationCategory;
  readonly displayLabel: string;
  readonly rawSource: string;
}

export type ProtoCampStateKind =
  | "none"
  | "repeated_stop"
  | "seasonal_return_place"
  | "refuge_anchor"
  | "activity_base"
  | "remnant_holdout"
  | "storage_processing_candidate"
  | "crossing_camp"
  | "fragile_camp_like_place"
  | "contested_camp_like_place"
  | "stale_remembered_camp"
  | "persistent_camp_candidate"
  | "proto_camp_candidate"
  | "abandoned_camp_trace";

export type ProtoCampActiveStatus = "active" | "stale" | "abandoned" | "contested";

export type ProtoCampReasonFamily =
  | "water_refuge"
  | "seasonal_round"
  | "activity_success"
  | "plants"
  | "aquatic"
  | "fauna"
  | "forest"
  | "storage_processing"
  | "crossing_mobility"
  | "risk_hardship"
  | "death_memory"
  | "social_shared_use"
  | "overuse_recovery"
  | "knowledge_confidence";

export type ProtoCampLifecycleTrend =
  | "new"
  | "strengthening"
  | "weakening"
  | "recovering"
  | "stale"
  | "stable";

export type ProtoCampSeasonalIdentity =
  | "dry_refuge_return"
  | "wet_spread_place"
  | "winter_shelter"
  | "spring_pulse_camp"
  | "autumn_processing_candidate"
  | "seasonal_crossing_camp"
  | "general_return_place";

export type ProtoCampUsePressureStatus = "low" | "worn" | "overused" | "recovering";

export interface ProtoCampFactor {
  readonly reason: string;
  readonly strength: NormalizedIntensity;
  readonly rawSource: string;
  readonly family?: ProtoCampReasonFamily;
}

export interface ProtoCampReasonFamilySummary {
  readonly family: ProtoCampReasonFamily;
  readonly positiveStrength: NormalizedIntensity;
  readonly negativeStrength: NormalizedIntensity;
  readonly netStrength: number;
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly rawReasonCount: number;
  readonly displayReasonCount: number;
  readonly topPositiveReason?: string;
  readonly topNegativeReason?: string;
}

export interface ProtoCampPlaceMemory {
  readonly tileId: TileId;
  readonly bandId: BandId;
  readonly firstObservedTick: TickNumber;
  readonly lastUsedTick: TickNumber;
  readonly lastUsedYear: number;
  readonly lastUsedSeason: Season;
  readonly visitCount: number;
  readonly consecutiveUseCount: number;
  readonly seasonsUsed: readonly Season[];
  readonly returnIntervalTicks?: TickNumber;
  readonly waterRefugeReliability: NormalizedIntensity;
  readonly seasonalSupportHistory: readonly SeasonalHungerClassification[];
  readonly activitySuccessCountNearby: number;
  readonly activityFailureCountNearby: number;
  readonly residentialAnchorUseCount: number;
  readonly movementHardshipAvoidedByStaying: NormalizedIntensity;
  readonly migrationHardshipLinkedToLeaving: NormalizedIntensity;
  readonly deathMemoryNearby: NormalizedIntensity;
  readonly birthsWhileAnchoredLast10Years: number;
  readonly deathsWhileAnchoredLast10Years: number;
  readonly weakBandRemnantUse: boolean;
  readonly knownKinContactNearby: NormalizedIntensity;
  readonly socialCrowdingPressureNearby: NormalizedIntensity;
  readonly storageProcessingScore: NormalizedIntensity;
  readonly crossingUseScore: NormalizedIntensity;
  readonly ecologicalPressure: NormalizedIntensity;
  readonly ecologicalRecovery: NormalizedIntensity;
  readonly activitySuccessTrend: NormalizedIntensity;
  readonly activityFailureTrend: NormalizedIntensity;
  readonly campLikeScore: NormalizedIntensity;
  readonly campLikeState: ProtoCampStateKind;
  readonly activeStatus: ProtoCampActiveStatus;
  readonly lifecycleTrend: ProtoCampLifecycleTrend;
  readonly seasonalIdentity: ProtoCampSeasonalIdentity;
  readonly usePressureStatus: ProtoCampUsePressureStatus;
  readonly reasonFamilies: readonly ProtoCampReasonFamilySummary[];
  readonly positiveReasons: readonly ProtoCampFactor[];
  readonly negativeReasons: readonly ProtoCampFactor[];
  readonly displayPositiveReasons: readonly ProtoCampFactor[];
  readonly displayNegativeReasons: readonly ProtoCampFactor[];
  readonly rawPositiveReasonCount: number;
  readonly rawNegativeReasonCount: number;
  readonly topReasons: readonly string[];
  readonly confidence: NormalizedIntensity;
  readonly staleYears: number;
  readonly decay: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface ProtoCampBehaviorEffectState {
  readonly currentTileId?: TileId;
  readonly returnBias: NormalizedIntensity;
  readonly seasonalReturnBias: NormalizedIntensity;
  readonly drySeasonAnchorBias: NormalizedIntensity;
  readonly riskyMoveCautionBias: NormalizedIntensity;
  readonly contestedMoveAwayPressure: NormalizedIntensity;
  readonly weakRemnantHoldBias: NormalizedIntensity;
  readonly processingCampReturnBias: NormalizedIntensity;
  readonly crossingCampRouteBias: NormalizedIntensity;
  readonly restOverusedCampBias: NormalizedIntensity;
  readonly topBehaviorReasons: readonly string[];
  readonly reversible: true;
  readonly noSedentism: true;
  readonly noStorageEconomy: true;
  readonly noTerritory: true;
}

export interface ProtoCampMemoryState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly currentPlace?: ProtoCampPlaceMemory;
  readonly topPlaces: readonly ProtoCampPlaceMemory[];
  readonly places: Readonly<Record<TileId, ProtoCampPlaceMemory>>;
  readonly memoryCap: number;
  readonly candidateTileCap: number;
  readonly displayReasonCap: number;
  readonly reasonFamilyCap: number;
  readonly droppedLowSalienceCount: number;
  readonly behavior: ProtoCampBehaviorEffectState;
  readonly reasonIds: readonly ReasonId[];
}

export type ProtoAccessPlaceType =
  | "water_source"
  | "ford_crossing"
  | "wetland_fish_place"
  | "plant_patch"
  | "hunting_route"
  | "forest_refuge"
  | "storage_processing_candidate"
  | "persistent_camp"
  | "seasonal_return_place"
  | "dry_refuge"
  | "activity_base";

export type ProtoAccessStateKind =
  | "none"
  | "familiar_use"
  | "expected_return"
  | "tolerated_shared_use"
  | "kin_tolerated"
  | "stranger_watchful"
  | "crowded_use"
  | "contested_use"
  | "avoided_shared_use"
  | "sensitive_place"
  | "stale_access_memory";

export type ProtoAccessEncounterTone =
  | "none"
  | "kin_tolerant"
  | "familiar_tolerant"
  | "stranger_watchful"
  | "crowded_shared"
  | "avoidance_remembered"
  | "cooperation_remembered"
  | "stale_uncertain";

export type ProtoAccessReasonFamily =
  | "familiar_use"
  | "kin_tolerance"
  | "stranger_caution"
  | "shared_use_pressure"
  | "place_importance"
  | "storage_processing"
  | "crossing_mobility"
  | "risk_hardship"
  | "knowledge_confidence";

export interface ProtoAccessReason {
  readonly reason: string;
  readonly strength: NormalizedIntensity;
  readonly family: ProtoAccessReasonFamily;
  readonly rawSource: string;
}

export interface ProtoAccessMemory {
  readonly tileId: TileId;
  readonly bandId: BandId;
  readonly placeType: ProtoAccessPlaceType;
  readonly accessState: ProtoAccessStateKind;
  readonly accessImportance: NormalizedIntensity;
  readonly placeSensitivity: NormalizedIntensity;
  readonly familiarUseStrength: NormalizedIntensity;
  readonly repeatedReturnStrength: NormalizedIntensity;
  readonly kinTolerance: NormalizedIntensity;
  readonly familiarTolerance: NormalizedIntensity;
  readonly strangerCaution: NormalizedIntensity;
  readonly sharedUsePressure: NormalizedIntensity;
  readonly crowdingResourcePressure: NormalizedIntensity;
  readonly recentEncounterTone: ProtoAccessEncounterTone;
  readonly rememberedRefusalAvoidance: NormalizedIntensity;
  readonly rememberedCooperationTolerance: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly staleness: NormalizedIntensity;
  readonly staleYears: number;
  readonly positiveReasons: readonly ProtoAccessReason[];
  readonly negativeReasons: readonly ProtoAccessReason[];
  readonly topReasons: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
  readonly antiOmniscience: {
    readonly fromBandKnownPlaceMemory: boolean;
    readonly fromObservedSocialEvidenceOnly: boolean;
    readonly noHiddenBands: true;
    readonly noHiddenResources: true;
    readonly noFixedAccessRule: true;
  };
}

export interface ProtoAccessBehaviorEffectState {
  readonly currentTileId?: TileId;
  readonly sensitivePlaceCautionBias: NormalizedIntensity;
  readonly toleranceReductionBias: NormalizedIntensity;
  readonly kinToleranceReliefBias: NormalizedIntensity;
  readonly contestedAvoidanceBias: NormalizedIntensity;
  readonly supportSeekingHesitationBias: NormalizedIntensity;
  readonly expectedReturnBias: NormalizedIntensity;
  readonly maxBehaviorHook: NormalizedIntensity;
  readonly topBehaviorReasons: readonly string[];
  readonly reversible: true;
  readonly noConflict: true;
  readonly noExpulsion: true;
  readonly noFixedBorders: true;
  readonly noProperty: true;
  readonly noLaw: true;
  readonly noWar: true;
}

export interface ProtoAccessMemoryState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly currentPlace?: ProtoAccessMemory;
  readonly topPlaces: readonly ProtoAccessMemory[];
  readonly places: Readonly<Record<TileId, ProtoAccessMemory>>;
  readonly memoryCap: number;
  readonly candidateTileCap: number;
  readonly reasonCap: number;
  readonly droppedLowSalienceCount: number;
  readonly behavior: ProtoAccessBehaviorEffectState;
  readonly antiOmniscience: {
    readonly derivedFromBandMemoryOnly: true;
    readonly noHiddenMapTruth: true;
    readonly noHiddenBandReaction: true;
  };
  readonly reasonIds: readonly ReasonId[];
}

// ---------------------------------------------------------------------------
// Carrying capacity + effective yield + daughter colonization (checkpoint 2J)
//
// Distinguishes stable ecological POTENTIAL from current usable EFFECTIVE YIELD,
// makes per-capita return visible, and lets saturated cores push daughters toward
// known underused habitats — without agriculture, settlements, territory, or
// hidden omniscient tile knowledge.
// ---------------------------------------------------------------------------

export interface BaseHabitatPotential {
  readonly tileId: TileId;
  readonly foragingPotential: NormalizedIntensity;
  readonly aquaticPotential: NormalizedIntensity;
  readonly plantPotential: NormalizedIntensity;
  readonly animalPotentialPlaceholder: NormalizedIntensity;
  readonly waterPotential: NormalizedIntensity;
  readonly resourceDiversity: NormalizedIntensity;
  readonly recoveryPotential: NormalizedIntensity;
  readonly seasonalVariance: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface SeasonalEffectiveYield {
  readonly tileId: TileId;
  readonly season: Season;
  readonly basePotential: NormalizedIntensity;
  readonly effectiveYield: NormalizedIntensity;
  readonly foodYield: NormalizedIntensity;
  readonly aquaticYield: NormalizedIntensity;
  readonly plantYield: NormalizedIntensity;
  readonly waterSupport: NormalizedIntensity;
  readonly diversityBuffer: NormalizedIntensity;
  readonly recoveryBonus: NormalizedIntensity;
  readonly localUsePenalty: NormalizedIntensity;
  readonly crowdingPenalty: NormalizedIntensity;
  readonly depletionPenalty: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface PopulationDemandState {
  readonly bandId: BandId;
  readonly population: number;
  readonly adultEquivalentDemand: number;
  readonly laborCapacity: number;
  readonly dependencyLoad: NormalizedIntensity;
  readonly careBurden: NormalizedIntensity;
  readonly nutritionDeficit: NormalizedIntensity;
  readonly fertilityPressure: NormalizedIntensity;
  readonly mortalityPressure: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export type NomadicScaleClass =
  | "normal_band"
  | "large_band"
  | "aggregation"
  | "mega_band"
  | "failure_warning";

export interface NomadicScalePressureState {
  readonly bandId: BandId;
  readonly population: number;
  readonly scaleClass: NomadicScaleClass;
  readonly nomadicScalePressure: NormalizedIntensity;
  readonly logisticalInefficiencyPenalty: NormalizedIntensity;
  readonly largeBandFissionPressure: NormalizedIntensity;
  readonly aggregationStress: NormalizedIntensity;
  readonly ecologyRelief: NormalizedIntensity;
  readonly megaBandWarning: boolean;
  readonly maxBandCapBlockingFission: boolean;
  readonly reasonIds: readonly ReasonId[];
}

export interface EcologyStressCauseSummary {
  readonly foodDeficit: NormalizedIntensity;
  readonly sharedCatchmentCrowding: NormalizedIntensity;
  readonly resourceDepletion: NormalizedIntensity;
  readonly poorReturnTrend: NormalizedIntensity;
  readonly waterAccessPressure: NormalizedIntensity;
  readonly seasonalScarcity: NormalizedIntensity;
  readonly nomadicScalePressure: NormalizedIntensity;
  readonly logisticalInefficiency: NormalizedIntensity;
  readonly unknownResourceUncertainty: NormalizedIntensity;
  readonly staleResourceMemory: NormalizedIntensity;
  readonly fallbackFoodReliance: NormalizedIntensity;
  readonly poisoningFutureHook: NormalizedIntensity;
  readonly badWaterFutureHook: NormalizedIntensity;
  readonly predatorDangerFutureHook: NormalizedIntensity;
  readonly huntingInjuryFutureHook: NormalizedIntensity;
  readonly diseaseFutureHook: NormalizedIntensity;
  readonly storageFailureFutureHook: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface PerCapitaReturnState {
  readonly bandId: BandId;
  readonly anchorTileId: TileId;
  readonly season: Season;
  readonly populationDemand: number;
  readonly laborCapacity: number;
  readonly totalEffectiveYieldWithinRange: NormalizedIntensity;
  readonly perCapitaReturn: NormalizedIntensity;
  readonly travelCostToExploitRange: NormalizedIntensity;
  readonly crowdingPenalty: NormalizedIntensity;
  readonly riskPenalty: NormalizedIntensity;
  readonly nutritionDeficit: NormalizedIntensity;
  // Shared-catchment + raw/clamped support diagnostics (checkpoint 2J.1).
  readonly sharedCatchmentPressure: NormalizedIntensity;
  readonly realizedCatchmentTileCount: number;
  // M0.11 — sustained shared-catchment saturation coupling. When the local
  // population (own + nearby bands, radius 4) has exceeded the shared-divided
  // supportable capacity for at least two consecutive derivations, the excess
  // reduces the effective per-capita return. Bounded (penalty ≤ 0.5), derived
  // per tick (instantly recoverable when the crowd leaves), never truth-based.
  readonly sustainedOverCapacity: number;
  readonly saturationPenalty: NormalizedIntensity;
  readonly supportDebug: SupportRatioBreakdown;
  readonly reasonIds: readonly ReasonId[];
}

export type DensityPhase =
  | "founder_sparse_range"
  | "low_density"
  | "stable_use"
  | "saturated"
  | "over_capacity";

// Raw vs clamped support diagnostics (checkpoint 2J.1). The existing pipeline
// clamps the support ratio to 0..1 for stability, which hides whether a band is
// sitting on a large surplus or a real deficit. This breakdown exposes the
// pre-clamp truth alongside the clamped value actually used by behaviour, and
// attributes the losses (shared catchment overlap, local use, accessibility).
export interface SupportRatioBreakdown {
  // Solo reachable support: the band's catchment summed WITHOUT shared-catchment
  // division — i.e. the old "private food bubble" value, kept for comparison.
  readonly rawReachableSupport: number;
  // After shared-catchment division (overlapping bands split shared tiles) but
  // before accessibility/labour adjustment.
  readonly sharedReachableSupport: number;
  // After accessibility (travel) + labour adjustment — the support actually used.
  readonly adjustedReachableSupport: number;
  readonly adultEquivalentDemand: number;
  // Unclamped: adjustedReachableSupport / demand. >1 = surplus, <1 = deficit.
  readonly rawSupportRatio: number;
  readonly clampedSupportRatio: NormalizedIntensity;
  // Signed adult-equivalents of surplus (+) or deficit (-).
  readonly surplusDeficit: number;
  // 0 when in surplus; otherwise the fraction of demand unmet.
  readonly deficitRatio: NormalizedIntensity;
  // Fraction of solo support lost to overlapping catchments (0 = private, no overlap).
  readonly sharedPressurePenalty: NormalizedIntensity;
  // M0.14: mean realized yield share lost to PERSISTENT depletion across the
  // band's footprint (0 = pristine range) — accumulated wear, distinct from
  // the instantaneous shared/crowding pressure above.
  readonly footprintDepletionPenalty: NormalizedIntensity;
  readonly localUsePenalty: NormalizedIntensity;
  readonly accessibilityPenalty: NormalizedIntensity;
  readonly resourceClassPressureLoss: NormalizedIntensity;
  readonly pressureByResourceClass?: readonly ResourceClassPressureEffect[];
  readonly resourceClassContributions?: readonly ResourceClassPressureEffect[];
  readonly sharedPressureLoss?: number;
  readonly depletionLoss?: number;
  readonly accessCostLoss?: number;
  readonly nomadicScaleLoss?: number;
  readonly seasonalLoss?: number;
  readonly crowdingLoss?: number;
  // FAUNA/AQUATIC-1 — realized support removed by finite animal/aquatic stock
  // shortfall, and the realized animal / aquatic support actually drawn from
  // finite stocks (interpretability + audits). Optional / debug-only.
  readonly faunaSupportLoss?: number;
  readonly animalSupportRaw?: number;
  readonly aquaticSupportRaw?: number;
  readonly faunaCoveredTiles?: number;
  // ECO-BIOME-1 — realized support removed by finite plant-patch overharvest, the
  // realized plant-food support drawn, plant-covered footprint tiles, and the
  // mean processing-labor drag (useful-but-costly foods). Optional / debug-only.
  readonly plantSupportLoss?: number;
  readonly plantSupportRaw?: number;
  readonly plantCoveredTiles?: number;
  readonly processingLaborDrag?: number;
  readonly supportClampReason?: string;
  readonly ecologicalStressCauses?: EcologyStressCauseSummary;
  readonly nomadicScalePressure?: NomadicScalePressureState;
  // Bands sharing at least one catchment tile with this band (deterministic, sorted).
  readonly overlappingBandIds: readonly BandId[];
  // Realized known catchment size — distinguishes a genuinely sparse founder range
  // from a low-density large range so "low_density" is not misapplied.
  readonly realizedCatchmentTileCount: number;
  // 2K.9 — bounded band-specific learned usable-support folded into adjustedReachableSupport.
  // `realizedLearnedSupportDelta` is the capped adult-equivalent support the band's OWN learned
  // skill adds from its OWN known, matching, safe patches in the OCCUPIED range — damped per tile
  // by depletion (wear) and crowding (share) and naturally clamped to help only DEFICIT bands.
  // NEVER mutates global tile yield / terrain truth (noTruthRichnessLeak). `candidateProjected…`
  // is debug-only (what a best non-occupied known matched patch WOULD add after a move).
  readonly realizedLearnedSupportDelta?: number;
  readonly realizedLearnedSupportCapApplied?: boolean;
  readonly realizedLearnedSupportSourceClasses?: readonly string[];
  readonly realizedLearnedSupportBlockedReasons?: readonly string[];
  readonly candidateProjectedLearnedSupportDelta?: number;
  readonly noTruthRichnessLeak?: true;
  readonly activitySubsistenceSupplement?: ActivitySubsistenceSupplementState;
  readonly humanFoodLedger?: HumanFoodSupportLedger;
  readonly reasonIds: readonly ReasonId[];
}

export interface HumanFoodSupportLedger {
  readonly physicalPlantHarvest: number;
  readonly physicalFaunaHarvest: number;
  readonly aquaticHarvest: number;
  readonly storageContribution: number;
  readonly transitionalResidual: number;
  readonly grossPhysicalHarvest: number;
  readonly transportLoss: number;
  readonly processingLoss: number;
  readonly spoilageLoss: number;
  readonly accessLoss: number;
  readonly rawUsableHarvest: number;
  readonly harvestToSupportScale: number;
  readonly supportUnit: "adult_equivalent_season";
  readonly supportUnitContract: string;
  readonly totalUsableSupport: number;
  readonly populationDemand: number;
  readonly rawSupportRatio: number;
  readonly foodStress: NormalizedIntensity;
  readonly sourceReceipts: readonly PhysicalFoodHarvestRecord[];
  readonly sourceSeasonTick?: TickNumber;
  readonly genericCatchmentFoodConsumed: false;
  readonly residualRemovalPath: "none" | "replace_with_explicit_unmodeled_stock";
  readonly reasonIds: readonly ReasonId[];
}

export type KnownUnusedHabitatKind =
  | "known_unused"
  | "remembered_underused"
  | "inferred_corridor"
  | "scouted_viable"
  | "inherited_hint";

export type KnownUnusedHabitatBasis =
  | "personally_observed"
  | "remembered_place"
  | "river_corridor_inference"
  | "coast_corridor_inference"
  | "lake_wetland_chain"
  | "pass_corridor"
  | "scout_probe_result"
  | "inherited_memory"
  | "seasonal_round_memory";

export interface KnownUnusedHabitatOpportunity {
  readonly bandId: BandId;
  readonly candidateTileId: TileId;
  readonly opportunityKind: KnownUnusedHabitatKind;
  readonly baseHabitatPotential: NormalizedIntensity;
  readonly expectedEffectiveYield: NormalizedIntensity;
  readonly expectedPerCapitaReturn: NormalizedIntensity;
  readonly currentUsePressure: NormalizedIntensity;
  readonly currentCrowding: NormalizedIntensity;
  readonly waterReliability: NormalizedIntensity;
  readonly travelCost: NormalizedIntensity;
  readonly riskPenalty: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly consideredAsTarget: boolean;
  readonly rejectionReason?: string;
  // M0.13: how much the "better than current" comparison margin was relaxed by
  // sustained over-capacity (0 when uncrowded) — less competition is itself
  // worth something, so saturated bands accept equal-or-slightly-poorer
  // KNOWN empty land. Debug visibility for the audit.
  readonly competitionMarginRelaxed?: number;
  readonly suspiciousOpportunityIgnored: boolean;
  readonly basis: readonly KnownUnusedHabitatBasis[];
  readonly reasonIds: readonly ReasonId[];
}

export type DaughterColonizationAction =
  | "none"
  | "scout"
  | "probe"
  | "seek_new_range"
  | "fission_toward_opportunity"
  | "return_or_absorb";

export interface DaughterColonizationPressure {
  readonly bandId: BandId;
  readonly parentBandId?: BandId;
  readonly pressure: NormalizedIntensity;
  readonly parentRangeSaturation: NormalizedIntensity;
  readonly currentPerCapitaStress: NormalizedIntensity;
  readonly bestKnownUnusedHabitatOpportunity?: KnownUnusedHabitatOpportunity;
  readonly daughterRiskTolerance: NormalizedIntensity;
  readonly parentAttachmentPenalty: NormalizedIntensity;
  readonly travelRiskPenalty: NormalizedIntensity;
  readonly recommendedAction: DaughterColonizationAction;
  readonly reasonIds: readonly ReasonId[];
}

// Bounded rolling memory of recent per-capita return / support ratio (2J.1).
// Distinguishes one bad season from chronic decline so that mobility, probing and
// daughter dispersal respond to a trend, not a single noisy season. Deterministic
// and bounded (at most TREND_WINDOW_LONG entries).
export type ReturnTrendDirection = "rising" | "flat" | "declining";

export interface ReturnTrendMemory {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  // Most recent clamped support ratios, oldest first, bounded.
  readonly recentSupportRatios: readonly number[];
  // Most recent per-capita returns, oldest first, bounded.
  readonly recentPerCapitaReturns: readonly number[];
  readonly mean4: NormalizedIntensity;
  readonly mean8: NormalizedIntensity;
  // mean4 - mean8: negative = recent below longer-run (declining).
  readonly shortLongDelta: number;
  readonly trendDirection: ReturnTrendDirection;
  // Sustained decline across the window (not a single dip).
  readonly chronicDecline: boolean;
  // The latest season is notably below the longer-run mean, but the run is not
  // chronically declining — i.e. probably one bad season, not collapse.
  readonly oneBadSeason: boolean;
  readonly sampleCount: number;
  readonly reasonIds: readonly ReasonId[];
}

export type ExhaustedRangeStatus =
  | "comfortable"
  | "marginal_holding"
  | "probing_alternative"
  | "dispersing"
  | "held_by_attachment"
  | "held_by_water_refuge"
  | "trapped_no_known_alternative";

// Explicit audit of WHY a stressed band stays / probes / moves / fails to find a
// path out of a locally exhausted known range (2J.1). This never forces movement;
// it explains the outcome so emergent "stuck" behaviour is legible, not invisible.
export interface ExhaustedRangeAudit {
  readonly bandId: BandId;
  readonly status: ExhaustedRangeStatus;
  readonly stressLevel: NormalizedIntensity;
  readonly returnTrendDirection: ReturnTrendDirection;
  readonly chronicReturnDecline: boolean;
  readonly knownUnusedOpportunity: NormalizedIntensity;
  readonly hasViableKnownTarget: boolean;
  readonly routeConfidence: NormalizedIntensity;
  readonly attachmentHold: NormalizedIntensity;
  readonly waterRefugeHold: NormalizedIntensity;
  readonly daughterPressureWithoutTarget: boolean;
  // True when the anchor recommended staying but the band's final action moved it
  // (or vice-versa) on the most recent decision.
  readonly anchorOverrodeByMovement: boolean;
  // Belief-aware fields (2K.1F): the band's own resource-belief opportunity, whether
  // it is only an inferred (low-confidence) hunch, and whether the situation reads as
  // "probe before relocating" (a believable opportunity exists but a hold/uncertainty
  // suppresses residential movement, not scouting). Debug only — no behaviour.
  readonly beliefOpportunityScore: NormalizedIntensity;
  readonly onlyInferredOpportunity: boolean;
  readonly probeSuggestedBeforeRelocation: boolean;
  readonly reasonIds: readonly ReasonId[];
}

export type AnchorRecommendation =
  | "stay_anchor"
  | "logistical_foray"
  | "residential_relocation"
  | "none";

export type FinalActionKind =
  | "stayed"
  | "moved"
  | "explored"
  | "probed"
  | "other";

// Reconciles the pre-decision residential-anchor recommendation with the final
// chosen action so reports never show "stay_anchor" next to a band that actually
// moved without an explicit override reason (2J.1, requirement 6).
export interface AnchorActionTrace {
  readonly bandId: BandId;
  readonly anchorRecommendation: AnchorRecommendation;
  readonly finalAction: FinalActionKind;
  readonly residenceMoved: boolean;
  readonly overrodeAnchor: boolean;
  readonly overrideReason?: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface CarryingCapacityState {
  readonly bandId: BandId;
  readonly baseHabitatPotential: BaseHabitatPotential;
  readonly seasonalEffectiveYield: SeasonalEffectiveYield;
  readonly populationDemand: PopulationDemandState;
  readonly perCapitaReturn: PerCapitaReturnState;
  readonly knownUnusedHabitat?: KnownUnusedHabitatOpportunity;
  readonly daughterColonization: DaughterColonizationPressure;
  readonly returnTrend?: ReturnTrendMemory;
  readonly exhaustedRangeAudit?: ExhaustedRangeAudit;
  // Resource Class Framework (2K): deterministic decomposition of the current-tile
  // habitat potential into typed resource classes (food-domain support contributions
  // sum to ~basePotential). ECO-MIG foundation makes class pressure a bounded
  // support loss while preserving the same band-known input boundary.
  readonly resourceClassSummary?: ResourceClassAvailabilitySummary;
  readonly nomadicScalePressure?: NomadicScalePressureState;
  readonly ecologicalStressCauses?: EcologyStressCauseSummary;
  readonly reasonIds: readonly ReasonId[];
}

export type BandLineageRelation =
  | "amicable_split"
  | "pressure_split"
  | "frontier_split"
  | "stress_split";

export interface BandLineageLink {
  readonly parentBandId: BandId;
  readonly daughterBandId: BandId;
  readonly createdAt: WorldTime;
  readonly originTileId: TileId;
  readonly relation: BandLineageRelation;
  readonly contactMemory: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface BandFissionEvent {
  readonly id: EventId;
  readonly time: WorldTime;
  readonly tick: TickNumber;
  readonly parentBandId: BandId;
  readonly daughterBandId: BandId;
  readonly splitReason: Reason;
  readonly parentPopulationBefore: number;
  readonly daughterPopulation: number;
  readonly parentPopulationAfter: number;
  readonly originTileId: TileId;
  readonly targetTileId?: TileId;
  readonly inheritedKnowledgeCount: number;
  readonly inheritedMemoryCount: number;
  readonly inheritedCrossingCount: number;
  readonly inheritedCorridorCount: number;
  // Resource knowledge inheritance audit (2K.1D): parent's count vs the partial
  // degraded subset the daughter received (must be < parent, never a full copy).
  readonly parentResourceMemoryCount: number;
  readonly inheritedResourceMemoryCount: number;
  // Average transmission detail-loss across the inherited subset (0 = perfect copy,
  // which must never happen; > 0 confirms degradation).
  readonly inheritedResourceAvgDetailLoss: number;
  readonly worldPopulationBeforeFission: number;
  readonly worldPopulationAfterFission: number;
  readonly fissionPopulationConserved: boolean;
}

export interface BandInheritanceProfile {
  readonly inheritedKnownTileCount: number;
  readonly physicallySeenOnSpawnCount: number;
  readonly inheritedRumorCount: number;
  readonly inheritedMemoryCount: number;
  readonly inheritedCrossingCount: number;
  readonly inheritedCorridorHintCount: number;
  readonly inheritedRouteHintTileCount: number;
  readonly personallyObservedTileCount: number;
  readonly inheritedKnowledgeShare: NormalizedIntensity;
  readonly averageInheritedConfidence: NormalizedIntensity;
  readonly parentKnownTileCount: number;
  readonly parentMemoryCount: number;
  readonly parentCorridorCount: number;
}

// ===========================================================================
// DEEP-TIME-HISTORY-TECH-1 — durable per-band history substrate (the
// Historical Memory Pyramid). Persisted on Band.deepHistory, written ONLY by
// src/sim/agents/bandHistory.ts (creation sites + one spring-gated yearly
// observation pass). OBSERVE-ONLY: no decision path reads any of this state.
// Every record is evidence-backed: it points at real sim state (fission event
// ids, churn years, reason ids, place/route/crossing keys) and never invents
// claims — unprovable fields stay undefined.
// ===========================================================================

export type HistoryRecordKind = "recorded_event" | "compressed_pattern" | "inferred_arc";
export type HistoryProvenance = "lived" | "inherited";
export type BandFoundingKind = "origin_spawn" | "fission_daughter";

export type HistoryEvidenceKind =
  | "creation_record"
  | "fission_event"
  | "lineage_link"
  | "demographic_churn"
  | "seasonal_support"
  | "viability_record"
  | "place_memory"
  | "route_memory"
  | "crossing_memory"
  | "movement_record"
  | "knowledge_breadth"
  | "pressure_state"
  | "inherited_summary";

export interface HistoryEvidenceRef {
  readonly kind: HistoryEvidenceKind;
  readonly ids: readonly string[]; // capped at MAX_EVIDENCE_IDS_PER_REF
}

export interface BandFoundingSnapshot {
  readonly bandId: BandId;
  readonly kind: BandFoundingKind;
  readonly foundedAt: WorldTime;
  readonly foundingTileId: TileId;
  // Founding-tile physical context, recorded from the tile at creation time.
  readonly foundingTileWaterAccess?: number;
  readonly foundingTileIsRiverbank?: boolean;
  readonly foundingTileIsCoastal?: boolean;
  readonly foundingTileIsFloodplain?: boolean;
  // Origin bands: the spawn profile role; daughters: the lineage relation label.
  readonly creationCause?: string;
  readonly creationReasonIds: readonly ReasonId[];
  readonly startingPopulation: number;
  readonly startingDependents: number;
  readonly startingWorkingAdults: number;
  readonly startingElders: number;
  readonly startingKnownTileCount: number;
  readonly startingPlaceMemoryCount: number;
  readonly startingCorridorCount: number;
  readonly startingCrossingCount: number;
  // Fission-only block (all undefined for origin bands — never fabricated).
  readonly parentBandId?: BandId;
  readonly parentOriginTileId?: TileId;
  readonly relation?: BandLineageRelation;
  readonly parentPopulationBefore?: number;
  readonly parentFoodStressAtSplit?: NormalizedIntensity;
  readonly parentWaterStressAtSplit?: NormalizedIntensity;
  readonly parentHungerClassificationAtSplit?: SeasonalHungerClassification;
  readonly parentExtinctionRiskAtSplit?: NormalizedIntensity;
  readonly inheritedKnowledgeCount?: number;
  readonly inheritedMemoryCount?: number;
  readonly inheritedCorridorCount?: number;
  readonly inheritedCrossingCount?: number;
  readonly evidence: readonly HistoryEvidenceRef[];
  // Honesty list: founding facts the sim could NOT prove at creation (e.g.
  // "parentSeasonalSupport" when the parent had no support state yet).
  readonly unknownAtFounding: readonly string[];
}

export type BandEraHeadline =
  | "steady_years"
  | "growth_years"
  | "hardship_years"
  | "loss_years"
  | "recovery_years"
  | "branching_years"
  | "wandering_years"
  | "settling_years";

export type BandEraCloseTrigger =
  | "interval_elapsed"
  | "population_loss"
  | "population_recovery"
  | "fission"
  | "relocation_shift"
  | "long_crisis"
  | "terminal";

export interface BandEraRecord {
  readonly id: string; // era:<bandId>:<startYear>
  readonly startYear: number;
  readonly endYear: number;
  readonly closeTrigger: BandEraCloseTrigger;
  readonly headline: BandEraHeadline;
  readonly populationStart: number;
  readonly populationEnd: number;
  readonly populationMin: number;
  readonly populationMax: number;
  readonly births: number;
  readonly deaths: number;
  readonly crisisDeaths: number;
  readonly hungerYears: number;
  readonly waterStressYears: number;
  readonly recoveryYears: number;
  readonly fissionCount: number;
  readonly daughterBandIds: readonly BandId[]; // capped
  readonly movesCount: number;
  readonly startTileId: TileId;
  readonly endTileId: TileId;
  readonly evidence: readonly HistoryEvidenceRef[];
  readonly recordKind: HistoryRecordKind; // "compressed_pattern" for normal eras
  readonly confidence: NormalizedIntensity;
  // Deterministic deep-past compression: true when this record is a merge of
  // two older adjacent eras (counters summed, min/max folded, evidence unioned).
  readonly merged: boolean;
  readonly mergedSpanCount: number; // 1 for an unmerged era
}

export interface OpenEraAccumulator {
  readonly startYear: number;
  readonly startTileId: TileId;
  readonly populationStart: number;
  readonly populationMin: number;
  readonly populationMax: number;
  readonly births: number;
  readonly deaths: number;
  readonly crisisDeaths: number;
  readonly hungerYears: number;
  readonly waterStressYears: number;
  readonly recoveryYears: number;
  readonly fissionCount: number;
  readonly daughterBandIds: readonly BandId[];
  readonly movesCount: number;
  readonly yearsAccumulated: number;
  // Consecutive yearly observations at ≥ RELOCATION_MIN_DISTANCE_TILES from startTileId.
  readonly awayFromStartYears: number;
}

export type BandEpisodeType =
  | "population_thinned"
  | "population_recovered"
  | "daughter_branch_formed"
  | "long_hunger_period"
  | "water_caution_period"
  | "route_became_memory"
  | "country_expanded"
  | "camp_became_home"
  | "hard_crossing_remembered"
  | "fallback_reliance_period"
  | "near_collapse"
  | "band_absorbed_end"
  | "band_collapsed_end";

export interface BandHistoricalEpisode {
  readonly id: string; // episode:<bandId>:<type>:<subjectKey>
  readonly type: BandEpisodeType;
  readonly startYear: number;
  readonly endYear?: number; // undefined while ongoing
  readonly ongoing: boolean;
  readonly severity: NormalizedIntensity;
  readonly relatedTileId?: TileId;
  readonly relatedRouteId?: RouteId;
  readonly relatedBandId?: BandId;
  // Machine-readable compact label (UI-safe words, NOT final prose).
  readonly summary: string;
  // Compact numeric facts backing the record (popBefore/popAfter/streak/useCount…).
  readonly detail: Readonly<Record<string, number>>;
  readonly evidence: readonly HistoryEvidenceRef[];
  readonly recordKind: HistoryRecordKind;
  readonly confidence: NormalizedIntensity;
  readonly occurrenceCount: number;
  readonly lastUpdatedYear: number;
  readonly provenance: HistoryProvenance;
  readonly inheritedFromBandId?: BandId;
}

export interface InheritedEraSummary {
  readonly sourceBandId: BandId;
  readonly startYear: number;
  readonly endYear: number;
  readonly headline: BandEraHeadline;
  readonly populationEnd: number;
}

export interface AncestryEntry {
  readonly bandId: BandId;
  readonly foundedYear: number;
  readonly kind: BandFoundingKind;
}

export interface BandTerminalRecord {
  readonly year: number;
  readonly cause: "absorbed" | "collapsed";
  readonly absorbedByBandId?: BandId;
  readonly populationAtEnd: number;
  readonly evidence: readonly HistoryEvidenceRef[];
}

export interface BandHistoryTrackingState {
  readonly lastObservedTick: TickNumber;
  readonly lastObservedYear: number;
  readonly populationPeak: number;
  readonly populationPeakYear: number;
  readonly populationTrough: number;
  readonly populationTroughYear: number;
  readonly knownBreadthBaseline: number;
  readonly fallbackRelianceYears: number;
}

export interface BandDeepHistoryCaps {
  readonly maxEraRecords: number;
  readonly maxEpisodes: number;
  readonly maxInheritedEpisodes: number;
  readonly maxInheritedEraSummaries: number;
  readonly maxAncestryEntries: number;
  readonly erasMergedCount: number;
  readonly episodesDroppedCount: number;
  readonly capsHeld: boolean;
}

export interface BandDeepHistoryState {
  readonly bandId: BandId;
  readonly founding: BandFoundingSnapshot;
  readonly eras: readonly BandEraRecord[]; // oldest → newest
  readonly openEra?: OpenEraAccumulator; // undefined once terminal
  readonly episodes: readonly BandHistoricalEpisode[]; // lived; sorted startYear then id
  readonly inheritedEpisodes: readonly BandHistoricalEpisode[]; // provenance "inherited"
  readonly inheritedEraSummaries: readonly InheritedEraSummary[];
  readonly ancestryLine: readonly AncestryEntry[]; // oldest ancestor first
  readonly terminalRecord?: BandTerminalRecord;
  readonly tracking: BandHistoryTrackingState;
  readonly caps: BandDeepHistoryCaps;
  readonly integrity: {
    readonly observeOnly: true;
    readonly noBehaviorInfluence: true;
    readonly evidenceBacked: true;
    readonly noInventedClaims: true;
  };
  readonly lastAdvancedYear: number;
  readonly payloadBytesEstimate: number;
}

export interface LocalUsePressureRecord {
  readonly tileId: TileId;
  readonly bandId: BandId;
  readonly firstUsedAt: WorldTime;
  readonly lastUsedAt: WorldTime;
  readonly useTicks: number;
  readonly consecutiveUseTicks: number;
  readonly recentUseIntensity: NormalizedIntensity;
  readonly foragingPressure: NormalizedIntensity;
  readonly aquaticPressure: NormalizedIntensity;
  readonly waterPressure: NormalizedIntensity;
  readonly recoveryProgress: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  // Resource Class Framework (2K) slot: per-resource-class use pressure, for future
  // per-resource depletion/regrowth. Populated conservatively in the carrying-capacity
  // resource summary for now; this substrate slot will become the per-record home (2K.1).
  readonly pressureByClass?: readonly { readonly classId: ResourceClassId; readonly pressure: NormalizedIntensity }[];
  readonly reasonIds: readonly ReasonId[];
}

export interface BandPressureState {
  readonly tick: TickNumber;
  readonly time: WorldTime;
  readonly foodStress: NormalizedIntensity;
  readonly foodMovementPressure?: NormalizedIntensity;
  readonly foodStressSource?: "canonical_physical_support_history";
  readonly waterStress: NormalizedIntensity;
  readonly mobilityPressure: NormalizedIntensity;
  readonly fatiguePressure: NormalizedIntensity;
  readonly riskPressure: NormalizedIntensity;
  readonly placeAttachmentPull: NormalizedIntensity;
  readonly netMovePressure: NormalizedIntensity;
  readonly nearbyBandPressure: NormalizedIntensity;
  readonly parentCoreOverlap: NormalizedIntensity;
  readonly daughterDispersalPressure: NormalizedIntensity;
  readonly inheritedFamiliarityPull: NormalizedIntensity;
  readonly safeFrontierPull: NormalizedIntensity;
  readonly crowdingPenalty: NormalizedIntensity;
  readonly protoCampReturnBias?: NormalizedIntensity;
  readonly protoCampMoveAwayPressure?: NormalizedIntensity;
  readonly accessSensitiveCautionBias?: NormalizedIntensity;
  readonly accessToleranceReductionBias?: NormalizedIntensity;
  readonly accessKinToleranceReliefBias?: NormalizedIntensity;
  readonly accessContestedAvoidanceBias?: NormalizedIntensity;
  readonly accessExpectedReturnBias?: NormalizedIntensity;
  readonly adaptationRiskToleranceModifier?: NormalizedIntensity;
  readonly adaptationFallbackExpansionBias?: NormalizedIntensity;
  readonly adaptationNearbyProbeBias?: NormalizedIntensity;
  readonly adaptationTripAbandonmentBias?: NormalizedIntensity;
  readonly adaptationCrisisBreakawayPressure?: NormalizedIntensity;
  readonly adaptationSocialScarcityTension?: NormalizedIntensity;
  readonly logisticsWeatherCautionBias?: NormalizedIntensity;
  readonly logisticsSicknessActivityPenalty?: NormalizedIntensity;
  readonly logisticsCareTravelBurdenBias?: NormalizedIntensity;
  readonly logisticsCarryConstraintBias?: NormalizedIntensity;
  readonly logisticsMaterialWearPenalty?: NormalizedIntensity;
  readonly logisticsCampCleanlinessMoveAwayBias?: NormalizedIntensity;
  readonly logisticsSharingTensionBias?: NormalizedIntensity;
  readonly logisticsFireExposureReliefBias?: NormalizedIntensity;
  readonly logisticsOpportunisticFoodBias?: NormalizedIntensity;
  readonly relationshipPracticeEfficiencyBias?: NormalizedIntensity;
  readonly relationshipAnimalCautionBias?: NormalizedIntensity;
  readonly relationshipScavengerRiskBias?: NormalizedIntensity;
  readonly relationshipAggregationToleranceBias?: NormalizedIntensity;
  readonly relationshipReputationToleranceBias?: NormalizedIntensity;
  readonly relationshipFailureCautionBias?: NormalizedIntensity;
  readonly relationshipPlaceCharacterPull?: NormalizedIntensity;
  readonly relationshipRouteConfidenceBias?: NormalizedIntensity;
  // CAUSAL-REPAIR-1 — bounded escalation from repeated low-support evidence
  // (chronicHardship.ts). Raises mobility/net move pressure so a declining band
  // gets MORE push to act, not less. Capped by MOVE_PRESSURE_BOOST_CAP.
  readonly chronicHardshipEscalation?: NormalizedIntensity;
  readonly crowdingBandIds: readonly BandId[];
  readonly confidence: NormalizedIntensity;
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface NearbyBandPressure {
  readonly tileId: TileId;
  readonly nearbyBandCount: number;
  readonly weightedCrowding: NormalizedIntensity;
  readonly parentOverlap: NormalizedIntensity;
  readonly daughterOverlap: NormalizedIntensity;
  readonly pressureBandIds: readonly BandId[];
  readonly confidence: NormalizedIntensity;
}

export interface DaughterDispersalPressure {
  readonly tileId: TileId;
  readonly parentCoreOverlap: NormalizedIntensity;
  readonly daughterDispersalPressure: NormalizedIntensity;
  readonly inheritedFamiliarityPull: NormalizedIntensity;
  readonly safeFrontierPull: NormalizedIntensity;
  readonly kinTolerance: NormalizedIntensity;
  readonly kinSafety: NormalizedIntensity;
  readonly kinCoreCrowding: NormalizedIntensity;
  readonly earlyDispersalUrgency: NormalizedIntensity;
  readonly pressureBandIds: readonly BandId[];
  readonly confidence: NormalizedIntensity;
}

export type ForagingAdaptationMode =
  | "stable"
  | "pressured"
  | "hungry"
  | "desperate"
  | "recovering";

export type EmpiricalResourceLearningStatus =
  | "not_known"
  | "suspected"
  | "watched"
  | "cautiously_known"
  | "known_useful"
  | "known_poor"
  | "known_risky";

export interface EmpiricalResourceLearningRecord {
  readonly tileId: TileId;
  readonly resourceClassId: ResourceClassId;
  readonly status: EmpiricalResourceLearningStatus;
  readonly knowledgeState: ResourceKnowledgeStateKind;
  readonly source: string;
  readonly proximityCount: number;
  readonly visitCount: number;
  readonly testCount: number;
  readonly observedSeasons: readonly Season[];
  readonly confidence: NormalizedIntensity;
  readonly fallbackStatus: "none" | "candidate" | "fallback_only" | "emergency";
  readonly riskStatus: "low" | "moderate" | "high" | "known_risk";
  readonly gatedReason: string;
  readonly unlockHint: string;
  readonly reasonIds: readonly ReasonId[];
}

export type FallbackDietExpansionLevel =
  | "none"
  | "watching"
  | "testing"
  | "expanded"
  | "emergency";

export interface FallbackDietCandidate {
  readonly tileId: TileId;
  readonly resourceClassId: ResourceClassId;
  readonly level: FallbackDietExpansionLevel;
  readonly laborCost: NormalizedIntensity;
  readonly riskCost: NormalizedIntensity;
  readonly dietQualityPenalty: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly expectedUsefulness: NormalizedIntensity;
  readonly reason: string;
  readonly reasonIds: readonly ReasonId[];
}

export type TripAdaptationAction =
  | "continue"
  | "watch"
  | "reduce_confidence"
  | "abandon_temporarily"
  | "recovering_after_success";

export interface ForagingTripFailureMemory {
  readonly tileId: TileId;
  readonly resourceClassId?: ResourceClassId;
  readonly taskGroupType: IntraSeasonTripTaskGroupType;
  readonly recentTripCount: number;
  readonly failureCount: number;
  readonly lowReturnCount: number;
  readonly successCount: number;
  readonly longestDistanceTiles: number;
  readonly meanReturn: NormalizedIntensity;
  readonly confidencePenalty: NormalizedIntensity;
  readonly action: TripAdaptationAction;
  readonly restTicksSuggested: number;
  readonly recoveredBySuccess: boolean;
  readonly reasonIds: readonly ReasonId[];
}

export interface NearbyForagingOpportunityProbe {
  readonly tileId: TileId;
  readonly distanceTiles: number;
  readonly relativeOpportunity: NormalizedIntensity;
  readonly probeReadiness: NormalizedIntensity;
  readonly currentOverCapacity: NormalizedIntensity;
  readonly riskPenalty: NormalizedIntensity;
  readonly distancePenalty: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly comparison: "nearby_probe" | "distant_wait" | "not_enough_known";
  readonly reasonIds: readonly ReasonId[];
}

export type RepetitionAffordanceDomain =
  | "fiber_handling"
  | "food_processing"
  | "food_work"
  | "crossing"
  | "camp_setup"
  | "route_use"
  | "material_handling";

export type RepetitionFeedbackQuality =
  | "low_feedback"
  | "mixed_feedback"
  | "useful_feedback"
  | "negative_feedback"
  | "context_bound_feedback";

export type RepetitionImprovementPotential =
  | "none_yet"
  | "weak"
  | "possible"
  | "strong_if_feedback_improves";

export type RepetitionDeadEndRisk =
  | "low"
  | "low_feedback_risk"
  | "dead_end_attempt"
  | "false_confidence_risk"
  | "local_context_only"
  | "reinforced_bad_habit";

export type RepetitionFamiliarityStatus =
  | "familiarity_without_proven_skill"
  | "future_practice_potential"
  | "marginal_routine"
  | "dead_end_attempt"
  | "false_confidence_risk"
  | "local_context_only";

export interface RepetitionAffordanceItem {
  readonly id: string;
  readonly domain: RepetitionAffordanceDomain;
  readonly title: string;
  readonly summary: string;
  readonly repeatedExposureCount: number;
  readonly repeatedAttemptSignal: number;
  readonly feedbackQuality: RepetitionFeedbackQuality;
  readonly improvementPotential: RepetitionImprovementPotential;
  readonly deadEndRisk: RepetitionDeadEndRisk;
  readonly familiarityStatus: RepetitionFamiliarityStatus;
  readonly evidenceLabels: readonly string[];
  readonly futureHook: "practice_experimentation";
  readonly noSkillUnlocked: true;
  readonly noAutomaticImprovement: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface ForagingAdaptationBehavior {
  readonly riskToleranceModifier: NormalizedIntensity;
  readonly fallbackExpansionBias: NormalizedIntensity;
  readonly tripAbandonmentBias: NormalizedIntensity;
  readonly nearbyProbeBias: NormalizedIntensity;
  readonly movementDebateBias: NormalizedIntensity;
  readonly socialScarcityTension: NormalizedIntensity;
  readonly crisisBreakawayPressure: NormalizedIntensity;
  readonly maxBehaviorHook: NormalizedIntensity;
  readonly reversible: true;
  readonly noCultureLadder: true;
  readonly noAgriculture: true;
  readonly noVillageSedentism: true;
  readonly noStorageEconomy: true;
  readonly noWarTerritory: true;
}

export interface CrisisBreakawayPressureState {
  readonly active: boolean;
  readonly pressure: NormalizedIntensity;
  readonly belowPeacefulFissionThreshold: boolean;
  readonly severeGroundedPressure: boolean;
  readonly knownRiskyDestination?: TileId;
  readonly adultLaborEnough: boolean;
  readonly noSafeAcceptedSolution: boolean;
  readonly reasonIds: readonly ReasonId[];
  readonly noWar: true;
  readonly noForcedConflict: true;
}

export interface ForagingLearningAdaptationState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly mode: ForagingAdaptationMode;
  readonly hungerSeverity: NormalizedIntensity;
  readonly hungerStreak: number;
  readonly recoverySignal: NormalizedIntensity;
  readonly learningRecords: readonly EmpiricalResourceLearningRecord[];
  readonly fallbackCandidates: readonly FallbackDietCandidate[];
  readonly tripFailureMemories: readonly ForagingTripFailureMemory[];
  readonly nearbyOpportunityProbes: readonly NearbyForagingOpportunityProbe[];
  readonly repetitionAffordances: readonly RepetitionAffordanceItem[];
  readonly behavior: ForagingAdaptationBehavior;
  readonly crisisBreakaway: CrisisBreakawayPressureState;
  readonly knowledgeUpdatedTileIds: readonly TileId[];
  readonly learningRecordCap: number;
  readonly fallbackCandidateCap: number;
  readonly tripFailureCap: number;
  readonly nearbyProbeCap: number;
  readonly repetitionAffordanceCap: number;
  readonly candidateTileCap: number;
  readonly antiOmniscience: {
    readonly fromBandKnownTilesOnly: boolean;
    readonly hiddenPatchTruthUsed: false;
    readonly hiddenBandTruthUsed: false;
    readonly unseenPatchesRemainUnknown: true;
  };
  readonly capsHeld: boolean;
  readonly noCultureLadder: true;
  readonly noAgriculture: true;
  readonly noVillageSedentism: true;
  readonly noStorageEconomy: true;
  readonly noNamedPeople: true;
  readonly noWarTerritory: true;
  readonly reasonIds: readonly ReasonId[];
}

export type BodyCampLogisticsMode =
  | "stable"
  | "strained"
  | "sick"
  | "overburdened"
  | "weather_pinned"
  | "recovering";

export type WeatherMemoryKind =
  | "cold_exposure"
  | "heat_drought"
  | "wet_travel"
  | "bad_crossing_season"
  | "dry_water_stress"
  | "floodplain_wetland";

export type WeatherMemoryTrend = "forming" | "reinforced" | "fading" | "recovered";

export interface WeatherMemoryRecord {
  readonly kind: WeatherMemoryKind;
  readonly strength: NormalizedIntensity;
  readonly staleness: NormalizedIntensity;
  readonly trend: WeatherMemoryTrend;
  readonly routeCaution: NormalizedIntensity;
  readonly fireNeed: NormalizedIntensity;
  readonly childElderRisk: NormalizedIntensity;
  readonly source: string;
  readonly sourceReasonIds: readonly ReasonId[];
}

export type FireUseStatus =
  | "not_relevant"
  | "useful"
  | "limited_by_fuel"
  | "strained"
  | "risky";

export interface FireUseState {
  readonly status: FireUseStatus;
  readonly need: NormalizedIntensity;
  readonly usefulness: NormalizedIntensity;
  readonly fuelBasis: NormalizedIntensity;
  readonly materialConfidence: NormalizedIntensity;
  readonly warmthValue: NormalizedIntensity;
  readonly processingValue: NormalizedIntensity;
  readonly smokeDeterrenceValue: NormalizedIntensity;
  readonly fuelPressure: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly fireRisk: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  readonly noPermanentHearth: true;
  readonly noTechnologyTree: true;
}

export type SicknessCauseKind =
  | "bad_water"
  | "spoiled_food"
  | "risky_fallback_food"
  | "cold_exposure"
  | "heat_stress"
  | "camp_waste"
  | "crowding"
  | "poor_diet"
  | "wetland_insects";

export interface SicknessWaveState {
  readonly active: boolean;
  readonly severity: NormalizedIntensity;
  readonly durationEstimate: "none" | "short" | "several_days" | "season_background";
  readonly recoverySignal: NormalizedIntensity;
  readonly causeKinds: readonly SicknessCauseKind[];
  readonly activityPenalty: NormalizedIntensity;
  readonly careBurden: NormalizedIntensity;
  readonly travelCaution: NormalizedIntensity;
  readonly mortalityPressureBump: NormalizedIntensity;
  readonly fertilitySuppressionBump: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  readonly bounded: true;
  readonly noNamedSickPeople: true;
  readonly noSuddenMassDeath: true;
}

export interface CareTravelBurdenState {
  readonly dependentCarryBurden: NormalizedIntensity;
  readonly elderTravelCaution: NormalizedIntensity;
  readonly pregnancyNursingBurden: NormalizedIntensity;
  readonly sickCareBurden: NormalizedIntensity;
  readonly wholeBandCrossingBurden: NormalizedIntensity;
  readonly longMoveBurden: NormalizedIntensity;
  readonly coldHeatVulnerability: NormalizedIntensity;
  readonly adultLaborAvailable: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  readonly aggregateOnly: true;
}

export interface LogisticCapacityState {
  readonly state: "comfortable" | "tight" | "strained" | "overloaded";
  readonly capacity: NormalizedIntensity;
  readonly spareAdultLabor: NormalizedIntensity;
  readonly carryingLoad: NormalizedIntensity;
  readonly processingLoad: NormalizedIntensity;
  readonly travelLoad: NormalizedIntensity;
  readonly crossingLoad: NormalizedIntensity;
  readonly careLoad: NormalizedIntensity;
  readonly limitingReason: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noInventorySimulation: true;
}

export type MaterialWearCategory =
  | "carrying_gear"
  | "cordage_fiber"
  | "containers_wraps"
  | "hunting_gear"
  | "fishing_gear"
  | "fire_processing_material"
  | "crossing_lashings";

export interface MaterialWearRecord {
  readonly category: MaterialWearCategory;
  readonly condition: "good" | "worn" | "strained" | "failing" | "recovering";
  readonly wear: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly materialBasis: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly consequence: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface OpportunisticFoodCandidate {
  readonly kind:
    | "carrion_leftover"
    | "stranded_fish"
    | "eggs_nests"
    | "insects_small_animals"
    | "shellfish_wetland_find"
    | "post_weather_find";
  readonly tileId?: TileId;
  readonly usefulness: NormalizedIntensity;
  readonly risk: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly reliability: NormalizedIntensity;
  readonly triggeredBy: string;
  readonly reasonIds: readonly ReasonId[];
  readonly notStableSurplus: true;
}

export interface FoodSharingPressureState {
  readonly state: "easy_sharing" | "watchful_sharing" | "strained_sharing" | "ration_like_caution" | "relief";
  readonly pressure: NormalizedIntensity;
  readonly dependencyLoad: NormalizedIntensity;
  readonly lowReturnLoad: NormalizedIntensity;
  readonly careLoad: NormalizedIntensity;
  readonly accessCrowdingLoad: NormalizedIntensity;
  readonly recoveryRelief: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  readonly noOwnershipProperty: true;
}

export interface CampCleanlinessState {
  readonly state: "clean" | "watchful" | "dirty" | "waste_pressure" | "recovering";
  readonly pressure: NormalizedIntensity;
  readonly repeatedStayLoad: NormalizedIntensity;
  readonly wetCampLoad: NormalizedIntensity;
  readonly processingWasteLoad: NormalizedIntensity;
  readonly sicknessLoad: NormalizedIntensity;
  readonly scavengerPressure: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly movementDebate: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  readonly noSanitationTech: true;
}

export interface SeasonalTaskPriority {
  readonly category:
    | "plant_observation"
    | "water_wetland_work"
    | "processing_firewood"
    | "winter_shelter_fire"
    | "dry_water_refuge"
    | "fallback_scavenging"
    | "repair_materials"
    | "rest_recovery";
  readonly urgency: NormalizedIntensity;
  readonly reason: string;
  readonly source: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface BodyCampLogisticsBehavior {
  readonly weatherRouteCautionBias: NormalizedIntensity;
  readonly sicknessActivityPenalty: NormalizedIntensity;
  readonly careTravelBurdenBias: NormalizedIntensity;
  readonly carryConstraintBias: NormalizedIntensity;
  readonly materialWearPenalty: NormalizedIntensity;
  readonly campCleanlinessMoveAwayBias: NormalizedIntensity;
  readonly sharingTensionBias: NormalizedIntensity;
  readonly fireExposureReliefBias: NormalizedIntensity;
  readonly opportunisticFoodBias: NormalizedIntensity;
  readonly maxBehaviorHook: NormalizedIntensity;
  readonly reversible: true;
  readonly noMagicBuff: true;
  readonly noPermanentPenalty: true;
}

// INVENTION-3 — bounded physical camp-exposure coefficient. Derived each
// season at the residence from tile risk profile, terrain, season, climate
// regime and the band's own camp state; a practiced shelter response relieves
// a capped share of the MATCHING exposure kind. Downstream: sickness-wave
// severity and child/elder weather risk (both already feed demography).
export type CampExposureKind = "heat" | "cold" | "wet" | "wind" | "mixed" | "mild";

export interface CampExposureState {
  readonly tileId: TileId;
  // Raw physical exposure before any shelter practice (0..1).
  readonly rawExposure: NormalizedIntensity;
  // Exposure actually experienced after the shelter relief (0..1).
  readonly effectiveExposure: NormalizedIntensity;
  readonly dominantKind: CampExposureKind;
  readonly heat: NormalizedIntensity;
  readonly cold: NormalizedIntensity;
  readonly wet: NormalizedIntensity;
  readonly wind: NormalizedIntensity;
  readonly shelterReliefApplied: NormalizedIntensity;
  readonly shelterResponseId?: string;
  readonly shelterVariantKey?: string;
  readonly shelterContextMatched: boolean;
  readonly reliefReason: string;
}

export interface BodyCampSurvivalLogisticsState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly mode: BodyCampLogisticsMode;
  readonly weatherMemories: readonly WeatherMemoryRecord[];
  readonly fire: FireUseState;
  readonly sickness: SicknessWaveState;
  // INVENTION-3: optional only for pre-pass fixtures; live derivation always
  // populates it.
  readonly campExposure?: CampExposureState;
  readonly careTravelBurden: CareTravelBurdenState;
  readonly logisticCapacity: LogisticCapacityState;
  readonly materialWear: readonly MaterialWearRecord[];
  readonly opportunisticFoodCandidates: readonly OpportunisticFoodCandidate[];
  readonly sharingPressure: FoodSharingPressureState;
  readonly campCleanliness: CampCleanlinessState;
  readonly seasonalTasks: readonly SeasonalTaskPriority[];
  readonly behavior: BodyCampLogisticsBehavior;
  readonly caps: {
    readonly weatherMemoryCap: number;
    readonly materialWearCap: number;
    readonly opportunisticFoodCap: number;
    readonly seasonalTaskCap: number;
  };
  readonly antiOmniscience: {
    readonly fromBandKnownInputsOnly: true;
    readonly hiddenResourceTruthUsed: false;
    readonly hiddenBandTruthUsed: false;
    readonly hiddenWeatherTruthUsed: false;
  };
  readonly capsHeld: boolean;
  readonly noCultureSystem: true;
  readonly noReligionMyth: true;
  readonly noAgriculture: true;
  readonly noVillageSedentism: true;
  readonly noStorageEconomy: true;
  readonly noPropertyLawTerritoryWar: true;
  readonly noNamedPeople: true;
  readonly reasonIds: readonly ReasonId[];
}

export type RelationshipMemoryMode =
  | "quiet"
  | "practiced"
  | "watchful_animals"
  | "seasonal_gathering"
  | "failure_remembered"
  | "socially_tangled"
  | "route_familiar";

export type PracticalSkillKind =
  | "fishing_aquatic"
  | "plant_gathering"
  | "fallback_food_handling"
  | "hunting_tracking"
  | "forest_movement"
  | "river_crossing"
  | "storage_processing"
  | "scouting_probing"
  | "long_route_movement"
  | "camp_maintenance";

export type PracticalSkillStatus =
  | "watched"
  | "improving"
  | "practiced"
  | "reliable"
  | "strained"
  | "rusty";

export interface PracticalSkillRecord {
  readonly skill: PracticalSkillKind;
  readonly status: PracticalSkillStatus;
  readonly practice: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly successCount: number;
  readonly failureCount: number;
  readonly staleRisk: NormalizedIntensity;
  readonly effect: NormalizedIntensity;
  readonly laborRelief: NormalizedIntensity;
  readonly riskRelief: NormalizedIntensity;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
}

export type AnimalFamiliarityKind =
  | "familiar_route"
  | "hard_to_catch"
  | "wary_of_hunters"
  | "camp_nuisance"
  | "scavenger_risk"
  | "dangerous_but_known"
  | "tolerated_proximity"
  | "unreliable";

export interface AnimalHumanFamiliarityRecord {
  readonly stockId: string;
  readonly label: string;
  readonly kind: AnimalFamiliarityKind;
  readonly confidence: NormalizedIntensity;
  readonly humanLearning: NormalizedIntensity;
  readonly animalWariness: NormalizedIntensity;
  readonly campFollowing: NormalizedIntensity;
  readonly usefulness: string;
  readonly risk: NormalizedIntensity;
  readonly sourceTileIds: readonly TileId[];
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noAnimalControl: true;
}

export type ScavengerPatternKind =
  | "camp_edge_scraps"
  | "fish_meat_processing"
  | "dirty_wet_camp"
  | "predator_signs_near_prey"
  | "sickness_weakness";

export interface ScavengerCampPatternRecord {
  readonly kind: ScavengerPatternKind;
  readonly tileId: TileId;
  readonly pressure: NormalizedIntensity;
  readonly risk: NormalizedIntensity;
  readonly opportunity: NormalizedIntensity;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noDirectAttack: true;
}

export interface SeasonalAggregationRecord {
  readonly tileId: TileId;
  readonly trigger:
    | "fish_wetland_pulse"
    | "seed_mast_pulse"
    | "dry_water_refuge"
    | "known_crossing_bottleneck"
    | "persistent_camp_identity"
    | "support_need"
    | "familiar_bands";
  readonly intensity: NormalizedIntensity;
  readonly tolerance: NormalizedIntensity;
  readonly tension: NormalizedIntensity;
  readonly expectedDuration: "brief" | "seasonal" | "uncertain";
  readonly dispersalSignal: NormalizedIntensity;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noSettlement: true;
}

export type FailureStoryKind =
  | "bad_crossing"
  | "cold_route"
  | "risky_plant"
  | "bad_water"
  | "failed_hunt_route"
  | "animal_injury"
  | "sickness_camp"
  | "dirty_camp"
  | "overuse_collapse"
  | "failed_support"
  | "failed_breakaway";

export interface FailureStoryRecord {
  readonly kind: FailureStoryKind;
  readonly tileId?: TileId;
  readonly strength: NormalizedIntensity;
  readonly staleness: NormalizedIntensity;
  readonly trend: "forming" | "reinforced" | "fading" | "stale";
  readonly caution: NormalizedIntensity;
  readonly phrase: string;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noMyth: true;
}

export type PlaceCharacterKind =
  | "reliable_crowded_water"
  | "useful_dirty_camp"
  | "generous_wetland"
  | "cold_route"
  | "bad_crossing"
  | "annoying_reed_bed"
  | "safe_winter_shelter"
  | "hungry_forest_edge"
  | "risky_animal_trail"
  | "worn_familiar_camp"
  | "rich_heavy_carry"
  | "good_but_short_lived";

export interface LocalPlaceCharacterRecord {
  readonly tileId: TileId;
  readonly kind: PlaceCharacterKind;
  readonly salience: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly pressure: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly label: string;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly practicalOnly: true;
}

export type InterBandReputationKind =
  | "kin_like"
  | "helpful"
  | "tolerated_familiar"
  | "watchful"
  | "takes_too_much"
  | "unreliable"
  | "support_link"
  | "stale_unknown";

export interface InterBandReputationRecord {
  readonly otherBandId: BandId;
  readonly kind: InterBandReputationKind;
  readonly familiarity: NormalizedIntensity;
  readonly trust: NormalizedIntensity;
  readonly tension: NormalizedIntensity;
  readonly sharedUse: NormalizedIntensity;
  readonly staleness: NormalizedIntensity;
  readonly receiverSpecific: true;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noDiplomacy: true;
}

export type AbsorptionDetailKind =
  | "kin_reunion"
  | "familiar_support"
  | "desperate_shelter"
  | "reluctant_support"
  | "labor_gain"
  | "dependent_burden"
  | "elder_care_burden"
  | "food_pressure_strain"
  | "seasonal_refuge_absorption"
  | "crossing_camp_support"
  | "failed_breakaway_return";

export interface AbsorptionDetailRecord {
  readonly kind: AbsorptionDetailKind;
  readonly targetBandId?: BandId;
  readonly absorbedByBandId?: BandId;
  readonly pressure: NormalizedIntensity;
  readonly laborGain: NormalizedIntensity;
  readonly careBurden: NormalizedIntensity;
  readonly sharingStrain: NormalizedIntensity;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly aggregateOnly: true;
}

export type RouteFamiliarityKind =
  | "known_ford"
  | "remembered_bank"
  | "seasonal_detour"
  | "known_resting_point"
  | "lashing_spot"
  | "water_stop"
  | "animal_path"
  | "bad_segment_avoided"
  | "worn_path";

export interface RouteFamiliarityRecord {
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly kind: RouteFamiliarityKind;
  readonly confidence: NormalizedIntensity;
  readonly ease: NormalizedIntensity;
  readonly risk: NormalizedIntensity;
  readonly useCount: number;
  readonly failureCount: number;
  readonly status: "improving" | "familiar" | "strained" | "rewritten" | "stale";
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
  readonly noRoad: true;
}

export interface RelationshipMemoryBehavior {
  readonly practiceEfficiencyBias: NormalizedIntensity;
  readonly animalCautionBias: NormalizedIntensity;
  readonly scavengerRiskBias: NormalizedIntensity;
  readonly aggregationToleranceBias: NormalizedIntensity;
  readonly reputationToleranceBias: NormalizedIntensity;
  readonly failureCautionBias: NormalizedIntensity;
  readonly placeCharacterPull: NormalizedIntensity;
  readonly routeConfidenceBias: NormalizedIntensity;
  readonly maxBehaviorHook: NormalizedIntensity;
  readonly reversible: true;
  readonly noHardLock: true;
}

export interface RelationshipMemorySocialEcologyState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly mode: RelationshipMemoryMode;
  readonly practiceSkills: readonly PracticalSkillRecord[];
  readonly animalFamiliarity: readonly AnimalHumanFamiliarityRecord[];
  readonly scavengerPatterns: readonly ScavengerCampPatternRecord[];
  readonly seasonalAggregations: readonly SeasonalAggregationRecord[];
  readonly failureStories: readonly FailureStoryRecord[];
  readonly placeCharacters: readonly LocalPlaceCharacterRecord[];
  readonly reputations: readonly InterBandReputationRecord[];
  readonly absorptionDetails: readonly AbsorptionDetailRecord[];
  readonly routeFamiliarity: readonly RouteFamiliarityRecord[];
  readonly behavior: RelationshipMemoryBehavior;
  readonly caps: {
    readonly practiceSkillCap: number;
    readonly animalFamiliarityCap: number;
    readonly scavengerPatternCap: number;
    readonly aggregationCap: number;
    readonly failureStoryCap: number;
    readonly placeCharacterCap: number;
    readonly reputationCap: number;
    readonly absorptionDetailCap: number;
    readonly routeFamiliarityCap: number;
  };
  readonly antiOmniscience: {
    readonly fromBandKnownInputsOnly: true;
    readonly hiddenResourceTruthUsed: false;
    readonly hiddenAnimalTruthUsed: false;
    readonly hiddenBandTruthUsed: false;
    readonly hiddenRouteTruthUsed: false;
  };
  readonly capsHeld: boolean;
  readonly noCultureSystem: true;
  readonly noReligionMythLanguage: true;
  readonly noLawPropertyTerritoryWar: true;
  readonly noVillageSedentismAgriculture: true;
  readonly noRoadsBridgesDocks: true;
  readonly noAnimalControl: true;
  readonly noNamedPeopleFamilies: true;
  readonly noTechTree: true;
  readonly reasonIds: readonly ReasonId[];
}

export type FrontierCorridorKind =
  | "coast"
  | "riverbank"
  | "floodplain_edge"
  | "known_crossing"
  | "pass_corridor"
  | "wetland_edge"
  | "lake_margin"
  | "dry_edge"
  | "unknown";

export interface RangeSaturationState {
  readonly bandId: BandId;
  readonly focalTileId: TileId;
  readonly localBandCount: number;
  readonly localPopulationEstimate: number;
  readonly localUsePressure: NormalizedIntensity;
  readonly nearbyCrowding: NormalizedIntensity;
  readonly effectiveHabitatSuitability: NormalizedIntensity;
  readonly perCapitaReturnEstimate: NormalizedIntensity;
  readonly saturationPressure: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  // Range saturation v1 (checkpoint 2J): explicit capacity model on top of the
  // existing crowding signal. Optional for back-compat with older constructors.
  readonly localPopulationDemand?: number;
  readonly localLaborCapacity?: number;
  readonly totalEffectiveYieldWithinRange?: NormalizedIntensity;
  readonly saturation?: NormalizedIntensity;
  readonly densityPhase?: DensityPhase;
  readonly recoveryBuffer?: NormalizedIntensity;
  readonly highRankPersistence?: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface FrontierDispersalPressure {
  readonly bandId: BandId;
  readonly pressure: NormalizedIntensity;
  readonly preferredCorridor: FrontierCorridorKind;
  readonly frontierCandidateTileIds: readonly TileId[];
  readonly bestFrontierTileId?: TileId;
  readonly reasonIds: readonly ReasonId[];
}

// FrontierIntent v0 (M0.3): a compact, persistent, decaying, anti-omniscient
// summary of a band's SUSTAINED outward/corridor drift intent. Unlike
// `FrontierDispersalPressure` (recomputed statelessly every tick), this state
// PERSISTS across seasons and DECAYS, so repeated band-known corridor / probe /
// known-unused-opportunity / crowding / poor-return evidence can accumulate into
// a frontier drift that survives for years — without using truth richness,
// without forcing departure, and without overriding refuge/cost. Used only for
// daughter/fission target scoring, logistical-probe/move candidate scoring, and
// sustained corridor exploration. NEVER changes yield/stress/mortality/carrying
// capacity, and is fully reversible (decays to undefined when evidence fades).
export type FrontierIntentSource =
  | "known_unused_opportunity"
  | "repeated_probe"
  | "corridor_memory"
  | "crowding"
  | "poor_return"
  | "daughter_fission"
  // M0.13: chronic flat-bottom misery (long-run sub-viable return or sustained
  // over-capacity) — sustained hardship, not merely a recent decline.
  | "sustained_hardship";

export interface FrontierIntentState {
  readonly bandId: BandId;
  // Tick-gate so the multiple per-tick context passes converge to one advance.
  readonly lastUpdatedTick: TickNumber;
  // Bounded, band-known corridor target the intent drifts toward (may be absent
  // when only a direction is held). Always a tile the band already knows.
  readonly targetTileId?: TileId;
  readonly directionVector?: Coord;
  readonly preferredCorridor: FrontierCorridorKind;
  readonly source: FrontierIntentSource;
  // Capped accumulator (0..MAX). Gains slowly on repeated evidence, decays each
  // unsupported tick; cleared (state → undefined) below a floor or past max age.
  readonly strength: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  // Ticks since the intent was (re)created; hard-capped so no endless one-way drift.
  readonly age: number;
  // Consecutive supported ticks (bounded), used to scale confidence.
  readonly evidenceStreak: number;
  readonly lastEvidenceScore: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
  // Literal anti-omniscience guard: this intent is derived ONLY from band-known /
  // scouted / inherited evidence, never from hidden tile truth richness.
  readonly noOmniscientRichness: true;
}

// FrontierResidence v0 (M0.4): the emergent, band-known retention value a frontier
// daughter EARNS by dwelling at a reached frontier locus. It exists to convert
// fragmented frontier presence into a held new range (the M0.3 limitation:
// daughters reach far but oscillate back across the origin radius toward a
// marginally-better-known interior). It is never inherited (a fresh daughter earns
// her own), never reads truth richness, and decays to `undefined` when she leaves
// the locus or local evidence fades — so a genuinely poor frontier is still
// abandoned and the remembered origin is competed with, never erased.
export interface FrontierResidenceValue {
  readonly bandId: BandId;
  // Tick-gate so the multiple per-tick context passes converge to one advance.
  readonly lastUpdatedTick: TickNumber;
  // The frontier locus the daughter is consolidating (her own dwell tile). Sticky
  // within a small radius; re-anchors only when she settles a new nearby locus.
  readonly anchorTileId: TileId;
  // Outward heading snapshotted at establishment (from the M0.3 frontier intent),
  // kept so an inward (toward-origin) move can still be recognised AFTER the
  // shorter-lived drift intent has decayed away.
  readonly outwardHeading?: Coord;
  // Consecutive ticks dwelling at/near the anchor locus (repeated presence).
  readonly residenceAge: number;
  // Capped, residence-earned local value (0..MAX). Grows on sustained band-known
  // local support, decays each unsupported/left tick; cleared below a floor.
  readonly frontierLocalValue: NormalizedIntensity;
  readonly frontierConfidence: NormalizedIntensity;
  // Surfaced band-known components (debug + report; each in [0,1]).
  readonly localWaterConfidence: NormalizedIntensity;
  readonly localReturnTrend: NormalizedIntensity;
  readonly localKnownOpportunity: NormalizedIntensity;
  // True once residence is old/valued enough to act as a bounded retention
  // tie-breaker; below this the value accrues silently and changes no behaviour.
  readonly established: boolean;
  readonly reasonIds: readonly ReasonId[];
  // Literal anti-omniscience guard: earned ONLY from band-known local experience.
  readonly noOmniscientRichness: true;
}

// FrontierKnowledge v0 (M0.6): bounded, anti-omniscient NEAR-WATER MARGIN (shoreline /
// around-lake corridor) knowledge FORMATION. The M0.5 lake audit found that a genuinely
// reachable rich opposite-shore patch stays truth-only forever because the band's known
// world never extends around the water far enough to include it (observation only ever
// covers the band's own 2-ring + re-scouts of already-known patches; the around-lake LAND
// corridor is never traversed). This channel lets a band with sustained presence on a
// water boundary gradually INFER the EXISTENCE of the next reachable NEAR-WATER LAND tiles
// (the corridor that hugs the shore within a couple of tiles — the plausible "follow the
// water's edge around" route), one bounded ring per season, from its own band-known
// near-water tiles — so the frontier / far shore can BECOME band-known.
//
// HARD anti-omniscience: an inferred tile stores ONLY existence + near-water topology +
// provenance — NO richness/yield/water value of any kind. "Knowing a tile exists ≠ knowing
// its resources." M0.7 may let a settled band send a residence-unchanged probe to OBSERVE
// a nearby inferred shore tile, but inference still never acts as resource value; only via
// real visitation is richness ever learned.
export type FrontierKnowledgeSource =
  | "near_water_margin_inference"
  // M0.12: existence-only continuation of a personally-walked river/creek
  // corridor chain past the band-known endpoints (never richness, never a
  // flow-direction oracle — the chain follows the channel's actual shape).
  | "corridor_continuation_inference"
  // M0.16: existence-only PERPENDICULAR inference of off-corridor SIDE land — a
  // band that has walked a river/creek corridor infers the EXISTENCE of the
  // adjacent side-country it passes (side valleys, creek-adjacent plains, hills
  // beside the corridor, tributary-mouth land, dry margins) as a thin apron
  // ≤SIDE_REACH_DISTANCE tiles deep hugging the corridor. The corridor is a
  // route AND an observation platform, not a tunnel. Stores ONLY existence +
  // topology + provenance — NEVER richness, NEVER "this side region is good".
  // Only real visitation (the M0.7 probe → observation) ever learns value.
  | "off_corridor_side_inference";

export interface InferredFrontierTile {
  readonly tileId: TileId;
  readonly inferredAtTick: TickNumber;
  readonly source: FrontierKnowledgeSource;
  // The band-known near-water tile this inference stepped out from (always adjacent).
  readonly originKnownTileId: TileId;
  // M0.6 margin steps are LAND within a couple of tiles of open water (never an
  // open-water tile). An M0.12 corridor-continuation step along a creek line may
  // carry sub-tile water instead of bordering open water — this flag records the
  // open-water margin test honestly rather than asserting it.
  readonly isNearWaterMargin: boolean;
  // Low — existence/topology belief only, NOT a visited observation.
  readonly confidence: NormalizedIntensity;
  // Literal guard: NO richness/yield is ever stored or read for an inferred tile.
  readonly noOmniscientRichness: true;
}

export interface FrontierKnowledgeState {
  readonly bandId: BandId;
  // Tick-gate so the multiple per-tick context passes converge to one advance.
  readonly lastUpdatedTick: TickNumber;
  // Bounded set of band-inferred shoreline tiles (capped; existence-only).
  readonly inferredTiles: Readonly<Record<TileId, InferredFrontierTile>>;
  readonly cumulativeInferredCount: number;
  // Tiles newly inferred this season (debug/report + reason provenance).
  readonly lastAddedTileIds: readonly TileId[];
  readonly lastSource?: FrontierKnowledgeSource;
  readonly reasonIds: readonly ReasonId[];
  readonly noOmniscientRichness: true;
}

// Bounded corridor-relocation rate-limit / anchor-reluctance state (M0.8-A). Event-driven
// (set ONLY when a corridor relocation actually executes), NOT tick-gated. It exists to
// stop a SETTLED band drifting endlessly along the shore: M0.8 gated relocation on the
// ABSOLUTE per-tile visitCount, so a band stepping onto an already-familiar tile could
// immediately re-step. This records the tick of the band's last corridor relocation (so a
// minimum DWELL-since-last-relocation can be required) and the number of steps in the
// current un-settled run (so reluctance grows per step and the walk eventually settles).
// Carries NO richness / truth / direction — purely a cadence governor. Daughters reset.
export interface CorridorRelocationState {
  readonly lastRelocationTick: TickNumber;
  // Steps taken since the band last genuinely re-anchored (a long settled gap dissolves
  // the run → back to 0). Drives a growing, capped anchor reluctance.
  readonly cumulativeStepsSinceSettled: number;
}

// M0.9 — Directional Corridor Persistence v0. A bounded, anti-omniscient HEADING memory a
// band EARNS by actually moving along a shoreline/corridor while its known frontier expands.
// It remembers ONLY realized-motion facts ("we have been going roughly this way and recent
// steps opened new known frontier and stayed passable/near-water") — NEVER hidden richness,
// the far target tile, future value, or a global best route. Used solely as a SMALL
// tie-breaker among already-valid frontier_probe / corridor candidates (prefer the one that
// continues the recent heading; gently discourage immediate backtracking), so a band makes
// steadier progress around a lake instead of re-picking the best LOCAL tile every season.
// Never overrides survival/water/refuge/cost; never forces movement; capped + deterministic.
export type CorridorHeadingSource =
  | "shoreline_probe" // probe_coast / probe_wetland_or_lake mobility move
  | "frontier_probe_expand" // expand_known_world mobility move
  | "corridor_move" // follow_river_corridor / cross_pass move
  | "inferred_frontier_relocation"; // M0.8 corridor relocation (currently inert)

export interface CorridorHeadingState {
  // Normalized recent heading — a direction of REALIZED motion, never a target/route.
  readonly headingVector: Coord;
  // 0..cap, earned by consecutive aligned steps that expanded the band's known frontier;
  // decays on rest (age, applied at read time), reversal, sideways drift, or no new frontier.
  readonly strength: NormalizedIntensity;
  readonly source: CorridorHeadingSource;
  readonly lastProgressTick: TickNumber;
  readonly consecutiveProgressSteps: number;
  // Band-known tile count at the last strengthening step — lets the governor detect genuine
  // frontier EXPANSION (count grew) vs re-treading already-known shore (count flat → decay).
  readonly knownTileCountAtProgress: number;
  readonly reasonIds: readonly ReasonId[];
  // Hard anti-omniscience guard: this state never encodes truth/inferred richness or a target.
  readonly noOmniscientRichness: true;
}

// M0.8-B: governs the CADENCE of affinity-driven shoreline/frontier PROBE intents
// (`probe_coast` / `probe_wetland_or_lake` / `expand_known_world` — the pre-existing
// mobility-intent moves whose primary reason is `frontier_probe`, NOT the M0.8 corridor
// relocation). After a short burst of consecutive probe moves the band is asked to
// re-anchor for a brief cooldown before another such probe is offered, so a settled/parent
// band walks the shore in bursts-with-rests instead of drifting every season. Survival
// (water/risk/return), local foraging, river/pass corridor following, knowledge-poor
// expansion, and genuine daughter expansion (seek_new_range / colonization, which carry a
// `frontier_dispersal_pressure` reason) are all UNGOVERNED by this — only the wandering
// shore probes are calmed.
export interface FrontierProbeCadenceState {
  readonly lastProbeMoveTick: TickNumber;
  // Consecutive `frontier_probe` mobility moves since the band last rested a full cooldown
  // (a long gap since the last probe move restarts the run at 1 → fresh burst).
  readonly consecutiveProbeMoves: number;
}

// M0.16B: cadence/budget governor for the off-corridor SIDE-COUNTRY probe. A long cooldown
// (seasons since the last side probe) keeps side scouting RARE; a hard lifetime cap on the
// cumulative count keeps it bounded so a band can never scout the side-country endlessly.
// Carries NO richness/truth/direction — purely a cadence/budget record. Daughters reset.
export interface SideProbeCadenceState {
  readonly lastSideProbeTick: TickNumber;
  // Total side-country probes this band has ever executed (monotone; capped at the lifetime
  // budget). Surfaced by the audit as the EXACT "side probes won" count.
  readonly cumulativeSideProbes: number;
}

// 2K.6B / INFO-1 — cadence governor for PROACTIVE resource information-seeking. A stable
// band with spare labor occasionally invests a residence-UNCHANGED resource_scout in an
// under-known nearby patch/side-country BEFORE it is desperate (information reduces future
// risk — the option value real foragers buy in good times). A long cooldown keeps it RARE
// (≤1 per cooldown window). Carries NO richness/truth/yield — purely a cadence record;
// daughters reset (each earns her own learning rhythm).
export interface ProactiveInfoCadenceState {
  readonly lastProactiveInfoTick: TickNumber;
  // Total proactive information actions this band has performed (monotone; the audit's
  // EXACT "proactive information actions" count).
  readonly cumulativeProactiveInfoActions: number;
}

export interface NearbyOpportunityGradient {
  readonly bandId: BandId;
  readonly currentTileId: TileId;
  readonly bestKnownOpportunityTileId?: TileId;
  readonly knownCandidateCount: number;
  readonly opportunityStrength: NormalizedIntensity;
  readonly opportunityConfidence: NormalizedIntensity;
  readonly passabilityConfidence: NormalizedIntensity;
  readonly riskPenalty: NormalizedIntensity;
  readonly crowdingPenalty: NormalizedIntensity;
  readonly biomeMismatchPenalty: NormalizedIntensity;
  // 2K.8 — bounded band-known learned-support coupling debug (decision-side only; never realized
  // CC). `learnedSupportGate` is the low-marginal-return gate (0 = inert/byte-identical: a
  // comfortable or skill-less band); `currentLearnedSupport` is the gated learned support at the
  // band's CURRENT tile (subtracted from every candidate, so it is NOT an anchor-retention bonus);
  // `bestCandidateLearnedSupport` is the gated learned support of the winning candidate;
  // `candidatesWithLearnedSupport` counts candidates that got a nonzero learned-support term.
  readonly learnedSupportGate?: number;
  readonly currentLearnedSupport?: number;
  readonly bestCandidateLearnedSupport?: number;
  readonly candidatesWithLearnedSupport?: number;
  readonly reasonIds: readonly ReasonId[];
}

export type BandEncounterKind =
  | "same_tile"
  | "adjacent_contact"
  | "shared_resource_area"
  | "parent_daughter_overlap"
  | "sibling_overlap"
  | "unrelated_overlap";

export type BandEncounterOutcome =
  | "tolerated_overlap"
  | "brief_contact"
  | "mutual_avoidance"
  | "shared_use"
  | "one_band_yielded"
  | "tension_increased"
  | "dispute_risk_raised";

export type BandEncounterRelation =
  | "parent_daughter"
  | "siblings"
  | "related_lineage"
  | "unrelated"
  | "unknown";

export interface BandEncounterRecord {
  readonly id: string;
  readonly tick: TickNumber;
  readonly time: WorldTime;
  readonly bandAId: BandId;
  readonly bandBId: BandId;
  readonly tileId?: TileId;
  readonly kind: BandEncounterKind;
  readonly relation: BandEncounterRelation;
  readonly resourcePressure: NormalizedIntensity;
  readonly crowdingPressure: NormalizedIntensity;
  readonly tolerance: NormalizedIntensity;
  readonly tension: NormalizedIntensity;
  readonly outcome: BandEncounterOutcome;
  readonly reasonIds: readonly ReasonId[];
}

export interface KnownBandContactMemory {
  readonly otherBandId: BandId;
  readonly firstContactAt: WorldTime;
  readonly lastContactAt: WorldTime;
  readonly contactCount: number;
  readonly peacefulContactCount: number;
  readonly strainedContactCount: number;
  readonly sharedUseCount: number;
  readonly avoidanceCount: number;
  readonly familiarity: NormalizedIntensity;
  readonly tension: NormalizedIntensity;
  readonly trustLikeTolerance: NormalizedIntensity;
  readonly relation: "parent_daughter" | "siblings" | "unrelated" | "unknown";
  readonly reasonIds: readonly ReasonId[];
}

export type ReportedKnowledgeTopic =
  | "good_fishing"
  | "good_fishing_region"
  | "reliable_water"
  | "good_water_region"
  | "bad_water_warning"
  | "animal_abundance"
  | "animals_seen"
  | "animal_danger"
  | "animal_danger_or_avoidance"
  | "hunting_potential"
  | "gathering_potential"
  | "seasonal_opportunity"
  | "seasonal_resource_pulse"
  | "ford_or_crossing"
  | "ford_or_crossing_known"
  | "tributary_route"
  | "tributary_route_hint"
  | "creek_valley_hint"
  | "possible_pass_through_hills"
  | "poor_return_warning"
  | "poor_return_region"
  | "crowded_range_warning"
  | "crowded_water_warning"
  | "outsider_use_warning"
  | "good_delta_or_wetland"
  | "safe_side_country"
  | "better_land_speculation"
  | "dry_place_warning"
  | "snow_or_winter_hardship_warning"
  | "good_camp_region"
  | "return_to_known_place"
  | "uncertain_edge_opportunity"
  | "avoid_place"
  | "unknown_general"
  | "unknown_story_or_guess";

export type ReportedKnowledgeRegionKind =
  | "river_reach"
  | "tributary_corridor"
  | "creek_valley"
  | "delta_or_wetland"
  | "lake_shore"
  | "opposite_bank"
  | "upland_slope"
  | "mountain_pass"
  | "dry_margin"
  | "forest_edge"
  | "familiar_range_edge"
  | "ford_area"
  | "crowded_water_place"
  | "unknown_directional_area";

export type ReportedKnowledgeDirectionFromReceiver =
  | "upstream"
  | "downstream"
  | "across_river"
  | "toward_hills"
  | "toward_mountains"
  | "toward_lake"
  | "toward_delta"
  | "along_tributary"
  | "beyond_known_edge"
  | "near_parent_range"
  | "uncertain";

export type ReportedKnowledgePrecision =
  | "exact_observed_area"
  | "approximate_region"
  | "vague_direction"
  | "story_only";

export type ReportedKnowledgeSourceBasis =
  | "direct_trip_return"
  | "scout_return"
  | "forager_return"
  | "fishing_party_return"
  | "water_party_return"
  | "hunter_return"
  | "gathering_party_return"
  | "camp_talk"
  | "elder_memory"
  | "dependent_camp_pressure"
  | "recent_movers"
  | "route_followers"
  | "crossing_party"
  | "visible_landscape_cue"
  | "seasonal_observers"
  | "frustrated_foragers"
  | "successful_foragers"
  | "residential_move_memory"
  | "kin_report"
  | "repeated_contact_report"
  | "range_friction_report"
  | "inferred_from_seasonal_pattern"
  | "internal_speculation"
  | "parent_band"
  | "daughter_band"
  | "sibling_band"
  | "lineage_kin"
  | "familiar_neighbor"
  | "weak_contact"
  | "unknown_band_nearby"
  | "range_shared_use"
  | "crowded_water_contact"
  | "ford_contact"
  | "delta_contact"
  | "secondhand_chain";

export type LandscapeVisibilityCueKind =
  | "visible_water"
  | "visible_wetland"
  | "greener_lowland"
  | "lake_shore_visible"
  | "delta_like_area"
  | "river_or_tributary_corridor"
  | "open_valley"
  | "pass_or_saddle"
  | "opposite_bank"
  | "dry_or_barren_country"
  | "higher_ground";

export type LandscapeVisibilityCueStatus =
  | "unchecked"
  | "partly_checked"
  | "stale";

export type LandscapeVisibilityDirection =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export interface VisibleLandscapeCue {
  readonly cueId: string;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly sourceTileId: TileId;
  readonly approximateTileId: TileId;
  readonly kind: LandscapeVisibilityCueKind;
  readonly direction: LandscapeVisibilityDirection;
  readonly distanceTiles: number;
  readonly confidence: NormalizedIntensity;
  readonly status: LandscapeVisibilityCueStatus;
  readonly blockedByTerrain: boolean;
  readonly influencedScoutOrProbeCount: number;
  readonly noObservedTileCreated: true;
  readonly noResourceUnlock: true;
  readonly noDirectRelocation: true;
  readonly reasonIds: readonly ReasonId[];
}

export type ReportContactMechanism =
  | "nearby_camp"
  | "direct_contact_memory"
  | "parent_daughter_visit"
  | "sibling_lineage_visit"
  | "lineage_route"
  | "shared_water_place"
  | "shared_ford_or_crossing"
  | "shared_delta_or_wetland"
  | "range_shared_use"
  | "known_route_or_corridor"
  | "secondhand_relay";

export type ReportReplyStatus =
  | "none"
  | "confirmed"
  | "strengthened"
  | "corrected"
  | "contradicted"
  | "disputed"
  | "downgraded"
  | "uncertain";

export type ReportReplyGrounding =
  | "direct_memory"
  | "scout_or_trip_record"
  | "familiar_range"
  | "resource_patch_memory"
  | "place_memory"
  | "recent_contradictory_return"
  | "no_grounding";

export type ReportSourceBiasKind =
  | "none"
  | "protective_vagueness"
  | "downplayed_opportunity"
  | "exaggerated_risk"
  | "stale_warning_repeated";

export interface ReportedKnowledgeRegionTarget {
  readonly regionId: string;
  readonly approximateCenterTile?: TileId;
  readonly radiusTiles: number;
  readonly roughExtent: string;
  readonly regionKind: ReportedKnowledgeRegionKind;
  readonly directionFromReceiver: ReportedKnowledgeDirectionFromReceiver;
  readonly precision: ReportedKnowledgePrecision;
}

export type ReportDistortionLevel =
  | "none"
  | "vague"
  | "exaggerated"
  | "understated"
  | "stale"
  | "direction_blurred"
  | "region_shifted"
  | "source_biased"
  | "overgeneralized"
  | "wrong_or_misleading";

export type ReportTrustBasis =
  | "internal_band"
  | "parent"
  | "daughter"
  | "sibling"
  | "lineage_kin"
  | "familiar_neighbor"
  | "repeated_contact"
  | "shared_water"
  | "residential_proximity"
  | "range_friction"
  | "weak_contact"
  | "stranger";

export type ReportReceiverDisposition =
  | "ignored"
  | "remembered_only"
  | "cautiously_considered"
  | "checked_by_probe"
  | "used_as_minor_bias"
  | "acted_on"
  | "partially_confirmed"
  | "contradicted"
  | "stale";

export type ReportConfirmationStatus =
  | "unconfirmed"
  | "partially_confirmed"
  | "confirmed"
  | "corrected"
  | "contradicted"
  | "disputed"
  | "downgraded"
  | "strengthened"
  | "stale";

export type ReportedKnowledgeSpeculationHypothesis =
  | "better_land_possible"
  | "water_likely"
  | "animals_likely"
  | "fish_likely"
  | "route_likely_continues"
  | "risk_likely"
  | "crowding_likely"
  | "poor_return_likely";

export type ReportedKnowledgeSpeculationDisposition =
  | "dismissed"
  | "remembered"
  | "watched"
  | "checked_by_probe"
  | "used_as_minor_bias"
  | "disproven"
  | "partially_confirmed";

export interface ReportedKnowledgeSpeculation {
  readonly speculationId: string;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly regionTarget: ReportedKnowledgeRegionTarget;
  readonly hypothesis: ReportedKnowledgeSpeculationHypothesis;
  readonly confidence: NormalizedIntensity;
  readonly evidenceCount: number;
  readonly contradictionCount: number;
  readonly sourceReports: readonly string[];
  readonly receiverDisposition: ReportedKnowledgeSpeculationDisposition;
  readonly noHiddenTruth: true;
  readonly noDirectUnlock: true;
  readonly noForcedMove: true;
}

export interface WordOfMouthReport {
  readonly reportId: string;
  readonly sourceBandId: BandId;
  readonly receiverBandId: BandId;
  readonly originalObserverBandId?: BandId;
  readonly tickCreated: TickNumber;
  readonly tickReceived: TickNumber;
  readonly topic: ReportedKnowledgeTopic;
  readonly targetTileId?: TileId;
  readonly targetApproxRegion?: string;
  readonly regionTarget: ReportedKnowledgeRegionTarget;
  readonly sourceBasis: ReportedKnowledgeSourceBasis;
  readonly confidence: NormalizedIntensity;
  readonly freshness: NormalizedIntensity;
  readonly hops: number;
  readonly distortionLevel: ReportDistortionLevel;
  readonly trustBasis: ReportTrustBasis;
  readonly contactMechanism?: ReportContactMechanism;
  readonly contactDistanceTiles?: number;
  readonly relayHopCount?: number;
  readonly replyStatus?: ReportReplyStatus;
  readonly replyGrounding?: ReportReplyGrounding;
  readonly sourceBiasKind?: ReportSourceBiasKind;
  readonly sourceBiasReason?: string;
  readonly withheldBySourceBias?: boolean;
  readonly receiverDisposition: ReportReceiverDisposition;
  readonly confirmationStatus: ReportConfirmationStatus;
  readonly evidenceCount: number;
  readonly contradictionCount: number;
  readonly noHiddenTruth: true;
  readonly noDirectUnlock: true;
  readonly noGuaranteedTruth: true;
  readonly noLanguageSystem: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface ReportedKnowledgeState {
  readonly reports: readonly WordOfMouthReport[];
  readonly speculations?: readonly ReportedKnowledgeSpeculation[];
  readonly lastUpdatedTick: TickNumber;
  readonly generatedCount: number;
  readonly internalGeneratedCount?: number;
  readonly interBandGeneratedCount?: number;
  readonly receivedCount: number;
  readonly checkedByProbeCount: number;
  readonly actedOnCount: number;
  readonly misleadingCount: number;
  readonly sourceBiasWithheldCount?: number;
  readonly partiallyConfirmedCount?: number;
  readonly contradictedCount?: number;
  readonly staleCount?: number;
  readonly expiredOrFadedCount?: number;
  readonly mergedSimilarCount?: number;
}

export type RangeFrictionObserverRangeTier =
  | "camp_core"
  | "water_core"
  | "familiar_core"
  | "familiar_country"
  | "edge"
  | "route_or_corridor"
  | "ford_or_crossing"
  | "unknown_to_observer";

export type RangeFrictionOtherActivityKind =
  | "residential_presence"
  | "foraging_trip"
  | "fishing_or_water_work"
  | "scouting_or_probe"
  | "crossing_or_route_use"
  | "passing_through"
  | "unknown_activity";

export type RangeFrictionRelation =
  | "parent"
  | "daughter"
  | "sibling"
  | "lineage_kin"
  | "familiar_neighbor"
  | "weak_contact"
  | "stranger_or_unrecognized";

export type RangeFrictionInterpretation =
  | "tolerated_kin_presence"
  | "noticed_shared_use"
  | "crowded_water_place"
  | "repeated_outsider_use"
  | "uncertain_presence"
  | "possible_intrusion"
  | "route_overlap"
  | "ford_overlap"
  | "avoid_warning_remembered";

export type RangeFrictionTensionLevel =
  | "none"
  | "watchful"
  | "mild"
  | "moderate_placeholder";

export type RangeFrictionConfidence =
  | "observed"
  | "inferred_from_recent_activity"
  | "reported_secondhand"
  | "uncertain";

export interface RangeFrictionEvent {
  readonly eventId: string;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly observerBandId: BandId;
  readonly otherBandId: BandId;
  readonly tileId?: TileId;
  readonly observerRangeTier: RangeFrictionObserverRangeTier;
  readonly otherActivityKind: RangeFrictionOtherActivityKind;
  readonly relation: RangeFrictionRelation;
  readonly interpretation: RangeFrictionInterpretation;
  readonly tensionLevel: RangeFrictionTensionLevel;
  readonly confidence: RangeFrictionConfidence;
  readonly recurrenceCount: number;
  readonly recentOverlapCount: number;
  readonly linkedReportId?: string;
  readonly linkedActivityTripId?: string;
  readonly linkedResidentialMoveEventId?: string;
  readonly noConflictChange: true;
  readonly noMovementChange: true;
  readonly noPopulationChange: true;
  readonly noStressChange: true;
  readonly noYieldChange: true;
  readonly noTerritoryClaim: true;
  readonly reasonIds: readonly ReasonId[];
}

export type BandMoodKind =
  | "stable"
  | "calm"
  | "recovering"
  | "cautious"
  | "fearful"
  | "angry"
  | "hungry"
  | "thirsty"
  | "tired"
  | "curious"
  | "confident"
  | "strained"
  | "fractured"
  | "grieving"
  | "desperate"
  | "relieved"
  | "restless"
  | "pressured"
  | "suspicious";

export interface BandDispositionState {
  readonly tick: TickNumber;
  readonly time: WorldTime;
  readonly moodShares: readonly {
    readonly mood: BandMoodKind;
    readonly share: NormalizedIntensity;
  }[];
  readonly dominantMood: BandMoodKind;
  readonly cohesion: NormalizedIntensity;
  readonly fear: NormalizedIntensity;
  readonly anger: NormalizedIntensity;
  readonly caution: NormalizedIntensity;
  readonly hungerStress: NormalizedIntensity;
  readonly fatigueStress: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly moodReasons: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface EncounterPerception {
  readonly encounterId: string;
  readonly observerBandId: BandId;
  readonly otherBandId: BandId;
  readonly perceivedThreat: NormalizedIntensity;
  readonly perceivedKinshipSafety: NormalizedIntensity;
  readonly perceivedResourceCompetition: NormalizedIntensity;
  readonly knownEscapeConfidence: NormalizedIntensity;
  readonly knownSharedUseConfidence: NormalizedIntensity;
  readonly uncertainty: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export type EncounterResponseKind =
  | "avoid"
  | "observe"
  | "share_use"
  | "hold_ground"
  | "confront"
  | "flee"
  | "seek_parent_or_known_band"
  | "wait_for_separated_members";

export interface EncounterResponseDistribution {
  readonly encounterId: string;
  readonly bandId: BandId;
  readonly responseShares: readonly {
    readonly response: EncounterResponseKind;
    readonly share: NormalizedIntensity;
  }[];
  readonly dominantResponse: EncounterResponseKind;
  readonly dissentLevel: NormalizedIntensity;
  readonly splitRisk: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface TemporarySeparationPressure {
  readonly bandId: BandId;
  readonly active: boolean;
  readonly cause:
    | "encounter_fear"
    | "encounter_disagreement"
    | "resource_panic"
    | "conflict_avoidance";
  readonly estimatedSeparatedShare: NormalizedIntensity;
  readonly reuniteIntent: NormalizedIntensity;
  readonly waitingAtTileId?: TileId;
  readonly expectedReunionHorizonTicks: TickNumber;
  readonly reasonIds: readonly ReasonId[];
}

export interface BandViabilityState {
  readonly bandId: BandId;
  readonly population: number;
  readonly minimumViablePopulation: number;
  readonly viabilityPressure: NormalizedIntensity;
  readonly extinctionRisk: NormalizedIntensity;
  readonly absorptionOpportunity: NormalizedIntensity;
  readonly status: "viable" | "fragile" | "nonviable" | "absorbed" | "extinct";
  readonly weakBandClassification?:
    | "stable_small_remnant"
    | "seasonal_hardship_viable"
    | "chronic_deficit"
    | "labor_poor"
    | "elder_heavy"
    | "dependent_heavy"
    | "isolated"
    | "seeking_support"
    | "failed_support_seeking"
    | "absorption_candidate"
    | "collapse_risk"
    | "disappeared_collapsed"
    | "absorbed";
  readonly weakBandFate?:
    | "viable"
    | "stable_remnant"
    | "support_seeking"
    | "absorption_candidate"
    | "absorbed"
    | "collapse_risk"
    | "collapsed";
  readonly supportSeekingTargetBandId?: BandId;
  readonly supportSeekingGrounding?: string;
  readonly supportSeekingBlockedReason?: string;
  readonly routeConfidenceToSupport?: NormalizedIntensity;
  readonly lastSupportState?: SeasonalHungerClassification;
  readonly lastStressSummary?: string;
  readonly populationConservationSummary?: string;
  readonly absorbedByBandId?: BandId;
  readonly populationTransferred?: number;
  readonly populationRemoved?: number;
  readonly terminalSnapshot?: {
    readonly tick: TickNumber;
    readonly year: number;
    readonly season: Season;
    readonly cause: "demographic_zero" | "low_population_collapse" | "labor_collapse";
    readonly populationBeforeRemoval: number;
    readonly dependentsBeforeRemoval: number;
    readonly workingAdultsBeforeRemoval: number;
    readonly eldersBeforeRemoval: number;
    readonly finalPopulationChangeReasonIds: readonly ReasonId[];
  };
  readonly reasonIds: readonly ReasonId[];
}

export type WaterSourceKind =
  | "permanent_refuge_water"
  | "seasonal_pool"
  | "ephemeral_rain_pool"
  | "river_channel"
  | "wadi_or_dry_channel"
  | "floodplain_moisture"
  | "spring_or_seep"
  | "lake_margin"
  | "marsh_edge"
  | "known_ford_water"
  | "failed_or_unreliable_water"
  | "unknown";

export interface WaterRefugeProfile {
  readonly tileId: TileId;
  readonly sourceKind: WaterSourceKind;
  readonly knowledgeSource: KnowledgeSourceKind;
  readonly reliability: NormalizedIntensity;
  readonly drySeasonReliability: NormalizedIntensity;
  readonly wetSeasonReliability: NormalizedIntensity;
  readonly droughtFailureRisk: NormalizedIntensity;
  readonly lastKnownWaterConfidence: NormalizedIntensity;
  readonly fallbackRank: number;
  readonly socialAccessRisk: NormalizedIntensity;
  readonly travelCostFromCurrent: NormalizedIntensity;
  readonly inferred: boolean;
  readonly reasonIds: readonly ReasonId[];
}

export type DryMarginSeasonalMode =
  | "wet_season_dispersal"
  | "green_season_harvest"
  | "dry_season_consolidation"
  | "late_dry_refuge"
  | "drought_emergency"
  | "normal";

export interface SeasonalMobilityModeState {
  readonly bandId: BandId;
  readonly season: Season;
  readonly mode: DryMarginSeasonalMode;
  readonly waterContraction: NormalizedIntensity;
  readonly temporaryWaterOpportunity: NormalizedIntensity;
  readonly dryRefugePull: NormalizedIntensity;
  readonly harvestOpportunity: NormalizedIntensity;
  readonly droughtSeverity: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export type RiverProspectDirection =
  | "upstream"
  | "downstream"
  | "riverbank"
  | "floodplain_edge"
  | "wadi_chain"
  | "unknown";

export type RiverCorridorProspectBasis =
  | "known_river_continuity"
  | "known_floodplain_edge"
  | "known_ford_or_crossing"
  | "known_water_reliability"
  | "known_place_memory"
  | "inferred_downstream_continuity"
  | "inferred_upstream_continuity"
  | "wadi_or_dry_channel_continuity";

export interface RiverCorridorProspect {
  readonly bandId: BandId;
  readonly currentTileId: TileId;
  readonly corridorDirection: RiverProspectDirection;
  readonly candidateTileIds: readonly TileId[];
  readonly bestProspectTileId?: TileId;
  readonly expectedWater: NormalizedIntensity;
  readonly expectedFood: NormalizedIntensity;
  readonly travelCost: NormalizedIntensity;
  readonly uncertainty: NormalizedIntensity;
  readonly socialAccessRisk: NormalizedIntensity;
  readonly crossingRisk: NormalizedIntensity;
  readonly prospectStrength: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly basis: readonly RiverCorridorProspectBasis[];
  readonly reasonIds: readonly ReasonId[];
}

export interface StayMoveScoutComparison {
  readonly bandId: BandId;
  readonly currentTileId: TileId;
  readonly stayValue: NormalizedIntensity;
  readonly moveValue: NormalizedIntensity;
  readonly scoutValue: NormalizedIntensity;
  readonly currentRefugeSecurity: NormalizedIntensity;
  readonly lossOfFallbackSecurity: NormalizedIntensity;
  readonly currentMarginalReturn: NormalizedIntensity;
  readonly expectedNextReturn: NormalizedIntensity;
  readonly bestKnownAlternativeReturn: NormalizedIntensity;
  readonly departureThreshold: NormalizedIntensity;
  readonly uncertaintyPenalty: NormalizedIntensity;
  readonly socialAccessRisk: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface DryMarginMobilityContext {
  readonly currentWaterRefuge?: WaterRefugeProfile;
  readonly bestWaterCandidates: readonly WaterRefugeProfile[];
  readonly seasonalMode?: SeasonalMobilityModeState;
  readonly riverProspect?: RiverCorridorProspect;
  readonly stayMoveScout?: StayMoveScoutComparison;
  readonly logisticalProbeAvailable: boolean;
  readonly logisticalProbeSelected: boolean;
  readonly currentPlaceAssessment:
    | "known_refuge"
    | "declining_refuge"
    | "seasonal_opportunity"
    | "poor_but_safe_fallback"
    | "risky_depleted_holdover"
    | "unknown";
  readonly reasonIds: readonly ReasonId[];
}

// ---------------------------------------------------------------------------
// Residential anchor + seasonal catchment (checkpoint 2I.2)
//
// A residential anchor is the band's seasonal base. It is NOT a camp or
// settlement: it has no built structure, holds no storage, and can relocate.
// It is the seasonal-tick summary of where the band orbits while foraging a
// bounded catchment outward and running logistical forays. Derived only from
// the band's own known/remembered/observed water and tile records.
// ---------------------------------------------------------------------------

export type AnchorStatus =
  | "secure_hold"
  | "contracting"
  | "provisioning_out"
  | "breaking"
  | "trapped"
  | "none";

export type DroughtResponse =
  | "hold"
  | "evasion"
  | "escape"
  | "none";

export interface ResidentialAnchorState {
  readonly bandId: BandId;
  readonly anchorTileId: TileId;
  readonly tetheringWaterTileId?: TileId;
  readonly startedTick: TickNumber;
  readonly seasonsAnchored: number;
  readonly foragingRadius: number;
  readonly logisticalRadius: number;
  readonly catchmentTileIds: readonly TileId[];
  readonly catchmentReturnEstimate: NormalizedIntensity;
  readonly catchmentDepletion: NormalizedIntensity;
  readonly anchorWaterSecurity: NormalizedIntensity;
  readonly dependencyLoad: NormalizedIntensity;
  readonly logisticalCapacity: NormalizedIntensity;
  readonly holdValue: NormalizedIntensity;
  readonly forayValue: NormalizedIntensity;
  readonly relocateValue: NormalizedIntensity;
  readonly anchorStatus: AnchorStatus;
  readonly droughtResponse: DroughtResponse;
  readonly reasonIds: readonly ReasonId[];
}

export type ForagingRadiusBasis =
  | "water_tethered"
  | "ordinary"
  | "stress_expanded"
  | "risk_contracted"
  | "wet_season_released";

export interface ForagingRadiusState {
  readonly bandId: BandId;
  readonly anchorTileId: TileId;
  readonly radiusTiles: number;
  readonly basis: ForagingRadiusBasis;
  readonly limitingFactors: readonly string[];
  readonly reachableKnownTileIds: readonly TileId[];
  readonly inferredCorridorDirections: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

export type SeasonalResidenceMode =
  | "anchored_refuge"
  | "ordinary_foraging_base"
  | "residential_transit"
  | "dispersed_wet_season_round"
  | "stress_relocation";

export interface SeasonalActivityBudget {
  readonly nearAnchorForaging: NormalizedIntensity;
  readonly farLogisticalForays: NormalizedIntensity;
  readonly scoutingProbes: NormalizedIntensity;
  readonly socialVisits: NormalizedIntensity;
  readonly restRecovery: NormalizedIntensity;
}

export interface IntraSeasonActivitySummary {
  readonly bandId: BandId;
  readonly residenceMoved: boolean;
  readonly residenceMode: SeasonalResidenceMode;
  readonly activityBudget: SeasonalActivityBudget;
  readonly foragingRadius: number;
  readonly expectedFoodGain: NormalizedIntensity;
  readonly expectedWaterSecurity: NormalizedIntensity;
  readonly fatigueDelta: NormalizedIntensity;
  readonly depletionTileIds: readonly TileId[];
  readonly observationsAdded: readonly TileId[];
  readonly reasonIds: readonly ReasonId[];
}

export type ResidentialAction =
  | "stay_anchor"
  | "logistical_foray"
  | "residential_relocation";

export interface AnchorDecisionComparison {
  readonly bandId: BandId;
  readonly anchorTileId: TileId;
  readonly holdValue: NormalizedIntensity;
  readonly forayValue: NormalizedIntensity;
  readonly relocateValue: NormalizedIntensity;
  readonly anchorMarginalReturn: NormalizedIntensity;
  readonly bestKnownAlternativeNet: NormalizedIntensity;
  readonly relocationHysteresis: NormalizedIntensity;
  readonly waterFailureGate: boolean;
  readonly foodCollapseGate: boolean;
  readonly betterKnownRefugeGate: boolean;
  readonly riskGate: boolean;
  readonly fatigueGate: boolean;
  readonly chosenResidentialAction: ResidentialAction;
  readonly reasonIds: readonly ReasonId[];
}

// Light revisitation memory for tiles that have served as a residential anchor
// (checkpoint 2I.3). This is NOT a camp/settlement/claim: it records only that a
// tile was used as a seasonal base before, and how reliable it was, so a band
// returning to a known dry-season refuge can resume holding faster. Bounded.
export interface AnchorMemoryRecord {
  readonly tileId: TileId;
  readonly tetheringWaterTileId?: TileId;
  readonly firstAnchoredTick: TickNumber;
  readonly lastAnchoredTick: TickNumber;
  readonly anchoredSeasonCount: number;
  readonly successfulHoldCount: number;
  readonly failedHoldCount: number;
  readonly bestSeason?: Season;
  readonly drySeasonReliability: NormalizedIntensity;
  readonly averageCatchmentReturn: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

// ---------------------------------------------------------------------------
// Multi-year seasonal-round coherence (checkpoint 2I.4)
//
// A SeasonalRoundMemory is the band's INFERRED, mobile seasonal pattern — return
// to a remembered dry refuge in the dry/late-dry phase, loosen the tether and
// disperse in the wet/green phase. It is memory, not a fixed route, and NOT a
// camp/settlement/territory: it holds no structure, claims nothing, and never
// overrides survival or passability. Inferred only from the band's own anchor
// memories and seasonal observations, bounded to one primary round per band.
// ---------------------------------------------------------------------------

export type SeasonalRoundPhase =
  | "dry_refuge_return"
  | "late_dry_hold"
  | "wet_dispersal"
  | "green_harvest"
  | "transition"
  | "drought_escape"
  | "unknown";

export interface SeasonalRoundPhaseRecord {
  readonly phase: SeasonalRoundPhase;
  readonly preferredSeason: Season;
  readonly anchorTileId?: TileId;
  readonly tetheringWaterTileId?: TileId;
  readonly associatedTileIds: readonly TileId[];
  readonly expectedWaterSecurity: NormalizedIntensity;
  readonly expectedCatchmentReturn: NormalizedIntensity;
  readonly riskMemory: NormalizedIntensity;
  readonly successCount: number;
  readonly failureCount: number;
  readonly confidence: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

export interface SeasonalRoundMemory {
  readonly bandId: BandId;
  readonly roundId: string;
  readonly confidence: NormalizedIntensity;
  readonly lastUpdatedTick: TickNumber;
  readonly observedCycleCount: number;
  readonly lastPhase: SeasonalRoundPhase;
  readonly lastCycleClosedTick?: TickNumber;
  readonly phaseRecords: readonly SeasonalRoundPhaseRecord[];
  readonly reasonIds: readonly ReasonId[];
}

export type SeasonalRoundOutcome =
  | "followed"
  | "ignored"
  | "blocked_passability"
  | "blocked_water_failure"
  | "abandoned_failure"
  | "none";

// Round-aware catchment rotation (checkpoint 2I.5). During wet/green dispersal
// phases the band rotates which known/associated tiles it forages so it stops
// hammering one small catchment. Bounded; uses only known/remembered tiles.
export interface RoundCatchmentRotationState {
  readonly bandId: BandId;
  readonly roundId: string;
  readonly phase: SeasonalRoundPhase;
  readonly candidateTileIds: readonly TileId[];
  readonly recentlyUsedTileIds: readonly TileId[];
  readonly selectedCatchmentTileIds: readonly TileId[];
  readonly rotationPressure: NormalizedIntensity;
  readonly depletionAvoidance: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly reasonIds: readonly ReasonId[];
}

// Why a behaviour was triggered — surfaced so dry-margin/seasonal behaviour is
// legibly emergent from ecology/experience, not locked to a starting profile.
export type BehaviorBasis =
  | "starting_profile"
  | "current_ecology"
  | "learned_memory"
  | "biome_adaptation"
  | "seasonal_round"
  | "pressure_state";

// Ecology/experience-driven mobility character (checkpoint 2I.6). Replaces the
// old profile-role gating of mobility intent: a band's river/coast/wetland/dry/
// highland/frontier/return tendencies are derived from where it actually lives
// and what it has learned. The starting spawn profile is only a weak prior that
// decays as lived experience accumulates — never a permanent archetype.
export type MobilityBehaviorBasisKind =
  | "current_ecology"
  | "learned_memory"
  | "biome_adaptation"
  | "seasonal_round"
  | "residential_anchor"
  | "water_refuge"
  | "hydrography"
  | "coastline"
  | "lake_wetland"
  | "pass_highland"
  | "dry_margin_pressure"
  | "crowding_pressure"
  | "daughter_dispersal"
  | "starting_profile";

export interface MobilityBehaviorBasis {
  readonly bandId: BandId;
  readonly basisKinds: readonly MobilityBehaviorBasisKind[];
  readonly riverAffinity: NormalizedIntensity;
  readonly coastAffinity: NormalizedIntensity;
  readonly wetlandLakeAffinity: NormalizedIntensity;
  readonly dryMarginAffinity: NormalizedIntensity;
  readonly highlandPassAffinity: NormalizedIntensity;
  readonly frontierAffinity: NormalizedIntensity;
  readonly returnRefugeAffinity: NormalizedIntensity;
  readonly waterSeekingAffinity: NormalizedIntensity;
  readonly explorationAffinity: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly startingProfileWeight: NormalizedIntensity;
  readonly learnedExperienceWeight: NormalizedIntensity;
  readonly startingProfileOverridden: boolean;
  readonly reasonIds: readonly ReasonId[];
}

// Per-tick debug snapshot of how seasonal-round memory shaped (or failed to
// shape) this season's decision. Not persisted history — just the current view.
export interface SeasonalRoundDecisionState {
  readonly bandId: BandId;
  readonly currentPhase: SeasonalRoundPhase;
  readonly expectedNextPhase: SeasonalRoundPhase;
  readonly phaseConfidence: NormalizedIntensity;
  readonly seasonalRoundPull: NormalizedIntensity;
  readonly rememberedDryRefugeTileId?: TileId;
  readonly rememberedWetRangeTileIds: readonly TileId[];
  readonly outcome: SeasonalRoundOutcome;
  readonly roundBlockedReason?: string;
  readonly roundAbandonedReason?: string;
  // Dry-refuge stickiness (2I.5, PART 2).
  readonly currentDistanceFromRememberedRefuge?: number;
  readonly dryRefugeStickiness: NormalizedIntensity;
  readonly refugeReturnPull: NormalizedIntensity;
  readonly refugeDriftPenalty: NormalizedIntensity;
  readonly refugeViable: boolean;
  readonly reasonIds: readonly ReasonId[];
}

export interface SeasonalTimelineEntry {
  readonly tick: TickNumber;
  readonly season: Season;
  readonly tileId: TileId;
  readonly anchorTileId?: TileId;
  readonly residenceMode?: SeasonalResidenceMode;
  readonly phase: SeasonalRoundPhase;
  readonly actionType: string;
  readonly waterSecurity: NormalizedIntensity;
  readonly catchmentReturn: NormalizedIntensity;
  readonly reasonId?: ReasonId;
}

export type CausalSignalKind =
  | "local_use_increased"
  | "resource_pressure_increased"
  | "food_stress_increased"
  | "water_stress_increased"
  | "mobility_pressure_increased"
  | "place_attachment_resisted_move"
  | "pressure_triggered_move"
  | "pressure_reduced_stay_score"
  | "split_pressure_increased"
  | "split_deferred"
  | "band_fission_created"
  | "band_absorbed"
  | "band_extinct";

export interface CausalTrace {
  readonly id: string;
  readonly tick: TickNumber;
  readonly time: WorldTime;
  readonly actorId: BandId;
  readonly kind: CausalSignalKind;
  readonly sourceTileId?: TileId;
  readonly targetTileId?: TileId;
  readonly fromValue?: number;
  readonly toValue?: number;
  readonly reasonId?: ReasonId;
  readonly decisionId?: DecisionId;
}

export type AdaptiveIdeaFamily =
  | "carrying_logistics"
  | "food_work"
  | "route_crossing"
  | "camp_care"
  | "fire_fuel"
  | "water_edge"
  | "social_copy";

export type AdaptiveIdeaSource =
  | "locally_inferred"
  | "inherited"
  | "copied_seen"
  | "repeated_habit"
  | "desperate_improvisation"
  | "old_routine_variant";

export type AdaptiveIdeaStatus =
  | "considered"
  | "chosen"
  | "rejected"
  | "copied"
  | "inherited"
  | "desperate"
  | "blocked";

export type AdaptiveResponseType =
  | "stay_endure"
  | "rest_recover"
  | "minor_camp_shift"
  | "temporary_task_camp"
  | "scout_probe"
  | "try_local_solution"
  | "fallback_work_shift"
  | "adjust_carrying"
  | "delay_move"
  | "risky_relocation"
  | "abandon_route"
  | "return_refuge"
  | "copy_trace"
  | "reject_idea"
  | "postpone";

export type AdaptiveTaskGroup =
  | "whole_band"
  | "small_scout_group"
  | "foraging_party"
  | "crossing_party"
  | "camp_care_group"
  | "water_edge_group"
  | "adult_heavy_group"
  | "mixed_camp_group";

export type AdaptiveAttemptOutcome =
  | "clear_success"
  | "clear_failure"
  | "partial_success"
  | "mixed_feedback"
  | "low_feedback"
  | "delayed_feedback"
  | "dangerous_feedback"
  | "local_only_success"
  | "contradicted_by_event"
  | "false_confidence"
  | "dead_end"
  | "blocked_before_attempt"
  | "too_labor_heavy";

export type AdaptiveFeedbackType = AdaptiveAttemptOutcome;

export type AdaptiveFeedbackQuality =
  | "clear"
  | "usable"
  | "mixed"
  | "weak"
  | "delayed"
  | "dangerous"
  | "blocked"
  | "contradicted";

export type AdaptiveRoutineConfidenceBand =
  | "fragile"
  | "promising"
  | "locally_reliable"
  | "contradicted";

export type AdaptiveTransferDifficulty = "low" | "medium" | "high" | "unknown";

export type AdaptiveBehaviorEffectScope =
  | "none"
  | "candidate_score_bias"
  | "movement_response_bias"
  | "camp_response_bias"
  | "scout_response_bias";

export type AdaptiveEvidenceSourceSystem =
  | "problem_practice"
  | "practice_feedback"
  | "material_affordance"
  | "knowledge_ecology"
  | "social_diffusion"
  | "camp_foothold"
  | "activity_party"
  | "repetition_familiarity"
  | "movement_memory"
  | "route_memory"
  | "crossing_memory"
  | "place_memory"
  | "demography"
  | "pressure_state"
  | "decision";

export type AdaptiveEvidenceKind =
  | "problem"
  | "practice_candidate"
  | "feedback_readiness"
  | "affordance"
  | "knowledge"
  | "social_exposure"
  | "foothold"
  | "activity"
  | "repetition"
  | "memory"
  | "demography"
  | "pressure"
  | "decision";

export type AdaptiveBasis = "lived" | "inherited" | "copied_seen" | "mixed" | "unknown";

export interface AdaptiveEvidenceRef {
  readonly kind: AdaptiveEvidenceKind;
  readonly sourceSystem: AdaptiveEvidenceSourceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly basis: AdaptiveBasis;
  readonly problemFrameId?: string;
  readonly practiceCandidateId?: string;
  readonly practiceFeedbackId?: string;
  readonly affordanceId?: string;
  readonly knowledgeId?: string;
  readonly socialDiffusionId?: string;
  readonly footholdId?: string;
  readonly activityId?: string;
  readonly repetitionId?: string;
  readonly eventId?: EventId;
  readonly tileId?: TileId;
  readonly relatedBandId?: BandId;
  readonly reasonIds: readonly ReasonId[];
}

export interface AdaptiveIdea {
  readonly id: string;
  readonly family: AdaptiveIdeaFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly sourceProblemFrameId?: string;
  readonly linkedPracticeCandidateId?: string;
  readonly proposedResponse: AdaptiveResponseType;
  readonly materialBasis: readonly string[];
  readonly knowledgeBasis: readonly string[];
  readonly activityBasis: readonly string[];
  readonly campFootholdBasis: readonly string[];
  readonly socialSource?: string;
  readonly expectedBenefit: string;
  readonly expectedCost: string;
  readonly risk: string;
  readonly uncertainty: string;
  readonly feasibility: NormalizedIntensity;
  readonly noveltySource: AdaptiveIdeaSource;
  readonly status: AdaptiveIdeaStatus;
  readonly rejectionReason?: string;
  readonly linkedAffordanceIds: readonly string[];
  readonly linkedKnowledgeIds: readonly string[];
  readonly linkedPracticeFeedbackIds: readonly string[];
  readonly linkedFootholdIds: readonly string[];
  readonly linkedSocialDiffusionIds: readonly string[];
  readonly evidence: readonly AdaptiveEvidenceRef[];
  readonly noTechTree: true;
  readonly noGlobalUnlock: true;
}

export interface AdaptiveResponse {
  readonly id: string;
  readonly selectedIdeaId: string;
  readonly responseType: AdaptiveResponseType;
  readonly selectedByProblem: string;
  readonly whyChosen: string;
  readonly rejectedIdeaIds: readonly string[];
  readonly alternativesRejected: readonly string[];
  readonly expectedCostRisk: string;
  readonly laborRequirement: "low" | "moderate" | "high" | "blocked";
  readonly involvedGroup: AdaptiveTaskGroup;
  readonly season: Season;
  readonly contextTileId: TileId;
  readonly decisionId: DecisionId;
  readonly decisionTrace: string;
  readonly behaviorEffectScope: AdaptiveBehaviorEffectScope;
  readonly scoreDelta: NormalizedIntensity;
}

export interface SolutionAttempt {
  readonly id: string;
  readonly ideaId: string;
  readonly responseId: string;
  readonly attemptType: AdaptiveResponseType;
  readonly participants: AdaptiveTaskGroup;
  readonly participantEstimate: number;
  readonly placeTileId: TileId;
  readonly targetTileId?: TileId;
  readonly materialUsed: readonly string[];
  readonly feedbackType: AdaptiveFeedbackType;
  readonly feedbackQuality: AdaptiveFeedbackQuality;
  readonly outcome: AdaptiveAttemptOutcome;
  readonly eventRefs: readonly EventId[];
  readonly memoryRefs: readonly string[];
  readonly costPaid: "none" | "low" | "moderate" | "high";
  readonly riskRealized: "none" | "low" | "moderate" | "high";
  readonly helpedEscapeOrSurvive: boolean;
  readonly blockedReason?: string;
  readonly noAutomaticImprovement: true;
}

export interface AdaptivePracticeVariant {
  readonly id: string;
  readonly parentIdeaId?: string;
  readonly parentRoutineId?: string;
  readonly publicLabel: string;
  readonly variantCause:
    | "material_difference"
    | "place_difference"
    | "copied_source"
    | "contradictory_feedback"
    | "labor_change"
    | "season_change"
    | "partial_inheritance"
    | "misread_trace";
  readonly status: "untested_variant" | "failed_variant" | "promising_variant" | "local_only_variant";
  readonly evidenceRefs: readonly string[];
  readonly noGlobalUnlock: true;
}

export interface LocalRoutine {
  readonly id: string;
  readonly sourceIdeaId: string;
  readonly domain: AdaptiveIdeaFamily;
  readonly publicLabel: string;
  readonly contextWhereItWorks: string;
  readonly contextWhereItFails: string;
  readonly confidence: NormalizedIntensity;
  readonly confidenceBand: AdaptiveRoutineConfidenceBand;
  readonly carrierBasis: string;
  readonly repetitionCount: number;
  readonly successfulFeedbackCount: number;
  readonly failureCount: number;
  readonly lastUsedTick: TickNumber;
  readonly transferDifficulty: AdaptiveTransferDifficulty;
  readonly decayRisk: "low" | "moderate" | "high";
  readonly mutationHookIds: readonly string[];
  readonly behaviorInfluenceAllowed: boolean;
  readonly behaviorEffectScope: AdaptiveBehaviorEffectScope;
  readonly notGlobalSkill: true;
}

export interface ContextBoundAdaptation {
  readonly id: string;
  readonly sourceRoutineId: string;
  readonly domain: AdaptiveIdeaFamily;
  readonly bandLocal: true;
  readonly publicLabel: string;
  readonly carriers: string;
  readonly confidence: NormalizedIntensity;
  readonly limitations: readonly string[];
  readonly transferDifficulty: AdaptiveTransferDifficulty;
  readonly failureConditions: readonly string[];
  readonly decayRisk: "low" | "moderate" | "high";
  readonly decisionInfluence: AdaptiveBehaviorEffectScope;
  readonly noGlobalUnlock: true;
  readonly noTechTree: true;
}

export interface AdaptivePassiveCollapseAudit {
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly status: "not_under_collapse_pressure" | "attempted_response" | "blocked_response" | "suspicious_passive";
  readonly collapsePressure: NormalizedIntensity;
  readonly recentAttemptCount: number;
  readonly blockedReasons: readonly string[];
  readonly lastAttemptId?: string;
}

export interface AdaptiveDecisionTrace {
  readonly decisionId: DecisionId;
  readonly actionType: Action["type"];
  readonly selectedIdeaId?: string;
  readonly responseId?: string;
  readonly scoreDelta: NormalizedIntensity;
  readonly behaviorEffectScope: AdaptiveBehaviorEffectScope;
  readonly reasonId?: ReasonId;
}

// ENVIRONMENT-READING PRACTICAL ADAPTATION / INVENTION-1 — compositional
// practical-learning substrate. Bands learn small PRACTICAL FRAGMENTS
// (material properties, techniques, place/route readings) from repeated lived
// evidence, and may compose them into PRACTICAL RESPONSES when a real
// experienced condition makes the response worth attempting. Responses affect
// real coefficients (never prose), earn or lose confidence only through
// response-specific efficacy, and can be weak, partial, revised, dormant, or
// abandoned. Fragments/responses are bounded, deterministic, band-local,
// material- and context-dependent — never inventory items, technology
// unlocks, or identity labels.

export type PracticalFragmentDomain =
  | "material_property"
  | "technique"
  | "place_route"
  | "animal_behavior"
  | "structure"
  // INVENTION-3: abstract practical patterns (counting, pacing, dimension
  // matching) earned only from repeated lived task evidence — never a
  // "mathematics" unlock.
  | "abstract_pattern";

export type PracticalFragmentBasis = "lived" | "inherited" | "copied" | "inferred";

export type PracticalFragmentKnowledgeState =
  | "tentative"
  | "confident"
  | "partial"
  | "contradicted"
  | "stale"
  | "dormant"
  | "incorrect";

export interface PracticalFragment {
  readonly id: string;
  readonly domain: PracticalFragmentDomain;
  // What was learned about (e.g. "fiber_cordage", "load_staging").
  readonly subject: string;
  // The practical property observed (e.g. "holds_tension_when_dry").
  readonly property: string;
  readonly publicLabel: string;
  readonly basis: PracticalFragmentBasis;
  readonly strength: NormalizedIntensity;
  readonly failureCount: number;
  readonly lastReinforcedTick: TickNumber;
  readonly evidenceRefs: readonly string[];
  // ROUTINES-2: epistemic state is separate from raw strength. Optional for
  // backward-compatible audit fixtures; live fragments always populate it.
  readonly knowledgeState?: PracticalFragmentKnowledgeState;
  readonly observationCount?: number;
  readonly contradictionCount?: number;
  readonly contextKeys?: readonly string[];
}

export type PracticalResponseFamily =
  | "carrying_load"
  | "dry_route_water"
  | "hunting_distance"
  | "temporary_shelter"
  | "water_storage"
  // Declared extension family (registry-documented, not yet implementable):
  | "animal_proximity"
  | "engineering_structure"
  // INVENTION-3 families:
  | "groundwater_seek"
  | "care_treatment"
  | "proto_measure";

export type PracticalResponseStatus =
  | "forming"
  | "active"
  | "dormant"
  | "abandoned";

export interface PracticalResponseState {
  readonly id: string;
  readonly family: PracticalResponseFamily;
  // Composition signature — WHICH configuration of fragments this variant uses
  // (e.g. "fiber_sling" vs "load_staging" vs "carrying_frame"). Two variants
  // with the same family differ in required fragments, caps, and history.
  readonly variantKey: string;
  readonly publicLabel: string;
  readonly status: PracticalResponseStatus;
  readonly confidence: NormalizedIntensity;
  readonly successCount: number;
  readonly partialCount: number;
  readonly failureCount: number;
  readonly formedAtTick: TickNumber;
  readonly lastActiveTick: TickNumber;
  readonly lastEfficacy?: AdaptiveEfficacyClassification;
  readonly requiredFragmentIds: readonly string[];
  // Locality/context restriction in plain terms (proof surface, not behavior).
  readonly contextNote: string;
  // Variant lineage when a failed configuration was revised into this one.
  readonly revisionOf?: string;
  // INVENTION-3 canonical causal history links: the problem frame, idea
  // candidate and experiment this response formed through. Optional only for
  // pre-INVENTION-3 fixture state; live formation always populates them.
  readonly problemId?: string;
  readonly ideaId?: string;
  readonly experimentId?: string;
}

// ---------------------------------------------------------------------------
// INVENTION-3 — canonical causal chain state. One bounded history:
//   lived problem/opportunity → problem frame → idea candidates → selected
//   experiment → attempts (the forming response's real practice) → observed
//   result → fragments → response → real coefficient → efficacy → refinement.
// UI derives cards from this state; the cards are never the state.
// ---------------------------------------------------------------------------

export type PracticalProblemFamily =
  | "carrying_burden"
  | "water_route_shortage"
  | "camp_water_shortage"
  | "vessel_water_loss"
  | "camp_exposure"
  | "hunting_danger"
  | "sickness_injury"
  | "journey_misjudgment"
  | "crossing_blocked";

export type PracticalProblemOrigin = "lived" | "inherited" | "copied" | "opportunity";

export type PracticalProblemStatus = "active" | "dormant" | "resolved" | "revised";

export interface PracticalProblemFrame {
  readonly id: string;
  readonly family: PracticalProblemFamily;
  readonly publicLabel: string;
  // What the band believes causes the problem. May be WRONG (misread=true):
  // the competing interpretation is then the better reading, and idea
  // selection is biased toward the misread until contradiction revises it.
  readonly interpretation: string;
  readonly competingInterpretation?: string;
  readonly misread: boolean;
  readonly severity: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly repetitionCount: number;
  readonly origin: PracticalProblemOrigin;
  readonly status: PracticalProblemStatus;
  readonly evidenceRefs: readonly string[];
  readonly contextKey?: string;
  readonly framedAtTick: TickNumber;
  readonly lastEvidenceTick: TickNumber;
}

export type PracticalIdeaStatus = "considered" | "selected" | "rejected" | "postponed";

export type PracticalIdeaSource = "local_inference" | "copied" | "inherited" | "accident";

export interface PracticalIdeaCandidate {
  readonly id: string;
  readonly problemId: string;
  readonly family: PracticalResponseFamily;
  readonly variantKey: string;
  readonly publicLabel: string;
  // The mechanism the band believes would help (from the variant spec).
  readonly mechanismBelief: string;
  readonly basisFragmentIds: readonly string[];
  readonly basisScore: NormalizedIntensity;
  readonly status: PracticalIdeaStatus;
  readonly statusReason: string;
  readonly source: PracticalIdeaSource;
  readonly consideredAtTick: TickNumber;
}

export type PracticalExperimentStatus =
  | "underway"
  | "concluded_success"
  | "concluded_partial"
  | "concluded_failure"
  | "abandoned";

export interface PracticalExperiment {
  readonly id: string;
  readonly problemId: string;
  readonly ideaId: string;
  readonly responseId: string;
  readonly family: PracticalResponseFamily;
  readonly variantKey: string;
  // The real coefficient the experiment expects to change, and how.
  readonly expectedEffect: string;
  readonly materials: readonly string[];
  readonly procedure: string;
  readonly laborCost: NormalizedIntensity;
  readonly riskCost: NormalizedIntensity;
  readonly opportunityCost: string;
  readonly observationBasis: "direct" | "inferred";
  readonly observedOutcome?: string;
  readonly attemptSeasons: number;
  readonly status: PracticalExperimentStatus;
  readonly contextKey?: string;
  readonly fragmentsLearned: readonly string[];
  readonly fragmentsContradicted: readonly string[];
  readonly startedAtTick: TickNumber;
  readonly concludedAtTick?: TickNumber;
}

// INVENTION-3 — groundwater works at a specific tile. The band's own built
// seep/well state: place-bound, maintained, seasonal, collapsible. Never
// inherited by daughters (it stays with the ground, and the parent band).
export type PracticalWaterWorksStatus =
  | "digging"
  | "damp_seep"
  | "contaminated_seep"
  | "seasonal_seep"
  | "shallow_well"
  | "dry_hole"
  | "collapsed"
  | "abandoned";

export interface PracticalWaterWorks {
  readonly tileId: TileId;
  readonly status: PracticalWaterWorksStatus;
  readonly responseId: string;
  // Realized yield 0..1 — the bounded water-stress relief the works currently
  // provide at this tile (0 for dry holes/collapses).
  readonly yieldLevel: NormalizedIntensity;
  readonly digSeasons: number;
  readonly laborPaid: NormalizedIntensity;
  readonly lastLaborCost: NormalizedIntensity;
  readonly builtAtTick: TickNumber;
  readonly lastMaintainedTick: TickNumber;
  readonly outcomeNote: string;
}

export interface PracticalAdaptationState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly fragments: readonly PracticalFragment[];
  readonly responses: readonly PracticalResponseState[];
  readonly efficacyRecords: readonly AdaptiveEfficacyRecord[];
  // INVENTION-3 canonical causal chain (optional only for pre-pass fixtures;
  // the live advance always populates the arrays, possibly empty).
  readonly problems?: readonly PracticalProblemFrame[];
  readonly ideas?: readonly PracticalIdeaCandidate[];
  readonly experiments?: readonly PracticalExperiment[];
  readonly waterWorks?: PracticalWaterWorks;
  readonly caps: {
    readonly fragmentCap: number;
    readonly responseCap: number;
    readonly recordCap: number;
    readonly problemCap?: number;
    readonly ideaCap?: number;
    readonly experimentCap?: number;
    readonly held: boolean;
  };
}

// ADAPTIVE EFFICACY FEEDBACK-1 — how a practical response's attempt was judged:
// by its OWN measured effect on a real coefficient/outcome (specific), or by the
// generic movement fallback when no response-specific evidence exists. Broad
// movement success must never be recorded as specific practice success.
export type AdaptiveEfficacyClassification =
  | "clear_success_specific"
  | "partial_success_specific"
  | "failure_or_danger_specific"
  | "matching_use_without_practice"
  | "irrelevant_movement"
  | "context_mismatch"
  | "low_or_no_feedback_specific";

// One bounded, compact proof record per response-specific efficacy evaluation
// (Technical reads these; the sim writes them from the same evidence it acted on).
export interface AdaptiveEfficacyRecord {
  readonly id: string;
  readonly tick: TickNumber;
  readonly responseId: string;
  readonly family: AdaptiveIdeaFamily | PracticalResponseFamily;
  readonly classification: AdaptiveEfficacyClassification;
  readonly outcome: AdaptiveFeedbackType;
  // Matching place/route/ford context key (crossing key or camp tile id).
  readonly contextKey?: string;
  // Whether the practiced response was actually active in the decision.
  readonly responseActive: boolean;
  // The real coefficient the response affects (e.g. riverCrossingRisk).
  readonly coefficient: string;
  readonly preEffectValue: number;
  readonly effectAmount: number;
  readonly effectCap: number;
  // Remembered-danger change at the matching context (riskMemory delta).
  readonly dangerDelta: number;
  // Practice-evidence change at the matching context (successConfidence delta).
  readonly practiceDelta: number;
  // Local routine confidence / failure-evidence change caused by this outcome.
  readonly confidenceDelta: number;
  readonly failureDelta: number;
  readonly futureInfluenceChanged: boolean;
  readonly localityNote: string;
  readonly reason: string;
}

export interface AdaptiveHumanState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly activeIdeas: readonly AdaptiveIdea[];
  readonly selectedResponses: readonly AdaptiveResponse[];
  readonly recentAttempts: readonly SolutionAttempt[];
  readonly localRoutines: readonly LocalRoutine[];
  readonly contextBoundAdaptations: readonly ContextBoundAdaptation[];
  readonly variants: readonly AdaptivePracticeVariant[];
  readonly passiveCollapseAudit?: AdaptivePassiveCollapseAudit;
  readonly latestDecisionTrace?: AdaptiveDecisionTrace;
  // ADAPTIVE EFFICACY FEEDBACK-1: newest-first, capped, absent before the pass.
  readonly efficacyRecords?: readonly AdaptiveEfficacyRecord[];
  readonly caps: {
    readonly activeIdeaCap: number;
    readonly selectedResponseCap: number;
    readonly attemptCap: number;
    readonly routineCap: number;
    readonly adaptationCap: number;
    readonly variantCap: number;
    readonly evidencePerItemCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly behaviorActive: true;
    readonly boundedBehaviorInfluence: true;
    readonly noTechTree: true;
    readonly noGlobalUnlock: true;
    readonly noNewEcology: true;
    readonly noCultureSettlementTerritoryTradeWar: true;
    readonly noAutomaticImprovement: true;
    readonly antiOmniscient: true;
  };
}

export type CampMovementScale =
  | "local_camp_shift"
  | "temporary_task_camp"
  | "new_place_establishment"
  | "hard_move_recovery"
  | "old_anchor_decay"
  | "pressure_relief_move"
  | "relief_scout_probe"
  | "stagnation_escape";

export type CampMovementStatus =
  | "established"
  | "establishing"
  | "recovering"
  | "shifting"
  | "probing"
  | "stagnant"
  | "unstable";

export type TemporaryCampPurpose =
  | "food_work"
  | "water_edge_work"
  | "crossing_prep"
  | "scout_probe"
  | "recovery"
  | "refuge_check";

export type EstablishmentOutcome = "strengthened" | "weak" | "failed" | "still_testing";

export type CampMovementEvidenceSystem =
  | "adaptive_human"
  | "camp_foothold"
  | "activity"
  | "place_memory"
  | "movement"
  | "event"
  | "demography"
  | "pressure"
  | "route_crossing";

export interface CampMovementEvidenceRef {
  readonly sourceSystem: CampMovementEvidenceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly tileId?: TileId;
  readonly eventId?: string;
  readonly activityId?: string;
  readonly reasonIds: readonly ReasonId[];
}

export type PressureReliefCandidateRelation =
  | "same_local_cluster"
  | "nearby_known_range"
  | "edge_of_familiar_country";

export type PressureReliefCandidateStatus =
  | "chosen"
  | "good_enough"
  | "scout_probe"
  | "rejected"
  | "blocked";

export type PressureReliefCandidateActionStrategy =
  | "move_to_tile"
  | "scout_probe"
  | "blocked";

export interface PressureReliefCandidate {
  readonly id: string;
  readonly tileId: TileId;
  readonly distanceTiles: number;
  readonly relationToCurrentCluster: PressureReliefCandidateRelation;
  readonly knownness: NormalizedIntensity;
  readonly supportAdequacy: NormalizedIntensity;
  readonly waterRefugeAdequacy: NormalizedIntensity;
  readonly pressureReliefScore: NormalizedIntensity;
  readonly usePressureDifference: NormalizedIntensity;
  readonly campSicknessWearRelief: NormalizedIntensity;
  readonly crossingTravelCost: NormalizedIntensity;
  readonly oldCampPullPenalty: NormalizedIntensity;
  readonly uncertainty: NormalizedIntensity;
  readonly supportDelta: number;
  readonly betterThanCurrent: boolean;
  readonly strictFoodBetter: boolean;
  readonly goodEnoughRelief: boolean;
  readonly familiarCountry: boolean;
  readonly sameRiverCountry: boolean;
  readonly actionStrategy: PressureReliefCandidateActionStrategy;
  readonly status: PressureReliefCandidateStatus;
  readonly reasonLabel: string;
  readonly blockedReason?: string;
  readonly evidenceRefs: readonly CampMovementEvidenceRef[];
}

export interface LocalOrbitTrapState {
  readonly detected: boolean;
  readonly currentLocalClusterId: string;
  readonly recentMicroShiftCount: number;
  readonly recentDistinctTileCount: number;
  readonly sameClusterLoop: boolean;
  readonly pressure: NormalizedIntensity;
  readonly escalation: "none" | "relief_move" | "scout_probe" | "blocked";
  readonly basis: readonly string[];
}

export interface EscapeTargetIntegrityState {
  readonly escapeResponsesWithTarget: number;
  readonly escapeResponsesBlocked: number;
  readonly targetlessAttempts: number;
  readonly repeatedTargetlessAttempts: number;
  readonly latestBlockedReason?: string;
}

export type EstablishmentScope =
  | "continued_place"
  | "same_cluster_shift"
  | "pressure_relief_shift"
  | "new_cluster_establishment"
  | "outward_relocation";

export interface EstablishmentScopeState {
  readonly currentLocalClusterId: string;
  readonly previousLocalClusterId?: string;
  readonly scope: EstablishmentScope;
  readonly sameClusterShift: boolean;
  readonly newClusterMove: boolean;
  readonly carriedOver: boolean;
  readonly carryOverAmount: NormalizedIntensity;
  readonly resetReason?: string;
}

export interface RangeRotationPressureReliefState {
  readonly currentLocalClusterId: string;
  readonly currentLocalRangeId: string;
  readonly currentUsePressure: NormalizedIntensity;
  readonly rangeSaturationPressure: NormalizedIntensity;
  readonly candidates: readonly PressureReliefCandidate[];
  readonly chosenCandidate?: PressureReliefCandidate;
  readonly rejectedCandidates: readonly PressureReliefCandidate[];
  readonly blockedReason?: string;
  readonly localOrbitTrap: LocalOrbitTrapState;
  readonly scoutProbeBridge?: PressureReliefCandidate;
  readonly targetIntegrity: EscapeTargetIntegrityState;
  readonly establishmentScope: EstablishmentScopeState;
  readonly counts: {
    readonly reliefCandidates: number;
    readonly goodEnoughCandidates: number;
    readonly chosenReliefMoves: number;
    readonly rejectedReliefCandidates: number;
    readonly blockedReliefMoves: number;
    readonly scoutProbeBridges: number;
    readonly sameClusterShifts: number;
    readonly newClusterEstablishments: number;
    readonly establishmentCarryOverCases: number;
    readonly establishmentResetCases: number;
  };
  readonly caps: {
    readonly candidateCap: number;
    readonly rejectedCandidateCap: number;
    readonly searchRadiusTiles: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly goodEnoughSeparateFromBetterThanCurrent: boolean;
    readonly boundedBehaviorInfluence: true;
    readonly noLongDistanceMigrationForced: true;
    readonly riverFollowingRetained: true;
    readonly noFissionBehaviorChange: true;
    readonly noNewEcology: true;
  };
}

export interface LocalCampShiftRecord {
  readonly id: string;
  readonly tick: TickNumber;
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly distance: number;
  readonly reason: string;
  readonly outcome: EstablishmentOutcome;
  readonly confidence: NormalizedIntensity;
  readonly evidenceRefs: readonly CampMovementEvidenceRef[];
  readonly noSettlement: true;
}

export interface TemporaryTaskCampRecord {
  readonly id: string;
  readonly tick: TickNumber;
  readonly originTileId: TileId;
  readonly targetTileId: TileId;
  readonly purpose: TemporaryCampPurpose;
  readonly status: "active" | "completed" | "failed" | "expired";
  readonly confidence: NormalizedIntensity;
  readonly expiresAfterTick: TickNumber;
  readonly evidenceRefs: readonly CampMovementEvidenceRef[];
  readonly noSettlement: true;
  readonly noInventory: true;
}

export interface NewPlaceEstablishmentState {
  readonly id: string;
  readonly tileId: TileId;
  readonly localClusterId: string;
  readonly startedTick: TickNumber;
  readonly ageTicks: number;
  readonly confidence: NormalizedIntensity;
  readonly status: "new" | "testing" | "holding" | "failing" | "established";
  readonly scope: EstablishmentScope;
  readonly sameClusterShift: boolean;
  readonly establishmentCarriedOver: boolean;
  readonly carryOverFromTileId?: TileId;
  readonly resetReason?: string;
  readonly knownBasis: readonly string[];
  readonly recoveryNeed: NormalizedIntensity;
  readonly oldCampPull: NormalizedIntensity;
  readonly localFamiliarity: NormalizedIntensity;
  readonly localProblemPressure: NormalizedIntensity;
  readonly retreatRisk: NormalizedIntensity;
  readonly commitHoldTendency: NormalizedIntensity;
  readonly blockedReasons: readonly string[];
  readonly evidenceRefs: readonly CampMovementEvidenceRef[];
  readonly noSettlement: true;
}

export interface OldCampAnchorDecayRecord {
  readonly id: string;
  readonly tick: TickNumber;
  readonly tileId: TileId;
  readonly pullBefore: NormalizedIntensity;
  readonly pullAfter: NormalizedIntensity;
  readonly decayAmount: NormalizedIntensity;
  readonly reason: string;
  readonly canRecover: true;
}

export interface StagnationEscapeRecord {
  readonly id: string;
  readonly tick: TickNumber;
  readonly status: "trying" | "blocked" | "helped" | "failed";
  readonly response:
    | "minor_camp_shift"
    | "pressure_relief_move"
    | "temporary_task_camp"
    | "scout_probe"
    | "risky_relocation"
    | "recovery_hold"
    | "use_local_routine"
    | "no_viable_response";
  readonly actionType: Action["type"];
  readonly targetTileId?: TileId;
  readonly reason: string;
  readonly blockedReasons: readonly string[];
  readonly evidenceRefs: readonly CampMovementEvidenceRef[];
}

export interface CampMovementPassiveCollapseAudit {
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly status: "not_under_collapse_pressure" | "attempted_escape" | "blocked_escape" | "suspicious_passive";
  readonly collapsePressure: NormalizedIntensity;
  readonly recentEscapeCount: number;
  readonly blockedReasons: readonly string[];
  readonly lastEscapeId?: string;
}

export interface CampMovementDecisionTrace {
  readonly decisionId: DecisionId;
  readonly actionType: Action["type"];
  readonly scale: CampMovementScale;
  readonly targetTileId?: TileId;
  readonly scoreDelta: NormalizedIntensity;
  readonly reasonId?: ReasonId;
  readonly basis: readonly string[];
}

export interface CampMovementState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly status: CampMovementStatus;
  readonly currentEstablishment?: NewPlaceEstablishmentState;
  readonly recentLocalShifts: readonly LocalCampShiftRecord[];
  readonly temporaryTaskCamps: readonly TemporaryTaskCampRecord[];
  readonly oldCampPullScore: NormalizedIntensity;
  readonly oldCampDecay: readonly OldCampAnchorDecayRecord[];
  readonly stagnationFlags: readonly string[];
  readonly stagnationEscapes: readonly StagnationEscapeRecord[];
  readonly passiveCollapseAudit?: CampMovementPassiveCollapseAudit;
  readonly latestDecisionTrace?: CampMovementDecisionTrace;
  readonly rangeRotation?: RangeRotationPressureReliefState;
  readonly oscillationGuard: {
    readonly recentBacktrackCount: number;
    readonly blockedOscillationCount: number;
    readonly lastBlockedPair?: readonly [TileId, TileId];
  };
  readonly caps: {
    readonly localShiftCap: number;
    readonly temporaryCampCap: number;
    readonly oldCampDecayCap: number;
    readonly stagnationEscapeCap: number;
    readonly evidencePerItemCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly behaviorActive: true;
    readonly boundedBehaviorInfluence: true;
    readonly noSettlement: true;
    readonly noInventoryPropertyStorageEconomy: true;
    readonly noNewEcology: true;
    readonly noCultureTerritoryTradeWar: true;
    readonly antiOmniscient: true;
  };
}

export interface Band {
  readonly id: BandId;
  readonly name: string;
  readonly color: string;
  readonly position: TileId;
  readonly size: number;
  readonly status: BandStatus;
  readonly mobilityStrategy: MobilityStrategy;
  readonly subsistenceModes: readonly SubsistenceMode[];
  readonly technologies: readonly TechnologyTag[];
  readonly knowledge: KnowledgeState;
  readonly seasonalRoute: readonly TileId[];
  readonly currentCampTileId?: TileId;
  readonly currentSettlementId?: SettlementId;
  readonly consecutiveSeasonsOnTile: number;
  readonly decisionHistory: readonly DecisionId[];
  readonly cohesion: number;
  readonly mobilityCostTolerance: number;
  readonly storageCapacity: number;
  readonly hungerPressure: number;
  readonly territorialPressure: number;
  readonly demography: BandDemography;
  readonly biomeAdaptation: BiomeAdaptationProfile;
  readonly socialPressure: SocialPressureProfile;
  readonly health: HealthProfile;
  readonly parentBandId?: BandId;
  readonly daughterBandIds: readonly BandId[];
  readonly lineage?: BandLineageLink;
  readonly fissionEvents: readonly BandFissionEvent[];
  readonly initialSpawnReason?: InitialSpawnReason;
  readonly currentIntent?: MobilityIntent;
  readonly intentHistory?: readonly MobilityIntent[];
  readonly movementHistory: readonly BandMovementRecord[];
  readonly lastIntraSeasonTrip?: IntraSeasonTripRecord;
  readonly recentIntraSeasonTrips?: readonly IntraSeasonTripRecord[];
  // EXPEDITIONARY-1: parties currently AWAY from this residential camp (bounded,
  // cap EXPEDITION_ACTIVE_CAP). Their workers are committed exactly once and are
  // unavailable to same-day trips until they physically return. Terminal records
  // are compacted into `recentExpeditionOutcomes`, never accumulated here.
  readonly expeditions?: readonly ExpeditionRecord[];
  // EXPEDITIONARY-3: stored mobility — slow reversible conditioning + bounded REALIZED
  // walking history (km). Capacity is NOT stored here: it is derived per party per day
  // from composition + nutrition + conditioning − fatigue, so it can never go stale or
  // become a second movement authority. History conditions; it never permits.
  readonly mobility?: BandMobilityState;
  // EXPEDITIONARY-1: bounded terminal history (cap EXPEDITION_OUTCOME_CAP) — what
  // came back, what failed and why. Read by the candidate family as lived evidence.
  readonly recentExpeditionOutcomes?: readonly ExpeditionOutcomeSummary[];
  readonly activityLaborSummary?: ActivityLaborSummary;
  readonly activityOutcomeSummary?: ActivityOutcomeSummary;
  readonly activityShadowSubsistenceSummary?: ActivityShadowSubsistenceSummary;
  readonly activityMemoryUpdateSummary?: ActivityMemoryUpdateSummary;
  // ECO-SEASON-1 — bounded, learned-by-observation seasonal ecology memory keyed by
  // tile. SEPARATE from resource patch memory; never read by the economy. Daughters reset.
  readonly seasonalEcologyMemory?: Readonly<Record<TileId, SeasonalEcologyObservation>>;
  // RESIDENTIAL-MOVE-1 — bounded ring of recent RECORD-ONLY residential relocation
  // events (newest first). Explanatory only: no behaviour reads it; daughters reset
  // it on fission rather than inheriting the parent's events.
  readonly recentResidentialMoveEvents?: readonly ResidentialMoveEvent[];
  // POST-ECOLOGY CLOSURE-1 — one bounded record per real residential movement
  // intention. Unlike recentResidentialMoveEvents this also records grounded waits
  // and abandonment, so an ordinary stay with no intent produces no false rejection.
  readonly residentialMovementIntentOutcomes?: readonly ResidentialMovementIntentOutcomeRecord[];
  // Bounded probe-recency memory (2K.1G): which logistical-probe targets the band has
  // recently scouted and whether they were informative — drives probe target diversity
  // + diminishing returns. Probe-quality only; never relocation/yield/stress.
  readonly probeMemory?: ProbeRecencyMemory;
  // Debug-only record of the band's most recent resource_scout (2K.1H). Surfaced in
  // report-band/BandPanel; never read by behaviour.
  readonly lastResourceScout?: ResourceScoutDebug;
  // Debug-only bounded ring of recent scout learning/contradiction records (2K.1I-A).
  // No behaviour reads this; daughters reset it rather than cloning parent history.
  readonly recentScoutLearning?: readonly ScoutLearningRingEntry[];
  // Debug-only bounded ring of recent cautious plant use/testing events (2K.2E).
  // These are learning records only: no food/support/yield/stress/mortality/relocation coupling.
  readonly lastPlantUseTest?: PlantUseTestEvent;
  readonly recentPlantUseTests?: readonly PlantUseTestRingEntry[];
  // Debug-only bounded ring of recent cause-specific nonlethal stress/illness-poisoning
  // SCAFFOLD events (2K.3A). Typed consequence records for risky plant/food/water/testing
  // causes — suspicion-level memory/debug only: NO mortality/population/stress/yield/
  // carrying-capacity/relocation/fission coupling, and no random poisoning. Daughters reset.
  readonly lastCauseSpecificEvent?: CauseSpecificEvent;
  readonly recentCauseSpecificEvents?: readonly CauseSpecificEventRingEntry[];
  // 2K.6 — learned plant/resource EXPLOITATION SKILL: a persistent, accumulating,
  // anti-omniscient per-resource-class competence (and processing-suspicion
  // resolution) distilled from the band's OWN use-test/cause experience. Learned
  // KNOWLEDGE only — no yield/support/CC/stress coupling. Inherited DEGRADED on
  // fission (cultural transmission; competence halved, processing_learned must be
  // re-earned). Inert (undefined) until the band actually tests a resource.
  readonly exploitationSkill?: ExploitationSkillState;
  readonly placeMemory: Readonly<Record<TileId, PlaceMemoryRecord>>;
  // Resource Knowledge State + Patch Memory substrate (2K.1A): sparse, bounded
  // beliefs about resource patches, DISTINCT from terrain/place knowledge. Structure
  // only — normally undefined (treated as empty); not yet produced or consumed.
  readonly resourceKnowledgeState?: ResourceKnowledgeState;
  readonly resourceEcology?: ResourceEcologyBandState;
  readonly visibleNature?: VisibleNatureState;
  // ROUTINES-2: persisted animal knowledge comes only from bounded observations
  // (trip traces, tracks, sightings, camp approaches, and management outcomes),
  // never from the current hidden stock snapshot projected by visibleNature.
  readonly animalPatternKnowledge?: AnimalPatternKnowledgeState;
  readonly animalManagement?: ProtoAnimalManagementState;
  readonly acuteRisk?: AcuteRiskState;
  readonly travelCorridors: Readonly<Record<RouteId, TravelCorridorMemory>>;
  readonly crossingMemories: Readonly<Record<string, KnownCrossingMemory>>;
  readonly usePressure: Readonly<Record<TileId, LocalUsePressureRecord>>;
  readonly compressedCorridorSummaries?: readonly CompressedCorridorSummary[];
  readonly pressureState?: BandPressureState;
  readonly inheritanceProfile?: BandInheritanceProfile;
  readonly rangeSaturation?: RangeSaturationState;
  readonly frontierDispersal?: FrontierDispersalPressure;
  // Persistent, decaying, anti-omniscient sustained-frontier-drift intent (M0.3).
  // Daughters may inherit a DEGRADED copy on frontier-driven fission; never a hard
  // parent-attachment lock. Cleared (undefined) when band-known evidence fades.
  readonly frontierIntent?: FrontierIntentState;
  // Emergent band-known retention value at a reached frontier locus (M0.4). Earned
  // ONLY from a frontier daughter's own local experience (residence, local return
  // trend, water/refuge confirmation, known opportunity, corridor memory); never
  // inherited and never from truth richness. Decays/clears when she leaves the
  // locus or local evidence fades. Lets a colonised frontier compete with the
  // remembered origin so a new range can be HELD, without forcing settlement.
  readonly frontierResidence?: FrontierResidenceValue;
  // Bounded, anti-omniscient shoreline/frontier knowledge FORMATION (M0.6). Existence
  // -only inferred shore tiles that extend the band's known world along a water boundary
  // one ring per season. M0.7 can read this only for a residence-unchanged observation
  // probe; it never reads truth richness or makes inference a resource opportunity.
  readonly frontierKnowledge?: FrontierKnowledgeState;
  // Cadence governor for M0.8 corridor relocation (M0.8-A): rate-limits the shore walk
  // (dwell-since-last-relocation cooldown + per-step anchor reluctance that decays after a
  // stable dwell). Set only when a relocation executes; never inherited (daughters reset).
  readonly corridorRelocation?: CorridorRelocationState;
  // Cadence governor for the pre-existing mobility-intent shoreline/frontier PROBE moves
  // (M0.8-B): after a burst of consecutive `frontier_probe` moves the band rests a short
  // cooldown before another shore probe is offered. Set only when such a probe move
  // executes; never inherited (daughters reset → earn their own cadence).
  readonly frontierProbeCadence?: FrontierProbeCadenceState;
  // Cadence governor for the M0.16B off-corridor SIDE-COUNTRY probe: a settled/anchored
  // corridor band may occasionally spend a residence-UNCHANGED logistical_probe to OBSERVE
  // its inferred off-corridor side land (converting existence belief → real knowledge),
  // rate-limited by a long cooldown and a hard per-band lifetime cap so it stays a rare
  // information action, never a migration force. Set only when such a probe executes; never
  // inherited (daughters reset → earn their own cadence). Inert (undefined) for any band
  // that never side-probes, so it leaks no behaviour onto unrelated runs.
  readonly sideProbeMemory?: SideProbeCadenceState;
  // Cadence governor for the M0.16B-style PROACTIVE resource information-seeking (2K.6B /
  // INFO-1): rate-limits how often a stable, spare-labor band proactively scouts/tests an
  // under-known nearby resource/side-country patch (residence-unchanged) so it learns before
  // a crisis. Set only when such an action executes; never inherited (daughters reset).
  readonly proactiveInfoMemory?: ProactiveInfoCadenceState;
  // Directional corridor persistence (M0.9): a small earned heading that tie-breaks among
  // valid frontier_probe/corridor candidates so the band keeps a gentle shoreline heading
  // instead of re-picking the nearest local tile each season. Set only from realized probe/
  // corridor moves; never inherited (daughters reset → earn their own).
  readonly corridorHeading?: CorridorHeadingState;
  readonly nearbyOpportunity?: NearbyOpportunityGradient;
  readonly encounterRecords: readonly BandEncounterRecord[];
  readonly contactMemories: Readonly<Record<BandId, KnownBandContactMemory>>;
  readonly reportedKnowledge?: ReportedKnowledgeState;
  readonly visibleLandscapeCues?: readonly VisibleLandscapeCue[];
  readonly recentRangeFrictionEvents?: readonly RangeFrictionEvent[];
  readonly disposition?: BandDispositionState;
  readonly encounterPerceptions: readonly EncounterPerception[];
  readonly encounterResponses: readonly EncounterResponseDistribution[];
  readonly temporarySeparation?: TemporarySeparationPressure;
  readonly viability?: BandViabilityState;
  readonly dryMarginContext?: DryMarginMobilityContext;
  readonly residentialAnchor?: ResidentialAnchorState;
  readonly preDecisionAnchor?: ResidentialAnchorState;
  readonly foragingRadiusState?: ForagingRadiusState;
  readonly intraSeasonActivity?: IntraSeasonActivitySummary;
  readonly anchorDecision?: AnchorDecisionComparison;
  readonly anchorMemories?: Readonly<Record<TileId, AnchorMemoryRecord>>;
  readonly seasonalRound?: SeasonalRoundMemory;
  readonly seasonalRoundState?: SeasonalRoundDecisionState;
  readonly seasonalTimeline?: readonly SeasonalTimelineEntry[];
  readonly roundCatchmentRotation?: RoundCatchmentRotationState;
  readonly populationDemand?: PopulationDemandState;
  readonly perCapitaReturn?: PerCapitaReturnState;
  readonly carryingCapacity?: CarryingCapacityState;
  readonly daughterColonization?: DaughterColonizationPressure;
  readonly nomadicScalePressure?: NomadicScalePressureState;
  readonly ecologicalStressCauses?: EcologyStressCauseSummary;
  readonly returnTrend?: ReturnTrendMemory;
  readonly seasonalSupport?: SeasonalSupportState;
  readonly deathMemory?: DeathMemoryState;
  readonly innerFission?: InnerFissionState;
  readonly socialTension?: SocialTensionReadabilityState;
  readonly foragingAdaptation?: ForagingLearningAdaptationState;
  readonly bodyCampLogistics?: BodyCampSurvivalLogisticsState;
  readonly relationshipMemory?: RelationshipMemorySocialEcologyState;
  readonly eventHistory?: BandEventHistoryState;
  readonly campRumors?: CampRumorReadabilityState;
  readonly conditionProfile?: BandConditionProfileState;
  readonly lineageReadability?: BandLineageReadabilityState;
  readonly protoCampMemory?: ProtoCampMemoryState;
  readonly protoAccessMemory?: ProtoAccessMemoryState;
  readonly exhaustedRangeAudit?: ExhaustedRangeAudit;
  readonly anchorActionTrace?: AnchorActionTrace;
  readonly adaptiveHuman?: AdaptiveHumanState;
  // ENVIRONMENT-READING PRACTICAL ADAPTATION / INVENTION-1: bounded learned
  // fragments + composed practical responses (absent before the pass).
  readonly practicalAdaptation?: PracticalAdaptationState;
  readonly campMovement?: CampMovementState;
  readonly causalTraces: readonly CausalTrace[];
  // DEEP-TIME-HISTORY-TECH-1 — persisted durable history (founding snapshot,
  // era records, episodes). OBSERVE-ONLY: written by bandHistory.ts at creation
  // + one yearly pass; read by UI/audits only, never by any decision path.
  // Daughters get their OWN founding + bounded inherited summaries (registered
  // in DAUGHTER_NON_CLONEABLE_FIELDS — never the parent's object).
  readonly deepHistory?: BandDeepHistoryState;
}
