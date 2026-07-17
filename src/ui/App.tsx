import { useEffect, useRef, useState } from "react";

import { getInitialMapCamera } from "../render/canvasRenderer";
import { useSimulationStore } from "../store";
import {
  loadSimWorld,
  pauseSim,
  resetSimTimeBridge,
  runSim,
  stepSimOnce,
} from "./simBridge";
import type {
  AddedBandSpec,
  SimInitialBandPlacement,
  SimLiveOverlay,
  SimWorldKind,
  TerrainEdit,
  TerrainPaintKind,
} from "../sim/runner/simRunner";
import { validateTerrainEdits, validateWorldSetup } from "../sim/runner/simRunner";
import { MapEditorPanel } from "./MapEditorPanel";
import type { MapEditorTool } from "./WorldCanvas";
import {
  DEFAULT_WORLD_CONFIG,
  DEFAULT_WORLD_SEED,
  REGIONAL_DEBUG_WORLD_CONFIG,
  REGIONAL_DEBUG_WORLD_SEED,
  VARIED_MIGRATION_KM_PER_TILE,
  VARIED_MIGRATION_WORLD_CONFIG,
} from "../sim/world/generate";
import type { BandId, StepMode, TileId } from "../sim/core/types";
import { STEP_MODE_DAYS } from "../sim/core/types";
import type { WorldState } from "../sim/world/types";
import { TileInspector } from "./TileInspector";
import { BandPanel } from "./BandPanel";
import { WorldClock } from "./WorldClock";
import { WorldCanvas } from "./WorldCanvas";
import { Icon } from "./icons";

interface SpeedPreset {
  readonly id: string;
  readonly label: string;
  readonly daysPerSecond: number;
  readonly forcedStepMode?: StepMode;
  // Optional defensive ceiling on how many sim steps a single worker batch may
  // advance, so a very high target can never balloon into one giant synchronous
  // tick. Omitted = no extra cap (existing presets keep their exact behaviour).
  readonly maxStepsPerInterval?: number;
}

const SPEED_PRESETS: readonly SpeedPreset[] = [
  { id: "close", label: "Close Read", daysPerSecond: 7 },
  { id: "medium", label: "Medium", daysPerSecond: 30 },
  { id: "fast", label: "Fast", daysPerSecond: 90 },
  { id: "ultra", label: "Ultra Fast / Civilization Skip", daysPerSecond: 900, forcedStepMode: "seasonal" },
];

// Hidden easter-egg speed — not in the dropdown until unlocked by holding Ctrl
// and tapping D ten times (see the unlock effect below). It flies through the
// years (~12 sim years / real second, ~5× Civilization Skip) but stays stable:
// seasonal resolution (cheapest step), a 12-step/batch ceiling so each
// synchronous worker batch is bounded, and adaptive full-snapshot throttling
// keeps the main thread from being flooded. On a heavy late-century world the
// bounded batch simply self-throttles (steps take longer) instead of freezing the tab.
const VORTEX_SPEED_PRESET: SpeedPreset = {
  id: "vortex",
  label: "Time Vortex — Ultra Ultra Fast ⚡",
  daysPerSecond: 6000,
  forcedStepMode: "seasonal",
  maxStepsPerInterval: 12,
};

const VORTEX_UNLOCK_PRESSES = 10;
const VORTEX_UNLOCK_RESET_MS = 1500;
const VORTEX_UNLOCK_STORAGE_KEY = "hns:vortexUnlocked";

const STEP_MODE_PRESETS: readonly {
  readonly label: string;
  readonly mode: StepMode;
}[] = [
  { label: "Daily", mode: "daily" },
  { label: "Weekly", mode: "weekly" },
  { label: "Monthly", mode: "monthly" },
  { label: "Seasonal", mode: "seasonal" },
];

