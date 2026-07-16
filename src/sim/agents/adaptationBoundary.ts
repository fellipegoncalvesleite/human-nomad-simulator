// CORE-PIPELINE-DECOMPOSITION-3 (Workstream B) — practical-adaptation / invention
// public boundary.
//
// The ONE sanctioned entry point for production code OUTSIDE the adaptation
// subsystem to drive and read the practical-adaptation / invention causal chain:
//
//   lived evidence -> practical problem -> fragments/affordances -> idea ->
//   experiment -> physical result -> practical response / invention -> real
//   coefficient/capability effect -> efficacy -> revision/dormancy/inheritance ->
//   later behavior
//
// Canonical state:   band.practicalAdaptation
// Advance writers:   advancePracticalAdaptation, advanceAdaptiveHumanState
// Effect boundary:   practicalResponses.ts is the single DEFINITION site for the
//                    effect readers (derive*Condition, derive*Relief, storage);
//                    production reads them THROUGH this boundary, never directly.
// Efficacy:          the evaluate*Efficacy readers below
// Inheritance:       inheritPracticalAdaptationForDaughter,
//                    inheritAdaptiveHumanForDaughter (fission)
//
// This surface is deliberately SMALLER than the internal implementation: the
// subsystem's problem-framing, fragment, affordance, idea, experiment, and
// invention-chain internals are NOT exported here — only the operations
// production actually consumes, named explicitly (this is a CURATED boundary,
// NOT a re-export-everything `export *` barrel). Every production SIM module
// outside the internal adaptation cluster must import adaptation only through
// this file (enforced by scripts/adaptationBoundaryAudit.mjs, which rejects any
// sibling `./adaptiveHuman` / `./practicalResponses` / `./adaptiveEfficacy`
// import from a non-internal module). Internal adaptation modules still import
// each other directly. The read-only UI projection layer (band panels) is a
// separate concern governed by importBoundaryAudit, not this boundary. The
// re-exports are behaviorally identical to the previous direct imports.
import type { Band } from "./types";
import {
  deriveCarryingCondition,
  deriveWaterRouteCondition,
  deriveWaterStorageCondition,
} from "./practicalResponses";

// --- Advance the adaptation state (writers on the production path) ---
export { advancePracticalAdaptation } from "./practicalResponses";
export { advanceAdaptiveHumanState } from "./adaptiveHuman";

// --- Read decision support + per-action influence (band-known effects) ---
export {
  deriveAdaptiveDecisionSupport,
  selectAdaptiveInfluenceForAction,
  type AdaptiveDecisionSupport,
} from "./adaptiveHuman";

// --- Read adaptive-human profile (band-known adaptive-state projection) ---
export { deriveAdaptiveHumanProfile } from "./adaptiveHuman";

// --- Read the real behavioral/physical effect coefficients (effect boundary) ---
// The band-known effect CONDITIONS the decision scorer consumes:
export {
  deriveCarryingCondition,
  deriveWaterRouteCondition,
  deriveWaterStorageCondition,
  deriveEffectiveStorageCapacity,
} from "./practicalResponses";
// The per-system RELIEFS individual physical agent modules apply (acute-risk
// care, camp shelter, hunting safety, local-use-pressure water works, residential/
// migration carrying + carried water + dry-route water, storage engineering):
export {
  deriveCareTreatmentRelief,
  deriveShelterExposureRelief,
  deriveShelterPortabilityBurden,
  deriveHuntingSafetyRelief,
  deriveWaterWorksRelief,
  deriveCarryingRelief,
  deriveCarriedWaterRelief,
  deriveDryRouteWaterRelief,
  deriveEngineeringSafetyRelief,
  type CarriedWaterReliefResult,
  type PracticalReliefResult,
} from "./practicalResponses";

// Convenience grouping of the three band-only effect conditions, so a caller can
// read the current adaptation effect coefficients in one call.
export function deriveAdaptationEffectConditions(band: Band): {
  readonly carrying: number;
  readonly waterRoute: number;
  readonly waterStorage: number;
} {
  return {
    carrying: deriveCarryingCondition(band),
    waterRoute: deriveWaterRouteCondition(band),
    waterStorage: deriveWaterStorageCondition(band),
  };
}

// --- Evaluate outcome efficacy of applied responses ---
export {
  evaluateCareEfficacy,
  evaluateCarryingEfficacy,
  evaluateEngineeringEfficacy,
  evaluateHuntingEfficacy,
  evaluateMeasureEfficacy,
  evaluateShelterEfficacy,
  evaluateWaterStorageEfficacy,
  evaluateWaterRouteEfficacy,
} from "./adaptiveEfficacy";

// --- Inherit adaptation knowledge to a fission daughter ---
export { inheritPracticalAdaptationForDaughter } from "./practicalResponses";
export { inheritAdaptiveHumanForDaughter } from "./adaptiveHuman";
