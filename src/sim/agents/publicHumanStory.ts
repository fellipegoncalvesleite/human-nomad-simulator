import type { BandId } from "../core/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import { deriveAdaptiveHumanProfile } from "./adaptationBoundary";
import { deriveBandChronicle } from "./bandChronicle";
import { deriveBandIdentityProfile, type BandIdentityProfile } from "./bandIdentity";
import { deriveCampMovementProfile } from "./campMovement";
import { deriveCanonicalEvents, type CanonicalEvent } from "./eventSystem";
import { deriveSocialEcologicalDiffusionProfile, type SocialDiffusionItem, type SocialEcologicalContext } from "./socialEcologicalDiffusion";
import type {
  AdaptiveEvidenceRef,
  AdaptiveIdea,
  AdaptiveIdeaFamily,
  Band,
  CampMovementEvidenceRef,
  LocalCampShiftRecord,
  LocalRoutine,
  NewPlaceEstablishmentState,
  OldCampAnchorDecayRecord,
  PressureReliefCandidate,
  SolutionAttempt,
  StagnationEscapeRecord,
  TemporaryTaskCampRecord,
} from "./types";

export type PublicStoryCategory =
  | "internal_talk"
  | "outer_talk"
  | "event_story"
  | "idea_story"
  | "attempt_story"
  | "routine_story"
  | "camp_story"
  | "range_rotation_story"
  | "chronicle_title";

export type PublicStoryToneTier =
  | "grounded"
  | "colorful"
  | "rare_odd"
  | "dormant_conflict"
  | "technical_only";

export interface PublicStoryTemplate {
  readonly id: string;
  readonly category: PublicStoryCategory;
  readonly toneTier: PublicStoryToneTier;
  readonly requiredEvidence: readonly string[];
  readonly namingSlots: readonly string[];
  readonly fallback: string;
  readonly deterministicKey: string;
}

export interface PublicStorySourceRef {
  readonly sourceSystem: string;
  readonly sourceId: string;
  readonly label: string;
}

export interface PublicStoryItem {
  readonly id: string;
  readonly category: PublicStoryCategory;
  readonly toneTier: PublicStoryToneTier;
  readonly templateId: string;
  readonly title: string;
  readonly story: string;
  readonly status: string;
  readonly evidenceChips: readonly string[];
  readonly sourceRefs: readonly PublicStorySourceRef[];
  readonly sourceIds: readonly string[];
  readonly deterministicKey: string;
  readonly bandIdentityInfluenced: boolean;
  readonly concreteObjectNames: readonly string[];
  readonly concreteFoodNames: readonly string[];
  readonly fallbackGenericNameUsed: boolean;
}

export interface PublicHumanStoryTechnicalProof {
  readonly storyItemCount: number;
  readonly templatesUsed: readonly string[];
  readonly skippedTemplates: number;
  readonly categoryCounts: Readonly<Record<PublicStoryCategory, number>>;
  readonly toneTierCounts: Readonly<Record<PublicStoryToneTier, number>>;
  readonly concreteObjectNameCount: number;
  readonly concreteFoodNameCount: number;
  readonly fallbackGenericNameCount: number;
  readonly dormantConflictTemplates: number;
  readonly activeConflictEvents: number;
  readonly dormantConflictBehaviorInfluence: 0;
  readonly bandIdentityInfluencedStories: number;
  readonly skippedUnsupportedTemplates: number;
  readonly rawDebugLeakCount: number;
  readonly unsupportedFakeTermCount: number;
  readonly duplicatePhraseCount: number;
  readonly brokenSourceRefCount: number;
  readonly maxPayloadBytes: number;
  readonly maxStoriesProfile: number;
  readonly deterministicKeySamples: readonly string[];
  readonly sourceRefSamples: readonly string[];
  readonly capsHeld: boolean;
  readonly publicStorySelectionAffectsBehavior: false;
}

export interface PublicHumanStoryProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly items: readonly PublicStoryItem[];
  readonly internalTalks: readonly PublicStoryItem[];
  readonly outerTalks: readonly PublicStoryItem[];
  readonly eventStories: readonly PublicStoryItem[];
  readonly ideaStories: readonly PublicStoryItem[];
  readonly attemptStories: readonly PublicStoryItem[];
  readonly routineStories: readonly PublicStoryItem[];
  readonly campStories: readonly PublicStoryItem[];
  readonly rangeRotationStories: readonly PublicStoryItem[];
  readonly chronicleTitles: readonly PublicStoryItem[];
  readonly technicalProof: PublicHumanStoryTechnicalProof;
}

const MAX_STORIES_PER_PROFILE = 36;
const EVIDENCE_CHIP_CAP = 3;
const SOURCE_REF_CAP = 4;
const INTERNAL_TALK_CAP = 4;
const OUTER_TALK_CAP = 4;
const EVENT_STORY_CAP = 8;
const IDEA_STORY_CAP = 6;
const ATTEMPT_STORY_CAP = 6;
const ROUTINE_STORY_CAP = 5;
const CAMP_STORY_CAP = 7;
const RANGE_ROTATION_STORY_CAP = 5;
const CHRONICLE_TITLE_CAP = 5;

export const PUBLIC_STORY_TEMPLATES: readonly PublicStoryTemplate[] = [
  {
    id: "idea-carrying-split-load",
    category: "idea_story",
    toneTier: "grounded",
    requiredEvidence: ["adaptive_idea:carrying_logistics"],
    namingSlots: ["object"],
    fallback: "They are trying a lighter way to carry things.",
    deterministicKey: "idea:carrying",
  },
  {
    id: "idea-food-work-local",
    category: "idea_story",
    toneTier: "grounded",
    requiredEvidence: ["adaptive_idea:food_work"],
    namingSlots: ["food", "place"],
    fallback: "They are trying a nearby edible fallback.",
    deterministicKey: "idea:food",
  },
  {
    id: "idea-route-scout",
    category: "idea_story",
    toneTier: "grounded",
    requiredEvidence: ["adaptive_idea:route_crossing"],
    namingSlots: ["object", "place"],
    fallback: "They want to test the route before the whole band commits.",
    deterministicKey: "idea:route",
  },
  {
    id: "attempt-human-episode",
    category: "attempt_story",
    toneTier: "grounded",
    requiredEvidence: ["solution_attempt"],
    namingSlots: ["object", "food", "place"],
    fallback: "They tried the idea and learned only what this place could show.",
    deterministicKey: "attempt",
  },
  {
    id: "routine-local-limits",
    category: "routine_story",
    toneTier: "grounded",
    requiredEvidence: ["local_routine"],
    namingSlots: ["object", "food", "place"],
    fallback: "The routine works only where the same limits hold.",
    deterministicKey: "routine",
  },
  {
    id: "camp-establishment-human",
    category: "camp_story",
    toneTier: "grounded",
    requiredEvidence: ["camp_establishment"],
    namingSlots: ["place"],
    fallback: "They are trying to make this place familiar without making it permanent.",
    deterministicKey: "camp:establishment",
  },
  {
    id: "range-less-worn-riverbank",
    category: "range_rotation_story",
    toneTier: "grounded",
    requiredEvidence: ["pressure_relief_candidate"],
    namingSlots: ["place"],
    fallback: "They need a less-worn place, not a perfect one.",
    deterministicKey: "range:relief",
  },
  {
    id: "internal-talk-practical",
    category: "internal_talk",
    toneTier: "grounded",
    requiredEvidence: ["camp_or_idea_pressure"],
    namingSlots: ["object", "food", "place"],
    fallback: "People argued over the practical thing that had to be done next.",
    deterministicKey: "talk:internal",
  },
  {
    id: "internal-talk-camp-joke",
    category: "internal_talk",
    toneTier: "colorful",
    requiredEvidence: ["failed_attempt"],
    namingSlots: ["object"],
    fallback: "A bad idea became a small camp joke.",
    deterministicKey: "talk:internal:color",
  },
  {
    id: "internal-talk-rare-confusion",
    category: "internal_talk",
    toneTier: "rare_odd",
    requiredEvidence: ["failed_attempt", "deterministic_rare_gate"],
    namingSlots: ["object"],
    fallback: "A ridiculous argument delayed chores for a little while.",
    deterministicKey: "talk:internal:rare",
  },
  {
    id: "outer-talk-trace-copy",
    category: "outer_talk",
    toneTier: "grounded",
    requiredEvidence: ["social_diffusion"],
    namingSlots: ["object", "place"],
    fallback: "Another band's trace gave them a clue, but not the whole method.",
    deterministicKey: "talk:outer",
  },
  {
    id: "outer-talk-colorful-misread",
    category: "outer_talk",
    toneTier: "colorful",
    requiredEvidence: ["social_diffusion", "missing_tacit_steps"],
    namingSlots: ["object"],
    fallback: "A confident gesture did not explain how the trick actually worked.",
    deterministicKey: "talk:outer:color",
  },
  {
    id: "dormant-conflict-tense-standoff",
    category: "outer_talk",
    toneTier: "dormant_conflict",
    requiredEvidence: ["tense_contact", "future_conflict_system"],
    namingSlots: ["place"],
    fallback: "A tense meeting could become a future conflict hook, but it has no behavior effect now.",
    deterministicKey: "talk:outer:dormant",
  },
  {
    id: "event-human-grounded",
    category: "event_story",
    toneTier: "grounded",
    requiredEvidence: ["canonical_event"],
    namingSlots: ["object", "food", "place"],
    fallback: "A grounded event changed what the band remembers.",
    deterministicKey: "event",
  },
  {
    id: "chronicle-compact-title",
    category: "chronicle_title",
    toneTier: "grounded",
    requiredEvidence: ["canonical_event"],
    namingSlots: ["object", "food", "place"],
    fallback: "A compact title keeps one event readable in the Chronicle.",
    deterministicKey: "chronicle:title",
  },
  {
    id: "technical-proof-only",
    category: "event_story",
    toneTier: "technical_only",
    requiredEvidence: ["technical_ui"],
    namingSlots: [],
    fallback: "Technical proof stays out of the public story.",
    deterministicKey: "technical",
  },
];

