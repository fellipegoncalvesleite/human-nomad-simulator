// FOOD-DEMOGRAPHY-SEPARATION-1 diagnostic controls.
//
// These options are supplied by an audit runner and threaded through a single
// simulation step. They are deliberately absent from WorldState and snapshots.
// Production callers omit them, preserving the normal deterministic path.
export type DiagnosticFoodMode = "actual" | "canonically_adequate";
export type DiagnosticDemographyMode = "actual" | "legacy_stacked" | "de_stacked";

// FOOD-DEMOGRAPHY-SEPARATION-2 death-memory isolation controls.
//
// `deathMemoryMode` selects how death-memory severity is derived:
//   - "actual" (production): severity reads actual socially relevant losses
//     only (share of population lost + dependent/adult cohort loss). Current
//     food/water stress is NOT copied into severity; food still reaches death
//     memory only through the real deaths it causes.
//   - "legacy_direct_food": reproduces the FOOD-DEMOGRAPHY-SEPARATION-1
//     checkpoint-entry behavior where current food stress (0.18) and water
//     stress (0.14) were added directly into severity, giving food a second,
//     redundant fertility-suppression path on top of its ordinary fertility and
//     mortality effects. Retained for the causal isolation matrix only.
export type DiagnosticDeathMemoryMode = "actual" | "legacy_direct_food";

export interface FoodDemographyDiagnostics {
  readonly foodMode?: DiagnosticFoodMode;
  readonly demographyMode?: DiagnosticDemographyMode;
  // Death-memory severity derivation (Cells R0/R1). Default "actual".
  readonly deathMemoryMode?: DiagnosticDeathMemoryMode;
  // Cell R2 — drop the food-shaped dependent/adult cohort contribution to
  // death-memory severity and its recent-death fertility suppression, while
  // leaving realized deaths and population accounting untouched. Diagnostic only.
  readonly neutralizeCohortDeathMemory?: boolean;
  // Cell R3 — zero the recent-death fertility suppression read by demography,
  // isolating the total magnitude of the recent-death fertility mechanism.
  // Death memory itself (caution, avoid-place) is unchanged. Diagnostic only.
  readonly disableDeathMemoryFertility?: boolean;
  // Baseline isolation — remove the 0.002 intrinsic replacement baseline from
  // the annual net rate to measure whether it is a hidden growth subsidy.
  // Diagnostic only.
  readonly disableSurvivalBaseline?: boolean;
}
