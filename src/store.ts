import { create } from "zustand";
import type {
  SimLiveOverlay,
  SimSelectedBandPanelProjection,
  WorldEcologySummary,
} from "./sim/runner/simRunner";

// SIM-TOOLS-1 — ecology inspection mode. "off" hides the ecology panel; "band"
// shows ONLY what the selected band knows (anti-omniscient, default); "debug"
// shows world ecology TRUTH and is explicitly labelled a debug view.
export type EcologyViewMode = "off" | "band" | "debug";

import type {
  BandId,
  SettlementId,
  TileId,
} from "./sim/core/types";
import type { WorldState } from "./sim/world/types";
import type {
  ActivityOverlayMode,
  FamiliarRangeOverlayMode,
  MapCamera,
  MapViewMode,
} from "./render/canvasRenderer";

export interface SimulationStoreState {
  readonly world: WorldState | null;
  readonly selectedBandId: BandId | null;
  readonly selectedActivityTripId: string | null;
  readonly selectedTileId: TileId | null;
  readonly hoveredTileId: TileId | null;
  // PERF-1: ~KB live overlay from the sim worker (markers/clock/counts every
  // tick) — full world snapshots arrive far less often.
  readonly liveOverlay: SimLiveOverlay | null;
  // LIVE-FOLLOW-PANEL-1: live selected-band-only projection. This is separate
  // from the all-band marker overlay so the panel can refresh while running
  // without making every marker carry raw band/debug state.
  readonly selectedBandPanelProjection: SimSelectedBandPanelProjection | null;
  readonly selectedSettlementId: SettlementId | null;
  readonly paused: boolean;
  readonly mapViewMode: MapViewMode;
  readonly mapCamera: MapCamera;
  readonly showGrid: boolean;
  readonly showRivers: boolean;
  readonly showLegend: boolean;
  readonly activityOverlayMode: ActivityOverlayMode;
  readonly familiarRangeOverlayMode: FamiliarRangeOverlayMode;
  readonly seasonalVisualsEnabled: boolean;
  // SIM-TOOLS-1 — world-truth ecology aggregate (DEBUG view only) + the inspection mode.
  readonly ecologySummary: WorldEcologySummary | null;
  readonly ecologyViewMode: EcologyViewMode;
  readonly setWorld: (world: WorldState) => void;
  readonly setSelectedBandId: (bandId: BandId | null) => void;
  readonly setSelectedActivityTripId: (tripId: string | null) => void;
  readonly setSelectedTileId: (tileId: TileId | null) => void;
  readonly setHoveredTileId: (tileId: TileId | null) => void;
  readonly setLiveOverlay: (overlay: SimLiveOverlay | null) => void;
  readonly setSelectedBandPanelProjection: (projection: SimSelectedBandPanelProjection | null) => void;
  readonly setPaused: (paused: boolean) => void;
  readonly setMapViewMode: (mode: MapViewMode) => void;
  readonly setMapCamera: (camera: MapCamera) => void;
  readonly setShowGrid: (showGrid: boolean) => void;
  readonly setShowRivers: (showRivers: boolean) => void;
  readonly setShowLegend: (showLegend: boolean) => void;
  readonly setActivityOverlayMode: (mode: ActivityOverlayMode) => void;
  readonly setFamiliarRangeOverlayMode: (mode: FamiliarRangeOverlayMode) => void;
  readonly setSeasonalVisualsEnabled: (enabled: boolean) => void;
  readonly setEcologySummary: (summary: WorldEcologySummary | null) => void;
  readonly setEcologyViewMode: (mode: EcologyViewMode) => void;
}

export const useSimulationStore = create<SimulationStoreState>((set) => ({
  world: null,
  selectedBandId: null,
  selectedActivityTripId: null,
  selectedTileId: null,
  hoveredTileId: null,
  liveOverlay: null,
  selectedBandPanelProjection: null,
  selectedSettlementId: null,
  paused: true,
  mapViewMode: "terrain",
  mapCamera: { zoom: 1, panX: 0, panY: 0 },
  showGrid: false,
  // MAP2-R: river/stream overlay markers default OFF — river tiles already
  // render blue; the overlay is a debug emphasis layer.
  showRivers: false,
  // The map legend is drawn on the canvas; on by default but dismissible via
  // the map overlay so it can be cleared off the bottom of the map.
  showLegend: true,
  // REALISM-2B (user-requested): activity overlay defaults to "selected" — activity
  // markers/routes are only drawn for the band you select, not for every band. This
  // declutters the map AND optimizes rendering (no per-frame all-band activity scan;
  // work is bounded to one band's capped recent trips). "all"/"off" remain opt-in.
  activityOverlayMode: "selected",
  familiarRangeOverlayMode: "off",
  seasonalVisualsEnabled: true,
  ecologySummary: null,
  ecologyViewMode: "band",
  setWorld: (world) => set({ world }),
  setSelectedBandId: (bandId) =>
    set((state) => ({
      selectedBandId: bandId,
      selectedBandPanelProjection:
        bandId === state.selectedBandId ? state.selectedBandPanelProjection : null,
      selectedActivityTripId:
        bandId === null || bandId !== state.selectedBandId ? null : state.selectedActivityTripId,
    })),
  setSelectedActivityTripId: (tripId) => set({ selectedActivityTripId: tripId }),
  setSelectedTileId: (tileId) => set({ selectedTileId: tileId }),
  setHoveredTileId: (tileId) => set({ hoveredTileId: tileId }),
  setLiveOverlay: (overlay) => set({ liveOverlay: overlay }),
  setSelectedBandPanelProjection: (projection) =>
    set((state) => {
      if (projection === null) {
        return { selectedBandPanelProjection: null };
      }

      return state.selectedBandId !== null && String(state.selectedBandId) === projection.selectedBandId
        ? { selectedBandPanelProjection: projection }
        : {};
    }),
  setEcologySummary: (summary) => set({ ecologySummary: summary }),
  setEcologyViewMode: (mode) => set({ ecologyViewMode: mode }),
  setPaused: (paused) => set({ paused }),
  setMapViewMode: (mode) => set({ mapViewMode: mode }),
  setMapCamera: (camera) => set({ mapCamera: camera }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowRivers: (showRivers) => set({ showRivers }),
  setShowLegend: (showLegend) => set({ showLegend }),
  setActivityOverlayMode: (activityOverlayMode) => set({ activityOverlayMode }),
  setFamiliarRangeOverlayMode: (familiarRangeOverlayMode) => set({ familiarRangeOverlayMode }),
  setSeasonalVisualsEnabled: (seasonalVisualsEnabled) => set({ seasonalVisualsEnabled }),
}));
