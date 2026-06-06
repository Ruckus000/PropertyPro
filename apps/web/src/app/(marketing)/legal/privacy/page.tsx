import type { Metadata } from 'next';
import { getLegalDoc } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for PropertyPro Florida — how we collect, use, and protect your personal information.',
};

export default function PrivacyPage() {
  return <div dangerouslySetInnerHTML={{ __html: getLegalDoc('privacy') }} />;
}
