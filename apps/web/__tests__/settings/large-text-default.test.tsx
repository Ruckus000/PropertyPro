// @vitest-environment jsdom
/**
 * Large text is the default (packages/ui/src/tokens/text-size.ts).
 *
 * The root layouts server-render `<html class="large-text">`; the inline head
 * script then removes it only for a browser that chose "standard" under the
 * NEW key. The old key's `'false'` must not survive — everyone was reset to
 * large once, on purpose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import {
  LARGE_TEXT_CLASS,
  LARGE_TEXT_INIT_SCRIPT,
  LEGACY_LARGE_TEXT_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
} from '@propertypro/ui/tokens';
import { useLargeText } from '@/hooks/use-large-text';
import { AccessibilitySettings } from '@/components/settings/accessibility-settings';

const html = () => document.documentElement;

/** What the server sends, before the head script has run. */
function serverRenderedDefault() {
  html().className = LARGE_TEXT_CLASS;
}

function runHeadScript() {
  new Function(LARGE_TEXT_INIT_SCRIPT)();
}

beforeEach(() => {
  window.localStorage.clear();
  serverRenderedDefault();
});

afterEach(() => {
  vi.restoreAllMocks();
  html().className = '';
});

describe('large-text head script', () => {
  it('keeps large text when this browser never chose', () => {
    runHeadScript();
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(true);
  });

  it('resets an old "off" choice to large, and deletes the old key', () => {
    window.localStorage.setItem(LEGACY_LARGE_TEXT_STORAGE_KEY, 'false');
    runHeadScript();
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(true);
    expect(window.localStorage.getItem(LEGACY_LARGE_TEXT_STORAGE_KEY)).toBeNull();
  });

  it('removes large text for a browser that chose standard under the new key', () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'standard');
    runHeadScript();
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(false);
  });

  it('keeps the server default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'standard');
    expect(() => runHeadScript()).not.toThrow();
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(true);
  });
});

describe('useLargeText', () => {
  it('reads the class on <html> as the current state', () => {
    html().classList.remove(LARGE_TEXT_CLASS);
    const { result } = renderHook(() => useLargeText());
    expect(result.current.largeText).toBe(false);
  });

  it('turning it off removes the class and remembers "standard"', () => {
    const { result } = renderHook(() => useLargeText());
    expect(result.current.largeText).toBe(true);

    act(() => result.current.setLargeText(false));
    expect(result.current.largeText).toBe(false);
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(false);
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe('standard');

    // And the next page load honours it.
    serverRenderedDefault();
    runHeadScript();
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(false);
  });

  it('turning it back on restores the class and remembers "large"', () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'standard');
    html().classList.remove(LARGE_TEXT_CLASS);
    const { result } = renderHook(() => useLargeText());

    act(() => result.current.setLargeText(true));
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(true);
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe('large');
  });
});

describe('Settings → Display', () => {
  it('shows the Large text switch on by default and turns it off', () => {
    render(<AccessibilitySettings />);
    const toggle = screen.getByRole('switch', { name: 'Large text' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(html().classList.contains(LARGE_TEXT_CLASS)).toBe(false);
  });
});
