'use client';

/**
 * EsignTemplatesListClient — Client component for the templates list page.
 *
 * Renders a table of e-sign templates with name, type badge, field count,
 * status badge, and created date. Links to template details and creation.
 */

import Link from 'next/link';
import { Plus, FileSignature } from 'lucide-react';
import { Badge } from '@propertypro/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { useEsignTemplates } from '@/hooks/use-esign-templates';
import type { EsignFieldsSchema } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EsignTemplatesListClientProps {
  communityId: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  proxy: 'Proxy',
  consent: 'Consent',
  lease_addendum: 'Lease Addendum',
  maintenance_auth: 'Maintenance Auth',
  violation_ack: 'Violation Ack',
  assessment_agreement: 'Assessment Agreement',
  custom: 'Custom',
};

const STATUS_VARIANT: Record<string, 'success' | 'neutral'> = {
  active: 'success',
  archived: 'neutral',
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getFieldCount(schema: EsignFieldsSchema | null): number {
  if (!schema?.fields) return 0;
  return schema.fields.length;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EsignTemplatesListClient({
  communityId,
}: EsignTemplatesListClientProps) {
  const { data: templates, isLoading, error } = useEsignTemplates(communityId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[60px]" />
              <Skeleton className="h-6 w-[80px] rounded-full" />
              <Skeleton className="h-4 w-[100px] ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <p className="text-sm text-[var(--status-danger)]">
          Failed to load templates: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <PageHeader
        title="E-Sign Templates"
        actions={
          <Link
            href={`/esign/templates/new?communityId=${communityId}`}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)]"
          >
            <Plus className="size-4" />
            Create Template
          </Link>
        }
      />

      {/* Empty state */}
      {(!templates || templates.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-card)] py-16">
          <FileSignature className="size-12 text-[var(--text-tertiary)]" />
          <h3 className="mt-4 text-lg font-medium text-[var(--text-primary)]">
            No templates yet
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Create your first e-sign template to get started.
          </p>
          <Link
            href={`/esign/templates/new?communityId=${communityId}`}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)]"
          >
            <Plus className="size-4" />
            Create Template
          </Link>
        </div>
      )}

      {/* Templates table.

          The wrapper is `overflow-x-auto`, not `overflow-hidden`: the table is
          far wider than a phone viewport, so hiding the overflow CLIPPED the
          right-hand columns with no way to reach them at all. */}
      {templates && templates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
          <table className="min-w-full divide-y divide-[var(--border-subtle)]">
            <thead className="bg-[var(--surface-subtle)]">
              <tr>
                <th
                  scope="col"
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                >
                  Fields
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                >
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {templates.map((template) => (
                <tr
                  key={template.id}
                  className="transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/esign/templates/${template.id}?communityId=${communityId}`}
                      className="text-sm font-medium text-[var(--interactive-primary)] hover:underline"
                    >
                      {template.name}
                    </Link>
                    {template.description && (
                      <p className="mt-0.5 text-xs text-[var(--text-tertiary)] line-clamp-1">
                        {template.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant="brand" size="sm">
                      {TYPE_LABELS[template.templateType ?? ''] ??
                        template.templateType ??
                        'Unknown'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                      {getFieldCount(
                        template.fieldsSchema as EsignFieldsSchema | null,
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      variant={STATUS_VARIANT[template.status] ?? 'neutral'}
                      size="sm"
                    >
                      {template.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-sm text-[var(--text-secondary)]">
                    {formatDate(template.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
