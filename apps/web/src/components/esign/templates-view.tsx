'use client';

/**
 * Templates — what can we send again.
 *
 * Ported from `app/(authenticated)/esign/templates/templates-list-client.tsx`,
 * which owned a whole page: its own `PageHeader`, its own `mx-auto max-w-5xl`,
 * and its own loading and error branches that returned BEFORE the header — so
 * while templates were loading the page had no `<h1>` and the breadcrumb trail
 * had no leaf to resolve. As a view it renders only its own content and that
 * problem goes away with the chrome.
 *
 * The `[var(--…)]` classes it carried are gone too. They pass the token guard
 * (its arbitrary-colour rule only matches `#`/`rgb`/`hsl`/`oklch`), but
 * `design.md` asks for the semantic class and there is one for every case.
 */

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@propertypro/ui';
import type { EsignFieldsSchema } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { formatShortDate } from '@/lib/utils/format-date';
import { useEsignTemplates } from '@/hooks/use-esign-templates';

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

function fieldCount(schema: EsignFieldsSchema | null): number {
  return schema?.fields?.length ?? 0;
}

export interface TemplatesViewProps {
  communityId: number;
}

export function TemplatesView({ communityId }: TemplatesViewProps) {
  const { data: templates, isLoading, error, refetch } = useEsignTemplates(communityId);

  if (error) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="Couldn't load your templates"
        description="Something went wrong while loading them."
        action={
          <Button size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          preset="no_esign_templates"
          action={
            <Button asChild>
              <Link href={`/esign/templates/new?communityId=${communityId}`}>
                <Plus aria-hidden="true" className="size-4" />
                Create Template
              </Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Owned wrapper: shadcn's `Table` nests an `overflow-auto` div with no
          `tabIndex`, which a keyboard-only user cannot scroll. */}
      <div
        role="region"
        aria-label="E-sign templates"
        tabIndex={0}
        className="w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
      >
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b border-edge-subtle bg-surface-subtle">
              <th scope="col" className="px-5 py-2 text-left font-medium text-content-tertiary">
                Name
              </th>
              <th scope="col" className="px-5 py-2 text-left font-medium text-content-tertiary">
                Type
              </th>
              <th scope="col" className="px-5 py-2 text-center font-medium text-content-tertiary">
                Fields
              </th>
              <th scope="col" className="px-5 py-2 text-left font-medium text-content-tertiary">
                Status
              </th>
              <th scope="col" className="px-5 py-2 text-left font-medium text-content-tertiary">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge-subtle">
            {templates.map((template) => (
              <tr key={template.id} className="transition-colors hover:bg-surface-subtle">
                <td className="px-5 py-4">
                  <Link
                    href={`/esign/templates/${template.id}?communityId=${communityId}`}
                    className="text-sm font-medium text-content-link hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                  >
                    {template.name}
                  </Link>
                  {template.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-content-tertiary">
                      {template.description}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4">
                  <Badge variant="brand" size="sm">
                    {TYPE_LABELS[template.templateType ?? ''] ??
                      template.templateType ??
                      'Unknown'}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="text-sm tabular-nums text-content-secondary">
                    {fieldCount(template.fieldsSchema as EsignFieldsSchema | null)}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <Badge variant={STATUS_VARIANT[template.status] ?? 'neutral'} size="sm">
                    {template.status}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-sm text-content-secondary">
                  {formatShortDate(template.createdAt as string | Date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
