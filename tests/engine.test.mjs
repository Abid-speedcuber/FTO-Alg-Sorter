import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIGS, parse_alg, explore_alg, ROTATIONMAPPING } from '../engine.js';

const algorithm = parse_alg("{U,R} r U' r' U' R U r F U' R' U R F' R' U r'");
const search = options => explore_alg(algorithm, CONFIGS, ROTATIONMAPPING, options);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8);

test('returns multiple ranked executions from the same starting grip', () => {
  const paths = search({ limit: 6 });
  close(paths[0].cost, 18.4);
  assert.equal(paths.length, 6);
  const alternatives = paths.filter(path => Math.abs(path.cost - 18.6) < 1e-8);
  assert.ok(alternatives.length > 1);
  for (const boundary of [6, 7]) {
    assert.ok(alternatives.some(path => path.fingertricks[boundary].regrip));
  }
  assert.equal(new Set(paths.map(path => JSON.stringify(path.fingertricks))).size, paths.length);
  for (let i = 1; i < paths.length; i++) assert.ok(paths[i].cost >= paths[i - 1].cost);
  assert.deepEqual(search({ limit: 2 }), paths.slice(0, 2));
});

test('manual regrip can be added and removed at the selected boundary', () => {
  const regrips = Object.fromEntries(algorithm.tokens.slice(1).map((_, i) => [i + 1, 'none']));
  const original = search({ limit: 1, startThumb: 'bottom', regrips })[0];
  close(original.cost, 18.4);
  regrips[6] = 'bottom';
  const manual = search({ limit: 1, startThumb: 'bottom', regrips })[0];
  close(manual.cost, 18.6);
  assert.equal(manual.fingertricks[6].thumb, 'bottom');
  assert.equal(manual.fingertricks[6].regrip, true);
  assert.equal(manual.regrips, 1);
  regrips[6] = 'none';
  assert.deepEqual(search({ limit: 1, startThumb: 'bottom', regrips })[0], original);
  regrips[6] = 'front'; // Already at Front: this is not a regrip.
  assert.equal(search({ limit: 1, startThumb: 'bottom', regrips }).length, 0);
});

test('right-click edits may add a second explicit regrip', () => {
  const regrips = Object.fromEntries(algorithm.tokens.slice(1).map((_, i) => [i + 1, 'none']));
  regrips[6] = 'bottom';
  regrips[7] = 'bottom';
  const result = search({ limit: 1, startThumb: 'bottom', regrips })[0];
  assert.equal(result.regrips, 2);
  assert.deepEqual(result.fingertricks.flatMap((move, i) => move.regrip ? [i] : []), [6, 7]);
});
