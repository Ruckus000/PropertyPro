'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { EmptyState } from '@propertypro/ui';
import { cn } from '@/lib/utils';
import type { ShellSignalItem, SignalTone } from '@/lib/server/signals/types';
import { SIGNAL_ICONS } from './signal-icons';

export interface NotificationTrayProps {
  items: ShellSignalItem[];
  unread: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkAllRead: () => void;
}

/**
 * With no read timestamp, every item is unread. With one, only items whose
 * `occurredAt` is STRICTLY newer than `readAt` count — an item stamped
 * exactly at `readAt` is READ, not unread. Exported (not just used inline)
 * because Task 11 and Wave 4's push-notification dedupe both need this exact
 * boundary.
 */
export function countUnread(items: ShellSignalItem[], readAt: string | null): number {
  return readAt ? items.filter((item) => item.occurredAt > readAt).length : items.length;
}

/**
 * Tone -> icon-chip classes, written out per tone in full. Tailwind's source
 * scanner only sees class names it can find as literal text — a template
 * string like `bg-status-${tone}-subtle` is invisible to it and emits no
 * CSS, which is exactly the failure `guard:class-resolution` exists to catch.
 */
const TONE_CHIP_CLASSES: Record<SignalTone, string> = {
  danger: 'bg-status-danger-subtle text-status-danger',
  warning: 'bg-status-warning-subtle text-status-warning',
  info: 'bg-status-info-subtle text-status-info',
  brand: 'bg-status-brand-subtle text-status-brand',
  neutral: 'bg-status-neutral-subtle text-status-neutral',
};

/**
 * Bell trigger + slide-down panel of the seven-signal notification feed.
 * Controlled: `open`/`onOpenChange` live in the parent (`AdminTopBar`) so a
 * future outer click target (e.g. closing the tray when the search palette
 * opens) can drive it too.
 */
export function NotificationTray({ items, unread, open, onOpenChange, onMarkAllRead }: NotificationTrayProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape. Both listeners are attached only
  // while open, and both are reachable without a mouse: Escape is a keyboard
  // event by definition, and the "outside click" handler below never traps
  // focus — Tab still moves normally, it just also closes the tray once
  // focus (or a click) lands outside it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onOpenChange(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        aria-controls="admin-notification-tray"
        onClick={() => onOpenChange(!open)}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content md:size-9"
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-status-danger px-1 text-xs font-bold text-content-inverse"
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="admin-notification-tray"
          role="region"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-md border border-edge bg-surface-card shadow-e3"
        >
          <div className="flex items-center justify-between border-b border-edge px-4 py-3">
            <h2 className="text-sm font-semibold text-content">Notifications</h2>
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-xs font-medium text-interactive hover:underline"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="You're all caught up"
                description="No notifications right now."
                size="sm"
              />
            ) : (
              <ul role="list" className="divide-y divide-edge">
                {items.map((item) => {
                  const Icon = SIGNAL_ICONS[item.icon];
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex min-h-[44px] items-start gap-3 px-4 py-3 hover:bg-surface-hover"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-sm',
                            TONE_CHIP_CLASSES[item.tone],
                          )}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-content">{item.title}</span>
                          <span className="block truncate text-xs text-content-tertiary">{item.meta}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
