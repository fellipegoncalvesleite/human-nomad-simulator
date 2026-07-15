// PERF-1 — pure simulation runner. The single shared definition of "build a
// runnable world" and "advance it N requested calendar steps", used by BOTH the browser worker
// (src/worker/simWorker.ts) and the node-side equivalence proof. Pure src/sim
// code: no DOM, no postMessage, no UI imports — so worker-vs-direct
// equivalence is provable headlessly (they call exactly these functions).

import {
  applyInitialBandPlacements,
  removeInitialBands,
  spawnCustomBands,
  spawnInitialBands,
  spawnSingleOriginBand,
  spawnVariedMigrationBands,
} from "../agents/spawn";
import type { AddedBandSpec } from "../agents/spawn";
export { derivePlacementEcologyPreview, validateAddedBandPlacement, validateInitialBandPlacement, addedBandId } from "../agents/spawn";
export type { AddedBandSpec, AddedBandKnowledgePreset, InitialBandPlacementValidation, PlacementEcologyPreview } from "../agents/spawn";
import { hashSeedString } from "../core/seededVariation";
import { summarizeWorldEcology } from "../agents/ecologySummary";
import type { WorldEcologySummary } from "../agents/ecologySummary";
export { summarizeWorldEcology } from "../agents/ecologySummary";
export type { WorldEcologySummary } from "../agents/ecologySummary";
import { applyTerrainEdits } from "../world/mapEdits";
import type { TerrainEdit } from "../world/mapEdits";
export {
  applyTerrainEdits,
  TERRAIN_PAINT_KINDS,
  validateTerrainEdits,
  validateWorldSetup,
} from "../world/mapEdits";
export type {
  SetupValidationIssue,
  TerrainEdit,
  TerrainEditValidation,
  TerrainPaintKind,
} from "../world/mapEdits";
import type { Band } from "../agents/types";
import type { BandId, SimulationSeed, StepMode, TileId } from "../core/types";
import type { Decision } from "../rules/types";
import { advanceWorldByDays } from "../tick/advance";
import type { SeasonalDecisionObserver } from "../tick/advance";
import type { FoodDemographyDiagnostics } from "../diagnostics/foodDemographyDiagnostics";
import { getDaysForStepMode, resetWorldTime } from "../tick/time";
import {
  createRegionalDebugWorld,
  createVariedMigrationWorld,
  createWorld,
  DEFAULT_WORLD_CONFIG,
  REGIONAL_DEBUG_WORLD_CONFIG,
  VARIED_MIGRATION_WORLD_CONFIG,
} from "../world/generate";
import type { WorldState } from "../world/types";

export interface SimInitialBandPlacement {
  readonly bandId: BandId;
  readonly tileId: TileId;
}

interface SimWorldKindBase {
  readonly initialBandPlacements?: readonly SimInitialBandPlacement[];
  // PRE-RUN-BAND-MANAGER-1 — setup-only roster edits: default bands to remove and
  // custom starting bands to add. Applied only in the initial setup state.
  readonly removedInitialBandIds?: readonly BandId[];
  readonly addedBands?: readonly AddedBandSpec[];
  // PRE-RUN-MAP-MAKER-1 — setup-only terrain paint edits. Part of the run config
  // (reproducible, deterministic); applied to the generated terrain BEFORE any
  // band spawns so spawn scoring and every derived layer see the edited map.
  readonly terrainEdits?: readonly TerrainEdit[];
}

export type SimWorldKind =
  | (SimWorldKindBase & { readonly kind: "map1" })
  | (SimWorldKindBase & { readonly kind: "map2" })
  | (SimWorldKindBase & { readonly kind: "map2_single_origin" })
  | (SimWorldKindBase & {
      readonly kind: "procedural";
      readonly seed: string;
      // Optional custom size for player-made procedural maps (clamped to sane
      // bounds); omitted keeps the historical default config byte-identical.
      readonly size?: { readonly width: number; readonly height: number };
    });