export function App() {
  const [seedInput, setSeedInput] = useState(String(DEFAULT_WORLD_SEED));
  const [speedPresetId, setSpeedPresetId] = useState("medium");
  const [stepMode, setStepMode] = useState<StepMode>("daily");
  // M0.10/MAP2-R: which debug map is loaded (Map 1 = regional lake/river
  // cradle, Map 2 = larger varied migration/saturation test map) and its
  // declared tile scale (Map 2 is authored at ~1.5 km per tile).
  const [mapLabel, setMapLabel] = useState("Map 1 — Lake/River Reference");
  const [mapScaleLabel, setMapScaleLabel] = useState("~1 km/tile (160×100 km)");
  // VAR-1: the run seed perturbs only near-tie decisions (different plausible
  // history per seed); empty = legacy deterministic movie. `currentMap` lets
  // "New History" reload the SAME map terrain with a fresh run seed.
  const [runSeedInput, setRunSeedInput] = useState("");
  const [initialBandPlacements, setInitialBandPlacements] = useState<readonly SimInitialBandPlacement[]>([]);
  // PRE-RUN-BAND-MANAGER-1 — setup-only roster edits.
  const [removedBandIds, setRemovedBandIds] = useState<readonly BandId[]>([]);
  const [addedBands, setAddedBands] = useState<readonly AddedBandSpec[]>([]);
  // PRE-RUN-MAP-MAKER-1 — setup-only terrain paint edits (part of the run
  // config; folded into SimWorldKind so the run replays from the config alone).
  const [mapEditorOpen, setMapEditorOpen] = useState(false);
  // Custom procedural size for player-made maps (clamped sim-side too).
  const [proceduralWidth, setProceduralWidth] = useState(DEFAULT_WORLD_CONFIG.width);
  const [proceduralHeight, setProceduralHeight] = useState(DEFAULT_WORLD_CONFIG.height);
  const [editorTool, setEditorTool] = useState<MapEditorTool>("plains");
  const [editorBrushRadius, setEditorBrushRadius] = useState(1);
  const [terrainEdits, setTerrainEdits] = useState<readonly TerrainEdit[]>([]);
  const [rejectedEditCount, setRejectedEditCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [currentMap, setCurrentMap] = useState<{
    readonly kind: SimWorldKind;
    readonly label: string;
  }>({ kind: { kind: "map1" }, label: "Map 1 — Lake/River Reference" });
  const world = useSimulationStore((state) => state.world);
  const liveOverlay = useSimulationStore((state) => state.liveOverlay);
  const paused = useSimulationStore((state) => state.paused);
  const setPaused = useSimulationStore((state) => state.setPaused);
  const selectedBandId = useSimulationStore((state) => state.selectedBandId);
  const selectedTileId = useSimulationStore((state) => state.selectedTileId);
  const setSelectedBandId = useSimulationStore((state) => state.setSelectedBandId);
  const setSelectedActivityTripId = useSimulationStore((state) => state.setSelectedActivityTripId);
  const setSelectedTileId = useSimulationStore((state) => state.setSelectedTileId);
  const setHoveredTileId = useSimulationStore((state) => state.setHoveredTileId);
  const setMapCamera = useSimulationStore((state) => state.setMapCamera);
  // Header counts come from the ~KB live overlay when it is fresher than the
  // (rarely-shipped) full world snapshot.
  const worldBands = world === null ? [] : Object.values(world.bands);
  const overlayFresher =
    liveOverlay !== null && (world === null || Number(liveOverlay.time.tick) >= Number(world.time.tick));
  const totals = overlayFresher
    ? liveOverlay.totals
    : {
        activeBands: worldBands.filter(
          (band) => band.status !== "dispersed" && band.viability?.status !== "absorbed" && band.viability?.status !== "extinct",
        ).length,
        totalBands: worldBands.length,
        absorbed: worldBands.filter((band) => band.viability?.status === "absorbed").length,
        extinct: worldBands.filter((band) => band.viability?.status === "extinct").length,
        population: Math.round(worldBands.reduce((total, band) => total + band.demography.population, 0)),
      };
  const [vortexUnlocked, setVortexUnlocked] = useState(() => readVortexUnlocked());
  const [vortexHintVisible, setVortexHintVisible] = useState(false);
  const vortexUnlockedRef = useRef(vortexUnlocked);
  vortexUnlockedRef.current = vortexUnlocked;

  const visibleSpeedPresets = vortexUnlocked ? [...SPEED_PRESETS, VORTEX_SPEED_PRESET] : SPEED_PRESETS;
  const speedPreset =
    visibleSpeedPresets.find((preset) => preset.id === speedPresetId) ?? SPEED_PRESETS[1];
  const vortexActive = speedPreset.id === VORTEX_SPEED_PRESET.id;
  const playbackSchedule = getPlaybackSchedule(
    speedPreset.daysPerSecond,
    stepMode,
    speedPreset.maxStepsPerInterval,
  );
  const setupPlacementEnabled = isSetupPlacementAvailable(world, liveOverlay, paused);
  // PRE-RUN-MAP-MAKER-1 — while the editor is open at setup, a genuinely broken
  // start (band on painted water etc.) blocks Play. The engine self-protects
  // anyway (spawn relocation, refused placements); this is honest UX on top.
  const setupIssues = mapEditorOpen && setupPlacementEnabled && world !== null ? validateWorldSetup(world) : [];
  const playBlockedByMap = setupIssues.length > 0;

  useEffect(() => {
    // Entering a map applies a fresh random run seed → a new plausible history
    // each time (the seed only perturbs near-tie tie-breaks; the run is still
    // fully deterministic for that seed). "Apply" with an explicit seed opts out.
    const seed = createRandomSeed();
    setRunSeedInput(seed);
    loadSimWorld({ kind: "map1" }, seed);
    setMapCamera(getInitialMapCamera());
  }, [setMapCamera]);

  // Easter-egg unlock: hold Ctrl (or ⌘) and tap D ten times in a row. We always
  // preventDefault on Ctrl/⌘+D so the browser "bookmark page" dialog never fires;
  // auto-repeat (holding D down) is ignored, and a >1.5s gap resets the streak
  // so it reads as a deliberate combo. Once unlocked it persists in localStorage.
  useEffect(() => {
    let presses = 0;
    let lastPressAt = 0;

    function handleKeyDown(event: KeyboardEvent) {
      const isUnlockCombo =
        (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "d";
      if (!isUnlockCombo) {
        return;
      }
      event.preventDefault();
      if (event.repeat || vortexUnlockedRef.current) {
        return;
      }

      const now = Date.now();
      presses = now - lastPressAt > VORTEX_UNLOCK_RESET_MS ? 1 : presses + 1;
      lastPressAt = now;

      if (presses >= VORTEX_UNLOCK_PRESSES) {
        presses = 0;
        setVortexUnlocked(true);
        setVortexHintVisible(true);
        writeVortexUnlocked();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!vortexHintVisible) {
      return;
    }
    const timer = setTimeout(() => setVortexHintVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [vortexHintVisible]);

  // QoL: Spacebar toggles play/pause (same as the transport button), unless the
  // user is typing in a field or focused on another control. Reads fresh store
  // state so there's no stale-closure paused value.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key !== " " && event.code !== "Space") {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || target?.isContentEditable) {
        return;
      }
      const state = useSimulationStore.getState();
      if (state.world === null) {
        return;
      }
      event.preventDefault();
      state.setPaused(!state.paused);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  // PERF-1: the sim runs in a Web Worker — season ticks never block the main
  // thread. Play/pause/speed translate to worker messages.
  useEffect(() => {
    if (paused) {
      pauseSim();
      return undefined;
    }

    runSim(
      playbackSchedule.intervalMs,
      stepMode,
      playbackSchedule.stepsPerInterval,
      playbackSchedule.fullSnapshotIntervalMs,
    );

    return () => pauseSim();
  }, [
    paused,
    playbackSchedule.fullSnapshotIntervalMs,
    playbackSchedule.intervalMs,
    playbackSchedule.stepsPerInterval,
    stepMode,
  ]);

  function generateFromSeed(seedValue: string) {
    const normalizedSeed = normalizeSeed(seedValue);
    const useCustomSize =
      proceduralWidth !== DEFAULT_WORLD_CONFIG.width || proceduralHeight !== DEFAULT_WORLD_CONFIG.height;
    const kind: SimWorldKind = {
      kind: "procedural",
      seed: normalizedSeed,
      ...(useCustomSize ? { size: { width: proceduralWidth, height: proceduralHeight } } : {}),
    };
    setSeedInput(normalizedSeed);
    setInitialBandPlacements([]);
    setRemovedBandIds([]);
    setAddedBands([]);
    setTerrainEdits([]);
    setRejectedEditCount(0);
    setCurrentMap({ kind, label: "Procedural World" });
    loadSimWorld(kind);
    setPaused(true);
    setMapCamera(getInitialMapCamera());
    clearTileInspection();
  }

  function loadRegionalDebugMap(runSeed: string = createRandomSeed()) {
    const kind: SimWorldKind = { kind: "map1" };
    setRunSeedInput(runSeed);
    setInitialBandPlacements([]);
    setRemovedBandIds([]);
    setAddedBands([]);
    setTerrainEdits([]);
    setRejectedEditCount(0);
    loadSimWorld(kind, runSeed);
    setMapLabel("Map 1 — Lake/River Reference");
    setMapScaleLabel("~1 km/tile (160×100 km)");
    setCurrentMap({ kind, label: "Map 1 — Lake/River Reference" });
    setPaused(true);
    setMapCamera(getInitialMapCamera());
    clearTileInspection();
  }

  // M0.10: Map 2 — larger varied map with explicit default spawn points for
  // migration/saturation testing (dry corridor, crowded lake basin, long river,
  // estuary, low-density pass frontier).
  function loadVariedMigrationMap(runSeed: string = createRandomSeed()) {
    const kind: SimWorldKind = { kind: "map2" };
    setRunSeedInput(runSeed);
    setInitialBandPlacements([]);
    setRemovedBandIds([]);
    setAddedBands([]);
    setTerrainEdits([]);
    setRejectedEditCount(0);
    loadSimWorld(kind, runSeed);
    setMapLabel("Map 2 — Varied Migration Test");
    setMapScaleLabel(
      `~${VARIED_MIGRATION_KM_PER_TILE} km/tile (${Math.round(VARIED_MIGRATION_WORLD_CONFIG.width * VARIED_MIGRATION_KM_PER_TILE)}×${Math.round(VARIED_MIGRATION_WORLD_CONFIG.height * VARIED_MIGRATION_KM_PER_TILE)} km)`,
    );
    setCurrentMap({ kind, label: "Map 2 — Varied Migration Test" });
    setPaused(true);
    setMapCamera(getInitialMapCamera());
    clearTileInspection();
  }

  // One-origin heat test: Map 2 terrain, a single founding band — watch its
  // descendants (fail to) colonize the world.
  function loadSingleOriginMap(runSeed: string = createRandomSeed()) {
    const kind: SimWorldKind = { kind: "map2_single_origin" };
    setRunSeedInput(runSeed);
    setInitialBandPlacements([]);
    setRemovedBandIds([]);
    setAddedBands([]);
    setTerrainEdits([]);
    setRejectedEditCount(0);
    loadSimWorld(kind, runSeed);
    setMapLabel("Map 2 — Single Origin Test");
    setMapScaleLabel(
      `~${VARIED_MIGRATION_KM_PER_TILE} km/tile (${Math.round(VARIED_MIGRATION_WORLD_CONFIG.width * VARIED_MIGRATION_KM_PER_TILE)}×${Math.round(VARIED_MIGRATION_WORLD_CONFIG.height * VARIED_MIGRATION_KM_PER_TILE)} km)`,
    );
    setCurrentMap({ kind, label: "Map 2 — Single Origin Test" });
    setPaused(true);
    setMapCamera(getInitialMapCamera());
    clearTileInspection();
  }

  // VAR-1: reload the current map terrain with a fresh run seed → a new
  // plausible history. The seed STRING is generated UI-side (crypto), but the
  // simulation it drives is fully deterministic for that string.
  function handleNewHistory() {
    const seed = createRandomSeed();
    setRunSeedInput(seed);
    loadSimWorld(withInitialBandPlacements(currentMap.kind, initialBandPlacements, removedBandIds, addedBands, terrainEdits), seed);
  }

  function handleApplyRunSeed() {
    loadSimWorld(withInitialBandPlacements(currentMap.kind, initialBandPlacements, removedBandIds, addedBands, terrainEdits), runSeedInput);
  }

  function handlePlaceInitialBand(bandId: BandId, tileId: TileId) {
    if (!setupPlacementEnabled) {
      return;
    }

    const addedIndex = addedBandIndexForBandId(bandId);
    if (addedIndex !== null) {
      const nextAdded = addedBands.map((spec, index) =>
        index === addedIndex ? { ...spec, tileId } : spec,
      );
      setAddedBands(nextAdded);
      setPaused(true);
      loadSimWorld(
        withInitialBandPlacements(
          currentMap.kind,
          initialBandPlacements,
          removedBandIds,
          nextAdded,
          terrainEdits,
        ),
        runSeedInput,
      );
      setSelectedBandId(bandId);
      setSelectedActivityTripId(null);
      setSelectedTileId(null);
      return;
    }

    const nextPlacements = upsertInitialBandPlacement(initialBandPlacements, { bandId, tileId });
    setInitialBandPlacements(nextPlacements);
    setPaused(true);
    loadSimWorld(withInitialBandPlacements(currentMap.kind, nextPlacements, removedBandIds, addedBands, terrainEdits), runSeedInput);
    setSelectedBandId(bandId);
    setSelectedActivityTripId(null);
    setSelectedTileId(null);
  }

  // PRE-RUN-BAND-MANAGER-1 — setup-only roster editing (no-op once the run starts;
  // the sim re-validates every edit and ignores them outside the setup state).
  function reloadRoster(nextRemoved: readonly BandId[], nextAdded: readonly AddedBandSpec[]) {
    setRemovedBandIds(nextRemoved);
    setAddedBands(nextAdded);
    setPaused(true);
    loadSimWorld(withInitialBandPlacements(currentMap.kind, initialBandPlacements, nextRemoved, nextAdded, terrainEdits), runSeedInput);
  }

  function handleAddBandAtSelectedTile() {
    if (!setupPlacementEnabled || selectedTileId === null) {
      return;
    }
    reloadRoster(removedBandIds, [...addedBands, { tileId: selectedTileId, knowledgePreset: "normal" }]);
    setSelectedTileId(null);
  }

  function handleRemoveStartingBand(bandId: BandId) {
    if (!setupPlacementEnabled) {
      return;
    }
    const addedIndex = addedBandIndexForBandId(bandId);
    if (addedIndex !== null) {
      // Remove an added custom band (re-index the rest deterministically).
      reloadRoster(removedBandIds, addedBands.filter((_, index) => index !== addedIndex));
    } else if (!removedBandIds.includes(bandId)) {
      reloadRoster([...removedBandIds, bandId], addedBands);
    }
    if (selectedBandId === bandId) {
      setSelectedBandId(null);
    }
  }

  function handleCommitAddedBand(index: number, name: string, population: number) {
    if (!setupPlacementEnabled) {
      return;
    }
    const trimmed = name.trim();
    reloadRoster(
      removedBandIds,
      addedBands.map((spec, specIndex) =>
        specIndex === index
          ? { ...spec, population, name: trimmed.length > 0 ? trimmed : undefined }
          : spec,
      ),
    );
  }

  function handleSetAddedBandPopulation(index: number, population: number) {
    if (!setupPlacementEnabled) {
      return;
    }
    reloadRoster(
      removedBandIds,
      addedBands.map((spec, specIndex) =>
        specIndex === index
          ? { ...spec, population: Math.max(2, Math.min(60, Math.round(population))) }
          : spec,
      ),
    );
  }

  function handleResetRoster() {
    if (!setupPlacementEnabled) {
      return;
    }
    setInitialBandPlacements([]);
    reloadRoster([], []);
  }

  function clearTileInspection() {
    setSelectedBandId(null);
    setSelectedActivityTripId(null);
    setSelectedTileId(null);
    setHoveredTileId(null);
  }

  // PRE-RUN-MAP-MAKER-1 — one paint stroke committed: merge into the terrain
  // edit set (last paint per tile wins; erase restores the generated tile) and
  // rebuild the setup world deterministically from the config.
  function handlePaintStroke(tiles: readonly { readonly x: number; readonly y: number }[], tool: TerrainPaintKind | "erase") {
    if (!setupPlacementEnabled) {
      return;
    }

    const strokeKeys = new Set(tiles.map((tile) => `${tile.x}:${tile.y}`));
    let nextEdits: readonly TerrainEdit[];

    if (tool === "erase") {
      nextEdits = terrainEdits.filter((edit) => !strokeKeys.has(`${edit.x}:${edit.y}`));
    } else {
      const candidate: readonly TerrainEdit[] = tiles.map((tile) => ({ x: tile.x, y: tile.y, terrain: tool }));
      const validation = world === null ? undefined : validateTerrainEdits(world, candidate);
      const accepted = validation?.accepted ?? candidate;

      setRejectedEditCount((count) => count + (validation?.rejected.length ?? 0));
      const acceptedKeys = new Set(accepted.map((edit) => `${edit.x}:${edit.y}`));
      nextEdits = [
        ...terrainEdits.filter((edit) => !acceptedKeys.has(`${edit.x}:${edit.y}`)),
        ...accepted,
      ];
    }

    setTerrainEdits(nextEdits);
    setPaused(true);
    loadSimWorld(
      withInitialBandPlacements(currentMap.kind, initialBandPlacements, removedBandIds, addedBands, nextEdits),
      runSeedInput,
    );
  }

  function handleResetTerrainEdits() {
    setTerrainEdits([]);
    setRejectedEditCount(0);
    setPaused(true);
    loadSimWorld(
      withInitialBandPlacements(currentMap.kind, initialBandPlacements, removedBandIds, addedBands, []),
      runSeedInput,
    );
  }

  // Export/import the WHOLE setup (map kind, painted tiles, roster, run seed)
  // as JSON — the same file always replays the same history.
  function handleExportSetup() {
    const setup = {
      formatVersion: 1,
      app: "human-nomad-simulator",
      label: currentMap.label,
      mapScaleLabel,
      runSeed: runSeedInput,
      kind: withInitialBandPlacements(currentMap.kind, initialBandPlacements, removedBandIds, addedBands, terrainEdits),
    };
    const blob = new Blob([JSON.stringify(setup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "map-setup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportSetup(file: File) {
    setImportError(null);
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);

        if (typeof parsed !== "object" || parsed === null) {
          throw new Error("not an object");
        }

        const setup = parsed as {
          readonly formatVersion?: number;
          readonly label?: string;
          readonly mapScaleLabel?: string;
          readonly runSeed?: string;
          readonly kind?: SimWorldKind;
        };
        const kind = setup.kind;

        if (
          setup.formatVersion !== 1 ||
          kind === undefined ||
          (kind.kind !== "map1" && kind.kind !== "map2" && kind.kind !== "map2_single_origin" && kind.kind !== "procedural")
        ) {
          throw new Error("unrecognized setup shape");
        }

        const importedEdits = (kind.terrainEdits ?? []).filter(
          (edit) => Number.isFinite(edit.x) && Number.isFinite(edit.y) && typeof edit.terrain === "string",
        );
        const importedSeed = typeof setup.runSeed === "string" ? setup.runSeed : "";
        const baseKind: SimWorldKind =
          kind.kind === "procedural"
            ? { kind: "procedural", seed: kind.seed, ...(kind.size === undefined ? {} : { size: kind.size }) }
            : { kind: kind.kind };

        setRunSeedInput(importedSeed);
        setInitialBandPlacements(kind.initialBandPlacements ?? []);
        setRemovedBandIds(kind.removedInitialBandIds ?? []);
        setAddedBands(kind.addedBands ?? []);
        setTerrainEdits(importedEdits);
        setRejectedEditCount(0);
        setCurrentMap({ kind: baseKind, label: setup.label ?? "Imported map setup" });
        setMapLabel(setup.label ?? "Imported map setup");
        if (typeof setup.mapScaleLabel === "string") {
          setMapScaleLabel(setup.mapScaleLabel);
        }
        setPaused(true);
        loadSimWorld(
          withInitialBandPlacements(
            baseKind,
            kind.initialBandPlacements ?? [],
            kind.removedInitialBandIds ?? [],
            kind.addedBands ?? [],
            importedEdits,
          ),
          importedSeed,
        );
        setMapCamera(getInitialMapCamera());
        clearTileInspection();
      })
      .catch(() => {
        setImportError("That file could not be read as a map setup — export one from this panel to see the format.");
      });
  }

  function handleGenerateWorld() {
    generateFromSeed(seedInput);
  }

  function handleRandomSeed() {
    generateFromSeed(createRandomSeed());
  }

  function handleStep() {
    stepSimOnce(stepMode);
  }

  function handleTogglePaused() {
    setPaused(!paused);
  }

  function handleResetTime() {
    resetSimTimeBridge();
    setPaused(true);
  }

  return (
    <main className="app-shell">
      <header className="sim-bar">
        <section className="time-controls" aria-label="Time controls">
          <button
            type="button"
            className="transport-primary"
            onClick={handleTogglePaused}
            disabled={world === null || (paused && playBlockedByMap)}
            title={
              paused && playBlockedByMap
                ? "Fix the map first — a starting band has no usable ground (see the map editor)."
                : paused
                  ? "Play (Space)"
                  : "Pause (Space)"
            }
          >
            <Icon name={paused ? "play" : "pause"} /> {paused ? "Play" : "Pause"}
          </button>
          <button
            type="button"
            onClick={handleStep}
            disabled={world === null || playBlockedByMap}
            title={
              playBlockedByMap
                ? "Fix the map first — a starting band has no usable ground."
                : `Advance the simulation by ${formatStepAmount(stepMode).toLowerCase()}.`
            }
          >
            <Icon name="step" /> Step {formatStepAmount(stepMode)}
          </button>
          <button type="button" onClick={handleResetTime} disabled={world === null}>
            Reset
          </button>
          <span className="transport-divider" aria-hidden />
          <label
            className={vortexActive ? "speed-control vortex-active" : "speed-control"}
            title={`Playback speed — world calendar days per real second (currently ~${formatNumber(playbackSchedule.effectiveDaysPerSecond)} days/sec).`}
          >
            <Icon name="time" />
            <select
              aria-label="Playback speed"
              value={speedPresetId}
              onChange={(event) => {
                const preset = visibleSpeedPresets.find((item) => item.id === event.target.value);
                setSpeedPresetId(event.target.value);
                if (preset?.forcedStepMode !== undefined) {
                  setStepMode(preset.forcedStepMode);
                }
              }}
            >
              {visibleSpeedPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className="speed-control"
            title={`Resolution — calculation granularity, not speed (${formatStepMode(stepMode)}: ${playbackSchedule.stepsPerInterval} step${playbackSchedule.stepsPerInterval === 1 ? "" : "s"} per batch). Daily computes each day; coarser modes batch the same logic toward the next season.`}
          >
            <Icon name="season" />
            <select
              aria-label="Resolution"
              value={stepMode}
              onChange={(event) => setStepMode(event.target.value as StepMode)}
            >
              {STEP_MODE_PRESETS.map((preset) => (
                <option key={preset.mode} value={preset.mode}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <div className="sim-status">
          <div className="world-cartouche" aria-label="World summary">
            <WorldClock />
            <span className="cartouche-stat">
              <Icon name="people" /> {totals.population}
            </span>
            <span className="cartouche-stat">
              <Icon name="settle" /> {totals.activeBands}/{totals.totalBands}
            </span>
          </div>
          <details className="world-menu">
            <summary className="world-menu-trigger">World &amp; History</summary>
            <div className="world-menu-panel" aria-label="World setup">
              <div className="setup-group">
                <span className="setup-label">World</span>
                <div className="setup-actions">
                  <button type="button" onClick={() => loadRegionalDebugMap()}>
                    Lake &amp; River
                  </button>
                  <button type="button" onClick={() => loadVariedMigrationMap()}>
                    Wide Frontier
                  </button>
                  <button type="button" onClick={() => loadSingleOriginMap()}>
                    Single Origin
                  </button>
                  <button
                    type="button"
                    className={mapEditorOpen ? "setup-primary" : undefined}
                    onClick={() => setMapEditorOpen((value) => !value)}
                    title={
                      setupPlacementEnabled
                        ? "Paint terrain and place starting bands before the run begins"
                        : "The world is fixed once the run starts — reset time or load a map to edit"
                    }
                  >
                    <Icon name="region" /> {mapEditorOpen ? "Close editor" : "Edit map (setup)"}
                  </button>
                </div>
              </div>
              <div className="setup-group" aria-label="Run history">
                <span className="setup-label">History</span>
                <div className="setup-actions">
                  <button type="button" className="setup-primary" onClick={handleNewHistory}>
                    <Icon name="season" /> New History
                  </button>
                  <label className="seed-control inline">
                    <span>Seed</span>
                    <input
                      value={runSeedInput}
                      placeholder="(default history)"
                      onChange={(event) => setRunSeedInput(event.target.value)}
                      aria-label="Run variation seed"
                    />
                  </label>
                  <button type="button" onClick={handleApplyRunSeed}>
                    Apply
                  </button>
                </div>
              </div>
              {setupPlacementEnabled && world !== null ? (
                <div className="setup-group band-manager" aria-label="Starting bands">
                  <span className="setup-label">Bands ({Object.keys(world.bands).length})</span>
                  <div className="setup-actions">
                    <button type="button" onClick={handleAddBandAtSelectedTile} disabled={selectedTileId === null}>
                      + Add band {selectedTileId === null ? "(pick a tile)" : "here"}
                    </button>
                    <button type="button" onClick={handleResetRoster}>Reset bands</button>
                  </div>
                  <ul className="setup-roster">
                    {Object.values(world.bands)
                      .slice()
                      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
                      .map((rosterBand) => {
                        const addedIndex = addedBandIndexForBandId(rosterBand.id);
                        const population = Math.round(rosterBand.demography.population);
                        return (
                          <li key={String(rosterBand.id)} className="setup-roster-row">
                            <span className="setup-roster-dot" style={{ background: rosterBand.color }} aria-hidden />
                            <button
                              type="button"
                              className="setup-roster-name"
                              onClick={() => setSelectedBandId(rosterBand.id)}
                              title={`${rosterBand.name} — ${addedIndex === null ? "default band" : "added band"}; click to inspect`}
                            >
                              {rosterBand.name}
                            </button>
                            {addedIndex === null ? (
                              <span className="setup-roster-pop" title={`${population} people`}>
                                {population}
                              </span>
                            ) : (
                              <input
                                className="setup-roster-pop-input"
                                type="number"
                                min={2}
                                max={60}
                                value={addedBands[addedIndex]?.population ?? population}
                                onChange={(event) => handleSetAddedBandPopulation(addedIndex, Math.max(2, Number(event.target.value)))}
                                aria-label={`${rosterBand.name} population`}
                                title="People at start (2–60)"
                              />
                            )}
                            <button
                              type="button"
                              className="setup-roster-del"
                              onClick={() => handleRemoveStartingBand(rosterBand.id)}
                              title={`Remove ${rosterBand.name} from the start`}
                              aria-label={`Remove ${rosterBand.name} from the start`}
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                  <p className="setup-hint">Setup only — click a land tile then “Add band”. Edits lock once you press Play.</p>
                </div>
              ) : null}
              <dl className="world-facts">
                <div>
                  <dt>Map</dt>
                  <dd>{mapLabel}</dd>
                </div>
                <div>
                  <dt>Scale</dt>
                  <dd>{mapScaleLabel}</dd>
                </div>
                <div>
                  <dt>Seed</dt>
                  <dd>{String(world?.seed ?? REGIONAL_DEBUG_WORLD_SEED)}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>
                    {world?.config.width ?? REGIONAL_DEBUG_WORLD_CONFIG.width}×
                    {world?.config.height ?? REGIONAL_DEBUG_WORLD_CONFIG.height}
                  </dd>
                </div>
                <div>
                  <dt>Absorbed</dt>
                  <dd>{totals.absorbed}</dd>
                </div>
                <div>
                  <dt>Extinct</dt>
                  <dd>{totals.extinct}</dd>
                </div>
              </dl>
              <details className="developer-map-controls">
                <summary>Developer maps</summary>
                <label className="seed-control">
                  <span>Procedural seed</span>
                  <input
                    value={seedInput}
                    onChange={(event) => setSeedInput(event.target.value)}
                    aria-label="Procedural world seed"
                  />
                </label>
                <label className="seed-control">
                  <span>Size (tiles)</span>
                  <input
                    type="number"
                    min={16}
                    max={220}
                    value={proceduralWidth}
                    onChange={(event) => setProceduralWidth(Math.round(Number(event.target.value)))}
                    aria-label="Procedural world width in tiles"
                  />
                  <span aria-hidden>×</span>
                  <input
                    type="number"
                    min={16}
                    max={220}
                    value={proceduralHeight}
                    onChange={(event) => setProceduralHeight(Math.round(Number(event.target.value)))}
                    aria-label="Procedural world height in tiles"
                  />
                </label>
                <div className="debug-actions">
                  <button type="button" onClick={handleGenerateWorld}>
                    Generate
                  </button>
                  <button type="button" onClick={handleRandomSeed}>
                    Random
                  </button>
                </div>
              </details>
            </div>
          </details>
        </div>
      </header>

      <section className="workspace">
        <WorldCanvas
          setupPlacementEnabled={setupPlacementEnabled}
          onPlaceInitialBand={handlePlaceInitialBand}
          mapEditor={{
            active: mapEditorOpen && setupPlacementEnabled,
            tool: editorTool,
            brushRadius: editorBrushRadius,
            onPaintStroke: handlePaintStroke,
          }}
        />
        <div className="side-panels">
          {mapEditorOpen ? (
            <MapEditorPanel
              editingLocked={!setupPlacementEnabled}
              tool={editorTool}
              brushRadius={editorBrushRadius}
              pendingEditCount={terrainEdits.length}
              rejectedEditCount={rejectedEditCount}
              onSelectTool={setEditorTool}
              onSelectBrushRadius={setEditorBrushRadius}
              onResetEdits={handleResetTerrainEdits}
              onClose={() => setMapEditorOpen(false)}
              onExportSetup={handleExportSetup}
              onImportSetup={handleImportSetup}
              importError={importError}
            />
          ) : selectedBandId !== null || selectedTileId === null ? (
            <BandPanel stepMode={stepMode} />
          ) : (
            <TileInspector />
          )}
        </div>
      </section>

      {vortexHintVisible ? (
        <div className="vortex-toast" role="status">
          <Icon name="time" />
          <span>
            <strong>Time Vortex unlocked.</strong> A new speed appeared in the playback menu — the
            years will fly.
          </span>
        </div>
      ) : null}
    </main>
  );
}

function normalizeSeed(seedValue: string): string {
  const trimmed = seedValue.trim();

  return trimmed.length > 0 ? trimmed : String(DEFAULT_WORLD_SEED);
}

function isSetupPlacementAvailable(
  world: WorldState | null,
  liveOverlay: SimLiveOverlay | null,
  paused: boolean,
): boolean {
  if (!paused || world === null) {
    return false;
  }

  if (Number(world.time.tick) !== 0 || world.decisionArchive.totalDecisions !== 0 || Object.keys(world.decisions).length !== 0) {
    return false;
  }

  return liveOverlay === null || Number(liveOverlay.time.tick) === 0;
}

function withInitialBandPlacements(
  kind: SimWorldKind,
  placements: readonly SimInitialBandPlacement[],
  removedBandIds: readonly BandId[] = [],
  addedBands: readonly AddedBandSpec[] = [],
  terrainEdits: readonly TerrainEdit[] = [],
): SimWorldKind {
  // PRE-RUN-BAND-MANAGER-1 / PRE-RUN-MAP-MAKER-1 — fold all setup edits into
  // the SimWorldKind so the run is reproducible from the config alone (sorted
  // for determinism).
  const sortedPlacements = [...placements].sort((left, right) => String(left.bandId).localeCompare(String(right.bandId)));
  const sortedRemoved = [...removedBandIds].sort((left, right) => String(left).localeCompare(String(right)));
  const sortedTerrainEdits = [...terrainEdits].sort((left, right) =>
    left.y === right.y ? left.x - right.x : left.y - right.y,
  );
  const edits = {
    ...(sortedPlacements.length === 0 ? {} : { initialBandPlacements: sortedPlacements }),
    ...(sortedRemoved.length === 0 ? {} : { removedInitialBandIds: sortedRemoved }),
    ...(addedBands.length === 0 ? {} : { addedBands }),
    ...(sortedTerrainEdits.length === 0 ? {} : { terrainEdits: sortedTerrainEdits }),
  };

  return kind.kind === "procedural"
    ? { kind: "procedural", seed: kind.seed, ...(kind.size === undefined ? {} : { size: kind.size }), ...edits }
    : { kind: kind.kind, ...edits };
}

// PRE-RUN-BAND-MANAGER-1 — added custom bands have ids `band:custom:<index>`.
function addedBandIndexForBandId(bandId: BandId): number | null {
  const match = /^band:custom:(\d+)$/.exec(String(bandId));
  return match === null ? null : Number(match[1]);
}

function upsertInitialBandPlacement(
  placements: readonly SimInitialBandPlacement[],
  nextPlacement: SimInitialBandPlacement,
): readonly SimInitialBandPlacement[] {
  const byBandId = new Map<BandId, SimInitialBandPlacement>();

  for (const placement of placements) {
    byBandId.set(placement.bandId, placement);
  }

  byBandId.set(nextPlacement.bandId, nextPlacement);

  return Array.from(byBandId.values()).sort((left, right) => String(left.bandId).localeCompare(String(right.bandId)));
}

function formatStepMode(mode: StepMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function formatStepAmount(mode: StepMode): string {
  switch (mode) {
    case "daily":
      return "1 Day";
    case "weekly":
      return "1 Week";
    case "monthly":
      return "1 Month";
    case "seasonal":
      return "1 Season";
  }
}

function createRandomSeed(): string {
  const timestampPart = Date.now().toString(36);
  const randomValues = new Uint32Array(2);
  globalThis.crypto.getRandomValues(randomValues);
  const randomPart = Array.from(randomValues)
    .map((value) => value.toString(36))
    .join("")
    .slice(0, 10);

  return `seed-${timestampPart}-${randomPart}`;
}

function getPlaybackSchedule(
  targetDaysPerSecond: number,
  stepMode: StepMode,
  maxStepsPerInterval?: number,
): {
  readonly intervalMs: number;
  readonly stepsPerInterval: number;
  readonly effectiveDaysPerSecond: number;
  readonly fullSnapshotIntervalMs: number;
} {
  const daysPerStep = STEP_MODE_DAYS[stepMode];
  const directIntervalMs = (daysPerStep / targetDaysPerSecond) * 1000;

  if (directIntervalMs >= 80) {
    const intervalMs = Math.round(directIntervalMs);

    return {
      intervalMs,
      stepsPerInterval: 1,
      effectiveDaysPerSecond: targetDaysPerSecond,
      fullSnapshotIntervalMs: getFullSnapshotIntervalMs(targetDaysPerSecond, intervalMs, 1),
    };
  }

  const intervalMs = 250;
  const requestedSteps = Math.max(1, Math.round((targetDaysPerSecond * intervalMs) / 1000 / daysPerStep));
  // The step cap keeps a single synchronous worker batch bounded — the safety
  // valve behind the hidden Time Vortex speed.
  const stepsPerInterval =
    maxStepsPerInterval === undefined ? requestedSteps : Math.min(requestedSteps, Math.max(1, maxStepsPerInterval));

  return {
    intervalMs,
    stepsPerInterval,
    effectiveDaysPerSecond: (stepsPerInterval * daysPerStep * 1000) / intervalMs,
    fullSnapshotIntervalMs: getFullSnapshotIntervalMs(targetDaysPerSecond, intervalMs, stepsPerInterval),
  };
}

function getFullSnapshotIntervalMs(
  targetDaysPerSecond: number,
  intervalMs: number,
  stepsPerInterval: number,
): number {
  const workerBatchesPerSecond = stepsPerInterval * (1000 / Math.max(1, intervalMs));

  if (targetDaysPerSecond >= 1000 || workerBatchesPerSecond >= 36) {
    return 12000;
  }

  if (targetDaysPerSecond >= 300 || workerBatchesPerSecond >= 10) {
    return 8000;
  }

  if (targetDaysPerSecond >= 90 || workerBatchesPerSecond >= 3) {
    return 5000;
  }

  return 2500;
}

function readVortexUnlocked(): boolean {
  try {
    return globalThis.localStorage?.getItem(VORTEX_UNLOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeVortexUnlocked(): void {
  try {
    globalThis.localStorage?.setItem(VORTEX_UNLOCK_STORAGE_KEY, "1");
  } catch {
    // Storage may be unavailable (private mode / blocked) — the unlock simply
    // won't persist across reloads, which is acceptable for an easter egg.
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
