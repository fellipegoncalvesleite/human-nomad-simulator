import type {
  BandId,
  DecisionId,
  EventId,
  ProtoPolityId,
  RegionId,
  RouteId,
  SettlementId,
  TileId,
  WorldTime,
} from "../core/types";
import type { BiomeKind } from "../world/types";

export type NormalizedIntensity = number; // Abstract intensity: 0..1.
export type AbsoluteQuantity = number; // Concrete quantity: absolute units.

export type SettlementStage =
  | "temporary_camp"
  | "seasonal_camp"
  | "persistent_camp"
  | "hamlet"
  | "village"
  | "proto_urban_center"
  | "abandoned_site"
  | "reoccupied_site";

export type SettlementTransitionKind =
  | "growth"
  | "shrinkage"
  | "abandonment"
  | "reoccupation";

export interface SettlementTransition {
  readonly kind: SettlementTransitionKind;
  readonly fromStage: SettlementStage;
  readonly toStage: SettlementStage;
  readonly time: WorldTime;
  readonly decisionId?: DecisionId;
  readonly eventId?: EventId;
}

export interface Settlement {
  readonly id: SettlementId;
  readonly name?: string;
  readonly tileId: TileId;
  readonly stage: SettlementStage;
  readonly foundedAt: WorldTime;
  readonly lastOccupiedAt: WorldTime;
  readonly abandonedAt?: WorldTime;
  readonly foundingBandIds: readonly BandId[];
  readonly residentBandIds: readonly BandId[];
  readonly populationEstimate: AbsoluteQuantity;
  readonly storedFoodEstimate: AbsoluteQuantity;
  readonly placeClaimStrength: NormalizedIntensity;
  readonly transitionHistory: readonly SettlementTransition[];
}

export type PolityFormationReason =
  | {
      readonly type: "voluntary_coalition";
      readonly settlements: readonly SettlementId[];
      readonly sharedRisk: NormalizedIntensity;
      readonly mutualBenefit: NormalizedIntensity;
    }
  | {
      readonly type: "coercive_dominance";
      readonly dominantSettlementId: SettlementId;
      readonly subjugatedSettlementIds: readonly SettlementId[];
      readonly dominancePressure: NormalizedIntensity;
      readonly resistanceRisk: NormalizedIntensity;
    }
  | {
      readonly type: "circumscription_pressure";
      readonly boundedRegionId: RegionId;
      readonly constrainedMobility: NormalizedIntensity;
      readonly competitionForLand: NormalizedIntensity;
    }
  | {
      readonly type: "ritual_centrality";
      readonly centralSettlementId: SettlementId;
      readonly centralPlaceAttachment: NormalizedIntensity;
      readonly gatheringFrequency: NormalizedIntensity;
    }
  | {
      readonly type: "trade_hub_emergence";
      readonly hubSettlementId: SettlementId;
      readonly controlledRoutes: readonly RouteId[];
      readonly routeConvergence: NormalizedIntensity;
      readonly exchangeDependence: NormalizedIntensity;
    }
  | {
      readonly type: "daughter_settlement_network";
      readonly parentSettlementId: SettlementId;
      readonly daughterSettlementIds: readonly SettlementId[];
      readonly kinshipContinuity: NormalizedIntensity;
      readonly foodBaseCoordination: NormalizedIntensity;
    };

export interface ProtoPolity {
  readonly id: ProtoPolityId;
  readonly coreSettlementId: SettlementId;
  readonly memberSettlements: readonly SettlementId[];
  readonly claimedTiles: readonly TileId[];
  readonly influenceTiles: readonly TileId[];
  readonly coreReach: NormalizedIntensity;
  readonly foodBaseSummary: string;
  readonly formationReason: PolityFormationReason;
}

export type ExpansionCommitmentLevel =
  | "scouting"
  | "seasonal_outpost"
  | "daughter_group"
  | "permanent_settlement"
  | "influence_claim"
  | "administrative_integration";

export interface ExpansionOutcomeFeedback {
  readonly sourceEventId?: EventId;
  readonly outcome: "successful" | "failed" | "abandoned" | "reabsorbed";
  readonly pressureDelta: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly observedAt: WorldTime;
}

export interface ExpansionPressure {
  readonly demographicPressure: NormalizedIntensity;
  readonly foodStress: NormalizedIntensity;
  readonly eliteCompetition: NormalizedIntensity;
  readonly legitimacyStress: NormalizedIntensity;
  readonly environmentalStress: NormalizedIntensity;
  readonly outcomeFeedback: readonly ExpansionOutcomeFeedback[];
  readonly total: NormalizedIntensity;
}

export type ExpansionOutcome =
  | "ongoing"
  | "successful"
  | "failed"
  | "abandoned"
  | "reabsorbed";

export type ExpansionFailureReason =
  | {
      readonly type: "food_shortfall";
      readonly severity: number;
    }
  | {
      readonly type: "biome_mismatch";
      readonly expectedAffinity: number;
      readonly observedAffinity: number;
    }
  | {
      readonly type: "excessive_distance";
      readonly movementCost: number;
    }
  | {
      readonly type: "social_reabsorption";
      readonly cohesionPull: number;
    }
  | {
      readonly type: "environmental_shock";
      readonly riskSeverity: number;
    };

export interface BiomeAffinityDelta {
  readonly biomeKind: BiomeKind;
  readonly delta: number;
  readonly confidence: number;
}

export interface ExpansionAttempt {
  readonly sourceSettlementId: SettlementId;
  readonly targetTileId: TileId;
  readonly commitmentLevel: ExpansionCommitmentLevel;
  readonly startTime: WorldTime;
  readonly outcome?: ExpansionOutcome;
  readonly failureReason?: ExpansionFailureReason;
  readonly learnedBiomeAffinityDelta?: readonly BiomeAffinityDelta[];
}
