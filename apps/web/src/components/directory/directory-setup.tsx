'use client';

/**
 * The Directory setup guide (spec docs/design-system/patterns/empty-states.md
 * §4.1 "Directory (units + residents)"; plan P3, audit F-1 to F-4).
 *
 * One flow: Units → Residents → Invitations. A resident always needs a unit,
 * so Residents stays blocked (with the reason) until a unit exists; that is
 * what closes F-1's dead end. Resident import sends no email, which is why
 * Invitations is its own step. Every control maps to a shipped route: the
 * unit and resident CSV importers (dry-run preview first), the add-unit and
 * add-resident dialogs, and the residents list filtered to who is not active.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, UserPlus, Building2 } from 'lucide-react';
import { DirectoryScene } from '@propertypro/ui';
import type { CommunityType } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ContextLinks,
  ContextSection,
  SetupGuide,
  SetupSlot,
  SetupSlotList,
  type SetupStep,
} from '@/components/shared/setup-guide';
import { UNIT_CSV_TEMPLATE, UNIT_IMPORT_MAX_ROWS } from '@/lib/utils/unit-csv-validator';

/** The resident importer's own template header and example rows (import-residents-client.tsx). */
const RESIDENT_CSV_COLUMNS = ['name', 'email', 'role', 'unit_number'];

interface DirectorySetupProps {
  communityId: number;
  communityType: CommunityType;
  unitCount: number;
  residentCount: number;
  /** Residents with a login who have never been invited: the invitations still to send. */
  notInvitedCount: number;
  onAddUnit: () => void;
  onAddResident: () => void;
  /** Open the residents list filtered to who is not active. */
  onReviewInvites: () => void;
  /** Present when the directory exists behind the guide. */
  onClose?: () => void;
}

