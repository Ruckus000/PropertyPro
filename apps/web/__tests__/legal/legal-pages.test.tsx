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

describe('renderMarkdown — class-less semantic output', () => {
  it('emits class-less semantic headings', () => {
    const html = renderMarkdown('# H1\n\n## H2');
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).not.toContain('class=');
  });

  it('emits class-less paragraphs and links', () => {
    const html = renderMarkdown('See [site](https://example.com).');
    expect(html).toContain('<a href="https://example.com">site</a>');
    expect(html).toContain('<p>');
    expect(html).not.toContain('text-content');
  });

  it('emits class-less lists and horizontal rules', () => {
    const html = renderMarkdown('- a\n- b\n\n---');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<hr />');
    expect(html).not.toContain('class=');
  });
});

describe('renderMarkdown — href sanitization', () => {
  it('passes through safe schemes and relative/fragment urls', () => {
    expect(renderMarkdown('[a](https://x.com)')).toContain('href="https://x.com"');
    expect(renderMarkdown('[a](/legal/privacy)')).toContain('href="/legal/privacy"');
    expect(renderMarkdown('[a](mailto:x@y.com)')).toContain('href="mailto:x@y.com"');
    expect(renderMarkdown('[a](#sec)')).toContain('href="#sec"');
  });

  it('neutralizes javascript: urls to #', () => {
    const html = renderMarkdown('[a](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });

  it('emits a plain class-less link for safe URLs', () => {
    const html = renderMarkdown('Visit [our site](https://example.com) now.');
    expect(html).toContain('<a href="https://example.com">our site</a>');
  });

  it('single-encodes & in URL query strings (no double-encoding)', () => {
    const html = renderMarkdown('[x](https://e.com?a=1&b=2)');
    expect(html).toContain('href="https://e.com?a=1&amp;b=2"');
    expect(html).not.toContain('&amp;amp;');
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
    expect(termsContent).toContain('Data Retention and Deletion');
  });

  // These assertions exist because the retention language previously promised
  // something the code does not do — deletion "from our systems and backups"
  // within 30 days — which is a misdescription of our actual data practices, not
  // a wording nit. See docs/audits/2026-08-09-legal-risk-audit.md F-17.
  it('does not promise a 30-day purge from backups', () => {
    expect(termsContent).not.toContain('permanently and irreversibly deleted');
    expect(termsContent).not.toMatch(/thirty \(30\) calendar days[\s\S]{0,200}backups/);
  });

  it('states that cancelling does not destroy association records', () => {
    expect(termsContent).toContain(
      "We do not automatically destroy your association's records",
    );
    expect(termsContent).toContain('including after your subscription has lapsed');
  });

  it('discloses that data persists in backups', () => {
    expect(termsContent).toContain('Backups');
    expect(termsContent).toContain('may persist in these backups');
  });

  it('includes acceptable use policy', () => {
    expect(termsContent).toContain('Acceptable Use Policy');
  });

  it('includes the effective date and a version identifier', () => {
    expect(termsContent).toContain('August 9, 2026');
    // Versioning exists so we can prove WHICH terms a user accepted once §11's
    // "continued use is acceptance" clause is ever exercised. F-18.
    expect(termsContent).toContain('**Version:** 2026-08-10.1');
    expect(termsContent).toContain('Supersedes version 2026-02-14.1');
  });

  it('is no longer marked as draft', () => {
    expect(termsContent).not.toContain('DRAFT');
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
    expect(privacyContent).toContain('privacy@getpropertypro.com');
  });

  it('includes the effective date and a version identifier', () => {
    expect(privacyContent).toContain('August 9, 2026');
    expect(privacyContent).toContain('**Version:** 2026-08-09.1');
  });

  // As with the Terms: the previous copy described a 30-day purge from backups
  // that does not happen. F-17.
  it('describes the real deletion lifecycle rather than a 30-day purge', () => {
    expect(privacyContent).not.toContain('permanently deleted from our active systems and backups');
    expect(privacyContent).toContain('Cancelling a subscription does not delete anything');
    expect(privacyContent).toContain('may persist in these backups');
  });

  // The policy previously promised that replying STOP revokes consent. No
  // inbound-message webhook exists, so that promise was false. F-10.
  it('does not claim that replying STOP revokes consent in our records', () => {
    expect(privacyContent).toContain('stops delivery at the carrier level');
    expect(privacyContent).not.toMatch(/Replying STOP\*\* to any SMS message received from PropertyPro\./);
  });

  it('is no longer marked as draft', () => {
    expect(privacyContent).not.toContain('DRAFT');
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

// ---------------------------------------------------------------------------
// Accessibility Statement
// ---------------------------------------------------------------------------
//
// Published because Florida is a high-volume jurisdiction for website
// accessibility claims and the association sites we generate are public
// accommodations. A documented remediation channel with a response commitment
// is the part that actually changes the posture in a demand-letter
// negotiation — so these tests guard the CONTACT ROUTE and the ADMISSIONS,
// not the boilerplate. See docs/audits/2026-08-09-legal-risk-audit.md F-12.

describe('Accessibility Statement content', () => {
  const accessibilityPath = path.join(contentDir, 'accessibility.md');
  const accessibilityContent = fs.readFileSync(accessibilityPath, 'utf-8');
  const accessibilityHtml = renderMarkdown(accessibilityContent);

  it('exists and renders', () => {
    expect(accessibilityContent.length).toBeGreaterThan(0);
    expect(accessibilityHtml).toContain('Accessibility Statement</h1>');
  });

  it('names the conformance target', () => {
    expect(accessibilityContent).toContain('WCAG) 2.1');
    expect(accessibilityContent).toContain('Level AA');
  });

  it('provides a working contact route for reporting a barrier', () => {
    expect(accessibilityHtml).toContain('href="mailto:support@getpropertypro.com"');
  });

  it('commits to a response window and an interim alternative', () => {
    expect(accessibilityContent).toContain('5 business days');
    expect(accessibilityContent).toContain('at no cost to you');
  });

  // The value of this page is candour. A statement that only claims conformance
  // is worse than none — it is a representation we cannot support. If someone
  // later trims the "Where we know we fall short" section, this fails.
  it('discloses the known gaps rather than only claiming conformance', () => {
    expect(accessibilityContent).toContain('Where we know we fall short');
    expect(accessibilityContent).toContain('We have not completed a full third-party audit');
    expect(accessibilityContent).toContain('advisory, not enforced');
  });

  it('carries a version identifier like the other legal documents', () => {
    expect(accessibilityContent).toContain('**Version:** 2026-08-09.1');
  });
});
