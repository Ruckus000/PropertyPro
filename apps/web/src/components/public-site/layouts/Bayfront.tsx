import { LookLayout } from './LookLayout';
import type { LayoutProps } from './types';

/**
 * Bayfront — photo-led and modern; the look suggested for condos. Drawn by
 * `LOOK_STYLES.bayfront`; the blocks are dispatched by `LookLayout`.
 */
export function Bayfront(props: LayoutProps) {
  return <LookLayout id="bayfront" {...props} />;
}
