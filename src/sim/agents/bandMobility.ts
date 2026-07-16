// EXPEDITIONARY-3 — dynamic human mobility capacity, conditioning, and walking history.
//
// ARCHITECTURE (§6 Option B — mobility-role cohorts, NOT sex demography).
// Canonical population state has NO sex composition (BandDemography carries only
// dependents / workingAdults / elders), so this module deliberately makes **no
// male/female claim** and exposes no sex-specific average. Fabricating
// `adultMen = adults / 2` is exactly what the amendment forbids, and inventing
// conserved sex composition means sex-aware aging/mortality/birth/fission surgery on
// the single-net-rate demographic core — its own checkpoint. Sex hooks are future work.
//
// THE FOUR CONCEPTS ARE KEPT SEPARATE (§4) — never one `walkingDistance` field:
//   1. capacity      — DERIVED per party, never stored, so it can never go stale or
//                      become a second authority. Composition + nutrition + conditioning
//                      − fatigue.
//   2. conditioning  — STORED. Slow, bounded, diminishing, REVERSIBLE. Bodies accustomed
//                      to repeated work. Distinct from learned technique, which lives in
//                      the adaptation subsystem behind its public boundary.
//   3. fatigue       — NOT stored here. Read from the EXISTING
//                      `band.pressureState.fatiguePressure`; §19.6 forbids duplicating a
//                      health system.
//   4. history       — STORED, bounded. Written ONLY from completed physical movement.
//                      Kilometres, at the map's documented 1.5 km/tile.
//
// The hard rule the amendment repeats: history CONDITIONS gradually, it never PERMITS.
// There is no `allowedDistance = historicalAverage` anywhere in this file. Today's
// realized distance is decided by today's capacity and today's need; yesterday's walking
// only nudges conditioning, and only after recovery.
import type { DayNumber } from "../core/types";
import type { Band } from "./types";

/** The map's documented spatial scale (see world/generate.ts: "1 tile ≈ 1.5 km"). */
export const KM_PER_TILE = 1.5;

/** Rolling realized-history window. Bounded state, never grows. */
export const WALKING_HISTORY_DAY_CAP = 24;

/**
 * TECHNICAL SAFETY LIMIT — not a behavioural maximum (§12). Ordinary human behaviour is
 * bounded far below this by provisions, water, fatigue, recovery, and camp tolerance for
 * absence, which intervene first. It exists only so state and search stay bounded.
 */
export const MOBILITY_TECHNICAL_MAX_KM_PER_DAY = 45;

/** Conditioning moves slowly and reversibly; one hard journey never makes elite walkers. */
const CONDITIONING_GAIN_PER_ACTIVE_DAY = 0.004;
const CONDITIONING_DECAY_PER_IDLE_DAY = 0.0015;
const CONDITIONING_MIN = 0;
const CONDITIONING_MAX = 1;

/** Routine unloaded output of a typical adult party at zero conditioning, in km/active day. */
const BASE_ROUTINE_KM_PER_ACTIVE_DAY = 6;
/** What full conditioning adds to routine output. Bounded: conditioning is not a superpower. */
const CONDITIONING_KM_BONUS = 5;
/** A fully loaded return party loses this share of its unloaded pace. */
const LOADED_PACE_PENALTY = 0.32;
/** Urgent need can push output this far past routine — willingness, never new stamina. */
const OVERREACH_MAX_MULTIPLIER = 1.6;

/** One day the band actually walked. Derived from completed movement only. */
export interface WalkingDayRecord {
  readonly day: DayNumber;
  readonly km: number;
  readonly loadedKm: number;
  /** False on a rest/camp day — this is what separates calendar-day from active-day means. */
  readonly activeTravel: boolean;
  readonly source: "expedition_outbound" | "expedition_return" | "expedition_operating";
}

/** Bounded realized walking history. The observable "average distance" comes from HERE. */
export interface WalkingHistory {
  readonly recentDays: readonly WalkingDayRecord[];
  readonly totalKmWalked: number;
  readonly longestActiveDayKm: number;
  readonly longestExpeditionKm: number;
}

/** Stored mobility state. Capacity is deliberately absent — it is always derived. */
export interface BandMobilityState {
  readonly conditioning: number;
  readonly history: WalkingHistory;
}

/**
 * DERIVED capacity for a specific party under today's conditions. Four distinct outputs,
 * because the amendment forbids collapsing them: what a party sustains routinely, what it
 * can sustain right now, what it manages under load, and what it might attempt under
 * urgent need.
 */
export interface MobilityCapacity {
  /** Comfortable repeatable output for this party, ignoring urgency. */
  readonly routineKmPerActiveDay: number;
  /** What today's fatigue/nutrition actually permit. */
  readonly currentKmPerActiveDay: number;
  /** Current output while carrying a full load home. */
  readonly loadedKmPerActiveDay: number;
  /** Ceiling a desperate party may ATTEMPT. Higher cost, never free stamina. */
  readonly overreachKmPerActiveDay: number;
}

