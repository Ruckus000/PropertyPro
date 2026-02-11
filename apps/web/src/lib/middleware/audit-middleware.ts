/**
 * Audit Middleware — wraps Route Handlers with audit logging context.
 *
 * Composes with withErrorHandler:
 *   export const POST = withErrorHandler(withAuditLog(extractCtx, handler));
 *
 * Extracts userId and communityId from request context, provides an
 * audit.log() helper that pre-fills these fields and attaches the request ID.
 */
import type { NextRequest, NextResponse } from 'next/server';
import {
  logAuditEvent,
  type AuditAction,
} from '@propertypro/db';
import { generateRequestId } from '../api/request-id';

export interface AuditContext {
  /** Pre-bound audit logger with userId and communityId from request context. */
  log(params: {
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

type RouteHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

export type AuditRouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> } | undefined,
  audit: AuditContext,
) => Promise<NextResponse>;

export type ContextExtractor = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => { userId: string; communityId: number } | Promise<{ userId: string; communityId: number }>;

/**
 * Wraps a Route Handler with audit logging context.
 *
 * @param extractContext - Async/sync function to extract userId and communityId
 * @param handler - Route handler that receives an AuditContext as its third argument
 * @returns A standard RouteHandler compatible with withErrorHandler
 *
 * @example
 * ```ts
 * export const POST = withErrorHandler(
 *   withAuditLog(
 *     async (req) => ({ userId: session.userId, communityId: Number(params.id) }),
 *     async (req, ctx, audit) => {
 *       const doc = await createDocument(data);
 *       await audit.log({
 *         action: 'create',
 *         resourceType: 'document',
 *         resourceId: doc.id,
 *         newValues: data,
 *       });
 *       return NextResponse.json(doc, { status: 201 });
 *     },
 *   ),
 * );
 * ```
 */
export function withAuditLog(
  extractContext: ContextExtractor,
  handler: AuditRouteHandler,
): RouteHandler {
  return async (req, context) => {
    const { userId, communityId } = await extractContext(req, context);
    const requestId = req.headers.get('x-request-id')?.trim() || generateRequestId();

    const audit: AuditContext = {
      async log(params) {
        await logAuditEvent({
          ...params,
          userId,
          communityId,
          metadata: { ...params.metadata, requestId },
        });
      },
    };

    return handler(req, context, audit);
  };
}
