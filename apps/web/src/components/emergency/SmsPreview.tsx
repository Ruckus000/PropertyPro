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
        <span className="text-xs font-medium text-content-tertiary">SMS Preview</span>
        <span className={`text-xs ${charCount > maxLength ? 'text-status-warning' : 'text-content-disabled'}`}>
          {charCount}/{maxLength} chars
          {parts > 1 && ` (${parts} parts)`}
        </span>
      </div>
      <div className="rounded-md border border-edge bg-surface-page p-3">
        <p className="whitespace-pre-wrap text-sm text-content">
          {body || <span className="italic text-content-disabled">Enter SMS message...</span>}
        </p>
      </div>
    </div>
  );
}
