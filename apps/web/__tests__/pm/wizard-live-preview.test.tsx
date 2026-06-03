import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardLivePreview } from '@/components/pm/onboarding-wizard/WizardLivePreview';

describe('WizardLivePreview', () => {
  it('builds the preview iframe src from the selection, with preview=true', () => {
    render(<WizardLivePreview communityId={42} layoutId="sable" presetSlug="florida-condo-v1" />);
    const frame = screen.getByTestId('wizard-live-preview-frame');
    expect(frame.getAttribute('src')).toBe(
      '/pm/site-preview?communityId=42&preview=true&layout=sable&preset=florida-condo-v1',
    );
  });

  it('omits layout/preset params when not selected', () => {
    render(<WizardLivePreview communityId={7} layoutId={null} presetSlug={null} />);
    expect(screen.getByTestId('wizard-live-preview-frame').getAttribute('src')).toBe(
      '/pm/site-preview?communityId=7&preview=true',
    );
  });
});
