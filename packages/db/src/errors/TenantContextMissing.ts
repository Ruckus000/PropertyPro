/**
 * Error thrown when a database operation is attempted without tenant context.
 * This is a critical security boundary — every query against tenant-scoped
 * tables MUST have a valid communityId.
 */
export class TenantContextMissing extends Error {
  constructor() {
    super(
      'Tenant context is required but was not provided. All queries must include a community_id.',
    );
    this.name = 'TenantContextMissing';
  }
}
