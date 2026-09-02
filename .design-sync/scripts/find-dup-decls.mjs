// For each exported component, count how many emitted .d.ts files DECLARE that
// name. >1 == ambiguous == prop extraction can pick the wrong layer.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const ROOT='/Users/jphilistin/Documents/Coding/PropertyPro';
const DIST=join(ROOT,'.design-sync/entry/dist');
function walk(d,acc=[]){let es;try{es=readdirSync(d)}catch{return acc}
  for(const e of es){ if(e==='node_modules')continue;   // symlink to apps/web/node_modules
  const p=join(d,e); let st;try{st=statSync(p)}catch{continue}
  if(st.isDirectory())walk(p,acc); else if(e.endsWith('.d.ts'))acc.push(p);} return acc;}
const files=walk(DIST).filter(f=>!f.endsWith('dist/index.d.ts'));
const names=JSON.parse(readFileSync(ROOT+'/.design-sync/config.json','utf8')).componentSrcMap;
const decl={};
for(const f of files){
  const s=readFileSync(f,'utf8');
  for(const m of s.matchAll(/declare (?:const|function|class)\s+([A-Z][A-Za-z0-9]*)/g)){
    (decl[m[1]] ??= []).push(relative(DIST,f));
  }
}
const dups=Object.entries(decl).filter(([,v])=>v.length>1);
console.log(`emitted .d.ts files: ${files.length}`);
console.log(`ambiguous declared names: ${dups.length}`);
for(const [n,v] of dups) console.log(`  ${n}\n     ${v.join('\n     ')}`);
