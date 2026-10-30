import { IMPOSSIBLE, OVERLOAD_PENALTY, CONFIGS } from './costmodel.js';
import { transposeAlg, ROTATIONMAPPING, makeWide } from './transpose.js';

function getCorrectNotationFromRotation(rot) {
  if (!rot) {
    return 'CIF';
  }
  
  const faceMap = {
    U: { R: 'EIF', L: 'EIF', B: 'EIF', F: 'CIF', BL: 'CIF', BR: 'CIF' },
    R: { U: 'EIF', BR: 'EIF', F: 'EIF', L: 'CIF', B: 'CIF', D: 'CIF' },
    F: { R: 'EIF', L: 'EIF', D: 'EIF', U: 'CIF', BL: 'CIF', BR: 'CIF' },
    L: { U: 'EIF', F: 'EIF', BL: 'EIF', R: 'CIF', D: 'CIF', B: 'CIF' },
    B: { U: 'EIF', BR: 'EIF', BL: 'EIF', R: 'CIF', L: 'CIF', D: 'CIF' },
    D: { BR: 'EIF', BL: 'EIF', F: 'EIF', B: 'CIF', R: 'CIF', L: 'CIF' },
    BR: { R: 'EIF', D: 'EIF', B: 'EIF', F: 'CIF', U: 'CIF', BL: 'CIF' },
    BL: { B: 'EIF', L: 'EIF', D: 'EIF', U: 'CIF', F: 'CIF', BR: 'CIF' }
  };
  
  const letters = rot.replaceAll(/\{|\}/g, '').split(',');
  return faceMap[letters[0]][letters[1]];
}

function parse_alg(alg) {
  if (typeof alg !== 'string') {
    alg = String(alg || '');
  }
  
  let text = alg.trim();
  let auf = '';
  let rot = '';
  
  const aufMatch = text.match(/^\s*(\(U'??\))\s*/);
  if (aufMatch) {
    auf = aufMatch[1];
    text = text.slice(aufMatch[0].length).trim();
  }
  
  const rotMatch = text.match(/^\s*(\{[A-Z]+,[A-Z]+\})\s*/);
  if (rotMatch) {
    rot = rotMatch[1];
    text = text.slice(rotMatch[0].length).trim();
  }
  
  text = text.replace(/\b([A-Z]+)w('?|2'?|2)\b/g, function (_, faceMod) {
    const face = faceMod.slice(0, -1).toLowerCase();
    const suffix = faceMod.slice(-1);
    if (suffix === 'w' || suffix === 'W') {
      return face;
    }
    return face + suffix;
  });
  
  const tokenRegex = /([A-Z]{1,2}|[a-z]{1,2})(?:2'|2|'|')?/g;
  const tokens = [];
  let tokenMatch;
  while ((tokenMatch = tokenRegex.exec(text)) !== null) {
    tokens.push(tokenMatch[0]);
  }
  
  return { tokens, auf, rot };
}

// Keep the cheapest distinct paths, including optional regrips before any move.
// Memoizing suffixes keeps the expanded search practical.
function searchExecution(tokens, config, startThumb, options) {
  const { limit, regrips = {} } = options;
  const maxRegrips = Math.max(1, Object.values(regrips).filter(grip => grip && grip !== 'none').length);
  const memo = new Map();
  function visit(index, thumb, lastFinger, remaining) {
    if (index === tokens.length) return [{ cost: 0, regrips: 0, fingertricks: [] }];
    const state = JSON.stringify([index, thumb, lastFinger, remaining]);
    if (memo.has(state)) return memo.get(state);
    const instruction = regrips[index];
    const grips = [];
    if (!instruction || instruction === 'none') grips.push({ thumb, cost: 0 });
    if (index > 0 && remaining > 0 && instruction !== 'none') {
      for (const [target, cost] of Object.entries(config.regripCosts[thumb] || {})) {
        if (target !== thumb && Number.isFinite(cost) && cost >= 0 &&
            config.costmodel[target] && (!instruction || instruction === target)) {
          grips.push({ thumb: target, cost, from: thumb });
        }
      }
    }
    const results = [];
    for (const grip of grips) {
      const token = tokens[index];
      const base = config.costmodel[grip.thumb]?.[token] || [];
      let moves = base.map(move => ({ ...move, token }));
      if (base.some(move => move.finger === 'wrist')) {
        const alternative = config.wristEquivalences[token];
        moves = moves.concat((config.costmodel[grip.thumb]?.[alternative] || [])
          .map(move => ({ ...move, token: alternative })));
      }
      for (const move of moves) {
        if (!Number.isFinite(move.cost) || move.cost >= IMPOSSIBLE) continue;
        const nextThumb = move.finger === 'wrist'
          ? config.transitions[grip.thumb]?.[move.token] : grip.thumb;
        if (!nextThumb) continue;
        const regripped = grip.from !== undefined;
        const overloadCost = lastFinger === move.finger && move.finger !== 'wrist'
          ? OVERLOAD_PENALTY : 0;
        for (const suffix of visit(index + 1, nextThumb, move.finger, remaining - Number(regripped))) {
          results.push({
            cost: grip.cost + move.cost + overloadCost + suffix.cost,
            regrips: suffix.regrips + Number(regripped),
            fingertricks: [{ ...move, thumb: grip.thumb, regrip: regripped }, ...suffix.fingertricks]
          });
        }
      }
    }
    const best = results.sort((a, b) => a.cost - b.cost).slice(0, limit);
    memo.set(state, best);
    return best;
  }
  return visit(0, startThumb, '', maxRegrips);
}

function explore_alg(tokenized, configs, rotationMap, options = {}) {
  const limit = Math.max(1, Math.min(100, options.limit ?? 100));
  const pathOptions = [];
  const algVariants = [];
  if (!tokenized.rot) {
    for (const rot of Object.keys(rotationMap)) {
      var transposed = transposeAlg(tokenized, rot);
      var widified = transposed;
      for (var i = 0; i < transposed.tokens.length; i++) {
        const wider = makeWide(widified, i);
        if (wider !== null) {
          widified = wider;
          console.log(widified);
        }
      }
      algVariants.push(widified);
    }
  } else {
    algVariants.push(tokenized);
  }
  for (const tokenized of algVariants) { 
    const notation = getCorrectNotationFromRotation(tokenized.rot); 
    const rotationCost = configs.CIF.rotationCosts[tokenized.rot];
    const config = configs[notation];
    for (const key of Object.keys(config.transitions)) {
      if (options.startThumb && options.startThumb !== key) continue;
      for (const result of searchExecution(tokenized.tokens, config, key, { ...options, limit })) {
        result.cost += rotationCost;
        result.startThumb = key;
        result.auf = tokenized.auf;
        result.rot = tokenized.rot;
        result.rotCost = rotationCost;
        pathOptions.push(result);
      }
    }
  }
  return pathOptions.sort((a, b) => a.cost - b.cost).slice(0, limit);
}

function resultToAlgStr(result) {
  const joined = result.fingertricks.map((entry) => entry.token).join(' ');
  const joinParts = [];
  if (result.auf) {
    joinParts.push(result.auf);
  }
  if (result.rot) {
    joinParts.push(result.rot);
  }
  joinParts.push(joined);
  return joinParts.join(' ');
}

export {
  CONFIGS,
  getCorrectNotationFromRotation,
  parse_alg,
  explore_alg,
  resultToAlgStr,
  transposeAlg,
  ROTATIONMAPPING
};
