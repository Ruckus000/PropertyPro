/**
 * Demo Preview — tabbed layout showing all 4 demo views.
 *
 * Server component that generates fresh 1-hour tokens and renders
 * iframes for public website, mobile app, compliance, and admin dashboard.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDemoById } from '@/lib/db/demo-queries';
import {
  generateDemoToken,
  decryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import { TabbedPreviewClient } from './TabbedPreviewClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getClientDemoLandingUrl } from '@/lib/demo-client-url';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DemoPreviewPage({ params }: PageProps) {
  await requireAdminPageSession();

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

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

  // Build demo-login URLs
  const webBaseUrl =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3000`
      : `https://${demo.slug}.getpropertypro.com`;

  // Public landing page URL for sharing (main web app — same helper as demo wizard)
  const landingPageUrl = getClientDemoLandingUrl(demo.slug);

  const demoLoginBase = `${webBaseUrl}/api/v1/auth/demo-login`;

  // 1. Public Website — public demo landing route
  // Public demo landing page lives on the main domain, not the community subdomain
  const publicUrl = `${landingPageUrl}?preview=true`;

  // 2. Mobile App — preview mode (no auth needed, avoids cross-origin cookie issues)
  const mobileUrl = demo.seeded_community_id
    ? `${webBaseUrl}/mobile?communityId=${demo.seeded_community_id}&preview=true`
    : null;

  // 3. Admin Dashboard — board token (default redirect to /dashboard)
  const adminUrl = boardToken
    ? `${demoLoginBase}?token=${boardToken}&preview=true`
    : null;

  const typeLabel =
    COMMUNITY_TYPE_DISPLAY_NAMES[demo.template_type as CommunityType] ?? demo.template_type;

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/demo" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Demos
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-900">{demo.prospect_name}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/demo/${demo.id}/mobile`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Full-Screen Mobile
          </Link>
        </div>
      </div>

      {/* Tabbed preview */}
      <TabbedPreviewClient
        publicUrl={publicUrl}
        mobileUrl={mobileUrl}
        adminUrl={adminUrl}
        demoId={demo.id}
        communityId={demo.seeded_community_id ?? 0}
        prospectName={demo.prospect_name}
        landingPageUrl={landingPageUrl}
        slug={demo.slug}
      />
    </div>
  );
}
