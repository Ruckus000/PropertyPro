import type { EditorToolId } from '../tools';
import type { EditorView } from '../EditorTopBar';
import type { SettingsTabId } from '../settings/SettingsView';

/**
 * What a guide's "Show me" does: open the part of the editor the guide is
 * about, after the drawer closes.
 */
export type HelpAction =
  | { kind: 'tool'; tool: EditorToolId }
  | { kind: 'settings'; tab: SettingsTabId }
  | { kind: 'publish' };

export interface GuideMeta {
  group: GuideGroup;
  /** The editor areas where this guide is listed first, under "Help with …". */
  views: readonly EditorView[];
  showMe?: { label: string; action: HelpAction };
}

export const GUIDE_GROUPS = [
  'Getting started',
  'Editing your site',
  'Documents & Florida law',
  'Site settings',
] as const;

export type GuideGroup = (typeof GUIDE_GROUPS)[number];

/**
 * The editor's guides (v4 Phase 3), in reading order.
 *
 * The words live in the MDX articles tagged `/pm/website-editor`, so the help
 * centre shows the same guides; this map holds only what is editor code — the
 * group each is listed under, and what "Show me" opens. An article tagged for
 * the editor but missing here is still listed, under "More help", so a new
 * article never disappears for want of a line in this file.
 *
 * Keyed by slug: slugs are unique within the manager section, the only section
 * the editor's readers see.
 */
export const EDITOR_GUIDES: Readonly<Record<string, GuideMeta>> = {
  'website-editor-overview': { group: 'Getting started', views: ['website', 'settings'] },
  'edit-words-and-photos': {
    group: 'Editing your site',
    views: ['website'],
    showMe: { label: 'Open Sections', action: { kind: 'tool', tool: 'sections' } },
  },
  'website-sections': {
    group: 'Editing your site',
    views: ['website'],
    showMe: { label: 'Open Add', action: { kind: 'tool', tool: 'add' } },
  },
  'website-pages': {
    group: 'Editing your site',
    views: ['website'],
    showMe: { label: 'Open Pages', action: { kind: 'tool', tool: 'pages' } },
  },
  'website-design': {
    group: 'Editing your site',
    views: ['website'],
    showMe: { label: 'Open Design', action: { kind: 'tool', tool: 'design' } },
  },
  'website-branding': {
    group: 'Editing your site',
    views: [],
    showMe: { label: 'Open Design', action: { kind: 'tool', tool: 'design' } },
  },
  'urgent-notice': {
    group: 'Editing your site',
    views: [],
    showMe: { label: 'Open Notice', action: { kind: 'tool', tool: 'notice' } },
  },
  'publish-website': {
    group: 'Editing your site',
    views: ['website', 'settings'],
    showMe: { label: 'Open Publish', action: { kind: 'publish' } },
  },
  // No Show me: the guide's steps are on the Documents PAGE, and the editor's
  // Documents panel has no upload control, so the button would land the PM
  // where none of them apply.
  'upload-document': {
    group: 'Documents & Florida law',
    views: [],
  },
  'florida-website-rules': {
    group: 'Documents & Florida law',
    views: [],
    showMe: { label: 'Open Documents', action: { kind: 'tool', tool: 'documents' } },
  },
  'website-domain': {
    group: 'Site settings',
    views: ['settings'],
    showMe: { label: 'Open Address & domain', action: { kind: 'settings', tab: 'address' } },
  },
  'website-search': {
    group: 'Site settings',
    views: ['settings'],
    showMe: { label: 'Open Search & sharing', action: { kind: 'settings', tab: 'search' } },
  },
};

const ORDER = Object.keys(EDITOR_GUIDES);

/** Sorts articles into the map's reading order; unknown slugs go last, in their given order. */
export function sortGuides<T extends { slug: string }>(articles: readonly T[]): T[] {
  const rank = (slug: string) => {
    const i = ORDER.indexOf(slug);
    return i === -1 ? ORDER.length : i;
  };
  return [...articles].sort((a, b) => rank(a.slug) - rank(b.slug));
}
