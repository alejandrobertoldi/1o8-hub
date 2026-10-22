import ts from 'typescript';
import type { DataMap } from './types';

/** Schema-declared keys only. Record/index-signature content stays unknown. */
export function declaredJsonPaths(source: string): NonNullable<DataMap['jsonFields']> {
  const file = ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, true);
  const types = new Map<string, ts.TypeNode>();
  for (const s of file.statements) if (ts.isTypeAliasDeclaration(s)) types.set(s.name.text, s.type);
  const result: NonNullable<DataMap['jsonFields']> = [];
  function keys(node: ts.TypeNode, prefix = '', seen = new Set<string>()): { path: string; label: string }[] {
    if (seen.size > 8) return [];
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText(file);
      if (name === 'Array' && node.typeArguments?.[0]) return keys(node.typeArguments[0], `${prefix}[]`, seen);
      if (seen.has(name) || !types.has(name)) return [];
      return keys(types.get(name)!, prefix, new Set([...seen, name]));
    }
    if (ts.isArrayTypeNode(node)) return keys(node.elementType, `${prefix}[]`, seen);
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) return node.types.flatMap(n => keys(n, prefix, seen));
    if (!ts.isTypeLiteralNode(node)) return [];
    return node.members.flatMap(m => {
      if (!ts.isPropertySignature(m) || !m.type || !m.name || (!ts.isIdentifier(m.name) && !ts.isStringLiteral(m.name))) return [];
      const label = m.name.text, path = prefix ? `${prefix}.${label}` : label;
      return [{ path, label }, ...keys(m.type, path, seen)];
    });
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'pgTable' && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
      const table = node.arguments[0].text;
      for (const p of node.arguments[1].properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        let column: string | undefined, type: ts.TypeNode | undefined;
        function find(n: ts.Node) {
          if (ts.isCallExpression(n)) {
            if (ts.isIdentifier(n.expression) && n.expression.text === 'jsonb' && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) column = n.arguments[0].text;
            if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === '$type') type = n.typeArguments?.[0];
          }
          ts.forEachChild(n, find);
        }
        find(p.initializer);
        if (column && type) result.push(...keys(type).map(k => ({ table, column: column!, ...k })));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...new Map(result.map(f => [`${f.table}.${f.column}.${f.path}`, f])).values()];
}
