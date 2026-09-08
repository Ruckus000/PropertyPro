import type { SignalProvider } from './types';

/** Filled by Wave 3 (spec D11). The shell composes this key from day one so the nav badge slot exists. */
export const billingSignals: SignalProvider = { key: 'billing', async load() { return { count: 0, items: [] }; } };