// VAR-1: an optional run seed perturbs only near-tie decision ordering (NOT
// terrain — that stays fixed per map). Omitted/empty → legacy deterministic
// movie (byte-identical to pre-VAR-1). A given runSeed string is fully
// reproducible. Terrain seed (the map config) is unchanged.
export function initSimWorld(init: SimWorldKind, runSeed?: string): WorldState {
  // Setup roster edits, in order: remove defaults → move remaining defaults →
  // add custom bands. All are setup-only (no-ops once the run has advanced).
  const removed = removeInitialBands(buildBaseWorld(init), init.removedInitialBandIds);
  const placed = applyInitialBandPlacements(removed, init.initialBandPlacements);
  const base = spawnCustomBands(placed, init.addedBands, String(placed.seed));

  if (runSeed === undefined || runSeed.length === 0) {
    return base;
  }

  return { ...base, runSeed: hashSeedString(runSeed) };
}

// PRE-RUN-MAP-MAKER-1 — custom procedural sizes are clamped so a typo can never
// request a degenerate or tab-freezing world.
const PROCEDURAL_SIZE_MIN = 16;
const PROCEDURAL_SIZE_MAX = 220;

function clampProceduralSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(PROCEDURAL_SIZE_MIN, Math.min(PROCEDURAL_SIZE_MAX, Math.round(value)));
}

function buildBaseWorld(init: SimWorldKind): WorldState {
  // Terrain paint edits apply to the freshly generated terrain BEFORE any band
  // spawns, so default spawn scoring adapts to the edited map deterministically.
  switch (init.kind) {
    case "map1":
      return spawnInitialBands(
        applyTerrainEdits(createRegionalDebugWorld(REGIONAL_DEBUG_WORLD_CONFIG), init.terrainEdits),
      );
    case "map2":
      return spawnVariedMigrationBands(
        applyTerrainEdits(createVariedMigrationWorld(VARIED_MIGRATION_WORLD_CONFIG), init.terrainEdits),
      );
    case "map2_single_origin":
      return spawnSingleOriginBand(
        applyTerrainEdits(createVariedMigrationWorld(VARIED_MIGRATION_WORLD_CONFIG), init.terrainEdits),
      );
    case "procedural": {
      const config =
        init.size === undefined
          ? DEFAULT_WORLD_CONFIG
          : {
              ...DEFAULT_WORLD_CONFIG,
              width: clampProceduralSize(init.size.width, DEFAULT_WORLD_CONFIG.width),
              height: clampProceduralSize(init.size.height, DEFAULT_WORLD_CONFIG.height),
            };

      return applyTerrainEdits(createWorld(config, init.seed as SimulationSeed), init.terrainEdits);
    }
  }
}

export function stepSim(
  world: WorldState,
  steps: number,
  stepMode: StepMode = "seasonal",
  decisionObserver?: SeasonalDecisionObserver,
  diagnostics?: FoodDemographyDiagnostics,
): WorldState {
  let current = world;
  const elapsedDays = getDaysForStepMode(stepMode);

  for (let index = 0; index < steps; index += 1) {
    current = advanceWorldByDays(current, elapsedDays, decisionObserver, diagnostics);
  }

  return current;
}

export function resetSimTime(world: WorldState): WorldState {
  return resetWorldTime(world);
}

// The DYNAMIC part of a world — everything that changes across ticks. The
// static remainder (tiles, rivers, crossings, regions, config, seed, climate
// regime) is deterministic per world kind, so the main thread keeps its own
// identical copy and merges snapshots over it (tiles reference stays stable —
// render caches depend on that).
export interface SimDynamicSnapshot {
  readonly time: WorldState["time"];
  readonly bands: WorldState["bands"];
  readonly decisions: WorldState["decisions"];
  readonly decisionArchive: WorldState["decisionArchive"];
  readonly currentClimateStress: WorldState["currentClimateStress"];
  readonly tileDepletion: WorldState["tileDepletion"];
  readonly faunaStocks: WorldState["faunaStocks"];
  readonly plantPatchState: WorldState["plantPatchState"];
  readonly forestPatchState: WorldState["forestPatchState"];
  // SIM-TOOLS-1 — tiny world-TRUTH ecology aggregate for the explicitly-labelled
  // DEBUG ecology view only (never used by the selected-band view, which derives
  // from band knowledge). Bounded to a few dozen numbers, so it rides the snapshot
  // cheaply and is recomputed only when a full snapshot is posted.
  readonly ecologySummary: WorldEcologySummary;
}

