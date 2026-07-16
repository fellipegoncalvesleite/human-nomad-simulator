# AGENTS.md — Durable Operational Context

> **Required reading before repository work.**
>
> This file is the model-neutral operational entry point for `fellipegoncalvesleite/human-nomad-simulator`.
> It exists to prevent every coding agent from rediscovering the repository from scratch.
>
> **Code overrides stale documentation.** When this file, `CLAUDE.md`, a handoff, a report, a README section, a commit message, or a roadmap disagrees with current production code, current code wins. Current audits and type/graph metadata come next.
>
> Deeper architectural explanations, checkpoint history, the implemented demographic-persistence checkpoint, audit meanings, and Claude-specific workflow are in [`CLAUDE.md`](./CLAUDE.md).

---

## 0. Freshness and evidence warning

```text
Last verified against: branch checkpoint/core-pipeline-consolidation-1, branched from accepted tip f93290882c8788127f34baf693b6fd92714923f0 (persistence-2). main (30a87b3, tree 93be87e) does NOT contain the demographic work (tree 597c1e0); accepted linear history is 30a87b3 → ed16dfe → f932908. Final consolidation commit hash is recorded in the checkpoint report.
Checkpoint commit message: checkpoint: core pipeline consolidation progress
Backup branch: checkpoint/all-map-ecology-f33bebc — CONFIRMED, remote tip f33bebc23ecc21b971c98b48b31ca8bbfa9d2209 matches exactly
Last updated: 2026-07-15 (DECOMPOSITION-3: adaptation public boundary + context lifecycle 4→2 done; core pipeline consolidation complete)
Current active checkpoint: EXPEDITIONARY LOGISTICAL MOBILITY / TASK CAMPS / VIEWSHED PERCEPTION / FIRE SIGNALS-1. Core pipeline consolidation is COMPLETE: Workstream A (decision decomposition — shared candidate contract/scoring/edge-context + 3 candidate families in rules/candidates/*), Workstream B (adaptation public boundary: src/sim/agents/adaptationBoundary.ts is the ONE sanctioned entry — production must NOT deep-import adaptiveHuman/practicalResponses/adaptiveEfficacy; canonical state band.practicalAdaptation, effect boundary practicalResponses.ts), and Workstream C (context lifecycle: 2 full buildTickContextCache rebuilds/tick + 1 partial refresh via deriveFinalReadModelContext, down from ~4). All with exact fingerprint parity. Decision-orchestration entry: rules/bandDecision.ts (evaluate/applyBandDecision, buildDecisionCandidates).
Current status: demographic persistence complete (persistence-1 + persistence-2 PASS). Consolidation-1 PROVED the two correctness hypotheses already sound — the season is physically/causally order-invariant (only a non-causal decision-history archive reflects processing order; seasonOrderInvarianceAudit.mjs PASS) and src/sim imports nothing from ui/render/store/worker so read models cannot inject behavior (importBoundaryAudit.mjs PASS). Added an audit-only byte-identical season-order hook + an explicit season phase contract; measured and DEFERRED the bandDecision.ts (7238 lines) decomposition, the adaptation public-interface formalization, context-cache layering (4 rebuilds/tick), and the ~39% cold band state to DECOMPOSITION-2. Zero production behavior change; deterministic benchmark fingerprint unchanged. See docs/HANDOFF.md and CLAUDE.md architecture inventory.
Known stale or unverified sections: repository paths, production order, season phase contract, order-invariance, import boundaries, demographic formulas, and the named regression matrix were executed and verified; the DECOMPOSITION-2 targets (decision/adaptation internals) are measured but not yet restructured; deep historical claims elsewhere in CLAUDE.md §7–9/§12–15 remain a navigational map rather than a fresh line-by-line inventory
```

This file was originally drafted without GitHub or filesystem access; a repository-enabled verification pass ran on 2026-07-14 (see Appendix A of CLAUDE.md) and replaced the markers in §4, §5, and §8 below with evidence read directly from the checked-out code. Sections not explicitly marked VERIFIED in this pass should still be treated with the same caution the original draft asked for.

### Status vocabulary

