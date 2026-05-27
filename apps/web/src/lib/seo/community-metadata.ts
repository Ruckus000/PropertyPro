import type { Metadata } from 'next';

export interface CommunityMetadataInput {
  id: number;
  slug: string;
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city?: string | null;
  tagline?: string | null;
  /** Fully-qualified URL to the hero image (1600×900 recommended). */
  heroImageUrl?: string | null;
}

const TYPE_TO_NOUN: Record<CommunityMetadataInput['communityType'], string> = {
  condo_718: 'condominium association',
  hoa_720: 'homeowners association',
  apartment: 'apartment community',
};

function defaultDescription(c: CommunityMetadataInput): string {
  const noun = TYPE_TO_NOUN[c.communityType];
  const where = c.city ? `${c.city}, Florida` : 'Florida';
  return `Official site of ${c.name}, a ${noun} in ${where}.`;
}

export function buildCommunityMetadata(community: CommunityMetadataInput): Metadata {
  const description = community.tagline?.trim() || defaultDescription(community);
  const url = `https://${community.slug}.getpropertypro.com`;
  const images = community.heroImageUrl
    ? [{ url: community.heroImageUrl, width: 1600, height: 900, alt: community.name }]
    : [];

  return {
    title: `${community.name} — Community Portal`,
    description,
    openGraph: {
      title: community.name,
      description,
      url,
      siteName: community.name,
      images,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: images.length > 0 ? 'summary_large_image' : 'summary',
      title: community.name,
      description,
    },
    robots: { index: true, follow: true },
  };
}
