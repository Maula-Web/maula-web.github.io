/**
 * BoteEngine - Lógica de cálculo financiero de la Peña Maulas
 * ==========================================================
 * Centraliza las matemáticas del bote para evitar duplicidades
 * y aligerar el archivo de interfaz de usuario.
 */
class BoteEngine {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Calcula todos los movimientos financieros de los socios a lo largo de la temporada.
     */
    calculateAllMovements(members, jornadas, pronosticos, pronosticosExtra, repartos, cierresVuelta, ingresos, cashPayments) {
        const movements = [];

        // Saldos iniciales heredados
        const initialBalances = {
            'Alvaro': 0, 'Carlos': 0, 'David Buzón': 0, 'Edu': 0, 'Emilio': 0,
            'F. Lozano': 0, 'F. Ramirez': 0, 'Heradio': 0, 'JA Valdivieso': 0,
            'Valdi': 0, 'Javi Mora': 0, 'Juan Antonio': 0, 'Juanan': 0, 'Juanjo': 0, 'Luismi': 0,
            'Marcelo': 0, 'Martin': 0, 'Rafa': 0, 'Ramon': 0, 'Raul Romera': 0,
            'Samuel': 0
        };

        // Pre-cálculo de exenciones por jornada
        const jornadaExemptions = jornadas.map((j, idx) => {
            const exemptIds = members.filter(m => {
                if (idx === 0) return false;
                const prev = jornadas[idx - 1];
                return this.getPrizesForMemberJornada(m.id, prev, pronosticos) > 0;
            }).map(m => m.id);
            return {
                id: j.id,
                exemptIds: exemptIds,
                payingCount: members.length - exemptIds.length
            };
        });

        members.forEach((member, memberIndex) => {
            const mName = (member.name || '').trim();
            let boteAcumulado = 0;
            if (mName) {
                const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const entry = Object.entries(initialBalances).find(([k, v]) => norm(k) === norm(mName) || norm(mName).includes(norm(k)) || norm(k).includes(norm(mName)));
                if (entry) boteAcumulado = entry[1];
            }

            const mIdStr = member.id ? String(member.id) : '';

            // Ingresos manuales SIN jornadaId vinculada (aportaciones directas al bote)
            const ingresosLibres = ingresos.filter(i =>
                String(i.memberId || i.mId) === mIdStr &&
                !i.jornadaId && !i.jId
            );

            // Línea de tiempo combinada
            const timeline = [
                ...jornadas.map(j => ({ type: 'jornada', date: j.date, data: j })),
                ...repartos.map(r => ({ type: 'reparto', date: r.date, data: r })),
                ...cierresVuelta.map(c => ({ type: 'cierre_vuelta', date: c.date, data: c })),
                ...ingresosLibres.map(i => ({ type: 'ingreso_libre', date: i.fecha || i.date, data: i }))
            ].sort((a, b) => {
                const dA = window.AppUtils.parseDate(a.date) || new Date(0);
                const dB = window.AppUtils.parseDate(b.date) || new Date(0);
                return dA - dB;
            });

            timeline.forEach(event => {
                if (event.type === 'jornada') {
                    const jornada = event.data;
                    const jornadaIndex = jornadas.findIndex(j => j.id === jornada.id);

                    const matchesWithResult = (jornada.matches || []).filter(m => {
                        const r = String(m.result || '').trim().toLowerCase();
                        return r !== '' && r !== 'por definir';
                    });
                    if (matchesWithResult.length === 0) return;

                    const infoRedist = jornadaExemptions[jornadaIndex];
                    const pronostico = pronosticos.find(p =>
                        (p.jId == jornada.id || p.jornadaId == jornada.id) &&
                        (String(p.mId || p.memberId) === mIdStr)
                    );

                    const costs = this.calculateJornadaCosts(member.id, members, jornadas, pronosticos, pronosticosExtra, cashPayments, jornada, pronostico, jornadaIndex, infoRedist);
                    const prizes = this.getPrizesForMemberJornada(member.id, jornada, pronosticos);
                    const manualIngresos = this.getManualIngresosForJornada(member.id, jornada, ingresos);
                    const penalties = costs.penalizacionUnos + (costs.penalizacionBajosAciertos || 0) + (costs.penalizacionPIG || 0) + (costs.penalizacionMaula || 0);

                    const isSelladoInCash = cashPayments.some(cp => String(cp.memberId) === mIdStr && String(cp.jornadaId) === String(jornada.id));

                    const selladoForNeto = isSelladoInCash ? 0 : costs.sellado;
                    const netoForSocio = manualIngresos - (costs.aportacion + penalties) - selladoForNeto;
                    boteAcumulado += netoForSocio;

                    let extraPrizes = 0;
                    if (memberIndex === 0) {
                        extraPrizes = this.getExtraPrizesForJornada(jornada, pronosticosExtra);
                    }

                    movements.push({
                        type: 'jornada',
                        memberId: member.id,
                        memberName: window.AppUtils.getMemberName(member),
                        jornadaId: jornada.id,
                        jornadaNum: jornada.number,
                        jornadaDate: jornada.date,
                        aportacion: costs.aportacion,
                        costeColumna: costs.columna,
                        penalizacionUnos: costs.penalizacionUnos,
                        penalizacionBajosAciertos: costs.penalizacionBajosAciertos,
                        penalizacionPIG: costs.penalizacionPIG,
                        penalizacionMaula: costs.penalizacionMaula || 0,
                        sellado: costs.sellado,
                        premios: prizes,
                        extraPrizes: extraPrizes,
                        ingresosManual: manualIngresos,
                        aciertos: costs.aciertos,
                        totalIngresos: (manualIngresos + prizes),
                        totalGastos: (costs.aportacion + penalties),
                        neto: netoForSocio,
                        boteAcumulado: boteAcumulado,
                        exento: costs.exento,
                        jugaDobles: costs.jugaDobles,
                        isSelladoInCash: isSelladoInCash,
                        isLoser: costs.isLoser,
                        isSealer: costs.isSealer || (costs.sellado < 0),
                        pennaIn: costs.aportacion + penalties + prizes + extraPrizes,
                        pennaOut: (isSelladoInCash && costs.sellado < 0) ? Math.abs(costs.sellado) : 0
                    });
                } else if (event.type === 'reparto') {
                    const r = event.data;
                    if (r.type === 'socios') {
                        const choice = (r.memberChoices || {})[member.id] || 'bote';
                        if (choice === 'bote') {
                            const splitAmount = r.totalAmount / members.length;
                            boteAcumulado += splitAmount;

                            movements.push({
                                type: 'reparto',
                                memberId: member.id,
                                memberName: window.AppUtils.getMemberName(member),
                                date: r.date,
                                description: r.description,
                                neto: splitAmount,
                                boteAcumulado: boteAcumulado,
                                isReparto: true
                            });
                        }
                    }
                } else if (event.type === 'cierre_vuelta') {
                    const c = event.data;
                    const penaltyForMember = (c.penalizaciones || {})[member.id] || 0;
                    if (penaltyForMember > 0) {
                        boteAcumulado -= penaltyForMember;
                        movements.push({
                            type: 'cierre_vuelta',
                            memberId: member.id,
                            memberName: window.AppUtils.getMemberName(member),
                            date: c.date,
                            description: c.tipo === 'primera_vuelta' ? 'Penalización 1ª Vuelta' : 'Penalización Fin de Temporada',
                            neto: -penaltyForMember,
                            boteAcumulado: boteAcumulado,
                            isCierreVuelta: true
                        });
                    }
                } else if (event.type === 'ingreso_libre') {
                    // Aportación manual directa al bote (sin jornada vinculada)
                    const i = event.data;
                    const amount = parseFloat(i.cantidad || i.amount || 0);
                    if (amount === 0) return;
                    boteAcumulado += amount;
                    movements.push({
                        type: 'ingreso_libre',
                        memberId: member.id,
                        memberName: window.AppUtils.getMemberName(member),
                        date: i.fecha || i.date,
                        jornadaNum: null,
                        jornadaDate: i.fecha || i.date,
                        description: i.concepto || i.metodo || 'Aportación manual',
                        ingresosManual: amount,
                        totalIngresos: amount,
                        totalGastos: 0,
                        neto: amount,
                        boteAcumulado: boteAcumulado,
                        pennaIn: 0,
                        isIngresoLibre: true
                    });
                }
            });
        });
        return movements;
    }

