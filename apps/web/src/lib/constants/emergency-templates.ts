/**
 * Pre-built emergency broadcast templates.
 *
 * Static definitions — no database needed. Templates use bracket placeholders
 * like [Community] that the broadcast composer pre-fills before sending.
 *
 * SMS bodies are optimized for single-part messages (≤160 chars).
 * Multi-part SMS costs more and may be split unpredictably by carriers.
 */

export type EmergencySeverity = 'emergency' | 'urgent' | 'info';

export interface EmergencyTemplate {
  readonly key: string;
  readonly label: string;
  readonly severity: EmergencySeverity;
  readonly title: string;
  readonly body: string;
  readonly smsBody: string;
}

export const EMERGENCY_TEMPLATES: readonly EmergencyTemplate[] = [
  {
    key: 'hurricane_prep',
    label: 'Hurricane Preparation',
    severity: 'emergency',
    title: 'Hurricane Warning: [Community]',
    body: 'A hurricane warning has been issued for our area. Please take the following steps immediately:\n\n• Secure all loose outdoor items (patio furniture, plants, decorations)\n• Stock emergency supplies (water, non-perishable food, flashlights, batteries)\n• Follow local evacuation orders if issued\n• Board up windows if applicable\n• Charge all electronic devices\n\nStay tuned for further updates from your community management team.',
    smsBody:
      'EMERGENCY: Hurricane warning for [Community]. Secure loose items, stock supplies, follow evacuation orders. Details via email.',
  },
  {
    key: 'water_shutoff',
    label: 'Water Shutoff',
    severity: 'urgent',
    title: 'Planned Water Shutoff: [Community]',
    body: 'A planned water shutoff will occur at [Community] on [date] from [time] to [time].\n\nPlease store water in advance for drinking, cooking, and sanitary needs. The shutoff is necessary for [reason].\n\nWe apologize for the inconvenience and will notify you when service is restored.',
    smsBody:
      'NOTICE: Water shutoff at [Community] on [date] from [time]-[time]. Store water in advance.',
  },
  {
    key: 'gas_leak',
    label: 'Gas Leak',
    severity: 'emergency',
    title: 'Gas Leak Emergency: [Community]',
    body: 'A gas leak has been reported at [Community]. For your safety:\n\n• Evacuate the building immediately\n• Do NOT use elevators — use stairs only\n• Do NOT use light switches, phones, or any electrical devices near the leak\n• Move to a safe distance from the building\n• Call 911 if you have not already done so\n• Do NOT re-enter the building until cleared by fire department\n\nEmergency services have been notified.',
    smsBody:
      'EMERGENCY: Gas leak at [Community]. Evacuate now via stairs. Do NOT use elevators or electrical devices. Call 911.',
  },
  {
    key: 'evacuation',
    label: 'Evacuation Order',
    severity: 'emergency',
    title: 'Evacuation Order: [Community]',
    body: 'An evacuation order has been issued for [Community]. Please evacuate immediately.\n\n• Follow posted evacuation routes\n• Do NOT use elevators — use stairs only\n• Take essential items only (ID, medications, phone, keys)\n• Assist neighbors who may need help\n• Proceed to the designated assembly point\n\nDo NOT re-enter the building until the all-clear is given by authorities.',
    smsBody:
      'EMERGENCY: Evacuate [Community] immediately. Use stairs, follow posted routes. Do NOT use elevators.',
  },
  {
    key: 'elevator_outage',
    label: 'Elevator Outage',
    severity: 'info',
    title: 'Elevator Outage: [Community]',
    body: 'Elevator [#] at [Community] is currently out of service. Please use the stairs until further notice.\n\nOur maintenance team is working to resolve the issue. We estimate service will be restored by [time].\n\nIf you require assistance due to mobility issues, please contact the management office.',
    smsBody:
      'NOTICE: Elevator at [Community] is out of service. Use stairs. Estimated fix: [time].',
  },
  {
    key: 'fire_alarm',
    label: 'Fire Alarm',
    severity: 'emergency',
    title: 'Fire Alarm: [Community]',
    body: 'A fire alarm has been activated at [Community]. Please evacuate immediately.\n\n• Use stairs only — do NOT use elevators\n• Close doors behind you as you exit\n• Proceed to the designated assembly point\n• Call 911 if you see fire or smoke\n• Do NOT re-enter the building until fire department gives the all-clear\n\nIf you are unable to evacuate, go to the nearest stairwell and wait for assistance.',
    smsBody:
      'EMERGENCY: Fire alarm at [Community]. Evacuate via stairs. Do NOT use elevators. Call 911 if needed.',
  },
  {
    key: 'power_outage',
    label: 'Power Outage',
    severity: 'urgent',
    title: 'Power Outage: [Community]',
    body: 'A power outage is affecting [Community]. Emergency lighting has been activated.\n\n• Estimated restoration time: [time]\n• Emergency lighting is active in common areas\n• Avoid opening refrigerators/freezers to preserve food\n• Use flashlights instead of candles for safety\n\nWe are in contact with the utility company and will update you when power is restored.',
    smsBody:
      'NOTICE: Power outage at [Community]. Estimated restoration: [time]. Emergency lighting active.',
  },
  {
    key: 'security_alert',
    label: 'Security Alert',
    severity: 'urgent',
    title: 'Security Alert: [Community]',
    body: 'A security concern has been reported at [Community].\n\n• Stay in your unit and lock your doors\n• Do not approach any suspicious individuals\n• Report any suspicious activity to building security or call 911\n\nSecurity personnel are responding. We will provide an update when the situation is resolved.',
    smsBody:
      'ALERT: Security concern at [Community]. Stay in your unit, lock doors. Details sent via email.',
  },
] as const;

/** Lookup a template by key. Returns undefined if not found. */
export function getEmergencyTemplate(key: string): EmergencyTemplate | undefined {
  return EMERGENCY_TEMPLATES.find((t) => t.key === key);
}

/** All available template keys. */
export const EMERGENCY_TEMPLATE_KEYS = EMERGENCY_TEMPLATES.map((t) => t.key);

/**
 * Replace bracket placeholders in a template string.
 *
 * @example
 *   fillTemplatePlaceholders('EMERGENCY at [Community]', { Community: 'Sunset Condos' })
 *   // → 'EMERGENCY at Sunset Condos'
 */
export function fillTemplatePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`[${key}]`, value),
    template,
  );
}
