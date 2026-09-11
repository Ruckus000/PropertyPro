'use client';

import { SUPPORT_MAILBOXES, SUPPORT_MAILBOX_LABELS } from '@propertypro/shared';

import type { InboxOverview } from '@/lib/server/inbox';

interface MailboxSwitcherProps {
  overview: InboxOverview;
  active: string;
  onChange: (value: string) => void;
}

/**
 * Four cards — All plus the three mailboxes — each showing its open-thread
 * count. Counts come from `getInboxOverview`'s in-memory fold, so they are
 * counts of the loaded page (`PLATFORM_LIST_LIMIT`), not necessarily the
 * whole table — see the docblock on `InboxOverview.byMailbox`.
 */
export function MailboxSwitcher({ overview, active, onChange }: MailboxSwitcherProps) {
  const cards: Array<{ value: string; label: string; open: number }> = [
    { value: 'all', label: 'All', open: overview.stats.open },
    ...SUPPORT_MAILBOXES.map((mailbox) => ({
      value: mailbox,
      label: SUPPORT_MAILBOX_LABELS[mailbox],
      open: overview.byMailbox[mailbox].open,
    })),
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Mailbox">
      {cards.map((card) => {
        const isActive = card.value === active;
        return (
          <button
            key={card.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(card.value)}
            className={`min-h-11 rounded-lg border p-3 text-left transition-colors duration-quick md:min-h-9 ${
              isActive
                ? 'border-interactive bg-interactive-subtle'
                : 'border-edge bg-surface-card hover:bg-surface-hover'
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-content-tertiary">{card.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-content">
              {card.open}
              <span className="ml-1 text-xs font-normal text-content-tertiary">open</span>
            </p>
          </button>
        );
      })}
    </div>
  );
}
