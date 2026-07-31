import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Files,
  Layers,
  Plus,
  Palette,
  Globe,
  CircleHelp,
  TriangleAlert,
} from 'lucide-react';

/**
 * The eight editor tools, in tab order.
 *
 * Labels are the design's, deliberately plain: "Colours" not "Theme",
 * "Address" not "Domain". The audience is a property manager, not a designer.
 *
 * "Notice" sits directly after "Site" rather than at the end: it is the tool a
 * manager reaches for under time pressure, and it is also the only one whose
 * writes skip the draft layer, so burying it behind Help would be the wrong
 * trade in both directions.
 *
 * "Pages" (Phase 11b-3) sits immediately BEFORE "Sections" because that is the
 * order the work happens in: a manager picks the page, then edits the sections
 * on it. It is also why it is not appended at the end — "Sections" and "Add"
 * both operate on whichever page Pages selected, and a tool that changes what
 * the two tabs beside it are showing belongs next to them, not past Help.
 */
export const EDITOR_TOOLS = [
  { id: 'site', label: 'Site', icon: Building2 },
  { id: 'notice', label: 'Notice', icon: TriangleAlert },
  { id: 'pages', label: 'Pages', icon: Files },
  { id: 'sections', label: 'Sections', icon: Layers },
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'styling', label: 'Colours', icon: Palette },
  { id: 'domain', label: 'Address', icon: Globe },
  { id: 'help', label: 'Help', icon: CircleHelp },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type EditorToolId = (typeof EDITOR_TOOLS)[number]['id'];

/** Panel heading per tool — the tab label is abbreviated, this is not. */
export const TOOL_PANEL_TITLES: Record<EditorToolId, string> = {
  site: 'Site',
  notice: 'Urgent notice',
  pages: 'Pages',
  sections: 'Sections',
  add: 'Add a section',
  styling: 'Colours & fonts',
  domain: 'Web address',
  help: 'Help',
};

/**
 * Which plan feature gates each Pro tool.
 *
 * These are two INDEPENDENT flags, not one "is Professional" boolean — a
 * community can carry `hasSiteCustomDomain` without `hasSiteCustomCss` via the
 * per-community overrides in `packages/shared/src/features`. Collapsing them
 * mislabels one tab or the other. The legacy editor keeps them distinct too.
 *
 * **This map does NOT gate anything.** `ToolTabs` is its only consumer and it
 * uses membership here for exactly one thing: rendering
 * `<span className="sr-only">Professional feature</span>` on the tab. There is
 * no `disabled`, no changed `onClick`, no guard. A tool listed here is
 * *labelled* Pro, not locked — every panel that is genuinely gated (Colours,
 * Address) enforces that itself, inside the panel, and would still be gated if
 * this map were deleted.
 *
 * That is why "Pages" is absent. Multi-page ships wherever the editor ships
 * (the pages API carries no plan feature of its own), so there is nothing to
 * announce — and adding it here in the belief that it would restrict access
 * would ship an ungated feature wearing a Pro label. Any future gating of Pages
 * belongs in `PagesPanel`, not here.
 */
export const TOOL_PLAN_FEATURE = {
  styling: 'hasSiteCustomCss',
  domain: 'hasSiteCustomDomain',
} as const satisfies Partial<Record<EditorToolId, string>>;

export type ProToolId = keyof typeof TOOL_PLAN_FEATURE;

/** Per-tool unlock state, keyed by tool id. */
export type ProToolAccess = Record<ProToolId, boolean>;
