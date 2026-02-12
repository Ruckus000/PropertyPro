/**
 * Invitations table - tracks invite tokens for onboarding.
 * One-time-use tokens with expiration, scoped by community.
 */
import { bigint, bigserial, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { communities } from "./communities";
import { users } from "./users";

export const invitations = pgTable(
  "invitations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    communityId: bigint("community_id", { mode: "number" })
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Random token string used in invite links (unguessable)
    token: text("token").notNull(),
    // Expiration timestamp (UTC)
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // When the token was consumed (one-time use)
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    tokenUnique: uniqueIndex("invitations_token_unique").on(table.token),
  }),
);
