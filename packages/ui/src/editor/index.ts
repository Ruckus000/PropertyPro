/**
 * @propertypro/ui/editor — TipTap-based rich-text editor primitive.
 *
 * Lazy-load via:
 *   const Editor = dynamic(
 *     () => import('@propertypro/ui/editor').then((m) => m.Editor),
 *     { ssr: false }
 *   );
 *
 * The editor emits HTML via onChange. Sanitization MUST happen server-side
 * on receipt — see apps/web/src/lib/utils/sanitize-authored-html.ts (authored
 * mode) and apps/web/src/lib/utils/html-sanitizer.ts (narrow mode).
 */
export { Editor } from './Editor';
export type { EditorProps } from './Editor';
export type { EditorMode } from './extensions';
export { buildExtensions, isAllowedLinkHref, ALLOWED_LINK_PROTOCOLS } from './extensions';
export { DocumentLinkNode } from './DocumentLinkNode';
export type { DocumentLinkAttrs } from './DocumentLinkNode';
