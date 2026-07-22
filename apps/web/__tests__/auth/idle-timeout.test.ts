/**
 * Unit test — idle-session timeout tiering (`getIdleTimeoutMs`).
 *
 * Locks in the role → timeout mapping and guards the regression that shipped
 * silently before: management-tier users were compared against `ADMIN_ROLES`
 * (a MatrixRole value) directly, so the check never matched and admins fell
 * through to the 60-min resident timeout instead of the intended 30 min.
 * Routing through `isAdminRole` fixes it — these cases would have caught the bug.
 */
import { describe, expect, it } from 'vitest';

import { getIdleTimeoutMs } from '../../src/components/auth/idle-timeout';

const THIRTY_MIN = 30 * 60 * 1000;
const SIXTY_MIN = 60 * 60 * 1000;

describe('getIdleTimeoutMs', () => {
  it('gives the management tier the 30-minute admin timeout', () => {
    expect(getIdleTimeoutMs('property_manager')).toBe(THIRTY_MIN);
    expect(getIdleTimeoutMs('root_manager')).toBe(THIRTY_MIN);
  });

  it('gives residents the 60-minute timeout', () => {
    // resident covers both owner and tenant (distinguished by isUnitOwner, which
    // does not shorten the idle window — only the management tier does).
    expect(getIdleTimeoutMs('resident')).toBe(SIXTY_MIN);
  });

  it('defaults to the 60-minute timeout for a null (unknown) role', () => {
    expect(getIdleTimeoutMs(null)).toBe(SIXTY_MIN);
  });
});
