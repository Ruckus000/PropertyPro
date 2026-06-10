import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HelpWidgetProvider, useHelpWidget } from '@/components/help/help-widget-provider';

// jsdom doesn't implement window.matchMedia — stub it so the keyboard-shortcut
// useEffect in HelpWidgetProvider doesn't throw.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <HelpWidgetProvider>{children}</HelpWidgetProvider>
);

describe('HelpWidgetProvider article stack', () => {
  it('pushes on openArticle, exposes top as selectedArticle', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.openArticle('compliance', 'b'));
    expect(result.current.selectedArticle).toEqual({ category: 'compliance', slug: 'b' });
    expect(result.current.stackDepth).toBe(2);
    expect(result.current.isOpen).toBe(true);
  });

  it('does not push a duplicate of the current top', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.openArticle('compliance', 'a'));
    expect(result.current.stackDepth).toBe(1);
  });

  it('back pops to the previous article, then to the default view', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.openArticle('meetings', 'b'));
    act(() => result.current.back());
    expect(result.current.selectedArticle).toEqual({ category: 'compliance', slug: 'a' });
    act(() => result.current.back());
    expect(result.current.selectedArticle).toBeNull();
    expect(result.current.stackDepth).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });

  it('close clears the stack', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.stackDepth).toBe(0);
    expect(result.current.selectedArticle).toBeNull();
  });
});
