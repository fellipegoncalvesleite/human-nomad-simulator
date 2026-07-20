# CORRECTION-7 — measured attribution and the real bottleneck

All numbers below are MEASURED FACTS from preserved runs in this directory.
Each arm has a .meta.txt with command, commit, scenario, seed, duration, exit code.

## A. Four-arm attribution matrix (100y, map2, identical scored sites)
Files: arm_{both_old,trips_old,exp_old,both_new}.json  — all exit 0, all verdict PASS.
Arms swap ONE production file to its corr-3 (0b119f2) content.

| arm | rich units | rich gather | rich final | ord units | marg units |
|---|---|---|---|---|---|
| corr-3 baseline (both old) | 134.92 | 79 | 22 fragile | 8.29 | 3.47 |
| valueGate ONLY (trips old) | 134.42 | 7 | **23 viable** | 8.29 | 0.72 |
| reqMultiDay ONLY (exp old) | 92.20 | 1326 | 21 fragile | 6.41 | 1.35 |
| both (HEAD) | 134.02 | 15 | 23 fragile | 6.23 | 0.72 |

MEASURED FACT 1: the rich regression is caused SOLELY by requireMultiDay
(reqMultiDay ONLY = 1326 launches, 92.20 units, pop 21). The value gate fixes it
(both = 15 launches, 134.02 units, pop 23).
MEASURED FACT 2: valueGate ONLY produced the single best rich outcome (23 VIABLE).
MEASURED FACT 3: **every arm produced IDENTICAL demographic outcomes on ordinary
(extinct y90) and marginal (extinct y70)**, with near-identical population
trajectories. A 4.8x swing in marginal receipts (3.47 -> 0.72 units) changed the
population curve by at most 1 person at one sample point.
CONTROLLED INFERENCE: the ordinary/marginal receipt differences across
CORRECTION-4/5/6 are demographically irrelevant. The "marginal regression" reported
in earlier checkpoints is real in receipts but has NO survival consequence, because
both values are an order of magnitude below break-even. Earlier reports over-weighted it.

## B. Same-day target churn — corrects a false record
File: churn_head.json (40y). Supersedes sameDayRotationProbe.mjs, whose counts were an
ARTIFACT: it re-scanned the rolling recentIntraSeasonTrips buffer (cap 24) each season,
counting each trip many times. Its "184 repeats vs 26 productive" figure was meaningless.
This probe identifies each trip once by (day, targetTileId).

| case | trips/season | distinct targets | consecutive-repeat rate | PRODUCTIVE RATE | units/season |
|---|---|---|---|---|---|
| rich | 22.99 | 16 | 0.013 | **0.392** | 0.3099 |
| ordinary | 24.00 | 19 | 0.005 | **0.029** | 0.0157 |
| marginal | 22.21 | 29 | 0.023 | **0.007** | 0.0019 |

MEASURED FACT 4: target thrashing does NOT exist. Consecutive-repeat rate is 0.5-2.3%
in every habitat. The recorded "184 immediate repeats" claim is WITHDRAWN as a
measurement artifact of my own probe.
MEASURED FACT 5: all three habitats expend the SAME foraging effort (22-24 trips per
season). They differ almost entirely in how often a trip returns food:
rich 39.2%, ordinary 2.9%, marginal 0.7% — a 13.5x spread.

## C. The real bottleneck, quantified
Break-even (measured earlier, preserved): 0.1875 units/season for a 22-person band.
  rich     0.3099 units/season = 165% of break-even  -> survives
  ordinary 0.0157 units/season =   8% of break-even  -> extinct y90
  marginal 0.0019 units/season =   1% of break-even  -> extinct y70

Site plant stock differs 4.8x (rich 35.86 vs ordinary 7.51) but delivered food differs
~20x and trip success differs 13.5x. The mapping from habitat quality to food is
SUPERLINEAR.

UNRESOLVED HYPOTHESIS (code observation, NOT yet measured): CORRECTION-1 recorded, with
file:line evidence, that `naturalAvailability` and `(1 - depletion)` are each applied
TWICE — once in `plantHarvestAvailability` (the ceiling, plantStock.ts:447-452) and again
in `derivePlantGatherReturnFactor` (the request multiplier, plantStock.ts:534-556); the
same doubling exists for fauna (abundance, carryingCapacity, seasonalAvailabilityFactor
at faunaStock.ts:986-987 and :910). It was filed as "secondary — only bites when the
availability ceiling binds, i.e. in poor habitat." The superlinearity measured here is
exactly that signature: harvest ~ x^2 in habitat quality. This is the leading candidate
for the ordinary/marginal viability gap and is the next thing to TEST (not assume).

## D. Production disposition
Both corrections are RETAINED at HEAD:
 - requireMultiDay fixes a genuine architectural defect (the expedition selector's argmax
   ran over all distances, so a near memory made distant candidates unreachable). It is a
   correctness fix, not a tuning choice.
 - the value gate is required to control it and independently improves rich
   (measured: 1326 -> 15 launches, 92.20 -> 134.02 units).
Measured cost of keeping both vs valueGate alone: rich 23 viable -> 23 fragile, same
population. Accepted deliberately and recorded here rather than silently tuned away.
