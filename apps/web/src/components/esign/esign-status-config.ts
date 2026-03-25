/**
 * Shared esign status configuration — single source of truth for
 * status badge labels, variants, and icons across esign components.
 */

import type { BadgeVariant } from '@propertypro/ui';
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

export interface EsignStatusConfigEntry {
  label: string;
  variant: BadgeVariant;
  icon: typeof Clock;
}

export const ESIGN_STATUS_CONFIG: Record<string, EsignStatusConfigEntry> = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  processing: { label: 'Processing', variant: 'info', icon: Loader2 },
  processing_failed: { label: 'Processing Failed', variant: 'danger', icon: AlertTriangle },
  opened: { label: 'Opened', variant: 'info', icon: Eye },
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  declined: { label: 'Declined', variant: 'danger', icon: XCircle },
  expired: { label: 'Expired', variant: 'neutral', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', variant: 'neutral', icon: Ban },
};

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
