// CORE-PIPELINE-DECOMPOSITION-3 (Workstream B) — adaptation/invention boundary audit.
//
// Static: the adaptation subsystem is reached from outside ONLY through
// src/sim/agents/adaptationBoundary.ts (no production deep imports of
// adaptiveHuman / practicalResponses / adaptiveEfficacy), the canonical state is
// band.practicalAdaptation, and each effect reader has a single definition.
// Runtime: the lived problem -> experiment -> response -> real effect coefficient
// -> efficacy chain executes through the boundary, the boundary reads the SAME
// effect as the internal path (no duplicate/divergent application), and observer
// mode does not change adaptation state.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createServer } from "vite";

const ROOT = process.cwd();
const SIM = join(ROOT, "src/sim");
const ADAPTATION_INTERNALS = ["adaptiveHuman", "practicalResponses", "adaptiveEfficacy"];
// Only these may import the internals directly: the internals themselves and the
// public boundary. (Internal subsystem modules like problemPractice/practicalFragments/
// materialAffordance/inventionChain import each other freely.)
const INTERNAL_ADAPTATION_MODULES = new Set([
  "adaptiveHuman", "practicalResponses", "adaptiveEfficacy", "problemPractice",
  "practicalFragments", "materialAffordance", "inventionChain", "practiceFeedbackReadiness",
  "adaptiveEfficacy", "adaptationBoundary",
]);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}
function moduleBaseName(file) { return file.replace(/^.*\//, "").replace(/\.tsx?$/, ""); }

const simFiles = walk(SIM);
const unauthorizedDeepImports = [];
for (const file of simFiles) {
  const base = moduleBaseName(file);
  if (INTERNAL_ADAPTATION_MODULES.has(base)) continue; // internals + boundary may import internals
  const src = readFileSync(file, "utf8");
  for (const internal of ADAPTATION_INTERNALS) {
    // Match ANY import whose final path segment is the internal module — sibling
    // "./practicalResponses", "../agents/practicalResponses", bare, etc. The
    // earlier "[^"]*agents/" form had a blind spot: sibling imports from OTHER
    // agents/ modules (e.g. "./practicalResponses") have no "agents/" in the path
    // and slipped through. The trailing '"' pins the module name to the segment
    // end so "./adaptiveHumanExtra" does not match.
    if (new RegExp(`from\\s+"(?:[^"]*/)?${internal}"`).test(src)) {
      unauthorizedDeepImports.push({ file: relative(ROOT, file), imports: internal });
    }
  }
}

// The boundary must exist and re-export the sanctioned operations.
const boundarySrc = readFileSync(join(SIM, "agents/adaptationBoundary.ts"), "utf8");
const boundaryExports = [
  "advancePracticalAdaptation", "advanceAdaptiveHumanState", "deriveAdaptiveDecisionSupport",
  "selectAdaptiveInfluenceForAction", "deriveCarryingCondition", "deriveWaterRouteCondition",
  "deriveWaterStorageCondition", "deriveEffectiveStorageCapacity", "inheritPracticalAdaptationForDaughter",
  "inheritAdaptiveHumanForDaughter", "deriveAdaptiveHumanProfile", "evaluateCarryingEfficacy",
  // the per-system reliefs the physical agent modules consume (must all be surfaced
  // so those modules never need a direct internal import):
  "deriveCareTreatmentRelief", "deriveShelterExposureRelief", "deriveShelterPortabilityBurden",
  "deriveHuntingSafetyRelief", "deriveWaterWorksRelief", "deriveCarryingRelief",
  "deriveCarriedWaterRelief", "deriveDryRouteWaterRelief", "deriveEngineeringSafetyRelief",
];
const boundaryExposesAll = boundaryExports.every((name) => new RegExp(`\\b${name}\\b`).test(boundarySrc));

// Barrel guard: the curated boundary must expose FEWER named operations than the
// internal cluster defines (no `export *`, no re-export-everything). Count named
// exports on the boundary vs named `export function`/`export const`/`export class`
// definitions across the internal modules.
const boundaryNamedExportCount = (boundarySrc.match(/\bexport\s+(?:function|const|class|type)\s+\w|\bexport\s*\{[^}]*\}/g) ?? [])
  .reduce((total, chunk) => total + (chunk.startsWith("export {") ? (chunk.match(/\b\w+\b/g)?.length ?? 1) - 1 : 1), 0);
// A real barrel re-export is `export * from "..."` (optionally `export * as ns from`);
// require the `from` so the phrase "export *" inside this file's own doc comment
// does not false-positive.
const boundaryUsesStarReexport = /export\s+\*(?:\s+as\s+\w+)?\s+from/.test(boundarySrc);
let internalDefinitionCount = 0;
for (const file of simFiles) {
  const base = moduleBaseName(file);
  if (!INTERNAL_ADAPTATION_MODULES.has(base) || base === "adaptationBoundary") continue;
  internalDefinitionCount += (readFileSync(file, "utf8").match(/^export\s+(?:function|const|class)\s+\w+/gm) ?? []).length;
}
const boundaryIsCuratedNotBarrel = !boundaryUsesStarReexport && boundaryNamedExportCount < internalDefinitionCount;

// Each effect reader is defined exactly once (single effect boundary).
const effectReaders = ["deriveCarryingCondition", "deriveWaterRouteCondition", "deriveWaterStorageCondition"];
const singleEffectDefinition = effectReaders.every((name) => {
  const defs = simFiles.filter((f) => new RegExp(`export function ${name}\\b`).test(readFileSync(f, "utf8")));
  return defs.length === 1 && moduleBaseName(defs[0]) === "practicalResponses";
});

const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});
let runtime;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const boundary = await server.ssrLoadModule("/sim/agents/adaptationBoundary.ts");
  const internal = await server.ssrLoadModule("/sim/agents/practicalResponses.ts");

  // Run the default map long enough for the adaptation chain to execute.
  let world = runner.initSimWorld({ kind: "map1" }, "adaptation-boundary");
  world = runner.stepSim(world, 40 * 4, "seasonal");

  // Causal chain: find bands whose practical adaptation advanced through the chain.
  const bands = Object.values(world.bands);
  let problemsFormed = 0, experimentsRun = 0, responsesFormed = 0, effectCoefficientActive = 0, efficacyEvaluated = 0;
  let boundaryMatchesInternal = true;
  for (const band of bands) {
    const pa = band.practicalAdaptation;
    if (pa === undefined) continue;
    if ((pa.problems ?? pa.fragments ?? []).length > 0) problemsFormed += 1;
    if ((pa.experiments ?? []).some((e) => (e.attemptSeasons ?? 0) > 0)) experimentsRun += 1;
    if ((pa.responses ?? []).length > 0) responsesFormed += 1;
    if ((pa.responses ?? []).some((r) => r.lastEfficacy !== undefined)) efficacyEvaluated += 1;
    // Effect coefficient read through the boundary must equal the internal path.
    const viaBoundary = boundary.deriveCarryingCondition(band);
    const viaInternal = internal.deriveCarryingCondition(band);
    if (viaBoundary !== viaInternal) boundaryMatchesInternal = false;
    if (viaBoundary > 0 || boundary.deriveWaterRouteCondition(band) > 0 || boundary.deriveWaterStorageCondition(band) > 0) {
      effectCoefficientActive += 1;
    }
  }

  // Observer parity for adaptation state: an observer must not change adaptation.
  const initial = runner.initSimWorld({ kind: "map1" }, "adaptation-boundary:obs");
  const paFp = (w) => hash(Object.values(w.bands).map((b) => b.practicalAdaptation ?? null).sort());
  const plain = runner.stepSim(initial, 25 * 4, "seasonal");
  const observed = runner.stepSim(initial, 25 * 4, "seasonal", () => {});
  const adaptationObserverParity = paFp(plain) === paFp(observed);

  runtime = {
    problemsFormed, experimentsRun, responsesFormed, effectCoefficientActive, efficacyEvaluated,
    boundaryMatchesInternal, adaptationObserverParity,
  };
} finally {
  await server.close();
}

