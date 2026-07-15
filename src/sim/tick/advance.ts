import type { Band } from "../agents/types";
import { applyBandDeepHistoryContext } from "../agents/bandHistory";
import { updateBandsDemographyAndFission } from "../agents/demography";
import { applyAcuteRiskContext } from "../agents/acuteRisk";
import { buildTickContextCache } from "../agents/contextCache";
import { runDailyActions } from "../agents/dailyActions";
import { DEFAULT_DAILY_ACTIONS } from "../agents/intraSeasonTrips";
import {
  applyEncounterContext,
  applyRangeSaturationContext,
  updateBandContextStates,
} from "../agents/socialContext";
import { updateBandViabilityStates } from "../agents/viability";
import type { BandId, DayNumber, DecisionId } from "../core/types";
import { SEASON_LENGTH_DAYS } from "../core/types";
import {
  applyBandDecision,
  evaluateBandDecision,
} from "../rules/bandDecision";
import {
  appendRecentDecisionRecord,
  recordDecisionArchive,
} from "../rules/decisionArchive";
import type { DecisionArchiveSummary } from "../rules/types";
import type { Decision } from "../rules/types";
import { advanceTileDepletion } from "../world/depletion";
import { advanceFaunaStocks } from "../agents/faunaStock";
import { advanceForestPatchState } from "../agents/forestPatches";
import { advancePlantPatchState } from "../agents/plantStock";
import type { WorldState } from "../world/types";
import type { FoodDemographyDiagnostics } from "../diagnostics/foodDemographyDiagnostics";
import { getCalendarDay, getWorldTimeForDay } from "./time";

// AUDIT-ONLY observer hook (ACTIVITY-GROUPS-9). A debug trace sink that lets an
// out-of-sim caller (the benchmark's AG9 full-decision divergence fixture) observe
// each band's in-situ seasonal decision at the exact pre-decision world state, with
// no behavior change. The reducer stays pure: when no observer is supplied the call
// is omitted and the run is byte-identical to before. The observer MUST NOT mutate
// any argument — it is read-only. It is never wired into the worker or normal runs.
export interface SeasonalDecisionObservation {
  // The world as the deciding band sees it: earlier bands this tick already applied,
  // this band NOT yet applied. Same object the band's evaluateBandDecision received.
  readonly world: WorldState;
  // The pre-decision band snapshot (carries this tick's nearbyOpportunity /
  // carryingCapacity / exhaustedRangeAudit context computed before any decision).
  readonly band: Band;
  // The band after applyBandDecision (where it actually went this tick).
  readonly updatedBand: Band;
  readonly decision: Decision;
}

export type SeasonalDecisionObserver = (observation: SeasonalDecisionObservation) => void;

// CORE-PIPELINE-CONSOLIDATION-1 — audit-only, non-persisted band-processing order
// for the season-order invariance audit. Production omits it (default "ascending",
// the canonical id sort). It is never stored in WorldState; when undefined the run
// is byte-identical to before. Band IDs are never renamed — only the processing
// order of the same IDs changes, so id-derived tendencies stay stable.
export type SeasonOrderStrategy = "ascending" | "descending" | "permuted";

function orderBandsForSeason(sorted: readonly Band[], strategy?: SeasonOrderStrategy): readonly Band[] {
  if (strategy === undefined || strategy === "ascending") {
    return sorted;
  }
  if (strategy === "descending") {
    return [...sorted].reverse();
  }
  // Deterministic permutation distinct from ascending/descending: order by the
  // reversed id string. Stable and reproducible, independent of wall clock.
  return [...sorted].sort((left, right) =>
    reverseString(String(left.id)).localeCompare(reverseString(String(right.id))));
}

function reverseString(value: string): string {
  return value.split("").reverse().join("");
}

export function advanceWorldOneSeason(
  world: WorldState,
  diagnostics?: FoodDemographyDiagnostics,
): WorldState {
  return advanceWorldByDays(world, SEASON_LENGTH_DAYS, undefined, diagnostics);
}

