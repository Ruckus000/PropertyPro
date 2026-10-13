import { AdminDetailLoading } from '@/components/loading/AdminPageLoading';

/** Detail pane only — the queue in `layout.tsx` stays on screen. */
export default function TicketLoading() {
  return <AdminDetailLoading label="Loading ticket" />;
}
