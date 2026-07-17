export type BandDetailView =
  | "overview"
  | "doing"
  | "survival"
  | "food"
  | "nature"
  | "place"
  | "camp"
  | "movementCamp"
  | "people"
  | "affordances"
  | "problems"
  | "feedback"
  | "between"
  | "ideas"
  | "knowledge"
  | "identity"
  | "events"
  | "story"
  | "technical";

// The panel tabs and Band information export deliberately share this registry.
// Adding a category here makes it available to both surfaces; the renderer for
// the new id must also be added to BandPanel and BandMarkdownExport.
export const BAND_DETAIL_VIEWS: readonly {
  readonly id: BandDetailView;
  readonly label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "doing", label: "Doing" },
  { id: "survival", label: "Survival" },
  { id: "food", label: "Food" },
  { id: "nature", label: "Nature" },
  { id: "place", label: "Place" },
  { id: "camp", label: "Camp & Footholds" },
  { id: "movementCamp", label: "Movement & Camp" },
  { id: "people", label: "People" },
  { id: "affordances", label: "Affordances" },
  { id: "problems", label: "Problems & Trials" },
  { id: "feedback", label: "Practice Feedback" },
  { id: "between", label: "Between Bands" },
  { id: "ideas", label: "Ideas & Solutions" },
  { id: "knowledge", label: "Knowledge" },
  { id: "identity", label: "Identity" },
  { id: "events", label: "Events" },
  { id: "story", label: "Chronicle" },
  { id: "technical", label: "Technical" },
];
