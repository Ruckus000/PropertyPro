"use client";

/**
 * PageLayout — the page frame: banner, header, tabs, then a grid of
 * summary aside, main column, and more-about aside. DOM order is always
 * reading order; placement on wide boxes is by grid lines only, never by
 * `order-*`. The switch to two columns follows the page's own box width
 * (`cq-lg`, or `cq-xl` for table pages that need the room).
 */
import * as React from "react";
import { cn } from "../../utils/cn";
import {
  isPanelWorthDrawing,
  PanelRegions,
  panelRegions,
  type SidePanelProps,
} from "./side-panel";

export type PageTemplate = "list" | "detail" | "form" | "settings" | "canvas" | "focus";

export interface PageLayoutProps {
  template: PageTemplate;
  /** Default 'rows'. */
  records?: "rows" | "table" | "cards";
  header: React.ReactNode;
  banner?: React.ReactNode;
  tabs?: React.ReactNode;
  panel?: SidePanelProps;
  children: React.ReactNode;
}

const InPageLayout = React.createContext(false);

/** True under a PageLayout. */
export function useInPageLayout(): boolean {
  return React.useContext(InPageLayout);
}

// Each alternative is a complete literal so Tailwind's scanner sees it.
const GRID_ROWS = "cq-lg:grid-cols-[minmax(0,1fr)_17.5rem] cq-lg:grid-rows-[auto_1fr]";
const GRID_TABLE = "cq-xl:grid-cols-[minmax(0,1fr)_17.5rem] cq-xl:grid-rows-[auto_1fr]";

export function PageLayout({
  template,
  records = "rows",
  header,
  banner,
  tabs,
  panel,
  children,
}: PageLayoutProps) {
  if (template === "focus") {
    return (
      <InPageLayout.Provider value={true}>
        <div data-page-template={template} className="cq flex flex-col gap-5">
          {banner}
          {header}
          {tabs}
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        </div>
      </InPageLayout.Provider>
    );
  }

  const drawPanel = panel !== undefined && isPanelWorthDrawing(panel);
  const regions = drawPanel ? panelRegions(panel) : { lead: [], trail: [] };
  const aboutOnly =
    panel !== undefined && !drawPanel && "about" in panel && panel.about ? panel.about : null;
  const table = records === "table";
  const hasLead = regions.lead.length > 0;
  const hasTrail = regions.trail.length > 0;

  return (
    <InPageLayout.Provider value={true}>
      <div data-page-template={template} className="cq flex flex-col gap-5">
        {banner}
        {header}
        {aboutOnly ? <p className="text-sm text-content-secondary">{aboutOnly}</p> : null}
        {tabs}
        <div
          data-page-grid=""
          className={cn(
            "grid grid-cols-1 gap-x-6 gap-y-5",
            drawPanel && (table ? GRID_TABLE : GRID_ROWS),
          )}
        >
          {hasLead ? (
            <div
              className={cn(
                table
                  ? "cq-xl:col-start-2 cq-xl:row-start-1"
                  : "cq-lg:col-start-2 cq-lg:row-start-1",
              )}
            >
              <PanelRegions regions={regions.lead} label="Summary" />
            </div>
          ) : null}
          <div
            className={cn(
              "min-w-0",
              drawPanel &&
                (table
                  ? "cq-xl:col-start-1 cq-xl:row-span-2 cq-xl:row-start-1"
                  : "cq-lg:col-start-1 cq-lg:row-span-2 cq-lg:row-start-1"),
            )}
          >
            {children}
          </div>
          {hasTrail ? (
            <div
              className={cn(
                table
                  ? hasLead
                    ? "cq-xl:col-start-2 cq-xl:row-start-2"
                    : "cq-xl:col-start-2 cq-xl:row-start-1"
                  : hasLead
                    ? "cq-lg:col-start-2 cq-lg:row-start-2"
                    : "cq-lg:col-start-2 cq-lg:row-start-1",
              )}
            >
              <PanelRegions regions={regions.trail} label="More about this page" />
            </div>
          ) : null}
        </div>
      </div>
    </InPageLayout.Provider>
  );
}
