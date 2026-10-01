import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/help/media-index', () => ({
  resolveHelpShot: (base: string, name: string) =>
    name === 'captured'
      ? { src: `/help/${base}/${name}.webp`, src2x: `/help/${base}/${name}@2x.webp`, width: 480, height: 120 }
      : null,
}));

const { Step, StepByStep, Figure, OnlyFor, createHelpMdxComponents, helpMdxComponents } = await import(
  '@/components/help/mdx-components'
);

describe('StepByStep', () => {
  it('renders an ordered list with visible 1-based step numbers', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="Open the gaps panel">From the score card.</Step>
        <Step title="Sort by deadline">Urgent bucket first.</Step>
      </StepByStep>,
    );
    expect(out).toContain('<ol role="list"');
    expect((out.match(/<li/g) ?? []).length).toBe(2);
    expect(out).toContain('>1<');
    expect(out).toContain('>2<');
    expect(out).toContain('<span class="sr-only">Step 1: </span>');
  });

  it('continues numbering from start', () => {
    const out = renderToStaticMarkup(
      <StepByStep start={4}>
        <Step title="Four">a</Step>
      </StepByStep>,
    );
    expect(out).toContain('>4<');
  });

  it('uses an existing rail class and hides the rail on the last step', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="One">a</Step>
        <Step title="Two">b</Step>
      </StepByStep>,
    );
    expect(out).not.toContain('bg-border-default');
    expect((out.match(/ bg-edge"/g) ?? []).length).toBe(1);
    expect(out).toContain('bg-transparent');
  });

  it('renders a captured shot at its own size with a 2x source, and nothing for an uncaptured one', () => {
    const out = renderToStaticMarkup(
      <StepByStep articleBase="manager/documents/upload-document">
        <Step title="One" shot="captured">a</Step>
        <Step title="Two" shot="not-yet">b</Step>
      </StepByStep>,
    );
    expect(out).toContain('src="/help/manager/documents/upload-document/captured.webp"');
    expect(out).toContain('/help/manager/documents/upload-document/captured@2x.webp 2x');
    expect(out).toContain('width="480"');
    expect(out).toContain('alt="Step 1: One"');
    expect(out).toContain('data-zoomable');
    expect(out).not.toContain('not-yet');
  });

  it('still renders a direct image path through MediaFrame', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="One" image="/help/c/s/step-1.webp" imageAlt="Step one">a</Step>
      </StepByStep>,
    );
    expect(out).toContain('data-media-frame');
    expect(out).toContain('src="/help/c/s/step-1.webp"');
  });
});

describe('Figure', () => {
  it('renders a captured shot with its caption, and nothing when uncaptured', () => {
    expect(
      renderToStaticMarkup(
        <Figure shot="captured" alt="The panel" articleBase="resident/a/b">
          The caption
        </Figure>,
      ),
    ).toContain('<figcaption');
    expect(renderToStaticMarkup(<Figure shot="missing" alt="x" articleBase="resident/a/b" />)).toBe('');
  });
});

describe('OnlyFor', () => {
  it('shows its content only for the listed community types', () => {
    expect(renderToStaticMarkup(<OnlyFor types="condo_718 hoa_720" communityType="hoa_720">yes</OnlyFor>)).toBe('yes');
    expect(renderToStaticMarkup(<OnlyFor types="condo_718" communityType="apartment">no</OnlyFor>)).toBe('');
  });
});

describe('help: links', () => {
  const context = {
    articleBase: 'resident/documents/find-documents',
    communityType: 'condo_718' as const,
    resolveLink: (slug: string) =>
      slug === 'pay-dues' ? { href: '/help/payments/pay-dues?communityId=2', category: 'payments', slug } : null,
  };

  it('resolves to the reader’s article and marks it for in-panel opening', () => {
    const A = createHelpMdxComponents(context).a;
    const out = renderToStaticMarkup(<A href="help:pay-dues">Pay dues</A>);
    expect(out).toContain('href="/help/payments/pay-dues?communityId=2"');
    expect(out).toContain('data-help-article="payments/pay-dues"');
  });

  it('renders the label as plain text when the reader cannot see the target', () => {
    const A = createHelpMdxComponents(context).a;
    expect(renderToStaticMarkup(<A href="help:leases">Leases</A>)).toBe('<span>Leases</span>');
    const Inert = helpMdxComponents.a;
    expect(renderToStaticMarkup(<Inert href="help:pay-dues">Pay dues</Inert>)).toBe('<span>Pay dues</span>');
  });

  it('leaves ordinary links alone', () => {
    const A = createHelpMdxComponents(context).a;
    expect(renderToStaticMarkup(<A href="https://example.com">x</A>)).toContain('href="https://example.com"');
  });
});
