"use client";
import * as React from 'react';

export type MeetingFormValues = {
  title: string;
  meetingType: 'board' | 'annual' | 'special' | 'budget' | 'committee';
  startsAt: string; // ISO string (UTC)
  location: string;
};

interface Props {
  initial?: Partial<MeetingFormValues>;
  onSubmit?: (values: MeetingFormValues) => void | Promise<void>;
}

export function MeetingForm({ initial, onSubmit }: Props) {
  const [values, setValues] = React.useState<MeetingFormValues>({
    title: initial?.title ?? '',
    meetingType: (initial?.meetingType as MeetingFormValues['meetingType']) ?? 'board',
    startsAt: initial?.startsAt ?? new Date().toISOString(),
    location: initial?.location ?? '',
  });

  function handleChange<K extends keyof MeetingFormValues>(key: K, val: MeetingFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit?.(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Title</label>
        <input
          value={values.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className="border rounded px-2 py-1 w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Type</label>
        <select
          value={values.meetingType}
          onChange={(e) => handleChange('meetingType', e.target.value as MeetingFormValues['meetingType'])}
          className="border rounded px-2 py-1 w-full"
        >
          <option value="board">Board</option>
          <option value="annual">Annual</option>
          <option value="special">Special</option>
          <option value="budget">Budget</option>
          <option value="committee">Committee</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Starts At (UTC)</label>
        <input
          value={values.startsAt}
          onChange={(e) => handleChange('startsAt', e.target.value)}
          className="border rounded px-2 py-1 w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Location</label>
        <input
          value={values.location}
          onChange={(e) => handleChange('location', e.target.value)}
          className="border rounded px-2 py-1 w-full"
        />
      </div>
      <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">
        Save
      </button>
    </form>
  );
}

