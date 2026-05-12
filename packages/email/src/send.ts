import type { ReactElement } from 'react';
import { Resend } from 'resend';
import type { SendEmailOptions, SendEmailResult, SendBulkEmailResult } from './types';

/** Default when `RESEND_FROM` is unset — must match a verified domain in Resend. */
const DEFAULT_FROM = 'PropertyPro <noreply@getpropertypro.com>';

function resolveFromAddress(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const envFrom = process.env.RESEND_FROM?.trim();
  if (envFrom) return envFrom;
  return DEFAULT_FROM;
}

/**
 * When RESEND_API_KEY is not set (e.g. in tests or local dev),
 * emails are collected in `testInbox` instead of being sent.
 */
export interface TestMessage {
  from: string;
  to: string | string[];
  subject: string;
  react: ReactElement;
  headers: Record<string, string>;
}

/** Collected emails when running in test mode (no RESEND_API_KEY). */
export const testInbox: TestMessage[] = [];

/** Clear the test inbox. Useful in test beforeEach. */
export function clearTestInbox(): void {
  testInbox.length = 0;
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function buildHeaders(options: SendEmailOptions): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options.category === 'non-transactional') {
    if (!options.unsubscribeUrl) {
      throw new Error(
        'List-Unsubscribe URL is required for non-transactional emails (CAN-SPAM / Gmail 2024 sender requirements)',
      );
    }

    headers['List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click-Unsubscribe';
  }

  return headers;
}

/**
 * Send an email via Resend.
 *
 * When RESEND_API_KEY is not set, operates in test mode: the message
 * is pushed to `testInbox` and a deterministic ID is returned.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const headers = buildHeaders(options);
  const from = resolveFromAddress(options.from);

  const resend = getResendClient();

  if (!resend) {
    testInbox.push({
      from,
      to: options.to,
      subject: options.subject,
      react: options.react,
      headers,
    });

    return { id: `test_${testInbox.length}` };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    react: options.react,
    replyTo: options.replyTo,
    headers,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }

  return { id: data?.id ?? 'unknown' };
}

/**
 * Send multiple emails via Resend's batch API.
 *
 * Respects the Resend batch limit of 100 emails per request by chunking internally.
 * When RESEND_API_KEY is not set, operates in test mode.
 */
export async function sendBulkEmail(requests: SendEmailOptions[]): Promise<SendBulkEmailResult> {
  const resend = getResendClient();

  const results: SendBulkEmailResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  if (!resend) {
    for (const options of requests) {
      const from = resolveFromAddress(options.from);
      testInbox.push({
        from,
        to: options.to,
        subject: options.subject,
        react: options.react,
        headers: buildHeaders(options),
      });
      const id = `test_${testInbox.length}`;
      results.push({ success: true, id });
      successCount++;
    }
    return { results, successCount, failureCount };
  }

  // Helper to chunk arrays
  const chunk = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );

  // Resend batch API limit is 100 per request
  const batches = chunk(requests, 100);

  for (const batch of batches) {
    const payload = batch.map(options => ({
      from: resolveFromAddress(options.from),
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      react: options.react,
      replyTo: options.replyTo,
      headers: buildHeaders(options),
    }));

    const { data, error } = await resend.batch.send(payload);

    if (error) {
      // Total batch failure
      for (let i = 0; i < batch.length; i++) {
        results.push({ success: false, error: error.message });
        failureCount++;
      }
    } else if (data && 'data' in data && Array.isArray(data.data)) {
      // Successfully called batch send.
      // We expect the array returned to be the same length and order as our payload.
      for (const item of data.data) {
        // According to Resend's API response for create batch, the returned object could contain ID or error.
        // We'll treat item.error or missing ID as a failure just in case, though the TypeScript typing
        // from Resend SDK usually just guarantees `data.data` is an array of `{ id: string }`.
        if (item && 'id' in item && typeof item.id === 'string') {
          results.push({ success: true, id: item.id });
          successCount++;
        } else {
          results.push({ success: false, error: 'Unknown error sending email' });
          failureCount++;
        }
      }
    } else if (data && Array.isArray(data)) {
      // Handle the case where `data` itself is an array (older versions of resend sdk)
      for (const item of data as any[]) {
        if (item && 'id' in item && typeof item.id === 'string') {
          results.push({ success: true, id: item.id });
          successCount++;
        } else {
          results.push({ success: false, error: 'Unknown error sending email' });
          failureCount++;
        }
      }
    } else {
      // Missing data and error
      for (let i = 0; i < batch.length; i++) {
        results.push({ success: false, error: 'Empty response from Resend' });
        failureCount++;
      }
    }
  }

  return { results, successCount, failureCount };
}
