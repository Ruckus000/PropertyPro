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
    // Legacy management name still resolves to the manager admin row.
    expect(getIdleTimeoutMs('property_manager_admin')).toBe(THIRTY_MIN);
  });

  it('gives residents / owners / tenants the 60-minute timeout', () => {
    expect(getIdleTimeoutMs('resident')).toBe(SIXTY_MIN);
    expect(getIdleTimeoutMs('owner')).toBe(SIXTY_MIN);
    expect(getIdleTimeoutMs('tenant')).toBe(SIXTY_MIN);
  });

  it('does not treat a board designation as an admin role', () => {
    // Board status is orthogonal to the role (ADR-006) and must not shorten the
    // timeout on its own — these legacy names resolve to no matrix row.
    expect(getIdleTimeoutMs('board_member')).toBe(SIXTY_MIN);
    expect(getIdleTimeoutMs('board_president')).toBe(SIXTY_MIN);
  });

  it('falls back to 60 min for the dropped legacy admin names', () => {
    // cam / site_manager are unreachable in production, but the defensive path
    // resolves them to no matrix row → the safe 60-min default.
    expect(getIdleTimeoutMs('cam')).toBe(SIXTY_MIN);
    expect(getIdleTimeoutMs('site_manager')).toBe(SIXTY_MIN);
  });

  it('defaults to the 60-minute timeout for a null (unknown) role', () => {
    expect(getIdleTimeoutMs(null)).toBe(SIXTY_MIN);
  });
});