- **VERIFIED CURRENT** — directly supported by current production code in the checked-out revision.
- **SUPPORTED BY AUDIT** — enforced or demonstrated by an existing audit; state whether it was executed now or only reported at an accepted checkpoint.
- **PARTIAL** — implemented but incomplete, shallow, or weakly connected.
- **LEGACY/INERT** — still present but not authoritative or behaviorally active.
- **PLANNED** — roadmap only.
- **UNCERTAIN** — insufficient evidence; verify before treating as fact.

Current checkpoint claims marked verified are backed by the executed command matrix recorded in `CLAUDE.md` and `docs/HANDOFF.md`.

---

## 1. Fast project summary

The project is a deterministic TypeScript/React simulation of mobile human bands and the long causal emergence of civilization. Bands interact with terrain, water, plant patches, fauna, aquatic resources, seasonal change, uncertain knowledge, labor, care burden, sickness, memory, movement, and demographic pressure.

The simulation must not unlock predefined civilization stages or manufacture history from detached narrative tables. Its intended causal direction is:

```text
ecology
→ knowledge
→ risk, labor and physical return
→ memory
→ movement and demography
→ culture and settlement
→ history and civilization
```

The long-term objective is to produce distinctive, historically legible worlds whose routes, adaptations, identities, norms, exchanges, conflicts, settlements, technologies, institutions, and myths arise from simulated conditions rather than authored sequences.

Demographic persistence is now an implemented architecture: current/recent/chronic food observations feed one ordinary nutrition pressure plus a nonlinear severe-chronic hazard, instead of several correlated full penalties. SEPARATION-2 additionally closed a residual food→fertility path through death memory — death-memory severity now reads actual experienced losses only, so food no longer suppresses fertility a second time by being copied into bereavement severity; it reaches death memory only through the real deaths it causes. Controlled healthy and moderate bands replace ordinary losses; severe zero-food cases still become extinct. Default-world contraction remains because physical food is often inaccessible within same-day local activity range, so consolidation (then expeditionary logistics) is the next blocker rather than a reason to inflate local food.

Technology, exact package versions, current directory structure, and public setup instructions are **UNCERTAIN until `package.json`, TypeScript configuration, build configuration, and production entry points are inspected**.

---

## 2. Current canonical repository state

```text
Last verified against:
  FOOD–DEMOGRAPHY checkpoint tree on checkpoint/food-demography-persistence-1
  parent 30a87b3aab96dc9b6276a5e148458ad9772770e0
  final hash is recorded in the checkpoint report

Backup checkpoint supplied:
  branch: checkpoint/all-map-ecology-f33bebc
  expected tip: f33bebc23ecc21b971c98b48b31ca8bbfa9d2209

Implemented checkpoint:
  FOOD–DEMOGRAPHY SEPARATION / DEMOGRAPHIC PERSISTENCE-1 — PASS
  FOOD–DEMOGRAPHY SEPARATION / DEMOGRAPHIC PERSISTENCE-2 — PASS
  (residual death-memory food path closed; demographic persistence complete)

Current blocker:
  Default bands often cannot turn physical world support into usable receipts
  within local same-day activity range; no conversion, loss, eligibility, or
  ledger defect was found. This belongs to expeditionary logistics, which now
  follows the consolidation checkpoint rather than coming next.

Current active roadmap item:
  CORE PIPELINE CONSOLIDATION / SEASON RESOLUTION /
  DECISION ORCHESTRATION DECOMPOSITION-1
```

Before any implementation, resolve and report:

1. actual current branch;
2. actual `HEAD`;
3. commit subject;
4. `git status --short`;
5. whether the expected backup branch exists;
6. whether local or remote state differs from this draft.

Never edit `main` directly unless the user explicitly changes the branch policy.

---

## 3. Read order for agents

Use this token-efficient sequence:

1. Read this `AGENTS.md`.
2. Read only the relevant sections of [`CLAUDE.md`](./CLAUDE.md).
3. Inspect current Git branch, `HEAD`, and working-tree status.
4. Open the focused code paths named by the relevant architecture section.
5. Inspect the relevant audits, fixtures, type definitions, and graph metadata.
6. Broaden repository reading only when the evidence requires it.

> **Do not begin every task by rereading the entire repository.**

For demographic architecture or the next checkpoint, start with:

- `CLAUDE.md` §10 — implemented persistence model and remaining blocker;
- §11 — completed checkpoint specification and evidence;
- §8 — Living ecology, food/nutrition, demography, movement;
- §17 — Audit and verification guide;
- the current simulation runner;
- the physical-return and food-support pipeline;
- nutrition history and demographic update code;
- deterministic benchmark and relevant controlled audits.

