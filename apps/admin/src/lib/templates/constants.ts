import type { TemplateLifecycleState } from './types';

export const TEMPLATE_PUBLISH_HELPER_COPY =
  'Publishing makes this template available for future demos. Existing demos keep their current version until regenerated.';

export const TEMPLATE_LIFECYCLE_META: Record<
  TemplateLifecycleState,
  { label: string; description: string }
> = {
  draft_only: {
    label: 'Draft',
    description: 'Not available for new demos yet.',
  },
  published_current: {
    label: 'Live',
    description: 'Available for new demos.',
  },
  published_with_unpublished_changes: {
    label: 'Needs publish',
    description: 'Saved changes are not live yet.',
  },
};
