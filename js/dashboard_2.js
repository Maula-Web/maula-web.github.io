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
        this.pigPenalty = 1.00;

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

            // Cargar configuración de Bote para obtener penalización PIG codificada
            try {
                let boteConfig = null;
                if (window.DataService) {
                    boteConfig = await window.DataService.getDoc('config', 'bote_config');
                }
                if (!boteConfig) {
                    const local = localStorage.getItem('bote_config');
                    if (local) {
                        try { boteConfig = JSON.parse(local); } catch (e) { }
                    }
                }
                if (boteConfig && boteConfig.penalizacionPIG !== undefined) {
                    this.pigPenalty = parseFloat(boteConfig.penalizacionPIG) || 1.00;
                }
            } catch (errCfg) {
                this.pigPenalty = 1.00;
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
                const pigInfo = this.findPigMatch(jornada);

                this.members.forEach(member => {
                    const mIdStr = String(member.id);
                    const jIdStr = String(jornada.id);
                    const p = pronosticosMap.get(`${jIdStr}_${mIdStr}`);

                    let hits = -1;
                    let points = 0;
                    let isLate = false;
                    let isPardoned = false;
                    let hasPronostico = false;
                    let isPig = pigInfo !== null;
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
                            potentialHits = ev.potentialHits;

                            if (pigInfo && jornada.matches && jornada.matches[pigInfo.index]) {
                                isPig = true;
                                const pred = p.forecast && p.forecast[pigInfo.index] ? String(p.forecast[pigInfo.index]).trim().toUpperCase() : '';
                                const pigM = jornada.matches[pigInfo.index];
                                const res = pigM ? String(pigM.result || '').trim().toUpperCase() : '';
                                const normRes = window.ScoringSystem ? window.ScoringSystem.normalizeSign(res) : res;
                                pigHit = !!pred && (pred === normRes || pred === res);
                            } else if (ev.isPig15) {
                                isPig = true;
                                pigHit = ev.pigHit;
                            }
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
                        isPig: isPig,
                        isPig15: isPig,
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
                const doublesForecasts = this.pronosticosExtra.filter(p => {
                    const pJ = String(p.jId !== undefined && p.jId !== null ? p.jId : (p.jornadaId || ''));
                    return pJ === String(jornada.id) || pJ === String(jornada.number);
                });
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
                        } else if (ev) {
                            const cat = ev.officialHits !== undefined ? ev.officialHits : ev.hits;
                            let actualMinHits = jornada.minHitsToWin || 10;
                            if (prizesMap && Object.keys(prizesMap).length > 0) {
                                actualMinHits = Math.min(...Object.keys(prizesMap).map(Number));
                            }
                            if (cat >= actualMinHits) {
                                let pVal = prizesMap[cat] || prizesMap[String(cat)] || 0;
                                if (typeof pVal === 'string') {
                                    pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                                }
                                if (pVal > 0) {
                                    extraPrizeAmount += parseFloat(pVal);
                                    hasPrize = true;
                                }
                            }
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
                    pigAcertantes: [],
                    pigFallantes: [],
                    prizeWinners: [],
                    totalMoney: 0,
                    minHitsToWin: 10
                };
            }

            // 4. Determinar Líder de la General y Último Clasificado (Rana)
            let leader = { name: '-', totalPoints: 0, totalHits: 0 };
            let secondLeaderPoints = 0;
            let lastMember = { name: '-', totalPoints: 0, totalHits: 0 };
            let penultimateDiff = 0;
            const sortedMembers = Object.values(memberStats).sort((a, b) => b.totalPoints - a.totalPoints || b.totalHits - a.totalHits);
            if (sortedMembers.length > 0) {
                leader = sortedMembers[0];
                if (sortedMembers.length > 1) {
                    secondLeaderPoints = sortedMembers[1].totalPoints;
                }
                lastMember = sortedMembers[sortedMembers.length - 1];
                if (sortedMembers.length > 1) {
                    const penultimate = sortedMembers[sortedMembers.length - 2];
                    penultimateDiff = Math.max(0, penultimate.totalPoints - lastMember.totalPoints);
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
                elWinnerDetail.textContent = eligibles.length > 1 ? `Dobles: ${eligibles.join(', ')}` : 'Rellena la columna de signos dobles';
            }

            // E. Widget 4: ✍️ SELLA: (Sellador Designado)
            const elLoserName = document.getElementById('role-loser-name');
            const elLoserDetail = document.getElementById('role-loser-detail');
            if (elLoserName) elLoserName.textContent = lastJornadaOutcome.loserName || 'Pendiente';
            if (elLoserDetail) elLoserDetail.textContent = 'Responsable de validar y sellar el boleto colectivo';

            // F. Widget 5: 🏆 Líder de la General
            const elLeaderName = document.getElementById('leader-name');
            const elLeaderPoints = document.getElementById('leader-points');
            const elLeaderDiff = document.getElementById('leader-diff');
            const elLeaderJornadas = document.getElementById('leader-jornadas-count');
            if (elLeaderName) elLeaderName.textContent = leader.name || '-';
            if (elLeaderPoints) elLeaderPoints.textContent = `${leader.totalPoints || 0} pts`;
            if (elLeaderDiff) {
                const diff = (leader.totalPoints || 0) - secondLeaderPoints;
                elLeaderDiff.textContent = `(Ventaja: +${diff} pts)`;
            }
            if (elLeaderJornadas) {
                elLeaderJornadas.textContent = `${playedCount} jornadas disputadas`;
            }

            // G. Widget 6: 🐸 Último Clasificado (Rana) / 🐷 Partido PIG (Tarjeta Híbrida)
            this.renderPigWidget(lastJornadaOutcome, this.nextJornada, lastMember, penultimateDiff, playedCount, sortedMembers.length);

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
            if (sub) sub.textContent = 'Plazo para tener todas las quinielas rellenas en la web: Jueves a las 17:00h.';
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
     * Widget Híbrido Rotativo: 🐸 Último Clasificado (Rana) / 🐷 Partido PIG
     */
    renderPigWidget(outcome, nextJ, lastMember, penultimateDiff, playedCount, totalMembers) {
        const content = document.getElementById('pig-content');
        const statusLabel = document.getElementById('pig-status-label');
        const elBadge = document.getElementById('pig-badge');
        const elBadgeIcon = document.getElementById('pig-badge-icon');
        const elBadgeText = document.getElementById('pig-badge-text');
        const elTipTitle = document.getElementById('pig-tip-title');
        const elTipContent = document.getElementById('pig-tip-content');
        const footLeft = document.getElementById('pig-foot-left');
        const footRight = document.getElementById('pig-foot-right');
        if (!content) return;

        const penaltyVal = (this.pigPenalty !== undefined ? this.pigPenalty : 1.00).toFixed(2);
        const nextPigInfo = this.findPigMatch(nextJ);
        const nextHasPig = nextPigInfo !== null;
        const nextMatchDesc = (nextPigInfo && nextPigInfo.match) ? `(P.${nextPigInfo.index + 1}: ${nextPigInfo.match.home} vs ${nextPigInfo.match.away})` : '';

        // Determinar si en la última jornada disputada hubo PIG
        const isPigMode = !!(outcome && outcome.isPig);
        this.currentPigOrRanaMode = isPigMode ? 'pig' : 'rana';

        if (isPigMode) {
            // =================================================================
            // MODO PIG: Hubo enfrentamiento entre los tres grandes en la última J.
            // =================================================================
            if (elBadge) elBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/40 flex items-center gap-1';
            if (elBadgeIcon) elBadgeIcon.textContent = '🐷';
            if (elBadgeText) elBadgeText.textContent = 'Alerta PIG';

            if (elTipTitle) {
                elTipTitle.className = 'text-pink-400 block mb-1 font-bold flex items-center gap-1.5';
                elTipTitle.innerHTML = '<span>🐷</span> Partido de Interés General (PIG)';
            }
            if (elTipContent) {
                elTipContent.innerHTML = `
                    <p class="text-amber-200">Enfrentamiento entre dos de los tres grandes clubes (Real Madrid, Barcelona o Atlético de Madrid), en cualquier casilla del boleto (partidos 1 al 15).</p>
                    <p><strong class="text-emerald-400">✅ Acertantes:</strong> exentos de penalización.</p>
                    <p><strong class="text-rose-400">❌ Perdedores:</strong> penalización codificada en los parámetros del Bote 2 (${penaltyVal} €) que ingresa en la caja común.</p>
                `;
            }

            if (statusLabel) {
                statusLabel.className = 'text-xs text-amber-400 block font-bold';
                statusLabel.textContent = 'Resultados del PIG de la última jornada:';
            }

            const acertantes = outcome.pigAcertantes || [];
            const perdedores = outcome.pigFallantes || [];
            const matchDesc = outcome.pigInfo && outcome.pigInfo.match ? `Partido ${outcome.pigInfo.index + 1}: ${outcome.pigInfo.match.home} vs ${outcome.pigInfo.match.away}` : '';

            content.innerHTML = `
                <div class="space-y-1.5 text-xs">
                    ${matchDesc ? `<div class="text-[11px] text-pink-300 font-semibold mb-1">⚽ ${matchDesc}</div>` : ''}
                    <div>
                        <span class="text-emerald-400 font-bold">✅ Acertantes:</span>
                        <span class="text-slate-200 ml-1">${acertantes.length > 0 ? acertantes.join(', ') : '<em class="text-slate-500">Ninguno</em>'}</span>
                    </div>
                    <div>
                        <span class="text-rose-400 font-bold">❌ Perdedores:</span>
                        <span class="text-slate-300 ml-1">${perdedores.length > 0 ? perdedores.join(', ') : '<em class="text-slate-500">Ninguno</em>'}</span>
                    </div>
                    <div class="text-[11px] text-amber-300/90 pt-1.5 border-t border-slate-800 flex items-center justify-between">
                        <span>Penalización Bote 2:</span>
                        <span class="font-mono font-bold text-rose-400">-${penaltyVal} € / socio</span>
                    </div>
                </div>
            `;

            if (footLeft) {
                footLeft.className = 'text-slate-500';
                footLeft.textContent = 'Normativa Bote 2';
            }
            if (footRight) {
                footRight.innerHTML = `<span class="text-amber-400 font-bold font-mono">Penalización: ${penaltyVal} €</span>`;
            }
        } else {
            // =================================================================
            // MODO RANA: No hubo PIG en la última jornada -> Mostrar Último Clasificado
            // =================================================================
            if (elBadge) elBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1';
            if (elBadgeIcon) elBadgeIcon.textContent = '🐸';
            if (elBadgeText) elBadgeText.textContent = 'Último Clasificado';

            if (elTipTitle) {
                elTipTitle.className = 'text-emerald-400 block mb-1 font-bold flex items-center gap-1.5';
                elTipTitle.innerHTML = '<span>🐸</span> Último Clasificado (Rana)';
            }
            if (elTipContent) {
                elTipContent.innerHTML = `
                    <p>Socio en la última posición de la clasificación general acumulada (Farolillo Rojo).</p>
                    <p class="text-slate-400">Esta tarjeta rota automáticamente: en semanas con PIG muestra los resultados y penalizaciones, y en semanas sin PIG muestra al colista con la Rana 🐸.</p>
                `;
            }

            if (statusLabel) {
                statusLabel.className = 'text-xs text-slate-400 block font-medium';
                statusLabel.textContent = totalMembers ? `${totalMembers}º Clasificado (Farolillo Rojo):` : 'Último Clasificado:';
            }

            const memberName = lastMember ? lastMember.name : 'Pendiente';
            const memberPts = lastMember ? lastMember.totalPoints : 0;
            const diffText = penultimateDiff !== undefined ? `(A -${penultimateDiff} pts del penúltimo)` : '';

            content.innerHTML = `
                <div class="space-y-1">
                    <h4 class="text-xl sm:text-2xl font-black text-rose-400 tracking-tight truncate flex items-center gap-2">
                        <span>${memberName}</span>
                        <span class="text-lg" title="Rana de la Peña">🐸</span>
                    </h4>
                    <div class="flex items-baseline gap-2 pt-0.5">
                        <span class="font-mono text-base font-extrabold text-amber-400">${memberPts} pts</span>
                        <span class="text-xs text-slate-400 font-medium">${diffText}</span>
                    </div>
                    ${nextHasPig ? `
                        <div class="mt-2 p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-300 text-[10px] flex items-center gap-1.5 font-medium">
                            <span class="shrink-0">🐷</span>
                            <span class="truncate">¡Próxima J. con PIG! ${nextMatchDesc}</span>
                        </div>
                    ` : ''}
                </div>
            `;

            if (footLeft) {
                footLeft.className = 'text-slate-400 font-semibold';
                footLeft.textContent = `${playedCount || 0} jornadas disputadas`;
            }
            if (footRight) {
                footRight.innerHTML = `<a href="resultados.html" class="text-amber-400 font-bold hover:underline">Ver Tabla Completa →</a>`;
            }
        }
    }

    /**
     * Widget Bote en caja - Sincronizado al 100% con los cálculos oficiales consolidados de Bote 2
     */
    renderBoteWidget(playedJornadas) {
        const elTotal = document.getElementById('dashboard-bote-total');
        const elNeto = document.getElementById('dashboard-bote-neto');
        const elPremios = document.getElementById('dashboard-bote-premios');

        let cajaReal = 0;
        let totalSaldos = 0;
        let superavit = 0;

        // 1. Obtener los datos oficiales consolidados de Bote 2
        let summary = null;
        if (window.BoteApp && typeof window.BoteApp.getSeasonData === 'function') {
            const sd = window.BoteApp.getSeasonData();
            if (sd && sd.summary) {
                summary = sd.summary;
            }
        }

        if (!summary && window.BOTE_FALLBACK_DATA && window.BOTE_FALLBACK_DATA['2026-2027'] && window.BOTE_FALLBACK_DATA['2026-2027'].summary) {
            summary = window.BOTE_FALLBACK_DATA['2026-2027'].summary;
        }

        if (summary) {
            cajaReal = typeof summary.cajaReal === 'number' ? summary.cajaReal : parseFloat(summary.cajaReal || 0);
            totalSaldos = typeof summary.totalSaldosVirtuales === 'number' ? summary.totalSaldosVirtuales : parseFloat(summary.totalSaldosVirtuales || 0);
            superavit = cajaReal - totalSaldos;
        } else if (playedJornadas && playedJornadas.length > 0) {
            // Fallback en caso extremo si aún no estuvieran disponibles los datos de Bote 2
            cajaReal = 808.18;
            totalSaldos = 703.46;
            superavit = 104.72;
        }

        if (elTotal) elTotal.textContent = `${cajaReal.toFixed(2)} €`;
        if (elNeto) elNeto.textContent = `${totalSaldos.toFixed(2)} €`;
        if (elPremios) elPremios.textContent = `${superavit >= 0 ? '+' : ''}${superavit.toFixed(2)} €`;
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
                    <span class="text-emerald-400 font-mono font-bold">${pw.hits} aciertos ${pw.prize ? `(+${pw.prize.toFixed(2)} €)` : ''}</span>
                </div>
            `);

            const dobles = (outcome.doublesResults || []).filter(dr => dr.prize > 0).map(dw => `
                <div class="flex items-center justify-between py-0.5 border-b border-slate-900 text-amber-300">
                    <span class="font-semibold">👑 Dobles (${dw.name})</span>
                    <span class="font-mono font-bold text-emerald-400">${dw.hits} ac. (+${dw.prize.toFixed(2)} €)</span>
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
        const pigInfo = this.findPigMatch(jornada);
        const isPig = pigInfo !== null || results.some(r => r.isPig || r.isPig15);
        let pigAcertantes = [];
        let pigFallantes = [];
        if (isPig) {
            pigAcertantes = results.filter(r => r.pigHit).map(r => r.name);
            pigFallantes = results.filter(r => !r.pigHit).map(r => r.name);
        }

        // 4. Doubles
        const doublesResults = [];
        const doublesForecasts = this.pronosticosExtra.filter(p => {
            const pJ = String(p.jId !== undefined && p.jId !== null ? p.jId : (p.jornadaId || ''));
            return pJ === String(jornada.id) || pJ === String(jornada.number);
        });
        if (doublesForecasts.length > 0 && jornada.matches) {
            const officialResults = jornada.matches.map(m => m.result);
            doublesForecasts.forEach(df => {
                const mId = df.mId !== undefined && df.mId !== null ? df.mId : df.memberId;
                const member = memberStats[mId] || memberStats[Number(mId)] || (this.members || []).find(m => String(m.id) === String(mId));
                const memberName = member ? (member.name || member.fullName || (window.AppUtils ? window.AppUtils.getMemberName(member) : 'Socio')) : 'Socio';

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
                } else if (ev) {
                    actualHits = ev.hits || 0;
                    const cat = ev.officialHits !== undefined ? ev.officialHits : ev.hits;
                    let actualMinHits = jornada.minHitsToWin || 10;
                    if (prizesMap && Object.keys(prizesMap).length > 0) {
                        actualMinHits = Math.min(...Object.keys(prizesMap).map(Number));
                    }
                    if (cat >= actualMinHits) {
                        let pVal = prizesMap[cat] || prizesMap[String(cat)] || 0;
                        if (typeof pVal === 'string') pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                        if (pVal > 0) prizeVal += parseFloat(pVal);
                    }
                }
                doublesResults.push({ name: memberName, hits: actualHits, prize: prizeVal });
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
        }).sort((a, b) => b.hits - a.hits).map(r => {
            const prizesMap = jornada.prizes || jornada.prizeRates || {};
            let val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;
            if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());
            return { name: r.name, hits: r.hits, prize: val || 0 };
        });

        // 6. Elegibles para siguientes dobles (Ganador + cualquiera con premio > 0)
        const eligibleNextNames = results.filter(r => {
            const isWinner = r.memberId === winnerCandidates[0].memberId;
            const prizesMap = jornada.prizes || jornada.prizeRates || {};
            let val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;
            if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());
            return isWinner || (val > 0 && r.hasPronostico);
        }).map(r => r.name);

        const prizeMoney = prizeWinners.reduce((sum, pw) => sum + (pw.prize || 0), 0);
        const doublesMoney = doublesResults.reduce((sum, dr) => sum + (dr.prize || 0), 0);

        return {
            winnerName: winner.name,
            doblesEligibleNames: [...new Set(eligibleNextNames)].sort(),
            loserName: loser.name,
            isPig: isPig,
            pigInfo: pigInfo,
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

    /**
     * Localiza el partido PIG (Partido de Interés General) en una jornada (en cualquiera de las 15 casillas)
     */
    findPigMatch(jornada) {
        if (!jornada || !jornada.matches || !Array.isArray(jornada.matches)) return null;
        if (jornada.pigMatchIndex !== undefined && jornada.pigMatchIndex >= 0 && jornada.pigMatchIndex < jornada.matches.length) {
            const m = jornada.matches[jornada.pigMatchIndex];
            if (m && window.AppUtils && !window.AppUtils.isFemaleTeam(m.home) && !window.AppUtils.isFemaleTeam(m.away)) {
                return { index: jornada.pigMatchIndex, match: m };
            }
        }
        for (let i = 0; i < Math.min(jornada.matches.length, 15); i++) {
            const m = jornada.matches[i];
            if (m && window.AppUtils && window.AppUtils.isPigMatch(m.home, m.away)) {
                return { index: i, match: m };
            }
        }
        return null;
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
     * Manejador de información para la tarjeta híbrida rotativa (PIG vs Rana)
     */
    showPigOrRanaInfo() {
        const mode = this.currentPigOrRanaMode || 'rana';
        this.showInfo(mode);
    }

    /**
     * Modal explicativo en primer plano para tarjetas del Dashboard
     */
    showInfo(type) {
        const modal = document.getElementById('modal-info-card');
        const iconEl = document.getElementById('modal-info-icon');
        const titleEl = document.getElementById('modal-info-title');
        const tagEl = document.getElementById('modal-info-tag');
        const bodyEl = document.getElementById('modal-info-body');

        if (!modal || !bodyEl) return;

        const penaltyVal = (this.pigPenalty !== undefined ? this.pigPenalty : 1.00).toFixed(2);

        const infoMap = {
            rana: {
                icon: '🐸',
                tag: 'Clasificación General',
                title: 'Último Clasificado (La Rana 🐸)',
                body: `
                    <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm font-semibold leading-relaxed flex items-start gap-2.5">
                        <span class="text-2xl shrink-0">🐸</span>
                        <div>
                            El socio que ocupa la última posición de la clasificación general acumulada recibe el distintivo de la Rana (Farolillo Rojo).
                        </div>
                    </div>
                    <div class="space-y-2 text-xs text-slate-300 pt-2">
                        <p>
                            • <strong>Tarjeta Híbrida Rotativa:</strong> Esta tarjeta rota inteligentemente según la actualidad de la peña. Las semanas donde la jornada anterior hubo un Partido de Interés General (PIG), se muestran los resultados del PIG, los acertantes y quiénes deben pagar la penalización. En las semanas sin PIG, se muestra al último clasificado de la general con la Rana 🐸.
                        </p>
                        <p>
                            • La clasificación general se actualiza automáticamente tras cada jornada sumando los puntos oficiales de todos los socios.
                        </p>
                    </div>
                `
            },
            dobles: {
                icon: '👑',
                tag: 'Reglamento de Dobles',
                title: 'Rellena Dobles',
                body: `
                    <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm font-semibold leading-relaxed">
                        El socio que consiguió la mayor puntuación en la última jornada, tiene el privilegio de rellenar la columna de dobles.
                    </div>
                    <div class="space-y-2 text-xs text-slate-300 pt-1">
                        <p>
                            • El ganador selecciona los <strong>signos dobles</strong> de la combinación oficial de la peña para la siguiente jornada.
                        </p>
                        <p>
                            • El coste íntegro del boleto es financiado por el bote común de la peña, y cualquier premio que obtenga la combinación se reparte según las normas oficiales.
                        </p>
                    </div>
                `
            },
            sella: {
                icon: '✍️',
                tag: 'Operaciones de Sellado',
                title: 'SELLA: (Sellador Designado)',
                body: `
                    <p class="text-slate-100 font-medium text-sm leading-relaxed">
                        El socio designado para sellar es el encargado de acudir a la administración de loterías a validar el boleto colectivo de la peña con los pronósticos y dobles generados.
                    </p>
                    <div class="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs space-y-1.5 mt-2">
                        <div class="font-bold flex items-center gap-1.5 text-amber-300">
                            <span>📌</span> Aclaración sobre el horario:
                        </div>
                        <p>
                            <strong>No es necesario sellar realmente en loterías el jueves a las 17:00h.</strong>
                        </p>
                        <p class="text-slate-300">
                            Lo que es estrictamente necesario es que <strong>todas las quinielas individuales de los socios estén rellenas en la web antes del jueves a las 17:00h</strong> para que el sistema y el ganador de dobles puedan preparar la combinación con margen suficiente.
                        </p>
                    </div>
                    <p class="text-slate-400 text-xs mt-2 pt-2 border-t border-slate-800">
                        💰 El coste total de sellar el boleto se le reembolsa al socio sellador al 100% desde el bote de la peña.
                    </p>
                `
            },
            countdown: {
                icon: '⏰',
                tag: 'Plazo Límite de Relleno',
                title: 'Límite para Rellenar Quinielas',
                body: `
                    <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs sm:text-sm space-y-2">
                        <p class="font-bold text-amber-400">
                            El jueves a las 17:00h es la hora límite para que todas las quinielas de los socios estén rellenas en la web.
                        </p>
                        <p class="text-slate-300 text-xs leading-relaxed">
                            No es necesario que el sellador selle físicamente a las 17:00h en loterías; esa hora marca el cierre de admisión de pronósticos en la plataforma para poder calcular la combinación de la peña y asignar los signos dobles.
                        </p>
                        <p class="text-slate-400 text-[11px] pt-1.5 border-t border-slate-800">
                            ⚠️ Los socios que no hayan rellenado sus 15 pronósticos a las 17:00h incurren en penalización económica reglamentaria (salvo que tengan activado el Dado de Viajes).
                        </p>
                    </div>
                `
            },
            pig: {
                icon: '🐷',
                tag: 'Normativa PIG',
                title: 'Partido de Interés General (PIG)',
                body: `
                    <div class="space-y-2.5 text-xs text-slate-300">
                        <div class="p-3 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-200 font-medium leading-relaxed">
                            El <strong>Partido de Interés General (PIG)</strong> es cualquier enfrentamiento directo entre dos de los tres grandes clubes masculinos (<strong>Real Madrid, Barcelona o Atlético de Madrid</strong>). 
                            <span class="block mt-1 text-slate-300 text-[11px]">Puede disputarse en cualquier casilla del boleto (partidos 1 al 15), no exclusivamente en el Pleno al 15.</span>
                        </div>
                        <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                            <strong>✅ Acertantes:</strong> Aquellos socios que aciertan el resultado del partido PIG. Quedan totalmente exentos de penalización.
                        </div>
                        <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-1">
                            <div class="font-bold">❌ Perdedores:</div>
                            <p>
                                Aquellos socios que fallaron el pronóstico (o no rellenaron la quiniela). <strong>Tienen una penalización económica de ${penaltyVal} €</strong> (codificada en los parámetros del Bote 2), importe que se ingresa íntegramente en la caja de la peña.
                            </p>
                        </div>
                    </div>
                `
            },
            participation: {
                icon: '📊',
                tag: 'Control de Envíos',
                title: 'Participación en la Jornada',
                body: `
                    <p class="text-slate-200 text-sm leading-relaxed">
                        Supervisa en tiempo real cuántos socios han rellenado y enviado su combinación de 15 partidos en la plataforma para la jornada actual.
                    </p>
                    <p class="text-slate-300 text-xs mt-2">
                        Puedes pulsar en <strong>"¿Quién falta por enviar?"</strong> para consultar la lista nominal con los socios que ya han completado su pronóstico y quiénes aún están pendientes antes del jueves a las 17:00h.
                    </p>
                `
            },
            lider: {
                icon: '🏆',
                tag: 'Clasificación Oficial',
                title: 'Líder de la Clasificación General',
                body: `
                    <p class="text-slate-200 text-sm leading-relaxed">
                        Indica qué socio encabeza la clasificación general tras las jornadas disputadas hasta la fecha.
                    </p>
                    <p class="text-slate-300 text-xs mt-2">
                        La clasificación suma todos los puntos obtenidos jornada a jornada con el baremo oficial de la peña. En caso de empate se aplican los criterios de desempate histórico de jornadas anteriores.
                    </p>
                `
            },
            bote: {
                icon: '💰',
                tag: 'Tesorería en Vivo',
                title: 'Caja Real de la Peña (Bote Común)',
                body: `
                    <p class="text-slate-200 text-sm leading-relaxed">
                        Refleja el saldo financiero total disponible en la peña (cuenta bancaria y efectivo en mano).
                    </p>
                    <p class="text-slate-300 text-xs mt-2">
                        Se calcula al céntimo a partir del bote inicial, aportaciones periódicas, el margen neto semanal de cuotas descontando el gasto del sellador en la administración, penalizaciones y premios oficiales cobrados.
                    </p>
                `
            },
            premios: {
                icon: '🎁',
                tag: 'Escrutinio Oficial',
                title: 'Premios & Rendimiento Económico',
                body: `
                    <p class="text-slate-200 text-sm leading-relaxed">
                        Resumen de los importes ganados oficialmente en las jornadas según el escrutinio de Loterías y Apuestas del Estado a partir de 10 aciertos.
                    </p>
                    <p class="text-slate-300 text-xs mt-2">
                        Distingue entre premios ganados por los socios a nivel individual y los premios obtenidos por la quiniela colectiva de dobles de la peña.
                    </p>
                `
            }
        };

        const info = infoMap[type] || {
            icon: 'ℹ️',
            tag: 'Información',
            title: 'Detalle de la Sección',
            body: '<p class="text-slate-300">Información del panel Maulas 2.0.</p>'
        };

        if (iconEl) iconEl.textContent = info.icon;
        if (tagEl) tagEl.textContent = info.tag;
        if (titleEl) titleEl.textContent = info.title;
        bodyEl.innerHTML = info.body;

        modal.classList.remove('hidden');
    }

    closeInfoModal() {
        const modal = document.getElementById('modal-info-card');
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Listeners de interfaz
     */
    initUiListeners() {
        // Cierre de dropdown al hacer clic fuera y cierre de modales al pulsar backdrop
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('nav-section-dropdown');
            const wrap = document.getElementById('nav-section-dropdown-wrap');
            if (dropdown && wrap && !wrap.contains(e.target)) {
                dropdown.classList.add('hidden');
            }

            // Cerrar modal explicativo al pulsar sobre el fondo oscuro
            const infoModal = document.getElementById('modal-info-card');
            if (infoModal && e.target === infoModal) {
                this.closeInfoModal();
            }

            // Cerrar modal de envíos pendientes al pulsar sobre el fondo oscuro
            const memModal = document.getElementById('modal-pending-members');
            if (memModal && e.target === memModal) {
                memModal.classList.add('hidden');
            }
        });

        // Cerrar modales al presionar la tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeInfoModal();
                const memModal = document.getElementById('modal-pending-members');
                if (memModal) memModal.classList.add('hidden');
                const dropdown = document.getElementById('nav-section-dropdown');
                if (dropdown) dropdown.classList.add('hidden');
            }
        });
    }
}

// Instanciación automática
document.addEventListener('DOMContentLoaded', () => {
    window.DashboardApp = new Dashboard2AppController();
});
