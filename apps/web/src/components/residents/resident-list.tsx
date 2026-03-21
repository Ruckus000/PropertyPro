'use client';

import { useState, useCallback } from 'react';
import { Mail, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResidentRecord {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string;
  unitId: number | null;
}

interface ResidentListProps {
  residents: ResidentRecord[];
  query: string;
  onQueryChange: (value: string) => void;
  onResendInvite: (userId: string) => Promise<void>;
}

type InviteStatus = 'idle' | 'sending' | 'sent' | 'error';

interface ResidentRowProps {
  resident: ResidentRecord;
  onResendInvite: (userId: string) => Promise<void>;
}

function ResidentRow({ resident, onResendInvite }: ResidentRowProps) {
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('idle');

  const handleResendInvite = useCallback(async () => {
    setInviteStatus('sending');
    try {
      await onResendInvite(resident.userId);
      setInviteStatus('sent');
      // Reset after 3 seconds so the button can be used again
      setTimeout(() => setInviteStatus('idle'), 3000);
    } catch {
      setInviteStatus('error');
      setTimeout(() => setInviteStatus('idle'), 4000);
    }
  }, [resident.userId, onResendInvite]);

  return (
    <li key={`${resident.userId}:${resident.role}`} className="flex items-center justify-between gap-3 p-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-content">{resident.fullName ?? 'Unknown resident'}</p>
        <p className="text-content-secondary">{resident.email ?? 'No email'}</p>
        <p className="text-content-secondary">
          Role: {resident.role}
          {resident.unitId ? ` • Unit ${resident.unitId}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={handleResendInvite}
          disabled={inviteStatus === 'sending' || inviteStatus === 'sent'}
          aria-label={`Resend invitation to ${resident.fullName ?? resident.email ?? 'resident'}`}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors md:min-h-[36px]',
            inviteStatus === 'idle' && 'border-border-default bg-surface-card text-content hover:bg-surface-muted',
            inviteStatus === 'sending' && 'cursor-not-allowed border-border-default bg-surface-card text-content-secondary',
            inviteStatus === 'sent' && 'cursor-default border-transparent bg-surface-muted text-content-secondary',
            inviteStatus === 'error' && 'border-status-danger bg-surface-card text-status-danger',
          )}
        >
          {inviteStatus === 'sending' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {inviteStatus === 'sent' && <Check size={14} aria-hidden="true" />}
          {(inviteStatus === 'idle' || inviteStatus === 'error') && <Mail size={14} aria-hidden="true" />}
          {inviteStatus === 'idle' && 'Send Invite'}
          {inviteStatus === 'sending' && 'Sending…'}
          {inviteStatus === 'sent' && 'Invite sent'}
          {inviteStatus === 'error' && 'Failed — retry'}
        </button>
      </div>
    </li>
  );
}

export function ResidentList({ residents, query, onQueryChange, onResendInvite }: ResidentListProps) {
  return (
    <section className="space-y-4" data-testid="resident-list">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Search residents</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by name or email"
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>

      <ul className="divide-y divide-edge rounded-md border border-edge">
        {residents.map((resident) => (
          <ResidentRow
            key={`${resident.userId}:${resident.role}`}
            resident={resident}
            onResendInvite={onResendInvite}
          />
        ))}
      </ul>
    </section>
  );
}
