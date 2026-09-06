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
