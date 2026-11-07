import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIGS, parse_alg, explore_alg, ROTATIONMAPPING } from '../engine.js';
import { costBreakdown, packExecution, unpackExecution, roundCost } from '../cost-ledger.js';

const withoutPenalty = structuredClone(CONFIGS);
withoutPenalty.EIF.startingRegripCosts = {};
const run = (alg, thumb, configs = CONFIGS, options = {}) => explore_alg(parse_alg(alg), configs, ROTATIONMAPPING, { limit: 1, startThumb: thumb, ...options })[0];

test('U,R charges the starting grip once: back+ 0.40, back- 0.50, front/bottom zero', () => {
  for (const [thumb, penalty] of Object.entries({ 'back+': 0.4, 'back-': 0.5, front: 0, bottom: 0 })) {
    const actual = run("(U') {U,R} U F U'", thumb);
    const previous = run("(U') {U,R} U F U'", thumb, withoutPenalty);
    assert.equal(actual.startingRegripCost, penalty);
    assert.equal(roundCost(actual.cost - previous.cost), penalty);
    assert.deepEqual(actual.fingertricks, previous.fingertricks);
    assert.equal(actual.regrips, previous.regrips);
    assert.equal(costBreakdown(actual).startingRegrip, penalty);
    assert.equal(costBreakdown(actual).total, roundCost(actual.cost));
  }
});

test('other execution orientations do not inherit the U,R starting charge', () => {
  for (const rotation of Object.keys(ROTATIONMAPPING).filter(rotation => rotation !== '{U,R}')) {
    for (const thumb of ['front', 'bottom', 'back+', 'back-']) {
      const result = run(`${rotation} U`, thumb);
      assert.equal(result.startingRegripCost, 0, `${rotation} ${thumb}`);
      assert.equal(result.cost, run(`${rotation} U`, thumb, withoutPenalty).cost);
    }
  }
});

test('entering a back grip later does not create another starting penalty', () => {
  const wrist = run('{U,R} r U', 'front', CONFIGS, { regrips: { 1: 'none' } });
  assert.equal(wrist.fingertricks[1].thumb, 'back+');
  assert.equal(wrist.startingRegripCost, 0);
  const manual = run('{U,R} U U', 'front', CONFIGS, { regrips: { 1: 'back-' } });
  assert.equal(manual.startingRegripCost, 0);
  assert.equal(manual.regrips, 1);
  assert.equal(manual.fingertricks[1].regripCost, 0.7);
  assert.equal(costBreakdown(manual).total, roundCost(manual.cost));
});

test('the initial charge participates in best-grip ranking and default EIF search', () => {
  const ranked = explore_alg(parse_alg("{U,R} U'"), CONFIGS, ROTATIONMAPPING, { limit: 2 });
  assert.deepEqual(ranked.map(result => result.startThumb), ['front', 'bottom']);
  const defaultView = { '{U,R}': ROTATIONMAPPING['{U,R}'] };
  const unprefixed = explore_alg(parse_alg('U'), CONFIGS, defaultView, { limit: 1, startThumb: 'back-' })[0];
  assert.equal(unprefixed.startingRegripCost, 0.5);
});

test('starting charges survive snapshot packing, while older traces default to zero', () => {
  const actual = run('{U,R} U', 'back+');
  assert.deepEqual(unpackExecution(packExecution(actual)), actual);
  const historical = { ...actual, cost: actual.cost - 0.4 };
  delete historical.startingRegripCost;
  assert.equal(costBreakdown(historical).startingRegrip, 0);
  assert.equal(costBreakdown(historical).total, roundCost(historical.cost));
  const oldConfig = structuredClone(CONFIGS);
  delete oldConfig.EIF.startingRegripCosts;
  assert.equal(run('{U,R} U', 'back+', oldConfig).startingRegripCost, 0.4);
});