export function advanceWorldByDays(
  world: WorldState,
  elapsedDays: number,
  decisionObserver?: SeasonalDecisionObserver,
  diagnostics?: FoodDemographyDiagnostics,
  seasonOrderStrategy?: SeasonOrderStrategy,
): WorldState {
  const days = Math.max(0, Math.floor(elapsedDays));

  if (days === 0) {
    return world;
  }

  let current = world;
  let currentDay = getCalendarDay(current.time);
  const targetDay = currentDay + days;

  while (getNextSeasonBoundaryDay(currentDay) <= targetDay) {
    const boundaryDay = getNextSeasonBoundaryDay(currentDay);
    current = runDailyActions(current, currentDay, boundaryDay - currentDay, DEFAULT_DAILY_ACTIONS);
    current = runSeasonalCompatibilityTick({
      ...current,
      time: getWorldTimeForDay(boundaryDay as DayNumber),
    }, decisionObserver, diagnostics, seasonOrderStrategy);
    currentDay = getCalendarDay(current.time);
  }

  if (currentDay < targetDay) {
    current = runDailyActions(current, currentDay, targetDay - currentDay, DEFAULT_DAILY_ACTIONS);
    current = {
      ...current,
      time: getWorldTimeForDay(targetDay as DayNumber),
    };
  }

  return current;
}

