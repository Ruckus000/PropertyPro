import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './repo-root.mjs';
const DIST = `${ROOT}/.design-sync/entry/dist`;
function walk(d,acc=[]){let es;try{es=readdirSync(d)}catch{return acc}
  for(const e of es){ if(e==='node_modules')continue;
  const p=join(d,e); let st;try{st=statSync(p)}catch{continue}
  if(st.isDirectory())walk(p,acc); else if(e.endsWith('.d.ts'))acc.push(p);} return acc;}
const files=walk(DIST).filter(f=>!f.endsWith('dist/index.d.ts'));
const decl={};
for(const f of files){
  const s=readFileSync(f,'utf8');
  for(const m of s.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+([A-Z][A-Za-z0-9]*)/g))
    (decl[m[1]] ??= new Set()).add(relative(DIST,f));
}
const dups=Object.entries(decl).filter(([n,v])=>v.size>1 && n.endsWith('Props'));
console.log(`duplicate *Props type names: ${dups.length}`);
for(const [n,v] of dups) console.log(`  ${n}\n     ${[...v].join('\n     ')}`);
