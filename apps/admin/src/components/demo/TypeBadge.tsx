import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';

export function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    condo_718: 'bg-blue-100 text-blue-800',
    hoa_720: 'bg-green-100 text-green-800',
    apartment: 'bg-purple-100 text-purple-800',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[type] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {COMMUNITY_TYPE_DISPLAY_NAMES[type as CommunityType] ?? type}
    </span>
  );
}
