'use client';

import { Card, StatusBadge, type StatusKey } from '@propertypro/ui';
import type { TransparencyMeetingNotice } from '@/lib/services/transparency-service';

interface Props {
  meetings: TransparencyMeetingNotice[];
  timezone: string;
}

function statusForMeeting(value: boolean | null): StatusKey {
  if (value == null) return 'neutral';
  return value ? 'completed' : 'overdue';
}

function statusLabel(value: boolean | null): string {
  if (value == null) return 'Not recorded';
  return value ? 'Requirement met' : 'Requirement missed';
}

function formatDate(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

function formatLeadTime(value: number | null, required: number): string {
  if (value == null) {
    return `Not recorded (min ${required}h)`;
  }

  return `${value}h (min ${required}h)`;
}

export function MeetingNoticeTable({ meetings, timezone }: Props) {
  return (
    <Card className="border-edge bg-surface-card">
      <Card.Header>
        <div className="flex flex-col">
          <Card.Title>Meeting Notice History</Card.Title>
          <Card.Subtitle>Last 12 months tracked in PropertyPro</Card.Subtitle>
        </div>
      </Card.Header>
      <Card.Body>
        {meetings.length === 0 ? (
          <p className="rounded-md border border-edge bg-surface-page p-3 text-sm text-content-secondary">
            No meeting notices have been recorded in PropertyPro for the last 12 months.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-content-tertiary">
                  <tr>
                    <th className="pb-2">Meeting</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Notice Posted</th>
                    <th className="pb-2">Lead Time</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-subtle text-content-secondary">
                  {meetings.map((meeting) => (
                    <tr key={meeting.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-content">{meeting.title}</p>
                        <p className="text-xs text-content-tertiary">Starts: {formatDate(meeting.startsAt, timezone)}</p>
                      </td>
                      <td className="py-3 pr-3 capitalize">{meeting.meetingType}</td>
                      <td className="py-3 pr-3">
                        {meeting.noticePostedAt ? formatDate(meeting.noticePostedAt, timezone) : 'Not recorded'}
                      </td>
                      <td className="py-3 pr-3">{formatLeadTime(meeting.leadTimeHours, meeting.requiredLeadTimeHours)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={statusForMeeting(meeting.metRequirement)} showLabel={false} />
                          <span>{statusLabel(meeting.metRequirement)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 sm:hidden">
              {meetings.map((meeting) => (
                <article key={`mobile-${meeting.id}`} className="rounded-md border border-edge p-3">
                  <h3 className="text-sm font-semibold text-content">{meeting.title}</h3>
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">{meeting.meetingType}</p>
                  <dl className="mt-2 space-y-1 text-sm text-content-secondary">
                    <div>
                      <dt className="inline font-medium text-content-secondary">Starts: </dt>
                      <dd className="inline">{formatDate(meeting.startsAt, timezone)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-content-secondary">Notice Posted: </dt>
                      <dd className="inline">{meeting.noticePostedAt ? formatDate(meeting.noticePostedAt, timezone) : 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-content-secondary">Lead Time: </dt>
                      <dd className="inline">{formatLeadTime(meeting.leadTimeHours, meeting.requiredLeadTimeHours)}</dd>
                    </div>
                  </dl>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium text-content-secondary">
                    <StatusBadge status={statusForMeeting(meeting.metRequirement)} showLabel={false} />
                    <span>{statusLabel(meeting.metRequirement)}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