---

## 4. Repository map — VERIFIED CURRENT (2026-07-14)

| Area | Responsibility | Key paths | Authoritative? |
| --- | --- | --- | --- |
| Application and UI | React entry, controls, map rendering, inspectors, selected-band panels, debug projections | `src/main.tsx` → `src/ui/Root.tsx`/`App.tsx`; `src/ui/band/` per-topic panels | UI is projection-only; confirmed via `takeSelectedBandPanelProjection` etc. in `simRunner.ts` being read-only derivations |
| World construction / step loop | `initSimWorld`, `stepSim`, snapshot/overlay projections — shared by worker and node benchmark | `src/sim/runner/simRunner.ts` | Wrapper only — **not** the tick order (see next row) |
| Actual tick order | Season/day progression, the full causal sequence | `src/sim/tick/advance.ts` (`advanceWorldByDays`/`runSeasonalCompatibilityTick`), `time.ts` | THE causal coordinator — see §5 |
| World generation | Terrain, elevation, hydrography, passability, procedural map construction | `src/sim/world/generate.ts`, `hydrography.ts`, `passability.ts`, `seasonal.ts`, `mapEdits.ts` | Physical world truth |
| Band agents | Band state, perception, decisions, activity parties, mobility, local memory — ~90 files | `src/sim/agents/` | Behavioral authority only where reads use perceived state |
| Rules | Seasonal decision scoring/application, mobility candidates, decision archive | `src/sim/rules/bandDecision.ts`, `mobilityIntent.ts`, `decisionArchive.ts` | Smaller than expected — most domain logic actually lives in `agents/`, not here |
| Living ecology | Plant patches, fauna stocks, depletion/recovery, forest patches | `src/sim/world/depletion.ts`, `agents/faunaStock.ts`, `agents/plantStock.ts`, `agents/forestPatches.ts` — all called from the END of the tick (§5) | Physical ecology, authoritative for harvest |
| Knowledge and memory | Known tiles, resource knowledge, place/corridor/crossing memory | `src/sim/agents/` (`memory.ts`, `resourceKnowledge.ts`, `frontierKnowledge.ts`, `crossingPractice.ts`, etc.) | Must remain distinct from hidden world truth |
| Food support | Converts explicit physical nutritional receipts into human support | `src/sim/agents/humanFoodSupport.ts` — exports `HARVEST_TO_SUPPORT_SCALE=100`, `deriveHumanFoodSupportLedger` | Confirmed canonical aggregator |
| Nutrition | Current/recent/chronic nutrition state | `src/sim/agents/seasonalSurvival.ts` (`deriveCanonicalNutritionState`) | Confirmed by name in the real food-demography spec |
| Demography and lifecycle | Cohorts, bounded sign-gated net-rate accumulators, gross churn projection, death memory, viability, terminal extinction | `src/sim/agents/demography.ts` (`deriveFoodDemographyRateTerms`, `deriveDeathMemorySeverityTerms`, `advanceDeathMemory`, `updateBandsDemographyAndFission`, `updateBandDemography`), `agents/viability.ts` | Food has one ordinary pressure plus a nonlinear severe-chronic hazard; **death-memory severity reads actual losses only (SEPARATION-2), not current food/water stress**; age cohorts remain reconciled rather than causally reproductive, see CLAUDE.md §§10–11 |
| Chronicle/history | Historical events, archival records, deep-history observation | `src/sim/agents/bandChronicle.ts`, `bandHistory.ts`, `bandEvents.ts`, `applyBandDeepHistoryContext` (called from `tick/advance.ts`, spring-gated yearly) | Per the causal-agency diagnostic (CLAUDE.md §9), Chronicle-adjacent modules are largely UI/story-only, not decision-read |
| Audits and benchmarks | Controlled fixtures, invariant checks, deterministic benchmark, graph checks | `scripts/` — see §8 below for the exact file/flag list; no separate test framework | Evidence only for the path/invariant actually exercised |
| Graph/architecture metadata | Hand-maintained dependency/causal graph + integrity check | `src/architecture/graphData.ts` (NODES/LINKS), checked by `scripts/checkGraph.mjs` (asserts 0 dup ids, 0 dangling links via Vite SSR) | Supports architecture checks; not production authority |
| Documentation | README, `CLAUDE.md`, `AGENTS.md`, and `docs/HANDOFF.md` are **tracked** (committed with each checkpoint); PRODUCT.md/DESIGN.md and `docs/superpowers/` are gitignored local notes | repository root, `docs/` | Secondary to code and current audits. **Correction (FOOD-DEMOGRAPHY-SEPARATION-2, 2026-07-14):** `CLAUDE.md`/`AGENTS.md` were removed from `.gitignore` in the persistence-1 commit and are tracked; `docs/HANDOFF.md` is tracked and present (~7900 lines). Only `docs/CAUSAL_AGENCY_DIAGNOSTIC.md` and `docs/superpowers/` are absent/ignored. The `.gitignore` still lists a `**/HANDOFF.md` pattern, but the already-tracked `docs/HANDOFF.md` overrides it. |

