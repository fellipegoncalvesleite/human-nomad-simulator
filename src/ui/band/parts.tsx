/*
 * UI-STYLE-1 — shared presentational parts for the band panel.
 * Pure presentational: no sim imports, no sim logic. These render values handed
 * to them. `Detail` preserves the legacy `tile-detail-row` markup so the
 * Technical tab keeps its exact raw look.
 */
import { useState } from "react";
import type { ReactNode } from "react";

import { Icon } from "../icons";
import type { IconName } from "../icons";
import type { BandStatusSummary } from "../bandSummary";

export function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="tile-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function SectionHeading({
  icon,
  children,
}: {
  readonly icon?: IconName;
  readonly children: ReactNode;
}) {
  return (
    <div className="bp-section-title">
      {icon === undefined ? null : <Icon name={icon} />}
      <span>{children}</span>
    </div>
  );
}

export function StatTile({
  icon,
  label,
  value,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-icon">
        <Icon name={icon} />
      </span>
      <span className="stat-tile-body">
        <span className="stat-tile-label">{label}</span>
        {/* Values ellipsize at tile width; the title shows the full text on hover. */}
        <span className="stat-tile-value" title={value}>{value}</span>
      </span>
    </div>
  );
}

export function Chip({
  icon,
  tone,
  title,
  children,
}: {
  readonly icon?: IconName;
  readonly tone?: BandStatusSummary["tone"];
  readonly title?: string;
  readonly children: ReactNode;
}) {
  const className = tone === undefined ? "chip" : `chip toned tone-${tone}`;
  // Chips truncate at narrow widths; default the hover title to the chip text.
  const hoverTitle = title ?? (typeof children === "string" ? children : undefined);

  return (
    <span className={className} title={hoverTitle}>
      {icon === undefined ? null : <Icon name={icon} title={hoverTitle} />}
      <span>{children}</span>
    </span>
  );
}

export function StatusChip({ status }: { readonly status: BandStatusSummary }) {
  return (
    <span className={`status-chip tone-${status.tone}`}>
      <Icon name={status.icon} />
      <span>{status.label}</span>
    </span>
  );
}

export function Bar({ value, tone }: { readonly value: number; readonly tone?: BandStatusSummary["tone"] }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const className = tone === undefined ? "bar" : `bar tone-${tone}`;

  return (
    <div className={className} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * READABILITY-UI-ORGANIZATION-1 — compact causal explanation card: a claim, the
 * grounded reasons behind it, and what pushes against it. Callers pass already
 * TRANSLATED prose lines (no raw ids/enums); proof stays in Technical.
 */
export function CauseCard({
  title,
  because,
  pressures,
  note,
}: {
  readonly title: string;
  readonly because: readonly string[];
  readonly pressures?: readonly string[];
  readonly note?: string;
}) {
  if (because.length === 0 && (pressures === undefined || pressures.length === 0)) {
    return null;
  }

  return (
    <article className="cause-card">
      <span className="cause-card-title">{title}</span>
      {because.length === 0 ? null : (
        <ol className="cause-card-list">
          {because.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      )}
      {pressures === undefined || pressures.length === 0 ? null : (
        <div className="cause-card-pressure">
          <span className="cause-card-kicker">But</span>
          <ul className="cause-card-list">
            {pressures.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {note === undefined ? null : <p className="cause-card-note">{note}</p>}
    </article>
  );
}

export function CollapsibleGroup({
  title,
  defaultOpen = false,
  children,
}: {
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hasOpened, setHasOpened] = useState(defaultOpen);

  return (
    <details
      className="collapsible"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen) {
          setHasOpened(true);
        }
      }}
    >
      <summary>{title}</summary>
      {hasOpened ? <div className="collapsible-body">{children}</div> : null}
    </details>
  );
}
