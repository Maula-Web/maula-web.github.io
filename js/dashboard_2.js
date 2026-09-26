/**
 * Dashboard 2.0 Controller - Peña Maulas PWA
 * =========================================================================
 * Centro de operaciones integral con estética Glassmorphism + Tailwind
 * Exclusivo en fase de pruebas para el evaluador: Fernando Lozano (ID: 6)
 * =========================================================================
 */

class Dashboard2AppController {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];
        this.pronosticosExtra = [];
        this.countdownInterval = null;
        this.nextJornada = null;
        this.submittedMembers = [];
        this.pendingMembers = [];

        this.init();
    }

    /**
     * Inicialización del controlador
     */
    async init() {
        // 1. Verificar acceso exclusivo para Fernando Lozano
        const hasAccess = this.checkAccessPermission();
        if (!hasAccess) {
            this.showRestrictedScreen();
            return;
        }

        this.showMainContent();

        // 2. Cargar datos en vivo desde Firebase Firestore
        await this.loadLiveFirebaseData();

        // 3. Renderizar todos los widgets del Dashboard
        this.renderDashboard();

        // 4. Configurar listeners de interfaz (cierre de dropdowns, etc.)
        this.initUiListeners();
    }

    /**
     * Comprueba si el usuario autenticado es Fernando Lozano
     */
    checkAccessPermission() {
        try {
            // Comprobar parámetros en URL (?evaluador=6 o ?user=6)
            const urlParams = new URLSearchParams(window.location.search);
            const evalParam = (urlParams.get('evaluador') || urlParams.get('user') || urlParams.get('socio') || '').toLowerCase();
            if (evalParam === '6' || evalParam === 'fernando' || evalParam === 'lozano') {
                const user = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
                sessionStorage.setItem('maulas_user', JSON.stringify(user));
                localStorage.setItem('maulas_user', JSON.stringify(user));
                return true;
            }

            const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
            if (!userStr) return false;

            const user = JSON.parse(userStr);
            const uid = String(user.id || '');
            const email = (user.email || '').toLowerCase().trim();
            const name = (user.name || '').toLowerCase().trim();
            const phone = (user.phone || '').toLowerCase().trim();

            return (
                uid === '6' ||
                email === 'lozano@maulas.com' ||
                name.includes('fernando lozano') ||
                (name.includes('lozano') && !name.includes('ram')) ||
                phone.includes('lozano')
            );
        } catch (e) {
            console.error('[Dashboard 2.0] Error comprobando permisos:', e);
            return false;
        }
    }

    showRestrictedScreen() {
        const restr = document.getElementById('restricted-screen');
        const main = document.getElementById('main-content');
        if (restr) restr.classList.remove('hidden');
        if (main) main.classList.add('hidden');
    }

    showMainContent() {
        const restr = document.getElementById('restricted-screen');
        const main = document.getElementById('main-content');
        if (restr) restr.classList.add('hidden');
        if (main) main.classList.remove('hidden');
    }

    promptLoginEvaluador() {
        const val = prompt('Introduce tu contraseña o apodo de evaluador:');
        if (!val) return;
        const clean = val.toLowerCase().trim();
        if (clean === 'lozano' || clean === 'fernando' || clean === 'maula' || clean === '6') {
            const user = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
            sessionStorage.setItem('maulas_user', JSON.stringify(user));
            localStorage.setItem('maulas_user', JSON.stringify(user));
            location.reload();
        } else {
            alert('Credencial incorrecta. Acceso denegado.');
        }
    }

    /**
     * Carga todos los datos de Firestore en tiempo real
     */
    async loadLiveFirebaseData() {
        try {
            if (window.DataService) await window.DataService.init();

            const data = await window.DataService.loadSeasonData();
            this.members = Array.isArray(data.members) ? data.members : [];
            this.jornadas = Array.isArray(data.jornadas) ? data.jornadas : [];
            this.pronosticos = Array.isArray(data.pronosticos) ? data.pronosticos : [];
            this.pronosticosExtra = Array.isArray(data.pronosticosExtra) ? data.pronosticosExtra : [];

            // Ejecutar el servicio de dado de quinielas si está disponible
            if (window.DiceService) {
                try {
                    await window.DiceService.checkAndApplyDice(this.members, this.jornadas, this.pronosticos);
                } catch (errDice) {
                    console.warn('[Dashboard 2.0] Error ejecutando DiceService:', errDice);
                }
            }

            // Asegurar que la configuración del sistema de puntuación está cargada
            if (window.ScoringSystem && window.ScoringSystem.getConfig) {
                window.ScoringSystem.getConfig();
            }
        } catch (e) {
            console.error('[Dashboard 2.0] Error cargando datos de Firestore:', e);
        }
    }

    /**
     * Renderizado completo de los 9 widgets y componentes
     */
    renderDashboard() {
        try {
            // 1. Jornadas disputadas oficiales (domingos con resultado en partido 0)
            const playedJornadas = this.jornadas.filter(j => {
                const hasResult = j.matches && j.matches[0] && j.matches[0].result !== '';
                const d = window.AppUtils ? window.AppUtils.parseDate(j.date) : new Date(j.date);
                const isValidDate = d && (window.AppUtils ? window.AppUtils.isSunday(d) : true);
                return hasResult && isValidDate;
            }).sort((a, b) => a.number - b.number);

            const playedCount = playedJornadas.length;

            // 2. Mapa O(1) de pronósticos por jornada y socio
            const pronosticosMap = new Map();
            this.pronosticos.forEach(pr => {
                if (!pr) return;
                const jIds = [];
                if (pr.jId !== undefined && pr.jId !== null) jIds.push(String(pr.jId));
                if (pr.jornadaId !== undefined && pr.jornadaId !== null) jIds.push(String(pr.jornadaId));

                const mIds = [];
                if (pr.mId !== undefined && pr.mId !== null) mIds.push(String(pr.mId));
                if (pr.memberId !== undefined && pr.memberId !== null) mIds.push(String(pr.memberId));

                jIds.forEach(j => {
                    mIds.forEach(m => {
                        const key = `${j}_${m}`;
                        if (!pronosticosMap.has(key)) pronosticosMap.set(key, pr);
                    });
                });
            });

            // 3. Estadísticas acumuladas de socios
            const memberStats = {};
            const history = {};
            this.members.forEach(m => {
                const displayName = window.AppUtils ? window.AppUtils.getMemberName(m) : (m.phone || m.name);
                memberStats[m.id] = {
                    id: m.id,
                    name: displayName,
                    fullName: m.name,
                    totalPoints: 0,
                    totalHits: 0
                };
                history[m.id] = [];
            });

            let lastJornadaOutcome = null;
            let totalSeasonIndivPrizes = 0;
            let totalSeasonDoblesPrizes = 0;
            let totalSeasonMoney = 0;

            // Procesar cada jornada disputada
            playedJornadas.forEach((jornada, index) => {
                const jornadaResults = [];

                this.members.forEach(member => {
                    const mIdStr = String(member.id);
                    const jIdStr = String(jornada.id);
                    const p = pronosticosMap.get(`${jIdStr}_${mIdStr}`);

                    let hits = -1;
                    let points = 0;
                    let isLate = false;
                    let isPardoned = false;
                    let hasPronostico = false;
                    let isPig15 = false;
                    let pigHit = false;
                    let potentialHits = null;

                    if (p) {
                        const ev = window.ScoringSystem ? window.ScoringSystem.evaluateMember(member, jornada, p) : { played: true, hits: 0, points: 0 };
                        if (ev.played) {
                            hasPronostico = true;
                            isLate = ev.isLate;
                            isPardoned = ev.isPardoned;
                            hits = ev.hits;
                            points = ev.points;
                            isPig15 = ev.isPig15;
                            pigHit = ev.pigHit;
                            potentialHits = ev.potentialHits;
                        }
                    }

                    const mStat = memberStats[member.id];
                    jornadaResults.push({
                        memberId: member.id,
                        name: mStat ? mStat.name : member.name,
                        points: points,
                        hits: hits,
                        potentialHits: potentialHits,
                        hasPronostico: hasPronostico,
                        isLate: isLate,
                        isPardoned: isPardoned,
                        isPig15: isPig15,
                        pigHit: pigHit
                    });

                    // Guardar histórico para desempates
                    history[member.id].push({
                        jornadaNumber: jornada.number,
                        points: points,
                        hits: (potentialHits !== null) ? potentialHits : (hits === -1 ? 0 : hits)
                    });

                    // Contabilizar premios individuales de esta jornada
                    if (hasPronostico && hits > 0) {
                        const prizesMap = jornada.prizes || jornada.prizeRates || {};
                        let pVal = prizesMap[hits] || prizesMap[String(hits)] || 0;
                        if (typeof pVal === 'string') {
                            pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                        }
                        if (pVal > 0) {
                            totalSeasonIndivPrizes++;
                            totalSeasonMoney += parseFloat(pVal);
                        }
                    }
                });

                // Contabilizar premios de dobles de esta jornada
                const doublesForecasts = this.pronosticosExtra.filter(df => df.jId === jornada.id || df.jornadaId === jornada.id);
                if (doublesForecasts.length > 0 && jornada.matches) {
                    const officialResults = jornada.matches.map(m => m.result);
                    doublesForecasts.forEach(df => {
                        const selection = df.selection || df.forecast || [];
                        const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
                        const isReduced = df.isReduced || (doubleCount === 7);
                        const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);
                        const ev = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced }) : null;
                        const prizesMap = jornada.prizes || jornada.prizeRates || {};

                        let extraPrizeAmount = 0;
                        let hasPrize = false;

                        if (ev && ev.breakdown) {
                            Object.keys(ev.breakdown).forEach(h => {
                                const count = ev.breakdown[h];
                                let pVal = prizesMap[h] || prizesMap[String(h)] || 0;
                                if (typeof pVal === 'string') {
                                    pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                                }
                                if (count > 0 && pVal > 0) {
                                    extraPrizeAmount += count * parseFloat(pVal);
                                    hasPrize = true;
                                }
                            });
                        }

                        if (hasPrize && extraPrizeAmount > 0) {
                            totalSeasonDoblesPrizes++;
                            totalSeasonMoney += extraPrizeAmount;
                        }
                    });
                }

                // Actualizar totales de puntos acumulados
                jornadaResults.forEach(r => {
                    if (memberStats[r.memberId]) {
                        memberStats[r.memberId].totalPoints += r.points;
                        const hitsToSum = (r.potentialHits !== null) ? r.potentialHits : (r.hits === -1 ? 0 : r.hits);
                        memberStats[r.memberId].totalHits += hitsToSum;
                    }
                });

                // Si es la última jornada disputada, calcular el Ganador y el Maula
                if (index === playedJornadas.length - 1) {
                    lastJornadaOutcome = this.calculateJornadaOutcome(jornada, jornadaResults, memberStats, history);
                }
            });

            // Respaldo de herencia para la jornada 1
            if (!lastJornadaOutcome) {
                lastJornadaOutcome = {
                    winnerName: "Álvaro",
                    loserName: "Edu",
                    doblesEligibleNames: ["Álvaro"],
                    isPig: false,
                    prizeWinners: [],
                    totalMoney: 0,
                    minHitsToWin: 10
                };
            }

            // 4. Determinar Líder de la General
            let leader = { name: '-', totalPoints: 0, totalHits: 0 };
            let secondLeaderPoints = 0;
            const sortedMembers = Object.values(memberStats).sort((a, b) => b.totalPoints - a.totalPoints || b.totalHits - a.totalHits);
            if (sortedMembers.length > 0) {
                leader = sortedMembers[0];
                if (sortedMembers.length > 1) {
                    secondLeaderPoints = sortedMembers[1].totalPoints;
                }
            }

            // 5. Determinar la Próxima Jornada y estado en curso
            this.nextJornada = this.getNextJornadaData();
            const targetJNum = this.nextJornada ? this.nextJornada.number : (playedJornadas.length + 1);

            let isNextInProgress = false;
            if (this.nextJornada && this.nextJornada.matches) {
                const matchesWithResults = this.nextJornada.matches.filter(m => m.result && m.result !== '' && m.result !== '-').length;
                isNextInProgress = matchesWithResults > 0 && matchesWithResults < 15;
            }

            // =================================================================
            // INYECTAR DATOS EN LOS ELEMENTOS DE LA INTERFAZ
            // =================================================================

            // A. Banner en vivo
            this.renderLiveBanner(this.nextJornada, isNextInProgress, targetJNum, playedJornadas);

            // B. Widget 1: Cuenta Atrás Digital
            this.renderCountdownWidget(this.nextJornada);

            // C. Widget 2: Participación y envíos de la peña
            this.renderSubmissionProgress(this.nextJornada, pronosticosMap);

            // D. Widget 3: 👑 Ganador Semanal (Rellena Dobles)
            const elWinnerName = document.getElementById('role-winner-name');
            const elWinnerDetail = document.getElementById('role-winner-detail');
            if (elWinnerName) elWinnerName.textContent = lastJornadaOutcome.winnerName || 'Pendiente';
            if (elWinnerDetail) {
                const eligibles = lastJornadaOutcome.doblesEligibleNames || [lastJornadaOutcome.winnerName];
                elWinnerDetail.textContent = eligibles.length > 1 ? `Dobles: ${eligibles.join(', ')}` : 'Rellena los 7 dobles reducidos';
            }

            // E. Widget 4: 💀 El Maula Semanal (Sellador)
            const elLoserName = document.getElementById('role-loser-name');
            const elLoserDetail = document.getElementById('role-loser-detail');
            if (elLoserName) elLoserName.textContent = lastJornadaOutcome.loserName || 'Pendiente';
            if (elLoserDetail) elLoserDetail.textContent = `Sella el boleto antes del jueves 17:00h`;

            // F. Widget 5: 🐷 Partido PIG (Pleno al 15)
            this.renderPigWidget(lastJornadaOutcome, this.nextJornada);

            // G. Widget 6: 🏆 Líder de la General
            const elLeaderName = document.getElementById('leader-name');
            const elLeaderPoints = document.getElementById('leader-points');
            const elLeaderDiff = document.getElementById('leader-diff');
            if (elLeaderName) elLeaderName.textContent = leader.name || '-';
            if (elLeaderPoints) elLeaderPoints.textContent = `${leader.totalPoints || 0} pts`;
            if (elLeaderDiff) {
                const diff = (leader.totalPoints || 0) - secondLeaderPoints;
                elLeaderDiff.textContent = `(Ventaja: +${diff} pts)`;
            }

            // H. Widget 7: 💰 Bote Acumulado en Caja
            this.renderBoteWidget(playedJornadas);

            // I. Widget 8: 🎁 Premios de la semana y temporada
            this.renderPrizesWidget(lastJornadaOutcome, totalSeasonMoney, totalSeasonIndivPrizes, totalSeasonDoblesPrizes, playedJornadas);

            // J. Widget 9: Broma de Emilio
            this.handlePrankDisplay();

        } catch (e) {
            console.error('[Dashboard 2.0] Error renderizando el dashboard:', e);
        }
    }

    /**
     * Banner de estado en vivo en la parte superior
     */
    renderLiveBanner(nextJ, inProgress, targetJNum, playedJornadas) {
        const banner = document.getElementById('live-jornada-banner');
        const icon = document.getElementById('live-banner-icon');
        const tag = document.getElementById('live-banner-tag');
        const title = document.getElementById('live-banner-title');
        const sub = document.getElementById('live-banner-subtitle');
        const alertBote = document.getElementById('official-bote-alert');

        if (!banner) return;
        banner.classList.remove('hidden');

        // Bote oficial de loterías
        const lastPlayedJ = playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1] : null;
        const hasUpcomingBote = (nextJ && nextJ.hasBote) || (lastPlayedJ && lastPlayedJ.hasBote);
        if (alertBote) {
            if (hasUpcomingBote) alertBote.classList.remove('hidden');
            else alertBote.classList.add('hidden');
        }

        if (inProgress) {
            if (icon) icon.innerHTML = '⚡';
            if (tag) {
                tag.textContent = 'En Vivo';
                tag.className = 'px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono animate-pulse';
            }
            if (title) title.textContent = `Jornada ${targetJNum} en Juego`;
            if (sub) sub.textContent = 'Los partidos de esta jornada se están disputando en directo. ¡Consulta los resultados!';
        } else if (nextJ && nextJ.date) {
            if (icon) icon.innerHTML = '⚽';
            if (tag) {
                tag.textContent = 'Próxima Jornada';
                tag.className = 'px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono';
            }
            if (title) title.textContent = `Jornada ${nextJ.number} - ${nextJ.date}`;
            if (sub) sub.textContent = 'Plazo para rellenar la quiniela abierto hasta el jueves a las 17:00h.';
        } else {
            if (title) title.textContent = 'Temporada 2026-2027';
            if (sub) sub.textContent = 'Todas las jornadas oficiales disputadas hasta la fecha.';
        }
    }

    /**
     * Cuenta atrás digital futurista
     */
    renderCountdownWidget(nextJ) {
        if (!nextJ || !nextJ.date) {
            const elDeadline = document.getElementById('cd-deadline-label');
            if (elDeadline) elDeadline.textContent = 'Temporada finalizada';
            return;
        }

        const matchDate = window.AppUtils ? window.AppUtils.parseDate(nextJ.date) : new Date(nextJ.date);
        if (!matchDate) return;

        const deadline = window.AppUtils ? window.AppUtils.calculateDeadline(matchDate) : new Date(matchDate.getTime() - 3 * 24 * 3600 * 1000);

        const elDeadline = document.getElementById('cd-deadline-label');
        if (elDeadline) {
            const dateFormatted = deadline.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
            elDeadline.textContent = `Jueves ${dateFormatted} a las 17:00h`;
        }

        if (this.countdownInterval) clearInterval(this.countdownInterval);

        const updateTimer = () => {
            const now = new Date().getTime();
            const diff = deadline.getTime() - now;

            const elD = document.getElementById('cd-days');
            const elH = document.getElementById('cd-hours');
            const elM = document.getElementById('cd-mins');
            const elS = document.getElementById('cd-secs');
            const elBadge = document.getElementById('cd-status-badge');

            if (diff <= 0) {
                if (elD) elD.textContent = '00';
                if (elH) elH.textContent = '00';
                if (elM) elM.textContent = '00';
                if (elS) elS.textContent = '00';
                if (elBadge) {
                    elBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1';
                    elBadge.innerHTML = '<span>⚠️</span><span>Plazo Cerrado</span>';
                }
                clearInterval(this.countdownInterval);
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            if (elD) elD.textContent = String(days).padStart(2, '0');
            if (elH) elH.textContent = String(hours).padStart(2, '0');
            if (elM) elM.textContent = String(mins).padStart(2, '0');
            if (elS) elS.textContent = String(secs).padStart(2, '0');

            if (elBadge) {
                if (diff < 1000 * 60 * 60 * 3) { // Menos de 3 horas
                    elBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse';
                    elBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span><span>¡Cierre Inminente!</span>';
                } else if (diff < 1000 * 60 * 60 * 24) { // Menos de 24 horas
                    elBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1';
                    elBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>Últimas 24 horas</span>';
                } else {
                    elBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1';
                    elBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>Plazo Abierto</span>';
                }
            }
        };

        updateTimer();
        this.countdownInterval = setInterval(updateTimer, 1000);
    }

    /**
     * Progreso de quinielas enviadas esta semana
     */
    renderSubmissionProgress(nextJ, pronosticosMap) {
        if (!nextJ) return;

        const nextJId = String(nextJ.id);
        const total = this.members.length || 19;

        this.submittedMembers = [];
        this.pendingMembers = [];

        this.members.forEach(m => {
            const p = pronosticosMap.get(`${nextJId}_${m.id}`);
            const hasSubmitted = p && p.forecast && p.forecast.length > 0;
            const name = window.AppUtils ? window.AppUtils.getMemberName(m) : (m.phone || m.name);

            if (hasSubmitted) {
                this.submittedMembers.push(name);
            } else {
                this.pendingMembers.push(name);
            }
        });

        const submittedCount = this.submittedMembers.length;
        const pct = Math.round((submittedCount / total) * 100);

        const elSubCount = document.getElementById('submitted-count');
        const elTotCount = document.getElementById('total-members-count');
        const elPct = document.getElementById('submitted-percentage');
        const elBar = document.getElementById('submitted-progress-bar');

        if (elSubCount) elSubCount.textContent = submittedCount;
        if (elTotCount) elTotCount.textContent = total;
        if (elPct) elPct.textContent = `${pct}%`;
        if (elBar) elBar.style.width = `${pct}%`;

        // Comprobar estado del usuario logueado
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const elBadge = document.getElementById('my-forecast-badge');

        if (elBadge && user) {
            const pUser = pronosticosMap.get(`${nextJId}_${user.id}`);
            const hasSubmitted = pUser && pUser.forecast && pUser.forecast.length > 0;
            if (hasSubmitted) {
                elBadge.textContent = '✅ Ya la has enviado';
                elBadge.className = 'text-emerald-400 font-bold';
            } else {
                elBadge.textContent = '⏳ Aún no la has enviado';
                elBadge.className = 'text-amber-400 font-bold';
            }
        }
    }

    /**
     * Modal para ver quién ha enviado y quién falta
     */
    openSubmittedListModal() {
        const modal = document.getElementById('modal-pending-members');
        const sentList = document.getElementById('modal-sent-list');
        const pendingList = document.getElementById('modal-pending-list');
        const sentCount = document.getElementById('modal-sent-count');
        const pendingCount = document.getElementById('modal-pending-count');

        if (!modal) return;

        if (sentCount) sentCount.textContent = this.submittedMembers.length;
        if (pendingCount) pendingCount.textContent = this.pendingMembers.length;

        if (sentList) {
            if (this.submittedMembers.length === 0) {
                sentList.innerHTML = '<span class="text-slate-500 italic">Ningún socio ha enviado aún</span>';
            } else {
                sentList.innerHTML = this.submittedMembers.map(name => `
                    <span class="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                        ✅ ${name}
                    </span>
                `).join('');
            }
        }

        if (pendingList) {
            if (this.pendingMembers.length === 0) {
                pendingList.innerHTML = '<span class="text-emerald-400 font-bold">¡Pleno! Todos los socios han enviado</span>';
            } else {
                pendingList.innerHTML = this.pendingMembers.map(name => `
                    <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-medium">
                        ⏳ ${name}
                    </span>
                `).join('');
            }
        }

        modal.classList.remove('hidden');
    }

    /**
     * Widget PIG (Pleno al 15)
     */
    renderPigWidget(outcome, nextJ) {
        const content = document.getElementById('pig-content');
        const badgeFoot = document.getElementById('pig-badge-foot');
        if (!content) return;

        // Comprobar si la próxima jornada tiene partido PIG (Atleti en P15)
        const nextHasPig = nextJ && nextJ.matches && nextJ.matches.some(m => m && window.AppUtils && window.AppUtils.isPigMatch(m.home, m.away));

        if (nextHasPig) {
            content.innerHTML = `
                <div class="text-pink-400 font-bold text-xs flex items-center gap-1.5">
                    <span>🐷</span> ¡Próxima jornada con PIG!
                </div>
                <div class="text-[11px] text-slate-300 mt-0.5">
                    El Atleti juega en el Pleno al 15. Acertar el resultado exacto libra del rol de Maula.
                </div>
            `;
            if (badgeFoot) badgeFoot.textContent = 'PIG Activo Próxima J.';
        } else if (outcome.isPig) {
            const acertantes = outcome.pigAcertantes || [];
            content.innerHTML = `
                <div class="text-xs">
                    <span class="text-emerald-400 font-bold">✅ Acertaron:</span> ${acertantes.length > 0 ? acertantes.join(', ') : 'Ninguno'}
                </div>
            `;
            if (badgeFoot) badgeFoot.textContent = 'Jornada anterior con PIG';
        } else {
            content.innerHTML = `
                <div class="text-xs text-slate-400">
                    No hubo partido del Atleti en el P15 en la última jornada.
                </div>
            `;
            if (badgeFoot) badgeFoot.textContent = 'Inmunidad Maula';
        }
    }

    /**
     * Widget Bote en caja
     */
    renderBoteWidget(playedJornadas) {
        const elTotal = document.getElementById('dashboard-bote-total');
        const elNeto = document.getElementById('dashboard-bote-neto');
        const elPremios = document.getElementById('dashboard-bote-premios');

        const BOTE_INICIAL = 46.50; // Fondo base temporada
        let saldoNetoAcumulado = 0;
        let premiosTotales = 0;

        playedJornadas.forEach(j => {
            const cuotasRecaudadas = (j.numSocios || 19) * 1.50;
            const gastoSellado = j.gastoSellado || (j.numSocios ? (j.numSocios * 0.75) : 14.25);
            const neto = cuotasRecaudadas - gastoSellado;
            saldoNetoAcumulado += neto;

            if (j.prizesTotal) premiosTotales += parseFloat(j.prizesTotal);
        });

        const totalCaja = BOTE_INICIAL + saldoNetoAcumulado + premiosTotales;

        if (elTotal) elTotal.textContent = `${totalCaja.toFixed(2)} €`;
        if (elNeto) elNeto.textContent = `${saldoNetoAcumulado >= 0 ? '+' : ''}${saldoNetoAcumulado.toFixed(2)} €`;
        if (elPremios) elPremios.textContent = `${premiosTotales.toFixed(2)} €`;
    }

    /**
     * Widget de Premios de la semana y temporada
     */
    renderPrizesWidget(outcome, totalSeasonMoney, indivCount, doblesCount, playedJornadas) {
        const elWeeklyTotal = document.getElementById('weekly-prize-total');
        const elWeeklyList = document.getElementById('weekly-prizes-list');
        const elSeasonTotal = document.getElementById('season-prize-total');
        const elIndivCount = document.getElementById('season-indiv-count');
        const elDoblesCount = document.getElementById('season-dobles-count');

        if (elWeeklyTotal) elWeeklyTotal.textContent = `${(outcome.totalMoney || 0).toFixed(2)} €`;
        if (elSeasonTotal) elSeasonTotal.textContent = `${totalSeasonMoney.toFixed(2)} €`;
        if (elIndivCount) elIndivCount.textContent = indivCount;
        if (elDoblesCount) elDoblesCount.textContent = doblesCount;

        if (elWeeklyList) {
            const indivs = (outcome.prizeWinners || []).map(pw => `
                <div class="flex items-center justify-between py-0.5 border-b border-slate-900">
                    <span class="text-slate-200 font-semibold">${pw.name}</span>
                    <span class="text-emerald-400 font-mono font-bold">${pw.hits} aciertos</span>
                </div>
            `);

            const dobles = (outcome.doublesResults || []).filter(dr => dr.prize > 0).map(dw => `
                <div class="flex items-center justify-between py-0.5 border-b border-slate-900 text-purple-300">
                    <span>👑 Dobles (${dw.name})</span>
                    <span class="font-mono font-bold">${dw.hits} ac. (${dw.prize.toFixed(2)}€)</span>
                </div>
            `);

            const all = [...indivs, ...dobles];
            if (all.length > 0) {
                elWeeklyList.innerHTML = all.join('');
            } else {
                elWeeklyList.innerHTML = `<span class="text-slate-500 italic">No hubo pronósticos con premio oficial (+${outcome.minHitsToWin || 10} ac.).</span>`;
            }
        }
    }

    /**
     * Broma oficial: Expulsar a Emilio
     */
    async handlePrankDisplay() {
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (!user) return;

        const prankContainer = document.getElementById('prank-container');
        if (!prankContainer) return;

        // Emilio no ve el botón de autoexpulsarse
        if ((user.email || '').toLowerCase() === 'emilio@maulas.com') {
            prankContainer.style.display = 'none';
            return;
        }

        prankContainer.style.display = 'flex';

        // Comprobar si falta menos de 1 hora para el cierre
        let canExpel = true;
        if (this.nextJornada && this.nextJornada.date) {
            const matchDate = window.AppUtils ? window.AppUtils.parseDate(this.nextJornada.date) : new Date(this.nextJornada.date);
            if (matchDate) {
                const deadline = window.AppUtils ? window.AppUtils.calculateDeadline(matchDate) : new Date(matchDate.getTime() - 3 * 24 * 3600 * 1000);
                const diffMs = deadline.getTime() - new Date().getTime();
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours > 0 && diffHours <= 1) {
                    canExpel = false;
                }
            }
        }

        const btn = document.getElementById('btn-expulsar-emilio');
        const cooldownMsg = document.getElementById('prank-cooldown-msg');

        if (!canExpel) {
            if (btn) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            if (cooldownMsg) cooldownMsg.classList.remove('hidden');
        }
    }

    async executePrank() {
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const userName = user ? (window.AppUtils ? window.AppUtils.getMemberName(user) : user.name) : 'Fernando Lozano';

        if (!confirm(`¿Confirmas la expulsión temporal de Emilio de la web durante 15 minutos?`)) return;

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
            await window.DataService.logAction(userName, `Expulsó a Emilio de la web por ${durationMin} minutos`);

            // Notificación a Telegram
            if (window.TelegramService) {
                const tgCfg = config.find(c => c.id === 'telegram');
                if (tgCfg && tgCfg.token && tgCfg.chatId) {
                    const text = (prankCfg.message || 'Nombre ha expulsado a Emilio de la web.').replace('Nombre', userName);
                    await window.TelegramService.sendRaw(tgCfg.token, tgCfg.chatId, '🚩 ' + text);
                }
            }

            alert('🚩 ¡Emilio ha sido expulsado de la web temporalmente!');
            location.reload();
        } catch (e) {
            console.error('[Dashboard 2.0] Error ejecutando expulsión:', e);
            alert('Error al ejecutar la acción: ' + e.message);
        }
    }

    /**
     * Calcula ganador, perdedor (Maula), dobles y premios de una jornada
     */
    calculateJornadaOutcome(jornada, results, memberStats, history) {
        if (!results || results.length === 0) return { winnerName: '-', loserName: '-', doblesEligibleNames: [] };

        // 1. Ganador por máxima puntuación
        const maxPoints = Math.max(...results.map(r => r.points));
        let winnerCandidates = results.filter(r => r.points === maxPoints);

        if (winnerCandidates.length > 1) {
            winnerCandidates = this.resolveTie(winnerCandidates, history, 'points', 'max');
        }
        winnerCandidates.sort((a, b) => a.memberId - b.memberId);
        const winner = memberStats[winnerCandidates[0].memberId] || { name: '-' };

        // 2. Perdedor (El Maula)
        let maulaCandidates = [];
        const prizeThreshold = jornada.minHitsToWin || 10;
        const offenders = results.filter(r => !r.hasPronostico || (r.isLate && !r.isPardoned && r.hits < prizeThreshold));

        if (offenders.length > 0) {
            maulaCandidates = offenders;
        } else {
            const minPoints = Math.min(...results.map(r => r.points));
            maulaCandidates = results.filter(r => r.points === minPoints);
        }

        if (maulaCandidates.length > 1) {
            maulaCandidates = this.resolveTie(maulaCandidates, history, 'points', 'min');
        }
        maulaCandidates.sort((a, b) => b.memberId - a.memberId);
        const loser = maulaCandidates[0] ? (memberStats[maulaCandidates[0].memberId] || { name: '-' }) : { name: '-' };

        // 3. PIG Stats
        const isPig = results.some(r => r.isPig15);
        let pigAcertantes = [];
        let pigFallantes = [];
        if (isPig) {
            pigAcertantes = results.filter(r => r.pigHit).map(r => r.name);
            pigFallantes = results.filter(r => !r.pigHit && r.hasPronostico).map(r => r.name);
        }

        // 4. Doubles
        const doublesResults = [];
        const doublesForecasts = this.pronosticosExtra.filter(p => p.jId === jornada.id || p.jornadaId === jornada.id);
        if (doublesForecasts.length > 0 && jornada.matches) {
            const officialResults = jornada.matches.map(m => m.result);
            doublesForecasts.forEach(df => {
                const mId = df.mId || df.memberId;
                const member = memberStats[mId];
                if (!member) return;

                const selection = df.selection || df.forecast || [];
                const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
                const isReduced = df.isReduced || (doubleCount === 7);
                const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);
                const ev = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced }) : null;
                const prizesMap = jornada.prizes || jornada.prizeRates || {};

                let prizeVal = 0;
                let actualHits = 0;

                if (ev && ev.breakdown) {
                    actualHits = ev.hits || 0;
                    Object.keys(ev.breakdown).forEach(h => {
                        const count = ev.breakdown[h];
                        let pVal = prizesMap[h] || prizesMap[String(h)] || 0;
                        if (typeof pVal === 'string') pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                        if (count > 0 && pVal > 0) prizeVal += count * parseFloat(pVal);
                    });
                }
                doublesResults.push({ name: member.name, hits: actualHits, prize: prizeVal });
            });
        }

        // 5. Premios individuales
        const minHitsToWin = jornada.minHitsToWin || 10;
        const prizeWinners = results.filter(r => {
            if (!r.hasPronostico) return false;
            const prizesMap = jornada.prizes || jornada.prizeRates || {};
            let val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;
            if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());
            return val > 0;
        }).sort((a, b) => b.hits - a.hits).map(r => ({ name: r.name, hits: r.hits }));

        // 6. Elegibles para siguientes dobles (Ganador + cualquiera con premio > 0)
        const eligibleNextNames = results.filter(r => {
            const isWinner = r.memberId === winnerCandidates[0].memberId;
            const prizesMap = jornada.prizes || jornada.prizeRates || {};
            let val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;
            if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());
            return isWinner || (val > 0 && r.hasPronostico);
        }).map(r => r.name);

        const prizeMoney = prizeWinners.reduce((sum, pw) => {
            const prizesMap = jornada.prizes || jornada.prizeRates || {};
            let val = prizesMap[pw.hits] || prizesMap[String(pw.hits)] || 0;
            if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());
            return sum + (val || 0);
        }, 0);
        const doublesMoney = doublesResults.reduce((sum, dr) => sum + (dr.prize || 0), 0);

        return {
            winnerName: winner.name,
            doblesEligibleNames: [...new Set(eligibleNextNames)].sort(),
            loserName: loser.name,
            isPig: isPig,
            pigAcertantes: pigAcertantes,
            pigFallantes: pigFallantes,
            doublesResults: doublesResults,
            prizeWinners: prizeWinners,
            minHitsToWin: minHitsToWin,
            totalMoney: prizeMoney + doublesMoney
        };
    }

    resolveTie(candidates, history, metric, goal) {
        const sampleId = candidates[0].memberId;
        const historyLen = history[sampleId] ? history[sampleId].length : 0;
        let index = historyLen - 2;
        let currentCandidates = [...candidates];

        while (currentCandidates.length > 1 && index >= 0) {
            const values = currentCandidates.map(c => {
                const hist = history[c.memberId] ? history[c.memberId][index] : null;
                return {
                    id: c.memberId,
                    val: hist ? (metric === 'hits' ? hist.hits : hist.points) : 0
                };
            });

            const target = (goal === 'max')
                ? Math.max(...values.map(v => v.val))
                : Math.min(...values.map(v => v.val));

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
                const d = window.AppUtils ? window.AppUtils.parseDate(j.date) : new Date(j.date);
                return d && (window.AppUtils ? window.AppUtils.isSunday(d) : true);
            })
            .sort((a, b) => a.number - b.number)
            .find(j => {
                const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
                return filled < 15;
            });
    }

    /**
     * Listeners de interfaz
     */
    initUiListeners() {
        // Cierre de dropdown al hacer clic fuera
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('nav-section-dropdown');
            const wrap = document.getElementById('nav-section-dropdown-wrap');
            if (dropdown && wrap && !wrap.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }
}

// Instanciación automática
document.addEventListener('DOMContentLoaded', () => {
    window.DashboardApp = new Dashboard2AppController();
});
