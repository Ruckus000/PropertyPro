import { Body, Head, Html, Img, Link, Preview } from '@react-email/components';
import type { ReactNode } from 'react';
import type { CommunityBranding } from '../types';
import { emailFontUrl, emailImageUrl } from './email-assets';
import {
  emailTheme as c,
  monogram,
  safeHexColour,
  safeHttpsUrl,
  sans,
  serif,
  toneColors,
  type EmailTone,
} from './theme';

/**
 * The one frame every Florida Modern email is drawn in (except the support
 * reply, which is deliberately chrome-free). Seven parts, top to bottom:
 * accent rule → masthead → [template content: category mark, headline + lede,
 * data block, one action + one escape] → legal footer.
 *
 * Two senders share it:
 * - `association` (default): the community speaks. Monogram or logo, the
 *   community's accent on coral-toned mail, association postal address, and an
 *   unsubscribe link when the caller supplies one (non-transactional mail).
 * - `platform`: PropertyPro speaks. House lockup, never community-branded,
 *   PropertyPro's own contact block, account links, no opt-out.
 */

export interface EmailFooterLink {
  label: string;
  href: string;
}

export interface EmailMastheadChip {
  label: string;
  tone: EmailTone;
}

export interface EmailLayoutProps {
  branding: CommunityBranding;
  previewText?: string;
  /**
   * Explicit accent-rule colour. Wins over everything, including `tone`.
   * Kept for callers written against the v2 layout.
   */
  accentColor?: string;
  /** Semantic tone of the accent rule. Defaults to coral. */
  tone?: EmailTone;
  sender?: 'association' | 'platform';
  /** Second line under the association / PropertyPro name. */
  mastheadContext?: ReactNode;
  /** Right-hand state chip (e.g. "Due in 14 days"). */
  mastheadChip?: EmailMastheadChip;
  /** Right-hand plain text when there is no chip (e.g. "Unit 412 · M. Reyes"). */
  mastheadMeta?: ReactNode;
  /** `compact` = the routine-mail masthead: 28px mark, 15px name, no context line. */
  mastheadSize?: 'default' | 'compact';
  /** Full-width band ABOVE the masthead (the emergency alert's red strip). */
  banner?: ReactNode;
  /** Extra footer links, rendered before preferences / unsubscribe. */
  footerLinks?: EmailFooterLink[];
  /** Why this mail reached the reader, under the footer rule. */
  footerReason?: ReactNode;
  children: ReactNode;
}

/** PropertyPro as the platform sender. One place, so a move is one edit. */
export const PLATFORM_SENDER = {
  legalName: 'PropertyPro Florida, Inc.',
  location: 'West Palm Beach, FL',
  supportEmail: 'support@getpropertypro.com',
} as const;

