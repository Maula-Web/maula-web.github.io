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

    saveConfig: function (newRules) {
        const history = this.getHistory();
        // Add new entry with current timestamp
        history.push({
            date: new Date().toISOString(),
            rules: newRules
        });
        localStorage.setItem('maulas_rules_history', JSON.stringify(history));
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

    // Returns { hits, points, bonus }
    evaluateForecast: function (forecastSelection, officialResults, targetDate) {
        let hits = 0;

        forecastSelection.forEach((sel, idx) => {
            if (idx >= 15) return; // Only first 15 matches count
            const res = officialResults[idx];
            if (!res || res === '' || res.toUpperCase() === 'POR DEFINIR') return;

            const pred = String(sel || '').trim().toUpperCase();
            const rSign = this.normalizeSign(res);
            const rScore = String(res).trim().toUpperCase();

            let isHit = false;
            if (idx === 14) {
                // P15: Exact match for score OR sign match
                isHit = (rScore === pred) || (rSign === pred);
            } else {
                // 1-14: Sign inclusion (supports doubles '1X' etc)
                isHit = pred.includes(rSign);
            }

            if (isHit) hits++;
        });

        const points = this.calculateScore(hits, targetDate);
        const bonus = points - hits;

        return { hits, points, bonus };
    }
};

ScoringSystem.init(); // Run migration immediately on load
window.ScoringSystem = ScoringSystem;
