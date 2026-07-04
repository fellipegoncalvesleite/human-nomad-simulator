import type {
  BandId,
  DecisionId,
  EventId,
  RegionId,
  RouteId,
  SettlementId,
  TileId,
} from "../core/types";
import type { Reason } from "../rules/types";
import type {
  AbsoluteQuantity,
  ExpansionCommitmentLevel,
  NormalizedIntensity,
  SettlementStage,
} from "../settlements/types";
import type { TechnologyTag } from "../agents/types";

export type SocialScale =
  | "mobile_band"
  | "seasonal_band"
  | "settled_group"
  | "hamlet_cluster"
  | "village_polity"
  | "proto_polity"
  | "complex_polity";

export interface ModelActivationThreshold {
  readonly minimumScale: SocialScale;
  readonly minimumPopulation?: AbsoluteQuantity;
  readonly requiredSettlementStage?: SettlementStage;
  readonly requiredTechnologies?: readonly TechnologyTag[];
  readonly requiredAdministrativeReach?: NormalizedIntensity;
  readonly notes?: string;
}

export type CausalModelFamily =
  | "social_form_alternation"
  | "floodplain_adaptation"
  | "corridor_expansion"
  | "state_avoidance"
  | "complexity_cost"
  | "secular_pressure_cycle"
  | "passive_cultural_diffusion";

export interface CausalModelProfile {
  readonly family: CausalModelFamily;
  readonly activationThreshold: ModelActivationThreshold;
  readonly applicableScales: readonly SocialScale[];
  readonly relatedSettlementIds: readonly SettlementId[];
  readonly relatedRegionIds: readonly RegionId[];
  readonly enabled: boolean;
}

export interface ComplexityCostProfile {
  readonly administrativeCost: NormalizedIntensity;
  readonly coordinationCost: NormalizedIntensity;
  readonly maintenanceCost: NormalizedIntensity;
  readonly informationCost: NormalizedIntensity;
  readonly legitimacyCost: NormalizedIntensity;
  readonly marginalReturnOnComplexity: NormalizedIntensity;
}

export type ComplexityStressReason =
  | {
      readonly type: "complexity_cost_exceeds_return";
      readonly costProfile: ComplexityCostProfile;
      readonly relatedSettlementIds: readonly SettlementId[];
    }
  | {
      readonly type: "administrative_overextension";
      readonly administrativeReach: NormalizedIntensity;
      readonly relatedRegionIds: readonly RegionId[];
    }
  | {
      readonly type: "legitimacy_failure";
      readonly legitimacyCost: NormalizedIntensity;
      readonly relatedEventIds: readonly EventId[];
    }
  | {
      readonly type: "maintenance_failure";
      readonly maintenanceCost: NormalizedIntensity;
      readonly affectedTileIds: readonly TileId[];
    };

export type StateAvoidanceCauseType =
  | "tax_burden_exceeded"
  | "forced_labor_pressure"
  | "disease_in_dense_settlement"
  | "mobility_freedom_lost"
  | "ritual_coercion_pressure"
  | "harvest_failure_blamed_on_center";

export interface StateAvoidanceCause {
  readonly type: StateAvoidanceCauseType;
  readonly intensity: NormalizedIntensity;
  readonly relatedDecisionIds: readonly DecisionId[];
  readonly relatedEventIds: readonly EventId[];
}

export interface StateAvoidanceProfile {
  readonly taxBurden: NormalizedIntensity;
  readonly laborBurden: NormalizedIntensity;
  readonly diseaseBurden: NormalizedIntensity;
  readonly coercionRisk: NormalizedIntensity;
  readonly mobilityFreedomValue: NormalizedIntensity;
  readonly escapeAttraction: NormalizedIntensity;
  readonly causes: readonly StateAvoidanceCause[];
}

