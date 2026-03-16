'use client';

/**
 * Community info editor section for the demo edit drawer.
 *
 * Allows editing the community name and address fields.
 * Saves via the demo-scoped community API.
 */
import { useState, useEffect } from 'react';
import { Loader2, Save, RotateCcw } from 'lucide-react';

interface CommunityEditSectionProps {
  demoId: number;
  onSaved: () => void;
}

interface CommunityForm {
  name: string;
  address_line1: string;
  city: string;
  state: string;
  zip_code: string;
}

const EMPTY_FORM: CommunityForm = {
  name: '',
  address_line1: '',
  city: '',
  state: '',
  zip_code: '',
};

export function CommunityEditSection({ demoId, onSaved }: CommunityEditSectionProps) {
  const [form, setForm] = useState<CommunityForm>(EMPTY_FORM);
  const [initial, setInitial] = useState<CommunityForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Fetch current community info
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/demos/${demoId}/community`);
        if (!res.ok) throw new Error('Failed to load community');
        const data = await res.json();
        const c = data.community;
        const f: CommunityForm = {
          name: c.name ?? '',
          address_line1: c.address_line1 ?? '',
          city: c.city ?? '',
          state: c.state ?? '',
          zip_code: c.zip_code ?? '',
        };
        if (!cancelled) {
          setForm(f);
          setInitial(f);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load community info');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [demoId]);

  function handleChange(field: keyof CommunityForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  }

  function handleReset() {
    setForm(initial);
    setError('');
    setSuccess(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const body: Record<string, string> = {};
      for (const key of Object.keys(form) as Array<keyof CommunityForm>) {
        if (form[key] !== initial[key]) {
          body[key] = form[key];
        }
      }

      if (Object.keys(body).length === 0) {
        setSuccess(true);
        return;
      }

      const res = await fetch(`/api/admin/demos/${demoId}/community`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to save');
        return;
      }

      const c = data.community;
      const f: CommunityForm = {
        name: c.name ?? '',
        address_line1: c.address_line1 ?? '',
        city: c.city ?? '',
        state: c.state ?? '',
        zip_code: c.zip_code ?? '',
      };
      setForm(f);
      setInitial(f);
      setSuccess(true);
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-gray-400" />
        <span className="ml-2 text-xs text-gray-500">Loading community info...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      {/* Name */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Community Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          maxLength={200}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Address */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Address</label>
        <input
          type="text"
          value={form.address_line1}
          onChange={(e) => handleChange('address_line1', e.target.value)}
          maxLength={500}
          placeholder="Street address"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">City</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => handleChange('city', e.target.value)}
            maxLength={100}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">State</label>
          <input
            type="text"
            value={form.state}
            onChange={(e) => handleChange('state', e.target.value.toUpperCase())}
            maxLength={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">ZIP</label>
          <input
            type="text"
            value={form.zip_code}
            onChange={(e) => handleChange('zip_code', e.target.value)}
            maxLength={10}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw size={12} />
          Reset
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">Saved</p>}
      </div>
    </form>
  );
}
