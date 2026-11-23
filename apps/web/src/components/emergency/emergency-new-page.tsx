'use client';

/**
 * New alert on the page kit. Header, then the existing composer in the main
 * column with the props the page passed before. No panel: the composer holds
 * its own SMS preview and its own send controls (the one primary button).
 */
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Siren } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { BroadcastComposer } from '@/components/emergency/BroadcastComposer';

type Props = ComponentProps<typeof BroadcastComposer>;

export function EmergencyNewPage({
  communityId,
  communityName,
  communityType,
  smsEnabled,
  timeZone,
  source,
}: Props) {
  return (
    <PageLayout
      template="form"
      header={
        <PageHeader
          title="New alert"
          icon={<Siren />}
          description="Write the alert, choose who gets it, and review it before sending."
          actions={
            <Button asChild variant="outline">
              <Link href={`/emergency?communityId=${communityId}`}>Cancel</Link>
            </Button>
          }
        />
      }
    >
      <BroadcastComposer
        communityId={communityId}
        communityName={communityName}
        communityType={communityType}
        smsEnabled={smsEnabled}
        timeZone={timeZone}
        source={source}
      />
    </PageLayout>
  );
}
