// CORE-PIPELINE-DECOMPOSITION-2 — shared candidate score-weight constants.
//
// Empirical calibration constants shared by the decision orchestrator and the
// extracted candidate-family modules. Moved here so a family module can own its
// candidate without importing the orchestrator. Values are unchanged.

// VISIBLE-LANDSCAPE probe (2K.1F) — probe candidate only, never a relocation.
export const VISIBLE_LANDSCAPE_PROBE_SCORE_WEIGHT = 2.0;

// Probe target diversity + diminishing returns (2K.1G): how strongly a detected
// no-information same-target probe loop degrades the probe candidate score.
export const PROBE_DIMINISHING_RETURN_SCORE_WEIGHT = 1.0;

// Resource-scout value-of-information weight (2K.1H): scales the bounded VOI score
// of the best scout candidate into the resource_scout candidate score.
export const RESOURCE_SCOUT_SCORE_WEIGHT = 2.6;

// Proactive information-seeking gating (2K.6B / INFO-1): a stable band with spare
// labor and an elapsed cooldown may scout to learn before a crisis.
export const PROACTIVE_INFO_COOLDOWN_SEASONS = 12; // ≤ ~1 proactive scout per 3 years per band
export const PROACTIVE_INFO_MAX_FOOD_STRESS = 0.5; // not in survival crisis (then it forages, not learns)
export const PROACTIVE_INFO_MAX_MOBILITY_PRESSURE = 0.75; // not URGENTLY driven to relocate
export const PROACTIVE_INFO_MIN_LABOR = 6; // has labor/logistical capacity to spare for learning
export const PROACTIVE_INFO_PULL = 2.5; // information motive added when eligible
