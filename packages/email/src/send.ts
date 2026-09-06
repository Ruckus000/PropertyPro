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
  idempotencyKey?: string;
}

/** Collected emails when not delivering for real. */
export const testInbox: TestMessage[] = [];

/** Clear the test inbox. Useful in test beforeEach. */
export function clearTestInbox(): void {
  testInbox.length = 0;
}

/**
 * How this process delivers mail.
 *
 * - `live` — a real Resend call.
 * - `dry-run` — EMAIL_DRY_RUN is set. Nothing is transmitted; each message is
 *   collected in `testInbox` AND logged, so an operator can see exactly who
 *   would have been mailed.
 * - `unconfigured` — no RESEND_API_KEY (tests, local dev). Collected silently,
 *   which is the long-standing behaviour.
 *
 * `dry-run` deliberately outranks a configured key: it exists so that running an
 * ops script against the PRODUCTION database cannot mail real people by
 * accident. `scripts/with-env-local.sh` turns it on by default for exactly that
 * reason, and requires an explicit opt-out to deliver.
 */
export type DeliveryMode = 'live' | 'dry-run' | 'unconfigured';

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

export function resolveDeliveryMode(): DeliveryMode {
  if (isTruthy(process.env.EMAIL_DRY_RUN)) return 'dry-run';
  return process.env.RESEND_API_KEY ? 'live' : 'unconfigured';
}

/**
 * Report a suppressed message.
 *
 * Envelope only — recipient, subject, category, sender. The rendered body is
 * never logged: templates carry invitation tokens, password-reset links and
 * signed unsubscribe URLs, and this output routinely lands in a terminal
 * scrollback or a CI log.
 */
function logSuppressed(message: {
  to: string | string[];
  subject: string;
  category: string;
  from: string;
}): void {
  const recipients = Array.isArray(message.to) ? message.to.join(', ') : message.to;
  // eslint-disable-next-line no-console
  console.info(
    `[email:dry-run] NOT SENT → to=${recipients} | subject=${JSON.stringify(message.subject)} `
    + `| category=${message.category} | from=${message.from}`,
  );
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function buildHeaders(options: SendEmailOptions): Record<string, string> {
  // Caller headers go in FIRST so the compliance block below overwrites them,
  // never the other way round. Ordering is the whole guarantee here: a support
  // reply needs In-Reply-To/References, but no caller may drop or rewrite
  // List-Unsubscribe on a bulk send.
  const headers: Record<string, string> = { ...options.headers };

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

  const mode = resolveDeliveryMode();

  if (mode !== 'live') {
    testInbox.push({
      from,
      to: options.to,
      subject: options.subject,
      react: options.react,
      headers,
      idempotencyKey: options.idempotencyKey,
    });

    if (mode === 'dry-run') {
      logSuppressed({ to: options.to, subject: options.subject, category: options.category, from });
      return { id: `dryrun_${testInbox.length}` };
    }

    return { id: `test_${testInbox.length}` };
  }

  const resend = getResendClient();
  // `mode === 'live'` already established RESEND_API_KEY is present.
  if (!resend) {
    throw new Error('Resend client unavailable despite live delivery mode');
  }

  const payload = {
    from,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    react: options.react,
    replyTo: options.replyTo,
    headers,
  };
  const response = options.idempotencyKey
    ? await resend.emails.send(payload, { idempotencyKey: options.idempotencyKey })
    : await resend.emails.send(payload);
  const { data, error } = response;

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
  if (requests.some((request) => request.idempotencyKey)) {
    throw new Error('sendBulkEmail does not support per-message idempotency keys; use sendEmail instead');
  }

  const mode = resolveDeliveryMode();

  const results: SendBulkEmailResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  if (mode !== 'live') {
    for (const options of requests) {
      const from = resolveFromAddress(options.from);
      testInbox.push({
        from,
        to: options.to,
        subject: options.subject,
        react: options.react,
        headers: buildHeaders(options),
      });
      if (mode === 'dry-run') {
        logSuppressed({ to: options.to, subject: options.subject, category: options.category, from });
      }
      const id = `${mode === 'dry-run' ? 'dryrun' : 'test'}_${testInbox.length}`;
      results.push({ success: true, id });
      successCount++;
    }
    if (mode === 'dry-run' && requests.length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[email:dry-run] suppressed ${requests.length} bulk message(s); nothing was transmitted`,
      );
    }
    return { results, successCount, failureCount };
  }

  const resend = getResendClient();
  if (!resend) {
    throw new Error('Resend client unavailable despite live delivery mode');
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
