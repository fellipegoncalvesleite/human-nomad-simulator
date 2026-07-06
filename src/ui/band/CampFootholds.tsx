import { useMemo } from "react";

import {
  campFootholdFactorFamilyLabel,
  campFootholdPlaceRoleLabel,
  campFootholdStatusLabel,
  deriveCampFootholdProfile,
  type CampFireHearthFuelSignal,
  type CampFootholdEvidenceRef,
  type CampFootholdFactor,
  type CampFootholdFactorFamily,
  type CampFootholdPlace,
  type CampFootholdSignalStatus,
  type CareCampOrganizationSignal,
  type TemporaryCacheSignal,
} from "../../sim/agents/campFoothold";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const FACTOR_ICON: Readonly<Record<CampFootholdFactorFamily, IconName>> = {
  repeated_return: "return",
  water_refuge: "water",
  shelter_exposure: "camp",
  fire_hearth_fuel: "settle",
  care_camp_organization: "people",
  temporary_storage_cache: "storage",
  food_processing_place: "food",
  route_crossing_use: "route",
  camp_ecology_wear: "warning",
  safety_risk: "warning",
};

export function CampFootholds({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveCampFootholdProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-camp-footholds">
        <SectionHeading icon="camp">Camp &amp; Footholds</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const visiblePlaces = profile.places.slice(0, 4);
  const visibleFactors = [...profile.factors]
    .sort((left, right) => statusRank(right.status) - statusRank(left.status) || right.confidence - left.confidence)
    .slice(0, 6);

  return (
    <section className="bp-section band-camp-footholds" aria-label="camp footholds and camp ecology">
      <SectionHeading icon="camp">Camp &amp; Footholds</SectionHeading>
      <p className="condition-note">
        Weak traces and routines from repeated camp life. These are temporary footholds, not reliable stores or learned methods.
      </p>

      <article className="camp-foothold-overview">
        <span className="camp-foothold-kicker">Camp context</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="camp-foothold-overview-counts">
          <span>{profile.places.length} place signal{profile.places.length === 1 ? "" : "s"}</span>
          <span>{profile.factors.length} camp factor{profile.factors.length === 1 ? "" : "s"}</span>
          <span>{profile.temporaryStorageCount} brief holding cue{profile.temporaryStorageCount === 1 ? "" : "s"}</span>
          <span>{profile.fireContextCount + profile.careBurdenCount} fire/care cue{profile.fireContextCount + profile.careBurdenCount === 1 ? "" : "s"}</span>
        </div>
      </article>

      <div className="camp-foothold-note" role="note">
        <Icon name="warning" size={14} />
        <span>Repeated camp use can make a place familiar or worn. It does not make a reliable method.</span>
      </div>

      <div className="camp-foothold-block">
        <span className="camp-foothold-block-title">Strongest foothold places</span>
        {visiblePlaces.length === 0 ? (
          <p className="empty-panel">No camp foothold is grounded yet.</p>
        ) : (
          <div className="camp-foothold-place-grid">
            {visiblePlaces.map((place) => (
              <CampPlaceCard key={place.id} place={place} />
            ))}
          </div>
        )}
      </div>

      <div className="camp-foothold-block">
        <span className="camp-foothold-block-title">Camp factors</span>
        {visibleFactors.length === 0 ? (
          <p className="empty-panel">No camp factor is strong enough to show yet.</p>
        ) : (
          <div className="camp-foothold-factor-grid">
            {visibleFactors.map((factor) => (
              <CampFactorCard key={factor.id} factor={factor} />
            ))}
          </div>
        )}
      </div>

      <SignalStrip
        storage={profile.temporaryCacheSignals}
        fire={profile.fireHearthFuelSignals}
        care={profile.careCampSignals}
      />

      {profile.inheritedBasisCount === 0 ? null : (
        <div className="camp-foothold-note inherited" role="note">
          <Icon name="lineage" size={14} />
          <span>Some camp evidence is inherited or carried from a parent band. Local testing is kept separate.</span>
        </div>
      )}
    </section>
  );
}

function CampPlaceCard({ place }: { readonly place: CampFootholdPlace }) {
  return (
    <details className={`camp-place-card status-${place.status}`}>
      <summary>
        <span className="camp-card-icon">
          <Icon name={iconForPlace(place.role)} />
        </span>
        <span className="camp-card-head">
          <span className="camp-foothold-card-kicker">{campFootholdPlaceRoleLabel(place.role)}</span>
          <span className="camp-card-title">{place.publicLabel}</span>
          <span className="camp-card-summary">{place.meaning}</span>
          <span className="camp-evidence-preview" aria-label="top camp place evidence">
            {place.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${place.id}:preview:${entry.label}:${index}`} evidence={entry} compact />
            ))}
          </span>
        </span>
        <span className="camp-card-chips">
          <Chip>{campFootholdStatusLabel(place.status)}</Chip>
          <Chip>{Math.round(place.confidence * 100)}%</Chip>
        </span>
      </summary>
      <div className="camp-card-body">
        <p><strong>Recency:</strong> {place.recencyLine}</p>
        <p><strong>Local ecology:</strong> {place.ecologyLine}</p>
        <ChipLine title="Reasons" items={place.topReasons} empty="reasons remain thin" />
        <EvidenceLine evidence={place.evidence} />
      </div>
    </details>
  );
}

function CampFactorCard({ factor }: { readonly factor: CampFootholdFactor }) {
  return (
    <details className={`camp-factor-card status-${factor.status}`}>
      <summary>
        <span className="camp-card-icon">
          <Icon name={FACTOR_ICON[factor.family]} />
        </span>
        <span className="camp-card-head">
          <span className="camp-foothold-card-kicker">{campFootholdFactorFamilyLabel(factor.family)}</span>
          <span className="camp-card-title">{factor.publicLabel}</span>
          <span className="camp-card-summary">{factor.meaning}</span>
          <span className="camp-evidence-preview" aria-label="top camp factor evidence">
            {factor.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${factor.id}:preview:${entry.label}:${index}`} evidence={entry} compact />
            ))}
          </span>
        </span>
        <span className="camp-card-chips">
          <Chip>{campFootholdStatusLabel(factor.status)}</Chip>
          <Chip>{basisLabel(factor.livedBasis)}</Chip>
        </span>
      </summary>
      <div className="camp-card-body">
        <p><strong>Uncertainty:</strong> {factor.uncertainty}</p>
        <p><strong>Limit:</strong> {factor.practicalLimit}</p>
        <EvidenceLine evidence={factor.evidence} />
        <div className="camp-link-counts">
          {factor.relatedAffordanceIds.length === 0 ? null : <span>affordance basis</span>}
          {factor.relatedProblemFrameIds.length === 0 ? null : <span>problem basis</span>}
          {factor.relatedKnowledgeIds.length === 0 ? null : <span>knowledge basis</span>}
          {factor.relatedEventIds.length === 0 ? null : <span>event basis</span>}
        </div>
      </div>
    </details>
  );
}

