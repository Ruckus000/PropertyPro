import Link from 'next/link';
import { resolveReturnTo } from '@/lib/utils/auth';

interface VerifyEmailPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;
  const returnTo = resolveReturnTo(params.returnTo);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12">
      <div className="w-full max-w-lg rounded-md border border-edge bg-surface-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-content">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-content-secondary">
          Your session is active, but your email address is not verified yet. Please check your inbox
          for a confirmation link, then refresh this page.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={returnTo}
            className="inline-flex rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
          >
            I have verified my email
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
