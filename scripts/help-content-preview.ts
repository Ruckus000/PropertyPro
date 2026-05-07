#!/usr/bin/env tsx
/**
 * Author preview tool — validate one or more help MDX files locally without
 * spinning up the dev server. Useful for content authors making frontmatter
 * edits who want fast feedback before opening a PR.
 *
 * Usage:
 *   pnpm exec tsx scripts/help-content-preview.ts <path/to/article.mdx> [more...]
 *
 * Exits 0 when every file parses cleanly; exits 1 (with a per-file error
 * report) when any file fails the same schema the CI guard uses.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import matter from 'gray-matter';
import { validateFrontmatter } from '../apps/web/src/lib/help/frontmatter-schema';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      'Usage: pnpm exec tsx scripts/help-content-preview.ts <article.mdx> [more...]',
    );
    process.exit(2);
  }

  let failures = 0;

  for (const arg of args) {
    const filePath = resolve(process.cwd(), arg);
    let raw: string;
    try {
      statSync(filePath);
      raw = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`✗ ${arg}: cannot read file (${(err as Error).message})`);
      failures += 1;
      continue;
    }

    const { data, content } = matter(raw);
    const result = validateFrontmatter(data);

    if (!result.ok) {
      console.error(`✗ ${arg}: ${result.errors.length} schema error(s)`);
      for (const err of result.errors) {
        console.error(`    ${err.path}: ${err.message}`);
      }
      failures += 1;
      continue;
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const readMinutes = Math.max(1, Math.ceil(wordCount / 200));
    const meta = result.value;
    console.log(`✓ ${arg}`);
    console.log(`    title:      ${meta.title}`);
    console.log(`    slug:       ${meta.slug}`);
    console.log(`    category:   ${meta.category}`);
    console.log(`    updatedAt:  ${meta.updatedAt}`);
    console.log(`    roles:      [${meta.roles.join(', ') || '(any)'}]`);
    if (meta.featureGates?.length) {
      console.log(`    gates:      [${meta.featureGates.join(', ')}]`);
    }
    if (meta.statutes?.length) {
      console.log(`    statutes:   [${meta.statutes.join(', ')}]`);
    }
    console.log(`    body:       ${wordCount} words (~${readMinutes} min read)`);
  }

  if (failures > 0) {
    console.error(`\n${failures} file(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\n${args.length} file(s) OK.`);
  process.exit(0);
}

main();