function SignalStrip({
  storage,
  fire,
  care,
}: {
  readonly storage: readonly TemporaryCacheSignal[];
  readonly fire: readonly CampFireHearthFuelSignal[];
  readonly care: readonly CareCampOrganizationSignal[];
}) {
  const signals = [
    ...storage.map((signal) => ({ kind: "storage" as const, signal })),
    ...fire.map((signal) => ({ kind: "fire" as const, signal })),
    ...care.map((signal) => ({ kind: "care" as const, signal })),
  ];

  if (signals.length === 0) {
    return (
      <div className="camp-foothold-note subdued" role="note">
        <Icon name="camp" size={14} />
        <span>No brief holding, fire/fuel, or care signal is strong enough to show beyond general camp use.</span>
      </div>
    );
  }

  return (
    <div className="camp-signal-grid" aria-label="camp practical signals">
      {signals.map(({ kind, signal }) => (
        <details key={`${kind}:${signal.id}`} className={`camp-signal-card status-${signal.status}`}>
          <summary>
            <span className="camp-card-icon">
              <Icon name={signalIcon(kind)} />
            </span>
            <span className="camp-card-head">
              <span className="camp-foothold-card-kicker">{signalTitle(kind)}</span>
              <span className="camp-card-title">{signal.publicLabel}</span>
              <span className="camp-card-summary">{signal.meaning}</span>
            </span>
            <span className="camp-card-chips">
              <Chip>{campFootholdStatusLabel(signal.status)}</Chip>
              <Chip>{Math.round(signal.confidence * 100)}%</Chip>
            </span>
          </summary>
          <div className="camp-card-body">
            <SignalDetails kind={kind} signal={signal} />
            <EvidenceLine evidence={signal.evidence} />
          </div>
        </details>
      ))}
    </div>
  );
}

