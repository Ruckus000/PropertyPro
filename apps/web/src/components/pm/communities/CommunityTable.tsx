'use client';

/**
 * The Communities page in list view.
 *
 * - `grouped` (up to 24 communities): rows grouped Needs attention / On track /
 *   Not tracked, each group foldable, with a site thumbnail per row.
 * - `dense` (25 or more): one sortable table with a totals row and the
 *   measured numbers in their own columns.
 *
 * Both carry a checkbox per row for bulk send. On a phone the checkboxes appear
 * only in select mode (started from the toolbar's More menu), the number
 * columns fold away and the status moves under the name.
 *
 * Plain markup rather than a table library: selection is a set of ids and
 * sorting happens on the server, so a library would only add weight to a route
 * that is close to its JavaScript budget.
 */
import { Fragment, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';
import type { PortfolioSortKey } from '@/lib/pm/portfolio-summary-keys';
import {
  STATUS_LABELS,
  communityMeta,
  dashboardHref,
  formatDollars,
  groupByStatus,
  totalsOf,
  visibleInGroup,
  type CommunityStatus,
} from '@/lib/pm/communities-page';
import { SiteThumbnail } from './SiteThumbnail';
import { StatusLabel, StatusLine, UnpublishedEditsTag, statusCountClass } from './CommunityStatus';

export interface CommunitySort {
  key: PortfolioSortKey;
  dir: 'asc' | 'desc';
}

interface CommunityTableProps {
  variant: 'grouped' | 'dense';
  rows: PortfolioCommunity[];
  selected: ReadonlySet<number>;
  onToggle: (community: PortfolioCommunity, checked: boolean) => void;
  onToggleAll: (rows: PortfolioCommunity[], checked: boolean) => void;
  /** Phone select mode: show the checkboxes below `md` too. */
  selecting: boolean;
  sort: CommunitySort;
  onSortChange: (sort: CommunitySort) => void;
  /** Every filtered row is on this page, so the totals row adds up. */
  showTotals: boolean;
}

const NUM = 'hidden px-3 text-right tabular-nums md:table-cell';
const HEAD = 'h-10 font-mono text-xs font-medium uppercase tracking-wide text-content-tertiary';

/** Columns sortable from the dense table's header, and their first direction. */
const DENSE_COLUMNS: { key: PortfolioSortKey; label: string; firstDir: 'asc' | 'desc'; numeric: boolean }[] = [
  { key: 'complianceScore', label: 'Compliance', firstDir: 'asc', numeric: true },
  { key: 'pastDeadlineCount', label: 'Past deadline', firstDir: 'desc', numeric: true },
  { key: 'occupancyRate', label: 'Occupancy', firstDir: 'asc', numeric: true },
];

function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-content-tertiary">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function OverdueCell({ cents }: { cents: number | null }) {
  if (cents === null) return <Dash label="Dues not on plan" />;
  return <span className={cn(cents > 0 && 'font-medium text-status-danger')}>{formatDollars(cents)}</span>;
}

function SortHeader({
  label,
  column,
  firstDir,
  sort,
  onSortChange,
  className,
}: {
  label: string;
  column: PortfolioSortKey;
  firstDir: 'asc' | 'desc';
  sort: CommunitySort;
  onSortChange: (sort: CommunitySort) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(HEAD, className)}
    >
      <button
        type="button"
        onClick={() =>
          onSortChange({ key: column, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : firstDir })
        }
        className={cn(
          'inline-flex items-center gap-1 rounded-sm uppercase hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          active && 'text-content',
        )}
      >
        {label}
        {active && <Arrow aria-hidden="true" className="size-3" />}
      </button>
    </th>
  );
}

