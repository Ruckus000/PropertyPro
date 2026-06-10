'use client';

/**
 * Help Widget state context — manages open/close state and the article
 * currently being viewed in the help docs modal. Follows the same pattern
 * as sidebar-context.tsx.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface SelectedArticle {
  category: string;
  slug: string;
}

interface HelpWidgetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectedArticle: SelectedArticle | null;
  openArticle: (category: string, slug: string) => void;
  /** Number of articles in the navigation stack. */
  stackDepth: number;
  /** Pop the top article off the stack (returns to previous article, or to default view when stack empties). */
  back: () => void;
  /**
   * Set by callers that will close the modal as part of a navigation
   * (e.g. a footer Link click). Consumed by HelpDeepLinkHandler to skip
   * stripping `?help=` from the URL on the *next* close — otherwise
   * router.replace races with the Link's navigation. Auto-clears after
   * one close.
   */
  markCloseAsNavigation: () => void;
  /** @internal — read by HelpDeepLinkHandler only. */
  consumeNavigationCloseFlag: () => boolean;
}

const HelpWidgetContext = createContext<HelpWidgetContextValue | null>(null);

export function HelpWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [articleStack, setArticleStack] = useState<SelectedArticle[]>([]);
  const navigationCloseRef = useRef(false);

  const selectedArticle = articleStack.length > 0 ? articleStack[articleStack.length - 1]! : null;

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setArticleStack([]);
  }, []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const openArticle = useCallback((category: string, slug: string) => {
    setArticleStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.category === category && top.slug === slug) return prev;
      return [...prev, { category, slug }];
    });
    setIsOpen(true);
  }, []);
  const back = useCallback(() => {
    setArticleStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);
  const markCloseAsNavigation = useCallback(() => {
    navigationCloseRef.current = true;
  }, []);
  const consumeNavigationCloseFlag = useCallback(() => {
    const flag = navigationCloseRef.current;
    navigationCloseRef.current = false;
    return flag;
  }, []);

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
    <HelpWidgetContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        selectedArticle,
        openArticle,
        stackDepth: articleStack.length,
        back,
        markCloseAsNavigation,
        consumeNavigationCloseFlag,
      }}
    >
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

/**
 * Same as useHelpWidget but returns `null` when no provider is mounted
 * instead of throwing. Used by components that ship across multiple shells
 * (e.g., PageHeader's help button — PageHeader works under both
 * authenticated AppShell and any future public layout).
 */
export function useHelpWidgetOptional(): HelpWidgetContextValue | null {
  return useContext(HelpWidgetContext);
}
