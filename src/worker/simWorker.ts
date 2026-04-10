// PERF-1 — the simulation Web Worker. Owns the authoritative sim world and
// advances it off the browser main thread, so season ticks (which grow with
// band count) never block rendering or input. Posts only the DYNAMIC part of
// the world (bands/time/decisions/depletion — the static tiles are a
// deterministic twin the main thread builds itself), throttled so heavy tick
// rates don't flood the UI with structured clones.
//
// All simulation work happens through src/sim/runner/simRunner.ts — the same
// pure functions the node-side equivalence proof exercises, so the worker
// path is provably identical to direct stepping.

import {
  initSimWorld,
  resetSimTime,
  stepSim,
  takeDynamicSnapshot,
  takeLiveOverlay,
  takeSelectedBandPanelProjection,
} from "../sim/runner/simRunner";
import type { SimWorldKind } from "../sim/runner/simRunner";
import type { StepMode } from "../sim/core/types";
import type { WorldState } from "../sim/world/types";

export type SimWorkerRequest =
  | { readonly type: "init"; readonly world: SimWorldKind; readonly runSeed?: string }
  | {
      readonly type: "run";
      readonly intervalMs: number;
      readonly stepMode: StepMode;
      readonly stepsPerInterval?: number;
      readonly fullSnapshotIntervalMs?: number;
    }
  | { readonly type: "pause" }
  | { readonly type: "step"; readonly stepMode: StepMode }
  | { readonly type: "reset_time" }
  | { readonly type: "select_band"; readonly bandId: string | null };

// Two-tier updates: a ~KB live overlay (markers/clock/counts) flows every
// tick; FULL snapshots (which reach ~18MB / ~280ms-per-side structuredClone by
// late centuries) flow rarely while running, and always on pause/step/init so
// the inspection panels are exact whenever the user is actually looking.
const DEFAULT_FULL_SNAPSHOT_MIN_INTERVAL_MS = 2500;
const MIN_FULL_SNAPSHOT_INTERVAL_MS = 1000;
const MAX_FULL_SNAPSHOT_INTERVAL_MS = 30000;
const SELECTED_BAND_PANEL_MIN_INTERVAL_MS = 250;

let world: WorldState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSnapshotAt = 0;
let fullSnapshotMinIntervalMs = DEFAULT_FULL_SNAPSHOT_MIN_INTERVAL_MS;
let selectedBandId: string | null = null;
let lastSelectedBandPanelAt = 0;

function normalizeFullSnapshotIntervalMs(intervalMs: number | undefined): number {
  if (intervalMs === undefined || !Number.isFinite(intervalMs)) {
    return DEFAULT_FULL_SNAPSHOT_MIN_INTERVAL_MS;
  }

  return Math.max(
    MIN_FULL_SNAPSHOT_INTERVAL_MS,
    Math.min(MAX_FULL_SNAPSHOT_INTERVAL_MS, Math.floor(intervalMs)),
  );
}

function postSnapshot(force: boolean): void {
  if (world === null) {
    return;
  }

  postMessage({ type: "overlay", overlay: takeLiveOverlay(world) });
  postSelectedBandPanelProjection(force);

  const now = Date.now();

  if (!force && now - lastSnapshotAt < fullSnapshotMinIntervalMs) {
    return;
  }

  lastSnapshotAt = now;
  postMessage({ type: "snapshot", snapshot: takeDynamicSnapshot(world) });
}

function postSelectedBandPanelProjection(force: boolean): void {
  if (world === null) {
    return;
  }

  const now = Date.now();

  if (!force && now - lastSelectedBandPanelAt < SELECTED_BAND_PANEL_MIN_INTERVAL_MS) {
    return;
  }

  lastSelectedBandPanelAt = now;
  postMessage({
    type: "selectedBandPanel",
    projection: takeSelectedBandPanelProjection(world, selectedBandId),
  });
}

function stopLoop(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case "init": {
      stopLoop();
      world = initSimWorld(message.world, message.runSeed);
      postSnapshot(true);
      break;
    }
    case "run": {
      stopLoop();
      const stepsPerInterval = Math.max(1, Math.floor(message.stepsPerInterval ?? 1));
      fullSnapshotMinIntervalMs = normalizeFullSnapshotIntervalMs(message.fullSnapshotIntervalMs);
      timer = setInterval(() => {
        if (world === null) {
          return;
        }

        world = stepSim(world, stepsPerInterval, message.stepMode);
        postSnapshot(false);
      }, message.intervalMs);
      break;
    }
    case "pause": {
      stopLoop();
      postSnapshot(true);
      break;
    }
    case "step": {
      if (world !== null) {
        world = stepSim(world, 1, message.stepMode);
        postSnapshot(true);
      }
      break;
    }
    case "reset_time": {
      if (world !== null) {
        world = resetSimTime(world);
        postSnapshot(true);
      }
      break;
    }
    case "select_band": {
      selectedBandId = message.bandId;
      postSelectedBandPanelProjection(true);
      break;
    }
  }
};
