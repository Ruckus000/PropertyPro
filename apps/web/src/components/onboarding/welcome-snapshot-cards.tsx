'use client';

import { cn } from '@/lib/utils';

// ─── Data interfaces ──────────────────────────────────────────

export interface CommunityData {
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
}

export interface AnnouncementData {
  id: number;
  title: string;
  publishedAt: string;
}

export interface ComplianceData {
  score: number;
  totalItems: number;
  satisfiedItems: number;
}

export interface UnitData {
  unitNumber: string;
  building: string | null;
  floor: number | null;
}

// ─── Shared components ────────────────────────────────────────

function SnapshotCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-edge bg-surface-card p-5 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-content-secondary" aria-hidden="true">
        {icon}
      </span>
      <h3 className="text-sm font-semibold text-content">{title}</h3>
    </div>
  );
}

function ActionLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-interactive hover:text-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
    >
      {label}
      <ArrowRightIcon />
    </a>
  );
}

// ─── Icons ────────────────────────────────────────────────────

function BuildingIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-5v12L3 13v-2z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

// ─── Compliance score helper ──────────────────────────────────

function getComplianceLabel(score: number): { text: string; color: string } {
  if (score >= 90) return { text: 'Excellent', color: 'text-green-600' };
  if (score >= 70) return { text: 'Good', color: 'text-yellow-600' };
  if (score >= 50) return { text: 'Needs attention', color: 'text-orange-600' };
  return { text: 'Critical', color: 'text-red-600' };
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─── Community type display ───────────────────────────────────

function getCommunityTypeLabel(type: CommunityData['communityType']): string {
  switch (type) {
    case 'condo_718':
      return 'Condo Association';
    case 'hoa_720':
      return 'HOA';
    case 'apartment':
      return 'Apartment Community';
  }
}

// ─── Owner Cards ──────────────────────────────────────────────

interface OwnerCardsProps {
  community: CommunityData;
  announcement: AnnouncementData | null;
  compliance: ComplianceData;
}

export function OwnerCards({ community, announcement, compliance }: OwnerCardsProps) {
  const location = [community.city, community.state].filter(Boolean).join(', ');

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Community info card */}
      <SnapshotCard>
        <CardHeader icon={<BuildingIcon />} title="Your Community" />
        <p className="text-sm font-medium text-content">{community.name}</p>
        {location && (
          <p className="mt-1 text-xs text-content-tertiary">{location}</p>
        )}
        <p className="mt-1 text-xs text-content-tertiary">
          {getCommunityTypeLabel(community.communityType)}
        </p>
      </SnapshotCard>

      {/* Latest announcement card */}
      <SnapshotCard>
        <CardHeader icon={<MegaphoneIcon />} title="Latest Announcement" />
        {announcement ? (
          <>
            <p className="text-sm text-content line-clamp-2">{announcement.title}</p>
            <p className="mt-1 text-xs text-content-tertiary">
              Posted {formatDate(announcement.publishedAt)}
            </p>
            <ActionLink href="/announcements" label="View announcements" />
          </>
        ) : (
          <p className="text-sm text-content-tertiary">No announcements yet</p>
        )}
      </SnapshotCard>

      {/* Compliance status card */}
      <SnapshotCard>
        <CardHeader icon={<ShieldCheckIcon />} title="Compliance Status" />
        {compliance.totalItems > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-content">{compliance.score}%</span>
              <span className={cn('text-sm font-medium', getComplianceLabel(compliance.score).color)}>
                {getComplianceLabel(compliance.score).text}
              </span>
            </div>
            <p className="mt-1 text-xs text-content-tertiary">
              {compliance.satisfiedItems} of {compliance.totalItems} items satisfied
            </p>
            <ActionLink href="/compliance" label="View compliance" />
          </>
        ) : (
          <p className="text-sm text-content-tertiary">Compliance tracking not yet set up</p>
        )}
      </SnapshotCard>
    </div>
  );
}

// ─── Board Member Cards ───────────────────────────────────────

interface BoardMemberCardsProps {
  community: CommunityData;
  compliance: ComplianceData;
  recentActivity: string;
}

export function BoardMemberCards({
  community,
  compliance,
  recentActivity,
}: BoardMemberCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Compliance overview card */}
      <SnapshotCard>
        <CardHeader icon={<ShieldCheckIcon />} title="Compliance Overview" />
        {compliance.totalItems > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-content">{compliance.score}%</span>
              <span className={cn('text-sm font-medium', getComplianceLabel(compliance.score).color)}>
                {getComplianceLabel(compliance.score).text}
              </span>
            </div>
            <p className="mt-1 text-xs text-content-tertiary">
              {compliance.satisfiedItems} of {compliance.totalItems} items satisfied
            </p>
            <ActionLink href="/compliance" label="Review compliance" />
          </>
        ) : (
          <p className="text-sm text-content-tertiary">Compliance tracking not yet set up</p>
        )}
      </SnapshotCard>

      {/* Recent activity card */}
      <SnapshotCard>
        <CardHeader icon={<ActivityIcon />} title="Recent Activity" />
        <p className="text-sm text-content">{recentActivity || 'No recent activity'}</p>
      </SnapshotCard>

      {/* Responsibilities card */}
      <SnapshotCard>
        <CardHeader icon={<ClipboardIcon />} title="Board Responsibilities" />
        <p className="text-sm text-content-secondary">
          As a board member of {community.name}, you can review compliance, oversee documents,
          and participate in community governance.
        </p>
        <ActionLink href="/dashboard" label="Go to dashboard" />
      </SnapshotCard>
    </div>
  );
}

// ─── Tenant Cards ─────────────────────────────────────────────

interface TenantCardsProps {
  community: CommunityData;
  unit: UnitData | null;
}

export function TenantCards({ community, unit }: TenantCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Unit info card */}
      <SnapshotCard>
        <CardHeader icon={<HomeIcon />} title="Your Unit" />
        {unit ? (
          <>
            <p className="text-sm font-medium text-content">Unit {unit.unitNumber}</p>
            {unit.building && (
              <p className="mt-1 text-xs text-content-tertiary">Building {unit.building}</p>
            )}
            {unit.floor != null && (
              <p className="mt-0.5 text-xs text-content-tertiary">Floor {unit.floor}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-content-tertiary">Unit information will appear here once assigned</p>
        )}
      </SnapshotCard>

      {/* Community documents card */}
      <SnapshotCard>
        <CardHeader icon={<FileTextIcon />} title="Community Documents" />
        <p className="text-sm text-content-secondary">
          Access governing documents, meeting minutes, and community policies for {community.name}.
        </p>
        <ActionLink href="/documents" label="Browse documents" />
      </SnapshotCard>

      {/* Maintenance card */}
      <SnapshotCard>
        <CardHeader icon={<WrenchIcon />} title="Maintenance" />
        <p className="text-sm text-content-secondary">
          Submit and track maintenance requests for your unit.
        </p>
        <ActionLink href="/maintenance/submit" label="Submit a request" />
      </SnapshotCard>
    </div>
  );
}
