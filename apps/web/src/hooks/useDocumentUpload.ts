'use client';

import { useCallback, useState } from 'react';
import type { DocumentMutationWarning } from '@/lib/documents/types';

export interface UploadRequest {
  communityId: number;
  title: string;
  categoryId: number;
  description?: string | null;
  file: File;
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

export function useDocumentUpload() {
  const [state, setState] = useState<DocumentUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });

  const uploadDocument = useCallback(async (request: UploadRequest) => {
    setState({ isUploading: true, progress: 0, error: null });

    try {
      const presignRes = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId: request.communityId,
          fileName: request.file.name,
          fileSize: request.file.size,
          mimeType: request.file.type,
        }),
      });

      if (!presignRes.ok) {
        throw new Error('Unable to prepare upload');
      }

      const presignBody = (await presignRes.json()) as PresignResponse;
      await uploadWithProgress(presignBody.data.uploadUrl, request.file, (progress) => {
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
          filePath: presignBody.data.path,
          fileName: request.file.name,
          fileSize: request.file.size,
          mimeType: request.file.type,
        }),
      });

      if (!createRes.ok) {
        throw new Error('Upload completed, but saving document metadata failed');
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

  return {
    ...state,
    uploadDocument,
  };
}
