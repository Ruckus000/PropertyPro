'use client';

/**
 * FieldPalette — Sidebar toolbar for the template builder.
 *
 * Provides role selector tabs and field type buttons for placing fields on the
 * PDF canvas.
 */

import {
  PenTool,
  Type,
  Calendar,
  TextCursorInput,
  CheckSquare,
  MousePointerClick,
} from 'lucide-react';
import { ESIGN_FIELD_TYPES, type EsignFieldType } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldPaletteProps {
  signerRoles: string[];
  activeRole: string;
  onRoleChange: (role: string) => void;
  activeFieldType: EsignFieldType | null;
  onFieldTypeSelect: (type: EsignFieldType | null) => void;
  fieldCounts: Record<string, number>;
  signerRoleColors: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_TYPE_CONFIG: Record<
  EsignFieldType,
  { icon: typeof PenTool; label: string }
> = {
  signature: { icon: PenTool, label: 'Signature' },
  initials: { icon: Type, label: 'Initials' },
  date: { icon: Calendar, label: 'Date' },
  text: { icon: TextCursorInput, label: 'Text' },
  checkbox: { icon: CheckSquare, label: 'Checkbox' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldPalette({
  signerRoles,
  activeRole,
  onRoleChange,
  activeFieldType,
  onFieldTypeSelect,
  fieldCounts,
  signerRoleColors,
}: FieldPaletteProps) {
  return (
    <div className="flex w-56 flex-col gap-5 rounded-lg border border-edge-subtle bg-surface-card p-4">
      {/* Signer Roles */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
          Signer Role
        </h3>
        <div className="flex flex-col gap-1">
          {signerRoles.map((role) => {
            const color = signerRoleColors[role] ?? '#6b7280';
            const isActive = role === activeRole;
            const count = fieldCounts[role] ?? 0;

            return (
              <button
                key={role}
                type="button"
                onClick={() => onRoleChange(role)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-subtle text-content'
                    : 'text-content-secondary hover:bg-surface-subtle hover:text-content'
                }`}
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 truncate text-left capitalize">
                  {role.replace(/_/g, ' ')}
                </span>
                {count > 0 && (
                  <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-content-tertiary">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-edge-subtle" />

      {/* Field Types */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
          Field Type
        </h3>
        <div className="flex flex-col gap-1">
          {ESIGN_FIELD_TYPES.map((fieldType) => {
            const config = FIELD_TYPE_CONFIG[fieldType];
            const Icon = config.icon;
            const isActive = activeFieldType === fieldType;

            return (
              <button
                key={fieldType}
                type="button"
                onClick={() =>
                  onFieldTypeSelect(isActive ? null : fieldType)
                }
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-interactive text-white'
                    : 'text-content-secondary hover:bg-surface-subtle hover:text-content'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Placement instruction */}
      {activeFieldType && (
        <>
          <div className="border-t border-edge-subtle" />
          <div className="flex items-start gap-2 rounded-md bg-status-info-bg p-3 text-xs text-status-info">
            <MousePointerClick className="mt-0.5 size-4 shrink-0" />
            <span>
              Click on the document to place a{' '}
              <strong>{FIELD_TYPE_CONFIG[activeFieldType].label.toLowerCase()}</strong>{' '}
              field for{' '}
              <strong className="capitalize">
                {activeRole.replace(/_/g, ' ')}
              </strong>
              .
            </span>
          </div>
        </>
      )}
    </div>
  );
}
