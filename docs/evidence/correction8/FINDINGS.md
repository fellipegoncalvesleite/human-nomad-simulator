# CORRECTION-8 — the 97% same-day failure gate, found and corrected

All numbers below are MEASURED FACTS from preserved runs in this directory.
Nothing here is a hypothesis presented as a cause.

## A. The diagnostic that found the gate — and the counting error it corrected first

`scripts/sameDayFailureGateProbe.mjs` assigns EXACTLY ONE terminal classification to
every attempted same-day trip, reading only fields the production path already writes
(`activityOutcomeReasonIds`, `physicalFoodHarvest.failureReason`, `pathTiles`,
`resourceReturn`). **No production code was modified to measure.** The hidden
`physicalAvailability` is read for AUDIT only and never re-enters a decision.

Its FIRST run (`gate_baseline.json`) was WRONG and is preserved as such. It filtered to
trips with a `physicalFoodHarvest` record and so counted only 406 ordinary trips over 160
seasons (2.5/season) — but CORRECTION-7 measured 24 trips/season. That filter silently
discarded ~90% of the population and reported a false ordinary productive rate of 27.1%.
Counting ALL trips (`gate_all_trips.json`) reproduced CORRECTION-7's figure exactly:
110 productive / 3840 attempted = **2.86%** (CORRECTION-7 independently: 2.9%). Two
probes built from different fields agreeing to 0.04pp is what makes the population the
right one. The lesson is the same as CORRECTION-7's withdrawn "184 repeats": a probe's
own filter is a hypothesis and must be validated against an independent count.

## B. MEASURED FACT 1 — the gate is not in the harvest path at all

Terminal distribution, 160 seasons, map2, identical scored sites (`gate_all_trips.json`):

| case | trips/season | never reached the physical resolver | dominant cause | productive |
|---|---:|---:|---|---:|
| rich | 23.0 | **1 trip in 160 seasons (0.03%)** | — | 39.22% |
| ordinary | 24.0 | **3434 (89.43%)** | `water_check` | 2.86% |
| marginal | 22.2 | **3222 (90.66%)** | `water_check` | 0.70% |

Every one of those non-physical trips was `cause=water_check`,
`resourceClassId=water_resource`. The ~97% of ordinary trips returning no food were, in
the main, **never food trips**. A band selects ONE candidate per day, so each water_check
consumed the entire subsistence day. This was never a harvest-yield, confidence,
depletion, or scarcity defect — food trips were not being SELECTED.

This also explains CORRECTION-7's §C superlinearity without any yield curve: habitat
quality did not scale the food per trip, it scaled how many days were left to forage at
all. CORRECTION-7 §F correctly predicted a binary success gate rather than a yield defect.

## C. MEASURED FACT 2 — the trigger cannot be satisfied by the action it triggers

`waterCheckLoopProbe.mjs` → `water_loop.json`:

| case | home tile waterAccess | waterStress over 160 seasons | trigger (>=0.32) | water_checks | foodStress |
|---|---:|---|---|---:|---:|
| rich | 1.000 | 0.01 – 0.05 | never met | 0 | 0.07 |
| ordinary | 0.156 | 0.35 – 0.52 | **never released** | 3434 | pinned 1.0 |
| marginal | 0.000 | 0.45 – 0.71 | **never released** | 3222 | pinned 1.0 |

`waterStress` (`pressure.ts:209`) is `(1-waterAccess)*0.52 + waterPressure*0.38 +
leanSeasonStress*0.45 + seasonalWaterStress*0.18 + acuteStress*0.18 - forestShelter*0.02
- waterWorksRelief`. **It contains no term for water actually fetched.** A water_check
returns `returned_with_information`, creates nothing physical, and never reaches the
harvest resolver. So the condition is a function of the tile, not of the band's action:
below ~0.6 waterAccess it is permanently true, and `getTripCause` evaluated it ahead of
every food cause.

