/**
 * One violation as a RecordRow, shared by the Review and Mine tabs of
 * violations-page.tsx. Accepts the Review API item or the Mine card fields;
 * reads only what both carry.
 */
import Link from 'next/link';
import type { ViolationStatus } from '@propertypro/db';
import { RecordRow } from '@propertypro/ui/components/shared/record-row';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { formatShortDate } from '@/lib/utils/format-date';
import {
  categoryLabel,
  VIOLATION_STATUS_LABELS,
  violationGlyph,
} from '@/lib/violations/vocabulary';

export interface ViolationRowFields {
  id: number;
  unitId: number;
  unitLabel?: string;
  category: string;
  description: string;
  status: string;
  severity: string;
  createdAt: string | Date;
  reportedByRole?: 'staff' | 'resident' | null;
}

/** A text-styled button with the 44px touch floor below `md`. */
export const TEXT_BUTTON_CLASS =
  'min-h-11 font-medium text-content-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-0';

const capitalise = (s: string) => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

function isStatus(s: string): s is ViolationStatus {
  return s in VIOLATION_STATUS_LABELS;
}

export function ViolationRow({
  v,
  communityId,
  linkable,
}: {
  v: ViolationRowFields;
  communityId: number;
  /** False renders the title as plain text: a neighbour's case is not the reporter's to open. */
  linkable: boolean;
}) {
  const word = isStatus(v.status) ? VIOLATION_STATUS_LABELS[v.status] : capitalise(v.status);
  const kind = isStatus(v.status) ? violationGlyph(v.status) : 'not-started';
  const text = `${categoryLabel(v.category)} · ${v.unitLabel ?? `Unit #${v.unitId}`}`;
  const meta = [capitalise(v.severity), `Reported ${formatShortDate(v.createdAt)}`];
  if (v.reportedByRole === 'staff') meta.push('Filed by staff');

  return (
    <RecordRow
      lead={<StatusGlyph kind={kind} label={word} hideLabel />}
      title={
        linkable ? (
          <Link
            href={`/violations/${v.id}?communityId=${communityId}`}
            className="inline-flex min-h-11 max-w-full items-center text-content-link hover:underline md:min-h-0"
          >
            <span className="truncate">{text}</span>
          </Link>
        ) : (
          text
        )
      }
      statusWord={word}
      meta={meta}
      preview={v.description.split('\n')[0]}
    />
  );
}
