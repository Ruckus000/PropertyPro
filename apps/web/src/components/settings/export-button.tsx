'use client';

import { useEffect, useRef, useState } from 'react';

interface ExportButtonProps {
  communityId: number;
}

export function ExportButton({ communityId }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/export?communityId=${communityId}`);
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const body = await res.json();
          // API errors have the shape { error: { message: '...' } }
          if (body && body.error && typeof body.error.message === 'string') {
            message = body.error.message;
          }
        } catch (jsonError) {
          // Body is not JSON or doesn't contain a message, use default.
          console.error('Failed to parse error response from export API:', jsonError);
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      // Revoke any previous blob URL before creating a new one
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      let filename = `community-export-${communityId}.zip`;
      if (disposition && disposition.includes('attachment')) {
        const filenameMatch = /filename="([^"]+)"/.exec(disposition);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        aria-busy={loading}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {loading ? 'Exporting…' : 'Download Community Data'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
