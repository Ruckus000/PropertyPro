'use client';

import { useQueryClient } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { SubmitForm } from '@/components/maintenance/SubmitForm';
import { OPERATIONS_KEYS } from '@/hooks/use-operations';

interface RequestCreateSheetProps {
  open: boolean;
  onClose: () => void;
  communityId: number;
  userId: string;
}

export function RequestCreateSheet({ open, onClose, communityId, userId }: RequestCreateSheetProps) {
  const queryClient = useQueryClient();

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Submit Request"
      description="Open a maintenance request for this community."
    >
      <SubmitForm
        communityId={communityId}
        userId={userId}
        onCreated={async () => {
          await queryClient.invalidateQueries({ queryKey: ['maintenance-requests', 'list'] });
          await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
          onClose();
        }}
      />
    </SlideOverPanel>
  );
}
