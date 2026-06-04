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

export async function removeProjectDomain(host: string): Promise<void> {
  const { projectId, teamId } = config();
  const { status, body } = await call(`/v9/projects/${projectId}/domains/${host}${teamQuery(teamId)}`, { method: 'DELETE' });
  if (status >= 400 && status !== 404) {
    throw new DomainProviderError(body?.error?.message ?? `Vercel error ${status}`, body?.error?.code);
  }
}
