import { useMemo } from "react";

import type { Band } from "../../sim/agents/types";
import type { StepMode, TickNumber } from "../../sim/core/types";
import type { WorldState } from "../../sim/world/types";

import { deriveBandLifeSummary } from "../bandLife";
import { groupSkills } from "../bandSummary";
import { Activity } from "./Activity";
import { MemoryReferentSection } from "./MemoryReferents";
import { CauseCard, Chip, CollapsibleGroup, SectionHeading } from "./parts";
import {
  hardshipOutcomeLabel,
  moveCauseLabel,
  moveKindLabel,
  moveStatusLabel,
} from "./translate";

/*
 * READABILITY-UI-ORGANIZATION-1 — "What are they doing right now, and how?"
 * Current movement state, whole-camp moves with their reasons in plain words,
 * work parties (trips), and the skills they bring to the work.
 */

type ResidentialMove = NonNullable<Band["recentResidentialMoveEvents"]>[number];

/* 1C — identical move rows ("shifted toward new country" three times) fold
 * into one row with a repeat count; the newest move represents the group. */
function groupMoves(moves: readonly ResidentialMove[]): readonly { readonly move: ResidentialMove; readonly count: number }[] {
  const groups = new Map<string, { move: ResidentialMove; count: number }>();

  for (const move of moves) {
    const key = `${move.moveKind}:${move.status}:${move.cause}`;
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { move, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  return [...groups.values()];
}
export function Doing({
  band,
  world,
  selectedActivityTripId,
  stepMode,
  currentTick,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly selectedActivityTripId: string | null;
  readonly stepMode: StepMode;
  readonly currentTick: TickNumber;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const life = useMemo(
    () => deriveBandLifeSummary(band, currentTick, stepMode),
    [band, currentTick, stepMode],
  );
  const skills = groupSkills(band);
  const moves = band.recentResidentialMoveEvents ?? [];

  return (
    <div className="bp-overview">
      <section className="bp-section">
        <SectionHeading icon="activity">Right now</SectionHeading>
        <div className="story-block">
          <strong>{life.activityLine}</strong>
          <p>{life.movementLine}</p>
          <p>{life.intentLine}</p>
        </div>
        {life.chips.length === 0 ? null : (
          <div className="band-life-chips">
            {life.chips.map((chip) => (
              <Chip key={`${chip.icon}-${chip.label}`} icon={chip.icon} tone={chip.tone} title={chip.title}>
                {chip.label}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <CauseCard
        title="Why they are doing this"
        because={[life.reasonLine]}
        note="Their own reasons — from memory, season, and pressure. Proof lives in Technical."
      />

      <MemoryReferentSection
        band={band}
        world={world}
        title="Remembered things shaping the work"
        icon="memory"
        tab="doing"
        kinds={["route", "crossing", "gear_material_issue", "food_patch", "weather_episode", "accident"]}
        limit={4}
        compact
        onOpenChronicle={onOpenChronicle}
      />

      {moves.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="move">Whole-camp moves</SectionHeading>
          <ol className="recent-events">
            {groupMoves(moves).slice(0, 3).map((group) => {
              const move = group.move;
              return (
                <li key={String(move.eventId)} className="recent-event">
                  <span className="recent-event-title">
                    {moveKindLabel(move.moveKind)} — {moveStatusLabel(move.status)}
                  </span>
                  <span className="recent-event-desc">
                    Because {moveCauseLabel(move.cause)}, over {Math.max(1, Math.round(move.distanceTiles))} tile
                    {Math.round(move.distanceTiles) === 1 ? "" : "s"} in about {Math.max(1, Math.round(move.durationDays))} day
                    {Math.round(move.durationDays) === 1 ? "" : "s"}.
                    {move.hardshipReason === undefined ? "" : ` The hard part: ${move.hardshipReason} — ${hardshipOutcomeLabel(move.hardshipOutcome)}.`}
                    {group.count > 1 ? ` The same kind of move repeated ${group.count} times recently.` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="bp-section">
        <SectionHeading icon="knowledge">Skills they work with</SectionHeading>
        <CollapsibleGroup title={`Show their skills (${skills.subsistence.length + skills.crafts.length} known)`}>
          <div className="skill-group">
            <span className="skill-group-label">Getting food</span>
            <div className="skill-row">
              {skills.subsistence.length === 0 ? (
                <span className="skill-empty">Nothing beyond everyday gathering yet</span>
              ) : (
                skills.subsistence.map((skill) => (
                  <Chip key={skill.id} icon={skill.icon} title={skill.tip}>
                    {skill.label}
                  </Chip>
                ))
              )}
            </div>
          </div>
          <div className="skill-group">
            <span className="skill-group-label">Crafts &amp; making</span>
            <div className="skill-row">
              {skills.crafts.length === 0 ? (
                <span className="skill-empty">No craft has taken hold yet</span>
              ) : (
                skills.crafts.map((skill) => (
                  <Chip key={skill.id} icon={skill.icon} title={skill.tip}>
                    {skill.label}
                  </Chip>
                ))
              )}
            </div>
          </div>
        </CollapsibleGroup>
      </section>

      <Activity band={band} selectedActivityTripId={selectedActivityTripId} stepMode={stepMode} />
    </div>
  );
}
