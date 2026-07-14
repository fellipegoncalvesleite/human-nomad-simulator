/*
 * UI-STYLE-1 — pure player-facing summaries derived from existing Band fields.
 * PURE UI: imports TYPES only from src/sim, performs no sim computation, never
 * mutates sim state. Every field read is guarded with a safe default so a
 * freshly-spawned or partially-evaluated band never throws.
 */
import type { Band } from "../sim/agents/types";
import type { TickNumber } from "../sim/core/types";
import { classifyMovementContext, deriveFamiliarCountry, type MovementContext } from "../sim/agents/familiarCountry";
import type { IconName } from "./icons";
import { intentLabel, viabilityLabel } from "./labels";

export type StatusTone =
  | "settled"
  | "exploring"
  | "moving"
  | "pressure"
  | "struggling"
  | "gone";

export interface BandStatusSummary {
  readonly label: string;
  readonly tone: StatusTone;
  readonly icon: IconName;
}

const EXPLORE_INTENTS = new Set<string>([
  "expand_known_world",
  "seek_new_range",
  "frontier_dispersal",
  "daughter_range_expansion",
  "probe_wetland_or_lake",
  "probe_coast",
]);

const MOVE_INTENTS = new Set<string>([
  "follow_river_corridor",
  "seek_better_water",
  "cross_pass",
  "return_to_known_good_area",
  "avoid_risk",
]);

const TONE_ICON: Readonly<Record<StatusTone, IconName>> = {
  settled: "settle",
  exploring: "scout",
  moving: "move",
  pressure: "risk",
  struggling: "risk",
  gone: "status",
};

export function deriveBandStatus(band: Band): BandStatusSummary {
  const viabilityStatus = band.viability?.status;
  const extinctionRisk = band.viability?.extinctionRisk ?? 0;
  const foodStress = band.pressureState?.foodStress ?? 0;
  const waterStress = band.pressureState?.waterStress ?? 0;
  const netMovePressure = band.pressureState?.netMovePressure ?? 0;
  const intentKind = band.currentIntent?.kind;
  const movedRecently = (band.recentResidentialMoveEvents?.length ?? 0) > 0;

  const tone = ((): StatusTone => {
    if (viabilityStatus === "absorbed" || viabilityStatus === "extinct" || band.status === "dispersed") {
      return "gone";
    }
    if (
      viabilityStatus === "nonviable" ||
      extinctionRisk > 0.5 ||
      foodStress > 0.6 ||
      waterStress > 0.6 ||
      band.status === "stressed"
    ) {
      return "struggling";
    }
    if (band.status === "moving" || band.status === "splitting" || movedRecently) {
      return "moving";
    }
    if (intentKind !== undefined && EXPLORE_INTENTS.has(intentKind)) {
      return "exploring";
    }
    if (intentKind !== undefined && MOVE_INTENTS.has(intentKind)) {
      return "moving";
    }
    if (netMovePressure > 0.5) {
      return "pressure";
    }
    return "settled";
  })();

  const label = ((): string => {
    switch (tone) {
      case "gone":
        return viabilityLabel(viabilityStatus ?? "dispersed");
      case "struggling":
        return "Struggling";
      case "moving":
        return "On the move";
      case "exploring":
        return "Exploring";
      case "pressure":
        return "Under pressure";
      case "settled":
      default:
        return "Settled";
    }
  })();

  return { label, tone, icon: TONE_ICON[tone] };
}

