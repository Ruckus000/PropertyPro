import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = '/Users/jphilistin/Documents/Coding/PropertyPro';
const app = JSON.parse(readFileSync(ROOT + '/.design-sync/.app-exports.json', 'utf8'));
const ui  = JSON.parse(readFileSync(ROOT + '/.design-sync/.ui-exports.json', 'utf8'));

const UI_EXCLUDE = new Set(['Button', 'Card']);
const UI_RENAME  = { StatusBadge: 'UiStatusBadge', Label: 'UiLabel' };
const APP_RENAME = { 'apps/web/src/components/ui/badge.tsx': { Badge: 'ShadcnBadge' } };

// packages/ui source file per exported name (barrels re-export from these).
const UI_SRC = {
  Badge: 'components/Badge.tsx', PriorityBadge: 'components/Badge.tsx',
  StatusBadge: 'components/Badge.tsx', PlanBadge: 'components/PlanBadge.tsx',
  NavRail: 'components/NavRail.tsx', PhoneFrame: 'components/PhoneFrame.tsx',
  Box: 'primitives/Box.tsx', Stack: 'primitives/Stack.tsx', HStack: 'primitives/Stack.tsx',
  VStack: 'primitives/Stack.tsx', Center: 'primitives/Stack.tsx', Spacer: 'primitives/Stack.tsx',
  Text: 'primitives/Text.tsx', Heading: 'primitives/Text.tsx', Label: 'primitives/Text.tsx',
  Caption: 'primitives/Text.tsx', Code: 'primitives/Text.tsx', Paragraph: 'primitives/Text.tsx',
};

const srcMap = {};
for (const n of ui) {
  if (UI_EXCLUDE.has(n)) { srcMap[n] = null; continue; }   // explicit exclude
  const out = UI_RENAME[n] ?? n;
  if (UI_SRC[n]) srcMap[out] = `../../packages/ui/src/${UI_SRC[n]}`;
}
for (const [rel, names] of Object.entries(app)) {
  const ren = APP_RENAME[rel] ?? {};
  for (const n of names) srcMap[ren[n] ?? n] = `../../${rel}`;
}

const cfg = {
  pkg: '@propertypro/design-system',
  globalName: 'PropertyPro',
  shape: 'package',
  srcDir: '../..',
  tsconfig: 'apps/web/tsconfig.json',
  buildCmd: 'node .ds-sync/gen-barrel.mjs && ./node_modules/.bin/tsc -p .design-sync/entry/tsconfig.json --noCheck && apps/web/node_modules/.bin/tailwindcss -c .design-sync/tailwind.config.ts -i apps/web/src/app/globals.css -o .design-sync/.cache/ds.css --minify',
  cssEntry: '../.cache/ds.css',
  tokensGlob: '../../packages/ui/src/styles/tokens.css',
  extraFonts: ['../fonts.css'],
  componentSrcMap: srcMap,
};
writeFileSync(ROOT + '/.design-sync/config.json', JSON.stringify(cfg, null, 2) + '\n');
const pinned = Object.values(srcMap).filter(Boolean).length;
const excluded = Object.values(srcMap).filter((v) => v === null).length;
console.error(`componentSrcMap: ${pinned} pinned, ${excluded} excluded`);
