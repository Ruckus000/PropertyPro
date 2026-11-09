/**
 * The editor's Pages & design tabs: their ids, labels, what each says about
 * saving, and how `?view=settings&tab=<id>` is read.
 *
 * The settings that take effect when saved (General, Notice, Address & domain,
 * Search & sharing, Access) moved to the website overview's Settings tab
 * (design D). Old links naming them are recognised (`MOVED_SETTINGS_TABS`) so
 * the editor's page can send them there.
 *
 * A plain module, not `'use client'`: the editor's server page reads
 * `parseEditorLocation` (a constant exported from a client module reaches a
 * server component as an unusable reference), and the view reads the tab list.
 */

import type { EditorView } from '../EditorTopBar';

export const SETTINGS_TABS = [
  { id: 'pages', label: 'Pages' },
  { id: 'design', label: 'Design' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'pages';

/** Tabs that moved to the website overview's Settings tab; old links still name them. */
export const MOVED_SETTINGS_TABS = ['general', 'notice', 'address', 'search', 'access'] as const;

export function isSettingsTabId(value: unknown): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

/**
 * What each tab tells the manager about saving, read from the tab's actual
 * write paths, so a manager is never told a change waits for Publish when it is
 * already public, or the other way round.
 *
 * - `pages`: adding a page and removing a published one are draft; deleting a
 *   page that was never published is immediate (`DELETE` with no staging); a
 *   published page's name, menu visibility and order are live
 *   (`describeLiveImmediacy`).
 *   ponytail: a published page's name, menu and order still save live
 *   (site_pages keeps one row per page, no draft columns), the one exception
 *   to "the editor drafts". Trigger: a support report of a page rename going
 *   public before Publish.
 * - `design`: the look, the colour set, custom colours and fonts are
 *   `draftLook` (`PATCH /api/v1/pm/site/design`, the look route) and wait for
 *   Publish. Logos, which are live, moved to the overview's Settings.
 */
export const SETTINGS_SAVE_NOTES: Readonly<Record<SettingsTabId, string>> = {
  pages:
    "Adding a page and removing a published page wait for Publish. A page that was never published is deleted straight away. A published page's name, menu and order save immediately.",
  design: 'Saved as a draft until you publish.',
};

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The editor's two modes. Simple is the welcome and the look beside a preview
 * of the home page; Advanced is the canvas, the inspector and Pages & design.
 */
export type EditorMode = 'simple' | 'advanced';

/** A Simple-mode row a link can open: the website overview's quick edits. */
export type SimpleItem = 'welcome' | 'look';

export interface EditorLocation {
  mode: EditorMode;
  view: EditorView;
  tab: SettingsTabId;
  /** The Simple row to open first. */
  item: SimpleItem;
  /** `?publish=1`: open the publish review on arrival ("Review and publish"). */
  openPublish: boolean;
  /**
   * The link names a settings tab that moved to the website overview
   * (`MOVED_SETTINGS_TABS`): the page sends it there.
   */
  settingsMoved: boolean;
}

/**
 * Where the editor opens, from the page's search params.
 *
 * - `?mode=advanced` opens Advanced; anything else is Simple, except that
 *   `?view=settings` (old links, Help screenshots) means Advanced, the only
 *   mode with Site settings.
 * - `?view=settings&tab=pages` opens Pages & design on Pages. An unknown tab
 *   opens Pages; a `tab` without `view=settings` is ignored, so a stray
 *   parameter never takes a manager away from their page. A tab that moved to
 *   the overview sets `settingsMoved`.
 * - `?item=look` opens Simple's Look row; anything else opens the welcome.
 */
export function parseEditorLocation(params: {
  mode?: ParamValue;
  view?: ParamValue;
  tab?: ParamValue;
  item?: ParamValue;
  publish?: ParamValue;
}): EditorLocation {
  const settings = first(params.view) === 'settings';
  const tab = first(params.tab);
  return {
    mode: settings || first(params.mode) === 'advanced' ? 'advanced' : 'simple',
    view: settings ? 'settings' : 'website',
    tab: settings && isSettingsTabId(tab) ? tab : DEFAULT_SETTINGS_TAB,
    item: first(params.item) === 'look' ? 'look' : 'welcome',
    openPublish: first(params.publish) === '1',
    settingsMoved: settings && (MOVED_SETTINGS_TABS as readonly string[]).includes(tab ?? ''),
  };
}
