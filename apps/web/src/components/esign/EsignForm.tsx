'use client';

import { useCallback } from 'react';

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

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'docuseal:completed') {
        onComplete?.();
      }
    },
    [onComplete],
  );

  // Listen for completion messages from the DocuSeal iframe
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <iframe
        src={src}
        className="h-[80vh] w-full border-0"
        title="Sign Document"
        allow="camera"
      />
    </div>
  );
}
