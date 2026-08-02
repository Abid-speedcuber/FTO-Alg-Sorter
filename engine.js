(function (global) {
  const RESET = 0.3;
  const REGRIP_GOOD = 0.7;
  const REGRIP_BAD = 1.4;

  const IMPOSSIBLE = 10;
  const TERRIBLE = 4;
  const BAD = 2.2;
  const ACCEPTABLE = 1.8;
  const DECENT = 1.4;
  const GOOD = 1.2;
  const IDEAL = 1;
  const OVERLOAD_PENALTY = 0.4;

  const cif = {
    transitions: {
      front: {
        R: 'top',
        R2: 'back+',
        "R'": 'back-',
        r: 'top',
        r2: 'back+',
        "r'": 'back-'
      },
      top: {
        "R'": 'front',
        "R2'": 'back-',
        R: 'back+',
        "r'": 'front',
        "r2'": 'back-',
        r: 'back+'
      },
      'back+': {
        "R'": 'top',
        "R2'": 'front',
        "r'": 'top',
        "r2'": 'front'
      },
      'back-': {
        R: 'front',
        R2: 'top',
        r: 'front',
        r2: 'top'
      }
    },
    regripCosts: {
      front: {
        top: REGRIP_GOOD,
        'back+': REGRIP_BAD,
        'back-': REGRIP_BAD
      },
      top: {
        front: REGRIP_GOOD,
        'back+': REGRIP_BAD,
        'back-': REGRIP_BAD
      },
      'back+': {
        front: REGRIP_BAD,
        top: REGRIP_GOOD,
        'back-': REGRIP_BAD
      },
      'back-': {
        front: REGRIP_GOOD,
        top: REGRIP_BAD,
        'back+': REGRIP_BAD
      }
    },
    wristEquivalences: {
      R: "R2'",
      R2: "R'",
      "R'": 'R2',
      "R2'": 'R',
      r: "r2'",
      r2: "r'",
      "r'": 'r2',
      "r2'": 'r'
    },
    costmodel: {
      front: {
        R: [make_cost(IDEAL, 'wrist')],
        "R'": [make_cost(IDEAL, 'wrist')],
        R2: [make_cost(DECENT, 'wrist')],
        "R2'": [make_cost(IMPOSSIBLE, 'wrist')],
        r: [make_cost(IDEAL, 'wrist')],
        "r'": [make_cost(IDEAL, 'wrist')],
        r2: [make_cost(DECENT, 'wrist')],
        "r2'": [make_cost(IMPOSSIBLE, 'wrist')],
        U: [make_cost(IDEAL, 'index'), make_cost(GOOD, 'middle')],
        "U'": [make_cost(IDEAL, 'indexL'), make_cost(BAD, 'middleL')],
        F: [make_cost(DECENT, 'index')],
        "F'": [make_cost(ACCEPTABLE, 'index')],
        BR: [make_cost(BAD, 'middle'), make_cost(BAD, 'ringL'), make_cost(BAD, 'middleL')],
        "BR'": [make_cost(ACCEPTABLE, 'middle')],
        L: [make_cost(DECENT, 'index')],
        "L'": [make_cost(ACCEPTABLE, 'indexL')],
        D: [make_cost(DECENT, 'ringL')],
        "D'": [make_cost(ACCEPTABLE, 'ringL')],
        BL: [make_cost(TERRIBLE, 'wristL')],
        "BL'": [make_cost(TERRIBLE, 'wristL')],
        B: [make_cost(ACCEPTABLE, 'index')],
        "B'": [make_cost(DECENT, 'middleL')]
      },
      top: {
        R: [make_cost(DECENT, 'wrist')],
        "R'": [make_cost(IDEAL, 'wrist')],
        R2: [make_cost(IMPOSSIBLE, 'wrist')],
        "R2'": [make_cost(DECENT, 'wrist')],
        r: [make_cost(DECENT, 'wrist')],
        "r'": [make_cost(IDEAL, 'wrist')],
        r2: [make_cost(IMPOSSIBLE, 'wrist')],
        "r2'": [make_cost(DECENT, 'wrist')],
        U: [make_cost(GOOD, 'index')],
        "U'": [make_cost(IDEAL, 'indexL'), make_cost(BAD, 'middleL')],
        F: [make_cost(ACCEPTABLE, 'ring')],
        "F'": [make_cost(DECENT, 'ring')],
        BR: [make_cost(DECENT, 'middle'), make_cost(DECENT, 'index')],
        "BR'": [make_cost(DECENT, 'indexL'), make_cost(ACCEPTABLE, 'index')],
        L: [make_cost(BAD, 'thumb')],
        "L'": [make_cost(DECENT, 'indexL'), make_cost(ACCEPTABLE, 'thumbL')],
        D: [make_cost(DECENT, 'ringL')],
        "D'": [make_cost(ACCEPTABLE, 'ringL')],
        BL: [make_cost(TERRIBLE, 'wristL')],
        "BL'": [make_cost(TERRIBLE, 'wristL')],
        B: [make_cost(IDEAL, 'index')],
        "B'": [make_cost(GOOD, 'middleL')]
      },
      'back+': {
        R: [make_cost(IMPOSSIBLE, 'wrist')],
        "R'": [make_cost(IDEAL, 'wrist')],
        R2: [make_cost(IMPOSSIBLE, 'wrist')],
        "R2'": [make_cost(DECENT, 'wrist')],
        r: [make_cost(IMPOSSIBLE, 'wrist')],
        "r'": [make_cost(IDEAL, 'wrist')],
        r2: [make_cost(IMPOSSIBLE, 'wrist')],
        "r2'": [make_cost(DECENT, 'wrist')],
        U: [make_cost(ACCEPTABLE, 'indexL')],
        "U'": [make_cost(IDEAL, 'indexL')],
        F: [make_cost(TERRIBLE, 'index')],
        "F'": [make_cost(TERRIBLE, 'index')],
        BR: [make_cost(ACCEPTABLE, 'index')],
        "BR'": [make_cost(TERRIBLE, 'index')],
        L: [make_cost(IMPOSSIBLE, '')],
        "L'": [make_cost(IMPOSSIBLE, '')],
        D: [make_cost(ACCEPTABLE, 'index')],
        "D'": [make_cost(TERRIBLE, 'ringL')],
        BL: [make_cost(TERRIBLE, 'wristL')],
        "BL'": [make_cost(TERRIBLE, 'wristL')],
        B: [make_cost(TERRIBLE, 'middleL')],
        "B'": [make_cost(DECENT, 'middleL')]
      },
      'back-': {
        R: [make_cost(IDEAL, 'wrist')],
        "R'": [make_cost(IMPOSSIBLE, 'wrist')],
        R2: [make_cost(DECENT, 'wrist')],
        "R2'": [make_cost(IMPOSSIBLE, 'wrist')],
        r: [make_cost(IDEAL, 'wrist')],
        "r'": [make_cost(IMPOSSIBLE, 'wrist')],
        r2: [make_cost(DECENT, 'wrist')],
        "r2'": [make_cost(IMPOSSIBLE, 'wrist')],
        U: [make_cost(TERRIBLE, 'middle')],
        "U'": [make_cost(GOOD, 'indexL')],
        F: [make_cost(GOOD, 'ring')],
        "F'": [make_cost(DECENT, 'ring')],
        BR: [make_cost(IMPOSSIBLE, '')],
        "BR'": [make_cost(IMPOSSIBLE, '')],
        L: [make_cost(BAD, 'index')],
        "L'": [make_cost(ACCEPTABLE, 'indexL')],
        D: [make_cost(DECENT, 'ringL')],
        "D'": [make_cost(ACCEPTABLE, 'ringL')],
        BL: [make_cost(TERRIBLE, 'wristL')],
        "BL'": [make_cost(TERRIBLE, 'wristL')],
        B: [make_cost(TERRIBLE, 'middleL')],
        "B'": [make_cost(BAD, 'middleL')]
      }
    }
  };

  const eif = {
    transitions: {
      front: {
        R: 'back+',
        "R'": 'bottom',
        "R2'": 'back-',
        r: 'back+',
        "r'": 'bottom',
        "r2'": 'back-'
      },
      'back+': {
        "R'": 'front',
        "R2'": 'bottom',
        "r'": 'front',
        "r2'": 'bottom'
      },
      'back-': {
        R: 'bottom',
        R2: 'front',
        r: 'bottom',
        r2: 'front'
      },
      bottom: {
        R: 'front',
        R2: 'back+',
        "R'": 'back-',
        r: 'front',
        r2: 'back+',
        "r'": 'back-'
      }
    },
    regripCosts: {
      front: {
        'back+': REGRIP_GOOD,
        'back-': REGRIP_BAD,
        bottom: REGRIP_GOOD
      },
      bottom: {
        front: REGRIP_GOOD,
        'back+': REGRIP_BAD,
        'back-': REGRIP_GOOD
      },
      'back+': {
        front: REGRIP_GOOD,
        bottom: REGRIP_BAD,
        'back-': REGRIP_BAD
      },
      'back-': {
        bottom: REGRIP_GOOD,
        front: REGRIP_BAD,
        'back+': REGRIP_BAD
      }
    },
    wristEquivalences: {
      R: "R2'",
      R2: "R'",
      "R'": 'R2',
      "R2'": 'R',
      r: "r2'",
      r2: "r'",
      "r'": 'r2',
      "r2'": 'r'
    },
    costmodel: {
      front: {
        R: [make_cost(IDEAL, 'wrist')],
        "R'": [make_cost(IDEAL, 'wrist')],
        R2: [make_cost(IMPOSSIBLE, 'wrist')],
        "R2'": [make_cost(DECENT, 'wrist')],
        r: [make_cost(IDEAL, 'wrist')],
        "r'": [make_cost(IDEAL, 'wrist')],
        r2: [make_cost(IMPOSSIBLE, 'wrist')],
        "r2'": [make_cost(DECENT, 'wrist')],
        U: [make_cost(IDEAL, 'index')],
        "U'": [make_cost(IDEAL, 'indexL'), make_cost(BAD, 'middleL')],
        F: [make_cost(ACCEPTABLE, 'index')],
        "F'": [make_cost(DECENT, 'index')],
        BR: [make_cost(DECENT, 'middle'), make_cost(DECENT, 'index'), make_cost(BAD, 'ringL')],
        "BR'": [make_cost(DECENT, 'indexL'), make_cost(ACCEPTABLE, 'index')],
        L: [make_cost(ACCEPTABLE, 'indexL')],
        "L'": [make_cost(ACCEPTABLE, 'indexL'), make_cost(ACCEPTABLE, 'thumbL')],
        D: [make_cost(ACCEPTABLE, 'ringL'), make_cost(ACCEPTABLE, 'ringR')],
        "D'": [make_cost(DECENT, 'ringR')],
        BL: [make_cost(BAD, 'wristL')],
        "BL'": [make_cost(BAD, 'wristL')],
        B: [make_cost(TERRIBLE, 'wristL')],
        "B'": [make_cost(TERRIBLE, 'wristL')]
      },
      bottom: {
        R: [make_cost(IDEAL, 'wrist')],
        "R'": [make_cost(DECENT, 'wrist')],
        R2: [make_cost(DECENT, 'wrist')],
        "R2'": [make_cost(IMPOSSIBLE, 'wrist')],
        r: [make_cost(IDEAL, 'wrist')],
        "r'": [make_cost(DECENT, 'wrist')],
        r2: [make_cost(DECENT, 'wrist')],
        "r2'": [make_cost(IMPOSSIBLE, 'wrist')],
        U: [make_cost(GOOD, 'index')],
        "U'": [make_cost(IDEAL, 'indexL'), make_cost(GOOD, 'middleL')],
        F: [make_cost(GOOD, 'middle'), make_cost(GOOD, 'index')],
        "F'": [make_cost(IDEAL, 'indexL')],
        BR: [make_cost(DECENT, 'middleL')],
        "BR'": [make_cost(ACCEPTABLE, 'middle'), make_cost(BAD, 'index')],
        L: [make_cost(GOOD, 'index')],
        "L'": [make_cost(GOOD, 'indexL'), make_cost(ACCEPTABLE, 'thumbL')],
        D: [make_cost(DECENT, 'INDEX')],
        "D'": [make_cost(ACCEPTABLE, 'INDEX')],
        BL: [make_cost(BAD, 'wristL')],
        "BL'": [make_cost(BAD, 'wristL')],
        B: [make_cost(TERRIBLE, 'wristL')],
        "B'": [make_cost(TERRIBLE, 'wristL')]
      },
      'back+': {
        R: [make_cost(IMPOSSIBLE, 'wrist')],
        "R'": [make_cost(IDEAL, 'wrist')],
        R2: [make_cost(IMPOSSIBLE, 'wrist')],
        "R2'": [make_cost(DECENT, 'wrist')],
        r: [make_cost(IMPOSSIBLE, 'wrist')],
        "r'": [make_cost(IDEAL, 'wrist')],
        r2: [make_cost(IMPOSSIBLE, 'wrist')],
        "r2'": [make_cost(DECENT, 'wrist')],
        U: [make_cost(BAD, 'indexL')],
        "U'": [make_cost(GOOD, 'indexL')],
        F: [make_cost(DECENT, 'index')],
        "F'": [make_cost(GOOD, 'index')],
        BR: [make_cost(BAD, 'index')],
        "BR'": [make_cost(TERRIBLE, 'indexL')],
        L: [make_cost(IMPOSSIBLE, '')],
        "L'": [make_cost(TERRIBLE, 'thumbL')],
        D: [make_cost(TERRIBLE, 'index')],
        "D'": [make_cost(BAD, 'index')],
        BL: [make_cost(BAD, 'wristL')],
        "BL'": [make_cost(BAD, 'wristL')],
        B: [make_cost(ACCEPTABLE, 'index')],
        "B'": [make_cost(TERRIBLE, 'indexL')]
      },
      'back-': {
        R: [make_cost(IDEAL, 'wrist')],
        "R'": [make_cost(IMPOSSIBLE, 'wrist')],
        R2: [make_cost(DECENT, 'wrist')],
        "R2'": [make_cost(IMPOSSIBLE, 'wrist')],
        r: [make_cost(IDEAL, 'wrist')],
        "r'": [make_cost(IMPOSSIBLE, 'wrist')],
        r2: [make_cost(DECENT, 'wrist')],
        "r2'": [make_cost(IMPOSSIBLE, 'wrist')],
        U: [make_cost(TERRIBLE, 'middleL')],
        "U'": [make_cost(GOOD, 'middleL')],
        F: [make_cost(BAD, 'indexL')],
        "F'": [make_cost(DECENT, 'indexL')],
        BR: [make_cost(IMPOSSIBLE, '')],
        "BR'": [make_cost(IMPOSSIBLE, '')],
        L: [make_cost(ACCEPTABLE, 'index')],
        "L'": [make_cost(DECENT, 'indexL')],
        D: [make_cost(DECENT, 'index')],
        "D'": [make_cost(ACCEPTABLE, 'index')],
        BL: [make_cost(BAD, 'wristL')],
        "BL'": [make_cost(BAD, 'wristL')]
      }
    }
  };

  const CONFIGS = { CIF: cif, EIF: eif };

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
    console.log(letters);
    return faceMap[letters[0]][letters[1]];
  }

  function make_cost(cost, finger) {
    return { cost, finger };
  }

  function parse_alg(alg) {
    if (typeof alg !== 'string') {
      alg = String(alg || '');
    }

    let text = alg.trim();
    let auf = '';
    let rot = '';

    const rotMatch = text.match(/^\s*(\{[A-Z]+,[A-Z]+\})\s*/);
    if (rotMatch) {
      rot = rotMatch[1];
      text = text.slice(rotMatch[0].length).trim();
    }

    const aufMatch = text.match(/^\s*(\(U'??\))\s*/);
    if (aufMatch) {
      auf = aufMatch[1];
      text = text.slice(aufMatch[0].length).trim();
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
          if (regripCost) {
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

  function explore_alg(tokenized, config) {
    const tokens = tokenized.tokens;
    const pathOptions = [];

    for (const key of Object.keys(config.transitions)) {
      const result = _search_alg(tokens, 0, [], [key], 0, config, 0, false);
      if (result) {
        result.auf = tokenized.auf;
        result.rot = tokenized.rot;
        pathOptions.push(result);
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

  global.FTOAlgSorterEngine = {
    CONFIGS,
    getCorrectNotationFromRotation,
    parse_alg,
    explore_alg,
    resultToAlgStr
  };
})(window);
