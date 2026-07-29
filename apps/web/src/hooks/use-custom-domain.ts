'use client';

/**
 * React Query hooks for the PM custom-domain card at /pm/settings/website.
 *
 * useCustomDomain  — GET    /api/v1/pm/site/domain?communityId=X
 *                    Returns the current DomainState (domain, status, DNS
 *                    records, etc). Seeds from the server-fetched `initial`.
 * useSetDomain     — POST   /api/v1/pm/site/domain { communityId, domain }
 *                    Sets/attaches a custom domain, returns the new DomainState.
 * useVerifyDomain  — POST   /api/v1/pm/site/domain/verify { communityId }
 *                    Re-checks DNS/verification, returns the refreshed state.
 * useRemoveDomain  — DELETE /api/v1/pm/site/domain { communityId }
 *                    Detaches the domain; resets the cache to the empty state.
 * useCheckDomainAvailability — GET /api/v1/pm/site/domain/check
 *                    Guided-purchase availability + indicative-price check.
 *                    A useMutation (explicit button trigger, no caching) —
 *                    the app never buys the domain; the UI links out to a
 *                    registrar.
 *
 * All routes use the canonical { data: T } success envelope and
 * { error: { code, message } } error envelope (B1 canonical). Raw fetch is kept
 * to render the thrown `.message` verbatim, mirroring use-hero-block.ts. This
 * client module imports NO server-only code (custom-domain-service, the Vercel
 * client, @propertypro/db) so it stays out of the client bundle's server graph.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

export interface DomainState {
  domain: string | null;
  status: 'pending' | 'active' | 'error' | null;
  verifiedAt: string | null;
  records: DnsRecord[];
  reason: string | null;
}

const domainQueryKey = (communityId: number) =>
  ['pm', 'site', 'domain', communityId] as const;

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

export interface UseCustomDomainOptions {
  /**
   * Set false to hold the request. The v3 Address panel passes the plan gate
   * here so a community without the feature never calls the provider — its
   * upsell state needs no domain data at all.
   */
  enabled?: boolean;
}

/**
 * `initial` is optional on purpose. The legacy settings page server-fetches the
 * state via `getDomain()` and seeds it; the v3 panel is mounted only when its
 * tab is opened and fetches on mount instead, so that provider round-trip stays
 * off every editor load.
 */
export function useCustomDomain(
  communityId: number,
  initial?: DomainState,
  options?: UseCustomDomainOptions,
) {
  return useQuery<DomainState>({
    queryKey: domainQueryKey(communityId),
    enabled: options?.enabled ?? true,
    initialData: initial,
    // When the caller seeded us, treat that seed as fresh on arrival so mount
    // doesn't fire a redundant GET; without a seed there is nothing to date.
    // Mutations (set/verify/remove) update the cache directly, so state
    // transitions don't depend on this refetch either way.
    ...(initial ? { initialDataUpdatedAt: () => Date.now() } : {}),
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/v1/pm/site/domain?communityId=${communityId}`, { signal });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as { data: DomainState };
      return body.data;
    },
  });
}

export function useSetDomain(communityId: number) {
  const qc = useQueryClient();
  return useMutation<DomainState, Error, string>({
    mutationFn: async (domain: string) => {
      const res = await fetch('/api/v1/pm/site/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, domain }),
      });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as { data: DomainState };
      return body.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(domainQueryKey(communityId), data);
    },
  });
}

export function useVerifyDomain(communityId: number) {
  const qc = useQueryClient();
  return useMutation<DomainState, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/site/domain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as { data: DomainState };
      return body.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(domainQueryKey(communityId), data);
    },
  });
}

export interface DomainAvailability {
  name: string;
  available: boolean;
  price: number | null;
  period: number | null;
}

export function useCheckDomainAvailability(communityId: number) {
  return useMutation<DomainAvailability, Error, string>({
    mutationFn: async (name: string) => {
      const params = new URLSearchParams({
        communityId: String(communityId),
        name,
      });
      const res = await fetch(`/api/v1/pm/site/domain/check?${params.toString()}`);
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as { data: DomainAvailability };
      return body.data;
    },
  });
}

export function useRemoveDomain(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/site/domain', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
    },
    onSuccess: () => {
      qc.setQueryData(
        domainQueryKey(communityId),
        {
          domain: null,
          status: null,
          verifiedAt: null,
          records: [],
          reason: null,
        } satisfies DomainState,
      );
    },
  });
}
