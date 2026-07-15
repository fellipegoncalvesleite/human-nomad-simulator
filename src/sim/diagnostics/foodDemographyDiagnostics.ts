// FOOD-DEMOGRAPHY-SEPARATION-1 diagnostic controls.
//
// These options are supplied by an audit runner and threaded through a single
// simulation step. They are deliberately absent from WorldState and snapshots.
// Production callers omit them, preserving the normal deterministic path.
export type DiagnosticFoodMode = "actual" | "canonically_adequate";
export type DiagnosticDemographyMode = "actual" | "legacy_stacked" | "de_stacked";

export interface FoodDemographyDiagnostics {
  readonly foodMode?: DiagnosticFoodMode;
  readonly demographyMode?: DiagnosticDemographyMode;
}
