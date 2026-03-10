'use client';

import { useState, useTransition } from 'react';
import { ESIGN_CONSENT_TEXT } from '@propertypro/shared';

interface EsignConsentDialogProps {
  communityId: number;
  onConsented: () => void;
  onCancel: () => void;
}

export function EsignConsentDialog({
  communityId,
  onConsented,
  onCancel,
}: EsignConsentDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!agreed) return;
    startTransition(async () => {
      const response = await fetch(
        `/api/v1/esign/submissions?communityId=${communityId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'consent', communityId }),
        },
      );
      if (response.ok) {
        onConsented();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Electronic Signature Consent
        </h2>
        <div className="mb-4 rounded-md bg-blue-50 p-4 text-sm text-gray-700">
          {ESIGN_CONSENT_TEXT}
        </div>
        <label className="mb-6 flex items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">
            I consent to conduct this transaction electronically
          </span>
        </label>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!agreed || isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Processing...' : 'I Agree'}
          </button>
        </div>
      </div>
    </div>
  );
}
