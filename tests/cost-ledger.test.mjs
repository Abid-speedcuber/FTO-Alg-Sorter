import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evaluateEntry, costBreakdown, formatDelta, deltaFromPrevious, packExecution, unpackExecution, roundCost } from '../cost-ledger.js';

const baselineBytes = await readFile(new URL('../data/algorithm-baseline.json', import.meta.url));
const baseline = JSON.parse(baselineBytes);
const history = JSON.parse(await readFile(new URL('../data/cost-history.json', import.meta.url)));
const first = baseline.sections[0].entries[0];

test('import preserves all source algorithms in their section order and freezes sheet costs', () => {
  assert.equal(baseline.source.algorithmCount, 14899);
  assert.equal(baseline.source.caseCount, 377);
  assert.equal(baseline.sections.length, 36);
  assert.equal(baseline.sections[0].group, 'T0');
  assert.equal(baseline.sections.at(-1).group, 'C4');
  assert.deepEqual(baseline.source.headerRows, [14900]);
  const entries = baseline.sections.flatMap(section => section.entries);
  assert.equal(entries.length, 14899);
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  assert.equal(new Set(entries.map(entry => entry.caseNumber)).size, 377);
  assert.deepEqual(entries.map(entry => entry.sourceRow), Array.from({ length: 14899 }, (_, i) => i + 1));
  assert.equal(first.baseline.cost, 10.2);
  assert.equal(first.baseline.startThumb, 'back+');
  assert.equal(first.algorithm, "(U') {U,R} r' U r' BR' r U' r' BR r'");
  assert.equal(createHash('sha256').update(baselineBytes).digest('hex'), history.baselineSha256);
  for (const entry of entries) assert.equal(Number(entry.baseline.costText), entry.baseline.cost);
});

test('evaluation fixes the source grip and leaves baseline values intact', () => {
  const original = structuredClone(first);
  const result = evaluateEntry(first);
  assert.equal(result.status, 'ok');
  assert.equal(result.execution.startThumb, 'back+');
  assert.equal(result.cost, 10.2);
  assert.equal(costBreakdown(result.execution).total, result.cost);
  assert.deepEqual(first, original);
  assert.deepEqual(unpackExecution(packExecution(result.execution)), result.execution);
});

test('unavailable paths and incompatible starting thumbs never become zero costs', () => {
  for (const entry of [
    { ...first, algorithm: '{U,R} Q' },
    { ...first, baseline: { ...first.baseline, startThumb: 'top' } }
  ]) {
    const result = evaluateEntry(entry);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.cost, null);
    assert.equal(result.deltaFromBaseline, null);
    assert.equal(deltaFromPrevious(result, 10), null);
  }
  assert.equal(deltaFromPrevious({ status: 'ok', cost: 5 }, null), null);
});

test('deltas use signed hundredths and compare with the preceding recorded cost', () => {
  assert.equal(formatDelta(0.4), '+0.40');
  assert.equal(formatDelta(-1.239), '−1.24');
  assert.equal(formatDelta(-0.001), '+0.00');
  assert.equal(formatDelta(null), 'unavailable');
  assert.equal(deltaFromPrevious({ status: 'ok', cost: 10.6 }, 10.2), 0.4);
});

