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

export function useCustomDomain(communityId: number, initial?: DomainState) {
  return useQuery<DomainState>({
    queryKey: domainQueryKey(communityId),
    initialData: initial,
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
