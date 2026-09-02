// General rule: a *Props interface declared in packages/ui whose base name is an
// exported component that resolves to apps/web (or vice versa) will be borrowed
// by name, because extraction is name-based. Catches the non-duplicated case the
// earlier duplicate check could not see.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const ROOT='/Users/jphilistin/Documents/Coding/PropertyPro';
const DIST=join(ROOT,'.design-sync/entry/dist');
const cfg=JSON.parse(readFileSync(ROOT+'/.design-sync/config.json','utf8'));
function walk(d,acc=[]){let es;try{es=readdirSync(d)}catch{return acc}
  for(const e of es){if(e==='node_modules')continue;const p=join(d,e);
  let st;try{st=statSync(p)}catch{continue}
  if(st.isDirectory())walk(p,acc); else if(e.endsWith('.d.ts'))acc.push(p);} return acc;}
const decl={};
for(const f of walk(DIST)){
  const rel=relative(DIST,f);
  for(const m of readFileSync(f,'utf8').matchAll(/(?:^|\n)\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+([A-Z][A-Za-z0-9]*)Props\b/g))
    (decl[m[1]] ??= new Set()).add(rel);
}
const risk=[];
for(const [comp,src] of Object.entries(cfg.componentSrcMap)){
  if(!src) continue;
  const where=decl[comp]; if(!where) continue;
  const wantsUi = src.includes('packages/ui');
  for(const w of where){
    const isUi = w.startsWith('packages/ui');
    if(isUi !== wantsUi) risk.push([comp, `${comp}Props declared in ${w}`, `component resolves to ${src.replace('../../','')}`]);
  }
}
console.log(`cross-layer Props borrowings: ${risk.length}`);
for(const [c,a,b] of risk) console.log(`  ${c}\n     ${a}\n     ${b}`);
