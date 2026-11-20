import { describe, expect, it } from 'vitest';
import { chosenLookId } from '@/lib/site-looks/chosen-look';

const design = (live: string, draft?: string) =>
  ({ live: { layoutId: live }, draft: draft ? { layoutId: draft } : {} }) as never;

describe('chosenLookId', () => {
  it('is the live look when nothing is drafted', () => {
    expect(chosenLookId(design('bayfront'))).toBe('bayfront');
  });
  it('is the drafted look when a different layout is drafted', () => {
    expect(chosenLookId(design('bayfront', 'heritage'))).toBe('heritage');
  });
  it('is null for a legacy live layout', () => {
    expect(chosenLookId(design('tidewater'))).toBeNull();
  });
  it('is the drafted look over a legacy live layout', () => {
    expect(chosenLookId(design('tidewater', 'palm-grove'))).toBe('palm-grove');
  });
});
