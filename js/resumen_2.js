        class Resumen2App {
            constructor() {
                this.members = [];
                this.jornadas = [];
                this.pronosticos = [];
                this.pronosticosExtra = [];
                this.memberStats = {};
                this.selectedMembers = new Set();
                this.activeView = 'evolucion';
                this.chart = null;
                this.dueloRadarChart = null;

                // Zoom / Rango
                this.viewJornadasCount = 0;
                this.viewOffset = 0;
                this.totalJornadas = 0;

                // Clubes & Casillas
                this.teamStats = {};
                this.casillaStats = [];
                this.jornadaPerformance = [];

                this.init();
            }

            /**
             * Formatea moneda en notación española estricta (puntos de miles y coma decimal)
             */
            formatMoney(val) {
                if (typeof AppUtils !== 'undefined' && AppUtils.formatEuro) {
                    return AppUtils.formatEuro(val);
                }
                if (val === null || val === undefined || isNaN(val)) return '0,00 €';
                const num = Number(val);
                const parts = num.toFixed(2).split('.');
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                return `${parts[0]},${parts[1]} €`;
            }

            async init() {
                try {
                    if (window.DataService) await window.DataService.init();

                    console.log("[Resumen2] Cargando datos oficiales de la temporada...");
                    const data = await window.DataService.loadSeasonData();
                    this.members = data.members || [];
                    this.jornadas = (data.jornadas || []).sort((a, b) => a.number - b.number);
                    this.pronosticos = data.pronosticos || [];
                    this.pronosticosExtra = data.pronosticosExtra || [];

                    // Filtro de jornadas jugadas
                    this.playedJornadas = this.jornadas.filter(j => {
                        const hasResult = j.matches && j.matches[0] && j.matches[0].result !== '' && j.matches[0].result !== undefined;
                        const d = AppUtils.parseDate(j.date);
                        const isValidDate = d && AppUtils.isSunday(d);
                        return hasResult && isValidDate;
                    });
                    this.totalJornadas = this.playedJornadas.length;

                    // Calcular métricas
                    this.calculateAllStats();

                    // Renderizar interfaz principal inmediatamente (KPIs y cabecera)
                    this.renderHeaderAndKPIs();

                    const renderRemainingSections = () => {
                        this.initChart();
                        this.renderCasillas();
                        this.renderClubes();
                        this.renderJornadasPerformance();
                        this.renderDobles();
                        this.initDueloSelectors();
                    };

                    if (typeof window !== 'undefined' && window.requestIdleCallback) {
                        window.requestIdleCallback(renderRemainingSections, { timeout: 1500 });
                    } else {
                        setTimeout(renderRemainingSections, 50);
                    }
                    this.initFloatingCards();
                    this.initZoomSliders();

                    // Inicializar versión PWA
                    if (window.AppVersion && window.AppVersion.init) {
                        window.AppVersion.init();
                    }

                    console.log("[Resumen2] Inicializado con éxito. Jornadas jugadas:", this.totalJornadas);
                } catch (err) {
                    console.error("[Resumen2] Error en la inicialización:", err);
                }
            }

            /**
             * Calcula las estadísticas completas de la temporada
             */
            // Calcular importe total y detalle de premios conseguidos por quinielas de dobles
            calculateDoublesPrizes() {
                let totalDobles = 0;
                let countPremios = 0;
                const doblesMap = new Map(); // jId/jNum -> { amount, breakdown, ev }

                if (!this.pronosticosExtra || !Array.isArray(this.pronosticosExtra) || this.pronosticosExtra.length === 0) {
                    return { total: 0, count: 0, map: doblesMap };
                }

                (this.jornadas || []).forEach(jornada => {
                    if (!jornada || !jornada.matches) return;
                    const doublesForecasts = this.pronosticosExtra.filter(p => {
                        const pJ = String(p.jId !== undefined && p.jId !== null ? p.jId : (p.jornadaId || ''));
                        return pJ === String(jornada.id) || pJ === String(jornada.number);
                    });

                    if (doublesForecasts.length > 0) {
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
                                totalDobles += extraPrizeAmount;
                                countPremios++;
                                doblesMap.set(String(jornada.id), { amount: extraPrizeAmount, ev, df });
                                doblesMap.set(String(jornada.number), { amount: extraPrizeAmount, ev, df });
                            }
                        });
                    }
                });

                return { total: totalDobles, count: countPremios, map: doblesMap };
            }

            calculateAllStats() {
                // 1. Inicializar estructura de socios
                this.memberStats = {};
                this.members.forEach(m => {
                    this.memberStats[m.id] = {
                        member: m,
                        name: AppUtils.getMemberName(m),
                        grandTotal: 0,
                        baseTotal: 0,
                        bonusTotal: 0,
                        prizesTotal: 0,
                        jornadasPlayed: 0,
                        jornadasWithPoints: 0, // >= 10 aciertos
                        history: [], // [{ jNum, pointsAcum, dayPoints, dayHits, dayPrize, jId }]
                        bestHits: 0,
                        bestHitsJornada: 0
                    };
                });

                // Mapa de pronósticos O(1)
                const pronosMap = new Map();
                this.pronosticos.forEach(p => {
                    if (!p) return;
                    const jIds = [p.jId, p.jornadaId].filter(x => x !== undefined && x !== null).map(String);
                    const mIds = [p.mId, p.memberId].filter(x => x !== undefined && x !== null).map(String);
                    jIds.forEach(j => {
                        mIds.forEach(m => {
                            pronosMap.set(`${j}_${m}`, p);
                        });
                    });
                });

                // Inicializar casillas 0 a 13
                this.casillaStats = Array.from({ length: 14 }, (_, i) => ({
                    casillaIndex: i,
                    matchNum: i + 1,
                    totalPronosticos: 0,
                    totalHits: 0,
                    signosOficiales: { '1': 0, 'X': 0, '2': 0 },
                    signosSocios: { '1': 0, 'X': 0, '2': 0 },
                    recentMatches: []
                }));

                // Inicializar clubes
                this.teamStats = {};

                // Inicializar rendimiento por jornada
                this.jornadaPerformance = [];

                let totalHitsPeña = 0;
                let totalPronosPeña = 0;

                // 2. Iterar jornada a jornada
                this.playedJornadas.forEach(j => {
                    let jHitsTotal = 0;
                    let jPronosCount = 0;
                    let jPrizesTotal = 0;
                    let jBestMember = { name: '', hits: -1, points: -1 };

                    const officialResults = (j.matches || []).map(m => m.result);

                    // Casillas y Equipos en esta jornada
                    (j.matches || []).forEach((m, mIdx) => {
                        if (mIdx < 14) {
                            const offRes = m.result;
                            const normSign = ScoringSystem.normalizeSign(offRes);
                            if (normSign) {
                                this.casillaStats[mIdx].signosOficiales[normSign] = (this.casillaStats[mIdx].signosOficiales[normSign] || 0) + 1;
                            }
                            this.casillaStats[mIdx].recentMatches.push({
                                jNum: j.number,
                                home: m.home,
                                away: m.away,
                                result: offRes
                            });

                            // Registro de equipos
                            [m.home, m.away].forEach(rawTeam => {
                                const team = (window.AppUtils && window.AppUtils.normalizeTeamName) ? window.AppUtils.normalizeTeamName(rawTeam) : (rawTeam || '').trim();
                                if (team && !this.teamStats[team]) {
                                    this.teamStats[team] = { name: team, totalMatches: 0, hits: 0, totalPicks: 0 };
                                }
                                if (team) this.teamStats[team].totalMatches++;
                            });
                        }
                    });

                    // Evaluar a cada socio en esta jornada
                    this.members.forEach(m => {
                        const p = pronosMap.get(`${j.id}_${m.id}`);
                        let points = 0;
                        let hits = -1;
                        let prize = 0;

                        if (p) {
                            const ev = ScoringSystem.evaluateMember(m, j, p);
                            if (ev.played && ev.hits !== -1) {
                                hits = ev.hits;
                                points = ev.points;
                                prize = ev.prize || 0;
                                const sel = p.selection || p.forecasts || [];

                                this.memberStats[m.id].jornadasPlayed++;
                                this.memberStats[m.id].baseTotal += hits;
                                this.memberStats[m.id].bonusTotal += (points - hits);
                                this.memberStats[m.id].prizesTotal += prize;

                                if (hits >= 10) {
                                    this.memberStats[m.id].jornadasWithPoints++;
                                }

                                if (hits > this.memberStats[m.id].bestHits) {
                                    this.memberStats[m.id].bestHits = hits;
                                    this.memberStats[m.id].bestHitsJornada = j.number;
                                }

                                jHitsTotal += hits;
                                jPronosCount++;
                                jPrizesTotal += prize;
                                totalHitsPeña += hits;
                                totalPronosPeña++;

                                if (hits > jBestMember.hits || (hits === jBestMember.hits && points > jBestMember.points)) {
                                    jBestMember = { name: this.memberStats[m.id].name, hits, points };
                                }

                                // Contabilizar casillas y equipos
                                (j.matches || []).forEach((match, idx) => {
                                    if (idx < 14) {
                                        const userSign = ScoringSystem.normalizeSign(sel[idx]);
                                        const offSign = ScoringSystem.normalizeSign(officialResults[idx]);
                                        const isHit = userSign && offSign && userSign === offSign;

                                        this.casillaStats[idx].totalPronosticos++;
                                        if (userSign) {
                                            this.casillaStats[idx].signosSocios[userSign] = (this.casillaStats[idx].signosSocios[userSign] || 0) + 1;
                                        }
                                        if (isHit) {
                                            this.casillaStats[idx].totalHits++;
                                        }

                                        // Equipos
                                        [match.home, match.away].forEach(rawTeam => {
                                            const team = (window.AppUtils && window.AppUtils.normalizeTeamName) ? window.AppUtils.normalizeTeamName(rawTeam) : (rawTeam || '').trim();
                                            if (team && this.teamStats[team]) {
                                                this.teamStats[team].totalPicks++;
                                                if (isHit) this.teamStats[team].hits++;
                                            }
                                        });
                                    }
                                });
                            }
                        }

                        this.memberStats[m.id].grandTotal += points;
                        this.memberStats[m.id].history.push({
                            jNum: j.number,
                            jId: j.id,
                            pointsAcum: this.memberStats[m.id].grandTotal,
                            dayPoints: points,
                            dayHits: hits,
                            dayPrize: prize
                        });
                    });

                    // Guardar rendimiento jornada
                    const jAvgHits = jPronosCount > 0 ? (jHitsTotal / jPronosCount) : 0;
                    const jPctAcierto = jPronosCount > 0 ? ((jHitsTotal / (jPronosCount * 14)) * 100) : 0;
                    const hasPig = (j.matches || []).some(m => m && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away));

                    // Incluir premios de dobles de esta jornada si los hubiere
                    let jDoblesPrize = 0;
                    if (this.pronosticosExtra && Array.isArray(this.pronosticosExtra)) {
                        const dfList = this.pronosticosExtra.filter(p => {
                            const pJ = String(p.jId !== undefined && p.jId !== null ? p.jId : (p.jornadaId || ''));
                            return pJ === String(j.id) || pJ === String(j.number);
                        });
                        if (dfList.length > 0 && j.matches) {
                            const offRes = j.matches.map(m => m.result);
                            dfList.forEach(df => {
                                const sel = df.selection || df.forecast || [];
                                const dCount = sel.filter((s, i) => i < 14 && s && s.length > 1).length;
                                const isRed = df.isReduced || (dCount === 7);
                                const jD = window.AppUtils ? window.AppUtils.parseDate(j.date) : new Date(j.date);
                                const evD = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(sel, offRes, jD, { isReduced: isRed }) : null;
                                const pMap = j.prizes || j.prizeRates || {};
                                if (evD && evD.breakdown) {
                                    Object.keys(evD.breakdown).forEach(h => {
                                        const cnt = evD.breakdown[h];
                                        let pV = pMap[h] || pMap[String(h)] || 0;
                                        if (typeof pV === 'string') pV = parseFloat(pV.replace(',', '.').replace('€', '').trim());
                                        if (cnt > 0 && pV > 0) jDoblesPrize += cnt * parseFloat(pV);
                                    });
                                } else if (evD) {
                                    const cat = evD.officialHits !== undefined ? evD.officialHits : evD.hits;
                                    let minH = j.minHitsToWin || 10;
                                    if (pMap && Object.keys(pMap).length > 0) minH = Math.min(...Object.keys(pMap).map(Number));
                                    if (cat >= minH) {
                                        let pV = pMap[cat] || pMap[String(cat)] || 0;
                                        if (typeof pV === 'string') pV = parseFloat(pV.replace(',', '.').replace('€', '').trim());
                                        if (pV > 0) jDoblesPrize += parseFloat(pV);
                                    }
                                }
                            });
                        }
                    }

                    this.jornadaPerformance.push({
                        jornada: j,
                        number: j.number,
                        date: j.date,
                        totalHits: jHitsTotal,
                        pronosCount: jPronosCount,
                        avgHits: jAvgHits,
                        pctAcierto: jPctAcierto,
                        prizesTotal: jPrizesTotal + jDoblesPrize,
                        bestMember: jBestMember,
                        hasPig: hasPig
                    });
                });

                // Métrica global
                this.globalPctAcierto = totalPronosPeña > 0 ? ((totalHitsPeña / (totalPronosPeña * 14)) * 100) : 0;
                this.globalAvgHits = totalPronosPeña > 0 ? (totalHitsPeña / totalPronosPeña) : 0;
            }

            /**
             * Renderiza el encabezado y las 5 tarjetas de Super-KPIs
             */
            renderHeaderAndKPIs() {
                // Header pills
                document.getElementById('kpi-header-badge').textContent = `${this.totalJornadas} Jornadas Disputadas`;
                document.getElementById('header-stat-jornadas').textContent = this.totalJornadas;
                document.getElementById('header-stat-acierto').textContent = `${this.globalPctAcierto.toFixed(1)}%`;

                // Sumar premios de todos los socios
                let totalPrizes = 0;
                let maxPrizeSocio = { name: '', amount: 0 };
                let bestRecord = { hits: 0, name: '', jNum: 0, points: 0 };

                let bestRegularidad = { name: '', pct: 0, points: 0 };

                Object.values(this.memberStats).forEach(s => {
                    totalPrizes += s.prizesTotal;
                    if (s.prizesTotal > maxPrizeSocio.amount) {
                        maxPrizeSocio = { name: s.name, amount: s.prizesTotal };
                    }
                    if (s.bestHits > bestRecord.hits) {
                        bestRecord = { hits: s.bestHits, name: s.name, jNum: s.bestHitsJornada, points: 0 };
                    }
                    const regPct = s.jornadasPlayed > 0 ? ((s.jornadasWithPoints / s.jornadasPlayed) * 100) : 0;
                    if (regPct > bestRegularidad.pct || (regPct === bestRegularidad.pct && s.grandTotal > bestRegularidad.points)) {
                        bestRegularidad = { name: s.name, pct: regPct, points: s.grandTotal };
                    }
                });

                document.getElementById('header-stat-premios').textContent = this.formatMoney(totalPrizes);

                // KPI 1: Efectividad Global Peña
                const effText = `${this.globalPctAcierto.toFixed(1)}%`;
                document.getElementById('kpi-val-efectividad').textContent = effText;
                const kpiValEffComp = document.getElementById('kpi-val-efectividad-compact');
                if (kpiValEffComp) kpiValEffComp.textContent = effText;
                document.getElementById('kpi-sub-efectividad').textContent = `${this.globalAvgHits.toFixed(1)} aciertos / jornada`;
                document.getElementById('kpi-media-boleto').textContent = `${this.globalAvgHits.toFixed(1)}/14`;
                document.getElementById('kpi-bar-efectividad').style.width = `${Math.min(100, this.globalPctAcierto)}%`;

                // KPI 2: Bombazo Récord
                const bombazoText = `${bestRecord.hits} aciertos`;
                document.getElementById('kpi-val-bombazo').textContent = bombazoText;
                const kpiBombComp = document.getElementById('kpi-val-bombazo-compact');
                if (kpiBombComp) kpiBombComp.textContent = `${bestRecord.hits} ac.`;
                document.getElementById('kpi-socio-bombazo').textContent = bestRecord.name ? `Por ${bestRecord.name}` : 'En disputa';
                document.getElementById('kpi-jornada-bombazo').textContent = bestRecord.jNum > 0 ? `Jornada ${bestRecord.jNum}` : 'Récord histórico';
                document.getElementById('kpi-puntos-bombazo').textContent = bestRecord.hits >= 14 ? '+30 bonus' : (bestRecord.hits === 13 ? '+15 bonus' : '+10 bonus');

                // KPI 3: Bote Total en Metálico (Socios + Quiniela de Dobles)
                const doblesPrizesInfo = this.calculateDoublesPrizes();
                const totalDoblesPrize = doblesPrizesInfo.total;
                const grandTotalPremios = totalPrizes + totalDoblesPrize;

                document.getElementById('header-stat-premios').textContent = this.formatMoney(grandTotalPremios);

                const premMoney = this.formatMoney(grandTotalPremios);
                document.getElementById('kpi-val-premios').textContent = premMoney;
                const kpiPremComp = document.getElementById('kpi-val-premios-compact');
                if (kpiPremComp) kpiPremComp.textContent = premMoney;

                const socioSubText = totalDoblesPrize > 0
                    ? `Socios: ${this.formatMoney(totalPrizes)} • Dobles: ${this.formatMoney(totalDoblesPrize)}`
                    : (maxPrizeSocio.amount > 0 ? `Líder: ${maxPrizeSocio.name}` : 'Sin premios oficiales aún');
                document.getElementById('kpi-socio-premios').textContent = socioSubText;

                const maxPremioText = maxPrizeSocio.amount > 0 ? `Máx: ${this.formatMoney(maxPrizeSocio.amount)}` : '0,00 €';
                document.getElementById('kpi-max-premio').textContent = maxPremioText;

                // KPI 4: Míster Fiabilidad
                const fiableName = bestRegularidad.name || 'Sin datos';
                document.getElementById('kpi-val-fiable-nombre').textContent = fiableName;
                const kpiFiableComp = document.getElementById('kpi-val-fiable-compact');
                if (kpiFiableComp) kpiFiableComp.textContent = `${bestRegularidad.pct.toFixed(0)}%`;
                document.getElementById('kpi-pct-fiable').textContent = `${bestRegularidad.pct.toFixed(0)}%`;
                document.getElementById('kpi-bar-fiable').style.width = `${bestRegularidad.pct}%`;

                // Poblar Tarjeta Resumen Única para Móvil (#kpi-mobile-summary)
                const mobAciertoVal = document.getElementById('kpi-mobile-acierto-val');
                const mobAciertoSub = document.getElementById('kpi-mobile-acierto-sub');
                if (mobAciertoVal) mobAciertoVal.textContent = effText;
                if (mobAciertoSub) mobAciertoSub.textContent = `${this.globalAvgHits.toFixed(1)}/14 med.`;

                const mobRecordVal = document.getElementById('kpi-mobile-record-val');
                const mobRecordSub = document.getElementById('kpi-mobile-record-sub');
                if (mobRecordVal) mobRecordVal.textContent = `${bestRecord.hits} ac.`;
                if (mobRecordSub) mobRecordSub.textContent = bestRecord.name ? bestRecord.name : 'En disputa';

                const mobPremiosVal = document.getElementById('kpi-mobile-premios-val');
                const mobPremiosSub = document.getElementById('kpi-mobile-premios-sub');
                if (mobPremiosVal) mobPremiosVal.textContent = premMoney;
                if (mobPremiosSub) mobPremiosSub.textContent = totalDoblesPrize > 0 ? 'Socios+Dobles' : 'Total LAE';

                const mobFiableVal = document.getElementById('kpi-mobile-fiable-val');
                const mobFiableSub = document.getElementById('kpi-mobile-fiable-sub');
                if (mobFiableVal) mobFiableVal.textContent = `${bestRegularidad.pct.toFixed(0)}%`;
                if (mobFiableSub) mobFiableSub.textContent = bestRegularidad.name || 'Regularidad';

                // KPI 5: Talismán vs Trampa (Compensación estadística por volumen de partidos)
                // Se priorizan clubes con muestra representativa (mínimo 2 partidos)
                const candidateTeams = Object.values(this.teamStats).filter(t => t.totalMatches >= 2);
                const usableTeams = candidateTeams.length >= 2 ? candidateTeams : Object.values(this.teamStats);

                // Calcular métricas ponderadas
                usableTeams.forEach(t => {
                    const r = t.totalPicks > 0 ? (t.hits / t.totalPicks) : 0;
                    t._kpiRate = r * 100;
                    t._kpiScore = (r * 100) * Math.sqrt(t.totalMatches);
                });

                // Ordenar por score ponderado para Talismán (premia porcentaje y volumen de partidos)
                const sortedTalisman = [...usableTeams].sort((a, b) => b._kpiScore - a._kpiScore);

                // Ordenar por menor tasa para Trampa
                const sortedTrampa = [...usableTeams].sort((a, b) => {
                    if (Math.abs(a._kpiRate - b._kpiRate) < 5) {
                        return b.totalMatches - a.totalMatches;
                    }
                    return a._kpiRate - b._kpiRate;
                });

                if (sortedTalisman.length > 0 && sortedTrampa.length > 0) {
                    const talisman = sortedTalisman[0];
                    const trampa = sortedTrampa[0];
                    const talPct = talisman._kpiRate;
                    const traPct = trampa._kpiRate;

                    const talLogo = (typeof AppUtils !== 'undefined' && AppUtils.getTeamLogo) ? AppUtils.getTeamLogo(talisman.name) : '';
                    const traLogo = (typeof AppUtils !== 'undefined' && AppUtils.getTeamLogo) ? AppUtils.getTeamLogo(trampa.name) : '';

                    const talLogoHtml = talLogo ? `<img src="${talLogo}" alt="${talisman.name}" class="w-4 h-4 object-contain inline-block flex-shrink-0 drop-shadow-xs" onerror="this.style.display='none';">` : '';
                    const traLogoHtml = traLogo ? `<img src="${traLogo}" alt="${trampa.name}" class="w-4 h-4 object-contain inline-block flex-shrink-0 drop-shadow-xs" onerror="this.style.display='none';">` : '';

                    const elTal = document.getElementById('kpi-talisman-nombre');
                    if (elTal) elTal.innerHTML = `${talLogoHtml} <span class="truncate">${talisman.name}</span> <span class="text-[9px] text-slate-400 font-mono ml-0.5">(${talisman.totalMatches}p)</span>`;
                    const elTalPct = document.getElementById('kpi-talisman-pct');
                    if (elTalPct) elTalPct.textContent = `${talPct.toFixed(0)}%`;

                    const elTra = document.getElementById('kpi-trampa-nombre');
                    if (elTra) elTra.innerHTML = `${traLogoHtml} <span class="truncate">${trampa.name}</span> <span class="text-[9px] text-slate-400 font-mono ml-0.5">(${trampa.totalMatches}p)</span>`;
                    const elTraPct = document.getElementById('kpi-trampa-pct');
                    if (elTraPct) elTraPct.textContent = `${traPct.toFixed(0)}%`;

                    const kpiEquiposComp = document.getElementById('kpi-val-equipos-compact');
                    if (kpiEquiposComp) kpiEquiposComp.textContent = `${talisman.name.substring(0, 10)}`;
                }
            }

            /**
             * Inicializa el Gran Gráfico de Evolución Temporal
             */
            initChart() {
                // Renderizar Chips de selección de socios
                const chipContainer = document.getElementById('members-chip-container');
                if (chipContainer) {
                    const sortedMembers = Object.values(this.memberStats).sort((a, b) => b.grandTotal - a.grandTotal);
                    chipContainer.innerHTML = sortedMembers.map((s, idx) => {
                        let medal = '';
                        if (idx === 0) medal = '🥇 ';
                        else if (idx === 1) medal = '🥈 ';
                        else if (idx === 2) medal = '🥉 ';

                        return `
                            <button type="button" onclick="window.ResumenApp.toggleMemberSelection(${s.member.id})"
                                    id="chip-member-${s.member.id}"
                                    class="member-chip-btn px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500/50 transition flex items-center gap-1.5 flex-shrink-0 shadow-xs">
                                <span>${medal}</span>
                                <span>${s.name}</span>
                                <span class="font-mono text-[10px] opacity-75 font-bold">(${s.grandTotal})</span>
                            </button>
                        `;
                    }).join('');
                }

                // Autoseleccionar Top 4 por defecto
                const top4 = Object.values(this.memberStats).sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 4);
                this.selectedMembers.clear();
                top4.forEach(s => this.selectedMembers.add(s.member.id));

                this.viewJornadasCount = this.totalJornadas;
                this.viewOffset = 0;

                this.renderChart();
            }

            /**
             * Configuración cromática y visual de Chart.js
             */
            renderChart() {
                const ctx = document.getElementById('evolutionChart');
                if (!ctx) return;

                // Actualizar estilo visual de los chips
                this.members.forEach(m => {
                    const btn = document.getElementById(`chip-member-${m.id}`);
                    if (btn) {
                        if (this.selectedMembers.has(m.id)) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    }
                });

                // Ventana de jornadas
                if (this.viewJornadasCount <= 0 || this.viewJornadasCount > this.totalJornadas) {
                    this.viewJornadasCount = this.totalJornadas;
                }
                const maxOffset = Math.max(0, this.totalJornadas - this.viewJornadasCount);
                if (this.viewOffset > maxOffset) this.viewOffset = maxOffset;
                if (this.viewOffset < 0) this.viewOffset = 0;

                const filteredJornadas = this.playedJornadas.slice(this.viewOffset, this.viewOffset + this.viewJornadasCount);
                const labels = filteredJornadas.map(j => `J${j.number}`);

                // Paleta de colores atractiva de alto contraste
                const colorPalette = [
                    '#f59e0b', // Ámbar
                    '#10b981', // Esmeralda
                    '#3b82f6', // Azul eléctrico
                    '#a855f7', // Púrpura
                    '#f43f5e', // Rosa neón
                    '#06b6d4', // Cyan
                    '#eab308', // Amarillo oro
                    '#ec4899', // Fucsia
                    '#8b5cf6', // Violeta
                    '#14b8a6'  // Teal
                ];

                const isDark = document.documentElement.classList.contains('dark');
                const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
                const textColor = isDark ? '#94a3b8' : '#475569';

                const datasets = [];
                let colorIdx = 0;

                this.members.forEach(m => {
                    if (this.selectedMembers.has(m.id)) {
                        const s = this.memberStats[m.id];
                        const historySlice = s.history.slice(this.viewOffset, this.viewOffset + this.viewJornadasCount);
                        const color = colorPalette[colorIdx % colorPalette.length];
                        colorIdx++;

                        datasets.push({
                            label: s.name,
                            data: historySlice.map(h => h.pointsAcum),
                            fullHistory: historySlice,
                            memberId: m.id,
                            borderColor: color,
                            backgroundColor: color,
                            tension: 0.35,
                            borderWidth: 2.5,
                            pointRadius: 4.5,
                            pointHoverRadius: 7.5,
                            pointBackgroundColor: color,
                            pointBorderColor: isDark ? '#020617' : '#ffffff',
                            pointBorderWidth: 2
                        });
                    }
                });

                if (this.chart) this.chart.destroy();

                this.chart = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        onClick: (e, elements) => {
                            if (elements.length > 0) {
                                const el = elements[0];
                                const ds = this.chart.data.datasets[el.datasetIndex];
                                const point = ds.fullHistory[el.index];
                                this.showPointDetail(point.memberId, point.jNum);
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: {
                                    boxWidth: 12,
                                    padding: 14,
                                    font: { family: 'Plus Jakarta Sans', size: 11, weight: '700' },
                                    color: textColor
                                }
                            },
                            tooltip: {
                                backgroundColor: isDark ? '#0b0f19' : '#ffffff',
                                titleColor: isDark ? '#ffffff' : '#0f172a',
                                bodyColor: isDark ? '#cbd5e1' : '#334155',
                                borderColor: 'rgba(245, 158, 11, 0.5)',
                                borderWidth: 1.5,
                                padding: 10,
                                cornerRadius: 10,
                                bodyFont: { family: 'JetBrains Mono', size: 11 },
                                callbacks: {
                                    label: (ctx) => {
                                        const h = ctx.dataset.fullHistory[ctx.dataIndex];
                                        return `${ctx.dataset.label}: ${ctx.parsed.y} pts (+${h.dayPoints} en J${h.jNum} · ${h.dayHits} ac.)`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: gridColor },
                                ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: textColor }
                            },
                            y: {
                                grid: { color: gridColor },
                                ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: textColor }
                            }
                        }
                    }
                });

                this.updateZoomControlsUI();
            }

            /**
             * Muestra el detalle completo de un punto (socio y jornada)
             */
            showPointDetail(memberId, jNum) {
                const s = this.memberStats[memberId];
                const j = this.playedJornadas.find(x => x.number === jNum);
                if (!s || !j) return;

                const h = s.history.find(x => x.jNum === jNum);
                if (!h) return;

                const panel = document.getElementById('point-detail-panel');
                panel.classList.remove('hidden');

                document.getElementById('panel-socio-name').textContent = s.name;
                document.getElementById('panel-jornada-badge').textContent = `Jornada ${jNum} · Disputada el ${j.date}`;

                document.getElementById('panel-stat-acumulados').textContent = `${h.pointsAcum} pts`;
                document.getElementById('panel-stat-puntos-j').textContent = `+${h.dayPoints} pts`;
                document.getElementById('panel-stat-hits').textContent = `${h.dayHits} aciertos`;
                document.getElementById('panel-stat-prize').textContent = this.formatMoney(h.dayPrize);

                // Buscar pronóstico del socio
                const p = this.pronosticos.find(x => (x.jId === j.id || x.jornadaId === j.id) && (x.mId === memberId || x.memberId === memberId));
                const sel = (p && (p.selection || p.forecasts)) || [];

                let matchesHtml = `
                    <table class="w-full text-xs text-left">
                        <thead class="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold">
                            <tr>
                                <th class="py-1.5 px-2.5 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'number')">
                                    <div class="inline-flex items-center justify-center gap-1"><span>#</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                </th>
                                <th class="py-1.5 px-2.5 cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                    <div class="inline-flex items-center gap-1"><span>Partido</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                </th>
                                <th class="py-1.5 px-2.5 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                    <div class="inline-flex items-center justify-center gap-1"><span>Pronóstico</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                </th>
                                <th class="py-1.5 px-2.5 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                    <div class="inline-flex items-center justify-center gap-1"><span>Oficial</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                </th>
                                <th class="py-1.5 px-2.5 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                    <div class="inline-flex items-center justify-center gap-1"><span>Estado</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                `;

                (j.matches || []).forEach((m, idx) => {
                    const userVal = sel[idx] || '-';
                    const offVal = m.result;
                    const uNorm = ScoringSystem.normalizeSign(userVal);
                    const oNorm = ScoringSystem.normalizeSign(offVal);
                    const isHit = (idx < 14 && uNorm && oNorm && uNorm === oNorm) || (idx === 14 && userVal === offVal);

                    const statusBadge = isHit
                        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">✓ Acierto</span>`
                        : (userVal !== '-' ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400">✕ Fallo</span>` : `<span class="text-slate-400">-</span>`);

                    matchesHtml += `
                        <tr class="hover:bg-slate-100/50 dark:hover:bg-slate-800/40 ${isHit ? 'bg-emerald-500/5' : ''}">
                            <td class="py-1 px-2 text-center text-slate-400 font-bold">${idx + 1}</td>
                            <td class="py-1 px-2 font-sans font-semibold text-slate-800 dark:text-slate-200">${m.home} - ${m.away}</td>
                            <td class="py-1 px-2 text-center font-bold">${userVal}</td>
                            <td class="py-1 px-2 text-center font-bold text-amber-500">${offVal}</td>
                            <td class="py-1 px-2 text-center">${statusBadge}</td>
                        </tr>
                    `;
                });

                matchesHtml += `</tbody></table>`;
                document.getElementById('panel-matches-container').innerHTML = matchesHtml;

                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            /**
             * VISTA 2: Casillas 1 a 14
             */
            renderCasillas() {
                const container = document.getElementById('casillas-grid');
                if (!container) return;

                // Encontrar casilla con más y menos acierto
                let maxRate = -1, minRate = 101;
                this.casillaStats.forEach(c => {
                    const rate = c.totalPronosticos > 0 ? (c.totalHits / c.totalPronosticos * 100) : 0;
                    if (rate > maxRate) maxRate = rate;
                    if (rate < minRate) minRate = rate;
                });

                container.innerHTML = this.casillaStats.map(c => {
                    const rate = c.totalPronosticos > 0 ? ((c.totalHits / c.totalPronosticos) * 100) : 0;
                    const isGold = rate === maxRate && maxRate > 0;
                    const isTrap = rate === minRate && minRate < 100;

                    const barColor = rate >= 70 ? 'from-emerald-500 to-teal-400' : (rate >= 50 ? 'from-blue-500 to-indigo-400' : 'from-rose-500 to-amber-500');

                    // Signo más frecuente
                    let topSign = '1';
                    let maxCount = -1;
                    Object.entries(c.signosOficiales).forEach(([s, cnt]) => {
                        if (cnt > maxCount) { maxCount = cnt; topSign = s; }
                    });

                    const highlightClass = isGold ? 'casilla-card-gold' : (isTrap ? 'casilla-card-trap' : '');

                    return `
                        <div class="glass-panel p-3 flex flex-col justify-between cursor-pointer hover:border-amber-500/50 transition group shadow-sm ${highlightClass}"
                             onclick="window.ResumenApp.openCasillaDetail(${c.casillaIndex})">
                            <div class="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
                                <span class="font-mono text-xs font-black text-slate-500 dark:text-slate-400">Casilla #${c.matchNum}</span>
                                ${isGold ? '<span class="text-xs font-black text-amber-500 flex items-center gap-1" title="Casilla Talismán">⭐ Oro</span>' : (isTrap ? '<span class="text-xs font-black text-rose-500 flex items-center gap-1" title="Casilla Trampa">🚩 Trampa</span>' : '')}
                            </div>
                            <div class="my-2 text-center">
                                <div class="text-2xl font-black font-mono text-slate-900 dark:text-white">${rate.toFixed(0)}%</div>
                                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">${c.totalHits}/${c.totalPronosticos} aciertos</span>
                            </div>
                            <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                                <div class="h-full bg-gradient-to-r ${barColor}" style="width: ${rate}%"></div>
                            </div>
                            <div class="text-[10px] text-slate-500 flex justify-between items-center font-mono pt-1 border-t border-slate-200 dark:border-slate-800">
                                <span>Signo rey: <strong class="text-amber-500">${topSign}</strong></span>
                                <button type="button" onclick="event.stopPropagation(); window.ResumenApp.openCasillaDetail(${c.casillaIndex});"
                                        class="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold transition flex items-center gap-1 cursor-pointer">
                                    Ver detalle →
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            closeDetailModal() {
                const modal = document.getElementById('resumen-detail-modal');
                if (!modal) return;
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                modal.style.display = 'none';
            }

            openCasillaDetail(idx) {
                const c = this.casillaStats[idx];
                if (!c) return;

                const modal = document.getElementById('resumen-detail-modal');
                const title = document.getElementById('modal-detail-title');
                const content = document.getElementById('modal-detail-content');
                if (!modal || !title || !content) return;

                title.textContent = `Radiografía Detallada de la Casilla #${c.matchNum}`;

                const rate = c.totalPronosticos > 0 ? ((c.totalHits / c.totalPronosticos) * 100).toFixed(1) : 0;

                let html = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                            <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] uppercase font-bold text-slate-500 block">Efectividad Peña</span>
                                <strong class="text-xl font-black font-mono text-emerald-500">${rate}%</strong>
                            </div>
                            <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] uppercase font-bold text-slate-500 block">Total Aciertos</span>
                                <strong class="text-xl font-black font-mono text-slate-900 dark:text-white">${c.totalHits}</strong>
                            </div>
                            <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] uppercase font-bold text-slate-500 block">Signos Oficiales</span>
                                <span class="font-mono text-xs font-bold text-amber-500">1: ${c.signosOficiales['1'] || 0} | X: ${c.signosOficiales['X'] || 0} | 2: ${c.signosOficiales['2'] || 0}</span>
                            </div>
                            <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] uppercase font-bold text-slate-500 block">Pronósticos Peña</span>
                                <span class="font-mono text-xs font-bold text-blue-500">1: ${c.signosSocios['1'] || 0} | X: ${c.signosSocios['X'] || 0} | 2: ${c.signosSocios['2'] || 0}</span>
                            </div>
                        </div>

                        <h4 class="text-xs font-black uppercase text-slate-600 dark:text-slate-400 mt-2">
                            Historial de Partidos que cayeron en la Casilla #${c.matchNum}
                        </h4>
                        <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table class="w-full text-xs text-left">
                                <thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold">
                                    <tr>
                                        <th class="py-2 px-3 cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'number')">
                                            <div class="inline-flex items-center gap-1"><span>Jornada</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                        </th>
                                        <th class="py-2 px-3 cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                            <div class="inline-flex items-center gap-1"><span>Enfrentamiento</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                        </th>
                                        <th class="py-2 px-3 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                            <div class="inline-flex items-center justify-center gap-1"><span>Resultado</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                                    ${c.recentMatches.length > 0 ? c.recentMatches.map(m => {
                                        const hLogo = (typeof AppUtils !== 'undefined' && AppUtils.getTeamLogo) ? AppUtils.getTeamLogo(m.home) : '';
                                        const aLogo = (typeof AppUtils !== 'undefined' && AppUtils.getTeamLogo) ? AppUtils.getTeamLogo(m.away) : '';
                                        const hImg = hLogo ? `<img src="${hLogo}" class="w-4 h-4 object-contain inline-block mr-1.5" onerror="this.style.display='none'">` : '';
                                        const aImg = aLogo ? `<img src="${aLogo}" class="w-4 h-4 object-contain inline-block ml-1.5" onerror="this.style.display='none'">` : '';
                                        return `
                                            <tr class="hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition">
                                                <td class="py-2 px-3 font-bold text-slate-500">Jornada ${m.jNum}</td>
                                                <td class="py-2 px-3 font-sans font-semibold text-slate-800 dark:text-slate-200 flex items-center">
                                                    ${hImg}<span>${m.home}</span> <span class="text-slate-400 font-normal mx-1.5">-</span> <span>${m.away}</span>${aImg}
                                                </td>
                                                <td class="py-2 px-3 text-center font-bold text-amber-500">${m.result}</td>
                                            </tr>
                                        `;
                                    }).join('') : `<tr><td colspan="3" class="py-4 text-center text-slate-400 font-sans">Sin partidos disputados aún en esta casilla.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                content.innerHTML = html;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                modal.style.display = 'flex';
            }

            /**
             * VISTA 3: Radar de Clubes con Compensación Estadística
             */
            applyTeamFilters() {
                const searchVal = document.getElementById('team-search-input')?.value || '';
                const filterCat = document.getElementById('team-filter-select')?.value || 'all';
                const sortMode = document.getElementById('team-sort-select')?.value || 'weighted';
                this.renderClubes(searchVal, filterCat, sortMode);
            }

            filterTeams(text) {
                this.applyTeamFilters();
            }

            filterTeamsByCategory(cat) {
                this.applyTeamFilters();
            }

            renderClubes(filterText = '', filterCategory = 'all', sortMode = 'weighted') {
                const container = document.getElementById('teams-grid');
                if (!container) return;

                let list = Object.values(this.teamStats);

                if (filterText) {
                    list = list.filter(t => t.name.toLowerCase().includes(filterText.toLowerCase()));
                }

                if (filterCategory === 'reliable') {
                    list = list.filter(t => t.totalPicks > 0 && ((t.hits / t.totalPicks) * 100) >= 70);
                } else if (filterCategory === 'trap') {
                    list = list.filter(t => t.totalPicks > 0 && ((t.hits / t.totalPicks) * 100) < 50);
                } else if (filterCategory === 'min2') {
                    list = list.filter(t => t.totalMatches >= 2);
                } else if (filterCategory === 'min3') {
                    list = list.filter(t => t.totalMatches >= 3);
                } else if (filterCategory === 'min5') {
                    list = list.filter(t => t.totalMatches >= 5);
                }

                // Cálculo de métricas para cada equipo
                list.forEach(t => {
                    t.rate = t.totalPicks > 0 ? (t.hits / t.totalPicks) : 0;
                    t.pct = t.rate * 100;
                    // Score de fiabilidad ponderada: % acierto * sqrt(partidos)
                    // Con esto, 4 partidos al 92% (184 pts) supera limpiamente a 1 partido al 100% (100 pts)
                    t.weightedScore = t.pct * Math.sqrt(t.totalMatches);
                });

                // Ordenación según selección
                list.sort((a, b) => {
                    if (sortMode === 'weighted') {
                        if (Math.abs(b.weightedScore - a.weightedScore) > 0.01) {
                            return b.weightedScore - a.weightedScore;
                        }
                        return b.hits - a.hits;
                    } else if (sortMode === 'hits') {
                        if (b.hits !== a.hits) return b.hits - a.hits;
                        return b.pct - a.pct;
                    } else if (sortMode === 'rate') {
                        if (Math.abs(b.pct - a.pct) > 0.01) return b.pct - a.pct;
                        return b.totalMatches - a.totalMatches;
                    } else if (sortMode === 'matches') {
                        if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
                        return b.hits - a.hits;
                    }
                    return b.weightedScore - a.weightedScore;
                });

                if (list.length === 0) {
                    container.innerHTML = `
                        <div class="col-span-full py-8 text-center text-slate-400 font-mono text-xs">
                            No se encontraron clubes con los filtros seleccionados.
                        </div>
                    `;
                    return;
                }

                container.innerHTML = list.map((t, rankIdx) => {
                    const rate = t.pct;
                    const barColor = rate >= 70 ? 'from-emerald-500 to-teal-400' : (rate >= 50 ? 'from-blue-500 to-indigo-400' : 'from-rose-500 to-red-400');
                    const badgeClass = rate >= 70 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (rate >= 50 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400');

                    // Badge de representatividad de la muestra
                    let sampleBadge = '';
                    if (t.totalMatches >= 3) {
                        sampleBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" title="Muestra sólida (3 o más partidos)">🟢 Sólida</span>`;
                    } else if (t.totalMatches === 2) {
                        sampleBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400" title="Muestra media (2 partidos)">🟡 Media</span>`;
                    } else {
                        sampleBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-500/15 text-slate-500 dark:text-slate-400" title="1 solo partido. Muestra aislada">⚪ 1 partido</span>`;
                    }

                    const logoUrl = (typeof AppUtils !== 'undefined' && AppUtils.getTeamLogo) ? AppUtils.getTeamLogo(t.name) : '';
                    const logoHtml = logoUrl
                        ? `<img src="${logoUrl}" alt="${t.name}" class="w-6 h-6 object-contain flex-shrink-0 drop-shadow-xs" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline';">
                           <span style="display:none;" class="text-base flex-shrink-0">⚽</span>`
                        : `<span class="text-base flex-shrink-0">⚽</span>`;

                    return `
                        <div class="glass-panel p-3.5 flex flex-col justify-between hover:border-amber-500/40 transition">
                            <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800 gap-2">
                                <div class="flex items-center gap-2 truncate pr-1 min-w-0">
                                    <span class="text-[10px] font-mono font-bold text-slate-400">#${rankIdx + 1}</span>
                                    ${logoHtml}
                                    <span class="font-bold text-xs text-slate-900 dark:text-white truncate" title="${t.name}">
                                        ${t.name}
                                    </span>
                                </div>
                                <div class="flex items-center gap-1 flex-shrink-0">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${badgeClass}">
                                        ${rate.toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                            <div class="my-2">
                                <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-1.5">
                                    <div class="h-full bg-gradient-to-r ${barColor}" style="width: ${rate}%"></div>
                                </div>
                                <div class="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                    <span><strong>${t.hits}</strong>/${t.totalPicks} aciertos</span>
                                    <span><strong>${t.totalMatches}</strong> ${t.totalMatches === 1 ? 'partido' : 'partidos'}</span>
                                </div>
                            </div>
                            <div class="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-slate-400 font-mono">
                                <span title="Fórmula: % acierto × √partidos">Índice: <strong class="text-amber-500 font-bold">${t.weightedScore.toFixed(0)} pts</strong></span>
                                ${sampleBadge}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            /**
             * VISTA 4: Rendimiento por Jornada
             */
            renderJornadasPerformance() {
                const barContainer = document.getElementById('jornadas-performance-bars');
                const tableBody = document.getElementById('jornadas-summary-tbody');
                if (!barContainer || !tableBody) return;

                // Encontrar mejor y peor jornada
                let maxAvg = -1, minAvg = 15;
                this.jornadaPerformance.forEach(jp => {
                    if (jp.avgHits > maxAvg) maxAvg = jp.avgHits;
                    if (jp.avgHits < minAvg) minAvg = jp.avgHits;
                });

                // Barras interactivas
                barContainer.innerHTML = this.jornadaPerformance.map(jp => {
                    const isBest = jp.avgHits === maxAvg && maxAvg > 0;
                    const isWorst = jp.avgHits === minAvg;
                    const barH = Math.max(15, Math.min(100, (jp.avgHits / 14) * 100));

                    const barColor = isBest ? 'bg-amber-500' : (isWorst ? 'bg-rose-500' : 'bg-emerald-500');

                    return `
                        <div class="flex flex-col items-center gap-1.5 flex-shrink-0 w-11 sm:w-14 group cursor-pointer"
                             onclick="window.ResumenApp.openJornadaEscrutinio(${jp.number})">
                            <span class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">${jp.avgHits.toFixed(1)}</span>
                            <div class="w-full h-32 bg-slate-200 dark:bg-slate-900 rounded-lg p-0.5 flex items-end relative overflow-hidden group-hover:border group-hover:border-amber-500/60 transition">
                                <div class="w-full ${barColor} rounded transition-all duration-500" style="height: ${barH}%"></div>
                                ${jp.prizesTotal > 0 ? '<span class="absolute top-1 right-1 text-[10px]">💰</span>' : ''}
                                ${jp.hasPig ? '<span class="absolute top-1 left-1 text-[10px]">🐷</span>' : ''}
                            </div>
                            <span class="text-[10px] font-mono font-bold text-slate-500 group-hover:text-amber-500 transition">J${jp.number}</span>
                        </div>
                    `;
                }).join('');

                // Tabla resumen de jornadas
                tableBody.innerHTML = this.jornadaPerformance.map(jp => {
                    const prizeStr = jp.prizesTotal > 0 ? this.formatMoney(jp.prizesTotal) : '-';
                    const isBest = jp.avgHits === maxAvg && maxAvg > 0;

                    return `
                        <tr class="hover:bg-slate-100/50 dark:hover:bg-slate-800/40">
                            <td class="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                                Jornada ${jp.number} ${isBest ? '👑' : ''}
                            </td>
                            <td class="py-2 px-3 text-slate-500 font-sans">${jp.date}</td>
                            <td class="py-2 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">${jp.pctAcierto.toFixed(1)}%</td>
                            <td class="py-2 px-3 text-center font-black">${jp.avgHits.toFixed(1)}/14</td>
                            <td class="py-2 px-3 text-center font-sans font-semibold text-slate-700 dark:text-slate-300">
                                ${jp.bestMember.name ? `${jp.bestMember.name} (${jp.bestMember.hits} ac.)` : '-'}
                            </td>
                            <td class="py-2 px-3 text-center text-purple-600 dark:text-purple-400 font-bold">${prizeStr}</td>
                            <td class="py-2 px-3 text-center">${jp.hasPig ? '🐷 PIG' : '-'}</td>
                        </tr>
                    `;
                }).join('');
            }

            openJornadaEscrutinio(jNum) {
                const jp = this.jornadaPerformance.find(x => x.number === jNum);
                if (!jp) return;

                const modal = document.getElementById('resumen-detail-modal');
                const title = document.getElementById('modal-detail-title');
                const content = document.getElementById('modal-detail-content');

                title.textContent = `Escrutinio Colectivo · Jornada ${jNum}`;

                const j = jp.jornada;
                let html = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                            <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">Media de la Peña</span>
                                <strong class="text-xl font-mono font-black text-emerald-500">${jp.avgHits.toFixed(1)} / 14</strong>
                            </div>
                            <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">Acierto %</span>
                                <strong class="text-xl font-mono font-black text-slate-900 dark:text-white">${jp.pctAcierto.toFixed(1)}%</strong>
                            </div>
                            <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">Mejor Pronosticador</span>
                                <strong class="text-sm font-bold text-amber-500">${jp.bestMember.name || '-'}</strong>
                            </div>
                            <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">Premios Bote</span>
                                <strong class="text-sm font-mono font-black text-purple-500">${this.formatMoney(jp.prizesTotal)}</strong>
                            </div>
                        </div>

                        <h4 class="text-xs font-black uppercase text-slate-600 dark:text-slate-400">Resultados Oficiales</h4>
                        <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table class="w-full text-xs text-left">
                                <thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold">
                                    <tr>
                                        <th class="py-1.5 px-3 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'number')">
                                            <div class="inline-flex items-center justify-center gap-1"><span>#</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                        </th>
                                        <th class="py-1.5 px-3 cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                            <div class="inline-flex items-center gap-1"><span>Partido</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                        </th>
                                        <th class="py-1.5 px-3 text-center cursor-pointer hover:text-white select-none transition-colors" data-sortable="true" onclick="window.AppTableSorter.sortColumn(this, 'text')">
                                            <div class="inline-flex items-center justify-center gap-1"><span>Resultado</span><span class="sort-icon text-[10px] opacity-70">↕</span></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                                    ${(j.matches || []).map((m, idx) => `
                                        <tr>
                                            <td class="py-1.5 px-3 text-center text-slate-400 font-bold">${idx + 1}</td>
                                            <td class="py-1.5 px-3 font-sans font-semibold">${m.home} - ${m.away}</td>
                                            <td class="py-1.5 px-3 text-center font-bold text-amber-500">${m.result}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                content.innerHTML = html;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                modal.style.display = 'flex';
            }

            /**
             * VISTA 5: Quinielas de Dobles (Reducidas)
             */
            renderDobles() {
                const tbody = document.getElementById('dobles-history-tbody');
                if (!tbody) return;

                const doblesList = [];
                let totalHitsDobles = 0;
                let totalVentaja = 0;

                this.pronosticosExtra.forEach(p => {
                    const m = this.members.find(mem => mem.id == (p.mId || p.memberId));
                    const j = this.playedJornadas.find(jor => jor.id == (p.jId || p.jornadaId));

                    if (m && j) {
                        const offResults = (j.matches || []).map(mat => mat.result);
                        let hits = 0;
                        const sel = p.selection || [];

                        sel.forEach((s, idx) => {
                            if (idx < 14 && offResults[idx] && s && s.includes(offResults[idx])) hits++;
                        });

                        // Comparar con la media de la peña en esa jornada
                        const jp = this.jornadaPerformance.find(x => x.number === j.number);
                        const avgSencilla = jp ? jp.avgHits : 0;
                        const diff = hits - avgSencilla;

                        totalHitsDobles += hits;
                        totalVentaja += diff;

                        doblesList.push({
                            jNum: j.number,
                            member: m,
                            memberName: AppUtils.getMemberName(m),
                            hits: hits,
                            diff: diff,
                            selection: sel
                        });
                    }
                });

                const doblesPrizesInfo = this.calculateDoublesPrizes();
                const doblesPrizesMap = doblesPrizesInfo.map;

                doblesList.forEach(d => {
                    const pInfo = doblesPrizesMap.get(String(d.jNum)) || doblesPrizesMap.get(String(d.jId));
                    d.prize = pInfo ? pInfo.amount : 0;
                });

                doblesList.sort((a, b) => b.jNum - a.jNum);

                const count = doblesList.length;
                document.getElementById('dobles-stat-total').textContent = count;
                const mediaDobles = count > 0 ? (totalHitsDobles / count).toFixed(1) : '0.0';
                document.getElementById('dobles-stat-media').textContent = `${mediaDobles} / 14`;
                const mediaVentaja = count > 0 ? (totalVentaja / count).toFixed(1) : '0.0';
                document.getElementById('dobles-stat-ventaja').textContent = `+${mediaVentaja} aciertos`;
                const doblesStatPremiosEl = document.getElementById('dobles-stat-premios');
                if (doblesStatPremiosEl) doblesStatPremiosEl.textContent = this.formatMoney(doblesPrizesInfo.total);

                if (count === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-500 font-sans">Aún no se han disputado quinielas de dobles esta temporada.</td></tr>`;
                    return;
                }

                tbody.innerHTML = doblesList.map(d => {
                    const badgeColor = d.hits >= 12 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (d.hits >= 10 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400');
                    const diffColor = d.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
                    const prizeBadge = d.prize > 0 ? `<span class="px-2 py-0.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-600 dark:text-purple-400">${this.formatMoney(d.prize)}</span>` : '<span class="text-slate-400">-</span>';

                    return `
                        <tr class="hover:bg-slate-100/50 dark:hover:bg-slate-800/40">
                            <td class="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">Jornada ${d.jNum}</td>
                            <td class="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span class="text-amber-500">⭐</span> <span>${d.memberName}</span>
                            </td>
                            <td class="py-2.5 px-3 text-center">
                                <span class="px-2.5 py-0.5 rounded-full text-xs font-black ${badgeColor}">
                                    ${d.hits} aciertos
                                </span>
                            </td>
                            <td class="py-2.5 px-3 text-center font-bold ${diffColor}">
                                ${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(1)} vs sencilla
                            </td>
                            <td class="py-2.5 px-3 text-center font-mono font-bold">
                                ${prizeBadge}
                            </td>
                            <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate" title="${d.selection.join(', ')}">
                                ${d.selection.slice(0, 14).join(', ')}
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            /**
             * VISTA 6: Duelo Directo 1 vs 1
             */
            initDueloSelectors() {
                const selA = document.getElementById('duelo-select-a');
                const selB = document.getElementById('duelo-select-b');
                if (!selA || !selB) return;

                const sorted = Object.values(this.memberStats).sort((a, b) => a.name.localeCompare(b.name));

                const optionsHtml = sorted.map(s => `<option value="${s.member.id}">${s.name}</option>`).join('');
                selA.innerHTML = optionsHtml;
                selB.innerHTML = optionsHtml;

                // Seleccionar socio 6 (Fernando) o el primero si no existe, y el segundo
                if (sorted.some(s => s.member.id == 6)) {
                    selA.value = '6';
                    selB.value = sorted.find(s => s.member.id != 6)?.member.id || sorted[1].member.id;
                } else if (sorted.length >= 2) {
                    selA.value = sorted[0].member.id;
                    selB.value = sorted[1].member.id;
                }

                this.updateDuelo();
            }

            updateDuelo() {
                const idA = parseInt(document.getElementById('duelo-select-a').value);
                const idB = parseInt(document.getElementById('duelo-select-b').value);

                const sA = this.memberStats[idA];
                const sB = this.memberStats[idB];
                if (!sA || !sB) return;

                document.getElementById('duelo-name-a').textContent = sA.name;
                document.getElementById('duelo-name-b').textContent = sB.name;
                const legA = document.getElementById('duelo-legend-name-a');
                const legB = document.getElementById('duelo-legend-name-b');
                if (legA) legA.textContent = sA.name;
                if (legB) legB.textContent = sB.name;

                // Enfrentamiento jornada a jornada
                let winsA = 0, winsB = 0, empates = 0, totalJ = 0;

                this.playedJornadas.forEach(j => {
                    const hA = sA.history.find(h => h.jNum === j.number);
                    const hB = sB.history.find(h => h.jNum === j.number);

                    if (hA && hB && hA.dayHits !== -1 && hB.dayHits !== -1) {
                        totalJ++;
                        if (hA.dayPoints > hB.dayPoints) winsA++;
                        else if (hB.dayPoints > hA.dayPoints) winsB++;
                        else empates++;
                    }
                });

                document.getElementById('duelo-victorias-a').textContent = winsA;
                document.getElementById('duelo-victorias-b').textContent = winsB;
                document.getElementById('duelo-empates').textContent = `${empates} Empates`;
                document.getElementById('duelo-total-jornadas').textContent = `de ${totalJ} jornadas disputadas`;

                // Comparativa métrica a métrica
                const metrics = [
                    { label: 'Puntos Totales General', valA: sA.grandTotal, valB: sB.grandTotal, suffix: ' pts', higherBetter: true },
                    { label: 'Aciertos Base', valA: sA.baseTotal, valB: sB.baseTotal, suffix: '', higherBetter: true },
                    { label: 'Bonus Neto Ganado', valA: sA.bonusTotal, valB: sB.bonusTotal, suffix: ' pts', higherBetter: true },
                    { label: 'Premios en Metálico', valA: sA.prizesTotal, valB: sB.prizesTotal, suffix: '', higherBetter: true, isMoney: true },
                    { label: 'Mejor Boleto Temporada', valA: sA.bestHits, valB: sB.bestHits, suffix: ' aciertos', higherBetter: true },
                    { label: 'Jornadas con Puntos (>=10)', valA: sA.jornadasWithPoints, valB: sB.jornadasWithPoints, suffix: '', higherBetter: true }
                ];

                const container = document.getElementById('duelo-metrics-container');
                container.innerHTML = metrics.map(m => {
                    const strA = m.isMoney ? this.formatMoney(m.valA) : `${m.valA}${m.suffix}`;
                    const strB = m.isMoney ? this.formatMoney(m.valB) : `${m.valB}${m.suffix}`;

                    const winA = m.valA > m.valB;
                    const winB = m.valB > m.valA;

                    return `
                        <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                            <span class="font-mono font-black ${winA ? 'text-amber-500 font-extrabold text-sm' : 'text-slate-600 dark:text-slate-400'}">${strA}</span>
                            <span class="font-sans font-bold text-slate-700 dark:text-slate-300 text-center uppercase text-[11px]">${m.label}</span>
                            <span class="font-mono font-black ${winB ? 'text-sky-500 font-extrabold text-sm' : 'text-slate-600 dark:text-slate-400'}">${strB}</span>
                        </div>
                    `;
                }).join('');

                // Renderizar Gráfico de Radar
                this.renderDueloRadar(sA, sB);
            }

            renderDueloRadar(sA, sB) {
                const canvas = document.getElementById('dueloRadarCanvas');
                if (!canvas || typeof Chart === 'undefined') return;

                // Máximos de referencia de la peña para normalizar los ejes (0 a 100)
                let maxPts = 1, maxHits = 1, maxBonus = 1, maxPrizes = 1, maxBestHits = 14, maxReg = 100;
                Object.values(this.memberStats).forEach(s => {
                    if (s.grandTotal > maxPts) maxPts = s.grandTotal;
                    if (s.baseTotal > maxHits) maxHits = s.baseTotal;
                    if (s.bonusTotal > maxBonus) maxBonus = s.bonusTotal;
                    if (s.prizesTotal > maxPrizes) maxPrizes = s.prizesTotal;
                    if (s.bestHits > maxBestHits) maxBestHits = s.bestHits;
                });

                const calcPct = (val, max) => Math.min(100, Math.max(0, Math.round((val / Math.max(1, max)) * 100)));

                // 6 Dimensiones clave del perfil deportivo
                // 1. Puntos (General)
                // 2. Precisión (Aciertos Base)
                // 3. Pegada / Plenos (Bonus Ganado)
                // 4. Regularidad (% de jornadas en zona de puntos >=10)
                // 5. Pico Máximo (Mejor jornada de la temporada)
                // 6. Fortuna / Botes (Premios en metálico)
                const regA = sA.jornadasPlayed > 0 ? ((sA.jornadasWithPoints / sA.jornadasPlayed) * 100) : 0;
                const regB = sB.jornadasPlayed > 0 ? ((sB.jornadasWithPoints / sB.jornadasPlayed) * 100) : 0;

                const dataA = [
                    calcPct(sA.grandTotal, maxPts),
                    calcPct(sA.baseTotal, maxHits),
                    calcPct(Math.max(0, sA.bonusTotal), maxBonus),
                    Math.round(regA),
                    calcPct(sA.bestHits, maxBestHits),
                    calcPct(sA.prizesTotal, maxPrizes)
                ];

                const dataB = [
                    calcPct(sB.grandTotal, maxPts),
                    calcPct(sB.baseTotal, maxHits),
                    calcPct(Math.max(0, sB.bonusTotal), maxBonus),
                    Math.round(regB),
                    calcPct(sB.bestHits, maxBestHits),
                    calcPct(sB.prizesTotal, maxPrizes)
                ];

                const labels = [
                    'Puntos Totales',
                    'Precisión (Aciertos)',
                    'Pegada (Bonus)',
                    'Regularidad',
                    'Pico Máximo',
                    'Fortuna (Premios)'
                ];

                const isLight = document.documentElement.classList.contains('light-theme');
                const gridColor = isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(51, 65, 85, 0.55)';
                const labelColor = isLight ? '#334155' : '#cbd5e1';
                const angleLineColor = isLight ? 'rgba(148, 163, 184, 0.4)' : 'rgba(71, 85, 105, 0.5)';

                if (this.dueloRadarChart) {
                    this.dueloRadarChart.destroy();
                }

                this.dueloRadarChart = new Chart(canvas, {
                    type: 'radar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: sA.name,
                                data: dataA,
                                backgroundColor: 'rgba(245, 158, 11, 0.25)',
                                borderColor: '#f59e0b',
                                borderWidth: 2.5,
                                pointBackgroundColor: '#f59e0b',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 1.5,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            },
                            {
                                label: sB.name,
                                data: dataB,
                                backgroundColor: 'rgba(14, 165, 233, 0.25)',
                                borderColor: '#0ea5e9',
                                borderWidth: 2.5,
                                pointBackgroundColor: '#0ea5e9',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 1.5,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: {
                            duration: 500
                        },
                        scales: {
                            r: {
                                min: 0,
                                max: 100,
                                ticks: {
                                    display: false,
                                    stepSize: 25
                                },
                                grid: {
                                    color: gridColor,
                                    lineWidth: 1
                                },
                                angleLines: {
                                    color: angleLineColor,
                                    lineWidth: 1
                                },
                                pointLabels: {
                                    color: labelColor,
                                    font: {
                                        family: "'Plus Jakarta Sans', sans-serif",
                                        size: 10.5,
                                        weight: '700'
                                    },
                                    padding: 10
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                backgroundColor: isLight ? 'rgba(15, 23, 42, 0.95)' : 'rgba(3, 7, 18, 0.95)',
                                titleColor: '#fbbf24',
                                bodyColor: '#ffffff',
                                borderColor: 'rgba(245, 158, 11, 0.4)',
                                borderWidth: 1,
                                padding: 10,
                                cornerRadius: 10,
                                callbacks: {
                                    label: (context) => {
                                        return ` ${context.dataset.label}: ${context.raw}% de índice relativo`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            /**
             * Cambiar de vista principal (Evolución, Casillas, Clubes, Jornadas, Dobles, Duelo)
             */
            switchView(viewName) {
                this.activeView = viewName;

                const views = ['evolucion', 'casillas', 'clubes', 'jornadas', 'dobles', 'duelo'];
                views.forEach(v => {
                    const container = document.getElementById(`view-container-${v}`);
                    const btn = document.getElementById(`tab-btn-${v}`);
                    if (container) {
                        if (v === viewName) {
                            container.classList.remove('hidden');
                        } else {
                            container.classList.add('hidden');
                        }
                    }
                    if (btn) {
                        if (v === viewName) {
                            btn.className = 'tab-btn-active px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 border border-transparent';
                        } else {
                            btn.className = 'px-3 sm:px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 transition flex items-center gap-1.5 flex-shrink-0';
                        }
                    }
                });

                // Actualizar indicador y marcas de verificación en móvil
                const viewMeta = {
                    'evolucion': { icon: '📈', name: 'Evolución' },
                    'casillas': { icon: '🎯', name: 'Radiografía 1-14' },
                    'clubes': { icon: '⚽', name: 'Radar Clubes' },
                    'jornadas': { icon: '📊', name: 'Rendimiento Jornadas' },
                    'dobles': { icon: '✌️', name: 'Dobles' },
                    'duelo': { icon: '⚡', name: 'Duelo 1 vs 1' }
                };
                const meta = viewMeta[viewName] || { icon: '📊', name: viewName };
                const mobIcon = document.getElementById('mobile-active-view-icon');
                const mobName = document.getElementById('mobile-active-view-name');
                if (mobIcon) mobIcon.textContent = meta.icon;
                if (mobName) mobName.textContent = meta.name;

                views.forEach(v => {
                    const check = document.getElementById(`mobile-check-${v}`);
                    if (check) {
                        if (v === viewName) check.classList.remove('hidden');
                        else check.classList.add('hidden');
                    }
                });

                const evoActions = document.getElementById('mobile-resumen-evolucion-actions');
                if (evoActions) {
                    if (viewName === 'evolucion') evoActions.classList.remove('hidden');
                    else evoActions.classList.add('hidden');
                }

                if (viewName === 'evolucion' && this.chart) {
                    this.chart.resize();
                }

                const targetEl = document.getElementById(`view-container-${viewName}`);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }

            /**
             * Manejo de selección de socios en gráfica
             */
            toggleMemberSelection(id) {
                if (this.selectedMembers.has(id)) {
                    this.selectedMembers.delete(id);
                } else {
                    if (this.selectedMembers.size >= 5) {
                        alert('Puedes comparar hasta un máximo de 5 socios a la vez en la gráfica.');
                        return;
                    }
                    this.selectedMembers.add(id);
                }
                this.renderChart();
            }

            selectTop(n) {
                const sorted = Object.values(this.memberStats).sort((a, b) => b.grandTotal - a.grandTotal);
                this.selectedMembers.clear();
                sorted.slice(0, n).forEach(s => this.selectedMembers.add(s.member.id));
                this.renderChart();
            }

            selectAllMembers() {
                this.selectedMembers.clear();
                this.members.slice(0, 5).forEach(m => this.selectedMembers.add(m.id));
                this.renderChart();
            }

            clearSelection() {
                this.selectedMembers.clear();
                this.renderChart();
            }

            /**
             * Zoom y deslizador de jornadas
             */
            setZoomPreset(val) {
                if (val === 'all') {
                    this.viewJornadasCount = this.totalJornadas;
                    this.viewOffset = 0;
                } else {
                    this.viewJornadasCount = Math.min(this.totalJornadas, parseInt(val));
                    this.viewOffset = Math.max(0, this.totalJornadas - this.viewJornadasCount);
                }
                this.renderChart();
            }

            initZoomSliders() {
                const zSlider = document.getElementById('chart-zoom-slider');
                const oSlider = document.getElementById('chart-offset-slider');
                if (!zSlider || !oSlider) return;

                zSlider.max = this.totalJornadas;
                zSlider.value = this.totalJornadas;

                zSlider.addEventListener('input', (e) => {
                    this.viewJornadasCount = parseInt(e.target.value);
                    const maxOffset = Math.max(0, this.totalJornadas - this.viewJornadasCount);
                    if (this.viewOffset > maxOffset) this.viewOffset = maxOffset;
                    this.renderChart();
                });

                oSlider.addEventListener('input', (e) => {
                    this.viewOffset = parseInt(e.target.value);
                    this.renderChart();
                });
            }

            updateZoomControlsUI() {
                const zSlider = document.getElementById('chart-zoom-slider');
                const oSlider = document.getElementById('chart-offset-slider');
                const zLabel = document.getElementById('chart-zoom-label');
                const oLabel = document.getElementById('chart-offset-label');
                const oContainer = document.getElementById('offset-container');

                if (!zSlider || !oSlider) return;

                zSlider.max = this.totalJornadas;
                zSlider.value = this.viewJornadasCount;

                if (this.viewJornadasCount >= this.totalJornadas) {
                    zLabel.textContent = 'Toda';
                    if (oContainer) oContainer.style.opacity = '0.35';
                } else {
                    zLabel.textContent = `${this.viewJornadasCount} J`;
                    if (oContainer) oContainer.style.opacity = '1';
                }

                const maxOffset = Math.max(0, this.totalJornadas - this.viewJornadasCount);
                oSlider.max = maxOffset;
                oSlider.value = this.viewOffset;

                const firstJ = this.viewOffset + 1;
                const lastJ = Math.min(this.totalJornadas, this.viewOffset + this.viewJornadasCount);
                oLabel.textContent = `J${firstJ}—J${lastJ}`;
            }

            updateChartTheme() {
                setTimeout(() => {
                    if (this.chart) this.renderChart();
                }, 50);
            }

            /**
             * SISTEMA DE TARJETAS EXPLICATIVAS FLOTANTES (#resumen-floating-card)
             */
            initFloatingCards() {
                document.addEventListener('mouseover', (e) => {
                    const target = e.target.closest('[data-card-type]');
                    if (!target) {
                        this.hideFloatingCard();
                        return;
                    }

                    const type = target.getAttribute('data-card-type');
                    const content = this.generateExplanatoryCardContent(type);
                    if (content) {
                        this.showFloatingCard(e, content.html, content.theme);
                    }
                });

                document.addEventListener('mousemove', (e) => {
                    const target = e.target.closest('[data-card-type]');
                    if (target) {
                        this.positionFloatingCard(e);
                    }
                });

                document.addEventListener('mouseleave', () => {
                    this.hideFloatingCard();
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closeDetailModal();
                    }
                });
            }

            generateExplanatoryCardContent(type) {
                if (type === 'kpi-efectividad') {
                    return {
                        theme: 'emerald',
                        html: `
                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between pb-1 border-b border-emerald-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/50">
                                        🎯 Efectividad Colectiva
                                    </span>
                                    <span class="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">${this.globalPctAcierto.toFixed(1)}%</span>
                                </div>
                                <p class="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                    Porcentaje de signos acertados por toda la peña sobre los 14 partidos base de cada boleto oficial.
                                </p>
                                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-mono space-y-0.5">
                                    <div class="flex justify-between"><span>Aciertos medios:</span><strong class="text-emerald-600 dark:text-emerald-400">${this.globalAvgHits.toFixed(1)} / 14</strong></div>
                                    <div class="flex justify-between"><span>Jornadas evaluadas:</span><strong>${this.totalJornadas}</strong></div>
                                </div>
                            </div>
                        `
                    };
                }

                if (type === 'kpi-bombazo') {
                    return {
                        theme: 'amber',
                        html: `
                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between pb-1 border-b border-amber-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/50">
                                        🚀 Récord en 1 Boleto
                                    </span>
                                    <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">Pico Máximo</span>
                                </div>
                                <p class="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                    El mejor boleto individual de un socio en una sola jornada en toda la temporada.
                                </p>
                                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-mono space-y-0.5">
                                    <div class="flex justify-between"><span>Bonus otorgado:</span><strong class="text-emerald-600 dark:text-emerald-400">+30 / +15 pts</strong></div>
                                    <div class="flex justify-between"><span>Impacto:</span><strong>Impulsa al socio al liderato</strong></div>
                                </div>
                            </div>
                        `
                    };
                }

                if (type === 'kpi-premios') {
                    return {
                        theme: 'purple',
                        html: `
                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between pb-1 border-b border-purple-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/50">
                                        💰 Premios Oficiales
                                    </span>
                                    <span class="text-xs font-mono font-black text-purple-600 dark:text-purple-400">Botes LAE</span>
                                </div>
                                <p class="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                    Dinero en metálico acumulado en botes oficiales de Loterías y Apuestas del Estado (tanto por las quinielas individuales de los socios como por las quinielas de dobles).
                                </p>
                                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-mono">
                                    <span>Notación española estricta (puntos de millar y coma decimal).</span>
                                </div>
                            </div>
                        `
                    };
                }

                if (type === 'kpi-fiabilidad') {
                    return {
                        theme: 'blue',
                        html: `
                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between pb-1 border-b border-blue-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-800 dark:text-blue-300 border border-blue-500/50">
                                        🛡️ Míster Regularidad
                                    </span>
                                    <span class="text-xs font-mono font-black text-blue-600 dark:text-blue-400">Constancia</span>
                                </div>
                                <p class="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                    Premia al socio con mayor porcentaje de jornadas alcanzando la zona de puntos (mínimo 10 aciertos).
                                </p>
                                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-mono">
                                    <span>Mayor fiabilidad = Menos fallos catastróficos.</span>
                                </div>
                            </div>
                        `
                    };
                }

                if (type === 'kpi-equipos') {
                    return {
                        theme: 'orange',
                        html: `
                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between pb-1 border-b border-orange-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/20 text-orange-800 dark:text-orange-300 border border-orange-500/50">
                                        ⚽ Radar de Clubes
                                    </span>
                                    <span class="text-xs font-mono font-black text-orange-600 dark:text-orange-400">Fiabilidad</span>
                                </div>
                                <p class="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                    Identifica el equipo donde la peña más acierta (Talismán) y el equipo con mayor índice de errores (Trampa).
                                </p>
                            </div>
                        `
                    };
                }

                return null;
            }

            showFloatingCard(e, htmlContent, theme = 'amber') {
                const card = document.getElementById('resumen-floating-card');
                if (!card) return;

                card.innerHTML = htmlContent;

                if (theme === 'emerald') card.style.borderColor = 'rgba(16, 185, 129, 0.85)';
                else if (theme === 'purple') card.style.borderColor = 'rgba(168, 85, 247, 0.85)';
                else if (theme === 'blue') card.style.borderColor = 'rgba(59, 130, 246, 0.85)';
                else if (theme === 'orange') card.style.borderColor = 'rgba(249, 115, 22, 0.85)';
                else card.style.borderColor = 'rgba(245, 158, 11, 0.85)';

                card.classList.remove('hidden');
                this.positionFloatingCard(e);

                requestAnimationFrame(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                });
            }

            positionFloatingCard(e) {
                const card = document.getElementById('resumen-floating-card');
                if (!card || card.classList.contains('hidden')) return;

                const rect = card.getBoundingClientRect();
                const cardW = rect.width || 280;
                const cardH = rect.height || 140;

                let targetX = e.clientX + 14;
                let targetY = e.clientY + 14;

                if (targetX + cardW > window.innerWidth - 14) {
                    targetX = e.clientX - cardW - 14;
                }
                if (targetY + cardH > window.innerHeight - 14) {
                    targetY = e.clientY - cardH - 14;
                }

                targetX = Math.max(10, Math.min(targetX, window.innerWidth - cardW - 10));
                targetY = Math.max(10, Math.min(targetY, window.innerHeight - cardH - 10));

                card.style.left = `${targetX}px`;
                card.style.top = `${targetY}px`;
            }

            hideFloatingCard() {
                const card = document.getElementById('resumen-floating-card');
                if (!card) return;
                card.style.opacity = '0';
                card.style.transform = 'scale(0.96)';
                setTimeout(() => {
                    if (card.style.opacity === '0') {
                        card.classList.add('hidden');
                    }
                }, 150);
            }

            /**
             * Muestra el modal explicativo al tocar un indicador en móvil
             */
            openKpiDetail(type) {
                const contentData = this.generateExplanatoryCardContent(type);
                if (!contentData) return;
                const modal = document.getElementById('resumen-detail-modal');
                const title = document.getElementById('modal-detail-title');
                const content = document.getElementById('modal-detail-content');
                if (!modal || !title || !content) return;

                const titles = {
                    'kpi-efectividad': '🎯 Efectividad Colectiva de la Peña',
                    'kpi-bombazo': '🚀 Récord en 1 Boleto',
                    'kpi-premios': '💰 Premios Oficiales en Metálico',
                    'kpi-fiabilidad': '🛡️ Míster Regularidad',
                    'kpi-equipos': '⚽ Radar de Clubes: Talismán vs Trampa'
                };

                title.textContent = titles[type] || 'Detalle del Indicador';
                content.innerHTML = `<div class="p-2 sm:p-4 text-xs sm:text-sm">${contentData.html}</div>`;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                modal.style.display = 'flex';
            }

            closeDetailModal() {
                const modal = document.getElementById('resumen-detail-modal');
                if (modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    modal.style.display = 'none';
                }
            }
        }

        // Inicializar aplicación al cargar el DOM
        document.addEventListener('DOMContentLoaded', () => {
            window.ResumenApp = new Resumen2App();
        });
