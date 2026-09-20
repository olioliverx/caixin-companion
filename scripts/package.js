import { mkdir, readFile, writeFile, rm, readdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipStore } from '../src/zip.js';

const development = process.argv.includes('--development');
if (process.argv.slice(2).some(arg => arg !== '--development')) throw new Error('Unknown packaging option.');
const output = resolve(development ? 'dist/development' : 'dist/extension');
const files = [];
const permittedSource = new Set(['article.js', 'access.js', 'background.js', 'caixin.js', 'detect.js',
  'epub.js', 'jobs.js', 'export.js', 'network.js', 'popup.css', 'popup.html', 'popup.js', 'task.js', 'task.html', 'zip.js', 'theme.js', 'wonder.scoped.css']);
for (const entry of await readdir('src', { withFileTypes: true })) {
  const name = `src/${entry.name}`;
  if ((await lstat(name)).isSymbolicLink()) throw new Error(`Symlinks cannot be packaged: ${name}`);
  if (!permittedSource.has(entry.name) || !entry.isFile()) throw new Error(`Unexpected extension file: ${name}`);
  const data = new Uint8Array(await readFile(name));
  if (/-----BEGIN .*PRIVATE KEY-----|(?:sk_live_|rk_live_|ghp_|github_pat_)[A-Za-z0-9_]+/.test(new TextDecoder().decode(data))) {
    throw new Error(`Credential-like content in ${name}`);
  }
  files.push({ name, data });
}
for (const size of [16, 32, 48, 128]) {
  const name = `assets/icons/icon-${size}.png`;
  if ((await lstat(name)).isSymbolicLink()) throw new Error(`Symlinks cannot be packaged: ${name}`);
  files.push({ name, data: new Uint8Array(await readFile(name)) });
}
for (const name of ['docs/PRIVACY.html', 'docs/SUPPORT.html', 'LICENSE']) {
  if ((await lstat(name)).isSymbolicLink()) throw new Error(`Symlinks cannot be packaged: ${name}`);
  files.push({ name, data: new Uint8Array(await readFile(name)) });
}
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const permissions = ['activeTab', 'downloads', 'scripting', 'storage'];
const hosts = ['https://weekly.caixin.com/*', 'https://img.caixin.com/*', 'https://file.caixin.com/*', 'https://datanews.caixin.com/mobile/article/*'];
if (JSON.stringify(manifest.permissions?.slice().sort()) !== JSON.stringify(permissions.sort()) ||
    JSON.stringify(manifest.host_permissions?.slice().sort()) !== JSON.stringify(hosts.sort()) ||
    manifest.optional_permissions?.length || manifest.optional_host_permissions?.length || manifest.externally_connectable || manifest.content_scripts?.length || manifest.web_accessible_resources?.length) {
  throw new Error('Unexpected extension permissions or exposed entry points. Review the packaging policy.');
}
if (development) manifest.name += ' (Development)';
files.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
await rm(output, { recursive: true, force: true });
for (const file of files) {
  await mkdir(resolve(output, file.name, '..'), { recursive: true });
  await writeFile(`${output}/${file.name}`, file.data);
}
const archive = development ? 'dist/caixin-companion-development.zip' : 'dist/caixin-companion.zip';
await writeFile(archive, new Uint8Array(await zipStore(files).arrayBuffer()));
console.log(`Caixin Companion: ${archive}`);