export function EmailLayout({
  branding,
  previewText,
  accentColor,
  tone = 'coral',
  sender = 'association',
  mastheadContext,
  mastheadChip,
  mastheadMeta,
  mastheadSize = 'default',
  banner,
  footerLinks,
  footerReason,
  children,
}: EmailLayoutProps) {
  const isPlatform = sender === 'platform';
  const communityAccent = isPlatform ? undefined : safeHexColour(branding.accentColor);
  // Semantic tones always win; the community's own colour only replaces coral.
  const rule =
    safeHexColour(accentColor) ??
    (tone === 'coral' ? (communityAccent ?? c.coral) : toneColors(tone).rule);

  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{headCss()}</style>
      </Head>
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={bodyStyle}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: c.canvas }}>
          <tbody>
            <tr>
              <td className="fm-outer" style={{ padding: '32px 12px 40px' }}>
                <table
                  role="presentation"
                  className="fm-card"
                  width="600"
                  align="center"
                  cellPadding={0}
                  cellSpacing={0}
                  style={cardStyle}
                >
                  <tbody>
                    <tr>
                      <td style={{ height: '4px', backgroundColor: rule, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
                    </tr>
                    {banner}
                    <tr>
                      <td
                        className="fm-pad"
                        style={{
                          backgroundColor: c.masthead,
                          padding: mastheadSize === 'compact' ? '18px 30px' : '22px 30px',
                          borderBottom: `1px solid ${c.border}`,
                        }}
                      >
                        {isPlatform ? (
                          <PlatformMasthead context={mastheadContext} chip={mastheadChip} meta={mastheadMeta} />
                        ) : (
                          <AssociationMasthead
                            branding={branding}
                            accent={communityAccent ?? c.coral}
                            context={mastheadSize === 'compact' ? undefined : mastheadContext}
                            chip={mastheadChip}
                            meta={mastheadMeta}
                            compact={mastheadSize === 'compact'}
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="fm-pad" style={{ padding: '40px 30px 14px', fontFamily: sans }}>
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="fm-pad"
                        style={{
                          backgroundColor: c.canvas,
                          borderTop: `1px solid ${c.border}`,
                          padding: '26px 30px 28px',
                          fontFamily: sans,
                        }}
                      >
                        {isPlatform ? (
                          <PlatformFooter links={footerLinks} reason={footerReason} />
                        ) : (
                          <AssociationFooter branding={branding} links={footerLinks} reason={footerReason} />
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

// ── Masthead ────────────────────────────────────────────────────────────────

function Chip({ chip }: { chip: EmailMastheadChip }) {
  const colours = toneColors(chip.tone);
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: colours.bg,
        color: colours.text,
        border: `1px solid ${colours.border}`,
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {chip.label}
    </span>
  );
}

function MastheadRight({ chip, meta }: { chip?: EmailMastheadChip; meta?: ReactNode }) {
  if (!chip && !meta) return null;
  return (
    <td className="fm-release" style={{ verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: '12px' }}>
      {chip ? <Chip chip={chip} /> : <div style={{ fontSize: '12px', color: c.body, lineHeight: 1.5 }}>{meta}</div>}
    </td>
  );
}

function AssociationMasthead({
  branding,
  accent,
  context,
  chip,
  meta,
  compact,
}: {
  branding: CommunityBranding;
  accent: string;
  context?: ReactNode;
  chip?: EmailMastheadChip;
  meta?: ReactNode;
  compact: boolean;
}) {
  const size = compact ? 28 : 36;
  const logoUrl = safeHttpsUrl(branding.logoUrl);

  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', width: `${size}px`, paddingRight: compact ? '10px' : '12px' }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={`${branding.communityName} logo`}
                width={size}
                height={size}
                style={{ display: 'block', width: `${size}px`, height: `${size}px`, borderRadius: compact ? '7px' : '8px' }}
              />
            ) : (
              <div
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: compact ? '7px' : '8px',
                  backgroundColor: accent,
                  textAlign: 'center',
                  lineHeight: `${size}px`,
                  fontFamily: serif,
                  fontSize: compact ? '12px' : '15px',
                  fontWeight: 600,
                  color: c.onFill,
                  letterSpacing: '0.2px',
                }}
              >
                {monogram(branding.communityName)}
              </div>
            )}
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <div
              style={{
                fontFamily: serif,
                fontSize: compact ? '15px' : '17px',
                fontWeight: 600,
                color: c.ink,
                letterSpacing: compact ? '-0.2px' : '-0.3px',
                lineHeight: 1.2,
              }}
            >
              {branding.communityName}
            </div>
            {context && (
              <div style={{ fontSize: '11px', color: c.meta, letterSpacing: '0.2px', marginTop: '2px', fontFamily: sans }}>
                {context}
              </div>
            )}
          </td>
          <MastheadRight chip={chip} meta={meta} />
        </tr>
      </tbody>
    </table>
  );
}

function PlatformMasthead({
  context,
  chip,
  meta,
}: {
  context?: ReactNode;
  chip?: EmailMastheadChip;
  meta?: ReactNode;
}) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', width: '30px', paddingRight: '11px' }}>
            <Img
              src={emailImageUrl('logomark-ink.png')}
              width={30}
              height={30}
              alt="PropertyPro"
              style={{ display: 'block', width: '30px', height: '30px' }}
            />
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <div style={{ fontFamily: serif, fontSize: '20px', lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.2px', color: c.wordmark }}>
              PropertyPro
            </div>
            {context && (
              <div style={{ fontSize: '11px', color: c.meta, letterSpacing: '0.2px', marginTop: '3px', fontFamily: sans }}>
                {context}
              </div>
            )}
          </td>
          <MastheadRight chip={chip} meta={meta} />
        </tr>
      </tbody>
    </table>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

const footerLinkStyle: React.CSSProperties = { color: c.body, textDecoration: 'none' };

function FooterLinks({ links }: { links: Array<EmailFooterLink & { underline?: boolean }> }) {
  if (links.length === 0) return null;
  return (
    <td className="fm-stack" style={{ verticalAlign: 'top', textAlign: 'right', paddingLeft: '16px' }}>
      <div style={{ fontSize: '12px', lineHeight: 1.9 }}>
        {links.map((link, index) => (
          <span key={`${link.label}-${index}`}>
            {index > 0 && <br />}
            <Link href={link.href} style={link.underline ? { ...footerLinkStyle, textDecoration: 'underline' } : footerLinkStyle}>
              {link.label}
            </Link>
          </span>
        ))}
      </div>
    </td>
  );
}

function FooterRule({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderTop: `1px solid ${c.border}`,
        marginTop: '16px',
        paddingTop: '12px',
        fontSize: '12px',
        color: c.body,
        lineHeight: 1.6,
        letterSpacing: '0.1px',
      }}
    >
      {children}
    </div>
  );
}

