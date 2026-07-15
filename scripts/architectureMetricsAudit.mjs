// CORE-PIPELINE-CONSOLIDATION-1 — architecture metrics audit.
//
// Quantifies the maintainability hypotheses so a follow-up decomposition
// (DECOMPOSITION-2) starts from measured evidence rather than assertion:
//   B — decision orchestrator fan-out and size (bandDecision.ts);
//   C — adaptation subsystem module count and external coupling;
//   E — full context-cache rebuilds per season tick (static, from advance.ts);
//   F — hot vs cold band state: how much of a serialized band is history/record
//       state vs core causal state.
//
// Static source metrics + one short runtime sample. No production behavior.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";

const ROOT = process.cwd();
const SIM_AGENTS = join(ROOT, "src/sim/agents");

function lines(file) { return readFileSync(file, "utf8").split("\n").length; }
function importModules(file) {
  const src = readFileSync(file, "utf8");
  const set = new Set();
  const re = /(?:import|export)\s+(?:type\s+)?[^;]*?from\s+"([^"]+)"/g;
  let m; while ((m = re.exec(src)) !== null) set.add(m[1]);
  return set;
}
function countMatches(file, re) { return (readFileSync(file, "utf8").match(re) ?? []).length; }
function externalImporters(moduleName) {
  // count files across src that import src/sim/agents/<moduleName>, excluding itself
  const roots = [join(ROOT, "src")];
  let count = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !full.endsWith(`agents/${moduleName}.ts`)) {
        if (new RegExp(`from "[^"]*agents/${moduleName}"`).test(readFileSync(full, "utf8"))) count += 1;
      }
    }
  };
  roots.forEach(walk);
  return count;
}

// B — decision orchestrator.
const bandDecision = join(ROOT, "src/sim/rules/bandDecision.ts");
const decisionMetrics = {
  lines: lines(bandDecision),
  distinctImportedModules: importModules(bandDecision).size,
  internalFunctionCount: countMatches(bandDecision, /^(export )?function |^\s*const [a-zA-Z0-9]+ = \(/gm),
  exportedSymbols: countMatches(bandDecision, /^export (function|const|interface|type) /gm),
};

// C — adaptation subsystem.
const adaptationModules = [
  "problemPractice", "practicalFragments", "materialAffordance", "adaptiveHuman",
  "practicalResponses", "adaptiveEfficacy", "inventionChain", "practiceFeedbackReadiness",
  "knowledgeEcology", "knowledgeCarriers", "patchExploitationKnowledge", "foragingAdaptation",
];
const adaptation = adaptationModules.map((m) => {
  const file = join(SIM_AGENTS, `${m}.ts`);
  let l = 0; try { l = lines(file); } catch { l = -1; }
  return { module: m, lines: l, externalImporters: l >= 0 ? externalImporters(m) : -1 };
}).filter((x) => x.lines >= 0);

// E — context rebuilds per season tick (static count in advance.ts).
const advance = readFileSync(join(ROOT, "src/sim/tick/advance.ts"), "utf8");
const contextRebuildsPerTick = (advance.match(/buildTickContextCache\(/g) ?? []).length;

const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});
let hotCold;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  let world = runner.initSimWorld({ kind: "map1" }, "arch-metrics");
  world = runner.stepSim(world, 100 * 4, "seasonal"); // 100y to accumulate history
  const band = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  // Classify top-level band fields as cold (history/record/projection) vs core.
  const COLD = /history|chronicle|archive|record|deepHistory|events|reported|publicStory|referent|fissionEvents|decisionArchive|experiments|responses|memoryCompression|traces|log/i;
  const sizes = {};
  for (const k of Object.keys(band)) sizes[k] = JSON.stringify(band[k] ?? null).length;
  const total = Object.values(sizes).reduce((s, v) => s + v, 0);
  const cold = Object.entries(sizes).filter(([k]) => COLD.test(k)).reduce((s, [, v]) => s + v, 0);
  hotCold = {
    sampleBand: band.id,
    serializedBandBytes: total,
    approxColdBytes: cold,
    approxColdShare: Number((cold / Math.max(1, total)).toFixed(3)),
    largestFields: Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
} finally {
  await server.close();
}

const report = {
  check: "ARCHITECTURE-METRICS-1",
  verdict: "REPORT", // measurement audit, informational (no gate)
  hypothesisB_decisionOrchestrator: decisionMetrics,
  hypothesisC_adaptationSubsystem: {
    modules: adaptation,
    totalModules: adaptation.length,
    totalLines: adaptation.reduce((s, m) => s + m.lines, 0),
    note: "External importers are mostly UI read models plus a few sim orchestration points; the effect-application boundary is practicalResponses.ts and the state authority is band.practicalAdaptation.",
  },
  hypothesisE_contextRebuildsPerSeasonTick: contextRebuildsPerTick,
  hypothesisF_hotColdState: hotCold,
  interpretation: {
    B: `bandDecision.ts is ${decisionMetrics.lines} lines with ${decisionMetrics.distinctImportedModules} imported modules and ~${decisionMetrics.internalFunctionCount} internal functions but only ${decisionMetrics.exportedSymbols} exported symbols — a large orchestrator embedding domain logic. Decomposition is real maintainability debt; deferred to DECOMPOSITION-2 (parity-risky, out of scope for a single safe pass).`,
    E: `${contextRebuildsPerTick} full context-cache rebuilds per season tick. A measured cache-layering pass belongs to DECOMPOSITION-2.`,
    F: hotCold ? `~${(hotCold.approxColdShare * 100).toFixed(0)}% of a serialized band is history/record/projection state; a hot/cold split is measured but deferred (state migration is risky and not the smallest correct change here).` : "n/a",
  },
};
console.log(JSON.stringify(report, null, 2));
