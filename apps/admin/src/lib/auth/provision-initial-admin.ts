type InitialAdminRole = 'board_president' | 'board_member' | 'cam' | 'site_manager';

interface ErrorLike {
  message: string;
}

interface CreateUserResponse {
  data: { user: { id: string } | null } | null;
  error: ErrorLike | null;
}

interface DeleteUserResponse {
  error?: ErrorLike | null;
}

interface GenerateLinkResponse {
  error: ErrorLike | null;
}

interface RoleInsertResponse {
  error: ErrorLike | null;
}

interface RoleInsertOperation extends PromiseLike<RoleInsertResponse> {}

export interface ProvisionInitialAdminClient {
  auth: {
    admin: {
      createUser: (params: {
        email: string;
        email_confirm: boolean;
        user_metadata: { community_id: number };
      }) => Promise<CreateUserResponse>;
      deleteUser: (userId: string) => Promise<DeleteUserResponse | void>;
      generateLink: (params: {
        type: 'magiclink';
        email: string;
      }) => Promise<GenerateLinkResponse>;
    };
  };
  from: (table: 'user_roles') => {
    insert: (values: {
      user_id: string;
      community_id: number;
      role: InitialAdminRole;
    }) => RoleInsertOperation;
  };
}

interface ProvisionInitialAdminInput {
  communityId: number;
  email: string;
  role: InitialAdminRole;
}

interface ProvisionInitialAdminResult {
  invitationSent: boolean;
}

/**
 * Supabase Auth and Postgres writes do not share a transaction boundary here,
 * so we clean up the auth user if role assignment fails to avoid orphaned users.
 */
export async function provisionInitialAdmin(
  client: ProvisionInitialAdminClient,
  input: ProvisionInitialAdminInput,
): Promise<ProvisionInitialAdminResult> {
  const { data: authUser, error: authError } = await client.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { community_id: input.communityId },
  });

  if (authError || !authUser?.user) {
    console.error('[Admin] Failed to create initial admin auth user:', authError);
    return { invitationSent: false };
  }

  const { error: roleError } = await client.from('user_roles').insert({
    user_id: authUser.user.id,
    community_id: input.communityId,
    role: input.role,
  });

  if (roleError) {
    console.error('[Admin] Failed to assign initial admin role:', roleError);

    try {
      const cleanupResult = await client.auth.admin.deleteUser(authUser.user.id);
      if (cleanupResult?.error) {
        console.error(
          '[Admin] Failed to clean up auth user after role assignment failure:',
          cleanupResult.error,
        );
      }
    } catch (cleanupError) {
      console.error(
        '[Admin] Failed to clean up auth user after role assignment failure:',
        cleanupError,
      );
    }

    return { invitationSent: false };
  }

  const { error: invitationError } = await client.auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
  });

  if (invitationError) {
    console.error('[Admin] Failed to generate initial admin invitation:', invitationError);
    return { invitationSent: false };
  }

  return { invitationSent: true };
}
