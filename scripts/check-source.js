import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const name of files) {
  if (/(^|\/)\.env(\.|$)/.test(name) && !name.endsWith('.env.example')) throw new Error(`Environment file is tracked: ${name}`);
  if (/\.(sqlite(?:3)?(?:-wal|-shm)?|db|pem|p12|key)$/.test(name) || /(^|\/)(node_modules|data|dist)\//.test(name)) throw new Error(`Private/runtime artifact is tracked: ${name}`);
  if (!/\.(js|mjs|json|md|yml|yaml|html)$/.test(name)) continue;
  const content = readFileSync(name, 'utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk_live_|rk_live_|ghp_|gho_|github_pat_)[A-Za-z0-9_]{16,}/.test(content)) throw new Error(`Credential-like material in ${name}`);
}
console.log(`Checked ${files.length} tracked paths for forbidden runtime files and credential patterns.`);
