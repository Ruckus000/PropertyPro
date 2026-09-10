'use client';

/**
 * AttentionQueue — the dashboard's "needs attention" list, one row per
 * `NavSignalKey` that currently has a non-zero count.
 *
 * `ShellSignalItem` carries no field naming which provider produced it (the
 * shell only needs items sorted newest-first, not grouped), so each row's
 * "top item" line is resolved here by matching an item's `href` back to the
 * nav entry that owns that signal (exact match, a nested path, or a query
 * string on the same path — the three shapes the providers actually emit).
 * Rows with no matching item fall back to a generic count line.
 *
 * Per the task brief: no per-row "signal failed" state here.
 * `ShellSignals.failed` is deliberately unconsumed until Wave 3's Health
 * surface.
 */
import Link from 'next/link';
import { ChevronRight, Inbox as InboxIcon } from 'lucide-react';
import { EmptyState } from '@propertypro/ui';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, type AdminNavItem, type NavSignalKey } from '@/components/shell/nav-config';
import type { ShellSignals } from '@/lib/server/shell-signals';

interface AttentionQueueProps {
  signals: ShellSignals;
}

const SIGNAL_NAV_ITEMS = new Map<NavSignalKey, AdminNavItem>(
  NAV_GROUPS.flatMap((group) => group.items)
    .filter((item): item is AdminNavItem & { signal: NavSignalKey } => Boolean(item.signal))
    .map((item) => [item.signal, item]),
);

/** Written out per tone in full — see NotificationTray.tsx for why a template string here would be invisible to the class-resolution guard. */
const TONE_CLASSES: Record<'danger' | 'warning' | 'neutral', string> = {
  danger: 'bg-status-danger-subtle text-status-danger',
  warning: 'bg-status-warning-subtle text-status-warning',
  neutral: 'bg-status-neutral-subtle text-status-neutral',
};

const TONE_LABEL: Record<'danger' | 'warning' | 'neutral', string> = {
  danger: 'Critical',
  warning: 'Needs review',
  neutral: 'New',
};

function toneOf(item: AdminNavItem): 'danger' | 'warning' | 'neutral' {
  return item.tone === 'danger' ? 'danger' : item.tone === 'warning' ? 'warning' : 'neutral';
}

function matchesNavItem(itemHref: string, navHref: string): boolean {
  return itemHref === navHref || itemHref.startsWith(`${navHref}/`) || itemHref.startsWith(`${navHref}?`);
}

export function AttentionQueue({ signals }: AttentionQueueProps) {
  const rows = Array.from(SIGNAL_NAV_ITEMS.entries())
    .map(([key, navItem]) => ({
      key,
      navItem,
      count: signals.counts[key],
      topItem: signals.items.find((item) => matchesNavItem(item.href, navItem.href)),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
      <h2 className="mb-4 text-sm font-semibold text-content-secondary">Needs attention</h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Nothing needs attention"
          description="Open threads, past-due bills and other flags will show up here."
          size="sm"
        />
      ) : (
        <ul role="list" className="divide-y divide-edge">
          {rows.map(({ key, navItem, count, topItem }) => {
            const Icon = navItem.icon;
            const tone = toneOf(navItem);
            return (
              <li key={key}>
                <Link
                  href={navItem.href}
                  className="flex min-h-[44px] items-center gap-3 py-3 hover:bg-surface-hover md:min-h-[36px]"
                >
                  <span
                    aria-hidden="true"
                    className={cn('flex size-8 shrink-0 items-center justify-center rounded-sm', TONE_CLASSES[tone])}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-content">{count}</span>
                      <span className="text-sm font-medium text-content">{navItem.label}</span>
                    </span>
                    <span className="block truncate text-xs text-content-tertiary">
                      {topItem?.title ?? `${count} ${count === 1 ? 'item needs' : 'items need'} attention`}
                    </span>
                  </span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CLASSES[tone])}>
                    {TONE_LABEL[tone]}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-content-tertiary" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
