const transpositionMatrix = `
// u on top
u,f,r,l,b,br,bl,d
u,r,br,f,bl,b,l,d
u,br,b,r,l,bl,f,d
u,b,bl,br,f,l,r,d
u,bl,l,b,r,f,br,d
u,l,f,bl,br,r,b,d
// f on top
f,d,br,bl,u,r,l,b
f,r,u,br,bl,l,d,b
f,l,bl,u,br,d,r,b
f,br,r,d,l,u,bl,b
f,u,l,r,d,bl,br,b
f,bl,d,l,r,br,u,b
// r on top
r,d,br,f,u,b,l,bl
r,b,u,br,f,l,d,bl
r,l,f,u,br,d,b,bl
r,f,d,l,b,br,u,bl
r,br,b,d,l,u,f,bl
r,u,l,b,d,f,br,bl
// l on top
l,u,b,r,d,bl,f,br
l,bl,d,b,r,f,u,br
l,f,r,d,b,u,bl,br
l,r,u,f,bl,b,d,br
l,b,bl,u,f,d,r,br
l,d,f,bl,u,r,b,br
// b on top
b,l,u,bl,br,r,d,f
b,r,br,u,bl,d,l,f
b,d,bl,br,u,l,r,f
b,br,d,r,l,bl,u,f
b,bl,l,d,r,u,br,f
b,u,r,l,d,br,bl,f
// br on top
br,u,r,b,d,f,bl,l
br,f,d,r,b,bl,u,l
br,bl,b,d,r,u,f,l
br,d,bl,f,u,b,r,l
br,b,u,bl,f,r,d,l
br,r,f,u,bl,d,b,l
// bl on top
bl,u,b,l,d,br,f,r
bl,br,d,b,l,f,u,r
bl,f,l,d,b,u,br,r
bl,l,u,f,br,b,d,r
bl,b,br,u,f,d,l,r
bl,d,f,br,u,l,b,r
// d on top
d,r,f,br,bl,l,b,u
d,l,bl,f,br,b,r,u
d,b,br,bl,f,r,l,u
d,br,r,b,l,f,bl,u
d,f,l,r,b,bl,br,u
d,bl,b,l,r,br,f,u
`;

// CIF is an alternate view of the same EIF execution frame.
// U -> F completes the face permutation supplied with this conversion.
const CIF_TO_EIF = Object.freeze({
    U: 'F', R: 'R', B: 'U', L: 'L', BR: 'BR', BL: 'BL', D: 'B', F: 'D'
});
const DEFAULT_ROTATION = '{U,R}';
const EIF_FRONTS = {
    U: ['R', 'B', 'L'], F: ['D', 'R', 'L'], R: ['F', 'BR', 'U'],
    L: ['U', 'BL', 'F'], B: ['BR', 'BL', 'U'], BR: ['D', 'B', 'R'],
    BL: ['L', 'B', 'D'], D: ['BR', 'F', 'BL']
};

function isEIF(rotation) {
    const [top, front] = rotation.slice(1, -1).split(',');
    return EIF_FRONTS[top]?.includes(front) ?? false;
}

// The original matrix describes views relative to {U,F}. Keep it as geometry,
// then rebase the searchable EIF views to the default {U,R} input frame.
const viewMappings = {};
for (const line of transpositionMatrix.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const faces = trimmed.toUpperCase().split(',');
    viewMappings[`{${faces[0]},${faces[1]}}`] = Object.fromEntries(
        faces.map((face, index) => [face, ['U', 'F', 'R', 'L', 'B', 'BR', 'BL', 'D'][index]])
    );
}

const defaultView = viewMappings[DEFAULT_ROTATION];
const ROTATIONMAPPING = Object.fromEntries(
    Object.entries(viewMappings).filter(([rotation]) => isEIF(rotation)).map(([rotation, mapping]) => [
        rotation,
        Object.fromEntries(Object.entries(defaultView).map(([face, defaultFace]) => [defaultFace, mapping[face]]))
    ])
);

function mapAlg(tokenized, faceMap, startIndex = 0) {
    return tokenized.tokens.map((token, index) => {
        if (index < startIndex) return token;
        const match = token.match(/^([A-Za-z]+)(2'?|')?$/);
        if (!match || !faceMap[match[1].toUpperCase()]) {
            throw new Error(`Unsupported move: ${token}`);
        }
        const [, face, suffix = ''] = match;
        const mapped = faceMap[face.toUpperCase()];
        return (face === face.toLowerCase() ? mapped.toLowerCase() : mapped) + suffix;
    });
}

function normalizeToEIF(tokenized) {
    const rotation = tokenized.rot || DEFAULT_ROTATION;
    const mapping = viewMappings[rotation];
    if (!mapping) throw new Error(`Unsupported orientation: ${rotation}`);
    if (isEIF(rotation)) return { ...tokenized, rot: rotation };
    // The CIF view's B and U become the EIF top and front respectively.
    const originalFace = Object.fromEntries(Object.entries(mapping).map(([face, target]) => [target, face]));
    return {
        ...tokenized,
        tokens: mapAlg(tokenized, CIF_TO_EIF),
        rot: `{${originalFace.B},${originalFace.U}}`
    };
}

function transposeAlg(tokenized, rotation) {
    const map = ROTATIONMAPPING[rotation];
    if (!map) throw new Error(`Unsupported EIF orientation: ${rotation}`);
    return { tokens: mapAlg(tokenized, map), rot: rotation, auf: tokenized.auf };
}

const WIDEMOVEMAPPING = {
    r: { U: 'B', R: 'R', F: 'BR', B: 'L', L: 'U', BL: 'BL', BR: 'D', D: 'F' },
    "r'": { U: 'L', R: 'R', F: 'D', B: 'U', L: 'B', BL: 'BL', BR: 'F', D: 'BR' }
};

function makeWide(tokenized, index) {
    const token = tokenized.tokens[index];
    if (token !== 'BL' && token !== "BL'") return null;
    const replacement = token.replace('BL', 'r');
    const widened = { ...tokenized, tokens: tokenized.tokens.slice() };
    widened.tokens[index] = replacement;
    widened.tokens = mapAlg(widened, WIDEMOVEMAPPING[replacement], index + 1);
    return widened;
}

export { DEFAULT_ROTATION, CIF_TO_EIF, transposeAlg, ROTATIONMAPPING, normalizeToEIF, makeWide };
