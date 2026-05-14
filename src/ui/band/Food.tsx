import { useMemo, useState } from "react";

import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { deriveSelectedBandEcology } from "../ecologyView";
import type { KnownEcologyBucket, KnownEcologyCategory } from "../ecologyView";
import { Icon } from "../icons";
import type { IconName } from "../icons";
import type { StatusTone } from "../bandSummary";
import { MemoryReferentSection } from "./MemoryReferents";
import { Chip, SectionHeading } from "./parts";
import {
  abundanceLabel,
  adaptationModeLabel,
  fallbackLevelLabel,
  learningStatusLabel,
  resourceClassFoodLabel,
  storageGradeLabel,
  usefulnessLabel,
} from "./translate";

type LearningRecord = NonNullable<Band["foragingAdaptation"]>["learningRecords"][number];

/*
 * 1C — a comfort label ("Fed and settled in their ways") must not appear while
 * fallback foods, hunger, or sickness say otherwise. The strain facts win.
 */
function dietHoldingHeadline(band: Band, adaptation: NonNullable<Band["foragingAdaptation"]>): string {
  if (adaptation.mode !== "stable") {
    return adaptationModeLabel(adaptation.mode);
  }

  const hungerState = band.seasonalSupport?.hungerClassification;
  const hungry = hungerState !== undefined && hungerState !== "stable";
  const sick = band.bodyCampLogistics?.sickness.active === true;
  const fallbackLean = (band.resourceEcology?.support.fallbackContribution ?? 0) > 0.12 ||
    adaptation.fallbackCandidates.length > 0;

  if (hungry || sick) {
    return "Eating, but not secure";
  }

  if (fallbackLean) {
    return "Fed for now, but leaning on fallback foods";
  }

  return adaptationModeLabel(adaptation.mode);
}

/* Identical "a food is risky" rows for the same food class at different spots
 * collapse into one named entry with a place count. */