    calculateJornadaCosts(memberId, members, jornadas, pronosticos, pronosticosExtra, cashPayments, jornada, pronostico, jornadaIndex, infoRedist = null) {
        const matchesWithResult = (jornada.matches || []).filter(m => {
            const r = String(m.result || '').trim().toLowerCase();
            return r !== '' && r !== 'por definir';
        });
        const jornadaPlayed = matchesWithResult.length > 0;
        const jDate = window.AppUtils.parseDate(jornada.date);
        const numMembers = members.length;

        const costs = {
            aportacion: 0,
            columna: 0,
            dobles: 0,
            penalizacionUnos: 0,
            penalizacionBajosAciertos: 0,
            penalizacionPIG: 0,
            penalizacionMaula: 0,
            sellado: 0,
            aciertos: 0,
            exento: false,
            jugaDobles: false,
            isSustituto: false
        };

        if (jornada.noSellado) {
            if (pronostico && jornada.matches) {
                const currentSelection = pronostico.selection || pronostico.forecast;
                costs.aciertos = this.calculateAciertos(jornada.matches, currentSelection);
            }
            return costs;
        }

        if (!pronostico) {
            costs.columna = jornadaPlayed ? this.getHistoricalPrice('costeColumna', jDate) : 0;
            return costs;
        }

        const currentSelection = pronostico.selection || pronostico.forecast;
        if (jornada.matches && currentSelection) {
            costs.aciertos = this.calculateAciertos(jornada.matches, currentSelection);
        }

        if (jornadaIndex > 0) {
            const prevJornada = jornadas[jornadaIndex - 1];
            const hadPrize = this.getPrizesForMemberJornada(memberId, prevJornada, pronosticos) > 0;
            if (hadPrize) {
                costs.exento = true;
            }
        }

        const baseColumna = this.getHistoricalPrice('costeColumna', jDate);
        const baseAportacion = this.getHistoricalPrice('aportacionSemanal', jDate);

        if (costs.exento) {
            costs.columna = 0;
            costs.aportacion = 0;
        } else if (jornadaPlayed) {
            if (infoRedist && infoRedist.payingCount > 0 && infoRedist.payingCount < numMembers) {
                const numExempt = numMembers - infoRedist.payingCount;
                const extraPerExempt = this.getHistoricalPrice('costeExtraExento', jDate) || 0.20;
                costs.aportacion = baseAportacion + (numExempt * extraPerExempt);
                costs.columna = baseColumna;
            } else {
                costs.aportacion = baseAportacion;
                costs.columna = baseColumna;
            }
        }

        if (jornada.number === 1) {
            const member = members.find(m => String(m.id) === String(memberId));
            if (member && member.name) {
                const nameLow = member.name.toLowerCase();
                if (nameLow.includes('alvaro') || nameLow.includes('álvaro')) {
                    costs.jugaDobles = true;
                }
            }
        } else {
            const myExtra = pronosticosExtra ? pronosticosExtra.find(p =>
                (String(p.jId || p.jornadaId) === String(jornada.id) || String(p.jId || p.jornadaId) === String(jornada.number) || parseInt(p.jId || p.jornadaId) === jornada.number) &&
                String(p.mId || p.memberId) === String(memberId) &&
                p.selection && Array.isArray(p.selection) && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-')
            ) : null;

            if (myExtra) {
                costs.jugaDobles = true;
            } else if (jornadaIndex > 0) {
                const anyExtra = pronosticosExtra ? pronosticosExtra.some(p =>
                    (String(p.jId || p.jornadaId) === String(jornada.id) || String(p.jId || p.jornadaId) === String(jornada.number) || parseInt(p.jId || p.jornadaId) === jornada.number) &&
                    p.selection && Array.isArray(p.selection) && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-')
                ) : false;

                if (!anyExtra) {
                    const prevJornada = jornadas[jornadaIndex - 1];
                    if (this.wasWinnerOfJornada(memberId, prevJornada, members, jornadas, pronosticos)) {
                        costs.jugaDobles = true;
                    }
                }
            }
        }

        if (costs.exento) return costs;

        if (jornadaPlayed && currentSelection && Array.isArray(currentSelection)) {
            const first14 = currentSelection.slice(0, 14);
            const numUnos = first14.filter(f => f === '1').length;
            costs.penalizacionUnos = this.calculateHistoricalPenalty('unos', numUnos, jDate);

            if (costs.aciertos <= 3) {
                costs.penalizacionBajosAciertos = this.calculateHistoricalPenalty('bajos_aciertos', costs.aciertos, jDate);
            }

            let pigIdx = -1;
            if (jornada.pigMatchIndex !== undefined) {
                const explicitMatch = jornada.matches[jornada.pigMatchIndex];
                const isFemale = explicitMatch && (/\(F\)/i.test(String(explicitMatch.home)) || /\(F\)/i.test(String(explicitMatch.away)));
                if (!isFemale) {
                    pigIdx = jornada.pigMatchIndex;
                }
            }
            if (pigIdx === -1) {
                pigIdx = (jornada.matches || []).slice(0, 15).findIndex(m => this.checkIsPIG(m));
            }

            if (pigIdx !== -1) {
                const pigMatch = jornada.matches[pigIdx];
                if (pigMatch && pigMatch.result && pigMatch.result !== '' && pigMatch.result.toLowerCase() !== 'por definir') {
                    const resultSign = this.normalizeSign(pigMatch.result);
                    const prediction = String(currentSelection[pigIdx] || '').trim().toUpperCase();
                    if (resultSign !== prediction) {
                        costs.penalizacionPIG = this.calculateHistoricalPenalty('pig', null, jDate);
                    }
                }
            }
        }

        if (costs.exento) {
            costs.penalizacionUnos = 0;
            costs.penalizacionBajosAciertos = 0;
            costs.penalizacionPIG = 0;
            costs.penalizacionMaula = 0;
        }

        if (jornada.noSellado) {
            costs.sellado = 0;
            return costs;
        }

        let isSealer = false;
        if (jornadaIndex > 0) {
            const prevJornada = jornadas[jornadaIndex - 1];
            if (this.wasLoserOfJornada(memberId, prevJornada, members, jornadas, pronosticos)) {
                isSealer = true;
            }
        } else if (jornada.number === 1) {
            const member = members.find(m => String(m.id) === String(memberId));
            if (member && member.name) {
                const nameLow = member.name.toLowerCase();
                const is2026 = (this.config.temporadaActual || '').includes('2026');
                if (is2026 && nameLow === 'edu') {
                    isSealer = true;
                } else if (!is2026 && nameLow.includes('luismi')) {
                    isSealer = true;
                }
            }
        }

        const sustitutoId = jornada.sustitutoSellado;
        if (sustitutoId) {
            if (String(memberId) === String(sustitutoId)) {
                isSealer = true;
                costs.isSustituto = true;
            } else if (isSealer) {
                isSealer = false;
            }
        }

        if (isSealer) {
            costs.isSealer = true;
            const cCol = this.getHistoricalPrice('costeColumna', jDate);
            const cDob = this.getHistoricalPrice('costeDobles', jDate);

            const extras = pronosticosExtra.filter(p => {
                const pJ = String(p.jId || p.jornadaId || '');
                return pJ === String(jornada.id) || pJ === String(jornada.number);
            });
            // FIX: Always charge exactly 1 double quiniela per jornada to the Peña
            // (prevents duplicate DB entries from multiplying the cost)
            const numExtras = 1;
            const totalCDob = numExtras * cDob;

            costs.sellado = -((numMembers * cCol) + totalCDob);
        }

        let isCurrentLoser = false;
        if (jornadaPlayed) {
            if (this.wasLoserOfJornada(memberId, jornada, members, jornadas, pronosticos)) {
                isCurrentLoser = true;
                costs.isLoser = true;
            }
        }

        if (isCurrentLoser) {
            costs.penalizacionMaula = this.calculateHistoricalPenalty('maula', null, jDate);
        }

        return costs;
    }

