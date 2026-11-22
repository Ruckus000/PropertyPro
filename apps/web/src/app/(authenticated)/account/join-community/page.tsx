'use client';

import { useState } from 'react';
import {
  CommunitySearch,
  type CommunitySearchResult,
} from '@/components/join-requests/community-search';
import { JoinRequestForm } from '@/components/join-requests/join-request-form';
import { MyJoinRequests } from '@/components/join-requests/my-join-requests';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageBody } from '@/components/shared/page-body';
import { PageHeader } from '@/components/shared/page-header';

export default function JoinCommunityPage() {
  const [selected, setSelected] = useState<CommunitySearchResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  return (
    <PageBody width="prose">
      <PageHeader title="Join Another Community" />

      {submitted ? (
        <AlertBanner
          status="success"
          title="Request submitted"
          description="You'll receive a notification when a community admin reviews your request."
        />
      ) : !selected ? (
        <CommunitySearch onSelect={(c) => setSelected(c)} />
      ) : (
        <JoinRequestForm
          communityId={selected.id}
          communityName={selected.name}
          communityType={selected.communityType}
          onDone={() => setSubmitted(true)}
          onBack={() => setSelected(null)}
        />
      )}

      <MyJoinRequests />
    </PageBody>
  );
}
