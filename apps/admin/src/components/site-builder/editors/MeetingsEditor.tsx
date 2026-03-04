'use client';

/**
 * Meetings block editor — maxItems, showLocation, showPastMeetings toggles.
 */
import type { MeetingsContent } from '@propertypro/shared/site-blocks';

interface MeetingsEditorProps {
  content: MeetingsContent;
  onChange: (content: MeetingsContent) => void;
}

export function MeetingsEditor({ content, onChange }: MeetingsEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="meetings-max" className="mb-1 block text-xs font-medium text-gray-700">
          Maximum Items to Show
        </label>
        <input
          id="meetings-max"
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
          checked={content.showLocation}
          onChange={(e) => onChange({ ...content, showLocation: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Show meeting location</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={content.showPastMeetings}
          onChange={(e) => onChange({ ...content, showPastMeetings: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Show past meetings</span>
      </label>
    </div>
  );
}
