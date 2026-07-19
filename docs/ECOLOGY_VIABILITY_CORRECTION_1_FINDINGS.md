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
