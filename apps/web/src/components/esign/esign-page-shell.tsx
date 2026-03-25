'use client';

/**
 * EsignPageShell — Client component for the E-Sign landing page.
 *
 * Renders tabs for "Documents" (submissions list) and "Templates" link,
 * plus a "Send Document" primary CTA.
 */

import Link from 'next/link';
import { Button } from '@propertypro/ui';
import { Plus, FileText, LayoutTemplate } from 'lucide-react';
import { SubmissionList } from '@/components/esign/submission-list';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface EsignPageShellProps {
  communityId: number;
}

export function EsignPageShell({ communityId }: EsignPageShellProps) {
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">E-Sign</h1>
          <p className="mt-1 text-sm text-content-tertiary">
            Digital document signing
          </p>
        </div>
        <Link href={`/esign/submissions/new?communityId=${communityId}`}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Send Document
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <div className="flex items-center border-b mb-6">
          <TabsList className="h-auto rounded-none bg-transparent p-0 gap-0">
            <TabsTrigger
              value="documents"
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-none border-b-2 border-transparent transition-colors duration-quick',
                'data-[state=active]:border-interactive data-[state=active]:text-content-link data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                'text-content-tertiary hover:text-content-secondary',
              )}
            >
              <FileText className="h-4 w-4" />
              Documents
            </TabsTrigger>
          </TabsList>
          {/* Templates is navigation — renders as a link styled like a tab, not a TabsTrigger */}
          <Link
            href={`/esign/templates?communityId=${communityId}`}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-content-tertiary hover:text-content-secondary transition-colors duration-quick"
          >
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </Link>
        </div>

        <TabsContent value="documents">
          <SubmissionList communityId={communityId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
