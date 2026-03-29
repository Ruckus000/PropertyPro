interface Props {
  communityType: string;
  generatedAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function TransparencyFooter({ communityType, generatedAt }: Props) {
  return (
    <footer className="rounded-md border border-edge bg-surface-card p-5 text-xs text-content-tertiary print:border-none print:p-0 print:text-black">
      <div className="space-y-1">
        <p>Data source: PropertyPro Platform</p>
        <p>Community type: {communityType}</p>
        <p>Generated: {formatDate(generatedAt)}</p>
      </div>

      <div className="mt-4 space-y-1">
        <p className="font-semibold text-content-secondary print:text-black">What this page tracks</p>
        <p>Document posting status, notice lead-time records, and monthly minutes availability tracked in PropertyPro.</p>
      </div>

      <div className="mt-4 space-y-1">
        <p className="font-semibold text-content-secondary print:text-black">What this page does not track</p>
        <p>Off-platform records, legal interpretations, or statutory certification outcomes.</p>
      </div>

      <p className="mt-4">
        Powered by{' '}
        <a
          href="https://getpropertypro.com/?utm_source=transparency-page&utm_medium=referral&utm_campaign=public-trust"
          className="font-medium text-content-link underline"
          rel="noreferrer"
          target="_blank"
        >
          PropertyPro Florida
        </a>
      </p>
    </footer>
  );
}
