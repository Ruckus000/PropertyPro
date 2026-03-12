'use client';

import { useState, useCallback } from 'react';
import { DocusealBuilder } from '@docuseal/react';

interface EsignBuilderProps {
  token: string;
  communityId: number;
  onTemplateSaved?: (template: { id: number; name: string }) => void;
}

/**
 * Wrapper for the DocuSeal embedded template builder.
 *
 * Uses the official @docuseal/react component which dispatches
 * custom events (save, load, upload) so we can sync the created
 * template back to our database.
 */
export function EsignBuilder({ token, communityId, onTemplateSaved }: EsignBuilderProps) {
  // @docuseal/react prepends "https://" to the host, so strip any protocol prefix
  const docusealHost = (process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'https://docuseal.com').replace(
    /^https?:\/\//,
    '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (data: { id?: number; name?: string; [key: string]: unknown }) => {
      if (!data.id) return;
      setSaving(true);
      setError(null);

      try {
        const res = await fetch('/api/v1/esign/templates/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            docusealTemplateId: data.id,
            name: data.name,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || 'Failed to register template');
        }

        const result = await res.json();
        onTemplateSaved?.({ id: result.data.id, name: result.data.name });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save template');
      } finally {
        setSaving(false);
      }
    },
    [communityId, onTemplateSaved],
  );

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      {saving && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="text-sm text-gray-500">Saving template...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="mx-4 mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <DocusealBuilder
        token={token}
        host={docusealHost}
        className="h-[80vh] w-full"
        onSave={handleSave}
      />
    </div>
  );
}
