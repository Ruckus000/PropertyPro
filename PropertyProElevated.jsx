import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// PROPERTYRO FLORIDA — ELEVATED DESIGN SYSTEM
// Inspired by: Vercel Geist, shadcn/ui, Linear, and modern SaaS design principles
// ═══════════════════════════════════════════════════════════════════════════════

// Design Tokens — Following 8px grid, high contrast philosophy
const tokens = {
  // Colors — High contrast base with intentional accents
  colors: {
    // Backgrounds
    bg: {
      primary: "#FFFFFF",
      secondary: "#FAFAFA",
      tertiary: "#F4F4F5",
      inverse: "#09090B",
      elevated: "#FFFFFF",
    },
    // Foregrounds
    fg: {
      primary: "#09090B",
      secondary: "#71717A",
      tertiary: "#A1A1AA",
      inverse: "#FAFAFA",
      muted: "#D4D4D8",
    },
    // Borders
    border: {
      default: "#E4E4E7",
      muted: "#F4F4F5",
      strong: "#D4D4D8",
      focus: "#18181B",
    },
    // Semantic
    success: { base: "#22C55E", light: "#DCFCE7", dark: "#166534" },
    warning: { base: "#F59E0B", light: "#FEF3C7", dark: "#92400E" },
    error: { base: "#EF4444", light: "#FEE2E2", dark: "#991B1B" },
    // Accent — Single intentional accent color
    accent: { base: "#18181B", hover: "#27272A", light: "#F4F4F5" },
    // Brand
    brand: { primary: "#0A0A0A", secondary: "#262626" },
  },
  // Spacing — 8px grid
  space: {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
    20: "80px",
  },
  // Typography — Clean, readable hierarchy
  font: {
    family: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      mono: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
    },
    size: {
      xs: "11px",
      sm: "13px",
      base: "14px",
      md: "15px",
      lg: "16px",
      xl: "18px",
      "2xl": "20px",
      "3xl": "24px",
      "4xl": "30px",
      "5xl": "36px",
    },
    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    leading: {
      tight: 1.2,
      snug: 1.35,
      normal: 1.5,
      relaxed: 1.625,
    },
  },
  // Radii — Consistent, nested
  radius: {
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
    "2xl": "16px",
    full: "9999px",
  },
  // Shadows — Layered (ambient + direct)
  shadow: {
    xs: "0 1px 2px rgba(0,0,0,0.04)",
    sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    md: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -1px rgba(0,0,0,0.04)",
    lg: "0 10px 15px -3px rgba(0,0,0,0.06), 0 4px 6px -2px rgba(0,0,0,0.03)",
    xl: "0 20px 25px -5px rgba(0,0,0,0.06), 0 10px 10px -5px rgba(0,0,0,0.02)",
    ring: "0 0 0 2px rgba(0,0,0,0.08)",
  },
  // Transitions
  transition: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    base: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRIMITIVE COMPONENTS — Building blocks with proper composition
// ═══════════════════════════════════════════════════════════════════════════════

const Text = ({ as: Tag = "span", size = "base", weight = "normal", color = "primary", mono, style, children }) => (
  <Tag
    style={{
      fontFamily: mono ? tokens.font.family.mono : tokens.font.family.sans,
      fontSize: tokens.font.size[size],
      fontWeight: tokens.font.weight[weight],
      color: tokens.colors.fg[color],
      lineHeight: tokens.font.leading.normal,
      margin: 0,
      ...style,
    }}
  >
    {children}
  </Tag>
);

const Stack = ({ direction = "column", gap = 4, align, justify, style, children }) => (
  <div
    style={{
      display: "flex",
      flexDirection: direction === "row" ? "row" : "column",
      gap: tokens.space[gap],
      alignItems: align,
      justifyContent: justify,
      ...style,
    }}
  >
    {children}
  </div>
);

const Badge = ({ variant = "default", size = "sm", children }) => {
  const variants = {
    default: { bg: tokens.colors.bg.tertiary, color: tokens.colors.fg.secondary },
    success: { bg: tokens.colors.success.light, color: tokens.colors.success.dark },
    warning: { bg: tokens.colors.warning.light, color: tokens.colors.warning.dark },
    error: { bg: tokens.colors.error.light, color: tokens.colors.error.dark },
    outline: { bg: "transparent", color: tokens.colors.fg.secondary, border: `1px solid ${tokens.colors.border.default}` },
  };
  const sizes = {
    xs: { padding: "2px 6px", fontSize: tokens.font.size.xs },
    sm: { padding: "3px 8px", fontSize: tokens.font.size.xs },
    md: { padding: "4px 10px", fontSize: tokens.font.size.sm },
  };
  const v = variants[variant];
  const s = sizes[size];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor: v.bg,
        color: v.color,
        border: v.border || "none",
        borderRadius: tokens.radius.full,
        fontSize: s.fontSize,
        fontWeight: tokens.font.weight.medium,
        padding: s.padding,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

const Button = ({ variant = "primary", size = "md", children, style, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const variants = {
    primary: {
      bg: tokens.colors.accent.base,
      bgHover: tokens.colors.accent.hover,
      color: tokens.colors.fg.inverse,
      border: "none",
    },
    secondary: {
      bg: tokens.colors.bg.primary,
      bgHover: tokens.colors.bg.secondary,
      color: tokens.colors.fg.primary,
      border: `1px solid ${tokens.colors.border.default}`,
    },
    ghost: {
      bg: "transparent",
      bgHover: tokens.colors.bg.tertiary,
      color: tokens.colors.fg.secondary,
      border: "none",
    },
  };
  const sizes = {
    sm: { padding: "6px 12px", fontSize: tokens.font.size.sm, height: "32px" },
    md: { padding: "8px 16px", fontSize: tokens.font.size.base, height: "36px" },
    lg: { padding: "10px 20px", fontSize: tokens.font.size.md, height: "40px" },
  };
  const v = variants[variant];
  const s = sizes[size];
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        backgroundColor: isHovered ? v.bgHover : v.bg,
        color: v.color,
        border: v.border,
        borderRadius: tokens.radius.md,
        fontSize: s.fontSize,
        fontWeight: tokens.font.weight.medium,
        fontFamily: tokens.font.family.sans,
        padding: s.padding,
        height: s.height,
        cursor: "pointer",
        transition: `all ${tokens.transition.fast}`,
        outline: "none",
        ...style,
      }}
    >
      {children}
    </button>
  );
};

const Card = ({ children, style, padding = 6, hover = false }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
      style={{
        backgroundColor: tokens.colors.bg.elevated,
        borderRadius: tokens.radius.xl,
        border: `1px solid ${tokens.colors.border.default}`,
        boxShadow: isHovered ? tokens.shadow.md : tokens.shadow.xs,
        transition: `all ${tokens.transition.base}`,
        transform: isHovered ? "translateY(-1px)" : "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {padding ? <div style={{ padding: tokens.space[padding] }}>{children}</div> : children}
    </div>
  );
};

const IconCircle = ({ size = 40, bg = tokens.colors.bg.tertiary, children }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: tokens.radius.lg,
      backgroundColor: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS INDICATORS — Clear, accessible, beautiful
// ═══════════════════════════════════════════════════════════════════════════════

const StatusDot = ({ status }) => {
  const colors = {
    compliant: tokens.colors.success.base,
    pending: tokens.colors.warning.base,
    overdue: tokens.colors.error.base,
    active: tokens.colors.success.base,
    inactive: tokens.colors.fg.tertiary,
  };
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: colors[status] || colors.inactive,
        display: "inline-block",
        boxShadow: `0 0 0 3px ${colors[status]}20`,
      }}
    />
  );
};

