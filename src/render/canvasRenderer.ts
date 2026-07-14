import { SEASON_LENGTH_DAYS } from "../sim/core/types";
import type { BandId, DayNumber, TickNumber, TileId } from "../sim/core/types";
import type {
  Band,
  IntraSeasonTripRecord,
  LocalUsePressureRecord,
} from "../sim/agents/types";
import {
  getDaughterDispersalPressure,
  getNearbyBandPressure,
} from "../sim/agents/crowding";
import type { SimLiveActivityTrip, SimLiveOverlay } from "../sim/runner/simRunner";
import { getTileAtCoord } from "../sim/world/generate";
import { deriveFamiliarCountry } from "../sim/agents/familiarCountry";
import { deriveLineageIdentity } from "../sim/agents/lineageIdentity";
import {
  deriveForestPatchesForTile,
  estimateForestSuitability,
  getForestPatchState,
} from "../sim/agents/forestPatches";
import type { Tile, WorldState } from "../sim/world/types";
import {
  deriveBandPerceivedEcologicalOpportunity,
  deriveCurrentLivingEcologyTile,
  deriveHabitatPotentialTile,
  type BandPerceivedEcologicalOpportunityProjection,
} from "../sim/world/ecologicalProjection";
import { getSeasonalTerrainColor, getSeasonalVisualTimeKey } from "./seasonalVisuals";

// RANGE-3 Part 5: per-tick memo for identity colors — rebuilt once per tick,
// reused across frames within the same tick (cheap: one derivation per band per tick).
let identityColorTick = Number.NaN;
const identityColorByBand = new Map<string, string>();
let familiarRangeWorld: WorldState | null = null;
let familiarRangeTick = Number.NaN;
const familiarRangeByBand = new Map<string, ReturnType<typeof deriveFamiliarCountry>>();

function getBandIdentityColor(band: Band, world: WorldState): string {
  const tick = Number(world.time.tick);
  if (tick !== identityColorTick) {
    identityColorTick = tick;
    identityColorByBand.clear();
  }
  const key = String(band.id);
  const cached = identityColorByBand.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const parent = band.parentBandId !== undefined ? world.bands[band.parentBandId] : undefined;
  const color = deriveLineageIdentity(band, parent, world, world.time.tick).identityColor;
  identityColorByBand.set(key, color);
  return color;
}

function getCachedFamiliarCountry(band: Band, world: WorldState): ReturnType<typeof deriveFamiliarCountry> {
  const tick = Number(world.time.tick);
  if (world !== familiarRangeWorld || tick !== familiarRangeTick) {
    familiarRangeWorld = world;
    familiarRangeTick = tick;
    familiarRangeByBand.clear();
  }

  const key = String(band.id);
  const cached = familiarRangeByBand.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const range = deriveFamiliarCountry(band, world.time.tick);
  familiarRangeByBand.set(key, range);
  return range;
}

export type MapViewMode =
  | "terrain"
  | "habitat_potential"
  | "living_ecology"
  | "known_opportunity"
  | "water"
  | "elevation"
  | "movement";

export type ActivityOverlayMode = "off" | "selected" | "all";
// RANGE-1: the familiar-country wash is selected-band-only (never per-band), independent of
// the Activity overlay — Activity = groups doing things now; Range = known/used space over time.
export type FamiliarRangeOverlayMode = "off" | "selected" | "all";

