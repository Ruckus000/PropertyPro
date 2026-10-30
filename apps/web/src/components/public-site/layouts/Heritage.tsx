import { LookLayout } from './LookLayout';
import type { LayoutProps } from './types';

/**
 * Heritage — formal and official. Drawn by `LOOK_STYLES.heritage`; the blocks
 * are dispatched by `LookLayout`.
 */
export function Heritage(props: LayoutProps) {
  return <LookLayout id="heritage" {...props} />;
}
