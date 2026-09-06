import { Body, Container, Head, Hr, Html, Preview, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';

/**
 * A human reply from the platform support inbox.
 *
 * Deliberately NOT wrapped in `EmailLayout`, which every other template uses.
 * EmailLayout requires `branding: CommunityBranding` with a mandatory
 * `communityName` and paints community-notification chrome — an accent stripe,
 * a logo cell, a card border and a "Powered by PropertyPro Florida" footer.
 * There is no community here: the correspondent is usually not a member of one.
 * Passing a synthetic `{ communityName: 'PropertyPro' }` would be a type-level
 * lie that renders the brand twice, and association branding on a one-to-one
 * reply reads as automated — the opposite of what a support answer must read
 * as.
 *
 * No unsubscribe link and no postal block, both correct: this is a reply to a
 * message the recipient sent us, so it is transactional. `buildHeaders()` only
 * demands a List-Unsubscribe URL for `category: 'non-transactional'`.
 *
 * The quoted original is plain text, `>`-prefixed and truncated. Never the
 * sender's HTML: that is attacker-controlled markup, and echoing it back into
 * an outbound message would make us the delivery vehicle for it.
 */
export interface SupportReplyEmailProps {
  /** The operator's reply, as typed. Rendered pre-wrapped, never as HTML. */
  bodyText: string;
  /** Plain text of the message being answered, already truncated. */
  quotedText?: string;
  /** The mailbox this thread belongs to, e.g. `support@getpropertypro.com`. */
  mailboxAddress: string;
}

const QUOTE_PREFIX = '> ';

/** `>`-prefix every line, the way every mail client renders a quote. */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `${QUOTE_PREFIX}${line}`)
    .join('\n');
}

export function SupportReplyEmail({
  bodyText,
  quotedText,
  mailboxAddress,
}: SupportReplyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{bodyText.slice(0, 120)}</Preview>
      <Body
        style={{
          backgroundColor: emailColors.surfaceCard,
          color: emailColors.textPrimary,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container style={{ maxWidth: '580px', margin: '0 auto', padding: '0 24px' }}>
          <Text
            style={{
              fontSize: '15px',
              lineHeight: '24px',
              color: emailColors.textPrimary,
              // The operator typed line breaks and expects to see them. Without
              // this the whole reply collapses into one paragraph.
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {bodyText}
          </Text>

          <Hr style={{ borderColor: emailColors.borderDefault, margin: '24px 0 16px' }} />

          <Text
            style={{
              fontSize: '13px',
              lineHeight: '20px',
              color: emailColors.textSecondary,
              margin: 0,
            }}
          >
            PropertyPro Support
            <br />
            {mailboxAddress}
          </Text>

          {quotedText ? (
            <Text
              style={{
                fontSize: '13px',
                lineHeight: '20px',
                color: emailColors.textTertiary,
                whiteSpace: 'pre-wrap',
                borderLeft: `2px solid ${emailColors.borderDefault}`,
                paddingLeft: '12px',
                marginTop: '20px',
              }}
            >
              {quote(quotedText)}
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
