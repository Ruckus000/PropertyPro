import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from '@react-email/components';
import type { CommunityBranding } from '../types';
import { emailColors } from '@propertypro/tokens/email';

interface EmailLayoutProps {
  branding: CommunityBranding;
  previewText?: string;
  /** Override the accent stripe color. Defaults to the brand coral (#C2533A). */
  accentColor?: string;
  children: React.ReactNode;
}

export function EmailLayout({
  branding,
  previewText,
  accentColor,
  children,
}: EmailLayoutProps) {
  const stripe = accentColor ?? branding.accentColor ?? emailColors.accentBrand;

  return (
    <Html>
      <Head />
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={bodyStyle}>
        <Container style={outerStyle}>
          <table
            width="580"
            cellPadding={0}
            cellSpacing={0}
            style={cardStyle}
          >
            <tbody>
              {/* Accent stripe */}
              <tr>
                <td style={{ height: '2px', backgroundColor: stripe, fontSize: 0, lineHeight: 0 }}>
                  &nbsp;
                </td>
              </tr>

              {/* Header */}
              <tr>
                <td style={headerStyle}>
                  <table cellPadding={0} cellSpacing={0}>
                    <tbody>
                      <tr>
                        {branding.logoUrl && (
                          <td style={{ paddingRight: '10px', verticalAlign: 'middle' }}>
                            <Img
                              src={branding.logoUrl}
                              alt={`${branding.communityName} logo`}
                              width="28"
                              height="28"
                              style={{ borderRadius: '4px' }}
                            />
                          </td>
                        )}
                        <td style={{ verticalAlign: 'middle' }}>
                          <Text style={communityNameStyle}>
                            {branding.communityName}
                          </Text>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              {/* Content */}
              <tr>
                <td style={contentStyle}>{children}</td>
              </tr>

              {/* Footer */}
              <tr>
                <td style={footerStyle}>
                  <Text style={footerTextStyle}>
                    &copy; {new Date().getFullYear()} {branding.communityName}{' '}
                    &middot; Powered by PropertyPro Florida
                  </Text>

                  {/*
                    CAN-SPAM sender postal address. The sender is the
                    ASSOCIATION, so this is the community's own mailing address,
                    not PropertyPro's. Rendered only when the caller supplied a
                    complete one — a partial address is worse than none.
                  */}
                  {branding.postalAddressLines && branding.postalAddressLines.length > 0 && (
                    <Text style={addressStyle}>
                      {branding.communityName}
                      {branding.postalAddressLines.map((line, index) => (
                        <span key={index}>
                          <br />
                          {line}
                        </span>
                      ))}
                    </Text>
                  )}

                  {/*
                    Visible opt-out. The List-Unsubscribe HEADER is set by
                    `sendEmail` and is what Gmail's one-click button uses; this
                    is the in-body link CAN-SPAM asks for, for readers whose
                    client shows no button.
                  */}
                  {branding.unsubscribeUrl && (
                    <Text style={addressStyle}>
                      <Link href={branding.unsubscribeUrl} style={unsubscribeLinkStyle}>
                        {branding.unsubscribeLabel ?? 'Unsubscribe'}
                      </Link>
                    </Text>
                  )}

                  {branding.customEmailFooter && (
                    <Text style={customFooterStyle}>
                      {branding.customEmailFooter}
                    </Text>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: emailColors.muted,
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const outerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '24px 0',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: emailColors.background,
  borderRadius: '8px',
  overflow: 'hidden',
  border: `1px solid ${emailColors.border}`,
};

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: `1px solid ${emailColors.border}`,
};

const communityNameStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: emailColors.foreground,
  letterSpacing: '-0.2px',
  margin: 0,
};

const contentStyle: React.CSSProperties = {
  padding: '28px 24px 32px',
};

const footerStyle: React.CSSProperties = {
  borderTop: `1px solid ${emailColors.border}`,
  padding: '16px 24px',
  textAlign: 'center' as const,
};

const footerTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: emailColors.footerText,
  margin: 0,
};

const addressStyle: React.CSSProperties = {
  fontSize: '12px',
  color: emailColors.footerText,
  margin: '8px 0 0 0',
  lineHeight: 1.5,
};

const unsubscribeLinkStyle: React.CSSProperties = {
  color: emailColors.footerText,
  textDecoration: 'underline',
};

const customFooterStyle: React.CSSProperties = {
  fontSize: '12px',
  color: emailColors.mutedForeground,
  margin: '4px 0 0 0',
};
