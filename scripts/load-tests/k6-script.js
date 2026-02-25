/**
 * P4-62: Load testing — k6 script.
 *
 * Simulates an annual meeting peak with 100 concurrent users:
 *   - 80 VUs reading documents, announcements, and meetings
 *   - 15 VUs submitting maintenance requests
 *   -  5 VUs checking compliance and exporting data
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL="https://property-pro-xxx.vercel.app" \
 *     -e SUPABASE_URL="https://xxx.supabase.co" \
 *     -e SUPABASE_ANON_KEY="eyJ..." \
 *     -e COMMUNITY_ID="1" \
 *     -e SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
 *     scripts/load-tests/k6-script.js
 *
 * The SUPABASE_SERVICE_ROLE_KEY bypasses Supabase auth rate limits during setup.
 * Without it, repeated runs may hit the per-IP rate limit on password auth.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL;
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const DEMO_PASSWORD = __ENV.DEMO_PASSWORD || __ENV.DEMO_DEFAULT_PASSWORD || 'DemoPass123!';
const SUPABASE_SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;
const COMMUNITY_ID = __ENV.COMMUNITY_ID;

if (!BASE_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY || !COMMUNITY_ID) {
  throw new Error(
    'Required env vars: BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, COMMUNITY_ID. Optional: SUPABASE_SERVICE_ROLE_KEY (bypasses auth rate limits), DEMO_PASSWORD',
  );
}

// Extract Supabase project ref from URL for cookie name.
// e.g. https://abcdef.supabase.co -> abcdef
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

// ---------------------------------------------------------------------------
// Demo users (all members of Sunset Condos / condo_718)
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  'board.president@sunset.local',
  'board.member@sunset.local',
  'owner.one@sunset.local',
  'tenant.one@sunset.local',
  'cam.one@sunset.local',
  'pm.admin@sunset.local',
];

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const documentsLatency = new Trend('documents_latency', true);
const announcementsLatency = new Trend('announcements_latency', true);
const meetingsLatency = new Trend('meetings_latency', true);
const complianceLatency = new Trend('compliance_latency', true);
const maintenanceLatency = new Trend('maintenance_submit_latency', true);
const exportLatency = new Trend('export_latency', true);

const rateLimited = new Counter('rate_limited');
const coldStarts = new Counter('cold_starts');
const authFailures = new Counter('auth_failures');

// ---------------------------------------------------------------------------
// k6 options
// ---------------------------------------------------------------------------

const RAMP_UP = '30s';
const SUSTAIN = '2m';
const RAMP_DOWN = '30s';

export const options = {
  scenarios: {
    annual_meeting_read: {
      executor: 'ramping-vus',
      exec: 'readScenario',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: 80 },
        { duration: SUSTAIN, target: 80 },
        { duration: RAMP_DOWN, target: 0 },
      ],
    },
    maintenance_submit: {
      executor: 'ramping-vus',
      exec: 'writeScenario',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: 15 },
        { duration: SUSTAIN, target: 15 },
        { duration: RAMP_DOWN, target: 0 },
      ],
    },
    compliance_check: {
      executor: 'ramping-vus',
      exec: 'complianceScenario',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: 5 },
        { duration: SUSTAIN, target: 5 },
        { duration: RAMP_DOWN, target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
    documents_latency: ['p(95)<2000'],
    announcements_latency: ['p(95)<2000'],
    meetings_latency: ['p(95)<2000'],
    compliance_latency: ['p(95)<2000'],
    maintenance_submit_latency: ['p(95)<2000'],
    export_latency: ['p(95)<5000'],
  },
};

// ---------------------------------------------------------------------------
// Setup — pre-authenticate all demo users
// ---------------------------------------------------------------------------

export function setup() {
  const sessions = {};
  const tokenUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

  // Use service role key if available (bypasses Supabase auth rate limits).
  // Falls back to the anon key, which is subject to stricter rate limits.
  const apikey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Using service role key for auth (rate limit bypass)');
  } else {
    console.log('Using anon key for auth (subject to rate limits)');
  }

  for (let i = 0; i < DEMO_USERS.length; i++) {
    const email = DEMO_USERS[i];
    const res = http.post(
      tokenUrl,
      JSON.stringify({ email, password: DEMO_PASSWORD }),
      {
        headers: {
          'Content-Type': 'application/json',
          apikey,
        },
      },
    );

    if (res.status === 200) {
      sessions[email] = res.body;
      console.log(`Authenticated: ${email}`);
    } else {
      console.error(`Auth failed for ${email}: ${res.status} ${res.body}`);
      authFailures.add(1);
    }

    // 1s delay between auth requests
    sleep(1);
  }

  const count = Object.keys(sessions).length;
  if (count === 0) {
    throw new Error('No users authenticated — cannot proceed with load test');
  }
  console.log(`Setup complete: ${count}/${DEMO_USERS.length} users authenticated`);

  return { sessions };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick a session for this VU. VUs are distributed round-robin across users.
 */
function getSession(data) {
  const emails = Object.keys(data.sessions);
  const email = emails[(__VU - 1) % emails.length];
  return { email, sessionJson: data.sessions[email] };
}

