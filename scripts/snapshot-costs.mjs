import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rankSection, RANKING_RULE } from '../case-rankings.js';
import { evaluateEntry, deltaFromPrevious, packExecution, MOVE_COLUMNS } from '../cost-ledger.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--id') || !args.includes('--label') || !option('--id') || !option('--label')) {
  console.error('Usage: node scripts/snapshot-costs.mjs --id unique-change-id --label "What changed"');
  process.exit(1);
}
const id = option('--id');
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Use lowercase letters, digits, and hyphens for the snapshot id.');
const baselineBytes = await readFile(path.join(root, 'data/algorithm-baseline.json'));
const baseline = JSON.parse(baselineBytes);
const baselineHash = createHash('sha256').update(baselineBytes).digest('hex');
const historyPath = path.join(root, 'data/cost-history.json');
let history;
try { history = JSON.parse(await readFile(historyPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  history = { schemaVersion: 1, baselineSha256: baselineHash, revisions: [] };
}
if (history.baselineSha256 !== baselineHash) throw new Error('Baseline changed: refusing to mix scores from different source data.');
if (history.revisions.some(revision => revision.id === id)) throw new Error(`Snapshot '${id}' already exists; history is append-only.`);
const fingerprints = {};
for (const file of ['engine.js', 'costmodel.js', 'transpose.js', 'cost-ledger.js', 'case-rankings.js']) {
  fingerprints[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
}
const previous = history.revisions.at(-1);
const revision = {
  id, label: option('--label'), recordedAt: new Date().toISOString(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceFingerprints: fingerprints,
  comparison: 'Same source algorithm, orientation, and sheet starting thumb; cheapest current path with the engine regrip limit.',
  moveColumns: MOVE_COLUMNS, sectionFiles: {}, summary: { algorithms: 0, lower: 0, higher: 0, unchanged: 0, unavailable: 0 }
};
const snapshotDir = path.join(root, 'data/history', id);
// Exclusive directory creation protects against accidentally overwriting orphaned snapshots.
await mkdir(snapshotDir, { recursive: false }).catch(async error => {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(path.dirname(snapshotDir), { recursive: true });
  await mkdir(snapshotDir);
});
for (const section of baseline.sections) {
  const previousScores = previous
    ? JSON.parse(await readFile(path.join(root, previous.sectionFiles[section.id]), 'utf8')).scores : {};
  const scores = {};
  for (const entry of section.entries) {
    const result = evaluateEntry(entry);
    const previousCost = previous ? previousScores[entry.id]?.cost : entry.baseline.cost;
    scores[entry.id] = {
      ...result, ...(result.execution ? { execution: packExecution(result.execution) } : {}),
      deltaFromPrevious: deltaFromPrevious(result, previousCost)
    };
    revision.summary.algorithms++;
    if (result.status !== 'ok') revision.summary.unavailable++;
    else if (result.deltaFromBaseline < -0.005) revision.summary.lower++;
    else if (result.deltaFromBaseline > 0.005) revision.summary.higher++;
    else revision.summary.unchanged++;
  }
  const cases = rankSection(section, scores);
  const relative = `data/history/${id}/${section.id}.json`;
  await writeFile(path.join(root, relative), JSON.stringify({ revisionId: id, sectionId: section.id, scores, cases, rankingRule: RANKING_RULE }) + '\n');
  revision.sectionFiles[section.id] = relative;
  console.log(`${section.group}: ${section.entries.length} algorithms evaluated`);
}
history.revisions.push(revision);
const temp = `${historyPath}.tmp`;
await writeFile(temp, JSON.stringify(history, null, 2) + '\n');
await rename(temp, historyPath);
console.log(`Saved '${id}': ${revision.summary.algorithms} algorithms; ${revision.summary.unavailable} unavailable. Baseline untouched.`);
