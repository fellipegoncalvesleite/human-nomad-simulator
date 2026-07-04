import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { MemoryReferentSection } from "./MemoryReferents";
import { Chip, SectionHeading, StatTile } from "./parts";
import {
  capacityStateLabel,
  cleanlinessLabel,
  fireStatusLabel,
  hungerClassificationLabel,
  intensityWord,
  logisticsModeLabel,
  opportunisticFoodLabel,
  seasonalTaskLabel,
  sharingStateLabel,
  sicknessCauseLabel,
  sicknessDurationLabel,
} from "./translate";

/*
 * WHOLE-UI-READABILITY-HISTORY-FUN-1 — "Daily life under pressure", not a
 * logistics spreadsheet. Leads with how the day is actually going, then hands
 * and mouths, food/water rhythm, sickness and care, gear, remembered weather,
 * and what the season demands. Raw intensities/hooks stay in Technical.
 */
export function Survival({
  band,
  world,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const logistics = band.bodyCampLogistics;
  const support = band.seasonalSupport;
  const demography = band.demography;
  const dependents = Math.max(0, Math.round(demography.dependents));
  const elders = Math.max(0, Math.round(demography.elders));
  const workingAdults = Math.max(0, Math.round(demography.workingAdults));

  return (
    <div className="bp-overview">
      {logistics === undefined ? (
        <section className="bp-section">
          <SectionHeading icon="status">Daily survival</SectionHeading>
          <p className="condition-note">The shape of their daily work has not come into focus yet.</p>
        </section>
      ) : (
        <section className="bp-section">
          <SectionHeading icon="status">Daily survival</SectionHeading>
          <div className="story-block">
            <strong>{logisticsModeLabel(logistics.mode)}</strong>
            <p>{capacityStateLabel(logistics.logisticCapacity.state)} for the day&apos;s work.</p>
            <p>{logistics.logisticCapacity.limitingReason}</p>
          </div>
          <div className="support-pressure">
            <Chip icon="camp" tone={logistics.campCleanliness.state === "clean" ? "settled" : logistics.campCleanliness.state === "recovering" ? "moving" : "struggling"}>
              {cleanlinessLabel(logistics.campCleanliness.state)}
            </Chip>
            <Chip icon="risk" tone={logistics.fire.status === "useful" || logistics.fire.status === "not_relevant" ? "settled" : "moving"}>
              {fireStatusLabel(logistics.fire.status)}
            </Chip>
            <Chip icon="people" tone={logistics.sharingPressure.state === "easy_sharing" || logistics.sharingPressure.state === "relief" ? "settled" : "moving"}>
              {sharingStateLabel(logistics.sharingPressure.state)}
            </Chip>
          </div>
        </section>
      )}

      <section className="bp-section">
        <SectionHeading icon="people">Hands and mouths</SectionHeading>
        <div className="stat-tiles">
          <StatTile icon="people" label="Working adults" value={String(workingAdults)} />
          <StatTile icon="people" label="Children" value={String(dependents)} />
          <StatTile icon="people" label="Elders" value={String(elders)} />
          <StatTile icon="camp" label="Households" value={String(Math.max(1, Math.round(demography.householdCount)))} />
        </div>
      </section>

      {support === undefined ? null : (
        <section className="bp-section">
          <SectionHeading icon="food">Food &amp; water rhythm</SectionHeading>
          <div className="story-block">
            <strong>{hungerClassificationLabel(support.hungerClassification)}</strong>
            {(support.topSeasonalSupportReasons ?? []).slice(0, 3).map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        </section>
      )}

      {logistics === undefined ? null : (
        <>
          {!logistics.sickness.active ? null : (
            <section className="bp-section">
              <SectionHeading icon="risk">Sickness</SectionHeading>
              <div className="story-block">
                <strong>
                  Sickness in camp — {intensityWord(logistics.sickness.severity)}, {sicknessDurationLabel(logistics.sickness.durationEstimate)}.
                </strong>
                {logistics.sickness.causeKinds.length === 0 ? null : (
                  <p>
                    They blame {logistics.sickness.causeKinds.slice(0, 3).map((cause) => sicknessCauseLabel(cause)).join(", ")}.
                  </p>
                )}
              </div>
            </section>
          )}

          <MemoryReferentSection
            band={band}
            world={world}
            title="Sickness, accidents, and care burden"
            icon="risk"
            kinds={["sickness_source", "accident"]}
            tab="survival"
            limit={4}
            compact
            onOpenChronicle={onOpenChronicle}
          />

          {logistics.materialWear.length === 0 ? null : (
            <MemoryReferentSection
              band={band}
              world={world}
              title="Gear and materials"
              icon="storage"
              kinds={["gear_material_issue"]}
              tab="survival"
              limit={4}
              compact
              onOpenChronicle={onOpenChronicle}
            />
          )}

          {logistics.weatherMemories.length === 0 ? null : (
            <MemoryReferentSection
              band={band}
              world={world}
              title="Weather they remember"
              icon="season"
              kinds={["weather_episode"]}
              tab="survival"
              limit={4}
              compact
              onOpenChronicle={onOpenChronicle}
            />
          )}

          {logistics.opportunisticFoodCandidates.length === 0 ? null : (
            <section className="bp-section">
              <SectionHeading icon="food">Small finds that help</SectionHeading>
              <ol className="recent-events">
                {logistics.opportunisticFoodCandidates.slice(0, 3).map((candidate) => (
                  <li key={candidate.kind} className="recent-event">
                    <span className="recent-event-title">
                      {(() => {
                        const label = opportunisticFoodLabel(candidate.kind);
                        return label.charAt(0).toUpperCase() + label.slice(1);
                      })()}
                    </span>
                    <span className="recent-event-desc">{candidate.triggeredBy}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {logistics.seasonalTasks.length === 0 ? null : (
            <section className="bp-section">
              <SectionHeading icon="activity">What the season demands</SectionHeading>
              <ol className="recent-events">
                {logistics.seasonalTasks.slice(0, 3).map((task) => (
                  <li key={task.category} className="recent-event">
                    <span className="recent-event-title">{seasonalTaskLabel(task.category)}</span>
                    <span className="recent-event-desc">{task.reason}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
