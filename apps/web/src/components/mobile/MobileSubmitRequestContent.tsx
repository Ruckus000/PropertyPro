"use client";

import { useRouter } from "next/navigation";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import { SubmitForm } from "@/components/maintenance/SubmitForm";
import { PageTransition } from "@/components/motion";

interface MobileSubmitRequestContentProps {
  communityId: number;
  userId: string;
  /** The resident's own unit, prefilled into the form (see SubmitForm). */
  defaultUnitId?: number;
  defaultUnitLabel?: string;
}

export function MobileSubmitRequestContent({
  communityId,
  userId,
  defaultUnitId,
  defaultUnitLabel,
}: MobileSubmitRequestContentProps) {
  const router = useRouter();

  return (
    <PageTransition>
      <div className="flex flex-col pb-6">
        <MobileBackHeader title="Submit Request" />
        <div className="px-5 pt-4">
          <SubmitForm
            communityId={communityId}
            userId={userId}
            defaultUnitId={defaultUnitId}
            defaultUnitLabel={defaultUnitLabel}
            onCreated={() => {
              router.push(`/mobile/maintenance?communityId=${communityId}`);
            }}
          />
        </div>
      </div>
    </PageTransition>
  );
}
