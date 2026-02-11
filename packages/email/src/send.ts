import type { ReactElement } from 'react';
import { Resend } from 'resend';
import type { SendEmailOptions, SendEmailResult } from './types';

const DEFAULT_FROM = 'PropertyPro <noreply@mail.propertyprofl.com>';

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
  const from = options.from ?? DEFAULT_FROM;

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
