/**
 * The Mine tab of violations-page.tsx: "On your unit" and "Your reports",
 * server-rendered rows that crossed to the client through `toCardFields`.
 * A report about a unit that is not the viewer's renders without a link.
 */
import Link from 'next/link';
import { RecordList } from '@propertypro/ui/components/shared/record-row';
import {
  Section,
  SectionFirstRun,
  SectionHeader,
} from '@propertypro/ui/components/shared/section';
import { Button } from '@/components/ui/button';
import type { ViolationCardFields } from '@/lib/violations/resident-lists';
import { ViolationRow } from './violations-page-rows';

export interface ViolationsMine {
  residentUnitIds: number[];
  onYourUnit: ViolationCardFields[];
  yourReports: ViolationCardFields[];
}

export function MineBody({
  communityId,
  mine,
  reportHref,
}: {
  communityId: number;
  mine: ViolationsMine;
  reportHref: string;
}) {
  if (mine.residentUnitIds.length === 0) {
    return (
      <Section>
        <SectionFirstRun
          headingLevel={2}
          title="You're not linked to a unit yet"
          description="Contact your community manager to be assigned to a unit, then return here to file a report."
          action={
            <Button asChild variant="outline">
              <Link href={`/dashboard?communityId=${communityId}`}>Back to dashboard</Link>
            </Button>
          }
        />
      </Section>
    );
  }

  if (mine.onYourUnit.length === 0 && mine.yourReports.length === 0) {
    return (
      <Section>
        <SectionFirstRun
          headingLevel={2}
          title="Nothing here yet"
          description="Cases on your home and the reports you file will show here."
          action={
            <Button asChild variant="outline">
              <Link href={reportHref}>Report a violation</Link>
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      {mine.onYourUnit.length > 0 ? (
        <Section>
          <SectionHeader title="On your unit" />
          <RecordList>
            {mine.onYourUnit.map((v) => (
              <ViolationRow key={v.id} v={v} communityId={communityId} linkable />
            ))}
          </RecordList>
        </Section>
      ) : null}
      {mine.yourReports.length > 0 ? (
        <Section>
          <SectionHeader
            title="Your reports"
            description="Reports you filed. A report about another home opens only for that household and the board."
          />
          <RecordList>
            {mine.yourReports.map((v) => (
              <ViolationRow
                key={v.id}
                v={v}
                communityId={communityId}
                linkable={mine.residentUnitIds.includes(v.unitId)}
              />
            ))}
          </RecordList>
        </Section>
      ) : null}
    </div>
  );
}
