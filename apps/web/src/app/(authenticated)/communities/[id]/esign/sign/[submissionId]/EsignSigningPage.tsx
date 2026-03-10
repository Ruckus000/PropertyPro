'use client';

import { useRouter } from 'next/navigation';
import { EsignForm } from '@/components/esign/EsignForm';
import { EsignStatusBadge } from '@/components/esign/EsignStatusBadge';

interface Signer {
  id: number;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

interface Submission {
  id: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface EsignSigningPageProps {
  communityId: number;
  submissionId: number;
  slug: string | null;
  submission: Submission;
  signers: Signer[];
}

export function EsignSigningPage({
  communityId,
  submissionId,
  slug,
  submission,
  signers,
}: EsignSigningPageProps) {
  const router = useRouter();

  function handleComplete() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Sign Document
          </h1>
          <p className="text-sm text-gray-500">
            Submission #{submissionId}
          </p>
        </div>
        <EsignStatusBadge status={submission.status} />
      </div>

      {/* Signer status list */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Signers</h2>
        <ul className="space-y-2">
          {signers.map((signer) => (
            <li
              key={signer.id}
              className="flex items-center justify-between text-sm"
            >
              <div>
                <span className="font-medium text-gray-900">
                  {signer.name ?? signer.email}
                </span>
                <span className="ml-2 text-gray-500">({signer.role})</span>
              </div>
              <EsignStatusBadge status={signer.status} />
            </li>
          ))}
        </ul>
      </div>

      {/* Signing form */}
      {slug && submission.status === 'pending' ? (
        <EsignForm slug={slug} onComplete={handleComplete} />
      ) : submission.status === 'completed' ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-sm font-medium text-green-800">
            This document has been fully signed.
          </p>
          {submission.completedAt && (
            <p className="mt-1 text-xs text-green-600">
              Completed on{' '}
              {new Date(submission.completedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : !slug ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-600">
            You are not an authorized signer for this document, or your
            signature has already been recorded.
          </p>
        </div>
      ) : null}
    </div>
  );
}