function groupLearningRecords(records: readonly LearningRecord[]): readonly {
  readonly key: string;
  readonly record: LearningRecord;
  readonly count: number;
}[] {
  const groups = new Map<string, { record: LearningRecord; count: number }>();

  for (const record of records) {
    const key = `${String(record.resourceClassId)}:${record.status}`;
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { record, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  return [...groups.entries()].map(([key, group]) => ({ key, record: group.record, count: group.count }));
}

/*
 * READABILITY-UI-ORGANIZATION-1 — "What do they live on?"
 * Known food ecology, current diet response, fallback foods, plant patches,
 * and what keeps/carries well. Anti-omniscient: only what THIS band knows.
 */

const ECOLOGY_TONE: Record<KnownEcologyCategory, StatusTone> = {
  rich: "settled",
  decent: "settled",
  recovering: "moving",
  poor: "moving",
  depleted: "struggling",
  unknown: "moving",
};

const ECOLOGY_CATEGORY_LABEL: Record<KnownEcologyCategory, string> = {
  rich: "Rich",
  decent: "Decent",
  recovering: "Recovering",
  poor: "Poor",
  depleted: "Overused",
  unknown: "Unknown",
};

function EcologyRow({
  icon,
  label,
  bucket,
  expanded,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly bucket: KnownEcologyBucket;
  readonly expanded: boolean;
}) {
  return (
    <div className="ecology-row">
      <div className="ecology-row-head">
        <span className="condition-icon">
          <Icon name={icon} />
        </span>
        <span className="ecology-row-label">{label}</span>
        <Chip tone={ECOLOGY_TONE[bucket.category]}>{ECOLOGY_CATEGORY_LABEL[bucket.category]}</Chip>
      </div>
      <p className="ecology-row-note">{bucket.note}</p>
      {expanded && bucket.knownPlaces > 0 ? (
        <p className="ecology-row-detail">
          {bucket.knownPlaces} known place{bucket.knownPlaces === 1 ? "" : "s"}
          {bucket.reliable > 0 ? ` · ${bucket.reliable} reliable` : ""}
          {bucket.declining > 0 ? ` · ${bucket.declining} giving less` : ""}
          {bucket.recovering > 0 ? ` · ${bucket.recovering} recovering` : ""}
          {bucket.depletedOrAvoided > 0 ? ` · ${bucket.depletedOrAvoided} overused/avoided` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function Food({
  band,
  world,
  defaultExpanded = false,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly defaultExpanded?: boolean;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const ecology = useMemo(() => deriveSelectedBandEcology(band), [band]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const adaptation = band.foragingAdaptation;
  const nature = band.visibleNature;
  const storageCards = band.resourceEcology?.storageSuitabilityCards ?? [];
  const storageSummary = band.resourceEcology?.storageSuitabilitySummary;
  const topFoods = (band.resourceEcology?.support.topContributingClasses ?? [])
    .filter((entry) => entry.supportShare >= 0.05)
    .slice(0, 3)
    .map((entry) => entry.label);
  const fallbackShare = band.resourceEcology?.support.fallbackContribution ?? 0;

  return (
    <div className="bp-overview">
      {/* The plate, in one breath: what actually feeds them and at what cost. */}
      <section className="bp-section">
        <SectionHeading icon="food">What they eat, in short</SectionHeading>
        <div className="story-block">
          <strong>
            {topFoods.length === 0
              ? "No single food source dominates what feeds them yet."
              : `Most of what feeds them now: ${topFoods.join(", ")}.`}
          </strong>
          {fallbackShare > 0.12 ? (
            <p>Fallback foods are carrying a real share of meals — help that costs extra work and risk.</p>
          ) : null}
          {storageSummary === undefined ? null : <p>{storageSummary.carryingConcern}</p>}
        </div>
      </section>

      <section className="bp-section">
        <div className="ecology-head">
          <SectionHeading icon="knowledge">Food they know about</SectionHeading>
          <button type="button" className="ecology-expand" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "Expand all"}
          </button>
        </div>
        <div className="ecology-list">
          <EcologyRow icon="activity" label="Wildlife" bucket={ecology.wildlife} expanded={expanded} />
          <EcologyRow icon="water" label="Fish / water" bucket={ecology.aquatic} expanded={expanded} />
          <EcologyRow icon="food" label="Plants" bucket={ecology.plants} expanded={expanded} />
        </div>
        <p className="condition-note">Only what this band has learned itself — not the whole map.</p>
      </section>

      {adaptation === undefined ? null : (
        <section className="bp-section">
          <SectionHeading icon="food">How the diet is holding</SectionHeading>
          <div className="story-block">
            <strong>{dietHoldingHeadline(band, adaptation)}</strong>
            {adaptation.fallbackCandidates.length === 0 ? (
              <p>No fallback foods are being leaned on.</p>
            ) : (
              <p>
                {fallbackLevelLabel(adaptation.fallbackCandidates[0].level)} — the concrete patches and risks are listed below.
              </p>
            )}
          </div>
          {adaptation.learningRecords.length === 0 ? null : (
            <>
              <p className="condition-note">What they are learning about new foods:</p>
              <ol className="recent-events">
                {groupLearningRecords(adaptation.learningRecords).slice(0, 3).map((group) => (
                  <li key={group.key} className="recent-event">
                    <span className="recent-event-title">
                      {(() => {
                        const food = resourceClassFoodLabel(String(group.record.resourceClassId));
                        const status = learningStatusLabel(group.record.status);
                        return `${food.charAt(0).toUpperCase()}${food.slice(1)} — ${status}`;
                      })()}
                    </span>
                    <span className="recent-event-desc">
                      {group.record.unlockHint ?? group.record.gatedReason ?? ""}
                      {group.count > 1 ? ` Watched at ${group.count} places.` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      <MemoryReferentSection
        band={band}
        world={world}
        title="Remembered food and resource sources"
        icon="food"
        kinds={["food_patch", "resource_place", "aquatic_place"]}
        tab="food"
        limit={6}
        showNotices
        onOpenChronicle={onOpenChronicle}
      />

      {nature === undefined || nature.plantCards.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="food">Plant patches they work</SectionHeading>
          <div className="nature-card-list nature-card-grid compact">
            {nature.plantCards.slice(0, 4).map((card) => (
              <article key={card.patchId} className="nature-card nature-card-plant">
                <div className="nature-card-head">
                  <strong>{card.label}</strong>
                  <Chip tone={card.useStatus === "overused" || card.useStatus === "avoided" ? "struggling" : "settled"}>
                    {usefulnessLabel(card.useStatus)}
                  </Chip>
                </div>
                <p>{card.topReasons.slice(0, 2).join(" ")}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {nature === undefined || nature.aquaticCards.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="fishing">Fish &amp; water-edge food</SectionHeading>
          <div className="nature-card-list nature-card-grid compact">
            {nature.aquaticCards.slice(0, 4).map((card) => (
              <article key={card.stockId} className="nature-card nature-card-aquatic">
                <div className="nature-card-head">
                  <strong>{card.label}</strong>
                  <Chip tone={card.aquaticEffect === "overfished" ? "struggling" : "settled"}>
                    {abundanceLabel(card.abundanceProductivity)}
                  </Chip>
                </div>
                <p>{card.topReasons.slice(0, 2).join(" ")}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {storageCards.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="storage">What keeps and carries</SectionHeading>
          {storageSummary === undefined ? null : (
            <div className="story-block">
              <strong>{storageSummary.seasonalBufferHeadline}</strong>
              <p>{storageSummary.carryingConcern}</p>
            </div>
          )}
          <div className="nature-card-list nature-card-grid compact">
            {storageCards.slice(0, 4).map((card) => (
              <article key={card.classId} className="nature-card nature-card-storage">
                <div className="nature-card-head">
                  <strong>{card.label}</strong>
                  <Chip
                    tone={
                      card.storageSuitability === "good" || card.storageSuitability === "excellent"
                        ? "settled"
                        : card.perishability === "high"
                          ? "struggling"
                          : "moving"
                    }
                  >
                    {storageGradeLabel(card.storageSuitability)}
                  </Chip>
                </div>
                <p>{card.seasonalUsefulness}</p>
              </article>
            ))}
          </div>
          <p className="condition-note">No stockpiles yet — this is about what could be kept a while, not stores.</p>
        </section>
      )}
    </div>
  );
}
