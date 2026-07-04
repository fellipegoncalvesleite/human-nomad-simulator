import { SEASON_LENGTH_DAYS } from "../core/types";
import type { WorldState } from "../world/types";

/**
 * TIME-1C — common daily-action aggregation interface.
 *
 * The maintenance trap this avoids: writing movement/trip logic four separate
 * times for daily / weekly / monthly / seasonal step modes. Instead, a daily
 * feature declares ONCE:
 *   - `firesOnDayOfSeason(dayOfSeason)` — a deterministic schedule predicate, and
 *   - `apply(world, day)` — a pure reducer for one fired day.
 *
 * The time system (`runDailyActions`, called from `advanceWorldByDays`) then runs
 * every registered action IDENTICALLY under all step modes by iterating only the
 * days that fall in the advanced span. Weekly/monthly/seasonal are therefore
 * accelerated approximations of the SAME daily logic — they never recompute a
 * naive 90-day loop, and they never diverge from the daily schedule.
 *
 * Hard contract for any registered action (so this stays safe):
 *   - PURE & deterministic: no `unseeded random call`, no `any`, no UI/render/Zustand.
 *   - It must NOT move the residential/home-range marker (`band.position`).
 *     Residential relocation stays in the seasonal `bandDecision` path. Mixing
 *     daily marker motion in here is exactly the SPIKE-MOBILITY-1 HEAT collapse.
 *   - Season-gated systems (demography, fission, depletion, resource economics)
 *     are deliberately NOT registered here; they run once per crossed season.
 */
export interface DailyAction {
  readonly id: string;
  firesOnDayOfSeason(dayOfSeason: number): boolean;
  apply(world: WorldState, day: number): WorldState;
}

/**
 * Advance the registered daily actions across an in-season span of calendar days
 * `(startDay, startDay + elapsedDays]`. The caller (`advanceWorldByDays`) only
 * passes spans that do NOT cross a season boundary, so no season-gated pipeline
 * runs here.
 *
 * Iterates day-outer / action-inner: on each scheduled day, every action that
 * fires runs in fixed registry order — a deterministic "a day happens, then all
 * daily things that happen that day happen" model. With the schedule predicate,
 * an action that fires on 5 days/season costs 5 reducer calls regardless of the
 * step mode used to reach the boundary.
 */
export function runDailyActions(
  world: WorldState,
  startDay: number,
  elapsedDays: number,
  actions: readonly DailyAction[],
): WorldState {
  const days = Math.max(0, Math.floor(elapsedDays));

  if (days === 0 || actions.length === 0) {
    return world;
  }

  let current = world;
  const endDay = startDay + days;

  for (let day = startDay + 1; day <= endDay; day += 1) {
    const dayOfSeason = day % SEASON_LENGTH_DAYS;

    for (const action of actions) {
      if (action.firesOnDayOfSeason(dayOfSeason)) {
        current = action.apply(current, day);
      }
    }
  }

  return current;
}
