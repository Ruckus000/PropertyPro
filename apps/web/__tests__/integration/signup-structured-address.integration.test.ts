/**
 * Integration test: signup structured address persistence.
 *
 * Exercises the pending_signups write path against the migrated database
 * shape. This catches deploys where app code expects structured address
 * columns before the target DB has applied migration 0145.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type PendingSignupStructuredAddressColumn,
  REQUIRED_PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMNS,
} from '@/lib/auth/pending-signups-schema';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('signup structured address integration tests');

const describeDb = getDescribeDb();

let state: TestKitState | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

describeDb('signup structured address persistence', () => {
  beforeAll(async () => {
    state = await initTestKit();
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
      state = null;
    }
  });

  it('persists structured address fields on pending_signups', async () => {
    const s = requireState();
    const suffix = randomUUID().slice(0, 8);
    const email = `structured-address-${suffix}@example.com`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    try {
      const [inserted] = await s.sqlClient<{
        address_line_1: string;
        city: string;
        state: string;
        zip_code: string;
        status: string;
      }[]>`
        insert into pending_signups (
          signup_request_id,
          auth_user_id,
          primary_contact_name,
          email,
          email_normalized,
          community_name,
          address,
          address_line_1,
          city,
          state,
          zip_code,
          county,
          unit_count,
          community_type,
          plan_key,
          candidate_slug,
          terms_accepted_at,
          status,
          payload,
          updated_at,
          expires_at
        ) values (
          ${randomUUID()},
          null,
          ${'Structured Address Tester'},
          ${email},
          ${email},
          ${`Structured Address ${suffix}`},
          ${'123 W Park Ave, West Palm Beach, FL 33409'},
          ${'123 W Park Ave'},
          ${'West Palm Beach'},
          ${'FL'},
          ${'33409'},
          ${'Palm Beach'},
          ${12},
          ${'condo_718'},
          ${'essentials'},
          ${`structured-address-${suffix}`},
          ${now}::timestamptz,
          ${'pending_verification'},
          ${JSON.stringify({
            source: 'signup-structured-address.integration.test',
          })}::jsonb,
          ${now}::timestamptz,
          ${expiresAt}::timestamptz
        )
        returning address_line_1, city, state, zip_code, status
      `;

      const expectedStructured: Record<PendingSignupStructuredAddressColumn, string> = {
        address_line_1: '123 W Park Ave',
        city: 'West Palm Beach',
        state: 'FL',
        zip_code: '33409',
      };
      for (const col of REQUIRED_PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMNS) {
        expect(inserted).toHaveProperty(col, expectedStructured[col]);
      }
      expect(inserted).toMatchObject({ status: 'pending_verification' });
    } finally {
      await s.sqlClient`
        delete from pending_signups
        where email_normalized = ${email}
      `;
    }
  });
});
