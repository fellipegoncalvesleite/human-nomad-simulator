import type { DayNumber, Season, SeasonIndex, StepMode, TickNumber, WorldTime } from "../core/types";
import {
  DAYS_PER_YEAR,
  SEASON_LENGTH_DAYS,
  SEASONS_PER_YEAR,
  STEP_MODE_DAYS,
  TICKS_PER_GENERATION,
  YEARS_PER_GENERATION,
} from "../core/types";
import type { WorldState } from "../world/types";

const SEASON_ORDER: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export function getWorldTimeForTick(tick: TickNumber): WorldTime {
  const tickValue = Math.max(0, Math.floor(tick));
  const dayValue = tickValue * SEASON_LENGTH_DAYS;
  const seasonIndex = (tickValue % SEASONS_PER_YEAR) as SeasonIndex;
  const year = Math.floor(tickValue / SEASONS_PER_YEAR);
  const tickWithinGeneration = (tickValue % TICKS_PER_GENERATION) as TickNumber;

  return {
    tick: tickValue as TickNumber,
    seasonTick: tickValue as TickNumber,
    day: dayValue as DayNumber,
    dayOfSeason: 0,
    seasonLengthDays: SEASON_LENGTH_DAYS,
    daysPerYear: DAYS_PER_YEAR,
    year,
    season: SEASON_ORDER[seasonIndex],
    seasonIndex,
    generation: {
      index: Math.floor(year / YEARS_PER_GENERATION),
      yearWithinGeneration: year % YEARS_PER_GENERATION,
      tickWithinGeneration,
    },
  };
}

export function getWorldTimeForDay(day: DayNumber): WorldTime {
  const dayValue = Math.max(0, Math.floor(day));
  const seasonTick = Math.floor(dayValue / SEASON_LENGTH_DAYS);
  const seasonIndex = (seasonTick % SEASONS_PER_YEAR) as SeasonIndex;
  const year = Math.floor(dayValue / DAYS_PER_YEAR);
  const tickWithinGeneration = (seasonTick % TICKS_PER_GENERATION) as TickNumber;

  return {
    tick: seasonTick as TickNumber,
    seasonTick: seasonTick as TickNumber,
    day: dayValue as DayNumber,
    dayOfSeason: dayValue % SEASON_LENGTH_DAYS,
    seasonLengthDays: SEASON_LENGTH_DAYS,
    daysPerYear: DAYS_PER_YEAR,
    year,
    season: SEASON_ORDER[seasonIndex],
    seasonIndex,
    generation: {
      index: Math.floor(year / YEARS_PER_GENERATION),
      yearWithinGeneration: year % YEARS_PER_GENERATION,
      tickWithinGeneration,
    },
  };
}

export function getCalendarDay(time: WorldTime): number {
  return Number(time.day ?? Number(time.tick) * SEASON_LENGTH_DAYS);
}

export function getDaysForStepMode(mode: StepMode): number {
  return STEP_MODE_DAYS[mode];
}

export function isStepMode(value: string): value is StepMode {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "seasonal";
}

export function advanceWorldTime(
  world: WorldState,
  seasonsToAdvance = 1,
): WorldState {
  const nextTick = Math.max(0, Math.floor(world.time.tick + seasonsToAdvance));

  return {
    ...world,
    time: getWorldTimeForTick(nextTick as TickNumber),
  };
}

export function advanceWorldTimeByDays(
  world: WorldState,
  daysToAdvance: number,
): WorldState {
  const nextDay = getCalendarDay(world.time) + Math.max(0, Math.floor(daysToAdvance));

  return {
    ...world,
    time: getWorldTimeForDay(nextDay as DayNumber),
  };
}

export function resetWorldTime(world: WorldState): WorldState {
  return {
    ...world,
    time: getWorldTimeForTick(0 as TickNumber),
  };
}
