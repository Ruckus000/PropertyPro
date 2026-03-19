import React from 'react';

export interface PublicNoticeItem {
  id: number;
  title: string;
  meetingType: string;
  startsAt: string;
  location: string;
}

interface PublicNoticesProps {
  communityName: string;
  notices: PublicNoticeItem[];
  timezone: string;
}

function formatDate(value: string, timezone: string): string {
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

export function PublicNotices({ communityName, notices, timezone }: PublicNoticesProps) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-content-link">{communityName}</p>
        <h1 className="text-3xl font-semibold text-content">Notices</h1>
        <p className="text-sm text-content-secondary">
          Upcoming meetings and statutory notice postings for this community.
        </p>
      </header>

      <section className="mt-8 space-y-3">
        {notices.length === 0 ? (
          <p className="rounded-md border border-edge bg-surface-card p-4 text-sm text-content-secondary">
            No upcoming notices.
          </p>
        ) : (
          notices.map((notice) => (
            <article key={notice.id} className="rounded-md border border-edge bg-surface-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">{notice.meetingType}</p>
              <h2 className="mt-1 text-lg font-medium text-content">{notice.title}</h2>
              <p className="mt-2 text-sm text-content-secondary">{formatDate(notice.startsAt, timezone)}</p>
              <p className="text-sm text-content-secondary">{notice.location}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
