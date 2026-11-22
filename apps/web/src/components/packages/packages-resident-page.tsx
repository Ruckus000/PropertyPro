'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { RecordList, RecordRow } from '@propertypro/ui/components/shared/record-row';
import {
  Section,
  SectionError,
  SectionFirstRun,
} from '@propertypro/ui/components/shared/section';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { useMyPackages, type PackageListItem } from '@/hooks/use-packages';
import { isNoUnitAssociationError } from '@/lib/units/no-unit-association';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface PackagesResidentPageProps {
  communityId: number;
}

// Same format and fallback as the current resident view, so the date reads alike.
function formatDatetime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

function PackageRow({ pkg }: { pkg: PackageListItem }) {
  const collected = pkg.status === 'picked_up';
  const word = collected ? 'Picked up' : 'Ready to collect';
  return (
    <RecordRow
      lead={<StatusGlyph kind={collected ? 'done' : 'in-progress'} label={word} hideLabel />}
      title={pkg.carrier}
      preview={pkg.trackingNumber ?? undefined}
      statusWord={word}
      meta={[`Received ${formatDatetime(pkg.createdAt)}`]}
    />
  );
}

export function PackagesResidentPage({ communityId }: PackagesResidentPageProps) {
  const { data: packages, isLoading, isError, error, refetch } = useMyPackages(communityId);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="space-y-3 px-4 py-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (isError && isNoUnitAssociationError(error)) {
    // Setup gap, not a failure: retrying cannot fix it (same call as the current view).
    body = (
      <SectionFirstRun
        title="Your account isn't linked to a unit yet"
        description="Packages are logged per unit. Once your manager links your account to your unit, packages delivered to it will show here."
        action={
          <Button asChild variant="outline">
            <Link href={`/help/contact?communityId=${communityId}`}>Contact management</Link>
          </Button>
        }
      />
    );
  } else if (isError) {
    body = (
      <SectionError
        message="We couldn't load your packages. Check your connection, then try again."
        onRetry={() => void refetch()}
      />
    );
  } else if (!packages || packages.length === 0) {
    body = (
      <SectionFirstRun
        title="No packages for you yet"
        description="When staff log a delivery for your unit it appears here and you get a notice."
      />
    );
  } else {
    body = (
      <RecordList>
        {packages.map((pkg) => (
          <PackageRow key={pkg.id} pkg={pkg} />
        ))}
      </RecordList>
    );
  }

  return (
    <PageLayout
      template="list"
      records="rows"
      header={
        <PageHeader
          title="My packages"
          navId="packages"
          description="Packages logged for your unit, and whether they are ready to collect."
        />
      }
    >
      <Section aria-busy={isLoading}>{body}</Section>
    </PageLayout>
  );
}
