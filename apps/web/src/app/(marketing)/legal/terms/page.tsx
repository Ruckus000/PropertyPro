import type { Metadata } from 'next';
import { getLegalDoc } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for PropertyPro Florida — compliance and community management platform for Florida condominium associations.',
};

export default function TermsPage() {
  return <div dangerouslySetInnerHTML={{ __html: getLegalDoc('terms') }} />;
}
