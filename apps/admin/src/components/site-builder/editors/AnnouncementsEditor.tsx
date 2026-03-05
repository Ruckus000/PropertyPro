'use client';

/**
 * Announcements block editor — title and display limit.
 */
import type { AnnouncementsBlockContent } from '@propertypro/shared/site-blocks';

interface AnnouncementsEditorProps {
  content: AnnouncementsBlockContent;
  onChange: (content: AnnouncementsBlockContent) => void;
}

export function AnnouncementsEditor({ content, onChange }: AnnouncementsEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="announcements-title" className="mb-1 block text-xs font-medium text-gray-700">
          Section Title
        </label>
        <input
          id="announcements-title"
          type="text"
          value={content.title}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Announcements"
        />
      </div>

      <div>
        <label htmlFor="announcements-limit" className="mb-1 block text-xs font-medium text-gray-700">
          Maximum Items to Show (1-10)
        </label>
        <input
          id="announcements-limit"
          type="number"
          min={1}
          max={10}
          value={content.limit}
          onChange={(e) => onChange({ ...content, limit: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
          className="block w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
