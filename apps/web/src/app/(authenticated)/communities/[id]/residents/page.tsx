import { redirect } from 'next/navigation';
import { directoryHref } from '@/lib/directory/directory-href';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResidentsRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(directoryHref('residents', { communityId: id }));
}
