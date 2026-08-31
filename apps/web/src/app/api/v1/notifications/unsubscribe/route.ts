/**
 * No-login unsubscribe for a community's bulk email.
 *
 * Reached from the one-click link in announcement, notification, digest and
 * calendar-reminder emails. Token-authenticated (no session) so a resident can
 * opt out without logging in — that is the whole point: the previous
 * `/settings?communityId=…` URL sat behind a login wall, which defeats Gmail's
 * one-click List-Unsubscribe and CAN-SPAM's no-account-required expectation.
 *
 * - POST is the RFC 8058 one-click target named by List-Unsubscribe-Post.
 * - GET backs the visible "unsubscribe" link a human clicks, and confirms.
 *
 * Mirrors `insurance-alerts/unsubscribe` exactly, including the deliberate
 * plain-HTML response — this page is rendered by a mail client's browser with
 * no app shell, so it uses system colors rather than the app's tokens.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import type { NextRequest } from 'next/server';
import { verifyCommunityEmailUnsubscribeToken } from '@/lib/services/community-email-unsubscribe-token';
import {
  applyCommunityEmailUnsubscribe,
  TOPIC_LABELS,
} from '@/lib/services/community-email-unsubscribe-service';

function page(message: string, status: number): Response {
  // design-tokens:exempt — standalone email-client landing page, no app shell.
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email preferences</title>
<style>body{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.4rem}p{font-size:1rem;line-height:1.6;opacity:.75}</style>
<h1>Email preferences</h1>
<p>${message}</p>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** One-click target (List-Unsubscribe-Post). Mail clients POST here. */
export async function POST(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return new Response('Missing token', { status: 400 });

  const payload = verifyCommunityEmailUnsubscribeToken(token);
  if (!payload) return new Response('Invalid token', { status: 400 });

  await applyCommunityEmailUnsubscribe(payload);
  return new Response('Unsubscribed', { status: 200 });
}

/** Human click from the visible email link. Shows a confirmation page. */
export async function GET(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return page('This unsubscribe link is missing its token.', 400);

  const payload = verifyCommunityEmailUnsubscribeToken(token);
  if (!payload) return page('This unsubscribe link is invalid or has expired.', 400);

  await applyCommunityEmailUnsubscribe(payload);

  return page(
    `You're unsubscribed from this community's ${TOPIC_LABELS[payload.topic]}. You can turn them back on any time from your notification settings.`,
    200,
  );
}
