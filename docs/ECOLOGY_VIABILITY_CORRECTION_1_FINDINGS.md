# ECOLOGY VIABILITY & ADAPTATION CORRECTION-1 — Phase 1 evidence

Base: 51823d2 (expeditionary-5). Branch: checkpoint/ecology-viability-adaptation-correction-1.
NOTE: prompt's ff4d484 / climate branch does not exist; user confirmed CLIMATE-1 was never started.

## H1 — too much physically poor land? PARTIALLY REJECTED (measured)
`scripts/ecologyHabitatProbe.mjs`:
- map1: 16000 tiles, 13399 land, 260 fauna stocks, 59.2% land tiles have plant patches,
  5.7% land has reliable water (>0.55), mean baseRichness 0.305.
- map2: 30800 tiles, 27347 land, 260 fauna stocks, 69.6% land w/ patches,
  3.7% reliable water, mean baseRichness 0.347.
- Plant patches are widespread (59-70% of land). Land is NOT mostly barren.
- REAL DEFECT FOUND: `GLOBAL_STOCK_CAP = 260` is map-size independent
  (`globalCap = min(260, max(8, floor(tileCount/22))*2)`). map1 = 51.5 land tiles/stock,
  map2 = 105.2 land tiles/stock. Map2 (2x bigger) has HALF the fauna density of map1
  for identical terrain. Fauna density is an artifact of map size, not geography.

## H2 — stocks equilibrate too low / drift down? REJECTED (measured)
`scripts/ecologyNoHumanEquilibriumProbe.mjs`, map1, 0 bands, 120y:
- faunaTotal 250.8/260 (mean abundance 0.965), faunaZero = 0, ~198/260 at >=0.99 CC.
- Flat from y6 to y120 (250.76-250.81). Bounded attractor, no drift, no collapse.
- plantMeanDepletion stable ~0.256 (herbivore grazing equilibrium), maxDepletion 0.834.
- => No-human ecology is HEALTHY. Not the cause.
- METHOD NOTE: first probe read `d.stock` (nonexistent) instead of `d.abundance` and
  falsely showed total collapse. Corrected before any conclusion was drawn.

## H3 — compound multiplicative penalties? REJECTED as primary
Per-trip loss stack retains 89.5% (transport ~0.048, processing ~0.06, applied once each,
correctly sequenced). Arithmetic closes easily: a 22-person band needs
rawUsableHarvest >= 0.1875/season (demand 18.75 AE, HARVEST_TO_SUPPORT_SCALE=100);
one typical successful plant trip yields ~0.150, and there are 28 trip-days/season.
Break-even needs ~1.25 successful trips of 28 (~4.5%).
Real but SECONDARY defects: naturalAvailability and (1-depletion) each appear BOTH in
`plantHarvestAvailability` (ceiling, plantStock.ts:447-452) AND in
`derivePlantGatherReturnFactor` (request multiplier, :534-556). Same doubling for fauna
(abundance, carryingCapacity, seasonalAvailabilityFactor in both :986-987 and :910).
Only bites when the availability ceiling binds, i.e. in poor habitat.

## MEASURED ENVELOPE (expeditionHabitatCasesAudit, map2, 100y, isolated 22-person founder)
| case | site plant stock | meanWater | receipts | units | units/receipt | outcome |
|---|---|---|---|---|---|---|
| rich | 35.86 | 0.802 | 3772 | 132.82 | 0.0352 | 22->23 survives (fragile @99) |
| ordinary | 7.51 | 0.259 | 240 | 5.11 | 0.0213 | extinct by y80 |
| marginal | 2.10 | 0.104 | 46 | 0.68 | 0.0147 | extinct by y70 |

KEY DECOMPOSITION: per-receipt yield differs only 2.4x (rich vs ordinary) — a modest,
physically reasonable gradient. Receipt COUNT differs 15.7x. The dominant loss is
TRIP FREQUENCY/SUCCESS, not per-trip conversion.
Rich = 9.43 receipts/season (34% of 28 trip-days). Ordinary = 0.75/season (2.7%).
Marginal = 0.16/season (0.6%). Break-even ~1.25/season => ordinary falls ~40% short.

