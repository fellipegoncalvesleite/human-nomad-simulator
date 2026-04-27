import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  createCanvasRenderer,
  getInitialMapCamera,
  panMapCamera,
  zoomMapCamera,
  zoomMapCameraAtPoint,
} from "../render/canvasRenderer";
import type {
  ActivityOverlayMode,
  CanvasRenderSnapshot,
  FamiliarRangeOverlayMode,
  MapEditorPreview,
  MapViewMode,
  SetupPlacementPreview,
} from "../render/canvasRenderer";
import { useSimulationStore } from "../store";
import { validateInitialBandPlacement } from "../sim/agents/spawn";
import type { TerrainPaintKind } from "../sim/runner/simRunner";
import type { BandId, Coord, TileId } from "../sim/core/types";

const MAP_VIEW_MODES: readonly {
  readonly mode: MapViewMode;
  readonly label: string;
}[] = [
  { mode: "terrain", label: "Terrain" },
  { mode: "richness", label: "Richness" },
  { mode: "seasonal_food", label: "Seasonal Food" },
  { mode: "water", label: "Water" },
  { mode: "elevation", label: "Elevation" },
  { mode: "movement", label: "Movement Cost" },
];

const ACTIVITY_OVERLAY_MODES: readonly {
  readonly mode: ActivityOverlayMode;
  readonly label: string;
}[] = [
  { mode: "all", label: "All" },
  { mode: "selected", label: "Selected" },
  { mode: "off", label: "Off" },
];

const RANGE_OVERLAY_MODES: readonly {
  readonly mode: FamiliarRangeOverlayMode;
  readonly label: string;
}[] = [
  { mode: "off", label: "Off" },
  { mode: "selected", label: "Selected" },
  { mode: "all", label: "All" },
];

// PRE-RUN-MAP-MAKER-1 — setup-only paint mode. "move_bands" leaves painting off
// so the existing drag-to-place band flow keeps working inside the editor.
export type MapEditorTool = TerrainPaintKind | "erase" | "move_bands";

export interface MapEditorCanvasConfig {
  readonly active: boolean;
  readonly tool: MapEditorTool;
  readonly brushRadius: number;
  readonly onPaintStroke: (tiles: readonly Coord[], tool: Exclude<MapEditorTool, "move_bands">) => void;
}

interface WorldCanvasProps {
  readonly setupPlacementEnabled?: boolean;
  readonly onPlaceInitialBand?: (bandId: BandId, tileId: TileId) => void;
  readonly mapEditor?: MapEditorCanvasConfig;
}

interface SetupPlacementDrag {
  readonly pointerId: number;
  readonly bandId: BandId;
  readonly originTileId: TileId;
}