export function createEmptyMobilityState(): BandMobilityState {
  return {
    conditioning: 0.2,
    history: { recentDays: [], totalKmWalked: 0, longestActiveDayKm: 0, longestExpeditionKm: 0 },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Derive what this party can physically do today.
 *
 * `loadRatio` and `urgency` are today's circumstances, NOT stored mobility. Nutrition and
 * fatigue come from existing canonical state (never re-modelled here). Conditioning is the
 * only slow term. Nothing in here reads the walking-history means: history must not become
 * an allowance.
 */
export function deriveMobilityCapacity(band: Band, options?: {
  readonly loadRatio?: number;
  readonly urgency?: number;
}): MobilityCapacity {
  const conditioning = clamp01(band.mobility?.conditioning ?? 0.2);
  // Read EXISTING health/nutrition authorities — do not duplicate them (§19.6).
  const fatigue = clamp01(band.pressureState?.fatiguePressure ?? 0);
  const nutritionStress = clamp01(band.demography.foodPerPersonStress ?? 0);

  const routine = BASE_ROUTINE_KM_PER_ACTIVE_DAY + conditioning * CONDITIONING_KM_BONUS;
  // Hunger and tiredness reduce what a body can do today. They are bounded so a stressed
  // party is slowed, never immobilised.
  const conditionFactor = Math.max(0.45, 1 - fatigue * 0.3 - nutritionStress * 0.25);
  const current = routine * conditionFactor;
  const loadRatio = clamp01(options?.loadRatio ?? 0);
  const loaded = current * (1 - LOADED_PACE_PENALTY * loadRatio);
  // Need raises WILLINGNESS to spend the body, not the body's ability: overreach scales
  // today's real capacity, so a starving unconditioned party still cannot outwalk a fed
  // conditioned one.
  const urgency = clamp01(options?.urgency ?? 0);
  const overreach = Math.min(
    MOBILITY_TECHNICAL_MAX_KM_PER_DAY,
    current * (1 + (OVERREACH_MAX_MULTIPLIER - 1) * urgency),
  );

  return {
    routineKmPerActiveDay: round3(routine),
    currentKmPerActiveDay: round3(current),
    loadedKmPerActiveDay: round3(loaded),
    overreachKmPerActiveDay: round3(overreach),
  };
}

/**
 * Record a day the band PHYSICALLY walked (or rested). Called only from completed
 * movement. This is the sole writer of realized history, which is why the reported
 * average can never drift from what actually happened.
 */
export function recordWalkingDay(
  state: BandMobilityState | undefined,
  record: WalkingDayRecord,
): BandMobilityState {
  const current = state ?? createEmptyMobilityState();
  const recentDays = [record, ...current.history.recentDays].slice(0, WALKING_HISTORY_DAY_CAP);
  // Conditioning follows what the body actually did: active days build it slowly, idle days
  // let it fade. Diminishing returns at both ends prevent a runaway loop where walking more
  // permits unlimited future walking.
  const headroom = CONDITIONING_MAX - current.conditioning;
  const conditioning = record.activeTravel
    ? current.conditioning + CONDITIONING_GAIN_PER_ACTIVE_DAY * headroom
    : current.conditioning - CONDITIONING_DECAY_PER_IDLE_DAY * (current.conditioning - CONDITIONING_MIN);

  return {
    conditioning: Math.max(CONDITIONING_MIN, Math.min(CONDITIONING_MAX, round3(conditioning))),
    history: {
      recentDays,
      totalKmWalked: round3(current.history.totalKmWalked + record.km),
      longestActiveDayKm: round3(Math.max(current.history.longestActiveDayKm, record.km)),
      longestExpeditionKm: current.history.longestExpeditionKm,
    },
  };
}

/** Record a completed expedition's total walked distance (bounded max, for observation). */
export function recordExpeditionDistance(state: BandMobilityState | undefined, totalKm: number): BandMobilityState {
  const current = state ?? createEmptyMobilityState();
  return {
    ...current,
    history: { ...current.history, longestExpeditionKm: round3(Math.max(current.history.longestExpeditionKm, totalKm)) },
  };
}

/**
 * OBSERVED walking summary — a derived read model, never an input to movement.
 * Calendar-day and active-day means are reported separately because they genuinely differ
 * whenever rest days exist, and conflating them is what turns a descriptive statistic into
 * a fake movement rule.
 */
export interface WalkingSummary {
  readonly calendarDayMeanKm: number;
  readonly activeDayMeanKm: number;
  readonly activeDayMinKm: number;
  readonly activeDayMaxKm: number;
  readonly loadedMeanKm: number;
  readonly activeDays: number;
  readonly restDays: number;
  readonly longestExpeditionKm: number;
}

export function deriveWalkingSummary(state: BandMobilityState | undefined): WalkingSummary {
  const history = (state ?? createEmptyMobilityState()).history;
  const days = history.recentDays;
  const active = days.filter((day) => day.activeTravel);
  const activeKm = active.map((day) => day.km);
  const totalKm = days.reduce((sum, day) => sum + day.km, 0);
  const loadedKm = active.reduce((sum, day) => sum + day.loadedKm, 0);

  return {
    calendarDayMeanKm: days.length === 0 ? 0 : round3(totalKm / days.length),
    activeDayMeanKm: active.length === 0 ? 0 : round3(totalKm / active.length),
    activeDayMinKm: activeKm.length === 0 ? 0 : round3(Math.min(...activeKm)),
    activeDayMaxKm: activeKm.length === 0 ? 0 : round3(Math.max(...activeKm)),
    loadedMeanKm: active.length === 0 ? 0 : round3(loadedKm / active.length),
    activeDays: active.length,
    restDays: days.length - active.length,
    longestExpeditionKm: history.longestExpeditionKm,
  };
}
