import type { EditorView } from '../EditorTopBar';
import type { SettingsTabId } from '../settings/settings-tabs';

/**
 * What a guide's "Show me" does: open the part of the editor the guide is
 * about, after the drawer closes.
 *
 * - `add`: the Add a part dialog, adding to the end of the page being edited;
 * - `settings`: Site settings, on one tab;
 * - `publish`: the publish sheet.
 *
 * There is no tool rail any more (combined plan Task 28): sections are edited
 * on the page itself, and pages, design and the notice live in Site settings.
 */
export type HelpAction =
  | { kind: 'add' }
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
  // No Show me: a section is edited by selecting it on the page, which is what
  // the drawer closes onto. There is no list of sections to open any more.
  'edit-words-and-photos': {
    group: 'Editing your site',
    views: ['website'],
  },
  'website-sections': {
    group: 'Editing your site',
    views: ['website'],
    showMe: { label: 'Add a part', action: { kind: 'add' } },
  },
  // Pages, Design and the notice are Site settings tabs, so these guides are
  // listed first in Site settings too.
  'website-pages': {
    group: 'Editing your site',
    views: ['website', 'settings'],
    showMe: { label: 'Open Pages', action: { kind: 'settings', tab: 'pages' } },
  },
  'website-design': {
    group: 'Editing your site',
    views: ['website', 'settings'],
    showMe: { label: 'Open Design', action: { kind: 'settings', tab: 'design' } },
  },
  'website-branding': {
    group: 'Editing your site',
    views: ['settings'],
    showMe: { label: 'Open Design', action: { kind: 'settings', tab: 'design' } },
  },
  'urgent-notice': {
    group: 'Editing your site',
    views: ['settings'],
    showMe: { label: 'Open Notice', action: { kind: 'settings', tab: 'notice' } },
  },
  'publish-website': {
    group: 'Editing your site',
    views: ['website', 'settings'],
    showMe: { label: 'Open Publish', action: { kind: 'publish' } },
  },
  // No Show me: the guide's steps are on the Documents PAGE, which the editor
  // does not contain.
  'upload-document': {
    group: 'Documents & Florida law',
    views: [],
  },
  // No Show me: the records list is on the website home, which the top bar's
  // missing-records link opens. Leaving the editor from inside a guide would
  // be a surprise.
  'florida-website-rules': {
    group: 'Documents & Florida law',
    views: [],
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
