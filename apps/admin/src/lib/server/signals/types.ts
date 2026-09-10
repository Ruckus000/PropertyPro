/**
 * Shared vocabulary for the derived shell signals: nav badge counts, the
 * notification tray, and the critical-alert banner. Every signal is DERIVED
 * from an existing source of truth (support threads, leads, deletion
 * requests, etc.) — nothing here is stored.
 *
 * @module lib/server/signals/types
 */
import type { NavSignalKey } from '@/components/shell/nav-config';

export type SignalTone = 'danger' | 'warning' | 'info' | 'brand' | 'neutral';

export type SignalIcon =
  | 'bug'
  | 'creditCard'
  | 'inbox'
  | 'trash'
  | 'mail'
  | 'ticket'
  | 'activity'
  | 'user'
  | 'building';

/** One row in the notification tray. */
export interface ShellSignalItem {
  id: string;
  tone: SignalTone;
  icon: SignalIcon;
  title: string;
  meta: string;
  href: string;
  occurredAt: string;
}

/** The single most urgent thing worth a banner across the whole console. */
export interface ShellCritical {
  fingerprint: string;
  text: string;
  shortText: string;
  href: string;
}

/** What one domain provider returns: its nav badge count plus tray items. */
export interface ProviderResult {
  count: number;
  items: ShellSignalItem[];
  critical?: ShellCritical | null;
}

/** One per `NavSignalKey` — see `shell-signals.ts` for how these compose. */
export interface SignalProvider {
  key: NavSignalKey;
  load(): Promise<ProviderResult>;
}
