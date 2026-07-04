import type { Band, IntraSeasonTripRecord } from "../../sim/agents/types";
import type { StepMode } from "../../sim/core/types";
import { getActivityTripId } from "../../render/canvasRenderer";
import { useSimulationStore } from "../../store";

import { Icon } from "../icons";
import type { StatusTone } from "../bandSummary";
import { deriveActivityTimeSummary, deriveActivityTripDisplay, deriveCampLifeDisplay } from "../bandLife";
import { deriveActivityTalkNotes } from "../reportedKnowledgeView";
import { Chip, CollapsibleGroup, SectionHeading } from "./parts";

/*
 * WHOLE-UI-READABILITY-HISTORY-FUN-1B — near-identical trips (same work, same
 * outcome) collapse into one representative card with a count; the full list
 * stays one expansion away so every trip can still be selected on the map.
 */
interface TripGroup {
  readonly key: string;
  readonly trips: readonly IntraSeasonTripRecord[];
}

function groupTrips(trips: readonly IntraSeasonTripRecord[]): readonly TripGroup[] {
  const groups = new Map<string, IntraSeasonTripRecord[]>();

  for (const trip of trips) {
    const display = deriveActivityTripDisplay(trip);
    const key = `${display.title}:${resultOf(trip).label}`;
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, [trip]);
    } else {
      group.push(trip);
    }
  }

  return [...groups.entries()].map(([key, grouped]) => ({ key, trips: grouped }));
}

const RESULT: Readonly<Record<string, { label: string; tone: StatusTone }>> = {
  successful_observation: { label: "Successful", tone: "settled" },
  target_found: { label: "Found it", tone: "settled" },
  target_not_found: { label: "Didn't find it", tone: "struggling" },
  partial_success: { label: "Partial", tone: "moving" },
  failed_due_to_distance: { label: "Too far", tone: "struggling" },
  failed_due_to_water_risk: { label: "Turned back at water", tone: "struggling" },
  failed_due_to_low_memory_confidence: { label: "Unsure of the way", tone: "pressure" },
  failed_due_to_season_mismatch: { label: "Wrong season", tone: "struggling" },
  delayed_return: { label: "Returned late", tone: "moving" },
  abandoned_due_to_risk: { label: "Abandoned — too risky", tone: "struggling" },
  returned_with_information: { label: "Brought back news", tone: "exploring" },
  no_effect_observed: { label: "Nothing notable", tone: "moving" },
};

const MEMORY_TEXT: Readonly<Record<string, string>> = {
  confidence_refreshed: "Confirmed this spot is reliable",
  confidence_lowered: "This spot seemed worse than remembered",
  seasonality_hint_added: "Learned how the season changes it",
  risk_suspicion_added: "Grew wary of a danger here",
  water_reliability_refreshed: "Confirmed the water here",
  plant_caution_refreshed: "Learned caution about a plant",
  route_memory_refreshed: "Remembered the route better",
  repeated_use_counter_incremented_placeholder: "Used this spot again",
};

function resultOf(trip: IntraSeasonTripRecord): { label: string; tone: StatusTone } {
  return RESULT[trip.activityOutcome] ?? { label: "Underway", tone: "moving" };
}

function ActivityCard({
  trip,
  active,
  onSelect,
  similarCount = 0,
}: {
  readonly trip: IntraSeasonTripRecord;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly similarCount?: number;
}) {
  const display = deriveActivityTripDisplay(trip);
  const icon = display.icon;
  const result = resultOf(trip);
  const learned = MEMORY_TEXT[trip.activityMemoryEffect.effectType];
  const people = Math.max(1, Math.round(trip.estimatedPeopleCount));
  const duration = Math.max(1, Math.round(trip.estimatedDurationDays));

  return (
    <button
      type="button"
      className={active ? "activity-card active" : "activity-card"}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="activity-card-head">
        <span className="activity-card-icon">
          <Icon name={icon} />
        </span>
        <span className="activity-card-title">{display.title}</span>
        <span className="activity-card-people">
          <Icon name="people" /> {people}
        </span>
      </div>
      <div className="activity-card-objective">{display.reason}</div>
      <div className="activity-card-status">
        <Chip tone={result.tone}>{result.label}</Chip>
        <span className="activity-card-summary">{display.detail}</span>
      </div>
      {learned === undefined ? null : (
        <div className="activity-card-learned">
          <Icon name="memory" /> {learned}
        </div>
      )}
      <div className="activity-card-meta">
        ~{trip.distanceTiles} tiles out · {duration} day{duration === 1 ? "" : "s"}
        {similarCount > 0 ? ` · ${similarCount} more trip${similarCount === 1 ? "" : "s"} like this` : ""}
      </div>
    </button>
  );
}

