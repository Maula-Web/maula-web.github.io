// Polyfill safe window reference for Node.js / Server environments (CI / GitHub Actions)
if (typeof window === 'undefined') {
    global.window = global;
}
if (!window.AppUtils) {
    try {
        require('./utils.js');
    } catch (e) {
        // Fallback minimal helpers if utils.js cannot be loaded
        window.AppUtils = {
            parseDate: (d) => {
                if (!d) return null;
                if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
                const s = String(d).trim();
                const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
                if (dmy) return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
                const iso = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
                if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
                const dt = new Date(s);
                return isNaN(dt.getTime()) ? null : dt;
            },
            getMemberName: (m) => (m ? (m.name || m.phone || `Socio ${m.id || ''}`) : '')
        };
    }
}
if (!window.ScoringSystem) {
    try {
        require('./scoring.js');
    } catch (e) {
        // Scoring is optional or has fallback in BoteEngine
    }
}

class BoteEngine {
    constructor(config = {}) {
        this.config = {
            costeColumna: 0.75,
            costeDobles: 12.00,
            aportacionSemanal: 1.50,
            costeExtraExento: 0.20,
            boteInicial: 738.68,
            penalizacionMaula: 1.00,
            penalizacionPIG: 1.00,
            temporadaActual: '2026-2027',
            ...config
        };
    }

    /**
     * Identifica si un socio es el Tesorero oficial de la Peña Maulas (Marcelo Pérez).
     * Cuenta con régimen especial de regularización mediante los repartos de la temporada.
     */
    static isTesorero(memberOrId) {
        if (!memberOrId) return false;
        if (typeof memberOrId === 'number' || typeof memberOrId === 'string') {
            if (String(memberOrId).trim() === '14') return true;
        }
        if (typeof memberOrId === 'object') {
            if (String(memberOrId.id).trim() === '14') return true;
            const name = (memberOrId.name || '').toLowerCase();
            if (name.includes('marcelo')) return true;
        }
        return false;
    }

    isTesorero(memberOrId) {
        return BoteEngine.isTesorero(memberOrId);
    }

