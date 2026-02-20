/**
 * Onboarding wizard state table — P2-38
 *
 * Tracks multi-step onboarding progress per community (scoped by communityId + wizardType).
 * Designed to be resumable: stores step data as JSONB and tracks last completed step.
 *
 * Unique constraint: one wizard state per (communityId, wizardType).
 * Multiple admins share the same wizard state for their community.
 */
import { bigint, bigserial, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const onboardingWizardState = pgTable(
  'onboarding_wizard_state',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Type of wizard (e.g., 'apartment'). Allows for future condo/HOA wizards. */
    wizardType: text('wizard_type').notNull(),
    /** Current wizard lifecycle state: 'in_progress', 'skipped', or 'completed'. Skip is reversible. */
    status: text('status').notNull().default('in_progress'),
    /** Last successfully completed step index (0-based). Null = not started. */
    lastCompletedStep: integer('last_completed_step'),
    /**
     * Step data JSONB payload structure (for apartment wizard):
     * {
     *   profile: { name, addressLine1, addressLine2, city, state, zipCode, timezone, logoPath? },
     *   units: [{ unitNumber, floor?, bedrooms?, bathrooms?, sqft?, rentAmount? }],
     *   rules: { documentId, path } | null,
     *   invite: { email, fullName, unitNumber } | null,
     *   completionMarkers: { unitsCreated?: boolean, residentCreated?: boolean, inviteCreated?: boolean }
     * }
     */
    stepData: jsonb('step_data').notNull().default('{}'),
    /** When the wizard was marked 'completed' (terminal state). Null if still in progress or skipped. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('onboarding_wizard_state_community_type_unique').on(
      table.communityId,
      table.wizardType,
    ),
  ],
);
