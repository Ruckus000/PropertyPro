/**
 * Local agent fixture CLI. It is deliberately invoked only through
 * `scripts/agent-env.sh exec`, which supplies PROPERTYPRO_AGENT_SANDBOX and
 * loopback-only Auth/DB endpoints. It never accepts production-shaped email or
 * community namespaces.
 */
import {
  communities,
  createScopedClient,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: local agent fixture bootstrap; agent-env proves loopback-only backends and membership writes remain scoped.
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { COMMUNITY_ROLES, COMMUNITY_TYPES, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { createAuthUserBoundTo, rollBackAuthUser } from '@/lib/services/auth-user-binding';
import { createCommunityForPm } from '@/lib/pm/create-community';

type FlagMap = Record<string, string | true>;

function fail(message: string): never {
  throw new Error(message);
}

function flags(args: string[]): FlagMap {
  const result: FlagMap = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    // pnpm preserves the conventional argument separator when forwarding to a
    // package script; it is not an option for this CLI.
    if (arg === '--') continue;
    if (!arg.startsWith('--')) fail(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function required(input: FlagMap, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) fail(`Missing required --${key}.`);
  return value.trim();
}

function optional(input: FlagMap, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function assertSandbox(): void {
  if (process.env.PROPERTYPRO_AGENT_SANDBOX !== '1') {
    fail('This command must run through pnpm agent:fixture:user or pnpm agent:fixture:community.');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !/@(127\.0\.0\.1|localhost):\d+\//.test(dbUrl)) {
    fail('Refusing to create fixtures unless Supabase and Postgres are loopback-only.');
  }
}

function assertAgentEmail(email: string): string {
  const normalized = email.toLowerCase();
  if (!/^[^\s@]+@agent\.local$/.test(normalized)) {
    fail('Fixture email must use the @agent.local namespace.');
  }
  return normalized;
}

function parseRole(input: string): CommunityRole {
  if (!(COMMUNITY_ROLES as readonly string[]).includes(input)) {
    fail(`Invalid --role. Expected one of: ${COMMUNITY_ROLES.join(', ')}.`);
  }
  return input as CommunityRole;
}

function parseCommunityType(input: string): CommunityType {
  if (!(COMMUNITY_TYPES as readonly string[]).includes(input)) {
    fail(`Invalid --type. Expected one of: ${COMMUNITY_TYPES.join(', ')}.`);
  }
  return input as CommunityType;
}

async function findCommunity(slug: string): Promise<{ id: number; slug: string }> {
  if (!/^agent-[a-z0-9-]+$/.test(slug)) {
    fail('Fixture user --community must use an agent- community slug.');
  }
  const row = await createUnscopedClient()
    .select({ id: communities.id, slug: communities.slug })
    .from(communities)
    .where(eq(communities.slug, slug))
    .limit(1);
  if (!row[0]) fail(`Community "${slug}" does not exist. Create it first or use a seeded slug.`);
  return row[0];
}

async function createUser(input: FlagMap): Promise<void> {
  const community = await findCommunity(required(input, 'community'));
  const email = assertAgentEmail(required(input, 'email'));
  const fullName = required(input, 'name');
  const role = parseRole(required(input, 'role'));
  const designation = optional(input, 'designation');
  if (designation && designation !== 'board_president' && designation !== 'board_member') {
    fail('Invalid --designation. Expected board_president or board_member.');
  }

  const auth = await createAuthUserBoundTo({
    email,
    fullName,
    metadata: { propertypro_agent_fixture: true },
  });
  if (!auth.ok) fail(`Failed to create Auth user: ${auth.error}`);

  try {
    const db = createUnscopedClient();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: auth.userId, email, fullName });
      // The scoped client accepts the Drizzle database surface; transactions
      // intentionally omit the root client's `$client` property at its generic
      // boundary while still implementing every query method it needs.
      const scoped = createScopedClient(
        community.id,
        tx as unknown as Parameters<typeof createScopedClient>[1],
      );
      await scoped.insert(userRoles, {
        userId: auth.userId,
        role,
        isUnitOwner: input.owner === true,
        designation: designation ?? null,
        displayTitle: role === 'resident' ? (input.owner === true ? 'Owner' : 'Resident') : null,
      });
      await scoped.insert(notificationPreferences, {
        userId: auth.userId,
        emailFrequency: 'immediate',
        emailAnnouncements: true,
        emailMeetings: true,
        inAppEnabled: true,
      });
    });
  } catch (error) {
    const rollback = await rollBackAuthUser(auth.userId);
    throw new Error(`Fixture user database creation failed (${rollback}): ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    email,
    userId: auth.userId,
    community: community.slug,
    loginUrl: `/dev/agent-login?email=${encodeURIComponent(email)}&communityId=${community.id}`,
  }, null, 2));
}

async function createCommunity(input: FlagMap): Promise<void> {
  const slug = required(input, 'slug');
  if (!/^agent-[a-z0-9-]+$/.test(slug)) {
    fail('Fixture community --slug must start with agent- and contain only lowercase letters, numbers, and hyphens.');
  }
  const email = assertAgentEmail(required(input, 'root-email'));
  const fullName = required(input, 'root-name');
  const auth = await createAuthUserBoundTo({
    email,
    fullName,
    metadata: { propertypro_agent_fixture: true },
  });
  if (!auth.ok) fail(`Failed to create root Auth user: ${auth.error}`);

  let createdCommunityId: number | null = null;
  try {
    const db = createUnscopedClient();
    await db.insert(users).values({ id: auth.userId, email, fullName });
    const result = await createCommunityForPm({
      userId: auth.userId,
      name: required(input, 'name'),
      communityType: parseCommunityType(required(input, 'type')),
      addressLine1: '1 Agent Test Way',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      subdomain: slug,
      timezone: optional(input, 'timezone') ?? 'America/New_York',
      unitCount: 1,
    });
    createdCommunityId = result.communityId;
    await db
      .update(communities)
      .set({ subscriptionPlan: optional(input, 'plan') ?? 'professional', subscriptionStatus: 'active' })
      .where(eq(communities.id, result.communityId));
    console.log(JSON.stringify({
      ok: true,
      communityId: result.communityId,
      slug: result.slug,
      rootEmail: email,
      loginUrl: `/dev/agent-login?email=${encodeURIComponent(email)}&communityId=${result.communityId}`,
    }, null, 2));
  } catch (error) {
    const db = createUnscopedClient();
    const committed = createdCommunityId !== null || (await db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, slug))
      .limit(1))[0];
    if (committed) {
      throw new Error(
        `Fixture community creation committed but post-create setup failed; preserving ${email} so its Auth and public user IDs remain aligned: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await db.delete(users).where(eq(users.id, auth.userId));
    const rollback = await rollBackAuthUser(auth.userId);
    throw new Error(`Fixture community creation failed (${rollback}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  assertSandbox();
  const [kind, ...args] = process.argv.slice(2);
  if (kind !== 'user' && kind !== 'community') {
    fail('Usage: agent-fixture.ts user|community --flags');
  }
  const input = flags(args);
  if (kind === 'user') await createUser(input);
  else await createCommunity(input);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeUnscopedClient());