const StatusPill = ({ status, showDot = true }) => {
  const map = {
    compliant: { label: "Compliant", variant: "success" },
    pending: { label: "Due Soon", variant: "warning" },
    overdue: { label: "Overdue", variant: "error" },
    submitted: { label: "Submitted", variant: "default" },
    in_progress: { label: "In Progress", variant: "warning" },
    completed: { label: "Completed", variant: "success" },
  };
  const s = map[status] || map.compliant;
  return (
    <Badge variant={s.variant}>
      {showDot && <StatusDot status={status} />}
      {s.label}
    </Badge>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA COMPONENTS — Minimal, clear, impactful
// ═══════════════════════════════════════════════════════════════════════════════

const MetricCard = ({ label, value, change, trend, description }) => (
  <Card hover>
    <Stack gap={1}>
      <Text size="xs" weight="medium" color="tertiary" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Text>
      <Stack direction="row" gap={2} align="baseline">
        <Text size="4xl" weight="bold" style={{ letterSpacing: "-0.02em", lineHeight: 1 }}>
          {value}
        </Text>
        {change && (
          <Text
            size="sm"
            weight="medium"
            style={{
              color: trend === "up" ? tokens.colors.success.base : trend === "down" ? tokens.colors.error.base : tokens.colors.fg.secondary,
            }}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {change}
          </Text>
        )}
      </Stack>
      {description && (
        <Text size="sm" color="secondary" style={{ marginTop: tokens.space[1] }}>
          {description}
        </Text>
      )}
    </Stack>
  </Card>
);

const ProgressBar = ({ value, max = 100, size = "md", showLabel = false }) => {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 90 ? tokens.colors.success.base : pct >= 70 ? tokens.colors.warning.base : tokens.colors.error.base;
  const heights = { sm: 4, md: 6, lg: 8 };
  return (
    <Stack direction="row" gap={3} align="center">
      <div
        style={{
          flex: 1,
          height: heights[size],
          backgroundColor: tokens.colors.bg.tertiary,
          borderRadius: tokens.radius.full,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: tokens.radius.full,
            transition: `width ${tokens.transition.slow}`,
          }}
        />
      </div>
      {showLabel && (
        <Text size="sm" weight="semibold" style={{ color, minWidth: 40, textAlign: "right" }}>
          {pct}%
        </Text>
      )}
    </Stack>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE COMPONENT — Clean, scannable
// ═══════════════════════════════════════════════════════════════════════════════

const Table = ({ columns, data, onRowClick }) => (
  <div style={{ overflow: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th
              key={i}
              style={{
                padding: `${tokens.space[3]} ${tokens.space[4]}`,
                textAlign: col.align || "left",
                fontSize: tokens.font.size.xs,
                fontWeight: tokens.font.weight.medium,
                color: tokens.colors.fg.tertiary,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: `1px solid ${tokens.colors.border.default}`,
                backgroundColor: tokens.colors.bg.secondary,
                whiteSpace: "nowrap",
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, ri) => (
          <TableRow key={ri} columns={columns} row={row} onClick={onRowClick ? () => onRowClick(row) : null} />
        ))}
      </tbody>
    </table>
  </div>
);

const TableRow = ({ columns, row, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        backgroundColor: isHovered ? tokens.colors.bg.secondary : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: `background ${tokens.transition.fast}`,
      }}
    >
      {columns.map((col, ci) => (
        <td
          key={ci}
          style={{
            padding: `${tokens.space[4]} ${tokens.space[4]}`,
            textAlign: col.align || "left",
            fontSize: tokens.font.size.sm,
            color: tokens.colors.fg.primary,
            borderBottom: `1px solid ${tokens.colors.border.muted}`,
            verticalAlign: "middle",
          }}
        >
          {col.render ? col.render(row[col.key], row) : row[col.key]}
        </td>
      ))}
    </tr>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION — Minimal, functional
// ═══════════════════════════════════════════════════════════════════════════════

const Sidebar = ({ activeView, setActiveView, viewGroup, setViewGroup }) => {
  const navItems = {
    admin: [
      { id: "compliance", label: "Compliance", icon: "◎" },
      { id: "audit", label: "Audit Progress", icon: "✓" },
      { id: "documents", label: "Documents", icon: "◩" },
      { id: "meetings", label: "Meetings", icon: "◷" },
      { id: "announcements", label: "Announcements", icon: "◈" },
      { id: "maintenance", label: "Maintenance", icon: "◐" },
      { id: "owners", label: "Owners", icon: "◇" },
    ],
    portal: [
      { id: "portal-home", label: "Home", icon: "◎" },
      { id: "portal-documents", label: "Documents", icon: "◩" },
      { id: "portal-meetings", label: "Meetings", icon: "◷" },
      { id: "portal-maintenance", label: "My Requests", icon: "◐" },
    ],
    pm: [
      { id: "pm-portfolio", label: "Portfolio", icon: "◎" },
      { id: "pm-compliance", label: "Compliance", icon: "◩" },
      { id: "pm-whitelabel", label: "White Label", icon: "◈" },
    ],
    sales: [
      { id: "signup", label: "Signup Flow", icon: "◎" },
      { id: "mobile-preview", label: "Mobile App", icon: "📱" },
      { id: "board-presentation", label: "Board Deck", icon: "◷" },
    ],
  };

  const viewLabels = { admin: "Board Admin", portal: "Owner Portal", pm: "Property Manager", sales: "Sales Tools" };

  return (
    <div
      style={{
        width: 240,
        backgroundColor: tokens.colors.bg.inverse,
        color: tokens.colors.fg.inverse,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        fontFamily: tokens.font.family.sans,
      }}
    >
      {/* Logo */}
      <div style={{ padding: `${tokens.space[5]} ${tokens.space[5]} ${tokens.space[4]}` }}>
        <Text size="lg" weight="bold" color="inverse" style={{ letterSpacing: "-0.02em" }}>
          PropertyPro
        </Text>
        <Text size="xs" color="inverse" style={{ opacity: 0.5, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Florida
        </Text>
      </div>

      {/* View Switcher */}
      <div style={{ padding: `0 ${tokens.space[3]} ${tokens.space[4]}` }}>
        <div
          style={{
            display: "flex",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderRadius: tokens.radius.md,
            padding: 3,
          }}
        >
          {Object.keys(viewLabels).map((g) => (
            <button
              key={g}
              onClick={() => {
                setViewGroup(g);
                setActiveView(navItems[g][0].id);
              }}
              style={{
                flex: 1,
                padding: `${tokens.space[2]} ${tokens.space[2]}`,
                backgroundColor: viewGroup === g ? "rgba(255,255,255,0.1)" : "transparent",
                color: viewGroup === g ? "#fff" : "rgba(255,255,255,0.5)",
                border: "none",
                borderRadius: tokens.radius.sm,
                fontSize: tokens.font.size.xs,
                fontWeight: viewGroup === g ? tokens.font.weight.medium : tokens.font.weight.normal,
                cursor: "pointer",
                transition: `all ${tokens.transition.fast}`,
                fontFamily: tokens.font.family.sans,
              }}
            >
              {g === "admin" ? "Admin" : g === "portal" ? "Portal" : g === "pm" ? "PM" : "Sales"}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: `0 ${tokens.space[3]}` }}>
        {navItems[viewGroup].map((item) => (
          <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => setActiveView(item.id)} />
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: tokens.space[5],
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Text size="sm" color="inverse" style={{ opacity: 0.9 }}>
          Palm Gardens Condo
        </Text>
        <Text size="xs" color="inverse" style={{ opacity: 0.5, marginTop: 2 }}>
          50 units · West Palm Beach, FL
        </Text>
      </div>
    </div>
  );
};

const NavItem = ({ item, active, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.space[3],
        width: "100%",
        padding: `${tokens.space[3]} ${tokens.space[3]}`,
        marginBottom: 2,
        backgroundColor: active ? "rgba(255,255,255,0.1)" : isHovered ? "rgba(255,255,255,0.05)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        border: "none",
        borderRadius: tokens.radius.md,
        fontSize: tokens.font.size.sm,
        fontWeight: active ? tokens.font.weight.medium : tokens.font.weight.normal,
        cursor: "pointer",
        textAlign: "left",
        transition: `all ${tokens.transition.fast}`,
        fontFamily: tokens.font.family.sans,
      }}
    >
      <span style={{ fontSize: 14, width: 18, textAlign: "center", opacity: active ? 1 : 0.7 }}>{item.icon}</span>
      {item.label}
    </button>
  );
};

const TopBar = ({ title, subtitle }) => (
  <header
    style={{
      padding: `${tokens.space[4]} ${tokens.space[8]}`,
      borderBottom: `1px solid ${tokens.colors.border.default}`,
      backgroundColor: tokens.colors.bg.primary,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}
  >
    <div>
      <Text as="h1" size="xl" weight="semibold" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </Text>
      {subtitle && (
        <Text size="sm" color="secondary" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      )}
    </div>
    <Stack direction="row" gap={4} align="center">
      <Button variant="ghost" size="sm">
        ?
      </Button>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: tokens.radius.full,
          backgroundColor: tokens.colors.accent.base,
          color: tokens.colors.fg.inverse,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: tokens.font.size.sm,
          fontWeight: tokens.font.weight.semibold,
        }}
      >
        MS
      </div>
    </Stack>
  </header>
);

// ═══════════════════════════════════════════════════════════════════════════════
// DATA — Sample data for the mockup
// ═══════════════════════════════════════════════════════════════════════════════

const complianceItems = [
  { id: "declaration", name: "Declaration of Condominium & Amendments", ref: "§718.111(12)(g)(2)(a)", status: "compliant", date: "Jan 15, 2026", retention: "Permanent" },
  { id: "bylaws", name: "Bylaws & Amendments", ref: "§718.111(12)(g)(2)(b)", status: "compliant", date: "Jan 15, 2026", retention: "Permanent" },
  { id: "articles", name: "Articles of Incorporation", ref: "§718.111(12)(g)(2)(c)", status: "compliant", date: "Jan 15, 2026", retention: "Permanent" },
  { id: "rules", name: "Rules & Regulations", ref: "§718.111(12)(g)(2)(d)", status: "compliant", date: "Jan 18, 2026", retention: "Current" },
  { id: "minutes", name: "Board Meeting Minutes (12 mo)", ref: "§718.111(12)(g)(2)(e)", status: "compliant", date: "Jan 28, 2026", retention: "Rolling" },
  { id: "budget", name: "Annual Budget 2026", ref: "§718.112(2)(f)", status: "compliant", date: "Dec 10, 2025", retention: "Current" },
  { id: "financial", name: "Annual Financial Report 2025", ref: "§718.111(13)", status: "compliant", date: "Jan 22, 2026", retention: "Current" },
  { id: "insurance", name: "Current Insurance Policies", ref: "§718.111(11)", status: "overdue", date: null, retention: "Current" },
  { id: "contracts", name: "Executory Contracts List", ref: "§718.111(12)(g)(2)", status: "compliant", date: "Jan 20, 2026", retention: "Current" },
  { id: "inspection", name: "Milestone Inspection Reports", ref: "§553.899", status: "compliant", date: "Aug 14, 2024", retention: "15 years" },
  { id: "sirs", name: "Structural Integrity Reserve Study", ref: "§718.112(2)(g)", status: "compliant", date: "Sep 3, 2024", retention: "15 years" },
  { id: "qa", name: "Question & Answer Sheet", ref: "§718.504", status: "pending", date: null, retention: "Current" },
];

const meetings = [
  { id: 1, title: "Board of Directors Meeting", type: "Board", date: "Feb 10, 2026", time: "7:00 PM", location: "Clubhouse", noticeStatus: "compliant" },
  { id: 2, title: "Annual Owners' Meeting", type: "Owner", date: "Mar 15, 2026", time: "6:00 PM", location: "Clubhouse A & B", noticeStatus: "pending" },
  { id: 3, title: "Board of Directors Meeting", type: "Board", date: "Jan 13, 2026", time: "7:00 PM", location: "Clubhouse", noticeStatus: "compliant" },
];

const maintenanceRequests = [
  { id: "MR-0041", title: "Pool pump grinding noise", category: "Pool", priority: "High", status: "in_progress", unit: "108", date: "Jan 29" },
  { id: "MR-0040", title: "Parking garage light — L2", category: "Electrical", priority: "Medium", status: "submitted", unit: "215", date: "Jan 28" },
  { id: "MR-0039", title: "Lobby door not closing", category: "Common Area", priority: "High", status: "in_progress", unit: "205", date: "Jan 25" },
  { id: "MR-0038", title: "Dead shrubs near entrance", category: "Landscaping", priority: "Low", status: "submitted", unit: "312", date: "Jan 22" },
  { id: "MR-0037", title: "HVAC noise — 3rd floor", category: "HVAC", priority: "Medium", status: "completed", unit: "304", date: "Jan 18" },
];

const announcements = [
  { id: 1, title: "Pool Area Closed for Resurfacing", date: "Jan 30, 2026", pinned: true, body: "The pool area will be closed February 3–14 for scheduled resurfacing." },
  { id: 2, title: "Hurricane Season Preparedness", date: "Jan 25, 2026", pinned: false, body: "Please ensure your hurricane shutters are in working order. Workshop scheduled for March 1." },
  { id: 3, title: "Q1 2026 Assessment Due", date: "Jan 15, 2026", pinned: false, body: "Quarterly assessment of $1,250 is due by February 1, 2026." },
];

const portfolioCommunities = [
  { name: "Palm Gardens Condominium", units: 50, compliance: 92, openMR: 4, city: "West Palm Beach" },
  { name: "Seaside Towers", units: 120, compliance: 100, openMR: 12, city: "Fort Lauderdale" },
  { name: "Lakewood Village HOA", units: 200, compliance: 78, openMR: 8, city: "Boca Raton" },
  { name: "Coral Ridge Condos", units: 45, compliance: 100, openMR: 2, city: "Pompano Beach" },
  { name: "Sunrise Palms", units: 88, compliance: 95, openMR: 6, city: "Delray Beach" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENTS — Clean, focused layouts
// ═══════════════════════════════════════════════════════════════════════════════

const ComplianceDashboard = () => {
  const compliant = complianceItems.filter((i) => i.status === "compliant").length;
  const total = complianceItems.length;
  const pct = Math.round((compliant / total) * 100);
  const overdue = complianceItems.filter((i) => i.status === "overdue");
  const pending = complianceItems.filter((i) => i.status === "pending");

  return (
    <div style={{ padding: tokens.space[8] }}>
      {/* Alert Banner */}
      {overdue.length > 0 && (
        <div
          style={{
            backgroundColor: tokens.colors.error.light,
            borderRadius: tokens.radius.lg,
            padding: `${tokens.space[4]} ${tokens.space[5]}`,
            marginBottom: tokens.space[6],
            display: "flex",
            alignItems: "flex-start",
            gap: tokens.space[3],
            border: `1px solid ${tokens.colors.error.base}20`,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: tokens.radius.full,
              backgroundColor: tokens.colors.error.base,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            !
          </div>
          <div>
            <Text size="sm" weight="semibold" style={{ color: tokens.colors.error.dark }}>
              {overdue.length} Compliance Item{overdue.length > 1 ? "s" : ""} Overdue
            </Text>
            <Text size="sm" style={{ color: tokens.colors.error.dark, opacity: 0.8, marginTop: 2 }}>
              {overdue.map((i) => i.name).join(", ")} — Action required to maintain §718 compliance.
            </Text>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[4], marginBottom: tokens.space[8] }}>
        <MetricCard
          label="Compliance Score"
          value={`${pct}%`}
          description={`${compliant} of ${total} items`}
          trend={pct >= 90 ? "up" : "down"}
          change={pct >= 90 ? "On track" : "Action needed"}
        />
        <MetricCard label="Compliant" value={compliant} description="Documents posted" />
        <MetricCard label="Due Soon" value={pending.length} description="Within 30 days" />
        <MetricCard label="Overdue" value={overdue.length} description="Immediate action" />
      </div>

      {/* Compliance Checklist */}
      <Card padding={0}>
        <div
          style={{
            padding: `${tokens.space[5]} ${tokens.space[6]}`,
            borderBottom: `1px solid ${tokens.colors.border.default}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Text size="md" weight="semibold">
              Compliance Checklist
            </Text>
            <Text size="sm" color="secondary" style={{ marginTop: 2 }}>
              Florida Statute §718.111(12)(g) Requirements
            </Text>
          </div>
          <Button variant="secondary" size="sm">
            Export Report
          </Button>
        </div>

        <Table
          columns={[
            { header: "Status", key: "status", render: (v) => <StatusPill status={v} /> },
            {
              header: "Document Requirement",
              key: "name",
              render: (v, row) => (
                <Stack gap={0}>
                  <Text size="sm" weight="medium">
                    {v}
                  </Text>
                  <Text size="xs" color="tertiary" mono>
                    {row.ref}
                  </Text>
                </Stack>
              ),
            },
            { header: "Retention", key: "retention", render: (v) => <Badge variant="outline">{v}</Badge> },
            {
              header: "Last Updated",
              key: "date",
              render: (v) => (
                <Text size="sm" color="secondary">
                  {v || "—"}
                </Text>
              ),
            },
            {
              header: "",
              key: "action",
              align: "right",
              render: (_, row) =>
                row.status !== "compliant" ? (
                  <Button variant="primary" size="sm">
                    Upload
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                ),
            },
          ]}
          data={complianceItems}
        />
      </Card>

      {/* Bottom Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[6], marginTop: tokens.space[6] }}>
        {/* Meeting Notices */}
        <Card padding={0}>
          <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Text size="md" weight="semibold">
              Meeting Notice Compliance
            </Text>
          </div>
          <div style={{ padding: tokens.space[2] }}>
            {meetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </div>
        </Card>

        {/* Deadline Tracker */}
        <Card padding={0}>
          <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Text size="md" weight="semibold">
              30-Day Posting Deadlines
            </Text>
            <Text size="xs" color="secondary" style={{ marginTop: 2 }}>
              Per HB 913 — Documents must be posted within 30 days
            </Text>
          </div>
          <div style={{ padding: tokens.space[4] }}>
            <DeadlineItem name="Insurance Policy Renewal" deadline="Jan 28, 2026" daysLeft={-6} />
            <DeadlineItem name="Q&A Sheet Update" deadline="Feb 18, 2026" daysLeft={15} />
          </div>
        </Card>
      </div>
    </div>
  );
};

const MeetingRow = ({ meeting }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: `${tokens.space[4]} ${tokens.space[4]}`,
        borderRadius: tokens.radius.lg,
        backgroundColor: isHovered ? tokens.colors.bg.secondary : "transparent",
        transition: `background ${tokens.transition.fast}`,
        cursor: "pointer",
      }}
    >
      <Stack direction="row" justify="space-between" align="flex-start">
        <Stack gap={1}>
          <Text size="sm" weight="medium">
            {meeting.title}
          </Text>
          <Text size="xs" color="secondary">
            {meeting.date} · {meeting.time} · {meeting.location}
          </Text>
          <Stack direction="row" gap={2} style={{ marginTop: 4 }}>
            <Badge variant="outline" size="xs">
              {meeting.type}
            </Badge>
          </Stack>
        </Stack>
        <StatusPill status={meeting.noticeStatus} />
      </Stack>
    </div>
  );
};

const DeadlineItem = ({ name, deadline, daysLeft }) => {
  const isOverdue = daysLeft < 0;
  return (
    <div
      style={{
        padding: `${tokens.space[4]} 0`,
        borderBottom: `1px solid ${tokens.colors.border.muted}`,
      }}
    >
      <Stack direction="row" justify="space-between" align="center">
        <Stack gap={1}>
          <Text size="sm" weight="medium">
            {name}
          </Text>
          <Text size="xs" color="secondary">
            Deadline: {deadline}
          </Text>
        </Stack>
        <Text size="sm" weight="semibold" style={{ color: isOverdue ? tokens.colors.error.base : tokens.colors.warning.base }}>
          {isOverdue ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`}
        </Text>
      </Stack>
    </div>
  );
};

const DocumentsView = () => {
  const [activeCategory, setActiveCategory] = useState("All");
  const categories = ["All", "Governing", "Financial", "Minutes", "Structural"];

  const documents = [
    { name: "Declaration of Condominium (2005)", category: "Governing", date: "Jan 15, 2026", size: "2.4 MB" },
    { name: "Bylaws — Amended 2022", category: "Governing", date: "Jan 15, 2026", size: "890 KB" },
    { name: "Articles of Incorporation", category: "Governing", date: "Jan 15, 2026", size: "340 KB" },
    { name: "Rules & Regulations", category: "Governing", date: "Jan 18, 2026", size: "1.1 MB" },
    { name: "Board Minutes — January 2026", category: "Minutes", date: "Jan 28, 2026", size: "156 KB" },
    { name: "Annual Budget 2026", category: "Financial", date: "Dec 10, 2025", size: "780 KB" },
    { name: "Financial Report 2025", category: "Financial", date: "Jan 22, 2026", size: "3.2 MB" },
    { name: "Milestone Inspection (2024)", category: "Structural", date: "Aug 14, 2024", size: "12.8 MB" },
    { name: "SIRS Report (2024)", category: "Structural", date: "Sep 3, 2024", size: "8.4 MB" },
  ];

  const filtered = activeCategory === "All" ? documents : documents.filter((d) => d.category === activeCategory);

  return (
    <div style={{ padding: tokens.space[8] }}>
      {/* Header */}
      <Stack direction="row" justify="space-between" align="center" style={{ marginBottom: tokens.space[6] }}>
        <Stack direction="row" gap={2}>
          {categories.map((c) => (
            <Button key={c} variant={activeCategory === c ? "primary" : "secondary"} size="sm" onClick={() => setActiveCategory(c)}>
              {c}
            </Button>
          ))}
        </Stack>
        <Button>Upload Document</Button>
      </Stack>

      {/* Documents Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4] }}>
        {filtered.map((doc, i) => (
          <DocumentCard key={i} document={doc} />
        ))}
      </div>
    </div>
  );
};

const DocumentCard = ({ document }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Card hover style={{ cursor: "pointer" }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <Stack gap={4}>
        <Stack direction="row" gap={3} align="flex-start">
          <IconCircle>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tokens.colors.fg.secondary} strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          </IconCircle>
          <Stack gap={1} style={{ flex: 1 }}>
            <Text size="sm" weight="medium" style={{ lineHeight: 1.3 }}>
              {document.name}
            </Text>
            <Stack direction="row" gap={2}>
              <Badge variant="outline" size="xs">
                {document.category}
              </Badge>
              <Text size="xs" color="tertiary">
                {document.size}
              </Text>
            </Stack>
          </Stack>
        </Stack>
        <Stack direction="row" justify="space-between" align="center">
          <Text size="xs" color="secondary">
            Posted {document.date}
          </Text>
          <Stack direction="row" gap={2}>
            <Button variant="ghost" size="sm">
              View
            </Button>
            <Button variant="ghost" size="sm">
              ↓
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
};

const MaintenanceView = () => (
  <div style={{ padding: tokens.space[8] }}>
    {/* Metrics */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[4], marginBottom: tokens.space[8] }}>
      <MetricCard label="Open" value="4" description="Active requests" />
      <MetricCard label="In Progress" value="2" description="Being addressed" />
      <MetricCard label="Completed" value="6" description="Last 30 days" />
      <MetricCard label="Avg. Resolution" value="4.2d" description="This month" />
    </div>

    {/* Requests Table */}
    <Card padding={0}>
      <div
        style={{
          padding: `${tokens.space[5]} ${tokens.space[6]}`,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text size="md" weight="semibold">
          Maintenance Requests
        </Text>
        <Button variant="secondary" size="sm">
          Export
        </Button>
      </div>

      <Table
        columns={[
          {
            header: "ID",
            key: "id",
            render: (v) => (
              <Text size="sm" mono style={{ color: tokens.colors.fg.secondary }}>
                {v}
              </Text>
            ),
          },
          {
            header: "Request",
            key: "title",
            render: (v, row) => (
              <Stack gap={1}>
                <Text size="sm" weight="medium">
                  {v}
                </Text>
                <Text size="xs" color="tertiary">
                  Unit {row.unit} · {row.category}
                </Text>
              </Stack>
            ),
          },
          {
            header: "Priority",
            key: "priority",
            render: (v) => (
              <Text size="sm" weight="medium" style={{ color: v === "High" ? tokens.colors.error.base : v === "Medium" ? tokens.colors.warning.base : tokens.colors.fg.secondary }}>
                {v}
              </Text>
            ),
          },
          { header: "Status", key: "status", render: (v) => <StatusPill status={v} /> },
          {
            header: "Date",
            key: "date",
            render: (v) => (
              <Text size="sm" color="secondary">
                {v}
              </Text>
            ),
          },
        ]}
        data={maintenanceRequests}
      />
    </Card>
  </div>
);

const AnnouncementsView = () => (
  <div style={{ padding: tokens.space[8] }}>
    <Stack direction="row" justify="space-between" align="center" style={{ marginBottom: tokens.space[6] }}>
      <div />
      <Button>New Announcement</Button>
    </Stack>

    <Stack gap={4}>
      {announcements.map((a) => (
        <Card key={a.id} hover>
          <Stack gap={3}>
            <Stack direction="row" justify="space-between" align="flex-start">
              <Stack direction="row" gap={3} align="center">
                <Text size="md" weight="semibold">
                  {a.title}
                </Text>
                {a.pinned && (
                  <Badge variant="warning" size="xs">
                    Pinned
                  </Badge>
                )}
              </Stack>
              <Text size="sm" color="secondary">
                {a.date}
              </Text>
            </Stack>
            <Text size="sm" color="secondary" style={{ lineHeight: 1.6 }}>
              {a.body}
            </Text>
            <Stack direction="row" gap={2}>
              <Button variant="ghost" size="sm">
                Edit
              </Button>
              <Button variant="ghost" size="sm">
                Send Email
              </Button>
              <Button variant="ghost" size="sm">
                Push Notify
              </Button>
            </Stack>
          </Stack>
        </Card>
      ))}
    </Stack>
  </div>
);

const OwnersView = () => {
  const owners = [
    { name: "Maria Santos", email: "maria.santos@demo.com", unit: "101", role: "Board President", lastLogin: "Feb 2" },
    { name: "Robert Chen", email: "robert.chen@demo.com", unit: "205", role: "Board Treasurer", lastLogin: "Feb 1" },
    { name: "Linda Thompson", email: "linda.t@demo.com", unit: "312", role: "Board Secretary", lastLogin: "Jan 30" },
    { name: "Sarah Johnson", email: "sarah.j@demo.com", unit: "108", role: "Owner", lastLogin: "Jan 28" },
    { name: "Michael Brown", email: "michael.b@demo.com", unit: "215", role: "Owner", lastLogin: "Jan 15" },
    { name: "Emily Davis", email: "emily.d@demo.com", unit: "304", role: "Renter", lastLogin: "Jan 22" },
  ];

  return (
    <div style={{ padding: tokens.space[8] }}>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4], marginBottom: tokens.space[8] }}>
        <MetricCard label="Registered Owners" value="35" description="70% of 50 units" />
        <MetricCard label="Board Members" value="3" description="All active" />
        <MetricCard label="Renter Accounts" value="4" description="Limited access per §718" />
      </div>

      {/* Owners Table */}
      <Card padding={0}>
        <div
          style={{
            padding: `${tokens.space[5]} ${tokens.space[6]}`,
            borderBottom: `1px solid ${tokens.colors.border.default}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text size="md" weight="semibold">
            Owners & Residents
          </Text>
          <Stack direction="row" gap={2}>
            <Button variant="secondary" size="sm">
              Import CSV
            </Button>
            <Button size="sm">Add Owner</Button>
          </Stack>
        </div>

        <Table
          columns={[
            {
              header: "Name",
              key: "name",
              render: (v, row) => (
                <Stack direction="row" gap={3} align="center">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: tokens.radius.full,
                      backgroundColor: tokens.colors.bg.tertiary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: tokens.font.size.sm,
                      fontWeight: tokens.font.weight.medium,
                      color: tokens.colors.fg.secondary,
                    }}
                  >
                    {v
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <Stack gap={0}>
                    <Text size="sm" weight="medium">
                      {v}
                    </Text>
                    <Text size="xs" color="tertiary">
                      {row.email}
                    </Text>
                  </Stack>
                </Stack>
              ),
            },
            {
              header: "Unit",
              key: "unit",
              render: (v) => (
                <Text size="sm" weight="semibold">
                  {v}
                </Text>
              ),
            },
            {
              header: "Role",
              key: "role",
              render: (v) => (
                <Badge variant={v.includes("Board") ? "default" : v === "Renter" ? "warning" : "outline"} size="sm">
                  {v}
                </Badge>
              ),
            },
            {
              header: "Last Login",
              key: "lastLogin",
              render: (v) => (
                <Text size="sm" color="secondary">
                  {v}
                </Text>
              ),
            },
          ]}
          data={owners}
        />
      </Card>
    </div>
  );
};

const MeetingsView = () => (
  <div style={{ padding: tokens.space[8] }}>
    <Stack direction="row" justify="space-between" align="center" style={{ marginBottom: tokens.space[6] }}>
      <div />
      <Button>Schedule Meeting</Button>
    </Stack>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[6] }}>
      <Card padding={0}>
        <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
          <Text size="md" weight="semibold">
            Upcoming Meetings
          </Text>
        </div>
        <div style={{ padding: tokens.space[2] }}>
          {meetings
            .filter((m) => m.id <= 2)
            .map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
        </div>
      </Card>

      <Card padding={0}>
        <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
          <Text size="md" weight="semibold">
            Past Meetings
          </Text>
        </div>
        <div style={{ padding: tokens.space[2] }}>
          {meetings
            .filter((m) => m.id > 2)
            .map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
        </div>
      </Card>
    </div>
  </div>
);

const PortalHome = () => (
  <div style={{ padding: tokens.space[8] }}>
    {/* Welcome Banner */}
    <div
      style={{
        backgroundColor: tokens.colors.bg.inverse,
        borderRadius: tokens.radius.xl,
        padding: `${tokens.space[8]} ${tokens.space[8]}`,
        marginBottom: tokens.space[8],
      }}
    >
      <Text size="3xl" weight="bold" color="inverse" style={{ letterSpacing: "-0.02em" }}>
        Welcome back, Sarah
      </Text>
      <Text size="md" color="inverse" style={{ opacity: 0.7, marginTop: tokens.space[2] }}>
        Palm Gardens Condominium · Unit 108
      </Text>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: tokens.space[6] }}>
      {/* Announcements */}
      <Card padding={0}>
        <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
          <Text size="md" weight="semibold">
            Recent Announcements
          </Text>
        </div>
        <div style={{ padding: tokens.space[4] }}>
          {announcements.map((a) => (
            <div key={a.id} style={{ padding: `${tokens.space[4]} 0`, borderBottom: `1px solid ${tokens.colors.border.muted}` }}>
              <Stack direction="row" justify="space-between" align="flex-start">
                <Text size="sm" weight="semibold">
                  {a.title}
                </Text>
                <Text size="xs" color="tertiary">
                  {a.date}
                </Text>
              </Stack>
              <Text size="sm" color="secondary" style={{ marginTop: tokens.space[2], lineHeight: 1.5 }}>
                {a.body}
              </Text>
            </div>
          ))}
        </div>
      </Card>

      {/* Sidebar */}
      <Stack gap={4}>
        <Card padding={0}>
          <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Text size="md" weight="semibold">
              Upcoming Meetings
            </Text>
          </div>
          <div style={{ padding: tokens.space[4] }}>
            {meetings.slice(0, 2).map((m) => (
              <div key={m.id} style={{ padding: `${tokens.space[3]} 0`, borderBottom: `1px solid ${tokens.colors.border.muted}` }}>
                <Text size="sm" weight="medium">
                  {m.title}
                </Text>
                <Text size="xs" color="secondary" style={{ marginTop: 2 }}>
                  {m.date} · {m.time}
                </Text>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Text size="sm" weight="semibold" style={{ marginBottom: tokens.space[3] }}>
            Quick Links
          </Text>
          <Stack gap={2}>
            {["View Documents", "Submit Request", "My Profile"].map((link) => (
              <Text key={link} size="sm" style={{ color: tokens.colors.fg.secondary, cursor: "pointer" }}>
                {link} →
              </Text>
            ))}
          </Stack>
        </Card>
      </Stack>
    </div>
  </div>
);

const PMPortfolio = () => (
  <div style={{ padding: tokens.space[8] }}>
    {/* Metrics */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[4], marginBottom: tokens.space[8] }}>
      <MetricCard label="Communities" value="5" description="Under management" />
      <MetricCard label="Total Units" value="503" description="Across portfolio" />
      <MetricCard label="Avg Compliance" value="93%" description="Portfolio-wide" trend="up" change="2%" />
      <MetricCard label="Open Requests" value="32" description="All communities" />
    </div>

    {/* Communities Table */}
    <Card padding={0}>
      <div
        style={{
          padding: `${tokens.space[5]} ${tokens.space[6]}`,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text size="md" weight="semibold">
          Managed Communities
        </Text>
        <Button size="sm">Add Community</Button>
      </div>

      <Table
        columns={[
          {
            header: "Community",
            key: "name",
            render: (v, row) => (
              <Stack gap={0}>
                <Text size="sm" weight="medium">
                  {v}
                </Text>
                <Text size="xs" color="tertiary">
                  {row.city} · {row.units} units
                </Text>
              </Stack>
            ),
          },
          {
            header: "Compliance",
            key: "compliance",
            render: (v) => (
              <Stack direction="row" gap={3} align="center" style={{ minWidth: 120 }}>
                <ProgressBar value={v} size="sm" />
                <Text size="sm" weight="semibold" style={{ color: v === 100 ? tokens.colors.success.base : v >= 90 ? tokens.colors.warning.base : tokens.colors.error.base }}>
                  {v}%
                </Text>
              </Stack>
            ),
          },
          {
            header: "Open Requests",
            key: "openMR",
            render: (v) => (
              <Text size="sm" color="secondary">
                {v}
              </Text>
            ),
          },
          {
            header: "",
            key: "action",
            align: "right",
            render: () => (
              <Button variant="ghost" size="sm">
                Manage →
              </Button>
            ),
          },
        ]}
        data={portfolioCommunities}
      />
    </Card>
  </div>
);

const PMWhiteLabel = () => {
  const [primaryColor, setPrimaryColor] = useState("#0F4C75");

  return (
    <div style={{ padding: tokens.space[8] }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: tokens.space[8] }}>
        {/* Settings Panel */}
        <Stack gap={6}>
          <Card>
            <Text size="lg" weight="semibold" style={{ marginBottom: tokens.space[5] }}>
              Company Branding
            </Text>

            <Stack gap={5}>
              <div>
                <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2] }}>Company Name</Text>
                <input
                  type="text"
                  defaultValue="Sunshine Property Management"
                  style={{
                    width: "100%",
                    padding: `${tokens.space[3]} ${tokens.space[4]}`,
                    border: `1px solid ${tokens.colors.border.default}`,
                    borderRadius: tokens.radius.md,
                    fontSize: tokens.font.size.sm,
                    fontFamily: tokens.font.family.sans,
                  }}
                />
              </div>

              <div>
                <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2] }}>Company Logo</Text>
                <div style={{
                  border: `2px dashed ${tokens.colors.border.default}`,
                  borderRadius: tokens.radius.lg,
                  padding: tokens.space[6],
                  textAlign: "center",
                }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    backgroundColor: tokens.colors.bg.tertiary,
                    borderRadius: tokens.radius.lg,
                    margin: "0 auto",
                    marginBottom: tokens.space[3],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 24 }}>🏢</span>
                  </div>
                  <Text size="sm" color="secondary">Drop logo here or click to upload</Text>
                  <Text size="xs" color="tertiary" style={{ marginTop: tokens.space[1] }}>PNG or SVG, max 2MB</Text>
                </div>
              </div>

              <div>
                <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2] }}>Primary Color</Text>
                <Stack direction="row" gap={3}>
                  {["#0F4C75", "#1E3A5F", "#2E7D32", "#5D4037", "#6A1B9A", "#C62828"].map(color => (
                    <button
                      key={color}
                      onClick={() => setPrimaryColor(color)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: tokens.radius.md,
                        backgroundColor: color,
                        border: primaryColor === color ? "3px solid #000" : "none",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: tokens.radius.md,
                    border: `1px solid ${tokens.colors.border.default}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}>
                    <Text size="lg">+</Text>
                  </div>
                </Stack>
              </div>
            </Stack>
          </Card>

          <Card>
            <Text size="lg" weight="semibold" style={{ marginBottom: tokens.space[5] }}>
              Custom Domain
            </Text>

            <Stack gap={4}>
              <div>
                <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2] }}>Default Subdomain</Text>
                <Stack direction="row" gap={2} align="center">
                  <input
                    type="text"
                    defaultValue="sunshine"
                    style={{
                      padding: `${tokens.space[3]} ${tokens.space[4]}`,
                      border: `1px solid ${tokens.colors.border.default}`,
                      borderRadius: tokens.radius.md,
                      fontSize: tokens.font.size.sm,
                      fontFamily: tokens.font.family.sans,
                      width: 200,
                    }}
                  />
                  <Text size="sm" color="secondary">.propertyprofl.com</Text>
                </Stack>
              </div>

              <div style={{
                backgroundColor: tokens.colors.bg.secondary,
                borderRadius: tokens.radius.lg,
                padding: tokens.space[4],
              }}>
                <Stack direction="row" gap={3} align="flex-start">
                  <span style={{ fontSize: 16 }}>💡</span>
                  <div>
                    <Text size="sm" weight="medium">Custom Domain Available</Text>
                    <Text size="sm" color="secondary" style={{ marginTop: tokens.space[1] }}>
                      Point your own domain (e.g., portal.sunshinepm.com) to PropertyPro for a fully branded experience.
                    </Text>
                  </div>
                </Stack>
              </div>
            </Stack>
          </Card>

          <Card>
            <Text size="lg" weight="semibold" style={{ marginBottom: tokens.space[5] }}>
              Email Templates
            </Text>

            <Stack gap={4}>
              {[
                { name: "Welcome Email", desc: "Sent when new owner accounts are created" },
                { name: "Meeting Notice", desc: "Sent with meeting announcements" },
                { name: "Maintenance Update", desc: "Sent when request status changes" },
              ].map((template, i) => (
                <Stack key={i} direction="row" justify="space-between" align="center" style={{
                  padding: tokens.space[4],
                  backgroundColor: tokens.colors.bg.secondary,
                  borderRadius: tokens.radius.lg,
                }}>
                  <Stack gap={0}>
                    <Text size="sm" weight="medium">{template.name}</Text>
                    <Text size="xs" color="secondary">{template.desc}</Text>
                  </Stack>
                  <Button variant="secondary" size="sm">Customize</Button>
                </Stack>
              ))}
            </Stack>
          </Card>
        </Stack>

        {/* Live Preview */}
        <Stack gap={4}>
          <Text size="sm" weight="semibold" color="secondary">LIVE PREVIEW</Text>

          <Card padding={0} style={{ overflow: "hidden" }}>
            {/* Preview Header */}
            <div style={{
              backgroundColor: primaryColor,
              padding: tokens.space[4],
              display: "flex",
              alignItems: "center",
              gap: tokens.space[3],
            }}>
              <div style={{
                width: 32,
                height: 32,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: tokens.radius.md,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <span style={{ fontSize: 14 }}>🏢</span>
              </div>
              <Text size="sm" weight="semibold" color="inverse">Sunshine Property Management</Text>
            </div>

            {/* Preview Content */}
            <div style={{ padding: tokens.space[4] }}>
              <Text size="sm" weight="semibold" style={{ marginBottom: tokens.space[3] }}>
                Your Communities
              </Text>
              {["Palm Gardens Condos", "Seaside Towers", "Lakewood HOA"].map((name, i) => (
                <div key={i} style={{
                  padding: tokens.space[3],
                  borderBottom: `1px solid ${tokens.colors.border.muted}`,
                }}>
                  <Stack direction="row" justify="space-between" align="center">
                    <Text size="sm">{name}</Text>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: i === 2 ? tokens.colors.warning.base : tokens.colors.success.base,
                    }} />
                  </Stack>
                </div>
              ))}
            </div>

            {/* Preview Footer */}
            <div style={{
              padding: tokens.space[3],
              backgroundColor: tokens.colors.bg.secondary,
              textAlign: "center",
            }}>
              <Text size="xs" color="tertiary">
                Powered by PropertyPro Florida
              </Text>
            </div>
          </Card>

          <Card padding={0} style={{ overflow: "hidden" }}>
            <div style={{
              backgroundColor: primaryColor,
              padding: `${tokens.space[8]} ${tokens.space[4]}`,
              textAlign: "center",
            }}>
              <Text size="lg" weight="bold" color="inverse">Palm Gardens Condominium</Text>
              <Text size="xs" color="inverse" style={{ opacity: 0.7, marginTop: tokens.space[1] }}>
                Managed by Sunshine PM
              </Text>
            </div>
            <div style={{ padding: tokens.space[4] }}>
              <Text size="xs" weight="semibold" color="tertiary" style={{ marginBottom: tokens.space[2] }}>
                OWNER PORTAL PREVIEW
              </Text>
              {["Dashboard", "Documents", "Meetings", "Maintenance"].map((item, i) => (
                <div key={i} style={{
                  padding: `${tokens.space[2]} 0`,
                  borderBottom: i < 3 ? `1px solid ${tokens.colors.border.muted}` : "none",
                }}>
                  <Text size="sm">{item}</Text>
                </div>
              ))}
            </div>
          </Card>
        </Stack>
      </div>

      <Stack direction="row" gap={4} justify="flex-end" style={{ marginTop: tokens.space[6] }}>
        <Button variant="secondary">Reset to Defaults</Button>
        <Button>Save Branding</Button>
      </Stack>
    </div>
  );
};

const PMCompliance = () => (
  <div style={{ padding: tokens.space[8] }}>
    <Card padding={0}>
      <div style={{ padding: `${tokens.space[5]} ${tokens.space[6]}`, borderBottom: `1px solid ${tokens.colors.border.default}` }}>
        <Text size="md" weight="semibold">
          Portfolio Compliance Overview
        </Text>
      </div>
      <div style={{ padding: tokens.space[6] }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: tokens.space[4] }}>
          {portfolioCommunities.map((c, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${tokens.colors.border.default}`,
                borderRadius: tokens.radius.xl,
                padding: tokens.space[5],
                textAlign: "center",
                backgroundColor: c.compliance === 100 ? tokens.colors.success.light : c.compliance >= 90 ? tokens.colors.warning.light : tokens.colors.error.light,
              }}
            >
              <Text
                size="4xl"
                weight="bold"
                style={{
                  color: c.compliance === 100 ? tokens.colors.success.dark : c.compliance >= 90 ? tokens.colors.warning.dark : tokens.colors.error.dark,
                  letterSpacing: "-0.02em",
                }}
              >
                {c.compliance}%
              </Text>
              <Text size="sm" weight="semibold" style={{ marginTop: tokens.space[2] }}>
                {c.name}
              </Text>
              <Text size="xs" color="secondary" style={{ marginTop: tokens.space[1] }}>
                {c.units} units
              </Text>
            </div>
          ))}
        </div>
      </div>
    </Card>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE APP PREVIEW — Key differentiator per strategy docs
// ═══════════════════════════════════════════════════════════════════════════════

const MobileAppPreview = () => {
  const [activeScreen, setActiveScreen] = useState("home");

  const PhoneFrame = ({ children }) => (
    <div style={{
      width: 280,
      height: 580,
      backgroundColor: "#000",
      borderRadius: 36,
      padding: 8,
      boxShadow: tokens.shadow.xl,
    }}>
      <div style={{
        width: "100%",
        height: "100%",
        backgroundColor: tokens.colors.bg.primary,
        borderRadius: 28,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Status Bar */}
        <div style={{
          height: 44,
          backgroundColor: tokens.colors.bg.inverse,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px",
        }}>
          <div style={{ width: 80, height: 24, backgroundColor: "#000", borderRadius: 12 }} />
        </div>
        {children}
      </div>
    </div>
  );

  const MobileNav = () => (
    <div style={{
      height: 64,
      backgroundColor: tokens.colors.bg.primary,
      borderTop: `1px solid ${tokens.colors.border.default}`,
      display: "flex",
      justifyContent: "space-around",
      alignItems: "center",
      padding: "0 8px",
    }}>
      {[
        { id: "home", icon: "◎", label: "Home" },
        { id: "docs", icon: "◩", label: "Docs" },
        { id: "request", icon: "◐", label: "Request" },
        { id: "notify", icon: "◈", label: "Alerts" },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => setActiveScreen(item.id)}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: 8,
            cursor: "pointer",
            opacity: activeScreen === item.id ? 1 : 0.5,
          }}
        >
          <span style={{ fontSize: 18 }}>{item.icon}</span>
          <Text size="xs" weight={activeScreen === item.id ? "semibold" : "normal"}>
            {item.label}
          </Text>
        </button>
      ))}
    </div>
  );

  const MobileHome = () => (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{
        backgroundColor: tokens.colors.bg.inverse,
        padding: tokens.space[5],
        paddingTop: tokens.space[2],
      }}>
        <Text size="lg" weight="bold" color="inverse">Palm Gardens</Text>
        <Text size="xs" color="inverse" style={{ opacity: 0.7 }}>Unit 108 · Sarah Johnson</Text>
      </div>

      <div style={{ padding: tokens.space[4] }}>
        <div style={{
          backgroundColor: tokens.colors.warning.light,
          borderRadius: tokens.radius.lg,
          padding: tokens.space[4],
          marginBottom: tokens.space[4],
        }}>
          <Stack direction="row" gap={3} align="center">
            <span style={{ fontSize: 20 }}>🔔</span>
            <Stack gap={1}>
              <Text size="sm" weight="semibold">Board Meeting Feb 10</Text>
              <Text size="xs" color="secondary">7:00 PM · Clubhouse</Text>
            </Stack>
          </Stack>
        </div>

        <Text size="xs" weight="semibold" color="tertiary" style={{ marginBottom: tokens.space[3], letterSpacing: "0.05em" }}>
          RECENT
        </Text>

        {[
          { title: "Pool Closed for Resurfacing", time: "2h ago", icon: "📢" },
          { title: "Q1 Assessment Due Feb 1", time: "5d ago", icon: "💰" },
        ].map((item, i) => (
          <div key={i} style={{
            padding: `${tokens.space[3]} 0`,
            borderBottom: `1px solid ${tokens.colors.border.muted}`,
          }}>
            <Stack direction="row" gap={3} align="center">
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <Stack gap={0} style={{ flex: 1 }}>
                <Text size="sm" weight="medium">{item.title}</Text>
                <Text size="xs" color="tertiary">{item.time}</Text>
              </Stack>
            </Stack>
          </div>
        ))}
      </div>
    </div>
  );

  const MobileRequest = () => (
    <div style={{ flex: 1, padding: tokens.space[4] }}>
      <Text size="lg" weight="semibold" style={{ marginBottom: tokens.space[4] }}>
        New Request
      </Text>

      <Stack gap={4}>
        <div>
          <Text size="xs" weight="medium" color="secondary" style={{ marginBottom: tokens.space[2] }}>Category</Text>
          <div style={{
            border: `1px solid ${tokens.colors.border.default}`,
            borderRadius: tokens.radius.md,
            padding: tokens.space[3],
          }}>
            <Text size="sm">Plumbing</Text>
          </div>
        </div>

        <div>
          <Text size="xs" weight="medium" color="secondary" style={{ marginBottom: tokens.space[2] }}>Description</Text>
          <div style={{
            border: `1px solid ${tokens.colors.border.default}`,
            borderRadius: tokens.radius.md,
            padding: tokens.space[3],
            minHeight: 80,
          }}>
            <Text size="sm" color="tertiary">Describe the issue...</Text>
          </div>
        </div>

        <div style={{
          border: `2px dashed ${tokens.colors.border.default}`,
          borderRadius: tokens.radius.lg,
          padding: tokens.space[5],
          textAlign: "center",
        }}>
          <Text size="sm" color="secondary">📷 Add Photos</Text>
        </div>

        <Button style={{ width: "100%", marginTop: tokens.space[2] }}>
          Submit Request
        </Button>
      </Stack>
    </div>
  );

  const MobileNotifications = () => (
    <div style={{ flex: 1 }}>
      <div style={{ padding: tokens.space[4], borderBottom: `1px solid ${tokens.colors.border.default}` }}>
        <Text size="lg" weight="semibold">Notifications</Text>
      </div>
      <div style={{ padding: tokens.space[4] }}>
        {[
          { title: "Pool Area Closed", body: "Feb 3-14 for resurfacing", time: "2h", unread: true },
          { title: "Meeting Notice Posted", body: "Board meeting Feb 10 at 7 PM", time: "1d", unread: true },
          { title: "Assessment Reminder", body: "Q1 payment due Feb 1", time: "5d", unread: false },
          { title: "Request Update", body: "Your HVAC request completed", time: "1w", unread: false },
        ].map((n, i) => (
          <div key={i} style={{
            padding: `${tokens.space[3]} 0`,
            borderBottom: `1px solid ${tokens.colors.border.muted}`,
            opacity: n.unread ? 1 : 0.6,
          }}>
            <Stack direction="row" justify="space-between" align="flex-start">
              <Stack gap={1} style={{ flex: 1 }}>
                <Stack direction="row" gap={2} align="center">
                  {n.unread && <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: tokens.colors.accent.base }} />}
                  <Text size="sm" weight="semibold">{n.title}</Text>
                </Stack>
                <Text size="xs" color="secondary">{n.body}</Text>
              </Stack>
              <Text size="xs" color="tertiary">{n.time}</Text>
            </Stack>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: tokens.space[8], backgroundColor: tokens.colors.bg.secondary, minHeight: "100%" }}>
      <Stack direction="row" gap={10} justify="center" align="flex-start">
        {/* Phone Preview */}
        <PhoneFrame>
          {activeScreen === "home" && <MobileHome />}
          {activeScreen === "docs" && (
            <div style={{ flex: 1, padding: tokens.space[4] }}>
              <Text size="lg" weight="semibold" style={{ marginBottom: tokens.space[4] }}>Documents</Text>
              {["Declaration", "Bylaws", "Rules", "Budget 2026", "Minutes"].map((doc, i) => (
                <div key={i} style={{ padding: `${tokens.space[3]} 0`, borderBottom: `1px solid ${tokens.colors.border.muted}` }}>
                  <Stack direction="row" gap={3} align="center">
                    <IconCircle size={32}><span style={{ fontSize: 12 }}>📄</span></IconCircle>
                    <Text size="sm" weight="medium">{doc}</Text>
                  </Stack>
                </div>
              ))}
            </div>
          )}
          {activeScreen === "request" && <MobileRequest />}
          {activeScreen === "notify" && <MobileNotifications />}
          <MobileNav />
        </PhoneFrame>

        {/* Feature Callouts */}
        <Stack gap={6} style={{ maxWidth: 400, paddingTop: tokens.space[8] }}>
          <div>
            <Badge variant="success" size="sm" style={{ marginBottom: tokens.space[3] }}>Key Differentiator</Badge>
            <Text as="h2" size="3xl" weight="bold" style={{ letterSpacing: "-0.02em", marginBottom: tokens.space[3] }}>
              Native Mobile App
            </Text>
            <Text size="md" color="secondary" style={{ lineHeight: 1.6 }}>
              Florida Statute §718 allows compliance via mobile app. Most competitors only offer websites —
              our native iOS and Android app is a major differentiator.
            </Text>
          </div>

          <Stack gap={4}>
            {[
              { icon: "🔔", title: "Push Notifications", desc: "Meeting notices, announcements, request updates delivered instantly" },
              { icon: "📱", title: "Offline Access", desc: "View cached documents without internet connection" },
              { icon: "📷", title: "Photo Attachments", desc: "Submit maintenance requests with photos directly from camera" },
              { icon: "⚡", title: "Instant Updates", desc: "Real-time status changes for maintenance requests" },
            ].map((f, i) => (
              <Stack key={i} direction="row" gap={4} align="flex-start">
                <IconCircle size={40} bg={tokens.colors.bg.tertiary}>
                  <span style={{ fontSize: 16 }}>{f.icon}</span>
                </IconCircle>
                <Stack gap={1}>
                  <Text size="sm" weight="semibold">{f.title}</Text>
                  <Text size="sm" color="secondary">{f.desc}</Text>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Stack>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SELF-SERVICE SIGNUP FLOW — Onboarding experience
// ═══════════════════════════════════════════════════════════════════════════════

const SignupFlow = () => {
  const [step, setStep] = useState(1);

  const StepIndicator = () => (
    <Stack direction="row" gap={2} align="center" justify="center" style={{ marginBottom: tokens.space[8] }}>
      {[1, 2, 3, 4].map(s => (
        <Stack key={s} direction="row" gap={2} align="center">
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            backgroundColor: s <= step ? tokens.colors.accent.base : tokens.colors.bg.tertiary,
            color: s <= step ? tokens.colors.fg.inverse : tokens.colors.fg.secondary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: tokens.font.size.sm,
            fontWeight: tokens.font.weight.semibold,
          }}>
            {s < step ? "✓" : s}
          </div>
          {s < 4 && <div style={{ width: 40, height: 2, backgroundColor: s < step ? tokens.colors.accent.base : tokens.colors.border.default }} />}
        </Stack>
      ))}
    </Stack>
  );

  const FormField = ({ label, placeholder, type = "text", required = false }) => (
    <div style={{ marginBottom: tokens.space[4] }}>
      <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2], display: "block" }}>
        {label} {required && <span style={{ color: tokens.colors.error.base }}>*</span>}
      </Text>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: `${tokens.space[3]} ${tokens.space[4]}`,
          border: `1px solid ${tokens.colors.border.default}`,
          borderRadius: tokens.radius.md,
          fontSize: tokens.font.size.sm,
          fontFamily: tokens.font.family.sans,
          outline: "none",
        }}
      />
    </div>
  );

  const Step1 = () => (
    <Stack gap={6}>
      <div style={{ textAlign: "center" }}>
        <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[2] }}>
          Let's get started
        </Text>
        <Text color="secondary">Tell us about your association</Text>
      </div>

      <Card>
        <Stack gap={4}>
          <FormField label="Association Name" placeholder="Palm Gardens Condominium Association" required />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[4] }}>
            <div>
              <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2], display: "block" }}>
                Association Type <span style={{ color: tokens.colors.error.base }}>*</span>
              </Text>
              <select style={{
                width: "100%",
                padding: `${tokens.space[3]} ${tokens.space[4]}`,
                border: `1px solid ${tokens.colors.border.default}`,
                borderRadius: tokens.radius.md,
                fontSize: tokens.font.size.sm,
                fontFamily: tokens.font.family.sans,
                backgroundColor: "#fff",
              }}>
                <option>Condominium (§718)</option>
                <option>HOA (§720)</option>
              </select>
            </div>
            <FormField label="Number of Units" placeholder="50" type="number" required />
          </div>

          <FormField label="Street Address" placeholder="1500 Palm Gardens Drive" required />

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: tokens.space[4] }}>
            <FormField label="City" placeholder="West Palm Beach" required />
            <FormField label="State" placeholder="FL" required />
            <FormField label="ZIP" placeholder="33401" required />
          </div>

          <div>
            <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2], display: "block" }}>
              County <span style={{ color: tokens.colors.error.base }}>*</span>
            </Text>
            <select style={{
              width: "100%",
              padding: `${tokens.space[3]} ${tokens.space[4]}`,
              border: `1px solid ${tokens.colors.border.default}`,
              borderRadius: tokens.radius.md,
              fontSize: tokens.font.size.sm,
              fontFamily: tokens.font.family.sans,
              backgroundColor: "#fff",
            }}>
              <option>Palm Beach County</option>
              <option>Broward County</option>
              <option>Miami-Dade County</option>
              <option>Other Florida County</option>
            </select>
          </div>
        </Stack>
      </Card>
    </Stack>
  );

  const Step2 = () => (
    <Stack gap={6}>
      <div style={{ textAlign: "center" }}>
        <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[2] }}>
          Your contact info
        </Text>
        <Text color="secondary">We'll use this to set up your admin account</Text>
      </div>

      <Card>
        <Stack gap={4}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[4] }}>
            <FormField label="First Name" placeholder="Maria" required />
            <FormField label="Last Name" placeholder="Santos" required />
          </div>
          <FormField label="Email Address" placeholder="maria@palmgardens.org" type="email" required />
          <FormField label="Phone Number" placeholder="(561) 555-0123" type="tel" />

          <div>
            <Text size="sm" weight="medium" style={{ marginBottom: tokens.space[2], display: "block" }}>
              Your Role <span style={{ color: tokens.colors.error.base }}>*</span>
            </Text>
            <select style={{
              width: "100%",
              padding: `${tokens.space[3]} ${tokens.space[4]}`,
              border: `1px solid ${tokens.colors.border.default}`,
              borderRadius: tokens.radius.md,
              fontSize: tokens.font.size.sm,
              fontFamily: tokens.font.family.sans,
              backgroundColor: "#fff",
            }}>
              <option>Board President</option>
              <option>Board Treasurer</option>
              <option>Board Secretary</option>
              <option>Board Member</option>
              <option>Community Association Manager (CAM)</option>
            </select>
          </div>
        </Stack>
      </Card>
    </Stack>
  );

  const Step3 = () => (
    <Stack gap={6}>
      <div style={{ textAlign: "center" }}>
        <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[2] }}>
          Choose your plan
        </Text>
        <Text color="secondary">All plans include 14-day free trial. Cancel anytime.</Text>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[4] }}>
        <Card hover style={{ cursor: "pointer", border: `2px solid ${tokens.colors.border.default}` }}>
          <Stack gap={4}>
            <div>
              <Text size="lg" weight="bold">Compliance Basic</Text>
              <Text size="sm" color="secondary">Web portal only</Text>
            </div>
            <div>
              <Text size="4xl" weight="bold" style={{ letterSpacing: "-0.02em" }}>$99</Text>
              <Text size="sm" color="secondary">/month</Text>
            </div>
            <Stack gap={2}>
              {["Public website with notices", "Password-protected portal", "Document management", "Meeting notice tracking", "Compliance dashboard", "Email support"].map((f, i) => (
                <Stack key={i} direction="row" gap={2} align="center">
                  <span style={{ color: tokens.colors.success.base }}>✓</span>
                  <Text size="sm">{f}</Text>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Card>

        <Card hover style={{ cursor: "pointer", border: `2px solid ${tokens.colors.accent.base}`, position: "relative" }}>
          <div style={{
            position: "absolute",
            top: -12,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: tokens.colors.accent.base,
            color: tokens.colors.fg.inverse,
            padding: `${tokens.space[1]} ${tokens.space[3]}`,
            borderRadius: tokens.radius.full,
            fontSize: tokens.font.size.xs,
            fontWeight: tokens.font.weight.semibold,
          }}>
            RECOMMENDED
          </div>
          <Stack gap={4}>
            <div>
              <Text size="lg" weight="bold">Compliance + Mobile</Text>
              <Text size="sm" color="secondary">Web + native app</Text>
            </div>
            <div>
              <Text size="4xl" weight="bold" style={{ letterSpacing: "-0.02em" }}>$199</Text>
              <Text size="sm" color="secondary">/month + $1,500 setup</Text>
            </div>
            <Stack gap={2}>
              {["Everything in Basic", "iOS & Android mobile app", "Push notifications", "Maintenance requests", "Owner self-service", "Priority support"].map((f, i) => (
                <Stack key={i} direction="row" gap={2} align="center">
                  <span style={{ color: tokens.colors.success.base }}>✓</span>
                  <Text size="sm" weight={i === 0 ? "semibold" : "normal"}>{f}</Text>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Card>
      </div>
    </Stack>
  );

  const Step4 = () => (
    <Stack gap={6}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: tokens.colors.success.light,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto",
          marginBottom: tokens.space[4],
        }}>
          <span style={{ fontSize: 28, color: tokens.colors.success.base }}>✓</span>
        </div>
        <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[2] }}>
          You're all set!
        </Text>
        <Text color="secondary">Your compliance checklist is ready</Text>
      </div>

      <Card style={{ backgroundColor: tokens.colors.bg.secondary }}>
        <Stack gap={4}>
          <Stack direction="row" justify="space-between" align="center">
            <Text size="md" weight="semibold">Your Compliance Status</Text>
            <Badge variant="warning">Action Needed</Badge>
          </Stack>

          <div style={{
            backgroundColor: tokens.colors.bg.primary,
            borderRadius: tokens.radius.lg,
            padding: tokens.space[4],
          }}>
            <Stack direction="row" gap={4} align="center">
              <div style={{ flex: 1 }}>
                <ProgressBar value={0} max={100} size="lg" />
              </div>
              <Text size="2xl" weight="bold">0%</Text>
            </Stack>
            <Text size="sm" color="secondary" style={{ marginTop: tokens.space[2] }}>
              0 of 12 required documents uploaded
            </Text>
          </div>

          <Text size="sm" color="secondary">
            Next: Upload your governing documents to start achieving compliance with Florida Statute §718.111(12)(g).
          </Text>
        </Stack>
      </Card>

      <Card>
        <Text size="sm" weight="semibold" style={{ marginBottom: tokens.space[3] }}>
          What happens next:
        </Text>
        <Stack gap={3}>
          {[
            { num: "1", text: "Upload your Declaration, Bylaws, and Articles of Incorporation" },
            { num: "2", text: "Import your owner list via CSV or add manually" },
            { num: "3", text: "Owners receive login credentials via email" },
            { num: "4", text: "Your public website goes live automatically" },
          ].map((item, i) => (
            <Stack key={i} direction="row" gap={3} align="flex-start">
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: tokens.colors.bg.tertiary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: tokens.font.size.xs,
                fontWeight: tokens.font.weight.semibold,
                flexShrink: 0,
              }}>
                {item.num}
              </div>
              <Text size="sm">{item.text}</Text>
            </Stack>
          ))}
        </Stack>
      </Card>
    </Stack>
  );

  return (
    <div style={{ padding: tokens.space[8], backgroundColor: tokens.colors.bg.secondary, minHeight: "100%" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <StepIndicator />

        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 />}

        <Stack direction="row" gap={4} justify="space-between" style={{ marginTop: tokens.space[8] }}>
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              ← Back
            </Button>
          ) : <div />}

          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>
              Continue →
            </Button>
          ) : (
            <Button>
              Go to Dashboard →
            </Button>
          )}
        </Stack>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHAMPION-ARMING MATERIALS — Board Presentation View
// ═══════════════════════════════════════════════════════════════════════════════

const BoardPresentationView = () => (
  <div style={{ padding: tokens.space[8], backgroundColor: tokens.colors.bg.secondary, minHeight: "100%" }}>
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <Stack direction="row" justify="space-between" align="center" style={{ marginBottom: tokens.space[8] }}>
        <div>
          <Badge variant="outline" size="sm" style={{ marginBottom: tokens.space[2] }}>Champion Materials</Badge>
          <Text as="h1" size="3xl" weight="bold" style={{ letterSpacing: "-0.02em" }}>
            Present to Your Board
          </Text>
          <Text color="secondary" style={{ marginTop: tokens.space[2] }}>
            Everything you need to get board approval for PropertyPro
          </Text>
        </div>
        <Stack direction="row" gap={3}>
          <Button variant="secondary">Download PDF</Button>
          <Button>Share Link</Button>
        </Stack>
      </Stack>

      {/* Slide-style Cards */}
      <Stack gap={6}>
        {/* Slide 1: The Problem */}
        <Card padding={8}>
          <Badge variant="error" size="sm" style={{ marginBottom: tokens.space[4] }}>The Problem</Badge>
          <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[4] }}>
            Florida Law Now Requires a Compliant Website
          </Text>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[6] }}>
            <Stack gap={4}>
              <Text size="md" style={{ lineHeight: 1.6 }}>
                As of <strong>January 1, 2026</strong>, Florida Statute §718.111(12)(g) requires all condominium
                associations with <strong>25+ units</strong> to maintain a website or mobile app with:
              </Text>
              <Stack gap={2}>
                {[
                  "Password-protected owner portal",
                  "12 categories of statutory documents",
                  "Meeting notices posted 14 days in advance",
                  "Unique login for each unit owner",
                ].map((item, i) => (
                  <Stack key={i} direction="row" gap={2} align="center">
                    <span style={{ color: tokens.colors.error.base }}>!</span>
                    <Text size="sm">{item}</Text>
                  </Stack>
                ))}
              </Stack>
            </Stack>
            <div style={{
              backgroundColor: tokens.colors.error.light,
              borderRadius: tokens.radius.xl,
              padding: tokens.space[6],
              textAlign: "center",
            }}>
              <Text size="5xl" weight="bold" style={{ color: tokens.colors.error.dark, letterSpacing: "-0.02em" }}>
                $50
              </Text>
              <Text size="md" weight="semibold" style={{ color: tokens.colors.error.dark }}>
                per day in penalties
              </Text>
              <Text size="sm" color="secondary" style={{ marginTop: tokens.space[2] }}>
                for willful non-compliance with records requests
              </Text>
            </div>
          </div>
        </Card>

        {/* Slide 2: The Solution */}
        <Card padding={8}>
          <Badge variant="success" size="sm" style={{ marginBottom: tokens.space[4] }}>The Solution</Badge>
          <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[4] }}>
            PropertyPro Handles Compliance for You
          </Text>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4] }}>
            {[
              { icon: "◎", title: "Compliance Dashboard", desc: "Track all 12 statutory requirements in one place" },
              { icon: "◷", title: "Auto-Deadlines", desc: "Never miss a 30-day posting or meeting notice deadline" },
              { icon: "◩", title: "Document Portal", desc: "Secure, password-protected access for all owners" },
              { icon: "📱", title: "Mobile App", desc: "iOS & Android app with push notifications" },
              { icon: "◈", title: "Meeting Notices", desc: "14-day/48-hour notices tracked automatically" },
              { icon: "◐", title: "Maintenance", desc: "Track and manage owner requests" },
            ].map((item, i) => (
              <div key={i} style={{
                backgroundColor: tokens.colors.bg.secondary,
                borderRadius: tokens.radius.lg,
                padding: tokens.space[5],
              }}>
                <IconCircle size={40} bg={tokens.colors.bg.tertiary}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                </IconCircle>
                <Text size="sm" weight="semibold" style={{ marginTop: tokens.space[3] }}>{item.title}</Text>
                <Text size="xs" color="secondary" style={{ marginTop: tokens.space[1] }}>{item.desc}</Text>
              </div>
            ))}
          </div>
        </Card>

        {/* Slide 3: Cost Comparison */}
        <Card padding={8}>
          <Badge variant="warning" size="sm" style={{ marginBottom: tokens.space[4] }}>Cost Analysis</Badge>
          <Text as="h2" size="2xl" weight="bold" style={{ marginBottom: tokens.space[4] }}>
            Less Than $4/unit/month
          </Text>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[6] }}>
            <div>
              <Table
                columns={[
                  { header: "Option", key: "option" },
                  { header: "Monthly Cost", key: "cost", align: "right" },
                ]}
                data={[
                  { option: "Build it yourself", cost: "$3,000-10,000 setup + maintenance" },
                  { option: "Hire a CAM firm", cost: "$500-1,500/month" },
                  { option: "Generic website builder", cost: "$50-100 + no compliance tracking" },
                  { option: "PropertyPro", cost: "$199/month" },
                ]}
              />
            </div>
            <div style={{
              backgroundColor: tokens.colors.success.light,
              borderRadius: tokens.radius.xl,
              padding: tokens.space[6],
            }}>
              <Text size="sm" weight="semibold" style={{ color: tokens.colors.success.dark, marginBottom: tokens.space[3] }}>
                For Palm Gardens (50 units):
              </Text>
              <Text size="4xl" weight="bold" style={{ color: tokens.colors.success.dark, letterSpacing: "-0.02em" }}>
                $3.98
              </Text>
              <Text size="md" style={{ color: tokens.colors.success.dark }}>per unit, per month</Text>
              <Text size="sm" color="secondary" style={{ marginTop: tokens.space[4] }}>
                Includes web portal, mobile app, push notifications, compliance tracking, and document management.
              </Text>
            </div>
          </div>
        </Card>

        {/* Slide 4: Next Steps */}
        <Card padding={8} style={{ backgroundColor: tokens.colors.bg.inverse }}>
          <Text as="h2" size="2xl" weight="bold" color="inverse" style={{ marginBottom: tokens.space[4] }}>
            Recommended Motion
          </Text>
          <div style={{
            backgroundColor: "rgba(255,255,255,0.1)",
            borderRadius: tokens.radius.lg,
            padding: tokens.space[5],
            marginBottom: tokens.space[6],
          }}>
            <Text color="inverse" style={{ fontStyle: "italic", lineHeight: 1.6 }}>
              "I move that the Board authorize the engagement of PropertyPro Florida for website and mobile app
              compliance services at a cost of $199/month plus $1,500 one-time setup, to be paid from operating funds,
              effective immediately."
            </Text>
          </div>
          <Stack direction="row" gap={4}>
            <Button style={{ backgroundColor: "#fff", color: tokens.colors.fg.primary }}>
              Schedule Demo
            </Button>
            <Button variant="ghost" style={{ color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
              Download Full Proposal
            </Button>
          </Stack>
        </Card>
      </Stack>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE AUDIT WORKFLOW — 14-day onboarding process
// ═══════════════════════════════════════════════════════════════════════════════

const ComplianceAuditView = () => {
  const [expandedDay, setExpandedDay] = useState(1);

  const auditDays = [
    {
      day: 1,
      title: "Initial Assessment",
      status: "completed",
      tasks: [
        { task: "Collect existing documents from board president", done: true },
        { task: "Verify association type (Condo §718 vs HOA §720)", done: true },
        { task: "Confirm unit count and compliance deadline", done: true },
        { task: "Set up association account in PropertyPro", done: true },
      ],
    },
    {
      day: 3,
      title: "Document Upload — Governing",
      status: "completed",
      tasks: [
        { task: "Upload Declaration of Condominium & amendments", done: true },
        { task: "Upload Bylaws & amendments", done: true },
        { task: "Upload Articles of Incorporation", done: true },
        { task: "Upload Rules & Regulations", done: true },
      ],
    },
    {
      day: 5,
      title: "Document Upload — Financial",
      status: "in_progress",
      tasks: [
        { task: "Upload current annual budget", done: true },
        { task: "Upload most recent financial report", done: true },
        { task: "Upload current insurance policies", done: false },
        { task: "Upload list of executory contracts", done: false },
      ],
    },
    {
      day: 7,
      title: "Document Upload — Structural",
      status: "pending",
      tasks: [
        { task: "Upload milestone inspection reports (if applicable)", done: false },
        { task: "Upload SIRS report (if applicable)", done: false },
        { task: "Upload Q&A sheet", done: false },
      ],
    },
    {
      day: 10,
      title: "Owner Import & Credentials",
      status: "pending",
      tasks: [
        { task: "Import owner list via CSV", done: false },
        { task: "Verify unit assignments", done: false },
        { task: "Generate unique credentials for each owner", done: false },
        { task: "Send welcome emails with login instructions", done: false },
      ],
    },
    {
      day: 12,
      title: "Meeting Setup & Notices",
      status: "pending",
      tasks: [
        { task: "Schedule upcoming board meetings", done: false },
        { task: "Upload meeting agendas", done: false },
        { task: "Configure notice posting reminders", done: false },
      ],
    },
    {
      day: 14,
      title: "Go-Live & Verification",
      status: "pending",
      tasks: [
        { task: "Verify public website accessibility", done: false },
        { task: "Test owner portal login", done: false },
        { task: "Verify all documents are accessible", done: false },
        { task: "Run final compliance check", done: false },
        { task: "Hand off to board with training session", done: false },
      ],
    },
  ];

  const completedDays = auditDays.filter(d => d.status === "completed").length;
  const progress = Math.round((completedDays / auditDays.length) * 100);

  return (
    <div style={{ padding: tokens.space[8] }}>
      {/* Progress Header */}
      <Card style={{ marginBottom: tokens.space[6] }}>
        <Stack direction="row" justify="space-between" align="center">
          <div>
            <Text size="xl" weight="semibold">Compliance Audit Progress</Text>
            <Text size="sm" color="secondary" style={{ marginTop: tokens.space[1] }}>
              Palm Gardens Condominium · 14-Day Onboarding
            </Text>
          </div>
          <Stack direction="row" gap={6} align="center">
            <div style={{ width: 200 }}>
              <ProgressBar value={progress} showLabel />
            </div>
            <div style={{ textAlign: "right" }}>
              <Text size="sm" color="secondary">Estimated completion</Text>
              <Text size="md" weight="semibold">February 12, 2026</Text>
            </div>
          </Stack>
        </Stack>
      </Card>

      {/* Timeline */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: tokens.space[6] }}>
        {/* Day Labels */}
        <Stack gap={0}>
          {auditDays.map((day, i) => (
            <button
              key={i}
              onClick={() => setExpandedDay(day.day)}
              style={{
                padding: `${tokens.space[4]} ${tokens.space[4]}`,
                backgroundColor: expandedDay === day.day ? tokens.colors.bg.tertiary : "transparent",
                border: "none",
                borderRadius: tokens.radius.md,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: tokens.space[3],
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: day.status === "completed" ? tokens.colors.success.base :
                                 day.status === "in_progress" ? tokens.colors.warning.base :
                                 tokens.colors.bg.tertiary,
                color: day.status !== "pending" ? "#fff" : tokens.colors.fg.secondary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: tokens.font.size.sm,
                fontWeight: tokens.font.weight.semibold,
              }}>
                {day.status === "completed" ? "✓" : day.day}
              </div>
              <Stack gap={0}>
                <Text size="xs" color="secondary">Day {day.day}</Text>
                <Text size="sm" weight={expandedDay === day.day ? "semibold" : "normal"}>
                  {day.title}
                </Text>
              </Stack>
            </button>
          ))}
        </Stack>

        {/* Task Detail */}
        <Card>
          {auditDays.filter(d => d.day === expandedDay).map(day => (
            <div key={day.day}>
              <Stack direction="row" justify="space-between" align="center" style={{ marginBottom: tokens.space[5] }}>
                <div>
                  <Text size="lg" weight="semibold">Day {day.day}: {day.title}</Text>
                  <Text size="sm" color="secondary" style={{ marginTop: tokens.space[1] }}>
                    {day.tasks.filter(t => t.done).length} of {day.tasks.length} tasks completed
                  </Text>
                </div>
                <StatusPill status={day.status} />
              </Stack>

              <Stack gap={3}>
                {day.tasks.map((task, i) => (
                  <Stack key={i} direction="row" gap={3} align="center" style={{
                    padding: tokens.space[3],
                    backgroundColor: task.done ? tokens.colors.success.light : tokens.colors.bg.secondary,
                    borderRadius: tokens.radius.md,
                  }}>
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: tokens.radius.sm,
                      border: task.done ? "none" : `2px solid ${tokens.colors.border.default}`,
                      backgroundColor: task.done ? tokens.colors.success.base : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 12,
                    }}>
                      {task.done && "✓"}
                    </div>
                    <Text size="sm" style={{ textDecoration: task.done ? "line-through" : "none", opacity: task.done ? 0.6 : 1 }}>
                      {task.task}
                    </Text>
                  </Stack>
                ))}
              </Stack>

              {day.status !== "completed" && (
                <Stack direction="row" gap={3} style={{ marginTop: tokens.space[5] }}>
                  <Button>Mark Day Complete</Button>
                  <Button variant="secondary">Add Note</Button>
                </Stack>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC WEBSITE PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════

const PublicWebsite = () => (
  <div style={{ padding: tokens.space[8], backgroundColor: tokens.colors.bg.secondary, minHeight: "100%" }}>
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        backgroundColor: tokens.colors.bg.primary,
        borderRadius: tokens.radius.xl,
        border: `1px solid ${tokens.colors.border.default}`,
        overflow: "hidden",
        boxShadow: tokens.shadow.xl,
      }}
    >
      {/* Nav */}
      <nav
        style={{
          padding: `${tokens.space[4]} ${tokens.space[6]}`,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text size="md" weight="bold">
          Palm Gardens Condominium
        </Text>
        <Stack direction="row" gap={6} align="center">
          {["Home", "Notices", "Contact"].map((link) => (
            <Text key={link} size="sm" weight={link === "Notices" ? "semibold" : "normal"} color={link === "Notices" ? "primary" : "secondary"} style={{ cursor: "pointer" }}>
              {link}
            </Text>
          ))}
          <Button size="sm">Owner Login</Button>
        </Stack>
      </nav>

      {/* Hero */}
      <div
        style={{
          padding: `${tokens.space[16]} ${tokens.space[8]}`,
          backgroundColor: tokens.colors.bg.inverse,
          textAlign: "center",
        }}
      >
        <Text as="h1" size="4xl" weight="bold" color="inverse" style={{ letterSpacing: "-0.02em" }}>
          Palm Gardens Condominium
        </Text>
        <Text size="md" color="inverse" style={{ opacity: 0.7, marginTop: tokens.space[2] }}>
          1500 Palm Gardens Drive · West Palm Beach, FL 33401
        </Text>
        <div style={{ marginTop: tokens.space[8] }}>
          <Button
            style={{
              backgroundColor: "#fff",
              color: tokens.colors.fg.primary,
              fontWeight: tokens.font.weight.semibold,
            }}
          >
            View Notices
          </Button>
        </div>
      </div>

      {/* Notices Section */}
      <div style={{ padding: tokens.space[8] }}>
        <Text size="xl" weight="semibold" style={{ marginBottom: tokens.space[4] }}>
          Notices
        </Text>

        <div
          style={{
            backgroundColor: tokens.colors.bg.secondary,
            borderRadius: tokens.radius.lg,
            padding: `${tokens.space[3]} ${tokens.space[4]}`,
            marginBottom: tokens.space[6],
          }}
        >
          <Text size="xs" color="secondary">
            Per Florida Statute §718.111(12)(g)(2), meeting notices and agendas are posted here.
          </Text>
        </div>

        {[
          { title: "Board of Directors Regular Meeting", date: "February 10, 2026 — 7:00 PM", notice: "Posted January 27, 2026 (14 days notice)" },
          { title: "Annual Owners' Meeting", date: "March 15, 2026 — 6:00 PM", notice: "Posted February 1, 2026 (42 days notice)" },
        ].map((n, i) => (
          <div key={i} style={{ padding: `${tokens.space[5]} 0`, borderBottom: `1px solid ${tokens.colors.border.muted}` }}>
            <Text size="md" weight="semibold">
              {n.title}
            </Text>
            <Text size="sm" color="secondary" style={{ marginTop: tokens.space[1] }}>
              {n.date}
            </Text>
            <Stack direction="row" gap={2} align="center" style={{ marginTop: tokens.space[2] }}>
              <StatusDot status="compliant" />
              <Text size="sm" style={{ color: tokens.colors.success.dark }}>
                {n.notice}
              </Text>
            </Stack>
            <Text size="sm" style={{ color: tokens.colors.fg.secondary, marginTop: tokens.space[3], cursor: "pointer" }}>
              Download Agenda →
            </Text>
          </div>
        ))}
      </div>
    </div>

    <Text size="xs" color="tertiary" style={{ textAlign: "center", marginTop: tokens.space[4] }}>
      Preview of palmgardens.propertyprofl.com
    </Text>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

export default function PropertyProElevated() {
  const [viewGroup, setViewGroup] = useState("admin");
  const [activeView, setActiveView] = useState("compliance");
  const [showPublicPreview, setShowPublicPreview] = useState(false);

  const titles = {
    compliance: ["Compliance", "Florida Statute §718.111(12)(g)"],
    audit: ["Audit Progress", "14-day onboarding workflow"],
    documents: ["Documents", "Statutory document management"],
    meetings: ["Meetings", "Schedule and notice compliance"],
    announcements: ["Announcements", "Community communication"],
    maintenance: ["Maintenance", "Request tracking"],
    owners: ["Owners", "Credential management"],
    "portal-home": ["Dashboard", "Welcome to your portal"],
    "portal-documents": ["Documents", "Community documents"],
    "portal-meetings": ["Meetings", "Upcoming and past"],
    "portal-maintenance": ["My Requests", "Track your requests"],
    "pm-portfolio": ["Portfolio", "Community overview"],
    "pm-compliance": ["Compliance", "Portfolio monitoring"],
    "pm-whitelabel": ["White Label", "Customize branding"],
    "signup": ["Signup Flow", "New association onboarding"],
    "mobile-preview": ["Mobile App", "iOS & Android preview"],
    "board-presentation": ["Board Deck", "Champion-arming materials"],
  };

  const [title, subtitle] = titles[activeView] || ["PropertyPro", ""];

  const renderView = () => {
    if (showPublicPreview) return <PublicWebsite />;
    switch (activeView) {
      case "compliance":
        return <ComplianceDashboard />;
      case "audit":
        return <ComplianceAuditView />;
      case "documents":
      case "portal-documents":
        return <DocumentsView />;
      case "meetings":
      case "portal-meetings":
        return <MeetingsView />;
      case "announcements":
        return <AnnouncementsView />;
      case "maintenance":
      case "portal-maintenance":
        return <MaintenanceView />;
      case "owners":
        return <OwnersView />;
      case "portal-home":
        return <PortalHome />;
      case "pm-portfolio":
        return <PMPortfolio />;
      case "pm-compliance":
        return <PMCompliance />;
      case "pm-whitelabel":
        return <PMWhiteLabel />;
      case "signup":
        return <SignupFlow />;
      case "mobile-preview":
        return <MobileAppPreview />;
      case "board-presentation":
        return <BoardPresentationView />;
      default:
        return <ComplianceDashboard />;
    }
  };

  return (
    <div
      style={{
        fontFamily: tokens.font.family.sans,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: tokens.colors.bg.secondary,
        color: tokens.colors.fg.primary,
      }}
    >
      {/* Demo Bar */}
      <div
        style={{
          backgroundColor: tokens.colors.bg.inverse,
          padding: `${tokens.space[2]} ${tokens.space[5]}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Stack direction="row" gap={3} align="center">
          <Text size="xs" color="inverse" weight="medium" style={{ opacity: 0.6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            PropertyPro Florida
          </Text>
          <Badge variant="outline" size="xs">
            Interactive Mockup
          </Badge>
        </Stack>
        <Button
          variant={showPublicPreview ? "primary" : "ghost"}
          size="sm"
          onClick={() => setShowPublicPreview(!showPublicPreview)}
          style={{
            backgroundColor: showPublicPreview ? "#fff" : "transparent",
            color: showPublicPreview ? tokens.colors.fg.primary : "rgba(255,255,255,0.6)",
          }}
        >
          Public Website
        </Button>
      </div>

      {/* Main Layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!showPublicPreview && <Sidebar activeView={activeView} setActiveView={setActiveView} viewGroup={viewGroup} setViewGroup={setViewGroup} />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: tokens.colors.bg.primary }}>
          <TopBar title={showPublicPreview ? "Public Website" : title} subtitle={showPublicPreview ? "palmgardens.propertyprofl.com" : subtitle} />
          <main style={{ flex: 1, overflow: "auto" }}>{renderView()}</main>
        </div>
      </div>
    </div>
  );
}
