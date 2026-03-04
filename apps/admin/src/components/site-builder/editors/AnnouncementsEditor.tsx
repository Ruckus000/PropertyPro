'use client';

/**
 * Announcements block editor — maxItems and showDate toggle.
 */
import type { AnnouncementsContent } from '@propertypro/shared/site-blocks';

interface AnnouncementsEditorProps {
  content: AnnouncementsContent;
  onChange: (content: AnnouncementsContent) => void;
}

export function AnnouncementsEditor({ content, onChange }: AnnouncementsEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="announcements-max" className="mb-1 block text-xs font-medium text-gray-700">
          Maximum Items to Show
        </label>
        <input
          id="announcements-max"
          type="number"
          min={1}
          max={50}
          value={content.maxItems}
          onChange={(e) => onChange({ ...content, maxItems: Math.max(1, Number(e.target.value) || 1) })}
          className="block w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={content.showDate}
          onChange={(e) => onChange({ ...content, showDate: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Show announcement dates</span>
      </label>
    </div>
  );
}
