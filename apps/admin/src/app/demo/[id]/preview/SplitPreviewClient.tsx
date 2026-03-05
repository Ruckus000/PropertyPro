'use client';

import { PhoneFrame } from '@propertypro/ui';

interface SplitPreviewClientProps {
  boardUrl: string | null;
  residentUrl: string | null;
}

export function SplitPreviewClient({ boardUrl, residentUrl }: SplitPreviewClientProps) {
  return (
    <div className="grid flex-1" style={{ gridTemplateColumns: '1fr 462px' }}>
      {/* Left: Desktop board member dashboard */}
      <div className="border-r border-gray-200">
        {boardUrl ? (
          <iframe
            src={boardUrl}
            className="h-full w-full"
            title="Board member dashboard preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Board user not available
          </div>
        )}
      </div>

      {/* Right: Mobile resident view in PhoneFrame */}
      <div className="flex items-center justify-center bg-gray-100 p-4 overflow-auto">
        {residentUrl ? (
          <PhoneFrame src={residentUrl} />
        ) : (
          <div className="text-sm text-gray-400">Resident user not available</div>
        )}
      </div>
    </div>
  );
}
