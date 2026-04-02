import { Suspense } from 'react';
import { VerifyEmailContent } from '@/components/signup/verify-email-content';

export const metadata = {
  title: 'Check Your Email — PropertyPro',
};

export default function VerifyEmailPage() {
  return (
    <main id="main-content" className="min-h-screen bg-surface-page px-4 py-12">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-content">Start Your PropertyPro Signup</h1>
          <p className="mt-2 text-sm text-content-secondary">
            Billing checkout opens after email verification.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-md border border-edge bg-surface-card p-8 text-center shadow-e0">
              <p className="text-sm text-content-secondary">Loading...</p>
            </div>
          }
        >
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}
