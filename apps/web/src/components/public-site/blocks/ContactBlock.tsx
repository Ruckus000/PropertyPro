/**
 * ContactBlock — SoR block for public management contact and board roster.
 *
 * The management section uses only communities.contact_* fields. The board
 * roster intentionally exposes names and public titles only.
 */
import { contactBlockSchema, type ContactBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import type { BlockRendererProps } from './types';

function hasContact(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function ContactBlock(props: BlockRendererProps) {
  const parsed = contactBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'contact block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }

  const config: ContactBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const contact = await reader.getContactInfo({
    showBoard: config.showBoard,
    showManagement: config.showManagement,
  });

  const hasManagement = contact.management !== null;
  const hasBoard = contact.board.length > 0;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`contact-${props.block.id}`}>
      <div className="mx-auto max-w-3xl">
        <h2 id={`contact-${props.block.id}`} className="mb-6 font-heading text-2xl font-semibold text-content">
          Contact
        </h2>
        {!hasManagement && !hasBoard ? (
          <p className="rounded-md border border-default bg-surface-card p-4 text-sm text-content-secondary">
            Contact information will be posted here soon.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {hasManagement && contact.management && (
              <section className="rounded-md border border-default bg-surface-card p-5" aria-label="Management contact">
                <h3 className="text-lg font-medium text-content">Management</h3>
                <dl className="mt-3 space-y-2 text-sm text-content-secondary">
                  {hasContact(contact.management.name) && (
                    <div>
                      <dt className="font-medium text-content">Name</dt>
                      <dd>{contact.management.name}</dd>
                    </div>
                  )}
                  {hasContact(contact.management.email) && (
                    <div>
                      <dt className="font-medium text-content">Email</dt>
                      <dd>
                        <a className="text-interactive hover:underline" href={`mailto:${contact.management.email}`}>
                          {contact.management.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  {hasContact(contact.management.phone) && (
                    <div>
                      <dt className="font-medium text-content">Phone</dt>
                      <dd>
                        <a className="text-interactive hover:underline" href={`tel:${contact.management.phone}`}>
                          {contact.management.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
            {hasBoard && (
              <section className="rounded-md border border-default bg-surface-card p-5" aria-label="Board roster">
                <h3 className="text-lg font-medium text-content">Board</h3>
                <ul className="mt-3 space-y-3">
                  {contact.board.map((member) => (
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
