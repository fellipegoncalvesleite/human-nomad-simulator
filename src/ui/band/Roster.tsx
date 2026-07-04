import { memo } from "react";

import type { Band } from "../../sim/agents/types";
import type { BandId, StepMode, TickNumber } from "../../sim/core/types";
import { Icon } from "../icons";
import { deriveBandLifeSummary } from "../bandLife";
import { deriveTopTalkLine } from "../reportedKnowledgeView";

export function Roster({
  bands,
  selectedBandId,
  currentTick,
  liveSelectedBand,
  liveSelectedTick,
  stepMode,
  onSelect,
}: {
  readonly bands: readonly Band[];
  readonly selectedBandId: BandId | null;
  readonly currentTick: TickNumber;
  readonly liveSelectedBand?: Band;
  readonly liveSelectedTick?: TickNumber;
  readonly stepMode: StepMode;
  readonly onSelect: (band: Band) => void;
}) {
  if (bands.length === 0) {
    return <p className="empty-panel">No bands spawned in this world.</p>;
  }

  const rosterBands =
    liveSelectedBand === undefined ||
    bands.some((band) => String(band.id) === String(liveSelectedBand.id))
      ? bands
      : [...bands, liveSelectedBand];

  return (
    <div className="band-roster" aria-label="Spawned bands">
      {rosterBands.map((snapshotBand) => {
        const isLiveSelected =
          liveSelectedBand !== undefined && String(snapshotBand.id) === String(liveSelectedBand.id);
        const band = isLiveSelected ? liveSelectedBand : snapshotBand;
        const rowTick = isLiveSelected && liveSelectedTick !== undefined ? liveSelectedTick : currentTick;

        return (
          <RosterRow
            key={band.id}
            band={band}
            active={band.id === selectedBandId}
            currentTick={rowTick}
            stepMode={stepMode}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

const RosterRow = memo(function RosterRow({
  band,
  active,
  currentTick,
  stepMode,
  onSelect,
}: {
  readonly band: Band;
  readonly active: boolean;
  readonly currentTick: TickNumber;
  readonly stepMode: StepMode;
  readonly onSelect: (band: Band) => void;
}) {
  const life = deriveBandLifeSummary(band, currentTick, stepMode);
  // Single cheap bounded pass over the band's capped report ring — a
  // perf-safe stand-in for a map-marker tooltip (canvas hover is disabled).
  const talkLine = deriveTopTalkLine(band);

  return (
    <button
      type="button"
      className={active ? "active" : undefined}
      onClick={() => onSelect(band)}
      title={talkLine}
    >
      <span className="band-roster-swatch" style={{ background: band.color }} />
      <span className="band-roster-body">
        <span className="band-roster-name" title={band.name}>{band.name}</span>
        <span className="band-roster-status">
          <Icon name={life.status.icon} /> {life.status.label}
        </span>
        {talkLine === undefined ? null : (
          <span className="band-roster-talk">
            <Icon name="talk" /> {talkLine}
          </span>
        )}
      </span>
    </button>
  );
});
