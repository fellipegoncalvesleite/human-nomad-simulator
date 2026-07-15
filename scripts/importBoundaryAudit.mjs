// CORE-PIPELINE-CONSOLIDATION-1 — import boundary audit.
//
// Enforces the required dependency direction:
//   causal simulation state -> canonical facts -> UI/Chronicle/debug projections
// and forbids the reverse. Concretely:
//   - src/sim/** must NOT import from src/ui, src/render, src/store, or src/worker
//     (read models and rendering may never inject simulation behavior);
//   - reports UI -> deep-sim coupling (allowed direction) as informational;
//   - reports the src/sim internal import-cycle count as a maintenance signal.
//
// Static source scan only; no simulation is run.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SIM = join(ROOT, "src/sim");
const UI = join(ROOT, "src/ui");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const specs = [];
  const re = /(?:import|export)\s+(?:type\s+)?[^;]*?from\s+"([^"]+)"|import\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) specs.push(m[1] ?? m[2]);
  return specs;
}

const simFiles = walk(SIM);

// 1. Forbidden layer imports out of src/sim.
const forbiddenLayers = [/(^|\/)ui\//, /(^|\/)render\//, /(^|\/)worker\//, /(^|\/)store(\/|")/, /(^|\/)store$/];
const forbiddenLayerNames = ["ui", "render", "worker", "store"];
const simLayerViolations = [];
for (const file of simFiles) {
  for (const spec of importsOf(file)) {
    if (!spec.startsWith(".")) continue;
    const norm = spec.replace(/\\/g, "/");
    forbiddenLayerNames.forEach((layer) => {
      // a relative import that climbs out of sim into a sibling top-level layer
      if (new RegExp(`(^|/)${layer}(/|$)`).test(norm) && /\.\.\//.test(norm)) {
        simLayerViolations.push({ file: relative(ROOT, file), import: spec, layer });
      }
    });
  }
}

// 2. UI -> deep sim coupling (allowed direction, informational).
const uiFiles = walk(UI);
const uiDeepSimImports = {};
for (const file of uiFiles) {
  for (const spec of importsOf(file)) {
    const m = spec.match(/sim\/agents\/([a-zA-Z0-9]+)/);
    if (m) uiDeepSimImports[m[1]] = (uiDeepSimImports[m[1]] ?? 0) + 1;
  }
}
const uiDeepSimModuleCount = Object.keys(uiDeepSimImports).length;

// 3. Internal src/sim import-cycle count (maintenance signal, not a gate).
const graph = new Map();
for (const file of simFiles) {
  const key = relative(ROOT, file);
  const deps = [];
  for (const spec of importsOf(file)) {
    if (!spec.startsWith(".")) continue;
    const resolved = resolveRel(file, spec);
    if (resolved !== undefined) deps.push(relative(ROOT, resolved));
  }
  graph.set(key, deps);
}
const cycleCount = countCycleEdges(graph);

const checks = {
  simDoesNotImportUiRenderStoreWorker: simLayerViolations.length === 0,
};
const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  check: "IMPORT-BOUNDARY-1",
  verdict: pass ? "PASS" : "FAIL",
  checks,
  simFileCount: simFiles.length,
  uiFileCount: uiFiles.length,
  simLayerViolations,
  uiToDeepSimCoupling: {
    distinctSimAgentModulesImportedByUi: uiDeepSimModuleCount,
    topModules: Object.entries(uiDeepSimImports).sort((a, b) => b[1] - a[1]).slice(0, 15),
    note: "Allowed direction (UI reads sim). High count is maintenance coupling addressed incrementally, not a behavior-isolation violation.",
  },
  internalSimBackEdges: {
    count: cycleCount,
    note: "Informational: cyclic import edges among src/sim modules. Track that consolidation does not increase this, not that it is zero.",
  },
}, null, 2));
if (!pass) process.exitCode = 1;

function resolveRel(fromFile, spec) {
  const base = join(fromFile, "..", spec);
  for (const cand of [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
    try { if (statSync(cand).isFile()) return cand; } catch { /* not found */ }
  }
  return undefined;
}

function countCycleEdges(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...graph.keys()].map((k) => [k, WHITE]));
  let backEdges = 0;
  const stack = [];
  const visit = (node) => {
    color.set(node, GRAY);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (!graph.has(dep)) continue;
      const c = color.get(dep);
      if (c === GRAY) backEdges += 1;
      else if (c === WHITE) visit(dep);
    }
    stack.pop();
    color.set(node, BLACK);
  };
  for (const node of graph.keys()) if (color.get(node) === WHITE) visit(node);
  return backEdges;
}
