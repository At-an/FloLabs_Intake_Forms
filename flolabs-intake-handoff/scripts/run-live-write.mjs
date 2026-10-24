// Runs the live tests that WRITE records to Twenty (src/**/*.live-write.test.ts).
// Usage, from flolabs-intake-handoff/: npm run test:live-write
// .env.local is loaded by the npm script; LIVE_WRITE=1 is the explicit opt-in the tests require,
// so a plain `npm test` (or `npm run test:live`) never writes.
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'live-write'], {
  stdio: 'inherit',
  env: { ...process.env, LIVE_WRITE: '1' },
});
process.exit(result.status ?? 1);
