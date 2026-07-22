export function CheckoutMissingSession() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-content">Let&apos;s restart checkout</h1>
      <p className="mt-2 text-sm text-content-secondary">
        We couldn&apos;t find your signup session. Return to sign up to continue — your community
        details can be entered again.
      </p>
      <a
        href="/signup"
        className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
      >
        &larr; Back to sign up
      </a>
    </main>
  );
}
