import * as React from 'react';

export interface MeetingListItem {
  id: number;
  title: string;
  meetingType: string;
  startsAt: string; // ISO (UTC)
  location: string;
}

interface Props {
  items: MeetingListItem[];
}

export function MeetingList({ items }: Props) {
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div key={m.id} className="border rounded p-3">
          <div className="text-sm text-gray-500">{new Date(m.startsAt).toUTCString()}</div>
          <div className="font-medium">{m.title}</div>
          <div className="text-sm">{m.meetingType} • {m.location}</div>
        </div>
      ))}
    </div>
  );
}

