export interface CapturedStorageOp {
  operation: 'upload' | 'download' | 'delete' | 'list';
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
  listHooks.length = 0;
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

// ---------------------------------------------------------------------------
// list: an empty bucket, unless a test hooked a list under a prefix. The
// community purge's sweeps list before they remove, so a hook here runs
// between the purge's claim and its first deletion, or between two sweeps.
// ---------------------------------------------------------------------------

const listHooks: Array<{ bucket: string; prefix: string; run: () => Promise<void> }> = [];

/** Run `run` (once) when a `list` of `bucket` under `prefix` is next called. */
export function beforeNextStorageList(bucket: string, prefix: string, run: () => Promise<void>): void {
  listHooks.push({ bucket, prefix, run });
}

export async function listStorageObjectsDouble(
  bucket: string,
  prefix: string,
): Promise<{ data: { name: string }[]; error: null }> {
  storageSink.push({ operation: 'list', bucket, path: prefix });
  const index = listHooks.findIndex((h) => h.bucket === bucket && prefix.startsWith(h.prefix));
  if (index !== -1) {
    const [hook] = listHooks.splice(index, 1);
    await hook!.run();
  }
  return { data: [], error: null };
}