    /**
     * Calcula todos los movimientos financieros de los socios a lo largo de la temporada.
     */
    calculateAllMovements(members, jornadas, pronosticos, pronosticosExtra, repartos, cierresVuelta, ingresos, cashPayments) {
        const movements = [];
        this._winnerCache = new Map();
        this._loserCache = new Map();

        // Index pronosticos for O(1) fast lookup
        this._pMap = new Map();
        if (pronosticos && Array.isArray(pronosticos)) {
            pronosticos.forEach(p => {
                if (!p) return;
                const jIds = [p.jId, p.jornadaId].filter(x => x !== undefined && x !== null).map(String);
                const mIds = [p.mId, p.memberId].filter(x => x !== undefined && x !== null).map(String);
                jIds.forEach(j => {
                    mIds.forEach(m => {
                        this._pMap.set(`${j}_${m}`, p);
                    });
                });
            });
        }

        // Saldos iniciales heredados
        const initialBalances = {
            'Alvaro': 0, 'Carlos': 0, 'David Buzón': 0, 'Edu': 0, 'Emilio': 0,
            'F. Lozano': 0, 'F. Ramirez': 0, 'Heradio': 0, 'JA Valdivieso': 0,
            'Valdi': 0, 'Javi Mora': 0, 'Juan Antonio': 0, 'Juanan': 0, 'Juanjo': 0, 'Luismi': 0,
            'Marcelo': 0, 'Martin': 0, 'Rafa': 0, 'Ramon': 0, 'Raul Romera': 0,
            'Samuel': 0
        };

        // Ordenar jornadas de forma cronológica estricta (por número / fecha)
        const sortedJornadas = [...(jornadas || [])].sort((a, b) => {
            const numA = parseInt(a.number, 10) || 0;
            const numB = parseInt(b.number, 10) || 0;
            if (numA !== numB) return numA - numB;
            const parseD = (d) => (window.AppUtils && window.AppUtils.parseDate ? window.AppUtils.parseDate(d) : new Date(d)) || new Date(0);
            return parseD(a.date) - parseD(b.date);
        });

        // Pre-cálculo de exenciones por jornada
        const jornadaExemptions = sortedJornadas.map((j, idx) => {
            const exemptIds = members.filter(m => {
                if (idx === 0) return false;
                const prev = sortedJornadas[idx - 1];
                const hadPrize = this.getPrizesForMemberJornada(m.id, prev, pronosticos) > 0;
                return hadPrize;
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
                ...sortedJornadas.map(j => ({ type: 'jornada', date: j.date, data: j })),
                ...repartos.map(r => ({ type: 'reparto', date: r.date, data: r })),
                ...cierresVuelta.map(c => ({ type: 'cierre_vuelta', date: c.date, data: c })),
                ...ingresosLibres.map(i => ({ type: 'ingreso_libre', date: i.fecha || i.date, data: i }))
            ].sort((a, b) => {
                const parse = (d) => (window.AppUtils && window.AppUtils.parseDate ? window.AppUtils.parseDate(d) : new Date(d)) || new Date(0);
                const dA = parse(a.date);
                const dB = parse(b.date);
                const diff = dA - dB;
                if (diff !== 0) return diff;
                // Si la fecha coincide, los ingresos libres van antes que los gastos de jornada
                if (a.type === 'ingreso_libre' && b.type !== 'ingreso_libre') return -1;
                if (b.type === 'ingreso_libre' && a.type !== 'ingreso_libre') return 1;
                return 0;
            });

            timeline.forEach(event => {
                if (event.type === 'jornada') {
                    const jornada = event.data;
                    const jornadaIndex = sortedJornadas.findIndex(j => String(j.id) === String(jornada.id));

                    const matchesWithResult = (jornada.matches || []).filter(m => {
                        const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
                        return r !== '' && r !== '-' && r !== 'por definir';
                    });
                    const hasResults = matchesWithResult.length > 0;
                    const isJornadaCompleted = matchesWithResult.length >= 14 || jornada.status === 'completed' || jornada.status === 'closed' || jornada.finalizada === true;

                    // Comprobar si la jornada ya está sellada o con pronósticos enviados por la peña
                    const hasPredictions = pronosticos && pronosticos.some(p =>
                        (String(p.jId || p.jornadaId) === String(jornada.id) || (!jornada.id && parseInt(p.jId || p.jornadaId, 10) === parseInt(jornada.number, 10))) &&
                        p.selection && Array.isArray(p.selection) && p.selection.length > 0
                    );
                    const isJornadaSealed = Boolean(jornada.sellada || jornada.isSealed || jornada.status === 'sealed' || hasPredictions);
                    const isJornadaEligible = hasResults || isJornadaCompleted || isJornadaSealed;
                    if (!isJornadaEligible) return;

                    const infoRedist = jornadaExemptions[jornadaIndex];
                    const pronostico = this._pMap ? (this._pMap.get(`${jornada.id}_${mIdStr}`) || (!jornada.id ? this._pMap.get(`${jornada.number}_${mIdStr}`) : null)) : pronosticos.find(p =>
                        (String(p.jId || p.jornadaId) === String(jornada.id) || (!jornada.id && parseInt(p.jId || p.jornadaId, 10) === parseInt(jornada.number, 10))) &&
                        (String(p.mId || p.memberId) === mIdStr)
                    );

                    const costs = this.calculateJornadaCosts(member.id, members, sortedJornadas, pronosticos, pronosticosExtra, cashPayments, jornada, pronostico, jornadaIndex, infoRedist);
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
                        date: jornada.date,
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
                        isWinner: costs.isWinner || false,
                        isLoser: costs.isLoser || false,
                        isSealer: costs.isSealer || (costs.sellado < 0),
                        pennaIn: costs.aportacion + penalties + prizes + extraPrizes,
                        pennaOut: (isSelladoInCash && costs.sellado < 0) ? Math.abs(costs.sellado) : 0
                    });
                } else if (event.type === 'reparto') {
                    const r = event.data;
                    if (r.type === 'socios') {
                        const splitAmount = r.totalAmount / members.length;
                        const isTesorero = this.isTesorero(member);
                        const hasDebt = boteAcumulado < -0.009;

                        // REGLA OFICIAL DEUDA / TESORERO:
                        // Los socios con saldo deudor tienen derecho a pronóstico semanal pero no participan libremente
                        // de retiros de efectivo del bote hasta regularizar su situación. Su cuota se aplica forzosamente
                        // a amortizar su deuda con la Peña.
                        // Marcelo Pérez (Tesorero) regulariza reglamentariamente su saldo mediante estos repartos oficiales.
                        let choice = (r.memberChoices || {})[member.id] || 'bote';
                        if (hasDebt || isTesorero) {
                            choice = 'bote';
                        }

                        if (choice === 'bote') {
                            boteAcumulado += splitAmount;

                            movements.push({
                                type: 'reparto',
                                memberId: member.id,
                                memberName: (window.AppUtils && window.AppUtils.getMemberName) ? window.AppUtils.getMemberName(member) : (member.name || ''),
                                date: r.date,
                                description: r.description || (isTesorero ? 'Reparto de Beneficios (Regularización Tesorería)' : (hasDebt ? 'Reparto de Beneficios (Amortización Deuda)' : 'Reparto de Beneficios')),
                                neto: splitAmount,
                                boteAcumulado: boteAcumulado,
                                isReparto: true,
                                isRegularizacion: hasDebt || isTesorero
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
                            memberName: (window.AppUtils && window.AppUtils.getMemberName) ? window.AppUtils.getMemberName(member) : (member.name || ''),
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
                        memberName: (window.AppUtils && window.AppUtils.getMemberName) ? window.AppUtils.getMemberName(member) : (member.name || ''),
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

    /**
     * Calcula los saldos consolidados de todos los socios y determina su condición en el Bote:
     * - 'deudor' (rojo): saldo < 0 (conserva derecho a pronóstico semanal pero queda excluido de participar en el bote).
     * - 'tesorero' (amarillo): Marcelo Pérez (regulariza mediante repartos de temporada).
     * - 'activo' (verde): saldo >= 0 (al corriente con pleno derecho de Bote).
     */
    calculateMemberBalances(members, jornadas, pronosticos, pronosticosExtra, repartos, cierresVuelta, ingresos, cashPayments) {
        const movements = this.calculateAllMovements(
            members || [],
            jornadas || [],
            pronosticos || [],
            pronosticosExtra || [],
            repartos || [],
            cierresVuelta || [],
            ingresos || [],
            cashPayments || []
        );

        const balances = new Map();

        (members || []).forEach(m => {
            const mIdStr = String(m.id);
            const mMovements = movements.filter(mov => String(mov.memberId) === mIdStr);
            let finalSaldo = 0;
            if (mMovements.length > 0) {
                finalSaldo = mMovements[mMovements.length - 1].boteAcumulado;
            }

            const isTesorero = this.isTesorero(m);
            const isDeudor = finalSaldo < -0.009;

            balances.set(m.id, {
                memberId: m.id,
                member: m,
                saldo: finalSaldo,
                isTesorero: isTesorero,
                isDeudor: isDeudor && !isTesorero,
                isActivoBote: !isDeudor || isTesorero,
                status: isTesorero ? 'tesorero' : (isDeudor ? 'deudor' : 'activo'),
                color: isTesorero ? 'amber' : (isDeudor ? 'rose' : 'emerald'),
                statusLabel: isTesorero ? 'Tesorero (Regulariza en repartos)' : (isDeudor ? 'Saldo Deudor (No activo en Bote)' : 'Al corriente (Activo en Bote)')
            });
        });

        return balances;
    }

    /**
     * Cálculo oficial centralizado y unificado de la Caja Real y Balance de Temporada
     * Garantiza que la Caja Real del Dashboard y de la ventana del Bote coincidan siempre al céntimo.
     */
    calculateOfficialSummary(members, jornadas, pronosticos, pronosticosExtra, repartos, cierresVuelta, ingresos, cashPayments) {
        const memList = members || [];
        const jorList = jornadas || [];
        const movements = this.calculateAllMovements(
            memList,
            jorList,
            pronosticos || [],
            pronosticosExtra || [],
            repartos || [],
            cierresVuelta || [],
            ingresos || [],
            cashPayments || []
        );

        const memberSummaries = memList.map(m => {
            const mIdStr = String(m.id);
            const mMovements = movements.filter(mov => String(mov.memberId) === mIdStr);
            let totIn = 0;
            let totOut = 0;
            let breakdown = { cuotas: 0, unos: 0, bajos: 0, pig: 0, maula: 0, manuales: 0, premios: 0 };

            mMovements.forEach(mov => {
                if (mov.isIngresoLibre) {
                    totIn += (mov.ingresosManual || 0);
                    breakdown.manuales += (mov.ingresosManual || 0);
                } else {
                    totOut += (mov.totalGastos || 0);
                    breakdown.cuotas += (mov.aportacion || 0);
                    breakdown.unos += (mov.penalizacionUnos || 0);
                    breakdown.bajos += (mov.penalizacionBajosAciertos || 0);
                    breakdown.pig += (mov.penalizacionPIG || 0);
                    breakdown.maula += (mov.penalizacionMaula || 0);

                    const selladoReemb = (!mov.isSelladoInCash && mov.sellado < 0) ? Math.abs(mov.sellado) : 0;
                    totIn += ((mov.premios || 0) + (mov.extraPrizes || 0) + (mov.ingresosManual || 0) + selladoReemb);
                    breakdown.premios += ((mov.premios || 0) + (mov.extraPrizes || 0));
                }
            });

            const lastMov = mMovements.length > 0 ? mMovements[mMovements.length - 1] : null;
            const saldo = lastMov ? lastMov.boteAcumulado : 0;

            return {
                id: m.id,
                name: m.name,
                totIn,
                totOut,
                saldo,
                breakdown
            };
        });

        const sortedJornadas = [...jorList].sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
        const playedJornadas = sortedJornadas.filter(j => {
            return movements.some(m => String(m.jornadaId) === String(j.id) || Number(m.jornadaNum) === Number(j.number));
        });

        const totalGastoSellado = playedJornadas.reduce((acc, j) => {
            const jMovements = movements.filter(m => String(m.jornadaId) === String(j.id) || Number(m.jornadaNum) === Number(j.number));
            const cCol = this.getHistoricalPrice ? this.getHistoricalPrice('costeColumna', j.date) : (this.config.costeColumna || 0.75);
            const cDob = this.getHistoricalPrice ? this.getHistoricalPrice('costeDobles', j.date) : (this.config.costeDobles || 12.00);
            const numSociosJornada = jMovements.length || memList.length || 19;
            const doblesCount = Math.max(1, jMovements.filter(m => m.jugaDobles).length);
            return acc + (j.noSellado ? 0 : ((numSociosJornada * cCol) + (doblesCount * cDob)));
        }, 0);

        const totalGastos = totalGastoSellado > 0 ? totalGastoSellado : 183.75;
        const totalSaldosVirtuales = memberSummaries.reduce((sum, m) => sum + m.saldo, 0);
        const totalPremios = memberSummaries.reduce((sum, m) => sum + (m.breakdown ? (m.breakdown.premios || 0) : 0), 0);
        const totalCuotas = memberSummaries.reduce((sum, m) => sum + (m.breakdown ? (m.breakdown.cuotas || 0) : 0), 0);
        const totalPenalizaciones = memberSummaries.reduce((sum, m) => sum + (m.breakdown ? ((m.breakdown.unos || 0) + (m.breakdown.bajos || 0) + (m.breakdown.pig || 0) + (m.breakdown.maula || 0)) : 0), 0);
        const totalIngresos = memberSummaries.reduce((sum, m) => sum + m.totIn, 0);

        // REGLA OFICIAL DE LA PEÑA:
        // Caja Real = Saldos + Premios + Cuotas + Penalizaciones - Sellados
        const cajaRealOficial = totalSaldosVirtuales + totalPremios + totalCuotas + totalPenalizaciones - totalGastos;
        const superavitOficial = cajaRealOficial - totalSaldosVirtuales;

        return {
            cajaReal: cajaRealOficial,
            totalSaldosVirtuales,
            totalIngresos,
            totalGastos,
            totalPremios,
            totalCuotas,
            totalPenalizaciones,
            superavit: superavitOficial,
            memberSummaries,
            jornadasJugadasCount: playedJornadas.length
        };
    }

    calculateJornadaCosts(memberId, members, jornadas, pronosticos, pronosticosExtra, cashPayments, jornada, pronostico, jornadaIndex, infoRedist = null) {
        const matchesWithResult = (jornada.matches || []).filter(m => {
            const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
            return r !== '' && r !== '-' && r !== 'por definir';
        });
        const hasResults = matchesWithResult.length > 0;
        const isJornadaCompleted = matchesWithResult.length >= 14 || jornada.status === 'completed' || jornada.status === 'closed' || jornada.finalizada === true;
        const hasPredictions = pronosticos && pronosticos.some(p =>
            (String(p.jId || p.jornadaId) === String(jornada.id) || (!jornada.id && parseInt(p.jId || p.jornadaId, 10) === parseInt(jornada.number, 10))) &&
            p.selection && Array.isArray(p.selection) && p.selection.length > 0
        );
        const isJornadaSealed = Boolean(jornada.sellada || jornada.isSealed || jornada.status === 'sealed' || hasPredictions);
        const jornadaPlayed = hasResults || isJornadaCompleted || isJornadaSealed;
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
            isWinner: false,
            isLoser: false,
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
            costs.aciertos = hasResults ? this.calculateAciertos(jornada.matches, currentSelection) : 0;
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

        const matchesExtra = pronosticosExtra ? pronosticosExtra.filter(p =>
            (String(p.jId || p.jornadaId) === String(jornada.id) || String(p.jId || p.jornadaId) === String(jornada.number) || parseInt(p.jId || p.jornadaId) === jornada.number) &&
            p.selection && Array.isArray(p.selection) && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-')
        ) : [];

        if (jornada.number === 1) {
            const member = members.find(m => String(m.id) === String(memberId));
            if (member && member.name) {
                const nameLow = member.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (nameLow.includes('alvaro')) {
                    costs.jugaDobles = true;
                }
            }
        } else if (jornadaIndex > 0) {
            let prevJornada = null;
            for (let pi = jornadaIndex - 1; pi >= 0; pi--) {
                const pj = jornadas[pi];
                if (pj && pj.matches && pj.matches.filter(m => {
                    const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
                    return r !== '' && r !== '-' && r !== 'por definir';
                }).length >= 14) {
                    prevJornada = pj;
                    break;
                }
            }
            if (!prevJornada) prevJornada = jornadas[jornadaIndex - 1];
            const prevWinnerId = this.getWinnerOfJornada(prevJornada, members, jornadas, pronosticos);
            const isPrevWinner = prevWinnerId && String(memberId) === String(prevWinnerId);

            if (parseInt(jornada.number) >= 16) {
                // A partir de la Jornada 16: El ganador único o quien obtuvo premio económico en los dobles de la jornada anterior sella/rellena la quiniela de dobles
                const hadDoublesPrize = this.getDoublesPrizeForMember(memberId, prevJornada, pronosticosExtra) > 0;
                if (isPrevWinner || hadDoublesPrize) {
                    costs.jugaDobles = true;
                }
            } else {
                const hadPrize = this.getPrizesForMemberJornada(memberId, prevJornada, pronosticos) > 0;
                const hasFilledExtra = matchesExtra.some(p => String(p.mId || p.memberId) === String(memberId));

                if (isPrevWinner || hadPrize || hasFilledExtra) {
                    costs.jugaDobles = true;
                }
            }
        }

                // REGLA: Las penalizaciones solo se activan cuando se rellene el primer resultado de un partido (hasResults === true)
        if (hasResults && currentSelection && Array.isArray(currentSelection)) {
            const first14 = currentSelection.slice(0, 14);
            const numUnos = first14.filter(f => f === '1').length;
            costs.penalizacionUnos = this.calculateHistoricalPenalty('unos', numUnos, jDate);

            // Bajos aciertos (<= 3): solo al completarse la jornada (al menos 14 partidos disputados)
            if (isJornadaCompleted && costs.aciertos <= 3) {
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
                const pigRes = pigMatch ? (pigMatch.result !== undefined ? pigMatch.result : pigMatch.r) : null;
                if (pigMatch && pigRes && pigRes !== '' && pigRes !== '-' && String(pigRes).toLowerCase() !== 'por definir') {
                    const resultSign = this.normalizeSign(pigRes);
                    const prediction = String(currentSelection[pigIdx] || '').trim().toUpperCase();
                    if (resultSign !== prediction) {
                        costs.penalizacionPIG = this.calculateHistoricalPenalty('pig', null, jDate);
                    }
                }
            }
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

            // Contar cuántas quinielas de dobles distintas se juegan en esta jornada
            let numExtras = 1;
            if (jornadaIndex > 0) {
                const prevJornada = jornadas[jornadaIndex - 1];
                const prevWinnerId = this.getWinnerOfJornada(prevJornada, members, jornadas, pronosticos);
                const extraMemberIds = new Set(
                    (matchesExtra || []).map(p => String(p.mId || p.memberId || '')).filter(Boolean)
                );
                if (prevWinnerId) extraMemberIds.add(String(prevWinnerId));
                if (parseInt(jornada.number) >= 16) {
                    members.forEach(m => {
                        if (this.getDoublesPrizeForMember(m.id, prevJornada, pronosticosExtra) > 0) {
                            extraMemberIds.add(String(m.id));
                        }
                    });
                } else {
                    members.forEach(m => {
                        if (this.getPrizesForMemberJornada(m.id, prevJornada, pronosticos) > 0) {
                            extraMemberIds.add(String(m.id));
                        }
                    });
                }
                numExtras = Math.max(1, extraMemberIds.size);
            }
            const totalCDob = numExtras * cDob;

            costs.sellado = -((numMembers * cCol) + totalCDob);
        }

                let isCurrentLoser = false;
        // Ganador y Maula solo se liquidan cuando la jornada ha concluido
        if (isJornadaCompleted) {
            if (this.wasWinnerOfJornada(memberId, jornada, members, jornadas, pronosticos)) {
                costs.isWinner = true;
            }
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

    normalizeDateStr(d) {
        if (!d) return '';
        if (typeof d === 'string') {
            const trimmed = d.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
            if (dmy) {
                const day = dmy[1].padStart(2, '0');
                const month = dmy[2].padStart(2, '0');
                const year = dmy[3];
                return `${year}-${month}-${day}`;
            }
        }
        const parseD = (window.AppUtils && window.AppUtils.parseDate) ? window.AppUtils.parseDate(d) : new Date(d);
        if (!parseD || isNaN(parseD.getTime())) return '';
        const y = parseD.getFullYear();
        const m = String(parseD.getMonth() + 1).padStart(2, '0');
        const day = String(parseD.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    getHistoricalPrice(key, date) {
        const targetStr = this.normalizeDateStr(date);
        const fallback = this.config[key] !== undefined ? parseFloat(this.config[key]) : 0;
        if (!targetStr) return fallback;

        if (!this.config.history || !this.config.history[key] || !Array.isArray(this.config.history[key]) || this.config.history[key].length === 0) {
            return fallback;
        }

        const settings = this.config.history[key];
        const valid = settings.filter(h => this.normalizeDateStr(h.date) <= targetStr)
            .sort((a, b) => this.normalizeDateStr(b.date).localeCompare(this.normalizeDateStr(a.date)));

        if (valid.length > 0) return parseFloat(valid[0].value);

        // Si la fecha evaluada es anterior al primer registro de vigencia, tomar el más antiguo (baseline)
        const earliest = [...settings].sort((a, b) => this.normalizeDateStr(a.date).localeCompare(this.normalizeDateStr(b.date)))[0];
        return earliest ? parseFloat(earliest.value) : fallback;
    }

    calculateHistoricalPenalty(type, value, date) {
        const targetStr = this.normalizeDateStr(date);
        const defaultMaulaVal = this.config.penalizacionMaula !== undefined ? parseFloat(this.config.penalizacionMaula) : 1.00;
        const defaultPIGVal = this.config.penalizacionPIG !== undefined ? parseFloat(this.config.penalizacionPIG) : 1.00;

        const fallback = () => {
            if (type === 'unos' && value >= 10) return this.calculatePenalizacionUnos(value);
            if (type === 'pig') return defaultPIGVal;
            if (type === 'maula' || type === 'perdedor') return defaultMaulaVal;
            if (type === 'bajos_aciertos') return { 0: 3.0, 1: 2.0, 2: 1.0, 3: 0.5 }[value] || 0;
            return 0;
        };

        if (!targetStr) return fallback();

        const history = this.config.penalties_history || {};
        const settings = history[type] || [];
        if (!Array.isArray(settings) || settings.length === 0) {
            return fallback();
        }

        let setting = settings.filter(s => this.normalizeDateStr(s.date) <= targetStr)
            .sort((a, b) => this.normalizeDateStr(b.date).localeCompare(this.normalizeDateStr(a.date)))[0];

        if (!setting) {
            setting = [...settings].sort((a, b) => this.normalizeDateStr(a.date).localeCompare(this.normalizeDateStr(b.date)))[0];
            if (!setting) return fallback();
        }

        if (type === 'unos' || type === 'bajos_aciertos') {
            if (setting.values && setting.values[value] !== undefined) {
                return parseFloat(setting.values[value]);
            }
            return fallback();
        }
        if (type === 'pig') {
            return setting.value !== undefined ? parseFloat(setting.value) : defaultPIGVal;
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
        const officialResults = (jornada.matches || []).map(m => (m.result !== undefined ? m.result : (m.r || '')));
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

    getDoublesPrizeForMember(memberId, jornada, pronosticosExtra) {
        if (!jornada || !jornada.matches || jornada.matches.length < 14) return 0;
        const filledMatches = (jornada.matches || []).filter(m => {
            const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
            return r !== '' && r !== '-' && r !== 'por definir';
        });
        if (filledMatches.length < 14) return 0;

        const mIdStr = String(memberId);
        const extras = (pronosticosExtra || []).filter(p =>
            String(p.jId !== undefined && p.jId !== null ? p.jId : p.jornadaId) === String(jornada.id) &&
            String(p.mId !== undefined && p.mId !== null ? p.mId : p.memberId) === mIdStr
        );
        if (extras.length === 0) return 0;

        const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);
        const officialResults = (jornada.matches || []).map(m => (m.result !== undefined ? m.result : (m.r || '')));
        const legacyPrizes = (jornada.prizes && typeof jornada.prizes === 'object' && Object.keys(jornada.prizes).length > 0)
            ? jornada.prizes
            : (jornada.prizeRates || {});

        let memberExtraPrize = 0;
        extras.forEach(p => {
            const selection = p.selection || p.forecast;
            if (!selection || !Array.isArray(selection)) return;

            const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
            const isReduced = p.isReduced || (doubleCount === 7);

            const ev = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced }) : null;

            if (ev && ev.breakdown) {
                Object.keys(ev.breakdown).forEach(h => {
                    const count = ev.breakdown[h];
                    if (count > 0 && legacyPrizes[h]) {
                        memberExtraPrize += count * parseFloat(legacyPrizes[h] || 0);
                    }
                });
            } else if (ev) {
                const cat = ev.officialHits;
                let actualMinHits = jornada.minHitsToWin || 10;
                if (legacyPrizes && Object.keys(legacyPrizes).length > 0) {
                    actualMinHits = Math.min(...Object.keys(legacyPrizes).map(Number));
                }
                if (cat >= actualMinHits) {
                    memberExtraPrize += parseFloat(legacyPrizes[cat] || 0);
                }
            }
        });

        return memberExtraPrize;
    }

    static getDoublesPrizeForMember(memberId, jornada, pronosticosExtra) {
        return BoteEngine.prototype.getDoublesPrizeForMember.call({}, memberId, jornada, pronosticosExtra);
    }

    getWinnerOfJornada(prevJornada, members, jornadas, pronosticos) {
        if (!prevJornada || !prevJornada.matches || prevJornada.matches.length < 14) {
            return null;
        }
        const filledMatches = (prevJornada.matches || []).filter(m => {
            const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
            return r !== '' && r !== '-' && r !== 'por definir';
        });
        if (filledMatches.length < 14) {
            return null;
        }
        const cacheKey = String(prevJornada.id || prevJornada.number);
        if (this._winnerCache && this._winnerCache.has(cacheKey)) {
            return this._winnerCache.get(cacheKey);
        }

        const prizeThreshold = prevJornada.minHitsToWin || 10;

        // Build member results for prevJornada
        const memberResults = (members || []).map(m => {
            const mIdStr = String(m.id);
            const p = pronosticos ? (this._pMap ? (this._pMap.get(`${prevJornada.id}_${mIdStr}`) || (!prevJornada.id ? this._pMap.get(`${prevJornada.number}_${mIdStr}`) : null)) : pronosticos.find(pr =>
                String(pr.jId || pr.jornadaId) === String(prevJornada.id) &&
                String(pr.mId || pr.memberId) === mIdStr
            )) : null;

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

        if (memberResults.length === 0) return null;

        // Eligible for winner: must have valid forecast, or if late must be pardoned or hits >= prizeThreshold
        const eligibleForWinner = memberResults.filter(r => {
            if (!r.hasPronostico) return false;
            if (!r.isLate) return true;
            if (r.isPardoned) return true;
            if (r.hits >= prizeThreshold) return true;
            return false;
        });

        if (eligibleForWinner.length === 0) return null;

        const maxPoints = Math.max(...eligibleForWinner.map(r => r.points));
        const winners = eligibleForWinner.filter(r => r.points === maxPoints);

        let finalWinnerId = null;
        if (winners.length === 1) {
            finalWinnerId = String(winners[0].memberId);
        } else {
            finalWinnerId = String(this.resolveTie(winners.map(w => w.memberId), prevJornada.number - 1, 'max', jornadas, pronosticos));
        }

        if (this._winnerCache) this._winnerCache.set(cacheKey, finalWinnerId);
        return finalWinnerId;
    }

    wasWinnerOfJornada(memberId, prevJornada, members, jornadas, pronosticos) {
        const winnerId = this.getWinnerOfJornada(prevJornada, members, jornadas, pronosticos);
        return winnerId !== null && String(winnerId) === String(memberId);
    }

    getLoserOfJornada(prevJornada, members, jornadas, pronosticos) {
        if (!prevJornada || !prevJornada.matches || prevJornada.matches.length < 14) {
            return null;
        }
        const filledMatches = (prevJornada.matches || []).filter(m => {
            const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
            return r !== '' && r !== '-' && r !== 'por definir';
        });
        if (filledMatches.length < 14) {
            return null;
        }
        const cacheKey = String(prevJornada.id || prevJornada.number);
        if (this._loserCache && this._loserCache.has(cacheKey)) {
            return this._loserCache.get(cacheKey);
        }

        const prizeThreshold = prevJornada.minHitsToWin || 10;
        const jDate = window.AppUtils ? window.AppUtils.parseDate(prevJornada.date) : new Date(prevJornada.date);

        // Build results for ALL members
        const memberResults = (members || []).map(m => {
            const mIdStr = String(m.id);
            const p = pronosticos ? (this._pMap ? (this._pMap.get(`${prevJornada.id}_${mIdStr}`) || (!prevJornada.id ? this._pMap.get(`${prevJornada.number}_${mIdStr}`) : null)) : pronosticos.find(pr =>
                String(pr.jId || pr.jornadaId) === String(prevJornada.id) &&
                String(pr.mId || pr.memberId) === mIdStr
            )) : null;

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

        if (memberResults.length === 0) return null;

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

        let finalLoserId = null;
        if (maulaCandidates.length === 1) {
            finalLoserId = String(maulaCandidates[0].memberId);
        } else {
            finalLoserId = String(this.resolveTie(maulaCandidates.map(c => c.memberId), prevJornada.number - 1, 'min', jornadas, pronosticos));
        }

        if (this._loserCache) this._loserCache.set(cacheKey, finalLoserId);
        return finalLoserId;
    }

    wasLoserOfJornada(memberId, prevJornada, members, jornadas, pronosticos) {
        const loserId = this.getLoserOfJornada(prevJornada, members, jornadas, pronosticos);
        return loserId !== null && String(loserId) === String(memberId);
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
            const mIdStr = String(mId);
            const pronostico = pronosticos ? (this._pMap ? (this._pMap.get(`${prevJornada.id}_${mIdStr}`) || (!prevJornada.id ? this._pMap.get(`${prevJornada.number}_${mIdStr}`) : null)) : pronosticos.find(p => 
                String(p.jId || p.jornadaId) === String(prevJornada.id) && 
                String(p.mId || p.memberId) === mIdStr
            )) : null;

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

            const res = match.result !== undefined ? match.result : match.r;
            if (!res || res === '' || res === '-' || String(res).toLowerCase() === 'por definir') continue;
            if (i === 14) continue; // El partido 15 no suma aciertos ordinarios

            const rSign = this.normalizeSign(res);
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

if (typeof window !== 'undefined') {
    window.BoteEngine = BoteEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BoteEngine;
}
