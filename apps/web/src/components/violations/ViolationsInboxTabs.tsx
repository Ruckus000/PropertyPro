'use client';

/**
 * Wrapper that adds tabs (Violations | ARC Requests) to the violations inbox.
 */
import type { AnyCommunityRole } from '@propertypro/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ViolationsAdminInbox } from './ViolationsAdminInbox';
import { ArcSubmissionsTab } from './ArcSubmissionsTab';

interface ViolationsInboxTabsProps {
  communityId: number;
  userId: string;
  userRole: AnyCommunityRole;
}

export function ViolationsInboxTabs({
  communityId,
  userId,
  userRole,
}: ViolationsInboxTabsProps) {
  return (
    <Tabs defaultValue="violations" className="space-y-4">
      <TabsList>
        <TabsTrigger value="violations">Violations</TabsTrigger>
        <TabsTrigger value="arc">ARC Requests</TabsTrigger>
      </TabsList>

      <TabsContent value="violations">
        <ViolationsAdminInbox
          communityId={communityId}
          userId={userId}
          userRole={userRole}
        />
      </TabsContent>

      <TabsContent value="arc">
        <ArcSubmissionsTab communityId={communityId} />
      </TabsContent>
    </Tabs>
  );
}
