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
}

function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PublicNotices({ communityName, notices }: PublicNoticesProps) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{communityName}</p>
        <h1 className="text-3xl font-semibold text-gray-900">Notices</h1>
        <p className="text-sm text-gray-600">
          Upcoming meetings and statutory notice postings for this community.
        </p>
      </header>

      <section className="mt-8 space-y-3">
        {notices.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No upcoming notices.
          </p>
        ) : (
          notices.map((notice) => (
            <article key={notice.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{notice.meetingType}</p>
              <h2 className="mt-1 text-lg font-medium text-gray-900">{notice.title}</h2>
              <p className="mt-2 text-sm text-gray-700">{formatDate(notice.startsAt)}</p>
              <p className="text-sm text-gray-600">{notice.location}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
