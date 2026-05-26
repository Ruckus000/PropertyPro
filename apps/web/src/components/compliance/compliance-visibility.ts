import { CONDO_718_CHECKLIST_TEMPLATE, HOA_720_CHECKLIST_TEMPLATE, type DefaultVisibility } from '@propertypro/shared';

export type { DefaultVisibility };

const TEMPLATE_VISIBILITY: Map<string, DefaultVisibility> = new Map();
for (const item of [...CONDO_718_CHECKLIST_TEMPLATE, ...HOA_720_CHECKLIST_TEMPLATE]) {
  TEMPLATE_VISIBILITY.set(item.templateKey, item.defaultVisibility);
}

export function getTemplateDefaultVisibility(templateKey: string): DefaultVisibility {
  return TEMPLATE_VISIBILITY.get(templateKey) ?? 'owner_portal';
}
