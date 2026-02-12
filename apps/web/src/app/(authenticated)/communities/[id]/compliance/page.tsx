import React from "react";
import ComplianceDashboard from "@/components/compliance/compliance-dashboard";

interface PageProps {
  params: { id: string };
}

export default function CompliancePage({ params }: PageProps) {
  const communityId = Number(params.id);
  if (!Number.isFinite(communityId) || communityId <= 0) {
    return <div>Invalid community ID</div>;
  }
  return <ComplianceDashboard communityId={communityId} />;
}

