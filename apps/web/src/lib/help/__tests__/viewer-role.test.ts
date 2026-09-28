import { describe, expect, it } from 'vitest';
import { isVisibleToAudience, resolveHelpViewerTokens } from '../viewer-role';

/**
 * Roadmap 2.8. A viewer is a SET of audiences: one base audience plus the
 * board designation. Revert-check: drop the designation branch from
 * resolveHelpViewerTokens and the three "board" cases go red while the base
 * cases stay green.
 */
describe('resolveHelpViewerTokens', () => {
  it('maps residents to owner / tenant by isUnitOwner', () => {
    expect(resolveHelpViewerTokens({ role: 'resident', isUnitOwner: true })).toEqual(['owner']);
    expect(resolveHelpViewerTokens({ role: 'resident', isUnitOwner: false })).toEqual(['tenant']);
  });

  it('maps both management roles to manager', () => {
    expect(resolveHelpViewerTokens({ role: 'property_manager' })).toEqual(['manager']);
    expect(resolveHelpViewerTokens({ role: 'root_manager' })).toEqual(['manager']);
  });

  it('board: a designated resident keeps their base audience AND gains the designation', () => {
    // The old resolver returned plain 'owner' here — the designation was read
    // only for property managers, so no resident ever matched a board tag.
    expect(
      resolveHelpViewerTokens({ role: 'resident', isUnitOwner: true, designation: 'board_member' }),
    ).toEqual(['owner', 'board_member']);
    expect(
      resolveHelpViewerTokens({ role: 'resident', isUnitOwner: false, designation: 'board_president' }),
    ).toEqual(['tenant', 'board_president']);
  });

  it('board: a designated manager stays a manager (the old resolver returned the designation ALONE)', () => {
    expect(
      resolveHelpViewerTokens({ role: 'property_manager', designation: 'board_member' }),
    ).toEqual(['manager', 'board_member']);
  });

  it('ignores a designation that is not a board designation', () => {
    expect(
      resolveHelpViewerTokens({ role: 'resident', isUnitOwner: true, designation: 'treasurer' }),
    ).toEqual(['owner']);
  });
});

describe('isVisibleToAudience', () => {
  it('shows untagged content to everyone, including an empty viewer', () => {
    expect(isVisibleToAudience([], [])).toBe(true);
    expect(isVisibleToAudience(null, ['tenant'])).toBe(true);
  });

  it('board: a board owner sees owner-tagged AND board-tagged content', () => {
    const boardOwner = ['owner', 'board_member'];
    expect(isVisibleToAudience(['owner'], boardOwner)).toBe(true);
    expect(isVisibleToAudience(['manager', 'board_member'], boardOwner)).toBe(true);
    expect(isVisibleToAudience(['manager'], boardOwner)).toBe(false);
  });

  it('retired tokens match nobody (the schema rejects them at load)', () => {
    expect(isVisibleToAudience(['pm_admin'], ['manager'])).toBe(false);
  });
});
