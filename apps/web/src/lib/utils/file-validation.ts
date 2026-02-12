import { fileTypeFromBuffer } from 'file-type';

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

export type AllowedExt = 'pdf' | 'docx' | 'png' | 'jpg';

export interface DetectedFileType {
  ext: AllowedExt;
  mime: string;
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function maybeDocxFromZip(bytes: Uint8Array): boolean {
  // DOCX is a ZIP container; use container hints when file-type detects zip.
  const sample = bytes.slice(0, Math.min(bytes.length, 64 * 1024));
  const text = new TextDecoder('latin1', { fatal: false }).decode(sample);
  return text.includes('[Content_Types].xml') && text.includes('word/');
}

export async function detectFileTypeFromBytes(
  bytes: Uint8Array,
): Promise<DetectedFileType | null> {
  if (bytes.length === 0) return null;

  let detected:
    | {
        ext: string;
        mime: string;
      }
    | undefined;

  try {
    detected = await fileTypeFromBuffer(Uint8Array.from(bytes));
  } catch {
    return null;
  }

  if (!detected) return null;

  if (detected.mime === 'application/pdf') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  if (detected.mime === 'image/png') {
    return { ext: 'png', mime: 'image/png' };
  }
  if (detected.mime === 'image/jpeg') {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (detected.mime === DOCX_MIME || detected.ext === 'docx') {
    return { ext: 'docx', mime: DOCX_MIME };
  }
  if (detected.mime === 'application/zip' && maybeDocxFromZip(bytes)) {
    return { ext: 'docx', mime: DOCX_MIME };
  }

  return null;
}

export function isImageType(type: DetectedFileType): boolean {
  return type.ext === 'png' || type.ext === 'jpg';
}

export function isAllowedType(
  type: DetectedFileType | null,
): type is DetectedFileType {
  if (!type) return false;
  return type.ext === 'pdf' || type.ext === 'docx' || type.ext === 'png' || type.ext === 'jpg';
}

export interface ValidationResult {
  ok: boolean;
  type?: DetectedFileType;
  error?: string;
  limit?: number;
}

export async function validateFile(
  bytes: Uint8Array,
  fileSize: number,
): Promise<ValidationResult> {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, error: 'File must be greater than zero bytes' };
  }

  const detected = await detectFileTypeFromBytes(bytes);
  if (!detected || !isAllowedType(detected)) {
    return { ok: false, error: 'Unrecognized or unsupported file type' };
  }

  const limit = isImageType(detected) ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (fileSize > limit) {
    return {
      ok: false,
      type: detected,
      error: `File exceeds maximum allowed size (${limit} bytes)`,
      limit,
    };
  }

  return { ok: true, type: detected, limit };
}

export function decodeBase64Header(base64: string): Uint8Array {
  if (!base64 || typeof base64 !== 'string') return new Uint8Array();

  const atobFn = (globalThis as unknown as { atob?: (s: string) => string }).atob;
  if (typeof atobFn === 'function') {
    try {
      const binary = atobFn(base64);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i) & 0xff;
      }
      return out;
    } catch {
      return new Uint8Array();
    }
  }

  const maybeBufferFrom = (globalThis as unknown as {
    Buffer?: {
      from: (
        s: string,
        enc: string,
      ) => { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    };
  }).Buffer?.from;

  if (typeof maybeBufferFrom === 'function') {
    try {
      const buf = maybeBufferFrom(base64, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return new Uint8Array();
    }
  }

  return new Uint8Array();
}
