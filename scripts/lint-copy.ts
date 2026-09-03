#!/usr/bin/env tsx
/**
 * Copy review as a lint rule (brief §1).
 *
 * Walks the user-facing source and fails the build on any phrasing that crosses from
 * stating facts into advising on insurance. Run by `npm run check` alongside typecheck
 * and the unit tests, so the compliance posture is enforced on every commit rather than
 * remembered during a copy review.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findCopyViolations } from '../lib/copy';

const ROOTS = ['app', 'components', 'lib', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git']);
// The rules and their tests must be able to write the forbidden phrases down.
const SKIP_FILES = new Set(['lib/copy.ts', 'scripts/lint-copy.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

let failures = 0;
for (const root of ROOTS) {
  let files: string[];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = relative(process.cwd(), file);
    if (SKIP_FILES.has(rel)) continue;
    for (const violation of findCopyViolations(readFileSync(file, 'utf8'))) {
      failures += 1;
      console.error(`${rel}:${violation.line}  [${violation.ruleId}]`);
      console.error(`    ${violation.text}`);
      console.error(`    why: ${violation.reason}`);
      console.error(`    instead: ${violation.instead}\n`);
    }
  }
}

if (failures > 0) {
  console.error(`copy lint: ${failures} violation${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('copy lint: clean');
