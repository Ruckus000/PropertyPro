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
import { X, Undo2, Trash2, Pencil, Type, Upload } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden
      />

      {/* Panel — full height on mobile, centered modal on desktop */}
      <div className="relative z-10 bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg h-[85vh] md:h-auto md:max-h-[80vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-5">
          {/* Use cached value */}
          {cachedValue && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-2">
                Use your previous {mode}:
              </p>
              <div className="flex items-center gap-3">
                <img
                  src={cachedValue}
                  alt={`Previous ${mode}`}
                  className="h-12 border rounded bg-white"
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

          {activeTab === 'draw' && (
            <div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
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
                  <Undo2 className="h-4 w-4 mr-1" />
                  Undo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClear}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'type' && (
            <div>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={
                  mode === 'initials' ? 'Enter your initials' : 'Type your full name'
                }
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={mode === 'initials' ? 5 : 100}
                autoFocus
              />
              {typedText.trim() && (
                <div className="mt-4 p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center min-h-[80px]">
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
          )}

          {activeTab === 'upload' && (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                {uploadPreview ? (
                  <img
                    src={uploadPreview}
                    alt="Uploaded signature"
                    className="max-h-32 max-w-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center">
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">
                      Click to upload PNG or JPG
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Max 2 MB</p>
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
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              )}
            </div>
          )}
        </div>

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
      </div>
    </div>
  );
}

export default SignatureCapture;
