'use client';

/**
 * FieldOverlay — Renders field markers over the PDF canvas.
 *
 * Supports three modes:
 *  - edit: draggable fields with keyboard support (arrow keys, Delete)
 *  - view: static colored badges with type icon + role label
 *  - sign: clickable fields, unfilled pulse, filled show checkmark
 */

import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  DndContext,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  PenTool,
  Type,
  Calendar,
  TextCursorInput,
  CheckSquare,
  Check,
  X,
} from 'lucide-react';
import type { EsignFieldDefinition, EsignFieldType } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldOverlayProps {
  fields: EsignFieldDefinition[];
  pageDimensions: { width: number; height: number };
  currentPage: number;
  mode: 'edit' | 'view' | 'sign';
  selectedFieldId?: string | null;
  onFieldSelect?: (fieldId: string) => void;
  onFieldUpdate?: (
    fieldId: string,
    update: Partial<Pick<EsignFieldDefinition, 'x' | 'y' | 'width' | 'height'>>,
  ) => void;
  onFieldRemove?: (fieldId: string) => void;
  filledFieldIds?: Set<string>;
  onFieldClick?: (field: EsignFieldDefinition) => void;
  signerRoleColors: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_ICONS: Record<EsignFieldType, typeof PenTool> = {
  signature: PenTool,
  initials: Type,
  date: Calendar,
  text: TextCursorInput,
  checkbox: CheckSquare,
};

const FIELD_LABELS: Record<EsignFieldType, string> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
};

/** Pixel nudge amount for arrow key movement (in percentage points). */
const NUDGE_AMOUNT = 0.5;

// ---------------------------------------------------------------------------
// Draggable field (edit mode)
// ---------------------------------------------------------------------------

interface DraggableFieldProps {
  field: EsignFieldDefinition;
  pageDimensions: { width: number; height: number };
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onNudge: (dx: number, dy: number) => void;
}

