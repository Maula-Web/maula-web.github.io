        class Clasificacion2App {
            constructor() {
                this.members = [];
                this.jornadas = [];
                this.pronosticos = [];
                this.memberStats = {};
                this.sortedRanking = [];
                this.currentView = 'ranking'; // RANKING POR DEFECTO
                this.activeCategoryFilter = 'all';
                this.searchQuery = '';
                this.chartSelectedMembers = new Set();
                this.chartMode = 'ranks'; // 'ranks' (Puesto #1-#19) o 'gap' (Distancia en pts al líder)
                this.hoveredMemberId = null;
                this.rankingSort = { col: 'rank', dir: 'asc' };
                this.chartColors = [
                    '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6',
                    '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#14b8a6',
                    '#d946ef', '#f43f5e', '#eab308', '#22c55e', '#a855f7',
                    '#38bdf8', '#fb923c', '#a3e635', '#94a3b8'
                ];

                this.initFloatingCardListeners();
                this.init();
            }

            /**
             * Formatea importes en notación española estricta (puntos de millar y coma decimal)
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

                    console.log("[Clasificacion2] Cargando datos oficiales...");
                    const data = await window.DataService.loadSeasonData();
                    this.members = data.members || [];
                    this.jornadas = (data.jornadas || []).sort((a, b) => b.number - a.number);
                    this.pronosticos = data.pronosticos || [];
                    this.pronosticosExtra = data.pronosticosExtra || [];

                    // Calcular y organizar todas las estadísticas
                    this.calculateStats();

                    // Renderizar Podio, Bento KPIs y Tabla de Ranking inmediatamente
                    this.renderPodium();
                    this.renderKPIs();
                    this.renderRankingTable();

                    // Pre-render diferido en segundo plano (requestIdleCallback) para no bloquear la pintura inicial
                    const deferBackgroundRender = () => {
                        if (!this.matrixRendered) this.renderMatrixTable();
                        if (!this.chartInitialized) this.initChart();
                    };
                    if (typeof window !== 'undefined' && window.requestIdleCallback) {
                        window.requestIdleCallback(deferBackgroundRender, { timeout: 2000 });
                    } else {
                        setTimeout(deferBackgroundRender, 250);
                    }

                    // Actualizar contador de jornadas en título
                    const badgeJ = document.getElementById('badge-total-jornadas-text') || document.getElementById('badge-total-jornadas');
                    const disputadas = this.jornadas.filter(j => j.matches && j.matches.some(m => m.result && m.result.trim() !== '')).length;
                    if (badgeJ) badgeJ.textContent = `${disputadas} Jornadas disputadas`;

                    // Redimensionar gráfico y ajustar tabla en resize de ventana
                    window.addEventListener('resize', () => {
                        if (this.currentView === 'chart') {
                            this.renderChartSVG();
                        } else if (this.currentView === 'matrix') {
                            this.adjustMatrixStickyHeaders();
                        }
                    });

                    // Comprobar parámetros de URL o anclaje para abrir la vista solicitada (ej: Matriz Histórica)
                    try {
                        const urlParams = new URLSearchParams(window.location.search);
                        const viewParam = (urlParams.get('view') || urlParams.get('tab') || '').toLowerCase();
                        const hashParam = (window.location.hash || '').toLowerCase();

                        if (viewParam === 'matrix' || viewParam === 'matriz' || hashParam === '#view-matrix' || hashParam === '#matriz') {
                            if (!this.matrixRendered) this.renderMatrixTable();
                            this.switchView('matrix');
                            setTimeout(() => {
                                const targetEl = document.getElementById('view-matrix') || document.querySelector('.view-switcher-box');
                                if (targetEl) {
                                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }, 120);
                        }
                    } catch (eParam) {
                        console.warn("[Clasificacion2] Error leyendo parámetros de vista:", eParam);
                    }

                } catch (err) {
                    console.error("[Clasificacion2] Error en init:", err);
                }
            }

            // --- FASE DE CÁLCULO DIRECTO SIN RECALCULAR REGLAS ---
            // Calcular importe total acumulado en la quiniela de dobles
            calculateDoublesPrizes() {
                let totalDobles = 0;
                let jornadasPremiadas = 0;
                if (!this.pronosticosExtra || !Array.isArray(this.pronosticosExtra) || this.pronosticosExtra.length === 0) {
                    return { total: 0, count: 0 };
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
                                jornadasPremiadas++;
                            }
                        });
                    }
                });

                return { total: totalDobles, count: jornadasPremiadas };
            }

            calculateStats() {
                const visibleJornadas = this.jornadas.filter(j => {
                    if (!j.active) {
                        const hasResult = j.matches && j.matches.some(m => m.result && m.result.trim() !== '');
                        const hasForecast = this.pronosticos.some(p => String(p.jId) === String(j.id));
                        return hasResult || hasForecast;
                    }
                    return true;
                }).sort((a, b) => b.number - a.number);

                this.visibleJornadas = visibleJornadas;

                // Estructura de estadísticas por socio
                this.memberStats = {};
                this.members.forEach(m => {
                    this.memberStats[m.id] = {
                        member: m,
                        name: AppUtils.getMemberName(m),
                        grandTotal: 0,
                        baseTotal: 0,
                        bonusTotal: 0,
                        positiveBonus: 0,
                        negativePenalties: 0,
                        prizeTotal: 0,
                        jornadasPlayed: 0,
                        bonusCounts: { 15: 0, 14: 0, 13: 0, 12: 0, 11: 0, 10: 0 },
                        penaltyCounts: { low: 0, late: 0 },
                        recentForm: [], // Últimas 5 jornadas con aciertos
                        jornadaData: {}, // { jId: { hits, points, bonus, prize, isLate, isPardoned, potentialHits, pigHit } }
                        prizesList: [], // { jNum, amount, hits }
                        penaltiesList: [], // { jNum, penalty, reason }
                        winsList: [], // { jNum, points, hits, bonus, prize }
                        bonusList: [] // { jNum, bonus, hits }
                    };
                });

                // Mapa O(1) de pronósticos
                const pronosticosMap = new Map();
                (this.pronosticos || []).forEach(p => {
                    if (!p) return;
                    const jIds = [p.jId, p.jornadaId].filter(x => x !== undefined && x !== null).map(String);
                    const mIds = [p.mId, p.memberId].filter(x => x !== undefined && x !== null).map(String);
                    jIds.forEach(jId => {
                        mIds.forEach(mId => {
                            pronosticosMap.set(`${jId}_${mId}`, p);
                        });
                    });
                });

                visibleJornadas.forEach(j => {
                    let maxScore = -Infinity;
                    let minScore = Infinity;

                    // Evaluar si la jornada está finalizada o en juego
                    const filledMatches = j.matches ? j.matches.filter(m => m.result && m.result.trim() !== '' && m.result.trim() !== '-').length : 0;
                    const jDate = window.AppUtils ? window.AppUtils.parseDate(j.date) : new Date(j.date);
                    const now = new Date();
                    const isExplicitInactive = j.active === false;
                    const isAllFilled = filledMatches === 15;
                    const isPastDate = jDate && (now.getTime() - jDate.getTime() > 5 * 24 * 60 * 60 * 1000);
                    
                    // Una jornada está en juego si tiene partidos con resultado pero aún no se han completado los 15
                    const isInPlay = !isExplicitInactive && (filledMatches > 0 && filledMatches < 15);
                    const isFinished = isExplicitInactive || isAllFilled || (isPastDate && filledMatches === 15);
                    const hasStarted = isInPlay || isFinished || filledMatches > 0;

                    j.isFinished = isFinished;
                    j.isInPlay = isInPlay;
                    j.filledMatches = filledMatches;

                    this.members.forEach(m => {
                        const p = pronosticosMap.get(`${j.id}_${m.id}`);
                        let hits = -1;
                        let points = 0;
                        let bonus = 0;
                        let prize = 0;
                        let isLate = false;
                        let isPardoned = false;
                        let potentialHits = null;
                        let pigHit = false;

                        if (p && window.ScoringSystem) {
                            const ev = window.ScoringSystem.evaluateMember(m, j, p);
                            if (ev.played && hasStarted) {
                                hits = ev.hits;
                                points = ev.points;
                                bonus = ev.bonus;
                                prize = ev.prize;
                                isLate = ev.isLate;
                                isPardoned = ev.isPardoned;
                                potentialHits = ev.potentialHits;
                                pigHit = ev.pigHit;
                            }
                        }

                        this.memberStats[m.id].jornadaData[j.id] = {
                            hits, points, bonus, prize, isLate, isPardoned, potentialHits, pigHit,
                            isFinished, isInPlay, filledMatches,
                            pardonReason: (p ? p.pardonReason : '') || ''
                        };

                        if (hasStarted && hits !== -1) {
                            const stats = this.memberStats[m.id];
                            stats.jornadasPlayed++;
                            stats.grandTotal += points;

                            const hitsToSum = (potentialHits !== null) ? potentialHits : hits;
                            stats.baseTotal += hitsToSum;
                            stats.bonusTotal += bonus;
                            stats.prizeTotal += prize;

                            // Acumulados oficiales cerrados (excluyendo jornadas en juego)
                            if (isFinished) {
                                stats.officialGrandTotal = (stats.officialGrandTotal || 0) + points;
                                stats.officialBaseTotal = (stats.officialBaseTotal || 0) + hitsToSum;
                                stats.officialBonusTotal = (stats.officialBonusTotal || 0) + bonus;
                                stats.officialPrizeTotal = (stats.officialPrizeTotal || 0) + prize;
                            }

                            if (prize > 0) {
                                stats.prizesList.push({ jNum: j.number, amount: prize, hits });
                            }

                            if (bonus > 0) {
                                stats.positiveBonus += bonus;
                                stats.bonusList.push({ jNum: j.number, bonus, hits });
                                if (hits >= 15) stats.bonusCounts[15]++;
                                else if (hits === 14) stats.bonusCounts[14]++;
                                else if (hits === 13) stats.bonusCounts[13]++;
                                else if (hits === 12) stats.bonusCounts[12]++;
                                else if (hits === 11) stats.bonusCounts[11]++;
                                else if (hits === 10) stats.bonusCounts[10]++;
                            } else if (bonus < 0) {
                                stats.negativePenalties += Math.abs(bonus);
                                stats.penaltyCounts.low++;
                                stats.penaltiesList.push({ jNum: j.number, penalty: Math.abs(bonus), reason: `Baja puntuación (${hits} aciertos)` });
                            }

                            if (isLate && !isPardoned && isFinished) {
                                stats.penaltyCounts.late++;
                                stats.penaltiesList.push({ jNum: j.number, penalty: 2, reason: 'Envío fuera de plazo (⏱️)' });
                            }

                            if (stats.recentForm.length < 5) {
                                stats.recentForm.push({ jNum: j.number, hits, points });
                            }

                            if (points > maxScore) maxScore = points;
                            if (points < minScore) minScore = points;
                        }
                    });

                    j.stats = { maxScore, minScore };

                    // Registrar ganadores de jornada finalizada
                    if (isFinished) {
                        this.members.forEach(m => {
                            const cell = this.memberStats[m.id].jornadaData[j.id];
                            if (cell && cell.hits !== -1 && cell.points === maxScore && maxScore > 0) {
                                this.memberStats[m.id].winsList.push({ jNum: j.number, points: cell.points, hits: cell.hits, bonus: cell.bonus, prize: cell.prize });
                            }
                        });
                    }
                });

                // Ordenar Ranking en Vivo por Puntos Totales descendente (incluyendo aciertos parciales en juego)
                this.sortedRanking = Object.values(this.memberStats).sort((a, b) => {
                    if (b.grandTotal !== a.grandTotal) return b.grandTotal - a.grandTotal;
                    if (b.baseTotal !== a.baseTotal) return b.baseTotal - a.baseTotal;
                    return b.prizeTotal - a.prizeTotal;
                });

                // Calcular también el ranking oficial anterior (previo a los puntos en juego) para mostrar variaciones en vivo
                const officialSorted = Object.values(this.memberStats).map(s => ({
                    id: s.member.id,
                    pts: s.officialGrandTotal !== undefined ? s.officialGrandTotal : s.grandTotal,
                    base: s.officialBaseTotal !== undefined ? s.officialBaseTotal : s.baseTotal,
                    prize: s.officialPrizeTotal !== undefined ? s.officialPrizeTotal : s.prizeTotal
                })).sort((a, b) => {
                    if (b.pts !== a.pts) return b.pts - a.pts;
                    if (b.base !== a.base) return b.base - a.base;
                    return b.prize - a.prize;
                });

                // Asignar puestos a cada socio
                this.sortedRanking.forEach((s, liveIdx) => {
                    s.liveRank = liveIdx + 1;
                    const prevIdx = officialSorted.findIndex(o => o.id === s.member.id);
                    s.officialRank = prevIdx !== -1 ? prevIdx + 1 : (liveIdx + 1);
                    s.rankChange = s.officialRank - s.liveRank; // Positivo = sube puestos, Negativo = baja
                });
            }

            // --- RENDERIZADO DEL PODIO (TOP 3 COMPACTO) ---
            renderPodium() {
                const top1 = this.sortedRanking[0];
                const top2 = this.sortedRanking[1];
                const top3 = this.sortedRanking[2];

                if (top1) {
                    const card1 = document.getElementById('podium-card-1');
                    if (card1) {
                        card1.setAttribute('data-card-type', 'rank');
                        card1.setAttribute('data-card-id', top1.member.id);
                    }
                    document.getElementById('podium-name-1').textContent = top1.name;
                    document.getElementById('podium-points-1').textContent = `${top1.grandTotal} pts`;
                    document.getElementById('podium-hits-1').textContent = top1.baseTotal;
                    document.getElementById('podium-bonus-1').textContent = top1.bonusTotal >= 0 ? `+${top1.bonusTotal}` : top1.bonusTotal;
                    document.getElementById('podium-prize-1').textContent = this.formatMoney(top1.prizeTotal);
                }
                if (top2) {
                    const card2 = document.getElementById('podium-card-2');
                    if (card2) {
                        card2.setAttribute('data-card-type', 'rank');
                        card2.setAttribute('data-card-id', top2.member.id);
                    }
                    const diff2 = top1 ? top1.grandTotal - top2.grandTotal : 0;
                    document.getElementById('podium-name-2').textContent = top2.name;
                    document.getElementById('podium-points-2').textContent = `${top2.grandTotal} pts`;
                    document.getElementById('podium-diff-2').textContent = diff2 === 0 ? 'Empatado' : `-${diff2} pts`;
                    document.getElementById('podium-hits-2').textContent = top2.baseTotal;
                    document.getElementById('podium-bonus-2').textContent = top2.bonusTotal >= 0 ? `+${top2.bonusTotal}` : top2.bonusTotal;
                    document.getElementById('podium-prize-2').textContent = this.formatMoney(top2.prizeTotal);
                }
                if (top3) {
                    const card3 = document.getElementById('podium-card-3');
                    if (card3) {
                        card3.setAttribute('data-card-type', 'rank');
                        card3.setAttribute('data-card-id', top3.member.id);
                    }
                    const diff3 = top1 ? top1.grandTotal - top3.grandTotal : 0;
                    document.getElementById('podium-name-3').textContent = top3.name;
                    document.getElementById('podium-points-3').textContent = `${top3.grandTotal} pts`;
                    document.getElementById('podium-diff-3').textContent = diff3 === 0 ? 'Empatado' : `-${diff3} pts`;
                    document.getElementById('podium-hits-3').textContent = top3.baseTotal;
                    document.getElementById('podium-bonus-3').textContent = top3.bonusTotal >= 0 ? `+${top3.bonusTotal}` : top3.bonusTotal;
                    document.getElementById('podium-prize-3').textContent = this.formatMoney(top3.prizeTotal);
                }
            }

            // --- RENDERIZADO DE BENTO KPIS ---
            renderKPIs() {
                const top1 = this.sortedRanking[0];
                const top2 = this.sortedRanking[1];

                // KPI 1: Líder
                if (top1) {
                    document.getElementById('kpi-lider-nombre').textContent = top1.name;
                    document.getElementById('kpi-lider-puntos').textContent = `${top1.grandTotal} pts`;
                    const liderComp = document.getElementById('kpi-lider-puntos-compact');
                    if (liderComp) liderComp.textContent = `${top1.grandTotal} pts`;
                    const ventaja = top2 ? top1.grandTotal - top2.grandTotal : 0;
                    document.getElementById('kpi-lider-ventaja').textContent = `+${ventaja} pts sobre el 2º`;
                    const totalPosibles = top1.jornadasPlayed * 14;
                    const efectividad = totalPosibles > 0 ? Math.round((top1.baseTotal / totalPosibles) * 100) : 0;
                    document.getElementById('kpi-lider-efectividad').textContent = `${efectividad}%`;
                }

                // KPI 2: Récord histórico en 1 jornada
                let recordPts = 0;
                let recordSocio = '';
                let recordJNum = 0;
                let recordHits = 0;

                this.visibleJornadas.forEach(j => {
                    this.sortedRanking.forEach(s => {
                        const data = s.jornadaData[j.id];
                        if (data && data.points > recordPts) {
                            recordPts = data.points;
                            recordSocio = s.name;
                            recordJNum = j.number;
                            recordHits = data.hits;
                        }
                    });
                });

                document.getElementById('kpi-record-socio').textContent = recordSocio || 'Sin datos';
                document.getElementById('kpi-record-puntos').textContent = `${recordPts} pts`;
                const recComp = document.getElementById('kpi-record-puntos-compact');
                if (recComp) recComp.textContent = `${recordPts} pts`;
                document.getElementById('kpi-record-jornada').textContent = `Jornada ${recordJNum}`;
                document.getElementById('kpi-record-hits').textContent = `${recordHits} aciertos`;

                // KPI 3: Premios totales repartidos (Socios + Quiniela de Dobles)
                let totalPremiosSocios = 0;
                let sociosPremiados = 0;
                let maxPremiado = { name: '', amount: 0 };

                this.sortedRanking.forEach(s => {
                    totalPremiosSocios += s.prizeTotal;
                    if (s.prizeTotal > 0) {
                        sociosPremiados++;
                        if (s.prizeTotal > maxPremiado.amount) {
                            maxPremiado = { name: s.name, amount: s.prizeTotal };
                        }
                    }
                });

                const doblesPrizesInfo = this.calculateDoublesPrizes();
                const totalPremiosDobles = doblesPrizesInfo.total;
                const totalPremios = totalPremiosSocios + totalPremiosDobles;

                const formattedPremios = this.formatMoney(totalPremios);
                document.getElementById('kpi-premios-total').textContent = formattedPremios;
                const premComp = document.getElementById('kpi-premios-total-compact');
                if (premComp) premComp.textContent = formattedPremios;

                const topSocioText = maxPremiado.amount > 0 
                    ? `Máx: ${maxPremiado.name} (${this.formatMoney(maxPremiado.amount)})` 
                    : (totalPremiosDobles > 0 ? 'Sin premios individuales' : 'Sin premios todavía');
                document.getElementById('kpi-premios-top-socio').textContent = topSocioText;

                const countEl = document.getElementById('kpi-premios-count');
                if (totalPremiosDobles > 0) {
                    countEl.textContent = `${sociosPremiados} socios • Dobles: ${this.formatMoney(totalPremiosDobles)}`;
                } else {
                    countEl.textContent = `${sociosPremiados} socios`;
                }

                // KPI 4: Balance Bonus vs Penalizaciones
                let totalPosBonus = 0;
                let totalNegPenal = 0;

                this.sortedRanking.forEach(s => {
                    totalPosBonus += s.positiveBonus;
                    totalNegPenal += s.negativePenalties;
                });

                const balanceNeto = totalPosBonus - totalNegPenal;
                document.getElementById('kpi-bonus-total').textContent = `+${totalPosBonus}`;
                document.getElementById('kpi-penal-total').textContent = `-${totalNegPenal}`;
                const netoText = `${balanceNeto >= 0 ? '+' : ''}${balanceNeto} pts`;
                document.getElementById('kpi-balance-neto').textContent = netoText;
                const netoComp = document.getElementById('kpi-balance-neto-compact');
                if (netoComp) netoComp.textContent = netoText;
                const balEl = document.getElementById('kpi-balance-neto');
                balEl.textContent = `${balanceNeto >= 0 ? '+' : ''}${balanceNeto} pts`;
                balEl.className = `font-bold font-mono ${balanceNeto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;

                // Sincronización con la Tarjeta Resumen Única en Móvil
                const mobLiderPts = document.getElementById('kpi-mobile-lider-puntos');
                if (mobLiderPts && top1) mobLiderPts.textContent = `${top1.grandTotal} pts`;
                const mobLiderNom = document.getElementById('kpi-mobile-lider-nombre');
                if (mobLiderNom && top1) mobLiderNom.textContent = top1.name;

                const mobRecPts = document.getElementById('kpi-mobile-record-puntos');
                if (mobRecPts) mobRecPts.textContent = `${recordPts} pts`;
                const mobRecSoc = document.getElementById('kpi-mobile-record-socio');
                if (mobRecSoc) mobRecSoc.textContent = recordSocio ? `${recordSocio.split(' ')[0]} (J${recordJNum})` : `Jornada ${recordJNum}`;

                const mobPremTot = document.getElementById('kpi-mobile-premios-total');
                if (mobPremTot) mobPremTot.textContent = formattedPremios;
                const mobPremCnt = document.getElementById('kpi-mobile-premios-count');
                if (mobPremCnt) mobPremCnt.textContent = `${sociosPremiados} soc.`;

                const mobBalNeto = document.getElementById('kpi-mobile-balance-neto');
                if (mobBalNeto) {
                    mobBalNeto.textContent = netoText;
                    mobBalNeto.className = `text-xs sm:text-sm font-black font-mono mt-0.5 truncate ${balanceNeto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
                }
                const mobBonPen = document.getElementById('kpi-mobile-bonus-penal');
                if (mobBonPen) mobBonPen.textContent = `+${totalPosBonus} / -${totalNegPenal}`;
            }

            // --- RENDERIZADO DE LA TABLA DE RANKING (CON RANA AL ÚLTIMO) ---
            renderRankingTable() {
                const tbody = document.getElementById('ranking-tbody');
                if (!tbody) return;

                let list = [...this.sortedRanking];

                // Filtro por categoría
                if (this.activeCategoryFilter === 'podium') {
                    list = list.slice(0, 5);
                } else if (this.activeCategoryFilter === 'prizes') {
                    list = list.filter(s => s.prizeTotal > 0);
                } else if (this.activeCategoryFilter === 'penalties') {
                    list = list.filter(s => s.negativePenalties > 0 || s.penaltyCounts.late > 0);
                }

                // Filtro por buscador
                if (this.searchQuery) {
                    const q = this.searchQuery.toLowerCase();
                    list = list.filter(s => s.name.toLowerCase().includes(q) || String(s.member.id).includes(q));
                }

                if (list.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-500 font-bold">No se encontraron socios con ese filtro.</td></tr>`;
                    return;
                }

                // Ordenación interactiva de la tabla
                const rSortCol = this.rankingSort.col || 'rank';
                const rSortDir = this.rankingSort.dir || 'asc';
                list.sort((a, b) => {
                    let valA, valB;
                    if (rSortCol === 'name') {
                        valA = (a.name || '').toLowerCase();
                        valB = (b.name || '').toLowerCase();
                        return rSortDir === 'asc' ? valA.localeCompare(valB, 'es') : valB.localeCompare(valA, 'es');
                    } else if (rSortCol === 'grandTotal') {
                        valA = a.grandTotal || 0;
                        valB = b.grandTotal || 0;
                    } else if (rSortCol === 'baseTotal') {
                        valA = a.baseTotal || 0;
                        valB = b.baseTotal || 0;
                    } else if (rSortCol === 'positiveBonus') {
                        valA = a.positiveBonus || 0;
                        valB = b.positiveBonus || 0;
                    } else if (rSortCol === 'negativePenalties') {
                        valA = a.negativePenalties || 0;
                        valB = b.negativePenalties || 0;
                    } else if (rSortCol === 'prizeTotal') {
                        valA = a.prizeTotal || 0;
                        valB = b.prizeTotal || 0;
                    } else if (rSortCol === 'media') {
                        valA = a.jornadasPlayed > 0 ? (a.grandTotal / a.jornadasPlayed) : 0;
                        valB = b.jornadasPlayed > 0 ? (b.grandTotal / b.jornadasPlayed) : 0;
                    } else {
                        // 'rank' (Posición oficial en la peña)
                        valA = this.sortedRanking.findIndex(x => x.member.id === a.member.id) + 1;
                        valB = this.sortedRanking.findIndex(x => x.member.id === b.member.id) + 1;
                    }
                    return rSortDir === 'asc' ? valA - valB : valB - valA;
                });

                const maxPts = this.sortedRanking[0] ? this.sortedRanking[0].grandTotal : 1;
                const totalSocios = this.sortedRanking.length;

                let html = '';
                list.forEach((s) => {
                    const realRank = this.sortedRanking.findIndex(x => x.member.id === s.member.id) + 1;
                    const isLast = realRank === totalSocios;
                    
                    const ch = s.rankChange || 0;
                    let changeHtml = '';
                    const hasAnyInPlay = this.visibleJornadas.some(j => j.isInPlay);
                    if (hasAnyInPlay) {
                        if (ch > 0) {
                            changeHtml = `<span class="inline-flex items-center text-[10px] font-black font-mono ml-1" style="color: #10b981;" title="Sube ${ch} puestos provisionales">↑+${ch}</span>`;
                        } else if (ch < 0) {
                            changeHtml = `<span class="inline-flex items-center text-[10px] font-black font-mono ml-1" style="color: #ef4444;" title="Baja ${Math.abs(ch)} puestos provisionales">↓${ch}</span>`;
                        } else {
                            changeHtml = `<span class="inline-flex items-center text-[10px] font-black font-mono ml-1" style="color: #3b82f6;" title="Mantiene puesto">=</span>`;
                        }
                    }

                    let medalBadge = `<span class="font-mono font-bold text-slate-500 dark:text-slate-400 cursor-help" data-card-type="rank" data-card-id="${s.member.id}">#${realRank}</span>`;
                    let rowBg = '';
                    if (realRank === 1) {
                        medalBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/50 shadow-sm cursor-help" data-card-type="rank" data-card-id="${s.member.id}">🥇 1º</span>`;
                        rowBg = 'bg-amber-500/5';
                    } else if (realRank === 2) {
                        medalBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-black bg-slate-200 dark:bg-slate-400/20 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-400/40 cursor-help" data-card-type="rank" data-card-id="${s.member.id}">🥈 2º</span>`;
                        rowBg = 'bg-slate-400/5';
                    } else if (realRank === 3) {
                        medalBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-black bg-amber-800/15 dark:bg-amber-700/20 text-amber-950 dark:text-amber-200 border border-amber-800/40 dark:border-amber-700/50 cursor-help" data-card-type="rank" data-card-id="${s.member.id}">🥉 3º</span>`;
                        rowBg = 'bg-amber-700/5';
                    } else if (isLast) {
                        // ÚLTIMO CLASIFICADO IDENTIFICADO CON UNA RANA 🐸 (EL MAULA)
                        medalBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/50 shadow-sm flex items-center justify-center gap-1 cursor-help" data-card-type="rank" data-card-id="${s.member.id}">🐸 19º</span>`;
                        rowBg = 'bg-emerald-500/5';
                    }

                    const progressPct = maxPts > 0 ? Math.min(100, Math.round((s.grandTotal / maxPts) * 100)) : 0;
                    const media = s.jornadasPlayed > 0 ? (s.grandTotal / s.jornadasPlayed).toFixed(1) : '0.0';

                    // Píldoras de racha (Últimas 5)
                    let formHtml = '<div class="flex items-center justify-center gap-1">';
                    s.recentForm.slice(0, 5).slice().reverse().forEach(f => {
                        let colorClass = 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300';
                        if (f.hits >= 11) colorClass = 'bg-emerald-500 text-slate-950 font-black shadow-sm';
                        else if (f.hits >= 9) colorClass = 'bg-blue-500 !text-white font-bold';
                        else if (f.hits >= 6) colorClass = 'bg-amber-500 text-slate-950 font-bold';
                        else colorClass = 'bg-rose-500 !text-white font-bold';

                        formHtml += `<span class="w-5 h-5 rounded-md ${colorClass} text-[10px] font-mono flex items-center justify-center cursor-help transition hover:scale-110" data-card-type="form-capsule" data-card-id="${s.member.id}" data-card-extra='${JSON.stringify({ jNum: f.jNum, hits: f.hits, points: f.points })}'>${f.hits}</span>`;
                    });
                    formHtml += '</div>';

                    html += `
                        <tr class="${rowBg} hover:bg-slate-100 dark:hover:bg-slate-800/40 transition cursor-pointer" onclick="window.ClasificacionApp.openMemberDrawer(${s.member.id})">
                            <td class="py-2 sm:py-2.5 px-1.5 sm:px-3 text-center whitespace-nowrap"><div class="inline-flex items-center justify-center">${medalBadge}${changeHtml}</div></td>
                            <td class="py-2 sm:py-2.5 px-2 sm:px-4">
                                <div class="flex items-center gap-2">
                                    <div class="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono shrink-0">
                                        ${s.member.id}
                                    </div>
                                    <div class="min-w-0">
                                        <div class="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm truncate">${s.name}</div>
                                        ${s.prizeTotal > 0 ? `<div class="lg:hidden text-[9px] font-mono font-bold text-purple-600 dark:text-purple-400">💰 ${this.formatMoney(s.prizeTotal)}</div>` : ''}
                                    </div>
                                </div>
                            </td>
                            <td class="py-2 sm:py-2.5 px-1.5 sm:px-4 text-center">
                                <div class="flex flex-col items-center min-w-[105px] sm:min-w-[130px]">
                                    <div class="flex items-baseline gap-1">
                                        <span class="text-sm sm:text-base font-black font-mono text-amber-600 dark:text-amber-400">${s.grandTotal}</span>
                                        <span class="text-[9px] sm:text-[10px] font-sans font-bold text-slate-500 dark:text-slate-400">pts</span>
                                    </div>
                                    <!-- Desglose directo de puntos: base + bonus - penal -->
                                    <div class="inline-flex items-center justify-center gap-1 sm:gap-1.5 mt-0.5 px-1.5 sm:px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-[9px] sm:text-[10px] font-mono font-bold shadow-xs cursor-help hover:border-amber-400 transition"
                                         data-card-type="breakdown" data-card-id="${s.member.id}">
                                        <span class="text-slate-700 dark:text-slate-300 font-extrabold" data-card-type="breakdown" data-card-id="${s.member.id}">${s.baseTotal}</span>
                                        <span class="text-slate-400 dark:text-slate-600">|</span>
                                        <span class="text-emerald-600 dark:text-emerald-400 font-black" data-card-type="bonus" data-card-id="${s.member.id}">${s.positiveBonus > 0 ? '+' + s.positiveBonus : '+0'}</span>
                                        <span class="text-slate-400 dark:text-slate-600">|</span>
                                        <span class="text-rose-600 dark:text-rose-400 font-black" data-card-type="penalty" data-card-id="${s.member.id}">${s.negativePenalties > 0 ? '-' + s.negativePenalties : '-0'}</span>
                                    </div>
                                    <div class="w-16 sm:w-24 h-1 sm:h-1.5 bg-slate-200 dark:bg-slate-700/50 rounded-full mt-1 sm:mt-1.5 overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-amber-500 to-amber-400" style="width: ${progressPct}%"></div>
                                    </div>
                                </div>
                            </td>
                            <td class="hidden md:table-cell py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">${s.baseTotal}</td>
                            <td class="hidden md:table-cell py-2.5 px-3 text-center font-mono font-bold">
                                ${s.positiveBonus > 0 
                                    ? `<span class="cursor-help px-2 py-0.5 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 transition" data-card-type="bonus" data-card-id="${s.member.id}">+${s.positiveBonus}</span>`
                                    : `<span class="text-slate-400 dark:text-slate-500 text-xs">0</span>`
                                }
                            </td>
                            <td class="hidden md:table-cell py-2.5 px-3 text-center font-mono font-bold">
                                ${(s.negativePenalties > 0 || s.penaltyCounts.late > 0)
                                    ? `<span class="cursor-help px-2 py-0.5 rounded-full text-xs font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:border-rose-400 transition inline-flex items-center gap-1" data-card-type="penalty" data-card-id="${s.member.id}">-${s.negativePenalties} ${s.penaltyCounts.late > 0 ? '⏱️' : ''}</span>`
                                    : `<span class="text-slate-400 dark:text-slate-500 text-xs">0</span>`
                                }
                            </td>
                            <td class="hidden lg:table-cell py-2.5 px-3 text-center font-mono font-bold">
                                ${s.prizeTotal > 0 
                                    ? `<span class="cursor-help px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:border-purple-400 transition" data-card-type="prize" data-card-id="${s.member.id}">${this.formatMoney(s.prizeTotal)}</span>`
                                    : `<span class="text-slate-400 dark:text-slate-500 text-xs">-</span>`
                                }
                            </td>
                            <td class="hidden sm:table-cell py-2.5 px-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">${media}</td>
                            <td class="py-2 sm:py-2.5 px-1 sm:px-3 text-center">${formHtml}</td>
                            <td class="hidden sm:table-cell py-2.5 px-3 text-center">
                                <button type="button" class="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold transition">
                                    👁️
                                </button>
                            </td>
                        </tr>
                    `;
                });

                tbody.innerHTML = html;
            }

            sortRanking(column, thElement) {
                if (this.rankingSort.col === column) {
                    this.rankingSort.dir = this.rankingSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.rankingSort.col = column;
                    // Para puntos, bonus, premios, base suele ser natural desc al principio si no es rank
                    this.rankingSort.dir = (column === 'rank' || column === 'name') ? 'asc' : 'desc';
                }

                // Actualizar indicadores visuales en las cabeceras
                const table = document.getElementById('view-ranking');
                if (table) {
                    table.querySelectorAll('th[data-sortable="true"]').forEach(th => {
                        const ind = th.querySelector('.sort-indicator');
                        if (ind) ind.textContent = '↕';
                    });
                }
                if (thElement) {
                    const ind = thElement.querySelector('.sort-indicator');
                    if (ind) ind.textContent = this.rankingSort.dir === 'asc' ? '↑' : '↓';
                }

                this.renderRankingTable();
            }

            // --- RENDERIZADO DE LA MATRIZ GENERAL HISTÓRICA (VISTA 1) ---
            renderMatrixTable() {
                const table = document.getElementById('matrix-table');
                if (!table) return;
                this.matrixRendered = true;

                const sortedMembers = [...this.members].sort((a, b) => parseInt(a.id) - parseInt(b.id));

                // 1. Cabecera THEAD
                let thead = `<thead>
                    <tr>
                        <th class="matrix-corner py-2.5 px-3 text-center font-mono font-black text-amber-600 dark:text-amber-500 text-xs">
                            JORNADA
                        </th>
                `;

                sortedMembers.forEach(m => {
                    const nameParts = AppUtils.getMemberName(m).split(' ');
                    const shortName = nameParts[0].length > 8 ? nameParts[0].substring(0, 7) + '.' : nameParts[0];
                    thead += `
                        <th class="matrix-header-name py-2.5 px-2.5 text-center cursor-pointer hover:text-amber-500 transition cursor-help" data-card-type="rank" data-card-id="${m.id}" onclick="window.ClasificacionApp.openMemberDrawer(${m.id})">
                            <div class="font-extrabold text-slate-900 dark:text-white text-xs">${shortName}</div>
                            <div class="text-[9px] font-mono text-slate-500 dark:text-slate-400">ID: ${m.id}</div>
                        </th>
                    `;
                });
                thead += `</tr>`;

                const hasAnyInPlay = this.visibleJornadas.some(j => j.isInPlay);

                // Filas Resumen Sticky
                // A. PUESTO RANKING (EN VIVO CON EFECTO DE JORNADA EN CURSO)
                thead += `
                    <tr class="matrix-summary-row matrix-row-rank text-xs font-mono font-bold">
                        <td class="matrix-sticky-col py-1.5 px-3 text-amber-500 font-extrabold text-left border-b border-slate-200 dark:border-slate-700">
                            PUESTO RANKING ${hasAnyInPlay ? '<span class="text-[9px] text-emerald-400 font-normal">🟢 VIVO</span>' : ''}
                        </td>
                `;
                sortedMembers.forEach(m => {
                    const stats = this.memberStats[m.id];
                    const r = stats.liveRank;
                    const ch = stats.rankChange || 0;
                    let chHtml = '';
                    if (hasAnyInPlay) {
                        if (ch > 0) chHtml = `<span class="text-[10px] font-black ml-1" style="color: #10b981;">↑+${ch}</span>`;
                        else if (ch < 0) chHtml = `<span class="text-[10px] font-black ml-1" style="color: #ef4444;">↓${ch}</span>`;
                        else chHtml = `<span class="text-[10px] font-black ml-1" style="color: #3b82f6;">=</span>`;
                    }
                    const badge = (r === 1) ? '🥇 1º' : (r === 2) ? '🥈 2º' : (r === 3) ? '🥉 3º' : (r === 19) ? '🐸 19º' : `#${r}`;
                    thead += `<td class="py-1.5 px-2 text-center text-xs font-bold border-b border-slate-200 dark:border-slate-700/80 border-r border-slate-200 dark:border-slate-700/40 cursor-help" data-card-type="rank" data-card-id="${m.id}">${badge}${chHtml}</td>`;
                });
                thead += `</tr>`;

                // B. PUNTOS GENERAL
                thead += `
                    <tr class="matrix-summary-row matrix-row-total text-xs font-mono font-black">
                        <td class="matrix-sticky-col py-2 px-3 font-black text-amber-600 dark:text-amber-500 text-left border-b border-slate-200 dark:border-slate-700">PUNTOS GENERAL</td>
                `;
                sortedMembers.forEach(m => {
                    const pts = this.memberStats[m.id].grandTotal;
                    thead += `<td class="py-2 px-2.5 text-center text-amber-600 dark:text-amber-400 font-black text-xs border-b border-slate-200 dark:border-slate-700/80 border-r border-slate-200 dark:border-slate-700/40 cursor-help" data-card-type="breakdown" data-card-id="${m.id}">${pts}</td>`;
                });
                thead += `</tr>`;

                // C. Puntos Semana (Aciertos Base)
                thead += `
                    <tr class="matrix-summary-row matrix-row-hits text-xs font-mono font-bold">
                        <td class="matrix-sticky-col py-1.5 px-3 text-slate-700 dark:text-slate-300 text-left border-b border-slate-200 dark:border-slate-700">Puntos Semana</td>
                `;
                sortedMembers.forEach(m => {
                    const hits = this.memberStats[m.id].baseTotal;
                    thead += `<td class="py-1.5 px-2.5 text-center text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700/80 border-r border-slate-200 dark:border-slate-700/40">${hits}</td>`;
                });
                thead += `</tr>`;

                // D. Bonus / Penal
                thead += `
                    <tr class="matrix-summary-row matrix-row-bonus text-xs font-mono font-bold">
                        <td class="matrix-sticky-col py-1.5 px-3 text-slate-700 dark:text-slate-300 text-left border-b border-slate-200 dark:border-slate-700">Bonus / Penal.</td>
                `;
                sortedMembers.forEach(m => {
                    const b = this.memberStats[m.id].bonusTotal;
                    const color = b >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
                    const prefix = b > 0 ? '+' : '';
                    thead += `<td class="py-1.5 px-2.5 text-center ${color} border-b border-slate-200 dark:border-slate-700/80 border-r border-slate-200 dark:border-slate-700/40 cursor-help" data-card-type="breakdown" data-card-id="${m.id}">${prefix}${b}</td>`;
                });
                thead += `</tr>`;

                // E. Premios (€)
                thead += `
                    <tr class="matrix-summary-row matrix-row-prizes text-xs font-mono font-black">
                        <td class="matrix-sticky-col py-2 px-3 text-purple-600 dark:text-purple-400 text-left">Premios (€)</td>
                `;
                sortedMembers.forEach(m => {
                    const p = this.memberStats[m.id].prizeTotal;
                    thead += `<td class="py-2 px-2.5 text-center text-purple-600 dark:text-purple-300 border-r border-slate-200 dark:border-slate-700/40 cursor-help" data-card-type="prize" data-card-id="${m.id}">${p > 0 ? this.formatMoney(p) : '-'}</td>`;
                });
                thead += `</tr></thead>`;

                // 2. Cuerpo TBODY (Jornadas)
                let tbody = `<tbody class="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">`;
                this.visibleJornadas.forEach(j => {
                    let dateFormatted = j.date;
                    try {
                        const d = AppUtils.parseDate(j.date);
                        if (d) dateFormatted = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    } catch (e) {}

                    const hasPig = (j.matches || []).some(m => m && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away));

                    const inPlayBadge = j.isInPlay 
                        ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 animate-pulse ml-1">${j.filledMatches}/15</span>` 
                        : '';

                    const rowClass = j.isInPlay ? 'bg-emerald-500/5 dark:bg-emerald-500/[0.03]' : '';

                    tbody += `<tr class="${rowClass}">
                        <td class="matrix-sticky-col py-1.5 px-3 text-left border-b border-slate-200 dark:border-slate-800">
                            <div class="font-extrabold text-amber-600 dark:text-amber-500 text-xs flex items-center gap-1">
                                <span>J${j.number}</span>
                                ${inPlayBadge}
                                ${hasPig ? '<span class="cursor-help ml-0.5" data-card-type="pig-header">🐷</span>' : ''}
                            </div>
                            <div class="text-[9px] text-slate-500 dark:text-slate-400 font-mono">${dateFormatted}</div>
                        </td>
                    `;

                    sortedMembers.forEach(m => {
                        const cell = this.memberStats[m.id].jornadaData[j.id];
                        let cellContent = '-';
                        let cellBg = '';

                        if (cell && cell.hits !== -1) {
                            if (j.isInPlay) {
                                // JORNADA EN JUEGO: Mostrar aciertos parciales y variación en vivo en la celda
                                cellBg = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-black';
                                const pigIcon = cell.pigHit ? ' 🐷' : '';
                                const stats = this.memberStats[m.id];
                                const ch = stats ? (stats.rankChange || 0) : 0;
                                let varBadge = '';
                                if (ch > 0) {
                                    varBadge = `<span class="inline-flex items-center text-[10px] font-black ml-1" style="color: #10b981;" title="Sube ${ch} puestos provisionales">↑+${ch}</span>`;
                                } else if (ch < 0) {
                                    varBadge = `<span class="inline-flex items-center text-[10px] font-black ml-1" style="color: #ef4444;" title="Baja ${Math.abs(ch)} puestos provisionales">↓${ch}</span>`;
                                } else {
                                    varBadge = `<span class="inline-flex items-center text-[10px] font-black ml-1" style="color: #3b82f6;" title="Mantiene puesto">=</span>`;
                                }
                                cellContent = `<span class="cursor-help inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-emerald-500/30 transition hover:scale-105" data-card-type="matrix-cell" data-m-id="${m.id}" data-j-id="${j.id}"><span class="font-black text-sm">${cell.hits}</span>${pigIcon}${varBadge}</span>`;
                            } else {
                                const isMax = j.stats && cell.points === j.stats.maxScore && j.stats.maxScore > 0;
                                const isMin = j.stats && cell.points === j.stats.minScore && j.stats.minScore !== j.stats.maxScore;

                                if (isMax) cellBg = 'bg-amber-500/15 text-amber-800 dark:text-amber-300 font-black';
                                else if (isMin) cellBg = 'bg-rose-500/10 text-rose-800 dark:text-rose-300';
                                else cellBg = 'text-slate-800 dark:text-slate-200';

                                const crown = isMax ? ' 👑' : '';
                                const lateIcon = cell.isLate && !cell.isPardoned ? ' ⏱️' : '';
                                const pigIcon = cell.pigHit ? ' 🐷' : '';

                                cellContent = `<span class="cursor-help inline-block px-1 py-0.5 rounded transition" data-card-type="matrix-cell" data-m-id="${m.id}" data-j-id="${j.id}">${cell.points}${crown}${lateIcon}${pigIcon}</span>`;
                            }
                        }

                        tbody += `<td class="py-1.5 px-2.5 text-center ${cellBg} border-r border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition cursor-pointer" onclick="window.ClasificacionApp.openMemberDrawer(${m.id})">${cellContent}</td>`;
                    });

                    tbody += `</tr>`;
                });
                tbody += `</tbody>`;

                table.innerHTML = thead + tbody;
                this.adjustMatrixStickyHeaders();
            }

            // Cálculo dinámico de posiciones sticky en thead para evitar cualquier corte o solapamiento
            adjustMatrixStickyHeaders() {
                const table = document.getElementById('matrix-table');
                if (!table) return;
                const theadRows = table.querySelectorAll('thead tr');
                let currentTop = 0;
                theadRows.forEach((tr, rIdx) => {
                    const cells = tr.querySelectorAll('th, td');
                    cells.forEach(cell => {
                        cell.style.top = currentTop + 'px';
                        if (cell.classList.contains('matrix-sticky-col') || cell.classList.contains('matrix-corner')) {
                            cell.style.zIndex = 55 - rIdx;
                        } else {
                            cell.style.zIndex = 45 - rIdx;
                        }
                    });
                    currentTop += tr.offsetHeight;
                });
            }

            // --- ESCALADA DE POSICIONES (BUMP CHART INTERACTIVO) ---
            initChart() {
                this.chartInitialized = true;
                this.chartSelectTop(4);
            }

            setChartMode(mode) {
                this.chartMode = mode;
                const btnRanks = document.getElementById('chart-mode-ranks');
                const btnGap = document.getElementById('chart-mode-gap');
                if (btnRanks && btnGap) {
                    if (mode === 'ranks') {
                        btnRanks.className = 'px-2.5 py-1 rounded-lg transition font-black bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
                        btnGap.className = 'px-2.5 py-1 rounded-lg transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
                    } else {
                        btnGap.className = 'px-2.5 py-1 rounded-lg transition font-black bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
                        btnRanks.className = 'px-2.5 py-1 rounded-lg transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
                    }
                }
                this.renderChartSVG();
            }

            chartSelectTop(count = 4) {
                this.chartSelectedMembers.clear();
                this.sortedRanking.slice(0, count).forEach(s => {
                    this.chartSelectedMembers.add(s.member.id);
                });
                this.renderChartChips();
                this.renderChartSVG();
            }

            chartSelectPodium() {
                this.chartSelectTop(3);
            }

            chartSelectAll() {
                this.sortedRanking.forEach(s => this.chartSelectedMembers.add(s.member.id));
                this.renderChartChips();
                this.renderChartSVG();
            }

            chartClearAll() {
                this.chartSelectedMembers.clear();
                this.renderChartChips();
                this.renderChartSVG();
            }

            toggleChartMember(memberId) {
                if (this.chartSelectedMembers.has(memberId)) {
                    this.chartSelectedMembers.delete(memberId);
                } else {
                    this.chartSelectedMembers.add(memberId);
                }
                this.renderChartChips();
                this.renderChartSVG();
            }

            highlightMemberLine(memberId) {
                this.hoveredMemberId = memberId;
                const paths = document.querySelectorAll('.bump-path');
                const nodes = document.querySelectorAll('.bump-node');
                paths.forEach(p => {
                    const pMid = p.getAttribute('data-member-id');
                    if (memberId === null) {
                        p.style.opacity = '0.9';
                        p.style.strokeWidth = '3';
                    } else if (pMid === String(memberId)) {
                        p.style.opacity = '1';
                        p.style.strokeWidth = '5';
                    } else {
                        p.style.opacity = '0.15';
                        p.style.strokeWidth = '2';
                    }
                });
                nodes.forEach(n => {
                    const nMid = n.getAttribute('data-member-id');
                    if (memberId === null) {
                        n.style.opacity = '1';
                    } else if (nMid === String(memberId)) {
                        n.style.opacity = '1';
                    } else {
                        n.style.opacity = '0.15';
                    }
                });
            }

            showBumpTooltip(e, text) {
                const tt = document.getElementById('chart-tooltip');
                const box = document.getElementById('chart-container-box');
                if (!tt || !box) return;
                const boxRect = box.getBoundingClientRect();
                const x = e.clientX - boxRect.left + 12;
                const y = e.clientY - boxRect.top - 20;

                tt.innerHTML = text;
                tt.style.left = Math.min(x, boxRect.width - 200) + 'px';
                tt.style.top = Math.max(10, Math.min(y, boxRect.height - 60)) + 'px';
                tt.classList.remove('hidden');
            }

            hideBumpTooltip() {
                const tt = document.getElementById('chart-tooltip');
                if (tt) tt.classList.add('hidden');
            }

            renderChartChips() {
                const container = document.getElementById('chart-member-chips');
                if (!container) return;

                let html = '';
                this.sortedRanking.forEach((s, idx) => {
                    const isSelected = this.chartSelectedMembers.has(s.member.id);
                    const color = this.chartColors[idx % this.chartColors.length];

                    const activeClass = isSelected
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white border-2 shadow-sm font-black'
                        : 'bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white font-medium';

                    html += `
                        <button type="button" 
                                onclick="window.ClasificacionApp.toggleChartMember(${s.member.id})" 
                                onmouseenter="window.ClasificacionApp.highlightMemberLine(${s.member.id})"
                                onmouseleave="window.ClasificacionApp.highlightMemberLine(null)"
                                class="px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition ${activeClass}" 
                                style="${isSelected ? `border-color: ${color}; color: ${color};` : ''}">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ${color};"></span>
                            <span class="truncate max-w-[120px]">${s.name}</span>
                            <span class="text-[10px] font-mono opacity-80">#${idx + 1}</span>
                        </button>
                    `;
                });

                container.innerHTML = html;
            }

            renderChartSVG() {
                const svg = document.getElementById('chart-svg');
                const box = document.getElementById('chart-container-box');
                if (!svg || !box) return;

                const jornadasAsc = [...this.visibleJornadas]
                    .filter(j => j.isFinished || j.isInPlay || (j.filledMatches && j.filledMatches > 0))
                    .sort((a, b) => a.number - b.number);
                if (jornadasAsc.length === 0 || this.chartSelectedMembers.size === 0) {
                    svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#64748b" font-size="13" font-family="'Plus Jakarta Sans', sans-serif">Selecciona al menos un socio en los filtros superiores para ver la escalada</text>`;
                    return;
                }

                // Medición exacta en píxeles para evitar cualquier distorsión
                const rect = box.getBoundingClientRect();
                const width = Math.max(500, Math.floor(rect.width - 32));
                const height = Math.max(340, Math.floor(rect.height - 32));

                svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                svg.removeAttribute('preserveAspectRatio');

                const isLight = document.documentElement.classList.contains('light-theme');
                const gridColor = isLight ? '#e2e8f0' : '#1e293b';
                const labelColor = isLight ? '#475569' : '#94a3b8';

                const padding = { top: 35, right: 90, bottom: 40, left: 55 };
                const plotWidth = width - padding.left - padding.right;
                const plotHeight = height - padding.top - padding.bottom;

                // 1. Calcular clasificación acumulada para cada jornada (historia de puestos)
                // Para cada jornada jIdx: calcular acumulado de puntos de CADA socio de la peña hasta esa jornada
                const totalMembersCount = this.sortedRanking.length || 19;
                const standingsHistory = []; // [jIdx] -> Map(memberId -> { rank, points, gapToLeader })

                let leaderPointsHistory = [];

                jornadasAsc.forEach((j, jIdx) => {
                    const cumulativeList = [];
                    this.members.forEach(m => {
                        let totalPts = 0;
                        let totalHits = 0;
                        for (let k = 0; k <= jIdx; k++) {
                            const pastJ = jornadasAsc[k];
                            const cell = this.memberStats[m.id].jornadaData[pastJ.id];
                            if (cell && cell.hits !== -1) {
                                totalPts += cell.points;
                                totalHits += cell.hits;
                            }
                        }
                        cumulativeList.push({ memberId: m.id, points: totalPts, hits: totalHits });
                    });

                    // Ordenar como en la clasificación oficial
                    cumulativeList.sort((a, b) => {
                        if (b.points !== a.points) return b.points - a.points;
                        return b.hits - a.hits;
                    });

                    const leaderPts = cumulativeList[0] ? cumulativeList[0].points : 0;
                    leaderPointsHistory.push(leaderPts);

                    const rankMap = new Map();
                    cumulativeList.forEach((entry, rIdx) => {
                        rankMap.set(entry.memberId, {
                            rank: rIdx + 1,
                            points: entry.points,
                            gapToLeader: leaderPts - entry.points
                        });
                    });
                    standingsHistory.push(rankMap);
                });

                const numJornadas = Math.max(1, jornadasAsc.length);
                const xScale = (idx) => padding.left + (idx / Math.max(1, numJornadas - 1)) * plotWidth;

                let svgContent = '';

                if (this.chartMode === 'ranks') {
                    // Modo BUMP CHART: Eje Y del puesto #1 (arriba) al puesto #totalMembersCount (abajo)
                    const maxRank = Math.min(19, totalMembersCount);
                    const yScale = (rank) => padding.top + ((rank - 1) / Math.max(1, maxRank - 1)) * plotHeight;

                    // Franjas de fondo temáticas: Champions (#1-#3), Zona Media (#4-#10), Zona Maula (#11-#19)
                    const yTop = padding.top - 14;
                    const y3 = yScale(3.5);
                    const y10 = yScale(10.5);
                    const yBottom = height - padding.bottom + 12;

                    svgContent += `
                        <!-- Franja Podio / Champions (#1-#3) -->
                        <rect x="${padding.left}" y="${yTop}" width="${plotWidth}" height="${y3 - yTop}" fill="${isLight ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.18)'}" stroke="${isLight ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.30)'}" stroke-width="1.2" rx="8" />
                        <text x="${width - padding.right - 8}" y="${yTop + 16}" text-anchor="end" fill="${isLight ? '#b45309' : '#fbbf24'}" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" opacity="0.9">👑 ZONA CHAMPIONS (#1-#3)</text>

                        <!-- Franja Zona Media (#4-#10) -->
                        <rect x="${padding.left}" y="${y3 + 3}" width="${plotWidth}" height="${y10 - y3 - 6}" fill="${isLight ? 'rgba(59, 130, 246, 0.09)' : 'rgba(59, 130, 246, 0.11)'}" stroke="${isLight ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.22)'}" stroke-width="1.2" rx="8" />
                        <text x="${width - padding.right - 8}" y="${y3 + 19}" text-anchor="end" fill="${isLight ? '#2563eb' : '#60a5fa'}" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" opacity="0.9">🛡️ ZONA MEDIA (#4-#10)</text>

                        <!-- Franja Zona Maula (#11-#19) -->
                        <rect x="${padding.left}" y="${y10}" width="${plotWidth}" height="${yBottom - y10}" fill="${isLight ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 63, 94, 0.17)'}" stroke="${isLight ? 'rgba(244, 63, 94, 0.35)' : 'rgba(244, 63, 94, 0.30)'}" stroke-width="1.2" rx="8" />
                        <text x="${width - padding.right - 8}" y="${y10 + 17}" text-anchor="end" fill="${isLight ? '#e11d48' : '#fb7185'}" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" opacity="0.9">🐸 ZONA MAULA (#11-#19)</text>
                    `;

                    // Líneas guía horizontales de puestos clave (1, 3, 5, 10, 15, 19)
                    const keyRanks = [1, 3, 5, 10, 15, maxRank].filter((v, i, a) => a.indexOf(v) === i && v <= maxRank);
                    keyRanks.forEach(r => {
                        const y = yScale(r);
                        svgContent += `
                            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${gridColor}" stroke-dasharray="3,3" stroke-width="1"/>
                            <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" fill="${labelColor}" font-size="10" font-family="'JetBrains Mono', monospace" font-weight="bold">#${r}</text>
                        `;
                    });

                    // Líneas verticales por cada jornada
                    jornadasAsc.forEach((j, idx) => {
                        const x = xScale(idx);
                        svgContent += `
                            <line x1="${x}" y1="${padding.top - 10}" x2="${x}" y2="${height - padding.bottom + 8}" stroke="${gridColor}" stroke-width="0.7"/>
                            <text x="${x}" y="${height - padding.bottom + 22}" text-anchor="middle" fill="${labelColor}" font-size="11" font-family="'JetBrains Mono', monospace" font-weight="bold">J${j.number}</text>
                        `;
                    });

                    // Trazado de líneas Bump con curvas Bezier cúbicas suaves (S-curve)
                    this.sortedRanking.forEach((s, sIdx) => {
                        if (!this.chartSelectedMembers.has(s.member.id)) return;
                        const color = this.chartColors[sIdx % this.chartColors.length];

                        const pathPoints = [];
                        jornadasAsc.forEach((j, idx) => {
                            const standing = standingsHistory[idx].get(s.member.id);
                            const rank = standing ? standing.rank : maxRank;
                            pathPoints.push({
                                x: xScale(idx),
                                y: yScale(rank),
                                rank: rank,
                                points: standing ? standing.points : 0,
                                jNum: j.number
                            });
                        });

                        // Construcción de la curva Bezier cúbica suave
                        let d = '';
                        for (let i = 0; i < pathPoints.length; i++) {
                            const curr = pathPoints[i];
                            if (i === 0) {
                                d += `M ${curr.x} ${curr.y}`;
                            } else {
                                const prev = pathPoints[i - 1];
                                const cp1x = prev.x + (curr.x - prev.x) * 0.5;
                                const cp1y = prev.y;
                                const cp2x = prev.x + (curr.x - prev.x) * 0.5;
                                const cp2y = curr.y;
                                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
                            }
                        }

                        // Path de la curva
                        svgContent += `
                            <path d="${d}" 
                                  fill="none" 
                                  stroke="${color}" 
                                  stroke-width="3" 
                                  stroke-linecap="round" 
                                  stroke-linejoin="round" 
                                  class="bump-path transition-all duration-200 cursor-pointer"
                                  data-member-id="${s.member.id}"
                                  onmouseenter="window.ClasificacionApp.highlightMemberLine(${s.member.id})"
                                  onmouseleave="window.ClasificacionApp.highlightMemberLine(null)"
                                  style="opacity: 0.9;" />
                        `;

                        // Nodos interactivos en cada jornada
                        pathPoints.forEach(pt => {
                            const ttContent = `<strong style="color: ${color};">${s.name}</strong><br/>Jornada ${pt.jNum} &bull; <strong>Puesto #${pt.rank}</strong><br/><span style="color:#94a3b8;">${pt.points} pts acumulados</span>`;
                            svgContent += `
                                <g class="bump-node transition-all cursor-pointer" 
                                   data-member-id="${s.member.id}"
                                   onmouseenter="window.ClasificacionApp.showBumpTooltip(event, '${ttContent}'); window.ClasificacionApp.highlightMemberLine(${s.member.id})"
                                   onmouseleave="window.ClasificacionApp.hideBumpTooltip(); window.ClasificacionApp.highlightMemberLine(null)">
                                    <circle cx="${pt.x}" cy="${pt.y}" r="6.5" fill="${color}" stroke="${isLight ? '#ffffff' : '#090d16'}" stroke-width="2" />
                                    <text x="${pt.x}" y="${pt.y + 3}" text-anchor="middle" fill="#000000" font-size="8" font-family="'JetBrains Mono', monospace" font-weight="900" pointer-events="none">${pt.rank}</text>
                                </g>
                            `;
                        });

                        // Etiqueta del socio al final del trazado
                        const lastPt = pathPoints[pathPoints.length - 1];
                        if (lastPt) {
                            svgContent += `
                                <g class="cursor-pointer" onclick="window.ClasificacionApp.openMemberDrawer(${s.member.id})" onmouseenter="window.ClasificacionApp.highlightMemberLine(${s.member.id})" onmouseleave="window.ClasificacionApp.highlightMemberLine(null)">
                                    <text x="${lastPt.x + 12}" y="${lastPt.y + 3.5}" fill="${color}" font-size="11" font-family="'Plus Jakarta Sans', sans-serif" font-weight="bold">${s.name}</text>
                                </g>
                            `;
                        }
                    });

                } else {
                    // Modo GAP TO LEADER (Distancia en puntos al primer clasificado: 0 = líder)
                    let maxGap = 10;
                    this.sortedRanking.forEach((s) => {
                        if (!this.chartSelectedMembers.has(s.member.id)) return;
                        jornadasAsc.forEach((j, idx) => {
                            const st = standingsHistory[idx].get(s.member.id);
                            if (st && st.gapToLeader > maxGap) maxGap = st.gapToLeader;
                        });
                    });
                    maxGap = Math.ceil(maxGap / 5) * 5;

                    const yScale = (gap) => padding.top + (gap / maxGap) * plotHeight;

                    // Líneas guía horizontales de distancia
                    const step = Math.max(5, Math.ceil(maxGap / 4));
                    for (let g = 0; g <= maxGap; g += step) {
                        const y = yScale(g);
                        svgContent += `
                            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${gridColor}" stroke-dasharray="3,3" stroke-width="1"/>
                            <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" fill="${labelColor}" font-size="10" font-family="'JetBrains Mono', monospace" font-weight="bold">${g === 0 ? '👑 0' : '-' + g}</text>
                        `;
                    }

                    // Líneas verticales por cada jornada
                    jornadasAsc.forEach((j, idx) => {
                        const x = xScale(idx);
                        svgContent += `
                            <line x1="${x}" y1="${padding.top - 10}" x2="${x}" y2="${height - padding.bottom + 8}" stroke="${gridColor}" stroke-width="0.7"/>
                            <text x="${x}" y="${height - padding.bottom + 22}" text-anchor="middle" fill="${labelColor}" font-size="11" font-family="'JetBrains Mono', monospace" font-weight="bold">J${j.number}</text>
                        `;
                    });

                    // Trazados de distancia
                    this.sortedRanking.forEach((s, sIdx) => {
                        if (!this.chartSelectedMembers.has(s.member.id)) return;
                        const color = this.chartColors[sIdx % this.chartColors.length];

                        const pathPoints = [];
                        jornadasAsc.forEach((j, idx) => {
                            const standing = standingsHistory[idx].get(s.member.id);
                            const gap = standing ? standing.gapToLeader : 0;
                            pathPoints.push({
                                x: xScale(idx),
                                y: yScale(gap),
                                gap: gap,
                                rank: standing ? standing.rank : 1,
                                points: standing ? standing.points : 0,
                                jNum: j.number
                            });
                        });

                        let d = '';
                        for (let i = 0; i < pathPoints.length; i++) {
                            const curr = pathPoints[i];
                            if (i === 0) d += `M ${curr.x} ${curr.y}`;
                            else {
                                const prev = pathPoints[i - 1];
                                const cp1x = prev.x + (curr.x - prev.x) * 0.5;
                                const cp1y = prev.y;
                                const cp2x = prev.x + (curr.x - prev.x) * 0.5;
                                const cp2y = curr.y;
                                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
                            }
                        }

                        svgContent += `
                            <path d="${d}" 
                                  fill="none" 
                                  stroke="${color}" 
                                  stroke-width="3" 
                                  stroke-linecap="round" 
                                  stroke-linejoin="round" 
                                  class="bump-path transition-all duration-200 cursor-pointer"
                                  data-member-id="${s.member.id}"
                                  onmouseenter="window.ClasificacionApp.highlightMemberLine(${s.member.id})"
                                  onmouseleave="window.ClasificacionApp.highlightMemberLine(null)"
                                  style="opacity: 0.9;" />
                        `;

                        pathPoints.forEach(pt => {
                            const ttContent = `<strong style="color: ${color};">${s.name}</strong><br/>Jornada ${pt.jNum} &bull; ${pt.gap === 0 ? '<span style="color:#fbbf24;">👑 Líder</span>' : 'A -' + pt.gap + ' pts del líder'}<br/><span style="color:#94a3b8;">#${pt.rank} &bull; ${pt.points} pts acumulados</span>`;
                            svgContent += `
                                <g class="bump-node transition-all cursor-pointer" 
                                   data-member-id="${s.member.id}"
                                   onmouseenter="window.ClasificacionApp.showBumpTooltip(event, '${ttContent}'); window.ClasificacionApp.highlightMemberLine(${s.member.id})"
                                   onmouseleave="window.ClasificacionApp.hideBumpTooltip(); window.ClasificacionApp.highlightMemberLine(null)">
                                    <circle cx="${pt.x}" cy="${pt.y}" r="5.5" fill="${color}" stroke="${isLight ? '#ffffff' : '#090d16'}" stroke-width="2" />
                                </g>
                            `;
                        });

                        const lastPt = pathPoints[pathPoints.length - 1];
                        if (lastPt) {
                            svgContent += `
                                <g class="cursor-pointer" onclick="window.ClasificacionApp.openMemberDrawer(${s.member.id})" onmouseenter="window.ClasificacionApp.highlightMemberLine(${s.member.id})" onmouseleave="window.ClasificacionApp.highlightMemberLine(null)">
                                    <text x="${lastPt.x + 12}" y="${lastPt.y + 3.5}" fill="${color}" font-size="11" font-family="'Plus Jakarta Sans', sans-serif" font-weight="bold">${s.name} (${lastPt.gap === 0 ? '👑' : '-' + lastPt.gap})</text>
                                </g>
                            `;
                        }
                    });
                }

                svg.innerHTML = svgContent;
            }

            // --- CONTROLES DE PESTAÑAS DE VISTA ---
            switchView(viewName) {
                this.currentView = viewName;

                const vr = document.getElementById('view-ranking');
                const vm = document.getElementById('view-matrix');
                const vc = document.getElementById('view-chart');

                if (vm) vm.style.display = viewName === 'matrix' ? 'block' : 'none';
                if (vr) vr.style.display = viewName === 'ranking' ? 'block' : 'none';
                if (vc) vc.style.display = viewName === 'chart' ? 'block' : 'none';

                // Botones
                const btns = {
                    matrix: document.getElementById('tab-btn-matrix'),
                    ranking: document.getElementById('tab-btn-ranking'),
                    chart: document.getElementById('tab-btn-chart')
                };

                Object.keys(btns).forEach(k => {
                    const btn = btns[k];
                    if (!btn) return;
                    if (k === viewName) {
                        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
                    } else {
                        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-1.5';
                    }
                });

                // Actualizar indicador y checkmarks en móvil
                const mobileLabel = document.getElementById('mobile-active-view-label');
                if (mobileLabel) {
                    if (viewName === 'matrix') mobileLabel.innerHTML = '📊 Desglose';
                    else if (viewName === 'chart') mobileLabel.innerHTML = '🚀 Escalada';
                    else mobileLabel.innerHTML = '🏅 Ranking';
                }
                const chkRanking = document.getElementById('mobile-check-ranking');
                const chkMatrix = document.getElementById('mobile-check-matrix');
                const chkChart = document.getElementById('mobile-check-chart');
                if (chkRanking) chkRanking.classList.toggle('hidden', viewName !== 'ranking');
                if (chkMatrix) chkMatrix.classList.toggle('hidden', viewName !== 'matrix');
                if (chkChart) chkChart.classList.toggle('hidden', viewName !== 'chart');

                if (viewName === 'chart') {
                    if (!this.chartInitialized) {
                        this.initChart();
                    } else {
                        this.renderChartChips();
                        setTimeout(() => this.renderChartSVG(), 50);
                    }
                } else if (viewName === 'matrix') {
                    if (!this.matrixRendered) this.renderMatrixTable();
                    setTimeout(() => this.adjustMatrixStickyHeaders(), 30);
                }
            }

            // --- FILTRO POR CATEGORÍA ---
            setCategoryFilter(filterName) {
                this.activeCategoryFilter = filterName;
                document.querySelectorAll('.category-filter-btn').forEach(btn => {
                    const f = btn.getAttribute('data-filter');
                    if (f === filterName) {
                        btn.className = 'category-filter-btn px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow transition';
                    } else {
                        btn.className = 'category-filter-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
                    }
                });

                // Actualizar checkmarks de filtros en móvil
                const filterMap = {
                    all: document.getElementById('mobile-filter-check-all'),
                    podium: document.getElementById('mobile-filter-check-podium'),
                    prizes: document.getElementById('mobile-filter-check-prizes'),
                    penalties: document.getElementById('mobile-filter-check-penalties')
                };
                Object.keys(filterMap).forEach(k => {
                    const el = filterMap[k];
                    if (el) el.classList.toggle('hidden', k !== filterName);
                });

                this.renderRankingTable();
            }

            // --- FILTRO POR BÚSQUEDA ---
            filterMembers(val) {
                this.searchQuery = val.trim();
                this.renderRankingTable();
            }

            // --- MODAL / DRAWER DE FICHA DEL SOCIO ---
            openMemberDrawerByRank(rank) {
                const s = this.sortedRanking[rank - 1];
                if (s) this.openMemberDrawer(s.member.id);
            }

            openMemberDrawer(memberId) {
                this.currentMemberDrawerId = memberId;
                this.hideFloatingCard();
                const s = this.memberStats[memberId];
                if (!s) return;

                const rank = this.sortedRanking.findIndex(x => x.member.id === memberId) + 1;

                document.getElementById('drawer-name').textContent = s.name;
                document.getElementById('drawer-id-text').textContent = `ID: ${s.member.id} | ${s.member.alias ? s.member.alias : 'Socio Oficial'}`;
                document.getElementById('drawer-rank-pill').textContent = `#${rank} en la General`;

                // Avatar / Medalla
                const avatar = document.getElementById('drawer-avatar');
                if (rank === 1) avatar.textContent = '🥇';
                else if (rank === 2) avatar.textContent = '🥈';
                else if (rank === 3) avatar.textContent = '🥉';
                else if (rank === this.sortedRanking.length) avatar.textContent = '🐸';
                else avatar.textContent = '👤';

                // Estadísticas
                document.getElementById('drawer-stat-points').textContent = s.grandTotal;
                document.getElementById('drawer-stat-hits').textContent = s.baseTotal;
                const bEl = document.getElementById('drawer-stat-bonus');
                bEl.textContent = `${s.bonusTotal >= 0 ? '+' : ''}${s.bonusTotal}`;
                bEl.className = `text-xl font-black font-mono ${s.bonusTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
                document.getElementById('drawer-stat-prizes').textContent = this.formatMoney(s.prizeTotal);

                // Desglose de Bonus
                const bContainer = document.getElementById('drawer-bonus-breakdown');
                bContainer.innerHTML = `
                    <div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                        <span class="text-slate-600 dark:text-slate-400">14/15 aciertos (+30)</span>
                        <strong class="text-amber-600 dark:text-amber-400">${s.bonusCounts[15] + s.bonusCounts[14]}</strong>
                    </div>
                    <div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                        <span class="text-slate-600 dark:text-slate-400">13 aciertos (+15)</span>
                        <strong class="text-emerald-600 dark:text-emerald-400">${s.bonusCounts[13]}</strong>
                    </div>
                    <div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                        <span class="text-slate-600 dark:text-slate-400">12 aciertos (+10)</span>
                        <strong class="text-blue-600 dark:text-blue-400">${s.bonusCounts[12]}</strong>
                    </div>
                    <div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                        <span class="text-slate-600 dark:text-slate-400">11 aciertos (+5)</span>
                        <strong class="text-teal-600 dark:text-teal-400">${s.bonusCounts[11]}</strong>
                    </div>
                    <div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                        <span class="text-slate-600 dark:text-slate-400">10 aciertos (+3)</span>
                        <strong class="text-indigo-600 dark:text-indigo-400">${s.bonusCounts[10]}</strong>
                    </div>
                    <div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                        <span class="text-rose-600 dark:text-rose-400">Penal. bajas / retrasos</span>
                        <strong class="text-rose-600 dark:text-rose-400">-${s.negativePenalties} pts (${s.penaltyCounts.low + s.penaltyCounts.late})</strong>
                    </div>
                `;

                // Historial de Jornadas
                const tbody = document.getElementById('drawer-history-tbody');
                let hHtml = '';
                this.visibleJornadas.forEach(j => {
                    const data = s.jornadaData[j.id];
                    if (!data || data.hits === -1) return;

                    let statusBadge = '<span class="text-emerald-600 dark:text-emerald-400 font-bold">A tiempo</span>';
                    if (data.isLate && !data.isPardoned) {
                        statusBadge = `
                            <div class="inline-flex items-center gap-1.5 justify-center">
                                <span class="text-rose-600 dark:text-rose-400 font-bold">Retraso ⏱️</span>
                                <button onclick="window.ClasificacionApp.togglePardon('${j.id}', '${s.id}')" class="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition font-bold cursor-pointer" title="Perdonar / indultar retraso">Perdonar 🕊️</button>
                            </div>
                        `;
                    } else if (data.isPardoned) {
                        statusBadge = `
                            <div class="flex flex-col items-center justify-center gap-0.5">
                                <div class="inline-flex items-center gap-1.5 justify-center">
                                    <span class="text-amber-600 dark:text-amber-400 font-bold" title="${data.pardonReason ? 'Justificación: ' + data.pardonReason : 'Justificado oficialmente'}">Justificado 🕊️</span>
                                    <button onclick="window.ClasificacionApp.togglePardon('${j.id}', '${s.id}')" class="px-1.5 py-0.5 text-[10px] rounded bg-slate-500/20 text-slate-500 dark:text-slate-400 hover:bg-slate-500/30 transition font-bold cursor-pointer" title="Modificar o revocar justificación">Modificar / Revocar</button>
                                </div>
                                ${data.pardonReason ? `<span class="text-[9px] text-slate-400 dark:text-slate-500 italic max-w-[150px] truncate" title="${data.pardonReason}">"${data.pardonReason}"</span>` : ''}
                            </div>
                        `;
                    }

                    const bonusStr = data.bonus > 0 ? `+${data.bonus}` : (data.bonus < 0 ? `${data.bonus}` : '-');
                    const bonusClass = data.bonus > 0 ? 'text-emerald-600 dark:text-emerald-400' : (data.bonus < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500');

                    hHtml += `
                        <tr class="hover:bg-slate-100 dark:hover:bg-slate-800/50">
                            <td class="py-2 px-3.5 font-bold text-slate-800 dark:text-slate-300 whitespace-nowrap">Jornada ${j.number}</td>
                            <td class="py-2 px-3 text-center text-slate-900 dark:text-white font-bold whitespace-nowrap">${data.hits}</td>
                            <td class="py-2 px-3 text-center ${bonusClass} font-bold whitespace-nowrap">${bonusStr}</td>
                            <td class="py-2 px-3 text-center text-amber-600 dark:text-amber-400 font-black whitespace-nowrap">${data.points}</td>
                            <td class="py-2 px-3 text-center text-purple-600 dark:text-purple-400 whitespace-nowrap">${data.prize > 0 ? this.formatMoney(data.prize) : '-'}</td>
                            <td class="py-2 px-3.5 text-center whitespace-nowrap">${statusBadge}</td>
                        </tr>
                    `;
                });

                tbody.innerHTML = hHtml || '<tr><td colspan="6" class="p-4 text-center text-slate-500">Sin jornadas disputadas aún</td></tr>';

                const modal = document.getElementById('member-drawer-modal');
                if (modal) modal.style.display = 'flex';
            }

            closeMemberDrawer() {
                const modal = document.getElementById('member-drawer-modal');
                if (modal) modal.style.display = 'none';
            }

            async togglePardon(jId, mId) {
                const pronosticos = this.seasonData ? (this.seasonData.pronosticos || []) : [];
                const p = pronosticos.find(item => 
                    (String(item.jId) === String(jId) || String(item.jornadaId) === String(jId)) &&
                    (String(item.mId) === String(mId) || String(item.memberId) === String(mId))
                );
                if (!p) {
                    alert('No se encontró el pronóstico correspondiente.');
                    return;
                }

                const willPardon = !p.pardoned;
                let finalReason = '';

                if (willPardon) {
                    const reason = prompt('Indica el motivo o justificación de perdonar la sanción por retraso:\n(Ej: "Avisó antes del cierre", "Fallo técnico", "Acuerdo de socios", etc.)', p.pardonReason || '');
                    if (reason === null) return; // Cancelado por el usuario
                    finalReason = reason.trim() || 'Acuerdo de socios';
                    p.pardoned = true;
                    p.pardonReason = finalReason;
                } else {
                    const choice = prompt('Este retraso ya está indultado.\n\n- Escribe un nuevo motivo para actualizar la justificación.\n- O escribe "REVOCAR" para retirar el perdón y reactivar la sanción por retraso:', p.pardonReason || '');
                    if (choice === null) return; // Cancelado
                    if (choice.trim().toUpperCase() === 'REVOCAR') {
                        p.pardoned = false;
                        p.pardonReason = '';
                        p.pardonedBy = '';
                        p.pardonedAt = '';
                    } else {
                        finalReason = choice.trim() || 'Acuerdo de socios';
                        p.pardonReason = finalReason;
                    }
                }

                try {
                    const forgiverData = JSON.parse(sessionStorage.getItem('maulas_user') || '{}');
                    const forgiverName = window.AppUtils ? window.AppUtils.getMemberName(forgiverData) : (forgiverData.name || 'Administración');
                    if (p.pardoned) {
                        p.pardonedBy = forgiverName;
                        p.pardonedAt = new Date().toISOString();
                    }

                    if (window.DataService) {
                        await window.DataService.save('pronosticos', p);
                    }

                    if (p.pardoned && window.TelegramService) {
                        try {
                            const forgiven = this.seasonData && this.seasonData.members ? this.seasonData.members.find(m => String(m.id) === String(mId)) : null;
                            const forgivenName = forgiven && window.AppUtils ? window.AppUtils.getMemberName(forgiven) : (forgiven ? forgiven.name : 'Socio');
                            const jornada = this.seasonData && this.seasonData.jornadas ? this.seasonData.jornadas.find(j => String(j.id) === String(jId)) : null;
                            const jNum = jornada ? jornada.number : '?';

                            await window.TelegramService.sendPardonNotification(forgiverName, forgivenName, jNum, p.pardonReason);
                        } catch (te) {
                            console.warn('Error enviando notificación Telegram de indulto:', te);
                        }
                    }

                    // Recargar datos y refrescar clasificación manteniendo el drawer abierto
                    await this.init();
                    if (this.currentMemberDrawerId) {
                        this.openMemberDrawer(this.currentMemberDrawerId);
                    }
                } catch (err) {
                    console.error('Error al guardar el indulto:', err);
                    alert('Error al guardar el indulto en la base de datos.');
                }
            }

            // --- GESTIÓN DE TARJETA EXPLICATIVA GLOBAL FLOTANTE ---
            initFloatingCardListeners() {
                let activeTarget = null;

                document.addEventListener('mouseover', (e) => {
                    const target = e.target.closest('[data-card-type]');
                    if (!target) return;
                    if (target === activeTarget) return;

                    activeTarget = target;
                    const type = target.dataset.cardType;
                    const mId = target.dataset.cardId || target.dataset.mId;
                    const jId = target.dataset.jId;
                    let extra = null;
                    try {
                        if (target.dataset.cardExtra) extra = JSON.parse(target.dataset.cardExtra);
                    } catch (err) {}

                    const cardData = this.buildFloatingCardData(type, mId, jId, extra);
                    if (cardData) {
                        this.showFloatingCard(e, cardData.html, cardData.theme);
                    }
                });

                document.addEventListener('mousemove', (e) => {
                    if (!activeTarget) return;
                    this.positionFloatingCard(e);
                });

                document.addEventListener('mouseout', (e) => {
                    if (!activeTarget) return;
                    const toEl = e.relatedTarget;
                    if (toEl && activeTarget.contains(toEl)) return;

                    activeTarget = null;
                    this.hideFloatingCard();
                });

                window.addEventListener('scroll', () => {
                    if (activeTarget) {
                        activeTarget = null;
                        this.hideFloatingCard();
                    }
                }, { passive: true });
            }

            buildFloatingCardData(type, mId, jId, extra) {
                const s = mId ? this.memberStats[mId] : null;
                const totalSocios = this.sortedRanking.length;
                const rank = s ? this.sortedRanking.findIndex(x => x.member.id === s.member.id) + 1 : 0;

                // 1. Ganador / Podio / 🐸 El Maula / Puesto
                if (type === 'rank' && s) {
                    if (rank === 1) {
                        const top2 = this.sortedRanking[1];
                        const diff = top2 ? s.grandTotal - top2.grandTotal : 0;
                        return {
                            theme: 'amber',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-amber-500/40">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/50 flex items-center gap-1 shadow-sm">
                                            <span>👑</span> 1º Clasificado
                                        </span>
                                        <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">#1 · Líder</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>🥇</span> <span>${s.name}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Líder provisional de la Peña Maulas encabezando la temporada regular.
                                    </p>
                                    <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-amber-500/30 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Puntos Totales:</span>
                                            <strong class="text-amber-600 dark:text-amber-400 text-xs font-black">${s.grandTotal} pts</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[10px]">
                                            <span>Desglose:</span>
                                            <span><strong>${s.baseTotal}</strong> base | <strong class="text-emerald-600 dark:text-emerald-400">+${s.positiveBonus}</strong> | <strong class="text-rose-600 dark:text-rose-400">-${s.negativePenalties}</strong></span>
                                        </div>
                                        <div class="flex justify-between items-center text-emerald-600 dark:text-emerald-400 text-[10px]">
                                            <span>Ventaja sobre 2º:</span>
                                            <strong class="font-bold">+${diff} pts</strong>
                                        </div>
                                    </div>
                                    <div class="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-1.5 flex items-center gap-1">
                                        <span>🏆</span> <span>${(s.winsList || []).length} jornadas ganadas esta temporada</span>
                                    </div>
                                </div>
                            `
                        };
                    } else if (rank === 2) {
                        const top1 = this.sortedRanking[0];
                        const diff = top1 ? top1.grandTotal - s.grandTotal : 0;
                        return {
                            theme: 'slate',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-slate-300 dark:border-slate-700">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center gap-1">
                                            <span>🥈</span> 2º Clasificado
                                        </span>
                                        <span class="text-xs font-mono font-black text-slate-700 dark:text-slate-300">#2 · Subcampeón</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>🥈</span> <span>${s.name}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Subcampeón provisional en plena lucha directa por el liderato general.
                                    </p>
                                    <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Puntos Totales:</span>
                                            <strong class="text-slate-900 dark:text-slate-100 text-xs font-black">${s.grandTotal} pts</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-amber-600 dark:text-amber-400 text-[10px]">
                                            <span>Distancia al líder:</span>
                                            <strong class="font-bold">${diff === 0 ? 'Empatado' : `-${diff} pts`}</strong>
                                        </div>
                                    </div>
                                </div>
                            `
                        };
                    } else if (rank === 3) {
                        const top1 = this.sortedRanking[0];
                        const diff = top1 ? top1.grandTotal - s.grandTotal : 0;
                        return {
                            theme: 'amber',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-amber-800/30">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-800/15 dark:bg-amber-700/20 text-amber-950 dark:text-amber-200 border border-amber-800/40 dark:border-amber-700/50 flex items-center gap-1">
                                            <span>🥉</span> 3º Clasificado
                                        </span>
                                        <span class="text-xs font-mono font-black text-amber-800 dark:text-amber-400">#3 · Podio</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>🥉</span> <span>${s.name}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Puesto de bronce consolidado en el podio de honor de la temporada.
                                    </p>
                                    <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-amber-700/30 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Puntos Totales:</span>
                                            <strong class="text-slate-900 dark:text-slate-100 text-xs font-black">${s.grandTotal} pts</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-amber-700 dark:text-amber-300 text-[10px]">
                                            <span>Distancia al líder:</span>
                                            <strong class="font-bold">${diff === 0 ? 'Empatado' : `-${diff} pts`}</strong>
                                        </div>
                                    </div>
                                </div>
                            `
                        };
                    } else if (rank === totalSocios) {
                        const penult = this.sortedRanking[totalSocios - 2];
                        const gap = penult ? penult.grandTotal - s.grandTotal : 0;
                        return {
                            theme: 'emerald',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-emerald-500/40">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shadow-sm">
                                            <span>🐸</span> El Maula Provisional
                                        </span>
                                        <span class="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">#${rank} · Farolillo Rojo</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>🐸</span> <span>${s.name}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Ocupa actualmente la última posición general. ¡Tiene que apretar para entregarle la rana a otro compañero!
                                    </p>
                                    <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/30 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Puntos Totales:</span>
                                            <strong class="text-emerald-600 dark:text-emerald-400 text-xs font-black">${s.grandTotal} pts</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-amber-600 dark:text-amber-400 text-[10px]">
                                            <span>Salvación (18º):</span>
                                            <strong class="font-bold">${gap > 0 ? `a ${gap} pts del 18º` : 'Empatado a puntos'}</strong>
                                        </div>
                                    </div>
                                </div>
                            `
                        };
                    } else {
                        return {
                            theme: 'amber',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                                            🏅 #${rank} Clasificado
                                        </span>
                                        <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">${s.grandTotal} pts</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white">
                                        ${s.name}
                                    </div>
                                    <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between"><span>Aciertos base:</span><strong>${s.baseTotal}</strong></div>
                                        <div class="flex justify-between"><span>Bonus neto:</span><strong class="${s.bonusTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${s.bonusTotal >= 0 ? '+' : ''}${s.bonusTotal}</strong></div>
                                    </div>
                                </div>
                            `
                        };
                    }
                }

                // 2. Desglose detallado de puntos matemáticos
                if (type === 'breakdown' && s) {
                    const media = s.jornadasPlayed > 0 ? (s.grandTotal / s.jornadasPlayed).toFixed(1) : '0.0';
                    return {
                        theme: 'amber',
                        html: `
                            <div class="space-y-2">
                                <div class="flex items-center justify-between pb-1.5 border-b border-amber-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/50 flex items-center gap-1 shadow-sm">
                                        <span>📊</span> Desglose de Puntuación
                                    </span>
                                    <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">#${rank} en la General</span>
                                </div>
                                <div class="font-black text-sm text-slate-900 dark:text-white">
                                    ${s.name}
                                </div>
                                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Cálculo oficial de la clasificación general combinando aciertos, bonificaciones y penalizaciones.
                                </p>
                                <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-amber-500/30 font-mono text-[11px] space-y-1.5">
                                    <div class="flex justify-between items-center text-slate-700 dark:text-slate-200">
                                        <span>🎯 Aciertos Base:</span>
                                        <strong class="font-black text-slate-900 dark:text-white">${s.baseTotal} pts</strong>
                                    </div>
                                    <div class="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                                        <span>⭐ Bonus Ganados (+):</span>
                                        <strong class="font-black">+${s.positiveBonus} pts</strong>
                                    </div>
                                    <div class="flex justify-between items-center text-rose-600 dark:text-rose-400">
                                        <span>⚠️ Penalizaciones (-):</span>
                                        <strong class="font-black">-${s.negativePenalties} pts</strong>
                                    </div>
                                    <div class="border-t border-slate-300 dark:border-slate-700/80 pt-1.5 flex justify-between items-center text-amber-600 dark:text-amber-400">
                                        <span class="font-black text-xs">TOTAL GENERAL:</span>
                                        <strong class="text-sm font-black">${s.grandTotal} pts</strong>
                                    </div>
                                </div>
                                <div class="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-1.5 font-mono leading-tight">
                                    Fórmula: ${s.baseTotal} base + ${s.positiveBonus} bonus - ${s.negativePenalties} penal = <strong class="text-amber-600 dark:text-amber-400">${s.grandTotal} pts</strong> (Media: ${media}/J).
                                </div>
                            </div>
                        `
                    };
                }

                // 3. Premiado / Premios en Metálico
                if (type === 'prize' && s) {
                    const count = (s.prizesList || []).length;
                    const listHtml = count > 0
                        ? s.prizesList.map(p => `
                            <div class="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-950/80 border border-purple-500/20 flex items-center justify-between text-[11px]">
                                <span class="text-slate-700 dark:text-slate-300">Jornada ${p.jNum} (${p.hits} aciertos)</span>
                                <strong class="text-purple-600 dark:text-purple-300 font-black">+${this.formatMoney(p.amount)}</strong>
                            </div>
                        `).join('')
                        : `<div class="p-2 rounded-lg bg-slate-200/60 dark:bg-slate-950/80 text-slate-500 text-center text-xs">Sin premios registrados</div>`;

                    return {
                        theme: 'purple',
                        html: `
                            <div class="space-y-2">
                                <div class="flex items-center justify-between pb-1.5 border-b border-purple-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 flex items-center gap-1 shadow-sm">
                                        <span>💰</span> Socio Premiado
                                    </span>
                                    <span class="text-xs font-mono font-black text-purple-600 dark:text-purple-300">${this.formatMoney(s.prizeTotal)}</span>
                                </div>
                                <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>🏆</span> <span>${s.name}</span>
                                </div>
                                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Premios oficiales en metálico obtenidos en los botes de la temporada.
                                </p>
                                <div class="space-y-1.5 max-h-40 overflow-y-auto custom-scroll pr-0.5 font-mono">
                                    ${listHtml}
                                </div>
                                <div class="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-1.5 flex justify-between">
                                    <span>Total jornadas con bote:</span>
                                    <strong class="text-purple-600 dark:text-purple-400 font-bold">${count}</strong>
                                </div>
                            </div>
                        `
                    };
                }

                // 4. Penalizado / Penalizaciones Acumuladas
                if (type === 'penalty' && s) {
                    const penCount = (s.penaltiesList || []).length;
                    const penListHtml = penCount > 0
                        ? s.penaltiesList.slice(0, 4).map(p => `
                            <div class="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-950/80 border border-rose-500/20 flex items-center justify-between text-[11px]">
                                <span class="text-slate-700 dark:text-slate-300">J${p.jNum}: ${p.reason}</span>
                                <strong class="text-rose-600 dark:text-rose-400 font-bold">-${p.penalty} pts</strong>
                            </div>
                        `).join('')
                        : '';

                    return {
                        theme: 'rose',
                        html: `
                            <div class="space-y-2">
                                <div class="flex items-center justify-between pb-1.5 border-b border-rose-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 flex items-center gap-1 shadow-sm">
                                        <span>⚠️</span> Socio Penalizado
                                    </span>
                                    <span class="text-xs font-mono font-black text-rose-600 dark:text-rose-400">-${s.negativePenalties} pts</span>
                                </div>
                                <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>⏱️</span> <span>${s.name}</span>
                                </div>
                                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Puntos deducidos por baja puntuación (≤5 aciertos) o envíos realizados fuera de plazo.
                                </p>
                                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-rose-500/30 font-mono text-[11px] space-y-1">
                                    <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                        <span>Bajas puntuaciones (≤5 hits):</span>
                                        <strong class="text-rose-600 dark:text-rose-400">${s.penaltyCounts.low} veces</strong>
                                    </div>
                                    <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                        <span>Fuera de plazo (retraso ⏱️):</span>
                                        <strong class="text-rose-600 dark:text-rose-400">${s.penaltyCounts.late} veces</strong>
                                    </div>
                                </div>
                                ${penListHtml ? `<div class="space-y-1 font-mono">${penListHtml}</div>` : ''}
                                <div class="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-1.5">
                                    Las penalizaciones se restan directamente del casillero general.
                                </div>
                            </div>
                        `
                    };
                }

                // 5. Bonus Positivos
                if (type === 'bonus' && s) {
                    return {
                        theme: 'emerald',
                        html: `
                            <div class="space-y-2">
                                <div class="flex items-center justify-between pb-1.5 border-b border-emerald-500/40">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                        <span>⭐</span> Bonus Obtenidos
                                    </span>
                                    <span class="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">+${s.positiveBonus} pts</span>
                                </div>
                                <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>⭐</span> <span>${s.name}</span>
                                </div>
                                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Bonificaciones reglamentarias sumadas al casillero por aciertos extraordinarios.
                                </p>
                                <div class="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                                    <div class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/20 flex justify-between">
                                        <span class="text-slate-600 dark:text-slate-400">14/15 (+30):</span>
                                        <strong class="text-amber-600 dark:text-amber-400 font-bold">${s.bonusCounts[15] + s.bonusCounts[14]}</strong>
                                    </div>
                                    <div class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/20 flex justify-between">
                                        <span class="text-slate-600 dark:text-slate-400">13 hits (+15):</span>
                                        <strong class="text-emerald-600 dark:text-emerald-400 font-bold">${s.bonusCounts[13]}</strong>
                                    </div>
                                    <div class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/20 flex justify-between">
                                        <span class="text-slate-600 dark:text-slate-400">12 hits (+10):</span>
                                        <strong class="text-blue-600 dark:text-blue-400 font-bold">${s.bonusCounts[12]}</strong>
                                    </div>
                                    <div class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/20 flex justify-between">
                                        <span class="text-slate-600 dark:text-slate-400">11 hits (+5):</span>
                                        <strong class="text-teal-600 dark:text-teal-400 font-bold">${s.bonusCounts[11]}</strong>
                                    </div>
                                    <div class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/20 flex justify-between col-span-2">
                                        <span class="text-slate-600 dark:text-slate-400">10 hits (+3):</span>
                                        <strong class="text-indigo-600 dark:text-indigo-400 font-bold">${s.bonusCounts[10]}</strong>
                                    </div>
                                </div>
                            </div>
                        `
                    };
                }

                // 6. Celda de la Matriz General
                if (type === 'matrix-cell' && s && jId) {
                    const j = this.visibleJornadas.find(x => String(x.id) === String(jId));
                    const cell = s.jornadaData[jId];
                    if (!j || !cell || cell.hits === -1) return null;

                    const isMax = j.stats && cell.points === j.stats.maxScore && j.stats.maxScore > 0;
                    const isMin = j.stats && cell.points === j.stats.minScore && j.stats.minScore !== j.stats.maxScore;
                    const isLate = cell.isLate && !cell.isPardoned;

                    if (j.isInPlay) {
                        const ch = s.rankChange || 0;
                        let effectHtml = '';
                        if (ch > 0) {
                            effectHtml = `<span class="text-emerald-500 font-black">Sube ${ch} puestos (↑+${ch})</span>`;
                        } else if (ch < 0) {
                            effectHtml = `<span class="text-rose-500 font-black">Baja ${Math.abs(ch)} puestos (↓${ch})</span>`;
                        } else {
                            effectHtml = `<span class="text-blue-500 dark:text-blue-400 font-black">Mantiene puesto (=)</span>`;
                        }

                        return {
                            theme: 'emerald',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-emerald-500/40">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                            <span>🟢</span> Jornada ${j.number} · En Juego
                                        </span>
                                        <span class="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">${cell.hits} aciertos prov.</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>🟢</span> <span>${s.name}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Puntuación provisional en directo con <strong>${j.filledMatches} de 15</strong> partidos finalizados.
                                    </p>
                                    <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-emerald-500/30 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Aciertos parciales:</span>
                                            <strong class="text-emerald-600 dark:text-emerald-400 text-xs">${cell.hits} aciertos</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Puesto provisional:</span>
                                            <strong class="text-amber-500 font-black">#${s.liveRank}</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-[10px] border-t border-slate-200 dark:border-slate-800 pt-1">
                                            <span class="text-slate-500">Efecto en Ranking:</span>
                                            ${effectHtml}
                                        </div>
                                    </div>
                                </div>
                            `
                        };
                    } else if (isMax) {
                        return {
                            theme: 'amber',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-amber-500/40">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/50 flex items-center gap-1 shadow-sm">
                                            <span>👑</span> Ganador Jornada ${j.number}
                                        </span>
                                        <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">${cell.points} pts</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>👑</span> <span>${s.name}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        ¡Mejor puntuación conseguida en toda la peña en la Jornada ${j.number}!
                                    </p>
                                    <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-amber-500/30 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                            <span>Aciertos boleto:</span>
                                            <strong class="text-slate-900 dark:text-white">${cell.hits} aciertos</strong>
                                        </div>
                                        <div class="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                                            <span>Bonus otorgado:</span>
                                            <strong class="font-bold">${cell.bonus > 0 ? '+' + cell.bonus : '0'} pts</strong>
                                        </div>
                                        ${cell.prize > 0 ? `
                                            <div class="flex justify-between items-center text-purple-600 dark:text-purple-400 border-t border-slate-300 dark:border-slate-800 pt-1">
                                                <span>Premio ganado:</span>
                                                <strong class="font-black">+${this.formatMoney(cell.prize)}</strong>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `
                        };
                    } else if (isLate) {
                        return {
                            theme: 'rose',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-rose-500/40">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 flex items-center gap-1 shadow-sm">
                                            <span>⏱️</span> Fuera de Plazo
                                        </span>
                                        <span class="text-xs font-mono font-black text-rose-600 dark:text-rose-400">-2 pts penal.</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>⏱️</span> <span>${s.name} · J${j.number}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Pronóstico registrado con posterioridad a la hora límite de inicio de la jornada.
                                    </p>
                                    <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-rose-500/30 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between"><span>Puntos finales:</span><strong class="text-rose-600 dark:text-rose-400">${cell.points} pts</strong></div>
                                    </div>
                                </div>
                            `
                        };
                    } else if (isMin) {
                        return {
                            theme: 'rose',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-rose-500/40">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 flex items-center gap-1 shadow-sm">
                                            <span>🔴</span> Puntuación Mínima
                                        </span>
                                        <span class="text-xs font-mono font-black text-rose-600 dark:text-rose-400">${cell.points} pts</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white">
                                        ${s.name} · Jornada ${j.number}
                                    </div>
                                    <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Puntuación más baja registrada entre todos los socios en esta jornada (${cell.hits} aciertos).
                                    </p>
                                </div>
                            `
                        };
                    } else {
                        return {
                            theme: 'amber',
                            html: `
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                                            Jornada ${j.number}
                                        </span>
                                        <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">${cell.points} pts</span>
                                    </div>
                                    <div class="font-black text-sm text-slate-900 dark:text-white">
                                        ${s.name}
                                    </div>
                                    <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 font-mono text-[11px] space-y-1">
                                        <div class="flex justify-between"><span>Aciertos:</span><strong>${cell.hits}</strong></div>
                                        <div class="flex justify-between"><span>Bonus:</span><strong>${cell.bonus > 0 ? '+' + cell.bonus : (cell.bonus < 0 ? cell.bonus : '0')} pts</strong></div>
                                        <div class="flex justify-between"><span>Puntos finales:</span><strong class="text-amber-600 dark:text-amber-400">${cell.points} pts</strong></div>
                                    </div>
                                </div>
                            `
                        };
                    }
                }

                // 7. Cápsula de forma reciente
                if (type === 'form-capsule' && s && extra) {
                    const theme = extra.hits >= 11 ? 'emerald' : (extra.hits >= 9 ? 'slate' : (extra.hits >= 6 ? 'amber' : 'rose'));
                    return {
                        theme,
                        html: `
                            <div class="space-y-2">
                                <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                        Jornada ${extra.jNum} · Racha
                                    </span>
                                    <span class="text-xs font-mono font-black text-amber-600 dark:text-amber-400">${extra.points} pts</span>
                                </div>
                                <div class="font-black text-sm text-slate-900 dark:text-white">
                                    ${s.name}
                                </div>
                                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 font-mono text-[11px] space-y-1">
                                    <div class="flex justify-between"><span>Aciertos en boleto:</span><strong class="text-sm">${extra.hits}</strong></div>
                                    <div class="flex justify-between"><span>Puntos sumados:</span><strong class="text-amber-600 dark:text-amber-400">${extra.points} pts</strong></div>
                                </div>
                            </div>
                        `
                    };
                }

                // 8. Cabecera PIG
                if (type === 'pig-header') {
                    return {
                        theme: 'purple',
                        html: `
                            <div class="space-y-1.5">
                                <div class="flex items-center gap-1.5 pb-1 border-b border-purple-500/40 text-purple-700 dark:text-purple-300 font-black text-xs">
                                    <span>🐷</span> Partido PIG de la Jornada
                                </div>
                                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Partido especial Pleno al 15 con bonificación o condición PIG reglamentaria de la Peña Maulas.
                                </p>
                            </div>
                        `
                    };
                }

                return null;
            }

            showFloatingCard(e, htmlContent, theme = 'amber') {
                const card = document.getElementById('clasificacion-floating-card');
                if (!card) return;

                card.innerHTML = htmlContent;

                // Ajustar borde según tema de tarjeta
                if (theme === 'rose') {
                    card.style.borderColor = 'rgba(244, 63, 94, 0.85)';
                } else if (theme === 'purple') {
                    card.style.borderColor = 'rgba(168, 85, 247, 0.85)';
                } else if (theme === 'emerald') {
                    card.style.borderColor = 'rgba(16, 185, 129, 0.85)';
                } else if (theme === 'slate') {
                    card.style.borderColor = 'rgba(148, 163, 184, 0.85)';
                } else {
                    card.style.borderColor = 'rgba(245, 158, 11, 0.85)';
                }

                card.classList.remove('hidden');
                this.positionFloatingCard(e);

                requestAnimationFrame(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                });
            }

            positionFloatingCard(e) {
                const card = document.getElementById('clasificacion-floating-card');
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
                const card = document.getElementById('clasificacion-floating-card');
                if (!card) return;
                card.style.opacity = '0';
                card.style.transform = 'scale(0.96)';
                setTimeout(() => {
                    if (card.style.opacity === '0') {
                        card.classList.add('hidden');
                    }
                }, 150);
            }
        }

        // Inicializar aplicación al cargar el DOM
        document.addEventListener('DOMContentLoaded', () => {
            window.ClasificacionApp = new Clasificacion2App();
        });