import { LookLayout } from './LookLayout';
import type { LayoutProps } from './types';

/**
 * Plain & Simple — no photos needed, larger text; the look suggested for
 * apartments. Drawn by `LOOK_STYLES['plain-simple']`; the blocks are
 * dispatched by `LookLayout`.
 */
export function PlainSimple(props: LayoutProps) {
  return <LookLayout id="plain-simple" {...props} />;
}
