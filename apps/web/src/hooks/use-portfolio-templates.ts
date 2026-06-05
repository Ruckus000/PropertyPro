'use client';

/**
 * React Query hooks for the PM portfolio-templates library at
 * `/pm/portfolio/templates`. All routes use the canonical `{ data: T }`
 * success envelope / `{ error: { code, message } }` error envelope.
 *
 * - usePortfolioTemplates  — GET    /api/v1/pm/portfolio/templates
 * - useCreateTemplate      — POST   (snapshot a community's branding)
 * - useRenameTemplate      — PATCH
 * - useDeleteTemplate      — DELETE
 * - useApplyTemplate       — POST   /api/v1/pm/portfolio/templates/{id}/apply
 *
 * Mirrors the raw-fetch + readJsonError style of use-custom-domain.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface PortfolioTemplate {
  id: number;
  name: string;
  siteLogoPath: string | null;
  createdAt: string;
  updatedAt: string;
  branding: Record<string, unknown>;
}

export interface ApplyResult {
  communityId: number;
  communityName: string;
  status: 'applied' | 'failed';
  reason?: string;
}

const listKey = ['pm', 'portfolio', 'templates'] as const;

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function usePortfolioTemplates() {
  return useQuery<PortfolioTemplate[]>({
    queryKey: listKey,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/v1/pm/portfolio/templates', { signal });
      if (!res.ok) throw new Error(await readJsonError(res));
      const body = (await res.json()) as { data: { templates: PortfolioTemplate[] } };
      return body.data.templates;
    },
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation<PortfolioTemplate, Error, { communityId: number; name: string }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/portfolio/templates', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readJsonError(res));
      const body = (await res.json()) as { data: PortfolioTemplate };
      return body.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}

export function useRenameTemplate() {
  const qc = useQueryClient();
  return useMutation<PortfolioTemplate, Error, { id: number; name: string }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/portfolio/templates', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readJsonError(res));
      const body = (await res.json()) as { data: PortfolioTemplate };
      return body.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await fetch('/api/v1/pm/portfolio/templates', {
        method: 'DELETE',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readJsonError(res));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}

export function useApplyTemplate() {
  return useMutation<ApplyResult[], Error, { id: number; communityIds: number[] }>({
    mutationFn: async ({ id, communityIds }) => {
      const res = await fetch(`/api/v1/pm/portfolio/templates/${id}/apply`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityIds }),
      });
      if (!res.ok) throw new Error(await readJsonError(res));
      const body = (await res.json()) as { data: { results: ApplyResult[] } };
      return body.data.results;
    },
  });
}
