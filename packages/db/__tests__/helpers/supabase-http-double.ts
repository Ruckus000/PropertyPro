/**
 * Just enough of the Supabase REST surface for `seedCommunity`: storage upload /
 * list / download and auth admin listUsers (always empty). Anything else is
 * recorded in `unexpected` and answered 404, so a suite can assert nothing it
 * does not model was called.
 *
 * Same double as the inline copies in seed-community-isolation and
 * seed-resident-units (integration tests may not mock a module —
 * scripts/verify-no-mocks-in-integration.ts — so the real supabase-js client
 * runs against this server instead). `objects` is exposed so a caller can count
 * what the seed uploaded.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SupabaseHttpDouble {
  server: Server;
  url: string;
  unexpected: string[];
  /** `<bucket>/<path>` → uploaded bytes. */
  objects: Map<string, Buffer>;
}

export function startSupabaseDouble(): Promise<SupabaseHttpDouble> {
  const objects = new Map<string, Buffer>();
  const unexpected: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://double');
      const path = decodeURIComponent(url.pathname);
      const body = Buffer.concat(chunks);
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (req.method === 'GET' && path === '/auth/v1/admin/users') {
        return json(200, { users: [], aud: 'authenticated' });
      }

      const list = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      if (req.method === 'POST' && list) {
        const { prefix = '', search = '' } = JSON.parse(body.toString() || '{}') as {
          prefix?: string;
          search?: string;
        };
        const names = [...objects.keys()]
          .filter((key) => key.startsWith(`${list[1]}/${prefix}${prefix ? '/' : ''}`))
          .map((key) => key.slice(key.lastIndexOf('/') + 1))
          .filter((name) => name.includes(search));
        return json(200, names.map((name) => ({ name, id: name, metadata: {} })));
      }

      const object = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
      if (object && (req.method === 'POST' || req.method === 'PUT')) {
        objects.set(`${object[1]}/${object[2]}`, body);
        return json(200, { Key: `${object[1]}/${object[2]}`, Id: randomUUID() });
      }
      if (object && req.method === 'GET' && objects.has(`${object[1]}/${object[2]}`)) {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        return res.end(objects.get(`${object[1]}/${object[2]}`));
      }

      unexpected.push(`${req.method ?? '?'} ${path}`);
      return json(404, { message: 'not in the double' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${String(port)}`, unexpected, objects });
    });
  });
}
