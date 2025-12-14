class DashboardManager {
    constructor() {
        this.members = JSON.parse(localStorage.getItem('maulas_members')) || [];
        this.jornadas = JSON.parse(localStorage.getItem('maulas_jornadas')) || [];
        this.pronosticos = JSON.parse(localStorage.getItem('maulas_pronosticos')) || [];
        this.init();
    }

    init() {
        this.renderStats();
    }

    renderStats() {
        const statsContainer = document.getElementById('dashboard-stats');
        if (!statsContainer) return;

        // 1. Nº Socios
        const activeMembers = this.members.length;

        // 2. Temporada (Hardcoded or derived)
        const season = "2025-2026";

        // 3. Jornadas Jugadas (Completed)
        const playedJornadas = this.jornadas.filter(j => {
            if (!j.active) return false;
            // Check if full results (15 matches)
            const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
            return filled === 15;
        }).sort((a, b) => a.number - b.number);

        const playedCount = playedJornadas.length;

        // Calculate Scores and Running Totals for Tie Breakers
        const memberStats = {};
        this.members.forEach(m => {
            memberStats[m.id] = {
                id: m.id,
                name: m.name + (m.surname ? ' ' + m.surname : ''),
                totalPoints: 0,
                totalHits: 0
            };
        });

        // Determine Winner/Loser for the LAST completed jornada
        let lastJornadaInfo = null;

        playedJornadas.forEach((jornada, index) => {
            const jornadaResults = [];

            this.members.forEach(member => {
                const p = this.pronosticos.find(pr => (pr.jornadaId === jornada.id || pr.jId === jornada.id) && (pr.memberId === member.id || pr.mId === member.id));
                let hits = 0;
                let isLate = false;
                let hasPronostico = false;

                if (p) {
                    hasPronostico = true;
                    isLate = p.late || false;
                    // Handle both property names
                    const sel = p.selection || p.forecasts || [];
                    jornada.matches.forEach((match, idx) => {
                        if (match.result && sel[idx] === match.result) hits++;
                    });
                }

                // Calc points
                let points = 0;
                if (hasPronostico) {
                    points = hits;
                    if (hits === 15) points += 10;
                    if (hits === 14) points += 5;
                    if (hits < 10) points -= 2;
                } else {
                    // No pronostico -> 0 points? Or big penalty? 
                    // Usually 0 hits, 0 points is bad enough, but "no rellenó" logic below for loser makes them loser automatically.
                    // Let's assume points = 0.
                    // If less than 10 hits (0 < 10), penalty applies? 0 - 2 = -2. 
                    if (0 < 10) points -= 2;
                }

                jornadaResults.push({
                    memberId: member.id,
                    hits: hits,
                    points: points,
                    isLate: isLate,
                    hasPronostico: hasPronostico
                    // We will add runningTotal later
                });
            });

            // Update Total Scores BEFORE determining winner of this round? 
            // "revisan las puntuaciones de las jornadas anteriores".
            // So for J-N tie break, we look at Accumulated(J-1).
            // But let's verify interpretation. Usually "General Standings" are used for tie break.
            // If I am leading the league, and I tie with you, usually the Leader wins (or loses?).
            // Let's use the Accumulated Score UP TO THIS JORNADA (inclusive) as the primary tie breaker metric.

            // Add current points to total
            jornadaResults.forEach(r => {
                memberStats[r.memberId].totalPoints += r.points;
                memberStats[r.memberId].totalHits += r.hits;
                r.runningTotal = memberStats[r.memberId].totalPoints;
            });

            // NOW Determine Winner/Loser for this Jornada
            if (index === playedJornadas.length - 1) {
                // This is the last played jornada
                lastJornadaInfo = this.calculateJornadaOutcome(jornada, jornadaResults, memberStats);
            }
        });

        // 4. Líder Actual (Overall)
        let leaderName = "-";
        if (playedCount > 0) {
            const leader = Object.values(memberStats).sort((a, b) => b.totalPoints - a.totalPoints)[0];
            leaderName = leader.name;
        }

        // 5. Build HTML
        // Reordered: Season First.
        // Winner/Loser logic for Next Jornada roles.

        let winnerText = "-";
        let loserText = "-";
        let nextRolesHtml = "";

        if (lastJornadaInfo) {
            winnerText = lastJornadaInfo.winnerName;
            loserText = lastJornadaInfo.loserName;

            nextRolesHtml = `
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee; text-align: left;">
                    <div style="margin-bottom:0.5rem;">
                        <span style="font-size:1.2rem;">👑</span> 
                        <strong>Columnas de Dobles:</strong> <span style="color:var(--primary-blue); font-weight:bold;">${winnerText}</span>
                    </div>
                    <div>
                        <span style="font-size:1.2rem;">🧊</span> 
                        <strong>Sella la Quiniela (Maula):</strong> <span style="color:var(--danger); font-weight:bold;">${loserText}</span>
                    </div>
                </div>
            `;
        }

        const nextJornadaData = this.getNextJornadaData();
        const nextJornadaLabel = nextJornadaData ? `Jornada ${nextJornadaData.number} (${nextJornadaData.date})` : "Final de Temporada";


        statsContainer.innerHTML = `
            <div class="stat-card">
                <h3>Temporada</h3>
                <div class="stat-value" style="font-size:1.5rem;">${season}</div>
            </div>
            <div class="stat-card">
                <h3>Socios Activos</h3>
                <div class="stat-value">${activeMembers}</div>
            </div>
            <div class="stat-card">
                <h3>Jornadas Jugadas</h3>
                <div class="stat-value">${playedCount}</div>
            </div>
            <div class="stat-card highlight-card">
                <h3>Líder Actual</h3>
                <div class="stat-value" style="color:var(--primary-gold); font-size:1.4rem;">${leaderName}</div>
            </div>
            <div class="stat-wide-card">
                <h3 style="color:var(--dark-purple); font-weight:bold; font-size:1.1rem; margin-bottom:0.5rem;">PRÓXIMA JORNADA</h3>
                <div style="font-size:1.2rem; margin-bottom:1rem;">${nextJornadaLabel}</div>
                ${nextRolesHtml}
            </div>
        `;
    }

    calculateJornadaOutcome(jornada, results, memberStats) {
        // results array has { memberId, hits, points, isLate, hasPronostico, runningTotal }

        // --- FIND WINNER ---
        // Criteria: 1. Most Hits. 2. Tie-break: Higher Accumulated Score (runningTotal).
        // (Assuming "puntuaciones de las jornadas anteriores" means running total).
        let sortedForWinner = [...results].sort((a, b) => {
            if (b.hits !== a.hits) return b.hits - a.hits; // Max hits first
            return b.runningTotal - a.runningTotal; // Max total points first
        });
        const winner = memberStats[sortedForWinner[0].memberId];

        // --- FIND LOSER (MAULA) ---
        // Criteria: 
        // 1. Automatic Loser: "no rellenó a tiempo y no ha obtenido premio".
        //    Interpretations: 
        //    - 'isLate' is true AND hits < prize_threshold? (Let's say prize is 10 hits).
        //    - OR '!hasPronostico'?
        //    Let's prioritize !hasPronostico as worst offender. 
        //    Then isLate && NoPrize.
        // 2. Lowest Score (points).
        // 3. Tie-break: Lower Accumulated Score (runningTotal) -> "Desempatar...". usually worst general player loses the tie? 
        //    Or maybe the BEST general player is forgiven? 
        //    "El perdedor es el socio que menos puntuación ha obtenido. En caso de empate se revisan las puntuaciones de las jornadas anteriores."
        //    Usually in Maulas logic: If I played bad today, but I am good overall, I shouldn't be the Maula. The guy who played bad today AND is bad overall is the Ultimate Maula.
        //    So: Limit checks to Min Points today. Then Sort by Min Rolling Total.

        let maulaCandidates = [];

        // Condition A: Missing or Late with no prize
        // Prize threshold: let's assume 10 hits is "premio" (points calculation gives a hint: <10 gets penalty).
        const prizeThreshold = 10;

        const offenders = results.filter(r =>
            !r.hasPronostico || (r.isLate && r.hits < prizeThreshold)
        );

        if (offenders.length > 0) {
            // Tie break among offenders?
            // "Si hubo un socio... ese será el perdedor". If multiple? 
            // Use same tie breaker: Worst accumulated score.
            maulaCandidates = offenders;
        } else {
            // Condition B: Lowest Score
            const minPoints = Math.min(...results.map(r => r.points));
            maulaCandidates = results.filter(r => r.points === minPoints);
        }

        // Sort candidates by Running Total ASC (Lower total score is 'worse' -> Maula)
        maulaCandidates.sort((a, b) => a.runningTotal - b.runningTotal);

        const loserId = maulaCandidates[0].memberId;
        const loser = memberStats[loserId];

        return {
            winnerName: winner.name,
            loserName: loser.name
        };
    }

    getNextJornadaData() {
        // Find first non-completed active jornada
        return this.jornadas
            .filter(j => j.active)
            .sort((a, b) => a.number - b.number)
            .find(j => {
                const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
                return filled < 15;
            });
    }
}

new DashboardManager();
