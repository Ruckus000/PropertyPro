// breadcrumbs:exempt — redirect-only page
/**
 * There is no standalone wind-mitigation index — the list lives on the
 * insurance hub. This route exists only so the auto-derived breadcrumb crumb
 * "Wind Mitigation" (on a report detail page) has a destination; it redirects
 * back to the hub.
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WindMitigationIndexPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/communities/${id}/insurance`);
}
