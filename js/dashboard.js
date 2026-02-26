class DashboardManager {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];
        this.init();
    }

    async init() {
        try {
            if (window.DataService) await window.DataService.init();

            this.members = await window.DataService.getAll('members');
            if (this.members && Array.isArray(this.members)) {
                this.members.sort((a, b) => parseInt(a.id) - parseInt(b.id)); // Global sort by member ID
            } else {
                this.members = [];
            }
            this.jornadas = await window.DataService.getAll('jornadas');
            this.pronosticos = await window.DataService.getAll('pronosticos');
            this.pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || [];

            // Ensure Rules are loaded
            if (window.ScoringSystem && window.ScoringSystem.getConfig) {
                window.ScoringSystem.getConfig();
            }

            this.renderStats();
        } catch (e) {
            console.error("Dashboard Init Error:", e);
            const statsContainer = document.getElementById('dashboard-stats');
            if (statsContainer) statsContainer.innerHTML = `<div style="color:red; text-align:center; padding:20px;">Error cargando datos: ${e.message}</div>`;
        }
    }

    renderStats() {
        try {
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
                const d = AppUtils.parseDate(j.date);
                const isValidDate = d && AppUtils.isSunday(d);
                return hasResult && isValidDate;
            }).sort((a, b) => a.number - b.number);

            const playedCount = playedJornadas.length;

            // 4. Calculate Scores & Find Leader
            const memberStats = {};
            const history = {}; // Track history for tie-breaks
            this.members.forEach(m => {
                memberStats[m.id] = {
                    id: m.id,
                    name: AppUtils.getMemberName(m),
                    totalPoints: 0,
                    totalHits: 0
                };
                history[m.id] = [];
            });

            let lastJornadaInfo = null;
            let totalSeasonPrizes = 0;
            let totalSeasonMoney = 0;

            // Process all played jornadas
            playedJornadas.forEach((jornada, index) => {
                const jornadaResults = [];
                const jDate = AppUtils.parseDate(jornada.date);

                this.members.forEach(member => {
                    const mIdStr = String(member.id);
                    const p = this.pronosticos.find(pr =>
                        (pr.jornadaId == jornada.id || pr.jId == jornada.id) &&
                        (pr.memberId == member.id || pr.mId == member.id)
                    );

                    let hits = -1;
                    let points = 0;
                    let bonus = 0;
                    let isLate = false;
                    let isPardoned = false;
                    let hasPronostico = false;
                    let isPig15 = false;
                    let pigHit = false;

                    if (p) {
                        hasPronostico = true;
                        isLate = p.late || false;
                        isPardoned = p.pardoned || false;
                        const sel = p.selection || p.forecasts || [];
                        const officialResults = jornada.matches ? jornada.matches.map(m => m.result) : [];

                        // Check for PIG (Pleno al 15 is index 14)
                        const pigTeams = ['Real Madrid', 'At. Madrid', 'Barcelona', 'FC Barcelona', 'Atlético de Madrid'];
                        const match15 = jornada.matches && jornada.matches[14];

                        if (match15) {
                            const home = match15.home || '';
                            const away = match15.away || '';
                            const isHomePig = pigTeams.some(t => home.includes(t));
                            const isAwayPig = pigTeams.some(t => away.includes(t));
                            if (isHomePig && isAwayPig) {
                                isPig15 = true;
                            }
                        }

                        // Use window.ScoringSystem to ensure access
                        let ev = { hits: -1, points: 0, bonus: 0 };
                        if (window.ScoringSystem) {
                            ev = window.ScoringSystem.evaluateForecast(sel, officialResults, jDate);
                        }

                        if (isLate && !isPardoned) {
                            hits = 0;
                            points = window.ScoringSystem ? window.ScoringSystem.calculateScore(0, jDate) : 0;
                            bonus = points;
                        } else {
                            hits = ev.hits;
                            points = ev.points;
                            bonus = ev.bonus;

                            // Exclude PIG from classification if it's Pleno al 15
                            if (isPig15) {
                                // Check if user hit the PIG (Match 15)
                                // sel[14] is the forecast, officialResults[14] is the result
                                if (sel[14] && sel[14] === officialResults[14]) {
                                    pigHit = true;
                                    // Remove this hit from classification stats
                                    hits = Math.max(0, hits - 1);
                                    // Recalculate points without this hit
                                    points = window.ScoringSystem ? window.ScoringSystem.calculateScore(hits, jDate) : 0;
                                }
                            }
                        }
                    } else {
                        hits = -1;
                        points = 0;
                    }

                    jornadaResults.push({
                        memberId: member.id,
                        name: AppUtils.getMemberName(member),
                        hits: hits,
                        points: points,
                        isLate: isLate,
                        isPardoned: isPardoned,
                        hasPronostico: hasPronostico,
                        pigHit: pigHit, // Store pig status
                        isPig15: isPig15, // Store if this row belongs to a PIG jornada
                        runningTotal: 0
                    });

                    // Add to history
                    history[member.id].push({ hits: hits, points: points });

                    // Accumulate season prizes
                    const prizesMap = jornada.prizes || jornada.prizeRates || {};
                    const prizeVal = prizesMap[hits] || prizesMap[String(hits)] || 0;

                    if (prizeVal > 0 && hasPronostico) {
                        totalSeasonPrizes++;
                        totalSeasonMoney += parseFloat(prizeVal);
                    }
                });

                // ADDITION: Count Extra Column prizes (Doubles) in the season total
                if (this.pronosticosExtra && this.pronosticosExtra.length > 0) {
                    const extras = this.pronosticosExtra.filter(p => {
                        const pJ = String(p.jId || p.jornadaId || '');
                        return pJ === String(jornada.id) || pJ === String(jornada.number);
                    });

                    extras.forEach(p => {
                        const sel = p.selection || p.forecasts || [];
                        const officialResults = jornada.matches ? jornada.matches.map(m => m.result) : [];
                        const evaluation = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(sel, officialResults, jornada.date) : { hits: 0, points: 0, bonus: 0 };

                        const prizesMap = jornada.prizes || jornada.prizeRates || {};
                        const prizeVal = prizesMap[evaluation.hits] || prizesMap[String(evaluation.hits)] || 0;
                        if (prizeVal > 0) {
                            totalSeasonMoney += parseFloat(prizeVal);
                        }
                    });
                }

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
                    lastJornadaInfo = this.calculateJornadaOutcome(jornada, jornadaResults, memberStats, history);
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
            let lastJornadaPrizesHtml = "";

            // Variables for upcoming/in-progress jornada
            const nextJornadaData = this.getNextJornadaData();
            let isNextJornadaInProgress = false;
            const targetJNum = nextJornadaData ? nextJornadaData.number : (playedJornadas.length + 1);

            if (nextJornadaData && nextJornadaData.matches) {
                const matchesWithResults = nextJornadaData.matches.filter(m => m.result && m.result !== '' && m.result !== '-').length;
                isNextJornadaInProgress = matchesWithResults > 0 && matchesWithResults < 15;
            }

            if (lastJornadaInfo) {
                winnerText = lastJornadaInfo.winnerName;
                loserText = lastJornadaInfo.loserName;

                let pigHtml = "";
                if (lastJornadaInfo.isPig) {
                    const acertantes = lastJornadaInfo.pigAcertantes.join(", ");
                    const fallantes = lastJornadaInfo.pigFallantes.join(", ");

                    pigHtml = `
                    <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px dashed #eee;">
                        <div style="font-size:0.9rem; margin-bottom:0.3rem;"><strong>🐽 PIG (Pleno al 15)</strong></div>
                        <div style="font-size:0.85rem; color:#2e7d32;">✅ ${acertantes || 'Ninguno'}</div>
                        <div style="font-size:0.85rem; color:#c62828;">❌ ${fallantes || 'Ninguno'}</div>
                    </div>
                `;
                }

                const rolesTitle = isNextJornadaInProgress ? `Jornada ${targetJNum} en curso` : `Roles Jornada ${targetJNum}`;

                nextRolesHtml = `
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee; text-align: left;">
                        ${isNextJornadaInProgress ? `
                            <div style="padding: 0.8rem; background: #fff3e0; border-radius: 8px; border-left: 4px solid #ff9800; margin-bottom: 1rem;">
                                <div style="font-size: 0.95rem; color: #e65100; font-weight: 600;">
                                    ⏳ ${rolesTitle}
                                </div>
                            </div>
                        ` : `
                            <div style="font-size: 1rem; color: var(--dark-purple); font-weight: bold; margin-bottom: 0.8rem;">
                                📋 Jornada ${targetJNum}
                            </div>
                        `}
                        <div style="margin-bottom:0.5rem;">
                            <span style="font-size:1.2rem;">🍻</span> 
                            <strong class="role-label">Rellena Dobles:</strong> <span class="role-winner" style="font-weight:bold;">${lastJornadaInfo.doblesEligibleNames.join(", ")}</span>
                        </div>
                        <div>
                            <span style="font-size:1.2rem;">✍️</span> 
                            <strong class="role-label">Sella la Quiniela:</strong> <span class="role-loser" style="font-weight:bold;">${loserText}</span>
                        </div>
                        ${pigHtml}
                        ${lastJornadaInfo.doublesHtml || ''}
                    </div>
                `;

                // Last Jornada Prizes
                const lastJNum = playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1].number : 0;
                const lastJDate = playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1].date : '';

                let prizesList = "";
                if (lastJornadaInfo.prizeWinners && lastJornadaInfo.prizeWinners.length > 0) {
                    prizesList = lastJornadaInfo.prizeWinners.map(pw => `
                    <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f5f5f5;">
                        <span style="font-weight:500;">${pw.name}</span>
                        <span style="background:var(--primary-green); color:white; padding:0 8px; border-radius:10px; font-weight:bold; font-size:0.85rem;">${pw.hits} aciertos</span>
                    </div>
                `).join('');
                } else {
                    prizesList = `<div style="color:#888; font-style:italic;">No hubo socios con premio (${lastJornadaInfo.minHitsToWin} aciertos)</div>`;
                }

                lastJornadaPrizesHtml = `
                <div class="stat-wide-card" style="border-left: 4px solid var(--primary-green); padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <!-- Column 1: Weekly -->
                        <div style="text-align: left; border-right: 1px solid #eee; padding-right: 1.5rem;">
                            <h3 style="color:var(--primary-green); font-weight:bold; font-size:1rem; margin-bottom:0.8rem; margin-top:0;">🏆 PREMIOS SEMANALES (J. ${lastJNum})</h3>
                            <div style="font-size:0.85rem; color:#666; margin-bottom:0.8rem;">Socios con ${lastJornadaInfo.minHitsToWin}+ aciertos:</div>
                            ${prizesList}
                            <div style="margin-top: 1rem; font-weight: bold; color: var(--primary-green); font-size: 1.1rem;">
                                Total Semana: ${lastJornadaInfo.totalMoney.toFixed(2)}€
                            </div>
                        </div>
                        
                        <!-- Column 2: Seasonal -->
                        <div style="text-align: left;">
                            <h3 style="color:var(--primary-blue); font-weight:bold; font-size:1rem; margin-bottom:0.8rem; margin-top:0;">📊 RESUMEN TEMPORADA</h3>
                            <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                                <div>
                                    <div style="font-size: 0.85rem; color: #666;">Total Pronósticos con Premio:</div>
                                    <div style="font-size: 1.4rem; font-weight: bold; color: var(--primary-green);">${totalSeasonPrizes}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.85rem; color: #666;">Total Recaudado en Premios:</div>
                                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary-blue);">${totalSeasonMoney.toFixed(2)}€</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            }

            const nextJornadaLabel = nextJornadaData ? `Jornada ${nextJornadaData.number} (${nextJornadaData.date})` : "Final de Temporada";

            let deadlineHtml = "";
            if (nextJornadaData && nextJornadaData.date) {
                const matchDate = AppUtils.parseDate(nextJornadaData.date);

                if (matchDate) {
                    // Deadline: Thursday 17:00 implies -3 days from Sunday
                    const deadline = new Date(matchDate);
                    deadline.setDate(matchDate.getDate() - 3);
                    deadline.setHours(17, 0, 0, 0);

                    this.startCountdown(deadline);

                    // Format deadline date: "Jueves dd/mm"
                    const dayName = "Jueves";
                    const dateFormatted = deadline.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

                    deadlineHtml = `
                    <div class="deadline-container" style="margin-top:1.5rem; padding:1rem; border-radius:8px;">
                        <div class="deadline-title" style="font-weight:bold; margin-bottom:0.5rem; font-size:0.9rem;">
                            ⏳ Límite para rellenar Jornada ${nextJornadaData.number}: ${dayName} ${dateFormatted} 17:00h
                        </div>
                        <div id="countdown-timer" style="font-size:2.2rem; font-weight:800; font-family:monospace;">
                            --:--:--:--
                        </div>
                         <div style="font-size:0.75rem; color:#666; margin-top:0.2rem;">días hrs min seg</div>
                    </div>
                `;
                }
            }

            const lastPlayedJ = playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1] : null;
            const hasUpcomingBote = lastPlayedJ && lastPlayedJ.hasBote;

            let boteBadgeHtml = "";
            if (hasUpcomingBote) {
                boteBadgeHtml = `
                    <div class="bote-badge" style="padding: 0.8rem; border-radius: 8px; margin-bottom: 1rem; font-weight: 800; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 15px rgba(255,152,0,0.4); animation: pulse 2s infinite;">
                        <span>💰</span> ¡HAY BOTE PARA ESTA JORNADA! <span>💰</span>
                    </div>
                    <style>
                        @keyframes pulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.03); }
                            100% { transform: scale(1); }
                        }
                    </style>
                `;
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
                
                ${lastJornadaPrizesHtml}
    
                <div class="stat-wide-card">
                    <h3 style="color:var(--dark-purple); font-weight:bold; font-size:1.1rem; margin-bottom:0.5rem;">${isNextJornadaInProgress ? 'JORNADA EN CURSO' : 'PRÓXIMA JORNADA'}</h3>
                    ${boteBadgeHtml}
                    <div style="font-size:1.2rem; margin-bottom:1rem;">${nextJornadaLabel}</div>
                    ${nextRolesHtml}
                    ${deadlineHtml}
                </div>

                <!-- Expulsion Button for the Prank -->
                <div id="prank-container" style="width: 100%; max-width: 1200px; margin-top: 1rem; display: none;">
                    <button id="btn-expulsar-emilio" class="stat-card" style="width: 100%; background: #d32f2f; color: white; border: none; cursor: pointer; padding: 1rem; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: bold; font-size: 1.1rem; border-bottom: 4px solid #b71c1c;">
                        🚩 ECHAR A EMILIO
                    </button>
                    <div id="prank-cooldown-msg" style="text-align: center; font-size: 0.85rem; color: #d32f2f; margin-top: 0.5rem; font-weight: bold; display: none;">
                        ⚠️ Faltan menos de 1 hora para el cierre. No podéis echarle ahora.
                    </div>
                </div>

            `;

            this.handlePrankDisplay();
        } catch (e) {
            console.error("Dashboard Render Error:", e);
            const statsContainer = document.getElementById('dashboard-stats');
            if (statsContainer) statsContainer.innerHTML = `<div style="color:red; text-align:center; padding:20px;">Error mostrando dashboard: ${e.message}</div>`;
        }
    }

    async handlePrankDisplay() {
        const user = JSON.parse(sessionStorage.getItem('maulas_user'));
        if (!user || user.email.toLowerCase() === 'emilio@maulas.com') return;

        const prankContainer = document.getElementById('prank-container');
        if (!prankContainer) return;

        prankContainer.style.display = 'block';

        const nextJornadaData = this.getNextJornadaData();
        let canExpel = true;

        if (nextJornadaData && nextJornadaData.date) {
            const matchDate = AppUtils.parseDate(nextJornadaData.date);
            if (matchDate) {
                const deadline = new Date(matchDate);
                deadline.setDate(matchDate.getDate() - 3);
                deadline.setHours(17, 0, 0, 0);

                const now = new Date();
                const diffMs = deadline.getTime() - now.getTime();
                const diffHours = diffMs / (1000 * 60 * 60);

                // Rule: Cannot expel if 1 hour or less until closure
                if (diffHours > 0 && diffHours <= 1) {
                    canExpel = false;
                }
            }
        }

        const btn = document.getElementById('btn-expulsar-emilio');
        const cooldownMsg = document.getElementById('prank-cooldown-msg');

        if (!canExpel) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            cooldownMsg.style.display = 'block';
        } else {
            btn.onclick = () => this.executePrank(AppUtils.getMemberName(user));
        }
    }

    async executePrank(userName) {
        if (!confirm('¿Seguro que quieres echar a Emilio de la web temporalmente?')) return;

        try {
            const config = await window.DataService.getAll('config');
            const prankCfg = config.find(c => c.id === 'prank') || { duration: 15, message: 'Nombre ha expulsado a Emilio de la web.' };

            const durationMin = prankCfg.duration || 15;
            const until = new Date();
            until.setMinutes(until.getMinutes() + durationMin);

            const status = {
                id: 'emilio_status',
                expelledUntil: until.toISOString(),
                expelledBy: userName,
                timestamp: new Date().toISOString()
            };

            await window.DataService.save('config', status);

            // Log it
            await window.DataService.logAction(userName, 'Expulsó a Emilio de la web por ' + durationMin + ' minutos');

            // Telegram
            if (window.TelegramService) {
                const tgCfg = config.find(c => c.id === 'telegram');
                // We send it if token and chatId exist, regardless of "Auto-Report" being enabled
                if (tgCfg && tgCfg.token && tgCfg.chatId) {
                    const text = (prankCfg.message || 'Nombre ha expulsado a Emilio de la web.').replace('Nombre', userName);
                    await window.TelegramService.sendRaw(tgCfg.token, tgCfg.chatId, '🚩 ' + text);
                }
            }

            alert('¡Emilio ha sido expulsado!');
            location.reload();
        } catch (e) {
            console.error(e);
            alert('Error al ejecutar la acción.');
        }
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

    calculateJornadaOutcome(jornada, results, memberStats, history) {
        // Safety checks
        if (!results || results.length === 0) return null;

        // --- FIND WINNER ---
        // 1. Filter by Max Points
        const maxPoints = Math.max(...results.map(r => r.points));
        let winnerCandidates = results.filter(r => r.points === maxPoints);

        if (winnerCandidates.length === 0) return null;

        // 2. Tie-break: Recursive History Check (Points)
        if (winnerCandidates.length > 1) {
            winnerCandidates = this.resolveTie(winnerCandidates, history, 'points', 'max');
        }

        // 3. Final Fallback (if still tied): Lower Member ID
        winnerCandidates.sort((a, b) => a.memberId - b.memberId);

        // Safety: ensure candidate exists in memberStats
        if (!winnerCandidates[0] || !memberStats[winnerCandidates[0].memberId]) return null;

        const winner = memberStats[winnerCandidates[0].memberId];


        // --- FIND LOSER (MAULA) ---
        let maulaCandidates = [];

        // Condition A: Missing or Late (Unpardoned) with no prize
        const prizeThreshold = jornada.minHitsToWin || 10;
        const offenders = results.filter(r =>
            !r.hasPronostico || (r.isLate && !r.isPardoned && r.hits < prizeThreshold)
        );

        if (offenders.length > 0) {
            maulaCandidates = offenders;
        } else {
            // Condition B: Lowest Score in this Jornada
            const minPoints = Math.min(...results.map(r => r.points));
            maulaCandidates = results.filter(r => r.points === minPoints);
        }

        // Tie-break: Recursive History Check (Points)
        if (maulaCandidates.length > 1) {
            maulaCandidates = this.resolveTie(maulaCandidates, history, 'points', 'min');
        }

        // Final Fallback: Higher Member ID
        maulaCandidates.sort((a, b) => b.memberId - a.memberId);

        const loserId = maulaCandidates[0] ? maulaCandidates[0].memberId : null;
        const loser = loserId ? memberStats[loserId] : { name: '-' };

        // Pig Stats for this Jornada
        const isPig = results.some(r => r.isPig15);
        let pigAcertantes = [];
        let pigFallantes = [];
        if (isPig) {
            pigAcertantes = results.filter(r => r.pigHit).map(r => r.name);
            pigFallantes = results.filter(r => !r.pigHit && r.hasPronostico).map(r => r.name);
        }

        // --- DOUBLES EVALUATION ---
        let doublesHtml = '';
        const doublesResults = [];
        const doublesForecasts = this.pronosticosExtra.filter(p => p.jId === jornada.id || p.jornadaId === jornada.id);

        if (doublesForecasts.length > 0) {
            const officialResults = jornada.matches ? jornada.matches.map(m => m.result) : [];

            doublesForecasts.forEach(df => {
                const mId = df.mId || df.memberId;
                const member = memberStats[mId];
                if (!member) return;

                const selection = df.selection || [];
                let hits = 0;
                selection.forEach((sel, idx) => {
                    const res = officialResults[idx];
                    if (res && sel && sel.includes(res)) {
                        hits++;
                    }
                });

                const minHits = jornada.minHitsToWin || 10;
                let prizeVal = 0;
                if (hits >= minHits && jornada.prizeRates && jornada.prizeRates[hits]) {
                    prizeVal = jornada.prizeRates[hits];
                }

                doublesResults.push({ name: member.name, hits: hits, prize: prizeVal });
            });
        }

        if (doublesResults.length > 0) {
            const items = doublesResults.map(r => {
                const prizeText = r.prize > 0 ? ` <span style="color:var(--primary-green); font-weight:bold;">(${r.prize.toFixed(2)}€)</span>` : '';
                return `${r.name}: <strong>${r.hits}</strong>${prizeText}`;
            }).join(', ');
            doublesHtml = `
                    <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px dashed #eee;">
                        <div class="doubles-label" style="font-size:0.9rem; margin-bottom:0.3rem;"><strong>🏆 Quinielas de Dobles</strong></div>
                        <div style="font-size:0.85rem; color:#333;">${items}</div>
                    </div>
            `;
        }


        // --- PRIZE WINNERS ---
        let minHitsToWin = jornada.minHitsToWin || 10;
        if (jornada.prizeRates && Object.keys(jornada.prizeRates).length > 0) {
            minHitsToWin = Math.min(...Object.keys(jornada.prizeRates).map(Number));
        }

        const prizeWinners = results
            .filter(r => {
                if (!r.hasPronostico) return false;
                const prizesMap = jornada.prizes || jornada.prizeRates || {};
                // Simply check if the prize for hits is > 0
                const val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;
                // If the value is "0,00 €" or similar, parseFloat might need cleaning?
                // But normally data is number or simple string.
                // User insists: "ver si en la jornada anterior la categoría de 10 aciertos tiene 0,00 € no cobra premio"
                // This means we should trust the value from the map.
                let numVal = val;
                if (typeof val === 'string') {
                    // Replace comma with dot just in case
                    numVal = parseFloat(val.replace(',', '.').replace('€', '').trim());
                }
                return numVal > 0;
            })
            .sort((a, b) => b.hits - a.hits)
            .map(r => ({ name: r.name, hits: r.hits }));

        // All eligible for NEXT dobles: Absolute Winner + anyone with a monetary prize > 0
        const eligibleNextNames = results
            .filter(r => {
                const isWinner = r.memberId === winnerCandidates[0].memberId;
                const prizesMap = jornada.prizes || jornada.prizeRates || {};
                const val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;

                let numVal = val;
                if (typeof val === 'string') {
                    numVal = parseFloat(val.replace(',', '.').replace('€', '').trim());
                }
                const hasPrize = numVal > 0;

                return isWinner || (hasPrize && r.hasPronostico);
            })
            .map(r => r.name);

        // Remove duplicates and sort
        const doblesEligibleNames = [...new Set(eligibleNextNames)].sort();

        // Safe Money Calculation
        const prizeMoney = prizeWinners.reduce((sum, pw) => {
            const prizesMap = jornada.prizes || jornada.prizeRates || {};
            // Try number key then string key
            let val = prizesMap[pw.hits] || prizesMap[String(pw.hits)] || 0;

            // Handle "4.24" or "4,24" or "4,24 €"
            if (typeof val === 'string') {
                val = parseFloat(val.replace(',', '.').replace('€', '').trim());
            }
            return sum + (val || 0);
        }, 0);
        const doublesMoney = doublesResults.reduce((sum, dr) => sum + (dr.prize || 0), 0);

        return {
            winnerName: winner.name,
            doblesEligibleNames: doblesEligibleNames,
            loserName: loser.name,
            isPig: isPig,
            pigAcertantes: pigAcertantes,
            pigFallantes: pigFallantes,
            doublesHtml: doublesHtml,
            prizeWinners: prizeWinners,
            minHitsToWin: minHitsToWin,
            totalMoney: prizeMoney + doublesMoney
        };
    }

    resolveTie(candidates, history, metric, goal) {
        // We start looking back from the entry BEFORE the current one.
        // Since history is pushed in sync with playedJornadas, the current jornada is at index (length - 1).
        // So we start at (length - 2).

        // Assume all candidates have same history length.
        const sampleId = candidates[0].memberId;
        const historyLen = history[sampleId].length;

        let index = historyLen - 2; // Start from previous jornada
        let currentCandidates = [...candidates];

        while (currentCandidates.length > 1 && index >= 0) {
            // Get values for this historical jornada
            const values = currentCandidates.map(c => {
                const hist = history[c.memberId][index];
                return {
                    id: c.memberId,
                    val: hist ? (metric === 'hits' ? hist.hits : hist.points) : 0
                };
            });

            // Find target value (Max or Min)
            let target;
            if (goal === 'max') {
                target = Math.max(...values.map(v => v.val));
            } else {
                target = Math.min(...values.map(v => v.val));
            }

            // Filter survivors
            const survivors = values.filter(v => v.val === target).map(v => v.id);
            currentCandidates = currentCandidates.filter(c => survivors.includes(c.memberId));

            index--;
        }

        return currentCandidates;
    }

    getNextJornadaData() {
        return this.jornadas
            .filter(j => {
                if (!j.active) return false;
                const d = AppUtils.parseDate(j.date);
                return d && AppUtils.isSunday(d);
            })
            .sort((a, b) => a.number - b.number)
            .find(j => {
                const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
                return filled < 15;
            });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DashboardManager();
});
