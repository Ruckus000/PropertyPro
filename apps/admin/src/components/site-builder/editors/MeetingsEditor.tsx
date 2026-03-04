'use client';

/**
 * Meetings block editor — section title.
 */
import type { MeetingsBlockContent } from '@propertypro/shared/site-blocks';

interface MeetingsEditorProps {
  content: MeetingsBlockContent;
  onChange: (content: MeetingsBlockContent) => void;
}

export function MeetingsEditor({ content, onChange }: MeetingsEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="meetings-title" className="mb-1 block text-xs font-medium text-gray-700">
          Section Title
        </label>
        <input
          id="meetings-title"
          type="text"
          value={content.title}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Upcoming Meetings"
        />
      </div>
    </div>
  );
}
