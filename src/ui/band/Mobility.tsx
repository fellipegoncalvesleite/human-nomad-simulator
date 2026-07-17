// EXPEDITIONARY-4 §19 — read-only mobility + expedition panel.
//
// Shows the selected band's physical mobility (derived capacity, stored
// conditioning, realized walking history — each labeled for what it is) and its
// away parties (task, composition, phase, position, route progress, provisions,
// cargo, task camp, party-local observations, signal attempts, risk episodes,
// expected return) plus the bounded terminal outcome history.
//
// Deliberate non-claims (Option B): NO male/female breakdown exists in canonical
// population state and none is displayed; dependents/elders have no per-cohort
// mobility statistics, only their real constraint on the residential column.
import { useMemo } from "react";

import {
  deriveAvailableMobilityPools,
  deriveCommittedMobilityPools,
  deriveMobilityCapacity,
  deriveMobilityRolePools,
  deriveTravelPace,
  deriveWalkingSummary,
  KM_PER_TILE,
} from "../../sim/agents/bandMobility";
import { getCommittedExpeditionWorkers } from "../../sim/agents/expedition";
import type { Band, ExpeditionRecord } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";
import { Chip, SectionHeading } from "./parts";

function formatKm(value: number): string {
  return `${Math.round(value * 10) / 10} km`;
}

function phaseLabel(expedition: ExpeditionRecord): string {
  switch (expedition.phase) {
    case "prepared":
      return "getting ready";
    case "outbound":
      return "walking out";
    case "operating":
      return "working at the target";
    case "returning":
      return "walking home";
    default:
      return expedition.phase;
  }
}

