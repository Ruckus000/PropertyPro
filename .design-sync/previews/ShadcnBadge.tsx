import { ShadcnBadge } from '@propertypro/design-system';

/**
 * ShadcnBadge — the shadcn badge from apps/web/src/components/ui/badge.tsx.
 * Its variant axis is default | secondary | destructive | outline (a filled
 * brand chip, a muted chip, a danger chip, and a bare bordered chip).
 * The status-colour lineage lives on `Badge` / `StatusBadge` instead.
 */

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <ShadcnBadge>Professional</ShadcnBadge>
    <ShadcnBadge variant="secondary">Governing Documents</ShadcnBadge>
    <ShadcnBadge variant="destructive">Past Due</ShadcnBadge>
    <ShadcnBadge variant="outline">Draft</ShadcnBadge>
  </div>
);

export const AsCounts = () => (
  <div className="flex flex-wrap items-center gap-6">
    <span className="flex items-center gap-2 text-sm text-content">
      Open violations
      <ShadcnBadge variant="destructive">7</ShadcnBadge>
    </span>
    <span className="flex items-center gap-2 text-sm text-content">
      ARC requests
      <ShadcnBadge>3</ShadcnBadge>
    </span>
    <span className="flex items-center gap-2 text-sm text-content">
      Archived notices
      <ShadcnBadge variant="secondary">28</ShadcnBadge>
    </span>
  </div>
);

export const InDocumentList = () => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between border-b border-edge px-4 py-3">
      <span className="text-sm font-semibold text-content">Official Records</span>
      <ShadcnBadge variant="outline">§718.111(12)(g)</ShadcnBadge>
    </div>
    <div className="divide-y divide-edge">
      {[
        { title: 'Hurricane Protection Specs', tag: 'New', variant: 'default' as const, posted: 'Posted 2 hours ago' },
        { title: 'Declaration of Condominium', tag: 'Governing Documents', variant: 'secondary' as const, posted: 'Posted Mar 4, 2026' },
        { title: 'FY2026 Approved Budget', tag: 'Financial', variant: 'outline' as const, posted: 'Posted Jan 12, 2026' },
        { title: 'Reserve Study — Draft', tag: 'Not posted', variant: 'destructive' as const, posted: 'Created 41 days ago' },
      ].map((doc) => (
        <div key={doc.title} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-content">{doc.title}</div>
            <div className="text-xs text-content-tertiary">{doc.posted}</div>
          </div>
          <ShadcnBadge variant={doc.variant}>{doc.tag}</ShadcnBadge>
        </div>
      ))}
    </div>
  </div>
);
