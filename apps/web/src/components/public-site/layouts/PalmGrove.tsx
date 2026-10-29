import { LookLayout } from './LookLayout';
import type { LayoutProps } from './types';

/**
 * Palm Grove — warm and friendly; the look suggested for HOAs. Drawn by
 * `LOOK_STYLES['palm-grove']`; the blocks are dispatched by `LookLayout`.
 */
export function PalmGrove(props: LayoutProps) {
  return <LookLayout id="palm-grove" {...props} />;
}
