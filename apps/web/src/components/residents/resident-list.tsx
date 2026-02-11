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
        <span className="mb-1 block text-sm font-medium text-gray-700">Search residents</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by name or email"
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {residents.map((resident) => (
          <li key={`${resident.userId}:${resident.role}`} className="p-3 text-sm">
            <p className="font-medium text-gray-900">{resident.fullName ?? 'Unknown resident'}</p>
            <p className="text-gray-600">{resident.email ?? 'No email'}</p>
            <p className="text-gray-600">
              Role: {resident.role}
              {resident.unitId ? ` • Unit ${resident.unitId}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
