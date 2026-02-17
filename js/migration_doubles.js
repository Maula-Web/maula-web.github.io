
(async function () {
    // Force reinjection this time
    localStorage.removeItem('doubles_injected_v1');

    console.log("Iniciando inyección avanzada de quinielas de dobles...");

    const MISSING_DOUBLES = {
        1: { q1: ["1X", "1", "1X", "2", "1", "1", "1", "2", "1", "X2", "X", "1", "X2", "1", "0-2"], mId: 13 },
        2: { q1: ["X2", "1", "2", "1X", "2X", "1", "2", "1X", "1X", "2", "1", "1X", "2", "X2", "1-1"] },
        3: {
            q1: ["2", "X", "X", "1", "1X", "X1", "1X", "1", "1", "X1", "X1", "1X", "1", "1X", "1-2"],
            q2: ["X2", "1X", "2", "1", "X2", "1X", "1", "1", "1", "X", "1X", "1", "1X", "X2", "1-2"]
        },
        9: {
            q1: ["1X", "X1", "12", "X1", "2X", "1X", "1", "1", "2", "1", "1", "1X", "1", "1", "0-2"],
            q2: ["1X", "1", "1X", "12", "1", "1X", "1", "1", "X2", "1", "1", "1X", "1", "1X", "0-2"]
        },
        11: { q1: ["12", "1X", "1", "1", "2", "X2", "1X", "1", "1", "1X", "1X", "X", "1", "X2", "1-1"] },
        14: { q1: ["1", "1", "1X", "1", "X2", "1X", "X2", "2", "1", "1", "12", "1X", "X2", "2", "2-2"] },
        16: { q1: ["X", "1", "1", "2", "1X", "X", "1", "1X", "2", "2", "1X", "1", "X", "1X", "1-0"] },
        17: { q1: ["1X", "1", "1", "X2", "2X", "1", "1X", "1X", "1", "X1", "2X", "1", "2", "2", "1-0"] },
        19: { q1: ["1X", "1", "1", "1X", "1", "X2", "X2", "2", "1X", "X2", "12", "2", "X", "X", "1-M"] },
        22: { q1: ["1X", "1", "X1", "1", "2", "1", "2X", "2", "2X", "X1", "1", "2X", "1X", "1", "1-1"] },
        24: { q1: ["1", "1", "2", "1", "1X", "X2", "1X", "2", "X2", "X2", "1", "1", "12", "12", "1-2"] },
        26: { q1: ["1X", "2X", "2", "X2", "1", "1X", "1", "1", "2", "X", "1", "1", "1", "1", "1-1"] },
        28: { q1: ["1", "X2", "1", "1X", "1", "12", "2", "2", "X", "1", "1", "1X", "1", "X", "1-0"] },
        32: { q1: ["1X", "X2", "X2", "2", "1", "1", "X", "1X", "21", "1", "X1", "1", "1X", "1", "0-1"] }
    };

    if (!window.DataService) return;

    try {
        const jornadas = await window.DataService.getAll('jornadas');
        const pronosticos = await window.DataService.getAll('pronosticos');
        const existingExtra = await window.DataService.getAll('pronosticos_extra');

        const normalize = (r) => {
            if (!r) return '';
            const s = String(r).trim().toUpperCase();
            if (s === '1' || s === 'X' || s === '2') return s;
            if (s.includes('-')) {
                const p = s.split('-');
                const val = (x) => (x === 'M' || x === 'M+' ? 3 : parseInt(x) || 0);
                const h = val(p[0]), a = val(p[1]);
                return h > a ? '1' : (h < a ? '2' : 'X');
            }
            return s;
        };

        const calculateWinnerIds = (jNum) => {
            const j = jornadas.find(x => x.number === jNum);
            if (!j || !j.matches) return [];
            const results = j.matches.map(m => normalize(m.result));
            const counts = [];
            const jPronos = pronosticos.filter(p => String(p.jId) === String(j.id));
            jPronos.forEach(p => {
                let hits = 0;
                if (p.selection && Array.isArray(p.selection)) {
                    for (let i = 0; i < 14; i++) {
                        if (results[i] && p.selection[i] && String(p.selection[i]).includes(results[i])) hits++;
                    }
                }
                counts.push({ mId: p.mId, hits });
            });
            return counts.sort((a, b) => b.hits - a.hits || a.mId - b.mId);
        };

        let count = 0;
        for (const [jNumStr, data] of Object.entries(MISSING_DOUBLES)) {
            const jNum = parseInt(jNumStr);
            const j = jornadas.find(x => x.number === jNum);
            if (!j) continue;

            let mId = data.mId;
            let m2Id = null;

            if (jNum > 1) {
                const winners = calculateWinnerIds(jNum - 1);
                if (winners.length > 0) {
                    mId = winners[0].mId;
                    console.log(`J${jNum}: Ganador J${jNum - 1} es ID ${mId} (${winners[0].hits} ac)`);
                    if (data.q2 && winners.length > 1) m2Id = winners[1].mId;
                } else if (!mId) {
                    mId = 13; // Fallback Luismi
                    console.warn(`J${jNum}: No se encontró ganador para J${jNum - 1}. Usando ID 13.`);
                }
            }

            if (mId) {
                const docId = `${j.id}_${mId}`;
                if (!existingExtra.some(x => x.id === docId)) {
                    await window.DataService.save('pronosticos_extra', {
                        id: docId, jId: j.id, mId: mId, selection: data.q1, date: new Date().toISOString()
                    });
                    count++;
                }
            }
            if (m2Id && data.q2) {
                const docId2 = `${j.id}_${m2Id}`;
                if (!existingExtra.some(x => x.id === docId2)) {
                    await window.DataService.save('pronosticos_extra', {
                        id: docId2, jId: j.id, mId: m2Id, selection: data.q2, date: new Date().toISOString()
                    });
                    count++;
                }
            }
        }

        console.log(`Proceso completado. Registros inyectados: ${count}`);
        localStorage.setItem('doubles_injected_v1', 'true');
    } catch (e) {
        console.error("Error en migración de dobles:", e);
    }
})();
