// Verifies that class tokens used by the DS sources (and, when --previews is
// passed, by authored previews) actually emit CSS in the compiled sheet.
// A byte-count gate is a proxy; this is the real question.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/jphilistin/Documents/Coding/PropertyPro';
const CSS = readFileSync(join(ROOT, '.design-sync/entry/generated.css'), 'utf8');
const args = process.argv.slice(2);
const previewMode = args.includes('--previews');

const dirs = previewMode
  ? ['.design-sync/previews']
  : ['apps/web/src/components/ui', 'apps/web/src/components/shared',
     'packages/ui/src/components', 'packages/ui/src/primitives'];

function walk(d, acc = []) {
  let ents; try { ents = readdirSync(join(ROOT, d)); } catch { return acc; }
  for (const e of ents) {
    const p = join(d, e);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, acc);
    else if (/\.(tsx|jsx)$/.test(e) && !/\.(test|spec)\./.test(e)) acc.push(p);
  }
  return acc;
}

const files = dirs.flatMap((d) => walk(d));
const CLASS_RX = /^(?:[a-z]{1,12}:)*-?[a-z][a-z0-9]*(?:-[a-z0-9.]+)*(?:\[[^\]]+\])?(?:\/[0-9]+)?$/;
const tokens = new Set();
// Only look INSIDE class contexts: className="..."/{...}, cn(...), cva(...),
// and *Variants maps. A blanket string scan pulls in import paths, 'use client'
// and prop values, which are not classes and produce false "missing" hits.
const CTX_RX = /(?:className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]{0,1200}?)\})|\bcn\(([\s\S]{0,1200}?)\)|\bcva\(([\s\S]{0,3000}?)\n\s*\))/g;
const BARE_OK = new Set(['flex','grid','block','inline','hidden','relative','absolute','fixed','sticky','static','border','rounded','italic','underline','truncate','uppercase','lowercase','capitalize','container','transition','transform','overflow','group','peer','sr','contents','table','isolate','antialiased','invisible','visible','resize','appearance','outline','ring','shadow','filter','grayscale','blur','sticky']);
const looksClassy = (t) => t.includes('-') || t.includes(':') || t.includes('[') || BARE_OK.has(t);
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  for (const m of src.matchAll(CTX_RX)) {
    const chunk = (m[1] ?? '') + ' ' + (m[2] ?? '') + ' ' + (m[3] ?? '') + ' ' + (m[4] ?? '') + ' ' + (m[5] ?? '');
    for (const raw of chunk.split(/[\s"'`,]+/)) {
      const t = raw.trim();
      if (!t || t.length < 2) continue;
      if (!CLASS_RX.test(t)) continue;
      if (!looksClassy(t)) continue;
      tokens.add(t);
    }
  }
}
const esc = (c) => c.replace(/[.:/[\]()#,%+*~^$|?{}\\<>!=&'"@]/g, (ch) => '\\' + ch);
const missing = [...tokens].filter((t) => !CSS.includes('.' + esc(t)));
const covered = tokens.size - missing.length;
console.log(`scanned files: ${files.length}`);
console.log(`candidate class tokens: ${tokens.size}`);
console.log(`covered by compiled CSS: ${covered} (${((covered / tokens.size) * 100).toFixed(1)}%)`);
if (missing.length) {
  console.log(`\nNOT emitting CSS (${missing.length}) - first 40:`);
  console.log(missing.slice(0, 40).join('\n'));
}
process.exit(previewMode && missing.length ? 1 : 0);
