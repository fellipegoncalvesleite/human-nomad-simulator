import type {
  BandId,
  DecisionId,
  SettlementId,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import type { SimEvent } from "../events/types";

export interface TickOptions {
  readonly dryRun?: boolean;
  readonly maxEvents?: number;
  readonly planningHorizonTicks?: TickNumber;
  readonly triggeredByDecisionId?: DecisionId;
}

export interface TickResult {
  readonly previousTime: WorldTime;
  readonly nextTime: WorldTime;
  readonly events: readonly SimEvent[];
  readonly updatedTileIds: readonly TileId[];
  readonly updatedBandIds: readonly BandId[];
  readonly updatedSettlementIds: readonly SettlementId[];
}
