'use client';

/**
 * JSX Template Editor — in-browser code editor with live preview.
 *
 * Uses CodeMirror 6 for JSX editing and a sandboxed iframe for preview.
 * Must be loaded via next/dynamic({ ssr: false }) because CodeMirror
 * accesses browser APIs at import time.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2, Save, Upload, Code, Eye, Clipboard, Check, XCircle } from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsxTemplateEditorProps {
  communityId: number;
  /** Called after a successful save or publish, e.g. to refresh preview iframes. */
  onSaved?: () => void;
  /** Override the default JSX template shown when no draft or published template exists. */
  defaultJsx?: string;
  /** When provided, a "Copy for Claude" button appears that copies this context prepended to the editor content. */
  brandingContext?: string;
  /** Template variant — determines which template is loaded/saved. Default: 'public'. */
  variant?: 'public' | 'mobile';
  /** Branding colors to inject into the preview iframe's CSS variables. Falls back to defaults. */
  brandingColors?: { primary: string; secondary: string; accent: string };
}

interface TemplateContent {
  jsxSource?: string;
  compiledHtml?: string;
  compiledAt?: string;
}

interface SiteBlock {
  id: number;
  content: TemplateContent;
  is_draft: boolean;
  published_at: string | null;
  updated_at: string;
}

type ActiveTab = 'code' | 'preview';

// ---------------------------------------------------------------------------
// Default JSX template
// ---------------------------------------------------------------------------

export const DEFAULT_JSX = `function App() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-[var(--pp-primary)] text-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">Community Name</h1>
          <a href="/auth/login" className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors">
            Resident Login
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--pp-primary)] to-[var(--pp-accent)] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Welcome to Your Community</h2>
          <p className="text-xl opacity-90 mb-8">Your digital hub for community information and resources.</p>
          <a href="/auth/login" className="inline-block bg-white text-[var(--pp-primary)] font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors">
            Access Portal
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-[var(--pp-primary)]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📄</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Documents</h3>
            <p className="text-gray-600">Access governing documents, budgets, and meeting minutes.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-[var(--pp-primary)]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📅</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Meetings</h3>
            <p className="text-gray-600">View upcoming meetings and access past meeting records.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-[var(--pp-primary)]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📢</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Announcements</h3>
            <p className="text-gray-600">Stay informed with community news and updates.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p>&copy; {new Date().getFullYear()} Community Name. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}`;

// ---------------------------------------------------------------------------
// Preview iframe srcdoc builder
// ---------------------------------------------------------------------------

// CDN URLs with pinned versions.
// React 19 dropped UMD builds, so preview uses React 18 UMD (visual output is identical).
// Published templates compile server-side with the project's actual React 19.
const CDN_REACT = 'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js';
const CDN_REACT_DOM = 'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js';
const CDN_BABEL = 'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.10/babel.min.js';
const CDN_TAILWIND = 'https://cdn.tailwindcss.com/3.4.17';

