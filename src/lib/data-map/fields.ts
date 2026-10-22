// Build-time field usage, scoped to a single query chain and table.
import ts from 'typescript';
import type { FieldUsage, Operation, Table } from './types';

export function queryFields(node: ts.CallExpression, table: Table, operation: Operation, tableFor: (n: ts.Node | undefined) => string | undefined): FieldUsage {
  let root: ts.Node = node;
  while (root.parent && ((ts.isPropertyAccessExpression(root.parent) && root.parent.expression === root) || (ts.isCallExpression(root.parent) && root.parent.expression === root))) root = root.parent;
  const calls: ts.CallExpression[] = [];
  let current = root;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    calls.push(current);
    current = current.expression.expression;
  }
  const method = (call: ts.CallExpression) => (call.expression as ts.PropertyAccessExpression).name.text;
  const columns = new Set<string>();
  const filters = new Set<string>();
  let unknown = false, allColumns = false;
  const references = (n: ts.Node, into: Set<string>) => {
    let hasTableReference = false;
    const visit = (child: ts.Node) => {
      if (ts.isPropertyAccessExpression(child) && tableFor(child.expression)) {
        hasTableReference = true;
        if (tableFor(child.expression) === table.name) {
          const column = table.columns.find(c => c.property === child.name.text);
          if (column) into.add(column.name);
        }
      }
      child.forEachChild(visit);
    };
    visit(n);
    return hasTableReference;
  };
  const objectFields = (n: ts.Node | undefined) => {
    if (n && ts.isArrayLiteralExpression(n)) { n.elements.forEach(objectFields); return; }
    if (!n || !ts.isObjectLiteralExpression(n)) { unknown = true; return; }
    for (const p of n.properties) {
      if (ts.isSpreadAssignment(p) || !p.name || ts.isComputedPropertyName(p.name)) { unknown = true; continue; }
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
      const column = table.columns.find(c => c.property === key);
      if (column) columns.add(column.name); else unknown = true;
    }
  };
  for (const call of calls) {
    const name = method(call);
    if (['where', 'having', 'orderBy', 'groupBy'].includes(name)) call.arguments.forEach(n => references(n, filters));
    if (name.endsWith('Join') && call.arguments[1]) references(call.arguments[1], filters);
  }
  if (operation === 'READ') {
    const select = calls.find(c => ['select', 'selectDistinct', 'selectDistinctOn', 'returning'].includes(method(c)));
    const projection = select?.arguments[select && method(select) === 'selectDistinctOn' ? 1 : 0];
    if (select && !projection) {
      allColumns = true;
      table.columns.forEach(c => columns.add(c.name));
    } else if (projection && ts.isObjectLiteralExpression(projection)) {
      for (const p of projection.properties) {
        if (ts.isSpreadAssignment(p)) { unknown = true; continue; }
        if (!ts.isPropertyAssignment(p)) { unknown = true; continue; }
        if (tableFor(p.initializer) === table.name) { allColumns = true; table.columns.forEach(c => columns.add(c.name)); }
        else if (!references(p.initializer, columns) && !ts.isLiteralExpression(p.initializer)) unknown = true;
      }
    } else unknown = true;
  } else if (operation === 'CREATE') objectFields(calls.find(c => method(c) === 'values')?.arguments[0]);
  else if (operation === 'UPDATE') {
    const conflict = calls.find(c => method(c) === 'onConflictDoUpdate')?.arguments[0];
    if (conflict && ts.isObjectLiteralExpression(conflict)) {
      const set = conflict.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText().replace(/['"]/g, '') === 'set');
      objectFields(set && ts.isPropertyAssignment(set) ? set.initializer : undefined);
    } else objectFields(calls.find(c => method(c) === 'set')?.arguments[0]);
  }
  return { columns: [...columns].sort(), filters: [...filters].sort(), unknown, allColumns };
}
