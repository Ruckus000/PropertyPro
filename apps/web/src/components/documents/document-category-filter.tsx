'use client';

import React, { useState, useEffect } from 'react';

export interface DocumentCategory {
  id: number;
  name: string;
  description: string | null;
}

interface DocumentCategoryFilterProps {
  communityId: number;
  selectedCategoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
}

interface CategoriesResponse {
  data: DocumentCategory[];
}

export function DocumentCategoryFilter({
  communityId,
  selectedCategoryId,
  onCategoryChange,
}: DocumentCategoryFilterProps) {
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/v1/document-categories?communityId=${communityId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load categories');
        return res.json();
      })
      .then((json: CategoriesResponse) => {
        setCategories(json.data);
      })
      .catch(() => {
        // Silently fail - categories are optional for filtering
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [communityId]);

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-gray-200"
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
          className="w-fit rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white"
        >
          All
        </button>
        <p className="text-sm text-gray-600">
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
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
