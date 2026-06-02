/**
 * Route contract for `POST /api/v1/admin/demo/[slug]/convert`.
 *
 * Plan A1 drain #86. This route is a **deprecated stub** that always
 * throws `AppError('This endpoint has been moved to the admin app API',
 * 410, 'DEPRECATED')`. The real implementation lives in the admin app
 * at `apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts`; the
 * web-app variant required a web-app session cookie that the admin app
 * couldn't provide.
 *
 * Params: `{ slug }` — preserved verbatim from the pre-migration shape
 * for forward-compat. The handler never inspects the value (it throws
 * before doing any work), but the contract keeps the URL surface
 * documented.
 *
 * Response: `z.never()`. The handler always throws, so the success
 * branch of `runRoute` is unreachable; the response schema is never
 * evaluated against a real value. `withErrorHandler` converts the
 * thrown `AppError` into the canonical `{ error: { code, message } }`
 * envelope at status 410.
 *
 * Permission: OMITTED. The pre-migration handler performed no auth
 * check whatsoever — anonymous callers received the same 410 stub
 * response — so there's no RBAC pair to declare. The route is a
 * fixed-error responder, not a real resource handler.
 *
 * Note: the sibling `OPTIONS` export in `./route.ts` is preserved as a
 * plain Next.js handler and is NOT routed through `runRoute`. The
 * runner only dispatches by exported HTTP method name matching the
 * contract method; `OPTIONS` preflight remains a separate handler that
 * returns the same 410 envelope verbatim.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  slug: z.string().min(1),
});

export const demoConvertContract = defineRoute({
  method: 'POST',
  path: '/api/v1/admin/demo/[slug]/convert',
  request: { params: paramsSchema },
  response: z.never(),
});
