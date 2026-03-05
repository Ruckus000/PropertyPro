/**
 * Split-Screen Demo Preview — board member dashboard + resident mobile side by side.
 *
 * Server component that generates fresh 1-hour tokens and renders two iframes.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDemoById } from '@/lib/db/demo-queries';
import {
  generateDemoToken,
  decryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import { SplitPreviewClient } from './SplitPreviewClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DemoPreviewPage({ params }: PageProps) {
  await requirePlatformAdmin();

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

  const residentToken = demo.demo_resident_user_id
    ? generateDemoToken({
        demoId: demo.id,
        userId: demo.demo_resident_user_id,
        role: 'resident',
        secret,
        ttlSeconds: 3600,
      })
    : null;

  // Build demo-login URLs
  const webBaseUrl =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3000`
      : `https://${demo.slug}.propertyprofl.com`;

  const boardUrl = boardToken ? `${webBaseUrl}/api/v1/auth/demo-login?token=${boardToken}` : null;
  const residentUrl = residentToken
    ? `${webBaseUrl}/api/v1/auth/demo-login?token=${residentToken}`
    : null;

  const typeLabel =
    COMMUNITY_TYPE_DISPLAY_NAMES[demo.template_type as CommunityType] ?? demo.template_type;

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/demo" className="text-sm text-gray-500 hover:text-gray-700">
            ← Demos
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

      {/* Split view */}
      <SplitPreviewClient boardUrl={boardUrl} residentUrl={residentUrl} />
    </div>
  );
}
