import type { Band } from "../../sim/agents/types";
import type { StepMode, TickNumber } from "../../sim/core/types";
import type { Tile } from "../../sim/world/types";

import { Icon } from "../icons";
import { deriveBandLifeSummary } from "../bandLife";
import { terrainLabel } from "../labels";
import { StatusChip } from "./parts";

export function BandHeadline({
  band,
  currentTile,
  season,
  currentTick,
  stepMode,
}: {
  readonly band: Band;
  readonly currentTile: Tile | undefined;
  readonly season: string;
  readonly currentTick: TickNumber;
  readonly stepMode: StepMode;
}) {
  const life = deriveBandLifeSummary(band, currentTick, stepMode);
  const population = Math.round(band.demography.population);

  // WHOLE-UI-READABILITY-HISTORY-FUN-1B — a clean masthead: name, status, one
  // line of what they are doing, and the three orientation facts. The reasons,
  // life-signal chips, and movement/intent detail live in "The short version"
  // and the Doing tab; repeating them here made the top of Overview read as
  // two competing summaries.
  return (
    <div className="band-headline">
      <div className="band-headline-top">
        <span className="band-headline-swatch" style={{ background: band.color }} aria-hidden />
        <div className="band-headline-name">
          <h3>{band.name}</h3>
          <StatusChip status={life.status} />
        </div>
      </div>
      <p className="band-headline-doing">{life.activityLine}</p>
      <div className="band-headline-meta">
        <span>
          <Icon name="people" /> {population} {population === 1 ? "person" : "people"}
        </span>
        <span>
          <Icon name="settle" /> {terrainLabel(currentTile?.terrainKind)}
        </span>
        <span>
          <Icon name="season" /> {season}
        </span>
      </div>
    </div>
  );
}
