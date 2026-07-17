/**
 * No-login snowbird digest unsubscribe.
 *
 * Reached from the one-click link in the digest email. Token-authenticated (no
 * session) so absentee owners can opt out without logging in — the CAN-SPAM
 * one-click opt-out. The signed token carries the community + user; a valid
 * token authorizes setting THAT user's cadence to 'off'.
 */
import type { NextRequest } from 'next/server';
import { verifySnowbirdUnsubscribeToken } from '@/lib/services/snowbird-digest-token';
import { applySnowbirdUnsubscribe } from '@/lib/services/snowbird-digest-unsubscribe-service';

function page(message: string, status: number): Response {
  // Standalone browser landing page (clicked from an email), not a React view —
  // it uses system colors rather than the app's semantic tokens on purpose.
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Community digest</title>
<style>body{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.4rem}p{font-size:1rem;line-height:1.6;opacity:.75}</style>
<h1>Community digest</h1>
<p>${message}</p>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return page('This unsubscribe link is missing its token.', 400);

  const payload = verifySnowbirdUnsubscribeToken(token);
  if (!payload) return page('This unsubscribe link is invalid or has expired.', 400);

  await applySnowbirdUnsubscribe(payload);

  return page(
    "You're unsubscribed from the community digest. You can turn it back on any time from your notification settings.",
    200,
  );
}
