// Build-time only: never import this module into the application runtime.
import ts from 'typescript';
import path from 'node:path';
import type { DataMap, Edge, Operation, Table, Process } from './types';
import { queryFields } from './fields';

const HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const INFRASTRUCTURE = /src\/lib\/(auth(?:[.-]|\/)|api-auth\.|db\/|data-map\/)/;
const walk = (node: ts.Node, visit: (n: ts.Node) => void) => {
  visit(node);
  node.forEachChild(child => walk(child, visit));
};
function literal(node: ts.Node | undefined): string | undefined {
  if (!node) return;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(s => '*' + s.literal.text).join('');
}
function routeOf(file: string) {
  return '/' + file.replace(/^src\/app\//, '').replace(/\/(page|route)\.[^.]+$/, '').replace(/^(page|route)\.[^.]+$/, '')
    .split('/').filter(p => p && !p.startsWith('(') && !p.startsWith('@')).join('/');
}
interface Module {
  source: ts.SourceFile;
  imports: Map<string, { file: string; name: string }>;
  declarations: Map<string, ts.Node>;
  exports: Map<string, string>;
}

export function analyze(files: Record<string, string>): DataMap {
  const modules = new Map<string, Module>();
  const resolve = (file: string, spec: string) => {
    const base = spec.startsWith('@/') ? 'src/' + spec.slice(2) : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : '';
    return [base, base + '.ts', base + '.tsx', base + '.js', base + '.jsx', base + '/index.ts', base + '/index.tsx'].find(p => files[p] !== undefined);
  };
  for (const [file, code] of Object.entries(files)) {
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const mod: Module = { source, imports: new Map(), declarations: new Map(), exports: new Map() };
    modules.set(file, mod);
    for (const s of source.statements) {
      if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
        const target = resolve(file, s.moduleSpecifier.text);
        if (!target || s.importClause?.isTypeOnly) continue;
        if (s.importClause?.name) mod.imports.set(s.importClause.name.text, { file: target, name: 'default' });
        const bindings = s.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const e of bindings.elements) {
          if (!e.isTypeOnly) mod.imports.set(e.name.text, { file: target, name: e.propertyName?.text ?? e.name.text });
        }
        if (bindings && ts.isNamespaceImport(bindings)) mod.imports.set(bindings.name.text, { file: target, name: '*' });
      }
      if (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) {
        const name = s.name?.text ?? 'default';
        mod.declarations.set(name, s);
        if (s.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) mod.exports.set('default', name);
      }
      if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) mod.declarations.set(d.name.text, d.initializer);
      }
      if (ts.isExportAssignment(s)) mod.declarations.set('default', s.expression);
      if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const e of s.exportClause.elements) {
          const target = s.moduleSpecifier ? resolve(file, literal(s.moduleSpecifier) ?? '') : undefined;
          if (target) mod.imports.set(e.name.text, { file: target, name: e.propertyName?.text ?? e.name.text });
          else mod.exports.set(e.name.text, e.propertyName?.text ?? e.name.text);
        }
      }
    }
  }
  const tables: Table[] = [];
  const schema = modules.get('src/lib/db/schema.ts');
  if (schema) for (const [symbol, node] of schema.declarations) {
    if (!ts.isCallExpression(node) || node.expression.getText(schema.source) !== 'pgTable') continue;
    const name = literal(node.arguments[0]);
    if (!name) continue;
    const columns: Table['columns'] = [];
    const object = node.arguments[1];
    if (object && ts.isObjectLiteralExpression(object)) for (const p of object.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      let base: ts.Expression = p.initializer;
      while (ts.isCallExpression(base) && ts.isPropertyAccessExpression(base.expression)) base = base.expression.expression;
      if (ts.isCallExpression(base)) columns.push({ property: p.name.getText(schema.source).replace(/['"]/g, ''), name: literal(base.arguments[0]) ?? p.name.getText(schema.source), type: base.expression.getText(schema.source) });
    }
    tables.push({ name, symbol, columns });
  }
  const bySymbol = new Map(tables.map(t => [t.symbol, t.name]));
  const apis = [...modules.keys()].filter(f => /^src\/app\/.*\/route\.[jt]sx?$/.test(f)).map(file => ({ file, route: routeOf(file) }));
  const matchApi = (url: string) => {
    const parts = url.split('?')[0].split('/').filter(Boolean);
    return apis.filter(api => {
      const route = api.route.split('/').filter(Boolean);
      return route.length === parts.length && route.every((p, i) => p === parts[i] || p.startsWith('['));
    }).sort((a, b) => (a.route.match(/\[/g)?.length ?? 0) - (b.route.match(/\[/g)?.length ?? 0));
  };
  const pages = [...modules.keys()].filter(f => /^src\/app\/(?!api\/).*\bpage\.[jt]sx?$/.test(f)).map(file => ({ file, route: routeOf(file), unresolved: [] as string[] })).sort((a, b) => a.route.localeCompare(b.route));
  const edges: Edge[] = [];
  const processes: Process[] = [];
  const roots = pages.map(page => ({ page, symbol: 'default', process: false }));
  for (const api of apis) {
    const mod = modules.get(api.file)!;
    for (const method of HTTP) if (mod.declarations.has(method) || mod.exports.has(method) || mod.imports.has(method)) {
      const process: Process = { file: api.file, route: `${method} ${api.route}`, kind: api.route.startsWith('/api/cron/') ? 'job' : 'api', unresolved: [] };
      processes.push(process); roots.push({ page: process, symbol: method, process: true });
    }
  }
  for (const file of modules.keys()) if (file.startsWith('scripts/') && !path.posix.basename(file).startsWith('_')) {
    const process: Process = { file, route: file, kind: 'script', unresolved: [] };
    processes.push(process); roots.push({ page: process, symbol: '__entry__', process: true });
  }
  const processEdges: Edge[] = [];
  for (const { page, symbol: entry, process } of roots) {
    const visited = new Set<string>();
    const warnings = new Set<string>();
    const found = new Map<string, Edge>();
    const trace = (file: string, symbol: string, via: string[]) => {
      if (INFRASTRUCTURE.test(file)) return;
      const mod = modules.get(file);
      if (!mod) return;
      const name = mod.exports.get(symbol) ?? symbol;
      const key = file + '#' + name;
      if (visited.has(key)) return;
      visited.add(key);
      const imported = mod.imports.get(name);
      if (imported) { trace(imported.file, imported.name, via); return; }
      const node = name === '__entry__' ? ts.factory.updateSourceFile(mod.source, mod.source.statements.filter(s => {
        if (ts.isImportDeclaration(s) || ts.isExportDeclaration(s) || ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) return false;
        if (ts.isVariableStatement(s)) return !s.declarationList.declarations.every(d => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)));
        return true;
      })) : mod.declarations.get(name);
      if (!node) { warnings.add(`Unresolved export ${symbol} in ${file}`); return; }
      const chain = [...via, `${file}#${symbol}`];
      const scopeImports = new Map(mod.imports);
      walk(node, child => {
        if (!ts.isVariableDeclaration(child) || !child.initializer) return;
        const initializer = ts.isAwaitExpression(child.initializer) ? child.initializer.expression : child.initializer;
        if (!ts.isCallExpression(initializer) || initializer.expression.kind !== ts.SyntaxKind.ImportKeyword) return;
        const spec = literal(initializer.arguments[0]);
        const target = spec ? resolve(file, spec) : undefined;
        if (!target) { warnings.add(`Unresolved dynamic import in ${file}`); return; }
        if (ts.isIdentifier(child.name)) scopeImports.set(child.name.text, { file: target, name: '*' });
        if (ts.isObjectBindingPattern(child.name)) for (const binding of child.name.elements) {
          if (ts.isIdentifier(binding.name)) scopeImports.set(binding.name.text, { file: target, name: binding.propertyName?.getText(mod.source) ?? binding.name.text });
        }
      });
      const tableFor = (arg: ts.Node | undefined) => {
        if (!arg) return;
        if (ts.isIdentifier(arg)) {
          const imp = scopeImports.get(arg.text);
          if (imp?.file === 'src/lib/db/schema.ts') return bySymbol.get(imp.name);
        }
        if (ts.isPropertyAccessExpression(arg) && ts.isIdentifier(arg.expression)) {
          const imp = scopeImports.get(arg.expression.text);
          if (imp?.file === 'src/lib/db/schema.ts') return bySymbol.get(arg.name.text);
        }
      };
      walk(node, n => {
        const line = mod.source.getLineAndCharacterOfPosition(n.getStart(mod.source)).line + 1;
        if (ts.isCallExpression(n)) {
          if (ts.isIdentifier(n.expression) && n.expression.text === 'fetch') {
            const url = literal(n.arguments[0]);
            let method: string | undefined = 'GET';
            const options = n.arguments[1];
            if (options && ts.isObjectLiteralExpression(options)) {
              for (const p of options.properties) {
                if (ts.isSpreadAssignment(p)) method = undefined;
                if (ts.isPropertyAssignment(p) && p.name.getText(mod.source).replace(/['"]/g, '') === 'method') method = literal(p.initializer)?.toUpperCase();
              }
            } else if (options) method = undefined;
            if (!url || !method || !HTTP.has(method)) warnings.add(`Unresolved request at ${file}:${line}`);
            else if (url.startsWith('/api/')) {
              const matches = matchApi(url);
              if (matches.length === 0 || (matches[1] && matches[0].route.split('[').length === matches[1].route.split('[').length)) warnings.add(`Unresolved endpoint ${method} ${url} at ${file}:${line}`);
              else trace(matches[0].file, method, [...chain, `${method} ${url.split('?')[0]}:${line}`]);
            } else if (url.includes('*') || url.startsWith('/')) warnings.add(`Unresolved request ${url} at ${file}:${line}`);
          }
          if (ts.isPropertyAccessExpression(n.expression)) {
            const operation: Operation | undefined = ({ from: 'READ', innerJoin: 'READ', leftJoin: 'READ', rightJoin: 'READ', fullJoin: 'READ', insert: 'CREATE', update: 'UPDATE', delete: 'DELETE', onConflictDoUpdate: 'UPDATE', returning: 'READ' } as Record<string, Operation>)[n.expression.name.text];
            let target = n.arguments[0];
            if (n.expression.name.text === 'onConflictDoUpdate' || n.expression.name.text === 'returning') {
              walk(n.expression.expression, child => {
                if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && ['insert', 'update', 'delete'].includes(child.expression.name.text)) target = child.arguments[0];
              });
            }
            const table = operation && tableFor(target);
            const databaseQuery = /^(db|tx|trx|transaction)\b/.test(n.expression.expression.getText(mod.source));
            if (operation && databaseQuery && !table) warnings.add(`Unresolved query table at ${file}:${line}`);
            if (table && operation && databaseQuery) {
              const id = `${table}:${operation}`;
              const edge = found.get(id) ?? { page: page.route, table, operation, evidence: [] };
              const fields = queryFields(n, tables.find(t => t.name === table)!, operation, tableFor);
              if (!edge.evidence.some(e => e.file === file && e.line === line && JSON.stringify(e.fields) === JSON.stringify(fields))) edge.evidence.push({ file, line, via: chain, fields });
              found.set(id, edge);
            }
            if (n.expression.name.text === 'execute' || /^(db|tx)\.query\./.test(n.expression.getText(mod.source))) warnings.add(`Query needs review at ${file}:${line}`);
          }
        }
        if (ts.isTaggedTemplateExpression(n) && /sql/i.test(n.tag.getText(mod.source))) warnings.add(`SQL expression needs review at ${file}:${line}`);
        if (ts.isIdentifier(n)) {
          // Property names and declaration names are not references to imported helpers.
          if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return;
          if (ts.isPropertyAssignment(n.parent) && n.parent.name === n) return;
          const imp = scopeImports.get(n.text);
          if (imp && imp.name !== '*') trace(imp.file, imp.name, chain);
          else if (mod.declarations.has(n.text) && n.text !== name) trace(file, n.text, chain);
        }
      });
    };
    trace(page.file, entry, []);
    page.unresolved = [...warnings];
    (process ? processEdges : edges).push(...found.values());
  }
  return { generatedAt: new Date().toISOString(), pages, tables, edges, processes, processEdges };
}
