import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/communities/${id}/board/polls`);
}
