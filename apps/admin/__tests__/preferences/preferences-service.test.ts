/**
 * The three data-access functions around `platform_admin_preferences`.
 *
 * The Supabase client is mocked at the smallest seam that can fail — a
 * `maybeSingle`/`single` thunk resolving `{ data, error }` — rather than by
 * re-implementing a chainable PostgREST builder. What is asserted is the
 * decision each function makes about the value it gets back, plus the exact
 * columns each write names (which is what keeps `Mark all read` from clobbering
 * an operator's alert preferences).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const maybeSingle = vi.fn();
const single = vi.fn();
const upsert = vi.fn();
const from = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({ from }),
}));

import {
  DEFAULT_ALERT_PREFS,
  getPreferences,
  markAllRead,
  updateAlertPrefs,
} from '@/lib/server/preferences';

const USER = '11111111-1111-4111-8111-111111111111';

/** A stored row as PostgREST returns it: snake_case, ISO strings. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    notifications_read_at: null,
    alert_prefs: {},
    push_sent_fingerprints: [],
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  upsert.mockReturnValue({ select: () => ({ single }) });
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    upsert,
  });
});

describe('getPreferences', () => {
  it('returns defaults when the operator has no row', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getPreferences(USER)).resolves.toEqual({
      notificationsReadAt: null,
      alertPrefs: DEFAULT_ALERT_PREFS,
      pushSentFingerprints: [],
    });
  });

  it('reads the row it has, parsing the jsonb through parseAlertPrefs', async () => {
    maybeSingle.mockResolvedValue({
      data: row({
        notifications_read_at: '2026-09-10T12:00:00.000Z',
        alert_prefs: { newLeadsDigest: true, errorSpikeThreshold: 9000, ghost: 1 },
        push_sent_fingerprints: ['abc', 7, 'def'],
      }),
      error: null,
    });

    await expect(getPreferences(USER)).resolves.toEqual({
      notificationsReadAt: '2026-09-10T12:00:00.000Z',
      alertPrefs: { ...DEFAULT_ALERT_PREFS, newLeadsDigest: true, errorSpikeThreshold: 1000 },
      // The CHECK guarantees an array, not what is in it.
      pushSentFingerprints: ['abc', 'def'],
    });
  });

  // A read failure must not 500 the console layout — see the module docblock.
  it('reports a read failure to Sentry and degrades to defaults', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    await expect(getPreferences(USER)).resolves.toEqual({
      notificationsReadAt: null,
      alertPrefs: DEFAULT_ALERT_PREFS,
      pushSentFingerprints: [],
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect((captureException.mock.calls[0]![0] as Error).message).toContain('connection reset');
  });

  it('hands back a fresh alertPrefs object each time, not the frozen default', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const first = await getPreferences(USER);
    expect(first.alertPrefs).not.toBe(DEFAULT_ALERT_PREFS);
  });
});

describe('updateAlertPrefs', () => {
  it('merges the patch over the stored value and upserts the whole object', async () => {
    maybeSingle.mockResolvedValue({
      data: row({ alert_prefs: { errorSpikes: false, retired: 'x' } }),
      error: null,
    });
    single.mockResolvedValue({
      data: row({ alert_prefs: { errorSpikes: false, newLeadsDigest: true, errorSpikeThreshold: 25 } }),
      error: null,
    });

    const result = await updateAlertPrefs(USER, { newLeadsDigest: true, errorSpikeThreshold: 25 });

    const payload = upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.user_id).toBe(USER);
    // The stored `errorSpikes: false` survives; the retired key does not.
    expect(payload.alert_prefs).toEqual({
      ...DEFAULT_ALERT_PREFS,
      errorSpikes: false,
      newLeadsDigest: true,
      errorSpikeThreshold: 25,
    });
    expect(typeof payload.updated_at).toBe('string');
    // Naming `notifications_read_at` here would reset the read watermark on
    // every switch flip.
    expect(payload).not.toHaveProperty('notifications_read_at');

    expect(result.alertPrefs.errorSpikeThreshold).toBe(25);
  });

  it('clamps a patch that arrives out of range even though Zod guards the route', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    single.mockResolvedValue({ data: row(), error: null });

    await updateAlertPrefs(USER, { errorSpikeThreshold: 0 });

    const payload = upsert.mock.calls[0]![0] as { alert_prefs: Record<string, unknown> };
    expect(payload.alert_prefs.errorSpikeThreshold).toBe(1);
  });

  // Writes do NOT degrade: the operator is owed the truth about whether the
  // toggle stuck, and the UI reverts on a non-2xx.
  it('throws when the write fails', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    single.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(updateAlertPrefs(USER, { errorSpikes: false })).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('markAllRead', () => {
  it('stamps the supplied instant and names ONLY the watermark columns', async () => {
    single.mockResolvedValue({
      data: row({ notifications_read_at: '2026-09-11T08:00:00.000Z' }),
      error: null,
    });

    const result = await markAllRead(USER, new Date('2026-09-11T08:00:00.000Z'));

    expect(upsert.mock.calls[0]![0]).toEqual({
      user_id: USER,
      notifications_read_at: '2026-09-11T08:00:00.000Z',
      updated_at: '2026-09-11T08:00:00.000Z',
    });
    // ON CONFLICT DO UPDATE touches only the named columns, so alert prefs and
    // the push ledger survive a `Mark all read`.
    expect(upsert.mock.calls[0]![0]).not.toHaveProperty('alert_prefs');
    expect(upsert.mock.calls[0]![0]).not.toHaveProperty('push_sent_fingerprints');

    expect(result.notificationsReadAt).toBe('2026-09-11T08:00:00.000Z');
  });

  it('defaults the instant to now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T09:30:00.000Z'));
    single.mockResolvedValue({ data: row(), error: null });

    await markAllRead(USER);

    expect((upsert.mock.calls[0]![0] as { notifications_read_at: string }).notifications_read_at)
      .toBe('2026-09-11T09:30:00.000Z');
    vi.useRealTimers();
  });

  it('throws when the write fails', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'check constraint' } });
    await expect(markAllRead(USER)).rejects.toThrow(/check constraint/);
  });
});
