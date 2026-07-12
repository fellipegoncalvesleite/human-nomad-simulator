import type {
  BandId,
  Coord,
  DecisionId,
  EventId,
  ProtoPolityId,
  ReasonId,
  RegionId,
  RiverId,
  Season,
  SettlementId,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import type {
  ExpansionCommitmentLevel,
  ExpansionPressure,
  SettlementStage,
} from "../settlements/types";
import type { ResourceClassId } from "../agents/resourceClasses";

// 2K.1H: a general resource_scout is one action with an internal scoutKind, NOT seven
// unrelated top-level actions. Each kind maps from a resource class and behaves
// differently (water/refuge can repeat under stress; plant/aquatic are seasonal;
// animal_sign stays uncertain; fallback is survival-insurance; material/medicinal low).
export type ResourceScoutKind =
  | "water_refuge"
  | "plant_patch"
  | "aquatic_patch"
  | "animal_sign"
  | "fallback_food"
  | "material_patch"
  | "medicinal_toxic";
import type { RiverCrossingClass } from "../world/types";

export type NormalizedIntensity = number; // Abstract intensity: 0..1.
export type AbsoluteQuantity = number; // Concrete quantity: absolute units.

export type MobilityIntentKind =
  | "local_foraging"
  | "follow_river_corridor"
  | "probe_wetland_or_lake"
  | "probe_coast"
  | "seek_better_water"
  | "avoid_risk"
  | "cross_pass"
  | "return_to_known_good_area"
  | "expand_known_world"
  | "seek_new_range"
  | "frontier_dispersal"
  | "daughter_range_expansion";

export type MobilityIntentStatus =
  | "continued_intent"
  | "changed_intent"
  | "completed_intent"
  | "abandoned_intent"
  | "had_no_intent";

export type Action =
  | {
      readonly type: "stay";
      readonly tileId: TileId;
    }
  | {
      readonly type: "move_to_tile";
      readonly targetTileId: TileId;
    }
  | {
      readonly type: "explore_unknown_neighbor";
      readonly fromTileId: TileId;
      readonly targetTileId: TileId;
    }
  | {
      readonly type: "logistical_probe";
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly prospectTileIds: readonly TileId[];
    }
  | {
      // 2K.1H: general resource-scout / task group. Information action, residence-
      // UNCHANGED. Updates resource belief/patch memory only; never yield/stress/move.
      readonly type: "resource_scout";
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly scoutKind: ResourceScoutKind;
      readonly targetResourceClass: ResourceClassId;
    }
  | {
      readonly type: "follow_seasonal_route";
      readonly routeTileIds: readonly TileId[];
    }
  | {
      readonly type: "add_tile_to_route";
      readonly tileId: TileId;
    }
  | {
      readonly type: "split_band";
      readonly estimatedSplitSize: AbsoluteQuantity;
    }
  | {
      readonly type: "create_temporary_camp";
      readonly tileId: TileId;
    }
  | {
      readonly type: "create_seasonal_camp";
      readonly tileId: TileId;
    }
  | {
      readonly type: "intensify_place_use";
      readonly tileId: TileId;
    }
  | {
      readonly type: "experiment_with_storage";
      readonly tileId: TileId;
    }
  | {
      readonly type: "experiment_with_plant_tending";
      readonly tileId: TileId;
    }
  | {
      readonly type: "start_persistent_settlement";
      readonly tileId: TileId;
    }
  | {
      readonly type: "upgrade_settlement";
      readonly settlementId: SettlementId;
      readonly targetStage: SettlementStage;
    }
  | {
      readonly type: "downgrade_or_abandon_settlement";
      readonly settlementId: SettlementId;
      readonly targetStage: SettlementStage;
    }
  | {
      readonly type: "reoccupy_site";
      readonly settlementId: SettlementId;
    }
  | {
      readonly type: "found_daughter_settlement";
      readonly sourceSettlementId: SettlementId;
      readonly targetTileId: TileId;
    }
  | {
      readonly type: "send_seasonal_outpost";
      readonly sourceSettlementId: SettlementId;
      readonly targetTileId: TileId;
    }
  | {
      readonly type: "claim_influence";
      readonly sourceSettlementId: SettlementId;
      readonly targetTileIds: readonly TileId[];
      readonly commitmentLevel: ExpansionCommitmentLevel;
    }
  | {
      readonly type: "abandon_expansion_plan";
      readonly sourceSettlementId: SettlementId;
      readonly targetTileId: TileId;
    }
  | {
      readonly type: "avoid_state_integration";
      readonly polityId?: ProtoPolityId;
      readonly targetTileId?: TileId;
    }
  | {
      readonly type: "form_proto_polity";
      readonly coreSettlementId: SettlementId;
      readonly memberSettlementIds: readonly SettlementId[];
    }
  | {
      readonly type: "no_op";
    };

interface BaseReason<TType extends string> {
  readonly id: ReasonId;
  readonly type: TType;
  readonly strength: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly relatedTileIds: readonly TileId[];
  readonly relatedEventIds: readonly EventId[];
}

type DryMarginReasonType =
  | "water_refuge_profile_detected"
  | "permanent_refuge_water"
  | "seasonal_pool_available"
  | "ephemeral_water_opportunity"
  | "failed_water_memory"
  | "dry_refuge_pull"
  | "wet_season_dispersal_mode"
  | "green_season_harvest_mode"
  | "dry_season_consolidation_mode"
  | "late_dry_refuge_mode"
  | "drought_emergency_mode"
  | "river_corridor_prospect_detected"
  | "downstream_prospect_detected"
  | "upstream_prospect_detected"
  | "wadi_chain_prospect_detected"
  | "scout_before_relocation"
  | "logistical_probe_selected"
  | "logistical_probe_rejected_risk"
  | "logistical_probe_rejected_low_adults"
  | "stayed_due_to_known_refuge"
  | "relocation_threshold_met"
  | "relocation_rejected_uncertainty"
  | "relocation_rejected_social_risk"
  | "relocation_rejected_crossing_risk"
  | "current_refuge_security"
  | "loss_of_fallback_security"
  | "marginal_return_pressure"
  | "current_marginal_return_declined"
  | "known_place_still_secure"
  | "known_place_declining"
  | "attachment_reduced_by_depletion"
  | "attachment_reduced_by_drought"
  | "attachment_reduced_by_known_corridor_opportunity"
  | "social_access_risk_unknown"
  | "social_access_risk_known_contact";

interface DryMarginReasonPayload {
  readonly bandId?: BandId;
  readonly currentTileId?: TileId;
  readonly targetTileId?: TileId;
  readonly prospectTileIds?: readonly TileId[];
  readonly waterSourceKind?: string;
  readonly reliability?: number;
  readonly droughtRisk?: number;
  readonly seasonalMode?: string;
  readonly stayValue?: number;
  readonly scoutValue?: number;
  readonly moveValue?: number;
  readonly marginalReturn?: number;
  readonly departureThreshold?: number;
  readonly uncertainty?: number;
  readonly socialRisk?: number;
  readonly crossingRisk?: number;
  readonly travelCost?: number;
  readonly lossOfFallbackSecurity?: number;
  readonly basis?: readonly string[];
}

type AnchorReasonType =
  | "residential_anchor_created"
  | "residential_anchor_continued"
  | "anchored_refuge_mode"
  | "ordinary_foraging_base_mode"
  | "dispersed_wet_season_round_mode"
  | "stress_relocation_mode"
  | "water_tethered_foraging_radius"
  | "wet_season_tether_released"
  | "drought_tether_tightened"
  | "catchment_return_estimated"
  | "catchment_depletion_increased"
  | "anchor_water_security"
  | "dependency_load_increased_anchor_value"
  | "logistical_capacity_enabled_foray"
  | "stay_anchor_selected"
  | "logistical_foray_selected"
  | "residential_relocation_selected"
  | "relocation_hysteresis_blocked_move"
  | "anchor_marginal_return_declined"
  | "catchment_below_regional_alternative"
  | "anchor_trapped_no_watered_corridor"
  | "poor_but_safe_water_anchor"
  | "near_anchor_foraging"
  | "far_logistical_foray"
  | "scouting_probe_activity"
  | "anchor_abandoned_water_failure"
  | "anchor_abandoned_food_collapse"
  | "anchor_abandoned_better_refuge"
  | "anchor_memory_created"
  | "anchor_memory_revisited"
  | "successful_anchor_return"
  | "failed_anchor_memory_warned"
  | "seasonal_anchor_memory_used"
  | "pre_decision_anchor_context"
  | "post_decision_anchor_state";

interface AnchorReasonPayload {
  readonly bandId?: BandId;
  readonly anchorTileId?: TileId;
  readonly tetheringWaterTileId?: TileId;
  readonly season?: Season;
  readonly foragingRadius?: number;
  readonly catchmentTileCount?: number;
  readonly holdValue?: number;
  readonly forayValue?: number;
  readonly relocateValue?: number;
  readonly anchorMarginalReturn?: number;
  readonly bestKnownAlternativeNet?: number;
  readonly relocationHysteresis?: number;
  readonly anchorWaterSecurity?: number;
  readonly dependencyLoad?: number;
  readonly logisticalCapacity?: number;
  readonly catchmentReturnEstimate?: number;
  readonly catchmentDepletion?: number;
  readonly seasonsAnchored?: number;
  readonly anchorStatus?: string;
  readonly droughtResponse?: string;
  readonly residenceMode?: string;
  readonly nearAnchorForaging?: number;
  readonly farLogisticalForays?: number;
  readonly scoutingProbes?: number;
  readonly revisited?: boolean;
  readonly successfulHoldCount?: number;
  readonly failedHoldCount?: number;
  readonly anchoredSeasonCount?: number;
  readonly resumedSeasonsAnchored?: number;
  readonly drySeasonReliability?: number;
}

type CarryingCapacityReasonType =
  | "base_habitat_potential_derived"
  | "seasonal_effective_yield_updated"
  | "local_use_reduced_effective_yield"
  | "recovery_restored_effective_yield"
  | "population_demand_exceeded_yield"
  | "per_capita_return_declined"
  | "range_saturation_detected"
  | "over_capacity_pressure"
  | "high_rank_habitat_persisted"
  | "rich_core_still_viable"
  | "low_density_founder_attachment"
  | "known_unused_habitat_detected"
  | "known_unused_habitat_probe_recommended"
  | "known_unused_habitat_rejected_risk"
  | "known_unused_habitat_rejected_water"
  | "known_unused_habitat_rejected_low_confidence"
  | "daughter_colonization_pressure_increased"
  | "daughter_colonization_probe_selected"
  | "daughter_colonization_rejected_low_labor"
  | "daughter_colonization_rejected_parent_core_viable"
  | "dependency_load_raised_demand"
  | "labor_capacity_limited_exploitation"
  | "dependent_aged_to_adult"
  | "adult_aged_to_elder"
  | "elder_mortality"
  | "birth_added_dependent"
  // Shared catchment + yield-pipeline stabilization (checkpoint 2J.1).
  | "shared_catchment_pressure"
  | "private_catchment_no_overlap"
  | "daughter_pressure_from_shared_saturation"
  | "raw_support_surplus_hidden_by_clamp"
  | "raw_support_deficit_hidden_by_clamp"
  | "chronic_return_decline"
  | "return_trend_rising"
  | "one_bad_season_not_chronic"
  | "founder_sparse_range"
  | "exhausted_known_range"
  | "no_known_safe_alternative"
  | "attachment_overrides_low_return"
  | "water_refuge_overrides_low_return"
  | "anchor_recommendation_followed"
  | "movement_overrode_anchor_recommendation";

interface CarryingCapacityReasonPayload {
  readonly bandId?: BandId;
  readonly tileId?: TileId;
  readonly candidateTileIds?: readonly TileId[];
  readonly population?: number;
  readonly demand?: number;
  readonly labor?: number;
  readonly yield?: number;
  readonly perCapitaReturn?: number;
  readonly saturation?: number;
  readonly opportunityScore?: number;
  readonly daughterPressure?: number;
  readonly dependents?: number;
  readonly adults?: number;
  readonly elders?: number;
  readonly confidence?: number;
  readonly basis?: readonly string[];
}

type MobilityBasisReasonType =
  | "mobility_behavior_basis_derived"
  | "starting_profile_used_as_weak_prior"
  | "starting_profile_decayed"
  | "learned_experience_overrode_starting_profile"
  | "ecology_basis_selected_intent"
  | "memory_basis_selected_intent"
  | "biome_adaptation_basis_selected_intent"
  | "seasonal_round_basis_selected_intent"
  | "pressure_basis_selected_intent"
  | "river_ecology_supported_intent"
  | "coast_ecology_supported_intent"
  | "wetland_lake_ecology_supported_intent"
  | "dry_margin_ecology_supported_intent"
  | "highland_pass_ecology_supported_intent"
  | "frontier_pressure_supported_intent";

interface MobilityBasisReasonPayload {
  readonly bandId?: BandId;
  readonly intentKind?: string;
  readonly basisKinds?: readonly string[];
  readonly riverAffinity?: number;
  readonly coastAffinity?: number;
  readonly wetlandLakeAffinity?: number;
  readonly dryMarginAffinity?: number;
  readonly highlandPassAffinity?: number;
  readonly frontierAffinity?: number;
  readonly startingProfileWeight?: number;
  readonly learnedExperienceWeight?: number;
  readonly startingProfileOverridden?: boolean;
  readonly confidence?: number;
}

type SeasonalRoundReasonType =
  | "seasonal_round_memory_created"
  | "seasonal_round_memory_updated"
  | "dry_refuge_return_phase"
  | "late_dry_hold_phase"
  | "wet_dispersal_phase"
  | "green_harvest_phase"
  | "seasonal_round_pull"
  | "seasonal_round_followed"
  | "seasonal_round_blocked_passability"
  | "seasonal_round_blocked_water_failure"
  | "seasonal_round_abandoned_failure"
  | "remembered_dry_refuge_return"
  | "remembered_wet_range_used"
  | "seasonal_cycle_repeated"
  | "held_wet_dispersal"
  | "round_confidence_increased"
  | "round_confidence_decreased"
  | "round_catchment_rotation"
  | "wet_range_rotation_selected"
  | "green_harvest_rotation_selected"
  | "depleted_catchment_tile_avoided"
  | "recently_used_catchment_reduced"
  | "remembered_wet_range_rotated"
  | "dry_refuge_stickiness"
  | "remembered_refuge_return_pull"
  | "refuge_drift_penalty"
  | "refuge_drift_allowed_due_to_depletion"
  | "refuge_drift_allowed_due_to_risk"
  | "refuge_return_blocked_passability"
  | "remembered_refuge_still_viable";

interface SeasonalRoundReasonPayload {
  readonly bandId?: BandId;
  readonly roundId?: string;
  readonly phase?: string;
  readonly expectedNextPhase?: string;
  readonly season?: Season;
  readonly anchorTileId?: TileId;
  readonly tetheringWaterTileId?: TileId;
  readonly associatedTileIds?: readonly TileId[];
  readonly confidence?: number;
  readonly phaseConfidence?: number;
  readonly seasonalRoundPull?: number;
  readonly observedCycleCount?: number;
  readonly successCount?: number;
  readonly failureCount?: number;
  readonly outcome?: string;
  readonly roundBlockedReason?: string;
  readonly roundAbandonedReason?: string;
  readonly selectedCatchmentTileIds?: readonly TileId[];
  readonly rotationPressure?: number;
  readonly depletionAvoidance?: number;
  readonly dryRefugeStickiness?: number;
  readonly refugeReturnPull?: number;
  readonly refugeDriftPenalty?: number;
  readonly currentDistanceFromRememberedRefuge?: number;
}

export type Reason =
  | (BaseReason<"resource_abundance"> & {
      readonly expectedFood: number;
    })
  | (BaseReason<DryMarginReasonType> & DryMarginReasonPayload)
  | (BaseReason<AnchorReasonType> & AnchorReasonPayload)
  | (BaseReason<SeasonalRoundReasonType> & SeasonalRoundReasonPayload)
  | (BaseReason<MobilityBasisReasonType> & MobilityBasisReasonPayload)
  | (BaseReason<CarryingCapacityReasonType> & CarryingCapacityReasonPayload)
  | (BaseReason<"food_scarcity"> & {
      readonly deficit: number;
    })
  | (BaseReason<"seasonal_abundance"> & {
      readonly seasonality: number;
    })
  | (BaseReason<"aquatic_resource_stability"> & {
      readonly aquaticReliability: number;
    })
  | (BaseReason<"storage_extends_availability"> & {
      readonly storageBufferTicks: number;
    })
  | (BaseReason<"population_pressure"> & {
      readonly populationToCapacityRatio: number;
    })
  | (BaseReason<"group_too_large"> & {
      readonly estimatedSize: number;
    })
  | (BaseReason<"population_growth_pressure"> & {
      readonly parentBandId: BandId;
      readonly population: number;
      readonly comfortablePopulation: number;
      readonly pressure: number;
      readonly year: number;
      readonly season: Season;
    })
  | (BaseReason<"household_crowding"> & {
      readonly parentBandId: BandId;
      readonly householdCount: number;
      readonly comfortableHouseholds: number;
      readonly pressure: number;
    })
  | (BaseReason<"food_per_person_stress"> & {
      readonly parentBandId: BandId;
      readonly population: number;
      readonly stress: number;
      readonly currentTileId: TileId;
    })
  | (BaseReason<"sustained_local_pressure"> & {
      readonly parentBandId: BandId;
      readonly currentTileId: TileId;
      readonly pressure: number;
      readonly useCount: number;
    })
  | (BaseReason<"daughter_group_formed"> & {
      readonly parentBandId: BandId;
      readonly daughterBandId: BandId;
      readonly parentPopulationBefore: number;
      readonly daughterPopulation: number;
      readonly parentPopulationAfter: number;
      readonly originTileId: TileId;
      readonly targetTileId?: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"frontier_split"> & {
      readonly parentBandId: BandId;
      readonly daughterBandId?: BandId;
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly frontierValue: number;
      readonly confidence: number;
    })
  | (BaseReason<"river_corridor_split"> & {
      readonly parentBandId: BandId;
      readonly daughterBandId?: BandId;
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly riverId?: RiverId;
      readonly corridorValue: number;
      readonly confidence: number;
    })
  | (BaseReason<"coastal_split"> & {
      readonly parentBandId: BandId;
      readonly daughterBandId?: BandId;
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly aquaticValue: number;
      readonly confidence: number;
    })
  | (BaseReason<"crossing_enabled_split"> & {
      readonly parentBandId: BandId;
      readonly daughterBandId?: BandId;
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly riverId?: RiverId;
      readonly crossingKey: string;
      readonly knownCrossingConfidence: number;
    })
  | (BaseReason<"split_deferred_low_population"> & {
      readonly parentBandId: BandId;
      readonly population: number;
      readonly minimumPopulation: number;
    })
  | (BaseReason<"split_deferred_no_viable_frontier"> & {
      readonly parentBandId: BandId;
      readonly knownTileCount: number;
      readonly splitPressure: number;
    })
  | (BaseReason<"split_deferred_high_risk"> & {
      readonly parentBandId: BandId;
      readonly riskPressure: number;
      readonly mortalityPressure: number;
      readonly splitPressure: number;
    })
  | (BaseReason<"parent_band_retained_core"> & {
      readonly parentBandId: BandId;
      readonly populationAfter: number;
      readonly coreTileId: TileId;
      readonly attachmentPull: number;
    })
  | (BaseReason<"daughter_spawn_physical_perception"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly currentTileId: TileId;
      readonly physicallySeenTileCount: number;
      readonly inheritedKnownTileCount: number;
    })
  | (BaseReason<"physically_seen_neighbor"> & {
      readonly bandId: BandId;
      readonly originTileId: TileId;
      readonly tileId: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"physically_seen_but_not_experienced"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"inherited_memory_not_personal_experience"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"kin_safety_reduced_threat"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly kinSafety: number;
      readonly perceivedThreat: number;
    })
  | (BaseReason<"kin_core_crowding_detected"> & {
      readonly bandId: BandId;
      readonly parentBandId?: BandId;
      readonly tileId: TileId;
      readonly kinCoreCrowding: number;
    })
  | (BaseReason<"early_daughter_dispersal_urgency"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly urgency: number;
      readonly ageTicks: number;
    })
  | (BaseReason<"lineage_contact_memory_decayed"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly ageTicks: number;
      readonly remainingSafety: number;
    })
  | (BaseReason<"kin_overlap_socially_tolerated"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly tolerance: number;
    })
  | (BaseReason<"kin_overlap_ecologically_strained"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly tileId?: TileId;
      readonly kinCoreCrowding: number;
      readonly resourcePressure: number;
    })
  | (BaseReason<"band_became_fragile"> & {
      readonly bandId: BandId;
      readonly population: number;
      readonly minimumViablePopulation: number;
      readonly viabilityPressure: number;
    })
  | (BaseReason<"band_became_nonviable"> & {
      readonly bandId: BandId;
      readonly population: number;
      readonly minimumViablePopulation: number;
      readonly extinctionRisk: number;
    })
  | (BaseReason<"band_absorbed_by_parent"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly transferredPopulation: number;
      readonly absorptionOpportunity: number;
    })
  | (BaseReason<"band_absorbed_by_related_band"> & {
      readonly bandId: BandId;
      readonly absorbingBandId: BandId;
      readonly transferredPopulation: number;
      readonly absorptionOpportunity: number;
    })
  | (BaseReason<"band_extinct_low_population"> & {
      readonly bandId: BandId;
      readonly populationRemoved: number;
      readonly minimumViablePopulation: number;
      readonly extinctionRisk: number;
    })
  | (BaseReason<"band_extinct_sustained_stress"> & {
      readonly bandId: BandId;
      readonly populationRemoved: number;
      readonly foodStress: number;
      readonly waterStress: number;
      readonly extinctionRisk: number;
    })
  | (BaseReason<"band_survived_fragile_period"> & {
      readonly bandId: BandId;
      readonly population: number;
      readonly viabilityPressure: number;
    })
  | (BaseReason<"absorption_preferred_over_extinction"> & {
      readonly bandId: BandId;
      readonly absorbingBandId: BandId;
      readonly absorptionOpportunity: number;
      readonly extinctionRisk: number;
    })
  | (BaseReason<"inherited_partial_knowledge"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly inheritedKnownTileCount: number;
      readonly parentKnownTileCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"inherited_core_memory"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly inheritedMemoryCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"inherited_crossing_memory"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly inheritedCrossingCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"inherited_route_hint"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly inheritedCorridorHintCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"inherited_memory_low_confidence"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly averageInheritedConfidence: number;
      readonly confidence: number;
    })
  | (BaseReason<"daughter_did_not_inherit_full_parent_map"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly inheritedKnownTileCount: number;
      readonly parentKnownTileCount: number;
      readonly inheritedMemoryCount: number;
      readonly parentMemoryCount: number;
    })
  | (BaseReason<"daughter_dispersal_intent_created"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly expectedHorizonTicks: TickNumber;
      readonly pressure: number;
      readonly confidence: number;
    })
  | (BaseReason<"daughter_dispersal_intent_continued"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly targetTileId?: TileId;
      readonly pressure: number;
    })
  | (BaseReason<"daughter_dispersal_intent_completed"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly targetTileId?: TileId;
      readonly distanceFromParent: number;
    })
  | (BaseReason<"daughter_dispersal_intent_blocked"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly targetTileId?: TileId;
      readonly risk: number;
      readonly passability: number;
    })
  | (BaseReason<"daughter_left_parent_core"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly originTileId: TileId;
      readonly targetTileId: TileId;
      readonly parentCoreOverlap: number;
    })
  | (BaseReason<"daughter_returned_due_to_risk"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly risk: number;
    })
  | (BaseReason<"frontier_boundary_detected"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly unknownNeighborCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"corridor_frontier_pull"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly corridorKind: string;
      readonly pull: number;
      readonly confidence: number;
    })
  | (BaseReason<"known_frontier_edge_pull"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly pull: number;
      readonly confidence: number;
    })
  | (BaseReason<"safe_core_rejected_as_frontier"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly unknownNeighborCount: number;
      readonly corePull: number;
    })
  | (BaseReason<"frontier_selected_over_crowded_core"> & {
      readonly bandId: BandId;
      readonly currentTileId: TileId;
      readonly targetTileId: TileId;
      readonly saturationPressure: number;
      readonly crowdingPressure: number;
    })
  | (BaseReason<"exploration_baseline"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly baseline: number;
      readonly confidence: number;
    })
  | (BaseReason<"crowding_increased_exploration"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly nearbyBandPressure: number;
      readonly boost: number;
    })
  | (BaseReason<"saturation_increased_exploration"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly saturationPressure: number;
      readonly boost: number;
    })
  | (BaseReason<"daughter_dispersal_increased_exploration"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly boost: number;
    })
  | (BaseReason<"range_saturation_detected"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly localPopulationEstimate: number;
      readonly saturationPressure: number;
      readonly perCapitaReturnEstimate: number;
    })
  | (BaseReason<"per_capita_returns_declined"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly perCapitaReturnEstimate: number;
      readonly effectiveHabitatSuitability: number;
    })
  | (BaseReason<"crowded_core_reduced_suitability"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly nearbyBandPressure: number;
      readonly effectiveHabitatSuitability: number;
    })
  | (BaseReason<"frontier_dispersal_pressure"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly pressure: number;
      readonly bestFrontierTileId?: TileId;
      readonly preferredCorridor: string;
    })
  | (BaseReason<"marginal_habitat_became_viable"> & {
      readonly bandId: BandId;
      readonly tileId: TileId;
      readonly pressureRelief: number;
      readonly suitability: number;
    })
  | (BaseReason<"long_step_frontier_probe"> & {
      readonly bandId: BandId;
      readonly currentTileId: TileId;
      readonly targetTileId: TileId;
      readonly distance: number;
      readonly pressure: number;
    })
  | (BaseReason<"known_better_patch_pull"> & {
      readonly bandId: BandId;
      readonly currentTileId: TileId;
      readonly targetTileId: TileId;
      readonly opportunityStrength: number;
      readonly confidence: number;
    })
  | (BaseReason<"better_patch_probe_selected"> & {
      readonly bandId: BandId;
      readonly currentTileId: TileId;
      readonly targetTileId: TileId;
      readonly opportunityStrength: number;
    })
  | (BaseReason<"band_encounter_detected"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly tileId?: TileId;
      readonly relation: string;
      readonly tension: number;
    })
  | (BaseReason<"tolerated_kin_overlap"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly tolerance: number;
    })
  | (BaseReason<"tolerated_abundant_overlap"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly resourcePressure: number;
      readonly tolerance: number;
    })
  | (BaseReason<"shared_resource_use"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly tileId?: TileId;
      readonly tolerance: number;
    })
  | (BaseReason<"crowding_raised_tension"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly crowdingPressure: number;
      readonly tension: number;
    })
  | (BaseReason<"repeated_overlap_tension"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly contactCount: number;
      readonly tension: number;
    })
  | (BaseReason<"mutual_avoidance"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly tension: number;
    })
  | (BaseReason<"one_band_yielded"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly pressure: number;
    })
  | (BaseReason<"contact_memory_updated"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly contactCount: number;
      readonly tension: number;
      readonly familiarity: number;
    })
  | (BaseReason<"band_disposition_updated"> & {
      readonly bandId: BandId;
      readonly dominantMood: string;
      readonly cohesion: number;
      readonly fear: number;
      readonly anger: number;
      readonly caution: number;
    })
  | (BaseReason<"encounter_perception_updated"> & {
      readonly bandId: BandId;
      readonly otherBandId: BandId;
      readonly encounterId: string;
      readonly perceivedThreat: number;
      readonly perceivedKinshipSafety: number;
      readonly uncertainty: number;
    })
  | (BaseReason<"encounter_response_distribution"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly dominantResponse: string;
      readonly dissentLevel: number;
      readonly splitRisk: number;
    })
  | (BaseReason<"fearful_members_preferred_avoidance"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly fear: number;
      readonly responseShare: number;
    })
  | (BaseReason<"angry_members_preferred_confrontation"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly anger: number;
      readonly responseShare: number;
    })
  | (BaseReason<"cautious_members_preferred_observation"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly caution: number;
      readonly responseShare: number;
    })
  | (BaseReason<"hungry_members_raised_tension"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly hungerStress: number;
      readonly tension: number;
    })
  | (BaseReason<"cohesion_prevented_split"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly cohesion: number;
      readonly splitRisk: number;
    })
  | (BaseReason<"low_cohesion_raised_split_risk"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly cohesion: number;
      readonly splitRisk: number;
    })
  | (BaseReason<"temporary_separation_pressure"> & {
      readonly bandId: BandId;
      readonly encounterId?: string;
      readonly estimatedSeparatedShare: number;
      readonly reuniteIntent: number;
      readonly cause: string;
    })
  | (BaseReason<"minority_response_created_internal_tension"> & {
      readonly bandId: BandId;
      readonly encounterId: string;
      readonly dissentLevel: number;
      readonly splitRisk: number;
    })
  | (BaseReason<"nearby_band_crowding"> & {
      readonly bandId: BandId;
      readonly nearbyBandIds: readonly BandId[];
      readonly tileId: TileId;
      readonly weightedCrowding: number;
      readonly confidence: number;
    })
  | (BaseReason<"parent_core_overlap"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly overlap: number;
      readonly pressure: number;
    })
  | (BaseReason<"daughter_dispersal_pressure"> & {
      readonly bandId: BandId;
      readonly parentBandId?: BandId;
      readonly tileId: TileId;
      readonly pressure: number;
      readonly parentCoreOverlap: number;
      readonly chosenTargetTileId?: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"inherited_familiarity_pull"> & {
      readonly bandId: BandId;
      readonly parentBandId?: BandId;
      readonly tileId: TileId;
      readonly pull: number;
      readonly confidence: number;
    })
  | (BaseReason<"safe_frontier_pull"> & {
      readonly bandId: BandId;
      readonly parentBandId?: BandId;
      readonly tileId: TileId;
      readonly pull: number;
      readonly chosenTargetTileId?: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"crowding_reduced_local_suitability"> & {
      readonly bandId: BandId;
      readonly nearbyBandIds: readonly BandId[];
      readonly tileId: TileId;
      readonly weightedCrowding: number;
      readonly crowdingPenalty: number;
      readonly localSuitability: number;
      readonly confidence: number;
    })
  | (BaseReason<"split_group_sought_new_range"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly chosenTargetTileId: TileId;
      readonly pressure: number;
      readonly safeFrontierPull: number;
      readonly confidence: number;
    })
  | (BaseReason<"overlap_tolerated_low_pressure"> & {
      readonly bandId: BandId;
      readonly parentBandId: BandId;
      readonly tileId: TileId;
      readonly overlap: number;
      readonly pressure: number;
      readonly kinTolerance: number;
      readonly confidence: number;
    })
  | (BaseReason<"movement_cost_exceeds_benefit"> & {
      readonly movementCost: number;
      readonly expectedBenefit: number;
    })
  | (BaseReason<"known_route_has_better_expected_value"> & {
      readonly routeValue: number;
    })
  | (BaseReason<"unexplored_neighbor_has_exploration_value"> & {
      readonly explorationValue: number;
    })
  | (BaseReason<"repeated_seasonal_return"> & {
      readonly returnCount: number;
    })
  | (BaseReason<"place_attachment"> & {
      readonly attachmentValue: number;
    })
  | (BaseReason<"repeated_return"> & {
      readonly tileId: TileId;
      readonly returnCount: number;
      readonly lastReturnAt?: WorldTime;
    })
  | (BaseReason<"remembered_good_place"> & {
      readonly tileId: TileId;
      readonly visitCount: number;
      readonly attachment: number;
      readonly confidence: number;
    })
  | (BaseReason<"remembered_risky_place"> & {
      readonly tileId: TileId;
      readonly riskEstimate: number;
      readonly confidence: number;
    })
  | (BaseReason<"familiar_corridor"> & {
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly useCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"avoided_remembered_bad_place"> & {
      readonly tileId: TileId;
      readonly riskEstimate: number;
      readonly confidence: number;
    })
  | (BaseReason<"local_resource_pressure"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly previousPressure: number;
      readonly currentPressure: number;
      readonly useCount: number;
      readonly season: Season;
    })
  | (BaseReason<"food_stress"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly stress: number;
      readonly confidence: number;
      readonly season: Season;
    })
  | (BaseReason<"water_stress"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly stress: number;
      readonly confidence: number;
      readonly season: Season;
    })
  | (BaseReason<"mobility_pressure"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly pressure: number;
      readonly foodStress: number;
      readonly waterStress: number;
      readonly confidence: number;
    })
  | (BaseReason<"repeated_use_depletion"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly pressure: number;
      readonly useCount: number;
      readonly confidence: number;
    })
  | (BaseReason<"recovery_opportunity"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly recoveryBenefit: number;
      readonly sourceMemoryTileId?: TileId;
      readonly confidence: number;
    })
  | (BaseReason<"attachment_resisted_movement"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly attachmentPull: number;
      readonly netMovePressure: number;
      readonly confidence: number;
    })
  | (BaseReason<"pressure_overcame_attachment"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly pressure: number;
      readonly attachmentPull: number;
      readonly confidence: number;
    })
  | (BaseReason<"low_pressure_stay"> & {
      readonly tileId: TileId;
      readonly bandId: BandId;
      readonly netMovePressure: number;
      readonly attachmentPull: number;
      readonly confidence: number;
    })
  | (BaseReason<"river_crossing_cost"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingClass: RiverCrossingClass;
      readonly season: Season;
      readonly crossingCost: number;
      readonly crossingRisk: number;
      readonly bandCapability: string;
      readonly intentKind?: MobilityIntentKind;
    })
  | (BaseReason<"river_crossing_blocked"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingClass: RiverCrossingClass;
      readonly season: Season;
      readonly crossingCost: number;
      readonly crossingRisk: number;
      readonly bandCapability: string;
      readonly intentKind?: MobilityIntentKind;
    })
  | (BaseReason<"used_known_ford"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingClass: RiverCrossingClass;
      readonly useCount: number;
      readonly seasonalReliability: number;
    })
  | (BaseReason<"discovered_ford"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingClass: RiverCrossingClass;
      readonly season: Season;
      readonly confidence: number;
    })
  | (BaseReason<"avoided_deep_channel"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingClass: RiverCrossingClass;
      readonly crossingRisk: number;
      readonly bandCapability: string;
    })
  | (BaseReason<"followed_river_corridor"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly intentKind?: MobilityIntentKind;
      readonly continuity: number;
    })
  | (BaseReason<"flood_season_crossing_risk"> & {
      readonly riverId: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingClass: RiverCrossingClass;
      readonly season: Season;
      readonly crossingRisk: number;
    })
  | (BaseReason<"riverbank_continuity"> & {
      readonly riverId?: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly continuity: number;
    })
  | (BaseReason<"estuary_resource_pull"> & {
      readonly riverId?: RiverId;
      readonly tileId: TileId;
      readonly aquaticValue: number;
      readonly movementPenalty: number;
    })
  | (BaseReason<"marsh_channel_slowdown"> & {
      readonly riverId?: RiverId;
      readonly fromTileId: TileId;
      readonly toTileId: TileId;
      readonly crossingCost: number;
      readonly crossingRisk: number;
    })
  | (BaseReason<"confluence_attractor"> & {
      readonly tileId: TileId;
      readonly waterValue: number;
      readonly aquaticValue: number;
      readonly confidence: number;
    })
  | (BaseReason<"seasonal_stream_opportunity"> & {
      readonly riverId?: RiverId;
      readonly tileId: TileId;
      readonly season: Season;
      readonly fordability: number;
      readonly confidence: number;
    })
  | (BaseReason<"plant_tending_success"> & {
      readonly yieldImprovement: number;
    })
  | (BaseReason<"settlement_momentum"> & {
      readonly investmentValue: number;
    })
  | (BaseReason<"territorial_pressure"> & {
      readonly pressure: number;
    })
  | (BaseReason<"environmental_risk"> & {
      readonly riskSeverity: number;
    })
  | (BaseReason<"insufficient_known_tiles"> & {
      readonly knownTileCount: number;
    })
  | (BaseReason<"low_confidence_memory"> & {
      readonly memoryConfidence: number;
    })
  | (BaseReason<"social_cohesion_risk"> & {
      readonly cohesionRisk: number;
    })
  | (BaseReason<"no_expansion_comfortable"> & {
      readonly comfortMargin: number;
    })
  | (BaseReason<"known_site_sufficient"> & {
      readonly currentTileId: TileId;
      readonly currentValue: number;
      readonly pressure: number;
    })
  | (BaseReason<"low_mobility_pressure"> & {
      readonly currentTileId: TileId;
      readonly pressure: number;
    })
  | (BaseReason<"seasonal_stability"> & {
      readonly currentTileId: TileId;
      readonly currentValue: number;
      readonly seasonality: number;
    })
  | (BaseReason<"intent_continuation"> & {
      readonly intentKind: MobilityIntentKind;
      readonly currentTileId: TileId;
      readonly targetTileId?: TileId;
      readonly directionVector?: Coord;
    })
  | (BaseReason<"corridor_following"> & {
      readonly intentKind: MobilityIntentKind;
      readonly currentTileId: TileId;
      readonly targetTileId?: TileId;
      readonly directionVector?: Coord;
    })
  | (BaseReason<"frontier_probe"> & {
      readonly intentKind: MobilityIntentKind;
      readonly currentTileId: TileId;
      readonly targetTileId?: TileId;
      readonly frontierValue: number;
      readonly directionVector?: Coord;
      // M0.8-A: marks a reason produced specifically by the M0.8 bounded CORRIDOR
      // RELOCATION candidate (`buildCorridorRelocationCandidate`), so it is distinguishable
      // from the PRE-EXISTING mobility-intent frontier_probe moves (`createCorridorCandidate`
      // / `createExpandKnownWorldCandidate`) which also use this reason type. Audits/cadence
      // logic key on this so M0.8 relocation volume is measured/governed in isolation.
      readonly isCorridorRelocation?: true;
      // M0.16B: marks a reason produced by the off-corridor SIDE-COUNTRY probe
      // (`buildSideCountryProbeCandidate`) — a residence-UNCHANGED logistical_probe, so it
      // is distinguishable from the M0.7 inferred-frontier probe and the M0.8 corridor
      // relocation. The applied-decision detector + audit key on this to advance the
      // side-probe cadence governor and count side-probe wins in isolation.
      readonly isSideCountryProbe?: true;
      // 2K.6B / INFO-1: marks a resource_scout produced by the PROACTIVE information motive
      // (a stable, spare-labor band learning an under-known nearby resource/side-country
      // patch before desperation). Residence-unchanged; the applied-decision detector + audit
      // key on this to advance the proactive-info cadence governor and count the actions.
      readonly isProactiveInfo?: true;
    })
  | (BaseReason<"adaptive_response_selected"> & {
      readonly bandId: BandId;
      readonly ideaId: string;
      readonly responseId: string;
      readonly family: string;
      readonly responseType: string;
      readonly expectedBenefit: string;
      readonly risk: string;
      readonly behaviorEffectScope: string;
      readonly scoreDelta: number;
      readonly basis: readonly string[];
    })
  | (BaseReason<"camp_movement_response_selected"> & {
      readonly bandId: BandId;
      readonly scale: string;
      readonly status: string;
      readonly expectedBenefit: string;
      readonly risk: string;
      readonly behaviorEffectScope: string;
      readonly scoreDelta: number;
      readonly basis: readonly string[];
      readonly targetTileId?: TileId;
    })
  | (BaseReason<"return_to_known_good_area"> & {
      readonly currentTileId: TileId;
      readonly targetTileId: TileId;
      readonly currentValue: number;
      readonly targetValue: number;
    })
  | (BaseReason<"risk_avoidance"> & {
      readonly currentTileId: TileId;
      readonly targetTileId?: TileId;
      readonly riskSeverity: number;
      readonly pressure: number;
    })
  | (BaseReason<"seek_better_water"> & {
      readonly currentTileId: TileId;
      readonly targetTileId?: TileId;
      readonly currentValue: number;
      readonly targetValue?: number;
      readonly pressure: number;
    })
  | (BaseReason<"known_better_site"> & {
      readonly expectedValueDelta: number;
    })
  | (BaseReason<"climate_push"> & {
      readonly climateStress: number;
    })
  | (BaseReason<"administrative_overreach"> & {
      readonly reachCost: number;
    })
  | (BaseReason<"biome_mismatch"> & {
      readonly affinityGap: number;
    })
  | (BaseReason<"tax_burden_exceeded"> & {
      readonly burden: number;
    })
  | (BaseReason<"forced_labor_pressure"> & {
      readonly laborDemand: number;
    })
  | (BaseReason<"disease_in_dense_settlement"> & {
      readonly diseaseRisk: number;
    })
  | (BaseReason<"mobility_freedom_lost"> & {
      readonly mobilityLoss: number;
    })
  | (BaseReason<"ritual_coercion_pressure"> & {
      readonly coercionPressure: number;
    })
  | (BaseReason<"harvest_failure_blamed_on_center"> & {
      readonly blamePressure: number;
    });

