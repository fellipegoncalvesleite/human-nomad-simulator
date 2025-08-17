export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export interface Coord {
  readonly x: number;
  readonly y: number;
}

export type TileId = Brand<string, "TileId">;
export type RegionId = Brand<string, "RegionId">;
export type BandId = Brand<string, "BandId">;
export type SettlementId = Brand<string, "SettlementId">;
export type ProtoPolityId = Brand<string, "ProtoPolityId">;
export type RouteId = Brand<string, "RouteId">;
export type ResourcePatchId = Brand<string, "ResourcePatchId">;
export type RiverId = Brand<string, "RiverId">;
export type DecisionId = Brand<string, "DecisionId">;
export type ReasonId = Brand<string, "ReasonId">;
export type EventId = Brand<string, "EventId">;
export type TickNumber = Brand<number, "TickNumber">;
export type DayNumber = Brand<number, "DayNumber">;
export type SimulationSeed = Brand<string, "SimulationSeed">;

export type Season = "spring" | "summer" | "autumn" | "winter";
export type SeasonIndex = 0 | 1 | 2 | 3;
export type StepMode = "daily" | "weekly" | "monthly" | "seasonal";

export const SEASONS_PER_YEAR = 4;
export const SEASON_LENGTH_DAYS = 90;
export const DAYS_PER_YEAR = SEASONS_PER_YEAR * SEASON_LENGTH_DAYS;
export const YEARS_PER_GENERATION = 20;
export const TICKS_PER_GENERATION = 80;

export const STEP_MODE_DAYS: Readonly<Record<StepMode, number>> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  seasonal: SEASON_LENGTH_DAYS,
};

export interface GenerationEstimate {
  readonly index: number;
  readonly yearWithinGeneration: number;
  readonly tickWithinGeneration: TickNumber;
}

export interface WorldTime {
  /**
   * Compatibility seasonal decision tick. TIME-1A deliberately keeps this as
   * "completed seasonal decision ticks" until movement, depletion, demography,
   * and cooldown systems are individually converted to elapsed-day semantics.
   */
  readonly tick: TickNumber;
  readonly seasonTick?: TickNumber;
  readonly day?: DayNumber;
  readonly dayOfSeason?: number;
  readonly seasonLengthDays?: number;
  readonly daysPerYear?: number;
  readonly year: number;
  readonly season: Season;
  readonly seasonIndex: SeasonIndex;
  readonly generation?: GenerationEstimate;
}
