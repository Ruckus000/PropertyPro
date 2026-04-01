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
  let color = 'bg-green-100 text-green-800';
  if (days >= 30) color = 'bg-red-100 text-red-800';
  else if (days >= 20) color = 'bg-orange-100 text-orange-800';
  else if (days >= 10) color = 'bg-yellow-100 text-yellow-800';

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {days}d
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    condo_718: 'bg-blue-100 text-blue-800',
    hoa_720: 'bg-green-100 text-green-800',
    apartment: 'bg-purple-100 text-purple-800',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[type] ?? 'bg-gray-100 text-gray-800'}`}>
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
          <h1 className="text-2xl font-bold text-gray-900">Demos</h1>
          <p className="mt-1 text-sm text-gray-500">
            {demos.length} demo{demos.length !== 1 ? 's' : ''} created
          </p>
        </div>
        <Link
          href="/demo/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Demo
        </Link>
      </div>

      {demos.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">No demos yet.</p>
          <Link
            href="/demo/new"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Create your first demo →
          </Link>
        </div>
      )}

      {demos.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Prospect
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Age
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Client link
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {demos.map((demo) => (
                <tr key={demo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {demo.prospect_name}
                    </div>
                    {demo.prospect_notes && (
                      <div className="mt-0.5 max-w-xs truncate text-xs text-gray-400" title={demo.prospect_notes}>
                        {demo.prospect_notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={demo.template_type} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(demo.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <AgeBadge createdAt={demo.created_at} />
                  </td>
                  <td className="px-4 py-3">
                    {demo.is_converted ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Converted
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Demo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[14rem]">
                    {!demo.is_converted ? (
                      <div className="flex flex-col gap-1">
                        <span
                          className="truncate text-xs text-gray-600 font-mono"
                          title={getClientDemoLandingUrl(demo.slug)}
                        >
                          {getClientDemoLandingUrl(demo.slug)}
                        </span>
                        <button
                          type="button"
                          onClick={() => { void copyClientLink(demo.slug); }}
                          className="self-start text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          {copiedSlug === demo.slug
                            ? 'Copied'
                            : copiedSlug === `error:${demo.slug}`
                              ? 'Copy failed'
                              : 'Copy link'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/demo/${demo.id}/preview`}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        title="Split-screen preview"
                      >
                        Preview
                      </Link>
                      <Link
                        href={`/demo/${demo.id}/mobile`}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        title="Mobile preview"
                      >
                        Mobile
                      </Link>
                      {demo.external_crm_url && (
                        <a
                          href={demo.external_crm_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          title="Open CRM link"
                        >
                          CRM
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteId(demo.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
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
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Delete Demo</h3>
            <p className="mt-2 text-sm text-gray-500">
              Delete demo for{' '}
              <strong>{demos.find((demo) => demo.id === deleteId)?.prospect_name}</strong>?
              This will remove all demo data.
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