const checks = {
  noUnauthorizedDeepImports: unauthorizedDeepImports.length === 0,
  boundaryExposesSanctionedOps: boundaryExposesAll,
  boundaryIsCuratedNotBarrel,
  singleEffectDefinitionInPracticalResponses: singleEffectDefinition,
  boundaryEffectMatchesInternalNoDuplicate: runtime.boundaryMatchesInternal,
  livedProblemToExperimentToResponseChainExecutes:
    runtime.experimentsRun > 0 && runtime.responsesFormed > 0,
  responsesProduceRealEffectCoefficient: runtime.effectCoefficientActive > 0,
  efficacyEvaluated: runtime.efficacyEvaluated > 0,
  adaptationObserverParity: runtime.adaptationObserverParity,
};
const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  check: "ADAPTATION-BOUNDARY-1",
  verdict: pass ? "PASS" : "FAIL",
  checks,
  canonicalState: "band.practicalAdaptation",
  publicBoundary: "src/sim/agents/adaptationBoundary.ts",
  boundaryNamedExportCount,
  internalDefinitionCount,
  effectBoundary: "practicalResponses.ts (derive*Condition / storage readers)",
  advanceWriters: ["advancePracticalAdaptation", "advanceAdaptiveHumanState"],
  inheritance: "inheritPracticalAdaptationForDaughter (fission)",
  allowlist: "internal adaptation modules + adaptationBoundary.ts may import internals; production callers (bandDecision, demography) use the boundary",
  unauthorizedDeepImports,
  runtime,
}, null, 2));
if (!pass) process.exitCode = 1;

function hash(v) { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }
