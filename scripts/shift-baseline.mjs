import { readFile, writeFile, mkdir, mkdtemp, rm, rename, cp, stat, chmod } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rankSection, rankGlobal, globalBaselineOrder, buildCaseIndex, RANKING_RULE } from '../case-rankings.js';
import { packExecution, deltaFromPrevious, MOVE_COLUMNS } from '../cost-ledger.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (args.includes('--help')) {
  console.log('Usage: ./shift-baseline.sh [--label "Baseline description"] [--id unique-id]\nArchives the previous comparison period and both scoring systems, then promotes current on-disk code to the baseline. No commit or push.');
  process.exit(0);
}
for (let i = 0; i < args.length; i += 2) if (!['--label', '--id'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Expected --label TEXT or --id UNIQUE_ID. Use --help.');
const timestamp = new Date().toISOString();
const id = args.includes('--id') ? value('--id') : `shift-${timestamp.replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`;
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Baseline IDs must use lowercase letters, digits, and hyphens.');
const label = args.includes('--label') ? value('--label') : `Before shift · ${timestamp.slice(0, 19).replace('T', ' ')} UTC`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const local = name => path.join(root, name);
const lock = local('data/.baseline-shift.lock');
await mkdir(lock).catch(error => { throw new Error(`Cannot acquire baseline lock (${error.code}). Another shift may be running; inspect data/.baseline-shift.lock before retrying.`); });
let stage;
let archiveInstalled = false;
let committed = false;
let rollbackFailed = false;
const originals = new Map();
const originalFiles = ['data/algorithm-baseline.json', 'data/cost-history.json', 'data/case-index.json'];
try {
  for (const file of originalFiles) originals.set(file, await readFile(local(file)));
  const baseline = JSON.parse(originals.get(originalFiles[0]));
  const history = JSON.parse(originals.get(originalFiles[1]));
  const oldIndex = JSON.parse(originals.get(originalFiles[2]));
  const oldHash = hash(originals.get(originalFiles[0]));
  if (history.baselineSha256 !== oldHash || oldIndex.baselineSha256 !== oldHash) throw new Error('Baseline/history/index hash mismatch. Active data untouched.');
  const epochsFile = 'data/baseline-epochs.json';
  let epochs;
  try { originals.set(epochsFile, await readFile(local(epochsFile))); epochs = JSON.parse(originals.get(epochsFile)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; epochs = { schemaVersion: 1, periods: [] }; }
  if (epochs.periods.some(period => period.id === id)) throw new Error(`Baseline period '${id}' already exists.`);
  await mkdir(local('data/baseline-epochs'), { recursive: true });
  stage = await mkdtemp(local('data/baseline-epochs/.stage-'));
  const prefix = `data/baseline-epochs/${id}`;
  const stageFile = relative => path.join(stage, relative);
  const saveStage = async (relative, bytes) => { await mkdir(path.dirname(stageFile(relative)), { recursive: true }); await writeFile(stageFile(relative), bytes); };
  const sourceFiles = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean))]
    .filter(file => !file.startsWith('data/') && !file.startsWith('.') && !file.startsWith('node_modules/') && /\.(?:js|mjs|html|css|sh|md|py|json)$/.test(file));
  const fingerprints = {};
  for (const file of sourceFiles) {
    let bytes;
    try { bytes = await readFile(local(file)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    fingerprints[file] = hash(bytes);
    await saveStage(`systems/current/${file}`, bytes);
    await chmod(stageFile(`systems/current/${file}`), (await stat(local(file))).mode & 0o777);
  }
  // Freeze before evaluating: even uncommitted model changes are captured exactly.
  if (!fingerprints['package.json']) await saveStage('systems/current/package.json', '{"type":"module"}\n');
  const engine = await import(pathToFileURL(stageFile('systems/current/cost-ledger.js')));
  const oldDefinition = baseline.baselineDefinition;
  if (oldDefinition?.systemArchive) {
    await cp(local(oldDefinition.systemArchive), stageFile('systems/previous-baseline'), { recursive: true });
  } else if (oldDefinition?.commit) {
    for (const file of ['engine.js', 'costmodel.js', 'transpose.js']) {
      const bytes = execFileSync('git', ['show', `${oldDefinition.commit}:${file}`], { cwd: root });
      if (oldDefinition.sourceFileSha256?.[file] && oldDefinition.sourceFileSha256[file] !== hash(bytes)) throw new Error(`Previous baseline source hash mismatch: ${file}`);
      await saveStage(`systems/previous-baseline/${file}`, bytes);
    }
    await saveStage('systems/previous-baseline/package.json', '{"type":"module"}\n');
  } else throw new Error('Previous baseline has no reproducible source definition. Refusing to lose the older system.');
  await saveStage('before/algorithm-baseline.json', originals.get(originalFiles[0]));
  await saveStage('before/case-index.json', originals.get(originalFiles[2]));
  for (const revision of history.revisions) {
    for (const [sectionId, file] of Object.entries(revision.sectionFiles)) {
      const relative = `before/history/${revision.id}/${sectionId}.json`;
      await saveStage(relative, await readFile(local(file)));
      revision.sectionFiles[sectionId] = `${prefix}/${relative}`;
    }
    if (revision.globalFile) {
      const relative = `before/history/${revision.id}/global.json`;
      await saveStage(relative, await readFile(local(revision.globalFile)));
      revision.globalFile = `${prefix}/${relative}`;
    }
  }
  const closing = {
    id: `promoted-${id}`, label: 'System at baseline shift', recordedAt: timestamp,
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceFingerprints: fingerprints, moveColumns: MOVE_COLUMNS, sectionFiles: {},
    summary: { algorithms: 0, lower: 0, higher: 0, unchanged: 0, unavailable: 0 }
  };
  const allScores = {};
  const newBaseline = structuredClone(baseline);
  const previousRevision = history.revisions.at(-1);
  for (const [sectionPosition, section] of baseline.sections.entries()) {
    const scores = {};
    let previousScores = {};
    if (previousRevision) previousScores = JSON.parse(await readFile(stageFile(`before/history/${previousRevision.id}/${section.id}.json`))).scores;
    for (const [entryPosition, entry] of section.entries.entries()) {
      const result = engine.evaluateEntry(entry);
      if (result.status !== 'ok') throw new Error(`Cannot shift baseline: ${entry.id}: ${result.reason}. Active data untouched.`);
      scores[entry.id] = { ...result, execution: packExecution(result.execution), deltaFromPrevious: deltaFromPrevious(result, previousRevision ? previousScores[entry.id]?.cost : entry.baseline.cost) };
      const target = newBaseline.sections[sectionPosition].entries[entryPosition];
      target.baseline.cost = result.cost;
      target.baseline.costText = result.cost.toFixed(2);
      closing.summary.algorithms++;
      if (result.deltaFromBaseline < -0.005) closing.summary.lower++;
      else if (result.deltaFromBaseline > 0.005) closing.summary.higher++;
      else closing.summary.unchanged++;
    }
    const relative = `before/history/${closing.id}/${section.id}.json`;
    await saveStage(relative, JSON.stringify({ revisionId: closing.id, sectionId: section.id, scores, cases: rankSection(section, scores), rankingRule: RANKING_RULE }) + '\n');
    closing.sectionFiles[section.id] = `${prefix}/${relative}`;
    Object.assign(allScores, scores);
    console.log(`${section.group}: ${section.entries.length} algorithms captured`);
  }
  closing.globalFile = `${prefix}/before/history/${closing.id}/global.json`;
  await saveStage(`before/history/${closing.id}/global.json`, JSON.stringify(rankGlobal(baseline.sections.flatMap(section => section.entries), allScores)) + '\n');
  history.revisions.push(closing);
  await saveStage('before/cost-history.json', JSON.stringify(history, null, 2) + '\n');
  newBaseline.schemaVersion = 3;
  newBaseline.baselineDefinition = {
    kind: 'working-tree-checkpoint', id, label: args.includes('--label') ? value('--label') : `System captured ${timestamp}`,
    calculatedAt: timestamp, baseCommit: closing.baseCommit, sourceFileSha256: fingerprints,
    systemArchive: `${prefix}/systems/current`, previousBaselineFile: `${prefix}/before/algorithm-baseline.json`,
    previousBaselineSha256: oldHash, algorithms: closing.summary.algorithms,
    sheetArchive: oldDefinition.sheetArchive, sheetArchiveSha256: oldDefinition.sheetArchiveSha256
  };
  newBaseline.comparison = 'Baseline costs are calculated from the archived working-tree system. Keep source algorithms, orientations and starting thumbs fixed.';
  const baselineBytes = JSON.stringify(newBaseline, null, 2) + '\n';
  const newHash = hash(baselineBytes);
  const activeHistory = { schemaVersion: 1, baselineSha256: newHash, baselineDefinition: newBaseline.baselineDefinition, revisions: [] };
  const activeIndex = {
    schemaVersion: 1, baselineSha256: newHash, rankingRule: RANKING_RULE,
    global: { entryIds: globalBaselineOrder(newBaseline.sections.flatMap(section => section.entries)) },
    sections: newBaseline.sections.map(section => ({ id: section.id, cases: buildCaseIndex(section) }))
  };
  epochs.periods.push({ id, label, recordedAt: timestamp, baseline: `${prefix}/before/algorithm-baseline.json`, history: `${prefix}/before/cost-history.json`, caseIndex: `${prefix}/before/case-index.json`, previousSystem: `${prefix}/systems/previous-baseline`, promotedSystem: `${prefix}/systems/current`, closingSummary: closing.summary });
  await saveStage('README.md', `# Baseline period ${id}\n\n${label}\n\nThe before/ files preserve the previous baseline and full history, ending with a capture of the promoted system. Choose this period in the visual changelog to inspect its impact.\n\nsystems/previous-baseline preserves the older scoring source. systems/current preserves the exact on-disk source promoted by this shift, including uncommitted changes. Both contain ES module package metadata. Source hashes are in the captured baseline definition and closing revision. The enclosing repository remains unchanged by restoring or inspecting these copies.\n`);
  for (const [file, bytes] of originals) if (hash(await readFile(local(file))) !== hash(bytes)) throw new Error(`Data changed during capture: ${file}. Retry without concurrent edits.`);
  for (const [file, fingerprint] of Object.entries(fingerprints)) if (hash(await readFile(local(file))) !== fingerprint) throw new Error(`Source changed during capture: ${file}. Retry after edits finish.`);
  const replacements = new Map([
    ['data/algorithm-baseline.json', baselineBytes], ['data/cost-history.json', JSON.stringify(activeHistory, null, 2) + '\n'],
    ['data/case-index.json', JSON.stringify(activeIndex, null, 2) + '\n'], [epochsFile, JSON.stringify(epochs, null, 2) + '\n']
  ]);
  await rename(stage, local(prefix));
  stage = undefined;
  archiveInstalled = true;
  try {
    for (const [file, bytes] of replacements) {
      const temporary = local(`${file}.shift-tmp`);
      await writeFile(temporary, bytes);
      await rename(temporary, local(file));
    }
    committed = true;
  } catch (error) {
    try {
      for (const [file, bytes] of originals) await writeFile(local(file), bytes);
      if (!originals.has(epochsFile)) await rm(local(epochsFile), { force: true });
    } catch (rollbackError) {
      rollbackFailed = true;
      throw new AggregateError([error, rollbackError], `Baseline installation and automatic rollback failed. Recovery copies preserved in ${prefix}/before.`);
    }
    throw error;
  }
  console.log(`Baseline shifted to ${id}. ${closing.summary.algorithms} algorithms captured. Previous period and both systems saved in ${prefix}.`);
  console.log('Refresh the visual changelog. New changes compare only against this captured system.');
} finally {
  if (stage) await rm(stage, { recursive: true, force: true });
  if (archiveInstalled && !committed && !rollbackFailed) await rm(local(`data/baseline-epochs/${id}`), { recursive: true, force: true });
  for (const file of [...originalFiles, 'data/baseline-epochs.json']) await rm(local(`${file}.shift-tmp`), { force: true });
  await rm(lock, { recursive: true, force: true });
}
