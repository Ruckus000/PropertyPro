import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/lib/api/errors';
import {
  decodeBase64Header,
  validateFile,
  type DetectedFileType,
} from '../utils/file-validation';

type RouteHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

type UploadValidatedHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> } | undefined,
  detected: DetectedFileType,
) => Promise<NextResponse>;

/**
 * Wrap a Route Handler to enforce magic-bytes validation for uploads.
 *
 * Expects the request body (JSON) to include:
 * - headerBase64: base64-encoded leading bytes (e.g., first 512 bytes)
 * - fileSize: file size in bytes
 *
 * If validation passes, invokes the handler with the detected file type.
 * If validation fails, throws a ValidationError (handled by withErrorHandler).
 *
 * Note: This wrapper does not stream file bytes through Next.js — the client
 * should send a small header sample only. Full file bytes must be uploaded
 * directly to storage per AGENTS #9.
 */
export function withUploadValidation(handler: UploadValidatedHandler): RouteHandler {
  return async (req, context) => {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid upload payload');
    }

    const { headerBase64, fileSize } = body as { headerBase64?: string; fileSize?: number };
    if (!headerBase64 || typeof headerBase64 !== 'string') {
      throw new ValidationError('Missing or invalid headerBase64');
    }
    if (!Number.isInteger(fileSize) || (fileSize as number) <= 0) {
      throw new ValidationError('Missing or invalid fileSize');
    }

    const bytes = decodeBase64Header(headerBase64);
    const result = await validateFile(bytes, fileSize as number);
    if (!result.ok || !result.type) {
      throw new ValidationError(result.error ?? 'Unsupported file');
    }

    return handler(req, context, result.type);
  };
}
