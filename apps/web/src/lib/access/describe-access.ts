import {
  MATRIX_ROLES,
  RBAC_MATRIX,
  type CommunityType,
  type RbacResource,
} from '@propertypro/shared';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';

/** What a resident's read covers. The matrix cannot express this, so the page states it. */
export type ResidentScope = 'all' | 'own' | 'sent-to-them';

type Capability = 'write' | 'read' | 'none';

const OBJECT: Record<ResidentScope, string> = {
  all: 'them',
  own: 'only their own',
  'sent-to-them': 'only the ones sent to them',
};

function capabilityOf(
  communityType: CommunityType,
  role: (typeof MATRIX_ROLES)[number],
  resource: RbacResource,
): Capability {
  const cell = RBAC_MATRIX[communityType][role][resource];
  return cell.write ? 'write' : cell.read ? 'read' : 'none';
}

function residentSentence(name: string, capability: Capability, object: string): string | null {
  if (capability === 'write') return `${name} can add and change ${object}.`;
  if (capability === 'read') return `${name} can see ${object}.`;
  return null;
}

/**
 * Builds the "About" sentence for a page from the permission matrix, so the
 * words cannot drift from what the server enforces. A role that cannot read is
 * never named. This is the one place allowed to cast a string to AccessSentence.
 */
export function describeAccess(
  communityType: CommunityType,
  resource: RbacResource,
  residentScope: ResidentScope = 'all',
): AccessSentence {
  const manager = capabilityOf(communityType, 'manager', resource);
  const owner = capabilityOf(communityType, 'owner', resource);
  const tenant = capabilityOf(communityType, 'tenant', resource);
  const object = OBJECT[residentScope];

  const parts: Array<string | null> = [];
  if (manager === 'write') parts.push('Managers can add and change these.');
  else if (manager === 'read') parts.push('Managers can see these.');

  if (owner === tenant) {
    parts.push(residentSentence('Residents', owner, object));
  } else {
    parts.push(residentSentence('Owners', owner, object));
    parts.push(residentSentence('Tenants', tenant, object));
  }
  return parts.filter((part): part is string => part !== null).join(' ') as AccessSentence;
}