    getHistoricalPrice(key, date) {
        if (!date || isNaN(date.getTime())) return this.config[key] || 0;
        if (!this.config.history || !this.config.history[key]) return this.config[key] || 0;
        const settings = this.config.history[key].filter(h => new Date(h.date) <= date).sort((a, b) => new Date(b.date) - new Date(a.date));
        return settings.length > 0 ? settings[0].value : (this.config[key] || 0);
    }

    calculateHistoricalPenalty(type, value, date) {
        const defaultMaulaVal = this.config.penalizacionMaula !== undefined ? parseFloat(this.config.penalizacionMaula) : 1.00;
        if (!date || isNaN(date.getTime())) {
            if (type === 'unos' && value >= 10) return this.calculatePenalizacionUnos(value);
            if (type === 'pig') return this.config.penalizacionPIG || 1.00;
            if (type === 'maula' || type === 'perdedor') return defaultMaulaVal;
            if (type === 'bajos_aciertos') return { 0: 1.0, 1: 0.8, 2: 0.6, 3: 0.4 }[value] || 0;
            return 0;
        }
        const history = this.config.penalties_history || {};
        const settings = history[type] || [];

        let setting = settings.filter(s => new Date(s.date) <= date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        if (!setting) {
            setting = settings.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
            if (!setting) {
                if (type === 'unos' && value >= 10) return this.calculatePenalizacionUnos(value);
                if (type === 'pig') return this.config.penalizacionPIG || 1.00;
                if (type === 'maula' || type === 'perdedor') return defaultMaulaVal;
                if (type === 'bajos_aciertos') {
                    return { 0: 1.0, 1: 0.8, 2: 0.6, 3: 0.4 }[value] || 0;
                }
                return 0;
            }
        }

        if (type === 'unos' || type === 'bajos_aciertos') {
            if (setting.values && setting.values[value] !== undefined) {
                return parseFloat(setting.values[value]);
            }
            return 0;
        }
        if (type === 'pig') {
            return setting.value !== undefined ? parseFloat(setting.value) : 1.00;
        }
        if (type === 'maula' || type === 'perdedor') {
            return setting.value !== undefined ? parseFloat(setting.value) : defaultMaulaVal;
        }
        return 0;
    }

    calculatePenalizacionUnos(numUnos) {
        if (numUnos < 10) return 0;
        const penalties = { 10: 1.10, 11: 1.20, 12: 1.30, 13: 1.50, 14: 2.00 };
        return penalties[numUnos] || 0;
    }

    getPrizesForMemberJornada(memberId, jornada, pronosticos) {
        if (!jornada.prizes || typeof jornada.prizes !== 'object') return 0;

        const mIdStr = String(memberId);
        const pronostico = pronosticos.find(p => {
            const pJ = String(p.jId || p.jornadaId || '');
            const matchJ = (pJ === String(jornada.id) || pJ === String(jornada.number));
            const matchM = (String(p.mId || p.memberId) === mIdStr);
            return matchJ && matchM;
        });

        if (!pronostico) return 0;

        const selection = pronostico.selection || pronostico.forecast;
        const aciertos = this.calculateAciertos(jornada.matches, selection);

        const prizes = jornada.prizes;
        const prizeVal = prizes[aciertos] || prizes[String(aciertos)] || 0;

        return typeof prizeVal === 'number' ? prizeVal : parseFloat(prizeVal || 0);
    }

    getManualIngresosForJornada(memberId, jornada, ingresos) {
        const jId = String(jornada.id);
        const mId = String(memberId);
        return ingresos
            .filter(i => String(i.jornadaId || i.jId) === jId && String(i.memberId || i.mId) === mId)
            .reduce((sum, i) => sum + parseFloat(i.cantidad || i.amount || 0), 0);
    }

    getExtraPrizesForJornada(jornada, pronosticosExtra) {
        if (!jornada.prizes || typeof jornada.prizes !== 'object') return 0;
        if (!pronosticosExtra) return 0;
        if (!window.ScoringSystem) return 0;

        const extras = pronosticosExtra.filter(p => {
            const pJ = String(p.jId || p.jornadaId || '');
            return pJ === String(jornada.id) || pJ === String(jornada.number);
        });

        const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);
        const officialResults = (jornada.matches || []).map(m => m.result);
        const legacyPrizes = jornada.prizes || {};

        let totalExtraPrize = 0;
        extras.forEach(p => {
            const selection = p.selection || p.forecast;
            if (!selection || !Array.isArray(selection)) return;

            const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
            const isReduced = p.isReduced || (doubleCount === 7);

            const ev = window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced });

            if (ev && ev.breakdown) {
                Object.keys(ev.breakdown).forEach(h => {
                    const count = ev.breakdown[h];
                    if (count > 0 && legacyPrizes[h]) {
                        totalExtraPrize += count * parseFloat(legacyPrizes[h] || 0);
                    }
                });
            } else if (ev) {
                const cat = ev.officialHits;
                let actualMinHits = jornada.minHitsToWin || 10;
                if (legacyPrizes && Object.keys(legacyPrizes).length > 0) {
                    actualMinHits = Math.min(...Object.keys(legacyPrizes).map(Number));
                }
                if (cat >= actualMinHits) {
                    totalExtraPrize += parseFloat(legacyPrizes[cat] || 0);
                }
            }
        });

        return totalExtraPrize;
    }

    wasWinnerOfJornada(memberId, prevJornada, members, jornadas, pronosticos) {
        if (!prevJornada.matches || prevJornada.matches.length < 15 || prevJornada.matches.some(m => !m.result || m.result === '' || m.result === 'por definir')) {
            return false;
        }

        const prizeThreshold = prevJornada.minHitsToWin || 10;

        // Build member results for prevJornada
        const memberResults = (members || []).map(m => {
            const mIdStr = String(m.id);
            const p = pronosticos ? pronosticos.find(pr =>
                (String(pr.jId || pr.jornadaId) === String(prevJornada.id) || parseInt(pr.jId || pr.jornadaId) === prevJornada.number) &&
                String(pr.mId || pr.memberId) === mIdStr
            ) : null;

            let hasPronostico = false;
            let isLate = false;
            let isPardoned = false;
            let hits = 0;
            let points = 0;

            if (p) {
                if (window.ScoringSystem && typeof window.ScoringSystem.evaluateMember === 'function') {
                    const ev = window.ScoringSystem.evaluateMember(m, prevJornada, p, { forceFinished: true });
                    if (ev.played) {
                        hasPronostico = true;
                        isLate = ev.isLate;
                        isPardoned = ev.isPardoned;
                        hits = ev.hits;
                        points = ev.points;
                    }
                } else {
                    const sel = p.selection || p.forecast;
                    if (sel && Array.isArray(sel) && sel.some(s => s && String(s).trim() !== '' && String(s) !== '-')) {
                        hasPronostico = true;
                        isLate = p.late || false;
                        isPardoned = p.pardoned || false;
                        hits = this.calculateAciertos(prevJornada.matches, sel);
                        points = this.calculatePoints(hits, p);
                    }
                }
            }

            return {
                memberId: mIdStr,
                hits,
                points,
                isLate,
                isPardoned,
                hasPronostico
            };
        });

        if (memberResults.length === 0) return false;

        // Eligible for winner: must have valid forecast, or if late must be pardoned or hits >= prizeThreshold
        const eligibleForWinner = memberResults.filter(r => {
            if (!r.hasPronostico) return false;
            if (!r.isLate) return true;
            if (r.isPardoned) return true;
            if (r.hits >= prizeThreshold) return true;
            return false;
        });

        if (eligibleForWinner.length === 0) return false;

        const maxPoints = Math.max(...eligibleForWinner.map(r => r.points));
        const winners = eligibleForWinner.filter(r => r.points === maxPoints);

        if (winners.length === 1) {
            return String(winners[0].memberId) === String(memberId);
        }

        const finalWinnerId = this.resolveTie(winners.map(w => w.memberId), prevJornada.number - 1, 'max', jornadas, pronosticos);
        return String(finalWinnerId) === String(memberId);
    }

    wasLoserOfJornada(memberId, prevJornada, members, jornadas, pronosticos) {
        if (!prevJornada.matches || prevJornada.matches.length < 15 || prevJornada.matches.some(m => !m.result || m.result === '' || m.result === 'por definir')) {
            return false;
        }

        const prizeThreshold = prevJornada.minHitsToWin || 10;
        const jDate = window.AppUtils ? window.AppUtils.parseDate(prevJornada.date) : new Date(prevJornada.date);

        // Build results for ALL members
        const memberResults = (members || []).map(m => {
            const mIdStr = String(m.id);
            const p = pronosticos ? pronosticos.find(pr =>
                (String(pr.jId || pr.jornadaId) === String(prevJornada.id) || parseInt(pr.jId || pr.jornadaId) === prevJornada.number) &&
                String(pr.mId || pr.memberId) === mIdStr
            ) : null;

            let hasPronostico = false;
            let isLate = false;
            let isPardoned = false;
            let hits = 0;
            let points = 0;

            if (p) {
                if (window.ScoringSystem && typeof window.ScoringSystem.evaluateMember === 'function') {
                    const ev = window.ScoringSystem.evaluateMember(m, prevJornada, p, { forceFinished: true });
                    if (ev.played) {
                        hasPronostico = true;
                        isLate = ev.isLate;
                        isPardoned = ev.isPardoned;
                        hits = ev.hits;
                        points = ev.points;
                    }
                } else {
                    const sel = p.selection || p.forecast;
                    if (sel && Array.isArray(sel) && sel.some(s => s && String(s).trim() !== '' && String(s) !== '-')) {
                        hasPronostico = true;
                        isLate = p.late || false;
                        isPardoned = p.pardoned || false;
                        hits = this.calculateAciertos(prevJornada.matches, sel);
                        points = this.calculatePoints(hits, p);
                    }
                }
            }

            return {
                memberId: mIdStr,
                hits,
                points,
                isLate,
                isPardoned,
                hasPronostico
            };
        });

        if (memberResults.length === 0) return false;

        // Condition A: Offenders (Missing pronostico or unpardoned late with hits < prizeThreshold)
        const offenders = memberResults.filter(r =>
            !r.hasPronostico || (r.isLate && !r.isPardoned && r.hits < prizeThreshold)
        );

        let maulaCandidates = [];
        if (offenders.length > 0) {
            maulaCandidates = offenders;
        } else {
            // Condition B: Lowest points
            const minPoints = Math.min(...memberResults.map(r => r.points));
            maulaCandidates = memberResults.filter(r => r.points === minPoints);
        }

        if (maulaCandidates.length === 1) {
            return String(maulaCandidates[0].memberId) === String(memberId);
        }

        // Tie-break: Recursive check & deterministic fallback (higher memberId)
        const finalLoserId = this.resolveTie(maulaCandidates.map(c => c.memberId), prevJornada.number - 1, 'min', jornadas, pronosticos);
        return String(finalLoserId) === String(memberId);
    }

    resolveTie(memberIds, jornadaNum, type, jornadas, pronosticos) {
        if (memberIds.length <= 1 || jornadaNum <= 0) {
            if (!memberIds || memberIds.length === 0) return null;
            if (type === 'max') {
                return [...memberIds].sort((a, b) => Number(a) - Number(b))[0];
            } else {
                return [...memberIds].sort((a, b) => Number(b) - Number(a))[0];
            }
        }

        const prevJornada = jornadas.find(j => j.number === jornadaNum);
        if (!prevJornada) return this.resolveTie(memberIds, jornadaNum - 1, type, jornadas, pronosticos);

        const scores = memberIds.map(mId => {
            const pronostico = pronosticos ? pronosticos.find(p => 
                (String(p.jId || p.jornadaId) === String(prevJornada.id) || parseInt(p.jId || p.jornadaId) === prevJornada.number) && 
                String(p.mId || p.memberId) === String(mId)
            ) : null;

            if (!pronostico) return { mId: String(mId), points: -5 };

            const currentSelection = pronostico.selection || pronostico.forecast;
            if (!currentSelection || !Array.isArray(currentSelection)) return { mId: String(mId), points: -5 };

            const aciertos = this.calculateAciertos(prevJornada.matches, currentSelection);
            const jDate = window.AppUtils ? window.AppUtils.parseDate(prevJornada.date) : new Date(prevJornada.date);
            const points = window.ScoringSystem ? window.ScoringSystem.calculateScore(aciertos, jDate) : this.calculatePoints(aciertos, pronostico);
            return { mId: String(mId), points };
        });

        const targetPoints = (type === 'max') ? Math.max(...scores.map(s => s.points)) : Math.min(...scores.map(s => s.points));
        const survivors = scores.filter(s => s.points === targetPoints).map(s => s.mId);

        if (survivors.length === 1) return survivors[0];
        return this.resolveTie(survivors, jornadaNum - 1, type, jornadas, pronosticos);
    }

    calculatePoints(aciertos, pronostico) {
        let points = aciertos;

        if (aciertos <= 3) points -= (4 - aciertos);
        if (pronostico.isLate && !pronostico.pardoned) points -= 2;

        return points;
    }

    calculateAciertos(matches, forecast) {
        if (!matches || !forecast) return 0;
        let aciertos = 0;
        const limit = Math.min(15, matches.length, forecast.length);

        for (let i = 0; i < limit; i++) {
            const match = matches[i];
            const pred = String(forecast[i] || '').trim().toUpperCase();

            if (!match.result || match.result === '' || match.result.toLowerCase() === 'por definir') continue;
            if (i === 14) continue; // El partido 15 no suma aciertos ordinarios

            const rSign = this.normalizeSign(match.result);
            if (pred.includes(rSign)) aciertos++;
        }
        return aciertos;
    }

    checkIsPIG(match) {
        if (!match || !match.home || !match.away) return false;
        // Female teams are never PIG
        const isFemale = (n) => /\(\s*F\s*\)/i.test(String(n)) || /femenino/i.test(String(n)) || /\bfem\b/i.test(String(n));
        if (isFemale(match.home) || isFemale(match.away)) return false;
        const pigTeams = ['real madrid', 'at. madrid', 'barcelona', 'fc barcelona', 'atlético de madrid', 'atlético'];
        const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const h = norm(match.home);
        const a = norm(match.away);
        return pigTeams.some(t => h.includes(norm(t))) && pigTeams.some(t => a.includes(norm(t)));
    }

    normalizeSign(res) {
        if (!res) return '';
        const r = String(res).trim().toUpperCase();
        if (r === '1' || r === 'X' || r === '2') return r;
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
    }
}

window.BoteEngine = BoteEngine;
