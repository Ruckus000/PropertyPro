/**
 * Site Builder page — dedicated route for the community site builder.
 *
 * Two-column grid: 60% BlockEditor, 40% PreviewPanel.
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
}

const CommunityRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
});

export default async function SiteBuilderPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    notFound();
  }

  const db = createAdminClient();
  const { data } = await db
    .from('communities')
    .select('id, name, slug')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  const communityParse = CommunityRowSchema.safeParse(data);
  if (!communityParse.success) {
    notFound();
  }
  const community = communityParse.data;

  return (
    <AdminLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <Link
            href={`/clients/${community.id}`}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={12} />
            Back to {community.name}
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
          />
        </div>
      </div>
    </AdminLayout>
  );
}
