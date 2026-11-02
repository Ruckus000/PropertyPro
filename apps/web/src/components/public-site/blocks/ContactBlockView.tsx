/**
 * ContactBlockView — presentational half of the contact block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 *
 * Three cards, each shown only when it has something to say:
 *   - Management: the name, email and phone from `communities.contact_*`;
 *   - Address, or Office once office hours are set: the address and hours from the
 *     Community profile. The address on file is the property's location, and a card
 *     called "Office" can read as "there is an office here"; hours are what make it
 *     one;
 *   - Board: the roster.
 * Every row inside a card is left out when its value is blank. The management
 * section shows only `communities.contact_*` fields (`contact_email` is the only
 * email this section may ever show) and the board roster intentionally exposes
 * names and public titles only — that boundary is enforced by the reader, not
 * here, but do not widen what this renders.
 *
 * With nothing at all, this view keeps its placeholder, because the editor canvas
 * renders it directly and a manager needs to see where an empty section sits. The
 * public site never reaches that branch: the shell checks `contactHasContent`
 * first and renders nothing (D14).
 */
import type { ContactBlockContent } from '@propertypro/shared';
import type { PublicContactInfo } from '@/lib/db/public-community-reader';
import type { BlockViewProps } from './types';
import { SiteSection, SiteSectionEmpty } from './SiteSection';

/** One group of contact details: a hairline above, a small title, the details. */
const GROUP = 'border-t border-edge py-5';
const GROUP_TITLE = 'text-sm font-semibold uppercase tracking-widest text-content-secondary';
const LINK = 'font-semibold text-primary underline-offset-4 hover:underline';

function hasContact(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The management contact, or null when it is absent or every field in it is blank. */
function managementWithDetails(
  management: PublicContactInfo['management'],
): NonNullable<PublicContactInfo['management']> | null {
  if (management === null) return null;
  return hasContact(management.name) || hasContact(management.email) || hasContact(management.phone)
    ? management
    : null;
}

/**
 * Whether there is anything for this section to show. The one definition, so the
 * shell that decides whether to render at all and the view that decides what to
 * draw cannot disagree.
 */
export function contactHasContent(data: PublicContactInfo): boolean {
  return (
    managementWithDetails(data.management) !== null
    || hasContact(data.address)
    || hasContact(data.officeHours)
    || data.board.length > 0
  );
}

export type ContactBlockViewProps = BlockViewProps<ContactBlockContent, PublicContactInfo>;

export function ContactBlockView({ blockId, data, anchorId }: ContactBlockViewProps) {
  const management = managementWithDetails(data.management);
  const hasAddress = hasContact(data.address);
  const hasOfficeHours = hasContact(data.officeHours);
  const hasOffice = hasAddress || hasOfficeHours;
  const hasBoard = data.board.length > 0;
  // "Office" only once there are hours; until then the card is just the address.
  const officeTitle = hasOfficeHours ? 'Office' : 'Address';

  return (
    <SiteSection id={anchorId} headingId={`contact-${blockId}`} title="Contact">
      {!contactHasContent(data) ? (
        <SiteSectionEmpty>Contact information will be posted here soon.</SiteSectionEmpty>
      ) : (
        <div className="grid gap-x-12 site-sm:grid-cols-2">
          {management && (
            <section className={GROUP} aria-label="Management contact">
              <h3 className={GROUP_TITLE}>Management</h3>
              <dl className="mt-3 space-y-3 text-base">
                {hasContact(management.name) && (
                  <div>
                    <dt className="sr-only">Name</dt>
                    <dd className="font-semibold text-content">{management.name}</dd>
                  </div>
                )}
                {hasContact(management.email) && (
                  <div>
                    <dt className="text-sm text-content-secondary">Email</dt>
                    <dd>
                      <a className={LINK} href={`mailto:${management.email}`}>
                        {management.email}
                      </a>
                    </dd>
                  </div>
                )}
                {hasContact(management.phone) && (
                  <div>
                    <dt className="text-sm text-content-secondary">Phone</dt>
                    <dd>
                      <a className={LINK} href={`tel:${management.phone}`}>
                        {management.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
          {hasOffice && (
            <section className={GROUP} aria-label={officeTitle}>
              <h3 className={GROUP_TITLE}>{officeTitle}</h3>
              {hasOfficeHours ? (
                <dl className="mt-3 space-y-3 text-base text-content">
                  {hasAddress && (
                    <div>
                      <dt className="text-sm text-content-secondary">Address</dt>
                      <dd>{data.address}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm text-content-secondary">Office hours</dt>
                    {/* A manager may type a line per day; keep their breaks. */}
                    <dd className="whitespace-pre-line">{data.officeHours}</dd>
                  </div>
                </dl>
              ) : (
                // Titled "Address" already, so no row label repeats it.
                <p className="mt-3 text-base text-content">{data.address}</p>
              )}
            </section>
          )}
          {hasBoard && (
            <section className={GROUP} aria-label="Board roster">
              <h3 className={GROUP_TITLE}>Board</h3>
              <ul className="mt-3 space-y-3">
                {data.board.map((member) => (
                  <li key={`${member.title}-${member.name}`}>
                    <p className="text-base font-semibold text-content">{member.name}</p>
                    <p className="text-sm text-content-secondary">{member.title}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </SiteSection>
  );
}
