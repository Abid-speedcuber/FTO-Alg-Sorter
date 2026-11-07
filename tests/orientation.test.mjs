import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIGS, parse_alg, explore_alg, resultToAlgStr, ROTATIONMAPPING, transposeAlg } from '../engine.js';
import { DEFAULT_ROTATION, normalizeToEIF, makeWide } from '../transpose.js';

const run = (alg, options = {}, rotations = ROTATIONMAPPING, configs = CONFIGS) =>
  explore_alg(parse_alg(alg), configs, rotations, { limit: 6, ...options });

test('unprefixed input uses EIF without changing moves in the default view', () => {
  assert.equal(DEFAULT_ROTATION, '{U,R}');
  assert.deepEqual(Object.keys(CONFIGS), ['EIF']);
  assert.deepEqual(transposeAlg(parse_alg("R U' F r"), DEFAULT_ROTATION),
    parse_alg("{U,R} R U' F r"));
  assert.deepEqual(run("R U' F r", {}, { [DEFAULT_ROTATION]: ROTATIONMAPPING[DEFAULT_ROTATION] }),
    run("{U,R} R U' F r"));
});

test('CIF {U,F} becomes EIF {B,U} with the supplied face mapping', () => {
  assert.deepEqual(normalizeToEIF(parse_alg('(U\') {U,F} R B L BR BL D F U')),
    parse_alg('(U\') {B,U} R U L BR BL B D F'));
  assert.deepEqual(normalizeToEIF(parse_alg("{U,F} r2' b' l2 br' bl2 d' f2 u'")),
    parse_alg("{B,U} r2' u' l2 br' bl2 b' d2 f'"));
});

test('equivalent CIF and EIF executions share paths and rotation costs', () => {
  const cif = run("(U') {U,F} R B L BR BL D F U");
  const eif = run("(U') {B,U} R U L BR BL B D F");
  assert.ok(cif.length > 0);
  assert.deepEqual(cif, eif);
  for (const result of cif) {
    assert.equal(result.rotCost, CONFIGS.EIF.rotationCosts['{B,U}']);
    assert.equal(result.rotCost, 1.8);
    assert.ok(resultToAlgStr(result).startsWith("(U') {B,U} "));
  }
  const configs = structuredClone(CONFIGS);
  configs.EIF.rotationCosts['{B,U}'] = 5;
  const changed = run('{U,F} R', {}, {}, configs)[0];
  assert.equal(changed.rotCost, 5);
  assert.equal(changed.cost - run('{U,F} R')[0].cost, 3.2);
});

test('other CIF orientations normalize to the corresponding EIF view', () => {
  assert.deepEqual(normalizeToEIF(parse_alg('{U,BR} B D F U')),
    parse_alg('{L,U} U B D F'));
  assert.deepEqual(normalizeToEIF(parse_alg('{D,R} B D F U')),
    parse_alg('{BL,D} U B D F'));
});

test('all 48 input views collapse into 24 valid EIF orientations', () => {
  const aliases = new Map();
  const faces = ['U', 'F', 'R', 'L', 'B', 'BR', 'BL', 'D'];
  for (const top of faces) for (const front of faces) {
    let normalized;
    try { normalized = normalizeToEIF(parse_alg(`{${top},${front}} R`)); }
    catch { continue; }
    assert.ok(normalized.rot in ROTATIONMAPPING, normalized.rot);
    assert.deepEqual(normalizeToEIF(normalized), normalized);
    aliases.set(normalized.rot, (aliases.get(normalized.rot) || 0) + 1);
  }
  assert.equal(aliases.size, 24);
  assert.ok([...aliases.values()].every(count => count === 2));
  for (const mapping of Object.values(ROTATIONMAPPING)) {
    assert.deepEqual(Object.keys(mapping).sort(), faces.slice().sort());
    assert.deepEqual(Object.values(mapping).sort(), faces.slice().sort());
  }
});

test('automatic transposition is relative to EIF input', () => {
  assert.deepEqual(transposeAlg(parse_alg('U F R L B BR BL D'), '{B,U}'),
    parse_alg('{B,U} F R BR D BL U L B'));
});

test('every searchable orientation has a finite rotation cost and executable path', () => {
  assert.equal(Object.keys(ROTATIONMAPPING).length, 24);
  assert.deepEqual(Object.keys(CONFIGS.EIF.rotationCosts).sort(), Object.keys(ROTATIONMAPPING).sort());
  for (const rot of Object.keys(ROTATIONMAPPING)) {
    const paths = run(`${rot} R U R'`);
    assert.ok(paths.length > 0, rot);
    assert.ok(paths.every(path => Number.isFinite(path.cost) && Number.isFinite(path.rotCost)), rot);
  }
  assert.ok(run("R U R'").every(path => Number.isFinite(path.cost)));
});

test('wide conversion remaps the suffix in the EIF frame', () => {
  assert.deepEqual(makeWide(parse_alg("{U,R} U BL U F D R'"), 1),
    parse_alg("{U,R} U r B BR F R'"));
  assert.deepEqual(makeWide(parse_alg("{U,R} BL' U F D"), 0),
    parse_alg("{U,R} r' L D BR"));
  const rotations = { [DEFAULT_ROTATION]: ROTATIONMAPPING[DEFAULT_ROTATION] };
  assert.deepEqual(run('BL U F D', {}, rotations), run('{U,R} r B BR F'));
});

test('manual regrip edits still work after CIF normalization and copied output round-trips', () => {
  const original = run('{U,F} R B R\' B\'')[0];
  const frozen = Object.fromEntries(original.fingertricks.slice(1).map((move, i) =>
    [i + 1, move.regrip ? move.thumb : 'none']));
  const rerun = run(resultToAlgStr(original), { startThumb: original.startThumb, regrips: frozen })[0];
  assert.deepEqual(rerun, original);
});

test('invalid orientations and missing rotation costs fail explicitly', () => {
  assert.throws(() => run('{U,U} R'), /Unsupported orientation/);
  const configs = structuredClone(CONFIGS);
  delete configs.EIF.rotationCosts['{B,U}'];
  assert.throws(() => run('{U,F} R', {}, {}, configs), /Missing or invalid EIF rotation cost/);
  assert.deepEqual(run('R', {}, {}), []);
});
