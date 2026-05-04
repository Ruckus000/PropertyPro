'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@propertypro/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DownloadResponse {
  data?: {
    url?: string;
    fileName?: string;
  };
  error?: {
    message?: string;
  };
}

interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  documentId: number | null;
  fileName?: string;
  /** Optional test id on dialog content for unit tests / e2e. */
  contentTestId?: string;
}

const FALLBACK_ERROR_MESSAGE = 'Unable to load document preview';
const MAX_SURFACED_ERROR_LENGTH = 200;

async function fetchSignedUrl(communityId: number, documentId: number): Promise<{ url: string; fileName?: string }> {
  const response = await fetch(`/api/v1/documents/${documentId}/download?communityId=${communityId}`);

  let body: DownloadResponse | null = null;
  try {
    body = (await response.json()) as DownloadResponse;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const msg = body?.error?.message?.trim();
    throw new Error(
      msg && msg.length > 0 && msg.length <= MAX_SURFACED_ERROR_LENGTH ? msg : FALLBACK_ERROR_MESSAGE,
    );
  }

  const url = body?.data?.url;
  if (!url) {
    throw new Error(FALLBACK_ERROR_MESSAGE);
  }

  return {
    url,
    fileName: body?.data?.fileName,
  };
}

export function DocumentViewerModal({
  open,
  onOpenChange,
  communityId,
  documentId,
  fileName,
  contentTestId,
}: DocumentViewerModalProps) {
  const query = useQuery({
    queryKey: ['document-viewer-modal', communityId, documentId],
    queryFn: async () => fetchSignedUrl(communityId, documentId!),
    enabled: open && documentId != null,
    retry: 0,
  });

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return false;
    }

    return (
      (/iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.maxTouchPoints > 0 && /Macintosh/.test(navigator.userAgent)))
      && !(window as { MSStream?: unknown }).MSStream
    );
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px]" data-testid={contentTestId}>
        <DialogHeader>
          <DialogTitle>{fileName ?? 'Document preview'}</DialogTitle>
          <DialogDescription>
            Review the selected document.
          </DialogDescription>
        </DialogHeader>

        <div className="h-[80vh]">
          {query.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
            </div>
          ) : null}

          {query.isError ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-3"
              role="alert"
            >
              <p className="text-sm text-content-secondary">
                {query.error instanceof Error ? query.error.message : 'Unable to load this document preview.'}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  Try again
                </Button>
                <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}

          {query.data ? (
            isIOS ? (
              <div className="flex h-full items-center justify-center p-6">
                <a
                  href={query.data.url}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-medium text-content-link hover:text-interactive-hover"
                >
                  Open document
                </a>
              </div>
            ) : (
              <iframe
                title={query.data.fileName ?? fileName ?? 'Document'}
                src={query.data.url}
                sandbox="allow-same-origin"
                className="h-full w-full border-0"
              />
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
