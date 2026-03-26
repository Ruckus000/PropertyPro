'use client';

import { forwardRef } from 'react';

/**
 * iPhone 15 phone-frame mockup component for previewing mobile views.
 *
 * Inner viewport: 393×852 CSS px (iPhone 15 logical resolution)
 * Outer frame:    ~430×932 CSS px (with bezel, notch, home bar)
 */

export interface PhoneFrameProps {
  /** URL to embed in the iframe */
  src: string;
  /** Iframe loading strategy. Defaults to 'eager'. */
  loading?: 'eager' | 'lazy';
}

export const PhoneFrame = forwardRef<HTMLIFrameElement, PhoneFrameProps>(
  function PhoneFrame({ src, loading = 'eager' }, ref) {
    return (
      <div
        aria-label="Tenant portal preview"
        style={{
          position: 'relative',
          width: 430,
          height: 932,
          borderRadius: 50,
          background: '#1c1c1e',
          boxShadow:
            '0 0 0 2px #3a3a3c, 0 0 0 4px #1c1c1e, 0 24px 80px rgba(0,0,0,0.5)',
          padding: '16px 16px 20px',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 120,
            height: 32,
            background: '#1c1c1e',
            borderRadius: '0 0 20px 20px',
            zIndex: 10,
          }}
        />

        {/* Screen area */}
        <div
          style={{
            flex: 1,
            borderRadius: 38,
            overflow: 'hidden',
            background: '#fff',
            position: 'relative',
          }}
        >
          <iframe
            ref={ref}
            src={src}
            loading={loading}
            title="Tenant portal preview"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
            sandbox="allow-same-origin allow-scripts allow-forms allow-top-navigation-by-user-activation"
          />
        </div>

        {/* Home indicator */}
        <div
          style={{
            height: 5,
            width: 120,
            background: '#fff',
            borderRadius: 3,
            margin: '10px auto 0',
            opacity: 0.6,
          }}
        />
      </div>
    );
  },
);
