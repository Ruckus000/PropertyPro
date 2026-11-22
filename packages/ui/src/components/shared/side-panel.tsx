/**
 * SidePanel — the closed set of positions a page's side panel may hold.
 * Each template names which positions exist; `panelRegions` orders them
 * (positions 1-2 lead, 3-4 trail) so a page cannot reorder by prop order.
 * Presentational and import-time pure (no "use client").
 */
import * as React from "react";
import { TriangleAlert } from "lucide-react";

type Slot = React.ReactNode;

/** The only value a panel's "About" accepts. Produced by `describeAccess`, never written by hand. */
export type AccessSentence = string & { readonly __brand: "AccessSentence" };

export type SidePanelProps =
  | { template: "list" | "canvas"; glance?: Slot; attention?: Slot; shortcuts?: Slot; about?: AccessSentence }
  | { template: "detail"; details?: Slot; attention?: Slot; related?: Slot; about?: AccessSentence }
  | { template: "form"; preview?: Slot; attention?: Slot; about?: AccessSentence }
  | { template: "help"; onThisPage?: Slot; related?: Slot };

export interface PanelRegion {
  heading: string;
  content: React.ReactNode;
}

type Position = [heading: string, key: string];

const LAYOUT: Record<SidePanelProps["template"], { lead: Position[]; trail: Position[] }> = {
  list: {
    lead: [["At a glance", "glance"], ["Needs attention", "attention"]],
    trail: [["Shortcuts", "shortcuts"], ["About", "about"]],
  },
  canvas: {
    lead: [["At a glance", "glance"], ["Needs attention", "attention"]],
    trail: [["Shortcuts", "shortcuts"], ["About", "about"]],
  },
  detail: {
    lead: [["Details", "details"], ["Needs attention", "attention"]],
    trail: [["Related", "related"], ["About", "about"]],
  },
  form: {
    lead: [["Preview", "preview"], ["Needs attention", "attention"]],
    trail: [["About", "about"]],
  },
  help: {
    lead: [["On this page", "onThisPage"]],
    trail: [["Related", "related"]],
  },
};

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false && v !== "";
}

function pick(props: SidePanelProps, positions: Position[]): PanelRegion[] {
  const bag = props as unknown as Record<string, unknown>;
  return positions
    .filter(([, key]) => present(bag[key]))
    .map(([heading, key]) => ({ heading, content: bag[key] as React.ReactNode }));
}

/** Positions 1-2 and 3-4, in order, with their headings. Empty positions are dropped. */
export function panelRegions(props: SidePanelProps): { lead: PanelRegion[]; trail: PanelRegion[] } {
  const layout = LAYOUT[props.template];
  return { lead: pick(props, layout.lead), trail: pick(props, layout.trail) };
}

/** False when the panel would hold only "About". */
export function isPanelWorthDrawing(props: SidePanelProps): boolean {
  const { lead, trail } = panelRegions(props);
  return lead.length + trail.filter((r) => r.heading !== "About").length > 0;
}

// Stacked above or below the main column the panel is a compact strip: regions
// sit in a wrapping row, each no wider than 20rem, so a label and its value stay
// near each other. Beside the main column (the box is wide enough) the aside is
// the 17.5rem column and its regions stack vertically at full width. Each
// alternative is a complete literal so Tailwind's scanner sees it; table pages
// switch only at `cq-xl`, never `cq-lg`.
const ASIDE_ROWS = "flex min-w-0 flex-wrap gap-x-12 gap-y-4 cq-lg:flex-col cq-lg:flex-nowrap";
const ASIDE_TABLE = "flex min-w-0 flex-wrap gap-x-12 gap-y-4 cq-xl:flex-col cq-xl:flex-nowrap";
const REGION_ROWS = "flex min-w-0 max-w-xs flex-col gap-2 cq-lg:max-w-none";
const REGION_TABLE = "flex min-w-0 max-w-xs flex-col gap-2 cq-xl:max-w-none";

export function PanelRegions({
  regions,
  label,
  table = false,
}: {
  regions: PanelRegion[];
  label: string;
  /** True on table pages, whose panel sits beside the main column only from `cq-xl`. */
  table?: boolean;
}) {
  return (
    <aside aria-label={label} className={table ? ASIDE_TABLE : ASIDE_ROWS}>
      {regions.map((r) => (
        <section key={r.heading} className={table ? REGION_TABLE : REGION_ROWS}>
          <h2 className="text-xs font-medium text-content-secondary">{r.heading}</h2>
          <div className="text-sm text-content">{r.content}</div>
        </section>
      ))}
    </aside>
  );
}

export function PanelGlance({
  figure,
  unit,
  of,
  lines,
  source,
}: {
  figure: string;
  unit: string;
  of?: [number, number];
  lines?: [string, string][];
  source: string;
}) {
  const pct = of && of[1] > 0 ? Math.min(100, Math.max(0, Math.round((of[0] / of[1]) * 100))) : 0;
  return (
    <div data-source={source} className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl text-content">{figure}</span>
        <span className="text-sm text-content-secondary">{unit}</span>
      </div>
      {of ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
          <div className="h-full bg-content" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {lines?.length ? (
        <dl className="flex flex-col gap-1 text-sm">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-content-secondary">{k}</dt>
              <dd className="text-content">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function PanelAttention(
  props: { lead: string; title: string; action?: React.ReactNode } | { none: string },
) {
  if ("none" in props) {
    return <p className="text-sm text-content-secondary">{props.none}</p>;
  }
  return (
    <div className={"flex flex-col gap-2 border-l-2 border-status-warning pl-3"}>
      <p className="flex items-start gap-2 text-sm text-content">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
        <span>
          <strong>{props.lead}:</strong> {props.title}
        </span>
      </p>
      {props.action ? <div>{props.action}</div> : null}
    </div>
  );
}

/** At most four links; the rest are not rendered. */
export function PanelLinks({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).slice(0, 4);
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}
