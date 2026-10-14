import { AdminDetailLoading } from '@/components/loading/AdminPageLoading';

/** Detail pane only — the thread list in `layout.tsx` stays on screen. */
export default function ThreadLoading() {
  return <AdminDetailLoading label="Loading conversation" />;
}
