import { describe, expect, it, vi } from 'vitest';
import {
  provisionInitialAdmin,
  type ProvisionInitialAdminClient,
} from '@/lib/auth/provision-initial-admin';

function createClientMock() {
  const createUser = vi.fn();
  const deleteUser = vi.fn();
  const generateLink = vi.fn();
  const insert = vi.fn();

  const client: ProvisionInitialAdminClient = {
    auth: {
      admin: {
        createUser,
        deleteUser,
        generateLink,
      },
    },
    from: vi.fn(() => ({
      insert,
    })),
  };

  return {
    client,
    createUser,
    deleteUser,
    generateLink,
    insert,
  };
}

describe('provisionInitialAdmin', () => {
  it('creates the auth user, assigns the role, and sends an invitation', async () => {
    const { client, createUser, generateLink, insert } = createClientMock();
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: null });
    generateLink.mockResolvedValue({ error: null });

    const result = await provisionInitialAdmin(client, {
      communityId: 42,
      email: 'president@example.com',
      role: 'board_president',
    });

    expect(result).toEqual({ invitationSent: true });
    expect(createUser).toHaveBeenCalledWith({
      email: 'president@example.com',
      email_confirm: true,
      user_metadata: { community_id: 42 },
    });
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      community_id: 42,
      role: 'board_president',
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'president@example.com',
    });
  });

  it('deletes the auth user if role assignment fails', async () => {
    const { client, createUser, deleteUser, generateLink, insert } = createClientMock();
    createUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null });
    insert.mockResolvedValue({ error: { message: 'insert failed' } });
    deleteUser.mockResolvedValue({ error: null });

    const result = await provisionInitialAdmin(client, {
      communityId: 8,
      email: 'manager@example.com',
      role: 'cam',
    });

    expect(result).toEqual({ invitationSent: false });
    expect(deleteUser).toHaveBeenCalledWith('user-2');
    expect(generateLink).not.toHaveBeenCalled();
  });
});