export interface MapCamera {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface CanvasRendererOptions {
  readonly pixelRatio?: number;
}

export interface SetupPlacementPreview {
  readonly bandId: BandId;
  readonly tileId: TileId | null;
  readonly valid: boolean;
  readonly reason?: string;
}

export interface CanvasRenderSnapshot {
  readonly world: WorldState | null;
  // PERF-1: the ~KB live overlay ticks every season; the full world snapshot
  // arrives rarely. Band markers draw from whichever is fresher.
  readonly liveOverlay: SimLiveOverlay | null;
  readonly selectedBandId: BandId | null;
  readonly selectedActivityTripId: string | null;
  readonly selectedTileId: TileId | null;
  readonly hoveredTileId: TileId | null;
  readonly mapViewMode: MapViewMode;
  readonly showGrid: boolean;
  readonly showRivers: boolean;
  readonly showLegend: boolean;
  readonly activityOverlayMode: ActivityOverlayMode;
  readonly familiarRangeOverlayMode: FamiliarRangeOverlayMode;
  readonly seasonalVisualsEnabled: boolean;
  readonly setupPlacementPreview: SetupPlacementPreview | null;
  // PRE-RUN-MAP-MAKER-1 — live paint feedback while a setup terrain stroke is in
  // progress (pending tiles tinted with their target terrain) plus the brush
  // cursor. Null whenever the editor is closed; never present after tick 0.
  readonly mapEditorPreview: MapEditorPreview | null;
  readonly camera: MapCamera;
}

export interface MapEditorPreview {
  readonly pendingTiles: readonly {
    readonly x: number;
    readonly y: number;
    readonly terrain: string;
  }[];
  readonly brush: {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  } | null;
}

export interface CanvasRenderer {
  readonly render: (snapshot: CanvasRenderSnapshot) => void;
  readonly getTileIdAtClientPoint: (
    snapshot: CanvasRenderSnapshot,
    clientX: number,
    clientY: number,
  ) => TileId | null;
  readonly getBandIdAtClientPoint: (
    snapshot: CanvasRenderSnapshot,
    clientX: number,
    clientY: number,
  ) => BandId | null;
  readonly getActivityTripIdAtClientPoint: (
    snapshot: CanvasRenderSnapshot,
    clientX: number,
    clientY: number,
  ) => string | null;
  readonly dispose: () => void;
}

interface CanvasMetrics {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

interface WorldCanvasLayout {
  readonly cellSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
  // Device pixels per CSS pixel of the prepared context: tile fills snap to
  // DEVICE pixels so no background seams show through at fractional ratios.
  readonly pixelRatio: number;
}

interface VisibleTileBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

const MAX_WORLD_STATIC_LAYER_PIXELS = 300_000;
const MAX_WORLD_STATIC_LAYER_CELL_SIZE = 3.5;

interface LegendItem {
  readonly color: string;
  readonly label: string;
}

const ACTIVITY_OVERLAY_TRIP_CAP = 8;
const ACTIVITY_OVERLAY_DOT_CAP = 4;
const ACTIVITY_OVERLAY_ALL_BAND_TRIP_CAP = 2;
const ACTIVITY_OVERLAY_ALL_TOTAL_DOT_CAP = 64;
const ACTIVITY_OVERLAY_MIN_CELL_SIZE = 4;
const ACTIVITY_OVERLAY_PATH_CELL_SIZE = 7;

// TIME/PLAYBACK-STABILITY: the map's single fresh source. A render-only band +
// the subset of an activity trip the canvas draws. Both the band marker AND its
// activity now come from `getRenderBands`, which prefers the per-tick live overlay
// (fresh at Civilization-Skip speed) and only falls back to the rare full world
// snapshot when the overlay is not fresher (e.g. the very first frame). This kills
// the stale-snapshot freeze without forcing the ~18MB snapshot every tick.
interface RenderActivityTrip {
  readonly day: DayNumber;
  readonly tick: TickNumber;
  readonly sourceBandId: BandId;
  readonly originTileId: TileId;
  readonly targetTileId: TileId;
  readonly taskGroupType: string;
  readonly cause: string;
  readonly outcome: string;
  readonly pathTiles: readonly TileId[];
}

interface RenderBand {
  readonly id: BandId;
  readonly position: TileId;
  readonly color: string;
  readonly isDaughter: boolean;
  readonly separationActive: boolean;
  readonly recentActivity: readonly RenderActivityTrip[];
}

function projectOverlayActivityTrip(trip: SimLiveActivityTrip): RenderActivityTrip {
  return {
    day: trip.day as DayNumber,
    tick: trip.tick as TickNumber,
    sourceBandId: trip.sourceBandId as BandId,
    originTileId: trip.originTileId as TileId,
    targetTileId: trip.targetTileId as TileId,
    taskGroupType: trip.taskGroupType,
    cause: trip.cause,
    outcome: trip.outcome,
    pathTiles: trip.pathTiles as readonly TileId[],
  };
}

function projectWorldActivityTrip(trip: IntraSeasonTripRecord): RenderActivityTrip {
  return {
    day: trip.day,
    tick: trip.tick,
    sourceBandId: trip.sourceBandId,
    originTileId: trip.originTileId,
    targetTileId: trip.targetTileId,
    taskGroupType: trip.taskGroupType,
    cause: trip.cause,
    outcome: trip.outcome,
    pathTiles: trip.pathTiles,
  };
}

// The unified, fresh-when-possible band list the whole map draws from. Overlay
// markers and world bands are both filtered to ACTIVE bands and id-sorted, so the
// render order (and stacking) is deterministic regardless of source.
function getRenderBands(snapshot: CanvasRenderSnapshot): readonly RenderBand[] {
  const world = snapshot.world;

  if (world === null) {
    return [];
  }

  const overlay = snapshot.liveOverlay;
  const overlayFresher = overlay !== null && Number(overlay.time.tick) >= Number(world.time.tick);

  if (overlayFresher && overlay !== null) {
    return overlay.markers
      .map((marker) => ({
        id: marker.id as BandId,
        position: marker.position as TileId,
        color: marker.color,
        isDaughter: marker.isDaughter,
        separationActive: marker.separationActive,
        recentActivity: marker.recentActivity.map(projectOverlayActivityTrip),
      }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }

  return Object.values(world.bands)
    .filter(
      (band) =>
        band.status !== "dispersed" &&
        band.viability?.status !== "absorbed" &&
        band.viability?.status !== "extinct",
    )
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map((band) => ({
      id: band.id,
      position: band.position,
      color: band.color,
      isDaughter: band.parentBandId !== undefined,
      separationActive: band.temporarySeparation?.active === true,
      recentActivity: (band.recentIntraSeasonTrips ?? []).map(projectWorldActivityTrip),
    }));
}

export function getActivityTripId(trip: RenderActivityTrip): string {
  return [
    String(trip.sourceBandId),
    Number(trip.day),
    Number(trip.tick),
    String(trip.originTileId),
    String(trip.targetTileId),
    trip.taskGroupType,
    trip.cause,
  ].join("|");
}

export function getInitialMapCamera(): MapCamera {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}

export function zoomMapCamera(camera: MapCamera, factor: number): MapCamera {
  return {
    ...camera,
    zoom: clamp(camera.zoom * factor, 0.75, 24),
  };
}

export function zoomMapCameraAtPoint(
  camera: MapCamera,
  factor: number,
  point: { readonly x: number; readonly y: number },
  viewport: { readonly width: number; readonly height: number },
): MapCamera {
  const nextZoom = clamp(camera.zoom * factor, 0.75, 24);
  const zoomRatio = nextZoom / camera.zoom;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;

  return {
    zoom: nextZoom,
    panX: point.x - centerX - (point.x - centerX - camera.panX) * zoomRatio,
    panY: point.y - centerY - (point.y - centerY - camera.panY) * zoomRatio,
  };
}

export function panMapCamera(
  camera: MapCamera,
  deltaX: number,
  deltaY: number,
): MapCamera {
  return {
    ...camera,
    panX: camera.panX + deltaX,
    panY: camera.panY + deltaY,
  };
}

export function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  options: CanvasRendererOptions = {},
): CanvasRenderer {
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvas 2D context is not available.");
  }

  // MAP2-R perf: static-layer caching. At low/default zoom the full world fits
  // comfortably in an offscreen layer, so panning only blits that layer at a new
  // offset instead of redrawing every visible tile while the pointer is down. The
  // full-world layer uses coarse cell-size buckets so wheel zoom can scale/blit
  // between buckets instead of rebuilding terrain on every tiny zoom step. At
  // high zoom the full layer would be huge, so it falls back to the older
  // viewport-sized cache.
  const baseLayer = document.createElement("canvas");
  const overLayer = document.createElement("canvas");
  let staticLayerTiles: WorldState["tiles"] | null = null;
  let staticLayerKey = "";

  return {
    render: (snapshot) => {
      const metrics = prepareCanvas(canvas, context, options);
      context.clearRect(0, 0, metrics.width, metrics.height);
      context.fillStyle = "#15110c";
      context.fillRect(0, 0, metrics.width, metrics.height);

      if (snapshot.world === null) {
        drawEmptyState(context, metrics.width, metrics.height);
        return;
      }

      const layout = getLayout(
        metrics.width,
        metrics.height,
        snapshot.world,
        snapshot.camera,
        metrics.pixelRatio,
      );
      const visibleBounds = getVisibleTileBounds(metrics, layout, snapshot.world);
      const worldStaticCellSize = Math.max(1, Math.round(layout.cellSize));
      const worldLayerWidth = Math.max(
        1,
        Math.ceil(snapshot.world.config.width * worldStaticCellSize * metrics.pixelRatio),
      );
      const worldLayerHeight = Math.max(
        1,
        Math.ceil(snapshot.world.config.height * worldStaticCellSize * metrics.pixelRatio),
      );
      const useWorldStaticLayer =
        layout.cellSize <= MAX_WORLD_STATIC_LAYER_CELL_SIZE &&
        worldLayerWidth * worldLayerHeight <= MAX_WORLD_STATIC_LAYER_PIXELS;
      const staticLayerLayout: WorldCanvasLayout = useWorldStaticLayer
        ? { ...layout, cellSize: worldStaticCellSize, offsetX: 0, offsetY: 0 }
        : layout;
      const staticLayerVisibleBounds: VisibleTileBounds = useWorldStaticLayer
        ? {
            minX: 0,
            maxX: snapshot.world.config.width - 1,
            minY: 0,
            maxY: snapshot.world.config.height - 1,
          }
        : visibleBounds;
      const staticLayerWidth = useWorldStaticLayer ? worldLayerWidth : canvas.width;
      const staticLayerHeight = useWorldStaticLayer ? worldLayerHeight : canvas.height;

      const layerKey = [
        useWorldStaticLayer ? "world" : "viewport",
        getStaticLayerTimeKey(snapshot),
        snapshot.mapViewMode,
        snapshot.seasonalVisualsEnabled ? "seasonal" : "plain",
        useWorldStaticLayer ? worldStaticCellSize : layout.cellSize,
        useWorldStaticLayer ? worldLayerWidth : layout.offsetX,
        useWorldStaticLayer ? worldLayerHeight : layout.offsetY,
        staticLayerWidth,
        staticLayerHeight,
        metrics.pixelRatio,
        snapshot.showGrid,
        snapshot.showRivers,
      ].join("|");

      if (staticLayerTiles !== snapshot.world.tiles || staticLayerKey !== layerKey) {
        baseLayer.width = staticLayerWidth;
        baseLayer.height = staticLayerHeight;
        overLayer.width = staticLayerWidth;
        overLayer.height = staticLayerHeight;
        const baseContext = baseLayer.getContext("2d");
        const overContext = overLayer.getContext("2d");

        if (baseContext !== null && overContext !== null) {
          baseContext.setTransform(metrics.pixelRatio, 0, 0, metrics.pixelRatio, 0, 0);
          overContext.setTransform(metrics.pixelRatio, 0, 0, metrics.pixelRatio, 0, 0);
          baseContext.fillStyle = "#15110c";
          baseContext.fillRect(0, 0, metrics.width, metrics.height);
          // Hover/selection outlines are dynamic — keep them out of the cache.
          const staticSnapshot: CanvasRenderSnapshot = {
            ...snapshot,
            hoveredTileId: null,
            selectedTileId: null,
          };
          drawVisibleTiles(baseContext, staticLayerLayout, staticSnapshot, staticLayerVisibleBounds);

          // Streams are sub-tile features: hidden with the Rivers marker off
          // (too small to always show), clearly drawn when it is toggled on.
          if (snapshot.showRivers) {
            drawCreekOverlay(overContext, staticLayerLayout, snapshot.world, staticLayerVisibleBounds);
            drawRiverOverlay(overContext, staticLayerLayout, snapshot.world, staticLayerVisibleBounds);
          }

          drawGrid(overContext, staticLayerLayout, snapshot.world, snapshot.showGrid, staticLayerVisibleBounds);

          if (snapshot.mapViewMode === "terrain") {
            drawMapAtmosphere(overContext, staticLayerLayout, snapshot.world);
          }

          staticLayerTiles = snapshot.world.tiles;
          staticLayerKey = layerKey;
        }
      }

      const staticLayerOffsetX = useWorldStaticLayer ? layout.offsetX : 0;
      const staticLayerOffsetY = useWorldStaticLayer ? layout.offsetY : 0;
      const staticLayerDrawWidth = useWorldStaticLayer
        ? snapshot.world.config.width * layout.cellSize
        : baseLayer.width / metrics.pixelRatio;
      const staticLayerDrawHeight = useWorldStaticLayer
        ? snapshot.world.config.height * layout.cellSize
        : baseLayer.height / metrics.pixelRatio;

      blitDevicePixels(
        context,
        baseLayer,
        staticLayerOffsetX,
        staticLayerOffsetY,
        staticLayerDrawWidth,
        staticLayerDrawHeight,
      );
      drawSelectedBandKnowledgeOverlay(context, layout, snapshot, visibleBounds);
      drawSelectedBandMemoryOverlay(context, layout, snapshot, visibleBounds);
      drawSelectedBandPressureOverlay(context, layout, snapshot, visibleBounds);
      drawSelectedBandCorridors(context, layout, snapshot, visibleBounds);
      drawSelectedBandCrossings(context, layout, snapshot, visibleBounds);
      drawSelectedBandMovementTrail(context, layout, snapshot, visibleBounds);
      drawSelectedBandLineageLinks(context, layout, snapshot, visibleBounds);
      drawSelectedBandCrowdingWarning(context, layout, snapshot, visibleBounds);
      drawSelectedBandIntentDirection(context, layout, snapshot, visibleBounds);
      blitDevicePixels(
        context,
        overLayer,
        staticLayerOffsetX,
        staticLayerOffsetY,
        staticLayerDrawWidth,
        staticLayerDrawHeight,
      );
      drawSelectedBandFamiliarCountryOverlay(context, layout, snapshot, visibleBounds);
      drawAllBandActivityDots(context, layout, snapshot, visibleBounds);
      drawSelectedBandActivityOverlay(context, layout, snapshot, visibleBounds);
      drawTileHighlights(context, layout, snapshot);
      drawSetupPlacementPreview(context, layout, snapshot, visibleBounds);
      drawMapEditorPreview(context, layout, snapshot, visibleBounds);
      drawBands(context, layout, snapshot, visibleBounds);
      drawHoverCoordinate(context, layout, snapshot);
      // Default-on: draw unless explicitly disabled, so a stale/undefined flag
      // (e.g. a store field not yet propagated under HMR) still shows the legend.
      if (snapshot.showLegend !== false) {
        drawLegend(context, metrics.width, metrics.height, snapshot.mapViewMode);
      }
    },
    getTileIdAtClientPoint: (snapshot, clientX, clientY) => {
      if (snapshot.world === null) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();
      const layout = getLayout(
        rect.width,
        rect.height,
        snapshot.world,
        snapshot.camera,
      );
      const x = Math.floor((clientX - rect.left - layout.offsetX) / layout.cellSize);
      const y = Math.floor((clientY - rect.top - layout.offsetY) / layout.cellSize);
      const tile = getTileAtCoord(snapshot.world, { x, y });

      return tile?.id ?? null;
    },
    getBandIdAtClientPoint: (snapshot, clientX, clientY) => {
      if (snapshot.world === null) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();
      const layout = getLayout(
        rect.width,
        rect.height,
        snapshot.world,
        snapshot.camera,
      );
      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;
      let nearestBandId: BandId | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      // Hit-test against the SAME fresh render bands the markers are drawn from, so
      // clicks land on where a band currently is (not its stale full-snapshot tile).
      for (const band of getRenderBands(snapshot)) {
        const tile = snapshot.world.tiles[band.position];

        if (tile === undefined) {
          continue;
        }

        const center = getTileCenter(tile, layout);
        const markerRadius = getBandMarkerRadius(layout, band.id === snapshot.selectedBandId);
        const hitRadius = Math.max(8, markerRadius + 3);
        const distanceToBand = Math.hypot(canvasX - center.x, canvasY - center.y);

        if (distanceToBand <= hitRadius && distanceToBand < nearestDistance) {
          nearestBandId = band.id;
          nearestDistance = distanceToBand;
        }
      }

      return nearestBandId;
    },
    getActivityTripIdAtClientPoint: (snapshot, clientX, clientY) => {
      if (
        snapshot.world === null ||
        snapshot.selectedBandId === null ||
        (snapshot.activityOverlayMode !== "selected" && snapshot.activityOverlayMode !== "all")
      ) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();
      const layout = getLayout(
        rect.width,
        rect.height,
        snapshot.world,
        snapshot.camera,
      );

      if (layout.cellSize < ACTIVITY_OVERLAY_MIN_CELL_SIZE) {
        return null;
      }

      const selectedBand = getRenderBands(snapshot).find((band) => band.id === snapshot.selectedBandId);

      if (selectedBand === undefined) {
        return null;
      }

      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;
      const drawRoutes = layout.cellSize >= ACTIVITY_OVERLAY_PATH_CELL_SIZE;
      const trips = getSelectedBandActivityTrips(selectedBand.recentActivity, selectedBand.position);
      const markerSlots = getActivityMarkerSlots(trips);
      const markerHitRadius = getActivityMarkerHitRadius(layout);
      const routeHitRadius = getActivityRouteHitRadius(layout);
      const hits: { readonly tripId: string; readonly distance: number }[] = [];

      for (const [index, trip] of trips.entries()) {
        const markerIsRendered = index < ACTIVITY_OVERLAY_DOT_CAP || drawRoutes;

        if (!markerIsRendered) {
          continue;
        }

        const points = getActivityTripPoints(snapshot.world, layout, trip);

        if (points.length === 0) {
          continue;
        }

        const tripId = getActivityTripId(trip);
        const marker = getOffsetActivityMarkerPoint(
          getActivityMarkerBasePoint(snapshot.world, layout, trip, points),
          layout,
          markerSlots.get(tripId),
        );
        const markerDistance = Math.hypot(canvasX - marker.x, canvasY - marker.y);
        const markerHit = markerDistance <= markerHitRadius;
        let routeDistance = Number.POSITIVE_INFINITY;

        if (drawRoutes && points.length >= 2) {
          routeDistance = getDistanceToPolyline({ x: canvasX, y: canvasY }, points);
        }

        const routeHit = routeDistance <= routeHitRadius;

        if (markerHit || routeHit) {
          hits.push({
            tripId,
            distance: Math.min(markerHit ? markerDistance : Number.POSITIVE_INFINITY, routeHit ? routeDistance : Number.POSITIVE_INFINITY),
          });
        }
      }

      if (hits.length === 0) {
        return null;
      }

      // REALISM-2B Part D — clicking a stack of overlapping activities cycles through
      // them (nearest first, deterministic tie-break) instead of always re-selecting the
      // same one: if the current selection is in the hit set, advance to the next.
      hits.sort((left, right) => left.distance - right.distance || left.tripId.localeCompare(right.tripId));
      const ordered = hits.map((hit) => hit.tripId);
      const currentIndex =
        snapshot.selectedActivityTripId === null ? -1 : ordered.indexOf(snapshot.selectedActivityTripId);

      return currentIndex === -1 ? ordered[0] : ordered[(currentIndex + 1) % ordered.length];
    },
    dispose: () => undefined,
  };
}

// Copies a cached device-pixel layer onto the CSS-pixel canvas. The main
// context is already scaled by pixelRatio, so the destination size maps the
// source canvas 1:1 in backing pixels.
function blitDevicePixels(
  context: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (layer.width === 0 || layer.height === 0) {
    return;
  }

  context.drawImage(layer, x, y, width, height);
}

// Hover/selected tile outlines — dynamic, drawn above the cached static layers
// (same styling the tile pass used before the layers were cached).
function drawTileHighlights(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
): void {
  const world = snapshot.world;

  if (world === null || layout.cellSize < 2) {
    return;
  }

  const outline = (tileId: TileId | null, stroke: string, lineWidth: number, inset: number) => {
    if (tileId === null) {
      return;
    }

    const tile = world.tiles[tileId];

    if (tile === undefined) {
      return;
    }

    const x = layout.offsetX + tile.coord.x * layout.cellSize;
    const y = layout.offsetY + tile.coord.y * layout.cellSize;
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.strokeRect(x + inset, y + inset, layout.cellSize - inset * 2, layout.cellSize - inset * 2);
  };

  outline(snapshot.hoveredTileId, "#f6d365", Math.max(1, Math.min(2, layout.cellSize * 0.16)), 1);
  outline(snapshot.selectedTileId, "#f2e8d2", Math.max(1, Math.min(3, layout.cellSize * 0.22)), 1.5);
}

function drawSetupPlacementPreview(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  const world = snapshot.world;
  const preview = snapshot.setupPlacementPreview;

  if (world === null || preview === null || preview.tileId === null || layout.cellSize < 2) {
    return;
  }

  const tile = world.tiles[preview.tileId];

  if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
    return;
  }

  const band = world.bands[preview.bandId];
  const center = getTileCenter(tile, layout);
  const x = layout.offsetX + tile.coord.x * layout.cellSize;
  const y = layout.offsetY + tile.coord.y * layout.cellSize;
  const validStroke = "rgba(115, 183, 112, 0.95)";
  const invalidStroke = "rgba(208, 79, 57, 0.95)";
  const validFill = "rgba(115, 183, 112, 0.16)";
  const invalidFill = "rgba(208, 79, 57, 0.16)";
  const markerColor = band?.color ?? "#f2e8d2";
  const radius = getBandMarkerRadius(layout, true);

  context.save();
  context.fillStyle = preview.valid ? validFill : invalidFill;
  context.fillRect(x, y, layout.cellSize, layout.cellSize);
  context.strokeStyle = preview.valid ? validStroke : invalidStroke;
  context.lineWidth = Math.max(1.5, Math.min(3, layout.cellSize * 0.24));
  context.strokeRect(x + 1, y + 1, layout.cellSize - 2, layout.cellSize - 2);