Areas the original draft's likely-path guess **missed entirely**: `src/architecture/` (graph viz), `src/render/` (canvas rendering), `src/worker/` (`simWorker.ts`, the browser Web Worker), `src/store.ts` (top-level zustand store), and `src/sim/tick/` as a distinct area from `src/sim/runner/`.

---

## 5. Runtime causal order

### Production order — VERIFIED CURRENT, read from `src/sim/tick/advance.ts` (2026-07-14)

**Ecology advances at the END of the season, not the start** — this corrects the original draft's guess:

```text
world/scenario initialization (simRunner.ts: initSimWorld)
→ daily actions for the season's elapsed days (intraSeasonTrips.runDailyActions)
→ season boundary reached → runSeasonalCompatibilityTick:
  → build pre-decision context cache
  → update band context/readability state (projection-only, UI-read; see CLAUDE.md §9)
  → apply acute risk context
  → PER BAND (deterministic id order): evaluate decision → apply decision
    (this is where movement/activity resolution and the food-ledger/nutrition
    read actually happen, inside bandDecision.ts's own context building —
    NOT a separate top-level tick phase)
  → post-decision context: range saturation, encounter context
  → demography + fission resolve
  → viability/terminal extinction resolve
  → deep-history observation (spring-gated, yearly; after this year's
    fissions/deaths, before ecology)
  → physical ecology advances: tile depletion → fauna stocks → plant
    patches → forest patches
  → final context pass
```

A band's season-N decision reads ecology as it stood at the end of season N-1; ecology then advances at the end of season N based on that decision's pressure. See CLAUDE.md §5.3 for full detail and file:line references.

### Ordering invariants

These are non-negotiable even if exact function names differ:

1. Physical returns must exist before they can support nutrition.
2. Nutrition must be based on physical receipts, not habitat potential or map richness.
3. Nutrition and health consequences must precede the demographic consequences attributed to them.
4. Residential movement outcome must not be conflated with logistical activity travel.
5. Terminal extinction must prevent further living behavior and further mutation of archived living state.
6. Rendering and inspectors must not mutate world knowledge, band knowledge, ecology, or history.
7. Debug truth may expose hidden state but must never leak into behavioral decisions.
8. Diagnostics must be opt-in, runner-supplied, non-persistent, and byte-identical when disabled.

See `CLAUDE.md` §5 for the detailed lifecycle and verification checklist.

---

## 6. Source-of-truth summary

| Concept | Authority | Must not be replaced by |
| --- | --- | --- |
| Habitat potential | Terrain/hydrography/biome-derived environmental capacity or suitability | Current edible stock, current harvest, UI richness, or guaranteed calories |
| Current ecology | Physical plant patches, fauna stocks, aquatic stocks, depletion and recovery state | Static habitat scores, discovery flags, narrative labels, or band belief |
| Band knowledge | Observations, known tiles, resource memories, place/corridor/crossing memory, confidence and staleness | Hidden world truth or technical map projections |
| Food receipt | Explicit physical return produced by an executed activity or trip | Generic catchment yield, habitat potential, discovery, or UI opportunity |
| Human food support | Accepted checkpoint report identifies `humanFoodSupport.ts` as canonical aggregator; exact path requires verification | Duplicate support calculations in UI, demography, or map projection |
| Nutrition | Current/recent/chronic nutritional state derived from physical support and demand | Static richness, known-resource count, or a narrative stress label |
| Movement intent | Band decision state such as stay/scout/move, based on perceived information | Direct teleport, debug selection, or post-hoc narrative |
| Residential outcome | Accepted/delayed/diverted/rejected physical move result and updated anchor | Intent alone, logistical activity travel, or UI status |
| Population | Authoritative band population/cohort state and demographic accumulators | Display counts, Chronicle prose, or viability labels |
| Extinction | Terminal lifecycle state that freezes living behavior and archives history | Merely reaching zero in one projection while other reducers continue |
| UI status | Derived projection from current authoritative state | New hidden simulation authority or fake completion |
| Chronicle/history | Grounded record of simulated events | Detached event generator or unsupported flavor text |

