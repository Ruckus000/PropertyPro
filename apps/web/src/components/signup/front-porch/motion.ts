/**
 * Two motions from the design, both opt-out under prefers-reduced-motion:
 *
 * - `flyTo`: an answer leaves the field it was typed in and lands in its slot
 *   on the community card (`data-land="<key>"`). FLIP over a fixed-position
 *   clone, so layout never moves.
 * - `burstConfetti`: once, when the community goes live.
 *
 * ponytail: Web Animations API, no animation dependency.
 */

const FLIGHT_MS = 600;

/** False under reduced motion, and where WAAPI is missing (old browsers, jsdom). */
export function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches !== true;
}

export function flyTo(from: Element | null, landKey: string, text: string): void {
  if (!from || !canAnimate()) return;
  // The slot renders after the state update; measure on the next frame.
  requestAnimationFrame(() => {
    const target = document.querySelector(`[data-land="${landKey}"]`);
    // The card is hidden below the narrow breakpoint: nothing to fly to.
    if (!target || target.getClientRects().length === 0) return;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const clone = document.createElement('span');
    clone.textContent = text;
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${a.left}px`,
      top: `${a.top + a.height / 2 - 12}px`,
      zIndex: '50',
      pointerEvents: 'none',
      padding: '2px 10px',
      borderRadius: '9999px',
      background: 'var(--interactive-subtle)',
      color: 'var(--text-brand)',
      font: '600 var(--font-size-sm) var(--font-sans)',
      whiteSpace: 'nowrap',
      boxShadow: 'var(--elevation-e2)',
    });
    document.body.appendChild(clone);
    const dx = b.left - a.left;
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const animation = clone.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.05)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0 },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
    const done = () => clone.remove();
    animation.onfinish = done;
    animation.oncancel = done;
    target.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 320, delay: FLIGHT_MS - 120, easing: 'ease-out' },
    );
  });
}

const CONFETTI_TOKENS = [
  '--interactive-primary',
  '--status-success',
  '--status-warning',
  '--status-info',
  '--sand-200',
];

export function burstConfetti(origin: Element | null): void {
  if (!origin || !canAnimate()) return;
  const styles = getComputedStyle(document.documentElement);
  const colors = CONFETTI_TOKENS.map((t) => styles.getPropertyValue(t).trim()).filter(Boolean);
  const box = origin.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  for (let i = 0; i < 48; i += 1) {
    const piece = document.createElement('span');
    piece.setAttribute('aria-hidden', 'true');
    const size = 6 + Math.random() * 6;
    Object.assign(piece.style, {
      position: 'fixed',
      left: `${cx}px`,
      top: `${cy}px`,
      width: `${size}px`,
      height: `${size * 0.6}px`,
      borderRadius: '2px',
      background: colors[i % colors.length] ?? 'currentColor',
      zIndex: '50',
      pointerEvents: 'none',
    });
    document.body.appendChild(piece);
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 160;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 60;
    const animation = piece.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${x}px, ${y + 220}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
    );
    animation.onfinish = () => piece.remove();
    animation.oncancel = () => piece.remove();
  }
}
