// The emitted .d.ts tree declares 5 component names TWICE (packages/ui vs
// apps/web). The converter looks props up by NAME, so it can pick the wrong
// layer - e.g. Button resolving to the @deprecated packages/ui one, shipping
// `variant="primary"|"danger"` to the design agent instead of shadcn's
// `variant="default"|"destructive"|...`.
//
// Fix the TREE, not the extractor: rename the losing declaration so every
// exported name resolves to exactly one declaration. ts-morph updates all
// references, including the barrel's re-export aliases.
// dist/ is generated (gitignored) and rebuilt by cfg.buildCmd, so this is a
// deterministic post-emit step, never a hand edit.
import { Project } from 'ts-morph';
const DIST = '/Users/jphilistin/Documents/Coding/PropertyPro/.design-sync/entry/dist';

// [file, declaredName, newName, why]
const RENAMES = [
  ['packages/ui/src/components/Button.d.ts', 'Button', 'PpUiDeprecatedButton', 'not exported; frees Button for shadcn'],
  ['packages/ui/src/components/Card.d.ts',   'Card',   'PpUiDeprecatedCard',   'not exported; frees Card for shadcn'],
  ['apps/web/src/components/ui/badge.d.ts',  'Badge',  'ShadcnBadge',          'exported as ShadcnBadge'],
  ['packages/ui/src/primitives/Text.d.ts',   'Label',  'UiLabel',              'exported as UiLabel'],
  ['packages/ui/src/components/Badge.d.ts',  'StatusBadge', 'UiStatusBadge',   'exported as UiStatusBadge'],
];

// Props INTERFACES collide too, and extraction looks up `<Name>Props` by name.
// Renaming only the value declaration is not enough: shadcn's Card has no Props
// interface at all, so it would silently borrow packages/ui's CardProps.
// [file, declaredTypeName, newName]
const TYPE_RENAMES = [
  ['packages/ui/src/components/Button.d.ts', 'ButtonProps', 'PpUiDeprecatedButtonProps'],
  ['packages/ui/src/components/Card.d.ts',   'CardProps',   'PpUiDeprecatedCardProps'],
  ['apps/web/src/components/ui/badge.d.ts',  'BadgeProps',  'ShadcnBadgeProps'],
  ['packages/ui/src/components/Badge.d.ts',  'StatusBadgeProps', 'UiStatusBadgeProps'],
  // packages/ui declares NON-EXPORTED CardHeaderProps/CardFooterProps for its
  // compound Card.Header / Card.Footer slots. shadcn's CardHeader/CardFooter
  // have no Props interface of their own, so extraction borrowed these by name
  // and shipped a phantom `bordered` prop that does nothing. Not caught by the
  // duplicate-name check: these exist in exactly ONE place - the wrong one.
  ['packages/ui/src/components/Card.d.ts',   'CardHeaderProps', 'PpUiDeprecatedCardHeaderProps'],
  ['packages/ui/src/components/Card.d.ts',   'CardFooterProps', 'PpUiDeprecatedCardFooterProps'],
];

const project = new Project({ compilerOptions: { skipLibCheck: true } });
project.addSourceFilesAtPaths([`${DIST}/**/*.d.ts`]);

let done = 0;
for (const [rel, from, to, why] of RENAMES) {
  const sf = project.getSourceFile(`${DIST}/${rel}`);
  if (!sf) { console.error(`! missing ${rel}`); continue; }
  const decl =
    sf.getVariableDeclaration(from) ?? sf.getFunction(from) ?? sf.getClass(from);
  if (!decl) { console.error(`! ${from} not declared in ${rel}`); continue; }
  decl.rename(to);
  console.error(`  ${from} -> ${to}  (${rel}) — ${why}`);
  done++;
}
for (const [rel, from, to] of TYPE_RENAMES) {
  const sf = project.getSourceFile(`${DIST}/${rel}`);
  if (!sf) { console.error(`! missing ${rel}`); continue; }
  const t = sf.getInterface(from) ?? sf.getTypeAlias(from);
  if (!t) { console.error(`! type ${from} not in ${rel}`); continue; }
  t.rename(to);
  console.error(`  type ${from} -> ${to}  (${rel})`);
  done++;
}
project.saveSync();
console.error(`renamed ${done}/${RENAMES.length + TYPE_RENAMES.length}`);
