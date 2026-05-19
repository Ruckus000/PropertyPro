/**
 * Unit tests for SubdomainChecker (post-B5 split).
 *
 * Data/debounce/abort logic now lives in `useSubdomainAvailability`. These
 * tests mock the hook to a controllable return value and assert the presenter
 * surface only: helper-text color per reason, the rendered message, the
 * fallback hint when availability is null, and the `onChange` /
 * `onAvailabilityChange` wiring. The hook's own behavior is covered in
 * `apps/web/src/hooks/__tests__/use-subdomain-availability.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SubdomainAvailability } from '../../src/hooks/use-subdomain-availability';

const useSubdomainAvailabilityMock = vi.fn();

vi.mock('@/hooks/use-subdomain-availability', () => ({
  useSubdomainAvailability: (value: string, signupRequestId?: string) =>
    useSubdomainAvailabilityMock(value, signupRequestId),
}));

import { SubdomainChecker } from '../../src/components/signup/subdomain-checker';

function setHookState(state: SubdomainAvailability | null): void {
  useSubdomainAvailabilityMock.mockReturnValue(state);
}

function setup(value = 'seaside-villas', signupRequestId?: string) {
  const onChange = vi.fn();
  const onAvailabilityChange = vi.fn();
  const utils = render(
    <SubdomainChecker
      value={value}
      signupRequestId={signupRequestId}
      onChange={onChange}
      onAvailabilityChange={onAvailabilityChange}
    />,
  );
  return { ...utils, onChange, onAvailabilityChange };
}

describe('SubdomainChecker (presenter)', () => {
  beforeEach(() => {
    setHookState(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes value + signupRequestId through to the hook', () => {
    setHookState(null);
    setup('my-slug', 'req-123');
    expect(useSubdomainAvailabilityMock).toHaveBeenCalledWith('my-slug', 'req-123');
  });

  it('renders the neutral hint when availability is null', () => {
    setHookState(null);
    setup();
    expect(
      screen.getByText('Suggested from your community name. You can customize it.'),
    ).toBeTruthy();
  });

  it("uses success color for reason='available'", () => {
    setHookState({
      normalizedSubdomain: 'valid-slug',
      available: true,
      reason: 'available',
      message: 'Subdomain is available.',
    });
    setup('valid-slug');
    const helper = screen.getByText('Subdomain is available.');
    expect(helper.className).toContain('text-status-success');
  });

  it("uses tertiary color for reason='checking'", () => {
    setHookState({
      normalizedSubdomain: 'valid-slug',
      available: false,
      reason: 'checking',
      message: 'Checking availability...',
    });
    setup('valid-slug');
    const helper = screen.getByText('Checking availability...');
    expect(helper.className).toContain('text-content-tertiary');
  });

  it("uses tertiary color for reason='unknown'", () => {
    setHookState({
      normalizedSubdomain: 'valid-slug',
      available: false,
      reason: 'unknown',
      message:
        "We couldn't verify this subdomain right now — we'll check again when you submit.",
    });
    setup('valid-slug');
    const helper = screen.getByText(/couldn't verify/i);
    expect(helper.className).toContain('text-content-tertiary');
    expect(helper.className).not.toContain('text-status-danger');
  });

  it("uses danger color for reason='invalid'", () => {
    setHookState({
      normalizedSubdomain: 'ab',
      available: false,
      reason: 'invalid',
      message: 'Subdomain must be at least 3 characters.',
    });
    setup('ab');
    const helper = screen.getByText('Subdomain must be at least 3 characters.');
    expect(helper.className).toContain('text-status-danger');
  });

  it("uses danger color for reason='taken' and reason='reserved'", () => {
    setHookState({
      normalizedSubdomain: 'valid-slug',
      available: false,
      reason: 'taken',
      message: 'That subdomain is taken.',
    });
    const { unmount } = setup('valid-slug');
    expect(screen.getByText('That subdomain is taken.').className).toContain(
      'text-status-danger',
    );
    unmount();

    setHookState({
      normalizedSubdomain: 'valid-slug',
      available: false,
      reason: 'reserved',
      message: 'That subdomain is reserved.',
    });
    setup('valid-slug');
    expect(screen.getByText('That subdomain is reserved.').className).toContain(
      'text-status-danger',
    );
  });

  it('forwards normalized input through onChange', () => {
    setHookState(null);
    const { onChange } = setup('');
    const input = screen.getByPlaceholderText('your-community');
    fireEvent.change(input, { target: { value: 'My Slug!!' } });
    // normalizeSignupSubdomain lowercases + strips invalid chars to hyphens.
    expect(onChange).toHaveBeenCalledTimes(1);
    const forwarded = onChange.mock.calls[0]![0] as string;
    expect(forwarded).toBe(forwarded.toLowerCase());
    expect(forwarded).not.toContain('!');
  });

  it('relays hook state to onAvailabilityChange', () => {
    const state: SubdomainAvailability = {
      normalizedSubdomain: 'valid-slug',
      available: true,
      reason: 'available',
      message: 'Subdomain is available.',
    };
    setHookState(state);
    const { onAvailabilityChange } = setup('valid-slug');
    expect(onAvailabilityChange).toHaveBeenLastCalledWith(state);
  });

  it('disables the input when disabled', () => {
    setHookState(null);
    const onChange = vi.fn();
    const onAvailabilityChange = vi.fn();
    render(
      <SubdomainChecker
        value="x"
        onChange={onChange}
        onAvailabilityChange={onAvailabilityChange}
        disabled
      />,
    );
    const input = screen.getByPlaceholderText('your-community') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
