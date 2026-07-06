import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSimulationStore } from "../store";
import { getTile } from "../sim/world/generate";
import type { Band } from "../sim/agents/types";
import type { StepMode, TickNumber } from "../sim/core/types";
import type { SimSelectedBandPanelProjection } from "../sim/runner/simRunner";
import type { Decision } from "../sim/rules/types";
import type { Tile, WorldState } from "../sim/world/types";

import { Roster } from "./band/Roster";
import { Overview } from "./band/Overview";
import { Doing } from "./band/Doing";
import { Survival } from "./band/Survival";
import { Food } from "./band/Food";
import { Nature } from "./band/Nature";
import { Place } from "./band/Place";
import { CampFootholds } from "./band/CampFootholds";
import { People } from "./band/People";
import { Affordances } from "./band/Affordances";
import { ProblemsAndTrials } from "./band/ProblemsAndTrials";
import { PracticeFeedback } from "./band/PracticeFeedback";
import { Identity } from "./band/Identity";
import { Events } from "./band/Events";
import { Knowledge } from "./band/Knowledge";
import { History } from "./band/History";
import { Technical } from "./band/Technical";
import { BandMarkdownExport } from "./band/BandMarkdownExport";

type BandDetailView =
  | "overview"
  | "doing"
  | "survival"
  | "food"
  | "nature"
  | "place"
  | "camp"
  | "people"
  | "affordances"
  | "problems"
  | "feedback"
  | "knowledge"
  | "identity"
  | "events"
  | "story"
  | "technical";

// READABILITY-UI-ORGANIZATION-1 — one tab per player question:
// condition · activity · physical survival · food · living world · places ·
// relationships · timeline · raw proof. Technical stays the only raw surface.
const BAND_DETAIL_VIEWS: readonly {
  readonly id: BandDetailView;
  readonly label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "doing", label: "Doing" },
  { id: "survival", label: "Survival" },
  { id: "food", label: "Food" },
  { id: "nature", label: "Nature" },
  { id: "place", label: "Place" },
  { id: "camp", label: "Camp & Footholds" },
  { id: "people", label: "People" },
  { id: "affordances", label: "Affordances" },
  { id: "problems", label: "Problems & Trials" },
  { id: "feedback", label: "Practice Feedback" },
  { id: "knowledge", label: "Knowledge" },
  { id: "identity", label: "Identity" },
  { id: "events", label: "Events" },
  { id: "story", label: "Chronicle" },
  { id: "technical", label: "Technical" },
];

/**
 * Public band panel: roster + selected-band detail shell. Detail content is
 * split across `src/ui/band/*`; this file owns selection wiring and tab state
 * only. Only the ACTIVE tab is mounted (performance invariant).
 */
export function BandPanel({ stepMode }: { readonly stepMode: StepMode }) {
  const world = useSimulationStore((state) => state.world);
  const selectedBandId = useSimulationStore((state) => state.selectedBandId);
  const setSelectedBandId = useSimulationStore((state) => state.setSelectedBandId);
  const setSelectedActivityTripId = useSimulationStore((state) => state.setSelectedActivityTripId);
  const setSelectedTileId = useSimulationStore((state) => state.setSelectedTileId);
  const selectedProjection = useSimulationStore((state) => state.selectedBandPanelProjection);
  const bands = world === null ? [] : Object.values(world.bands);
  const selectedBand =
    selectedBandId === null || world === null ? undefined : world.bands[selectedBandId];
  const liveProjection =
    selectedBandId !== null &&
    selectedProjection !== null &&
    selectedProjection.selectedBandId === String(selectedBandId) &&
    (world === null || Number(selectedProjection.time.tick) >= Number(world.time.tick))
      ? selectedProjection
      : null;

  const selectBand = useCallback((band: Band) => {
    setSelectedBandId(band.id);
    setSelectedActivityTripId(null);
    setSelectedTileId(null);
  }, [setSelectedActivityTripId, setSelectedBandId, setSelectedTileId]);

  const currentTick = world?.time.tick ?? (0 as TickNumber);

  return (
    <aside className="band-panel" aria-label="Initial band details">
      <h2>Bands</h2>
      <Roster
        bands={bands}
        selectedBandId={selectedBandId}
        currentTick={currentTick}
        liveSelectedBand={liveProjection?.band}
        liveSelectedTick={liveProjection?.time.tick}
        stepMode={stepMode}
        onSelect={selectBand}
      />

      {selectedBandId === null ? (
        <p className="empty-panel">Click a band marker or roster item to inspect it.</p>
      ) : (
        <LiveBandDetails
          snapshotBand={selectedBand}
          snapshotWorld={world}
          liveProjection={liveProjection}
          stepMode={stepMode}
        />
      )}
    </aside>
  );
}

function LiveBandDetails({
  snapshotBand,
  snapshotWorld,
  liveProjection,
  stepMode,
}: {
  readonly snapshotBand: Band | undefined;
  readonly snapshotWorld: WorldState | null;
  readonly liveProjection: SimSelectedBandPanelProjection | null;
  readonly stepMode: StepMode;
}) {
  const selectedActivityTripId = useSimulationStore((state) => state.selectedActivityTripId);
  const band = liveProjection?.band ?? snapshotBand;
  const world = useMemo(
    () =>
      snapshotWorld === null
        ? null
        : liveProjection === null
          ? snapshotWorld
          : { ...snapshotWorld, time: liveProjection.time },
    [liveProjection, snapshotWorld],
  );
  if (band === undefined) {
    return <p className="empty-panel">Waiting for selected band detail...</p>;
  }
  const currentTile =
    snapshotWorld === null
      ? undefined
      : getTile(snapshotWorld, band.position);
  const latestDecisionId =
    band.decisionHistory.length === 0
      ? undefined
      : band.decisionHistory[band.decisionHistory.length - 1];
  const latestDecision =
    liveProjection?.latestDecision ??
    (latestDecisionId === undefined || snapshotWorld === null
      ? undefined
      : snapshotWorld.decisions[latestDecisionId]);

  return (
    <BandDetails
      band={band}
      world={world}
      currentTile={currentTile}
      latestDecision={latestDecision}
      selectedActivityTripId={selectedActivityTripId}
      stepMode={stepMode}
    />
  );
}

