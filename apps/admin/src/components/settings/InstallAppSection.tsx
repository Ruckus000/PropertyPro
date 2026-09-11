'use client';

/**
 * Settings → "Install this console": offers the browser's install flow where
 * one exists, and explains the situation where one does not.
 *
 * ## Progressive enhancement, with no dead button
 *
 * Only Chromium browsers fire `beforeinstallprompt`, and only once their own
 * engagement heuristics are satisfied. Firefox and desktop Safari never do;
 * iOS installs exclusively through the Share sheet, which a page cannot open.
 * So this section has four states and a rendered button in exactly one of them:
 *
 * | condition                  | what it shows                                |
 * |----------------------------|----------------------------------------------|
 * | already installed          | nothing — there is nothing left to offer     |
 * | iOS / iPadOS               | the Share → Add to Home Screen instruction   |
 * | a prompt is waiting        | the `Install app` button                     |
 * | anything else              | why no button is here, and what to do instead |
 *
 * A button that renders and then does nothing is the failure this replaces.
 *
 * ## Why nothing renders until after mount
 *
 * Every input here — the deferred event, `display-mode`, the user agent — is a
 * browser fact, and this component is server-rendered. Reading any of them
 * during render produces markup the server cannot reproduce, which React
 * discards with a hydration error. The section is therefore absent on the
 * server pass and appears in the effect, the same trade `AdminShell` documents
 * for `pinned` and `mobile`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';
import { Button } from '@propertypro/ui';
import {
  captureInstallPrompt,
  type InstallOutcome,
  type InstallPromptController,
} from '@/lib/pwa/install-prompt';

export function InstallAppSection() {
  const [controller, setController] = useState<InstallPromptController | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);

  useEffect(() => {
    const next = captureInstallPrompt(window);
    setController(next);
    setCanInstall(next.canInstall());
    const unsubscribe = next.subscribe(() => setCanInstall(next.canInstall()));
    return () => {
      unsubscribe();
      next.destroy();
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!controller) return;
    setOutcome(await controller.prompt());
  }, [controller]);

  // Pre-mount, and once the console is already running as an installed app.
  if (!controller || controller.isStandalone) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
        Install this console
      </h2>

      <div className="rounded-lg border border-edge bg-surface-card p-4 shadow-e1">
        <p className="text-sm font-medium text-content">
          Keep the operator console one tap away
        </p>
        <p className="mt-1 text-sm text-content-secondary">
          Installing gives the console its own window and lets you read pages you have already
          opened while offline. Changes still need a connection — nothing is queued and sent
          later.
        </p>

        {controller.isIos ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-content-secondary">
            <Share size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              On iPhone and iPad, open the Share menu in Safari and choose{' '}
              <strong className="font-medium text-content">Add to Home Screen</strong>. Safari
              does not let a page start this for you.
            </span>
          </p>
        ) : canInstall ? (
          <div className="mt-3">
            <Button onClick={handleInstall}>
              <Download size={16} aria-hidden="true" />
              Install app
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-content-secondary">
            Your browser hasn&rsquo;t offered an install for this site. Chrome and Edge offer it
            after you&rsquo;ve used the console a few times — look for the install icon in the
            address bar, or use the browser menu&rsquo;s{' '}
            <strong className="font-medium text-content">Install</strong> item. Firefox and
            desktop Safari don&rsquo;t support installing web apps.
          </p>
        )}

        {outcome !== null && (
          <p role="status" className="mt-3 text-sm text-content-secondary">
            {outcome === 'accepted'
              ? 'Installed. Look for PP Ops alongside your other apps.'
              : outcome === 'dismissed'
                ? 'No problem — you can install it later from your browser menu.'
                : 'Your browser closed the install prompt. Try again from the browser menu.'}
          </p>
        )}
      </div>
    </section>
  );
}
