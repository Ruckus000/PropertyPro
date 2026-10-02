/**
 * /dashboard/residents — permanently moved to the Directory (Residents tab).
 *
 * 308 so browsers and bookmarks update. Every query parameter is carried over
 * (communityId, q, …) and the Directory resolves the community itself,
 * tenant subdomain included, so this page needs no auth or lookup of its own.
 * Internal links point straight at the Directory; this only catches old
 * bookmarks and emails.
 */
import { permanentRedirect } from 'next/navigation';
import { directoryHref } from '@/lib/directory/directory-href';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResidentsPage({ searchParams }: PageProps) {
  permanentRedirect(directoryHref('residents', await searchParams));
}
