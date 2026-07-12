import type { ReasonId, TickNumber } from "../core/types";
import type { Band, HumanFoodSupportLedger, PhysicalFoodHarvestRecord } from "./types";

const RECEIPT_CAP = 16;

// Harvest-unit → adult-equivalent-support conversion (checkpoint ECO-TROPHIC-1).
//
// WHY: activity receipts (`PhysicalFoodHarvestRecord.usableSupport`) are measured
// in PHYSICAL harvest units — a fraction of ONE patch's / stock's seasonal
// availability drawn on one trip (per-trip request is capped at ~0.5, see
// intraSeasonTrips `deriveResourceReturnRecord`). `populationDemand`
// (`adultEquivalentDemand` in carryingCapacity) is measured in ADULT-EQUIVALENT
// persons (~20-33 for a normal band). Phase-A correctly wired the real receipts
// into the ledger but never reconciled the two unit systems, so the raw sum of a
// season's usable harvest (~0.1-0.8) was compared against a demand of ~25 — a
// ~100x mismatch that pinned the ledger's own rawSupportRatio at ~0.006 and
// foodStress/deficitRatio at ~1.0 from season 0, i.e. the ledger reported a
// permanent maximal deficit even though the physical ecology was healthy
// (measured: 260 fauna stocks + 157 plant patches at mean depletion 0.13).
// carryingCapacity's perCapitaReturn (= clamp01(totalUsableSupport / demand))
// therefore read ~0.006 — a garbage signal for every consumer of the ledger.
//
// This constant is the EXPLICIT, physically-framed bridge: how many
// adult-equivalent-seasons of food one whole unit of drawn patch/stock seasonal
// availability represents once carried home and processed. It multiplies REAL
// receipts only — absence still yields exactly 0 usable support (a season with no
// physical harvest still reads support 0 / ratio 0 / stress 1), depletion,
// seasonality and transport/processing losses still reduce it proportionally, and
// it cannot manufacture calories from nothing. It is surfaced on the ledger
// (`harvestToSupportScale`, `rawUsableHarvest`) so Technical shows the conversion
// rather than hiding it. The value is calibrated so a band running a good season
// of successful food trips in a healthy catchment approaches — but does not
// trivially exceed — its demand, leaving lean seasons and depleted/absent
// catchments in real deficit.
//
// LIVING-ECOLOGY-1B closes the consumer chain: bounded history derived from this
// ledger alone now drives current food pressure and the explicit food terms in
// demography. The conversion remains visible and parameterized so causal audits
// test 80/100/120 sensitivity without creating support from zero.
export const HARVEST_TO_SUPPORT_SCALE = 100;
export const HUMAN_FOOD_SUPPORT_UNIT = "adult_equivalent_season" as const;

// Canonical human food ledger. It deliberately consumes activity receipts only:
// habitat yield, resource-class decomposition, memories, inventions, and visible
// nature cards cannot add calories here. Storage/residual hooks remain explicit
// zeros until backed by their own physical stocks.
export function deriveHumanFoodSupportLedger(
  band: Band,
  populationDemand: number,
  harvestToSupportScale = HARVEST_TO_SUPPORT_SCALE,
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

  const rawUsableHarvest = totalUsableSupport;
  const conversionScale = Math.max(0, harvestToSupportScale);
  const supportFromHarvest = rawUsableHarvest * conversionScale;
  const demand = Math.max(1, populationDemand);
  const rawSupportRatio = supportFromHarvest / demand;
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
    rawUsableHarvest: round4(rawUsableHarvest),
    harvestToSupportScale: conversionScale,
    supportUnit: HUMAN_FOOD_SUPPORT_UNIT,
    supportUnitContract: "one raw usable harvest unit equals the declared scale of adult-equivalent seasonal food after recorded losses",
    totalUsableSupport: round4(supportFromHarvest),
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
