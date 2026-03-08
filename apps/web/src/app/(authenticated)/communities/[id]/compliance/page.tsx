import React from "react";
import ComplianceDashboard from "@/components/compliance/compliance-dashboard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CompliancePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  if (!Number.isFinite(communityId) || communityId <= 0) {
    return <div>Invalid community ID</div>;
  }
  return <ComplianceDashboard communityId={communityId} />;
}
