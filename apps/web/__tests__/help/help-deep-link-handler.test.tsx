import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpDeepLinkHandler } from '../../src/components/help/help-deep-link-handler';
import {
  HelpWidgetProvider,
  useHelpWidget,
} from '../../src/components/help/help-widget-provider';

const routerReplaceMock = vi.fn();
const useSearchParamsMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  useSearchParams: () => useSearchParamsMock(),
  usePathname: () => usePathnameMock(),
}));

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

function Probe() {
  const { selectedArticle, close } = useHelpWidget();
  return (
    <div>
      <span data-testid="selected">
        {selectedArticle ? `${selectedArticle.category}/${selectedArticle.slug}` : 'null'}
      </span>
      <button data-testid="close-btn" onClick={close}>close</button>
    </div>
  );
}

describe('<HelpDeepLinkHandler/>', () => {
  beforeEach(() => {
    routerReplaceMock.mockClear();
    usePathnameMock.mockReturnValue('/dashboard');
  });

  it('opens an article when ?help=cat/slug is present', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('help=getting-started/welcome'));
    const { getByTestId } = render(
      <HelpWidgetProvider>
        <HelpDeepLinkHandler />
        <Probe />
      </HelpWidgetProvider>,
    );
    expect(getByTestId('selected')).toHaveTextContent('getting-started/welcome');
  });

  it('ignores invalid help params', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('help=../etc/passwd'));
    const { getByTestId } = render(
      <HelpWidgetProvider>
        <HelpDeepLinkHandler />
        <Probe />
      </HelpWidgetProvider>,
    );
    expect(getByTestId('selected')).toHaveTextContent('null');
  });

  it('strips ?help= from the URL when the modal closes', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('help=getting-started/welcome&communityId=1'));
    const { getByTestId } = render(
      <HelpWidgetProvider>
        <HelpDeepLinkHandler />
        <Probe />
      </HelpWidgetProvider>,
    );
    act(() => {
      getByTestId('close-btn').click();
    });
    expect(routerReplaceMock).toHaveBeenCalledWith('/dashboard?communityId=1', { scroll: false });
  });

  it('does not call router.replace when ?help= is not present', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('communityId=1'));
    const { getByTestId } = render(
      <HelpWidgetProvider>
        <HelpDeepLinkHandler />
        <Probe />
      </HelpWidgetProvider>,
    );
    act(() => {
      getByTestId('close-btn').click();
    });
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});
