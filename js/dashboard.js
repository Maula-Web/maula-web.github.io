class DashboardManager {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];
        this.init();
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');

        // Ensure Rules are loaded
        if (window.ScoringSystem && window.ScoringSystem.getConfig) {
            window.ScoringSystem.getConfig();
        }

        this.renderStats();
    }

    renderStats() {
        const statsContainer = document.getElementById('dashboard-stats');
        if (!statsContainer) return;

        // 1. Nº Socios
        const activeMembers = this.members.length;

        // 2. Temporada
        const season = "2025-2026";

        // 3. Jornadas Jugadas (Completed)
        // A jornada is considered played if it has matches AND first match has result AND it is a Sunday.
        const playedJornadas = this.jornadas.filter(j => {
            const hasResult = j.matches && j.matches[0] && j.matches[0].result !== '';
            return hasResult && this.isValidJornadaDate(j.date);
        }).sort((a, b) => a.number - b.number);

        const playedCount = playedJornadas.length;

        // 4. Calculate Scores & Find Leader
        const memberStats = {};
        this.members.forEach(m => {
            memberStats[m.id] = {
                id: m.id,
                name: m.name + (m.surname ? ' ' + m.surname : ''),
                totalPoints: 0,
                totalHits: 0
            };
        });

        let lastJornadaInfo = null;

        // Process all played jornadas
        playedJornadas.forEach((jornada, index) => {
            const jornadaResults = [];

            this.members.forEach(member => {
                const p = this.pronosticos.find(pr => (pr.jornadaId === jornada.id || pr.jId === jornada.id) && (pr.memberId === member.id || pr.mId === member.id));
                let hits = -1; // Default 'Not Played'
                let isLate = false;
                let hasPronostico = false;

                if (p) {
                    hasPronostico = true;
                    hits = 0; // Start counting from 0
                    isLate = p.late || false;
                    const sel = p.selection || p.forecasts || [];

                    if (jornada.matches) {
                        jornada.matches.forEach((match, idx) => {
                            if (match.result && sel[idx] === match.result) hits++;
                        });
                    }
                }

                // HARDCODED SCORING RULES
                let points = 0;
                let bonus = 0;

                if (hits !== -1) {
                    if (hits >= 15) bonus = 30;
                    else if (hits === 14) bonus = 30;
                    else if (hits === 13) bonus = 15;
                    else if (hits === 12) bonus = 10;
                    else if (hits === 11) bonus = 5;
                    else if (hits === 10) bonus = 3;
                    else if (hits === 3) bonus = -1;
                    else if (hits === 2) bonus = -2;
                    else if (hits === 1) bonus = -3;
                    else if (hits === 0) bonus = -5;

                    points = hits + bonus;
                } else {
                    points = 0;
                }

                jornadaResults.push({
                    memberId: member.id,
                    hits: hits,
                    points: points,
                    isLate: isLate,
                    hasPronostico: hasPronostico,
                    runningTotal: 0
                });
            });

            // Update Totals
            jornadaResults.forEach(r => {
                if (memberStats[r.memberId]) {
                    memberStats[r.memberId].totalPoints += r.points;
                    memberStats[r.memberId].totalHits += r.hits;
                    r.runningTotal = memberStats[r.memberId].totalPoints;
                }
            });

            // Check if this is the last played jornada to determine Winner/User
            if (index === playedJornadas.length - 1) {
                lastJornadaInfo = this.calculateJornadaOutcome(jornada, jornadaResults, memberStats);
            }
        });

        // Determine Overall Leader
        let leaderName = "-";
        let leaderPoints = 0;
        if (playedCount > 0) {
            const sortedMembers = Object.values(memberStats).sort((a, b) => b.totalPoints - a.totalPoints);
            if (sortedMembers.length > 0) {
                leaderName = sortedMembers[0].name;
                leaderPoints = sortedMembers[0].totalPoints;
            }
        }

        // 5. Build HTML
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

        let deadlineHtml = "";
        if (nextJornadaData && nextJornadaData.date) {
            const matchDate = this.parseDateString(nextJornadaData.date);

            if (matchDate) {
                // Deadline: Thursday 17:00 implies -3 days from Sunday
                const deadline = new Date(matchDate);
                deadline.setDate(matchDate.getDate() - 3);
                deadline.setHours(17, 0, 0, 0);

                this.startCountdown(deadline);
                deadlineHtml = `
                    <div style="margin-top:1.5rem; background:#fff3e0; padding:1rem; border-radius:8px; border:1px solid #ffe0b2;">
                        <div style="color:#e65100; font-weight:bold; margin-bottom:0.5rem; font-size:0.9rem;">
                            ⏳ Límite para rellenar: Jueves 17:00h
                        </div>
                        <div id="countdown-timer" style="font-size:2.2rem; font-weight:800; color:#333; font-family:monospace;">
                            --:--:--:--
                        </div>
                         <div style="font-size:0.75rem; color:#666; margin-top:0.2rem;">días hrs min seg</div>
                    </div>
                `;
            }
        }

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
                <div style="font-size:1.1rem; color:#555; font-weight:bold; margin-top:0.2rem;">${leaderPoints} pts</div>
            </div>
            <div class="stat-wide-card">
                <h3 style="color:var(--dark-purple); font-weight:bold; font-size:1.1rem; margin-bottom:0.5rem;">PRÓXIMA JORNADA</h3>
                <div style="font-size:1.2rem; margin-bottom:1rem;">${nextJornadaLabel}</div>
                ${nextRolesHtml}
                ${deadlineHtml}
            </div>
        `;
    }

    startCountdown(deadline) {
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        const update = () => {
            const now = new Date().getTime();
            const distance = deadline.getTime() - now;

            const el = document.getElementById('countdown-timer');
            if (!el) return;

            if (distance < 0) {
                el.innerHTML = "TIEMPO AGOTADO";
                el.style.color = "#d32f2f";
                clearInterval(this.countdownInterval);
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            // Pad with zeros
            const dStr = String(days).padStart(2, '0');
            const hStr = String(hours).padStart(2, '0');
            const mStr = String(minutes).padStart(2, '0');
            const sStr = String(seconds).padStart(2, '0');

            el.innerHTML = `${dStr}:${hStr}:${mStr}:${sStr} `;
        };

        update(); // Initial call
        this.countdownInterval = setInterval(update, 1000);
    }

    calculateJornadaOutcome(jornada, results, memberStats) {
        // --- FIND WINNER ---
        // Criteria: 1. Most Hits. 2. Tie-break: Higher Accumulated Score (runningTotal).
        let sortedForWinner = [...results].sort((a, b) => {
            if (b.hits !== a.hits) return b.hits - a.hits; // Max hits first
            return b.runningTotal - a.runningTotal; // Max total points first
        });
        const winner = memberStats[sortedForWinner[0].memberId];

        // --- FIND LOSER (MAULA) ---
        let maulaCandidates = [];

        // Condition A: Missing or Late with no prize
        const prizeThreshold = 10;
        const offenders = results.filter(r =>
            !r.hasPronostico || (r.isLate && r.hits < prizeThreshold)
        );

        if (offenders.length > 0) {
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
        return this.jornadas
            .filter(j => j.active && this.isValidJornadaDate(j.date))
            .sort((a, b) => a.number - b.number)
            .find(j => {
                const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
                return filled < 15;
            });
    }

    // Helper: Parse date string to Date object
    parseDateString(dateStr) {
        if (!dateStr) return null;
        try {
            const lowerDate = dateStr.toLowerCase();
            if (lowerDate.includes('/')) {
                const parts = lowerDate.split('/');
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
            } else {
                const months = {
                    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
                    'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
                };
                const clean = lowerDate.replace(/\(.*\)/, '').replace(/ de /g, ' ').trim();
                const parts = clean.split(' ');
                if (parts.length >= 3) {
                    const day = parseInt(parts[0]);
                    const year = parseInt(parts[parts.length - 1]);
                    const monthStr = parts[1];
                    if (months.hasOwnProperty(monthStr)) {
                        return new Date(year, months[monthStr], day);
                    }
                }
            }
        } catch (e) { return null; }
        return null;
    }

    isValidJornadaDate(dateStr) {
        const d = this.parseDateString(dateStr);
        if (!d || isNaN(d.getTime())) return false;
        return d.getDay() === 0; // 0 = Sunday
    }
}

new DashboardManager();