export function takeDynamicSnapshot(world: WorldState): SimDynamicSnapshot {
  return {
    time: world.time,
    bands: world.bands,
    decisions: world.decisions,
    decisionArchive: world.decisionArchive,
    currentClimateStress: world.currentClimateStress,
    tileDepletion: world.tileDepletion,
    faunaStocks: world.faunaStocks,
    plantPatchState: world.plantPatchState,
    forestPatchState: world.forestPatchState,
    ecologySummary: summarizeWorldEcology(world),
  };
}

export function mergeDynamicSnapshot(
  staticWorld: WorldState,
  snapshot: SimDynamicSnapshot,
): WorldState {
  return {
    ...staticWorld,
    time: snapshot.time,
    bands: snapshot.bands,
    decisions: snapshot.decisions,
    decisionArchive: snapshot.decisionArchive,
    currentClimateStress: snapshot.currentClimateStress,
    tileDepletion: snapshot.tileDepletion,
    faunaStocks: snapshot.faunaStocks,
    plantPatchState: snapshot.plantPatchState,
    forestPatchState: snapshot.forestPatchState,
  };
}

// PERF-1 snapshot-pipeline fix: by late centuries the full dynamic snapshot
// reaches ~18MB and a structuredClone costs ~280ms PER SIDE — posting it every
// throttle interval was the remaining lag. The live overlay is the ~KB subset
// the UI needs every frame (markers + clock + counts); full snapshots are
// posted rarely (or on pause/step) for the inspection panels.

// TIME/PLAYBACK-STABILITY: the live overlay now also carries a BOUNDED per-band
// activity summary so the map can draw activity from the SAME fresh source as the
// band marker (every tick), instead of the rare ~18MB full snapshot. Previously
// activity records lived only in the full snapshot, so at fast/Civilization-Skip
// speed activity (and the selected band marker, which was pinned to the snapshot to
// stay attached to its routes) froze for ~2.5s while the clock advanced. This is a
// tiny render projection of `IntraSeasonTripRecord` — only the fields the canvas
// renderer reads — capped per band and with downsampled (already-bounded) paths, so
// it scales like the existing markers, nowhere near the snapshot cost.
const OVERLAY_RECENT_ACTIVITY_CAP = 12;
const OVERLAY_ACTIVITY_PATH_CAP = 24;

export interface SimLiveActivityTrip {
  readonly day: WorldState["time"]["day"];
  readonly tick: WorldState["time"]["tick"];
  readonly sourceBandId: string;
  readonly originTileId: string;
  readonly targetTileId: string;
  readonly taskGroupType: string;
  readonly cause: string;
  readonly outcome: string;
  readonly pathTiles: readonly string[];
}

export interface SimLiveMarker {
  readonly id: string;
  readonly position: string;
  readonly color: string;
  readonly isDaughter: boolean;
  readonly separationActive: boolean;
  // CAUSAL-REPAIR-2 — true while the RESIDENTIAL band is displayed mid-route on
  // its recorded seasonal travel (sub-season playback only). Render-only.
  readonly traveling?: boolean;
  // Bounded, render-only recent activity for THIS band, newest first. Same fresh
  // tick as `position`, so the map draws marker + activity consistently at speed.
  readonly recentActivity: readonly SimLiveActivityTrip[];
}

export interface SimLiveOverlay {
  readonly time: WorldState["time"];
  readonly markers: readonly SimLiveMarker[];
  readonly totals: {
    readonly activeBands: number;
    readonly totalBands: number;
    readonly absorbed: number;
    readonly extinct: number;
    readonly population: number;
  };
}

// LIVE-FOLLOW-PANEL-1 — selected-band-only panel refresh payload. The full
// dynamic world snapshot stays rare while running; this carries exactly the one
// inspected band, current time, and that band's latest decision so the detail
// panel can repaint live without rebuilding all-band UI projections.
export interface SimSelectedBandPanelProjection {
  readonly selectedBandId: string;
  readonly time: WorldState["time"];
  readonly detailMode: "live-summary";
  readonly band: SimSelectedBandLiveSummary;
  readonly latestDecisionId?: string;
  readonly latestDecision?: Decision;
  readonly diagnostics: SimSelectedBandProjectionDiagnostics;
}

