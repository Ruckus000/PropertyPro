/**
 * Shared formatter for maintenance request API responses.
 *
 * Legacy normalization (cosmetic, DB unchanged):
 * - status 'open' → 'submitted'
 * - priority 'normal' → 'medium'
 *
 * Security: internalNotes stripped for resident callers.
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
    comments: comments.map((c) => ({
      id: c['id'],
      requestId: c['requestId'],
      userId: c['userId'],
      text: c['text'],
      isInternal: c['isInternal'],
      createdAt: c['createdAt'],
    })),
  };

  if (!isResident) {
    result['internalNotes'] = r['internalNotes'] ?? null;
  }

  return result;
}
