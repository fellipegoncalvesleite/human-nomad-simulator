// ECO-SEASON-1 — Seasonal resource ecology substrate.
//
// Gives each resource DOMAIN at a tile a deterministic realized availability factor
// THIS season, and turns what activity groups observe into learned seasonal memory.
//
// HIDDEN TRUTH, LEARNED ONLY BY OBSERVATION: the realized factor blends (a) the real
// environment this season (`getSeasonalTileConditions` + the tile's authored
// `seasonalProfile` — the existing seasonal truth) with (b) a deterministic per-(tile,
// domain) seasonal SIGNATURE so different patches peak in different seasons. Bands never
// read this directly; they only learn it through trips (water checks, foraging, fishing,
// hunting, failed trips, repeated observation) recorded into `seasonalEcologyMemory`.
//
// HARD SCOPE (substrate, not economy): the factor only scales the SHADOW subsistence
// estimate (consumed by the real economy solely via the OFF-by-default AG11 supplement)
// and the separate `seasonalEcologyMemory`. It NEVER touches support/yield/carrying-
// capacity/population/stress/mortality/relocation, never mutates ResourcePatchMemory
// (which the 2K.9 learned-support reader consumes), and never changes the canonical
// activityOutcome. PURE: no unseeded random call, no `any`, no UI/render/store imports.

import type { ReasonId, Season, TickNumber, TileId } from "../core/types";
import { getSeasonalTileConditions } from "../world/seasonal";
import type { WorldState } from "../world/types";
import type {
  IntraSeasonTripTaskGroupType,
  SeasonalEcologyDomain,
  SeasonalEcologyFactorSummary,
  SeasonalEcologyObservation,
  SeasonalEcologyTendencyClass,
  SeasonalEcologyWetDryTendency,
} from "./types";

const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];
// Reference scale for normalizing `currentFoodEstimate` (which ranges ~0..100) into 0..1.
const FOOD_ESTIMATE_REFERENCE = 60;
// How much of the realized factor is the real environment vs the per-patch signature.
const ENVIRONMENT_WEIGHT = 0.62;
const SIGNATURE_WEIGHT = 0.38;
// Bounded learned-memory size per band (drop the least-recently-observed tile).
const SEASONAL_ECOLOGY_MEMORY_CAP = 32;

export function taskGroupTypeToEcologyDomain(
  taskGroupType: IntraSeasonTripTaskGroupType,
): SeasonalEcologyDomain {
  switch (taskGroupType) {
    case "water_group":
      return "water_reliability";
    case "fishing_group":
      return "fishing";
    case "hunting_group":
      return "hunting_game";
    case "plant_gathering_group":
    case "plant_followup_group":
      return "plant_patch";
    case "memory_refresh_group":
      return "gathering_general";
    case "local_foraging_group":
    default:
      return "local_foraging";
  }
}