// RANGE-1: a band moving INSIDE its familiar country should not read as generic migration.
// The in-range contexts are re-toned calm (settled/exploring); only leaving/founding keep the
// "moving" tone. Derived read-only from the band's own memory — no sim mutation.
const RANGE_CONTEXT_STATUS: Readonly<Record<MovementContext, BandStatusSummary | undefined>> = {
  within_known_range: { label: "Living within known range", tone: "settled", icon: "settle" },
  local_camp_shift: { label: "Near a known camp", tone: "settled", icon: "camp" },
  working_known_water: { label: "At known water", tone: "settled", icon: "water" },
  seasonal_round: { label: "Following a seasonal route", tone: "settled", icon: "route" },
  range_edge_probe: { label: "Testing the edge", tone: "exploring", icon: "scout" },
  leaving_familiar_country: { label: "Leaving familiar country", tone: "moving", icon: "move" },
  founding_new_range: { label: "Founding new country", tone: "moving", icon: "founding" },
  unsettled_no_range: undefined,
};

/**
 * RANGE-1 range-aware status. Refines ONLY the movement/exploration tones with the band's
 * familiar-country movement context; condition labels (struggling/pressure/settled/gone) are
 * never overridden. Pure: reads the band's own memory, mutates nothing.
 */
export function deriveBandStatusWithRange(band: Band, currentTick: TickNumber): BandStatusSummary {
  const base = deriveBandStatus(band);
  if (base.tone !== "moving" && base.tone !== "exploring") {
    return base;
  }
  const range = deriveFamiliarCountry(band, currentTick);
  if (!range.hasMeaningfulRange) {
    return base;
  }
  const mapped = RANGE_CONTEXT_STATUS[classifyMovementContext(band, range, currentTick)];
  return mapped ?? base;
}

const INTENT_DOING: Readonly<Record<string, string>> = {
  local_foraging: "Foraging near camp",
  follow_river_corridor: "Following the river",
  probe_wetland_or_lake: "Scouting the wetlands",
  probe_coast: "Scouting the coast",
  seek_better_water: "Searching for better water",
  avoid_risk: "Steering clear of danger",
  cross_pass: "Crossing the highland pass",
  return_to_known_good_area: "Heading back to good ground",
  expand_known_world: "Venturing beyond the known world",
  seek_new_range: "Searching for a better place",
  frontier_dispersal: "Pushing into the frontier",
  daughter_range_expansion: "Establishing a daughter range",
};

const STATUS_DOING: Readonly<Record<string, string>> = {
  foraging: "Foraging",
  camped: "Camped for now",
  moving: "On the move",
  splitting: "Splitting into a new band",
  settled: "Settled in place",
  stressed: "Struggling to get by",
  dispersed: "No longer together",
};

export function deriveDoingNow(band: Band): string {
  if (band.viability?.status === "extinct") {
    return "Extinct — archival record";
  }
  if (band.viability?.status === "absorbed" || band.status === "dispersed") {
    return "No longer an active band";
  }
  const intentKind = band.currentIntent?.kind;

  if (intentKind !== undefined && INTENT_DOING[intentKind] !== undefined) {
    return INTENT_DOING[intentKind];
  }

  return STATUS_DOING[band.status] ?? intentLabel(intentKind);
}

export interface Condition {
  readonly foodLabel: string;
  readonly waterLabel: string;
  readonly crowdingLabel: string;
  readonly viabilityLabel: string;
  readonly bars: {
    readonly food: number;
    readonly water: number;
    readonly safety: number;
  };
}

