/**
 * A sketch of a community's public site in its own colour: a header, a hero
 * band and two content lines. It is decoration that helps tell communities
 * apart, so it carries no text and is hidden from assistive tech.
 *
 * `color` is the live look's primary colour from the summary; anything that is
 * not a #RRGGBB value falls back to a neutral band.
 */
import { cn } from '@/lib/utils';
import { safeBrandColor } from '@/lib/pm/communities-page';

const SIZES = {
  // The chooser: one community per half page.
  lg: {
    header: 'h-14 px-6 md:h-20 md:px-8',
    dot: 'size-4 md:size-6',
    title: 'h-1.5 w-20 md:h-2 md:w-28',
    hero: 'h-28 gap-2 px-6 md:h-44 md:gap-3 md:px-8',
    bars: ['h-4 w-1/2 md:h-7', 'h-3 w-1/3 md:h-7', 'h-1 w-1/3 md:h-2', 'h-4 w-1/6 md:h-8'],
    body: 'h-16 gap-3 px-6 md:h-32 md:gap-5 md:px-8',
    line: 'h-1.5 md:h-2',
    box: 'size-4 md:size-7',
  },
  // Gallery cards: a strip beside the text on a phone, the card's top above.
  md: {
    header: 'h-4 px-2 md:h-14 md:px-6',
    dot: 'size-1.5 md:size-4',
    title: 'h-0.5 w-5 md:h-1.5 md:w-20',
    hero: 'h-10 gap-1 px-2 md:h-28 md:gap-2 md:px-6',
    bars: ['h-1 w-3/5 md:h-5 md:w-1/2', 'h-1 w-2/5 md:h-5 md:w-1/3', 'hidden md:block md:h-1 md:w-1/3', 'hidden md:block md:h-5 md:w-1/6'],
    body: 'h-6 gap-1 px-2 md:h-20 md:gap-3 md:px-6',
    line: 'h-0.5 md:h-1.5',
    box: 'size-1.5 md:size-5',
  },
  // List rows.
  sm: {
    header: 'h-2 px-1',
    dot: 'size-1',
    title: 'h-0.5 w-3',
    hero: 'h-5 gap-0.5 px-1',
    bars: ['h-1 w-3/5', 'h-0.5 w-2/5', 'hidden', 'hidden'],
    body: 'h-4 gap-0.5 px-1',
    line: 'h-0.5',
    box: 'size-1',
  },
} as const;

interface SiteThumbnailProps {
  color: string | null;
  size: keyof typeof SIZES;
  className?: string;
}

export function SiteThumbnail({ color, size, className }: SiteThumbnailProps) {
  const s = SIZES[size];
  const brand = safeBrandColor(color);
  const brandStyle = brand ? { backgroundColor: brand } : undefined;
  const [b1, b2, b3, b4] = s.bars;

  return (
    <div aria-hidden="true" className={cn('flex flex-col overflow-hidden bg-surface-card', className)}>
      <div className={cn('flex shrink-0 items-center gap-1 border-b border-edge md:gap-2', s.header)}>
        <span className={cn('shrink-0 rounded-full', s.dot, !brand && 'bg-surface-inverse-subtle')} style={brandStyle} />
        <span className={cn('rounded-full bg-surface-inverse', s.title)} />
      </div>
      <div
        className={cn('flex shrink-0 flex-col justify-center', s.hero, !brand && 'bg-surface-inverse-subtle')}
        style={brandStyle}
      >
        <span className={cn('rounded-sm bg-white', b1)} />
        <span className={cn('rounded-sm bg-white/80', b2)} />
        <span className={cn('rounded-full bg-white/50', b3)} />
        <span className={cn('rounded-sm bg-white', b4)} />
      </div>
      <div className={cn('flex flex-1 flex-col justify-center bg-surface-page', s.body)}>
        {[0, 1].map((i) => (
          <span key={i} className="flex items-center gap-1 md:gap-2">
            <span className={cn('shrink-0 rounded-xs bg-surface-muted', s.box)} />
            <span className={cn('rounded-full bg-surface-muted', s.line, i === 0 ? 'w-1/2' : 'w-2/5')} />
          </span>
        ))}
      </div>
    </div>
  );
}
