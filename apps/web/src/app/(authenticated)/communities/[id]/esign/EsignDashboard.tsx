'use client';

import { useEffect, useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { PenTool, FileText, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { EsignStatusBadge } from '@/components/esign/EsignStatusBadge';
import type { CommunityRole } from '@propertypro/shared';

interface Submission {
  id: number;
  status: string;
  templateId: number;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  createdBy: string;
}

interface EsignDashboardProps {
  communityId: number;
  userId: string;
  userRole: CommunityRole;
  canWrite: boolean;
}

export function EsignDashboard({
  communityId,
  userId,
  userRole,
  canWrite,
}: EsignDashboardProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadSubmissions = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/esign/submissions?communityId=${communityId}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSubmissions(data.data ?? []);
        } else {
          setError('Failed to load submissions');
        }
      } catch {
        setError('Failed to load submissions');
      }
    });
  }, [communityId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const pending = submissions.filter((s) => s.status === 'pending').length;
  const completed = submissions.filter((s) => s.status === 'completed').length;
  const expired = submissions.filter(
    (s) => s.status === 'expired' || s.status === 'declined',
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">E-Signatures</h1>
          <p className="text-sm text-gray-500">
            Manage document signing for your community
          </p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <Link
                href={`/communities/${communityId}/esign/templates?communityId=${communityId}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileText className="h-4 w-4" />
                Templates
              </Link>
              <Link
                href={`/communities/${communityId}/esign/templates/new?communityId=${communityId}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Template
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-yellow-600">
            <Clock className="h-5 w-5" />
            <span className="text-sm font-medium">Pending</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{pending}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Completed</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{completed}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Expired / Declined</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{expired}</p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Submissions table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Recent Submissions
          </h2>
        </div>
        {isPending ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Loading...
          </div>
        ) : submissions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <PenTool className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No e-signature submissions yet
            </p>
            {canWrite && (
              <p className="mt-1 text-xs text-gray-400">
                Create a template to get started
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    #{sub.id}
                  </td>
                  <td className="px-4 py-2">
                    <EsignStatusBadge status={sub.status} />
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(sub.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {sub.expiresAt
                      ? new Date(sub.expiresAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/communities/${communityId}/esign/sign/${sub.id}?communityId=${communityId}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
