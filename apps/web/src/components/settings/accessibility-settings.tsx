'use client';

import { useLargeText } from '@/hooks/use-large-text';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsCard, SettingsRow } from '@/components/settings/settings-layout';

/** Display → Large text. On by default; the choice is saved per browser. */
export function AccessibilitySettings() {
  const { largeText, setLargeText } = useLargeText();

  return (
    <SettingsCard>
      <SettingsRow
        inlineControl
        label={
          <Label htmlFor="large-text" className="text-base">
            Large text
          </Label>
        }
        description="Bigger text throughout PropertyPro for easier reading. On by default; turn it off to fit more on screen. Saved for this browser only."
        control={<Switch id="large-text" checked={largeText} onCheckedChange={setLargeText} />}
      />
    </SettingsCard>
  );
}
