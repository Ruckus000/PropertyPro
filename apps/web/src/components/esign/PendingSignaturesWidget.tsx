'use client';

import { useEffect, useState, useTransition } from 'react';
import { PenTool } from 'lucide-react';
import { EsignStatusBadge } from './EsignStatusBadge';

interface PendingSubmission {
  id: number;
  status: string;
  createdAt: string;
  templateId: number;
}

interface PendingSignaturesWidgetProps {
  communityId: number;
}

export function PendingSignaturesWidget({
  communityId,
}: PendingSignaturesWidgetProps) {
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/esign/submissions?communityId=${communityId}&status=pending`,
        );
        if (res.ok) {
          const data = await res.json();
          setSubmissions(data.data?.slice(0, 5) ?? []);
        }
      } catch {
        // Silently fail for widget
      }
    });
  }, [communityId]);

  if (isPending) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <PenTool className="h-4 w-4" />
          <span className="text-sm">Loading signatures...</span>
        </div>
      </div>
    );
  }

  if (submissions.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <PenTool className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">
          Pending Signatures ({submissions.length})
        </h3>
      </div>
      <ul className="space-y-2">
        {submissions.map((sub) => (
          <li
            key={sub.id}
            className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
          >
            <span className="text-gray-700">Submission #{sub.id}</span>
            <EsignStatusBadge status={sub.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
