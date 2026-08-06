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

function _search_alg(tokens, index, fingertricks, thumbs, cost, config, regrips, isRegrip) {
  if (regrips > 1) {
    return null;
  }
  
  if (index === tokens.length) {
    const withThumbFingerTricks = fingertricks.map((move) => ({ ...move }));
    for (let i = 0; i < withThumbFingerTricks.length; i += 1) {
      withThumbFingerTricks[i].thumb = thumbs[i];
    }
    return {
      fingertricks: withThumbFingerTricks,
      cost,
      regrips
    };
  }
  
  const currentThumb = thumbs[thumbs.length - 1];
  const currentToken = tokens[index];
  const baseCostOptions = config.costmodel[currentThumb][currentToken] || [];
  let costOptions = baseCostOptions.map((option) => ({ ...option, token: currentToken }));
  
  if (costOptions.length > 0 && costOptions[0].finger === 'wrist') {
    const alternative = config.wristEquivalences[currentToken];
    const alternativeOptions = (config.costmodel[currentThumb][alternative] || []).map((option) => ({ ...option, token: alternative }));
    costOptions = costOptions.concat(alternativeOptions);
  }
  
  if (isRegrip) {
    for (const option of costOptions) {
      option.regrip = true;
    }
  }
  
  let lastFinger = '';
  if (fingertricks.length > 0) {
    lastFinger = fingertricks[fingertricks.length - 1].finger;
  }
  
  const optionResults = [];
  for (const option of costOptions) {
    let newThumb = currentThumb;
    if (option.finger === 'wrist') {
      newThumb = config.transitions[currentThumb][option.token];
    }
    
    if ((option.finger === 'wrist' && !config.transitions[currentThumb][option.token]) || option.cost === IMPOSSIBLE) {
      for (const key of Object.keys(config.transitions)) {
        const regripCost = config.regripCosts[currentThumb][key];
        if (regripCost && index > 0) {
          const newThumbsRegrip = [...thumbs];
          newThumbsRegrip[newThumbsRegrip.length - 1] = key;
          optionResults.push(_search_alg(tokens, index, fingertricks, newThumbsRegrip, cost + regripCost, config, regrips + 1, true));
        }
      }
      continue;
    }
    
    const newFingertricks = fingertricks.concat(option);
    const newThumbs = thumbs.concat(newThumb);
    const currentFinger = option.finger;
    let optionCost = cost + option.cost;
    if (lastFinger === currentFinger && currentFinger !== 'wrist') {
      optionCost += OVERLOAD_PENALTY;
    }
    
    optionResults.push(_search_alg(tokens, index + 1, newFingertricks, newThumbs, optionCost, config, regrips, false));
  }
  
  let bestResult = null;
  for (const result of optionResults) {
    if (!result) {
      continue;
    }
    if (!bestResult || result.cost < bestResult.cost) {
      bestResult = result;
    }
  }
  
  return bestResult;
}

function explore_alg(tokenized, configs, rotationMap) {
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
      const result = _search_alg(tokenized.tokens, 0, [], [key], rotationCost, config, 0, false);
      if (result) {
        result.auf = tokenized.auf;
        result.rot = tokenized.rot;
        result.rotCost = rotationCost;
        pathOptions.push(result);
      }
    }
  }
  return pathOptions.sort((a, b) => a.cost - b.cost);
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