interface StoryContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly currentTile?: Tile;
  readonly identity: BandIdentityProfile;
  readonly identityTone: IdentityTone;
}

type IdentityTone = "plain" | "cautious" | "desperate" | "social" | "care" | "daughter" | "stagnating" | "memory";

export function derivePublicHumanStoryProfile(world: WorldState, band: Band): PublicHumanStoryProfile {
  const context: StoryContext = {
    world,
    band,
    currentTile: getTile(world, band.position),
    identity: deriveBandIdentityProfile(world, band),
    identityTone: "plain",
  };
  const ctx: StoryContext = {
    ...context,
    identityTone: deriveIdentityTone(context),
  };
  const canonicalEvents = deriveCanonicalEvents(world, band).events;
  const adaptive = deriveAdaptiveHumanProfile(world, band);
  const movement = deriveCampMovementProfile(world, band);
  const social = deriveSocialEcologicalDiffusionProfile(world, band);
  const chronicle = deriveBandChronicle(world, band);
  const chronicleEventTitleItems = canonicalEvents
    .filter((event) => event.significance >= 0.52 || event.memoryScope !== "recent" || event.sourceSystem === "camp_movement_record")
    .slice(0, CHRONICLE_TITLE_CAP)
    .map((event) => makeChronicleTitleStory(ctx, event));
  const chronicleMajorTitleItems = chronicle.majorEvents
    .slice(0, Math.max(0, CHRONICLE_TITLE_CAP - chronicleEventTitleItems.length))
    .map((event, index) =>
      makeStoryItem({
        ctx,
        category: "chronicle_title",
        toneTier: "grounded",
        templateId: "chronicle-compact-title",
        localId: `chronicle-major:${index}:${stableKey(event.title)}`,
        title: concreteTitle(event.title, "The Remembered Change"),
        story: cleanPublicText(event.summary),
        status: "remembered",
        evidenceChips: ["Chronicle"],
        sourceRefs: [{ sourceSystem: "band_chronicle", sourceId: event.id, label: "Chronicle event" }],
        concreteObjectNames: [],
        concreteFoodNames: [],
        fallbackGenericNameUsed: false,
        bandIdentityInfluenced: false,
      }));

  const items = boundedUniqueItems([
    ...chronicleEventTitleItems,
    ...chronicleMajorTitleItems,
    ...canonicalEvents.slice(0, EVENT_STORY_CAP).map((event) => makeEventStory(ctx, event)),
    ...adaptive.ideas.slice(0, IDEA_STORY_CAP).map((idea) => makeIdeaStory(ctx, idea)),
    ...adaptive.attempts.slice(0, ATTEMPT_STORY_CAP).map((attempt) => makeAttemptStory(ctx, attempt)),
    ...adaptive.localRoutines.slice(0, ROUTINE_STORY_CAP).map((routine) => makeRoutineStory(ctx, routine)),
    ...makeCampStories(ctx, movement),
    ...makeRangeRotationStories(ctx, movement.rangeRotation.chosenCandidate, movement.rangeRotation.scoutProbeBridge, movement.rangeRotation.candidates, movement.rangeRotation.blockedReason),
    ...makeInternalTalks(ctx, adaptive.ideas, adaptive.attempts, movement.stagnationFlags),
    ...makeOuterTalks(ctx, social.diffusionItems, social.socialContexts),
  ]);
  const technicalProof = buildTechnicalProof(items);

  return {
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: world.time.year,
    items,
    internalTalks: items.filter((item) => item.category === "internal_talk"),
    outerTalks: items.filter((item) => item.category === "outer_talk"),
    eventStories: items.filter((item) => item.category === "event_story"),
    ideaStories: items.filter((item) => item.category === "idea_story"),
    attemptStories: items.filter((item) => item.category === "attempt_story"),
    routineStories: items.filter((item) => item.category === "routine_story"),
    campStories: items.filter((item) => item.category === "camp_story"),
    rangeRotationStories: items.filter((item) => item.category === "range_rotation_story"),
    chronicleTitles: items.filter((item) => item.category === "chronicle_title"),
    technicalProof,
  };
}

export function publicStoryForSource(
  profile: PublicHumanStoryProfile,
  sourceId: string,
  category?: PublicStoryCategory,
): PublicStoryItem | undefined {
  return profile.items.find((item) =>
    (category === undefined || item.category === category) &&
    item.sourceIds.includes(sourceId));
}

export function concreteObjectNameForFamily(family: AdaptiveIdeaFamily, key: string): string {
  switch (family) {
    case "carrying_logistics":
      return pickByKey(["carrying bundle", "hide wrap", "grass sling", "rough skin pouch"], key);
    case "food_work":
      return pickByKey(["digging stick", "dull scraper", "cutting stone", "bark tray"], key);
    case "route_crossing":
      return pickByKey(["crossing pole", "tying cord", "carrying frame", "heavy sharp stone"], key);
    case "camp_care":
      return pickByKey(["sleeping hide", "hide wrap", "branch barrier", "thorny brush pile"], key);
    case "fire_fuel":
      return pickByKey(["dry fuel bundle", "firebrand", "bark tray", "stone weight"], key);
    case "water_edge":
      return pickByKey(["reed bundle", "crossing pole", "grass sling", "bark tray"], key);
    case "social_copy":
      return pickByKey(["reed bundle", "carrying net", "tying cord", "cutting stone"], key);
  }
}

export function concreteFoodNameForTile(tile: Tile | undefined, key: string): string {
  if (tile === undefined) {
    return pickByKey(["bitter roots", "hard nuts", "seed heads", "river greens"], key);
  }
  if (tile.terrainKind === "wetlands" || tile.biomeKind === "marsh" || tile.isMarshChannel) {
    return pickByKey(["marsh tubers", "wetland shoots", "bitter roots", "river greens"], key);
  }
  if (tile.isRiverbank || tile.isFloodplain || tile.terrainKind === "river_valley") {
    return pickByKey(["sour river berries", "starchy tubers", "river greens", "small fish from the shallows"], key);
  }
  if (tile.isCoastal || tile.terrainKind === "coast") {
    return pickByKey(["coastal greens", "hard nuts", "bitter roots"], key);
  }
  if (tile.terrainKind === "forest" || tile.biomeKind === "temperate_forest" || tile.biomeKind === "boreal_forest") {
    return pickByKey(["hard nuts", "red berries", "bitter roots", "bitter leaves"], key);
  }
  if (tile.resourceProfile.wildGrainPotential > 0.48) {
    return pickByKey(["seed heads", "hard nuts", "bitter roots"], key);
  }
  return pickByKey(["bitter roots", "red berries", "seed heads", "river greens"], key);
}

function makeIdeaStory(ctx: StoryContext, idea: AdaptiveIdea): PublicStoryItem {
  const objectName = concreteObjectNameForFamily(idea.family, `${idea.id}:object`);
  const foodName = idea.family === "food_work" || idea.family === "water_edge"
    ? concreteFoodNameForTile(ctx.currentTile, idea.id)
    : undefined;
  const place = placePhrase(ctx.currentTile);
  const status = plainIdeaStatus(idea.status);
  const identity = identityLead(ctx, idea.family === "social_copy" ? "social" : idea.family === "camp_care" ? "care" : "idea");
  const story = ideaStoryText(idea, objectName, foodName, place, identity);
  const title = ideaTitle(idea, objectName, foodName);

  return makeStoryItem({
    ctx,
    category: "idea_story",
    toneTier: "grounded",
    templateId: templateForIdea(idea.family),
    localId: idea.id,
    title,
    story,
    status,
    evidenceChips: evidenceChipsFromAdaptive(idea.evidence),
    sourceRefs: [{ sourceSystem: "adaptive_human", sourceId: idea.id, label: "Idea" }],
    concreteObjectNames: [objectName],
    concreteFoodNames: foodName === undefined ? [] : [foodName],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: identity.length > 0,
  });
}

