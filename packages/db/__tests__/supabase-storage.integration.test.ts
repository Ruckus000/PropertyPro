/**
 * P0-04 storage integration test.
 *
 * Validates presigned upload/download/delete against the required `documents` bucket.
 */

import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteStorageObject,
} from '../src';

const hasStorageEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeStorage = hasStorageEnv ? describe : describe.skip;

const BUCKET_NAME = 'documents';

describeStorage('supabase storage (integration)', () => {
  let admin: ReturnType<typeof createAdminClient> | undefined;
  const payload = `PropertyPro storage test ${Date.now()}`;
  const objectPath = `gate0/storage-e2e/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;

  beforeAll(async () => {
    admin = createAdminClient();

    const { data, error } = await admin.storage.listBuckets();
    if (error) {
      throw new Error(`Storage blocker: unable to list buckets: ${error.message}`);
    }

    const hasDocumentsBucket = data.some((bucket) => bucket.name === BUCKET_NAME);

    if (!hasDocumentsBucket) {
      throw new Error(
        "Storage blocker: required bucket 'documents' does not exist. Create the documents bucket in Supabase, then rerun integration tests.",
      );
    }
  });

  afterAll(async () => {
    if (!admin) {
      return;
    }

    try {
      await deleteStorageObject(BUCKET_NAME, objectPath);
    } catch {
      // no-op cleanup best effort
    }
  });

  it('uploads, downloads, and deletes via presigned URLs', async () => {
    if (!admin) {
      throw new Error('Storage integration setup did not initialize admin client');
    }

    const uploadData = await createPresignedUploadUrl(BUCKET_NAME, objectPath, {
      upsert: false,
    });

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const signedUploadUrl = uploadData.signedUrl.startsWith('http')
      ? uploadData.signedUrl
      : `${baseUrl}/storage/v1${uploadData.signedUrl}`;

    const uploadUrlWithToken =
      uploadData.token && !signedUploadUrl.includes('token=')
        ? `${signedUploadUrl}${signedUploadUrl.includes('?') ? '&' : '?'}token=${uploadData.token}`
        : signedUploadUrl;

    const uploadResponse = await fetch(uploadUrlWithToken, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
      },
      body: payload,
    });

    if (!uploadResponse.ok) {
      const uploadBody = await uploadResponse.text();
      throw new Error(
        `Upload via presigned URL failed (${uploadResponse.status}): ${uploadBody}`,
      );
    }

    const signedDownloadUrl = await createPresignedDownloadUrl(BUCKET_NAME, objectPath, 60);
    const fullDownloadUrl = signedDownloadUrl.startsWith('http')
      ? signedDownloadUrl
      : `${baseUrl}/storage/v1${signedDownloadUrl}`;

    const downloadResponse = await fetch(fullDownloadUrl);
    if (!downloadResponse.ok) {
      const downloadBody = await downloadResponse.text();
      throw new Error(
        `Download via presigned URL failed (${downloadResponse.status}): ${downloadBody}`,
      );
    }

    const downloadedPayload = await downloadResponse.text();
    expect(downloadedPayload).toBe(payload);

    await deleteStorageObject(BUCKET_NAME, objectPath);

    const folder = path.posix.dirname(objectPath);
    const filename = path.posix.basename(objectPath);

    const { data: listing, error: listError } = await admin.storage
      .from(BUCKET_NAME)
      .list(folder, { limit: 100, search: filename });

    if (listError) {
      throw new Error(`Delete verification failed while listing objects: ${listError.message}`);
    }

    const stillExists = (listing ?? []).some((item) => item.name === filename);
    expect(stillExists).toBe(false);

    await expect(
      createPresignedDownloadUrl(BUCKET_NAME, objectPath, 60),
    ).rejects.toThrow(/Object not found/i);
  });
});