---

## 7. Non-negotiable rules

### 7.1 Causal systems

A system is not complete because state exists, a card displays it, a sentence mentions it, or an audit confirms object creation. Require:

```text
cause
→ state change
→ behavioral decision
→ physical result
→ memory/history
→ future behavior
```

### 7.2 No decorative completion

Reject projection-only mechanics presented as simulation, fake statuses, write-only state, read-only state with no physical writer, detached content packs, unsupported narrative, and adaptations with no outcome effect.

### 7.3 Human resilience

Viable or marginal bands should bend before they break through grounded options already implemented: diet broadening, labor reallocation, care, rest, repair, observation, route use, adaptation, invention use, activity change, relocation, or social buffering when available. Extinction remains possible after relevant pathways fail.

### 7.4 Anti-omniscience

Behavior may use observations, known tiles, memory, signs, uncertainty, and transmitted knowledge where implemented. It must not read hidden world truth. Debug projections may show exact truth only if behaviorally isolated.

### 7.5 Physical ecology and food

Humans do not eat static richness, habitat potential, generic yield, discoveries, debug overlays, or hidden resources. Nutrition must come from executed physical activities and explicit physical nutritional receipts.

### 7.6 Determinism

Do not introduce `Math.random`, wall-clock time, unstable iteration, rendering side effects, or uncontrolled nondeterminism. Use the repository’s deterministic seed/hash/event mechanisms.

### 7.7 Bounded state and performance

Avoid unbounded histories, all-pairs scans, full-map work per band per frame, individual agents where aggregate stocks suffice, projection recomputation on every render, and uncontrolled cache growth.

### 7.8 Honest PASS/FAIL

Do not weaken gates to manufacture PASS. Compiler/build success is not behavioral completion. State exactly which invariant was exercised and whether the result was executed now or merely reported previously.

### 7.9 Architecture autonomy

Implementation prompts should specify the problem, evidence, constraints, causal goal, and pass gate. They should not prescribe an unverified patch architecture.

### 7.10 Git discipline

Accepted checkpoint work ends in an explicit commit. Inspect the diff, exclude generated output, run relevant checks, run `git diff --check`, report clean-tree status, and do not push unless asked.

---

## 8. Commands

### Commands — VERIFIED CURRENT against `package.json` and `scripts/` (2026-07-14)

| Purpose | Command | Verified |
| --- | --- | --- |
| Install dependencies | `npm install` | package manager confirmed npm via `package-lock.json` |
| Development server | `npm run dev` (→ `vite`) | confirmed in `package.json` |
| Production build | `npm run build` (→ `tsc -p tsconfig.json && tsc -p tsconfig.node.json && vite build`) | confirmed |
| Preview built app | `npm run preview` (→ `vite preview`) | confirmed |
| Typecheck only | `npx tsc -p tsconfig.json --noEmit` | confirmed, tsconfig exists |
| Benchmark script syntax | `node --check scripts/simBenchmark.mjs` | file exists |
| Deterministic benchmark | `npm run sim:benchmark -- --deterministic` (→ `node scripts/simBenchmark.mjs`) | executed in the demographic-persistence checkpoint |
| Graph integrity check | `node scripts/checkGraph.mjs` | confirmed — asserts 0 duplicate node ids, 0 dangling links in `src/architecture/graphData.ts` via Vite SSR |

No `test` script exists — verification is entirely the audit scripts below plus `sim:benchmark`.

### Standalone audit scripts (`node scripts/<file>.mjs`) — file list VERIFIED CURRENT

