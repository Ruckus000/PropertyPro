export type DocumentPreviewState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'unsupported_type'
  | 'file_missing'
  | 'storage_unavailable';

export interface DocumentPreviewReadyResult {
  state: 'ready';
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface DocumentPreviewErrorResult {
  state: 'file_missing' | 'storage_unavailable';
  message: string;
}

export interface DocumentPreviewUnsupportedResult {
  state: 'unsupported_type';
}

export interface DocumentPreviewIdleResult {
  state: 'idle';
}

export interface DocumentPreviewLoadingResult {
  state: 'loading';
}

export type DocumentPreviewResult =
  | DocumentPreviewReadyResult
  | DocumentPreviewErrorResult
  | DocumentPreviewUnsupportedResult
  | DocumentPreviewIdleResult
  | DocumentPreviewLoadingResult;

interface DocumentDownloadResponse {
  data?: {
    url?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export function isPdfMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().includes('pdf');
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().includes('image');
}

export function isPreviewableMimeType(mimeType: string): boolean {
  return isPdfMimeType(mimeType) || isImageMimeType(mimeType);
}

export async function loadDocumentPreview(
  documentId: number,
  communityId: number,
  mimeType: string,
): Promise<DocumentPreviewResult> {
  if (!isPreviewableMimeType(mimeType)) {
    return { state: 'unsupported_type' };
  }

  const res = await fetch(`/api/v1/documents/${documentId}/download?communityId=${communityId}`);

  let json: DocumentDownloadResponse | null = null;
  try {
    json = (await res.json()) as DocumentDownloadResponse;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errorCode = json?.error?.code;
    const message = json?.error?.message ?? 'We could not load the document preview.';

    if (errorCode === 'DOCUMENT_FILE_MISSING') {
      return {
        state: 'file_missing',
        message,
      };
    }

    return {
      state: 'storage_unavailable',
      message,
    };
  }

  if (
    !json?.data?.url ||
    !json.data.fileName ||
    !json.data.mimeType ||
    typeof json.data.fileSize !== 'number'
  ) {
    return {
      state: 'storage_unavailable',
      message: 'We could not load the document preview.',
    };
  }

  return {
    state: 'ready',
    url: json.data.url,
    fileName: json.data.fileName,
    mimeType: json.data.mimeType,
    fileSize: json.data.fileSize,
  };
}
