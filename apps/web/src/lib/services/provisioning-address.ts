export interface PendingSignupAddressSource {
  address: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export function resolvePendingSignupAddress(signup: PendingSignupAddressSource): {
  addressLine1: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
} {
  return {
    addressLine1: signup.addressLine1?.trim() || signup.address.trim(),
    city: signup.city?.trim() || null,
    state: signup.state?.trim() || null,
    zipCode: signup.zipCode?.trim() || null,
  };
}
