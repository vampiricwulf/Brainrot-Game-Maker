// Build details stamped into the app by vite.config.ts (shown in ℹ About).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function buildInfo() {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  let commit = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = '';
    }
  }
  // A published release (CI sets BRAINROT_RELEASE=1 for the files it releases): it checks for newer ones on its own.
  const release = process.env.BRAINROT_RELEASE === '1';
  return { version, commit, date: new Date().toISOString().slice(0, 10), release };
}
