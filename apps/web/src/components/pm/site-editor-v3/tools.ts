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
 * The eight editor tools, in rail order (v4 builder, 2026-09-29).
 *
 * Labels are the design's, deliberately plain: "Colours" not "Theme",
 * "Address" not "Domain". The audience is a property manager, not a designer.
 *
 * v4 puts the tools a manager reaches for while BUILDING first — Add, Pages,
 * Sections, Colours — and the site-wide ones after. "Notice" stays high: it is
 * the tool used under time pressure, and the only one whose writes skip the
 * draft layer. "Site" and "Address" are here only until the Settings view
 * (plan Phase 5) gives them a home; removing them first would drop features.
 *
 * "Pages" stays next to "Sections" because Pages decides what Sections and the
 * canvas are showing — see the Phase 11b-3 note in git history.
 */
export const EDITOR_TOOLS = [
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'pages', label: 'Pages', icon: Files },
  { id: 'sections', label: 'Sections', icon: Layers },
  { id: 'styling', label: 'Colours', icon: Palette },
  { id: 'notice', label: 'Notice', icon: TriangleAlert },
  { id: 'site', label: 'Site', icon: Building2 },
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
 * **This map does NOT gate anything.** `ToolRail` is its only consumer and it
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
