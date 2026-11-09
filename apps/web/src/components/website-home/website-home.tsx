'use client';

/**
 * The website overview (`/pm/website`, design D): the front door to the
 * association's website. Everything about what the site SAYS or how it LOOKS is
 * changed in the editor, as a draft, behind one primary button, **Edit
 * website**; this page shows where the site stands and holds what takes effect
 * the moment it is saved.
 *
 * Four tabs, in the URL as `?tab=` (`useUrlView`, so Back leaves the page):
 *
 * - **Overview**: what just happened (the publish, the "Email owners" offer),
 *   edits waiting to be published with **Keep editing** and **Review and
 *   publish**, a preview of the live site beside its status, the records still
 *   missing, and quick ways into the editor's Welcome and Look.
 * - **Records** (condos and HOAs): the Florida records list (`MissingRecordsAlert`).
 * - **Versions**: restore an earlier publish (`YourSiteCard`).
 * - **Settings**: everything that takes effect when saved: the contact details
 *   the site shows, the transparency page, and the site settings that moved out
 *   of the editor (`LiveSiteSettings`, loaded on the tab's first visit).
 *
 * Everything comes from the page's loader (`loadWebsiteHome`, D19); nothing
 * here reads the server on render. Dates print in the community's time zone,
 * relative to the moment the page rendered, so server and browser agree.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, ImageIcon, LayoutTemplate, Phone, Pencil } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TransparencyToggle } from '@/components/transparency/transparency-toggle';
import { useUrlView } from '@/hooks/use-url-view';
import { LOOK_SUMMARIES } from '@/lib/site-looks/look-summaries';
import type { WebsiteHomeData } from '@/lib/services/website-home-service';
import type { LiveSiteSettingsProps } from '@/components/pm/site-editor-v3/settings/LiveSiteSettings';
import { LookPreviewFrame } from './look-preview-frame';
import { MissingRecordsAlert } from './missing-records-alert';
import { SiteDetailsCard } from './site-details-card';
import { SiteStatusBanner } from './site-status-banner';
import { SiteStatusList } from './site-status-list';
import { TOUCH } from './touch';
import { LazyLiveSiteSettings } from './website-home-lazy';
import { YourSiteCard } from './your-site-card';

export interface WebsiteHomeProps {
  communityId: number;
  data: WebsiteHomeData;
  /** Arrived from the editor's publish (`?published=1`). */
  published: boolean;
  /** When the page was rendered, ISO 8601: what "3 days ago" is measured from. */
  now: string;
  /** The community's IANA time zone. */
  timeZone: string;
  /**
   * The Settings tab's site settings, seeded from the page's loader. The rest of
   * what they need (the address, whether the site is public) is in `data`.
   */
  siteSettings: Pick<
    LiveSiteSettingsProps,
    'community' | 'tagline' | 'initialSettings' | 'hasSiteCustomDomain' | 'initialNotice'
  >;
}

const FALLBACK_TIME_ZONE = 'America/New_York';
/** The live site's preview, laid out at a laptop's width and shrunk to the card. */
const PREVIEW = { width: 1120, height: 800 } as const;

const TABS = ['overview', 'records', 'versions', 'settings'] as const;
export type WebsiteTab = (typeof TABS)[number];

function coerceTab(raw: string | null): WebsiteTab {
  return (TABS as readonly string[]).includes(raw ?? '') ? (raw as WebsiteTab) : 'overview';
}

function formatterFor(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    // An unknown zone name throws; Florida is the product's home.
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: FALLBACK_TIME_ZONE });
  }
}

/** "3 changes saved as a draft": the edits plus a drafted look, which the count leaves out. */
function draftSummary(pendingDraftCount: number, lookDrafted: boolean): string {
  const n = pendingDraftCount + (lookDrafted ? 1 : 0);
  if (n === 0) return 'Changes saved as a draft, not live yet';
  return `${n} ${n === 1 ? 'change' : 'changes'} saved as a draft, not live yet`;
}

