import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * The console's shared-segment boundary. A `loading.tsx` covers navigation
 * between the children of the segment it sits in, so the per-section files
 * below only help once their own prefetch has landed. This one covers every
 * move between console sections before that — and `/leads`, which is
 * force-dynamic and has no boundary of its own, so the previous page stayed on
 * screen until the server finished.
 */
export default function ConsoleLoading() {
  return <AdminPageLoading />;
}
