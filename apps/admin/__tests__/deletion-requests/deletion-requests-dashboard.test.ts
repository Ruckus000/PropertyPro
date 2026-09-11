import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { DeletionRequestsDashboard } from '@/components/deletion-requests/DeletionRequestsDashboard';
import { deletionRequestTestUtils } from '@/lib/server/deletion-requests';

describe('deletion requests dashboard', () => {
  it('renders initial requests without a loading spinner', () => {
    const html = renderToStaticMarkup(
      createElement(DeletionRequestsDashboard, {
        initialRequests: [
          {
            id: 1,
            requestType: 'community',
            userId: 'user-1',
            communityId: 42,
            status: 'cooling',
            coolingEndsAt: '2026-03-30T00:00:00.000Z',
            scheduledPurgeAt: '2026-04-02T00:00:00.000Z',
            purgedAt: null,
            cancelledAt: null,
            recoveredAt: null,
            interventionNotes: null,
            createdAt: '2026-03-25T00:00:00.000Z',
            requesterEmail: 'owner@example.com',
            requesterName: 'Olivia Owner',
            communityName: 'Seabreeze Condos',
          },
        ],
      }),
    );

    expect(html).toContain('Seabreeze Condos');
    expect(html).toContain('Cooling Off');
    expect(html).not.toContain('animate-spin');
  });

  it('summarizes cooling requests in an AlertBanner naming the target and cooling-end date', () => {
    const html = renderToStaticMarkup(
      createElement(DeletionRequestsDashboard, {
        initialRequests: [
          {
            id: 1,
            requestType: 'community',
            userId: 'user-1',
            communityId: 42,
            status: 'cooling',
            coolingEndsAt: '2026-03-30T00:00:00.000Z',
            scheduledPurgeAt: '2026-04-02T00:00:00.000Z',
            purgedAt: null,
            cancelledAt: null,
            recoveredAt: null,
            interventionNotes: null,
            createdAt: '2026-03-25T00:00:00.000Z',
            requesterEmail: 'owner@example.com',
            requesterName: 'Olivia Owner',
            communityName: 'Seabreeze Condos',
          },
        ],
      }),
    );

    expect(html).toContain('1 request is in the cooling-off period');
    // Rendered in the runner's local timezone (matches the component's own
    // `format` call), not hardcoded — a UTC midnight cooling-end can format
    // as the prior calendar day west of UTC.
    expect(html).toContain(`Seabreeze Condos (ends ${format(new Date('2026-03-30T00:00:00.000Z'), 'MMM d, yyyy')})`);
  });

  it('prefilters by requester email from initialEmailFilter (?q=)', () => {
    const requests = [
      {
        id: 1,
        requestType: 'community' as const,
        userId: 'user-1',
        communityId: 42,
        status: 'cooling' as const,
        coolingEndsAt: '2026-03-30T00:00:00.000Z',
        scheduledPurgeAt: null,
        purgedAt: null,
        cancelledAt: null,
        recoveredAt: null,
        interventionNotes: null,
        createdAt: '2026-03-25T00:00:00.000Z',
        requesterEmail: 'owner@example.com',
        requesterName: 'Olivia Owner',
        communityName: 'Seabreeze Condos',
      },
      {
        id: 2,
        requestType: 'user' as const,
        userId: 'user-2',
        communityId: null,
        status: 'cooling' as const,
        coolingEndsAt: '2026-03-30T00:00:00.000Z',
        scheduledPurgeAt: null,
        purgedAt: null,
        cancelledAt: null,
        recoveredAt: null,
        interventionNotes: null,
        createdAt: '2026-03-25T00:00:00.000Z',
        requesterEmail: 'other@example.com',
        requesterName: 'Other Person',
        communityName: null,
      },
    ];

    const html = renderToStaticMarkup(
      createElement(DeletionRequestsDashboard, {
        initialRequests: requests,
        initialEmailFilter: 'owner@example.com',
      }),
    );

    expect(html).toContain('Seabreeze Condos');
    expect(html).not.toContain('Other Person');
    expect(html).toContain('1 request');
  });

  it('formats requester metadata and mapped rows predictably', () => {
    expect(deletionRequestTestUtils.buildRequesterName({
      first_name: 'Olivia',
      last_name: 'Owner',
    })).toBe('Olivia Owner');

    expect(deletionRequestTestUtils.buildRequesterName({
      first_name: 123,
      last_name: null,
    } as unknown as Record<string, unknown>)).toBeNull();

    expect(deletionRequestTestUtils.mapDeletionRequests(
      [
        {
          id: 1,
          request_type: 'community',
          user_id: 'user-1',
          community_id: 42,
          status: 'cooling',
          cooling_ends_at: '2026-03-30T00:00:00.000Z',
          scheduled_purge_at: null,
          purged_at: null,
          cancelled_at: null,
          recovered_at: null,
          intervention_notes: null,
          created_at: '2026-03-25T00:00:00.000Z',
        },
      ],
      new Map([['user-1', { email: 'owner@example.com', name: 'Olivia Owner' }]]),
      new Map([[42, 'Seabreeze Condos']]),
    )).toEqual([
      expect.objectContaining({
        requestType: 'community',
        requesterEmail: 'owner@example.com',
        requesterName: 'Olivia Owner',
        communityName: 'Seabreeze Condos',
      }),
    ]);
  });
});