export function WebsiteHome({ communityId, data, published, now, timeZone, siteSettings }: WebsiteHomeProps) {
  const { facts, records } = data;
  const hasRecordsList = facts.communityType !== 'apartment';
  const { view: requested, setView } = useUrlView<WebsiteTab>('tab', coerceTab);
  // Apartments owe no records list, so they have no Records tab to land on.
  const tab: WebsiteTab = requested === 'records' && !hasRecordsList ? 'overview' : requested;

  const format = useMemo(() => {
    const dateTime = formatterFor(timeZone, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const date = formatterFor(timeZone, { weekday: 'long', month: 'long', day: 'numeric' });
    return {
      dateTime: (iso: string) => dateTime.format(new Date(iso)),
      date: (iso: string) => date.format(new Date(iso)),
    };
  }, [timeZone]);

  const editorHref = `/pm/website-editor?communityId=${communityId}`;
  // Only where the statute requires the records: then a missing one is a problem.
  const missingRequired = records.level === 'required' ? records.missing.length : 0;
  const lookDrafted = facts.draftLookId !== null && facts.draftLookId !== facts.liveLookId;
  const lookName = LOOK_SUMMARIES.find((look) => look.id === facts.liveLookId)?.name ?? 'An older look';
  const contactLine =
    [facts.profile.contactPhone, facts.profile.contactEmail].filter(Boolean).join(' · ') ||
    'Add a phone number and email';

  const tabLabels: Record<WebsiteTab, string> = {
    overview: 'Overview',
    records: 'Records',
    versions: 'Versions',
    settings: 'Settings',
  };
  const tabs = TABS.filter((id) => id !== 'records' || hasRecordsList);

  // One Tabs root around the header's tab list AND the panels, so each tab
  // controls a real `tabpanel` (Radix renders the active one).
  return (
    <Tabs value={tab} onValueChange={setView} className="space-y-6">
      <PageHeader
        title="Website"
        actions={
          <>
            <Button asChild variant="outline" className={TOUCH}>
              <a href={facts.siteUrl} target="_blank" rel="noreferrer">
                Visit site
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
            <Button asChild className={TOUCH}>
              <Link href={editorHref}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit website
              </Link>
            </Button>
          </>
        }
      >
        <TabsList aria-label="Website">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {tabLabels[id]}
              {id === 'records' && missingRequired > 0 ? (
                <>
                  {' '}
                  <span className="rounded-full bg-status-warning-subtle px-1.5 text-xs font-semibold text-status-warning">
                    {missingRequired}
                  </span>
                  <span className="sr-only"> missing</span>
                </>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </PageHeader>

      <TabsContent value="overview" className="mt-0">
        <section aria-labelledby="overview-heading" className="space-y-6">
          <h2 id="overview-heading" className="sr-only">
            Overview
          </h2>

          <SiteStatusBanner
            communityId={communityId}
            communityName={facts.profile.name}
            published={published}
            // Owners are told once the site is public: `site_published_at`, set from creation.
            offerEmail={data.liveNotice.offerable && data.sitePublished}
          />

          {facts.hasUnpublishedChanges && (
            <AlertBanner
              status="info"
              role="status"
              data-testid="draft-strip"
              title={draftSummary(facts.pendingDraftCount, lookDrafted)}
              description="Your website shows them once you publish."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="ghost" size="sm" className={TOUCH}>
                    <Link href={editorHref}>Keep editing</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className={TOUCH}>
                    <Link href={`${editorHref}&publish=1`}>Review and publish</Link>
                  </Button>
                </div>
              }
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <LookPreviewFrame
              communityId={communityId}
              lookId={null}
              title="Your website's home page"
              width={PREVIEW.width}
              height={PREVIEW.height}
              fit
              className="rounded-md border border-edge"
            />
            <SiteStatusList
              communityId={communityId}
              siteUrl={facts.siteUrl}
              liveLookId={facts.liveLookId}
              hasUnpublishedChanges={facts.hasUnpublishedChanges}
              lastPublish={data.lastPublish}
              records={
                records.level === 'required'
                  ? { posted: facts.recordsPosted, total: facts.recordsTotal, missing: missingRequired }
                  : null
              }
              onShowRecords={() => setView('records')}
              now={now}
              formatDateTime={format.dateTime}
            />
          </div>

          {missingRequired > 0 && (
            <AlertBanner
              status="warning"
              role="status"
              data-testid="records-attention"
              title={
                missingRequired === 1
                  ? '1 record Florida requires is missing'
                  : `${missingRequired} records Florida requires are missing`
              }
              description={records.missing
                .slice(0, 3)
                .map((item) => item.title)
                .join(', ')
                .concat(missingRequired > 3 ? ', and more.' : '.')}
              action={
                <Button type="button" className={TOUCH} onClick={() => setView('records')}>
                  Add records
                </Button>
              }
            />
          )}

          <section aria-labelledby="quick-edits-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="quick-edits-heading" className="text-base font-semibold text-content">
                Quick edits
              </h3>
              <p className="text-sm text-content-secondary">Changes wait for Publish.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <QuickEdit
                href={editorHref}
                icon={<ImageIcon className="size-4" aria-hidden="true" />}
                title="Welcome"
                line="The words and photo at the top of your home page"
              />
              <QuickEdit
                href={`${editorHref}&item=look`}
                icon={<LayoutTemplate className="size-4" aria-hidden="true" />}
                title="Look"
                line={lookName}
              />
              <QuickEdit
                onClick={() => setView('settings')}
                icon={<Phone className="size-4" aria-hidden="true" />}
                title="Contact details"
                line={contactLine}
              />
            </div>
            <p className="text-sm text-content-secondary">
              Meetings, news and records fill in by themselves from the rest of PropertyPro.
            </p>
          </section>
        </section>
      </TabsContent>

      {hasRecordsList && (
        <TabsContent value="records" className="mt-0">
          <MissingRecordsAlert
            communityId={communityId}
            records={records}
            progress={{ posted: facts.recordsPosted, total: facts.recordsTotal }}
            formatDate={format.date}
          />
        </TabsContent>
      )}

      <TabsContent value="versions" className="mt-0">
        <YourSiteCard
          communityId={communityId}
          liveLookId={facts.liveLookId}
          draftLookId={facts.draftLookId}
          pendingDraftCount={facts.pendingDraftCount}
          history={data.history}
          previousSnapshotId={data.previousSnapshotId}
          publishToken={data.publishToken}
          formatDateTime={format.dateTime}
        />
      </TabsContent>

      <TabsContent value="settings" className="mt-0">
        <section aria-labelledby="settings-heading" className="space-y-6">
          <div className="space-y-1">
            <h2 id="settings-heading" className="text-lg font-semibold text-content">
              Settings
            </h2>
            <p className="text-sm text-content-secondary">
              These take effect when you save them. What your website says and how it looks are
              changed in <Link href={editorHref} className="font-medium text-content-link underline">the editor</Link>,
              and wait for Publish.
            </p>
          </div>
          <SiteDetailsCard communityId={communityId} profile={facts.profile} />
          {hasRecordsList && (
            <section aria-labelledby="transparency-heading" className="space-y-3">
              <h3 id="transparency-heading" className="text-base font-semibold text-content">
                Transparency page
              </h3>
              <TransparencyToggle communityId={communityId} subdomain={data.slug} />
            </section>
          )}
          <LazyLiveSiteSettings
            communityId={communityId}
            {...siteSettings}
            publicSiteUrl={facts.siteUrl}
            hasPublishedSite={data.sitePublished}
          />
        </section>
      </TabsContent>
    </Tabs>
  );
}

type QuickEditProps = {
  icon: React.ReactNode;
  title: string;
  line: string;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/** One quick edit: a link into the editor's row, or a switch to this page's own tab. */
function QuickEdit({ icon, title, line, href, onClick }: QuickEditProps) {
  const className =
    'flex min-h-11 w-full flex-col gap-1 rounded-md border border-edge bg-surface-card p-4 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-content">
        {icon}
        {title}
      </span>
      <span className="break-words text-sm text-content-secondary">{line}</span>
    </>
  );
  return href !== undefined ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
