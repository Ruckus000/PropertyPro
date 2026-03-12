'use client';

import { useCallback } from 'react';
import { DocusealForm } from '@docuseal/react';

interface EsignFormProps {
  slug: string;
  onComplete?: () => void;
  logo?: string;
}

/**
 * Wrapper for DocuSeal embedded signing form.
 *
 * Uses the official @docuseal/react component which dispatches
 * custom events (completed, init, load) so we reliably know when
 * the signer finishes signing.
 */
export function EsignForm({ slug, onComplete, logo }: EsignFormProps) {
  // @docuseal/react prepends "https://" to the host, so strip any protocol prefix
  const docusealHost = (process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'https://docuseal.com').replace(
    /^https?:\/\//,
    '',
  );

  const handleComplete = useCallback(
    (data: Record<string, unknown>) => {
      onComplete?.();
    },
    [onComplete],
  );

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <DocusealForm
        src={`${process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'https://docuseal.com'}/s/${slug}`}
        host={docusealHost}
        logo={logo}
        className="h-[80vh] w-full"
        onComplete={handleComplete}
      />
    </div>
  );
}