MEASURED FACT 3: the checks were not even informative. Ordinary re-checked **9 distinct
tiles, the top one 1073 times, at mean return confidence 0.76** — a source it already
knew well — while its foodStress sat pinned at the 1.0 maximum from season 8 onward.

CLASSIFICATION (against the eight offered): this is **(4) a defective threshold** —
specifically an unsatisfiable trigger — compounded by **(7) a mismatch between candidate
selection and execution**, an information action holding a subsistence slot it can never
release. It is NOT (1) physical scarcity, NOT (2) correct anti-omniscience, and NOT (3) a
unit/scale mismatch.

## D. The production change (one predicate, `intraSeasonTrips.ts` `getTripCause`)

An information action now fires only when it can actually produce information — when the
band's OWN knowledge of that water source is deficient:

```
waterKnowledgeDeficient = effective.isDormant
  || effective.effectivePresenceConfidence < OBSERVATION_CONFIDENCE_THRESHOLD  // 0.42
```

Band knowledge only; no hidden state is read. `OBSERVATION_CONFIDENCE_THRESHOLD` is the
existing constant already meaning "the band knows this place" — no new number was
invented. A genuinely unknown, stale, or dormant water source still preempts food exactly
as before, so real water emergencies are unaffected. Nothing global was raised: ecology,
harvest yield, fertility, stamina, carrying capacity, and adaptation speed are untouched.

## E. MEASURED RESULT — receipts (`gate_after_fix.json`)

| case | units/season before | after | ×  | % of break-even (0.1875) | non-physical trips |
|---|---:|---:|---:|---:|---|
| rich | 0.3099 | **0.3099** | 1.00 | 165% | 0.0% → 0.0% |
| ordinary | 0.0157 | **0.0642** | 4.09 | 8% → **34%** | 89.4% → 3.4% |
| marginal | 0.0019 | **0.0113** | 5.95 | 1% → **6%** | 90.7% → 0.6% |

Rich is byte-identical (0.3099 → 0.3099), which is the control: the fix cannot fire where
waterStress never crossed the trigger, and it didn't.

## F. MEASURED RESULT — demography (`habitat_after_fix.json`, 100y production runs)

`scripts/expeditionHabitatCasesAudit.mjs` — **verdict PASS**, all 11 checks true.

| case | corr-7 outcome | corr-8 outcome | receipt units |
|---|---|---|---:|
| rich | 23, fragile | **23, fragile** (unchanged) | 134.02 → 134.0164 |
| ordinary | **extinct y90** | **survives 100y, pop 11, fragile** | 8.29 → 27.56 |
| marginal | extinct y70 | extinct y70 | 0.72 → 2.97 |

Ordinary crossing from extinction to century-long persistence is the acceptance-relevant
change. `extinctionRemainsPossible` still holds — marginal (stock 2.1, waterAccess 0.0)
still dies, which is correct: that ground is genuinely sub-replacement and no fix should
rescue it.

## G. The newly exposed gate — measured, classified, NOT fixed

Post-fix ordinary distribution (`gate_after_fix.json`):

| class | ordinary | rich | reading |
|---|---:|---:|---|
| `depleted_below_threshold` | 38.74% | 41.15% | **legitimate.** Ordinary's share now matches rich's; this is honest depletion, not a defect. |
| `route_time_infeasible` | 18.11% | **0%** | selection/execution mismatch — see below |
| `activity_ineligible_despite_stock` | 17.56% | 8.48% | stock present, take refused |
| `productive_harvest` | 15.16% | 39.22% | — |

`route_time_infeasible` arises because candidate selection uses `getGridDistance`
(straight line, `intraSeasonTrips.ts:527`) while execution requires an actual passable
path within `MAX_TRIP_DISTANCE_TILES=10` (`buildOutboundPathTiles` → `findPassablePath`).
In fragmented terrain a same-day-feasible straight-line target has no passable route, the
party never arrives, and the day is spent. Rich's open terrain never hits it. This is
**category (7)**, the same family as the corrected gate.

