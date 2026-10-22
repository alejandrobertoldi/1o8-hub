import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/lib/data-map/analyze';
import { declaredJsonPaths } from '../src/lib/data-map/json-paths';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function inventory(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.map(e => {
    const absolute = path.join(directory, e.name);
    if (e.isDirectory()) return absolute === path.join(root, 'src/generated') || absolute === path.join(root, 'src/lib/data-map') || absolute === path.join(root, 'src/components/data-map') ? [] : inventory(absolute);
    return /\.[jt]sx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.startsWith('_') ? [absolute] : [];
  }));
  return lists.flat();
}
async function main() {
  const paths = [...await inventory(path.join(root, 'src')), ...await inventory(path.join(root, 'scripts'))];
  const files = Object.fromEntries(await Promise.all(paths.map(async file => [path.relative(root, file).split(path.sep).join('/'), await readFile(file, 'utf8')])));
  const map = analyze(files);
  map.jsonFields = declaredJsonPaths(files['src/lib/db/schema.ts']);
  await mkdir(path.join(root, 'src/generated'), { recursive: true });
  await writeFile(path.join(root, 'src/generated/data-map.json'), JSON.stringify(map));
  console.log(`Data Map: ${map.pages.length} pages, ${map.tables.length} tables, ${map.edges.length} connections. ${map.pages.filter(p => p.unresolved.length).length} pages need review.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
