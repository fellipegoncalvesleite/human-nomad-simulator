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
import type { Band, ExpeditionPartyComposition, ExpeditionRecord } from "./types";

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

// ─────────────────────────────────────────────────────────────────────────────
// EXPEDITIONARY-4 §8 — WITHIN-ADULT MOBILITY VARIATION (Option B mobility-role pools).
//
// A global adult mean makes every party identical. These pools are the smallest
// bounded aggregate heterogeneity the current architecture supports: three
// conserved role counts DERIVED from canonical working-adult state — never
// individuals, never a stored second population, and (per the standing Option B
// decision) never a sex claim.
//
// The pools are not castes: their shares move gradually with the band's lived
// state — fatigue and sickness shift adults from typical toward limited;
// sustained conditioning grows the high-capacity pool slightly. All of it is
// bounded, reversible, and derived, so it can never drift from demography.
// ─────────────────────────────────────────────────────────────────────────────

/** Conserved role counts. limited + typical + high === workingAdults, always. */
export interface MobilityRolePools {
  /** Adults whose current bodily state supports only limited walking. */
  readonly limited: number;
  /** Ordinary adult walkers. */
  readonly typical: number;
  /** A small pool able to sustain harder days (scouting, fast reconnaissance). */
  readonly high: number;
}

/** Party composition drawn from the pools. Aggregate counts — never individuals. */
export type PartyComposition = ExpeditionPartyComposition;

/** Bounded per-pool pace factors: modest, not superhuman and not crippled. */
const HIGH_POOL_PACE_BONUS = 0.15;
const LIMITED_POOL_PACE_PENALTY = 0.2;

export function partyCompositionTotal(composition: PartyComposition): number {
  return composition.limited + composition.typical + composition.high;
}

/**
 * Derive the band's mobility-role pools from canonical demography plus current
 * health/conditioning state. Deterministic and exactly conserved: the three counts
 * always sum to `workingAdults` (no phantom adults, no decorative pool).
 */
export function deriveMobilityRolePools(band: Band): MobilityRolePools {
  const adults = Math.max(0, Math.floor(band.demography.workingAdults));

  if (adults === 0) {
    return { limited: 0, typical: 0, high: 0 };
  }

  const fatigue = clamp01(band.pressureState?.fatiguePressure ?? 0);
  // Sickness read from the EXISTING body/camp logistics authority (§19.6 — no duplicate
  // health system): its activity penalty is the band-known bodily consequence of illness.
  const sickness = clamp01(band.bodyCampLogistics?.behavior?.sicknessActivityPenalty ?? 0);
  const conditioning = clamp01(band.mobility?.conditioning ?? 0.2);
  // Gradual role movement: hardship pushes adults toward the limited pool; a
  // well-conditioned band keeps a slightly larger high pool. Bounded shares.
  const limitedShare = Math.min(0.4, 0.16 + fatigue * 0.1 + sickness * 0.14);
  const highShare = Math.max(0.06, Math.min(0.24, 0.14 + conditioning * 0.08 - fatigue * 0.05));
  const limited = Math.min(adults, Math.round(adults * limitedShare));
  const high = Math.max(0, Math.min(adults - limited, Math.round(adults * highShare)));
  const typical = adults - limited - high;
  return { limited, typical, high };
}

/**
 * Adults per pool currently committed to away parties. Legacy parties that recorded
 * only a worker count are treated as typical walkers — a conservative, deterministic
 * fallback that can never free more high-pool adults than were really taken.
 */
export function deriveCommittedMobilityPools(band: Band): PartyComposition {
  let limited = 0;
  let typical = 0;
  let high = 0;

  for (const expedition of band.expeditions ?? []) {
    if (!isAwayPhase(expedition.phase)) {
      continue;
    }

    if (expedition.partyComposition !== undefined) {
      limited += expedition.partyComposition.limited;
      typical += expedition.partyComposition.typical;
      high += expedition.partyComposition.high;
    } else {
      typical += expedition.partyWorkers;
    }
  }

  return { limited, typical, high };
}

function isAwayPhase(phase: ExpeditionRecord["phase"]): boolean {
  return phase === "prepared" || phase === "outbound" || phase === "operating" || phase === "returning";
}

/**
 * §8 NON-REUSE — the pools physically present at camp right now. An adult already
 * walking with one party cannot simultaneously power another party, a same-day task
 * group, or a residential column; commitments are subtracted here, exactly once.
 */
export function deriveAvailableMobilityPools(band: Band): MobilityRolePools {
  const pools = deriveMobilityRolePools(band);
  const committed = deriveCommittedMobilityPools(band);
  // Over-commitment against a pool that shrank (fatigue reclassified adults while a
  // party was away) spills into the neighbouring pool rather than double-counting:
  // total availability is always pools-total minus committed-total.
  const totalAvailable = Math.max(
    0,
    pools.limited + pools.typical + pools.high - partyCompositionTotal(committed),
  );
  const high = Math.max(0, Math.min(pools.high - committed.high, totalAvailable));
  const typical = Math.max(0, Math.min(pools.typical - committed.typical, totalAvailable - high));
  const limited = Math.max(0, Math.min(totalAvailable - high - typical, pools.limited));
  return { limited, typical, high };
}

/**
 * Draw a party from the AVAILABLE pools, deterministically.
 *  - "fast"     — reconnaissance/verification: highest-capacity adults first.
 *  - "balanced" — ordinary gathering: typical walkers first, high-capacity adults
 *                 only when the ordinary pool cannot fill the party (they are a
 *                 scarce shared resource, not default labor).
 * Returns undefined when the pools physically cannot supply the requested workers —
 * the §8 "insufficient labor blocks launch" case.
 */
