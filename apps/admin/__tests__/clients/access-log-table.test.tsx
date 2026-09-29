// @vitest-environment jsdom
/**
 * AccessLogTable renders each support_access_log row's event as its label
 * (getSupportAccessEventLabel), keeping the raw event name in the cell's title.
 *
 * The support-write rows are written BEFORE the change they describe, so their
 * labels say "requested" — a row proves the operator asked, not that the change
 * landed. This pins the admin console to that wording, alongside the web
 * settings view (apps/web/__tests__/settings/support-access-settings.test.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function entry(id: number, event: string) {
  return {
    id,
    event,
    admin_user_id: 'admin-uuid-0000',
    metadata: null,
    created_at: '2026-09-29T12:00:00.000Z',
  };
}

async function renderTable(entries: ReturnType<typeof entry>[]): Promise<HTMLDivElement> {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/admin/support/access-log')) {
      return { ok: true, json: async () => ({ entries }) } as Response;
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });

  const { AccessLogTable } = await import('@/components/clients/AccessLogTable');
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<AccessLogTable communityId={42} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

function eventCells(container: HTMLElement): { text: string; title: string }[] {
  return Array.from(container.querySelectorAll('tbody tr')).map((row) => {
    const cell = row.querySelector('td')!;
    return { text: cell.textContent ?? '', title: cell.getAttribute('title') ?? '' };
  });
}

describe('AccessLogTable event labels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the support-write events as neutral "requested" labels, raw name in the title', async () => {
    const container = await renderTable([
      entry(1, 'support_profile_updated'),
      entry(2, 'support_phone_verification_sent'),
      entry(3, 'support_phone_verification_attempted'),
      entry(4, 'support_phone_verified'),
      entry(5, 'support_deletion_cancelled'),
    ]);

    expect(eventCells(container)).toEqual([
      { text: 'Profile change requested by support', title: 'support_profile_updated' },
      { text: 'Phone code send requested by support', title: 'support_phone_verification_sent' },
      { text: 'Phone code check requested by support', title: 'support_phone_verification_attempted' },
      { text: 'Phone verification requested by support', title: 'support_phone_verified' },
      { text: 'Deletion cancel requested by support', title: 'support_deletion_cancelled' },
    ]);
  });

  it('labels the session events and falls back to the raw name for an unknown one', async () => {
    const container = await renderTable([entry(1, 'session_started'), entry(2, 'some_future_event')]);

    expect(eventCells(container)).toEqual([
      { text: 'Session started', title: 'session_started' },
      { text: 'some_future_event', title: 'some_future_event' },
    ]);
  });
});
