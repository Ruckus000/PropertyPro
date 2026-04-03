import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnnouncementsRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/announcements?communityId=${id}`);
}