## PRIMARY CAUSE (localized) — distant food has exactly one channel and it converts ~0
Two hard binary gates in `runDailyActions` (intraSeasonTrips.ts:229,243):
  1. selectTripCandidate === undefined -> no trip
  2. deriveTripDurationDays(distance) > 1 -> `continue` (same-day path only)
Gate 2 is CORRECT physics, added deliberately by EXPEDITIONARY-2 §1 to remove a
"teleport" exploit that credited distant food with no travel/carry/return. Multi-day
work is handed to the expedition lifecycle.
=> In ordinary/marginal habitat food lies beyond same-day reach, so ALL of it must come
through expeditions. Expeditions deliver essentially nothing:
  - rich: expeditionDeliveredUnits 0.6252 of 132.82 total (0.5%)
  - ordinary: 0 units. 50/50 expeditions were `distant_patch_verification`,
    100% `returned_information_only`. It NEVER attempted a food expedition in 80y.
  - marginal: 0 units. 115 `distant_plant_gathering` attempts ->
    86 `harvest_failed` + 29 `target_absent` = 0 delivered.
So: healthy ecology + closing arithmetic + intact same-day path, but the sole channel
for distant food converts ~0%. This downshifts exactly the habitats whose food is not
adjacent — i.e. ordinary and marginal — which is the reported symptom.

OPEN (next): why does ordinary select verification 100% of the time, and why does
marginal's gathering fail 100% (`harvest_failed`)?

## H6 — adaptation latency: CONFIRMED as real but CANNOT be the food fix
- Candidate generation is a STEP FUNCTION on current severity
  (`formResponsesThroughProblems`, practicalResponses.ts:1541-1553:
  severity >= max(0.2, base*modifiers), base 0.22 water / 0.3 else).
  `repetitionCount` is incremented (inventionChain.ts:154) but READ BY NOTHING.
  => chronic duration never increases willingness to experiment. Severity 0.29 for 40
  years generates zero candidates; 0.31 generates them every single season.
- Experiments have NO material check, NO population/adult check, and their
  laborCost/riskCost are recorded but never subtracted from any budget.
- Efficacy is proxy-based ("budget improved / stress didn't rise"), except
  groundwater which resolves against hidden seepPotential.
- FOOD COUPLING IS ESSENTIALLY ABSENT: the only food-return effect in the whole
  registry is the snare line, `actualReturnValue * (1 + relief*0.25)`, <=5.5% on one
  trip, offset by laborShift 0.08. Nothing else touches foraging yield or patch return.
  => Adaptation cannot rescue chronic hunger BY DESIGN. Correctly so (storage/boats/
  domestication are unbuilt), but it means adaptation is not the lever for H6.
- `bandDecision.ts:3824-3826` short-circuits the legacy adaptiveHuman decision influence
  to zero whenever practicalAdaptation exists => that exported path is dead in live sims.

## Ecology defects found but NOT yet proven to fire in production
- faunaStock.ts:1223 `forageReceipt?.supportRatio ?? 0` — a MISSING receipt reads as
  total starvation; recovery is multiplied by forageSupportRatio so it becomes exactly 0
  while loss stays 0.22*abundance => exponential decay into an absorbing zero.
- faunaStock.ts:1228 `clamp01(abundance*4)` — undocumented Allee term making 0 absorbing.
- Aquatic stocks and predators are excluded from the only dispersal path
  (`transferForageDrivenMovement`, herbivore/omnivore + same region only) => a zeroed
  aquatic stock has NO recovery path at all.
- faunaStock.ts:1288 predator `demand <= 0 ? 1` => an extinct predator scores "well fed"
  and regrows from zero with no prey consumed.
- Asymmetric floors: humans clamp at HUMAN_HARVEST_RESERVE=0.08, predation clamps at 0.
The no-human run shows none of these fire at map scale in 120y (0 zero stocks), so they
are latent, not the active cause. Any fix must be justified separately.

## CONFIRMED PRODUCTION DEFECTS (code-verified, file:line)

### DEFECT A — gathering expeditions launched at non-food targets  [FIX APPLIED]
`selectExpeditionTripCandidate` (intraSeasonTrips.ts:2834) has NO food-class filter, but
its ONLY production consumer is `retrieval` (expedition.ts:1063), which launches the party
as `distant_plant_gathering` with the cause hard-coded to "food_resource_check"
(expedition.ts:662). `getTripCause` (intraSeasonTrips.ts:735-774) returns non-food causes:
  - "water_check"          for resourceClassId === "water_resource" (waterStress >= 0.32)
  - "plant_followup_test"  for ANY memory with a plantObservation, any class
  - "memory_refresh"       for ANY stale memory with presenceConfidence >= 0.25
