'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, ShieldCheck, Eye } from 'lucide-react';
import {
  useSupportAccess,
  useToggleSupportAccess,
} from '@/hooks/use-support-access';

/**
 * The hook's queryFn throws the server/load literal for non-OK responses.
 * Any other rejection (e.g. a `fetch` network failure → TypeError) is
 * surfaced as the original "Network error" copy, matching the pre-B5
 * try/catch behaviour exactly.
 */
const NETWORK_ERROR_LITERAL = 'Network error. Please try again.';

function toDisplayError(err: unknown, fallback: string): string {
  // Our controlled non-OK throws are plain `Error` carrying the server
  // message or our own load/update literal — pass those through. A genuine
  // `fetch` network failure is a `TypeError`, and a React-Query
  // cancellation an AbortError/`DOMException`; both carry non-user-facing
  // messages, so they fall back to the network copy exactly as the pre-B5
  // try/catch did.
  if (
    err instanceof Error &&
    err.message &&
    !(err instanceof TypeError) &&
    !(typeof DOMException !== 'undefined' && err instanceof DOMException)
  ) {
    return err.message;
  }
  return fallback;
}

export function SupportAccessSettings({ communityId }: { communityId: number }) {
  const query = useSupportAccess(communityId);
  const toggle = useToggleSupportAccess(communityId);

  const data = query.data ?? null;
  const loading = query.isLoading;
  const toggling = toggle.isPending;

  // Mirror the original toggle try/catch: the mutation rejection's message
  // (server message or update literal) is shown; anything without a usable
  // message falls back to the network literal.
  const [transientError, setTransientError] = useState('');

  // Reset the transient (mutation) error when the community changes —
  // mirrors the pre-B5 fetchData() which cleared the error on each load.
  useEffect(() => {
    setTransientError('');
  }, [communityId]);

  const queryError = query.error
    ? toDisplayError(query.error, NETWORK_ERROR_LITERAL)
    : '';

  const error = transientError || queryError;

  const handleToggle = async () => {
    if (!data) return;
    setTransientError('');
    try {
      await toggle.mutateAsync({ enabled: !data.consentActive });
    } catch (err) {
      setTransientError(toDisplayError(err, NETWORK_ERROR_LITERAL));
    }
  };

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Support Access</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Allow PropertyPro support staff to access this community in read-only mode for
              troubleshooting. All access is logged.
            </p>
            {data?.consent && (
              <p className="mt-1 text-xs text-gray-400">
                Enabled since{' '}
                {format(new Date(data.consent.granted_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={data?.consentActive ?? false}
          onClick={handleToggle}
          disabled={toggling || loading}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50',
            data?.consentActive ? 'bg-blue-600' : 'bg-gray-200',
          ].join(' ')}
          aria-label="Toggle support access"
        >
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              data?.consentActive ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Recent activity */}
      {data && data.recentAccess.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Eye size={12} aria-hidden="true" />
            Recent Support Activity
          </h4>
          <div className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {data.recentAccess.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="font-mono text-gray-600">{entry.event}</span>
                <span className="text-gray-400">
                  {format(new Date(entry.created_at), 'MMM d, HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.recentAccess.length === 0 && data.consentActive && (
        <p className="text-xs text-gray-400">No support activity yet.</p>
      )}
    </div>
  );
}
