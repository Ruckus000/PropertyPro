import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveReturnTo(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '/dashboard';
  return value && value.length > 0 ? value : '/dashboard';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = resolveReturnTo(params.returnTo);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Sign in to PropertyPro</h1>
          <p className="mt-2 text-sm text-gray-600">
            Use your email and password to access your community portal.
          </p>
        </div>
        <LoginForm returnTo={returnTo} />
        <div className="text-center text-sm">
          <Link href="/auth/forgot-password" className="text-blue-600 hover:text-blue-500">
            Forgot password?
          </Link>
        </div>
      </div>
    </main>
  );
}
