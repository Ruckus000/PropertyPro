'use client';

import Link from 'next/link';
import type { CreateClientResult } from './types';

interface CreateClientSuccessStateProps {
  result: CreateClientResult;
  adminEmail: string;
  onBackToClients: () => void;
  onResetWizard: () => void;
}

export function CreateClientSuccessState({
  result,
  adminEmail,
  onBackToClients,
  onResetWizard,
}: CreateClientSuccessStateProps) {
  return (
    <div className="max-w-xl">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-900">Community Created!</h2>
        <p className="mt-1 text-sm text-green-700">
          <span className="font-medium">{result.community.name}</span> is now live at{' '}
          <span className="font-mono text-xs">{result.community.slug}.propertyprofl.com</span>
        </p>
        {result.invitationSent && adminEmail && (
          <p className="mt-2 text-sm text-green-700">
            An invitation has been sent to <span className="font-medium">{adminEmail}</span>.
          </p>
        )}

        <div className="mt-4 space-y-2">
          <Link
            href={`/clients/${result.community.id}`}
            className="block rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            Open Workspace
          </Link>
          <button
            onClick={onBackToClients}
            className="block w-full rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to Clients
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={onResetWizard}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  );
}
