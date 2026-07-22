import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationProgress } from '@/components/navigation/navigation-progress';
import { NAVIGATION_START_EVENT } from '@/lib/navigation/navigation-progress-event';

let mockPathname = '/dashboard';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function dispatchNavigationStart() {
  act(() => {
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia(false);
  mockPathname = '/dashboard';
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('NavigationProgress', () => {
  it('renders nothing until a navigation starts', () => {
    render(<NavigationProgress />);
    expect(screen.queryByTestId('navigation-progress')).toBeNull();
  });

  it('shows the bar after the show delay and trickles below 100%', () => {
    render(<NavigationProgress />);
    dispatchNavigationStart();

    // Before the show delay elapses, nothing renders.
    advance(100);
    expect(screen.queryByTestId('navigation-progress')).toBeNull();

    advance(100);
    const bar = screen.getByTestId('navigation-progress');
    const inner = bar.firstElementChild as HTMLElement;
    expect(inner.style.width).toMatch(/%$/);
    expect(parseFloat(inner.style.width)).toBeGreaterThan(0);
    expect(parseFloat(inner.style.width)).toBeLessThan(100);
    expect(inner.style.opacity).toBe('1');
  });

  it('completes and hides when the route changes', () => {
    const { rerender } = render(<NavigationProgress />);
    dispatchNavigationStart();
    advance(300);
    expect(screen.getByTestId('navigation-progress')).toBeTruthy();

    mockPathname = '/documents';
    rerender(<NavigationProgress />);

    const inner = screen.getByTestId('navigation-progress')
      .firstElementChild as HTMLElement;
    expect(inner.style.width).toBe('100%');
    expect(inner.style.opacity).toBe('0');

    // After the fade the bar unmounts entirely.
    advance(300);
    expect(screen.queryByTestId('navigation-progress')).toBeNull();
  });

  it('completes on searchParams-only navigations', () => {
    const { rerender } = render(<NavigationProgress />);
    dispatchNavigationStart();
    advance(300);
    expect(screen.getByTestId('navigation-progress')).toBeTruthy();

    mockSearchParams = new URLSearchParams('communityId=2');
    rerender(<NavigationProgress />);
    advance(300);
    expect(screen.queryByTestId('navigation-progress')).toBeNull();
  });

  it('never flashes the bar when navigation finishes before the show delay', () => {
    const { rerender } = render(<NavigationProgress />);
    dispatchNavigationStart();

    // Route resolves within the 150ms show delay.
    advance(50);
    mockPathname = '/meetings';
    rerender(<NavigationProgress />);

    advance(1_000);
    expect(screen.queryByTestId('navigation-progress')).toBeNull();
  });

  it('force-hides via the safety timeout on same-URL navigations', () => {
    render(<NavigationProgress />);
    dispatchNavigationStart();
    advance(300);
    expect(screen.getByTestId('navigation-progress')).toBeTruthy();

    // Route never changes (e.g. link to the current page).
    advance(16_000);
    expect(screen.queryByTestId('navigation-progress')).toBeNull();
  });

  it('skips the trickle animation under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    render(<NavigationProgress />);
    dispatchNavigationStart();
    advance(200);

    const inner = screen.getByTestId('navigation-progress')
      .firstElementChild as HTMLElement;
    const initialWidth = inner.style.width;
    expect(initialWidth).toBe('85%');

    // Static: no trickle increments over time.
    advance(2_000);
    expect(inner.style.width).toBe(initialWidth);
  });
});
