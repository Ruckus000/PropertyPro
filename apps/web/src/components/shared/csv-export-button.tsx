'use client';

import { useCallback } from 'react';
import { Download } from 'lucide-react';

interface CsvExportButtonProps {
  headers: string[];
  rows: Record<string, unknown>[];
  filename: string;
  className?: string;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function CsvExportButton({
  headers,
  rows,
  filename,
  className,
}: CsvExportButtonProps) {
  const handleExport = useCallback(() => {
    const headerLine = headers.map(escapeCell).join(',');
    const dataLines = rows.map((row) =>
      headers.map((header) => escapeCell(row[header])).join(',')
    );
    const csv = [headerLine, ...dataLines].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [headers, rows, filename]);

  return (
    <button
      type="button"
      className={
        className ??
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground'
      }
      onClick={handleExport}
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
}
