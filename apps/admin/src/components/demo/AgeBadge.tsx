export function getAgeDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

export function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = getAgeDays(createdAt);
  let color = 'bg-green-100 text-green-800';
  if (days >= 30) color = 'bg-red-100 text-red-800';
  else if (days >= 20) color = 'bg-orange-100 text-orange-800';
  else if (days >= 10) color = 'bg-yellow-100 text-yellow-800';

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {days}d
    </span>
  );
}