export interface SimSelectedBandProjectionDiagnostics {
  readonly projectionKey: string;
  readonly selectedBandOnly: true;
  readonly rawBandBytesEstimate: number;
  readonly compactBandBytesEstimate: number;
  readonly detailMode: "live-summary";
  readonly caps: {
    readonly recentTrips: number;
    readonly activityPathTiles: number;
    readonly residentialMoves: number;
    readonly residentialMovePathTiles: number;
    readonly movementHistory: number;
    readonly eventHistory: number;
    readonly campTalk: number;
    readonly campTalkLedger: number;
    readonly decisionHistory: number;
  };
}

export interface SimSelectedBandLiveSummary {
  readonly id: Band["id"];
  readonly name: Band["name"];
  readonly color: Band["color"];
  readonly position: Band["position"];
  readonly size: Band["size"];
  readonly status: Band["status"];
  readonly mobilityStrategy: Band["mobilityStrategy"];
  readonly subsistenceModes: Band["subsistenceModes"];
  readonly technologies: Band["technologies"];
  readonly parentBandId?: Band["parentBandId"];
  readonly daughterBandIds: Band["daughterBandIds"];
  readonly lineage?: Band["lineage"];
  readonly currentIntent?: Band["currentIntent"];
  readonly intentHistory?: Band["intentHistory"];
  readonly movementHistory: Band["movementHistory"];
  readonly decisionHistory: Band["decisionHistory"];
  readonly consecutiveSeasonsOnTile: Band["consecutiveSeasonsOnTile"];
  readonly cohesion: Band["cohesion"];
  readonly hungerPressure: Band["hungerPressure"];
  readonly territorialPressure: Band["territorialPressure"];
  readonly demography: Band["demography"];
  readonly biomeAdaptation: Band["biomeAdaptation"];
  readonly socialPressure: Band["socialPressure"];
  readonly health: Band["health"];
  readonly pressureState?: Band["pressureState"];
  readonly viability?: Band["viability"];
  readonly disposition?: Band["disposition"];
  readonly temporarySeparation?: Band["temporarySeparation"];
  readonly conditionProfile?: Band["conditionProfile"];
  readonly eventHistory?: Band["eventHistory"];
  readonly campRumors?: Band["campRumors"];
  readonly lastIntraSeasonTrip?: Band["lastIntraSeasonTrip"];
  readonly recentIntraSeasonTrips?: Band["recentIntraSeasonTrips"];
  readonly activityLaborSummary?: Band["activityLaborSummary"];
  readonly recentResidentialMoveEvents?: Band["recentResidentialMoveEvents"];
  readonly seasonalSupport?: Band["seasonalSupport"];
  readonly carryingCapacity?: Band["carryingCapacity"];
  readonly perCapitaReturn?: Band["perCapitaReturn"];
  readonly daughterColonization?: Band["daughterColonization"];
  readonly rangeSaturation?: Band["rangeSaturation"];
  readonly residentialAnchor?: Band["residentialAnchor"];
  readonly protoCampMemory?: Band["protoCampMemory"];
  readonly protoAccessMemory?: Band["protoAccessMemory"];
  readonly bodyCampLogistics?: Band["bodyCampLogistics"];
  readonly visibleNature?: Band["visibleNature"];
  readonly reportedKnowledge?: Band["reportedKnowledge"];
}

const SELECTED_PANEL_RECENT_TRIP_CAP = 8;
const SELECTED_PANEL_ACTIVITY_PATH_CAP = 12;
const SELECTED_PANEL_RESIDENTIAL_MOVE_CAP = 4;
const SELECTED_PANEL_RESIDENTIAL_MOVE_PATH_CAP = 16;
const SELECTED_PANEL_MOVEMENT_HISTORY_CAP = 8;
const SELECTED_PANEL_EVENT_CAP = 10;
const SELECTED_PANEL_EVENT_WINDOW_CAP = 12;
const SELECTED_PANEL_CAMP_TALK_CAP = 8;
const SELECTED_PANEL_CAMP_TALK_LEDGER_CAP = 8;
const SELECTED_PANEL_DECISION_HISTORY_CAP = 8;

