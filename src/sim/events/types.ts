import type {
  BandId,
  DecisionId,
  EventId,
  ProtoPolityId,
  RouteId,
  SettlementId,
  TileId,
  WorldTime,
} from "../core/types";

export type EventSeverity = "trace" | "info" | "warning" | "critical";

export type SimEventType =
  | "world_initialized"
  | "tile_observed"
  | "environmental_stress_observed"
  | "resource_depletion_observed"
  | "route_updated"
  | "band_moved"
  | "band_stayed"
  | "camp_created"
  | "settlement_started"
  | "settlement_upgraded"
  | "settlement_abandoned"
  | "site_reoccupied"
  | "proto_polity_formed";

export interface EventLogEntry {
  readonly eventId: EventId;
  readonly time: WorldTime;
  readonly type: SimEventType;
  readonly severity: EventSeverity;
  readonly summary: string;
}

interface BaseSimEvent<TType extends SimEventType> {
  readonly id: EventId;
  readonly type: TType;
  readonly time: WorldTime;
  readonly severity: EventSeverity;
  readonly involvedBandIds: readonly BandId[];
  readonly involvedTileIds: readonly TileId[];
  readonly involvedSettlementIds: readonly SettlementId[];
  readonly involvedRouteIds?: readonly RouteId[];
  readonly involvedProtoPolityIds?: readonly ProtoPolityId[];
  readonly decisionId?: DecisionId;
  readonly causalChainIds?: readonly EventId[];
  readonly summary: string;
}

export type WorldInitializedEvent = BaseSimEvent<"world_initialized">;
export type TileObservedEvent = BaseSimEvent<"tile_observed">;
export type EnvironmentalStressObservedEvent =
  BaseSimEvent<"environmental_stress_observed">;
export type ResourceDepletionObservedEvent =
  BaseSimEvent<"resource_depletion_observed">;
export type RouteUpdatedEvent = BaseSimEvent<"route_updated">;
export type BandMovedEvent = BaseSimEvent<"band_moved">;
export type BandStayedEvent = BaseSimEvent<"band_stayed">;
export type CampCreatedEvent = BaseSimEvent<"camp_created">;
export type SettlementStartedEvent = BaseSimEvent<"settlement_started">;
export type SettlementUpgradedEvent = BaseSimEvent<"settlement_upgraded">;
export type SettlementAbandonedEvent = BaseSimEvent<"settlement_abandoned">;
export type SiteReoccupiedEvent = BaseSimEvent<"site_reoccupied">;
export type ProtoPolityFormedEvent = BaseSimEvent<"proto_polity_formed">;

export type SimEvent =
  | WorldInitializedEvent
  | TileObservedEvent
  | EnvironmentalStressObservedEvent
  | ResourceDepletionObservedEvent
  | RouteUpdatedEvent
  | BandMovedEvent
  | BandStayedEvent
  | CampCreatedEvent
  | SettlementStartedEvent
  | SettlementUpgradedEvent
  | SettlementAbandonedEvent
  | SiteReoccupiedEvent
  | ProtoPolityFormedEvent;
