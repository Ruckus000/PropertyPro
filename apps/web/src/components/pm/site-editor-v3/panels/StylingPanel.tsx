'use client';

/**
 * The "Colours" tool panel — per-community overrides for the three brand
 * colours and the body font.
 *
 * ## These writes are live-immediate, and the copy says so
 *
 * Same as the Site panel: this lands in `communities.branding`, which sits
 * outside the draft layer that Publish promotes. A save is public on the next
 * request, so the button says so rather than leaving a manager to discover it.
 *
 * ## Why the pickers start on the community's CURRENT colours
 *
 * The legacy form seeded its pickers from three hard-coded hex constants that
 * had drifted from the product default (tech-blue, against a coral brand), so
 * flipping a toggle on jumped the swatch to a colour the site had never used.
 * Seeding from the RESOLVED theme instead means turning an override on starts
 * from exactly what is on the site today — the change a manager makes is the
 * one they intended, not that plus an invisible reset.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { isValidHexColor, type CustomCssOverrides } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { PlanBadge } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useCustomCssOverrides, useSaveCustomCss } from '@/hooks/use-custom-css';

/**
 * A worked example for the hex field's error copy. This literal is CONTENT —
 * the thing this panel does is enter a hex value — not a colour anything is
 * rendered in.
 */
const HEX_EXAMPLE = '#C2533A'; // design-tokens:exempt — example value quoted in copy

/** The subset of the resolved theme this panel needs to seed its controls. */
export interface StylingPanelTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bodyFont: string;
}

export interface StylingPanelProps {
  communityId: number;
  /** Pro+ gate. When false the panel is visible-but-locked (upsell). */
  hasSiteCustomCss: boolean;
  /** Stored overrides, from the branding row the page already reads. */
  initial: CustomCssOverrides | null;
  /** What the site renders today, override or not. Seeds every control. */
  theme: StylingPanelTheme;
}

/** One colour row: a Switch, and when on, a swatch + hex field. */
function ColorField({
  id,
  label,
  hint,
  on,
  onToggle,
  value,
  onValueChange,
  locked,
  saving,
}: {
  id: string;
  label: string;
  hint: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  value: string;
  onValueChange: (next: string) => void;
  locked: boolean;
  saving: boolean;
}) {
  const invalid = on && !isValidHexColor(value);
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={`${id}-toggle`}>{label}</Label>
          <p className="text-sm text-content-tertiary">{hint}</p>
        </div>
        <Switch
          id={`${id}-toggle`}
          checked={on}
          disabled={locked}
          onCheckedChange={onToggle}
        />
      </div>
      {on ? (
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label={`${label} picker`}
            // A native colour input rejects anything that isn't a valid hex and
            // silently falls back to black anyway; passing it explicitly keeps
            // React from warning about a controlled value it can't apply. The
            // hex field beside it still shows what was actually typed.
            value={isValidHexColor(value) ? value : '#000000'} // design-tokens:exempt — <input type="color"> fallback, not a rendered colour
            disabled={locked || saving}
            onChange={(e) => onValueChange(e.target.value)}
            className="h-9 w-16 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-edge p-0.5 disabled:opacity-50"
          />
          <Input
            aria-label={`${label} value`}
            value={value}
            disabled={locked || saving}
            maxLength={7}
            spellCheck={false}
            aria-invalid={invalid}
            onChange={(e) => onValueChange(e.target.value)}
            className="w-32 font-mono"
          />
        </div>
      ) : null}
      {invalid ? (
        <p className="text-sm text-status-danger">
          Use a six-digit hex colour, like {HEX_EXAMPLE}.
        </p>
      ) : null}
    </div>
  );
}

