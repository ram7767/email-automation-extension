#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';

const summaryPath = 'coverage/coverage-summary.json';
const threshold = 85;

if (!existsSync(summaryPath)) {
  console.error(`No coverage summary at ${summaryPath} — run "npm run test:coverage" first.`);
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const failures = [];

for (const [file, metrics] of Object.entries(summary)) {
  if (file === 'total') continue;
  if (!file.includes('/src/lib/')) continue;
  const lines = metrics.lines.pct;
  if (lines < threshold) failures.push(`${file}: ${lines}% (< ${threshold}%)`);
}

if (failures.length) {
  console.error('Coverage below threshold:');
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log(`Coverage gate passed: all src/lib/** files >= ${threshold}%`);