It is deliberately NOT fixed in this checkpoint, and that is a bounded claim, not a
completion: ordinary at 34% of break-even still declines 22 → 11 over a century. Fixing it
means making candidate selection route-aware, which changes what bands consider reachable
across every habitat and every trip family — too large to bundle behind the same
acceptance evidence as a one-predicate change, and it would confound attribution for the
water fix measured above. It is the recommended CORRECTION-9 entry point.

## H. Bounded multi-seed viability matrix (`matrix_seed{2,3,4}.json`)

Seed varies `runSeed` only; site scoring is identical so the same physical habitats are
compared across seeds. 40y, map2.

| seed | rich (% break-even) | ordinary | marginal | ordinary non-physical trips |
|---|---:|---:|---:|---:|
| base | 165% | 34% | 6% | 3.4% |
| 2 | 168% | 44% | 14% | 4.5% |
| 3 | 155% | 42% | 12% | 3.4% |
| 4 | 162% | 35% | 11% | 3.4% |

The ordering is stable and the conclusion is seed-independent: rich clears break-even
with margin, ordinary lands consistently in the 34–44% band, marginal stays far below.
The water_check monopoly is eliminated in every seed (89.4% → 0.5–4.5%).

## I. Verification

Executed on this branch, all PASS:

| check | result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean |
| `npm run build` | built |
| `checkGraph.mjs` | graph 215/750, 0 dup, 0 dangling |
| `expeditionHabitatCasesAudit` | PASS (11/11 checks) |
| `livingEcologyFoodPipelineAudit` | PASS |
| `postEcologyReturnKindAudit` | PASS |
| `postEcologyTerminalExtinctionAudit` | PASS |
| `demographicPersistenceAudit` / `demographicLongRunAudit` | PASS |
| `adaptationBoundaryAudit` / `expeditionAdaptationEfficacyAudit` | PASS |
| `contextLifecycleAudit` / `seasonOrderInvarianceAudit` | PASS |
| `expeditionValueGateAudit` / `expeditionTargetResolutionAudit` | PASS |
| `importBoundaryAudit` / `decisionBoundaryAudit` | PASS |

**Determinism (fresh process, `--scenario baseline --years 25 --deterministic`):**
`deterministic=true` in both runs. A structural leaf-by-leaf diff of the two run outputs
found 299 differing leaves and **0 non-timing differences** — every difference is a
wall-clock field (`totalMs`, `averageMsPerTick`, `share`). Canonical state is identical
across fresh processes. `sameDayFailureGateProbe` output is byte-identical across fresh
processes.

**Bounded performance:** 25y baseline at 127–166 ms/tick across the two runs (run-to-run
wall-clock variance only; within the 189/265 ms/tick envelope MOBILITY-5 recorded for
100y runs). The change removes work rather than adding it — one extra confidence read per
water candidate, and ~86% of ordinary trips that previously ran the full water_check path
now take a food path instead.

**Adaptation enabled vs diagnostically disabled:** `expeditionAdaptationEfficacyAudit` and
`adaptationBoundaryAudit` both PASS — the lived-problem → experiment → response →
real-coefficient → efficacy chain still executes through `adaptationBoundary.ts`, and no
disconnected adaptation consumer was exposed by this change. No adaptation consumer
required repair, so none was made.

## J. What this checkpoint does NOT prove

- It does not prove ordinary reaches demographic replacement. It does not: 34% of
  break-even, still declining. It proves ordinary stopped going extinct.
- It does not prove marginal habitat is viable. Measured: it is not, and should not be.
- It does not establish that `route_time_infeasible` is defective rather than honest
  terrain. Measured share and mechanism only; the classification above is from code
  reading, not from a controlled arm.
- The single-net-rate demographic structure and reconciled age cohorts are unchanged.
