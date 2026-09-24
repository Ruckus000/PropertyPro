import { Body, Head, Html, Preview } from '@react-email/components';
import { emailTheme as c, sans } from '../components/theme';

/**
 * Layout P9 · Support reply — the deliberate exception. Answer a person, and
 * read like a person answering.
 *
 * Deliberately NOT wrapped in `EmailLayout`, which every other template uses:
 * no accent rule, no masthead, no footer. EmailLayout requires
 * `branding: CommunityBranding` with a mandatory `communityName` and paints
 * product chrome. There is no community here: the correspondent is usually not
 * a member of one. Passing a synthetic `{ communityName: 'PropertyPro' }`
 * would be a type-level lie that renders the brand twice, and product chrome on
 * a one-to-one reply reads as automated — the opposite of what a support
 * answer must read as. It shares only the Florida Modern type and surface
 * tokens: sand canvas, one card, zinc ink.
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
  /** Display name for the mailbox this reply is sent from. */
  mailboxName: string;
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

export function SupportReplyEmail({ bodyText, quotedText, mailboxName, mailboxAddress }: SupportReplyEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{bodyText.slice(0, 120)}</Preview>
      <Body
        style={{
          backgroundColor: c.canvas,
          color: c.ink,
          fontFamily: sans,
          margin: 0,
          padding: 0,
          WebkitTextSizeAdjust: '100%',
        }}
      >
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: c.canvas }}>
          <tbody>
            <tr>
              <td style={{ padding: '32px 12px 40px' }}>
                <table
                  role="presentation"
                  width="100%"
                  align="center"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    maxWidth: '600px',
                    margin: '0 auto',
                    backgroundColor: c.card,
                    border: `1px solid ${c.border}`,
                    borderRadius: '14px',
                    borderCollapse: 'separate',
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: '34px 30px 38px', fontFamily: sans }}>
                        <div
                          style={{
                            fontSize: '16px',
                            lineHeight: 1.7,
                            color: c.ink,
                            // The operator typed line breaks and expects to see them. Without
                            // this the whole reply collapses into one paragraph.
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            margin: '0 0 20px 0',
                          }}
                        >
                          {bodyText}
                        </div>

                        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: '16px' }}>
                          <div style={{ fontSize: '13px', lineHeight: 1.5, color: c.ink, fontWeight: 600 }}>{mailboxName}</div>
                          <div style={{ fontSize: '13px', lineHeight: 1.5, color: c.body, marginTop: '2px' }}>{mailboxAddress}</div>
                        </div>

                        {quotedText ? (
                          <div style={{ borderLeft: `2px solid ${c.border}`, paddingLeft: '14px', marginTop: '22px' }}>
                            <div
                              style={{
                                fontSize: '13px',
                                lineHeight: 1.7,
                                color: c.body,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {quote(quotedText)}
                            </div>
                          </div>
                        ) : null}
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
