import { NextResponse } from 'next/server';

export const runtime = 'edge';

// route-gate: public — liveness probe outside the /api/v1 session gate; returns a static status, reads nothing
export function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'web',
    timestamp: new Date().toISOString(),
  });
}
