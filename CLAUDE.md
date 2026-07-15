# CLAUDE.md — Architectural Dossier and Implementation Guide

> Detailed architecture, product intent, active specification, accepted checkpoint history, audit guidance, and Claude-specific workflow for `fellipegoncalvesleite/human-nomad-simulator`.
>
> Read [`AGENTS.md`](./AGENTS.md) first. Then read only the sections relevant to the current task.

---

## Table of contents

1. [Document purpose and freshness](#1-document-purpose-and-freshness)
2. [Product vision](#2-product-vision)
3. [Design philosophy](#3-design-philosophy)
4. [Canonical causal spine](#4-canonical-causal-spine)
5. [Production execution lifecycle](#5-production-execution-lifecycle)
6. [Repository architecture map](#6-repository-architecture-map)
7. [Authority matrix](#7-authority-matrix)
8. [Current implemented systems](#8-current-implemented-systems)
9. [Current accepted checkpoint history](#9-current-accepted-checkpoint-history)
10. [Implemented demographic persistence and remaining logistical blocker](#10-implemented-demographic-persistence-and-remaining-logistical-blocker)
11. [Completed checkpoint specification](#11-completed-checkpoint-specification)
12. [Known limitations and architectural debt](#12-known-limitations-and-architectural-debt)
13. [Existing expedition architecture](#13-existing-expedition-architecture)
14. [Exact roadmap](#14-exact-roadmap)
15. [Major missing human systems](#15-major-missing-human-systems)
16. [Research and anthropological constraints](#16-research-and-anthropological-constraints)
17. [Audit and verification guide](#17-audit-and-verification-guide)
18. [Common failure patterns](#18-common-failure-patterns)
19. [Claude-specific workflow](#19-claude-specific-workflow)
20. [Claude near-miss rules](#20-claude-near-miss-rules)
21. [Final report template](#21-final-report-template)
22. [Documentation-update contract](#22-documentation-update-contract)
23. [Architecture change log](#23-architecture-change-log)

---

## 1. Document purpose and freshness

This document is intended to replace repeated repository-wide rediscovery with a durable, navigable architecture map. It should let an implementation agent identify:

- the current causal spine;
- state ownership;
- production ordering;
- physical truth versus perception versus projection;
- relevant audits;
- known limitations;
- the active specification;
- historical invariants;
- future attachment points.

### Freshness block

```text
Last verified against:
  FOOD–DEMOGRAPHY checkpoint tree on branch
  checkpoint/food-demography-persistence-1, parent
  30a87b3aab96dc9b6276a5e148458ad9772770e0. The final checkpoint report records
  the resulting commit hash because a Git commit cannot contain its own hash.

Backup branch:
  checkpoint/all-map-ecology-f33bebc — CONFIRMED, remote tip
  f33bebc23ecc21b971c98b48b31ca8bbfa9d2209 matches exactly.

Other cited commits — all CONFIRMED present in `git log --all`:
  855434cb728f85eababcd9abce8dc623e3b36068, 8135969, 02c325d,
  736214f39728767b77b4e7989dc33c7b16642239.

Last updated:
  2026-07-14

Implemented checkpoint:
  FOOD–DEMOGRAPHY SEPARATION / DEMOGRAPHIC PERSISTENCE-1 — PASS. The local
  ignored design note was consulted when available but is not claimed as a
  committed artifact. §10–11 are the tracked canonical record.

Current active checkpoint:
  EXPEDITIONARY LOGISTICAL MOBILITY / TASK CAMPS / VIEWSHED PERCEPTION /
  FIRE SIGNALS-1. It was not begun by the demographic checkpoint.

Known stale or unverified sections:
  This checkpoint verified the repository/production-entry-point map, tick
  order, demographic formulas, diagnostic seams, audit commands, graph, named
  regression matrix, deterministic long runs, and documentation contract. NOT
  independently re-verified in full: every per-domain
  authority-matrix row in §7, the deep implementation claims throughout §8-9
  and §12-15 (these are plausible and directionally consistent with the code
  read during this pass, but were not read line-by-line against all ~90
  src/sim/agents files), and exact cache caps/coefficients. Treat §7-9/12-15 as
  a reasonable map, not a verified inventory.
```

**Correction found during this pass:** §5's guessed production order was wrong
about ecology timing. The real order (read from `src/sim/tick/advance.ts`) runs
physical ecology advancement (`advanceTileDepletion`, `advanceFaunaStocks`,
`advancePlantPatchState`, `advanceForestPatchState`) **at the end of the
season**, after band decisions, demography/fission, viability/extinction, and
deep-history — not at the start, before decisions, as the original draft
assumed. See the rewritten §5.3 below.

### Evidence status

- **VERIFIED CURRENT** — directly read from current production code.
- **SUPPORTED BY AUDIT** — enforced or demonstrated by an audit; specify whether executed now or only reported at an accepted checkpoint.
- **PARTIAL** — implemented but incomplete or shallow.
- **LEGACY/INERT** — present but not authoritative or behaviorally active.
- **PLANNED** — roadmap only.
- **UNCERTAIN** — insufficient evidence.

Because this drafting pass had no repository access, no technical claim below is labeled `VERIFIED CURRENT`. Claims are either:

1. user-supplied current requirements;
2. accepted-checkpoint/report evidence;
3. architecture constraints;
4. explicitly `UNCERTAIN`.

### Source-of-truth order

When sources disagree:

1. current production code;
2. current audit and benchmark code;
3. current type definitions and graph metadata;
4. tracked architecture/documentation files;
5. accepted commit history and reports;
6. this document and the originating prompt;
7. old comments, stale README sections, and historical plans.

Code wins. Do not preserve a claim merely because it appears here.

---

## 2. Product vision

The player-facing idea is not a conventional technology tree or a sequence of civilization unlocks. It is a world in which the observer watches mobile human bands cope with a changing physical and social environment, learn unevenly, remember routes and failures, alter labor and movement, reproduce or collapse, and eventually create historically distinctive patterns.

The simulation should be interesting because visible outcomes have traceable causes:

- a band uses a route because it learned or inherited it;
- a camp persists because repeated logistical and ecological conditions support it;
- a food crisis matters because physical stocks, knowledge, travel, labor, care, processing, and demand produced it;
- a custom or taboo matters because recurrent social experience created and transmitted it;
- a myth or sacred place matters because a history became interpreted and culturally durable;
- a settlement matters because movement, storage, care, routes, resource seasonality, relationships, and labor made residence viable.

Static values and fake labels are unacceptable because they make the world look deeper without making it behave differently. A “culture” string, “settled” badge, “domestication progress” meter, or Chronicle sentence does not constitute a system unless it changes subsequent decisions or physical state through an auditable causal path.

The central design tension is productive:

- the project must be scientifically and anthropologically grounded enough to avoid arbitrary game mechanics and universalized social scripts;
- it must remain legible and dynamic enough that an observer can understand why the world is changing.

The long-run potential includes:

- distinctive bands and lineages;
- learned routes and regional adaptations;
- language, naming, dialect divergence, and semantic communication;
- identity, customs, norms, and taboos;
- exchange and relationship networks;
- religion, myth, ritual, and sacred landscapes;
- feud, conflict, alliance, raids, and later organized war;
- trails, routes, roads, camps, settlements, and cities;
- domestication and agriculture when conditions support them;
- political organization and historically contingent trajectories.

The world’s history should not be authored in advance. Events arise from physical and social state, become remembered, are interpreted, and later shape behavior.

---

## 3. Design philosophy

### 3.1 Emergent rather than scripted civilization

Civilization is not a ladder. Do not implement a universal sequence such as:

```text
foraging → farming → villages → cities → states
```

The simulation should allow multiple durable strategies and dead ends. Sedentism, domestication, agriculture, exchange, religion, hierarchy, and political organization must arise only where earlier causal conditions make them viable.

Roadmap labels are engineering checkpoints, not guaranteed historical stages for every simulated society.

### 3.2 Causal state rather than decorative state

A major system is complete only when it has a traceable loop:

```text
cause
→ authoritative state change
→ behavioral decision
→ physical result
→ memory/history
→ future behavior
```

Examples of incomplete work:

- a state field exists but no decision reads it;
- a UI card reads it but no physical writer updates it;
- an audit creates an object without proving later behavior;
- a Chronicle line describes an event that did not occur physically;
- an adaptation exists but no coefficient changes;
- a map layer visualizes opportunity and later becomes a hidden calorie source.

### 3.3 Resilience before collapse

Human bands should normally bend before they break. Grounded responses may include, when implemented:

- broadening diet;
- reallocating labor;
- increasing observation;
- using known routes;
- changing activity timing;
- resting, caring, repairing, or reducing risk;
- using inventions or learned practices;
- relocating residence;
- relying on social buffering;
- fissioning or joining when later systems support it.

Extinction remains valid. It should occur after relevant adaptive pathways fail, not because the model applies penalties while ignoring already implemented options.

This principle does not justify generic survival floors, benchmark-specific exceptions, or hidden resource grants.

### 3.4 Anti-omniscience

Bands act from bounded information:

- observations;
- known tiles;
- resource knowledge;
- signs;
- confidence and staleness;
- place memory;
- route/corridor/crossing memory;
- inherited or communicated information where implemented;
- uncertain inference.

They must not read hidden world truth. Technical/debug views may expose exact terrain, current stock, opportunity, or movement cost, but those projections must remain behaviorally isolated.

Negative tests must prove that hidden truth does not leak through helper functions, caches, selectors, UI reducers, or alternate constructors.

### 3.5 Deterministic uncertainty

The world may look stochastic, but the implementation must be reproducible.

Do not use:

- `Math.random`;
- wall-clock time;
- render order;
- unstable iteration;
- global mutable randomness;
- browser timing;
- nondeterministic collection traversal.

Use the existing deterministic seed, hash, event, or keyed-choice mechanisms. The exact mechanism is **UNCERTAIN until repository inspection**.

Determinism includes diagnostics-off parity: adding an optional diagnostic path must not alter canonical state when disabled.

### 3.6 Aggregate simulation where appropriate

The project need not simulate every individual person. Aggregate stocks, cohorts, labor pools, activity parties, health burdens, and demographic accumulators are preferable when they preserve the causal question and keep state bounded.

Individualization is justified only when identity, relationship, inheritance, leadership, or another future system genuinely requires it. Do not create millions of agents to imitate depth.

### 3.7 Historical events grounded in simulation

Chronicle and historical projections are records, not causes by themselves. A historical event must point back to physical or social state:

- a move that resolved;
- a death or birth transition;
- a stock collapse;
- an invention that changed a coefficient;
- a repeated route;
- an encounter;
- a split;
- a conflict;
- a settlement transition.

Later cultural systems may reinterpret events, but the initial event must be real.

### 3.8 No universal ethnographic scripts

Future human systems must be constrained by research without encoding stereotypes as natural law.

Do not assume:

- men always hunt;
- women always gather;
- all bands maximize calories;
- all smoke has coded meaning;
- all task camps become settlements;
- all societies share one kinship form;
- all groups recognize the same authority;
- all mobility follows one residential/logistical model;
- all cultures converge on the same religion or family structure.

Use variable pressures, learned practices, social transmission, local history, and bounded path dependence.

### 3.9 No detached content packs

Ecology, culture, religion, disease, technology, and history must not become independent tables that inject flavor. They must attach to the causal substrate.

Canonical long-term direction:

```text
resource / animal / water ecology
→ knowledge
→ risk / labor / return
→ memory
→ movement / demography
→ culture / settlement
→ history
```

---

## 4. Canonical causal spine

### 4.1 Current working spine

```text
Terrain / Hydrography
→ Physical Ecology
→ Band Observation, Knowledge and Memory
→ Activity Selection, Risk, Labor and Physical Return
→ Human Food Support, Nutrition and Health
→ Movement and Demography
→ Lifecycle and Chronicle
→ UI / Technical Projections
```

The exact modules and symbols must be verified in the repository. The currently known path families are:

- terrain/world: likely `src/sim/world/`;
- band perception/agents: likely `src/sim/agents/`;
- rules and execution: likely `src/sim/rules/`;
- runner: likely `src/sim/runner/`;
- UI: `src/ui/`;
- audits and benchmark: `scripts/`;
- accepted canonical food aggregator: a file named `humanFoodSupport.ts`, exact path uncertain.

### 4.2 Intended long-term spine

```text
Terrain / Hydrography
→ Plants / Fauna / Aquatic Ecology
→ Perception / Knowledge / Memory
→ Labor / Risk / Activities / Logistics / Return
→ Nutrition / Health / Care / Demography
→ Residential Mobility / Fission / Seasonal Routes
→ Language / Identity / Norms / Relationships
→ Exchange / Religion / Conflict / Trails / Settlement
→ Institutions / Political Organization / Historical Trajectories
```

Each new system must attach at a causal seam, not bypass earlier layers.

### 4.3 Arrow-by-arrow requirements

#### Terrain / hydrography → physical ecology

Terrain and water define potential, access, passability, and habitat. They do not directly grant food. Current plant, fauna, and aquatic stocks must mediate usable resources.

#### Physical ecology → knowledge

Bands learn through bounded observation and experience. A resource may exist physically and remain unknown or uncertain.

#### Knowledge → activity, risk, labor, return

Knowledge changes where bands search, what they attempt, which routes they use, how much labor they allocate, and what risks they accept.

#### Activity → physical result

Activities must change physical state and create typed returns. Gathering depletes plant patches; hunting/fishing interacts with stocks; exploration updates knowledge; travel consumes time or labor.

#### Physical return → nutrition

Only explicit nutritional receipts flow into the human food ledger/support aggregator. Potential, richness, or “opportunity” cannot substitute.

#### Nutrition/health → movement and demography

Stress and health influence behavior and births/deaths through bounded, interpretable mechanisms. Current demographic persistence work exists because this seam may be overreactive or may receive too little support upstream.

#### Movement/demography → history

Residential moves, splits, deaths, births, and extinction become historical only after physical resolution.

#### History → future culture

Future culture, identity, religion, and politics may interpret and transmit recorded experience. They must not invent physical precursors retroactively.

---

## 5. Production execution lifecycle

### 5.1 Verification warning — RESOLVED

**VERIFIED CURRENT.** Read directly from `src/sim/tick/advance.ts` (`advanceWorldByDays` → `runSeasonalCompatibilityTick`) on 2026-07-14. `src/sim/runner/simRunner.ts` is **not** the tick order — it is PERF-1's shared world-construction/step-loop wrapper (`initSimWorld`, `stepSim`) used by both the browser worker (`src/worker/simWorker.ts`) and the node-side benchmark; `stepSim` just calls `advanceWorldByDays` in a loop. §5.2-5.3 below reflect the real order; the previous draft's guessed order had ecology advancing *before* decisions, which is backwards — see §5.3.

### 5.2 Initialization

Expected responsibilities:

1. choose or construct a scenario/world;
2. generate terrain and hydrography;
3. initialize physical ecological stocks;
4. create default, custom, or manually placed founders;
5. initialize band population/cohorts;
6. initialize perception, known tiles, and memory;
7. initialize nutrition history and demographic accumulators;
8. initialize activity, movement, adaptation, animal-learning, Chronicle, and caches;
9. create observer/debug projections without mutating canonical state.

Paths and constructor names are **UNCERTAIN**.

Initialization parity must be checked across:

- default bands;
- custom/manual founders;
- fission daughters;
- snapshot restore;
- scenario-specific setup;
- test fixtures.

### 5.3 Seasonal or tick progression — VERIFIED CURRENT (`src/sim/tick/advance.ts`)

`advanceWorldByDays` walks day-by-day; on every season-boundary day it runs `runDailyActions` for the elapsed days (intra-season trips — see `intraSeasonTrips.ts`, `DEFAULT_DAILY_ACTIONS`) and then `runSeasonalCompatibilityTick`, whose real body is:

1. **Build pre-decision context cache** (`buildTickContextCache`).
2. **Update band context/readability state** (`updateBandContextStates`) — this is the projection/decoration pass the causal-agency diagnostic (see §9) found is read only by UI, not by decision scoring.
3. **Apply acute risk context** (`applyAcuteRiskContext`), then rebuild the context cache.
4. **Per-band decision loop**, bands sorted deterministically by id (`compareBands`), skipping `dispersed`/`absorbed`/`extinct` bands:
   - `evaluateBandDecision` (scores candidates — `src/sim/rules/bandDecision.ts`);
   - `applyBandDecision` (writes the chosen outcome, including `position`);
   - optional audit-only `decisionObserver` hook (never wired in normal/worker runs);
   - append to `decisionArchive`/`decisions`.
5. **Post-decision context**: `buildTickContextCache`, `applyRangeSaturationContext`, `applyEncounterContext`.
6. **Demography and fission** (`updateBandsDemographyAndFission` — `src/sim/agents/demography.ts`).
7. **Viability/extinction** (`updateBandViabilityStates` — `src/sim/agents/viability.ts`).
8. **Deep-history observation** (`applyBandDeepHistoryContext`) — spring-gated, yearly; explicitly placed *after* this year's fissions/deaths so they're visible, and *before* ecology advances.
9. **Physical ecology advances — LAST, once per season:** `advanceTileDepletion` → `advanceFaunaStocks` → `advancePlantPatchState` → `advanceForestPatchState`, each keyed off the same memoized post-decision catchment/occupation index from step 5.
10. **Final context pass** (`updateBandContextStates` again) to close out the tick.

**This is the opposite order from what the original draft guessed** (which put ecology advancement first, before band decisions). In the real code, a band's season-N decision is made against ecology state as it stood at the *end of season N-1*; ecology then advances at the end of season N based on that decision's harvest/occupation pressure. `humanFoodSupport.ts`'s ledger aggregation and nutrition update are not separate top-level tick steps — they're computed as part of `evaluateBandDecision`'s context (via `carryingCapacity`/`seasonalSurvival`, read during step 4), not a distinct post-harvest phase in `advance.ts` itself.

### 5.4 Ordering invariants

#### Physical receipt before nutrition

No activity return, no nutrition contribution. A discovered or potentially rich tile is not edible.

#### Nutrition before demographic consequences

Demographic attribution must read the nutrition state produced for the relevant interval. Avoid off-by-one history application and repeated aliases.

#### Extinction before further living behavior

Once terminal extinction resolves:

- no new activities;
- no movement;
- no births;
- no living memory updates;
- no adaptation progress;
- no active ecological pressure;
- no mutable living Chronicle path.

Historical archival projection may continue to be read, not mutated as living state.

#### Rendering does not mutate knowledge

Map renderers, inspectors, hover state, selected-band UI, debug overlays, and projections may not reveal or write knowledge used by agents.

#### Diagnostics-off byte identity

Optional runner diagnostics introduced for the active checkpoint must never be persisted in `WorldState`. When disabled, serialized/canonical output must remain byte-identical under the same seed and inputs.

---

## 6. Repository architecture map

### 6.1 Root files to inspect — VERIFIED CURRENT

| File/area | Required reading | Current status |
| --- | --- | --- |
| `package.json` | name `emergent-civilization-simulation`; scripts `dev`(vite)/`build`(tsc+tsc.node+vite build)/`preview`(vite preview)/`sim:benchmark`(node scripts/simBenchmark.mjs); deps react 19.2, zustand 5, d3-drag/force/selection/zoom, lucide-react; devDeps typescript 6, vite 8 | **VERIFIED** |
| TypeScript config files | `tsconfig.json` (app) + `tsconfig.node.json` (vite/node config); both compiled in `build` | **VERIFIED** — no separate test config; there is no `test` script, testing is the audit scripts + `sim:benchmark` |
| build config | `vite.config.ts`, `@vitejs/plugin-react` | **VERIFIED** |
| README | public-facing project description | present, not modified by this pass |
| `.gitignore` | ignores `node_modules/`, `dist/`, `artifacts/`, `docs/baselines/`, `timing_audit.txt`, `CLAUDE.md`/`AGENTS.md`/`PRODUCT.md`/`DESIGN.md`, `**/HANDOFF.md` and diagnostic/handoff patterns, `docs/superpowers/` | **VERIFIED** — this means CLAUDE.md/AGENTS.md themselves, and the specs/plans/handoff docs referenced throughout this document, are all **local-only, not tracked by git** |
| root Markdown files | `PRODUCT.md`, `DESIGN.md`, `README.md` tracked; `CLAUDE.md`/`AGENTS.md` local-only per above | **VERIFIED** |
| graph metadata | `src/architecture/graphData.ts` (hand-maintained NODES/LINKS); integrity checked by `scripts/checkGraph.mjs` (loads it via Vite SSR, asserts 0 duplicate node ids, 0 dangling links) | **VERIFIED** |
| CI configuration | no `.github/workflows` directory exists — there is no CI; all checks are run locally/on-demand | **VERIFIED** |

### 6.2 Production entry points — VERIFIED CURRENT

| Concern | Exact symbol/path |
| --- | --- |
| React application entry | `src/main.tsx` → `src/ui/Root.tsx` / `src/ui/App.tsx` |
| Simulation creation | `initSimWorld(init, runSeed?)` — `src/sim/runner/simRunner.ts`, dispatches on `SimWorldKind` (`map1`/`map2`/`map2_single_origin`/`procedural`) to `spawnInitialBands`/`spawnVariedMigrationBands`/`spawnSingleOriginBand`/`createWorld`, all from `agents/spawn.ts` and `world/generate.ts` |
| Simulation runner (season loop) | `stepSim(world, steps, stepMode, decisionObserver?)` in `simRunner.ts` — thin wrapper that loops `advanceWorldByDays` |
| Actual tick order | `advanceWorldByDays` → `runSeasonalCompatibilityTick`, both in `src/sim/tick/advance.ts` — see §5.3 |
| World initialization | `src/sim/world/generate.ts` (`createWorld`, `createRegionalDebugWorld`, `createVariedMigrationWorld`), `hydrography.ts` |
| Scenario selection | `SimWorldKind` union in `simRunner.ts`: `map1`, `map2`, `map2_single_origin`, `procedural` (only `map1`/`map2` have real default bands; `map2_single_origin` is a derivative; `procedural` has none by default) |
| Band initialization | `src/sim/agents/spawn.ts`: `spawnInitialBands`, `spawnVariedMigrationBands`, `spawnSingleOriginBand`, `spawnCustomBands`, `applyInitialBandPlacements`, `removeInitialBands` |
| Activity selection/execution | `src/sim/agents/intraSeasonTrips.ts` (`runDailyActions`/`DEFAULT_DAILY_ACTIONS`) for daily/logistical trips; `src/sim/rules/bandDecision.ts` (`evaluateBandDecision`/`applyBandDecision`) for the seasonal residential decision |
| Ecology advancement | `advanceTileDepletion` (`world/depletion.ts`), `advanceFaunaStocks` (`agents/faunaStock.ts`), `advancePlantPatchState` (`agents/plantStock.ts`), `advanceForestPatchState` (`agents/forestPatches.ts`) — all called at the end of `runSeasonalCompatibilityTick` |
| Human food support | `src/sim/agents/humanFoodSupport.ts` — exports `HARVEST_TO_SUPPORT_SCALE=100`, `HUMAN_FOOD_SUPPORT_UNIT`, `deriveHumanFoodSupportLedger(...)` |
| Nutrition update | `src/sim/agents/seasonalSurvival.ts` (`deriveCanonicalNutritionState` — current/recent/chronic trio, referenced by name in the real food-demography spec) |
| Movement decision | `src/sim/rules/bandDecision.ts`, `src/sim/rules/mobilityIntent.ts` (`buildIntentCandidates`) |
| Residential outcome | `applyBandDecision` in `bandDecision.ts` |
| Demography | `src/sim/agents/demography.ts` — `updateBandsDemographyAndFission`, `updateBandDemography`, `deriveKnownBandSpacingForFission` |
| Terminal lifecycle | `src/sim/agents/viability.ts` — `updateBandViabilityStates` |
| Observer/debug | `simRunner.ts` — `takeDynamicSnapshot`/`mergeDynamicSnapshot` (full snapshot), `takeLiveOverlay` (per-frame markers), `takeSelectedBandPanelProjection` (bounded selected-band panel, with explicit byte-size diagnostics and caps) |

### 6.3 Actual major source areas — VERIFIED CURRENT

Confirmed by directory listing (2026-07-14), superseding the originating draft's guess:

- `src/sim/runner/` — `simRunner.ts` only (world construction + step loop, shared by worker and benchmark; NOT the tick order)
- `src/sim/tick/` — `advance.ts` (the real tick order), `time.ts`, `types.ts`
- `src/sim/agents/` — ~90 files; band state/behavior/ecology (confirmed larger and more granular than the draft implied — no single obvious "the runner" file here, this is where nearly all domain logic lives)
- `src/sim/rules/` — `bandDecision.ts`, `mobilityIntent.ts`, `decisionArchive.ts`, `types.ts` (smaller than the draft implied; most "rules" logic actually lives in `agents/`)
- `src/sim/world/` — `generate.ts`, `hydrography.ts`, `depletion.ts`, `seasonal.ts`, `passability.ts`, `ecologicalProjection.ts`, `mapEdits.ts`, `types.ts`
- `src/sim/chronicles/`, `src/sim/core/` (`seededVariation.ts`, `types.ts`), `src/sim/diffusion/`, `src/sim/events/`, `src/sim/knowledge/`, `src/sim/models/`, `src/sim/settlements/` — smaller type/support modules, mostly `types.ts`-only or thin, **not individually verified in this pass**
- `src/ui/` — `App.tsx`, `Root.tsx`, `WorldCanvas.tsx`, `TileInspector.tsx`, `MapEditorPanel.tsx`, `EventLog.tsx`, `band/` (per-topic panels: Overview, Food, Knowledge, Survival, History, People, etc.)
- `src/architecture/` — `graphData.ts` (hand-maintained architecture graph), `ArchitectureMapPage.tsx`, `exportGraph.ts` — **not in the original draft's area list at all**
- `src/render/` — `canvasRenderer.ts`, `seasonalVisuals.ts` — **not in the original draft's area list**
- `src/worker/` — `simWorker.ts` (browser Web Worker wrapping `simRunner.ts`) — **not in the original draft's area list**
- `src/store.ts` — top-level zustand store — **not in the original draft's area list**
- `scripts/` — confirmed, see AGENTS.md §8 for the exact audit file list

### 6.4 Domain map template

A repository-enabled documentation pass should replace each row with exact paths and exported symbols.

| Domain | Expected responsibilities | Exact paths/symbols |
| --- | --- | --- |
| Terrain/world generation | elevation, water, passability, biome/habitat potential | `REQUIRES VERIFICATION` |
| Hydrography | water bodies, flow/access, aquatic habitat | `REQUIRES VERIFICATION` |
| Spawn/band initialization | founders, cohorts, anchor, knowledge parity | `REQUIRES VERIFICATION` |
| Manual/custom placement | user-created founders and placement constraints | `REQUIRES VERIFICATION` |
| Runner | canonical production order | `REQUIRES VERIFICATION` |
| Intra-season activities | party generation, execution, labor, risk | `REQUIRES VERIFICATION` |
| Physical return semantics | typed return kinds and receipts | `REQUIRES VERIFICATION` |
| Plant ecology | patches, stock, depletion, recovery, seasonality | `REQUIRES VERIFICATION` |
| Fauna ecology | prey/predator stocks, depletion, recovery, human pressure | `REQUIRES VERIFICATION` |
| Aquatic ecology | fish/aquatic stocks, runs, depletion/recovery | `REQUIRES VERIFICATION` |
| Human food support | canonical receipt aggregation | known filename `humanFoodSupport.ts`; path/exports unknown |
| Carrying/seasonal support | diagnostic or physical support calculations | `REQUIRES VERIFICATION` |
| Nutrition/survival | demand, current/recent/chronic stress, survival effects | `REQUIRES VERIFICATION` |
| Movement decisions | perceived opportunity, intent, route choice | `REQUIRES VERIFICATION` |
| Residential movement | outcome and anchor mutation | `REQUIRES VERIFICATION` |
| Demography | births/deaths/cohorts/accumulators | `REQUIRES VERIFICATION` |
| Age cohorts | cohort structure and causal effect | `REQUIRES VERIFICATION` |
| Viability/extinction | terminal transition and archival freeze | `REQUIRES VERIFICATION` |
| Adaptation/invention | problems, ideas, experiments, coefficients, efficacy | `REQUIRES VERIFICATION` |
| Animal learning | observations, learned patterns, proto-management | `REQUIRES VERIFICATION` |
| Context caches | bounded local/practical/social context | `REQUIRES VERIFICATION` |
| Chronicle/history | grounded event recording | `REQUIRES VERIFICATION` |
| Ecological projections | truth, habitat, living ecology, known opportunity | `REQUIRES VERIFICATION` |
| Map renderer/inspectors | projection-only visualization | `REQUIRES VERIFICATION` |
| Selected-band Technical UI | debug/technical state for selected band | `REQUIRES VERIFICATION` |

---

## 7. Authority matrix

The matrix below records the intended authority contract. Exact type paths, fields, and writer symbols remain unverified.

| Domain | Canonical state | Main writer | Behavioral readers | UI projection | Audit |
| --- | --- | --- | --- | --- | --- |
| Terrain/elevation | world terrain grid/tiles | world generator | movement cost, habitat, viewshed | Terrain/elevation layers | graph/world audit **UNCERTAIN** |
| Hydrography | physical water topology/state | hydrography generator/update | access, aquatic ecology, movement | water layer | hydrography audit **UNCERTAIN** |
| Habitat potential | terrain/water-derived suitability | world/ecology derivation | ecology initialization/recovery only as justified | Habitat Potential | must not feed calories directly |
| Plant ecology | physical plant-patch stock/state | plant ecology advancement and harvest | gathering execution, signs/observation | Living Ecology · Technical | plant-stock and trophic audits |
| Fauna ecology | physical animal stock/state | fauna ecology and hunting | hunting, observation, animal learning | Living Ecology · Technical | fauna-stock, trophic, anti-omniscience |
| Aquatic ecology | physical aquatic stock/state | aquatic advancement and fishing | fishing, signs, seasonal opportunity | Living Ecology · Technical | aquatic/food audits **UNCERTAIN** |
| Known tiles | band-perceived spatial knowledge | observation/exploration/communication | movement and activity decisions | Known Opportunity | resource anti-omniscience |
| Resource knowledge | bounded memories/confidence/staleness | observation and lived activity | selection, route use, expectations | selected-band technical projection | anti-omniscience |
| Place/corridor/crossing memory | band-local memory | movement/travel experience | future travel/mobility | route/memory projection | movement/knowledge audits |
| Physical activities/trips | party/task/trip state | activity selection/execution | receipt creation, learning, memory | activity inspector | causal-agency/movement audits |
| Physical food receipts | explicit typed nutritional returns | activity execution | human food support | receipt/ledger inspector | food pipeline, return-kind audit |
| Human food ledger/support | aggregated usable food | reported canonical `humanFoodSupport.ts` | nutrition/demand | support projection | canonical food-pipeline audit |
| Nutrition history | current/recent/chronic nutrition | nutrition update | demography, health, decisions | nutrition panel | demographic/food diagnostics |
| Movement intention | stay/scout/move decision | movement decision logic | residential resolver | mobility projection | movement hot-path audit |
| Residential outcome | accepted/delayed/diverted/rejected and anchor change | residential movement resolver | future location, history, demography | movement event/status | hardship-outcome audit |
| Population/cohorts | band demographic state | demographic update | labor, demand, viability | population/cohort UI | renewal/persistence audits |
| Sickness/risk | bounded health/risk state | health/risk rules | activity, mortality, care | health projection | acute-risk audits **UNCERTAIN** |
| Practical problems | lived problem/opportunity state | context/problem framing | idea generation and behavior | technical explanation | routines/adaptation audits |
| Ideas/experiments/inventions | bounded adaptation state | experimentation/feedback | real coefficients and future activity | adaptation UI | adaptation/invention audit |
| Animal learning/management | learned patterns and physical management acts | observation/action rules | future animal interaction | animal-learning projection | animal-learning audit |
| Viability/extinction | terminal lifecycle status | lifecycle resolver | runner gating and archive | lifecycle/history UI | terminal-extinction audit |
| Chronicle/history | grounded bounded historical records | post-resolution event recorder | future cultural interpretation when implemented | Chronicle | lifecycle/history audit |
| Dynamic map projections | derived ecological/perceptual snapshots | snapshot/projection builder | UI only | all map layers | snapshot parity/all-map audit |
| Band-perceived opportunity | derived from band knowledge, not truth | perceived-opportunity builder | movement/activity decisions if canonical | Known Opportunity | anti-omniscience |

### Authority rules

1. Projections do not become authorities.
2. Behavioral readers must not bypass bounded knowledge.
3. Physical writers must mutate the physical state they claim to affect.
4. Historical records do not retroactively create physical events.
5. Duplicate support or stress calculations require explicit justification and audit coverage.
6. Every authority claim in this table must be replaced with exact paths and symbols after repository inspection.

---

## 8. Current implemented systems

### 8.1 World and terrain

**Status: UNCERTAIN from current code; foundational existence is strongly implied by accepted project reports.**

Expected current concepts:

- procedural or predefined maps;
- terrain/elevation;
- hydrography;
- passability or movement cost;
- habitat potential;
- map projections for terrain, water, and elevation.

Required authority distinction:

```text
terrain/hydrography → habitat potential
habitat potential → possible ecological support
current stocks → actual ecological truth
executed activities → actual human receipts
```

Habitat potential is not current food. It may guide ecological initialization, recovery, or technical interpretation, but it cannot directly feed humans.

Repository verification must determine:

- map/terrain types;
- tile representation;
- hydrography types and writers;
- passability and movement-cost functions;
- whether procedural biome labels are complete or remain unknown;
- whether all map constructors initialize ecology and band state consistently.

### 8.2 Band initialization

**Status: UNCERTAIN, with explicit parity risks.**

Initialization paths likely include:

- default bands;
- custom/manual founders;
- fission daughters;
- snapshots/restores;
- controlled audit fixtures.

The first agent must verify that each path initializes:

- population and age cohorts;
- residential anchor;
- known tiles;
- resource knowledge;
- place/corridor/crossing memory;
- nutrition history;
- demographic accumulators;
- movement state;
- activity/trip state;
- practical problems;
- adaptation/invention state;
- animal-learning state;
- Chronicle/history;
- terminal lifecycle status;
- caches.

A feature is not complete if only the default constructor receives the new state.

### 8.3 Knowledge and memory

**Status: SUPPORTED BY AUDIT in accepted reports for anti-omniscience; exact current implementation unverified.**

The intended knowledge model includes:

- known tiles;
- resource observations and memories;
- confidence and staleness;
- place memory;
- corridor/crossing memory;
- signs and uncertain inference;
- learned routes;
- inherited or communicated information where implemented.

Behavior must use band-perceived state. Technical truth layers may expose exact ecology for observation by the player only.

Known architectural invariant:

> Physical absence must not automatically become band-known zero harvest unless the band has evidence. Conversely, hidden physical abundance must not become usable knowledge without observation or communication.

Audits should include negative fixtures where:

- hidden stock changes while band knowledge remains unchanged;
- technical projection is enabled or selected;
- UI rendering occurs;
- a helper receives both world truth and band state;
- a cache is stale;
- a snapshot is restored.

### 8.4 Movement

**Status: SUPPORTED BY AUDIT for accepted movement/lifecycle repairs; PARTIAL for effective range and expedition logistics.**

Current conceptual separation:

- **mobility intent** — stay, scout, or move;
- **logistical activity travel** — temporary hunting, gathering, fishing, or exploration groups;
- **residential anchor movement** — relocation of the band’s home position;
- **movement outcome** — accepted, delayed, diverted, or rejected.

Accepted repair report at commit:

```text
736214f39728767b77b4e7989dc33c7b16642239
```

reported:

- repaired `hardshipOutcome`;
- fixed terminal extinction behavior;
- normalized typed return kinds.

Important invariant:

> Intent is not outcome. A move must physically resolve and update the residential anchor before history or UI describes relocation.

Current limitation:

- existing activity parties mean expeditions are not absent;
- effective logistical range, staging, duration, overnight/task camps, provisioning, transport, processing, repeated retrieval, and viewshed/fire signals remain weak or incomplete.

### 8.5 Living ecology

**Status: SUPPORTED BY AUDIT through accepted checkpoints; exact current code and current audit pass state unverified.**

Accepted architecture direction:

- physical plant patches;
- physical fauna stocks;
- predator/prey or trophic interaction where implemented;
- physical aquatic stocks;
- depletion and recovery;
- seasonal dynamics;
- human pressure;
- map-wide validation;
- dynamic technical richness.

Accepted checkpoint chain includes:

- `855434cb728f85eababcd9abce8dc623e3b36068` — canonical living ecology food pipeline;
- `8135969` — Living Ecology/Trophic Coupling-1B progress;
- `02c325d` — completed Living Ecology/Trophic Coupling-1C;
- `f33bebc23ecc21b971c98b48b31ca8bbfa9d2209` — all-map ecology validation and dynamic richness, reported clean tree.

The main architecture invariant from the canonical food checkpoint:

> Only physical receipts feed human food support. Generic catchment or habitat yield is diagnostic only.

Further invariant:

> Plant/fauna absence does not automatically become zero harvest through a generic shortcut; activity execution must interact with the relevant physical system and knowledge state.

The first repository-enabled pass must verify:

- stock types and caps;
- update order;
- whether trophic coupling changes real stocks;
- whether human harvest depletes real stocks;
- whether recovery is bounded;
- whether all map/scenario constructors initialize equivalent ecology;
- whether caches and dynamic snapshots remain bounded and deterministic.

### 8.6 Food and nutrition

**Status: SUPPORTED BY AUDIT for the canonical physical pipeline and the repaired demographic consumer.**

Accepted chain:

```text
physical ecology
→ band knowledge
→ activity selection
→ physical harvest
→ typed physical return receipt
→ transport/processing/usable support
→ human food ledger
→ demand
→ current/recent/chronic nutrition
→ health/fertility/mortality
```

Known exact filename from accepted report:

- `humanFoodSupport.ts` — canonical aggregator; full path and exports require verification.

Key distinction:

- **physical return kinds** identify the nature of activity output;
- **nutritional receipts** are explicit usable-food contributions;
- **human food support** aggregates those receipts;
- **demand** derives from population and relevant burdens;
- **nutrition history** differentiates current, recent, and chronic conditions.

Do not collapse:

- unknown into zero;
- habitat potential into harvest;
- harvest into immediately usable calories without processing/transport where modeled;
- current stress into three independent penalties merely because three fields exist.

The completed checkpoint performed the controlled food/demography separation before productionizing the de-stack; no food-stage coefficient changed.

### 8.7 Demography

**Status: IMPLEMENTED PERSISTENCE FOUNDATION; PARTIAL structural demography.**

Expected current components:

- total population;
- age cohorts;
- birth accumulation;
- death accumulation;
- fertility/mortality classifications;
- nutrition and sickness effects;
- viability;
- terminal extinction.

Checkpoint-entry diagnostics established:

- ordinary populations can decline roughly `190 → 80` over about 50 years;
- default ten-year lineages were all declining;
- births occurred but did not replace deaths;
- actual nutrition pushed a tested band toward death accumulation;
- food-neutral conditions flipped the same band toward birth accumulation;
- extreme age structure did not materially change the net rate;
- removing acute/sickness pressure only slightly reduced decline.

The completed 2×2 proved a mixed cause: redundant downstream food pressure was material, while insufficient practically reachable physical receipts remain material on default maps.

Remaining structural limitation:

- a single net growth rate may advance birth accumulation when positive and death accumulation when negative;
- current/recent/chronic stress are now assigned one ordinary blend and one severe-chronic tail rather than repeated full penalties;
- age/reproductive structure may be mostly decorative.

The net-rate and reconciled-age limitations are explicitly surfaced in Technical; a separate aggregate-hazard rewrite remains future work.

### 8.8 Adaptation and invention

**Status: SUPPORTED BY ACCEPTED CHECKPOINT REPORTS; PARTIAL in breadth and likely in survival relevance.**

Accepted intended chain:

```text
lived problem or opportunity
→ problem framing
→ candidate idea
→ material experiment
→ physical result
→ response/invention
→ real coefficient
→ efficacy
→ revision, dormancy or abandonment
```

Required interpretation:

- a problem must arise from lived state;
- an experiment must consume time/material/opportunity and produce a physical result;
- a successful response must change a real coefficient or decision;
- efficacy must be measured against later outcomes;
- unsuccessful or irrelevant responses may be revised, dormant, or abandoned.

Where effects are real, document exact coefficients and readers. Where idea/problem state is only explanatory, label it projection-only or partial.

Do not turn adaptation into:

- a universal skill tree;
- permanent arbitrary bonuses;
- a detached technology catalog;
- random flavor outcomes;
- a route around physical ecology.

### 8.9 Animal learning and management

**Status: PARTIAL, accepted as an existing thread rather than a future invention from nothing.**

Expected concepts:

- observations of animal presence or behavior;
- learned patterns;
- feeding or holding actions where implemented;
- proto-management;
- physical stock effects;
- exclusion of full domestication, pastoralism, or agriculture at this stage.

Required causal chain:

```text
observation
→ learned pattern
→ changed action
→ physical animal-stock or access effect
→ later expectation and behavior
```

Do not label repeated proximity or a UI meter “domestication.” Future domestication must emerge from physical reproduction, selection, care, management, risk, labor, and long-term interaction.

### 8.10 Dynamic ecological maps

**Status: SUPPORTED BY ACCEPTED all-map validation and dynamic-richness reports; exact implementations unverified.**

Expected map families:

- Terrain;
- Habitat Potential;
- Living Ecology · Technical;
- Known Opportunity;
- water;
- elevation;
- movement cost.

Authority separation:

- Terrain and habitat layers represent physical structure or potential.
- Living Ecology · Technical represents exact current world truth.
- Known Opportunity represents band-perceived opportunity.
- UI projections do not become duplicate food authorities.
- Selecting a band or rendering a layer must not mutate knowledge.

Caching requirements:

- deterministic;
- bounded;
- invalidated by the correct state version;
- not recalculated on every render;
- parity-tested against uncached or canonical snapshots;
- separated by world truth versus band perception.

Exact cache caps and invalidation mechanisms are **UNCERTAIN**.

### 8.11 Lifecycle and history

**Status: SUPPORTED BY AUDIT for terminal extinction repair; Chronicle details unverified.**

Lifecycle concepts:

- viability classification;
- terminal extinction;
- archival freeze;
- Chronicle/history;
- living versus historical state.

Accepted repair report at `736214f...` indicates terminal extinction was fixed.

Terminal invariants:

1. extinction is a one-way lifecycle transition unless the design explicitly adds rescue before terminal resolution;
2. living reducers stop;
3. population cannot resurrect through stale accumulators;
4. activities and moves cannot execute;
5. active adaptation/learning cannot progress;
6. archival history remains readable;
7. UI derives terminal status rather than maintaining an independent “dead” flag;
8. unrelated reducers cannot mutate archived state.

Chronicle must record grounded events. It must not continue inventing living history after archival freeze.

---

## 9. Current accepted checkpoint history

This history is bounded and architecture-focused. It does not replace Git inspection.

### 9.1 Causal agency, movement, and adaptation foundations

**Status: SUPPORTED BY ACCEPTED REPORTS; exact commits and current code paths require verification.**

Reported result:

- bands gained more explicit causal activity/party behavior;
- movement and adaptation threads were connected beyond pure labels;
- later work built on problem framing, experimentation, routines, and social-ecological context.

Invariant:

- agent behavior must come from state and perception, not random narrative assignment.

Caveat:

- effective expedition range and several adaptation pathways remain weak.

### 9.2 Cumulative learning

**Status: SUPPORTED BY ACCEPTED REPORTS.**

Reported result:

- experience can alter later expectations or routines;
- knowledge is bounded and may become stale;
- no omniscient global resource access.

Caveat:

- exact transmission, inheritance, and cross-band diffusion depth must be verified.

### 9.3 Invention chain

**Status: SUPPORTED BY ACCEPTED REPORTS; PARTIAL.**

Reported result:

- lived problems/opportunities can lead to ideas and experiments;
- some responses alter real coefficients;
- efficacy/revision/dormancy/abandonment are intended parts of the chain.

Caveat:

- verify which inventions affect survival and which remain informational.

### 9.4 Canonical living ecology food pipeline

```text
Commit: 855434cb728f85eababcd9abce8dc623e3b36068
Reported message: checkpoint: establish canonical living ecology food pipeline
```

**Status: SUPPORTED BY AUDIT in accepted report; not rerun here.**

Authoritative change:

- explicit physical receipts are the only input to human food support;
- generic catchment/habitat yield became diagnostic only;
- `humanFoodSupport.ts` became the canonical aggregator.

Invariant:

- humans do not eat habitat potential, static richness, discoveries, or hidden resources.

Known caveat:

- physical support may still be too low or unreliable in ordinary worlds.

### 9.5 Trophic coupling progress

```text
Commit: 8135969
Checkpoint: Living Ecology / Trophic Coupling-1B progress
```

**Status: SUPPORTED BY ACCEPTED REPORTS.**

Reported direction:

- plant/fauna/aquatic state became more physically coupled;
- human pressure and stock behavior gained stronger causal meaning.

Caveat:

- abbreviated hash and exact audit result require repository/history inspection.

### 9.6 Trophic coupling completion

```text
Commit: 02c325d
Checkpoint: Living Ecology / Trophic Coupling-1C complete
```

**Status: SUPPORTED BY ACCEPTED REPORTS.**

Reported result:

- the coupling pass was completed.

Caveat:

- exact scope and remaining taxonomy/ecology gaps must be read from current code and report.

### 9.7 Anti-omniscience

**Status: SUPPORTED BY ACCEPTED AUDIT REPORTS.**

Reported result:

- fauna/resource behavior was protected from hidden world-truth reads;
- known tiles and resource memories are expected to mediate behavior.

Invariant:

- technical/debug truth remains separate from decisions.

Caveat:

- recheck helper functions, caches, snapshots, manual constructors, and UI selectors.

### 9.8 Movement outcome, terminal extinction, and return-kind normalization

```text
Commit: 736214f39728767b77b4e7989dc33c7b16642239
```

**Status: SUPPORTED BY ACCEPTED REPORTS.**

Reported result:

- `hardshipOutcome` repaired;
- terminal extinction fixed;
- return kinds normalized into typed semantics.

Invariants:

- movement intent is not residential outcome;
- extinction halts living behavior;
- physical returns have explicit kinds.

Caveat:

- alternative lifecycle and constructor paths require negative tests.

### 9.8B Causal agency / movement / adaptation repair (found during this pass, not in the original draft)

**Status: SUPPORTED BY REPOSITORY EVIDENCE — the plan's modules exist in the tree.**

`docs/CAUSAL_AGENCY_DIAGNOSTIC.md` (gitignored, absorbed into this doc and deleted 2026-07-14) is a large, file:line-cited diagnostic dated around 2026-07-09 concluding bands had "zero stable individuality" and a structural stay-bias that suppressed movement/dispersal/adaptation. It produced an implementation plan, `docs/superpowers/plans/2026-07-09-causal-agency-repair-1.md` ("CAUSAL AGENCY / MOVEMENT / ADAPTATION REPAIR-1"), specifying new modules `chronicHardship.ts` (escalating hardship signal) and `bandTendency.ts` (deterministic per-band tendency vector), plus a crossing-practice learning loop.

**Evidence this shipped:** `src/sim/agents/chronicHardship.ts`, `src/sim/agents/bandTendency.ts`, and `src/sim/agents/crossingPractice.ts` all exist in the current tree (confirmed by directory listing 2026-07-14). `git log --oneline --follow -- src/sim/agents/chronicHardship.ts` shows only one commit touching this file: HEAD itself (`30a87b3`, "checkpoint: establish living ecology and all-map foundations") — confirming §9.10's note that this is a squashed/consolidated history with no earlier per-checkpoint commits to inspect. So the causal-agency-repair work is real and present in `main`, but folded into the single squash commit with no separate commit boundary to cite. This checkpoint is **not currently named anywhere in this document's §14 roadmap** — it predates the squash and should be treated as already-completed background, not upcoming work. Whether the diagnostic's own acceptance tests (its §15.12, e.g. "two bands, identical tile/demography/memory, different lineage seed → measurably different action distributions over 20y") were ever run and passed is **UNCERTAIN** — not verified in this pass.

### 9.9 All-map ecology validation and dynamic richness

```text
Commit: f33bebc23ecc21b971c98b48b31ca8bbfa9d2209
Expected backup branch: checkpoint/all-map-ecology-f33bebc
```

**Status: SUPPORTED BY ACCEPTED REPORTS; branch existence unverified here.**

Reported result:

- ecology validated across maps;
- dynamic richness/projections improved;
- working tree reported clean;
- prior context described this tip as not pushed, while the current prompt expects a backup branch to exist. Resolve actual local/remote state rather than assuming either statement remains true.

Caveat:

- exact maps, projection parity, cache behavior, and current branch location require inspection.

### 9.10 Squashed/current main foundation

```text
Expected main: 30a87b3aab96dc9b6276a5e148458ad9772770e0
Expected message: checkpoint: establish living ecology and all-map foundations
```

**Status: USER-SUPPLIED EXPECTED STATE, not verified.**

Interpretation:

- current `main` is expected to consolidate the living-ecology and all-map foundation.

Do not assume the expected hash is present. Resolve it before work.

---

## 10. Implemented demographic persistence and remaining logistical blocker

### 10.0 Accepted result — 2026-07-14

**Status: PASS.** The checkpoint proved a mixed cause and repaired only the
downstream part. The physical-food pipeline remains unchanged.

- The same canonical nutrition deficit was behaviorally stacked in fertility,
  mortality, direct chronic subtraction, baseline trimming, crisis-label bites,
  and the positive-growth cap. Attribution fields were overlapping labels but
  never additive population removals.
- The deterministic 2×2 was material. Over ten years, Map 1 changed from
  `155→137` with legacy stacking to `155→152` with actual food and de-stacked
  demography, while adequate maintenance food produced `155→158`. Map 2 changed
  from `238→205` to `238→221`; adequate food produced `238→241`. Adequate food
  plus de-stacked demography matched adequate food plus legacy demography because
  all nutrition terms were neutral. Repeated fingerprints and diagnostics-off
  parity were exact.
- Production now derives one canonical ordinary nutrition pressure
  `P = clamp01(current×0.38 + recent×0.26 + chronic×0.48 − recovery×0.14)` and
  one nonlinear severe-chronic hazard
  `H = clamp01(max(0, P−0.72)/0.28 × chronic)`. Food fertility suppression is
  `clamp01(P×0.22 + H×0.22)`; ordinary food mortality is `P×0.36` through the
  existing mortality weight `0.014`; severe chronic deficit subtracts
  `H×0.008` once. The healthy baseline is `0.002` and the existing fertility
  basis/weight (`0.14` bonus, `0.012` rate weight) remain.
- Removed production applications: `chronic×0.20 + recent×0.10` fertility
  restacking, `chronic×0.28` mortality restacking, direct `chronic×0.006`, the
  chronic baseline trim `0.0006`, crisis-label bites `0.002/0.0035/0.006`, and
  the chronic positive-growth-cap trim. The previous formula remains only in a
  non-persisted `legacy_stacked` diagnostic mode.
- Controlled 50-year runs support stable healthy and moderate regimes,
  marginal decline without decline-cap pinning, recovery after temporary
  deficit, and terminal extinction under known-zero food. Gross accounting
  reconciles exactly.
- The remaining upstream problem is practical reach, not an identified food
  arithmetic defect. Transport and processing losses were small; high support
  could be harvested successfully, but moderate/marginal/water-limited cases had
  many exhausted, failed, or absent local activity attempts. Knowledge coverage
  was not the bottleneck. Do not inflate local yield: overnight travel,
  provisioning, task camps, field processing, repeated retrieval, and return
  logistics belong to the next checkpoint.

The implementation deliberately retains the bounded single-net-rate
architecture. It can model net persistence and exposes gross annual churn, but
it cannot honestly claim causal reproductive-age fertility or independent gross
birth and ordinary-mortality hazards. Age cohorts are still reconciled to the
net result. A future hybrid aggregate-hazard model is preferable when
genetics/kinship or genuinely causal cohorts require it; it was not necessary
for this bounded repair.

### 10.1 Historical observed problem

Accepted diagnostic context reports:

- an ordinary world may decline approximately `190 → 80` over about 50 years;
- the decline is close to the configured maximum trajectory of roughly `-1.8%` annually;
- default ten-year lineages were all declining;
- births occurred but failed to replace deaths.

This is a real simulation behavior, not merely a UI display problem.

### 10.2 Historical pre-separation evidence

In a controlled tested band:

- actual nutrition pushed the band toward death accumulation;
- food-neutral conditions flipped the same band toward birth accumulation;
- extreme age structure did not materially alter the net rate;
- removing acute/sickness pressure only slightly reduced decline;
- nutrition is the proximate switch.

At checkpoint entry this evidence demonstrated sensitivity but did not yet isolate the ultimate causal defect; §10.0 records the completed separation.

### 10.3 Resolved causal alternatives and retained evidence

#### Upstream possibility: usable food is too low or unreliable

The pre-registered upstream causes tested were:

- physical receipts are genuinely insufficient;
- bands fail to discover or select available resources;
- logistical activity range is too short;
- transport or processing reduces usable support excessively;
- labor/care burden prevents adequate retrieval;
- selection policy overuses risky or low-return activities;
- support fluctuates too strongly across seasons;
- nutrition history remains stressed too long after recovery;
- resource signs or memory are too stale or weak;
- all-map stock initialization is viable physically but inaccessible behaviorally.

Do not solve these by inflating local food or adding hidden support.

#### Downstream possibility: demography overreacts

**UPDATE — Stage 0 arithmetic proof is now DONE** (established 2026-07-13, real spec at `docs/superpowers/specs/2026-07-13-food-demography-separation-design.md`, read directly against `demography.ts`/`humanFoodSupport.ts` on that date). Proven, not hypothesized:

- Population change **is** a single net rate: `growthRate` (`demography.ts:318`) → `advancePopulationAccounting` (`:2128`): `rawDelta = population × growthRate`; only one of `growthAccumulator`/`mortalityAccumulator` accrues per season (sign of `rawDelta`).
- `crisisDeaths`, `waterStressDeaths`, `starvationDeaths` (`:2615-2646`) are computed **after** population is already decided and write only into churn *label* fields — **they do NOT subtract population and are confirmed NOT the de-stack target.** (This corrects the original draft's framing below, which treated this as an open hypothesis.)
- The genuine duplication is **inside the single net rate**: nutrition enters `growthRate` through *multiple* pathways reading the same canonical signal — `mortalityPressure`'s `foodMortalityContribution` (`:259`, feeds `growthRate` at `−0.014`), a separate `chronicDeficitStress·0.006` subtraction (`:322`), a separate `severeRepeatedSeasonalBite` term (`:310-317,323`), `fertilityPressure` suppression via `foodFertilitySuppression`/`foodPerPersonStress` (`:256-264`, feeds `growthRate` at `+0.012`), and a `survivalBaseline` trim when `chronicDeficitStress > 0.2` (`:309`). `foodPerPersonStress`/`chronicDeficitStress` are themselves blends of current/recent/chronic (`seasonalSurvival.deriveCanonicalNutritionState:61-72`), so the same deficit is read several times.
- The model **is** structurally net-rate: no simultaneous gross births+deaths in one season (only the balanced, net-zero elder-replacement cycle in `advanceAgeCohorts`); age structure is *reconciled to* the net-decided population, not a *driver* of vital rates. `demographicRenewal.ts` itself documents: reproductive-capable adults are not modeled separately, working adults are only an age-structure proxy.

**Consequence:** the de-stack target was the *redundant nutrition pathways inside `growthRate`* — not the attribution fields, which remain. Stage 1 proved materiality and §10.0 records the resulting production model.

Original draft's hypothesis list (superseded above where it overlaps):

- current, recent, and chronic food stress are correlated aliases applied multiple times — **CONFIRMED**, see above;
- a single net growth rate is too sensitive — **CONFIRMED structurally net-rate**, sensitivity itself still gated on the 2×2;
- positive net rate advances births while negative net rate advances deaths, creating asymmetric accumulation — **CONFIRMED**, this is exactly `rawDelta`'s sign-gated accrual;
- attribution fields such as `crisisDeaths` and `starvationDeaths` overlap rather than represent separate removals — **CONFIRMED but reclassified**: they overlap as *labels*, but were never separate removals to begin with, so there is nothing to de-stack there;
- cohort/reproductive structure contributes little to actual fertility — **CONFIRMED**, age structure is reconciled not driving;
- age structure is mostly decorative — **CONFIRMED**, same finding;
- nutrition thresholds or history windows produce hysteresis inconsistent with recovery — not directly addressed by Stage 0; still open;
- mortality attribution and population removal are conflated — **CONFIRMED they are separate** (attribution is post-hoc labeling of an already-decided removal, not a second removal).

This was the binding pre-registered gate: no pathway was removed until the controlled 2×2 proved the duplication material.

### 10.4 Historical pre-checkpoint conclusion

> **Historical gate, now resolved:** demography alone was not assumed to be the
> ultimate root cause. The completed 2×2 proved a mixed downstream/upstream cause.

The completed checkpoint preserved attribution between:

1. physical ecology and usable support;
2. knowledge/activity/logistics;
3. nutrition history;
4. demographic response.

### 10.5 Research constraints used in calibration

The bounded review used primary or high-quality academic work on ovarian
function under energetic stress (Ellison et al., 1993), nursing and birth
spacing among the !Kung (Konner and Worthman, 1980), small-scale society life
history and growth (Walker et al., 2006), hunter-gatherer mortality (Gurven and
Kaplan, 2007), mortality during food insecurity/famine, recovery after famine,
small-population stochastic extinction, and age-dependent branching models.

The robust constraint adopted is qualitative: energetic stress may suppress
fertility before severe deprivation produces a large mortality hazard, and
recovery should release the temporary suppression. That evidence changed the
model from several linear penalties at moderate deficit to an ordinary
fertility response plus a nonlinear severe-chronic mortality tail. Society-
specific birth intervals, life expectancies, and growth rates were not copied;
they are context-specific and debated, while this simulator uses bounded
aggregate abstractions.

---

## 11. Completed checkpoint specification

# FOOD–DEMOGRAPHY SEPARATION / DEMOGRAPHIC PERSISTENCE-1

**Status: COMPLETE — PASS (2026-07-14).** The text below preserves the accepted
pre-registered gates; §10.0 records the implemented result.

### 11.1 Goal

Determine whether long-run population decline is primarily caused by:

- insufficient or unreliable upstream food support;
- duplicated or overly strong downstream demographic pressure;
- an interaction between both.

Repair only what controlled evidence proves.

### 11.2 Stage 0 — arithmetic proof — **STATUS: DONE (2026-07-13)**

See §10.3 above for the full proven inventory, read directly from `demography.ts`/`humanFoodSupport.ts`. Summary of the classification:

- **explanatory attribution (not a removal):** `crisisDeaths`, `waterStressDeaths`, `starvationDeaths` — computed post-hoc from an already-decided `rawDelta`; write only into churn label fields.
- **duplicated pressure (historical entry formula; materiality proven by Stage 1):** `foodMortalityContribution` inside `mortalityPressure` (`−0.014` weight), separate `chronicDeficitStress·0.006` subtraction, separate `severeRepeatedSeasonalBite` term, `fertilityPressure`'s `foodFertilitySuppression`/`(1−foodPerPersonStress)·0.14` (`+0.012` weight), and the `survivalBaseline` trim at `chronicDeficitStress > 0.2` — all read overlapping current/recent/chronic blends of the same underlying deficit.
- **structural, not a bug:** the net-rate model itself (single `growthRate`, sign-gated accrual, age structure reconciled not driving).

Stage-2 gate result: MET; Stage 1 showed the duplication was material before the production formula changed.

### 11.3 Stage 1 — controlled 2×2 — real definitions from the spec (2026-07-13)

The implemented causal measurement runs ten years on both default worlds (`map1` 155-start, `map2` 238-start), no `runSeed` jitter, after an excluded eight-season nutrition-history warm-in. Expensive 300-year map runs and the 500-year Map 2 confirmation validate the selected production model separately; they are not repeatedly used to tune the 2×2.

| Cell | Food | Demography | Reads |
| --- | --- | --- | --- |
| 1 | actual | actual | real baseline; reproduces the known collapse |
| 2 | adequate | actual | isolates demography — if it still collapses even when fed, demography kills on its own |
| 3 | actual | de-stacked (diagnostic) | isolates the food pipeline under a de-duplicated rate; previews a *possible* Stage-2 |
| 4 | adequate | de-stacked (diagnostic) | survival control; if it still dies, something outside food+demography is implicated |

**Neutral-food threshold — exact, not assumed 1.0:** from `humanFoodSupport.ts`/`seasonalSurvival.ts`: ledger `foodStress = clamp01(1 − rawSupportRatio)` ⇒ needs `rawSupportRatio ≥ 1`; `recentFoodStress` needs `rolling4SeasonSupport ≥ 1`; `chronicFoodStress = 0` only with `chronicDeficitStreak = 0` and `deficitSeasonsLast8 = 0` (deficit classification triggers below `rawSupportRatio < 0.92`, recovery at `≥ 0.98`). "Adequate/neutral" = the support+history state where `deriveCanonicalNutritionState` returns the all-zero neutral vector — support pinned at/just above the recovery threshold, no surplus (so no growth boom). Because recent/chronic read a rolling window, the arm must wash/seed nutrition history first and exclude a **≥8-season warm-in** from measurement.

**Diagnostics mechanism — implemented, threaded, never persisted:** optional runner diagnostics flow through `stepSim`/season advance and social context to the canonical food-ledger and demographic seams. `WorldState` does not contain diagnostic configuration. Adequate food uses real adult-equivalent demand at the ledger boundary, maintenance ratio `1`, and an excluded eight-season history warm-in. Default `undefined` and explicit `actual` produce identical snapshots and fingerprints.

The "diagnostic de-stacked" path is not automatically a production fix. It is an instrument, gated per §11.5's pre-registered rule.

### 11.4 Stage 1B — food waterfall

Trace the full causal waterfall:

```text
physical ecology
→ knowledge
→ activity selection
→ physical harvest
→ transport and processing
→ usable support
→ demand
→ current/recent/chronic stress
→ fertility/mortality
```

For each stage, report:

- available physical stock;
- band-known opportunity;
- selected activities and labor;
- attempted versus successful return;
- gross receipt;
- losses or processing;
- usable support;
- demand;
- nutrition thresholds/history;
- demographic contribution.

The waterfall must identify the first stage where a viable world becomes persistently inadequate.

### 11.5 Stage 2 — evidence-gated demographic repair

**Pre-registered decision rule (fixed before running, from the real spec):** apply the demographic de-stack **only if** Stage 0 classifies specific nutrition pathways as genuinely redundant (done, see §11.2/§10.3) **and** the 2×2 shows the redundancy materially drives collapse — specifically, cell 2 collapses far less than cell 1, **and** cell 3 survives materially better than cell 1. If met: consolidate the redundant net-rate nutrition pathways (mortality-side and fertility-side) into one canonical coefficient each; **keep** crisis/water/starvation attribution counts for reporting; rerun the **unchanged** food pipeline; before/after audit; separate commit from Stage 3.

Do not precommit to “de-stacking.”

Productionize only the smallest demographic change proven by the 2×2 and arithmetic proof.

Possible evidence-gated outcomes:

- correct attribution-only fields;
- remove a duplicated population subtraction;
- separate correlated stress signals;
- change a history window;
- restore age/reproductive causality;
- replace or bound a pathological net-rate accumulation seam.

Each change requires:

- a targeted fixture;
- a negative test;
- diagnostics-off parity;
- nonviable-collapse protection;
- long-run regression.

### 11.6 Stage 3 — conditional food-stage repair

**Pre-registered decision rule:** after Stage 2, test whether bands that are demographically viable **and** on high available+known ecology are *systematically* fed below demand. If **no** — stop; remaining collapse is honest scarcity, food calibration is unwarranted, report and defer. If **yes** — localize the waterfall drop (§11.4) to the single **smallest** stage and repair only that; if the drop is at the access/reachability stage, this is the deferred logistical-range/expedition architecture (roadmap item 2, §14) — report it honestly with waterfall evidence and recommend it as its own checkpoint, do not fake-fix here. Separate commit isolating the one stage changed. Stages 2 and 3 are never tuned jointly toward a target population.

Repair only a small, clearly identified upstream defect.

Examples of legitimate defects:

- a physical receipt is dropped;
- a transport/processing factor is applied twice;
- a selected activity cannot reach physically intended targets due to a bug;
- known resource evidence is not considered;
- a cache remains stale;
- a seasonal stock is initialized incorrectly.

Forbidden response:

- inflate local food to hide limited logistical range;
- add generic food floors;
- make habitat potential edible;
- grant hidden resources;
- add benchmark-specific survival.

### 11.7 Stage 4 — structural evaluation

Compare:

1. current net-rate model;
2. bounded gross-birth/gross-mortality model;
3. hybrid aggregate hazards.

Evaluation axes:

- interpretability;
- cohort relevance;
- deterministic behavior;
- stability;
- calibration requirements;
- state size;
- compatibility with future kin/household systems;
- performance;
- auditability.

A full demographic rewrite is not automatically required in this checkpoint.

### 11.8 Guards

- no generic food floor;
- no benchmark-specific survival exception;
- no joint food/fertility tuning until attribution is preserved;
- no hidden food;
- no static richness as calories;
- no removal of attribution fields without proof;
- no masking expedition-range limitations;
- no weakening nonviable-collapse controls;
- no UI-only “healthy” status;
- no random recovery events;
- no persistence of diagnostic controls in canonical world state.

### 11.9 Validation strategy

Use short deterministic iterations first.

Then:

1. controlled unit/fixture tests;
2. deterministic 2×2;
3. food-waterfall trace;
4. medium-run scenario regression;
5. 300-year Map 1;
6. 300-year Map 2;
7. 500-year Map 2 confirmation.

Long runs begin only after the implementation and metrics are stable.

Required report:

- initial state and seed;
- warm-in;
- measured interval;
- actual versus neutral food;
- actual versus diagnostic demography;
- births/deaths/support/demand;
- terminal outcomes;
- determinism;
- performance and state growth;
- caveats.

---

## 12. Known limitations and architectural debt

Each item must be reclassified after repository inspection.

### 12.1 Demographic net-rate structure

**Status: PARTIAL / active investigation.**

A single net-rate path may drive birth accumulation when positive and death accumulation when negative. This can create sensitivity and obscure gross mechanisms.

### 12.2 Weak reproductive-age causality

**Status: PARTIAL, supported by diagnostic report.**

Extreme age structure reportedly did not materially alter net rate. Verify whether reproductive-age cohorts affect fertility, whether cohorts are merely displayed, and how births enter cohorts.

### 12.3 Short logistical activity range

**Status: PARTIAL.**

Activity parties exist, but effective range may be too local. This can make physically viable food inaccessible and may contaminate demographic calibration.

### 12.4 Expedition/task-group depth

**Status: PARTIAL.**

Hunt, gather, fish, and explore subgroups reportedly exist. Duration, staged travel, task camps, provisioning, transport, field processing, repeated retrieval, viewshed, and fire/smoke remain future strengthening targets.

### 12.5 Seasonal fish-run depth

**Status: UNCERTAIN.**

The prompt identifies a possible limitation where seasonal fish runs may be taxonomy-only in defaults. Verify current code before preserving this claim.

### 12.6 Procedural biome labels

**Status: UNCERTAIN.**

The prompt identifies a possible limitation where procedural biome labels may remain unknown or shallow. Verify map generation and UI.

### 12.7 Social buffering

**Status: PLANNED.**

No claim is made that exchange, mutual aid, adoption, rescue, alliance support, or household buffering is currently implemented.

### 12.8 Household and kin systems

**Status: PLANNED.**

Households, caregiving organization, kin-distance heuristics, inheritance, and learned incest avoidance belong to later major human-systems work.

### 12.9 Culture, language, and religion

**Status: PLANNED.**

Band identity or naming fragments must not be mistaken for full cultural, linguistic, normative, or religious systems.

### 12.10 Disease depth

**Status: PARTIAL or UNCERTAIN.**

Sickness/risk exists in some form according to the project description, but full disease ecology and transmission depth are not assumed.

### 12.11 Chronicle depth

**Status: PARTIAL or UNCERTAIN.**

Chronicle exists conceptually, but exact bounds, grounding, post-extinction freeze, and future cultural use require verification.

### 12.12 Cache and projection limits

**Status: UNCERTAIN.**

Exact caps, invalidation, snapshot parity, and render costs must be read from current code and benchmarks.

---

## 13. Existing expedition architecture

### 13.1 Expeditions are not absent

Do not begin the next mobility checkpoint by inventing expeditions from nothing.

Accepted context states that subgroups or activity parties already:

- hunt;
- gather;
- fish;
- explore/scout.

The next checkpoint must inspect and strengthen the existing functionality.

### 13.2 Main known concern: effective range

The likely limitation is not the existence of parties but their ability to reach, use, and repeatedly exploit resources beyond the immediate residential catchment.

This is the remaining active logistical blocker. The demographic checkpoint did not hide low usable food caused by insufficient realistic activity range.

### 13.3 Future strengthening target

The expeditionary checkpoint should distinguish:

#### Local daily activities

- short duration;
- near-residential range;
- return within the same routine interval;
- low provisioning;
- direct contribution to daily support.

#### Logistical trips

- multi-step or multi-interval travel;
- explicit duration;
- staged movement;
- overnight/task camps;
- provisioning and water;
- transport capacity;
- field processing;
- repeated retrieval;
- route/corridor/crossing memory;
- labor and care constraints;
- risk and sickness exposure;
- viewshed and line-of-sight;
- fire/smoke as physical or perceptual signals.

### 13.4 Research constraints

Use literature on:

- residential versus logistical mobility;
- central-place foraging;
- task groups;
- field camps;
- processing and transport;
- provisioning;
- care constraints;
- route knowledge;
- visibility;
- fire and smoke.

Do not encode one ethnographic case as a universal rule.

### 13.5 Settlement boundary

A task camp is not automatically a settlement.

Persistent settlement should require separate causal conditions such as repeated use, storage, care, defensibility, seasonal reliability, transport, social relationships, and residence duration.

---

## 14. Exact roadmap

Demographic persistence is implemented. This future order is canonical:

1. **EXPEDITIONARY LOGISTICAL MOBILITY / TASK CAMPS / VIEWSHED PERCEPTION / FIRE SIGNALS-1.**
2. **CROWDING / RANGE RELEASE / GENERATIONAL DEPARTURE / VIABLE FISSION-1.**
3. **SEASONAL ROUTE MIGRATION / VARIABLE NOMADIC ROUNDS-1.**
4. **LANGUAGE / SEMANTIC COMMUNICATION / NAMING / DIALECT EVOLUTION-1.**
5. **BAND CULTURE / IDENTITY / VIEWS / CUSTOMS / NORMS-1.**
6. **INTER-BAND ENCOUNTERS / RELATIONSHIP MEMORY / EXCHANGE NETWORKS-1.**
7. **RELIGION / MYTH / RITUAL / SACRED LANDSCAPE-1.**
8. **SMALL-SCALE CONFLICT / FEUD / RETALIATION-1**, followed later by alliances, raids, and organized war.
9. **EMERGENT TRAILS / ROUTES / ROADS / SEDENTISM.**
10. **Major missing human biological and social systems.**
11. **WHOLE-SIM CAUSAL CONNECTIVITY / DECORATIVE SYSTEMS AUDIT.**
12. **PUBLIC POLISH + MVP CLOSURE.**

Roadmap rules:

- do not implement later systems inside an earlier checkpoint unless required as a minimal seam;
- do not leave completed work permanently labeled future;
- move verified results into current architecture;
- record accepted commit and audits;
- preserve caveats;
- advance the active checkpoint explicitly.

---

## 15. Major missing human systems

**Status: PLANNED.**

Preserve these threads without prematurely fixing their architecture:

### Biological population depth

- simple population genetics;
- heritable variation;
- inbreeding depression;
- mortality, fertility, and developmental risk;
- lineage effects compatible with aggregate performance.

### Kin and incest avoidance

- learned incest avoidance;
- kin-distance heuristics;
- norms and taboos that may emerge without omniscient genealogy;
- uncertainty and social learning.

### Household and caregiving organization

- household structure;
- caregiving;
- dependents;
- flexible labor organization;
- resource sharing and social buffering.

### Flexible age and gender labor patterns

- variable labor roles;
- age- and context-sensitive participation;
- no universal gendered division;
- care, skill, risk, health, pregnancy, ecology, and local norms as constraints.

### Prestige, authority, and leadership

- prestige;
- authority;
- leadership;
- dispute resolution;
- context-dependent and historically grounded legitimacy.

### Death, grief, and social continuity

- grief;
- death practices;
- memory of the dead;
- social consequences of loss;
- later ritual interpretation.

### Childhood learning and cultural transmission

- childhood learning;
- socialization;
- imitation;
- teaching;
- deeper cultural transmission;
- dialect and norm inheritance.

### Social buffering and rescue

- mutual aid;
- adoption or rescue where appropriate;
- joining or absorbing vulnerable survivors;
- stronger human resilience without generic survival floors.

Do not invent implementation details until the relevant checkpoint can inspect current state ownership and performance constraints.

---

## 16. Research and anthropological constraints

Future systems should use academic research to constrain the range of plausible mechanisms. Research informs possibilities and tradeoffs; it does not dictate a universal script.

### 16.1 Expeditions and mobility

Research topics:

- residential versus logistical mobility;
- central-place foraging;
- task groups;
- field camps;
- duration and staged travel;
- processing and transport;
- provisioning;
- care constraints;
- route knowledge and landscape learning;
- visibility and viewsheds;
- fire and smoke.

### 16.2 Human diversity

Avoid hardcoding:

- men always hunt;
- women always gather;
- children never contribute;
- elders only consume;
- all groups optimize perfectly;
- all mobility is calorie-maximizing;
- all smoke has coded meaning;
- all task camps become settlements;
- all societies follow one family or residence model;
- all prestige becomes coercive leadership;
- all religion begins from the same trigger.

### 16.3 Scientific grounding without false precision

Use research to choose:

- plausible ranges;
- causal mechanisms;
- constraints;
- uncertainty;
- sensitivity tests.

Do not claim archaeological or anthropological certainty the model cannot support.

### 16.4 Cultural systems attach to lived history

Culture, language, norms, religion, and identity should respond to:

- repeated practices;
- relationships;
- ecology;
- movement;
- conflict;
- care;
- death;
- remembered events;
- transmission.

Do not load independent content packs and then call the result emergent.

---

## 17. Audit and verification guide

### 17.1 Command warning — RESOLVED, see AGENTS.md §8

AGENTS.md §8 now has the verified command list, the exact standalone audit script filenames, and the exact `simBenchmark.mjs --targeted-*` flag names for the audits this section references below (confirmed 2026-07-14 by reading `package.json` and grepping `scripts/simBenchmark.mjs`). None of these were *executed* in this documentation pass — "file/flag exists" is not the same as "currently passes." The deterministic benchmark was previously reported as `deterministic=true`; that remains historical evidence, not a current PASS, until rerun.

```bash
npx tsc -p tsconfig.json --noEmit
npm run build
node --check scripts/simBenchmark.mjs
npm run sim:benchmark -- --deterministic
```

### 17.2 Invariant table

**Command lookup:** most `REQUIRES VERIFICATION` command cells below now have a confirmed file or flag name in AGENTS.md §8 (e.g. "canonical food-pipeline audit" → `node scripts/livingEcologyFoodPipelineAudit.mjs`; "resource anti-omniscience audit" → `--targeted-resource-anti-omniscience-audit`). This pass verified the *names exist*, not that each currently passes — cross-reference AGENTS.md §8 rather than treating the cells below as still fully unresolved.

| Invariant | Relevant command/audit | What failure means |
| --- | --- | --- |
| Type safety | `npx tsc -p tsconfig.json --noEmit` | Type contracts or build graph are inconsistent; not a behavioral verdict |
| Production build | `npm run build` | Application cannot build; behavioral PASS impossible |
| Benchmark script parses | `node --check scripts/simBenchmark.mjs` | Benchmark harness is syntactically invalid |
| Deterministic replay | `npm run sim:benchmark -- --deterministic` | Same inputs diverge or benchmark integration changed |
| Only physical receipts feed humans | canonical food-pipeline audit — command **REQUIRES VERIFICATION** | Hidden/static/diagnostic food authority leaked into nutrition |
| Living stocks causally interact | trophic-coupling audit — command **REQUIRES VERIFICATION** | Ecology is decorative, disconnected, or incorrectly ordered |
| All maps initialize equivalent ecology | all-map ecology audit — command **REQUIRES VERIFICATION** | A scenario/constructor bypasses canonical initialization |
| Population renewal behaves causally | demographic-renewal/persistence audit — command **REQUIRES VERIFICATION** | Birth/death response, history, or support is pathological |
| Activities change physical state | causal-agency audit — command **REQUIRES VERIFICATION** | Parties/statuses exist without material consequences |
| Movement uses the intended hot path | movement hot-path audit — command **REQUIRES VERIFICATION** | Alternate or stale path bypasses canonical movement |
| Hardship outcomes are real | hardship-outcome audit — command **REQUIRES VERIFICATION** | Intent or narrative diverges from physical resolution |
| Extinction is terminal | terminal-extinction audit — command **REQUIRES VERIFICATION** | Archived bands continue living behavior or resurrect |
| Return kinds are explicit | return-kind audit — command **REQUIRES VERIFICATION** | Generic returns can be miscounted as food or other effects |
| Fauna decisions are non-omniscient | fauna anti-omniscience audit — command **REQUIRES VERIFICATION** | Bands use hidden animal truth |
| Resource decisions are non-omniscient | resource anti-omniscience audit — command **REQUIRES VERIFICATION** | Hidden stock/potential leaks into decisions |
| Plant stock is physical and bounded | plant-stock audit — command **REQUIRES VERIFICATION** | Harvest/recovery is decorative, negative, or unbounded |
| Fauna stock is physical and bounded | fauna-stock audit — command **REQUIRES VERIFICATION** | Hunting/predation/recovery does not affect canonical stock |
| Routines influence later behavior | ROUTINES-2 audit — command **REQUIRES VERIFICATION** | Learning is a label with no future reader |
| Adaptation changes real coefficients | adaptation/invention audit — command **REQUIRES VERIFICATION** | Idea/experiment state is decorative |
| Cached and uncached projections agree | dynamic-snapshot parity audit — command **REQUIRES VERIFICATION** | UI/debug layers are stale or non-deterministic |
| Architecture graph is coherent | graph-integrity command **REQUIRES VERIFICATION** | Missing nodes/edges, forbidden dependency, or disconnected system |
| Diagnostics-off state is identical | active checkpoint parity fixture — command **REQUIRES VERIFICATION** | Diagnostic instrumentation changes canonical simulation |
| Food/demography attribution is separated | controlled 2×2 audit — command to be added/verified | Root-cause conclusion is not evidence-based |

### 17.3 What an audit proves

For every audit, document:

- production entry point exercised;
- fixture/scenario;
- controlled overrides;
- deterministic seed;
- duration;
- assertions;
- negative assertions;
- state serialized;
- what the audit does **not** prove.

Examples:

- A controlled plant-stock fixture does not prove all procedural maps initialize correctly.
- A terminal-extinction unit test does not prove every reducer respects archived state.
- A deterministic benchmark does not prove scientific calibration.
- An object-creation audit does not prove a later behavioral reader.
- A UI snapshot does not prove physical causality.

### 17.4 PASS language

Use one of:

- “Executed on this branch and passed.”
- “Declared audit exists; not executed in this pass.”
- “Last accepted checkpoint report stated PASS.”
- “Failed.”
- “Partial/progress; gate not met.”

Never blur them.

---

## 18. Common failure patterns

### 18.1 Changing UI without behavior

A card, map color, tooltip, or status changes while authoritative state and decisions remain unchanged.

### 18.2 Direct world-truth reads

A band decision receives the world object and reads exact stock, habitat, or route state without passing through knowledge.

### 18.3 Projection becoming authority

A cached map snapshot, inspector selector, or technical richness value feeds food, movement, or demography.

### 18.4 Repeated stress aliases

Current, recent, chronic, crisis, starvation, shortage, or support-gap fields represent correlated state but are all applied as independent penalties.

### 18.5 Benchmark-specific exceptions

A scenario name, seed, map ID, year, or population threshold receives special survival logic.

### 18.6 Global food or fertility buffs

Coefficients are raised broadly before identifying the first broken stage in the food waterfall.

### 18.7 Hardcoded scenario names

Production logic checks a benchmark or map label rather than physical state.

### 18.8 Fake variety through random assignment

Culture, outcomes, inventions, or events are randomly selected without causal prerequisites or learned state.

### 18.9 Breaking terminal extinction

A dead band moves, learns, reproduces, writes living history, exerts ecological pressure, or resurrects through stale accumulators.

### 18.10 History continuing after archival freeze

Chronicle adds ordinary living events to an extinct/archive-only band.

### 18.11 Unbounded records

Histories, memories, activities, experiments, projections, caches, or event lists grow without caps or compaction.

### 18.12 Silently weakening tests

Assertions are removed, tolerances widened, fixtures made easier, or gates redefined to call a regression PASS.

### 18.13 Constructor near-misses

Default initialization is fixed while manual placement, snapshots, fission daughters, or controlled fixtures retain stale state.

### 18.14 “No disconnected paths” without negative tests

A broad architecture claim is made after checking only the happy path.

---

## 19. Claude-specific workflow

Claude must:

1. read `AGENTS.md`;
2. read only the relevant `CLAUDE.md` sections;
3. inspect branch, `HEAD`, commit subject, and working-tree status;
4. verify the active checkpoint against tracked handoff/specs and current code;
5. reproduce the problem before editing;
6. identify authoritative state, writers, readers, projections, and lifecycle seams;
7. select the smallest architecture consistent with current code;
8. implement minimally;
9. add targeted negative tests;
10. run the focused audit and regression matrix;
11. inspect the full diff;
12. update `AGENTS.md`, `CLAUDE.md`, and active tracked handoff/specs;
13. run `git diff --check`;
14. commit explicitly;
15. report PASS/FAIL honestly;
16. leave a clean tree;
17. do not merge;
18. do not push unless asked.

### Prompt difficulty labels

Every implementation prompt begins with exactly:

- `EASY`
- `HARD`
- `EXTREME`

Major architecture checkpoints use `EXTREME`. `HARD` is the normal default for substantial work.

### Architecture autonomy

Claude should not blindly implement a prescribed patch from a prompt. It must inspect current code and choose the architecture that preserves:

- authority;
- ordering;
- determinism;
- bounded state;
- anti-omniscience;
- physical causality;
- lifecycle safety;
- existing accepted contracts.

---

## 20. Claude near-miss rules

Before claiming closure, test the paths most likely to bypass the intended fix.

### 20.1 Terminal-state bypasses

Check:

- runner early exits;
- activity reducers;
- movement reducers;
- demographic accumulators;
- knowledge updates;
- ecology pressure;
- Chronicle;
- caches;
- UI commands.

### 20.2 Alternate constructors

Check:

- default founders;
- custom/manual founders;
- fission daughters;
- scenario-specific bands;
- fixtures;
- deserialization.

### 20.3 Snapshot paths

Check:

- save/restore;
- copied worlds;
- benchmark snapshots;
- dynamic ecological snapshots;
- cached projections;
- migrations if present.

### 20.4 Manual-placement paths

Manual placement must initialize all current fields and may not expose hidden truth through the placement UI.

### 20.5 UI projections

Prove:

- rendering does not mutate;
- selection does not reveal knowledge to behavior;
- technical truth is isolated;
- status derives from authority;
- projection caches invalidate correctly.

### 20.6 Stale caches

Create a negative test where authoritative state changes and the old cached result would be wrong.

### 20.7 Unrelated reducers mutating archived state

After extinction, execute ordinary runner paths and assert archived living state remains frozen.

### 20.8 Broad closure claims

Before claiming “no disconnected paths,” “all constructors fixed,” “all maps covered,” or “no omniscience,” add negative tests for at least:

- one alternate constructor;
- one hidden-truth case;
- one terminal case;
- one stale-cache case;
- one snapshot/restore case;
- one UI/projection case where relevant.

---

## 21. Final report template

Use this structure after implementation work:

### 1. Verdict

`PASS`, `FAIL`, or `PROGRESS — GATE NOT MET`.

### 2. Starting HEAD

- branch;
- commit hash;
- commit subject;
- initial tree status.

### 3. Files changed

List every file and purpose. Mark generated or intentionally excluded files.

### 4. Reproduced issue

Describe the controlled reproduction, seed, scenario, interval, and observed metrics.

### 5. Root cause

State what evidence proves. Separate proximate cause, ultimate cause, and unresolved hypotheses.

### 6. Architecture selected

Describe authority, writer/reader changes, lifecycle seam, and why this is minimal.

### 7. Behavior changed

Explain the physical and behavioral chain, not only types or UI.

### 8. Controlled tests

List focused fixtures, negative tests, and exact results.

### 9. Regressions

List relevant audits and whether executed now or historically reported.

### 10. Determinism

Report replay/parity result and diagnostics-off identity.

### 11. Performance/state

Report runtime impact, allocations, cache/history growth, and caps.

### 12. Graph/build/typecheck

Report exact commands and results.

### 13. Caveats

State what is not proven.

### 14. Remaining debt

List bounded next work.

### 15. Commit hash

Report the created commit and message.

### 16. Clean-tree status

Report `git status --short`.

### 17. Next recommendation

Name the exact next checkpoint or diagnostic.

---

## 22. Documentation-update contract

After every accepted checkpoint, update documentation in the same commit.

### 22.1 Always update `AGENTS.md` when

- current verified `HEAD` or checkpoint changes;
- commands change;
- source-of-truth paths change;
- repository structure changes;
- a non-negotiable rule changes;
- active blocker changes;
- roadmap order changes;
- working protocol changes.

### 22.2 Always update `CLAUDE.md` when

- architecture changes;
- lifecycle ordering changes;
- state ownership changes;
- system authority changes;
- active specification changes;
- a known limitation is resolved or discovered;
- an accepted checkpoint is added;
- roadmap changes;
- product scope changes;
- audit meaning changes;
- a major coefficient or contract changes.

### 22.3 Handoff documents

Search for tracked:

- `HANDOFF.md`;
- `docs/HANDOFF.md`;
- project-state notes;
- active specs;
- implementation plans;
- checkpoint reports.

If tracked and active, update them. If ignored, local-only, unavailable, or absent, say so.

A handoff must contain:

- last accepted commit;
- branch;
- clean/dirty tree;
- current PASS/FAIL;
- active checkpoint;
- completed work;
- blockers;
- exact next action;
- commands run;
- artifacts/patches;
- intentionally excluded files;
- push status.

### 22.4 README

Update only when public purpose, setup, controls, or user-facing feature set changes. Do not make README an engineering log.

### 22.5 Specifications

When an active spec changes:

1. update the spec;
2. update its summary here;
3. record why it changed.

When completed:

1. remove it from active status;
2. move verified results into current architecture;
3. retain concise history;
4. link accepted commit and audits;
5. preserve caveats.

### 22.6 Future objectives

When completed:

1. remove from future list;
2. add to current architecture;
3. record commit;
4. link audits;
5. preserve debt;
6. advance next checkpoint.

When abandoned:

- remove stale references;
- state why if architecturally important;
- clean AGENTS, CLAUDE, handoffs, and specs.

### 22.7 Project-purpose changes

Update:

- top description in both files;
- README if public-facing;
- causal spine;
- roadmap priorities;
- obsolete assumptions;
- architecture change log.

### 22.8 Staleness prevention

This file must always contain:

- `Last verified against commit`;
- `Last updated`;
- `Current active checkpoint`;
- `Known stale or unverified sections`.

If a section cannot be verified:

- mark it;
- do not guess;
- do not leave it sounding authoritative.

### 22.9 Cross-document consistency gate

Before commit:

1. compare AGENTS and CLAUDE;
2. confirm same active checkpoint;
3. confirm same roadmap order;
4. align current/future classifications;
5. verify hashes;
6. verify every listed path exists;
7. verify commands exist;
8. verify authority claims have evidence;
9. ensure ignored local documents are not claimed synchronized;
10. run `git diff --check`.

---

## 23. Architecture change log

Keep this bounded to the latest 10–15 accepted architecture changes. Condense older history instead of allowing unbounded growth.

| Checkpoint/commit | Architecture change | Remaining caveat |
| --- | --- | --- |
| `checkpoint: establish persistent human demography` (2026-07-14; exact hash in final report) | Stage 0 ledger, non-persisted controlled 2×2, waterfall, evidence-gated nutrition de-stack, Technical visibility, deterministic controlled/long-run/accounting audits, and tracked documentation contract | Single net rate and reconciled age cohorts remain; default worlds still contract where same-day practical food reach is poor; expedition logistics is next |
| Documentation pass, 2026-07-14 (historical local-only pass) | Confirmed parent HEAD/backup branch, corrected production tick order, filled repository/entry-point and command maps, synced the then-active spec | Superseded by the tracked demographic checkpoint documentation above |
| `30a87b3aab96dc9b6276a5e148458ad9772770e0` (CONFIRMED = HEAD) | Living ecology and all-map foundations consolidated on `main`; history is squashed here — earlier per-checkpoint commits (including the causal-agency-repair work, §9.8B) are not separately reachable | None remaining — branch/commit state confirmed |
| `f33bebc23ecc21b971c98b48b31ca8bbfa9d2209` | All-map ecology validation and dynamic richness | Backup branch existence, maps, caches, and current pass state unverified |
| `736214f39728767b77b4e7989dc33c7b16642239` | Hardship outcome repaired; terminal extinction fixed; typed return kinds normalized | Alternate paths need negative tests |
| `02c325d` | Living Ecology / Trophic Coupling-1C completed | Exact scope unverified |
| `8135969` | Living Ecology / Trophic Coupling-1B progress | Exact scope unverified |
| `855434cb728f85eababcd9abce8dc623e3b36068` | Canonical physical living-ecology food pipeline; `humanFoodSupport.ts` canonical aggregator | Upstream sufficiency remains unresolved |
| Accepted anti-omniscience pass | Resource/fauna decisions constrained to knowledge and observation | Helper/cache/UI leakage must be rechecked |
| Accepted invention chain | Problems, ideas, experiments, physical results, coefficients, efficacy, revision/dormancy/abandonment | Survival relevance and breadth remain partial |
| Accepted cumulative learning | Lived experience can alter later knowledge/routines | Transmission and inheritance depth unverified |
| Accepted causal-agency/movement foundation | Activity parties and movement became more causally explicit | Expedition range and logistics remain partial |

### Next change-log entry

Record expeditionary-logistics architecture only when that separate checkpoint
is explicitly begun and accepted. Do not fold it into demographic calibration.

---

## Appendix A — First repository-enabled documentation verification pass — EXECUTED 2026-07-14

Status of each step:

1. ✅ resolved `main` (`30a87b3`) and backup branch (`checkpoint/all-map-ecology-f33bebc` @ `f33bebc`) — both matched expected exactly.
2. ✅ inspected root files (`package.json`, `.gitignore`, tsconfig, `vite.config.ts`) and tracked/local docs (`README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/HANDOFF.md`, `docs/CAUSAL_AGENCY_DIAGNOSTIC.md`, `docs/superpowers/`).
3. ✅ identified exact application (`src/main.tsx`) and simulation (`simRunner.ts`/`tick/advance.ts`) entry points — §6.2.
4. ✅ documented actual runner order, correcting the original guess — §5.3.
5. ⚠️ **partial** — mapped top-level state ownership per domain (§6.2/§7 intent preserved) but did not exhaustively verify every field/writer/reader across ~90 `agents/` files; treat §7's authority matrix as directionally right, not line-verified.
6. ✅ located named audit scripts and `simBenchmark.mjs` flags — AGENTS.md §8.
7. ✅ executed only non-mutating reads (`git log`, `git rev-parse`, file reads, grep) — no `npm run build`/`sim:benchmark`/audits were actually run in this pass, so "file/flag exists" is confirmed but "currently passes" is not.
8. ✅ distinguished current evidence from historical report throughout the edits above (marked VERIFIED CURRENT vs. left as historical).
9. ✅ replaced `UNCERTAIN`/`REQUIRES REPOSITORY VERIFICATION` markers in the freshness blocks, §5, §6, §11, and AGENTS.md §4/§5/§8; markers in §7-9/§12-15's deeper claims were left in place where not independently re-verified — this was a deliberate scope decision (see Appendix A step 5), not an oversight.
10. ✅ deleted/corrected statements contradicted by code: the ecology-before-decisions tick order, and the "Stage 0 not yet done" framing of §10.3/§11.2 (Stage 0 is actually complete, per the real spec file).
11. ✅ updated `AGENTS.md` and `CLAUDE.md` together, same pass.
12. ⚠️ **not applicable as written** — both files are `.gitignore`d (confirmed in this pass), so there is no commit to make; changes are local-only. A backup of the pre-this-session versions exists at `.backup-old-agent-docs-20260714/` (outside this pass's scope, left untouched).

This file is now a **repository-verified dossier for the sections marked VERIFIED CURRENT above**, and remains a **proposed/unverified dossier** for the remainder (§7-9/§12-15's deep claims). Do not treat the unverified remainder as more trustworthy than "plausible and evidence-adjacent."
