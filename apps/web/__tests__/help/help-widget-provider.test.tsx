import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom doesn't implement window.matchMedia — stub it so the keyboard-shortcut
// useEffect in HelpWidgetProvider doesn't throw.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});
import {
  HelpWidgetProvider,
  useHelpWidget,
} from '../../src/components/help/help-widget-provider';

function Probe() {
  const { isOpen, selectedArticle, openArticle, close } = useHelpWidget();
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="selected">
        {selectedArticle ? `${selectedArticle.category}/${selectedArticle.slug}` : 'null'}
      </span>
      <button onClick={() => openArticle('compliance', 'fixing-gaps')}>open</button>
      <button onClick={close}>close</button>
    </div>
  );
}

describe('HelpWidgetProvider — selectedArticle', () => {
  it('defaults selectedArticle to null and isOpen to false', () => {
    render(
      <HelpWidgetProvider>
        <Probe />
      </HelpWidgetProvider>,
    );
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(screen.getByTestId('selected')).toHaveTextContent('null');
  });

  it('openArticle sets selectedArticle and opens the widget', () => {
    render(
      <HelpWidgetProvider>
        <Probe />
      </HelpWidgetProvider>,
    );
    act(() => {
      screen.getByText('open').click();
    });
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('selected')).toHaveTextContent('compliance/fixing-gaps');
  });

  it('close clears selectedArticle and closes the widget', () => {
    render(
      <HelpWidgetProvider>
        <Probe />
      </HelpWidgetProvider>,
    );
    act(() => {
      screen.getByText('open').click();
    });
    act(() => {
      screen.getByText('close').click();
    });
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(screen.getByTestId('selected')).toHaveTextContent('null');
  });
});
