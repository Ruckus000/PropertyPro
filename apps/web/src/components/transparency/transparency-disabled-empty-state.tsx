interface TransparencyDisabledEmptyStateProps {
  communityName: string;
}

export function TransparencyDisabledEmptyState({
  communityName,
}: TransparencyDisabledEmptyStateProps) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-link">
        Compliance Transparency
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-content">{communityName}</h1>
      <p className="mt-4 text-sm text-content-secondary">
        This community has not published a public transparency page yet. Association administrators
        can enable it from their PropertyPro dashboard when ready.
      </p>
    </main>
  );
}
