// Deterministic band tendencies (checkpoint CAUSAL-REPAIR-1) — stable, bounded
// behavioral individuality.
//
// WHY THIS EXISTS (CAUSAL_AGENCY_DIAGNOSTIC §15.8): bands are clones under
// equal conditions. `seededVariation` is a ≤0.06 near-tie tiebreak that is
// zero without a runSeed, and spawn hashes the seed only for color and
// starting population. Two bands in the same ecological/demographic/memory
// state compute identical scores and act identically forever. Individual
// behavioral variation (bold↔shy foragers) is a documented driver of forager
// divergence (individual-variation family per diagnostic §15.10; kept as a
// bounded design coupling, not a realism claim about any one culture).
//
// WHAT THIS DOES: derives a small per-band tendency vector as a PURE HASH of
// the band's stable identity (its id, blended 70/30 with its parent's id so
// daughters carry a bounded echo of lineage character without recursion).
// Each trait is a signed value in [-1, 1]; every use site multiplies an
// EXISTING bounded term by (1 + trait * smallFactor ≤ ±0.15), so tendencies
// shift where a threshold sits per band — ecology still decides.
//
// HARD SCOPE LOCK: no Band state (pure derivation), no runSeed dependency
// (individuality exists in the default movie and is identical across runs of
// the same map), no randomness, no trait may override ecology/water/route
// blockers (caps enforced at use sites), no `any`, no UI imports.

import type { Band } from "./types";
import { hashSeedString } from "../core/seededVariation";

// Largest multiplier any single tendency may apply at a use site: (1 ± 0.15).
export const TENDENCY_INFLUENCE_CAP = 0.15;

export interface BandTendencyProfile {
  readonly bandId: Band["id"];
  // Urge to probe/explore beyond the known range.
  readonly exploration: number;
  // Strength of the pull to hold a familiar place (scales the stay bonus).
  readonly attachment: number;
  // Extra caution at river crossings and uncertain routes.
  readonly crossingCaution: number;
  // Willingness to shift camp locally under camp problems.
  readonly campShiftWillingness: number;
  // How strongly repeated failure/hardship registers (scales hardship severity).
  readonly failureSensitivity: number;
  // Reliance on established local routines (scales adaptive routine influence).
  readonly routineReliance: number;
}

// Signed trait in [-1, 1] from a stable identity string. FNV-1a alone has weak
// avalanche on trailing characters (ids differing only in the last character
// would yield near-identical traits), so the hash is finalized with a
// murmur3-style mix before normalizing. Pure — same identity, same trait.
function traitFromIdentity(trait: string, identity: string): number {
  let hash = hashSeedString(`tendency:${trait}:${identity}`);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489917);
  hash ^= hash >>> 16;

  return round2(((hash >>> 0) / 4294967295) * 2 - 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function blendedTrait(trait: string, band: Band): number {
  const own = traitFromIdentity(trait, String(band.id));

  if (band.parentBandId === undefined) {
    return own;
  }

  // Daughters inherit a bounded echo of the parent's trait component: 70% own
  // hash, 30% parent-id hash. One level only — no recursive lineage walk.
  const parent = traitFromIdentity(trait, String(band.parentBandId));

  return round2(own * 0.7 + parent * 0.3);
}

// Memo: the profile is a pure function of (band id, parent id), so it can be
// cached process-wide without touching determinism. Bounded: cleared when it
// grows past the cap (bands per run are bounded; entries are tiny).
const tendencyMemo = new Map<string, BandTendencyProfile>();
const TENDENCY_MEMO_CAP = 1024;

export function deriveBandTendencies(band: Band): BandTendencyProfile {
  const memoKey = `${String(band.id)}|${String(band.parentBandId ?? "")}`;
  const cached = tendencyMemo.get(memoKey);

  if (cached !== undefined) {
    return cached;
  }

  const profile: BandTendencyProfile = {
    bandId: band.id,
    exploration: blendedTrait("exploration", band),
    attachment: blendedTrait("attachment", band),
    crossingCaution: blendedTrait("crossing_caution", band),
    campShiftWillingness: blendedTrait("camp_shift", band),
    failureSensitivity: blendedTrait("failure_sensitivity", band),
    routineReliance: blendedTrait("routine_reliance", band),
  };

  if (tendencyMemo.size >= TENDENCY_MEMO_CAP) {
    tendencyMemo.clear();
  }

  tendencyMemo.set(memoKey, profile);

  return profile;
}
