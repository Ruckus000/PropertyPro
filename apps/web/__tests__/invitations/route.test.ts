import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  scopedQueryMock,
  scopedInsertMock,
  scopedUpdateMock,
  logAuditEventMock,
  sendEmailMock,
  createAdminClientMock,
  communitiesTable,
  usersTable,
  userRolesTable,
  invitationsTable,
  requireAuthenticatedUserIdMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  scopedQueryMock: vi.fn(),
  scopedInsertMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'test_1' }),
  createAdminClientMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  usersTable: Symbol('users'),
  userRolesTable: Symbol('user_roles'),
  invitationsTable: Symbol('invitations'),
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  users: usersTable,
  userRoles: userRolesTable,
  invitations: invitationsTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  InvitationEmail: (props: unknown) => ({ type: 'InvitationEmail', props } as any),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

import { POST, PATCH } from '../../src/app/api/v1/invitations/route';

describe('p1-20 invitation auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('inviter-uuid');
    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      insert: scopedInsertMock,
      update: scopedUpdateMock,
    });
  });

  it('POST sends invitation email with correct link and community name', async () => {
    scopedQueryMock
      // communities
      .mockResolvedValueOnce([{ id: 99, name: 'Sunset Condos' }])
      // users
      .mockResolvedValueOnce([
        { id: 'user-1', email: 'resident@example.com', fullName: 'Jane Resident' },
      ])
      // user_roles
      .mockResolvedValueOnce([{ id: 1, userId: 'user-1', role: 'owner' }]);

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 99, userId: 'user-1', ttlDays: 7 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(99);
    expect(scopedInsertMock).toHaveBeenCalledWith(
      invitationsTable,
      expect.objectContaining({ userId: 'user-1' }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmailMock.mock.calls[0]?.[0];
    expect(emailArgs.to).toBe('resident@example.com');
    expect(emailArgs.subject).toContain('Sunset Condos');

    // Inspect the React element props passed to InvitationEmail
    const reactEl = emailArgs.react;
    expect(reactEl.props.branding.communityName).toBe('Sunset Condos');
    expect(reactEl.props.inviteUrl).toContain('/auth/accept-invite?token=');
    expect(reactEl.props.inviteUrl).toContain('communityId=99');

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user_invited', communityId: 99 }),
    );
  });

  it('PATCH consumes token, creates auth user, and returns email', async () => {
    const token = 'tok123';
    // invitations
    scopedQueryMock
      .mockResolvedValueOnce([
        {
          id: 1,
          token,
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          consumedAt: null,
        },
      ])
      // users
      .mockResolvedValueOnce([
        { id: 'user-1', email: 'resident@example.com', fullName: 'Jane Resident' },
      ]);

    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 55, token, password: 'strongpass123' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { email: string } };
    expect(json.data.email).toBe('resident@example.com');
    expect(scopedUpdateMock).toHaveBeenCalledWith(
      invitationsTable,
      expect.objectContaining({ consumedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', communityId: 55 }),
    );
  });

  it('PATCH rejects already used token', async () => {
    const token = 'used123';
    scopedQueryMock
      .mockResolvedValueOnce([
        { id: 1, token, userId: 'user-1', expiresAt: new Date(Date.now() + 1000).toISOString(), consumedAt: new Date().toISOString() },
      ]);

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 5, token, password: 'pass123456' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('TOKEN_USED');
  });

  it('PATCH rejects expired token', async () => {
    const token = 'exp123';
    scopedQueryMock
      .mockResolvedValueOnce([
        { id: 1, token, userId: 'user-1', expiresAt: new Date(Date.now() - 1000).toISOString(), consumedAt: null },
      ]);

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 9, token, password: 'pass123456' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('TOKEN_EXPIRED');
  });
});
