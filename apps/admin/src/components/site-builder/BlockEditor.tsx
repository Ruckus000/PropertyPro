'use client';

/**
 * BlockEditor — drag-and-drop block list with auto-save, publish, and discard.
 *
 * Uses @dnd-kit/sortable for reordering blocks.
 * Auto-saves with 500ms debounce on content changes.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Upload,
  X,
  Loader2,
} from 'lucide-react';
import {
  BLOCK_TYPES,
  type BlockType,
  type BlockContent,
  getDefaultBlockContent,
} from '@propertypro/shared/site-blocks';
import {
  HeroEditor,
  AnnouncementsEditor,
  DocumentsEditor,
  MeetingsEditor,
  ContactEditor,
  TextEditor,
  ImageEditor,
} from './editors';

// ---------------------------------------------------------------------------
// API error parsing helper
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable error message from a failed API response.
 *
 * Our API routes return `{ error: { code, message } }` — this helper safely
 * parses that shape and falls back to `Response.statusText`.
 */
async function extractApiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as Record<string, unknown>;
    const errObj = json?.['error'];
    if (errObj && typeof errObj === 'object' && errObj !== null) {
      const msg = (errObj as Record<string, unknown>)['message'];
      if (typeof msg === 'string' && msg.length > 0) return msg;
    }
  } catch {
    // response body wasn't valid JSON — fall through
  }
  return res.statusText || `HTTP ${res.status}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SiteBlock {
  id: number;
  community_id: number;
  block_type: BlockType;
  block_order: number;
  content: BlockContent;
  is_draft: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BlockEditorProps {
  communityId: number;
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  hero: 'Hero Banner',
  announcements: 'Announcements',
  documents: 'Documents',
  meetings: 'Meetings',
  contact: 'Contact Info',
  text: 'Text',
  image: 'Image',
};

// ---------------------------------------------------------------------------
// SortableBlock — individual draggable block item
// ---------------------------------------------------------------------------

interface SortableBlockProps {
  block: SiteBlock;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onContentChange: (content: BlockContent) => void;
}

function SortableBlock({
  block,
  isExpanded,
  onToggle,
  onDelete,
  onContentChange,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-gray-200 bg-white shadow-e1"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button
          type="button"
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-900">
            {BLOCK_TYPE_LABELS[block.block_type] ?? block.block_type}
          </span>
          {block.is_draft && (
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700">
              Draft
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label={`Delete ${BLOCK_TYPE_LABELS[block.block_type]} block`}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="p-4">
          <BlockContentEditor
            blockType={block.block_type}
            content={block.content}
            onChange={onContentChange}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockContentEditor — dispatches to the correct type-specific editor
// ---------------------------------------------------------------------------

interface BlockContentEditorProps {
  blockType: BlockType;
  content: BlockContent;
  onChange: (content: BlockContent) => void;
}

function BlockContentEditor({ blockType, content, onChange }: BlockContentEditorProps) {
  switch (blockType) {
    case 'hero':
      return <HeroEditor content={content as Parameters<typeof HeroEditor>[0]['content']} onChange={onChange} />;
    case 'announcements':
      return <AnnouncementsEditor content={content as Parameters<typeof AnnouncementsEditor>[0]['content']} onChange={onChange} />;
    case 'documents':
      return <DocumentsEditor content={content as Parameters<typeof DocumentsEditor>[0]['content']} onChange={onChange} />;
    case 'meetings':
      return <MeetingsEditor content={content as Parameters<typeof MeetingsEditor>[0]['content']} onChange={onChange} />;
    case 'contact':
      return <ContactEditor content={content as Parameters<typeof ContactEditor>[0]['content']} onChange={onChange} />;
    case 'text':
      return <TextEditor content={content as Parameters<typeof TextEditor>[0]['content']} onChange={onChange} />;
    case 'image':
      return <ImageEditor content={content as Parameters<typeof ImageEditor>[0]['content']} onChange={onChange} />;
    default:
      return <p className="text-sm text-gray-500">Unknown block type: {blockType}</p>;
  }
}

// ---------------------------------------------------------------------------
// AddBlockDropdown
// ---------------------------------------------------------------------------

interface AddBlockDropdownProps {
  onAdd: (blockType: BlockType) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function AddBlockDropdown({ onAdd, isOpen, onToggle }: AddBlockDropdownProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors w-full justify-center"
      >
        <Plus size={16} />
        Add Block
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-10 mt-1 rounded-md border border-gray-200 bg-white shadow-e3 py-1">
          {BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAdd(type);
                onToggle();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {BLOCK_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-e3">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockEditor — main component
// ---------------------------------------------------------------------------

export function BlockEditor({ communityId }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<SiteBlock[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'publish' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-save debounce ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Map<number, BlockContent>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---------------------------------------------------------------------------
  // Load blocks
  // ---------------------------------------------------------------------------

  const loadBlocks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-blocks?communityId=${communityId}`);
      if (!res.ok) throw new Error(await extractApiError(res));
      const json = (await res.json()) as { data: SiteBlock[] };
      setBlocks(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blocks');
    } finally {
      setIsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  // ---------------------------------------------------------------------------
  // Auto-save with debounce
  // ---------------------------------------------------------------------------

  const flushSaves = useCallback(async () => {
    const pending = new Map(pendingSavesRef.current);
    pendingSavesRef.current.clear();

    if (pending.size === 0) return;

    setIsSaving(true);
    try {
      const promises = Array.from(pending.entries()).map(([blockId, content]) =>
        fetch(`/api/admin/site-blocks/${blockId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }),
      );
      await Promise.all(promises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-save failed');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const scheduleAutoSave = useCallback(
    (blockId: number, content: BlockContent) => {
      pendingSavesRef.current.set(blockId, content);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        void flushSaves();
      }, 500);
    },
    [flushSaves],
  );

  // Flush pending saves and cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // Fire-and-forget flush so edits made in the last 500ms aren't lost
      if (pendingSavesRef.current.size > 0) {
        void flushSaves();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Block operations
  // ---------------------------------------------------------------------------

  const handleAddBlock = useCallback(
    async (blockType: BlockType) => {
      setError(null);
      try {
        const res = await fetch('/api/admin/site-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            blockType,
            content: getDefaultBlockContent(blockType),
          }),
        });
        if (!res.ok) throw new Error(await extractApiError(res));
        const json = (await res.json()) as { data: SiteBlock };
        setBlocks((prev) => [...prev, json.data]);
        setExpandedIds((prev) => new Set(prev).add(json.data.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add block');
      }
    },
    [communityId],
  );

  const handleDeleteBlock = useCallback(async (blockId: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-blocks/${blockId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block');
    }
  }, []);

  const handleContentChange = useCallback(
    (blockId: number, content: BlockContent) => {
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, content } : b)),
      );
      scheduleAutoSave(blockId, content);
    },
    [scheduleAutoSave],
  );

  const handleToggleExpand = useCallback((blockId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Drag end — reorder blocks
  // ---------------------------------------------------------------------------

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistic reorder
      const reordered = [...blocks];
      const [moved] = reordered.splice(oldIndex, 1);
      if (!moved) return;
      reordered.splice(newIndex, 0, moved);

      // Update block_order values
      const withOrder = reordered.map((b, i) => ({ ...b, block_order: i }));
      setBlocks(withOrder);

      // Persist new order via batch endpoint
      try {
        const res = await fetch('/api/admin/site-blocks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            order: withOrder.map((b) => ({ id: b.id, blockOrder: b.block_order })),
          }),
        });
        if (!res.ok) throw new Error(await extractApiError(res));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reorder blocks');
        // Reload on error
        void loadBlocks();
      }
    },
    [blocks, communityId, loadBlocks],
  );

  // ---------------------------------------------------------------------------
  // Publish / Discard
  // ---------------------------------------------------------------------------

  const handlePublish = useCallback(async () => {
    setConfirmDialog(null);
    setIsPublishing(true);
    setError(null);

    // Flush any pending saves first
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    await flushSaves();

    try {
      const res = await fetch('/api/admin/site-blocks/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      // Reload blocks to reflect published state
      await loadBlocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  }, [communityId, flushSaves, loadBlocks]);

  const handleDiscard = useCallback(async () => {
    setConfirmDialog(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/site-blocks/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      // Reload blocks
      await loadBlocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard drafts');
    }
  }, [communityId, loadBlocks]);

  const hasDrafts = blocks.some((b) => b.is_draft);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Blocks</h3>
          {isSaving && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDrafts && (
            <button
              type="button"
              onClick={() => setConfirmDialog('discard')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Discard Drafts
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmDialog('publish')}
            disabled={isPublishing || blocks.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPublishing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            Publish
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Block list */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {blocks.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
            <p className="text-sm text-gray-500">
              No blocks yet. Click "Add Block" to get started.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((block) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  isExpanded={expandedIds.has(block.id)}
                  onToggle={() => handleToggleExpand(block.id)}
                  onDelete={() => handleDeleteBlock(block.id)}
                  onContentChange={(content) => handleContentChange(block.id, content)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {/* Add block button */}
        <AddBlockDropdown
          onAdd={handleAddBlock}
          isOpen={showAddMenu}
          onToggle={() => setShowAddMenu((prev) => !prev)}
        />
      </div>

      {/* Confirmation dialogs */}
      {confirmDialog === 'publish' && (
        <ConfirmDialog
          title="Publish Site"
          message="This will publish all draft blocks to the live community website. Visitors will see the changes immediately."
          confirmLabel="Publish Now"
          confirmVariant="primary"
          onConfirm={handlePublish}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {confirmDialog === 'discard' && (
        <ConfirmDialog
          title="Discard Drafts"
          message="This will permanently delete all unpublished draft blocks. Published blocks will not be affected. This action cannot be undone."
          confirmLabel="Discard Drafts"
          confirmVariant="danger"
          onConfirm={handleDiscard}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