export function CommunityTable({
  variant,
  rows,
  selected,
  onToggle,
  onToggleAll,
  selecting,
  sort,
  onSortChange,
  showTotals,
}: CommunityTableProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<ReadonlySet<CommunityStatus>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<CommunityStatus>>(new Set());
  const dense = variant === 'dense';
  const selectCell = selecting ? 'table-cell' : 'hidden md:table-cell';
  // The grouped list's column count (group rows span it); dense has no groups.
  const colSpan = 7;

  const selectedOnPage = rows.filter((r) => selected.has(r.communityId)).length;
  const allChecked = rows.length > 0 && selectedOnPage === rows.length;

  function openRow(event: MouseEvent<HTMLTableRowElement>, id: number) {
    // The checkbox and the name link do their own thing.
    if ((event.target as HTMLElement).closest('a, button, label, input')) return;
    router.push(dashboardHref(id));
  }

  function toggleIn(set: ReadonlySet<CommunityStatus>, status: CommunityStatus) {
    const next = new Set(set);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    return next;
  }

  function renderRow(c: PortfolioCommunity) {
    const isSelected = selected.has(c.communityId);
    return (
      <tr
        key={c.communityId}
        data-state={isSelected ? 'selected' : undefined}
        onClick={(e) => openRow(e, c.communityId)}
        className={cn(
          'cursor-pointer border-t border-edge transition-colors duration-quick',
          isSelected ? 'bg-interactive-subtle' : 'hover:bg-surface-hover',
        )}
      >
        <td className={cn(selectCell, 'w-12 pl-4 align-middle')}>
          <label className="flex min-h-11 items-center md:min-h-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(v) => onToggle(c, v === true)}
              aria-label={`Select ${c.communityName}`}
            />
          </label>
        </td>
        {!dense && (
          <td className="w-24 py-3 pl-4 md:pl-0">
            <SiteThumbnail color={c.brandColor} size="sm" className="h-12 w-20 rounded-sm border border-edge" />
          </td>
        )}
        <td className={cn('min-w-0 py-3 pr-3', dense ? 'pl-4 md:pl-3' : 'pl-3')}>
          <Link
            href={dashboardHref(c.communityId)}
            className="rounded-sm font-semibold text-content hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {c.communityName}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-content-secondary">
            <span>{communityMeta(c)}</span>
            {c.hasUnpublishedSiteDrafts && <UnpublishedEditsTag />}
          </div>
          <StatusLine community={c} duesAmount className="mt-1 md:hidden" />
        </td>
        <td className="hidden px-3 md:table-cell">
          {dense ? <StatusLabel status={c.status} /> : <StatusLine community={c} />}
        </td>
        {dense && (
          <>
            <td className={NUM}>
              {c.complianceScore === null ? <Dash label="No posting rules" /> : `${c.complianceScore}%`}
            </td>
            <td className={NUM}>
              {c.pastDeadlineCount === null ? (
                <Dash label="No posting rules" />
              ) : (
                <span className={cn(c.pastDeadlineCount > 0 && 'font-medium text-status-danger')}>
                  {c.pastDeadlineCount}
                </span>
              )}
            </td>
            <td className={NUM}>
              {c.occupancyRate === null ? <Dash label="Not measured" /> : `${c.occupancyRate}%`}
            </td>
          </>
        )}
        <td className={NUM}>{c.openMaintenanceRequests}</td>
        <td className={NUM}>
          <OverdueCell cents={c.overdueDuesCents} />
        </td>
        <td className="w-10 pr-4 text-right">
          <ChevronRight aria-hidden="true" className="ml-auto size-4 text-content-tertiary" />
        </td>
      </tr>
    );
  }

  const totals = dense && showTotals ? totalsOf(rows) : null;

  return (
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <Table className="border-collapse text-left">
        <thead>
          <tr>
            <th scope="col" className={cn(selectCell, HEAD, 'w-12 pl-4')}>
              <label className="flex min-h-11 items-center md:min-h-0">
                <Checkbox
                  checked={allChecked ? true : selectedOnPage > 0 ? 'indeterminate' : false}
                  onCheckedChange={(v) => onToggleAll(rows, v === true)}
                  aria-label="Select all communities shown"
                />
              </label>
            </th>
            {!dense && (
              <th scope="col" className="w-24 pl-4 md:pl-0">
                <span className="sr-only">Website</span>
              </th>
            )}
            {dense ? (
              <SortHeader
                label="Community"
                column="communityName"
                firstDir="asc"
                sort={sort}
                onSortChange={onSortChange}
                className="pl-4 pr-3 md:pl-3"
              />
            ) : (
              <th scope="col" className={cn(HEAD, 'pl-3 pr-3')}>
                Community
              </th>
            )}
            {dense ? (
              <SortHeader
                label="Status"
                column="status"
                firstDir="asc"
                sort={sort}
                onSortChange={onSortChange}
                className="hidden px-3 md:table-cell"
              />
            ) : (
              <th scope="col" className={cn(HEAD, 'hidden px-3 md:table-cell')}>
                Status
              </th>
            )}
            {dense &&
              DENSE_COLUMNS.map((col) => (
                <SortHeader
                  key={col.key}
                  label={col.label}
                  column={col.key}
                  firstDir={col.firstDir}
                  sort={sort}
                  onSortChange={onSortChange}
                  className={NUM}
                />
              ))}
            {dense ? (
              <>
                <SortHeader
                  label="Requests"
                  column="openMaintenanceRequests"
                  firstDir="desc"
                  sort={sort}
                  onSortChange={onSortChange}
                  className={NUM}
                />
                <SortHeader
                  label="Overdue dues"
                  column="overdueDuesCents"
                  firstDir="desc"
                  sort={sort}
                  onSortChange={onSortChange}
                  className={NUM}
                />
              </>
            ) : (
              <>
                <th scope="col" className={cn(HEAD, NUM)}>
                  Requests
                </th>
                <th scope="col" className={cn(HEAD, NUM)}>
                  Overdue dues
                </th>
              </>
            )}
            <th scope="col" className="w-10 pr-4">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>

        {totals && (
          <tbody className="hidden bg-surface-muted font-mono text-sm font-semibold text-content md:table-row-group">
            <tr className="border-t border-edge">
              <td className={cn(selectCell, 'pl-4')} />
              <th scope="row" className="py-3 pl-3 pr-3 text-left text-xs uppercase tracking-wide">
                Total {totals.count} · {totals.units.toLocaleString('en-US')} units
              </th>
              <td className="hidden md:table-cell" />
              <td className={NUM}>{totals.complianceScore === null ? '—' : `${totals.complianceScore}%`}</td>
              <td className={NUM}>{totals.pastDeadline ?? '—'}</td>
              <td className={NUM}>{totals.occupancyRate === null ? '—' : `${totals.occupancyRate}%`}</td>
              <td className={NUM}>{totals.openRequests}</td>
              <td className={NUM}>{totals.overdueDuesCents === null ? '—' : formatDollars(totals.overdueDuesCents)}</td>
              <td />
            </tr>
          </tbody>
        )}

        {dense ? (
          <tbody>{rows.map(renderRow)}</tbody>
        ) : (
          groupByStatus(rows).map((group) => {
            const isCollapsed = collapsed.has(group.status);
            const shown = visibleInGroup(group.status, group.rows.length, expanded.has(group.status));
            const hidden = group.rows.length - shown;
            return (
              <tbody key={group.status}>
                <tr className="border-t border-edge bg-surface-muted">
                  <th scope="rowgroup" colSpan={colSpan} className="p-0 text-left">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((s) => toggleIn(s, group.status))}
                      className="flex min-h-11 w-full items-center gap-2 px-4 text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus md:min-h-10"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={cn('size-4 text-content-tertiary transition-transform', isCollapsed && '-rotate-90')}
                      />
                      {STATUS_LABELS[group.status]}
                      <span
                        className={cn(
                          'rounded-full px-2 text-xs font-semibold tabular-nums',
                          statusCountClass(group.status),
                        )}
                      >
                        {group.rows.length}
                      </span>
                    </button>
                  </th>
                </tr>
                {!isCollapsed && (
                  <Fragment>
                    {group.rows.slice(0, shown).map(renderRow)}
                    {hidden > 0 && (
                      <tr className="border-t border-edge">
                        <td colSpan={colSpan} className="p-0">
                          <button
                            type="button"
                            onClick={() => setExpanded((s) => toggleIn(s, group.status))}
                            className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus md:min-h-10"
                          >
                            Show {hidden} more {STATUS_LABELS[group.status].toLowerCase()}
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )}
              </tbody>
            );
          })
        )}
      </Table>
    </div>
  );
}
