import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@react-email/components";
import {
  InvitationEmail,
  PasswordResetEmail,
  MeetingNoticeEmail,
  ComplianceAlertEmail,
  AnnouncementEmail,
} from "../src/index";
import type { CommunityBranding } from "../src/index";

const branding: CommunityBranding = {
  communityName: "Palm Gardens Condominium",
  logoUrl: "https://example.com/logo.png",
  accentColor: "#1a6b3f",
};

const brandingMinimal: CommunityBranding = {
  communityName: "Sunset Condos",
};

// ---------------------------------------------------------------------------
// InvitationEmail
// ---------------------------------------------------------------------------

describe("InvitationEmail", () => {
  it("renders without errors", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toBeTruthy();
  });

  it("contains invitee name", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("Jane Doe");
  });

  it("contains inviter name", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("John Smith");
  });

  it("contains community name from branding", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("Palm Gardens Condominium");
  });

  it("contains role", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Board Member"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("Board Member");
  });

  it("contains invite URL", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("https://example.com/invite/abc123");
  });

  it("shows custom expiration days", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
        expiresInDays={14}
      />,
    );
    expect(html).toContain("14 days");
  });

  it("includes community logo when provided", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("https://example.com/logo.png");
  });

  it("renders without logo when not provided", async () => {
    const html = await render(
      <InvitationEmail
        branding={brandingMinimal}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("Sunset Condos");
    expect(html).not.toContain("logo.png");
  });

  it("includes accent color in styles", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("#1a6b3f");
  });

  it("contains PropertyPro footer", async () => {
    const html = await render(
      <InvitationEmail
        branding={branding}
        inviteeName="Jane Doe"
        inviterName="John Smith"
        role="Owner"
        inviteUrl="https://example.com/invite/abc123"
      />,
    );
    expect(html).toContain("PropertyPro Florida");
  });
});

// ---------------------------------------------------------------------------
// PasswordResetEmail
// ---------------------------------------------------------------------------

describe("PasswordResetEmail", () => {
  it("renders without errors", async () => {
    const html = await render(
      <PasswordResetEmail
        branding={branding}
        userName="Jane Doe"
        resetUrl="https://example.com/reset/token123"
      />,
    );
    expect(html).toBeTruthy();
  });

  it("contains user name", async () => {
    const html = await render(
      <PasswordResetEmail
        branding={branding}
        userName="Jane Doe"
        resetUrl="https://example.com/reset/token123"
      />,
    );
    expect(html).toContain("Jane Doe");
  });

  it("contains reset URL", async () => {
    const html = await render(
      <PasswordResetEmail
        branding={branding}
        userName="Jane Doe"
        resetUrl="https://example.com/reset/token123"
      />,
    );
    expect(html).toContain("https://example.com/reset/token123");
  });

  it("contains community name", async () => {
    const html = await render(
      <PasswordResetEmail
        branding={branding}
        userName="Jane Doe"
        resetUrl="https://example.com/reset/token123"
      />,
    );
    expect(html).toContain("Palm Gardens Condominium");
  });

  it("shows custom expiration minutes", async () => {
    const html = await render(
      <PasswordResetEmail
        branding={branding}
        userName="Jane Doe"
        resetUrl="https://example.com/reset/token123"
        expiresInMinutes={30}
      />,
    );
    expect(html).toContain("30 minutes");
  });

  it("contains Password Reset heading", async () => {
    const html = await render(
      <PasswordResetEmail
        branding={branding}
        userName="Jane Doe"
        resetUrl="https://example.com/reset/token123"
      />,
    );
    expect(html).toContain("Password Reset");
  });
});

// ---------------------------------------------------------------------------
// MeetingNoticeEmail
// ---------------------------------------------------------------------------