export interface MobilityIntent {
  readonly kind: MobilityIntentKind;
  readonly createdAt: WorldTime;
  readonly expectedHorizonTicks: TickNumber;
  readonly targetTileId?: TileId;
  readonly targetRegionId?: RegionId;
  readonly directionVector?: Coord;
  readonly reason: Reason;
  readonly confidence: NormalizedIntensity;
  readonly persistence: NormalizedIntensity;
}

export interface ScoreBreakdown {
  readonly foodValue: number;
  readonly waterValue: number;
  readonly waterRefugeSecurity: number;
  readonly dryRefugePull: number;
  readonly aquaticValue: number;
  readonly movementCost: number;
  readonly riskCost: number;
  readonly memoryConfidence: number;
  readonly routeValue: number;
  readonly attachmentValue: number;
  readonly populationPressure: number;
  readonly storageValue: number;
  readonly explorationValue: number;
  readonly socialCost: number;
  readonly expectedFutureValue: number;
  readonly intentAlignment: number;
  readonly movementInertia: number;
  readonly reversalPenalty: number;
  readonly frontierProbeValue: number;
  readonly localSurvivalValue: number;
  readonly placeAttachment: number;
  readonly rememberedReliability: number;
  readonly rememberedRisk: number;
  readonly familiarCorridor: number;
  readonly returnPlacePull: number;
  readonly foodStress: number;
  readonly waterStress: number;
  readonly localUsePressure: number;
  readonly mobilityPressure: number;
  readonly placeAttachmentPull: number;
  readonly netMovePressure: number;
  readonly recoveryBenefit: number;
  readonly depletionPenalty: number;
  readonly riverCrossingCost: number;
  readonly riverCrossingRisk: number;
  readonly riverCorridorValue: number;
  readonly knownFordValue: number;
  readonly blockedCrossingPenalty: number;
  readonly nearbyBandPressure: number;
  readonly parentCoreOverlap: number;
  readonly daughterDispersalPressure: number;
  readonly inheritedFamiliarityPull: number;
  readonly safeFrontierPull: number;
  readonly crowdingPenalty: number;
  readonly biomeCompetence: number;
  readonly biomeMismatchPenalty: number;
  readonly rangeSaturation: number;
  readonly perCapitaReturn: number;
  readonly frontierDispersalPressure: number;
  readonly knownOpportunityPull: number;
  readonly explorationBaseline: number;
  readonly crowdingExploreBoost: number;
  readonly saturationExploreBoost: number;
  readonly daughterDispersalExploreBoost: number;
  readonly explorationRiskPenalty: number;
  readonly encounterTension: number;
  readonly encounterTolerance: number;
  readonly splitRisk: number;
  readonly scoutValue: number;
  readonly moveValue: number;
  readonly currentMarginalReturn: number;
  readonly expectedNextReturn: number;
  readonly lossOfFallbackSecurity: number;
  readonly riverProspectStrength: number;
  readonly socialAccessRisk: number;
  readonly logisticalProbeValue: number;
}

