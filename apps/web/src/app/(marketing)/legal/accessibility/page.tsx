import type { Metadata } from 'next';
import { getLegalDoc } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description:
    'PropertyPro Florida accessibility statement — our WCAG 2.1 AA commitment, known gaps, and how to request an accommodation or report a barrier.',
};

export default function AccessibilityPage() {
  return <div dangerouslySetInnerHTML={{ __html: getLegalDoc('accessibility') }} />;
}
