import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NotificationPreferencesForm } from '../../src/components/settings/notification-preferences';

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('notification preferences form', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('hydrates frequency from GET and sends expanded PATCH payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            emailFrequency: 'daily_digest',
            emailAnnouncements: true,
            emailMeetings: false,
            inAppEnabled: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<NotificationPreferencesForm communityId={42} />);
      await flushEffects();
    });

    const select = container.querySelector(
      '#emailFrequency',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select?.value).toBe('daily_digest');

    await act(async () => {
      if (select) {
        select.value = 'weekly_digest';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/notification-preferences?communityId=42',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const patchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(patchBody).toEqual(
      expect.objectContaining({
        communityId: 42,
        emailFrequency: 'weekly_digest',
        emailAnnouncements: true,
        emailMeetings: false,
        inAppEnabled: true,
      }),
    );
  });

  it('includes emailFrequency from GET response in PATCH body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            emailFrequency: 'immediate',
            emailAnnouncements: true,
            emailMeetings: true,
            inAppEnabled: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<NotificationPreferencesForm communityId={77} />);
      await flushEffects();
    });

    const select = container.querySelector(
      '#emailFrequency',
    ) as HTMLSelectElement | null;
    expect(select?.value).toBe('immediate');

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    const patchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(patchBody['emailFrequency']).toBe('immediate');
  });
});
