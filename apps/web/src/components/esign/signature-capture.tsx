'use client';

/**
 * SignatureCapture — Modal for capturing signatures or initials.
 *
 * Three tabs: Draw (signature_pad canvas), Type (cursive preview), Upload (file input).
 * On mobile (<768px) renders as a full-height sheet instead of a centered modal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { Button } from '@propertypro/ui';
import { Undo2, Trash2, Pencil, Type, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export interface SignatureCaptureProps {
  mode: 'signature' | 'initials';
  cachedValue?: string;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

type TabId = 'draw' | 'type' | 'upload';

const TABS: { id: TabId; label: string; icon: typeof Pencil }[] = [
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'type', label: 'Type', icon: Type },
  { id: 'upload', label: 'Upload', icon: Upload },
];

const CURSIVE_FONT_STACK = "'Brush Script MT', 'Segoe Script', cursive";
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024; // 2 MB

export function SignatureCapture({
  mode,
  cachedValue,
  onCapture,
  onCancel,
}: SignatureCaptureProps) {
  const [activeTab, setActiveTab] = useState<TabId>('draw');
  const [typedText, setTypedText] = useState('');
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const title = mode === 'signature' ? 'Add Signature' : 'Add Initials';

  // ------- Draw tab -------
  useEffect(() => {
    if (activeTab !== 'draw' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio ?? 1, 1);
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
    });
    padRef.current = pad;

    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [activeTab]);

  const handleClear = useCallback(() => {
    padRef.current?.clear();
  }, []);

  const handleUndo = useCallback(() => {
    const pad = padRef.current;
    if (!pad) return;
    const data = pad.toData();
    if (data.length > 0) {
      data.pop();
      pad.fromData(data);
    }
  }, []);

  // ------- Upload tab -------
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUploadError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      if (!['image/png', 'image/jpeg'].includes(file.type)) {
        setUploadError('Only PNG or JPG files are allowed.');
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE) {
        setUploadError('File must be under 2 MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setUploadPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  // ------- Type tab: render to canvas to produce data URL -------
  const typeToDataUrl = useCallback(
    (text: string): string => {
      const canvas = document.createElement('canvas');
      const fontSize = mode === 'initials' ? 48 : 36;
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.font = `${fontSize}px ${CURSIVE_FONT_STACK}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 16, canvas.height / 2);
      return canvas.toDataURL('image/png');
    },
    [mode],
  );

  // ------- Submit -------
  const handleConfirm = useCallback(() => {
    if (activeTab === 'draw') {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) return;
      onCapture(pad.toDataURL('image/png'));
    } else if (activeTab === 'type') {
      if (!typedText.trim()) return;
      onCapture(typeToDataUrl(typedText.trim()));
    } else if (activeTab === 'upload') {
      if (!uploadPreview) return;
      onCapture(uploadPreview);
    }
  }, [activeTab, typedText, uploadPreview, onCapture, typeToDataUrl]);

  const isConfirmDisabled =
    (activeTab === 'draw' && padRef.current?.isEmpty() !== false) ||
    (activeTab === 'type' && !typedText.trim()) ||
    (activeTab === 'upload' && !uploadPreview);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      {/*
       * Override DialogContent defaults:
       * - Remove default padding/gap (p-0, gap-0) — inner layout owns spacing
       * - Remove default centering transform on mobile — align to bottom instead
       * - Mobile: full-width, 85vh, rounded top only, slide from bottom
       * - Desktop (md+): centered modal, max-w-lg, full rounding, max-h-[80vh]
       */}
      <DialogContent
        className={cn(
          // Reset shadcn defaults
          'p-0 gap-0',
          // Layout
          'flex flex-col overflow-hidden',
          // Mobile: bottom sheet
          'top-auto bottom-0 left-0 right-0 translate-x-0 translate-y-0',
          'w-full h-[85vh]',
          'rounded-t-2xl rounded-b-none',
          // Desktop: centered modal
          'md:top-1/2 md:bottom-auto md:left-1/2 md:right-auto',
          'md:translate-x-[-50%] md:translate-y-[-50%]',
          'md:max-w-lg md:h-auto md:max-h-[80vh]',
          'md:rounded-2xl',
        )}
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between px-5 py-4 border-b space-y-0">
          <DialogTitle className="text-lg font-semibold text-content">
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs — underline style matching original design */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as TabId)}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <TabsList
            className={cn(
              // Override pill-style defaults with underline row
              'h-auto w-full rounded-none bg-transparent p-0',
              'border-b px-5',
              'justify-start gap-0',
            )}
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    // Override shadcn trigger defaults
                    'rounded-none bg-transparent shadow-none px-4 py-2.5 text-sm font-medium',
                    'border-b-2 -mb-px',
                    'text-content-tertiary hover:text-content-secondary',
                    'data-[state=active]:border-interactive data-[state=active]:text-content-link data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                    'data-[state=inactive]:border-transparent',
                    'transition-colors duration-quick',
                  )}
                >
                  <Icon className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab content panels */}
          <div className="flex-1 overflow-auto p-5">
            {/* Use cached value */}
            {cachedValue && (
              <div className="mb-4 p-3 bg-surface-hover rounded-md border border-edge">
                <p className="text-xs text-content-tertiary mb-2">
                  Use your previous {mode}:
                </p>
                <div className="flex items-center gap-3">
                  <img
                    src={cachedValue}
                    alt={`Previous ${mode}`}
                    className="h-12 border rounded bg-surface-card"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onCapture(cachedValue)}
                  >
                    Use previous
                  </Button>
                </div>
              </div>
            )}

            <TabsContent value="draw" className="mt-0">
              <div>
                <div className="border-2 border-dashed border-edge-strong rounded-md overflow-hidden bg-surface-card">
                  <canvas
                    ref={canvasRef}
                    className="w-full"
                    style={{ height: 200, touchAction: 'none' }}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUndo}
                  >
                    <Undo2 className="h-4 w-4 mr-1" aria-hidden="true" />
                    Undo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClear}
                  >
                    <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                    Clear
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="type" className="mt-0">
              <div>
                <input
                  type="text"
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder={
                    mode === 'initials' ? 'Enter your initials' : 'Type your full name'
                  }
                  className="w-full border border-edge-strong rounded-md px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                  maxLength={mode === 'initials' ? 5 : 100}
                  autoFocus
                />
                {typedText.trim() && (
                  <div className="mt-4 p-4 bg-surface-card border-2 border-dashed border-edge-strong rounded-md flex items-center justify-center min-h-[80px]">
                    <span
                      style={{
                        fontFamily: CURSIVE_FONT_STACK,
                        fontSize: mode === 'initials' ? '48px' : '36px',
                        color: '#000',
                      }}
                    >
                      {typedText}
                    </span>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="mt-0">
              <div>
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-edge-strong rounded-md cursor-pointer hover:bg-surface-hover transition-colors duration-quick">
                  {uploadPreview ? (
                    <img
                      src={uploadPreview}
                      alt="Uploaded signature"
                      className="max-h-32 max-w-full object-contain p-2"
                    />
                  ) : (
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto text-content-disabled mb-2" aria-hidden="true" />
                      <p className="text-sm text-content-tertiary">
                        Click to upload PNG or JPG
                      </p>
                      <p className="text-xs text-content-disabled mt-1">Max 2 MB</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {uploadError && (
                  <p className="mt-2 text-sm text-status-danger" role="alert">{uploadError}</p>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="border-t px-5 py-4 flex gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="flex-1"
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SignatureCapture;