function SignalDetails({
  kind,
  signal,
}: {
  readonly kind: "storage" | "fire" | "care";
  readonly signal: TemporaryCacheSignal | CampFireHearthFuelSignal | CareCampOrganizationSignal;
}) {
  if (kind === "storage") {
    const storage = signal as TemporaryCacheSignal;
    return (
      <>
        <ChipLine title="Material basis" items={storage.materialBasis} empty="material basis remains weak" />
        <ChipLine title="Activity basis" items={storage.activityBasis} empty="activity basis remains weak" />
        <p className="camp-risk-note">{storage.riskLine}</p>
      </>
    );
  }

  if (kind === "fire") {
    const fire = signal as CampFireHearthFuelSignal;
    return (
      <>
        <p><strong>Fuel:</strong> {fire.fuelLine}</p>
        <p><strong>Burden:</strong> {fire.burdenLine}</p>
      </>
    );
  }

  const care = signal as CareCampOrganizationSignal;
  return (
    <>
      <p><strong>Care:</strong> {care.careLine}</p>
      <p><strong>Labor:</strong> {care.laborLine}</p>
    </>
  );
}

function EvidenceLine({ evidence }: { readonly evidence: readonly CampFootholdEvidenceRef[] }) {
  return (
    <div className="camp-basis">
      <span className="camp-basis-title">Evidence</span>
      <div className="camp-chip-list">
        {evidence.length === 0 ? (
          <span className="camp-missing-chip">evidence remains thin</span>
        ) : (
          evidence.map((entry, index) => (
            <EvidenceChip key={`evidence:${entry.label}:${index}`} evidence={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function ChipLine({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="camp-basis">
      <span className="camp-basis-title">{title}</span>
      <div className="camp-chip-list">
        {(items.length === 0 ? [empty] : items).map((item) => (
          <span key={`${title}:${item}`} className={items.length === 0 ? "camp-missing-chip" : "camp-evidence-chip"}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function EvidenceChip({
  evidence,
  compact,
}: {
  readonly evidence: CampFootholdEvidenceRef;
  readonly compact?: boolean;
}) {
  return (
    <span className={compact === true ? "camp-evidence-chip compact" : "camp-evidence-chip"} title={evidence.label}>
      <Icon name={iconForEvidence(evidence.kind)} size={12} />
      <span>{evidence.label}</span>
    </span>
  );
}

function iconForPlace(role: CampFootholdPlace["role"]): IconName {
  switch (role) {
    case "current_camp_context":
    case "activity_base":
      return "camp";
    case "repeated_return_place":
      return "return";
    case "water_refuge_foothold":
      return "water";
    case "processing_cache_possibility":
      return "storage";
    case "crossing_route_foothold":
      return "ford";
    case "worn_or_fragile_place":
    case "stale_or_abandoned_trace":
    case "uncertain_foothold":
      return "warning";
  }
}

function iconForEvidence(kind: CampFootholdEvidenceRef["kind"]): IconName {
  switch (kind) {
    case "place":
      return "camp";
    case "activity":
      return "activity";
    case "memory":
      return "memory";
    case "ecology":
      return "region";
    case "care":
      return "people";
    case "fire":
      return "settle";
    case "storage":
      return "storage";
    case "knowledge":
      return "knowledge";
    case "event":
      return "time";
    case "demography":
      return "people";
    case "affordance":
      return "craft";
    case "problem_practice":
      return "focus";
    case "identity":
      return "lineage";
    case "seasonal":
      return "season";
  }
}

function signalIcon(kind: "storage" | "fire" | "care"): IconName {
  switch (kind) {
    case "storage":
      return "storage";
    case "fire":
      return "settle";
    case "care":
      return "people";
  }
}

function signalTitle(kind: "storage" | "fire" | "care"): string {
  switch (kind) {
    case "storage":
      return "Brief holding";
    case "fire":
      return "Fire/fuel";
    case "care":
      return "Care/camp work";
  }
}

function basisLabel(basis: CampFootholdFactor["livedBasis"]): string {
  switch (basis) {
    case "lived":
      return "lived";
    case "inherited_not_lived":
      return "inherited, untested here";
    case "mixed":
      return "mixed";
    case "unknown":
      return "uncertain";
  }
}

function statusRank(status: CampFootholdSignalStatus): number {
  switch (status) {
    case "active":
      return 8;
    case "remembered":
      return 7;
    case "strained":
      return 6;
    case "local_only":
      return 5;
    case "fragile":
      return 4;
    case "weak":
      return 3;
    case "inherited_not_tested_here":
      return 2;
    case "stale":
      return 1;
    case "uncertain":
      return 0;
  }
}
