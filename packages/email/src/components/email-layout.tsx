import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import type { CommunityBranding } from "../types";

interface EmailLayoutProps {
  branding: CommunityBranding;
  previewText?: string;
  children: React.ReactNode;
}

export function EmailLayout({
  branding,
  previewText,
  children,
}: EmailLayoutProps) {
  const accent = branding.accentColor ?? "#2563eb";

  return (
    <Html>
      <Head />
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle(accent)}>
            {branding.logoUrl && (
              <Img
                src={branding.logoUrl}
                alt={`${branding.communityName} logo`}
                width="48"
                height="48"
                style={logoStyle}
              />
            )}
            <Text style={communityNameStyle}>{branding.communityName}</Text>
          </Section>

          <Section style={contentStyle}>{children}</Section>

          <Hr style={hrStyle} />

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              &copy; {new Date().getFullYear()} {branding.communityName}. All
              rights reserved.
            </Text>
            <Text style={footerTextStyle}>
              Powered by PropertyPro Florida
            </Text>
            {branding.customEmailFooter && (
              <Text style={customFooterTextStyle}>
                {branding.customEmailFooter}
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  overflow: "hidden",
};

function headerStyle(accent: string): React.CSSProperties {
  return {
    backgroundColor: accent,
    padding: "24px",
    textAlign: "center" as const,
  };
}

const logoStyle: React.CSSProperties = {
  margin: "0 auto 8px auto",
  borderRadius: "4px",
};

const communityNameStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: "bold",
  margin: 0,
};

const contentStyle: React.CSSProperties = {
  padding: "32px 24px",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "0 24px",
};

const footerStyle: React.CSSProperties = {
  padding: "16px 24px",
  textAlign: "center" as const,
};

const footerTextStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "4px 0",
};

const customFooterTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "8px 0 0 0",
  fontStyle: "italic",
};
