import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Label,
  Button,
} from '@propertypro/design-system';
import { FileText } from 'lucide-react';

const documents = [
  ['Declaration of Condominium', 'Governing Documents · posted 4 Mar 2026'],
  ['Structural Integrity Reserve Study', 'Reserves · posted 22 Jan 2026'],
  ['Q2 2026 Board Meeting Minutes', 'Meetings · posted 12 Jul 2026'],
];

export const DocumentFilterBar = () => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-5 py-4">
      <p className="text-sm font-semibold text-content">Association documents</p>
      <p className="mt-1 text-xs text-content-secondary">
        Sunset Condos · 42 records posted under §718.111(12)(g)
      </p>
    </div>
    <div className="grid grid-cols-2 gap-4 border-b border-edge px-5 py-4">
      <div className="space-y-2">
        <Label htmlFor="tr-category">Category</Label>
        <Select defaultValue="governing">
          <SelectTrigger id="tr-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="governing">Governing documents</SelectItem>
            <SelectItem value="financial">Financial reports</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-window">Posting window</Label>
        <Select open defaultValue="30">
          <SelectTrigger id="tr-window">
            <SelectValue placeholder="Any time" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Statutory window</SelectLabel>
              <SelectItem value="30">Posted within 30 days</SelectItem>
              <SelectItem value="late">Posted late</SelectItem>
              <SelectItem value="missing">Never posted</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
    <ul className="divide-y divide-edge-subtle">
      {documents.map(([name, meta]) => (
        <li key={name} className="flex items-center gap-3 px-5 py-3">
          <FileText className="size-4 shrink-0 text-content-disabled" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-content">{name}</p>
            <p className="text-xs text-content-tertiary">{meta}</p>
          </div>
          <Button size="sm" variant="ghost">
            View
          </Button>
        </li>
      ))}
    </ul>
  </div>
);

export const TriggerWidths = () => (
  <div className="w-full max-w-[560px] space-y-5 rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="space-y-2">
      <Label htmlFor="tr-full">Full width — Fiscal year</Label>
      <Select defaultValue="2026">
        <SelectTrigger id="tr-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="2026">FY 2026</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label htmlFor="tr-narrow">Constrained — Digest cadence</Label>
      <Select defaultValue="weekly">
        <SelectTrigger id="tr-narrow" className="max-w-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="weekly">Weekly</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label htmlFor="tr-placeholder">Placeholder — Assigned vendor</Label>
      <Select>
        <SelectTrigger id="tr-placeholder">
          <SelectValue placeholder="Search approved vendors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="acme">Acme Elevator Co.</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label htmlFor="tr-disabled" className="text-content-disabled">
        Disabled — Subscription plan
      </Label>
      <Select disabled defaultValue="essentials">
        <SelectTrigger id="tr-disabled">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="essentials">Essentials</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
);
