/**
 * DocuSeal API client — singleton wrapper for all DocuSeal Cloud API calls.
 *
 * All API interactions go through this module. Never import the DocuSeal SDK
 * directly in route handlers or components.
 *
 * Security: DOCUSEAL_API_KEY is server-only; never exposed to the client.
 */
import { timingSafeEqual } from 'crypto';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getDocuSealConfig() {
  return {
    apiKey: getRequiredEnv('DOCUSEAL_API_KEY'),
    apiUrl: process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com',
    webhookSecret: getRequiredEnv('DOCUSEAL_WEBHOOK_SECRET'),
    userEmail: getRequiredEnv('DOCUSEAL_USER_EMAIL'),
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocuSealTemplate {
  id: number;
  name: string;
  external_id?: string;
  folder_name?: string;
  fields: Array<{
    name: string;
    type: string;
    role: string;
    required?: boolean;
  }>;
  created_at: string;
  updated_at: string;
}

export interface DocuSealSubmitter {
  id: number;
  submission_id: number;
  uuid: string;
  email: string;
  slug: string;
  name?: string;
  role: string;
  status: string;
  external_id?: string;
  completed_at?: string;
  values?: Array<{ field: string; value: string }>;
  documents?: Array<{ name: string; url: string }>;
  metadata?: Record<string, unknown>;
}

export interface DocuSealSubmission {
  id: number;
  source: string;
  submitters: DocuSealSubmitter[];
  template: { id: number; name: string };
  status: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  audit_log_url?: string;
}

export interface CreateSubmissionInput {
  template_id: number;
  send_email?: boolean;
  order?: 'preserved' | 'random';
  submitters: Array<{
    email: string;
    name?: string;
    role: string;
    external_id?: string;
    fields?: Array<{
      name: string;
      default_value: string;
      readonly?: boolean;
    }>;
    send_email?: boolean;
  }>;
  external_id?: string;
  expire_at?: string;
  message?: {
    subject: string;
    body: string;
  };
}

export interface CreateTemplateFromPdfInput {
  name: string;
  external_id?: string;
  folder_name?: string;
  documents: Array<{
    name: string;
    file_url?: string;
    file_base64?: string;
  }>;
}

export interface CreateTemplateFromHtmlInput {
  name: string;
  external_id?: string;
  folder_name?: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class DocuSealApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'DocuSealApiError';
  }
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function docuSealFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    retries?: number;
  } = {},
): Promise<T> {
  const config = getDocuSealConfig();
  const { method = 'GET', body, retries = 2 } = options;

  const url = `${config.apiUrl}${path}`;
  const headers: Record<string, string> = {
    'X-Auth-Token': config.apiKey,
    'Content-Type': 'application/json',
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        let parsed: unknown;
        try {
          parsed = JSON.parse(responseBody);
        } catch {
          parsed = responseBody;
        }
        throw new DocuSealApiError(
          `DocuSeal API ${method} ${path} returned ${response.status}`,
          response.status,
          parsed,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry client errors (4xx)
      if (error instanceof DocuSealApiError && error.statusCode < 500) {
        throw error;
      }

      // Exponential backoff for retries
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError ?? new Error('DocuSeal API request failed');
}

// ---------------------------------------------------------------------------
// Template operations
// ---------------------------------------------------------------------------

export async function createTemplateFromPdf(
  input: CreateTemplateFromPdfInput,
): Promise<DocuSealTemplate> {
  return docuSealFetch<DocuSealTemplate>('/templates/pdf', {
    method: 'POST',
    body: input,
  });
}

export async function createTemplateFromHtml(
  input: CreateTemplateFromHtmlInput,
): Promise<DocuSealTemplate> {
  return docuSealFetch<DocuSealTemplate>('/templates/html', {
    method: 'POST',
    body: input,
  });
}

export async function getTemplate(templateId: number): Promise<DocuSealTemplate> {
  return docuSealFetch<DocuSealTemplate>(`/templates/${templateId}`);
}

export async function archiveTemplate(templateId: number): Promise<void> {
  await docuSealFetch(`/templates/${templateId}`, { method: 'DELETE' });
}

export async function cloneTemplate(
  templateId: number,
  name: string,
  externalId?: string,
  folderName?: string,
): Promise<DocuSealTemplate> {
  return docuSealFetch<DocuSealTemplate>(`/templates/${templateId}/clone`, {
    method: 'POST',
    body: { name, external_id: externalId, folder_name: folderName },
  });
}

// ---------------------------------------------------------------------------
// Submission operations
// ---------------------------------------------------------------------------

export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<DocuSealSubmitter[]> {
  return docuSealFetch<DocuSealSubmitter[]>('/submissions', {
    method: 'POST',
    body: input,
  });
}

export async function getSubmission(submissionId: number): Promise<DocuSealSubmission> {
  return docuSealFetch<DocuSealSubmission>(`/submissions/${submissionId}`);
}

export async function getSubmitter(submitterId: number): Promise<DocuSealSubmitter> {
  return docuSealFetch<DocuSealSubmitter>(`/submitters/${submitterId}`);
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

export function verifyWebhookSecret(headerValue: string | null): boolean {
  const config = getDocuSealConfig();
  if (!headerValue) return false;

  const expected = Buffer.from(config.webhookSecret);
  const received = Buffer.from(headerValue);

  // timingSafeEqual throws if lengths differ
  if (expected.length !== received.length) return false;

  // Use the Node.js built-in to prevent timing side-channel attacks
  return timingSafeEqual(expected, received);
}

// ---------------------------------------------------------------------------
// Document download
// ---------------------------------------------------------------------------

export async function downloadSignedDocument(documentUrl: string): Promise<Buffer> {
  const response = await fetch(documentUrl);
  if (!response.ok) {
    throw new DocuSealApiError(
      `Failed to download signed document: ${response.status}`,
      response.status,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
