/**
 * Extension lists for the editor primitive's two modes.
 *
 *   - 'authored' mode: full extension set for in-app document authoring
 *     (images, tables, alignment, underline, document-link chips).
 *   - 'narrow' mode: matches the existing announcement HTML allowlist
 *     exactly (no images, tables, alignment, or underline). Used by the
 *     announcements composer and violation resolution-notes field.
 *
 * The consumer's sanitizer must allow exactly the tags these extensions
 * emit. See:
 *   - apps/web/src/lib/utils/html-sanitizer.ts (narrow)
 *   - apps/web/src/lib/utils/sanitize-authored-html.ts (authored)
 */
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import type { Extensions } from '@tiptap/core';

import { DocumentLinkNode } from './DocumentLinkNode';

export type EditorMode = 'authored' | 'narrow';

export const ALLOWED_LINK_PROTOCOLS = ['http', 'https', 'mailto', 'tel'] as const;

/**
 * Strict scheme allowlist for the Link extension.
 *
 * Plain `startsWith('/')` would let in protocol-relative `//evil.com`, which
 * the sanitizer also rejects but the editor primitive should not even
 * produce. Document-link chips (internal references) go through
 * DocumentLinkNode, not Link, so we don't need a relative branch here.
 *
 * Exported for unit tests.
 */
export function isAllowedLinkHref(href: unknown): boolean {
  if (typeof href !== 'string' || href.length === 0) return false;
  const trimmed = href.trim().toLowerCase();
  return ALLOWED_LINK_PROTOCOLS.some((p) => trimmed.startsWith(`${p}:`));
}

function buildLinkExtension() {
  return Link.configure({
    openOnClick: false,
    autolink: false,
    linkOnPaste: true,
    HTMLAttributes: {
      class: 'editor-link',
      rel: 'noopener noreferrer',
      target: '_blank',
    },
    protocols: [...ALLOWED_LINK_PROTOCOLS],
    validate: isAllowedLinkHref,
  });
}

export function buildExtensions(mode: EditorMode): Extensions {
  if (mode === 'narrow') {
    return [
      StarterKit.configure({
        // Narrow mode mirrors the existing announcement allowlist:
        // p, br, b, i, em, strong, a, ul, ol, li, h1-h6, blockquote, code, pre.
        // Disable nodes the sanitizer would strip.
        horizontalRule: false,
        codeBlock: { HTMLAttributes: { class: 'editor-code-block' } },
        blockquote: { HTMLAttributes: { class: 'editor-blockquote' } },
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      buildLinkExtension(),
    ];
  }

  // Authored mode: full set.
  return [
    StarterKit.configure({
      horizontalRule: false,
      codeBlock: { HTMLAttributes: { class: 'editor-code-block' } },
      blockquote: { HTMLAttributes: { class: 'editor-blockquote' } },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
      defaultAlignment: 'left',
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: 'editor-image',
      },
    }),
    Table.configure({
      resizable: false,
      HTMLAttributes: { class: 'editor-table' },
    }),
    TableRow,
    TableHeader,
    TableCell,
    DocumentLinkNode,
    buildLinkExtension(),
  ];
}