For a non-food target the food-class bypass at :1261
(`if (physicallyAtTarget && isFoodClass(...)) return "partial_success"|"target_found"`)
does NOT fire, so the belief gates yield a "failure" outcome -> classifyActivityReturnKind
returns "none" (physicalFoodReturn.ts:117) -> `activityEligible === false`
(intraSeasonTrips.ts:320) -> failureReason "activity_failed" -> falls through
`classifyTargetWorkOutcome` (expedition.ts:788) to `harvest_failed`, having NEVER queried a
physical stock. NOTE this is distinct from genuine scarcity, which is `physically_exhausted`
(plantStock.ts:379, faunaStock.ts:1006) — a different bucket.
EVIDENCE: marginal founder = 86 `harvest_failed` of 115 gathering attempts, 0 units
delivered. FIX: reject non-food-class candidates in `selectExpeditionTripCandidate`.
Minimal + correct because the selector has exactly one consumer and that consumer is
food-only. Typecheck clean.

### DEFECT B — verification is a dead-end that cannot unlock gathering  [NOT FIXED]
Ordinary founder ran 50/50 `distant_patch_verification`, 100% `returned_information_only`,
0 food units, extinct y80. Mechanism:
- The "hungry bands gamble" rule is real — `foodStress < 0.35` (expedition.ts:1081,1091).
  A STARVING band has foodStress >= 0.35, so `verifyBeforeRetrieving` is FALSE. It did not
  choose verification over gathering.
- The only other route to verification is expedition.ts:1112, gated on
  `retrieval === undefined`. So gathering was never ELIGIBLE on any of those 50 days.
- Verification runs with `verifyOnly: true` (expedition.ts:587), which forces
  `activityEligible = false` (intraSeasonTrips.ts:320) => the record it carries home is a
  ZERO-YIELD activity outcome. So the task that exists to resolve stale evidence writes a
  zero-yield result into the very memory it was meant to confirm, and can never raise
  yieldConfidence enough to make that patch a retrieval candidate.
- Suppression asymmetry compounds it: food retrieval targets are suppressed 12 days
  (`getRepeatTargetSuppressionDays`, :3172) vs the 6-day launch cadence
  (EXPEDITION_LAUNCH_CADENCE_DAYS=6, expedition.ts:848), and the expedition deposits its
  return record re-dated to the RETURN day (expedition.ts:293-295), re-suppressing its own
  target for another 12 days. Verification suppression is only
  INFORMATION_TASK_SUPPRESSION_TICKS=8 (:863), so verification always re-qualifies first.
=> a self-sustaining verification loop with no exit. This is the primary cause of the
ORDINARY-habitat decline. Fix deferred to CORRECTION-2: it needs a design decision about
what a verification should legitimately write (presence/staleness refresh WITHOUT a
zero-yield stamp), and must not become a free-knowledge shortcut.

### Party size (context, not a defect)
`deriveDepartableWorkers` (expedition.ts:856) = min(available-2, floor(workingAdults/3));
with 11 adults that is 3. Information tasks hard-code workers: 2 (:1110,:1119,:1128).
Carry ceiling 2*0.12=0.24 units was NOT binding — rich delivered ~0.035/successful trip,
~1/7 of ceiling. The take at the target was the binding constraint, not carrying.

# CORRECTION-2 — Defect A validation (COMPLETE) + Defect B seam (DESIGNED, NOT BUILT)

## DEFECT A FIX: VALIDATED. All five §2 proofs pass.
Same harness, same sites (verified identical), map2, 100y, isolated 22-person founder.

