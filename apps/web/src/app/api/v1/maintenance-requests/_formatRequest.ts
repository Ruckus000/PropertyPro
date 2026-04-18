/**
 * Shared formatter for maintenance request API responses.
 *
 * Legacy normalization (cosmetic, DB unchanged):
 * - status 'open' → 'submitted'
 * - priority 'normal' → 'medium'
 *
 * Security:
 * - internalNotes stripped for resident callers
 * - isInternal field omitted from comment payloads for resident callers
 *   (defense-in-depth — callers already filter isInternal=true comments upstream,
 *   but omitting the field closes the regression footgun if that filter is
 *   ever relaxed or bypassed)
 */
export function formatRequest(
  r: Record<string, unknown>,
  comments: Record<string, unknown>[],
  isResident: boolean,
): Record<string, unknown> {
  const status = r['status'] === 'open' ? 'submitted' : r['status'];
  const priority = r['priority'] === 'normal' ? 'medium' : r['priority'];

  const result: Record<string, unknown> = {
    id: r['id'],
    communityId: r['communityId'],
    unitId: r['unitId'] ?? null,
    submittedById: r['submittedById'],
    title: r['title'],
    description: r['description'],
    status,
    priority,
    category: r['category'] ?? 'general',
    assignedToId: r['assignedToId'] ?? null,
    resolutionDescription: r['resolutionDescription'] ?? null,
    resolutionDate: r['resolutionDate'] ?? null,
    photos: r['photos'] ?? null,
    createdAt: r['createdAt'],
    updatedAt: r['updatedAt'],
    comments: comments.map((c) => {
      const formatted: Record<string, unknown> = {
        id: c['id'],
        requestId: c['requestId'],
        userId: c['userId'],
        text: c['text'],
        createdAt: c['createdAt'],
      };
      if (!isResident) {
        formatted['isInternal'] = c['isInternal'];
      }
      return formatted;
    }),
  };

  if (!isResident) {
    result['internalNotes'] = r['internalNotes'] ?? null;
  }

  return result;
}
