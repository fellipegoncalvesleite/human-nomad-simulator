// RANGE-3 — Social Range Recognition (READ-ONLY, derived, NEVER stepSim).
//
// Pure & deterministic: no unseeded random call, no `any`, no UI/render/store/zustand imports, and
// NEVER called inside stepSim — so the simulation is byte-identical. Reads ONLY the
// observer band's OWN known contact memories, lineage fields, and the already-derived
// familiar-country ranges of the bounded candidate set — the anti-omniscience guarantee.
// No world.tiles scan. No all-band scan. No economy/CC/yield/support coupling.
// This is NOT territory, borders, ownership, or conflict — it is a derived view of
// social range awareness derived from memory-only evidence.
//
// Candidate set is bounded: O(kin + contacts), never a tile scan.

import type { BandId, TickNumber, TileId } from "../core/types";
import type { Band } from "./types";
import type { WorldState } from "../world/types";
import {
  deriveFamiliarCountry,
  familiarCountryTileSet,
  familiarCountryWaterCores,
} from "./familiarCountry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SOCIAL_RECOGNITION_CONSTANTS = {
  MAX_RECOGNIZED_NEIGHBORS: 8,
  FAMILIAR_MIN: 0.45,
  RECOGNIZED_MIN: 0.65,
  WATER_NEIGHBOR_MIN: 2,
  GLIMPSED_MAX_CONTACTS: 1,
  SUSPECTED_MAX_CONTACTS: 3,
} as const;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type SocialRelationKind =
  | "parent"
  | "daughter"
  | "sibling"
  | "lineage_kin"
  | "familiar_neighbor"
  | "repeated_water_neighbor"
  | "distant_unknown"
  | "stranger";

export type AwarenessLevel = "none" | "glimpsed" | "suspected" | "familiar" | "recognized";

export type RangeRelation =
  | "overlapping_core"
  | "overlapping_edge"
  | "shared_water"
  | "adjacent_ranges"
  | "target_inside_observer_range"
  | "observer_inside_target_range"
  | "no_meaningful_overlap"
  | "unknown";

export interface RecognizedRangeContext {
  readonly observerBandId: BandId;
  readonly targetBandId: BandId;
  readonly relationKind: SocialRelationKind;
  readonly awarenessLevel: AwarenessLevel;
  readonly rangeRelation: RangeRelation;
  readonly confidence: number; // 0..1
  readonly sharedRangeTileCount: number;
  readonly sharedWaterCoreCount: number;
  readonly lastEvidenceTick?: TickNumber;
  readonly evidenceReasonIds: readonly string[];
  readonly derivedFromKnownMemoryOnly: true;
  readonly noHiddenTruthScan: true;
  readonly noOwnership: true;
  readonly noConflict: true;
  readonly noEconomyCoupling: true;
  readonly noBehaviorChange: true;
}

