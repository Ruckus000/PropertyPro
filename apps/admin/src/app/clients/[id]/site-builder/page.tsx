/**
 * Site Builder page — dedicated route for the community site builder.
 *
 * Two-column grid: 60% BlockEditor, 40% PreviewPanel.
 *
 * When opened from a demo preview (`?demoId=N`), the back link returns to
 * the demo preview instead of the client workspace (which 404s for demos).
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { SiteBuilderLayout } from '@/components/site-builder/SiteBuilderLayout';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demoId?: string }>;
}

const CommunityRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  branding: z
    .object({
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      logoPath: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export default async function SiteBuilderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { demoId: demoIdRaw } = await searchParams;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    notFound();
  }

  const db = createAdminClient();
  const { data } = await db
    .from('communities')
    .select('id, name, slug, branding')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  const communityParse = CommunityRowSchema.safeParse(data);
  if (!communityParse.success) {
    notFound();
  }
  const community = communityParse.data;

  // Determine back-link: demo preview if demoId is provided, else client workspace
  const demoId = demoIdRaw ? Number(demoIdRaw) : null;
  const backHref =
    demoId && Number.isInteger(demoId) && demoId > 0
      ? `/demo/${demoId}/preview`
      : `/clients/${community.id}`;
  const backLabel =
    demoId && Number.isInteger(demoId) && demoId > 0
      ? 'Back to Demo Preview'
      : `Back to ${community.name}`;

  return (
    <AdminLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={12} />
            {backLabel}
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">
            Site Builder — {community.name}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Drag and drop blocks to build the community website
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 overflow-hidden">
          <SiteBuilderLayout
            communityId={community.id}
            communitySlug={community.slug}
            branding={community.branding}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
