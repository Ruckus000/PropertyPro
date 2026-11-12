'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  useAddCommunity,
  useAddCommunityAccess,
  useBillingGroupPreview,
  type AddCommunityFormState,
} from '@/hooks/use-add-community';
import { useReauth } from '@/hooks/use-reauth';
import { ReauthModal } from '@/components/auth/reauth-modal';
import { getSignupPlansForCommunityType, isFloridaZip } from '@/lib/auth/signup-schema';
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

interface AddCommunityModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Where focus goes on close. Defaults to whatever had focus when the modal
   * opened; the account menu passes its trigger, because the menu item that
   * opened this is gone by then.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Add a community: details, then the password (as for a plan change), then
 * Stripe Checkout in place. Opened from the Communities page and the account
 * menu; who may open it, and to which billing group the community is added,
 * comes from `useAddCommunityAccess`, and the server checks both again.
 */
export function AddCommunityModal({ open, onClose, returnFocusTo }: AddCommunityModalProps) {
  const [form, setForm] = useState<AddCommunityFormState>({
    name: '',
    communityType: 'condo_718',
    planId: 'essentials',
    addressLine1: '',
    city: '',
    state: 'FL',
    zipCode: '',
    subdomain: '',
    // 0 = not entered yet. Never pre-filled: the count decides whether Florida's
    // website rules apply (packages/shared `requirementLevel`), so a default
    // would quietly mark an association exempt.
    unitCount: 0,
    timezone: 'America/New_York',
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const reauth = useReauth();

  // Opened from state, not a DialogTrigger, so Radix would return focus to
  // <body>. A ref, because the opener must survive onOpenChange(false).
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      openerRef.current =
        returnFocusTo?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
  }, [open, returnFocusTo]);

  const access = useAddCommunityAccess(open);
  const billingGroupId = access.data?.billingGroupId ?? null;
  // Opened from a stale page or menu after access was lost: say so up front
  // rather than after the form and the password. The server refuses anyway.
  const refused = access.data?.allowed === false;
  const plans = getSignupPlansForCommunityType(form.communityType);
  const zip = form.zipCode.trim();
  const zipError = zip.length >= 5 && !isFloridaZip(zip) ? 'Enter a Florida ZIP code.' : null;

  const preview = useBillingGroupPreview({
    billingGroupId,
    planId: form.planId,
    communityType: form.communityType,
    enabled: open,
  });

  const submit = useAddCommunity();

  const handleSubmit = async () => {
    // Adding a community bills the portfolio, so it asks for the password the
    // way a plan change does. The server refuses without a fresh one.
    if (!(await reauth.triggerReauth())) return;
    submit.mutate(form, {
      onSuccess: (data) => setClientSecret(data.clientSecret),
    });
  };

  const setCommunityType = (communityType: AddCommunityFormState['communityType']) => {
    // A plan the new type does not offer falls back to its first plan.
    const offered = getSignupPlansForCommunityType(communityType);
    const planId = offered.some((p) => p.id === form.planId) ? form.planId : offered[0]!.id;
    setForm({ ...form, communityType, planId: planId as AddCommunityFormState['planId'] });
  };

  const handleClose = () => {
    setClientSecret(null);
    submit.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        size="md"
        resizable
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
      >
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
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.label} — ${plan.monthlyPriceUsd}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Community type */}
              <div className="space-y-2">
                <Label htmlFor="add-community-type">Community type</Label>
                <Select
                  value={form.communityType}
                  onValueChange={(v) => setCommunityType(v as AddCommunityFormState['communityType'])}
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

              {/* Time zone — Florida spans two. It was hardcoded to Eastern, so a
                  panhandle community showed meeting times and reminders an hour
                  off (onboarding audit F7). Deadline math is timezone-independent. */}
              <div className="space-y-2">
                <Label htmlFor="add-community-timezone">Time zone</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                  <SelectTrigger id="add-community-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (most of Florida)</SelectItem>
                    <SelectItem value="America/Chicago">Central (western panhandle)</SelectItem>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                {/* Florida only: PropertyPro Florida serves Florida associations. */}
                <div className="space-y-2">
                  <Label htmlFor="add-community-state">State</Label>
                  <Input id="add-community-state" value="Florida" readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-community-zip">ZIP</Label>
                  <Input
                    id="add-community-zip"
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    placeholder="33101"
                    inputMode="numeric"
                    maxLength={5}
                    aria-invalid={zipError ? true : undefined}
                    aria-describedby={zipError ? 'add-community-zip-error' : undefined}
                  />
                  {zipError && (
                    <p id="add-community-zip-error" className="text-sm text-status-danger">
                      {zipError}
                    </p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="add-community-units">Unit count</Label>
                  <Input
                    id="add-community-units"
                    type="number"
                    min={1}
                    value={form.unitCount || ''}
                    // No clamp: `Math.max(1, …)` snapped a cleared field back to 1,
                    // so it could never be left unanswered. The submit gate refuses
                    // anything under 1 instead, and the contract rejects it too.
                    onChange={(e) => setForm({ ...form, unitCount: Number(e.target.value) })}
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

              {refused && (
                <p role="alert" className="text-sm text-status-danger">
                  Only the root manager who pays for this portfolio can add a community.
                </p>
              )}

              {/* Mutation error */}
              {submit.error && (
                <p role="alert" className="text-sm text-status-danger">
                  {submit.error.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleSubmit()}
                disabled={
                  refused ||
                  submit.isPending ||
                  !form.name ||
                  !form.subdomain ||
                  form.unitCount < 1 ||
                  !isFloridaZip(zip)
                }
              >
                {submit.isPending ? 'Starting checkout…' : 'Continue to Payment'}
              </Button>
            </DialogFooter>
            {/* Inside this dialog's content, so Radix stacks it as a child layer. */}
            <ReauthModal isOpen={reauth.isOpen} onCancel={reauth.onCancel} verify={reauth.verify} />
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
