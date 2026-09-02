// The compiled sheet is JIT-scoped to classes EXISTING components use. But the
// design agent writes NEW markup with this design language - any semantic class
// no current component happens to use would emit zero CSS and render silently
// unstyled. So enumerate the whole vocabulary into a file that Tailwind scans,
// making the shipped CSS cover the design language rather than today's usage.
import { createRequire } from 'node:module';
import { at } from './repo-root.mjs';
import { writeFileSync } from 'node:fs';
// Resolve jiti as tailwindcss's OWN dependency rather than by store path.
// The previous form hardcoded node_modules/.pnpm/jiti@1.21.7/... — pinned to
// both the path AND the version, so any jiti bump broke the build silently.
const reqWeb = createRequire(at('apps/web/'));
const reqTailwind = createRequire(reqWeb.resolve('tailwindcss/package.json'));
const jiti = reqTailwind('jiti')(import.meta.url);
const cfg = jiti(at('apps/web/tailwind.config.ts')).default;
const colors = cfg.theme.extend.colors;

const out = new Set();
const push = (c) => out.add(c);
const VARIANTS = ['', 'hover:', 'focus:', 'active:', 'disabled:', 'group-hover:', 'focus-visible:'];

// colour families -> the utilities that consume them
const PREFIX = {
  content: ['text'], surface: ['bg'], edge: ['border'],
  interactive: ['bg', 'text', 'border'], status: ['text', 'bg', 'border'],
  nav: ['text', 'bg'],
};
for (const [family, val] of Object.entries(colors)) {
  const prefixes = PREFIX[family];
  if (!prefixes || typeof val !== 'object') continue;
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object' && v !== null) { walk(v, k === 'DEFAULT' ? path : [...path, k]); continue; }
      const seg = k === 'DEFAULT' ? path : [...path, k];
      for (const p of prefixes) for (const va of VARIANTS) push(`${va}${p}-${family}${seg.length ? '-' + seg.join('-') : ''}`);
    }
  };
  walk(val, []);
}
// ring / shadow / radius / motion scales that map to tokens
for (const k of Object.keys(cfg.theme.extend.ringColor ?? {})) { push(`ring-${k}`); push(`focus:ring-${k}`); }
for (const k of Object.keys(cfg.theme.extend.boxShadow ?? {})) push(k === 'DEFAULT' ? 'shadow' : `shadow-${k}`);
for (const k of Object.keys(cfg.theme.extend.borderRadius ?? {})) push(k === 'DEFAULT' ? 'rounded' : `rounded-${k}`);
for (const k of Object.keys(cfg.theme.extend.fontSize ?? {})) push(`text-${k}`);
for (const k of Object.keys(cfg.theme.extend.fontFamily ?? {})) push(`font-${k}`);
for (const k of Object.keys(cfg.theme.extend.transitionDuration ?? {})) push(`duration-${k}`);
for (const k of Object.keys(cfg.theme.extend.spacing ?? {})) {
  for (const p of ['p','px','py','pt','pb','pl','pr','m','mx','my','mt','mb','gap','gap-x','gap-y','space-y','space-x','w','h','min-w','min-h','max-w','top','bottom','left','right','inset'])
    push(`${p}-${k}`);
}
// High-frequency LAYOUT utilities. The semantic colour matrix above is the
// critical part, but a design agent also writes ordinary layout, and a class it
// reaches for that no current component uses would emit nothing.
const SCALE = ['0','px','0.5','1','1.5','2','2.5','3','3.5','4','5','6','7','8','9','10','11','12','14','16','20','24','28','32','36','40','48','56','64','72','80','96'];
for (const n of SCALE) for (const p of ['w','h','min-w','min-h','max-w','max-h','p','px','py','pt','pb','pl','pr','m','mx','my','mt','mb','ml','mr','gap','gap-x','gap-y','space-y','space-x','top','bottom','left','right'])
  push(`${p}-${n}`);
for (const n of ['full','screen','min','max','fit','auto','px','1/2','1/3','2/3','1/4','3/4']) for (const p of ['w','h','min-w','min-h','max-w','max-h'])
  push(`${p}-${n}`);
for (const n of ['xs','sm','md','lg','xl','2xl','3xl','4xl','5xl','6xl','7xl','prose','none','full']) push(`max-w-${n}`);
for (const c of ['flex','inline-flex','grid','inline-grid','block','inline-block','inline','hidden','contents','table',
  'flex-row','flex-col','flex-wrap','flex-nowrap','flex-1','flex-auto','flex-none','flex-initial','grow','grow-0','shrink','shrink-0',
  'items-start','items-center','items-end','items-baseline','items-stretch',
  'justify-start','justify-center','justify-end','justify-between','justify-around','justify-evenly',
  'self-start','self-center','self-end','self-stretch','content-center','place-items-center',
  'relative','absolute','fixed','sticky','static','inset-0','z-0','z-10','z-20','z-30','z-40','z-50',
  'overflow-hidden','overflow-auto','overflow-x-auto','overflow-y-auto','overflow-visible','overflow-scroll',
  'truncate','text-left','text-center','text-right','text-justify','whitespace-nowrap','break-words','text-wrap','text-balance',
  'font-normal','font-medium','font-semibold','font-bold','italic','uppercase','lowercase','capitalize','underline','line-through',
  'leading-none','leading-tight','leading-snug','leading-normal','leading-relaxed','leading-loose',
  'tracking-tight','tracking-normal','tracking-wide','border','border-0','border-2','border-t','border-b','border-l','border-r',
  'border-solid','border-dashed','cursor-pointer','cursor-not-allowed','select-none','pointer-events-none',
  'opacity-0','opacity-50','opacity-60','opacity-70','opacity-100','transition','transition-all','transition-colors',
  'object-cover','object-contain','aspect-square','aspect-video','list-none','list-disc','antialiased',
  'sr-only','ring-0','ring-1','ring-2','outline-none','divide-y','divide-x'])
  push(c);
for (const n of ['1','2','3','4','5','6','7','8','9','10','11','12','none']) { push(`grid-cols-${n}`); push(`col-span-${n}`); push(`grid-rows-${n}`); }
// responsive + state variants on the layout set
for (const bp of ['sm:','md:','lg:','xl:']) for (const n of ['1','2','3','4','5','6'])
  { push(`${bp}grid-cols-${n}`); push(`${bp}col-span-${n}`); }
for (const bp of ['sm:','md:','lg:','xl:']) for (const c of ['flex','grid','hidden','block','flex-row','flex-col','items-center','justify-between','text-left'])
  push(`${bp}${c}`);
for (const s of ['hover:','focus:','focus-visible:','disabled:','group-hover:']) for (const c of ['underline','opacity-100','opacity-70','shadow-md','shadow-lg','cursor-pointer','ring-2','border'])
  push(`${s}${c}`);

writeFileSync(at('.design-sync/vocabulary.txt'),
  [...out].sort().join('\n') + '\n');
console.error(`vocabulary: ${out.size} class tokens`);
