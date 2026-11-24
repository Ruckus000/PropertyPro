'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { RecordList } from '@propertypro/ui/components/shared/record-row';
import {
  Section,
  SectionError,
  SectionFirstRun,
  SectionFooter,
  SectionToolbar,
} from '@propertypro/ui/components/shared/section';
import {
  useNotifications,
  useMarkRead,
  type NotificationFilters,
  type NotificationItem,
} from '@/hooks/use-notifications';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationsRow } from './notifications-row';

interface NotificationsPageClientProps {
  communityId: number;
}

const ALL = 'all';

const CATEGORY_TABS = [
  { value: ALL, label: 'All' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'document', label: 'Documents' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'violation', label: 'Violations' },
  { value: 'election', label: 'Elections' },
];

export function NotificationsPageClient({ communityId }: NotificationsPageClientProps) {
  const [category, setCategory] = useState(ALL);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<NotificationItem[]>([]);

  const filters: NotificationFilters = {
    limit: 20,
    category: category === ALL ? undefined : (category as NotificationFilters['category']),
    unreadOnly,
    cursor,
  };

  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } = useNotifications(
    communityId,
    filters,
  );
  const markRead = useMarkRead();

  // While the next page loads, the hook still hands back the previous page
  // (keepPreviousData). Those rows are already in `accumulated`.
  const currentPage = cursor && isPlaceholderData ? [] : (data?.data ?? []);
  const allItems = cursor ? [...accumulated, ...currentPage] : currentPage;
  // Also read from the previous page while the next one loads, so the button
  // stays in place (disabled) instead of blinking out.
  const nextCursor = data?.pagination.nextCursor ?? null;

  function resetPagination() {
    setCursor(undefined);
    setAccumulated([]);
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setAccumulated(allItems);
    setCursor(nextCursor);
  }

  let body: React.ReactNode;
  if (isError) {
    body = (
      <SectionError
        message="We couldn't load your notifications. Please try again."
        onRetry={() => void refetch()}
      />
    );
  } else if (isLoading) {
    body = (
      <div className="space-y-3 px-4 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (allItems.length === 0) {
    body = (
      <SectionFirstRun
        title="You're all caught up"
        headingLevel={2}
        description="New activity will appear here as it happens."
      />
    );
  } else {
    body = (
      <RecordList>
        {allItems.map((n) => (
          <NotificationsRow key={n.id} notification={n} communityId={communityId} />
        ))}
      </RecordList>
    );
  }

  const showFooter = !isError && allItems.length > 0;

  return (
    <PageLayout
      template="list"
      records="rows"
      header={
        <PageHeader
          title="Notifications"
          icon={<Bell />}
          description="Updates from your community, newest first."
        />
      }
    >
      <Section aria-busy={isLoading || isFetching}>
        <SectionToolbar
          filters={
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <QuickFilterTabs
                tabs={CATEGORY_TABS}
                active={category}
                onChange={(value) => {
                  setCategory(value);
                  resetPagination();
                }}
                tone="ink"
              />
              <div className="flex items-center justify-between gap-3 md:ml-auto">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-content-secondary md:min-h-0">
                  <Checkbox
                    checked={unreadOnly}
                    onCheckedChange={(checked) => {
                      setUnreadOnly(checked === true);
                      resetPagination();
                    }}
                  />
                  Unread only
                </label>
                <Button
                  variant="outline"
                  onClick={() => markRead.mutate({ communityId, all: true })}
                  disabled={markRead.isPending}
                >
                  Mark all read
                </Button>
              </div>
            </div>
          }
        />
        {body}
        {showFooter ? (
          <SectionFooter note={`Showing ${allItems.length}`}>
            {nextCursor ? (
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isFetching}>
                {isFetching ? 'Loading...' : 'Load more'}
              </Button>
            ) : null}
          </SectionFooter>
        ) : null}
      </Section>
    </PageLayout>
  );
}
