import type { Decision, DecisionArchiveSummary } from "./types";
import type { DecisionId } from "../core/types";

export const RECENT_DECISION_RECORD_LIMIT = 64;
export const RECENT_BAND_DECISION_HISTORY_LIMIT = 80;

export function createEmptyDecisionArchive(): DecisionArchiveSummary {
  return {
    totalDecisions: 0,
    totalStayDecisions: 0,
    totalMoveDecisions: 0,
    totalExploreDecisions: 0,
    totalNoOpDecisions: 0,
    totalProbeDecisions: 0,
    totalResourceScoutDecisions: 0,
    totalFrontierMoves: 0,
    recentDecisionLimit: RECENT_DECISION_RECORD_LIMIT,
    recentDecisionIds: [],
  };
}

export function recordDecisionArchive(
  archive: DecisionArchiveSummary,
  decision: Decision,
): DecisionArchiveSummary {
  const isMove = decision.action.type === "move_to_tile";
  const isExplore = decision.action.type === "explore_unknown_neighbor";
  const recentDecisionIds = [...archive.recentDecisionIds, decision.id].slice(-RECENT_DECISION_RECORD_LIMIT);

  return {
    totalDecisions: archive.totalDecisions + 1,
    totalStayDecisions: archive.totalStayDecisions + (decision.action.type === "stay" ? 1 : 0),
    totalMoveDecisions: archive.totalMoveDecisions + (isMove ? 1 : 0),
    totalExploreDecisions: archive.totalExploreDecisions + (isExplore ? 1 : 0),
    totalNoOpDecisions: archive.totalNoOpDecisions + (decision.action.type === "no_op" ? 1 : 0),
    totalProbeDecisions: archive.totalProbeDecisions + (decision.action.type === "logistical_probe" ? 1 : 0),
    totalResourceScoutDecisions: archive.totalResourceScoutDecisions + (decision.action.type === "resource_scout" ? 1 : 0),
    totalFrontierMoves: archive.totalFrontierMoves + (isMove || isExplore ? 1 : 0),
    recentDecisionLimit: RECENT_DECISION_RECORD_LIMIT,
    recentDecisionIds,
  };
}

export function appendRecentDecisionRecord(
  decisions: Readonly<Record<DecisionId, Decision>>,
  decision: Decision,
  archive?: DecisionArchiveSummary,
): Readonly<Record<DecisionId, Decision>> {
  // The retained set is bounded to RECENT_DECISION_RECORD_LIMIT, and on the hot
  // path the archive already carries the retained ids (recorded one step earlier
  // in advanceWorldOneSeason). Build the new record in a single direct-assignment
  // pass keyed by those ids — avoiding a full {...decisions} spread plus an
  // Object.fromEntries rebuild on every band decision — while preserving the exact
  // keys, values, and insertion order the previous two-pass form produced.
  const retainedIds = archive?.recentDecisionIds ??
    (Object.keys({ ...decisions, [decision.id]: decision }).slice(
      -RECENT_DECISION_RECORD_LIMIT,
    ) as unknown as readonly DecisionId[]);
  const retained: Record<DecisionId, Decision> = {};

  for (const id of retainedIds) {
    const retainedDecision = id === decision.id ? decision : decisions[id];

    if (retainedDecision !== undefined) {
      retained[id] = retainedDecision;
    }
  }

  return retained as Readonly<Record<DecisionId, Decision>>;
}
