'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, ShieldCheck, Eye } from 'lucide-react';

interface ConsentGrant {
  id: number;
  community_id: number;
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
}

interface AccessLogEntry {
  id: number;
  event: string;
  admin_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SupportAccessData {
  consentActive: boolean;
  consent: ConsentGrant | null;
  recentAccess: AccessLogEntry[];
}

export function SupportAccessSettings() {
  const [data, setData] = useState<SupportAccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/settings/support-access');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error?.message ?? 'Failed to load support access settings');
        return;
      }
      const body = await res.json();
      setData(body);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async () => {
    if (!data) return;
    setToggling(true);
    setError('');
    try {
      const res = await fetch('/api/v1/settings/support-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !data.consentActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error?.message ?? 'Failed to update support access');
        return;
      }
      await fetchData();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setToggling(false);
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
