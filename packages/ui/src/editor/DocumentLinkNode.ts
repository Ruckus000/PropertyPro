/**
 * DocumentLinkNode — a custom TipTap inline-atom node that renders an
 * attachment chip referencing another document in the same community.
 *
 * Storage shape (round-trips through sanitizeAuthoredHtml; the data-* attrs
 * are in its allowlist):
 *
 *   <a class="editor-document-link"
 *      data-document-link-id="42"
 *      data-document-link-title="Bylaws v3"
 *      data-document-link-category="declaration"
 *      href="/documents/42">📎 Bylaws v3</a>
 *
 * Sanitizer rejects external/javascript hrefs; this href is a relative
 * in-app path and passes the URL allowlist.
 */
import { Node, mergeAttributes } from '@tiptap/core';

export interface DocumentLinkAttrs {
  documentId: number;
  title: string;
  category: string | null;
}

export const DocumentLinkNode = Node.create({
  name: 'documentLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-document-link-id'),
        renderHTML: (attrs) =>
          attrs.documentId == null ? {} : { 'data-document-link-id': String(attrs.documentId) },
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-document-link-title') ?? '',
        renderHTML: (attrs) => ({ 'data-document-link-title': attrs.title ?? '' }),
      },
      category: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-document-link-category'),
        renderHTML: (attrs) =>
          attrs.category == null ? {} : { 'data-document-link-category': String(attrs.category) },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a.editor-document-link',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const id = node.attrs.documentId;
    const title = String(node.attrs.title ?? '');
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'editor-document-link',
        href: id == null ? '#' : `/documents/${id}`,
      }),
      `📎 ${title}`,
    ];
  },
});
