'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Eye } from 'lucide-react';
import { getSupportAccessEventLabel } from '@propertypro/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SettingsCard, SettingsRow } from '@/components/settings/settings-layout';
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
      <SettingsCard data-testid="support-access-settings-loading">
        {/* `min-w-0` + fluid bars: the row must stay inside the card at 375px,
            where the old fixed `w-64` bar pushed the switch placeholder out.
            Only visible while `loading`, which is why a sweep catches it or
            misses it depending on how fast the fetch resolves. */}
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
        </div>
      </SettingsCard>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-5 py-4 text-sm text-status-danger" role="alert">
        {error}
      </div>
    );
  }

  return (
    <SettingsCard>
      <SettingsRow
        inlineControl
        label="Allow support access"
        description={
          <>
            Allow PropertyPro support staff to access this community in read-only mode for
            troubleshooting. All access is logged.
            {data?.consent && (
              <span className="mt-1 block text-content-tertiary">
                Enabled since{' '}
                {format(new Date(data.consent.granted_at), 'MMM d, yyyy')}
              </span>
            )}
          </>
        }
        control={
          <Switch
            checked={data?.consentActive ?? false}
            onCheckedChange={() => void handleToggle()}
            disabled={toggling || loading}
            aria-label="Toggle support access"
          />
        }
      >
        {error && (
          <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
            {error}
          </div>
        )}
      </SettingsRow>

      {/* Recent activity */}
      {data && data.recentAccess.length > 0 && (
        <div className="px-5 py-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            <Eye size={12} aria-hidden="true" />
            Recent Support Activity
          </h3>
          <div className="divide-y divide-edge-subtle rounded-md border border-edge">
            {data.recentAccess.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                <span className="min-w-0 text-content-secondary" title={entry.event}>
                  {getSupportAccessEventLabel(entry.event)}
                </span>
                <span className="shrink-0 text-content-tertiary">
                  {format(new Date(entry.created_at), 'MMM d, HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.recentAccess.length === 0 && data.consentActive && (
        <p className="px-5 py-4 text-sm text-content-tertiary">No support activity yet.</p>
      )}
    </SettingsCard>
  );
}
