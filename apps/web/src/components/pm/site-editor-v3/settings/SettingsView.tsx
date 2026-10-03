'use client';

/**
 * The editor's Settings view (website builder v4, Phase 5): everything about
 * the site that is not a page — its name, address, search and sharing, and who
 * can see what.
 *
 * It replaces the rail's old "Site" and "Address" tools, and is code-split by
 * `EditorRoot` like every panel: the web JS aggregate has little headroom, and
 * a manager who never opens Settings should not pay for it.
 *
 * Everything here saves live, not on Publish — the same as the panels it
 * replaced, and every card says so. Deliberately absent (see the v4 plan's
 * Phase 5 deferrals): changing the PropertyPro address, taking the site
 * offline, and hiding the login button.
 */

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SiteSettingsRecord } from '@/hooks/use-site-settings';
import { DomainPanel } from '../panels/DomainPanel';
import { ShareImageField, SiteIconField, SitePanel, StorageMeter } from '../panels/SitePanel';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { PageSeoCard } from './PageSeoCard';
import { DEFAULT_SITE_SETTINGS, resolveSeoDescription } from '@/lib/site-editor/site-settings';

export interface SettingsViewProps {
  communityId: number;
  community: {
    name: string;
    slug: string;
    communityType: 'condo_718' | 'hoa_720' | 'apartment';
    city?: string | null;
  };
  tagline: string | null;
  initialSettings?: SiteSettingsRecord;
  /** The site's PropertyPro address, e.g. `https://sunset.getpropertypro.com/`. */
  publicSiteUrl: string | null;
  hasSiteCustomDomain: boolean;
  /** Back to the Website view with the Documents tool open. */
  onOpenDocuments: () => void;
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'address', label: 'Address & domain' },
  { id: 'search', label: 'Search & sharing' },
  { id: 'access', label: 'Access & visibility' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-edge bg-surface-card p-5">
      {title ? <h3 className="text-base font-semibold text-content">{title}</h3> : null}
      {children}
    </div>
  );
}

export function SettingsView({
  communityId,
  community,
  tagline,
  initialSettings,
  publicSiteUrl,
  hasSiteCustomDomain,
  onOpenDocuments,
}: SettingsViewProps) {
  const [tab, setTabState] = useState<TabId>('general');
  // Tabs opened so far. A panel mounts on its first visit and is then hidden,
  // not unmounted, when another tab is selected — so a half-typed footer note
  // survives a look at another tab. Mounting on first visit (not all four up
  // front) keeps opening Settings from firing every panel's reads at once.
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['general']));
  const setTab = (next: TabId) => {
    setTabState(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { data: record } = useSiteSettings(communityId, initialSettings);

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

  const address = publicSiteUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? null;


  // Each tab's content. Built as descriptions only; nothing mounts until its
  // panel renders it (below).
  const panels: Record<TabId, ReactNode> = {
    general: (
      <>
        <Card title="General">
          <div className="space-y-1">
            <p className="text-sm font-medium text-content">Site name</p>
            <p className="text-sm text-content" data-testid="settings-site-name">
              {community.name}
            </p>
            <p className="text-sm text-content-tertiary">
              Your site uses your community&apos;s name in its header, the browser tab and
              search results.
            </p>
          </div>
          <SiteIconField communityId={communityId} initialSettings={initialSettings} />
          {record?.storage ? <StorageMeter storage={record.storage} /> : null}
        </Card>
        <Card>
          <SitePanel
            part="footer"
            communityId={communityId}
            community={community}
            tagline={tagline}
            initialSettings={initialSettings}
          />
        </Card>
      </>
    ),
    address: (
      <>
        <Card title="Your PropertyPro address">
          <p className="text-sm text-content-secondary">
            This address always works, even after you connect your own domain.
          </p>
          {address ? (
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="rounded-[var(--radius-md)] bg-surface-muted px-3 py-2 font-mono text-sm text-content"
                data-testid="settings-address"
              >
                {address}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(publicSiteUrl ?? address)
                    .then(() => toast.success('Copied.'))
                    .catch(() => toast.error("Couldn't copy. Select the address and copy it."));
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy
              </Button>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">
              Your address isn&apos;t available right now.
            </p>
          )}
        </Card>
        <Card title="Use your own domain">
          <DomainPanel communityId={communityId} hasSiteCustomDomain={hasSiteCustomDomain} />
        </Card>
      </>
    ),
    search: (
      <>
        <Card>
          <SitePanel
            part="search"
            communityId={communityId}
            community={community}
            tagline={tagline}
            initialSettings={initialSettings}
          />
        </Card>
        <Card>
          <ShareImageField communityId={communityId} initialSettings={initialSettings} />
        </Card>
        <Card>
          <PageSeoCard
            communityId={communityId}
            communityName={community.name}
            // What a page's description falls back to: the site's, as the
            // public page computes it (its own default when none is set).
            siteDescription={resolveSeoDescription(
              record?.settings ?? DEFAULT_SITE_SETTINGS,
              community,
              tagline,
            )}
          />
        </Card>
      </>
    ),
    access: (
      <Card title="Who can see what">
        <p className="text-sm text-content">
          <span className="font-semibold">The pages you publish are open to everyone.</span>{' '}
          Anyone with the address can read them.
        </p>
        <p className="text-sm text-content">
          <span className="font-semibold">
            Official records are for owners and residents who sign in.
          </span>{' '}
          Each document stays private until you open it to the public, one at a time, in
          Documents.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onOpenDocuments}>
          Open Documents
        </Button>
      </Card>
    ),
  };

  return (
    <div
      data-testid="settings-view"
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start"
    >
      <div className="shrink-0 space-y-4 lg:sticky lg:top-8 lg:w-[220px]">
        <h2 className="font-display text-xl font-semibold text-content">Site settings</h2>
        <div
          role="tablist"
          aria-label="Site settings"
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
        <p className="text-xs text-content-tertiary">
          Changes here take effect as soon as you save them. They aren&apos;t part of Publish.
        </p>
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
            {visited.has(t.id) ? panels[t.id] : null}
          </div>
        ))}
      </div>
    </div>
  );
}
