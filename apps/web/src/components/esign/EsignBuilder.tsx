'use client';

import { useState } from 'react';

interface EsignBuilderProps {
  token: string;
  onSave?: (templateId: number) => void;
}

/**
 * Wrapper for DocuSeal embedded template builder.
 *
 * Uses an iframe with JWT authentication to embed the
 * DocuSeal template builder for creating signing templates.
 */
export function EsignBuilder({ token, onSave }: EsignBuilderProps) {
  const docusealUrl = process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'https://docuseal.com';
  const src = `${docusealUrl}/builder?token=${token}`;
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      {!iframeLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="text-sm text-gray-500">Loading template builder…</p>
          </div>
        </div>
      )}
      <iframe
        src={src}
        className="h-[80vh] w-full border-0"
        title="Template Builder"
        allow="camera"
        onLoad={() => setIframeLoaded(true)}
      />
    </div>
  );
}
