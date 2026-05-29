/**
 * Route contracts for `GET`, `PATCH`, and `POST /api/v1/onboarding/apartment`.
 *
 * Plan A1 drain #139. Apartment onboarding wizard (2-step flow).
 *
 * GET: `communityId` in contract query; `resolveEffectiveCommunityId` in-handler.
 * PATCH: structural body in contract; `stepData` profile validation stays in-handler.
 * POST: complete wizard action.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const MAX_STEP_INDEX = 1;

const patchApartmentWizardBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    step: z.number().int().min(0).max(MAX_STEP_INDEX).optional(),
    currentStep: z.number().int().min(1).max(MAX_STEP_INDEX + 1).optional(),
    stepData: z.unknown(),
  })
  .refine((payload) => payload.step !== undefined || payload.currentStep !== undefined, {
    path: ['step'],
    message: 'step (0-1) or currentStep (1-2) is required',
  });

export const onboardingApartmentGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/onboarding/apartment',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'communities', action: 'read' },
});

export const onboardingApartmentPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/onboarding/apartment',
  request: {
    body: patchApartmentWizardBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'communities', action: 'write' },
});

export const onboardingApartmentPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/onboarding/apartment',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      action: z.enum(['complete']).optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'communities', action: 'write' },
});
