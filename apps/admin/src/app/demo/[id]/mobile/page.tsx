/**
 * Full-Screen Mobile Demo Preview — resident mobile view on dark background.
 *
 * Server component that generates a fresh 1-hour resident token.
 * No admin chrome — this is the page to show prospects on a large screen.
 */
import { notFound } from 'next/navigation';
import { getDemoById } from '@/lib/db/demo-queries';
import {
  generateDemoToken,
  decryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { MobilePreviewClient } from './MobilePreviewClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DemoMobilePage({ params }: PageProps) {
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

  return <MobilePreviewClient src={residentUrl} splitPreviewHref={`/demo/${demo.id}/preview`} />;
}
