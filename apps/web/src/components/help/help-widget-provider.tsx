'use client';

/**
 * Help Widget state context — manages open/close state for the help drawer.
 * Follows the same pattern as sidebar-context.tsx.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface HelpWidgetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const HelpWidgetContext = createContext<HelpWidgetContextValue | null>(null);

export function HelpWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // ? keyboard shortcut (only on pointer devices, not in inputs)
  useEffect(() => {
    const isPointerDevice = window.matchMedia('(pointer: fine)').matches;
    if (!isPointerDevice) return;

    function handleKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <HelpWidgetContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </HelpWidgetContext.Provider>
  );
}

export function useHelpWidget(): HelpWidgetContextValue {
  const ctx = useContext(HelpWidgetContext);
  if (!ctx) {
    throw new Error('useHelpWidget must be used within a HelpWidgetProvider');
  }
  return ctx;
}
