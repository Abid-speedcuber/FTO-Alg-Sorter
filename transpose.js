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

function buildRotationMap() {
    const lines = transpositionMatrix.split("\n");
    const rotationMap = {};
    for (const line of lines) {
        if (!line || line.startsWith('//')) continue;
        var faces = line.split(",").map((c) => c.toUpperCase());
        var rotationName = `{${faces[0]},${faces[1]}}`;
        // u,r,br,f,bl,l,b,d
        rotationMap[rotationName] = {
            [faces[0]]: "U", // u
            [faces[1]]: "F", // r
            [faces[2]]: "R", // br
            [faces[3]]: "L", // f
            [faces[4]]: "B", // bl
            [faces[5]]: "BR", // l
            [faces[6]]: "BL", // b
            [faces[7]]: "D", // d
        }
    }
    return rotationMap;
}

const ROTATIONMAPPING = buildRotationMap();

function mapAlg(tokenized, faceMap, startIndex) {
    const newTokens = [];
    var processed = 0;
    for (const token of tokenized.tokens) {
        if (processed < startIndex) {
            newTokens.push(token)
            processed += 1
            continue;
        }
        const match = token.match(/([A-Za-z]+)(2?'?)/);
        const [, face, suffix] = match ?? [];
        const key = face.toUpperCase();
        const isLower = key != face;
        var mappedFace = faceMap[face.toUpperCase()];
        if (isLower) {
            mappedFace = mappedFace.toLowerCase();
        }
        newTokens.push(mappedFace + suffix);
        processed += 1;
    }
    return newTokens;
}

function transposeAlg(tokenized, rotation) {
    const map = ROTATIONMAPPING[rotation];
    const newTokens = mapAlg(tokenized, map, 0);
    return {tokens: newTokens, rot: rotation, auf: tokenized.auf};
}

const WIDEMOVEMAPPING = {
    EIF: {
        "r": {
            "U": "B",
            "R": "R",
            "F": "BR",
            "B": "L",
            "L": "U",
            "BL": "BL",
            "BR": "D",
            "D": "F",
        },
        "r'": {
            "U": "L",
            "R": "R",
            "F": "D",
            "B": "U",
            "L": "B",
            "BL": "BL",
            "BR": "F",
            "D": "BR",
        }
    },
    CIF: {
        r: {
            "U": "BR",
            "R": "R",
            "F": "U",
            "B": "D",
            "L": "B",
            "BL": "BL",
            "BR": "F",
            "D": "L",
        },
        "r'": {
            "U": "F",
            "R": "R",
            "F": "BR",
            "B": "L",
            "L": "D",
            "BL": "BL",
            "BR": "U",
            "D": "B"
        }
    }
};

const EIFMap = {
    "{U,F}": "CIF",
    "{U,BR}": "CIF",
    "{U,BL}": "CIF",
    "{U,R}": "EIF",
    "{U,B}": "EIF",
    "{U,L}": "EIF",

    "{F,D}": "EIF",
    "{F,R}": "EIF",
    "{F,L}": "EIF",
    "{F,BR}": "CIF",
    "{F,U}": "CIF",
    "{F,BL}": "CIF",

    "{R,D}": "CIF",
    "{R,B}": "CIF",
    "{R,L}": "CIF",
    "{R,F}": "EIF",
    "{R,BR}": "EIF",
    "{R,U}": "EIF",

    "{L,R}": "CIF",
    "{L,B}": "CIF",
    "{L,D}": "CIF",
    "{L,U}": "EIF",
    "{L,BL}": "EIF",
    "{L,F}": "EIF",

    "{B,L}": "CIF",
    "{B,R}": "CIF",
    "{B,D}": "CIF",
    "{B,BR}": "EIF",
    "{B,BL}": "EIF",
    "{B,U}": "EIF",

    "{BR,U}": "CIF",
    "{BR,F}": "CIF",
    "{BR,BL}": "CIF",
    "{BR,D}": "EIF",
    "{BR,B}": "EIF",
    "{BR,R}": "EIF",

    "{BL,U}": "CIF",
    "{BL,BR}": "CIF",
    "{BL,F}": "CIF",
    "{BL,L}": "EIF",
    "{BL,B}": "EIF",
    "{BL,D}": "EIF",

    "{D,R}": "CIF",
    "{D,L}": "CIF",
    "{D,B}": "CIF",
    "{D,BR}": "EIF",
    "{D,F}": "EIF",
    "{D,BL}": "EIF",
}

function makeWide(tokenized, index) {
    const newTokenized = {
        rot: tokenized.rot,
        auf: tokenized.auf,
        tokens: []
    }
    var token = tokenized.tokens[index];
    if (token != "BL" && token != "BL'") {
        return null;
    }
    const notation = EIFMap[tokenized.rot];
    const faceMap = WIDEMOVEMAPPING[notation][token.replace("BL", "r")];

    for (var i = 0; i < tokenized.tokens.length; i++) {
        if (i != index) {
            newTokenized.tokens.push(tokenized.tokens[i]);
        } else {
            newTokenized.tokens.push(tokenized.tokens[i].replace("BL", "r"));
        }
    }
    if (tokenized.tokens.length > index + 1) {
        newTokenized.tokens = mapAlg(newTokenized, faceMap, index + 1);
    }
    return newTokenized;
}

export { transposeAlg, ROTATIONMAPPING, makeWide };