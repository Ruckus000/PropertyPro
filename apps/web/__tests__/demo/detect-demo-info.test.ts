import { describe, it, expect } from 'vitest';
import { detectDemoInfo } from '@/lib/demo/detect-demo-info';

describe('detectDemoInfo', () => {
  it('returns board role for standard slug', () => {
    const result = detectDemoInfo(
      true,
      'demo-board@demo-acme-corp-a1b2c3.propertyprofl.com',
    );
    expect(result).toEqual({
      isDemoMode: true,
      currentRole: 'board',
      slug: 'demo-acme-corp-a1b2c3',
    });
  });

  it('returns resident role for standard slug', () => {
    const result = detectDemoInfo(
      true,
      'demo-resident@demo-acme-corp-a1b2c3.propertyprofl.com',
    );
    expect(result).toEqual({
      isDemoMode: true,
      currentRole: 'resident',
      slug: 'demo-acme-corp-a1b2c3',
    });
  });

  it('handles slug with dots', () => {
    const result = detectDemoInfo(
      true,
      'demo-resident@sunset.condos.propertyprofl.com',
    );
    expect(result).toEqual({
      isDemoMode: true,
      currentRole: 'resident',
      slug: 'sunset.condos',
    });
  });

  it('handles board role with dotted slug', () => {
    const result = detectDemoInfo(
      true,
      'demo-board@sunset.condos.propertyprofl.com',
    );
    expect(result).toEqual({
      isDemoMode: true,
      currentRole: 'board',
      slug: 'sunset.condos',
    });
  });

  it('returns null for non-demo email', () => {
    const result = detectDemoInfo(true, 'john@example.com');
    expect(result).toBeNull();
  });

  it('returns null when isDemo is false', () => {
    const result = detectDemoInfo(
      false,
      'demo-board@demo-acme-corp-a1b2c3.propertyprofl.com',
    );
    expect(result).toBeNull();
  });

  it('returns null for empty string email', () => {
    const result = detectDemoInfo(true, '');
    expect(result).toBeNull();
  });

  it('returns null for null email', () => {
    const result = detectDemoInfo(true, null);
    expect(result).toBeNull();
  });
});
