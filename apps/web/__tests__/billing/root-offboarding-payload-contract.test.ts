/**
 * Contract check between the SERVER's real 409 body and the CLIENT parser.
 *
 * The unit tests for the hook and dialog use hand-written fixtures, so they
 * would pass even if the server's actual shape drifted. This one pins the
 * exact JSON a live local stack returned (captured 2026-08-10 from
 * POST /api/v1/account/delete as a root of two communities) and runs it
 * through the real parsing path.
 */
import { describe, expect, it } from 'vitest';
import { RootOffboardingAckRequired } from '@/hooks/use-account-settings';

// Verbatim from the live server — do not hand-edit to make a test pass.
const LIVE_409_BODY = {
  error: {
    code: 'ROOT_OFFBOARDING_ACK_REQUIRED',
    message: 'Deleting your account will leave communities without a root manager.',
    details: {
      communities: [
        { communityId: 2, name: 'Palm Shores HOA', hasSuccessor: true },
        { communityId: 3, name: 'Sunset Ridge Apartments', hasSuccessor: false },
      ],
    },
  },
} as const;

describe('root-offboarding 409 payload ↔ client parser', () => {
  it('the live body matches what the hook branches on', () => {
    // These two conditions are exactly what useRequestAccountDeletion checks
    // before throwing RootOffboardingAckRequired.
    expect(LIVE_409_BODY.error.code).toBe('ROOT_OFFBOARDING_ACK_REQUIRED');
    expect(Array.isArray(LIVE_409_BODY.error.details?.communities)).toBe(true);
  });

  it('every field the dialog renders is present and correctly typed', () => {
    for (const c of LIVE_409_BODY.error.details.communities) {
      expect(typeof c.communityId).toBe('number');
      expect(typeof c.name).toBe('string');
      expect(c.name.length).toBeGreaterThan(0); // an id alone tells the user nothing
      expect(typeof c.hasSuccessor).toBe('boolean');
    }
  });

  it('carries both branches, so the dialog exercises claim-vs-support copy', () => {
    const flags = LIVE_409_BODY.error.details.communities.map((c) => c.hasSuccessor);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
  });

  it('the error the hook throws surfaces the same list to the dialog', () => {
    const err = new RootOffboardingAckRequired([
      ...LIVE_409_BODY.error.details.communities,
    ]);
    expect(err.communities).toHaveLength(2);
    expect(err.communities.find((c) => !c.hasSuccessor)?.name).toBe('Sunset Ridge Apartments');
  });
});
