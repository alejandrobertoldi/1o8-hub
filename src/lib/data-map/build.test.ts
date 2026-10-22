import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('prebuild uses the committed manifest when deployment excludes scripts, and rejects invalid JSON', () => {
  const root = process.cwd();
  expect(readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/)).toContain('scripts/');
  const deployment = mkdtempSync(path.join(tmpdir(), 'data-map-build-'));
  try {
    mkdirSync(path.join(deployment, 'src/generated'), { recursive: true });
    copyFileSync(path.join(root, 'package.json'), path.join(deployment, 'package.json'));
    const manifest = path.join(deployment, 'src/generated/data-map.json');
    copyFileSync(path.join(root, 'src/generated/data-map.json'), manifest);
    const build = () => execFileSync('npm', ['run', 'prebuild'], { cwd: deployment, timeout: 15000, stdio: 'pipe' });
    expect(() => build()).not.toThrow();
    writeFileSync(manifest, '{invalid');
    expect(() => build()).toThrow();
  } finally { rmSync(deployment, { recursive: true, force: true }); }
}, 30000);
