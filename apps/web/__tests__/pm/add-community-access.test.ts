/**
 * Who may add a community: the portfolio's billing owner, while root manager
 * of a community in it. With no portfolio yet, the root of the one community
 * they manage starts one.
 */
import { describe, expect, it } from 'vitest';
import {
  decideAddCommunityAccess,
  type AddCommunityFacts,
} from '../../src/lib/pm/add-community-access';

type Role = AddCommunityFacts['managedRoles'][number];

function role(communityId: number, r: 'root_manager' | 'property_manager', billingGroupId: number | null, hasStripeCustomer = true): Role {
  return { communityId, role: r, billingGroupId, hasStripeCustomer };
}

describe('owns a billing group', () => {
  it('may add while root of a community in that group', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [9],
        managedRoles: [role(1, 'property_manager', 9), role(2, 'root_manager', 9)],
      }),
    ).toEqual({ allowed: true, billingGroupId: 9 });
  });

  it('may not when they only manage its communities, without root', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [9],
        managedRoles: [role(1, 'property_manager', 9), role(2, 'property_manager', 9)],
      }),
    ).toEqual({ allowed: false, reason: 'not_root' });
  });

  it('may not when their root is in a community billed to another group', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [9],
        managedRoles: [role(1, 'root_manager', 4), role(2, 'property_manager', 9)],
      }),
    ).toEqual({ allowed: false, reason: 'not_root' });
  });

  it('may not when they own more than one group, since an add could join either', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [9, 10],
        managedRoles: [role(1, 'root_manager', 9)],
      }),
    ).toEqual({ allowed: false, reason: 'several_billing_groups' });
  });
});

describe('owns no billing group', () => {
  it('the root of the one community they manage may start one', () => {
    expect(
      decideAddCommunityAccess({ ownedBillingGroupIds: [], managedRoles: [role(1, 'root_manager', null)] }),
    ).toEqual({ allowed: true, billingGroupId: null });
  });

  it('a property manager of that one community may not', () => {
    expect(
      decideAddCommunityAccess({ ownedBillingGroupIds: [], managedRoles: [role(1, 'property_manager', null)] }),
    ).toEqual({ allowed: false, reason: 'not_root' });
  });

  it('counts communities, not role rows', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [],
        managedRoles: [role(1, 'property_manager', null), role(1, 'root_manager', null)],
      }),
    ).toEqual({ allowed: true, billingGroupId: null });
  });

  it('may not with several communities: there is no one community to start from', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [],
        managedRoles: [role(1, 'root_manager', null), role(2, 'root_manager', null)],
      }),
    ).toEqual({ allowed: false, reason: 'not_billing_owner' });
  });

  it('may not when their community is already billed to someone else’s group', () => {
    expect(
      decideAddCommunityAccess({ ownedBillingGroupIds: [], managedRoles: [role(1, 'root_manager', 4)] }),
    ).toEqual({ allowed: false, reason: 'not_billing_owner' });
  });

  it('may not before their community has billing set up', () => {
    expect(
      decideAddCommunityAccess({
        ownedBillingGroupIds: [],
        managedRoles: [role(1, 'root_manager', null, false)],
      }),
    ).toEqual({ allowed: false, reason: 'no_stripe_customer' });
  });

  it('may not when they manage nothing', () => {
    expect(decideAddCommunityAccess({ ownedBillingGroupIds: [], managedRoles: [] })).toEqual({
      allowed: false,
      reason: 'not_billing_owner',
    });
  });
});
