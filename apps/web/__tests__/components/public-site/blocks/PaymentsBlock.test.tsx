/**
 * PaymentsBlock — target resolution and the rel/target rules on the rendered
 * link. This is the block that puts a PM-supplied URL on a public page.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentsBlock } from '@/components/public-site/blocks/PaymentsBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = {
  id: 7,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  logoUrl: null,
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#000',
  secondaryColor: '#fff',
  accentColor: '#0f0',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

function makeProps(content: unknown): BlockRendererProps {
  return {
    block: { id: 21, blockType: 'payments', blockOrder: 3, content },
    community,
    theme,
    layout: 'tidewater',
  };
}

describe('<PaymentsBlock> — target resolution', () => {
  it('falls back to the community portal when no override is set', () => {
    render(<PaymentsBlock {...makeProps({})} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('sunset-condos');
    expect(link.getAttribute('href')).toContain('/payments');
  });

  it('does not store the resolved portal URL, so a rename cannot break it', () => {
    // Resolution happens at render from `community.slug`. Same content, a
    // different community, a different URL.
    const renamed = { ...community, slug: 'sunset-towers' };
    render(
      <PaymentsBlock
        {...{ ...makeProps({}), community: renamed }}
      />,
    );
    expect(screen.getByRole('link').getAttribute('href')).toContain('sunset-towers');
  });

  it('uses a PM override when supplied', () => {
    render(
      <PaymentsBlock {...makeProps({ ctaTarget: 'https://yourassociation.clickpay.com' })} />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://yourassociation.clickpay.com',
    );
  });
});

describe('<PaymentsBlock> — link safety', () => {
  it('marks an external target noopener noreferrer', () => {
    render(
      <PaymentsBlock {...makeProps({ ctaTarget: 'https://yourassociation.clickpay.com' })} />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('marks the portal default external too — it is a different subdomain', () => {
    render(<PaymentsBlock {...makeProps({})} />);
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does NOT add rel or target to an internal path', () => {
    // rel="noreferrer" on a same-site link needlessly strips the referrer, and
    // target=_blank on an in-app path is a worse experience.
    render(<PaymentsBlock {...makeProps({ ctaTarget: '/payments' })} />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('rel');
    expect(link).not.toHaveAttribute('target');
  });

  it('warns the user, in the accessible name, that the link opens a new tab', () => {
    render(<PaymentsBlock {...makeProps({ ctaTarget: 'https://x.example.com' })} />);
    expect(screen.getByRole('link').textContent).toMatch(/opens in a new tab/i);
  });

  it('renders nothing for content the schema rejects', () => {
    // An open-redirect payload cannot reach the DOM even if it somehow reached
    // storage: the renderer re-validates.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<PaymentsBlock {...makeProps({ ctaTarget: '//evil.com' })} />);
    expect(container.querySelector('a')).toBeNull();
    warn.mockRestore();
  });
});

describe('<PaymentsBlock> — copy', () => {
  it('keeps the "no card details on your website" promise on the page', () => {
    render(<PaymentsBlock {...makeProps({})} />);
    expect(screen.getByText(/No card details are entered on this website/i)).toBeInTheDocument();
  });

  it('renders PM-authored copy over the defaults', () => {
    render(
      <PaymentsBlock
        {...makeProps({ heading: 'Assessments', body: 'Due the first.', ctaText: 'Pay now' })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Assessments' })).toBeInTheDocument();
    expect(screen.getByText('Due the first.')).toBeInTheDocument();
    expect(screen.getByRole('link').textContent).toContain('Pay now');
  });

  it('falls back to sensible defaults for an empty block', () => {
    render(<PaymentsBlock {...makeProps({})} />);
    expect(screen.getByRole('heading', { name: 'Pay your assessment' })).toBeInTheDocument();
  });
});
