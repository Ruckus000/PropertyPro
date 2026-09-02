import { Project, SyntaxKind } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = '/Users/jphilistin/Documents/Coding/PropertyPro';
const project = new Project({
  tsConfigFilePath: join(ROOT, 'apps/web/tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

function filesIn(dir) {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .filter((f) => !f.includes('.test.') && !f.includes('.spec.'))
    .map((f) => join(dir, f));
}

const targets = [
  ...filesIn('apps/web/src/components/ui'),
  ...filesIn('apps/web/src/components/shared'),
  'apps/web/src/components/layout/page-container.tsx',
];

const out = {};
for (const rel of targets) {
  const sf = project.addSourceFileAtPath(join(ROOT, rel));
  const names = [];
  for (const [name, decls] of sf.getExportedDeclarations()) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;
    // value exports only - drop pure types/interfaces
    const isType = decls.every((d) =>
      d.getKind() === SyntaxKind.InterfaceDeclaration ||
      d.getKind() === SyntaxKind.TypeAliasDeclaration);
    if (isType) continue;
    names.push(name);
  }
  if (names.length) out[rel] = names.sort();
}
console.log(JSON.stringify(out, null, 2));
const total = Object.values(out).reduce((a, b) => a + b.length, 0);
console.error(`FILES ${Object.keys(out).length}  COMPONENTS ${total}`);
