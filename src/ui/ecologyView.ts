// Ecology inspection view helpers (checkpoint SIM-TOOLS-1).
//
// PURE UI helpers, TYPE-ONLY sim imports (the bandSummary.ts / labels.ts pattern):
// they never call sim functions and never mutate sim state.
//
// Two strictly-separated modes:
//   * SELECTED-BAND view (`deriveSelectedBandEcology`) — derived ONLY from the
//     band's OWN remembered patch knowledge. It can NEVER reveal a stock/patch the
//     band has not discovered (anti-omniscience by construction: it reads only
//     `band.resourceKnowledgeState.patchMemories`). A bucket with no memories reads
//     "unknown".
//   * WORLD-DEBUG view (`formatWorldEcology`) — formats the sim-computed world TRUTH
//     aggregate (`WorldEcologySummary`) for the explicitly-labelled debug view.
//
// These two never mix: the band view does not read the truth summary, and the debug
// view does not read band memory.

import type { Band } from "../sim/agents/types";
import type { ResourcePatchMemory } from "../sim/agents/resourceKnowledge";
import type { EcologyCategory, WorldEcologySummary } from "../sim/agents/ecologySummary";

export type KnownEcologyCategory = EcologyCategory | "unknown";

export interface KnownEcologyBucket {
  readonly category: KnownEcologyCategory;
  readonly knownPlaces: number;
  readonly reliable: number;
  readonly declining: number;
  readonly depletedOrAvoided: number;
  readonly recovering: number;
  readonly note: string;
}

export interface SelectedBandEcology {
  readonly wildlife: KnownEcologyBucket;
  readonly aquatic: KnownEcologyBucket;
  readonly plants: KnownEcologyBucket;
  // Guard flag: this view is derived purely from the band's own knowledge.
  readonly fromBandKnowledgeOnly: true;
}

const WILDLIFE_CLASSES = new Set(["animal_food"]);
const AQUATIC_CLASSES = new Set(["aquatic_food"]);
const PLANT_CLASSES = new Set(["generic_plant_food", "fallback_food"]);

function stateScore(memory: ResourcePatchMemory): number {
  switch (memory.state) {
    case "reliable": return 1;
    case "used": return 0.72;
    case "observed": return 0.52;
    case "suspected": return 0.34;
    case "seasonally_bad": return 0.28;
    case "risky": return 0.22;
    case "depleted": return 0.14;
    default: return 0.4;
  }
}

function trendDelta(memory: ResourcePatchMemory): number {
  switch (memory.useHistory?.yieldTrend) {
    case "rising": return 0.15;
    case "declining": return -0.2;
    default: return 0;
  }
}

function categoryFromScore(score: number): EcologyCategory {
  if (score >= 0.8) {
    return "rich";
  }

  if (score >= 0.55) {
    return "decent";
  }

  if (score >= 0.35) {
    return "poor";
  }

  return "depleted";
}

function summarizeBucket(memories: readonly ResourcePatchMemory[], kind: "wildlife" | "aquatic" | "plants"): KnownEcologyBucket {
  if (memories.length === 0) {
    return {
      category: "unknown",
      knownPlaces: 0,
      reliable: 0,
      declining: 0,
      depletedOrAvoided: 0,
      recovering: 0,
      note: kind === "wildlife"
        ? "No known hunting grounds yet"
        : kind === "aquatic"
          ? "No known fishing places yet"
          : "No known gathering places yet",
    };
  }

  let scoreSum = 0;
  let reliable = 0;
  let declining = 0;
  let depletedOrAvoided = 0;
  let recovering = 0;

  for (const memory of memories) {
    scoreSum += Math.max(0, Math.min(1, stateScore(memory) + trendDelta(memory)));

    if (memory.state === "reliable") {
      reliable += 1;
    }

    if (memory.useHistory?.yieldTrend === "declining") {
      declining += 1;
    }

    if (memory.state === "depleted" || memory.risk?.tabooOrAvoidanceFutureFlag === true) {
      depletedOrAvoided += 1;
    }

    // A place the band believes was thinned but is trending back up reads as recovering.
    if (memory.state === "depleted" && memory.useHistory?.yieldTrend === "rising") {
      recovering += 1;
    }
  }

  const meanScore = scoreSum / memories.length;
  const category: KnownEcologyCategory = recovering > 0 && recovering >= declining
    ? "recovering"
    : categoryFromScore(meanScore);

  return {
    category,
    knownPlaces: memories.length,
    reliable,
    declining,
    depletedOrAvoided,
    recovering,
    note: bucketNote(kind, category, memories.length, declining, recovering),
  };
}

