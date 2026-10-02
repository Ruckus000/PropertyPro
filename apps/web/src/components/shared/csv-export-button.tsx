'use client';

import { useCallback } from 'react';
import { Download } from 'lucide-react';
import { escapeCSVField } from '@/lib/utils/csv-cell';
import { saveCsvFile } from '@/lib/utils/save-csv-file';

interface CsvExportButtonProps {
  headers: string[];
  rows: Record<string, unknown>[];
  filename: string;
  className?: string;
}

export function CsvExportButton({
  headers,
  rows,
  filename,
  className,
}: CsvExportButtonProps) {
  const handleExport = useCallback(() => {
    const headerLine = headers.map(escapeCSVField).join(',');
    const dataLines = rows.map((row) =>
      headers.map((header) => escapeCSVField(row[header])).join(',')
    );
    saveCsvFile([headerLine, ...dataLines].join('\r\n'), filename);
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
