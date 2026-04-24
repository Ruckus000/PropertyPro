import type { SignupAdminType, SignupPlanId } from '@/lib/auth/signup-schema';

export type CommunityTypeKey = 'condo' | 'hoa' | 'apt';

export interface CleanWizardFormState {
  firstName: string;
  lastName: string;
  adminType: SignupAdminType;
  email: string;
  password: string;
  confirmPassword: string;
  communityName: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  communityTypeKey: CommunityTypeKey;
  unitCount: number;
  planKey: SignupPlanId;
  billing: 'monthly' | 'annual';
  candidateSlug: string;
  termsAccepted: boolean;
  subdomainTouched: boolean;
}

export type SignupField =
  | 'primaryContactName'
  | 'adminType'
  | 'email'
  | 'password'
  | 'communityName'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'county'
  | 'unitCount'
  | 'candidateSlug'
  | 'termsAccepted'
  | 'planKey'
  | 'communityType';

export function fieldToStepIndex(field: string): number {
  const account: readonly string[] = ['primaryContactName', 'adminType', 'email', 'password'];
  const community: readonly string[] = [
    'communityName',
    'address',
    'addressLine1',
    'city',
    'state',
    'zipCode',
    'county',
    'unitCount',
    'communityType',
  ];
  const plan: readonly string[] = ['planKey'];
  const finish: readonly string[] = ['candidateSlug', 'termsAccepted', 'signupRequestId'];
  if (account.includes(field)) {
    return 0;
  }
  if (community.includes(field)) {
    return 1;
  }
  if (plan.includes(field)) {
    return 2;
  }
  if (finish.includes(field)) {
    return 3;
  }
  return 0;
}
