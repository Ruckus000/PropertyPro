/**
 * Full-Screen Mobile Demo Preview — resident mobile view on dark background.
 *
 * Server component that generates a fresh 1-hour resident token.
 * Includes a toolbar header with a link back to the tabbed preview.
 */
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDemoById } from '@/lib/db/demo-queries';
import {
  generateDemoToken,
  decryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { DemoToolbar } from '@/components/demo/DemoToolbar';
import { MobilePreviewClient } from './MobilePreviewClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DemoMobilePage({ params }: PageProps) {
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

  // Generate fresh 1-hour resident token
  if (!demo.demo_resident_user_id) notFound();

  const residentToken = generateDemoToken({
    demoId: demo.id,
    userId: demo.demo_resident_user_id,
    role: 'resident',
    secret,
    ttlSeconds: 3600,
  });

  const webBaseUrl =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3000`
      : `https://${demo.slug}.propertyprofl.com`;

  const residentUrl = `${webBaseUrl}/api/v1/auth/demo-login?token=${residentToken}&preview=true`;

  return (
    <div className="flex h-screen flex-col">
      <DemoToolbar
        demoId={demo.id}
        prospectName={demo.prospect_name}
        templateType={demo.template_type}
        createdAt={demo.created_at}
        variant="minimal"
        communityId={demo.seeded_community_id ?? undefined}
      />
      <MobilePreviewClient src={residentUrl} />
    </div>
  );
}