function makeAttemptStory(ctx: StoryContext, attempt: SolutionAttempt): PublicStoryItem {
  const objectName = concreteObjectNameForAttempt(attempt, `${attempt.id}:object`);
  const targetTile = getTile(ctx.world, attempt.targetTileId ?? attempt.placeTileId);
  const foodName = concreteFoodNameForTile(targetTile ?? ctx.currentTile, attempt.id);
  const place = placePhrase(targetTile ?? ctx.currentTile);
  const title = attemptTitle(attempt, objectName, foodName);
  const story = attemptStoryText(attempt, objectName, foodName, place);

  return makeStoryItem({
    ctx,
    category: "attempt_story",
    toneTier: attempt.outcome === "clear_failure" || attempt.outcome === "dead_end" ? "colorful" : "grounded",
    templateId: "attempt-human-episode",
    localId: attempt.id,
    title,
    story,
    status: plainAttemptStatus(attempt),
    evidenceChips: compactChips([
      attempt.participants === "whole_band" ? "Whole camp" : "Small party",
      attempt.costPaid === "none" ? undefined : `${attempt.costPaid} cost`,
      attempt.riskRealized === "none" ? undefined : `${attempt.riskRealized} risk`,
    ]),
    sourceRefs: [{ sourceSystem: "adaptive_human", sourceId: attempt.id, label: "Attempt" }],
    concreteObjectNames: [objectName],
    concreteFoodNames: attempt.attemptType === "fallback_work_shift" || attempt.attemptType === "try_local_solution" ? [foodName] : [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: false,
  });
}

function makeRoutineStory(ctx: StoryContext, routine: LocalRoutine): PublicStoryItem {
  const objectName = concreteObjectNameForFamily(routine.domain, `${routine.id}:object`);
  const foodName = routine.domain === "food_work" || routine.domain === "water_edge"
    ? concreteFoodNameForTile(ctx.currentTile, routine.id)
    : undefined;
  const title = routineTitle(routine, objectName, foodName);
  const story = routineStoryText(routine, objectName, foodName);

  return makeStoryItem({
    ctx,
    category: "routine_story",
    toneTier: "grounded",
    templateId: "routine-local-limits",
    localId: routine.id,
    title,
    story,
    status: routine.confidenceBand === "locally_reliable" ? "became routine" : "still local",
    evidenceChips: compactChips([
      `${routine.successfulFeedbackCount} useful`,
      routine.failureCount > 0 ? `${routine.failureCount} failed` : undefined,
      routine.carrierBasis,
    ]),
    sourceRefs: [{ sourceSystem: "adaptive_human", sourceId: routine.id, label: "Local routine" }],
    concreteObjectNames: [objectName],
    concreteFoodNames: foodName === undefined ? [] : [foodName],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: false,
  });
}

function makeCampStories(ctx: StoryContext, movement: ReturnType<typeof deriveCampMovementProfile>): readonly PublicStoryItem[] {
  const stories: PublicStoryItem[] = [];
  if (movement.currentEstablishment !== undefined) {
    stories.push(makeEstablishmentStory(ctx, movement.currentEstablishment));
  }
  stories.push(...movement.recentLocalShifts.slice(0, 2).map((shift) => makeLocalShiftStory(ctx, shift)));
  stories.push(...movement.temporaryTaskCamps.slice(0, 2).map((camp) => makeTemporaryCampStory(ctx, camp)));
  stories.push(...movement.stagnationEscapes.slice(0, 2).map((escape) => makeEscapeStory(ctx, escape)));
  stories.push(...movement.oldCampDecay.slice(0, 2).map((decay) => makeOldCampStory(ctx, decay)));
  return stories.slice(0, CAMP_STORY_CAP);
}

function makeEstablishmentStory(ctx: StoryContext, establishment: NewPlaceEstablishmentState): PublicStoryItem {
  const tile = getTile(ctx.world, establishment.tileId);
  const place = placePhrase(tile ?? ctx.currentTile);
  const story = establishment.sameClusterShift || establishment.establishmentCarriedOver
    ? `They shifted within the same familiar camp country. The ${place} is still being tested, but some old knowledge carried with them.`
    : establishment.resetReason === undefined
      ? `They are trying to make the ${place} familiar. It is a working camp situation, not a lasting home.`
      : `They are trying to make the ${place} familiar again after ${cleanPublicText(establishment.resetReason)}.`;

  return makeStoryItem({
    ctx,
    category: "camp_story",
    toneTier: "grounded",
    templateId: "camp-establishment-human",
    localId: establishment.id,
    title: establishment.sameClusterShift ? "The Familiar Camp Shift" : "The New Water Hold",
    story,
    status: plainEstablishmentStatus(establishment),
    evidenceChips: compactChips([
      establishment.sameClusterShift ? "Same local cluster" : "New camp test",
      establishment.establishmentCarriedOver ? "Familiarity carried" : undefined,
      establishment.blockedReasons[0],
    ]),
    sourceRefs: [{ sourceSystem: "camp_movement", sourceId: establishment.id, label: "Establishment" }],
    concreteObjectNames: [],
    concreteFoodNames: [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: establishment.sameClusterShift,
  });
}

function makeLocalShiftStory(ctx: StoryContext, shift: LocalCampShiftRecord): PublicStoryItem {
  const target = getTile(ctx.world, shift.toTileId);
  const place = placePhrase(target ?? ctx.currentTile);
  return makeStoryItem({
    ctx,
    category: "camp_story",
    toneTier: "grounded",
    templateId: "camp-establishment-human",
    localId: shift.id,
    title: target !== undefined && isWetPlace(target) ? "The Wet Camp Shift" : "The Tired Camp Shift",
    story: `They moved the sleeping place toward the ${place} instead of leaving the whole country. The result was ${plainOutcome(shift.outcome)}.`,
    status: plainOutcome(shift.outcome),
    evidenceChips: compactChips([shift.distance <= 1 ? "Very near" : "Nearby", "Camp shift"]),
    sourceRefs: [{ sourceSystem: "camp_movement", sourceId: shift.id, label: "Local shift" }],
    concreteObjectNames: [],
    concreteFoodNames: [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: false,
  });
}

function makeTemporaryCampStory(ctx: StoryContext, camp: TemporaryTaskCampRecord): PublicStoryItem {
  const target = getTile(ctx.world, camp.targetTileId);
  const place = placePhrase(target ?? ctx.currentTile);
  const objectName = camp.purpose === "crossing_prep" ? "crossing pole" : camp.purpose === "food_work" ? "digging stick" : "carrying bundle";
  return makeStoryItem({
    ctx,
    category: "camp_story",
    toneTier: "grounded",
    templateId: "camp-establishment-human",
    localId: camp.id,
    title: camp.purpose === "crossing_prep" ? "The Temporary Ford Camp" : "The Task Camp Test",
    story: `A small camp near the ${place} let them test work with a ${objectName} without dragging everyone through it.`,
    status: camp.status === "active" ? "being used" : camp.status,
    evidenceChips: compactChips(["Temporary", camp.purpose.replace(/_/g, " ")]),
    sourceRefs: [{ sourceSystem: "camp_movement", sourceId: camp.id, label: "Temporary camp" }],
    concreteObjectNames: [objectName],
    concreteFoodNames: [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: false,
  });
}

function makeEscapeStory(ctx: StoryContext, escape: StagnationEscapeRecord): PublicStoryItem {
  const target = escape.targetTileId === undefined ? undefined : getTile(ctx.world, escape.targetTileId);
  const place = placePhrase(target ?? ctx.currentTile);
  const story = escape.status === "blocked"
    ? `They wanted a way out, but no safe target held together. The worry stayed named, not acted out.`
    : escape.response === "pressure_relief_move"
      ? `They tried a less-worn ${place}. It was not richer country, only a break from the old ground.`
      : escape.response === "scout_probe"
        ? `A small party checked the ${place} before the whole band moved.`
        : `They tried to answer the stuck camp problem near the ${place}.`;
  return makeStoryItem({
    ctx,
    category: "camp_story",
    toneTier: "grounded",
    templateId: "camp-establishment-human",
    localId: escape.id,
    title: escape.status === "blocked" ? "The Blocked Escape Talk" : "The Stuck Camp Answer",
    story,
    status: escape.status === "blocked" ? "blocked" : "tried",
    evidenceChips: compactChips([
      escape.targetTileId === undefined ? "No named target" : "Target named",
      escape.blockedReasons[0],
    ]),
    sourceRefs: [{ sourceSystem: "camp_movement", sourceId: escape.id, label: "Escape response" }],
    concreteObjectNames: [],
    concreteFoodNames: [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: ctx.identityTone === "stagnating",
  });
}

function makeOldCampStory(ctx: StoryContext, decay: OldCampAnchorDecayRecord): PublicStoryItem {
  return makeStoryItem({
    ctx,
    category: "camp_story",
    toneTier: "grounded",
    templateId: "camp-establishment-human",
    localId: decay.id,
    title: "Leaving the Old Camp",
    story: `The old camp still pulled at them, but recent returns weakened that pull. The old place can matter again later if it proves useful.`,
    status: "old pull weaker",
    evidenceChips: compactChips(["Old camp", cleanPublicText(decay.reason)]),
    sourceRefs: [{ sourceSystem: "camp_movement", sourceId: decay.id, label: "Old camp pull" }],
    concreteObjectNames: [],
    concreteFoodNames: [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: true,
  });
}

function makeRangeRotationStories(
  ctx: StoryContext,
  chosen: PressureReliefCandidate | undefined,
  scout: PressureReliefCandidate | undefined,
  candidates: readonly PressureReliefCandidate[],
  blockedReason: string | undefined,
): readonly PublicStoryItem[] {
  const stories: PublicStoryItem[] = [];
  if (chosen !== undefined) {
    stories.push(makePressureReliefCandidateStory(ctx, chosen, true));
  }
  if (scout !== undefined && scout.id !== chosen?.id) {
    stories.push(makePressureReliefCandidateStory(ctx, scout, false));
  }
  for (const candidate of candidates) {
    if (stories.length >= RANGE_ROTATION_STORY_CAP - (blockedReason === undefined ? 0 : 1)) {
      break;
    }
    if (candidate.id !== chosen?.id && candidate.id !== scout?.id) {
      stories.push(makePressureReliefCandidateStory(ctx, candidate, false));
    }
  }
  if (blockedReason !== undefined) {
    stories.push(makeStoryItem({
      ctx,
      category: "range_rotation_story",
      toneTier: "grounded",
      templateId: "range-less-worn-riverbank",
      localId: `range-blocked:${stableKey(blockedReason)}`,
      title: "No Good Relief Place",
      story: `They wanted to leave the worn sleeping ground, but every known option failed for a practical reason: ${cleanPublicText(blockedReason)}.`,
      status: "blocked",
      evidenceChips: ["Blocked"],
      sourceRefs: [{ sourceSystem: "camp_movement", sourceId: `range-blocked:${stableKey(blockedReason)}`, label: "Range rotation" }],
      concreteObjectNames: [],
      concreteFoodNames: [],
      fallbackGenericNameUsed: false,
      bandIdentityInfluenced: ctx.identityTone === "cautious" || ctx.identityTone === "stagnating",
    }));
  }
  return stories.slice(0, RANGE_ROTATION_STORY_CAP);
}

function makePressureReliefCandidateStory(ctx: StoryContext, candidate: PressureReliefCandidate, chosen: boolean): PublicStoryItem {
  const tile = getTile(ctx.world, candidate.tileId);
  const place = placePhrase(tile ?? ctx.currentTile);
  const title = candidate.actionStrategy === "scout_probe"
    ? "The Less-Worn Edge Scout"
    : candidate.sameRiverCountry
      ? "The Less-Worn Riverbank"
      : "The Less-Worn Camp Edge";
  const story = candidate.status === "blocked"
    ? `The ${place} looked like possible relief, but ${cleanPublicText(candidate.blockedReason ?? candidate.reasonLabel)}.`
    : candidate.actionStrategy === "scout_probe"
      ? `A scout group checked the less-used ${place}. The place was plausible, but not known well enough for everyone yet.`
      : `They did not abandon the river country. They moved toward a ${place} that was good enough and less trampled.`;

  return makeStoryItem({
    ctx,
    category: "range_rotation_story",
    toneTier: "grounded",
    templateId: "range-less-worn-riverbank",
    localId: candidate.id,
    title,
    story,
    status: chosen ? "chosen" : candidate.status === "blocked" ? "blocked" : candidate.actionStrategy === "scout_probe" ? "scouted" : "considered",
    evidenceChips: compactChips([
      candidate.sameRiverCountry ? "River kept in reach" : "Familiar country",
      candidate.goodEnoughRelief ? "Good enough relief" : "Not enough relief",
      candidate.betterThanCurrent ? "Somewhat better" : "Not richer, fresher",
    ]),
    sourceRefs: [{ sourceSystem: "camp_movement", sourceId: candidate.id, label: "Pressure relief candidate" }],
    concreteObjectNames: [],
    concreteFoodNames: [],
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: candidate.sameRiverCountry || ctx.identityTone === "stagnating",
  });
}

function makeInternalTalks(
  ctx: StoryContext,
  ideas: readonly AdaptiveIdea[],
  attempts: readonly SolutionAttempt[],
  stagnationFlags: readonly string[],
): readonly PublicStoryItem[] {
  const talks: PublicStoryItem[] = [];
  const primaryIdea = ideas[0];
  if (primaryIdea !== undefined) {
    const objectName = concreteObjectNameForFamily(primaryIdea.family, `${primaryIdea.id}:talk`);
    const foodName = primaryIdea.family === "food_work" ? concreteFoodNameForTile(ctx.currentTile, primaryIdea.id) : undefined;
    const base = internalTalkText(primaryIdea, objectName, foodName, placePhrase(ctx.currentTile));
    talks.push(makeStoryItem({
      ctx,
      category: "internal_talk",
      toneTier: "grounded",
      templateId: "internal-talk-practical",
      localId: `internal:${primaryIdea.id}`,
      title: internalTalkTitle(primaryIdea, objectName, foodName),
      story: `${identityLead(ctx, "talk")}${identityLead(ctx, "talk").length === 0 ? base : lowerFirst(base)}`,
      status: "argued",
      evidenceChips: evidenceChipsFromAdaptive(primaryIdea.evidence),
      sourceRefs: [{ sourceSystem: "adaptive_human", sourceId: primaryIdea.id, label: "Internal talk" }],
      concreteObjectNames: [objectName],
      concreteFoodNames: foodName === undefined ? [] : [foodName],
      fallbackGenericNameUsed: false,
      bandIdentityInfluenced: ctx.identityTone !== "plain",
    }));
  }
  const failedAttempt = attempts.find((attempt) => attempt.outcome === "clear_failure" || attempt.outcome === "dead_end" || attempt.outcome === "false_confidence");
  if (failedAttempt !== undefined) {
    const objectName = concreteObjectNameForAttempt(failedAttempt, `${failedAttempt.id}:joke`);
    talks.push(makeStoryItem({
      ctx,
      category: "internal_talk",
      toneTier: "colorful",
      templateId: "internal-talk-camp-joke",
      localId: `internal-joke:${failedAttempt.id}`,
      title: "The Bad Bundle Joke",
      story: `The failed ${objectName} did not vanish from memory. People mocked it while still arguing over whether the idea was worth trying again.`,
      status: "became camp talk",
      evidenceChips: compactChips(["Failed try", objectName]),
      sourceRefs: [{ sourceSystem: "adaptive_human", sourceId: failedAttempt.id, label: "Failed attempt" }],
      concreteObjectNames: [objectName],
      concreteFoodNames: [],
      fallbackGenericNameUsed: false,
      bandIdentityInfluenced: false,
    }));
    if (rareGate(`${ctx.band.id}:${failedAttempt.id}:rare`, 2)) {
      talks.push(makeStoryItem({
        ctx,
        category: "internal_talk",
        toneTier: "rare_odd",
        templateId: "internal-talk-rare-confusion",
        localId: `internal-rare:${failedAttempt.id}`,
        title: "The Shiny Stone Delay",
        story: `A ridiculous argument over a shiny stone delayed chores, then everyone still had to fix the ${objectName}.`,
        status: "rare oddity",
        evidenceChips: compactChips(["Harmless oddity", objectName]),
        sourceRefs: [{ sourceSystem: "adaptive_human", sourceId: failedAttempt.id, label: "Failed attempt" }],
        concreteObjectNames: [objectName],
        concreteFoodNames: [],
        fallbackGenericNameUsed: false,
        bandIdentityInfluenced: false,
      }));
    }
  }
  if (stagnationFlags.length > 0) {
    talks.push(makeStoryItem({
      ctx,
      category: "internal_talk",
      toneTier: "grounded",
      templateId: "internal-talk-practical",
      localId: `internal-stagnation:${stableKey(stagnationFlags.join("|"))}`,
      title: "The Wet Old Camp Argument",
      story: `Some wanted the known camp because its dangers were familiar. Others wanted a less-worn sleeping place before another poor return.`,
      status: "unsettled",
      evidenceChips: compactChips(stagnationFlags.slice(0, 2)),
      sourceRefs: [{ sourceSystem: "camp_movement", sourceId: `stagnation:${stableKey(stagnationFlags.join("|"))}`, label: "Stagnation talk" }],
      concreteObjectNames: [],
      concreteFoodNames: [],
      fallbackGenericNameUsed: false,
      bandIdentityInfluenced: true,
    }));
  }
  return talks.slice(0, INTERNAL_TALK_CAP);
}

function makeOuterTalks(
  ctx: StoryContext,
  items: readonly SocialDiffusionItem[],
  contexts: readonly SocialEcologicalContext[],
): readonly PublicStoryItem[] {
  const talks: PublicStoryItem[] = [];
  for (const item of items.slice(0, OUTER_TALK_CAP)) {
    const objectName = objectForSocialItem(item, item.id);
    const title = item.trustFilter === "tense_contact" ? "The Stranger Warning" : item.status === "partial_copy" ? "The Copied Carry-Net" : "The Other Camp Clue";
    const story = outerTalkText(item, objectName, placePhrase(ctx.currentTile));
    talks.push(makeStoryItem({
      ctx,
      category: "outer_talk",
      toneTier: item.risks.includes("missing_tacit_steps") ? "colorful" : "grounded",
      templateId: item.risks.includes("missing_tacit_steps") ? "outer-talk-colorful-misread" : "outer-talk-trace-copy",
      localId: `outer:${item.id}`,
      title,
      story,
      status: plainSocialStatus(item.status),
      evidenceChips: compactChips([
        item.visibility.replace(/_/g, " "),
        item.trustFilter.replace(/_/g, " "),
        item.risks[0]?.replace(/_/g, " "),
      ]),
      sourceRefs: [{ sourceSystem: "social_ecological_diffusion", sourceId: item.id, label: "Outer talk" }],
      concreteObjectNames: [objectName],
      concreteFoodNames: item.domain === "food_work" ? [concreteFoodNameForTile(ctx.currentTile, item.id)] : [],
      fallbackGenericNameUsed: false,
      bandIdentityInfluenced: ctx.identityTone === "social" || item.channel === "parent_daughter",
    }));
  }
  for (const context of contexts.slice(0, Math.max(0, OUTER_TALK_CAP - talks.length))) {
    talks.push(makeStoryItem({
      ctx,
      category: "outer_talk",
      toneTier: context.trustFilter === "tense_contact" ? "grounded" : "colorful",
      templateId: "outer-talk-trace-copy",
      localId: `outer-context:${context.id}`,
      title: context.trustFilter === "tense_contact" ? "The Tense Water Meeting" : "The Shared Water Clue",
      story: `Another group's trace near the ${placePhrase(ctx.currentTile)} made the place socially visible, but not simple to trust.`,
      status: context.trustFilter === "tense_contact" ? "tense" : "uncertain",
      evidenceChips: compactChips([context.contactBasis, context.relation, context.sharedContextLine]),
      sourceRefs: [{ sourceSystem: "social_ecological_diffusion", sourceId: context.id, label: "Outer context" }],
      concreteObjectNames: [],
      concreteFoodNames: [],
      fallbackGenericNameUsed: false,
      bandIdentityInfluenced: ctx.identityTone === "social",
    }));
  }
  return talks.slice(0, OUTER_TALK_CAP);
}

function makeEventStory(ctx: StoryContext, event: CanonicalEvent): PublicStoryItem {
  const title = eventTitle(ctx, event);
  const story = eventStoryText(ctx, event);
  return makeStoryItem({
    ctx,
    category: "event_story",
    toneTier: "grounded",
    templateId: "event-human-grounded",
    localId: event.id,
    title,
    story,
    status: event.livedStatus === "inherited_not_personally_lived" ? "inherited" : event.memoryScope === "durable" ? "remembered" : "recent",
    evidenceChips: event.evidenceChips.slice(0, EVIDENCE_CHIP_CAP).map((chip) => cleanEvidenceChip(chip.label)),
    sourceRefs: [{ sourceSystem: "event_system", sourceId: event.id, label: "Event" }],
    concreteObjectNames: concreteObjectsForEvent(ctx, event),
    concreteFoodNames: concreteFoodsForEvent(ctx, event),
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: ctx.identityTone !== "plain" && (event.family === "route_crossing" || event.family === "movement_place" || event.family === "contact_social"),
  });
}

function makeChronicleTitleStory(ctx: StoryContext, event: CanonicalEvent): PublicStoryItem {
  return makeStoryItem({
    ctx,
    category: "chronicle_title",
    toneTier: "grounded",
    templateId: "chronicle-compact-title",
    localId: `chronicle:${event.id}`,
    title: eventTitle(ctx, event),
    story: eventStoryText(ctx, event),
    status: event.memoryScope === "recent" ? "recent" : "long memory",
    evidenceChips: event.evidenceChips.slice(0, 2).map((chip) => cleanEvidenceChip(chip.label)),
    sourceRefs: [{ sourceSystem: "event_system", sourceId: event.id, label: "Chronicle title" }],
    concreteObjectNames: concreteObjectsForEvent(ctx, event),
    concreteFoodNames: concreteFoodsForEvent(ctx, event),
    fallbackGenericNameUsed: false,
    bandIdentityInfluenced: false,
  });
}

function makeStoryItem(input: {
  readonly ctx: StoryContext;
  readonly category: PublicStoryCategory;
  readonly toneTier: PublicStoryToneTier;
  readonly templateId: string;
  readonly localId: string;
  readonly title: string;
  readonly story: string;
  readonly status: string;
  readonly evidenceChips: readonly string[];
  readonly sourceRefs: readonly PublicStorySourceRef[];
  readonly concreteObjectNames: readonly string[];
  readonly concreteFoodNames: readonly string[];
  readonly fallbackGenericNameUsed: boolean;
  readonly bandIdentityInfluenced: boolean;
}): PublicStoryItem {
  const sourceRefs = input.sourceRefs
    .filter((ref) => ref.sourceId.length > 0)
    .slice(0, SOURCE_REF_CAP);
  const deterministicKey = `${String(input.ctx.band.id)}:${String(input.ctx.world.time.tick)}:${input.category}:${input.templateId}:${input.localId}`;
  return {
    id: `public-story:${stableKey(deterministicKey)}`,
    category: input.category,
    toneTier: input.toneTier,
    templateId: input.templateId,
    title: cleanPublicText(input.title),
    story: cleanPublicText(input.story),
    status: cleanPublicText(input.status),
    evidenceChips: compactChips(input.evidenceChips.map(cleanEvidenceChip)),
    sourceRefs,
    sourceIds: sourceRefs.map((ref) => ref.sourceId),
    deterministicKey,
    bandIdentityInfluenced: input.bandIdentityInfluenced,
    concreteObjectNames: uniqueStrings(input.concreteObjectNames.map(cleanPublicText)),
    concreteFoodNames: uniqueStrings(input.concreteFoodNames.map(cleanPublicText)),
    fallbackGenericNameUsed: input.fallbackGenericNameUsed,
  };
}

function buildTechnicalProof(items: readonly PublicStoryItem[]): PublicHumanStoryTechnicalProof {
  const usedTemplates = uniqueStrings(items.map((item) => item.templateId));
  const text = items.flatMap((item) => [item.title, item.story, item.status, ...item.evidenceChips]).join("\n");
  const rawDebugLeakCount = countMatches(text, /\b(?:material compatibility|feedback quality|local-only routine|resource context|tool item|food resource|camp object|stagnation escape target integrity|camp movement substrate|good_enough_relief|pressureReliefScore|target integrity|sourceSystem|confidence \d|score delta|behavior delta|adaptive loop|diffusion hook|missing-method risk)\b/gi);
  const unsupportedFakeTermCount = countMatches(text, /\b(?:wolf attack|axe|torch|pottery|woven basket|bow|boat|agriculture|domestication|village|chief|priest|warfare|war\b|trade\b|law\b|border|property|marriage|divine|religion|myth|taboo|enemy tribe|battle|raid|blood feud)\b/gi);
  const duplicatePhraseCount = duplicateStoryPhraseCount(items.filter((item) => item.category !== "chronicle_title"));
  const brokenSourceRefCount = items.flatMap((item) => item.sourceRefs).filter((ref) => ref.sourceId.length === 0).length;
  const maxPayloadBytes = JSON.stringify(items).length;
  const toneTierCounts = countByFixed(items.map((item) => item.toneTier), TONE_TIERS);
  const categoryCounts = countByFixed(items.map((item) => item.category), CATEGORIES);

  return {
    storyItemCount: items.length,
    templatesUsed: usedTemplates,
    skippedTemplates: Math.max(0, PUBLIC_STORY_TEMPLATES.length - usedTemplates.length),
    categoryCounts,
    toneTierCounts,
    concreteObjectNameCount: sumNumbers(items.map((item) => item.concreteObjectNames.length)),
    concreteFoodNameCount: sumNumbers(items.map((item) => item.concreteFoodNames.length)),
    fallbackGenericNameCount: items.filter((item) => item.fallbackGenericNameUsed).length,
    dormantConflictTemplates: PUBLIC_STORY_TEMPLATES.filter((template) => template.toneTier === "dormant_conflict").length,
    activeConflictEvents: 0,
    dormantConflictBehaviorInfluence: 0,
    bandIdentityInfluencedStories: items.filter((item) => item.bandIdentityInfluenced).length,
    skippedUnsupportedTemplates: PUBLIC_STORY_TEMPLATES.filter((template) => template.toneTier === "technical_only" || template.toneTier === "dormant_conflict").length,
    rawDebugLeakCount,
    unsupportedFakeTermCount,
    duplicatePhraseCount,
    brokenSourceRefCount,
    maxPayloadBytes,
    maxStoriesProfile: MAX_STORIES_PER_PROFILE,
    deterministicKeySamples: items.slice(0, 8).map((item) => item.deterministicKey),
    sourceRefSamples: items.flatMap((item) => item.sourceRefs.map((ref) => `${ref.sourceSystem}:${ref.sourceId}`)).slice(0, 10),
    capsHeld: items.length <= MAX_STORIES_PER_PROFILE &&
      items.every((item) => item.evidenceChips.length <= EVIDENCE_CHIP_CAP && item.sourceRefs.length <= SOURCE_REF_CAP),
    publicStorySelectionAffectsBehavior: false,
  };
}

const CATEGORIES: readonly PublicStoryCategory[] = [
  "internal_talk",
  "outer_talk",
  "event_story",
  "idea_story",
  "attempt_story",
  "routine_story",
  "camp_story",
  "range_rotation_story",
  "chronicle_title",
];

const TONE_TIERS: readonly PublicStoryToneTier[] = [
  "grounded",
  "colorful",
  "rare_odd",
  "dormant_conflict",
  "technical_only",
];

function boundedUniqueItems(items: readonly PublicStoryItem[]): readonly PublicStoryItem[] {
  const seen = new Set<string>();
  const result: PublicStoryItem[] = [];
  const categoryCounts = new Map<PublicStoryCategory, number>();

  for (const category of CATEGORIES) {
    const item = items.find((candidate) => candidate.category === category);
    if (item !== undefined) {
      addBoundedStoryItem(item, seen, result, categoryCounts);
    }
  }

  for (const item of items) {
    addBoundedStoryItem(item, seen, result, categoryCounts);
    if (result.length >= MAX_STORIES_PER_PROFILE) {
      break;
    }
  }
  return result;
}

function addBoundedStoryItem(
  item: PublicStoryItem,
  seen: Set<string>,
  result: PublicStoryItem[],
  categoryCounts: Map<PublicStoryCategory, number>,
): void {
  if (result.length >= MAX_STORIES_PER_PROFILE) {
    return;
  }
  if (seen.has(item.id) || item.toneTier === "technical_only" || item.toneTier === "dormant_conflict") {
    return;
  }
    const categoryCap = capForCategory(item.category);
    const current = categoryCounts.get(item.category) ?? 0;
    if (current >= categoryCap) {
    return;
    }
    seen.add(item.id);
    categoryCounts.set(item.category, current + 1);
    result.push(item);
}

function capForCategory(category: PublicStoryCategory): number {
  switch (category) {
    case "internal_talk": return INTERNAL_TALK_CAP;
    case "outer_talk": return OUTER_TALK_CAP;
    case "event_story": return EVENT_STORY_CAP;
    case "idea_story": return IDEA_STORY_CAP;
    case "attempt_story": return ATTEMPT_STORY_CAP;
    case "routine_story": return ROUTINE_STORY_CAP;
    case "camp_story": return CAMP_STORY_CAP;
    case "range_rotation_story": return RANGE_ROTATION_STORY_CAP;
    case "chronicle_title": return CHRONICLE_TITLE_CAP;
  }
}

function deriveIdentityTone(ctx: Omit<StoryContext, "identityTone">): IdentityTone {
  if (ctx.band.parentBandId !== undefined) {
    return "daughter";
  }
  if ((ctx.band.pressureState?.netMovePressure ?? 0) > 0.62 || (ctx.band.viability?.extinctionRisk ?? 0) > 0.25) {
    return "desperate";
  }
  if ((ctx.band.campMovement?.stagnationFlags.length ?? 0) > 0) {
    return "stagnating";
  }
  const dimensions = ctx.identity.dimensionsPresent;
  if (dimensions.includes("risk_memory")) {
    return "cautious";
  }
  if (dimensions.includes("social_demographic")) {
    return "care";
  }
  if (dimensions.includes("familiar_country")) {
    return "memory";
  }
  if (dimensions.includes("mobility_style")) {
    return "cautious";
  }
  return "plain";
}

function identityLead(ctx: StoryContext, kind: "idea" | "talk" | "care" | "social"): string {
  switch (ctx.identityTone) {
    case "cautious":
      return kind === "talk" ? "Old warnings made the argument sharper as " : "Because old danger mattered, ";
    case "desperate":
      return "With pressure building, ";
    case "social":
      return "Because other bands' traces mattered here, ";
    case "care":
      return "With tired dependents close by, ";
    case "daughter":
      return "Carrying parent memory but not parent confidence, ";
    case "stagnating":
      return "With the old camp still pulling at them, ";
    case "memory":
      return "Because familiar country mattered, ";
    case "plain":
      return "";
  }
}

function ideaStoryText(idea: AdaptiveIdea, objectName: string, foodName: string | undefined, place: string, identity: string): string {
  switch (idea.family) {
    case "carrying_logistics":
      return `${identity}they are trying to split the load before the hard part, keeping the ${objectName} light enough to survive the crossing.`;
    case "food_work":
      return `${identity}a few foragers want to try ${foodName ?? "bitter roots"} near the ${place} instead of walking back to the failing patch.`;
    case "route_crossing":
      return `${identity}scouts want to test the route with a ${objectName} before the whole band follows with children and heavy loads.`;
    case "camp_care":
      return `${identity}camp-keepers want the sleeping place and ${objectName} moved before another wet or worn night makes everyone weaker.`;
    case "fire_fuel":
      return `${identity}they are trying to keep a ${objectName} dry enough that rain does not undo the hearth work.`;
    case "water_edge":
      return `${identity}they want to work the water edge cautiously, checking ${foodName ?? "river greens"} and wet ground before trusting the place.`;
    case "social_copy":
      return `${identity}they saw another band's trace and are trying their own version with a ${objectName}, knowing the missing steps may matter.`;
  }
}

function ideaTitle(idea: AdaptiveIdea, objectName: string, foodName: string | undefined): string {
  switch (idea.family) {
    case "carrying_logistics": return objectName.includes("hide") ? "The Lost Hide Wrap" : "The Light Load Plan";
    case "food_work": return foodName?.includes("berry") ? "The Sour Berry Doubt" : "The Bitter Root Test";
    case "route_crossing": return "The Light Crossing";
    case "camp_care": return "The Tired Camp Shift";
    case "fire_fuel": return "The Dry Fuel Quarrel";
    case "water_edge": return "The Water Edge Test";
    case "social_copy": return objectName.includes("net") ? "The Copied Carry-Net" : "The Copied Reed Bundle";
  }
}

function templateForIdea(family: AdaptiveIdeaFamily): string {
  switch (family) {
    case "carrying_logistics": return "idea-carrying-split-load";
    case "food_work": return "idea-food-work-local";
    case "route_crossing": return "idea-route-scout";
    case "camp_care": return "camp-establishment-human";
    case "fire_fuel": return "idea-carrying-split-load";
    case "water_edge": return "idea-food-work-local";
    case "social_copy": return "outer-talk-trace-copy";
  }
}

function attemptStoryText(attempt: SolutionAttempt, objectName: string, foodName: string, place: string): string {
  if (attempt.blockedReason !== undefined || attempt.outcome === "blocked_before_attempt" || attempt.outcome === "too_labor_heavy") {
    return `They meant to try it near the ${place}, but ${cleanPublicText(attempt.blockedReason ?? "the work was too heavy for the people available")}.`;
  }
  if (attempt.attemptType === "adjust_carrying") {
    // ADAPTIVE EFFICACY FEEDBACK-1 wording audit: carrying has no measured
    // efficacy loop yet, so only outcome-backed success may claim it helped.
    if (attempt.outcome === "clear_failure") {
      return `The ${objectName} failed during the move, and the lesson was public because everyone saw the load come apart.`;
    }
    return attempt.outcome === "clear_success" || attempt.outcome === "partial_success" || attempt.outcome === "local_only_success"
      ? `The ${objectName} held long enough to make the next crossing or carry less punishing.`
      : `They adjusted the ${objectName} and carried on. Whether it truly helped stayed unclear this season.`;
  }
  if (attempt.attemptType === "fallback_work_shift" || attempt.attemptType === "try_local_solution") {
    return attempt.outcome === "clear_success" || attempt.outcome === "partial_success" || attempt.outcome === "local_only_success"
      ? `A small group tested ${foodName} near the ${place}. It helped here, but nobody learned a rule for every place.`
      : `A small group tested ${foodName} near the ${place}. The result was too weak or messy to trust for the whole camp.`;
  }
  if (attempt.attemptType === "copy_trace") {
    return attempt.outcome === "clear_failure"
      ? `They copied the shape of another band's ${objectName}, but not the tying method. It came apart when the place pushed back.`
      : `They copied a rough ${objectName} from another band's trace. Their version was worse, but it taught them something local.`;
  }
  if (attempt.attemptType === "scout_probe" || attempt.attemptType === "temporary_task_camp") {
    return `A small party tested the ${place} before the whole band followed. The result stayed local and cautious.`;
  }
  return `They tried the ${objectName} near the ${place}. The attempt mattered because it showed a limit, not because it solved everything.`;
}

function attemptTitle(attempt: SolutionAttempt, objectName: string, foodName: string): string {
  if (attempt.outcome === "blocked_before_attempt" || attempt.outcome === "too_labor_heavy") {
    return "The Refused Attempt";
  }
  if (attempt.attemptType === "adjust_carrying") {
    return attempt.outcome === "clear_failure" ? "The Broken Carrying Bundle" : "The Light Crossing";
  }
  if (attempt.attemptType === "copy_trace") {
    return objectName.includes("net") ? "The Copied Carry-Net" : "The Failed Reed Tie";
  }
  if (attempt.attemptType === "fallback_work_shift" || attempt.attemptType === "try_local_solution") {
    return foodName.includes("berry") ? "The Sour Berry Doubt" : "The Bitter Root Test";
  }
  if (attempt.attemptType === "scout_probe") {
    return "The Scout's Doubt";
  }
  return "The Tried Solution";
}

function routineStoryText(routine: LocalRoutine, objectName: string, foodName: string | undefined): string {
  switch (routine.domain) {
    case "carrying_logistics":
      return `This band keeps rough ${objectName}s near work that strains carriers, but the habit fails when loads, rain, or labor change.`;
    case "food_work":
      return `They return to ${foodName ?? "bitter roots"} only where the same ground and season have answered before.`;
    case "route_crossing":
      return `They now send lighter parties over familiar crossings first. The routine weakens on strange water or bad weather.`;
    case "camp_care":
      return `After hard moves, they often rest and reorder the sleeping ground before sending scouts farther.`;
    case "fire_fuel":
      return `They keep a ${objectName} close when damp camp work is likely, but it is only useful in the right weather.`;
    case "water_edge":
      return `They work the water edge in small steps, trusting it only where earlier returns were clear.`;
    case "social_copy":
      return `They test copied hints in their own country first, because the missing steps can still ruin the trick.`;
  }
}

function routineTitle(routine: LocalRoutine, objectName: string, foodName: string | undefined): string {
  switch (routine.domain) {
    case "carrying_logistics": return objectName.includes("bundle") ? "The Carrying Bundle Habit" : "The Light Load Habit";
    case "food_work": return foodName?.includes("berry") ? "The Sour Berry Rule" : "The Bitter Root Habit";
    case "route_crossing": return "The Light Crossing";
    case "camp_care": return "The Rest Before Scouts";
    case "fire_fuel": return "The Dry Fuel Habit";
    case "water_edge": return "The Water Edge Habit";
    case "social_copy": return "The Local Copy Test";
  }
}

function internalTalkText(idea: AdaptiveIdea, objectName: string, foodName: string | undefined, place: string): string {
  switch (idea.family) {
    case "carrying_logistics":
      return `Carriers argued over who kept dulling the ${objectName} and who had to take the second load.`;
    case "food_work":
      return `Foragers argued over whether ${foodName ?? "bitter roots"} from the ${place} were worth trusting again.`;
    case "route_crossing":
      return `Elders warned against the old crossing while scouts defended the route they had just tested.`;
    case "camp_care":
      return `Camp-keepers refused another rough move until the tired people and sleeping hides were dealt with.`;
    case "fire_fuel":
      return `People argued over the ${objectName} because one wet night could undo too much camp work.`;
    case "water_edge":
      return `Some wanted the water close, while others were tired of wet ground and poor sleep.`;
    case "social_copy":
      return `People argued over whether the copied ${objectName} was clever or just another way to fail in public.`;
  }
}

function internalTalkTitle(idea: AdaptiveIdea, objectName: string, foodName: string | undefined): string {
  switch (idea.family) {
    case "carrying_logistics": return objectName.includes("scraper") ? "The Dull Scraper Argument" : "The Carrying Bundle Argument";
    case "food_work": return foodName?.includes("berry") ? "The Sour Berry Doubt" : "The Bitter Root Argument";
    case "route_crossing": return "The Old Ford Warning";
    case "camp_care": return "The Tired Camp Argument";
    case "fire_fuel": return "The Dry Fuel Quarrel";
    case "water_edge": return "The Wet Ground Argument";
    case "social_copy": return "The Copied Trick Argument";
  }
}

function outerTalkText(item: SocialDiffusionItem, objectName: string, place: string): string {
  if (item.status === "withheld_or_not_shared") {
    return `Another group may have known more near the ${place}, but the useful part was not clearly shared.`;
  }
  if (item.status === "rejected_as_untrusted" || item.trustFilter === "tense_contact" || item.trustFilter === "avoids_source") {
    return `Strangers made the ${place} harder to trust. The band kept the warning, not a friendly route.`;
  }
  if (item.status === "partial_copy" || item.status === "copied_superficially") {
    return `They copied the look of a ${objectName} from another camp trace, but the missing steps still mattered.`;
  }
  if (item.status === "seen_not_understood" || item.status === "visible_trace_only") {
    return `An old trace near the ${place} showed that others used the country, but not why or how.`;
  }
  if (item.channel === "parent_daughter") {
    return `Parent memory carried a warning forward, but this band still had to test the ${place} for itself.`;
  }
  return `Something from another band reached them near the ${place}. It was a clue, not a shared rule.`;
}

function eventStoryText(ctx: StoryContext, event: CanonicalEvent): string {
  if (event.livedStatus === "inherited_not_personally_lived") {
    return eventVariant(event.id, [
      "This is parent history carried forward. It shapes memory without pretending this band lived it.",
      "The band carries this as older warning, not as something its own people personally endured.",
      "This belongs to inherited memory: useful to remember, but separate from lived proof.",
    ]);
  }
  if (event.sourceSystem === "camp_movement_record" && /relief|less|pressure|riverbank|rotation/i.test(`${event.title} ${event.summary}`)) {
    return eventVariant(event.id, [
      "The old camp was not empty of support, but it was worn down. They looked for another good-enough place so the old ground could rest.",
      "They did not go looking for paradise. They looked for a sleeping place that had not been hammered so hard.",
      "The move kept familiar water close while giving the trampled ground a chance to rest.",
    ]);
  }
  if (event.sourceSystem === "camp_movement_record" && /targetless|blocked/i.test(`${event.title} ${event.summary}`)) {
    return eventVariant(event.id, [
      "A move without a real target stayed blocked. People could name the pressure, but not a safe place to go.",
      "The camp talked about leaving, but no named place held up under the practical questions.",
      "The pressure was real; the target was not, so the move stayed a blocked argument.",
    ]);
  }
  switch (event.family) {
    case "movement_place":
      return eventVariant(event.id, [
        "The movement mattered because it changed where people slept, recovered, or returned, not because it made a permanent place.",
        "People shifted ground for ordinary reasons: tired bodies, old pull, and the need for a workable night.",
        "This move changed the camp's daily burden more than it changed the band's whole country.",
      ]);
    case "route_crossing":
      return eventVariant(event.id, [
        "The crossing entered memory as practical warning: who crossed, what load they carried, and what the water cost.",
        "The route became a story about water, load, and caution rather than a simple line on the ground.",
        "People remembered the crossing because bodies and bundles paid for it.",
      ]);
    case "knowledge_memory":
      return eventVariant(event.id, [
        "The memory stayed because it changed what people trusted when they looked at the same ground again.",
        "This clue mattered because it made a familiar place feel different the next time people returned.",
        "The event survived as a practical memory, not as a complete explanation.",
      ]);
    case "food_water_pressure":
      return eventVariant(event.id, [
        "The pressure was felt in ordinary work: where to gather, what to carry, and how much strain the camp could take.",
        "Hunger or water pressure showed up as argument over work, distance, and tired carriers.",
        "The question was not abstract support; it was what people could bring back before the camp wore down.",
      ]);
    case "contact_social":
      return eventVariant(event.id, [
        "Another band mattered here as a warning, clue, or uncertainty, not as a hidden social system.",
        "The encounter left a practical doubt: what strangers knew, what they would share, and what to avoid.",
        "People kept the meeting as a warning or clue, not as a settled relationship.",
      ]);
    case "demography":
      return eventVariant(event.id, [
        "The change mattered because different bodies in camp changed work, care, and movement.",
        "The camp changed in practical ways: more or fewer hands, more care, and different loads.",
        "This was not just a count. It changed who could carry, watch, rest, or be fed.",
      ]);
    case "origin_lineage":
      return eventVariant(event.id, [
        "This is where the band's own story begins or branches.",
        "The first camp gave later memory a place to point back toward.",
        "A separate band story starts here, with old ties still close behind.",
      ]);
    case "historical_compression":
      return eventVariant(event.id, [
        "Several old changes are folded here so the long record remains readable.",
        "The long record keeps the shape of the years without turning every season into a list.",
        "Older details are compressed here, but the pressure they left behind remains visible.",
      ]);
  }
}

function eventTitle(ctx: StoryContext, event: CanonicalEvent): string {
  const sourceText = `${event.title} ${event.summary}`;
  if (event.sourceSystem === "camp_movement_record" && /relief|riverbank|rotation/i.test(sourceText)) {
    return "The Less-Worn Riverbank";
  }
  if (event.sourceSystem === "camp_movement_record" && /targetless|blocked/i.test(sourceText)) {
    return "The Blocked Escape Talk";
  }
  if (/temporary task camp/i.test(sourceText)) {
    return "The Temporary Ford Camp";
  }
  if (/old camp/i.test(sourceText)) {
    return "Leaving the Old Camp";
  }
  if (/nearby camp shift|local shift/i.test(sourceText)) {
    return isWetPlace(ctx.currentTile) ? "The Wet Camp Shift" : "The Tired Camp Shift";
  }
  switch (event.family) {
    case "route_crossing": return "The Old Ford Warning";
    case "movement_place": return "The Bad Return";
    case "food_water_pressure": return "The Bitter Root Question";
    case "contact_social": return "The Stranger Warning";
    case "knowledge_memory": return "The Remembered Place";
    case "origin_lineage": return "The First Camp";
    case "demography": return "The Changed Camp";
    case "historical_compression": return concreteTitle(event.title, "The Long Memory");
  }
}

function concreteObjectsForEvent(ctx: StoryContext, event: CanonicalEvent): readonly string[] {
  if (event.family === "route_crossing") {
    return ["crossing pole"];
  }
  if (event.family === "movement_place") {
    return ["carrying bundle"];
  }
  if (event.family === "food_water_pressure") {
    return ["digging stick"];
  }
  if (event.sourceSystem === "camp_movement_record") {
    return ["sleeping hide"];
  }
  return [];
}

function concreteFoodsForEvent(ctx: StoryContext, event: CanonicalEvent): readonly string[] {
  if (event.family === "food_water_pressure" || /food|water|berry|root/i.test(`${event.title} ${event.summary}`)) {
    return [concreteFoodNameForTile(ctx.currentTile, event.id)];
  }
  return [];
}

function concreteObjectNameForAttempt(attempt: SolutionAttempt, key: string): string {
  if (attempt.materialUsed.length > 0) {
    const text = attempt.materialUsed.join(" ").toLowerCase();
    if (/carry|load|bundle|container|fiber|cord/i.test(text)) return pickByKey(["carrying bundle", "hide wrap", "grass sling"], key);
    if (/fire|fuel|hearth/i.test(text)) return pickByKey(["dry fuel bundle", "firebrand"], key);
    if (/stone|cut|scrape|tool/i.test(text)) return pickByKey(["dull scraper", "cutting stone", "heavy sharp stone"], key);
    if (/reed|water|edge/i.test(text)) return pickByKey(["reed bundle", "crossing pole"], key);
  }
  switch (attempt.attemptType) {
    case "adjust_carrying": return pickByKey(["carrying bundle", "hide wrap", "grass sling"], key);
    case "copy_trace": return pickByKey(["reed bundle", "carrying net", "tying cord"], key);
    case "fallback_work_shift":
    case "try_local_solution": return pickByKey(["digging stick", "dull scraper", "bark tray"], key);
    case "scout_probe":
    case "temporary_task_camp": return pickByKey(["crossing pole", "carrying bundle"], key);
    default:
      return pickByKey(["carrying bundle", "cutting stone", "hide wrap"], key);
  }
}

function objectForSocialItem(item: SocialDiffusionItem, key: string): string {
  switch (item.domain) {
    case "route_crossing": return pickByKey(["crossing pole", "tying cord"], key);
    case "food_work": return pickByKey(["digging stick", "dull scraper"], key);
    case "camp_foothold_care": return pickByKey(["sleeping hide", "branch barrier"], key);
    case "material_affordance": return pickByKey(["heavy sharp stone", "cutting stone"], key);
    case "fire_hearth_fuel": return pickByKey(["dry fuel bundle", "firebrand"], key);
    case "water_edge": return pickByKey(["reed bundle", "grass sling"], key);
    case "social_contact": return pickByKey(["cutting stone", "carrying bundle"], key);
  }
}

function placePhrase(tile: Tile | undefined): string {
  if (tile === undefined) {
    return "known ground";
  }
  if (tile.isRiverbank) {
    return "riverbank";
  }
  if (tile.isFloodplain) {
    return "floodplain edge";
  }
  if (tile.isMarshChannel || tile.terrainKind === "wetlands" || tile.biomeKind === "marsh") {
    return "marsh edge";
  }
  if (tile.terrainKind === "lake") {
    return "lake edge";
  }
  if (tile.isCoastal || tile.terrainKind === "coast") {
    return "coast";
  }
  if (tile.terrainKind === "forest") {
    return "forest edge";
  }
  if (tile.terrainKind === "hills") {
    return "hill camp";
  }
  return "known ground";
}

function isWetPlace(tile: Tile | undefined): boolean {
  return tile !== undefined &&
    (tile.isRiverbank || tile.isFloodplain || tile.isMarshChannel || tile.terrainKind === "wetlands" || tile.biomeKind === "marsh");
}

function plainIdeaStatus(status: AdaptiveIdea["status"]): string {
  switch (status) {
    case "considered": return "considered";
    case "chosen": return "tried next";
    case "rejected": return "rejected";
    case "blocked": return "blocked";
    case "copied": return "copied";
    case "inherited": return "inherited";
    case "desperate": return "desperate";
  }
}

function plainAttemptStatus(attempt: SolutionAttempt): string {
  if (attempt.blockedReason !== undefined || attempt.outcome === "blocked_before_attempt") {
    return "blocked";
  }
  if (attempt.outcome === "clear_success" || attempt.outcome === "partial_success" || attempt.outcome === "local_only_success") {
    return "helped locally";
  }
  if (attempt.outcome === "clear_failure" || attempt.outcome === "dead_end" || attempt.outcome === "false_confidence") {
    return "failed";
  }
  return "mixed";
}

function plainEstablishmentStatus(establishment: NewPlaceEstablishmentState): string {
  switch (establishment.status) {
    case "new": return "new place";
    case "testing": return "being tested";
    case "holding": return "holding";
    case "failing": return "failing";
    case "established": return "familiar";
  }
}

function plainOutcome(outcome: string): string {
  switch (outcome) {
    case "helped":
    case "successful":
    case "established":
      return "helped";
    case "failed":
    case "worsened":
      return "failed";
    case "still_testing":
      return "still uncertain";
    default:
      return outcome.replace(/_/g, " ");
  }
}

function plainSocialStatus(status: SocialDiffusionItem["status"]): string {
  switch (status) {
    case "heard_not_practiced": return "heard";
    case "seen_not_understood": return "seen, not understood";
    case "visible_trace_only": return "trace only";
    case "copied_superficially": return "surface copy";
    case "partial_copy": return "partial copy";
    case "rejected_as_untrusted": return "not trusted";
    case "withheld_or_not_shared": return "not clearly shared";
    case "inherited_story": return "inherited story";
    case "inherited_practical_hint": return "inherited hint";
    case "tested_locally": return "tested here";
    case "blocked_by_material_context": return "wrong material";
    case "blocked_by_labor": return "labor blocked";
    case "local_only": return "local only";
    case "false_confidence_risk": return "doubtful";
    case "dead_end_risk": return "doubtful";
    case "compatible_but_untried": return "not tried";
    case "diffusion_ready_later": return "watching";
  }
}

function evidenceChipsFromAdaptive(evidence: readonly AdaptiveEvidenceRef[]): readonly string[] {
  return compactChips(evidence.slice(0, EVIDENCE_CHIP_CAP).map((entry) => {
    switch (entry.sourceSystem) {
      case "problem_practice": return "Named problem";
      case "practice_feedback": return "Past try";
      case "material_affordance": return "Object clue";
      case "knowledge_ecology": return "Known place";
      case "social_diffusion": return "Other-band clue";
      case "camp_foothold": return "Camp trace";
      case "activity_party": return "Working party";
      case "repetition_familiarity": return "Repeated use";
      case "movement_memory": return "Move memory";
      case "route_memory": return "Route memory";
      case "crossing_memory": return "Crossing memory";
      case "place_memory": return "Place memory";
      case "demography": return "Camp labor";
      case "pressure_state": return "Felt pressure";
      case "decision": return "Chosen response";
    }
  }));
}

function evidenceChipsFromCamp(evidence: readonly CampMovementEvidenceRef[]): readonly string[] {
  return compactChips(evidence.slice(0, EVIDENCE_CHIP_CAP).map((entry) => {
    switch (entry.sourceSystem) {
      case "adaptive_human": return "Camp idea";
      case "camp_foothold": return "Camp trace";
      case "activity": return "Working party";
      case "event": return "Remembered event";
      case "movement": return "Move memory";
      case "route_crossing": return "Route or crossing";
      case "place_memory": return "Place memory";
      case "pressure": return "Felt pressure";
      case "demography": return "Camp labor";
    }
  }));
}

function compactChips(values: readonly (string | undefined)[]): readonly string[] {
  return uniqueStrings(values
    .filter((value): value is string => value !== undefined && value.trim().length > 0)
    .map(cleanEvidenceChip))
    .slice(0, EVIDENCE_CHIP_CAP);
}

function cleanEvidenceChip(value: string): string {
  return cleanPublicText(value)
    .replace(/\bsource system\b/gi, "source")
    .replace(/\bmaterial basis\b/gi, "object clue")
    .replace(/\bknowledge ecology\b/gi, "known place")
    .replace(/\bpractice feedback\b/gi, "past try")
    .replace(/\bpressure state\b/gi, "felt pressure")
    .replace(/\bresource context\b/gi, "local context");
}

function cleanPublicText(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\bfood resource\b/gi, "edible patch")
    .replace(/\btool item\b/gi, "worked object")
    .replace(/\bcamp object\b/gi, "camp thing")
    .replace(/\bmaterial compatibility\b/gi, "fit with the object")
    .replace(/\bfeedback quality\b/gi, "clarity")
    .replace(/\blocal-only routine\b/gi, "local habit")
    .replace(/\bstagnation escape target integrity\b/gi, "blocked move")
    .replace(/\bcamp movement substrate\b/gi, "camp movement record")
    .replace(/\s+/g, " ")
    .trim();
}

function concreteTitle(value: string, fallback: string): string {
  const cleaned = cleanPublicText(value);
  if (/adaptive response|technical event|resource routine|pressure relief candidate|practice feedback event/i.test(cleaned)) {
    return fallback;
  }
  return cleaned.length === 0 ? fallback : cleaned;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (cleaned.length > 0 && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

function pickByKey(values: readonly string[], key: string): string {
  return values[deterministicIndex(key, values.length)] ?? values[0] ?? "rough carrying bundle";
}

function eventVariant(key: string, variants: readonly string[]): string {
  return pickByKey(variants, `event-story:${key}`);
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toLowerCase() + value.slice(1);
}

function rareGate(key: string, percent: number): boolean {
  return deterministicIndex(key, 100) < percent;
}

function deterministicIndex(key: string, length: number): number {
  if (length <= 1) {
    return 0;
  }
  return stableHash(key) % length;
}

function stableKey(value: string): string {
  return stableHash(value).toString(36);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function countByFixed<T extends string>(values: readonly T[], keys: readonly T[]): Readonly<Record<T, number>> {
  const entries = keys.map((key) => [key, values.filter((value) => value === key).length] as const);
  return Object.fromEntries(entries) as Record<T, number>;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function duplicateStoryPhraseCount(items: readonly PublicStoryItem[]): number {
  return items.length - new Set(items.map((item) => `${item.category}|${item.title}|${item.story}|${item.evidenceChips.join("/")}`)).size;
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