| Purpose | File |
| --- | --- |
| Canonical food-pipeline audit | `livingEcologyFoodPipelineAudit.mjs` |
| Trophic-coupling audit | `livingEcologyTrophicAudit.mjs`, `livingEcologyTrophicCoupling1bFocusedAudit.mjs` |
| Living-ecology world audit | `livingEcologyWorldAudit.mjs` |
| All-map ecology audit | `allMapLivingEcologyAudit.mjs` |
| Demographic-renewal/persistence audit | `demographicRenewalAudit.mjs` |
| Hardship-outcome audit | `postEcologyHardshipOutcomeAudit.mjs` |
| Terminal-extinction audit | `postEcologyTerminalExtinctionAudit.mjs` |
| Return-kind audit | `postEcologyReturnKindAudit.mjs` |
| Dynamic-snapshot parity audit | `dynamicSnapshotEcologyParityAudit.mjs` |
| Catchment invariants | `catchmentInvariants.mjs` |
| Food/demography arithmetic, 2×2, parity, waterfall, Stage-0 ledger (incl. death-memory paths) | `foodDemographySeparationAudit.mjs` |
| Controlled healthy/moderate/marginal/nonviable persistence | `demographicPersistenceAudit.mjs` |
| Map/single-origin/no-human long runs, repeated fingerprints, decline-cap exposure | `demographicLongRunAudit.mjs` |
| Residual death-memory path isolation (R0–R5), 0.002 baseline on/off, diagnostics-off parity | `demographicDeathMemoryPathAudit.mjs` |
| Season band-order invariance (physical/causal state identical under ascending/descending/permuted order) | `seasonOrderInvarianceAudit.mjs` |
| Import boundaries (src/sim must not import ui/render/store/worker; read-model isolation) | `importBoundaryAudit.mjs` |
| Architecture metrics (decision fan-out, adaptation coupling, context rebuilds/tick, hot/cold band state) — informational | `architectureMetricsAudit.mjs` |
| Decision-boundary (candidate families extracted to own modules; no family/shared-kit cycle back to orchestrator) | `decisionBoundaryAudit.mjs` |
| Adaptation public boundary (adaptationBoundary.ts is the ONE entry; no unauthorized deep imports incl. sibling `./`; curated-not-barrel; single effect definition; boundary effect == internal; full causal chain; observer parity) | `adaptationBoundaryAudit.mjs` |
| Context lifecycle (≤2 full buildTickContextCache rebuilds/tick + partial refresh; partial byte-identical to forced full rebuild = no stale reads; deterministic; observer + season-order invariant) | `contextLifecycleAudit.mjs` |

### `simBenchmark.mjs --targeted-*` flags — exact flag names VERIFIED CURRENT (grepped from `scripts/simBenchmark.mjs`; ~120 total, most relevant to the draft's named audits below)

| Purpose | Flag |
| --- | --- |
| Causal-agency audit | `--targeted-causal-agency-check` |
| Movement/carrying-range hot-path audit | `--targeted-movement-carrying-range-hotpath-audit` |
| Fauna anti-omniscience (hidden-knowledge violations) | `--targeted-fauna-stocks-audit` (plural — distinct from the stock-bounds audit below) |
| Resource anti-omniscience audit | `--targeted-resource-anti-omniscience-audit` |
| Plant-stock audit | `--targeted-plant-stock-audit` |
| Fauna-stock (bounds/physicality) audit | `--targeted-fauna-stock-audit` (singular) |
| ROUTINES-2 audit | `--targeted-routines-2-check` |
| Adaptation/invention audit | closest matches: `--targeted-invention-3-audit`, `--targeted-adaptive-efficacy-check`, `--targeted-adaptive-human-ideas-solutions-routines-audit` — no single canonical flag name confirmed |
| Migration/dispersal saturation audit (used in the causal-agency diagnostic) | `--targeted-migration-saturation-audit` (with `--migration-audit-years N --migration-audit-map 1\|2`) |

