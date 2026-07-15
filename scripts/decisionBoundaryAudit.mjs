// CORE-PIPELINE-DECOMPOSITION-2 — decision-boundary audit.
//
// Verifies the decision-orchestrator decomposition holds:
//   - each extracted candidate family lives in its own module and is NOT
//     re-defined inside the orchestrator (bandDecision.ts);
//   - candidate-family and shared-kit modules do NOT import the orchestrator
//     (no cycle back into bandDecision.ts);
//   - the orchestrator imports the family builders (delegates, not owns);
//   - deterministic candidate id/tie-break primitives are owned by the shared
//     scoring kit, not re-implemented per family.
//
// Static source scan; no simulation is run.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const RULES = join(ROOT, "src/sim/rules");
const ORCHESTRATOR = join(RULES, "bandDecision.ts");
const orchestratorSrc = readFileSync(ORCHESTRATOR, "utf8");

// Extracted candidate families: module path + the builder(s) it must own.
const families = [
  { module: "candidates/visibleLandscapeCandidate.ts", builders: ["buildVisibleLandscapeProbeCandidate"] },
  { module: "candidates/resourceScoutCandidate.ts", builders: ["buildResourceScoutCandidate", "buildResourceScoutContext"] },
  { module: "candidates/pressureReliefCandidate.ts", builders: ["buildPressureReliefProbeCandidate"] },
];

// Shared-kit modules that must not import the orchestrator.
const sharedKit = [
  "decisionCandidateTypes.ts",
  "decisionScoring.ts",
  "decisionEdgeContext.ts",
  "decisionConstants.ts",
];

const importsOrchestrator = (src) =>
  /from\s+"(?:\.\.\/)*rules\/bandDecision"|from\s+"\.\.?\/bandDecision"|from\s+"\.\.\/\.\.\/rules\/bandDecision"/.test(src);

const results = { families: [], sharedKit: [] };

for (const family of families) {
  const path = join(RULES, family.module);
  const exists = existsSync(path);
  const src = exists ? readFileSync(path, "utf8") : "";
  const ownsBuilders = family.builders.every((b) => new RegExp(`export function ${b}\\b`).test(src));
  // The orchestrator must NOT still define the builder (only import it).
  const orchestratorNoLongerDefines = family.builders.every(
    (b) => !new RegExp(`^function ${b}\\b`, "m").test(orchestratorSrc));
  // The orchestrator must import from the family module.
  const orchestratorImports = new RegExp(`from\\s+"\\./${family.module.replace(/\.ts$/, "")}"`).test(orchestratorSrc);
  const familyNoCycle = !importsOrchestrator(src);
  results.families.push({
    module: family.module, exists, ownsBuilders, orchestratorNoLongerDefines,
    orchestratorImports, familyNoCycle,
  });
}

for (const mod of sharedKit) {
  const path = join(RULES, mod);
  const exists = existsSync(path);
  const src = exists ? readFileSync(path, "utf8") : "";
  results.sharedKit.push({ module: mod, exists, noCycle: !importsOrchestrator(src) });
}

// Deterministic candidate id / tie-break primitives are owned by the scoring kit.
const scoringSrc = existsSync(join(RULES, "decisionScoring.ts"))
  ? readFileSync(join(RULES, "decisionScoring.ts"), "utf8") : "";
const scoringOwnsTieBreak =
  /export function sortCandidatesWithSeededTieBreak\b/.test(scoringSrc) &&
  /export function compareCandidates\b/.test(scoringSrc) &&
  /export function makeDecisionId\b/.test(scoringSrc);

const checks = {
  allFamiliesExtracted: results.families.every((f) =>
    f.exists && f.ownsBuilders && f.orchestratorNoLongerDefines && f.orchestratorImports),
  noFamilyCycleBackToOrchestrator: results.families.every((f) => f.familyNoCycle),
  noSharedKitCycleBackToOrchestrator: results.sharedKit.every((m) => m.exists && m.noCycle),
  deterministicSelectionOwnedByScoringKit: scoringOwnsTieBreak,
  atLeastThreeFamiliesExtracted: results.families.filter((f) =>
    f.exists && f.ownsBuilders && f.orchestratorNoLongerDefines).length >= 3,
};
const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  check: "DECISION-BOUNDARY-1",
  verdict: pass ? "PASS" : "FAIL",
  checks,
  orchestratorLines: orchestratorSrc.split("\n").length,
  results,
}, null, 2));
if (!pass) process.exitCode = 1;