| metric | rich before/after | ordinary before/after | marginal before/after |
|---|---|---|---|
| distant_plant_gathering | 30 / 30 | 0 / 0 | 115 / **3** |
| distant_patch_verification | 4 / 4 | 50 / 50 | 27 / 24 |
| route_reconnaissance | 8 / 8 | 0 / 0 | 4 / 0 |
| harvest_failed | 0 / 0 | 0 / 0 | 86 / **0** |
| target_absent | 0 / 0 | 0 / 0 | 29 / **0** |
| physically_exhausted | 12 / 12 | 0 / 0 | 0 / **3** |
| physicalReceipts | 3772 / 3772 | 240 / 240 | 46 / 59 |
| receiptUnits | 132.8185 / 132.8185 | 5.1142 / 5.1142 | 0.6753 / **0.5861** |
| final | 23 fragile / 23 fragile | extinct / extinct | extinct / extinct |

Proofs:
- REMOVES INVALID ATTEMPTS: marginal gathering 115->3; harvest_failed 86->0;
  target_absent 29->0. The 3 surviving gathering launches are real food targets and
  return the honest physical outcome `physically_exhausted`.
- HIDES NO LEGITIMATE FOOD TARGET: rich is BYTE-IDENTICAL on every metric incl.
  receiptUnits to 4dp. This is the negative control.
- CREATES NO FOOD: marginal receiptUnits went DOWN (0.6753 -> 0.5861, -13%); rich
  unchanged. No case gained food.
- EXPOSES NO UNKNOWN RESOURCE: the filter only rejects candidates; it reads
  `memory.resourceClassId`, which is already band-known. No knowledge path touched.
- DOES NOT CONVERT VERIFICATION/RECON INTO GATHERING: verification 27->24,
  reconnaissance 4->0, both DOWN. Total marginal expeditions 146->27: the band stops
  burning party-days on impossible work rather than redirecting it into information.
- All 11 pre-existing audit checks still PASS; audit verdict PASS before and after.

Interpretation: Defect A was real and is fixed, but it was NOT the ordinary-habitat
cause. Ordinary is byte-identical before/after because gathering was never ELIGIBLE
there — confirming Defect B is the sole remaining blocker for ordinary viability.
Marginal correctly remains non-viable (acceptance envelope wants that).

## DEFECT B — exact seam located, fix designed, NOT implemented
Confirmed live: ordinary still runs 50/50 `distant_patch_verification`,
100% `returned_information_only`, 0 food units, extinct.

What ALREADY exists and is correct (do not rebuild):
`expedition.ts:590-598` already derives a real physical `ExpeditionObservation` with
three distinct kinds at confidence 0.85:
  - `target_absent`    when `harvest.physicalSourceFound !== true`
  - `target_depleted`  when `harvest.physicalAvailability <= 0.001`
  - `target_confirmed` otherwise
This is exactly the §4.1 taxonomy (present / absent / depleted) already computed from
physical presence, and it is carried home in `carriedObservations`.

