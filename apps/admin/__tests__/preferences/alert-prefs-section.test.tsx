// @vitest-environment jsdom
/**
 * The Settings alerts section.
 *
 * Two properties carry the weight here: every switch is reachable BY ITS
 * VISIBLE LABEL (Radix renders a bare `button role="switch"`, which takes no
 * label from the text beside it, so the `aria-label` is the only thing making
 * these operable by anything but a mouse), and a failed save REVERTS. A toggle
 * that silently did not persist is the one failure this screen must never have,
 * because nothing later contradicts it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertPrefsSection } from '@/components/settings/AlertPrefsSection';
import { DEFAULT_ALERT_PREFS, type AlertPrefs } from '@/lib/preferences/alert-prefs';

function okResponse(alertPrefs: AlertPrefs) {
  return new Response(JSON.stringify({ data: { alertPrefs } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function lastCall() {
  const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const call = calls[calls.length - 1]!;
  return { url: call[0] as string, init: call[1] as RequestInit };
}

beforeEach(() => {
  global.fetch = vi.fn(async () => okResponse(DEFAULT_ALERT_PREFS)) as unknown as typeof fetch;
});

describe('AlertPrefsSection — toggling', () => {
  it('PUTs the toggled pref and keeps the switch labelled', async () => {
    global.fetch = vi.fn(async () =>
      okResponse({ ...DEFAULT_ALERT_PREFS, newLeadsDigest: true }),
    ) as unknown as typeof fetch;

    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);

    const sw = screen.getByRole('switch', { name: 'New leads' });
    expect(sw.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(sw);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const { url, init } = lastCall();
    expect(url).toBe('/api/admin/preferences');
    expect(init.method).toBe('PUT');
    // ONLY the key that moved — a whole-object PUT would let a stale tab
    // resurrect four preferences the operator changed elsewhere.
    expect(JSON.parse(init.body as string)).toEqual({ alertPrefs: { newLeadsDigest: true } });

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'New leads' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
  });

  it('moves the switch before the request settles', async () => {
    let release: (r: Response) => void = () => {};
    global.fetch = vi.fn(
      () => new Promise<Response>((resolve) => { release = resolve; }),
    ) as unknown as typeof fetch;

    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    fireEvent.click(screen.getByRole('switch', { name: 'New leads' }));

    // Nothing has resolved; the control must already read as on.
    expect(screen.getByRole('switch', { name: 'New leads' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    release(okResponse({ ...DEFAULT_ALERT_PREFS, newLeadsDigest: true }));
  });

  it('exposes all five rows by their visible labels', () => {
    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    for (const name of [
      'Production error spikes',
      'Payment failures',
      'New support threads',
      'Deletion reminders',
      'New leads',
    ]) {
      expect(screen.getByRole('switch', { name })).toBeDefined();
    }
  });

  it('adopts the server\'s merged response rather than its own guess', async () => {
    // The server clamped. The screen must show what is STORED.
    global.fetch = vi.fn(async () =>
      okResponse({ ...DEFAULT_ALERT_PREFS, errorSpikeThreshold: 1000 }),
    ) as unknown as typeof fetch;

    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Payment failures' }));

    await waitFor(() =>
      expect(screen.getByText('Push + banner when errors exceed 1000/hr')).toBeDefined(),
    );
  });
});

describe('AlertPrefsSection — failure', () => {
  it('reverts the switch and raises an alert on a non-2xx', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;

    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    fireEvent.click(screen.getByRole('switch', { name: 'New leads' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('switch', { name: 'New leads' }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('reverts on a dropped request too', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    render(<AlertPrefsSection initial={{ ...DEFAULT_ALERT_PREFS, paymentFailures: true }} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Payment failures' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('switch', { name: 'Payment failures' }).getAttribute('aria-checked'))
      .toBe('true');
  });
});

describe('AlertPrefsSection — the error-spike threshold', () => {
  it('is a labelled field seeded from the stored value', () => {
    render(<AlertPrefsSection initial={{ ...DEFAULT_ALERT_PREFS, errorSpikeThreshold: 25 }} />);
    const input = screen.getByLabelText('Errors per hour before alerting') as HTMLInputElement;
    expect(input.value).toBe('25');
    expect(screen.getByText('Push + banner when errors exceed 25/hr')).toBeDefined();
  });

  it('commits on blur, not on every keystroke', async () => {
    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    const input = screen.getByLabelText('Errors per hour before alerting');

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.change(input, { target: { value: '250' } });
    // Three keystrokes, zero requests — "250" typed over "10" must not write
    // "2" and "25" first, with the last write to LAND deciding the value.
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.blur(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      alertPrefs: { errorSpikeThreshold: 250 },
    });
  });

  it('clamps client-side before sending, so the strict route cannot 400', async () => {
    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    const input = screen.getByLabelText('Errors per hour before alerting');

    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      alertPrefs: { errorSpikeThreshold: 1000 },
    });
  });

  it('does not write when the value did not move', () => {
    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    fireEvent.blur(screen.getByLabelText('Errors per hour before alerting'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('restores the stored value when the field is left empty', () => {
    render(<AlertPrefsSection initial={{ ...DEFAULT_ALERT_PREFS, errorSpikeThreshold: 25 }} />);
    const input = screen.getByLabelText('Errors per hour before alerting') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(input.value).toBe('25');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
