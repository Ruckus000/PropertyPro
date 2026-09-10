/**
 * Composes the seven per-domain signal providers into the shell's nav badge
 * counts, notification tray, and critical-alert banner.
 *
 * Every signal is DERIVED from an existing source of truth — nothing here is
 * stored. Three providers (`inbox`, `leads`, `deletion`) read live data;
 * four (`tickets`, `health`, `billing`, `onboarding`) are Wave-3 stubs — see
 * their files under `./signals/`.
 *
 * A provider that throws must never blank the rest of the shell: it is
 * caught, reported to Sentry, and named in `failed` — a Sentry-backed record
 * with no UI consumer yet. Today a failed provider is indistinguishable from
 * "nothing needs attention" (the nav badge only renders when its count is
 * non-zero, and a thrown provider's count stays at its `ZERO` seed). Wave 3's
 * Health surface is what will read `failed` to show a per-section error
 * state; until then this field exists so that surface has something to build
 * on, not because anything renders it.
 *
 * @module lib/server/shell-signals
 */
import { cache } from 'react';
import * as Sentry from '@sentry/nextjs';
import type { NavSignalKey } from '@/components/shell/nav-config';
import type { ShellCritical, ShellSignalItem, SignalProvider } from './signals/types';
import { inboxSignals } from './signals/inbox';
import { ticketsSignals } from './signals/tickets';
import { healthSignals } from './signals/health';
import { billingSignals } from './signals/billing';
import { onboardingSignals } from './signals/onboarding';
import { leadsSignals } from './signals/leads';
import { deletionSignals } from './signals/deletion';

export interface ShellSignals {
  counts: Record<NavSignalKey, number>;
  items: ShellSignalItem[];
  critical: ShellCritical | null;
  generatedAt: string;
  /**
   * Providers that threw, reported to Sentry by `getShellSignals`. No UI
   * reads this today — a failed provider just leaves that key's count at 0,
   * so it renders identically to "nothing needs attention." Wave 3's Health
   * surface is the intended consumer for a per-section error state.
   */
  failed: NavSignalKey[];
}

/** Provider order is the critical-alert priority (spec D20): health, billing, then the rest. */
export const DEFAULT_PROVIDERS: SignalProvider[] = [
  healthSignals, billingSignals, inboxSignals, ticketsSignals, onboardingSignals, leadsSignals, deletionSignals,
];

const ZERO: Record<NavSignalKey, number> = { inbox: 0, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 };

async function loadShellSignals(providers: SignalProvider[] = DEFAULT_PROVIDERS): Promise<ShellSignals> {
  const settled = await Promise.allSettled(providers.map((p) => p.load()));
  const counts = { ...ZERO };
  const items: ShellSignalItem[] = [];
  const failed: NavSignalKey[] = [];
  let critical: ShellCritical | null = null;
  settled.forEach((result, i) => {
    const key = providers[i]!.key;
    if (result.status === 'rejected') {
      failed.push(key);
      Sentry.captureException(result.reason, { tags: { shell_signal: key } });
      return;
    }
    counts[key] = result.value.count;
    items.push(...result.value.items);
    if (!critical && result.value.critical) critical = result.value.critical;
  });
  // Newest first. Ties (equal `occurredAt`) fall through to 0 rather than an
  // arbitrary -1/1, so Array#sort's stability preserves provider order for
  // same-instant items instead of a comparator that is inconsistent for tied
  // pairs (`a<b?1:-1` claims `a` precedes `b` AND `b` precedes `a` when equal).
  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
  return { counts, items: items.slice(0, 12), critical, generatedAt: new Date().toISOString(), failed };
}

/**
 * Wrapped in React's `cache()` so the console layout (shell chrome) and any
 * page that also needs signals (the dashboard) share one load per request
 * instead of running all seven providers twice. Both call sites invoke this
 * with no arguments, so they share the same cache key regardless of the
 * `providers` default applied inside `loadShellSignals`.
 *
 * Outside an active Server Component render — this file's own tests, or any
 * plain call from Node — React's client build makes `cache()` a no-op
 * passthrough, so this has no effect there.
 */
export const getShellSignals = cache(loadShellSignals);