function tier(value: number, labels: readonly [string, string, string, string]): string {
  if (value < 0.25) {
    return labels[0];
  }
  if (value < 0.5) {
    return labels[1];
  }
  if (value < 0.75) {
    return labels[2];
  }
  return labels[3];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function deriveCondition(band: Band): Condition {
  if (band.viability?.status === "extinct") {
    return {
      foodLabel: "Final value archived",
      waterLabel: "Final value archived",
      crowdingLabel: "Final value archived",
      viabilityLabel: "Died out",
      bars: { food: 0, water: 0, safety: 0 },
    };
  }
  const foodStress = clamp01(band.pressureState?.foodStress ?? 0);
  const waterStress = clamp01(band.pressureState?.waterStress ?? 0);
  const crowding = clamp01(band.demography?.householdCrowdingPressure ?? 0);
  const extinctionRisk = clamp01(band.viability?.extinctionRisk ?? 0);

  return {
    foodLabel: tier(foodStress, ["Well fed", "Getting by", "Hungry", "Starving"]),
    waterLabel: tier(waterStress, ["Water secure", "Some water", "Short on water", "Dangerously dry"]),
    crowdingLabel: tier(crowding, ["Room to spread", "Comfortable", "Getting crowded", "Crowded"]),
    viabilityLabel: viabilityLabel(band.viability?.status ?? "viable"),
    bars: {
      food: 1 - foodStress,
      water: 1 - waterStress,
      safety: 1 - extinctionRisk,
    },
  };
}

export interface SkillChip {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly tip: string;
}

const SUBSISTENCE_SKILL: Readonly<Record<string, { label: string; icon: IconName; tip: string }>> = {
  foraging: { label: "Foraging", icon: "gathering", tip: "Gathers wild plants and small animals" },
  aquatic: { label: "Fishing & shellfish", icon: "fishing", tip: "Fishes and harvests aquatic foods" },
  wild_grain_collection: { label: "Wild grain", icon: "food", tip: "Collects wild cereals" },
  plant_tending: { label: "Plant tending", icon: "season", tip: "Tends useful wild plants" },
  early_agriculture: { label: "Early farming", icon: "food", tip: "Experiments with cultivation" },
  irrigated_agriculture_experiment: {
    label: "Irrigated farming",
    icon: "water",
    tip: "Experiments with watering crops",
  },
};

const TECH_SKILL: Readonly<Record<string, { label: string; icon: IconName; tip: string }>> = {
  basic_foraging: { label: "Basic foraging", icon: "gathering", tip: "Knows how to gather wild food" },
  fishing: { label: "Fishing", icon: "fishing", tip: "Learned to fish" },
  improved_fishing: { label: "Improved fishing", icon: "fishing", tip: "Refined fishing techniques" },
  plant_tending: { label: "Plant tending", icon: "season", tip: "Learned to tend plants" },
  basic_storage: { label: "Food storage", icon: "storage", tip: "Learned to store food" },
  ceramic_storage: { label: "Ceramic storage", icon: "storage", tip: "Stores food in pottery" },
  drying_smoking: { label: "Drying & smoking", icon: "storage", tip: "Preserves food by drying and smoking" },
  basketry: { label: "Basketry", icon: "basketry", tip: "Learned to weave baskets" },
  irrigation_experiment: { label: "Irrigation", icon: "water", tip: "Experiments with irrigation" },
  terrace_experiment: { label: "Terracing", icon: "craft", tip: "Experiments with terraced land" },
};

export function groupSkills(band: Band): {
  readonly subsistence: readonly SkillChip[];
  readonly crafts: readonly SkillChip[];
} {
  const subsistence = band.subsistenceModes.map((mode): SkillChip => {
    const entry = SUBSISTENCE_SKILL[mode];

    return {
      id: mode,
      label: entry?.label ?? mode,
      icon: entry?.icon ?? "activity",
      tip: entry?.tip ?? "",
    };
  });

  const staticCrafts = band.technologies
    .filter((tech) => tech !== "basic_storage" && tech !== "ceramic_storage")
    .map((tech): SkillChip => {
    const entry = TECH_SKILL[tech];

    return {
      id: tech,
      label: entry?.label ?? tech,
      icon: entry?.icon ?? "craft",
      tip: entry?.tip ?? "",
    };
    });
  const learnedStorage = (band.practicalAdaptation?.responses ?? [])
    .filter((response) => response.family === "water_storage" && response.status !== "abandoned" && response.status !== "dormant")
    .map((response): SkillChip => ({
      id: response.id,
      label: response.publicLabel,
      icon: "storage",
      tip: `${response.status}; leakage and carrying burden remain context dependent`,
    }));
  const crafts = [...learnedStorage, ...staticCrafts];

  return { subsistence, crafts };
}
