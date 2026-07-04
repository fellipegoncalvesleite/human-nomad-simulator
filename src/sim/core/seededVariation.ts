// Deterministic seeded run-variation (checkpoint VAR-1).
//
// The simulator is otherwise ONE deterministic movie per map: nothing in the
// sim consumes a seed, so every run of a given map is byte-identical. For a
// HISTORY simulator that is wrong — different runs should produce different
// plausible migrations / fissions / routes. VAR-1 adds a small, deterministic,
// causal seeded JITTER applied ONLY at near-tie decision points (which close
// candidate a band picks), never as a behaviour override.
//
// CONTRACT:
//   * same runSeed + same map + same duration → byte-identical (pure integer
//     hashing of runSeed + tick + band + candidate; no unseeded random call, no clock).
//   * different runSeed → different ordering of GENUINELY CLOSE candidates only
//     (jitter magnitude is a small epsilon, far below typical score gaps, so a
//     clear winner never flips — ecology still decides, the seed only breaks
//     ties the ecology left open).
//   * runSeed === undefined → ZERO jitter → legacy behaviour, so every existing
//     baseline / fingerprint / audit (which never set a runSeed) is unchanged.

// FNV-1a → uint32. Used to turn a human seed string into the numeric runSeed.
export function hashSeedString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mixUint(hash: number, value: number): number {
  let next = hash ^ Math.imul(value | 0, 2654435761);
  next ^= next >>> 15;
  next = Math.imul(next, 2246822519);
  next ^= next >>> 13;

  return next >>> 0;
}

function mixString(hash: number, value: string): number {
  let next = hash;

  for (let index = 0; index < value.length; index += 1) {
    next = mixUint(next, value.charCodeAt(index));
  }

  return next >>> 0;
}

// Signed jitter in [-0.5, 0.5), a pure deterministic function of the runSeed
// and the decision-identifying parts. Callers multiply by a small epsilon and
// add it to a candidate's score before the existing score-desc sort, so only
// candidates within ~epsilon of each other can reorder.
export function seededTieBreakJitter(
  runSeed: number,
  parts: readonly (string | number)[],
): number {
  let hash = runSeed >>> 0;

  for (const part of parts) {
    hash = typeof part === "number" ? mixUint(hash, part) : mixString(hash, part);
  }

  return (hash >>> 0) / 4294967296 - 0.5;
}

// Epsilon for movement candidate selection. Candidate scores run roughly 0..3
// (round2 granularity 0.01); 0.06 lets candidates within ~0.06 reorder per
// seed — close calls only, never a clear winner.
export const MOVEMENT_TIEBREAK_EPSILON = 0.06;

// Fission-target scores are on the same scale; daughters founding direction is
// a key divergence lever, so a slightly larger window is allowed.
export const FISSION_TIEBREAK_EPSILON = 0.08;
