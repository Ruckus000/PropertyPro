'use client';

/**
 * Sidebar state context — shared between AppSidebar and AppTopBar.
 *
 * - `expanded`: desktop collapse/expand state, persisted in localStorage
 * - `mobileOpen`: mobile drawer open state, ephemeral
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'propertypro.nav-expanded';

interface SidebarContextValue {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  toggleExpanded: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpandedState] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        setExpandedState(JSON.parse(saved) as boolean);
      } catch {
        // ignore invalid stored value
      }
    }
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
      value={{ expanded, setExpanded, toggleExpanded, mobileOpen, setMobileOpen }}
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
