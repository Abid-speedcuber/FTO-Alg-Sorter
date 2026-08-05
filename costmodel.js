

export const IMPOSSIBLE = 10;
export const OVERLOAD_PENALTY = 0.4;
const ROTATION_IDEAL = 1;
const ROTATION_GOOD = 1.4;
const ROTATION_BAD = 1.8;
const ROTATION_TERRIBLE = 2.2;
const RESET = 0.3;
const REGRIP_GOOD = 0.4;
const REGRIP_BAD = 0.7;
const TERRIBLE = 4;
const BAD = 2.2;
const ACCEPTABLE = 1.8;
const DECENT = 1.4;
const GOOD = 1.2;
const IDEAL = 1;
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
    rotationCosts: {
        "{U,F}": 0,
        "{U,R}": 0,
        "{U,L}": ROTATION_GOOD,
        "{U,B}": ROTATION_BAD,
        "{U,BR}": ROTATION_BAD,
        "{U,BL}": ROTATION_BAD,
        "{F,U}": ROTATION_TERRIBLE,
        "{F,L}": ROTATION_BAD,
        "{F,BL}": ROTATION_BAD,
        "{F,D}": ROTATION_GOOD,
        "{F,BR}": ROTATION_IDEAL,
        "{F,R}": ROTATION_BAD,
        "{R,U}": ROTATION_TERRIBLE,
        "{R,L}": ROTATION_BAD,
        "{R,F}": ROTATION_GOOD,
        "{R,D}": ROTATION_GOOD,
        "{R,BR}": ROTATION_BAD,
        "{R,B}": ROTATION_BAD,
        "{L,D}": ROTATION_BAD,
        "{L,F}": ROTATION_GOOD,
        "{L,R}": ROTATION_GOOD,
        "{L,U}": ROTATION_TERRIBLE,
        
        // TODO
        "{L,BL}": ROTATION_BAD,
        "{L,B}": ROTATION_BAD,
        "{B,U}": ROTATION_BAD,
        "{B,R}": ROTATION_BAD,
        "{B,L}": ROTATION_BAD,
        "{B,BR}": ROTATION_BAD,
        "{B,BL}": ROTATION_BAD,
        "{B,D}": ROTATION_BAD,
        "{BR,F}": ROTATION_BAD,
        "{BR,D}": ROTATION_BAD,
        "{BR,R}": ROTATION_BAD,
        "{BR,B}": ROTATION_BAD,
        "{BR,BL}": ROTATION_BAD,
        "{BR,U}": ROTATION_BAD,
        "{BL,BR}": ROTATION_BAD,
        "{BL,D}": ROTATION_BAD,
        "{BL,B}": ROTATION_BAD,
        "{BL,F}": ROTATION_BAD,
        "{BL,U}": ROTATION_BAD,
        "{BL,L}": ROTATION_BAD,
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
            U: [make_cost(ACCEPTABLE, 'index')],
            "U'": [make_cost(ACCEPTABLE, 'indexL'), make_cost(BAD, 'middleL')],
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
            "BL'": [make_cost(BAD, 'wristL')],
            B: [make_cost(TERRIBLE, 'index')],
            "B'": [make_cost(TERRIBLE, 'indexL')]
        }
    }
};
export const CONFIGS = { CIF: cif, EIF: eif };export function make_cost(cost, finger) {
    return { cost, finger };
}