describe("MeetingNoticeEmail", () => {
  it("renders without errors", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Annual Budget Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="owner"
      />,
    );
    expect(html).toBeTruthy();
  });

  it("contains meeting title", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Annual Budget Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="owner"
      />,
    );
    expect(html).toContain("Annual Budget Meeting");
  });

  it("contains meeting date and time", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Annual Budget Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="owner"
      />,
    );
    expect(html).toContain("March 15, 2026");
    expect(html).toContain("7:00 PM EST");
  });

  it("contains location", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Annual Budget Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="owner"
      />,
    );
    expect(html).toContain("Community Clubhouse");
  });

  it("shows 14-day notice for owner meetings (Florida §718)", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Annual Budget Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="owner"
      />,
    );
    expect(html).toContain("14 days");
  });

  it("shows 48-hour notice for board meetings (Florida §718)", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Board Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="board"
      />,
    );
    expect(html).toContain("48 hours");
  });

  it("includes Florida Statute reference", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Board Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="board"
      />,
    );
    expect(html).toContain("Florida Statute §718");
  });

  it("includes agenda link when provided", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Board Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="board"
        agendaUrl="https://example.com/agenda/123"
      />,
    );
    expect(html).toContain("https://example.com/agenda/123");
    expect(html).toContain("View Meeting Agenda");
  });

  it("omits agenda link when not provided", async () => {
    const html = await render(
      <MeetingNoticeEmail
        branding={branding}
        recipientName="Jane Doe"
        meetingTitle="Board Meeting"
        meetingDate="March 15, 2026"
        meetingTime="7:00 PM EST"
        location="Community Clubhouse"
        meetingType="board"
      />,
    );
    expect(html).not.toContain("View Meeting Agenda");
  });
});

// ---------------------------------------------------------------------------
// ComplianceAlertEmail
// ---------------------------------------------------------------------------

describe("ComplianceAlertEmail", () => {
  it("renders without errors", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="The Q4 2025 financial report has not been posted."
        dashboardUrl="https://example.com/compliance"
        severity="warning"
      />,
    );
    expect(html).toBeTruthy();
  });

  it("contains alert title", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="The Q4 2025 financial report has not been posted."
        dashboardUrl="https://example.com/compliance"
        severity="warning"
      />,
    );
    expect(html).toContain("Missing Financial Report");
  });

  it("contains alert description", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="The Q4 2025 financial report has not been posted."
        dashboardUrl="https://example.com/compliance"
        severity="warning"
      />,
    );
    expect(html).toContain("Q4 2025 financial report has not been posted");
  });

  it("contains dashboard URL", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="The Q4 2025 financial report has not been posted."
        dashboardUrl="https://example.com/compliance"
        severity="warning"
      />,
    );
    expect(html).toContain("https://example.com/compliance");
  });

  it("shows severity badge", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="Report not posted."
        dashboardUrl="https://example.com/compliance"
        severity="critical"
      />,
    );
    expect(html).toContain("Critical");
  });

  it("shows due date when provided", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="Report not posted."
        dashboardUrl="https://example.com/compliance"
        severity="warning"
        dueDate="February 28, 2026"
      />,
    );
    expect(html).toContain("February 28, 2026");
  });

  it("includes Florida Statute §718.111(12)(g) reference", async () => {
    const html = await render(
      <ComplianceAlertEmail
        branding={branding}
        recipientName="Jane Doe"
        alertTitle="Missing Financial Report"
        alertDescription="Report not posted."
        dashboardUrl="https://example.com/compliance"
        severity="info"
      />,
    );
    expect(html).toContain("§718.111(12)(g)");
  });
});

// ---------------------------------------------------------------------------
// AnnouncementEmail
// ---------------------------------------------------------------------------

describe("AnnouncementEmail", () => {
  it("renders without errors", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed for maintenance next week."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
      />,
    );
    expect(html).toBeTruthy();
  });

  it("contains announcement title", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed for maintenance next week."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
      />,
    );
    expect(html).toContain("Pool Maintenance");
  });

  it("contains announcement body", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed for maintenance next week."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
      />,
    );
    expect(html).toContain("pool will be closed for maintenance");
  });

  it("contains author name", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
      />,
    );
    expect(html).toContain("Board of Directors");
  });

  it("contains portal URL", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
      />,
    );
    expect(html).toContain("https://example.com/announcements/1");
  });

  it("shows 'Important Announcement' heading when pinned", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
        isPinned={true}
      />,
    );
    expect(html).toContain("Important Announcement");
  });

  it("shows 'New Announcement' heading when not pinned", async () => {
    const html = await render(
      <AnnouncementEmail
        branding={branding}
        recipientName="Jane Doe"
        announcementTitle="Pool Maintenance"
        announcementBody="The pool will be closed."
        authorName="Board of Directors"
        portalUrl="https://example.com/announcements/1"
        isPinned={false}
      />,
    );
    expect(html).toContain("New Announcement");
  });
});
