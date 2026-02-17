
const fs = require('fs');
const path = require('path');

// Mock a minimal environment to run the logic
const window = { AppUtils: { parseDate: (d) => new Date(d) } };

// Load data_loader.js content (I'll need to strips 'window.HISTORICAL_DATA =' part)
const dataLoaderContent = fs.readFileSync('d:/PROYECTO_MAULAS/js/data_loader.js', 'utf8');
const HISTORICAL_DATA = eval(dataLoaderContent.replace('window.HISTORICAL_DATA =', ''));

// Results from cloud-seeder.js (I'll extract them manually to keep script simple)
const JORNADAS_RESULTS = {
    1: ["2", "1", "1", "2", "X", "2", "1", "1", "1", "X", "2", "1", "X", "X", "1-1"],
    2: ["X", "X", "2", "1", "X", "1", "2", "1", "2", "2", "2", "X", "2", "2", "1-2"],
    3: ["X", "1", "2", "1", "X", "2", "1", "1", "X", "X", "1", "1", "2", "2", "1-1"],
    4: null, // missing?
    5: ["X", "1", "2", "1", "2", "1", "1", "1", "1", "X", "1", "1", "X", "X", "1"],
    6: null,
    7: ["2", "1", "1", "1", "2", "X", "X", "1", "1", "1", "X", "1", "1", "2", "2-0"],
    8: null,
    9: ["X", "1", "1", "2", "1", "1", "1", "1", "X", "2", "2", "1", "X", "2", "M-2"],
    10: null,
    11: ["2", "1", "1", "1", "1", "1", "2", "2", "X", "2", "1", "2", "1", "1", "1-1"],
    12: null,
    13: null,
    14: ["2", "1", "X", "1", "X", "X", "2", "2", "2", "1", "2", "2", "1", "X", "0-0"],
    15: null,
    16: ["X", "1", "2", "2", "X", "2", "1", "2", "X", "2", "1", "1", "1", "X", "2-1"],
    17: ["1", "1", "1", "2", "1", "1", "1", "X", "2", "1", "X", "X", "1", "2", "M-2"],
    18: null,
    19: ["1", "1", "1", "2", "1", "X", "1", "2", "X", "X", "1", "X", "1", "X", "0-0"],
    20: null,
    21: null,
    22: ["2", "1", "2", "1", "X", "X", "2", "X", "2", "X", "1", "1", "2", "1", "2-1"],
    23: null,
    24: ["X", "1", "2", "1", "2", "2", "2", "X", "1", "2", "X", "1", "2", "1", "1-1"],
    25: null,
    26: ["1", "1", "2", "1", "X", "", "", "", "2", "2", "2", "X", "", "", "1-0"]
};

// Members mapping
const members = [
    "Alvaro", "Carlos", "David Buzón", "Edu", "Emilio",
    "Fernando Lozano", "Fernando Ramírez", "Heradio", "JA Valdivieso", "Javier Mora",
    "Juan Antonio", "Juanjo", "Luismi", "Marcelo", "Martín",
    "Rafa", "Ramón", "Raúl Romera", "Samuel"
];

function calculateAciertos(official, forecast) {
    if (!official || !forecast) return 0;
    let aciertos = 0;
    for (let i = 0; i < 14; i++) {
        if (official[i] && forecast[i] && official[i].toString() === forecast[i].toString()) {
            aciertos++;
        }
    }
    return aciertos;
}

const winners = {};
HISTORICAL_DATA.forEach(h => {
    const jNum = h.jornada_num;
    const official = JORNADAS_RESULTS[jNum];
    if (!official) return;

    const ranking = [];
    Object.entries(h.predictions).forEach(([mId, preds]) => {
        const hits = calculateAciertos(official, preds);
        ranking.push({ mId: parseInt(mId), name: members[mId - 1], hits });
    });

    ranking.sort((a, b) => b.hits - a.hits || a.mId - b.mId);
    winners[jNum] = ranking;
});

console.log(JSON.stringify(winners, null, 2));
