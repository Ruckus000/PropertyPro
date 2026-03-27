import {
  AlertTriangle,
  FilePenLine,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { TEMPLATE_LIFECYCLE_META } from '@/lib/templates/constants';
import type { TemplateLifecycleState } from '@/lib/templates/types';

const BADGE_STYLES: Record<
  TemplateLifecycleState,
  { icon: LucideIcon; className: string }
> = {
  draft_only: {
    icon: FilePenLine,
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  published_current: {
    icon: Radio,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  published_with_unpublished_changes: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
};

interface TemplateLifecycleBadgeProps {
  state: TemplateLifecycleState;
}

export function TemplateLifecycleBadge({ state }: TemplateLifecycleBadgeProps) {
  const meta = TEMPLATE_LIFECYCLE_META[state];
  const style = BADGE_STYLES[state];
  const Icon = style.icon;

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        style.className,
      ].join(' ')}
      title={meta.description}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
    </span>
  );
}
