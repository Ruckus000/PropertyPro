/**
 * Re-export of the canonical status config (packages/ui/src/constants/status.ts)
 * plus web-only domain maps. Do not define status colors/variants here.
 */
export {
  STATUS_CONFIG,
  getStatusConfig,
  getStatusClasses,
  type StatusConfigEntry,
  type StatusIconKey,
  type StatusKey,
  type StatusVariant,
} from '@propertypro/ui';

import type { StatusVariant as V } from '@propertypro/ui';

/** E-sign domain statuses — labels differ from the generic map (e.g. pending
 *  means "Pending", not "Due Soon"). Icons live with the esign components. */
export const ESIGN_STATUS_CONFIG = {
  pending: { label: 'Pending', variant: 'warning' },
  processing: { label: 'Processing', variant: 'info' },
  processing_failed: { label: 'Processing Failed', variant: 'danger' },
  opened: { label: 'Opened', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  declined: { label: 'Declined', variant: 'danger' },
  expired: { label: 'Expired', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
} as const satisfies Record<string, { label: string; variant: V }>;
