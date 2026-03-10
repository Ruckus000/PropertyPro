'use client';

import { useEffect, useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Plus, Trash2, Copy } from 'lucide-react';
import { EsignStatusBadge } from '@/components/esign/EsignStatusBadge';

interface Template {
  id: number;
  name: string;
  description: string | null;
  templateType: string | null;
  status: string;
  createdAt: string;
}

interface EsignTemplateListProps {
  communityId: number;
  userId: string;
}

export function EsignTemplateList({
  communityId,
  userId,
}: EsignTemplateListProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadTemplates = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/esign/templates?communityId=${communityId}`,
        );
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.data ?? []);
        } else {
          setError('Failed to load templates');
        }
      } catch {
        setError('Failed to load templates');
      }
    });
  }, [communityId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function handleArchive(templateId: number) {
    const res = await fetch(
      `/api/v1/esign/templates/${templateId}?communityId=${communityId}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      loadTemplates();
    }
  }

  async function handleClone(templateId: number, name: string) {
    const res = await fetch(
      `/api/v1/esign/templates/${templateId}/clone`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          name: `${name} (Copy)`,
        }),
      },
    );
    if (res.ok) {
      loadTemplates();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            E-Signature Templates
          </h1>
          <p className="text-sm text-gray-500">
            Create and manage reusable signing templates
          </p>
        </div>
        <Link
          href={`/communities/${communityId}/esign/templates/new?communityId=${communityId}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Template
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {isPending ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Loading...
          </div>
        ) : templates.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No templates yet
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Create your first template to start collecting signatures
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((tmpl) => (
                <tr key={tmpl.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div>
                      <span className="font-medium text-gray-900">
                        {tmpl.name}
                      </span>
                      {tmpl.description && (
                        <p className="text-xs text-gray-500">
                          {tmpl.description}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {tmpl.templateType ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <EsignStatusBadge status={tmpl.status} />
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(tmpl.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleClone(tmpl.id, tmpl.name)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Clone"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      {tmpl.status === 'active' && (
                        <button
                          onClick={() => handleArchive(tmpl.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Archive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
