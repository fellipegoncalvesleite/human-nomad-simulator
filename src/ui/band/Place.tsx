import { useMemo } from "react";

import type { Band } from "../../sim/agents/types";
import type { TickNumber } from "../../sim/core/types";
import type { TileId } from "../../sim/core/types";
import type { WorldState } from "../../sim/world/types";

import { deriveFamiliarCountry } from "../../sim/agents/familiarCountry";
import { MemoryReferentSection } from "./MemoryReferents";
import { CauseCard, SectionHeading } from "./parts";
import { deriveWhyHereCard } from "./playerStory";
import {
  campSeasonalIdentityLabel,
  campStateLabel,
  campTrendLabel,
  confidenceWord,
  placeCharacterLabel,
  seasonalRoundOutcomeLabel,
  seasonalRoundPhaseLabel,
  usePressureLabel,
} from "./translate";

/*
 * READABILITY-UI-ORGANIZATION-1 — "Why does this place matter?"
 * The current camp's standing in the band's own memory, the places they return
 * to, the seasonal round, familiar country, and remembered routes/crossings.
 */
export function Place({
  band,
  world,
  currentTick,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly currentTick: TickNumber;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const camp = band.protoCampMemory;
  const currentPlace = camp?.currentPlace;
  const roundState = band.seasonalRoundState;
  const relationship = band.relationshipMemory;
  const whyHere = useMemo(() => deriveWhyHereCard(band), [band]);
  const range = useMemo(() => deriveFamiliarCountry(band, currentTick), [band, currentTick]);
  const topPlaces = camp?.topPlaces ?? [];
  const characters = relationship?.placeCharacters ?? [];

  return (
    <div className="bp-overview">
      <section className="bp-section">
        <SectionHeading icon="camp">This place, to them</SectionHeading>
        {currentPlace === undefined || currentPlace.campLikeState === "none" ? (
          <p className="condition-note">This spot holds no special standing in their memory yet.</p>
        ) : (
          <>
            <div className="story-block">
              <strong>{campStateLabel(currentPlace.campLikeState)}</strong>
              <p>
                It is {campTrendLabel(currentPlace.lifecycleTrend)}, remembered as {campSeasonalIdentityLabel(currentPlace.seasonalIdentity)}, and {usePressureLabel(currentPlace.usePressureStatus)}.
              </p>
              <p>How sure they are: {confidenceWord(currentPlace.confidence)}.</p>
            </div>
            {onOpenChronicle === undefined ? null : (
              <button
                type="button"
                className="chronicle-link small"
                title="Open this place's story in the Chronicle"
                onClick={() => onOpenChronicle(`place:${String(currentPlace.tileId)}`)}
              >
                Read this place&apos;s story in the Chronicle
              </button>
            )}
          </>
        )}
      </section>

      <CauseCard
        title={whyHere.title}
        because={whyHere.because}
        pressures={whyHere.pressures}
        note="Their own reasons for holding this ground. Raw proof lives in Technical."
      />

      {roundState === undefined ? null : (
        <section className="bp-section">
          <SectionHeading icon="season">The seasonal round</SectionHeading>
          <div className="story-block">
            <strong>Now: {seasonalRoundPhaseLabel(roundState.currentPhase)}</strong>
            <p>{seasonalRoundOutcomeLabel(roundState.outcome)}</p>
            {roundState.roundBlockedReason === undefined ? null : <p>{roundState.roundBlockedReason}</p>}
            {roundState.roundAbandonedReason === undefined ? null : <p>{roundState.roundAbandonedReason}</p>}
          </div>
        </section>
      )}

      <section className="bp-section">
        <SectionHeading icon="range">Familiar country</SectionHeading>
        {range.familiarTiles.length === 0 && range.coreTiles.length === 0 ? (
          <p className="condition-note">They are still learning this country — no familiar range has settled yet.</p>
        ) : (
          <p className="condition-note">
            They know {range.coreTiles.length} place{range.coreTiles.length === 1 ? "" : "s"} intimately and about{" "}
            {range.familiarTiles.length} more well enough to move with confidence — with {range.edgeTiles.length} at the
            edge of what they know. The map draws this as their familiar-country overlay.
          </p>
        )}
      </section>

      {topPlaces.length === 0 ? null : (
        <MemoryReferentSection
          band={band}
          world={world}
          title="Places they return to"
          icon="camp"
          kinds={["camp_place", "access_place"]}
          tab="place"
          limit={6}
          onOpenChronicle={onOpenChronicle}
        />
      )}

      {characters.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="memory">How places feel</SectionHeading>
          <ol className="recent-events">
            {characters.slice(0, 5).map((character) => (
              <li
                key={`${String(character.tileId)}-${character.kind}`}
                className={character.pressure >= 0.55 ? "recent-event tone-struggling" : "recent-event tone-settled"}
              >
                <span className="recent-event-title">
                  {(character.label.length > 0 ? character.label : placeCharacterLabel(character.kind))} — {placeContext(world, band, character.tileId)}
                </span>
                <span className="recent-event-desc">{character.basis}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <MemoryReferentSection
        band={band}
        world={world}
        title="Routes and crossings they remember"
        icon="route"
        kinds={["route", "crossing", "accident"]}
        tab="place"
        limit={6}
        empty="No remembered route or river crossing is important to this band yet."
        onOpenChronicle={onOpenChronicle}
      />
    </div>
  );
}

function placeContext(world: WorldState | null, band: Band, tileId: TileId): string {
  if (world === null || String(tileId) === String(band.position)) {
    return "near the current camp";
  }
  const current = world.tiles[band.position];
  const target = world.tiles[tileId];
  if (current === undefined || target === undefined) {
    return "in remembered country";
  }
  const dx = target.coord.x - current.coord.x;
  const dy = target.coord.y - current.coord.y;
  const eastWest = dx > 1 ? "east" : dx < -1 ? "west" : "";
  const northSouth = dy > 1 ? "south" : dy < -1 ? "north" : "";
  const direction = `${northSouth}${northSouth.length > 0 && eastWest.length > 0 ? "-" : ""}${eastWest}`;
  return direction.length === 0 ? "near the current camp" : `${direction} of the current camp`;
}