export type ExpansionPressureUpdate =
  | {
      readonly type: "daughter_founded_successfully";
      readonly sourceSettlementId: SettlementId;
      readonly daughterSettlementId: SettlementId;
      readonly releasedDemographicPressure: NormalizedIntensity;
      readonly addedLegitimacyStress: NormalizedIntensity;
    }
  | {
      readonly type: "expansion_failed";
      readonly sourceSettlementId: SettlementId;
      readonly targetTileId: TileId;
      readonly addedLegitimacyStress: NormalizedIntensity;
      readonly addedEliteCompetition: NormalizedIntensity;
    }
  | {
      readonly type: "fugitive_outflow";
      readonly sourceSettlementId: SettlementId;
      readonly targetTileId?: TileId;
      readonly releasedDemographicPressure: NormalizedIntensity;
      readonly addedLegitimacyStress: NormalizedIntensity;
    }
  | {
      readonly type: "outpost_abandoned";
      readonly sourceSettlementId: SettlementId;
      readonly outpostTileId: TileId;
      readonly returnedDemographicPressure: NormalizedIntensity;
      readonly addedFailureMemory: NormalizedIntensity;
    }
  | {
      readonly type: "route_discovered";
      readonly routeId: RouteId;
      readonly loweredMovementPressure: NormalizedIntensity;
      readonly addedExpansionOpportunity: NormalizedIntensity;
    }
  | {
      readonly type: "fertile_site_confirmed";
      readonly tileId: TileId;
      readonly loweredFoodStress: NormalizedIntensity;
      readonly addedExpansionOpportunity: NormalizedIntensity;
    }
  | {
      readonly type: "environmental_push_intensified";
      readonly affectedRegionId: RegionId;
      readonly addedFoodStress: NormalizedIntensity;
      readonly addedEnvironmentalStress: NormalizedIntensity;
    };

export type SocialFormMode =
  | "mobile_band"
  | "seasonal_aggregation"
  | "ritual_gathering"
  | "temporary_hierarchy"
  | "settled_village"
  | "proto_polity";

export interface SeasonalSocialFormPattern {
  readonly seasonIndex: 0 | 1 | 2 | 3;
  readonly expectedModes: readonly SocialFormMode[];
}

export interface SocialFormCycle {
  readonly activeModes: readonly SocialFormMode[];
  readonly seasonalPattern: readonly SeasonalSocialFormPattern[];
  readonly switchingReasons: readonly Reason[];
  readonly stability: NormalizedIntensity;
}

export type ExpansionCorridorKind =
  | "river"
  | "coast"
  | "sea_lane"
  | "valley"
  | "steppe"
  | "mountain_pass";

export interface ExpansionCorridor {
  readonly kind: ExpansionCorridorKind;
  readonly connectedTileIds?: readonly TileId[];
  readonly routeId?: RouteId;
  readonly movementCostMultiplier: NormalizedIntensity;
  readonly navigationKnowledgeRequired: NormalizedIntensity;
  readonly failureRisk: NormalizedIntensity;
  readonly seasonalReliability: NormalizedIntensity;
  readonly supportedCommitmentLevels: readonly ExpansionCommitmentLevel[];
}

export interface FloodplainAdaptationProfile {
  readonly moundBuildingSkill: NormalizedIntensity;
  readonly seasonalFloodKnowledge: NormalizedIntensity;
  readonly aquaticResourceReliability: NormalizedIntensity;
  readonly raisedSettlementValue: NormalizedIntensity;
  readonly wetlandAgriculturePotential: NormalizedIntensity;
  readonly floodRiskReduction: NormalizedIntensity;
}

export interface StagedCausalModelSnapshot {
  readonly scale: SocialScale;
  readonly modelProfiles: readonly CausalModelProfile[];
  readonly complexityCost?: ComplexityCostProfile;
  readonly complexityStressReasons: readonly ComplexityStressReason[];
  readonly stateAvoidance?: StateAvoidanceProfile;
  readonly socialFormCycle?: SocialFormCycle;
  readonly expansionCorridors: readonly ExpansionCorridor[];
  readonly floodplainAdaptation?: FloodplainAdaptationProfile;
  readonly involvedBandIds: readonly BandId[];
}
