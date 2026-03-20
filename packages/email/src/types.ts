import type { ReactElement } from 'react';

/** Community branding fields injected into every email. */
export interface CommunityBranding {
  communityName: string;
  logoUrl?: string;
  accentColor?: string;
  /** Custom footer text appended after the standard footer. */
  customEmailFooter?: string;
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
}

/** Result from the send helper. */
export interface SendEmailResult {
  id: string;
}
