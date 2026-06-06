import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '@/lib/markdown';

export type LegalDocKey = 'terms' | 'privacy';

/** Reads a legal markdown file and renders it as marketing-themed HTML.
 *  Synchronous so the synchronous MarketingFooter render path can use it. */
function readDoc(key: LegalDocKey): string {
  const filePath = path.join(process.cwd(), 'src', 'content', 'legal', `${key}.md`);
  const markdown = fs.readFileSync(filePath, 'utf-8');
  return renderMarkdown(markdown, { variant: 'marketing' });
}

export function getLegalDoc(key: LegalDocKey): string {
  return readDoc(key);
}

export function getLegalDocs(): { terms: string; privacy: string } {
  return { terms: readDoc('terms'), privacy: readDoc('privacy') };
}
