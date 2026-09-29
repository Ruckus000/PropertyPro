/**
 * Resident contacts — Leases v3 (E11): people on a lease who have no login.
 *
 * WHY a separate table instead of making `users.email` nullable: `users.id`
 * mirrors Supabase `auth.users.id`, so every `users` row IS a login account.
 * A resident with no email address has no account to create, and relaxing the
 * constraint would ripple into sign-in, invitations and every notification
 * path. A contact is community-scoped, never signs in, and receives notices by
 * mail or hand delivery. When they later get an email address, inviting them
 * creates a real user and `linked_user_id` records the hand-over; the contact
 * row stays so the lease history keeps pointing at the same person.
 *
 * Gated per community by `communities.community_settings.leasesAllowResidentsWithoutEmail`
 * (default off). The table exists either way so turning the option on needs no
 * migration.
 */
import { bigint, bigserial, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { users } from './users';

export const residentContacts = pgTable(
  'resident_contacts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    /** Where written notices (§83.49, §83.57, §83.575) are mailed. */
    mailingAddress: text('mailing_address'),
    /** How notices reach this person: 'mail' | 'hand'. */
    noticeDelivery: text('notice_delivery').$type<'mail' | 'hand'>().notNull().default('mail'),
    /** Set once the contact has been invited and now has a login. */
    linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('resident_contacts_community_idx').on(table.communityId),
    uniqueIndex('resident_contacts_id_community_uq').on(table.id, table.communityId),
    check('resident_contacts_notice_delivery', sql`${table.noticeDelivery} IN ('mail', 'hand')`),
    check('resident_contacts_full_name_present', sql`char_length(btrim(${table.fullName})) > 0`),
  ],
);