  context.beginPath();
  context.arc(center.x, center.y, radius + 4, 0, Math.PI * 2);
  context.fillStyle = preview.valid ? withAlpha(markerColor, 0.34) : "rgba(208, 79, 57, 0.28)";
  context.fill();
  context.strokeStyle = preview.valid ? withAlpha(markerColor, 0.92) : invalidStroke;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

// PRE-RUN-MAP-MAKER-1 — translucent paint-stroke tint + brush cursor. Tints
// reuse the map's own terrain families so a pending stroke previews roughly
// what the rebuilt tile will look like.
const MAP_EDITOR_PAINT_TINTS: Readonly<Record<string, string>> = {
  plains: "rgba(164, 122, 67, 0.55)",
  forest: "rgba(58, 122, 75, 0.55)",
  hills: "rgba(125, 93, 52, 0.55)",
  mountains: "rgba(140, 132, 120, 0.55)",
  wetlands: "rgba(88, 128, 106, 0.55)",
  desert: "rgba(196, 158, 94, 0.55)",
  tundra: "rgba(158, 158, 146, 0.55)",
  lake: "rgba(64, 106, 146, 0.6)",
  erase: "rgba(233, 222, 198, 0.35)",
};

function drawMapEditorPreview(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  const preview = snapshot.mapEditorPreview;

  if (preview === null || snapshot.world === null || layout.cellSize < 2) {
    return;
  }

  context.save();

  for (const pending of preview.pendingTiles) {
    if (
      pending.x < visibleBounds.minX ||
      pending.x > visibleBounds.maxX ||
      pending.y < visibleBounds.minY ||
      pending.y > visibleBounds.maxY
    ) {
      continue;
    }

    context.fillStyle = MAP_EDITOR_PAINT_TINTS[pending.terrain] ?? MAP_EDITOR_PAINT_TINTS.erase;
    context.fillRect(
      layout.offsetX + pending.x * layout.cellSize,
      layout.offsetY + pending.y * layout.cellSize,
      layout.cellSize,
      layout.cellSize,
    );
  }

  if (preview.brush !== null) {
    const centerX = layout.offsetX + (preview.brush.x + 0.5) * layout.cellSize;
    const centerY = layout.offsetY + (preview.brush.y + 0.5) * layout.cellSize;

    context.beginPath();
    context.arc(centerX, centerY, (preview.brush.radius + 0.5) * layout.cellSize, 0, Math.PI * 2);
    context.strokeStyle = "rgba(216, 167, 67, 0.9)";
    context.lineWidth = Math.max(1.5, Math.min(3, layout.cellSize * 0.2));
    context.stroke();
  }

  context.restore();
}

function drawVisibleTiles(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null) {
    return;
  }

  for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y += 1) {
    for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x += 1) {
      const tile = getTileAtCoord(snapshot.world, { x, y });

      if (tile === undefined) {
        continue;
      }

      drawTile(context, tile, layout, snapshot);
    }
  }
}

function drawSelectedBandKnowledgeOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const world = snapshot.world;
  const selectedBand = world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  // Iterate the band's OWN bounded record set (a few hundred tiles), not every
  // visible map tile — the full visible-bounds scan (~30k string-keyed lookups
  // per redraw on Map 2 zoomed out) made hovering with a band selected lag.
  // Same rects, same colors; per-tile draw order is irrelevant here because
  // each tile is filled at most once.
  for (const record of Object.values(selectedBand.knowledge.observedTiles)) {
    const tile = snapshot.world.tiles[record.tileId];

    if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
      continue;
    }

    const tileX = layout.offsetX + tile.coord.x * layout.cellSize;
    const tileY = layout.offsetY + tile.coord.y * layout.cellSize;
    const alpha = 0.08 + record.confidence * 0.14;

    context.fillStyle = `rgba(246, 211, 101, ${alpha})`;
    context.fillRect(tileX, tileY, layout.cellSize, layout.cellSize);
  }
}

function drawSelectedBandMemoryOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const world = snapshot.world;
  const selectedBand = world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  const topMemories = Object.values(selectedBand.placeMemory)
    .sort((left, right) =>
      right.attachment + right.visitCount * 0.05 + (right.isReturnPlace ? 0.25 : 0) -
      (left.attachment + left.visitCount * 0.05 + (left.isReturnPlace ? 0.25 : 0)),
    )
    .slice(0, 3);

  for (const memory of topMemories) {
    const tile = snapshot.world.tiles[memory.tileId];

    if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
      continue;
    }

    const center = getTileCenter(tile, layout);
    const radius = Math.max(3, Math.min(8, layout.cellSize * (0.36 + memory.attachment * 0.28)));

    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = memory.isReturnPlace
      ? "rgba(255, 211, 86, 0.34)"
      : "rgba(255, 245, 170, 0.22)";
    context.fill();
    context.strokeStyle = memory.isReturnPlace ? "#ffd356" : "rgba(255, 245, 170, 0.82)";
    context.lineWidth = Math.max(1, Math.min(2.4, layout.cellSize * 0.16));
    context.stroke();
  }

  const currentTile = snapshot.world.tiles[selectedBand.position];

  if (currentTile !== undefined && isTileVisible(currentTile, visibleBounds)) {
    const x = layout.offsetX + currentTile.coord.x * layout.cellSize;
    const y = layout.offsetY + currentTile.coord.y * layout.cellSize;

    context.strokeStyle = "#fff7a1";
    context.lineWidth = Math.max(1.5, Math.min(3.4, layout.cellSize * 0.24));
    context.strokeRect(x + 2, y + 2, layout.cellSize - 4, layout.cellSize - 4);
  }
}

function drawSelectedBandPressureOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const world = snapshot.world;
  const selectedBand = world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  for (const memory of Object.values(selectedBand.placeMemory)) {
    const pressure = selectedBand.usePressure[memory.tileId];
    const pressureValue = getCombinedUsePressure(pressure);
    const isDepletedMemory = memory.valences.includes("depleted") || memory.valences.includes("avoid_place");

    if (pressureValue < 0.34 && !isDepletedMemory) {
      continue;
    }

    const tile = snapshot.world.tiles[memory.tileId];

    if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
      continue;
    }

    const tileX = layout.offsetX + tile.coord.x * layout.cellSize;
    const tileY = layout.offsetY + tile.coord.y * layout.cellSize;
    const alpha = 0.16 + pressureValue * 0.28;

    context.fillStyle = `rgba(209, 83, 55, ${alpha})`;
    context.fillRect(tileX, tileY, layout.cellSize, layout.cellSize);
    context.strokeStyle = isDepletedMemory ? "#ff765c" : "rgba(255, 132, 92, 0.78)";
    context.lineWidth = Math.max(1, Math.min(2.6, layout.cellSize * 0.18));
    context.strokeRect(
      tileX + 1,
      tileY + 1,
      Math.max(1, layout.cellSize - 2),
      Math.max(1, layout.cellSize - 2),
    );
  }
}

// RANGE-1: faint band-coloured wash over the SELECTED band's derived familiar use-range
// (core/familiar/edge tiers), with a stronger ring on camp/water cores. Selected-band only
// (never per-band — no clutter in Activity "All"), gated by its own familiarRangeOverlayMode.
// The range is derived on demand from the band's own memory (range ⊆ observedTiles); as a
// band-state overlay it is as fresh as the world snapshot (may lag the live marker overlay
// at Civilization-Skip speed, same trade-off as the knowledge/memory/pressure washes).
function drawSelectedBandFamiliarCountryOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (
    snapshot.world === null ||
    snapshot.familiarRangeOverlayMode === "off"
  ) {
    return;
  }

  const world = snapshot.world;

  if (snapshot.familiarRangeOverlayMode === "all") {
    context.save();
    for (const band of Object.values(world.bands).sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      if (band.status === "dispersed" || band.viability?.status === "absorbed" || band.viability?.status === "extinct") {
        continue;
      }
      const range = getCachedFamiliarCountry(band, world);
      if (!range.hasMeaningfulRange) {
        continue;
      }
      drawFamiliarCountryRangeWash(context, layout, world, visibleBounds, range, getRangeWashColor(band.color, 0.12), {
        edge: 0.12,
        familiar: 0.22,
        core: 0.34,
      });
    }
    context.restore();
    return;
  }

  const selectedBandId = snapshot.selectedBandId;
  if (selectedBandId === null) {
    return;
  }

  const selectedBand = world.bands[selectedBandId];
  if (selectedBand === undefined) {
    return;
  }

  const range = getCachedFamiliarCountry(selectedBand, world);
  const washColor = getRangeWashColor(selectedBand.color, 0.22);

  context.save();
  drawFamiliarCountryRangeWash(context, layout, world, visibleBounds, range, washColor, {
    edge: 0.24,
    familiar: 0.38,
    core: 0.56,
  });
  // Stronger ring on the camp/water cores (no hard borders — just a place mark).
  context.strokeStyle = withAlpha(washColor, 0.95);
  context.lineWidth = Math.max(1, layout.cellSize * 0.12);
  for (const tileId of [range.corePlaces.campCore, range.corePlaces.waterCore]) {
    if (tileId === undefined) {
      continue;
    }
    const tile = world.tiles[tileId];
    if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
      continue;
    }
    const tileX = layout.offsetX + tile.coord.x * layout.cellSize;
    const tileY = layout.offsetY + tile.coord.y * layout.cellSize;
    context.strokeRect(tileX + 1, tileY + 1, layout.cellSize - 2, layout.cellSize - 2);
  }

  // RANGE-2: for a selected DAUGHTER, a very subtle parent camp/water core hint (≤2 rings,
  // low opacity, NO parent range wash) — lineage context, not ownership/remaining territory.
  const parentId = selectedBand.parentBandId;
  const parentBand = parentId !== undefined ? world.bands[parentId] : undefined;
  if (parentBand !== undefined) {
    const parentRange = getCachedFamiliarCountry(parentBand, world);
    context.globalAlpha = 0.4;
    context.strokeStyle = parentBand.color;
    context.lineWidth = Math.max(1, layout.cellSize * 0.08);
    for (const tileId of [parentRange.corePlaces.campCore, parentRange.corePlaces.waterCore]) {
      if (tileId === undefined) {
        continue;
      }
      const tile = world.tiles[tileId];
      if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
        continue;
      }
      const tileX = layout.offsetX + tile.coord.x * layout.cellSize;
      const tileY = layout.offsetY + tile.coord.y * layout.cellSize;
      context.strokeRect(tileX + 2, tileY + 2, layout.cellSize - 4, layout.cellSize - 4);
    }
  }
  context.restore();
}

function drawFamiliarCountryRangeWash(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  world: WorldState,
  visibleBounds: VisibleTileBounds,
  range: ReturnType<typeof deriveFamiliarCountry>,
  washColor: string,
  alpha: { readonly edge: number; readonly familiar: number; readonly core: number },
): void {
  const fillTier = (tileId: TileId, opacity: number): void => {
    const tile = world.tiles[tileId];
    if (tile === undefined || !isTileVisible(tile, visibleBounds)) {
      return;
    }
    const tileX = layout.offsetX + tile.coord.x * layout.cellSize;
    const tileY = layout.offsetY + tile.coord.y * layout.cellSize;
    context.fillStyle = withAlpha(washColor, opacity);
    context.fillRect(tileX, tileY, layout.cellSize, layout.cellSize);
  };

  for (const tileId of range.edgeTiles) {
    fillTier(tileId, alpha.edge);
  }
  for (const tileId of range.familiarTiles) {
    fillTier(tileId, alpha.familiar);
  }
  for (const tileId of range.coreTiles) {
    fillTier(tileId, alpha.core);
  }
}

function getRangeWashColor(color: string, warmMix: number): string {
  const normalized = color.replace("#", "");

  if (normalized.length !== 6) {
    return "#ffe59a";
  }

  return formatRgbTriple(mixRgb(parseRgbTriple(color), [0xff, 0xe8, 0x9a], warmMix));
}

function drawSelectedBandCorridors(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const selectedBand = snapshot.world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  context.lineCap = "round";
  context.lineJoin = "round";

  for (const corridor of Object.values(selectedBand.travelCorridors)) {
    const fromTile = snapshot.world.tiles[corridor.fromTileId];
    const toTile = snapshot.world.tiles[corridor.toTileId];

    if (
      fromTile === undefined ||
      toTile === undefined ||
      (!isTileVisible(fromTile, visibleBounds) && !isTileVisible(toTile, visibleBounds))
    ) {
      continue;
    }

    const from = getTileCenter(fromTile, layout);
    const to = getTileCenter(toTile, layout);

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = `rgba(255, 216, 102, ${0.14 + corridor.confidence * 0.32})`;
    context.lineWidth = Math.max(1, Math.min(3, layout.cellSize * (0.12 + corridor.confidence * 0.18)));
    context.stroke();
  }
}

function drawSelectedBandCrossings(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const selectedBand = snapshot.world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  for (const memory of Object.values(selectedBand.crossingMemories)) {
    const firstTile = snapshot.world.tiles[memory.crossingTileA];
    const secondTile = snapshot.world.tiles[memory.crossingTileB];

    if (
      firstTile === undefined ||
      secondTile === undefined ||
      (!isTileVisible(firstTile, visibleBounds) && !isTileVisible(secondTile, visibleBounds))
    ) {
      continue;
    }

    const first = getTileCenter(firstTile, layout);
    const second = getTileCenter(secondTile, layout);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    const radius = Math.max(3.5, Math.min(7, layout.cellSize * 0.38));

    context.beginPath();
    context.arc(center.x, center.y, radius + 2, 0, Math.PI * 2);
    context.fillStyle = "rgba(8, 12, 10, 0.78)";
    context.fill();
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = memory.riskMemory > 0.58 ? "#ff8d6b" : "#7ef5d5";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.4;
    context.stroke();
  }
}

