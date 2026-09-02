import {
  Box,
  Caption,
  Heading,
  HStack,
  Paragraph,
  PhoneFrame,
  VStack,
} from '@propertypro/design-system';

/**
 * PhoneFrame is an iPhone-15 chrome (430×932, notch + home indicator) around an
 * IFRAME. Its only content prop is `src` — it does NOT take children — because
 * the real use is previewing a tenant portal served from another origin, under a
 * locked-down sandbox with `referrerPolicy="no-referrer"`.
 *
 * These previews therefore pass a self-contained document as the src so the
 * frame has a real PropertyPro mobile screen inside it. In product code you pass
 * the community's portal URL instead.
 */

const SHELL = `
  :root { color-scheme: light }
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body {
    font: 15px/1.45 -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
    background: #fbf7f1; color: #111827; -webkit-font-smoothing: antialiased;
  }
  .statusbar { display:flex; justify-content:space-between; align-items:center;
    padding: 14px 26px 6px; font-size: 15px; font-weight: 600 }
  .dots { display:flex; gap:3px; align-items:flex-end }
  .dots i { display:block; width:3px; background:#111827; border-radius:1px }
  .appbar { display:flex; justify-content:space-between; align-items:center;
    padding: 10px 20px 14px }
  .brand { font-size: 20px; font-weight: 700; letter-spacing:-.01em }
  .sub { font-size: 12px; color:#6b7280; margin-top:2px }
  .avatar { width:38px; height:38px; border-radius:999px; background:#f5f3ff;
    border:1px solid #efe7dc; display:flex; align-items:center; justify-content:center;
    font-size:13px; font-weight:700; color:#6d28d9 }
  main { padding: 0 20px 20px; display:flex; flex-direction:column; gap:14px }
  .card { background:#fffefc; border:1px solid #efe7dc; border-radius:14px; padding:16px }
  .card.flat { padding:0; overflow:hidden }
  .eyebrow { font-size:11px; font-weight:700; letter-spacing:.09em;
    text-transform:uppercase; color:#6b7280 }
  h2 { font-size:17px; font-weight:650; letter-spacing:-.01em }
  p { font-size:14px; color:#4b5563 }
  .row { display:flex; align-items:center; gap:12px }
  .between { display:flex; align-items:center; justify-content:space-between; gap:12px }
  .pill { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.06em;
    text-transform:uppercase; padding:4px 9px; border-radius:999px }
  .pill.warn { background:#fffbeb; color:#b45309; border:1px solid #fde68a }
  .pill.danger { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca }
  .pill.ok { background:#ecfdf5; color:#047857; border:1px solid #a7f3d0 }
  .pill.info { background:#ecf6f4; color:#1c5a52; border:1px solid #b9ddd7 }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px }
  .tile { background:#fffefc; border:1px solid #efe7dc; border-radius:14px;
    padding:14px; display:flex; flex-direction:column; gap:8px }
  .glyph { width:34px; height:34px; border-radius:10px; background:#fcf1ed;
    display:flex; align-items:center; justify-content:center; font-size:16px }
  .tile b { font-size:14px; font-weight:600 }
  .tile span { font-size:12px; color:#6b7280 }
  .item { padding:14px 16px; border-bottom:1px solid #f6efe6; display:flex; gap:12px }
  .item:last-child { border-bottom:0 }
  .bar { width:3px; border-radius:2px; flex:0 0 3px }
  .item b { font-size:14px; font-weight:600; display:block }
  .item span { font-size:12px; color:#6b7280 }
  .amount { font-size:30px; font-weight:700; letter-spacing:-.02em }
  .cta { display:block; text-align:center; background:#c2533a; color:#fff;
    font-size:15px; font-weight:650; padding:13px; border-radius:12px; margin-top:14px }
  .ghost { display:block; text-align:center; background:#fffefc; color:#111827;
    border:1px solid #efe7dc; font-size:15px; font-weight:600; padding:13px;
    border-radius:12px; margin-top:10px }
  .tabbar { position:absolute; left:0; right:0; bottom:0; display:flex;
    background:#fffefcf2; border-top:1px solid #efe7dc; padding:10px 8px 22px;
    backdrop-filter: blur(8px) }
  .tab { flex:1; text-align:center; font-size:11px; font-weight:600; color:#6b7280 }
  .tab .ic { font-size:19px; display:block; margin-bottom:3px; filter:grayscale(1); opacity:.55 }
  .tab.on { color:#c2533a }
  .tab.on .ic { filter:none; opacity:1 }
  .scroll { padding-bottom:104px }
  .kv { display:flex; justify-content:space-between; padding:9px 0;
    border-bottom:1px solid #f6efe6; font-size:14px }
  .kv:last-child { border-bottom:0 }
  .kv span { color:#6b7280 }
  .kv b { font-weight:600 }
`;

