import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Files,
  Layers,
  Plus,
  Palette,
  CircleHelp,
  TriangleAlert,
} from 'lucide-react';

/**
 * The editor tools, in rail order (v4 builder, 2026-09-29).
 *
 * Labels are the design's, deliberately plain: "Design" not "Theme". The
 * audience is a property manager, not a designer.
 *
 * v4 puts the tools a manager reaches for while BUILDING first — Add, Pages,
 * Sections, Design — and the site-wide ones after. "Notice" stays high: it is
 * the tool used under time pressure, and the only one whose writes skip the
 * draft layer. The site's settings and web address are not tools: they live in
 * the Settings view (Phase 5), reached from the top bar.
 *
 * "Pages" stays next to "Sections" because Pages decides what Sections and the
 * canvas are showing — see the Phase 11b-3 note in git history.
 */
export const EDITOR_TOOLS = [
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'pages', label: 'Pages', icon: Files },
  { id: 'sections', label: 'Sections', icon: Layers },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'notice', label: 'Notice', icon: TriangleAlert },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type EditorToolId = (typeof EDITOR_TOOLS)[number]['id'];

/**
 * The rail's last tile. Not a tool: it opens the Help drawer on the right
 * (v4 Phase 3), which stays open beside whichever tool panel is showing, so it
 * is not one of the panels `activeTool` chooses between.
 */
export const HELP_RAIL_ITEM = { id: 'help', label: 'Help', icon: CircleHelp } as const;

/** The Help drawer's element id, for its openers' `aria-controls`. */
export const HELP_DRAWER_ID = 'site-editor-help';

/** Panel heading per tool — the tab label is abbreviated, this is not. */
export const TOOL_PANEL_TITLES: Record<EditorToolId, string> = {
  notice: 'Urgent notice',
  pages: 'Pages',
  sections: 'Sections',
  add: 'Add a section',
  design: 'Design',
  documents: 'Documents',
};
