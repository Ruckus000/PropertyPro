'use client';

/**
 * Sidebar state context — shared between AppSidebar and AppTopBar.
 *
 * - `expanded`: desktop collapse/expand state, persisted in localStorage
 * - `mobileOpen`: mobile drawer open state, ephemeral
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'propertypro.nav-expanded';
const SECTIONS_STORAGE_KEY = 'propertypro.nav-sections';

interface SidebarContextValue {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  toggleExpanded: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  /** Open/closed state per collapsible nav section label. Absent label = open. */
  sectionOpen: Record<string, boolean>;
  toggleSection: (label: string) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpandedState] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Default to all-open ({}). NavRail treats a label absent from this map as open,
  // so an empty map renders every section expanded until the user collapses one.
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});

  // Hydrate from localStorage after mount (never read during render — SSR has no
  // localStorage, so reading it in useState would cause a hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        setExpandedState(JSON.parse(saved) as boolean);
      } catch {
        // ignore invalid stored value
      }
    }
    const savedSections = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (savedSections !== null) {
      try {
        const parsed = JSON.parse(savedSections) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setSectionOpen(parsed as Record<string, boolean>);
        }
      } catch {
        // ignore invalid stored value
      }
    }
  }, []);

  const toggleSection = useCallback((label: string) => {
    setSectionOpen((prev) => {
      // Absent label defaults to open, so the first toggle collapses it (false).
      const next = { ...prev, [label]: prev[label] === false };
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setExpanded = useCallback((v: boolean) => {
    setExpandedState(v);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpandedState((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        expanded,
        setExpanded,
        toggleExpanded,
        mobileOpen,
        setMobileOpen,
        sectionOpen,
        toggleSection,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return ctx;
}
