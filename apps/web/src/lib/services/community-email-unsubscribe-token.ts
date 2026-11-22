/**
 * Signed, no-login unsubscribe token for a community's bulk email.
 *
 * ── Why this exists ──
 *
 * Four non-transactional senders — announcements, the notification pipeline,
 * the digest, and calendar reminders — were passing `/settings?communityId=…`
 * as their `unsubscribeUrl`. That URL is behind a login wall, which defeats
 * both Gmail's one-click List-Unsubscribe (the mail client POSTs it with no
 * session and gets a redirect to a sign-in page) and CAN-SPAM's expectation
 * that opting out does not require creating or using an account.
 *
 * Same construction as `insurance-alert-unsubscribe-token.ts` and
 * `snowbird-digest-token.ts`, with its own secret so rotating one feature's key
 * never affects another — but generalised over a `topic`, because these four
 * senders map to four different preference flags and a single "unsubscribe from
 * everything" would silently switch off emails the reader still wants.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import { openHmacToken, signHmacToken } from '@/lib/crypto/hmac-token';

/**
 * What the reader is opting out of.
 *
 * - `notifications` — the notification pipeline and its digest (both keyed to
 *   `email_frequency`, which is their shared master switch).
 * - `announcements` — board announcements (`email_announcements`).
 * - `calendar` — scheduled event reminders (the three `calendar_reminder_*`).
 */
export const COMMUNITY_EMAIL_TOPICS = ['notifications', 'announcements', 'calendar'] as const;
export type CommunityEmailTopic = (typeof COMMUNITY_EMAIL_TOPICS)[number];

export interface CommunityEmailUnsubscribePayload {
  communityId: number;
  userId: string;
  topic: CommunityEmailTopic;
}

function getSecret(): string | null {
  return process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET || null;
}

function encodePayload(payload: CommunityEmailUnsubscribePayload): string {
  // userId is a UUID and topic is from a fixed set, so ':' is a safe delimiter.
  return Buffer.from(`${payload.communityId}:${payload.topic}:${payload.userId}`).toString(
    'base64url',
  );
}

/**
 * Build the token: `<base64url(payload)>.<hmac>`.
 *
 * **Returns `null` rather than throwing when the secret is unset.** Callers are
 * bulk senders: throwing here would mean an unconfigured environment variable
 * silently stops every announcement email for every association. The callers
 * fall back to the login-walled settings URL, which is what they used before
 * this existed — worse, but not an outage.
 */
export function signCommunityEmailUnsubscribeToken(
  payload: CommunityEmailUnsubscribePayload,
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return signHmacToken(encodePayload(payload), secret);
}

/** Verify + decode. Returns null when malformed, forged, tampered, or unconfigured. */
export function verifyCommunityEmailUnsubscribeToken(
  token: string,
): CommunityEmailUnsubscribePayload | null {
  const secret = getSecret();
  if (!secret) return null;

  const encoded = openHmacToken(token, secret);
  if (encoded === null) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const parts = decoded.split(':');
  if (parts.length < 3) return null;
  const communityId = Number(parts[0]);
  const topic = parts[1] as CommunityEmailTopic;
  // Rejoin: a UUID contains no ':', but this keeps the parse total rather than
  // silently truncating an unexpected id shape.
  const userId = parts.slice(2).join(':');

  if (!Number.isInteger(communityId) || communityId <= 0) return null;
  if (!COMMUNITY_EMAIL_TOPICS.includes(topic)) return null;
  if (userId.length === 0) return null;

  return { communityId, userId, topic };
}

/**
 * The unsubscribe URL for one recipient and topic.
 *
 * Falls back to the login-walled settings page when no secret is configured —
 * see `signCommunityEmailUnsubscribeToken`. Never returns an empty string:
 * `sendEmail` throws for a non-transactional send without an unsubscribe URL,
 * and that throw would take the whole batch down.
 */
export function buildCommunityEmailUnsubscribeUrl(params: {
  baseUrl: string;
  communityId: number;
  userId: string;
  topic: CommunityEmailTopic;
}): string {
  const token = signCommunityEmailUnsubscribeToken({
    communityId: params.communityId,
    userId: params.userId,
    topic: params.topic,
  });
  if (!token) {
    return `${params.baseUrl}/settings?communityId=${params.communityId}`;
  }
  return `${params.baseUrl}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Whether an email with this unsubscribe topic may advertise RFC 8058 one-click
 * (`List-Unsubscribe-Post`).
 *
 * `notifications` may not. Its opt-out writes `email_frequency = 'never'`, the
 * master switch that also stops statutory notices: owner and board meeting
 * notices, violation notices and ARC decisions. With one-click advertised, a
 * mailbox provider's own Unsubscribe button POSTs that opt-out and the owner
 * never sees what it stops. The preference model cannot yet express
 * "everything except statutory notices", so this topic is offered only through
 * the visible link, whose page says what it stops (decision D3).
 *
 * `announcements` and `calendar` write their own flags, which no statutory
 * notice reads, so one-click stays on for them.
 */
export function topicAllowsOneClick(topic: CommunityEmailTopic): boolean {
  return topic !== 'notifications';
}

/**
 * Unsubscribe links for one recipient of a community email.
 *
 * - `linkUrl` — the visible footer link, for a person to click. It opens the
 *   no-login confirmation page, which applies the opt-out and says what it
 *   stopped.
 * - `headerUrl` + `oneClick` — what goes in `List-Unsubscribe` and whether
 *   `List-Unsubscribe-Post` is sent. Where one-click is off, the header points
 *   at the preferences page, which changes nothing until the reader chooses:
 *   RFC 8058 section 1 notes that link checkers and anti-spam software fetch
 *   List-Unsubscribe URLs, so a header URL that acts on a plain GET could stop
 *   statutory notices with no person involved.
 *
 * `statutory` marks a statutory notice, which never advertises one-click
 * whatever its topic.
 */
export function buildCommunityEmailUnsubscribeLinks(params: {
  baseUrl: string;
  communityId: number;
  userId: string;
  topic: CommunityEmailTopic;
  statutory?: boolean;
}): { linkUrl: string; headerUrl: string; oneClick: boolean } {
  const linkUrl = buildCommunityEmailUnsubscribeUrl(params);
  const oneClick = topicAllowsOneClick(params.topic) && params.statutory !== true;
  return {
    linkUrl,
    headerUrl: oneClick
      ? linkUrl
      : `${params.baseUrl}/settings?communityId=${params.communityId}#notifications`,
    oneClick,
  };
}
