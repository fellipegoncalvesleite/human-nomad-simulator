import { useMemo, useRef } from "react";
import type { ChangeEvent } from "react";

import { useSimulationStore } from "../store";
import { validateWorldSetup } from "../sim/runner/simRunner";
import type { TerrainEdit, TerrainPaintKind } from "../sim/runner/simRunner";
import { TERRAIN_PAINT_KINDS } from "../sim/runner/simRunner";
import type { MapEditorTool } from "./WorldCanvas";
import { Icon } from "./icons";

/*
 * PRE-RUN-MAP-MAKER-1 — setup-only map editor panel. Shown in place of the
 * band panel while editing; every control here feeds the run CONFIG (terrain
 * edits, roster, seed), never a live world. Locked once the run starts.
 */

const TERRAIN_LABELS: Readonly<Record<TerrainPaintKind, string>> = {
  plains: "Plains",
  forest: "Forest",
  hills: "Hills",
  mountains: "Mountains",
  wetlands: "Wetlands",
  desert: "Desert",
  tundra: "Tundra",
  lake: "Water (lake)",
};

const TERRAIN_SWATCHES: Readonly<Record<TerrainPaintKind, string>> = {
  plains: "#a47a43",
  forest: "#3a7a4b",
  hills: "#7d5d34",
  mountains: "#8c8478",
  wetlands: "#58806a",
  desert: "#c49e5e",
  tundra: "#9e9e92",
  lake: "#406a92",
};

const BRUSH_SIZES: readonly { readonly radius: number; readonly label: string }[] = [
  { radius: 0, label: "1 tile" },
  { radius: 1, label: "Small" },
  { radius: 2, label: "Wide" },
];

export interface MapEditorPanelProps {
  readonly editingLocked: boolean;
  readonly tool: MapEditorTool;
  readonly brushRadius: number;
  readonly pendingEditCount: number;
  readonly rejectedEditCount: number;
  readonly onSelectTool: (tool: MapEditorTool) => void;
  readonly onSelectBrushRadius: (radius: number) => void;
  readonly onResetEdits: () => void;
  readonly onClose: () => void;
  readonly onExportSetup: () => void;
  readonly onImportSetup: (file: File) => void;
  readonly importError: string | null;
}

export function MapEditorPanel({
  editingLocked,
  tool,
  brushRadius,
  pendingEditCount,
  rejectedEditCount,
  onSelectTool,
  onSelectBrushRadius,
  onResetEdits,
  onClose,
  onExportSetup,
  onImportSetup,
  importError,
}: MapEditorPanelProps) {
  const world = useSimulationStore((state) => state.world);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Setup validation on the BUILT world (edits + roster already applied by the
  // deterministic rebuild). Bands are few, so this is cheap per snapshot.
  const issues = useMemo(() => (world === null ? [] : validateWorldSetup(world)), [world]);

  function handleImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (file !== undefined) {
      onImportSetup(file);
    }

    event.currentTarget.value = "";
  }

  return (
    <aside className="band-panel map-editor-panel" aria-label="Map editor">
      <div className="map-editor-head">
        <h2>Map editor</h2>
        <button type="button" className="map-editor-close" onClick={onClose}>
          Done
        </button>
      </div>

      {editingLocked ? (
        <div className="map-editor-locked" role="status">
          <Icon name="risk" />
          <p>
            <strong>The world is fixed.</strong> Editing is available before the simulation starts — reset time or load
            a map to edit again.
          </p>
        </div>
      ) : (
        <>
          <p className="map-editor-hint">
            Paint terrain on the map, drag band markers to move their start, and press Play when the land feels right.
            Editing locks once the run begins.
          </p>

          <section className="map-editor-group" aria-label="Terrain brushes">
            <span className="map-editor-label">Terrain</span>
            <div className="map-editor-tools">
              {TERRAIN_PAINT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={tool === kind ? "map-editor-tool active" : "map-editor-tool"}
                  aria-pressed={tool === kind}
                  onClick={() => onSelectTool(kind)}
                >
                  <span className="map-editor-swatch" style={{ background: TERRAIN_SWATCHES[kind] }} aria-hidden />
                  <span>{TERRAIN_LABELS[kind]}</span>
                </button>
              ))}
              <button
                type="button"
                className={tool === "erase" ? "map-editor-tool active" : "map-editor-tool"}
                aria-pressed={tool === "erase"}
                onClick={() => onSelectTool("erase")}
                title="Restore painted tiles to the generated map"
              >
                <span className="map-editor-swatch erase" aria-hidden />
                <span>Erase / restore</span>
              </button>
              <button
                type="button"
                className={tool === "move_bands" ? "map-editor-tool active" : "map-editor-tool"}
                aria-pressed={tool === "move_bands"}
                onClick={() => onSelectTool("move_bands")}
                title="Drag band markers to move their starting tile"
              >
                <Icon name="move" />
                <span>Move bands</span>
              </button>
            </div>
          </section>

          <section className="map-editor-group" aria-label="Brush size">
            <span className="map-editor-label">Brush</span>
            <div className="map-editor-tools">
              {BRUSH_SIZES.map((brush) => (
                <button
                  key={brush.radius}
                  type="button"
                  className={brushRadius === brush.radius ? "map-editor-tool active" : "map-editor-tool"}
                  aria-pressed={brushRadius === brush.radius}
                  onClick={() => onSelectBrushRadius(brush.radius)}
                >
                  {brush.label}
                </button>
              ))}
            </div>
          </section>

          <section className="map-editor-group" aria-label="Edit status">
            <span className="map-editor-label">Edits</span>
            <p className="map-editor-status">
              {pendingEditCount === 0
                ? "No painted tiles yet — the generated map is untouched."
                : `${pendingEditCount} painted tile${pendingEditCount === 1 ? "" : "s"} on top of the generated map.`}
              {rejectedEditCount > 0
                ? ` ${rejectedEditCount} stroke tile${rejectedEditCount === 1 ? " was" : "s were"} skipped — rivers stay as authored.`
                : ""}
            </p>
            <div className="map-editor-actions">
              <button type="button" onClick={onResetEdits} disabled={pendingEditCount === 0}>
                Reset painted tiles
              </button>
            </div>
          </section>

          <section className="map-editor-group" aria-label="Map validation">
            <span className="map-editor-label">Validation</span>
            {issues.length === 0 ? (
              <p className="map-editor-status ok">
                <Icon name="status" /> Ready — every band starts on usable land.
              </p>
            ) : (
              <ul className="map-editor-issues">
                {issues.map((issue) => (
                  <li key={`${issue.kind}-${issue.bandId ?? "map"}`}>{issue.message}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="map-editor-group" aria-label="Save and load">
            <span className="map-editor-label">Setup file</span>
            <div className="map-editor-actions">
              <button type="button" onClick={onExportSetup}>
                <Icon name="download" /> Export setup
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                <Icon name="file" /> Import setup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportChange}
                hidden
              />
            </div>
            {importError === null ? (
              <p className="map-editor-status">
                A setup file holds the map, painted tiles, starting bands, and seed — the same setup always replays the
                same history.
              </p>
            ) : (
              <p className="map-editor-status error">{importError}</p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}

export type { TerrainEdit };