// Realized seasonal availability for `domain` at `tileId` THIS season. Cheap: one tile,
// reuses the existing seasonal-conditions derivation. Deterministic.
export function deriveSeasonalEcologyFactor(
  world: WorldState,
  tileId: TileId,
  domain: SeasonalEcologyDomain,
): SeasonalEcologyFactorSummary {
  const season = world.time.season;
  const tile = world.tiles[tileId];

  if (tile === undefined) {
    return neutralFactor(domain, season);
  }

  const conditions = getSeasonalTileConditions(world, tile);
  const profile = tile.seasonalProfile;
  const baselineFactor = clamp01(profile.reliability);
  const foodNorm = clamp01(conditions.currentFoodEstimate / FOOD_ESTIMATE_REFERENCE);

  // (a) Real-environment component for this domain, this season.
  let environmentComponent: number;
  switch (domain) {
    case "water_reliability":
      environmentComponent = clamp01(1 - conditions.currentWaterStress);
      break;
    case "fishing":
      environmentComponent = clamp01(conditions.currentAquaticReliability);
      break;
    case "hunting_game":
      // Game stays uncertain: a moderate, low-amplitude environmental read.
      environmentComponent = clamp01(0.4 + foodNorm * 0.3 - conditions.currentDroughtStress * 0.15);
      break;
    case "plant_patch":
    case "gathering_general":
    case "local_foraging":
      environmentComponent = clamp01(foodNorm - conditions.currentDroughtStress * 0.18);
      break;
    default:
      environmentComponent = baselineFactor;
      break;
  }

  // (b) Per-patch hidden seasonal signature: each (tile, domain) prefers some season.
  const preferredSeasonIndex = signatureHash(tile.coord.x, tile.coord.y, domain, 0) % SEASONS.length;
  const seasonIndex = SEASONS.indexOf(season);
  const seasonDistance = Math.min(
    Math.abs(seasonIndex - preferredSeasonIndex),
    SEASONS.length - Math.abs(seasonIndex - preferredSeasonIndex),
  );
  // distance 0 (peak) -> ~0.85, 1 -> ~0.55, 2 (opposite/lean) -> ~0.3, modulated by variance.
  const variance = clamp01(profile.seasonalVariance);
  const signatureComponent = clamp01(0.85 - seasonDistance * (0.22 + variance * 0.16));

  const availabilityFactor = clamp01(
    environmentComponent * ENVIRONMENT_WEIGHT + signatureComponent * SIGNATURE_WEIGHT,
  );
  const seasonalDelta = round4(availabilityFactor - baselineFactor);
  const wetDryTendency = deriveWetDryTendency(conditions, domain);
  const hiddenTendencyClass = deriveTendencyClass(seasonDistance, profile.peakSeasons.includes(season), profile.leanSeasons.includes(season));
  const shadowSeasonalResult: SeasonalEcologyFactorSummary["shadowSeasonalResult"] =
    seasonalDelta > 0.06 ? "boosted" : seasonalDelta < -0.06 ? "reduced" : "neutral";

  return {
    domain,
    season,
    availabilityFactor: round4(availabilityFactor),
    baselineFactor: round4(baselineFactor),
    seasonalDelta,
    wetDryTendency,
    hiddenTendencyClass,
    shadowSeasonalResult,
    taughtSeasonalHint: true,
    driverSummary: `${domain} ${season}: env=${round2(environmentComponent)} sig=${round2(signatureComponent)} (${hiddenTendencyClass}, ${wetDryTendency})`,
    reasonIds: [`reason:seasonal-ecology:${String(tileId)}:${season}:${domain}` as ReasonId],
  };
}

// Multiplier (~0.5..1.3) the shadow estimate is scaled by; 1 = season-neutral. Centered
// so a peak season modestly boosts and a lean season modestly reduces the SHADOW only.
export function shadowSeasonalModifier(factor: SeasonalEcologyFactorSummary): number {
  return round4(clamp(0.55 + factor.availabilityFactor * 0.75, 0.5, 1.3));
}

// Update the band's learned seasonal memory from one observed trip. Bounded; the economy
// never reads this structure, so it cannot affect carrying capacity.
export function updateSeasonalEcologyMemory(
  previous: Readonly<Record<TileId, SeasonalEcologyObservation>> | undefined,
  tileId: TileId,
  factor: SeasonalEcologyFactorSummary,
  tick: TickNumber,
): Readonly<Record<TileId, SeasonalEcologyObservation>> {
  const prior = previous?.[tileId];
  const season = factor.season;
  const success = factor.availabilityFactor >= 0.5;
  const priorReliability = prior?.seasonalReliabilityBySeason[season];
  const blendedReliability =
    priorReliability === undefined
      ? factor.availabilityFactor
      : round4(priorReliability * 0.6 + factor.availabilityFactor * 0.4);

  const observed: SeasonalEcologyObservation = {
    tileId,
    domain: factor.domain,
    observedSeasons: prior?.observedSeasons.includes(season)
      ? prior.observedSeasons
      : [...(prior?.observedSeasons ?? []), season],
    lastObservedSeason: season,
    lastObservedTick: tick,
    seasonalReliabilityBySeason: {
      ...(prior?.seasonalReliabilityBySeason ?? {}),
      [season]: blendedReliability,
    },
    drySeasonConcern: clamp01(
      (prior?.drySeasonConcern ?? 0) + (factor.wetDryTendency === "dry" && !success ? 0.2 : factor.wetDryTendency === "dry" ? 0.05 : -0.04),
    ),
    wetSeasonOpportunity: clamp01(
      (prior?.wetSeasonOpportunity ?? 0) + (factor.wetDryTendency === "wet" && success ? 0.18 : -0.03),
    ),
    repeatedSeasonalSuccessCount: (prior?.repeatedSeasonalSuccessCount ?? 0) + (success ? 1 : 0),
    repeatedSeasonalFailureCount: (prior?.repeatedSeasonalFailureCount ?? 0) + (success ? 0 : 1),
    reasonIds: factor.reasonIds,
    noSupportChange: true,
    noCarryingCapacityChange: true,
    noYieldChange: true,
  };

  const next: Record<TileId, SeasonalEcologyObservation> = { ...(previous ?? {}), [tileId]: observed };

  return boundSeasonalEcologyMemory(next);
}

