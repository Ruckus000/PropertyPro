import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Button,
  ShadcnBadge,
} from '@propertypro/design-system';

export const TruncatedRecordName = () => (
  <TooltipProvider>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Official records</h1>
      <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; posted within the 30-day window</p>
      <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <span className="text-sm text-content">2026 adopted budget</span>
          <span className="text-xs text-content-tertiary">Posted 04 Dec 2025</span>
        </div>
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <Tooltip open>
            <TooltipTrigger asChild>
              <button type="button" className="max-w-sm truncate text-left text-sm text-content">
                Structural Integrity Reserve Study &mdash; Tower B envelope and balcony assessment (2026 update)
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              Structural Integrity Reserve Study &mdash; Tower B envelope and balcony assessment (2026 update)
            </TooltipContent>
          </Tooltip>
          <span className="text-xs text-content-tertiary">Posted 21 Aug 2026</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-content">Board meeting minutes &mdash; 21 Aug</span>
          <span className="text-xs text-content-tertiary">Posted 24 Aug 2026</span>
        </div>
      </div>
    </div>
  </TooltipProvider>
);

export const DisabledActionExplained = () => (
  <TooltipProvider>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Election &mdash; 2026 board seats</h1>
      <p className="mt-1 text-sm text-content-secondary">Ballots close 14 November 2026 at 6:00 PM</p>
      <div className="mt-6 rounded-md border border-edge bg-surface-card p-4">
        <div className="flex items-center gap-3">
          <ShadcnBadge variant="secondary">Quorum 41% of 148 units</ShadcnBadge>
          <span className="text-sm text-content-secondary">A quorum of 50% is required to certify.</span>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Tooltip open>
            <TooltipTrigger asChild>
              <span>
                <Button disabled>Certify results</Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              Results cannot be certified until quorum is met and the ballot window has closed.
            </TooltipContent>
          </Tooltip>
          <Button variant="outline">Send voting reminder</Button>
        </div>
      </div>
    </div>
  </TooltipProvider>
);
