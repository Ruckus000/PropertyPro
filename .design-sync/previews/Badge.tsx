import { Badge } from '@propertypro/design-system';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

/**
 * Badge — the @propertypro/ui badge that owns the status-colour variant system
 * (success | brand | warning | danger | info | neutral | owner | board).
 * Not to be confused with ShadcnBadge, which has the plainer
 * default/secondary/destructive/outline axis.
 */

export const StatusVariants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="success">Compliant</Badge>
    <Badge variant="brand">Featured</Badge>
    <Badge variant="warning">Due Soon</Badge>
    <Badge variant="danger">Overdue</Badge>
    <Badge variant="info">Submitted</Badge>
    <Badge variant="neutral">Draft</Badge>
    <Badge variant="owner">Unit Owner</Badge>
    <Badge variant="board">Board President</Badge>
  </div>
);

export const Outlined = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="success" outlined>Compliant</Badge>
    <Badge variant="brand" outlined>Featured</Badge>
    <Badge variant="warning" outlined>Due Soon</Badge>
    <Badge variant="danger" outlined>Overdue</Badge>
    <Badge variant="info" outlined>Submitted</Badge>
    <Badge variant="neutral" outlined>Draft</Badge>
    <Badge variant="owner" outlined>Unit Owner</Badge>
    <Badge variant="board" outlined>Board President</Badge>
  </div>
);

export const SizesAndParts = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="danger" size="sm">Overdue</Badge>
      <Badge variant="danger" size="md">Overdue</Badge>
      <Badge variant="danger" size="lg">Overdue</Badge>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">
        <Badge.Icon>
          <ShieldCheck />
        </Badge.Icon>
        <Badge.Label>SIRS Certified</Badge.Label>
      </Badge>
      <Badge variant="warning">
        <Badge.Icon>
          <AlertTriangle />
        </Badge.Icon>
        <Badge.Label>Notice due in 3 days</Badge.Label>
      </Badge>
      <Badge variant="info">
        <Badge.Dot />
        <Badge.Label>Under review</Badge.Label>
      </Badge>
      <Badge variant="neutral">
        <Badge.Dot />
        <Badge.Label>Archived</Badge.Label>
      </Badge>
    </div>
  </div>
);

export const InResidentRoster = () => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between border-b border-edge px-4 py-3">
      <span className="text-sm font-semibold text-content">Sunset Condos · Residents</span>
      <span className="text-xs text-content-tertiary">142 of 180 units claimed</span>
    </div>
    <div className="divide-y divide-edge">
      {[
        { unit: 'Unit 402', name: 'Marisol Delgado', role: 'owner' as const, roleLabel: 'Unit Owner', state: 'success' as const, stateLabel: 'Compliant' },
        { unit: 'Unit 118', name: 'Andre Whitfield', role: 'board' as const, roleLabel: 'Board President', state: 'warning' as const, stateLabel: 'Dues Due Soon' },
        { unit: 'Unit 706', name: 'Priya Raman', role: 'neutral' as const, roleLabel: 'Tenant', state: 'danger' as const, stateLabel: 'Overdue' },
      ].map((row) => (
        <div key={row.unit} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-content">{row.name}</div>
            <div className="text-xs text-content-tertiary">{row.unit}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={row.role} size="sm" outlined>{row.roleLabel}</Badge>
            <Badge variant={row.state} size="sm">{row.stateLabel}</Badge>
          </div>
        </div>
      ))}
    </div>
  </div>
);
