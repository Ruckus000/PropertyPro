import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Step, StepByStep } from '@/components/help/mdx-components';

describe('StepByStep', () => {
  it('renders visible 1-based step numbers and listitem roles', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="Open the gaps panel">From the score card.</Step>
        <Step title="Sort by deadline">Urgent bucket first.</Step>
      </StepByStep>,
    );
    expect(out).toContain('role="list"');
    expect((out.match(/role="listitem"/g) ?? []).length).toBe(2);
    expect(out).toContain('>1<');
    expect(out).toContain('>2<');
  });

  it('uses an existing rail class and hides the rail on the last step', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="One">a</Step>
        <Step title="Two">b</Step>
      </StepByStep>,
    );
    expect(out).not.toContain('bg-border-default');
    expect(out).toContain('bg-edge');
  });

  it('renders a step image through MediaFrame markup', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="One" image="/help/c/s/step-1.webp" imageAlt="Step one">a</Step>
      </StepByStep>,
    );
    expect(out).toContain('data-media-frame');
    expect(out).toContain('data-zoomable');
    expect(out).toContain('src="/help/c/s/step-1.webp"');
  });
});
