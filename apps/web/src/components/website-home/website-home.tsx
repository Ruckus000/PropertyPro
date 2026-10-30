'use client';

/**
 * The website home (`/pm/website`, spec C2): the one place a board volunteer
 * comes back to for the association's website.
 *
 * Sections, in order: the site's status (and the one-time "Email owners"
 * offer), the Florida records still missing, meetings coming up, the profile
 * details the site shows, the site itself (look, edit, restore), and the
 * transparency page switch for condos and HOAs.
 *
 * Everything comes from the page's loader (`loadWebsiteHome`, D19); nothing
 * here reads the server on render. Dates print in the community's time zone,
 * relative to the moment the page rendered, so server and browser agree.
 */
import { useMemo } from 'react';
import { TransparencyToggle } from '@/components/transparency/transparency-toggle';
import type { WebsiteHomeData } from '@/lib/services/website-home-service';
import { ComingUpCard } from './coming-up-card';
import { MissingRecordsAlert } from './missing-records-alert';
import { SiteDetailsCard } from './site-details-card';
import { SiteStatusBanner } from './site-status-banner';
import { YourSiteCard } from './your-site-card';

export interface WebsiteHomeProps {
  communityId: number;
  data: WebsiteHomeData;
  /** Arrived from the look picker's publish (`?published=1`). */
  published: boolean;
  /** When the page was rendered, ISO 8601: what "3 days ago" is measured from. */
  now: string;
  /** The community's IANA time zone. */
  timeZone: string;
}

const FALLBACK_TIME_ZONE = 'America/New_York';

function formatterFor(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    // An unknown zone name throws; Florida is the product's home.
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: FALLBACK_TIME_ZONE });
  }
}

export function WebsiteHome({ communityId, data, published, now, timeZone }: WebsiteHomeProps) {
  const { facts } = data;
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
  const hasRecordsList = facts.communityType !== 'apartment';

  return (
    <div className="space-y-6">
      <SiteStatusBanner
        communityId={communityId}
        communityName={facts.profile.name}
        siteUrl={facts.siteUrl}
        published={published}
        // Owners are told once the site is public: `site_published_at`, set from creation.
        offerEmail={data.liveNotice.offerable && data.sitePublished}
      />

      <MissingRecordsAlert communityId={communityId} records={data.records} formatDate={format.date} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ComingUpCard communityId={communityId} meetings={data.upcomingMeetings} formatDateTime={format.dateTime} />
        <SiteDetailsCard communityId={communityId} profile={facts.profile} />
      </div>

      <YourSiteCard
        communityId={communityId}
        liveLookId={facts.liveLookId}
        draftLookId={facts.draftLookId}
        pendingDraftCount={facts.pendingDraftCount}
        lastPublish={data.lastPublish}
        history={data.history}
        previousSnapshotId={data.previousSnapshotId}
        publishToken={data.publishToken}
        now={now}
        formatDateTime={format.dateTime}
      />

      {hasRecordsList && (
        <section aria-labelledby="transparency-heading" className="space-y-3">
          <h2 id="transparency-heading" className="text-lg font-semibold text-content">
            Transparency page
          </h2>
          <TransparencyToggle communityId={communityId} subdomain={data.slug} />
        </section>
      )}
    </div>
  );
}
