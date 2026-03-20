import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '@/lib/markdown';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for PropertyPro Florida — how we collect, use, and protect your personal information.',
};

function getPrivacyContent(): string {
  const filePath = path.join(process.cwd(), 'src', 'content', 'legal', 'privacy.md');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  return renderMarkdown(markdown);
}

export default function PrivacyPage() {
  const html = getPrivacyContent();

  return (
    <article>
      <div className="mb-6 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3">
        <p className="text-sm font-medium text-status-warning">
          DRAFT DOCUMENT — This document is a placeholder and will be reviewed by legal counsel
          before launch. It does not constitute legal advice.
        </p>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
