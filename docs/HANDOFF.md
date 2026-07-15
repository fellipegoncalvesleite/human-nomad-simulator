# Project Handoff — Emergent Civilization Simulator

> **Living document.** This is the rolling handoff between AI agents. Each checkpoint,
> the agent updates the **Current Status** section (and **Recommended Next Step**) and
> appends a one-line entry to the **Checkpoint Log** at the bottom. The durable sections
> (Project Understanding, Invariants, Verification) only change when the architecture
> itself changes. The in-app architecture graph (`src/architecture/graphData.ts`) remains
> the authoritative living map; this file is the human/agent-readable narrative on top of it.

---

## Project Understanding (durable)

**What this is becoming:** A serious emergent human–environment simulator where later
social complexity (camps → settlements → cultures → polities → kingdoms) must *emerge
from causes* — ecology, knowledge, memory, learning, stress, demography, history — never
from gamey unlocks. It is **not** WorldBox, a strategy game, or a tech-tree civ game.

**Must never become a gamey unlock:** population-as-tech-tree; "resource exists →
support/food"; "rich tile → migration/city"; hardcoded civilization archetypes.
Knowing a *tile* ≠ knowing a *resource* ≠ knowing how to *exploit* it. Learning must
include refutation and mistakes, not only confidence gains. Civilization emerges from
causes.

**Core spine:** Terrain/Hydrography → Resource Ecology → Resource Knowledge →
Patch/Scout/Event Outcomes → Risk/Labor/Return → Place Memory/Learned World Model →
Movement/Demography → Culture/Settlement/History (later). Ecology must stay wired into
knowledge/memory/risk/labor/stress/movement/demography — never a detached content pack.

**Harsh-place principle:** a band staying in harsh land is not automatically a bug if the
sim can explain it (reliable water/refuge, known fallbacks, low competition, attachment,
route value, dependents, uncertainty). The bug is when the sim *cannot explain* why a band
stays/scouts/moves/splits/fails.

---

## Invariants — what must NOT be undone (durable)

- `src/sim` is pure deterministic TS: **no** `Math.random`, **no** `any`, **no**
  React/DOM/Zustand/`/ui`/`/render` imports. `WorldTime.tick` is the compatibility
  seasonal decision tick; explicit calendar fields (`day`, `seasonTick`, `dayOfSeason`)
  exist as of TIME-1A. Bounded/cached scans only (no full-map sweeps, no dense per-band
  tables, no unbounded growth).
- **Determinism is now per-(map, runSeed) (VAR-1):** same map + same `world.runSeed` + same duration =
  byte-identical. `runSeed === undefined` = legacy zero-jitter movie (all baselines/audits use this).
  Seed variation is a bounded near-tie tie-break ONLY (movement + fission target ordering) — it must
  never override ecology, leak truth richness, or touch terrain/yield/CC/depletion/demography formulas.
- Anti-omniscience: bands act on their **own** observed/scouted/inherited/inferred memory,
  never ground truth. Scouts observe through bounded partial perception; truth stays hidden.
- Knowledge is not ability: existence/presence belief must not silently grant exploitation
  skill, calories, yield, or safety certainty.
- Resource ecology is now causal through **band-known resource memory, finite patch/class
  pressure, shared catchment support, depletion/regrowth, return trends, cause-specific
  stress, movement pressure, and fission pressure** (ECO-MIG-FOUNDATION). Keep the
  anti-omniscience line strict: no hidden exact resource targeting, no report-created
  observed resources, no instant exploitation of unknown resources, and no direct
  report-driven relocation. Fauna are finite bounded stocks with ROUTINES-2 stock-level
  routine state; bands may learn animal patterns only from local signs/trips/management
  outcomes, never by copying hidden stock truth.
- **LIVING-ECOLOGY-A canonical food invariant:** only a `PhysicalFoodHarvestRecord`
  resolved by `plantStock` or `faunaStock` may add plant/fauna/aquatic calories to
  `HumanFoodSupportLedger`. Remembered habitat yield, resource-class decomposition,
  learned-support projections, visible-nature cards, and legacy AG11 shadow estimates
  are not food. Missing, exhausted, or inaccessible physical sources return zero.
  Storage and transitional residual are explicit zero-valued seams until backed by
  physical state. Do not restore a generic catchment floor to human support.
- Fission daughters inherit knowledge **partially/degraded**; debug rings and event history
  are reset, and the `DAUGHTER_NON_CLONEABLE_FIELDS` clone guard must list every such field.

## Verification (durable)

- `npm run build` — tsc + tsc.node + vite.
- `npm run sim:benchmark -- --scenario <name> --report-band` — loads TS via Vite
  `ssrLoadModule` (no build needed). Append `--deterministic` → prints `deterministic=true`.
  Perf: `--years 100|200|500 [--max-seconds N]` (~500y hits superlinear O(bands²) encounter
  scaling — pre-existing).
- Targeted regression suites (deterministic, no build):
  `--targeted-scout-regression`, `--targeted-plant-patch-check`,
  `--targeted-plant-lifecycle-check`, `--targeted-plant-eligibility-check`,
  `--targeted-plant-use-test-check`, `--targeted-patch-return-check` (2K.4),
  `--targeted-patch-return-behavior-check` (2K.5), `--targeted-exploitation-skill-check` (2K.6),
  `--targeted-skill-rank-check` (2K.7 — learned-rank delta unit gating + the deterministic scout-target
  decision flip; proves no-skill = byte-identical and skill in another class never leaks),
  `--targeted-skill-opportunity-check` (2K.8 — ANTI-STICKY: matching skill flips the chosen candidate from
  a richer river tile to a poorer skill-matched side tile; unrelated skill inert; comfortable band gate-inert
  byte-identical; current-only match creates no outward-winning candidate),
  `--targeted-learned-realized-support-check` (2K.9 — REALIZED support: no/unrelated/unseen → 0; some<competent;
  processing_learned lift; confirmed_problem blocked; out-of-footprint → 0 realized / >0 projected; DEFICIT
  founder per-capita rises with matched skill; SURPLUS band clamped → no gain (anti-sticky); capped; no tile
  yield mutation),
  `--targeted-side-patch-memory-check` (2K.10 — side probe forms bounded patch memory ONLY from an observed
  tile (inferred-only → 0); barren reveals only the fallback floor; low confidence rising within cap;
  source-tagged; no tile mutation; the formed memory binds to 2K.7/2K.8/2K.9 IFF matching skill),
  `--targeted-side-encountered-test-check` (2K.11 — a side memory at a PLANT-BEARING tile runs the cautious
  test chain → exploitationSkill accrues for that class (non-plant/no-memory/unrelated → no test); bounded by
  the mastery cap; the accrued skill binds 2K.7/2K.8/2K.9; no food/support/stress/mortality coupling),
  `--targeted-time-scale-check` (TIME-1C — daily/weekly/monthly/seasonal calendar step modes plus
  deterministic non-relocating intra-season trip records run through the common `DailyAction` registry;
  proves deterministic seasonal-compatibility behavior at 1-season and 10-season horizons; audits
  tiles-crossed, returned-same-day vs overnight/continues, max route length, movement-type distribution,
  academic-range comparison, a no-teleport breadcrumb-contiguity proof, and the no-coupling proof; weekly
  carries a calendar remainder but no extra seasonal behavior),
  `--targeted-migration-saturation-audit` (M0.10 — Map 1 + Map 2 migration/saturation audit;
  `--migration-audit-years N`, `--migration-audit-map 1|2`).
- ROUTINES-2 focused verification:
  `--targeted-routines-2-check`, `--targeted-practical-adaptation-check`,
  `--targeted-adaptive-efficacy-check`, `--targeted-fauna-stock-audit`,
  `--targeted-fauna-stocks-audit`, and `--targeted-lone-band-talk-audit`.
- **Benchmark mode caveat (M0.10):** `--fast` skips the per-season `contextFinal` pass, so fast and
  non-fast trajectories legitimately diverge at long horizons (200y+). Both are deterministic. Always
  state the mode next to recorded numbers. **Current (post-MAP1-R terrain redesign) Map 1 100y
  baseline: 325/8/3, deterministic; 200/300y not yet recorded on the new terrain.** (Historical:
  post-M0.11 on old terrain 304/640/1356; pre-M0.11 306/646/1382 non-fast.)
- Maps: Map 1 `createRegionalDebugWorld` (160×100, default) and Map 2 `createVariedMigrationWorld`
  (220×140 at a declared **~1.5 km/tile** scale (`VARIED_MIGRATION_KM_PER_TILE`), 9 explicit spawns via
  `spawnVariedMigrationBands`; scenario `map2_varied_migration`). Map 2 richness/water derive from a
  causal moisture field (coastal humidity + orographic foothill rain + surface-water proximity − rain
  shadow) with seeded deterministic noise mosaics; sub-tile creeks are authored influence corridors
  marked by the optional `Tile.hasCreek` flag (render overlay only — no sim rule reads the flag).
- Aggregate behavior audit: add `--probe-audit` (optionally `--json`) → `scoutAudit`
  block reports residenceMoved/Unchanged + per-kind/result/motivation plant-test counts and
  coupling guards.
- Graph integrity is validated in the UI (`ArchitectureMapPage.tsx`); counts can be checked
  by loading `src/architecture/graphData.ts` via `ssrLoadModule` and asserting unique node
  ids + no dangling links.

---

## Scaling Strategy — nomads → civilizations (durable; user decision 2026-06-12)

**The problem:** the sim must run 10,000-40,000+ sim-years to reach empires, but per-band per-season
full-fidelity simulation has a documented O(bands²) encounter term and world-filling grows band
counts. Engineering alone buys ~10-30×; the timeline needs ~1,000×. **The answer is not optimization
— it is that ENTITY COUNT MUST NOT GROW WITH CIVILIZATION SCALE; representation changes instead.**

**Principles (binding for future checkpoints):**
1. **Aggregation = the civilizational transitions themselves.** A settlement is ONE entity with
   aggregate demography/knowledge/politics — never N bands simulated individually. Band→camp→
   settlement→polity fusions are simultaneously the emergent story AND the complexity cap (~constant
   active-entity count per era). This is a DESIGN REQUIREMENT for the camps/settlements checkpoints,
   not a retrofit.
2. **Time resolution follows social form.** Seasonal ticks are for forager decisions; settled eras may
   run annual/multi-year economic steps with seasonality folded into rates (own checkpoint, causal).
3. **Sleeping entities (optional, pre-settlement relief):** stable bands in stable contexts may take a
   cheap steady-state path until a deterministic trigger wakes them (own checkpoint; bounded
   divergence must be audited).
4. **Engineering multiplier — PERF-1 (next dedicated perf/architecture checkpoint):** encounter
   spatial indexing via the existing 2J.2B scatter field (kills the N² term), collapse the 3× per-tick
   context passes into one incremental pass, numeric tile indices in hot loops (replace `tile:x:y`
   string keys — major GC win), move the sim to a Web Worker. Behaviour-affecting (FP order) →
   re-baselines with the full audit battery, like M0.11.

**Watcher budget (the acceptance metric for all of this): ~1 sim-century per minute of watching, in
any era** (~6 ticks/s nomad era; later eras hold the budget via aggregation + coarser ticks, not
faster hardware).

**PERF-1 is NOW THE NEXT CHECKPOINT (user declared performance the blocker, 2026-06-12; M0.14
decision rule).** Measured evidence (250y Map 1, idle headless run): heap is NOT the problem (94MB at
y250, dead-band state negligible, decisions bounded at 64) — **tick time is**: 19ms→82ms as bands grow
5→31 (cost ≈ N^1.8), and the UI advances the sim ON THE MAIN THREAD (App setInterval →
advanceWorldOneSeason), so every tick blocks rendering/input — that is the user's stutter. PERF-1
order of attack: (1) **Web Worker** for the sim loop (stutter gone regardless of tick cost; zero
behaviour risk), (2) kill the N² encounter/crowding terms via the 2J.2B spatial field, (3) collapse
the 3× context passes into one incremental pass, (4) numeric tile indices in hot loops. Re-baselines
with the full battery.

**One-origin colonization HEAT TEST (user requirement, 2026-06-12):** after PERF-1, a milestone audit:
spawn a SINGLE band, run 500-1000y, acceptance = its descendants inhabit MULTIPLE distinct regions of
the map at scale (occupied catchments, spread metrics, lineage-branch geography) — not one delimited
cluster. This is the project's core migration promise made into a named, repeatable test.

**Run-to-run variation (user requirement, 2026-06-12):** different simulations MUST produce different
histories. Today the sim is a single deterministic movie per map (no randomness anywhere). Required
design (own checkpoint, e.g. VAR-1): a RUN SEED threading deterministic seeded variation (hashNoise of
seed×band×tick at tiny weights in decision tie-breaks; optionally seed-varied spawn composition and
climate-event timing) so that SAME seed → byte-reproducible (determinism invariant preserved per
seed), DIFFERENT seeds → genuinely divergent histories. `world.seed` already exists and the UI already
has a seed input — the sim layer just never consumes it. All audits/baselines become per-seed.

---

## Current Status

### FOOD–DEMOGRAPHY SEPARATION / DEMOGRAPHIC PERSISTENCE-1 — PASS (2026-07-14)

Work was performed on `checkpoint/food-demography-persistence-1` in the clean
isolated worktree `/home/fellipe/human-nomad-simulator-food-demography`, parent
`30a87b3aab96dc9b6276a5e148458ad9772770e0`. The original checkout's unrelated
dirty `.gitignore`/handoff/local-document state was preserved. No history was
rewritten and nothing was pushed. The final report records the mandatory commit
hash; message: `checkpoint: establish persistent human demography`.

The diagnosis is mixed. Stage 0 proved that death-cause fields are overlapping
post-accounting attribution, while one canonical nutrition deficit was applied
several times inside the net rate. The deterministic 2×2 showed that the
downstream stack explained 83% of Map 1's ten-year entry decline and 48% of Map
2's; adequate physical support removed the remaining decline. Production now
uses one ordinary food pressure plus one nonlinear severe-chronic hazard. The
physical food pipeline and all food yields/conversions/losses were left
unchanged. Controlled healthy/moderate bands replace losses over 50 years;
marginal bands can decline without cap pinning; recovered bands stabilize; zero
food remains terminally extinct. Population accounting reconciles exactly.

The physical-food waterfall found no duplicate loss, bad unit conversion,
dropped receipt, stale ledger, or hidden-food defect. High-support habitat can
deliver above demand; lower practical regimes are dominated by exhausted,
failed, or absent same-day activities, not transport/processing loss or unknown
local truth. Overnight range, provisioning, task camps, field processing,
repeated retrieval, and return logistics remain architectural limitations.
They were not hidden by increasing local yield.

New non-persisted diagnostics and audits:

- `src/sim/diagnostics/foodDemographyDiagnostics.ts`;
- `scripts/foodDemographySeparationAudit.mjs` (Stage 0 ledger, four cells,
  default-off parity, waterfall, zero/intermittent/severe/recovery fixtures);
- `scripts/demographicPersistenceAudit.mjs` (controlled regimes and exact gross
  accounting);
- `scripts/demographicLongRunAudit.mjs` (Map 1/Map 2/single-origin/no-human,
  observer parity, fingerprints, state caps).

Technical now exposes the aggregate accounting warning, physical support and
demand, current/recent/chronic food state, baseline and food fertility effects,
ordinary and severe food mortality effects, accumulators, net balance, and the
dominant constraint. It explicitly does not claim that the working-adult proxy
causes fertility. Full formulas, evidence, structural evaluation, and academic
constraints are canonical in `CLAUDE.md` §§10–11; `AGENTS.md` carries only the
operational consequences and commands.

**Remaining demographic limitation:** the bounded single-net-rate model still
uses sign-gated accumulators and reconciled aggregate age cohorts. Gross churn
is visible and exact, but independent ordinary birth/mortality hazards and
causal reproductive-age structure are follow-up architecture, not part of this
repair.

**Current active checkpoint (not begun here):** EXPEDITIONARY LOGISTICAL
MOBILITY / TASK CAMPS / VIEWSHED PERCEPTION / FIRE SIGNALS-1.

### LIVING ECOLOGY FOOD PIPELINE-A — canonical causal foundation (2026-07-11)

**Phase result: PASS.** This bounded checkpoint replaces the dangerous inverted
economy in which physical ecology merely discounted an abstract food entitlement.
The irreversible ownership chain is now:

`plant patch / fauna stock world truth` → `band memory target` → `intra-season trip`
→ `stock-owned physical harvest resolution` → `exact physical depletion` →
`PhysicalFoodHarvestRecord` → `HumanFoodSupportLedger` → `adjusted support / demand`
→ `per-capita return / seasonal deficit / existing pressure and demography`.

#### Pre-pass diagnosis: every food creation and entry path

1. `habitatYield.deriveBaseHabitatPotential` and
   `deriveSeasonalEffectiveYield` created the dominant abstract support scalar from a
   **KnownTileRecord** (remembered richness, aquatic/water/storage/reliability), not
   harvest. `carryingCapacity.deriveCarryingCapacity` multiplied each known catchment
   tile by `TILE_SUPPORT`, divided it through `sharedCatchment`, and treated the result
   as food.
2. `resourceClasses.deriveResourceClassAvailability` decomposed that scalar into
   `generic_plant_food`, `animal_food`, `aquatic_food`, and `fallback_food`. It did not
   add a second total by itself, but it assigned generic meat/plants/fish without a
   stock or patch.
3. `patchExploitationKnowledge.deriveTileLearnedSupport` added a memory/skill-only
   support bonus in `carryingCapacity`; no current physical patch was required.
4. Legacy AG11 (`deriveActivitySubsistenceSupplement`) could add same-day shadow
   gathering/hunting/fishing on top of the already inclusive abstract floor when its
   audit flag was enabled: a direct double-count path.
5. `plantStock.derivePlantTileSupportEffect` only reduced the generic floor, with a
   small loss cap. No patch returned multiplier `1`, so generic plants persisted.
   `derivePlantGatherReturnFactor` also returned `1` without a patch; activity outcome
   depended on memory confidence, so a successful-looking plant return could coexist
   with no depletion.
6. `faunaStock.deriveFaunaTileSupportEffect` likewise only reduced generic
   animal/aquatic shares. No stock returned multiplier `1`; trip return factor did the
   same. Hunting **did consume stock when a stock existed**, but success did not require
   prey. A no-stock hunt could emit placeholder meat and apply no depletion.
7. Default trip `resourceReturn` and `shadowSubsistence` were normally record-only;
   physical use affected later generic multipliers rather than feeding people. This
   was an inverted causal path, not a real harvest economy.
8. No actual stored-food inventory/support path existed. `storageSuitability` is a
   knowledge/projection layer; `band.storageCapacity` is principally water carrying.
   Processing previously contributed only a plant catchment drag.
9. Food entered downstream through `CarryingCapacityState.perCapitaReturn.supportDebug`
   → `seasonalSurvival.updateSeasonalSupportState` → `pressure` and spring demography.
   Several correlated demographic stress terms remain calibrated consumers, but they
   now share one canonical physical deficit input.
10. UI `resourceEcologyFoundation` reconstructed named food shares from abstract class
    proportions, and public Food described them as what fed the band. `visibleNature`
    also rebuilt exact plant patches/depletion for remote candidate tiles. Those were
    projections, not physical support evidence, and plant reconstruction was an
    anti-omniscience leak into UI-adjacent behavior.

#### Alternatives compared and architecture chosen

- **Rejected: keep generic catchment food as a floor and add harvest supplements.**
  This is AG11's double count and still lets absent ecology feed humans.
- **Rejected: make physical stocks mere multipliers on generic class shares.** That
  preserves no-source=`1` behavior and cannot express zero prey/patch harvest.
- **Rejected: introduce one giant ecology/economy state object.** Existing modules
  already have clean owners and sparse world state; duplicating abundance would create
  divergent truth.
- **Chosen:** `plantStock.ts` and `faunaStock.ts` exclusively resolve availability and
  mutate their physical state. `resourceKnowledge`/animal learning own belief.
  `intraSeasonTrips` owns target execution and immutable receipts. The compact
  `humanFoodSupport.ts` ledger is the sole human food accountant. Carrying capacity
  consumes the ledger while retaining generic catchment values as clearly non-food
  projections for later movement/ecology work.

#### Canonical physical and knowledge ownership

- Plant truth: deterministic `plantPatches` geography plus sparse
  `WorldState.plantPatchState`; `resolvePlantFoodHarvest` selects an encountered edible
  patch, calculates seasonal/depleted availability, clamps requested take, and persists
  the exact depletion. Zero patch or exhausted patch returns zero.
- Fauna/aquatic truth: `FaunaStockGeo` plus sparse `WorldState.faunaStocks`;
  `resolveFaunaFoodHarvest` exposes only harvestable abundance above the recovery
  reserve, clamps take, removes the exact stock quantity, and raises disturbance.
  A huge/invention-shifted request at an uncovered tile remains zero.
- Knowledge: `ResourcePatchMemory`, seasonal memory, and `AnimalPatternKnowledge`
  remain target selectors. Stale confidence can still direct a failed trip. The trip's
  physical resolver then records absence/exhaustion and the existing activity-memory
  path lowers confidence/records contradiction. Knowledge never receives exact remote
  availability.
- Access: a trip harvest is eligible only if its passability-aware breadcrumb path
  actually reaches the target. Unreachable `[origin]` fallback paths return
  `failed_due_to_distance` with zero depletion/support.
- Normal plant cards now require matching resource memory, current-location encounter,
  or a recent plant receipt. Remote cards exclude exact `plantPatchState`; stale remote
  abundance/season/recovery is memory/coarse rather than reconstructed truth. Fauna
  cards continue to use persisted knowledge/old trip traces, so their perceived
  abundance can disagree with current Technical stock truth.

#### Plant vertical slice

`selectTripCandidate` chooses a band-known memory → `buildTripRecord` attempts a plant
activity → `resolvePlantFoodHarvest` requires an actual edible patch and reachable
route → take is `min(requested, current physical availability)` → sparse patch
depletion is written → transport and class processing loss are charged once → the
receipt's `usableSupport` enters the ledger. No patch/exhausted/inaccessible gives
zero; the failure still flows through activity memory.

#### Fauna vertical slice

The same trip path chooses a remembered animal/aquatic target → existing hunting-method
logic may change danger, labor, or the requested return → `resolveFaunaFoodHarvest`
requires the matching stock → physical take is clamped to harvestable abundance →
abundance is removed and disturbance raised → transport/processing losses produce
usable support. No stock means zero even for an arbitrarily large request. Existing
hunting danger, animal trace, learning, and routines remain in place.

#### Human food support ledger and double-count guard

`HumanFoodSupportLedger` distinguishes physical plant, terrestrial fauna, aquatic,
storage, transitional residual, gross harvest, transport/processing/spoilage/access
losses, total usable support, population demand, raw ratio, stress, receipt list, and
source season. It sums all latest-season receipts, caps only the Technical receipt
payload, and carries `genericCatchmentFoodConsumed:false`.

Storage/cache and transitional residual are both **zero** because neither has a real
inventory/stock owner yet. There is intentionally no abstract survival floor. Their
extension seam is explicit: add a physical stock/inventory and receipt contributor;
do not re-enable generic catchment yield. `deriveActivitySubsistenceSupplement` is no
longer called by carrying capacity, so its flag cannot create food or double count.
Learned-support and generic resource-class values remain projections only.

#### Deterministic absence and causal results

- No edible plant patch: plant harvest `0`, no plant ledger support, absence reason
  recorded, no generic replacement.
- No huntable fauna stock: fauna harvest `0`, even with request `999`; no hidden meat,
  failure can update knowledge.
- Neither modeled food source: ledger usable support `0`, demand `20`, raw ratio `0`,
  ledger food stress `1`; production seasonal support records deficit `1` and food
  stress `1`. Survival is not guaranteed or required.
- No-double-count control: a real known catchment projected `24.63` abstract support,
  but with zero physical receipts canonical adjusted support is exactly `0`. With
  controlled receipts, adjusted support equals ledger usable support exactly once.

#### Technical proof and runtime/state impact

Technical now shows each physical source kind/id/class, knownness, attempt/found state,
debug-only availability, harvested amount, depletion, losses, usable contribution,
explicit residual/storage, final support, demand, ratio and stress. Public Food uses
activity receipts for “what feeds them,” not reconstructed abstract class shares.

Persistent state impact is bounded: existing sparse `plantPatchState`/`faunaStocks`
hold physical depletion; each existing capped trip record gains one optional compact
receipt; the ledger is derived and stored inside the already persisted carrying-capacity
debug state. No dense map table or new unbounded ring was introduced. This checkpoint
is behavior-changing by design: support is currently extremely austere because broad
diet/default-world calibration is deferred. The required 500-year resource
anti-omniscience audit remained internally PASS/deterministic but reached 0 active
bands / 0 population under the new honest food scarcity. Treat that extinction as the
explicit calibration blocker, not as permission to restore abstract food.

#### Successor extension contracts — do not replace the pipeline

- Plant seasonality/regrowth: extend physical availability/recovery inside
  `plantStock`; keep the receipt interface.
- Toxicity/processing/fallback diets: add eligibility and loss/outcome rules before
  `usableSupport`, backed by the target patch; never add memory-only calories.
- Aquatic stocks: already use the fauna resolver/`aquatic_stock` receipt; deepen stock
  calibration without a parallel support path.
- Storage/cache: add a physical inventory owner that emits an explicit storage
  contribution/withdrawal receipt and spoilage; replace the current zero seam.
- Herbivore forage/predator-prey/ecological events: mutate plant/fauna physical truth
  before harvest resolution. Do not copy abundance into band knowledge.
- Default-world calibration: tune physical availability, activity cadence/success,
  transport/processing and demand after controlled three-world work. Do not restore
  generic yield.

#### Exact deferred work for the successor (Opus)

1. Calibrate default plant/fauna/aquatic availability and activity success. Current
   one-season Map 2 smoke created 216 attempted receipts but only 1 positive receipt;
   this checkpoint proves causality, not viability/balance.
2. Convert placeholder return-kind names and remaining shadow/legacy comments/audits to
   final physical terminology, then retire the dead AG11 function/types after compatibility
   audits no longer import them.
3. Rebuild `resourceEcologyFoundation.support` as a knowledge/projection view over
   receipts instead of abstract class shares; audit all public/proto-camp consumers.
4. Add real stored food/cache inventory, spoilage, processing knowledge, toxicity,
   fallback diets, and aquatic calibration through the existing ledger seams.
5. Add class-specific plant target identity (bind a trip to the remembered patch/class
   when possible rather than the richest edible patch encountered on the target tile).
6. Then, and only then, implement broad seasonality/regrowth, herbivore forage,
   predator-prey coupling, ecological events, and three-world balancing.

Focused proof command: `node scripts/livingEcologyFoodPipelineAudit.mjs`.
It covers bounded plant/fauna harvest, exact depletion, absent/exhausted controls,
invention-sized no-prey request, ledger categories, total absence stress,
no-double-counting, live production receipts, and full fingerprint determinism.


**CUMULATIVE PRACTICAL LEARNING / RECOMBINATION / ANIMAL ROUTINES-2 —
implemented 2026-07-10, PASS recommended.** The interrupted rumor fixes were
verified before new work: self-sourced reports are skipped in
`rangeFriction.deriveReportLinkedEvents`; `adaptiveHuman` counts only foreign
reports for `social_copy`; the strengthened lone-band audit directly proves
self report→0 friction, foreign report→1 friction, self report→0 copied ideas,
foreign report→1 copied idea, and zero self-referential friction. No temporary
disable/reverted guard was found. `disablePracticalReliefs` is an efficacy-only
counterfactual; `MIGRATION_WALK_ENABLED` remains true.

**Diagnosis and learning repair.** `practicalFragments` previously admitted a
fragment from any registry repetition, almost any two-tile move, one remembered
water place, or one crossing. It now requires real repeated exposure+attempt,
useful/context-bound feedback, a difficult burdened move, repeated crossing
use, two repeatedly visited watered places, or an actual watercraft experiment.
Fragments carry tentative/confident/partial/contradicted/incorrect/stale/
dormant state, observation and contradiction counts, local contexts, failure,
staleness, degraded daughter inheritance, and bounded evidence. Registry
existence alone earns nothing. Responses retain direct/crude formation,
failure-specific confidence, abandonment, simpler revision, dormancy,
regression, and rediscovery without levels or a tree.

**Bounded assembly.** Per band: 10 fragments, 5 responses, 4 efficacy records;
at most 3 active families, 6 raw variants/family, top 3 candidates, weakest-link
composition, deterministic eviction. Animal pattern knowledge is capped at 12
records ×5 evidence refs; proto-management at 4 records. Fauna remain stock
level: max 260 stocks and 13 influence tiles/stock. No Cartesian product,
individual animals, inventory, unbounded genealogy, full-map animal search, or
`Math.random`.

**Complex response.** `engineering_structure` consumes three components for a
crude bound-bundle/shuttle response (buoyancy-under-load, binding-under-load,
staged shuttle sequence), or four for a braced load-distributing response. The
effect is real and local: at most +0.22 on
`temporaryWatercraft.expectedCrossingSafety`, with at least two required
fragments grounded at the same crossing. Missing/context-mismatched components
give zero; dangerous feedback contradicts components; repeated failure can
abandon the braced response and revise to the crude one. A production-code
controlled gorge experiment raised safety 0.12→0.21 (+0.09 learned relief) but
still rejected the crossing as unsafe—real effect without magical success.
`hardshipLevel`, not the known-broken `hardshipOutcome`, is efficacy evidence.

**Animal routines and learning.** Four differentiated profiles now drive
feeding/water/rest/return/migration/roaming/camp-following/flight/young-defense,
herd cohesion/fragmentation, habituation/wariness, management stress and
reproductive recovery. Dynamic truth remains sparse and stock-level. Bands
persist place/route/season/observation/confidence/contradiction/staleness plus
direct-vs-inferred animal-pattern knowledge only from uncertain local signs,
actual animal activity traces and observable management outcomes. Normal band
views and relationship memory no longer reconstruct current hidden fauna truth;
world-truth routine aggregates are explicitly Technical/debug only.

**Proto-management.** Repeated observed knowledge may start a small feeding
trial, then temporary holding/protection. It pays labor/water/camp costs and can
produce brief proximity, habituation, holding success, escape, enclosure stress,
injury risk, reproductive failure, cost rejection, contact loss, dormancy or
abandonment. Small/medium/forest-edge game are relatively promising; waterfowl,
large/upland game are unsuitable. Feeding affects physical stock proximity and
habituation; holding/failure raises stress/wariness and reduces reproduction.
There is explicitly no domestication percentage/unlock, ownership, livestock,
breeding program or pastoralism.

**Legacy technologies audit.** `band.technologies` is still a static spawn-time
tag array, copied into snapshots/UI and inherited wholesale by daughters.
Behavioral reads are the old river capability gate; `storageCapacity` is frozen
from `basic_storage` at spawn. `plant_tending` and several presentation labels
remain static/decorative. ROUTINES-2 does not call these domestication and does
not use them for animal management; Technical now labels them honestly as
legacy static spawn tags. Replacement is deferred rather than silently
re-baselining all crossing/storage behavior.

**Verification.** ROUTINES-2 33/33 PASS; practical adaptation 26/26 PASS;
adaptive efficacy 26/26 PASS; fauna unit 11/11 PASS; fauna integration 19/19
PASS; lone-band talk PASS at 100y with zero self-friction/ungrounded rumor.
Adaptive-human remains the same known 27/28 REVIEW: only `boundedPayloads`
(66,135 bytes / 64.58 KiB versus 65,000), deterministic/static checks pass and
ROUTINES-2 state is not that projection. TypeScript/build green; graph 205/714,
0 duplicate, 0 dangling; no random/any hits in new sim modules. Final Map 1
100y non-fast is deterministic and unchanged at 270 population / 8 active / 3
fissions; 60.31 ms/tick sample, animal knowledge/management 0.22 ms/tick and
fauna advance 0.57 ms/tick. A same-session final-code 20y
post-pass median is 57.43 ms/tick (3 runs: 55.79/58.47/57.43); an instrumented 20y sample attributes
0.25 ms/tick to animal knowledge/management (fauna advance 0.85 ms/tick there).
New live state observed: animal
knowledge+management max 1,395 bytes/band; fauna routine truth 6,680 bytes for
19 dynamic stocks; all caps held.

**Known caveats.** The pre-existing `hardshipOutcome` watercraft-preemption bug
is unchanged; completed land moves still often read `rejected`, so that field
is not used for new efficacy. Reports from a band that later dies may seed
friction until stale. Static technologies/storage/crossing capabilities remain.
Normal worlds form simple carrying responses; dry-route and complex watercraft
responses are opportunity-sparse, with the latter proven in a controlled real
crossing scenario. Next pass should be the declared hardshipOutcome repair /
fission audit before CROWDING / RANGE RELEASE / GENERATIONAL DEPARTURE /
VIABLE FISSION-1, then replace static crossing/storage tags through learned
capability only with explicit macro A/B baselines.

**RUMOR-LOOP FIX (lone-band outsider rumors + phantom copying) 2026-07-10.**
User-reported: a band ALONE in the world kept "hearing rumors about
outsiders" and showed "copied from another band" ideas. Root cause (verified
in code): `rangeFriction.deriveReportLinkedEvents` turned the band's OWN
reportedKnowledge reports (its own scouts' avoid_place / bad_water_warning —
legitimately self-generated) into friction events with `otherBandId ===
itself` (self falls through every kin check → stranger-tier), and
reportedKnowledge maps `avoid_warning_remembered` friction events to
`outsider_use_warning` reports — so a lone band's own bad-water knowledge
regenerated fresh "outsider" talk every season, forever. Separately,
`adaptiveHuman`'s social_copy idea gate counted ANY report (including the
band's own) as "heard trace" evidence, so lone bands generated `copied_seen`
ideas about nonexistent neighbours — the user's instinct was right: they
were not really copying; the gate was misreading their own reports. FIXES:
(1) `rangeFriction.ts` — reports with `sourceBandId === observer.id` can no
longer seed report-linked friction; (2) `adaptiveHuman.ts` — the social_copy
gate now counts only reports from OTHER bands. The lone-band talk audit was
concurrently hardened (grounding definition excludes self-friction; new
`selfReferentialFrictionEvents` counter asserted 0) — verdict PASS post-fix;
`deterministic=true`; Map 1 100y still 270/8/3 (the loop lived in the
talk/record layer). RESIDUAL (declared): reports sourced from since-DEAD
bands can still seed friction events until they fade — if "outsider rumors
with no living neighbours" reappears in long user worlds, add report-source
liveness/staleness gating in `deriveReportLinkedEvents`.

---

**ENVIRONMENT-READING PRACTICAL ADAPTATION / INVENTION-1 implemented
2026-07-10 - PASS recommended.** Bands now develop practical, local responses
because of conditions they repeatedly live through, on a compositional
substrate designed for a large future possibility space (addon): LEARNED
FRAGMENTS (small pieces of practical knowledge earned only from persisted
lived evidence) compose into PRACTICAL RESPONSES whose capped effects hit
real coefficients and whose confidence is earned only through the
ADAPTIVE-EFFICACY-1 response-specific evaluators. No biome identities, no
tech tree, no inventory: a variant label ("fiber sling") is a configuration
of fragments; the fragments and measured efficacy are the cause.

Files: `src/sim/agents/practicalFragments.ts` (new),
`src/sim/agents/practicalResponses.ts` (new), `src/sim/agents/types.ts`
(PracticalFragment/ResponseState/AdaptationState + Band.practicalAdaptation;
AdaptiveEfficacyRecord.family widened), `src/sim/agents/adaptiveEfficacy.ts`
(carrying + water-route evaluators), `src/sim/agents/migrationWalk.ts`
(plan-input reliefs + applied-relief proof fields),
`src/sim/agents/residentialMoveEvent.ts` (carrying hardship relief),
`src/sim/rules/bandDecision.ts` (context building, hoisted move-event ring,
practical advance), `src/sim/agents/demography.ts` (daughter fragment
inheritance), `src/ui/band/Technical.tsx`, `src/architecture/graphData.ts`
(+2 nodes/+9 links → 204/708), `scripts/simBenchmark.mjs`
(`--targeted-practical-adaptation-check`), this handoff.

**Diagnosis before choosing (§3):** candidate families were mapped against
real pressure / memory evidence / plausible response / REAL coefficient /
honest efficacy context / bounded cost. CHOSEN: (A) carrying_load — the
carrying coefficient this family needed was deliberately created by the
previous two passes (travel-plan carry+vulnerable limiters; move-hardship
dependent/elder terms feeding innerFission/bodyCampLogistics); condition
evidence = bodyCampLogistics carryConstraintBias/careTravelBurdenBias
(calibrated to their REAL clamped ranges ~0..0.18) + the band's own recent
burdened residential moves. (B) dry_route_water — travel-plan water limiter;
condition = standing water stress with move pressure + lived water-hardship
moves; strict context gate: relief applies ONLY when the scored destination
is one of the band's own remembered watered places (placeMemory
lastKnownWaterStress ≤0.4). DEFERRED (documented in
PRACTICAL_RESPONSE_REGISTRY with the exact missing substrate):
hunting_distance (no band-consumable per-trip hunting coefficients),
temporary_shelter (no camp exposure coefficient), water_storage (no carried
per-journey water state), animal_proximity (faunaStock is real physical stock
but bands have no habituation/tolerance evidence), engineering_structure
(temporaryWatercraft assessment is real and should become fragment-consuming
in a follow-up). E (digging/tubers) deferred: overlaps the existing 2K.6-2K.9
exploitation-skill realized-support loop; duplicating it would have been
decorative. AUDITED: `band.technologies` is a STATIC spawn tag list (gates
crossing capability + storage at spawn, never earned/lost at runtime) — the
legacy static-flag pattern this substrate is designed to eventually replace;
there is NO causal domestication system (plant_tending is a static tag).

**Fragments** (cap 10, deterministic strength eviction, ≤3 evidence refs):
fiber_cordage + load_binding (from persisted repetition affordances),
load_staging (lived multi-tile residential legs), staged_crossing (real
crossing-memory writes), camp_ground_reading (camp_setup repetition),
watered_route_reading (band's own confirmed watered places). Reinforce
+signal×0.12/season; staleness decay full ≤2y → gone ~8y; response failures
add fragment failureCount (−15% each); daughters inherit ≤4 halved
"inherited" fragments that must be re-proven (re-proving flips them to
"lived"). Declared extension domains (animal_behavior, structure) earn
nothing yet.

**Responses** (cap 5): formation needs condition ≥ max(0.2, deterministic
tendency-scaled threshold 0.3×(1−0.15·routineReliance)(1+0.15·attachment)) +
variant fragment basis (weakest-link ≥0.35; composite carrying_frame needs
two fragments ≥0.5, cap 0.4 vs 0.3 — direct discovery starts at confidence
0.45 when basis ≥0.7, thin basis starts 0.3). Lifecycle: forming (probe-level
relief 25% of cap) → active after 2 condition seasons → dormant after 2y
without the condition (relief OFF, evidence kept; wakes when it returns) →
abandoned at 3 failures with confidence <0.25 (blocked from re-forming 8y,
then rediscovery allowed); abandonment with an alternative composition
available immediately revises into it (revisionOf lineage). Efficacy: clear
+0.12 (cap 0.9), partial +0.04, failure −0.15; low/no/mismatch = no credit.

**Real effects (capped, context-bound):** carrying relief (≤0.3 simple /
≤0.4 composite) scales the travel plan's carry-constraint input, softens the
vulnerable-share input (−relief×0.2), and relieves ≤relief×0.6 of the
dependent+elder hardship terms of a residential move; water relief (≤0.3)
scales the plan's water-stress input only toward a remembered watered
destination. Efficacy measures the counterfactual: the SAME plan derived with
reliefs disabled (budget delta in steps) plus realized hardship level and
post-move water stress. Unburdened/unmatched movement produces NO record.

**New audit `--targeted-practical-adaptation-check` — 26/26 PASS** (unit
battery byte-identical on repeat): trigger/non-trigger (comfortable band
inert; burden without material basis inert), faded-basis relief refusal, real
budget-step effect (plan 3 vs 2 counterfactual; caps held), water context
gate, clear-success confidence rise, severe-hardship failure, abandonment +
revision-into-alternative, water mismatch + drier-arrival danger, dormancy +
reawakening, unburdened-move-no-record, tendency-split borderline formation
(band:var-5 forms / band:var-2 tolerates, same evidence), independent
parallel formation, live honesty (confidence >0.46 always earned). LIVE
sweeps (harsh_dry_margin 40y, river_barrier_frontier 40y, crowded_delta 30y,
baseline 100y, late_dry_refuge_fallback 30y): fragments form in all (10-19
per world); carrying responses form and stay ACTIVE in all (4-8 bands),
records mix clear/partial/low (e.g. baseline 100y: 18 clear + 10 partial;
failures reserved for severe realized hardship); max practical state ~5.1KB
per band (caps held). Variant convergence on load_staging live is
material-explained: fiber/material-handling repetition affordances rarely
reach the evidence floor in current worlds, so the fiber/frame variants stay
unavailable — the composition machinery is unit-proven. dry_route_water is
LIVE-SPARSE (0 formations in all 5 scenarios): investigated — bands resolve
water stress by MOVING within 1-2 seasons (the legitimate alternative
solution), so the condition window rarely overlaps the fragment basis; the
loop is unit-proven end-to-end and flagged as a primary consumer for the
future Seasonal Route Migration pass.

**Regression:** `--targeted-adaptive-efficacy-check` PASS (crossing/camp
loops intact), `--targeted-causal-agency-check` PASS,
`--targeted-migration-walk-check` PASS, `deterministic=true`, tsc/build/
checkGraph (204/708) green, static guards 0/0/0. Forced-march hardship
repair tracked: the pace term is untouched and still paid. **Map 1 100y
270/8/3 and Map 2 50y 249/9/0 — macro counts IDENTICAL to the accepted
baselines** (journey internals differ where reliefs flip budget steps;
structure preserved). Adaptive-human audit still 27/28 with the SAME
pre-existing boundedPayloads failure (65.75KB; practical state is not in
that payload).

**Runtime (controlled, same-session, 3× medians):** pre-edit 59.9 ms/tick →
post-edit 62.9 ms/tick on Map 1 100y non-fast (**≈+5% — a real, attributed
cost**: per-tick fragment advance incl. a bounded placeMemory pass, plus 2-3
extra travel-plan derivations on moved residential decisions). Absolute
numbers vary strongly across sessions (previous session recorded 22-43
ms/tick on identical code); the same-session delta is the honest measure.

**BUG DISCOVERED (pre-existing, NOT fixed in this pass — needs its own
checkpoint):** `ResidentialMoveEvent.hardshipOutcome` is stamped "rejected"
on essentially 100% of COMPLETED moves in every scenario (audit histograms:
20-36 of 20-36 events), because incidental temporary-watercraft assessments
(returned whenever a crossing merely exists nearby or a reason mentions
rivers) preempt the outcome ladder with "materials_missing" even when the
land route ARRIVED. This is not record-only: hardshipOutcome==="rejected"
feeds innerFission stress (+0.22), acuteRisk, and visibleNature narration —
the accepted baselines have been carrying inflated post-move fission stress.
Fixing the ladder shifts fission behavior globally, so it was documented
rather than silently patched mid-pass; the carrying evaluator deliberately
reads hardshipLevel (sane: moderate/high/severe distribution) instead.

**Wording/story:** no public prose added this pass (behavior first; Technical
carries the full proof: fragments with basis/strength/staleness, responses
with variant/status/confidence/lineage, exact current reliefs with gating
reasons, practical efficacy records verbatim). No identity labels anywhere.

Caveats: (1) hardshipOutcome bug above. (2) dry_route_water live-sparse (unit-
proven; needs route-scale journeys). (3) live variant uniformity is material-
driven; worlds with richer fiber/material repetition evidence will diverge.
(4) hardshipReliefApplied in the efficacy record is an analytic estimate of
the same formula the hardship derivation applies (documented). (5) practical
state adds ≤~5KB/band to full snapshots (bounded; NOT in the adaptive-human
UI payload budget). (6) The registry's declared-only families are hooks, not
behavior — do not surface them as capabilities.

Recommended next pass: **Crowding / Basin Dispersal / Range Release-1** (the
remaining diagnostic problem: crowded basins generate pressure without strong
outward residential targets), with the hardshipOutcome ladder fix either
folded in (it directly touches fission stress) or as a small preceding
repair. A narrow adaptation follow-up (hunting_distance via per-trip
coefficients, temporary_shelter via a camp exposure coefficient, watercraft
as fragment-consuming engineering) can come after.

---

**ADAPTIVE EFFICACY FEEDBACK-1 implemented 2026-07-10 - PASS recommended.**
Adaptive practices now earn or lose confidence from whether the PRACTICE
ITSELF helped, not from broad movement success. Before this pass,
`classifyAttemptOutcome` (adaptiveHuman.ts) labelled every attempt from the
band's movement outcome — moved + general collapse pressure fell ⇒
`clear_success` for ANY selected idea, and camp_care got `local_only_success`
for merely staying. The correct chain now runs: experienced condition →
practical response attempted → response affects a REAL coefficient → the sim
measures whether THAT response helped in THAT context → local confidence
changes → later matching behavior changes.

Files changed: `src/sim/agents/adaptiveEfficacy.ts` (new),
`src/sim/agents/adaptiveHuman.ts`, `src/sim/agents/types.ts`
(`AdaptiveEfficacyRecord` + `AdaptiveHumanState.efficacyRecords?`, cap 4),
`src/sim/rules/bandDecision.ts` (context building only),
`src/sim/agents/residentialMoveEvent.ts` (completed the previous session's
incomplete pace edit — see caveat), `src/sim/agents/publicHumanStory.ts`
(one wording fix), `src/ui/band/Technical.tsx`,
`src/architecture/graphData.ts` (+1 node/+5 links → 202/699),
`scripts/simBenchmark.mjs` (`--targeted-adaptive-efficacy-check`), this
handoff.

**Loop 1 — crossing practice (route_crossing).** applyBandDecision passes the
adaptive update a compact `CrossingOutcomeContext` built from the SAME river
assessment the decision paid (attempted crossing key, `crossingPracticeRelief`
actually applied to `riverCrossingRisk`, raw vs effective risk, blocked flag)
plus the realized outcome (`getRiverCrossingForMovement(position,
nextPosition)` — the exact memoized lookup the memory system uses — and
whether a staged walk stopped at budget). `evaluateCrossingEfficacy`
classifies with fixed priority (never inverted): (1) blocked matching crossing
⇒ specific failure (`blocked_before_attempt`; "practice was active but the
crossing stayed blocked" when relief ≥0.05); (2a) completed crossing whose
remembered danger rose ≥0.04 at the ford OR that paid effective risk ≥0.55 ⇒
`dangerous_feedback` — danger can NEVER become success; (2b) practice active
at the used ford AND realized risk reduction ≥0.02 ⇒ `clear_success`, demoted
to `partial_success` when dependents/elders >0.44, carry constraint >0.28,
water stress >0.5, or the staged journey remained incomplete; (2c) crossing
completed without active practice ⇒ `local_only_success` (real local
experience — this is how practice legitimately seeds), EXCEPT when remembered
practice exists at ANOTHER ford ⇒ context mismatch, `mixed_feedback`, with the
other key exposed in the reason; (3) moved WITHOUT a crossing ⇒
`irrelevant_movement`, `low_feedback` — movement success earns the crossing
response nothing (dormant practice is named); (4) no crossing evidence ⇒
generic fallback. The generic moved-branch itself now returns `low_feedback`
for route_crossing/camp_care so absence of context can never leak movement
credit.

**Loop 2 — camp shift (camp_care).** Real signal: the band's OWN
`localUsePressure` at the residence (wear/fouling proxy — the same coefficient
campMovement's relief scoring pays), passed pre-decision for old + new tile.
Condition requires wear ≥0.3. A LOCAL 1-tile non-travel shift earns
`clear_success` when the wear signal fell ≥0.14, `partial_success` ≥0.06
(campMovement's own margin), else specific low feedback. Travel-motivated or
longer moves ⇒ `irrelevant_movement`. Staying through wear ⇒ `low_feedback` —
the old decorative "camp care worked because we stayed" credit is removed
(generic stay branch too). Carrying was DEFERRED: no real carrying coefficient
is affected by an adaptive response yet, and faking feedback was forbidden.

**Confidence → behavior.** Outcomes feed the existing `advanceLocalRoutines`
confidence/failure counters and `behaviorInfluenceAllowed` gate (routine
score-bias on future matching decisions, ≤ BEHAVIOR_BIAS_CAP), and the
crossing coefficient itself strengthens/weakens through KnownCrossingMemory
(successConfidence, riskMemory, staleness decay) — both remain local, capped,
fragile, non-inherited (`inheritAdaptiveHumanForDaughter` does not copy
efficacy records).

**Proof.** Each specific evaluation persists one bounded
`AdaptiveEfficacyRecord` (≤4/band, newest first): response id, family,
classification, outcome, matching context key, responseActive, coefficient,
pre-effect value, effect amount, cap, danger/practice/routine-confidence/
failure deltas, future-influence-changed flag, locality note, and the exact
no-credit/mismatch reason. Technical shows the records verbatim inside the
"Causal agency repair" group (`AdaptiveEfficacyDetails`). Wording audit:
publicHumanStory's adjust_carrying line claimed the load "held long enough to
make the next crossing less punishing" for any non-failure outcome — now only
for outcome-backed success, else "Whether it truly helped stayed unclear".

**New audit: `--targeted-adaptive-efficacy-check` — 26/26 assertions PASS.**
Unit battery (A) real matched success (clear, active, capped 0.28≤0.35,
future relief strengthens within cap, practiceDelta>0); (B) blocked/danger/
serious-risk all classify as specific failure; (C) irrelevant movement: no
credit, dormant practice named; (D) context mismatch blocks confident gain,
mismatch reason carries the practiced key; (E) load and staged-incomplete
demote to partial; first-ever crossing = experience without practice credit;
no context ⇒ generic fallback (undefined); camp loop clear/partial/no-drop/
travel/stay/comfortable all correct; (F) variety: five band histories in
similar seasons yield ≥4 distinct deterministic classifications
(trust/burned-by-danger/never-crosses/dormant-prefers-dry-land/partial) — no
randomness, no diversity quota. Unit battery byte-identical on repeat. Live
harsh_dry_margin 40y sweep: 1 band wrote 4 efficacy records
(2 clear_success_specific, 1 irrelevant_movement, 1 specific-low), 0
route_crossing attempts carried clear_success without a specific record, 0
internally inconsistent records, 0 decorative camp-care stay successes.

Verification: `npx tsc --noEmit` PASS; `npm run build` PASS; `node --check
scripts/simBenchmark.mjs` PASS; `node scripts/checkGraph.mjs` 202/699, 0 dup,
0 dangling; static guards 0 unseeded-random / 0 unsafe `any` / 0 UI imports in
`src/sim`; `--deterministic` → `deterministic=true`. Regression:
`--targeted-causal-agency-check` PASS (hardship, tendencies, founder/crowding
dispersal, crossing relief, travel-plan gates/floors/rests, season classes);
`--targeted-migration-walk-check` PASS; **Map 1 baseline 100y non-fast
270/8/3 — IDENTICAL to the accepted CAUSAL-REPAIR-2 numbers; Map 2
(map2_varied_migration) 50y 249/9/0 — IDENTICAL.** The macro movie is
unchanged on both maps.
`--targeted-adaptive-human-ideas-solutions-routines-audit` is 27/28 with
`boundedPayloads` failing (maxPayload 67,332 > 65,000): **proven pre-existing
by an isolation experiment** — with ALL of this pass's behavior edits
temporarily reverted the audit fails identically at byte-identical 67,332
(the drift traces to earlier accepted passes; the previous session's known
`ideasGrounded` flake now PASSES both ways). Left un-gamed and declared; a
future pass should trim the adaptive profile payload builder, not the budget.

Runtime: Map 1 100y non-fast --json samples 16,479 ms (41.2 ms/tick) and
17,194 ms (43.0 ms/tick) vs the 22-28 ms/tick recorded last session; the
decision profiler attributes only 406 ms/400 ticks (~2.5%) to the ENTIRE
`movement:adaptiveStateUpdate` phase (which pre-existed this pass), and every
heavy phase (movementDecisionAndPressure 5,963 ms, rangeSaturation 2,290 ms,
candidateGeneration 2,132 ms) is untouched by this pass — the gap vs the
recorded samples is environment/load noise or drift that predates this pass,
not efficacy work. All additions are O(1) per decision; the only iteration is
a sorted pass over the band's own crossing memories (a few dozen max), only on
route_crossing attempt ticks.

Caveats: (1) `residentialMoveEvent.ts` arrived with the previous session's
UNCOMPILABLE half-edit (6-arg `deriveMigrationHardship` call against a 5-param
signature — tsc failed on a clean checkout of the working tree); this pass
completed the documented intent (forced-march pace >1 tile/day pays capped
+0.12/+0.06 hardship risk). NOTE the old comment's "record/display only" claim
is inaccurate: `hardshipRisk` feeds innerFission stress, bodyCampLogistics,
and socialContext — empirically both map baselines are unchanged, but the
coupling is real and now declared. (2) The camp_care de-glorification means
camp routines form more slowly (useful feedback now requires a wear-reducing
shift); attemptsByOutcome distributions shifted accordingly — intended.
(3) Crossing efficacy evaluates the RESIDENTIAL crossing only; task-party/
probe crossings write no crossing memory and keep generic scout feedback.
(4) In the 40y live sweep only 1 of 5 bands produced efficacy records —
records require a route_crossing/camp_care idea to be the SELECTED idea on a
tick with matching context; coverage will grow on river maps (Map 2 corridor
spawns) — the unit battery carries the exhaustive path proof. (5) The
efficacy loop does not yet read `ResidentialMoveEvent.temporaryWatercraft`
results (crossing_abandoned_risk etc.) — a future refinement could feed those
as failure evidence.

Next-pass recommendation: full Environment-Reading Practical Adaptation is
now SAFE to attempt — the efficacy substrate it needs (response-specific
credit, context matching, no-credit reasons, bounded records) exists and is
audited. Seasonal Route Migration should come AFTER that pass: route-scale
migration wants practices whose efficacy is already honestly measured
(crossings, camps) before multi-season route planning consumes them. Also
still queued: the M0.11-guarded density-dependent quitting threshold for
crowded basins (HEAT criteria re-run), and trimming the adaptive profile
payload back under the 65,000-byte budget.

---

**CAUSAL AGENCY REPAIR-2 — SEASONAL MOVEMENT SCALE implemented
2026-07-10 - PASS recommended.** Follow-up to REPAIR-1: a RESIDENTIAL seasonal
move can now summarize a season of staged travel when motive and constraints
justify it, instead of always being a ≤2-tile end-of-season hop.

Root causes found: residential candidates were hard-capped at grid distance 2
(`getTileIdsWithinKnownMoveRadius`), explore/corridor channels are 1-step, and
the purpose-built multi-tile path realizer (SPIKE-MOBILITY-1's
`migrationWalk.ts`, wired into `applyBandDecision`) had been left DISABLED
after its 2026-06-15 negative result (blanket intent-persistence engagement →
HEAT founders re-walked every season → never anchored → 500y pop 655→91).

Repair (files: `src/sim/agents/migrationWalk.ts`,
`src/sim/rules/bandDecision.ts`, `src/ui/band/Technical.tsx`,
`src/architecture/graphData.ts` (+1 node/+4 links → 201/694),
`scripts/simBenchmark.mjs`): `MIGRATION_WALK_ENABLED=true` behind a REPAIRED
cause gate — `deriveSeasonalTravelPlan` (+ band-level builder +
`classifyResidentialSeason`). Motives: chronic hardship escape (REPAIR-1
signal; works even without a formal migration intent; gate-inert for
comfortable bands and self-terminating after a successful escape),
dispersal/frontier intent, or corridor migration. Anti-churn (the spike's
killer): intent journeys need a ≥4-season rest since the last residential move
(derived from movementHistory — no new state), hardship legs ≥2 seasons.
Dependents/elders share, carrying constraint, water stress, and low route
confidence each remove a step, but the budget FLOORS at 2 while the motive is
strong (constraints limit distance, never collapse it to one tile); the walk
itself is unchanged (≤6 contiguous known-land steps, ≤1 bounded unknown step
for escape/dispersal, breadcrumbs, stop-at-good-enough, canonical crossing
gates). `residentialMoveEvent` already scales duration (≤14 days) and
hardship risk with distance, so long moves carry visible in-season risk.
Task-party/probe/scout movement remains fully distinct — nothing but the
seasonal residential decision moves `band.position`.

Technical proof (selected band): seasonal travel plan (motive, strength,
budget, limiters), a RESIDENTIAL SEASON CLASS — one of `no_residential_move`,
`local_camp_shift`, `staged_residential_travel`,
`full_residential_relocation`, `relocation_blocked_or_held` (with blocked-
crossing detection) — and the last residential move labelled as staged
seasonal travel when ≥2 tiles.

Verification: `--targeted-migration-walk-check` PASS (pure walk mechanics);
`--targeted-causal-agency-check` extended (travel-plan gates/floors/rests,
season-class distinctness, scenario displacement bounded ≤6) — all assertions
PASS; harsh_dry_margin 40y displacement histogram now shows real multi-tile
residential legs (50 moves at distance 2 vs 350 at 1). **Anti-churn A/B (the
decisive spike comparison), one-origin HEAT 500y seed heat-1, same code, flag
off vs on: OFF = 1 band / pop 42 / maxDist 10 / local_cluster; ON = 1 band /
pop 44 / maxDist 7 / local_cluster — NO walk-caused collapse (the spike's
655→91 signature is gone; the weak single-origin outcome itself pre-exists
with the walk off and remains the post-PERF-1 HEAT milestone's problem).**
Map 1 100y non-fast re-baseline: 259/8/3 → **270/8/3** (walk mildly
beneficial; structure unchanged); Map 2 50y: 249/9/0 (9-band structure
preserved); `deterministic=true`; heat repro run byte-identical; tsc/build/
checkGraph green.

**Sub-season playback staging (same pass, user follow-up):** on localhost the
residential marker still stood still all season and teleported at the
boundary, because `takeLiveOverlay` always drew raw `band.position` even at
daily/weekly/monthly playback while the season's journey already existed as a
RECORD (`ResidentialMoveEvent`: departure day, arrival day, passability-aware
route). The overlay now accepts `{ subSeasonPlayback }` (worker tracks the
current StepMode; simBridge fallback/pause paths mirror it) and, during the
move's own season only, walks the marker along the recorded route across the
recorded days (holds at origin before `startDay`, interpolates path tiles to
`endDay`, then sits at the destination; `traveling: true` exposed on the
marker). PRESENTATION-ONLY: `band.position` semantics untouched (one update
per seasonal decision), seasonal/ultra-fast playback is byte-identical (option
defaults off), task parties remain separate overlays. Probe (4y daily-stepped
Map 1): 58 staged band-seasons, 72 real moves, **0 staged seasons without a
real move**; `--targeted-fast-time-overlay-check` PASS; deterministic=true.

Caveats: in the 40y harsh scenario the longest realized leg was 2 tiles
(stop-at-good-enough + the edge of known land bound legs on small maps —
legitimate); multi-tile legs beyond ~3 need long corridors of band-known land,
so they will mostly appear along rivers/shores and in dispersal on Map 2; the
radius-2 candidate MENU is untouched (the walk extends the REALIZED move, not
the target menu) — a future pass could stage far KNOWN targets across seasons;
at pure SEASONAL playback resolution there is no mid-season time to show, so
in-transit staging appears only at daily/weekly/monthly resolutions.

---

**CAUSAL AGENCY / MOVEMENT / ADAPTATION REPAIR-1 implemented
2026-07-09 - PASS recommended.** This pass implements the behavior-side repair
recommended by `docs/CAUSAL_AGENCY_DIAGNOSTIC.md`: calculated pressure and
local experience now influence decisions in small, deterministic, inspectable
ways. It adds NO new projection cards, NO tech-tree/inventory/territory
systems, and NO new Band state fields — every new signal is a pure derivation
from evidence the band already persists.

Files changed: `src/sim/agents/chronicHardship.ts` (new),
`src/sim/agents/bandTendency.ts` (new), `src/sim/agents/crossingPractice.ts`
(new), `src/sim/agents/pressure.ts`, `src/sim/agents/crowding.ts`,
`src/sim/agents/campMovement.ts`, `src/sim/agents/adaptiveHuman.ts`,
`src/sim/agents/types.ts` (one optional BandPressureState field),
`src/sim/rules/bandDecision.ts`, `src/ui/band/Technical.tsx`,
`src/architecture/graphData.ts` (3 nodes, 12 links → 200/690),
`scripts/simBenchmark.mjs` (`--targeted-causal-agency-check`), this handoff,
and `docs/superpowers/plans/2026-07-09-causal-agency-repair-1.md`.

Diagnostic claims verified/rejected: (A) stay-bias CONFIRMED — flat +0.24
stay bonus + anchor hold ≤~1.3 vs a 0.42×1.05 move toll; the sub-claim that
`knownOpportunityPull: 0` on frontier breakdowns is an oversight was REJECTED
(an unknown tile cannot be a KNOWN opportunity — intended semantics). (B)
decline-de-escalation CONFIRMED with a nuance: `getPopulationPressure` is
band-level (identical across candidates) so `population/86` mostly cancels in
candidate ranking; the real de-escalation was shrinking splitPressure/
householdCrowding inputs to exploration value plus the +0.05-only
chronicDecline probe. (C) founder dispersal exemption + throttled crowding
response CONFIRMED (`crowding.ts` `parentBandId===undefined ⇒ 0`; explore
boosts 0.18×/0.22×). (D) zero stable individuality CONFIRMED (seededVariation
is a runSeed-gated ≤0.06 tiebreak; spawn hashes only color/population). (E)
decorative adaptation CONFIRMED (`classifyAttemptOutcome` relabels the
movement outcome; `riverCrossingRisk` ignored crossing memory entirely —
memory fed only `knownFordValue`).

Behavior-driving changes:
1. **Chronic hardship escalation** (`chronicHardship.ts`): repeated
   low-support evidence (returnTrend mean8/chronicDecline, M0.11
   sustainedOverCapacity, foodPerPersonStress, rangeSaturation) × a dwell
   escalation (fully activates only after ~8 seasons staying through it) →
   three capped effects: `stayBiasErosion` ≤0.6 (multiplies down the flat stay
   bonus and, at 0.6×, the anchor hold on the STAY candidate only —
   probe/scout candidates keep their full anchor hold, creating a
   stay→scout→move escalation ladder), `movePressureBoost` ≤0.18 (into
   mobilityPressure ×0.5 and netMovePressure ×1.0 in `pressure.ts`; surfaced
   as `BandPressureState.chronicHardshipEscalation`), and `scoutUrgency` ≤0.14
   (into `getExplorationBaseline`). Gate-inert below severity 0.08 — a
   comfortable band's effects are exactly 0. Source family: marginal-value
   patch departure (Charnov 1976; Venkataraman et al. 2017), coupling kept
   conservative.
2. **Founder dispersal repair** (`crowding.ts`): founders are no longer
   exempt. Gated on SUSTAINED evidence (M0.11 sustainedOverCapacity>0 or
   weighted crowding>0.3 — a passing band never triggers it), built from
   parent-free terms only, scaled 0.7× vs daughters. Sustained over-capacity
   also escalates `saturationExploreBoost` (+0.3× term) so crowded basins push
   edge scouting instead of only shaving per-capita return.
3. **Deterministic band tendencies** (`bandTendency.ts`): six signed traits in
   [-1,1] (exploration, attachment, crossingCaution, campShiftWillingness,
   failureSensitivity, routineReliance) from an avalanche-finalized hash of
   the band id, blended 70/30 with the parent-id hash (bounded lineage echo,
   no recursion; memoized). Use-site caps: stay bonus ±15%, exploration
   baseline ±15%, perceived crossing risk ±12%, camp-shift deltas ±15% (still
   ≤ BEHAVIOR_DELTA_CAP), hardship sensitivity ±15%, routine influence ±15%
   (still ≤ BEHAVIOR_BIAS_CAP). No runSeed dependency: individuality exists in
   the default movie and is byte-stable per map. Ecology still decides.
4. **One real local learning loop** (`crossingPractice.ts`): repeated ACTUAL
   use of a specific crossing (KnownCrossingMemory useCount/successConfidence/
   riskMemory — already written by `memory.ts` from real crossings) earns a
   capped relief (≤0.35 — at least 65% of the raw risk is always paid) on
   `riverCrossingRisk` at THAT crossing only, discounted by remembered danger
   and DECAYING with staleness (full ≤2y since last use, gone by ~8y). Local,
   perishable, never a global upgrade.

UI/debug proof: Technical gains one compact **Causal agency repair** group
(hardship signal + effects + applied escalation, stay blocker/hold reason from
anchor gates, tendency vector, dispersal pressure, per-ford crossing practice,
latest-decision candidate roster) — derived on demand from the same pure
functions the sim uses; no new state, no new cards, no Story prose.

New audit: `--targeted-causal-agency-check` — **19/19 assertions PASS**,
byte-identical on repeat run: hardship active (severity 0.54 → erosion 0.41
for a chronically low-return stuck variant), capped at extremes, gate-inert
for comfortable bands, dwell-escalating; tendencies diverge across ids (5-6 of
6 traits per pair), identical for the same id, bounded, parent echo visible;
crossing relief 0.28 practiced vs 0.09 single-use vs 0 stale, danger-
discounted; founder dispersal 0 without evidence → 0.33 under sustained
over-capacity on a real Map 1 founder; live harsh_dry_margin 40y: the
dry-margin band MOVED (13 candidates dumped with kinds/scores/winner;
`move_to_tile` selected), returnTrend-only A/B on the real decision path
shows the stay score strictly lower under chronic low return (2.84 vs 2.88);
crowded_delta 30y: crowding-driven dispersal pressure 0.52 surfaced on a real
band. Plain-Map-1 migration audit (100y): `stayers: 0`,
`lineagesWithEscapeAttempt: 1`, and the dry-margin band ends on a RICH river
corridor tile (richness 0.7, water 0.52) where `greenerWithinRange` is 0 even
by hidden truth — `greenerCandidateGenerated:false` is now a healthy answer,
not a symptom.

Verification: `npx tsc --noEmit` PASS; `npm run build` PASS; `node --check
scripts/simBenchmark.mjs` PASS; `node scripts/checkGraph.mjs` PASS (200
nodes/690 links, 0 dup, 0 dangling); static guards 0 `Math.random` / 0 unsafe
`any` / 0 UI-render-store imports in `src/sim`; `sim:benchmark --
--deterministic` → `deterministic=true`. Regression battery: **27/28 targeted
suites PASS** (the 22-suite battery of the previous checkpoint + scout
regression 6/6, skill-rank 16/16, skill-opportunity 9/9, time-scale,
cause-stress-increment, and the new causal-agency check). The single failure
is `--targeted-adaptive-human-ideas-solutions-routines-audit` at 27/28
internal checks: `ideasGrounded` requires ≥1 projection cross-ref among the
ideas of ITS sampled bands at year-100 fast-mode; a dedicated all-band probe
at years 20/40/60 (non-fast, real app loop) shows 8-9 of ~33 ideas carrying
cross-refs (problemRefs 8-9, affordanceRefs 13-14, knowledgeRefs 13-14) —
the enrichment machinery is intact and the failure is behavior-drift sampling
fragility, declared here as expected drift rather than silently patched.

**Intentional re-baseline (declared):** Map 1 `baseline` 100y, non-fast, no
runSeed: 325/8/3 → **259/8/3** (population −20%; band count and fission count
unchanged — bands relocate/scout more instead of accumulating in place; macro
structure preserved). Runtime, same command: pre-change 9,533 ms
(23.8 ms/tick avg); post-change samples 8,892 ms (22.2 ms/tick) and 11,074 ms
(27.7 ms/tick, --json) — inside the noise band, no systematic regression (all
additions are O(1) scalar derivations; tendency hashes are memoized).

Caveats / remaining weak: hardship severity rarely exceeds ~0.3 in natural
Map 1 runs (bands escape before it saturates — intended, but the erosion cap
is therefore rarely exercised live); `classifyAttemptOutcome` still relabels
movement outcomes (the honest efficacy loop shipped via crossing practice
instead); crowded-basin OUTWARD dispersal beyond edge scouting still rides on
fission machinery (founders showed 0 dispersal at the 30y crowded_delta
sample because sustained over-capacity was only 0.05 there — the founder term
is proven by the unit case, not yet by a long crowded scenario); report-band
JSON was not extended (Technical + the targeted audit carry the proof); the
adaptive-human audit's `ideasGrounded` check is sample-fragile under behavior
drift and could be widened in a future pass.

Recommended next pass: **ADAPTIVE EFFICACY FEEDBACK-1** — make
`classifyAttemptOutcome` for route_crossing/carrying families read real
coefficient outcomes (crossing success at the practiced ford, realized carry
cost) so routine confidence is earned from the loop this pass made real; then
the M0.11-guarded density-dependent quitting threshold for crowded basins,
re-running the one-origin HEAT criteria after PERF-1.

---

**KNOWLEDGE CARRIERS / DECAY / DORMANCY-1 implemented
2026-07-07 - PASS recommended.** This pass builds on the completed
MOVEMENT / CARRYING CAPACITY / RANGE SATURATION HOT-PATH OPTIMIZATION-1 pass
and does not restart, delete, or redo accepted systems. It adds a bounded,
selected-band, cached, projection-only knowledge carrier / availability layer;
it does not add ecology content, new civilization systems, named people,
behavior weights, movement rules, demography rules, or survival effects.

Files changed for this pass: `src/sim/agents/knowledgeCarriers.ts`,
`src/ui/band/KnowledgeCarriers.tsx`, `src/ui/band/Knowledge.tsx`,
`src/ui/band/Technical.tsx`, `src/architecture/graphData.ts`,
`scripts/simBenchmark.mjs`, and this handoff.

Inspected/reused existing knowledge systems: Knowledge Ecology, Material
Affordance, Problem/Practice and Practice Feedback substrates through Adaptive
Human, Social-Ecological Diffusion, Camp Foothold, Camp Movement / Range
Rotation, Resource Patch Memory staleness, Reported Knowledge, canonical Events,
Deep History / founding inheritance, place memory, route/corridor memory,
crossing memory, activity-party records, demography aggregate counts, and Public
Human Story / Markdown export patterns. The new layer derives from those systems
only.

Carrier model: each `KnowledgeCarrierItem` has deterministic id with stable
source-key hash suffix, domain, public title, human meaning, exact availability
state, carrier classes, strength, availability, decay pressure, optional
dormancy reason, optional distortion risk, local-only flag, source basis
(`lived`, `inherited`, `copied`, `mixed`, or `technical`),
daughter-local-testing flags, inherited confidence loss, tile-vs-region
precision, evidence refs, linked system refs, and a projection-only behavior
hook with max influence 0. Carrier classes implemented:
recent practice, repeated route use, repeated crossing use, camp/place memory,
seasonal round, local routine, event memory, failed/successful attempt memory,
adaptive response memory, parent inheritance, daughter founding fragment, social
trace, visible trace, activity-party memory, aggregate elder/adult memory when
demography supports it, and technical-only projection.

Availability states implemented: `active_practiced`, `fresh_observed`,
`recently_tested`, `fading`, `dormant`, `distorted`, `inherited_fragment`,
`copied_untested`, `locally_untested`, `blocked_by_context`, and
`lost_or_unavailable`. Knowledge domains covered where evidence supports them:
route/corridor, crossing/ford, place/camp/country, food work, water/refuge,
risk/caution, material/practice, camp/care, social/contact/diffusion,
range-rotation/pressure relief, deep-history inherited memory, and local
routines/adaptive practices.

Decay/dormancy model: no random decay and no deletion. Recency uses years since
last reinforced evidence, ticks since resource memory was noted or used, report
staleness/fading counters, routine last-used ticks, inherited-source flags,
practice counts, confidence, local mismatch, and source basis. Dormant and
unavailable items keep evidence refs and remain visible as weak background
memory; they are not pruned from the projection. Item selection is state-aware so
fading/dormant/distorted/inherited/copied/local knowledge is not crowded out by
ordinary fresh observations under tight caps.

Distortion model: bounded and evidence-based only. Distortion risk appears for
stale reports, stale resource memories, inherited memory with region fuzziness,
copied/visible traces that can miss tacit steps, contradicted attempts/variants,
and local-only routines that might be overgeneralized. No random false mythology,
taboo, law, property, religion, or named-person explanation is introduced.

Inherited/lived/copied separation: inherited fragments carry parent-source and
daughter-local-testing metadata, inheritance confidence loss, exact-tile vs
region-fuzzy precision, untested inherited route, inherited warning without exact
route, inherited routine without practice, and local mismatch risk. Copied
untested/social traces are separate from practiced routines. Local routines and
context-bound adaptations remain local-only and explicitly not global skills.

Daughter bottleneck hooks: `daughterBottleneckHooks` reports inherited fragment
state, parent-source carrier, daughter-local-testing-needed count, inheritance
confidence-loss representation, region fuzziness, inherited routes untested,
warnings without exact route, inherited routines without practice, mismatch
risk, `nextPassReady=true`, and `noFissionBehaviorChange=true`. This pass does
not overhaul fission.

Inter-band diffusion hooks: `interBandDiffusionHooks` reports visible trace,
social trace, copied untested, copied failed, copied local-only, trust/caution
filter, source unknown, heard-warning-not-tested counts, `nextPassReady=true`,
and `noActualDiffusionImplemented=true`. This pass does not create diplomacy,
trade, exchange, or actual knowledge transfer.

Behavior influence decision: projection-only. Every item has a future-hook field
so later passes know where confidence filters could attach, but the cap is
`maxInfluence=0`, `behaviorHookCap=0`, and decision paths do not import or read
`knowledgeCarriers`.

Performance design: derivation is lazy selected-band work, not part of the sim
tick or movement hot path. Repeated derivation for the same world object, band
object, tick, and year is cached in a `WeakMap<WorldState, Map<BandId, ...>>`;
the cache invalidates naturally on new world snapshots, new band objects, or
time changes. The audit measured 8 selected profiles in 8,981.87 ms with a
334,355 byte sampled payload; this is acceptable for Technical/export detail but
still a caveat for future UI responsiveness if more panels request it at once.

UI integration: the existing Knowledge tab now includes compact **Living
Knowledge** cards before the older Knowledge Ecology evidence grid. Cards show
title, domain, state in human-readable wording, one-line meaning, carrier chips,
plain availability, and evidence chips; expanding a card points users to
Technical for exact state/carriers/refs. Markdown export includes the new cards
through the existing Knowledge section. Technical adds **Knowledge carriers /
availability substrate** with exact domains, states, carrier classes, strength,
availability, decay, dormancy/distortion proof, source refs, daughter/diffusion
hooks, behavior cap, payload, and integrity guards.

Public wording examples used by the layer are grounded and plain: “They still
remember it, but not well enough to trust it automatically”; “The copied clue
has reached them, but it has not been practiced here”; “The daughter band
carried the hint, but not the full local confidence”; “The routine is a local
habit, not a general method.”

New audit: `--targeted-knowledge-carriers-decay-dormancy-audit --json`. It
verifies layer/source presence, grounded domains, enum/state/carrier coverage,
dormant retention, bounded distortion, inherited/lived/copied separation,
local-only constraints, aggregate elder/adult carrier with no named people,
public wording, Technical proof, behavior cap 0, daughter bottleneck hooks,
inter-band diffusion hooks, payload caps, deterministic repeat, static guards,
graph node, duplicate deterministic ids, and preservation of the movement
hot-path optimization pass. Final result: PASS. Counts from the accepted run:
8 profiles sampled; 144 items; 10 domains covered; 13 carrier classes used; 34
active/fresh/recent items; 3 fading; 10 dormant; 1 distorted; 19 inherited
fragments; 28 copied untested; 45 locally untested; 3 lost/unavailable; 66
local-only; 108 lived; 19 inherited; 17 copied; 48 public cards; 144 Technical
refs; 144 behavior hooks with max influence 0; duplicate item ids 0; duplicate
public-card ids 0; broken refs 0; fake culture/tech-tree hits 0; deterministic
repeat true.

Regression audit battery: 22/22 targeted audits passed, including knowledge
carriers, movement hot-path, PA-2, public human story, range rotation, camp
shifts, adaptive ideas/routines, social-ecological diffusion, practice feedback,
problem framing, foothold/camp care, material affordance, knowledge ecology,
band identity, event system, deep-time history, deep-time chronicle UI, UI
readability polish 1C, whole-UI readability/history/fun, band chronicle
foundation, band chronicle wiki expansion, and specific memory referents.

Verification battery: `node --check scripts/simBenchmark.mjs` PASS;
`npx tsc -p tsconfig.json --noEmit` PASS; `npm run build` PASS; `node
scripts/checkGraph.mjs` PASS with 197 nodes, 678 links, 0 duplicate ids, 0
dangling links; `npm run sim:benchmark -- --deterministic` completed with
`deterministic=true` and fission conservation true in the sample.

All-fast runtime impact after this pass: `npm run sim:benchmark -- --all --fast
--json` completed 25/25 scenarios with total runtime 119,453.69 ms, max average
73.3431 ms/tick on `crowded_delta`, max single tick 250.682 ms on
`crowded_delta`, slowest scenario `crowded_delta` at 23,469.8 ms, fission
conservation failures 0, total fissions 5, total behavior decisions 15,958.
Compared with the accepted movement-hot-path baseline (127,532.62 ms total,
max average 80.8241 ms/tick, max single 273.6865 ms, slowest `crowded_delta`
25,061.27 ms), this run is 8,078.93 ms faster. Because the new carrier layer is
projection-only and not read by all-fast decisions, treat the improvement as
evidence of no slowdown rather than a claimed hot-path optimization.

Static guards: positive-hit scan and targeted audit both report 0 `Math.random`
in `src/sim`, 0 unsafe explicit `any` in `src/sim`, 0 UI/render/store/Zustand/
React/lucide imports in `src/sim`, 0 new ecology systems/modules, 0 active
violence/combat behavior, 0 unsupported settlement/culture/territory/
agriculture/war/trade/religion systems, 0 named people/individual biography
hits, and 0 tech-tree/unlock hits.

Caveats: this pass intentionally does not make knowledge affect movement,
survival, demography, actual fission inheritance bottlenecks, or actual
inter-band transfer. Derivation is bounded and cached, but selected-band
projection still composes several accepted detail systems and should remain out
of hot tick paths.

Recommended next pass after acceptance: **DAUGHTER KNOWLEDGE BOTTLENECK-1**.

**MOVEMENT / CARRYING CAPACITY / RANGE SATURATION HOT-PATH OPTIMIZATION-1 complete
2026-07-07 - PASS recommended with caveat.** This pass builds on
PERFORMANCE ARCHITECTURE-2 RADICAL and does not restart, delete, or redo
accepted systems. It is a behavior-neutral sim hot-path optimization pass over
movement/candidate passability, carrying-capacity setup, range/context support,
and benchmark diagnostics. No ecology or civilization content system was added.

Files changed for this pass: `src/sim/world/seasonal.ts`,
`src/sim/world/hydrography.ts`, `src/sim/agents/campMovement.ts`,
`src/sim/agents/contextCache.ts`, `src/sim/agents/carryingCapacity.ts`,
`src/sim/agents/sharedCatchment.ts`, `src/sim/rules/bandDecision.ts`,
`src/ui/band/Technical.tsx`, `src/architecture/graphData.ts`,
`scripts/simBenchmark.mjs`, and this handoff.

Profiling method: before edits, `npm run sim:benchmark -- --targeted-perf-6-profile
--perf-years 100 --json` on `map2_varied_migration` measured 39,090.72 ms
total, 97.7268 ms/tick average, max tick 365.1118 ms. The top costs were
`movementDecisionAndPressure` 15,652.49 ms, `movement:candidateGeneration`
5,007.13 ms, `contextBeforeDecisionRangeSaturation` 4,733.19 ms,
`contextBeforeDecisionFrontierOpportunity` 3,976.60 ms, and
`context:contextBeforeDecision:frontierKnowledge` 3,070.78 ms. Candidate
counters showed 42,096 known move candidates considered, 30,307 accepted,
41,277 total candidates, and 35,362 report-bias computations.

Chosen optimization architecture: deterministic exact caches/indexes only.
`getSeasonalTileConditions` now caches per `WorldTime` object and tile id.
Camp-movement support caches sorted neighbor ids and relief-radius topology by
the static `world.tiles` object, and computes the local camp-shift fallback only
inside the existing condition where that fallback can affect scoring.
Shared-catchment fallback footprint rings are cached by static map topology.
`TickContextCache` now carries `nonDispersedBandCount`, replacing a repeated
full-band scan in carrying capacity while preserving the old scan as fallback.
Hydrography caches movement crossing lookup by directed edge over static map
topology and seasonal crossing state by `WorldTime`, directed crossing, and
aggregate crossing capability. `getReportedKnowledgeTargetBias` now keys its
per-decision cache by the actual semantic input (`usable` vs `unusable`
evidence), not by which equivalent evidence boolean made it usable.

Invalidation rules: `WorldTime` object caches invalidate naturally whenever the
sim advances time; static topology caches invalidate when a new `world.tiles`
object exists; `TickContextCache` is rebuilt per fixed world snapshot; the
crossing-state cache includes the directed crossing and capability bits. Cached
arrays/objects are read-only by convention and only consumed through filtering,
mapping, or numeric scoring. Candidate dedupe was intentionally not applied in
the behavior path; `duplicateCandidatesRemoved=0`, candidate/reason order is
preserved, and `candidateReasonHydration` remains after sorting/selection.

After profile: the same 100-year PERF-6 profile measured 38,682.01 ms total,
96.7050 ms/tick average, max tick 365.0649 ms. Movement passability improved
from 625.78 ms before to 427.21 ms after, camp-movement decision support from
979.51 ms to 762.63 ms, candidate generation from 5,007.13 ms to 4,827.90 ms,
and movement decision/pressure from 15,652.49 ms to 15,029.14 ms. Carrying
capacity remains ~1,992.98 ms before-decision / 1,793.97 ms after-decision in
the profiled sample; frontier knowledge remains the largest context subphase at
3,215.29 ms. This proves the remaining bottleneck is not river passability or
camp fallback topology; it is frontier/range/context propagation plus broad
movement candidate scoring.

All-fast before/after versus accepted PA-2 baseline: accepted PA-2 reference was
128,542.94 ms total, max average ~82.816 ms/tick, max single ~248.7543 ms,
slowest scenario `crowded_delta` ~24,767.85 ms. After this pass:
`npm run sim:benchmark -- --all --fast --json` measured 25/25 scenarios,
127,532.62 ms total (1,010.32 ms faster, 0.79%), max average 80.8241 ms/tick,
max single 273.6865 ms, slowest scenario `crowded_delta` 25,061.27 ms. Fission
conservation failures: 0. The runtime improvement is real but small; acceptance
rests on the implemented subphase wins plus exact proof of the remaining
bottleneck.

Behavior fingerprint method: deterministic repeat compares action distribution
(`stay`, `move_to_tile`, `explore_unknown_neighbor`, `logistical_probe`,
`resource_scout`), fissions, extinctions, absorptions, total population, world
positions/events snapshot, carrying-capacity support ratios, range saturation,
frontier pressure, and nearby-opportunity targets. The new targeted audit also
reports candidate counts, approximate tile scans, cache hit/miss counts, stale
cache detections, and behavior diff count.

Technical integration: the Technical tab now exposes movement hot-path
diagnostics, exact benchmark phase names, cache/index proof, latest candidate
counts, and the explicit no-dedupe behavior decision. The architecture graph has
a `movementHotpathOptimization` node linked to Movement, Hydrography, Capacity,
and the remaining per-tick recompute risk.

New audit: `--targeted-movement-carrying-range-hotpath-audit --json`. It verifies
profiling, movement candidate measurement, carrying-capacity/range/frontier
measurement, deterministic cache keys and invalidation, behavior/support/range
fingerprints, fission conservation, static guards, Technical diagnostics, graph
documentation, all-fast reference deltas, and remaining bottleneck proof.

Static guards to rerun before final handoff: `Math.random` in `src/sim` expected
0; unsafe explicit `any` in `src/sim` expected 0; UI/render/store/Zustand/React/
lucide imports in `src/sim` expected 0; new ecology/civilization systems
expected 0; active violence/combat and tech-tree/unlock language expected 0.

Caveats: this pass does not collapse the three context phases and does not change
frontier-knowledge propagation caps, range-saturation math, carrying-capacity
support math, fission thresholds, demography, or movement weights. The largest
future performance win likely requires a behavior-sensitive context signature
cache or a narrower frontier-knowledge propagation representation, both of which
need their own A/B behavior proof.

Recommended next pass: **KNOWLEDGE CARRIERS / DECAY / DORMANCY-1**, then
**DAUGHTER KNOWLEDGE BOTTLENECK-1**.

**PERFORMANCE ARCHITECTURE-2 RADICAL complete
2026-07-07 - PASS recommended.** This pass did not restart
or delete accepted systems. It is a behavior-neutral performance architecture
pass over the existing worker/UI/projection/benchmark paths, with the ecology
road lock preserved. No Resource Class Framework, Patch Knowledge Bridge, Plant
Ecology, Fauna Stocks, Water Quality, Disease Ecology, depletion/regrowth,
animal movement, food patch system, settlement, culture, territory, agriculture,
war, trade, religion, or tech-tree system was added.

Files changed for this pass: `src/sim/runner/simRunner.ts`,
`src/ui/BandPanel.tsx`, `src/ui/band/BandMarkdownExport.tsx`,
`src/ui/band/Technical.tsx`, `scripts/simBenchmark.mjs`, and this handoff.
Accepted earlier systems remain present and were not redone.

Profiling before edits found two distinct costs. Sim tick cost is still led by
movement/context: `movementDecisionAndPressure`, range saturation, carrying
capacity, and movement candidate generation. UI/playability cost was dominated
by payload/projection: the selected-band live panel was sending a raw band object
of ~0.8-1.3 MB in existing audits, while full dynamic snapshots were ~8-13 MB
and JSON/clone costs reached tens to hundreds of ms. Public story derivation is
the hottest selected-band profile when requested because it composes canonical
events, chronicle, identity, adaptive human, camp movement, and social diffusion.
Markdown export was also expensive because opening the drawer mounted every
selected-band tab, including Technical, into a hidden DOM tree and regenerated on
live refresh.

Chosen architecture: a selected-band-only live detail protocol. The worker still
sends full snapshots rarely for Technical/raw inspection, but the frequent
selected-band panel update now returns `SimSelectedBandLiveSummary` with
`detailMode: "live-summary"`, deterministic `projectionKey`, payload estimates,
and hard caps for recent trips, activity paths, residential moves, event windows,
camp talk, movement history, and decision history. The audit sample after the
change measured selected band raw bytes 380,947 -> selected projection 104,817
bytes (72.49% reduction); the runner's compact band estimate inside the
projection was 71,661 bytes. Full dynamic snapshot was 5,349,298 bytes and live
overlay 1,579 bytes in the same sample.

Lazy/tab derivation design: `BandPanel` still mounts only the active tab. It now
merges live summary data into the full snapshot band only for the light live
tabs (`Overview`, `Doing`) and roster. Heavy tabs (`Events`, `Ideas & Solutions`,
`Movement & Camp`, `Between Bands`, `History`, `Technical`, Knowledge/Identity,
etc.) use the last full snapshot and do not recompute on every live selected-band
refresh. Technical raw proof remains available from full snapshots and collapsed
Technical groups lazy-mount their content. Markdown export is now explicit:
opening the drawer no longer mounts the hidden export source; `Generate .md`
mounts sections on demand, builds markdown, then unmounts the source again.

Cache/invalidation design: live selected-band summaries use deterministic keys
from world seed/run seed, tick/day/season, band id, current tile, and latest
decision. The PA-2 audit repeats the same projection and expects a cache-key hit,
then advances the world and expects invalidation. Sample result: hits 1, misses 0,
invalidation changes 1, stale selected-band data count 0.

Payload budget design: normal UI gets compact live selected-band summary and
bounded public story cards; Technical/export can request raw proof on demand.
Public story remains capped at 36 items, 3 evidence chips/item, and 4 source
refs/item. The PA-2 audit sample retained 36 story items with 109 total
evidence/source refs, caps held true, public story payload 72,823 bytes, and
Technical raw payload still available at 380,947 bytes.

Worker/main-thread changes: no sim behavior moved or changed. The existing
worker selected-band update path now transfers compact live summary instead of
raw `Band`. Full dynamic snapshots remain measured and available for raw
inspection, but are not the frequent selected-band path.

Benchmark/audit changes: added
`npm run sim:benchmark -- --targeted-performance-architecture-2-audit --json`.
The audit verifies profiling diagnostics, selected-band detail protocol,
not-all-bands selected projection, lazy/tab gating, public-vs-Technical
separation, markdown on demand, story caps, deterministic keys, invalidation,
no stale selected band data, payload budgets, worker payload measurement,
behavior-neutral repeat sample, static guards, public story integrity,
Technical proof availability, graph-check documentation, and caveats/next steps.
It also reports derivation timings by profile. First PA-2 audit sample found
slowest selected-band derivations: publicHumanStory 418.18 ms, adaptiveHuman
142.81 ms, socialEcologicalDiffusion 74.55 ms, practiceFeedbackReadiness
36.10 ms, campFoothold 19.07 ms, campMovement 17.94 ms.

Verification results for this pass: `npx tsc -p tsconfig.json --noEmit` pass;
`npm run build` pass (Vite still warns on large chunks: `index` 2.32 MB,
worker 1.08 MB); `node --check scripts/simBenchmark.mjs` pass;
`node scripts/checkGraph.mjs` pass (**195 nodes / 663 links**, 0 duplicate ids,
0 dangling links); `npm run sim:benchmark -- --deterministic` pass with
`deterministic=true` and fission conservation true;
`npm run sim:benchmark -- --all --fast --json` completed 25/25 scenarios,
total runtime 128,542.94 ms, max average 82.816 ms/tick
(`map2_varied_migration`), max single tick 248.7543 ms (`baseline`), slowest
scenario by total runtime `crowded_delta` at 24,767.85 ms, fission conservation
true for all scenarios. Static guards: `Math.random` in `src/sim` 0, unsafe
explicit `any` in `src/sim` 0, UI/render/store imports in `src/sim` 0, active
violence/combat behavior 0, unsupported public fake/civ terms 0, PA-2
implementation-file ecology-road-lock grep 0.

Targeted audit battery passed:
`npm run sim:benchmark -- --targeted-performance-architecture-2-audit --json`;
`npm run sim:benchmark -- --targeted-public-human-story-events-ideas-talk-audit --json`;
`npm run sim:benchmark -- --targeted-range-rotation-pressure-relief-audit --json`;
`npm run sim:benchmark -- --targeted-intra-season-camp-shifts-establishment-audit --json`;
`npm run sim:benchmark -- --targeted-adaptive-human-ideas-solutions-routines-audit --json`;
`npm run sim:benchmark -- --targeted-social-ecological-interband-diffusion-audit --json`;
`npm run sim:benchmark -- --targeted-practice-feedback-routine-readiness-audit --json`;
`npm run sim:benchmark -- --targeted-problem-framing-practice-experimentation-audit --json`;
`npm run sim:benchmark -- --targeted-foothold-camp-ecology-care-storage-fire-audit --json`;
`npm run sim:benchmark -- --targeted-material-affordance-forager-engineering-audit --json`;
`npm run sim:benchmark -- --targeted-knowledge-ecology-activity-parties-audit --json`;
`npm run sim:benchmark -- --targeted-band-identity-ui-audit --json`;
`npm run sim:benchmark -- --targeted-event-system-ui-audit --json`;
`npm run sim:benchmark -- --targeted-deep-time-history-audit --json`;
`npm run sim:benchmark -- --targeted-deep-time-chronicle-ui-audit --json`;
`npm run sim:benchmark -- --targeted-ui-readability-polish-1c-audit --json`;
`npm run sim:benchmark -- --targeted-whole-ui-readability-history-fun-audit --json`;
`npm run sim:benchmark -- --targeted-band-chronicle-foundation-audit --json`;
`npm run sim:benchmark -- --targeted-band-chronicle-wiki-expansion-audit --json`;
`npm run sim:benchmark -- --targeted-specific-memory-referents-audit --json`.

Regression audit counts: PA-2 24/24 checks; public story pass; range rotation
pass; intra-season camp shifts pass; adaptive human 28/28; social diffusion
25/25; practice feedback 28/28; problem framing 30/30; foothold/camp 22/22;
material affordance 26/26; knowledge ecology 23/23; band identity 20/20; event
system 19/19; deep-time history 13/13; deep-time chronicle 15/15; UI readability
1C 24/24; whole-UI readability/history 33/33; band chronicle foundation 23/23;
band chronicle wiki 33/33; specific memory referents 25/25.

Remaining bottlenecks: movement candidate generation, repeated carrying
capacity/range saturation context, and composed selected-band public story
derivation. Alternatives considered and deferred: changing behavior-side
movement/carrying-capacity caches in this pass (higher determinism risk),
dropping raw details (not acceptable), moving public story into sim hot loops
(would violate projection purity), and new ecology/resource systems (road-locked).
Next recommended pass: targeted sim-hot-path cache/index work for movement
candidate generation and carrying-capacity/range context, with strict A/B
behavior fingerprints and invalidation proofs.

**PUBLIC HUMAN STORY / EVENTS + IDEAS + TALK READABILITY-1 complete
2026-07-07 - PASS recommended.** This pass was run after confirming
`RANGE ROTATION / PRESSURE RELIEF / TARGETED ESCAPE FIX-1` was present and
accepted in this handoff. It is a projection/readability pass over existing
grounded state. It does not reopen the ecology roadmap and does not implement
new resource classes, patch knowledge, plant ecology, fauna stocks, water
quality, disease ecology, depletion/regrowth, animal movement, food patches,
settlement, villages, inventory, property, agriculture, domestication,
territory, borders, war, trade, kinship, social networks, religion, language,
daily individual simulation, households, or a task economy.

Files changed for this pass: `src/sim/agents/publicHumanStory.ts`,
`src/ui/band/Events.tsx`, `src/ui/band/IdeasSolutions.tsx`,
`src/ui/band/CampMovement.tsx`, `src/ui/band/BetweenBands.tsx`,
`src/ui/band/History.tsx`, `src/ui/band/BandMarkdownExport.tsx`,
`src/ui/band/Technical.tsx`, `scripts/simBenchmark.mjs`,
`src/architecture/graphData.ts`, and this handoff. The working tree also still
contains accepted earlier-pass files (`adaptiveHuman`, `campMovement`,
`socialEcologicalDiffusion`, Pass 13.5 movement/range changes, chronicle/event
caps, etc.); they were reused and not restarted.

Inspected/reused public UI surfaces: Events, Chronicle/History, Ideas &
Solutions, Movement & Camp, Range rotation / pressure relief, Between Bands,
Knowledge/Identity context, Technical, and Markdown export. Inspected/reused
sim data: Adaptive Human ideas/responses/attempts/routines, Camp Movement and
Pass 13.5 `rangeRotation`, Canonical Events, Band Chronicle, Social-Ecological
Diffusion, Material Affordance, Problem Practice, Practice Feedback, Knowledge
Ecology, Camp Foothold, activity records, memory referents, place/route/crossing
memory, and Band Identity.

Architecture: new pure selected-band projection
`derivePublicHumanStoryProfile(world, band)` in
`src/sim/agents/publicHumanStory.ts`. It creates bounded `PublicStoryItem`
records for `internal_talk`, `outer_talk`, `event_story`, `idea_story`,
`attempt_story`, `routine_story`, `camp_story`, `range_rotation_story`, and
`chronicle_title`. Templates are structured in `PUBLIC_STORY_TEMPLATES` with
category, tone tier, required evidence, naming slots, fallback wording,
technical source refs, and deterministic keys. Selection uses stable hashing
and `Math.imul`, never `Math.random`; public wording is not imported by
decision paths and cannot affect sim behavior.

Concrete naming layer: public cards now prefer grounded names such as
`scraper`, `dull scraper`, `cutting stone`, `heavy sharp stone`, `digging stick`,
`hide wrap`, `skin pouch`, `reed bundle`, `grass sling`, `carrying bundle`,
`dry fuel bundle`, `firebrand`, `crossing pole`, and `tying cord`. Food wording
uses humble non-species labels when context exists: `sour river berries`,
`red berries`, `bitter roots`, `marsh tubers`, `starchy tubers`, `hard nuts`,
`seed heads`, `river greens`, `wetland shoots`, `small fish from the shallows`,
and `bitter leaves`. Unsupported exact species, advanced tools, boats, bows,
pottery, agriculture, cuisine, safe plant certainty, and settlement/culture
claims are blocked by template gates and audit guards.

Public UI integration: Events cards use public title/story/status/evidence
chips and add compact story highlights; Ideas & Solutions adds Camp talk and
renders ideas/attempts/routines as human problems, tries, and local habits;
Movement & Camp adds Movement stories and Range Rotation stories with human
wording; Between Bands adds Outer talks and humanized copied/withheld/trace
context; Chronicle/History adds compact recent human story snippets only;
Markdown export adds a Public human stories section; Technical adds Public
human story projection proof. Technical/debug fields remain separate and still
show ids, scores, caps, source refs, tone counts, leak counts, and payload.

Internal/outer talk design: internal talks cover camp arguments, copied-trick
mockery, carrying/scraper/reed-bundle disputes, old warnings, old-camp pull,
pressure, and care/camp burden when grounded. Outer talks cover trace-copying,
warnings, misunderstood/heard routes, riverbank/floodplain clues, and social
diffusion hooks. Band identity lightly changes wording when evidence supports
it: inherited daughter uncertainty, old warnings, old-camp pull, pressure,
social/copying posture, and care-focused constraints.

Dormant conflict hooks: one dormant conflict template exists for future tense
standoff wording, but it is not emitted as active behavior. New audit proof:
`dormantConflictTemplates=1`, `activeViolenceConflictEvents=0`, and
`dormantConflictBehaviorInfluence=0`. No combat, raids, injury/death from
violence, revenge cycles, territory, weapons mechanics, or diplomacy were
implemented.

Event/idea/attempt/routine/movement/range wording: event stories are compact
human-readable episodes over Canonical Events; ideas say what the band is
trying and why; attempts read as small episodes with result/status; routines
read as local habits with limits; camp movement explains establishment,
same-cluster shifts, old-camp pull, and recovery without public scores; Range
Rotation says "less-worn/good-enough riverbank" or blocked/scout relief instead
of `good_enough_relief`/`pressure relief score`. Chronicle titles remain compact
(`The Wet Camp Shift`, `The Less-Worn Riverbank`, etc.) and capped.

Tone tiers and rarity caps: templates support `grounded`, `colorful`,
`rare_odd`, `dormant_conflict`, and `technical_only`. Public output is capped at
36 stories/profile. In the final audit sample, grounded/common dominated:
`grounded=282`, `colorful=6`, `rare_odd=0`, `dormant_conflict=0`,
`technical_only=0`, `rareChaoticCount=0`. Rare odd templates are hard-gated and
do not spam.

New audit:
`npm run sim:benchmark -- --targeted-public-human-story-events-ideas-talk-audit --json`
passes **30/30**. Counts: 7 bands sampled, 8 profiles, 288 story items,
8 internal talks, 8 outer talks, 64 event stories, 48 idea stories, 48 attempt
stories, 40 routine stories, 24 camp stories, 8 range-rotation stories,
40 chronicle titles, 214 concrete tool/object names, 26 concrete food names,
0 fallback generic names, 16 skipped unsupported templates, 91 identity-
influenced stories, 0 raw/debug leaks, 0 unsupported fake terms, 53 duplicate
phrases under limit 57, 0 broken refs, max payload 40,032 bytes (39.09 KB),
max stories/profile 36, behaviorChanged false, behaviorInfluence 0,
publicTextAffectsDecisions false, deterministicTextRepeat true,
sameVersionBenchmarkRepeat true, payload bound 90,000 bytes.

Regression audits after Pass 14: Range Rotation **24/24**, Intra-season Camp
Shifts **27/27**, Adaptive Human **28/28**, Social Diffusion **25/25**,
Practice Feedback **28/28**, Problem Practice **30/30**, Foothold **22/22**,
Material Affordance **26/26**, Knowledge Ecology **23/23**, Band Identity
**20/20**, Event System **19/19**, Deep-Time History **13/13**,
Deep-Time Chronicle UI **15/15**, UI Readability 1C pass, Whole UI Readability
pass, Chronicle Foundation pass, Chronicle Wiki Expansion pass, Specific Memory
Referents pass. Older readability/chronicle audits still return pass verdicts
without a structured `checkSummary`, so exact pass/fail counts are `n/a` there.

Verification commands run: `npx tsc -p tsconfig.json --noEmit` pass;
`npm run build` pass (existing Vite large-chunk warning only);
`node --check scripts/simBenchmark.mjs` pass; `node scripts/checkGraph.mjs`
pass (**195 nodes / 663 links**, 0 duplicate ids, 0 dangling links);
`npm run sim:benchmark -- --deterministic` pass with `deterministic=true`
(400 ticks/year 100, 23,432.8 ms total runtime, 58.582 ms/tick, max 262.0441
ms/tick, active bands 8, total population 265, fissions 3, fission population
conserved true); all listed targeted audits pass.

All-fast: `npm run sim:benchmark -- --all --fast --json` completed **25/25**
scenarios. Aggregate: active bands 132 / total bands 138, absorbed bands 1,
extinct bands 5, known total population sum 3,820 with 2 null summary paths,
start population sum 3,815, known population delta sum 310 with 2 null summary
paths, fissions 5, fission conservation failures 0, total runtime 128,651.67
ms, max average 82.27 ms/tick, max single tick 255.572 ms. Behavior/economy
counts match the accepted Pass 13.5 handoff baseline for normalized scenario
outcomes (baseline population 260/fissions 3, `map2_varied_migration`
population 246/fissions 0, isolated-fragile extinct 1, crowded-delta-saturation
extinct 4). Runtime-only differences are expected wall-clock noise.

Static guards: direct guards report `Math.random` in `src/sim` 0, unsafe
explicit `any` in `src/sim` 0, UI/render/store/Zustand/React/lucide imports in
`src/sim` 0, new ecology imports in `publicHumanStory` 0, and tech-tree/unlock
language in public story UI 0. The audit static guard also reports
activeViolenceCombatBehavior 0, unsupported fake public terms 0, unsupported
settlement/culture/territory/agriculture/war/trade/religion public terms 0,
and techTreeUnlockLanguage 0.

Caveats: Pass 14 is a public projection layer, not a behavior pass. The two
all-fast scenarios that serialize `totalPopulation`/`populationDelta` as null
(`unused_lake_daughter_colonization`, `risky_plant_scout_live`) remain a
pre-existing benchmark-summary quirk, not a conservation failure. Rare chaotic
templates exist but did not fire in the final sample because their caps/gates
kept them rare. Next recommended pass: **PERFORMANCE ARCHITECTURE-2 RADICAL**.

**RANGE ROTATION / PRESSURE RELIEF / TARGETED ESCAPE FIX-1 complete
2026-07-06 - PASS recommended.** This was a narrow diagnostic and behavior
fix on top of Adaptive Human and Camp Movement. It does not reopen the ecology
roadmap and does not implement resource classes, patch knowledge, plant ecology,
fauna stocks, water quality, disease ecology, depletion/regrowth, animal
movement, new food patches, settlement, villages, inventory, property,
agriculture, domestication, territory, war, trade, kinship, culture, language,
religion, daily individuals, households, or full task economy.

Files changed for this pass: `src/sim/agents/types.ts`,
`src/sim/agents/campMovement.ts`, `src/sim/rules/bandDecision.ts`,
`src/sim/rules/types.ts`, `src/sim/agents/eventSystem.ts`,
`src/ui/band/CampMovement.tsx`, `src/ui/band/Technical.tsx`,
`src/ui/BandPanel.tsx`, `src/ui/band/BandMarkdownExport.tsx`,
`src/index.css`, `scripts/simBenchmark.mjs`, `src/architecture/graphData.ts`,
`src/sim/agents/bandChronicle.ts`, and this handoff. The chronicle change is a
projection-size cap (`LINK_TARGET_CAP` 40 -> 36, page paragraphs already capped
at 3) to keep existing chronicle audits under their accepted 80 KB payload
bound; it does not affect sim decisions.

Existing systems inspected/reused: `campMovement`, `bandDecision`, residential
moves, local camp shifts, establishment, old-camp decay, stagnation escape,
Adaptive Human selected responses, place/camp memory, carrying/support pressure,
body/camp logistics pressure, weakness/fate signals, frontier/outward
establishment context, known unused habitat, memory referents, canonical events,
Technical UI, and existing terrain/hydro/pressure evidence. No duplicate
ecology or migration substrate was created.

Diagnostic findings before the behavior patch: good nearby alternatives could
exist, but there was no separate "good-enough but less exhausted" relief class;
strict opportunity logic still leaned toward "better than current" when the
real need was to rest a worn local patch. River/refuge memory and old-camp pull
were valid but could stay too sticky around the same tiny cluster. Stagnation
escape records could describe risky relocation without enough target-integrity
accounting. Local-shift behavior existed globally, but it was not cluster-aware
enough to prove whether a 1-tile move was a same-camp relief shift or a true
new-place establishment. Non-food pressures existed in pressure/logistics state
but were under-read by relief selection. Frontier/edge candidates could be
plausible yet should become scout/probe bridges when confidence is low, not
silently disappear. Fission was not the right fix for the observed low-population
trap; no fission behavior was added.

Root cause of the observed trap: the system had local shifts, stagnation
escape, frontier probes, old-camp decay, and movement pressure, but not one
bounded candidate concept saying "this place is not richer, only less worn, and
that is enough for now." Target integrity was also too implicit: a response
could look like an escape attempt even when the relief/migration target was not
real. Same-cluster 1-tile shifts could reset establishment as if the band had
entered a truly new place.

Implementation: `RangeRotationPressureReliefState` now lives under
`CampMovementState.rangeRotation`. A bounded radius-4 familiar-country search
builds up to 6 `PressureReliefCandidate` records with candidate tile, relation
to current cluster, knownness/confidence, support adequacy, water/refuge
adequacy, pressure relief score, use-pressure difference, camp sickness/wear
relief, crossing/travel cost, old-camp pull penalty, uncertainty,
`betterThanCurrent`, `strictFoodBetter`, `goodEnoughRelief`, status, action
strategy, reason label, and evidence refs. Relief candidates are valid when
support/water/refuge/passability are good enough and pressure is lower; they do
not require raw support superiority. Existing non-food pressure feeds the score:
camp sickness, cleanliness/move-away bias, material wear, care/travel burden,
carrying constraints, fatigue, risk, crowding, move pressure, local use pressure,
range saturation, old-camp pull, crossing cost, and stagnation flags.

Movement integration remains bounded. A chosen relief move contributes a
`pressure_relief_move` decision support trace over the existing `move_to_tile`
action. A plausible but uncertain relief candidate becomes a `relief_scout_probe`
over the existing `logistical_probe`/`resource_scout` family. River following
stays valid: same-river-country candidates are allowed and counted, and the pass
does not add random long-distance migration. Behavior influence is capped and
traced through camp-movement reason records; final audit reported 9 behavior
deltas, max 0.18, by scale `new_place_establishment: 8` and
`pressure_relief_move: 1`.

Targetless escape fix: escape-like responses now require a concrete move,
scout, probe, or local-shift target, otherwise the record becomes blocked /
no-viable-response with an explicit reason. The Technical profile reports
responses with target, blocked responses, targetless attempts, repeated
targetless attempts, and latest blocked reason. Event wording was tightened so
normal event text says "target recorded" or "blocked without a target"; raw tile
ids stay in structured/Technical fields only.

Local orbit trap detection: `localOrbitTrap` detects repeated 1-tile moves
inside the same worn cluster, persistent high local pressure/saturation,
backtracking/old-camp churn, and lack of a successful relief target. Escalation
can select a less-used nearby candidate, scout/probe an edge, or explicitly
block. Same-cluster/local-range ids are derived from terrain/hydro context, not
new territory state.

Cluster-aware establishment: establishment now distinguishes
`continued_place`, `same_cluster_shift`, `pressure_relief_shift`, and
`new_cluster_establishment`. Same-cluster shifts can carry over partial
confidence/familiarity (final audit carry-over amount samples 0.58) instead of
resetting establishment on every 1-tile move. New clusters still reset with a
reset reason such as "new local cluster." Old-camp pull is adjusted, not wiped.

UI and events: the public Movement & Camp tab adds a compact Range rotation /
pressure relief section with chosen/nearby candidates and establishment scope
wording. Technical adds Range rotation / pressure relief, Escape target
integrity, Local orbit trap, Establishment scope, relief candidate/rejection
details, pressure relief score, use-pressure difference, support/water adequacy,
crossing/travel cost, old-camp pull, scout/probe bridge, targetless counts, and
payload/integrity proof. Event hooks exist for range pressure relief, scout for
relief place, local orbit trap detected, and targetless escape blocked; final
sample run produced 0 pressure-relief events after event-family caps because
none were salient enough in the selected capped event list. That is acceptable:
the hooks are wired and non-spamming.

New audit:
`npm run sim:benchmark -- --targeted-range-rotation-pressure-relief-audit --json`
passes **24/24**. Counts: 8 bands sampled, 9 profiles, 20 relief candidates,
20 good-enough candidates, 8 good-enough candidates not better than current,
3 chosen relief moves, 0 rejected relief candidates, 1 blocked relief move,
2 scout/probe bridges, targetless escape diagnostic before 1, targetless after
0, repeated targetless after 0, 1,382 escape responses with target, 0 blocked
escape responses in final sample, 1 local orbit trap, 6 same-cluster shifts,
1 new-cluster establishment, 6 establishment carry-over cases, 1 establishment
reset case, 47 old-camp decay cases, 7 stagnation flags, 0 pressure-relief
events in capped event output, 3 river-following moves retained, 0 long-distance
migrations caused by this pass, 0 fission changes, population/fission
conservation total population 260, active bands 8, negative-population bands 0,
fission event population mismatches 0, broken links 0, fake ecology/culture/
settlement hits 0, max payload 47,001 bytes (45.9 KB). Runtime impact is bounded
by radius 4 and cap 6 candidates/profile.

Verification after final fixes: `npx tsc -p tsconfig.json --noEmit` pass;
`npm run build` pass (existing Vite large-chunk warning only);
`node --check scripts/simBenchmark.mjs` pass;
`node scripts/checkGraph.mjs` pass (**194 nodes / 654 links**, 0 duplicate ids,
0 dangling links); `npm run sim:benchmark -- --deterministic` prints
`deterministic=true` with 400 ticks/year 100, 23,102.04 ms total runtime,
57.7551 ms/tick, total population 265, active bands 8, fissions 3, fission
population conserved true.

Regression audits now pass: Range Rotation **24/24**, Intra-season Camp Shifts
**27/27**, Adaptive Human **28/28**, Social Diffusion **25/25**, Practice
Feedback **28/28**, Problem Practice **30/30**, Foothold **22/22**, Material
Affordance **26/26**, Knowledge Ecology **23/23**, Band Identity **20/20**,
Event System **19/19**, Deep-Time History **13/13**, Deep-Time Chronicle UI
**15/15**, UI Readability 1C pass, Whole UI Readability pass, Chronicle
Foundation pass (max payload 79,103 bytes / 77.25 KB), Chronicle Wiki Expansion
pass (0 broken links, max payload 79,103 bytes), Specific Memory Referents pass.

All-fast: `npm run sim:benchmark -- --all --fast --json` completed 25/25
scenarios; all completed and all fission-population conservation checks were
true. Compact aggregate from the parsed run: total runtime 124,784.08 ms,
max average 76.6171 ms/tick, baseline population 260, `map2_varied_migration`
population 246, extinct bands by scenario still isolated-fragile 1 and
crowded-delta-saturation 4, absorption transfers still 5 in absorption-rescue.
Compared with the previous Pass 13 handoff aggregate, this behavior-active pass
kept completion and conservation, with compact movement/economy drift expected:
aggregate active/total bands 133/139 -> 132/138, aggregate fissions 6 -> 5,
extinct bands 5 unchanged, absorbed bands 1 unchanged, absorption transfers 5
unchanged, extinction removals 32 unchanged, total decisions 15,914 -> 15,958,
stays 772 -> 828, moves 14,040 -> 14,132, probes 1,033 -> 937, resource scouts
63 -> 55. Two all-fast scenario summary paths still serialize
`totalPopulation`/`populationDelta` as `null` (`unused_lake_daughter_colonization`
and `risky_plant_scout_live`); this is pre-existing benchmark-summary behavior,
not a population-conservation failure.

Static guards: `Math.random` in `src/sim` 0; unsafe explicit `any` in `src/sim`
0; UI/render/store/React/Zustand/lucide imports in `src/sim` 0; changed ecology
module paths 0; targeted audit static counters `newEcologyModulesIntroduced` 0,
`techTreeUnlockLanguage` 0, `fakeCultureCivLanguage` 0. Broad diff greps for
settlement/culture/territory/agriculture/war/trade/religion and tech-tree words
only hit negated guard/audit/source-check text and architecture future-hook
labels, not public positive claims.

Caveats: pressure-relief events are wired but did not appear in the final capped
event sample; they should appear only when salient. The all-fast behavior drift
is real and expected because this pass is behavior-active. Relief remains
conservative and local: if known/familiar options are unsafe or too uncertain,
the band should block or scout rather than jump to paradise. This was followed
by Pass 14; current next recommended pass: **PERFORMANCE ARCHITECTURE-2
RADICAL**.

**INTRA-SEASON CAMP SHIFTS + NEW-PLACE ESTABLISHMENT + STAGNATION ESCAPE-1
complete 2026-07-06 - PASS recommended.** This behavior-active pass builds on
the accepted Adaptive Human loop and makes bands less passive in bad places
without reopening the old ecology roadmap. Ecology remains done enough for the
current MVP road: this pass reads existing terrain/hydrography, accepted
affordance/knowledge/problem/practice/foothold/social/activity/memory context,
but does not create resource classes, patch knowledge, plant ecology, fauna
stocks, water quality, disease ecology, plant seasonality, depletion/regrowth,
animal movement, or a new food-patch system.

New module `src/sim/agents/campMovement.ts` adds compact behavior state and
derived profiles for local camp shifts, temporary/task camps, new-place
establishment, hard-move recovery, old-camp pull decay, stagnation escape, and
passive-collapse auditing. The behavior is hybrid: a bounded `campMovement`
state is stored on `Band`, while public/technical profiles are selected-band
derivations. State caps are small and explicit: 8 recent local shifts, 6
temporary camps, 6 old-camp decay records, 8 stagnation escape records, 4
evidence refs/item, and score deltas capped at 0.22. Daughter fission does not
clone this state (`demography.ts` resets `campMovement`), so inherited parent
camp pull is not treated as local establishment.

Movement integration is intentionally narrow and auditable. `bandDecision.ts`
derives camp-movement support once per decision cache, then shapes only
existing actions: `stay` for recovery hold, `move_to_tile` for local camp shift
or new-place establishment, and existing `logistical_probe` / `resource_scout`
for temporary task camps and probes. It never creates new action types, never
does a full-map best-tile search, and never reads hidden resource truth. Local
shift targets are bounded to observed current-neighbor / second-ring known
tiles within distance 2, with passability and camp-plausibility checks.
Influence is traced through the new `camp_movement_response_selected` reason
type in `src/sim/rules/types.ts`, including scale, status, expected benefit,
risk, behavior-effect scope, target tile, score delta, and basis.

The implementation distinguishes three movement scales: local camp shift
(nearby repositioning, not a residential migration), temporary/secondary task
camp (short-lived support for scouting/food/crossing/recovery work), and
residential relocation (the existing whole-band move path). Establishment
markers track target tile, age, confidence, outcome, recovery need, old-camp
pull, local familiarity, retreat risk, blocked reasons, and evidence. Recovery
hold can damp immediate churn after hard movement without guaranteeing survival.
Old-camp pull decays gradually from poor returns, overuse, failed returns,
crossing risk, stagnation, or successful new establishment, and can recover if
later evidence supports the old place. An oscillation guard blocks repeated
back-and-forth local shifts without new evidence.

Events are integrated as observe-only canonical drafts from stored camp-movement
records in `eventSystem.ts` (`camp_movement_record`). Salient local shifts,
temporary camps, establishment/escape records, and old-anchor decay can appear
as compact `movement_place` / `recent_pattern` events. Chronicle prose was not
expanded to avoid noise. The public UI adds `src/ui/band/CampMovement.tsx`,
BandPanel and markdown-export tab wiring, and styles. The **Movement & Camp**
tab shows current camp situation, local shifts, temporary camps, establishment,
stagnation escape, old-camp pull, and passive-collapse notes with evidence
chips and humble wording. It avoids raw ids/debug arrays and avoids settlement,
territory, property, agriculture, culture, or optimization language. Technical
UI adds **Intra-season movement / establishment substrate** with counts, state,
old-camp decay reasons, stagnation/passive-collapse audit, movement-scale
decision counts, adaptive/foothold/activity/event/movement/demography refs,
behavior caps, payload, and integrity flags.

A narrow accepted-system fix was also made in
`src/sim/agents/memoryReferents.ts`: candidate remembered camp-place referents
now receive a small projection-only score bonus so the existing "candidate
remembered place, not occupied camp" wording survives referent caps. This fixed
a real Specific Memory Referents audit failure (`usedZeroPlacesExplained`), did
not touch behavior, and made the cascade audits pass again.

New audit:
`npm run sim:benchmark -- --targeted-intra-season-camp-shifts-establishment-audit --json`
passes **27/27**. Metrics: 8 bands sampled, 10 profiles, 31 local camp shifts,
11 temporary/secondary camps, 10 establishment states, 1 establishment success,
1 establishment failure, 2 recovery holds, 50 old-camp decay cases, 8
stagnation flags, 66 stagnation escape responses, 3 passive-collapse cases, 0
suspicious passive-collapse cases, 4 daughter establishment cases, 107
adaptive-response refs, 100 foothold refs, 4 activity refs, 112 event refs, 15
canonical camp-movement events, 393 movement-reason refs, 12 demography/labor
refs, 0 broken links, 0 raw/debug hits, 0 fake settlement/culture/ecology hits,
0 tech-tree hits, 1 oscillation case, max payload 24,736 bytes (24.16 KB), max
stored entries/band 8, max evidence/item 4. Behavior deltas were bounded:
10 traced influences, max delta 0.16, by scale new-place-establishment 8,
local-camp-shift 1, hard-move-recovery 1. Population check in the audit:
start 155, final 269, active bands 8, negative-population bands 0; fission
population mismatch 0; projection mutated bands false.

Verification after final fixes: `npx tsc -p tsconfig.json --noEmit` pass;
`npm run build` pass (existing Vite large-chunk warning only);
`node --check scripts/simBenchmark.mjs` pass;
`npm run sim:benchmark -- --deterministic` prints `deterministic=true`;
`node scripts/checkGraph.mjs` pass (**194 nodes / 654 links**, 0 duplicate ids,
0 dangling links). Regression audits pass after the referent cap fix:
Adaptive Human **28/28**, Social Diffusion **25/25**, Practice Feedback
**28/28**, Problem Practice **30/30**, Foothold **22/22**, Material Affordance
**26/26**, Knowledge Ecology **23/23**, Band Identity **20/20**, Event System
**19/19**, Deep-Time History **13/13**, Deep-Time Chronicle UI **15/15**, UI
Readability 1C pass, Whole UI Readability pass, Chronicle Foundation pass,
Chronicle Wiki Expansion pass, Specific Memory Referents pass. All-fast current
run completed 25 scenarios: total runtime 122,882.76 ms, max tick 245.4007 ms,
aggregate active/total bands 133/139, extinct bands 5, absorbed bands 1,
fissions 6, fission population conserved in all reported scenarios, absorption
transfers 5, extinction removals 32, movement decisions 15,914. Two all-fast
scenario summaries (`unused_lake_daughter_colonization`,
`risky_plant_scout_live`) still serialize `totalPopulation`/`populationDelta`
as `null` in the benchmark summary path; the new targeted audit and other
scenario summaries show no negative-population or fission-conservation failure.
Comparison against the previous Adaptive Human all-fast artifact
`/tmp/all-fast.json`: 25/25 scenarios completed in both; aggregate active bands
133, total bands 139, extinct bands 5, absorbed bands 1, fissions 6,
absorption transfers 5, extinction removals 32 unchanged. Movement decisions
shifted as expected for the new camp-scale behavior: total decisions 15,930 ->
15,914, stays 766 -> 772, moves 14,271 -> 14,040, probes 804 -> 1,033,
resource scouts 81 -> 63; 12/25 scenarios had compact movement/economy deltas,
with over-capacity-core showing the largest intended shift (moves -124,
probes +154, population +11) and map2 varied migration population -4.
Static guards: `Math.random` in `src/sim` 0, unsafe/explicit `any` in `src/sim`
0, UI/render/store/React/Zustand/lucide imports in `src/sim` 0, new ecology
imports from `campMovement.ts` 0, tech-tree/unlock language in new movement UI
0, fake settlement/culture/agriculture/territory terms in new movement UI 0.

Intentionally not implemented: settlement, permanent villages, buildings,
property, inventory, storage economy, agriculture, domestication, territory,
borders, war, trade, kinship, social networks, culture/taboo/myth/religion/
language, new ecology systems, daily individual simulation, household systems,
full task economy, omniscient best-tile search, instant anchor wipeout, or
automatic success. If accepted, next pass: **STAGNATION ESCAPE / FAILURE
DIVERSITY / SOCIAL SUPPORT-1** unless review decides this pass already covers
enough stagnation escape and a shorter balancing pass is safer.

**ADAPTIVE HUMAN IDEAS / SOLUTIONS / LOCAL ROUTINES-1 complete
2026-07-06 - PASS recommended.** This pass adds the first behavior-active,
bounded adaptive-human loop on top of the accepted projection substrates. It
does not restart ecology and does not implement resource classes, patch
knowledge, plant ecology, fauna, water quality, disease, agriculture,
domestication, settlement, territory, war, trade, kinship, culture, language,
property, inventory economy, tech trees, global unlocks, or generic bonuses.

New pure/behavior module `src/sim/agents/adaptiveHuman.ts` adds deterministic
`AdaptiveIdea`, `AdaptiveResponse`, `SolutionAttempt`, `LocalRoutine`,
`AdaptivePracticeVariant`, and `ContextBoundAdaptation` structures. Ideas are
generated compositionally from accepted context: Problem Practice frames and
candidates, Practice Feedback readiness, Material Affordance, Knowledge Ecology,
Camp/Foothold, Social-Ecological Diffusion, current terrain/hydrography through
known tile context, activities/move/crossing/place/contact memory,
demography/labor/dependent pressure, prior attempts/routines, and current
pressure. Idea families implemented: carrying/logistics, food work,
route/crossing, camp/care, fire/fuel, water-edge, and social-copy. Sources
include local inference, inherited hints, copied/seen traces, repeated habit,
desperate improvisation, and old-routine variants. Rejected, blocked, bad,
desperate, dead-end, false-confidence, local-only, copied, and inherited ideas
are retained within caps.

Behavior influence is intentionally narrow and audited. `bandDecision.ts` reads
only lightweight `deriveAdaptiveDecisionSupport` from stored adaptive state, and
applies a capped score delta (`<= 0.24`) to existing actions only: stay, move to
tile, explore unknown neighbor, logistical probe, and resource scout. It does
not add new action types, hidden truth scans, global skills, or direct support/
yield/stress/demography formulas. Selected responses are traced through the
`adaptive_response_selected` reason type. `advanceAdaptiveHumanState` records
bounded selected responses, abstract subgroup attempts, feedback, variants,
routines, context-bound adaptations where evidence is strong, and a
passive-collapse audit. Subgroups are abstract only: whole band, scout party,
foraging party, crossing party, camp/care group, water-edge group, adult-heavy
group, and mixed camp group. Feedback event refs are compact
`adaptive-feedback:*` link targets in adaptive state, not noisy Chronicle prose.

Local routines can emerge only after repeated useful feedback in a plausible
context; repetition alone is insufficient. Context-bound adaptations require a
stable local routine, repeated success, compatible context, low contradiction,
and remain band-local/context-bound with failure conditions and transfer
difficulty. They are not tech-tree skills and are not universal. Daughter bands
inherit only partial ideas/variants; attempts, routines, and adaptations reset.
Socially copied ideas are partial and can fail through tacit difficulty,
material mismatch, local-only context, labor blockers, or false confidence.

UI added: `src/ui/band/IdeasSolutions.tsx`, BandPanel tab wiring, markdown
export, styles, and Technical proof. Public **Ideas & Solutions** shows current
problems, ideas being considered, selected/rejected/copied/inherited/desperate
ideas, tried solutions, outcomes, dead ends, local routines, and context-bound
practices only when present. It avoids raw ids, debug dumps, unlock/research/
level/bonus language, and fake culture/civilization framing. Technical adds
the **Adaptive ideas / solutions / routines substrate** section with idea/
response/attempt/routine/adaptation counts, family/status/outcome/feedback
counts, mutation counts, passive-collapse audit, source refs, behavior-influence
trace, caps, payload estimate, and integrity flags. Architecture graph now has
`adaptiveHuman` between Problem Practice / Practice Feedback / Material /
Knowledge / Camp / Social Diffusion / Activities / Memory / Demography and
future Practice Learning / Skills / Culture, with one explicit movement link.

Minimal accepted-system fixes made during closure: Problem Practice now reserves
one inherited evidence ref during evidence capping so daughter inherited memory
cannot be hidden behind lived evidence; Deep-Time Chronicle prefixes inherited
durable episodes as lineage memory so inherited and lived episode summaries do
not duplicate. These are projection/readability fixes only, not redesigns.

New audit
`--targeted-adaptive-human-ideas-solutions-routines-audit --json` passes
**28/28**: 9 profiles, 60 ideas, families carrying 9 / food 10 /
route-crossing 9 / camp-care 9 / fire-fuel 0 in sampled run / water-edge 7 /
social-copy 16; 46 response selections; 8 selected ideas; 32 rejected ideas;
116 attempts; outcomes clear-success 11, partial-success 93, mixed 8,
low-feedback 1, local-only-success 1, dead-end 1, blocked-before-attempt 1;
feedback quality clear 11, usable 94, mixed 8, weak 2, blocked 1; 54 routines
(5 promising, 49 locally reliable); 7 context-bound adaptations; 66 variants;
dead-end 3, false-confidence 8, local-only 55, copied ideas 8, inherited ideas
8, desperate ideas 2, subgroup executions 12, passive-collapse cases 1,
suspicious passive-collapse 0, event refs 116, problem refs 17, affordance refs
27, knowledge refs 29, practice-feedback refs 26, camp/foothold refs 37,
social-diffusion refs 30, behavior traces 9, broken/raw/tech-tree/fake-ecology/
fake-culture/fake-skill hits 0, max payload 56,979 bytes, max 8 ideas/profile,
max 14 attempts/profile, max 7 routines/profile, max 5 evidence/item. The
decision-path audit reports adaptive refs only in the intentional files
`bandDecision.ts`, `rules/types.ts`, and daughter inheritance reset in
`demography.ts`; accepted projection refs in decision paths remain 0.

Verification after final fixes: `npx tsc -p tsconfig.json --noEmit` pass;
`npm run build` pass (existing Vite large-chunk warning only);
`node --check scripts/simBenchmark.mjs` pass; `node scripts/checkGraph.mjs`
pass (**193 nodes / 641 links**, 0 dup, 0 dangling); deterministic benchmark
prints `deterministic=true`. Accepted regression sweep passes: Social Diffusion
25/25, Practice Feedback 28/28, Problem Practice 30/30, Foothold 22/22,
Material Affordance 26/26, Knowledge Ecology 23/23, Band Identity 20/20, Event
System 19/19, Deep-Time History 13/13, Deep-Time Chronicle 15/15, UI
Readability 1C pass, Whole UI Readability pass, Chronicle Foundation pass,
Chronicle Wiki Expansion pass, Specific Memory Referents pass. All-fast current
behavior-active run: 25 scenarios completed, no fission population conservation
failures, total extinct bands across stress scenarios 5, absorbed bands 1, max
runtime 29,444.88 ms, max average 92.0152 ms/tick, max tick 512.0917 ms.
Compared to the latest available projection-only all-fast artifact
`/tmp/practice-feedback-all-fast-final.json`, 16/25 scenarios are unchanged on
the compact behavior/economy fields checked; 9/25 differ as expected from active
adaptive response selection. Largest visible deltas: baseline population +2 and
stay decisions -41 / move decisions +60; crowded_delta one fewer fission and
population -3; over_capacity_core population -14, fragile bands +1, moves +123,
probes -156, resource scouts +33; map2_varied_migration population +3 and
fragile bands -1. No population-conservation failures were introduced.
Static guards: `Math.random` in `src/sim` 0, explicit unsafe `any` in
`src/sim` 0, UI/render/store/React/Zustand/lucide imports in `src/sim` 0,
accepted projection refs in decision paths 0. Existing `resourceClasses.ts` and
`faunaStock.ts` predate this road correction and were not introduced or
expanded by this pass.

**SOCIAL-ECOLOGICAL DEPTH + INTER-BAND KNOWLEDGE DIFFUSION-1 complete
2026-07-06 - PASS recommended.** This pass adds the first bounded selected-band
projection for the social landscape around a band: what can reach it from other
bands, traces, shared routes/waters, fission inheritance, and visible camp or
practice evidence without creating culture, diplomacy, trade, territory,
kinship, social networks, property, settlement, skills, adaptations, or decision
influence.

New pure module `src/sim/agents/socialEcologicalDiffusion.ts` derives
`SocialEcologicalDiffusionProfile` records. Profiles contain bounded
`SocialEcologicalContext` items for direct/contact, activity-talk, visible-trace,
old-camp-trace, parent/daughter, and shared route/water/country context, plus
bounded `SocialDiffusionItem` opportunities for partial knowledge exposure.
Diffusion items include deterministic ids, domain, public label, meaning line,
source/receiver/channel, visibility, tacit difficulty, material/context
compatibility, trust/caution filter, status, risks, inherited-vs-local basis,
evidence refs, linked knowledge/event/activity/affordance/practice-feedback/
foothold refs, and hard guards: `noSkillUnlocked`, `noAutomaticImprovement`,
and `noDecisionInfluence`. It is projection-only: not stored on `Band`, not read
by movement/economy/support/stress/demography/fission/carrying-capacity or any
decision path.

Channels implemented: direct contact/encounter, activity talk/report exposure,
visible practice/trace, old camp trace hook, parent/daughter inheritance, and
shared route/water/country. Domains implemented: route/crossing, food work,
camp/foothold/care, material affordance, fire/hearth/fuel, water-edge, and
social/contact. Statuses include heard-not-practiced, seen-not-understood,
visible-trace-only, superficial/partial copy, inherited story/practical hint,
tested locally, blocked-by-material/labor, local-only, false-confidence/dead-end
risk, compatible-but-untried, and diffusion-ready-later. `diffusion_ready_later`
is only a future hook, not knowledge transfer or a skill.

Evidence sources are accepted systems only: reported knowledge/contact memory,
canonical Events, Knowledge Ecology, Material Affordance, Practice Feedback,
Problem Practice, Camp Foothold, activity-party trip records, route/place/
crossing memory, Social Range Recognition, deep-history fission inheritance,
demography/labor context, and Band Identity only as secondary framing when other
evidence exists. Anti-omniscience is explicit: public and technical outputs do
not reveal hidden bands, exact other-band internal state, full intentions, or
tacit methods behind visible traces. Daughter/fission handling separates
parent-carried stories/warnings from locally tested daughter evidence and marks
parent-country mismatch where applicable. Trust/caution and withholding are
bounded filters/status hooks, not diplomacy, deception, strategy, or hostility
systems.

UI added: `src/ui/band/BetweenBands.tsx`, BandPanel tab wiring, markdown-export
wiring, and styles in `src/index.css`. The public **Between Bands** tab shows
what reaches the band from others, what is visible but not fully known, shared
country/routes, cautious or untrusted exposure, and daughter/parent memory when
present. It uses compact evidence chips and plain labels, avoids raw ids/debug
arrays, and avoids fake diplomacy/trade/territory/culture language. Technical UI
adds **Social-ecological diffusion substrate** with context/item counts,
channel/domain/status/tacit/compatibility/trust counts, source refs, caps,
payload, integrity flags, deferred systems, Chronicle decision, and decision-path
isolation. Chronicle integration was inspected and intentionally skipped for new
prose: this substrate is exposure/readiness context, not a historical
achievement.

Files changed for this pass: `src/sim/agents/socialEcologicalDiffusion.ts`,
`src/ui/band/BetweenBands.tsx`, `src/ui/BandPanel.tsx`,
`src/ui/band/BandMarkdownExport.tsx`, `src/ui/band/Technical.tsx`,
`src/index.css`, `src/architecture/graphData.ts`, `scripts/simBenchmark.mjs`,
and this handoff. `scripts/simBenchmark.mjs` also received a minimal
Deep-Time History static-guard allowlist update for the new observe-only
projection's `deepHistory` read; the Deep-Time audit behavior fingerprint stayed
identical and then passed.

New audit:
`npm run sim:benchmark -- --targeted-social-ecological-interband-diffusion-audit --json`
passes **25/25**. Metrics: 8 live bands sampled plus 3 fixtures, 11 profiles,
47 social contexts, 78 diffusion items. Items by channel: direct_contact 15,
activity_talk 29, visible_trace 27, old_camp_trace 0, parent_daughter 5,
shared_route_water_country 2. Items by domain: route_crossing 16, food_work 15,
camp_foothold_care 15, material_affordance 3, fire_hearth_fuel 5, water_edge
20, social_contact 4. Refs: direct/contact 10, activity/talk 67,
visible-trace 26, parent/daughter 4, shared route/water 10, knowledge 30,
event 5, affordance 65, practice-feedback 43, foothold 56. Basis counts:
inherited 7, local-tested 25. Tacit difficulty counts: low 18, medium 38,
high 8, unknown 14. Compatibility counts: compatible 53, weakly compatible 5,
mismatched place 3, inherited from different country 3, unknown 14. Trust/
caution counts: trusted-enough-to-hear 52, cautious-hearsay 35,
source-unknown 16, inherited-caution 4, friendly-contact 18. Failed imitation
53, partial copy 5, seen-not-understood 26. Broken links 0, raw/debug hits 0,
fake diplomacy/trade/territory/culture hits 0, fake skill/adaptation hits 0,
decision-path refs 0, projection mutated bands false. Max payload 33,497 bytes
(32.71 KB), max 8 items/profile, max 6 contexts/profile, max 2 evidence/item.

Verification run: `npx tsc -p tsconfig.json --noEmit` pass; `npm run build`
pass (existing Vite chunk-size warning only); `node --check scripts/simBenchmark.mjs`
pass; `npm run sim:benchmark -- --deterministic` prints `deterministic=true`;
`node scripts/checkGraph.mjs` pass **192/618**, 0 duplicate ids, 0 dangling
links. Regression audits pass: Practice Feedback **28/28**, Problem Practice
**30/30**, Foothold **22/22**, Material Affordance **26/26**, Knowledge Ecology
**23/23**, Band Identity **20/20**, Event System **19/19**, Deep-Time History
**13/13**, Deep-Time Chronicle UI **15/15**, UI Readability 1C pass, Whole UI
Readability pass, Chronicle Foundation pass, Chronicle Wiki Expansion pass, and
Specific Memory Referents pass. All-fast run completed **25/25** and normalized
identical to `/tmp/practice-feedback-all-fast-final.json`,
`/tmp/foothold-all-fast.json`, and the durable
`artifacts/event-system-ui-all-fast.json` after ignoring only `totalRuntimeMs`,
`averageMsPerTick`, `maxMsPerTick`, `phaseSummary`, and `slowestSubpasses`.
Static guards: `Math.random` in `src/sim` 0,
unsafe/explicit `any` in `src/sim` 0, React/Zustand/lucide and relative
UI/render/store imports in `src/sim` 0, social-diffusion decision refs 0, and
accepted Practice Feedback/Problem/Foothold/Material/Knowledge/Identity
projection refs in decision paths 0.

Intentionally not implemented: culture, taboos, myths, religion, worldview,
language/naming, deception/lying, formal alliances, diplomacy, trade/barter,
marriage/kinship/social networks, clans, territory/borders, war/raiding,
property/ownership, settlement, agriculture, domestication, inventory, skill or
adaptation acquisition, automatic practice learning, universal knowledge
sharing, Chronicle prose, or any new decision influence. If accepted, next pass:
**superseded by the 2026-07-06 MVP road lock**; do not move into Resource
Class / Patch Knowledge / Ecology coupling unless explicitly requested.

**PRACTICE FEEDBACK / ROUTINE LEARNING-READINESS-1 complete
2026-07-05 - PASS recommended.** This was a 2-in-1 closure plus
implementation pass. Part A re-verified and cleanly closes both immediately
previous substrates: **PROBLEM FRAMING + PRACTICE EXPERIMENTATION-1** remains
PASS with `--targeted-problem-framing-practice-experimentation-audit --json`
at **30/30** (8 live bands sampled, 9 profiles, 54 problem frames, 63
candidates, 0 broken links, 0 decision-path refs, max payload 43,521 bytes),
and **FOOTHOLD / CAMP ECOLOGY / CARE / STORAGE / FIRE-1** remains PASS with
`--targeted-foothold-camp-ecology-care-storage-fire-audit --json` at **22/22**
(8 live bands plus 4 fixtures, 12 profiles, 36 foothold places, 72 camp
factors, 12 storage signals, 12 fire signals, 12 care signals, 0 broken links,
0 decision-path refs, max payload 36,814 bytes). No redesign or rewrite was
needed for either accepted system.

Part B adds a new pure selected-band projection:
`src/sim/agents/practiceFeedbackReadiness.ts`. It derives
`PracticeFeedbackReadinessProfile` records with bounded
`PracticeFeedbackReadinessItem` entries answering whether repeated candidate
practices are producing usable, weak, mixed, blocked, local-only, inherited-only,
or contradicted feedback. It is projection-only: not stored on `Band`, not read
by decisions, no movement/economy/support/stress/demography/fission/carrying
capacity coupling, and no apply/advance path. Every item carries deterministic
ids, family/domain, public label, meaning line, linked problem/candidate/
affordance refs where available, repeated-exposure basis, feedback type,
feedback quality, familiarity signal, readiness status, blockers, risks,
lived-vs-inherited basis, local/transfer clue, evidence/source refs, and hard
guards: `noSkillUnlocked`, `noAutomaticImprovement`, `noDecisionInfluence`, and
`learningReadyLaterIsNotSkill`. `learning_ready_later` is only a future hook for
later Practice Learning; it is not a skill, adaptation, bonus, invention, or
decision input.

Families implemented: carrying/fiber handling, food work/processing, route/
crossing, camp setup/care, fire/hearth/fuel, water-edge capture, and tool/
digging/cutting. Feedback types implemented: clear success, clear failure,
mixed feedback, low feedback, delayed feedback, dangerous feedback, local-only
success, inherited/no-local feedback, contradicted by recent events, blocked/no
attempt, and familiarity only. Feedback qualities: clear, usable, mixed, weak,
delayed, dangerous, inherited-only, blocked, and contradicted. Readiness
statuses: not started, familiarity only, repeated low feedback, repeated mixed
feedback, learning ready later, blocked by material, blocked by labor, inherited
not tested here, dead-end risk, false-confidence risk, local-only, and
contradicted. Repetition explicitly does not improve anything by itself: bad
repetition can be low-feedback, contradicted, labor-blocked, material-blocked,
false-confident, local-only, or a dead-end risk.

Evidence sources are accepted projections only: Problem Practice candidates and
frames, Material Affordance, Camp Foothold, Knowledge Ecology, canonical Events,
activity-party trip records, repetition/familiarity hooks, current band
demography/labor context, movement/place/route/crossing memory where exposed,
and Band Identity only as context when other evidence already exists. Legacy
starting skills are ignored as proof. Daughter/fission handling separates
inherited from lived basis and does not treat parent-only routines as locally
tested; in this audit sample there were 3 daughter profiles and 0 inherited-only
readiness refs, because sampled daughters had lived/local basis rather than
story-only candidate basis. The structural path remains present for inherited
not-tested-here cases.

UI added: `src/ui/band/PracticeFeedback.tsx`, BandPanel tab wiring, and
practice-feedback styles in `src/index.css`. The public **Practice Feedback**
tab shows repeated trials, learning-ready-later items, dead ends/weak feedback,
inherited-but-untested items when present, compact evidence chips, feedback
labels, blockers, risks, and a visible note that no skill/adaptation or extra
effect exists. Public UI avoids raw ids, JSON/debug arrays, tech-tree/research/
unlock/level/bonus/mastery/invention/acquisition language, and avoids claiming
skills, settlement, culture, or storage economy. Technical UI adds
**Practice feedback / routine readiness substrate** with item/family/status/
feedback-quality/source/ref counts, caps, payload, integrity flags, deferred
systems, Chronicle decision, and decision-path isolation. Architecture graph now
has `practiceFeedbackReadiness` between Problem Practice, Material Affordance,
repetition/familiarity, Knowledge Ecology, Events, Activities, Camp Foothold,
memory, demography/labor, Identity, UI/Technical, and future Practice Learning,
Skills/Adaptations, Culture/Taboo, Ecology feedback, and Chronicle/history
hooks. Chronicle integration was inspected and intentionally skipped for new
prose: readiness is context, not a historical achievement or learned routine.

Files changed for this pass: `src/sim/agents/practiceFeedbackReadiness.ts`,
`src/ui/band/PracticeFeedback.tsx`, `src/ui/BandPanel.tsx`,
`src/ui/band/Technical.tsx`, `src/index.css`,
`src/architecture/graphData.ts`, `scripts/simBenchmark.mjs`,
`src/sim/agents/bandHistory.ts` (comment-only static-guard wording), and this
handoff. Previously accepted dirty files from Problem Practice, Foothold,
Material Affordance, Knowledge, Identity, and UI were left intact.

New audit:
`npm run sim:benchmark -- --targeted-practice-feedback-routine-readiness-audit --json`
passes **28/28**. Metrics: 12 profiles (8 live + 4 fixtures), 84 readiness
items, 12 items in each family. Feedback type counts: clear_success 0,
clear_failure 0, mixed_feedback 8, low_feedback 0, delayed_feedback 0,
dangerous_feedback 0, local_only_success 8, inherited_no_local_feedback 0,
contradicted_by_recent_events 33, blocked_no_attempt 16, familiarity_only 19.
Feedback quality counts: clear 0, usable 8, mixed 8, weak 19, delayed 0,
dangerous 0, inherited_only 0, blocked 16, contradicted 33. Readiness statuses:
learning_ready_later 8, blocked_by_material 16, blocked_by_labor 19,
false_confidence_risk 8, contradicted 33; other statuses 0 in this sample.
Repeated-exposure items 84; learning-ready-later items 8; dead-end risk count
52, false-confidence 12, local-only 12, low-feedback 27. Blockers:
missing_material 16, labor_burden 72, place_not_stable 7,
season_or_weather 36, feedback_too_weak 19, dangerous_or_contradicted 33,
inherited_not_local 0, unsupported_ecology 0. Source-system counts:
problem_practice 168, material_affordance 84, repetition_familiarity 41,
activity_party 3, camp_foothold 34, knowledge_ecology/canonical_event/
foothold_storage/foothold_fire/foothold_care/place_memory/route_memory/
crossing_memory/demography/band_identity 0 in this sample. Refs:
problem 35, candidate 84, affordance 96, knowledge 26, activity 9, event 22,
foothold 72, repetition 42, inherited/lived basis 0/330. Broken links 0,
raw debug hits 0, tech-tree hits 0, fake-skill hits 0, fake-culture hits 0,
settlement/inventory hits 0, legacy-skill hits 0, decision-path refs 0,
projection mutated bands false. Max payload 30,665 bytes (29.95 KB), max
items/profile 7, max evidence/item 4.

Verification run: `npx tsc -p tsconfig.json --noEmit` pass; `npm run build`
pass (existing Vite chunk-size warning only); `node --check scripts/simBenchmark.mjs`
pass; `npm run sim:benchmark -- --deterministic` prints `deterministic=true`;
`node scripts/checkGraph.mjs` pass **191/598**, 0 duplicate ids, 0 dangling
links. Regression audits pass: Problem Practice **30/30**, Foothold **22/22**,
Material Affordance **26/26**, Knowledge Ecology **23/23**, Band Identity
**20/20**, Event System **19/19**, Deep-Time History **13/13**, Deep-Time
Chronicle UI **15/15**, UI Readability 1C **24/24**, Whole UI Readability
**33/33**, Chronicle Foundation **23/23**, Chronicle Wiki Expansion **33/33**,
Specific Memory Referents **25/25**. All-fast comparison:
`/tmp/practice-feedback-all-fast-final.json` normalized against
`/tmp/foothold-all-fast.json` is identical after ignoring only
`totalRuntimeMs`, `averageMsPerTick`, `maxMsPerTick`, `phaseSummary`, and
`slowestSubpasses`. Static guards: `Math.random` in `src/sim` 0,
unsafe/explicit `any` in `src/sim` 0, UI/render/store/React/Zustand/lucide
imports in `src/sim` 0, practice-feedback/routine-readiness refs in decision
paths 0, accepted Problem/Foothold/Material/Knowledge/Identity/Event projection
refs in decision paths 0.

Intentionally not implemented: actual learned skills, adaptations, permanent
routine state, tradition, culture, taboo, myth, worldview, religion, language,
deception, agriculture, domestication, settlement, territory, war, social
network/kinship, inventory, property, storage economy, trade, tech tree,
population/economy bonuses, automatic basketry/boats/fish traps/shelters/
processing/tools/storage, Chronicle prose, or any new decision influence.
If accepted, next pass: **SOCIAL-ECOLOGICAL DEPTH + INTER-BAND KNOWLEDGE
DIFFUSION-1**.

**FOOTHOLD / CAMP ECOLOGY / CARE / STORAGE / FIRE-1 complete
2026-07-05 - PASS recommended.** This pass added the first bounded
selected-band projection for weak forager footholds: repeatedly used places,
camp traces, lived camp factors, care/camp organization pressure, temporary
holding/cache possibilities, and fire/hearth/fuel context. It is not settlement,
sedentism, agriculture, domestication, buildings, territory, property, trade,
full inventory, storage economy, kinship/social-network logic, culture, taboo,
myth, worldview, language, tech tree, skills, adaptations, bonuses, or a new
decision input. The projection reads accepted camp/logistics, memory, activity,
problem-practice, affordance, knowledge, event, identity, demography, movement,
seasonal, and pressure evidence; it does not write `Band` state and no movement,
economy, support, stress, demography, fission, carrying-capacity, or decision
path imports it.

New module `src/sim/agents/campFoothold.ts` derives `CampFootholdProfile`
records with bounded `CampFootholdPlace`, `CampFootholdFactor`,
`TemporaryCacheSignal`, `CampFireHearthFuelSignal`, and
`CareCampOrganizationSignal` objects. Profiles include deterministic ids,
public labels and meaning lines, current/local/inherited/lived status, evidence
refs, source-system counts, payload estimate, caps, integrity flags, Chronicle
integration decision, and explicit non-coupling flags. Factor families:
repeated return, water/refuge, shelter exposure, fire/hearth/fuel,
care/camp organization, temporary storage/cache, food-processing place,
route/crossing usefulness, camp ecology/wear, and safety/risk. Temporary
storage is deliberately weak/local/fragile with spoilage, loss, forgetting,
and local-only risk; it has `noInventory`, `noSurplusEconomy`,
`noPropertyClaim`, `noPopulationBonus`, `noSkillUnlocked`, and
`noAutomaticImprovement`. Fire is camp context only, not a global tech unlock.
Care signals are aggregate labor/camp-burden readouts only, not kinship or
named-person systems. Daughter handling separates inherited memory from local
testing; sampled daughters had lived local foothold evidence and inherited
foothold refs 0 in this run, but inherited paths are labelled when present.

UI added: `src/ui/band/CampFootholds.tsx`, BandPanel tab wiring, and styles.
The public **Camp & Footholds** tab shows strongest foothold places, 3-6 compact
camp factors, weak temporary holding signals, fire/fuel context, care burden,
evidence chips, status chips, and warnings that repeated camp use can create
familiarity or wear without making a reliable method. Public UI avoids raw ids,
JSON/debug arrays, tech-tree/research/unlock language, bonuses, invented-skill
claims, settlement claims, and permanent-storage language. Technical UI now has
**Camp foothold / ecology / care substrate** with profile/factor/signal counts,
family/status/source/ref counts, caps, payload, integrity flags, deferred-system
guards, Chronicle decision, and decision-path isolation. Architecture graph now
has `campFoothold` between Events, Knowledge Ecology, Material Affordance,
Problem Practice, Band Identity, activity records, place memory, movement,
demography/labor, seasonal ecology, and future Practice Learning, Skills/
Adaptations, Camp Ecology/Settlement, Culture, Chronicle/history hooks.

New audit:
`npm run sim:benchmark -- --targeted-foothold-camp-ecology-care-storage-fire-audit --json`
passes **22/22**. Metrics: 8 live bands sampled plus 4 projection fixtures,
12 profiles, 36 foothold places, 72 camp factors, 12 temporary storage signals,
12 fire/hearth/fuel signals, 12 care signals. Factors by family: repeated_return
11, temporary_storage_cache 11, route_crossing_use 8, water_refuge 12,
camp_ecology_wear 5, safety_risk 11, care_camp_organization 8,
shelter_exposure 5, fire_hearth_fuel 1. Status counts: active 62,
remembered 18, weak 10, fragile 2, local_only 23, strained 29. Source counts:
proto_camp_memory 47, place_memory 47, current_tile 53, material_affordance 53,
activity_party 9, problem_practice 21, knowledge_ecology 31, seasonal_support
28, body_camp_logistics 63, use_pressure 5, canonical_event 11, demography 20.
Refs: place 387, activity 9, material-affordance 53, problem-practice 21,
knowledge 31, event 11, body-camp 63, proto-camp 47. Inherited/lived refs
0/364 in this sample; daughter profiles 3. Broken links 0, raw debug hits 0,
legacy-skill hits 0, fake settlement/agriculture/inventory/skill/culture hits
0, tech-tree hits 0, decision-path refs 0, projection mutated bands false.
Max payload 36,814 bytes (35.95 KB), max places/profile 4, max factors/profile
6, max evidence/item 3, max storage basis 4.

Verification: `npx tsc -p tsconfig.json --noEmit` pass; `npm run build` pass
(existing Vite chunk-size warning only); `node --check scripts/simBenchmark.mjs`
pass; `npm run sim:benchmark -- --deterministic` prints `deterministic=true`;
`node scripts/checkGraph.mjs` pass **190/581**, 0 duplicate ids, 0 dangling
links. Regression audits pass: Material Affordance **26/26**, Knowledge Ecology
**23/23**, Band Identity **20/20**, Event System **19/19**, Deep-Time History
**13/13**, Deep-Time Chronicle UI **15/15**, Problem Practice **30/30**, UI
Readability 1C pass, Whole-UI Readability pass, Chronicle Foundation pass,
Chronicle Wiki Expansion pass, Specific Memory Referents pass.
`npm run sim:benchmark -- --all --fast --json` wrote
`/tmp/foothold-all-fast.json` and normalized comparison against
`/tmp/problem-framing-baseline-all-fast.json`: 25 scenarios in both, identical
after ignoring `totalRuntimeMs`, `averageMsPerTick`, `maxMsPerTick`,
`phaseSummary`, and `slowestSubpasses`. Static guards: executable
`Math.random(` in `src/sim` 0, explicit/unsafe `any` in `src/sim` 0,
UI/render/store/React/Zustand/lucide imports in `src/sim` 0, camp/problem
projection refs in decision paths 0, accepted Material/Knowledge/Identity/Event
projection refs in decision paths 0. The earlier prose-comment static-guard
caveat has been cleared; raw `Math.random` refs in `src/sim` are now 0.
Chronicle integration was inspected and intentionally limited to existing
evidence refs/Technical reporting: no new Chronicle prose was added because
foothold signals are weak context, not historical achievements. If accepted,
next pass: **PRACTICE FEEDBACK / ROUTINE LEARNING-READINESS-1**.

**PROBLEM FRAMING + PRACTICE EXPERIMENTATION-1 complete
2026-07-05 - PASS recommended.** This pass added the first bounded
selected-band projection for how a band can frame lived pressure as a practical
problem and how grounded affordances can become possible trials. It does not add
skills, adaptations, practices, culture, taboo, myth, worldview, language,
agriculture, domestication, settlement, territory, war, social-network logic,
inventory, tech tree, bonuses, or decision influence. The model is projection-only
and observe-only for UI/audit: no `Band` state is written and no movement,
economy, stress, demography, fission, support, or decision path imports it.

New module `src/sim/agents/problemPractice.ts` derives a bounded
`ProblemPracticeProfile` with structured `ProblemFrame` records and
`PracticeExperimentCandidate` records. Problem frames carry stable deterministic
ids, family, public label, meaning line, objective basis, perceived cause,
confidence, uncertainty, possible misread, evidence refs, source systems,
lived-vs-inherited basis, linked affordance/knowledge/event/activity/repetition
ids, possible experiment hooks, and `noDecisionInfluence`. Candidate records
carry stable ids, family/domain, public label, problem-frame link, affordance
links, knowledge/material/activity/repetition basis, expected feedback type,
likely cost/risk, labor burden, confidence, uncertainty, dead-end,
false-confidence, low-feedback and local-only risk, status, evidence,
`noSkillUnlocked`, `noAutomaticImprovement`, and future hook
`practice_learning_candidate`.

Problem families implemented: food return/subsistence pressure, carrying and
logistical burden, crossing/blocked path, route/new-country uncertainty,
camp setup/care burden, water/refuge pressure, and grounded social/contact
uncertainty when evidence exists. Candidate families implemented: carrying /
container / cordage, food processing trial, crossing/route trial, camp/shelter/
care trial, fire/hearth/fuel trial, water-edge capture trial, and tool/digging/
cutting trial. Repetition/familiarity is used only as evidence for familiarity,
feedback, risk, dead ends, false confidence, local-only routines, or clearer
problem recognition; it never improves a method or unlocks a skill. Legacy
starting skills (`Basketry`, `Wild Grain`, `Plant Tending`, duplicate
Foraging/Basic Foraging) are ignored as proof.

Inputs are accepted substrates only: canonical Events, Knowledge Ecology,
Material Affordances, activity-party trips and summaries, place/route/crossing
memory, residential moves, body/camp logistics, seasonal support, demography and
labor pressure, reported/contact memory, Band Identity salience, fission/
inheritance profile, and repetition affordances. Material Affordance says what
is possible, Problem Framing says why it matters, and the candidate says what
might be tried. Knowledge supports both framing and candidate basis; Events
support frames but are not redesigned. Identity contextualizes salience only.
Chronicle integration was inspected and intentionally skipped for new prose:
the evidence stays in Problems & Trials and Technical to avoid speculative
Chronicle narration before a trial becomes a historical event.

UI added: `src/ui/band/ProblemsAndTrials.tsx` plus BandPanel tab wiring and
styles. The public **Problems & Trials** tab shows "What they think the hard
part is", "What they could try", an explicit "Repetition is not mastery" note,
and inherited-but-untested wording for daughters where applicable. Public UI
uses readable cards and chips and avoids raw ids, JSON, debug arrays, tech-tree
or research language, bonuses, invented/practice-gained claims, and skill/
adaptation framing. `src/ui/band/Technical.tsx` now includes "Problem framing /
practice experiment substrate" with counts, caps, provenance refs, risk/status/
feedback counts, payload estimate, integrity flags, Chronicle decision, and
decision-path isolation. Architecture graph now has `problemPractice` between
Events, Knowledge Ecology, Material Affordance, Band Identity, activity/memory/
demography/fission inputs and future Practice Learning, Skills/Adaptations,
Camp Ecology, Culture/Taboo, and Chronicle/history hooks.

New audit:
`npm run sim:benchmark -- --targeted-problem-framing-practice-experimentation-audit --json`
passes **30/30**. Metrics: 8 live bands sampled plus 1 projection-only fixture,
9 profiles, 54 frames, 63 candidates. Frames by family: food 9, carrying 9,
crossing 9, route 9, camp 9, water 9. Candidates by family: camp/shelter/care
9, fire/hearth/fuel 9, food processing 9, tool/digging/cutting 9,
carrying/container/cordage 9, water-edge capture 9, crossing/route 9. Perceived
cause count 54; uncertainty/misread count 54. Feedback counts: low feedback 15,
contradicted by recent events 38, mixed feedback 8, local-only success 2.
Status counts: plausible untried 15, dead-end risk 37, blocked by missing
material 8, false-confidence risk 1, local-only 2. Dead-end/false-confidence/
low-feedback/local-only risk counts: 38/3/15/2. Affordance refs 72, knowledge
refs 108, event refs 53, activity refs 101, repetition refs 16. Inherited/lived
basis refs 2/349; daughter profiles 4. Broken links 0; raw debug hits 0; legacy
skill hits 0; fake-skill hits 0; tech-tree hits 0; fake-culture hits 0;
decision-path refs 0; projection mutated bands false. Max payload 43,521 bytes
(42.5 KB), max frames/profile 6, max candidates/profile 7, max evidence/item 3.

Verification: `npx tsc -p tsconfig.json --noEmit` pass; `npm run build` pass
(existing Vite chunk-size warning only); `node --check scripts/simBenchmark.mjs`
pass; `npm run sim:benchmark -- --deterministic` prints `deterministic=true`;
`node scripts/checkGraph.mjs` pass **189/562**, 0 duplicate ids, 0 dangling
links. Regression audits pass: Material Affordance **26/26**, Knowledge Ecology
**23/23**, Band Identity **20/20**, Event System **19/19**, Deep-Time History
**13/13**, Deep-Time Chronicle UI **15/15**, UI Readability 1C pass,
Whole-UI Readability pass, Chronicle Foundation pass, Chronicle Wiki Expansion
pass, Specific Memory Referents pass. `npm run sim:benchmark -- --all --fast
--json` compared against `/tmp/problem-framing-baseline-all-fast.json`: 25
scenarios in both, normalized output identical after ignoring `totalRuntimeMs`,
`averageMsPerTick`, `maxMsPerTick`, `phaseSummary`, and `slowestSubpasses`.
Static guards: `Math.random(` in `src/sim` 0, explicit/unsafe `any` in
`src/sim` 0, UI/render/store/React/Zustand/lucide imports in `src/sim` 0,
problem/practice refs in decision paths 0, Material/Knowledge/Identity/Event
refs in decision paths 0. Caveats: social/contact framing exists but is lower
priority than the six core problem families under the normal frame cap; audit
uses one projection-only fixture to prove rare source paths without mutating the
sim; no Chronicle prose was added. If accepted, next pass: **FOOTHOLD / CAMP
ECOLOGY / CARE / STORAGE / FIRE-1**.

**MATERIAL AFFORDANCE + FORAGER ENGINEERING CATALOG-1 complete
2026-07-05 - PASS recommended.** This pass added a pure selected-band
projection for what the band's known/local world makes materially possible
later, without adding problem framing, practice discovery, skill/adaptation,
culture, settlement, agriculture, territory, war, or any decision influence. New
module `src/sim/agents/materialAffordance.ts` derives bounded
`MaterialAffordanceProfile` items with stable ids, family/domain, public label,
meaning line, status/strength/confidence, material basis, knowledge basis,
activity/event basis, constraints, future hooks, evidence refs, lived vs
inherited basis, source-system counts, caps, payload estimate, and integrity
flags. It is projection-only, not stored on `Band`, never imported by movement,
support, demography, stress, fission, economy, or decision paths, and explicitly
ignores legacy starting skills as proof. The pass also completed the requested
repetition/familiarity base hook in `foragingAdaptation`: repeated exposure or
attempts now preserve familiarity/feedback/dead-end risk signals, but never
grant improvement, methods, practice success, or skills.

Implemented affordance families: carrying/containers/cordage,
shelter/camp-structure, fire/hearth/fuel, food processing, water-edge
trapping/capture, route/crossing engineering, tool/cutting/scraping/digging,
visual/mineral/adhesive, and camp organization/care. Inputs are bounded known
tiles, resource memories, Knowledge Ecology, canonical Events, activity-party
records/summaries, place/route/crossing memory, residential moves,
demography/labor/dependent pressure, seasonal/body-camp logistics, and the new
repetition hook. Constraints are first-class: weak material basis, little direct
fiber/reed memory, thin stone/tool context, high carrying burden, weak water-edge
material, and unsupported mineral/adhesive data keep claims weak or absent. The
visual/mineral/adhesive family intentionally stays faint unless grounded. Future
hooks are phrased as questions only; no baskets, traps, shelters, boats, fire
drills, bridges, grinding tools, storage, or other practices are learned.

UI added: new selected-band **Affordances** tab in `src/ui/band/Affordances.tsx`
with the explicit warning "possible future practices, not acquired methods",
compact strongest-family overview, affordance cards, status/strength chips,
material/knowledge/activity/future-hook chips, constraints, and no raw ids or
debug arrays. `src/ui/band/Technical.tsx` now has "Material affordance
substrate" with item/family/status/strength counts, basis/source counts,
lived/inherited counts, hook counts, caps, integrity flags, source samples, and
payload estimate. Chronicle integration was inspected and intentionally skipped
for new prose; the evidence stays in Affordances and Technical. Architecture
graph now includes `materialAffordance` between terrain/hydrography,
resource/knowledge/events/activities/memory/identity/demography and future
Problem Framing, Practice Experimentation, Skills/Adaptations, Culture, and
Chronicle hooks.

New audit:
`npm run sim:benchmark -- --targeted-material-affordance-forager-engineering-audit --json`
passes **26/26**. Metrics: 8 live bands sampled + 1 projection-only
activity-evidence fixture, 9 profiles, 81 items, all 9 families represented
with 9 items each; statuses plausible 63, weak 7, strong 8, absent 3; strengths
plausible 63, weak 7, strong 8, none 3; material refs 112, knowledge refs 81,
activity refs 8, event refs 26, memory refs 111, repetition refs 17;
lived/inherited refs 351/6; daughter profiles 3; constraints 45; future hooks
315; broken links 0; raw/debug hits 0; fake-skill hits 0; tech-tree language
hits 0; legacy-skill hits 0; max profile payload 28,732 bytes (28.06 KB), max
items/profile 9, max evidence/item 5, max hooks/item 4, max constraints/item 2,
decision-path refs 0, projection mutated bands false.

Verification: `npx tsc -p tsconfig.json --noEmit` pass; `npm run build` pass
(existing Vite chunk-size warning only); `node --check scripts/simBenchmark.mjs`
pass; `npm run sim:benchmark -- --deterministic` prints `deterministic=true`;
`node scripts/checkGraph.mjs` pass **188/547**, 0 duplicate ids, 0 dangling
links. Regression audits pass: Knowledge Ecology **23/23**, Band Identity
**20/20**, Event System **19/19**, Deep-Time History **13/13**, Deep-Time
Chronicle UI **15/15**, UI Readability 1C pass, Whole-UI Readability pass,
Chronicle Foundation pass, Chronicle Wiki Expansion pass, Specific Memory
Referents pass. `npm run sim:benchmark -- --all --fast --json` wrote
`artifacts/material-affordance-all-fast.json` and normalized comparison against
`artifacts/event-system-ui-all-fast.json` is identical after ignoring
`totalRuntimeMs`, `averageMsPerTick`, `maxMsPerTick`, `phaseSummary`, and
`slowestSubpasses`. Static guards: `Math.random(` in `src/sim` 0,
explicit/unsafe `any` in `src/sim` 0, UI/render/store imports in `src/sim` 0,
material-affordance refs in decision paths 0, Knowledge/Identity/Event refs in
decision paths 0. Caveat: live sampled bands had no current activity-party
records at the final snapshot, so the audit includes one projection-only
activity fixture to prove the activity evidence path without mutating live sim
state or behavior. If accepted, next pass: **PROBLEM FRAMING + PRACTICE
EXPERIMENTATION-1**.

**LEARNING / TRANSMISSION / KNOWLEDGE ECOLOGY / ACTIVITY-PARTIES-1 complete
2026-07-04 - PASS recommended.** This pass added the first observe-only
Knowledge Ecology layer without changing sim decisions. The new pure selected-band
projection in `src/sim/agents/knowledgeEcology.ts` derives bounded knowledge
items from accepted substrates only: canonical Events, deep history/founding,
existing activity-party trip and outcome summaries, place/route/crossing memory,
reported knowledge/contact hooks, residential moves, demography, and fission
inheritance. It explicitly ignores legacy starting skills as public knowledge
proof. Domains implemented: route/corridor, crossing, place/country, food work,
water/refuge, risk/caution, social/contact, and inherited memory. Carrier and
transmission labels distinguish working adults, whole band, returning activity
parties, camp-heard knowledge, daughter inherited memory, older memory, narrow
carriers, personally practiced, heard, inherited story, durable memory, and
fading/uncertain knowledge. The implementation is projection-only, selected-band
focused, capped at 12 items/profile, 3/domain, 3 evidence refs/item, and never
read by movement, demography, ecology, stress, fission, identity, or decision
paths.

UI added: a compact selected-band `Knowledge` tab (`src/ui/band/Knowledge.tsx`)
showing what the band knows best, how it was learned, who carries it, and whether
it is practical, heard, inherited, durable, or fading. Normal UI hides raw ids and
only renders bounded evidence chips plus event/Chronicle links when targets are
resolved. Technical now has a "Knowledge ecology substrate" proof group with
counts by domain/carrier/provenance, lived vs inherited, practical vs heard/story,
fading/uncertain, caps, payload estimate, unresolved refs, and integrity flags.
Chronicle prose was intentionally not expanded; Knowledge links to Chronicle only
when an existing page target is available. Events and Identity are connected as
evidence surfaces, but Knowledge does not become Events and does not feed Identity
or decisions. Architecture graph now includes `knowledgeEcology` as the bridge
between Events/Activities/deepHistory/memory/demography/fission and later
practice discovery, problem framing, adaptation, culture/taboo, and Chronicle.

New audit:
`npm run sim:benchmark -- --targeted-knowledge-ecology-activity-parties-audit --json`
passes **23/23**. Metrics: 8 live bands + 1 fixture profile, 9 profiles, 60
knowledge items, domains route/corridor 9, place/country 9, food-work 9,
water/refuge 9, risk/caution 9, social/contact 9, inherited-memory 4, crossing 2;
carriers working-adults 9, whole-band 17, camp-heard 26, daughter-inherited 4,
returning-activity-party 4; lived 56, inherited 4, practical 26, story/heard 31,
fading/uncertain 3, daughter inherited 4; evidence refs activity 4, event 74,
deep-history 4, memory 46; 137 evidence chips; event links checked 74, broken 0;
rendered Chronicle links checked 25, broken 0, with 43 potential unresolved
Chronicle targets intentionally not rendered; raw/debug hits 0, fake-culture hits
0, early-system hits 0, legacy-skill hits 0; max profile payload 18,823 bytes,
max item payload 3,803 bytes, max items/profile 8, max evidence/item 3.

Verification: `npx tsc -p tsconfig.json --noEmit` pass; `npm run build` pass
(existing Vite chunk-size warning only); `node --check scripts/simBenchmark.mjs`
pass; deterministic benchmark prints `deterministic=true`; architecture graph
check pass **187/529**, 0 duplicate ids, 0 dangling links. Regression audits pass:
band identity UI **20/20**, event system UI **19/19**, deep-time history **13/13**,
deep-time Chronicle UI **15/15**, UI readability 1C pass, whole-UI readability
pass, Chronicle foundation pass, Chronicle wiki expansion pass, specific memory
referents pass. `npm run sim:benchmark -- --all --fast --json` compared against
`artifacts/event-system-ui-all-fast.json`: 25/25 normalized sections identical
after ignoring runtime-only profiler fields (`totalRuntimeMs`, `averageMsPerTick`,
`maxMsPerTick`, `phaseSummary`, `slowestSubpasses`). Static guards clean:
`Math.random(` in `src/sim` 0, explicit/unsafe `any` in `src/sim` 0,
UI/render/store imports in `src/sim` 0, Knowledge Ecology refs in decision paths
0, Identity refs in decision paths 0, Event refs in decision paths 0. This
handoff file is git-ignored in the checkout but updated on disk. Future notes:
later Knowledge Ecology / Inter-band Diffusion should add contact copying,
secrecy, exchange, mishearing, failed imitation, and distortion; later Practice
Discovery should use this substrate without becoming a tech tree; later
Culture/Taboo should grow from events, knowledge, repeated rules, and transmission,
not random labels; language/naming remains very-later. If accepted, next pass:
**MATERIAL AFFORDANCE + FORAGER ENGINEERING CATALOG-1**.

**BAND-IDENTITY-TECH+UI-1 closure review complete 2026-07-04 - clean PASS.**
This was a review/verification pass only; no identity redesign, new dimensions,
Chronicle wording, decision influence, culture/religion/myth/worldview/deception,
skills/practices, agriculture, settlements, war, or territory systems were added.
The implemented identity layer is a pure selected-band projection from
`src/sim/agents/bandIdentity.ts`: six bounded dimensions (food tendency, familiar
country, movement style, remembered risks, household/demographic posture, and
inheritance), evidence refs with source/provenance/confidence, lived-vs-inherited
status, weak/uncertain signals, caps, and Technical proof. Evidence comes from
canonical Events, deep history/founding, place/route/crossing memory, existing
activity records, residential moves, seasonal support, relationship memory, and
demography; legacy starting skill labels are ignored. Chronicle integration remains
intentional and compact: Identity links out to supporting Event/Chronicle evidence,
but Chronicle prose was not changed to avoid clutter. Closure verification: `npm
run build` pass (existing Vite chunk-size warning only); `node --check
scripts/simBenchmark.mjs` pass; deterministic benchmark `deterministic=true`;
identity audit **20/20 pass** (10 profiles, 60 cards, 209 chips, 14 inherited vs
195 lived evidence, max payload 19,868 bytes, max 6 cards/profile, max 4
evidence/card, raw/debug/fake-language/trait-game/legacy-skill hits 0); event
audit **19/19 pass** (301 events, 149 grouped, 25 inherited, 157 durable, 119
recent, max event list 36, max event-state payload 64,623 bytes, broken links 0);
deep-time history **13/13 pass**; deep-time Chronicle UI **15/15 pass**; 1C,
whole-UI, Chronicle foundation/wiki, and specific-memory referent audits pass.
`--all --fast --json` compared against `artifacts/event-system-ui-all-fast.json`:
25/25 sections identical after ignoring runtime-only profiler fields
(`totalRuntimeMs`, `averageMsPerTick`, `maxMsPerTick`, `phaseSummary`,
`slowestSubpasses`). Static guards clean: `Math.random(` in `src/sim` 0,
explicit/unsafe `any` in `src/sim` 0, UI/render/store imports in `src/sim` 0,
identity refs in decision paths 0, event refs in decision paths 0, architecture
graph **186/514**, 0 duplicate ids, 0 dangling links. Note: this handoff file is
git-ignored in this checkout, but exists on disk for local continuity. If this
closure is accepted, the next pass should be **LEARNING / TRANSMISSION /
KNOWLEDGE ECOLOGY / ACTIVITY-PARTIES-1**, not another identity redo.

**Events + Identity readability follow-up complete 2026-07-04 - player-facing
copy now reads less like audit/debug output.** This was a UI-facing wording and
presentation correction only: no movement, demography, ecology, stress, food,
fission, event generation, identity scoring, or decision behavior was changed.
Events now presents a compact historian-style timeline, hides lower-signal recent
changes behind "Smaller recent changes", summarizes event families as meaning
rather than count dumps, and keeps proof language in expanded details/Technical.
Identity now leads with "Historian's reading", uses grounded portrait language
("A band of remembered routes", "Their country has opened outward", "Blocked
paths have taught caution"), softens large evidence counts to "many/several",
and still separates parent memory from personally lived history. No culture,
religion, myths, named heroes, worldview claims, practices, skills, agriculture,
domestication, territory, war, settlement, or deception behavior were added.
Files changed: `src/ui/band/Events.tsx`, `src/ui/band/Identity.tsx`,
`src/sim/agents/eventSystem.ts`, `src/sim/agents/bandIdentity.ts`,
`scripts/simBenchmark.mjs`, and this handoff. Verification: `npx tsc -p
tsconfig.json --noEmit` pass; `npm run build` pass (existing Vite chunk-size
warning only); `node --check scripts/simBenchmark.mjs` pass;
`npm run sim:benchmark -- --targeted-event-system-ui-audit --json` pass 19/19
(301 events, 149 grouped, 25 inherited, 157 durable, 119 recent, max event list
36, max event-state payload 64,623 bytes, raw/debug/fake-language hits 0);
`npm run sim:benchmark -- --targeted-band-identity-ui-audit --json` pass 20/20
(10 profiles, 60 cards, 209 evidence chips, 14 inherited vs 195 lived evidence,
max identity payload 19,868 bytes, max cards 6, max evidence/card 4,
raw/debug/fake-language/trait-game hits 0). Both audits reported projection did
not mutate bands and decision-path refs stayed 0.

**DEEP-TIME-CHRONICLE-UI-1 complete 2026-07-04 - Chronicle now uses the accepted
deep-history substrate in a compact, readable public layer.** This pass did not change
movement, demography, ecology, food, stress, fission, or the deep-history observer. It
adds a selected-band Chronicle "Long memory" section backed by `Band.deepHistory`:
founding/current comparison, durable era rows, durable episode rows, inherited-history
rows labelled "Inherited, not personally lived", recent-vs-durable memory framing, and
short evidence chips while raw proof remains in Technical. `sanitizeWikiLinks` now
preserves `article.deepHistory`, the infobox keeps the accepted facts plus a bounded
Founded fact, and duplicate long-memory episode summaries are collapsed only in the UI
selection layer. Unknown founding fields stay quiet; no fake founding stress, culture,
religion, myths, named people, Events UI, Band Identity, practices, skills, agriculture,
domestication, territory, war, or lore were added. Files changed:
`src/sim/agents/bandChronicle.ts`, `src/ui/band/History.tsx`, `src/index.css`,
`scripts/simBenchmark.mjs`, and this handoff file; verification artifacts were written
under `artifacts/deep-time-chronicle-ui-*`.

New audit: `npm run sim:benchmark -- --targeted-deep-time-chronicle-ui-audit` **passes
15/15**. It sampled 8 active deep-history bands plus deterministic projection fixtures:
7 old bands, 10 deep-history panels, 10 founding comparisons, 30 era rows, 49 episode
rows, 4 daughter records, 14 inherited rows, 0 raw-debug hits, 0 code-token hits, 0
duplicate era/episode prose, max displayed long-memory rows 11, max Chronicle payload
82,435 bytes. Build/typecheck: `npm run build` green. Determinism:
`npm run sim:benchmark -- --deterministic` prints `deterministic=true`. Regression
audits pass: 1C readability (0 artifact hits, 0 code-token hits, 0 duplicate prose,
aged max payload 70,462 bytes), whole UI readability (0 code-token hits, 0 duplicate
phrases, max Chronicle payload 78,194 bytes), Chronicle foundation (6 chronicles, 60
major events, max payload 79,475 bytes), Chronicle wiki (717 inline links, 0 broken,
309 pages, 0 duplicate prose, max payload 79,475 bytes), specific-memory referents
(275 referents, 0 vague-label hits, 0 raw-enum leaks), and deep-time history substrate
13/13 (max history payload 19,666 bytes, 0 cap violations).
`npm run sim:benchmark -- --all --fast --json` produced 25 sections and is identical to
`artifacts/deep-time-pre-change-baseline-all-fast.json` after removing runtime-only
profiler fields (`totalRuntimeMs`, `averageMsPerTick`, `maxMsPerTick`, `phaseSummary`,
`slowestSubpasses`). Static guards: `Math.random(` in `src/sim` 0, unsafe-any guard in
`src/sim` 0, UI/render/Zustand/React/lucide imports in `src/sim` 0, deepHistory refs
outside allowed files 0, decision-path deepHistory refs 0. Handoff caveat: accepted
late-June Chronicle/1C checkpoint-log entries still appear incomplete in this file; if
this is the canonical handoff, backfill them from source reports rather than memory.
Deferred user notes for later work, not implemented here: memory decay vector for stale
patches, household baggage abstraction for dependent crossing risk, route/crossing
rejection cooldown throttling, and player-visible deception only when talks have
evidence-grounded falsehood/deception state. **Next recommended step:
EVENT-SYSTEM-TECH+UI-1**, not Band Identity yet.

**SIM-TOOLS-1 done 2026-06-28 - ecology inspection layer (simple + debug views,
anti-omniscient) + existing pre-run band editor verified; map-paint editor /
custom-map-maker scoped to SIM-TOOLS-2.** Tooling-only pass — **zero sim-behaviour
change** (deterministic smoke + `--all --fast` unchanged; the new ecology summary is
display-only and never feeds a decision). New pure `src/sim/agents/ecologySummary.ts`
(`summarizeWorldEcology`) produces a tiny world-TRUTH ecology aggregate (fauna /
aquatic / plant category counts: rich/decent/poor/depleted/recovering + pressure
low/medium/high) that rides the dynamic snapshot (`SimDynamicSnapshot.ecologySummary`,
computed worker-side from the true world; threaded to the Zustand store via
`simBridge.publishWorld`). New pure UI helper `src/ui/ecologyView.ts` (TYPE-ONLY sim
imports, the bandSummary pattern) provides TWO strictly-separated modes:
`deriveSelectedBandEcology(band)` — derived ONLY from the band's own remembered patch
knowledge, so an undiscovered stock/patch reads "unknown" (anti-omniscient by
construction) — and `formatWorldEcology(summary)` — the explicitly-labelled
world-truth DEBUG dashboard. Surfaced as a player-facing "Ecology they know" card in
BandPanel Overview (Wildlife / Fish-water / Plants, rich/decent/poor/overused/
recovering/unknown + plain-language note) and a "World ecology — DEBUG truth"
collapsible group in BandPanel Technical. New `--targeted-ecology-view-audit` proves
(60y Map2): world-truth summary matches stock/patch state (fauna 260 = 215+45, plant
records exact), and across all bands the selected-band view has **0 known-place
mismatches, 0 unknown-leak violations, 0 mutations, 0 nondeterminism** — a band can
never see ecology it has not discovered. The pre-run BAND editor (drag-place with
live `validateInitialBandPlacement`, green/red preview, `isSetupPlacementAvailable`
lock after tick 0, serialize into `SimWorldKind.initialBandPlacements`) already
existed and is re-verified by `--targeted-initial-placement-audit` (pass:
defaultStart/movedStart/validity/resetProof/determinism/setupOnly/multiBand). The
`procedural` seed-based custom-map kind already runs. **Deferred to SIM-TOOLS-2
(honest scope):** the terrain-PAINT map editor and paint-based custom-map-maker
(both need a tile-override diff in the run config + regeneration of derived
hydrology/passability/resource/plant+fauna geography after edits — a substantial,
separately-validated canvas effort), band add/remove UI (move/place done), and the
optional ecology MAP overlay (the panels/cards + tile-level data cover inspection
without a map-painting overlay). Build green; static guards clean (`Math\.random` 0,
`: any|as any` in src/sim 0, src/sim UI/render/zustand imports 0); determinism
preserved; `--all --fast` unchanged.

**ECO-BIOME-1 done 2026-06-28 - plant physical patch ecology (the plant mirror of
FAUNA/AQUATIC-1) + plant support coupling + processing-labor & fallback-reliance
consequences.** New pure `src/sim/agents/plantStock.ts` activates the already-rich
`plantPatches.ts` profiles (fruit/nuts/tubers/grain/greens/wetland + materials) as
a finite physical layer: a SPARSE `world.plantPatchState` human-depletion overlay
(NOT massive per-tile objects — only gathered/occupied patches deviate), advanced
once per season (mirrors `tileDepletion`/`faunaStocks`) from gathering trips +
catchment occupation, recovering at class-specific regrowth rates (fast_wetland
fast, multi_year_mast / slow_woody / belowground_reserve slow). A bounded plant
support multiplier in `carryingCapacity` (capped at 10% of a tile's food support,
coupled to `generic_plant_food` ONLY so it never double-counts fauna's aquatic/
animal multipliers, and materials/fuel/reeds stay 0 calories) makes overharvesting
a berry slope / tuber ground cost support until it rests; gathering RETURNS scale
by patch abundance/season (seasonal ripening/mast pulse >1, depleted <1);
processing-heavy classes add a small capped per-capita labor drag; sustained
emergency-fallback reliance adds a gentle capped demographic stress (the
previously-measured-but-unread `fallbackFoodReliance`). Anti-omniscience preserved:
plant depletion is read only at present/scouted tiles; geography is never handed to
a band; uncovered tiles get factor 1; plant scouting stays on the existing
`derivePlantScoutObservationHint` gate. New audits: `--targeted-plant-stock-audit`
fixture (9/9 checks pass) and `plantPhysicalEcologyAudit` in the resource-foundation
suite. Map2 300y (vs FAUNA/AQUATIC-1): verdict pass, 36 active bands, pop 1315→1226
(−6.8%, the intended finite-plant tightening which also caps crowded-core band size,
max 63→55, 0 over 80), raw support mean 1.20→1.18, raw-deficit 18→19, chronic 17→12;
585 sparse plant dynamic records (212 overharvested), plant support loss mean 3.74,
material food contribution 0, hidden plant-knowledge violations 0. 500y figures in
the checkpoint-log entry below. Static guards clean; determinism preserved; build
green. NOTE: this pass focused on the plant physical-ecology CORE + support/labor/
fallback coupling + fauna calibration (kept FAUNA/AQUATIC-1 settings, which stay
safe); the fauna disturbance→talk, seasonal-run-talk, sign→scout, and dedicated
plant-rotation-talk LOOP-SURFACING items (ECO-BIOME-1 Parts 3-6, 9-10, 13) ride the
existing FAUNA/AQUATIC-1 + plant-patch-memory scaffolding and remain the recommended
follow-on (ECO-BIOME-2).

**FAUNA/AQUATIC-1 done 2026-06-27 - finite fauna/aquatic stock substrate backing
`animal_food` / `aquatic_food`.** `src/sim/agents/faunaStock.ts` replaces the
animal/hunting placeholder and the fish-like abstraction with bounded, summarized
fauna/aquatic STOCK ZONES (no individual-animal agents, no predator-prey web).
Static geography (kind/habitat/anchor/influence/carrying-capacity/seasonality/
mobility) is a pure, memoized function of the tiles record; dynamic abundance +
disturbance live in a SPARSE `world.faunaStocks`, advanced once per season from
catchment occupation plus in-season hunting/fishing trip depletion, recovering
when rested (mirrors the M0.14 `tileDepletion` pattern). Stocks physically scale
realized `animal_food`/`aquatic_food` support via a bounded fauna multiplier in
`carryingCapacity` (capped at 18% of a tile's food support, so overuse is causal
but never craters population); hunting/fishing trip RETURNS scale by stock
abundance/season; successful trips deplete the targeted stock. Knowledge stays
anti-omniscient: stock geography is never handed to a band; bands learn via their
own patch memory / scout signs / reports, and an uncovered tile yields a fauna
sign of exactly 0. Map2 300y before/after (vs ECO-CAL-VIS): verdict pass→pass,
36 active bands, total pop 1316→1315, max band 63→63, 0 bands >80, raw support
mean 1.22→1.20, raw-deficit 19→18; new finite ecology = 260 bounded stock zones
(45 aquatic / 215 terrestrial, ≤13 influence tiles each), 45 dynamic records, 29
overused (<0.7) / 11 heavily-overused (<0.45) / 28 disturbed crowded cores, min
abundance 0.34, fauna-support-loss mean 0.61 (p90 3.72), hidden-stock-knowledge
violations 0. New audits: `--targeted-fauna-stock-audit` (unit dynamics fixture,
11/11 checks pass) and `faunaAquaticStockAudit` inside the resource-foundation
suite. Static guards clean; determinism preserved; full build green. 500y suite
metrics in the checkpoint-log entry below.

**ECO-CAL-VIS done 2026-06-27 - ecology calibration, visible landscape cues,
reachable social talk, grounded replies/source bias, and known-band fission
spacing.** Final-code Map2 ECO-CAL/VIS audits are saved in
`artifacts/eco-cal-vis-100-final2.json`, `artifacts/eco-cal-vis-300-final2.json`,
and `artifacts/eco-cal-vis-500-final2.json`. Calibration keeps ECO-MIG's finite
shared ecology but softens the all-deficit failure: 500y now completes with 36
active bands, total pop 1994, max band 81, only 1 band over 80 and 0 over 150,
raw support mean/p50/p90 0.65/0.60/1.22, 31/36 raw-deficit bands, and 17/36
chronic-deficit bands (down from the ECO-MIG warning state of 36/36 raw deficit,
mean ~0.34). Support remains finite and causal: shared catchment mean/max
0.23/0.74, mean depletion loss 26.8, 858 bounded depletion records, 8 resource
classes, and patch memories capped at 48. Demography now applies a chronic
deficit brake to fertility/growth and mortality pressure using existing food
deficit, poor-return trend, and resource depletion fields; no disease, war,
sedentism, storage, agriculture, or territory was added.

ECO-CAL-VIS adds selected-band-safe broad **visible landscape cues** in
`landscapeVisibility.ts`: water/wetland/lake/delta/river corridor/greener
lowland/pass/higher/dry cues at 3-10 tiles, capped at 6 per band, staleable,
not observed tiles, not resource knowledge, not support, and never direct
relocation. Cues can create internal talk and weakly bias residence-unchanged
scout/probe actions only; 500y audit: 216 cues, 14 scout/probe influences,
0 observed tiles created, 0 resource unlocks, 0 direct relocations. Inter-band
reports now require a contact path (`nearby_camp`, `shared_water_place`,
`range_shared_use`, `direct_contact_memory`, kin visit paths): 500y audit has
169 inter-band reports, 0 missing contact paths, 0 far direct/no-relay reports,
and 0 false telepathy. Receivers can confirm/strengthen/mark uncertainty from
direct memory, scout/trip record, or familiar range; 500y: 475 replies,
0 replies without evidence. Rare source-biased/withheld talk is grounded by weak
trust plus source pressure and remains rare: 500y frequency 0.111, hidden-truth
violations 0. New fission spacing considers known bands only (known-band records
and contact memory), with trusted-kin tolerance and crowded-contact penalty;
500y spacing audit has 288 samples, closest known band p50 9 tiles, 46 close/
crowded target rejections, and hidden-unknown-band avoidance 0.

Validation for ECO-CAL-VIS: `npm run build` pass; ECO-CAL/resource/shared-
catchment/raw-deficit/mega-band/migration-pressure/visibility/reachability/
reply/withholding/new-band-spacing/anti-omniscience long-horizon audit pass at
500y; word-of-mouth, regional reported knowledge, talk UI/report UX,
deterministic smoke, Map1/Map2 smokes, RANGE-1/2/3/4, activity-path passability,
residential-move, focused 500y stuck audit, and `--all --fast` pass. Static
guards are clean: `rg "Math\.random" src`, `rg "(: any|as any)" src/sim`, and
`rg "from ['\"].*(react|zustand|/ui|/render|canvas|dom)" src/sim` return no
matches. Graph files were not touched, so graph integrity was not rerun.

**UI track — UI-STYLE-1 (Final-Look UI Redesign / Readable Game UI):** *Implemented 2026-06-19; UI/UX only,
**zero simulation behavior change** (`sim:benchmark` macro byte-identical before/after).* Redesigned the simulator
from a dark debug console into a clean old-map / cartographic interface: **vellum panels on a dark "desk"**, ink-brown
typography, muted earthy accents, and a crisp 16-grid **pixel icon set** (`src/ui/icons.tsx`). New **pure UI helpers**
(`src/ui/bandSummary.ts`, `src/ui/labels.ts` — type-only sim imports, never mutate sim) drive a band **status chip**
(Settled / Exploring / On the move / Under pressure / Struggling / Gone), a plain-language "doing now" line, **condition
bars**, and grouped **skill/knowledge chips** (the "they learned to fish" moment). `BandPanel.tsx` is now a thin shell
over `src/ui/band/{Overview,Activity,History,Technical,BandHeadline,Roster,parts,sections}`: **Overview/Activity/History
are player-facing** (activity group cards, life-event timeline), **Technical preserves ALL prior debug data verbatim**
in collapsed groups. Header **cartouche** + **transport bar** + map toolbar restyled; map selection ring uses the
parchment accent. Theme tokens in `src/ui/theme.css`. Verified: build green, helper-purity + no-sim-logic-in-player-tabs
greps clean, sim byte-identical (`docs/baselines/sim_baseline_ui_style_1.norm.txt`). Spec/plan:
`docs/superpowers/specs/2026-06-19-ui-style-1-readable-game-ui-design.md`,
`docs/superpowers/plans/2026-06-19-ui-style-1-readable-game-ui.md`.
**2K.12 implemented 2026-06-20 (default OFF); 2K.12B calibration done 2026-06-20 — reader stays default OFF.** The
ON/OFF calibration (50/100/300y + HEAT) found the reader safe (deterministic, anti-omniscient, no economy coupling,
near-tie-only flips) and useful (probe-over-wander), with map1 ~flat (−0.28% pop at 300y) BUT map2 showing a
**compounding caution-arm overfit** (−0.48% pop at 100y → **−5.73% at 300y**, same bands/fissions/extinctions) driven by
ECO-SEASON-1's monotonic failure/concern counters. **2K.12C done 2026-06-20 — caution arm made proportional (failure-rate, not monotonic counts); reader stays default OFF.**
The fix cut the map2 300y overfit from −5.73% to **−2.14%** and tightened the worst-case long-run drift across maps from
−5.7% to −2.8%, BUT did not cleanly hit <~1–2%: reducing caution un-suppressed the POSITIVE recall arms, so map1 rose from
−0.28% to **−2.81%** (more probe/recheck-over-relocate). The residual ~2–3% long-run effect is now POSITIVE-arm-driven (not
caution overfit), small/uniform/deterministic/structurally-neutral (same bands/fissions/extinctions) but just over the
ideal target. So default-ON is **still not recommended** by the <~1–2% rule. Next: **2K.12D** (optional tiny lever — reduce
the ±0.12 cap toward ±0.08 OR lightly damp the positive recall arms, re-calibrate targeting <~1–2%, THEN flip default ON);
OR accept ~2–3% as the believable bounded cost and flip ON in an isolated rebaselining step. After that the residential-move
scorer could be biased; the parallel research/design track is **RANGE-1** (familiar country / use-range substrate — see the
proto-territory design note below).
**2K.12D done 2026-06-20 — cap reduced ±0.12→±0.08; reader stays default OFF.** Apples-to-apples A/B on one harness
(±0.12 control reproduced 2K.12C exactly): the cap is NOT a clean magnitude knob over 300y — the ON/OFF delta is
path-dependent, not a smooth scaling. map1 300y improved only −2.81%→**−2.53%**, but map2 300y **regressed −2.14%→−3.45%**,
so worst-case drift got WORSE (−2.81%→−3.45%) and the <~1–2% target is still missed. All guards stayed green (deterministic
all maps; flips within 2·cap envelope, beyondEnvelope 0; HEAT inert at 0.00%; no economy/hidden-truth coupling) and the
behaviour is still meaningful (flip rate 17.9%/21.9%, meanGap ~0.03, probe-over-relocate persists). **Decision: default-ON
NOT justified — kept OFF.** The single global cap is the wrong lever; map1 drift is positive-arm-driven and map2 is
caution-arm-driven, so a uniform shrink helps one and hurts the other. **Recommended 2K.12E:** either revert the cap to
±0.12 (no worse, simpler) and do PER-ARM damping (damp positive recalls for map1, leave caution) re-calibrated to <~1–2%,
OR accept the ~2–3% bounded cost and flip ON in an isolated rebaseline. (Cap left at ±0.08 per the 2K.12D directive; OFF so
the live baseline is unchanged either way.)
**2K.12E done 2026-06-21 — cap reverted ±0.08→±0.12, per-arm scaling tested and REJECTED; reader stays default OFF.** Added
`POSITIVE_RECALL_SCALE` / `CAUTION_SCALE` constants (identity 1.0 ⇒ byte-identical to 2K.12C, 790 hints) and swept them via
the calibration harness (50/100/300, both maps). The per-arm lever is no cleaner than the global cap: map1's 300y delta is
NON-MONOTONIC in positive scale (1.0→−2.81%, 0.8→+1.41%, 0.7→−2.96%, 0.6→−0.28%) so any on-target value is a coincidental
trajectory crossing, not a stable regime; and map2 (caution-driven) got WORSE under every positive damp AND under caution
damping (`(1.0,0.8)`→−3.38%) — caution was net-supporting population. Of all six configs the un-damped **±0.12 control has
the smallest worst-case drift (−2.81%)**; every damp made it worse. All deterministic, within-envelope, structurally neutral
(36 bands / fissions / extinctions identical), no hidden-truth/economy coupling. **Decision: keep default OFF** — the residual
~2–3% long-run drift is structural/path-dependent w.r.t. bias MAGNITUDE, so neither cap nor per-arm scale can dial it out;
finer tuning would overfit noise. Both scales left at identity 1.0 (infra kept for future re-sweep). **Next is NOT a finer
reader knob (exhausted): leave the reader optional and revisit at RANGE-1 / familiar-country / home-range**, where the bias can
attach to a band's actual range instead of nudging isolated target choices.
**RANGE-1 done 2026-06-22 — Familiar Country / Use-Range substrate (read-only); NO sim behaviour change.** Pure on-demand
`src/sim/agents/familiarCountry.ts` derives each band's bounded familiar use-range (core/familiar/edge + camp/water/route/
activity core places) from its OWN known memory (`observedTiles` base + place/corridor/anchor/water/recent-use boosts,
recency-decayed); **range ⊆ observedTiles**, computed only for the UI selected band + the audit and **never in stepSim**
(no `src/sim` module imports it ⇒ byte-identical sim). It reclassifies movement so a band moving *inside* its country reads
"Living within known range" / "Shifting camp locally" / "Working known water" / "On its seasonal round" / "Testing the edge"
instead of generic "On the move"; only leaving/founding keep the moving tone. Surfaced in the BandPanel Technical "Familiar
Country" section and a selected-band-only faint map wash on its own "Range" chip (independent of Activity; no clutter in All).
`--targeted-range-1-audit` passes (subsetViolations 0 both maps, decay, determinism, mislabelFixed 5/5 + 9/9), graph 176/451,
all guard audits + `--all --fast` green. **Next: RANGE-2** (lineage colours + daughter range inheritance).
**RANGE-2 done 2026-06-22 — lineage colours + read-only daughter inherited-range; NO sim behaviour change.** Part A: new pure
`src/sim/agents/lineageColor.ts` (`deriveDaughterColor`) replaces `shiftHexColor` at fission with a **same-hue shade family** —
a daughter inherits the parent hue UNCHANGED and varies only lightness/saturation, so a blue lineage stays shades of blue with
zero generational drift (min-distance vs active bands escalates L/S first, hue only as a tiny bounded last resort). Daughters
are related-but-distinct with no nearby collisions; `band.color` is display-only (not in decisions/fingerprint/baselines) so
it's behaviour- and baseline-neutral and founder colours are unchanged. Part B (read-only, no new seeding — daughters already inherit degraded behaviour-affecting memory at fission):
`deriveInheritedRangeContext` classifies a daughter inside/edge/outside its parent's range (+ shared tiles), shown in the
BandPanel "Lineage & inherited range" section and as a ≤2-ring parent camp/water core overlay hint (no parent range wash) on
the Range chip. `--targeted-range-2-audit` passes (daughter-pair colour distance 73 ≥ 60 both maps; inherited range ⊆ observed;
deterministic), graph 177/454, all guard audits + `--all --fast` byte-identical. **Next: RANGE-3** (social recognition of
other bands' ranges).
**RANGE-3 done 2026-06-23 — social range recognition + daughter identity + ford context (READ-ONLY) + overlay/glow visual fixes + a
flag-gated DEFAULT-OFF founder-colonization fission bias; sim byte-identical at default.** Three new pure read-only `src/sim/agents`
modules — `socialRangeRecognition.ts` (`deriveSocialRangeRecognition`), `lineageIdentity.ts` (`deriveLineageIdentity`/`deriveIdentityColor`),
`fordContext.ts` (`deriveFordContext`) — reuse existing substrate (`contactMemories`/`lineage`/`deriveFamiliarCountry`/`world.riverCrossings`+
`crossingMemories`), are bounded to a **kin ∪ contactMemories** candidate set (no all-band/all-tile scan, cap 8/8 deterministic), and are
**never imported by `stepSim`** ⇒ byte-identical (the RANGE-1/2 pattern). Identity is **evidence-gated** (founder → parent_dependent_daughter →
lineage_branch → independent_range_identity → new_country_founder; audited: no premature independence) with a **display-only `identityColor`**
that keeps the RANGE-2 hue family for dependent daughters and shifts hue ONLY at the evidence-gated independence transition (rendered via a
per-tick render memo, never stored on the band, absent from fingerprint/baselines). **Visual fixes:** the Range overlay now defaults **OFF**
(was "selected", so it isn't misread as borders), the type widened to `off|selected|all` (Off/Selected live; All was initially a labeled stub,
then the Band Life readability checkpoint below made All a real transparent all-band use-range wash), and when ON it is readable (warm
lineage-tinted wash, tier alpha 0.18/0.30/0.46 + drawn AFTER the over-layer atmosphere blit);
the unintended **daughter aura ring** is now gated to `isDaughter && isSelected` (no halo on unselected daughters). BandPanel Technical gains three read-only sections (Known neighbouring ranges,
Lineage identity, Outward establishment — the last surfacing existing `daughterColonization`/`pressureState`/`frontierDispersal`). **Behaviour
(flag-gated, DEFAULT OFF):** `WorldAuditOptions.daughterColonizationFissionBiasEnabled` binds `daughterColonization.pressure` + the band-known
`bestKnownUnusedHabitatOpportunity` into `scoreFissionTarget` (daughters only; bounded bonus + bounded distance relaxation on the opportunity tile;
never rewards risk/crowding/richness). Default OFF is **bit-identical** (`x − 0.3·0 === x`, `score + 0 === score`) — verified the only `--all --fast`
before/after diffs are wall-clock timing + a **pre-existing run-to-run phase-order dump artifact** (two same-code runs differ identically; use
`--deterministic` for the real fingerprint, not the full dump). **Single-origin spread audit (extends HEAT-1, OFF vs ON):** the lone-origin map2
population stays **river-locked at 100y/200y** (occupiedCatchments 1, 0% outside origin — low population ⇒ colonization pressure rarely clears
`COLONIZE_MIN`, so the lever is correctly inert) but **breaks out to a 2nd catchment by 500y EVEN WITH THE FLAG OFF** (occupiedCatchments 2,
~25–32% of bands outside origin, longest lineage 63–93 tiles) via **20 known-ford crossings + breadcrumb steps (no teleport, passability respected)**;
the flag ON gives a small positive nudge at 500y (bands-outside-origin 0.318 vs 0.25, `leverIncreasesSpread`). So **crossing was never the blocker** —
early river-locking is low-pressure conservatism, and meaningful spread is a longer-horizon emergent (game-compressed `corridor_diffusion`, not an
explosion). New `--targeted-range-3-audit` (22/22 crafted unit + real-band @60y: recognition/identity distributions, candidate ⊆ kin∪contacts,
ranges ⊆ observed, no premature independence, identity-colour readability is **verdict-gated**, diamond/blob risk false, no economy/conflict coupling,
source purity, determinism) + `--targeted-single-origin-spread`. Validation: build, graph **177/454 → 180/464** (+3 nodes/+10 links) 0/0,
range-1/2/3 + residential-move + activity-path + fast-time-overlay + single-origin-spread all **pass**, `--all --fast` exit 0, `deterministic=true`,
static guards clean (no `Math.random`/`any`/UI-import in `src/sim`). NOT territory/borders/ownership/recognition-as-law/intrusion/conflict; no
economy/CC coupling; no daily `band.position` mutation. Spec/plan: `docs/superpowers/specs/2026-06-22-range-3-social-recognition-identity-founder-spread-design.md`,
`docs/superpowers/plans/2026-06-22-range-3-social-recognition-identity-founder-spread.md`. **Next: RANGE-4** (intrusion/tension events, record-only
first). Deferred future hooks: Range overlay All-mode polish + social kin-dot overlay; a possible `COLONIZE_MIN` re-calibration / longer-horizon study
if a future checkpoint wants the founder lever to fire before 500y.
**Range overlay preflight 2026-06-23 (requested before continuing RANGE-3B):** default OFF re-confirmed in `store.ts`;
Selected mode uses `snapshot.selectedBandId -> snapshot.world.bands[selectedBandId] -> deriveFamiliarCountry(...)` and therefore only draws
for a selected band with meaningful RANGE-1 memory. Render order re-confirmed: terrain + debug washes, then the over-layer/atmosphere, then
`drawSelectedBandFamiliarCountryOverlay`, so the range wash is not behind terrain/atmosphere. The selected-band wash was strengthened from the
older barely-visible values to a warm lineage-tinted 0.18/0.30/0.46 edge/familiar/core fill with only camp/water core marks (no political border
outlines). Headless Chrome manual check after reload, Year 30 Seasonal, selected old `Green River Band`: Off -> Selected changed 1,631 canvas pixels
(`changedFraction 0.001916`, `maxPixelDelta 177`) and screenshot inspection showed the familiar-country wash around the selected band. Quick verdict:
**Range Selected visible on old band: yes.** As of the Band Life readability checkpoint, All mode is no longer a stub: `Range: All` draws a
transparent coloured familiar-country wash for active bands from their own derived range memory, still with no borders/ownership semantics.
Freshness caveat: the range wash is band-state derived from full world snapshots and may lag the live marker overlay
at Civilization Skip speed; `--targeted-fast-time-overlay-check` still passes for marker/activity freshness. Validation: `npm run build`,
`--targeted-range-1-audit`, `--targeted-range-3-audit`, and `--targeted-fast-time-overlay-check` pass.
**RANGE-3B done 2026-06-23 — founder pulse calibration + playable small-map spread; behaviour change accepted as normal MVP.**
This supersedes only RANGE-3's founder-bias default decision: `WorldAuditOptions.daughterColonizationFissionBiasEnabled`
now treats `undefined` as normal calibrated ON, while audits set `false` explicitly for the old conservative comparison.
Ordinary seasonal mobility/attachment was not globally weakened. The scoring change is still bounded to fission target
selection after ordinary demography has already allowed a split: `COLONIZE_MIN 0.24`, causal route/ford/edge/side-country
evidence required, distance relaxation capped and applied only to the matched band-known opportunity, and risk/water/confidence
gates remain active. Known side-country can now enter the opportunity set only through observed side-country resource memory
(capped 6, learned patch confidence/access/safety required), not inferred land by itself. The single-origin audit now includes
100/200/300/500y OFF-vs-ON rows plus founder-pulse candidates, accepted pulses, blocked reasons, average/median target distance,
route/ford/edge backing, no-teleport, and too-explosive flags. Final audit (`--targeted-single-origin-spread --spread-500`):
100y OFF=ON 1 catchment/2 bands/0% outside; 200y OFF=ON 1 catchment/4 bands/0% outside with 4 route-backed candidates; 300y
ON improves to 2 catchments (6 river + 1 open plains, 14.3% outside, longest 67) while OFF remains one river catchment; 500y
ON reaches 3 catchments (river/open plains/delta, 26.1% outside, longest 119) vs OFF 2 catchments (25.0%, longest 93). All
accepted pulses were route/edge-backed, one known-ford-backed by 500y, max seasonal step 2 <= 8, teleportEvents 0, and
tooExplosive false. Validation after the default flip: build OK; graph 180/464 0 dup/0 dangling; RANGE-1/2/3 pass; residential
move, activity path passability, fast-time overlay, 2K.12 reader audit, deterministic smoke, Map1/Map2 smokes, and `--all --fast`
25/25 pass. Exact raw static greps are comment/prose-noisy for `Math.random`/standalone `any`, but executable/type checks are
clean: `Math.random(` 0, `: any|as any` 0, src/sim UI import guard 0. **Next: RANGE-4** record-only intrusion/tension events.
*(Known dev-only nit: `band/sections.tsx` exports components + helpers, so Vite Fast Refresh full-reloads that one
legacy module; production build unaffected. Optional follow-up: split its non-component helpers into `band/format.ts`.)*

**Band Life Readability done 2026-06-24 — rich state descriptions + activity variety audit; UI/read-only, no sim behaviour change.**
New pure UI layer `src/ui/bandLife.ts` derives a player-facing daily/weekly/monthly/seasonal band-life summary from existing signals only:
recent trip ledger, task/resource class, range context, familiar-country tier, pressure/founder pressure, lineage/parent relation, season,
residential/fission history, and known route/water context. It splits the old broad status into current activity, movement/range context,
short-term intent, reason line, and compact chips, with deterministic variants keyed by band/tick/season/activity (no random flavour).
BandPanel Overview/Activity, headline, roster entries, and activity cards now use the richer state; legacy fallback labels in
`bandSummary.ts`/`labels.ts` were retuned so "Shifting camp locally" is not the dominant player-facing label when better real activity data
exists. Activity labels now disambiguate collapsed `local_foraging_group` records by existing `resourceClassId` and returns:
near-camp fishing/hunting/gathering, water checks, wider fishing/hunting/gathering, route/return/camp/rest/founding cues where grounded.
Time-scale summaries aggregate recent trips instead of repeating the raw daily label. The "same treatment" extra area was History:
movement, residential-move, and fission entries now use compact grounded wording instead of debug-like event strings. Icons were extended
for water, forage/hunt/fish, camp, route, range, lineage, pressure, founding, return/rest/uncertainty. Range overlay side-fix: default remains
OFF, Selected remains visibly working, and All is now a real low-alpha coloured transparent familiar-country wash over pixels for active bands
(no territory/borders/ownership); headless visual check showed Overview/Activity richer labels and `Range: All` visible. New
`--targeted-band-life-readability-audit`: Map1 20y had 120 trips, raw `local_foraging_group` 72/120 but readable categories break out as
near-camp fishing 40, near-camp hunting 24, near-camp gathering 8, plus explicit gathering 34 and hunting 14; Map2 20y had 216 trips with
water 96, local-foraging 24, fishing 53, hunting 34, gathering 9. The rich-band "all foraging" issue is partly label collapse and partly real:
Estuary/Delta bands can genuinely run 9/9 near-camp aquatic work when their recent activity is all local fishing. AG10 remains shadow-only and
AG11 remains off by default (`ag10ShadowOnly=true`, `ag11Off=true`); no support/yield/population/stress/carrying-capacity/mortality coupling was
added. Validation: build OK; graph 180/464 0/0; RANGE-1/2/3 pass; activity path passability pass; fast-time overlay pass; deterministic smoke
prints `deterministic=true`; `--all --fast` exit 0; strict executable guards clean (`Math.random(` 0, `: any|as any` 0, src/sim UI imports 0).
Raw prose grep for `Math.random`/standalone `any` still finds existing comments and ordinary English in `src/sim`, not executable `any` use.
**Small wording polish 2026-06-24:** removed the ambiguous visible hunting phrase "game sign" / "small game" from `src/ui` so the close band-life
copy reads as simulator natural-history language ("animal tracks", "animal sign", "animals taken") while keeping the warm closeness intact; also
renamed the visible Map 1 label from "Lake/River Debug" to "Lake/River Reference". `npm run build` passes; `rg "\bgame\b|\bGame\b|game sign|small game" src/ui`
returns no visible-copy hits.
**Drag-lag hotfix 2026-06-24:** Range now uses the same dropdown control pattern as Activity (`Off / Selected / All`), and the canvas drag path
renders the updated camera immediately in the same rAF that applies the pan. Familiar-country range derivations are cached per world/tick/band, so
Range Selected/All no longer recomputes `deriveFamiliarCountry` on every camera-drag frame. UI/render-only; no sim behaviour change. `npm run build`
passes.
**RANGE-3B Light Exploration + Kin Word-of-Mouth v0 done 2026-06-24 — conservative reported-knowledge texture; bounded behaviour nudge.**
New pure sim module `src/sim/agents/reportedKnowledge.ts` plus `Band.reportedKnowledge` adds capped second-hand reports passed through
parent/daughter/sibling/lineage/contact/proximity networks. Reports cover water, fishing/delta/wetland, animal abundance, bad water/avoid places,
poor returns, seasonal opportunity, ford/crossing, tributary route, safe side-country, and crowding. They are deterministic (hash/cadence, no
random), trust/freshness/distortion tagged, and explicitly guarded (`noHiddenTruth`, `noDirectUnlock`, `noGuaranteedTruth`, `noLanguageSystem`).
Reports do **not** create observed tiles, resource patches, support, yield, carrying capacity, stress, mortality, population change, direct
relocation, territory, or conflict. They can only provide a tiny route/probe/fission scoring bias when the target is already local/known or has
existing route/ford/edge evidence; avoid reports can add tiny caution. Light exploration scoring also adds small known-memory bonuses for creek/
tributary corridors, known opposite-bank/ford opportunities, repeated side-country/resource evidence, and daughter edge contexts, without weakening
ordinary attachment or overriding risk/water/confidence. UI/debug: BandPanel Technical now includes "Reports / shared knowledge" with source,
topic, trust, confidence, freshness, distortion, disposition, target, and whether the receiver has seen it; wording is explicitly unconfirmed and
second-hand. Architecture graph now includes `reportedKnowledge` (graph 181/472).
Audit result (`--targeted-word-of-mouth-audit`) is **pass** and intentionally conservative: 100y one catchment, 2 active bands, longest lineage
distance 25, 1 known ford use, 22 reports / 8 active records (`ford_or_crossing`, `animal_abundance`, `poor_return_warning`, `avoid_place`);
200y one catchment, 3 active bands, longest distance 49, 3 known ford uses, 275 reports / 13 active records, 3 checked-by-probe, 28 acted-on
dispositions, 0 direct relocations without known/route evidence, 0 report-created observed tiles, 0 report resource unlocks, 0 teleport, deterministic
repeat true. This improves visible knowledge flow and crossing texture but does **not** exaggerate colonization: the tested single-origin lineage is
still main-river/catchment conservative by 200y and not explosive. No tributary/creek occupation appeared in this fixture by 200y (`knownTributaryBands`
0), so tributary logic is available but not proven by that route. Standalone 100/200/300/500 single-origin spread comparisons were attempted in this
session but timed out before writing output; RANGE-3 audit still re-ran its 100y spread comparison and passed no-teleport/passability.
Validation: `npm run build` pass; graph integrity pass (181/472, 0 dup, 0 dangling); RANGE-1/2/3 pass; band-life readability pass; activity-composition
pass; activity-path-passability pass; fast-time overlay pass; stuck-band audit pass; deterministic smoke matched; Map1/Map2 20y smokes complete;
`--all --fast` 25/25 complete. Residential-move audit was attempted but timed out/hung in this session. Exact executable static guards clean:
`Math.random(` 0, `: any|as any` 0, and `src/sim` UI/render/Zustand import guard 0; broad prose greps still find existing comments/ordinary English.
Recommended next step: if this conservative texture is accepted, proceed to RANGE-4 record-only intrusion/tension events; if tributaries still feel
underused in play, run a narrow tributary/creek fixture before changing thresholds.
**RANGE-4 Record-Only Intrusion / Tension Events + Seasonal Map Visual Skin v0 done 2026-06-24 — display/debug memory only, plus cosmetic terrain seasonality.**
New pure sim module `src/sim/agents/rangeFriction.ts` derives bounded `RangeFrictionEvent` rings (`Band.recentRangeFrictionEvents`, cap 8, age/candidate
capped) from already-grounded evidence: familiar-country tiers, residential anchors, recent activity trips, known ford context, kin/contact relation,
and existing reported-knowledge warnings. Kin/lineage overlaps become tolerated/shared-use records; repeated weak-contact/stranger use near camp,
water, route, ford, or familiar core can become watchful/mild `possible_intrusion`, `crowded_water_place`, `route_overlap`, or `ford_overlap`.
Every event carries guard flags (`noConflictChange`, `noMovementChange`, `noPopulationChange`, `noStressChange`, `noYieldChange`,
`noTerritoryClaim`) and no behaviour code reads the ring. Daughters reset the ring via `DAUGHTER_NON_CLONEABLE_FIELDS`. Word-of-mouth only links as
secondhand warning context; rumor alone does not reveal a band, create true intrusion, or force movement. BandPanel Technical adds
"Shared-use / tension notices (RANGE-4)" with relation/tier/activity/confidence/tension plus explicit "record-only; no conflict/borders/territory"
wording. No map territory shapes were added, to avoid implying borders/ownership.

Seasonal visual skin is render/UI-only: `src/render/seasonalVisuals.ts` now derives spring/summer/autumn/winter color shifts from existing terrain,
moisture/dryness, vegetation class, and elevation; autumn adds warm vegetation accents, winter adds frost/snow mainly where high/cold/wet enough,
and dry lowlands stay mostly dry. `store.ts`, `canvasRenderer.ts`, and `WorldCanvas.tsx` add a `Seasons` cosmetic toggle and include it in static
tile cache keys. Render order remains terrain skin first, then overlays/atmosphere, then Range/activity/bands so accepted overlays remain readable.
Architecture graph adds `rangeFriction` and `seasonalVisualSkin` nodes (graph 183/484).

Validation: `npm run build` pass; graph integrity pass (183/484, 0 dup/0 dangling); RANGE-1/2/3 pass; word-of-mouth pass; band-life readability pass;
activity-composition pass; activity-path-passability pass; fast-time overlay pass; residential-move audit pass; deterministic fast smoke pass;
Map1/Map2 1y smokes pass; `--all --fast` exits 0. RANGE-4 targeted audit pass: 42 events, 40 tolerated kin, 2 outsider watchful/mild, 1 report-linked,
0 guard violations, max ring 8, deterministic repeat true. Seasonal visual audit pass: Map1 autumn/winter deltas 18.49/22.87; Map2 16.98/31.94;
dry-lowland snow average 0 on both; high-elevation snow stronger than dry lowland (0.0676 / 0.1937). Static executable guard status: no `Math.random(`
calls, no `: any`/`as any`, no src/sim UI/render/Zustand imports; broad raw prose greps still find historical comments/ordinary English.
**Regional Reported Knowledge v1 + Seasonal Color Sync Fix done 2026-06-26 — approximate regional talk, internal scout/trip returns, grounded speculation, and render-only gradual seasonal colors.**
Reported knowledge is now regional-first instead of tile-first: every `WordOfMouthReport` carries a `regionTarget` (region id, optional audit anchor tile,
rough radius, region kind, receiver-relative direction, precision) plus `sourceBasis`, confirmation status, evidence/contradiction counts, trust, freshness,
and deterministic distortion. Linked tile ids remain only as audit/debug anchors. Reports do not create observed tiles, resource memories, support/yield/
carrying-capacity, stress, mortality, population change, territory, conflict, or direct relocation. Behaviour impact remains tiny and gated: a report or
speculation can bias a probe/scout/fission target only when the candidate already has local/known/route/ford/edge evidence; warnings add small caution.

Band-internal talk now comes from real evidence: returned scout/resource-scout outcomes, recent forager/fishing/water/hunting/gathering trips, poor-return
trips, crossings/fords, travel corridors, range-friction warnings, and residential move memory. Topics include water, fishing, animals, hunting/gathering,
seasonal pulses, poor returns, crowding/outsiders, dry/snow hardship, routes/fords/tributaries/creek valleys, known return places, good camp regions, edge
opportunities, and grounded better-land/risk/route/animal speculation. Speculations are bounded separately, carry `noHiddenTruth/noDirectUnlock/noForcedMove`,
and can be remembered/watched/checked/partly confirmed/contradicted/stale. Inter-band reports still move only through kin/contact/shared-water/proximity
chains with hop decay, capped active records, deterministic merge/ordering, and seasonal freshness/distortion.

Player visibility: BandPanel Overview now shows compact "Current talk / reports" lines with regional wording; Technical keeps a full report/speculation table.
The architecture graph `reportedKnowledge` node was updated. New audit `--targeted-regional-reported-knowledge-audit` passes: aggregate 4,185 reports
(3,851 internal / 334 inter-band), 112 active records, 54 speculations, region/source/topic coverage true, caps compliant, deterministic repeat true, 103
checked-by-probe, 67 partially confirmed, 41 contradicted, 0 stale, 0 report-created observed tiles, 0 resource unlocks, 0 direct relocations from report alone.
The existing word-of-mouth audit also passes with 3,486 reports by 200y, 64 active records, average/max 16 reports per active band, and the same hard guards.

Seasonal colors were fixed after a source pass on leaf/phenology behavior: render-only weights now cross-fade by calendar day, with brighter spring green-up,
deeper summer chlorophyll, warmer autumn foliage, and winter dormancy/frost/snow restrained by terrain/water/elevation. The terrain cache now keys time-sensitive
colors by the fresher live-overlay calendar day, not only the rare full-snapshot seasonal tick, so colors stay synchronized with the clock and transition through
daily/monthly playback. This remains visual-only and has no sim/seasonal-resource rule effect. Seasonal visual audit passes on both maps: spring/summer/autumn/
winter visible, gradual spring-to-summer transition true, dry-lowland snow avg 0, high-elevation snow stronger than dry lowland, fresh-calendar cache guard true.

Validation for this checkpoint: `npm run build` pass; graph integrity 183/484, 0 dup/0 dangling; RANGE-1/2/3/4 pass; word-of-mouth and regional reported-knowledge
audits pass; seasonal visual audit pass; band-life readability pass; activity-composition pass; activity-path-passability pass; residential-move audit pass
(10,840 events, 0 water steps, 0 invalid, 0 non-contiguous arrived paths, 0 guard violations, deterministic both maps); deterministic baseline 20y smoke matched;
Map1 20y smoke complete (179 pop / 5 bands / 0 fissions); Map2 20y smoke complete (263 pop / 9 bands / 0 fissions); `--all --fast --json` exits 0. Executable
static guards: `Math.random(` 0, `: any|as any` 0, src/sim UI/render/Zustand import guard 0. The broader requested prose greps still find existing comments
and graph text mentioning `Math.random` / ordinary English `any`, not executable violations.
**Word-of-Mouth UI v2 + frozen-residence pressure polish done 2026-06-26 - living talk feed, source richness, ranked cards, and stuck-band focus.**
Overview now splits the selected band's talk into two old-map cards: **Internal Band Talk** and **Inter-Band Talk**. Each card shows the top 3
ranked active talks by default, an active count, source label, confidence/freshness/lifecycle/status badges, and a bounded expanded list with filters
(`All`, `Warnings`, `Opportunities`, `Speculations`, `Checked`, `Fading`). Overview no longer hosts debug-sized tables; Technical keeps the full raw
report/speculation tables and now includes lifecycle counters (`expiredOrFadedCount`, `mergedSimilarCount`). The source model is richer but still grounded:
internal sources include scout/resource scout returns, fishing/water/hunting/gathering/forager trips, camp talk, older camp memory, dependents/camp pressure,
recent movers, route followers, crossing parties, seasonal observers, frustrated foragers, and successful foragers. Inter-band sources include parent/daughter/
sibling/lineage kin, familiar/weak/unknown contacts, range shared-use, crowded-water, ford, delta, and secondhand chains.

Talk variety expanded through real signals only: water, fishing, hunting/gathering, animals, unknown/known/kin bands, crowded water, dry/winter hardship,
fords/crossings, tributaries/creeks, lakes/deltas/wetlands, poor/good returns, better-land speculation, route memory, range friction, confirmation, contradiction,
and seasonal context. Ranking is deterministic and selected-band only: freshness, confidence, source trust, warning/opportunity urgency, current pressure,
repeated evidence, checked/confirmed/contradicted state, behavior linkage, relation source, and class diversity determine the top 3. Misleading/lie-like wording
is grounded as exaggeration, old story, vague/overgeneralized/region-shifted report, source bias, unreliable weak contact, or contradiction by later checking;
there is no random lying or full relationship/aggression model. UI lifecycle states are `fresh`, `active`, `fading`, and `stale`; repeated similar talk merges
or refreshes and weak/old talk fades out of player view.

Frozen-band focus: the earlier stuck-site fix was tightened because the apparent freeze could be a camp marker staying on one tile while the band repeatedly
selected residence-unchanged `logistical_probe` or `resource_scout` actions. `bandDecision.ts` now applies the bad-site dwell penalty to `stay` and, at a smaller
scale, repeated probe/scout choices after long bad-site dwell. The gate starts after 6 same-tile seasons, hardens toward 18, and includes the band's own local
survival, food/water/mobility pressure, depletion, biome/risk pressure, nearby-band pressure, range saturation, crowding penalty, and social access risk; water
refuge/security and remembered reliability still protect genuinely plausible harsh-place stays. This is **not** talk-forced migration and does not make reports
move anyone. It only stops a struggling/crowded residence from overvaluing staying or information actions forever when known/passable/risk-valid alternatives
already exist. River crossing rules were not loosened here: known/discoverable fords, shallow crossings, passability, route evidence, flood risk, and no-teleport
guards remain the crossing model.

Map hints were deliberately not implemented. A report overlay would risk looking like a quest marker or exact hidden-place reveal; the selected-band Overview
cards and Technical debug anchors keep the regional/approximate contract clearer. Performance remains bounded: active report/speculation caps remain, text
derivation is selected-band/UI-memoized, expanded lists are selected-band only, similar talk merges, reports fade, and the new audit checks visible counts and
cap compliance.

Validation: `npm run build` pass; graph integrity 183/484, 0 dup/0 dangling; regional reported-knowledge pass; word-of-mouth pass; talk UI/report UX audit pass
(10 source kinds, 17 topics, internal/inter-band talk present, active internal 106 / inter-band 10, max visible Overview talks 6, average visible 5, max expanded
selected-band talks 24, expired/faded 2,975, merged similar 656, distorted/misleading 17, behavior-linked 64, cap violations 0, deterministic repeat true);
stuck audit pass including the focused 500y single-origin Map 2 run (24 active bands, max same-tile dwell 11 seasons, average 1.79, frozen bad-site bands 0,
long stressed dwell bands 0); RANGE-4 pass; band-life readability pass; activity-composition pass; activity-path-passability pass; deterministic 20y smoke
matched; Map1 20y smoke 179 pop / 5 bands / 0 fissions; Map2 20y smoke 263 pop / 9 bands / 0 fissions; `--all --fast` 25 scenarios complete. Seasonal visual
and fast-time overlay audits were not rerun because no map hint/render/overlay code was touched. Static guards: requested broad `rg "Math\.random" src` and
`rg "(: any|as any|\bany\b)" src/sim` find existing comments/prose only; executable `Math.random(` and `: any|as any` remain 0, and the `src/sim`
React/Zustand/UI/render/canvas/DOM import guard has 0 matches.
**PERF-4 long-run stability checkpoint done 2026-06-26 — measured, partially improved, 1000y still diagnosed.**
Scope honored: no new gameplay feature, no C++/WASM migration, no ecology/fauna/aggression/language/war/persistent-camp expansion, no hidden truth,
no resource unlock, no support/yield/carrying-capacity/pop/stress/mortality/territory/conflict change. The PERF-4 audit command is now
`--targeted-perf-4-profile` with `--perf-years` / `--perf-map`; it reports runtime, hotspots, trace-growth counts, dynamic snapshot size, live overlay
size, and a memory-plan table. The instrumented benchmark harness was corrected to include the accepted actual-context `advanceReportedKnowledge`
and `advanceRangeFriction` passes; earlier long-run timings that omitted those phases are now treated as historical lower-bound sim-core timings only.

Implemented optimizations:
- Display/snapshot only: worker `run` accepts an adaptive `fullSnapshotIntervalMs`; `App` sends 2.5s/5s/8s/12s style full-snapshot cadences by speed,
  while the live overlay still updates every batch and pause/step/init force exact full snapshots. The main-thread fallback mirrors this throttling.
- Behavior-equivalent topology caches: `bandDecision.ts` caches static sorted neighbor ids and known-move two-ring topology by immutable map tiles;
  `getKnownSideCountryResourceEvidence` now scans for a max instead of sorting. No band gains knowledge; each band still filters against its own
  observed tiles and canonical passability/crossing checks.
- Behavior-equivalent ford lookup: `fordContext.ts` now indexes immutable river crossings by endpoint tile and crossing key, then applies the same
  observed-endpoint/crossing-memory gates. This removed an all-crossings scan inside range friction and RANGE-3 UI derivation without revealing hidden
  crossings.
- Report pass optimization/audit correction: final-context reported knowledge now returns immediately when every active band was already updated for the
  current tick (the old code built incoming/source candidates and then skipped all writes). Source/contact candidate selection uses deterministic bounded
  top-N selection instead of full sorts for large contact/place/corridor/patch collections. Report caps, merge/fade counters, behavior bias bounds, and
  region-first anti-omniscience remain intact.

Final PERF-4 profile on Map2 varied migration, corrected actual-context harness (`artifacts/perf4-final.json`):
100y completed 400/400 ticks in 13.31s (33.28ms/tick, max 79.92), 13 active bands, pop 412, dynamic snapshot 8.37MB, overlay 2.14KB, active reports 183,
range-friction events 74. 300y completed in 93.17s (77.64ms/tick), 36 bands, pop 1405, dynamic snapshot 27.79MB, reports 576, friction 288.
500y completed in 231.78s (115.89ms/tick, max 293.22), 36 bands, pop 2969, dynamic snapshot 30.31MB, overlay 5.69KB, reports 576, speculations 252,
expired/faded 99,212, merged similar 15,614, friction 288. 1000y did **not** complete under the 300s cap: 2,383/4,000 ticks (~596y), 125.97ms/tick,
36 bands, pop 3606, dynamic snapshot 31.22MB, reports 576, friction 287. Fast 1000y profile also hit its 180s cap: 1,922/4,000 ticks, 93.71ms/tick.

Current main bottlenecks at 500y are measured: `contextBeforeDecisionReportedKnowledge` 28.38ms/tick, `movementDecisionAndPressure` 28.16ms/tick,
`contextBeforeDecisionFrontierOpportunity` 12.34ms/tick, `movement:candidateGeneration` 9.99ms/tick, and
`contextBeforeDecisionRangeSaturation` 7.48ms/tick. The duplicate final report pass is now near-zero (0.04ms/tick at 500y), while final/before range
friction is ~3.7ms/tick after the ford index. Trace growth is bounded in the audited rings (reports capped at 16/band; friction at 8/band; residential
move events at 144 total on this run); known/place memory remains behavior-affecting and grows with explored map area, so future compaction there must
preserve decision summaries rather than deleting knowledge.

Validation: `npm run build` pass; graph integrity 183/484, 0 dup/0 dangling; deterministic 20y smoke pass and matched; Map1 20y smoke 179 pop / 5 bands;
Map2 20y smoke 263 pop / 9 bands; RANGE-1/2/3/4 pass; word-of-mouth pass; regional reported-knowledge pass; talk UI/report UX pass; band-life readability
pass; activity-composition pass; activity-path-passability pass; residential-move pass (127s); fast-time overlay pass; seasonal visual pass; focused
500y single-origin stuck audit pass; `--all --fast` 25/25. Requested broad static guards still report comment/prose hits for `Math.random` and English
`any`, but executable forms are clean: `rg "Math\.random\(" src` 0, `rg "(: any|as any)" src/sim` 0, and the `src/sim` React/Zustand/UI/render/canvas/DOM
import guard has 0 matches.

Migration-readiness note: do not port now. The most portable future candidates are static topology/crossing indices, range/crowding fields, report
region matching, and movement candidate scoring. The least portable systems are dynamic band knowledge objects, report lifecycle records, and current
immutable-object update chains. Current bottleneck is mixed sim/social report work plus large dynamic snapshots, not canvas rendering.

**PERF-5 reported-knowledge cadence/index checkpoint done 2026-06-27 - before-decision report cost cut, movement now dominant.**
Scope honored: no new gameplay feature, no migration/frontier calibration, no ecology/fauna/aggression/language/conflict expansion, no UI redesign/map hints,
no hidden truth, no exact unconfirmed tile reveal, no report-forced migration, no resource unlock, no support/yield/pop/stress/territory/conflict change.
This pass only changes the reported-knowledge hot path and benchmark instrumentation. The targeted profile flag is now
`--targeted-perf-5-profile` (aliasing the PERF-4 actual-context harness) and emits nested `reportedKnowledge:*` timings plus report counters.

Implemented optimizations:
- Benchmark-only fine profiling inside `advanceReportedKnowledge`: active band collection, children map, source facts, source candidate selection,
  inter-band transmission, report refresh, region matching, evidence scanning, confirmation/contradiction, internal report generation, merge/dedup/retain,
  speculation refresh/generation/retain, and counters for reports processed, source candidates, full evidence refresh bands, cheap lifecycle bands, and early returns.
- Behavior-preserving cadence partitioning: every active band still gets cheap lifecycle/freshness/status refresh each tick, but full report evidence/speculation
  scans run on a deterministic band-id/tick modulo cadence and internal talk generation runs on a separate deterministic cadence. Existing active caps and
  behavior-bias consumers remain in place.
- Per-band evidence index for the report pass: known observed tile ids, patch memories, place memories, recent trips, travel corridors, cached parsed tile
  coordinates, and a report-region/tile match cache. Supporting and contradicting evidence are now counted in one indexed pass instead of repeated scans.
- Confirmation/contradiction avoids the expensive observed-region check unless contradiction evidence actually increased. Weak/old report cleanup still uses
  bounded counters and active caps; old expired/faded reports are not stored as unbounded entries.
- UI/text separation was verified: player-facing report wording remains in `src/ui/reportedKnowledgeView.ts` and selected-band memoized UI paths, not in the
  sim before-decision hot path.

PERF-5 before/after on Map2 varied migration actual-context profile:
100y: 13.32s / 33.31ms tick -> 11.14s / 27.86ms tick; reported knowledge 6.98 -> 2.57ms/tick.
300y: 94.96s / 79.14ms tick -> 77.78s / 64.81ms tick; reported knowledge 19.32 -> 6.81ms/tick.
500y: 233.66s / 116.83ms tick -> 194.58s / 97.29ms tick; reported knowledge 28.88 -> 10.10ms/tick. Within reported knowledge at 500y, evidence scanning
fell 22.38 -> 5.17ms/tick, report refresh 21.28 -> 4.79ms/tick, internal generation 1.35 -> 0.77ms/tick, and speculation generation 2.39 -> 0.73ms/tick.
Reports processed stayed comparable (405.66 -> 403.90/tick) because the hot path now does cheaper work over the same bounded active surface rather than
deleting reports. Active reports stayed at cap-compliant 576, max 16/band; active speculations 252 -> 239, max 8/band.

Behavior drift audit: active bands and fissions stayed identical at 500y (36 active bands, 27 fissions); population changed 2969 -> 2965; residential moves
stayed 144. Known tiles/place memories differ slightly (3561/3557 -> 3463/3460) from deterministic cadence timing, but no guard violations were observed.
Report mix stayed alive: active internal/kin/contact/source categories remain represented; checked reports 2085 -> 2126; behavior-linked/acted-on reports
1293 -> 2159; partially confirmed 544 -> 528; unconfirmed 32 -> 48. Expired/faded counters dropped 99,212 -> 60,900 because fewer redundant refresh/generation
passes are performed; merged similar reports stayed comparable (15,614 -> 16,021). This is accepted bounded timing drift, not a semantics expansion.

1000y state after PERF-5: normal 1000y still caps at 300s but gets farther than PERF-4 (2573/4000 ticks vs 2383/4000); fast 1000y caps at 180s but also gets
farther (2116/4000 vs 1922/4000). The new long-run bottleneck is no longer reported knowledge: at the normal 1000y cap, movement is 34.28ms/tick, frontier
opportunity 14.30ms/tick, reported knowledge 12.37ms/tick, and range saturation 8.73ms/tick. Next optimization should target movement/frontier/range candidate
generation, not more report pruning unless a new report-specific regression appears.

Validation: `npm run build` pass; targeted PERF-5 before/after profile artifacts written to `artifacts/perf5-before-profile.json`,
`artifacts/perf5-after-profile.json`, `artifacts/perf5-after-1000-capped.json`, and `artifacts/perf5-after-fast-1000-capped.json`; deterministic 20y smoke pass
and matched; Map1/Map2 20y smokes pass; RANGE-1/2/3/4 pass; word-of-mouth pass; regional reported-knowledge pass; talk UI/report UX pass; band-life
readability pass; activity-composition pass; activity-path-passability pass; residential-move pass; focused 500y stuck audit pass (single-origin Map2:
29 active bands, max dwell 15 seasons, frozen bad-site bands 0, long stressed dwell bands 0); `--all --fast` pass. Graph integrity was not rerun because no
architecture graph was touched. Static guards clean: `rg "Math\.random\(" src` 0, `rg "(: any|as any)" src/sim` 0, and the `src/sim` React/Zustand/UI/render/
canvas/DOM import guard has 0 matches.

**PERF-6 movement/frontier/range candidate performance checkpoint done 2026-06-27 - measured internals, modest 500y gain, 1000y still capped.**
Scope honored: no migration/frontier calibration, no new ecology/fauna/aggression/language/conflict/persistent-camp systems, no random wandering, no forced
dispersal, no teleport, no hidden rich-tile targeting, no direct report relocation, no river/crossing/ford gate loosening, no support/yield/pop/stress or
territory/conflict change. This pass changed movement/frontier/range computation shape and benchmark diagnostics only.

Implemented optimizations:
- Benchmark-only PERF-6 instrumentation: `--targeted-perf-6-profile` now emits internal `movement:*` and `context:*` timings, movement/context counters,
  bounded candidate rejection counts, and broad spatial extent diagnostics for MIG-1 (origin distance, parent-daughter fission distances, relocation distances,
  occupied extent/catchments/habitat categories, known opportunity distances, and rejected good-opportunity reasons).
- Behavior-equivalent movement hot-path caches: known-tile stats are cached by the band's observed-tile set, travel-corridor edge lookup is cached by the
  corridor memory array, report target bias is memoized per candidate target key inside one decision, and side-country evidence is indexed once per decision
  instead of repeatedly scanning/sorting patch memories. Candidate sorting and known-move radius lookup/filtering are now separately measured.
- Behavior-equivalent frontier/range context profiling and candidate selection: `socialContext` now measures range saturation, carrying capacity, resource
  inference, frontier knowledge, nearby opportunity, and frontier intent/residence subpasses. Nearby-opportunity selection is one-pass best-candidate tracking;
  frontier candidate collection uses bounded deterministic top-N insertion instead of sorting the entire accepted set.
- Frontier knowledge allocation/sort reduction: inferred-tile copies are deferred until a real insertion is needed, no-add paths reuse the already-pruned
  set, and margin/corridor/side inference uses bounded lowest-id candidate selection instead of full candidate-map sorts. A broader prune-cache experiment was
  reverted because it did not improve the 500y profile.

PERF-6 measured results on Map2 varied migration (`artifacts/perf6-final-profile.json`):
100y completed in 11.47s (28.69ms/tick), 13 active bands, 4 fissions. 300y completed in 76.36s (63.64ms/tick), 36 active bands, 27 fissions. 500y completed
in 188.31s (94.15ms/tick), 36 active bands, 27 fissions, 144 residential move events, 576 active reports, 239 speculations. Compared with PERF-5's accepted
500y baseline (194.58s / 97.29ms/tick), this is a modest ~3.2% total runtime gain. At 500y the remaining top hotspots are movement 28.64ms/tick,
movement candidate generation 10.53ms/tick, frontier opportunity 10.27ms/tick, reported knowledge 9.72ms/tick, and frontier knowledge 7.71ms/tick. Range
saturation subparts are now visible, with carrying-capacity/range-state work still material.

1000y did not become feasible: normal capped profile (`artifacts/perf6-final-1000-capped.json`) reached 2565/4000 ticks in 300s (116.96ms/tick), essentially
flat/slightly behind PERF-5's 2573/4000 under the profiling load. Fast capped profile (`artifacts/perf6-final-fast-1000-capped.json`) reached 2140/4000 ticks
in 180s, slightly ahead of PERF-5's 2116/4000. The long-run blocker is still movement/frontier/range-style candidate work: at the normal cap, movement is
35.48ms/tick, movement candidate generation 12.92ms/tick, reported knowledge 12.50ms/tick, frontier opportunity 12.12ms/tick, and range saturation 8.98ms/tick.

Spatial diagnostics for MIG-1 at 500y: max lineage-origin distance 100km, median 8km, p90 32km, max occupied extent 169km, parent-daughter fission distance
average 6.52km / median 5km / p90 7km / max 53km, residential relocation average 1.13km / max 2km, known opportunity average 2.14km / max 6km. Occupied
catchments include dry corridors, deltas/estuaries, rich lake basins, river corridors, and open plains. These are diagnostics only; no expansion speed,
frontier weight, fission distance, parent anchoring, crossing rule, or stuck-site gate was tuned.

Validation: `npm run build` pass; targeted PERF-6 100/300/500 profile pass; 1000y normal and fast capped profiles completed to cap with artifacts; deterministic
20y smoke pass and matched; Map1/Map2 5y smokes pass (with an existing Vite websocket port warning but successful exit); RANGE-1/2/3/4 pass; word-of-mouth,
regional reported-knowledge, talk UI/report UX, band-life readability, activity-composition, activity-path-passability, residential-move, focused 500y stuck
audit, and `--all --fast` pass. Graph integrity was not rerun because no graph files were touched; seasonal visual and fast-time overlay audits were not rerun
because no render/overlay code was touched. Static executable guards clean: `rg "Math\.random\(" src` 0, `rg "(: any|as any)" src/sim` 0, and the `src/sim`
React/Zustand/UI/render/canvas/DOM import guard has 0 matches; broad prose greps only find comments/text.

**Pre-Run Band Start Placement / Drag-to-Choose Origin done 2026-06-27 - setup-only initial origin editing.**
Before a run starts, the map canvas now lets the player/dev drag each initial band marker to a valid starting tile. This is implemented as a deterministic setup
configuration, not a live-sim teleport: `SimWorldKind.initialBandPlacements` is threaded through the browser and worker `initSimWorld` path, and placement is
disabled unless the visible world is paused, tick 0, and has no decision history. The bridge clears stale live overlays on reload so worker markers cannot lag a
changed origin.

The sim-side placement helpers live in `src/sim/agents/spawn.ts`: `validateInitialBandPlacement` accepts only setup-state initial bands on spawnable,
support-plausible, unoccupied land tiles and rejects outside-map, aquatic, mountains, high-cost, occupied, and insufficient-support targets. On commit,
`applyInitialBandPlacements` rebuilds starter bands from their original spawn profiles rather than mutating fields in place; this regenerates position,
initial spawn reason, observed/known tiles, initial place attachment, demography/biome state, empty histories/reports/talk, and nearby-band knowledge from the
chosen tile. No ecology, migration, support, fission, report, or runtime decision logic changed.

UI changes are intentionally small: drag starts only from a setup-state band marker, pans remain unchanged otherwise, Esc cancels, and the render-only
`setupPlacementPreview` draws a subtle green/red tile highlight plus translucent marker while dragging. A small setup label appears only while placement is
available. New audit `--targeted-initial-placement-audit` passes: valid drop accepted, water rejected, old-origin observed knowledge not retained, initial
reports/speculations empty, same config/start seed deterministic, Map2 multi-band placements apply independently, live overlay marker matches, and
post-start placement is ignored. Validation: `npm run build` pass; baseline 5y deterministic smoke matched; Map2 5y deterministic smoke matched (with existing
Vite websocket port warning but successful exit); targeted initial-placement audit pass; static guards clean for `rg "Math\.random" src`, `rg "(: any|as any)"
src/sim`, and the `src/sim` UI/render/canvas/Zustand/DOM import guard.

**ECO-MIG-FOUNDATION resource pressure / catchment support / mega-band control done 2026-06-27 - finite shared ecology now drives support, stress, fission, and movement pressure.**
This is the first intentional causal ecology-support-migration bridge after the 3600y failure diagnosis. It keeps accepted UI/report/range behavior and does not
implement fauna stocks, animal movement, predator-prey, disease, storage, sedentarism, agriculture, territory, borders, war, language, or relationship simulation.

Implemented:
- Resource classes now have functional ecology metadata (`aquatic_fish_like_support`, wetland plants, fallback roots/tubers, mast/seeds, seasonal fruits,
  low-density greens, reeds/fiber/fuel, water-reliability support, and a clearly marked generic animal/hunting placeholder). They carry different reliability,
  patchiness, pressure sensitivity, regrowth, labor/access, and support behavior; animal stock behavior is still explicitly future work.
- Shared catchment support now applies finite pressure through overlapping catchments, tile depletion, class-specific pressure effects, and adult-equivalent
  demand. Support debug exposes raw vs clamped support, pressure-adjusted support, resource class contributions, shared/depletion/class/access/season/scale
  losses, and cause-specific stress instead of hiding deficits behind clamps.
- Added bounded ecological stress taxonomy and return-pressure signals: food deficit, shared catchment crowding, resource depletion, poor return trend,
  water access pressure, seasonal scarcity, nomadic scale pressure, logistical inefficiency, stale/uncertain resource memory, and fallback-food reliance.
- Added nomadic scale pressure (`normal_band`, `large_band`, `aggregation`, `mega_band`, `failure_warning`) that increases demand/logistical inefficiency,
  lowers fertility/growth for very large mobile groups, raises fission pressure, and flags max-band-cap fragmentation pressure without imposing a hard one-size
  cap.
- Movement/fission scoring now reacts to the band's own known resource pressure: chronic crowding/depletion/scale pressure weakens local attachment, increases
  pressure relief value, makes known richer opportunities more competitive, and raises daughter/fission pressure. It still only uses known/passable/candidate
  tiles and existing route/ford/edge/corridor gates.
- New benchmark/audit entry point: `--targeted-resource-foundation-audit` plus targeted aliases for shared catchment, raw surplus/deficit, mega-band,
  migration-resource pressure, anti-omniscience, and long-horizon sanity (`--eco-mig-audit-years N`). The audit reports class contributions, patch memories,
  depletion/regrowth, shared pressure, raw deficits, mega-band thresholds, known opportunity use, habitat/catchment spread, anti-omniscience guards, and perf.

ECO-MIG 500y Map2 audit (`--targeted-resource-foundation-audit --eco-mig-audit-years 500`): completed 2000/2000 ticks in 201.29s (100.65ms/tick). Active bands
36, total population 2467, max band population 101, p50/p75/p90/p99 band population 66/74/89/101, bands >80 = 8, >150/>300/>500/>1000 = 0. Fissions 27.
All 36 bands have raw support deficit exposed (raw support ratio mean 0.34, p50 0.30, p90 0.60; deficit ratio mean 0.66), with average shared pressure loss
7.09, depletion loss 20.13, nomadic scale loss 0.77, and class pressure loss 0.016. Shared catchment pressure is active (23 bands overlapping, max 6 overlapping
bands for one band, average pressure 0.22, max 0.72, 19 bands with crowded catchment pressure). Resource memory remains bounded (1728 patch memories, max 48 per
band; 889 sparse tile depletion records, mean depletion 0.46, max 0.85). Anti-omniscience guards pass: hidden known-unused targets 0, report-created observed
resource violations 0, full inheritance violations 0, reports do not create observed resources true, inherited knowledge degraded true.

Migration/resource pressure result: Map2 500y audit occupies dry corridors, deltas/estuaries, rich lake basins, river corridors, open plains, upland slope,
coast, lake shore, river/tributary, and general-good habitats. Known opportunities are active and considered for all 36 bands, suspicious ignored known-rich
opportunities 0, pressure-linked bands: shared crowding 19, resource depletion 36, nomadic scale 22, daughter pressure from scale/resources 22. Single-origin 500y
audit still passes no-teleport and reaches 20 active bands, 2 catchments, longest lineage distance 105 tiles, 29 known ford uses, and capped reports, but it remains
mostly river-corridor anchored; this is now a calibration/future MIG risk, not a frozen-band or infinite-support failure.

Performance/cost: carrying-capacity work is now materially causal and costs roughly 3-4ms/tick in the 500y profile; the full 500y ECO audit is 201.3s versus
PERF-6's 188.3s profile, a modest accepted cost for the new causal support layer. Main remaining hotspots are still movement candidate generation/scoring,
frontier opportunity, reportedKnowledge, and range/carrying-capacity state. Validation so far: build green, 100y and 500y ECO audits pass, 500y single-origin
spread audit pass. Final static/audit sweep should be checked before the next handoff if this entry was edited during an interrupted run.

**Word-of-Mouth / Reported-Knowledge Player-Experience Polish done 2026-06-26 — UI/readability only; ZERO sim behaviour change (sim byte-identical).**
New pure UI helper `src/ui/reportedKnowledgeView.ts` (type-only sim imports + the pure `getWorldTimeForTick`; never mutates sim, no decision logic) is the
single source of player-facing report wording for Overview/Activity/History/Roster; the Technical tab keeps its verbatim raw debug table untouched. It maps each
`WordOfMouthReport`/`ReportedKnowledgeSpeculation` to a player category (Scouts / Foragers / Water party / Camp memory / Seasonal talk / Shared-use note / Kin report /
Contact report / Distant rumor / Warning / Speculation), a plain-language title, an approximate region phrase (direction + region-kind + precision, NO tile ids — e.g.
"downstream, around a river reach" / "a vague story about the hills" / "beyond known country"), read-at-a-glance badges (Partly confirmed / Contradicted / Stale /
Checked / Unchecked / Fresh / Old / Vague / Exaggerated / Unreliable / Secondhand / Trusted kin / Weak source / Speculation), and a NON-causal lifecycle line
("It lightly shaped where the band looked", "The story faded over time" — never "made them migrate"). Raw enum names, band ids, tile anchors, and exact
confidence/freshness numbers remain debug-only in Technical.
Overview "Current talk / reports" now renders ≤3 compact tone-toned cards (icon · title · category · source · region · ≤2 badges) + an optional grouped note
("3 reports mention good fishing downstream.") + a muted "+N more in Technical · talk only nudges where scouts look" pointer; talk derivation is `useMemo`'d by band id +
`reportedKnowledge.lastUpdatedTick` + report count. Activity gains a "What parties are talking about" block linking internal scout/forager/water/return talk to the recent
trips the player already sees. History folds ≤3 notable report/speculation lifecycle moments (Checked / Partly-confirmed / Doubted / Faded / Talk-drew-interest) into the
existing timeline, dated season·year via `getWorldTimeForTick(tickReceived)` with a tone-tinted icon. Roster shows one cheap single-bounded-pass talk line per band (a
perf-safe stand-in for a map tooltip, since canvas hover is intentionally disabled) plus a native `title`. New old-map CSS for `.talk-card/.talk-badge/.trip-talk/
.band-roster-talk` (no side-tab accents — tone via icon/category/badges, matching `.chip.toned`; impeccable design hook clean for the feature).
**Map-hint decision — NOT implemented (documented).** Drawing a region circle/pin from the report's debug-only `approximateCenterTile` would re-elevate the exact
tile-anchoring v1 deliberately demoted, read as a quest marker / hidden-truth (the spec's #1 failure mode), duplicate the familiar-country wash for internal reports, and
point "go here" beyond the known edge for speculative ones; canvas hover is also disabled for perf. Talk stays in panels + the roster line; no `src/render`/overlay/`store.ts`
files were touched.
Validation: `npm run build` green; executable static guards clean (`Math.random(` 0, `: any|as any` in `src/sim` 0, `src/sim` UI/render/Zustand import guard 0 — the only
`any` hit is the English word in a doc comment); graph integrity 183/484 0 dup/0 dangling (unchanged — no new sim node); word-of-mouth audit guards all true; regional
reported-knowledge audit verdict pass + deterministicRepeat true with byte-identical counts (4185 reports / 3851 internal / 334 inter-band / 54 speculations / 103
checked / 67 partial / 41 contradicted); RANGE-4 audit verdict pass (deterministic, 0 guard violations, 50 events); band-life readability audit verdict pass; deterministic
20y smoke 179 pop / 5 bands / 0 fissions (matches Map1 baseline); `--all --fast` exit 0. Seasonal-visual + fast-time-overlay audits intentionally skipped — the map
overlay/render pipeline was not touched. Scope honored: UI/readability only, no `src/sim` change, no report-logic change, no hidden truth, no exact unconfirmed-target
reveal, no map ownership/borders, no territory/conflict, no support/yield/pop/stress/movement change. Files: `src/ui/reportedKnowledgeView.ts` (new),
`src/ui/band/{Overview,Activity,History,Roster}.tsx`, `src/index.css`.
**Stuck-site / dormant-depletion hotfix 2026-06-24:** Fixed the "band freezes on a bad tile" failure mode by adding a bounded stay-only penalty in
`bandDecision.ts` after final intent shaping: after multi-year same-tile dwell, if the band's own pressure/local-survival/depletion/risk signals say
the site is bad, the stay candidate is weakened. This does **not** force movement, does not weaken global attachment, and does not create hidden target
selection; known moves/probes/scouts must still beat stay through existing passability, water, route, and risk gates. Added `--targeted-stuck-band-audit`
to report long same-tile dwell under food/water/mobility pressure, last decision, non-stay alternatives, and sparse depletion counts. Also optimized
`world/depletion.ts`: current/near-band depleted tiles still use normal tile ecology, but far abandoned sparse depletion entries skip tile-profile
regeneration and use cheap scalar offstage recovery until dropped below floor (bounded by active-band radius 6; no full-map scan). Audit @80y:
Map1/Map2 `frozenBadTileBands=0`, deterministic true; sample stressed dry-margin band chose `logistical_probe` with stay score 0.99 vs probe 4.63.
Validation: build OK; graph 180/464 0/0; stuck audit pass; deterministic smoke matched; activity-path passability pass; residential-move pass;
`--all --fast` exit 0; executable guards clean (`Math.random(` 0, `: any|as any` 0, src/sim UI imports 0).

---

**Latest checkpoint (systemic track):** **2K.12 — Seasonal Ecology Memory Readers**
(**Implemented 2026-06-20; first reader of `seasonalEcologyMemory`; selection-only, anti-omniscient, flag-gated default OFF.**)
ECO-SEASON-1 left the learned seasonal memory written but read by nothing. 2K.12 adds a pure
`src/sim/agents/seasonalEcologyReader.ts` (`readSeasonalEcologyHint`) that reads ONLY the band's own learned memory —
never the hidden `deriveSeasonalEcologyFactor` / seasonal truth — and returns a bounded (±0.12), kind-labelled
SELECTION-ONLY bias (`dry_water_recall` +, `wet_opportunity_recall` +, `in_season_recall` +, `bad_season_caution` −).
It is consumed by residence-UNCHANGED choices only — resource-scout / known-patch recheck (`selectResourceScoutTarget`
selectionKey, never voiScore), activity target (`selectTripCandidate` score), and water-check target
(`chooseDiverseProbeTarget`) — plus a record-only `seasonalMemoryContext` annotation on `residentialMoveEvent` (context,
not a cause). All behind `WorldAuditOptions.seasonalEcologyMemoryReadersEnabled`, **default OFF ⇒ byte-identical baseline**;
empty/not-in-memory/wrong-domain ⇒ no effect by construction. NO support/yield/carrying-capacity/population/stress
coupling (no economy module imports the reader); plants stay non-food; AG11 stays OFF; no daily `band.position` movement;
the daily-step / seasonal-skip / render pipeline is untouched. New `--targeted-seasonal-memory-reader-audit`: 767 real
hints, 0 visited-only / 0 guard / 0 bound violations, ON deterministic both maps, wiring active (map2 ON≠OFF). Validation:
build, static guards, graph **175/447** 0/0, 2K.12 audit pass, seasonal-resource + recon + passability + AG9/10/11 +
AG5/6 memory-sensitivity all pass at the OFF default, `--all --fast` smoke exit 0, `deterministic=true`. Spec:
`docs/superpowers/specs/2026-06-20-2k12-seasonal-ecology-memory-readers-design.md`. **Next:** 2K.12B ON-calibration; the
Familiar Country / proto-territory RANGE-1..4 roadmap is the parallel research/design bridge (see design note below).

**Previous checkpoint:** **ECO-SEASON-1 — Seasonal Resource Realism Substrate**
(**Implemented 2026-06-19; substrate — resources become season-aware at activity/memory/shadow level, NOT a new economy.**)
**Phase 0** found the seasonal truth already exists (`world/seasonal.ts:getSeasonalTileConditions` derives realized
per-season conditions from each tile's authored `seasonalProfile`, consumed by dryMargin + bandDecision), that activity
outcomes/shadow already used *remembered* seasonality, and — critically — that the 2K.9 learned-support reader consumes
`ResourcePatchMemory.seasonality` AND the canonical `activityOutcome` feeds memory→2K.9→carrying capacity. So the safe
substrate modifies the **shadow + a separate seasonal memory + debug**, never the canonical outcome or `memory.seasonality`.
**Model:** new pure `src/sim/agents/seasonalResourceEcology.ts` — `deriveSeasonalEcologyFactor(world, tileId, domain)`
returns a deterministic realized availability factor (0..1) per domain (water_reliability, fishing, hunting_game,
plant_patch, gathering_general, local_foraging; + reserved future hooks), blending the existing seasonal truth with a
per-(tile,domain) hidden seasonal SIGNATURE hash (no Math.random) so patches peak in different seasons. **Integration:**
each activity trip records a `seasonalEcology` summary (debug) and a SHADOW `seasonalEcologyModifier` (~0.5–1.3) that
scales shadow gross/reliability only (consumed by the real economy solely via the OFF-by-default AG11 path); bands LEARN
the realized factor into a new bounded band-level `seasonalEcologyMemory` (observedSeasons / seasonalReliabilityBySeason /
drySeasonConcern / wetSeasonOpportunity / repeated success+failure) — read by nothing in the economy, daughters reset on
fission, learned ONLY from visited tiles. **Untouched:** canonical activityOutcome, ResourcePatchMemory.seasonality,
support/yield/carrying-capacity/population/stress, AG11 default-OFF. BandPanel shows the seasonal factor per trip + a
Seasonal Ecology section with a "no direct carrying-capacity mutation" guard. New `--targeted-seasonal-resource-audit`:
53,760 trips observed seasonal ecology, 258 learned hints, **0 hidden-truth / 0 economy-coupling (AG11 OFF) / 0
CC-mutation violations, deterministic both maps**. Validation: build, static guards, graph **174/441** 0/0, seasonal
audit pass, and time-scale + AG5/6/9/10/11 + recon + passability + deterministic **327/9** all unchanged vs baseline.
No economy/population/stress/mortality/CC/yield/relocation-scoring/AG11-default changes; plants are not food.

**Earlier checkpoint:** **TIME/PLAYBACK-STABILITY + ACTIVITY OVERLAY FIX + RESIDENTIAL-MOVE-1**
(**Implemented 2026-06-19; time/render-pipeline stabilization first, then a record-only event — NOT economy.**)
**Phase 0 (architecture review)** confirmed the root cause was the PERF-1 two-tier split: the per-tick live overlay
carried band POSITIONS but not activity, while the full snapshot (every ~2.5 s ≈ ~25 Civilization-Skip seasons)
carried activity — and REALISM-2B, to keep the selected band's marker attached to its routes, PINNED that marker to the
stale snapshot, freezing it for ~2.5 s while the clock and every other band advanced. **Phase 1 (freeze fix):** the map
now draws ALL bands from ONE fresh source — `getRenderBands(snapshot)` (live overlay when `overlay.tick ≥ world.tick`,
else snapshot); the selected-band snapshot override in `drawBands` is **deleted**, so markers never freeze; band +
activity hit-detection use the same fresh list. **Phase 2 (overlay fix):** the live overlay now carries a bounded
per-band `recentActivity` summary (`SimLiveActivityTrip`, ≤12 trips/band, path-capped — a tiny render projection, not
the 18 MB snapshot), so `selected` (detailed/clickable, anchor-filtered, re-attaches to the new anchor once a relocated
band forages — audit `midAnchorAttachedTrips=27`) and `all` (every active band, ≤2/band, ≤64 total, clustered,
visual-only) draw FRESH activity at the same tick as the marker; `off` hides it. **Phase 3 (RESIDENTIAL-MOVE-1,
record-only):** `src/sim/agents/residentialMoveEvent.ts` annotates a relocation `bandDecision` ALREADY decided with a
`ResidentialMoveEvent` — deterministic in-season start/end day by cause, cause from pre-move pressure + decided mobility
intent, a passability-aware BFS land route (never water; unreachable ⇒ `failed_no_route`, never a fake crossing),
bounded ring of 4, daughters reset on fission, surfaced in BandPanel with a "record-only; band.position still updates at
the seasonal boundary" guard. **Gated on `moved`** so a non-relocating world is byte-identical; NEVER read by
yield/support/carrying-capacity/population/stress/mortality. Validation: build, static guards, graph **173/438** 0/0,
new `--targeted-fast-time-overlay-check` (freeze avoided, activity fresh) and `--targeted-residential-move-audit`
(10,603 events, 0 water steps / 0 invalid / 0 non-contiguous / 0 guard violations, deterministic both maps; 46 honest
`failed_no_route` river-ford relocations), and AG5/6/9/10/11 + recon + passability all unchanged vs the REALISM-2B
baseline. No economy/AG11/population/stress/mortality/carrying-capacity/raw-movement/daily-position/boats/hidden-discovery changes.

**Previous checkpoint:** **REALISM-2B - First-Season Recon Rebaseline + Activity Movement / Path Visual Fixes**
(**Implemented 2026-06-18; correctness/legibility/rebaseline checkpoint — NOT economy.**) Audited and stabilized the
daily-activity/time system that TIME/MOVEMENT-REALISM-2 introduced, before any further economy coupling.
**Part A (first-season reconnaissance):** new `--targeted-first-season-recon-audit` shows first activity on day 6,
~28 trips/band/season (one per fire day — sparse and realistic; Map 2 ≈252 true day-by-day census, which is the "216"
seen in the 24-cap retained buffer), all targets band-known with **0 hidden-discovery violations**, and **year-1 macro
identical ON/OFF on both maps**. First-season recon is therefore **HEALTHY** (not weakened/delayed/removed): its only
downstream effect is a bounded, long-run, deterministic divergence via resource_scout TARGET selection that flows into
the PRE-EXISTING 2K.9 learned-support path (Map 2 ~+9/336 population at 100y, +3 at 50y, 0 at 20y; Map 1 fully inert).
Because that divergence requires letting early local knowledge inform decisions (its purpose) and is impossible to
remove without making recon decision-inert, **AG6/AG9 were REBASELINED to it** rather than damping the recon: AG9's
first ON/OFF divergence is now tick 1 (the AG7 tick-212 fixture is explicitly superseded), and AG6 now separates macro
STRUCTURE (active bands / fissions / extinctions — must stay invariant) from a bounded population MAGNITUDE cap. All
HARD proofs (no economy reader, no returns consumed, no guard failures, no hidden truth, determinism) stay strict and
green. **Part C (paths):** `buildOutboundPathTiles` is now passability-aware — a deterministic contiguous BFS over
walkable land that never steps on water, with water-source targets approached at the accessible shoreline (the group
stands on adjacent land); unreachable targets record a non-drawable single-tile path, never a fake water crossing.
`--targeted-activity-path-passability` went review→pass (water steps 247→0, stand-on-water 208→0, 203/208 water targets
shore-resolved, only 5/784 genuine across-water inaccessible). `targetTileId`/distance/shadow economy are unchanged
(pathTiles is cosmetic; not in the determinism fingerprint). **Parts B/D + user request:** *the user asked for this* —
the activity overlay now defaults to **SELECTED-band-only** (markers/routes draw only for the band you select; no
per-frame all-band activity scan — that is the optimization), selected-band activities stay anchored to the band's
current world snapshot so they don't float ahead of the band at fast/batched speed (completed trips show final tile +
route, no invented motion), at-home (length-1) water/fishing activities show a tile-edge marker, and clicking a stack
of overlapping activities cycles through them (off/all remain opt-in; clustering/offset/cluster-count retained; no
all-band hit scan). **Part E:** speed (world days/sec) vs resolution (calculation granularity; Ultra Fast = seasonal
aggregation; fast modes summarize activity) labels clarified — the model itself was already correct. No economy/AG11/
population/stress/mortality/carrying-capacity/raw-movement/residential-relocation/boats/hidden-discovery changes.

**Earlier checkpoint:** **TIME/MOVEMENT-REALISM-2 - Time Speed, Activity Density, Early Activity, and
Residential Movement Audit** (**Implemented 2026-06-18; controlled UI/time/activity checkpoint.**) Playback
speed now means target world days per real second, separate from daily/weekly/monthly/seasonal resolution.
The worker accepts a bounded `stepsPerInterval` batch so fast daily playback does not require a 90Hz UI loop,
and Ultra Fast / Civilization Skip forces seasonal resolution. Selected-band activity overlap remains bounded
to the selected band's recent records: colocated selected-band activity markers are offset around tile center,
show a compact cluster count, and keep zoom-aware hit detection/highlighting without building an all-band hit
index. First-season activity no longer looks dead: when a band has no patch memories yet, the daily trip selector
can seed starting local reconnaissance from already observed nearby tiles only (<=2 grid steps, capped records),
then creates normal real trip/outcome/memory records through the existing pipeline. No fake renderer groups,
hidden discovery, food/support/yield/stress/population coupling, or residential marker movement was added.

**TIME/MOVEMENT-REALISM-2 caveat:** earlier real activity means earlier activity-memory influence. The AG9 command
still exits green, but its report now finds first divergence at tick 1 rather than the old AG7 tick-212 fixture,
through resource-scout target selection. Treat that as known sensitivity for a future activity-memory damping or
fixture-refresh checkpoint, not as an economy/support effect. In-season residential relocation was analyzed but
deferred: `band.position` remains the residential/home-range anchor used by capacity, pressure, social context,
knowledge, activity origins, and seasonal decisions. The safe future model is a cause-gated recorded
`residentialMoveEvent` with start/end/path before any daily `band.position` updates are considered.

**Earlier checkpoint:** **ACTIVITY-GROUPS-11 - Tiny Flag-Gated Activity Subsistence Supplement** (**Implemented
2026-06-18; keep disabled by default / optional experimental only.**) This is the first deliberately reversible bridge
from activity-group shadow returns into actual support. `WorldState.auditOptions.activitySubsistenceSupplementEnabled`
defaults OFF; when OFF, `deriveCarryingCapacity` does not create any supplement field and the normal baseline remains
byte-identical. When ON, the existing abstract support remains the floor, and same-day returned FOOD shadow net may add
a tiny capped supplement above that floor: `0.06 * reliabilityWeightedEligibleShadowNet`, capped per band at
`min(0.75, 0.03 * adultEquivalentDemand)`. Only gathered/local-foraging, fishing, and heavily discounted hunting food
are eligible; delayed/overnight food is tracked but not consumed; water/info/route returns are not food; uncertain plant
returns contribute zero. The supportable carrying-capacity estimate still uses the abstract floor, so AG11 changes
per-capita support/stress/demography only through the explicit supplement and never mutates tile yield, habitat yield,
resource truth, or carrying capacity inputs.

**ACTIVITY-GROUPS-11 result:** new `--targeted-activity-subsistence-supplement` audit compares OFF vs OFF-repeat vs ON
for Map 1 and Map 2. The default 20y/50y audit returned `pass_optional_experimental`: OFF repeat byte-identical, OFF
supplement fields absent, OFF consumed support 0. ON was small and capped with no macro deltas in any case. 20y:
Map 1 consumed 0.90 support (share 0.0027), Map 2 consumed 0.68 (share 0.0016). 50y: Map 1 consumed 0.60 (share
0.0021), Map 2 consumed 1.06 (share 0.0029). Cap hits 0, guard failures 0, max population/fission/movement delta 0.
Dominant task types were gathering/local foraging on Map 1 and a guarded gathering/fishing/hunting mix on Map 2.
Recommendation: keep disabled by default; expose only as an audit/experimental flag until longer 100y/HEAT comparisons
are reviewed.

**ACTIVITY-UI-1 legibility:** selected-band activity records are now inspectable on the canvas. Hit detection only
checks the selected band's capped recent trips, uses zoom-aware marker/route hit radii, and selecting an activity opens
the Activity tab in BandPanel. Co-located activity markers are offset into a small zoom-aware ring/stack around the
target tile so multiple activities can logically share a tile without hiding each other; this is visualization only and
does not make tile occupation exclusive or create extra economic effects.

**Previous checkpoint:** **ACTIVITY-GROUPS-10 - Shadow Subsistence from Activity Returns** (**Accepted shadow-only
checkpoint, implemented 2026-06-16.**) Step 5 of the staged transition from abstract food/yield toward
activity-group-produced subsistence. Each daily activity group's deterministic return derives a normalized support-like
shadow estimate (`shadowNetValue`, `shadowReliability`, return kind/domain, distance/risk costs) from band-known info
only. AG10 remains the audit layer: its records are still marked `shadowConsumedByEconomy=false` and the real AG11
consumption happens only through the default-off supplement field above.

**Previous checkpoint:** **ACTIVITY-GROUPS-9 - Full evaluateBandDecision Divergence Fixture** (**Accepted
audit/fixture checkpoint, implemented 2026-06-16.**) Added `--targeted-activity-decision-divergence`, which
reproduces and explains the FULL `evaluateBandDecision` branch at the real AG7 divergence point. It advances ON/OFF
Map 2 worlds in lockstep on the real `stepSim(..., "seasonal")` daily-action path, FINDS the first per-band decision
divergence by comparing per-band decision signatures (not hardcoded), then re-runs to the pre-divergence tick and
captures the complete ON/OFF decision context in-situ via a new behavior-neutral `decisionObserver` hook threaded
through `stepSim -> advanceWorldByDays -> runSeasonalCompatibilityTick` (omitted/byte-identical in all normal/worker
runs). This checkpoint does **not** tune thresholds/dampening, add calories, change support/yield/carrying-capacity
formulas, change stress/population/mortality/fission/relocation, or consume activity `resourceReturn`.

**ACTIVITY-GROUPS-9 result:** The fixture reproduces AG7 exactly — first decision divergence at **tick 212 / year 53
spring**, band `band:varied-dry-corridor-mid` at `tile:62:108`, archive deltas `totalFrontierMoves +1`,
`totalMoveDecisions +1`, `totalResourceScoutDecisions -1`, all macro deltas 0, deterministic. The full-decision
capture **refines AG7's heuristic attribution**: at tick 212 **no boolean threshold gate flips** — the
`movementKnownOpportunity` `>0.12` gate is inert (`opportunityStrength 0`, learned support a side signal),
`hasBelievableOpportunity` and `consideredAsTarget` are identical ON/OFF. The operative reader is **resource-scout
TARGET selection**: ON's activity-refreshed nearby patch gives the scout `patchReturnGuidance`
`promising_unproven_patch_recheck` pointing at the near `tile:62:109` (scout candidate score `1.90`), which loses by
`0.02` to an unchanged `move_to_tile -> tile:61:108` (`seek_better_water`, `1.92`) — so ON moves; OFF, with
`no_guidance`, scouts the far `tile:66:109` frontier_probe (`2.43`) which beats the same move by `0.51` — so OFF
scouts. This is healthy near-threshold learning (razor-thin `0.02` ON margin, single band, macro unchanged), not a
twitch. No economy coupling, no hidden truth, `bandKnownTargetsOnly` true. Recommendation: do not tune
thresholds/dampening yet; re-evaluate only once activity returns actually feed support/food economy.

**Earlier checkpoint:** **ACTIVITY-GROUPS-8 - movementKnownOpportunity + Learned-Support Reader Fixture** (**Accepted
audit/fixture checkpoint, implemented 2026-06-16.**) Added `--targeted-activity-memory-reader-fixture`, a fast
targeted suite around the exact AG7 readers: `movementKnownOpportunity` / `nearbyOpportunity > 0.12`,
`ResourceBeliefOpportunity >= 0.1`, activity-memory confidence refresh/lowering/seasonality effects, decision-side
learned support in `deriveNearbyOpportunityGradient`, and existing 2K.9 realized/projected learned support in
`deriveCarryingCapacity`. This checkpoint does **not** tune movement, add calories, change support/yield/carrying
capacity formulas, change stress/population/mortality/fission/relocation, or consume activity `resourceReturn`.

**ACTIVITY-GROUPS-8 result:** Reader sensitivity is real but bounded and threshold-local. The direct
`movementKnownOpportunity` viability gate is strict: `opportunityStrength === 0.12` is **not** viable; `0.13` is
viable. A `confidence_refreshed` activity effect can move a near-threshold learned-support candidate from `0.11`
to `0.15` (`+0.04`) and unlock the movement-known-target gate; a `confidence_lowered` effect can move the same
candidate from `0.15` to `0.11` (`-0.04`) and lock it again. `ResourceBeliefOpportunity` has its own `0.1` threshold:
refresh can cross `0.07 -> 0.11`, while lowering can cross `0.11 -> 0.09`. Seasonality hints are recorded
(`badSeasons` updated) but are **not currently a strong direct movement-belief dampener**; recency can offset the
yield-confidence drop in the belief reader. 2K.9 learned support is actionability-gated: weak confidence
(`presenceConfidence 0.14`) remains `not_exploitable` and yields `tileSupport 0`; a single refresh to `0.17` can
make a matching known patch contribute bounded `tileSupport 0.06` and projected support `0.27`, while lowering removes
it again. No hidden discovery or direct activity-return economy coupling was found. Recommendation: do not damp yet;
add a full `evaluateBandDecision` dry-corridor fixture only if future food/support coupling makes these threshold
flips too frequent.

**Earlier checkpoint:** **ACTIVITY-GROUPS-7 - Memory Reader Causal Audit** (**Accepted audit checkpoint,
implemented 2026-06-16.**) Added `--targeted-activity-memory-reader-causal`, an audit-only Map 2 ON/OFF trace that
advances both worlds through the real `stepSim(..., "seasonal")` daily-action path and captures reader deltas over
time. AG7 found that the first Map 2 100y decision-archive divergence is tick 212/year 53 spring: ON has `+1`
frontier/move and `-1` resource_scout versus OFF. Direct gate: `movementKnownOpportunity`; upstream contributors:
daily retargeting, resource-scout target selection, resource belief opportunity, and learned-support projection.

**Earlier checkpoint:** **ACTIVITY-GROUPS-6 - Memory Sensitivity & Existing Reader Audit** (**Accepted audit
checkpoint, implemented 2026-06-16.**) Added `--targeted-activity-memory-sensitivity`, an audit-only ON/OFF
comparison that runs the real `initSimWorld` + `stepSim(..., "seasonal")` path so the `DailyAction` trip ledger
actually fires. ON uses normal ACTIVITY-GROUPS-4 patch-memory writes; OFF keeps the same daily schedule but sets
`WorldState.auditOptions.activityMemoryCouplingDisabled`, so trips/outcomes remain recorded while patch-memory
writes become `none` effects. The audit inventories existing readers of activity-updated `ResourcePatchMemory`
confidence/status: daily trip targeting/outcomes, resource belief opportunity, resource scout target selection,
plant eligibility, observed patch-return views, fission inheritance retention, and the pre-existing 2K.9
learned-support reader in carrying capacity/social context.

**Earlier checkpoint:** **ACTIVITY-GROUPS-5 - Targeted Memory-Effect Fixtures** (**Accepted validation
checkpoint, implemented 2026-06-16.**) Added `--targeted-activity-memory-effects`, a deterministic benchmark
suite that covers every ACTIVITY-GROUPS-4 memory effect path requested before food/support coupling is considered:
confidence refresh/lowering, seasonality hint, water reliability refresh, plant caution refresh, route refresh,
risk suspicion, no-effect debug-only, and unknown-target/no-discovery. It runs the same production memory
application function via an audit hook and does not create fake world trips or change sim behavior. Result: 81/81
assertions pass; effect counts cover all routed paths; confidence delta range `-0.06..+0.03`; hidden-truth failures
0; economy-coupling failures 0; deterministic repeat true.

**Earlier checkpoint:** **ACTIVITY-GROUPS-4 - Memory Coupling from Daily Activity Outcomes** (**Partial /
accepted narrow memory-coupling slice, implemented 2026-06-16.**) Daily activity outcomes now update the band's
known world model in a bounded, anti-omniscient way. `applyActivityOutcomeToMemory` consumes real
`recentIntraSeasonTrips` records and updates only the already-targeted `ResourcePatchMemory` matching the trip
`patchId` and `targetTileId`; it never creates new resource discovery. Effects include
`confidence_refreshed`, `confidence_lowered`, `seasonality_hint_added`, `risk_suspicion_added`,
`water_reliability_refreshed`, `plant_caution_refreshed`, and `route_memory_refreshed`. Confidence deltas are
tiny/capped (`+0.01..+0.03`, `-0.04..-0.05`, confirmation capped at 0.9). This is the first behavior-affecting
daily-activity bridge, but it is still **memory only**: no calories, yield, support, stress, population,
carrying-capacity, fission, relocation, survival, or plant-safety certainty.

**Earlier checkpoint:** **ACTIVITY-GROUPS-2/3 — Deterministic Outcomes + Resource Return Scaffold** (**Partial /
safe record-only scaffold, implemented 2026-06-16.**) Activity groups carry deterministic outcome records and a
guarded resource/info return scaffold derived from real `recentIntraSeasonTrips` records. Outcome classification
reads only band-known patch memory/effective confidence, remembered seasonality, remembered water/risk/access
signals, trip distance, task type, and estimated group size. Return records can report `none`,
`food_observation_only`, placeholder gathered/fish/hunted returns, or water/plant/route information, but every
record has `consumedByEconomy=false` plus explicit no yield/support/stress/population/carrying-capacity guards.

**Earlier checkpoint:** **ACTIVITY-GROUPS-1 — Band Labor Allocation Foundation** (**Partial / safe accounting
slice, implemented 2026-06-16.**) Activity groups became more than visual dots: each band can carry a bounded
`activityLaborSummary` derived from real `recentIntraSeasonTrips` records. The summary tracks total people,
working adults, estimated group assignments on the latest sampled activity day, people away/at base estimates,
groups by task type, latest group summary, capped over-allocation diagnostics, and explicit no
food/yield/stress/population/carrying-capacity guards. This remains **debug/accounting only**.

**Underlying movement substrate:** TIME-1B/TIME-1C remains the correct movement architecture (cause-gated
task-group trips, stable residential marker). TIME-1C does **not** add a movement lever — it makes the daily
layer honest and reusable. The residential/home-range marker (`band.position`) is still never moved by the daily
layer; demography/fission/depletion/economics stay season-gated.

**TIME-1C behavior:** (1) a new **common `DailyAction` aggregation interface** (`src/sim/agents/dailyActions.ts`):
a daily feature declares `firesOnDayOfSeason` + a pure `apply(world, day)`; `advanceWorldByDays` runs every
registered action identically under daily/weekly/monthly/seasonal by iterating only scheduled in-season days —
no naive 90-day loop, no four-way rewrite. The intra-season trip ledger is the first (and only) registered action.
(2) Each trip record now carries a **tile-by-tile breadcrumb `pathTiles`** (deterministic Manhattan staircase —
no teleport; history knows every crossed tile), a **return/overnight/continues `outcome`**, and a
**`movementType` taxonomy** (`local_foraging_loop` / `water_trip` / `food_patch_trip` / `plant_followup_trip` /
`memory_refresh_trip` / `overnight_hunt_or_scout`). All no-coupling guard flags remain `true`.

**Architecture choice (A–E):** **E = B (stable-marker task-group trips) + D (path reconstruction) behind the
`DailyAction` registry.** A (microsteps/band) and C (daily *residential* movement) are rejected — daily marker
motion is exactly SPIKE-MOBILITY-1, which collapsed HEAT 655→91. The slice is provably fingerprint-preserving:
nothing in the seasonal pipeline reads the new fields.

**ACTIVITY-GROUPS-4 updates the former TIME-1C deferred memory-refresh item:** the bounded refresh is now wired as
an explicitly reviewed memory-only checkpoint. It updates only existing target patch memories from real trip
outcomes, records before/after confidence snapshots and reason IDs, and keeps all economy/survival guards true.
See `docs/superpowers/specs/2026-06-16-activity-groups-4-memory-coupling.md`.

**TIME-1C verdict:** **ACCEPT / PARTIAL OBSERVATIONAL SLICE.** Real time-layer + audit-substrate improvement and
the reusable daily-action abstraction; not a movement/economy conversion. Seasonal residential movement, fission,
demography, depletion, and resource economics are untouched (Map 1 327/9/4, Map 2 314/9/0, HEAT 44/local_cluster
all byte-equal to TIME-1B).

**Validation updated:** `--targeted-time-scale-check` (now "TIME-1C") adds tiles-crossed, returned-same-day vs
overnight/continues counts, max route length, movement-type distribution, an academic-range comparison, a
no-teleport contiguity proof, and the no-coupling proof, alongside the existing determinism / behavior-equivalence
/ residential-movement / population-fission-extinction audits across daily 90d / weekly 13 / monthly 3 / seasonal 1
and the 10-season equivalents.

**Prior checkpoint:** **2K.11 — Side-Encountered Resource Testing / Matching Skill Accrual v0** (**Implemented
2026-06-14, awaiting review.** Closes 2K.10's gap: side memories formed off-corridor but matched no learned
skill, so 2K.7/2K.8/2K.9 couldn't bind. When an applied side probe forms a memory at a PLANT-BEARING side
tile, `applySideEncounteredCautiousTest` (bandDecision.ts) now also runs the SAME band-known plant-use-test
chain `resource_scout` uses → the 2K.6 `advanceExploitationSkill` writer → exploitationSkill ACCRUES for the
side class the band actually encountered. The full off-corridor loop now closes end-to-end.)

**Result — GOAL ACHIEVED (the off-corridor loop closes in the wild):** in HEAT 500y×3, **`sideFormedWith
MatchingSkill` is now > 0 in all 3 seeds (2 / 2 / 5)** (was 0 at 2K.10). Skill volume rose (bandsWithSkill
13/14/17; maxCompetence up to 0.43 — now reaching the `competent` band off-corridor), and **realized support
(2K.9) now fires in SECONDARY regions** for 2 of 3 seeds (heat-1: 2 bands, heat-2: 1) — the learned-niche
support chain works off-corridor by ECONOMICS, not a movement bonus. heat-1's secondary-region share rose
0.043→0.227 as a consequence. Stable: 0 extinctions all seeds, reproducible, no collapse/explosion (pop
655/586/733, bands 22/19/24 — mixed ±6%), patterns still `corridor_diffusion` (no forced multi-region
founding). Default maps **byte-identical to 2K.10** (Map 1 100y 327, Map 2 unchanged); `--all --fast` 25/25
(baseline/crowded/frontier ±1 pop where the chain now fires); over_capacity_core non-fast byte-identical.

**Anti-omniscience / safety:** the test fires ONLY for a plant-bearing side tile (non-plant / water / fallback
floor → no test), only on a band-known memory the band just formed, reads the band's OWN observed plant hint,
keeps outcomes suspicion-level (NO auto food/safe/processingLearned — `processingLearned` still 0; the
`confirmedProblem` counts that appeared are REAL learned cautions from harm signals), and is rare (inherited
side-probe cadence: cooldown + lifetime cap, daughter-reset — at most one test per applied side probe). No
yield/support magnitude change (2K.9 magnitudes untouched), no movement bonus, no demography/fission change.

<!-- 2K.10 / 2K.9 detail retained below for review context. -->

**Prior checkpoint: 2K.10 — Side Resource / Patch Memory Realism v0** (Implemented 2026-06-14.) Side probes
form bounded, anti-omniscient resource/patch memory at observed side tiles (the off-corridor substrate); the
gap it left (`sideFormedWithMatchingSkill = 0`) is what 2K.11 closes.

<!-- 2K.9 detail retained below for review context. -->

**Prior checkpoint: 2K.9 — Bounded Learned Skill → Realized Support Coupling v0** (Implemented 2026-06-14.)
The FIRST time learned exploitation skill touches REALIZED support /
carrying-capacity economics. In `deriveCarryingCapacity`'s footprint loop, a band's OWN learned, matching,
safe, OBSERVED patches in its OCCUPIED range add a bounded band-specific *usable-support* term to
`adjustedReachableSupport` → `perCapitaReturn` → stress/demography. This is what finally makes a learned
niche *materially inhabitable*, closing the loop 2K.7/2K.8 opened (rank/opportunity decision-side).
Extremely conservative: per-tile damped by depletion (`wearMultiplier`) and crowding (`share`), summed with
diminishing returns to a tight per-band cap (~1 adult-equivalent), and — crucially — the support ratio
**clamps to 1**, so a SURPLUS (comfortable river) band gains NOTHING; only a DEFICIT band is lifted.)

**Anti-sticky result (PARTIAL / honest — read carefully):** the design guards work where the binding target
exists: (1) the **clamp** — a surplus river band is at ratio 1, so learned support is clamped out (proven:
Map 1 100y **byte-identical**, all bands surplus); (2) **per-tile damping ×wear ×share** — a *crowded* core
yields ~0 learned support (proven: over_capacity_core non-fast **byte-identical** to 2K.8); (3) **tight cap +
diminishing returns**. BUT the HEAT realized-support census exposes the real-world limitation: **realized
learned support fired EXCLUSIVELY in the ORIGIN catchment (secondary-region bands = 0 across all 3 seeds;
2–4 origin bands, total ≈0.7 adult-equivalents/seed)**. Cause: bands hold matching observed patch memories
only in their *corridor* range, so the lift currently strengthens corridor *deficit* bands, NOT side niches —
the side binding target (off-corridor observed matched patches) essentially does not exist yet (the 2K.8
census already showed candidate-side ≈ 0). Net wild effect is small and safe (pop +0.6–3.4%, no collapse, no
extinction change, `--all --fast` all 25 identical to 2K.8) but **leans mildly corridor-ward** (pctSecondary
down in 2/3 seeds, up in 1; occupied catchments [2,2]→[2,3]). Per the checkpoint decision rule this is the
"makes current river ranges stronger → partial/risky" case: the correct fix is **not** to weaken the lift or
tune magnitudes, but to give it an off-corridor binding target — a **side-resource / patch-memory realism**
checkpoint — so realized support can fire in learned side niches too.

**Why HEAT does not shift (honest):** the realized lift is small/capped, clamped on surplus bands, damped on
crowded cores, and has NOTHING to bind to off-corridor (no side observed matched patches; `processingLearned`
still dormant) — so it only nudges corridor deficit bands and river economics still legitimately win. The
targeted check proves the *mechanism* is correct (deficit founder perCapitaReturn 0.20→0.25 with matched
skill; surplus clamped to no gain; out-of-footprint patch gives 0 realized / >0 projected).

**Prior checkpoints (still accepted): 2K.8** (learned skill → candidate-vs-current opportunity comparison,
decision-side, anti-sticky flip proven) and **2K.7** (learned skill → scout-target rank). 2K.9 adds the
realized-economics consumer those two deferred.

**Anti-sticky design (the addendum's core risk, handled):** learned skill accrues where a band already
forages, so a current-only support bonus would WORSEN corridor lock-in. 2K.8 avoids this two ways: (1) skill
is class-level and TRANSFERABLE — an observed side patch of a class the band learned in the corridor is
skill-matched, so the term lifts CANDIDATES, not just the anchor; (2) it is applied symmetrically in the
candidate-vs-current comparison and gated to fire only under low current return. Proven by
`--targeted-skill-opportunity-check`: with matching skill the chosen candidate flips from a richer river
tile to a poorer skill-matched SIDE tile; unrelated-class skill does nothing; a comfortable band is
byte-identical; a current-only match does NOT create an outward-winning candidate (no glue).

**Prior checkpoint (still accepted): 2K.7 — Bounded Skill → Effective Resource Rank Coupling v0** (Implemented
2026-06-14.) The FIRST behaviour-facing read of learned skill: a bounded, band-known learned-rank delta on
the patch-return view, consumed by the 2K.5 scout-target selection bias. Default maps byte-identical; NO
yield/CC coupling. (Superseded as "latest" by 2K.8, which adds the opportunity-comparison consumer.)

<!-- 2K.7 detail retained below for review context. -->

**What 2K.7 does (the diet-breadth hook):** a resource's value is not intrinsic to the tile — a lineage
that has *learned to exploit* a resource class should rank a KNOWN patch of that class a little higher.
`deriveObservedPatchReturn` now derives, from the band's OWN `exploitationSkill` for the patch's class, a

**What 2K.7 does (the diet-breadth hook):** a resource's value is not intrinsic to the tile — a lineage
that has *learned to exploit* a resource class should rank a KNOWN patch of that class a little higher.
`deriveObservedPatchReturn` now derives, from the band's OWN `exploitationSkill` for the patch's class, a
bounded `learnedRankDelta` / `learnedEffectiveRank` / `skillApplied` / `skillContributionReasons`:
competence lifts (`some` +0.03, `competent` +0.06); `processing_learned` resolves a still-
`processing_required_unknown` patch (larger but capped, ≤ +0.12); `confirmed_problem` penalises (−0.12);
medicinal/toxic and band-known-BLOCKED patches (not_exploitable / suspected_toxicity / avoided) get NO
positive lift (competence is never calories). The ONE consumer is `selectResourceScoutTarget`: the delta
folds into the SAME 2K.5 selection-only argmax bias (never `voiScore`), so learned skill reorders which
already-valid KNOWN patch a band re-observes/tests next — nothing else. Absent/zero skill → byte-identical.

**Anti-omniscience (hard rule, proven):** the delta exists only for a remembered patch, only for the
matching class, only from the band's own skill state; skill in another class produces a byte-identical,
no-flip selection (`--targeted-skill-rank-check` S4). Side-country probes (inferred existence-only tiles,
no patch memory) receive NO lift — skill never touches "all side land". Every contribution is recorded in
debug (`skillContributionReasons`).

**Diagnostic that shaped the design (don't read a dormant state):** at HEAT 500y, competence EXISTS but is
LOW — 3–5 bands/seed, maxCompetence ≤ 0.34 (so only the `some` band ever fires, never `competent`), and
`processingLearned`/`confirmedProblem` are 0. So the coupling deliberately keys on competence (the live
signal), not on processingLearned (dormant). Result: HEAT applies +0.03 to 36–71 known patches/seed; 2/3
seeds byte-identical, 1/3 (heat-2) shifts a live scout target → pop 606→583 (same 21 bands, same 40
fissions, 0 extinctions); founding distribution unchanged (pctSecondary [0.083,0.273], occupied 2 — the
heat-2 "necklace" label is a classifier threshold artifact, not real multi-region colonization).

**Prior checkpoint (still accepted): 2K.6B / INFO-1 — Proactive Resource Exploration v0** (Implemented
2026-06-13. ACCEPTED — the bridge that feeds 2K.6: stable bands proactively learn, so exploitation skill is
no longer ~zero in HEAT; bounded, no macro explosion, default maps byte-identical.) The information-seeking
half of the ecology spine.

**Why this bridge (academic frame):** humans inhabit diverse/marginal environments not from a "curiosity
gene" but because subsistence-embedded information-gathering has OPTION VALUE — foragers map their
landscape and learn to exploit resources BEFORE a crisis, not during one (the high-altitude record —
Bale mole-rats, Pucuncho camelid toolkits, Tibetan EPAS1 — shows occupation was resource/skill-driven and
made permanent over millennia, never wanderlust). 2K.6 built the learned-skill substrate but it stayed
unfed: stable bands almost never autonomously scout/test (they only learn under duress), so skill accrual
was ~0 and a future 2K.7 skill→yield coupling would couple to nothing. INFO-1 supplies the missing
proactive learning. (Modeled now: proactive info-gathering, seasonal/under-known discovery, feeding learned
skill. Future: risk-buffered SETTLEMENT — needs yield/storage; exchange networks — needs culture;
risk-tolerance trait variance — needs heredity; genetic niche adaptation — far future.)

**What it does:** a narrow, bounded PROACTIVE information motive. A STABLE band (foodStress < 0.5, mobility
pressure < 0.75 i.e. not urgently relocating, labor capacity ≥ 6, proactive cooldown elapsed) enters
`proactiveInfoMode` (computed deterministically in the scout context). In that mode `selectResourceScoutTarget`
relaxes its throttles ONLY for that band — a lower VOI floor + bypassed low-capacity gate + a floor
proactive value for a NOVEL known patch (higher floor if it is plant-bearing but its class is untested:
the diet-breadth "go learn to USE what I know is here") — so an under-known/under-used nearby patch becomes
a valid target. `buildResourceScoutCandidate` then adds a bounded boost + flags the reason
`isProactiveInfo`, so the residence-UNCHANGED resource_scout occasionally WINS over a comfortable stay and
runs the EXISTING scout→plant-test→2K.6-skill chain. A per-band `proactiveInfoMemory` cadence governor
(12-season cooldown; daughters reset) keeps it RARE. NOT random exploration, NOT migration (residence
unchanged), NOT a yield buff.

**Result (HEAT 500y×3, was 0 in 2K.6):** proactive actions **3–5 per seed**, **2–4 bands/seed**, and —
the headline — **2K.6 exploitation skill now accrues in HEAT** (3–5 bands/seed, mean competence 0.11–0.15;
processingLearned still 0 — competence accrues, processing-resolution needs more test volume / longer
stable phases). No extinctions, pattern unchanged (corridor_diffusion), no movement explosion. Bounded and
rare (HEAT is expansion-dominated, so this is the FLOOR; stable/saturated scenarios fire more). Default
**Map1 100y 327/9 (knownTiles 559) + Map2 50y 314/9 (642)** are BYTE-IDENTICAL to 2K.6 & deterministic —
the proactive scout does not fire in the short 50–100y default windows, so the delta is confined to long
runs where stable phases emerge.

**Anti-omniscience proof:** the proactive target is chosen by the existing VOI machinery over the band's
OWN patch memories + recent rings (no tile truth read); `proactiveInfoMode` is a pure function of the
band's own stress/labor/cadence; the scout is residence-UNCHANGED and only OBSERVES (real value learned by
visitation). NO resourceProfile/yield/support/CC/stress coupling — the only effect is more band-known
observation + 2K.6 skill (itself knowledge-only). Off-mode (`proactiveInfoMode !== true`) leaves
`selectResourceScoutTarget` byte-identical (every relaxation is guarded), preserving the 2K.5 selection
invariant and the default-map fingerprints.

**Safety / checks:** build green; static guards clean (0 `any` / 0 `Math.random` / 0 UI imports in
`src/sim`); **all 14 targeted suites PASS** (exploitation-skill, plant ×4, eligibility, scout, cause ×3,
patch-return ×2, lake/M0.9, frontier-drift, migration smoke); `--all --fast` **0 failures** (incl.
over_capacity_core / crowded scenarios — no explosion); Map1/Map2 deterministic & byte-identical to 2K.6;
HEAT smoke reproducible. `patchExploitationKnowledge` single-importer invariant intact. New band state
`proactiveInfoMemory` resets on fission (clone-guard entry). Architecture graph (`resourceKnowledge` node)
extended with INFO-1.

**Verdict: ACCEPTED — proactive learning works safely; the 2K.6 substrate is now fed.** Per the decision
rule (proactive learning works → recommend the skill→economic coupling), **recommended next: 2K.7 — bounded
skill → effective-rank coupling** (let `processing_learned` + competence raise a resource's band-known
effective rank in a strictly bounded/debug-gated way), so a side region a lineage has *learned to exploit*
finally becomes a real economic reason to settle off the corridor — closing the M0.16B loop. **Honest
caveat:** proactive volume is modest in expansion-dominated HEAT (3–5/seed) and processing-resolution has
not yet kicked in there; it scales with band stability (more in saturated scenarios). If 2K.7 shows skill
still doesn't move founding, the gap is yield realism, not learning. Do NOT start 2K.7 in this checkpoint.

**2K.6B / INFO-1 files:** `src/sim/agents/types.ts` (`ProactiveInfoCadenceState` + `proactiveInfoMemory?`
Band field); `src/sim/rules/types.ts` (`isProactiveInfo?` reason); `src/sim/agents/resourceScout.ts`
(`proactiveInfoMode` context flag + relaxed VOI floor / capacity gate / proactive use+general floors —
all off-mode byte-identical); `src/sim/rules/bandDecision.ts` (proactive eligibility in
`buildResourceScoutContext`, boost + flag in `buildResourceScoutCandidate`, `isAppliedProactiveInfo` +
cadence update, consts); `src/sim/agents/demography.ts` (daughter reset); `scripts/simBenchmark.mjs`
(proactiveInfo audit aggregate + funnel); `src/architecture/graphData.ts`; `docs/HANDOFF.md`.

---

**Prior checkpoint:** **2K.6 — Plant Processing / Exploitation Skill Scaffolding v0** (**Implemented
2026-06-13, awaiting review. ACCEPTED — first persistent learned-competence layer; knowledge-only,
macro behaviour byte-identical to M0.16B.**) Return from the M0.x movement detour to the ecology spine.

**Why this checkpoint (the academic frame):** M0.16B proved bands can now *see* and *scout* off-corridor
land, yet founders still pick the river because side land carries no economic advantage. Per the
diet-breadth model, a resource's value is NOT intrinsic — it is a function of LEARNED competence to
exploit/process it (acorns, bitter tubers, toxic seeds are inedible until processing is learned). So a
"poor" place is poor only to a band lacking the local skill; learned processing + cumulative local
knowledge (TEK) are how humans inhabit ALL environments, not just the richest. The missing CAUSE is a
learned exploitation-skill substrate — which 2K.6 builds (NOT the yield coupling, which is a later step).

**What it does:** new pure module `exploitationSkill.ts` + new band state `exploitationSkill` — a
persistent, bounded, anti-omniscient per-(ResourceClassId) learned competence distilled ONLY from the
band's OWN cautious use-test / cause-event experience (the existing capped rings). Each class carries
`competence` (0..0.8 — mastery 1.0 is EARNED later, asymptotic gain), `attempts`, `processingAttempts`,
`harmEvents`, and a `processingState` (`untested → suspected_processing → processing_learned |
confirmed_problem`). Accrual (pure `advanceExploitationSkill`): informative tests build competence;
≥3 non-harmful processing attempts RESOLVE the 2K.4 processing suspicion to `processing_learned`;
repeated harm → `confirmed_problem` (no competence gained on harm). Written at the EXACT hook where the
plant-use-test ring is appended (`bandDecision.ts`), so it accrues whenever (and only when) a test fires.
**Inherited DEGRADED on fission** (`degradeInheritedExploitationSkill`: competence ×0.5, `processing_learned`
re-earned as `suspected_processing`, `confirmed_problem` kept as caution) — cultural transmission per the
"daughters inherit knowledge partially/degraded" invariant, so a LINEAGE accumulates local competence
(the TEK mechanism) while a daughter never perfect-copies it.

**HARD SCOPE LOCK (knowledge-only, the 2K.4 strongest no-coupling guarantee):** nothing here feeds
effectiveYield / carryingCapacity / perCapitaReturn / food / support / stress / mortality / population /
relocation / fission economics / movement scoring / storage. The skill is surfaced ONLY as new
REPORTING fields on `ObservedPatchReturn` (`learnedProcessingState`, `learnedCompetence`) that are read
by NO decision/selection — the 2K.5 scout-selection bias still reads only the unchanged readiness/risk
categories. So macro behaviour is **byte-identical to M0.16B** (Map1 100y **327/9** knownTiles 559, Map2
50y **314/9** knownTiles 642 — both deterministic ×2, exactly the M0.16B baseline; the skill state is not
in the fingerprint and nothing reads it for behaviour). No `Math.random`, no `any`, no UI imports.

**Verification:** new `--targeted-exploitation-skill-check` — **12/12** assertions (competence grows
monotone + capped below mastery; informative stays untested; processing suspicion resolves to learned;
repeated harm confirms a problem; no competence on harm; fission halves competence + downgrades
processing_learned + keeps confirmed_problem; determinism; summary). Build green; **all 13 targeted
suites PASS** (incl. patch-return ×2 after the derived-view change, plant ×4, cause ×3, scout, lake
(M0.9), frontier-drift); `--all --fast` **0 failures**; Map1/Map2 byte-identical to M0.16B & deterministic;
static guards clean (0 any / 0 Math.random / 0 UI imports in src/sim); `patchExploitationKnowledge`
single-importer invariant still holds (resourceScout.ts only). `exploitationSkill` daughter-reset is
DEGRADED (clone-guard satisfied via a fresh object). Architecture graph: `resourceKnowledge` node summary
extended with 2K.6 (living-map current).

**Honest limitation (NOT a 2K.6 defect):** in-vivo accrual is GATED by the pre-existing **dormant
autonomous plant-test trigger** — HEAT single-origin runs fire ~0 autonomous tests, so the HEAT skill
aggregate reads 0; skill accrues in scenarios that DO fire cautious tests (e.g. over_capacity_core /
crowded_delta_saturation, which the patch-return audits show firing tests) and in the live-risky-scout
path. The scaffolding + accrual logic is proven by the unit suite and is wired to the exact (proven)
test-ring trigger; making the trigger fire more autonomously is upstream future work.

**Verdict: ACCEPTED — the learned-exploitation-skill substrate exists, is safe, anti-omniscient, lineage-
cumulative, and behaviour-neutral.** It is the precondition the roadmap was missing: a band/lineage can
now represent "we have learned to process the thing that grows here." **Recommended next:** the explicit,
bounded **skill → effective-rank coupling** (call it 2K.7) — let `processing_learned` + competence raise a
resource's band-known effective rank in a STRICTLY bounded / debug-gated way, so a side region a lineage
has learned to exploit finally becomes a real reason to settle off the corridor (closing the M0.16B loop).
Keep this knowledge-only until that checkpoint is explicitly scoped.

**2K.6 files:** NEW `src/sim/agents/exploitationSkill.ts`; `src/sim/agents/types.ts` (`exploitationSkill?`
Band field); `src/sim/rules/bandDecision.ts` (skill writer at the test-ring hook); `src/sim/agents/
demography.ts` (degraded daughter inheritance + clone-guard entry); `src/sim/agents/
patchExploitationKnowledge.ts` (optional skill input + reporting-only `learnedProcessingState`/
`learnedCompetence` fields); `scripts/simBenchmark.mjs` (suite + HEAT skill aggregate);
`src/architecture/graphData.ts` (node summary); `docs/HANDOFF.md`.

---

**Prior checkpoint:** **M0.16B — Off-Corridor Knowledge Consumption v0** (**Implemented 2026-06-13,
awaiting review. ACCEPTED (mechanism sound, safe, modestly positive) — but regional FOUNDING stays
corridor-dominated → river dominance is realistic → recommend returning to 2K.6.**)

**What it does:** opens the CONSUMPTION path M0.16 left closed. M0.16 formed abundant off-corridor side
beliefs but they were behaviourally inert (the M0.7 probe gate rejected every corridor band; side-probe
wins = 0; HEAT byte-identical). M0.16B adds a narrow opt-in `buildSideCountryProbeCandidate`: a settled
band may OCCASIONALLY spend a residence-UNCHANGED `logistical_probe` to OBSERVE its inferred off-corridor
side land (existence belief → real KnownTileRecord). It targets ONLY `off_corridor_side_inference` tiles
(new side-source finder), routes the value through the principled `explorationValue` channel (calibrated
2.5 — wins vs a comfortable stay, loses to expansion/refuge moves), is hard-gated only by SEVERE food
stress (intent is NOT a gate — a residence-unchanged probe is compatible with holding an expansion
intent; HEAT bands perpetually carry strong intent, so gating on it blocked everyone), and is bounded by
a 16-season cooldown + a 12/band lifetime cap + `sideProbeMemory` cadence state (daughters reset). NOT a
relocation, NOT a migration force, NO richness in the score.

**Result (HEAT-1 500y×5, M0.16 → M0.16B, same seeds):** side probes now FIRE — **182 wins across 5 seeds
(23–50/seed), all 5 seeds, 8–16 bands each** (M0.16 = 0). Behaviour diverged (all 5 fingerprints changed;
same-seed reproducible be30a7c5 ×2; 5/5 distinct). Off-corridor spread rose modestly: **mean pctSecondary
0.082 → 0.142**, **mean river-corridor share 0.918 → 0.858** (h1 0.905→0.727, h5 0.955→0.739 notably).
**The necklace failure (h4) was ELIMINATED** (→ corridor_diffusion). BUT multi-region FOUNDING did NOT
robustly improve: patterns went `{3 corridor / 1 multi(h2) / 1 necklace(h4)}` → `{4 corridor / 1
multi(h5) / 0 necklace}` — **net multi-region still 1/5** (h2 LOST its second region as h5 GAINED one — a
reshuffle, not a gain; h2 pop 689→606). Side observation rose only slightly beyond incidental (mean 198.8
→ 204.4). No collapse (0 extinctions every seed; pops 574–701), reproducible, divergent.

**Interpretation (decision-rule branch):** side probes produce observed side land, and descendants do
spread off-corridor somewhat more (necklace gone, river share down, pctSec up), but bands still
overwhelmingly prefer the corridor (86% river share; multi-region stuck at 1/5). This is the checkpoint's
**"side observation improves but founding does not → river/corridor economics legitimately wins"** branch:
the observed off-corridor land is genuinely not good enough to found on. Only real side RESOURCES (the
plants / 2K.6 track) would give a founder an economic REASON to settle off the corridor — knowledge and
movement levers are now exhausted (M0.15 timing ✗ reverted; M0.16 knowledge ✓ but inert; M0.16B
consumption ✓ but founding still corridor-bound).

**Anti-omniscience proof:** a side-probe target is chosen by id-ordered bounded BFS over band-known tiles
to the nearest `off_corridor_side_inference` tile; the score has NO food/water/yield from the inferred
tile (only `explorationValue` + low memoryConfidence + route/risk COST); the probe is residence-UNCHANGED
and only OBSERVES (real value learned by visitation, never inferred). No `resourceProfile` read anywhere.

**Safety / checks:** build green; static guards clean (0 `any` / 0 `Math.random` / 0 UI imports in
`src/sim`); Map1 100y **327/9** + Map2 50y **314/9** deterministic ×2 (EXPECTED deltas — side probes now
fire on the default maps too: Map2 knownTiles 608→**642** from side scouting; no collapse); lake (M0.9) +
frontier-drift + patch-return + scout + plant×4 + cause×3 suites PASS; migration smoke clean; HEAT-1
same-seed reproducible + 5/5 distinct. No truth-richness leak, no movement explosion (probe volume
cooldown/cap-bounded: ≤12/band, ~0.03 probes/band/season), no forced migration.

**Verdict: ACCEPTED as a sound, safe consumption mechanism with a modest positive (necklace eliminated,
off-corridor spread up).** The deeper regional-founding goal remains blocked by REALISTIC river dominance,
not by a missing mechanism. **Recommended next: return to 2K.6 (plants / side-resource ecology)** — give
off-corridor land real, learnable RESOURCE value so founders have a causal reason to settle it. Do NOT
pursue further movement/knowledge migration levers (exhausted). Keep M0.16 + M0.16B (net-positive, safe).

**M0.16B files:** `src/sim/agents/types.ts` (`SideProbeCadenceState` + `sideProbeMemory?` Band field),
`src/sim/rules/types.ts` (`isSideCountryProbe?` reason + alternative metadata), `src/sim/rules/
bandDecision.ts` (`buildSideCountryProbeCandidate` + `findReachableSideProbeTarget` + opt-in registration
+ cadence update + `isAppliedSideCountryProbe` + consts), `src/sim/agents/demography.ts` (daughter reset),
`scripts/simBenchmark.mjs` (side-probe win/eligibility counters), `docs/HANDOFF.md`.

---

**Prior checkpoint:** **M0.16 — Off-Corridor Knowledge Formation v0** (**Implemented 2026-06-13,
awaiting review. PARTIAL — knowledge substrate landed cleanly & safely; regional founding UNCHANGED.**)

**What it does:** adds **Stage 3** to `advanceFrontierShorelineKnowledge` — the PERPENDICULAR analogue of
M0.12's along-corridor chain. A band that has walked a channel corridor (≥4 observed corridor tiles) now
infers the EXISTENCE of off-VALLEY side land within `SIDE_REACH_DISTANCE=2` of the river-valley apron
(channel corridor + near-water margin), grown off its observed corridor/margin tiles + inferred
corridor/side tiles, capped (2/season, 64/band), TTL-decayed (60 ticks), id-ordered, existence-only. New
source `off_corridor_side_inference`. Anchoring reach to the VALLEY (not the bare channel) was essential:
along a wet river ALL land within 2 of the channel is also near-water margin (Stage 1's domain), so the
genuine side-country (side valleys/plains/basins) begins just BEYOND it — the bare-channel predicate
(initial draft) formed 0 tiles on wet rivers. Consumed ONLY by the existing source-agnostic M0.7 settled
probe; the M0.8 relocation goal-loop explicitly skips the new source (one-line filter) so side beliefs
never bias a movement heading.

**Result (HEAT-1 500y×5, before→after, SAME seeds, fresh same-session control):** off-corridor INFERENCE
forms abundantly — **741–1203 side tiles/seed, 16–21 of ~18–23 bands** carry side beliefs (was 0 by
construction). BUT every spatial/demographic outcome is **byte-identical** before→after — all 5
fingerprints match EXACTLY (a0d08466 / 41942183 / 15394099 / b6e6b189 / 86a5e0e2); patterns unchanged
(**3 corridor_diffusion / 1 multi_region (h2) / 1 necklace (h4)**); river-corridor share **91.8%**;
mean pctSecondary **0.082**; maxDist/occupied/fissions/extinctions all identical. **Side inference is
behaviourally INERT.**

**Why inert (blocker classified):** the inferred side knowledge does not flow into behaviour. Its only
behavioural consumer is the M0.7 settled-idle probe, whose gate effectively never fires on a side tile
under corridor-rich HEAT conditions (expanding/frontier-holding bands are gate-excluded; for settled
bands the low-confidence existence probe loses to the rich corridor's stay/forage). Proven by the
byte-identical 500y trajectories: **no side-driven probe ever won selection (side-probe WINS = 0)**. The
~174–250 observed side tiles/seed are the SAME incidental observations bands always made walking the
valley edge — NOT new probe-driven conversions. Underneath, off-corridor ecology is genuinely poorer
(HEAT-1 + M0.15 finding), so even side land bands DO observe never beats the corridor for founding.
**Primary blocker: probe/movement candidate gate ignores inferred side land. Secondary: river ecology
legitimately dominates / founder economics prefers the corridor.**

**Anti-omniscience proof:** a side record stores ONLY existence + topology + provenance
(`isNearWaterMargin:false`, `confidence:0.2`, `noOmniscientRichness:true`); candidate selection reads
ONLY terrain/passability/valley-proximity (memoized static topology), NEVER `resourceProfile`; the M0.7
probe that would consume it adds NO yield to its score. "There is passable side land there" — never "it
is rich/good". Real value is learnable only by visitation.

**Safety / checks:** ZERO regression. Map1 100y **328/9/4** + Map2 50y **314/9** byte-identical &
deterministic ×2 (knownTiles 565/608 unchanged → no behavioural leak onto the regression maps); build
green (tsc+tsc.node+vite); static guards clean (0 `any` / 0 `Math.random` / 0 UI imports in `src/sim`);
lake (M0.9) + frontier-drift + patch-return×2 + scout + plant×4 + cause×3 suites PASS; migration smoke
clean; HEAT-1 same-seed reproducible (a0d08466 ×2) + 5/5 distinct fingerprints + all 6 prior acceptance
gates unchanged. No graph change (no architecture nodes touched).

**Verdict: PARTIAL — substrate accepted, behaviour unchanged.** The M0.15-identified missing piece
(legal, bounded, anti-omniscient off-corridor knowledge) now EXISTS, safely and reproducibly, with no
truth-richness leak and no movement explosion. It does not yet move regional founding because the
CONSUMPTION path is closed. **Recommended next: smallest M0.16B (consumption-only)** — cautiously let a
settled corridor band send the residence-UNCHANGED M0.7 probe to its inferred side land even when a
decent corridor stay exists (a pure INFORMATION action — observe without relocating, NOT forced
migration), so inference converts to real observation and founders can legally compare REAL side-region
value; then re-run HEAT-1. If founders STILL prefer the corridor once side land is actually observed,
conclude river dominance is realistic and **return to 2K.6**. Do NOT force migration. Do NOT start 2K.6.

**M0.16 files:** `src/sim/agents/types.ts` (`FrontierKnowledgeSource` +1), `src/sim/agents/
frontierKnowledge.ts` (Stage 3 + exported `isWithinSideReachOfCorridor` predicate + 4 consts + TTL +
side counting), `src/sim/rules/bandDecision.ts` (M0.8 goal-loop side-source filter — behaviour-preserving
no-op on pre-M0.16 worlds), `scripts/simBenchmark.mjs` (off-corridor audit metrics — additive only),
`docs/HANDOFF.md`.

---

**Prior checkpoint:** **M0.15 — Anti-Linear Regional Founding (ATTEMPTED → REVERTED, negative
result)** (2026-06-13). Behaviour change tried and **reverted** because it did not work and slightly
regressed. Sim is byte-identical to pre-M0.15 (Map1 100y 328/9, Map2 50y 314/9 restored exactly). The
HEAT-1 audit infrastructure stays. **This is a recorded finding, not a landed feature.**

**What was tried:** founder-journey establishment gating — a founder daughter's intent was held alive
(no decay) until it reached "distinct, uncontested, viable" ground (band-known: distance ≥10 from its
own spawn origin + local crowding ≤0.12 + own observed water ≥0.3), so it would not settle in the
first acceptable corridor tile and would instead found a distinct region; low-crowding gate as the
anti-necklace mechanism; hard 48-tick journey cap. Causal, band-known, no truth/hidden target.

**Why it FAILED (HEAT-1 500y×5, same seeds, before→after):** multi-region seeds **2/5 → 1/5**;
`descendants_leave_origin_region` true → **false**; river-corridor share unchanged (~80% mean); one
seed's river share rose to 95%; h4 **collapsed 22→10 bands**. Root cause: **the corridor IS the
legitimate best path** (lowest movement cost, best water, and the ONLY band-known land — M0.12
corridor-continuation inference extends knowledge ONLY along corridors). Keeping founders mobile
longer just makes them ride the corridor further; they have no band-known off-corridor region to walk
toward, and delaying settlement also depresses their growth/fission (the h4 collapse). Delaying
settlement cannot create regional founding — the band needs a real REASON to leave the corridor.

**Precise blocker (for the next checkpoint):** regional founding is gated by KNOWLEDGE, not movement
timing. Descendants only ever form knowledge of corridor land (M0.12), and off-corridor land is
drier/poorer/higher-movement-cost, so ecology correctly keeps them on the river. The legitimate fix is
**off-corridor knowledge formation** (a band on a corridor should sometimes infer/scout the existence
of adjacent off-corridor land — a perpendicular analogue of M0.12), giving founders a band-known
distinct region to target WITHOUT truth richness or a hidden "go to green" pull. That is a KNOWLEDGE
checkpoint (call it M0.16), not a movement hack. Tuning M0.15 thresholds will not help (the issue is
"nowhere band-known to go," not "settles too soon").

**M0.15 verdict:** corridor dominance is partly REALISTIC (rivers genuinely were prehistoric migration
highways and population concentrators), and HEAT-1 already PASSED its formal gates (0/5 necklace, some
multi-region, divergent, reproducible). So this is not a blocker that must be solved before content —
it is a "feel" refinement deferred to M0.16 (off-corridor knowledge) IF richer multi-region spread is
wanted later.

---

**Prior checkpoint:** **HEAT-1 — One-Origin Migration Heat Test / Regional Colonization Audit**
(**Implemented 2026-06-13, awaiting review.** AUDIT-ONLY — zero sim behaviour change; only
`scripts/simBenchmark.mjs` gained a command + two module loads. Map1/Map2 fingerprints byte-identical.)

**Question answered:** can ONE founding band produce descendants inhabiting multiple distinct regions
over centuries? **Verdict: PASS (with an honest caveat).** New command
`--targeted-one-origin-heat [--heat-years N] [--heat-seeds "a,b,..."]` spawns the single Origin Band
on Map 2 (river valley (108,54)), runs across seeds, and classifies each run as `multi_region_founding`
/ `corridor_diffusion` / `necklace_or_single_chain` / `local_cluster` via: occupied catchments,
single-linkage clusters (≤8 tiles), regional clusters (catchments ≥2 bands), secondary-region pockets,
max distance from origin, eco-zones occupied, % in origin region. The necklace failure mode (the user's
~924y even-spaced line) is explicitly detected: a single connected cluster spanning >20 tiles with no
distinct-region pockets.

**500y × 5 seeds (h1-h5):** same seed reproducible (h1 twice identical); **5/5 seeds distinct
fingerprints**; **0/5 necklace**; **2/5 multi_region_founding** (h2/h4 — descendants across
river_corridor + open_plains + delta_estuary, 3-4 eco zones, 27-35% in secondary regions); **3/5
corridor_diffusion** (h1/h3/h5 — spread FAR, maxDist 67-104, in 3-7 distinct clusters/pockets, but
60-92% of bands stay in the river_corridor catchment). maxDist range 67-126; occupied catchments 2-3;
fissions 34-50; ZERO extinctions. ALL six acceptance gates true (reproducible / diverge / some
multi-region / not-all-necklace / leave-origin-region / multiple-eco-zones).

**Honest diagnosis:** the feared thin-necklace line does NOT occur (bands form multiple pockets, not an
even chain), and the M0.11-M0.14 + VAR-1 chain genuinely produces divergent, sometimes-multi-region
colonization. BUT robust multi-region founding is seed-dependent (2/5), not reliable — the **river
corridor remains the dominant attractor** (it is the richest connected habitat; bands follow it and
mostly cluster along it). So: line failure avoided, region founding present-but-not-dominant.

**HEAT-1 files:** `scripts/simBenchmark.mjs` only (new `runOneOriginHeatTest` + `computeHeatMetrics` +
helpers + `spawnSingleOriginBand`/`hashSeedString` module loads). No `src/sim` change.

**Equivalence/checks:** Map1 100y + Map2 50y byte-identical to pre-VAR-1; worker-runner vs direct
byte-equal (legacy + seeded); migration smoke byte-identical; `--all --fast` 25/25; guards clean;
graph 164/403. (1000y × 2 deep sample running at writing — refines, does not change the verdict.)

---

**Prior checkpoint:** **VAR-1 — Deterministic Seed Variability v0**
(**Implemented 2026-06-13, awaiting review.** Reproducibility rule CHANGED: now per-(map, runSeed);
legacy default (no runSeed) is byte-identical to all prior baselines.)

**What it does:** the sim was one deterministic movie per map (nothing consumed a seed). VAR-1 adds a
separate **`runSeed`** (numeric hash on WorldState, DISTINCT from the terrain `seed`) that injects a
tiny deterministic seeded JITTER at near-tie decision points only — so different runs produce
different plausible migration/fission/path histories, while a given seed is exactly reproducible.

**Architecture (`src/sim/core/seededVariation.ts`):** pure integer hashing (FNV-1a + Math.imul mixing,
no Math.random/clock). `seededTieBreakJitter(runSeed, [tick, bandId, candidateKey]) → signed
[-0.5,0.5)`, scaled by a small epsilon and ADDED to a candidate's score before the existing
score-desc sort. Applied at TWO points: (1) movement candidate selection (`sortCandidatesWithSeeded
TieBreak` in bandDecision.ts, ε=0.06) and (2) fission daughter-target selection
(`compareFissionTargetsSeeded` in demography.ts, ε=0.08). ε ≪ typical score gaps, so a clear winner
NEVER flips — only genuinely-close candidates reorder per seed (ecology still decides, the seed breaks
the ties ecology left open). **`runSeed === undefined` → zero jitter → exact legacy behaviour.**

**Legacy/default decision:** default map loads and ALL test/audit/benchmark paths set NO runSeed →
byte-identical to pre-VAR-1 (Map1 100y 328/9, Map2 50y 314/9 unchanged; migration smoke byte-identical;
lake audit on default seed passes). Baselines preserved, not destroyed. The UI seed input now actually
affects history (a "Run seed" field + "Apply Seed" + "🎲 New History" button reload the current map
terrain with a fresh run seed).

**VAR-1 audit results (120y):** same seed twice → IDENTICAL fingerprint (both maps, REPRODUCIBLE);
4 different seeds → 4 distinct fingerprints with varying spatial outcomes — Map1 catchment occupancy
delta 7-8 / plains 1-3 / west 1-2, bbox 5100-5974; Map2 lake 5-6 / dry 0-1 / plains 5-6, occupied
catchments 3-4, bbox 8556-9620. BOUNDED: band count (10-11 / 13-15) and population (382-386 / 461-476)
barely move — ecology dominates the macro outcome, the seed only varies WHERE/which-path. Meaningful
but not chaotic. Divergence is modest at 120y and compounds over long / single-origin runs (HEAT-1
will exercise that).

**Equivalence proof:** legacy Map1 100y + Map2 50y byte-identical to pre-VAR-1; worker-runner vs direct
byte-equal for legacy AND seeded runs (reproducible + snapshot-merge); migration audit 50y
byte-identical; fingerprints unchanged; lake + frontier-drift + patch-return 13/13 + scout 6/6 + plant
9/7/8/9 + all cause/dispersal/natural-risk pass; `--all --fast` 25/25; guards clean (0 any, 0 UI
imports in src/sim; the one Math.random hit is a comment); graph 164/403.

**VAR-1 files:** NEW `src/sim/core/seededVariation.ts`; `src/sim/world/types.ts` (`runSeed?` field);
`src/sim/rules/bandDecision.ts` (movement tie-break); `src/sim/agents/demography.ts` (fission
tie-break); `src/sim/runner/simRunner.ts` (runSeed param); `src/worker/simWorker.ts` + `src/ui/
simBridge.ts` (thread runSeed); `src/ui/App.tsx` (run-seed UI); `docs/HANDOFF.md`.

---

**Prior checkpoint:** **PERF-3 — Data-Oriented Tick Pipeline / 1000y Readiness Pass**
(**Implemented 2026-06-13, awaiting review.** Performance only — sim behaviour PROVEN byte-identical
to pre-PERF-3 on both maps at 50y + 100y.)

**Finding (honest):** after PERF-2, tick cost is genuinely DIFFUSE — top CPU leaf is 7.6% (the
per-band context lambdas), then frontier knowledge ~9% (scan memoized in PERF-2; the residual is the
prune + candidate-set rebuild), GC ~4%, resource-knowledge inference ~3.5%, crowding ~6%. The big
structural levers are NOT safely reducible: the 3 range-saturation passes run on genuinely different
inputs each pass (pre=pre-move, post=post-move feeds demography, final=post-demography carries
returnTrend + is read by audits), and `observedTiles` is re-allocated every tick (lastObservedAt
timestamps are read by memory compression → behaviour, so cannot be frozen), which defeats
memoization keyed on it and is the root allocation churn. Skipping/fusing any pass changed audit
outputs → NOT merged (per the stop rule).

**Merged optimization (byte-identical):** `getNearbyActiveBandIdsForTile` is a pure function of
`(tileId, radius)` for a given spatial index, but was recomputed ~9× per band per tick (nearbyBands
build + local population estimate + local band count, × 3 context passes). Now memoized on the index
(`nearbyByTileRadius` map keyed `tileId:radius`); repeated queries for the same tile reuse the cached
sorted list. **1.10× tick-cost reduction** (200y Map 1, clean back-to-back: 48.5 → 44.2 ms/tick),
**~1.39× cumulative over PERF-1**. Byte-identical: same sorted array, callers only read it.

**NOT merged (reported, reverted/avoided):** pass fusion / final-pass opportunity-scan skip (audits
read final-pass `daughterColonization`/`rangeSaturation` → changes outputs); observedTiles
churn-freeze (lastObservedAt is behaviourally read); frontier-prune radius-limiting (probe
observations reach radius 4 → fragile, risk of missing a drop). None hidden as "acceptable drift."

**Benchmark (deterministic; absolute ms carries desktop-load noise — the 1.10× is the clean
back-to-back relative figure): Map1 100y 9 bands; 500y 36 bands 147ms total 293s (~5min); 1000y
36 bands 198ms total 791s (~13min); Map2 300y 36 bands 70ms (84s), 500y 107ms (215s, ~3.5min —
Map2 ticks CHEAPER than Map1, good since Map2 is the main migration test).** Band count PLATEAUS ~36
(world fills; saturation/depletion cap growth); per-tick cost still creeps up slowly even at constant
band count as per-band memory/depletion state grows (max tick 460→550 over 500→1000y). Worst-tick
spikes (~550ms) occur in the WORKER, so the UI never freezes. **500y practical (~3.5-5min); 1000y runs
but slow (~13min) — fine for an occasional deep test, not rapid iteration.** Tick cost ~N^1.8 in bands
+ slow state-growth creep; the empire-era answer is aggregation, not more micro-opt (Scaling Strategy).

**HEAT-1 prep (report-only, behaviour NOT tuned to these):** the migration audit now emits a
`migrationPrep` block per map — occupiedCatchments, per-catchment band counts, bounding-box area,
mean pairwise distance, maxDescendantDistanceFromOrigin, newCatchmentFounders, outwardDispersals, and
a `patternHint` (multi_region_founding / corridor_diffusion / local_cluster). Ready for HEAT-1 to
formalize the one-origin colonization test.

**Equivalence proof:** Map1 50y+100y, Map2 50y byte-identical to pre-PERF-3; worker-runner vs direct
byte-equal both maps; snapshot-merge view byte-equal; migration audit 50y identical on all pre-existing
fields (migrationPrep is purely additive); fingerprints unchanged (Map1 328/9/4, Map2 314/9/0); lake +
frontier-drift + patch-return 13/13 + scout 6/6 + plant 9/7/8/9 + all cause/dispersal/natural-risk
pass; `--all --fast` 25/25; guards clean (0 any, 0 UI imports in src/sim); graph 164/403.

**PERF-3 files:** `src/sim/agents/contextCache.ts` (nearby-tile memo on the spatial index),
`scripts/simBenchmark.mjs` (migrationPrep metrics — additive), `docs/HANDOFF.md`. No sim-rule change.

---

**Prior checkpoint:** **PERF-2 — Tick-Cost Reduction / Long-Run Speed Pass**
(**Implemented 2026-06-13, awaiting review.** Performance only — sim behaviour PROVEN byte-identical
to pre-PERF-2 on both maps.)

**Three byte-identical memoizations** (each a pure derivation cached on an immutable input object, so
reuse cannot change outputs): (1) **observed-frontier classification** — `advanceFrontierShoreline
Knowledge` re-scanned 200+ known tiles per water-adjacent band per tick to find margin/corridor tiles;
now memoized on the band's `observedTiles` object (`classifyObservedFrontierTiles`, preserves
`Object.keys` order). (2) **salient memory summary** — was rebuilt 3× per tick per band in the 3 cache
builds; now memoized on `placeMemory` + validated refs (observedTiles/travelCorridors/position), so
the final + next-tick-pre passes reuse it (cache-build phase 2.9ms → 0.25ms). (3) `deriveBaseHabitat
Potential` was already memoized. **Result: 1.26× tick-cost reduction** (150y Map 1: 75.8 → 60.3
ms/tick, same session).

**Render decoupling (UI, fixes user's "bands move once every few ticks"):** measured — bands change
position 93% of ticks, so the jerkiness was NOT sim behaviour; it was React batching rapid worker
overlays and dropping intermediate positions before paint. `WorldCanvas` no longer renders via React
selectors on high-frequency state; it imperatively subscribes to the store and paints the LATEST
snapshot via a `requestAnimationFrame` loop (dirty-gated, so idle/paused costs nothing). Map moves
smoothly at display rate regardless of tick rate; no React reconciliation per overlay.

**Benchmark (after PERF-2, this machine, deterministic): Map1 100y 9 bands 24ms/tick (10s/century);
200y 22 bands 44ms (18s/century); 300y 36 bands 86ms max 392ms (34s/century); Map2 300y 36 bands 93ms
max 431ms (37s/century).** Product target (~1 sim-century/real-minute, nomad era) MET up to ~36 bands.
Worst-tick spikes (~400ms) now occur in the WORKER, so the UI never freezes (PERF-1+2 combined). Tick
cost still grows ~N^1.8, so 50+ band late-game (full 1000y) remains slow → PERF-3 / aggregation.

**Equivalence proof:** Map1 100y + Map2 50y byte-identical to pre-PERF-2 outputs (timing excluded);
worker-runner vs direct stepping byte-equal both maps; snapshot-merge view byte-equal; migration audit
50y byte-identical; fingerprints unchanged (Map1 328/9/4, Map2 314/9/0); lake + frontier-drift +
patch-return 13/13 + scout 6/6 + plant 9/7/8/9 + all cause/dispersal/natural-risk suites pass;
`--all --fast` 25/25; guards clean (0 any, 0 UI imports in src/sim); graph 164/403.

**PERF-2 files:** `src/sim/agents/frontierKnowledge.ts` (classification memo), `src/sim/agents/
contextCache.ts` (salient-summary memo), `src/ui/WorldCanvas.tsx` (rAF render decoupling),
`docs/HANDOFF.md`. No new sim rules; no movement/demography/yield/depletion change.

**Remaining bottlenecks (PERF-3 scope):** cost is spread (no single >6% hotspot) — characteristic of an
object-heavy deep-reasoning sim. Biggest remaining: the 3 per-tick context passes (range saturation
×3 ≈ 18ms, frontier-opportunity candidate rebuild ≈ 8ms), movement candidate generation (~8.7ms), GC
churn (~3.6%, big array spreads in frontier candidate building). PERF-3 = data-oriented/typed-array
state, proven reduction of the 3 passes, array-spread elimination. Beyond that, the band→settlement
AGGREGATION strategy flattens the N^1.8 curve for the empire era.

---

**Prior checkpoint:** **PERF-1 — Sim Worker + First Performance Architecture Pass**
(**Implemented 2026-06-12, awaiting review.** Performance architecture only — sim behaviour PROVEN
byte-identical.)

**Architecture:** the sim now runs in a **Web Worker** (`src/worker/simWorker.ts`) that owns the
authoritative world and advances it off the browser main thread. All sim work goes through the new
pure runner `src/sim/runner/simRunner.ts` (`initSimWorld`/`stepSim`/`resetSimTime` +
`takeDynamicSnapshot`/`mergeDynamicSnapshot`) — the same functions the node-side equivalence proof
exercises. The worker posts only the DYNAMIC world (bands/time/decisions/decisionArchive/
tileDepletion/climateStress), throttled to ≥150ms between snapshots; the main thread
(`src/ui/simBridge.ts`) keeps a deterministic STATIC twin built locally (instant first frame; the
tiles reference stays stable so every render cache keeps working) and merges snapshots into the
store. App play/pause/speed/step/reset/map-switch all translate to worker messages; a main-thread
fallback path (same runner functions) covers environments without Worker. UI consequence: season
ticks NEVER block paint/input — the prior stutter mechanism (App setInterval → advanceWorldOneSeason
on the main thread) is gone; at high band counts the sim may lag the requested cadence but the page
stays responsive.

**Behaviour-identical perf fix:** `getTileAtCoord` now uses a flat per-tiles-record grid index
(WeakMap) instead of building a `tile:x:y` string key per call — same Tile references, zero lookup
allocation. Measured: heavy-end tick 82→70.6ms (~14% at 31 bands); trajectory 21/29/39/52/71ms at
5/9/14/22/31 bands (heap stays ≤92MB at 250y — memory is NOT a constraint).

**Proofs (required):** runner-vs-direct 50y **byte-equal on both maps** (node, JSON-identical);
snapshot-merge view byte-equal to the full world (the UI sees the truth); Map 1 100y and Map 2 50y
**byte-identical to pre-PERF-1 outputs** (timing fields excluded); 50y migration audit byte-identical;
lake-opportunity + frontier-drift-scale + patch-return 13/13 + scout/plant/cause suites all pass;
`--all --fast` 25/25; static guards clean (src/sim has no UI imports; the worker lives in src/worker);
fingerprints unchanged (Map 1 328/9/4, Map 2 314/9/0).

**PERF-1 addendum — snapshot-pipeline fix (user follow-up "why still lagging if RAM is low"):**
measured: by year 250 the full dynamic snapshot reaches **~18MB serialized; structuredClone ≈ 260ms
PER SIDE** — posting it every 150ms was the remaining late-game lag (the worker stalled while
cloning, the main thread stalled while receiving). Fix: TWO-TIER updates — a **~4.5KB live overlay**
(clock + band markers + header counts; clone ≈ 0.16ms) flows every tick via
`takeLiveOverlay`/`store.liveOverlay`, while FULL snapshots flow at most every 2.5s and always on
pause/step/init (inspection panels are exact whenever the user is actually looking). Band markers,
clock and header counts read the overlay when it is fresher than the world; selected-band debug
layers update at full-snapshot cadence. ~1,600× less data on the per-tick path.

**PERF-1 files:** NEW `src/sim/runner/simRunner.ts`, `src/worker/simWorker.ts`, `src/ui/simBridge.ts`;
`src/ui/App.tsx` (bridge wiring + overlay header counts); `src/ui/WorldClock.tsx` + `src/ui/WorldCanvas.tsx` + `src/store.ts` + `src/render/canvasRenderer.ts` (live-overlay consumers); `src/sim/world/generate.ts` (tile grid memo);
`docs/HANDOFF.md`. Benchmark/node paths untouched.

**Remaining hotspots (PERF-2 scope if needed):** aggregate per-band context work (3× context passes,
salient-memory builds, footprints) gives ~N^1.8 tick growth — at 60+ bands ticks will exceed Long Sim
cadence (sim slows, UI stays smooth). PERF-2 = incremental single context pass + numeric tile ids in
remaining hot loops + encounter/crowding field consolidation.

---

**Latest checkpoint:** **M0.14 — Persistent Local Depletion / Regeneration v0**
(**Implemented 2026-06-12, awaiting review.** FIRST mutable per-tile world state — max-effort
architecture checkpoint. The M0.11 complement: crowding is instantaneous competition; this is
accumulated ecological WEAR.)

**Model (`src/sim/world/depletion.ts`):** sparse `WorldState.tileDepletion` (optional record, entries
< 0.005 dropped; NEVER on the tiles record — caches key on its reference). Advanced once per season —
in BOTH the main pipeline and the benchmark's fast mode (before the contextFinal branch) — from the
tick's MEMOIZED 2J.1 shared-catchment claim index (the per-tile extraction that actually happened;
zero extra index builds). `d′ = d + 0.0008·claim·(1−d) − 0.0035·(0.5+tileRegen)`, cap **0.85** (never
desertification): a lone band equilibrates ≈ 0 wear; a ten-band core ≈ 0.5 over decades; full recovery
from 0.5 in ~25-40 abandoned years. **Coupling:** realized support only — carrying-capacity footprint
sum × (1 − d·0.6) (max −51%); M0.11 crowding penalty untouched. **Anti-omniscient learning:** (a)
worn ranges yield less → return trend → hardship → the M0.13 journey machinery, automatically; (b) the
observation writer (`observeTile` + spawn/daughter record sites, 6 total) captures
`observedRichness = base × (1 − d·0.6)` AT OBSERVATION TIME — beliefs reflect what was seen when
present, going stale naturally; newcomers arriving at a worn delta OBSERVE a worn delta. No remote
truth reads. Debug: `supportDebug.footprintDepletionPenalty`.

**300y before/after (M0.13 → M0.14):**
- **Map 1 delta:** tile wear mean 0.50 by y300 (core tiles at the 0.85 cap: pristine richness 1.0
  tiles OBSERVE as 0.49); 28-band pcr 0.456 → **0.253** — the centuries-old delta is finally,
  honestly, much poorer. Recovery experiment: remove all 28 bands → wear 0.501 → 0.321 in 20y
  (GRADUAL, unlike the instantly-recovering crowding penalty). Population 1266 → 1150 (growth
  suppressed ~9%, NO collapse). The cluster persists within 300y — with honest economics now; further
  dispersal vs intensification is exactly the next-era fork.
- **Map 2:** real redistribution — delta 9 → **7 bands** while river_corridor absorbed 7 → **11 bands
  / 403 pop**; new-catchment founders 0 → **2**; bbox 10064 → 10212; basin pcr honest (0.219 at 14
  bands, wear 0.42); dry stayers 3 → 2. M0.13 founder/creek behaviour intact (journeys tracked,
  monotone displacement).
- **Audit additions:** per-catchment `tileDepletion {tiles, mean, max}` + `meanFootprintDepletion`
  (crowding penalty vs wear side by side), `topDepletedTiles` (with pristine vs newcomer-observed
  richness), `depletionRecovery` experiment (empty the most-worn catchment, advance 20y).

**M0.14 post-implementation user-audit fixes (render-only):** dead bands (dispersed/absorbed/
extinct — kept in world.bands for lineage) were RENDERED at their death position forever and were
clickable — the user's "frozen bands". `drawBands` + `getBandIdAtClientPoint` now skip them.
Depletion verified live in a 150y evidence run: 247 worn tiles (max 0.77), every active band carrying
footprint wear 0.06-0.34, crowded bands at penalty 0.5 / pcr 0.02-0.45 with alternatives CONSIDERED,
and every active band moving (sinceMove=1) — continued delta accumulation is honest economics (worn
delta at ~49% richness still beats poor plains), eroding further as wear deepens; the harshness dial
is DEPLETION_YIELD_WEIGHT / cap if ever wanted.

**M0.14 files changed:** NEW `src/sim/world/depletion.ts`; `src/sim/world/types.ts` (world field);
`src/sim/tick/advance.ts` + benchmark instrumented pipeline (same slot, both modes);
`src/sim/agents/carryingCapacity.ts` (realized-support wear + debug field); `src/sim/agents/types.ts`
(supportDebug field); observation sites in `bandDecision.ts`/`spawn.ts`/`demography.ts`;
`scripts/simBenchmark.mjs`; `docs/HANDOFF.md`.

**M0.14 verification (2026-06-12):** build green; **new fingerprints** Map 1 100y **328/9/4** ×2
deep-equal; Map 2 50y **314/9/0** ×2 deep-equal; Map 1 300y non-fast **1470/36** (runtime
load-confounded; `depletionAdvance` phase ≈ 0.43ms/tick ≈ 0.7% — negligible); 50y migration audit
byte-identical ×2; lake-opportunity + frontier-drift-scale audits PASSED; all 15 targeted suites
green; `--all --fast` **25/25**; static guards clean; graph untouched 164/403. 300y archives:
/tmp/m013_after300.json (before) vs /tmp/m014_after300.json.

---

**Prior checkpoint:** **M0.13 — Directional Drift + Founder Journeys + Creek Corridors +
Low-Pressure Competitiveness** (**Implemented and ACCEPTED 2026-06-12** — compact sanity review at
M0.14 start: all four couplings band-known/bounded/decaying, no truth reads, movement-volume guard
(frontier-drift-scale) green, full battery green, acceptance evidence decisive. MOVEMENT-POLICY
checkpoint, max effort, four-part scope from the user/Fable visual-audit addendum.)

**The four couplings (all band-known, bounded, decaying, never truth richness, no forced moves):**
1. **Sustained-hardship intent evidence** (`frontierIntent.ts`): chronic flat-bottom misery never
   tripped `chronicDecline` (nothing left to decline from) so miserable corridor bands generated no
   frontier-intent evidence and wandered isotropically. New evidence component
   `sustained_hardship = max((0.45 − returnTrend.mean8) × 1.4, sustainedOverCapacity × 0.7)` joins the
   ranked sources (blended weight 0.2).
2. **Corridor-chain heading fallback** (`frontierIntent.ts`): when no band-known opportunity/frontier
   target exists, the intent direction falls back to the band's FARTHEST M0.12 corridor-inferred tile
   (the head of its own inference chain) — existence-only DIRECTION, the accepted M0.7/M0.8 precedent.
   Evidence finally has somewhere legal to point.
3. **Founder journeys** (`inheritFrontierIntentForDaughter`): a daughter born from a saturated/crowded
   parent (parent sustainedOverCapacity > 0 OR colonization pressure ≥ 0.45 OR saturation ≥ 1) seeds a
   0.4-strength intent even when the fission was not frontier-driven — she keeps testing outward for
   seasons instead of instantly becoming an adjacent satellite; decays/converts to residence normally.
4. **Creek corridor eligibility** (`bandDecision.ts` M0.8 step targets): creek-corridor land
   (`isChannelCorridorLand`) is now a legal (weaker — scored from the tile's own lower water/richness)
   relocation route alongside open-water margins. Plus **low-pressure competitiveness**
   (`carryingCapacity.ts`): the known-opportunity comparison margin relaxes from +0.08 down to −0.05
   under sustained over-capacity (`competitionMargin = 0.08 − min(0.13, sustainedOverCapacity × 0.2)`)
   — less competition is itself worth something; debug field `competitionMarginRelaxed` + audit flag
   `wonByLowerCompetition`.

**300y acceptance evidence (Map 2 = clean same-terrain comparison vs M0.12):** FIRST-EVER Map 2
dry-corridor escape (a daughter founded in open_plains, 309 known tiles); open_plains occupancy
2 bands/69 pop → **4/132**; dry-band corridor knowledge reach 15 → **34** tiles; daughters (27
tracked) hold founder intent at 5y **27/27** with MONOTONICALLY growing displacement (3.6 → 4.2 → 4.7
tiles at 5/10/25y — journeys, not oscillation); **615 creek-following moves** (3% of all moves);
basin pileup stable 0.273 → 0.3 (no satellite regression), bbox 9869 → 10064, **no movement explosion**
(frontier-drift-scale audit PASSED). Map 1 numbers also shifted but are CONFLATED with the same-day
MAP1-R terrain redesign (not attributable to M0.13 alone): delta 22→28 bands, lake basin empty at
y300, pairDist 56→35.5 — the new Map 1 delta may be a large battery; flagged for the next audit pass,
not a mechanism regression (M0.11 penalty active, suites green).

**M0.13 audit additions (`simBenchmark.mjs`):** per-map `daughterJourneyAudit` (tracked / seeded /
keptIntentAt5y / mean displacement at 5/10/25y / newCatchmentFounders), `creekFollowing`
(creekMoves/totalMoves/share), `creekCorridorCount` in corridorInference, opportunity
`competitionMarginRelaxed` + `wonByLowerCompetition` in the basin deep dive.

**M0.13 files changed:** `src/sim/agents/frontierIntent.ts`, `src/sim/agents/types.ts` (intent source
+ opportunity debug field), `src/sim/agents/carryingCapacity.ts` (competition margin),
`src/sim/rules/bandDecision.ts` (creek step eligibility), `scripts/simBenchmark.mjs`, `docs/HANDOFF.md`.

**M0.13 verification (2026-06-12):** build green; **new fingerprints** Map 1 100y **323/8/3**
(MAP1-R terrain was 325/8/3 pre-M0.13) ×2 deep-equal; Map 2 50y **317/9/0** (was 314/9/0) ×2
deep-equal; 50y migration audit byte-identical ×2; lake-opportunity audit PASSED; frontier-drift-scale
PASSED (movement-volume guard); patch-return 12/12 + behavior 13/13; scout 6/6; plant 9/7/8/9; all
cause/dispersal/natural-risk suites passed; `--all --fast` **25/25**; static guards clean; graph
164/403 0/0. 300y audits archived: /tmp/m012_after300b.json (before) vs /tmp/m013_after300.json.

---

**Prior checkpoint:** **M0.12 — Corridor-Continuation Inference + Migration Gate**
(**Implemented 2026-06-12, awaiting review.** KNOWLEDGE-FORMATION checkpoint extending accepted M0.6.)

**What it adds:** (1) **Corridor-continuation inference** (`frontierKnowledge.ts`, stage 2 of
`advanceFrontierShorelineKnowledge`): a band with sustained presence ON channel-corridor land
(`isChannelCorridorLand` — land carrying a creek line (`hasCreek`) or 4-adjacent to an `isRiver` tile)
that personally knows ≥4 corridor tiles continues the corridor CHAIN past its band-known endpoints:
unknown channel-corridor land adjacent to known corridor tiles (observed ∪ corridor-inferred),
existence-only, land-only, passable-only (never through mountains, never across open water),
id-ordered, 2/season, own budget of 96 records (M0.6's 256 margin budget untouched), TTL decay
(unvisited corridor beliefs fade after 60 ticks ≈ 15y; margin records keep accepted no-decay
semantics), observed-supersedes-inferred pruning and fission reset inherited. Unlike M0.6's
undirected margin flood (which spends its budget circling local water), a thin chain travels far —
new source `corridor_continuation_inference`, record flag `isNearWaterMargin` widened to an honest
boolean (creek lines carry sub-tile water without bordering open water). (2) **Migration-gate
amendment** (`bandDecision.ts`, M0.7 inferred-frontier probe): a band that is economically STUCK
(perCapitaReturn < 0.3) with no active frontier intent and no established residence is no longer
excluded by `frontierDispersal.pressure ≥ 0.2` — that pressure is the symptom of being trapped, and
blocking reconnaissance on it inverted the gate's purpose. Probe stays an information action
(residence-unchanged, no richness in score, normal competition). (3) Audit: per-dry-band
`corridorInference` (corridorCount/marginCount/maxCorridorDistance) + `observedTileCount`.

**300y audit findings (2026-06-12, both maps):** corridor inference WORKS as knowledge formation —
Map 2 dry bands carry 10-13 live corridor beliefs reaching 13-18 tiles and their observed knowledge
grew to 89-213 tiles (M0.10-era: ~44); Map 1 river bands carry margin-only sets (corridor stage adds
nothing where the margin blob already covers the corridor — correct). **Macro trajectories are
IDENTICAL to M0.11 at every horizon** (Map 1 100/200/300y = 304/640/1356; Map 2 pileup 0.273, basin
pcr 0.618, occupancy unchanged) — the knowledge forms and converts but does not yet change movement.
WHY (instrumented): the dry bands are not idle stayers — they `move_to_tile` 114/120 ticks,
wandering ISOTROPICALLY inside the corridor (lineages oscillate ±6 tiles over 300y) because the
intermediate margin is uniformly poor (no economic gradient to follow) and no directional-persistence
mechanism applies to chronically stressed adult bands (M0.9 corridor headings are earned from realized
motion and daughters-reset; frontier intents rarely form here — upper band 88/120 ticks intent-blocked,
mid band 0/120). The M0.7 probe (even gate-amended) is a tie-breaker that loses to real moves —
correct per its accepted design; their own wandering already converts inference to observation.
**The knowledge-range wall is SOLVED; the remaining world-filling blocker is DIRECTIONAL PERSISTENCE
under uniform hardship** (green lowlands / NE basin / north steppe still unoccupied at y300; occupied
catchments stuck at 5). Saturation effects (M0.11) fully preserved; no movement explosion; no
richness/yield leak (existence-only records, literal-guarded).

**M0.12 files changed:** `src/sim/agents/frontierKnowledge.ts` (stage-2 corridor chain + TTL prune +
`isChannelCorridorLand` export), `src/sim/agents/types.ts` (source union + honest boolean flag),
`src/sim/rules/bandDecision.ts` (probe gate amendment), `scripts/simBenchmark.mjs`
(`auditCorridorInference` + dry-band fields), `docs/HANDOFF.md`.

**M0.12 perf pass (behaviour-identical, PROVEN byte-identical):** CPU profiling showed the
frontier-knowledge advance was the top sim hotspot (~11%: per-band per-tick BFS re-classification of
every observed tile). Fixes in `frontierKnowledge.ts`, all pure-static memoization: (1)
`isNearWaterMarginLand` / `isChannelCorridorLand` results cached per world-tiles object (WeakMap —
static topology, identical outputs); (2) `pruneObserved` fast path returns the prior record when
nothing drops (growth path copies before mutating); (3) the two per-stage observed-tile loops merged
into one order-preserving classification pass. Verified: Map 1 100y and Map 2 50y outputs
**byte-identical to pre-optimization runs** (timing fields excluded); migration audit 50y
byte-identical; lake + frontier-drift audits pass. Controlled A/B (alternating runs on the same box):
Map 2 50y ~17.2-17.8s → ~15.8-16.9s, Map 1 40y ~6.7-7.1s → ~6.2-6.5s (≈6-8% end-to-end). Remaining
hotspots (movement candidate generation, 3× context passes, salient-memory/crowding builds) are
behaviour-adjacent — left for a dedicated perf/architecture checkpoint.

**Render hover-lag fix (render-only, user-confirmed):** `canvasRenderer.ts` now caches the static
layers in two offscreen canvases (base = background + tile fills + stipples; over = creek/river/grid/
atmosphere, transparent — sits above the selection overlays), keyed by tick/mode/camera/size/ratio/
toggles + tiles ref; interactive redraws blit them and draw only dynamic content (selection overlays,
bands, hover/selected outlines via `drawTileHighlights`, hover box, legend). The ACTUAL hover culprit:
`drawSelectedBandKnowledgeOverlay` full-scanned every visible tile (~30k string-keyed lookups per
redraw) to find the ~200 band-known tiles — it now iterates the band's own record set with a
visibility test. Zero full-map scans remain in the dynamic path; per-tick/static rebuild cost
unchanged.

**M0.12 verification (2026-06-12):** build green; Map 1 baseline 100y **304/8/3** `deterministic=true`
×2 deep-equal (UNCHANGED from M0.11) and non-fast 200/300y 640/1356 unchanged; Map 2 50y **314/9/0**
×2 deep-equal (unchanged); Map 2 non-fast 100y 421/12, 200y 789/23; M0.9 lake audit passed; frontier
drift scale audit passed; patch-return 12/12 + behavior 13/13; scout 6/6; plant suites 9/7/8/9; cause
suites all passed; dispersal/dispersal-lineage/natural-risk passed; `--all --fast` **25/25**; static
guards clean (0 Math.random / 0 any / 0 UI imports); graph untouched 164/403 0/0. 300y audit archived
at /tmp/m012_after300b.json (deterministic by construction).

---

**Prior checkpoint:** **M0.11 — Shared-Catchment Saturation → Effective Per-Capita Return v0**
(**Implemented and ACCEPTED 2026-06-11.** BEHAVIOUR checkpoint — first causal coupling of multi-band
crowding into band economics. Max-effort architecture checkpoint per the standing instruction.
**Review verdict:** coupling correct (right signal: rangeV1.saturation integrates radius-4 presence +
shared-catchment division, never truth richness; min-of-two-derivations sustained guard converges
across the per-tick context passes — a band moving through never bites; penalty bounded ≤0.5 and
proven recoverable; debug fields honest, with one cosmetic note: audit `effectiveReturnBeforePenalty`
clips at the 0-floor for extreme cases). No fake migration (no forced moves/exile/spread reward/
rich-tile chasing; movement logic untouched; no arbitrary death — `nutritionDeficit` verified to have
NO consumer outside carryingCapacity, so the only demography path is the tiny pcr<0.5 foodStress term).
Daughter-clone semantics verified safe (inherited prior saturation can only reduce a daughter's
penalty, never raise it past her own current). Economic effect REASONABLE, not too strong: graded
dose-response in the 300y audit — pen 0.5 bands escalate to seek_new_range, pen 0.13-0.25 bands still
reject genuinely-worse land, pen 0 bands unchanged; basin keeps growing. Macro deltas (Map 1 100y
306→304, 300y 1382→1356, lake-audit minDistanceEver 7→10 with audit PASSING) are legitimate
behaviour-change consequences, not regressions. Infinite-food-battery behaviour is FIXED ENOUGH;
the remaining migration blocker is the dry-margin/corridor knowledge range → M0.12 next.)

**The problem (measured):** M0.10's "infinite food battery". Direct evidence (Map 2 basin, year 100):
a parent/daughter cluster at rangeV1 saturation **1.56-1.64** (local population 50+ vs shared-divided
supportable capacity ~32, shared-catchment division already −24/−36% of support) still read perCapita
**0.92** — identical to uncrowded bands — because `clamp01(supportRatio)` erases any surplus and
**fission keeps every band's own demand below its private share forever** (split → adjacent daughter →
basin re-tessellates into ~13-tile private catchments). `rangeV1.saturation` — the one signal that
already integrates BOTH the radius-4 multi-band population AND the shared-catchment division — fed
nothing economic, and alternatives (scored on a ~0.5-0.8 yield scale) could never beat the inflated
0.92 (`not_better_than_current` by construction).

**The coupling (smallest safe, in `deriveCarryingCapacity`):**
`sustainedOverCapacity = clamp(min(saturation_now, saturation_prior) − 1, 0, 1.5)` (prior = the band's
own previous derivation, so a one-season passer-by never bites);
`saturationPenalty = min(0.5, sustainedOverCapacity × 0.45)`; subtracted from `perCapitaValue`.
Local (radius-4 presence vs own shared catchment), bounded (≤0.5; pcr floor ≈0.45 keeps the
foodStress coupling negligible → no collapse), recoverable (pure per-tick derivation — crowd leaves →
penalty gone), deterministic, based on actual presence/overlap only (never truth/inferred richness),
visible (`sustainedOverCapacity`/`saturationPenalty` on PerCapitaReturnState + reason id
`saturation_reduced_per_capita_return`). NO movement logic touched — existing fission/colonization/
intent machinery responds through the changed return alone. Saturation computation moved ABOVE the
per-capita value in the same function (was below); no other ordering change.

**300y before/after (same code except the coupling; audit extended — see below):**
- **Map 2 rich basin:** pileupScore **0.727 → 0.273** (basin satellites 8 → 3, basin outward
  dispersals 2 → 5). Before: pcr glued at 0.91-0.92 while bands piled 3→12. After: the basin
  *breathes* — pcr dips to 0.66 when saturation hits 1.44 (y100, penalty 0.218), recovers to ~0.86-0.87
  as daughters disperse outward and saturation falls to ~0.8, dips again as it refills (y300: 0.618 at
  satV1 1.44). Crowded bands at saturation 2.5 read pcr ~0.1-0.31 and their alternatives become
  `consideredAsTarget` (rejection `not_better_than_current` clears). Basin population still grows
  (87→498 — the basin remains the productive core; no arbitrary kill, no collapse) but now EXPORTS.
- **Map 1 lake basin:** same dynamics later/smaller (y300 pcr 0.714 at satV1 1.22, penalty 0.167;
  pileup 0.4→0.5 on tiny counts — noise). M0.9 lake audit PASSES (drift: minDistanceEver 7→10,
  frontier moves 730→728, wandering 5.98→5.43 — stable enough).
- **Recovery experiment (new, audit-side):** remove all other basin bands, re-derive context ×2 →
  Map 2: saturation 2.5→0.53, penalty 0.5→0, pcr 0.1→0.93; Map 1: 2.11→0.39, 0.47→0, 0.39→0.93.
  `pressureRecovered: true` on both maps.
- **World-filling:** NOT yet meaningfully improved (occupied catchments 5→5, bbox ~flat, total outward
  12 vs 11) — basin exports now exist but settle in adjacent occupied land. **Dry-margin unchanged
  (Map 2: 3 stayers / 0 escapes)** — the knowledge-range wall is now the single remaining M blocker,
  exactly as the M0.10 decision rule anticipated.

**M0.11 files changed:** `src/sim/agents/carryingCapacity.ts` (the coupling + reordered saturation),
`src/sim/agents/types.ts` (2 debug fields on PerCapitaReturnState), `scripts/simBenchmark.mjs`
(audit: per-catchment `meanSaturationV1` + `meanSaturationPenalty` in snapshots; per-band
`effectiveReturnBeforePenalty`/`saturationPenalty`/`sustainedOverCapacity`/`saturationV1`/
`supportRatio`/`sharedCatchmentPressure` in the basin deep dive; `saturationRecovery` experiment),
`docs/HANDOFF.md`.

**M0.11 verification (2026-06-11):** build + both typechecks green; **new fingerprints** (expected
behaviour deltas): Map 1 baseline 100y **304/8/3** (was 306/8/3) `deterministic=true` ×2 deep-equal;
Map 2 scenario 50y **314/9/0** (was 315/9/0) ×2 deep-equal; migration audit deterministic
(50y byte-identical ×2; 300y before/after archived at /tmp/m011/); M0.9 lake audit passed; frontier
drift scale audit passed; patch-return check 12/12 + behavior check 13/13; scout 6/6; 4 plant suites
9/7/8/9; cause suites (event 7, coverage, stress-readiness 9, stress-increment, live-risky-scout) all
passed; dispersal + dispersal-lineage + natural-risk passed; `--all --fast` **25/25 completed**;
static guards clean; graph untouched (164/403, 0/0).

---

**Prior checkpoint:** **MAP2-R — Realistic Map 2 Rework / Visual Audit Only**
(**Implemented 2026-06-11, awaiting review.** MAP/UI/RENDER checkpoint — NO sim behaviour change outside
Map 2's authored terrain data: Map 1 baseline 306/8/3 deterministic ×2 and 300y non-fast 1382/36 both
match the accepted fingerprints; M0.9 lake audit fingerprint unchanged 7/730/5.98 passed.)

**What MAP2-R changes:** Map 2 was visually judged unrealistic/gamey (blobby richness, uniform poor
plains, simplistic hydrology, lake-as-rich-ring, no creeks, undefined scale). Rework, same feature
anchors (lake (78,72), NE basin (172,30), delta (196,92), dry-river polyline, SE lowlands — so the
M0.10 audit geometry in `classifyMap2Catchment`/`MAP2_DRY_RIVER_PATH` is still valid):
- **Declared scale:** `VARIED_MIGRATION_KM_PER_TILE = 1.5` → Map 2 is a ~330×210 km region; shown in
  the UI header (`Scale:` line; Map 1 shows "debug scale").
- **Causal richness:** per-tile moisture field (coastal humidity from the east + orographic foothill
  rain + surface-water proximity (rivers/creeks/lakes/delta) − rain-shadow arid interior − relief) +
  seeded `smoothNoise`/`hashNoise` mosaics (no Math.random). Plains are now a medium mosaic
  (mean ~0.47, forest groves where moist), green lowlands ~0.6 with woodland, arid core ~0.04 with
  survivable corridor floors, NE basin ~0.24 poorer-but-empty steppe, lake basin a fed gradient
  (marsh fringe → floodplain → moist plains, ~0.49 fringe mean) instead of a rich ring.
- **Creeks:** 12 authored sub-tile creek polylines (`VARIED_CREEKS`) act as influence corridors
  (waterAccess floor ~0.44, richness floor ~0.32, slight movement/corridor relief, moisture term) and
  set the new optional `Tile.hasCreek` flag (Map 1 leaves it unset). `canvasRenderer.ts` draws them as
  thin pale-blue 8-neighborhood-connected lines under the river overlay (`drawCreekOverlay`). No sim
  rule reads `hasCreek`.
- **Rivers/crossings v0 at map scale:** upper main course re-profiled `shallow_braided` (fordable along
  the reach); named crossings: ford (86,52), NEW confluence-shelf seasonal ford (108,58), seasonal ford
  (134,68), dangerous narrows (184,90); estuary impassable without watercraft; tributaries/dry river
  seasonal fords. Coastline gets deterministic capes/bays noise.
- **Spawns:** kept all 8 M0.10 spawn IDs/targets and added `band:varied-plains-creek` ("Creek Plains
  Band", size 24, target (100,46)) on the central-plains creek — Map 2 now spawns **9 bands** (lake
  cluster kept: the fed basin is the region's productive core, so 3 bands there stays plausible).
- **Visual audit (PNG render mirroring the app palette):** rivers flow highlands→coast plausibly; lake
  reads as a fed marsh basin; desert edges are noisy transitions with the seasonal river crossing;
  plains show mosaic; creeks visible; spawns on plausible land. Remaining limitations: delta core
  clamps at richness 1.0 (small area), far-west strip beyond the cordillera is flat/plain, creeks are
  influence corridors (not navigable hydrology).

**MAP2-R visual polish pass (same checkpoint, user feedback "colors/composition ugly"):**
- **Smooth terrain palette** (`canvasRenderer.ts` — render-only, both maps): `getTerrainColor` now blends
  continuous color ramps (dry ↔ humid vegetation indexed by baseRichness, blended by droughtRisk/
  waterAccess) instead of hard threshold bands that collapsed all 0.2–0.46-richness land into one flat
  tan. Adds floodplain-meadow / marsh-teal / coastal-sand mixes, muted rock blend + slight elevation
  lift on high ground, pass-corridor tint, and ocean depth shading by distance-to-shore
  (`getOceanShoreDistance`, radius-2 scan). Terrain legend updated. Seasonal tinting still applies on
  top (hex in/out preserved).
- **Bilinear field noise** (`variedFieldNoise` in generate.ts, Map 2 only): `smoothNoise` floors to its
  lattice and showed as square patches under the smooth palette; relief/climate/fertility fields and the
  coastline capes now use bilinearly interpolated value noise (deterministic, seeded). Ridge edge noise
  raised 0.14→0.2 for raggeder mountain outlines.

**MAP2-R naturalization pass (same checkpoint, user feedback "curve rivers, lakes too circular, dead
land behind mountains, streams unreadable"):**
- **Meandering rivers:** all Map 2 channels (and creeks) are now midpoint-displaced via
  `subdivideMacroPath` — deterministic, preserves every authored vertex, so named fords/confluences and
  the benchmark's `MAP2_DRY_RIVER_PATH`/catchment anchors remain on-channel. Base control paths kept as
  `*_BASE` consts.
- **Organic lakes:** `variedLakeDistance` modulates the shoreline radius by angle (2/3/5-lobed sine
  harmonics, seeded) — both lakes are smooth blobs, not circles.
- **Downstream-widening main river:** channel width threshold grows 0.62 → ~1.6 tiles (+delta bonus ~2)
  from headwaters to mouth (1 tile ≈ 1.5 km, widths symbolic river-corridor widths).
- **West (lee-side) river** `varied-west-river` along the cordillera's west foot (exits the map south,
  continuing off-map) + 5 new mountain streams (3 west-flank feeders, central-ridge → NE-basin lake,
  central-ridge → north steppe), so no map region is dead filler. New river profile + segment id;
  crossings auto-classify as seasonal fords.
- **Stream rendering:** creek overlay restyled to faint thin muted-blue threads (alpha drops when zoomed
  out) so streams read subordinate to rivers; seasonal-stream river color de-iced (#63c7de → #4da3c4).
- **Seasonal tint fix (render, both maps):** global per-season tints in `seasonalVisuals.ts` were mixing
  every land tile 30-34% toward one fixed hue, washing the whole map out (the user's screenshot); spring
  lush 0.34→0.16, summer warmDry 0.3→0.18, autumn 0.24→0.16, winter dormant 0.34→0.24.

**MAP2-R geo-realism pass (same checkpoint, user-supplied physical-geography rules):**
- **Rivers rise in high ground:** new north hill belt (ellipse (90,6)) and south hill belt ((120,134));
  the north/south tributary sources were re-rooted into them. Main river rises at the cordillera foot,
  dry seasonal river at the south pass, west river on the lee side — every channel now has a highland
  source. Rivers only merge (delta splitting at the sea only).
- **Young vs mature rivers:** `subdivideMacroPath` gained an amplitude taper — channels are straight
  near their sources and meander downstream (main 1.2→3.6, tributaries 1→2.4, dry 1.2→2.4, west
  1.3→2.8).
- **Mature floodplain:** the main valley's riverInfluence width grows downstream (4 → 9 tiles), so the
  upper course is a narrow young-river corridor and the lower course a broad fertile floodplain.
- **Endorheic NE lake:** the no-outlet basin lake is now explicitly endorheic — open-water
  aquaticPotential 0.82→0.48 (brackish), shoreline seasonalVariance +0.12 (seasonal salt-marsh flats);
  its marsh fringe and inflow creeks stay.

**MAP2-R connectivity pass (same checkpoint, user feedback "rivers floating / ending inland"):**
- Tributary/outlet/pass-stream mouths moved ONTO the main-river confluence vertices ((108,58)/(160,80))
  so subdivision wobble can never gap a join; stream (creek) mouths overshoot onto their target
  channel/lake/coast for the same reason (hasCreek is non-aquatic-only, so overshoot is invisible).
- The dry seasonal river now continues through the green lowlands and reaches the SE coast (~(202,129))
  instead of stopping inland; the west river exits the south map edge (continuing off-map).
- UI default: `showRivers` (river overlay emphasis marker) now defaults OFF — river tiles render blue
  on their own. Stream thread lines stay INSIDE the Rivers toggle (user decision: streams are sub-tile
  features — hidden when the marker is off, clearly drawn when it is on). Original overlay marker
  colors kept.
- Render fix: tile fills are snapped to DEVICE pixels (`layout.pixelRatio` threaded from
  `prepareCanvas`) — CSS-space rounding still leaked background seams ("phantom grid" with Grid off) at
  fractional devicePixelRatio; adjacent tiles now share exact device-pixel edges (no seams, no overlap
  moiré). Stream overlay lines (Rivers toggle ON) are bright pale aqua `rgba(126,230,219,.95)` —
  deliberately distinct from the deeper-blue river lines — and thick enough that every stream is
  visible.
- **Texture pass (TEMPORARY, render-only, terrain view only — user plans a dedicated pass later):**
  `getTexturedTerrainColor` layers (1) smooth bilinear-value-noise vegetation patches (hue shifts
  toward lush green / warm dry, scale 9), (2) an NW-light hillshade from real elevation central
  differences (±0.14, ridges get lit/shadow flanks), (3) fine correlated grain + per-tile whisper;
  water gets horizontally-stretched soft wave bands. Zoom-in (cellSize ≥ 6) biome-weighted stipple
  dots (`drawTileStipples`). All deterministic tile-coordinate hashes — no Math.random, no frame
  shimmer; data views (richness/water/elevation/movement/seasonal-food) stay untextured. Prettiness
  micro-pass: rivers get along-channel tonal flow variation (±0.09) instead of flat ribbons; marsh
  mix 0.6→0.5 (lighter tone) and floodplain meadow mix 0.45→0.38; `drawMapAtmosphere` (terrain view,
  under band markers) adds a warm-NW → cool-SE light wash matching the hillshade sun, a soft inner
  edge shadow, and a 1px border so the map sits on the page.
- **Connectivity proven, not eyeballed:** `/tmp/map2r/connectivity.mjs` (vite ssrLoadModule, rebuild if
  needed) runs a connected-component audit over the generated tiles: every isRiver component must reach
  ocean/lake/map-edge, every hasCreek component must touch water. Final state: 2 river components (main
  network → ocean; west river → south edge), 16/16 stream components touching water, no far-bank stubs.
  Fixes this required: south-plains creek and lowland creek mouths moved onto preserved channel base
  vertices ((134,68) main / (166,122) dry river), two west-flank stream mouths pinned to west-river
  base vertices ((20,84) / (28,122)), and the dangling central-ridge → north-steppe stream REMOVED
  (dead-ended at the map top edge; a perennial stream in the rain-shadow steppe was dubious anyway).

**Map 2 new reference numbers (MAP2-R, after polish + naturalization + geo-realism + connectivity):**
scenario `map2_varied_migration` 50y = **315 pop / 9 bands / 0 extinct**, `deterministic=true` ×2
deep-equal (was 273/8/0 pre-rework with 8 spawns; map data + the 9th band changed the trajectory,
expected). Migration audit (50y smoke) byte-identical across runs on both maps; Map 1 fingerprints
re-verified unchanged (306/8/3).

---

**Prior checkpoint:** **M0.10 — Map 2 + Migration/Saturation Audit Batch**
(**Implemented 2026-06-10, awaiting review.** AUDIT/UI/MAP checkpoint — NO sim behaviour change: Map 1
baseline byte-identical 306/8/3 deterministic ×2; M0.9 lake audit byte-equal 7/730/5.98 passed.
Note: M0.10's Map 2 audit FINDINGS below were taken on the pre-MAP2-R map; the structural conclusions
(knowledge-range wall, infinite-battery basin, no world-filling) are about sim mechanics, not map data,
and are expected to reproduce on the reworked map — re-run the audit after MAP2-R review if exact
numbers are needed.)

**What it adds:** (1) **Map 2 — "Varied Migration Test"** (`createVariedMigrationWorld`, 220×140 = 30,800
tiles vs Map 1's 160×100): deterministic hand-authored macro plan with a rich lake/wetland basin
(saturation battery), a long main river with two tributaries + greener SE downstream lowlands, a
dry-margin SEASONAL river corridor (the "yellow corridor" — narrow survivable water/richness floor on the
channel, harsh off it, downstream end reaching green land), a semi-isolated NE basin behind a central
ridge with ONE pass (bottleneck), two western mountain passes, delta/estuary, northern poor-but-empty
steppe, 9 river segment profiles + 1,096 crossings (fords at bottlenecks, estuary impassable without
watercraft). Map 1 is UNCHANGED and stays the default. (2) **Explicit Map 2 spawns**
(`spawnVariedMigrationBands`): 8 bands at authored coordinates — 2 dry-corridor bands (mid (75,111) /
upper (56,106)), a 3-band crowded cluster around the rich lake (saturation test), a long-river band, an
estuary band, and a small (16) low-density frontier band at the central pass. (3) **UI map selector**
(App.tsx): "Map 1 — Lake/River Debug" / "Map 2 — Varied Migration Test" buttons + current-map label.
(4) **Scenario** `map2_varied_migration` (default 50y; in `--all` — sweep is now **25** scenarios).
(5) **`--targeted-migration-saturation-audit`** (options `--migration-audit-years N` default 300,
`--migration-audit-map 1|2` default both): catchment-classified snapshots at years 50/100/150/200/300
(bands/pop/per-capita-return/saturation/food-stress per catchment), fission ledger (spawn distance, final
distance from origin/parent, local-satellite ≤4 vs outward ≥8), dry-margin lineage tracking + greener-
alternative knowledge audit (observed vs inferred-only vs truth-only within range 14), intent-candidate
introspection per band (NEW audit-only export `auditMobilityIntentCandidates` in mobilityIntent.ts — a
mechanical extraction of `selectNewIntent`'s candidate building; selection behaviour byte-identical),
basin saturation deep dive (rangeSaturation + colonization recommendedAction/rejectionReason vs truth),
wetland pileup score, world-fill metrics (occupied catchments, mean pairwise band distance, bounding box).
Audit is deterministic (50y re-run deep-equal) and AUDIT-ONLY — no migration outcome is forced.

**Audit findings (2026-06-10, 300y, both maps):**
- **Dry-margin clustering:** on Map 2 the mid-corridor band sat at (72,111) for 300 years (pop ~21-25,
  chronic foodStress ~0.82, perCapitaReturn ~0.16) — and the audit shows WHY: there are ZERO
  greener+watered land tiles within Manhattan 14 in TRUTH (the green lowlands are ~70 tiles downstream),
  its knowledge reached only ~44 tiles in 300y, and every generated intent candidate targets local
  corridor tiles (water anchor wins; no downstream candidate is ever generated because no downstream
  knowledge/inference ever forms — knowledge range, not overattachment). The upper-corridor band DOES
  drift slowly downstream (greener candidate generated AND winning, gap 0). On Map 1 the dry-margin
  lineage fully ESCAPED to the river corridor by year 300. So: realistic niche persistence + a real
  KNOWLEDGE-RANGE wall for deep-margin bands; daughters are not the issue (0 dry-corridor fissions).
- **Wetland/lake overpopulation:** Map 2 rich basin grew 3→11 bands / 87→348 pop while mean
  perCapitaReturn fell only 0.91→0.864 (−5% for ×4 population!) — rich pockets ARE effectively infinite
  food batteries; rangeSaturation registers (0.1-0.35, peaks 0.69) but does NOT bite the effective
  return. 9 basin fissions: 5 local satellites, **0 outward dispersals** (pileupScore 0.556; Map 1 lake
  basin 0.4). Colonization scans only ever find `remembered_underused` tiles INSIDE the already-rich
  neighbourhood and reject them as `not_better_than_current` — "poorer-but-empty beats richer-but-crowded"
  can never trigger because crowding never makes "current" worse.
- **World-filling:** NO world-filling pressure over 300 years. Map 2: bands ×4.5 (8→36) but the band
  bounding box is FLAT (~9,300-9,450) and mean pairwise distance ~73-79; Map 1 pairwise distance SHRINKS
  81.6→54.7 (densification into clumps). Outward dispersal: Map 1 14/31 fissions ≥8 tiles (mostly delta),
  Map 2 only 5/28, max final distance from origin 13 tiles on a 220-wide map. Migration case coverage:
  dry-to-wet escape YES (Map 1) / NO (Map 2 deep margin); wetland-saturation escape NO; river-corridor
  dispersal partial; crowding escape weak; long-range daughter dispersal rare; biome-adapted stayers YES.
- **TRUE BLOCKER (named, not fixed here):** crowded-rich catchments never export population because
  multi-band crowding does not reduce the effective per-capita return (the "infinite battery"), and
  band-known opportunity scanning is knowledge-range-bound, so poorer-but-empty land is never even
  COMPARED. This is a resource/saturation→demography coupling question (plus knowledge range), NOT a
  movement-lever question — movement machinery (intents, corridors, headings, fission placement) is
  generating candidates correctly per the audit.
- **Harness finding (resolves the 2K.5 flagged drift):** `--fast` skips the per-season `contextFinal`
  pass (simBenchmark line ~9553), so fast vs non-fast trajectories diverge at long horizons (200y: 645
  fast vs 646 non-fast; 300y: 1358 fast vs 1382 non-fast — TODAY, each mode internally deterministic and
  reproducible). The 2K.5-era "unexplained 645/1358 vs 646/1382 drift" was a MODE MISMATCH between
  recorded runs, not a sim change. Future perf/baseline records must state the mode.

**M0.10 files changed:** `src/sim/world/generate.ts` (Map 2 generator — additive; Map 1 code untouched),
`src/sim/agents/spawn.ts` (`spawnVariedMigrationBands` + explicit spawn table; Map 1 spawn untouched),
`src/sim/rules/mobilityIntent.ts` (mechanical extraction `buildIntentCandidates` + audit-only export
`auditMobilityIntentCandidates` — no `src/sim` caller, benchmark-only; baseline byte-identical),
`src/ui/App.tsx` (map selector), `scripts/simBenchmark.mjs` (scenario + audit + flags + help),
`docs/HANDOFF.md`. Graph untouched (164/403, 0 dup, 0 dangling re-verified).

**M0.10 verification (2026-06-10):** build + both typechecks green; Map 1 baseline 306/8/3
`deterministic=true` ×2 byte-equal; Map 2 scenario 50y 273/8/0 `deterministic=true` ×2 byte-equal;
migration audit deterministic (50y re-run deep-equal); M0.9 lake audit byte-equal (minDist 7, moves 730,
wander 5.98, passed); 11 targeted suites pass (patch-return + patch-return-behavior + scout + 4 plant +
cause-event + dispersal + dispersal-lineage + scale); `--all --fast` **25/25**; static guards clean
(single patchExploitationKnowledge importer; auditMobilityIntentCandidates has no src/sim caller);
non-fast perf 100/200/300y = 306/646/1382 deterministic (fast-mode trajectory 306/645/1358 — see harness
finding above).

---

**Prior accepted checkpoint:** **2K.5 — Patch Return-Guided Observation/Testing v0**
(**ACCEPTED 2026-06-10 by architect decision** based on the implementation self-review: zero attributable
macro delta, local scout-selection-only behaviour, no yield/support/stress/movement/fission coupling.
The "unexplained 200y/300y baseline drift" flagged in that review is now RESOLVED by the M0.10 harness
finding: fast vs non-fast benchmark modes legitimately diverge at long horizons because non-fast runs an
extra per-season contextFinal pass — the historical records mixed modes.) The FIRST bounded behaviour hook reading the accepted 2K.4
patch-return knowledge — and it guides LOCAL OBSERVATION/TESTING CHOICES ONLY. This is NOT food
integration: no calories/support/yield/stress relief, no carrying-capacity/per-capita-return change, no
mortality/population change, no relocation/fission trigger, no rich-tile migration, no safe-food
certainty.

**Runtime access pattern (smallest safe):** `resourceScout.ts` becomes the ONLY `src/sim` importer of
`patchExploitationKnowledge.ts` (the static guard now asserts this exact importer set; benchmark/UI stay
the only other readers). No patch-return table is stored on bands — `derivePatchReturnScoutGuidance`
derives, per already-valid scout candidate, a bounded selection guidance from the band's OWN patch memory
+ capped test/cause rings (now passed into `ResourceScoutContext`; no WorldState/truth parameter exists in
the chain).

**The hook (selection-only bias in `selectResourceScoutTarget`):** after the SCOUT_MIN_PRESENCE and
SCOUT_VOI_MIN gates, the deterministic argmax key becomes `round2(voi) + selectionBias`:
`locally_promising_unproven` +0.1 (follow-up observation), `processing_required_unknown` +0.07 (recheck —
the patch does NOT become usable food; eligibility still classifies it processing-blocked),
`cautious_testing` +0.05 (continue an existing testing thread), suspected_toxicity/avoided_due_to_risk
−0.12 (deprioritised; at foodStress ≥ 0.75 the penalty lifts to 0 — recheck allowed under severe stress,
NEVER boosted), medicinal/toxic class excluded entirely (the accepted 2K.3C-A stress-gated urgency is
never inverted). Guidance reasons: `promising_unproven_patch_recheck`, `processing_unknown_recheck`,
`cautious_testing_preferred`, `risk_state_blocks_use`, `risk_recheck_under_stress`, `no_guidance`; report
umbrella `patch_return_followup_observation` + literal `knowledge_only_no_yield` guard. CRITICAL DESIGN
POINT: the key uses `round2(voi)` — the pre-2K.5 comparison granularity — so with all biases zero the
selection is BYTE-IDENTICAL to pre-2K.5 (verified by toggle experiment; an earlier raw-precision key
caused an unscoped micro-divergence in over_capacity_core — 431 vs 435 estimates — and was fixed). The
exported `voiScore` stays the raw VOI, so the scout-vs-stay/move decision weight is UNCHANGED; the bias
can only reorder ALREADY-VALID candidates — never create/remove/range-extend one, never bypass
eligibility/stress gates, never force movement (scouts remain residence-unchanged information actions).

**Daughter/clone alignment (closes the 2K.4 review note):** `lastResourceScout` (which now carries the
guidance debug) resets on fission and is registered in `DAUGHTER_NON_CLONEABLE_FIELDS`.

**Debug/report:** `ResourceScoutCandidate.patchReturnGuidance` + `ResourceScoutDebug.patchReturnGuidance`
(selection-only label, literal `knowledgeOnlyNoYield`/`noSupportChange`/`noStressChange` guards); band
report `patchReturnGuidance` block (guidanceClass/reason/bias/readiness/risk/confidence); BandPanel
"resource scout (latest)" line appends the guidance with "selection only, knowledge only, no
yield/support/stress"; `scoutAudit` gains `patchReturnGuidanceByReason/ByReadiness/ByRisk` +
`patchReturnGuidanceNoYieldFlagCount`.

**New targeted suite:** `--targeted-patch-return-behavior-check` (suite `targeted_patch_return_behavior_check`,
12 deterministic assertions, all pass): U1 bounded reasons/biases; U2 risk deprioritised at low stress /
recheck-at-zero-bias under severe stress; U3 medicinal excluded; U4 literal no-coupling flags; S1
promising-unproven patch beats an identical neutral patch that wins the unbiased tie-break (proves the
bias selected it); S2 `voiScore` unchanged by the bias; S3 risky patch NOT blindly chosen at low stress;
S4 risky recheck only under strong stress; S5 processing-unknown recheck preferred AND still not usable
food (real eligibility pipeline); S6 cautious-testing continuation; S7 guidance cannot extend the envelope
or revive presence/VOI-rejected candidates; S8 deterministic repeatability.

**2K.5 verification (2026-06-10):** build + both typechecks green. Baseline 100y **306/8/3**,
`deterministic=true`, two invocations byte-equal — IDENTICAL to the accepted 2K.4 macros. M0.9 lake audit
byte-equal to accepted (minDist 7, moves 730, wander 5.98, headingMoves 14, reversals 108, heading
band-seasons 2227, passed, deterministic ×2); scale audit passed. **All 15 targeted suites pass**
(the 14 prior + the new behaviour suite), re-run AFTER the final key fix. `--all --fast` **24/24**.
Static guards clean (no Math.random / `any` / UI imports; `patchExploitationKnowledge` imported by
EXACTLY one `src/sim` file: `resourceScout.ts`). Graph **164/403, 0 dup, 0 dangling** with 2K.5
summary/status clauses on 3 EXISTING nodes (resourceScout, resourceKnowledge — its "never imported by
src/sim runtime" 2K.4 clause corrected to the single-importer reality — and foodTesting). Validation
scenarios byte-match the ACCEPTED 2K.4 audits: over_capacity_core 435 estimates (419 observation_only /
11 cautious_testing / 5 processing_required_unknown; 6 safety_uncertain), crowded_delta_saturation 405,
harsh_dry_margin 206, `allGuardFlagsTrue` everywhere; guidance is derived live on every executed scout
(occ: 14 scouts, all `no_guidance`/bias 0 — stock scenarios rarely surface promising/risky patches inside
scout candidate sets, so the bias exists but does not fire; the targeted suite proves every firing path
deterministically). Perf 100/200/300y **9.9/38.4/98.4s** (pops 306/646/1382, deterministic at every
horizon; same pre-existing superlinear shape, no new cost).

**Sim-outcome delta: ZERO, proven by toggle matrix.** Bias-neutralized, daughter-reset-reverted, and
BOTH-reverted 300y baselines are byte-equal in macros to the implemented code (1382/36/31 in every cell of
the matrix; over_capacity_core byte-equal with bias on/off) — i.e. 2K.5 changes NO sim outcome anywhere
tested today. **Flagged open observation (NOT a 2K.5 effect):** today's tree yields 200y/300y baseline
pops 646/1382 where the 2K.4 acceptance recorded 645/1358 (bands/fissions identical 19/14 and 36/31,
deterministic, 100y identical, all audits identical); the full-2K.5-revert run ALSO yields 1382, so the
drift predates/escapes every 2K.5 sim delta and cannot be bisected further without VCS. A reviewer should
re-confirm long-horizon numbers on their own tree and treat 646/1382 as the new reference if reproduced.)

---

**Prior accepted checkpoint:** **2K.4 — Observed Patch Return / Exploitation Knowledge v0**
(**ACCEPTED 2026-06-10 after review.** Independent review re-ran the full matrix: build green; baseline
306/8/3 `deterministic=true`, two invocations identical; all **14 targeted suites** pass incl.
`--targeted-patch-return-check` 11/11; M0.9 lake audit stable (minDist 7, moves 730, wander 5.98, passed);
scale audit 2/0.1/0.64/6 passed; `--all --fast` 24/24 with `allGuardFlagsTrue` in all 24 scenario
`patchReturnAudit` blocks; static guards clean incl. the structural no-sim-import guard; graph 164/403,
0 dup, 0 dangling; perf 100/200/300y 10.5/36.1/91.9s with populations 306/645/1358 — byte-equal to the
implementation run at every horizon. Code re-review confirmed: evidence inputs are band-known only by
input shape (no WorldState/tile/truth in the signature chain); `strong_later` unreachable;
`locally_usable_placeholder` unreachable today for ALL patches (repo-wide, `useHistory.successfulUses`
has NO incrementing writer — only init-to-0/carry); medicinal class hard-blocked; processing suspicion
blocks usable readiness; risk precedence deterministic; all sorts id-tiebroken; caps hold. Review notes,
non-blocking: (a) test-ring matching is tile+class — one test can attribute to several same-tile/same-class
patch memories (bounded by ring cap 6; honest "tested this class here"); (b) `lastResourceScout` is NOT
fission-reset (pre-existing since 2K.1I, unlike lastPlantUseTest/lastCauseSpecificEvent; it is decision-inert
— no `src/sim` reader — and is aligned in 2K.5 since guidance debug lands inside it).)
Returns to the plant/resource ecology spine after the M0.x
movement detour (M0.9 closed the movement arc; the remaining far-shore gap is a resource/exploitation/
observation wall). 2K.4 is the FIRST explicit band-known representation of "which remembered patches look
promising / uncertain / low-value / risky / processing-dependent / not yet exploitable" — WITHOUT plants
becoming calories/support, WITHOUT safe-food certainty, and WITHOUT any behaviour change.

**Architecture — the 2K.3B derived-only pattern (strongest no-coupling guarantee):** new pure module
`src/sim/agents/patchExploitationKnowledge.ts`, NOT imported by any `src/sim` runtime file (benchmark + UI
readers only — enforced by a static-guard grep) and storing NO band state (no clone-guard entry needed,
nothing to inherit). `deriveObservedPatchReturn` maps ONE existing capped patch memory + the capped recent
plant-test ring (6) + the capped recent cause-event ring (6) — the band's own observed/scouted/tested/
cause-event evidence ONLY — to an `ObservedPatchReturn`: underlying-memory provenance
(`memoryState`/`memorySource` — known vs inherited vs inferred is explicit), dominant evidence `source`
(scout_observation / repeated_observation / cautious_sample / fallback_trial / processing_hint /
cause_specific_warning), `expectedReturn` (unknown / trace / low / **moderate_placeholder** /
seasonal_potential — a CATEGORY with an explicit placeholder ceiling, never a yield number, and derived
independently of risk: knowing a return looks moderate ≠ knowing it is safe), `exploitationReadiness`
(not_exploitable / observation_only / cautious_testing / processing_required_unknown /
locally_promising_unproven / locally_usable_placeholder — the last requires REAL successful use, which
plants cannot reach in v0 since plant use is testing-only), `confidence` (weak / moderate;
**`strong_later` is reserved and NEVER emitted** — certainty must be earned in a later checkpoint),
`riskState` (none_observed / safety_uncertain / caution_added / suspected_toxicity /
processing_problem_suspected / avoided_due_to_risk), `seasonalityHint`, evidence counts
(observation/test/negative/positive), and literal no-coupling guards (`noOmniscientRichness` /
`noYieldChange` / `noSupportChange` / `noStressChange` / `noPopulationChange`: true).
`deriveBandPatchReturnView` adds a capped per-band summary (top 3 promising / top 3 risky-or-uncertain,
readiness/risk/source/return counts, latest update, `knowledgeOnly`+`futureExploitationHook`: true).
Deterministic by purity (pure functions, id-tiebroken sorts); bounded by construction (≤48 patch memories,
rings capped 6, top lists 3, reasonIds 3).

**Update rules (uncertainty preserved):** repeated observation raises confidence weak→moderate but NEVER
certainty or usable readiness; a real cautious sample (the existing eligibility→test pipeline) raises
testCount and moves readiness observation_only→cautious_testing with zero use-history/calorie change; a
cause-specific warning raises riskState (suspected_toxicity / caution_added / avoided_due_to_risk) and
drops readiness to not_exploitable; an unresolved processing suspicion maps to processing_required_unknown
and BLOCKS usable readiness; durable poisoning memory alone marks not_exploitable; medicinal/toxic evidence
yields SUSPECTED states only (caution, never medicine/poison truth). **Daughters cannot perfect-copy:**
nothing is stored, and a daughter derives from her inherited memories — already partial/degraded by the
accepted 2K.1D path (observationCount→0, source='inherited', use history reset) — with her test/cause rings
RESET; proven in the targeted suite (parent `locally_promising_unproven` → daughter `observation_only`;
every daughter test/observation count 0; views never deep-equal).

**Behaviour coupling: NONE (deliberate v0 default).** The checkpoint spec allowed a narrow
observation/test-oriented scout preference; v0 keeps "debug/knowledge only" because baseline byte-identity
is the project's strongest review signal (and the existing `selectResourceScoutTarget` already structurally
prefers known patches — it iterates `patchMemories` only). A later checkpoint may wire a bounded local
preference THROUGH this view; yield/support integration requires its own explicitly scoped checkpoint.

**Debug/report:** per-band `patchReturnKnowledge` block in the benchmark band report (counts, latest, top
lists, provenance, guards, "knowledge only / future exploitation hook" — wording makes explicit the band is
NOT eating from these patches); end-of-run `patchReturnAudit` aggregate in every scenario summary
(estimate/readiness/risk/source/return counts + bandsWithEstimates + allGuardFlagsTrue + behaviorCoupling
all-false — an ADDITIVE report block, sim untouched); BandPanel section "patch return / exploitation
knowledge (2K.4, derived)" showing readiness counts, latest estimate, top promising/risky with
confidence+memorySource, and the knowledge-only label.

**New targeted suite:** `--targeted-patch-return-check` — 11 deterministic assertions (A–H): observed patch
→ weak estimate + guards; repeated observation → moderate confidence but never certainty/usable; real
cautious sample → testCount/readiness up, no calories (useHistory unchanged); real test→cause chain on a
medicinal patch → cause_specific_warning source, riskState raised, readiness not_exploitable, no poison
truth; processing-required-unknown blocks usable readiness; durable toxic memory → not_exploitable;
daughter non-perfect-copy (via the real `inheritResourceKnowledgeForDaughter`); derivation determinism
(deep-equal across repeat) + summary guards. **All pass.**

**2K.4 files changed:** `src/sim/agents/patchExploitationKnowledge.ts` (NEW — the only sim-tree change;
nothing existing in `src/sim` was modified), `scripts/simBenchmark.mjs` (flag + help + module load +
`runTargetedPatchReturnCheck` + `formatObservedPatchReturn` + band-report `patchReturnKnowledge` block +
scenario `patchReturnAudit` aggregate), `src/ui/BandPanel.tsx` (derived debug section),
`src/architecture/graphData.ts` (summary/status-only updates on 7 EXISTING nodes: resourceKnowledge,
patchMemory, causeStress, learnedWorldModel, foodTesting, processing, riskBattery — counts unchanged
**164/403**, 0 duplicate, 0 dangling), `docs/HANDOFF.md`.

**2K.4 verification (2026-06-09):** `npm run build` + both typechecks green (pre-existing chunk warning
only). **Baseline SIM byte-identical:** pre-vs-post diff of the full non-fast deterministic baseline output
has exactly ONE hunk — the additive `patchReturnAudit` report block — and zero changed/deleted lines;
306/8/3, `deterministic=true`, two post invocations identical (timing-only noise). Baseline aggregate shows
the correct inert default: 366 estimates / 8 bands, ALL `observation_only` + `none_observed` + return
`unknown` (knowledge present, nothing exploitable claimed). **M0.9 lake audit byte-identical** pre-vs-post
(zero non-timing hunks: minDist 7, moves 730, wander 5.98, headings unchanged — movement provably
untouched); scale audit identical (maintain25=2, persist=0.1, loop=0.64, sat=6, passed). All **14 targeted
suites pass** post-change: scout, dispersal, dispersal-lineage, plant patch/lifecycle/eligibility/use-test,
cause-event, cause-coverage, cause-stress-readiness, natural-risk, live-risky-scout, cause-stress-increment,
patch-return. Static guards clean incl. the NEW structural guard (no `src/sim` import of
`patchExploitationKnowledge`); graph integrity 164/403, 0 dup, 0 dangling. **Sweep:** `--all --fast`
**24/24 completed (0 failed)**. **Validation scenarios (patchReturnAudit, end-of-run):** baseline 366 est /
8 bands (all observation_only / none_observed / unknown); harsh_dry_margin 206 (all observation-only);
unused_lake_daughter_colonization 158 (all observation-only); low_density_founder_attachment 29 (all
observation-only); crowded_delta_saturation 405 (404 observation_only + 1 processing_required_unknown;
5 safety_uncertain); over_capacity_core 435 (419 observation_only + 11 cautious_testing + 5
processing_required_unknown; 6 safety_uncertain) — the richer categories emerge exactly where food stress
drives real plant tests, `allGuardFlagsTrue` everywhere, macro outcomes (pop/bands/fissions) unchanged.
**Perf 100/200/300y:** 16.2/44.9/99.8s this run vs 10.3/35.3/93.1s on the same machine pre-2K.4 — the gap
shrinks with duration (+57%/+27%/+7%), consistent with background-load variance, not a per-tick cost (the
audit derivation runs ONCE at end-of-run over ≤bands×48 patches; sim outcomes are byte-equal: 306/8/3,
645/19/14, 1358/36/31); same pre-existing superlinear encounter shape, no new superlinear cost.

**Known limitations (honest):** (1) the view is DERIVED-only — there is no stored per-band exploitation
ring, so social transmission of exploitation knowledge beyond what patch-memory inheritance already carries
is future work (intentional: storage would need its own clone-guard/transmission scoping). (2) test/cause
evidence counts read the CAPPED recent rings (6) — they are recent-window tallies, not lifetime counts
(lifetime evidence lives in the patch memory's learning/useHistory, which the derivation also reads).
(3) `expectedReturn` beyond `unknown` currently requires plant-observation abundance/availability hints, so
generic (non-plant) patch memories report `unknown` return — honest v0 scope, visible in the baseline
aggregate. (4) classification thresholds (abundance/availability cutoffs, evidence minima) are v0 constants,
not yet swept per scenario. (5) NO behaviour reads the view yet — bands do not act on readiness; the
far-shore exploitation wall therefore stands until a later checkpoint wires visit→observe→exploit through
an explicit causal chain.

---

**Prior accepted checkpoint:** **M0.9 — Directional Corridor Persistence / Far-Shore Convergence v0**
(ACCEPTED 2026-06-06 after review; **independently re-verified 2026-06-09** — fresh full check matrix before
2K.4 started: build green; baseline 306/8/3 `deterministic=true` (two invocations identical, timing-only
diffs); lake audit deterministic across two runs (minDist 13→7, moves 730, wander 5.98, headingMoves 14,
reversals 108, heading band-seasons 2227, end-state heading strengths ≤0.82≤cap, `passed=true`); scale audit
passed (maintain25=2, persist=0.1, loop=0.64, sat=6, maxD=24, `map_scale_expansion`); dispersal +
dispersal-lineage + scout + all 4 plant suites passed; `--all --fast` 24/24; static guards clean; graph
164/403 0/0; perf 100/200/300y 10.3/35.3/93.1s — same pre-existing superlinear shape, no new cost. Code
review re-confirmed: heading reads only realized motion + own known-tile count (no truth/inferred richness
consumer exists — `corridorHeading` is referenced ONLY by types/mobilityIntent/bandDecision/demography-guard);
influence is direction-blend ≤0.5×strength + signed continuity bonus ≤0.06×strength on already-offered
corridor/expand candidates only; M0.8-B cooldown gates run BEFORE the heading can bias anything; daughter
colonization candidates never receive the heading; clone-guard + fission reset verified. The −3 baseline
delta is movement-path divergence only — structurally no demography/yield/stress coupling path exists — and
remains deterministic with bands/fissions unchanged; acceptance confirmed.) Goal: fix the remaining far-shore CONVERGENCE gap — bands drifted along the
shore/corridor instead of holding a gentle directional heading, re-picking the best LOCAL/nearest tile
each season so they never steadily progressed around the lake.

**Direction-loss audit (Task 1).** Bands lost heading because every re-selection re-derived direction from
scratch: `createCorridorCandidate`'s `directionVector` came from `getKnownCorridorDirection` (a VALUE/
confidence-weighted centroid of all known corridor tiles — shifts as the band moves) `?? context.previousVector`
(only the SINGLE last decision's move vector — `undefined` after any rest/forage) `?? getFrontierDirection`.
The target was `getBestKnownTileAlongDirection` — sorted by VALUE with only a tiny 0.18 directional dot, so
the band re-targeted the best-known LOCAL tile. `compareIntentCandidates` had no directional term, and the
M0.8-B cooldown created rest but carried no heading across it. The `kind !== previousKind` anti-repeat filter
then flipped it between `probe_coast`/`probe_wetland_or_lake`, each with a different centroid → oscillation.
So: re-targets nearest/best-local too often (YES), oscillates between shore kinds (YES), cooldown
rests-but-no-heading (YES), corridor memory stored no persistent direction (correct — none existed), local
value beat route continuity (YES, 0.18 dot vs ~1.0 value).

**Directional Corridor Persistence v0 (Task 2).** New bounded, anti-omniscient `CorridorHeadingState`
(`agents/types.ts`) a band EARNS from realized motion: `headingVector` (normalized realized direction),
`strength` (≤0.85), `source`, `lastProgressTick`, `consecutiveProgressSteps`, `knownTileCountAtProgress`,
`reasonIds`, `noOmniscientRichness:true`. Governor in `mobilityIntent.ts` (`advanceCorridorHeading`,
`effectiveCorridorHeadingStrength`, `getActiveCorridorHeading`): on a realized frontier_probe/corridor move
it can seed a weak heading from realized movement, but strengthens (+0.2, EMA-blends the heading) ONLY when
the step is aligned (dot ≥ 0.5) AND expanded the band's KNOWN frontier (`knownTileCount` grew — re-treading
known shore cannot strengthen a false heading). It decays on reversal (×0.4, re-seeds if the reversal opened
new frontier — rounding a corner), sideways/no-new-frontier (×0.78), and on REST via a read-time age decay
(gone after 20 idle seasons, so it SURVIVES the
M0.8-B cooldown at reduced strength). Advanced in `applyBandDecision` on `isAppliedCorridorOrProbeMove`;
never inherited (reset on fission + in `DAUGHTER_NON_CLONEABLE_FIELDS`).

**Narrow use (Task 3).** Only a tie-breaker among already-valid frontier candidates: (a) blend the
candidate's derived direction toward the heading (cap ≤0.5×strength) so the chosen target continues the
bearing; (b) a small SIGNED continuity score bonus (≤~0.05) preferring the heading-continuing kind and
mildly penalising an immediate reversal. It never overrides survival/water/refuge/cost, never forces
movement, never adds a candidate, never targets aquatic `tile:53:67`, and never reads richness.

**Result (lake audit).** Closest physical approach **9 → 7** (nearest-band dipped to 7 by ~year 150 as
headings built to effective strength ~0.82), WITHOUT exploding volume — mobility-intent frontier moves
**746 → 730**, wandering score **6.17 → 5.98**. Heading-reinforced moves 14, reversals 108, heading
band-seasons 2227; deterministic (two identical runs); `noOmniscientRichness=true`. Retention **still valid**
(maintain25 **2**, persist **0.1**, maxD **24**, `map_scale_expansion`). The exact far target stays
un-standable (aquatic by design); the remaining gap is now a **richness/observation** problem (`tile:53:68`
is inferred at distance 1, but not personally observed, and inferred existence ≠ exploitable richness), NOT a
heading problem. Baseline **deterministic**, 309/8/3 → **306/8/3** (−3 pop; bands/fissions unchanged → no
mass abandonment), accepted as a tolerated movement-calibration delta.

**M0.9 files changed:** `src/sim/agents/types.ts` (`CorridorHeadingSource` + `CorridorHeadingState` +
`Band.corridorHeading`), `src/sim/rules/mobilityIntent.ts` (heading constants + `advanceCorridorHeading` /
`effectiveCorridorHeadingStrength` / `getActiveCorridorHeading` / `blendDirectionTowardHeading` /
`corridorHeadingContinuityBonus`; heading threaded into `createCorridorCandidate` /
`createExpandKnownWorldCandidate` / `selectNewIntent`), `src/sim/rules/bandDecision.ts`
(`advanceCorridorHeading` wired in `applyBandDecision`; `isAppliedCorridorOrProbeMove`,
`corridorHeadingSourceForDecision`, `getRealizedMoveDelta`; `corridorHeading` in returned band),
`src/sim/agents/demography.ts` (`corridorHeading` in `DAUGHTER_NON_CLONEABLE_FIELDS` + reset),
`scripts/simBenchmark.mjs` (lake audit: per-checkpoint heading snapshot + `directionalPersistence` block —
heading-influenced moves, reversals, heading band-seasons, end-state headings, route progress 0/25/50/100/
150/200, before/after), `src/architecture/graphData.ts` (frontierKnowledge node summary + label/status
extended with M0.9; counts unchanged 164/403).

**M0.9 verification (2026-06-06):** `npm run build` + both typechecks green; baseline `deterministic=true`
(306/8/3, identical two runs); lake audit deterministic (two identical runs: minDist 7, moves 730, wander
5.98, headingMoves 14, reversals 108, `passed=true`); scale-audit retention **valid & passed** (maintain25=2,
persist=0.1, loop=0.64, sat=6, maxD=24); dispersal + dispersal-lineage + scout-regression + all 4 plant
suites passed; `--all --fast` **24/24 completed (0 failed)**; static guards clean (no `Math.random`/`: any`/
UI imports in `src/sim`); graph **164/403, 0 dup, 0 dangling**; review perf 100/200/300y **11.9/40.0/104.0s** (heading
governor is O(1) per move + O(1) per re-selection — no new superlinear cost). **M0.8-B calming preserved:**
burst/cooldown behaviour, daughter-dispersal exemption, survival/foraging/river-pass exemptions, marker-keyed
M0.8 relocation audit, `coreDeliberationBreadth`, and opt-in semantics all untouched; the heading only biases
candidates that are already offered (when cooling, nothing to bias).

**Known limitations (honest):** (1) convergence improved (9→7) but did NOT reach the approach tile — that
last gap is now a richness/observation limit (inferred existence ≠ exploitable richness), the correct
anti-omniscient wall, not a movement bug. (2) Heading-REINFORCED moves are few (14): strengthening demands
aligned AND frontier-expanding consecutive steps, so most influence comes from the direction BLEND (active in
2227 band-seasons) rather than the strong-heading bonus; v0 is intentionally gentle. (3) 108 reversals
remain — the continuity penalty discourages but does not forbid backtracking (survival/return can still win).
(4) Heading is reset (not degraded) on fission; a degraded inheritance for frontier-splitting daughters is a
future option. (5) Constants tuned on the regional debug world.

---

**Prior accepted checkpoint:** **M0.8-B — MobilityIntent Shoreline Wandering Calibration**
(**ACCEPTED 2026-06-06 after review.**) Goal: calm the EXCESSIVE shoreline/frontier wandering that M0.8-A traced to the
**pre-existing mobility-intent** system (NOT the inert M0.8 relocation candidate). M0.8-A proved the 1740
"relocations" were entirely `createCorridorCandidate`/`createExpandKnownWorldCandidate` `frontier_probe`
moves; this checkpoint lightly calibrates THOSE.

**Root cause (Task 1 audit).** A band on a permanently-high-affinity shore re-opens the affinity-driven
probes (`probe_coast` / `probe_wetland_or_lake` and pressure-driven `expand_known_world`) every few
seasons; the `kind !== previousKind` anti-repeat filter in `selectNewIntent` then forces it onto the
OTHER shore kind, so it drifts back and forth. Measured (lake world, 200y, before): **1740 mobility-intent
frontier moves** (parent 727 / daughter 1013), top movers the PARENT bands `delta-coastal-foragers` (~326)
and `lake-wetland-foragers` (~273); **wandering score 11.6** (moves ÷ distinct destinations — bands
re-tread the same ~12 shore tiles, i.e. oscillation, not coherent outward exploration). This movement is
what produced the 13→9 closest-approach (the M0.8 relocation candidate wins **0×**, only offered).

**Calibration (Task 2 — one bounded lever).** A `frontier_probe`-move CADENCE cooldown: after
`FRONTIER_PROBE_BURST_LIMIT`=3 consecutive `frontier_probe` mobility moves a band must re-anchor for
`FRONTIER_PROBE_COOLDOWN_SEASONS`=8 seasons before another SHORE probe is **OFFERED**
(`mobilityIntent.ts` `isFrontierProbeCooling` gates only `probe_coast` / `probe_wetland_or_lake` and the
PRESSURE-driven `expand_known_world`; the cadence advances in `applyBandDecision` via
`advanceFrontierProbeCadence`). It is a cadence cap ONLY — it never forces movement, never reads
truth/inferred richness, and deliberately leaves UNTOUCHED: survival (water/risk/return), local foraging,
river/pass corridor following, KNOWLEDGE-POOR expansion (`knownTileCount < 22` always allowed → genuine
exploration), and all genuine daughter expansion (`seek_new_range`/`frontier_dispersal`/colonization carry
a `frontier_dispersal_pressure` reason, never `frontier_probe`, so they never feed the cadence). New band
field `frontierProbeCadence`; never inherited (reset on fission + in `DAUGHTER_NON_CLONEABLE_FIELDS`).

**Result (lake audit, after).** Mobility-intent frontier moves **1740 → 746 (−57%)**; wandering score
**11.6 → 6.2**; cooldown was active for **1506 band-seasons**; closest physical approach
**preserved at 9** (initial 13 — progress NOT lost). Retention **IMPROVED, not harmed**
(`--targeted-frontier-drift-scale-audit`): maintain25 **1 → 2**, frontierPersistenceScore **0.03 → 0.1**,
localLoop 0.67 → 0.71, satellites 6, maxD **21 → 24** (`map_scale_expansion`) — calming the drift lets
daughters hold ranges AND reach slightly further. Baseline **deterministic** (`deterministic=true`,
identical across two runs) and near-identical: **310/8/3 → 309/8/3** (−1 pop, bands/fissions unchanged →
no parent mass abandonment; default world barely wanders, so the calm is almost inert there). M0.8 relocation
OFFERED count now emitted directly (**1299**; wins 0). `--all --fast` **24/24 completed (0 failed)**.

**M0.8-B files changed:** `src/sim/agents/types.ts` (`FrontierProbeCadenceState` + `Band.frontierProbeCadence`),
`src/sim/rules/types.ts` (`AlternativeConsidered` gains archive-only `isCorridorRelocation` marker so the
audit can count OFFERS), `src/sim/rules/mobilityIntent.ts` (cadence constants + `isFrontierProbeCooling` +
`advanceFrontierProbeCadence`; cooldown gate on the shore-probe / pressure-expand candidates in
`selectNewIntent`), `src/sim/rules/bandDecision.ts` (`advanceFrontierProbeCadence` wired in
`applyBandDecision`; `isAppliedShorelineProbeMove`; archived `isCorridorRelocation` on alternatives),
`src/sim/agents/demography.ts` (`frontierProbeCadence` in `DAUGHTER_NON_CLONEABLE_FIELDS` + reset),
`scripts/simBenchmark.mjs` (audit: per-band + parent/daughter mobility-intent split, wandering score,
emitted M0.8 relocation OFFERED count, probe-cooldown band-seasons, M0.8-B before/after block),
`src/architecture/graphData.ts` (frontierKnowledge node summary extended with the M0.8-B clause; counts
unchanged 164/403).

**M0.8-B verification / review (2026-06-06):** `npm run build` + both typechecks green; baseline
`deterministic=true` (309/8/3, identical two runs); lake audit deterministic (two runs identical: moves 746,
minDist 9, offered 1299, coolSeasons 1506, `passed=true`); scale-audit retention **improved & passed**
(maintain25=2, persist=0.1, loop=0.71, sat=6, maxD=24); dispersal + dispersal-lineage + scout-regression +
all 4 plant suites passed; `--all --fast` **24/24 completed (0 failed)**; static guards clean (no
`Math.random`/`: any`/UI imports in `src/sim`); graph **164/403, 0 dup, 0 dangling**; perf 100/200/300y
**12.6/43.8/123.6s** (cadence governor is O(1) per relevant event — no new superlinear cost; 300y high-end
reflects this review machine/session variance, same pre-existing O(bands²) encounter shape). **M0.8-A audit
correctness preserved** (Task 3): `isCorridorRelocation` marker, marker-keyed counting, the M0.8 relocation
rate-limit scaffold, `coreDeliberationBreadth`, and opt-in semantics are all untouched; the new offered
count is additive. Review explicitly accepts **310/8/3 → 309/8/3** as a tolerated calibration delta:
the cooldown intentionally changes real mobility-intent behaviour, while bands/fissions are unchanged and
no mortality/demography/yield/stress/carrying-capacity coupling change was found.

**Known limitations (honest):** (1) the calm is a CADENCE cap, not a full convergence fix — bands still
walk the shore, just in bursts-with-rests; far-shore CONVERGENCE remains the M0.9 directional-persistence
goal. (2) Suppressing a shore probe can let a non-`frontier_probe` move (return / river-corridor) win
instead, so a small part of the −57% is re-labelled rather than eliminated; the wandering-score drop
(11.6→6.2) confirms the NET drift genuinely fell. (3) Constants (burst 3 / cooldown 8) were tuned on the
water-rich regional debug world; they are inert-to-mild elsewhere (baseline −1 pop) but were not separately
swept per scenario.

---

**Prior accepted checkpoint:** **M0.8-A — Corridor Relocation Rate-Limit / Anchor Reluctance + Audit Correctness**
(**ACCEPTED 2026-06-05 after review; one report-only correction applied.**) Goal: reduce the flagged
1740-step shoreline "relocation" volume without undoing M0.8. **The audit revealed the flagged volume was
MIS-ATTRIBUTED.** The M0.8 lake
audit counted *every* `move_to_tile` carrying a `frontier_probe` primary reason as an "M0.8 corridor
relocation" — but that reason type is ALSO produced by the PRE-EXISTING mobility-intent system
(`createCorridorCandidate` / `createExpandKnownWorldCandidate` in `mobilityIntent.ts`). With the M0.8
relocation reason now carrying an explicit `isCorridorRelocation` marker, the true split is:
**M0.8 `buildCorridorRelocationCandidate` wins 0 times (offered 1091×, always dominated by a core
candidate); the 1740 are entirely pre-existing mobility-intent moves.** So M0.8's own relocation mechanism
is currently INERT, and the "13→9 progress" the M0.8 report attributed to it was actually achieved by the
pre-existing mobility-intent movement. M0.8-A (a) **corrects the audit conflation** (separate counters +
parent/daughter split), and (b) **adds the rate-limit the review asked for** to the M0.8 relocation
mechanism — a dwell-since-LAST-RELOCATION cooldown (replacing the absolute-`visitCount` loophole) + a
per-step anchor reluctance that decays after a stable dwell — so that IF the mechanism ever wins it is
bounded and converges. The cooldown/reluctance are **dormant in this world** (the mechanism never wins),
baseline-inert, anti-omniscient, bounded, deterministic. **Reducing the pre-existing mobility-intent
shoreline volume is OUT of M0.8-A scope** (it is accepted behaviour shared with the byte-identical
baseline path — changing it risks baseline determinism + retention); flagged for a separate, carefully
scoped future checkpoint if the visual calm is desired.

**M0.8-A files changed:** `src/sim/agents/types.ts` (`CorridorRelocationState` + `Band.corridorRelocation`),
`src/sim/rules/types.ts` (`frontier_probe` reason gains optional `isCorridorRelocation` marker),
`src/sim/rules/bandDecision.ts` (cooldown + anchor-reluctance gate/score in
`buildCorridorRelocationCandidate`; `isCorridorRelocation` marker on its reason; event-driven
`advanceCorridorRelocationState` in `applyBandDecision`; tightened `isAppliedCorridorRelocation`),
`src/sim/agents/demography.ts` (`corridorRelocation` in `DAUGHTER_NON_CLONEABLE_FIELDS` + reset),
`scripts/simBenchmark.mjs` (audit: marker-keyed M0.8 count, separate mobility-intent move count,
parent/daughter split, avg-per-band, rate-limit block, before/after; review-corrected lake-audit
`remainingBlocker` attribution), `src/architecture/graphData.ts` (review-corrected stale graph summary
wording only).

**M0.8-A review correction (2026-06-05):** fixed `scripts/simBenchmark.mjs` lake-audit
`remainingBlocker` wording and the stale `src/architecture/graphData.ts` summary sentence so the 13→9
closest-approach improvement is credited to pre-existing mobility-intent `frontier_probe` moves when
marked M0.8 relocation wins 0×.

**M0.8-A verification (2026-06-05):** `npm run build` green; **baseline 310/8/3 byte-identical** +
`deterministic=true` on the non-fast deterministic baseline (the new field stays undefined in baseline;
the gate is inert);
scale-audit retention **identical to M0.5–M0.8** (m25=1, persist=0.03, loop=0.67, sat=6, maxD=21); lake
audit deterministic and honest: **M0.8 relocation won=0, mobility-intent moves=1740**, minDist 9,
`passed=true`, closest physical approach 13→9 credited to mobility intent; dispersal + dispersal-lineage
+ scout-regression + all 4 plant suites passed; `--all --fast` **24/24 completed (0 failed)**; static
guards clean (no executable `Math.random`/`: any`/UI import violations in `src/sim`); perf 100/200/300y
~18.2/41.8/101.2s on this review machine (the rate-limit adds only O(1) ops per already-built candidate);
graph **164/403 unchanged** (no architecture node/link added — relocation already existed; M0.8-A only
governs its cadence). **Known limitation (honest):** because M0.8's relocation is dominated by pre-existing
mobility intent, the cooldown/reluctance are not *exercised* in this world; their correctness rests on
determinism + reasoning, not on a firing path. The recorded 1091× offer count is from the implementation
report; the current lake-audit JSON does not surface losing-candidate offer counts, so exact future offer
auditing should add an emitted counter. A reviewer wanting the shoreline visually calmer must target the
pre-existing mobility-intent movement (separate checkpoint), which M0.8-A deliberately leaves untouched.

---

**Prior accepted checkpoint:** **M0.8 — Confidence Coupling Fix + Bounded Corridor Relocation v0**
(**ACCEPTED 2026-06-05, review confirmed** — coupling fix clean; corridor RELOCATION mechanism present but
**M0.8-A found it INERT/dominated** — the reported 13→9 came from pre-existing mobility intent, not the
relocation candidate. One report-only correction applied: see review note below). Two parts.
**Part A** removes the candidate-count coupling
that forced M0.7's conditional append: travel-corridor confidence no longer scales with raw
`alternativesConsidered.length` (so offering a non-winning candidate cannot perturb band-known
confidence). **Part B** adds a narrow corridor RELOCATION: a settled band may step ONE observed
near-water tile toward its inferred corridor — so it can walk a band-known shore corridor, observe
further, and over time work around a lake — WITHOUT inferred richness, rich-tile chasing, forced
movement, or crossing open water. Prior **accepted:** M0.7 (below), M0.6, M0.5, M0.4, M0.3, 2K.3D,
2K.3C-A, 2K.3C, 2K.3B, 2K.3A-A, 2K.3A, 2K.2E. Prior audits: M0.2, M0.1, M0.

**What M0.8 Part A fixes (the coupling):**
- **Audit:** `memory.ts` set travel-corridor `confidence = 0.24 + useCount*0.18 +
  alternativesConsidered.length*0.02` — the ONLY consumer of the candidate count. So adding ANY
  candidate (even a never-winning one) raised corridor confidence, cascaded through corridor-driven
  behaviour, and collapsed the knife-edge frontier retention (proven in M0.7). This forced the M0.7
  conditional-append workaround.
- **Fix:** a new stable `Decision.coreDeliberationBreadth` (count of CORE survival candidates only —
  opt-in helper candidates flagged `isOptInCandidate` are excluded) replaces
  `alternativesConsidered.length` in that formula. In accepted runs no candidate is opt-in, so the two
  are equal → **byte-identical**. Now opt-in candidates (the M0.7 probe, the M0.8 relocation) are
  offered EVERY season WITHOUT conditional append and WITHOUT perturbing any band-known confidence.
  The M0.7 conditional append is removed.

**What M0.8 Part B adds (bounded corridor relocation):**
- New `buildCorridorRelocationCandidate` (`bandDecision.ts`): a SETTLED band (no frontier
  intent/established residence/dispersal ≥0.2) that has DWELT at its current tile
  (`CORRIDOR_RELOCATION_MIN_VISITS`=3 — settle→step→settle, anchor stays relevant) and personally
  OBSERVED an adjacent near-water-margin LAND step may relocate ONE step (move_to_tile) when that step
  strictly progresses toward its nearest inferred frontier tile (existence belief = DIRECTION only).
  The step target's value is the band's REAL observed record (never truth overlay, never an inferred
  tile used as yield); distance 1 (no far jump); never aquatic (so tile:53:67 can never be a target);
  route/crossing/water-refuge checked; a small directional curiosity (0.08, no anchor hold) tips a
  borderline step. Opt-in (excluded from `coreDeliberationBreadth`).
- **Lake audit result:** 8 deliberate probes (M0.7) PLUS bounded corridor relocations that move a band
  from distance **13 → 9** of the target (`band_relocated_closer_to_target_along_corridor`,
  `passed=true`). The exact far aquatic target stays un-standable; converging on a specific far shore
  needs sustained directional progress (v0 walks toward the nearest inferred tile, never a hidden truth
  target) — reported as the precise remaining blocker.

**M0.8 verification (2026-06-04):** `npm run build` + both typechecks green; **baseline 310/8/3
byte-identical** + `deterministic=true` (Part A fix + both opt-in candidates inert in the default
world); scale-audit retention **identical to M0.5/M0.6/M0.7** (maintain25=1, persist=0.03, loop=0.67,
sat=6, maxD=21); lake audit deterministic (2 runs: 8 probes, 1740 corridor steps confined to the
water-rich regional world, band reached distance 9, `passed=true`); M0/M0.1 audits + scout-regression +
plant-use-test passed; `--all --fast` **24/24**; static guards clean (3 scope-lock comments only); perf
100/200/300y ~9.9/29.2/78.1s (in line — opt-in candidates perf-neutral); graph **164/403** (node
summary updated; 0 dup, 0 dangling).

**M0.8 REVIEW (2026-06-05) — ACCEPT.** Independently re-ran every required check (this review machine,
slightly slower than the implementation run): `npm run build` exit 0 (pre-existing chunk warning only);
baseline **310/8/3 byte-identical** + `deterministic=true`; scale audit **maintain25=1 / persist=0.03 /
loop=0.67 / sat=6 / maxD=21** (identical to M0.5–M0.7, `multi_cluster_expansion`, passed); lake audit
deterministic (2 runs: **8 deliberate probes, 1740 corridor steps, 13→9**, far aquatic `tile:53:67`
un-standable, `noOmniscientRichness=true`, `realOpportunityOnlyAfterObservation=true`, passed);
dispersal + dispersal-lineage + scout-regression + all 4 plant suites passed; `--all --fast` **24/24
completed (0 failed-to-complete)**; static guards clean (no `Math.random`/`: any`/UI imports in
`src/sim` — only scope-lock comments); graph **164/403, 0 dup, 0 dangling**; perf 100/200/300y
**12.4/35.8/93.6s** (same superlinear encounter profile; relocation builder is O(neighbors)+O(≤256
inferred) per settled band/tick — no hidden superlinear cost).
- **Confidence coupling fix: architecturally CLEAN, not too narrow.** `coreDeliberationBreadth`
  (opt-in excluded) replaces `alternativesConsidered.length` in the ONLY place candidate-count fed back
  into band-known state — the travel-corridor confidence (`memory.ts:117`); a repo-wide grep confirms no
  other consumer of the count. `isOptInCandidate` is a safe default-false opt-in flag: any future helper
  candidate that must not perturb confidence simply sets it. Anti-omniscience for relocation **fully
  verified**: step value is the band's REAL `observedTiles` record; inferred tiles are used for DIRECTION
  only (nearest-tile Manhattan goal, never value); never aquatic (`isNearWaterMarginLand` rejects
  aquatic); land-only distance-1; route/crossing checked (`toTilePassable`, `blockedCrossingPenalty>0.8`);
  movement never forced (loses to a good stay/forage; +0.08 curiosity only tips a borderline idle step).
- **Report-only correction applied** (no sim behaviour, `passed` unaffected): the lake-audit
  `inferredFrontierAction.remainingBlocker` string (`simBenchmark.mjs`) still carried the **stale M0.7
  narrative** ("appended ONLY when it would win … coupled to `alternativesConsidered.length`") — which
  M0.8 explicitly removed and which contradicted `coupelingFixApplied` directly above it. Rewritten to the
  M0.8 reality (opt-in, offered every season, excluded from `coreDeliberationBreadth`, conditional append
  removed).
- **Relocation volume (the flagged concern) — NON-BLOCKING but real.** The 1740 steps are spread over
  **13 bands**, and the biggest movers are **PARENT bands** (`delta-coastal-foragers` 362,
  `lake-wetland-foragers` 302) — i.e. stable bands ARE over-mobile along the shore. At 4 ticks/yr, 200y =
  800 ticks, so the naive dwell cap is ~266 steps/band; **362 exceeds it**, meaning the `visitCount≥3`
  dwell gate does NOT fully enforce "settle→step→settle": because `placeMemory.visitCount` is the
  *absolute* per-tile count, a band stepping onto an *already-familiar* high-visitCount tile can re-step
  immediately, and since the goal (nearest inferred tile) keeps receding as inference expands, the walk
  **never converges** — it drifts. This violates no invariant (deterministic, bounded, anti-omniscient,
  unforced) and does NOT regress retention (the gate excludes residence-established daughters, so
  maintain25 etc. are untouched), but it is genuine shoreline wandering/visual noise in the water-rich
  world. **Recommend M0.8-A BEFORE M0.9:** add a per-band relocation cooldown and/or count dwell
  *since the last relocation* (not absolute `visitCount`) and/or an anchor-reluctance that grows with
  cumulative steps — so the walk is rate-limited AND eventually settles. The far-shore convergence gap
  itself (directional persistence toward a believed corridor, not richness leakage) is the separate M0.9
  goal.

---

**Prior accepted checkpoint:** **M0.7 — Act on Inferred Frontier Knowledge v0**
(ACCEPTED 2026-06-04, review confirmed). Lets bands CAUTIOUSLY act on M0.6 inferred shoreline
knowledge: a SETTLED near-water band may send a residence-UNCHANGED `logistical_probe` to the nearest
inferred frontier tile, OBSERVING it (inference → real knowledge) so normal opportunity/yield logic can
then evaluate it honestly — WITHOUT truth richness, rich-tile chasing, forced movement, or crossing open
water. (M0.8 removed its conditional-append workaround once the confidence coupling was fixed.) Prior
**accepted:** M0.6 (below), M0.5, M0.4, M0.3, 2K.3D, 2K.3C-A, 2K.3C, 2K.3B, 2K.3A-A,
2K.3A, 2K.2E. Prior audits: M0.2, M0.1, M0.

**What M0.7 adds (a NARROW, retention-safe behaviour change):**
- **Blocker audit (Task 1):** the M0.6 inferred tile `tile:53:68` never surfaces as a usable
  opportunity because (a) `KnownUnusedHabitatOpportunity` / daughter / fission / move candidates all scan
  the band's OBSERVED tiles only (inference is a separate channel, decision-inert in M0.6); and (b)
  `explore_unknown_neighbor` is adjacency-only while inferred tiles sit BEYOND the band's observed 2-ring
  (they are almost never immediate neighbours — confirmed: explore-eligible count ≈0). So the band needs
  a way to deliberately go LOOK at an inferred tile.
- **New mechanism (`bandDecision.ts`):** `buildInferredFrontierProbeCandidate` — a residence-UNCHANGED
  `logistical_probe` to the NEAREST band-known inferred frontier tile within a bounded radius (4),
  passable LAND, route/crossing-checked. It carries NO resource/yield value (inference has no richness);
  the probe reason is a tiny frontier-curiosity signal (0.16), while final scoring uses only low
  existence confidence plus current refuge/route/risk context. It is **gated to SETTLED bands** (no active
  frontier intent / established residence / dispersal ≥0.2) so it never disturbs frontier daughters'
  expansion or retention. On application the existing observation pipeline OBSERVES the tile
  (inference → real `KnownTileRecord`); the M0.6 channel then PRUNES the now-observed tile from its
  inferred set (conversion).
- **The retention-safety key — conditional append:** place-memory confidence is coupled to
  `decision.alternativesConsidered.length` (`memory.ts`), so adding ANY non-winning candidate to the
  decision set perturbs every band's confidence and **collapses the knife-edge frontier retention**
  (proven: a probe scored to NEVER win still drove `maintain25` 1→0). The fix: the probe is appended
  **only when it would actually WIN** the decision. So when the band does NOT act, the candidate set is
  byte-identical to before (determinism + retention preserved); when it DOES, the band genuinely chose to
  reconnoitre. This — plus the settled gate — is why **baseline stays byte-identical (310/8/3,
  deterministic=true)** and the **scale-audit retention is identical to M0.5/M0.6**
  (`maintain25`=1, `frontierPersistenceScore`=0.03, localLoop 0.67, satellites 6, maxD 21).
- **Lake audit before→after:** root cause stays `known_unused_opportunity_does_not_surface_it` (inferred
  existence ≠ exploitable richness — correct), but now **8 deliberate inferred-frontier probes** fire over
  200y (`settled_bands_deliberately_probe_inferred_frontier`): settled near-water bands physically scout
  inferred corridor tiles, converting inference→observation, after which normal opportunity logic applies.
  The FAR target/approach tile is not reached because the probe is residence-unchanged (radius 4, no
  forced march); closing that distance needs relocation along the corridor — a later, separately-gated
  step. `passed=true`; `no_omniscient_richness`=true; `real_opportunity_only_after_observation`=true.

**M0.7 review verification (2026-06-04):** `npm run build` + both typechecks green; baseline determinism
**310/8/3 byte-identical** + `deterministic=true`; scale-audit retention **identical to M0.6** (passed:
`maintain25=1`, `frontierPersistenceScore=0.03`, `localLoopScore=0.67`, satellites 6, maxD 21);
lake audit passed (8 deliberate inferred-frontier probes, 197 conversions, `no_omniscient_richness=true`,
`real_opportunity_only_after_observation=true`); M0/M0.1 audits + scout-regression + plant targeted suites
passed; `--all --fast` exited 0; static guards clean; 100/200/300y deterministic benchmarks completed
(17.7s / 52.8s / 121.4s sim runtime); graph **164/403** (+1 behaviour link `frontierKnowledge→movement`;
0 duplicate node ids, 0 dangling). Review fixes applied: conditional append now compares post-intent-shaped
scores, the probe target must be reachable by a bounded observed-or-inferred land route with per-edge
passability/crossing checks, and the lake audit directly asserts deliberate inferred-frontier probes.

---

**Prior accepted checkpoint:** **M0.6 — Frontier Knowledge Formation / Shoreline Exploration Propagation v0**
(ACCEPTED 2026-06-04, review confirmed). Closes the M0.5 lake-audit knowledge gap: a new **pure**
module `src/sim/agents/frontierKnowledge.ts` lets a band with sustained presence on a water boundary
gradually INFER the EXISTENCE of the next reachable near-water LAND tiles (the around-lake corridor),
so a genuinely reachable far shore can BECOME band-known — WITHOUT omniscient richness, rich-tile
chasing, or forced movement. Prior **accepted:** M0.5 (below), M0.4, M0.3, 2K.3D, 2K.3C-A, 2K.3C,
2K.3B, 2K.3A-A, 2K.3A, 2K.2E. Prior audits: M0.2, M0.1, M0.

**What M0.6 adds (a NARROW, decision-INERT knowledge channel):**
- **Knowledge-expansion audit (Task 1):** the M0.5 target stays truth-only because a band's known
  world only grows by (a) its own 2-ring observation on a move (`collectObservationTargets`) and (b)
  re-scouts of ALREADY-known patches (`selectResourceScoutTarget` iterates `state.patchMemories` only —
  it never reaches a genuinely unknown tile); `explore_unknown_neighbor` only steps into immediate
  passable unknown NEIGHBOURS. So the around-lake LAND corridor is never traversed and the far shore is
  never learned. The audit also found the picked target `tile:53:67` is itself an **aquatic**
  (river_valley water, truth-richness 0.99) tile a band cannot stand on, and the lake's shoreline is
  fragmented into tiny disconnected pockets — the ONLY land link from a band's lakeside to the target's
  approach pocket is a corridor that hugs the water within ~2 tiles (strict shore-adjacency = K1 leaves
  a 3-tile component that never connects; the near-water margin = K2 is one connected 906-tile
  component that reaches the approach tile `tile:53:68`, distance 1 from the target).
- **New mechanism (`frontierKnowledge.ts`):** `advanceFrontierShorelineKnowledge` — tick-gated in
  `applyFrontierOpportunityContext` after [[frontierResidence]]. A band ON a near-water margin land tile
  (a bounded depth-2 local BFS finds water within 2 tiles) WITH sustained presence (visitCount ≥ 2)
  infers the next reachable near-water LAND tiles, **one bounded ring per season** (cap 2/season, hard
  cap 256/band), **id-ordered**, stepping out from its OWN band-known margin tiles (observed OR already
  inferred). Each inferred record stores **ONLY** existence + near-water topology + provenance
  (`originKnownTileId`) + low confidence (0.2) — **NO richness/yield/water value of any kind**, and the
  literal `noOmniscientRichness: true` guard. Never crosses open water (land-only, adjacent-step only),
  never directs toward a hidden target (id-ordered). Reset on fission (a daughter forms her own;
  registered in `DAUGHTER_NON_CLONEABLE_FIELDS`).
- **Decision-INERT (the key safety property):** nothing in scoring reads `frontierKnowledge`. It forms
  the knowledge substrate ONLY; a later checkpoint may let bands ACT on it, and only a real visit ever
  learns richness. **Proven:** baseline `--scenario baseline --years 100 --deterministic` stays
  **byte-identical (310/8/3, deterministic=true)** and the `--targeted-frontier-drift-scale-audit`
  retention is **identical to M0.5** (maintain25=1, persist=0.03, localLoop=0.67, satellites=6, maxD=21,
  `multi_cluster_expansion`). So M0.5 retention does NOT regress and normal scenarios are unchanged.
- **Lake audit before→after:** `truth_overlay_only_unknown_to_band` → the approach tile `tile:53:68`
  (adjacent to the rich aquatic target) becomes inferred by ~year 14 (`band:dry-margin-foragers`,
  origin `tile:52:68` → `tile:53:68`), `closestKnownTileDistanceToTarget` 1, `knowledgeOutcome`
  `approach_tile_became_known_target_pending`, audit `passed=true`. The exact target stays
  **un-inferred by design** (it is aquatic — un-standable, and inference is land-only). The **honest
  remaining blocker** (now the primary root cause `known_unused_opportunity_does_not_surface_it`):
  inferred knowledge is existence-only and decision-inert, so it does NOT surface as an opportunity —
  that still requires a real visit to confirm richness. Wiring bands to ACT on inferred shore knowledge
  is the next step.

**M0.6 verification (2026-06-04 review):** `npm run build` green (pre-existing chunk warning only);
src + node typechecks exit 0; baseline determinism **310/8/3 byte-identical** + `deterministic=true`; scale audit
retention **identical to M0.5** (passed); lake audit deterministic (two runs identical:
`approach_tile_became_known_target_pending`, dist 1, 4064 total inferred, `passed=true`); direct tile
audit confirmed `tile:53:67` is aquatic/unstandable and `tile:53:68` is a passable land approach tile;
M0 `--targeted-dispersal-audit` + M0.1 `--targeted-dispersal-lineage-audit` + scout-regression +
plant patch/lifecycle/eligibility/use-test all `passed=true`; `--all --fast` **24/24 complete**;
static guards clean (no `Math.random` calls / explicit `any` / UI imports in `src/sim`); perf
100/200/300y **11.3/39.1/106.6s** in this review run (completed; 300y remains acceptable but slower
than the earlier handoff machine/session number); graph **164/402** (+1 node `frontierKnowledge`, +4
links; 0 dup, 0 dangling). Report-only correction applied: the lake audit now exposes target
`isAquatic`/passability and requires passable adjacent approach tiles.

---

**Prior accepted checkpoint:** **M0.5 — Frontier Retention Refinement + Opposite-Shore Reachability
Audit** (ACCEPTED 2026-06-04 — superseded knowledge gap addressed by M0.6 above). Two parts. **Part A
(behaviour):** replaced M0.4's force-magnitude retention weights (stay-hold 2.4 / inward-damp 3.0) with
a principled, tie-breaker-scale mechanism. **Part B (audit-only):** new `--targeted-lake-opportunity-audit`
diagnosed why no band reaches the rich patch across the lake. Prior **accepted:** M0.4 (below), M0.3,
2K.3D, 2K.3C-A, 2K.3C, 2K.3B, 2K.3A-A, 2K.3A, 2K.2E. Prior audits: M0.2, M0.1, M0.

**What M0.5 Part A changes (retention, less force):**
- **Return-pull audit:** the M0.4 inward-damp (−2.4) dominated the inward-retreat decision (other
  score terms ≤0.34). The return-pull audit found a daughter returns inward partly for MEMORY reasons
  (origin attachment / return-place / inherited familiarity / a known opportunity back toward origin)
  but ALSO for a LEGITIMATE band-known reason: the interior she came from has higher OBSERVED
  food/confidence than her young frontier. A pure origin-pull reduction therefore CANNOT hold her
  alone (proven: relief-only → maintain25 back to 0) — fully removing the force needs the frontier to
  BECOME band-known-good (a future knowledge-formation checkpoint).
- **New mechanism (`frontierResidence.ts`, model unchanged):** `frontierResidenceOriginPullRelief`
  returns a MULTIPLIER (≤1, floored 0.15) that DISCOUNTS the daughter's origin-ward memory pull
  (placeAttachment / returnPlacePull / inheritedFamiliarity / familiarCorridor / inward
  knownOpportunityPull) for INWARD candidates once she has earned strong residence — it only scales an
  existing pull DOWN (never adds → cannot push her anywhere unsafe). Her FRONTIER-locus attachment
  (the stay option) is left untouched. Plus a small stay-hold (**0.3**, was 2.4) and a much-reduced
  residual inward-damp (**0.8**, was 3.0) that bridge the legitimate knowledge gap.
- **Result (`--targeted-frontier-drift-scale-audit`, 200y):** `daughtersMaintainNewRange25Years`
  **1** (>0 ✓), `frontierPersistenceScore` **0.03** (>0 ✓), longest hold 28y, reach preserved
  (maxD 21); and clustering IMPROVED vs M0.4 — **localLoopScore 0.73→0.67, local satellites 7→6** — at
  ~4× lower force. Daughter not trapped (de-establishes on water/return collapse). Baseline stays
  **byte-identical (310/8/3)** → parents unaffected.

**What M0.5 Part B finds (audit only — NO behaviour, NO lake migration added):**
- New deterministic `node scripts/simBenchmark.mjs --targeted-lake-opportunity-audit --json`. It picks
  the richest opposite-shore lake-margin resource tile with the lake BETWEEN it and its nearest band
  (deterministically **tile:53:67**, an aquatic river_valley/marsh tile, truth-richness 0.99, water 1.0),
  runs the regional world 200y, and
  reports band-known-vs-truth status, opportunity candidacy, route/cost (land BFS), crossing/shore
  knowledge, frontier-holding, and a local-richness comparison — then classifies the root cause.
- **Root cause: `truth_overlay_only_unknown_to_band`** (primary), with
  `known_unused_opportunity_does_not_surface_it`, `crossing_or_shore_memory_missing`,
  `frontier_residence_holds_earlier_frontier`. No band EVER observes the target: the closest any band
  gets is **12 tiles** (the lake-wetland band on the opposite shore), the lake blocks direct approach,
  and bounded perception/scouting never carries knowledge across. Because candidacy requires a
  band-KNOWN tile, the patch never enters any opportunity / fission-target candidate set
  (`never_band_known_so_never_a_candidate`). It is NOT terrain-unreachable — an around-lake LAND path
  exists (14 steps vs 12 straight, detour 1.17×) — but no band has a knowledge-driven reason to explore
  it (no crossing/shore memory; its nearest band's own home is nearly as rich, 0.91 vs 0.99). This is
  the **anti-omniscient design working as intended**, not a bug — so **no behaviour fix was applied**
  (the cause is perception/knowledge propagation, not a candidate-cap omission). A future fix would be
  exploration/scout-range/around-lake-corridor discovery — NOT rich-tile chasing or omniscient richness.

**M0.5 verification (2026-06-04):** `npm run build` + both tsconfigs green; baseline determinism
**310/8/3 matched** (byte-identical — Part A inert outside frontier daughters, Part B audit-only);
scale audit deterministic (m25=1, persist 0.03, loop 0.67, `multi_cluster_expansion`); lake audit
deterministic (tile:53:67, `truth_overlay_only_unknown_to_band`, passed); M0/M0.1 audits + scout +
plant-use suites passed; `--all --fast` **24/24** (baseline 8/308/3); static guards clean (only
scope-lock comment hits); perf 100/200/300y ~7.7/27.5/76s; graph **163/398** (0 dup, 0 dangling — the
`frontierResidence` node summary updated to the M0.5 mechanism; no new nodes/links).

---

**Prior accepted checkpoint:** **M0.4 — Frontier Retention via Emergent Band-Known Frontier Value**
(**ACCEPTED 2026-06-04, review confirmed — retention validated; force-magnitude weights refined in
M0.5**). This is the second M0.x behaviour fix. It RESOLVES the
M0.3 limitation (`improved_reach_without_retention`): daughters now both reach AND hold frontier
ranges. Prior **accepted:** M0.3 (below), 2K.3D, 2K.3C-A, 2K.3C, 2K.3B, 2K.3A-A, 2K.3A, 2K.2E. Prior
audits: M0.2, M0.1, M0.

**Review note (2026-06-04):** Verified and **accepted with a flagged risk**. Anti-omniscience holds —
every residence input is band-known (the 6 established-residence snapshots all carry
`noOmniscientRichness=true`, `localWaterConfidence` 0.64–0.8, `localReturnTrend` 0.84–0.94); residence
is daughter-only (parents structurally excluded), never inherited (reset on fission + clone-guarded),
and reversible. Retention is real and not a metric artefact: 3 daughters hold a distinct range 38–50y
(`maintain25` 0→3, `frontierPersistenceScore` 0→0.12). All required checks pass: build, both
typechecks, baseline determinism **310/8/3 byte-identical**, scale audit `map_scale_expansion`
deterministic, M0/M0.1 audits, scout/plant suites, `--all --fast` 24/24, static guards clean, graph
**163/398** (0 dup, 0 dangling). **Two empirical findings resolved the main (weight-magnitude)
concern in M0.4's favour without dismissing it:** (1) established daughters are **NOT frozen** — the
top holders forage actively (e.g. `move_to_tile` 543 vs `stay` 21) while holding distance 13–17 from
origin, so the mechanism does not broadly overpower movement; it specifically blocks the
inward-toward-origin retreat. (2) The latent ~2y "trap" does **NOT manifest**: across all 6
established snapshots, **0** sit at a declining-return or water-poor locus — the de-establishment valve
empirically releases a daughter before her locus goes bad, so a genuinely poor frontier is still
abandoned. **The flagged risk (real, non-blocking):** the weights (stay-hold 2.4, inward-damp 3.0) are
**force-magnitude, NOT tie-breaker-scale** — relative to the other score terms (≤0.34) the −2.4
inward-damp dominates the inward-retreat decision, so retention is force-dependent (collapses below
~1.2) and the response is non-monotonic/chaotic. The "never overrides cost/refuge/stress" framing was
inaccurate; safety is preserved by the GATING (good-water/good-return value + de-establishment), not by
the terms being small. One **report-only correction** applied during review (no behaviour change, build
+ typecheck green): the `bandDecision.ts` residence comment now states the force-magnitude reality and
points to the M0.5 refinement. **Verdict: ACCEPT M0.4** — retention improved and demonstrably safe in
testing; **clustering NOT fully solved** (`localLoopScore` 0.80→0.73, local satellites flat at 7); the
strong-additive weights should be replaced by a principled return-pull reduction in **M0.5** (keep the
validated frontierResidence model).

**What M0.4 adds (a NARROW, tightly-gated behaviour change):**
- New **pure** module `src/sim/agents/frontierResidence.ts`: a compact, decaying, anti-omniscient
  `FrontierResidenceValue` a frontier DAUGHTER **earns** by dwelling at a locus she has genuinely
  pushed out to. `advanceFrontierResidence` (tick-gated, advanced in `applyFrontierOpportunityContext`
  right after the M0.3 intent), `frontierResidenceStayHold`, `frontierResidenceInwardDamp`.
- **Return-pull audit (Task 1, the root cause):** the M0.3 retention=0 is an **oscillation** problem,
  not absent reach. Daughters already spend large *cumulative* time outside the origin radius (one
  spends 22y cumulative, the best holds 15.25 *consecutive* years) but keep stepping back across the
  radius toward a marginally-better-**known** interior locus (reformed `placeAttachmentPull` ≈0.8–0.96
  + band-known inner opportunities at per-capita ≈1.0), breaking the streak before a 25-year range can
  form. Fix: let the OUTER locus earn durable band-known hold-value so she stops stepping back in.
- **Evidence (band-known only):** local return trend (`rangeSaturation.perCapitaReturnEstimate` +
  `returnTrend`, penalised hard on chronic decline), water/refuge confirmation (her own place-memory
  water stress + reliable valence + band-known opportunity water reliability), band-known opportunity
  near the locus, her OWN formed place attachment + visits (repeated presence), and corridor memory.
  Reach is measured as Manhattan distance from her **lineage origin** (walked up the parent chain to
  the founder — band-known ancestral-home knowledge; required so a 2nd-gen daughter born already-out at
  her mother's frontier is measured from where the LINEAGE began, matching the audit metric). Never
  reads truth richness (`noOmniscientRichness=true`).
- **Narrow behaviour use (two seams, only once `established`):** (1) `frontierResidenceStayHold` — a
  hold on the stay option while she is genuinely beyond the origin radius; (2) `frontierResidenceInwardDamp`
  — a penalty on a MOVE that steps INWARD toward origin. The damp **only ever penalises an inward
  step, never rewards an outward one**, so it can hold a reached range but can NEVER push her toward
  an unknown/unsafe outer tile. Both summed inside the clamped move/stay score.
- **Daughter anchor handling (Task 4):** residence is **never inherited** (reset to `undefined` on
  fission, registered in `DAUGHTER_NON_CLONEABLE_FIELDS`) — a daughter earns her own. It **competes
  with** the remembered origin attachment at decision time without erasing it (the inherited memory is
  untouched; she still retreats when local value collapses). Parents (no `parentBandId`) never qualify
  → they keep their refuge.
- **Self-limiting safety:** the value REQUIRES good local water + return as components, so it only ever
  holds a locus that is already band-known-good → it cannot trade away water/refuge safety; and it
  decays to `undefined` (~2y) when water/returns fail → a genuinely poor frontier is still abandoned.

**M0.4 result — M0.3 vs M0.4 (same `--targeted-frontier-drift-scale-audit`, 200y, no override):**
| metric | M0.3 (reach only) | M0.4 (reach + retention) |
|---|---|---|
| classification | `improved_reach_without_retention` | **`map_scale_expansion`** |
| `daughtersMaintainNewRange25Years` | 0 | **3** |
| `daughtersMaintainNewRange50Years` | 0 | **1** |
| `frontierPersistenceScore` | 0 | **0.12** |
| longest continuous range hold | 15.25 y | **50.5 y** (also 40 y, 38 y) |
| max lineage distance from origin | 19 | 27 (reach preserved/extended) |
| localLoopScore | 0.80 | 0.73 (modestly down) |
| local satellites | 7 | 7 (flat) |
| active bands / fissions | 20 / 15 | 20 / 15 |
- **Tuning note / known risk (review-confirmed):** the two scoring weights (stay-hold 2.4, inward-damp
  3.0) are **force-magnitude, not tie-breaker-scale** — the −2.4 inward-damp dominates the
  inward-retreat decision relative to the other score terms (≤0.34), so retention is **force-dependent**
  (collapses below ~1.2) and the multi-band response is **non-monotonic/chaotic**. The review found
  this does NOT broadly overpower movement (established daughters still forage freely — 543 moves vs 21
  stays — only the inward-toward-origin retreat is blocked) and does NOT trap them (0/6 established
  snapshots at a declining/water-poor locus; the de-establishment valve releases before a locus goes
  bad). Effect is confined by the gating (daughters-only, far-from-origin, good-water/good-return,
  inward-penalty-only, never inherited, decays on decline) — proven by the baseline staying
  **byte-identical** (310/8/3). **M0.5 should replace the strong additive hold/damp with a principled
  multiplicative reduction of the inward return-pull** (same retention at tie-breaker magnitude,
  removing the chaos + latent ~2y trap). A lower pair (~1.8/2.2) trades robustness for a stronger
  loop-score drop (0.80→0.56, m25=1) if a gentler stopgap is preferred before M0.5.

**M0.4 verification (2026-06-04):**
- `npm run build` green (pre-existing chunk-size warning only); both tsconfigs typecheck exit 0.
- Baseline determinism: `--scenario baseline --years 100 --deterministic` → `matched=true`,
  **pop 310 / bands 8 / fissions 3** — byte-identical to M0.3 / the 2K.3D reference (M0.4 is provably
  inert where there is no genuine frontier daughter, confirming parents are unaffected).
- Scale audit deterministic: two consecutive runs byte-identical (`map_scale_expansion`, m25=3,
  persist 0.12, maxD 27), `passed=true`.
- M0 `--targeted-dispersal-audit` and M0.1 `--targeted-dispersal-lineage-audit` `passed=true`.
- Targeted suites green: scout-regression, plant-use-test, cause-stress-increment.
- Normal sweep `--all --fast` → **24/24 complete**, no destabilization (baseline 8/308/3).
- Static guards clean: no `Math.random`/`any`/UI in `src/sim` (the only string hits are the scope-lock
  doc comments in `frontierResidence.ts` / `frontierIntent.ts`).
- Perf in line with the pre-existing profile: 100y ~7.7s, 200y ~27.4s, 300y ~75s (residence adds only
  a bounded lineage walk + a few vector ops per established daughter).
- Graph: **163 nodes / 398 links** (+1 node `frontierResidence`, +7 links), 0 duplicate ids, 0 dangling.

---

**Prior accepted checkpoint:** **M0.3 — Bounded Frontier Intent / Known-Corridor Persistence v0**
(**ACCEPTED 2026-06-04, review confirmed — retention was UNRESOLVED, now resolved by M0.4**). The first
M0.x **behaviour fix** (M0/M0.1/M0.2 were audit-only).

**Review note (2026-06-04):** Verified. FrontierIntent reads only band-known/scouted/inherited
evidence — the 31 intent snapshots in the audit are sourced exclusively from
`known_unused_opportunity` (22), `corridor_memory` (6), `repeated_probe` (3); `noOmniscientRichness`
is `true` on every one, so there is no truth-richness/omniscience leak. The move/fission terms are
genuine tie-breakers summed inside the existing `clamp01` score (drift pull is `isStay ? 0` so parents
keep their refuge; stay-hold only applies once arrived; fission alignment relaxes — never inverts —
the distance penalty, so "farther is always better" is NOT introduced and the `score < 0.46`
viability bar is unchanged). Strength is capped at exactly 0.85 and age at 20y (both confirmed in the
audit), the daughter inherits a degraded (not hard-locked) intent registered in
`DAUGHTER_NON_CLONEABLE_FIELDS`, and the intent decays to `undefined` (fully reversible). Build green;
baseline determinism `matched=true` (310/8/3, byte-identical fingerprints, daughter now reaches
distanceFromParent 12 = the intended shift); M0/M0.1 audits `passed=true`; scout + plant-use-test
suites green; static guards clean (the only `Math.random`/`any`/UI string hits are inside the
scope-lock doc comment); graph **162/391, 0 dup, 0 dangling**; `--all --fast` 24/24 complete, no
destabilization. **One report-only correction applied during review** (no sim behaviour, does not
affect `passed`): the scale-audit classifier was overstating — it tagged `sustained_frontier_range`
on a one-time max-distance threshold crossing even with `daughtersMaintainNewRange25Years = 0`. The
word "sustained" with zero retention is self-contradictory and would mislead a future agent into
thinking M0.2's retention problem was solved. `sustained_frontier_range` is now gated on genuine
multi-decade retention; the reach-only case is honestly classified
**`improved_reach_without_retention`** (which is what the normal map now produces: maxDist 10→19,
clusters 1→8, but `frontierPersistenceScore`/`maintained25Years`/`localLoopScore` flat). **Verdict:
ACCEPT M0.3 — reach is genuinely and anti-omnisciently improved; retention remains UNRESOLVED and is
the explicit M0.4 goal.**

**What M0.3 adds (a NARROW behaviour change — the first M0.x fix):**
- New **pure** module `src/sim/agents/frontierIntent.ts`: a compact, persistent, decaying,
  anti-omniscient **FrontierIntentState** (`advanceFrontierIntent` / `inheritFrontierIntentForDaughter`
  / `frontierIntentPull` / `frontierIntentHold`). It is the missing converter the M0.2 root cause
  named: unlike the stateless per-tick `FrontierDispersalPressure`, it **persists across seasons and
  decays**, so repeated **band-known** evidence accumulates into a small sustained outward intent.
- **Evidence (band-known only):** corridor memory / frontier dispersal, repeated probes
  (`probeMemory`), known-unused habitat opportunity, crowding / range saturation, chronic poor
  returns (`returnTrend`), and daughter/frontier pressure. It NEVER reads hidden tile truth richness
  (`noOmniscientRichness=true`).
- **State (new optional band field `frontierIntent`):** tick-gated `lastUpdatedTick`, band-known
  `targetTileId` + `directionVector` + `preferredCorridor`, dominant `source`
  (known_unused_opportunity / repeated_probe / corridor_memory / crowding / poor_return /
  daughter_fission), capped `strength` (≤0.85), `confidence`, `age` (hard cap ~20y), `evidenceStreak`,
  bounded `reasonIds`. Advanced once per season (tick-gated) in
  `applyFrontierOpportunityContext` (`socialContext.ts`); decays to **undefined** when evidence fades
  (fully reversible, no permanent trace).
- **Narrow behaviour use (only three seams):** (1) **daughter/fission target scoring**
  (`scoreFissionTarget` in `demography.ts`): a bounded parent-intent alignment bonus + partial
  distance-penalty relaxation biases daughter targets **further along a band-known corridor**;
  (2) **logistical-probe / move candidate scoring** (`expectedFutureValue` in `bandDecision.ts`): a
  bounded outward **drift pull** + a mild **backtrack penalty** against returning to origin + an
  **arrival stay-hold**, summed INSIDE the clamped score next to movement cost / refuge security /
  lossOfFallback / attachment — a tie-breaker that never overrides them; (3) **sustained corridor
  drift** as the cross-generation ratchet of (1)+(2).
- **Daughter inheritance:** a frontier-driven daughter inherits a **degraded** intent
  (strength × 0.6, source `daughter_fission`, heading = her genuinely-outward spawn direction) — NOT
  a hard parent-attachment lock; it decays unless her own evidence renews it. Registered in
  `DAUGHTER_NON_CLONEABLE_FIELDS` + explicitly overridden in the fission spread (clone guard green).
- **Debug/report:** the `--targeted-frontier-drift-scale-audit` per-band snapshot now reports the
  live `frontierIntent` (source, strength, confidence, age/ageYears, evidenceStreak, lastEvidenceScore,
  target + target distance, preferred corridor, `noOmniscientRichness`, `influencesDaughterTargetScoring`,
  `influencesProbeMoveScoring`, and a `boundedRole` note explaining why it never overrides
  refuge/cost). Daughter path-over-time stays in the existing checkpointTable + records.

**M0.3 result — M0.2 before/after (same `--targeted-frontier-drift-scale-audit`, 200y, no override):**
| metric | M0.2 (before) | M0.3 (after) |
|---|---|---|
| classification | `corridor_probe_without_frontier` | **`improved_reach_without_retention`** (reach up, retention flat — see review note) |
| max lineage distance from origin | 10 | **19** |
| median / p90 distance | 5 / 10 | 5 / 9 |
| distinct range clusters | ~1 (clustered) | **8** |
| frontierPersistenceScore (25y streak) | 0 | **0** (unchanged — see limitation) |
| localLoopScore | 0.81 | 0.80 |
| active bands / fissions | 21 / 16 | 20 / 15 |
- Intent demonstrably forms and persists: ~18–20/20 bands hold an intent, strength up to 0.85, ages
  to ~17y, almost all anti-omniscient corridor/opportunity sourced. Parents stay near refuge (no mass
  abandonment); daughters reach the frontier (one sub-lineage hit d=15 by year 100, another d=19 by
  year 200).
- **Honest limitation (documented, not hidden):** strict multi-decade retention
  (`frontierPersistenceScore` / `daughtersMaintainNewRange25Years`) remains **0**. Root cause is
  correct/anti-omniscient, not a bug: a band that reaches an unknown frontier rationally returns to
  its **known-good interior** (the unknown ahead has low expected value), and FrontierIntent is
  deliberately a bounded tie-breaker, not a force. True 25-year retention needs the frontier itself to
  become **band-known-good** through foraging/learning — an emergent process a single deterministic
  200y lineage does not fully complete. Closing it WITHOUT forcing is the recommended M0.4.

**M0.3 verification (2026-06-03):**
- `npm run build` green (only the pre-existing Vite large-chunk warning).
- Baseline determinism: `--scenario baseline --years 100 --deterministic --json` → `matched=true`,
  year 100, **pop 310 / bands 8 / fissions 3** (byte-identical to the 2K.3D reference macro).
- Scale audit deterministic: two consecutive `--targeted-frontier-drift-scale-audit` runs produced
  byte-identical headline metrics (20/15/651, max 19, 8 clusters, `sustained_frontier_range`).
- M0 `--targeted-dispersal-audit` `passed=true`; M0.1 `--targeted-dispersal-lineage-audit` `passed=true`.
- Targeted suites green: scout-regression, cause-event-check, cause-stress-readiness-check,
  cause-stress-increment, plant-use-test-check (all `passed=true`).
- Normal scenario sweep `--all --fast` → **24/24 complete**, no destabilization (baseline 8 bands,
  crowded/over-capacity/unused/rich/low-density all stable; the only macro delta is the intended
  daughter-target/movement shift, e.g. baseline daughter now reaches d=12 vs prior local clustering).
- Static guards clean: no `Math.random`, no `any`, no UI/render/React/Zustand imports in `src/sim`
  (frontierIntent.ts imports only core/agents/world types + `getTile`).
- Perf in line with the pre-existing superlinear profile: baseline 100y ~8s, 200y ~27s, 300y ~75s;
  FrontierIntent adds only a few bounded vector ops per band per tick.
- Graph: **162 nodes / 391 links** (+1 node `frontierIntent`, +9 links to corridors/unused/
  daughterPressure/saturation/returnTrend/fission/movement/longRangeMigration), **0 duplicate ids,
  0 dangling** (the 2 pre-existing duplicate *links* are unchanged).

**Prior checkpoint:** **M0.2 — Scale-Aware Frontier Drift / Local-Clustering Audit**
(AUDIT COMPLETE 2026-06-03). Prior audits: M0.1, M0. Prior **accepted:** 2K.3D, 2K.3C-A,
2K.3C, 2K.3B, 2K.3A-A, 2K.3A, 2K.2E.

**What M0.2 adds (audit/report only — NO behaviour change):**
- New deterministic benchmark command:
  `node scripts/simBenchmark.mjs --targeted-frontier-drift-scale-audit --json`.
- Runs the normal spawned **regional debug map** for **200 years** with no behavior overrides and
  tracks all initial root lineages plus descendants at years **0 / 25 / 50 / 100 / 150 / 200**.
- Reports scale-aware frontier metrics: max/median/p90 lineage distance from origin, distinct
  range clusters, cluster radius around origin, bands within 3/6/10/15/20 tiles, daughters that
  leave then return, sustained-new-range counts for 25+ and 50+ years, corridor contact/progress,
  frontier persistence score, local-loop score, occupied/known tile coverage, truth-richness vs
  band-known opportunity, and known-unused-opportunity distance from lineage origin.
- Adds three bounded lineage examples: most expanded lineage, most clustered daughter, and loop /
  return example, each with fission/spawn tiles, checkpoint tiles, max/final distance, time outside
  origin radius, latest action/reason, attachment/refuge, known unused opportunity, and corridor
  memory/contact. Undefined pre-birth checkpoint tiles are reported as `null`.

**M0.2 finding:**
- The normal regional map **does fission** (16 fissions by year 200) and all 16 active fission
  daughters touch corridor/floodplain tiles, but this does **not** become map-scale frontier drift.
  Final active bands: 21. Final lineage distance from origin: max **10**, median **5**, p90 **10**.
  All 21 bands remain within 10 tiles of their lineage origin, 15/21 remain within 6 tiles, and
  21/21 remain within 20 tiles. No daughter maintains a new range outside the origin radius for
  25 or 50 years. `frontierPersistenceScore=0`, `localLoopScore=0.81`.
- Classification: **`corridor_probe_without_frontier`** with tags `fission_but_clustered`,
  `local_satellite_only`, `short_loop_return`, `corridor_probe_without_frontier`.
- Root cause: **corridor memory/probe is not converted into sustained frontier intent**. Secondary
  evidence: daughter spawn targets are too local for map scale (median distance 3), known-unused
  opportunity exists but is local (p90 candidate distance 8; 20/21 known opportunity candidates
  within 10), some daughters leave then return, and strong place/refuge or safe-locality pull keeps
  descendants clustered. The final snapshots do **not** support a primary "truth overlay
  misleading because unknown" explanation: richer corridor/opportunity is often band-known, but
  remains local.
- M0/M0.1 thresholds were **too lenient for visual map-scale dispersal**. A 7-9 tile displacement
  can pass the older fixture as `daughter_reaches_new_range`, but M0.2 treats that as weak/local
  unless it persists for decades and/or forms distinct frontier clusters.
- No fix was applied. M0.2 did **not** add rich-tile migration, omniscient richness, forced daughter
  departure, global attachment weakening, all-band nomadism, yield/carrying-capacity/stress/
  mortality changes, plant/cause/stress changes, randomness, or UI imports into `src/sim`.

**M0.2 verification (2026-06-03):**
- `npm run build` green (Vite large-chunk warning only).
- Baseline deterministic: `node scripts/simBenchmark.mjs --scenario baseline --years 100
  --deterministic --json` → completed, determinism `matched=true`, year 100, fissions 3,
  population 310, active bands 8.
- M0 check: `node scripts/simBenchmark.mjs --targeted-dispersal-audit --json` → `passed=true`.
- M0.1 check: `node scripts/simBenchmark.mjs --targeted-dispersal-lineage-audit --json`
  → `passed=true`; both older-threshold cases still classify `parent_stays_daughter_expands`.
- New scale audit: `node scripts/simBenchmark.mjs --targeted-frontier-drift-scale-audit --json`
  → `passed=true`, year 200, all checkpoint years recorded, all initial lineages tracked, no
  behavior override.
- Static guards: no `Math.random` in `src/sim` or `scripts/simBenchmark.mjs`; no TypeScript
  `any` guard hits in `src/sim` or `scripts/simBenchmark.mjs`; no UI/render/React/Zustand imports
  in `src/sim`.
- Graph unchanged; integrity check remains 161 nodes / 382 links / 0 duplicate ids / 0 dangling
  links.

**Prior audit:** **M0.1 — Long-Run Daughter Lineage / Tile-Path Dispersal Audit**
(AUDIT COMPLETE 2026-06-03).

**What M0.1 adds (audit/report only — NO behaviour change):**
- New deterministic benchmark command:
  `node scripts/simBenchmark.mjs --targeted-dispersal-lineage-audit --json`.
- Long-run lineage tracing at years **0 / 10 / 25 / 50 / 75 / 100 / 150** for parent and daughter
  bands: fission tick/year, parent tile at fission, daughter spawn tile, parent/daughter tile path,
  distance from parent, distance from original refuge, net/max displacement, corridor contact,
  known-vs-truth richer corridor visibility, latest action/reason, attachment/refuge, known unused
  opportunity, range saturation/exhausted range, probe/scout/fission reason.
- The command runs two cases:
  1. **`m0_fixture_lineage`** — direct M0 comparison (regional world + M0 crowding daughters).
  2. **`single_founder_lineage`** — only the dry-margin founder remains at year 0, so unrelated
     seed bands do not hide whether one founder lineage can expand.

**M0.1 finding:**
- The M0 fission **does create range expansion**, not just a nearby daughter. In both cases the
  parent stays at the original refuge (`tile:39:60`, distance 0), while the real fission daughter
  spawns toward corridor range and is still at `tile:40:54` at year 150 (distance **7** from
  original refuge / parent; max distance **9**; corridor tile visits **4**).
- Classification for both cases: **`parent_stays_daughter_expands`** with tags
  `daughter_explores_corridor`, `daughter_reaches_new_range`, `parent_stays_daughter_expands`.
  Root-cause classifier reports **`lineage_expansion_working_in_audit`**.
- Important limit: this proves the M0/M0.1 fixture can expand, including from one founder band, but
  it does **not** prove the whole default world naturally colonizes from a single unpressured origin.
  A broader origin-to-world expansion model/audit is still a separate architecture question.
- No fix was applied. M0.1 did **not** add rich-tile migration, omniscient richness, forced daughters,
  global attachment weakening, yield/stress/mortality/carrying-capacity changes, plant/cause/stress
  changes, randomness, or UI imports into `src/sim`.

**M0.1 verification (2026-06-03):**
- `npm run build` green.
- Baseline deterministic: `node scripts/simBenchmark.mjs --scenario baseline --years 100
  --deterministic --json` → completed, `deterministic=true`, year 100, fissions 3, population 310.
- M0 check: `node scripts/simBenchmark.mjs --targeted-dispersal-audit --json` → `passed=true`.
- New lineage audit: `node scripts/simBenchmark.mjs --targeted-dispersal-lineage-audit --json`
  → `passed=true`; both cases complete; checkpoint years recorded; M0 fission tracked; no behavior
  override.
- Static guards: no `Math.random`; no TypeScript `any` usage (`: any` / `as any`); no UI/render/
  React/Zustand/DOM imports in `src/sim`.
- Graph unchanged; integrity check remains 161 nodes / 382 links / 0 duplicate ids / 0 dangling links.

**Prior audit:** **M0 — River-Corridor / Daughter Dispersal Root-Cause Audit**
(AUDIT COMPLETE 2026-06-03).

**What M0 adds (audit/report only — NO behaviour change):**
- New deterministic benchmark command:
  `node scripts/simBenchmark.mjs --targeted-dispersal-audit --json`.
- Scenario design: dry-margin parent remains attached to a familiar water/refuge tile; richer
  river/floodplain corridor opportunities exist nearby; some are **band-known** via observed /
  inherited records, while richer downstream corridor truth is intentionally **unknown** and
  labelled as debug-only overlay contrast. Population/crowding make fission possible, but normal
  movement/fission gates decide stay/probe/move/fission.
- Diagnostic report is bounded: current tile + local richness; known richer nearby tiles; unknown
  richer corridor truth tiles (explicitly not band-known); attachment/refuge; water reliability;
  per-capita return trend; range saturation/exhausted range; crowding/shared catchment pressure;
  known unused habitat opportunity; probe/scout history; daughter/fission pressure and gate; latest
  decision/alternatives; corridor memory; and why the final decision won.

**M0 root-cause finding:**
- The targeted audit **does not reproduce a simple over-sticky failure**. The parent remains near
  the known refuge, but the normal path repeatedly chooses `logistical_probe`, detects a viable
  `KnownUnusedHabitatOpportunity`, raises daughter pressure to `seek_new_range`, and creates a real
  fission event through existing demography gates (population conserved).
- Strongest finding for the original long-run visual concern: the issue is likely **case-specific
  visibility/instrumentation or long-run knowledge propagation**, not an obvious global "parent
  attachment too strong" or "daughter fission impossible" bug. The UI richness overlay can be
  misleading unless it distinguishes **truth richness** from **band-known opportunity**.
- No fix was applied because no tiny obvious simulator bug was found. In particular, M0 did **not**
  add "move to richest tile", omniscient richness, forced daughter departure, global attachment
  weakening, yield/carrying-capacity/stress/mortality changes, plant/cause changes, or randomness.
- Graph unchanged: existing nodes already cover this audit (`Migration / Daughter Dispersal`,
  `River Corridor / Corridor Memory`, `Known Unused Habitat Opportunity`,
  `Attachment / Place Memory`, `Scenario Library`, `Performance Budget`); graph integrity remains
  161 nodes / 382 links / 0 duplicate ids / 0 dangling links.

**M0 verification (2026-06-03):**
- `npm run build` green.
- Baseline deterministic: `node scripts/simBenchmark.mjs --scenario baseline --years 100
  --deterministic --json` → completed, `deterministic=true`, year 100, fissions 3, population 310.
- New audit: `node scripts/simBenchmark.mjs --targeted-dispersal-audit --json` → `passed=true`;
  1 fission; final parent decision `logistical_probe:tile:39:57`; 8 known richer nearby records;
  8 unknown richer debug-only corridor tiles; root cause classified
  `targeted_audit_no_oversticky_repro`.
- Targeted suites green: scout regression, plant patch/lifecycle/eligibility/use-test, cause event,
  cause coverage, cause stress readiness, cause stress increment, natural-risk scenarios.
- Normal scenario sweep: `node scripts/simBenchmark.mjs --all --fast --json` → 24/24 complete,
  2196 ticks, 8 fissions.
- Static guards: no `Math.random`; no TypeScript `any` usage (`: any` / `as any`); no UI/render/
  React/Zustand/DOM imports in `src/sim`.

**Prior accepted checkpoint:** **2K.3D — First Bounded Cause-Attributed Nonlethal Stress Increment**
(ACCEPTED 2026-06-02, review confirmed).

**What 2K.3D adds (feature-flagged, reversible, derived-only — NO behaviour change by default):**
- New **pure** module `src/sim/agents/causeStressIncrement.ts`:
  `deriveCauseStressContributionV0(event, { enabled })` + `summarizeCauseStressContributionV0(...)`.
  It maps a cause event → readiness → a **tiny, capped, cause-LABELLED stress contribution**
  (delta = readiness-base × confidence-scale × domain-scale; per-event cap **0.04**, band cap
  **0.08**). It adds **no band state** (derived on demand from the existing cause-event ring,
  like `causeStressReadiness`).
- **Feature flag, default OFF.** Benchmark `--enable-cause-stress-v0` opt-in; module param
  `{ enabled }` defaults `false`. With the flag OFF the **applied** delta is exactly **0**; the
  *potential* (`cappedStressDelta`) is still reported so the report/UI can show "what would apply".
- **v0-eligible domains only:** `food_safety` and `processing_uncertainty`. `illness_suspicion`,
  `water_safety` (placeholder), `fallback_low_value`, `avoidance_caution`, `unknown_cause` →
  applied 0 even with the flag on.
- **Stored/reported SEPARATELY as `causeStressContributionV0`** — it is **never** written into
  `pressureState`/`foodStress` (the stress blob that feeds movement/viability/demography), so it
  drives **no** behaviour until a later, separately-reviewed checkpoint wires it in. Hence flag
  on/off is **macro byte-identical**, and the increment is fully **reversible/stateless** (turning
  the flag off again yields exactly the off result; the increment stores no permanent memory).
- New regression **`--targeted-cause-stress-increment`** (6/6): flag-off applies nothing; flag-on
  applies a tiny bounded delta **only** for the two eligible domains; ineligible domains stay 0;
  reversible (off-again == off); all no-coupling flags; band aggregate off=0 / on>0 capped;
  deterministic. Live check `--targeted-live-risky-scout [--enable-cause-stress-v0]` now reports
  the contribution: OFF → applied 0; ON → `food_safety` applied **0.009** — **macro identical**
  (5/142/0/0) in both.
- Debug/report/UI: benchmark band report `causeStressContributionV0` block (flag OFF, labelled
  "feature-flagged nonlethal v0 / reversible / audited — derived-only, NOT pressureState");
  BandPanel shows the contribution with a UI flag **OFF by default** (`would-apply X → applied 0`).
- **No new sim modules wired into behaviour, no new band state, no new graph nodes/links**
  (graph **161/382**, summary edits only on `causeStress`/`stress`/`illnessPoison`/`riskRandom`).
  Build green; all targeted suites + scout regression + baseline determinism green; static guards
  clean; full scenario sweep macro **byte-identical** to 2K.3C-A (`cause=0`/`residenceMoved=0`);
  perf in line; 500y tracked-only.

**Review note (2026-06-02):** Verified. `causeStressContributionV0` is derived/report-only and
is **not** written into `pressureState`, stress state, movement scoring, viability, demography,
yield, or carrying capacity. Flag OFF applies 0; flag ON only appears in targeted/audit/report
paths and remains macro-identical in the live risky-scout check (5/142/0/0). Full sweep with
probe audit completed 24/24 scenarios with `cause=0`, `residenceMoved=0`, and no readiness
application. Build, targeted suites, static guards, and graph integrity (161/382, 0 dup, 0
dangling) are green. Do **not** implement 2K.3E until architect approval.

**2K.3C-A — Autonomous Live Risky-Scout Trigger v0** (ACCEPTED 2026-06-02, review confirmed).
Prior **accepted:** 2K.3C, 2K.3B, 2K.3A-A, 2K.3A, 2K.2E.

**Review note (2026-06-02):** Verified. `resourceClassUrgency` is used ONLY in
`selectResourceScoutTarget` (scout-candidate VOI) → `buildResourceScoutCandidate`, which is a
residence-UNCHANGED information action — so the medicinal change is strictly scout/information,
never yield/stress/relocation. Bounded (cap 0.6, below food/fallback max 1.0), stress-gated
(desperation≥0.45 else baseline 0.12). **Provably inert:** the full sweep shows
`medicinalScouts=0` in every scenario, so the changed branch never returns a non-baseline value
naturally; macro is byte-identical to 2K.3C (baseline 8/310/3, harsh 8/290/3, overcap 13/477/3,
unused 8/312/3, crowded 11/382/2, lowdens 1/13/0, rich 3/82/1; `cause=0`/`residenceMoved=0`) and
baseline determinism `matched=true`. `patchTileRisk` `baseRichness` addition is backward-
compatible (only the new scenario passes it). Live check uses the real `evaluateBandDecision`/
`applyBandDecision` tick loop (not object construction); no-coupling flags all true, residence
unchanged, byte-identical determinism. Build + all targeted suites + scout regression green;
static guards clean; graph 161/382, 0 dup, 0 dangling. **Future-risk to revisit at 2K.3D+:** once
real medicinal/toxic beliefs/patches are naturally generated, this urgency becomes live —
re-confirm then that it stays information-only and never seeds food/yield/relocation.

**What 2K.3C-A adds (autonomous live coverage — ONE small, bounded sim change):**
- New deterministic scenario **`risky_plant_scout_live`** + regression
  **`scripts/simBenchmark.mjs --targeted-live-risky-scout [--json]`**. It runs the REAL tick
  loop (`evaluateBandDecision`/`applyBandDecision` + context passes) on a crowded/food-stressed
  band anchored to a reliable-water refuge in a poor scrubland catchment, which **autonomously
  chooses a `medicinal_toxic` resource_scout** toward a believed risky patch (tick 17 in the
  fixture). Integration depth: **`live_decision_tick_loop`** — the deepest possible (the band's
  own decision selects the scout; only the seeded belief + scenario terrain are set up).
- Live chain verified end-to-end: autonomous scout → `safety_uncertain` eligibility →
  `medicinal_toxic_caution` test (`suspected_safety_risk`) → `suspected_toxicity`
  CauseSpecificEvent → **food_safety** CauseStressReadiness, **residence unchanged**,
  `appliedToActualStress=false`, all no-coupling flags true. 8/8 assertions; byte-identical
  on repeat (deterministic).
- **The ONE sim change** (the scope-sanctioned "minimal scout-candidate path"):
  `resourceScout.ts` `resourceClassUrgency` now gives a **bounded, stress-gated** medicinal/toxic
  **SCOUT** urgency (gate desperation≥0.45, cap 0.6) — INFORMATION pressure only. It never makes
  a medicinal/toxic plant attractive food, never grants yield/support, never relocates the band,
  and stays at/under food urgency. It is **inert for non-stressed bands** (baseline 0.12) and for
  **every existing scenario** (none seed a medicinal/toxic belief, and such patches almost never
  materialize): the full scenario sweep macro is **byte-identical** to 2K.3C
  (baseline 8/310/3, harsh 8/290/3, over_capacity 13/477/3, …; `cause=0`/`residenceMoved=0`
  everywhere) and baseline determinism still `matched=true`.
- The 2K.3A-A retention/opportunity guard is **not** exercised by this live medicinal scout
  (it produces a safety-warning, not a durable poisoning flag) — that guard is exercised in
  `--targeted-natural-risk-scenarios` (case D). Reported honestly via `guardNote`.
- **No new sim modules, no new band state, no new graph nodes/links** (graph **161/382**, 0 dup
  ids, 0 dangling; node summaries updated for `scenarioLibrary`/`causeStress`/`resourceScout`).
  Build green; all targeted suites + natural-risk suite + scout regression + baseline
  determinism green; static guards clean; perf 100/200/300y in line, 500y tracked-only.

**2K.3C — Natural Risk Scenario Library / Coverage Before Real Stress** (ACCEPTED 2026-06-02,
review confirmed). Prior **accepted:** 2K.3B, 2K.3A-A, 2K.3A, 2K.2E.

**Review note (2026-06-02):** Verified — B/C genuinely run the perception layer
(`updatePlantObservationMemory` rebuilds the memory's `suspectedSafetyRisk`/
`suspectedProcessingNeed` from the real `derivePlantScoutObservationHint`; the seed memory's
flags are both `false`, so the risk-relevant flags driving the cause event come from tile
truth, not the seed). A honestly labelled seeded; E honestly labelled readiness-map-only. No
coupling into stress/yield/CC/perCapitaReturn/mortality/demography/movement/relocation/fission;
the suite calls only read/derive functions. Guard correct (retention 1.29>0.89, opportunity
0.12<0.59). Static guards clean; graph 161/382, 0 dup ids, 0 dangling; live sweeps still
`cause=0`/`residenceMoved=0`. Build + all targeted suites + baseline determinism green.

**What 2K.3C adds (scenario/coverage/debug only — NO behaviour, NO new sim modules):**
- New benchmark regression `scripts/simBenchmark.mjs --targeted-natural-risk-scenarios
  [--json]`: a deterministic natural-risk scenario library that drives risky plant →
  cause-specific event → stress-readiness chains through the **same modules and ordering
  bandDecision uses**, at the deepest depth current infra allows. Five cases:
  - **A** risky **medicinal/toxic** caution → `safety_warning_created` → **food_safety**
    (seeded scouted medicinal_toxic memory; medicinal_toxic rarely materializes above its
    rare threshold on common tiles — documented gap).
  - **B** **processing-risk** plant → `processing_problem_suspected` → **processing_uncertainty**,
    and explicitly **NOT** poisoning (`poisoningOrBadReaction=false`). **Deepest depth:**
    real world-tile TRUTH → `derivePlantScoutObservationHint` → `applyResourceScoutLearningDelta`
    → eligibility → test → cause → readiness.
  - **C** **fallback risky trial** (dry-margin roots/USO) → `mild_bad_reaction_suspected` →
    **illness_suspicion**, **no calories/stress relief**. Same world-tile-truth perception depth as B.
  - **D** **repeated caution memory**: the same risky patch cautioned twice; verifies the
    2K.3A-A guard — risk **raises retention** (1.29 vs 0.89) but **does not raise opportunity**
    (0.12 vs 0.59, discounted).
  - **E** **water-safety placeholder** → **water_safety** readiness via the readiness MAP only
    (no plant_test path emits water causeKinds yet; reserved-source event, documented).
- Full per-case + aggregate **audit block**: scenario names, scout/plant-test/cause-event
  counts, causeKind/stressDomain/memoryEffect tallies, readiness signal count,
  risk/caution memory count, risk-retained patch count, opportunity-discount check,
  derived band-level `summarizeCauseStressReadiness` aggregate, and all no-coupling flags
  (`noStress/noMortality/noPopulation/noYield/noRelocation/noCarryingCapacity` +
  `appliedToActualStress=false`). 14/14 assertions pass; **byte-identical** on repeat runs.
- **No new sim code, no new band state, no new graph nodes/links.** Graph node *summaries*
  updated only (`scenarioLibrary`, `causeStress`, `illnessPoison`, `riskRandom`): still
  **161 nodes / 382 links**, 0 duplicate node ids, 0 dangling links.
- **Live scenario sweeps still fire 0 cause events** (baseline/harsh_dry_margin/over_capacity_core/
  unused_lake/crowded_delta/low_density/rich_core: `residenceMoved=0`, `cause=0`,
  `readinessSig=0`, macro unchanged) — bands scout only benign plants. This is the
  **known gap** the suite documents: it drives the scout-perception + post-scout chain
  directly because the band's autonomous DECISION to choose a risky scout is the only
  un-exercised seam. Macro/determinism unchanged vs 2K.3B.

**2K.3B — Cause-Labelled Nonlethal Stress Readiness** (ACCEPTED 2026-06-02).

**What 2K.3B adds (pure derived readiness layer — NO new band state):**
- New module `src/sim/agents/causeStressReadiness.ts`: `deriveCauseStressReadiness(event)`
  classifies a `CauseSpecificEvent` into a **future stress domain** (`food_safety`,
  `water_safety`, `processing_uncertainty`, `illness_suspicion`, `fallback_low_value`,
  `avoidance_caution`, `unknown_cause`), a `stressReadiness` level (none/trace/mild_future/
  moderate_future_placeholder), `wouldAffectFuture` labels, and a band-level aggregate
  (`summarizeCauseStressReadiness`) **derived on demand from the existing bounded
  cause-event ring** — no new ring, no Band fields, no demography/clone-guard change.
- Mapping: toxicity/spoilage → food_safety; plant_reaction/sickness/parasite →
  illness_suspicion; processing_problem → processing_uncertainty; bad_taste → fallback_low_value;
  water_safety/contaminated_water → water_safety; `avoided_due_to_risk`/`avoidance_hint_added`
  → avoidance_caution; unknown → unknown_cause.
- **HARD SCOPE LOCK:** `appliedToActualStress=false` always; signals never change real stress,
  mortality, population, yield, carrying capacity, per-capita return, movement scoring,
  relocation, fission, or avoidance behaviour; no random poisoning; no disease spread.
- Debug/report/UI: benchmark `scoutAudit` tallies `causeStressReadinessByDomain/ByLevel`;
  band report `causeStressReadiness` block (aggregate + latest signal); BandPanel shows the
  derived `stressDomain/stressReadiness → future …` with "readiness only" labelling.
- New `--targeted-cause-stress-readiness-check` (8 mapping cases incl. real-chain
  toxicity→food_safety + processing→processing_uncertainty, plus water/fallback/unknown/
  avoidance mappings; aggregate + determinism). Graph: 161 nodes / **382 links** (+3 futureHook
  edges, existing nodes only).
- **Inert for natural runs** (readiness only exists where a cause event fires, which is 0
  naturally) → macro/determinism byte-identical to 2K.3A-A.

Prior accepted work below stands unchanged (2K.3A-A guard, 2K.3A scaffold).

**Architect decision (recorded):** *Risk/caution memory MAY improve a patch's retention
(a band remembers a place that harmed it), but it MUST NOT increase that patch's resource
opportunity attractiveness.* 2K.3A-A enforces this.

**What 2K.3A-A adds:**
- **Retention-vs-opportunity guard** in `deriveResourceBeliefOpportunity`
  (`resourceKnowledge.ts`): a patch with durable risk flags (`hasDurableRisk`) has its
  opportunity contribution multiplied by `CAUTION_OPPORTUNITY_DISCOUNT = 0.2`. `riskSalience`
  still raises `resourcePatchRetentionScore` (retention preserved); opportunity is discounted,
  never raised. Verified: flagged patch opportunity 0.15 vs 0.77 baseline, retention 1.31 vs
  0.91. **Inert in current scenarios** (no patch is risk-flagged unless a cause event fires,
  which doesn't happen naturally yet) → macro/determinism unchanged.
- **Processing-only semantic split** (`causeSpecificEvent.ts`): a `fallback_trial` with only
  `suspectedProcessingNeed` (no prior safety caution) now yields `processing_problem_suspected`
  (causeKind `suspected_processing_problem`, raises processing suspicion only, **no** durable
  poisoning flag). Only a fallback trial with **prior safety caution** yields
  `mild_bad_reaction_suspected` (durable poisoning caution). Processing concern is no longer
  mislabeled as suspected poisoning.
- **Natural-risk coverage check** `--targeted-cause-coverage-check`: drives a CauseSpecificEvent
  through the real post-scout integration chain (`derivePlantUseEligibility` →
  `applyPlantUseTestFromEligibility` → `deriveCauseSpecificEventFromPlantUseTest` →
  `appendRecentCauseSpecificEvent`) — not isolated object construction — and asserts the event
  fires, the ring stores it, caution memory updates, the retention/opportunity guard holds, all
  no-coupling flags, and determinism across repeated runs.
- **Debug/report:** band report `causeSpecificEvents.riskRetentionAudit` now shows
  `riskyRetainedPatchCount`, `cautionMemoryCount`, `riskContributesToRetention: true`,
  `riskContributesToOpportunityAttractiveness: false`.

**What 2K.3A does:** adds a new module `src/sim/agents/causeSpecificEvent.ts` with a typed,
deterministic, **nonlethal** `CauseSpecificEvent` scaffold. After a plant-use/test (2K.2E)
produces a *risk-relevant* result, a bounded cause event may be derived:
- `source` (plant_test now; water/food/processing reserved), `causeKind`
  (suspected_plant_reaction / suspected_toxicity / suspected_processing_problem / … ;
  water/spoilage/pathogen reserved), `severity` (none/trace/mild/moderate_placeholder),
  `confidence` (suspected/plausible/strong_later), `outcome` (safety_warning_created /
  avoided_due_to_risk / processing_problem_suspected / mild_bad_reaction_suspected /
  no_effect_observed / cause_uncertain), `memoryEffect` (none / caution_added /
  safety_confidence_lowered / processing_suspicion_raised / avoidance_hint_added).
- It writes only conservative **band-known caution memory** — behaviour-neutral durable risk
  flags (`poisoningOrBadReaction`, `tabooOrAvoidanceFutureFlag`) + plantObservation
  safety/processing suspicion, with safety capped ≤0.2 — plus a capped (6) per-band ring
  (`lastCauseSpecificEvent` / `recentCauseSpecificEvents`).
- **Most plant tests produce NO cause event** (observe-only/seasonality/cautious_sample →
  none). Events fire only for suspected safety risk, avoidance, processing suspicion, or a
  fallback trial with prior suspicion.

**Scope lock honored — the event NEVER changes** population, mortality, stress,
effectiveYield, carryingCapacity, perCapitaReturn, relocation, fission, or movement scoring;
there is **no random poisoning**, no real illness/disease, no storage/crafting, no harvest.
Safety/processing stay suspicion-level. Confirmed structurally: yield/CC paths
(`carryingCapacity.ts`/`habitatYield.ts`) don't import `resourceKnowledge` or read the
patch-memory profile/risk flags; the durable risk flags only feed `plantUseEligibility`
(knowledge loop) + UI.

**Validation (all green):** `npm run build` exit 0; deterministic baseline 150y
`deterministic=true` (incl. event window); targeted **cause-event check 5/5** + plant-use-test
8/8 + eligibility/lifecycle/patch/scout regressions passed; static guards clean (no
`Math.random`/`any`/UI imports in `src/sim`); graph **161 nodes / 379 links** (+8, existing
nodes only) / 0 duplicate node ids / 0 dangling (the 2 duplicate *links* are pre-existing,
not from 2K.3A). Scenario sweep (harsh_dry_margin, over_capacity_core, unused_lake…,
crowded_delta_saturation, low_density_founder_attachment, rich_core_still_viable):
`residenceMoved=0`; macro outcomes unchanged from pre-2K.3A behaviour; **0 cause events fired
naturally** because all natural plant tests were benign `observe_only`/`learned_seasonality`
(0 risk-relevant results) — verified that is correct, not a wiring bug.

**Known watchouts (non-blocking):**
1. **Natural coverage is observe-only:** current scenarios never scout risky/medicinal/
   processing-required plants, so cause events are exercised only by the targeted regression,
   not by live runs (same pattern as 2K.2E plant tests). A future scenario seeding risky
   plant encounters would give natural coverage.
2. **Caution only accumulates:** durable `poisoningOrBadReaction` / `tabooOrAvoidanceFutureFlag`
   never relax, so a patch can become permanently safety-cautious. Bounded + behaviour-neutral
   now, but caution decay/re-test is a future need.
3. 2K.2E `cautious_sample` per-scout cadence watchout still stands.
4. Two **pre-existing** duplicate graph *links* (from 2K.1A/2K.2D) remain.

**Key files for cause-specific events:** `src/sim/agents/causeSpecificEvent.ts` (model +
derivation + ring), integration in `src/sim/rules/bandDecision.ts` (after plant-use test;
ring append in caller), band fields in `src/sim/agents/types.ts`, daughter reset + clone
guard in `src/sim/agents/demography.ts`, debug type in `src/sim/agents/resourceScout.ts`,
UI in `src/ui/BandPanel.tsx`, audit + `--targeted-cause-event-check` in
`scripts/simBenchmark.mjs`, graph in `src/architecture/graphData.ts` (`causeStress`,
`illnessPoison`, `foodTesting`, `toxicity`, `processing`, `mistakeMemory`,
`learnedWorldModel`, risk nodes).

---

## Recommended Next Step

**Current recommendation after the accepted demographic-persistence
checkpoint:** EXPEDITIONARY LOGISTICAL MOBILITY / TASK CAMPS / VIEWSHED
PERCEPTION / FIRE SIGNALS-1. Preserve physical receipts and the repaired
demographic response. Address multi-day access, provisioning, task-camp
placement, viewshed-limited perception, field processing, retrieval, and return
logistics without creating local food or revealing hidden ecology. The older
recommendations below are historical checkpoint context and do not override
this current roadmap.

**After PERFORMANCE ARCHITECTURE-2 RADICAL:** if accepted, proceed to a
targeted sim-hot-path cache/index pass, not new content. Focus on the measured
remaining costs: movement candidate generation, carrying-capacity/range
saturation context, and repeated support/context scans. Any behavior-side cache
must have deterministic keys, explicit invalidation for tick/season/band
position/depletion/fauna-plant pressure/current decisions, and A/B behavior
fingerprints before acceptance. Do not reopen ecology or add new resource/fauna/
plant systems.

**After RANGE ROTATION / PRESSURE RELIEF / TARGETED ESCAPE FIX-1:** if
accepted, proceed to **PUBLIC HUMAN STORY / EVENTS + IDEAS + TALK
READABILITY-1**. Pass 13.5 fixed the behavior/debug substrate for good-enough
relief candidates, targetless escape integrity, local orbit traps, same-cluster
establishment carry-over, scout/probe bridges, and non-food pressure in local
movement. The next pass should not add new behavior systems. It should keep
Technical raw and make the public Events, Ideas & Solutions, Attempts, Local
Routines, Camp Movement, Range Rotation, Internal Talks, Outer Talks, Chronicle
snippets, Markdown export, and selected-band UI read like grounded human life:
people trying, arguing, copying, failing, resting worn camps, and explaining
why choices mattered. Use deterministic, state-gated templates and concrete
object/food/place names. Keep rare odd/chaotic flavor capped, conflict hooks
dormant, and behavior influence from public wording at 0. Continue the ecology
road lock: existing ecology/context can be evidence for wording only; do not
create resource classes, patch knowledge, plant ecology, fauna stocks, water
quality, disease ecology, depletion/regrowth, settlement, culture, territory,
agriculture, war, trade, or tech-tree systems.

**Superseded road note:** the earlier post-Social-Diffusion recommendation to
move into Resource Class / Patch Knowledge is no longer current for the MVP
road. Ecology is treated as done enough unless explicitly reopened. The current
road continues through adaptive human behavior, camp movement, stagnation
escape, failure diversity, and grounded social-support hooks using existing
accepted ecology/context evidence only.

**After PRACTICE FEEDBACK / ROUTINE LEARNING-READINESS-1:** if accepted,
proceed to **SOCIAL-ECOLOGICAL DEPTH + INTER-BAND KNOWLEDGE DIFFUSION-1**. The
simulator now has bounded selected-band projections for knowledge, material
affordances, problem frames, possible trials, weak camp footholds, and
feedback/readiness conditions. The next safe layer should deepen how bands hear,
mishear, copy, reject, fail to apply, or locally retest knowledge from other
bands without creating social networks, language, culture, taboo, trade,
property, territory, settlement, skills/adaptations, or decision bonuses. Keep
the same causal chain: ecology and activity evidence -> knowledge/provenance ->
risk/labor/return/memory -> movement/demography/history later.

**After FOOTHOLD / CAMP ECOLOGY / CARE / STORAGE / FIRE-1:** if accepted, proceed
to **PRACTICE FEEDBACK / ROUTINE LEARNING-READINESS-1**. The simulator now has
bounded projections for what a band knows, what its known/local world makes
materially possible, what pressure it may frame as a problem, what practical
trials might be plausible, and what weak camp footholds/routines exist. The next
safe layer should add a careful feedback substrate for repeated attempts and
camp routines: clear failure, low feedback, delayed feedback, local-only success,
dangerous feedback, and inherited/no-local-feedback paths. It should still avoid
skills, adaptations, culture/taboo, worldview, language, settlement, agriculture,
domestication, territory, trade, permanent storage economy, tech-tree
progression, bonuses, or direct decision influence. Skills/Adaptations should
remain later and require repeated useful feedback, transmission, and context.

**After ECO-CAL-VIS:** proceed to the planned **fauna/aquatic animal pass** or a
focused **ECO-MIG-2 long-run population/capacity pass** before adding culture,
war, storage, or settlements. ECO-CAL-VIS fixed the biggest perception/social
gaps and softened ECO-MIG's all-deficit state, but 500y still has real late
pressure (31/36 raw-deficit bands, 17 chronic-deficit bands, mean raw support
0.65). The next ecology pass should add real animal/fish stocks and richer
return dynamics rather than raising generic support again. Keep no-hidden-truth,
no report/visibility relocation, no crossing-gate-bypass, no territory/conflict,
and no live teleport guards strict. Pre-run origin drag remains setup-only and
can be used to start calibration runs from chosen origins.

**After Word-of-Mouth UI v2 + frozen-residence pressure polish:** do a visual/playtest pass on a long single-origin crowded river run and inspect selected bands
that still look stationary. The audit now shows no frozen bad-site bands in a 500y single-origin Map 2 run, so remaining "crowded" perception is likely either
plausible river/lake clustering, valid residence-unchanged probe trips, or overly conservative crossing/opposite-bank opportunity calibration. If crossing still
looks wrong after the freeze fix, make it a separate river-crossing/corridor audit: inspect known crossings, flood-season risk, crossing memories, and best
non-stay alternatives before changing passability. Do not make talk force leaving crowded water; crowded-water talk should remain a small scout/probe/caution
input unless a future social/territory system explicitly exists.

**After Band Life Readability:** the player-facing layer now distinguishes actual recent work and fixes the Range All visual bug without
changing sim behaviour. The next systemic step can return to **RANGE-4 — record-only intrusion/tension events** if the goal is the
RANGE roadmap. If the next focus stays on band life, do a narrow **activity-generation composition calibration** only for genuinely
monotone cases identified by `--targeted-band-life-readability-audit`: repeated all-water or all-local-fishing bands should be checked
against real needs/terrain/season before any behaviour change. Keep AG11 default OFF unless a separate economy/support audit accepts it;
do not paper over true monotony with fake labels.

**After RANGE-2:** lineage colours make daughters legibly related-but-distinct, and the daughter↔parent range relationship is
a derived read-only view. The next roadmap step is **RANGE-3 — social recognition of other bands' ranges (read-only)**:
compute, per pair of nearby bands, an overlap / shared-edge / shared-water relation from their familiar-country ranges +
kinship distance (parent/daughter/sibling via `parentBandId`/`daughterBandIds`/`lineage`), and surface "overlap zone" /
"recognised neighbour range" as derived state. Keep it strictly read-only — it is the substrate a future confrontation layer
would read, NOT behaviour: no economy/CC coupling, no borders, no defense, no intrusion/tension events (that is RANGE-4), no
conflict. Reuse `deriveFamiliarCountry` for each band and intersect ranges (bounded; ranges are already ≤ ~72 tiles). Carry
the hard guards forward: ranges are band-known (⊆ observed), overlap/reciprocal access is the default, never ground truth.
Optional polish deferred from RANGE-2: tune `LINEAGE_COLOR_CONSTANTS` after visual inspection; a Range-overlay legend entry.

**After RANGE-1:** the familiar use-range is now a derived, read-only layer and movement labelling is range-aware. The next
roadmap step is **RANGE-2 — lineage colours + daughter range inheritance**: give each founding lineage a hue and derive
daughter colours as related-but-distinct variants (a small extension of the existing `shiftHexColor` in `demography.ts`,
within the DESIGN.md categorical-graph exception; keep nearby bands visually separable), and seed a *faded* subset of parent
route/water memory at fission (instead of the current reset) to model "buds off near parent, drifts outward." Keep it
read-only/visual + memory-seeding only — still NO economy/CC coupling, NO borders, NO recognition/conflict (those are
RANGE-3/4). The familiar-country constants (`RANGE1_CONSTANTS`) can be tuned after visual inspection of the overlay; since
nothing in `stepSim` reads them, that is a pure presentational adjustment. Optional polish: give the "Range" overlay tiers a
legend entry, and consider distance-aware splitting of `local_camp_shift` vs longer in-range moves if the labels feel coarse.

**After 2K.12E:** the seasonal-ecology memory reader is calibration-complete and the **reader-side magnitude lever is
exhausted** — neither the global cap (2K.12D) nor per-arm scaling (2K.12E) is a clean knob; the residual ~2–3% long-run
ON/OFF drift is structural/path-dependent (map1's response is non-monotonic in positive scale; map2's caution arm is
net-supporting population), and the un-damped ±0.12 control has the smallest worst-case drift of every config tested.
**Do NOT chase a finer reader constant** (it would overfit map1's unstable region). Leave the reader **default OFF /
optional** and pick it back up at **RANGE-1 / familiar-country / home-range** (see the design note below): once a band has a
real spatial range, the seasonal bias can attach to *where it actually ranges* rather than nudging isolated scout/recheck/
water-check targets, which is the thing that makes the long-run effect both meaningful AND bounded. If a default-ON is ever
wanted before RANGE-1, the only honest path is to accept the ~2–3% bounded cost explicitly and flip ON in an isolated
rebaseline — not to tune the bias magnitude further. Keep the `POSITIVE_RECALL_SCALE` / `CAUTION_SCALE` constants at identity
1.0 (they + the harness `perArmScales` reporting exist only to make a future re-sweep trivial).

**After ECO-SEASON-1:** resources are season-aware at the activity/memory/shadow level and bands accumulate learned
seasonal ecology — all with zero carrying-capacity coupling. The natural next step is a seasonal **STRATEGY** layer that
READS `seasonalEcologyMemory` through the existing known-memory decision systems (dry-season refuge / wet-season patch
targeting), and/or attaches the reserved `dry_refuge_future` / `wet_patch_future` reasons to `residentialMoveEvent`. Keep
plants non-food until plant-use scaffolding allows it; do NOT feed the seasonally-adjusted shadow into support/CC until a
deliberate seasonal-economy checkpoint (AG11 remains the only, OFF-by-default, experimental consumer).

**After TIME/PLAYBACK-STABILITY + RESIDENTIAL-MOVE-1:** the time/render pipeline is now trustworthy at every speed
(no Civilization-Skip freeze; markers AND activity draw from one fresh source; `all`/`selected`/`off` behave correctly),
and a record-only `residentialMoveEvent` gives relocations a legible in-season time span without touching macro behaviour.
Next safe options, in priority order: (a) **seasonal-resource-realism ecology layer** (the main spine — per-season
resource availability/regrowth realism); (b) longer AG11 ON calibration with the supplement still default-OFF; (c) extend
residential-move events to the fission (daughter colonization) and seasonal-strategy sites, and/or a selected-band-only
map route line for the latest event (now safe because fast playback no longer freezes). Do **not** consume delayed
returns, raise AG11 fractions, move `band.position` daily, add boats/swimming (a fording relocation is recorded
`failed_no_route`, not a water path), or let activity returns feed support/food beyond AG11 until those audits are
explicit.

**After REALISM-2B:** the first-season activity, activity-movement, and activity-path systems are audited and stable.
First-season reconnaissance is accepted as healthy (bounded, band-known-only, year-1 macro-neutral, no hidden
discovery); AG6/AG9 are rebaselined to its bounded long-run sensitivity with hard economy/hidden-truth/determinism
proofs still strict. Activity breadcrumbs are passability-aware (never on water) and the overlay is selected-band-only
and snapshot-consistent. Next safe options, unchanged in spirit: (a) the record-only cause-gated `residentialMoveEvent`
design (visualize in-season relocation without daily `band.position` updates); (b) longer AG11 ON calibration with the
supplement still default-OFF; or (c) the seasonal-resource-realism ecology layer (the main spine). Do **not** consume
delayed returns, raise AG11 fractions, move residential anchors daily, add boats/swimming, or let activity returns feed
support/food beyond AG11 until those audits are explicit. If first-season recon is ever revisited, the cleanest lever is
*persist-only-visited* bootstrap memories (only the patch a group actually traveled to becomes a durable memory) — noted
as a future refinement, intentionally NOT done here to avoid behavior/baseline churn in a correctness/visual checkpoint.

**After TIME/MOVEMENT-REALISM-2:** review activity-memory sensitivity before adding more economy coupling. Early
starting-local reconnaissance makes activity memories influence scout target selection at the first seasonal decision,
so refresh or tighten the AG9 fixture before treating it as an unchanged guard. The next safe checkpoints are either:
(a) activity-memory damping/fixture refresh for early local reconnaissance, (b) a record-only `residentialMoveEvent`
design that visualizes cause-gated in-season relocation without daily `band.position` updates, or (c) longer AG11
ON calibration with the supplement still disabled by default. Do not consume delayed returns, raise AG11 fractions, or
move residential anchors daily until those audits are explicit.

**After ACTIVITY-GROUPS-9:** do **not** wire activity returns into food/support yet. AG9 reproduced the full
`evaluateBandDecision` at the tick-212 divergence and confirmed it is a healthy, bounded, near-threshold branch swap:
a single dry-corridor band moves instead of scouting because activity memory retargets its resource-scout patch (near
`promising_unproven_patch_recheck` vs far `frontier_probe`), and the chosen move only edges out the scout by a `0.02`
deliberation margin — no boolean gate is manufactured, the movementKnownOpportunity `>0.12` gate is inert, learned
support is a side signal, and macro state is unchanged. The thresholds/dampening are therefore left untouched on
purpose. The next step is to **design real activity-return/resource-support coupling** (ACTIVITY-GROUPS-10+): only now,
with the divergence understood, is it safe to let `resourceReturn` begin to feed support/food economy — and the AG9
fixture is the regression guard that those near-margin flips do not start compounding once it does. Also still open:
whether seasonality hints should become a stronger reader input (AG8/AG9 show they remain stored-but-weak). Still no
calories, support/yield formula changes, carrying capacity changes, stress, population, mortality, fission, relocation
forcing, plant safety certainty, or hidden discovery until that coupling is deliberately designed.

**After HEAT-2 (audit complete; verdict MIGRATION IMPROVED — active ecology track; M0/perf/seed PARKED):**
the 2K.7–2K.11 learned-niche chain is validated — descendants now form economically-viable, self-reproducing
secondary-region lineages that persist to 1000y in the majority of seeds (500y×10: 7/10 secondary realized
support, 9/10 secondary fissions, secondary per-capita > origin in 8/9, 1 multi_region; 1000y×3: secondary
persists, 1 multi_region). Two next options, in priority order:
1. **Continue ecology → seasonal-resource realism, then camps/settlements** (the main spine). Migration is now
   causally sound, so the next layer is *persistence-into-place*: seasonal scheduling of resource availability
   (in-season vs out-of-season usable support, fallback timing) and then the first aggregation step
   (camp/settlement = ONE entity, per the durable scaling strategy). This is the highest-value forward move.
2. **HEAT-2B — founder/daughter opportunity-consumer audit (optional, audit-first, no tuning).** HEAT-2
   pinpointed the residual blocker: in ~3/10 seeds bands learn a side niche whose per-capita *exceeds* the
   saturated origin yet don't relocate/found there (realized support stays origin-only; the edge resolves
   slowly — heat-3 only became multi_region by 1000y). Instrument whether daughter-founding / relocation
   scoring actually reads the 2K.8 projected learned support + 2K.9 post-move projection at fission/move time,
   and find the exact under-read. A single bounded decision-side fix could convert occupation-blocked seeds to
   secondary founding **by economics** — never a movement bonus or magnitude tune. Secondary lever:
   side-probe/plant-bearing-encounter cadence for the rare no-side-memory seed (heat-8).
Do NOT raise 2K.9 magnitudes, add a movement bonus, or force founding — the migration that exists is
economically caused and must stay that way.

---

**[PARKED] User-confirmed next M after the M0.13 review: M0.14 — Persistent Local Depletion / Regeneration v0**
(user visual audit 2026-06-12: 28 bands cuddled on the Map 1 delta at y300 with pcr 0.46 / penalty
0.296 and STILL not dispersing enough — correct until ~y150 (deltas genuinely held the densest forager
populations; saturation < 0.55, penalty 0), wrong afterwards because the resource base never wears:
M0.11 models memoryless CROWDING, not persistent DEGRADATION; a 300-year 1,200-person delta is as
pristine as day one and newcomers arrive at a virgin estuary). M0.14 = the M0.11 "Option B" deferred:
a sparse, bounded, slowly-recovering per-tile depletion stock advanced from the 2J.1 shared-catchment
claim index (the per-tile extraction number already exists), coupled into effective tile yield ×
(1 − depletion·k); bands learn it through their own falling returns (anti-omniscient — physical truth,
observed by foraging), feeding the existing return-trend → hardship → founder-journey chain. FIRST
mutable per-tile world state → max-effort architecture checkpoint; audit: depletion heatmap, delta
richness trajectory, dispersal response, recovery after abandonment. Keep the M0.11 crowding penalty
(crowding ≠ wear; both real). NOT implemented yet — report-and-recommend only, per user instruction.

**M0.12 is IMPLEMENTED (2026-06-12), awaiting review — recommended next checkpoint: M0.13 —
Stress-Gated Directional Corridor Drift v0 (movement-policy, MAX-EFFORT ARCHITECTURE CHECKPOINT).**
The M0.12 decision rule resolves as: the knowledge-range wall is solved (corridor knowledge forms,
extends 13-18+ tiles, converts to observation through the bands' own movement — dry-band known tiles
89-213 vs ~44 in M0.10), but a TRUE world-filling blocker remains and it is now precisely
characterised: **chronically stressed corridor bands wander isotropically** (move_to_tile 114/120
ticks, net displacement ~0 over 300y) because the intermediate margin offers no economic gradient and
no directional-persistence mechanism applies to stressed adult bands (M0.9 headings are
daughter/motion-earned; frontier intents rarely form under chronic stress). M0.13 should be the
SMALLEST movement-policy step: let a band under sustained economic hardship (e.g. the M0.11
`sustainedOverCapacity`/chronic low return signals) earn and KEEP a gentle corridor heading
(tie-break weight only, M0.9-style, never a forced move, never richness-seeking) so its existing
corridor moves accumulate direction instead of cancelling. Movement coupling = risky → max effort per
the standing instruction. After M0.13, re-run the migration audit; then return to the plants track
(2K.6 processing/exploitation-skill scaffolding). **Reviewer focus for M0.12:** (a) anti-omniscience
of stage 2 (existence-only records, truth used only as the M0.6-accepted static-topology oracle for
band-known/adjacent tiles); (b) the probe-gate amendment (stuck ≠ expanding; verify frontier-drift +
lake audits); (c) confirm macro fingerprints unchanged (Map 1 304/640/1356; Map 2 314/9/0 at 50y).

**Prior recommendation (M0.11, ACCEPTED):** The M0.11 decision rule resolves cleanly: the saturation
coupling WORKS (battery broken, pileup 0.727→0.273, recovery proven), so no M0.11-A follow-up is
needed; but dry-margin migration is still blocked ONLY by knowledge range (Map 2 deep-margin lineage:
3 stayers / 0 escapes — zero greener+watered tiles within knowledge range, green lowlands ~70 tiles
downstream). M0.12 should extend the accepted M0.6 shoreline-inference pattern to river corridors: a
band with sustained presence on a river/seasonal-river corridor may infer (existence-only, never
richness) that the channel continues downstream, one bounded ring per season, capped/decaying/
fission-degraded — giving the existing seek-water/corridor intents a legal downstream target chain.
After M0.12, re-run the migration audit; if no M blocker remains, return to the plants track (2K.6
processing/exploitation-skill scaffolding). **Reviewer focus for M0.11:** (a) the coupling block in
`deriveCarryingCapacity` (bounded/recoverable/deterministic; threshold sat>1 sustained ×2); (b)
re-run `--targeted-migration-saturation-audit --migration-audit-years 300` and confirm pileup/
recovery; (c) accept the new baseline fingerprints (Map 1 100y 304/8/3; Map 2 50y 314/9/0).

**Prior recommendation (MAP2-R, superseded by the above):** It is a map/UI/render-only rework of Map 2 for
realism (declared ~1.5 km/tile scale, causal moisture→richness field with seeded noise mosaics, 12
sub-tile creek influence corridors + `hasCreek` render overlay, braided-upper-reach + named-ford crossing
v0, fed lake basin instead of a rich ring, 9th spawn band on the central-plains creek). Map 1 and all sim
rules are untouched (baseline + lake-audit fingerprints match exactly). **Reviewer focus for MAP2-R:**
(a) load Map 2 in the UI and judge realism (creek overlay, plains mosaic, desert transition, lake basin
gradient, scale line in the header); (b) confirm `hasCreek` has no `src/sim` reader (grep); (c) confirm
Map 1 fingerprints (306/8/3 100y; 1382/36 300y non-fast; lake audit 7/730/5.98); (d) optionally re-run
the M0.10 migration audit on the reworked map to refresh its numbers. After review, the recommended next
checkpoint remains **M0.11** below (the M0.10 blocker is a sim-mechanics issue, not a map issue).

**M0.10 is IMPLEMENTED (2026-06-10), awaiting review.** It adds Map 2 ("Varied Migration Test", 220×140,
explicit spawns), the UI map selector, the `map2_varied_migration` scenario, and the
`--targeted-migration-saturation-audit` answering the dry-margin clustering / wetland saturation /
world-filling questions with 300-year evidence on both maps. NO sim behaviour change (Map 1 baseline +
lake audit byte-equal). It also resolved the 2K.5 flagged drift (fast vs non-fast mode split — see the
Verification caveat).

**Reviewer focus for M0.10:** (a) confirm Map 1 untouched (baseline 306/8/3 deterministic; lake audit
7/730/5.98); (b) confirm `auditMobilityIntentCandidates` is a mechanical extraction with no `src/sim`
caller (grep) and that the audit forces no outcome; (c) sanity-check Map 2 geography in the UI (selector
button) — dry corridor margin survivable, green lowlands downstream, NE basin behind the pass; (d) re-run
the audit and check the findings reproduce (deterministic); (e) judge the M0.11 recommendation below.

**THE AUDIT FOUND A TRUE BLOCKER — recommended next checkpoint: M0.11 (smallest M scope, MAX-EFFORT
ARCHITECTURE CHECKPOINT REQUIRED).** Over 300 years bands multiply ×4-4.5 but the occupied area stays
FLAT on both maps: crowded rich catchments (lake basin 3→11 bands) keep producing LOCAL satellite
daughters (0 outward dispersals from the Map 2 basin) because (1) multi-band crowding barely reduces the
effective per-capita return (0.91→0.864 for ×4 population — rich pockets are infinite food batteries), so
(2) every band-known alternative is rejected as `not_better_than_current`, so (3) "poorer-but-empty beats
richer-but-crowded" can never trigger. The movement machinery itself generates candidates correctly (the
audit shows greener candidates winning where knowledge exists) — the blocker is the missing
**shared-catchment depletion / multi-band saturation → effective per-capita return coupling** (plus,
secondarily, the knowledge-range wall that keeps deep dry-margin bands ignorant of green land ~70 tiles
away). M0.11 should be scoped EXACTLY there: make sustained multi-band local use measurably reduce the
effective local return (causal depletion, not a migration lever), so existing fission/colonization
machinery can start preferring genuinely-better empty land. This touches yield/demography coupling →
max-effort architecture checkpoint per the standing instruction; do NOT implement it as a movement fix.
After M0.11, return to the plants/resource-ecology track (2K.6 exploitation-skill / processing-knowledge
scaffolding so `processing_required_unknown` can ever resolve), then causal yield/return integration.
**First settlement/camp v0** and **natural one-origin world colonisation** stay queued after.

Do **not** fix by "move to richest tile", omniscient richness, forced daughter leaving, global attachment
weakening, or all-band nomadism. Do **not** use truth richness as a migration target. Do **not** make an
inferred (existence-only) tile attractive AS IF its richness were known. Do **not** let patch-return
estimates feed yield/support/stress/relocation without their own explicitly scoped checkpoint.

**Separate future checkpoint still awaiting architect approval: 2K.3E — Bounded Cause-Stress →
pressureState Wiring (flagged).** 2K.3D remains accepted and derived-only; do not wire
`causeStressContributionV0` into `pressureState` until separately approved.

*Open future needs (watchouts, not yet implemented):* (1) **caution decay / re-test** so durable
plant caution can relax; (2) **broader autonomous risky-scout coverage** — the live trigger is a
single curated scenario; general scenario sweeps still fire `cause=0` (bands don't seed
medicinal beliefs naturally), and the fallback/processing live paths are seasonal/abundance-gated
so the live fixture uses the season-independent medicinal path; (3) **single-domain readiness
mapping** may need revisiting (one event → one domain); (4) **performance/scaling** remains
watchlist (~500y superlinear, tracked-warning only); (5) the **medicinal scout-urgency** change,
though bounded/inert today, will become live once real medicinal beliefs/patches exist — revisit
then; (6) the **cause-stress contribution v0** is derived-only and NOT wired into `pressureState`
yet — 2K.3E is the (still flagged/reversible) checkpoint that may first let it feed the existing
stress reading, and only later may any movement/viability sensitivity be considered.

---

## Familiar Country / Proto-Territory — design note (RANGE-1..4 roadmap)

*Research/design bridge attached to 2K.12 (NOT implemented). Goal: stop labelling a band "on the move"
just because it moves WITHIN its known range, and let territory EMERGE from repeated use rather than
appear as official borders.*

**Why now.** Bands already carry the substrate this needs and never read it as "range": `knowledge.observedTiles`
(what's been seen), `travelCorridors` / `corridorHeading` (used routes), place attachment / `returnPlacePull`
/ `rememberedReliability` (camp & water cores), `seasonalEcologyMemory` (now read by 2K.12) and seasonal-round
memory (dry-refuge / wet-dispersal phases), and `recentResidentialMoveEvents` (relocation cause/kind). The missing
layer is a *derived, read-only* notion of "this band's familiar country" computed from that history.

**Research → mechanism (kept practical).** Hunter-gatherer ethnography/archaeology is consistent on a few points
we can translate directly: (a) ranges are **fuzzy used areas, not bordered parcels** — home range = where a group
habitually forages over a year; (b) **overlap is normal** — neighbouring/related groups share edges and water,
and reciprocal access (not exclusion) is the default; (c) **economic defendability** (Dyson-Hudson & Smith) —
groups only defend space when resources are dense AND predictable (rich riparian/coast), so most arid ranges are
shared and only cores (permanent water, fishing weirs, groves) attract recognition/defense; (d) **social
recognition precedes defense** — land becomes "ours" through repeated use, naming, ancestors/burials, and others'
acknowledgement, long before any confrontation; (e) **daughter groups stay related** — fission buds off into
edge/overlap zones, often inheriting routes and water knowledge, then drift outward over generations (the model's
2K chain already produces this). So territory should be modelled as **use → familiarity → repeated range →
seasonal range → socially recognised range → (much later) defended core**, never as borders-first.

**Proposed roadmap (each its own checkpoint; adapt, don't over-build):**
- **RANGE-1 — Familiar-country / use-range substrate (read-only).** Derive, per band, a bounded "use range" from
  existing memory: visited-tile recency/frequency + corridor membership + camp/water/patch cores, decaying with
  disuse (an "old range" tail). Pure, deterministic, NO behaviour change — a derived view + BandPanel/overlay
  ("familiar country" tint, camp/water/patch core markers) + an audit (range ⊆ observed tiles; no hidden truth).
  This is the small, safe next implementation; it also reclassifies movement: *inside familiar country* = local
  camp shift / seasonal round; *at the recency edge* = range-edge probing; *beyond it* = leaving / founding.
- **RANGE-2 — Lineage colours + daughter range inheritance.** Give each founding lineage a hue and derive
  daughter colours as related-but-distinct variants (shared base hue, shifted L/C), within the DESIGN.md
  categorical-graph exception; ensure nearby bands stay visually separable. Daughters inherit a damped copy of
  parent route/water memory at fission (the sim already resets seasonal memory — RANGE-2 would instead seed a
  faded subset), modelling "buds off near parent, drifts outward."
- **RANGE-3 — Social recognition of other ranges (read-only).** Compute, per pair of nearby bands, an overlap /
  shared-edge / shared-water relation from their use ranges + kinship distance; surface "overlap zone" and
  "recognised neighbour range" as derived state. Still no behaviour change — it's the substrate confrontation
  would later read.
- **RANGE-4 — Intrusion / tension EVENTS (record-only first).** When a band's core is repeatedly used by an
  unrelated band under scarcity (economic-defendability gate), emit a record-only tension event (like
  residentialMoveEvent) — legible, no forced outcome.
- **Later (NOT now): conflict / confrontation.** Only after RANGE-1..4 are stable and the defendability gate is
  trusted. Do not implement conflict in the foreseeable checkpoints.

**Hard guards to carry forward:** ranges are DERIVED from band-known memory (⊆ observed tiles), never ground
truth; no borders-first; no economy/CC coupling; overlap and reciprocal access are the default, defense the rare
exception; daughter colours related-but-distinct and never visually confusing.

---

## Checkpoint Log

- **FOOD–DEMOGRAPHY SEPARATION / DEMOGRAPHIC PERSISTENCE-1** — *implemented
  2026-07-14, PASS.* Added a non-persisted canonical-ledger adequate-food arm,
  legacy/de-stacked demographic diagnostics, full arithmetic contribution
  ledger, four-cell separation, food waterfall, controlled persistence, exact
  population reconciliation, and repeated long-run observer-parity audits.
  Production consolidates correlated food penalties into one ordinary pressure
  and a nonlinear severe-chronic hazard; no food-stage coefficient changed.
  Healthy/moderate persistence and recovery pass; severe no-food extinction
  remains. Graph 209 nodes/734 links, 0 duplicate/0 dangling. Remaining default
  contraction is attributed to practical same-day reach/logistics; expedition
  architecture is next. Exact commit hash and command matrix are in the final
  checkpoint report.

- **CUMULATIVE PRACTICAL LEARNING / RECOMBINATION / ANIMAL ROUTINES-2** —
  *implemented 2026-07-10, PASS recommended.* Verified the interrupted self-rumor
  and phantom-copy fixes; grounded fragment acquisition; added bounded epistemic
  fragment states and top-k response assembly; implemented three/four-component
  context-bound temporary-watercraft learning on real crossing safety; added four
  differentiated stock-level fauna routines, observation-only animal knowledge,
  and costly/fallible proto-management without domestication. Targeted suite
  33/33, fauna 11/11 + 19/19, practical 26/26, efficacy 26/26, lone-band PASS,
  deterministic Map 1 100y 270/8/3, build/typecheck green, graph 205/714.

- **CAUSAL AGENCY REPAIR-2 — SEASONAL MOVEMENT SCALE** —
  *residential seasonal travel, 2026-07-10, PASS recommended.* Re-enabled the
  SPIKE-MOBILITY-1 migration walk behind a repaired cause gate
  (`deriveSeasonalTravelPlan`): hardship-escape / dispersal / corridor motives
  with multi-season leg rests (anti-churn), constraint limiters that floor at
  2 steps under strong motive, `classifyResidentialSeason` Technical classes
  (held / local shift / staged travel / relocation / blocked-or-held). Heat
  500y A/B proves no walk-caused collapse (OFF 42 pop vs ON 44); harsh 40y
  shows real distance-2 residential legs; Map 1 100y re-baseline 259/8/3 →
  270/8/3; deterministic=true; graph 201/694. Follow-up: sub-season playback
  staging — the live overlay now walks the residential marker along the
  recorded ResidentialMoveEvent route across its recorded days at daily/
  weekly/monthly resolution (presentation-only; 0 staged seasons without a
  real move; fast-time-overlay suite PASS).
- **CAUSAL AGENCY / MOVEMENT / ADAPTATION REPAIR-1** —
  *behavior-side repair of the causal-agency diagnostic, 2026-07-09, PASS
  recommended.* Chronic-hardship escalation (repeated low-support evidence →
  capped stay-bias erosion ≤0.6 / move-pressure boost ≤0.18 / scout urgency
  ≤0.14; inverts the old decline-de-escalation), founder dispersal term
  (sustained-evidence-gated, 0.7×), deterministic six-trait band tendency
  vector (hash-based, ±≤15% on existing bounded terms, lineage echo 30%), and
  one real local learning loop (practiced-crossing relief ≤0.35 on
  riverCrossingRisk, danger-discounted, staleness-forgotten). New modules
  chronicHardship/bandTendency/crossingPractice; no new Band state; Technical
  "Causal agency repair" proof block; `--targeted-causal-agency-check` 19/19;
  battery 27/28 (1 declared expected-drift: adaptive-human `ideasGrounded`
  sampling fragility, machinery proven intact by all-band probe);
  deterministic=true; graph 200/690; intentional re-baseline Map 1 100y
  non-fast 325/8/3 → 259/8/3; runtime in noise band.
- **PERFORMANCE ARCHITECTURE-2 RADICAL** -
  *selected-band payload/lazy-derivation architecture pass, 2026-07-07.*
  Added compact `SimSelectedBandLiveSummary` selected-band protocol with
  deterministic keys, caps, and diagnostics; wired BandPanel so only Overview,
  Doing, and roster consume the frequent live summary; kept heavy tabs on full
  snapshots; made Markdown export explicit/on-demand; expanded Technical
  payload diagnostics; added `--targeted-performance-architecture-2-audit`.
  First audit sample: selected raw 380,947 bytes -> live projection 104,817
  bytes, full dynamic snapshot 5,349,298 bytes, live overlay 1,579 bytes,
  story caps held, stale selected-band count 0, projection key hit 1/miss 0/
  invalidation 1. Final battery passed; all-fast did not materially improve
  because this pass targeted UI/worker payload and lazy projection rather than
  behavior-side movement/context hot paths.

- **PUBLIC HUMAN STORY / EVENTS + IDEAS + TALK READABILITY-1** -
  *projection-only public wording/story/talk layer, 2026-07-07.*
  Confirmed Pass 13.5 was present, then added `publicHumanStory.ts` with
  structured deterministic templates, concrete object/food naming, internal
  talks, outer talks, event/idea/attempt/routine/camp/range-rotation stories,
  compact chronicle titles, dormant conflict hooks with zero behavior influence,
  anti-fake guards, Technical proof, Markdown export integration, architecture
  graph node/links, and `--targeted-public-human-story-events-ideas-talk-audit`.
  Public UI now says what people tried, argued over, copied, carried, rejected,
  or rested instead of leaking substrate phrases like material compatibility,
  feedback quality, pressure relief score, or target integrity. New audit
  **30/30 pass**: 288 stories, 8 internal talks, 8 outer talks, 64 event
  stories, 48 idea stories, 48 attempts, 40 routines, 24 camp stories,
  8 range-rotation stories, 40 chronicle titles, 214 object names, 26 food
  names, 0 raw/debug leaks, 0 unsupported fake terms, active conflict events 0,
  behavior influence 0, max payload 40,032 bytes. Regression audits, typecheck,
  build, determinism, graph, static guards, and all-fast pass. Next:
  **PERFORMANCE ARCHITECTURE-2 RADICAL**.
- **RANGE ROTATION / PRESSURE RELIEF / TARGETED ESCAPE FIX-1** -
  *good-enough local pressure relief and target-integrity fix, 2026-07-06.*
  Added bounded range-rotation candidates, good-enough-not-better relief moves,
  scout/probe bridges, local orbit-trap detection, same-cluster establishment
  carry-over, targetless escape blocking/proof, Technical/UI visibility, compact
  event hooks, graph/handoff updates, and `--targeted-range-rotation-pressure-relief-audit`.
  New audit **24/24 pass**: 20 relief candidates, 20 good-enough, 8 not better
  than current, 3 chosen moves, 2 scout/probe bridges, targetless after 0,
  repeated targetless 0, 1 orbit trap, 6 same-cluster carry-overs, 0 long-distance
  migrations caused, 0 fission changes, static counters 0; build/typecheck/
  determinism/all-fast/regression audits pass. Followed by **PUBLIC HUMAN STORY
  / EVENTS + IDEAS + TALK READABILITY-1**.
- **INTRA-SEASON CAMP SHIFTS + NEW-PLACE ESTABLISHMENT + STAGNATION ESCAPE-1** -
  *bounded behavior-active movement/camp establishment layer, 2026-07-06.*
  Added `src/sim/agents/campMovement.ts`, stored bounded `Band.campMovement`
  state, movement decision support for existing stay/move/probe/scout actions,
  local-shift / temporary-camp / establishment / recovery / old-anchor-decay /
  stagnation-escape / passive-collapse records, canonical event drafts, public
  Movement & Camp UI, Technical proof, graph node/links, and targeted audit.
  Reused Adaptive Human, Foothold/Camp, Problem Practice, Practice Feedback,
  Social Diffusion, Knowledge, Material Affordance, Events, Activities, place/
  route/crossing memory, demography, and movement logic. No new ecology road,
  settlement, inventory, property, agriculture, territory, trade, culture,
  language, tech tree, omniscient best-tile search, or global unlock. New audit
  **27/27 pass**; regression cascade pass after a projection-only Memory
  Referents cap fix; typecheck/build/determinism/graph/static guards pass;
  all-fast 25 scenarios completed, fission conservation held.
- **ADAPTIVE HUMAN IDEAS / SOLUTIONS / LOCAL ROUTINES-1** -
  *bounded behavior-active adaptive loop, 2026-07-06.* Added grounded
  idea/response/attempt/feedback/routine/variant/context-bound-adaptation state
  on top of accepted Problem Practice, Practice Feedback, Camp/Foothold, Social
  Diffusion, Material Affordance, Knowledge, Events, Activities, memory,
  demography, and identity evidence. Behavior influence is explicit and capped
  to existing actions only; daughters inherit partial hints only; no new
  ecology roadmap, tech tree, global unlock, settlement, territory, inventory,
  property, trade, war, culture, language, agriculture, or domestication.
  New audit **28/28 pass**; accepted regression sweep pass; typecheck/build/
  determinism/graph/static guards pass; all-fast 25 scenarios completed with no
  fission population-conservation failures.
- **SOCIAL-ECOLOGICAL DEPTH + INTER-BAND KNOWLEDGE DIFFUSION-1** -
  *projection-only social context/diffusion substrate and selected-band Between
  Bands UI, 2026-07-06.* Added
  `src/sim/agents/socialEcologicalDiffusion.ts`,
  `src/ui/band/BetweenBands.tsx`, BandPanel and markdown-export tab wiring,
  Technical proof, graph node/links, styles, and benchmark audit. Profiles
  derive bounded social contexts and diffusion items from accepted reported
  knowledge/contact memory, Events, Knowledge Ecology, Material Affordance,
  Practice Feedback, Problem Practice, Camp Foothold, Activities, place/route/
  crossing memory, Social Range Recognition, fission inheritance, demography/
  labor, and identity context. It represents channels (direct contact, activity
  talk, visible trace, old-camp trace hook, parent/daughter, shared route/water/
  country), domains (route/crossing, food work, camp/foothold/care, material
  affordance, fire/hearth/fuel, water-edge, social/contact), tacit difficulty,
  context compatibility, trust/caution, withholding/rejection hooks, failed
  imitation, partial copy, and seen-not-understood. No culture, taboo, myth,
  religion, worldview, language, deception, diplomacy, alliances, trade,
  kinship, social network, territory, borders, war, property, settlement,
  agriculture, domestication, inventory, skill/adaptation acquisition, automatic
  learning, Chronicle prose, or decision influence. New audit **25/25 pass**:
  11 profiles, 47 contexts, 78 diffusion items, 15 direct-contact items,
  29 activity-talk, 27 visible-trace, 5 parent/daughter, 2 shared-route/water,
  inherited basis 7, local-tested 25, failed imitation 53, partial copy 5,
  seen-not-understood 26, broken/raw/fake-social/fake-skill hits 0, decision
  refs 0, max payload 33,497 bytes, max 8 items/profile, max 6 contexts/profile,
  max 2 evidence/item. Validation: typecheck, build, script syntax,
  deterministic `true`, graph **192/618** 0 dup/0 dangling, accepted regression
  audits pass, all-fast 25/25 normalized identical to newest durable all-fast
  artifact after runtime-only profiler fields, static guards 0 hits.
- **PRACTICE FEEDBACK / ROUTINE LEARNING-READINESS-1** -
  *projection-only feedback/readiness substrate and selected-band Practice
  Feedback UI, 2026-07-05.* Part A closes Problem Practice **30/30 pass** and
  Foothold/Camp **22/22 pass** with no redesign. Part B adds
  `src/sim/agents/practiceFeedbackReadiness.ts`,
  `src/ui/band/PracticeFeedback.tsx`, BandPanel tab wiring, Technical proof,
  graph node/links, styles, and benchmark audit. Profiles derive structured
  feedback/readiness items from accepted Problem Practice, Material Affordance,
  repetition/familiarity, Knowledge Ecology, Events, Activities, Camp Foothold,
  memory, demography/labor, and identity context. No skills, adaptations,
  permanent routines, culture, taboo, myth, worldview, language, settlement,
  agriculture, domestication, inventory, property, storage economy, tech tree,
  bonuses, Chronicle prose, or decision influence. New audit **28/28 pass**:
  12 profiles, 84 items, 8 learning-ready-later future hooks, 33 contradicted,
  16 material-blocked, 19 labor-blocked, 52 dead-end risks, 12 false-confidence
  risks, 12 local-only risks, 27 low-feedback risks, broken/raw/tech-tree/fake
  skill/fake culture/settlement-inventory/legacy hits 0, decision refs 0, max
  payload 30,665 bytes, max 7 items/profile, max 4 evidence/item. Validation:
  typecheck, build, script syntax, deterministic `true`, graph **191/598** 0
  dup/0 dangling, accepted regression audits pass, all-fast normalized
  comparison identical to Foothold baseline, static guards 0 hits.
- **FOOTHOLD / CAMP ECOLOGY / CARE / STORAGE / FIRE-1** -
  *projection-only foothold/camp substrate and selected-band Camp & Footholds UI,
  2026-07-05.* Added `src/sim/agents/campFoothold.ts`,
  `src/ui/band/CampFootholds.tsx`, BandPanel tab wiring, Technical proof,
  graph node/links, styles, and benchmark audit. Profiles derive weak
  repeatedly-used-place footholds, camp factors, temporary holding/cache
  signals, fire/hearth/fuel context, and aggregate care/camp burden from accepted
  Events, Knowledge, Material Affordance, Problem Practice, activity, memory,
  movement, demography/labor, seasonal, pressure, and identity evidence. No
  settlement, agriculture, domestication, buildings, territory, property, full
  inventory, storage economy, trade, kinship/social network, culture, taboo,
  myth, worldview, language, tech tree, skills, adaptations, bonuses, or decision
  influence. New audit **22/22 pass**: 12 profiles, 36 places, 72 factors, 12
  storage, 12 fire, 12 care signals, broken/raw/legacy/fake-system/tech-tree
  hits 0, decision refs 0, max payload 36,814 bytes, max 4 places/profile,
  max 6 factors/profile, max 3 evidence/item. Validation: typecheck, build,
  script syntax, deterministic `true`, accepted regression audits pass,
  all-fast normalized comparison identical to Problem Practice baseline, static
  executable/import/decision guards 0 hits, graph **190/581**, 0 dup,
  0 dangling.
- **PROBLEM FRAMING + PRACTICE EXPERIMENTATION-1** -
  *projection-only problem/trial substrate and selected-band Problems & Trials
  UI, 2026-07-05.* Added `src/sim/agents/problemPractice.ts`,
  `src/ui/band/ProblemsAndTrials.tsx`, BandPanel tab wiring, Technical proof,
  graph node/links, styles, and benchmark audit. Frames are structured
  perceived-problem records with objective basis, perceived cause, uncertainty,
  misread risk, evidence, lived/inherited basis, and possible experiment hooks.
  Candidates link to frames and affordances, carry knowledge/material/activity/
  repetition basis, feedback type, costs, labor burden, status, dead-end/
  false-confidence/low-feedback/local-only risks, `noSkillUnlocked`, and
  `noAutomaticImprovement`. No skills, adaptations, culture, taboo, myth,
  worldview, language, agriculture, settlement, territory, war, inventory, tech
  tree, bonuses, or decision influence. New audit **30/30 pass**: 9 profiles,
  54 frames, 63 candidates, perceived causes 54, uncertainty/misread 54,
  feedback low/contradicted/mixed/local-only 15/38/8/2, risks
  dead-end/false-confidence/low-feedback/local-only 38/3/15/2, refs
  affordance/knowledge/event/activity/repetition 72/108/53/101/16,
  inherited/lived refs 2/349, daughter profiles 4, broken/raw/legacy/fake/
  tech-tree/culture hits 0, max payload 43,521 bytes, max 6 frames/profile,
  max 7 candidates/profile, decision refs 0. Validation: typecheck, build,
  script syntax, deterministic `true`, accepted regression audits pass,
  all-fast normalized comparison identical to pre-change baseline, static guards
  0 hits, graph **189/562**, 0 dup, 0 dangling.
- **MATERIAL AFFORDANCE + FORAGER ENGINEERING CATALOG-1** -
  *projection-only affordance substrate and selected-band Affordances UI,
  2026-07-05.* Added `src/sim/agents/materialAffordance.ts`,
  `src/ui/band/Affordances.tsx`, BandPanel tab wiring, Technical proof, graph
  node/links, styles, and benchmark audit. Families: carrying/containers,
  shelter/camp, fire/hearth, food processing, water-edge capture,
  route/crossing, tool/digging/cutting, visual/mineral/adhesive, and
  camp organization/care. Grounded in bounded material/environment,
  Knowledge/Event/activity/memory/demography/seasonal/body-camp/repetition
  evidence; constraints and future hooks retained; no practices, skills,
  problem framing, culture, settlement, or decision influence. New audit
  **26/26 pass**: 9 profiles, 81 items, material refs 112, knowledge refs 81,
  activity refs 8, event refs 26, memory refs 111, repetition refs 17,
  constraints 45, hooks 315, broken/raw/fake/legacy/tech-tree hits 0,
  max payload 28,732 bytes, decision refs 0. Validation: typecheck, build,
  script syntax, deterministic `true`, accepted regression audits pass,
  all-fast normalized comparison identical to `artifacts/event-system-ui-all-fast.json`,
  static guards 0 hits, graph **188/547**, 0 dup, 0 dangling.
- **LEARNING / TRANSMISSION / KNOWLEDGE ECOLOGY / ACTIVITY-PARTIES-1** -
  *observe-only knowledge ecology projection and selected-band Knowledge UI,
  2026-07-04.* Added `src/sim/agents/knowledgeEcology.ts`, `src/ui/band/Knowledge.tsx`,
  BandPanel tab wiring, Technical proof, graph node/links, styles, and benchmark
  audit. Knowledge items are structured, capped, evidence-backed, selected-band
  projections across route/corridor, crossing, place/country, food work,
  water/refuge, risk/caution, social/contact, and inherited-memory domains.
  Existing activity-party records are used as evidence; no duplicate task-party
  system, no legacy starting-skill proof, no culture/taboo/myth/worldview/skill/
  practice/problem-framing system, and no decision influence. New audit
  **23/23 pass**: 9 profiles, 60 items, 137 evidence chips, activity refs 4,
  event refs 74, deep-history refs 4, memory refs 46, lived/inherited 56/4,
  practical/story-heard 26/31, fading 3, max profile payload 18,823 bytes,
  raw/debug/fake/legacy hits 0, broken rendered event/Chronicle links 0.
  Validation: typecheck, build, script syntax, deterministic `true`, identity
  **20/20**, event **19/19**, deep-history **13/13**, deep-time Chronicle
  **15/15**, 1C/whole-UI/Chronicle foundation/wiki/specific referent audits pass;
  all-fast 25/25 normalized sections identical to
  `artifacts/event-system-ui-all-fast.json`; static guards 0 hits; graph
  **187/529**, 0 dup, 0 dangling.
- **BAND-IDENTITY-TECH+UI-1 closure review** - *verification-only closure,
  2026-07-04.* Confirmed the accepted identity work is a pure observe-only
  projection, not stored state or a behavior input. It has six bounded dimensions,
  provenance/confidence/evidence refs, inherited-vs-lived separation, activity
  evidence from existing task records only, Technical proof, and outward links to
  Events/Chronicle without changing Chronicle prose. Validation: `npm run build`,
  `node --check scripts/simBenchmark.mjs`, deterministic `true`, identity audit
  **20/20**, event audit **19/19**, deep-time history **13/13**, deep-time
  Chronicle UI **15/15**, 1C/whole-UI/Chronicle foundation/Chronicle wiki/specific
  memory referents pass; all-fast **25/25 identical** to
  `artifacts/event-system-ui-all-fast.json` after profiler-field removal; static
  guards 0 hits for `Math.random`, unsafe any, UI imports in `src/sim`, identity
  decision-path refs, and event decision-path refs; graph **186/514**, 0 dup,
  0 dangling.
- **Events + Identity readability follow-up** - *historian-style public wording,
  2026-07-04.* Reworked selected-band Events and Identity copy so the normal UI
  reads as a compact historical portrait instead of audit output: event count/cap
  dumps softened, lower-signal event rows folded under "Smaller recent changes",
  raw recent-event phrases sanitized, Identity lead changed to "Historian's
  reading", card text now describes what differentiates the band, and large public
  evidence counts now read as "many/several" while exact bounded data remains in
  the substrate/Technical. No sim behavior, event generation, or identity scoring
  changed. Validation: `npx tsc -p tsconfig.json --noEmit`, `npm run build`,
  `node --check scripts/simBenchmark.mjs`, event audit **19/19 pass**, identity
  audit **20/20 pass**; raw/debug/fake-language hits 0 in both audits; event list
  cap 36, max event-state payload 64,623 bytes, max identity payload 19,868 bytes.
- **DEEP-TIME-CHRONICLE-UI-1** - *readable long-history Chronicle layer,
  2026-07-04.* Added selected-band Chronicle "Long memory" UI from the accepted
  `Band.deepHistory` substrate: founded/current comparison, durable era rows, durable
  episode rows, inherited rows explicitly labelled not personally lived, recent vs
  durable memory framing, and bounded evidence chips while raw proof remains Technical.
  Fixed the article sanitizer so `article.deepHistory` survives link sanitization; kept
  duplicate grounded route/camp episode proof in Technical but collapsed duplicate public
  episode summaries in the display selector. No sim decision behavior or deep-history
  observation behavior changed. New audit
  `--targeted-deep-time-chronicle-ui-audit`: **15/15 pass**; sampled 8 active
  deep-history bands, 7 old bands, 10 panels/comparisons, 30 era rows, 49 episode rows,
  4 daughters, 14 inherited rows, 0 raw-debug/code-token hits, 0 duplicate era/episode
  prose, max displayed rows 11, max Chronicle payload 82,435 bytes. Validation:
  `npm run build`; deterministic `true`; 1C, whole-UI, Chronicle foundation/wiki,
  specific-memory referents, and deep-time-history audits pass; all-fast 25 sections
  identical to `artifacts/deep-time-pre-change-baseline-all-fast.json` after profiler
  normalization; static guards 0/0/0 plus deepHistory decision-path refs 0. Not done:
  Events, Band Identity, culture/religion/myths/lore, practices/skills/problem framing,
  agriculture/domestication/territory/war/settlement systems.
- **DEEP-TIME-HISTORY-TECH-1 finalization** - *observe-only durable history substrate,
  2026-07-04.* Finished Tasks 5-9 only: selected-band Technical proof group, architecture
  graph `bandHistory` node, `--targeted-deep-time-history-audit`, payload-aware
  deep-history cap compression, full verification, and handoff/plan updates. Chronicle
  fact was skipped intentionally; no Events UI, Band Identity, culture/religion/myths,
  agriculture/domestication/territory/social-network/lore systems were added. Audit:
  13/13 pass; sampled 8 bands, 8 founding snapshots, 3 daughters, 26 eras, 158 lived
  episodes, 12 inherited episodes, max payload 19,666 bytes; cap fixture 12 eras -> 5
  with oldest span 0-180; terminal fixture absorbed year 100 pop 48. Validation:
  `npm run build`; deterministic `true`; Chronicle foundation/wiki + specific-memory
  referents pass; all-fast 25 sections behavior-identical to
  `artifacts/deep-time-pre-change-baseline-all-fast.json` after profiler-field
  normalization; static guards 0/0/0 and graph 184/494 pass. Late-June Chronicle/1C
  log backfills should be added from source reports if this remains the canonical
  handoff.
- **PRE-RUN-BAND-MANAGER-1 (SETUP-DEMOGRAPHY-MERGE-1 Phase 1 only) — setup-only add/delete starting bands** - *initial-condition editing; NO sim-behaviour/economy change, 2026-06-28.* Per the prompt's staging rule, ONLY Phase 1 was implemented; Phases 2 (demography research recalibration) and 3 (merge/collapse/remnant layer) are deferred. Sim-side (`spawn.ts`): `spawnCustomBands` (add custom founders at valid tiles, reusing the existing spawn-profile→band pipeline so cohorts auto-balance 34%/9%/rest and founder knowledge is the normal sight — never omniscient), `removeInitialBands` (drop default bands), `validateAddedBandPlacement` (same tile rules as moving: rejects aquatic/mountain/too-costly/occupied), `addedBandId`. All deterministic (defaults — size 18-31, colour from a 12-entry palette avoiding collisions, role from tile terrain or knowledge preset — hashed from seed+tile+index via `hashSeedString`; no unseeded randomness). Config: `SimWorldKind` gained `removedInitialBandIds?` + `addedBands?`; `initSimWorld` applies remove→place→add, all guarded to the setup state (no-ops once tick>0). UI (`App.tsx`): a setup-only "Bands" panel in the world-setup menu — roster list with per-band colour dot, name, population (editable number input for added bands), delete (×) button; "Add band at selected tile" (click a land tile, then add); "Reset bands"; locks automatically once Play is pressed (`setupPlacementEnabled`). New `--targeted-band-manager-audit`: **14/14 checks pass** (delete removes band, add creates valid bands, invalid aquatic tile rejected, count correct, explicit + auto population, cohorts auto-balanced, distinct colours, positions correct, deterministic same config, validation API rejects-aquatic/accepts-valid, reset no-op, **locked-after-start**). Validation: `npm run build`, band-manager audit 14/14, deterministic smoke (`deterministic=true`), `--all --fast` (25/25 sections, 0 runtime errors, 0 stderr — default runs unchanged: the benchmark builds worlds directly and `initSimWorld`'s new calls are no-ops without edits), PERCEPTION-MOBILITY-1C nearby-water regression PASS (suspicious-stuck 0), lone-band-talk regression PASS (0 violations), static guards clean (`Math\.random` 0, `: any|as any` src/sim 0, src/sim ui/render/zustand imports 0). No live editing after start, no terrain/resource/map editing, no hidden reveal. **NEXT (deferred):** Phase 2 DEMOGRAPHY-AGE-RESEARCH-1 (research-grounded fertility/mortality/cohort recalibration incl. dependent vulnerability + birth/death churn visibility + no-death audit) and Phase 3 MERGE-COLLAPSE-1 (weak-band classification, grounded support-seeking, population-conserving absorption beyond the current kin hook, readable collapse fates).
- **DEMOGRAPHY-MORTALITY-1 — Mortality/Fertility calibration + labor-collapse (ends immortal crisis gridlock)** - *demography mechanics pass, 2026-06-28.* The growth model (`demography.ts`: `rawDelta = population × growthRate`, accumulators → integer births/deaths) had a +0.002 survival baseline ≈ cancelling mortality's −0.012 weight, so chronic-deficit bands hovered at `growthRate ≈ 0` forever (immortal gridlock: 0 extinctions, 22-26 frozen chronic-deficit bands at 500y). FIX (one growth formula, calibrated conservatively from FRESH runs — a first −42%-crash attempt was reverted): mortality weight 0.012→**0.014**, chronic-deficit weight 0.004→**0.006**, and the survival baseline trimmed to **0.0014 only while in chronic deficit** (no free growth while starving); the small-band decline cap was kept at −0.018 (relaxing it to −0.026 was what caused the crash). Plus a tight **labor-collapse** viability path (`viability.ts`): a band with `workingAdults < 4 && extinctionRisk ≥ 0.74 && population < 16` collapses with cause `band_collapse_labor_failure` (alongside the existing pop<9 collapse and the kin-absorption merge hook) — so a band that loses its adults actually dies, but only when genuinely failed. Minimal Technical trace added (`DemographyFissionDetails`): recent births/deaths, cohort transitions (matured / aged-to-elder / elders-died), and a `demographicOutlook` (growing / stable / shrinking / fragile / critical, with a death-cause hint: old-age / hunger / sustained-crisis). **Fresh-run results — Map2 500y (vs PM-1C):** 36 bands, pop 1962→**1692** (−14%, recovers from a 300y dip of 1073 → boom-bust, NOT a death spiral), max band 82→**69**, **0 over 80 / 0 over 150**, chronic deficit 26→**18** (gridlock reduced), raw support mean 0.57→**0.71** (healthier survivors), deficit 34→31. **Crisis archetypes (60y):** isolated_fragile_band → **extinct 1** (a doomed 2-person band now collapses instead of persisting forever); absorption_rescue → **absorbed 1** (failing-near-kin merge hook); harsh_dry_margin → survives +77; crowded_delta → grows +128; baseline/map2 → **0 extinct** (normal bands shrink-and-stabilise, no map-wide death). Validation: `npm run build`, fresh 300y + 500y, crisis archetypes, determinism (`deterministic=true`), PERCEPTION-MOBILITY-1C nearby-water regression PASS (suspicious-stuck 0), lone-band-talk regression PASS (0 violations), `--all --fast` (25/25 sections, 0 runtime errors, 0 stderr), static guards clean (`Math\.random` 0, `: any|as any` src/sim 0, src/sim ui/render/zustand imports 0). No disease/war/territory/sedentism/full-merge/Band-Events-UI/map-editor added; absorption + "remnant could be absorbed later" hooks left in place.
- **PERCEPTION-MOBILITY-1C — Nearby-Water Residential Calibration (cue→probe→observe→relocate)** - *focused, validated behaviour fix, 2026-06-28.* Closes the "poor band stuck near visible water" inertia 1B diagnosed (6/15 poor-near-clear-water bands not investigating). ROOT CAUSE: `carryingCapacity.deriveKnownUnusedHabitat` only scores OBSERVED, non-aquatic tiles, so a band that merely SEES a lake (a visible cue) but has not observed its shore never gets a residential water candidate; and the visible-cue→probe bias (`buildVisibleLandscapeProbeCandidate`) was too weak to make poor bands scout it. FIX (one site, `src/sim/rules/bandDecision.ts`): a bounded `nearbyWaterUrgency` boost to the SCOUT/PROBE candidate's water/survival/frontier values when the band is chronically poor (max of foodStress, deficitRatio, +0.2 if chronic decline) AND the cue is a CLEAR nearby (≤6 tiles) WATER kind — so the band investigates; observing the shore then feeds the EXISTING, fully-gated residential scorer (per-capita-improvement / water-reliability / risk / attachment / route gates unchanged). No relocation shortcut, no aquatic-tile targeting, no hidden water reveal, no teleport — the cue stays an uncertain hint and the probe legitimately observes. `--targeted-nearby-water-opportunity-audit` extended with Part 5 stuck classification (relocating_or_delayed / high_load_refuge / current_camp_has_water_refuge / suspicious_stuck). **Before/after (300y Map2):** poor-near-clear-water 15→9, investigated 9→8, **stuck 6→1, suspicious-stuck 0** (the 1 remaining is `relocating_or_delayed`, already at a 0.97-water camp = justified). **Economy 300y:** pop 1226→1287 (+5%), support mean 1.18→1.30, raw-deficit 19→11, chronic 12→7, max band 55→64, **0 over 80 / 0 over 150** (healthier, not destabilised — poor bands reaching water). **Economy 500y (mega-band safety):** pop 1894→1962 (+3.6%), **max band 84→82, over-80 1→1, over-150 0→0**, support mean 0.56→0.57, support MIN 0.21→0.29 (improved), deficit 34→34, chronic 22→26 — same mega-band regime, no reckless migration / no lake collapse. Validation: `npm run build`, nearby-water audit before/after, 300y + 500y resource-foundation (pop/mega-band), determinism smoke (`deterministic=true`), lone-band-talk regression PASS (6 isolated, 0 violations), `--all --fast` (25/25 sections, 0 runtime errors, 0 stderr), static guards clean (`Math\.random` 0, `: any|as any` src/sim 0, src/sim ui/render/zustand imports 0). No mortality/merge/fertility/Band-Events/map-editor/territory/sedentism added.
- **PERCEPTION-MOBILITY-1B — Visibility / Activity / Residential Technical panels + Nearby-Water opportunity audit** - *readability/diagnostic pass, NO sim-behaviour change, 2026-06-28.* All sim-economy behaviour is identical to ECO-BIOME-1/1A (only UI read-derivations + one read-only benchmark audit were added; deterministic smoke unchanged). (1) **Visibility panel** (`VisibleLandscapeDetails` enhanced): selected-band Technical now shows the viewpoint/camp tile, **visibility range 10 tiles ≈ 15 km (1 tile = 1.5 km)**, and per-cue type/direction, **distance in tiles AND km**, **clear/partial/blocked**, confidence, readable status (visible-but-unchecked / seen-partly-checked / scouted / remembered-stale), scout-probe interest, and the cue→opportunity-move bridge count — with the anti-omniscience guard line intact (cues never create observed tiles/resource knowledge/relocation). (2) **Activity trace panel** (`ActivityTraceDetails`): recent task-group trips (hunters/fishers/gatherers/foragers/water-check/scouts) with distance tiles+km, outcome, return value, and the memory writeback (`activityMemoryEffect.effectType`) — proving activities are separate from slow whole-band movement and can range farther. (3) **Residential-move trace** (`ResidentialMoveTraceDetails`): recent whole-band moves with kind/cause/status (water_stress / poor_return / local_pressure / known_opportunity / fission_daughter…), distance tiles+km, confidence, from→to — exposing accepted vs delayed/failed_no_route reasons. (4) New **`--targeted-nearby-water-opportunity-audit`** (Part 6, 300y Map2): of 36 bands, 15 are genuinely-poor (raw support < 0.85, or chronic decline while < 0.95), all 15 near a clear water cue; **9 investigate** (fishing/water activity OR water-cause move) and **6 (40%) do NOT** despite a clear lake/delta cue ~3 tiles (4.5 km) away at support 0.36-0.72 — a real, MILD "stuck near water" inertia, surfaced with readable per-band reasons (verdict "review" = calibration recommended, not a regression). Validation: `npm run build`, nearby-water audit (diagnostic), lone-band-talk regression PASS (6 isolated bands, 0 outsider-talk violations), word-of-mouth PASS, deterministic smoke (`deterministic=true`), static guards clean (`Math\.random` 0, `: any|as any` src/sim 0, src/sim react/zustand/ui/render/canvas imports 0). **NOT done (deliberately deferred — needs its own economy-validated pass):** the residential-move CALIBRATION (Part 7) that would make those 6 stuck bands relocate toward known clear water — it moves camps and risks the validated pop/mega-band balance, so it is PERCEPTION-MOBILITY-1C. Also still pending from the broader request: the SIM-TOOLS-2 map-paint editor and the band manager.
- **PERCEPTION-MOBILITY-1 (PARTIAL / in progress) — ecology card top-3+expand & lone-band false-foreigner talk fix** - *2026-06-28; first two bounded pieces of the larger PERCEPTION-MOBILITY-1 spec.* (1) UI: the selected-band "Ecology they know" card layout was fixed (the per-bucket note was wrapping one-word-per-line in a `condition-row` grid cell) — now each bucket is a compact icon+label+chip line with the note full-width below, plus an **"Expand all"** toggle that reveals per-bucket known-place counts (`N known places · reliable · giving less · recovering · overused`). (2) BEHAVIOR FIX — **lone/isolated bands no longer invent "outsiders".** Root cause: `reportedKnowledge.deriveSourceFacts` emitted the SOCIAL topic `crowded_range_warning` whenever `rangeSaturation.saturationPressure > 0.55`, but saturation is mostly the band's OWN population overusing its range — so an isolated band mislabelled ecological self-overuse as foreigners. Fix: the social framing now requires GROUNDED other-band evidence (`pressureState.crowdingBandIds` non-empty, or `nearbyBandPressure > 0.18`, or any `contactMemories`, or `recentRangeFrictionEvents`); otherwise the pressure is reworded ecologically as `poor_return_region` (tired ground / poor returns), matching the band's actual knowledge. New `--targeted-lone-band-talk-audit` (100y Map2): 12 bands, 3 isolated, **socialTalkOnIsolatedBandViolations 0, socialReportsWithoutGrounding 0** (all 3 social reports rest on bands with grounded other-band evidence). Validation: `npm run build`, lone-band-talk audit pass, word-of-mouth audit still pass, deterministic smoke (`deterministic=true`), static guards clean (`Math\.random` 0, `: any|as any` src/sim 0, src/sim ui/render/zustand imports 0). **STILL TODO in PERCEPTION-MOBILITY-1 (not done this pass):** visibility Technical exposure (tiles/km, cue clear/blocked/checked states), activity-system audit/Technical exposure, activity→residential feedback, residential-move calibration + nearby-water-opportunity audit, lineage-gated contact tiers (Tier 0-3), Band Events scaffolding, and the remaining audits. Also pending from the user's combined request: SIM-TOOLS-2 map-paint editor and the band manager (add/remove/list pre-run).
- **SIM-TOOLS-1 Ecology Inspection (simple + debug, anti-omniscient) + Band-Editor Verification** - *tooling/customization pass, ZERO sim-behaviour change, 2026-06-28.* New pure `src/sim/agents/ecologySummary.ts` (`summarizeWorldEcology`) → a tiny world-TRUTH ecology aggregate (fauna/aquatic stock category counts rich/decent/poor/depleted/recovering + overused/disturbed + mean abundance; plant worked-patch records/overharvested/mean depletion; overall pressure low/medium/high) added to `SimDynamicSnapshot.ecologySummary` (computed worker-side from the true world, since the merged UI world lacks fauna/plant dynamic state) and threaded to the Zustand store (`store.ecologySummary` + `ecologyViewMode`) via `simBridge.publishWorld`. New pure UI helper `src/ui/ecologyView.ts` (TYPE-ONLY sim imports): `deriveSelectedBandEcology(band)` derives Wildlife/Fish/Plants categories ONLY from the band's own `resourceKnowledgeState.patchMemories` (state ladder + yield-trend scoring) so an undiscovered stock/patch reads "unknown" (anti-omniscient by construction — it never reads world truth); `formatWorldEcology(summary)` formats the explicitly-labelled DEBUG dashboard. Surfaced: a player-facing "Ecology they know" card in BandPanel Overview, and a "World ecology — DEBUG truth" collapsible in BandPanel Technical (strictly separate sources — band view never reads truth, debug view never reads band memory). New `--targeted-ecology-view-audit` (60y Map2): world-truth summary matches physical stock/patch state (fauna 260 = 215 land + 45 aquatic; plant records exact); across all bands the selected-band view has **0 known-place mismatches, 0 unknown-leak violations, 0 mutations, 0 nondeterminism, debug-flag present** — proving the simple view can never reveal undiscovered ecology and both derivations are pure. The pre-run BAND editor (canvas drag-place + live `validateInitialBandPlacement` green/red preview + `isSetupPlacementAvailable` lock once `tick>0`/decisions exist + serialize into `SimWorldKind.initialBandPlacements` + recompute origin-dependent state via `applyInitialBandPlacements`) ALREADY existed and is re-verified by `--targeted-initial-placement-audit` (pass: defaultStart/movedStart/validity/resetProof/determinism/setupOnly/multiBand). `procedural` seed-based custom maps already run. **SCOPE NOTE (honest):** the terrain-PAINT map editor and paint-based custom-map-maker are deferred to SIM-TOOLS-2 — both require a tile-override diff in the run config plus regeneration of derived hydrology/passability/resource-potential/plant+fauna geography after edits, a large separately-validated canvas effort; band add/remove UI (move/place exist) and the optional ecology MAP overlay are also SIM-TOOLS-2 (the panels/cards + TileInspector cover inspection without a painting overlay). Validation: `npm run build`, ecology-view audit, initial-placement audit, deterministic smoke, `--all --fast` (25/25 sections, 0 runtime errors, 0 stderr — sim byte-behaviour unchanged); static guards clean (`Math\.random` 0, `: any|as any` in src/sim 0, src/sim react/zustand/ui/render/canvas imports 0). No core ecology/migration/demography/behaviour was touched.
- **ECO-BIOME-1 Plant Physical Patch Ecology + Plant Support Coupling + Processing/Fallback Consequences (+ fauna kept calibrated)** - *the plant mirror of FAUNA/AQUATIC-1; closes the gathering→depletion→support→recovery loop for plants, 2026-06-28.* New pure `src/sim/agents/plantStock.ts` activates the rich `PLANT_CLASS_PROFILES` (fruit/nuts/tubers/grain/greens/wetland food + fiber/fuel/medicinal non-food) as a finite physical layer WITHOUT persisting massive per-tile patch objects: a SPARSE `world.plantPatchState` human-depletion overlay (only gathered/occupied patches deviate from baseline; per-tile food-patch presence memoized by tile+season), advanced once per season (after `advanceFaunaStocks`, mirroring `tileDepletion`) from gathering-trip depletion + catchment occupation, recovering at class-specific regrowth rates (fast_wetland 0.34, seasonal_annual 0.26, belowground_reserve 0.16, multi_year_mast 0.12, slow_woody 0.14). A bounded plant support multiplier in `carryingCapacity` (capped 10% of a tile's food support, coupled to `generic_plant_food` ONLY so it never double-counts fauna's aquatic_food/animal_food multipliers; uncovered tiles → factor 1, prior behaviour) makes overharvesting a berry slope / tuber ground cost realized support until it rests; gathering trip RETURNS scale by patch abundance/season (seasonal ripening/mast pulse >1, depleted/lean <1); processing-heavy classes add a small capped per-capita labor drag (`processingLaborDrag`, not a second support cut); and sustained emergency-fallback reliance adds a gentle capped demographic stress (wiring the previously-measured-but-unread `ecologicalStressCauses.fallbackFoodReliance` into the demography food-stress brake ×0.08). Materials/fuel/reeds stay 0 calories (audited). Anti-omniscience preserved: depletion read only at present/scouted tiles; geography never handed to a band; uncovered tiles → no plant knowledge; plant scouting unchanged (`derivePlantScoutObservationHint`). New `--targeted-plant-stock-audit` fixture (gather depletion monotone+bounded 0→0.91, depleted return 0.52→0.20, depleted support mult 1→0.89, rested recovery 0.91→0, determinism, materials=0): **9/9 pass**. New `plantPhysicalEcologyAudit` in the resource-foundation suite. **500y Map2 (vs FAUNA/AQUATIC-1): verdict pass→pass, 36 active bands, 0 extinct, pop 1966→1894 (−3.7%), max band 81→84, >80 = 1, >150 = 0, raw support mean 0.63→0.56 / min 0.16→0.21, raw deficit 31→34, chronic deficit 20→22** (the new finite-plant pressure makes a few more late deficits interpretable as overharvested crowded grounds while population stays stable and mega-bands controlled); plant ecology = 525 sparse dynamic patch records (wetland/grain/tuber/mast/berry), mean depletion 0.23, 193 overharvested (>0.3) / 1 heavily (>0.55), plant support loss mean 3.04 (p90 5.17), material food contribution 0, hidden plant-knowledge violations 0, anti-omni report-unlock 0. 300y Map2: pop 1315→1226, max band 63→55, 0 over 80, chronic 17→12, 585 records / 212 overharvested. Runtime 500y ≈ 115ms/tick (the plant advance is cheap: sparse, memoized per-tile geography, O(claimed tiles) per season). **SCOPE NOTE:** this pass delivered the plant physical-ecology CORE + support/processing/fallback coupling + a deterministic fixture and kept FAUNA/AQUATIC-1's already-safe fauna calibration; the prompt's loop-SURFACING items — fauna disturbance→talk/scout-nudge (Part 3), seasonal-fish-run talk (Part 4), fauna sign→scouting wiring of `deriveFaunaSignStrength` (Part 6), and dedicated plant rotation/pulse TALK lines (Parts 9-10, 13) — ride the existing FAUNA/AQUATIC-1 + plant-patch-memory/`derivePlantScoutObservationHint` scaffolding (returns/depletion/support are grounded; the extra talk/scout surfacing is the recommended ECO-BIOME-2 follow-on). Validation: `npm run build`, plant-stock + fauna-stock fixtures, resource-foundation/raw-deficit/mega-band/migration-pressure/eco-cal/visibility/reachability/reply/withholding/spacing/anti-omniscience/long-horizon + plant/fauna ecology audits at 500y, deterministic smoke, `--all --fast` pass; static guards clean (`Math\.random` 0, `: any|as any` in src/sim 0, src/sim UI/render imports 0); graph files untouched.
- **FAUNA/AQUATIC-1 Finite Fauna / Aquatic Stocks + Hunting/Fishing Returns + Human-Fauna Pressure** - *finite causal fauna substrate replacing the animal/hunting placeholder, 2026-06-27.* New pure `src/sim/agents/faunaStock.ts`: bounded, summarized animal/aquatic STOCK ZONES (lake/river-reach/delta-wetland/seasonal-run/shellfish fish + large/medium/small/upland/forest-edge game + waterfowl) generated deterministically from tile habitat (memoized by the tiles record), each with carrying capacity, seasonality, mobility, pressure sensitivity, detectability, and a risk placeholder; NO individual-animal agents, NO predator-prey web, NO domestication/storage. Dynamic abundance + disturbance live in a SPARSE `world.faunaStocks` advanced once per season (mirrors M0.14 `tileDepletion`) from catchment occupation plus in-season hunting/fishing trip depletion, recovering when rested and floored so a stock never disappears. Stocks physically scale realized `animal_food`/`aquatic_food` support through a bounded fauna multiplier in `carryingCapacity.ts` (capped at 18% of a tile's food support so depletion is causal but never craters population, and the class renormalisation cannot paper over it); hunting/fishing trip RETURNS scale by stock abundance/season (>1 only on a seasonal run, lower when depleted/lean/disturbed); successful trips deplete the targeted stock and scatter it (disturbance). Anti-omniscience preserved: geography is never handed to a band — bands learn through their own patch memory / scout signs / inter-band reports (all pre-existing scaffolding for `animal_food`/`aquatic_food`/`animal_sign` now grounded), inherited memory stays degraded, and an uncovered tile yields a fauna SIGN of exactly 0. New `--targeted-fauna-stock-audit` unit fixture (geography determinism + bounded counts + monotone floored trip depletion + rested recovery + depleted-return-lower + seasonal pulse + uncovered-sign-zero): 11/11 checks pass. New `faunaAquaticStockAudit` block inside the resource-foundation suite. **500y Map2 (vs ECO-CAL-VIS): verdict pass→pass, 36 active bands, pop 1994→1966 (−1.4%), max band 81→81, >80 = 1, >150 = 0, raw support mean 0.65→0.63 / p50 0.60 / min 0.16, raw deficit 31/36, chronic deficit 17→20** (the new fauna pressure makes a few more late deficits interpretable as overhunted/overfished crowded cores); finite ecology = 260 bounded stock zones (45 aquatic / 215 terrestrial, ≤13 influence tiles each), 41 dynamic records, 28 overused (<0.7) / 14 heavily-overused (<0.45) / 30 disturbed cores, min abundance 0.41, fauna-support-loss mean 0.61 (p90 3.26 / max 5.39), 342 fauna patch memories, hidden-stock-knowledge violations 0, report-created-resource violations 0. 300y Map2: pop 1316→1315, max band 63, 0 over 80. Note: the benchmark's reconstructed macro loop does not run intra-season trips, so the macro audit exercises the camp/occupation depletion driver and the fixture covers trip depletion/return/recovery; the real runner path (`advanceWorldByDays`→`runDailyActions`→`applyTripDay`) runs both and passes the activity-path-passability audit. Validation: `npm run build`, fauna-stock fixture, resource-foundation/raw-deficit/mega-band/migration-pressure/eco-cal/visibility/reachability/reply/withholding/spacing/anti-omniscience/long-horizon suite at 500y, activity-path-passability, deterministic smoke, and `--all --fast` pass; static guards clean (`Math\.random` 0, `: any|as any` in src/sim 0, src/sim UI/render imports 0); graph files untouched.
- **ECO-CAL-VIS Ecology Calibration / Visibility / Talk Reachability / New-Band Spacing** - *integrated calibration and perception/social polish, 2026-06-27.* Tuned finite support/recovery and chronic-deficit demography without reverting shared catchment pressure; added capped visible landscape cues (3-10 tiles, not observed/resource/support/relocation), contact-path-gated inter-band reports, grounded receiver replies, rare source-biased/withheld weak-contact talk, and fission target spacing from known bands only. Final 500y Map2 audit: pass, 36 active bands, total pop 1994, max band 81, >150 = 0, raw support mean/p50/p90 0.65/0.60/1.22, chronic deficit 17/36, shared pressure mean/max 0.23/0.74, 858 bounded depletion records, 216 visible cues with 14 probe/scout influences, visibility/report relocation/resource/observed-tile violations 0, inter-band false telepathy 0, replies without evidence 0, source-bias rarity 0.111, hidden unknown-band avoidance 0, anti-omniscience violations 0. Validation: build, ECO-CAL/resource/shared/raw/mega/migration/visibility/reachability/reply/withholding/spacing/anti-omniscience audits, word-of-mouth, regional reported-knowledge, talk UI/report UX, deterministic smoke, Map1/Map2 smokes, RANGE-1/2/3/4, activity-path, residential-move, focused 500y stuck, `--all --fast`, and static guards pass; graph files untouched.
- **Pre-Run Band Start Placement / Drag-to-Choose Origin** - *setup-only origin editing, 2026-06-27.* Added `SimWorldKind.initialBandPlacements`, pure spawn-side validation/rebuild helpers, canvas drag preview, setup-only UI gating, and `--targeted-initial-placement-audit`. Placement accepts only valid unoccupied initial camp tiles before any decisions, rebuilds origin-dependent starter state from spawn profiles, disables after tick/decision history begins, and keeps worker/main deterministic for the same map seed + run seed + chosen tile list. Build, deterministic Map1/Map2 smokes, targeted placement audit, and static guards pass.
- **ECO-MIG-FOUNDATION Finite Resource Pressure / Catchment Support / Mega-Band Control** - *causal ecology-support-migration bridge, 2026-06-27.* Resource classes gained causal functional metadata and pressure/regrowth behavior; shared catchment support now applies overlapping-use pressure, tile depletion, class pressure, and nomadic scale/logistical pressure; raw surplus/deficit, resource class contributions, support losses, ecological stress causes, and nomadic scale state are exposed in debug/audits. Movement/fission now responds to the band's own known resource pressure and known opportunities without hidden exact targeting, teleport, report relocation, crossing-gate bypass, territory/conflict, sedentarism, agriculture, or fauna stocks. New ECO audit suite (`--targeted-resource-foundation-audit`, shared-catchment/raw-deficit/mega-band/migration-pressure/anti-omniscience/long-horizon aliases, `--eco-mig-audit-years`). 500y Map2 audit: 36 active bands, total pop 2467, max band 101, >150/>300/>500/>1000 = 0, raw deficit visible for 36/36, overlapping catchments 23, max overlap 6, 889 depletion records, max patch memory 48, anti-omniscience violations 0, known opportunities considered for 36/36. Single-origin 500y: no teleport, 20 active bands, 2 catchments, longest lineage distance 105 tiles, 29 known ford uses, but still mostly river-corridor anchored. Build and ECO audits pass; remaining risk is calibration severity and long-run performance.
- **PERF-6 Movement / Frontier / Range Candidate Performance** - *movement/frontier internals measured + modest safe optimization, 2026-06-27.* Added `--targeted-perf-6-profile` internal `movement:*` and `context:*` timings/counters plus MIG-1 spatial extent diagnostics. Behavior-equivalent optimizations cache known-tile stats, corridor edge lookup, report target bias, and side-country evidence per decision; split known-move radius/filter/sort profiling; changed nearby/frontier opportunity selection to one-pass or bounded deterministic top-N instead of full accepted-set sorts; reduced frontierKnowledge allocation/sort work. No migration/frontier calibration, no forced dispersal, no hidden rich-tile targeting, no report relocation, no crossing gate loosening, and no economy/pop/stress/territory/conflict change. Map2 500y improved modestly from PERF-5 194.58s / 97.29ms tick to 188.31s / 94.15ms tick; macro counts stayed 36 active bands, 27 fissions, 144 residential moves, 576 active reports. 1000y remains capped: normal 2565/4000 ticks in 300s, fast 2140/4000 in 180s. Remaining hotspots: movement candidate generation/scoring, frontier opportunity, reportedKnowledge second-order cost, and range/carrying-capacity state. Validation: build, targeted PERF-6 profiles, deterministic smoke, Map1/Map2 smokes, RANGE-1/2/3/4, word-of-mouth, regional reported-knowledge, talk UI/report UX, band-life, activity-composition, activity-path, residential-move, focused 500y stuck audit, `--all --fast`, and exact static guards pass.
- **PERF-5 Reported Knowledge Cadence / Indexing** - *before-decision report hot path optimized, 2026-06-27.* Added benchmark-only `reportedKnowledge:*` phase timings and counters; partitioned report work into cheap per-tick lifecycle refresh plus deterministic cadence full evidence/speculation/internal-talk refresh; added per-band evidence indices and report-region/tile match caches so support/contradiction checks avoid repeated known-memory scans. No gameplay expansion, UI redesign, map hints, hidden truth, exact tile reveal, report-forced migration, resource unlock, economy/pop/stress, territory/conflict, or accepted UI behavior removal. Map2 actual-context profile: 500y improved 233.66s / 116.83ms tick -> 194.58s / 97.29ms tick; reported knowledge 28.88 -> 10.10ms/tick; evidence scanning 22.38 -> 5.17ms/tick; report refresh 21.28 -> 4.79ms/tick. Macro drift small: 36 active bands and 27 fissions unchanged, pop 2969 -> 2965, residential moves 144 unchanged; active reports cap-compliant at 576, speculations 252 -> 239. 1000y still caps but progresses farther: normal 2573/4000 ticks in 300s (PERF-4 2383), fast 2116/4000 in 180s (PERF-4 1922); remaining bottleneck is movement/frontier/range. Validation: build, deterministic smoke, Map1/Map2 smokes, RANGE-1/2/3/4, word-of-mouth, regional reported-knowledge, talk UI/report UX, band-life, activity-composition, activity-path, residential-move, focused 500y stuck audit, `--all --fast`, and exact static guards pass.
- **Word-of-Mouth UI v2 + Frozen-Residence Pressure Polish** - *living selected-band talk cards + source/ranking/lifecycle audit + focused stuck-band fix, 2026-06-26.* Overview now splits selected-band talk into Internal Band Talk and Inter-Band Talk, each showing top 3 ranked talks by default plus active count, source, confidence/freshness/lifecycle/status, and an expandable filtered full list; Technical keeps the full raw debug reports. Report source kinds now cover grounded internal activity/camp/memory sources and grounded inter-band kin/contact/shared-use/crowded-water/ford/delta/secondhand sources. Talk templates/ranking/lifecycle/distortion wording are richer but still regional, deterministic, selected-band only, capped, merged, and fading; no exact hidden tile reveal, resource unlock, support/yield/CC/pop/stress change, territory/conflict, or report-forced migration. Added `--targeted-talk-ui-report-ux-audit` (pass: 10 source kinds, 17 topics, active internal/inter-band talk, max visible Overview talks 6, max expanded 24, expired/faded 2,975, merged 656, distorted 17, behavior-linked 64, caps/determinism true). Frozen-band focus: `bandDecision.ts` bad-site dwell penalty now starts at 6 same-tile seasons, hardens toward 18, includes crowding/range/social pressure, and applies fully to stay plus lightly to repeated residence-unchanged probe/scout actions; it still never forces movement or bypasses known/passable/route/risk gates. Stuck audit now supports `--stuck-single-origin-years`; 500y single-origin Map 2 pass: 24 active bands, max dwell 11 seasons, frozen bad-site bands 0, long stressed dwell bands 0. Validation: build pass; graph 183/484; regional-reported-knowledge, word-of-mouth, talk-ui/report-ux, stuck 500y single-origin, RANGE-4, band-life, activity-composition, activity-path, deterministic smoke, Map1/Map2 smokes, and `--all --fast` pass; static guards clean for executable `Math.random(`/`: any|as any`/src-sim UI imports, broad prose greps only find comments/text.
- **Regional Reported Knowledge v1 + Seasonal Color Sync Fix** - *regional-first reports + internal talk/speculation + cosmetic season-color repair, 2026-06-26.* Upgraded `ReportedKnowledge` from tile-ish kin reports to approximate regional memory: `regionTarget` (kind/direction/precision/radius + optional audit tile), `sourceBasis`, confirmation/evidence/contradiction fields, deterministic trust/freshness/distortion, bounded active records and speculations. Internal reports now derive from real scout/resource-scout returns, forager/fishing/water/hunting/gathering trip outcomes, crossings/corridors, range-friction notices, and residential moves. Inter-band reports remain kin/contact/shared-water/proximity based with hop decay. Behaviour stays tiny and gated to already-known/local/route/ford/edge-backed candidates; no report creates observed tiles, resources, support/yield/CC, stress/pop/mortality, territory/conflict, or direct relocation. BandPanel Overview adds "Current talk / reports"; Technical keeps the full debug table. Seasonal visuals were made render-only but less muted and synchronized: gradual calendar-day cross-fade, brighter spring green-up, deeper summer green, warmer autumn, restrained winter frost/snow, and terrain cache keyed by fresh live-overlay visual day. Validation: build pass; graph 183/484; RANGE-1/2/3/4, word-of-mouth, regional-reported-knowledge, seasonal-visual, band-life, activity-composition, activity-path-passability, residential-move, deterministic baseline smoke, Map1/Map2 smokes, and `--all --fast` pass. Regional audit aggregate: 4,185 reports (3,851 internal / 334 inter-band), 112 active records, 54 speculations, 103 checked-by-probe, 67 partially confirmed, 41 contradicted, 0 report-created observed tiles, 0 resource unlocks, 0 direct report relocations, caps/determinism true. Executable guards clean (`Math.random(` 0, `: any|as any` 0, src/sim UI imports 0); broad prose greps only find comments/text.
- **RANGE-4 Record-Only Intrusion / Tension Events + Seasonal Map Visual Skin v0** - *record-only shared-use/tension memory + cosmetic seasonal terrain, 2026-06-24.* Added `src/sim/agents/rangeFriction.ts`, `Band.recentRangeFrictionEvents`, BandPanel "Shared-use / tension notices (RANGE-4)", graph node `rangeFriction`, and `--targeted-range-4-audit`. Events are bounded (cap 8 ring), deterministic, grounded in familiar-country tiers / residential anchors / recent trips / known fords / kin-contact relation / report warnings, and carry explicit no-conflict/no-movement/no-population/no-stress/no-yield/no-territory guard flags; daughters reset the ring. Kin/lineage use is tolerated/shared-use; repeated weak-contact/stranger water/core/route/ford use can become watchful/mild record-only tension. Word-of-mouth can link warnings but never reveal truth or force action. Added `src/render/seasonalVisuals.ts` autumn/winter skin expansion plus a cosmetic `Seasons` toggle; terrain colors shift by season using existing render-visible terrain/elevation/dryness signals only, with dry lowlands kept dry and high ground receiving stronger winter snow/frost. No sim behaviour, ecology, movement, support/yield/CC, stress, population, conflict, or border mechanics changed. Validation: build OK; graph 183/484 0/0; RANGE-1/2/3, word-of-mouth, band-life, activity-composition, activity-path, fast-time overlay, residential-move, deterministic smoke, Map1/Map2 smoke, and `--all --fast` pass. RANGE-4 audit: 42 events, 40 kin tolerated, 2 outsider watchful/mild, 1 report-linked, guardViolations 0, maxRing 8, deterministic repeat true. Seasonal audit: autumn/winter visible on Map1+Map2, dry-lowland snow avg 0, high-elevation snow stronger than dry lowland.
- **Stuck-site / Dormant Depletion Hotfix** - *bounded behaviour fix + sparse optimization, 2026-06-24.* Root cause for apparent frozen bands: the current tile always has a valid stay candidate when known/passable, and under some harsh-but-familiar conditions stay could keep winning despite bad pressure. Added a stay-only bad-site dwell penalty after final intent shaping in `src/sim/rules/bandDecision.ts`: it activates only after 8+ same-tile seasons and scales toward 24 seasons using the band's own pressure/local-survival/depletion/risk signals. It does not force movement, does not touch daily `band.position`, does not weaken global attachment, and does not choose hidden targets; existing move/probe/scout candidates still need known/passable/risk-valid routes. Added dormant sparse depletion handling in `src/sim/world/depletion.ts`: current/near-band entries use normal tile ecology; far abandoned entries skip tile-profile regeneration and decay by a cheap scalar until dropped, bounded by active-band radius 6 and no full-map scan. New `--targeted-stuck-band-audit` reports long same-tile dwell under pressure, last decision winner, non-stay alternatives, and depletion entries. Result @80y: pass, deterministic true, Map1/Map2 `frozenBadTileBands=0`; dry-margin stressed sample chose `logistical_probe` over stay (stay 0.99 vs probe 4.63). Validation: build OK; graph 180/464 0/0; stuck audit pass; deterministic smoke matched; activity-path passability pass; residential-move pass; `--all --fast` exit 0; executable guards clean (`Math.random(` 0, `: any|as any` 0, src/sim UI imports 0).
- **Activity Composition Calibration / Camp Life Tasks v0** - *read-only visible composition + camp-life surface, 2026-06-24.* Added `deriveCampLifeDisplay` in `src/ui/bandLife.ts` and a BandPanel Activity support card showing the real residential-center labor remainder from `activityLaborSummary.peopleAtResidentialCenterEstimate` plus demographic dependents/elders. This is display-only: no new activity records, no support/yield/carrying-capacity/stress/population/mortality change, and AG11 remains default OFF. Activity summaries now include camp-life chips/details when the trip ledger is specialized, so rich river/lake/estuary bands can still look like living residential groups instead of only repeated outbound food rows. Added `--targeted-activity-composition-audit`: raw task type, resourceClassId, readable/detailed label, broad food/water/scout/route categories, top-share/repetition runs, monotony classification (`trueMonotony`, `labelMonotony`, `ecologicalMonotony`, `missingRoleMonotony`), camp-labor remainder, hunger-vs-hunting diagnosis, AG10/AG11 status, known-target/no-teleport guards, and determinism. Audit result: **pass**. Map1 20y: 120 trips, food_fish 40 / food_gather 42 / food_hunt 38; 3 hungry bands with trips, 2 with hunting, 1 hungry-with-animal-memory still gathering. Map2 20y: 216 trips, water 96 / food_fish 77 / food_hunt 34 / food_gather 9; 4 hungry bands with trips, 1 with hunting, 1 rich basin case has animal memory but shore fishing wins. Diagnosis: starvation currently enables known food-resource checks, not forced hunting; hunting appears when animal_food memories win the deterministic selector. No generation calibration was applied in this pass because the audit proves much of the repetition is real water/food specialization plus missing camp-role visibility, not only label collapse. Validation: build OK; graph 180/464 0/0; RANGE-1/2/3 pass; band-life readability pass; activity-composition pass; activity-path-passability pass; residential-move pass; fast-time overlay pass; baseline deterministic smoke matched; Map1/Map2 20y smokes complete; `--all --fast` 25/25 complete; strict executable guards clean (`Math.random(` 0, `: any|as any` 0, src/sim UI imports 0). Broad `\bany\b` guard still finds existing comments/identifier names only.
- **RANGE-3B Light Exploration + Kin Word-of-Mouth v0** - *bounded reported-knowledge texture + tiny known-route exploration bias, 2026-06-24.* Added `src/sim/agents/reportedKnowledge.ts`, `Band.reportedKnowledge`, BandPanel "Reports / shared knowledge", graph node `reportedKnowledge`, and `--targeted-word-of-mouth-audit`. Parent/daughter/sibling/lineage/contact/proximity reports can mention water, fish/delta/wetland, animals, seasonal opportunity, fords/crossings, tributary route, poor returns, avoid places, safe side-country, and crowding, with deterministic trust/freshness/distortion/disposition. Reports never create observed terrain/resources, never unlock support/yield/CC, never alter population/stress/mortality, never cause direct relocation, and never imply a language system. Behaviour effect is deliberately small: a report can only bias probe/move/fission scoring when the target is already local/known or backed by existing route/ford/edge evidence; known creek/tributary, opposite-bank ford, and side-country evidence get similarly tiny bonuses. Audit pass: 100y reports 22/active 8 with ford/animal/warning topics; 200y reports 275/active 13, checked-by-probe 3, acted-on dispositions 28, known ford uses 3, directRelocationWithoutKnownOrRouteEvidence 0, report-created observed tiles 0, resource unlock 0, teleport 0, deterministic repeat true. Pacing remains conservative: still one catchment by 200y in the fixture, no explosion, tributary path not exercised by that route (`knownTributaryBands` 0). Validation: build pass; graph 181/472; RANGE-1/2/3 pass; band-life/activity-composition/passability/fast-time/stuck-band pass; deterministic smoke matched; Map1/Map2 smokes complete; `--all --fast` 25/25 complete; residential-move audit attempted but timed out in this run; executable static guards clean.
- **Band Life Readability / Activity Variety** - *player-facing state richness + Range All wash fix, 2026-06-24.* Added pure UI `src/ui/bandLife.ts` and wired BandPanel headline/Overview/Activity/Roster/History to show current activity, movement/range context, intent, reason, deterministic variants, time-scale summaries, and resource-aware activity labels from existing trip/range/pressure/lineage signals only. No sim behaviour/economy/pop/stress/CC/mortality change; AG10 remains shadow-only and AG11 remains default OFF. New audit shows the rich-band "all foraging" issue is partly label collapse (`local_foraging_group` hides aquatic/animal/plant work) and partly real monotone local fishing/water work in some bands: Map1 120 trips -> raw local 72 but readable fishing 40/hunting 24/gathering 8 plus explicit gathering 34/hunting 14; Map2 216 trips -> water 96/local 24/fishing 53/hunting 34/gathering 9. Extra same-treatment area: History wording. Range overlay side-fix: default OFF, Selected visible, All no longer stub; `Range: All` draws low-alpha coloured familiar-country washes over active-band use pixels (not borders/territory/ownership). Small wording polish removes visible `game`/`game sign` language from `src/ui` in favour of animal tracks/sign wording and renames the visible Map 1 label to "Lake/River Reference". Validation: build, graph 180/464 0/0, RANGE-1/2/3, activity-path-passability, fast-time-overlay, deterministic smoke, `--all --fast`, and strict executable guards all pass.
- **Drag-lag + Range-control hotfix** - *UI/render-only, 2026-06-24.* Range control now matches Activity as a dropdown (`Off / Selected / All`) instead of a mismatched button. Canvas drag now paints the new camera immediately after applying a pan update, avoiding a one-render-loop frame of cursor lag; familiar-country range derivations are cached per world/tick/band so Range Selected/All do not recompute range derivations while panning. `npm run build` passes.
- **RANGE overlay preflight** - *visual/functionality fix before continuing RANGE-3B, 2026-06-23; superseded for All mode by Band Life 2026-06-24.* Default remains OFF. Selected mode was audited from UI button -> store -> render snapshot -> `deriveFamiliarCountry(selectedBand, tick)`: selected-band lookup is valid, meaningful old-band RANGE-1 memory exists, and the overlay is drawn after the over-layer/atmosphere. The visible wash is now warm lineage-tinted with alpha 0.18/0.30/0.46 for edge/familiar/core tiles; it remains a soft use-range wash plus camp/water core marks, not political borders or ownership. Headless Chrome manual check after reload, Year 30 Seasonal, selected old `Green River Band`: Off -> Selected changed 1,631 canvas pixels and screenshot inspection showed the familiar-country wash. Quick verdict: **Range Selected visible on old band: yes.** At the time All was a labeled stub; the Band Life checkpoint changed All into a real transparent all-band familiar-country wash. Validation: build, RANGE-1 audit, RANGE-3 audit, and fast-time overlay freshness all pass.
- **RANGE-3B** - Founder Pulse Calibration + Playable Spread Tuning - *bounded behaviour calibration; normal MVP default ON, 2026-06-23.* Supersedes only RANGE-3's default-OFF founder-bias decision. `daughterColonizationFissionBiasEnabled` now defaults to calibrated ON (`undefined`), while audits set `false` explicitly for the conservative comparison. Behaviour remains cause-gated and fission-target-only: ordinary seasonal attachment is unchanged; no forced migration; no random wandering; no hidden richness; risk/water/confidence gates remain; distance relaxation applies only to the matched band-known opportunity with route/ford/edge/side-country evidence. `deriveKnownUnusedHabitat` now includes observed side-country resource-memory tiles as bounded opportunity candidates (cap 6, patch confidence/access/safety required), so side-country can become settlement opportunity only after observation/probe memory, never from inferred land alone. `--targeted-single-origin-spread --spread-500` now reports 100/200/300/500 OFF vs ON plus founder-pulse candidates, accepted pulses, blocked-reason distributions, target-distance stats, route/ford/edge backing, no-teleport, and too-explosive flags. Final spread: 100y local OFF=ON; 200y local but route-backed candidates visible; 300y ON breaks river-lock (2 catchments, 14.3% outside) while OFF remains one catchment; 500y ON reaches 3 catchments and longest distance 119 vs OFF 2 catchments/93, with no teleport (max step 2 <= 8) and no explosion. Validation: build OK; graph 180/464 0/0; RANGE-1/2/3, residential-move, activity-path-passability, fast-time-overlay, 2K.12 reader, deterministic smoke, Map1/Map2 smoke, and `--all --fast` 25/25 pass; executable guards clean (`Math.random(` 0, typed any/as any 0, src/sim UI imports 0). **Next: RANGE-4 record-only intrusion/tension events** unless another calibration pass is requested for side-country thresholds.
- **RANGE-3** - Social Range Recognition + Daughter Identity + Ford Context + Founder-Spread Calibration - *read-only derived layers + overlay/glow visual fixes + ONE flag-gated DEFAULT-OFF fission bias; sim byte-identical at default, 2026-06-23.* **Three new pure read-only `src/sim/agents` modules, never imported by `stepSim` (RANGE-1/2 pattern ⇒ byte-identical):** `socialRangeRecognition.ts` `deriveSocialRangeRecognition(observer, world, tick)` derives a band's awareness of kin/neighbour ranges from a bounded **kin ∪ `contactMemories`** candidate set (no all-band/all-tile scan; cap 8; deterministic order) — `relationKind` (parent/daughter/sibling/lineage_kin/familiar_neighbor/repeated_water_neighbor/distant_unknown/stranger), `awarenessLevel` (none→glimpsed→suspected→familiar→recognized, kin floor), `rangeRelation`+`sharedRangeTileCount`+`sharedWaterCoreCount` from `deriveFamiliarCountry(observer)` vs `deriveFamiliarCountry(target)` (reads each band's OWN memory — RANGE-2 precedent; no `world.tiles` truth). `lineageIdentity.ts` `deriveLineageIdentity` is **evidence-gated** (founder → parent_dependent_daughter → lineage_branch → independent_range_identity → new_country_founder; constants `BRANCH_MIN_TICKS 12`, `INDEP_MIN_TICKS 28`, `INDEP_SHARED_MAX 3`, `IDENTITY_HUE_SHIFT 28`; audited NO premature independence) with a **display-only `identityColor`** that keeps the RANGE-2 hue family for dependent daughters and hue-shifts ONLY at the independence transition (per-tick render memo, never stored on the band, absent from fingerprint/baselines). `fordContext.ts` `deriveFordContext` surfaces `world.riverCrossings` filtered to **band-known tiles / `crossingMemories`** (anti-omniscience; cap 8) joined with `KnownCrossingMemory` (useCount/successConfidence). **Visual fixes:** `store.ts` Range overlay default `"selected"`→**`"off"`** + type widened `off|selected|all` (Off/Selected live, All a subtle stub) + readability (tier alpha 0.05/0.10/0.18→**0.08/0.16/0.28** and the overlay drawn AFTER the over-layer atmosphere blit so it isn't washed out); the unconditional daughter aura ring in `canvasRenderer.ts` is now gated **`isDaughter && isSelected`** (unselected daughters lose the halo). **UI:** BandPanel Technical "Known neighbouring ranges", "Lineage identity", "Outward establishment (report-only)" sections (the last surfaces existing `daughterColonization`/`pressureState`/`frontierDispersal`). **Behaviour (flag-gated, DEFAULT OFF ⇒ byte-identical):** `WorldAuditOptions.daughterColonizationFissionBiasEnabled` binds `band.daughterColonization.pressure` + the band-known `bestKnownUnusedHabitatOpportunity` into `scoreFissionTarget` (`demography.ts`; daughters only; `COLONIZE_MIN 0.32`, `COLONIZE_BONUS_W 0.58`, `DIST_RELAX 0.3`; bonus + distance-relaxation on the opportunity tile only; never touches risk/crowding/richness). OFF is bit-identical (`x−0.3·0===x`, `score+0===score`); the only `--all --fast` before/after diffs are wall-clock timing + a pre-existing run-to-run phase-order dump artifact (two same-code runs differ identically — `--deterministic` is the real fingerprint, prints `deterministic=true`). **Single-origin spread audit (extends HEAT-1, `--targeted-single-origin-spread`, OFF vs ON):** lone-origin map2 is **river-locked at 100y/200y** (occupiedCatchments 1, 0% outside origin; low population ⇒ pressure rarely clears `COLONIZE_MIN`, lever correctly inert) and **breaks to a 2nd catchment by 500y EVEN FLAG-OFF** (occupiedCatchments 2, ~25–32% bands outside origin, longest lineage 63–93) via **20 known-ford crossings + breadcrumb steps (no teleport; passability respected)**; flag ON nudges bands-outside-origin up at 500y (0.318 vs 0.25). **Conclusion: crossing was never the blocker — early lock is low-pressure conservatism; spread is a longer-horizon `corridor_diffusion` emergent, not an explosion.** New `--targeted-range-3-audit`: 22/22 crafted unit + real-band @60y (recognition/identity distributions, candidate ⊆ kin∪contacts, ranges ⊆ observed, no premature independence, identity-colour readability **verdict-gated** min 78/44 ≥ 25, diamond/blob risk false, no economy/conflict coupling, purity greps, determinism) + a `river` reachability section + the single-origin spread metrics. Validation: build, graph **180/464** 0/0 (+3 nodes/+10 links), range-1/2/3 + residential-move + activity-path-passability + fast-time-overlay + single-origin-spread all pass, `--all --fast` exit 0, `deterministic=true`, static guards clean (no `Math.random`/`any`/UI-import in `src/sim`). Spec/plan: `docs/superpowers/specs/2026-06-22-range-3-social-recognition-identity-founder-spread-design.md`, `docs/superpowers/plans/2026-06-22-range-3-social-recognition-identity-founder-spread.md`. **Next: RANGE-4** (intrusion/tension events, record-only first). NOT territory/borders/ownership/recognition-as-law/intrusion/conflict; no economy/CC coupling; no daily position mutation. Deferred future hooks: Range All-mode + social kin-dot overlay; `COLONIZE_MIN` re-calibration / longer-horizon founder-lever study.
- **RANGE-2** - Lineage Colours + Daughter Range Inheritance (read-only) - *lineage colour (display-only, baseline-neutral) + read-only inherited-range context; NO sim behaviour change, 2026-06-22.* **Part A — lineage colours (same-hue shade family):** new pure `src/sim/agents/lineageColor.ts` (`deriveDaughterColor` + hex↔HSL + redmean `colorDistance`). A daughter **inherits the parent hue UNCHANGED** and is differentiated only by a lightness/saturation **shade ladder**, so a lineage **never drifts off its hue** (a blue founder's descendants are shades of blue forever — verified: parent hue 205° → all daughters 205°, a 5-generation first-born chain stays 205°). The min-distance vs all active bands escalates **lightness→saturation first** and only nudges hue by a tiny bounded last resort (after the L/S budget), so the earlier "blue→pink" drift is structurally impossible at realistic band counts. (This replaced an initial hue-stepping model after a UX review flagged that cumulative per-generation hue drift could make a lineage unrecognizable.) `demography.ts` fission calls `deriveDaughterColor(parent.color, daughterIndex, activeBandColors(world))`, replacing the old `shiftHexColor` (removed, with its now-dead `toHex`/`clampInteger`). **`band.color` is display-only** — not in any decision, the determinism fingerprint, or baselines — so this is **behaviour- and baseline-neutral** (verified: `--all --fast` byte-identical, 0 failures, all guard flags true, 0 behaviorCoupling); **founder spawn colours unchanged**. Final constant defaults: `SHADE_STEP 0.1, SAT_VARIATION 0.06, MIN_COLOR_DISTANCE 60, FALLBACK_SHADE_STEP 0.06, FALLBACK_SAT_STEP 0.05, LS_FALLBACK_TRIES 16, LAST_RESORT_HUE_STEP 8, MAX_FALLBACK_TRIES 32, L_MIN 0.34, L_MAX 0.74, S_MIN 0.4, S_MAX 0.9`. **Part B — daughter range inheritance (READ-ONLY):** architecture review found daughters **already** inherit degraded, behaviour-affecting memory at fission (`inheritKnowledgeState`/`inheritPlaceMemory`/`inheritTravelCorridors`/`inheritCrossingMemories`/`inheritResourceKnowledgeForDaughter`; `seasonalEcologyMemory`/residential/probe/frontier state reset), so a faded parent range already exists and RANGE-1 already reflects it. RANGE-2 therefore adds **no new seeding** — only a pure read-only `deriveInheritedRangeContext(daughter, parent, tick)` in `familiarCountry.ts` classifying the daughter `inside_parent_range | parent_range_edge | outside_parent_range | no_parent_data` + `sharedRangeTileCount`, never called in `stepSim`. **UI:** BandPanel Technical "Lineage & inherited range" section (parent band, parent/child colour swatches, relation, shared tiles, guard "proto-range / familiar country, not official territory"). **Overlay:** for a selected daughter, ≤2 faint parent camp/water core rings in the parent's colour (low opacity, **no parent range wash**), on the existing "Range" chip. New `--targeted-range-2-audit`: 12 crafted cases + real-band pass — colour deterministic/related/distinct, **daughter-pair min-distance 73 ≥ 60** both maps (global min reported too: map1 73, map2 44 = a pre-existing founder pair, out of RANGE-2 scope by design), inherited range ⊆ observed (subsetViolations 0), relation distribution, source purity, `familiarCountry` not in any tick path, `lineageColor` colour-only in demography. Validation: build, graph **177/454** 0/0 (+1 node/+3 links), range-2 + range-1 + residential-move + activity-path + fast-time audits pass, `--all --fast` byte-identical. Spec/plan: `docs/superpowers/specs/2026-06-22-range-2-lineage-colors-daughter-inheritance-design.md`, `docs/superpowers/plans/2026-06-22-range-2-lineage-colors-daughter-inheritance.md`. **Next: RANGE-3** (social recognition of other bands' ranges). NOT territory/borders/recognition/intrusion/conflict; no economy coupling; no new seeding.
- **RANGE-1** - Familiar Country / Use-Range Substrate - *read-only derived range + UI/overlay + audit; NO sim behaviour change, 2026-06-22.* First step of the RANGE-1..4 roadmap: a pure `src/sim/agents/familiarCountry.ts` (`deriveFamiliarCountry` + `classifyMovementContext`) that derives, per band, a bounded **familiar use-range** from the band's OWN known memory — `knowledge.observedTiles` base (visits/confidence) boosted by `placeMemory` (attachment/return places), `travelCorridors` (route membership), `residentialAnchor` catchment + `anchorMemories`, `seasonalEcologyMemory` water cores, and recent trips/moves — recency-decayed into **core / familiar / edge** tiers, plus compact core places (camp core, water core, route corridor, activity zone). **Range ⊆ observedTiles by construction** (the anti-omniscience guarantee). Computed **ON DEMAND** (selected band for UI/overlay; all bands once for the audit) and **NEVER inside stepSim** — confirmed by import graph: only `bandSummary.ts`/`sections.tsx` (UI), `canvasRenderer.ts` (render), and `simBenchmark.mjs` (audit) import it, **no `src/sim` module does** ⇒ the simulation is byte-identical. `classifyMovementContext` returns `within_known_range | local_camp_shift | working_known_water | seasonal_round | range_edge_probe | leaving_familiar_country | founding_new_range | unsettled_no_range`. **Movement-label fix:** `bandSummary.deriveBandStatusWithRange(band, tick)` refines ONLY the movement/exploration tones (never condition labels), re-toning in-range contexts calm so a band moving inside its country reads "Living within known range" / "Shifting camp locally" / "Working known water" / "On its seasonal round" / "Testing the edge" instead of generic "On the move" (only `leaving_familiar_country`/`founding_new_range` keep the moving tone). **UI:** BandPanel Technical "Familiar Country" section (tier counts, range⊆observed ratio, core places, context, "known memory only — not territory/borders/ownership; no hidden data, no economy" guard). **Overlay:** selected-band-only faint band-colour wash (edge/familiar/core alpha) + camp/water core rings in `canvasRenderer`, gated by its **own** `familiarRangeOverlayMode` "Range" chip (independent of the Activity overlay; never per-band ⇒ no clutter in "All"); reads the world snapshot so it is as fresh as other band-state washes. **Constants** (`RANGE1_CONSTANTS`, presentational — nothing in stepSim reads them) documented in the spec §4.6 and reported by the audit; tunable after visual inspection. New `--targeted-range-1-audit`: 11 crafted unit cases + real-band pass (map1+map2 @40y) — **range ⊆ observed (subsetViolations 0 both maps)**, source purity (no hidden-truth/`Math.random`/`any`/UI tokens), no tick/stepSim import coupling, decay demotes aged tiles, determinism, movement-context distribution, and **mislabelFixed = 100% of legacy-"moving" bands** (map1 5/5, map2 9/9; contexts e.g. map2 {seasonal_round:5, local_camp_shift:3, working_known_water:1}). Validation: build, graph **176/451** 0/0 (+1 node/+4 links), `--targeted-range-1-audit` pass, seasonal-reader (still OFF) + residential-move + activity-path-passability + fast-time-overlay audits pass, `--all --fast` exit 0 (behaviorCoupling all false, allGuardFlagsTrue). Spec/plan: `docs/superpowers/specs/2026-06-22-range-1-familiar-country-design.md`, `docs/superpowers/plans/2026-06-22-range-1-familiar-country.md`. **Next: RANGE-2** (lineage colours + daughter range inheritance). NOT territory/borders/ownership/defense/conflict; no economy/CC coupling; no daughter inheritance yet.
- **2K.12E** - Seasonal Memory Reader Per-Arm Calibration - *reader-only constants + sweep; per-arm scaling REJECTED, reader stays default OFF, 2026-06-21.* Reverted `MAX_SEASONAL_SELECTION_BIAS` 0.08→**0.12** (2K.12D's cap cut left worst-case drift worse, see below) and added two per-arm scale constants `POSITIVE_RECALL_SCALE` / `CAUTION_SCALE` (each damps ONE arm WITHIN the shared ±cap; `x*1.0===x` exactly so **1.0/1.0 is byte-identical to the 2K.12C reader** — audit reproduces 790 hints). Kept the 2K.12C proportional caution-recency formula and the reader scope unchanged; applied `POSITIVE_RECALL_SCALE` to all three positive arms (`positiveBiasFromReliability`/`positiveBiasFromOpportunity`, which also feeds `in_season_recall`) and `CAUTION_SCALE` to the caution arm. Harness `--targeted-seasonal-memory-calibration` now self-documents `perArmScales` per run. **Hypothesis tested (calibration sweep, 50/100/300, map1+map2, deterministic, all guards green):** damp positive recalls to cut map1's probe/recheck-over-relocate drift while leaving caution intact. **Sweep REJECTED it.** Positive scale @caution 1.0 — map1 300y: 1.0→**−2.81%**, 0.8→**+1.41%**, 0.7→**−2.96%**, 0.6→**−0.28%** (NON-MONOTONIC — a "good" map1 value is a coincidental 300y trajectory crossing, not a stable regime, exactly 2K.12D's path-dependence); map2 300y monotonically WORSE than control (−2.14%→−3.52/−2.83/−2.97%) because map2 is caution-driven (62% caution hints) and removing the positive offset leaves caution relatively stronger. Caution damp — `(1.0,0.8)` map2 **−3.38%** (WORSE, not better: caution was net-supporting population by steering bands off bad patches); best combined shot `(0.6,0.8)` was the WORST config (map1 −3.38% / map2 −3.87%). **Of all six magnitude configs tested, the un-damped ±0.12 control (= 2K.12C) has the SMALLEST worst-case drift (−2.81%); every per-arm damp made it worse.** All configs deterministic, within envelope (beyondEnvelope 0, maxGap ≤ 2·cap), structurally neutral (36 bands / 31&27 fissions / 0 extinctions identical OFF↔ON every config), behaviour still meaningful (flip 17–28%, probe-over-relocate persists). No hidden-truth read / no economy coupling (structural guard + no economy import). **Decision: default-ON NOT justified — kept OFF.** The reader's residual ~2–3% long-run drift is structural/path-dependent w.r.t. bias MAGNITUDE (both global cap AND per-arm scale fail as knobs); tuning to hit <~1–2% would be overfitting noise on map1's unstable region. Both scales LEFT at identity 1.0 (constants + harness reporting kept only so a future checkpoint can re-sweep trivially). **Recommended next: NOT a finer reader knob (exhausted) — leave the reader optional and revisit when RANGE-1 / familiar-country / home-range gives real spatial context** so the bias can attach to where a band actually ranges, instead of nudging isolated target choices. Validation: build, graph **175/447** 0/0, 2K.12 reader audit pass (cap 0.12, 790 real hints, 0 visited-only/guard/bound violations, deterministic), calibration `calibration_complete` deterministic all candidates. OFF baselines unchanged (reader OFF-gated ⇒ live baseline byte-identical). graphData reader-node summary updated ±0.08→±0.12. (HEAT not re-run: consistently inert / ON==OFF in 2K.12B/C/D and verdict-independent at the OFF default.)
- **2K.12D** - Seasonal Memory Reader Cap Reduction (±0.12→±0.08) - *one-constant reader change + recalibration; reader stays default OFF, 2026-06-20.* Reduced `MAX_SEASONAL_SELECTION_BIAS` in `seasonalEcologyReader.ts` from 0.12 to 0.08 to test the 2K.12C hypothesis that the residual ~2–3% long-run drift was overall MAGNITUDE (one clean knob), not a logic flaw. **Reader scope, positive/caution logic, and the OFF default all unchanged** (only the cap constant). One stale TEST fixture fixed (harness only, not sim): the 2K.12C `strong 8/2 → |bias|>=0.05` / `marginal 3/2 → |bias|<0.05` reader-audit assertions were hardcoded to the old ±0.12 cap (0.05≈0.417·cap), so they broke mechanically at 0.08; rewrote them cap-relative as `0.4·cap` (caution-strength 0.4 — the midpoint between the marginal case's strength 0.2 and the strong case's 0.6), preserving the intent at any cap (proportionality intact: strong −0.048 still 3× marginal −0.016). **Finding (apples-to-apples A/B on one harness; ±0.12 control reproduced 2K.12C exactly — map1 −2.81%, map2 −2.14%):** the cap is NOT a clean magnitude knob — over 300y the ON/OFF delta is path-dependent, not a smooth scaling. ±0.08 gave map1 300y −2.81%→**−2.53%** (marginal gain) but map2 300y **−2.14%→−3.45%** (regression), so worst-case drift WORSENED (−2.81%→−3.45%) and <~1–2% is still missed. Behaviour stays meaningful (flip rate map1 17.9% / map2 21.9% / HEAT 13.7%, down from ~24–31% — fewer near-ties overridden; meanGap ~0.03; probe-over-relocate persists: map1 Δprobe +687 Δmove −535, map2 Δmove −1164 Δprobe +531). All flips within envelope (beyondEnvelope 0 all maps; maxGap map1 0.12 / map2 0.08 ≤ 2·cap=0.16; aboveSingleCap 3/0 = legit two-sided near-ties). HEAT inert (0.00% at 50/100/300). No hidden-truth / no-economy-coupling / determinism violations. **Decision: default-ON NOT justified — kept OFF** (worst-case got worse AND still over target). The single global cap is the wrong lever (map1 drift is positive-arm-driven, map2 caution-arm-driven; a uniform shrink helps one, hurts the other). **Recommended 2K.12E:** revert cap to ±0.12 (empirically no worse, simpler) and do PER-ARM damping (damp positive recalls, leave caution) re-calibrated to <~1–2%, OR accept ~2–3% bounded cost and flip ON in an isolated rebaseline. Cap left at ±0.08 per the 2K.12D directive (OFF ⇒ live baseline byte-identical regardless). Validation: build, static guards, graph **175/447** 0/0, 2K.12 reader audit pass (cap 0.08, 734 real hints, 0 visited-only/guard/bound violations, deterministic), seasonal-resource + AG6 + AG9 + AG10 + AG11(OFF, `pass_optional_experimental`) all pass, calibration `calibration_complete` (50/100/300 + HEAT) `deterministic=true`. OFF baselines unchanged (map1 1421/36/31, map2 1448/36/27). graphData reader-node summary updated ±0.12→±0.08.
- **2K.12C** - Seasonal Memory Caution Recency Fix - *small reader-only formula change; reader stays default OFF, 2026-06-20.* Fixed only the `bad_season_caution` arm of `seasonalEcologyReader.ts` to remove the 2K.12B map2 overfit. **Cause:** caution fired a FLAT 0.5 whenever lifetime `repeatedSeasonalFailureCount > repeatedSeasonalSuccessCount && >=2` — monotonic counts that never decay, so a marginal tile (3 bad / 2 ok) earned the same heavy caution as a terrible one (8/2), and it compounded over centuries. **Change (smallest safe):** caution is now PROPORTIONAL to the failure RATE over the tile's own success+failure history (`ratioCaution = rate>0.5 ? (rate-0.5)*2 : 0`, gated by `MIN_CAUTION_OBSERVATIONS=2`), so later successes dilute old failures and an isolated past failure cannot create permanent caution; the positive-arm suppressor is likewise rate-based (`failureDominant = rate>0.5`). Unchanged: the positive recall arms' formulas, the drySeasonConcern and low-current-reliability caution inputs (dry-season caution still works — `drySeasonConcern` already decays when not failing), the ±0.12 cap, reader scope, and the OFF default. TDD: added 3 reader-audit unit cases (marginal 3/2 → gentle |bias|<0.05 [RED→GREEN]; strong 8/2 → retained |bias|>=0.05; isolated 2/10 → fades to non-caution). **Calibration after fix (deterministic, within-envelope, no coupling):** map2 300y ON/OFF pop delta **−5.73% → −2.14%** (overfit fixed, no longer the asymmetric tail); worst-case drift across maps tightened −5.7% → −2.8%. Trade-off: map1 300y rose **−0.28% → −2.81%** because reduced caution un-suppresses the positive recalls → more probe/recheck-over-relocate (Δprobe +261→+881); so the residual ~2–3% long-run effect is now POSITIVE-arm-driven, small/uniform/structurally-neutral (bands 36/fissions/extinctions identical both maps) but just over the <~1–2% ideal. **Decision:** keep default OFF (per the rule). OFF byte-identical (reader is OFF-gated; OFF baselines unchanged — map1 1421/36/31, map2 1448/36/27). Validation: build, static guards, graph **175/447** 0/0, 2K.12 reader audit pass (790 hints, 0 violations), seasonal-resource + AG9 + AG10 + AG11(OFF) + AG6 memory-sensitivity all pass, `deterministic=true`. **Recommended 2K.12D:** reduce the cap toward ±0.08 OR lightly damp the positive recalls to push the long-run effect under ~1–2%, re-calibrate, then flip default ON — or accept ~2–3% as the believable bounded cost and flip ON in an isolated rebaselining step.
- **2K.12B** - Seasonal Ecology Memory Reader ON/OFF Calibration - *measurement + review; reader stays default OFF, 2026-06-20.* Calibrated the 2K.12 reader with the flag ON over longer runs to answer "does ON behave more intelligently in a small believable way, or cause hidden long-run drift / overfitting?" No `src/sim` behaviour change — only a new measurement command `--targeted-seasonal-memory-calibration [--calibration-years 50,100,300] [--calibration-include-heat]` that runs OFF vs ON trajectories and reports macro/decision deltas, the reader's hint inventory (by kind/sign), a counterfactual scout-flip analysis (toggle auditOptions on the SAME world → flips + base-key gap), residential seasonal-context counts, determinism, and the no-hidden-truth / no-economy invariants. **Findings (deterministic both maps + HEAT):** the reader is anti-omniscient, economy-decoupled, and all scout flips lie within the selection-only envelope (gap ≤ 2·cap = 0.24; `beyondEnvelope` 0); it is NOT too weak (scout flip rate ~24–31%) nor too strong (meanGap ~0.04–0.05, never overrides a decisive gap). Behaviour shifts believably toward probing/rechecking known reliable places over relocating/scout-wandering (e.g. map2 300y: move −1948, scout +19, probe +1450). **But:** map1 stays ~flat (−4 pop / −0.28% at 300y; hints mostly positive recalls) while **map2 shows a COMPOUNDING caution-arm overfit** — pop delta −2/−0.48% at 100y growing to **−83/−5.73% at 300y** (same 36 bands / 27 fissions / 0 extinctions), because map2's hints are ~79% `bad_season_caution` and ECO-SEASON-1's `repeatedSeasonalFailureCount`/`drySeasonConcern` accumulate near-monotonically, so the caution arm gets stickier over time and over-avoids patches that failed once long ago. HEAT (single-origin stress): macro IDENTICAL ON/OFF at 50/100y, even more inert (no overfitting under stress). **Decision:** keep the flag **default OFF** (per the decision rule: explainable but a growing drift, not yet safe to bake into the baseline). ±0.12 is well-calibrated (the issue is the caution arm's EVIDENCE basis, not the bound). **Recommended 2K.12C:** make the caution arm recency/rate-based (decay or ratio rather than monotonic lifetime counts) so old failures fade, re-calibrate at 300y targeting <~1–2% map2 delta, THEN flip default ON. Validation: build, static guards, graph **175/447** 0/0, 2K.12 reader audit pass (sim unchanged, 767 hints), `--all --fast` smoke + `deterministic=true` unchanged; calibration command exit 0 on 50/100, 100/300, and 50/100+HEAT. No support/yield/CC/population/stress coupling; plants stay non-food; AG11 stays OFF; daily-step/seasonal-skip pipeline untouched.
- **2K.12** - Seasonal Ecology Memory Readers - *first reader of seasonalEcologyMemory; selection-only, flag-gated default OFF, 2026-06-20.* Turned ECO-SEASON-1's shadow/parallel `seasonalEcologyMemory` into a small, anti-omniscient INFLUENCE on residence-unchanged target choices. New pure `src/sim/agents/seasonalEcologyReader.ts` — `readSeasonalEcologyHint(memory, tileId, season, expectedDomain?)` reads ONLY the band's OWN learned memory (never `deriveSeasonalEcologyFactor`/`getSeasonalTileConditions`/world tiles) and returns a bounded (±0.12), kind-labelled SELECTION-ONLY bias: `dry_water_recall` (+), `wet_opportunity_recall` (+), `in_season_recall` (+), `bad_season_caution` (−); empty/not-in-memory/wrong-domain ⇒ `undefined` (no effect by construction). Consumers, all gated by new `WorldAuditOptions.seasonalEcologyMemoryReadersEnabled` (**default OFF ⇒ byte-identical baseline**) and all residence-UNCHANGED: (1) `selectResourceScoutTarget` selectionKey (resource-scout / known-patch recheck; **voiScore + scout-vs-stay weight untouched**, like 2K.5); (2) `selectTripCandidate` score (activity target); (3) `chooseDiverseProbeTarget` (water-check — a remembered reliable-water prospect may divert by a margin; `probeMemory.ts` stays decoupled via an optional bias map computed in bandDecision); (4) record-only `seasonalMemoryContext` on `residentialMoveEvent` (CONTEXT, **not a cause** — the move scorer is NOT biased in 2K.12). Out of scope (deferred): the residential-move scorer (`buildKnownTileScoreBreakdown`), all frontier/inferred/side-country readers, all economy/AG11/CC paths. No new `Reason` union members (reader emits template `ReasonId` strings). UI: BandPanel Technical tab now renders the (previously dead-exported) Seasonal Ecology section, showing readers ON/OFF, the live learned hint per known tile (kind/bias/reasonId), and a guard line "learned memory only — no hidden seasonal truth, no direct economy mutation"; ResidentialMoveDetails shows the seasonal context (labelled "not the move cause"). Added `--targeted-seasonal-memory-reader-audit`: crafted-input unit cases (empty/not-in-memory/domain-mismatch ⇒ no effect; reliable-water ⇒ +bias dry_water_recall; failing-water ⇒ −bias caution; wet-plant ⇒ +bias opportunity; |bias|≤cap; guard flags present), a structural source-grep proving no hidden-truth/impurity tokens, and a real-bands pass (map1+map2 40y) — **767 real hints, 0 visited-only / 0 guard / 0 bound violations, ON deterministic both maps; wiring active (map2 ON≠OFF)**. Validation: build, static guards clean, graph **175/447** 0/0, 2K.12 audit pass, and seasonal-resource + first-season-recon + activity-path-passability + AG9 + AG10 + AG11(`pass_optional_experimental`, OFF) + AG5/6 memory-sensitivity all pass at the OFF default, `--all --fast` smoke exit 0 (behaviorCoupling all false, allGuardFlagsTrue), `deterministic=true`. No support/yield/carrying-capacity/population/stress/mortality coupling; plants stay non-food; AG11 stays OFF; no daily `band.position` movement; no change to the daily-step / seasonal-skip / render pipeline. Spec: `docs/superpowers/specs/2026-06-20-2k12-seasonal-ecology-memory-readers-design.md`.
- **UI-STYLE-1** - Final-Look UI Redesign / Readable Game UI - *UI/UX-only polish checkpoint, 2026-06-19.* Turned the dark debug console into a clean old-map / cartographic interface: **vellum panels on a dark desk**, ink typography, muted earthy accents, crisp 16-grid pixel icons (`src/ui/icons.tsx`). New pure UI helpers (`bandSummary.ts`, `labels.ts` — type-only sim imports) drive a status chip, plain "doing now", condition bars, and grouped skill/knowledge chips. Split the 2,982-line `BandPanel.tsx` into a thin shell over `src/ui/band/{Overview,Activity,History,Technical,BandHeadline,Roster,parts,sections}`: Overview/Activity/History are player-facing (activity cards, life-event timeline); **Technical preserves ALL prior debug data verbatim** in collapsed groups. Header cartouche + transport bar + map toolbar + Root nav restyled; map selection ring uses the parchment accent. Theme tokens in `src/ui/theme.css`. **Zero sim behavior change** — `sim:benchmark` macro byte-identical (`docs/baselines/sim_baseline_ui_style_1.norm.txt`); build green; helper-purity + no-sim-logic-in-player-tabs greps clean. Systemic road stays paused at 2K.12. Spec+plan under `docs/superpowers/`.
- **ECO-SEASON-1** - Seasonal Resource Realism Substrate - *substrate checkpoint, 2026-06-19.* Made resources season-aware at the activity/memory/shadow level WITHOUT a new economy. Phase 0 confirmed the seasonal truth already exists (`getSeasonalTileConditions` + tile `seasonalProfile`) and that the canonical `activityOutcome` + `ResourcePatchMemory.seasonality` feed 2K.9→carrying capacity — so the substrate modifies only the SHADOW + a SEPARATE band-level `seasonalEcologyMemory` + debug. New pure `seasonalResourceEcology.ts`: `deriveSeasonalEcologyFactor(world, tileId, domain)` blends the existing seasonal truth with a per-(tile,domain) hidden signature hash so patches peak in different seasons; bands learn it only by visiting (observedSeasons/reliabilityBySeason/dryConcern/wetOpportunity/success+failure, bounded, daughters reset). Each trip records a `seasonalEcology` summary + a shadow `seasonalEcologyModifier` (~0.5–1.3) scaling shadow gross/reliability only (economy reads it solely via OFF-by-default AG11). BandPanel surfaces the per-trip seasonal factor + a Seasonal Ecology section with a no-CC-mutation guard. Added `--targeted-seasonal-resource-audit` (53,760 trips observed, 258 hints, 0 hidden-truth / 0 economy-coupling / 0 CC-mutation, deterministic). Validation: build, static guards, graph **174/441** 0/0, seasonal audit pass, and time-scale + AG5/6/9/10/11 + recon + passability + deterministic **327/9** unchanged vs baseline. No economy/population/stress/mortality/CC/yield/relocation/AG11-default changes; plants stay non-food.
- **TIME/PLAYBACK-STABILITY + ACTIVITY OVERLAY FIX + RESIDENTIAL-MOVE-1** - *time/render-pipeline stabilization + record-only event, 2026-06-19.* **Phase 0** review traced the Civilization-Skip "frozen selected band" to the PERF-1 two-tier split: the per-tick live overlay carried positions but not activity, while REALISM-2B pinned the selected band's marker to the rare (~2.5 s ≈ ~25 seasons) full snapshot to keep it attached to its routes — so it froze. **Phase 1:** map now draws ALL bands (and hit-detects) from ONE fresh source `getRenderBands` (live overlay when fresher, else snapshot); the selected-band snapshot override is **removed** → no freeze. **Phase 2:** the live overlay now carries a bounded per-band `recentActivity` summary, so `selected`/`all` activity is fresh at the same tick as the marker (`all` iterates every active band; `selected` stays detailed/clickable and re-attaches to the new anchor after a move). **Phase 3 (record-only):** `residentialMoveEvent.ts` annotates an already-decided relocation (deterministic in-season start/end day by cause, cause from pre-move pressure + intent, passability BFS land route, `failed_no_route` instead of fake water crossing, ring of 4, daughters reset, BandPanel display); gated on `moved` ⇒ byte-identical when no one relocates; never read by economy/population/stress. Added `--targeted-fast-time-overlay-check` (freeze avoided, activity fresh, mid-season re-attach) and `--targeted-residential-move-audit` (10,603 events; 0 water steps / 0 invalid / 0 non-contiguous / 0 guard violations; deterministic both maps; 46 honest `failed_no_route`). Validation: build, static guards, graph **173/438** 0/0, fast-time + residential audits pass, AG5/6/9/10/11 + recon + passability unchanged vs REALISM-2B. No economy/AG11/population/stress/mortality/CC/raw-movement/daily-position/boats/hidden-discovery changes.
- **REALISM-2B** - First-Season Recon Rebaseline + Activity Movement / Path Visual Fixes - *correctness/legibility/rebaseline checkpoint, 2026-06-18.* Audited first-season reconnaissance (healthy: day-6 start, ~28 trips/band/season, band-known-only, 0 hidden discovery, year-1 macro identical ON/OFF) and **rebaselined AG6/AG9** to its bounded long-run sensitivity (AG9 first divergence now tick 1, supersedes AG7 tick-212; AG6 macro-structure-invariant + bounded population cap; hard proofs strict). Made activity breadcrumbs **passability-aware** (deterministic BFS over land, shoreline-resolved water targets, never on water — `--targeted-activity-path-passability` review→pass, water steps 247→0, stand-on-water 208→0). Activity overlay now defaults **SELECTED-only (user-requested)** + snapshot-anchored at fast speed + at-home tile-edge markers + click-cycling of stacked activities; speed/resolution labels clarified. Added `--targeted-first-season-recon-audit`, `--targeted-activity-path-passability`, `scripts/checkGraph.mjs`. Validation: build, static guards, graph 172/436 0/0, time-scale, AG5/6/9/10/11, Map 1 327/9 / Map 2 314/9 deterministic, HEAT 44/1 — all green.
- **TIME/MOVEMENT-REALISM-2** - Time Speed, Activity Density, Early Activity, and Residential Movement Audit - *implemented controlled UI/time/activity checkpoint, 2026-06-18.*
- **ACTIVITY-GROUPS-11** - Tiny Flag-Gated Activity Subsistence Supplement - *implemented default-off optional experiment, 2026-06-18.*
- **ACTIVITY-GROUPS-10** - Shadow Subsistence from Activity Returns - *accepted shadow-only checkpoint, 2026-06-16.*
  Step 5 of the staged transition: each activity-group trip now derives a normalized support-LIKE SHADOW subsistence
  estimate (`shadowSubsistence` per trip + band `activityShadowSubsistenceSummary`) from band-known info only —
  shadowReturnKind/gross/travel/risk/net/reliability, academically grounded (gathering staple, hunting high-variance
  low-reliability and never guaranteed, water = support not calories, plants uncertain, central-place distance/risk
  reduce net). Strictly shadow-only: `shadowConsumedByEconomy=false`/`noEconomyCoupling=true`; the abstract economy
  reads no shadow field (static grep clean). Added `--targeted-activity-shadow-subsistence`. Result: pass,
  deterministic, Map 1/Map 2 macro byte-identical to baselines (179/5/0, 264/9/0); a typical successful food trip is
  ≈0.54× abstract per-capita return (reads low vs whole-band support), travel cost ≈16% of gross (net→0 by distance
  5–6), hunting/fishing represented at low reliability, dominant task scenario-dependent. Recommendation: AG11 = tiny
  capped supplement above abstract support (abstract stays the floor), never a replacement until calibrated.
- **ACTIVITY-GROUPS-9** - Full evaluateBandDecision Divergence Fixture - *accepted audit/fixture checkpoint,
  2026-06-16.* Added `--targeted-activity-decision-divergence`, which finds the first per-band Map 2 ON/OFF decision
  divergence (deterministically, not hardcoded) and captures the full in-situ `evaluateBandDecision` context for the
  divergent band via a behavior-neutral `decisionObserver` threaded through `stepSim -> advanceWorldByDays ->
  runSeasonalCompatibilityTick`. Reproduces AG7 exactly (tick 212 / year 53 spring, `band:varied-dry-corridor-mid`,
  archive deltas `+1 frontier/move`, `-1 resource_scout`, macro 0, deterministic). Finding: **no boolean threshold
  gate flips** — the operative reader is resource-scout TARGET selection (activity `patchReturnGuidance` retargets the
  scout from a far `frontier_probe` to a near `promising_unproven_patch_recheck`), so ON's near scout candidate
  (`1.90`) loses by `0.02` to an unchanged `seek_better_water` move (`1.92`) and ON moves, while OFF's far scout
  (`2.43`) beats the same move and OFF scouts. movementKnownOpportunity `>0.12` is inert here (`opportunityStrength
  0`); learned support is a side signal; seasonality stays a weak dampener. Verdict: healthy near-threshold learning,
  not a twitch. No economy coupling, no hidden discovery, `bandKnownTargetsOnly` true. Recommendation: do not tune
  thresholds/dampening until activity returns actually feed support/food economy.
- **ACTIVITY-GROUPS-8** - movementKnownOpportunity + Learned-Support Reader Fixture - *accepted audit/fixture
  checkpoint, 2026-06-16.* Added `--targeted-activity-memory-reader-fixture`, a fast targeted suite for the exact AG7
  readers. Fixture results: `movementKnownOpportunity` uses a strict `>0.12` viability gate (`0.12` not viable,
  `0.13` viable); activity memory refresh/lowering can flip a near-margin learned-support candidate `0.11 -> 0.15`
  and `0.15 -> 0.11` through bounded `+/-0.04` score changes; `ResourceBeliefOpportunity` threshold is `0.1`
  (`0.07 -> 0.11` refresh, `0.11 -> 0.09` lowering); seasonality hints are recorded but not a strong direct
  movement-belief dampener; weak confidence remains not exploitable, while one refresh can make a matching known patch
  contribute bounded `tileSupport 0.06` and projected learned support `0.27`. No direct activity-return economy
  coupling or hidden discovery.
- **ACTIVITY-GROUPS-7** - Memory Reader Causal Audit - *accepted audit checkpoint, 2026-06-16.* Added pure
  `selectResourceScoutTargetForAudit` plus benchmark flag `--targeted-activity-memory-reader-causal` to trace Map 2
  activity-memory ON/OFF readers over time. First activity-memory writes occur at tick 2; daily retargeting and
  resource-belief deltas also begin at tick 2; resource-scout target selection first differs at tick 7; learned-support
  projection first differs at tick 77; daughter memory inheritance first differs at tick 204. The first decision-mix
  divergence is tick 212/year 53 spring: ON has +1 move/frontier and -1 resource_scout with one adjacent dry-corridor
  position split. Direct gate at that tick is `movementKnownOpportunity`; upstream contributors are daily retargeting,
  belief opportunity, scout-target selection, and learned-support projection. Final 100y result matches AG6, with no
  hidden-truth failures and no direct activity-return/effect economy reader.
- **ACTIVITY-GROUPS-6** - Memory Sensitivity & Existing Reader Audit - *accepted audit checkpoint,
  2026-06-16.* Added `WorldState.auditOptions.activityMemoryCouplingDisabled` plus benchmark flag
  `--targeted-activity-memory-sensitivity`, which compares activity-memory ON/OFF through the real
  `initSimWorld` + `stepSim(..., "seasonal")` runner path. Static inventory: daily trip targeting,
  resource belief opportunity, resource scout target selection, plant eligibility, observed patch-return views,
  daughter inheritance retention, and pre-existing 2K.9 learned-support carrying-capacity/social-context readers
  consume `ResourcePatchMemory`; no economy reader directly consumes `activityMemoryEffect` or `resourceReturn`.
  20/50/100y Map 1 + Map 2 audit: 1176 ON trips / 1176 OFF trips; OFF effects all `none`; resource-return consumed
  by economy 0; return guard failures 0; activity-memory guard failures 0; hidden-truth failures 0; deterministic
  ON/OFF repeat matched. Map 1 inert; Map 2 inert through 50y; Map 2 100y bounded sensitivity only (2 bands on nearby
  different final tiles, +26 move/frontier, -24 resource_scout, -2 probe, population/fissions/extinctions unchanged).
- **ACTIVITY-GROUPS-5** - Targeted Memory-Effect Fixtures - *accepted validation checkpoint,
  2026-06-16.* Added benchmark flag `--targeted-activity-memory-effects`, which drives crafted deterministic
  fixtures through the same production activity-memory application function used by real trips. Covered
  `confidence_refreshed`, `confidence_lowered`, `seasonality_hint_added`, `water_reliability_refreshed`,
  `plant_caution_refreshed`, `route_memory_refreshed`, `risk_suspicion_added` (water-risk and abandoned-risk
  variants), `none` from `no_effect_observed`, and unknown-target/no-discovery. The reserved
  `repeated_use_counter_incremented_placeholder` type remains future-only because no production route emits it.
  Result: 81/81 assertions pass; effect counts cover all routed paths; confidence delta range `-0.06..+0.03`;
  hidden-truth failures 0; economy-coupling failures 0; deterministic repeat true. Build/static/graph/time-scale
  checks pass; Map 1 20y remains 179/5/0 deterministic; Map 2 20y remains 264/9/0 deterministic.
- **ACTIVITY-GROUPS-4** - Memory Coupling from Daily Activity Outcomes - *partial / accepted narrow
  memory-coupling slice, 2026-06-16.* Daily task-group outcomes now update existing band-known
  `ResourcePatchMemory` records through `applyActivityOutcomeToMemory`. The function consumes real trip records,
  requires the existing target memory to match the trip patch/tile, never creates hidden discovery, and records
  before/after confidence snapshots, effect type, target memory, and reason IDs. Effects include confidence
  refresh/lowering, seasonality hints, water reliability refresh, plant caution refresh, route refresh, and risk
  suspicion; current Map 1/Map 2 smokes exercised confidence, seasonality, and water reliability. Deltas are
  tiny/capped and all effects carry no food/yield/support/stress/population/carrying-capacity guards. BandPanel
  now shows "Activity Memory Effects"; benchmark trip/time-scale audits report effect counts, touched memories,
  confidence delta bounds, hidden-truth failures, and no-economy-coupling proof. Validation: build green; static
  guards clean; graph 170/428 with no duplicate/dangling links; time-scale check pass/deterministic/compatible;
  Map 1 20y 179/5/0 and Map 2 20y 264/9/0 deterministic; HEAT 50y `ag4-smoke` reproducible at 44 pop / 1 band /
  `local_cluster`.
- **ACTIVITY-GROUPS-2/3** — Deterministic Outcomes + Resource Return Scaffold — *partial / safe
  record-only scaffold, 2026-06-16.* Extended real daily task-group trip records with deterministic
  `activityOutcome`, `activityOutcomeReasonIds`, `activityOutcomeSummary`, and `resourceReturn`.
  Outcomes are selected from band-known memory only: effective patch confidence, remembered seasonality,
  water/risk/access confidence, task type, distance, and estimated group size. Added placeholder/info
  return kinds (`none`, `food_observation_only`, gathered/fish/hunted placeholders, water/plant/route
  information) with hard guards: `consumedByEconomy=false`, no yield/support/stress/population/carrying-capacity
  coupling. Bands derive a bounded `activityOutcomeSummary`; daughters reset it on fission. BandPanel and
  benchmark trip/labor audits now report outcome counts, return-kind counts, max placeholder value, and
  no-coupling proof. Still no food economy replacement, no patch-confidence update, no hidden discovery,
  no residential movement change.
- **ACTIVITY-GROUPS-1** — Band Labor Allocation Foundation — *partial / safe accounting slice,
  2026-06-16.* Added a bounded `activityLaborSummary` to bands, derived only from real
  `recentIntraSeasonTrips` records. It tracks total people, working adults, estimated current
  activity-group assignments, people away/at residential center estimates, per-type group/person
  counts, latest/recent group summaries, capped over-allocation diagnostics, and explicit no
  food/yield/stress/population/carrying-capacity coupling guards. Same-day groups count as
  assigned for the recorded activity day; overnight/continuing groups reserve labor first, and
  total assigned people are capped by working adults so adults are not double-counted. Daughters
  reset the labor snapshot on fission. BandPanel now shows a "Labor / Activity Groups" section;
  benchmark `tripAudit.laborAudit` reports max people assigned/away, max working-adult share,
  group counts by type/status/outcome, impossible over-allocation count, and no-coupling proof.
  No map overlay expansion; no food/yield/stress/population/carrying-capacity changes.
- **ACTIVITY-VIS-2** — Activity Group Metadata + Input Perf Spike — *partial / safe visual+metadata slice,
  2026-06-15.* Kept daily residential movement deferred. Activity dots now use the source band's color, while
  all-band mode remains dots-only and selected-band mode keeps richer route hints. Added non-coupling
  activity-group metadata to `IntraSeasonTripRecord`: `groupLabel`, `estimatedPeopleCount`, `objectiveLabel`,
  `startDay`, `endDay`, `activityStatus`, and `activityResult`. Current records are deterministic
  `completed_observation` / `no_effect_observed`; no yield/stress/population/carrying-capacity writes and no
  renderer-created trips. Added a design note at
  `docs/superpowers/specs/2026-06-15-activity-vis-2-group-design.md` defining future clickable/moving task
  groups, deterministic outcomes, people-count policy, caps/fading/zoom rules, and no-randomness constraints.
  UI perf tweak: map drag now uses a cheap CSS translate while dragging and commits camera pan once on release;
  wheel zoom updates are batched to rAF. Validation: build green; static guards clean; targeted time-scale check
  pass/deterministic/compatibilityMatches; headless Chrome smoke confirmed Activity=All and activity panel
  people/result/status fields.
- **TIME-1C-VIS REVERTED** — Failed Band Activity Visualization — *removed 2026-06-15.*
  The render-only mini-circle layer, marker glide, Activity toggle/store plumbing, and `bandActivityViz`
  architecture node/links were removed. The visual layer did not make the world daily; it only animated already
  existing records and introduced a misleading marker-glide interpretation. The accepted substrate remains the
  TIME-1C daily-action/task-group ledger. Future visual work should read the ledger generically and implement
  explicit picking/hover/debug contracts before drawing mini-circles again.
- **TIME-1C** — Daily Movement Architecture (Observational Slice) — *Partial / accepted observational slice,
  2026-06-15.* Did NOT add a movement lever (TIME-1B already was the right architecture). Added
  `src/sim/agents/dailyActions.ts` — a common `DailyAction` aggregation interface (`firesOnDayOfSeason` +
  pure `apply(world, day)`; `runDailyActions` iterates only scheduled in-season days) so daily features run
  identically under daily/weekly/monthly/seasonal without a four-way rewrite or a naive 90-day loop; the
  intra-season trip ledger is the first registered action. Enriched `IntraSeasonTripRecord` with a tile-by-tile
  breadcrumb `pathTiles` (deterministic Manhattan staircase — no teleport), a return/overnight/continues
  `outcome`, and a `movementType` taxonomy. Architecture choice E (B+D behind the registry); A/C rejected
  because daily marker motion is the SPIKE-MOBILITY-1 HEAT collapse. `band.position` never moved by the daily
  layer; all no-coupling guards stay `true`. Bounded recency-only memory refresh DESIGNED + anti-omniscience-
  audited in the spec but DEFERRED/gated (behavior-affecting → its own reviewed checkpoint). Validation: build
  green; static guards clean (no executable `Math.random` / `any` / UI imports; `advanceIntraSeasonTrips` fully
  migrated); `--targeted-time-scale-check` pass / deterministic / compatibilityMatches; Map 1 100y 327/9/4,
  Map 2 50y 314/9/0, single-origin HEAT 50y 44/local_cluster — all byte-equal to TIME-1B; all breadcrumbs
  contiguous (no teleport); graph integrity 167 nodes / 413 links / 0 dangling. Verdict: accept as
  observational substrate + reusable daily-action abstraction, not a movement fix. Design + results:
  `docs/superpowers/specs/2026-06-15-time-1c-daily-movement-architecture.md`.
- **TIME-1B** — Intra-Season Trip Ledger Spike — *Partial / accepted narrow slice, 2026-06-15.*
  Reviewed TIME-1A and kept its compatibility semantics (`tick` = seasonal decision tick; explicit day
  calendar drives step modes). Added `src/sim/agents/intraSeasonTrips.ts` plus `Band.lastIntraSeasonTrip` /
  `recentIntraSeasonTrips`: deterministic scheduled in-season trip records chosen only from band-known
  resource patch memories, with explicit causes, distance, estimated duration, and hard no-relocation /
  no-yield / no-stress / no-population guard flags. `advanceWorldByDays` runs the same trip ledger for
  daily/weekly/monthly/seasonal aggregation; `advanceWorldOneSeason` delegates to it. Updated
  `--targeted-time-scale-check` with trip audits. Validation: build green; static guards clean for executable
  `Math.random`, `any`, and UI imports; time-scale check pass; Map 1 100y 327/9/4 deterministic; Map 2 50y
  314/9/0 deterministic; single-origin HEAT 50y heat-1 reproducible, local_cluster, pop 44, 0 fissions /
  extinctions; migration-walk disabled-check still passes. Verdict: accept as narrow audit substrate, not a
  full movement fix.
- **TIME-1A** — Explicit Calendar / Step-Mode Compatibility Layer — *Partial architecture
  spike, 2026-06-15.* Added `WorldTime.day`, `seasonTick`, `dayOfSeason`, 90-day seasons,
  360-day years, `StepMode` daily/weekly/monthly/seasonal, `advanceWorldByDays`, UI/worker
  resolution controls, clock day display, architecture-graph node/links, and
  `--targeted-time-scale-check`. **No movement behavior change landed:** `tick` remains the
  compatibility seasonal decision tick; movement/demography/fission/depletion/resource ecology
  still execute at crossed season boundaries. Verdict: PARTIAL / safe TIME-1A only; TIME-1B
  should add cause-gated daily/multi-day movement/scouting after a separate elapsed-day audit.
- **SPIKE-MOBILITY-1** — Cause-Gated Sub-Tick Migration Walk — *Experimental spike, 2026-06-15.
  **NEGATIVE RESULT → REVERTED (kept disabled behind `MIGRATION_WALK_ENABLED = false`).*** Tested
  the hypothesis that the ≤2-tile/season residential cap is too slow vs forager ethnography
  (~5–25 km/season base displacement). Added a PURE, deterministic, anti-omniscient path realizer
  (`src/sim/agents/migrationWalk.ts`): a band that ALREADY chose a migration-class residential
  move realizes it as a contiguous breadcrumb of single-tile steps (no teleport, ≤grid-dist-1/step,
  cause-scaled budget ≤6, breadcrumb + crowding + stop-at-good-enough), wired into
  `applyBandDecision` (`deriveAppliedMigrationWalk`/`buildMigrationWalkView`/
  `collectMigrationObservationTargets`) only for committed migrations — stay/probe/scout/low-
  persistence moves byte-identical. New `--targeted-migration-walk-check` (14/14: contiguity,
  bounded, directional, anti-omniscience, passability, breadcrumb, stop-at-good-enough,
  determinism). **A/B via the flag (true on-machine):** Map 2 single-origin HEAT 500y×3 COLLAPSED —
  pop 655/586/733 → **91/74/206**, bands 22/19/24 → **5/3/8**, max spread 58/63/88 → **10/12/17**,
  occupied catchments 2 → **1**, eco zones 2–3 → **1**, corridor_diffusion → **local_cluster**.
  Default maps regressed (Map 1 100y 327/9 → 244/8, −25 %; fast 325→216); Map 2 50y ~neutral
  (314/9→308/10). `isolated_fragile_band` extinction is by-design (OFF too), NOT walk-caused.
  **Cause:** HEAT founders perpetually carry strong intent → the walk over-relocates ~every season →
  the lineage never stably anchors/grows/fissions down the corridor → local churn + population
  collapse; the greedy realizer is a worse decider than the canonical scorer it short-circuits.
  **Insight (resolves the scale question):** a band's real per-season footprint is ALREADY the
  1–3 tile / 16-tile foraging catchment (~5–9 km, ethnographically fine); only the base-CENTRE
  relocation is slow, and that *should* be slow (territorial inertia) — the marker is a near-stable
  seasonal home-range centre. Healthy spread comes from stable anchoring + catchment foraging +
  **fission colonisation**, NOT fast residential relocation; injecting the latter breaks the former.
  **No movement-scale bug.** Re-confirms the M0.15 lesson (movement levers don't aid migration) more
  strongly — extra raw movement is NET HARMFUL. Determinism held; build green; all 18 targeted suites
  pass; static guards clean; baselines restored exactly with the flag off (Map 1 325/9). Verdict:
  REVERT; next agent should NOT pursue movement levers — stay on the ecology / camps-settlements track
  (2K.x + HEAT-2 already improved migration by economics). Design + full results:
  `docs/superpowers/specs/2026-06-15-mobility-scale-migration-walk-design.md`. Mechanism is deletable
  if minimal surface is preferred; kept disabled as a documented negative result.
- **DEBUG-KNOWLEDGE-1** — Knowledge Panel / Debug Truth Audit — *UI/debug only, 2026-06-15 (NO sim behavior
  change — only `src/ui/BandPanel.tsx` edited; zero `src/sim` files touched).* The "Knowledge / Known Tiles"
  panel read empty/stale at 400y. Audit found: `knowledge.knownBands` is only the spawn/parent SEED record
  (a daughter seeds with `[parent]` → "known bands = 1", often long dead) — the LIVED social memory is
  `band.contactMemories` (encounters), which was shown only in a far separate section. `observeTile()`
  unconditionally re-tags re-observed tiles `personally_observed`, so `inherited_memory` / `physically_seen_
  on_spawn` decay to 0 for mature bands (and an original spawn band never had them) → personally_observed ≈
  known tiles by design. `knowledge.knownRoutes` (RouteMemory) and `knowledge.rumors` (RumorRecord) are TYPED
  but NEVER written (always 0); the `inherited_rumor` / `inherited_route_hint` source tags are never assigned
  (dead). Fix (UI-only): relabel "known bands" → "seed band records (spawn/parent)" and add the real
  "encountered bands (contact memory)"; annotate inherited/physically-seen as fission-time/decaying; collapse
  the four unimplemented placeholders into one honest "inactive (not implemented yet)" line; and add the
  previously-missing M0.16–2K.11 LIVED rows — inferred side / corridor-frontier tiles, resource patch
  memories (+ side-formed), exploitation skill classes, proactive info actions, side probes won, known-
  opportunity pull. No sim/movement/knowledge-inheritance mechanics changed; no new imports; no
  patchExploitationKnowledge importer change. Checks: build green; tsc clean; static guards clean (src/sim
  untouched → Map 1/Map 2 byte-identical by construction); validated on a 400y Map 1 band.
- **HEAT-2** — Learned-Niche Migration Re-Audit — *Audit only, 2026-06-14 (no sim behavior added; one
  read-only harness metric `regionEconomy` = per-capita + fission split origin vs secondary).* **Verdict:
  MIGRATION IMPROVED.** With the full 2K.7–2K.11 chain live, HEAT single-origin **500y×10**: 9/10 seeds accrue
  matching off-corridor skill, **7/10 fire 2K.9 realized support in secondary regions**, **9/10 have
  secondary-region fissions** (local reproduction), **secondary per-capita > origin in 8/9** (origin saturates
  → learned side niche pulls = economically-caused migration), 1 seed multi_region_founding, 0 necklace, 0
  collapse, 0 extinctions, pop 396–738. **1000y×3**: secondary lineages PERSIST (pctSec 0.14–0.22, secondary
  fissions 5–8, secondary realized support all 3 seeds), 1 multi_region; heat-3 (occupation-blocked at 500y)
  became multi_region by 1000y → the occupation edge is slow, not permanent. Stability: Map 1 100y /
  over_capacity_core byte-identical to 2K.11 (audit added no behavior). Residual blocker (precise, NOT "river
  wins"): the **founder/daughter OCCUPATION edge** — in ~3/10 seeds bands learn a side niche whose per-capita
  *exceeds* the saturated origin yet don't relocate/found there, so realized support stays origin-only; plus
  side-learning rarity in the occasional seed (heat-8: no side memory). Decision rule → ecology chain is sound;
  recommend (a) continue ecology to seasonal-resource realism / camps-settlements, and (b) optional HEAT-2B
  founder/daughter opportunity-consumer audit to convert occupation-blocked seeds by economics (no tuning).
- **2K.11** — Side-Encountered Resource Testing / Matching Skill Accrual v0 — *Implemented 2026-06-14, awaiting
  review.* Closes 2K.10's `sideFormedWithMatchingSkill = 0` gap so the off-corridor learning loop finally
  closes end-to-end. NEW `applySideEncounteredCautiousTest` (bandDecision.ts): when an applied side probe
  formed a memory at a PLANT-BEARING side tile, it also runs the SAME band-known plant-use-test chain
  resource_scout uses (`derivePlantScoutObservationHint` → `plantObservationMemoryFromHint` [extracted +
  exported from resourceScout; the scout path now delegates to it → byte-identical] → `derivePlantUseEligibility`
  → `applyPlantUseTestFromEligibility` → `deriveCauseSpecificEventFromPlantUseTest` → the 2K.6
  `advanceExploitationSkill` writer) on that ONE remembered patch → exploitationSkill ACCRUES for the
  encountered side class. Wired by merging the scout/side `plantUseTest`+`causeSpecificEvent` into the existing
  skill-accrual block (byte-identical when neither fires). No new patchExploitationKnowledge importer (guard
  unchanged {resourceScout, socialContext, carryingCapacity}). Testability gate: non-plant side tile → no plant
  hint → no test. Anti-omniscient: band's own observed plant hint + a band-known memory it formed; outcomes
  stay suspicion-level (NO auto food/safe/processingLearned — processingLearned still 0; confirmedProblem are
  REAL learned cautions); rarity inherited from the side-probe cadence (cooldown + lifetime cap, daughter-reset).
  Checks: build green; NEW `--targeted-side-encountered-test-check` 11/11 (non-plant/no-memory/unrelated → no
  test; plant+memory → test fires + accrues skill via 2K.6; bounded by mastery cap; binds 2K.7/2K.8/2K.9;
  unrelated does not; no food/support/stress/mortality coupling; deterministic); ALL prior targeted suites PASS;
  Map 1 100y / Map 2 **byte-identical to 2K.10**; `--all --fast` 25/25 (baseline 325 / crowded_delta 452 /
  river_barrier 274 / crowded_delta_saturation 347 — ±1 pop where the chain now fires); over_capacity_core
  non-fast byte-identical. **HEAT 500y×3: GOAL MET** — `sideFormedWithMatchingSkill` 2/2/5 (was 0); bandsWith
  Skill 13/14/17 (maxCompetence 0.43 → competent off-corridor); realized support now fires in SECONDARY regions
  (heat-1: 2 bands, heat-2: 1); heat-1 pctSecondary 0.043→0.227 by ECONOMICS; 0 extinctions, reproducible, no
  collapse/explosion (pop 655/586/733), patterns still corridor_diffusion (no forced founding); static guards
  clean; graph 164/403, 0 dup/0 dangling; worker untouched. NO yield/2K.9-magnitude/demography/fission/movement
  change. Decision rule: side matching skill now appears safely → next = HEAT / migration re-audit checkpoint.
- **2K.10** — Side Resource / Patch Memory Realism v0 — *Implemented 2026-06-14, awaiting review.* Closes the
  off-corridor SUBSTRATE gap 2K.9 exposed: side-country was observed as LAND but formed no resource/patch
  memory, so learned skill had nothing off-corridor to bind to. NEW `formSideCountryResourceMemory`
  (bandDecision.ts, wired at the apply path where the side probe observes its tile): an APPLIED side-country
  probe that actually OBSERVES its inferred side tile now runs the SAME band-known observation pipeline
  `resource_scout` uses (`deriveResourceClassAvailability` + `updateResourceKnowledgeFromObservation`) for
  that ONE observed tile → bounded, low-confidence, salience-gated, source-tagged (reasonId
  `side_country_probe` via a new optional `observationSource` on `ResourceObservationContext`; existing
  callers omit it → byte-identical) resource/patch memory. No new patchExploitationKnowledge importer (guard
  unchanged {resourceScout, socialContext, carryingCapacity}). Anti-omniscient: forms ONLY when the tile is
  in `observedTiles` (inferred-only → nothing); reads the band's OWN observed record, never tile truth; never
  mutates tile yield; a barren tile reveals only the ubiquitous low-value fallback floor, never absent VALUE
  classes; no auto food/safe/processingLearned. Checks: build green; NEW `--targeted-side-patch-memory-check`
  12/12 (inferred-only→0; observed→low-confidence memory; barren→floor-only no value class; repeated→
  confidence rises within 0.85 cap; source-tagged; full chain binds 2K.7 rank + 2K.8/2K.9 support IFF
  matching skill, unrelated does not, none before memory; no tile mutation; deterministic); ALL prior
  targeted suites PASS; Map 1 100y 327 (−1, deterministic — a side memory formed), Map 2 macro-identical,
  `--all --fast` 25/25 (baseline 326, over_capacity_core 348 — ±1–2 pop, deterministic), over_capacity_core
  non-fast macro-identical; HEAT 500y×3 reproducible, **byte-identical to 2K.9** (founding unchanged), but
  the side-patch-memory census shows side memories NOW FORM in SECONDARY/off-corridor regions (heat-2/3: 3
  secondary each; fallback_food/water_resource/generic_plant_food) — the GOAL substrate now exists; static
  guards clean (0 Math.random/any/UI); graph 164/403, 0 dup/0 dangling; worker untouched. Honest blocker
  (per decision rule): side memories form but `sideFormedWithMatchingSkill = 0` in the wild → 2K.7/2K.8/2K.9
  don't bind → HEAT unchanged. Next = matching-skill volume on side classes / side-probe cadence, then a
  HEAT re-audit; NOT movement or magnitude tuning. NO yield/demography-formula/fission/movement change.
- **2K.9** — Bounded Learned Skill → Realized Support Coupling v0 — *Implemented 2026-06-14, awaiting
  review.* The FIRST time learned exploitation skill touches REALIZED support/carrying-capacity (→ demography).
  In `deriveCarryingCapacity`'s footprint loop, `deriveTileLearnedSupport` (reused from 2K.8; carryingCapacity
  is now the THIRD deliberate src/sim importer → guard {resourceScout, socialContext, carryingCapacity}) adds a
  bounded band-specific usable-support term to `adjustedReachableSupport` per OCCUPIED, observed, matching, safe
  patch. Damped per tile by depletion (`wearMultiplier`) and crowding (`share`); summed with diminishing returns
  (`BAND_CAP≈1.0`, `HALF=0.8`, `SCALE=5`, `PER_TILE_CAP=0.4`); NEVER mutates global tile yield/terrain truth
  (noTruthRichnessLeak). **Anti-sticky:** the support ratio clamps to 1 → a surplus river band gains nothing;
  damping kills it on crowded/depleted rivers; cap+diminishing self-limit. Confirmed-problem/medicinal/toxic/
  avoided/not-exploitable/inferred-only/out-of-footprint/unseen/unrelated → no realized support (debug reason
  classes recorded). Debug `candidateProjectedLearnedSupportDelta` projects post-move support, realized only
  after occupation (no movement forcing). Checks: build green; NEW `--targeted-learned-realized-support-check`
  14/14 (incl. deficit founder perCapitaReturn 0.20→0.25 with matched skill, surplus clamped to no gain,
  capped, no tile mutation); ALL prior targeted suites PASS; **Map 1 100y byte-identical** (all surplus →
  clamped), **Map 2 macro-identical** (one deficit band lifted, bounded), `--all --fast` 25/25 (all identical
  to 2K.8), HEAT 500y×3 reproducible, no collapse/explosion (pop +0.6–3.4%), founding still corridor-bound —
  BUT the realized-support census shows the lift fired EXCLUSIVELY in the ORIGIN catchment (secondary = 0 all
  seeds), a mild corridor-ward lean (pctSecondary down 2/3 seeds) → PARTIAL on wild anti-stickiness; cause is
  the MISSING off-corridor binding target (no side observed matched patches), not the design; fix = side-
  resource/patch-memory checkpoint, NOT magnitude tuning; static guards clean (0 Math.random/any/UI; importer
  set {resourceScout, socialContext, carryingCapacity}; deriveCarryingCapacity exposed for the targeted
  check); graph 164/403, 0 dup / 0 dangling; worker untouched. NO global
  tile-yield mutation / demography-formula rewrite / fission-formula change / movement forcing. Honest scope:
  realized lift is small/capped and fires mainly on uncrowded deficit niches (rare in HEAT), so HEAT stays
  corridor-bound — report points to side-resource/patch-memory realism or processingLearned volume next, NOT
  movement tuning. Decision rule satisfied: realized support works safely; HEAT does not shift → next = side
  ecology, not tuning.
- **2K.8** — Bounded Learned-Support → Opportunity Comparison v0 (DECISION-SIDE ONLY) — *Implemented
  2026-06-14, awaiting review.* The SECOND behaviour-facing read of learned skill, in the founder/daughter/
  move opportunity comparison (the user chose "decision-side only" and forbade any realized-CC coupling in
  v0). NEW exported helper `deriveTileLearnedSupport` (patchExploitationKnowledge.ts) reuses the 2K.7
  `learnedRankDelta` to value the band's OWN observed, skill-matched known patches AT a tile. `socialContext.
  deriveNearbyOpportunityGradient` (now the SECOND deliberate src/sim importer of patchExploitationKnowledge —
  guard updated to exactly {resourceScout, socialContext}) adds it SYMMETRICALLY: `opportunityStrength =
  candidateSuitability + candidateLearnedSupport − currentSuitability − currentLearnedSupport − penalties`.
  **Anti-sticky by construction** (the addendum's core risk): skill is class-level/transferable so it lifts
  observed CANDIDATES, not just the anchor; the term is GATED by low current perCapitaReturn (<0.6) so a
  comfortable rich-corridor band is never made stickier and a skill-less band is inert. **Scope lock:** feeds
  opportunity scoring (knownOpportunityPull / frontierIntent / founder-daughter) only — NEVER realized
  deriveCarryingCapacity / demography / mortality / population / true per-capita support; inferred-only side
  tiles (no observed patch) get nothing. Checks: build green; NEW `--targeted-skill-opportunity-check` 8/8
  (matching skill flips the chosen candidate from a richer river tile to a poorer skill-matched SIDE tile;
  unrelated skill inert; comfortable band byte-identical; current-only match makes no candidate win →
  no glue; deterministic); ALL prior targeted suites PASS (skill-rank 2K.7, patch-return 2K.4/2K.5,
  exploitation-skill 2K.6, scout, plant×4, cause×5, natural-risk); **Map 1 100y / Map 2 byte-identical**
  (det fingerprints equal — gate stays 0 for comfortable bands); `--all --fast` 25/25; HEAT 500y×3
  before(2K.7)/after(2K.8) — founding distribution unchanged (river economics dominate; realized support not
  yet coupled), learned-support census reported (current vs candidate vs side); static guards clean (0
  Math.random/any/UI; importer set {resourceScout, socialContext}; deriveNearbyOpportunityGradient exported
  for the targeted check only); graph 164/403, 0 dup ids / 0 dangling; worker untouched (shared sim modules).
  Next: realized-support / carrying-capacity coupling v0 (with fake-migration/collapse/no-truth-leak guards)
  — the step that lets a learned side region actually be worth SETTLING.
- **2K.7** — Bounded Skill → Effective Resource Rank Coupling v0 — *Implemented 2026-06-14, awaiting
  review.* The FIRST behaviour-facing READ of 2K.6 learned exploitation skill. `deriveObservedPatchReturn`
  (patchExploitationKnowledge.ts) now derives a bounded, band-known, anti-omniscient `learnedRankDelta` /
  `learnedEffectiveRank` / `skillApplied` / `skillContributionReasons` from the band's OWN competence/
  processing state for the KNOWN patch's class: competence lifts (`some`+0.03 / `competent`+0.06),
  `processing_learned` RESOLVES a still-`processing_required_unknown` patch (capped ≤+0.12),
  `confirmed_problem` −0.12, medicinal + band-known-blocked patches get NO positive lift (never calories).
  The ONE behaviour consumer is `selectResourceScoutTarget` (resourceScout.ts): the delta folds into the
  SAME 2K.5 selection-only argmax bias (never `voiScore`), so learned skill only REORDERS which already-
  valid KNOWN patch a band re-observes/tests next; `band.exploitationSkill` (prior-season, persisted) is
  threaded via the scout context (bandDecision.ts). Pre-coding diagnostic (decisive): at HEAT 500y
  competence EXISTS but is LOW (3–5 bands/seed, max ≤0.34 → only `some` ever fires; processingLearned=0), so
  the coupling deliberately keys on competence not on the dormant processing state. Anti-omniscience proven:
  skill in another class → byte-identical no-flip selection; side-country probes (existence-only inferred
  tiles) get nothing. Checks: build green; NEW `--targeted-skill-rank-check` 15/15 (deterministic decision
  flip + bounded-delta gating + no-skill byte-identical); exploitation-skill 12/12, patch-return 2K.4 +
  behaviour 2K.5, scout/plant/cause/natural-risk suites all PASS; `--all --fast` 25/25; **Map 1 100y / Map 2
  byte-identical** (det fingerprints equal); over_capacity_core toggle A/B = live hook fires bounded
  (346→344 pop, 0 fiss/ext, deterministic); HEAT 500y×3 reproducible, 2/3 byte-identical, heat-2 pop
  606→583 (same 21 bands/40 fissions/0 ext), founding UNCHANGED (pctSecondary [0.083,0.273], occupied 2);
  static guards clean (0 Math.random/any/UI; patchExploitationKnowledge still ONE src/sim importer;
  new exploitationSkill import is type-only); graph 164/403, 0 dup ids / 0 dangling (2 pre-existing dup
  links); worker untouched (shared sim modules → equivalent). NO yield/CC/support/stress/relocation/fission/
  demography coupling. Next: ecology — resource-class/yield integration (make a learned class a real
  carrying-capacity input) is what would let a learned side region actually be worth SETTLING; do NOT tune
  proactive learning or rank magnitudes to force HEAT multi-region founding (river economics dominate by
  design). If a richer behaviour read is wanted first, 2K.7B could extend the SAME delta to the founder/
  daughter known-resource opportunity path (`deriveNearbyOpportunityGradient`) — but that feeds real
  relocation/founding, so it needs its own fake-migration/collapse guards.
- **2K.6B / INFO-1** — Proactive Resource Exploration v0 — *Implemented 2026-06-13, awaiting review.
  ACCEPTED (the bridge that feeds 2K.6).* 2K.6's skill substrate stayed unfed because stable bands almost
  never autonomously scout/test (they only learn under duress → skill ~0 in HEAT). INFO-1 adds a bounded
  PROACTIVE information motive: a STABLE band (foodStress<0.5, mobilityPressure<0.75, labor≥6, cooldown
  elapsed) enters `proactiveInfoMode`, which relaxes `selectResourceScoutTarget`'s throttles FOR THAT BAND
  ONLY (lower VOI floor + bypass low-capacity gate + floor value for a novel known / known-but-untested
  plant-bearing patch — the diet-breadth "learn to USE what I know is here"); a boost + `isProactiveInfo`
  reason makes the residence-UNCHANGED resource_scout occasionally win, running the existing
  scout→plant-test→2K.6-skill chain; a `proactiveInfoMemory` cooldown (12 seasons, daughters reset) keeps
  it rare. Result (HEAT 500y×3, was 0): 3–5 proactive actions/seed, 2–4 bands/seed, and 2K.6 SKILL NOW
  ACCRUES in HEAT (3–5 bands/seed, competence 0.11–0.15). No extinctions/explosion; pattern unchanged.
  Off-mode selection byte-identical → Map1 327/9, Map2 314/9 unchanged & deterministic. Anti-omniscient
  (band-own evidence, residence-unchanged, no yield/CC/stress). All 14 targeted suites pass; --all --fast
  0 failures; guards clean. NOT random exploration, NOT migration. Next: 2K.7 (skill→effective-rank
  coupling). Caveat: volume modest in expansion-dominated HEAT (scales with band stability); processing-
  resolution not yet kicked in there.
- **2K.6** — Plant Processing / Exploitation Skill Scaffolding v0 — *Implemented 2026-06-13, awaiting
  review. ACCEPTED (knowledge-only substrate; macro byte-identical to M0.16B).* Return from the M0.x
  movement detour to the ecology spine. New pure `exploitationSkill.ts` + band state `exploitationSkill`:
  a persistent, anti-omniscient per-ResourceClassId learned competence (0..0.8, asymptotic) + processing
  state (untested→suspected_processing→processing_learned|confirmed_problem) accrued ONLY from the band's
  own use-test/cause rings, written at the plant-test-ring hook. Resolves the 2K.4 processing suspicion in
  the band's OWN knowledge (≥3 non-harmful processing attempts → processing_learned; repeated harm →
  confirmed_problem; no competence on harm). Inherited DEGRADED on fission (competence ×0.5, processing_learned
  re-earned, confirmed_problem kept) so a LINEAGE accumulates local competence (diet-breadth / TEK — why
  humans inhabit poor places: learned processing makes them rich). SCOPE LOCK: surfaced only as reporting
  fields on ObservedPatchReturn read by NO decision/yield → macro byte-identical to M0.16B (Map1 327/9,
  Map2 314/9 knownTiles 559/642, deterministic). New --targeted-exploitation-skill-check 12/12; all 13
  targeted suites pass; --all --fast 0 failures; guards clean; patchExploitationKnowledge single-importer
  invariant intact. Limitation (pre-existing, not a 2K.6 defect): in-vivo accrual gated by the dormant
  autonomous plant-test trigger (HEAT fires ~0 tests → 0 skill there; accrues where cautious tests fire).
  Next: 2K.7 — explicit bounded skill→effective-rank coupling (make a learned side region worth settling).
- **M0.16B** — Off-Corridor Knowledge Consumption v0 — *Implemented 2026-06-13, awaiting review.
  ACCEPTED (mechanism sound/safe, modest positive); founding still corridor-bound → recommend 2K.6.*
  Opened the consumption path M0.16 left closed: a narrow opt-in `buildSideCountryProbeCandidate` lets a
  settled band OCCASIONALLY spend a residence-UNCHANGED logistical_probe to OBSERVE its inferred
  off-corridor side land (side-source target finder; `explorationValue` 2.5; gated only by SEVERE food
  stress — intent is NOT a gate since a residence-unchanged probe is compatible with expansion intent;
  16-season cooldown + 12/band lifetime cap via `sideProbeMemory`, daughters reset; `isSideCountryProbe`
  reason). HEAT 500y×5 M0.16→M0.16B: side probes now FIRE (182 wins/5 seeds, all seeds, 8–16 bands each;
  was 0). Necklace (h4) ELIMINATED; mean pctSecondary 0.082→0.142; mean river share 0.918→0.858. BUT
  multi-region founding net 1/5→1/5 (h2 lost / h5 gained — reshuffle, not gain). No collapse, reproducible,
  divergent. Map1 327/9 + Map2 314/9 deterministic (expected deltas: Map2 knownTiles 608→642); all suites
  pass; guards clean. FINDING: consumption works + is safe, but observed off-corridor land is genuinely not
  good enough to found on → river dominance is realistic. Knowledge/movement levers exhausted (M0.15 ✗,
  M0.16 inert, M0.16B founding-flat). Next = 2K.6 (give side land real resource value). Keep M0.16+M0.16B.
- **M0.16** — Off-Corridor Knowledge Formation v0 — *Implemented 2026-06-13, awaiting review. PARTIAL
  (substrate landed, behaviour unchanged).* Added Stage 3 to `advanceFrontierShorelineKnowledge`: the
  perpendicular analogue of M0.12 — a corridor-walking band infers EXISTENCE of off-valley side land
  within 2 of the river-valley apron (corridor+margin), grown off observed corridor/margin tiles,
  capped 2/season & 64/band, TTL 60, id-ordered, existence-only (`off_corridor_side_inference`,
  `noOmniscientRichness`). New `isWithinSideReachOfCorridor` predicate (anchored on valley not bare
  channel — the bare-channel draft formed 0 on wet rivers). Consumed only by the source-agnostic M0.7
  probe; M0.8 goal-loop filters the new source out. HEAT-1 500y×5 before→after: side inference forms
  abundantly (741–1203 tiles/seed, ~all bands) but ALL 5 fingerprints byte-identical → patterns 3
  corridor/1 multi/1 necklace unchanged, river share 91.8%, pctSec 0.082 unchanged. INERT: the M0.7
  consumption gate never fires on side tiles under corridor-rich conditions (side-probe wins = 0), and
  off-corridor ecology doesn't beat the corridor. Zero regression (Map1 328/9/4, Map2 314/9 byte-id;
  all suites pass; guards clean; anti-omniscience proven). Blocker = probe gate ignores inferred side
  land + river dominance. Next: smallest M0.16B (open consumption as a residence-unchanged information
  probe, NOT forced migration), then re-run HEAT-1; if corridor still wins, return to 2K.6.
- **M0.15** — Anti-Linear Regional Founding — *ATTEMPTED → REVERTED 2026-06-13 (negative result).*
  Tried founder-journey establishment gating (hold founder intent until distinct/uncontested/viable
  band-known ground, anti-necklace via low-crowding gate, 48-tick cap). HEAT-1 500y×5: multi-region
  2/5→1/5, descendants_leave_origin false, one seed river-share 95%, one band-count collapse 22→10.
  Reverted — sim byte-identical to pre-M0.15 (328/9, 314/9). FINDING: regional founding is gated by
  KNOWLEDGE not movement timing — descendants only know corridor land (M0.12 extends along corridors
  only) and off-corridor land is genuinely poorer, so delaying settlement just rides the corridor
  further. Fix = off-corridor knowledge formation (M0.16), not a movement hack. Corridor dominance is
  partly realistic; HEAT-1 already passed its gates, so this is deferred "feel" polish, not a blocker.

- **HEAT-1** — One-Origin Migration Heat Test / Regional Colonization Audit — *Implemented 2026-06-13,
  awaiting review.* AUDIT-ONLY (no sim change; only simBenchmark.mjs). New `--targeted-one-origin-heat`
  spawns one Origin Band on Map 2, runs multi-seed, classifies multi_region_founding /
  corridor_diffusion / necklace_or_single_chain / local_cluster. 500y×5: reproducible, 5/5 distinct
  fingerprints, 0/5 necklace, 2/5 multi-region, 3/5 corridor-diffusion (far spread in multiple pockets
  but river-corridor-dominant). All 6 acceptance gates pass. Verdict PASS with caveat: necklace failure
  avoided, but robust multi-region founding is seed-dependent (river corridor still the dominant
  attractor). Map1/Map2 fingerprints byte-identical; full battery green. → return to 2K.6; M0.15
  regional-founding strength is optional future polish.

- **VAR-1** — Deterministic Seed Variability v0 — *Implemented 2026-06-13, awaiting review.* Adds a
  separate `world.runSeed` (distinct from terrain seed) injecting tiny deterministic seeded jitter
  (`seededVariation.ts`, pure integer hashing) at two near-tie points: movement candidate selection
  (ε=0.06) and fission daughter-target selection (ε=0.08). runSeed undefined → zero jitter → legacy
  byte-identical (all baselines/audits preserved). Audit: same seed reproducible (identical
  fingerprints both maps); 4 seeds diverge in spatial outcome (catchment occupancy, bbox, fingerprint)
  while band count/pop stay bounded (ecology dominates macro, seed varies path) — meaningful not
  chaotic. UI run-seed field + "🎲 New History". Worker/direct equivalent for legacy AND seeded; full
  battery + --all --fast 25/25 green; guards clean. Determinism invariant updated to per-(map,runSeed).
  Divergence compounds over long/single-origin runs → HEAT-1 next.

- **PERF-3** — Data-Oriented Tick Pipeline / 1000y Readiness Pass — *Implemented 2026-06-13, awaiting
  review.* Honest finding: post-PERF-2 cost is diffuse and the big levers (3 range passes, observedTiles
  per-tick churn) are NOT safely reducible (different inputs per pass; lastObservedAt behaviourally read;
  pass-skip changes audit outputs). Merged ONE byte-identical win — memoize `getNearbyActiveBandIdsForTile`
  on the spatial index (was recomputed ~9×/band/tick) → 1.10× (1.39× cumulative over PERF-1). Added
  report-only HEAT-1 `migrationPrep` metrics (occupied catchments, bbox, max-origin-distance, founders,
  patternHint). 500y practical (~5min); 1000y slow (~10min) but runnable; worst-tick in worker so UI never
  freezes. All outputs byte-identical (both maps, worker/direct, migration smoke pre-existing fields,
  fingerprints); full battery + --all --fast 25/25 green; guards clean. Empire-era path = aggregation,
  not further micro-opt → recommend VAR-1 next; PERF-4 only if a clear safe hotspot reappears.

- **PERF-2** — Tick-Cost Reduction / Long-Run Speed Pass — *Implemented 2026-06-13, awaiting review.*
  Three byte-identical memoizations (observed-frontier classification on observedTiles; salient memory
  summary on placeMemory+validated refs; base habitat potential already cached) → 1.26× tick-cost
  reduction. Render decoupled to a rAF loop reading the latest store snapshot (fixes "bands move every
  few ticks" — React was batching rapid overlays; bands actually move 93% of ticks). Nomad-era target
  (~1 century/min) met up to ~36 bands (10-37s/century); worst-tick spikes now in the worker so UI
  never freezes. All outputs byte-identical (both maps, worker/direct, migration smoke, fingerprints);
  full suite battery + --all --fast 25/25 green; guards clean. Remaining cost is spread (3 context
  passes, candidate gen, GC churn) → PERF-3 (data-oriented) then aggregation.

- **PERF-1** — Sim Worker + First Performance Architecture Pass — *Implemented 2026-06-12, awaiting
  review.* Sim moved off the browser main thread (Worker owns the world; dynamic-only throttled
  snapshots; deterministic static twin on main; fallback path preserved). Pure runner module gives a
  node-provable worker path: runner-vs-direct AND snapshot-merge byte-equal on both maps; Map 1/Map 2
  outputs byte-identical to pre-PERF-1; full battery green; guards clean. Behaviour-identical
  `getTileAtCoord` flat grid index (−14% heavy-end tick). Stutter mechanism eliminated; remaining
  ~N^1.8 tick growth documented for PERF-2.

- **M0.14** — Persistent Local Depletion / Regeneration v0 — *Implemented 2026-06-12, awaiting
  review.* First mutable per-tile world state: sparse `tileDepletion` advanced per season from the
  memoized shared-catchment extraction index (gain 0.0008/claim, regen 0.0035·(0.5+tileRegen), cap
  0.85); realized support × (1 − d·0.6); observation captures worn richness (6 sites) so newcomers see
  worn land and beliefs go stale naturally. Map 1 delta: wear 0.50, pcr 0.456→0.253, recovery
  0.50→0.32/20y, no collapse. Map 2: delta 9→7 bands, river corridor 7→11, newCatchment founders 0→2.
  M0.11 crowding kept separate; M0.13 behaviour intact; full battery green; depletionAdvance ≈
  0.43ms/tick. New fingerprints Map 1 328/9/4, Map 2 314/9/0; 300y non-fast 1470/36. Decision:
  delta-battery physics FIXED — recommend returning to 2K.6 (plants), PERF-1 when longer runs wanted.

- **M0.13** — Directional Drift + Founder Journeys + Creek Corridors + Low-Pressure Competitiveness —
  *Implemented and ACCEPTED 2026-06-12 (sanity review at M0.14 start).* Four bounded movement-policy couplings: sustained-hardship
  intent evidence (mean8/sustainedOverCapacity), corridor-chain heading fallback (intent points at the
  band's own M0.12 inference-chain head — existence-only direction), founder-journey seeds for daughters
  of saturated parents (0.4 intent, decays/settles normally), creek-corridor relocation eligibility +
  saturation-relaxed opportunity margin (+0.08→−0.05, `wonByLowerCompetition` audit flag). Map 2 300y:
  first dry-corridor escape (daughter founded open_plains), plains occupancy 2→4 bands, corridor reach
  15→34, daughters 27/27 keep founder intent at 5y with monotone displacement, 615 creek moves, pileup
  stable, NO movement explosion (drift-scale audit passed). New fingerprints Map 1 323/8/3 /
  Map 2 317/9/0. Full battery green. Audit gains daughterJourneyAudit/creekFollowing/margin flags.
- **MAP1-R** — Realistic Map 1 Redesign (user-directed, 2026-06-12) — Map 1 rebuilt with the MAP2-R
  toolkit, ALL feature anchors preserved (lake centroid (58,74), delta (134,65), west range + pass,
  main-river course, west/north dry zones): seed-parameterized shared helpers (`subdivideMacroPath` /
  `variedFieldNoise` / `variedLakeDistance` now take a seedHash; **Map 2 verified BYTE-IDENTICAL**
  after the refactor); meandering subdivided main river with downstream-widening channel + broadening
  floodplain; ORGANIC lobed lake; honest lake plumbing (new `regional-lake-inflow` seasonal stream
  ending on the west shore + outlet from the east shore joining the main river — replaces the single
  path the lake swallowed mid-way, which had left two floating channel stubs); delta distributaries
  fan from the main stem apex (132,64) (connected by construction); 8 sub-tile creeks (hasCreek
  corridors, mouths overshooting onto channels); causal moisture→richness field with REGIONAL-seeded
  noise mosaics; dry zones kept but smaller/noisy-edged; new SE hill belt; coast unchanged. Declared
  scale **~1 km/tile (160×100 km)** (UI header + `REGIONAL_KM_PER_TILE`). Connectivity audit: river
  network unified (outlet connects lake→main), 8/8 streams touch water. NEW Map 1 fingerprint:
  100y **325/8/3** `deterministic=true` ×2 deep-equal (was 304/8/3 on the old terrain). FULL battery
  green on the new map: lake-opportunity audit PASSED (dynamic target adapted), frontier-drift,
  patch-return 12/12 + behavior 13/13, scout 6/6, plant 9/7/8/9, all cause/dispersal/natural-risk
  suites, `--all --fast` **25/25**, migration audit deterministic, guards clean, graph 164/403 0/0.
  UI: hover tracking DISABLED entirely (user request — old-world hover redraws read as lag; tiles/bands
  select on click only; hover coordinate box gone with it).
- **M0.12** — Corridor-Continuation Inference + Migration Gate — *Implemented 2026-06-12, awaiting
  review.* Extends accepted M0.6: directed existence-only corridor-CHAIN inference along walked
  river/creek corridors (`isChannelCorridorLand`, ≥4 observed-tile evidence, 2/season, 96-record
  budget, 60-tick TTL, land/passable-only, fission-reset inherited; source
  `corridor_continuation_inference`) + M0.7 probe-gate amendment (economically stuck bands —
  pcr < 0.3, no intent, no residence — are no longer excluded by dispersal pressure). RESULT:
  knowledge-range wall SOLVED (dry-band knowledge 89-213 tiles vs ~44 in M0.10; live corridor beliefs
  reach 13-18 tiles) with macro trajectories IDENTICAL to M0.11 on both maps at all horizons — the
  remaining world-filling blocker is isotropic wandering under uniform hardship (no directional
  persistence for chronically stressed bands) → M0.13 directional corridor drift recommended
  (movement-policy, max effort). All checks green; audit gains per-band corridorInference fields.
- **M0.11** — Shared-Catchment Saturation → Effective Per-Capita Return v0 — *Implemented and
  ACCEPTED 2026-06-11.* FIRST causal multi-band-crowding → economics coupling: sustained over-capacity
  (min of two consecutive rangeV1 saturations − 1, capped 1.5) × 0.45, capped 0.5, subtracted from
  perCapitaValue in `deriveCarryingCapacity`. Breaks the M0.10 "infinite food battery": Map 2 basin
  pileupScore 0.727→0.273 (satellites 8→3, outward 2→5), basin pcr now oscillates with crowding
  (0.92-glued before; 0.62-0.87 breathing after), crowd-removal recovery proven (sat 2.5→0.53, penalty
  0.5→0, pcr 0.1→0.93), no collapse (basin pop 458→498), Map 1 lake audit still passes. Audit extended:
  per-catchment meanSaturationV1/meanSaturationPenalty, per-band before/after effective return,
  saturationRecovery experiment. New fingerprints: Map 1 100y 304/8/3; Map 2 50y 314/9/0. All targeted
  suites + --all --fast 25/25 green. Dry-margin knowledge wall remains → M0.12 recommended.
- **MAP2-R** — Realistic Map 2 Rework / Visual Audit Only — *Implemented 2026-06-11, awaiting review.*
  MAP/UI/RENDER checkpoint, no sim-rule change: Map 1 fingerprints unchanged (306/8/3 100y deterministic;
  1382/36 300y non-fast; lake audit 7/730/5.98 passed); Map 2 scenario re-baselined 315/9/0 (50y,
  deterministic ×2, 9 spawns; final 315/9/0 after geo-realism + connectivity passes — all mouths on
  confluence vertices, dry river reaches the SE coast, stream mouths overshoot onto targets, river
  overlay marker defaults OFF with stream threads in the base map). NATURALIZATION: meandering
  channels via vertex-preserving `subdivideMacroPath` (amplitude tapered — straight young headwaters,
  meandering mature courses), organic `variedLakeDistance` lake shorelines, downstream-widening main
  river + downstream-broadening floodplain, NEW lee-side `varied-west-river` + 5 mountain streams (no
  dead map regions), north/south hill belts so both tributaries rise in high ground, endorheic NE basin
  lake (brackish, seasonal shoreline), faint-thread stream rendering, global seasonal tints softened
  (was washing out the palette). Declared scale ~1.5 km/tile (UI header `Scale:` line +
  `VARIED_MIGRATION_KM_PER_TILE`); causal moisture→richness field (coastal humidity, orographic foothill
  rain, surface-water proximity, rain shadow) + seeded noise mosaics replace stamped blobs; 12 sub-tile
  creek influence corridors (`VARIED_CREEKS`, optional `Tile.hasCreek` flag, thin renderer overlay, no
  sim reader); braided upper main reach + named fords (86,52)/(108,58)/(134,68), dangerous narrows
  (184,90), estuary impassable; lake basin reworked into fed marsh-fringe gradient; NEW spawn
  `band:varied-plains-creek`. M0.10 audit geometry anchors preserved; audit runs deterministically on
  both maps. POLISH PASS (same checkpoint): smooth blended terrain palette in `canvasRenderer.ts`
  (continuous dry↔humid vegetation ramps + rock/marsh/floodplain/coast mixes + ocean depth shading,
  legend updated; render-only, benefits both maps) and bilinear `variedFieldNoise` replacing blocky
  `smoothNoise` in Map 2's relief/climate/fertility/coastline fields. Visual audit via
  palette-mirroring PNG render: realistic; remaining limits = delta core clamps at 1.0, far-west strip
  plain, creeks not navigable hydrology.
- **M0.10** — Map 2 + Migration/Saturation Audit Batch — *Implemented 2026-06-10, awaiting review.*
  AUDIT/UI/MAP checkpoint, NO sim behaviour change (Map 1 baseline 306/8/3 deterministic byte-equal; M0.9
  lake audit byte-equal). NEW: Map 2 "Varied Migration Test" (`createVariedMigrationWorld`, 220×140,
  deterministic hand-authored: rich lake basin, long river + 2 tributaries, greener SE lowlands,
  dry-margin seasonal "yellow corridor" with survivable channel margin and green downstream end,
  semi-isolated NE basin behind a one-pass ridge, 2 western passes, delta/estuary, poor-but-empty north
  steppe, 9 river profiles + 1,096 crossings); explicit Map 2 spawns (`spawnVariedMigrationBands`: 2 dry-
  corridor bands, 3-band crowded lake cluster, river/estuary bands, small pass-frontier band); UI selector
  ("Map 1 — Lake/River Debug" / "Map 2 — Varied Migration Test"); scenario `map2_varied_migration` (50y,
  sweep now 25); `--targeted-migration-saturation-audit` (catchment snapshots 50-300y, fission ledger with
  satellite-vs-outward classification, dry-lineage tracking, greener-alternatives observed/inferred/truth-
  only audit, intent-candidate introspection via NEW audit-only `auditMobilityIntentCandidates` export —
  mechanical extraction, no src/sim caller, baseline byte-identical — basin saturation deep dive with
  colonization rejection reasons, wetland pileup score, world-fill metrics; deterministic, audit-only).
  FINDINGS: dry-margin = knowledge-range wall not overattachment (Map 2 deep-margin band has ZERO greener
  tiles within range 14 in TRUTH, knowledge ~44 tiles after 300y, no downstream candidate can form; Map 1
  dry lineage escaped; upper-corridor band drifts downstream correctly); wetland saturation = rich pockets
  are infinite food batteries (basin 3→11 bands, ×4 pop, perCapitaReturn only −5%; 9 fissions → 5 local
  satellites, 0 outward; every alternative rejected `not_better_than_current`); world-filling = ABSENT
  (occupied area flat over 300y on both maps; Map 1 bands densify, pairwise distance 81.6→54.7). TRUE
  BLOCKER named for M0.11 (max-effort architecture checkpoint): multi-band crowding must causally reduce
  effective per-capita return so poorer-but-empty can ever beat richer-but-crowded — NOT a movement lever.
  HARNESS FINDING resolving the 2K.5 flagged drift: `--fast` skips the per-season contextFinal pass →
  fast/non-fast trajectories legitimately diverge at 200y+ (645/1358 fast vs 646/1382 non-fast, each
  deterministic); record modes with numbers. Verification: build green; Map 2 scenario 273/8/0
  deterministic ×2; audit 50y re-run deep-equal; 11 suites pass; `--all --fast` 25/25; static guards
  clean; graph untouched 164/403.
- **2K.5** — Patch Return-Guided Observation/Testing v0 — *Implemented 2026-06-10;
  **ACCEPTED 2026-06-10 by architect decision** based on the self-review (zero attributable macro delta,
  selection-only local behaviour, no coupling; the flagged long-horizon drift was later explained by the
  M0.10 fast/non-fast harness finding).* The
  first bounded behaviour hook reading the accepted 2K.4 patch-return knowledge: a SELECTION-ONLY bias in
  `selectResourceScoutTarget` (`resourceScout.ts` becomes the single `src/sim` importer of
  `patchExploitationKnowledge.ts`; static guard asserts the importer set). Per already-valid candidate,
  `derivePatchReturnScoutGuidance` (pure, band-known inputs only: patch memory + capped test/cause rings
  now passed via `ResourceScoutContext`) yields a bounded bias: promising-unproven follow-up +0.1,
  processing-unknown recheck +0.07 (still NOT usable food — eligibility unchanged), cautious-testing
  continuation +0.05, suspected-toxic/avoided −0.12 deprioritised (lifted to bias 0 at foodStress ≥ 0.75 —
  recheck allowed under severe stress, never boosted), medicinal class excluded (2K.3C-A not inverted).
  Argmax key = `round2(voi) + bias` (pre-2K.5 granularity → all-zero biases byte-identical to pre-2K.5;
  an initial raw-precision key caused an unscoped micro-divergence and was fixed); exported `voiScore`
  unchanged (scout-vs-stay weight untouched); applied post presence/VOI gates (cannot create/remove/
  range-extend candidates); scouts stay residence-unchanged. `lastResourceScout` (now carrying guidance
  debug) fission-resets + clone-guard entry (closes the 2K.4 review note). Debug: candidate/scout-debug
  guidance, band-report block (umbrella `patch_return_followup_observation`, literal
  `knowledge_only_no_yield`), BandPanel line, `scoutAudit` guidance counters. Graph: summary/status
  clauses on 3 existing nodes (resourceScout, resourceKnowledge import-claim corrected, foodTesting);
  counts unchanged 164/403. New `--targeted-patch-return-behavior-check` (12 assertions: reasons/bounds,
  risk flip under stress, medicinal exclusion, no-coupling flags, biased selection vs unbiased tie-break,
  voiScore invariance, processing-not-usable via real eligibility, cautious continuation, envelope/gate
  invariance, determinism) — all pass. Verification: build + 2× tsc green; baseline 306/8/3 deterministic
  ×2 (identical to accepted); lake audit byte-equal accepted (7/730/5.98/14/108/2227); scale passed; all
  15 targeted suites; `--all --fast` 24/24; static guards + graph clean; perf 9.9/38.4/98.4s. Sim-outcome
  delta ZERO proven by toggle matrix (bias-off / reset-off / both-off all byte-equal to implemented code;
  over_capacity_core byte-equal to the accepted 2K.4 audit: 435/419/11/5, 6 safety_uncertain). Flagged
  open observation: 200y/300y baseline pops 646/1382 vs recorded 645/1358 — reproduced by the FULL-2K.5-
  REVERT tree too, so it predates 2K.5; reviewer should re-baseline or bisect. Scope honored: no calories/
  support/yield/CC/stress/mortality/population/relocation/fission, no safe-food certainty, no rich-tile
  migration, no camps/storage/culture, no Math.random, no `any`.
- **2K.4** — Observed Patch Return / Exploitation Knowledge v0 — *Implemented 2026-06-09;
  **ACCEPTED 2026-06-10 after review** (full matrix re-run green: baseline 306/8/3 deterministic, 14
  suites, lake 7/730/5.98 stable, scale 2/0.1/0.64/6, 24/24 sweep with allGuardFlagsTrue, static + graph
  164/403, perf 10.5/36.1/91.9s pop-byte-equal; code re-review confirmed band-known-only inputs,
  strong_later unreachable, locally_usable_placeholder unreachable today — successfulUses has no
  incrementing writer; non-blocking notes: tile+class test-ring aliasing across same-tile patches, and
  pre-existing non-reset lastResourceScout aligned in 2K.5).* Resumes the plant/resource ecology spine.
  New pure DERIVED-ONLY module
  `src/sim/agents/patchExploitationKnowledge.ts` (2K.3B pattern: benchmark/UI readers only, NO `src/sim`
  import — enforced by static-guard grep — and NO band state, so nothing to clone-guard and daughters can
  never perfect-copy). Derives per remembered patch (cap 48) an `ObservedPatchReturn` from the band's OWN
  evidence only (patch memory + capped plant-test ring 6 + capped cause-event ring 6): provenance
  (memoryState/memorySource — known vs inherited vs inferred explicit), dominant source (scout/repeated/
  cautious_sample/fallback_trial/processing_hint/cause_specific_warning), expectedReturn capped at the
  explicit placeholder `moderate_placeholder` (never a yield number; derived independently of risk),
  exploitationReadiness (not_exploitable / observation_only / cautious_testing / processing_required_unknown
  / locally_promising_unproven / locally_usable_placeholder — last needs REAL successful use, unreachable by
  plants in v0), confidence weak|moderate (`strong_later` reserved, NEVER emitted), riskState
  (suspected/caution states only — no poison/medicine truth), seasonalityHint, evidence counts, literal
  no-coupling guards. Capped band summary (top 3 promising / top 3 risky, counts, latest,
  knowledgeOnly+futureExploitationHook). NO behaviour coupling (deliberate v0 default; scout already
  structurally prefers known patches). Debug: band-report `patchReturnKnowledge` block, scenario-summary
  `patchReturnAudit` aggregate (ADDITIVE), BandPanel derived section. Graph: summary-only updates on 7
  existing nodes (resourceKnowledge, patchMemory, causeStress, learnedWorldModel, foodTesting, processing,
  riskBattery), counts unchanged 164/403. New `--targeted-patch-return-check` (11 deterministic assertions:
  weak-estimate formation, confidence-not-certainty, cautious-sample testCount w/o calories, real
  test→cause chain warning → not_exploitable, processing block, durable-toxic block, daughter
  non-perfect-copy via real inheritance, determinism + guards) — all pass. Verification: build green;
  baseline SIM byte-identical (pre→post diff = ONE additive report hunk; 306/8/3 deterministic; aggregate
  shows the inert default — 366 estimates all observation_only/none_observed); M0.9 lake audit
  byte-identical (movement untouched); scale audit identical (2/0.1/0.64/6); all 14 targeted suites pass;
  `--all --fast` 24/24 with patch-return audits live in stress scenarios (safety_uncertain /
  processing_required_unknown / cautious_testing appear; allGuardFlagsTrue everywhere); static guards clean
  incl. new no-sim-import guard; graph 164/403 0/0. Scope honored: no calories/support/yield/CC/stress/
  mortality/population/relocation/fission coupling, no safe-food certainty, no random poisoning, no storage/
  camps/culture, no Math.random, no `any`, no UI imports in `src/sim`. Recommended next: bounded behaviour
  hook reading the view (2K.5) or processing/exploitation-skill scaffolding.
- **M0.9** — Directional Corridor Persistence / Far-Shore Convergence v0 — ***ACCEPTED 2026-06-06 after
  review; independently re-verified 2026-06-09 (fresh full matrix: baseline 306/8/3 deterministic, lake
  audit deterministic minDist 7 / moves 730 / wander 5.98, scale 2/0.1/0.64/6/24, 14 suites + 24/24 sweep,
  static guards, graph 164/403, perf 10.3/35.3/93.1s; −3 baseline delta confirmed movement-path-only — no
  demography/yield/stress coupling path exists; acceptance confirmed).*** New anti-omniscient `CorridorHeadingState` (`agents/types.ts`): a band earns a bounded heading
  from its own realized probe/corridor moves — strengthens (+0.2, EMA-blend, cap 0.85) only when an aligned
  step (dot ≥ 0.5) EXPANDS its known frontier; decays on reversal (×0.4, re-seed if new frontier), sideways
  (×0.78), and rest (read-time age decay, gone after 20 idle seasons → survives the M0.8-B cooldown).
  Governor + use in `mobilityIntent.ts` (`advanceCorridorHeading` / `effectiveCorridorHeadingStrength` /
  `getActiveCorridorHeading`; direction blend ≤0.5×strength + signed continuity bonus ≤~0.05 on
  frontier_probe/corridor candidates only). Advanced in `applyBandDecision` (`isAppliedCorridorOrProbeMove`);
  never inherited (clone-guard + reset). Lake audit gains a `directionalPersistence` block (heading-influenced
  moves, reversals, band-seasons, end-state headings, route progress 0/25/50/100/150/200). **Result:** closest
  approach 9→7 (no truth/inferred richness, no forced movement, never targets aquatic tile:53:67), mobility
  moves 746→730, wandering 6.17→5.98, retention valid (maintain25=2, persist=0.1, maxD=24), baseline
  deterministic 309/8/3→306/8/3 accepted as a tolerated movement-calibration delta, `--all --fast` 24/24,
  static guards clean, graph 164/403 (summary only), review perf 11.9/40.0/104.0s. Remaining gap is now a
  richness/observation wall, not movement. Recommended next: resume plant/resource exploitation-knowledge
  spine.
- **M0.8-B** — MobilityIntent Shoreline Wandering Calibration — ***ACCEPTED 2026-06-06 after review.***
  Calms the PRE-EXISTING mobility-intent shoreline drift M0.8-A identified (not the inert M0.8 relocation).
  A `frontier_probe`-move cadence cooldown (`mobilityIntent.ts` `isFrontierProbeCooling` /
  `advanceFrontierProbeCadence`; burst 3 / cooldown 8): after 3 consecutive `frontier_probe` mobility moves
  a band re-anchors before another `probe_coast`/`probe_wetland_or_lake`/pressure-`expand_known_world` is
  OFFERED. Cadence cap only — never forces movement, never reads truth/inferred richness; survival, local
  foraging, river/pass following, knowledge-poor expansion, and daughter dispersal
  (`frontier_dispersal_pressure`) untouched. New band field `frontierProbeCadence` (never inherited; in
  `DAUGHTER_NON_CLONEABLE_FIELDS`). Audit: per-band + parent/daughter mobility-intent split, wandering
  score, M0.8 relocation OFFERED count (via archive-only `AlternativeConsidered.isCorridorRelocation`),
  probe-cooldown band-seasons. **Result:** mobility-intent frontier moves 1740→746 (−57%), wandering score
  11.6→6.2, closest approach preserved at 9, retention IMPROVED (maintain25 1→2, persist 0.03→0.1, maxD
  21→24), baseline deterministic 310/8/3→309/8/3, `--all --fast` 24/24, static guards clean, graph 164/403
  unchanged, perf 12.6/43.8/123.6s. Review accepted 310/8/3→309/8/3 as a tolerated calibration delta
  (bands/fissions unchanged; no mortality/demography coupling change). Recommended next: M0.9 directional
  corridor persistence.
- **M0.8-A** — Corridor Relocation Rate-Limit / Anchor Reluctance + Audit Correctness — ***ACCEPTED
  2026-06-05 after review; one report-only correction applied.*** **Key finding (measurement correction):** the flagged "1740 corridor
  relocations" were mis-attributed — the lake audit counted every `move_to_tile` with a `frontier_probe`
  primary reason as M0.8 relocation, but that reason is ALSO emitted by the pre-existing mobility-intent
  system (`createCorridorCandidate`/`createExpandKnownWorldCandidate`). The M0.8 relocation reason now
  carries an explicit `isCorridorRelocation` marker; with it, M0.8 `buildCorridorRelocationCandidate`
  wins **0×** (offered 1091×, always dominated), and the 1740 are all pre-existing mobility-intent moves
  (delta-coastal 362 + lake-wetland 302 etc.). **Rate-limit added to the M0.8 mechanism** (so it is bounded
  if it ever wins): `CorridorRelocationState` (`lastRelocationTick` + `cumulativeStepsSinceSettled`) drives
  a dwell-since-LAST-RELOCATION cooldown (8 seasons — replaces the absolute-`visitCount` loophole the review
  flagged) + a capped per-step anchor reluctance (+0.015/step, cap 0.06) that decays after 24 settled
  seasons; advanced event-driven in `applyBandDecision` only when a marked relocation executes; reset on
  fission (`DAUGHTER_NON_CLONEABLE_FIELDS`). Dormant in the lake world (mechanism never wins), baseline-inert,
  anti-omniscient, deterministic. **Out of scope (deliberately):** the pre-existing mobility-intent shoreline
  volume is accepted behaviour shared with the byte-identical baseline path — not changed (would risk
  baseline/retention); flagged for a separate checkpoint if the visual calm is wanted. Audit extended:
  marker-keyed M0.8 count, separate `mobilityIntentFrontierMoveCount`, parent/daughter split, avg-per-band,
  `rateLimit` block, before/after. Review correction: fixed the lake-audit `remainingBlocker` wording and
  stale graph summary sentence so 13→9 closest physical approach is credited to pre-existing
  mobility-intent moves when marked M0.8 relocation wins 0×. Verification: build green; baseline **310/8/3
  byte-identical** + `deterministic=true`; scale retention identical (m25=1/persist=0.03/loop=0.67/sat=6/
  maxD=21); lake audit deterministic (M0.8 reloc 0, mobility 1740, minDist 9, passed); dispersal +
  dispersal-lineage + scout + 4 plant suites passed; `--all --fast` 24/24; static guards clean; graph
  164/403 unchanged; perf 18.2/41.8/101.2s. Recommended next: small M0.8-B to calm pre-existing
  mobility-intent shoreline wandering, then M0.9 directional persistence in that existing corridor path.

- **M0.8** — Confidence Coupling Fix + Bounded Corridor Relocation v0 — *Implemented 2026-06-04;
  **ACCEPTED 2026-06-05** (review re-ran all checks; one report-only fix to a stale lake-audit string;
  next step M0.8-A to rate-limit parent-band shoreline drift, then M0.9 directional persistence).*
  **Part A (coupling fix):** travel-corridor confidence (`memory.ts`) — the only consumer of the
  candidate count — no longer uses `decision.alternativesConsidered.length`; it now uses a new stable
  `Decision.coreDeliberationBreadth` = the count of CORE survival candidates, EXCLUDING opt-in helper
  candidates (flagged `isOptInCandidate`: the M0.7 inferred-frontier probe, the M0.8 corridor relocation).
  In accepted runs no candidate is opt-in, so the two are equal → byte-identical; now an opt-in candidate
  can be offered every season (winning or not) without perturbing any band-known confidence. The M0.7
  conditional-append is removed (both opt-in candidates are simply offered, marked opt-in). **Part B
  (relocation):** new `buildCorridorRelocationCandidate` — a settled band (same gate as the probe) that
  has dwelt at its current tile (`CORRIDOR_RELOCATION_MIN_VISITS`=3, settle→step→settle) and personally
  OBSERVED an adjacent near-water-margin LAND step may relocate ONE step (move_to_tile) when it strictly
  progresses toward its nearest inferred frontier tile (existence = DIRECTION only). Step value is the
  band's REAL observed record (never truth overlay, never inferred-as-yield); distance 1; never aquatic
  (so tile:53:67 can never be a target); route/crossing/water-refuge checked; a small directional
  curiosity (`CORRIDOR_RELOCATION_PULL`=0.08, no anchor hold) tips a borderline step. Result (lake audit):
  8 deliberate probes + bounded corridor relocations that move a band from distance 13 → 9 of the target
  (`band_relocated_closer_to_target_along_corridor`); 1740 corridor steps confined to the water-rich
  regional world; far aquatic target stays un-standable (honest blocker reported). Checks: build + both
  typechecks green; baseline 310/8/3 byte-identical + deterministic; scale-audit retention identical to
  M0.5/M0.6/M0.7 (maintain25=1, persist=0.03, loop=0.67, sat=6, maxD=21); lake audit deterministic (2
  runs); dispersal + dispersal-lineage + scout-regression + plant-use-test passed; `--all --fast` 24/24;
  static guards clean; perf ~9.9/29.2/78.1s (opt-in candidates perf-neutral); graph 164/403 (node summary
  updated). Scope honored: no inferred/truth richness, no rich-tile migration, no forced movement, no
  open-water crossing, no yield/stress/mortality/carrying-capacity/plant/cause change, no camps/settlements,
  no Math.random/any/UI in src/sim.

- **M0.7** — Act on Inferred Frontier Knowledge v0 — *Accepted 2026-06-04, review confirmed.* New
  candidate `buildInferredFrontierProbeCandidate` (`bandDecision.ts`): a SETTLED near-water band (gated
  out if it has active frontier intent / established frontier residence / dispersal ≥0.2) sends a
  residence-UNCHANGED `logistical_probe` to the NEAREST band-known inferred frontier tile within radius 4
  (passable LAND, bounded observed-or-inferred land route, per-edge passability/crossing checked). It carries
  NO resource/yield value (inference carries no richness), NO truth read, never crosses open water, never
  relocates. On apply, the existing observation pipeline OBSERVES the tile (inference → real
  `KnownTileRecord`) and `frontierKnowledge` PRUNES the now-observed tile from its inferred set; only THEN
  can ordinary opportunity/yield logic evaluate it. **Retention-safety via conditional append:** the probe
  is added to the candidate set ONLY when it would WIN — because place-memory confidence is coupled to
  `alternativesConsidered.length` (`memory.ts`), a non-winning candidate perturbs every band's confidence
  and collapses the knife-edge retention (proven: a never-win probe still drove maintain25 1→0). Review fix:
  the conditional append now compares post-`applyIntentShaping` scores, matching the actual final ranking.
  So non-acting decisions are byte-identical and only genuine acts change the set. Result: 8 deliberate
  inferred-frontier probes over 200y in the lake audit (`settled_bands_deliberately_probe_inferred_frontier`),
  inference→observation conversions occur, the far target still needs relocation (honest blocker reported).
  Checks: build + both typechecks green; baseline 310/8/3 byte-identical + deterministic; scale-audit
  retention identical to M0.6 (maintain25=1, persist=0.03, loop=0.67, sat=6, maxD=21); lake audit passed;
  dispersal + dispersal-lineage + scout-regression + plant targeted suites passed; `--all --fast` exited 0;
  static guards clean; 100/200/300y deterministic benchmarks completed; graph 164/403 (+1 behaviour link,
  0 duplicate node ids, 0 dangling). Scope honored: no truth richness, no rich-tile migration, no forced
  movement, no open-water crossing, no global attachment weakening, no yield/stress/mortality/carrying-
  capacity/plant/cause change, no camps/settlements, no Math.random/any/UI in src/sim.

- **M0.6** — Frontier Knowledge Formation / Shoreline Exploration Propagation v0 — *Accepted
  2026-06-04, review confirmed.* New pure module `src/sim/agents/frontierKnowledge.ts`: a band with
  sustained presence (visitCount ≥ 2) on a near-water margin land tile (water within 2 tiles, bounded
  depth-2 BFS) INFERS the existence of the next reachable near-water LAND tiles (the around-lake
  corridor), one bounded ring/season (cap 2, hard cap 256/band), id-ordered, from its own band-known
  margin tiles — tick-gated in `applyFrontierOpportunityContext` after frontierResidence. Each inferred
  record stores ONLY existence + near-water topology + provenance + low confidence (0.2) — NO
  richness/yield/water of any kind (`noOmniscientRichness:true`); never crosses open water; never
  directed toward a hidden target; reset on fission (`DAUGHTER_NON_CLONEABLE_FIELDS`). **Decision-INERT:**
  nothing in scoring reads it → baseline byte-identical (310/8/3, deterministic=true) and scale-audit
  retention identical to M0.5 (maintain25=1, persist=0.03, loop=0.67, sat=6, maxD=21). Knowledge-expansion
  audit (Task 1) found the gap: known world grows only by 2-ring move-observation + re-scouts of
  already-known patches; the around-lake corridor is never traversed; the M0.5 target `tile:53:67` is
  itself aquatic and the shore is fragmented (strict shore-adjacency K1 = 3-tile dead-end pocket;
  near-water margin K2 = one connected 906-tile corridor). Extended `--targeted-lake-opportunity-audit`:
  approach tile `tile:53:68` becomes inferred by ~year 14 (`band:dry-margin-foragers`, origin
  `tile:52:68`→`tile:53:68`), `closestKnownTileDistanceToTarget` 1, outcome
  `approach_tile_became_known_target_pending`, `passed=true`; exact target stays un-inferred by design
  (aquatic, land-only inference). Honest remaining blocker (primary root cause now
  `known_unused_opportunity_does_not_surface_it`): inferred existence is decision-inert and richness-free,
  so it does NOT surface as an opportunity (needs a real visit). Review applied one report-only
  correction: the lake audit now exposes target `isAquatic`/passability and requires passable adjacent
  approach tiles. Checks: build + both typechecks green; baseline determinism; scale + lake
  (deterministic, 2 runs identical) + dispersal + dispersal-lineage + scout-regression + plant
  patch/lifecycle/eligibility/use-test all passed; `--all --fast` 24/24; static guards clean; perf
  100/200/300y 11.3/39.1/106.6s in review; graph 164/402 (+1 node `frontierKnowledge`, +4 links).
  Scope honored:
  no omniscient richness, no rich-tile migration, no forced daughters, no global attachment weakening,
  no yield/stress/mortality/carrying-capacity/plant/cause change, no camps/settlements, no
  Math.random/any/UI in src/sim.

- **M0.5** — Frontier Retention Refinement + Opposite-Shore Reachability Audit — *Implemented
  2026-06-04, awaiting review.* **Part A:** replaced M0.4's force-magnitude retention (additive
  stay-hold 2.4 / inward-damp 3.0) with a principled `frontierResidenceOriginPullRelief` — a
  MULTIPLICATIVE discount (≤1, floored 0.15) of an established frontier daughter's ORIGIN-WARD memory
  pull (attachment / return-place / inherited familiarity / familiar corridor / inward known
  opportunity) for INWARD candidates only; it scales an existing pull DOWN, never adds, leaving her
  frontier-locus attachment untouched. Kept a small stay-hold (0.3) + reduced residual inward-damp
  (0.8) to bridge the legitimate band-known confidence/food gap a young frontier cannot yet overcome
  (the return-pull audit showed pure relief → maintain25=0, because the interior is genuinely
  better-observed). Result: `maintain25` 1 (>0), `frontierPersistenceScore` 0.03 (>0), longest hold
  28y, reach maxD 21; clustering IMPROVED (localLoopScore 0.73→0.67, satellites 7→6) at ~4× lower
  force; baseline byte-identical (310/8/3, parents unaffected); not trapped (de-establishes on
  collapse). **Part B (audit only):** new `--targeted-lake-opportunity-audit` picks the rich
  opposite-shore patch (deterministically tile:53:67, river_valley/marsh, truth-richness 0.99) and
  classifies why no band reaches it: **`truth_overlay_only_unknown_to_band`** — no band ever observes
  it (closest 12 tiles, lake blocks approach), so it never becomes a known opportunity / fission
  candidate; an around-lake land path exists (1.17× detour, NOT terrain-unreachable) but no band has a
  knowledge-driven reason to explore it (no crossing/shore memory; local home nearly as rich). The
  anti-omniscient design working as intended → no behaviour fix applied. No yield/stress/mortality/CC/
  plant change, no Math.random, no `any`, no UI in `src/sim`. Build + both typechecks + baseline
  determinism + scale/lake/M0/M0.1 audits + scout/plant suites + 24/24 sweep + static guards green;
  perf ~7.7/27.5/76s; graph 163/398 (summary edit only).
- **M0.4** — Frontier Retention via Emergent Band-Known Frontier Value — *Implemented 2026-06-04;
  **ACCEPTED 2026-06-04 (review confirmed) — retention validated, weight-magnitude flagged.*** Review
  verified anti-omniscience, daughter-only gating (baseline byte-identical), reversibility, real
  retention (maintain25 0→3, persist 0→0.12, holds 38–50y), determinism, no destabilization; and
  empirically that daughters are NOT frozen (forage freely, 543 moves vs 21 stays) nor trapped (0/6
  established snapshots at a declining/water-poor locus — de-establishment valve works). Flagged risk:
  the weights (2.4/3.0) are force-magnitude (NOT tie-breakers) — the −2.4 inward-damp dominates the
  inward-retreat decision, so retention is force-dependent (collapses below ~1.2) and chaotic; safety
  comes from the gating, not from the terms being small. Report-only correction applied: the
  `bandDecision.ts` residence comment now states the force-magnitude reality (was "never overrides
  cost/refuge/stress"). M0.5 (=M0.4-A) should replace the strong additive hold/damp with a principled
  multiplicative reduction of the inward return-pull. Second M0.x behaviour fix; resolves the M0.3
  retention gap. Return-pull audit found
  the cause was OSCILLATION (daughters spend 20+ cumulative / 15.25 consecutive years outside the
  origin radius but step back across it toward a better-known interior). New pure
  `src/sim/agents/frontierResidence.ts`: a frontier DAUGHTER earns a bounded (≤0.8), decaying,
  anti-omniscient `FrontierResidenceValue` at a locus she pushed out to (reach measured from the
  lineage origin, walked up the parent chain), from band-known local experience only (local return
  trend, water/refuge confirmation, known opportunity, corridor memory, her own formed attachment;
  `noOmniscientRichness=true`). Used in two seams once `established`: a stay-hold beyond the origin
  radius and an INWARD-only retreat damp (never an outward push → cannot reach for unsafe outer tiles).
  Never inherited (reset on fission; in `DAUGHTER_NON_CLONEABLE_FIELDS`); self-limiting to
  good-water/good-return loci (cannot trade away safety) and reversible (decays to undefined → poor
  frontier still abandoned). Parents (no parentBandId) never qualify. Result: scale audit
  `improved_reach_without_retention` → **`map_scale_expansion`**, `daughtersMaintainNewRange25Years`
  0→3, `frontierPersistenceScore` 0→0.12, longest hold 15.25y→50.5y, reach preserved (maxD 27),
  localLoopScore 0.80→0.73. **Known risk:** the two scoring weights (stay-hold 2.4, inward-damp 3.0)
  have a non-monotonic/chaotic response and are larger than a typical tie-breaker (confined by the
  gating; baseline byte-identical 310/8/3). No yield/stress/mortality/carrying-capacity/plant change,
  no Math.random, no `any`, no UI in `src/sim`. Build + both typechecks + baseline determinism (310/8/3,
  matched) + audit determinism + M0/M0.1 audits + scout/plant-use/cause-stress suites + 24/24 sweep +
  static guards green; perf 100/200/300y ~7.7/27/75s; graph **163/398**, 0 dup, 0 dangling.
- **M0.3** — Bounded Frontier Intent / Known-Corridor Persistence v0 — *Implemented 2026-06-03;
  **ACCEPTED 2026-06-04 (review confirmed), retention UNRESOLVED.*** Review confirmed anti-omniscience
  (31 intent snapshots, all band-known sourced, `noOmniscientRichness=true`), tie-breaker bounding
  (strength≤0.85, age≤20y, drift never on stay, fission alignment relaxes not inverts the distance
  penalty), determinism (310/8/3 byte-identical), and 24/24 macro stability. Applied one report-only
  classifier fix (no sim behaviour, `passed` unaffected): the audit overstated a one-time max-distance
  crossing as `sustained_frontier_range` while `maintained25Years=0`; now gated on real retention, and
  the reach-only result is honestly **`improved_reach_without_retention`**. First M0.x behaviour fix.
  New pure `src/sim/agents/frontierIntent.ts`: a
  persistent, decaying, anti-omniscient `FrontierIntentState` advanced once/season (tick-gated) in
  `applyFrontierOpportunityContext`, from band-known evidence only (corridor memory, repeated probes,
  known-unused opportunity, crowding/saturation, poor returns, daughter pressure;
  `noOmniscientRichness=true`). Used narrowly in 3 seams: daughter/fission target scoring (bias
  targets along a known corridor), logistical-probe/move scoring (bounded outward drift pull + mild
  backtrack penalty + arrival stay-hold, tie-breaker inside the clamped score), and the
  cross-generation ratchet. Frontier daughters inherit a DEGRADED (not hard-locked) intent; registered
  in `DAUGHTER_NON_CLONEABLE_FIELDS`. Capped strength ≤0.85, ~20y age cap, fully reversible. Result:
  scale audit `corridor_probe_without_frontier` → **`improved_reach_without_retention`** (reach up,
  retention flat), max lineage distance 10→19, distinct clusters up to 8; localLoopScore 0.81→0.80.
  **Limitation:** strict 25-year retention
  (`frontierPersistenceScore`) still 0 — documented; deferred to M0.4 (let the frontier earn band-known
  value, no forcing). No yield/stress/mortality/carrying-capacity/plant/cause change, no Math.random,
  no `any`, no UI imports in `src/sim`. Build + baseline determinism (310/8/3, matched) + audit
  determinism + M0/M0.1 audits + 5 targeted suites + 24/24 sweep + static guards green; graph
  **162/391**, 0 dup ids, 0 dangling.
- **M0.2** — Scale-Aware Frontier Drift / Local-Clustering Audit — *Audit complete
  2026-06-03.* Added `--targeted-frontier-drift-scale-audit` (benchmark/report only): normal
  regional map, 200 years, all root lineages/descendants, checkpoints 0/25/50/100/150/200, strict
  scale-aware metrics and examples. Result: 16 fissions and corridor contact occur, but final
  max/median/p90 distance from lineage origin is only 10/5/10; all 21 active bands remain within
  10 tiles of origin; no daughter maintains a frontier range for 25+ years; classification
  `corridor_probe_without_frontier`. Root cause: corridor/probe/known-opportunity evidence is
  not converted into sustained frontier intent; daughter targets and known opportunities are too
  local for map scale. M0/M0.1 thresholds were too lenient. No behavior fix applied.
- **M0.1** — Long-Run Daughter Lineage / Tile-Path Dispersal Audit — *Audit complete
  2026-06-03.* Added `--targeted-dispersal-lineage-audit` (benchmark/report only): tracks parent
  and daughter tile paths at years 0/10/25/50/75/100/150, including fission tick/year, parent tile,
  daughter spawn, distances from parent/original refuge, net/max displacement, corridor contact,
  known-vs-truth richer corridor visibility, latest action/reason, opportunity, saturation, and
  exhausted-range state. Direct M0 fixture and one-founder variant both classify
  `parent_stays_daughter_expands`: parent remains at `tile:39:60`, fission daughter reaches
  `tile:40:54` by year 10 and remains 7 tiles from parent/original refuge through year 150, with
  max distance 9 and corridor contact. No behavior fix applied; next architecture question is
  natural one-origin world expansion/frontier drift, not rich-tile migration.
- **M0** — River-Corridor / Daughter Dispersal Root-Cause Audit — *Audit complete
  2026-06-03.* Added `--targeted-dispersal-audit` (benchmark/report only): bounded selected-band
  diagnostics for known vs unknown corridor richness, attachment/refuge, range saturation,
  known-unused opportunity, probes/scouts, daughter/fission gates, corridor memory, and decision
  winners. Targeted audit did **not** reproduce an over-sticky failure: parent stayed at refuge but
  repeated logistical probes, viable known opportunity, `seek_new_range` daughter pressure, and one
  real fission event occurred. No behavior fix applied; do-not-fix-by-richness rule preserved.
  Build, baseline determinism, targeted suites, fast sweep, static guards, graph integrity green.
- **2K.2E** — Cautious Plant Use / Testing Event v0 — *Accepted* (review 2026-06-01). Post-scout
  bounded plant-test events; knowledge/debug only; no coupling; graph 161/371; all suites green.
- **2K.3A** — Cause-Specific Stress / Nonlethal Illness-Poisoning Event Scaffold v0 — *Accepted
  2026-06-01.* New `causeSpecificEvent.ts`; bounded nonlethal events from risk-relevant
  plant-use/tests; conservative caution memory + capped(6) ring; daughters reset + clone-guarded;
  NO mortality/population/stress/yield/CC/relocation/fission, no random poisoning; graph 161/379.
- **2K.3B** — Cause-Labelled Nonlethal Stress Readiness — *Accepted 2026-06-02.* New pure
  `causeStressReadiness.ts`: derives future stress-domain labels + band aggregate from the
  existing cause-event ring (NO new band state); `appliedToActualStress=false`; no
  stress/mortality/population/yield/CC/relocation coupling; no random poisoning; no disease.
  Review confirmed the module is **not imported anywhere in `src/sim`** (UI + benchmark only) so
  coupling is structurally impossible; `--targeted-cause-stress-readiness-check` 8/8; graph
  161/382 (+3 futureHook, existing nodes); build green; determinism + macro byte-identical.
- **2K.3D** — First Bounded Cause-Attributed Nonlethal Stress Increment — *Accepted
  2026-06-02 (review confirmed).* New pure `causeStressIncrement.ts`
  (`deriveCauseStressContributionV0`/`summarizeCauseStressContributionV0`): feature-flagged
  (default OFF), tiny/capped (event 0.04, band 0.08), cause-labelled stress contribution for
  food_safety/processing_uncertainty only; reported SEPARATELY as `causeStressContributionV0`,
  derived-only (no band state), NEVER written to pressureState → flag on/off macro byte-identical,
  fully reversible/stateless. New `--targeted-cause-stress-increment` (6/6); live check reports it
  OFF→0 / ON→0.009 with identical macro (5/142/0/0). No mortality/population/yield/CC/relocation/
  fission coupling; no random poisoning; no disease. Full sweep probe audit: 24/24 complete,
  `cause=0`, `residenceMoved=0`, readiness applied 0. Graph 161/382 (summary edits only). Build +
  all suites + sweep + determinism green. 2K.3E must wait for architect approval.
- **2K.3C-A** — Autonomous Live Risky-Scout Trigger v0 — *Accepted 2026-06-02 (review confirmed
  urgency is scout/information-only, bounded, stress-gated, provably inert — 0 medicinal scouts /
  byte-identical macro; live tick-loop integration; no coupling; determinism; graph 161/382).*
  New deterministic `risky_plant_scout_live` scenario + `--targeted-live-risky-scout`
  regression: a crowded/food-stressed water-anchored band AUTONOMOUSLY chooses a `medicinal_toxic`
  resource_scout in the real tick loop → live `safety_uncertain` → `suspected_safety_risk` test →
  `suspected_toxicity` CauseSpecificEvent → `food_safety` CauseStressReadiness, residence unchanged,
  no coupling, 8/8 assertions, byte-identical determinism. ONE bounded, stress-gated, inert
  medicinal SCOUT-urgency change in `resourceScout.ts` (information only; sweep macro byte-identical;
  baseline determinism intact). No new modules/state/graph nodes; graph 161/382; build + all suites
  green.
- **2K.3C** — Natural Risk Scenario Library / Coverage Before Real Stress — *Accepted
  2026-06-02 (review confirmed B/C perception depth, no coupling, guard correct, determinism,
  graph 161/382, live cause=0).* New `--targeted-natural-risk-scenarios` regression: 5 cases
  (medicinal→food_safety, processing→processing_uncertainty NOT poisoning, fallback→illness_suspicion
  no calories, repeated caution→2K.3A-A guard, water_safety readiness placeholder); cases B/C run
  the full world-tile-truth→scout-perception→memory→eligibility→test→cause→readiness chain. 14/14
  assertions, byte-identical determinism, full audit block, all no-coupling flags. No new sim
  code/state/graph nodes (summaries only); graph 161/382. Live sweeps still fire 0 cause events
  (documented gap: autonomous risky-scout decision not yet exercised). Build green; all prior
  targeted suites + baseline determinism green; macro unchanged.
- **2K.3A-A** — Risk Memory Retention Guard + Natural-Risk Coverage — *Implemented 2026-06-01,
  awaiting review.* Guard discounts opportunity (×0.2) for durable-risk patches while keeping
  retention (architect decision: retention OK, attractiveness not); processing-only fallback
  caution relabeled `processing_problem_suspected` (no poisoning flag); new
  `--targeted-cause-coverage-check` runs the real eligibility→test→cause→ring chain + guard
  proof; band report `riskRetentionAudit`. Guard inert for natural runs (macro/determinism
  unchanged). No graph change.
- **LIVING-ECOLOGY-A** — Canonical Living Ecology Food Pipeline — *PASS 2026-07-11.*
  Physical plant/fauna/aquatic harvest receipts now exclusively feed the human food
  ledger; absent/exhausted/inaccessible resources yield zero, physical depletion is
  exact, generic catchment/learned/AG11 food is excluded, Technical exposes source
  proof, and deterministic absence/no-double-count audits pass. Default-world food
  calibration is deliberately deferred; the current honest 500y run goes extinct.
- **ECO-TROPHIC-1** — Living Ecology / Trophic Coupling verification + ledger unit
  reconciliation — *PROGRESS 2026-07-11 (gate NOT passed → continue as
  LIVING ECOLOGY / TROPHIC COUPLING-1B).*
  Verified LIVING-ECOLOGY-A on commit `855434c` (clean tree; Phase-A audit 20/20 PASS;
  plant/fauna/aquatic depletion, absence→zero, anti-omniscient views, determinism all
  confirmed in code). Corrected the handoff's own scope note: the Phase-A commit is far
  more complete than "foundation only" — aquatic (fish/shellfish/waterfowl/seasonal-run
  stocks via faunaStock `resolveFaunaFoodHarvest`), toxicity→sickness (plant safetyRisk →
  acuteRisk `plant_poisoning`/`spoiled_food` → demography), animal-danger→injury
  (`animal_encounter_injury` bounded by practiced hunting relief), transport+processing
  losses (real, distance/laborCost-driven), and differentiated fauna routines
  (migration/wariness/reproductiveCondition/campProximity) are ALL already wired. The two
  genuinely-unbuilt trophic gaps are **predator–prey** (scope-locked at faunaStock.ts:31,
  no predator kind exists) and **dynamic herbivore–forage** feedback (forage only sets a
  static carrying ceiling; `advanceFaunaStocks` recovery ignores plant-patch depletion).
  **Extinction diagnosis (corrected):** the default worlds go fully extinct (map1/baseline
  155→0 by ~y200; map2 similar) but the ecology substrate is HEALTHY (260 fauna stocks,
  157 plant patches, mean depletion 0.13) — this is a coupling/behavior problem, not
  scarcity. Root finding: the ledger's `totalUsableSupport` (harvest-fraction units,
  per-trip ≤0.5) was never reconciled with `adultEquivalentDemand` (~25 persons), so
  rawSupportRatio was pinned at ~0.006 and perCapitaReturn read garbage. Fixed via an
  explicit, documented `HARVEST_TO_SUPPORT_SCALE=100` in humanFoodSupport.ts (multiplies
  REAL receipts only; absence still →0; surfaced as `harvestToSupportScale`/
  `rawUsableHarvest` on the ledger; Phase-A audit still 20/20 PASS; determinism/build/
  typecheck/graph 207-726-0-0 all green). **BUT** this is a ledger-signal fix, NOT a
  survival fix: the baseline benchmark is byte-identical at scale ∈ {1,100,1000}, proving
  survival is currently near-insensitive to the ledger. The binding decline drivers are
  the ledger-independent `foodEstimate`/foraging/hunger terms in pressure.ts and the
  ~99.7%-move perpetual-flight pattern (2 stays / 1755 moves / 0 fissions per baseline
  run). **1B must:** (1) close the §3 chain so demography meaningfully tracks the ledger;
  (2) calm the movement/trip-success death-spiral (only ~10-30% of food trips return any
  usable support); (3) build predator–prey + dynamic herbivore–forage coupling;
  (4) run the full no-human / normal / heavy-pressure / absence calibration across all 3
  default worlds. Deferred-but-mapped: the `*_placeholder` return-kind rename (8 files;
  hazard = three load-bearing `.endsWith("_placeholder")` guards at intraSeasonTrips.ts:232
  & :1206 and foragingAdaptation.ts:470 — convert to an explicit membership set) and dead
  exports (`applyPlantGatherDepletion`, `summarizeFaunaStocks`,
  `applyActivityOutcomeToMemoryForAudit`). `hardshipOutcome` bug left isolated/unfixed.
- **LIVING ECOLOGY / TROPHIC COUPLING-1B** — canonical consumer + aggregate food web
  — *integration complete; final gate verification in progress 2026-07-12.*
  Takeover ancestry was verified (`855434c` and `7d528eb` are ancestors of the clean
  starting HEAD). The reported disconnect reproduced exactly: the reconstructed baseline
  omitted daily trips, Map 1 reached 155→0, and 1755/1760 archived choices were moves.
  Root causes were (a) pressure.ts rebuilt current hunger from remembered opportunity,
  generic foraging pressure and a never-updated spawn `hungerPressure`; (b)
  seasonalSurvival fed that stale behavioral stress back into nutritional history; (c)
  demography counted the same deficit through several legacy paths; (d) `target_found`
  trips were observation-only; and (e) the instrumented default benchmark never executed
  the production daily-activity interval, so harvest scale changes could not affect it.

  The authoritative path is now: physical trip receipt → `humanFoodSupport` (raw receipt,
  recorded losses, explicit ×100 adult-equivalent-season conversion) → bounded 8-season
  support history → canonical current/recent/chronic nutrition → separate food movement
  and food demographic contributions → decisions and demography. `foodEstimate`, habitat
  yield and trip projections remain future-opportunity knowledge only. The legacy
  `hungerPressure` field is a compatibility mirror of canonical nutrition and has no
  independent behavioral reader. Controlled raw receipt levels 0/0.12/0.25/0.40 produced
  ratios 0/0.56/1.16/1.86, food movement pressure 1/0.67/0/0, food mortality
  0.64/0.55/0/0, and fertility 0/0/0.40/0.40; water and injury perturbations remained
  independently causal. Scale sensitivity 80/100/120 gives 20/25/30 support for 0.25 raw
  receipt against demand 25. Scale remains **100**; zero remains exactly zero.

  Seasonal order is explicit: trips operate during interval N at the current residence;
  boundary N+1 derives ledger/history, then pressure and the residential choice, then
  demography, then physical ecology advances. Thus completed work informs the boundary
  choice without a retroactive same-choice trip; ledger source tick N is audited against
  decision tick N+1. Default benchmark baseline/Map2 paths now run this same activity
  interval; targeted historical fixtures retain their explicitly reconstructed semantics.

  Movement no longer gets blanket relief credit: candidate move pressure is proportional
  to known water/food/recovery improvement; current-camp depletion no longer includes
  global move pressure; relocation pays fatigue, hardship, dependent-care and camp
  re-establishment cost; whole-band moves must clear the stay alternative by that grounded
  cost; and successful food/water camps can complete corridor intents and return to local
  foraging. Chronic real deficit can still drive repeated flight. Activity `target_found`
  now requests bounded physical harvest, successful memory requires a nonzero receipt, and
  all three food return placeholders were replaced by typed membership
  (`physicalFoodReturn.ts`). The dead `applyPlantGatherDepletion` path was removed.

  Aggregate trophic coupling is physical and bounded. Herbivore/omnivore stocks submit
  sorted local claims (≤13 tiles, ≤6 patches) against `plantPatchState`; consumption writes
  the same depletion human gathering uses, forage deficit lowers condition/abundance and
  raises relocation pressure, and reduced pressure permits recovery. Four default-world
  predator stocks per map rank ≤6 compatible local prey stocks, remove actual prey, and
  derive condition/reproduction/relocation from prey receipts; zero prey drives decline.
  Predator signs now require real predator/prey overlap. No individual agents or all-pairs
  scans were introduced. Map 1/Map 2 no-human y100 remain distinct and bounded (264 stocks
  each; mean abundance 0.842/0.849; forage ratio 0.990/0.994; mean plant depletion
  0.257/0.262). Seasonal-run taxonomy exists but neither actual default instantiates it;
  fish/shellfish/waterfowl receipts are genuinely stock-backed and aquatic absence is zero.

  There are **two** populated actual default worlds (`map1`, `map2`), not three;
  `map2_single_origin` is a derivative scenario and procedural has no default bands.
  Production Map 2 retains 3 lineages / 30 people at y100 after starting at 238 while
  harsh bands may collapse; final deterministic/default/graph/regression verification and
  the PASS-vs-1C decision remain to be recorded. `hardshipOutcome` remains isolated and
  untouched.

- **LIVING ECOLOGY / TROPHIC COUPLING-1B — FINAL VERIFICATION (Opus takeover, 2026-07-12)
  — VERDICT: FAIL → recommend 1C.** The interrupted dirty tree was recovered intact
  (HEAD `7d528eb`; `855434c` ancestor; emergency patch + untracked manifest saved to
  /tmp; no orphan benchmark/Vite process). The CORE checkpoint is sound and independently
  re-verified: the canonical physical-receipt → `humanFoodSupport` (×100 adult-equivalent,
  documented) → bounded 8-season history → canonical food stress → food movement +
  explicit food mortality/fertility contributions → decisions/demography chain is the sole
  current-nourishment authority; every legacy driver (foodEstimate/getKnownFoodEstimate,
  perCapitaShortfall, seasonal deficitRatio, `hungerPressure`) is removed as a behavioral
  reader (`hungerPressure` is now a recomputed compatibility mirror only). Controlled
  perturbations 0/0.12/0.25/0.40 → ratio 0/0.56/1.16/1.86, food-mortality 0.64/0.55/0/0
  (monotone), fertility 0/0/0.4/0.4; water/injury independently causal; scale 80/100/120 →
  20/25/30, zero stays zero. A new focused audit (`livingEcologyTrophicCoupling1bFocused
  Audit.mjs`, 16 checks + determinism) proves: target_found harvest is bounded by the real
  stock (estimate/×0.55 cannot manufacture food; depletion = real draw; absent/exhausted →
  0), outcome learning reads the RESOLVED ACTUAL receipt (86/216 zero-actual trips recorded
  as `none`), predators are never harvestable by generic hunting, and heavy overhunting →
  reserve 0.08 → trophic collapse below reserve → recovery after abandonment. Long-run
  gate MET and food-stratified: Map2 238→31 (3 survivors = the 3 best-supported; supp<1.0
  all collapse from starvation), Map1 155→36; observer parity byte-identical; determinism
  holds. §10 forage-class compatibility was ADDED (grazers cannot root USOs; omnivores can;
  verified non-destabilizing) and the plant-stock audit crash (Codex removed
  `applyPlantGatherDepletion` but the fixture still called it) was fixed to use the real
  harvest resolver.

  BLOCKING 1C ITEMS (regressions the 1B work introduced — each PASSES at `7d528eb` and
  FAILS on this tree; independent of the Opus §10/§6 additions, confirmed by re-running the
  Codex-only patch):
  (1) `--targeted-fauna-stocks-audit`: **`hiddenKnowledgeViolations` 0 → 208** — a BINDING
      anti-omniscience violation (animal/aquatic trip-trace / patch-memory source
      classification); MUST be root-caused (likely the target_found physical-harvest path).
  (2) `--targeted-routines-2-check`: `live_management_loop_activates` FALSE — the animal
      management (proto-domestication) loop no longer fires over a 30y baseline; a real
      cross-system behavioral regression.
  (3) `--targeted-causal-agency-check`: `hardship_gate_inert_for_comfortable_band` and
      `scenario_stay_bias_erodes_in_real_decision` FALSE — `chronicHardship` now reads
      `deriveCanonicalNutritionState(seasonalSupport)`, whose undefined default is a severe
      0.7; the comfortable fixtures carry no `seasonalSupport`, so they read as stressed.
      Reconcile the fixtures AND reconsider the aggressive undefined-nutrition default
      (affects real first-season bands).
  (4) `--targeted-fauna-stock-audit`: `boundedCount` (264 > stale 260 after 4 predators/map)
      and `flooredAtOrAbove` (0.18 floor intentionally removed per §12) and `recovered` —
      stale expectations from intentional changes; update to the new correct behavior.
  TS (both configs), production build, architecture graph (207/728, 0 dup/dangling),
  deterministic benchmark, and the food/plant-patch/eligibility/anti-omniscience(resource)/
  movement/passability/invention/shared-catchment audits are green. faunaAdvance ≈14 ms/tick;
  state bounded (264 fauna, ~1200 plant records). `hardshipOutcome` left isolated/untouched.
  Recommendation: **LIVING ECOLOGY / TROPHIC COUPLING-1C** — do not proceed to expeditions.