// CORE-PIPELINE-CONSOLIDATION-1 — explicit season phase contract (verified by
// scripts/seasonOrderInvarianceAudit.mjs).
//
// Phases, in order:
//   1. Perceive/derive   — buildTickContextCache + updateBandContextStates +
//                          applyAcuteRiskContext, then a fresh cache. This is the
//                          season-start authoritative snapshot + derived context.
//   2. Decide per band   — bands are processed in a canonical id sort. Each band
//                          reads the frozen season-start context cache
//                          (acuteRiskPreDecisionCache) and the running bandsById
//                          (which carries earlier bands' applied outcomes). This
//                          sequential visibility is intentional, but is proven
//                          NON-causal to order: physical/causal outcomes (band
//                          position, population, vital rates, memory, ecology) are
//                          byte-identical under ascending/descending/permuted
//                          processing order. No band gains priority from its id
//                          sort position. The ONLY order-sensitive state is the
//                          bounded decision-history archive (recentDecisionIds /
//                          retained decisions / decisionArchive) — a projection
//                          record, not read to make causal decisions; production
//                          uses the canonical order deterministically.
//   3. Resolve downstream — post-decision context (range saturation, encounters),
//                          then demography+fission, viability/extinction, and
//                          deep-history observation, each from the post-decision
//                          world (all bands' outcomes applied).
//   4. Advance ecology    — tile depletion -> fauna -> plant -> forest, once per
//                          season, from the memoized post-decision catchment index.
//   5. Derive read models  — final context pass for UI/history.
function runSeasonalCompatibilityTick(
  timeAdvancedWorld: WorldState,
  decisionObserver?: SeasonalDecisionObserver,
  diagnostics?: FoodDemographyDiagnostics,
  seasonOrderStrategy?: SeasonOrderStrategy,
): WorldState {
  const preDecisionCache = buildTickContextCache(timeAdvancedWorld);
  const worldBeforeDecisions = updateBandContextStates(timeAdvancedWorld, preDecisionCache, diagnostics);
  const worldBeforeDecisionsWithAcuteRisk = applyAcuteRiskContext(worldBeforeDecisions);
  const acuteRiskPreDecisionCache = buildTickContextCache(worldBeforeDecisionsWithAcuteRisk);
  const bandsById: Record<string, Band> = { ...worldBeforeDecisionsWithAcuteRisk.bands };
  let decisionsById: Readonly<Record<DecisionId, Decision>> = worldBeforeDecisionsWithAcuteRisk.decisions;
  let decisionArchive: DecisionArchiveSummary = worldBeforeDecisionsWithAcuteRisk.decisionArchive;
  const bandOrder = orderBandsForSeason(
    Object.values(worldBeforeDecisionsWithAcuteRisk.bands).sort(compareBands),
    seasonOrderStrategy,
  );

  for (const band of bandOrder) {
    const currentBand = bandsById[band.id] ?? band;

    if (
      currentBand.status === "dispersed" ||
      currentBand.viability?.status === "absorbed" ||
      currentBand.viability?.status === "extinct"
    ) {
      continue;
    }

    const currentWorld = {
      ...worldBeforeDecisionsWithAcuteRisk,
      bands: bandsById,
      decisions: decisionsById,
      decisionArchive,
    };
    const decision = evaluateBandDecision(currentWorld, currentBand, acuteRiskPreDecisionCache);
    const updatedBand = applyBandDecision(currentWorld, currentBand, decision, acuteRiskPreDecisionCache);

    // AUDIT-ONLY: in-situ decision trace, taken BEFORE this band's update is written
    // back into bandsById, so `currentWorld` is the true pre-this-band world. Pure:
    // observer is read-only and absent in all normal/worker runs.
    if (decisionObserver !== undefined) {
      decisionObserver({ world: currentWorld, band: currentBand, updatedBand, decision });
    }

    bandsById[updatedBand.id] = updatedBand;
    decisionArchive = recordDecisionArchive(decisionArchive, decision);
    decisionsById = appendRecentDecisionRecord(decisionsById, decision, decisionArchive);
  }

  const worldAfterDecisions = {
    ...worldBeforeDecisionsWithAcuteRisk,
    bands: bandsById as Readonly<Record<BandId, Band>>,
    decisions: decisionsById,
    decisionArchive,
  };

  const postDecisionCache = buildTickContextCache(worldAfterDecisions);
  const worldAfterRangeContext = applyRangeSaturationContext(
    worldAfterDecisions,
    postDecisionCache,
    undefined,
    diagnostics,
  );
  const worldAfterContext = applyEncounterContext(worldAfterRangeContext, postDecisionCache);
  const worldAfterDemography = updateBandsDemographyAndFission(
    worldAfterContext,
    postDecisionCache,
    diagnostics,
  );
  const worldAfterViability = updateBandViabilityStates(worldAfterDemography);
  // DEEP-TIME-HISTORY-TECH-1 — spring-gated yearly durable-history observation.
  // Placed AFTER demography+viability so this year's fissions and deaths are
  // visible, BEFORE ecology advances. Observe-only: reads each band's own
  // bounded state, writes only band.deepHistory; non-spring ticks return the
  // same world reference (byte-identical fast path). Runs in --fast mode too
  // (it sits before the final context pass that fast skips).
  const worldAfterDeepHistory = applyBandDeepHistoryContext(worldAfterViability);
  // M0.14 — persistent depletion advances ONCE per season from this tick's
  // (memoized) shared-catchment extraction index. Placed before the final
  // context pass so both the full pipeline and the benchmark's fast mode
  // (which skips that pass) carry identical depletion state.
  const worldAfterDepletion = advanceTileDepletion(worldAfterDeepHistory, postDecisionCache);
  // FAUNA/AQUATIC-1 — finite fauna/aquatic stocks advance ONCE per season from
  // the same (memoized) catchment occupation index plus the in-season hunting/
  // fishing trip depletion already written this season, recovering when rested.
  const worldAfterFauna = advanceFaunaStocks(worldAfterDepletion, postDecisionCache);
  // ECO-BIOME-1 — plant patches advance once per season from gathering + the same
  // catchment occupation index, recovering at class-specific regrowth rates.
  const worldAfterPlants = advancePlantPatchState(worldAfterFauna, postDecisionCache);
  // TREE-FOREST-PATCHES-1 — sparse tree/forest pressure and health deviations
  // advance once per season. Static patch geography remains deterministic from
  // tile context; only non-baseline pressure/recovery is stored.
  const worldAfterForests = advanceForestPatchState(worldAfterPlants, postDecisionCache);

  return updateBandContextStates(
    worldAfterForests,
    buildTickContextCache(worldAfterForests),
    diagnostics,
  );
}

function getNextSeasonBoundaryDay(day: number): number {
  return (Math.floor(day / SEASON_LENGTH_DAYS) + 1) * SEASON_LENGTH_DAYS;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}
