'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneFrame } from '@propertypro/ui';

interface SplitPreviewClientProps {
  boardUrl: string | null;
  residentUrl: string | null;
}

export function SplitPreviewClient({ boardUrl, residentUrl }: SplitPreviewClientProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyShareableLink = async () => {
    if (!boardUrl) return;

    try {
      await navigator.clipboard.writeText(boardUrl);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = setTimeout(() => {
      setCopyState('idle');
    }, 1600);
  };

  return (
    <div className="grid flex-1" style={{ gridTemplateColumns: '1fr 462px' }}>
      {/* Left: Desktop board member dashboard */}
      <div className="flex flex-col border-r border-gray-200">
        <div className="flex items-center justify-end border-b border-gray-200 bg-white px-3 py-2">
          <button
            type="button"
            onClick={() => {
              void handleCopyShareableLink();
            }}
            disabled={!boardUrl}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copyState === 'copied'
              ? 'Copied!'
              : copyState === 'error'
                ? 'Copy failed'
                : 'Copy shareable link'}
          </button>
        </div>
        {boardUrl ? (
          <iframe
            src={boardUrl}
            className="h-full w-full flex-1"
            title="Board member dashboard preview"
          />
        ) : (
          <div className="flex h-full flex-1 items-center justify-center text-sm text-gray-400">
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
