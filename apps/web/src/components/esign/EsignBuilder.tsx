'use client';

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

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <iframe
        src={src}
        className="h-[80vh] w-full border-0"
        title="Template Builder"
        allow="camera"
      />
    </div>
  );
}
