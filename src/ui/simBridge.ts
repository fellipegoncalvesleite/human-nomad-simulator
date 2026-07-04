// PERF-1 — main-thread side of the sim worker. The worker owns the
// authoritative world and advances it off-thread; this bridge keeps a
// deterministic STATIC twin (tiles/rivers/regions — identical by construction,
// generated locally so the first frame is instant and the tiles reference
// stays stable for every render cache) and merges the worker's dynamic
// snapshots (bands/time/decisions/depletion) into the Zustand store.
//
// If Workers are unavailable, it falls back to stepping on the main thread —
// identical behaviour (same simRunner functions), just without the
// responsiveness win.

import {
  initSimWorld,
  mergeDynamicSnapshot,
  resetSimTime,
  stepSim,
  summarizeWorldEcology,
  takeLiveOverlay,
  takeSelectedBandPanelProjection,
} from "../sim/runner/simRunner";
import type {
  SimDynamicSnapshot,
  SimLiveOverlay,
  SimSelectedBandPanelProjection,
  SimWorldKind,
  WorldEcologySummary,
} from "../sim/runner/simRunner";
import type { StepMode } from "../sim/core/types";
import type { WorldState } from "../sim/world/types";
import { useSimulationStore } from "../store";
import type { SimWorkerRequest } from "../worker/simWorker";

type SimWorkerMessage =
  | { readonly type: "snapshot"; readonly snapshot: SimDynamicSnapshot }
  | { readonly type: "overlay"; readonly overlay: SimLiveOverlay }
  | { readonly type: "selectedBandPanel"; readonly projection: SimSelectedBandPanelProjection | null };

let worker: Worker | null = null;
let workerFailed = false;
let staticWorld: WorldState | null = null;
let fallbackWorld: WorldState | null = null;
let fallbackTimer: number | null = null;
let lastFallbackSnapshotAt = 0;
let lastFallbackSelectedBandPanelAt = 0;
let selectedBandSubscriptionStarted = false;
let lastSelectedBandMessage: string | null | undefined = undefined;

const DEFAULT_FULL_SNAPSHOT_INTERVAL_MS = 2500;
const MIN_FULL_SNAPSHOT_INTERVAL_MS = 1000;
const MAX_FULL_SNAPSHOT_INTERVAL_MS = 30000;
const SELECTED_BAND_PANEL_MIN_INTERVAL_MS = 250;

function normalizeFullSnapshotIntervalMs(intervalMs: number | undefined): number {
  if (intervalMs === undefined || !Number.isFinite(intervalMs)) {
    return DEFAULT_FULL_SNAPSHOT_INTERVAL_MS;
  }

  return Math.max(
    MIN_FULL_SNAPSHOT_INTERVAL_MS,
    Math.min(MAX_FULL_SNAPSHOT_INTERVAL_MS, Math.floor(intervalMs)),
  );
}

// SIM-TOOLS-1 — the world-truth ecology summary for the DEBUG ecology view rides
// alongside the world. Snapshot path passes the worker-computed summary (the merged
// UI world lacks fauna/plant dynamic truth); local/fallback paths have the true
// world and compute it directly.
function publishWorld(world: WorldState, ecologySummary?: WorldEcologySummary): void {
  const store = useSimulationStore.getState();
  store.setWorld(world);
  store.setEcologySummary(ecologySummary ?? summarizeWorldEcology(world));
}

function publishSelectedBandPanelProjection(world: WorldState, force: boolean): void {
  const now = Date.now();

  if (!force && now - lastFallbackSelectedBandPanelAt < SELECTED_BAND_PANEL_MIN_INTERVAL_MS) {
    return;
  }

  lastFallbackSelectedBandPanelAt = now;
  const selectedBandId = useSimulationStore.getState().selectedBandId;
  useSimulationStore
    .getState()
    .setSelectedBandPanelProjection(
      takeSelectedBandPanelProjection(world, selectedBandId === null ? null : String(selectedBandId)),
    );
}

function sendSelectedBandSelection(force = false): void {
  if (worker === null) {
    return;
  }

  const selectedBandId = useSimulationStore.getState().selectedBandId;
  const next = selectedBandId === null ? null : String(selectedBandId);

  if (!force && next === lastSelectedBandMessage) {
    return;
  }

  lastSelectedBandMessage = next;
  worker.postMessage({ type: "select_band", bandId: next } satisfies SimWorkerRequest);
}

