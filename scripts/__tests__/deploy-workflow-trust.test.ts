/**
 * Deploy runs production secrets (`vercel pull --environment=production`, VERCEL_TOKEN,
 * SCHEMA_CHECK_DATABASE_URL) against the commit CI ran on. `workflow_run`'s
 * `branches: [main]` filter matches the TRIGGERING run's head branch, which for a
 * fork pull request is the fork's own branch name, so a fork PR from a branch called
 * `main` used to pass it. These tests pin the guard that only a push to this
 * repository can start a deploy (2026-11-23 security sweep, finding 1).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(
  join(here, '..', '..', '.github', 'workflows', 'deploy.yml'),
  'utf8',
);

interface Job {
  name: string;
  if?: string;
  needs: string[];
}

/** Top-level jobs with their `if:` and `needs:` (both are single-line in this file). */
function parseJobs(text: string): Job[] {
  const jobsAt = text.search(/^jobs:\s*$/m);
  if (jobsAt === -1) throw new Error('deploy.yml has no jobs: block');
  const jobs: Job[] = [];
  for (const line of text.slice(jobsAt).split('\n').slice(1)) {
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header) {
      jobs.push({ name: header[1]!, needs: [] });
      continue;
    }
    const current = jobs.at(-1);
    if (!current) continue;
    const cond = /^ {4}if:\s*(.+)$/.exec(line);
    if (cond) current.if = cond[1]!.trim();
    const needs = /^ {4}needs:\s*\[(.*)\]\s*$/.exec(line);
    if (needs) current.needs = needs[1]!.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return jobs;
}

const jobs = parseJobs(workflow);
const job = (name: string): Job => {
  const found = jobs.find((j) => j.name === name);
  if (!found) throw new Error(`deploy.yml has no job "${name}"`);
  return found;
};

const PUSH_ONLY = "github.event.workflow_run.event == 'push'";
const THIS_REPO = 'github.event.workflow_run.head_repository.full_name == github.repository';
const DISPATCH = "github.event_name == 'workflow_dispatch'";

describe('deploy.yml trust guard', () => {
  it('parses the expected jobs (a parser that finds nothing would pass vacuously)', () => {
    expect(jobs.map((j) => j.name)).toEqual(
      expect.arrayContaining(['gate', 'schema', 'deploy-production', 'deploy-admin']),
    );
  });

  it('deploy gate refuses workflow_run events that are not a push to this repository', () => {
    const cond = job('gate').if ?? '';
    expect(cond).toContain(PUSH_ONLY);
    expect(cond).toContain(THIS_REPO);
    expect(cond).toContain(DISPATCH);
  });

  it('schema job carries the same trust guard', () => {
    const cond = job('schema').if ?? '';
    expect(cond).toContain(PUSH_ONLY);
    expect(cond).toContain(THIS_REPO);
    expect(cond).toContain(DISPATCH);
  });

  it('every other job depends on a guarded job and has no if: that could override the skip', () => {
    const guarded = new Set(['gate', 'schema']);
    for (const j of jobs.filter((x) => !guarded.has(x.name))) {
      expect(j.needs.some((n) => guarded.has(n)), `${j.name} needs a guarded job`).toBe(true);
      // `if: always()` / `!cancelled()` would run a job whose guarded dependency was skipped.
      expect(j.if, `${j.name} must not carry its own if:`).toBeUndefined();
    }
  });
});
