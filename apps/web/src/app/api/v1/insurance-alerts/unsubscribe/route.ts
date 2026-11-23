/**
 * No-login insurance-alert unsubscribe.
 *
 * Reached from the one-click link in a renewal/expiry alert email.
 * Token-authenticated (no session) so board members can opt out without logging
 * in — the CAN-SPAM / Gmail one-click opt-out. The signed token carries the
 * community + user; a valid token authorizes turning off THAT user's
 * insurance-alert emails (the notification_preferences.email_insurance_alerts
 * flag).
 *
 * - POST is the RFC 8058 one-click target named by List-Unsubscribe-Post.
 * - GET backs the visible "unsubscribe" link. It is READ-ONLY: mail security
 *   scanners prefetch every link in a message, so a GET that wrote would opt
 *   people out with no person involved. It shows a button that POSTs back here
 *   with `confirm=1` (same shape as notifications/unsubscribe).
 */
import type { NextRequest } from 'next/server';
import { escapeHtmlAttribute } from '@/lib/utils/client-redirect-html';
import { verifyInsuranceAlertUnsubscribeToken } from '@/lib/services/insurance-alert-unsubscribe-token';
import { applyInsuranceAlertUnsubscribe } from '@/lib/services/insurance-alert-unsubscribe-service';

/** The form field that marks a POST as the page's button, not a mail client. */
const CONFIRM_FIELD = 'confirm';

function page(
  message: string,
  status: number,
  form?: { action: string; label: string },
): Response {
  // Standalone browser landing page (clicked from an email), not a React view —
  // it uses system colors rather than the app's semantic tokens on purpose.
  // `message` and the button label are server-authored literals; the form
  // action carries the caller's token, so it is escaped.
  const formHtml = form
    ? `\n<form method="post" action="${escapeHtmlAttribute(form.action)}">` +
      `<input type="hidden" name="${CONFIRM_FIELD}" value="1">` +
      `<button type="submit">${form.label}</button></form>`
    : '';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Insurance alerts</title>
<style>body{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.4rem}p{font-size:1rem;line-height:1.6;opacity:.75}button{font:inherit;font-size:1rem;min-height:2.75rem;padding:.5rem 1rem;cursor:pointer}</style>
<h1>Insurance alerts</h1>
<p>${message}</p>${formHtml}`;
  // no-store: the page is per-token, and its form action carries the token.
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * True when the POST is the page's own button. Reads a urlencoded body (what
 * the form sends); a mail client's one-click body is
 * `List-Unsubscribe=One-Click`, which never carries the field.
 */
async function isConfirmedByPerson(req: NextRequest): Promise<boolean> {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return false;
  }
  return new URLSearchParams(body).get(CONFIRM_FIELD) === '1';
}

/**
 * The page's button (`confirm=1`), or RFC 8058 one-click from a mail client
 * (List-Unsubscribe-Post). Both apply the opt-out; the button gets a page back.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return new Response('Missing token', { status: 400 });

  const payload = verifyInsuranceAlertUnsubscribeToken(token);
  if (!payload) return new Response('Invalid token', { status: 400 });

  await applyInsuranceAlertUnsubscribe(payload);
  if (await isConfirmedByPerson(req)) {
    return page(
      "You're unsubscribed from this community's insurance alerts. You can turn them back on any time from your notification settings.",
      200,
    );
  }
  return new Response('Unsubscribed', { status: 200 });
}

/** The visible email link. Read-only: shows what unsubscribing stops, and a button. */
export async function GET(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return page('This unsubscribe link is missing its token.', 400);

  const payload = verifyInsuranceAlertUnsubscribeToken(token);
  if (!payload) return page('This unsubscribe link is invalid or has expired.', 400);

  return page(
    "Unsubscribing stops this community's insurance alerts. You can turn them back on any time from your notification settings.",
    200,
    {
      action: `/api/v1/insurance-alerts/unsubscribe?token=${encodeURIComponent(token)}`,
      label: 'Unsubscribe from insurance alerts',
    },
  );
}
