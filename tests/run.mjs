// Minimal test runner: imports every tests/*.test.mjs, runs its exported `tests` {name: fn}, then
// re-runs the lab selftest so the reference host stays green. Usage: node tests/run.mjs [filter]
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const filter = process.argv[2] ?? '';

let passed = 0;
let failed = 0;
for (const file of readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()) {
  const mod = await import(pathToFileURL(join(here, file)).href);
  for (const [name, fn] of Object.entries(mod.tests ?? {})) {
    const label = `${file.replace('.test.mjs', '')} › ${name}`;
    if (filter && !label.includes(filter)) continue;
    try {
      await fn();
      passed++;
      console.log(`  ok   ${label}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL ${label}\n       ${err.message.split('\n').join('\n       ')}`);
    }
  }
}

if (!filter) {
  try {
    const out = execFileSync('node', [join(root, 'experiments/geodesic-surfaces/atlas-selftest.mjs')], {
      encoding: 'utf8',
    });
    console.log(`  ok   lab › ${out.trim().split('\n').pop()}`);
    passed++;
  } catch (err) {
    failed++;
    console.log(`  FAIL lab › atlas-selftest\n       ${String(err.stdout || err.message).trim()}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