const statusBar = `
  <div class="statusbar">
    <span>9:41</span>
    <span class="dots">
      <i style="height:5px"></i><i style="height:8px"></i>
      <i style="height:11px"></i><i style="height:14px"></i>
    </span>
  </div>`;

const tabBar = (active: string) => {
  const tabs: Array<[string, string]> = [
    ['Home', '🏠'],
    ['Docs', '📄'],
    ['Requests', '🔧'],
    ['Pay', '💳'],
    ['More', '⋯'],
  ];
  return `<nav class="tabbar">${tabs
    .map(
      ([label, ic]) =>
        `<div class="tab${label === active ? ' on' : ''}"><span class="ic">${ic}</span>${label}</div>`,
    )
    .join('')}</nav>`;
};

const screen = (body: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${SHELL}</style></head><body>${body}</body></html>`,
  )}`;

const RESIDENT_HOME = screen(`
  ${statusBar}
  <div class="appbar">
    <div>
      <div class="brand">Sunset Condos</div>
      <div class="sub">Unit 412-B · Miami, FL</div>
    </div>
    <div class="avatar">MD</div>
  </div>
  <main class="scroll">
    <div class="card" style="border-color:#fde68a;background:#fffbeb">
      <div class="between">
        <span class="eyebrow" style="color:#b45309">Action needed</span>
        <span class="pill warn">3 days</span>
      </div>
      <h2 style="margin:8px 0 4px">Annual meeting notice</h2>
      <p>Confirm your attendance for the 12 April budget workshop so the board can
         reach quorum.</p>
      <a class="cta">Confirm attendance</a>
    </div>

    <div class="grid">
      <div class="tile"><span class="glyph">📄</span><b>Documents</b><span>14 posted</span></div>
      <div class="tile"><span class="glyph">🔧</span><b>Maintenance</b><span>1 open request</span></div>
      <div class="tile"><span class="glyph">🗳️</span><b>Vote</b><span>Ballot open</span></div>
      <div class="tile"><span class="glyph">🚪</span><b>Visitors</b><span>Add a guest pass</span></div>
    </div>

    <div class="card">
      <span class="eyebrow">Your account</span>
      <div class="between" style="margin-top:8px">
        <div>
          <div class="amount">$1,215.00</div>
          <p style="margin-top:2px">Q2 assessment · due 1 April</p>
        </div>
        <span class="pill ok">Current</span>
      </div>
    </div>

    <div class="card flat">
      <div style="padding:14px 16px 4px"><span class="eyebrow">Recent activity</span></div>
      <div class="item">
        <span class="bar" style="background:#047857"></span>
        <div><b>Reserve study posted</b><span>14 Mar · within the 30-day window</span></div>
      </div>
      <div class="item">
        <span class="bar" style="background:#b45309"></span>
        <div><b>Board meeting notice</b><span>12 Mar · posted 48 hours ahead</span></div>
      </div>
    </div>
  </main>
  ${tabBar('Home')}
`);

const MAINTENANCE_REQUEST = screen(`
  ${statusBar}
  <div class="appbar">
    <div>
      <div class="sub" style="margin:0 0 2px">‹ Maintenance</div>
      <div class="brand" style="font-size:19px">Bathroom ceiling leak</div>
    </div>
    <span class="pill danger">Urgent</span>
  </div>
  <main class="scroll">
    <div class="card">
      <div class="kv"><span>Request</span><b>WO-2026-0311</b></div>
      <div class="kv"><span>Unit</span><b>412-B</b></div>
      <div class="kv"><span>Reported</span><b>02 March 2026</b></div>
      <div class="kv"><span>Vendor</span><b>Aqua Systems LLC</b></div>
      <div class="kv"><span>Access</span><b>Key on file</b></div>
    </div>

    <div class="card">
      <span class="eyebrow">Description</span>
      <p style="margin-top:8px">Persistent leak from the unit above affecting the
        primary bathroom ceiling. Drywall is discoloured across roughly one square
        metre and the extractor fan has stopped drawing.</p>
    </div>

    <div class="card flat">
      <div style="padding:14px 16px 4px"><span class="eyebrow">Timeline</span></div>
      <div class="item">
        <span class="bar" style="background:#c2533a"></span>
        <div><b>Vendor scheduled</b><span>18 Mar, 8:00–11:00 AM window</span></div>
      </div>
      <div class="item">
        <span class="bar" style="background:#1c5a52"></span>
        <div><b>Assigned to Aqua Systems</b><span>05 Mar by Elena Ortiz</span></div>
      </div>
    </div>

    <a class="cta">Message the manager</a>
  </main>
  ${tabBar('Requests')}
`);

const BOARD_APPROVALS = screen(`
  ${statusBar}
  <div class="appbar">
    <div>
      <div class="brand">Approvals</div>
      <div class="sub">Board president · Sunset Condos</div>
    </div>
    <span class="pill info">4 waiting</span>
  </div>
  <main class="scroll">
    <div class="card">
      <div class="between">
        <span class="eyebrow">ARC request</span>
        <span class="pill warn">Due in 6 days</span>
      </div>
      <h2 style="margin:8px 0 4px">Hurricane shutters — 412-B</h2>
      <p>A denial must cite the specific rule or covenant relied on (HB 1203).</p>
      <a class="cta">Review submission</a>
    </div>
    <div class="card flat">
      <div class="item">
        <span class="bar" style="background:#b91c1c"></span>
        <div><b>Violation · unpermitted balcony tile</b><span>208-A · hearing in 4 days</span></div>
      </div>
      <div class="item">
        <span class="bar" style="background:#b45309"></span>
        <div><b>Vendor contract · Bright Coast Electric</b><span>$18,400 · needs two signatures</span></div>
      </div>
      <div class="item">
        <span class="bar" style="background:#1c5a52"></span>
        <div><b>Minutes · February board meeting</b><span>Draft ready to post</span></div>
      </div>
    </div>
  </main>
  ${tabBar('More')}
`);

const Scaled = ({ scale, src }: { scale: number; src: string }) => (
  <Box
    width={430 * scale}
    height={932 * scale}
    style={{ flexShrink: 0 }}
  >
    <Box style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      <PhoneFrame src={src} />
    </Box>
  </Box>
);

export const ResidentHome = () => (
  <HStack gap="xl" align="flex-start">
    <Scaled scale={0.68} src={RESIDENT_HOME} />
    <VStack gap="md" style={{ maxWidth: 400 }}>
      <VStack gap="xs">
        <Caption transform="uppercase">Tenant portal preview</Caption>
        <Heading level={3}>Resident home</Heading>
      </VStack>
      <Paragraph color="secondary">
        The chrome is fixed at 430×932 with a 393-point screen, so a mobile route
        renders here exactly as it does on an iPhone 15. Nothing about the frame
        is themeable — it is deliberately device-accurate.
      </Paragraph>
      <Box background="subtle" border radius="md" padding="md">
        <VStack gap="xs">
          <Caption transform="uppercase">Why an iframe</Caption>
          <Paragraph color="secondary">
            The framed page keeps its own origin so its session cookie works, but
            the sandbox withholds popups, downloads and top-level navigation, and
            the referrer is stripped because preview URLs carry a demo-login
            token.
          </Paragraph>
        </VStack>
      </Box>
    </VStack>
  </HStack>
);

export const MaintenanceRequest = () => (
  <HStack gap="xl" align="flex-start">
    <Scaled scale={0.68} src={MAINTENANCE_REQUEST} />
    <VStack gap="md" style={{ maxWidth: 400 }}>
      <VStack gap="xs">
        <Caption transform="uppercase">Tenant portal preview</Caption>
        <Heading level={3}>Work order detail</Heading>
      </VStack>
      <Paragraph color="secondary">
        A second route in the same frame. Because the content is an iframe rather
        than children, switching screens means changing `src` — the frame itself
        never re-renders its chrome.
      </Paragraph>
      <Paragraph color="secondary">
        `loading` is the only other prop: leave it at the default `eager` for the
        visible preview, and set `lazy` for frames below the fold in a tabbed
        console.
      </Paragraph>
    </VStack>
  </HStack>
);

export const SideBySidePortals = () => (
  <VStack gap="md">
    <VStack gap="xs">
      <Caption transform="uppercase">Admin console — tabbed portal preview</Caption>
      <Paragraph color="secondary">
        Two frames rendered together to compare what a resident sees against what
        a board member sees for the same community.
      </Paragraph>
    </VStack>
    <HStack gap="lg" align="flex-start">
      <VStack gap="xs" align="center">
        <Scaled scale={0.55} src={RESIDENT_HOME} />
        <Caption transform="uppercase">Resident</Caption>
      </VStack>
      <VStack gap="xs" align="center">
        <Scaled scale={0.55} src={BOARD_APPROVALS} />
        <Caption transform="uppercase">Board president</Caption>
      </VStack>
    </HStack>
  </VStack>
);
