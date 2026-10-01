'use client';

import { useCallback, useState } from 'react';
import type { DocumentMutationWarning } from '@/lib/documents/types';

export interface UploadRequest {
  communityId: number;
  title: string;
  categoryId: number;
  description?: string | null;
  file: File;
  /**
   * Uploader's confirmation that protected personal information is redacted
   * (§718.111(12)(c)). The server requires it for categories that commonly
   * contain such information and 400s without it — see F-02.
   */
  redactionAttested?: boolean;
}

export interface ReplaceFileRequest {
  communityId: number;
  documentId: number;
  file: File;
  /** Required by the server for sensitive categories and public documents. */
  redactionAttested?: boolean;
}

export interface ReplaceFileResult {
  id: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface DocumentUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

interface PresignResponse {
  data: {
    path: string;
    uploadUrl: string;
    token: string;
    documentId: string;
  };
}

interface DocumentCreateResponse {
  data: Record<string, unknown>;
  warnings?: DocumentMutationWarning[];
}

export interface UploadDocumentResult {
  document: Record<string, unknown>;
  warnings: DocumentMutationWarning[];
}

function uploadWithProgress(uploadUrl: string, file: File, onProgress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      onProgress(progress);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error('Upload failed. Please try again.'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed. Please try again.'));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Presign a storage path and PUT the file there. Both a new upload and a file
 * replacement start here; they differ only in which API records the result.
 */
async function presignAndPut(
  communityId: number,
  file: File,
  onProgress: (value: number) => void,
): Promise<string> {
  const presignRes = await fetch('/api/v1/upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      communityId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }),
  });

  if (!presignRes.ok) {
    throw new Error('Unable to prepare upload');
  }

  const presignBody = (await presignRes.json()) as PresignResponse;
  await uploadWithProgress(presignBody.data.uploadUrl, file, onProgress);
  return presignBody.data.path;
}

/**
 * Surface what the server actually said. A fixed string here once discarded
 * the one message the user could act on — e.g. the redaction attestation
 * prompt the documents API returns as a 400.
 */
async function serverErrorMessage(res: Response): Promise<string> {
  let message = 'We could not save this document. Please try again.';
  try {
    const body = (await res.json()) as {
      error?: { message?: string };
    };
    if (typeof body?.error?.message === 'string' && body.error.message.trim() !== '') {
      message = body.error.message;
    }
  } catch {
    // Non-JSON error body — keep the generic message.
  }
  return message;
}

export function useDocumentUpload() {
  const [state, setState] = useState<DocumentUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });

  const uploadDocument = useCallback(async (request: UploadRequest) => {
    setState({ isUploading: true, progress: 0, error: null });

    try {
      const path = await presignAndPut(request.communityId, request.file, (progress) => {
        setState((prev) => ({ ...prev, progress }));
      });

      const createRes = await fetch('/api/v1/documents', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId: request.communityId,
          title: request.title,
          description: request.description ?? null,
          categoryId: request.categoryId,
          filePath: path,
          fileName: request.file.name,
          fileSize: request.file.size,
          mimeType: request.file.type,
          redactionAttested: request.redactionAttested ?? false,
        }),
      });

      if (!createRes.ok) {
        throw new Error(await serverErrorMessage(createRes));
      }

      const createBody = (await createRes.json()) as DocumentCreateResponse;

      setState({ isUploading: false, progress: 100, error: null });
      return {
        document: createBody.data,
        warnings: createBody.warnings ?? [],
      } satisfies UploadDocumentResult;
    } catch (error) {
      setState({
        isUploading: false,
        progress: 0,
        error: error instanceof Error ? error.message : 'Upload failed',
      });
      throw error;
    }
  }, []);

  /**
   * Swap the file behind an existing document. The document keeps its id, so
   * its links, and the compliance item it satisfies, keep working.
   */
  const replaceFile = useCallback(async (request: ReplaceFileRequest) => {
    setState({ isUploading: true, progress: 0, error: null });

    try {
      const path = await presignAndPut(request.communityId, request.file, (progress) => {
        setState((prev) => ({ ...prev, progress }));
      });

      const res = await fetch(`/api/v1/documents/${request.documentId}/file`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId: request.communityId,
          filePath: path,
          fileName: request.file.name,
          fileSize: request.file.size,
          redactionAttested: request.redactionAttested ?? false,
        }),
      });

      if (!res.ok) {
        throw new Error(await serverErrorMessage(res));
      }

      const body = (await res.json()) as { data: ReplaceFileResult };
      setState({ isUploading: false, progress: 100, error: null });
      return body.data;
    } catch (error) {
      setState({
        isUploading: false,
        progress: 0,
        error: error instanceof Error ? error.message : 'Upload failed',
      });
      throw error;
    }
  }, []);

  return {
    ...state,
    uploadDocument,
    replaceFile,
  };
}
