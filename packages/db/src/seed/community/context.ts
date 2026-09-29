/** Shared seed plumbing: the one unscoped client every seed module writes through, debug logging, and row extraction. */
import { createUnscopedClient } from '../../unsafe';

export const db = createUnscopedClient();

const DEBUG_DEMO_SEED = process.env.DEBUG_DEMO_SEED === '1';
export const DAY_MS = 24 * 60 * 60 * 1000;

export function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  return [];
}

export function debugSeed(message: string): void {
  if (DEBUG_DEMO_SEED) {
    // eslint-disable-next-line no-console
    console.log(`[seed-community] ${message}`);
  }
}
