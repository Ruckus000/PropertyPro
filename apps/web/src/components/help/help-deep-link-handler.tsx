'use client';

/**
 * <HelpDeepLinkHandler/> — bridges URL state and modal state.
 *
 * Open: when the URL contains `?help=<category>/<slug>` (validated by the
 * same regex as the API endpoint), opens the modal pointed at that article.
 *
 * Close: when the modal closes (selectedArticle clears AND isOpen=false),
 * strips `?help=` from the URL via router.replace. This prevents
 * refresh-after-close from reopening the modal. Other query params are
 * preserved.
 *
 * Mounted inside HelpWidgetProvider so it can read selectedArticle from
 * the same context the modal does.
 */
import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useHelpWidget } from '@/components/help/help-widget-provider';

const SLUG_REGEX = /^[a-z0-9-]+$/;

export function HelpDeepLinkHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOpen, selectedArticle, openArticle, consumeNavigationCloseFlag } =
    useHelpWidget();
  const wasOpen = useRef(false);

  // Open the modal when ?help=cat/slug appears.
  useEffect(() => {
    const helpParam = searchParams.get('help');
    if (!helpParam) return;
    const [category, slug] = helpParam.split('/');
    if (category && slug && SLUG_REGEX.test(category) && SLUG_REGEX.test(slug)) {
      openArticle(category, slug);
    }
  }, [searchParams, openArticle]);

  // Strip ?help= when the modal closes. Detect close as "was open, now isn't".
  // Skip the strip if the close was triggered by a navigation (e.g. footer
  // link click) — otherwise router.replace would race with Next's pending
  // navigation, briefly flickering the URL to the OLD path with help=
  // stripped before settling on the new path.
  useEffect(() => {
    const isOpenNow = isOpen || selectedArticle !== null;
    const isNavigationClose = consumeNavigationCloseFlag();
    if (
      wasOpen.current &&
      !isOpenNow &&
      !isNavigationClose &&
      searchParams.get('help')
    ) {
      const remaining = new URLSearchParams(searchParams.toString());
      remaining.delete('help');
      const qs = remaining.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    wasOpen.current = isOpenNow;
  }, [
    isOpen,
    selectedArticle,
    searchParams,
    router,
    pathname,
    consumeNavigationCloseFlag,
  ]);

  return null;
}
