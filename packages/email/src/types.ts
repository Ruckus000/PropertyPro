import type { ReactElement } from 'react';

/** Community branding fields injected into every email. */
export interface CommunityBranding {
  communityName: string;
  logoUrl?: string;
  accentColor?: string;
  /** Custom footer text appended after the standard footer. */
  customEmailFooter?: string;
  /**
   * The sender's physical postal address as display lines.
   *
   * CAN-SPAM requires one on commercial email. The sender here is the
   * ASSOCIATION, not PropertyPro, so this is the community's own mailing
   * address — build it with `formatCommunityPostalAddress`, which returns null
   * when the address is incomplete rather than shipping a partial one.
   *
   * Optional because transactional email does not need it; `EmailLayout`
   * renders it only when present.
   */
  postalAddressLines?: string[];
  /**
   * No-login opt-out URL, rendered as a visible footer link.
   *
   * Must be reachable WITHOUT a session — a link to a login-walled settings
   * page satisfies neither Gmail's one-click List-Unsubscribe nor CAN-SPAM's
   * expectation that opting out does not require an account. See
   * `buildCommunityEmailUnsubscribeUrl`.
   */
  unsubscribeUrl?: string;
  /** Link text, e.g. "Unsubscribe from announcements". Defaults to "Unsubscribe". */
  unsubscribeLabel?: string;
  /**
   * Link to the recipient's notification preferences, rendered in the footer.
   * Optional: the layout has no base URL and never invents one, so the link
   * only appears when a caller supplies it.
   */
  preferencesUrl?: string;
}

/** Base props shared by all email templates. */
export interface BaseEmailProps {
  branding: CommunityBranding;
  previewText?: string;
}

/** Classification of an email for List-Unsubscribe handling. */
export type EmailCategory = 'transactional' | 'non-transactional';

/** Options passed to the send helper. */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  category: EmailCategory;
  /** Required for non-transactional emails. mailto: or https: URI. */
  unsubscribeUrl?: string;
  /**
   * Whether a non-transactional email advertises RFC 8058 one-click
   * unsubscribe (`List-Unsubscribe-Post`). **Defaults to true** — on for every
   * non-transactional send that does not pass `false`.
   *
   * With the header, a mailbox provider's own "Unsubscribe" button POSTs
   * `unsubscribeUrl` and no person sees what it stops. Pass `false` whenever
   * that opt-out could stop a statutory notice: a statutory notice itself (a
   * meeting, violation or ARC notice), and any email whose opt-out writes the
   * setting that also gates statutory notices — today every community email
   * on the `notifications` unsubscribe topic (the notification pipeline, its
   * digest, shared documents). Web callers get this decided for them by
   * `buildCommunityEmailUnsubscribeLinks`. `List-Unsubscribe` itself is still
   * sent, so `unsubscribeUrl` should then be a page that changes nothing
   * until the reader chooses.
   *
   * The default stays on because the remaining non-transactional senders
   * (announcements, event reminders, the snowbird digest, insurance alerts)
   * each opt out of their own flag only, and providers expect one-click on
   * bulk mail. No email category carries statutory content implicitly: the
   * one sender of statutory notices passes `false` explicitly.
   */
  oneClickUnsubscribe?: boolean;
  /** From address override. Defaults to configured default. */
  from?: string;
  /** Reply-to address. */
  replyTo?: string;
  /** Stable provider key for safe retry of this single-message send request. */
  idempotencyKey?: string;
  /**
   * Extra RFC 5322 headers, e.g. `In-Reply-To` / `References` when replying to
   * a received message so the recipient's client threads it.
   *
   * Merged UNDERNEATH the List-Unsubscribe pair, which is compliance
   * machinery: a caller must not be able to blank out a CAN-SPAM header by
   * passing one here. See buildHeaders() in send.ts.
   */
  headers?: Record<string, string>;
}

/** Result from the send helper. */
export interface SendEmailResult {
  id: string;
}

export interface SendBulkEmailResult {
  results: {
    success: boolean;
    id?: string;
    error?: string;
  }[];
  successCount: number;
  failureCount: number;
}