test('every saved trace reconciles move, regrip, overload and orientation costs', async () => {
  let previousScores = {};
  for (const revision of history.revisions) {
    const allScores = {};
    const summary = { algorithms: 0, lower: 0, higher: 0, unchanged: 0, unavailable: 0 };
    for (const section of baseline.sections) {
      const snapshot = JSON.parse(await readFile(new URL(`../${revision.sectionFiles[section.id]}`, import.meta.url)));
      assert.equal(snapshot.revisionId, revision.id);
      assert.equal(snapshot.sectionId, section.id);
      assert.equal(Object.keys(snapshot.scores).length, section.entries.length);
      for (const entry of section.entries) {
        const score = snapshot.scores[entry.id];
        assert.ok(score, entry.id);
        summary.algorithms++;
        const preceding = previousScores[entry.id] ? previousScores[entry.id].cost : entry.baseline.cost;
        assert.equal(score.deltaFromPrevious, deltaFromPrevious(score, preceding));
        if (score.status !== 'ok') { summary.unavailable++; continue; }
        const execution = unpackExecution(score.execution);
        assert.equal(execution.startThumb, entry.baseline.startThumb);
        assert.equal(costBreakdown(execution).total, score.cost, entry.id);
        assert.equal(roundCost(execution.cost), score.cost);
        assert.equal(roundCost(score.cost - entry.baseline.cost), score.deltaFromBaseline);
        let thumb = execution.startThumb;
        let finger = '';
        for (const move of execution.fingertricks) {
          assert.equal(move.thumbBefore, thumb);
          assert.ok(Number.isFinite(move.cost) && Number.isFinite(move.regripCost) && Number.isFinite(move.overloadCost));
          if (!move.regrip) {
            assert.equal(move.regripCost, 0);
            assert.equal(move.thumb, thumb);
          }
          if (move.overloadCost) assert.equal(move.finger, finger);
          thumb = move.thumbAfter;
          finger = move.finger;
        }
        if (score.deltaFromBaseline < -0.005) summary.lower++;
        else if (score.deltaFromBaseline > 0.005) summary.higher++;
        else summary.unchanged++;
      }
      Object.assign(allScores, snapshot.scores);
    }
    assert.deepEqual(summary, revision.summary);
    previousScores = allScores;
  }
});


test('snapshot command appends revisions, preserves baseline, and refuses overwrite or baseline drift', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(path.join(tmpdir(), 'fto-history-test-'));
  try {
    await mkdir(path.join(temporary, 'data'));
    await mkdir(path.join(temporary, 'scripts'));
    for (const file of ['engine.js', 'costmodel.js', 'transpose.js', 'cost-ledger.js', 'case-rankings.js', 'scripts/snapshot-costs.mjs']) {
      await copyFile(path.join(root, file), path.join(temporary, file));
    }
    const fixture = { ...baseline, sections: [{ ...baseline.sections[0], entries: baseline.sections[0].entries.slice(0, 2) }] };
    const fixtureBytes = JSON.stringify(fixture);
    const baselinePath = path.join(temporary, 'data/algorithm-baseline.json');
    await writeFile(baselinePath, fixtureBytes);
    // Read the real repository's HEAD without writing to its Git metadata.
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim();
    const invoke = id => spawnSync(process.execPath, ['scripts/snapshot-costs.mjs', '--id', id, '--label', id], {
      cwd: temporary, encoding: 'utf8', env: { ...process.env, GIT_DIR: gitDir }
    });
    let result = invoke('first');
    assert.equal(result.status, 0, result.stderr);
    const modelPath = path.join(temporary, 'costmodel.js');
    await writeFile(modelPath, (await readFile(modelPath, 'utf8')).replace('const IDEAL = 1;', 'const IDEAL = 1.1;'));
    result = invoke('second');
    assert.equal(result.status, 0, result.stderr);
    const indexPath = path.join(temporary, 'data/cost-history.json');
    const indexBytes = await readFile(indexPath, 'utf8');
    const index = JSON.parse(indexBytes);
    assert.deepEqual(index.revisions.map(item => item.id), ['first', 'second']);
    const snapshots = await Promise.all(index.revisions.map(item => readFile(path.join(temporary, item.sectionFiles.t0), 'utf8').then(JSON.parse)));
    const original = snapshots[0].scores[first.id];
    const changed = snapshots[1].scores[first.id];
    assert.ok(changed.cost > original.cost);
    assert.equal(changed.deltaFromPrevious, roundCost(changed.cost - original.cost));
    assert.equal(changed.deltaFromBaseline, roundCost(changed.cost - first.baseline.cost));
    assert.equal(await readFile(baselinePath, 'utf8'), fixtureBytes);
    assert.notEqual(invoke('second').status, 0);
    assert.equal(await readFile(indexPath, 'utf8'), indexBytes);
    await writeFile(baselinePath, fixtureBytes + '\n');
    result = invoke('third');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Baseline changed/);
    assert.equal(await readFile(indexPath, 'utf8'), indexBytes);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
