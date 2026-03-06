'use client';

/**
 * PreviewPanel — shows an iframe preview of the community's public site.
 *
 * Scaled to 70% with a refresh button and postMessage reload mechanism.
 * Checks server availability before rendering the iframe.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Loader2 } from 'lucide-react';

interface PreviewPanelProps {
  communitySlug: string;
}

type ConnectionStatus = 'checking' | 'available' | 'unavailable';

export function PreviewPanel({ communitySlug }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('checking');

  // Build the preview URL — in dev, use localhost with tenant query param
  // In production, use the subdomain
  const isDev = process.env.NODE_ENV === 'development';
  const previewUrl = isDev
    ? `http://localhost:3000?tenant=${communitySlug}`
    : `https://${communitySlug}.propertyprofl.com`;

  const checkConnection = useCallback(async () => {
    setStatus('checking');
    try {
      await fetch(previewUrl, { mode: 'no-cors', cache: 'no-store' });
      setStatus('available');
    } catch {
      setStatus('unavailable');
    }
  }, [previewUrl]);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

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

      {/* Content area */}
      <div className="flex-1 overflow-hidden bg-gray-100 p-3">
        {status === 'checking' && (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}

        {status === 'unavailable' && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Preview unavailable</p>
              <p className="mt-1 text-xs text-gray-500">
                {isDev
                  ? 'Make sure the web app is running on port 3000.'
                  : 'The preview server is not reachable.'}
              </p>
              <button
                type="button"
                onClick={checkConnection}
                className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {status === 'available' && (
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
        )}
      </div>
    </div>
  );
}
