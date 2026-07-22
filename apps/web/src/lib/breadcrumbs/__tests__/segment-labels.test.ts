import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, PM_NAV_ITEMS } from '@/components/layout/nav-config';
import {
  SEGMENT_LABELS,
  NAV_LABEL_BY_ID,
  __NAV_LINKED_SEGMENTS as NAV_LINKED_SEGMENTS,
  humanize,
} from '../segment-labels';

describe('segment-labels drift guard', () => {
  it('every nav-linked segment points at a real nav item id', () => {
    // If a nav item is renamed/removed in nav-config, this fails so the routing
    // map is updated — the labels themselves are derived, so they never drift.
    for (const [segment, navId] of Object.entries(NAV_LINKED_SEGMENTS)) {
      expect(NAV_LABEL_BY_ID.has(navId), `segment "${segment}" → unknown nav id "${navId}"`).toBe(
        true,
      );
    }
  });

  it('nav-linked segment labels are the live nav-config labels (single source)', () => {
    const navLabelById = new Map(
      [...NAV_ITEMS, ...PM_NAV_ITEMS].map((i) => [i.id, i.label] as const),
    );
    for (const [segment, navId] of Object.entries(NAV_LINKED_SEGMENTS)) {
      expect(SEGMENT_LABELS[segment]).toBe(navLabelById.get(navId));
    }
  });

  it('resolves the labels the trail actually depends on', () => {
    expect(SEGMENT_LABELS.announcements).toBe('Announcements');
    expect(SEGMENT_LABELS.esign).toBe('E-Sign');
    expect(SEGMENT_LABELS.violations).toBe('Violations'); // from violations-inbox
    expect(SEGMENT_LABELS.communities).toBe('Communities'); // PM portfolio list
    expect(SEGMENT_LABELS['wind-mitigation']).toBe('Wind Mitigation'); // sub-segment
  });

  it('humanize turns a dashed segment into a title-cased label', () => {
    expect(humanize('wind-mitigation')).toBe('Wind Mitigation');
    expect(humanize('move-in-out')).toBe('Move In Out');
  });
});
