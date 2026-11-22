"use client";

/**
 * The one context object that says "this subtree is inside a PageLayout".
 * Kept apart from page-layout.tsx so a consumer that only needs the flag
 * (PageHeader) does not pull in the layout, the side panel and its icon.
 */
import * as React from "react";

export const InPageLayout = React.createContext(false);

/** True under a PageLayout. */
export function useInPageLayout(): boolean {
  return React.useContext(InPageLayout);
}