function projectRecentActivity(band: Band): readonly SimLiveActivityTrip[] {
  const trips = band.recentIntraSeasonTrips;

  if (trips === undefined || trips.length === 0) {
    return [];
  }

  // `recentIntraSeasonTrips` is already newest-first; take the bounded head and
  // project only the fields the canvas renderer needs (path stays whole — BFS
  // routes are already short — but is hard-capped defensively).
  return trips.slice(0, OVERLAY_RECENT_ACTIVITY_CAP).map((trip) => ({
    day: trip.day,
    tick: trip.tick,
    sourceBandId: String(trip.sourceBandId),
    originTileId: String(trip.originTileId),
    targetTileId: String(trip.targetTileId),
    taskGroupType: String(trip.taskGroupType),
    cause: String(trip.cause),
    outcome: String(trip.outcome),
    pathTiles: trip.pathTiles.slice(0, OVERLAY_ACTIVITY_PATH_CAP).map((tileId) => String(tileId)),
  }));
}

export function takeSelectedBandPanelProjection(
  world: WorldState,
  selectedBandId: string | null | undefined,
): SimSelectedBandPanelProjection | null {
  if (selectedBandId === null || selectedBandId === undefined) {
    return null;
  }

  const band = world.bands[selectedBandId as BandId];

  if (band === undefined) {
    return null;
  }

  const latestDecisionId =
    band.decisionHistory.length === 0
      ? undefined
      : band.decisionHistory[band.decisionHistory.length - 1];
  const latestDecision =
    latestDecisionId === undefined ? undefined : world.decisions[latestDecisionId];
  const compactBand = projectSelectedBandLiveSummary(band);
  const rawBandBytesEstimate = estimateJsonBytes(band);
  const compactBandBytesEstimate = estimateJsonBytes(compactBand);

  return {
    selectedBandId: String(band.id),
    time: world.time,
    detailMode: "live-summary",
    band: compactBand,
    ...(latestDecisionId === undefined ? {} : { latestDecisionId: String(latestDecisionId) }),
    ...(latestDecision === undefined ? {} : { latestDecision }),
    diagnostics: {
      projectionKey: selectedBandProjectionKey(world, band),
      selectedBandOnly: true,
      rawBandBytesEstimate,
      compactBandBytesEstimate,
      detailMode: "live-summary",
      caps: {
        recentTrips: SELECTED_PANEL_RECENT_TRIP_CAP,
        activityPathTiles: SELECTED_PANEL_ACTIVITY_PATH_CAP,
        residentialMoves: SELECTED_PANEL_RESIDENTIAL_MOVE_CAP,
        residentialMovePathTiles: SELECTED_PANEL_RESIDENTIAL_MOVE_PATH_CAP,
        movementHistory: SELECTED_PANEL_MOVEMENT_HISTORY_CAP,
        eventHistory: SELECTED_PANEL_EVENT_CAP,
        campTalk: SELECTED_PANEL_CAMP_TALK_CAP,
        campTalkLedger: SELECTED_PANEL_CAMP_TALK_LEDGER_CAP,
        decisionHistory: SELECTED_PANEL_DECISION_HISTORY_CAP,
      },
    },
  };
}

function selectedBandProjectionKey(world: WorldState, band: Band): string {
  return [
    String(world.seed),
    String(world.runSeed ?? ""),
    String(world.time.tick),
    String(world.time.day),
    world.time.season,
    String(band.id),
    String(band.position),
    String(band.decisionHistory[band.decisionHistory.length - 1] ?? ""),
  ].join("|");
}