export function buildPreviewSrcdoc(
  jsxSource: string,
  colors?: { primary: string; secondary: string; accent: string },
): string {
  const primary = colors?.primary ?? '#2563EB';
  const secondary = colors?.secondary ?? '#1E40AF';
  const accent = colors?.accent ?? '#3B82F6';
  // JSON.stringify escapes quotes, newlines, backslashes.
  // We also replace </ with <\/ to prevent </script> from closing the HTML script block.
  const encodedSource = JSON.stringify(jsxSource).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --pp-primary: ${primary};
      --pp-secondary: ${secondary};
      --pp-accent: ${accent};
    }
    body { margin: 0; }
    .pp-loading { padding: 24px; color: #6b7280; font-family: system-ui, sans-serif; }
    .pp-error {
      padding: 24px; margin: 16px; font-family: ui-monospace, monospace; font-size: 13px;
      color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
      white-space: pre-wrap; word-break: break-word;
    }
  </style>
</head>
<body>
  <div id="root"><p class="pp-loading">Loading preview\u2026</p></div>
  <script>
  (function() {
    var root = document.getElementById('root');

    function showError(msg) {
      root.innerHTML = '<div class="pp-error">' + String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
    }

    window.onerror = function(msg, src, line, col, err) {
      showError('Runtime error: ' + (err ? err.message : msg));
    };

    function loadScript(url) {
      return new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = function() { reject(new Error('Failed to load: ' + url)); };
        document.head.appendChild(s);
      });
    }

    loadScript('${CDN_REACT}')
      .then(function() { return loadScript('${CDN_REACT_DOM}'); })
      .then(function() { return loadScript('${CDN_BABEL}'); })
      .then(function() { return loadScript('${CDN_TAILWIND}'); })
      .then(function() {
        var jsxSource = ${encodedSource};
        var transformed = Babel.transform(
          jsxSource + '\\n;typeof App !== "undefined" ? App : null;',
          { presets: ['react'], filename: 'template.jsx' }
        );
        var fn = new Function('React', 'ReactDOM', 'return eval(' + JSON.stringify(transformed.code) + ');');
        var App = fn(React, ReactDOM);
        if (!App) {
          showError('No App component found.\\nDefine: function App() { return <div>...</div>; }');
          return;
        }
        ReactDOM.createRoot(root).render(React.createElement(App));
      })
      .catch(function(err) { showError(err.message || String(err)); });
  })();
  <\/script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JsxTemplateEditor({ communityId, onSaved, defaultJsx, brandingContext, variant = 'public', brandingColors }: JsxTemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');
  const [jsxSource, setJsxSource] = useState('');
  const [draft, setDraft] = useState<SiteBlock | null>(null);
  const [published, setPublished] = useState<SiteBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [clipboardState, setClipboardState] = useState<'idle' | 'copied' | 'error'>('idle');

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const jsxRef = useRef(jsxSource);

  // Keep ref in sync for debounced listener
  useEffect(() => {
    jsxRef.current = jsxSource;
  }, [jsxSource]);

  // Snapshot of JSX source captured when the user clicks Preview.
  // Decoupled from jsxSource so the blob URL doesn't rebuild on every keystroke.
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  const previewBlobUrl = useMemo(() => {
    if (previewSource === null) return null;
    const html = buildPreviewSrcdoc(previewSource, brandingColors);
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  }, [previewSource, brandingColors]);

  // Revoke blob URL on change or unmount
  useEffect(() => {
    return () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); };
  }, [previewBlobUrl]);

  // ---------------------------------------------------------------------------
  // Load template on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/communities/${communityId}/site-template?variant=${variant}`);
        if (!res.ok) throw new Error('Failed to load template');
        const data = await res.json();
        if (cancelled) return;

        setDraft(data.draft);
        setPublished(data.published);

        const source = (data.draft?.content as TemplateContent)?.jsxSource
          ?? (data.published?.content as TemplateContent)?.jsxSource
          ?? defaultJsx ?? DEFAULT_JSX;
        setJsxSource(source);
      } catch {
        if (!cancelled) setError('Failed to load template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [communityId, variant]);

  // ---------------------------------------------------------------------------
  // Initialize CodeMirror
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (loading || !editorRef.current || viewRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setJsxSource(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: jsxSource,
      extensions: [
        basicSetup,
        javascript({ jsx: true, typescript: true }),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const saveDraft = useCallback(async () => {
    clearMessages();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/communities/${communityId}/site-template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsxSource, variant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Save failed');
      setDraft(data.draft);
      setSuccess('Draft saved');
      setTimeout(() => setSuccess(null), 3000);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [communityId, jsxSource, variant, clearMessages, onSaved]);

  const publishTemplate = useCallback(async () => {
    clearMessages();

    // Save draft first
    setSaving(true);
    try {
      const saveRes = await fetch(`/api/admin/communities/${communityId}/site-template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsxSource, variant }),
      });
      if (!saveRes.ok) {
        const data = await saveRes.json();
        throw new Error(data.error?.message ?? 'Failed to save draft before publish');
      }
      const saveData = await saveRes.json();
      setDraft(saveData.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
      return;
    }
    setSaving(false);

    // Now publish
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/communities/${communityId}/site-template/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Publish failed');
      setPublished(data.published);
      setSuccess('Template published successfully');
      setTimeout(() => setSuccess(null), 5000);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }, [communityId, jsxSource, variant, clearMessages, onSaved]);

  const copyForClaude = useCallback(async () => {
    if (!brandingContext) return;
    try {
      await navigator.clipboard.writeText(brandingContext + '\n\n' + jsxSource);
      setClipboardState('copied');
      setTimeout(() => setClipboardState('idle'), 2000);
    } catch {
      setClipboardState('error');
      setTimeout(() => setClipboardState('idle'), 2000);
    }
  }, [brandingContext, jsxSource]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-500">Loading template editor…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Tab toggle */}
          <button
            onClick={() => setActiveTab('code')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'code'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Code className="h-4 w-4" />
            Code
          </button>
          <button
            onClick={() => { setPreviewSource(jsxSource); setActiveTab('preview'); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'preview'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
          {brandingContext && (
            <button
              onClick={() => { void copyForClaude(); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                clipboardState === 'copied'
                  ? 'bg-green-100 text-green-700'
                  : clipboardState === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              }`}
            >
              {clipboardState === 'copied'
                ? <Check className="h-4 w-4" />
                : clipboardState === 'error'
                  ? <XCircle className="h-4 w-4" />
                  : <Clipboard className="h-4 w-4" />}
              {clipboardState === 'copied'
                ? 'Copied!'
                : clipboardState === 'error'
                  ? 'Copy failed'
                  : 'Copy for Claude'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status */}
          {published && (
            <span className="text-xs text-gray-500">
              Published {new Date(published.published_at!).toLocaleDateString()}
            </span>
          )}
          {draft && !published && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              Draft
            </span>
          )}

          {/* Save Draft */}
          <button
            onClick={saveDraft}
            disabled={saving || publishing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </button>

          {/* Publish */}
          <button
            onClick={publishTemplate}
            disabled={saving || publishing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Publish
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Editor / Preview area — both are always mounted so CodeMirror's DOM
           node persists across tab switches (imperative library, can't unmount). */}
      <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
        <div
          ref={editorRef}
          className="h-full"
          style={{ display: activeTab === 'code' ? 'block' : 'none' }}
        />
        {previewBlobUrl && (
          <iframe
            title="Template Preview"
            // allow-same-origin is required for the blob iframe to load external CDN
            // scripts (React, Babel, Tailwind). This means the iframe shares the admin
            // app's origin, but the template author is already a trusted platform admin.
            // Published templates go through server-side sanitization (DOMPurify) separately.
            sandbox="allow-scripts allow-same-origin"
            src={previewBlobUrl}
            className="w-full h-full border-0"
            style={{ display: activeTab === 'preview' ? 'block' : 'none' }}
          />
        )}
      </div>

      {/* Help text */}
      <p className="text-xs text-gray-500">
        Define a <code className="bg-gray-100 px-1 py-0.5 rounded">function App()</code> that returns JSX.
        Use Tailwind CSS classes for styling. Theme variables available:{' '}
        <code className="bg-gray-100 px-1 py-0.5 rounded">var(--pp-primary)</code>,{' '}
        <code className="bg-gray-100 px-1 py-0.5 rounded">var(--pp-accent)</code>.
      </p>
    </div>
  );
}
