import type {
  BandId,
  DecisionId,
  EventId,
  ProtoPolityId,
  ReasonId,
  SettlementId,
  TileId,
  WorldTime,
} from "../core/types";
import type { Reason } from "../rules/types";
import type { NormalizedIntensity } from "../settlements/types";

export type ChronicleMode =
  | "real_history"
  | "cultural_memory"
  | "mythic_history"
  | "later_historian";

export type NarrativeLayer =
  | "simulation_fact"
  | "inferred_motivation"
  | "cultural_memory"
  | "mythic_interpretation"
  | "historian_speculation"
  | "lost_or_fragmentary_record";

export type NarrativeEdgeKind =
  | "caused_by"
  | "motivated_by"
  | "remembered_as"
  | "mythologized_as"
  | "inferred_from"
  | "contradicts"
  | "descended_from"
  | "located_at"
  | "led_to"
  | "preserved_by"
  | "lost_through";

export interface ChronicleSource {
  readonly mode: ChronicleMode;
  readonly eventIds: readonly EventId[];
  readonly decisionIds: readonly DecisionId[];
  readonly reasonIds?: readonly ReasonId[];
  readonly involvedTileIds: readonly TileId[];
  readonly involvedBandIds: readonly BandId[];
  readonly involvedSettlementIds: readonly SettlementId[];
  readonly involvedPolityIds: readonly ProtoPolityId[];
}

export interface InterpretationClaim {
  readonly layer: NarrativeLayer;
  readonly confidence: NormalizedIntensity;
  readonly linkedReasons: readonly Reason[];
  readonly source: ChronicleSource;
}

export interface NarrativeNode {
  readonly id: EventId;
  readonly layer: NarrativeLayer;
  readonly time?: WorldTime;
  readonly source: ChronicleSource;
  readonly interpretationClaims: readonly InterpretationClaim[];
}

export interface NarrativeEdge {
  readonly kind: NarrativeEdgeKind;
  readonly fromNodeId: EventId;
  readonly toNodeId: EventId;
  readonly layer: NarrativeLayer;
  readonly source: ChronicleSource;
  readonly confidence: NormalizedIntensity;
}
