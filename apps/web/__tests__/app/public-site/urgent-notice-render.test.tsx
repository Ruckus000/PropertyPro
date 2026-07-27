/**
 * Website editor v3, Phase 7 — the public urgent notice banner.
 *
 * This is the test the phase spec names explicitly, and it is the reason the
 * feature is safe to ship. The urgent notice is the only write in the product
 * that reaches a public page with no draft, no preview and no review step. If
 * `UrgentNoticeBanner` ever grows a `dangerouslySetInnerHTML`, a markdown
 * renderer, or link autodetection, the first assertion below is what fails.
 *
 * The second concern is expiry. Nothing sweeps the stored row, deliberately —
 * a cron that fails must not be able to strand an emergency banner on a public
 * site. The banner therefore evaluates expiry on every render, and that
 * behaviour is asserted here rather than assumed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UrgentNoticeBanner } from '@/components/public-site/UrgentNoticeBanner';

afterEach(cleanup);

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + HOUR);
const past = () => new Date(Date.now() - HOUR);

describe('UrgentNoticeBanner — XSS', () => {
  it('renders a <script> payload as VISIBLE TEXT, not as markup', () => {
    const payload = '<script>alert("xss")</script>';

    const { container } = render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: payload, urgentNoticeExpiresAt: null }}
      />,
    );

    // The literal characters are on screen…
    expect(screen.getByText(payload)).toBeInTheDocument();
    // …and no script element was created from them.
    expect(container.querySelector('script')).toBeNull();
    // The DOM holds text, not a parsed tag.
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('renders an img/onerror payload as visible text', () => {
    const payload = '<img src=x onerror=alert(1)>';

    const { container } = render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: payload, urgentNoticeExpiresAt: null }}
      />,
    );

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders an anchor payload as visible text, creating no link', () => {
    const payload = '<a href="https://evil.example">Click here</a>';

    const { container } = render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: payload, urgentNoticeExpiresAt: null }}
      />,
    );

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('UrgentNoticeBanner — expiry at render time', () => {
  it('renders a notice with no expiry', () => {
    render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: 'Boil water order in effect', urgentNoticeExpiresAt: null }}
      />,
    );
    expect(screen.getByText('Boil water order in effect')).toBeInTheDocument();
  });

  it('renders a notice whose expiry is in the future', () => {
    render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: 'Pool closed', urgentNoticeExpiresAt: future() }}
      />,
    );
    expect(screen.getByTestId('urgent-notice-banner')).toBeInTheDocument();
  });

  it('does NOT render an expired notice even though the row persists', () => {
    // The row is still there — nothing nulled it. The banner is gone anyway,
    // which is the whole point: a missed cron cannot strand a live banner.
    render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: 'Pool closed', urgentNoticeExpiresAt: past() }}
      />,
    );
    expect(screen.queryByTestId('urgent-notice-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('Pool closed')).not.toBeInTheDocument();
  });

  it('does not render when there is no notice text', () => {
    render(
      <UrgentNoticeBanner notice={{ urgentNoticeText: null, urgentNoticeExpiresAt: null }} />,
    );
    expect(screen.queryByTestId('urgent-notice-banner')).not.toBeInTheDocument();
  });

  it('accepts an ISO-string expiry (the shape the API returns)', () => {
    render(
      <UrgentNoticeBanner
        notice={{
          urgentNoticeText: 'Elevator out of service',
          urgentNoticeExpiresAt: past().toISOString(),
        }}
      />,
    );
    expect(screen.queryByTestId('urgent-notice-banner')).not.toBeInTheDocument();
  });
});

describe('UrgentNoticeBanner — accessibility', () => {
  it('announces itself with role="alert"', () => {
    render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: 'Hurricane closure', urgentNoticeExpiresAt: null }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Hurricane closure');
  });

  it('hides the decorative warning icon from assistive tech', () => {
    const { container } = render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: 'Hurricane closure', urgentNoticeExpiresAt: null }}
      />,
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
