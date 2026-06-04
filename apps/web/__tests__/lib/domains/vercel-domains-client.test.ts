import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addProjectDomain,
  getDomainStatus,
  removeProjectDomain,
  DomainProvisioningUnavailableError,
  DomainProviderError,
} from '@/lib/domains/vercel-domains-client';

const ENV = { VERCEL_TOKEN: 't0ken', VERCEL_PROJECT_ID: 'prj_x', VERCEL_ORG_ID: 'team_y' };

beforeEach(() => { Object.assign(process.env, ENV); vi.restoreAllMocks(); });
afterEach(() => { for (const k of Object.keys(ENV)) delete (process.env as Record<string,string>)[k]; });

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }) as Response,
  );
}

describe('vercel-domains-client', () => {
  it('throws when env is unconfigured', async () => {
    delete (process.env as Record<string,string>).VERCEL_TOKEN;
    await expect(addProjectDomain('www.foo.com')).rejects.toBeInstanceOf(DomainProvisioningUnavailableError);
  });

  it('adds a domain and passes teamId + bearer token', async () => {
    const spy = mockFetch(200, { name: 'www.foo.com', verified: false, verification: [{ type: 'TXT', domain: '_vercel.foo.com', value: 'abc' }] });
    const res = await addProjectDomain('www.foo.com');
    expect(res.records.length).toBeGreaterThan(0);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain('/v10/projects/prj_x/domains');
    expect(String(url)).toContain('teamId=team_y');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer t0ken' });
  });

  it('maps verified+configured to active', async () => {
    mockFetch(200, { name: 'www.foo.com', verified: true, misconfigured: false });
    expect((await getDomainStatus('www.foo.com')).status).toBe('active');
  });

  it('maps unverified/misconfigured to pending', async () => {
    mockFetch(200, { name: 'www.foo.com', verified: true, misconfigured: true });
    expect((await getDomainStatus('www.foo.com')).status).toBe('pending');
  });

  it('treats an already-exists add as idempotent success', async () => {
    mockFetch(409, { error: { code: 'domain_already_in_use' } });
    await expect(addProjectDomain('www.foo.com')).resolves.toBeTruthy();
  });

  it('removes a domain', async () => {
    const spy = mockFetch(200, { });
    await removeProjectDomain('www.foo.com');
    const [url, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('DELETE');
    expect(String(url)).toContain('/v9/projects/prj_x/domains/www.foo.com');
  });

  it('tolerates 404 on removeProjectDomain', async () => {
    mockFetch(404, { error: { code: 'domain_not_found', message: 'not found' } });
    await expect(removeProjectDomain('www.foo.com')).resolves.toBeUndefined();
  });

  it('throws DomainProviderError on remove >=400 non-404', async () => {
    mockFetch(403, { error: { code: 'forbidden', message: 'Forbidden' } });
    await expect(removeProjectDomain('www.foo.com')).rejects.toBeInstanceOf(DomainProviderError);
  });

  it('returns error status on addProjectDomain >=400', async () => {
    mockFetch(422, { error: { code: 'invalid_domain', message: 'Domain is invalid' } });
    const res = await addProjectDomain('not-a-domain');
    expect(res.status).toBe('error');
    expect(res.reason).toBe('Domain is invalid');
  });
});
