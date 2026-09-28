import { NextResponse } from 'next/server';

export const runtime = 'edge';

// route-gate: public — liveness probe; middleware exempts /api/health as an exact path; returns only a static status and timestamp
export function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'admin',
    timestamp: new Date().toISOString(),
  });
}
