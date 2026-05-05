import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const downloadStorageObject = vi.fn();
const deleteStorageObject = vi.fn();

vi.mock('@propertypro/db', () => ({
  downloadStorageObject: (...args: unknown[]) => downloadStorageObject(...args),
  deleteStorageObject: (...args: unknown[]) => deleteStorageObject(...args),
}));

import { ValidationError } from '@/lib/api/errors';
import {
  assertCommunityOwnedStoragePath,
  assertPdfMagicBytes,
} from '@/lib/services/storage-validators';

describe('assertCommunityOwnedStoragePath', () => {
  it('passes when path lives under the active community prefix', () => {
    expect(() =>
      assertCommunityOwnedStoragePath(
        'communities/42/esign-templates/abc-doc.pdf',
        42,
        'esign-templates',
      ),
    ).not.toThrow();
  });

  it('throws ValidationError when the path points to a different community', () => {
    expect(() =>
      assertCommunityOwnedStoragePath(
        'communities/99/esign-templates/abc-doc.pdf',
        42,
        'esign-templates',
      ),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when the path uses a different subdirectory', () => {
    expect(() =>
      assertCommunityOwnedStoragePath(
        'communities/42/documents/abc-doc.pdf',
        42,
        'esign-templates',
      ),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError for absolute or sibling-prefix tricks', () => {
    expect(() =>
      assertCommunityOwnedStoragePath(
        'communities/42-evil/esign-templates/x.pdf',
        42,
        'esign-templates',
      ),
    ).toThrow(ValidationError);
  });
});

describe('assertPdfMagicBytes', () => {
  beforeEach(() => {
    downloadStorageObject.mockReset();
    deleteStorageObject.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes when the bytes start with %PDF-', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    downloadStorageObject.mockResolvedValue(pdfBytes);

    await expect(
      assertPdfMagicBytes('documents', 'communities/42/esign-templates/x.pdf'),
    ).resolves.toBeUndefined();
    expect(deleteStorageObject).not.toHaveBeenCalled();
  });

  it('rejects and deletes when the bytes are too short', async () => {
    downloadStorageObject.mockResolvedValue(new Uint8Array([0x25, 0x50]));
    deleteStorageObject.mockResolvedValue(undefined);

    await expect(
      assertPdfMagicBytes('documents', 'communities/42/esign-templates/x.pdf'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deleteStorageObject).toHaveBeenCalledWith(
      'documents',
      'communities/42/esign-templates/x.pdf',
    );
  });

  it('rejects and deletes when the bytes are PNG (not PDF)', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    downloadStorageObject.mockResolvedValue(pngBytes);
    deleteStorageObject.mockResolvedValue(undefined);

    await expect(
      assertPdfMagicBytes('documents', 'communities/42/esign-templates/fake.pdf'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deleteStorageObject).toHaveBeenCalledTimes(1);
  });

  it('still throws ValidationError if cleanup delete fails', async () => {
    downloadStorageObject.mockResolvedValue(new Uint8Array([0x00, 0x01]));
    deleteStorageObject.mockRejectedValue(new Error('storage unreachable'));

    await expect(
      assertPdfMagicBytes('documents', 'communities/42/esign-templates/x.pdf'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if download itself fails', async () => {
    downloadStorageObject.mockRejectedValue(new Error('not found'));

    await expect(
      assertPdfMagicBytes('documents', 'communities/42/esign-templates/x.pdf'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deleteStorageObject).not.toHaveBeenCalled();
  });
});
