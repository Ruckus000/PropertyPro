import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '@/lib/markdown';
import type { LegalDocKey, LegalDocs } from '@/lib/legal-types';

// Re-export so existing importers of `LegalDocKey` from this module keep working.
export type { LegalDocKey, LegalDocs } from '@/lib/legal-types';

/** Reads a legal markdown file and renders it as HTML.
 *  Synchronous so the synchronous MarketingFooter render path can use it. */
function readDoc(key: LegalDocKey): string {
  const filePath = path.join(process.cwd(), 'src', 'content', 'legal', `${key}.md`);
  const markdown = fs.readFileSync(filePath, 'utf-8');
  return renderMarkdown(markdown);
}

export function getLegalDoc(key: LegalDocKey): string {
  return readDoc(key);
}

export function getLegalDocs(): LegalDocs {
  return { terms: readDoc('terms'), privacy: readDoc('privacy') };
}
