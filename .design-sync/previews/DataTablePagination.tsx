import { useState } from 'react';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { DataTable, StatusBadge } from '@propertypro/design-system';

interface ResidentRow {
  unit: string;
  name: string;
  role: string;
  moveIn: string;
  status: string;
  statusLabel: string;
}

// 58 residents at 10 per page — five full pages and a short sixth.
const pages: ResidentRow[][] = [
  [
    { unit: '101', name: 'Beatriz Almeida', role: 'Unit owner', moveIn: '14 Feb 2019', status: 'compliant', statusLabel: 'Verified' },
    { unit: '104', name: 'Grant Whitfield', role: 'Tenant', moveIn: '01 Sep 2025', status: 'pending', statusLabel: 'Invite sent' },
    { unit: '110', name: 'Naomi Bergstrom', role: 'Unit owner', moveIn: '22 Jun 2021', status: 'compliant', statusLabel: 'Verified' },
    { unit: '118', name: 'David Okonkwo', role: 'Unit owner', moveIn: '03 Nov 2019', status: 'compliant', statusLabel: 'Verified' },
    { unit: '122', name: 'Sofia Marchetti', role: 'Tenant', moveIn: '15 Jan 2026', status: 'compliant', statusLabel: 'Verified' },
    { unit: '126', name: 'Curtis Delacroix', role: 'Unit owner', moveIn: '09 Aug 2017', status: 'compliant', statusLabel: 'Verified' },
    { unit: '130', name: 'Amara Nwosu', role: 'Unit owner', moveIn: '28 Feb 2024', status: 'compliant', statusLabel: 'Verified' },
    { unit: '134', name: 'Julian Sorensen', role: 'Tenant', moveIn: '12 Jun 2025', status: 'pending', statusLabel: 'Invite sent' },
    { unit: '138', name: 'Rosa Iglesias', role: 'Unit owner', moveIn: '05 Dec 2013', status: 'compliant', statusLabel: 'Verified' },
    { unit: '142', name: 'Wendell Pryor', role: 'Unit owner', moveIn: '17 Apr 2022', status: 'compliant', statusLabel: 'Verified' },
  ],
  [
    { unit: '301', name: 'Hollis Barnett', role: 'Unit owner', moveIn: '08 Apr 2016', status: 'compliant', statusLabel: 'Verified' },
    { unit: '306', name: 'Marisol Vega', role: 'Board president', moveIn: '19 Sep 2012', status: 'compliant', statusLabel: 'Verified' },
    { unit: '312', name: 'Rafael Ortiz', role: 'Unit owner', moveIn: '30 Jul 2022', status: 'pending', statusLabel: 'Invite sent' },
    { unit: '318', name: 'Claudia Nkemelu', role: 'Tenant', moveIn: '12 Mar 2026', status: 'compliant', statusLabel: 'Verified' },
    { unit: '322', name: 'Peter Lindqvist', role: 'Unit owner', moveIn: '05 May 2020', status: 'compliant', statusLabel: 'Verified' },
    { unit: '326', name: 'Ingrid Vasquez', role: 'Tenant', moveIn: '21 Oct 2025', status: 'compliant', statusLabel: 'Verified' },
    { unit: '330', name: 'Malik Thornton', role: 'Unit owner', moveIn: '14 Jan 2015', status: 'compliant', statusLabel: 'Verified' },
    { unit: '334', name: 'Delphine Aubert', role: 'Unit owner', moveIn: '02 Jun 2023', status: 'compliant', statusLabel: 'Verified' },
    { unit: '338', name: 'Samuel Kirwan', role: 'Unit owner', moveIn: '27 Mar 2018', status: 'compliant', statusLabel: 'Verified' },
    { unit: '342', name: 'Renata Oliveira', role: 'Tenant', moveIn: '08 Aug 2026', status: 'pending', statusLabel: 'Invite sent' },
  ],
  [
    { unit: '701', name: 'Yolanda Prieto', role: 'Unit owner', moveIn: '27 Oct 2014', status: 'compliant', statusLabel: 'Verified' },
    { unit: '705', name: 'Andre Fontaine', role: 'Unit owner', moveIn: '02 Feb 2023', status: 'compliant', statusLabel: 'Verified' },
    { unit: '709', name: 'Imani Blackwell', role: 'Board member', moveIn: '16 Dec 2018', status: 'compliant', statusLabel: 'Verified' },
    { unit: '712', name: 'Gustavo Reyes', role: 'Tenant', moveIn: '03 Jul 2025', status: 'compliant', statusLabel: 'Verified' },
    { unit: '716', name: 'Helena Fitzgerald', role: 'Unit owner', moveIn: '11 Nov 2011', status: 'compliant', statusLabel: 'Verified' },
    { unit: '720', name: 'Tobias Nakamura', role: 'Unit owner', moveIn: '25 May 2021', status: 'compliant', statusLabel: 'Verified' },
    { unit: '724', name: 'Camille Beaumont', role: 'Tenant', moveIn: '19 Feb 2026', status: 'pending', statusLabel: 'Invite sent' },
    { unit: '728', name: 'Everett Sandoval', role: 'Unit owner', moveIn: '06 Sep 2016', status: 'compliant', statusLabel: 'Verified' },
  ],
];

const columns: ColumnDef<ResidentRow, unknown>[] = [
  {
    id: 'unit',
    header: 'Unit',
    cell: ({ row }) => <span className="font-medium">{row.original.unit}</span>,
  },
  { id: 'name', header: 'Resident', cell: ({ row }) => row.original.name },
  {
    id: 'role',
    header: 'Role',
    cell: ({ row }) => <span className="text-content-secondary">{row.original.role}</span>,
  },
  {
    id: 'moveIn',
    header: 'Move-in',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-content-secondary">{row.original.moveIn}</span>
    ),
  },
  {
    id: 'status',
    header: 'Portal access',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <StatusBadge status={row.original.status} label={row.original.statusLabel} size="sm" />
      </div>
    ),
  },
];

const Shell = ({ description, pageIndex }: { description: string; pageIndex: number }) => {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex, pageSize: 10 });

  return (
    <div className="w-full space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Resident directory</h3>
        <p className="text-sm text-content-secondary">{description}</p>
      </div>
      <DataTable
        columns={columns}
        data={pages[Math.min(pagination.pageIndex, pages.length - 1)] ?? []}
        pageCount={6}
        pagination={pagination}
        onPaginationChange={setPagination}
      />
    </div>
  );
};

export const FirstPage = () => (
  <Shell
    description="Sunset Condos · 58 residents · the previous-page control is disabled on page one"
    pageIndex={0}
  />
);

export const MiddlePage = () => (
  <Shell
    description="Sunset Condos · 58 residents · both directions are available mid-range"
    pageIndex={1}
  />
);

export const LastPage = () => (
  <Shell
    description="Sunset Condos · 58 residents · the sixth page is short and ends the walk"
    pageIndex={5}
  />
);
