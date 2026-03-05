'use client';

/**
 * PreviewPanel — shows an iframe preview of the community's public site.
 *
 * Scaled to 70% with a refresh button and postMessage reload mechanism.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';

interface PreviewPanelProps {
  communitySlug: string;
}

export function PreviewPanel({ communitySlug }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Build the preview URL — in dev, use localhost with tenant query param
  // In production, use the subdomain
  const previewUrl =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3000?tenant=${communitySlug}`
      : `https://${communitySlug}.propertyprofl.com`;

  // Clear spinner reliably when iframe finishes loading
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handleLoad = () => setIsRefreshing(false);
    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);

    // Reload the iframe by cycling the src
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      });
    }
  }, []);

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-e1">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Live Preview
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            title="Refresh preview"
          >
            <RefreshCw
              size={12}
              className={isRefreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Iframe container — scaled to 70% */}
      <div className="flex-1 overflow-hidden bg-gray-100 p-3">
        <div
          className="h-full w-full origin-top-left overflow-hidden rounded-md border border-gray-300 bg-white shadow-e2"
          style={{
            transform: 'scale(0.7)',
            width: 'calc(100% / 0.7)',
            height: 'calc(100% / 0.7)',
          }}
        >
          <iframe
            ref={iframeRef}
            src={previewUrl}
            title="Community site preview"
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
