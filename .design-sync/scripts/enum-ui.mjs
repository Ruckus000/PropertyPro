import { Project, SyntaxKind } from 'ts-morph';
const ROOT='/Users/jphilistin/Documents/Coding/PropertyPro';
const p=new Project({tsConfigFilePath:ROOT+'/packages/ui/tsconfig.json',skipAddingFilesFromTsConfig:true,skipFileDependencyResolution:true});
const sf=p.addSourceFileAtPath(ROOT+'/packages/ui/src/index.ts');
const names=[];
for(const [n,decls] of sf.getExportedDeclarations()){
  if(!/^[A-Z][A-Za-z0-9]*$/.test(n))continue;
  const isType=decls.every(d=>d.getKind()===SyntaxKind.InterfaceDeclaration||d.getKind()===SyntaxKind.TypeAliasDeclaration);
  if(isType)continue;
  names.push(n);
}
console.log(JSON.stringify(names.sort(),null,2));