function CampLifeCard({
  band,
  stepMode,
}: {
  readonly band: Band;
  readonly stepMode: StepMode;
}) {
  const display = deriveCampLifeDisplay(band, stepMode);

  if (display === undefined) {
    return null;
  }

  return (
    <div className="activity-card activity-card-support">
      <div className="activity-card-head">
        <span className="activity-card-icon">
          <Icon name={display.icon} />
        </span>
        <span className="activity-card-title">{display.title}</span>
        <span className="activity-card-people">
          <Icon name="people" /> {display.peopleAtCamp}
        </span>
      </div>
      <div className="activity-card-objective">{display.reason}</div>
      <div className="activity-card-status">
        {display.chips.map((chip) => (
          <Chip key={`${chip.icon}-${chip.label}`} icon={chip.icon} tone={chip.tone} title={chip.title}>
            {chip.label}
          </Chip>
        ))}
      </div>
      <div className="activity-card-summary">{display.detail}</div>
      <div className="activity-card-meta">A picture of camp life while the parties are out.</div>
    </div>
  );
}

export function Activity({
  band,
  selectedActivityTripId,
  stepMode,
}: {
  readonly band: Band;
  readonly selectedActivityTripId: string | null;
  readonly stepMode: StepMode;
}) {
  const setSelectedActivityTripId = useSimulationStore((state) => state.setSelectedActivityTripId);
  const trips = [...(band.recentIntraSeasonTrips ?? [])]
    .sort((left, right) => Number(right.day) - Number(left.day))
    .slice(0, 8);
  const labor = band.activityLaborSummary;
  const summary = deriveActivityTimeSummary(band, stepMode);
  const talkNotes = deriveActivityTalkNotes(band);

  return (
    <div className="bp-activity">
      <SectionHeading icon="activity">Recent activity</SectionHeading>
      <div className="life-summary-panel">
        <div>
          <strong>{summary.title}</strong>
          <p>{summary.detail}</p>
        </div>
        {summary.chips.length === 0 ? null : (
          <div className="band-life-chips">
            {summary.chips.map((chip) => (
              <Chip key={`${chip.icon}-${chip.label}`} icon={chip.icon} tone={chip.tone} title={chip.title}>
                {chip.label}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {talkNotes.length === 0 ? null : (
        <div className="trip-talk">
          <span className="trip-talk-label">What parties are talking about</span>
          {talkNotes.map((note) => (
            <p key={note.id} className="trip-talk-line">
              <Icon name={note.icon} /> <span>{note.text}</span>
            </p>
          ))}
        </div>
      )}
      {labor === undefined ? null : (
        <p className="activity-overview">
          {labor.activeActivityGroupCount} group{labor.activeActivityGroupCount === 1 ? "" : "s"} out ·{" "}
          {labor.peopleAwayInActivityGroups} away · {labor.peopleAtResidentialCenterEstimate} at camp
        </p>
      )}
      <CampLifeCard band={band} stepMode={stepMode} />
      {trips.length === 0 ? (
        <p className="empty-panel">No trips out yet this season.</p>
      ) : (
        (() => {
          const groups = groupTrips(trips);
          const representatives = groups.slice(0, 4);

          return (
            <>
              <div className="activity-cards">
                {representatives.map((group) => {
                  const trip = group.trips[0];
                  const tripId = getActivityTripId(trip);

                  return (
                    <ActivityCard
                      key={group.key}
                      trip={trip}
                      similarCount={group.trips.length - 1}
                      active={tripId === selectedActivityTripId}
                      onSelect={() =>
                        setSelectedActivityTripId(tripId === selectedActivityTripId ? null : tripId)
                      }
                    />
                  );
                })}
              </div>
              {trips.length <= representatives.length ? null : (
                <CollapsibleGroup title={`Show every trip (${trips.length})`}>
                  <div className="activity-cards">
                    {trips.map((trip) => {
                      const tripId = getActivityTripId(trip);

                      return (
                        <ActivityCard
                          key={tripId}
                          trip={trip}
                          active={tripId === selectedActivityTripId}
                          onSelect={() =>
                            setSelectedActivityTripId(tripId === selectedActivityTripId ? null : tripId)
                          }
                        />
                      );
                    })}
                  </div>
                </CollapsibleGroup>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