export function Mobility({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const capacity = useMemo(() => deriveMobilityCapacity(band), [band]);
  const summary = useMemo(() => deriveWalkingSummary(band.mobility), [band]);
  const pools = useMemo(() => deriveMobilityRolePools(band), [band]);
  const committed = useMemo(() => deriveCommittedMobilityPools(band), [band]);
  const available = useMemo(() => deriveAvailableMobilityPools(band), [band]);
  const columnPace = useMemo(() => deriveTravelPace(band, "whole_band_residential_move"), [band]);
  const adultsAway = getCommittedExpeditionWorkers(band);
  const fatigue = band.pressureState?.fatiguePressure ?? 0;
  const nutritionStress = band.demography.foodPerPersonStress ?? 0;
  const conditioning = band.mobility?.conditioning ?? 0.2;
  const capacityGap = capacity.routineKmPerActiveDay - capacity.currentKmPerActiveDay;
  const capacityGapReason =
    capacityGap <= 0.05
      ? "walking at full routine capacity"
      : fatigue >= nutritionStress
        ? `tired bodies (fatigue ${Math.round(fatigue * 100)}%) hold today below routine`
        : `hunger (nutrition stress ${Math.round(nutritionStress * 100)}%) holds today below routine`;
  const expeditions = (band.expeditions ?? []).filter(
    (expedition) =>
      expedition.phase === "prepared" ||
      expedition.phase === "outbound" ||
      expedition.phase === "operating" ||
      expedition.phase === "returning",
  );
  const outcomes = band.recentExpeditionOutcomes ?? [];
  const signals = band.receivedSmokeSignals ?? [];

  return (
    <section className="bp-section band-mobility" aria-label="mobility and away parties">
      <SectionHeading icon="move">Mobility &amp; Parties</SectionHeading>

      <article className="practice-feedback-overview">
        <span className="practice-feedback-kicker">How far these people can walk (derived today)</span>
        <ul className="condition-note">
          <li>Routine sustainable: <strong>{formatKm(capacity.routineKmPerActiveDay)}</strong> per travel day</li>
          <li>Today: <strong>{formatKm(capacity.currentKmPerActiveDay)}</strong> — {capacityGapReason}</li>
          <li>Under full load: <strong>{formatKm(capacity.loadedKmPerActiveDay)}</strong></li>
          <li>Desperate overreach ceiling: <strong>{formatKm(capacity.overreachKmPerActiveDay)}</strong> (willingness, not stamina)</li>
          <li>The whole camp as a column: <strong>{formatKm(columnPace.kmPerTravelDay)}</strong> per travel day (dependents, elders, and camp burden are real constraints)</li>
        </ul>
        <span className="practice-feedback-kicker">Bodily conditioning (stored, slow, reversible)</span>
        <p className="condition-note">
          Conditioning {Math.round(conditioning * 100)}% — bodies used to walking; distinct from learned technique.
        </p>
        <span className="practice-feedback-kicker">Realized walking (history — describes, never permits)</span>
        <ul className="condition-note">
          <li>Recent mean: {formatKm(summary.calendarDayMeanKm)} per calendar day · {formatKm(summary.activeDayMeanKm)} per active day</li>
          <li>{summary.activeDays} active days · {summary.restDays} rest days · loaded mean {formatKm(summary.loadedMeanKm)}</li>
          <li>Longest recent day {formatKm(summary.activeDayMaxKm)} · longest journey {formatKm(summary.longestExpeditionKm)}</li>
        </ul>
        <span className="practice-feedback-kicker">Walkers (aggregate mobility roles — no sex claim exists or is shown)</span>
        <p className="condition-note">
          {pools.high} strong walkers · {pools.typical} ordinary · {pools.limited} limited — of {band.demography.workingAdults} working adults;{" "}
          {adultsAway} away with parties (available now: {available.high}/{available.typical}/{available.limited}; committed: {committed.high + committed.typical + committed.limited}).
        </p>
      </article>

      {expeditions.length === 0 ? (
        <p className="condition-note">No party is away from camp right now.</p>
      ) : (
        expeditions.map((expedition) => {
          const routeTiles = Math.max(1, expedition.routeTileIds.length - 1);
          const plannedKm = routeTiles * 2 * KM_PER_TILE;
          const walkedTiles =
            expedition.phase === "returning"
              ? routeTiles + (routeTiles - expedition.routeIndex)
              : expedition.routeIndex;
          return (
            <article key={expedition.id} className="practice-feedback-overview">
              <span className="practice-feedback-kicker">Away party — {expedition.taskKind.replace(/_/g, " ")}</span>
              <p className="condition-note">
                {expedition.partyWorkers} adults
                {expedition.partyComposition === undefined
                  ? ""
                  : ` (${expedition.partyComposition.high} strong / ${expedition.partyComposition.typical} ordinary / ${expedition.partyComposition.limited} limited)`}{" "}
                — {phaseLabel(expedition)} at {String(expedition.positionTileId)} · {Math.round((walkedTiles * KM_PER_TILE) * 10) / 10} of ~{plannedKm} km ·
                day {expedition.travelDaysElapsed + expedition.workDaysElapsed}, expected back day {Number(expedition.plannedReturnDay)}
              </p>
              <ul className="condition-note">
                <li>Provisions eaten: {expedition.cargo.provisionUnitsConsumed} · cargo {expedition.cargo.harvestUnits}/{expedition.cargo.carryCapacityUnits} units{expedition.cargo.lostUnits > 0 ? ` · ${expedition.cargo.lostUnits} left behind` : ""}</li>
                {expedition.taskCamp !== undefined ? (
                  <li>Task camp at {String(expedition.taskCamp.tileId)} ({expedition.taskCamp.reason.replace(/_/g, " ")}, used {expedition.taskCamp.usedDays}d, expires day {Number(expedition.taskCamp.expiresOnDay)}) — no stores, no claim</li>
                ) : null}
                {expedition.carriedObservations.length > 0 ? (
                  <li>Carrying home {expedition.carriedObservations.length} observation(s): {expedition.carriedObservations.map((o) => o.kind.replace(/_/g, " ")).join(", ")} (not band knowledge until return)</li>
                ) : null}
                {(expedition.signalAttempts ?? []).map((attempt) => (
                  <li key={attempt.id}>Smoke signal "{attempt.meaning.replace(/_/g, " ")}" on day {Number(attempt.day)} — {attempt.outcome.replace(/_/g, " ")}</li>
                ))}
                {expedition.riskEpisodeIds.length > 0 ? (
                  <li>Injury load {expedition.injuryLoad} from {expedition.riskEpisodeIds.length} risk episode(s)</li>
                ) : null}
              </ul>
            </article>
          );
        })
      )}

      {signals.length > 0 ? (
        <article className="practice-feedback-overview">
          <span className="practice-feedback-kicker">Smoke seen from camp (bounded meaning only)</span>
          <ul className="condition-note">
            {signals.map((signal) => (
              <li key={signal.id}>
                Day {Number(signal.day)}: {signal.distanceBand} column to the {signal.direction} — {signal.outcome.replace(/_/g, " ")}
                {signal.meaning !== undefined ? ` ("${signal.meaning.replace(/_/g, " ")}")` : ""}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {outcomes.length > 0 ? (
        <article className="practice-feedback-overview">
          <span className="practice-feedback-kicker">Recent journeys (bounded history)</span>
          <ul className="condition-note">
            {outcomes.map((outcome) => (
              <li key={outcome.id}>
                {outcome.taskKind.replace(/_/g, " ")} to {String(outcome.targetTileId)} ({outcome.distanceTiles} tiles, {outcome.totalDays}d,{" "}
                {outcome.partyWorkers} adults): <strong>{outcome.outcomeReason.replace(/_/g, " ")}</strong>
                {outcome.deliveredHarvestUnits > 0 ? ` — brought home ${outcome.deliveredHarvestUnits} units` : ""}
                {outcome.usedTaskCamp ? <Chip>task camp</Chip> : null}
                {(outcome.observations ?? []).length > 0 ? ` · returned knowledge: ${(outcome.observations ?? []).map((o) => o.kind.replace(/_/g, " ")).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      {world === null ? null : null}
    </section>
  );
}