function projectSelectedBandLiveSummary(band: Band): SimSelectedBandLiveSummary {
  return {
    id: band.id,
    name: band.name,
    color: band.color,
    position: band.position,
    size: band.size,
    status: band.status,
    mobilityStrategy: band.mobilityStrategy,
    subsistenceModes: band.subsistenceModes,
    technologies: band.technologies,
    ...(band.parentBandId === undefined ? {} : { parentBandId: band.parentBandId }),
    daughterBandIds: band.daughterBandIds,
    ...(band.lineage === undefined ? {} : { lineage: band.lineage }),
    ...(band.currentIntent === undefined ? {} : { currentIntent: band.currentIntent }),
    ...(band.intentHistory === undefined ? {} : { intentHistory: band.intentHistory.slice(-SELECTED_PANEL_MOVEMENT_HISTORY_CAP) }),
    movementHistory: band.movementHistory.slice(-SELECTED_PANEL_MOVEMENT_HISTORY_CAP),
    decisionHistory: band.decisionHistory.slice(-SELECTED_PANEL_DECISION_HISTORY_CAP),
    consecutiveSeasonsOnTile: band.consecutiveSeasonsOnTile,
    cohesion: band.cohesion,
    hungerPressure: band.hungerPressure,
    territorialPressure: band.territorialPressure,
    demography: band.demography,
    biomeAdaptation: band.biomeAdaptation,
    socialPressure: band.socialPressure,
    health: band.health,
    ...(band.pressureState === undefined ? {} : { pressureState: band.pressureState }),
    ...(band.viability === undefined ? {} : { viability: band.viability }),
    ...(band.disposition === undefined ? {} : { disposition: band.disposition }),
    ...(band.temporarySeparation === undefined ? {} : { temporarySeparation: band.temporarySeparation }),
    ...(band.conditionProfile === undefined ? {} : { conditionProfile: band.conditionProfile }),
    ...(band.eventHistory === undefined ? {} : { eventHistory: projectEventHistory(band.eventHistory) }),
    ...(band.campRumors === undefined ? {} : { campRumors: projectCampRumors(band.campRumors) }),
    ...(band.lastIntraSeasonTrip === undefined ? {} : { lastIntraSeasonTrip: projectActivityTrip(band.lastIntraSeasonTrip) }),
    ...(band.recentIntraSeasonTrips === undefined
      ? {}
      : { recentIntraSeasonTrips: band.recentIntraSeasonTrips.slice(0, SELECTED_PANEL_RECENT_TRIP_CAP).map(projectActivityTrip) }),
    ...(band.activityLaborSummary === undefined ? {} : { activityLaborSummary: band.activityLaborSummary }),
    ...(band.recentResidentialMoveEvents === undefined
      ? {}
      : {
          recentResidentialMoveEvents: band.recentResidentialMoveEvents
            .slice(0, SELECTED_PANEL_RESIDENTIAL_MOVE_CAP)
            .map(projectResidentialMove),
        }),
    ...(band.seasonalSupport === undefined ? {} : { seasonalSupport: band.seasonalSupport }),
    ...(band.carryingCapacity === undefined ? {} : { carryingCapacity: band.carryingCapacity }),
    ...(band.perCapitaReturn === undefined ? {} : { perCapitaReturn: band.perCapitaReturn }),
    ...(band.daughterColonization === undefined ? {} : { daughterColonization: band.daughterColonization }),
    ...(band.rangeSaturation === undefined ? {} : { rangeSaturation: band.rangeSaturation }),
    ...(band.residentialAnchor === undefined ? {} : { residentialAnchor: band.residentialAnchor }),
    ...(band.protoCampMemory === undefined ? {} : { protoCampMemory: band.protoCampMemory }),
    ...(band.protoAccessMemory === undefined ? {} : { protoAccessMemory: band.protoAccessMemory }),
    ...(band.bodyCampLogistics === undefined ? {} : { bodyCampLogistics: band.bodyCampLogistics }),
    ...(band.visibleNature === undefined ? {} : { visibleNature: band.visibleNature }),
    ...(band.reportedKnowledge === undefined ? {} : { reportedKnowledge: band.reportedKnowledge }),
  };
}

function projectActivityTrip(
  trip: NonNullable<Band["recentIntraSeasonTrips"]>[number],
): NonNullable<Band["recentIntraSeasonTrips"]>[number] {
  return {
    ...trip,
    pathTiles: trip.pathTiles.slice(0, SELECTED_PANEL_ACTIVITY_PATH_CAP),
  };
}

