import { BoardPollsPanel } from '@/components/board/board-polls-panel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardPollsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  return <BoardPollsPanel communityId={communityId} />;
}
