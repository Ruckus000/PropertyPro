/**
 * Public demo landing page.
 *
 * Renders a branded landing page for a demo instance. No authentication
 * required — the page is publicly accessible via /demo/[slug].
 *
 * Two HTML forms POST to /api/v1/demo/[slug]/enter with a hidden `role`
 * field so role selection works without client-side JavaScript.
 */
import { notFound } from 'next/navigation';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import type { DemoTheme } from '@propertypro/db';

interface DemoLandingPageProps {
  params: Promise<{ slug: string }>;
}

async function getDemoInstance(slug: string) {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: demoInstances.id,
      slug: demoInstances.slug,
      prospectName: demoInstances.prospectName,
      theme: demoInstances.theme,
      seededCommunityId: demoInstances.seededCommunityId,
      communityName: communities.name,
      communityType: communities.communityType,
      demoExpiresAt: communities.demoExpiresAt,
      isDemo: communities.isDemo,
      communityDeletedAt: communities.deletedAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(communities.id, demoInstances.seededCommunityId))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

function buildLogoUrl(logoPath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${supabaseUrl}/storage/v1/object/public/branding/${logoPath}`;
}

function communityTypeLabel(type: string): string {
  switch (type) {
    case 'condo_718':
      return 'Condominium';
    case 'hoa_720':
      return 'HOA';
    case 'apartment':
      return 'Apartment Community';
    default:
      return 'Community';
  }
}

export default async function DemoLandingPage({ params }: DemoLandingPageProps) {
  const { slug } = await params;

  const instance = await getDemoInstance(slug);

  if (!instance) {
    notFound();
  }

  const isExpired =
    instance.demoExpiresAt !== null && new Date(instance.demoExpiresAt) < new Date();

  const theme = (instance.theme ?? {}) as DemoTheme;
  const primaryColor = theme.primaryColor ?? '#2563eb';
  const logoUrl = theme.logoPath ? buildLogoUrl(theme.logoPath) : null;
  const typeLabel = communityTypeLabel(instance.communityType);
  const enterPath = `/api/v1/demo/${slug}/enter`;

  if (isExpired) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] px-4">
        <div
          className="w-full max-w-md rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center"
          style={{ boxShadow: 'var(--shadow-e0)' }}
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${instance.communityName} logo`}
              className="mx-auto mb-6 h-12 w-auto object-contain"
            />
          )}
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
            This demo has expired
          </h1>
          <p className="text-base text-[var(--text-secondary)]">
            The demo for <strong>{instance.communityName}</strong> is no longer available.
            Contact your PropertyPro representative for a new demo link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] px-4">
      <div
        className="w-full max-w-md rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center"
        style={{ boxShadow: 'var(--shadow-e0)' }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${instance.communityName} logo`}
            className="mx-auto mb-6 h-14 w-auto object-contain"
          />
        ) : (
          <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center">
            <span className="text-2xl font-bold text-[var(--text-tertiary)]" aria-hidden="true">
              {instance.communityName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
          {instance.communityName}
        </h1>

        <span className="inline-block rounded-full px-3 py-1 text-sm font-medium bg-[var(--surface-subtle)] text-[var(--text-secondary)] mb-6">
          {typeLabel}
        </span>

        <p className="text-base text-[var(--text-secondary)] mb-8">
          Welcome to your interactive demo. Choose how you'd like to explore the platform.
        </p>

        <div className="space-y-3">
          <form action={enterPath} method="POST">
            <input type="hidden" name="role" value="board" />
            <button
              type="submit"
              className="w-full rounded-[10px] px-4 py-3 text-base font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                backgroundColor: primaryColor,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ['--tw-ring-color' as any]: primaryColor,
              }}
            >
              Enter as Board Member
            </button>
          </form>

          <form action={enterPath} method="POST">
            <input type="hidden" name="role" value="resident" />
            <button
              type="submit"
              className="w-full rounded-[10px] border border-[var(--border-default)] bg-transparent px-4 py-3 text-base font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2"
            >
              Enter as Resident
            </button>
          </form>
        </div>

        <p className="mt-8 text-sm text-[var(--text-tertiary)]">
          Demo prepared for <span className="font-medium">{instance.prospectName}</span>
        </p>
      </div>
    </main>
  );
}