function BandDetails({
  band,
  world,
  currentTile,
  latestDecision,
  selectedActivityTripId,
  stepMode,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly currentTile: Tile | undefined;
  readonly latestDecision: Decision | undefined;
  readonly selectedActivityTripId: string | null;
  readonly stepMode: StepMode;
}) {
  const [detailView, setDetailView] = useState<BandDetailView>("overview");
  // WHOLE-UI-READABILITY-HISTORY-FUN-1 — cross-tab wiki links: any tab can ask
  // for a specific Chronicle page (a referent, place, route…); History consumes
  // the request once mounted.
  const [chroniclePageRequest, setChroniclePageRequest] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const firstTabRender = useRef(true);
  const seasonRaw = world?.time.season ?? "";
  const season = seasonRaw === "" ? "—" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
  const currentTick = world?.time.tick ?? (0 as TickNumber);
  const openChroniclePage = useCallback((pageId: string) => {
    setChroniclePageRequest(pageId);
    setDetailView("story");
  }, []);

  // When the selected band changes (clicking a band name in inter-band talk, or
  // a roster entry), land at the top of that band's Overview rather than
  // wherever the previous band's panel was tabbed or scrolled to. Declared
  // before the activity-trip effect so a trip click still wins to Doing.
  useEffect(() => {
    setDetailView("overview");
    setChroniclePageRequest(null);
    tabsRef.current?.scrollIntoView({ block: "start" });
  }, [band.id]);

  useEffect(() => {
    if (selectedActivityTripId !== null) {
      setDetailView("doing");
    }
  }, [selectedActivityTripId]);

  // QoL: switching tabs after scrolling deep into a long one (e.g. Technical)
  // returns you to the top of the newly shown tab instead of stranding you
  // mid-content. Skips the initial mount so opening a band doesn't jump.
  useEffect(() => {
    if (firstTabRender.current) {
      firstTabRender.current = false;
      return;
    }
    tabsRef.current?.scrollIntoView({ block: "start" });
  }, [detailView]);

  return (
    <>
      <div ref={tabsRef} className="view-tabs band-detail-tabs" aria-label="Band detail view">
        {BAND_DETAIL_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={detailView === view.id}
            className={detailView === view.id ? "active" : undefined}
            onClick={() => setDetailView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="band-details">
        {detailView === "overview" ? (
          <>
            <Overview
              band={band}
              world={world}
              currentTile={currentTile}
              season={season}
              currentTick={currentTick}
              stepMode={stepMode}
              onNavigateTab={setDetailView}
              onOpenChronicle={openChroniclePage}
            />
            <BandMarkdownExport
              band={band}
              world={world}
              currentTile={currentTile}
              latestDecision={latestDecision}
              selectedActivityTripId={selectedActivityTripId}
              season={season}
              currentTick={currentTick}
              stepMode={stepMode}
            />
          </>
        ) : null}
        {detailView === "doing" ? (
          <Doing
            band={band}
            world={world}
            selectedActivityTripId={selectedActivityTripId}
            stepMode={stepMode}
            currentTick={currentTick}
            onOpenChronicle={openChroniclePage}
          />
        ) : null}
        {detailView === "survival" ? <Survival band={band} world={world} onOpenChronicle={openChroniclePage} /> : null}
        {detailView === "food" ? <Food band={band} world={world} onOpenChronicle={openChroniclePage} /> : null}
        {detailView === "nature" ? <Nature band={band} world={world} onOpenChronicle={openChroniclePage} /> : null}
        {detailView === "place" ? (
          <Place band={band} world={world} currentTick={currentTick} onOpenChronicle={openChroniclePage} />
        ) : null}
        {detailView === "camp" ? <CampFootholds band={band} world={world} /> : null}
        {detailView === "people" ? <People band={band} world={world} onOpenChronicle={openChroniclePage} /> : null}
        {detailView === "affordances" ? <Affordances band={band} world={world} /> : null}
        {detailView === "problems" ? <ProblemsAndTrials band={band} world={world} /> : null}
        {detailView === "feedback" ? <PracticeFeedback band={band} world={world} /> : null}
        {detailView === "knowledge" ? (
          <Knowledge
            band={band}
            world={world}
            onOpenChronicle={openChroniclePage}
            onOpenEvents={() => setDetailView("events")}
          />
        ) : null}
        {detailView === "identity" ? (
          <Identity
            band={band}
            world={world}
            onOpenChronicle={openChroniclePage}
            onOpenEvents={() => setDetailView("events")}
          />
        ) : null}
        {detailView === "events" ? <Events band={band} world={world} onOpenChronicle={openChroniclePage} /> : null}
        {detailView === "story" ? (
          <History
            band={band}
            world={world}
            latestDecision={latestDecision}
            requestedPageId={chroniclePageRequest}
            onRequestedPageHandled={() => setChroniclePageRequest(null)}
          />
        ) : null}
        {detailView === "technical" ? (
          <Technical
            band={band}
            world={world}
            currentTile={currentTile}
            latestDecision={latestDecision}
          />
        ) : null}
      </div>
    </>
  );
}
