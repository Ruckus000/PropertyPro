/**
 * Tabbed Demo Preview — landing page, board portal, and mobile app views.
 *
 * Server component that generates fresh 1-hour tokens and renders the
 * appropriate preview pane based on the ?tab= search param.
 */
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDemoById } from '@/lib/db/demo-queries';
import {
  generateDemoToken,
  decryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { DemoToolbar, type PreviewTab } from '@/components/demo/DemoToolbar';
import { TabbedPreviewClient } from '@/components/demo/TabbedPreviewClient';

const VALID_TABS: PreviewTab[] = ['landing', 'board', 'mobile'];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function DemoPreviewPage({ params, searchParams }: PageProps) {
  await requirePlatformAdmin();

  const [{ id: idRaw }, { tab: tabRaw }] = await Promise.all([params, searchParams]);
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const activeTab: PreviewTab = VALID_TABS.includes(tabRaw as PreviewTab)
    ? (tabRaw as PreviewTab)
    : 'board';

  const { data: demo } = await getDemoById(id);
  if (!demo) notFound();

  // Decrypt the HMAC secret
  const encryptionKey = process.env.DEMO_TOKEN_ENCRYPTION_KEY_HEX ?? '';
  const secret = decryptDemoTokenSecret(demo.auth_token_secret, encryptionKey);
  if (!secret) notFound();

  // Generate fresh 1-hour tokens
  const boardToken = demo.demo_board_user_id
    ? generateDemoToken({
        demoId: demo.id,
        userId: demo.demo_board_user_id,
        role: 'board',
        secret,
        ttlSeconds: 3600,
      })
    : null;

  const residentToken = demo.demo_resident_user_id
    ? generateDemoToken({
        demoId: demo.id,
        userId: demo.demo_resident_user_id,
        role: 'resident',
        secret,
        ttlSeconds: 3600,
      })
    : null;

  // Build URLs
  const webBaseUrl =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3000`
      : `https://${demo.slug}.propertyprofl.com`;

  const boardUrl = boardToken ? `${webBaseUrl}/api/v1/auth/demo-login?token=${boardToken}&preview=true` : null;
  const residentUrl = residentToken
    ? `${webBaseUrl}/api/v1/auth/demo-login?token=${residentToken}&preview=true`
    : null;
  const landingUrl = `${webBaseUrl}/${demo.slug}?preview=true`;

  return (
    <div className="flex h-screen flex-col">
      <DemoToolbar
        demoId={demo.id}
        prospectName={demo.prospect_name}
        templateType={demo.template_type}
        createdAt={demo.created_at}
        activeTab={activeTab}
        variant="full"
        communityId={demo.seeded_community_id ?? undefined}
      />
      <TabbedPreviewClient
        activeTab={activeTab}
        landingUrl={landingUrl}
        boardUrl={boardUrl}
        residentUrl={residentUrl}
      />
    </div>
  );
}
