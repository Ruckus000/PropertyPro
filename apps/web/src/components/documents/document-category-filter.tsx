'use client';

import React from 'react';
import { useDocumentCategories } from '@/hooks/useDocumentCategories';

interface DocumentCategoryFilterProps {
  communityId: number;
  selectedCategoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
}

export function DocumentCategoryFilter({
  communityId,
  selectedCategoryId,
  onCategoryChange,
}: DocumentCategoryFilterProps) {
  const { categories, isLoading } = useDocumentCategories(communityId);

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-surface-muted"
          />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className="w-fit rounded-full bg-interactive px-4 py-1.5 text-sm font-medium text-white"
        >
          All
        </button>
        <p className="text-sm text-content-secondary">
          No categories configured yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onCategoryChange(null)}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          selectedCategoryId === null
            ? 'bg-interactive text-white'
            : 'bg-surface-muted text-content-secondary hover:bg-surface-muted'
        }`}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onCategoryChange(category.id)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selectedCategoryId === category.id
              ? 'bg-interactive text-white'
              : 'bg-surface-muted text-content-secondary hover:bg-surface-muted'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
