import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FooterLegalLinks } from '@/components/marketing/footer-legal-links';

const legalDocs = {
  terms: '<h1>Terms Heading</h1><p>terms body</p>',
  privacy: '<h1>Privacy Heading</h1><p>privacy body</p>',
  accessibility: '',
};

describe('FooterLegalLinks', () => {
  it('renders both legal links with correct hrefs', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
  });

  it('opens the modal with Terms content on a plain click', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Terms Heading');
    expect(dialog).toHaveTextContent('terms body');
  });

  it('opens Privacy content when the Privacy link is clicked', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Privacy Heading');
  });

  it('does NOT open the modal on a modified (ctrl) click', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }), { ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the modal via the close button', async () => {
    const user = userEvent.setup();
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falls through to navigation (no modal) when legalDocs is undefined', () => {
    render(<FooterLegalLinks />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
