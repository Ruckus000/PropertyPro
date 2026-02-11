import Link from 'next/link';

interface VerifyEmailPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveReturnTo(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '/dashboard';
  }

  if (!value) {
    return '/dashboard';
  }

  return value;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;
  const returnTo = resolveReturnTo(params.returnTo);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Your session is active, but your email address is not verified yet. Please check your inbox
          for a confirmation link, then refresh this page.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={returnTo}
            className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            I have verified my email
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
