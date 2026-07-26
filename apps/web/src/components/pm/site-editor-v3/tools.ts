import type { LucideIcon } from 'lucide-react';
import { Building2, Layers, Plus, Palette, Globe, CircleHelp } from 'lucide-react';

/**
 * The six editor tools, in tab order.
 *
 * Labels are the design's, deliberately plain: "Colours" not "Theme",
 * "Address" not "Domain". The audience is a property manager, not a designer.
 */
export const EDITOR_TOOLS = [
  { id: 'site', label: 'Site', icon: Building2 },
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
 */
export const TOOL_PLAN_FEATURE = {
  styling: 'hasSiteCustomCss',
  domain: 'hasSiteCustomDomain',
} as const satisfies Partial<Record<EditorToolId, string>>;

export type ProToolId = keyof typeof TOOL_PLAN_FEATURE;

/** Per-tool unlock state, keyed by tool id. */
export type ProToolAccess = Record<ProToolId, boolean>;
