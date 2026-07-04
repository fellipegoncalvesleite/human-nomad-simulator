import type {
  BandId,
  Brand,
  RouteId,
  SettlementId,
  WorldTime,
} from "../core/types";
import type { NormalizedIntensity } from "../settlements/types";

export type CulturalTraitId = Brand<string, "CulturalTraitId">;
export type DiffusionFlowId = Brand<string, "DiffusionFlowId">;

export type DiffusionVector =
  | "marriage"
  | "trade_route"
  | "refugees"
  | "imitation"
  | "seasonal_gathering"
  | "shared_ritual"
  | "gradual_migration";

export interface CulturalDiffusionFlow {
  readonly id: DiffusionFlowId;
  readonly traitId: CulturalTraitId;
  readonly sourceGroupId?: BandId;
  readonly sourceSettlementId?: SettlementId;
  readonly targetGroupId?: BandId;
  readonly targetSettlementId?: SettlementId;
  readonly routeId?: RouteId;
  readonly strength: NormalizedIntensity;
  readonly confidence: NormalizedIntensity;
  readonly vector: DiffusionVector;
  readonly startTime: WorldTime;
  readonly lastUpdatedAt: WorldTime;
}