function drawSelectedBandMovementTrail(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const selectedBand = snapshot.world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  const recentMovement = selectedBand.movementHistory.slice(-12);

  recentMovement.forEach((movement, index) => {
    const fromTile = snapshot.world?.tiles[movement.fromTileId];
    const toTile = snapshot.world?.tiles[movement.toTileId];

    if (
      fromTile === undefined ||
      toTile === undefined ||
      (!isTileVisible(fromTile, visibleBounds) && !isTileVisible(toTile, visibleBounds))
    ) {
      return;
    }

    const from = getTileCenter(fromTile, layout);
    const to = getTileCenter(toTile, layout);
    const alpha = 0.22 + (index / Math.max(1, recentMovement.length - 1)) * 0.48;

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    context.lineWidth = Math.max(1.2, Math.min(3.5, layout.cellSize * 0.18));
    context.stroke();
  });
}

function drawSelectedBandIntentDirection(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const selectedBand = snapshot.world.bands[snapshot.selectedBandId];
  const currentTile =
    selectedBand === undefined ? undefined : snapshot.world.tiles[selectedBand.position];
  const direction = selectedBand?.currentIntent?.directionVector;

  if (currentTile === undefined || direction === undefined || !isTileVisible(currentTile, visibleBounds)) {
    return;
  }

  const center = getTileCenter(currentTile, layout);
  const length = Math.max(12, layout.cellSize * 1.7);
  const end = {
    x: center.x + direction.x * length,
    y: center.y + direction.y * length,
  };

  context.beginPath();
  context.moveTo(center.x, center.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.arc(end.x, end.y, 3, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
}

function drawSelectedBandLineageLinks(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const selectedBand = snapshot.world.bands[snapshot.selectedBandId];

  if (selectedBand === undefined) {
    return;
  }

  const selectedTile = snapshot.world.tiles[selectedBand.position];

  if (selectedTile === undefined) {
    return;
  }

  context.lineCap = "round";
  context.lineJoin = "round";

  if (selectedBand.parentBandId !== undefined) {
    const parentBand = snapshot.world.bands[selectedBand.parentBandId];
    const parentTile = parentBand === undefined ? undefined : snapshot.world.tiles[parentBand.position];

    if (
      parentTile !== undefined &&
      (isTileVisible(parentTile, visibleBounds) || isTileVisible(selectedTile, visibleBounds))
    ) {
      drawLineageLink(context, layout, parentTile, selectedTile, withAlpha(selectedBand.color, 0.7));
    }
  }

  for (const daughterBandId of selectedBand.daughterBandIds) {
    const daughterBand = snapshot.world.bands[daughterBandId];
    const daughterTile = daughterBand === undefined ? undefined : snapshot.world.tiles[daughterBand.position];

    if (
      daughterTile === undefined ||
      (!isTileVisible(daughterTile, visibleBounds) && !isTileVisible(selectedTile, visibleBounds))
    ) {
      continue;
    }

    drawLineageLink(context, layout, selectedTile, daughterTile, withAlpha(daughterBand.color, 0.72));
  }
}

function drawSelectedBandCrowdingWarning(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null || snapshot.selectedBandId === null) {
    return;
  }

  const selectedBand = snapshot.world.bands[snapshot.selectedBandId];
  const currentTile =
    selectedBand === undefined ? undefined : snapshot.world.tiles[selectedBand.position];

  if (
    selectedBand === undefined ||
    currentTile === undefined ||
    !isTileVisible(currentTile, visibleBounds)
  ) {
    return;
  }

  const nearby = getNearbyBandPressure(snapshot.world, selectedBand, selectedBand.position);
  const dispersal = getDaughterDispersalPressure(snapshot.world, selectedBand, selectedBand.position);
  const warningStrength = Math.max(
    nearby.weightedCrowding,
    dispersal.daughterDispersalPressure,
    dispersal.parentCoreOverlap * 0.72,
  );

  if (warningStrength < 0.24) {
    return;
  }

  const center = getTileCenter(currentTile, layout);
  const radius = Math.max(6, Math.min(14, layout.cellSize * (0.62 + warningStrength * 0.34)));

  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.strokeStyle = `rgba(255, 132, 92, ${0.42 + warningStrength * 0.28})`;
  context.lineWidth = Math.max(1.4, Math.min(3.5, layout.cellSize * 0.2));
  context.stroke();
}

function drawLineageLink(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  fromTile: Tile,
  toTile: Tile,
  color: string,
): void {
  const from = getTileCenter(fromTile, layout);
  const to = getTileCenter(toTile, layout);

  context.save();
  context.setLineDash([6, 5]);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.4, Math.min(3.8, layout.cellSize * 0.22));
  context.stroke();
  context.restore();
}

function drawSelectedBandActivityOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (
    snapshot.world === null ||
    snapshot.selectedBandId === null ||
    (snapshot.activityOverlayMode !== "selected" && snapshot.activityOverlayMode !== "all") ||
    layout.cellSize < ACTIVITY_OVERLAY_MIN_CELL_SIZE
  ) {
    return;
  }

  const world = snapshot.world;
  const selectedBand = getRenderBands(snapshot).find((band) => band.id === snapshot.selectedBandId);

  if (selectedBand === undefined) {
    return;
  }

  const trips = getSelectedBandActivityTrips(selectedBand.recentActivity, selectedBand.position);

  if (trips.length === 0) {
    return;
  }

  const currentDay = Number(world.time.day ?? Number(world.time.tick) * 90);
  const drawRoutes = layout.cellSize >= ACTIVITY_OVERLAY_PATH_CELL_SIZE;
  const markerSlots = getActivityMarkerSlots(trips);

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  trips
    .map((trip, index) => ({ trip, index }))
    .reverse()
    .forEach(({ trip, index }) => {
      if (!isActivityTripVisible(world, trip, visibleBounds)) {
        return;
      }

      const points = getActivityTripPoints(world, layout, trip);

      if (points.length === 0) {
        return;
      }

      const hasRoute = points.length >= 2;
      const color = selectedBand.color;
      const alpha = getActivityTripAlpha(trip, index, currentDay);
      const tripId = getActivityTripId(trip);
      const selected = snapshot.selectedActivityTripId === tripId;
      const markerSlot = markerSlots.get(tripId);
      const markerBase = getActivityMarkerBasePoint(world, layout, trip, points);
      const markerPoint = getOffsetActivityMarkerPoint(markerBase, layout, markerSlot);

      if (hasRoute && drawRoutes) {
        drawActivityRoute(context, layout, points, trip, color, alpha);
      }

      if (selected && hasRoute) {
        drawSelectedActivityTripHighlight(context, layout, points, trip, color);
      }

      if (index < ACTIVITY_OVERLAY_DOT_CAP || drawRoutes) {
        drawActivityMarker(context, layout, markerPoint, trip, color, alpha);
      }

      if (selected) {
        drawSelectedActivityMarkerHighlight(context, layout, markerPoint, color);
      }

      if (markerSlot !== undefined && markerSlot.count > 1 && markerSlot.index === 0) {
        drawActivityClusterCount(context, layout, markerBase, markerSlot.count);
      }
    });

  context.restore();
}

// REALISM-2B Part B — the activity overlay must stay visually attached to its source
// band. Trips are recorded from the band's residential anchor (`originTileId`) at trip
// time; `band.position` only moves at season boundaries. At fast/batched speed the band
// marker can advance several anchors ahead of the last full world snapshot, so we show
// ONLY the trips whose origin is the band's CURRENT anchor. Stale cross-anchor
// breadcrumbs from a previous home range drop off instead of floating where the band no
// longer is. Both the trips and the anchor come from the SAME world snapshot, so the
// overlay is internally consistent (no invented motion, no constant redraw).
function getSelectedBandActivityTrips(
  trips: readonly RenderActivityTrip[],
  anchorTileId: TileId,
): readonly RenderActivityTrip[] {
  return [...trips]
    .filter((trip) => trip.originTileId === anchorTileId)
    .sort((left, right) => Number(right.day) - Number(left.day) || Number(right.tick) - Number(left.tick))
    .slice(0, ACTIVITY_OVERLAY_TRIP_CAP);
}

function getActivityMarkerSlots(
  trips: readonly RenderActivityTrip[],
): Map<string, { readonly index: number; readonly count: number }> {
  const totals = new Map<TileId, number>();
  const seen = new Map<TileId, number>();
  const slots = new Map<string, { readonly index: number; readonly count: number }>();

  for (const trip of trips) {
    totals.set(trip.targetTileId, (totals.get(trip.targetTileId) ?? 0) + 1);
  }

  for (const trip of trips) {
    const current = seen.get(trip.targetTileId) ?? 0;
    seen.set(trip.targetTileId, current + 1);
    slots.set(getActivityTripId(trip), {
      index: current,
      count: totals.get(trip.targetTileId) ?? 1,
    });
  }

  return slots;
}

function drawAllBandActivityDots(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (
    snapshot.world === null ||
    snapshot.activityOverlayMode !== "all" ||
    layout.cellSize < ACTIVITY_OVERLAY_MIN_CELL_SIZE
  ) {
    return;
  }

  const world = snapshot.world;
  const currentDay = Number(world.time.day ?? Number(world.time.tick) * 90);
  const markerRecords: {
    readonly bandColor: string;
    readonly trip: RenderActivityTrip;
    readonly index: number;
    readonly point: { readonly x: number; readonly y: number };
  }[] = [];

  // TIME/PLAYBACK-STABILITY: iterate the SAME fresh render bands the markers use, so
  // `all` mode genuinely shows every active band's recent activity (not the rare full
  // snapshot, which lagged ~6 sim-years behind the markers at Civilization-Skip speed).
  // getRenderBands already filtered dead bands; we only skip the selected band (it gets
  // the detailed overlay) and apply the visual caps.
  for (const band of getRenderBands(snapshot)) {
    if (
      markerRecords.length >= ACTIVITY_OVERLAY_ALL_TOTAL_DOT_CAP ||
      band.id === snapshot.selectedBandId
    ) {
      continue;
    }

    const trips = [...band.recentActivity]
      .sort((left, right) => Number(right.day) - Number(left.day) || Number(right.tick) - Number(left.tick))
      .slice(0, ACTIVITY_OVERLAY_ALL_BAND_TRIP_CAP);

    for (const [index, trip] of trips.entries()) {
      if (markerRecords.length >= ACTIVITY_OVERLAY_ALL_TOTAL_DOT_CAP || !isActivityTripVisible(world, trip, visibleBounds)) {
        break;
      }

      const points = getActivityTripPoints(world, layout, trip);

      if (points.length === 0) {
        continue;
      }

      markerRecords.push({
        bandColor: band.color,
        trip,
        index,
        point: getActivityMarkerBasePoint(world, layout, trip, points),
      });
    }
  }

  const markerSlots = getActivityMarkerSlots(markerRecords.map((record) => record.trip));

  context.save();

  for (const record of markerRecords) {
    drawActivityMarker(
      context,
      layout,
      getOffsetActivityMarkerPoint(record.point, layout, markerSlots.get(getActivityTripId(record.trip))),
      record.trip,
      record.bandColor,
      getActivityTripAlpha(record.trip, record.index + 2, currentDay) * 0.72,
    );
  }

  context.restore();
}

function isActivityTripVisible(
  world: WorldState,
  trip: RenderActivityTrip,
  visibleBounds: VisibleTileBounds,
): boolean {
  const pathTiles = trip.pathTiles.length > 0
    ? trip.pathTiles
    : [trip.originTileId, trip.targetTileId];

  return pathTiles.some((tileId) => {
    const tile = world.tiles[tileId];

    return tile !== undefined && isTileVisible(tile, visibleBounds);
  });
}

function getActivityTripPoints(
  world: WorldState,
  layout: WorldCanvasLayout,
  trip: RenderActivityTrip,
): readonly { readonly x: number; readonly y: number }[] {
  const pathTiles = trip.pathTiles.length > 0
    ? trip.pathTiles
    : [trip.originTileId, trip.targetTileId];
  const points: { readonly x: number; readonly y: number }[] = [];

  for (const tileId of pathTiles) {
    const tile = world.tiles[tileId];

    if (tile === undefined) {
      return [];
    }

    points.push(getTileCenter(tile, layout));
  }

  return points;
}

// The tile the group is shown AT (where the activity marker sits). For a normal trip
// that is the last passable path tile (target, or the resolved shoreline for a water
// target). For a length-1 path the group stays at its home/shore tile and works an
// ADJACENT tile (water fetch / fishing the neighbouring river); the marker is nudged off
// the band tile toward that adjacent target so the activity is visible and reads as
// happening at the tile edge — never on the water itself.
function getActivityMarkerBasePoint(
  world: WorldState,
  layout: WorldCanvasLayout,
  trip: RenderActivityTrip,
  points: readonly { readonly x: number; readonly y: number }[],
): { readonly x: number; readonly y: number } {
  if (points.length >= 2) {
    return points[points.length - 1];
  }

  const base = points[0] ?? { x: 0, y: 0 };
  const origin = world.tiles[trip.originTileId];
  const target = world.tiles[trip.targetTileId];

  if (origin === undefined || target === undefined) {
    return base;
  }

  const originCenter = getTileCenter(origin, layout);
  const targetCenter = getTileCenter(target, layout);

  return {
    x: originCenter.x + (targetCenter.x - originCenter.x) * 0.42,
    y: originCenter.y + (targetCenter.y - originCenter.y) * 0.42,
  };
}

