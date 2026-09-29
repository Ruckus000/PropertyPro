'use client';

/**
 * Leases v3 roster dialogs, and the host that renders whichever one the page
 * has open. The page owns `dialog`; the host resolves the unit model (and,
 * for lease-specific dialogs, the lease) and passes everything else through.
 */
import { createElement } from 'react';
import type { RosterLease, UnitModel } from '@/lib/leases/roster-model';
import type { RosterDialog, RosterDialogProps } from '../types';
import { CancelLeaseDialog } from './CancelLeaseDialog';
import { DepositDialog } from './DepositDialog';
import { LeaseFormDialog } from './LeaseFormDialog';
import { MoveOutDialog } from './MoveOutDialog';
import { OfferDialog } from './OfferDialog';
import { OfferResponseDialog } from './OfferResponseDialog';
import { OfflineDialog } from './OfflineDialog';
import { RecordRenewalDialog } from './RecordRenewalDialog';
import { TransferDialog } from './TransferDialog';

export { CancelLeaseDialog } from './CancelLeaseDialog';
export { DepositDialog } from './DepositDialog';
export { LeaseFormDialog } from './LeaseFormDialog';
export { MoveOutDialog } from './MoveOutDialog';
export { OfferDialog } from './OfferDialog';
export { OfferResponseDialog } from './OfferResponseDialog';
export { OfflineDialog } from './OfflineDialog';
export { RecordRenewalDialog } from './RecordRenewalDialog';
export { TransferDialog, transferTargets } from './TransferDialog';

export type RosterDialogHostProps = { dialog: RosterDialog | null } & Omit<RosterDialogProps, 'model' | 'lease'> & {
    models: UnitModel[];
  };

function leaseIn(model: UnitModel | null, leaseId: number | undefined): RosterLease | null {
  if (!model || leaseId == null) return null;
  return [model.current, model.next, ...model.past].find((l) => l?.id === leaseId) ?? null;
}

/** Find the unit (and lease) a dialog targets. A lease id without a unit is searched across every unit. */
export function resolveDialogTarget(
  dialog: RosterDialog,
  models: UnitModel[],
): { model: UnitModel | null; lease: RosterLease | null } {
  const leaseId = 'leaseId' in dialog ? dialog.leaseId : undefined;
  let model = dialog.unitId != null ? (models.find((m) => m.unit.id === dialog.unitId) ?? null) : null;
  let lease = leaseIn(model, leaseId);
  if (!lease && leaseId != null) {
    for (const m of models) {
      const found = leaseIn(m, leaseId);
      if (found) {
        model = model ?? m;
        lease = found;
        break;
      }
    }
  }
  return { model, lease };
}

export function RosterDialogHost({ dialog, ...rest }: RosterDialogHostProps) {
  if (!dialog) return null;
  const { model, lease } = resolveDialogTarget(dialog, rest.models);
  const props: RosterDialogProps = { ...rest, model, lease };
  // Keyed per dialog so switching dialogs (or units) remounts with fresh state and a fresh idempotency key.
  const key = `${dialog.kind}:${dialog.unitId ?? 'none'}:${'leaseId' in dialog ? (dialog.leaseId ?? '') : ''}:${'mode' in dialog ? dialog.mode : ''}`;

  switch (dialog.kind) {
    case 'lease':
      return createElement(LeaseFormDialog, { ...props, key, mode: dialog.mode });
    case 'offer':
      return createElement(OfferDialog, { ...props, key });
    case 'offer-response':
      return createElement(OfferResponseDialog, { ...props, key });
    case 'record-renewal':
      return createElement(RecordRenewalDialog, { ...props, key });
    case 'move-out':
      return createElement(MoveOutDialog, { ...props, key, mode: dialog.mode });
    case 'cancel-lease':
      return createElement(CancelLeaseDialog, { ...props, key });
    case 'transfer':
      return createElement(TransferDialog, { ...props, key });
    case 'offline':
      return createElement(OfflineDialog, { ...props, key });
    case 'deposit':
      return createElement(DepositDialog, { ...props, key });
    default:
      return null;
  }
}
