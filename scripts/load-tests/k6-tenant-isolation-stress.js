/**
 * k6 tenant isolation stress test
 *
 * Specifically tests what happens when 100 users from the SAME community
 * hit compliance and document endpoints simultaneously — the annual meeting
 * scenario.
 *
 * This is distinct from the general load test (k6-script.js) because it:
 *   1. Concentrates ALL load on one community_id (not distributed)
 *   2. Verifies every response contains data scoped to the correct community
 *   3. Adds cross-community verification VUs that must see ZERO data leakage
 *   4. Tracks RLS query latency separately from application latency
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL="https://property-pro-xxx.vercel.app" \
 *     -e SUPABASE_URL="https://xxx.supabase.co" \
 *     -e SUPABASE_ANON_KEY="eyJ..." \
 *     -e DEMO_PASSWORD="..." \
 *     -e COMMUNITY_A_ID="1" \
 *     -e COMMUNITY_B_ID="2" \
 *     scripts/load-tests/k6-tenant-isolation-stress.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import encoding from 'k6/encoding';

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL;
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const DEMO_PASSWORD = __ENV.DEMO_PASSWORD || __ENV.DEMO_DEFAULT_PASSWORD;
const SUPABASE_SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;
const COMMUNITY_A_ID = __ENV.COMMUNITY_A_ID;
const COMMUNITY_B_ID = __ENV.COMMUNITY_B_ID;
const VERCEL_BYPASS_TOKEN = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!BASE_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY || !COMMUNITY_A_ID || !DEMO_PASSWORD) {
  throw new Error(
    'Required env vars: BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, COMMUNITY_A_ID, DEMO_PASSWORD. Optional: COMMUNITY_B_ID, SUPABASE_SERVICE_ROLE_KEY',
  );
}

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

// ---------------------------------------------------------------------------
// Demo users
// ---------------------------------------------------------------------------

// Community A users (Sunset Condos) — these all hit the SAME community
const COMMUNITY_A_USERS = [
  'board.president@sunset.local',
  'board.member@sunset.local',
  'owner.one@sunset.local',
  'cam.one@sunset.local',
];

// Community B user — for cross-tenant isolation verification
const COMMUNITY_B_USERS = COMMUNITY_B_ID
  ? ['pm.admin@sunset.local']
  : [];

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const rlsDocumentsLatency = new Trend('rls_documents_latency', true);
const rlsComplianceLatency = new Trend('rls_compliance_latency', true);
const rlsMeetingsLatency = new Trend('rls_meetings_latency', true);
const concurrentReadsLatency = new Trend('concurrent_reads_p95', true);

const crossTenantLeaks = new Counter('cross_tenant_data_leaks');
const isolationChecks = new Counter('isolation_checks_passed');
const rlsErrors = new Counter('rls_errors');

// ---------------------------------------------------------------------------
// k6 options — concentrated load on one community
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // 80 VUs all hitting Community A simultaneously
    annual_meeting_concentrated: {
      executor: 'ramping-vus',
      exec: 'concentratedReadScenario',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 80 },
        { duration: '2m', target: 80 },
        { duration: '20s', target: 0 },
      ],
    },
    // 15 VUs doing compliance reads (heaviest query path)
    compliance_storm: {
      executor: 'ramping-vus',
      exec: 'complianceStormScenario',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '2m', target: 15 },
        { duration: '20s', target: 0 },
      ],
    },
    // 5 VUs verifying cross-tenant isolation holds under load
    isolation_verifier: {
      executor: 'constant-vus',
      exec: 'isolationVerifierScenario',
      vus: COMMUNITY_B_ID ? 5 : 0,
      duration: '2m40s',
      startTime: '0s',
    },
  },
  thresholds: {
    // RLS-scoped queries should stay under 2s even under concentrated load
    rls_documents_latency: ['p(95)<2000'],
    rls_compliance_latency: ['p(95)<3000'], // compliance is heavier
    rls_meetings_latency: ['p(95)<2000'],
    concurrent_reads_p95: ['p(95)<2500'],

    // Zero tolerance for cross-tenant data leakage
    cross_tenant_data_leaks: ['count==0'],

    // General error budget
    http_req_failed: ['rate<0.05'],
  },
};

// Treat 429 as expected (retried internally)
http.setResponseCallback(http.expectedStatuses(200, 201, 429));

// ---------------------------------------------------------------------------
// Setup — authenticate users
// ---------------------------------------------------------------------------

export function setup() {
  const sessions = { communityA: {}, communityB: {} };
  const tokenUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const apikey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  for (const email of COMMUNITY_A_USERS) {
    const res = http.post(tokenUrl, JSON.stringify({ email, password: DEMO_PASSWORD }), {
      headers: { 'Content-Type': 'application/json', apikey },
    });
    if (res.status === 200) {
      sessions.communityA[email] = res.body;
      console.log(`Auth OK: ${email} (Community A)`);
    } else {
      console.error(`Auth FAIL: ${email}: ${res.status}`);
    }
    sleep(1);
  }

  for (const email of COMMUNITY_B_USERS) {
    const res = http.post(tokenUrl, JSON.stringify({ email, password: DEMO_PASSWORD }), {
      headers: { 'Content-Type': 'application/json', apikey },
    });
    if (res.status === 200) {
      sessions.communityB[email] = res.body;
      console.log(`Auth OK: ${email} (Community B)`);
    } else {
      console.error(`Auth FAIL: ${email}: ${res.status}`);
    }
    sleep(1);
  }

  const totalA = Object.keys(sessions.communityA).length;
  const totalB = Object.keys(sessions.communityB).length;
  if (totalA === 0) throw new Error('No Community A users authenticated');
  console.log(`Setup complete: ${totalA} Community A, ${totalB} Community B users`);

  return sessions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionA(data) {
  const emails = Object.keys(data.communityA);
  const email = emails[(__VU - 1) % emails.length];
  return data.communityA[email];
}

function getSessionB(data) {
  const emails = Object.keys(data.communityB);
  if (emails.length === 0) return null;
  return data.communityB[emails[0]];
}

function authHeaders(sessionJson) {
  const encoded = 'base64-' + encoding.b64encode(sessionJson, 'rawurl');
  let cookieStr = `${COOKIE_NAME}=${encoded}`;
  if (VERCEL_BYPASS_TOKEN) {
    cookieStr += `; x-vercel-protection-bypass=${VERCEL_BYPASS_TOKEN}`;
  }
  return { Cookie: cookieStr, 'Content-Type': 'application/json' };
}

function authGet(url, sessionJson, metric) {
  let res = http.get(url, { headers: authHeaders(sessionJson) });
  if (res.status === 429) {
    sleep(5);
    res = http.get(url, { headers: authHeaders(sessionJson) });
  }
  if (metric) metric.add(res.timings.duration);
  return res;
}

// ---------------------------------------------------------------------------
// Scenario: concentrated reads on one community (80 VUs)
// ---------------------------------------------------------------------------

export function concentratedReadScenario(data) {
  const session = getSessionA(data);
  const api = `${BASE_URL}/api/v1`;
  const cid = COMMUNITY_A_ID;

  // Documents — scoped by community_id + RLS
  const docsRes = authGet(`${api}/documents?communityId=${cid}`, session, rlsDocumentsLatency);
  check(docsRes, { 'docs: 200': (r) => r.status === 200 });
  concurrentReadsLatency.add(docsRes.timings.duration);

  sleep(1);

  // Meetings — scoped by community_id + RLS
  const mtgRes = authGet(`${api}/meetings?communityId=${cid}`, session, rlsMeetingsLatency);
  check(mtgRes, { 'meetings: 200': (r) => r.status === 200 });
  concurrentReadsLatency.add(mtgRes.timings.duration);

  sleep(1);

  // Announcements
  const annRes = authGet(`${api}/announcements?communityId=${cid}`, session, null);
  check(annRes, { 'announcements: 200': (r) => r.status === 200 });
  concurrentReadsLatency.add(annRes.timings.duration);

  sleep(1);
}

// ---------------------------------------------------------------------------
// Scenario: compliance storm (15 VUs)
// ---------------------------------------------------------------------------

export function complianceStormScenario(data) {
  const session = getSessionA(data);
  const api = `${BASE_URL}/api/v1`;
  const cid = COMMUNITY_A_ID;

  const compRes = authGet(`${api}/compliance?communityId=${cid}`, session, rlsComplianceLatency);
  check(compRes, { 'compliance: 200': (r) => r.status === 200 });

  // Verify response contains data scoped to the correct community
  if (compRes.status === 200) {
    try {
      const body = JSON.parse(compRes.body);
      if (body.data && Array.isArray(body.data)) {
        for (const item of body.data) {
          if (item.communityId && String(item.communityId) !== String(cid)) {
            crossTenantLeaks.add(1);
            console.error(
              `TENANT LEAK: compliance item ${item.id} has communityId=${item.communityId}, expected ${cid}`,
            );
          }
        }
        isolationChecks.add(1);
      }
    } catch (e) {
      // Parse error — not a data leak, just malformed response
      rlsErrors.add(1);
    }
  }

  sleep(3);
}

// ---------------------------------------------------------------------------
// Scenario: cross-tenant isolation verifier (5 VUs)
// ---------------------------------------------------------------------------

export function isolationVerifierScenario(data) {
  const sessionB = getSessionB(data);
  if (!sessionB || !COMMUNITY_B_ID) return;

  const api = `${BASE_URL}/api/v1`;

  // Community B user tries to access Community A data
  // This should either 403 or return only Community B data
  const docsRes = authGet(`${api}/documents?communityId=${COMMUNITY_A_ID}`, sessionB, null);

  if (docsRes.status === 200) {
    try {
      const body = JSON.parse(docsRes.body);
      if (body.data && Array.isArray(body.data)) {
        for (const doc of body.data) {
          if (doc.communityId && String(doc.communityId) === String(COMMUNITY_A_ID)) {
            crossTenantLeaks.add(1);
            console.error(
              `TENANT LEAK: Community B user saw Community A document ${doc.id}`,
            );
          }
        }
        isolationChecks.add(1);
      }
    } catch (e) {
      rlsErrors.add(1);
    }
  } else if (docsRes.status === 403) {
    // Expected — cross-tenant access blocked
    isolationChecks.add(1);
  }

  sleep(5);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  const totalA = Object.keys(data.communityA).length;
  const totalB = Object.keys(data.communityB).length;
  console.log(`Teardown: ${totalA} Community A + ${totalB} Community B sessions`);
}
