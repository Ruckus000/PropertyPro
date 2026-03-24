import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const PDFJS_ASSET_PATHS: Record<string, string> = {
  'pdf.mjs': path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.mjs'),
  'pdf.worker.min.mjs': path.resolve(
    process.cwd(),
    'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  ),
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params;
  const filePath = PDFJS_ASSET_PATHS[asset];

  if (!filePath) {
    return NextResponse.json({ error: { message: 'Asset not found' } }, { status: 404 });
  }

  const body = await readFile(filePath, 'utf8');

  return new NextResponse(body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': process.env.NODE_ENV === 'production'
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
    },
  });
}
