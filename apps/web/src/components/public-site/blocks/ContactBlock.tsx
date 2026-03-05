import type { CommunityTheme } from '@propertypro/theme';
import type { ContactBlockContent } from '@propertypro/shared';

interface ContactBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Contact block — static render from content fields showing community
 * contact information (email, phone, address, management company).
 */
export function ContactBlock({ content, theme }: ContactBlockProps) {
  const c = content as unknown as ContactBlockContent;

  const hasContent = c.boardEmail || c.phone || c.address || c.managementCompany;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-2xl font-bold mb-6"
          style={{
            color: theme.primaryColor,
            fontFamily: `'${theme.fontHeading}', sans-serif`,
          }}
        >
          Contact Us
        </h2>
        {!hasContent ? (
          <p className="text-gray-500">Contact information coming soon.</p>
        ) : (
          <div
            className="grid gap-6 sm:grid-cols-2"
            style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
          >
            {c.boardEmail ? (
              <div className="flex items-start gap-3">
                <span className="text-gray-400 mt-0.5" aria-hidden="true">
                  {'\u2709'}
                </span>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Board Email</dt>
                  <dd>
                    <a
                      href={`mailto:${c.boardEmail}`}
                      className="text-gray-900 hover:underline"
                    >
                      {c.boardEmail}
                    </a>
                  </dd>
                </div>
              </div>
            ) : null}
            {c.phone ? (
              <div className="flex items-start gap-3">
                <span className="text-gray-400 mt-0.5" aria-hidden="true">
                  {'\u260E'}
                </span>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd>
                    <a
                      href={`tel:${c.phone}`}
                      className="text-gray-900 hover:underline"
                    >
                      {c.phone}
                    </a>
                  </dd>
                </div>
              </div>
            ) : null}
            {c.address ? (
              <div className="flex items-start gap-3">
                <span className="text-gray-400 mt-0.5" aria-hidden="true">
                  {'\u{1F3E0}'}
                </span>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Address</dt>
                  <dd className="text-gray-900 whitespace-pre-line">{c.address}</dd>
                </div>
              </div>
            ) : null}
            {c.managementCompany ? (
              <div className="flex items-start gap-3">
                <span className="text-gray-400 mt-0.5" aria-hidden="true">
                  {'\u{1F3E2}'}
                </span>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Management Company</dt>
                  <dd className="text-gray-900">{c.managementCompany}</dd>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
