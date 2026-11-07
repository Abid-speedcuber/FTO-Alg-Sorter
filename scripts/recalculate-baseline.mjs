// Explicit baseline migration. Replays a pinned parent commit, preserves the
// original sheet archive, then rebases presentation deltas without rescoring history.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCaseIndex, rankSection, RANKING_RULE } from '../case-rankings.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const commit = args.includes('--commit') ? option('--commit') : '';
const repository = args.includes('--repository') ? option('--repository') : '';
if (!/^[0-9a-f]{40}$/.test(commit) || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(repository)) {
  throw new Error('Usage: node scripts/recalculate-baseline.mjs --commit FULL_COMMIT_SHA --repository https://github.com/OWNER/REPO');
}
const baselinePath = path.join(root, 'data/algorithm-baseline.json');
const originalBytes = await readFile(baselinePath);
const originalHash = createHash('sha256').update(originalBytes).digest('hex');
const baseline = JSON.parse(originalBytes);
if (baseline.baselineDefinition) throw new Error('This baseline was already recalculated. Use a separately planned migration to change its pinned commit.');
const historyPath = path.join(root, 'data/cost-history.json');
const history = JSON.parse(await readFile(historyPath));
if (history.baselineSha256 !== originalHash) throw new Error('Baseline hash mismatch. No files changed.');
if (execFileSync('git', ['rev-parse', `${commit}^{commit}`], { cwd: root, encoding: 'utf8' }).trim() !== commit) throw new Error('Pinned commit unavailable.');
const temporary = await mkdtemp(path.join(tmpdir(), 'fto-pinned-baseline-'));
const fileHashes = {};
let changed = 0;
try {
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}\n');
  for (const file of ['engine.js', 'costmodel.js', 'transpose.js']) {
    const bytes = execFileSync('git', ['show', `${commit}:${file}`], { cwd: root });
    fileHashes[file] = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(temporary, file), bytes);
  }
  const engine = await import(pathToFileURL(path.join(temporary, 'engine.js')));
  for (const section of baseline.sections) {
    for (const entry of section.entries) {
      const parsed = engine.parse_alg(entry.algorithm);
      if (!parsed.rot && entry.baseline.rotation) parsed.rot = entry.baseline.rotation;
      if (!parsed.auf && entry.baseline.auf) parsed.auf = entry.baseline.auf;
      const paths = engine.explore_alg(parsed, engine.CONFIGS, engine.ROTATIONMAPPING, { limit: 1, startThumb: entry.baseline.startThumb });
      const result = paths[0];
      if (!result || !Number.isFinite(result.cost) || result.startThumb !== entry.baseline.startThumb) {
        throw new Error(`Pinned parent cannot score ${entry.id} at the recorded starting grip. No active data changed.`);
      }
      const cost = Math.round((result.cost + Number.EPSILON) * 100) / 100;
      entry.sheetCost = { cost: entry.baseline.cost, costText: entry.baseline.costText };
      if (cost !== entry.baseline.cost) changed++;
      entry.baseline.cost = cost;
      entry.baseline.costText = cost.toFixed(2);
    }
    console.log(`Recalculated ${section.group}: ${section.entries.length} algorithms`);
  }
} finally { await rm(temporary, { recursive: true, force: true }); }

baseline.schemaVersion = 2;
baseline.comparison = 'Baseline costs are recalculated with the pinned parent application commit. Preserve sheet algorithms, orientations and starting thumbs. Original sheet costs are provenance only.';
baseline.baselineDefinition = {
  kind: 'pinned-parent-application', repository, commit, calculatedAt: new Date().toISOString(),
  sourceFileSha256: fileHashes,
  comparison: 'Cheapest execution of each sheet algorithm and orientation, fixed to its sheet starting thumb, using the pinned parent engine regrip limit.',
  sheetArchive: 'data/archive/sheet-baseline.json', sheetArchiveSha256: originalHash,
  algorithms: baseline.source.algorithmCount, changedFromSheet: changed
};
const newBytes = JSON.stringify(baseline, null, 2) + '\n';
const newHash = createHash('sha256').update(newBytes).digest('hex');
const preparedFiles = [];
let previousScores = {};
for (const revision of history.revisions) {
  const allScores = {};
  const summary = { algorithms: 0, lower: 0, higher: 0, unchanged: 0, unavailable: 0 };
  for (const section of baseline.sections) {
    const file = path.join(root, revision.sectionFiles[section.id]);
    const saved = JSON.parse(await readFile(file));
    for (const entry of section.entries) {
      const score = saved.scores[entry.id];
      if (!score) throw new Error(`Missing saved result ${entry.id}. No active data changed.`);
      const previousCost = history.revisions[0] === revision ? entry.baseline.cost : previousScores[entry.id]?.cost;
      score.deltaFromBaseline = score.status === 'ok' ? Math.round((score.cost - entry.baseline.cost) * 100) / 100 : null;
      score.deltaFromPrevious = score.status === 'ok' && Number.isFinite(previousCost) ? Math.round((score.cost - previousCost) * 100) / 100 : null;
      summary.algorithms++;
      if (score.status !== 'ok') summary.unavailable++;
      else if (score.deltaFromBaseline < -0.005) summary.lower++;
      else if (score.deltaFromBaseline > 0.005) summary.higher++;
      else summary.unchanged++;
    }
    saved.cases = rankSection(section, saved.scores);
    saved.rankingRule = RANKING_RULE;
    Object.assign(allScores, saved.scores);
    preparedFiles.push([file, JSON.stringify(saved) + '\n']);
  }
  revision.summary = summary;
  previousScores = allScores;
}
history.baselineSha256 = newHash;
history.baselineDefinition = baseline.baselineDefinition;
const index = { schemaVersion: 1, baselineSha256: newHash, rankingRule: RANKING_RULE, sections: baseline.sections.map(section => ({ id: section.id, cases: buildCaseIndex(section) })) };
// All calculation and validation completes before touching the active dataset.
await mkdir(path.join(root, 'data/archive'), { recursive: true });
await writeFile(path.join(root, baseline.baselineDefinition.sheetArchive), originalBytes, { flag: 'wx' });
await writeFile(path.join(root, 'data/archive/sheet-history-index.json'), await readFile(historyPath), { flag: 'wx' });
for (const [file, bytes] of preparedFiles) await writeFile(file, bytes);
await writeFile(baselinePath, newBytes);
await writeFile(path.join(root, 'data/case-index.json'), JSON.stringify(index, null, 2) + '\n');
await writeFile(historyPath, JSON.stringify(history, null, 2) + '\n');
console.log(`Rebased ${baseline.source.algorithmCount} baseline costs to ${commit}; ${changed} differ from the original sheet. Original sheet archived.`);
console.log(JSON.stringify(history.revisions.map(revision => ({ id: revision.id, summary: revision.summary }))));
