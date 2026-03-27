import { BoardForumPanel } from '@/components/board/board-forum-panel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardForumPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  return <BoardForumPanel communityId={communityId} />;
}
