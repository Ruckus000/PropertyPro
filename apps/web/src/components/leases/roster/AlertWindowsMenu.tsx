'use client';

/**
 * "Expiry alerts: 30, 60, 90 days" — a real dropdown (v2 fix: bordered
 * button, chevron that flips, focus ring). The widest window decides which
 * leases count as Expiring and Renewals due. Only the root manager can change
 * it; everyone else sees the value.
 */
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { LeaseActions } from '@/hooks/use-lease-roster';

const PRESETS: number[][] = [
  [30, 60, 90],
  [30, 60],
  [60, 90, 120],
  [30],
  [90],
];

export function AlertWindowsMenu({
  windows,
  canEdit,
  actions,
  onHelp,
}: {
  windows: number[];
  canEdit: boolean;
  actions: LeaseActions;
  onHelp?: (slug: string) => void;
}) {
  const label = `${windows.join(', ')} days`;
  const value = windows.join(',');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'group inline-flex h-9 items-center gap-1.5 rounded-md border border-edge-strong bg-surface-card px-3 text-sm text-content-secondary',
          'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus data-[state=open]:ring-2 data-[state=open]:ring-edge-focus',
        )}
      >
        Expiry alerts: <span className="font-semibold text-content">{label}</span>
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={16} className="w-64">
        <DropdownMenuLabel className="font-normal text-content-secondary">
          Leases ending within the widest window count as Renewals due.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={async (v) => {
            if (!canEdit || v === value) return;
            const next = v.split(',').map(Number);
            try {
              await actions.updateSettings.mutateAsync({ alertWindows: next });
              toast.success(`Expiry alerts set to ${next.join(', ')} days`, {
                action: {
                  label: 'Undo',
                  onClick: () => void actions.updateSettings.mutateAsync({ alertWindows: windows }),
                },
              });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not change expiry alerts');
            }
          }}
        >
          {PRESETS.map((p) => (
            <DropdownMenuRadioItem key={p.join(',')} value={p.join(',')} disabled={!canEdit}>
              {p.join(', ')} days
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {!canEdit && (
          <p className="px-2 py-1.5 text-xs text-content-secondary">Only the root manager can change this.</p>
        )}
        {onHelp && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => onHelp('expiry-alert-windows')}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-interactive hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
            >
              How alert windows work
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