function AssociationFooter({
  branding,
  links = [],
  reason,
}: {
  branding: CommunityBranding;
  links?: EmailFooterLink[];
  reason?: ReactNode;
}) {
  const all: Array<EmailFooterLink & { underline?: boolean }> = [...links];
  if (branding.preferencesUrl) all.push({ label: 'Notification preferences', href: branding.preferencesUrl });
  // Visible opt-out. The List-Unsubscribe HEADER is set by `sendEmail` and is
  // what Gmail's one-click button uses; this is the in-body link CAN-SPAM asks
  // for, for readers whose client shows no button. Present only when the caller
  // passed a URL — i.e. only on non-transactional mail.
  if (branding.unsubscribeUrl) {
    all.push({ label: branding.unsubscribeLabel ?? 'Unsubscribe', href: branding.unsubscribeUrl, underline: true });
  }
  // CAN-SPAM sender postal address. The sender is the ASSOCIATION, so this is
  // the community's own mailing address. Rendered only when the caller supplied
  // a complete one — a partial address is worse than none.
  const address = branding.postalAddressLines && branding.postalAddressLines.length > 0 ? branding.postalAddressLines : null;

  return (
    <>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td className="fm-stack" style={{ verticalAlign: 'top' }}>
              <div style={{ fontFamily: serif, fontSize: '13px', fontWeight: 600, color: c.body, letterSpacing: '-0.1px' }}>
                {branding.communityName}
              </div>
              {address && (
                <div style={{ fontSize: '12px', color: c.body, lineHeight: 1.6, marginTop: '4px' }}>
                  {address.map((line, index) => (
                    <span key={index}>
                      {index > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
              )}
            </td>
            <FooterLinks links={all} />
          </tr>
        </tbody>
      </table>
      <FooterRule>
        {reason && <div style={{ marginBottom: '6px' }}>{reason}</div>}
        {branding.customEmailFooter && <div style={{ marginBottom: '6px' }}>{branding.customEmailFooter}</div>}
        <div>
          Sent by {branding.communityName} · Powered by{' '}
          <Img
            src={emailImageUrl('logomark-ink.png')}
            width={14}
            height={14}
            alt=""
            style={{ display: 'inline-block', verticalAlign: '-2px', width: '14px', height: '14px' }}
          />{' '}
          PropertyPro Florida
        </div>
      </FooterRule>
    </>
  );
}

function PlatformFooter({ links = [], reason }: { links?: EmailFooterLink[]; reason?: ReactNode }) {
  return (
    <>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td className="fm-stack" style={{ verticalAlign: 'top' }}>
              <div style={{ fontFamily: serif, fontSize: '13px', fontWeight: 600, color: c.body, letterSpacing: '-0.1px' }}>
                {PLATFORM_SENDER.legalName}
              </div>
              <div style={{ fontSize: '12px', color: c.body, lineHeight: 1.6, marginTop: '4px' }}>
                {PLATFORM_SENDER.location}
                <br />
                {PLATFORM_SENDER.supportEmail}
              </div>
            </td>
            <FooterLinks links={links} />
          </tr>
        </tbody>
      </table>
      {reason && <FooterRule>{reason}</FooterRule>}
    </>
  );
}

// ── Head CSS ────────────────────────────────────────────────────────────────

/**
 * Class-keyed, because Gmail keeps class selectors in a <style> block but drops
 * the attribute selectors the design prototype used. Everything here is
 * progressive: with <style> stripped the email is still a readable 600px
 * column whose action rows wrap on their own.
 */
function headCss(): string {
  return `
@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 700;font-display:swap;src:url('${emailFontUrl('fraunces-latin-var.woff2')}') format('woff2');}
@font-face{font-family:'Inter';font-style:normal;font-weight:400 700;font-display:swap;src:url('${emailFontUrl('inter-latin-var.woff2')}') format('woff2');}
a{color:${c.link};}
@media (max-width:480px){
  .fm-outer{padding:16px 0 24px !important;}
  .fm-card{width:100% !important;border-radius:0 !important;}
  .fm-pad{padding-left:16px !important;padding-right:16px !important;}
  .fm-release{white-space:normal !important;}
  .fm-stack{display:block !important;width:100% !important;text-align:left !important;padding-left:0 !important;}
  .fm-stack-gap{padding-top:14px !important;}
  .fm-action{display:block !important;width:100% !important;padding-right:0 !important;}
  .fm-btn{display:block !important;text-align:center !important;}
  .fm-photo{width:100% !important;height:96px !important;}
  .fm-mark{width:30px !important;height:30px !important;}
  .fm-h1{font-size:24px !important;}
}`;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: c.canvas,
  fontFamily: sans,
  color: c.ink,
  margin: 0,
  padding: 0,
  WebkitTextSizeAdjust: '100%',
};

const cardStyle: React.CSSProperties = {
  maxWidth: '600px',
  width: '100%',
  margin: '0 auto',
  backgroundColor: c.card,
  border: `1px solid ${c.border}`,
  borderRadius: '14px',
  overflow: 'hidden',
  borderCollapse: 'separate',
};