function ensureSelectedBandSubscription(): void {
  if (selectedBandSubscriptionStarted) {
    return;
  }

  selectedBandSubscriptionStarted = true;
  useSimulationStore.subscribe((state) => {
    const next = state.selectedBandId === null ? null : String(state.selectedBandId);

    if (next !== lastSelectedBandMessage) {
      sendSelectedBandSelection();
    }
  });
}

function ensureWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") {
    return null;
  }

  if (worker === null) {
    try {
      worker = new Worker(new URL("../worker/simWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<SimWorkerMessage>) => {
        if (event.data.type === "overlay") {
          useSimulationStore.getState().setLiveOverlay(event.data.overlay);
        } else if (event.data.type === "selectedBandPanel") {
          useSimulationStore.getState().setSelectedBandPanelProjection(event.data.projection);
        } else if (event.data.type === "snapshot" && staticWorld !== null) {
          publishWorld(mergeDynamicSnapshot(staticWorld, event.data.snapshot), event.data.snapshot.ecologySummary);
        }
      };
      worker.onerror = () => {
        workerFailed = true;
        worker?.terminate();
        worker = null;
      };
      ensureSelectedBandSubscription();
      sendSelectedBandSelection(true);
    } catch {
      workerFailed = true;
      worker = null;
    }
  }

  return worker;
}

function send(message: SimWorkerRequest): boolean {
  const target = ensureWorker();

  if (target === null) {
    return false;
  }

  target.postMessage(message);

  return true;
}

function stopFallbackLoop(): void {
  if (fallbackTimer !== null) {
    window.clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}

export function loadSimWorld(kind: SimWorldKind, runSeed?: string): void {
  stopFallbackLoop();
  lastFallbackSelectedBandPanelAt = 0;
  // The local build doubles as the static twin AND the instant first frame —
  // deterministic generation makes it identical to the worker's copy. VAR-1:
  // the run seed is applied here AND in the worker so both stay in lockstep.
  const world = initSimWorld(kind, runSeed);
  staticWorld = world;
  fallbackWorld = world;
  useSimulationStore.getState().setLiveOverlay(null);
  useSimulationStore.getState().setSelectedBandPanelProjection(null);
  publishWorld(world);
  publishSelectedBandPanelProjection(world, true);
  send({ type: "init", world: kind, runSeed });
}

export function runSim(
  intervalMs: number,
  stepMode: StepMode,
  stepsPerInterval = 1,
  fullSnapshotIntervalMs?: number,
): void {
  stopFallbackLoop();
  const batchedSteps = Math.max(1, Math.floor(stepsPerInterval));
  const normalizedFullSnapshotIntervalMs = normalizeFullSnapshotIntervalMs(fullSnapshotIntervalMs);

  if (
    send({
      type: "run",
      intervalMs,
      stepMode,
      stepsPerInterval: batchedSteps,
      fullSnapshotIntervalMs: normalizedFullSnapshotIntervalMs,
    })
  ) {
    return;
  }

  // Fallback: main-thread stepping (previous behaviour).
  lastFallbackSnapshotAt = 0;
  fallbackTimer = window.setInterval(() => {
    if (fallbackWorld === null) {
      return;
    }

    fallbackWorld = stepSim(fallbackWorld, batchedSteps, stepMode);
    useSimulationStore.getState().setLiveOverlay(takeLiveOverlay(fallbackWorld));
    publishSelectedBandPanelProjection(fallbackWorld, false);
    const now = Date.now();

    if (now - lastFallbackSnapshotAt >= normalizedFullSnapshotIntervalMs) {
      lastFallbackSnapshotAt = now;
      publishWorld(fallbackWorld);
    }
  }, intervalMs);
}

export function pauseSim(): void {
  stopFallbackLoop();
  if (!send({ type: "pause" }) && fallbackWorld !== null) {
    publishWorld(fallbackWorld);
    useSimulationStore.getState().setLiveOverlay(takeLiveOverlay(fallbackWorld));
    publishSelectedBandPanelProjection(fallbackWorld, true);
  }
}

export function stepSimOnce(stepMode: StepMode): void {
  if (send({ type: "step", stepMode })) {
    return;
  }

  if (fallbackWorld !== null) {
    fallbackWorld = stepSim(fallbackWorld, 1, stepMode);
    publishWorld(fallbackWorld);
    publishSelectedBandPanelProjection(fallbackWorld, true);
  }
}

export function resetSimTimeBridge(): void {
  if (send({ type: "reset_time" })) {
    return;
  }

  if (fallbackWorld !== null) {
    fallbackWorld = resetSimTime(fallbackWorld);
    publishWorld(fallbackWorld);
    publishSelectedBandPanelProjection(fallbackWorld, true);
  }
}
