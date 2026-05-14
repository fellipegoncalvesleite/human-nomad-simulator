import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { humanize } from "../labels";
import { MemoryReferentSection } from "./MemoryReferents";
import { Chip, CollapsibleGroup, SectionHeading } from "./parts";
import {
  abundanceLabel,
  animalFamiliarityLabel,
  confidenceWord,
  knownnessLabel,
  usefulnessLabel,
} from "./translate";

type VisibleNature = NonNullable<Band["visibleNature"]>;
type FaunaCard = VisibleNature["faunaCards"][number];
type AnimalKnowledge = VisibleNature["animalKnowledge"][number];
type AnimalPerception = VisibleNature["animalPerceptions"][number];
type ForestCard = VisibleNature["forestCards"][number];

/*
 * WHOLE-UI-READABILITY-HISTORY-FUN-1 — "The living world, as they understand
 * it." Leads with the band's own reading of the country, keeps a few strong
 * animal cards up front, folds the long tail of tracks/sightings/impressions
 * into one expandable group, and summarizes forests instead of repeating
 * near-identical stand cards. Raw card internals live in Technical.
 */
export function Nature({
  band,
  world,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const nature = band.visibleNature;
  const relationship = band.relationshipMemory;

  if (nature === undefined) {
    return (
      <div className="bp-overview">
        <section className="bp-section">
          <SectionHeading icon="animal">The living world</SectionHeading>
          <p className="condition-note">The band has not yet formed a clear picture of the living world around it.</p>
        </section>
      </div>
    );
  }

  const familiarity = relationship?.animalFamiliarity ?? [];
  const signCount = nature.animalKnowledge.length + nature.animalPerceptions.length;

  return (
    <div className="bp-overview">
      <section className="bp-section">
        <SectionHeading icon="animal">The living world, as they see it</SectionHeading>
        <div className="story-block">
          <strong>{nature.natureHeadline}</strong>
          <p>{nature.animalHeadline}</p>
          <p>{nature.plantHeadline}</p>
          <p>{nature.aquaticHeadline}</p>
        </div>
      </section>

      <MemoryReferentSection
        band={band}
        world={world}
        title="Concrete nature memories"
        icon="memory"
        kinds={["animal_sign", "aquatic_place", "food_patch", "forest_place"]}
        tab="nature"
        limit={5}
        onOpenChronicle={onOpenChronicle}
      />

      <section className="bp-section">
        <SectionHeading icon="animal">Animals nearby</SectionHeading>
        {nature.faunaCards.length === 0 ? (
          <p className="condition-note">
            The band does not yet read this country&apos;s animals well — early observations and caution, but nothing
            has settled into reliable memory.
          </p>
        ) : (
          <div className="nature-card-list nature-card-grid">
            {nature.faunaCards.slice(0, 3).map((card) => (
              <AnimalCard key={card.stockId} card={card} />
            ))}
          </div>
        )}
        {familiarity.length === 0 ? null : (
          <ol className="recent-events">
            {familiarity.slice(0, 3).map((record, index) => (
              <li key={`${record.label}-${index}`} className="recent-event">
                <span className="recent-event-title">
                  {record.label} {animalFamiliarityLabel(record.kind)}
                </span>
                <span className="recent-event-desc">{record.basis}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* The pinned heading below keeps the relationship-memory audit anchor:
          "Animals they have come to know" + animalFamiliarity live here. */}
      {signCount === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="activity">Animals they have come to know</SectionHeading>
          <CollapsibleGroup title={`All tracks, sightings, and impressions (${signCount})`}>
            {nature.animalKnowledge.length === 0 ? null : (
              <div className="nature-card-list nature-card-grid compact">
                {nature.animalKnowledge.slice(0, 6).map((memory) => (
                  <TrackCard key={`${memory.stockId}-${memory.source}`} memory={memory} />
                ))}
              </div>
            )}
            {nature.animalPerceptions.length === 0 ? null : (
              <div className="nature-card-list nature-card-grid compact">
                {nature.animalPerceptions.slice(0, 4).map((perception, index) => (
                  <AnimalPerceptionCard key={`${perception.archetype}-${index}`} perception={perception} />
                ))}
              </div>
            )}
          </CollapsibleGroup>
        </section>
      )}

      <section className="bp-section">
        <SectionHeading icon="region">Trees &amp; forest</SectionHeading>
        {nature.forestCards.length === 0 ? (
          <p className="condition-note">
            No wooded place has worked its way into memory yet — this is still country they are learning to read.
          </p>
        ) : (
          <>
            {forestSummaryLine(nature.forestCards) === undefined ? null : (
              <p className="condition-note">{forestSummaryLine(nature.forestCards)}</p>
            )}
            <div className="nature-card-list nature-card-grid compact">
              {nature.forestCards.slice(0, 3).map((card) => (
                <ForestCardView key={card.patchId} card={card} />
              ))}
            </div>
          </>
        )}
      </section>

      <MemoryReferentSection
        band={band}
        world={world}
        title="Hard moments they carry"
        icon="risk"
        kinds={["accident"]}
        tab="nature"
        limit={4}
        compact
        onOpenChronicle={onOpenChronicle}
      />
    </div>
  );
}

/* Several near-identical stand cards read as noise; one grouped line carries
 * the pattern and the top cards carry the specifics. */
function forestSummaryLine(cards: readonly ForestCard[]): string | undefined {
  if (cards.length < 3) {
    return undefined;
  }

  const pressured = cards.filter((card) => card.pressure >= 0.55).length;

  if (pressured === 0) {
    return `${cards.length} wooded places stand out in their known country, most holding steady; the closest ones are shown here.`;
  }

  return `${cards.length} wooded places stand out in their known country; ${pressured} show${pressured === 1 ? "s" : ""} the wear of repeated use.`;
}

function AnimalCard({ card }: { readonly card: FaunaCard }) {
  return (
    <article className="nature-card nature-card-animal">
      <div className="nature-card-head">
        <strong>{card.label}</strong>
        <Chip tone={card.risk >= 0.55 ? "struggling" : card.confidence >= 0.45 ? "settled" : "moving"}>
          {knownnessLabel(card.knownness)}
        </Chip>
      </div>
      <p>{card.topReasons.slice(0, 2).join(" ")}</p>
      <div className="nature-card-meta">
        {abundanceLabel(card.perceivedAbundance)} · {usefulnessLabel(card.usefulness)} · {confidenceWord(card.confidence)}
      </div>
    </article>
  );
}

function AnimalPerceptionCard({ perception }: { readonly perception: AnimalPerception }) {
  const risky = perception.perception.some(
    (item) => item === "feared" || item === "dangerous" || item === "avoided" || item === "unreliable",
  );

  return (
    <article className="nature-card nature-card-animal">
      <div className="nature-card-head">
        <strong>{humanize(perception.archetype)}</strong>
        <Chip tone={risky ? "struggling" : "moving"}>{perception.perception.slice(0, 2).map(humanize).join(", ")}</Chip>
      </div>
      <p>{perception.reason}</p>
    </article>
  );
}

function TrackCard({ memory }: { readonly memory: AnimalKnowledge }) {
  return (
    <article className="nature-card nature-card-track">
      <div className="nature-card-head">
        <strong>{humanize(memory.archetype)}</strong>
        <Chip tone={memory.state === "dangerous" || memory.state === "avoided" ? "struggling" : "moving"}>
          {humanize(memory.source)}
        </Chip>
      </div>
      <p>
        {humanize(memory.state)}, learned in {humanize(memory.lastUpdatedSeason)} of year {memory.lastUpdatedYear} —{" "}
        {confidenceWord(memory.confidence)}.
      </p>
      {memory.riskOrAvoidanceNote === undefined ? null : <p className="condition-note">{memory.riskOrAvoidanceNote}</p>}
    </article>
  );
}

function ForestCardView({ card }: { readonly card: ForestCard }) {
  return (
    <article className="nature-card nature-card-forest">
      <div className="nature-card-head">
        <strong>{humanize(card.coverType)}</strong>
        <Chip tone={card.pressure >= 0.55 ? "struggling" : "settled"}>{humanize(card.growthTrend)}</Chip>
      </div>
      <p>{card.topReasons.slice(0, 2).join(" ")}</p>
      <div className="nature-card-meta">
        {card.perception.slice(0, 3).map(humanize).join(" · ") || "No strong impression yet"}
      </div>
    </article>
  );
}
