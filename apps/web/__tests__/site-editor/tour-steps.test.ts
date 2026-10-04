import { describe, expect, it } from 'vitest';
import { placeCard, tourSteps } from '../../src/components/pm/site-editor-v3/guidance/tour-steps';

const VIEW = { width: 1440, height: 900 };

describe('tourSteps', () => {
  it('describes this editor, not the design mock-up', () => {
    for (const mode of ['guided', 'free'] as const) {
      for (const step of tourSteps(mode, true)) {
        expect(`${step.title} ${step.body}`).not.toMatch(
          /just type|nothing is live|before anything goes live|\$50|fine/i,
        );
      }
    }
  });

  it('mentions Florida only where the rules apply', () => {
    expect(tourSteps('guided', true).some((s) => /Florida/.test(s.body))).toBe(true);
    expect(tourSteps('guided', false).some((s) => /Florida/.test(s.body))).toBe(false);
  });
});

describe('placeCard', () => {
  it('puts the card beside a tall, narrow element such as the rail', () => {
    expect(placeCard({ top: 60, left: 0, width: 84, height: 840 }, VIEW, 200)).toEqual({
      top: 76,
      left: 100,
    });
  });

  it('puts it below a button, right edges lined up and on screen', () => {
    expect(placeCard({ top: 12, left: 1330, width: 96, height: 36 }, VIEW, 200)).toEqual({
      top: 64,
      left: 1084,
    });
  });

  it('puts it inside the page when nothing beside it has room', () => {
    expect(placeCard({ top: 60, left: 84, width: 1356, height: 840 }, VIEW, 200)).toEqual({
      top: 124,
      left: 592,
    });
  });

  it('keeps it on screen at the bottom edge', () => {
    expect(placeCard({ top: 880, left: 0, width: 84, height: 300 }, VIEW, 200).top).toBe(684);
  });
});
