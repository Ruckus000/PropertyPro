'use client';

/**
 * ProspectEditSection — inline form for editing demo prospect metadata.
 *
 * Mirrors the CommunityEditSection pattern: fetches current values from
 * GET /api/admin/demos/:id and saves via PATCH /api/admin/demos/:id.
 *
 * Fields: prospect_name (required), external_crm_url (optional), prospect_notes (optional).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

interface ProspectEditSectionProps {
  demoId: number;
  onSaved: () => void;
}

interface ProspectFormState {
  prospect_name: string;
  external_crm_url: string;
  prospect_notes: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ProspectEditSection({ demoId, onSaved }: ProspectEditSectionProps) {
  const [form, setForm] = useState<ProspectFormState>({
    prospect_name: '',
    external_crm_url: '',
    prospect_notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDemo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/demos/${demoId}`);
      if (!res.ok) return;
      const json = await res.json();
      const d = json.data ?? {};
      setForm({
        prospect_name: d.prospect_name ?? '',
        external_crm_url: d.external_crm_url ?? '',
        prospect_notes: d.prospect_notes ?? '',
      });
    } catch {
      // Keep defaults on failure
    } finally {
      setLoading(false);
    }
  }, [demoId]);

  useEffect(() => {
    fetchDemo();
  }, [fetchDemo]);

  const handleChange = (field: keyof ProspectFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (saveState !== 'idle') setSaveState('idle');
    setErrorMessage(null);
  };

  const handleSave = async () => {
    if (!form.prospect_name.trim()) {
      setErrorMessage('Prospect name is required.');
      return;
    }

    setSaveState('saving');
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/demos/${demoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: form.prospect_name.trim(),
          external_crm_url: form.external_crm_url.trim() || null,
          prospect_notes: form.prospect_notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMessage(json.error?.message ?? 'Save failed. Please try again.');
        setSaveState('error');
        return;
      }

      setSaveState('saved');
      onSaved();
      setTimeout(() => setSaveState('idle'), 1800);
    } catch {
      setErrorMessage('Save failed. Please try again.');
      setSaveState('error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
        <span className="text-sm text-gray-500">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Prospect Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.prospect_name}
          onChange={(e) => handleChange('prospect_name', e.target.value)}
          placeholder="e.g. Sunset Condos HOA"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          CRM Link
          <span className="ml-1 text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="url"
          value={form.external_crm_url}
          onChange={(e) => handleChange('external_crm_url', e.target.value)}
          placeholder="https://crm.example.com/deal/123"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Notes
          <span className="ml-1 text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={form.prospect_notes}
          onChange={(e) => handleChange('prospect_notes', e.target.value)}
          placeholder="Add any notes about this prospect…"
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      {errorMessage && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}

      <button
        type="button"
        onClick={() => { void handleSave(); }}
        disabled={saveState === 'saving'}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {saveState === 'saving' ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Saving…
          </>
        ) : saveState === 'saved' ? (
          <>
            <Save size={14} />
            Saved
          </>
        ) : (
          <>
            <Save size={14} />
            Save Changes
          </>
        )}
      </button>
    </div>
  );
}