function projectResidentialMove(
  move: NonNullable<Band["recentResidentialMoveEvents"]>[number],
): NonNullable<Band["recentResidentialMoveEvents"]>[number] {
  return {
    ...move,
    pathTiles: move.pathTiles.slice(0, SELECTED_PANEL_RESIDENTIAL_MOVE_PATH_CAP),
  };
}

function projectEventHistory(
  eventHistory: NonNullable<Band["eventHistory"]>,
): NonNullable<Band["eventHistory"]> {
  return {
    ...eventHistory,
    recentEvents: eventHistory.recentEvents.slice(0, SELECTED_PANEL_EVENT_CAP),
    last10Years: eventHistory.last10Years.slice(0, SELECTED_PANEL_EVENT_WINDOW_CAP),
    last25Years: eventHistory.last25Years.slice(0, SELECTED_PANEL_EVENT_WINDOW_CAP),
  };
}

function projectCampRumors(
  campRumors: NonNullable<Band["campRumors"]>,
): NonNullable<Band["campRumors"]> {
  return {
    ...campRumors,
    items: campRumors.items.slice(0, SELECTED_PANEL_CAMP_TALK_CAP),
    repetitionLedger: campRumors.repetitionLedger.slice(0, SELECTED_PANEL_CAMP_TALK_LEDGER_CAP),
  };
}

function estimateJsonBytes(value: unknown): number {
  return JSON.stringify(value).length;
}

// CAUSAL-REPAIR-2 — where the RESIDENTIAL marker should be drawn mid-season.
// The sim's `band.position` remains the seasonal base (one update per seasonal
// decision — sim semantics untouched). But the season's relocation is already
// a RECORDED journey (ResidentialMoveEvent: departure day, arrival day, and a
// passability-aware route), so at sub-season playback the map walks the marker
// along that recorded route across those recorded days instead of teleporting
// it at the boundary and freezing it otherwise. Presentation-only: reads the
// explanatory record it was built for; no behavior, no new state.
function deriveInTransitDisplay(
  world: WorldState,
  band: Band,
): { readonly position: string; readonly traveling: boolean } {
  const settled = { position: String(band.position), traveling: false };
  const move = band.recentResidentialMoveEvents?.[0];

  if (
    move === undefined ||
    Number(move.tick) !== Number(world.time.tick) ||
    move.pathTiles.length < 2
  ) {
    return settled;
  }

  const dayOfSeason = world.time.dayOfSeason;

  if (dayOfSeason === undefined || dayOfSeason >= move.endDay) {
    return settled;
  }

  if (dayOfSeason <= move.startDay) {
    return { position: String(move.pathTiles[0]), traveling: move.startDay > 0 ? false : true };
  }

  const progress = (dayOfSeason - move.startDay) / Math.max(1, move.endDay - move.startDay);
  const index = Math.min(
    move.pathTiles.length - 1,
    Math.round(progress * (move.pathTiles.length - 1)),
  );

  return { position: String(move.pathTiles[index]), traveling: true };
}

export function takeLiveOverlay(
  world: WorldState,
  options?: { readonly subSeasonPlayback?: boolean },
): SimLiveOverlay {
  const bands = Object.values(world.bands);
  const markers: SimLiveMarker[] = [];
  const subSeasonPlayback = options?.subSeasonPlayback === true;
  let absorbed = 0;
  let extinct = 0;
  let population = 0;

  for (const band of bands) {
    population += band.demography.population;

    if (band.viability?.status === "absorbed") {
      absorbed += 1;
      continue;
    }

    if (band.viability?.status === "extinct") {
      extinct += 1;
      continue;
    }

    if (band.status === "dispersed") {
      continue;
    }

    const display = subSeasonPlayback
      ? deriveInTransitDisplay(world, band)
      : { position: String(band.position), traveling: false };

    markers.push({
      id: String(band.id),
      position: display.position,
      color: band.color,
      isDaughter: band.parentBandId !== undefined,
      separationActive: band.temporarySeparation?.active === true,
      ...(display.traveling ? { traveling: true } : {}),
      recentActivity: projectRecentActivity(band),
    });
  }

  return {
    time: world.time,
    markers,
    totals: {
      activeBands: markers.length,
      totalBands: bands.length,
      absorbed,
      extinct,
      population: Math.round(population),
    },
  };
}