/**
 * Build common request headers with auth cookie.
 *
 * @supabase/ssr@0.8.0 stores sessions as "base64-" + base64url(sessionJSON).
 * The middleware reads cookies via request.cookies.getAll() which does NOT
 * URL-decode values, so we must match the exact encoding the SDK expects.
 */
function authHeaders(sessionJson) {
  const encoded = 'base64-' + encoding.b64encode(sessionJson, 'rawurl');
  return {
    Cookie: `${COOKIE_NAME}=${encoded}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated GET request, handling rate limits and tracking metrics.
 */
function authGet(url, sessionJson, trendMetric) {
  let res = http.get(url, { headers: authHeaders(sessionJson) });

  // Handle rate limiting: retry once after waiting
  if (res.status === 429) {
    rateLimited.add(1);
    const retryAfter = parseInt(res.headers['Retry-After'] || '5', 10);
    sleep(retryAfter);
    res = http.get(url, { headers: authHeaders(sessionJson) });
  }

  // Track per-endpoint latency
  if (trendMetric) {
    trendMetric.add(res.timings.duration);
  }

  // Track Vercel cold starts (responses > 3s)
  if (res.timings.duration > 3000) {
    coldStarts.add(1);
  }

  return res;
}

/**
 * Make an authenticated POST request, handling rate limits and tracking metrics.
 */
function authPost(url, body, sessionJson, trendMetric) {
  const hdrs = authHeaders(sessionJson);
  let res = http.post(url, JSON.stringify(body), { headers: hdrs });

  if (res.status === 429) {
    rateLimited.add(1);
    const retryAfter = parseInt(res.headers['Retry-After'] || '5', 10);
    sleep(retryAfter);
    res = http.post(url, JSON.stringify(body), { headers: hdrs });
  }

  if (trendMetric) {
    trendMetric.add(res.timings.duration);
  }

  if (res.timings.duration > 3000) {
    coldStarts.add(1);
  }

  return res;
}

/**
 * Random integer in [min, max].
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Scenario: annual_meeting_read (80 VUs)
// ---------------------------------------------------------------------------

export function readScenario(data) {
  const { sessionJson } = getSession(data);
  const api = `${BASE_URL}/api/v1`;
  const cid = COMMUNITY_ID;

  // GET documents
  const docsRes = authGet(
    `${api}/documents?communityId=${cid}`,
    sessionJson,
    documentsLatency,
  );
  check(docsRes, { 'documents: status 200': (r) => r.status === 200 });

  sleep(randInt(1, 3));

  // GET announcements
  const annRes = authGet(
    `${api}/announcements?communityId=${cid}`,
    sessionJson,
    announcementsLatency,
  );
  check(annRes, { 'announcements: status 200': (r) => r.status === 200 });

  sleep(randInt(1, 3));

  // GET meetings
  const mtgRes = authGet(
    `${api}/meetings?communityId=${cid}`,
    sessionJson,
    meetingsLatency,
  );
  check(mtgRes, { 'meetings: status 200': (r) => r.status === 200 });

  // Think time before next iteration
  sleep(randInt(2, 3));
}

// ---------------------------------------------------------------------------
// Scenario: maintenance_submit (15 VUs)
// ---------------------------------------------------------------------------

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'general', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function writeScenario(data) {
  const { sessionJson } = getSession(data);
  const api = `${BASE_URL}/api/v1`;

  const category = CATEGORIES[randInt(0, CATEGORIES.length - 1)];
  const priority = PRIORITIES[randInt(0, PRIORITIES.length - 1)];

  const res = authPost(
    `${api}/maintenance-requests`,
    {
      action: 'create',
      communityId: parseInt(COMMUNITY_ID, 10),
      title: `[Load Test] ${category} issue - VU${__VU} iter${__ITER}`,
      description: `Automated load test maintenance request submitted at ${new Date().toISOString()}. Category: ${category}, Priority: ${priority}.`,
      priority,
      category,
    },
    sessionJson,
    maintenanceLatency,
  );

  check(res, {
    'maintenance: status 201': (r) => r.status === 201,
  });

  // Think time between writes
  sleep(randInt(5, 8));
}

// ---------------------------------------------------------------------------
// Scenario: compliance_check (5 VUs)
// ---------------------------------------------------------------------------

export function complianceScenario(data) {
  const { sessionJson } = getSession(data);
  const api = `${BASE_URL}/api/v1`;
  const cid = COMMUNITY_ID;

  // GET compliance
  const compRes = authGet(
    `${api}/compliance?communityId=${cid}`,
    sessionJson,
    complianceLatency,
  );
  check(compRes, { 'compliance: status 200': (r) => r.status === 200 });

  sleep(randInt(3, 5));

  // 20% chance of hitting the export endpoint (heaviest)
  if (Math.random() < 0.2) {
    const expRes = authGet(
      `${api}/export?communityId=${cid}`,
      sessionJson,
      exportLatency,
    );
    check(expRes, { 'export: status 200': (r) => r.status === 200 });
  }

  // Think time before next iteration
  sleep(randInt(5, 10));
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  const count = Object.keys(data.sessions).length;
  console.log(`Teardown: test complete with ${count} authenticated users`);
}
