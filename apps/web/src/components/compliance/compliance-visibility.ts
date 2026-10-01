import { CONDO_718_CHECKLIST_TEMPLATE, HOA_720_CHECKLIST_TEMPLATE, type DefaultVisibility } from '@propertypro/shared';

export type { DefaultVisibility };

const TEMPLATE_VISIBILITY: Map<string, DefaultVisibility> = new Map();
const TEMPLATE_DOCUMENT_CATEGORY: Map<string, string> = new Map();
for (const item of [...CONDO_718_CHECKLIST_TEMPLATE, ...HOA_720_CHECKLIST_TEMPLATE]) {
  TEMPLATE_VISIBILITY.set(item.templateKey, item.defaultVisibility);
  if (item.documentCategory) TEMPLATE_DOCUMENT_CATEGORY.set(item.templateKey, item.documentCategory);
}

export function getTemplateDefaultVisibility(templateKey: string): DefaultVisibility {
  return TEMPLATE_VISIBILITY.get(templateKey) ?? 'owner_portal';
}

/** The document category a checklist row uploads into (its grouping category unless the template names one). */
export function getTemplateDocumentCategory(templateKey: string | null | undefined, fallback: string): string {
  return (templateKey && TEMPLATE_DOCUMENT_CATEGORY.get(templateKey)) || fallback;
}
