// EXPEDITIONARY-2 (Slice A) — the neutral daily-action registry boundary.
//
// WHY THIS MODULE EXISTS: the registry used to live in `intraSeasonTrips.ts`. Adding
// the expedition daily action there would have created
//   intraSeasonTrips → expedition → intraSeasonTrips
// and because the registry is a module-initialization `const`, the cycle would hit a
// temporal-dead-zone at import time (the array would capture an undefined handler
// depending on which module the bundler initialized first). That is an import-ORDER
// dependent runtime bug, i.e. exactly the kind of nondeterminism this simulator
// forbids.
//
// The fix is a leaf module that depends on BOTH action owners and is depended on by
// NEITHER. `expedition.ts` may freely import `intraSeasonTrips.ts` (it reuses the trip
// record + physical harvest machinery), and `intraSeasonTrips.ts` imports nothing from
// `expedition.ts`. The dependency graph stays acyclic:
//
//   tick/advance.ts → dailyActionRegistry.ts → { intraSeasonTrips.ts, expedition.ts }
//                                              expedition.ts → intraSeasonTrips.ts
//
// Registration order is a fixed literal (never sorted at runtime, never mutated), so
// the daily reducers always run in the same deterministic sequence. Trips run BEFORE
// expeditions on a shared day: a departing party's workers are committed by the
// seasonal decision, so same-day trips that day already see the reduced camp labor,
// and a returning party's receipt lands after the day's ordinary foraging is recorded
// — a stable, explainable order rather than an emergent one.
import type { DailyAction } from "./dailyActions";
import { expeditionDailyAction } from "./expedition";
import { intraSeasonTripDailyAction } from "./intraSeasonTrips";

/**
 * The default daily-action registry advanced by `advanceWorldByDays`.
 *
 * Fixed order, no runtime mutation, no UI/render/store dependency. Adding an action
 * here is the ONLY sanctioned way to run sub-season physical work.
 */
export const DEFAULT_DAILY_ACTIONS: readonly DailyAction[] = [
  intraSeasonTripDailyAction,
  expeditionDailyAction,
];
