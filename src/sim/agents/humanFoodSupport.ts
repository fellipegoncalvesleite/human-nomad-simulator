import type { ReasonId, TickNumber } from "../core/types";
import type { Band, HumanFoodSupportLedger, PhysicalFoodHarvestRecord } from "./types";

const RECEIPT_CAP = 16;

// Canonical human food ledger. It deliberately consumes activity receipts only:
// habitat yield, resource-class decomposition, memories, inventions, and visible
// nature cards cannot add calories here. Storage/residual hooks remain explicit
// zeros until backed by their own physical stocks.
export function deriveHumanFoodSupportLedger(
  band: Band,
  populationDemand: number,
): HumanFoodSupportLedger {
  const trips = (band.recentIntraSeasonTrips ?? []).filter((trip) => trip.physicalFoodHarvest !== undefined);
  const sourceSeasonTick = trips.length === 0
    ? undefined
    : trips.reduce((latest, trip) => Math.max(latest, Number(trip.tick)), Number(trips[0].tick)) as TickNumber;
  const allReceipts = sourceSeasonTick === undefined
    ? []
    : trips
        .filter((trip) => Number(trip.tick) === Number(sourceSeasonTick))
        .map((trip) => trip.physicalFoodHarvest)
        .filter((receipt): receipt is PhysicalFoodHarvestRecord => receipt !== undefined)
        .sort(compareReceipts);
  const receipts = allReceipts.slice(0, RECEIPT_CAP);

  let physicalPlantHarvest = 0;
  let physicalFaunaHarvest = 0;
  let aquaticHarvest = 0;
  let transportLoss = 0;
  let processingLoss = 0;
  let totalUsableSupport = 0;

  for (const receipt of allReceipts) {
    if (receipt.sourceKind === "plant_patch") {
      physicalPlantHarvest += receipt.harvestedAmount;
    } else if (receipt.sourceKind === "fauna_stock") {
      physicalFaunaHarvest += receipt.harvestedAmount;
    } else {
      aquaticHarvest += receipt.harvestedAmount;
    }
    transportLoss += receipt.transportLoss;
    processingLoss += receipt.processingLoss;
    totalUsableSupport += receipt.usableSupport;
  }

  const demand = Math.max(1, populationDemand);
  const rawSupportRatio = totalUsableSupport / demand;
  const foodStress = clamp01(1 - rawSupportRatio);
  const reasonIds: ReasonId[] = [
    `reason:human-food-ledger:${band.id}:${sourceSeasonTick === undefined ? "none" : Number(sourceSeasonTick)}` as ReasonId,
  ];

  return {
    physicalPlantHarvest: round4(physicalPlantHarvest),
    physicalFaunaHarvest: round4(physicalFaunaHarvest),
    aquaticHarvest: round4(aquaticHarvest),
    storageContribution: 0,
    transitionalResidual: 0,
    grossPhysicalHarvest: round4(physicalPlantHarvest + physicalFaunaHarvest + aquaticHarvest),
    transportLoss: round4(transportLoss),
    processingLoss: round4(processingLoss),
    spoilageLoss: 0,
    accessLoss: 0,
    totalUsableSupport: round4(totalUsableSupport),
    populationDemand: round4(demand),
    rawSupportRatio: round4(rawSupportRatio),
    foodStress: round4(foodStress),
    sourceReceipts: receipts,
    ...(sourceSeasonTick === undefined ? {} : { sourceSeasonTick }),
    genericCatchmentFoodConsumed: false,
    residualRemovalPath: "none",
    reasonIds,
  };
}

function compareReceipts(left: PhysicalFoodHarvestRecord, right: PhysicalFoodHarvestRecord): number {
  const usableDelta = right.usableSupport - left.usableSupport;
  if (usableDelta !== 0) return usableDelta;
  const sourceDelta = left.sourceKind.localeCompare(right.sourceKind);
  if (sourceDelta !== 0) return sourceDelta;
  return String(left.sourceId ?? "").localeCompare(String(right.sourceId ?? ""));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
