export interface CapturedStorageOp {
  operation: 'upload' | 'download' | 'delete';
  bucket: string;
  path: string;
  options?: Record<string, unknown>;
}

const storageSink: CapturedStorageOp[] = [];

export function getCapturedStorageOps(): readonly CapturedStorageOp[] {
  return storageSink;
}

export function clearCapturedStorageOps(): void {
  storageSink.length = 0;
}

export async function createPresignedUploadUrlDouble(
  bucket: string,
  path: string,
  options?: { upsert?: boolean },
): Promise<{ signedUrl: string; token: string; path: string }> {
  storageSink.push({
    operation: 'upload',
    bucket,
    path,
    options: options ? { upsert: options.upsert ?? false } : undefined,
  });

  const encodedPath = encodeURIComponent(path);
  return {
    signedUrl: `https://storage.test/upload/${bucket}/${encodedPath}`,
    token: `test-upload-token-${storageSink.length}`,
    path,
  };
}

export async function createPresignedDownloadUrlDouble(
  bucket: string,
  path: string,
  expiresIn: number = 3600,
): Promise<string> {
  storageSink.push({
    operation: 'download',
    bucket,
    path,
    options: { expiresIn },
  });
  const encodedPath = encodeURIComponent(path);
  return `https://storage.test/download/${bucket}/${encodedPath}?expiresIn=${expiresIn}`;
}

export async function deleteStorageObjectDouble(
  bucket: string,
  path: string,
): Promise<void> {
  storageSink.push({
    operation: 'delete',
    bucket,
    path,
  });
}
