'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import type { DemoInstanceRow } from '@/lib/db/demo-queries';
import { getClientDemoLandingUrl } from '@/lib/demo-client-url';

interface DemoListClientProps {
  initialDemos: DemoInstanceRow[];
}

function getAgeDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = getAgeDays(createdAt);
  let color = 'bg-status-success-subtle text-status-success';
  if (days >= 30) color = 'bg-status-danger-subtle text-status-danger';
  // design-tokens:exempt — middle tier of a three-step staleness escalation; the token layer has only danger/warning. Same gap as lib/utils/stale-badge.ts.
  else if (days >= 20) color = 'bg-orange-100 text-orange-800'; // design-tokens:exempt — see note above
  else if (days >= 10) color = 'bg-status-warning-subtle text-status-warning';

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {days}d
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    condo_718: 'bg-status-info-subtle text-status-info',
    hoa_720: 'bg-status-success-subtle text-status-success',
    apartment: 'bg-purple-100 text-purple-800', // design-tokens:exempt — categorical community-type chip; the nearest violet token means unit ownership. See lib/constants/community-labels.ts.
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[type] ?? 'bg-surface-muted text-content'}`}>
      {COMMUNITY_TYPE_DISPLAY_NAMES[type as CommunityType] ?? type}
    </span>
  );
}

export function DemoListClient({ initialDemos }: DemoListClientProps) {
  const [demos, setDemos] = useState(initialDemos);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const copyClientLink = useCallback(async (slug: string) => {
    const url = getClientDemoLandingUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      setCopiedSlug(`error:${slug}`);
      setTimeout(() => setCopiedSlug(null), 2000);
    }
  }, []);

  const handleDelete = async (id: number) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/demos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDeleteError(body?.error?.message ?? `Delete failed (${res.status})`);
        return;
      }
      setDemos((currentDemos) => currentDemos.filter((demo) => demo.id !== id));
      setDeleteId(null);
    } catch {
      setDeleteError('Network error — please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content">Demos</h1>
          <p className="mt-1 text-sm text-content-tertiary">
            {demos.length} demo{demos.length !== 1 ? 's' : ''} created
          </p>
        </div>
        <Link
          href="/demo/new"
          className="rounded-md bg-coral-600 px-4 py-2 text-sm font-medium text-white hover:bg-coral-700"
        >
          Create Demo
        </Link>
      </div>

      {demos.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-content-tertiary">No demos yet.</p>
          <Link
            href="/demo/new"
            className="mt-2 inline-block text-sm font-medium text-coral-700 hover:text-coral-700"
          >
            Create your first demo →
          </Link>
        </div>
      )}

      {demos.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-edge bg-surface-card">
          <table className="min-w-full divide-y divide-edge">
            <thead className="bg-surface-page">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Prospect
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Age
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Client link
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {demos.map((demo) => (
                <tr key={demo.id} className="hover:bg-surface-page">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-content">
                      {demo.prospect_name}
                    </div>
                    {demo.prospect_notes && (
                      <div className="mt-0.5 max-w-xs truncate text-xs text-content-disabled" title={demo.prospect_notes}>
                        {demo.prospect_notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={demo.template_type} />
                  </td>
                  <td className="px-4 py-3 text-sm text-content-tertiary">
                    {new Date(demo.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <AgeBadge createdAt={demo.created_at} />
                  </td>
                  <td className="px-4 py-3">
                    {demo.is_converted ? (
                      <span className="inline-block rounded-full bg-status-success-subtle px-2 py-0.5 text-xs font-medium text-status-success">
                        Converted
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-secondary">
                        Demo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[14rem]">
                    {!demo.is_converted ? (
                      <div className="flex flex-col gap-1">
                        <span
                          className="truncate text-xs text-content-secondary font-mono"
                          title={getClientDemoLandingUrl(demo.slug)}
                        >
                          {getClientDemoLandingUrl(demo.slug)}
                        </span>
                        <button
                          type="button"
                          onClick={() => { void copyClientLink(demo.slug); }}
                          className="self-start text-xs font-medium text-coral-700 hover:text-coral-700"
                        >
                          {copiedSlug === demo.slug
                            ? 'Copied'
                            : copiedSlug === `error:${demo.slug}`
                              ? 'Copy failed'
                              : 'Copy link'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-content-disabled">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/demo/${demo.id}/preview`}
                        className="rounded px-2 py-1 text-xs font-medium text-coral-700 hover:bg-coral-50"
                        title="Split-screen preview"
                      >
                        Preview
                      </Link>
                      <Link
                        href={`/demo/${demo.id}/mobile`}
                        className="rounded px-2 py-1 text-xs font-medium text-coral-700 hover:bg-coral-50"
                        title="Mobile preview"
                      >
                        Mobile
                      </Link>
                      {demo.external_crm_url && (
                        <a
                          href={demo.external_crm_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-2 py-1 text-xs font-medium text-content-secondary hover:bg-surface-muted"
                          title="Open CRM link"
                        >
                          CRM
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteId(demo.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-status-danger hover:bg-status-danger-bg"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-surface-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-content">Delete Demo</h3>
            <p className="mt-2 text-sm text-content-tertiary">
              Delete demo for{' '}
              <strong>{demos.find((demo) => demo.id === deleteId)?.prospect_name}</strong>?
              This will remove all demo data.
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-status-danger">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="rounded-md bg-status-danger px-4 py-2 text-sm font-medium text-content-inverse hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
