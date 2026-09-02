import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Button,
} from '@propertypro/design-system';

export const IconButtonTrigger = () => (
  <TooltipProvider>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Violations</h1>
      <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; row actions</p>
      <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <span className="text-sm text-content">V-2026-0148 &middot; Unit 4B &middot; Balcony storage</span>
          <div className="flex items-center gap-2">
            <Tooltip open>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Send 14-day hearing notice">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 5h16v14H4z" />
                    <path d="m4 6 8 6 8-6" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Send 14-day hearing notice</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon" aria-label="Archive violation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 6h18v4H3z" />
                <path d="M5 10v9h14v-9" />
              </svg>
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-content">V-2026-0151 &middot; Unit 11A &middot; Unregistered vehicle</span>
          <span className="text-xs text-content-tertiary">Notice sent</span>
        </div>
      </div>
    </div>
  </TooltipProvider>
);

export const TextTrigger = () => (
  <TooltipProvider>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Reserve funding</h1>
      <p className="mt-1 text-sm text-content-secondary">Palm Shores HOA &middot; 2026 study</p>
      <div className="mt-6 rounded-md border border-edge bg-surface-card p-4">
        <div className="flex items-center justify-between">
          <Tooltip open>
            <TooltipTrigger asChild>
              <button type="button" className="text-sm font-medium text-content underline">
                Percent funded
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              The ratio of reserves on hand to the fully funded balance recommended by the study.
            </TooltipContent>
          </Tooltip>
          <span className="tabular-nums text-lg font-semibold text-content">61%</span>
        </div>
      </div>
    </div>
  </TooltipProvider>
);
