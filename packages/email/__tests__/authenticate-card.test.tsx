/**
 * `AuthenticateCardEmail` — #772.
 *
 * The assertions that matter here are about COPY, not markup. The defect this
 * template replaces was not a rendering bug: the SCA event sent
 * `PaymentFailedEmail`, so an association whose card was perfectly fine was told
 * the payment had failed and to update its payment method. Following that advice
 * does not clear a 3-D Secure challenge. So these tests pin the words the email
 * must say and, just as importantly, the words it must not.
 */
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { AuthenticateCardEmail } from "../src/index";
import type { CommunityBranding } from "../src/index";

const branding: CommunityBranding = {
  communityName: "Palm Gardens Condominium",
};

const AUTHENTICATE_URL = "https://invoice.stripe.com/i/acct_123/live_abc123";
const PORTAL_URL = "https://app.example.com/billing/portal?communityId=42";

function renderEmail(overrides: Partial<Parameters<typeof AuthenticateCardEmail>[0]> = {}) {
  return render(
    <AuthenticateCardEmail
      branding={branding}
      recipientName="Jane Doe"
      amountDue="$249.00"
      authenticateUrl={AUTHENTICATE_URL}
      billingPortalUrl={PORTAL_URL}
      {...overrides}
    />,
  );
}

describe("AuthenticateCardEmail", () => {
  it("renders, and names the recipient, the amount and the community", async () => {
    const html = await renderEmail();

    expect(html).toBeTruthy();
    expect(html).toContain("Jane Doe");
    expect(html).toContain("$249.00");
    expect(html).toContain("Palm Gardens Condominium");
  });

  it("puts the authenticate URL on the primary call to action", async () => {
    const html = await renderEmail();

    expect(html).toContain(AUTHENTICATE_URL);
    expect(html).toContain("Confirm this payment");
  });

  it("does not tell the reader the payment failed or that the card needs replacing", async () => {
    // The exact regression from #772. If any of these reappear, the template has
    // drifted back toward the payment-failed copy that sent boards to re-enter a
    // working card while the renewal quietly expired.
    const html = await renderEmail();

    expect(html).not.toMatch(/payment failed/i);
    expect(html).not.toMatch(/unable to process/i);
    expect(html).not.toMatch(/update (your )?payment method/i);
    expect(html).not.toMatch(/outstanding balance/i);
  });

  it("says plainly that the card is fine", async () => {
    const html = await renderEmail();

    expect(html).toMatch(/nothing has gone wrong with your card/i);
  });

  it("warns against forwarding, because the link is bearer-ish", async () => {
    // Possession of `hosted_invoice_url` is enough to view and pay the invoice.
    //
    // Matched on the substantive phrases, not on "don't" — the apostrophe is
    // rendered as an HTML entity, so an assertion containing one passes or fails
    // on the escaping rather than on the warning being present.
    const html = await renderEmail();

    expect(html).toMatch(/forward this\s+email/i);
    expect(html).toMatch(/can view and pay the invoice/i);
  });

  it("still offers the billing portal as a secondary link", async () => {
    const html = await renderEmail();

    expect(html).toContain(PORTAL_URL);
  });

  it("renders correctly when the caller substituted the portal for a missing invoice URL", async () => {
    // Stripe's `hosted_invoice_url` is nullable; the sender passes the portal
    // URL instead rather than dropping the email. The copy must not claim
    // anything that becomes false in that case.
    const html = await renderEmail({ authenticateUrl: PORTAL_URL });

    expect(html).toBeTruthy();
    expect(html).toContain("Confirm this payment");
    expect(html).toContain(PORTAL_URL);
  });
});
