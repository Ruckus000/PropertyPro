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
