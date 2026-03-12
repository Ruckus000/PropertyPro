'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { EsignBuilder } from '@/components/esign/EsignBuilder';

interface NewTemplateClientProps {
  token: string;
  communityId: number;
}

export function NewTemplateClient({ token, communityId }: NewTemplateClientProps) {
  const router = useRouter();

  const handleTemplateSaved = useCallback(
    (template: { id: number; name: string }) => {
      router.push(`/communities/${communityId}/esign/templates`);
    },
    [router, communityId],
  );

  return (
    <EsignBuilder
      token={token}
      communityId={communityId}
      onTemplateSaved={handleTemplateSaved}
    />
  );
}
