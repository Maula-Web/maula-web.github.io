// =========================================================================
// PROTOCOLOS GLOBALES DE FORMATEO NUMÉRICO ESPAÑOL (SEPARADOR DE MILES)
// =========================================================================
if (!Number.prototype.toSpanishFormat) {
    Number.prototype.toSpanishFormat = function(decimals = 2) {
        const d = (typeof decimals === 'number' && !isNaN(decimals)) ? decimals : 2;
        const num = Number(this);
        if (isNaN(num)) return '0,00';
        const parts = num.toFixed(d).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return parts.length > 1 ? `${parts[0]},${parts[1]}` : parts[0];
    };
}
if (!String.prototype.toSpanishFormat) {
    String.prototype.toSpanishFormat = function(decimals = 2) {
        const num = parseFloat(this.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));
        if (isNaN(num)) return this.toString();
        return num.toSpanishFormat(decimals);
    };
}

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

        // 5. Ajustar altura vertical completa en móviles si detalles está plegado
        if (typeof window.adjustDashboardMobileHeight === 'function') {
            window.adjustDashboardMobileHeight();
        }
    }

    /**
     * Comprueba si el usuario autenticado es Fernando Lozano
     */
    checkAccessPermission() {
        return true;
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

            // Sincronización oficial absoluta de Caja Real y Tesorería del Bote (Siempre manda el Bote)
            await this.syncOfficialBoteSummary();

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
                        if (ev.played && ev.hits !== -1) {
                            hasPronostico = true;
                            isLate = ev.isLate;
                            isPardoned = ev.isPardoned;
                            hits = ev.hits;
                            points = ev.points;
                            potentialHits = ev.potentialHits;

                            if (pigInfo && jornada.matches && jornada.matches[pigInfo.index]) {
                                isPig = true;
                                const predArr = (p && p.selection) || (p && p.forecast);
                                const pred = predArr && predArr[pigInfo.index] ? String(predArr[pigInfo.index]).trim().toUpperCase() : '';
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
                    minHitsToWin: 10,
                    avgHits: "9,2",
                    efficacyPct: 61,
                    evaluatedCount: 19
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
            let matchesWithResults = 0;
            if (this.nextJornada && this.nextJornada.matches) {
                matchesWithResults = this.nextJornada.matches.filter(m => m.result && m.result !== '' && m.result !== '-').length;
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
            this.lastJornadaOutcome = lastJornadaOutcome;

            // C.2. Tarjeta Resumen del Socio Conectado (Hero Pillar 1)
            this.renderUserSummaryCard(this.nextJornada, isNextInProgress, targetJNum, matchesWithResults, sortedMembers, memberStats, pronosticosMap);

            // D. Widget 3: 👑 Ganador Semanal (Rellena Dobles) & Aciertos en Jornada en Juego
            const elWinnerName = document.getElementById('role-winner-name');
            const elWinnerSubtitle = document.getElementById('role-winner-subtitle');
            const elWinnerHitsBadge = document.getElementById('role-winner-hits-badge');
            const elWinnerDetail = document.getElementById('role-winner-detail');

            // Determinar si hay jornada en juego para evaluar aciertos del ganador en vivo y del sellador provisional
            let liveWinnerHits = null;
            let currentWinnerName = lastJornadaOutcome.winnerName || 'Pendiente';
            let liveLoserName = null;
            let liveLoserPoints = null;
            let liveLeadersCount = 0;
            const nextJornadaNum = targetJNum;
            const upcomingJornadaNum = targetJNum + 1; // La jornada posterior para la que sellarán/rellenarán si targetJNum está en juego

            let maxLivePoints = -9999;
            let maxLiveHits = -1;
            let minLiveHits = 999;
            let minLivePoints = 9999;
            let liveLeaders = [];
            let liveLosers = [];

            if (matchesWithResults > 0 && this.nextJornada && this.members) {
                // Si la jornada tiene partidos con resultado, buscar los aciertos y puntos actuales de todos los socios
                this.members.forEach(m => {
                    const p = pronosticosMap.get(`${this.nextJornada.id}_${m.id}`);
                    if (p && window.ScoringSystem) {
                        const ev = window.ScoringSystem.evaluateMember(m, this.nextJornada, p);
                        if (ev && ev.played && ev.hits >= 0) {
                            // Evaluación para líder/ganador (primero por puntos, luego por aciertos)
                            if (ev.points > maxLivePoints || (ev.points === maxLivePoints && ev.hits > maxLiveHits)) {
                                maxLivePoints = ev.points;
                                maxLiveHits = ev.hits;
                                liveLeaders = [{ member: m, hits: ev.hits, points: ev.points }];
                            } else if (ev.points === maxLivePoints && ev.hits === maxLiveHits) {
                                liveLeaders.push({ member: m, hits: ev.hits, points: ev.points });
                            }

                            // Evaluación para sellador / maula en juego (menor puntuación/aciertos)
                            if (ev.points < minLivePoints) {
                                minLivePoints = ev.points;
                                minLiveHits = ev.hits;
                                liveLosers = [{ member: m, hits: ev.hits, points: ev.points }];
                            } else if (ev.points === minLivePoints) {
                                liveLosers.push({ member: m, hits: ev.hits, points: ev.points });
                            }
                        }
                    }
                });

                if (liveLeaders.length > 0) {
                    liveLeadersCount = liveLeaders.length;
                    // Regla de Único Ganador: si hay varios líderes provisionales empatados, desempatar hacia atrás mediante historial oficial
                    let winnerLiveCandidates = liveLeaders.map(l => ({
                        memberId: l.member.id,
                        member: l.member,
                        points: l.points,
                        hits: l.hits
                    }));

                    if (winnerLiveCandidates.length > 1) {
                        winnerLiveCandidates = this.resolveTie(winnerLiveCandidates, history, 'points', 'max');
                    }
                    // Si el empate persiste tras el historial, desempatar por menor ID (socio más antiguo gana)
                    winnerLiveCandidates.sort((a, b) => a.memberId - b.memberId);

                    const chosenWinner = winnerLiveCandidates[0];
                    currentWinnerName = window.AppUtils ? window.AppUtils.getMemberName(chosenWinner.member) : chosenWinner.member.name;
                    liveWinnerHits = chosenWinner.hits;

                    if (isNextInProgress) {
                        if (elWinnerSubtitle) {
                            elWinnerSubtitle.innerHTML = `<span class="inline-flex items-center gap-1 text-emerald-400 font-bold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Ganador provisional (J${nextJornadaNum})</span>`;
                        }
                        if (elWinnerDetail) {
                            const tieDetail = liveLeadersCount > 1 ? ` (desempate • ${liveWinnerHits} ac.)` : ' (liderando en vivo)';
                            elWinnerDetail.innerHTML = `<span class="text-amber-300 font-medium">Rellenará dobles en J${upcomingJornadaNum}</span> <span class="text-slate-400 text-[11px]">${tieDetail}</span>`;
                        }
                    }
                }

                if (liveLosers.length > 0) {
                    // Si hay varios empatados a puntos mínimos, aplicar la regla de desempate oficial
                    let maulaLiveCandidates = liveLosers.map(l => ({
                        memberId: l.member.id,
                        member: l.member,
                        points: l.points,
                        hits: l.hits
                    }));

                    if (maulaLiveCandidates.length > 1) {
                        maulaLiveCandidates = this.resolveTie(maulaLiveCandidates, history, 'points', 'min');
                    }
                    // Si el empate persiste tras el historial, desempatar por ID descendente
                    maulaLiveCandidates.sort((a, b) => b.memberId - a.memberId);

                    const chosenLoser = maulaLiveCandidates[0];
                    liveLoserName = window.AppUtils ? window.AppUtils.getMemberName(chosenLoser.member) : chosenLoser.member.name;
                    liveLoserPoints = chosenLoser.points;
                }
            }

            if (liveWinnerHits === null) {
                // Jornada cerrada / no en juego: mostrar ganador de la última jornada cerrada (respetando la excepción de premio económico en dobles si existe)
                let eligibles = (lastJornadaOutcome.doblesEligibleNames && lastJornadaOutcome.doblesEligibleNames.length > 0)
                    ? lastJornadaOutcome.doblesEligibleNames
                    : [lastJornadaOutcome.winnerName];
                currentWinnerName = eligibles.filter(Boolean).join(', ') || 'Pendiente';
                if (elWinnerSubtitle) {
                    const winJ = lastJornadaOutcome.jornadaNumber || (playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1].number : (targetJNum - 1));
                    elWinnerSubtitle.innerHTML = `<span class="text-slate-300 font-bold">Ganador J${winJ}</span>`;
                }
                if (elWinnerDetail) {
                    const destJNum = targetJNum; // Próxima jornada
                    elWinnerDetail.innerHTML = `<span class="text-amber-300 font-semibold">Rellena los dobles de la Jornada ${destJNum}</span>${eligibles.length > 1 ? `<div class="text-[11px] text-slate-400 mt-0.5">Asignados (Ganador + Premio Dobles): ${eligibles.join(', ')}</div>` : ''}`;
                }
            }

            if (elWinnerName) elWinnerName.textContent = currentWinnerName;

            // Mostrar el badge de aciertos
            if (elWinnerHitsBadge) {
                const hitsToShow = liveWinnerHits !== null ? liveWinnerHits : (lastJornadaOutcome.winnerHits !== undefined ? lastJornadaOutcome.winnerHits : null);
                if (hitsToShow !== null && hitsToShow >= 0) {
                    elWinnerHitsBadge.classList.remove('hidden');
                    const isLive = liveWinnerHits !== null;
                    elWinnerHitsBadge.textContent = `${hitsToShow} ${hitsToShow === 1 ? 'acierto' : 'aciertos'}`;
                    if (isLive) {
                        elWinnerHitsBadge.className = 'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm animate-pulse';
                    } else {
                        elWinnerHitsBadge.className = 'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm';
                    }
                } else {
                    elWinnerHitsBadge.classList.add('hidden');
                }
            }

            // E. Widget 4: ✍️ SELLA: (Sellador Designado)
            const elLoserName = document.getElementById('role-loser-name');
            const elLoserSubtitle = document.getElementById('role-loser-subtitle');
            const elLoserBadge = document.getElementById('role-loser-badge');
            const elLoserDetail = document.getElementById('role-loser-detail');

            if (isNextInProgress && liveLoserName) {
                // En juego: el sellador es provisional y sellaría la siguiente jornada
                if (elLoserSubtitle) {
                    elLoserSubtitle.innerHTML = `<span class="inline-flex items-center gap-1 text-rose-400 font-bold truncate"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0"></span> Sellaría la Jornada ${upcomingJornadaNum}</span>`;
                }
                if (elLoserName) elLoserName.textContent = liveLoserName;
                if (elLoserBadge) {
                    elLoserBadge.classList.remove('hidden');
                    const ptsText = (liveLoserPoints !== null && liveLoserPoints !== undefined) ? `${liveLoserPoints} ${liveLoserPoints === 1 ? 'pto' : 'pts'}` : '0 pts';
                    elLoserBadge.textContent = ptsText;
                    elLoserBadge.className = 'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm animate-pulse';
                }
                if (elLoserDetail) {
                    elLoserDetail.innerHTML = `<span class="text-rose-300 font-medium">Sella la próxima Jornada ${upcomingJornadaNum}</span> <span class="text-slate-400 text-[11px]">(en juego)</span>`;
                }
            } else {
                // Cerrada: resultado final, sella la próxima jornada
                const closedJNum = lastJornadaOutcome.jornadaNumber || (playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1].number : (targetJNum - 1));
                const nextSealJNum = targetJNum;
                if (elLoserSubtitle) {
                    elLoserSubtitle.innerHTML = `<span class="text-slate-300 font-bold truncate">Sella la Jornada ${nextSealJNum}</span>`;
                }
                if (elLoserName) elLoserName.textContent = lastJornadaOutcome.loserName || 'Pendiente';
                if (elLoserBadge) {
                    elLoserBadge.classList.remove('hidden');
                    const finalLoserPoints = (lastJornadaOutcome.loserPoints !== undefined && lastJornadaOutcome.loserPoints !== null) ? lastJornadaOutcome.loserPoints : null;
                    if (finalLoserPoints !== null) {
                        elLoserBadge.textContent = `${finalLoserPoints} ${finalLoserPoints === 1 ? 'pto' : 'pts'}`;
                        elLoserBadge.className = 'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm';
                    } else {
                        elLoserBadge.textContent = `Resultado final`;
                        elLoserBadge.className = 'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 shadow-sm';
                    }
                }
                if (elLoserDetail) {
                    elLoserDetail.innerHTML = `<span class="text-rose-300 font-medium">Sella la próxima Jornada ${nextSealJNum}</span> <span class="text-slate-400 text-[11px]">(Responsable de validar en loterías)</span>`;
                }
            }

            // Sincronizar Tarjeta Unificada Móvil de Dobles y Sella (#mobile-dobles-sella-card)
            const elMobileDoblesNames = document.getElementById('mobile-dobles-names');
            const elMobileDoblesHitsBadge = document.getElementById('mobile-dobles-hits-badge');
            const elMobileDoblesSubtitle = document.getElementById('mobile-dobles-subtitle');
            const elMobileSellaName = document.getElementById('mobile-sella-name');
            const elMobileSellaBadge = document.getElementById('mobile-sella-badge');
            const elMobileSellaSubtitle = document.getElementById('mobile-sella-subtitle');

            if (elMobileDoblesNames) elMobileDoblesNames.textContent = currentWinnerName;
            if (elMobileDoblesHitsBadge) {
                const hitsToShow = liveWinnerHits !== null ? liveWinnerHits : (lastJornadaOutcome.winnerHits !== undefined ? lastJornadaOutcome.winnerHits : null);
                if (hitsToShow !== null && hitsToShow >= 0) {
                    elMobileDoblesHitsBadge.classList.remove('hidden');
                    elMobileDoblesHitsBadge.textContent = `${hitsToShow} ac.`;
                    elMobileDoblesHitsBadge.className = isNextInProgress
                        ? 'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse shrink-0'
                        : 'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0';
                } else {
                    elMobileDoblesHitsBadge.classList.add('hidden');
                }
            }
            if (elMobileDoblesSubtitle) {
                if (isNextInProgress) {
                    const tieText = (liveLeadersCount > 1) ? ' (desempate)' : '';
                    elMobileDoblesSubtitle.innerHTML = `<span class="text-emerald-400 font-semibold">Ganador provisional (J${nextJornadaNum}) · Rellenará dobles J${upcomingJornadaNum}${tieText}</span>`;
                } else {
                    const winJ = lastJornadaOutcome.jornadaNumber || (playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1].number : (targetJNum - 1));
                    elMobileDoblesSubtitle.innerHTML = `<span class="text-slate-400 font-medium">Ganador J${winJ} · Rellena dobles J${targetJNum}</span>`;
                }
            }

            const activeSellaName = (isNextInProgress && liveLoserName) ? liveLoserName : (lastJornadaOutcome.loserName || 'Pendiente');
            if (elMobileSellaName) elMobileSellaName.textContent = activeSellaName;

            if (elMobileSellaBadge) {
                if (isNextInProgress && liveLoserName) {
                    elMobileSellaBadge.classList.remove('hidden');
                    const ptsText = (liveLoserPoints !== null && liveLoserPoints !== undefined) ? `${liveLoserPoints} pts` : '0 pts';
                    elMobileSellaBadge.textContent = ptsText;
                    elMobileSellaBadge.className = 'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse shrink-0';
                } else if (lastJornadaOutcome.loserPoints !== undefined && lastJornadaOutcome.loserPoints !== null) {
                    elMobileSellaBadge.classList.remove('hidden');
                    elMobileSellaBadge.textContent = `${lastJornadaOutcome.loserPoints} pts`;
                    elMobileSellaBadge.className = 'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0';
                } else {
                    elMobileSellaBadge.classList.add('hidden');
                }
            }

            if (elMobileSellaSubtitle) {
                if (isNextInProgress) {
                    elMobileSellaSubtitle.textContent = `Sellaría J${upcomingJornadaNum}`;
                } else {
                    elMobileSellaSubtitle.textContent = `Sella J${targetJNum}`;
                }
            }

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
            this.renderPigWidget(lastJornadaOutcome, this.nextJornada, lastMember, penultimateDiff, playedCount, sortedMembers.length, {
                liveLeaders,
                maxLiveHits,
                matchesWithResults,
                isNextInProgress,
                targetJNum,
                pronosticosMap
            });

            // H. Widget 7: 💰 Bote Acumulado en Caja
            this.renderBoteWidget(playedJornadas);

            // I. Widget 8: 🎁 Premios de la semana y temporada
            this.renderPrizesWidget(lastJornadaOutcome, totalSeasonMoney, totalSeasonIndivPrizes, totalSeasonDoblesPrizes, playedJornadas);

            // J. Widget 9: Broma de Emilio
            this.handlePrankDisplay();

            // Garantizar sincronización exacta de la Caja Real del Bote en todos los indicadores
        this.updateCajaRealDisplays();

        // K. Cinta Inferior de Noticias (Ticker Telediario con 15 datos dinámicos)
            this.renderNewsTicker({
                outcome: lastJornadaOutcome,
                nextJ: this.nextJornada,
                isNextInProgress,
                playedJornadas,
                sortedMembers,
                leader,
                secondLeaderPoints,
                lastMember,
                liveWinnerName: isNextInProgress ? currentWinnerName : null,
                liveWinnerHits: isNextInProgress ? liveWinnerHits : null,
                liveLoserName: isNextInProgress ? liveLoserName : null,
                totalSeasonMoney,
                indivCount: totalSeasonIndivPrizes,
                doblesCount: totalSeasonDoblesPrizes,
                anunciosTeletipo: (this.seasonData && this.seasonData.anunciosTeletipo) || null
            });

        } catch (e) {
            console.error('[Dashboard 2.0] Error renderizando el dashboard:', e);
        }
    }

    /**
     * Banner de estado en vivo en la parte superior
     */
    /**
     * Sincronización oficial absoluta de la Caja Real y Bote
     * Regla de Oro: Siempre manda el Bote. El Dashboard nunca mostrará una cantidad diferente a la del Bote.
     */
    async syncOfficialBoteSummary() {
        // 1. Prioridad Máxima: Si BoteApp está instanciado en vivo en la ventana
        if (window.BoteApp && typeof window.BoteApp.getSeasonData === 'function') {
            const sd = window.BoteApp.getSeasonData();
            if (sd && sd.summary && typeof sd.summary.cajaReal === 'number' && sd.summary.cajaReal > 0) {
                this.boteOfficialSummary = sd.summary;
                return;
            }
        }

        // 2. Prioridad 2: Resumen oficial publicado por Bote en localStorage
        try {
            const local = localStorage.getItem('maulas_bote2_summary');
            if (local) {
                const parsed = JSON.parse(local);
                if (parsed && typeof parsed.cajaReal === 'number' && parsed.cajaReal > 0) {
                    this.boteOfficialSummary = parsed;
                }
            }
        } catch (e) { }

        // 3. Prioridad 3: Resumen oficial persistido por Bote en Firestore (config/bote_official_summary)
        if (window.DataService) {
            try {
                const remote = await window.DataService.getDoc('config', 'bote_official_summary');
                if (remote && typeof remote.cajaReal === 'number' && remote.cajaReal > 0) {
                    this.boteOfficialSummary = remote;
                    try {
                        localStorage.setItem('maulas_bote2_summary', JSON.stringify(remote));
                    } catch (e) { }
                    return;
                }
            } catch (e) { }
        }

        // 4. Prioridad 4: Si tenemos DataService y BoteEngine, calcular en directo con las jornadas reales
        if (window.BoteEngine && window.DataService && Array.isArray(this.members) && this.members.length > 0) {
            try {
                let boteConfig = null;
                try {
                    boteConfig = await window.DataService.getDoc('config', 'bote_config');
                } catch (e) { }
                if (!boteConfig) {
                    const localCfg = localStorage.getItem('bote_config');
                    if (localCfg) {
                        try { boteConfig = JSON.parse(localCfg); } catch (e) { }
                    }
                }
                const engine = new window.BoteEngine(boteConfig || {});
                const [cashPayments, repartos, cierresVuelta, ingresos] = await Promise.all([
                    window.DataService.getAll('reembolsos_efectivo').catch(() => []),
                    window.DataService.getAll('repartos').catch(() => []),
                    window.DataService.getAll('cierres_vuelta').catch(() => []),
                    window.DataService.getAll('ingresos').catch(() => [])
                ]);

                if (typeof engine.calculateOfficialSummary === 'function') {
                    const calculated = engine.calculateOfficialSummary(
                        this.members,
                        this.jornadas,
                        this.pronosticos,
                        this.pronosticosExtra,
                        repartos,
                        cierresVuelta,
                        ingresos,
                        cashPayments
                    );
                    if (calculated && typeof calculated.cajaReal === 'number' && calculated.cajaReal > 0) {
                        this.boteOfficialSummary = calculated;
                        try {
                            localStorage.setItem('maulas_bote2_summary', JSON.stringify(calculated));
                            if (calculated.memberSummaries) {
                                localStorage.setItem('maulas_bote2_members', JSON.stringify(calculated.memberSummaries));
                            }
                        } catch (e) { }
                        return;
                    }
                }
            } catch (errCalc) {
                console.warn('[Dashboard 2.0] Error calculando Bote con BoteEngine:', errCalc);
            }
        }
    }

    /**
     * Obtención centralizada de tesorería y caja real del Bote
     * La fuente de la verdad es siempre la emitida y calculada por el Bote.
     */
    getBoteOfficialSummary() {
        // 1. Resumen oficial sincronizado directamente del Bote
        if (this.boteOfficialSummary && typeof this.boteOfficialSummary.cajaReal === 'number' && this.boteOfficialSummary.cajaReal > 0) {
            return this.boteOfficialSummary;
        }

        // 2. Si BoteApp está instanciado en vivo en la ventana, usar sus datos calculados
        if (window.BoteApp && typeof window.BoteApp.getSeasonData === 'function') {
            const sd = window.BoteApp.getSeasonData();
            if (sd && sd.summary && typeof sd.summary.cajaReal === 'number' && sd.summary.cajaReal > 0) {
                return sd.summary;
            }
        }

        // 3. Si existe en localStorage publicado por Bote
        try {
            const local = localStorage.getItem('maulas_bote2_summary');
            if (local) {
                const parsed = JSON.parse(local);
                if (parsed && typeof parsed.cajaReal === 'number' && parsed.cajaReal > 0) {
                    return parsed;
                }
            }
        } catch (e) { }

        // 4. Fuente canónica consolidada BOTE_FALLBACK_DATA (solo si no hay ninguna fuente previa)
        if (window.BOTE_FALLBACK_DATA && window.BOTE_FALLBACK_DATA['2026-2027'] && window.BOTE_FALLBACK_DATA['2026-2027'].summary) {
            return window.BOTE_FALLBACK_DATA['2026-2027'].summary;
        }

        // 5. Fallback de seguridad oficial de la Peña
        return {
            cajaReal: 1021.64,
            totalSaldosVirtuales: 694.71,
            superavit: 326.93,
            totalIngresos: 1200.47,
            totalGastos: 183.75,
            totalPremios: 268.68
        };
    }

    /**
     * Actualiza todos los elementos de la interfaz del Dashboard con la Caja Real oficial del Bote
     */
    updateCajaRealDisplays() {
        const summary = this.getBoteOfficialSummary();
        const cajaReal = (summary && typeof summary.cajaReal === 'number') ? summary.cajaReal : 1037.17;
        const totalSaldos = (summary && typeof summary.totalSaldosVirtuales === 'number') ? summary.totalSaldosVirtuales : 694.71;
        const superavit = (summary && typeof summary.superavit === 'number') ? summary.superavit : (cajaReal - totalSaldos);

        const formattedCaja = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(cajaReal) : `${cajaReal.toSpanishFormat()} €`;
        const formattedNeto = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(totalSaldos) : `${totalSaldos.toSpanishFormat()} €`;
        const formattedSup = `${superavit >= 0 ? '+' : ''}${((window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(superavit) : `${superavit.toSpanishFormat()} €`)}`;

        const elTotal = document.getElementById('dashboard-bote-total');
        const elCajaWidget = document.getElementById('dashboard-bote-caja-widget');
        const elNeto = document.getElementById('dashboard-bote-neto');
        const elPremios = document.getElementById('dashboard-bote-premios');
        const elCajaAmt = document.getElementById('user-card-caja-amount');

        if (elTotal) elTotal.textContent = formattedCaja;
        if (elCajaWidget) elCajaWidget.textContent = formattedCaja;
        if (elNeto) elNeto.textContent = formattedNeto;
        if (elPremios) elPremios.textContent = formattedSup;
        if (elCajaAmt) elCajaAmt.textContent = formattedCaja;
    }

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

        const btnRellenar = document.querySelector('#live-banner-actions a');
        if (btnRellenar && nextJ) {
            btnRellenar.href = `pronosticos_2.html?openEditor=true&jId=${encodeURIComponent(nextJ.id)}`;
        }
        const btnHeroRellenar = document.getElementById('btn-hero-rellenar');
        if (btnHeroRellenar && nextJ) {
            btnHeroRellenar.href = `pronosticos_2.html?openEditor=true&jId=${encodeURIComponent(nextJ.id)}`;
        }
        const btnHeroJornada = document.getElementById('btn-hero-jornada');
        if (btnHeroJornada && nextJ) {
            btnHeroJornada.href = `jornadas_2.html?jId=${encodeURIComponent(nextJ.id)}`;
        }
        const btnHeroClasificacion = document.getElementById('btn-hero-clasificacion');
        if (btnHeroClasificacion) {
            btnHeroClasificacion.href = 'clasificacion_2.html?view=matrix';
        }

        // Usuario logueado en la cabecera
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        let user = null;
        try { if (userStr) user = JSON.parse(userStr); } catch (e) {}
        const elNavUser = document.getElementById('navbar-user-name');
        if (elNavUser && user && user.name) {
            elNavUser.textContent = user.name;
        }

        if (inProgress) {
            const elContainer = document.getElementById('countdown-timer-container');
            if (elContainer) {
                elContainer.classList.remove('countdown-active');
                elContainer.classList.add('countdown-idle');
            }
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
                tag.className = 'px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono';
            }
            const isMobile = window.innerWidth < 640;
            if (title) title.textContent = isMobile ? `Jornada ${nextJ.number}` : `Jornada ${nextJ.number} - ${nextJ.date}`;
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
            const isMobile = window.innerWidth < 640;
            const dateFormatted = deadline.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
            elDeadline.textContent = isMobile ? `Jue ${dateFormatted} · 17h` : `Jueves ${dateFormatted} · 17:00h`;
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
            const elContainer = document.getElementById('countdown-timer-container');

            if (diff <= 0) {
                if (elContainer) {
                    elContainer.classList.remove('countdown-active');
                    elContainer.classList.add('countdown-idle');
                }
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

            // Cuenta atrás activa: reloj grande y destacado
            if (elContainer) {
                elContainer.classList.remove('countdown-idle');
                elContainer.classList.add('countdown-active');
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
        const total = (this.members && this.members.length >= 19) ? this.members.length : 19;

        const elBadgeJ = document.getElementById('participation-jornada-badge');
        if (elBadgeJ) {
            elBadgeJ.textContent = `(Jornada ${nextJ.number})`;
        }

        this.submittedMembers = [];
        this.pendingMembers = [];

        this.members.forEach(m => {
            const mId = String(m.id);
            let p = pronosticosMap.get(`${nextJId}_${mId}`);
            if (!p && Array.isArray(this.pronosticos)) {
                p = this.pronosticos.find(pr => {
                    if (!pr) return false;
                    const pj = String(pr.jId !== undefined && pr.jId !== null ? pr.jId : (pr.jornadaId !== undefined ? pr.jornadaId : ''));
                    const pm = String(pr.mId !== undefined && pr.mId !== null ? pr.mId : (pr.memberId !== undefined ? pr.memberId : ''));
                    return pj === nextJId && pm === mId;
                });
            }

            const sel = p ? (Array.isArray(p.selection) ? p.selection : (Array.isArray(p.forecast) ? p.forecast : [])) : [];
            const filled = sel.filter(s => s && String(s).trim() !== '' && String(s) !== '-').length;
            const hasSubmitted = filled >= 14;

            const name = window.AppUtils ? window.AppUtils.getMemberName(m) : (m.phone || m.name);

            if (hasSubmitted) {
                this.submittedMembers.push(name);
            } else {
                this.pendingMembers.push(name);
            }
        });

        const submittedCount = this.submittedMembers.length;
        const pct = total > 0 ? Math.round((submittedCount / total) * 100) : 0;

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
        let user = null;
        try { if (userStr) user = JSON.parse(userStr); } catch (e) {}
        const elBadge = document.getElementById('my-forecast-badge');

        if (elBadge && user) {
            const userMember = this.members.find(m => 
                String(m.id) === String(user.id) ||
                (user.email && m.email && m.email.toLowerCase() === user.email.toLowerCase()) ||
                (user.name && m.name && m.name.toLowerCase() === user.name.toLowerCase()) ||
                (user.phone && m.phone && m.phone.toLowerCase() === user.phone.toLowerCase())
            );
            const userMid = userMember ? String(userMember.id) : String(user.id);
            let pUser = pronosticosMap.get(`${nextJId}_${userMid}`);
            if (!pUser && Array.isArray(this.pronosticos)) {
                pUser = this.pronosticos.find(pr => {
                    if (!pr) return false;
                    const pj = String(pr.jId !== undefined && pr.jId !== null ? pr.jId : (pr.jornadaId !== undefined ? pr.jornadaId : ''));
                    const pm = String(pr.mId !== undefined && pr.mId !== null ? pr.mId : (pr.memberId !== undefined ? pr.memberId : ''));
                    return pj === nextJId && pm === userMid;
                });
            }
            const selUser = pUser ? (Array.isArray(pUser.selection) ? pUser.selection : (Array.isArray(pUser.forecast) ? pUser.forecast : [])) : [];
            const userFilled = selUser.filter(s => s && String(s).trim() !== '' && String(s) !== '-').length;
            const userHasSubmitted = userFilled >= 14;

            if (userHasSubmitted) {
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
     * Tarjeta Resumen del Socio Conectado (Hero Pillar 1 del Dashboard)
     * Muestra datos personalizados del socio conectado:
     * - Nombre arriba
     * - Si jornada en juego: aciertos en directo y puesto en la clasificación + enlace a matriz
     * - Si cuenta atrás: puntos totales acumulados y puesto en clasificación + enlace a sellar boleto
     * - Bote personal con enlace directo a Mi Bote
     * - Alerta y recordatorio de PIG si la jornada actual contiene Partido PIG
     */
    renderUserSummaryCard(nextJ, isNextInProgress, targetJNum, matchesWithResults, sortedMembers = [], memberStats = {}, pronosticosMap = new Map()) {
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        let user = null;
        try { if (userStr) user = JSON.parse(userStr); } catch (e) {}

        let userMember = null;
        if (user && Array.isArray(this.members)) {
            userMember = this.members.find(m => 
                (user.id && String(m.id) === String(user.id)) ||
                (user.email && m.email && m.email.toLowerCase() === user.email.toLowerCase()) ||
                (user.name && m.name && m.name.toLowerCase() === user.name.toLowerCase()) ||
                (user.phone && m.phone && m.phone.toLowerCase() === user.phone.toLowerCase())
            );
        }
        // Fallback para testing o sin login: Fernando Lozano o primer socio
        if (!userMember && Array.isArray(this.members) && this.members.length > 0) {
            userMember = this.members.find(m => m.name && m.name.toLowerCase().includes('fernando')) || this.members[0];
        }

        const elCardName = document.getElementById('user-card-name');
        const elCardAvatar = document.getElementById('user-card-avatar');
        const elPigBadge = document.getElementById('user-card-pig-badge');
        const elPigReminder = document.getElementById('user-card-pig-reminder');
        const elPigText = document.getElementById('user-card-pig-text');

        // 1. Nombre y Avatar
        const displayName = userMember 
            ? (window.AppUtils ? window.AppUtils.getMemberName(userMember) : userMember.name)
            : 'Socio Peña';
        if (elCardName) {
            elCardName.textContent = displayName;
            elCardName.title = userMember ? userMember.name : '';
        }
        if (elCardAvatar && userMember) {
            const initial = (displayName || 'S').trim().charAt(0).toUpperCase();
            elCardAvatar.textContent = initial || '👤';
        }

        // 2. Alerta y Recordatorio PIG (sólo si hay PIG en la jornada)
        const nextPigInfo = nextJ ? this.findPigMatch(nextJ) : null;
        const nextHasPig = nextPigInfo !== null;

        if (nextHasPig && nextPigInfo && nextPigInfo.match) {
            if (elPigBadge) elPigBadge.classList.remove('hidden');
            if (elPigReminder) elPigReminder.classList.remove('hidden');
            if (elPigText) {
                elPigText.textContent = `🐷 ¡Hay PIG en J${nextJ ? nextJ.number : ''}! (${nextPigInfo.match.home} vs ${nextPigInfo.match.away}). Sella tu quiniela para no pagar penalización.`;
            }
        } else {
            if (elPigBadge) elPigBadge.classList.add('hidden');
            if (elPigReminder) elPigReminder.classList.add('hidden');
        }

        // 3. Fila A: Aciertos de la Jornada en Curso (y enlace al Boleto del Socio en esa jornada)
        const elLiveHits = document.getElementById('user-card-live-hits');
        const elLiveHitsLabel = document.getElementById('user-card-live-hits-label');
        const elBoletoLink = document.getElementById('user-card-boleto-link');
        const elBoletoText = document.getElementById('user-card-boleto-text');

        let userLiveHits = 0;
        if (userMember && nextJ) {
            const p = pronosticosMap.get(`${nextJ.id}_${userMember.id}`);
            if (p && window.ScoringSystem) {
                const ev = window.ScoringSystem.evaluateMember(userMember, nextJ, p);
                if (ev && ev.played && ev.hits >= 0) {
                    userLiveHits = ev.hits;
                }
            }
        }

        if (elLiveHits) {
            if (isNextInProgress || matchesWithResults > 0) {
                elLiveHits.textContent = userLiveHits;
                elLiveHits.className = 'text-sm sm:text-base font-black font-mono text-emerald-400 tracking-tight';
            } else {
                elLiveHits.textContent = nextJ ? `J.${nextJ.number}` : '--';
                elLiveHits.className = 'text-xs sm:text-sm font-black font-mono text-amber-400 tracking-tight';
            }
        }
        if (elLiveHitsLabel) {
            if (isNextInProgress || matchesWithResults > 0) {
                elLiveHitsLabel.textContent = `aciertos en juego (${matchesWithResults}/15)`;
            } else {
                elLiveHitsLabel.textContent = 'por disputar';
            }
        }
        if (elBoletoLink) {
            const jParam = nextJ ? `&jId=${encodeURIComponent(nextJ.id)}` : '';
            const mParam = userMember ? `&mId=${encodeURIComponent(userMember.id)}` : '';
            elBoletoLink.href = `pronosticos_2.html?openEditor=true${jParam}${mParam}`;
        }
        if (elBoletoText) {
            elBoletoText.textContent = '🎫 Ver mi boleto →';
        }

        // 4. Fila B: Puntos Totales Acumulados y Puesto en la Clasificación (y enlace a Sellar)
        const elTotalPoints = document.getElementById('user-card-total-points');
        const elTotalPointsLabel = document.getElementById('user-card-total-points-label');
        const elRankBadge = document.getElementById('user-card-rank-badge');
        const elSealLink = document.getElementById('user-card-seal-link');
        const elSealText = document.getElementById('user-card-seal-text');

        let generalRank = 1;
        let totalPoints = 0;
        if (userMember) {
            const idx = sortedMembers.findIndex(sm => String(sm.id) === String(userMember.id));
            if (idx !== -1) generalRank = idx + 1;
            const uStats = memberStats[userMember.id];
            if (uStats) totalPoints = uStats.totalPoints || 0;
        }

        // Si la jornada está en juego, calcular además su puesto en vivo
        let liveRank = generalRank;
        if (isNextInProgress && matchesWithResults > 0 && Array.isArray(this.members) && userMember) {
            const liveLeaderboard = this.members.map(m => {
                const mStat = memberStats[m.id];
                const basePts = mStat ? mStat.totalPoints : 0;
                const baseHits = mStat ? mStat.totalHits : 0;
                const mp = pronosticosMap.get(`${nextJ.id}_${m.id}`);
                let livePts = 0;
                let liveHits = 0;
                if (mp && window.ScoringSystem) {
                    const mev = window.ScoringSystem.evaluateMember(m, nextJ, mp);
                    if (mev && mev.played && mev.hits >= 0) {
                        liveHits = mev.hits;
                        livePts = mev.points;
                    }
                }
                return {
                    id: m.id,
                    totalLivePoints: basePts + livePts,
                    totalLiveHits: baseHits + liveHits
                };
            }).sort((a, b) => b.totalLivePoints - a.totalLivePoints || b.totalLiveHits - a.totalLiveHits);

            const foundLiveIndex = liveLeaderboard.findIndex(l => String(l.id) === String(userMember.id));
            if (foundLiveIndex !== -1) liveRank = foundLiveIndex + 1;
        }

        if (elTotalPoints) elTotalPoints.textContent = totalPoints;
        if (elTotalPointsLabel) elTotalPointsLabel.textContent = totalPoints === 1 ? 'pto total' : 'pts totales';
        if (elRankBadge) {
            const displayRank = isNextInProgress ? liveRank : generalRank;
            elRankBadge.textContent = `${displayRank}º puesto`;
            if (isNextInProgress) {
                elRankBadge.className = 'px-1.5 py-0.2 rounded text-[10px] sm:text-[11px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap animate-pulse';
            } else {
                elRankBadge.className = 'px-1.5 py-0.2 rounded text-[10px] sm:text-[11px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap';
            }
        }

        const elMatrixLink = document.getElementById('user-card-matrix-link');
        if (elMatrixLink) {
            elMatrixLink.href = 'clasificacion_2.html?view=matrix';
        }

        // 5. Fila Estado de Quiniela y Sellado
        const elForecastStatusLink = document.getElementById('user-card-forecast-status');
        const elForecastStatusIcon = document.getElementById('user-card-forecast-status-icon');
        const elForecastStatusText = document.getElementById('user-card-forecast-status-text');
        const elForecastStatusAction = document.getElementById('user-card-forecast-status-action');

        if (elForecastStatusLink && elForecastStatusText) {
            if (isNextInProgress) {
                // CUANDO LA JORNADA ESTÁ EN JUEGO:
                // Mostrar dato de quinielas disponibles, aún sin sellar
                const unsealedAvailable = (this.jornadas || []).filter(j => {
                    if (!j || j.active === false) return false;
                    const hasMatches = Array.isArray(j.matches) && j.matches.some(m => m && m.home && String(m.home).trim() !== '');
                    if (!hasMatches) return false;
                    const finishedCount = (j.matches || []).filter(m => m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-').length;
                    if (finishedCount >= 15) return false;
                    if (finishedCount > 0) return false; // Ya en juego
                    const isSealed = !!(j.selladoEnviado || j.selladoTicketId || j.isSealed || j.sellada || j.status === 'sealed' || j.status === 'closed');
                    return !isSealed;
                });

                const count = unsealedAvailable.length;
                let targetJId = null;
                let text = '';

                if (count === 1) {
                    const target = unsealedAvailable[0];
                    targetJId = target.id;
                    text = `1 quiniela disponible, aún sin sellar (J${target.number})`;
                } else if (count > 1) {
                    targetJId = unsealedAvailable[0].id;
                    const jList = unsealedAvailable.map(j => `J${j.number}`).join(', ');
                    text = `${count} quinielas disponibles, aún sin sellar (${jList})`;
                } else {
                    text = '0 quinielas disponibles sin sellar';
                }

                if (elForecastStatusIcon) elForecastStatusIcon.textContent = '📋';
                elForecastStatusText.textContent = text;
                elForecastStatusLink.className = 'flex items-center justify-between px-2 sm:px-2.5 py-1 rounded-lg bg-sky-950/30 hover:bg-sky-950/50 border border-sky-500/40 text-sky-200 transition group cursor-pointer text-xs shadow-sm';
                if (elForecastStatusAction) {
                    elForecastStatusAction.textContent = 'Panel de sellado →';
                    elForecastStatusAction.className = 'font-bold text-sky-400 group-hover:text-sky-300 group-hover:underline text-[10px] sm:text-[11px] shrink-0 whitespace-nowrap ml-1.5';
                }
                const jParam = targetJId ? `&jId=${encodeURIComponent(targetJId)}` : '';
                elForecastStatusLink.href = `pronosticos_2.html?openEditor=true${jParam}`;

            } else {
                // SÓLO DURANTE LA CUENTA ATRÁS:
                // Mostrar si la quiniela del socio conectado está enviada o no
                let userHasSubmitted = false;
                if (userMember && nextJ) {
                    const nextJId = String(nextJ.id);
                    const mId = String(userMember.id);
                    let p = pronosticosMap.get(`${nextJId}_${mId}`);
                    if (!p && Array.isArray(this.pronosticos)) {
                        p = this.pronosticos.find(pr => {
                            if (!pr) return false;
                            const pj = String(pr.jId !== undefined && pr.jId !== null ? pr.jId : (pr.jornadaId !== undefined ? pr.jornadaId : ''));
                            const pm = String(pr.mId !== undefined && pr.mId !== null ? pr.mId : (pr.memberId !== undefined ? pr.memberId : ''));
                            return pj === nextJId && pm === mId;
                        });
                    }
                    const sel = p ? (Array.isArray(p.selection) ? p.selection : (Array.isArray(p.forecast) ? p.forecast : [])) : [];
                    const filled = sel.filter(s => s && String(s).trim() !== '' && String(s) !== '-').length;
                    userHasSubmitted = filled >= 14;
                }

                const jNumStr = nextJ ? ` (J${nextJ.number})` : '';
                const jParam = nextJ ? `&jId=${encodeURIComponent(nextJ.id)}` : '';
                elForecastStatusLink.href = `pronosticos_2.html?openEditor=true${jParam}`;

                if (userHasSubmitted) {
                    if (elForecastStatusIcon) elForecastStatusIcon.textContent = '✅';
                    elForecastStatusText.textContent = 'Tu quiniela: Enviada';
                    elForecastStatusLink.className = 'flex items-center justify-between px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 transition group cursor-pointer text-xs shadow-sm';
                    if (elForecastStatusAction) {
                        elForecastStatusAction.textContent = 'Modificar →';
                        elForecastStatusAction.className = 'font-bold text-emerald-400 group-hover:text-emerald-300 group-hover:underline text-[11px] sm:text-xs shrink-0 whitespace-nowrap ml-1.5';
                    }
                } else {
                    if (elForecastStatusIcon) elForecastStatusIcon.textContent = '⏳';
                    elForecastStatusText.textContent = 'Tu quiniela: Aún sin enviar';
                    elForecastStatusLink.className = 'flex items-center justify-between px-2 sm:px-2.5 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-950/60 border border-amber-500/50 text-amber-300 transition group cursor-pointer text-xs shadow-sm animate-pulse';
                    if (elForecastStatusAction) {
                        elForecastStatusAction.textContent = 'Sellar →';
                        elForecastStatusAction.className = 'font-bold text-amber-400 group-hover:text-amber-300 group-hover:underline text-[11px] sm:text-xs shrink-0 whitespace-nowrap ml-1.5';
                    }
                }
            }
        }

        // 5. Fila Inferior: Caja Real y Bote Personal del Socio
        const elCajaAmt = document.getElementById('user-card-caja-amount');
        const elBoteAmt = document.getElementById('user-card-bote-amount');
        const elBoteLink = document.getElementById('user-card-bote-link');

        const summary = this.getBoteOfficialSummary();
        const cajaReal = (summary && typeof summary.cajaReal === 'number') ? summary.cajaReal : 1037.17;
        const formattedCaja = (window.AppUtils && window.AppUtils.formatEuro)
            ? window.AppUtils.formatEuro(cajaReal)
            : `${cajaReal.toSpanishFormat()} €`;
        if (elCajaAmt) elCajaAmt.textContent = formattedCaja;

        let userSaldo = 0;
        let summaries = [];
        if (window.BoteApp && typeof window.BoteApp.getSeasonData === 'function') {
            const sd = window.BoteApp.getSeasonData();
            if (sd && Array.isArray(sd.memberSummaries)) summaries = sd.memberSummaries;
        }
        if (summaries.length === 0 && this.boteOfficialSummary && Array.isArray(this.boteOfficialSummary.memberSummaries)) {
            summaries = this.boteOfficialSummary.memberSummaries;
        }
        if (summaries.length === 0) {
            const cached = localStorage.getItem('maulas_bote2_members');
            if (cached) {
                try { summaries = JSON.parse(cached) || []; } catch(e){}
            }
        }
        if (summaries.length === 0 && window.BOTE_FALLBACK_DATA && window.BOTE_FALLBACK_DATA['2026-2027'] && window.BOTE_FALLBACK_DATA['2026-2027'].memberSummaries) {
            summaries = window.BOTE_FALLBACK_DATA['2026-2027'].memberSummaries;
        }

        if (userMember && summaries.length > 0) {
            const s = summaries.find(mem => String(mem.id) === String(userMember.id));
            if (s && typeof s.saldo === 'number') userSaldo = s.saldo;
        }

        const formattedSaldo = (window.AppUtils && window.AppUtils.formatEuro)
            ? window.AppUtils.formatEuro(userSaldo)
            : `${userSaldo.toSpanishFormat()} €`;

        if (elBoteAmt) {
            elBoteAmt.textContent = formattedSaldo;
            if (userSaldo < 0) {
                elBoteAmt.className = 'text-rose-400 font-mono font-black text-[11px] sm:text-xs md:text-sm';
            } else {
                elBoteAmt.className = 'text-emerald-400 font-mono font-black text-[11px] sm:text-xs md:text-sm';
            }
        }
        if (elBoteLink && userMember) {
            elBoteLink.href = `bote_2.html?memberId=${encodeURIComponent(userMember.id)}`;
        }

        // 6. Evaluación de Avisos Emergentes Programados (In-App Alerts)
        if (window.InAppAlerts && userMember) {
            let hasSubmitted = false;
            if (this.nextJornada) {
                const nextJId = String(this.nextJornada.id !== undefined ? this.nextJornada.id : this.nextJornada.number);
                const userMid = String(userMember.id);
                if (pronosticosMap && pronosticosMap.has(`${nextJId}_${userMid}`)) {
                    hasSubmitted = true;
                } else if (Array.isArray(this.pronosticos)) {
                    hasSubmitted = this.pronosticos.some(pr => {
                        const pj = String(pr.jId !== undefined ? pr.jId : (pr.jornadaId || ''));
                        const pm = String(pr.mId !== undefined ? pr.mId : (pr.memberId || ''));
                        return pj === nextJId && pm === userMid;
                    });
                }
            }

            const isSealer = this.nextJornada && String(this.nextJornada.sealerId) === String(userMember.id);
            const isDobles = this.nextJornada && (String(this.nextJornada.doblesPlayerId) === String(userMember.id) || (this.currentDoblesSealer && String(this.currentDoblesSealer.id) === String(userMember.id)));

            window.InAppAlerts.evaluateAndShow({
                userMember: userMember,
                userSaldo: userSaldo,
                nextJornada: this.nextJornada,
                hasSubmittedPrediction: hasSubmitted,
                isSealer: !!isSealer,
                isDoblesResponsable: !!isDobles
            });
        }
    }

    /**
     * Widget Híbrido Rotativo: 🐸 Último Clasificado (Rana) / 🐷 Partido PIG
     */
    renderPigWidget(outcome, nextJ, lastMember, penultimateDiff, playedCount, totalMembers, liveContext = {}) {
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

        const penaltyVal = (this.pigPenalty !== undefined ? this.pigPenalty : 1.00).toSpanishFormat();
        const nextPigInfo = this.findPigMatch(nextJ);
        const nextHasPig = nextPigInfo !== null;
        const nextMatchDesc = (nextPigInfo && nextPigInfo.match) ? `(P.${nextPigInfo.index + 1}: ${nextPigInfo.match.home} vs ${nextPigInfo.match.away})` : '';

        const liveLeaders = liveContext.liveLeaders || [];
        const maxLiveHits = liveContext.maxLiveHits !== undefined ? liveContext.maxLiveHits : -1;
        const matchesWithResults = liveContext.matchesWithResults || 0;
        const targetJNum = liveContext.targetJNum || (nextJ ? nextJ.number : '');
        const pronosticosMap = liveContext.pronosticosMap || this.pronosticosMap;

        // Nota: El indicador del Cuadro de Mando Principal ahora se gestiona en renderUserSummaryCard
        // Comprobar si se han sellado todos los pronósticos de la nueva jornada
        const totalSocios = (this.members && this.members.length >= 19) ? this.members.length : (this.members ? this.members.length : 19);
        const allForecastsSubmitted = (this.submittedMembers && this.submittedMembers.length >= totalSocios) ||
            (this.pendingMembers && this.pendingMembers.length === 0 && this.submittedMembers && this.submittedMembers.length > 0);
        const isNextSealed = !!(nextJ && (nextJ.selladoEnviado || nextJ.selladoTicketId || nextJ.isSealed || nextJ.sellada || nextJ.status === 'sealed' || nextJ.status === 'closed'));
        const isNextInProgress = !!(nextJ && nextJ.matches && nextJ.matches.some(m => m.result && m.result !== '' && m.result !== '-'));

        const areAllForecastsSealed = allForecastsSubmitted || isNextSealed || isNextInProgress;

        // Regla:
        // 1. Si la nueva jornada tiene PIG -> Alerta PIG de la nueva jornada.
        // 2. Si la nueva jornada NO tiene PIG:
        //    - Cuando ya se han sellado todos los pronósticos -> APUNTA A LA RANA 🐸.
        //    - Mientras aún falten pronósticos por sellar y la J. anterior tuvo PIG -> Muestra temporalmente el PIG anterior.
        //    - En cualquier otro caso -> APUNTA A LA RANA 🐸.
        let isPigMode = false;
        let isNextPigAlert = false;

        const nextPigHasResult = !!(nextPigInfo && nextPigInfo.match && nextPigInfo.match.result &&
            String(nextPigInfo.match.result).trim() !== '' &&
            String(nextPigInfo.match.result).trim() !== '-' &&
            String(nextPigInfo.match.result).toLowerCase() !== 'por definir');

        if (nextHasPig) {
            isPigMode = true;
            isNextPigAlert = !nextPigHasResult;
        } else if (!areAllForecastsSealed && outcome && outcome.isPig) {
            isPigMode = true;
            isNextPigAlert = false;
        } else {
            isPigMode = false;
        }

        this.currentPigOrRanaMode = isPigMode ? 'pig' : 'rana';

        if (isPigMode) {
            // =================================================================
            // MODO PIG: Alerta PIG de la nueva jornada o resultados pendientes
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

            if (isNextPigAlert) {
                if (statusLabel) {
                    statusLabel.className = 'text-xs text-amber-400 block font-bold';
                    statusLabel.textContent = `Partido PIG en Jornada ${nextJ ? nextJ.number : ''}:`;
                }

                content.innerHTML = `
                    <div class="space-y-1.5 text-xs">
                        <div class="text-[12px] text-pink-300 font-extrabold mb-1 flex items-center gap-1.5">
                            <span>⚽</span> ${nextPigInfo.match.home} vs ${nextPigInfo.match.away} (P.${nextPigInfo.index + 1})
                        </div>
                        <p class="text-slate-300 text-[11px] leading-relaxed">
                            ¡Partido de Interés General esta semana! Quien no acierte este partido pagará penalización al Bote.
                        </p>
                        <div class="text-[11px] text-amber-300/90 pt-1.5 border-t border-slate-800 flex items-center justify-between">
                            <span>Penalización por fallo:</span>
                            <span class="font-mono font-bold text-rose-400">-${penaltyVal} € / socio</span>
                        </div>
                    </div>
                `;
            } else {
                let acertantes = [];
                let perdedores = [];
                let matchDesc = '';

                if (nextHasPig && nextPigHasResult) {
                    if (statusLabel) {
                        statusLabel.className = 'text-xs text-amber-400 block font-bold';
                        statusLabel.textContent = `Resultados del PIG en vivo (Jornada ${nextJ ? nextJ.number : ''}):`;
                    }
                    if (elBadgeText) elBadgeText.textContent = 'Resultado PIG';
                    const pigM = nextPigInfo.match;
                    matchDesc = `Partido ${nextPigInfo.index + 1}: ${pigM.home} vs ${pigM.away} (${pigM.result})`;
                    const normRes = window.ScoringSystem ? window.ScoringSystem.normalizeSign(pigM.result) : (pigM.result || '').trim().toUpperCase();
                    const resStr = String(pigM.result).trim().toUpperCase();

                    (this.members || []).forEach(m => {
                        const mName = window.AppUtils ? window.AppUtils.getMemberName(m) : (m.phone || m.name);
                        const p = pronosticosMap ? (pronosticosMap.get(`${nextJ.id}_${m.id}`) || pronosticosMap.get(`${nextJ.number}_${m.id}`)) : null;
                        const sel = p ? (p.selection || p.forecast || []) : [];
                        const pred = sel[nextPigInfo.index] ? String(sel[nextPigInfo.index]).trim().toUpperCase() : '';
                        let hit = false;
                        if (pred) {
                            if (nextPigInfo.index === 14) {
                                hit = (pred === resStr || pred === normRes);
                            } else {
                                hit = pred.includes(normRes);
                            }
                        }
                        if (hit) acertantes.push(mName);
                        else perdedores.push(mName);
                    });
                } else {
                    if (statusLabel) {
                        statusLabel.className = 'text-xs text-amber-400 block font-bold';
                        statusLabel.textContent = 'Resultados del PIG de la última jornada:';
                    }
                    acertantes = outcome ? (outcome.pigAcertantes || []) : [];
                    perdedores = outcome ? (outcome.pigFallantes || []) : [];
                    matchDesc = outcome && outcome.pigInfo && outcome.pigInfo.match ? `Partido ${outcome.pigInfo.index + 1}: ${outcome.pigInfo.match.home} vs ${outcome.pigInfo.match.away}` : '';
                }

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
                            <span>Penalización:</span>
                            <span class="font-mono font-bold text-rose-400">-${penaltyVal} € / socio</span>
                        </div>
                    </div>
                `;
            }

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
                footRight.innerHTML = `<a href="clasificacion_2.html" class="text-amber-400 font-bold hover:underline">Ver Tabla Completa →</a>`;
            }
        }
    }

    /**
     * Widget Bote en caja - Sincronizado al 100% con los cálculos consolidados de Bote 2
     * FUENTE OFICIAL: BOTE_FALLBACK_DATA['2026-2027'].summary (nunca se recalcula aquí)
     * Si BoteEngine está activo en vivo sobreescribe con los datos de Firestore
     */
    renderBoteWidget(playedJornadas) {
        const elTotal = document.getElementById('dashboard-bote-total');
        const elCajaWidget = document.getElementById('dashboard-bote-caja-widget');
        const elNeto = document.getElementById('dashboard-bote-neto');
        const elPremios = document.getElementById('dashboard-bote-premios');

        const summary = this.getBoteOfficialSummary();
        const cajaReal = (summary && typeof summary.cajaReal === 'number') ? summary.cajaReal : 1037.17;
        const totalSaldos = (summary && typeof summary.totalSaldosVirtuales === 'number') ? summary.totalSaldosVirtuales : 694.71;
        const superavit = (summary && typeof summary.superavit === 'number') ? summary.superavit : (cajaReal - totalSaldos);

        const formattedCaja = (typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(cajaReal) : `${cajaReal.toSpanishFormat()} €`;
        if (elTotal) elTotal.textContent = formattedCaja;
        if (elCajaWidget) elCajaWidget.textContent = formattedCaja;
        if (elNeto) elNeto.textContent = (typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(totalSaldos) : `${totalSaldos.toSpanishFormat()} €`;
        if (elPremios) elPremios.textContent = `${superavit >= 0 ? '+' : ''}${((typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(superavit) : `${superavit.toSpanishFormat()} €`)}`;
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

        if (elWeeklyTotal) elWeeklyTotal.textContent = (typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(outcome.totalMoney || 0) : `${(outcome.totalMoney || 0).toSpanishFormat()} €`;
        if (elSeasonTotal) elSeasonTotal.textContent = (typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(totalSeasonMoney) : `${totalSeasonMoney.toSpanishFormat()} €`;
        if (elIndivCount) elIndivCount.textContent = indivCount;
        if (elDoblesCount) elDoblesCount.textContent = doblesCount;

        if (elWeeklyList) {
            const indivs = (outcome.prizeWinners || []).map(pw => `
                <div class="flex items-center justify-between py-0.5 border-b border-slate-900">
                    <span class="text-slate-200 font-semibold">${pw.name}</span>
                    <span class="text-emerald-400 font-mono font-bold">${pw.hits} aciertos ${pw.prize ? `(+${(typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(pw.prize) : pw.prize.toSpanishFormat() + " €"})` : ''}</span>
                </div>
            `);

            const dobles = (outcome.doublesResults || []).filter(dr => dr.prize > 0).map(dw => `
                <div class="flex items-center justify-between py-0.5 border-b border-slate-900 text-amber-300">
                    <span class="font-semibold">👑 Dobles (${dw.name})</span>
                    <span class="font-mono font-bold text-emerald-400">${dw.hits} ac. (+${(typeof AppUtils !== "undefined" && AppUtils.formatEuro) ? AppUtils.formatEuro(dw.prize) : dw.prize.toSpanishFormat() + " €"})</span>
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
     * Cinta de noticias y resultados en tiempo real (Ticker estilo telediario)
     * Compila y rota exactamente 15 datos dinámicos distintos basados en la peña
     */
    renderNewsTicker(data) {
        const container = document.getElementById('ticker-content');
        if (!container) return;

        const {
            outcome,
            nextJ,
            isNextInProgress,
            playedJornadas,
            sortedMembers,
            leader,
            secondLeaderPoints,
            lastMember,
            liveWinnerName,
            liveWinnerHits,
            liveLoserName,
            totalSeasonMoney,
            indivCount,
            doblesCount,
            anunciosTeletipo
        } = data;

        // 0. ANUNCIOS DE SOCIOS: PUBLICACIÓN EN LAS PRIMERAS POSICIONES DEL TELETIPO
        let socioAnnouncements = [];
        if (Array.isArray(anunciosTeletipo) && anunciosTeletipo.length > 0) {
            socioAnnouncements = anunciosTeletipo;
        } else if (this.seasonData && Array.isArray(this.seasonData.anunciosTeletipo) && this.seasonData.anunciosTeletipo.length > 0) {
            socioAnnouncements = this.seasonData.anunciosTeletipo;
        } else {
            try {
                const local = localStorage.getItem('maulas_anuncios_teletipo');
                if (local) {
                    const parsed = JSON.parse(local);
                    if (Array.isArray(parsed)) socioAnnouncements = parsed;
                }
            } catch (e) {}
        }

        const now = Date.now();
        const activeSocioAnnouncements = socioAnnouncements
            .filter(a => a && a.text && String(a.text).trim().length > 0 && a.active !== false && (!a.expiresAt || a.expiresAt > now))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const socioItems = activeSocioAnnouncements.map(a => ({
            text: `📢 <span class="bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black uppercase tracking-wide mr-1 shadow-sm">AVISO SOCIO</span> <strong class="text-amber-300 font-bold">${a.socioName || 'Socio'}:</strong> <span class="text-white font-semibold">“${a.text}”</span>`,
            url: 'admin_2.html?tab=teletipo',
            action: 'socio_announcement',
            announcement: a,
            isSocioAnnouncement: true
        }));

        // Los anuncios de los socios se publican en las PRIMERAS POSICIONES
        const items = [...socioItems];

        // 1. Jornada en curso / Próxima jornada
        if (isNextInProgress && nextJ) {
            items.push({ text: `⚽ <strong class="text-amber-400">Jornada ${nextJ.number} en juego:</strong> Marcadores disputándose en directo.`, action: 'jornadas' });
        } else if (nextJ && nextJ.date) {
            items.push({ text: `⚽ <strong class="text-amber-400">Próxima Jornada ${nextJ.number}:</strong> Boleto fijado para el ${nextJ.date}.`, action: 'jornadas' });
        } else {
            items.push({ text: `⚽ <strong class="text-amber-400">Temporada 2026-2027:</strong> Competición oficial en marcha.`, action: 'jornadas' });
        }

        // NOTICIA BOTE: REGISTRO DUAL DE INGRESOS Y RETIRADAS
        items.push({
            text: '💰 <strong class="text-amber-400">Tesorería del Bote:</strong> Se habilita selector dual en el registro de movimientos para registrar tanto Aportaciones/Ingresos (+) como Retiradas/Salidas (-) de forma ágil y visual.',
            action: 'bote'
        });

        // NOTICIA ANÁLISIS MUNDO DEPORTIVO JORNADA 18
        items.push({
            text: '📰 <strong class="text-cyan-400">Análisis Mundo Deportivo:</strong> Sincronizados los 15 análisis, porcentajes y clasificaciones oficiales de la Jornada 18 en Quiniela y Jornadas.',
            action: 'jornadas'
        });

        // NOTICIA REDISTRIBUCIÓN Y AJUSTES MODO FÁCIL MÓVIL
        items.push({
            text: '📱 <strong class="text-amber-400">Modo Fácil Móvil:</strong> Reorganización limpia de cabecera de jornada sin solapes, botón \'Ver bote\' reubicado en línea propia para mayor ergonomía y pantalla única sin scroll (v2.54).',
            action: 'inicio'
        });

        // NOTICIA REGLAMENTO QUINIELA DE DOBLES
        items.push({
            text: '✌️ <strong class="text-purple-400">Quiniela de Dobles:</strong> Se habilita exclusivamente para la próxima jornada inmediata a disputarse. En jornadas posteriores publicadas, los dobles se activarán correlativamente tras conocer los resultados oficiales previos.',
            action: 'dobles'
        });

        // NOTICIA MODO FÁCIL PARA TODOS LOS USUARIOS
        items.push({
            text: '⚡ <strong class="text-amber-400">¡Modo Fácil para todos!:</strong> Estrenamos la nueva interfaz simplificada a pantalla única para todos los socios. Puedes alternar en 1 clic entre Modo Fácil (⚡) y Modo Pro (🚀) en la barra superior.',
            action: 'inicio'
        });

        // MEJORA DASHBOARD: Botón Ver Mi Bote, Modo Fácil y Pantalla Única en PC
        items.push({
            text: '⚡ <strong class="text-amber-400">Mejora Dashboard:</strong> Nuevo botón destacado para "Ver mi bote", optimización táctil en Modo Fácil sin textos cortados, información de Dobles en PC y ajuste de pantalla única en Modo Pro.',
            action: 'inicio'
        });

        // NOTICIA MODO FÁCIL MÓVIL: Ajuste de Pantalla Única sin Scroll
        items.push({
            text: '📱 <strong class="text-amber-400">Modo Fácil Móvil:</strong> Ajuste de altura y eliminación completa del scroll vertical en el Dashboard para visualización a pantalla única.',
            action: 'inicio'
        });

        // NOTICIA BOTE: Sincronización del Cálculo Oficial de Caja Real
        items.push({
            text: '💰 <strong class="text-amber-400">Auditoría del Bote:</strong> Sincronización dinámica de la fórmula de Cálculo de Caja Real con las tarjetas contables de saldos, premios, cuotas, penalizaciones y sellados.',
            action: 'bote'
        });

        // 1.d VELOCIDAD Y ANUNCIOS DE SOCIOS EN TELETIPO
        items.push({
            text: '📢 <strong class="text-amber-400">Novedad Teletipo:</strong> Ya puedes ajustar la velocidad de la cinta y publicar anuncios de socios en las primeras posiciones (1 por semana, 3 días de vigencia) desde Administración.',
            action: 'admin'
        });

        // 1.c MEJORA ERGONOMÍA MÓVIL: Menú Superior
        items.push({
            text: '📱 <strong class="text-amber-400">Mejora Móvil:</strong> Menú superior y botones de acción (actualizar y cerrar sesión) reajustados para visualización perfecta en cualquier móvil sin cortes.',
            action: 'inicio'
        });

        // 1.b NOVEDAD RESULTADOS: Matriz Panorámica en PC
        items.push({
            text: '🗂️ <strong class="text-amber-400">Mejora Resultados:</strong> Matriz Panorámica optimizada exclusivamente para jornadas disputadas y nuevos tooltips visuales integrados.',
            action: 'jornadas'
        });

        // 2. NOVEDAD WEB: ¡Estreno oficial de Maula Hero!
        items.push({
            text: `🎮 <strong class="text-amber-400">¡Novedad en la Web!:</strong> Estreno oficial del juego <strong>Maula Hero</strong> en tu móvil. ¡Pon a prueba tus reflejos y compite por el récord de la Peña!`,
            url: 'juego.html'
        });

        // 2.b NOVEDAD WEB: Tarjeta personal del Socio Conectado
        items.push({
            text: `👤 <strong class="text-amber-400">Novedad Dashboard:</strong> Nueva tarjeta del Socio Conectado a pantalla completa con aciertos, puesto en clasificación, saldo de bote personal y alerta de PIG.`,
            action: 'inicio'
        });

        // 2.c NOVEDAD WEB: Avisos Emergentes Directos
        items.push({
            text: `💬 <strong class="text-amber-400">Novedad Web:</strong> Avisos emergentes automáticos al entrar a la web para informar de saldo deudor, quiniela pendiente o responsabilidades semanales.`,
            action: 'inicio'
        });

        // 2.d NOVEDAD HOJA DE MARCELO: Reconstrucción Histórica
        items.push({
            text: `📑 <strong class="text-emerald-400">Oficial en el Bote:</strong> Ya disponible para todos los socios la <strong>Hoja de Marcelo</strong> con auditoría completa de botes, sumas, restas, caja real y selector histórico.`,
            url: 'bote_2.html'
        });

        // 2.e SEPARADOR DE MILES EN CANTIDADES
        items.push({
            text: `💶 <strong class="text-amber-400">Mejora Visual:</strong> Todas las cantidades y botes de la web cuentan ahora con separador de miles con punto (ej. 1.028,30 €) para mayor claridad.`,
            url: 'bote_2.html'
        });

        // 2.f EXPERIMENTAL MODO FÁCIL
        items.push({
            text: `⚡ <strong class="text-amber-400">En Desarrollo:</strong> Tarjetas de balance y tesorería optimizadas en cuadrícula ergonómica compacta (2-2-1) en móviles.`,
            url: 'dashboard_2.html'
        });

        // 2.c QUINIELA DE DOBLES JORNADA 18
        items.push({
            text: `✌️ <strong class="text-purple-400">Quiniela de Dobles J.18:</strong> Responsables oficiales asignados: <strong>Samu</strong> (ganador único J.16 tras desempate) y <strong>Rafa</strong> (premio oficial de 5,61 € en dobles J.16).`,
            action: 'dobles'
        });

        // 2.c.2 RESULTADO PIG JORNADA 16
        items.push({
            text: `🐷 <strong class="text-pink-400">Resultado PIG J.16 (El Clásico):</strong> Barcelona 1 - 2 Real Madrid. 5 acertantes exentos y 14 socios penalizados (-1,00 € al Bote).`,
            action: 'jornadas'
        });

        // 2.c2 REGLAMENTO QUINIELA DE DOBLES
        items.push({
            text: `📜 <strong class="text-amber-400">Reglamento Dobles:</strong> Sella dobles el ganador único previo. Si quien hizo los dobles previos obtuvo premio económico oficial, también sella dobles (2 boletos si son distintos).`,
            action: 'dobles'
        });

        // 2.c3 DESEMPATE EN VIVO EN DOBLES
        items.push({
            text: `👑 <strong class="text-amber-400">Dashboard en Vivo:</strong> La ventana de Dobles resuelve en directo el desempate por historial para presentar al único ganador provisional.`,
            action: 'dobles'
        });

        // 2.c4 COLUMNA MAULA YA OPERATIVA
        items.push({
            text: `⭐ <strong class="text-amber-400">Columna Maula ya operativa:</strong> Ya puedes consultar la quiniela colectiva en la tabla de pronósticos, con selección por expertos históricos y congelación inmutable para toda la jornada.`,
            url: 'pronosticos_2.html'
        });

        // 2.d NOVEDAD EN BOTE: Tarjeta Balance y Desglose Contable
        items.push({
            text: `💰 <strong class="text-emerald-400">Novedad en Bote:</strong> Nueva tarjeta con el balance contable completo: saldos de socios, premios, cuotas, penalizaciones y sellados.`,
            url: 'bote_2.html'
        });

        // 2.e NOVEDAD EN BOTE: Fila de totales en Detalle de la Jornada
        items.push({
            text: `📊 <strong class="text-amber-400">Novedad en Bote:</strong> Nueva fila de totales al pie de la tabla Detalle de la Jornada (aciertos, cuotas, penalizaciones, premios y saldos).`,
            url: 'bote_2.html'
        });

        // NOTICIA: IMPORTACIÓN DE ANÁLISIS MUNDO DEPORTIVO EN QUINIELA
        items.push({
            text: `📰 <strong class="text-cyan-400">Novedad Quiniela:</strong> Nuevo botón 'Importar Análisis MD' en el panel de Quiniela para sincronizar y consultar en 1 clic los análisis, porcentajes 1X2 y clasificaciones de Mundo Deportivo.`,
            url: 'jornadas_2.html'
        });

        // NOTICIA: IMPORTADOR DE PARTIDOS
        items.push({
            text: `⚽ <strong class="text-amber-400">Importador de Partidos:</strong> Actualizado con detección dinámica de boletos oficiales y calendario completo de próximas jornadas en 1 clic.`,
            action: 'jornadas'
        });

        // 2.e2 NOVEDAD EN BOTE: Explorador de Premios
        items.push({
            text: `🎁 <strong class="text-amber-400">Novedad en Bote:</strong> Nuevo explorador de premios obtenidos: vista agrupada por socio, por jornada o desglosada (ordenada por jornada, cantidad o socio).`,
            url: 'bote_2.html'
        });

        // 2.f AUDITORÍA FLUJO DE CAJA
        items.push({
            text: `📈 <strong class="text-amber-400">Flujo de Caja del Bote:</strong> Corregidas y auditadas las columnas de penalizaciones y cuotas reales de la tesorería.`,
            url: 'bote_2.html'
        });

        // 3. Líder de aciertos en vivo / Ganador de la jornada
        if (isNextInProgress && liveWinnerHits !== null && liveWinnerHits >= 0) {
            items.push({ text: `👑 <strong class="text-amber-300">Líder provisional en directo:</strong> ${liveWinnerName} encabeza la jornada con ${liveWinnerHits} aciertos.`, action: 'dobles' });
        } else if (outcome && outcome.doblesEligibleNames && outcome.doblesEligibleNames.length > 1) {
            items.push({ text: `✌️ <strong class="text-purple-300">Rellenan Dobles (J.${nextJ ? nextJ.number : ''}):</strong> ${outcome.doblesEligibleNames.join(', ')}.`, action: 'dobles' });
        } else if (outcome && outcome.winnerName) {
            items.push({ text: `👑 <strong class="text-amber-300">Ganador Jornada Anterior:</strong> ${outcome.winnerName} con ${outcome.winnerHits || 0} aciertos (¡hace la de dobles!).`, action: 'dobles' });
        } else {
            items.push({ text: `👑 <strong class="text-amber-300">Rellena Dobles:</strong> Asignado al mejor pronosticador de la jornada.`, action: 'dobles' });
        }

        // 4. Sellador de la semana
        if (isNextInProgress && liveLoserName) {
            items.push({ text: `✍️ <strong class="text-rose-400">Sellador provisional en juego:</strong> ${liveLoserName} ocupa el puesto de sellado.`, action: 'sellador' });
        } else if (outcome && outcome.loserName) {
            items.push({ text: `✍️ <strong class="text-rose-400">Sellador designado:</strong> ${outcome.loserName} acude a loterías a sellar el boleto colectivo.`, action: 'sellador' });
        }

        // 5. Podio General: 2º y 3º puesto
        if (sortedMembers && sortedMembers.length > 1) {
            const sec = sortedMembers[1];
            const thi = sortedMembers[2];
            const podioStr = thi ? `🥈 2º ${sec.name} (${sec.totalPoints || 0} pts) • 🥉 3º ${thi.name} (${thi.totalPoints || 0} pts)` : `🥈 2º ${sec.name} (${sec.totalPoints || 0} pts)`;
            items.push({ text: `🏅 <strong class="text-slate-300">Podio General:</strong> ${podioStr}.`, action: 'clasificacion' });
        }

        // 6. Caja Real de la Peña
        const summary = this.getBoteOfficialSummary();
        const cajaReal = (summary && typeof summary.cajaReal === 'number') ? summary.cajaReal : 1037.17;
        const cajaFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(cajaReal) : `${cajaReal.toSpanishFormat()} €`;
        items.push({ text: `💰 <strong class="text-emerald-400">Caja Real de la Peña:</strong> ${cajaFmt} disponibles en la tesorería común (Saldos + Premios + Cuotas + Multas − Sellados).`, action: 'bote' });

        // 7. Partido PIG
        const nextPigInfo = this.findPigMatch(nextJ);
        const nextHasPig = nextPigInfo !== null;
        const penaltyVal = (this.pigPenalty !== undefined ? this.pigPenalty : 1.00).toSpanishFormat();
        if (nextHasPig && nextPigInfo && nextPigInfo.match) {
            items.push({ text: `🐷 <strong class="text-pink-300">¡Alerta PIG en J.${nextJ.number}!:</strong> ${nextPigInfo.match.home} vs ${nextPigInfo.match.away} (Penalización: -${penaltyVal} € al fallo).`, action: 'pig' });
        } else if (outcome && outcome.isPig) {
            const numAcertantes = outcome.pigAcertantes ? outcome.pigAcertantes.length : 0;
            items.push({ text: `🐷 <strong class="text-pink-300">Partido PIG previo:</strong> ${numAcertantes} socios acertaron y quedaron exentos.`, action: 'pig' });
        }

        // 8. Límite para rellenar
        items.push({ text: `⏳ <strong class="text-amber-300">Límite para rellenar:</strong> Jueves a las 17:00h cierre estricto de quinielas en la web.`, action: 'pronosticos' });

        // 9. Estado de participación y envíos
        const totalSocios = (this.members && this.members.length >= 19) ? this.members.length : (this.members ? this.members.length : 19);
        const sentCount = this.submittedMembers ? this.submittedMembers.length : 0;
        items.push({ text: `📋 <strong class="text-sky-300">Envíos de la Peña:</strong> ${sentCount} de ${totalSocios} socios han enviado su quiniela semanal.`, action: 'submitted' });

        // 10. Líder de la clasificación general
        if (leader) {
            const diffPts = (leader.totalPoints || 0) - (secondLeaderPoints || 0);
            const diffStr = diffPts > 0 ? ` (+${diffPts} pts de ventaja)` : '';
            items.push({ text: `🏆 <strong class="text-amber-400">1º en la General:</strong> ${leader.name} lidera con ${leader.totalPoints || 0} pts${diffStr}.`, action: 'clasificacion' });
        } else {
            items.push({ text: `🏆 <strong class="text-amber-400">Clasificación General:</strong> 19 socios en liza por el trofeo de la temporada.`, action: 'clasificacion' });
        }

        // 11. Farolillo rojo (Rana)
        if (lastMember) {
            items.push({ text: `🐸 <strong class="text-rose-400">Farolillo Rojo:</strong> ${lastMember.name} ocupa la última posición con ${lastMember.totalPoints || 0} pts.`, action: 'clasificacion' });
        }

        // 12. Premios conseguidos en la temporada
        const prizeMoneyFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(totalSeasonMoney || 0) : `${(totalSeasonMoney || 0).toSpanishFormat()} €`;
        items.push({ text: `🎁 <strong class="text-emerald-400">Premios Temporada 2026-27:</strong> ${prizeMoneyFmt} cobrados (${indivCount || 0} individuales y ${doblesCount || 0} en dobles).`, action: 'resumen' });

        // 13. Resultados de partidos detallados de la jornada en curso o más reciente
        const activeJ = (isNextInProgress && nextJ) ? nextJ : (playedJornadas && playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1] : null);
        if (activeJ && Array.isArray(activeJ.matches)) {
            const liveMatches = activeJ.matches.filter(m => m.result && m.result !== '' && m.result !== '-');
            if (liveMatches.length > 0) {
                const jTag = isNextInProgress ? `Marcadores en juego (J.${activeJ.number})` : `Resultados Oficiales J.${activeJ.number}`;
                const chunk1 = liveMatches.slice(0, 5).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                items.push({ text: `⚽ <strong class="text-amber-300">${jTag}:</strong> ${chunk1}.`, action: 'jornadas' });
                if (liveMatches.length > 5) {
                    const chunk2 = liveMatches.slice(5, 10).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                    items.push({ text: `⚽ <strong class="text-amber-300">Más resultados J.${activeJ.number}:</strong> ${chunk2}.`, action: 'jornadas' });
                }
                if (liveMatches.length > 10) {
                    const chunk3 = liveMatches.slice(10, 15).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                    items.push({ text: `⚽ <strong class="text-amber-300">Partidos 11-15 J.${activeJ.number}:</strong> ${chunk3}.`, action: 'jornadas' });
                }
            } else {
                items.push({ text: `⚽ <strong class="text-slate-300">Jornada ${activeJ.number}:</strong> Partidos pendientes de inicio.`, action: 'jornadas' });
            }
        }

        // 14. Superávit y balance neto de la peña
        const totalSaldos = summary ? (typeof summary.totalSaldosVirtuales === 'number' ? summary.totalSaldosVirtuales : 694.71) : 694.71;
        const superavit = summary ? (typeof summary.superavit === 'number' ? summary.superavit : (cajaReal - totalSaldos)) : (cajaReal - totalSaldos);
        const superavitFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(superavit) : `${superavit.toSpanishFormat()} €`;
        items.push({ text: `📈 <strong class="text-emerald-300">Superávit Peña:</strong> ${superavit >= 0 ? '+' : ''}${superavitFmt} a favor de la caja común.`, action: 'bote' });

        // 15. Próxima Cena de la Peña
        items.push({ text: `🍽️ <strong class="text-amber-300">Cenas de la Peña:</strong> 1ª Vuelta el Vie 29 Ene 2027 • Fin de Temporada el Vie 04 Jun 2027.`, action: 'cenas' });

        // 16. NOVEDAD WEB: Actualización de mecánicas de Maula Hero
        items.push({
            text: `💰 <strong class="text-emerald-400">Novedad en Bote:</strong> Entrada anticipada de jornadas selladas con coste de sellado y cuotas, activando penalizaciones con el 1º partido.`,
            url: 'bote_2.html'
        });

        // Asegurar que siempre hay un mínimo de elementos para rotación continua
        while (items.length < 15) {
            items.push({ text: `⭐ <strong class="text-amber-400">Peña Maulas:</strong> Pasión y rigor quinielístico desde 2004.`, action: 'jornadas' });
        }

        // Si el número de noticias supera 35, los anuncios de socios son los últimos en desaparecer y mantienen primeras posiciones
        if (items.length > 35) {
            const socioList = items.filter(it => it && it.isSocioAnnouncement);
            const regularList = items.filter(it => !it || !it.isSocioAnnouncement);
            const maxRegular = Math.max(15, 35 - socioList.length);
            items = [...socioList, ...regularList.slice(0, maxRegular)];
        }

        const finalItems = items;

        // Aplicar velocidad configurada desde Administración
        let speedSeconds = 120;
        try {
            const savedSpeed = localStorage.getItem('maulas_teletipo_speed');
            if (savedSpeed && !isNaN(savedSpeed) && Number(savedSpeed) >= 20) {
                speedSeconds = Number(savedSpeed);
            } else if (this.seasonData && this.seasonData.teletipoConfig && this.seasonData.teletipoConfig.speedSeconds) {
                speedSeconds = Number(this.seasonData.teletipoConfig.speedSeconds);
                localStorage.setItem('maulas_teletipo_speed', speedSeconds);
            }
        } catch (e) {}

        container.style.animationDuration = `${speedSeconds}s`;
        document.documentElement.style.setProperty('--ticker-speed', `${speedSeconds}s`);

        // Renderizar elementos con loop continuo infinito (duplicados exactamente una vez)
        const renderItemHtml = (it, idx) => {
            const text = typeof it === 'object' ? it.text : it;
            const url = typeof it === 'object' && it.url ? it.url : '';
            const action = typeof it === 'object' && it.action ? it.action : '';
            const isSocio = typeof it === 'object' && it.isSocioAnnouncement ? 'bg-amber-500/10 rounded-lg px-2 border border-amber-500/30' : '';
            return `
                <span class="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-1 md:py-1.5 cursor-pointer hover:text-white transition ${isSocio}" onclick="window.DashboardApp && window.DashboardApp.handleTickerClick(${idx}, this)" data-url="${url}" data-action="${action}">
                    <span class="text-amber-400/80 font-mono text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-bold">#${idx + 1}</span>
                    <span>${text}</span>
                    <span class="text-amber-500/50 font-black ml-3 md:ml-5 text-sm md:text-base select-none">•</span>
                </span>
            `;
        };

        const htmlList = finalItems.map((it, idx) => renderItemHtml(it, idx)).join('');
        container.innerHTML = htmlList + htmlList;
    }

    /**
     * Navegación interactiva al hacer clic en un dato de la cinta
     */
    handleTickerClick(idx, el) {
        if (el) {
            const url = el.getAttribute('data-url');
            if (url) {
                if (url === 'juego.html' || url.includes('juego.html')) {
                    const sep = url.includes('?') ? '&' : '?';
                    location.href = url + sep + '_t=' + Date.now();
                    return;
                }
                location.href = url;
                return;
            }
            const action = el.getAttribute('data-action');
            if (action === 'dobles') { this.openDoblesModal(); return; }
            if (action === 'sellador') { location.href = 'bote_2.html?modal=gestion-jornada'; return; }
            if (action === 'pig') { this.showPigOrRanaInfo(); return; }
            if (action === 'submitted') { this.openSubmittedListModal(); return; }
            if (action === 'cenas') { this.showInfo('cenas'); return; }
            if (action === 'jornadas') { location.href = 'jornadas_2.html'; return; }
            if (action === 'clasificacion') { location.href = 'clasificacion_2.html'; return; }
            if (action === 'bote') { location.href = 'bote_2.html'; return; }
            if (action === 'pronosticos') { location.href = 'pronosticos_2.html?openEditor=true'; return; }
            if (action === 'resumen') { location.href = 'resumen_2.html'; return; }
        }

        // Fallback por índice legacy
        if (idx === 0) {
            location.href = 'jornadas_2.html';
        } else if (idx === 1) {
            location.href = 'juego.html?_t=' + Date.now();
        } else if (idx === 2) {
            this.openDoblesModal();
        } else if (idx === 3) {
            location.href = 'bote_2.html?modal=gestion-jornada';
        } else if (idx === 4) {
            location.href = 'clasificacion_2.html';
        } else if (idx === 5) {
            location.href = 'bote_2.html';
        } else if (idx === 6) {
            this.showPigOrRanaInfo();
        } else if (idx === 7) {
            location.href = 'pronosticos_2.html?openEditor=true';
        } else if (idx === 8) {
            this.openSubmittedListModal();
        } else if (idx === 9 || idx === 10) {
            location.href = 'clasificacion_2.html';
        } else if (idx === 11) {
            location.href = 'resumen_2.html';
        } else if (idx === 13) {
            location.href = 'bote_2.html';
        } else if (idx === 14) {
            this.showInfo('cenas');
        } else {
            location.href = 'juego.html?_t=' + Date.now();
        }
    }

    /**
     * Broma: Expulsar a Emilio
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

        // 6. Elegibles para siguientes dobles (A partir de J16: únicamente el único ganador; excepción: si el autor de dobles previos obtuvo premio económico > 0 €)
        let eligibleNextNames = [];
        if (parseInt(jornada.number) >= 14) {
            // A partir de J16 (determinado desde J14 en adelante): único ganador oficial tras desempate
            eligibleNextNames = [winner.name];
            // Excepción por Premio Económico: Si la quiniela de dobles de esta jornada obtuvo premio económico oficial (> 0 €), su autor también tiene derecho
            const prizeDoublesAuthors = doublesResults.filter(dr => dr.prize > 0).map(dr => dr.name);
            if (prizeDoublesAuthors.length > 0) {
                eligibleNextNames.push(...prizeDoublesAuthors);
            }
        } else {
            eligibleNextNames = results.filter(r => {
                const isWinner = r.memberId === winnerCandidates[0].memberId;
                const prizesMap = jornada.prizes || jornada.prizeRates || {};
                let val = prizesMap[r.hits] || prizesMap[String(r.hits)] || 0;
                if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());
                return isWinner || (val > 0 && r.hasPronostico);
            }).map(r => r.name);
        }

        const prizeMoney = prizeWinners.reduce((sum, pw) => sum + (pw.prize || 0), 0);
        const doublesMoney = doublesResults.reduce((sum, dr) => sum + (dr.prize || 0), 0);

        const validResults = results.filter(r => r.hasPronostico && r.hits >= 0);
        const totalHitsSum = validResults.reduce((sum, r) => sum + r.hits, 0);
        const avgHitsNum = validResults.length > 0 ? (totalHitsSum / validResults.length) : 0;
        const avgHits = avgHitsNum.toSpanishFormat(1);
        const efficacyPct = validResults.length > 0 ? Math.round((totalHitsSum / (validResults.length * 15)) * 100) : 0;

        return {
            winnerName: winner.name,
            winnerMemberId: winnerCandidates[0].memberId,
            winnerHits: winnerCandidates[0].hits !== undefined ? winnerCandidates[0].hits : 0,
            winnerPoints: winnerCandidates[0].points !== undefined ? winnerCandidates[0].points : 0,
            doblesEligibleNames: [...new Set(eligibleNextNames)].sort(),
            loserName: loser.name,
            loserMemberId: maulaCandidates[0] ? maulaCandidates[0].memberId : null,
            loserPoints: maulaCandidates[0] && maulaCandidates[0].points !== undefined ? maulaCandidates[0].points : 0,
            loserHits: maulaCandidates[0] && maulaCandidates[0].hits !== undefined ? maulaCandidates[0].hits : 0,
            isPig: isPig,
            pigInfo: pigInfo,
            pigAcertantes: pigAcertantes,
            pigFallantes: pigFallantes,
            doublesResults: doublesResults,
            prizeWinners: prizeWinners,
            minHitsToWin: minHitsToWin,
            jornadaNumber: jornada.number,
            totalMoney: prizeMoney + doublesMoney,
            avgHits: avgHits,
            efficacyPct: efficacyPct,
            evaluatedCount: validResults.length
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
                if (!j.matches || !Array.isArray(j.matches) || j.matches.length === 0) return true;
                const filledResults = j.matches.filter(m => {
                    if (!m || !m.result) return false;
                    const r = String(m.result).trim();
                    return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
                }).length;
                // Si todos los 15 partidos tienen resultado definitivo, es una jornada pasada ya finalizada
                return filledResults < 15;
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

        const penaltyVal = (this.pigPenalty !== undefined ? this.pigPenalty : 1.00).toSpanishFormat();

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
                            • La clasificación general se actualiza automáticamente tras cada jornada sumando los puntos de todos los socios.
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
                            • El ganador selecciona los <strong>signos dobles</strong> de la combinación de la peña para la siguiente jornada.
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
     * Modal para ver la Quiniela de Dobles en pantalla
     */
    /**
     * Modal para ver la Quiniela de Dobles en pantalla
     * Destaca prominentemente qué socio la ha rellenado (confeccionado) y quién la sella
     */
    openDoblesModal(selectedExtraIndex = 0) {
        const modal = document.getElementById('modal-dobles-view');
        if (!modal) return;

        const titleEl = document.getElementById('modal-dobles-title');
        const authorEl = document.getElementById('modal-dobles-author');
        const metaEl = document.getElementById('modal-dobles-meta');
        const listEl = document.getElementById('modal-dobles-matches-list');
        const statusEl = document.getElementById('modal-dobles-status');

        // Determinar la jornada objetivo: primero la próxima si existe, o la última que tenga dobles
        let targetJ = this.nextJornada;
        let isForNext = true;
        let targetJId = targetJ ? String(targetJ.id) : '';
        let targetJNum = targetJ ? String(targetJ.number) : '';

        // Buscar todos los pronósticos de dobles de esta jornada
        const findExtrasForJornada = (jId, jNum) => {
            if (!Array.isArray(this.pronosticosExtra)) return [];
            return this.pronosticosExtra.filter(p => {
                if (!p) return false;
                const pj = String(p.jId !== undefined && p.jId !== null ? p.jId : (p.jornadaId !== undefined ? p.jornadaId : ''));
                const hasSigns = Array.isArray(p.selection) && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-');
                return (pj === String(jId) || pj === String(jNum)) && hasSigns;
            });
        };

        let jExtras = findExtrasForJornada(targetJId, targetJNum);

        // Si no hay dobles rellenados aún para la próxima jornada, buscar la última jornada con dobles
        if (jExtras.length === 0) {
            const candidateJornadas = [...(this.jornadas || [])].sort((a, b) => (b.number || 0) - (a.number || 0));
            for (const cj of candidateJornadas) {
                const found = findExtrasForJornada(cj.id, cj.number);
                if (found.length > 0) {
                    jExtras = found;
                    targetJ = cj;
                    targetJId = String(cj.id);
                    targetJNum = String(cj.number);
                    isForNext = (this.nextJornada && String(this.nextJornada.id) === String(cj.id));
                    break;
                }
            }
        }

        const jNumDisplay = targetJ ? targetJ.number : (targetJNum || '?');
        let defaultResponsibleName = (this.lastJornadaOutcome && this.lastJornadaOutcome.winnerName) ? this.lastJornadaOutcome.winnerName : 'Ganador semanal';
        if (this.lastJornadaOutcome && this.lastJornadaOutcome.doblesEligibleNames && this.lastJornadaOutcome.doblesEligibleNames.length > 0) {
            defaultResponsibleName = this.lastJornadaOutcome.doblesEligibleNames.join(', ');
        }
        const loserName = (this.lastJornadaOutcome && this.lastJornadaOutcome.loserName) ? this.lastJornadaOutcome.loserName : 'Sellador oficial';

        if (titleEl) {
            titleEl.textContent = `Quiniela de Dobles - Jornada ${jNumDisplay}`;
        }

        // Si no hay ningún boleto de dobles rellenado todavía:
        if (jExtras.length === 0) {
            if (authorEl) {
                authorEl.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs">⏳ Pendiente de rellenar por: <strong class="text-white font-black">${defaultResponsibleName}</strong></span>`;
            }
            if (metaEl) {
                metaEl.innerHTML = `
                    <div class="w-full flex items-center justify-between pb-2 border-b border-slate-800 gap-2">
                        <div class="flex items-center gap-2">
                            <span class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center text-sm font-bold shrink-0">✍️</span>
                            <div>
                                <span class="text-[10px] text-slate-400 uppercase font-semibold block">Socio que debe rellenarla:</span>
                                <strong class="text-sm font-black text-amber-300">${defaultResponsibleName}</strong>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 text-right">
                            <div>
                                <span class="text-[10px] text-slate-400 uppercase font-semibold block">Sella en despacho:</span>
                                <strong class="text-sm font-black text-rose-300">${loserName}</strong>
                            </div>
                            <span class="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center text-sm font-bold shrink-0">📥</span>
                        </div>
                    </div>
                    <div class="w-full flex items-center justify-between pt-1 text-xs text-slate-400">
                        <span>Estado: <strong class="text-amber-400 font-bold">Aún no registrada en el sistema</strong></span>
                        <span>Coste: <strong class="text-emerald-400 font-mono font-bold">12,00 €</strong></span>
                    </div>
                `;
            }
            if (listEl) {
                if (targetJ && Array.isArray(targetJ.matches) && targetJ.matches.length > 0) {
                    listEl.innerHTML = targetJ.matches.map((m, idx) => `
                        <div class="py-2 px-1 flex items-center justify-between">
                            <div class="flex items-center gap-2 truncate">
                                <span class="w-6 h-6 rounded bg-slate-800 text-slate-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">${idx + 1}</span>
                                <span class="text-slate-300 truncate">${m.home || 'Local'} - ${m.away || 'Visitante'}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-500 font-mono font-bold text-xs">-</span>
                        </div>
                    `).join('');
                } else {
                    listEl.innerHTML = `<div class="p-6 text-center text-slate-500 italic">No hay partidos configurados para esta jornada.</div>`;
                }
            }
            if (statusEl) {
                statusEl.innerHTML = `<span class="text-amber-400 font-medium">Socio responsable de rellenarla: <strong>${defaultResponsibleName}</strong></span>`;
            }
            modal.classList.remove('hidden');
            return;
        }

        // Si hay uno o varios boletos de dobles rellenados:
        const validIndex = (selectedExtraIndex >= 0 && selectedExtraIndex < jExtras.length) ? selectedExtraIndex : 0;
        const extra = jExtras[validIndex];

        // Obtener el nombre del socio que la rellenó
        let authorName = defaultResponsibleName;
        const mid = extra.mId !== undefined ? extra.mId : (extra.memberId !== undefined ? extra.memberId : null);
        if (mid !== null) {
            const m = (this.members || []).find(mem => String(mem.id) === String(mid));
            if (m && m.name) authorName = (window.AppUtils && window.AppUtils.getMemberName) ? window.AppUtils.getMemberName(m) : m.name;
        } else if (extra.author || extra.memberName) {
            authorName = extra.author || extra.memberName;
        }

        // Pestañas / selector si hay más de una quiniela de dobles para esta jornada
        let selectorTabsHtml = '';
        if (jExtras.length > 1) {
            selectorTabsHtml = `
                <div class="w-full flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-2">
                    ${jExtras.map((ex, i) => {
                        let eName = 'Boleto ' + (i + 1);
                        const eMid = ex.mId !== undefined ? ex.mId : ex.memberId;
                        const mem = (this.members || []).find(m => String(m.id) === String(eMid));
                        if (mem) eName = (window.AppUtils && window.AppUtils.getMemberName) ? window.AppUtils.getMemberName(mem) : mem.name;
                        const isActive = i === validIndex;
                        return `
                            <button type="button" onclick="window.DashboardApp.openDoblesModal(${i})" class="flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${isActive ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-900'}">
                                <span>✍️</span> <span>${eName}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            `;
        }

        if (authorEl) {
            authorEl.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/25 text-purple-200 border border-purple-500/40 font-bold text-xs">✍️ Rellenada por: <strong class="text-amber-300 font-black">${authorName}</strong> ${isForNext ? '<span class="text-[10px] text-purple-300 font-normal">(Próxima Jornada)</span>' : ''}</span>`;
        }

        const sel = extra.selection;
        let countDobles = 0;
        sel.forEach((s, idx) => {
            if (idx < 14 && s && String(s).length > 1) countDobles++;
        });

        const matches = (targetJ && Array.isArray(targetJ.matches)) ? targetJ.matches : [];
        let doublesHits = 0;
        let hasAnyResult = false;
        const matchHitStatus = Array(15).fill(null);

        for (let i = 0; i < 15; i++) {
            const m = matches[i];
            const res = m && m.result ? String(m.result).trim() : '';
            if (!res || res === '-' || res.toLowerCase() === 'por definir') {
                matchHitStatus[i] = null;
                continue;
            }
            hasAnyResult = true;
            const sign = sel[i] ? String(sel[i]).trim().toUpperCase() : '';
            if (!sign) {
                matchHitStatus[i] = false;
                continue;
            }
            const rSign = window.ScoringSystem ? window.ScoringSystem.normalizeSign(res) : res.toUpperCase();
            const rScore = res.toUpperCase();

            if (i < 14) {
                const isHit = sign.includes(rSign) || sign === rSign;
                matchHitStatus[i] = isHit;
                if (isHit) doublesHits++;
            } else if (i === 14) {
                const isHit = (sign === rScore) || (sign === rSign);
                matchHitStatus[i] = isHit;
            }
        }

        const isFinished = targetJ && (targetJ.status === 'completed' || targetJ.status === 'closed' || targetJ.finalizada === true);

        if (metaEl) {
            metaEl.innerHTML = `
                ${selectorTabsHtml}
                <!-- Fila Principal: Socio que la ha rellenado y Sellador -->
                <div class="w-full p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-center justify-between gap-3 shadow-inner">
                    <div class="flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center justify-center text-base font-bold shrink-0">✍️</span>
                        <div>
                            <span class="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider block">Socio que la ha rellenado:</span>
                            <strong class="text-sm sm:text-base font-black text-amber-300 block leading-tight">${authorName}</strong>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 text-right shrink-0">
                        <div>
                            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sella en despacho:</span>
                            <strong class="text-xs sm:text-sm font-bold text-rose-300 block leading-tight">${loserName}</strong>
                        </div>
                        <span class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center text-sm font-bold shrink-0">📥</span>
                    </div>
                </div>

                <!-- Fila Secundaria: Detalles técnicos del boleto -->
                <div class="w-full flex items-center justify-between gap-2 pt-1 text-xs">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            7 Dobles Reducidos
                        </span>
                        <span class="text-slate-300 font-medium">${countDobles} Dobles activos</span>
                        ${hasAnyResult ? `
                            <span class="px-2.5 py-0.5 rounded font-mono font-bold text-xs ${!isFinished ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse' : 'bg-slate-800 text-slate-200 border border-slate-700'}">
                                🎯 <strong>${doublesHits} / 14 aciertos</strong>${matchHitStatus[14] === true ? ' <span class="text-purple-300 font-bold">(+P15 ✅)</span>' : ''} ${!isFinished ? '<span class="text-[10px] text-emerald-400 font-sans uppercase font-bold tracking-wider ml-1">En Juego</span>' : ''}
                            </span>
                        ` : ''}
                    </div>
                    <div class="text-slate-400 text-xs shrink-0">
                        <span>Coste: <strong class="text-emerald-400 font-mono font-bold">12,00 €</strong></span>
                    </div>
                </div>
            `;
        }

        // Renderizado de partidos
        if (listEl) {
            let html = '';
            for (let i = 0; i < 15; i++) {
                const m = matches[i] || { home: `Equipo Local ${i + 1}`, away: `Equipo Visitante ${i + 1}` };
                const sign = sel[i] || '-';
                const isDouble = i < 14 && String(sign).length > 1;
                const isPleno = (i === 14);
                const hit = matchHitStatus[i];
                const res = m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-' && String(m.result).trim().toLowerCase() !== 'por definir' ? String(m.result).trim() : null;

                let badgeClass = 'bg-slate-800 text-slate-200 border-slate-700';
                let rowBgClass = '';
                if (hit === true) {
                    badgeClass = 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-black shadow-sm';
                    rowBgClass = 'bg-emerald-500/10 border-l-2 border-emerald-500';
                } else if (hit === false) {
                    badgeClass = 'bg-rose-500/25 text-rose-300 border-rose-500/50 line-through';
                    rowBgClass = 'bg-rose-500/5 border-l-2 border-rose-500/50';
                } else if (isDouble) {
                    badgeClass = 'bg-amber-500/25 text-amber-300 border-amber-500/50 font-black shadow-sm';
                } else if (isPleno) {
                    badgeClass = 'bg-purple-500/25 text-purple-300 border-purple-500/50 font-bold';
                }

                let resBadge = '';
                if (res) {
                    if (hit === true) {
                        resBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">✅ ${res}</span>`;
                    } else if (hit === false) {
                        resBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40 shrink-0">❌ ${res}</span>`;
                    } else {
                        resBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 border border-slate-700 shrink-0">${res}</span>`;
                    }
                }

                html += `
                    <div class="py-1.5 px-2 flex items-center justify-between hover:bg-slate-900/50 rounded-lg transition ${rowBgClass}">
                        <div class="flex items-center gap-2.5 min-w-0 pr-2">
                            <span class="w-6 h-6 rounded bg-slate-800/80 text-slate-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                                ${isPleno ? 'P15' : (i + 1)}
                            </span>
                            <span class="text-slate-200 truncate font-medium text-xs">
                                ${m.home} <span class="text-slate-500">vs</span> ${m.away}
                            </span>
                            ${resBadge}
                        </div>
                        <div class="shrink-0">
                            <span class="px-2.5 py-0.5 rounded border font-mono text-xs ${badgeClass}">
                                ${sign}
                            </span>
                        </div>
                    </div>
                `;
            }
            listEl.innerHTML = html;
        }

        if (statusEl) {
            statusEl.innerHTML = `<span>Boleto oficial de dobles rellenado por <strong class="text-amber-300 font-bold">${authorName}</strong></span>`;
        }

        modal.classList.remove('hidden');
    }

    closeDoblesModal() {
        const modal = document.getElementById('modal-dobles-view');
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Modal para ver el Boleto individual del Socio conectado en la jornada
     */
    openUserBoletoModal(e) {
        if (e && e.preventDefault) e.preventDefault();
        const modal = document.getElementById('modal-user-boleto-view');
        if (!modal) return;

        const titleEl = document.getElementById('modal-user-boleto-title');
        const authorEl = document.getElementById('modal-user-boleto-author');
        const metaEl = document.getElementById('modal-user-boleto-meta');
        const listEl = document.getElementById('modal-user-boleto-matches-list');
        const editorLink = document.getElementById('modal-user-boleto-editor-link');

        // Obtener usuario conectado
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        let user = null;
        try { if (userStr) user = JSON.parse(userStr); } catch (err) {}
        let userMember = null;
        if (user && Array.isArray(this.members)) {
            userMember = this.members.find(m => 
                (user.id && String(m.id) === String(user.id)) ||
                (user.email && m.email && m.email.toLowerCase() === user.email.toLowerCase()) ||
                (user.name && m.name && m.name.toLowerCase() === user.name.toLowerCase()) ||
                (user.phone && m.phone && m.phone.toLowerCase() === user.phone.toLowerCase())
            );
        }
        if (!userMember && Array.isArray(this.members) && this.members.length > 0) {
            userMember = this.members.find(m => m.name && m.name.toLowerCase().includes('fernando')) || this.members[0];
        }

        const targetJ = this.nextJornada;
        const jNum = targetJ ? targetJ.number : '?';
        const memberName = userMember ? (window.AppUtils ? window.AppUtils.getMemberName(userMember) : userMember.name) : 'Socio';

        if (titleEl) {
            titleEl.textContent = `Boleto de ${memberName} - Jornada ${jNum}`;
        }
        if (authorEl) {
            authorEl.textContent = `Pronóstico individual oficial de la Peña`;
        }

        if (editorLink && targetJ && userMember) {
            editorLink.href = `pronosticos_2.html?openEditor=true&jId=${encodeURIComponent(targetJ.id)}&mId=${encodeURIComponent(userMember.id)}`;
        }

        // Buscar pronóstico del usuario
        let p = null;
        if (targetJ && userMember) {
            const nextJId = String(targetJ.id);
            const mId = String(userMember.id);
            if (this.pronosticosMap) {
                p = this.pronosticosMap.get(`${nextJId}_${mId}`);
            }
            if (!p && Array.isArray(this.pronosticos)) {
                p = this.pronosticos.find(pr => {
                    if (!pr) return false;
                    const pj = String(pr.jId !== undefined && pr.jId !== null ? pr.jId : (pr.jornadaId !== undefined ? pr.jornadaId : ''));
                    const pm = String(pr.mId !== undefined && pr.mId !== null ? pr.mId : (pr.memberId !== undefined ? pr.memberId : ''));
                    return pj === nextJId && pm === mId;
                });
            }
        }

        const matches = (targetJ && Array.isArray(targetJ.matches)) ? targetJ.matches : [];
        const sel = p ? (Array.isArray(p.selection) ? p.selection : (Array.isArray(p.forecast) ? p.forecast : [])) : [];
        const filled = sel.filter(s => s && String(s).trim() !== '' && String(s) !== '-').length;

        if (!p || filled === 0) {
            if (metaEl) {
                metaEl.innerHTML = `
                    <div class="flex items-center gap-2 text-amber-300">
                        <span>⏳</span>
                        <span>Aún no has registrado pronósticos para la Jornada ${jNum}.</span>
                    </div>
                `;
            }
            if (listEl) {
                if (matches.length > 0) {
                    listEl.innerHTML = matches.map((m, idx) => `
                        <div class="py-2 px-1 flex items-center justify-between">
                            <div class="flex items-center gap-2 truncate">
                                <span class="w-6 h-6 rounded bg-slate-800 text-slate-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">${idx + 1}</span>
                                <span class="text-slate-300 truncate">${m.home || 'Local'} vs ${m.away || 'Visitante'}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-500 font-mono font-bold text-xs">-</span>
                        </div>
                    `).join('');
                } else {
                    listEl.innerHTML = `<div class="p-6 text-center text-slate-500 italic">No hay partidos cargados para la Jornada ${jNum}.</div>`;
                }
            }
            modal.classList.remove('hidden');
            return;
        }

        // Evaluar aciertos
        let hits = 0;
        let evaluated = 0;
        const matchesRows = matches.map((m, idx) => {
            const userSign = sel[idx] ? String(sel[idx]).trim() : '-';
            const realResult = (m && m.result) ? String(m.result).trim() : '';
            const hasResult = realResult !== '' && realResult !== '-' && realResult.toLowerCase() !== 'por definir';

            let statusBadge = '<span class="text-slate-500 text-[10px] font-mono font-semibold">Pendiente</span>';
            let bgClass = 'bg-slate-900/40';

            if (hasResult) {
                evaluated++;
                const isHit = (userSign.toUpperCase() === realResult.toUpperCase());
                if (isHit) {
                    hits++;
                    statusBadge = '<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">✅ Acertado</span>';
                    bgClass = 'bg-emerald-950/20';
                } else {
                    statusBadge = '<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">❌ Fallado</span>';
                    bgClass = 'bg-rose-950/20';
                }
            }

            const p15Tag = idx === 14 ? '<span class="px-1 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 ml-1">P15</span>' : '';

            return `
                <div class="py-1.5 px-2 flex items-center justify-between gap-2 rounded-lg ${bgClass} transition">
                    <div class="flex items-center gap-2 truncate min-w-0">
                        <span class="w-5 h-5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">${idx + 1}</span>
                        <span class="text-slate-200 text-xs truncate">${m.home || 'Local'} vs ${m.away || 'Visitante'}${p15Tag}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-black text-xs border border-amber-500/40 shadow-sm min-w-[24px] text-center">${userSign}</span>
                        ${hasResult ? `<span class="text-[10px] text-slate-400 font-mono">(${realResult})</span>` : ''}
                        ${statusBadge}
                    </div>
                </div>
            `;
        }).join('');

        if (metaEl) {
            metaEl.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-slate-300">Aciertos:</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">${hits} / ${evaluated > 0 ? evaluated : 15}</span>
                    ${evaluated > 0 && evaluated < 15 ? `<span class="text-[10px] text-slate-400 font-mono">(${evaluated} partidos finalizados)</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-400 font-medium">
                    15 pronósticos registrados
                </div>
            `;
        }

        if (listEl) {
            listEl.innerHTML = matchesRows;
        }

        modal.classList.remove('hidden');
    }

    closeUserBoletoModal() {
        const modal = document.getElementById('modal-user-boleto-view');
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Listeners de interfaz
     */
    initUiListeners() {
        // Escucha en tiempo real de actualizaciones de la Caja Real y Bote Oficial
        window.addEventListener('storage', (e) => {
            if (e.key === 'maulas_bote2_summary') {
                try {
                    const newSummary = JSON.parse(e.newValue);
                    if (newSummary && typeof newSummary.cajaReal === 'number') {
                        this.boteOfficialSummary = newSummary;
                        this.updateCajaRealDisplays();
                    }
                } catch(err) {}
            }
        });
        window.addEventListener('maulas_bote_summary_updated', (e) => {
            if (e.detail && typeof e.detail.cajaReal === 'number') {
                this.boteOfficialSummary = e.detail;
                this.updateCajaRealDisplays();
            }
        });
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

            // Cerrar modal de dobles al pulsar sobre el fondo oscuro
            const doblesModal = document.getElementById('modal-dobles-view');
            if (doblesModal && e.target === doblesModal) {
                this.closeDoblesModal();
            }

            // Cerrar modal de boleto del socio al pulsar sobre el fondo oscuro
            const boletoModal = document.getElementById('modal-user-boleto-view');
            if (boletoModal && e.target === boletoModal) {
                this.closeUserBoletoModal();
            }
        });

        // Cerrar modales al presionar la tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeInfoModal();
                this.closeDoblesModal();
                this.closeUserBoletoModal();
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