function drawActivityRoute(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  points: readonly { readonly x: number; readonly y: number }[],
  trip: RenderActivityTrip,
  color: string,
  alpha: number,
): void {
  const width = Math.max(1, Math.min(2.4, layout.cellSize * 0.13));

  strokeActivityPolyline(context, points, color, alpha * 0.56, width);

  if (trip.outcome === "returns_same_day") {
    context.save();
    context.setLineDash([3, 5]);
    strokeActivityPolyline(context, [...points].reverse(), color, alpha * 0.36, Math.max(1, width * 0.86));
    context.restore();
  } else if (trip.outcome === "overnight") {
    context.save();
    context.setLineDash([5, 4]);
    strokeActivityPolyline(context, points, color, alpha * 0.5, width);
    context.restore();
  } else {
    context.save();
    context.setLineDash([2, 5]);
    strokeActivityPolyline(context, points, color, alpha * 0.54, width);
    context.restore();
  }
}

function drawSelectedActivityTripHighlight(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  points: readonly { readonly x: number; readonly y: number }[],
  trip: RenderActivityTrip,
  color: string,
): void {
  const width = Math.max(1.8, Math.min(4, layout.cellSize * 0.22));

  context.save();
  context.globalCompositeOperation = "source-over";
  strokeActivityPolyline(context, points, "#f3f6f2", 0.5, width + 1.4);
  strokeActivityPolyline(context, points, color, 0.82, width);

  if (trip.outcome !== "returns_same_day") {
    context.setLineDash([4, 4]);
    strokeActivityPolyline(context, points, "#f3f6f2", 0.36, Math.max(1.2, width * 0.7));
  }

  context.restore();
}

function strokeActivityPolyline(
  context: CanvasRenderingContext2D,
  points: readonly { readonly x: number; readonly y: number }[],
  color: string,
  alpha: number,
  width: number,
): void {
  if (points.length < 2) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  context.strokeStyle = withAlpha(color, clamp01(alpha));
  context.lineWidth = width;
  context.stroke();
}

function drawActivityMarker(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  point: { readonly x: number; readonly y: number },
  trip: RenderActivityTrip,
  color: string,
  alpha: number,
): void {
  const radius = getActivityMarkerRadius(layout);

  context.beginPath();
  context.arc(point.x, point.y, radius + 1.2, 0, Math.PI * 2);
  context.fillStyle = `rgba(8, 12, 10, ${0.42 + alpha * 0.24})`;
  context.fill();

  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = withAlpha(color, alpha * 0.82);
  context.fill();
  context.strokeStyle = withAlpha("#f3f6f2", alpha * 0.8);
  context.lineWidth = trip.outcome === "returns_same_day" ? 1 : 1.5;
  context.stroke();

  if (trip.outcome !== "returns_same_day") {
    context.beginPath();
    context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
    context.strokeStyle = withAlpha(color, alpha * 0.55);
    context.lineWidth = 1.2;
    context.stroke();
  }
}

function drawSelectedActivityMarkerHighlight(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  point: { readonly x: number; readonly y: number },
  color: string,
): void {
  const radius = getActivityMarkerRadius(layout);

  context.beginPath();
  context.arc(point.x, point.y, radius + 4.2, 0, Math.PI * 2);
  context.strokeStyle = "rgba(243, 246, 242, 0.9)";
  context.lineWidth = Math.max(1.4, Math.min(2.4, layout.cellSize * 0.16));
  context.stroke();

  context.beginPath();
  context.arc(point.x, point.y, radius + 6.2, 0, Math.PI * 2);
  context.strokeStyle = withAlpha(color, 0.56);
  context.lineWidth = 1.2;
  context.stroke();
}