export interface SocialRangeRecognitionSummary {
  readonly observerBandId: BandId;
  readonly currentTick: TickNumber;
  readonly neighbors: readonly RecognizedRangeContext[]; // capped, deterministic order
  readonly counts: { readonly kin: number; readonly neighbor: number; readonly total: number };
  readonly derivedFromKnownMemoryOnly: true;
  readonly noHiddenTruthScan: true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Ordered awareness levels (index = rank, higher = more aware). */
const AWARENESS_RANK: readonly AwarenessLevel[] = [
  "none",
  "glimpsed",
  "suspected",
  "familiar",
  "recognized",
];

function awarenessRank(level: AwarenessLevel): number {
  return AWARENESS_RANK.indexOf(level);
}

function maxAwareness(a: AwarenessLevel, b: AwarenessLevel): AwarenessLevel {
  return awarenessRank(a) >= awarenessRank(b) ? a : b;
}

/** Returns true if a band is active (not extinct or absorbed). */
function isBandActive(band: Band): boolean {
  const status = band.viability?.status;
  return status !== "absorbed" && status !== "extinct" && band.status !== "dispersed";
}

// ---------------------------------------------------------------------------
// Per-target derivation
// ---------------------------------------------------------------------------

function deriveForTarget(
  observer: Band,
  target: Band,
  currentTick: TickNumber,
): RecognizedRangeContext {
  const C = SOCIAL_RECOGNITION_CONSTANTS;
  const targetId = target.id;
  const evidenceReasonIds: string[] = [];

  // --- relationKind (lineage-first) ---
  let relationKind: SocialRelationKind;

  if (targetId === observer.parentBandId) {
    relationKind = "parent";
    evidenceReasonIds.push("kin_parent");
  } else if (observer.daughterBandIds.includes(targetId)) {
    relationKind = "daughter";
    evidenceReasonIds.push("kin_daughter");
  } else {
    // Sibling: both share the same parentBandId (must be defined on both sides).
    const observerParentId = observer.parentBandId;
    const targetParentId = target.parentBandId;
    if (
      observerParentId !== undefined &&
      targetParentId !== undefined &&
      observerParentId === targetParentId
    ) {
      relationKind = "sibling";
      evidenceReasonIds.push("kin_sibling");
    } else if (
      observer.lineage !== undefined &&
      target.lineage !== undefined &&
      observer.lineage.parentBandId === target.lineage.parentBandId
    ) {
      relationKind = "lineage_kin";
      evidenceReasonIds.push("kin_lineage");
    } else {
      // Contact-memory based
      const cm = observer.contactMemories[targetId];
      if (cm !== undefined) {
        evidenceReasonIds.push("contact_memory");
        // We'll decide between repeated_water_neighbor / familiar_neighbor / distant_unknown
        // after range computation; defer until we know sharedWaterCoreCount.
        // Temporary placeholder; will be overwritten after range derivation.
        relationKind = cm.familiarity >= C.FAMILIAR_MIN ? "familiar_neighbor" : "distant_unknown";
      } else {
        relationKind = "stranger";
      }
    }
  }

  // --- range overlap ---
  const obsRange = deriveFamiliarCountry(observer, currentTick);
  const tgtRange = deriveFamiliarCountry(target, currentTick);

  let rangeRelation: RangeRelation;
  let sharedRangeTileCount = 0;
  let sharedWaterCoreCount = 0;

  if (!obsRange.hasMeaningfulRange || !tgtRange.hasMeaningfulRange) {
    rangeRelation = "unknown";
  } else {
    const obsSet = familiarCountryTileSet(obsRange);
    const tgtSet = familiarCountryTileSet(tgtRange);
    const obsWaters = familiarCountryWaterCores(obsRange);
    const tgtWaters = familiarCountryWaterCores(tgtRange);

    // Shared tile count (all range tiers)
    for (const tileId of tgtSet) {
      if (obsSet.has(tileId)) {
        sharedRangeTileCount++;
      }
    }

    // Shared water cores
    const tgtWaterSet = new Set<string>(tgtWaters.map(String));
    for (const wc of obsWaters) {
      if (tgtWaterSet.has(String(wc))) {
        sharedWaterCoreCount++;
      }
    }

    if (sharedWaterCoreCount > 0) {
      evidenceReasonIds.push("shared_water_core");
    }
    if (sharedRangeTileCount > 0) {
      evidenceReasonIds.push("range_overlap");
    }

    // Core tile sets for containment test
    const obsCore = new Set<string>(obsRange.coreTiles.map(String));
    const tgtCore = new Set<string>(tgtRange.coreTiles.map(String));

    // Containment: does observer range fully contain the target range?
    let tgtInsideObs = tgtSet.size > 0;
    for (const tileId of tgtSet) {
      if (!obsSet.has(tileId)) {
        tgtInsideObs = false;
        break;
      }
    }
    let obsInsideTgt = obsSet.size > 0;
    for (const tileId of obsSet) {
      if (!tgtSet.has(tileId)) {
        obsInsideTgt = false;
        break;
      }
    }

    // Shared core tiles count
    let sharedCoreTileCount = 0;
    for (const tileId of tgtCore) {
      if (obsCore.has(tileId)) {
        sharedCoreTileCount++;
      }
    }

    if (tgtInsideObs) {
      rangeRelation = "target_inside_observer_range";
    } else if (obsInsideTgt) {
      rangeRelation = "observer_inside_target_range";
    } else if (sharedWaterCoreCount > 0 && sharedCoreTileCount === 0) {
      // Water core overlap is the primary overlap
      rangeRelation = "shared_water";
    } else if (sharedCoreTileCount > 0) {
      rangeRelation = "overlapping_core";
    } else if (sharedRangeTileCount > 0) {
      rangeRelation = "overlapping_edge";
    } else {
      // Adjacency check: cheaply test if any core tile of one set neighbors a core tile of
      // the other. TileIds encode coords as "tile:x:y" (see world/generate.ts), so parse the
      // last two ":"-separated fields. If a key ever fails to parse we skip adjacency and fall
      // through to no_meaningful_overlap (never throws).
      let foundAdjacent = false;
      const tryParseCoord = (tileId: string): { x: number; y: number } | undefined => {
        const parts = tileId.split(":");
        if (parts.length === 3) {
          const x = parseInt(parts[1] ?? "", 10);
          const y = parseInt(parts[2] ?? "", 10);
          if (!isNaN(x) && !isNaN(y)) {
            return { x, y };
          }
        }
        return undefined;
      };

      outer: for (const obsTile of obsCore) {
        const obsCoord = tryParseCoord(obsTile);
        if (obsCoord === undefined) break;
        for (const tgtTile of tgtCore) {
          const tgtCoord = tryParseCoord(tgtTile);
          if (tgtCoord === undefined) break outer;
          const dx = Math.abs(obsCoord.x - tgtCoord.x);
          const dy = Math.abs(obsCoord.y - tgtCoord.y);
          if (dx <= 2 && dy <= 2) {
            foundAdjacent = true;
            break outer;
          }
        }
      }

      rangeRelation = foundAdjacent ? "adjacent_ranges" : "no_meaningful_overlap";
    }
  }

  // --- refine relationKind for water neighbor (now we know sharedWaterCoreCount) ---
  const cm = observer.contactMemories[targetId];
  const isKin =
    relationKind === "parent" ||
    relationKind === "daughter" ||
    relationKind === "sibling" ||
    relationKind === "lineage_kin";

  if (!isKin && cm !== undefined) {
    if (cm.sharedUseCount >= C.WATER_NEIGHBOR_MIN && sharedWaterCoreCount > 0) {
      relationKind = "repeated_water_neighbor";
    } else if (cm.familiarity >= C.FAMILIAR_MIN) {
      relationKind = "familiar_neighbor";
    } else {
      relationKind = "distant_unknown";
    }
  }

  // --- awarenessLevel ---
  // Kin floor: at least "familiar"
  const kinFloor: AwarenessLevel = isKin ? "familiar" : "none";

  let contactAwareness: AwarenessLevel = "none";
  if (cm !== undefined) {
    if (cm.contactCount <= C.GLIMPSED_MAX_CONTACTS) {
      contactAwareness = "glimpsed";
    } else if (cm.contactCount <= C.SUSPECTED_MAX_CONTACTS) {
      contactAwareness = "suspected";
    } else if (cm.familiarity >= C.RECOGNIZED_MIN && sharedRangeTileCount > 0) {
      contactAwareness = "recognized";
    } else if (cm.familiarity >= C.FAMILIAR_MIN) {
      contactAwareness = "familiar";
    } else {
      contactAwareness = "suspected";
    }
  }

  const awarenessLevel: AwarenessLevel = maxAwareness(kinFloor, contactAwareness);

  // --- lastEvidenceTick ---
  const lastEvidenceTick: TickNumber | undefined =
    cm !== undefined ? (Number(cm.lastContactAt.tick) as TickNumber) : undefined;

  // --- confidence ---
  const awarenessScore = awarenessRank(awarenessLevel) / (AWARENESS_RANK.length - 1);
  const rangeTotal = obsRange.hasMeaningfulRange ? obsRange.counts.rangeTotal : 1;
  const tgtRangeTotal = tgtRange.hasMeaningfulRange ? tgtRange.counts.rangeTotal : 1;
  const minRangeTotal = Math.max(1, Math.min(rangeTotal, tgtRangeTotal));
  const overlapFraction = sharedRangeTileCount / minRangeTotal;
  const contactFamiliarity = cm !== undefined ? cm.familiarity : isKin ? 0.6 : 0;

  const confidence = clamp01(0.4 * awarenessScore + 0.35 * overlapFraction + 0.25 * contactFamiliarity);

  return {
    observerBandId: observer.id,
    targetBandId: targetId,
    relationKind,
    awarenessLevel,
    rangeRelation,
    confidence,
    sharedRangeTileCount,
    sharedWaterCoreCount,
    lastEvidenceTick,
    evidenceReasonIds,
    derivedFromKnownMemoryOnly: true,
    noHiddenTruthScan: true,
    noOwnership: true,
    noConflict: true,
    noEconomyCoupling: true,
    noBehaviorChange: true,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function deriveSocialRangeRecognition(
  observer: Band,
  world: WorldState,
  currentTick: TickNumber,
): SocialRangeRecognitionSummary {
  const C = SOCIAL_RECOGNITION_CONSTANTS;
  const allBands = world.bands;

  // --- Build bounded candidate set (O(kin + contacts), NO world-tile scan) ---
  const candidateIds = new Set<BandId>();

  // Parent
  if (observer.parentBandId !== undefined) {
    candidateIds.add(observer.parentBandId);
  }

  // Daughters
  for (const dId of observer.daughterBandIds) {
    candidateIds.add(dId);
  }

  // Siblings: if we have a parent, collect parent's daughters minus self
  if (observer.parentBandId !== undefined) {
    const parent = allBands[observer.parentBandId];
    if (parent !== undefined) {
      for (const sibId of parent.daughterBandIds) {
        if (sibId !== observer.id) {
          candidateIds.add(sibId);
        }
      }
    }
  }

  // Contact memories
  for (const contactId of Object.keys(observer.contactMemories) as BandId[]) {
    candidateIds.add(contactId);
  }

  // Dedupe, drop self, drop missing/inactive
  const validCandidates: Band[] = [];
  for (const candidateId of candidateIds) {
    if (candidateId === observer.id) continue;
    const candidate = allBands[candidateId];
    if (candidate === undefined) continue;
    if (!isBandActive(candidate)) continue;
    validCandidates.push(candidate);
  }

  // --- Derive per-target contexts ---
  const allContexts: RecognizedRangeContext[] = validCandidates.map((target) =>
    deriveForTarget(observer, target, currentTick),
  );

  // --- Sort: awareness rank desc, confidence desc, bandId asc (deterministic) ---
  allContexts.sort((a, b) => {
    const rankDiff = awarenessRank(b.awarenessLevel) - awarenessRank(a.awarenessLevel);
    if (rankDiff !== 0) return rankDiff;
    const confDiff = b.confidence - a.confidence;
    if (confDiff !== 0) return confDiff;
    return String(a.targetBandId) < String(b.targetBandId) ? -1 : 1;
  });

  // --- Cap to MAX_RECOGNIZED_NEIGHBORS ---
  const neighbors = allContexts.slice(0, C.MAX_RECOGNIZED_NEIGHBORS);

  // --- Counts ---
  const KIN_KINDS: ReadonlySet<SocialRelationKind> = new Set([
    "parent",
    "daughter",
    "sibling",
    "lineage_kin",
  ]);

  let kinCount = 0;
  let neighborCount = 0;
  for (const ctx of neighbors) {
    if (KIN_KINDS.has(ctx.relationKind)) {
      kinCount++;
    } else {
      neighborCount++;
    }
  }

  return {
    observerBandId: observer.id,
    currentTick,
    neighbors,
    counts: { kin: kinCount, neighbor: neighborCount, total: neighbors.length },
    derivedFromKnownMemoryOnly: true,
    noHiddenTruthScan: true,
  };
}
