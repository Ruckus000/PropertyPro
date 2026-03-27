'use client';

import type { RefObject } from 'react';
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';

interface TemplateDetailsFormProps {
  name: string;
  summary: string;
  tagsInput: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  thumbnailLayout: string;
  gradientStart: string;
  gradientEnd: string;
  nameError: string | null;
  communityTypeLocked: boolean;
  usageCount: number;
  updatedAt: string;
  nameInputRef: RefObject<HTMLInputElement | null>;
  onChange: (field: string, value: string) => void;
}

export function TemplateDetailsForm({
  name,
  summary,
  tagsInput,
  communityType,
  thumbnailLayout,
  gradientStart,
  gradientEnd,
  nameError,
  communityTypeLocked,
  usageCount,
  updatedAt,
  nameInputRef,
  onChange,
}: TemplateDetailsFormProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Template details">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900">Template details</h2>
        <p className="text-sm text-gray-500">
          Update the template metadata that appears in the gallery and editor.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2 lg:col-span-2">
          <label htmlFor="template-name" className="text-sm font-medium text-gray-900">
            Name
          </label>
          <input
            id="template-name"
            ref={nameInputRef}
            value={name}
            onChange={(event) => onChange('name', event.target.value)}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'template-name-error template-name-help' : 'template-name-help'}
            className={[
              'w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition',
              nameError
                ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-200'
                : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200',
            ].join(' ')}
          />
          <p id="template-name-help" className="text-sm text-gray-500">
            Use a clear internal name. Minimum 3 characters.
          </p>
          {nameError && (
            <p id="template-name-error" className="text-sm font-medium text-red-600">{nameError}</p>
          )}
        </div>

        <div className="space-y-2 lg:col-span-2">
          <label htmlFor="template-summary" className="text-sm font-medium text-gray-900">
            Summary
          </label>
          <textarea
            id="template-summary"
            value={summary}
            onChange={(event) => onChange('summary', event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="template-tags" className="text-sm font-medium text-gray-900">
            Tags
          </label>
          <input
            id="template-tags"
            value={tagsInput}
            onChange={(event) => onChange('tagsInput', event.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            placeholder="Board-forward, Formal, Events"
          />
          <p className="text-sm text-gray-500">Separate tags with commas.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="template-community-type" className="text-sm font-medium text-gray-900">
            Community type
          </label>
          <select
            id="template-community-type"
            value={communityType}
            onChange={(event) => onChange('communityType', event.target.value)}
            disabled={communityTypeLocked}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
          >
            <option value="condo_718">{COMMUNITY_TYPE_DISPLAY_NAMES.condo_718}</option>
            <option value="hoa_720">{COMMUNITY_TYPE_DISPLAY_NAMES.hoa_720}</option>
            <option value="apartment">{COMMUNITY_TYPE_DISPLAY_NAMES.apartment}</option>
          </select>
          {communityTypeLocked && (
            <p className="text-sm text-gray-500">Community type becomes read-only after first publish.</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="template-layout" className="text-sm font-medium text-gray-900">
            Thumbnail layout
          </label>
          <input
            id="template-layout"
            value={thumbnailLayout}
            onChange={(event) => onChange('thumbnailLayout', event.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="template-gradient-start" className="text-sm font-medium text-gray-900">
              Gradient start
            </label>
            <input
              id="template-gradient-start"
              value={gradientStart}
              onChange={(event) => onChange('gradientStart', event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="template-gradient-end" className="text-sm font-medium text-gray-900">
              Gradient end
            </label>
            <input
              id="template-gradient-end"
              value={gradientEnd}
              onChange={(event) => onChange('gradientEnd', event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 md:grid-cols-2">
        <div>
          <dt className="font-medium text-gray-900">Used by</dt>
          <dd className="mt-1">{usageCount} demos</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Last updated</dt>
          <dd className="mt-1">{new Date(updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}
