'use client';

import { TriangleAlert } from 'lucide-react';

/** The categories a Documents section can list, in the order the schema keeps them. */
const CATEGORIES = [
  { value: 'budget', label: 'Budgets' },
  { value: 'minutes', label: 'Meeting minutes' },
  { value: 'financial', label: 'Financial records' },
  { value: 'rules', label: 'Rules and regulations' },
  { value: 'other', label: 'Other documents' },
] as const;

export type DocumentCategoryValue = (typeof CATEGORIES)[number]['value'];

/** The categories in the schema's order, with anything it does not know left out. */
export function normalizeDocumentCategories(value: unknown): DocumentCategoryValue[] {
  if (!Array.isArray(value)) return [];
  return CATEGORIES.map((category) => category.value).filter((category) => value.includes(category));
}

export interface DocumentCategoriesFieldProps {
  idPrefix: string;
  value: readonly DocumentCategoryValue[];
  onChange: (next: DocumentCategoryValue[]) => void;
}

/**
 * Which document categories the section lists. A Documents section with none
 * checked lists nothing (the site's reader treats "no categories" as "no
 * documents", not "all"), so the panel says so rather than leaving a section
 * that looks set up and is empty.
 *
 * Native checkboxes in a fieldset, not a Radix control: nothing under `forms/`
 * may pull a Radix stack onto the editor route (see `form-registry.ts`).
 */
export function DocumentCategoriesField({ idPrefix, value, onChange }: DocumentCategoriesFieldProps) {
  const hintId = `${idPrefix}-categories-hint`;

  return (
    <fieldset className="space-y-2" aria-describedby={hintId}>
      <legend className="text-sm font-medium text-content">Which documents to list</legend>
      {CATEGORIES.map((category) => {
        const id = `${idPrefix}-category-${category.value}`;
        const checked = value.includes(category.value);
        return (
          <div key={category.value} className="flex min-h-11 items-center gap-2 md:min-h-0">
            <input
              type="checkbox"
              id={id}
              checked={checked}
              className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
              onChange={(event) =>
                onChange(
                  normalizeDocumentCategories(
                    event.target.checked
                      ? [...value, category.value]
                      : value.filter((existing) => existing !== category.value),
                  ),
                )
              }
            />
            <label htmlFor={id} className="text-sm font-normal text-content">
              {category.label}
            </label>
          </div>
        );
      })}
      <p id={hintId} className="text-xs text-content-secondary">
        Your website lists public documents in the categories you check.
      </p>
      {value.length === 0 && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-status-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Nothing is checked, so this section lists no documents.</span>
        </p>
      )}
    </fieldset>
  );
}
