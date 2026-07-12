// World ecology summary (checkpoint SIM-TOOLS-1).
//
// A bounded, deterministic, PURE summary of the world's TRUTH-level fauna/aquatic
// stocks + plant patch state, for the UI's WORLD DEBUG ecology view. It is a tiny
// aggregate (a few dozen numbers), so it can ride the dynamic snapshot cheaply.
//
// ANTI-OMNISCIENCE NOTE: this is WORLD TRUTH and is intended ONLY for the
// explicitly-labelled debug/editor ecology view. The normal selected-band ecology
// view is derived UI-side from the band's OWN knowledge (patch memories), never
// from this summary. This function never mutates the world and never feeds any
// band decision (it is computed at snapshot time for display only).

import { deriveFaunaStockGeography, getFaunaStockDynamic } from "./faunaStock";
import { summarizePlantPatchState } from "./plantStock";
import type { WorldState } from "../world/types";

export type EcologyCategory = "rich" | "decent" | "poor" | "depleted" | "recovering";
export type EcologyPressureLevel = "low" | "medium" | "high";

export interface StockCategorySummary {
  readonly total: number;
  readonly rich: number;
  readonly decent: number;
  readonly poor: number;
  readonly depleted: number;
  readonly recovering: number;
  readonly meanAbundance: number;
  readonly overused: number; // abundance < 0.7
  readonly disturbed: number; // disturbance > 0.3
}

export interface PlantCategorySummary {
  readonly dynamicRecords: number;
  readonly overharvested: number; // depletion > 0.3
  readonly heavilyOverharvested: number; // depletion > 0.55
  readonly recovering: number; // tracked but only lightly depleted
  readonly meanDepletion: number;
}

export interface WorldEcologySummary {
  readonly fauna: StockCategorySummary;
  readonly aquatic: StockCategorySummary;
  readonly plant: PlantCategorySummary;
  readonly pressure: EcologyPressureLevel;
  readonly faunaRoutines: {
    readonly phases: Readonly<Record<string, number>>;
    readonly managedStocks: number;
    readonly meanWariness: number;
    readonly meanHabituation: number;
    readonly meanReproductiveCondition: number;
  };
  readonly debugTruthOnly: true;
}

function categorize(abundance: number, disturbance: number): EcologyCategory {
  if (abundance >= 0.85) {
    return "rich";
  }

  if (abundance >= 0.6) {
    return "decent";
  }

  // Below decent: a quiet (undisturbed) thinned stock reads as recovering; a
  // disturbed thinned stock reads as poor/depleted.
  if (disturbance < 0.15) {
    return "recovering";
  }

  return abundance >= 0.4 ? "poor" : "depleted";
}

export function summarizeWorldEcology(world: WorldState): WorldEcologySummary {
  const geo = deriveFaunaStockGeography(world);
  // Local mutable accumulators (the readonly summary is built at the end).
  const faunaAcc = { total: 0, rich: 0, decent: 0, poor: 0, depleted: 0, recovering: 0, abundanceSum: 0, overused: 0, disturbed: 0 };
  const aquaticAcc = { total: 0, rich: 0, decent: 0, poor: 0, depleted: 0, recovering: 0, abundanceSum: 0, overused: 0, disturbed: 0 };
  const routinePhases: Record<string, number> = {};
  let managedStocks = 0;
  let warinessSum = 0;
  let habituationSum = 0;
  let reproductiveConditionSum = 0;

  for (const stock of geo.stocks) {
    const dyn = getFaunaStockDynamic(world, stock.id);
    const routinePhase = dyn.routinePhase ?? "uninitialized";
    routinePhases[routinePhase] = (routinePhases[routinePhase] ?? 0) + 1;
    if ((dyn.managementStress ?? 0) > 0 || (dyn.campProximity ?? 0) > 0) managedStocks += 1;
    warinessSum += dyn.humanWariness ?? 0;
    habituationSum += dyn.habituation ?? 0;
    reproductiveConditionSum += dyn.reproductiveCondition ?? 1;
    const acc = stock.faunaClass === "aquatic_food" ? aquaticAcc : faunaAcc;
    acc.total += 1;
    acc.abundanceSum += dyn.abundance;

    if (dyn.abundance < 0.7) {
      acc.overused += 1;
    }

    if (dyn.disturbance > 0.3) {
      acc.disturbed += 1;
    }

    switch (categorize(dyn.abundance, dyn.disturbance)) {
      case "rich": acc.rich += 1; break;
      case "decent": acc.decent += 1; break;
      case "poor": acc.poor += 1; break;
      case "depleted": acc.depleted += 1; break;
      case "recovering": acc.recovering += 1; break;
    }
  }

  const plantState = summarizePlantPatchState(world);
  const plant: PlantCategorySummary = {
    dynamicRecords: plantState.dynamicRecords,
    overharvested: plantState.overharvestedPatches,
    heavilyOverharvested: plantState.heavilyOverharvestedPatches,
    recovering: Math.max(0, plantState.dynamicRecords - plantState.overharvestedPatches),
    meanDepletion: plantState.meanDepletion,
  };

  return {
    fauna: finalizeStock(faunaAcc),
    aquatic: finalizeStock(aquaticAcc),
    plant,
    pressure: derivePressure(faunaAcc, aquaticAcc, plantState.overharvestedPatches),
    faunaRoutines: {
      phases: routinePhases,
      managedStocks,
      meanWariness: geo.stocks.length === 0 ? 0 : round3(warinessSum / geo.stocks.length),
      meanHabituation: geo.stocks.length === 0 ? 0 : round3(habituationSum / geo.stocks.length),
      meanReproductiveCondition: geo.stocks.length === 0 ? 1 : round3(reproductiveConditionSum / geo.stocks.length),
    },
    debugTruthOnly: true,
  };
}

function finalizeStock(acc: {
  total: number; rich: number; decent: number; poor: number; depleted: number; recovering: number;
  abundanceSum: number; overused: number; disturbed: number;
}): StockCategorySummary {
  return {
    total: acc.total,
    rich: acc.rich,
    decent: acc.decent,
    poor: acc.poor,
    depleted: acc.depleted,
    recovering: acc.recovering,
    meanAbundance: acc.total === 0 ? 1 : round3(acc.abundanceSum / acc.total),
    overused: acc.overused,
    disturbed: acc.disturbed,
  };
}

function derivePressure(
  faunaAcc: { total: number; overused: number },
  aquaticAcc: { total: number; overused: number },
  plantOverharvested: number,
): EcologyPressureLevel {
  const faunaTotal = faunaAcc.total + aquaticAcc.total;
  const faunaOverusedShare = faunaTotal === 0 ? 0 : (faunaAcc.overused + aquaticAcc.overused) / faunaTotal;
  const plantSignal = plantOverharvested;

  if (faunaOverusedShare > 0.25 || plantSignal > 180) {
    return "high";
  }

  if (faunaOverusedShare > 0.1 || plantSignal > 60) {
    return "medium";
  }

  return "low";
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
