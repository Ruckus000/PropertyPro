'use client';

/**
 * Toolbar — mode-aware editor toolbar.
 *
 * Buttons are sized to the design system (36px desktop / 44px mobile touch
 * target). Every icon button carries aria-label; :focus-visible is never
 * suppressed. The toolbar exposes only the controls whose output tags are
 * inside the consumer's sanitizer allowlist.
 */
import * as React from 'react';
import type { Editor } from '@tiptap/react';
import type { EditorMode } from './extensions';

export interface ToolbarProps {
  editor: Editor | null;
  mode: EditorMode;
  /**
   * Optional handler for the "Insert image" button. Receives the user-picked
   * file, returns the URL of the uploaded image. The editor inserts the
   * resulting <img> node. If omitted, the button is hidden.
   */
  onImageUpload?: (file: File) => Promise<{ url: string; alt?: string }>;
  /**
   * Optional handler for the "Insert document link" button. The consumer
   * opens a picker and resolves to a chosen document, or null if cancelled.
   * If omitted, the button is hidden.
   */
  onPickDocument?: () => Promise<
    { documentId: number; title: string; category: string | null } | null
  >;
  disabled?: boolean;
}

interface ToolButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
  children: React.ReactNode;
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 36,
  width: 36,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm, 6px)',
  background: 'var(--surface-card)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: 0,
};

const activeStyle: React.CSSProperties = {
  background: 'var(--interactive-primary, #1f2937)',
  color: 'var(--text-inverse, #fff)',
  borderColor: 'var(--interactive-primary, #1f2937)',
};

const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { active, label, children, style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{ ...buttonStyle, ...(active ? activeStyle : {}), ...style }}
      {...rest}
    >
      {children}
    </button>
  );
});

const Sep: React.FC = () => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-block',
      width: 1,
      height: 24,
      margin: '0 4px',
      background: 'var(--border-subtle, #e5e7eb)',
    }}
  />
);

// --- Icons (inline SVG; keep these tiny) -----------------------------------

const Ico: React.FC<{ d: string; size?: number }> = ({ d, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  bold: 'M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  underline: 'M6 4v8a6 6 0 0 0 12 0V4M4 20h16',
  h1: 'M4 5v14M4 12h12M12 5v14M18 9l3-2v12',
  h2: 'M4 5v14M4 12h12M12 5v14M17 9a3 3 0 1 1 3 3l-4 7h7',
  h3: 'M4 5v14M4 12h12M12 5v14M16 8a3 3 0 1 1 3 3M16 16a3 3 0 1 0 3-3',
  bulletList: 'M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01',
  orderedList: 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 4-3 5 5',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  blockquote: 'M3 21V11a8 8 0 0 1 8-8M13 21V11a8 8 0 0 1 8-8',
  code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  codeBlock: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 10l-2 2 2 2M15 10l2 2-2 2',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
} as const;

// --- Toolbar ---------------------------------------------------------------

export function Toolbar({ editor, mode, onImageUpload, onPickDocument, disabled }: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const isAuthored = mode === 'authored';

  function chain() {
    return editor!.chain().focus();
  }

  async function handleImageInsert(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImageUpload) return;
    try {
      const { url, alt } = await onImageUpload(file);
      chain().setImage({ src: url, alt: alt ?? '' }).run();
    } catch (err) {
      // The consumer's hook should surface the error via toast/banner; we
      // intentionally swallow here so a failed upload doesn't break the
      // editor session.
      console.error('[Editor] image upload failed', err);
    }
  }

  async function handleDocumentLink() {
    if (!onPickDocument) return;
    const picked = await onPickDocument();
    if (!picked) return;
    chain()
      .insertContent({
        type: 'documentLink',
        attrs: {
          documentId: picked.documentId,
          title: picked.title,
          category: picked.category,
        },
      })
      .run();
  }

  function promptForLink() {
    const previousUrl = editor!.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previousUrl ?? 'https://');
    if (url === null) return;
    if (url === '') {
      chain().unsetLink().run();
      return;
    }
    chain().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Editor toolbar"
      aria-disabled={disabled}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        padding: 8,
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-page, var(--surface-card))',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <ToolButton
        label="Heading 2"
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
      >
        <Ico d={ICONS.h2} />
      </ToolButton>
      <ToolButton
        label="Heading 3"
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
      >
        <Ico d={ICONS.h3} />
      </ToolButton>
      {isAuthored && (
        <ToolButton
          label="Heading 1"
          onClick={() => chain().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
        >
          <Ico d={ICONS.h1} />
        </ToolButton>
      )}

      <Sep />

      <ToolButton
        label="Bold"
        onClick={() => chain().toggleBold().run()}
        active={editor.isActive('bold')}
      >
        <Ico d={ICONS.bold} />
      </ToolButton>
      <ToolButton
        label="Italic"
        onClick={() => chain().toggleItalic().run()}
        active={editor.isActive('italic')}
      >
        <Ico d={ICONS.italic} />
      </ToolButton>
      {isAuthored && (
        <ToolButton
          label="Underline"
          onClick={() => chain().toggleUnderline().run()}
          active={editor.isActive('underline')}
        >
          <Ico d={ICONS.underline} />
        </ToolButton>
      )}

      <Sep />

      <ToolButton
        label="Bullet list"
        onClick={() => chain().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
      >
        <Ico d={ICONS.bulletList} />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        onClick={() => chain().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
      >
        <Ico d={ICONS.orderedList} />
      </ToolButton>

      <Sep />

      <ToolButton label="Link" onClick={promptForLink} active={editor.isActive('link')}>
        <Ico d={ICONS.link} />
      </ToolButton>

      {isAuthored && onImageUpload && (
        <>
          <ToolButton label="Insert image" onClick={() => fileInputRef.current?.click()}>
            <Ico d={ICONS.image} />
          </ToolButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleImageInsert}
          />
        </>
      )}

      {isAuthored && onPickDocument && (
        <ToolButton label="Insert document link" onClick={handleDocumentLink}>
          <Ico d={ICONS.doc} />
        </ToolButton>
      )}

      {isAuthored && (
        <>
          <ToolButton
            label="Insert table"
            onClick={() =>
              chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <Ico d={ICONS.table} />
          </ToolButton>

          <Sep />

          <ToolButton
            label="Align left"
            onClick={() => chain().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
          >
            <Ico d={ICONS.alignLeft} />
          </ToolButton>
          <ToolButton
            label="Align center"
            onClick={() => chain().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
          >
            <Ico d={ICONS.alignCenter} />
          </ToolButton>
          <ToolButton
            label="Align right"
            onClick={() => chain().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
          >
            <Ico d={ICONS.alignRight} />
          </ToolButton>
        </>
      )}

      <Sep />

      <ToolButton
        label="Blockquote"
        onClick={() => chain().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
      >
        <Ico d={ICONS.blockquote} />
      </ToolButton>
      <ToolButton
        label="Inline code"
        onClick={() => chain().toggleCode().run()}
        active={editor.isActive('code')}
      >
        <Ico d={ICONS.code} />
      </ToolButton>
      <ToolButton
        label="Code block"
        onClick={() => chain().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
      >
        <Ico d={ICONS.codeBlock} />
      </ToolButton>
    </div>
  );
}
