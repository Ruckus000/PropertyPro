import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

/**
 * /inbox with no thread open. The list and the "Select a thread" placeholder
 * are the layout's; this page only keeps its own auth gate (a layout is not a
 * security boundary).
 */
export default async function InboxPage() {
  await requireAdminPageSession();
  return null;
}
