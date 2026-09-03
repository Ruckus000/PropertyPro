/**
 * Route contract for `POST /api/v1/esign/documents/from-library`.
 *
 * Brings a document out of the community's Documents library and into the
 * e-sign source prefix, so the builder's first step can offer "pick one you
 * already have" alongside "upload a new one".
 *
 * The copy is not busywork. Library files live at
 * `communities/{id}/documents/…`, and both e-sign create paths call
 * `assertCommunityOwnedStoragePath(path, id, 'esign-templates')`, which
 * rejects every other prefix. Binding a library path directly would mean
 * relaxing that check for both routes — the one thing standing between a
 * signature request and an arbitrary object key.
 *
 * Auth surface:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromBody
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireEsignWritePermission (writes a new object into the community's
 *       e-sign prefix)
 *     → requirePlanFeature(communityId, 'hasEsign')
 *     → getDocumentWithAccessCheck (the same read gate
 *       `/api/v1/documents/[id]/download` uses — a caller may only copy a
 *       document they can already open)
 *
 * `permission` metadata is illustrative; effective gates are the esign helpers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignDocumentFromLibraryContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/documents/from-library',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      documentId: z.number().int().positive(),
    }),
  },
  response: z.object({
    /** Path under `communities/{id}/esign-templates/`, ready to send or save. */
    sourceDocumentPath: z.string(),
    /** The library file's name, offered as the default title. */
    name: z.string(),
  }),
  permission: { resource: 'esign', action: 'write' },
});
