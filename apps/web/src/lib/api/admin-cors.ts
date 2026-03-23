/**
 * Shared CORS helpers for admin API routes.
 *
 * The admin app runs on a different origin (localhost:3001 / ADMIN_APP_URL),
 * so every admin route must include CORS headers and an OPTIONS handler.
 */
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_ORIGINS = [
  'http://localhost:3001',
  process.env.ADMIN_APP_URL,
].filter(Boolean) as string[];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ADMIN_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function handleOptions(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  });
}
