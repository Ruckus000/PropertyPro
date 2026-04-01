import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '@/lib/markdown';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for PropertyPro Florida — compliance and community management platform for Florida condominium associations.',
};

function getTermsContent(): string {
  const filePath = path.join(process.cwd(), 'src', 'content', 'legal', 'terms.md');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  return renderMarkdown(markdown);
}

export default function TermsPage() {
  const html = getTermsContent();

  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
