'use client';

import { useCallback } from 'react';
import { Download } from 'lucide-react';

interface CsvExportButtonProps {
  headers: string[];
  rows: Record<string, unknown>[];
  filename: string;
  className?: string;
}

// Plain numbers and currency amounts ("-12.5", "-$1,250.00", "15%") are data;
// anything else starting with = + - @ TAB or CR is a formula to a spreadsheet.
const NUMERIC_CELL = /^[-+]?\$?\d[\d,]*(\.\d+)?%?$/;
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * CSV formula injection (OWASP): names and other free text reach these exports
 * from public forms, and a cell like `=HYPERLINK(...)` executes when an admin
 * opens the file. Prefixing a quote makes the spreadsheet treat it as text.
 */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (typeof value === 'string' && FORMULA_TRIGGER.test(str) && !NUMERIC_CELL.test(str)) {
    str = `'${str}`;
  }
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
        'inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-sm font-medium transition-colors duration-quick hover:bg-surface-hover hover:text-content'
      }
      onClick={handleExport}
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
}
