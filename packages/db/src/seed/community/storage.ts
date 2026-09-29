/** Seeded document PDFs: placeholder generation and the retried upload/list/download against Supabase storage. */
import { createAdminClient } from '../../supabase/admin';
import { debugSeed } from './context';

const STORAGE_RETRY_DELAYS_MS = [400, 1000, 2000] as const;

function isRetryableStorageSeedError(message: string): boolean {
  return /bad gateway|gateway timeout|fetch failed|timed out|timeout|503|504|not visible in storage listing|no data returned|\{\}/i.test(
    message,
  );
}

async function retryStorageSeedOperation<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < STORAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!isRetryableStorageSeedError(message) || attempt === STORAGE_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }

      debugSeed(
        `${label} retry ${attempt + 1}/${STORAGE_RETRY_DELAYS_MS.length - 1} after transient storage error: ${message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, STORAGE_RETRY_DELAYS_MS[attempt]));
    }
  }

  // Unreachable: the loop's final iteration always returns or throws.
  throw new Error(`retryStorageSeedOperation exited loop without resolving: ${label}`);
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSeedPlaceholderPdf(
  title: string,
  summary: string,
  storagePath: string,
): Uint8Array {
  const safeTitle = sanitizePdfText(title).slice(0, 96);
  const safeSummary = sanitizePdfText(summary).slice(0, 110);
  const safePath = sanitizePdfText(storagePath).slice(0, 110);
  const stream = [
    'BT',
    '/F1 18 Tf',
    '48 736 Td',
    `(${safeTitle || 'Seeded Document'}) Tj`,
    '/F1 11 Tf',
    '0 -28 Td',
    '(Seeded demo document placeholder.) Tj',
    '0 -18 Td',
    `(${safeSummary || 'PropertyPro seeded demo content.'}) Tj`,
    '0 -18 Td',
    `(${safePath}) Tj`,
    'ET',
    '',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

/**
 * The storage bucket every seeded document and e-sign source PDF is written to.
 *
 * The bucket itself is provisioned by migration
 * `0049_documents_storage_bucket.sql`, not by this code. It briefly was created
 * imperatively here (#893), which put a best-effort side effect on the
 * `POST /api/admin/demos` request path and still left the bucket missing for
 * anyone who ran `db:migrate` without seeding. If you hit `Bucket not found`,
 * the fix is to run migrations — do not reintroduce a runtime create.
 */
export const SEED_DOCUMENTS_BUCKET = 'documents';

export async function ensureSeededDocumentStorage(
  storagePath: string,
  title: string,
  summary: string,
): Promise<number> {
  const pdfBytes = buildSeedPlaceholderPdf(title, summary, storagePath);
  const admin = createAdminClient();

  await retryStorageSeedOperation(
    `upload ${storagePath}`,
    async () => {
      const result = await admin.storage.from(SEED_DOCUMENTS_BUCKET).upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (result.error) {
        throw new Error(`Failed to upload seeded document PDF: ${result.error.message}`);
      }
      return result;
    },
  );

  const storageFolder = storagePath.slice(0, Math.max(storagePath.lastIndexOf('/'), 0));
  const storageFileName = storagePath.slice(storagePath.lastIndexOf('/') + 1);
  await retryStorageSeedOperation(
    `list ${storagePath}`,
    async () => {
      const result = await admin.storage.from(SEED_DOCUMENTS_BUCKET)
        .list(storageFolder, { limit: 100, search: storageFileName });

      const listed = (result.data ?? []).some((file) => file.name === storageFileName);
      if (!result.error && !listed) {
        throw new Error(`Seeded document PDF upload was not visible in storage listing for ${storagePath}`);
      }
      if (result.error) {
        throw new Error(`Failed to verify seeded document PDF listing: ${result.error.message}`);
      }

      return result;
    },
  );

  await retryStorageSeedOperation(
    `download ${storagePath}`,
    async () => {
      const result = await admin.storage.from(SEED_DOCUMENTS_BUCKET).download(storagePath);
      if (result.error || !result.data) {
        throw new Error(
          `Failed to verify seeded document PDF download: ${result.error?.message ?? 'No data returned'}`,
        );
      }
      return result;
    },
  );

  return pdfBytes.byteLength;
}
