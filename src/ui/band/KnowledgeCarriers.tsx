import { useMemo } from "react";

import {
  availabilityLabel,
  deriveKnowledgeCarrierProfile,
  knowledgeAvailabilityLabel,
  knowledgeCarrierClassLabel,
  knowledgeCarrierDomainLabel,
  type KnowledgeCarrierDomain,
} from "../../sim/agents/knowledgeCarriers";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip } from "./parts";

const DOMAIN_ICON: Readonly<Record<KnowledgeCarrierDomain, IconName>> = {
  route_corridor: "route",
  crossing_ford: "ford",
  place_camp_country: "camp",
  food_work: "food",
  water_refuge: "water",
  risk_caution: "warning",
  material_practice: "craft",
  camp_care: "people",
  social_contact_diffusion: "talk",
  range_rotation_pressure_relief: "range",
  deep_history_inherited: "lineage",
  local_routine_adaptive_practice: "activity",
};

export function KnowledgeCarriers({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveKnowledgeCarrierProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return null;
  }

  return (
    <div className="knowledge-carriers-block" aria-label="knowledge carriers and memory strength">
      <article className="knowledge-overview living-knowledge-overview">
        <span className="knowledge-kicker">Living knowledge</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="knowledge-overview-counts">
          <span>{profile.items.length} carrier item{profile.items.length === 1 ? "" : "s"}</span>
          <span>{profile.activeItemCount} active/fresh</span>
          <span>{profile.fadingItemCount + profile.dormantItemCount} fading/dormant</span>
          <span>{profile.inheritedFragmentCount + profile.copiedUntestedCount} inherited/copied</span>
        </div>
      </article>

      {profile.publicCards.length === 0 ? (
        <p className="empty-panel">No active or dormant carrier card is prominent yet.</p>
      ) : (
        <div className="knowledge-card-grid living-knowledge-grid">
          {profile.publicCards.map((card) => (
            <details key={card.id} className={`knowledge-card knowledge-carrier-card state-${card.state}`}>
              <summary>
                <span className="knowledge-card-icon">
                  <Icon name={DOMAIN_ICON[card.domain]} />
                </span>
                <span className="knowledge-card-head">
                  <span className="knowledge-card-kicker">{knowledgeCarrierDomainLabel(card.domain)}</span>
                  <span className="knowledge-card-title">{card.title}</span>
                  <span className="knowledge-card-summary">{card.oneLineMeaning}</span>
                  <span className="knowledge-card-evidence-preview">
                    {card.evidenceChips.slice(0, 2).map((chip) => (
                      <span key={`${card.id}:${chip}`} className="knowledge-evidence-chip compact" title={chip}>
                        <Icon name="memory" size={12} />
                        <span>{chip}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="knowledge-card-chips">
                  <Chip>{knowledgeAvailabilityLabel(card.state)}</Chip>
                  <Chip>{card.availabilityLabel}</Chip>
                </span>
              </summary>
              <div className="knowledge-card-body">
                <div className="knowledge-meta-row">
                  {card.carrierChips.map((carrier) => (
                    <span key={`${card.id}:${carrier}`}>{knowledgeCarrierClassLabel(carrier)}</span>
                  ))}
                </div>
                <div className="knowledge-evidence-list">
                  {card.evidenceChips.map((chip) => (
                    <span key={`${card.id}:e:${chip}`} className="knowledge-evidence-chip">
                      <Icon name="memory" size={13} />
                      <span>{chip}</span>
                    </span>
                  ))}
                </div>
                <p className="knowledge-uncertainty">
                  Availability: {availabilityLabel(
                    profile.items.find((item) => item.id === card.technicalItemId)?.availability ?? 0,
                  )}. Technical has exact state, carriers, decay, distortion, and source refs.
                </p>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
