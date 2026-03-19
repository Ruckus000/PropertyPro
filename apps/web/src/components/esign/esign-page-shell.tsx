'use client';

/**
 * EsignPageShell — Client component for the E-Sign landing page.
 *
 * Renders tabs for "Documents" (submissions list) and "Templates" link,
 * plus a "Send Document" primary CTA.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@propertypro/ui';
import { Plus, FileText, LayoutTemplate } from 'lucide-react';
import { SubmissionList } from '@/components/esign/submission-list';

interface EsignPageShellProps {
  communityId: number;
}

type TabId = 'documents' | 'templates';

export function EsignPageShell({ communityId }: EsignPageShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('documents');

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">E-Sign</h1>
          <p className="mt-1 text-sm text-gray-500">
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
      <div className="flex border-b mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'documents'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          Documents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutTemplate className="h-4 w-4" />
          Templates
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'documents' && (
        <SubmissionList communityId={communityId} />
      )}

      {activeTab === 'templates' && (
        <div className="text-center py-16">
          <LayoutTemplate className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Manage Templates
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Create and manage reusable document templates for e-signing.
          </p>
          <Link href={`/esign/templates?communityId=${communityId}`}>
            <Button variant="secondary">
              Go to Templates
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
