import { useMemo } from "react";

import {
  deriveMaterialAffordanceProfile,
  materialAffordanceFamilyLabel,
  materialAffordanceStatusLabel,
  type MaterialAffordanceFamily,
  type MaterialAffordanceItem,
  type MaterialAffordanceStatus,
} from "../../sim/agents/materialAffordance";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const FAMILY_ICON: Readonly<Record<MaterialAffordanceFamily, IconName>> = {
  carrying_containers_cordage: "craft",
  shelter_camp_structure: "settle",
  fire_hearth_fuel: "camp",
  food_processing: "food",
  water_edge_trapping: "fishing",
  route_crossing_engineering: "route",
  tool_cutting_scraping_digging: "craft",
  visual_mineral_adhesive: "focus",
  camp_organization_care: "people",
};

export function Affordances({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveMaterialAffordanceProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-affordances">
        <SectionHeading icon="craft">Affordances</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const strongest = [...profile.items]
    .filter((item) => item.status !== "unsupported_by_current_data" && item.status !== "absent")
    .sort((left, right) => statusRank(right.status) - statusRank(left.status) || right.confidence - left.confidence)
    .slice(0, 4);

  return (
    <section className="bp-section band-affordances" aria-label="material affordances">
      <SectionHeading icon="craft">Affordances</SectionHeading>
      <p className="condition-note">
        What their known world makes possible later. These are possible future practices, not acquired methods.
      </p>

      <article className="affordance-overview">
        <span className="affordance-kicker">What their world makes possible</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="affordance-overview-counts">
          <span>{profile.items.length} family signals</span>
          <span>{profile.statusCounts.plausible + profile.statusCounts.strong} plausible or strong</span>
          <span>{profile.constraintCount} constraints</span>
          <span>{profile.unsupportedOrDeferredCount} weak or deferred</span>
        </div>
      </article>

      {strongest.length === 0 ? null : (
        <div className="affordance-strongest" aria-label="strongest affordance families">
          {strongest.map((item) => (
            <span key={`${item.id}:top`} className={`affordance-mini status-${item.status}`}>
              <Icon name={FAMILY_ICON[item.family]} size={13} />
              <span>{item.publicLabel}</span>
            </span>
          ))}
        </div>
      )}

      <div className="affordance-card-grid">
        {profile.items.map((item) => (
          <AffordanceCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function AffordanceCard({ item }: { readonly item: MaterialAffordanceItem }) {
  return (
    <details className={`affordance-card status-${item.status}`}>
      <summary>
        <span className="affordance-card-icon">
          <Icon name={FAMILY_ICON[item.family]} />
        </span>
        <span className="affordance-card-head">
          <span className="affordance-card-kicker">{materialAffordanceFamilyLabel(item.family)}</span>
          <span className="affordance-card-title">{item.publicLabel}</span>
          <span className="affordance-card-summary">{item.meaning}</span>
          <span className="affordance-evidence-preview" aria-label="top affordance evidence">
            {item.evidence.slice(0, 2).map((entry, index) => (
              <span
                key={`${item.id}:preview:${entry.kind}:${entry.label}:${index}`}
                className="affordance-evidence-chip compact"
                title={entry.label}
              >
                <Icon name={iconForEvidence(entry.kind)} size={12} />
                <span>{entry.label}</span>
              </span>
            ))}
          </span>
        </span>
        <span className="affordance-card-chips">
          <Chip>{materialAffordanceStatusLabel(item.status)}</Chip>
          <Chip>{item.strength}</Chip>
        </span>
      </summary>
      <div className="affordance-card-body">
        <p className="affordance-warning">Possible later work only. No method has been discovered here.</p>
        <AffordanceBasis title="Material basis" items={item.materialBasis} empty="material basis remains thin" />
        <AffordanceBasis title="Knowledge and memory" items={item.knowledgeBasis} empty="knowledge basis remains thin" />
        <AffordanceBasis title="Activity and events" items={item.activityEventBasis} empty="activity basis remains thin" />
        <AffordanceBasis title="Future hook" items={item.futureHooks} empty="no hook retained" />
        {item.constraints.length === 0 ? null : (
          <div className="affordance-basis">
            <span className="affordance-basis-title">Constraints</span>
            <div className="affordance-chip-list">
              {item.constraints.map((constraint) => (
                <span key={`${item.id}:constraint:${constraint.label}`} className="affordance-constraint-chip">
                  {constraint.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="affordance-meta-row">
          <span>{Math.round(item.confidence * 100)}% support</span>
          <span>{item.livedBasis === "inherited_not_lived" ? "inherited, not lived here" : item.livedBasis}</span>
        </div>
      </div>
    </details>
  );
}

function AffordanceBasis({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="affordance-basis">
      <span className="affordance-basis-title">{title}</span>
      <div className="affordance-chip-list">
        {(items.length === 0 ? [empty] : items).map((item) => (
          <span key={`${title}:${item}`} className={items.length === 0 ? "affordance-missing-chip" : "affordance-evidence-chip"}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function iconForEvidence(kind: MaterialAffordanceItem["evidence"][number]["kind"]): IconName {
  switch (kind) {
    case "material":
      return "craft";
    case "terrain_hydrography":
      return "region";
    case "knowledge":
      return "knowledge";
    case "activity":
      return "activity";
    case "event":
      return "time";
    case "memory":
      return "memory";
    case "demography":
      return "people";
    case "seasonal_support":
      return "season";
    case "repetition":
      return "return";
  }
}

function statusRank(status: MaterialAffordanceStatus): number {
  switch (status) {
    case "strong":
      return 7;
    case "plausible":
      return 6;
    case "weak":
      return 5;
    case "blocked_constrained":
      return 4;
    case "future_only":
      return 3;
    case "absent":
      return 2;
    case "unsupported_by_current_data":
      return 1;
  }
}
