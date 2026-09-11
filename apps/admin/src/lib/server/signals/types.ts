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
  /**
   * Which nav signal produced this row. Stamped by `getShellSignals` from the
   * provider that returned it — providers do not set it, which is why
   * `ProviderResult.items` omits it.
   *
   * Carried rather than derived on purpose. The dashboard's attention queue
   * needs to group rows by signal, and the only alternative is to match an
   * item's `href` back to the nav entry that owns it by string prefix. That
   * works today only because all three live providers happen to emit an href
   * under their nav item's path, and it makes every FUTURE provider silently
   * responsible for a convention nothing checks.
   */
  key: NavSignalKey;
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
  /** Without `key` — `getShellSignals` stamps it from the provider's own key. */
  items: Omit<ShellSignalItem, 'key'>[];
  critical?: ShellCritical | null;
}

/** One per `NavSignalKey` — see `shell-signals.ts` for how these compose. */
export interface SignalProvider {
  key: NavSignalKey;
  load(): Promise<ProviderResult>;
}
