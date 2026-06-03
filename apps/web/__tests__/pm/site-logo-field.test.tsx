import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SiteLogoField } from '@/components/pm/SiteLogoField';

beforeEach(() => {
  // jsdom lacks createObjectURL.
  global.URL.createObjectURL = vi.fn(() => 'blob:site-logo');
  global.URL.revokeObjectURL = vi.fn();
});

function selectFile(type: string, sizeBytes = 1000) {
  const file = new File([new Uint8Array(sizeBytes)], 'logo.png', { type });
  const input = screen.getByTestId('site-logo-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('SiteLogoField', () => {
  it('renders the upload control', () => {
    render(<SiteLogoField onChange={vi.fn()} />);
    expect(screen.getByTestId('site-logo-input')).toBeInTheDocument();
  });

  it('shows the current site logo when provided and no new file is chosen', () => {
    render(<SiteLogoField onChange={vi.fn()} initialUrl="https://cdn/site-logo.webp" />);
    expect(screen.getByAltText('Current site logo')).toHaveAttribute('src', 'https://cdn/site-logo.webp');
  });

  it('rejects a non-image file with an error and does not surface a cropped file', () => {
    const onChange = vi.fn();
    render(<SiteLogoField onChange={onChange} />);
    selectFile('application/pdf');
    expect(screen.getByRole('alert')).toHaveTextContent(/PNG, JPEG, or WebP/i);
    expect(screen.queryByTestId('site-logo-crop-image')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a file over 10 MB', () => {
    const onChange = vi.fn();
    render(<SiteLogoField onChange={onChange} />);
    selectFile('image/png', 11 * 1024 * 1024);
    expect(screen.getByRole('alert')).toHaveTextContent(/10 MB/i);
  });

  it('reveals the crop tool for a valid image and resets the cropped file to null', () => {
    const onChange = vi.fn();
    render(<SiteLogoField onChange={onChange} />);
    selectFile('image/png');
    expect(screen.getByTestId('site-logo-crop-image')).toBeInTheDocument();
    // A crop must be made before a file is handed up; selection clears it to null.
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