export function DirectorySetup({
  communityId,
  communityType,
  unitCount,
  residentCount,
  notInvitedCount,
  onAddUnit,
  onAddResident,
  onReviewInvites,
  onClose,
}: DirectorySetupProps) {
  const router = useRouter();
  const importUnits = `/dashboard/import-units?communityId=${communityId}`;
  const importResidents = `/dashboard/import-residents?communityId=${communityId}`;
  const apartment = communityType === 'apartment';
  const [header = '', ...exampleRows] = UNIT_CSV_TEMPLATE.split('\n');
  // Each step depends on the one before: a blocked step is never shown as done,
  // even if (say) a resident exists without a unit.
  const unitsDone = unitCount > 0;
  const residentsDone = unitsDone && residentCount > 0;
  const invitationsDone = residentsDone && notInvitedCount === 0;

  const steps: SetupStep[] = [
    {
      id: 'units',
      label: 'Units',
      done: unitsDone,
      heading: 'Add your units',
      description: apartment
        ? 'Every lease, resident and request hangs off a unit. Import them all at once, or add one at a time.'
        : 'Every resident and request hangs off a unit. Import them all at once, or add one at a time.',
      countLabel: `${unitCount} ${unitCount === 1 ? 'unit' : 'units'}`,
      action: (
        <Button asChild>
          <Link href={importUnits}>Import a spreadsheet</Link>
        </Button>
      ),
      content: (
        <div className="flex flex-col gap-6">
          <SetupSlotList label="Ways to add units">
            <SetupSlot
              title="From a spreadsheet"
              description={`Up to ${UNIT_IMPORT_MAX_ROWS.toLocaleString('en-US')} units per file`}
              addLabel="Import units"
              icon={<FileSpreadsheet className="size-5" />}
              onAdd={() => router.push(importUnits)}
            />
            <SetupSlot
              title="One at a time"
              description="Type a unit in by hand"
              addLabel="Add a unit"
              icon={<Building2 className="size-5" />}
              onAdd={onAddUnit}
            />
          </SetupSlotList>
          <CsvFormat
            label="Unit spreadsheet format"
            columns={header.split(',')}
            // The importer's own template rows. Apartments take occupancy from leases, so it is blank there.
            rows={exampleRows.map((row) => row.split(',').map((cell, i, all) => (apartment && i === all.length - 1 ? '' : cell)))}
            note={
              apartment
                ? 'Leave occupancy blank: for apartments it comes from leases. You see every row before anything is saved.'
                : 'Only unit_number is required. You see every row before anything is saved.'
            }
          />
        </div>
      ),
    },
    {
      id: 'residents',
      label: 'Residents',
      done: residentsDone,
      ...(!unitsDone ? { disabledReason: 'Residents unlock after units: everyone needs a unit.' } : {}),
      heading: 'Add the people who live here',
      description: 'Importing residents sends no email, so you choose when to invite them.',
      countLabel: `${residentCount} ${residentCount === 1 ? 'resident' : 'residents'}`,
      // Apartments have tenants only: the importer refuses role=owner there.
      items: apartment ? [{ label: 'Tenants' }] : [{ label: 'Owners' }, { label: 'Tenants' }],
      action: (
        <Button asChild>
          <Link href={importResidents}>Import residents</Link>
        </Button>
      ),
      content: (
        <div className="flex flex-col gap-6">
          <SetupSlotList label="Ways to add residents">
            <SetupSlot
              title="From a spreadsheet"
              description="Each row names the resident's unit"
              addLabel="Import residents"
              icon={<FileSpreadsheet className="size-5" />}
              onAdd={() => router.push(importResidents)}
            />
            <SetupSlot
              title="One at a time"
              description="You can invite them as you add them"
              addLabel="Add a resident"
              icon={<UserPlus className="size-5" />}
              onAdd={onAddResident}
            />
          </SetupSlotList>
          <CsvFormat
            label="Resident spreadsheet format"
            columns={RESIDENT_CSV_COLUMNS}
            note={
              apartment
                ? 'role is tenant, and unit_number must match a unit you added.'
                : 'role is owner or tenant, and unit_number must match a unit you added.'
            }
          />
        </div>
      ),
    },
    {
      id: 'invitations',
      label: 'Invitations',
      done: invitationsDone,
      ...(!residentsDone ? { disabledReason: 'Invitations unlock after residents.' } : {}),
      heading: 'Invite residents to the portal',
      description: 'Residents can sign in once you invite them. Review who has not been invited, or has not accepted yet.',
      countLabel: `${notInvitedCount} not invited`,
      action: (
        <Button onClick={onReviewInvites} disabled={!residentsDone}>
          Review who to invite
        </Button>
      ),
    },
  ];

  return (
    <SetupGuide
      eyebrow="Directory"
      title="Build your community directory"
      description="Units first, then the people who live in them. Residents hear from you only once you invite them."
      facts={[
        { label: `Up to ${UNIT_IMPORT_MAX_ROWS.toLocaleString('en-US')} units per file` },
        { label: 'Preview before anything is saved' },
      ]}
      illustration={<DirectoryScene size="hero" />}
      steps={steps}
      onClose={onClose}
      context={
        <>
          {apartment && (
            <ContextSection title="Then: leases">
              <p className="text-sm text-content-secondary">Once units exist, add each occupied unit&apos;s lease to track renewals and move-outs.</p>
              <ContextLinks links={[{ href: `/dashboard/leases?communityId=${communityId}`, label: 'Open Leases' }]} />
            </ContextSection>
          )}
          <ContextSection title="Help">
            <ContextLinks
              links={[
                { href: '/help/residents/units', label: 'Manage units and buildings' },
                { href: '/help/residents/invite-residents', label: 'Invite residents' },
              ]}
            />
          </ContextSection>
        </>
      }
    />
  );
}

/** The real columns of an importer's spreadsheet: a keyboard-scrollable table (spec §6.3). */
function CsvFormat({
  label,
  columns,
  rows = [],
  note,
}: {
  label: string;
  columns: string[];
  rows?: string[][];
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-content">What the spreadsheet needs</h4>
      {/* The house Table: its scroll box takes focus only when it scrolls, so
          keyboard users can reach the columns off-screen. */}
      <div className="rounded-md border border-edge">
        <Table aria-label={label} className="text-xs">
          <TableHeader className="bg-surface-muted">
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c} scope="col" className="whitespace-nowrap">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {rows.length > 0 && (
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.join(',')}>
                  {row.map((cell, i) => (
                    <TableCell key={columns[i]} className="whitespace-nowrap">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </div>
      <p className="text-xs text-content-secondary">{note}</p>
    </div>
  );
}
