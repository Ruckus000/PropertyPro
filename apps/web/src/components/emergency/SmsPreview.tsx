"use client";

interface Props {
  body: string;
  maxLength?: number;
}

export function SmsPreview({ body, maxLength = 160 }: Props) {
  const charCount = body.length;
  const parts = charCount <= maxLength ? 1 : Math.ceil(charCount / 153); // Multi-part: 153 chars per segment

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">SMS Preview</span>
        <span className={`text-xs ${charCount > maxLength ? 'text-orange-600' : 'text-gray-400'}`}>
          {charCount}/{maxLength} chars
          {parts > 1 && ` (${parts} parts)`}
        </span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="whitespace-pre-wrap text-sm text-gray-800">
          {body || <span className="italic text-gray-400">Enter SMS message...</span>}
        </p>
      </div>
    </div>
  );
}
