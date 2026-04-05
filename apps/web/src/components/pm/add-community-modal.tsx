'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricingPreview {
  previousTier: string;
  newTier: string;
  perCommunityBreakdown: Array<{
    basePriceUsd: number;
    discountedPriceUsd: number;
    discountPercent: number;
  }>;
  portfolioMonthlyDeltaUsd: number;
}

interface AddCommunityFormState {
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  planId: 'essentials' | 'professional' | 'operations_plus';
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  subdomain: string;
  unitCount: number;
  timezone: string;
}

interface AddCommunityModalProps {
  open: boolean;
  onClose: () => void;
  billingGroupId: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddCommunityModal({
  open,
  onClose,
  billingGroupId,
}: AddCommunityModalProps) {
  const [form, setForm] = useState<AddCommunityFormState>({
    name: '',
    communityType: 'condo_718',
    planId: 'essentials',
    addressLine1: '',
    city: '',
    state: 'FL',
    zipCode: '',
    subdomain: '',
    unitCount: 1,
    timezone: 'America/New_York',
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const preview = useQuery<{ data: PricingPreview }>({
    queryKey: ['pricing-preview', billingGroupId, form.planId, form.communityType],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/billing-groups/${billingGroupId}/preview?planId=${form.planId}&communityType=${form.communityType}`,
      );
      if (!res.ok) throw new Error('Failed to fetch pricing preview');
      return res.json() as Promise<{ data: PricingPreview }>;
    },
    enabled: !!billingGroupId && open,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Checkout creation failed');
      return res.json() as Promise<{ data: { clientSecret: string } }>;
    },
    onSuccess: (data) => setClientSecret(data.data.clientSecret),
  });

  const handleClose = () => {
    setClientSecret(null);
    submit.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {!clientSecret ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a Community</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Community name */}
              <div className="space-y-2">
                <Label htmlFor="add-community-name">Community name</Label>
                <Input
                  id="add-community-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Sunset Condos"
                />
              </div>

              {/* Plan */}
              <div className="space-y-2">
                <Label htmlFor="add-community-plan">Plan</Label>
                <Select
                  value={form.planId}
                  onValueChange={(v) => setForm({ ...form, planId: v as AddCommunityFormState['planId'] })}
                >
                  <SelectTrigger id="add-community-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essentials">Essentials — $199/mo</SelectItem>
                    <SelectItem value="professional">Professional — $349/mo</SelectItem>
                    <SelectItem value="operations_plus">Operations Plus — $499/mo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Community type */}
              <div className="space-y-2">
                <Label htmlFor="add-community-type">Community type</Label>
                <Select
                  value={form.communityType}
                  onValueChange={(v) =>
                    setForm({ ...form, communityType: v as AddCommunityFormState['communityType'] })
                  }
                >
                  <SelectTrigger id="add-community-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="condo_718">Condo (718)</SelectItem>
                    <SelectItem value="hoa_720">HOA (720)</SelectItem>
                    <SelectItem value="apartment">Apartment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Subdomain */}
              <div className="space-y-2">
                <Label htmlFor="add-community-subdomain">Subdomain</Label>
                <Input
                  id="add-community-subdomain"
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                  placeholder="sunset-condos"
                />
              </div>

              {/* Address grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="add-community-address">Address</Label>
                  <Input
                    id="add-community-address"
                    value={form.addressLine1}
                    onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-community-city">City</Label>
                  <Input
                    id="add-community-city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Miami"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-community-state">State</Label>
                  <Input
                    id="add-community-state"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    maxLength={2}
                    placeholder="FL"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-community-zip">ZIP</Label>
                  <Input
                    id="add-community-zip"
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    placeholder="33101"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="add-community-units">Unit count</Label>
                  <Input
                    id="add-community-units"
                    type="number"
                    min={1}
                    value={form.unitCount}
                    onChange={(e) =>
                      setForm({ ...form, unitCount: Math.max(1, Number(e.target.value)) })
                    }
                  />
                </div>
              </div>

              {/* Pricing preview */}
              {preview.data && (
                <div className="rounded-md border border-edge bg-surface-muted p-4">
                  <p className="text-sm font-medium text-content">Portfolio Pricing</p>
                  <p className="mt-1 text-sm text-content-secondary">
                    {preview.data.data.perCommunityBreakdown.at(-1)?.discountPercent ?? 0}% volume
                    discount applied
                  </p>
                  {preview.data.data.previousTier !== preview.data.data.newTier && (
                    <p className="mt-2 text-sm text-content">
                      Adding this community unlocks a new discount tier for your portfolio.
                    </p>
                  )}
                </div>
              )}

              {/* Mutation error */}
              {submit.error && (
                <p className="text-sm" style={{ color: 'var(--text-error)' }}>
                  {submit.error.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => submit.mutate()}
                disabled={submit.isPending || !form.name || !form.subdomain}
              >
                {submit.isPending ? 'Starting checkout…' : 'Continue to Payment'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="py-4">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