function DraggableField({
  field,
  pageDimensions,
  color,
  isSelected,
  onSelect,
  onRemove,
  onNudge,
}: DraggableFieldProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: field.id });

  const Icon = FIELD_ICONS[field.type];

  // Convert drag transform (px) back to percentage
  const transformX = transform
    ? (transform.x / pageDimensions.width) * 100
    : 0;
  const transformY = transform
    ? (transform.y / pageDimensions.height) * 100
    : 0;

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onNudge(0, -NUDGE_AMOUNT);
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNudge(0, NUDGE_AMOUNT);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onNudge(-NUDGE_AMOUNT, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNudge(NUDGE_AMOUNT, 0);
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onRemove();
          break;
      }
    },
    [onNudge, onRemove],
  );

  return (
    <div
      ref={setNodeRef}
      aria-label={`${FIELD_LABELS[field.type]} field for ${field.signerRole}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={handleKeyDown}
      className={`absolute flex items-center justify-center rounded border-2 text-xs font-medium cursor-grab transition-shadow ${
        isDragging ? 'z-50 opacity-80 shadow-lg cursor-grabbing' : 'z-10'
      } ${isSelected ? 'ring-2 ring-[var(--interactive-primary)] ring-offset-1' : ''}`}
      style={{
        left: `${field.x + transformX}%`,
        top: `${field.y + transformY}%`,
        width: `${field.width}%`,
        height: `${field.height}%`,
        borderColor: color,
        backgroundColor: `${color}20`,
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      {isSelected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-2 -top-2 z-20 flex size-4 items-center justify-center rounded-full bg-[var(--status-danger)] text-content-inverse hover:opacity-80"
          aria-label="Remove field"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static field (view mode)
// ---------------------------------------------------------------------------

interface StaticFieldProps {
  field: EsignFieldDefinition;
  color: string;
}

function StaticField({ field, color }: StaticFieldProps) {
  const Icon = FIELD_ICONS[field.type];

  return (
    <div
      className="absolute flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        left: `${field.x}%`,
        top: `${field.y}%`,
        width: `${field.width}%`,
        height: `${field.height}%`,
        borderColor: color,
        backgroundColor: `${color}20`,
        color,
      }}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{field.signerRole}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signable field (sign mode)
// ---------------------------------------------------------------------------

interface SignableFieldProps {
  field: EsignFieldDefinition;
  color: string;
  isFilled: boolean;
  onClick: () => void;
}

function SignableField({ field, color, isFilled, onClick }: SignableFieldProps) {
  const Icon = FIELD_ICONS[field.type];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute flex items-center justify-center rounded border-2 text-xs font-medium transition-all ${
        isFilled
          ? 'opacity-70'
          : 'animate-pulse ring-2 ring-offset-1 cursor-pointer hover:opacity-90'
      }`}
      style={{
        left: `${field.x}%`,
        top: `${field.y}%`,
        width: `${field.width}%`,
        height: `${field.height}%`,
        borderColor: color,
        backgroundColor: isFilled ? `${color}30` : `${color}15`,
        // Use CSS custom property for the ring color
        '--tw-ring-color': isFilled ? undefined : color,
      } as React.CSSProperties}
      aria-label={
        isFilled
          ? `${FIELD_LABELS[field.type]} completed`
          : `Click to fill ${FIELD_LABELS[field.type]}`
      }
    >
      {isFilled ? (
        <Check className="size-4 text-[var(--status-success)]" />
      ) : (
        <Icon className="size-3.5" style={{ color }} />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function FieldOverlay({
  fields,
  pageDimensions,
  currentPage,
  mode,
  selectedFieldId,
  onFieldSelect,
  onFieldUpdate,
  onFieldRemove,
  filledFieldIds,
  onFieldClick,
  signerRoleColors,
}: FieldOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Filter to current page
  const pageFields = fields.filter((f) => f.page === currentPage);

  const getColor = (role: string) => signerRoleColors[role] ?? '#6b7280';

  // Deselect when clicking empty area
  const handleBackgroundClick = useCallback(() => {
    if (mode === 'edit' && onFieldSelect) {
      // Pass empty string to signal deselection; parent handles clearing
      onFieldSelect('');
    }
  }, [mode, onFieldSelect]);

  // Handle drag end — convert pixel delta to percentage update
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      if (!onFieldUpdate || !delta) return;

      const dx = (delta.x / pageDimensions.width) * 100;
      const dy = (delta.y / pageDimensions.height) * 100;

      const field = fields.find((f) => f.id === active.id);
      if (!field) return;

      onFieldUpdate(String(active.id), {
        x: Math.max(0, Math.min(100 - field.width, field.x + dx)),
        y: Math.max(0, Math.min(100 - field.height, field.y + dy)),
      });
    },
    [fields, pageDimensions, onFieldUpdate],
  );

  // ---------------------------------------------------------------------------
  // Edit mode with DnD
  // ---------------------------------------------------------------------------
  if (mode === 'edit') {
    return (
      <DndContext onDragEnd={handleDragEnd}>
        <div
          ref={overlayRef}
          className="absolute inset-0"
          onClick={handleBackgroundClick}
        >
          {pageFields.map((field) => (
            <DraggableField
              key={field.id}
              field={field}
              pageDimensions={pageDimensions}
              color={getColor(field.signerRole)}
              isSelected={selectedFieldId === field.id}
              onSelect={() => onFieldSelect?.(field.id)}
              onRemove={() => onFieldRemove?.(field.id)}
              onNudge={(dx, dy) =>
                onFieldUpdate?.(field.id, {
                  x: Math.max(0, Math.min(100 - field.width, field.x + dx)),
                  y: Math.max(0, Math.min(100 - field.height, field.y + dy)),
                })
              }
            />
          ))}
        </div>
      </DndContext>
    );
  }

  // ---------------------------------------------------------------------------
  // View mode
  // ---------------------------------------------------------------------------
  if (mode === 'view') {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {pageFields.map((field) => (
          <StaticField
            key={field.id}
            field={field}
            color={getColor(field.signerRole)}
          />
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Sign mode
  // ---------------------------------------------------------------------------
  return (
    <div className="absolute inset-0">
      {pageFields.map((field) => (
        <SignableField
          key={field.id}
          field={field}
          color={getColor(field.signerRole)}
          isFilled={filledFieldIds?.has(field.id) ?? false}
          onClick={() => onFieldClick?.(field)}
        />
      ))}
    </div>
  );
}
