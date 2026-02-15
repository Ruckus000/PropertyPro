import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Markdown renderer unit tests
// ---------------------------------------------------------------------------

describe('renderMarkdown', () => {
  it('renders headings at all levels', () => {
    const md = '# H1\n\n## H2\n\n### H3';
    const html = renderMarkdown(md);
    expect(html).toContain('<h1');
    expect(html).toContain('H1</h1>');
    expect(html).toContain('<h2');
    expect(html).toContain('H2</h2>');
    expect(html).toContain('<h3');
    expect(html).toContain('H3</h3>');
  });

  it('renders bold text', () => {
    const html = renderMarkdown('This is **bold** text.');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders links', () => {
    const html = renderMarkdown('Visit [our site](https://example.com) now.');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>our site</a>');
  });

  it('renders unordered lists', () => {
    const md = '- First item\n- Second item\n- Third item';
    const html = renderMarkdown(md);
    expect(html).toContain('<ul');
    expect(html).toContain('<li>First item</li>');
    expect(html).toContain('<li>Second item</li>');
    expect(html).toContain('<li>Third item</li>');
    expect(html).toContain('</ul>');
  });

  it('renders horizontal rules', () => {
    const html = renderMarkdown('Above\n\n---\n\nBelow');
    expect(html).toContain('<hr');
  });

  it('renders paragraphs', () => {
    const html = renderMarkdown('This is a paragraph.\n\nThis is another paragraph.');
    expect(html).toContain('<p');
    expect(html).toContain('This is a paragraph.');
    expect(html).toContain('This is another paragraph.');
  });

  it('escapes HTML in content', () => {
    const html = renderMarkdown('Use <script>alert("xss")</script> safely.');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Legal content file tests
// ---------------------------------------------------------------------------

const contentDir = path.resolve(__dirname, '../../src/content/legal');

describe('Terms of Service content', () => {
  const termsPath = path.join(contentDir, 'terms.md');
  const termsContent = fs.readFileSync(termsPath, 'utf-8');
  const termsHtml = renderMarkdown(termsContent);

  it('markdown file exists and is non-empty', () => {
    expect(termsContent.length).toBeGreaterThan(500);
  });

  it('contains the required statutory disclaimer', () => {
    expect(termsContent).toContain(
      'PropertyPro helps you organize and publish documents required by Florida Statutes §718 and §720. This platform does not constitute legal advice.',
    );
  });

  it('includes platform description as technology tool', () => {
    expect(termsContent).toContain('technology platform');
    expect(termsContent).toContain('NOT a law firm');
  });

  it('includes limitation of liability section', () => {
    expect(termsContent).toContain('Limitation of Liability');
    expect(termsContent).toContain('compliance failures');
  });

  it('includes user responsibilities section', () => {
    expect(termsContent).toContain('User Responsibilities');
    expect(termsContent).toContain('Accurate document uploads');
    expect(termsContent).toContain('Timely posting');
  });

  it('includes subscription terms and cancellation', () => {
    expect(termsContent).toContain('Subscription Terms');
    expect(termsContent).toContain('Cancellation');
    expect(termsContent).toContain('Data Retention After Cancellation');
  });

  it('includes acceptable use policy', () => {
    expect(termsContent).toContain('Acceptable Use Policy');
  });

  it('includes the effective date', () => {
    expect(termsContent).toContain('February 14, 2026');
  });

  it('is marked as draft', () => {
    expect(termsContent).toContain('DRAFT');
  });

  it('renders to HTML successfully', () => {
    expect(termsHtml).toContain('<h1');
    expect(termsHtml).toContain('Terms of Service');
  });

  it('link to privacy policy renders correctly', () => {
    expect(termsHtml).toContain('href="/legal/privacy"');
    expect(termsHtml).toContain('Privacy Policy');
  });
});

describe('Privacy Policy content', () => {
  const privacyPath = path.join(contentDir, 'privacy.md');
  const privacyContent = fs.readFileSync(privacyPath, 'utf-8');
  const privacyHtml = renderMarkdown(privacyContent);

  it('markdown file exists and is non-empty', () => {
    expect(privacyContent.length).toBeGreaterThan(500);
  });

  it('includes data collected section with required fields', () => {
    expect(privacyContent).toContain('name');
    expect(privacyContent).toContain('email');
    expect(privacyContent).toContain('phone');
    expect(privacyContent).toContain('Unit number');
    expect(privacyContent).toContain('documents');
  });

  it('includes how data is used', () => {
    expect(privacyContent).toContain('Platform operation');
    expect(privacyContent).toContain('Compliance tracking');
    expect(privacyContent).toContain('Email notifications');
  });

  it('explicitly states data is not sold', () => {
    expect(privacyContent).toContain('does not sell');
  });

  it('includes data retention and deletion policies', () => {
    expect(privacyContent).toContain('Data Retention');
    expect(privacyContent).toContain('Account Deletion');
    expect(privacyContent).toContain('thirty (30)');
  });

  it('includes Florida privacy law compliance', () => {
    expect(privacyContent).toContain('Florida Privacy Law Compliance');
    expect(privacyContent).toContain('Florida Information Protection Act');
  });

  it('mentions Supabase as data processor', () => {
    expect(privacyContent).toContain('Supabase');
    expect(privacyContent).toContain('data processor');
  });

  it('includes contact information for data requests', () => {
    expect(privacyContent).toContain('privacy@propertyprofl.com');
  });

  it('includes the effective date', () => {
    expect(privacyContent).toContain('February 14, 2026');
  });

  it('is marked as draft', () => {
    expect(privacyContent).toContain('DRAFT');
  });

  it('renders to HTML successfully', () => {
    expect(privacyHtml).toContain('<h1');
    expect(privacyHtml).toContain('Privacy Policy');
  });
});

// ---------------------------------------------------------------------------
// Cross-page link tests
// ---------------------------------------------------------------------------

describe('Legal page cross-links', () => {
  const termsContent = fs.readFileSync(path.join(contentDir, 'terms.md'), 'utf-8');
  const termsHtml = renderMarkdown(termsContent);

  it('Terms links to Privacy Policy', () => {
    expect(termsHtml).toContain('href="/legal/privacy"');
  });
});
