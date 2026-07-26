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

/** Tools gated behind the Professional plan (`hasSiteCustomCss` / `hasSiteCustomDomain`). */
export const PRO_TOOLS: ReadonlySet<EditorToolId> = new Set(['styling', 'domain']);
