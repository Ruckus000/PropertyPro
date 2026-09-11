/**
 * Onboarding as a shell signal: the nav badge and the tray rows (spec D11).
 *
 * The badge counts cards with a BLOCKER — a demo about to go stale, a trial
 * whose root manager was never claimed, a trial ending this week. Not the
 * pipeline's size: a badge showing "23" because there are 23 open leads is a
 * number nobody can ever drive to zero, and a badge that never clears is one an
 * operator stops reading. A blocker, by contrast, is a thing to do.
 *
 * ## Why this one throws, unlike `billingSignals`
 *
 * Every read behind it is a table this deployment owns — no external
 * credential, no optional dependency — so a failure means the database said no,
 * not that a developer has not configured anything. `getShellSignals` settles
 * every provider and reports the rejection to Sentry, which is the right outcome
 * for "we asked and it broke".
 *
 * `critical` is always absent: an onboarding blocker is work, not an
 * interruption, and health owns the one banner the console can be stopped by.
 *
 * @module lib/server/signals/onboarding
 */
import { STAGES, getPipeline } from '../onboarding';
import type { SignalProvider } from './types';

/** How many blocked cards reach the tray before it stops being a tray. */
const TRAY_ROW_LIMIT = 5;

export const onboardingSignals: SignalProvider = {
  key: 'onboarding',
  async load() {
    const pipeline = await getPipeline();

    const blocked = STAGES.flatMap((stage) => pipeline.stages[stage]).filter(
      (card) => card.blocker !== null,
    );

    // Newest event first, so the tray's own sort (which mixes providers) gets a
    // stable order to merge rather than whatever the stage order happened to be.
    const ordered = [...blocked].sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
    );

    return {
      // The BADGE counts every blocked card; the TRAY shows the first few. A
      // badge capped at the tray limit would under-report the queue it counts.
      count: blocked.length,
      items: ordered.slice(0, TRAY_ROW_LIMIT).map((card) => ({
        id: `onboarding-${card.id}`,
        tone: 'warning' as const,
        icon: 'building' as const,
        title: `${card.name}: ${card.blocker}`,
        meta: card.next,
        href: card.href,
        // The row's own event time, not the read time — stamping "now" would
        // float every blocked card to the top of the tray forever.
        occurredAt: card.occurredAt,
      })),
      critical: null,
    };
  },
};
