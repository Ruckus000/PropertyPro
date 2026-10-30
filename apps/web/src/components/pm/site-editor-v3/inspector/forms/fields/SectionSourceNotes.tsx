'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useSectionSources } from '../../section-sources-context';
import {
  announcementsHref,
  documentsHref,
  meetingsHref,
  newAnnouncementHref,
  websiteRecordsHref,
} from '../../source-links';
import { SourceLink } from './SourceLink';

/** The three sections that list what the community already keeps elsewhere. */
export type ListedSectionType = 'announcements' | 'meetings' | 'documents';

const SOURCE_NAME: Record<ListedSectionType, string> = {
  announcements: 'Announcements',
  meetings: 'Meetings',
  documents: 'Documents',
};

const SOURCE_HREF: Record<ListedSectionType, (communityId: number) => string> = {
  announcements: announcementsHref,
  meetings: meetingsHref,
  documents: documentsHref,
};

/** Whether this block type is one the community's own pages feed. */
export function isListedSection(blockType: string): blockType is ListedSectionType {
  return Object.prototype.hasOwnProperty.call(SOURCE_NAME, blockType);
}

export interface SectionSourceNoteProps {
  communityId: number;
  blockType: ListedSectionType;
}

/**
 * Where a listing section gets what it shows: "Updates by itself from
 * Announcements", with the name as a link to that page. Nothing is typed into
 * these sections, so the panel's first job is to say where to go instead.
 * Announcements also offers the shortest way to add to it.
 */
export function SectionSourceNote({ communityId, blockType }: SectionSourceNoteProps) {
  const source = SOURCE_NAME[blockType];
  return (
    <div className="space-y-3">
      <p className="text-sm text-content-secondary">
        Updates by itself from <SourceLink href={SOURCE_HREF[blockType](communityId)}>{source}</SourceLink>.
        {blockType === 'documents' ? " Only documents you've made public are listed here." : null}
      </p>
      {blockType === 'announcements' && (
        <Button asChild variant="outline" className="min-h-11 md:min-h-9">
          <Link href={newAnnouncementHref(communityId)}>Write an announcement</Link>
        </Button>
      )}
    </div>
  );
}

export interface OwnerRecordsNoteProps {
  communityId: number;
}

/**
 * The owners' records the website's Documents section summarises, with how many
 * are posted in each group, and a link to the website home's list of the records
 * still missing.
 *
 * Nothing here names a record: the count is all the public site shows too.
 * Renders nothing for a community that owes no records list (apartments).
 */
export function OwnerRecordsNote({ communityId }: OwnerRecordsNoteProps) {
  const { ownerRecordGroups, recordsApply } = useSectionSources();
  if (!recordsApply) return null;

  const posted = (ownerRecordGroups ?? []).filter((group) => group.postedCount > 0);
  return (
    <div className="space-y-2 rounded-md border border-edge bg-surface-muted p-3">
      <h3 className="text-sm font-semibold text-content">Records for owners</h3>
      {ownerRecordGroups === null ? null : posted.length > 0 ? (
        <>
          <p className="text-sm text-content-secondary">
            {"Owners sign in to see these. Your website shows a summary of them here instead of the files:"}
          </p>
          <ul className="space-y-1 text-sm font-medium text-content">
            {posted.map((group) => (
              <li key={group.label}>{`${group.label} · ${group.postedCount}`}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-content-secondary">
          No records for owners are posted yet, so your website has no summary to show.
        </p>
      )}
      <p className="text-sm">
        <SourceLink href={websiteRecordsHref(communityId)}>See the records on your website home</SourceLink>
      </p>
    </div>
  );
}
