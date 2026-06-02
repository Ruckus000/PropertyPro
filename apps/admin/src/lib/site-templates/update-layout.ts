/**
 * Client helper for the layout-metadata PATCH (spec §5.1 / §5.6).
 *
 * PATCH /api/admin/site-templates/layouts/[slug] with the changed fields.
 * Returns the shaped layout row on success; throws with the server's error
 * message otherwise. Kept as a plain async fn (admin has no react-query) so
 * the network contract is unit-testable in isolation.
 */
import type { LayoutRow } from '@/components/site-templates/LayoutsTable';

export interface LayoutMetadataPatch {
  displayName?: string;
  tagline?: string | null;
  description?: string | null;
  tier?: 'essentials' | 'professional' | 'pm';
  isFeatured?: boolean;
  isArchived?: boolean;
}

export async function saveLayoutMetadata(
  slug: string,
  patch: LayoutMetadataPatch,
): Promise<LayoutRow> {
  const res = await fetch(`/api/admin/site-templates/layouts/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Request failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { layout: LayoutRow };
  return body.layout;
}
