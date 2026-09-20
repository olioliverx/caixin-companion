import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'scripts/package.js');
test('public package excludes secrets, server, accounts and paid content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caixin-package-'));
  try {
    for (const name of ['src', 'assets', 'docs', 'manifest.json', 'LICENSE']) cpSync(join(root, name), join(dir, name), { recursive: true });
    writeFileSync(join(dir, '.env'), 'SECRET_DO_NOT_PACKAGE');
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, env: { PATH: process.env.PATH }, encoding: 'utf8' });
    const built = run();
    assert.equal(built.status, 0, built.stderr);
    const archive = readFileSync(join(dir, 'dist/caixin-companion.zip'));
    assert.equal(archive.includes(Buffer.from('SECRET_DO_NOT_PACKAGE')), false);
    for (const excluded of ['src/billing.js', 'src/config.js', 'server/', '.env']) assert.equal(archive.includes(Buffer.from(excluded)), false);
    for (const required of ['docs/PRIVACY.html', 'docs/SUPPORT.html', 'LICENSE', 'src/theme.js', 'src/wonder.scoped.css']) assert.equal(archive.includes(Buffer.from(required)), true);
    writeFileSync(join(dir, 'src/database.sqlite'), 'secret');
    assert.match(run('--development').stderr, /Unexpected extension file/);
    rmSync(join(dir, 'src/database.sqlite'));
    symlinkSync(join(dir, '.env'), join(dir, 'src/extra.js'));
    assert.match(run('--development').stderr, /Symlinks cannot be packaged/);
    rmSync(join(dir, 'src/extra.js'));
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json')));
    manifest.permissions.push('cookies');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    assert.match(run('--development').stderr, /Unexpected extension permissions/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
