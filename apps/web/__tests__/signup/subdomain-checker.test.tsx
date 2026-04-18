import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SubdomainChecker,
  type SubdomainAvailability,
} from '../../src/components/signup/subdomain-checker';

function setup(initial = 'seaside-villas') {
  const onChange = vi.fn();
  const onAvailabilityChange = vi.fn();
  const utils = render(
    <SubdomainChecker
      value={initial}
      onChange={onChange}
      onAvailabilityChange={onAvailabilityChange}
    />,
  );
  return { ...utils, onChange, onAvailabilityChange };
}

async function flushDebounce(ms = 350): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('SubdomainChecker', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("maps preflight fetch failures to reason='unknown' with neutral copy", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network down'));

    const { onAvailabilityChange } = setup('valid-slug');
    await flushDebounce();

    const last = onAvailabilityChange.mock.calls.at(-1)?.[0] as
      | SubdomainAvailability
      | null;
    expect(last).toBeTruthy();
    expect(last?.reason).toBe('unknown');
    expect(last?.message).toMatch(/couldn't verify/i);
  });

  it("maps non-ok HTTP responses to reason='unknown' (not 'invalid')", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const { onAvailabilityChange } = setup('valid-slug');
    await flushDebounce();

    const last = onAvailabilityChange.mock.calls.at(-1)?.[0] as
      | SubdomainAvailability
      | null;
    expect(last?.reason).toBe('unknown');
  });

  it('reports invalid immediately for inputs shorter than 3 characters (no fetch)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const { onAvailabilityChange } = setup('ab');
    await flushDebounce();

    const last = onAvailabilityChange.mock.calls.at(-1)?.[0] as
      | SubdomainAvailability
      | null;
    expect(last?.reason).toBe('invalid');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates server reason='available' through onAvailabilityChange", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          normalizedSubdomain: 'valid-slug',
          available: true,
          reason: 'available',
          message: 'Subdomain is available.',
        },
      }),
    });

    const { onAvailabilityChange } = setup('valid-slug');
    await flushDebounce();

    const last = onAvailabilityChange.mock.calls.at(-1)?.[0] as
      | SubdomainAvailability
      | null;
    expect(last?.reason).toBe('available');
  });

  it("uses neutral (tertiary) color for reason='unknown'", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom'));

    setup('valid-slug');
    await flushDebounce();

    const helper = screen.getByText(/couldn't verify/i);
    expect(helper.className).toContain('text-content-tertiary');
    expect(helper.className).not.toContain('text-status-danger');
  });
});
