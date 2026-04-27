'use client';

/**
 * Editor — TipTap-based rich-text editor primitive.
 *
 * Two modes:
 *  - 'authored' for in-app document authoring (full extensions).
 *  - 'narrow'   for announcements / violation notes (matches the existing
 *               narrow sanitizer allowlist).
 *
 * The editor emits HTML via onChange. The CONSUMER is responsible for
 * sending the HTML to the server, where it MUST be sanitized again
 * (sanitizeAuthoredHtml or the existing narrow sanitizeHtml). Sanitization
 * is deliberately not done client-side here — server is the source of
 * truth and DOMPurify in the client bundle would be unnecessary weight.
 */
import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/react';

import { Toolbar } from './Toolbar';
import { buildExtensions, type EditorMode } from './extensions';

export interface EditorProps {
  mode: EditorMode;
  /** Initial HTML. Subsequent prop changes are NOT applied — the editor is
   *  uncontrolled by design (controlled mode would clobber autosave). */
  initialHtml?: string;
  onChange?: (html: string) => void;
  onImageUpload?: (file: File) => Promise<{ url: string; alt?: string }>;
  onPickDocument?: () => Promise<
    { documentId: number; title: string; category: string | null } | null
  >;
  placeholder?: string;
  disabled?: boolean;
  /** Optional ref to imperatively access the underlying TipTap editor. */
  editorRef?: React.MutableRefObject<TiptapEditor | null>;
  /** A11y: label for the editor surface. Defaults to "Document body". */
  ariaLabel?: string;
}

const surfaceStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-md, 10px)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const contentStyle: React.CSSProperties = {
  padding: 'var(--space-4, 16px)',
  minHeight: 320,
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: 16,
  lineHeight: 1.6,
};

export function Editor({
  mode,
  initialHtml = '',
  onChange,
  onImageUpload,
  onPickDocument,
  disabled,
  editorRef,
  ariaLabel = 'Document body',
}: EditorProps) {
  const extensions = React.useMemo(() => buildExtensions(mode), [mode]);

  const editor = useEditor({
    extensions,
    content: initialHtml,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        role: 'textbox',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
  });

  // Keep editable state in sync with disabled prop changes.
  React.useEffect(() => {
    if (!editor) return;
    if (editor.isEditable === !disabled) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Expose the editor instance via the optional ref.
  React.useEffect(() => {
    if (!editorRef) return;
    editorRef.current = editor ?? null;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor, editorRef]);

  return (
    <div style={surfaceStyle}>
      <Toolbar
        editor={editor}
        mode={mode}
        onImageUpload={onImageUpload}
        onPickDocument={onPickDocument}
        disabled={disabled}
      />
      <div style={contentStyle}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
