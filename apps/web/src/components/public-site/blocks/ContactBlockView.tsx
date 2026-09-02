/**
 * ContactBlockView — presentational half of the contact block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 *
 * The management section shows only `communities.contact_*` fields and the board
 * roster intentionally exposes names and public titles only — that boundary is
 * enforced by the reader, not here, but do not widen what this renders.
 */
import type { ContactBlockContent } from '@propertypro/shared';
import type { PublicContactInfo } from '@/lib/db/public-community-reader';
import type { BlockViewProps } from './types';

function hasContact(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export type ContactBlockViewProps = BlockViewProps<ContactBlockContent, PublicContactInfo>;

export function ContactBlockView({ blockId, data }: ContactBlockViewProps) {
  const hasManagement = data.management !== null;
  const hasBoard = data.board.length > 0;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`contact-${blockId}`}>
      <div className="mx-auto max-w-3xl">
        <h2
          id={`contact-${blockId}`}
          className="mb-6 font-heading text-2xl font-semibold text-content"
        >
          Contact
        </h2>
        {!hasManagement && !hasBoard ? (
          <p className="rounded-md border border-edge bg-surface-card p-4 text-sm text-content-secondary">
            Contact information will be posted here soon.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {hasManagement && data.management && (
              <section
                className="rounded-md border border-edge bg-surface-card p-5"
                aria-label="Management contact"
              >
                <h3 className="text-lg font-medium text-content">Management</h3>
                <dl className="mt-3 space-y-2 text-sm text-content-secondary">
                  {hasContact(data.management.name) && (
                    <div>
                      <dt className="font-medium text-content">Name</dt>
                      <dd>{data.management.name}</dd>
                    </div>
                  )}
                  {hasContact(data.management.email) && (
                    <div>
                      <dt className="font-medium text-content">Email</dt>
                      <dd>
                        <a
                          className="text-interactive hover:underline"
                          href={`mailto:${data.management.email}`}
                        >
                          {data.management.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  {hasContact(data.management.phone) && (
                    <div>
                      <dt className="font-medium text-content">Phone</dt>
                      <dd>
                        <a
                          className="text-interactive hover:underline"
                          href={`tel:${data.management.phone}`}
                        >
                          {data.management.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
            {hasBoard && (
              <section
                className="rounded-md border border-edge bg-surface-card p-5"
                aria-label="Board roster"
              >
                <h3 className="text-lg font-medium text-content">Board</h3>
                <ul className="mt-3 space-y-3">
                  {data.board.map((member) => (
                    <li key={`${member.title}-${member.name}`}>
                      <p className="text-sm font-medium text-content">{member.name}</p>
                      <p className="text-xs text-content-secondary">{member.title}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
