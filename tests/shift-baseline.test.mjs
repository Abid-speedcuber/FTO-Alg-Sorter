import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildCaseIndex, globalBaselineOrder, RANKING_RULE } from '../case-rankings.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

test('shifts isolate the next change and preserve both systems, old results and global ranks', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'fto-baseline-period-'));
  try {
    for (const file of ['engine.js', 'costmodel.js', 'transpose.js', 'cost-ledger.js', 'case-rankings.js', 'scripts/shift-baseline.mjs', 'scripts/snapshot-costs.mjs', 'shift-baseline.sh']) {
      await mkdir(path.dirname(path.join(temporary, file)), { recursive: true });
      await cp(path.join(root, file), path.join(temporary, file));
    }
    await mkdir(path.join(temporary, 'data/previous-system'), { recursive: true });
    for (const file of ['engine.js', 'costmodel.js', 'transpose.js', 'cost-ledger.js', 'case-rankings.js']) await cp(path.join(temporary, file), path.join(temporary, 'data/previous-system', file));
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(temporary, 'data/previous-system/package.json'), '{"type":"module"}\n');
    const source = await json(path.join(root, 'data/algorithm-baseline.json'));
    source.sections = [{ ...source.sections[0], entries: source.sections[0].entries.slice(0, 2) }];
    source.source.algorithmCount = 2;
    source.baselineDefinition = { kind: 'working-tree-checkpoint', systemArchive: 'data/previous-system' };
    let initialBaseline = JSON.stringify(source);
    await writeFile(path.join(temporary, 'data/algorithm-baseline.json'), initialBaseline);
    await writeFile(path.join(temporary, 'data/cost-history.json'), JSON.stringify({ schemaVersion: 1, baselineSha256: hash(initialBaseline), revisions: [] }));
    await writeFile(path.join(temporary, 'data/case-index.json'), JSON.stringify({ schemaVersion: 1, baselineSha256: hash(initialBaseline), rankingRule: RANKING_RULE, global: { entryIds: globalBaselineOrder(source.sections[0].entries) }, sections: [{ id: source.sections[0].id, cases: buildCaseIndex(source.sections[0]) }] }));
    const git = args => execFileSync('git', args, { cwd: temporary, stdio: 'pipe' });
    git(['init', '-q']); git(['add', '.']);
    git(['-c', 'user.name=FTO test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture']);
    // The first promotion archives a pinned Git model; the second archives a
    // previous working-tree checkpoint, exercising both preservation paths.
    source.baselineDefinition = {
      kind: 'pinned-parent-application',
      commit: git(['rev-parse', 'HEAD']).toString().trim(),
      sourceFileSha256: Object.fromEntries(await Promise.all(['engine.js', 'costmodel.js', 'transpose.js'].map(async file => [file, hash(await readFile(path.join(temporary, file)))])))
    };
    initialBaseline = JSON.stringify(source);
    await writeFile(path.join(temporary, 'data/algorithm-baseline.json'), initialBaseline);
    const initialHistory = await json(path.join(temporary, 'data/cost-history.json'));
    initialHistory.baselineSha256 = hash(initialBaseline);
    await writeFile(path.join(temporary, 'data/cost-history.json'), JSON.stringify(initialHistory));
    const initialIndex = await json(path.join(temporary, 'data/case-index.json'));
    initialIndex.baselineSha256 = hash(initialBaseline);
    await writeFile(path.join(temporary, 'data/case-index.json'), JSON.stringify(initialIndex));
    const run = (file, args) => spawnSync(file, args, { cwd: temporary, encoding: 'utf8' });
    assert.equal(run(process.execPath, ['scripts/snapshot-costs.mjs', '--id', 'before', '--label', 'Before']).status, 0);
    const model = path.join(temporary, 'costmodel.js');
    const oldModel = await readFile(model, 'utf8');
    await writeFile(model, oldModel.replace('const IDEAL = 1;', 'const IDEAL = 1.1;'));
    const shifted = run('bash', ['shift-baseline.sh', '--id', 'first', '--label', 'After first rule']);
    assert.equal(shifted.status, 0, shifted.stderr);
    const active = await json(path.join(temporary, 'data/algorithm-baseline.json'));
    const index = await json(path.join(temporary, 'data/baseline-epochs.json'));
    assert.equal(index.periods.length, 1);
    const period = index.periods[0];
    assert.equal(await readFile(path.join(temporary, period.baseline), 'utf8'), initialBaseline);
    assert.equal(await readFile(path.join(temporary, period.previousSystem, 'costmodel.js'), 'utf8'), oldModel);
    assert.equal(await readFile(path.join(temporary, period.promotedSystem, 'costmodel.js'), 'utf8'), oldModel.replace('const IDEAL = 1;', 'const IDEAL = 1.1;'));
    assert.equal(active.baselineDefinition.kind, 'working-tree-checkpoint');
    assert.ok(active.sections[0].entries[0].baseline.cost > source.sections[0].entries[0].baseline.cost);
    const emptyHistory = await json(path.join(temporary, 'data/cost-history.json'));
    assert.deepEqual(emptyHistory.revisions, []);
    assert.equal(emptyHistory.baselineSha256, hash(await readFile(path.join(temporary, 'data/algorithm-baseline.json'))));
    const archivedHistory = await json(path.join(temporary, period.history));
    assert.deepEqual(archivedHistory.revisions.map(revision => revision.id), ['before', 'promoted-first']);
    const closing = archivedHistory.revisions.at(-1);
    const global = await json(path.join(temporary, closing.globalFile));
    assert.equal(global.entryIds.length, 2);
    const firstId = source.sections[0].entries[0].id;
    assert.equal(global.scores[firstId].cost, active.sections[0].entries[0].baseline.cost);
    assert.ok(global.scores[firstId].deltaFromBaseline > 0);
    for (const revision of archivedHistory.revisions) {
      await access(path.join(temporary, revision.globalFile));
      for (const file of Object.values(revision.sectionFiles)) await access(path.join(temporary, file));
    }
    const activeEngine = await import(pathToFileURL(path.join(temporary, 'cost-ledger.js')));
    const current = activeEngine.evaluateEntry(active.sections[0].entries[0]);
    assert.equal(current.deltaFromBaseline, 0);
    await writeFile(model, oldModel.replace('const IDEAL = 1;', 'const IDEAL = 1.2;'));
    const next = run(process.execPath, ['scripts/snapshot-costs.mjs', '--id', 'next', '--label', 'Next rule']);
    assert.equal(next.status, 0, next.stderr);
    const nextIndex = await json(path.join(temporary, 'data/cost-history.json'));
    const nextScores = await json(path.join(temporary, nextIndex.revisions[0].sectionFiles.t0));
    const nextScore = nextScores.scores[firstId];
    assert.equal(nextScore.deltaFromBaseline, Math.round((nextScore.cost - current.cost) * 100) / 100);
    assert.equal(nextScore.deltaFromPrevious, nextScore.deltaFromBaseline);
    assert.equal(run('bash', ['shift-baseline.sh', '--id', 'first']).status, 1);
    const second = run('bash', ['shift-baseline.sh', '--id', 'second']);
    assert.equal(second.status, 0, second.stderr);
    const periods = await json(path.join(temporary, 'data/baseline-epochs.json'));
    assert.equal(periods.periods.length, 2);
    assert.equal(await readFile(path.join(temporary, periods.periods[1].previousSystem, 'costmodel.js'), 'utf8'), oldModel.replace('const IDEAL = 1;', 'const IDEAL = 1.1;'));
    const beforeFailure = await readFile(path.join(temporary, 'data/algorithm-baseline.json'));
    // A corrupt module must fail before changing the active period.
    await writeFile(model, 'not valid JavaScript !');
    const failure = run('bash', ['shift-baseline.sh', '--id', 'broken']);
    assert.notEqual(failure.status, 0);
    assert.deepEqual(await readFile(path.join(temporary, 'data/algorithm-baseline.json')), beforeFailure);
    await assert.rejects(access(path.join(temporary, 'data/.baseline-shift.lock')));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