export function selectPartyComposition(
  available: MobilityRolePools,
  requestedWorkers: number,
  preference: "fast" | "balanced",
): PartyComposition | undefined {
  const total = available.limited + available.typical + available.high;

  if (requestedWorkers < 1 || total < requestedWorkers) {
    return undefined;
  }

  let remaining = requestedWorkers;
  const order: readonly (keyof MobilityRolePools)[] =
    preference === "fast" ? ["high", "typical", "limited"] : ["typical", "high", "limited"];
  const draw: Record<keyof MobilityRolePools, number> = { limited: 0, typical: 0, high: 0 };

  for (const pool of order) {
    const take = Math.min(remaining, available[pool]);
    draw[pool] = take;
    remaining -= take;
  }

  return remaining > 0 ? undefined : { limited: draw.limited, typical: draw.typical, high: draw.high };
}

/** Bounded pace factor of a mixed party: who walks shapes how far the party goes. */
export function derivePartyPaceFactor(composition: PartyComposition | undefined): number {
  if (composition === undefined) {
    return 1;
  }

  const total = partyCompositionTotal(composition);

  if (total <= 0) {
    return 1;
  }

  return (
    1 +
    (composition.high * HIGH_POOL_PACE_BONUS - composition.limited * LIMITED_POOL_PACE_PENALTY) / total
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPEDITIONARY-4 §6/§7 — THE CANONICAL TRAVEL-PACE BOUNDARY.
//
// Every currently relevant human travel mode derives its pace HERE, from the same
// stored conditioning + existing health/nutrition authorities, so no movement
// system carries its own private pace constant. Contexts are NOT one universal
// equation: a selected party and a whole-band residential column answer different
// physical questions and are derived differently below.
// ─────────────────────────────────────────────────────────────────────────────

export type TravelContext =
  | "selected_reconnaissance_party"
  | "resource_expedition"
  | "loaded_return_party"
  | "task_camp_shuttle"
  | "whole_band_residential_move"
  | "emergency_residential_move"
  | "delayed_or_injured_party";

export interface TravelPace {
  readonly context: TravelContext;
  readonly kmPerTravelDay: number;
  readonly tilesPerTravelDay: number;
}

/**
 * §7 — whole-band residential column capacity. A residential move carries EVERYONE:
 * dependents and elders (the existing aggregate cohorts, used honestly as physical
 * constraints), camp possessions, waiting, repeated regrouping, and camp
 * establishment. The column factor is why a band's home moves at a fraction of what
 * its selected adults can walk — it is NOT a tuned copy of the old flat constants.
 */
export function deriveResidentialColumnFactor(band: Band): number {
  const population = Math.max(1, band.demography.population);
  const dependentShare = clamp01(band.demography.dependents / population);
  const elderShare = clamp01(band.demography.elders / population);
  // Band-known camp/carry burden (bodyCampLogistics is lived state, not hidden truth).
  const carryConstraint = clamp01(band.bodyCampLogistics?.behavior?.carryConstraintBias ?? 0);
  // Base: even an all-adult column loses roughly half its selected-party pace to
  // packing, group cohesion, and making/breaking camp.
  const factor = 0.5 - dependentShare * 0.35 - elderShare * 0.28 - carryConstraint * 0.12;
  return Math.max(0.15, round3(factor));
}

/**
 * Derive the pace for a travel context. Party contexts read the party's composition
 * (§8 pools); the residential contexts read the whole band's cohorts. Urgency raises
 * willingness (overreach), never stamina, in every context.
 */
export function deriveTravelPace(
  band: Band,
  context: TravelContext,
  options?: {
    readonly loadRatio?: number;
    readonly urgency?: number;
    readonly injuryLoad?: number;
    readonly partyComposition?: PartyComposition;
  },
): TravelPace {
  const capacity = deriveMobilityCapacity(band, {
    loadRatio: options?.loadRatio,
    urgency: options?.urgency,
  });
  const partyFactor = derivePartyPaceFactor(options?.partyComposition);
  const injuryFactor = Math.max(0.4, 1 - clamp01(options?.injuryLoad ?? 0));
  const urgency = clamp01(options?.urgency ?? 0);

  let km: number;

  switch (context) {
    case "selected_reconnaissance_party":
      // Unloaded, chosen walkers; urgency may push toward overreach.
      km = (urgency > 0 ? capacity.overreachKmPerActiveDay : capacity.currentKmPerActiveDay) * partyFactor;
      break;
    case "resource_expedition":
      km = capacity.currentKmPerActiveDay * partyFactor;
      break;
    case "loaded_return_party":
      km = capacity.loadedKmPerActiveDay * partyFactor;
      break;
    case "task_camp_shuttle":
      // Short repeated legs between camp and stand: partly loaded both ways.
      km = (capacity.currentKmPerActiveDay + capacity.loadedKmPerActiveDay) / 2 * partyFactor;
      break;
    case "delayed_or_injured_party":
      km = capacity.loadedKmPerActiveDay * partyFactor;
      break;
    case "whole_band_residential_move":
      km = capacity.currentKmPerActiveDay * deriveResidentialColumnFactor(band);
      break;
    case "emergency_residential_move":
      // The column can force-march (overreach willingness), but it is still a column.
      km = capacity.overreachKmPerActiveDay * deriveResidentialColumnFactor(band);
      break;
  }

  const kmPerTravelDay = round3(Math.min(MOBILITY_TECHNICAL_MAX_KM_PER_DAY, Math.max(0.3, km * injuryFactor)));
  return {
    context,
    kmPerTravelDay,
    tilesPerTravelDay: round3(kmPerTravelDay / KM_PER_TILE),
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
