import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

import { BrandingForm } from '../../src/components/pm/BrandingForm';
import { BrandingPreview } from '../../src/components/pm/BrandingPreview';

describe('BrandingPreview', () => {
  it('renders color swatches and portal mockup', () => {
    render(<BrandingPreview branding={{ primaryColor: '#ff0000', secondaryColor: '#00ff00' }} />);
    expect(screen.getByText('Portal Preview')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();
  });

  it('shows logo image when logoObjectUrl is provided', () => {
    render(
      <BrandingPreview
        branding={{ primaryColor: '#ff0000' }}
        logoObjectUrl="blob:http://localhost/test-logo"
      />,
    );
    const img = screen.getByAltText('Logo preview');
    expect(img).toHaveAttribute('src', 'blob:http://localhost/test-logo');
  });

  it('shows placeholder div when no logoObjectUrl', () => {
    render(<BrandingPreview branding={{ primaryColor: '#ff0000' }} />);
    expect(screen.queryByAltText('Logo preview')).not.toBeInTheDocument();
  });
});

describe('BrandingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders logo, primary color, and secondary color fields', () => {
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    expect(screen.getByText('Company Logo')).toBeInTheDocument();
    expect(screen.getByText('Primary Brand Color')).toBeInTheDocument();
    expect(screen.getByText('Secondary Brand Color')).toBeInTheDocument();
  });

  it('populates color inputs from initialBranding', () => {
    render(
      <BrandingForm
        communityId={1}
        initialBranding={{ primaryColor: '#aabbcc', secondaryColor: '#112233' }}
      />,
    );
    const colorTextInputs = screen.getAllByDisplayValue('#aabbcc');
    expect(colorTextInputs.length).toBeGreaterThan(0);
  });

  it('shows save button', () => {
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    expect(screen.getByRole('button', { name: /save branding/i })).toBeInTheDocument();
  });

  it('shows error when logo file type is invalid', async () => {
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.gif', { type: 'image/gif' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    expect(await screen.findByText(/Logo must be a PNG/i)).toBeInTheDocument();
  });

  it('shows error when logo file is too large', async () => {
    render(<BrandingForm communityId={1} initialBranding={{}} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true });
    fireEvent.change(fileInput);
    expect(await screen.findByText(/10 MB or smaller/i)).toBeInTheDocument();
  });
});
