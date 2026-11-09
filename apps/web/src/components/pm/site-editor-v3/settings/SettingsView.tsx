'use client';

/**
 * The editor's Pages & design view (website builder v4, Phase 5; design D):
 * the site's pages, and its look, colours and fonts. Both are drafts that wait
 * for Publish, like everything else in the editor (with the one exception the
 * Pages note states).
 *
 * The settings that take effect when saved (site icon and footer, logos,
 * address and domain, search and sharing, the urgent notice, who can see what)
 * moved to the website overview's Settings tab (`LiveSiteSettings`).
 *
 * Code-split by `EditorRoot` like every panel, and each tab's panel is loaded on
 * its first visit (`settings-panels-lazy`): the web JS aggregate has little
 * headroom. Each tab opens with a line saying how it saves
 * (`SETTINGS_SAVE_NOTES`).
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DesignPanelProps } from '../panels/DesignPanel';
import type { PagesPanelProps } from '../panels/PagesPanel';
import { LazyDesignPanel, LazyPagesPanel } from './settings-panels-lazy';
import { SettingsCard } from './settings-card';
import { DEFAULT_SETTINGS_TAB, SETTINGS_SAVE_NOTES, SETTINGS_TABS as TABS, type SettingsTabId } from './settings-tabs';

export type { SettingsTabId };

export interface SettingsViewProps {
  communityId: number;
  /**
   * A tab to bring forward — a Help guide's "Show me" (v4 Phase 3). A new
   * object per request, so asking for the tab already showing after the PM has
   * moved away still switches back.
   */
  tabRequest?: { tab: SettingsTabId } | null;
  /**
   * Told whenever the manager moves to another tab. `EditorRoot` keeps it and
   * hands it back as `tabRequest`, because choosing a page in the Pages tab
   * remounts the whole editor shell (the page-keyed provider): without this the
   * view would drop back to Pages.
   */
  onTabChange?: (tab: SettingsTabId) => void;
  /** The Pages tab: the editor's page selection, as `EditorRoot` holds it. */
  pagesPanel: Omit<PagesPanelProps, 'communityId'>;
  /** The Design tab: the looks, colour sets, custom colours and the theme that seeds them. */
  designPanel: Omit<DesignPanelProps, 'communityId'>;
}

type TabId = SettingsTabId;

export function SettingsView({
  communityId,
  tabRequest,
  onTabChange,
  pagesPanel,
  designPanel,
}: SettingsViewProps) {
  const initialTab = tabRequest?.tab ?? DEFAULT_SETTINGS_TAB;
  const [tab, setTabState] = useState<TabId>(initialTab);
  // Tabs opened so far. A panel mounts on its first visit and is then hidden,
  // not unmounted, when another tab is selected — so a half-typed footer note
  // survives a look at another tab. Mounting on first visit (not every tab up
  // front) keeps opening Settings from firing every panel's reads at once.
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set<TabId>([initialTab]));
  const setTab = (next: TabId) => {
    setTabState(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    onTabChange?.(next);
  };
  useEffect(() => {
    if (!tabRequest) return;
    setTabState(tabRequest.tab);
    setVisited((prev) => (prev.has(tabRequest.tab) ? prev : new Set(prev).add(tabRequest.tab)));
  }, [tabRequest]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The WAI-ARIA tabs pattern: arrows move between tabs and select them,
  // Home/End jump to the ends. Only the selected tab is in the Tab order.
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? index === last ? 0 : index + 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? index === 0 ? last : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  }

  // Each tab's content. Built as descriptions only; nothing mounts until its
  // panel renders it (below).
  const panels: Record<TabId, ReactNode> = {
    pages: (
      <SettingsCard title="Pages">
        <LazyPagesPanel communityId={communityId} {...pagesPanel} />
      </SettingsCard>
    ),
    design: (
      <SettingsCard title="Design">
        <LazyDesignPanel communityId={communityId} {...designPanel} />
      </SettingsCard>
    ),
  };

  return (
    <div
      data-testid="settings-view"
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start"
    >
      <div className="shrink-0 space-y-4 lg:sticky lg:top-8 lg:w-[220px]">
        <h2 className="text-xl font-semibold tracking-tight text-content">Pages &amp; design</h2>
        <div
          role="tablist"
          aria-label="Pages and design"
          aria-orientation="vertical"
          className="flex flex-wrap gap-1 lg:flex-col"
        >
          {TABS.map((t, index) => {
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`settings-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`settings-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={cn(
                  'min-h-11 rounded-[var(--radius-md)] border-l-2 px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  selected
                    ? 'border-interactive bg-surface-muted font-semibold text-content'
                    : 'border-transparent text-content-secondary hover:bg-surface-hover hover:text-content',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`settings-panel-${t.id}`}
            aria-labelledby={`settings-tab-${t.id}`}
            tabIndex={0}
            hidden={t.id !== tab}
            className="space-y-6 focus-visible:outline-none"
          >
            {visited.has(t.id) ? (
              <>
                <p
                  data-testid={`settings-save-note-${t.id}`}
                  className="text-sm text-content-secondary"
                >
                  {SETTINGS_SAVE_NOTES[t.id]}
                </p>
                {panels[t.id]}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