THE DEFECT — expedition.ts:1326 + 1361-1377:
On physical return the code applies `pendingKnowledgeRecord` (the raw verifyOnly harvest
record) through `applyActivityOutcomeToMemoryForWorld`, i.e. THE SAME WRITER A FAILED
HARVEST USES (intraSeasonTrips.ts:1795 -> applyActivityOutcomeToMemory, keyed on the
record's outcome/yield). Because `verifyOnly: true` forces `activityEligible = false`
(intraSeasonTrips.ts:320), that record carries usableSupport 0 and failureReason
"activity_failed". So a verification that PHYSICALLY CONFIRMED the resource is present
writes a zero-yield/failed-harvest result into the very memory it was sent to confirm.
The already-correct `ExpeditionObservation` is carried home and NEVER used to update
resource memory — only the failure-shaped record is. That is the self-sealing loop.

DESIGNED FIX (smallest correct change, §4/§5 compliant):
Route a verification return through observation semantics instead of harvest semantics.
At expedition.ts:1361-1377, when the completed expedition's taskKind is
`distant_patch_verification`, do NOT feed `pendingKnowledgeRecord` to
`applyActivityOutcomeToMemoryForWorld`. Instead apply a verification-specific update
derived from the carried `ExpeditionObservation`:
  - target_confirmed  -> refresh presence confidence + recency/staleness; leave
                         yieldConfidence UNCHANGED (presence observed, yield was not
                         attempted, so yield evidence must not move in either direction)
  - target_depleted   -> keep presence; mark currently unproductive; reduce expected
                         value modestly. MUST stay distinct from absent.
  - target_absent     -> reduce presence confidence.
  - route/endpoint failure (party never reached the patch) -> apply NOTHING.
Add `seasonally_inactive` only if a physical seasonal-availability signal is already
available at the observation site; otherwise leave it for later rather than inventing it.
GUARDS: must not create food, must not reveal exact stock (confidence stays bounded at
0.85, never 1.0), must not skip travel/return latency (the update still happens only on
`phase === "completed"`), and must not auto-guarantee a later gathering success.
ACCEPTANCE: after the fix, the ordinary founder must show
`distant_plant_gathering > 0` (the loop opens) with rich still byte-identical.

RISK NOTE: this edits resource-knowledge semantics, which is anti-omniscience-critical.
It needs the resource-anti-omniscience audit plus a negative test proving a confirmed
verification does NOT raise yieldConfidence. Deferred deliberately rather than shipped
half-validated.

# CORRECTION-3 — Defect B fix IMPLEMENTED. Large effect, primary acceptance target MISSED.

Implementation: `applyVerificationObservationToMemory` (resourceKnowledge.ts) + routing in
expedition.ts so a completed `distant_patch_verification` applies its carried physical
observation through the OBSERVATION writer instead of the activity/harvest writer.
Anti-omniscience audit `scripts/verificationKnowledgeAudit.mjs`: PASS, 12/12.
  confirmed: presence 0.40->0.85, yield 0.35 UNCHANGED
  depleted:  presence kept 0.85, yield 0.35->0.21
  absent:    presence 0.40->0.20, yield unchanged
Determinism: deterministic=true. All 11 pre-existing habitat checks still PASS.

## Measured (map2, 100y, identical sites; A = post-Defect-A, B = post-Defect-B)
| metric | rich A/B | ordinary A/B | marginal A/B |
|---|---|---|---|
| physicalReceipts | 3772 / 3799 | 240 / **413 (+72%)** | 59 / **257 (+336%)** |
| receiptUnits | 132.82 / 134.92 | 5.11 / **8.29 (+62%)** | 0.586 / **3.469 (+492%)** |
| distant_plant_gathering | 30 / **79** | 0 / **0** | 3 / 7 |
| distant_patch_verification | 4 / 5 | 50 / **38** | 24 / 31 |
| returned_with_cargo | 18 / 32 | 0 / 0 | 0 / **1** |
| expeditionDeliveredUnits | 0.625 / 0.867 | 0 / 0 | 0 / 0.0168 |
| final | 23 fragile / **22 fragile** | extinct / extinct | extinct / extinct |

## Interpretation — honest
WORKED: the self-sealing loop is broken. Ordinary repeat verifications fell 50->38, and
food rose sharply in BOTH failing habitats. Marginal delivered its first-ever expedition
cargo. Rich distant gathering more than doubled (30->79).

WHERE THE GAIN ACTUALLY CAME FROM: the large receipt jumps are mostly on the SAME-DAY
trip path, not the expedition path. Refreshed presence confidence + recency (lastNotedTick)
makes nearby remembered food eligible for ordinary daily trips again. That is a legitimate
consequence of repairing knowledge, but it is not what the acceptance criterion targeted.

FAILED — the stated acceptance criterion: "ordinary must show distant_plant_gathering > 0".
It is still exactly 0. The knowledge write is fixed, but ordinary distant gathering is
still blocked upstream in the RETRIEVAL CANDIDATE gates, not in the knowledge write:
`getTripCause` + `wasRecentlyVisited` 12-day suppression (vs 6-day launch cadence, and the
expedition re-dates its own return record to the return day) + the distance>=5-tile band.
That is the next thing to fix, and it is a different seam from Defect B.

STILL FAILING THE ENVELOPE: ordinary and marginal both still go extinct within 100y.
Ordinary food rose 62% but remains far under break-even (~0.1875 units/season needed;
8.29 units over ~320 seasons is ~0.026/season).

MILD REGRESSION TO WATCH: rich ended 22 rather than 23, with far more expeditions
(30->79 gathering, physically_exhausted 12->38, target_absent 0->9). More confident
memory means more distant attempts, and on rich ground that effort is not clearly
repaid. Not conclusive at n=1 seed; needs the multi-seed matrix.
NOTE: rich is deliberately NOT byte-identical here. Byte-identity was the Defect A
criterion (a filter must hide nothing). For Defect B, changed rich behavior is the
expected consequence of verification knowledge finally working.

NEXT (CORRECTION-4): open the ordinary retrieval-candidate gates above; then re-run the
bounded viability matrix (7 cases x 25/50/100y, multi-seed on good/ordinary) and the
adaptation-latency reassessment, both still outstanding.

# CORRECTION-4 — retrieval chain OPENED; exposed a net regression. FAIL -> CORRECTION-5.

## Blockers found and fixed (both real, both correct in isolation)
1. ARGMAX DOMAIN BUG (intraSeasonTrips.ts selectTripCandidate).
   selectTripCandidate returned a single GLOBAL argmax over all distances; near targets
   always win (lowest distance penalty). selectExpeditionTripCandidate then discarded that
   same-day winner and returned undefined. A band holding ANY near food memory could
   therefore never yield a retrieval candidate -> ordinary launched 0 gathering
   expeditions forever. Fix: added `requireMultiDay` so the expedition selector runs its
   argmax over the multi-day domain instead of filtering after it. No second distance
   authority: multi-day-ness is still decided by deriveTripDurationDays.
2. UNTYPED VISIT SUPPRESSION (§4).
   wasRecentlyVisited counted every visit identically, and the expedition deposits its
   return record re-dated to the RETURN day, so a verification re-suppressed its own
   target for 12 more days against a 6-day launch cadence -- the verification permanently
   vetoed the gathering it justified. Fix: IntraSeasonTripRecord.inspectionOnly marks
   look-without-taking visits; exploitation causes ignore them, verification still
   suppresses redundant verification.

## Result: the behavioral gate OPENED
ordinary distant_plant_gathering 0 -> 274, returned_with_cargo 58,
expeditionDeliveredUnits 0 -> 0.825, honest terminal outcomes present
(physically_exhausted 202, cargo_return_failed 4, seasonally_inactive 8).
PASS-gate items 1, 7 and 8 are met.

## But the NET result is WORSE. This is a regression, not an improvement.
| metric | B (corr-3) | C4 | delta |
|---|---|---|---|
| rich receipts | 3799 | 3055 | -20% |
| rich receiptUnits | 134.92 | 92.20 | -32% |
| rich gathering launches | 79 | 1326 | +1578% |
| rich physically_exhausted | 38 | 822 | massive |
| rich final pop | 22 | 21 | worse |
| ordinary receipts | 413 | 266 | -36% |
| ordinary receiptUnits | 8.29 | 6.41 | -23% |
| ordinary extinction | y80 | y90 | marginally later |
| marginal receiptUnits | 3.469 | 1.346 | -61% |

## Diagnosis of the regression (not yet fixed)
Opening the gate with no value/need test makes distant gathering fire on EVERY 6-day
cadence whenever any multi-day food memory exists. Rich launches 1326 expeditions and
822 of them hit already-exhausted stock, spending labour that previously produced
local receipts -- which is why rich LOCAL receipts fell 3799->3055 and total food fell
32%. Bands now thrash distant targets instead of working productive nearby ones.

## The missing piece (CORRECTION-5, specified by this prompt's §6/§7)
There is no expected-net-value or need gate on expedition launch. §6 requires scoring
  expected harvest - travel - task - provisions - risk - opportunity cost
from BAND KNOWLEDGE (not hidden stock), and §7 requires that a rich band with adequate
nearby receipts not spend labour on distant low-value food merely because it now knows
the target exists. Need must change willingness and priority, never stamina or yield.
Concretely: gate `retrieval` on (a) local per-capita support below a threshold, and
(b) remembered expected value net of travel/provisions exceeding the opportunity cost of
the same workers doing same-day trips; and cool down targets that recently returned
physically_exhausted rather than re-launching at them.

Determinism: NOT re-verified after this change. Full regression, viability matrix,
adaptation reassessment, docs and push all still outstanding.

# CORRECTION-5 — expedition value control. Rich regression FIXED. Marginal still regressed.

## Implemented (expedition.ts only; +129 lines, no other sim file touched)
`isDistantRetrievalWorthwhile` gates the retrieval family on band-known expected net value:
  expectedUnits  = remembered lastYieldEstimate x effectivePresence x effectiveYield
                   x (1 - depletionMemory)
                   capped by deriveCarryCapacityUnits(workers)      [cannot deliver more
                                                                     than it can carry]
                   calibrated by the band's OWN mean delivered units over its recent
                   distant_plant_gathering outcomes, floored at 25% of the remembered
                   estimate                                        [realized-outcome
                                                                     feedback, not a stock read]
  costUnits      = provisions + committed-labour value x totalDays
                   labour/day = max(band's own recent local yield/day,
                                    MIN_COMMITTED_LABOUR_VALUE_PER_DAY = 0.025)
  requiredMargin = 1 + (1 - foodStress) x 1.5     [hungry -> 1.0, well fed -> 2.5]
Plus `wasTargetRecentlyEmpty`: a target the band's OWN party just found exhausted /
absent / seasonally inactive is not re-walked for 12 ticks.
A target rejected on VALUE frees the slot for verification or reconnaissance.
Every input is band-known. No stock is read. Need changes willingness only -- never
stamina, party size, carry capacity, travel speed or yield.

Why the labour floor exists: provisions are 0.0008/worker/day, far too small to price an
expedition. The real cost is committed workers. Valuing that purely at recent local yield
makes the walk look FREE exactly when the band has been unlucky locally -- when it can
least afford a wasted trip. Hence the floor.

## Audit: scripts/expeditionValueGateAudit.mjs PASS 8/8
richComfortableDeclines, ordinaryHungryAccepts, needChangesWillingness,
localOpportunityCostCounts, emptyTargetCooldownHolds, cooldownExpires,
rememberedDepletionCounts, nearerTargetPreferred.
Determinism: deterministic=true. All 11 habitat checks PASS.
Verification-knowledge audit (CORRECTION-3) still PASS 12/12.
Sim purity: no Math.random, no `any`, no ui/render imports.

## Measured (map2, 100y, identical sites)
| metric | corr-3 | corr-4 | corr-5c | corr-5d (final) |
|---|---|---|---|---|
| rich units | 134.92 | 92.20 | 128.61 | **134.02** |
| rich gathering launches | 79 | 1326 | 186 | **15** |
| rich physically_exhausted | 38 | 822 | 69 | **6** |
| rich final pop | 22 | 21 | 22 | **23** |
| ordinary units | 8.29 | 6.41 | 4.91 | 6.23 |
| ordinary extinction | y80 | y90 | y80 | y90 |
| marginal units | 3.47 | 1.35 | 0.72 | 0.72 |

RICH: the CORRECTION-4 regression is fully reversed and slightly bettered -- thrashing
collapsed (1326 -> 15 launches, 822 -> 6 exhausted), local foraging restored
(3055 -> 3759 receipts), and the founder reached population 23. §7 satisfied.

## STILL FAILING
ORDINARY: 6.23 units vs corr-3's 8.29. Extinct y90.
MARGINAL: 0.72 vs corr-3's 3.47 -- a clear, unreversed regression.

## Where the marginal regression came from (traced, not guessed)
marginal units by checkpoint: 3.47 (corr-3) -> 1.35 (corr-4) -> 0.72 (corr-5).
The dominant loss is CORRECTION-4, before any value gate existed, and marginal LOCAL
receipts fell 257 -> 66 (-74%) even though distant gathering only went 7 -> 2. So the
loss is NOT expedition labour diversion; it is on the SAME-DAY path.
Leading hypothesis (untested, for CORRECTION-6): CORRECTION-4 made exploitation causes
IGNORE inspection-only visits in `wasRecentlyVisited`. That correctly stopped a
verification vetoing the gathering it enabled, but it also removed the rotation pressure
that suppression provided -- the same-day path can now re-target the same recently
inspected tile instead of moving on, reducing effective catchment coverage and total
receipts. Test: count DISTINCT same-day target tiles per season on the marginal founder
at corr-3 vs corr-5. If distinct targets collapsed, restore rotation WITHOUT restoring
the gathering veto (e.g. inspection-only visits suppress re-INSPECTION and mildly
de-prioritise, rather than being ignored entirely).

Outstanding for CORRECTION-6: the above; ordinary break-even; the bounded viability
matrix (7 cases x 25/50/100y, multi-seed on good/ordinary); adaptation reassessment;
full regression; docs (HANDOFF/AGENTS/CLAUDE/graph/roadmap); push.
