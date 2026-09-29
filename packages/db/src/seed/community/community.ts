/** The community row itself: config validation, demo lifecycle dates, and the slug-keyed upsert. */
import { eq } from '../../filters';
import { communities } from '../../schema';
import type { CommunityType } from '@propertypro/shared';
import { DAY_MS, db, debugSeed } from './context';
import type { SeedCommunityConfig } from './types';

const DEMO_TRIAL_DURATION_MS = 14 * DAY_MS;
const DEMO_GRACE_DURATION_MS = 7 * DAY_MS;

export function assertValidConfig(config: SeedCommunityConfig): void {
  if (!config.name?.trim()) {
    throw new Error('seedCommunity requires a non-empty config.name');
  }

  if (!config.slug?.trim()) {
    throw new Error('seedCommunity requires a non-empty config.slug');
  }

  if (!/^[a-z0-9-]+$/.test(config.slug)) {
    throw new Error('seedCommunity config.slug must only contain lowercase alphanumeric characters and hyphens');
  }

  if (!config.communityType) {
    throw new Error('seedCommunity requires config.communityType');
  }

  const validCommunityTypes: CommunityType[] = ['condo_718', 'hoa_720', 'apartment'];
  if (!validCommunityTypes.includes(config.communityType)) {
    throw new Error(`seedCommunity received invalid communityType: ${config.communityType}`);
  }

  if (config.isDemo) {
    if (config.trialEndsAt && Number.isNaN(config.trialEndsAt.getTime())) {
      throw new Error('seedCommunity config.trialEndsAt must be a valid Date');
    }

    if (config.demoExpiresAt && Number.isNaN(config.demoExpiresAt.getTime())) {
      throw new Error('seedCommunity config.demoExpiresAt must be a valid Date');
    }

    if (
      config.trialEndsAt
      && config.demoExpiresAt
      && config.trialEndsAt.getTime() > config.demoExpiresAt.getTime()
    ) {
      throw new Error('seedCommunity config.trialEndsAt must be earlier than or equal to config.demoExpiresAt');
    }
  }
}

function resolveDemoLifecycle(config: SeedCommunityConfig): {
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
} {
  const isDemo = config.isDemo ?? false;
  if (!isDemo) {
    return { trialEndsAt: null, demoExpiresAt: null };
  }

  if (config.trialEndsAt && config.demoExpiresAt) {
    return {
      trialEndsAt: new Date(config.trialEndsAt),
      demoExpiresAt: new Date(config.demoExpiresAt),
    };
  }

  if (config.trialEndsAt) {
    return {
      trialEndsAt: new Date(config.trialEndsAt),
      demoExpiresAt: new Date(config.trialEndsAt.getTime() + DEMO_GRACE_DURATION_MS),
    };
  }

  if (config.demoExpiresAt) {
    return {
      trialEndsAt: new Date(config.demoExpiresAt.getTime() - DEMO_GRACE_DURATION_MS),
      demoExpiresAt: new Date(config.demoExpiresAt),
    };
  }

  const now = Date.now();
  return {
    trialEndsAt: new Date(now + DEMO_TRIAL_DURATION_MS),
    demoExpiresAt: new Date(now + DEMO_TRIAL_DURATION_MS + DEMO_GRACE_DURATION_MS),
  };
}

export async function ensureCommunity(config: SeedCommunityConfig): Promise<number> {
  const existing = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, config.slug))
    .limit(1);

  const timezone = config.timezone ?? 'America/New_York';
  const isDemo = config.isDemo ?? false;
  const { trialEndsAt, demoExpiresAt } = resolveDemoLifecycle(config);

  if (existing[0]) {
    // The nightly reset runs against production, where real associations live
    // beside the demos. A slug match alone must never stamp is_demo=true onto
    // one of them (and let later resets delete its data).
    if (isDemo && !existing[0].isDemo) {
      throw new Error(
        `Refusing to convert non-demo community "${config.slug}" (id=${existing[0].id}) into a demo.`,
      );
    }

    const updatePayload: Partial<typeof communities.$inferInsert> = {
      name: config.name,
      communityType: config.communityType,
      timezone,
      addressLine1: config.addressLine1,
      city: config.city,
      state: config.state,
      zipCode: config.zipCode,
      isDemo,
      trialEndsAt,
      demoExpiresAt,
      updatedAt: new Date(),
    };

    if (config.branding !== undefined) {
      updatePayload.branding = config.branding;
    }

    const [updated] = await db
      .update(communities)
      .set(updatePayload)
      .where(eq(communities.id, existing[0].id))
      .returning();

    debugSeed(`community upserted slug=${config.slug} id=${updated!.id} isDemo=${String(isDemo)}`);
    return updated!.id;
  }

  const [created] = await db
    .insert(communities)
    .values({
      name: config.name,
      slug: config.slug,
      communityType: config.communityType,
      timezone,
      addressLine1: config.addressLine1,
      city: config.city,
      state: config.state,
      zipCode: config.zipCode,
      branding: config.branding,
      isDemo,
      trialEndsAt,
      demoExpiresAt,
    })
    .returning();

  debugSeed(`community created slug=${config.slug} id=${created!.id} isDemo=${String(isDemo)}`);
  return created!.id;
}
