/**
 * No-login unsubscribe for a community's bulk email.
 *
 * Reached from the unsubscribe link in announcement, notification, digest and
 * calendar-reminder emails. Token-authenticated (no session) so a resident can
 * opt out without logging in — the previous `/settings?communityId=…` URL sat
 * behind a login wall, which defeats CAN-SPAM's no-account-required
 * expectation.
 *
 * - GET is READ-ONLY. It shows what unsubscribing stops and a button that
 *   POSTs back here with `confirm=1`. A GET must never write: mail security
 *   scanners (Proofpoint, Mimecast, Defender) prefetch every link in a
 *   message, a forwarded email's link works for whoever clicks it, and
 *   RFC 8058 section 1 notes that clients fetch List-Unsubscribe URLs. Any of
 *   them would otherwise opt the owner out with no person involved — for the
 *   `notifications` topic, out of every meeting, violation and ARC notice.
 *   Every topic gets the same page: a scanner GET silently stopping someone's
 *   announcements or reminders is the same defect at a lower price, and one
 *   rule leaves nothing to remember.
 * - POST with `confirm=1` is that button: a person read the page. It applies
 *   the opt-out for any topic (decision D3: a person may stop everything).
 * - POST without it is RFC 8058 one-click from a mail client. Honoured only
 *   for topics whose opt-out stops no statutory notice (`topicAllowsOneClick`);
 *   the `notifications` topic is refused with a 400 and nothing written. No
 *   email advertises one-click for that topic now, but mail sent before that
 *   change did, and a provider POSTing it gets the 400 (a deliberate trade:
 *   the owner keeps their notices and can still use the link).
 *
 * Every applied opt-out writes a `compliance_audit_log` row saying how it was
 * confirmed (`applyCommunityEmailUnsubscribe`).
 *
 * The page is deliberate plain HTML — it is opened from a mail client with no
 * app shell, so it uses system colors rather than the app's tokens.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import type { NextRequest } from 'next/server';
import {
  topicAllowsOneClick,
  verifyCommunityEmailUnsubscribeToken,
  type CommunityEmailTopic,
} from '@/lib/services/community-email-unsubscribe-token';
import {
  applyCommunityEmailUnsubscribe,
  TOPIC_LABELS,
} from '@/lib/services/community-email-unsubscribe-service';

/** The form field that marks a POST as the page's button, not a mail client. */
const CONFIRM_FIELD = 'confirm';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function page(
  message: string,
  status: number,
  options: { preferencesHref?: string; form?: { action: string; label: string } } = {},
): Response {
  // design-tokens:exempt — standalone email-client landing page, no app shell.
  // `message` and the button label are server-authored literals, and
  // `preferencesHref` is built from a verified numeric communityId. The form
  // action carries the caller's token, so it is escaped.
  const form = options.form
    ? `\n<form method="post" action="${escapeHtml(options.form.action)}">` +
      `<input type="hidden" name="${CONFIRM_FIELD}" value="1">` +
      `<button type="submit">${options.form.label}</button></form>`
    : '';
  const link = options.preferencesHref
    ? `\n<p><a href="${options.preferencesHref}">Open your notification preferences</a></p>`
    : '';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email preferences</title>
<style>body{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.4rem}p{font-size:1rem;line-height:1.6;opacity:.75}button{font:inherit;font-size:1rem;min-height:2.75rem;padding:.5rem 1rem;cursor:pointer}</style>
<h1>Email preferences</h1>
<p>${message}</p>${form}${link}`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/**
 * What the button will do, shown BEFORE anything changes.
 *
 * The `notifications` topic writes `emailFrequency: 'never'`, the master switch
 * that the notification pipeline, the digest, shared documents AND
 * announcement delivery all read — so it stops far more than the one email the
 * link came in, including the statutory notices the pipeline carries (meeting
 * notices, violation notices, ARC decisions). Decision D3 lets a person choose
 * that; the page names them so the choice is informed. It also names what
 * still arrives: critical mail (emergency alerts, sign-in and invitation
 * emails) bypasses the frequency, and event reminders, the community digest
 * and insurance alerts have their own preference and unsubscribe link.
 */
function previewMessage(topic: CommunityEmailTopic): string {
  if (topic === 'notifications') {
    return (
      'Unsubscribing stops all email from this community, including meeting notices, violation notices, ' +
      'decisions on your ARC requests and announcements. ' +
      'Emergency alerts and account emails, such as sign-in links, still reach you. ' +
      'Event reminders, the community digest and insurance alerts each have their own unsubscribe link. ' +
      'To stop only some email, choose what you want in your notification preferences instead.'
    );
  }
  return `Unsubscribing stops this community's ${TOPIC_LABELS[topic]}. You can turn them back on any time from your notification preferences.`;
}

function buttonLabel(topic: CommunityEmailTopic): string {
  return topic === 'notifications'
    ? 'Unsubscribe from all email'
    : `Unsubscribe from ${TOPIC_LABELS[topic]}`;
}

/** What the page says after the button was pressed and the opt-out applied. */
function confirmationMessage(topic: CommunityEmailTopic): string {
  if (topic === 'notifications') {
    return (
      "You're unsubscribed from all email from this community, including meeting notices, violation notices, " +
      'decisions on your ARC requests and announcements. ' +
      'Emergency alerts and account emails, such as sign-in links, still reach you. ' +
      'Event reminders, the community digest and insurance alerts each have their own unsubscribe link. ' +
      'To get some email back, choose what you want in your notification preferences.'
    );
  }
  return `You're unsubscribed from this community's ${TOPIC_LABELS[topic]}. You can turn them back on any time from your notification preferences.`;
}

function preferencesHref(communityId: number): string {
  return `/settings?communityId=${communityId}#notifications`;
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
 * (named by List-Unsubscribe-Post).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return new Response('Missing token', { status: 400 });

  const payload = verifyCommunityEmailUnsubscribeToken(token);
  if (!payload) return new Response('Invalid token', { status: 400 });

  if (await isConfirmedByPerson(req)) {
    await applyCommunityEmailUnsubscribe(payload, { confirmedVia: 'confirmation_page' });
    return page(confirmationMessage(payload.topic), 200, {
      preferencesHref: preferencesHref(payload.communityId),
    });
  }

  if (!topicAllowsOneClick(payload.topic)) {
    return new Response(
      'One-click unsubscribe is not offered for this email. Use the unsubscribe link in the email.',
      { status: 400 },
    );
  }

  await applyCommunityEmailUnsubscribe(payload, { confirmedVia: 'one_click' });
  return new Response('Unsubscribed', { status: 200 });
}

/** The visible email link. Read-only: shows what unsubscribing stops, and a button. */
export async function GET(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return page('This unsubscribe link is missing its token.', 400);

  const payload = verifyCommunityEmailUnsubscribeToken(token);
  if (!payload) return page('This unsubscribe link is invalid or has expired.', 400);

  return page(previewMessage(payload.topic), 200, {
    preferencesHref: preferencesHref(payload.communityId),
    form: {
      action: `/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
      label: buttonLabel(payload.topic),
    },
  });
}
