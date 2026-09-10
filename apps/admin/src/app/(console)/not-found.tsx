/**
 * 404 for records that do not exist — rendered INSIDE the console shell.
 *
 * `notFound()` is called eleven times across four console pages (an unknown
 * community, demo or thread id). Without this file the nearest boundary was
 * `app/not-found.tsx`, which sits outside this route group: the rail, the top
 * bar and the command palette all disappeared, and the only way back was the
 * browser. This file is wrapped by `(console)/layout.tsx`, so the shell
 * survives.
 *
 * It renders NO <main> and no `#main-content` — `AdminShell` owns that landmark
 * (AdminShell.tsx:214), and duplicating the id is what
 * __tests__/shell/loading-skip-target.test.tsx exists to catch.
 *
 * AUTHZ: inherited from `(console)/layout.tsx`, which gates the whole group.
 */
import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button, EmptyState, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';

export const dynamic = 'force-dynamic';

export default function ConsoleNotFound() {
  return (
    <PageBody>
      <AdminPageHeader title="Not found" />
      <EmptyState
        icon={FileQuestion}
        title="This record doesn't exist"
        description="It may have been deleted, or the link may be out of date."
        action={
          <Button asChild>
            <Link href="/clients">Back to Clients</Link>
          </Button>
        }
      />
    </PageBody>
  );
}
