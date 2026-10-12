import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useContextualHelpMock, widgetState } = vi.hoisted(() => ({
  useContextualHelpMock: vi.fn(),
  widgetState: { isOpen: false },
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/announcements' }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));
vi.mock('@/components/help/help-widget-provider', () => ({
  useHelpWidget: () => ({ isOpen: widgetState.isOpen, close: vi.fn() }),
}));
vi.mock('@/hooks/use-help', () => ({
  useHelpSearch: () => ({ data: undefined, error: null }),
  useContextualHelp: useContextualHelpMock,
}));

import { HelpWidget } from '@/components/help/help-widget';

beforeEach(() => {
  useContextualHelpMock.mockReset();
  useContextualHelpMock.mockReturnValue({ data: undefined, isFetching: false, isError: false });
});

describe('HelpWidget — contextual help', () => {
  it('does not fetch contextual articles while the drawer is closed', () => {
    widgetState.isOpen = false;
    render(<HelpWidget communityId={3} />);
    expect(useContextualHelpMock).toHaveBeenCalledWith(
      '/announcements',
      3,
      expect.objectContaining({ enabled: false }),
    );
  });

  it('fetches them once the drawer is open', () => {
    widgetState.isOpen = true;
    render(<HelpWidget communityId={3} />);
    // The hook treats an absent `enabled` as true.
    const options = useContextualHelpMock.mock.calls.at(-1)![2] as { enabled?: boolean };
    expect(options.enabled ?? true).toBe(true);
  });
});
