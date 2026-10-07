/**
 * Owner consent to electronic notice — §718.112(2)(d) (condominiums) and
 * §720.303 (HOAs) let an association send notice by email only to an owner
 * who consented in writing.
 *
 * The wording is versioned because the stored row must prove WHAT was agreed,
 * not just when. Each `notice_consent` row stores both the rendered text and
 * this version. Bump the version whenever the wording changes in substance
 * (not for a typo); rows on the old version stay valid records of what those
 * owners saw. The wording is pending counsel review — see
 * docs/audits/2026-09-30-counsel-packet-notices.md Q7.
 */
export const NOTICE_CONSENT_VERSION = '2026-10-06.1';

/** The consent wording, with the address the owner is consenting to receive notices at. */
export function noticeConsentText(email: string): string {
  return (
    `I consent to receive official notices from my association by email at ${email}, ` +
    'instead of by mail or hand delivery. This includes notices of owner and board meetings ' +
    'and other notices Florida law requires the association to send. I can withdraw this ' +
    'consent at any time in Settings, and I will keep my email address up to date.'
  );
}

/**
 * Shown next to every consent state. Recording consent changes nothing about
 * delivery yet, and a manager must not read the badge as permission to stop
 * mailing paper notices.
 */
export const NOTICE_CONSENT_RECORD_ONLY_NOTE =
  'Recorded only. Notices are still delivered the way they are today.';