export interface AlternativeConsidered {
  readonly action: Action;
  readonly score: number;
  readonly scoreBreakdown: ScoreBreakdown;
  readonly rejectionReason?: Reason;
  // M0.8-B (archive metadata only — never read by scoring, so determinism is unaffected):
  // true when this alternative was the M0.8 corridor-relocation opt-in candidate, so an
  // audit can count how often the relocation was OFFERED (not just when it WON). Lets the
  // lake audit emit the offered count the review noted was previously not surfaced.
  readonly isCorridorRelocation?: boolean;
  // M0.16B (archive metadata only — never read by scoring): true when this alternative was
  // the off-corridor side-country probe opt-in, so an audit can count how often a side probe
  // was OFFERED/eligible (not only when it WON).
  readonly isSideCountryProbe?: boolean;
}

export interface DecisionContextSnapshot {
  readonly time: WorldTime;
  readonly currentTileId?: TileId;
  readonly currentSettlementId?: SettlementId;
  readonly knownTileCount: number;
  readonly knownSettlementCount: number;
  readonly populationEstimate: number;
  readonly hungerPressure: number;
  readonly territorialPressure: number;
  readonly expansionPressure?: ExpansionPressure;
}

export interface Decision {
  readonly id: DecisionId;
  readonly bandId?: BandId;
  readonly settlementId?: SettlementId;
  readonly polityId?: ProtoPolityId;
  readonly time: WorldTime;
  readonly action: Action;
  readonly primaryReason: Reason;
  readonly secondaryReasons: readonly Reason[];
  readonly alternativesConsidered: readonly AlternativeConsidered[];
  // M0.8: a STABLE count of the CORE survival candidates the band weighed this decision
  // (stay/move/explore/probe/scout), EXCLUDING opt-in helper candidates (M0.7 inferred-
  // frontier probe, M0.8 corridor relocation). Band-known confidence that scales with
  // "how many options I weighed" must use THIS, not `alternativesConsidered.length`, so
  // that merely offering an extra opt-in candidate (winning or not) cannot perturb it.
  readonly coreDeliberationBreadth: number;
  readonly contextSnapshot: DecisionContextSnapshot;
  readonly mobilityIntent?: MobilityIntent;
  readonly intentStatus: MobilityIntentStatus;
  readonly createdEventIds?: readonly EventId[];
}

export interface DecisionArchiveSummary {
  readonly totalDecisions: number;
  readonly totalStayDecisions: number;
  readonly totalMoveDecisions: number;
  readonly totalExploreDecisions: number;
  readonly totalNoOpDecisions: number;
  readonly totalProbeDecisions: number;
  readonly totalResourceScoutDecisions: number;
  readonly totalFrontierMoves: number;
  readonly recentDecisionLimit: number;
  readonly recentDecisionIds: readonly DecisionId[];
}
