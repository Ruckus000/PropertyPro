'use client';

import { ALLOWED_FONTS } from '@propertypro/theme';

interface ColorPickerFieldProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function ColorPickerField({ label, description, value, onChange, id }: ColorPickerFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-content-secondary">{label}</label>
      {description && <p className="mb-1.5 text-xs text-content-tertiary">{description}</p>}
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-16 cursor-pointer rounded border border-edge-strong p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="^#[0-9a-fA-F]{6}$"
          maxLength={7}
          className="w-28 rounded border border-edge-strong px-2 py-1.5 font-mono text-sm"
        />
      </div>
    </div>
  );
}

interface FontSelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function FontSelectField({ label, value, onChange, id }: FontSelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-content-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-edge-strong px-2 py-1.5 text-sm"
      >
        {ALLOWED_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
    </div>
  );
}