function drawActivityClusterCount(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  point: { readonly x: number; readonly y: number },
  count: number,
): void {
  const radius = getActivityMarkerRadius(layout);
  const fontSize = Math.max(8, Math.min(11, layout.cellSize * 0.42));
  const label = String(count);
  const x = point.x + radius + 4;
  const y = point.y - radius - 3;

  context.save();
  context.font = `700 ${fontSize}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const metrics = context.measureText(label);
  const width = Math.max(fontSize + 4, metrics.width + 6);
  const height = fontSize + 4;

  context.fillStyle = "rgba(8, 12, 10, 0.78)";
  context.fillRect(x - width / 2, y - height / 2, width, height);
  context.strokeStyle = "rgba(243, 246, 242, 0.58)";
  context.lineWidth = 1;
  context.strokeRect(x - width / 2, y - height / 2, width, height);
  context.fillStyle = "rgba(243, 246, 242, 0.92)";
  context.fillText(label, x, y + 0.3);
  context.restore();
}

function getActivityMarkerRadius(layout: WorldCanvasLayout): number {
  return Math.max(2.4, Math.min(5.6, layout.cellSize * 0.24));
}

function getActivityMarkerHitRadius(layout: WorldCanvasLayout): number {
  return Math.max(7, Math.min(13, getActivityMarkerRadius(layout) + layout.cellSize * 0.22 + 3));
}

function getOffsetActivityMarkerPoint(
  point: { readonly x: number; readonly y: number },
  layout: WorldCanvasLayout,
  slot: { readonly index: number; readonly count: number } | undefined,
): { readonly x: number; readonly y: number } {
  if (slot === undefined || slot.count <= 1) {
    return point;
  }

  const radius = Math.max(2.2, Math.min(7, layout.cellSize * 0.34));
  const angle = -Math.PI / 2 + (Math.PI * 2 * slot.index) / slot.count;

  return {
    x: point.x + Math.cos(angle) * radius,
    y: point.y + Math.sin(angle) * radius,
  };
}

function getActivityRouteHitRadius(layout: WorldCanvasLayout): number {
  return Math.max(4, Math.min(8, layout.cellSize * 0.28 + 2));
}

function getDistanceToPolyline(
  point: { readonly x: number; readonly y: number },
  points: readonly { readonly x: number; readonly y: number }[],
): number {
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < points.length; index += 1) {
    nearestDistance = Math.min(
      nearestDistance,
      getDistanceToSegment(point, points[index - 1], points[index]),
    );
  }

  return nearestDistance;
}

function getDistanceToSegment(
  point: { readonly x: number; readonly y: number },
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
  const projectedX = start.x + t * dx;
  const projectedY = start.y + t * dy;

  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function getActivityTripAlpha(
  trip: RenderActivityTrip,
  index: number,
  currentDay: number,
): number {
  const dayAge = Math.max(0, currentDay - Number(trip.day));
  const dayFade = Math.max(0.42, 1 - Math.min(90, dayAge) / 90);
  const indexFade = 1 - index / Math.max(1, ACTIVITY_OVERLAY_TRIP_CAP);

  return clamp(0.13 + 0.5 * dayFade * indexFade, 0.13, 0.62);
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  options: CanvasRendererOptions,
): CanvasMetrics {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || 900);
  const height = Math.max(1, rect.height || 600);
  const pixelRatio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1;
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  return { width, height, pixelRatio };
}

function getLayout(
  width: number,
  height: number,
  world: WorldState,
  camera: MapCamera,
  pixelRatio = 1,
): WorldCanvasLayout {
  const availableWidth = Math.max(1, width - 24);
  const availableHeight = Math.max(1, height - 24);
  const baseCellSize = Math.min(
    availableWidth / world.config.width,
    availableHeight / world.config.height,
  );
  const cellSize = Math.max(0.5, baseCellSize * camera.zoom);
  const worldWidth = cellSize * world.config.width;
  const worldHeight = cellSize * world.config.height;

  return {
    cellSize,
    offsetX: Math.round((width - worldWidth) / 2 + camera.panX),
    offsetY: Math.round((height - worldHeight) / 2 + camera.panY),
    pixelRatio,
  };
}

function getVisibleTileBounds(
  metrics: CanvasMetrics,
  layout: WorldCanvasLayout,
  world: WorldState,
): VisibleTileBounds {
  return {
    minX: clampInteger(
      Math.floor((0 - layout.offsetX) / layout.cellSize) - 1,
      0,
      world.config.width - 1,
    ),
    maxX: clampInteger(
      Math.ceil((metrics.width - layout.offsetX) / layout.cellSize) + 1,
      0,
      world.config.width - 1,
    ),
    minY: clampInteger(
      Math.floor((0 - layout.offsetY) / layout.cellSize) - 1,
      0,
      world.config.height - 1,
    ),
    maxY: clampInteger(
      Math.ceil((metrics.height - layout.offsetY) / layout.cellSize) + 1,
      0,
      world.config.height - 1,
    ),
  };
}

function drawTile(
  context: CanvasRenderingContext2D,
  tile: Tile,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
): void {
  const x = layout.offsetX + tile.coord.x * layout.cellSize;
  const y = layout.offsetY + tile.coord.y * layout.cellSize;
  // MAP2-R polish: tile bounds snapped to DEVICE pixels (the context is
  // scaled by pixelRatio, so CSS-space rounding would still land on
  // fractional device pixels and leak background seams — the "phantom grid").
  // Adjacent tiles share exact device-pixel edges: no seams, no overlap.
  const ratio = layout.pixelRatio;
  const snappedX = Math.round(x * ratio) / ratio;
  const snappedY = Math.round(y * ratio) / ratio;
  const snappedWidth = Math.max(1 / ratio, Math.round((x + layout.cellSize) * ratio) / ratio - snappedX);
  const snappedHeight = Math.max(1 / ratio, Math.round((y + layout.cellSize) * ratio) / ratio - snappedY);
  const inset = snapshot.showGrid && layout.cellSize >= 4 ? 0.5 : 0;

  const fillColor = getCachedTileFillColor(tile, snapshot);

  context.fillStyle = fillColor;
  context.fillRect(
    snappedX + inset,
    snappedY + inset,
    snappedWidth - inset * 2,
    snappedHeight - inset * 2,
  );

  if (
    snapshot.mapViewMode === "terrain" &&
    layout.cellSize >= 6 &&
    !tile.isAquatic
  ) {
    drawTileStipples(context, tile, snappedX, snappedY, layout.cellSize, fillColor);
  }

  // Hover/selected outlines are drawn by drawTileHighlights in the dynamic
  // pass — the tile fill itself is part of the cached static layer.
}

// MAP2-R: sub-tile creeks/small streams (Tile.hasCreek influence corridors)
// are drawn as thin pale-blue lines so hydrology is debuggable on maps that
// author them. They are deliberately thinner/lighter than river segments —
// at regional map scale a creek is a feature inside a tile, not a water tile.
function drawCreekOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  world: WorldState,
  visibleBounds: VisibleTileBounds,
): void {
  // Streams only show with the Rivers marker on, so make every one of them
  // clearly visible: bright pale aqua, deliberately distinct from the deeper
  // blue river overlay lines, but thinner (still subordinate in weight).
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(126, 230, 219, 0.95)";
  context.lineWidth = Math.max(0.8, Math.min(2, layout.cellSize * 0.16));

  for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y += 1) {
    for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x += 1) {
      const tile = getTileAtCoord(world, { x, y });

      if (tile === undefined || tile.hasCreek !== true) {
        continue;
      }

      const center = getTileCenter(tile, layout);
      // Creek lines run diagonally, so connect across the 8-neighborhood
      // (tile.neighbors is 4-connected and would leave diagonal runs dotted).
      const wetNeighbors: Tile[] = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const neighbor = getTileAtCoord(world, { x: x + dx, y: y + dy });

          if (
            neighbor !== undefined &&
            (neighbor.hasCreek === true || neighbor.isRiver || neighbor.terrainKind === "lake")
          ) {
            wetNeighbors.push(neighbor);
          }
        }
      }

      if (wetNeighbors.length === 0) {
        context.beginPath();
        context.arc(center.x, center.y, Math.max(0.6, layout.cellSize * 0.12), 0, Math.PI * 2);
        context.stroke();
        continue;
      }

      for (const neighbor of wetNeighbors) {
        const neighborCenter = getTileCenter(neighbor, layout);
        context.beginPath();
        context.moveTo(center.x, center.y);
        context.lineTo(
          (center.x + neighborCenter.x) / 2,
          (center.y + neighborCenter.y) / 2,
        );
        context.stroke();
      }
    }
  }
}

function drawRiverOverlay(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  world: WorldState,
  visibleBounds: VisibleTileBounds,
): void {
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y += 1) {
    for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x += 1) {
      const tile = getTileAtCoord(world, { x, y });

      if (tile === undefined || !tile.isRiver) {
        continue;
      }

      const center = getTileCenter(tile, layout);
      context.strokeStyle = getRiverOverlayColor(world, tile);
      context.lineWidth = getRiverOverlayWidth(world, tile, layout);
      const riverNeighbors = tile.neighbors
        .map((neighborId) => world.tiles[neighborId])
        .filter((neighbor): neighbor is Tile => neighbor !== undefined && neighbor.isRiver);

      if (riverNeighbors.length === 0) {
        context.beginPath();
        context.arc(center.x, center.y, Math.max(1, layout.cellSize * 0.2), 0, Math.PI * 2);
        context.stroke();
        continue;
      }

      for (const neighbor of riverNeighbors) {
        const neighborCenter = getTileCenter(neighbor, layout);
        context.beginPath();
        context.moveTo(center.x, center.y);
        context.lineTo(
          (center.x + neighborCenter.x) / 2,
          (center.y + neighborCenter.y) / 2,
        );
        context.stroke();
      }
    }
  }
}

function getRiverOverlayColor(world: WorldState, tile: Tile): string {
  const profile = tile.riverSegmentId === undefined ? undefined : world.rivers[tile.riverSegmentId];

  if (profile?.kind === "rapid_gorge") {
    return "#4e97d9";
  }

  if (profile?.kind === "deep_channel") {
    return "#1555a3";
  }

  if (profile?.kind === "seasonal_stream") {
    return "#4da3c4";
  }

  if (profile?.kind === "marsh_channel") {
    return "#38b8a4";
  }

  if (profile?.kind === "estuary") {
    return "#1c78b8";
  }

  return "#2ea6c7";
}

function getRiverOverlayWidth(
  world: WorldState,
  tile: Tile,
  layout: WorldCanvasLayout,
): number {
  const profile = tile.riverSegmentId === undefined ? undefined : world.rivers[tile.riverSegmentId];
  const classWidth = profile?.widthClass === "very_wide"
    ? 0.38
    : profile?.widthClass === "wide"
      ? 0.32
      : profile?.widthClass === "medium"
        ? 0.24
        : 0.16;

  return Math.max(1, Math.min(4.2, layout.cellSize * classWidth));
}

function drawGrid(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  world: WorldState,
  showGrid: boolean,
  visibleBounds: VisibleTileBounds,
): void {
  const width = world.config.width * layout.cellSize;
  const height = world.config.height * layout.cellSize;

  if (showGrid && layout.cellSize >= 4) {
    context.strokeStyle = "rgba(255, 255, 255, 0.15)";
    context.lineWidth = 1;

    for (let x = visibleBounds.minX + 1; x <= visibleBounds.maxX; x += 1) {
      const lineX = layout.offsetX + x * layout.cellSize + 0.5;
      context.beginPath();
      context.moveTo(lineX, layout.offsetY);
      context.lineTo(lineX, layout.offsetY + height);
      context.stroke();
    }

    for (let y = visibleBounds.minY + 1; y <= visibleBounds.maxY; y += 1) {
      const lineY = layout.offsetY + y * layout.cellSize + 0.5;
      context.beginPath();
      context.moveTo(layout.offsetX, lineY);
      context.lineTo(layout.offsetX + width, lineY);
      context.stroke();
    }
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.28)";
  context.lineWidth = 1;
  context.strokeRect(
    layout.offsetX + 0.5,
    layout.offsetY + 0.5,
    width,
    height,
  );
}

function drawBands(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
  visibleBounds: VisibleTileBounds,
): void {
  if (snapshot.world === null) {
    return;
  }

  // TIME/PLAYBACK-STABILITY: ALL bands (including the selected one) draw from the
  // single fresh source. The REALISM-2B override that pinned the selected band to
  // the rare full snapshot — to keep it attached to its activity routes — froze the
  // selected marker for ~2.5s (≈ several Civilization-Skip seasons). Now the routes
  // ride the SAME fresh overlay as the marker (see getRenderBands + the activity
  // overlays), so marker and routes stay attached AND fresh, with no freeze.
  const bandsToDraw = getRenderBands(snapshot);
  const bandsByPosition = new Map<TileId, RenderBand[]>();

  for (const band of bandsToDraw) {
    const stack = bandsByPosition.get(band.position);

    if (stack === undefined) {
      bandsByPosition.set(band.position, [band]);
    } else {
      stack.push(band);
    }
  }

  for (const band of bandsToDraw) {
    const tile = snapshot.world.tiles[band.position];

    if (
      tile === undefined ||
      tile.coord.x < visibleBounds.minX ||
      tile.coord.x > visibleBounds.maxX ||
      tile.coord.y < visibleBounds.minY ||
      tile.coord.y > visibleBounds.maxY
    ) {
      continue;
    }

    const center = getTileCenter(tile, layout);
    const stackedBands = bandsByPosition.get(band.position) ?? [band];
    const stackIndex = stackedBands.findIndex((candidate) => candidate.id === band.id);
    const stackOffset = getStackedBandOffset(stackIndex, stackedBands.length, layout.cellSize);
    const isSelected = band.id === snapshot.selectedBandId;
    const isDaughter = band.isDaughter;
    const radius = getBandMarkerRadius(layout, isSelected);
    const markerX = center.x + stackOffset.x;
    const markerY = center.y + stackOffset.y;

    if (isDaughter && isSelected) {
      context.beginPath();
      context.arc(markerX, markerY, radius + 4, 0, Math.PI * 2);
      context.strokeStyle = band.color;
      context.lineWidth = 1.6;
      context.stroke();
    }

    context.beginPath();
    context.arc(markerX, markerY, radius + 2, 0, Math.PI * 2);
    context.fillStyle = "rgba(8, 12, 10, 0.82)";
    context.fill();
    context.beginPath();
    context.arc(markerX, markerY, radius, 0, Math.PI * 2);
    const fullBand = snapshot.world.bands[band.id];
    context.fillStyle =
      fullBand !== undefined
        ? getBandIdentityColor(fullBand, snapshot.world)
        : band.color;
    context.fill();
    // UI-STYLE-1: selection ring uses the parchment accent so the map reads
    // with the vellum UI; non-selected keeps a softer warm white for contrast.
    context.strokeStyle = isSelected ? "#f2e8d2" : "rgba(242, 232, 210, 0.72)";
    context.lineWidth = isSelected ? 2.5 : 1.4;
    context.stroke();

    if (stackedBands.length > 1) {
      context.beginPath();
      context.arc(markerX, markerY, radius + 6, 0, Math.PI * 2);
      context.strokeStyle = "rgba(255, 233, 130, 0.78)";
      context.lineWidth = 1;
      context.stroke();
    }

    if (band.separationActive) {
      context.beginPath();
      context.moveTo(markerX, markerY - radius - 8);
      context.lineTo(markerX - 4, markerY - radius - 1);
      context.lineTo(markerX + 4, markerY - radius - 1);
      context.closePath();
      context.fillStyle = "#ffe982";
      context.fill();
      context.strokeStyle = "rgba(8, 12, 10, 0.85)";
      context.lineWidth = 1;
      context.stroke();
    }
  }
}

function getStackedBandOffset(
  stackIndex: number,
  stackCount: number,
  cellSize: number,
): { readonly x: number; readonly y: number } {
  if (stackCount <= 1 || stackIndex < 0) {
    return { x: 0, y: 0 };
  }

  const radius = Math.min(cellSize * 0.3, 7);
  const angle = (Math.PI * 2 * stackIndex) / stackCount - Math.PI / 2;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function getBandMarkerRadius(layout: WorldCanvasLayout, isSelected: boolean): number {
  const baseRadius = Math.max(4, Math.min(9, layout.cellSize * 0.42));

  return isSelected ? baseRadius + 2 : baseRadius;
}

function drawHoverCoordinate(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  snapshot: CanvasRenderSnapshot,
): void {
  if (snapshot.world === null || snapshot.hoveredTileId === null) {
    return;
  }

  const tile = snapshot.world.tiles[snapshot.hoveredTileId];

  if (tile === undefined) {
    return;
  }

  const x = layout.offsetX + tile.coord.x * layout.cellSize;
  const y = layout.offsetY + tile.coord.y * layout.cellSize;
  const label = `${tile.coord.x}, ${tile.coord.y}`;
  const labelWidth = Math.max(44, label.length * 8 + 14);
  const labelHeight = 22;
  const labelX = clamp(
    x + layout.cellSize + 6,
    2,
    layout.offsetX + snapshot.world.config.width * layout.cellSize - labelWidth - 2,
  );
  const labelY = Math.max(2, y - labelHeight - 4);

  context.fillStyle = "rgba(13, 18, 16, 0.86)";
  context.fillRect(labelX, labelY, labelWidth, labelHeight);
  context.strokeStyle = "rgba(255,255,255,0.22)";
  context.strokeRect(labelX + 0.5, labelY + 0.5, labelWidth - 1, labelHeight - 1);
  context.fillStyle = "#f3f6f2";
  context.font = "12px system-ui, sans-serif";
  context.textBaseline = "middle";
  context.fillText(label, labelX + 7, labelY + labelHeight / 2);
}

function drawLegend(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: MapViewMode,
): void {
  const items = [...getLegendItems(mode), ...getOverlayLegendItems()];
  const padding = 8;
  const rowGap = 4;
  const swatchSize = 10;
  const itemGap = 12;
  const rowHeight = 16;
  const maxRowWidth = Math.max(240, width - 24 - padding * 2);
  const rows: LegendItem[][] = [[]];
  let currentRowWidth = 0;
  let widestRow = 0;

  context.save();
  context.font = "11px system-ui, sans-serif";
  context.textBaseline = "middle";

  for (const item of items) {
    const itemWidth = swatchSize + 5 + context.measureText(item.label).width + itemGap;

    if (currentRowWidth > 0 && currentRowWidth + itemWidth > maxRowWidth) {
      widestRow = Math.max(widestRow, currentRowWidth);
      rows.push([]);
      currentRowWidth = 0;
    }

    rows[rows.length - 1].push(item);
    currentRowWidth += itemWidth;
  }

  widestRow = Math.max(widestRow, currentRowWidth);

  const boxWidth = Math.min(width - 20, widestRow + padding * 2);
  const boxHeight = rows.length * rowHeight + Math.max(0, rows.length - 1) * rowGap + padding * 2;
  const boxX = 10;
  const boxY = Math.max(10, height - boxHeight - 10);

  context.fillStyle = "rgba(13, 18, 16, 0.82)";
  context.fillRect(boxX, boxY, boxWidth, boxHeight);
  context.strokeStyle = "rgba(255,255,255,0.2)";
  context.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);

  rows.forEach((row, rowIndex) => {
    let x = boxX + padding;
    const y = boxY + padding + rowIndex * (rowHeight + rowGap) + rowHeight / 2;

    row.forEach((item) => {
      context.fillStyle = item.color;
      context.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);
      context.strokeStyle = "rgba(255,255,255,0.35)";
      context.strokeRect(x + 0.5, y - swatchSize / 2 + 0.5, swatchSize - 1, swatchSize - 1);
      context.fillStyle = "#dbe3dc";
      context.fillText(item.label, x + swatchSize + 5, y);
      x += swatchSize + 5 + context.measureText(item.label).width + itemGap;
    });
  });
  context.restore();
}

function drawEmptyState(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.fillStyle = "#dbe3dc";
  context.font = "16px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("World not generated", width / 2, height / 2);
  context.textAlign = "start";
}

function getTileCenter(
  tile: Tile,
  layout: WorldCanvasLayout,
): { readonly x: number; readonly y: number } {
  return {
    x: layout.offsetX + tile.coord.x * layout.cellSize + layout.cellSize / 2,
    y: layout.offsetY + tile.coord.y * layout.cellSize + layout.cellSize / 2,
  };
}

function isTileVisible(tile: Tile, visibleBounds: VisibleTileBounds): boolean {
  return (
    tile.coord.x >= visibleBounds.minX &&
    tile.coord.x <= visibleBounds.maxX &&
    tile.coord.y >= visibleBounds.minY &&
    tile.coord.y <= visibleBounds.maxY
  );
}

// MAP2-R perf: final tile fill colors are fully determined by (world tiles,
// tick, view mode, cosmetic season toggle) — hover/pan/zoom/selection change none of those, yet every
// such interaction redraws the map. Re-running the palette + seasonal tint +
// texture pipeline for ~30k visible tiles cost ~100ms per redraw and made
// hovering the map lag visibly. This cache rebuilds once per tick (or view
// mode switch) and serves every other redraw from a Map lookup. Keyed weakly
// on the immutable tiles record so map switches drop the old cache.
interface TileFillColorCache {
  timeKey: string;
  mode: MapViewMode;
  selectedBandId: BandId | null;
  seasonalVisualsEnabled: boolean;
  colorWorld: WorldState | null;
  colors: Map<TileId, string>;
}

const tileFillColorCache = new WeakMap<Readonly<Record<TileId, Tile>>, TileFillColorCache>();

function getCachedTileFillColor(tile: Tile, snapshot: CanvasRenderSnapshot): string {
  const world = snapshot.world;

  if (world === null) {
    return getTileColor(tile, snapshot);
  }

  const timeKey = getTileFillColorTimeKey(snapshot);
  let cache = tileFillColorCache.get(world.tiles);

  if (
    cache === undefined ||
    cache.timeKey !== timeKey ||
    cache.mode !== snapshot.mapViewMode ||
    cache.selectedBandId !== snapshot.selectedBandId ||
    cache.seasonalVisualsEnabled !== snapshot.seasonalVisualsEnabled
  ) {
    cache = {
      timeKey,
      mode: snapshot.mapViewMode,
      selectedBandId: snapshot.selectedBandId,
      seasonalVisualsEnabled: snapshot.seasonalVisualsEnabled,
      colorWorld: getTileFillColorWorld(snapshot),
      colors: new Map(),
    };
    tileFillColorCache.set(world.tiles, cache);
  }

  const cached = cache.colors.get(tile.id);

  if (cached !== undefined) {
    return cached;
  }

  const baseColor = getTileColor(tile, snapshot, cache.colorWorld);
  const fillColor =
    snapshot.mapViewMode === "terrain"
      ? getTexturedTerrainColor(baseColor, tile, world)
      : baseColor;
  cache.colors.set(tile.id, fillColor);

  return fillColor;
}

function getTileColor(
  tile: Tile,
  snapshot: CanvasRenderSnapshot,
  colorWorld: WorldState | null = snapshot.world,
): string {
  const mode = snapshot.mapViewMode;

  if (mode === "habitat_potential" && colorWorld !== null) {
    const potential = deriveHabitatPotentialTile(tile);
    return getSteppedColor(potential.ecologicalSupportScalar, [
      "#7d5d34",
      "#a47a43",
      "#9aa15e",
      "#5d9958",
      "#237a4c",
    ]);
  }

  if (mode === "living_ecology" && colorWorld !== null) {
    const ecology = deriveCurrentLivingEcologyTile(colorWorld, tile.id);
    return getSteppedColor(ecology?.ecologicalSupportScalar ?? 0, [
      "#4d4538",
      "#79623f",
      "#8a864a",
      "#4c8b55",
      "#17694b",
    ]);
  }

  if (mode === "known_opportunity" && colorWorld !== null) {
    const band = snapshot.selectedBandId === null ? undefined : colorWorld.bands[snapshot.selectedBandId];
    if (band === undefined) return "#303735";
    const perceived = getCachedBandPerceivedProjection(band, colorWorld).tiles[tile.id];
    if (perceived === undefined || !perceived.known) return "#303735";
    return getSteppedColor(perceived.ecologicalSupportScalar * (0.55 + perceived.confidence * 0.45), [
      "#514838",
      "#746444",
      "#8b874f",
      "#5f8c59",
      "#2e7254",
    ]);
  }

  if (mode === "water") {
    return getSteppedColor(tile.resourceProfile.waterAccess, [
      "#9f7a45",
      "#8f8f5f",
      "#5a997c",
      "#357ea3",
      "#155b94",
    ]);
  }

  if (mode === "elevation") {
    return getSteppedColor(tile.elevation, [
      "#225f86",
      "#5b8f5b",
      "#9a8d5d",
      "#7b705f",
      "#c7c0ad",
    ]);
  }

  if (mode === "movement") {
    return getSteppedColor(clamp01((tile.movementCost - 1) / 2), [
      "#2f8f61",
      "#83a65a",
      "#c19a4d",
      "#b86f45",
      "#7d4a42",
    ]);
  }

  const baseTerrainColor = getTerrainColor(tile, colorWorld);

  if (colorWorld === null || !snapshot.seasonalVisualsEnabled) {
    return baseTerrainColor;
  }

  return getSeasonalTerrainColor(colorWorld, tile, baseTerrainColor);
}

function getStaticLayerTimeKey(snapshot: CanvasRenderSnapshot): string {
  if (snapshot.world === null) {
    return "none";
  }

  if (!isTimeSensitiveTileColor(snapshot)) {
    return "static";
  }

  return getSeasonalVisualTimeKey(getTileFillColorTime(snapshot));
}

function getTileFillColorTimeKey(snapshot: CanvasRenderSnapshot): string {
  if (snapshot.world === null || !isTimeSensitiveTileColor(snapshot)) {
    return snapshot.world === null ? "none" : "static";
  }

  return getSeasonalVisualTimeKey(getTileFillColorTime(snapshot));
}

function getTileFillColorWorld(snapshot: CanvasRenderSnapshot): WorldState | null {
  if (snapshot.world === null) {
    return null;
  }

  if (!isTimeSensitiveTileColor(snapshot)) {
    return snapshot.world;
  }

  const time = getTileFillColorTime(snapshot);

  return time === snapshot.world.time ? snapshot.world : { ...snapshot.world, time };
}

function getTileFillColorTime(snapshot: CanvasRenderSnapshot): WorldState["time"] {
  const world = snapshot.world;

  if (world === null) {
    if (snapshot.liveOverlay !== null) {
      return snapshot.liveOverlay.time;
    }

    throw new Error("tile fill color time requested without a world");
  }

  if (snapshot.liveOverlay === null) {
    return world.time;
  }

  return getCalendarDayValue(snapshot.liveOverlay.time) >= getCalendarDayValue(world.time)
    ? snapshot.liveOverlay.time
    : world.time;
}

function isTimeSensitiveTileColor(snapshot: CanvasRenderSnapshot): boolean {
  return snapshot.mapViewMode === "living_ecology" ||
    snapshot.mapViewMode === "known_opportunity" ||
    (snapshot.mapViewMode === "terrain" && snapshot.seasonalVisualsEnabled);
}

const perceivedEcologyByBand = new WeakMap<Band, {
  readonly tick: number;
  readonly projection: BandPerceivedEcologicalOpportunityProjection;
}>();

function getCachedBandPerceivedProjection(
  band: Band,
  world: WorldState,
): BandPerceivedEcologicalOpportunityProjection {
  const tick = Number(world.time.tick);
  const cached = perceivedEcologyByBand.get(band);
  if (cached !== undefined && cached.tick === tick) return cached.projection;
  const projection = deriveBandPerceivedEcologicalOpportunity(band, world.time);
  perceivedEcologyByBand.set(band, { tick, projection });
  return projection;
}

function getCalendarDayValue(time: WorldState["time"]): number {
  return Math.max(0, Math.floor(time.day ?? Number(time.tick) * SEASON_LENGTH_DAYS + (time.dayOfSeason ?? 0)));
}

// MAP2-R polish: smooth blended terrain palette. Land colors come from
// continuous vegetation ramps (dry ↔ humid, indexed by richness, blended by
// drought/water), with floodplain meadows, marsh teal, coastal sand, and a
// muted rock blend on high ground; the ocean shades by distance to shore.
// Replaces the old hard threshold bands that collapsed most midland tiles
// into a single flat tan.
type RgbTriple = readonly [number, number, number];
// Ramp stops are pre-parsed to RGB triples at module init: sampleColorRamp
// runs twice per land tile per color rebuild, and parsing hex inside it was
// measurable across 30k tiles.
type ColorRampStop = readonly [number, RgbTriple];

function buildColorRamp(stops: readonly (readonly [number, string])[]): readonly ColorRampStop[] {
  return stops.map(([position, color]) => [position, parseRgbTriple(color)] as const);
}

interface ForestVisualCache {
  readonly seasonKey: string;
  readonly forestPatchState: WorldState["forestPatchState"];
  readonly densityByTile: Map<TileId, number>;
  readonly intensityByTile: Map<TileId, number>;
}

const forestVisualCache = new WeakMap<Readonly<Record<TileId, Tile>>, ForestVisualCache>();

function getForestVisualCache(world: WorldState): ForestVisualCache {
  const seasonKey = world.time.season;
  const cached = forestVisualCache.get(world.tiles);

  if (
    cached !== undefined &&
    cached.seasonKey === seasonKey &&
    cached.forestPatchState === world.forestPatchState
  ) {
    return cached;
  }

  const next: ForestVisualCache = {
    seasonKey,
    forestPatchState: world.forestPatchState,
    densityByTile: new Map<TileId, number>(),
    intensityByTile: new Map<TileId, number>(),
  };
  forestVisualCache.set(world.tiles, next);

  return next;
}

const HUMID_VEGETATION_RAMP = buildColorRamp([
  [0, "#aaa878"],
  [0.28, "#94a566"],
  [0.48, "#719a57"],
  [0.68, "#4f8a50"],
  [1, "#3a7a4b"],
]);

const DRY_VEGETATION_RAMP = buildColorRamp([
  [0, "#d9c393"],
  [0.25, "#cfb279"],
  [0.5, "#b5a76a"],
  [1, "#93a164"],
]);

const HIGHLAND_ROCK_RAMP = buildColorRamp([
  [0, "#7e7666"],
  [0.65, "#948b79"],
  [1, "#b5ad9c"],
]);

const FLOODPLAIN_TONE: RgbTriple = [0x62, 0xa0, 0x58];
const WETLAND_TONE: RgbTriple = [0x5d, 0xa5, 0x83];
const COASTAL_TONE: RgbTriple = [0x8f, 0xb6, 0x95];
const PASS_TONE: RgbTriple = [0xcd, 0xb8, 0x78];
const TEXTURE_LUSH_TONE: RgbTriple = [0x41, 0x80, 0x4d];
const TEXTURE_DRY_TONE: RgbTriple = [0xc8, 0xb1, 0x78];
const FOREST_VISUAL_TONE: RgbTriple = [0x1f, 0x5f, 0x3c];

function parseRgbTriple(hexColor: string): RgbTriple {
  return [
    Number.parseInt(hexColor.slice(1, 3), 16),
    Number.parseInt(hexColor.slice(3, 5), 16),
    Number.parseInt(hexColor.slice(5, 7), 16),
  ];
}

function formatRgbTriple(rgb: RgbTriple): string {
  const channel = (value: number) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");

  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

function mixRgb(from: RgbTriple, to: RgbTriple, amount: number): RgbTriple {
  const t = clamp01(amount);

  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function sampleColorRamp(stops: readonly ColorRampStop[], value: number): RgbTriple {
  const x = clamp01(value);

  for (let index = 1; index < stops.length; index += 1) {
    if (x <= stops[index][0]) {
      const [start, startColor] = stops[index - 1];
      const [end, endColor] = stops[index];

      return mixRgb(startColor, endColor, (x - start) / Math.max(1e-9, end - start));
    }
  }

  return stops[stops.length - 1][1];
}

function smoothstep01(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));

  return t * t * (3 - 2 * t);
}

function getOceanShoreDistance(world: WorldState | null, tile: Tile): number {
  if (world === null) {
    return 3;
  }

  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }

        const neighbor = getTileAtCoord(world, {
          x: tile.coord.x + dx,
          y: tile.coord.y + dy,
        });

        if (neighbor !== undefined && !neighbor.isAquatic) {
          return radius;
        }
      }
    }
  }

  return 3;
}

function getTerrainColor(tile: Tile, world: WorldState | null): string {
  if (tile.isAquatic && !tile.isRiver) {
    if (tile.terrainKind === "lake") {
      return "#2f83b8";
    }

    const shoreDistance = getOceanShoreDistance(world, tile);

    if (shoreDistance <= 1) {
      return "#2a76a4";
    }

    return shoreDistance <= 2 ? "#1f6492" : "#16567f";
  }

  if (tile.isRiver) {
    if (tile.isEstuary) {
      return "#2b7fb5";
    }

    if (tile.isMarshChannel) {
      return "#41a18e";
    }

    return tile.elevation > 0.42 ? "#5da3d6" : "#2f7fae";
  }

  const richness = tile.resourceProfile.baseRichness;
  const wetness = clamp01(
    1 - tile.riskProfile.droughtRisk * 1.55 + tile.resourceProfile.waterAccess * 0.3,
  );
  let color = mixRgb(
    sampleColorRamp(DRY_VEGETATION_RAMP, richness),
    sampleColorRamp(HUMID_VEGETATION_RAMP, richness),
    wetness,
  );

  if (tile.isFloodplain) {
    color = mixRgb(color, FLOODPLAIN_TONE, 0.38);
  }

  if (tile.terrainKind === "wetlands") {
    color = mixRgb(color, WETLAND_TONE, 0.5);
  }

  if (tile.isCoastal) {
    color = mixRgb(color, COASTAL_TONE, 0.42);
  }

  if (isPassCorridor(tile)) {
    color = mixRgb(color, PASS_TONE, 0.4);
  }

  const forestIntensity = deriveForestVisualIntensityForAudit(tile, world);
  if (forestIntensity > 0) {
    color = mixRgb(color, FOREST_VISUAL_TONE, forestIntensity * 0.24);
  }

  const rockiness = smoothstep01(0.44, 0.8, tile.elevation);

  if (rockiness > 0) {
    color = mixRgb(
      color,
      sampleColorRamp(HIGHLAND_ROCK_RAMP, smoothstep01(0.6, 0.96, tile.elevation)),
      rockiness,
    );
  }

  const lift = 1 + tile.elevation * 0.07;

  return formatRgbTriple([color[0] * lift, color[1] * lift, color[2] * lift]);
}

export function deriveForestVisualIntensityForAudit(tile: Tile, world: WorldState | null): number {
  if (tile.isAquatic && !tile.isRiverbank && !tile.isFloodplain) {
    return 0;
  }

  if (world !== null) {
    const cache = getForestVisualCache(world);
    const cached = cache.intensityByTile.get(tile.id);

    if (cached !== undefined) {
      return cached;
    }

    const intensity = deriveForestVisualIntensityCached(tile, world, cache);
    cache.intensityByTile.set(tile.id, intensity);

    return intensity;
  }

  const currentDensity = deriveForestVisualDensity(tile, null, undefined);

  return shapeForestVisualIntensity(tile, currentDensity);
}

function deriveForestVisualIntensityCached(
  tile: Tile,
  world: WorldState,
  cache: ForestVisualCache,
): number {
  const currentDensity = deriveForestVisualDensity(tile, world, cache);

  const neighborOffsets = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ] as const;
  let neighborDensityTotal = 0;
  let neighborCount = 0;

  for (const offset of neighborOffsets) {
    const neighbor = getTileAtCoord(world, {
      x: tile.coord.x + offset.x,
      y: tile.coord.y + offset.y,
    });

    if (neighbor === undefined || (neighbor.isAquatic && !neighbor.isRiverbank && !neighbor.isFloodplain)) {
      continue;
    }

    neighborDensityTotal += deriveForestVisualDensity(neighbor, world, cache);
    neighborCount += 1;
  }

  const smoothedDensity = neighborCount === 0
    ? currentDensity
    : currentDensity * 0.56 + (neighborDensityTotal / neighborCount) * 0.44;

  return shapeForestVisualIntensity(tile, smoothedDensity);
}

function deriveForestVisualDensity(
  tile: Tile,
  world: WorldState | null,
  cache: ForestVisualCache | undefined,
): number {
  const cached = cache?.densityByTile.get(tile.id);

  if (cached !== undefined) {
    return cached;
  }

  const patch = world === null
    ? undefined
    : deriveForestPatchesForTile(tile, world.time, getForestPatchState(world, tile))[0];

  if (patch !== undefined) {
    cache?.densityByTile.set(tile.id, patch.density);

    return patch.density;
  }

  let density = 0;

  if (tile.terrainKind === "forest") {
    density = 0.62;
  } else if (tile.isFloodplain || tile.isRiverbank || tile.hasCreek === true) {
    density = estimateForestSuitability(tile) * 0.58;
  } else {
    density = estimateForestSuitability(tile) * 0.42;
  }

  cache?.densityByTile.set(tile.id, density);

  return density;
}

function shapeForestVisualIntensity(tile: Tile, density: number): number {
  const terrainScale =
    tile.terrainKind === "desert" ? 0.28 :
      tile.terrainKind === "tundra" ? 0.45 :
        tile.terrainKind === "mountains" ? 0.52 :
          tile.terrainKind === "coast" ? 0.72 : 1;

  return round3(smoothstep01(0.16, 0.72, density) * terrainScale);
}

function isPassCorridor(tile: Tile): boolean {
  return (
    !tile.isAquatic &&
    tile.terrainKind === "hills" &&
    tile.elevation >= 0.28 &&
    tile.elevation <= 0.58 &&
    tile.movementCost <= 1.38
  );
}

// MAP2-R texture pass (temporary, render-only): three deterministic layers —
// (1) smooth correlated vegetation patches (warm-dry vs lush hue shifts, not
// gray dimming), (2) an NW-light hillshade from real elevation gradients so
// ridges/valleys get lit and shadowed flanks, (3) a whisper of per-tile
// grain. Water gets soft horizontally-stretched wave bands instead. All
// hash-based on tile coordinates: stable across frames, no shimmer.
function getTexturedTerrainColor(
  baseColor: string,
  tile: Tile,
  world: WorldState,
): string {
  const { x, y } = tile.coord;

  if (tile.isRiver) {
    // Gentle tonal variation along the channel so rivers read as water with
    // depth/flow instead of flat saturated ribbons.
    const flow = (textureFieldNoise(x, y, 4, 151) - 0.5) * 0.09;

    return shadeRgbColor(baseColor, 1 + flow);
  }

  if (tile.isAquatic) {
    const wave = (textureFieldNoise(x, y * 2.6, 5.5, 113) - 0.5) * 0.06;
    const swell = (textureFieldNoise(x, y, 11, 127) - 0.5) * 0.04;

    return shadeRgbColor(baseColor, 1 + wave + swell);
  }

  let color = parseRgbTriple(baseColor);

  // Layer 1 — vegetation mosaic: broad correlated patches lean lush or dry.
  const vegetation = textureFieldNoise(x, y, 9, 53) - 0.5;

  if (vegetation > 0) {
    color = mixRgb(color, TEXTURE_LUSH_TONE, vegetation * 0.34);
  } else {
    color = mixRgb(color, TEXTURE_DRY_TONE, -vegetation * 0.28);
  }

  // Layer 2 — hillshade, light from the north-west: slopes whose uphill side
  // is to the south-east face the light; the reverse flanks fall into shade.
  const west = getTileAtCoord(world, { x: x - 1, y });
  const east = getTileAtCoord(world, { x: x + 1, y });
  const north = getTileAtCoord(world, { x, y: y - 1 });
  const south = getTileAtCoord(world, { x, y: y + 1 });
  const slopeX = (east?.elevation ?? tile.elevation) - (west?.elevation ?? tile.elevation);
  const slopeY = (south?.elevation ?? tile.elevation) - (north?.elevation ?? tile.elevation);
  const hillshade = clamp((slopeX + slopeY) * 1.5, -0.14, 0.14);

  // Layer 3 — fine correlated grain + a whisper of per-tile variation.
  const grain =
    (textureFieldNoise(x, y, 3.1, 67) - 0.5) * 0.045 +
    (textureHash(x, y, 91) - 0.5) * 0.02;

  return formatRgbTriple(scaleRgb(color, 1 + hillshade + grain));
}

function scaleRgb(rgb: RgbTriple, factor: number): RgbTriple {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function shadeRgbColor(hexColor: string, factor: number): string {
  return formatRgbTriple(scaleRgb(parseRgbTriple(hexColor), factor));
}

// Bilinearly interpolated value noise over tile coordinates — smooth,
// spatially correlated texture (same construction as the map generator's
// field noise; per-tile hashes alone read as salt-and-pepper confetti).
function textureFieldNoise(x: number, y: number, scale: number, salt: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const n00 = textureHash(x0, y0, salt);
  const n10 = textureHash(x0 + 1, y0, salt);
  const n01 = textureHash(x0, y0 + 1, salt);
  const n11 = textureHash(x0 + 1, y0 + 1, salt);
  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;

  return top + (bottom - top) * sy;
}

function textureHash(x: number, y: number, salt: number): number {
  let hash = Math.imul(x + 374761393, 668265263);
  hash ^= Math.imul(y + 1442695041, 2246822519);
  hash ^= Math.imul(salt + 326648991, 326648991);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;

  return (hash >>> 0) / 4294967295;
}

function drawTileStipples(
  context: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  cellSize: number,
  fillColor: string,
): void {
  const density = tile.terrainKind === "forest"
    ? 0.72
    : tile.terrainKind === "wetlands" || tile.isFloodplain
      ? 0.48
      : tile.terrainKind === "desert" || tile.terrainKind === "hills"
        ? 0.34
        : 0.24;
  const maxDots = cellSize >= 14 ? 3 : 2;
  const dotCount = Math.min(maxDots, Math.floor(density * maxDots + tileTextureNoise(tile, 31) * 1.4));

  if (dotCount <= 0) {
    return;
  }

  const fill = parseRgbTriple(fillColor);
  const dark = formatRgbTriple(mixRgb(fill, parseRgbTriple("#0f1713"), 0.22));
  const light = formatRgbTriple(mixRgb(fill, parseRgbTriple("#eff1c7"), 0.18));
  const radius = clamp(cellSize * 0.045, 0.45, 1.15);

  for (let index = 0; index < dotCount; index += 1) {
    const px = x + cellSize * (0.18 + tileTextureNoise(tile, 47 + index * 7) * 0.64);
    const py = y + cellSize * (0.18 + tileTextureNoise(tile, 83 + index * 11) * 0.64);

    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    context.fillStyle = tileTextureNoise(tile, 131 + index) > 0.5 ? light : dark;
    context.globalAlpha = 0.34;
    context.fill();
  }

  context.globalAlpha = 1;
}

function tileTextureNoise(tile: Tile, salt: number): number {
  return textureHash(tile.coord.x, tile.coord.y, salt);
}

// MAP2-R texture pass: a faint warm-to-cool light wash matching the NW
// hillshade sun, a soft inner shadow at the world bounds, and a thin border
// so the map sits on the page instead of ending in a hard cut. Terrain view
// only; drawn under the band markers.
function drawMapAtmosphere(
  context: CanvasRenderingContext2D,
  layout: WorldCanvasLayout,
  world: WorldState,
): void {
  const width = world.config.width * layout.cellSize;
  const height = world.config.height * layout.cellSize;
  const x = layout.offsetX;
  const y = layout.offsetY;

  const wash = context.createLinearGradient(x, y, x + width, y + height);
  wash.addColorStop(0, "rgba(255, 238, 196, 0.055)");
  wash.addColorStop(0.55, "rgba(255, 255, 255, 0)");
  wash.addColorStop(1, "rgba(22, 42, 60, 0.07)");
  context.fillStyle = wash;
  context.fillRect(x, y, width, height);

  const inset = Math.max(6, Math.min(16, layout.cellSize * 4));
  const edges: readonly (readonly [number, number, number, number])[] = [
    [x, y, x, y + inset],
    [x, y + height, x, y + height - inset],
    [x, y, x + inset, y],
    [x + width, y, x + width - inset, y],
  ];

  for (const [fromX, fromY, toX, toY] of edges) {
    const shadow = context.createLinearGradient(fromX, fromY, toX, toY);
    shadow.addColorStop(0, "rgba(8, 14, 12, 0.2)");
    shadow.addColorStop(1, "rgba(8, 14, 12, 0)");
    context.fillStyle = shadow;

    if (fromX === toX) {
      context.fillRect(x, Math.min(fromY, toY), width, inset);
    } else {
      context.fillRect(Math.min(fromX, toX), y, inset, height);
    }
  }

  context.strokeStyle = "rgba(10, 16, 14, 0.55)";
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

function getLegendItems(mode: MapViewMode): readonly LegendItem[] {
  if (mode === "habitat_potential") {
    return [
      { color: "#7d5d34", label: "low potential" },
      { color: "#a47a43", label: "limited potential" },
      { color: "#9aa15e", label: "moderate potential" },
      { color: "#5d9958", label: "high potential" },
      { color: "#237a4c", label: "very high potential" },
    ];
  }

  if (mode === "living_ecology") {
    return [
      { color: "#4d4538", label: "no current support" },
      { color: "#79623f", label: "low current support" },
      { color: "#8a864a", label: "moderate current support" },
      { color: "#4c8b55", label: "high current support" },
      { color: "#17694b", label: "very high current support · Technical" },
    ];
  }

  if (mode === "known_opportunity") {
    return [
      { color: "#303735", label: "unknown" },
      { color: "#514838", label: "low / uncertain" },
      { color: "#746444", label: "limited remembered" },
      { color: "#8b874f", label: "moderate remembered" },
      { color: "#5f8c59", label: "promising known" },
      { color: "#2e7254", label: "strong known evidence" },
    ];
  }

  if (mode === "water") {
    return [
      { color: "#9f7a45", label: "dry" },
      { color: "#8f8f5f", label: "limited" },
      { color: "#5a997c", label: "wet" },
      { color: "#357ea3", label: "water access" },
      { color: "#155b94", label: "aquatic" },
    ];
  }

  if (mode === "elevation") {
    return [
      { color: "#225f86", label: "low/water" },
      { color: "#5b8f5b", label: "lowland" },
      { color: "#9a8d5d", label: "upland" },
      { color: "#7b705f", label: "high" },
      { color: "#c7c0ad", label: "ridge" },
    ];
  }

  if (mode === "movement") {
    return [
      { color: "#2f8f61", label: "easy" },
      { color: "#83a65a", label: "moderate" },
      { color: "#c19a4d", label: "costly" },
      { color: "#b86f45", label: "hard" },
      { color: "#7d4a42", label: "very hard" },
    ];
  }

  return [
    { color: "#16567f", label: "ocean" },
    { color: "#2f83b8", label: "lake" },
    { color: "#2f7fae", label: "river" },
    { color: "#58a07e", label: "marsh/wetland" },
    { color: "#62a058", label: "floodplain" },
    { color: "#719a57", label: "grassland" },
    { color: "#d9c393", label: "dry interior" },
    { color: "#948b79", label: "mountain" },
    { color: "#cdb878", label: "pass" },
  ];
}

function getOverlayLegendItems(): readonly LegendItem[] {
  return [
    { color: "rgba(246, 211, 101, 0.45)", label: "known tiles" },
    { color: "#ffd356", label: "return place" },
    { color: "rgba(209, 83, 55, 0.48)", label: "pressure" },
    { color: "#7ef5d5", label: "known ford" },
    { color: "#ffffff", label: "recent trail" },
    { color: "#ffd36f", label: "lineage link" },
    { color: "#ff845c", label: "crowding" },
    { color: "#fff7a1", label: "current tile" },
    { color: "#ffffff", label: "intent dir" },
  ];
}

function getCombinedUsePressure(pressure: LocalUsePressureRecord | undefined): number {
  if (pressure === undefined) {
    return 0;
  }

  return clamp01(
    pressure.foragingPressure * 0.48 +
      pressure.waterPressure * 0.28 +
      pressure.aquaticPressure * 0.16 +
      pressure.recentUseIntensity * 0.08,
  );
}

function withAlpha(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");

  if (normalized.length !== 6) {
    return `rgba(255, 211, 111, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) {
    return `rgba(255, 211, 111, ${alpha})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getSteppedColor(
  value: number,
  colors: readonly [string, string, string, string, string],
): string {
  const normalized = clamp01(value);

  if (normalized < 0.2) {
    return colors[0];
  }

  if (normalized < 0.4) {
    return colors[1];
  }

  if (normalized < 0.6) {
    return colors[2];
  }

  if (normalized < 0.8) {
    return colors[3];
  }

  return colors[4];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