export function StylingPanel({
  communityId,
  hasSiteCustomCss,
  initial,
  theme,
}: StylingPanelProps) {
  const save = useSaveCustomCss();

  // NOT the `initial` prop directly. Switching tool tabs unmounts this panel,
  // and `initial` is fixed for the life of the page — so seeding `useState`
  // from it would show pre-save values on every remount, and the next Save
  // would post `null` over the override just persisted. The cache is written
  // by `useSaveCustomCss`, so a remount seeds from the last save.
  const { data: stored } = useCustomCssOverrides(communityId, initial);

  const [primaryOn, setPrimaryOn] = useState(stored?.primaryColor != null);
  const [secondaryOn, setSecondaryOn] = useState(stored?.secondaryColor != null);
  const [accentOn, setAccentOn] = useState(stored?.accentColor != null);
  const [bodyFontOn, setBodyFontOn] = useState(stored?.bodyFont != null);

  // Seeded from the override when there is one, otherwise from what the site
  // currently renders — see the header note.
  const [primaryColor, setPrimaryColor] = useState(
    stored?.primaryColor ?? theme.primaryColor,
  );
  const [secondaryColor, setSecondaryColor] = useState(
    stored?.secondaryColor ?? theme.secondaryColor,
  );
  const [accentColor, setAccentColor] = useState(stored?.accentColor ?? theme.accentColor);
  const [bodyFont, setBodyFont] = useState(stored?.bodyFont ?? theme.bodyFont);

  const [error, setError] = useState<string | null>(null);

  const hasInvalidColor =
    (primaryOn && !isValidHexColor(primaryColor)) ||
    (secondaryOn && !isValidHexColor(secondaryColor)) ||
    (accentOn && !isValidHexColor(accentColor));

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      if (hasInvalidColor) {
        setError('One of these colours is not a valid hex value.');
        return;
      }

      const overrides: CustomCssOverrides = {
        ...(primaryOn ? { primaryColor } : {}),
        ...(secondaryOn ? { secondaryColor } : {}),
        ...(accentOn ? { accentColor } : {}),
        ...(bodyFontOn ? { bodyFont } : {}),
      };

      save.mutate(
        {
          communityId,
          // Every switch off means "use the preset again", which the route
          // reads as null rather than an empty object.
          customCssOverrides: Object.keys(overrides).length > 0 ? overrides : null,
        },
        {
          onSuccess: () => toast.success('Colours saved. Your website is updated.'),
          onError: (err) => setError(err.message),
        },
      );
    },
    [
      hasInvalidColor,
      save,
      communityId,
      primaryOn,
      primaryColor,
      secondaryOn,
      secondaryColor,
      accentOn,
      accentColor,
      bodyFontOn,
      bodyFont,
    ],
  );

  const locked = !hasSiteCustomCss;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="tool-panel-styling">
      {locked ? (
        <AlertBanner
          status="info"
          variant="subtle"
          data-testid="styling-upsell"
          title={
            <span className="inline-flex items-center gap-2">
              Choosing your own colours
              <PlanBadge variant="pro" />
            </span>
          }
          description="Your plan uses the colours from your selected preset. Upgrade to Professional to set your own brand colours and body font."
        />
      ) : (
        <p className="text-sm text-content-secondary">
          These replace the colours from your selected preset. Leave a switch off to keep the
          preset&rsquo;s colour.
        </p>
      )}

      {error ? <AlertBanner status="danger" title={error} /> : null}

      <ColorField
        id="styling-primary"
        label="Use my own main colour"
        hint="Buttons, links, and headings on your public website."
        on={primaryOn}
        onToggle={setPrimaryOn}
        value={primaryColor}
        onValueChange={setPrimaryColor}
        locked={locked}
        saving={save.isPending}
      />
      <ColorField
        id="styling-secondary"
        label="Use my own secondary colour"
        hint="Supporting text and quieter details."
        on={secondaryOn}
        onToggle={setSecondaryOn}
        value={secondaryColor}
        onValueChange={setSecondaryColor}
        locked={locked}
        saving={save.isPending}
      />
      <ColorField
        id="styling-accent"
        label="Use my own accent colour"
        hint="Section backgrounds and highlights behind your content."
        on={accentOn}
        onToggle={setAccentOn}
        value={accentColor}
        onValueChange={setAccentColor}
        locked={locked}
        saving={save.isPending}
      />

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="styling-font-toggle">Use my own body font</Label>
            <p className="text-sm text-content-tertiary">
              The typeface for paragraphs and lists.
            </p>
          </div>
          <Switch
            id="styling-font-toggle"
            checked={bodyFontOn}
            disabled={locked}
            onCheckedChange={setBodyFontOn}
          />
        </div>
        {bodyFontOn ? (
          <Select
            value={bodyFont}
            disabled={locked || save.isPending}
            onValueChange={setBodyFont}
          >
            <SelectTrigger aria-label="Body font value">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALLOWED_FONTS.map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-edge pt-4">
        <Button type="submit" disabled={locked || save.isPending || hasInvalidColor}>
          {save.isPending ? 'Saving…' : 'Save colours'}
        </Button>
        <p className="text-sm text-content-tertiary">
          These go live on your website right away — they aren&apos;t part of Publish.
        </p>
      </div>
    </form>
  );
}
