/**
 * Site settings' tabs: their ids, labels, what each says about saving, and how
 * `?view=settings&tab=<id>` is read.
 *
 * A plain module, not `'use client'`: the editor's server page reads
 * `parseEditorLocation` (a constant exported from a client module reaches a
 * server component as an unusable reference), and the view reads the tab list.
 */

import type { EditorView } from '../EditorTopBar';

export const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'pages', label: 'Pages' },
  { id: 'design', label: 'Design' },
  { id: 'notice', label: 'Notice' },
  { id: 'address', label: 'Address & domain' },
  { id: 'search', label: 'Search & sharing' },
  { id: 'access', label: 'Access & visibility' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'general';

export function isSettingsTabId(value: unknown): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

/**
 * What each tab tells the manager about saving, read from the tab's actual
 * write paths (checked 2026-10-29), so a manager is never told a change waits
 * for Publish when it is already public, or the other way round.
 *
 * - `general`: the footer is `PATCH /api/v1/pm/site/settings`; the site icon is
 *   the favicon upload, finalised on pick. Both are live.
 * - `pages`: adding a page and removing a published one are draft; deleting a
 *   page that was never published is immediate (`DELETE` with no staging); a
 *   published page's name, menu visibility and order are live
 *   (`describeLiveImmediacy`).
 * - `design`: the colour set, custom colours and fonts are `draftLook`
 *   (`PATCH /api/v1/pm/site/design`) and wait for Publish; logos save to the
 *   live branding (`PATCH /api/v1/pm/branding`).
 * - `notice`: `POST /api/v1/pm/site/urgent-notice` posts to the live site.
 * - `address`: connecting a domain is live-immediate (`DomainPanel`).
 * - `search`: site settings (live), the sharing image (live on upload) and
 *   per-page search settings (live on save).
 * - `access`: nothing here writes.
 */
export const SETTINGS_SAVE_NOTES: Readonly<Record<SettingsTabId, string>> = {
  general: 'Saves immediately.',
  pages:
    "Adding a page and removing a published page wait for Publish. A page that was never published is deleted straight away. A published page's name, menu and order save immediately.",
  design: 'Saved as a draft until you publish. Logos save immediately.',
  notice: 'Saves immediately.',
  address: 'Saves immediately.',
  search: 'Saves immediately.',
  access: 'Nothing to save here. Each document is opened to the public in Documents.',
};

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Which area the editor opens on, from the page's search params.
 * `?view=settings&tab=pages` opens Site settings on Pages. An unknown tab opens
 * General; a `tab` without `view=settings` is ignored, so a stray parameter
 * never takes a manager away from their page.
 */
export function parseEditorLocation(params: {
  view?: ParamValue;
  tab?: ParamValue;
}): { view: EditorView; tab: SettingsTabId } {
  if (first(params.view) !== 'settings') {
    return { view: 'website', tab: DEFAULT_SETTINGS_TAB };
  }
  const tab = first(params.tab);
  return { view: 'settings', tab: isSettingsTabId(tab) ? tab : DEFAULT_SETTINGS_TAB };
}
