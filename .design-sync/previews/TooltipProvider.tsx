import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Button,
} from '@propertypro/design-system';

export const ToolbarWithSharedProvider = () => (
  <TooltipProvider delayDuration={150} skipDelayDuration={300}>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Meeting notice builder</h1>
      <p className="mt-1 text-sm text-content-secondary">
        One provider wraps the whole toolbar, so hovering between controls skips the open delay.
      </p>
      <div className="mt-6 flex items-center gap-2 rounded-md border border-edge bg-surface-card p-4">
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">Insert agenda</Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Pulls the adopted agenda items</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm">Insert certificate of mailing</Button>
        <Button variant="outline" size="sm">Attach budget</Button>
        <Button size="sm" className="ml-auto">Post notice</Button>
      </div>
      <div className="mt-6 rounded-md border border-edge bg-surface-card p-4">
        <p className="text-sm text-content">
          NOTICE IS HEREBY GIVEN that the Board of Directors of Sunset Condominium Association, Inc.
          will meet on 18 September 2026 at 6:30 PM in the clubhouse.
        </p>
      </div>
    </div>
  </TooltipProvider>
);

export const ProviderAroundAPage = () => (
  <TooltipProvider delayDuration={0}>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Transparency settings</h1>
      <p className="mt-1 text-sm text-content-secondary">
        What the public-facing association website shows to non-residents.
      </p>
      <div className="mt-6 space-y-3">
        {[
          ['Governing documents', 'Visible to the public'],
          ['Meeting notices and agendas', 'Visible to the public'],
          ['Financial reports', 'Residents only'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-3">
            <span className="text-sm text-content">{label}</span>
            <span className="text-xs text-content-tertiary">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline">Preview public site</Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            Opens the association website exactly as an unauthenticated visitor sees it.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  </TooltipProvider>
);
