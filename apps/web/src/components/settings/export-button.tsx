'use client';

import { useEffect, useRef, useState } from 'react';
import { useReauth } from '@/hooks/use-reauth';
import { useExportData } from '@/hooks/use-export-data';
import { ReauthModal } from '@/components/auth/reauth-modal';

interface ExportButtonProps {
  communityId: number;
}

export function ExportButton({ communityId }: ExportButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const { triggerReauth, isOpen, onCancel, verify } = useReauth();
  const exportMutation = useExportData();
  const loading = exportMutation.isPending;

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  async function handleExport() {
    const confirmed = await triggerReauth();
    if (!confirmed) return;

    setError(null);
    try {
      const { blob, filename } = await exportMutation.mutateAsync({ communityId });

      // Revoke any previous blob URL before creating a new one
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <>
      <ReauthModal isOpen={isOpen} onCancel={onCancel} verify={verify} />
      <div>
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        aria-busy={loading}
        className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50"
      >
        {loading ? 'Exporting…' : 'Download Community Data'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {error}
        </p>
      )}
      </div>
    </>
  );
}