export function WorldCanvas({
  setupPlacementEnabled = false,
  onPlaceInitialBand,
  mapEditor,
}: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ReturnType<typeof createCanvasRenderer> | null>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartPointRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const dragStartCameraRef = useRef<CanvasRenderSnapshot["camera"] | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const dragPendingDeltaRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelZoomFactorRef = useRef(1);
  const renderDirtyRef = useRef(true);
  const setupPlacementPreviewRef = useRef<SetupPlacementPreview | null>(null);
  const setupPlacementDragRef = useRef<SetupPlacementDrag | null>(null);
  const setupPlacementEnabledRef = useRef(setupPlacementEnabled);
  const onPlaceInitialBandRef = useRef(onPlaceInitialBand);
  // PRE-RUN-MAP-MAKER-1 — paint stroke state. The stroke stays local to the
  // canvas (dedup + live preview); the app rebuilds the world once on commit.
  const mapEditorRef = useRef(mapEditor);
  const mapEditorPreviewRef = useRef<MapEditorPreview | null>(null);
  const paintPointerRef = useRef<number | null>(null);
  const strokeTilesRef = useRef<Map<string, Coord>>(new Map());
  mapEditorRef.current = mapEditor;
  const [setupDragActive, setSetupDragActive] = useState(false);
  const wheelPointRef = useRef<{
    readonly point: { readonly x: number; readonly y: number };
    readonly viewport: { readonly width: number; readonly height: number };
  } | null>(null);
  setupPlacementEnabledRef.current = setupPlacementEnabled;
  onPlaceInitialBandRef.current = onPlaceInitialBand;
  // Toolbar-display state only (low frequency): these drive button active
  // states, so they stay React selectors. High-frequency sim state (world,
  // liveOverlay, camera, selection) is NOT a React selector — it flows to the
  // canvas through an imperative store subscription + a requestAnimationFrame
  // render loop, so worker overlay bursts never trigger React reconciliation
  // and the map paints the LATEST state smoothly at display rate (PERF-2 fix
  // for the "bands move once every few ticks" jerkiness — the data was always
  // per-tick correct; React batching of rapid overlays was dropping frames).
  const mapViewMode = useSimulationStore((state) => state.mapViewMode);
  const showGrid = useSimulationStore((state) => state.showGrid);
  const showRivers = useSimulationStore((state) => state.showRivers);
  const showLegend = useSimulationStore((state) => state.showLegend);
  const activityOverlayMode = useSimulationStore((state) => state.activityOverlayMode);
  const familiarRangeOverlayMode = useSimulationStore((state) => state.familiarRangeOverlayMode);
  const seasonalVisualsEnabled = useSimulationStore((state) => state.seasonalVisualsEnabled);
  const setSelectedBandId = useSimulationStore((state) => state.setSelectedBandId);
  const setSelectedActivityTripId = useSimulationStore((state) => state.setSelectedActivityTripId);
  const setSelectedTileId = useSimulationStore((state) => state.setSelectedTileId);
  const setHoveredTileId = useSimulationStore((state) => state.setHoveredTileId);
  const setMapViewMode = useSimulationStore((state) => state.setMapViewMode);
  const setMapCamera = useSimulationStore((state) => state.setMapCamera);
  const setShowGrid = useSimulationStore((state) => state.setShowGrid);
  const setShowRivers = useSimulationStore((state) => state.setShowRivers);
  const setShowLegend = useSimulationStore((state) => state.setShowLegend);
  const setActivityOverlayMode = useSimulationStore((state) => state.setActivityOverlayMode);
  const setFamiliarRangeOverlayMode = useSimulationStore((state) => state.setFamiliarRangeOverlayMode);
  const setSeasonalVisualsEnabled = useSimulationStore((state) => state.setSeasonalVisualsEnabled);
  const buildSnapshot = (state: ReturnType<typeof useSimulationStore.getState>): CanvasRenderSnapshot => ({
    world: state.world,
    liveOverlay: state.liveOverlay,
    selectedBandId: state.selectedBandId,
    selectedActivityTripId: state.selectedActivityTripId,
    selectedTileId: state.selectedTileId,
    hoveredTileId: state.hoveredTileId,
    mapViewMode: state.mapViewMode,
    camera: state.mapCamera,
    showGrid: state.showGrid,
    showRivers: state.showRivers,
    showLegend: state.showLegend,
    activityOverlayMode: state.activityOverlayMode,
    familiarRangeOverlayMode: state.familiarRangeOverlayMode,
    seasonalVisualsEnabled: state.seasonalVisualsEnabled,
    setupPlacementPreview: setupPlacementPreviewRef.current,
    mapEditorPreview: mapEditorPreviewRef.current,
  });
  const latestSnapshotRef = useRef<CanvasRenderSnapshot>(buildSnapshot(useSimulationStore.getState()));

  useEffect(() => {
    function handleSetupEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || setupPlacementDragRef.current === null) {
        return;
      }

      event.preventDefault();
      cancelSetupPlacementDrag();
    }

    window.addEventListener("keydown", handleSetupEscape);
    return () => window.removeEventListener("keydown", handleSetupEscape);
  }, []);

  useEffect(() => {
    if (!setupPlacementEnabled) {
      cancelSetupPlacementDrag();
    }
  }, [setupPlacementEnabled]);

  // Closing the editor (or the sim starting) drops any in-flight stroke and the
  // brush cursor; a tool/brush change just refreshes the preview styling.
  useEffect(() => {
    if (mapEditor?.active !== true) {
      paintPointerRef.current = null;
      strokeTilesRef.current = new Map();
    }

    if (mapEditorPreviewRef.current !== null || mapEditor?.active === true) {
      publishMapEditorPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEditor?.active, mapEditor?.tool, mapEditor?.brushRadius]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return undefined;
    }

    const renderer = createCanvasRenderer(canvas);
    rendererRef.current = renderer;

    latestSnapshotRef.current = buildSnapshot(useSimulationStore.getState());

    // rAF render loop: paints the latest snapshot at display rate, only when it
    // changed since the last paint (a cheap reference check on each store
    // field), so an idle/paused sim costs nothing.
    let frame = 0;
    const unsubscribe = useSimulationStore.subscribe((state) => {
      latestSnapshotRef.current = buildSnapshot(state);
      renderDirtyRef.current = true;
    });
    const renderFrame = () => {
      try {
        if (renderDirtyRef.current && rendererRef.current !== null) {
          renderDirtyRef.current = false;
          rendererRef.current.render(latestSnapshotRef.current);
        }
      } catch (error) {
        // A render exception must never kill the rAF loop (that would freeze the
        // whole map). Log it and keep painting subsequent frames.
        console.error("WorldCanvas render error:", error);
      }

      frame = window.requestAnimationFrame(renderFrame);
    };

    frame = window.requestAnimationFrame(renderFrame);

    const markDirty = () => {
      renderDirtyRef.current = true;
    };
    const resizeObserver = new ResizeObserver(markDirty);

    resizeObserver.observe(canvas);
    window.addEventListener("resize", markDirty);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.cancelAnimationFrame(frame);
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      unsubscribe();
      resizeObserver.disconnect();
      window.removeEventListener("resize", markDirty);
      canvas.removeEventListener("wheel", handleWheel);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  function renderCurrentSnapshotNow() {
    if (rendererRef.current === null) {
      return;
    }

    try {
      renderDirtyRef.current = false;
      rendererRef.current.render(latestSnapshotRef.current);
    } catch (error) {
      console.error("WorldCanvas render error:", error);
      renderDirtyRef.current = true;
    }
  }

  function getTileIdFromEvent(
    event: { readonly clientX: number; readonly clientY: number },
  ) {
    return (
      rendererRef.current?.getTileIdAtClientPoint(
        latestSnapshotRef.current,
        event.clientX,
        event.clientY,
      ) ?? null
    );
  }

  function getBandIdFromEvent(
    event: { readonly clientX: number; readonly clientY: number },
  ) {
    return (
      rendererRef.current?.getBandIdAtClientPoint(
        latestSnapshotRef.current,
        event.clientX,
        event.clientY,
      ) ?? null
    );
  }

  function getActivityTripIdFromEvent(
    event: { readonly clientX: number; readonly clientY: number },
  ) {
    return (
      rendererRef.current?.getActivityTripIdAtClientPoint(
        latestSnapshotRef.current,
        event.clientX,
        event.clientY,
      ) ?? null
    );
  }

  /* ----------------------- PRE-RUN-MAP-MAKER-1 painting ------------------- */

  function isPaintToolArmed(): boolean {
    const editor = mapEditorRef.current;

    return editor !== undefined && editor.active && editor.tool !== "move_bands";
  }

  function getCoordFromEvent(event: { readonly clientX: number; readonly clientY: number }): Coord | null {
    const tileId = getTileIdFromEvent(event);
    const world = latestSnapshotRef.current.world;

    if (tileId === null || world === null) {
      return null;
    }

    const tile = world.tiles[tileId];

    return tile === undefined ? null : tile.coord;
  }

  function brushCoords(center: Coord, radius: number): readonly Coord[] {
    const coords: Coord[] = [];

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy <= radius * radius + 0.35) {
          coords.push({ x: center.x + dx, y: center.y + dy });
        }
      }
    }

    return coords;
  }

  function publishMapEditorPreview(brushCenter: Coord | null) {
    const editor = mapEditorRef.current;

    if (editor === undefined || !editor.active) {
      mapEditorPreviewRef.current = null;
    } else {
      const terrain = editor.tool === "move_bands" ? "erase" : editor.tool;

      mapEditorPreviewRef.current = {
        pendingTiles: Array.from(strokeTilesRef.current.values()).map((coord) => ({
          x: coord.x,
          y: coord.y,
          terrain,
        })),
        brush:
          brushCenter === null || editor.tool === "move_bands"
            ? null
            : { x: brushCenter.x, y: brushCenter.y, radius: editor.brushRadius },
      };
    }

    latestSnapshotRef.current = {
      ...latestSnapshotRef.current,
      mapEditorPreview: mapEditorPreviewRef.current,
    };
    renderCurrentSnapshotNow();
  }

  function paintAtEvent(event: { readonly clientX: number; readonly clientY: number }) {
    const editor = mapEditorRef.current;
    const center = getCoordFromEvent(event);

    if (editor === undefined || center === null) {
      return;
    }

    for (const coord of brushCoords(center, editor.brushRadius)) {
      strokeTilesRef.current.set(`${coord.x}:${coord.y}`, coord);
    }

    publishMapEditorPreview(center);
  }

  function beginPaintStroke(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    if (!isPaintToolArmed() || latestSnapshotRef.current.world === null) {
      return false;
    }

    paintPointerRef.current = event.pointerId;
    strokeTilesRef.current = new Map();
    paintAtEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    return true;
  }

  function finishPaintStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const editor = mapEditorRef.current;
    const pointerId = paintPointerRef.current;

    if (pointerId === null) {
      return;
    }

    paintAtEvent(event);
    const tiles = Array.from(strokeTilesRef.current.values());

    paintPointerRef.current = null;
    strokeTilesRef.current = new Map();
    publishMapEditorPreview(getCoordFromEvent(event));

    if (event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }

    if (editor !== undefined && editor.tool !== "move_bands" && tiles.length > 0) {
      dragMovedRef.current = true;
      editor.onPaintStroke(tiles, editor.tool);
    }
  }

  function beginSetupPlacementDrag(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    if (!setupPlacementEnabledRef.current || onPlaceInitialBandRef.current === undefined) {
      return false;
    }

    const bandId = getBandIdFromEvent(event);
    const world = latestSnapshotRef.current.world;

    if (bandId === null || world === null) {
      return false;
    }

    const band = world.bands[bandId];

    if (band === undefined) {
      return false;
    }

    setupPlacementDragRef.current = {
      pointerId: event.pointerId,
      bandId,
      originTileId: band.position,
    };
    setSelectedBandId(bandId);
    setSelectedActivityTripId(null);
    setSelectedTileId(null);
    setSetupDragActive(true);
    updateSetupPlacementPreview(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    return true;
  }

  function updateSetupPlacementPreview(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = setupPlacementDragRef.current;
    const world = latestSnapshotRef.current.world;

    if (drag === null || world === null) {
      return;
    }

    const tileId =
      rendererRef.current?.getTileIdAtClientPoint(
        latestSnapshotRef.current,
        event.clientX,
        event.clientY,
      ) ?? null;
    const validation = validateInitialBandPlacement(world, drag.bandId, tileId);
    const preview: SetupPlacementPreview = {
      bandId: drag.bandId,
      tileId,
      valid: validation.valid,
      reason: validation.valid ? undefined : validation.reason,
    };

    setupPlacementPreviewRef.current = preview;
    latestSnapshotRef.current = {
      ...latestSnapshotRef.current,
      setupPlacementPreview: preview,
    };
    renderCurrentSnapshotNow();
  }

  function finishSetupPlacementDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = setupPlacementDragRef.current;

    if (drag === null) {
      return;
    }

    updateSetupPlacementPreview(event);
    const preview = setupPlacementPreviewRef.current;
    const shouldCommit =
      preview !== null &&
      preview.valid &&
      preview.tileId !== null &&
      preview.tileId !== drag.originTileId;

    clearSetupPlacementPreview();
    setupPlacementDragRef.current = null;
    setSetupDragActive(false);

    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }

    if (shouldCommit && preview?.tileId !== null && preview?.tileId !== undefined) {
      dragMovedRef.current = true;
      onPlaceInitialBandRef.current?.(drag.bandId, preview.tileId);
    }
  }

  function cancelSetupPlacementDrag() {
    const canvas = canvasRef.current;
    const drag = setupPlacementDragRef.current;

    if (canvas !== null && drag !== null && canvas.hasPointerCapture(drag.pointerId)) {
      canvas.releasePointerCapture(drag.pointerId);
    }

    setupPlacementDragRef.current = null;
    setSetupDragActive(false);
    clearSetupPlacementPreview();
  }

  function clearSetupPlacementPreview() {
    if (setupPlacementPreviewRef.current === null) {
      return;
    }

    setupPlacementPreviewRef.current = null;
    latestSnapshotRef.current = {
      ...latestSnapshotRef.current,
      setupPlacementPreview: null,
    };
    renderDirtyRef.current = true;
    renderCurrentSnapshotNow();
  }

  // Hover tracking is intentionally DISABLED: on long-running worlds every
  // hovered-tile change triggered a redraw, which reads as lag. Moving the
  // mouse now does nothing; tiles/bands are inspected by CLICK only.
  // Live pan: while dragging, move the camera on every pointermove so the map
  // tracks the cursor in real time (the rAF render loop paints each frame).
  // Pointer capture (set on pointerdown) keeps events flowing even when the
  // cursor leaves the canvas, so a drag never stalls or "snaps" on release.
  function applyPendingDragPan() {
    const pendingDelta = dragPendingDeltaRef.current;
    const startCamera = dragStartCameraRef.current;

    dragFrameRef.current = null;

    if (pendingDelta === null || startCamera === null) {
      return;
    }

    const nextCamera = panMapCamera(startCamera, pendingDelta.x, pendingDelta.y);
    setMapCamera(nextCamera);
    latestSnapshotRef.current = { ...latestSnapshotRef.current, camera: nextCamera };
    renderCurrentSnapshotNow();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (paintPointerRef.current !== null) {
      dragMovedRef.current = true;
      paintAtEvent(event);
      event.preventDefault();
      return;
    }

    // Armed but not painting: track the brush cursor. This is setup-only (sim
    // paused at tick 0), so the extra redraws never race a running world.
    if (isPaintToolArmed()) {
      publishMapEditorPreview(getCoordFromEvent(event));
    }

    if (setupPlacementDragRef.current !== null) {
      dragMovedRef.current = true;
      updateSetupPlacementPreview(event);
      event.preventDefault();
      return;
    }

    const startPoint = dragStartPointRef.current;
    const startCamera = dragStartCameraRef.current;

    if (!isDraggingRef.current || startPoint === null || startCamera === null) {
      return;
    }

    const deltaX = event.clientX - startPoint.x;
    const deltaY = event.clientY - startPoint.y;

    if (deltaX !== 0 || deltaY !== 0) {
      dragMovedRef.current = true;
      dragPendingDeltaRef.current = { x: deltaX, y: deltaY };

      if (dragFrameRef.current === null) {
        dragFrameRef.current = window.requestAnimationFrame(applyPendingDragPan);
      }
    }
  }

  function handlePointerLeave() {
    // Hide the brush cursor when the pointer leaves (an active captured stroke
    // keeps receiving moves, so this only fires for hover).
    if (paintPointerRef.current === null && mapEditorPreviewRef.current !== null) {
      publishMapEditorPreview(null);
    }

    if (latestSnapshotRef.current.hoveredTileId !== null) {
      setHoveredTileId(null);
    }
  }

  function handleClick(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }

    const activityTripId = getActivityTripIdFromEvent(event);

    if (activityTripId !== null) {
      setSelectedActivityTripId(activityTripId);
      return;
    }

    const bandId = getBandIdFromEvent(event);

    if (bandId !== null) {
      setSelectedBandId(bandId);
      setSelectedActivityTripId(null);
      setSelectedTileId(null);
      return;
    }

    setSelectedActivityTripId(null);
    setSelectedBandId(null);
    setSelectedTileId(getTileIdFromEvent(event));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) {
      return;
    }

    if (beginPaintStroke(event)) {
      return;
    }

    if (beginSetupPlacementDrag(event)) {
      return;
    }

    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartPointRef.current = { x: event.clientX, y: event.clientY };
    dragStartCameraRef.current = useSimulationStore.getState().mapCamera;
    dragPendingDeltaRef.current = null;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    // Capture the pointer so the drag keeps tracking past the canvas edge.
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (paintPointerRef.current !== null) {
      finishPaintStroke(event);
      return;
    }

    if (setupPlacementDragRef.current !== null) {
      finishSetupPlacementDrag(event);
      return;
    }

    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      applyPendingDragPan();
    }
    dragPendingDeltaRef.current = null;
    dragStartPointRef.current = null;
    dragStartCameraRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleZoomIn() {
    setMapCamera(zoomMapCamera(latestSnapshotRef.current.camera, 1.35));
  }

  function handleZoomOut() {
    setMapCamera(zoomMapCamera(latestSnapshotRef.current.camera, 1 / 1.35));
  }

  function handleWheel(event: WheelEvent) {
    const canvas = canvasRef.current;

    if (latestSnapshotRef.current.world === null) {
      return;
    }

    event.preventDefault();

    if (canvas === null) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0014);

    wheelZoomFactorRef.current *= factor;
    wheelPointRef.current = {
      point: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      viewport: {
        width: rect.width,
        height: rect.height,
      },
    };

    if (wheelFrameRef.current === null) {
      wheelFrameRef.current = window.requestAnimationFrame(() => {
        const wheelPoint = wheelPointRef.current;
        const zoomFactor = wheelZoomFactorRef.current;
        wheelFrameRef.current = null;
        wheelZoomFactorRef.current = 1;
        wheelPointRef.current = null;

        if (wheelPoint === null) {
          return;
        }

        setMapCamera(
          zoomMapCameraAtPoint(
            useSimulationStore.getState().mapCamera,
            zoomFactor,
            wheelPoint.point,
            wheelPoint.viewport,
          ),
        );
      });
    }
  }

  function handleResetView() {
    setMapCamera(getInitialMapCamera());
  }

  // Keyboard operability for the map: arrow keys pan (Shift = faster), +/- zoom,
  // 0 resets, Enter/Space inspects the tile at the center of the view. Pan
  // deltas mirror the drag handler's screen-space convention (ArrowRight reveals
  // content to the right == dragging left).
  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const snapshot = latestSnapshotRef.current;

    if (snapshot.world === null) {
      return;
    }

    const panStep = event.shiftKey ? 192 : 64;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        setMapCamera(panMapCamera(snapshot.camera, 0, panStep));
        break;
      case "ArrowDown":
        event.preventDefault();
        setMapCamera(panMapCamera(snapshot.camera, 0, -panStep));
        break;
      case "ArrowLeft":
        event.preventDefault();
        setMapCamera(panMapCamera(snapshot.camera, panStep, 0));
        break;
      case "ArrowRight":
        event.preventDefault();
        setMapCamera(panMapCamera(snapshot.camera, -panStep, 0));
        break;
      case "+":
      case "=":
        event.preventDefault();
        setMapCamera(zoomMapCamera(snapshot.camera, 1.35));
        break;
      case "-":
      case "_":
        event.preventDefault();
        setMapCamera(zoomMapCamera(snapshot.camera, 1 / 1.35));
        break;
      case "0":
        event.preventDefault();
        setMapCamera(getInitialMapCamera());
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectCenterTile();
        break;
      default:
        break;
    }
  }

  // The keyboard counterpart to a click: inspect whatever tile sits at the
  // center of the current view (clearing any band/activity selection, exactly
  // like handleClick's tile branch).
  function selectCenterTile() {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;

    if (canvas === null || renderer === null) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const tileId =
      renderer.getTileIdAtClientPoint(
        latestSnapshotRef.current,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      ) ?? null;

    setSelectedActivityTripId(null);
    setSelectedBandId(null);
    setSelectedTileId(tileId);
  }

  return (
    <section className="world-panel" aria-label="Generated world canvas">
      <div className="world-view">
        <canvas
          ref={canvasRef}
          className={setupDragActive ? "world-canvas setup-placement-dragging" : "world-canvas"}
          tabIndex={0}
          aria-label="Interactive world map"
          aria-describedby="world-canvas-help"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Plus Minus 0 Enter"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
          onKeyDown={handleCanvasKeyDown}
        />
        <p id="world-canvas-help" className="sr-only">
          Interactive map. Use the arrow keys to pan, plus and minus to zoom,
          zero to reset the view, and Enter to inspect the tile at the center of
          the view. Hold Shift while panning to move faster.
        </p>

        {setupPlacementEnabled ? (
          <div className="setup-placement-hint" aria-live="polite">
            Setup mode: drag starting band before running.
          </div>
        ) : null}

        <div className="map-overlay">
          <div className="view-tabs" aria-label="Map view mode">
            {MAP_VIEW_MODES.map((item) => (
              <button
                key={item.mode}
                type="button"
                aria-pressed={mapViewMode === item.mode}
                className={mapViewMode === item.mode ? "active" : undefined}
                onClick={() => setMapViewMode(item.mode)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="map-controls">
            <div className="map-toggles" aria-label="Map overlays">
              <label>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(event) => setShowGrid(event.target.checked)}
                />
                Grid
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showRivers}
                  onChange={(event) => setShowRivers(event.target.checked)}
                />
                Rivers
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showLegend !== false}
                  onChange={(event) => setShowLegend(event.target.checked)}
                />
                Legend
              </label>
              <label title="Cosmetic seasonal map colours only; no simulation rules change">
                <input
                  type="checkbox"
                  checked={seasonalVisualsEnabled !== false}
                  onChange={(event) => setSeasonalVisualsEnabled(event.target.checked)}
                />
                Seasons
              </label>
              <label>
                Activity
                <select
                  value={activityOverlayMode}
                  onChange={(event) => setActivityOverlayMode(event.target.value as ActivityOverlayMode)}
                >
                  {ACTIVITY_OVERLAY_MODES.map((item) => (
                    <option key={item.mode} value={item.mode}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                title={
                  familiarRangeOverlayMode === "all"
                    ? "All bands' familiar-country washes — transparent use-ranges, not territory or borders"
                    : "Selected band's familiar use-range (RANGE-1/3) — transparent use-range, not territory or borders"
                }
              >
                Range
                <select
                  value={familiarRangeOverlayMode}
                  onChange={(event) => setFamiliarRangeOverlayMode(event.target.value as FamiliarRangeOverlayMode)}
                >
                  {RANGE_OVERLAY_MODES.map((item) => (
                    <option key={item.mode} value={item.mode}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="camera-actions" aria-label="Map camera controls">
              <button type="button" onClick={handleZoomOut} aria-label="Zoom out">
                &minus;
              </button>
              <button type="button" onClick={handleZoomIn} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={handleResetView}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
