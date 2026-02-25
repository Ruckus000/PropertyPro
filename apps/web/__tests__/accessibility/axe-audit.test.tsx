/**
 * P4-63: Accessibility audit — axe-core automated checks.
 *
 * Renders key UI surfaces in jsdom and verifies zero axe-core violations
 * at WCAG 2.1 AA level. This covers:
 * - Auth forms (login, signup, set-password)
 * - Maintenance submission form
 * - Marketing landing sections
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

// ---------------------------------------------------------------------------
// Mocks — auth forms depend on next/navigation + Supabase client
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

vi.mock('@propertypro/db/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

vi.mock('@/lib/auth/actions', () => ({
  forgotPasswordAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));

vi.mock('@/lib/auth/schemas', () => ({
  ForgotPasswordSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
  ResetPasswordSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock('@/lib/api/maintenance-requests', () => ({
  createMaintenanceRequest: vi.fn(),
  requestPhotoUploadUrl: vi.fn(),
}));

// Stub fetch for components that use it (signup, notification preferences)
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: {} }),
  }));
});

// ---------------------------------------------------------------------------
// Auth forms
// ---------------------------------------------------------------------------

describe('P4-63: Accessibility audit — axe-core', () => {
  describe('Auth forms', () => {
    it('LoginForm has no axe violations', async () => {
      const { LoginForm } = await import(
        '@/components/auth/login-form'
      );
      const { container } = render(<LoginForm returnTo="/dashboard" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('SetPasswordForm has no axe violations', async () => {
      const { SetPasswordForm } = await import(
        '@/components/auth/set-password-form'
      );
      const { container } = render(
        <SetPasswordForm token="test-token" communityId={1} />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('SignupForm has no axe violations', async () => {
      const { SignupForm } = await import(
        '@/components/signup/signup-form'
      );
      const { container } = render(<SignupForm />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // ---------------------------------------------------------------------------
  // Maintenance form
  // ---------------------------------------------------------------------------

  describe('Maintenance form', () => {
    it('SubmitForm has no axe violations', async () => {
      const { SubmitForm } = await import(
        '@/components/maintenance/SubmitForm'
      );
      const { container } = render(
        <SubmitForm communityId={1} userId="user-1" />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // ---------------------------------------------------------------------------
  // Marketing sections
  // ---------------------------------------------------------------------------

  describe('Marketing sections', () => {
    it('HeroSection has no axe violations', async () => {
      const { HeroSection } = await import(
        '@/components/marketing/hero-section'
      );
      const { container } = render(<HeroSection />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('FeaturesSection has no axe violations', async () => {
      const { FeaturesSection } = await import(
        '@/components/marketing/features-section'
      );
      const { container } = render(<FeaturesSection />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('PricingSection has no axe violations', async () => {
      const { PricingSection } = await import(
        '@/components/marketing/pricing-section'
      );
      const { container } = render(<PricingSection />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('ComplianceUrgencySection has no axe violations', async () => {
      const { ComplianceUrgencySection } = await import(
        '@/components/marketing/compliance-urgency-section'
      );
      const { container } = render(<ComplianceUrgencySection />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('MarketingFooter has no axe violations', async () => {
      const { MarketingFooter } = await import(
        '@/components/marketing/footer'
      );
      const { container } = render(<MarketingFooter />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // ---------------------------------------------------------------------------
  // Settings components
  // ---------------------------------------------------------------------------

  describe('Settings components', () => {
    it('ExportButton has no axe violations', async () => {
      const { ExportButton } = await import(
        '@/components/settings/export-button'
      );
      const { container } = render(<ExportButton communityId={1} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
