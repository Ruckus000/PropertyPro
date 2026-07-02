/**
 * Shared types for legal documents. Kept in a dependency-free module (no `fs`,
 * no `server-only`) so both the server-side content helper and client-side
 * components can import the types without pulling in server-only runtime deps.
 */

export type LegalDocKey = 'terms' | 'privacy';

/** Pre-rendered legal-document HTML keyed by doc. */
export type LegalDocs = Record<LegalDocKey, string>;
