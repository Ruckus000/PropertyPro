/**
 * Vercel Domains client — a thin, typed wrapper over the Vercel Domains REST API.
 *
 * NODE RUNTIME ONLY. This module MUST NEVER be imported by
 * `apps/web/src/middleware.ts` (edge runtime) — it relies on node-runtime
 * `fetch` against the Vercel API with server-only env secrets and is intended
 * to be consumed by node-runtime API routes (PR5).
 *
 * Required env vars (documented in `.env.example`):
 *   - VERCEL_TOKEN      — bearer token for the Vercel API
 *   - VERCEL_PROJECT_ID — target project id
 *   - VERCEL_ORG_ID     — team id (team-scoped → passed as `?teamId=`)
 *
 * NOTE: The exact Vercel response field shape (`verified` / `misconfigured` /
 * `verification`) should be confirmed against a live
 * `vercel domains inspect <host>` probe in PR5. The 3-state contract exposed
 * here (`pending` | `active` | `error`) is stable regardless of the underlying
 * field names.
 */

export class DomainProvisioningUnavailableError extends Error {}
export class DomainProviderError extends Error {
  constructor(message: string, readonly providerCode?: string) { super(message); }
}
/** Vercel returned 429 — surface as our own 429 rather than a 502. */
export class DomainProviderRateLimitedError extends DomainProviderError {}

export type DomainStatus = 'pending' | 'active' | 'error';
export interface DnsRecord { type: string; name: string; value: string; }
export interface DomainStatusResult { status: DomainStatus; records: DnsRecord[]; reason?: string; }

function config() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ORG_ID;
  if (!token || !projectId) throw new DomainProvisioningUnavailableError('Custom-domain provisioning is not configured.');
  return { token, projectId, teamId };
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function call(path: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const { token } = config();
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function toRecords(verification: unknown): DnsRecord[] {
  if (!Array.isArray(verification)) return [];
  return verification.map((v: any) => ({ type: v.type, name: v.domain, value: v.value }));
}

function mapStatus(body: any): DomainStatus {
  if (body?.verified === true && body?.misconfigured !== true) return 'active';
  return 'pending';
}

export async function addProjectDomain(host: string): Promise<DomainStatusResult> {
  const { projectId, teamId } = config();
  const { status, body } = await call(`/v10/projects/${projectId}/domains${teamQuery(teamId)}`, {
    method: 'POST',
    body: JSON.stringify({ name: host }),
  });
  // Idempotent: a domain already in our project is fine — return pending; the
  // PM's "Check status" will refine it. (Do NOT re-call here — avoids a second
  // round-trip and keeps the function single-fetch.)
  if (status === 409 && body?.error?.code === 'domain_already_in_use') {
    return { status: 'pending', records: [] };
  }
  if (status >= 400) {
    return { status: 'error', records: [], reason: body?.error?.message ?? `Vercel error ${status}` };
  }
  return { status: mapStatus(body), records: toRecords(body?.verification) };
}

export async function getDomainStatus(host: string): Promise<DomainStatusResult> {
  const { projectId, teamId } = config();
  const { status, body } = await call(`/v9/projects/${projectId}/domains/${host}${teamQuery(teamId)}`, { method: 'GET' });
  if (status >= 400) return { status: 'error', records: [], reason: body?.error?.message ?? `Vercel error ${status}` };
  return { status: mapStatus(body), records: toRecords(body?.verification) };
}

export interface DomainAvailabilityResult {
  available: boolean;
  /** Vercel's registration price in USD, or null when unknown/unreliable. */
  price: number | null;
  /** Registration period in years the price covers, or null when unknown. */
  period: number | null;
}

/**
 * Availability + best-effort price for a domain the PM might buy elsewhere
 * (guided-purchase flow — we never call the buy endpoint).
 *
 *   GET /v4/domains/status?name=…  → { available: boolean }
 *   GET /v4/domains/price?name=…&type=new → { price, period }
 *
 * These endpoints already carry a query string, so the query is built with
 * URLSearchParams — `teamQuery()` emits a leading `?` and would corrupt it.
 * The price call is best-effort: any failure degrades to price=null rather
 * than failing the availability answer.
 */
export async function checkDomainAvailability(name: string): Promise<DomainAvailabilityResult> {
  const { teamId } = config();

  const statusParams = new URLSearchParams({ name });
  if (teamId) statusParams.set('teamId', teamId);
  const { status, body } = await call(`/v4/domains/status?${statusParams.toString()}`, { method: 'GET' });
  if (status === 429) {
    throw new DomainProviderRateLimitedError(
      'Too many domain checks right now — try again in a minute.',
      body?.error?.code,
    );
  }
  if (status >= 400) {
    throw new DomainProviderError(body?.error?.message ?? `Vercel error ${status}`, body?.error?.code);
  }
  if (body?.available !== true) {
    return { available: false, price: null, period: null };
  }

  try {
    const priceParams = new URLSearchParams({ name, type: 'new' });
    if (teamId) priceParams.set('teamId', teamId);
    const priceRes = await call(`/v4/domains/price?${priceParams.toString()}`, { method: 'GET' });
    if (priceRes.status < 400 && typeof priceRes.body?.price === 'number') {
      return {
        available: true,
        price: priceRes.body.price,
        period: typeof priceRes.body?.period === 'number' ? priceRes.body.period : null,
      };
    }
  } catch {
    // Price is decorative — never fail the availability answer over it.
  }
  return { available: true, price: null, period: null };
}

export async function removeProjectDomain(host: string): Promise<void> {
  const { projectId, teamId } = config();
  const { status, body } = await call(`/v9/projects/${projectId}/domains/${host}${teamQuery(teamId)}`, { method: 'DELETE' });
  if (status >= 400 && status !== 404) {
    throw new DomainProviderError(body?.error?.message ?? `Vercel error ${status}`, body?.error?.code);
  }
}
