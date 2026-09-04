/**
 * E-sign status ICONS + event icons. Labels/variants come from the canonical
 * domain map in @/lib/constants/status (ESIGN_STATUS_CONFIG).
 */

import { ESIGN_STATUS_CONFIG } from '@/lib/constants/status';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Loader2,
  Ban,
  FileSignature,
  Send,
  Download,
} from 'lucide-react';

const STATUS_ICONS: Record<keyof typeof ESIGN_STATUS_CONFIG, typeof Clock> = {
  pending: Clock,
  processing: Loader2,
  processing_failed: AlertTriangle,
  opened: Eye,
  completed: CheckCircle2,
  declined: XCircle,
  expired: AlertTriangle,
  cancelled: Ban,
};

export interface EsignStatusConfigEntry {
  label: string;
  variant: (typeof ESIGN_STATUS_CONFIG)[keyof typeof ESIGN_STATUS_CONFIG]['variant'];
  icon: typeof Clock;
}

export const ESIGN_STATUS_DISPLAY: Record<string, EsignStatusConfigEntry> =
  Object.fromEntries(
    Object.entries(ESIGN_STATUS_CONFIG).map(([k, v]) => [
      k,
      { ...v, icon: STATUS_ICONS[k as keyof typeof ESIGN_STATUS_CONFIG] },
    ]),
  );

export const EVENT_ICONS: Record<string, typeof Clock> = {
  created: FileSignature,
  sent: Send,
  opened: Eye,
  signed: FileSignature,
  completed: CheckCircle2,
  declined: XCircle,
  expired: AlertTriangle,
  cancelled: Ban,
  reminder_sent: Send,
  signer_completed: CheckCircle2,
  submission_completed: CheckCircle2,
  submission_processing_failed: AlertTriangle,
  consent_given: CheckCircle2,
  verified: CheckCircle2,
  downloaded: Download,
};

/**
 * Look up a status safely.
 *
 * `ESIGN_STATUS_DISPLAY` is built with `Object.fromEntries`, so it inherits
 * from `Object.prototype`. Every call site reads it as
 * `ESIGN_STATUS_DISPLAY[status] ?? DEFAULT` — and for a status of
 * `'constructor'`, `'toString'` or `'valueOf'` that lookup returns a truthy
 * INHERITED value, `??` never fires, `config.icon` is undefined, and rendering
 * `<Icon />` throws "Element type is invalid", blanking the subtree.
 *
 * `status` is a bare `string` off the API, and the signer row is about to
 * become a third caller. The same hazard was already fixed in
 * `packages/ui/src/constants/status.ts`; this mirrors it.
 */
export function esignStatusDisplay(status: string): EsignStatusConfigEntry {
  const own = Object.prototype.hasOwnProperty.call(ESIGN_STATUS_DISPLAY, status)
    ? ESIGN_STATUS_DISPLAY[status]
    : undefined;
  return own ?? (ESIGN_STATUS_DISPLAY['pending'] as EsignStatusConfigEntry);
}
