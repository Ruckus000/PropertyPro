'use client';

import { useState } from 'react';
import { ArrowLeft, Menu, Search } from 'lucide-react';
import type { ShellSignals } from '@/lib/server/shell-signals';
import { NotificationTray, countUnread } from './NotificationTray';

export interface AdminTopBarProps {
  mobile: boolean;
  title: string;
  showBack: boolean;
  onBack: () => void;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  signals: ShellSignals;
  readAt: string | null;
  onMarkAllRead: () => void;
}

/**
 * The console's top bar: narrow-viewport menu/back/title on the left, the
 * search trigger (full on desktop, icon-only on mobile), and the
 * notification tray on the right. Task 11 wired this into `AdminShell` with
 * real `open`/navigation state — `mobile`, `showBack`, `signals`, `readAt`,
 * and the `onOpen*`/`onMarkAllRead` callbacks below all come from there now.
 */
export function AdminTopBar({
  mobile,
  title,
  showBack,
  onBack,
  onOpenDrawer,
  onOpenSearch,
  signals,
  readAt,
  onMarkAllRead,
}: AdminTopBarProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const unread = countUnread(signals.items, readAt);

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-edge bg-surface-card px-4 md:px-8">
      {mobile ? (
        <>
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open menu"
            className="flex size-11 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="flex size-11 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="flex size-11 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content"
          >
            <Search size={20} aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-[38px] w-[min(420px,100%)] items-center gap-2 rounded-sm border border-edge bg-surface-page px-3 text-sm text-content-tertiary hover:border-edge-strong"
        >
          <Search size={16} aria-hidden="true" />
          <span className="flex-1 truncate text-left">Search clients, threads, tickets, users…</span>
          <kbd className="rounded border border-edge bg-surface-card px-1.5 font-mono text-xs">⌘K</kbd>
        </button>
      )}

      <div className={mobile ? undefined : 'ml-auto'}>
        <NotificationTray
          items={signals.items}
          unread={unread}
          open={trayOpen}
          onOpenChange={setTrayOpen}
          onMarkAllRead={onMarkAllRead}
        />
      </div>
    </header>
  );
}