function boundSeasonalEcologyMemory(
  memory: Record<TileId, SeasonalEcologyObservation>,
): Readonly<Record<TileId, SeasonalEcologyObservation>> {
  const entries = Object.values(memory);

  if (entries.length <= SEASONAL_ECOLOGY_MEMORY_CAP) {
    return memory;
  }

  // Keep the most-recently-observed tiles (deterministic tie-break by tileId).
  const kept = [...entries]
    .sort((left, right) =>
      Number(right.lastObservedTick) - Number(left.lastObservedTick) ||
      String(left.tileId).localeCompare(String(right.tileId)),
    )
    .slice(0, SEASONAL_ECOLOGY_MEMORY_CAP);
  const bounded: Record<TileId, SeasonalEcologyObservation> = {};

  for (const entry of kept) {
    bounded[entry.tileId] = entry;
  }

  return bounded;
}

function deriveWetDryTendency(
  conditions: { readonly currentDroughtStress: number; readonly currentAquaticReliability: number; readonly currentWaterStress: number },
  domain: SeasonalEcologyDomain,
): SeasonalEcologyWetDryTendency {
  if (conditions.currentDroughtStress >= 0.5 || (domain === "water_reliability" && conditions.currentWaterStress >= 0.6)) {
    return "dry";
  }

  if (conditions.currentAquaticReliability >= 0.5 || conditions.currentWaterStress <= 0.25) {
    return "wet";
  }

  return "neutral";
}

function deriveTendencyClass(
  seasonDistance: number,
  isProfilePeak: boolean,
  isProfileLean: boolean,
): SeasonalEcologyTendencyClass {
  if (seasonDistance === 0 && isProfilePeak) {
    return "strong_peak";
  }

  if (seasonDistance === 0) {
    return "peak";
  }

  if (seasonDistance >= 2 && isProfileLean) {
    return "strong_lean";
  }

  if (seasonDistance >= 2) {
    return "lean";
  }

  return "neutral";
}

function neutralFactor(domain: SeasonalEcologyDomain, season: Season): SeasonalEcologyFactorSummary {
  return {
    domain,
    season,
    availabilityFactor: 0.5,
    baselineFactor: 0.5,
    seasonalDelta: 0,
    wetDryTendency: "neutral",
    hiddenTendencyClass: "neutral",
    shadowSeasonalResult: "neutral",
    taughtSeasonalHint: false,
    driverSummary: `${domain} ${season}: tile missing -> neutral`,
    reasonIds: [],
  };
}

// Deterministic integer hash of a tile coordinate + domain + salt -> small non-negative int.
function signatureHash(x: number, y: number, domain: SeasonalEcologyDomain, salt: number): number {
  let hash = Math.imul(x + 0x9e3779b1, 0x85ebca77);
  hash ^= Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  hash ^= Math.imul(domainSalt(domain) + salt + 0x165667b1, 0x9e3779b1);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;

  return (hash >>> 0) % 0x7fffffff;
}

function domainSalt(domain: SeasonalEcologyDomain): number {
  switch (domain) {
    case "water_reliability":
      return 11;
    case "local_foraging":
      return 23;
    case "gathering_general":
      return 37;
    case "plant_patch":
      return 53;
    case "fishing":
      return 71;
    case "hunting_game":
      return 91;
    case "route_access_future":
      return 113;
    case "dry_season_refuge_future":
      return 131;
    case "wet_season_patch_future":
      return 151;
    default:
      return 7;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
