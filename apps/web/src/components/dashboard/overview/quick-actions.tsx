import Link from 'next/link';
import { AlertTriangle, Calendar, FileText, Megaphone, PenLine, User, Wrench, type LucideIcon } from 'lucide-react';
import type { QuickAction } from '@/lib/dashboard/quick-actions';

const ICONS: Record<QuickAction['icon'], LucideIcon> = {
  megaphone: Megaphone,
  file: FileText,
  calendar: Calendar,
  pen: PenLine,
  wrench: Wrench,
  alert: AlertTriangle,
  user: User,
};

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map((action) => {
        const Icon = ICONS[action.icon];
        return (
          <li key={action.id}>
            <Link
              href={action.href}
              className="flex min-h-14 items-center gap-3 rounded-md border border-edge bg-surface-card px-4 text-base font-medium text-content hover:bg-surface-hover"
            >
              <Icon size={20} className="shrink-0" aria-hidden="true" />
              {action.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
