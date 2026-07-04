// RANGE-3 — Lineage Identity substrate (READ-ONLY, derived).
//
// Pure & deterministic: no unseeded random call, no `any`, no UI/render/store imports, and NEVER
// called inside stepSim — so the simulation is byte-identical. Derives an evidence-gated
// identity state for a band relative to its parent lineage; also derives a DISPLAY-ONLY
// identity color (never stored on band, never mutates sim state). Reads ONLY the band's
// own known memory + familiarCountry / lineageColor helpers. NOT territory or ownership.

import type { Band } from "./types";
import type { BandId, TickNumber } from "../core/types";
import type { WorldState } from "../world/types";
import {
  deriveFamiliarCountry,
  deriveInheritedRangeContext,
} from "./familiarCountry";
import { hexToHsl, hslToHex, colorDistance } from "./lineageColor";

export const LINEAGE_IDENTITY_CONSTANTS = {
  BRANCH_MIN_TICKS: 12,
  INDEP_MIN_TICKS: 28,
  INDEP_SHARED_MAX: 3,
  IDENTITY_HUE_SHIFT: 28,
} as const;

export type LineageIdentityState =
  | "founder"
  | "parent_dependent_daughter"
  | "lineage_branch"
  | "independent_range_identity"
  | "new_country_founder";

export interface LineageIdentity {
  readonly bandId: BandId;
  readonly state: LineageIdentityState;
  readonly identityColor: string; // display-only; NOT stored on band
  readonly ownCorePlaceCount: number;
  readonly sharedRangeWithParent: number;
  readonly ticksSinceFission: number;
  readonly recognizedSeparate: boolean;
  readonly reasonIds: readonly string[];
  readonly derivedFromKnownMemoryOnly: true;
  readonly noBehaviorChange: true;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function deriveIdentityColor(
  band: Band,
  state: LineageIdentityState,
): string {
  if (
    state === "founder" ||
    state === "parent_dependent_daughter" ||
    state === "lineage_branch"
  ) {
    // Stay in the RANGE-2 hue family — no drift.
    return band.color;
  }
  // independent_range_identity or new_country_founder: deterministic distinct hue.
  const hsl = hexToHsl(band.color);
  if (hsl === undefined) {
    return band.color;
  }
  const shifted = hslToHex({
    h: (hsl.h + LINEAGE_IDENTITY_CONSTANTS.IDENTITY_HUE_SHIFT) % 360,
    s: clamp(hsl.s + 0.05, 0.4, 0.9),
    l: clamp(hsl.l, 0.34, 0.74),
  });
  // Guard: result must differ from band.color (colorDistance > 0).
  if (colorDistance(shifted, band.color) === 0) {
    // Extremely unlikely (identical after rounding); return band color as fallback.
    return band.color;
  }
  return shifted;
}

export function deriveLineageIdentity(
  band: Band,
  parent: Band | undefined,
  _world: WorldState,
  currentTick: TickNumber,
): LineageIdentity {
  const C = LINEAGE_IDENTITY_CONSTANTS;
  const reasonIds: string[] = [];

  // --- ticks since fission ---
  const ticksSinceFission =
    band.lineage !== undefined
      ? Math.max(0, Number(currentTick) - Number(band.lineage.createdAt.tick))
      : Number(currentTick);

  // --- own core place count (cores that differ from parent's corresponding core) ---
  const range = deriveFamiliarCountry(band, currentTick);
  const parentRange =
    parent !== undefined
      ? deriveFamiliarCountry(parent, currentTick)
      : undefined;

  let ownCorePlaceCount = 0;
  const bandCampCore = range.corePlaces.campCore;
  const bandWaterCore = range.corePlaces.waterCore;
  const parentCampCore = parentRange?.corePlaces.campCore;
  const parentWaterCore = parentRange?.corePlaces.waterCore;

  if (
    bandCampCore !== undefined &&
    (parentCampCore === undefined || bandCampCore !== parentCampCore)
  ) {
    ownCorePlaceCount += 1;
  }
  if (
    bandWaterCore !== undefined &&
    (parentWaterCore === undefined || bandWaterCore !== parentWaterCore)
  ) {
    ownCorePlaceCount += 1;
  }

  // --- shared range with parent ---
  const sharedRangeWithParent =
    parent !== undefined
      ? deriveInheritedRangeContext(band, parent, currentTick).sharedRangeTileCount
      : 0;

  // --- recognized separate (cheap memory scan) ---
  const recognizedSeparate = Object.values(band.contactMemories).some(
    (cm) => cm.relation === "unrelated" && cm.familiarity >= 0.45,
  );

  // --- state derivation ---
  let state: LineageIdentityState;

  if (band.parentBandId === undefined) {
    state = "founder";
    reasonIds.push("founder");
  } else {
    state = "parent_dependent_daughter";

    if (ownCorePlaceCount >= 1 && ticksSinceFission >= C.BRANCH_MIN_TICKS) {
      state = "lineage_branch";
      reasonIds.push("own_cores");

      if (
        range.hasMeaningfulRange &&
        sharedRangeWithParent <= C.INDEP_SHARED_MAX &&
        ticksSinceFission >= C.INDEP_MIN_TICKS &&
        ownCorePlaceCount >= 1
      ) {
        state = "independent_range_identity";
        reasonIds.push("low_parent_overlap");
        reasonIds.push("survived_long");

        if (recognizedSeparate) {
          reasonIds.push("recognized_separate");
        }

        if (
          sharedRangeWithParent === 0 &&
          bandCampCore !== undefined &&
          bandWaterCore !== undefined &&
          (parentCampCore === undefined || bandCampCore !== parentCampCore) &&
          (parentWaterCore === undefined || bandWaterCore !== parentWaterCore)
        ) {
          state = "new_country_founder";
          reasonIds.push("disjoint_from_parent");
        }
      }
    }
  }

  const identityColor = deriveIdentityColor(band, state);

  return {
    bandId: band.id,
    state,
    identityColor,
    ownCorePlaceCount,
    sharedRangeWithParent,
    ticksSinceFission,
    recognizedSeparate,
    reasonIds,
    derivedFromKnownMemoryOnly: true,
    noBehaviorChange: true,
  };
}
