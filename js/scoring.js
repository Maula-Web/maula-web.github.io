const ScoringSystem = {
    // Default Rules (Fallback)
    defaults: {
        bonus15: 30,
        bonus14: 30,
        bonus13: 15,
        bonus12: 10,
        bonus11: 5,
        bonus10: 3,
        penalty3: -1,
        penalty2: -2,
        penalty1: -3,
        penalty0: -5
    },

    init: function () {
        // Migration: Check if old v2 exists and history doesn't
        if (localStorage.getItem('maulas_rules_v2') && !localStorage.getItem('maulas_rules_history')) {
            const old = JSON.parse(localStorage.getItem('maulas_rules_v2'));
            const history = [
                { date: '2024-01-01T00:00:00.000Z', rules: { ...this.defaults, ...old } }
            ];
            localStorage.setItem('maulas_rules_history', JSON.stringify(history));
        }
    },

    getHistory: function () {
        if (this.historyCache) return this.historyCache; // Use in-memory cache populated by db-service.js if available

        const h = localStorage.getItem('maulas_rules_history');
        if (h) return JSON.parse(h);
        // If nothing, return default history starting "forever ago"
        return [{ date: '2000-01-01T00:00:00.000Z', rules: this.defaults }];
    },

    // Get rules active for a specific date (Date object or ISO string)
    // If no date provided, returns currently active rules (latest)
    getConfig: function (targetDate) {
        const history = this.getHistory();

        // Sort history descending by date
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (!targetDate) {
            return history[0].rules; // Latest
        }

        const t = new Date(targetDate).getTime();

        // Find the first rule set where activeDate <= targetDate
        const match = history.find(entry => new Date(entry.date).getTime() <= t);

        return match ? match.rules : history[history.length - 1].rules; // Fallback to oldest if target is very old
    },

    saveConfig: async function (newRules) {
        const history = this.getHistory();
        // Add new entry with current timestamp
        history.push({
            date: new Date().toISOString(),
            rules: newRules
        });
        
        // Update memory cache
        this.historyCache = history;
        
        // Save locally as fallback
        localStorage.setItem('maulas_rules_history', JSON.stringify(history));

        // Save to Firestore
        if (window.DataService && window.DataService.db) {
            try {
                await window.DataService.db.collection('config').doc('scoring_rules').set({ history });
                console.log("Scoring rules synced to Firestore.");
            } catch (e) {
                console.error("Error saving scoring rules to Firestore:", e);
            }
        }
    },

    calculateScore: function (hits, targetDate) {
        if (hits < 0) return 0;

        const rules = this.getConfig(targetDate);
        let bonus = 0;

        if (hits >= 15) bonus = parseInt(rules.bonus15);
        else if (hits === 14) bonus = parseInt(rules.bonus14);
        else if (hits === 13) bonus = parseInt(rules.bonus13);
        else if (hits === 12) bonus = parseInt(rules.bonus12);
        else if (hits === 11) bonus = parseInt(rules.bonus11);
        else if (hits === 10) bonus = parseInt(rules.bonus10);
        else if (hits === 3) bonus = parseInt(rules.penalty3);
        else if (hits === 2) bonus = parseInt(rules.penalty2);
        else if (hits === 1) bonus = parseInt(rules.penalty1);
        else if (hits === 0) bonus = parseInt(rules.penalty0);

        return hits + bonus;
    },

    // Helper to normalize results for comparison
    normalizeSign: function (res) {
        if (!res) return '';
        const r = String(res).trim().toUpperCase();
        if (r === '1' || r === 'X' || r === '2') return r;

        // Multi-goal results (P-15 style score strings "2-1")
        if (r.includes('-')) {
            const parts = r.split('-');
            const val = (s) => (s === 'M' || s === 'M+' ? 3 : parseInt(s) || 0);
            const home = val(parts[0]);
            const away = val(parts[1]);
            if (home > away) return '1';
            if (home < away) return '2';
            return 'X';
        }
        return r;
    },

    // Official LAE Reductions Matrix (7 Doubles - 16 bets)
    // Rows: Apuestas (1-16), Cols: Posiciones (1-7)
    // matrix[apuesta][posicion]
    reducciones: {
        'R2': [
            ['1', '1', '1', '1', '1', '1', '1'], // 1
            ['1', '1', '1', 'X', 'X', 'X', 'X'], // 2
            ['1', 'X', 'X', '1', '1', 'X', 'X'], // 3
            ['1', 'X', 'X', 'X', 'X', '1', '1'], // 4
            ['X', '1', 'X', '1', 'X', '1', 'X'], // 5
            ['X', '1', 'X', 'X', '1', 'X', '1'], // 6
            ['X', 'X', '1', '1', 'X', 'X', '1'], // 7
            ['X', 'X', '1', 'X', '1', '1', 'X'], // 8
            ['1', '1', 'X', '1', 'X', 'X', '1'], // 9
            ['1', '1', 'X', 'X', '1', '1', 'X'], // 10
            ['1', 'X', '1', '1', 'X', '1', 'X'], // 11
            ['1', 'X', '1', 'X', '1', 'X', '1'], // 12
            ['X', '1', '1', '1', '1', 'X', 'X'], // 13
            ['X', '1', '1', 'X', 'X', '1', '1'], // 14
            ['X', 'X', 'X', '1', '1', '1', '1'], // 15
            ['X', 'X', 'X', 'X', 'X', 'X', 'X']  // 16
        ]
    },

    // Returns { hits, points, bonus, breakdown, officialHits }
    // options: { isReduced: bool, reductionType: 'R2', reducedIndices: [] }
    evaluateForecast: function (forecastSelection, officialResults, targetDate, options = {}) {
        const { isReduced = false, reductionType = 'R2' } = options;

        const multiIndices = [];
        forecastSelection.forEach((sel, idx) => {
            if (idx < 14 && sel && sel.length > 1) {
                multiIndices.push(idx);
            }
        });

        if (isReduced && multiIndices.length === 7 && this.reducciones[reductionType]) {
            const matrix = this.reducciones[reductionType];
            const betsData = [];

            matrix.forEach(betRow => {
                let regHits = 0;
                let p15Hit = false;

                forecastSelection.forEach((sel, idx) => {
                    if (idx >= 15) return;
                    const res = officialResults[idx];
                    if (!res || res === '' || res.toUpperCase() === 'POR DEFINIR') return;

                    const rSign = this.normalizeSign(res);
                    const rScore = String(res).trim().toUpperCase();

                    let activeSign = sel;
                    if (multiIndices.includes(idx)) {
                        const matrixPos = multiIndices.indexOf(idx);
                        const matrixSign = betRow[matrixPos];
                        activeSign = (matrixSign === '1') ? sel[0] : (sel[1] || sel[0]);
                    }

                    if (idx < 14) {
                        if (activeSign.includes(rSign)) regHits++;
                    } else if (idx === 14) {
                        p15Hit = (rScore === activeSign) || (rSign === activeSign);
                    }
                });

                const totalRaw = regHits; // El partido 15 nunca suma aciertos
                const officialCat = (regHits === 14 && p15Hit) ? 15 : regHits;
                betsData.push({ totalRaw, officialCat });
            });

            const hits = Math.max(...betsData.map(b => b.totalRaw));
            const officialHits = Math.max(...betsData.map(b => b.officialCat));
            const points = this.calculateScore(hits, targetDate);

            const breakdown = { 15: 0, 14: 0, 13: 0, 12: 0, 11: 0, 10: 0 };
            betsData.forEach(b => {
                if (b.officialCat >= 10) breakdown[b.officialCat]++;
            });

            return { hits, points, bonus: points - hits, breakdown, officialHits };
        }

        // 3. Normal / Direct Multiple Logic
        let regHits = 0;
        let p15Hit = false;
        forecastSelection.forEach((sel, idx) => {
            if (idx >= 15) return;
            const res = officialResults[idx];
            if (!res || res === '' || res.toUpperCase() === 'POR DEFINIR') return;

            const pred = String(sel || '').trim().toUpperCase();
            const rSign = this.normalizeSign(res);
            const rScore = String(res).trim().toUpperCase();

            if (idx < 14) {
                if (pred.includes(rSign)) regHits++;
            } else if (idx === 14) {
                p15Hit = (rScore === pred) || (rSign === pred);
            }
        });

        const hits = regHits; // El partido 15 nunca suma aciertos
        const officialHits = (regHits === 14 && p15Hit) ? 15 : regHits;
        const points = this.calculateScore(hits, targetDate);
        return { hits, points, bonus: points - hits, breakdown: null, officialHits };
    },

    // Centralized evaluation logic for a member's forecast in a jornada
    evaluateMember: function (member, jornada, pronostico, options = {}) {
        const result = {
            played: false,
            hits: -1,
            points: 0,
            bonus: 0,
            prize: 0,
            isLate: false,
            isPardoned: false,
            potentialHits: null,
            tempBreakdown: null,
            pigHit: false,
            isPig15: false
        };

        if (!pronostico) return result;

        const sel = pronostico.selection || pronostico.forecasts || [];
        let actuallyPlayed = Array.isArray(sel) && sel.some(s => s && String(s).trim() !== '' && String(s) !== '-');

        if (!actuallyPlayed) return result;

        result.played = true;
        result.isLate = pronostico.late || false;
        result.isPardoned = pronostico.pardoned || false;
        result.pardonReason = pronostico.pardonReason || '';

        const officialResults = jornada.matches ? jornada.matches.map(m => m.result) : [];
        const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);

        // Check for PIG (Pleno al 15 is index 14)
        const match15 = jornada.matches && jornada.matches[14];
        if (match15 && window.AppUtils && window.AppUtils.isPigMatch(match15.home, match15.away)) {
            result.isPig15 = true;
        }

        const isReduced = pronostico.isReduced || false;
        const ev = this.evaluateForecast(sel, officialResults, jDate, { isReduced });
        result.tempBreakdown = ev.breakdown;

        // Check PIG hit status regardless of late sealing
        if (result.isPig15) {
            const rSign15 = this.normalizeSign(officialResults[14]);
            const pred15 = String(sel[14] || '').trim().toUpperCase();
            if (pred15 && (pred15 === rSign15 || pred15 === String(officialResults[14]).trim().toUpperCase())) {
                result.pigHit = true;
            }
        }

        // Determine if jornada is finished
        const filledMatches = jornada.matches ? jornada.matches.filter(m => m.result && m.result.trim() !== '' && m.result.trim() !== '-').length : 0;
        const now = new Date();
        const isPastDate = jDate && (now.getTime() - jDate.getTime() > 2 * 24 * 60 * 60 * 1000);
        const isFinished = (jornada.active === false) || (filledMatches === 15) || isPastDate || options.forceFinished;

        if (result.isLate && !result.isPardoned && isFinished) {
            result.hits = 0;
            result.points = this.calculateScore(0, jDate);
            result.bonus = result.points;
            result.potentialHits = ev.hits;
        } else {
            result.hits = ev.hits;
            if (isFinished) {
                result.points = ev.points;
                result.bonus = ev.bonus;
            } else {
                result.points = ev.hits;
                result.bonus = 0;
            }
        }

        // Calculate Prizes
        const legacyPrizes = jornada.prizeRates || jornada.prizes || {};
        if (result.tempBreakdown) {
            Object.keys(result.tempBreakdown).forEach(h => {
                const count = result.tempBreakdown[h];
                if (count > 0 && legacyPrizes[h]) {
                    result.prize += count * legacyPrizes[h];
                }
            });
        } else {
            let actualMinHits = jornada.minHitsToWin || 10;
            if (legacyPrizes && Object.keys(legacyPrizes).length > 0) {
                actualMinHits = Math.min(...Object.keys(legacyPrizes).map(Number));
            }
            if (result.hits >= actualMinHits) {
                result.prize = legacyPrizes[result.hits] || 0;
            }
        }

        return result;
    }
};

ScoringSystem.init(); // Run migration immediately on load
window.ScoringSystem = ScoringSystem;