Run `node scripts/simBenchmark.mjs --help` for the full current flag list (~120 flags exist; only the ones matching the original draft's named audits are reproduced above — do not assume this table is exhaustive).

Never write "all audits pass" unless the current branch was executed and the full command list is reported.

---

## 9. Working protocol

### Before work

1. Run `git status --short --branch`.
2. Report branch, `HEAD`, and commit subject.
3. Protect dirty work; do not overwrite unrelated changes.
4. Confirm the active checkpoint and branch policy.
5. Read relevant `CLAUDE.md` sections and focused source files.
6. Identify authoritative state, writers, readers, projections, and lifecycle seams.
7. Inspect the relevant audits and controlled fixtures.
8. Reproduce the issue before changing behavior.
9. Define a behavioral pass gate and negative tests.

### During work

1. Preserve determinism and diagnostics-off parity.
2. Modify authoritative causal paths, not UI symptoms.
3. Keep physical truth, perception, and projections separate.
4. Add focused audits that exercise the production path.
5. Avoid broad coefficient tuning before attribution.
6. Keep histories and caches bounded.
7. Check alternate constructors, snapshots, manual placement, fission, and terminal state.
8. Update documentation in the same commit when architecture changes.
9. Do not rewrite unrelated code merely to simplify documentation or testing.

### Before completion

1. Run focused audits.
2. Run the declared regression matrix.
3. Run typecheck, build, deterministic benchmark, and graph check where applicable.
4. Run `git diff --check`.
5. Inspect the complete diff.
6. Confirm no generated output or unrelated files are included.
7. Update `AGENTS.md`, `CLAUDE.md`, and active tracked handoff/spec files.
8. Report PASS, FAIL, or progress honestly.
9. Commit with an explicit message.
10. Report commit hash and clean-tree status.
11. Do not merge.
12. Do not push unless the user explicitly asks.

---

## 10. Prompt conventions

Every implementation prompt begins with exactly one difficulty label:

```text
EASY
HARD
EXTREME
```

Rules:

- `HARD` is the normal default for substantial repository work.
- Major architecture checkpoints use `EXTREME`.
- Do not invent additional labels.
- Prompts state symptoms, causal goals, constraints, required evidence, and pass gate.
- Prompts must not prescribe an unverified fix.
- No compromise on behavioral gates.
- “Build passes” is never a substitute for causal proof.
- The agent must inspect code and choose the architecture compatible with actual authorities.

---

## 11. Current roadmap

Demographic persistence is implemented (persistence-1 and persistence-2 both PASS). Consolidation-1 completed the correctness/safety half (PROGRESS); the structural decomposition remains. The canonical future order is now:

1. **EXPEDITIONARY LOGISTICAL MOBILITY / TASK CAMPS / VIEWSHED PERCEPTION / FIRE SIGNALS + DYNAMIC MOBILITY-1..3.** ← active (spine + dynamic mobility landed; viewshed/signals/risk/knowledge-latency remain)
2. **CLIMATE / WEATHER / SEASONAL VARIABILITY-1 — FOUNDATIONAL.** ← promoted 2026-07-16 to sit immediately after expeditionary logistics and BEFORE seasonal migration. Rationale: climate is an upstream *physical* driver, not a later content layer. Expedition feasibility already reaches for weather/visibility/water inputs (travel legs, viewshed occlusion, smoke dispersal, provisioning), and seasonal route migration is not meaningfully modellable until inter-annual and intra-seasonal variability exist — otherwise "seasonal rounds" would be scripted rather than emergent. Must attach at the terrain/hydrography→ecology seam and feed existing seasonality, not become a parallel content pack.
3. **CROWDING / RANGE RELEASE / GENERATIONAL DEPARTURE / VIABLE FISSION-1.**
4. **SEASONAL ROUTE MIGRATION / VARIABLE NOMADIC ROUNDS-1.** (now downstream of climate, by design)
5. **LANGUAGE / SEMANTIC COMMUNICATION / NAMING / DIALECT EVOLUTION-1.**
6. **BAND CULTURE / IDENTITY / VIEWS / CUSTOMS / NORMS-1.**
7. **INTER-BAND ENCOUNTERS / RELATIONSHIP MEMORY / EXCHANGE NETWORKS-1.**
8. **RELIGION / MYTH / RITUAL / SACRED LANDSCAPE-1.**
9. **SMALL-SCALE CONFLICT / FEUD / RETALIATION-1**, followed later by alliances, raids, and organized war.
10. **EMERGENT TRAILS / ROUTES / ROADS / SEDENTISM.**
11. **Major missing human biological and social systems** — includes the DEMOGRAPHIC SEX-COMPOSITION prerequisite: mobility-3 chose Option B (no sex state), so any sex-specific reporting REQUIRES a prior demographic checkpoint adding conserved male/female counts with sex-aware aging/mortality/birth/fission/absorption/extinction. Do not fake it in a mobility or culture checkpoint.
12. **WHOLE-SIM CAUSAL CONNECTIVITY / DECORATIVE SYSTEMS AUDIT.**
13. **PUBLIC POLISH + MVP CLOSURE.**

Consolidation comes **before** expeditions: the demographic checkpoint surfaced tick/season-resolution and decision-orchestration coupling that should be decomposed before new expedition mechanics are layered on.

Do not permanently leave completed objectives in the future list. Move verified results into current architecture, record the commit and audits, preserve caveats, then advance the active checkpoint.

---

## 12. Documentation maintenance contract

After every accepted checkpoint, update documentation in the **same commit**.

### Always update `AGENTS.md` when these change

- current verified `HEAD` or checkpoint;
- build/test commands;
- source-of-truth location;
- repository structure;
- non-negotiable rules;
- active blocker;
- roadmap order;
- working protocol.

### Always update `CLAUDE.md` when these change

- architecture or lifecycle ordering;
- state ownership or system authority;
- active specification;
- known limitation;
- accepted checkpoint;
- roadmap;
- product scope;
- audit meaning;
- major coefficient or contract.

### Handoffs and active specifications

Search for tracked:

- `HANDOFF.md`;
- `docs/HANDOFF.md`;
- project-state notes;
- active specifications;
- implementation plans;
- checkpoint reports.

If tracked and active, update them. If ignored, local-only, unavailable, or absent from the checkout, state that limitation. Never claim synchronization with a file that was not present.

A proper handoff records:

- last accepted commit;
- branch;
- clean/dirty tree;
- PASS/FAIL;
- active checkpoint;
- completed work;
- remaining blockers;
- exact next action;
- commands run;
- artifacts or patches;
- intentionally excluded files;
- push status.

### README

Update README only when public purpose, setup, controls, or user-facing features change. Do not turn README into an internal engineering log.

### Specifications and roadmap

When an active specification changes, update the spec, the summary in `CLAUDE.md`, and the reason. When completed, move verified results into current architecture and retain only concise history.

When an objective is abandoned, remove stale references across AGENTS, CLAUDE, handoffs, and specs; record the reason if architecturally important.

### Project-purpose changes

If the intended experience changes, update the top-level project description in both files, README when public-facing, the causal spine, roadmap priorities, obsolete assumptions, and the bounded architecture change log.

### Staleness prevention

Both documents must always contain:

- `Last verified against commit`;
- `Last updated`;
- `Current active checkpoint`;
- `Known stale or unverified sections`.

If a section cannot be verified, mark it. Do not guess and do not let it sound authoritative.

---

## 13. Where to read in `CLAUDE.md`

Use [`CLAUDE.md`](./CLAUDE.md) as follows:

| Need | Section |
| --- | --- |
| Product vision and design philosophy | §§2–3 |
| Deep causal architecture | §§4–8 |
| Production lifecycle and authority | §§5–7 |
| Current accepted checkpoint history | §9 |
| Implemented persistence model and remaining logistical blocker | §10 |
| Active checkpoint specification | §11 |
| Known risks and architectural debt | §12 |
| Existing expedition architecture | §13 |
| Exact roadmap and missing systems | §§14–15 |
| Research and anthropological constraints | §16 |
| Audit meanings and commands | §17 |
| Failure patterns | §18 |
| Claude implementation process | §§19–20 |
| Final reporting format | §21 |
| Documentation-update rules | §22 |
| Recent architecture change log | §23 |

---

## 14. Required repository verification after adopting this draft — EXECUTED 2026-07-14

Steps 1-3, 6-8 done (see CLAUDE.md Appendix A for the itemized status); step 4 partial (top-level ownership mapped, not every field/writer/reader across ~90 `agents/` files); step 5 done (§8 above). Step 9 ("update both files in one documentation commit") **does apply**: as of the persistence-1 commit, `CLAUDE.md` and `AGENTS.md` were removed from `.gitignore` and are tracked, so documentation is committed with each checkpoint. (The original draft's claim that they were "local-only, not tracked" was correct only before that commit and is now false — corrected here in FOOD-DEMOGRAPHY-SEPARATION-2.)

This file is now **repository-verified for §1-8 above**; §9-13 (deeper protocol/philosophy sections) were not the target of this pass and remain as originally drafted.
