import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { BrandedAuthLayout } from '@/components/auth/branded-auth-layout';
import { resolveReturnTo } from '@/lib/utils/auth';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const branding = await resolveAuthPageBranding();
  const returnTo = resolveReturnTo(params.returnTo, branding.hasTenantContext);

  const heading = branding.communityName
    ? `Sign in to ${branding.communityName}`
    : 'Sign in to PropertyPro';

  return (
    <BrandedAuthLayout
      branding={branding}
      heading={heading}
      description="Use your email and password to access your community portal."
    >
      <LoginForm returnTo={returnTo} />
      <div className="text-center text-sm">
        <Link href="/auth/forgot-password" className="text-blue-600 hover:text-blue-500">
          Forgot password?
        </Link>
      </div>
    </BrandedAuthLayout>
  );
}
