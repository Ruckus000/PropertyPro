'use client';

/**
 * Branding editor section for the demo edit drawer.
 *
 * Adapted from CommunityWebsiteEditor — same color pickers, font dropdowns,
 * and logo upload pattern, but without the inline preview (the iframe IS the
 * live preview). Saves via demo-scoped branding API.
 */
import { useState, useEffect } from 'react';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import type { CommunityBranding } from '@propertypro/shared';
import { THEME_DEFAULTS } from '@propertypro/theme';
import { BrandingFormFields } from './BrandingFormFields';
import type { BrandingValues } from './BrandingFormFields';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandingEditSectionProps {
  demoId: number;
  communityId: number;
  onSaved: () => void;
}

function brandingToForm(b: Partial<CommunityBranding>): BrandingValues {
  return {
    primaryColor: b.primaryColor ?? THEME_DEFAULTS.primaryColor,
    secondaryColor: b.secondaryColor ?? THEME_DEFAULTS.secondaryColor,
    accentColor: b.accentColor ?? THEME_DEFAULTS.accentColor,
    fontHeading: b.fontHeading ?? THEME_DEFAULTS.fontHeading,
    fontBody: b.fontBody ?? THEME_DEFAULTS.fontBody,
    logoPath: b.logoPath ?? '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BrandingEditSection({ demoId, communityId, onSaved }: BrandingEditSectionProps) {
  const [form, setForm] = useState<BrandingValues>(brandingToForm({}));
  const [initial, setInitial] = useState<BrandingValues>(brandingToForm({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Fetch current branding
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/demos/${demoId}/community/branding`);
        if (!res.ok) throw new Error('Failed to load branding');
        const data = await res.json();
        const branding = data.branding as CommunityBranding;
        const f = brandingToForm(branding);
        if (!cancelled) {
          setForm(f);
          setInitial(f);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load branding');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [demoId]);

  function handleChange(values: BrandingValues) {
    setForm(values);
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
      if (form.primaryColor !== initial.primaryColor) body.primaryColor = form.primaryColor;
      if (form.secondaryColor !== initial.secondaryColor) body.secondaryColor = form.secondaryColor;
      if (form.accentColor !== initial.accentColor) body.accentColor = form.accentColor;
      if (form.fontHeading !== initial.fontHeading) body.fontHeading = form.fontHeading;
      if (form.fontBody !== initial.fontBody) body.fontBody = form.fontBody;
      if (form.logoPath !== initial.logoPath) body.logoPath = form.logoPath;

      if (Object.keys(body).length === 0) {
        setSuccess(true);
        return;
      }

      const res = await fetch(`/api/admin/demos/${demoId}/community/branding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to save');
        return;
      }

      const f = brandingToForm(data.branding as CommunityBranding);
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
        <span className="ml-2 text-xs text-gray-500">Loading branding...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <BrandingFormFields
        value={form}
        onChange={handleChange}
        communityId={communityId}
        onError={setError}
      />

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
