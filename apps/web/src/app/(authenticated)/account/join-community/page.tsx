'use client';

import { useState } from 'react';
import {
  CommunitySearch,
  type CommunitySearchResult,
} from '@/components/join-requests/community-search';
import { JoinRequestForm } from '@/components/join-requests/join-request-form';
import { AlertBanner } from '@/components/shared/alert-banner';

export default function JoinCommunityPage() {
  const [selected, setSelected] = useState<CommunitySearchResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Join Another Community</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Search for your community and submit a request to be added as an owner or tenant.
          A community admin will review your request.
        </p>
      </div>

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
          onDone={() => setSubmitted(true)}
          onBack={() => setSelected(null)}
        />
      )}
    </div>
  );
}
