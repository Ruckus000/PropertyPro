import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

/**
 * /tickets with no ticket open. The queue, its header and the "Select a
 * ticket" placeholder are the layout's; this page only keeps its own auth gate
 * (a layout is not a security boundary).
 */
export default async function TicketsPage() {
  await requireAdminPageSession();
  return null;
}
