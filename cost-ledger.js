import { CONFIGS, parse_alg, explore_alg, ROTATIONMAPPING } from './engine.js';

export const roundCost = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function formatDelta(value) {
  if (!Number.isFinite(value)) return 'unavailable';
  const rounded = roundCost(value);
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded).toFixed(2)}`;
}

// Keep the sheet's algorithm and starting thumb fixed; only optimize its
// finger choices and permitted regrips under the current engine.
export function evaluateEntry(entry, configs = CONFIGS) {
  try {
    const parsed = parse_alg(entry.algorithm);
    if (!parsed.tokens.length) throw new Error('No move tokens in the source algorithm.');
    if (!parsed.rot && entry.baseline.rotation) parsed.rot = entry.baseline.rotation;
    if (!parsed.auf && entry.baseline.auf) parsed.auf = entry.baseline.auf;
    const startThumb = entry.baseline.startThumb || undefined;
    if (startThumb && !configs.EIF.transitions[startThumb]) {
      throw new Error(`Starting thumb '${startThumb}' has no EIF state; this row needs an explicit grip conversion.`);
    }
    const execution = explore_alg(parsed, configs, ROTATIONMAPPING, { limit: 1, startThumb })[0];
    if (!execution || !Number.isFinite(execution.cost)) {
      return { status: 'unavailable', cost: null, deltaFromBaseline: null, reason: 'No execution found within the regrip limit.' };
    }
    return {
      status: 'ok', cost: roundCost(execution.cost),
      deltaFromBaseline: roundCost(execution.cost - entry.baseline.cost), execution
    };
  } catch (error) {
    return { status: 'unavailable', cost: null, deltaFromBaseline: null, reason: error.message };
  }
}

export function costBreakdown(execution) {
  const moves = execution.fingertricks.reduce((sum, move) => sum + move.cost, 0);
  const regrips = execution.fingertricks.reduce((sum, move) => sum + move.regripCost, 0);
  const overload = execution.fingertricks.reduce((sum, move) => sum + move.overloadCost, 0);
  return {
    orientation: roundCost(execution.rotCost), moves: roundCost(moves),
    regrips: roundCost(regrips), overload: roundCost(overload),
    total: roundCost(execution.rotCost + moves + regrips + overload)
  };
}

export function deltaFromPrevious(result, previousCost) {
  return result.status === 'ok' && Number.isFinite(previousCost)
    ? roundCost(result.cost - previousCost) : null;
}

// Snapshots use tuples to avoid repeating nine property names for every move.
// Live engine results stay self-describing objects.
export const MOVE_COLUMNS = ['token', 'finger', 'cost', 'thumb', 'thumbBefore', 'thumbAfter', 'regripCost', 'overloadCost', 'regrip'];
export function packExecution(execution) {
  return { ...execution, fingertricks: execution.fingertricks.map(move => MOVE_COLUMNS.map(key => move[key])) };
}
export function unpackExecution(execution) {
  if (!execution || !Array.isArray(execution.fingertricks[0])) return execution;
  return { ...execution, fingertricks: execution.fingertricks.map(move => Object.fromEntries(MOVE_COLUMNS.map((key, index) => [key, move[index]]))) };
}
