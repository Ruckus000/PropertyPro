'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useDocuments } from '@/hooks/use-documents';
import {
  useCreateWindMitigationReport,
  useUpdateWindMitigationReport,
} from '@/hooks/use-wind-mitigation';
import {
  WIND_MITIGATION_EXPIRY_HINT,
  WIND_MITIGATION_FORM_FAMILY_HINT,
} from '@/lib/constants/insurance-disclaimers';
import {
  WIND_MITIGATION_FORM_LABELS,
  WIND_MITIGATION_VERSION_LABELS,
  type WindMitigationFormType,
  type WindMitigationFormVersion,
  type WindMitigationReportRecord,
} from './types';

interface WindMitigationFormDialogProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = create mode. */
  editing: WindMitigationReportRecord | null;
}

/** Wind-mitigation forms are generally accepted ~5 years from inspection. */
function defaultExpiryFor(inspectedAt: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectedAt)) return '';
  const [year, month, day] = inspectedAt.split('-').map(Number);
  if (!year || !month || !day) return '';
  const expiry = new Date(Date.UTC(year + 5, month - 1, day));
  return expiry.toISOString().slice(0, 10);
}

/**
 * Add/edit dialog for a wind-mitigation report.
 *
 * The document picker lists the community's existing library documents rather
 * than embedding an uploader: boards upload the inspection PDF through the
 * normal document flow (which already handles storage paths, versioning, and
 * audit), then point a locker record at it. One concept, one upload path.
 */
export function WindMitigationFormDialog({
  communityId,
  open,
  onOpenChange,
  editing,
}: WindMitigationFormDialogProps) {
  const isEdit = editing !== null;
  const { data: documents, isLoading: documentsLoading } = useDocuments({
    communityId,
    enabled: open,
  });
  const createReport = useCreateWindMitigationReport(communityId);
  const updateReport = useUpdateWindMitigationReport(communityId);

  const [documentId, setDocumentId] = React.useState('');
  const [formType, setFormType] = React.useState<WindMitigationFormType>('oir_b1_1802');
  const [formVersion, setFormVersion] = React.useState<WindMitigationFormVersion>('2026_04');
  const [buildingLabel, setBuildingLabel] = React.useState('');
  const [inspectedAt, setInspectedAt] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState('');
  const [inspectorName, setInspectorName] = React.useState('');
  const [inspectorLicense, setInspectorLicense] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Reset the form whenever the dialog opens, so a create never inherits the
  // previously-edited record's values.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setDocumentId(editing ? String(editing.documentId) : '');
    setFormType(editing?.formType ?? 'oir_b1_1802');
    setFormVersion(editing?.formVersion ?? '2026_04');
    setBuildingLabel(editing?.buildingLabel ?? '');
    setInspectedAt(editing?.inspectedAt ?? '');
    setExpiresAt(editing?.expiresAt ?? '');
    setInspectorName(editing?.inspectorName ?? '');
    setInspectorLicense(editing?.inspectorLicense ?? '');
    setNotes(editing?.notes ?? '');
  }, [open, editing]);

  // Auto-fill the 5-year expiry as soon as an inspection date is entered, but
  // never overwrite a value the board typed themselves.
  const handleInspectedAtChange = (value: string) => {
    setInspectedAt(value);
    if (!expiresAt || expiresAt === defaultExpiryFor(inspectedAt)) {
      setExpiresAt(defaultExpiryFor(value));
    }
  };

  const isPending = createReport.isPending || updateReport.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!documentId) {
      setError('Choose the uploaded inspection report.');
      return;
    }
    if (!inspectedAt || !expiresAt) {
      setError('Enter both the inspection date and the expiry date.');
      return;
    }
    if (expiresAt <= inspectedAt) {
      setError('The expiry date must be after the inspection date.');
      return;
    }

    const payload = {
      documentId: Number(documentId),
      formType,
      formVersion,
      buildingLabel: buildingLabel.trim() || null,
      inspectedAt,
      expiresAt,
      inspectorName: inspectorName.trim() || null,
      inspectorLicense: inspectorLicense.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit) {
        await updateReport.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createReport.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t save this report. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit wind-mitigation report' : 'Add wind-mitigation report'}</DialogTitle>
          <DialogDescription>
            Point this record at the inspection PDF you uploaded to your document library. Owners
            can then download it and share it with their own insurer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <AlertBanner status="danger" title={error} />}

          <div className="space-y-2">
            <Label htmlFor="wm-document">Inspection report *</Label>
            <Select value={documentId} onValueChange={setDocumentId}>
              <SelectTrigger id="wm-document">
                <SelectValue
                  placeholder={documentsLoading ? 'Loading documents…' : 'Choose an uploaded document'}
                />
              </SelectTrigger>
              <SelectContent>
                {(documents ?? []).map((doc) => (
                  <SelectItem key={doc.id} value={String(doc.id)}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!documentsLoading && (documents ?? []).length === 0 && (
              <p className="text-sm text-content-tertiary">
                No documents yet — upload the inspection PDF to your document library first.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wm-form-type">Form *</Label>
            <Select value={formType} onValueChange={(v) => setFormType(v as WindMitigationFormType)}>
              <SelectTrigger id="wm-form-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WIND_MITIGATION_FORM_LABELS) as WindMitigationFormType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {WIND_MITIGATION_FORM_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The rule that decides which form a building needs, at the point
                of choosing — not buried in a help article. */}
            <p className="text-sm text-content-tertiary">{WIND_MITIGATION_FORM_FAMILY_HINT}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wm-form-version">Form revision *</Label>
            <Select
              value={formVersion}
              onValueChange={(v) => setFormVersion(v as WindMitigationFormVersion)}
            >
              <SelectTrigger id="wm-form-version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WIND_MITIGATION_VERSION_LABELS) as WindMitigationFormVersion[]).map(
                  (key) => (
                    <SelectItem key={key} value={key}>
                      {WIND_MITIGATION_VERSION_LABELS[key]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wm-inspected-at">Inspection date *</Label>
              <Input
                id="wm-inspected-at"
                type="date"
                value={inspectedAt}
                onChange={(e) => handleInspectedAtChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wm-expires-at">Valid until *</Label>
              <Input
                id="wm-expires-at"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                required
              />
            </div>
          </div>
          <p className="text-sm text-content-tertiary">{WIND_MITIGATION_EXPIRY_HINT}</p>

          <div className="space-y-2">
            <Label htmlFor="wm-building">Building (optional)</Label>
            <Input
              id="wm-building"
              value={buildingLabel}
              onChange={(e) => setBuildingLabel(e.target.value)}
              placeholder="e.g. Tower B"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wm-inspector">Inspector (optional)</Label>
              <Input
                id="wm-inspector"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wm-license">License number (optional)</Label>
              <Input
                id="wm-license"
                value={inspectorLicense}
                onChange={(e) => setInspectorLicense(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wm-notes">Notes for owners (optional)</Label>
            <Textarea
              id="wm-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
