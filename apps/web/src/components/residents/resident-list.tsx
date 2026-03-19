'use client';

interface ResidentRecord {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string;
  unitId: number | null;
}

interface ResidentListProps {
  residents: ResidentRecord[];
  query: string;
  onQueryChange: (value: string) => void;
}

export function ResidentList({ residents, query, onQueryChange }: ResidentListProps) {
  return (
    <section className="space-y-4" data-testid="resident-list">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Search residents</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by name or email"
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>

      <ul className="divide-y divide-edge rounded-md border border-edge">
        {residents.map((resident) => (
          <li key={`${resident.userId}:${resident.role}`} className="p-3 text-sm">
            <p className="font-medium text-content">{resident.fullName ?? 'Unknown resident'}</p>
            <p className="text-content-secondary">{resident.email ?? 'No email'}</p>
            <p className="text-content-secondary">
              Role: {resident.role}
              {resident.unitId ? ` • Unit ${resident.unitId}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
