'use client';

/**
 * CrossCommunityNotificationDropdown
 *
 * Aggregated notification dropdown shown on the unified owner overview. Shows
 * notifications from every community the user belongs to, grouped by
 * community with a per-community "Mark all read" action. Each row navigates
 * to the originating community's portal.
 */
import { Bell } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCrossNotifications,
  useMarkRead,
  type CrossNotificationItem,
} from '@/hooks/use-notifications';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface CommunityGroup {
  id: number;
  name: string;
  slug: string;
  notifications: CrossNotificationItem[];
  hasUnread: boolean;
}

function groupByCommunity(
  notifications: CrossNotificationItem[],
): CommunityGroup[] {
  const map = new Map<number, CommunityGroup>();
  for (const n of notifications) {
    const existing = map.get(n.community.id);
    if (existing) {
      existing.notifications.push(n);
      if (n.readAt === null) existing.hasUnread = true;
    } else {
      map.set(n.community.id, {
        id: n.community.id,
        name: n.community.name,
        slug: n.community.slug,
        notifications: [n],
        hasUnread: n.readAt === null,
      });
    }
  }
  return [...map.values()];
}

export function CrossCommunityNotificationDropdown() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError } = useCrossNotifications({ limit: 30 });
  const markRead = useMarkRead();

  const unread = data?.totalUnread ?? 0;
  const groups = useMemo(
    () => groupByCommunity(data?.notifications ?? []),
    [data?.notifications],
  );

  function handleMarkCommunityRead(communityId: number) {
    markRead.mutate({ communityId, all: true });
  }

  function buildHref(n: CrossNotificationItem): string {
    if (n.actionUrl) return n.actionUrl;
    return `https://${n.community.slug}.getpropertypro.com/notifications`;
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold leading-[18px] text-content-inverse"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="All notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-edge bg-surface-card shadow-lg"
        >
          <div className="border-b border-edge px-4 py-3">
            <h2 className="text-sm font-semibold text-content">All Notifications</h2>
            <p className="mt-0.5 text-xs text-content-secondary">
              Across all your communities
            </p>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {isError && (
              <div className="p-3">
                <AlertBanner
                  status="danger"
                  title="Couldn't load notifications"
                  description="Please try again later."
                  variant="subtle"
                />
              </div>
            )}

            {isLoading && (
              <div className="space-y-px p-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-md" />
                ))}
              </div>
            )}

            {!isLoading && !isError && groups.length === 0 && (
              <EmptyState
                icon="bell"
                title="You're all caught up"
                description="No notifications across your communities."
                size="sm"
              />
            )}

            {!isLoading && !isError && groups.length > 0 && (
              <div>
                {groups.map((group) => (
                  <section
                    key={group.id}
                    aria-labelledby={`cross-notif-group-${group.id}`}
                  >
                    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-surface-muted px-4 py-2">
                      <h3
                        id={`cross-notif-group-${group.id}`}
                        className="truncate text-xs font-semibold uppercase tracking-wide text-content-secondary"
                      >
                        {group.name}
                      </h3>
                      {group.hasUnread && (
                        <button
                          type="button"
                          onClick={() => handleMarkCommunityRead(group.id)}
                          disabled={markRead.isPending}
                          className="text-xs font-medium text-interactive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
                        >
                          Mark all read
                        </button>
                      )}
                    </header>
                    <ul role="list" className="divide-y divide-edge">
                      {group.notifications.map((n) => {
                        const isUnread = n.readAt === null;
                        return (
                          <li key={n.id}>
                            <a
                              href={buildHref(n)}
                              className={cn(
                                'flex min-h-[44px] items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                  isUnread ? 'bg-interactive' : 'bg-transparent',
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    'block truncate text-sm',
                                    isUnread
                                      ? 'font-semibold text-content'
                                      : 'font-normal text-content-secondary',
                                  )}
                                >
                                  {n.title}
                                  {isUnread && (
                                    <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-interactive">
                                      new
                                    </span>
                                  )}
                                </span>
                                {n.body && (
                                  <span className="mt-0.5 block line-clamp-2 text-xs text-content-tertiary">
                                    {n.body}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-xs text-content-tertiary">
                                {formatRelative(n.createdAt)}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
