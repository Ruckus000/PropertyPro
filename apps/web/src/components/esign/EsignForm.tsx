'use client';

import { useCallback, useEffect, useState } from 'react';

interface EsignFormProps {
  slug: string;
  onComplete?: () => void;
  logo?: string;
}

/**
 * Wrapper for DocuSeal embedded signing form.
 *
 * Uses an iframe to embed the DocuSeal signing experience.
 * The @docuseal/react package would be used here in production,
 * but we use a direct iframe for the initial implementation to
 * avoid requiring the npm dependency during development.
 */
export function EsignForm({ slug, onComplete, logo }: EsignFormProps) {
  const docusealUrl = process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'https://docuseal.com';
  const src = `${docusealUrl}/s/${slug}`;
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'docuseal:completed') {
        onComplete?.();
      }
    },
    [onComplete],
  );

  // Listen for completion messages from the DocuSeal iframe
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      {!iframeLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="text-sm text-gray-500">Loading signing form…</p>
          </div>
        </div>
      )}
      <iframe
        src={src}
        className="h-[80vh] w-full border-0"
        title="Sign Document"
        allow="camera"
        onLoad={() => setIframeLoaded(true)}
      />
    </div>
  );
}
