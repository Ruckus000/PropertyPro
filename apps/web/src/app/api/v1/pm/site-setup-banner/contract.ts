/**
 * Route contracts for the PM dashboard "finish your site" banner dismissal.
 * Plan A1. User-scoped (no tenant context) — backed by the user_preferences
 * table via user-preferences-service.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const siteSetupBannerStatusContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site-setup-banner',
  request: {},
  response: z.object({ dismissed: z.boolean() }),
  permission: { resource: 'settings', action: 'read' },
});

export const siteSetupBannerDismissContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site-setup-banner',
  request: {},
  response: z.object({ dismissed: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
