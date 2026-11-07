import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildCaseIndex, rankCase } from '../case-rankings.js';

const baselineBytes = await readFile(new URL('../data/algorithm-baseline.json', import.meta.url));
const baseline = JSON.parse(baselineBytes);
const index = JSON.parse(await readFile(new URL('../data/case-index.json', import.meta.url)));
const history = JSON.parse(await readFile(new URL('../data/cost-history.json', import.meta.url)));
const entry = (id, caseNumber, cost, row) => ({ id, caseNumber, caseName: `Case ${caseNumber}`, sourceRow: row, baseline: { cost } });

test('cases remain separate and baseline positions sort by cost with stable ties', () => {
  const section = { entries: [entry('a', 186, 10, 2), entry('d', 187, 4, 4), entry('c', 186, 12, 3), entry('b', 186, 10, 1)] };
  const cases = buildCaseIndex(section);
  assert.deepEqual(cases.map(info => info.caseNumber), [186, 187]);
  assert.deepEqual(cases[0].entryIds, ['b', 'a', 'c']);
  assert.deepEqual(cases[1].entryIds, ['d']);
  assert.deepEqual(section.entries.map(entry => entry.id), ['a', 'd', 'c', 'b']);
});

test('gained/lost positions use the full case baseline; unavailable costs are unranked', () => {
  const section = { entries: [entry('a', 186, 10, 1), entry('b', 186, 11, 2), entry('c', 186, 12, 3)] };
  const info = buildCaseIndex(section)[0];
  const scores = { a: { status: 'ok', cost: 9 }, b: { status: 'ok', cost: 8 }, c: { status: 'unavailable', cost: null } };
  const lookup = Object.fromEntries(section.entries.map(entry => [entry.id, entry]));
  assert.deepEqual(rankCase(info, lookup, scores).entryIds, ['b', 'a', 'c']);
  assert.equal(scores.b.baselineRank, 2);
  assert.equal(scores.b.currentRank, 1);
  assert.equal(scores.b.positionsGained, 1);
  assert.equal(scores.a.positionsGained, -1);
  assert.equal(scores.c.baselineRank, 3);
  assert.equal(scores.c.currentRank, null);
  assert.equal(scores.c.positionsGained, null);
  scores.b.cost = 9;
  assert.deepEqual(rankCase(info, lookup, scores).entryIds, ['a', 'b', 'c']);
  assert.equal(scores.a.positionsGained, 0);
  assert.equal(scores.b.positionsGained, 0);
});

test('case JSON indexes all 377 cases exactly once and preserves original baseline bytes', () => {
  assert.equal(index.baselineSha256, createHash('sha256').update(baselineBytes).digest('hex'));
  let count = 0;
  for (const section of baseline.sections) {
    const prepared = index.sections.find(item => item.id === section.id);
    assert.deepEqual(prepared.cases, buildCaseIndex(section));
    count += prepared.cases.length;
  }
  assert.equal(count, 377);
  const diamonds = index.sections.find(section => section.id === 'd3');
  assert.ok(diamonds.cases.find(info => info.caseNumber === 186));
  assert.ok(diamonds.cases.find(info => info.caseNumber === 187));
});

test('every persisted position and cost order reconciles with its own case baseline', async () => {
  for (const revision of history.revisions) for (const section of baseline.sections) {
    const saved = JSON.parse(await readFile(new URL(`../${revision.sectionFiles[section.id]}`, import.meta.url)));
    const entries = new Map(section.entries.map(entry => [entry.id, entry]));
    const prepared = index.sections.find(item => item.id === section.id);
    assert.equal(saved.cases.length, prepared.cases.length);
    assert.equal(saved.cases.flatMap(info => info.entryIds).length, section.entries.length);
    for (const info of saved.cases) {
      const base = prepared.cases.find(item => item.caseNumber === info.caseNumber);
      assert.deepEqual(info.entryIds.slice().sort(), base.entryIds.slice().sort());
      let previousCost = -Infinity, previousRow = -Infinity;
      for (const [position, id] of info.entryIds.entries()) {
        const score = saved.scores[id];
        assert.equal(entries.get(id).caseNumber, info.caseNumber);
        assert.equal(score.baselineRank, base.entryIds.indexOf(id) + 1);
        if (score.status !== 'ok') {
          assert.equal(score.currentRank, null);
          assert.equal(score.positionsGained, null);
          continue;
        }
        assert.ok(score.cost >= previousCost);
        if (score.cost === previousCost) assert.ok(entries.get(id).sourceRow > previousRow);
        previousCost = score.cost;
        previousRow = entries.get(id).sourceRow;
        assert.equal(score.currentRank, position + 1);
        assert.equal(score.positionsGained, score.baselineRank - score.currentRank);
      }
    }
  }
});
