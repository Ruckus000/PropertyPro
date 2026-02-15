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
      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-800">
          DRAFT DOCUMENT — This document is a placeholder and will be reviewed by legal counsel
          before launch. It does not constitute legal advice.
        </p>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