function bucketNote(
  kind: "wildlife" | "aquatic" | "plants",
  category: KnownEcologyCategory,
  knownPlaces: number,
  declining: number,
  recovering: number,
): string {
  const subject = kind === "wildlife" ? "Hunters" : kind === "aquatic" ? "Fishing parties" : "Gatherers";
  const place = kind === "wildlife" ? "grounds" : kind === "aquatic" ? "waters" : "patches";

  switch (category) {
    case "rich": return `${subject} know rich ${place} (${knownPlaces})`;
    case "decent": return `${subject} know decent ${place} (${knownPlaces})`;
    case "recovering": return `${subject} say worked ${place} are resting / recovering`;
    case "poor": return declining > 0 ? `${subject} say returns are falling` : `${subject} know only thin ${place}`;
    case "depleted": return `${subject} say the ${place} they know are overused`;
    default: return `No known ${place} yet`;
  }
}

export function deriveSelectedBandEcology(band: Band): SelectedBandEcology {
  const memories = band.resourceKnowledgeState?.patchMemories ?? [];
  const wildlife: ResourcePatchMemory[] = [];
  const aquatic: ResourcePatchMemory[] = [];
  const plants: ResourcePatchMemory[] = [];

  for (const memory of memories) {
    if (WILDLIFE_CLASSES.has(memory.resourceClassId)) {
      wildlife.push(memory);
    } else if (AQUATIC_CLASSES.has(memory.resourceClassId)) {
      aquatic.push(memory);
    } else if (PLANT_CLASSES.has(memory.resourceClassId)) {
      plants.push(memory);
    }
  }

  return {
    wildlife: summarizeBucket(wildlife, "wildlife"),
    aquatic: summarizeBucket(aquatic, "aquatic"),
    plants: summarizeBucket(plants, "plants"),
    fromBandKnowledgeOnly: true,
  };
}

// --- world-debug (truth) formatting ---

export interface EcologyDashboardLine {
  readonly label: string;
  readonly category: EcologyCategory;
  readonly detail: string;
}

export interface EcologyDashboard {
  readonly wildlife: EcologyDashboardLine;
  readonly aquatic: EcologyDashboardLine;
  readonly plants: EcologyDashboardLine;
  readonly pressure: WorldEcologySummary["pressure"];
  readonly debugTruthOnly: true;
}

function dominantStockCategory(summary: WorldEcologySummary["fauna"]): EcologyCategory {
  if (summary.total === 0) {
    return "decent";
  }

  if (summary.depleted >= summary.total * 0.25) {
    return "depleted";
  }

  if (summary.recovering >= summary.total * 0.2) {
    return "recovering";
  }

  if (summary.rich >= summary.total * 0.5) {
    return "rich";
  }

  return summary.poor > summary.decent ? "poor" : "decent";
}

export function formatWorldEcology(summary: WorldEcologySummary): EcologyDashboard {
  const plantCategory: EcologyCategory = summary.plant.heavilyOverharvested > 8
    ? "depleted"
    : summary.plant.overharvested > 120
      ? "poor"
      : summary.plant.recovering > summary.plant.overharvested
        ? "recovering"
        : "decent";

  return {
    wildlife: {
      label: "Wildlife",
      category: dominantStockCategory(summary.fauna),
      detail: `${summary.fauna.total} herds/grounds · ${summary.fauna.overused} overused · ${summary.fauna.disturbed} disturbed · mean abundance ${summary.fauna.meanAbundance}`,
    },
    aquatic: {
      label: "Fish / Aquatic",
      category: dominantStockCategory(summary.aquatic),
      detail: `${summary.aquatic.total} fishing stocks · ${summary.aquatic.overused} overused · mean abundance ${summary.aquatic.meanAbundance}`,
    },
    plants: {
      label: "Plant gathering",
      category: plantCategory,
      detail: `${summary.plant.dynamicRecords} worked patches · ${summary.plant.overharvested} overharvested · mean depletion ${summary.plant.meanDepletion}`,
    },
    pressure: summary.pressure,
    debugTruthOnly: true,
  };
}
