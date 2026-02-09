/**
 * BOTE MANAGER - Sistema de Gestión de Cuentas de la Peña
 * 
 * Este módulo gestiona:
 * - Cálculo automático de gastos por jornada (columnas + dobles + penalizaciones)
 * - Registro de ingresos (premios, bizum, transferencias)
 * - Control de bote individual por socio
 * - Gestión de sellados y reembolsos
 * - Histórico por temporadas
 */

class BoteManager {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];
        this.boteData = [];
        this.ingresos = [];
        this.config = {
            costeColumna: 0.75,
            costeDobles: 12.00,
            aportacionSemanal: 1.50,
            boteInicial: 0.00,
            temporadaActual: '2025-2026'
        };
        this.cashPayments = []; // New - Tracks sellados paid in cash
        this.repartos = []; // New - Tracks profit distributions
        this.checkIsPIG = (m) => {
            if (!m) return false;
            const h = (m.home || '').toLowerCase();
            const a = (m.away || '').toLowerCase();
            const isMadrid = (t) => t.includes('madrid') && !t.includes('atlet') && !t.includes('at.');
            const isBarca = (t) => t.includes('barcelona') || t.includes('barça') || t.includes('barca') || t.includes('fcb');
            const isAtleti = (t) => t.includes('atleti') || t.includes('atlétic') || t.includes('atletico') || t.includes('at. madrid') || t.includes('atm');
            const hM = isMadrid(h), aM = isMadrid(a);
            const hB = isBarca(h), aB = isBarca(a);
            const hA = isAtleti(h), aA = isAtleti(a);
            return (hM && (aB || aA)) || (hB && (aM || aA)) || (hA && (aM || aB));
        };
        this.currentVista = 'general';
        this.currentJornadaIndex = -1; // Will be set to most recent jornada with results
        this.init();
    }

    async init() {
        try {
            if (!window.DataService.db) await window.DataService.init();

            // Load data
            await this.loadData();
            await this.loadConfig();

            // Populate dropdowns
            this.populateSociosDropdown();

            // Set default date to today
            document.getElementById('ingreso-fecha').valueAsDate = new Date();

            // Bind events
            document.getElementById('vista-select').addEventListener('change', (e) => {
                this.currentVista = e.target.value;
                this.currentJornadaIndex = -1; // Trigger recalculation of most recent jornada
                this.render();
            });

            document.getElementById('form-reparto').addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveReparto();
            });

            // Initial render
            this.render();

            // Run maintenance migrations (prizes request)
            await this.runMaintenanceMigrations();

        } catch (error) {
            console.error('Error initializing BoteManager:', error);
            alert('Error al cargar los datos del bote');
        }
    }

    async loadData() {
        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');

        // Ordenar socios por Número de Socio (ID)
        this.members.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        // Sort jornadas by number
        this.jornadas.sort((a, b) => a.number - b.number);

        // Load bote movements
        const boteCollection = await window.DataService.getAll('bote');
        this.boteData = boteCollection || [];

        // Load ingresos
        const ingresosCollection = await window.DataService.getAll('ingresos');
        this.ingresos = ingresosCollection || [];

        // Load cash payments
        const cashCollection = await window.DataService.getAll('reembolsos_efectivo');
        this.cashPayments = cashCollection || [];

        // Load extra forecasts (Doubles Column)
        this.pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || [];

        // Load repartos
        this.repartos = await window.DataService.getAll('repartos') || [];
    }

    async loadConfig() {
        const configDocs = await window.DataService.getAll('config');
        const boteConfig = configDocs.find(c => c.id === 'bote_config');

        if (boteConfig) {
            this.config = { ...this.config, ...boteConfig };
        }
    }

    async saveConfig() {
        await window.DataService.save('config', {
            id: 'bote_config',
            ...this.config
        });
    }

    populateSociosDropdown() {
        const select = document.getElementById('ingreso-socio');
        select.innerHTML = '<option value="">Seleccionar socio...</option>';

        this.members
            .sort((a, b) => parseInt(a.id) - parseInt(b.id))
            .forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.name;
                select.appendChild(option);
            });
    }

    /**
     * Calculate all movements for all members across all jornadas
     */
    calculateAllMovements() {
        const movements = [];

        const initialBalances = {
            'Alvaro': 15, 'Carlos': 8.5, 'David Buzón': 56.29, 'Edu': 2, 'Emilio': 41.13,
            'F. Lozano': 2, 'F. Ramirez': 42.91, 'Heradio': 10.22, 'JA Valdivieso': 2.30,
            'Valdi': 2.30, 'Javi Mora': 57.88, 'Juan Antonio': 17.9, 'Juanjo': -6.1, 'Luismi': 24.75,
            'Marcelo': 0, 'Martin': 15.1, 'Rafa': 4.45, 'Ramon': 2, 'Raul Romera': 8.95,
            'Samuel': 1.5
        };

        // Pre-calculate exemptions per jornada
        const jornadaExemptions = this.jornadas.map((j, idx) => {
            const exemptIds = this.members.filter(m => {
                if (idx === 0) return false;
                const prev = this.jornadas[idx - 1];
                return this.getPrizesForMemberJornada(m.id, prev) > 0;
            }).map(m => m.id);
            return {
                id: j.id,
                exemptIds: exemptIds,
                payingCount: this.members.length - exemptIds.length
            };
        });

        this.members.forEach((member, memberIndex) => {
            const mName = (member.name || '').trim();
            let boteAcumulado = 0;
            if (mName) {
                const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const entry = Object.entries(initialBalances).find(([k, v]) => norm(k) === norm(mName) || norm(mName).includes(norm(k)) || norm(k).includes(norm(mName)));
                if (entry) boteAcumulado = entry[1];
            }

            const mIdStr = member.id ? String(member.id) : '';

            // Combinar jornadas y repartos en una línea de tiempo
            const timeline = [
                ...this.jornadas.map(j => ({ type: 'jornada', date: j.date, data: j })),
                ...this.repartos.map(r => ({ type: 'reparto', date: r.date, data: r }))
            ].sort((a, b) => {
                const dA = window.AppUtils.parseDate(a.date) || new Date(0);
                const dB = window.AppUtils.parseDate(b.date) || new Date(0);
                return dA - dB;
            });

            timeline.forEach(event => {
                if (event.type === 'jornada') {
                    const jornada = event.data;
                    const jornadaIndex = this.jornadas.findIndex(j => j.id === jornada.id);

                    const matchesWithResult = (jornada.matches || []).filter(m => {
                        const r = String(m.result || '').trim().toLowerCase();
                        return r !== '' && r !== 'por definir';
                    });
                    if (matchesWithResult.length === 0) return;

                    const infoRedist = jornadaExemptions[jornadaIndex];
                    const pronostico = this.pronosticos.find(p =>
                        (p.jId === jornada.id || p.jornadaId === jornada.id) &&
                        (String(p.mId || p.memberId) === mIdStr)
                    );

                    const costs = this.calculateJornadaCosts(member.id, jornada, pronostico, jornadaIndex, infoRedist);
                    const prizes = this.getPrizesForMemberJornada(member.id, jornada);
                    const manualIngresos = this.getManualIngresosForJornada(member.id, jornada);
                    const penalties = costs.penalizacionUnos + (costs.penalizacionBajosAciertos || 0) + (costs.penalizacionPIG || 0);

                    const isSelladoInCash = this.cashPayments.some(cp => String(cp.memberId) === mIdStr && String(cp.jornadaId) === String(jornada.id));

                    // NEW LOGIC: Prizes do NOT go to the individual member's bote
                    const selladoForNeto = isSelladoInCash ? 0 : costs.sellado;
                    const netoForSocio = manualIngresos - (costs.aportacion + penalties) - selladoForNeto;
                    boteAcumulado += netoForSocio;

                    // Extra prizes (Doubles Column) are counted once per jornada in the Peña's summary
                    let extraPrizes = 0;
                    if (memberIndex === 0) {
                        extraPrizes = this.getExtraPrizesForJornada(jornada);
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
                        sellado: costs.sellado,
                        premios: prizes,
                        extraPrizes: extraPrizes,
                        ingresosManual: manualIngresos,
                        aciertos: costs.aciertos,
                        totalIngresos: (manualIngresos + prizes), // Shown in table for info
                        totalGastos: (costs.aportacion + penalties),
                        neto: netoForSocio, // Now excludes prizes
                        boteAcumulado: boteAcumulado,
                        exento: costs.exento,
                        jugaDobles: costs.jugaDobles,
                        isSelladoInCash: isSelladoInCash,
                        // Peña fund: Member contributions + Penalties + Member prizes + Doubles prizes
                        pennaIn: costs.aportacion + penalties + prizes + extraPrizes,
                        pennaOut: (isSelladoInCash && costs.sellado < 0) ? Math.abs(costs.sellado) : 0
                    });
                } else if (event.type === 'reparto') {
                    const r = event.data;
                    if (r.type === 'socios') {
                        const choice = (r.memberChoices || {})[member.id] || 'bote';
                        if (choice === 'bote') {
                            const splitAmount = r.totalAmount / this.members.length;
                            boteAcumulado += splitAmount;

                            // We record this internally to update the member's historical line
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
                }
            });
        });
        return movements;
    }

    /**
     * Calculate costs for a specific member in a specific jornada
     */
    calculateJornadaCosts(memberId, jornada, pronostico, jornadaIndex, infoRedist = null) {
        // A jornada is considered "played" if at least one match has a result
        const matchesWithResult = (jornada.matches || []).filter(m => {
            const r = String(m.result || '').trim().toLowerCase();
            return r !== '' && r !== 'por definir';
        });
        const jornadaPlayed = matchesWithResult.length > 0;

        const jDate = window.AppUtils.parseDate(jornada.date);
        const numMembers = this.members.length;

        const costs = {
            aportacion: 0,
            columna: 0,
            dobles: 0,
            penalizacionUnos: 0,
            penalizacionBajosAciertos: 0,
            penalizacionPIG: 0,
            sellado: 0,
            aciertos: 0,
            exento: false,
            jugaDobles: false
        };

        if (!pronostico) {
            costs.columna = jornadaPlayed ? this.getHistoricalPrice('costeColumna', jDate) : 0;
            return costs;
        }

        // Calculate hits
        const currentSelection = pronostico.selection || pronostico.forecast;
        if (jornada.matches && currentSelection) {
            costs.aciertos = this.calculateAciertos(jornada.matches, currentSelection);
        }

        // Check exemption
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            const hadPrize = this.getPrizesForMemberJornada(memberId, prevJornada) > 0;
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
            // LÓGICA DE REDISTRIBUCIÓN:
            // Cuando un socio queda exento, el club deja de recibir sus 1.50€.
            // Para mantener la caja equilibrada, ese coste se reparte entre los socios que SÍ pagan.
            if (infoRedist && infoRedist.payingCount > 0 && infoRedist.payingCount < numMembers) {
                const numExempt = numMembers - infoRedist.payingCount;
                const totalExtraCost = numExempt * baseAportacion;
                costs.aportacion = baseAportacion + (totalExtraCost / infoRedist.payingCount);
                costs.columna = baseColumna + (totalExtraCost / infoRedist.payingCount);
            } else if (infoRedist && infoRedist.payingCount === 0) {
                costs.aportacion = 0;
                costs.columna = 0;
            } else {
                costs.aportacion = baseAportacion;
                costs.columna = baseColumna;
            }
        }

        // Plays doubles if won previous jornada
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            if (this.wasWinnerOfJornada(memberId, prevJornada)) {
                costs.jugaDobles = true;
            }
        }

        // Do not calculate penalties if exempt
        if (costs.exento) return costs;

        // Penalties
        if (jornadaPlayed && currentSelection && Array.isArray(currentSelection)) {
            // 1. Unos
            const first14 = currentSelection.slice(0, 14);
            const numUnos = first14.filter(f => f === '1').length;
            costs.penalizacionUnos = this.calculateHistoricalPenalty('unos', numUnos, jDate);

            // 2. Low Hits (0-3)
            if (costs.aciertos <= 3) {
                costs.penalizacionBajosAciertos = this.calculateHistoricalPenalty('bajos_aciertos', costs.aciertos, jDate);
            }

            // 3. PIG Detection
            let pigIdx = -1;
            if (jornada.pigMatchIndex !== undefined) {
                pigIdx = jornada.pigMatchIndex;
            } else {
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

        // Apply total exemption if applicable
        if (costs.exento) {
            costs.penalizacionUnos = 0;
            costs.penalizacionBajosAciertos = 0;
            costs.penalizacionPIG = 0;
        }

        // Sellado Reimbursement
        let isMaula = false;
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            isMaula = this.wasLoserOfJornada(memberId, prevJornada);
        } else if (jornada.number === 1) {
            // Manual override for J1: Luismi sealed it (J0 maula)
            const member = this.members.find(m => String(m.id) === String(memberId));
            if (member && member.name && member.name.toLowerCase().includes('luismi')) {
                isMaula = true;
            }
        }

        if (isMaula) {
            const numSocios = this.members.length;
            const cCol = this.getHistoricalPrice('costeColumna', jDate);
            const cDob = this.getHistoricalPrice('costeDobles', jDate);
            costs.sellado = -((numSocios * cCol) + cDob);
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
        if (!date || isNaN(date.getTime())) {
            // Fallback for null dates
            if (type === 'unos' && value >= 10) return this.calculatePenalizacionUnos(value);
            if (type === 'pig') return this.config.penalizacionPIG || 1.00;
            if (type === 'bajos_aciertos') return { 0: 1.0, 1: 0.8, 2: 0.6, 3: 0.4 }[value] || 0;
            return 0;
        }
        const history = this.config.penalties_history || {};
        const settings = history[type] || [];

        if (date.getFullYear() === 2025 && date.getMonth() === 7) {
            const hasExactDate = settings.some(s => new Date(s.date).toDateString() === date.toDateString());
            if (!hasExactDate) return 0;
        }

        let setting = settings.filter(s => new Date(s.date) <= date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        // If no past setting, fallback to earliest or current setup to ensure penalties SUM UP
        if (!setting) {
            setting = settings.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
            if (!setting) {
                // Return default values from current config if history is empty
                if (type === 'unos' && value >= 10) return this.calculatePenalizacionUnos(value);
                if (type === 'pig') return this.config.penalizacionPIG || 1.00;
                if (type === 'bajos_aciertos') {
                    // This is tricky as it's an object in config
                    const pens = { 0: 1.0, 1: 0.8, 2: 0.6, 3: 0.4 };
                    return pens[value] || 0;
                }
                return 0;
            }
        }

        if (type === 'unos' || type === 'bajos_aciertos') {
            return (setting.values && setting.values[value] !== undefined) ? setting.values[value] : 0;
        }
        if (type === 'pig') {
            return setting.value !== undefined ? setting.value : 1.00;
        }
        return 0;
    }

    /**
     * Calculate penalty for number of 1s
     */
    calculatePenalizacionUnos(numUnos) {
        if (numUnos < 10) return 0;

        const history = this.config.penalties_history || {};
        const date = new Date(); // Current date for live calc if no jornada date provided? 
        // Note: This is a fallback helper. Ideally we use calculateHistoricalPenalty.

        const penalties = {
            10: 1.10,
            11: 1.20,
            12: 1.30,
            13: 1.50,
            14: 2.00,
            15: 3.00
        };

        return penalties[numUnos] || 0;
    }

    /**
     * Helper to convert scores (2-1, M-1, 1-1) to signs (1, X, 2)
     */
    normalizeSign(res) {
        if (!res) return '';
        const r = String(res).trim().toUpperCase();
        if (r === '1' || r === 'X' || r === '2') return r;

        // Multi-goal results (P-15 style or score strings)
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

    /**
     * Calculate number of hits (aciertos)
     */
    calculateAciertos(matches, forecast) {
        if (!matches || !forecast || matches.length > forecast.length) return 0;

        let aciertos = 0;
        matches.slice(0, 15).forEach((match, idx) => {
            if (!match.result || match.result === '' || match.result.toLowerCase() === 'por definir') return;

            const resultSign = this.normalizeSign(match.result);
            const prediction = String(forecast[idx] || '').trim().toUpperCase();

            // P15 usually only counts if 14 hits exist, but for 'hits' count we count it if matches result
            if (resultSign === prediction) {
                aciertos++;
            }
        });

        return aciertos;
    }

    /**
     * Check if member was winner of a jornada
     */
    wasWinnerOfJornada(memberId, jornada) {
        if (!jornada.matches || jornada.matches.length < 15 || jornada.matches.some(m => !m.result || m.result === '' || m.result === 'por definir')) {
            return false;
        }

        const jornadaPronosticos = this.pronosticos.filter(p =>
        (String(p.jId || p.jornadaId) === String(jornada.id) ||
            parseInt(p.jId || p.jornadaId) === jornada.number)
        );
        if (jornadaPronosticos.length === 0) return false;

        const scores = jornadaPronosticos.map(p => {
            const currentSelection = p.selection || p.forecast;
            const aciertos = this.calculateAciertos(jornada.matches, currentSelection);
            const points = this.calculatePoints(aciertos, p);
            return { memberId: String(p.memberId || p.mId), points: points };
        });

        const maxPoints = Math.max(...scores.map(s => s.points));
        const winners = scores.filter(s => s.points === maxPoints);

        if (winners.length === 1) return String(winners[0].memberId) === String(memberId);

        // Recursive Tie-breaker
        const finalWinnerId = this.resolveTie(winners.map(w => w.memberId), jornada.number - 1, 'max');
        return String(finalWinnerId) === String(memberId);
    }

    /**
     * Check if member was loser of a jornada
     */
    wasLoserOfJornada(memberId, jornada) {
        if (!jornada.matches || jornada.matches.length < 15 || jornada.matches.some(m => !m.result || m.result === '' || m.result === 'por definir')) {
            return false;
        }

        const jornadaPronosticos = this.pronosticos.filter(p => (p.jId === jornada.id || p.jornadaId === jornada.id));
        if (jornadaPronosticos.length === 0) return false;

        const scores = jornadaPronosticos.map(p => {
            const currentSelection = p.selection || p.forecast;
            const aciertos = this.calculateAciertos(jornada.matches, currentSelection);
            const points = this.calculatePoints(aciertos, p);
            return { memberId: p.memberId || p.mId, points: points };
        });

        const minPoints = Math.min(...scores.map(s => s.points));
        const losers = scores.filter(s => s.points === minPoints);

        if (losers.length === 1) return losers[0].memberId === memberId;

        // Recursive Tie-breaker (The loser is the one with FEWER points in previous jornadas)
        const finalLoserId = this.resolveTie(losers.map(l => l.memberId), jornada.number - 1, 'min');
        return finalLoserId === memberId;
    }

    resolveTie(memberIds, jornadaNum, type) {
        if (memberIds.length <= 1 || jornadaNum <= 0) return memberIds[0];

        const prevJornada = this.jornadas.find(j => j.number === jornadaNum);
        if (!prevJornada) return this.resolveTie(memberIds, jornadaNum - 1, type);

        const scores = memberIds.map(mId => {
            const pronostico = this.pronosticos.find(p => (p.jId === prevJornada.id || p.jornadaId === prevJornada.id) && (p.mId === mId || p.memberId === mId));
            if (!pronostico) return { mId, points: 0 };
            const currentSelection = pronostico.selection || pronostico.forecast;
            const aciertos = this.calculateAciertos(prevJornada.matches, currentSelection);
            const points = this.calculatePoints(aciertos, pronostico);
            return { mId, points };
        });

        const targetPoints = (type === 'max') ? Math.max(...scores.map(s => s.points)) : Math.min(...scores.map(s => s.points));
        const survivors = scores.filter(s => s.points === targetPoints).map(s => s.mId);

        if (survivors.length === 1) return survivors[0];
        // If still tied, go back further
        return this.resolveTie(survivors, jornadaNum - 1, type);
    }

    /**
     * Calculate points based on aciertos and penalties
     * (Simplified version - should match scoring.js logic)
     */
    calculatePoints(aciertos, pronostico) {
        let points = aciertos;
        const selection = pronostico.selection || pronostico.forecast;

        // Apply penalties for low hits
        if (aciertos <= 3) {
            points -= (4 - aciertos);
        }

        // Apply penalties for late submission
        if (pronostico.isLate && !pronostico.pardoned) {
            points -= 2;
        }

        // Apply penalty for too many 1s
        if (selection && Array.isArray(selection)) {
            const numUnos = selection.slice(0, 14).filter(f => f === '1').length;
            if (numUnos >= 10) {
                points -= 1;
            }
        }

        return points;
    }

    /**
     * Get prizes for a member in a jornada
     */
    getPrizesForMemberJornada(memberId, jornada) {
        if (!jornada.prizes || typeof jornada.prizes !== 'object') return 0;

        const mIdStr = String(memberId);
        const pronostico = this.pronosticos.find(p => {
            const pJ = String(p.jId || p.jornadaId);
            const matchJ = (pJ === String(jornada.id) || parseInt(pJ) === jornada.number);
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

    /**
     * Get prizes for the extra column (Doubles) in a jornada
     */
    getExtraPrizesForJornada(jornada) {
        if (!jornada.prizes || typeof jornada.prizes !== 'object') return 0;
        if (!this.pronosticosExtra) return 0;

        const extras = this.pronosticosExtra.filter(p => {
            const pJ = String(p.jId || p.jornadaId);
            return pJ === String(jornada.id) || parseInt(pJ) === jornada.number;
        });

        let totalExtraPrize = 0;
        extras.forEach(p => {
            const selection = p.selection || p.forecast;
            const aciertos = this.calculateAciertos(jornada.matches, selection);
            const prizes = jornada.prizes;
            const prizeVal = prizes[aciertos] || prizes[String(aciertos)] || 0;
            totalExtraPrize += typeof prizeVal === 'number' ? prizeVal : parseFloat(prizeVal || 0);
        });

        return totalExtraPrize;
    }

    /**
     * Get manual ingresos for a member in a jornada
     */
    getManualIngresosForJornada(memberId, jornada) {
        const jornadaDate = this.parseDate(jornada.date);
        if (!jornadaDate) return 0;

        // Get ingresos for this member around this jornada date
        const relevantIngresos = this.ingresos.filter(ing => {
            if (String(ing.memberId) !== String(memberId)) return false;

            const ingresoDate = new Date(ing.fecha);
            // Consider ingresos within 7 days of jornada
            const diffDays = Math.abs((ingresoDate - jornadaDate) / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        });

        return relevantIngresos.reduce((sum, ing) => sum + parseFloat(ing.cantidad), 0);
    }

    parseDate(dateStr) {
        if (!dateStr || dateStr.toLowerCase() === 'por definir') return null;

        // Try DD/MM/YYYY or DD-MM-YYYY
        if (dateStr.match(/\d+[\/-]\d+[\/-]\d+/)) {
            const parts = dateStr.split(/[\/-]/);
            if (parts.length === 3) {
                return new Date(parts[2], parts[1] - 1, parts[0]);
            }
        }

        // Try text format
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        let clean = dateStr.toLowerCase().replace(/\s+/g, ' ');
        const mIdx = months.findIndex(m => clean.includes(m));
        const day = parseInt(clean.match(/\d+/));
        const year = parseInt(clean.match(/\d{4}/)) || new Date().getFullYear();

        if (!isNaN(day) && mIdx !== -1) {
            return new Date(year, mIdx, day);
        }

        return null;
    }

    /**
     * Render the current view
     */
    render() {
        const movements = this.calculateAllMovements();

        // Update summary
        this.updateSummary(movements);

        // Render based on current vista
        switch (this.currentVista) {
            case 'general':
                this.renderVistaGeneral(movements);
                break;
            case 'detalle':
                this.renderVistaDetalle(movements);
                break;
            case 'cuadrante':
                this.renderVistaCuadrante(movements);
                break;
            case 'repartos':
                this.renderVistaRepartos(movements);
                break;
        }
    }

    /**
     * Update summary cards
     */
    updateSummary(movements) {
        // SUMMARY FOR THE PEÑA
        const totalIngresos = movements.reduce((sum, m) => sum + (m.pennaIn || 0), 0);
        const totalGastos = movements.reduce((sum, m) => sum + (m.pennaOut || 0), 0);
        const totalRepartos = (this.repartos || []).reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const boteTotal = totalIngresos - totalGastos - totalRepartos + this.config.boteInicial;

        // Calculate total prizes for the new card
        const totalPremios = movements.reduce((sum, m) => sum + (m.premios || 0) + (m.extraPrizes || 0), 0);

        // Get processed jornadas (those with results)
        const playedJornadas = this.jornadas.filter(j =>
            j.matches && j.matches.some(match => match.result && match.result !== '' && match.result.toLowerCase() !== 'por definir')
        ).sort((a, b) => a.number - b.number);

        const uniqueJornadasCount = playedJornadas.length;

        document.getElementById('total-bote').textContent = boteTotal.toFixed(2) + ' €';
        document.getElementById('total-ingresos').textContent = totalIngresos.toFixed(2) + ' €';
        document.getElementById('total-gastos').textContent = totalGastos.toFixed(2) + ' €';
        document.getElementById('total-premios').textContent = totalPremios.toFixed(2) + ' €';
        document.getElementById('jornadas-count').textContent = uniqueJornadasCount;

        // Update header subtitle with date range
        const headerSub = document.querySelector('.bote-header p');
        if (headerSub && playedJornadas.length > 0) {
            const firstDate = playedJornadas[0].date;
            const lastDate = playedJornadas[playedJornadas.length - 1].date;
            headerSub.innerHTML = `Movimientos del <span style="color:#fff; font-weight:bold;">${firstDate}</span> al <span style="color:#fff; font-weight:bold;">${lastDate}</span>`;
        }
    }

    /**
     * Render Vista General - Summary by member
     */
    renderVistaGeneral(movements) {
        const memberSummaries = {};

        // Aggregate by member
        this.members.forEach(member => {
            const memberMovements = movements.filter(m => String(m.memberId) === String(member.id));

            const totalIngresos = memberMovements.reduce((sum, m) => sum + m.totalIngresos, 0);
            const totalGastos = memberMovements.reduce((sum, m) => sum + m.totalGastos, 0);
            const bote = memberMovements.length > 0
                ? memberMovements[memberMovements.length - 1].boteAcumulado
                : 0;

            memberSummaries[member.id] = {
                name: member.name,
                nickname: member.phone || member.name,
                totalIngresos,
                totalGastos,
                bote
            };
        });

        // Aggregated date range for the general view
        const playedJornadas = this.jornadas.filter(j =>
            j.matches && j.matches.some(match => match.result && match.result !== '' && match.result.toLowerCase() !== 'por definir')
        ).sort((a, b) => a.number - b.number);
        let dateRangeHtml = '';
        if (playedJornadas.length > 0) {
            dateRangeHtml = `<p style="text-align:center; color: var(--primary-color); font-weight:bold; margin-bottom: 1rem; opacity:0.8; font-size:0.9rem;">
                Resumen acumulado: ${playedJornadas[0].date} — ${playedJornadas[playedJornadas.length - 1].date}
            </p>`;
        }

        // Render table
        let html = `
            ${dateRangeHtml}
            <table class="bote-table">
                <thead>
                    <tr>
                        <th>Socio</th>
                        <th>Total Ingresos</th>
                        <th>Total Gastos</th>
                        <th>Bote Actual</th>
                        <th>Detalle</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.members.forEach(member => {
            const summary = memberSummaries[member.id];
            if (!summary) return;
            const boteClass = summary.bote > 0 ? 'positive' : summary.bote < 0 ? 'negative' : 'neutral';

            html += `
                <tr>
                    <td><strong>${summary.nickname || summary.name}</strong></td>
                    <td class="positive">${summary.totalIngresos.toFixed(2)} €</td>
                    <td class="negative">${summary.totalGastos.toFixed(2)} €</td>
                    <td class="${boteClass}">${summary.bote.toFixed(2)} €</td>
                    <td>
                        <button class="btn-action btn-detail" onclick="window.Bote.showSocioDetalle('${member.id}')">📅 Detalle</button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        document.getElementById('bote-content').innerHTML = html;
    }

    /**
     * Render Vista Detalle - By jornada with navigation
     */
    renderVistaDetalle(movements) {
        // Group by jornada
        const jornadaGroups = {};
        movements.forEach(m => {
            if (!jornadaGroups[m.jornadaNum]) {
                jornadaGroups[m.jornadaNum] = [];
            }
            jornadaGroups[m.jornadaNum].push(m);
        });

        const jornadaNums = Object.keys(jornadaGroups)
            .filter(num => {
                const j = this.jornadas.find(jor => jor.number === parseInt(num));
                return j && j.matches && j.matches.some(m => m.result && m.result !== '' && m.result.toLowerCase() !== 'por definir');
            })
            .sort((a, b) => parseInt(a) - parseInt(b));

        if (jornadaNums.length === 0) {
            document.getElementById('bote-content').innerHTML = '<p class="loading">No hay jornadas con resultados todavía</p>';
            return;
        }

        if (this.currentJornadaIndex === -1 || this.currentJornadaIndex >= jornadaNums.length) {
            this.currentJornadaIndex = jornadaNums.length - 1;
        }

        const currentJornadaNum = jornadaNums[this.currentJornadaIndex];
        const jornadaMovements = jornadaGroups[currentJornadaNum];
        const jornada = this.jornadas.find(j => j.number === parseInt(currentJornadaNum));

        const extraPrizes = jornadaMovements.reduce((sum, m) => sum + (m.extraPrizes || 0), 0);
        const totalIngresos = jornadaMovements.reduce((sum, m) => sum + m.totalIngresos, 0) + extraPrizes;
        const totalGastos = jornadaMovements.reduce((sum, m) => sum + m.totalGastos, 0);
        const neto = totalIngresos - totalGastos;

        let html = `
            <div class="jornada-nav">
                <button onclick="window.Bote.prevJornada()" ${this.currentJornadaIndex === 0 ? 'disabled' : ''}>← Anterior</button>
                
                <select id="jornada-select" onchange="window.Bote.goToJornada(this.value)" style="padding: 0.6rem 1rem; border-radius: 8px; background: rgba(30, 30, 30, 0.9); color: white; border: 1px solid var(--primary-color); font-weight: bold; cursor: pointer;">
                    ${jornadaNums.map((num, idx) => {
            const j = this.jornadas.find(jor => jor.number === parseInt(num));
            return `<option value="${idx}" ${idx === this.currentJornadaIndex ? 'selected' : ''}>Jornada ${num} - ${j ? j.date : ''}</option>`;
        }).join('')}
                </select>

                <button onclick="window.Bote.nextJornada()" ${this.currentJornadaIndex === jornadaNums.length - 1 ? 'disabled' : ''}>Siguiente →</button>
            </div>
            
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255, 145, 0, 0.08); border-radius: 8px; border: 1px solid rgba(255, 145, 0, 0.3);">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align:center;">
                    <div><strong style="color: #ff9100; font-size:0.75rem;">INGRESOS (Socios + Premios)</strong><br><span class="positive">${totalIngresos.toFixed(2)}€</span></div>
                    <div><strong style="color: #ff9100; font-size:0.75rem;">GASTOS (Validación + Comisión)</strong><br><span class="negative">${totalGastos.toFixed(2)}€</span></div>
                    <div><strong style="color: #ff9100; font-size:0.75rem;">NETO JORNADA</strong><br><span class="${neto >= 0 ? 'positive' : 'negative'}">${neto.toFixed(2)}€</span></div>
                </div>
                <p style="margin-top: 0.8rem; font-size: 0.75rem; color: #ff9100; text-align: center; opacity: 0.8;">
                    📝 <em>Nota: Todos los premios se acumulan íntegramente en el bote común de la Peña.</em>
                </p>
            </div>

            <div style="overflow-x: auto; border-radius: 12px; border: 1px solid var(--glass-border);">
                <table class="bote-table">
                    <thead>
                        <tr>
                            <th rowspan="2">Socio</th>
                            <th rowspan="2">Aciertos</th>
                            <th rowspan="2">PAGA</th>
                            <th colspan="3" style="text-align:center; background: #e65100;">Penalizaciones</th>
                            <th rowspan="2">Premios</th>
                            <th rowspan="2" style="background: #e65100; font-size: 0.7rem;">Reembolso Sellado</th>
                            <th rowspan="2">Neto</th>
                            <th rowspan="2" style="background: var(--primary-color, #ff9100); color: #000; border-left: 2px solid #000;">Bote Total</th>
                        </tr>
                        <tr>
                            <th style="background: #ff9100; font-size: 0.65rem;">Unos</th>
                            <th style="background: #ff9100; font-size: 0.65rem;">Bajos</th>
                            <th style="background: #ff9100; font-size: 0.65rem;">PIG</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        jornadaMovements
            .sort((a, b) => parseInt(a.memberId) - parseInt(b.memberId))
            .forEach(m => {
                let selladoUI = '-';
                if (m.sellado < 0) {
                    const sellVal = Math.abs(m.sellado).toFixed(1);
                    selladoUI = `
                        <div style="font-size:0.7rem; border: 1px solid rgba(255,145,0,0.3); border-radius: 4px; padding: 2px;">
                            <div style="font-weight:bold; margin-bottom:2px;">${sellVal}€</div>
                            <label style="display:block; cursor:pointer;"><input type="radio" name="reemb_${m.memberId}_${m.jornadaId}" ${!m.isSelladoInCash ? 'checked' : ''} onclick="window.Bote.toggleSelladoCash('${m.memberId}', '${m.jornadaId}', false)"> Bote</label>
                            <label style="display:block; cursor:pointer;"><input type="radio" name="reemb_${m.memberId}_${m.jornadaId}" ${m.isSelladoInCash ? 'checked' : ''} onclick="window.Bote.toggleSelladoCash('${m.memberId}', '${m.jornadaId}', true)"> Cash</label>
                        </div>
                    `;
                }

                html += `
                    <tr>
                        <td><strong>${m.memberName}${m.exento ? ' 🎁' : ''}${m.jugaDobles ? ' 2️⃣' : ''}</strong></td>
                        <td style="font-weight:900;">${m.aciertos}</td>
                        <td class="positive" style="font-weight:bold;">${(m.aportacion + (m.penalizacionUnos || 0) + (m.penalizacionBajosAciertos || 0) + (m.penalizacionPIG || 0)).toFixed(2)}€</td>
                        <td class="negative">${(m.penalizacionUnos || 0).toFixed(1)}€</td>
                        <td class="negative">${(m.penalizacionBajosAciertos || 0).toFixed(1)}€</td>
                        <td class="negative">${(m.penalizacionPIG || 0).toFixed(1)}€</td>
                        <td class="positive" title="Premio acumulado en el Bote Peña">${m.premios.toFixed(1)}€</td>
                        <td>${selladoUI}</td>
                        <td class="${m.neto >= 0 ? 'positive' : 'negative'}">${m.neto.toFixed(2)}€</td>
                        <td style="font-weight:900; background: rgba(255,145,0,0.1); border-left: 2px solid var(--primary-color);">${m.boteAcumulado.toFixed(2)}€</td>
                    </tr>
                `;
            });

        // Row for Extra Column (Doubles) if they have prizes
        if (extraPrizes > 0) {
            html += `
                <tr style="background: rgba(255, 145, 0, 0.1); border-top: 2px solid var(--primary-color);">
                    <td><strong>💰 Quiniela de Dobles</strong></td>
                    <td style="text-align:center;">-</td>
                    <td style="text-align:center;">-</td>
                    <td style="text-align:center;">-</td>
                    <td style="text-align:center;">-</td>
                    <td style="text-align:center;">-</td>
                    <td class="positive" style="font-weight:bold;">${extraPrizes.toFixed(2)}€</td>
                    <td style="text-align:center;">-</td>
                    <td style="text-align:center;">-</td>
                    <td style="text-align:center; opacity: 0.5;">-</td>
                </tr>
            `;
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('bote-content').innerHTML = html;
    }

    prevJornada() {
        if (this.currentJornadaIndex > 0) {
            this.currentJornadaIndex--;
            this.render();
        }
    }

    nextJornada() {
        const movements = this.calculateAllMovements();
        const jornadaGroups = {};
        movements.forEach(m => {
            if (!jornadaGroups[m.jornadaNum]) {
                jornadaGroups[m.jornadaNum] = [];
            }
            jornadaGroups[m.jornadaNum].push(m);
        });
        const jornadaNums = Object.keys(jornadaGroups)
            .filter(num => {
                const j = this.jornadas.find(jor => jor.number === parseInt(num));
                return j && j.matches && j.matches.some(m => m.result && m.result !== '' && m.result.toLowerCase() !== 'por definir');
            })
            .sort((a, b) => parseInt(a) - parseInt(b));

        if (this.currentJornadaIndex < jornadaNums.length - 1) {
            this.currentJornadaIndex++;
            this.render();
        }
    }

    goToJornada(index) {
        this.currentJornadaIndex = parseInt(index);
        this.render();
    }



    /**
     * Show detailed modal for a specific member
     */
    showSocioDetalle(memberId) {
        console.log('Opening details for member:', memberId);
        const member = this.members.find(m => String(m.id) === String(memberId));
        if (!member) {
            console.error('Member not found:', memberId);
            return;
        }

        const movements = this.calculateAllMovements();
        const memberMovements = movements.filter(m => String(m.memberId) === String(member.id));
        const memberName = member.name;

        const modal = document.getElementById('modal-detalle-socio');
        const content = document.getElementById('detalle-socio-content');
        const title = document.getElementById('detalle-socio-nombre');

        if (!modal || !content) {
            console.error('Modal elements not found in DOM');
            return;
        }

        title.textContent = `Movimientos de ${memberName}`;

        let html = `
            <div style="margin-bottom: 1.5rem; text-align:center;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                    <div style="padding:0.5rem; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.6rem; opacity:0.6; text-transform:uppercase;">Ingresos (+)</div>
                        <div class="positive" style="font-weight:bold;">${memberMovements.reduce((s, m) => s + m.totalIngresos, 0).toFixed(2)}€</div>
                    </div>
                    <div style="padding:0.5rem; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.6rem; opacity:0.6; text-transform:uppercase;">Gastos (-)</div>
                        <div class="negative" style="font-weight:bold;">${memberMovements.reduce((s, m) => s + m.totalGastos, 0).toFixed(2)}€</div>
                    </div>
                    <div style="padding:0.5rem; background:rgba(255,145,0,0.1); border-radius:8px; border:1px solid var(--primary-color);">
                        <div style="font-size:0.6rem; color:var(--primary-color); text-transform:uppercase;">Bote Actual</div>
                        <div style="font-weight:900; color:var(--primary-color); font-size:1.1rem;">${memberMovements.length > 0 ? memberMovements[memberMovements.length - 1].boteAcumulado.toFixed(2) : '0.00'}€</div>
                    </div>
                </div>
            </div>
            
            <div style="flex:1; min-height:400px; max-height: 65vh; overflow-y: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2);">
                <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead style="position: sticky; top:0; background: var(--primary-color); z-index: 10;">
                        <tr>
                            <th style="padding:0.75rem; text-align:left;">J</th>
                            <th style="padding:0.75rem; text-align:left;">Fecha</th>
                            <th style="padding:0.75rem; text-align:center;">Ac.</th>
                            <th style="padding:0.75rem; text-align:right;">Ingreso</th>
                            <th style="padding:0.75rem; text-align:right;">Gasto</th>
                            <th style="padding:0.75rem; text-align:right;">Bote</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (memberMovements.length === 0) {
            html += '<tr><td colspan="6" style="text-align:center; padding:2rem;">No hay movimientos</td></tr>';
        } else {
            memberMovements.forEach(m => {
                const totalIn = m.totalIngresos || 0;
                const totalOut = m.totalGastos || 0;

                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding:0.75rem;"><strong>${m.jornadaNum}</strong></td>
                        <td style="padding:0.75rem; font-size:0.8rem; opacity:0.7;">${m.jornadaDate}</td>
                        <td style="padding:0.75rem; text-align:center;">
                            ${m.aciertos}${m.exento ? ' <span title="Exento" style="color:#ff9100;">🎁</span>' : ''}${m.premios > 0 ? ' <span title="Premio" style="color:#81c784;">🏆</span>' : ''}
                        </td>
                        <td class="positive" style="padding:0.75rem; text-align:right; font-weight:bold;">${totalIn > 0 ? '+' + totalIn.toFixed(2) + '€' : '-'}</td>
                        <td class="negative" style="padding:0.75rem; text-align:right;">${totalOut > 0 ? '-' + totalOut.toFixed(2) + '€' : '0.00€'}</td>
                        <td style="padding:0.75rem; text-align:right; font-weight:900; color: ${m.boteAcumulado >= 0 ? '#4CAF50' : '#ff5252'}; background:rgba(255,255,255,0.02);">${m.boteAcumulado.toFixed(2)}€</td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        content.innerHTML = html;
        modal.style.display = 'flex'; // Use flex for centering
        modal.style.zIndex = '9999';
        console.log('Details modal opened successfully');
    }

    /**
     * Open ingreso modal
     */
    openIngresoModal() {
        document.getElementById('modal-ingreso').style.display = 'block';
    }

    /**
     * Open config modal
     */
    openConfigModal() {
        // Populate current values
        document.getElementById('config-coste-columna').value = this.config.costeColumna;
        document.getElementById('config-coste-dobles').value = this.config.costeDobles;
        document.getElementById('config-aportacion').value = this.config.aportacionSemanal;
        document.getElementById('config-bote-inicial').value = this.config.boteInicial;

        const history = this.config.penalties_history || {};
        const pigSetting = (history.pig || []).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        document.getElementById('config-penalizacion-pig').value = pigSetting ? pigSetting.value : 1.00;

        const lowSetting = (history.bajos_aciertos || []).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        if (lowSetting && lowSetting.values) {
            document.getElementById('config-pen-0').value = lowSetting.values[0] || 0;
            document.getElementById('config-pen-1').value = lowSetting.values[1] || 0;
            document.getElementById('config-pen-2').value = lowSetting.values[2] || 0;
            document.getElementById('config-pen-3').value = lowSetting.values[3] || 0;
        }

        const unosHistory = history.unos || [];
        const unosSetting = unosHistory.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        if (unosSetting && unosSetting.values) {
            for (let i = 10; i <= 15; i++) {
                const el = document.getElementById(`config-unos-${i}`);
                if (el) el.value = unosSetting.values[i] || 0;
            }
        }

        document.getElementById('modal-config').style.display = 'block';
    }

    /**
     * Open gestión ingresos modal
     */
    openGestionIngresosModal() {
        this.renderIngresosLista();
        document.getElementById('modal-gestion-ingresos').style.display = 'block';
    }

    /**
     * Render lista de ingresos
     */
    renderIngresosLista() {
        if (this.ingresos.length === 0) {
            document.getElementById('lista-ingresos-content').innerHTML = `
                <p style="text-align: center; color: #888; padding: 2rem;">
                    No hay ingresos registrados
                </p>
            `;
            return;
        }

        // Sort by date (most recent first)
        const sortedIngresos = [...this.ingresos].sort((a, b) => {
            return new Date(b.fecha) - new Date(a.fecha);
        });

        let html = `
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Socio</th>
                        <th>Cantidad</th>
                        <th>Método</th>
                        <th>Concepto</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedIngresos.forEach(ingreso => {
            const member = this.members.find(m => String(m.id) === String(ingreso.memberId));
            const memberName = member ? member.name : 'Desconocido';
            const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES');
            const concepto = ingreso.concepto || '-';

            html += `
                <tr>
                    <td>${fecha}</td>
                    <td>${memberName}</td>
                    <td class="positive">${parseFloat(ingreso.cantidad).toFixed(2)} €</td>
                    <td>${ingreso.metodo}</td>
                    <td>${concepto}</td>
                    <td>
                        <button class="btn-action" style="background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);" 
                                onclick="boteManager.deleteIngreso(${ingreso.id})">
                            🗑️ Eliminar
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table >
            `;

        document.getElementById('lista-ingresos-content').innerHTML = html;
    }

    /**
     * Delete an ingreso
     */
    async deleteIngreso(ingresoId) {
        const ingreso = this.ingresos.find(i => i.id === ingresoId);
        if (!ingreso) return;

        const member = this.members.find(m => String(m.id) === String(ingreso.memberId));
        const memberName = member ? member.name : 'Desconocido';
        const cantidad = parseFloat(ingreso.cantidad).toFixed(2);

        if (!confirm(`¿Estás seguro de eliminar el ingreso de ${cantidad}€ de ${memberName}?`)) {
            return;
        }

        try {
            await window.DataService.delete('ingresos', ingresoId);
            this.ingresos = this.ingresos.filter(i => i.id !== ingresoId);

            alert('Ingreso eliminado correctamente');
            this.renderIngresosLista();
            this.render();

        } catch (error) {
            console.error('Error deleting ingreso:', error);
            alert('Error al eliminar el ingreso');
        }
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    /**
     * Submit ingreso form
     */
    async submitIngreso(event) {
        event.preventDefault();

        const ingreso = {
            id: Date.now(),
            memberId: parseInt(document.getElementById('ingreso-socio').value),
            cantidad: parseFloat(document.getElementById('ingreso-cantidad').value),
            metodo: document.getElementById('ingreso-metodo').value,
            fecha: document.getElementById('ingreso-fecha').value,
            concepto: document.getElementById('ingreso-concepto').value,
            timestamp: new Date().toISOString()
        };

        try {
            await window.DataService.save('ingresos', ingreso);
            this.ingresos.push(ingreso);

            alert('Ingreso registrado correctamente');
            this.closeModal('modal-ingreso');

            // Reset form
            document.getElementById('form-ingreso').reset();
            document.getElementById('ingreso-fecha').valueAsDate = new Date();

            // Re-render
            this.render();

        } catch (error) {
            console.error('Error saving ingreso:', error);
            alert('Error al registrar el ingreso');
        }
    }

    /**
     * Submit config form
     */
    async submitConfig(event) {
        event.preventDefault();

        const today = new Date().toISOString().split('T')[0];

        // Basic costs
        this.config.costeColumna = parseFloat(document.getElementById('config-coste-columna').value);
        this.config.costeDobles = parseFloat(document.getElementById('config-coste-dobles').value);
        this.config.aportacionSemanal = parseFloat(document.getElementById('config-aportacion').value);
        this.config.boteInicial = parseFloat(document.getElementById('config-bote-inicial').value);

        // Advanced Penalties History
        if (!this.config.penalties_history) this.config.penalties_history = {};

        // PIG
        const pigValue = parseFloat(document.getElementById('config-penalizacion-pig').value);
        this.addPenaltyToHistory('pig', { date: today, value: pigValue });

        // Low Hits
        const lowValues = {
            0: parseFloat(document.getElementById('config-pen-0').value),
            1: parseFloat(document.getElementById('config-pen-1').value),
            2: parseFloat(document.getElementById('config-pen-2').value),
            3: parseFloat(document.getElementById('config-pen-3').value)
        };
        this.addPenaltyToHistory('bajos_aciertos', { date: today, values: lowValues });

        // Unos Grid
        const unosValues = {};
        for (let i = 10; i <= 15; i++) {
            const el = document.getElementById(`config-unos-${i}`);
            if (el) unosValues[i] = parseFloat(el.value);
        }
        this.addPenaltyToHistory('unos', { date: today, values: unosValues });

        try {
            await this.saveConfig();
            alert('Configuración guardada correctamente. Los cambios se aplicarán a movimientos futuros y basados en la fecha de la jornada.');
            this.closeModal('modal-config');
            this.render();
        } catch (error) {
            console.error('Error saving config:', error);
            alert('Error al guardar la configuración');
        }
    }

    addPenaltyToHistory(type, entry) {
        if (!this.config.penalties_history[type]) this.config.penalties_history[type] = [];
        const existing = this.config.penalties_history[type].find(e => e.date === entry.date);
        if (existing) {
            Object.assign(existing, entry);
        } else {
            this.config.penalties_history[type].push(entry);
        }
        // Keep sorted by date
        this.config.penalties_history[type].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    /**
     * Export data to CSV
     */
    exportData() {
        const movements = this.calculateAllMovements();

        let csv = 'Socio,Jornada,Fecha,Aciertos,Aportación,Columna,Pen.1s,Pen.Bajos,PIG,Sellado,Premios,Total Ingresos,Total Gastos,Neto,Bote Acumulado,Exento,Juega Dobles\n';

        movements.forEach(m => {
            csv += `${m.memberName},${m.jornadaNum},${m.jornadaDate},${m.aciertos},${m.aportacion},${m.costeColumna},${m.penalizacionUnos},${m.penalizacionBajosAciertos},${m.penalizacionPIG},${m.sellado},${m.premios},${m.totalIngresos},${m.totalGastos},${m.neto},${m.boteAcumulado},${m.exento ? 'Sí' : 'No'},${m.jugaDobles ? 'Sí' : 'No'}\n`;
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `bote_${this.config.temporadaActual}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Delete a movement
     */
    async deleteMovement(id) {
        if (!confirm('¿Seguro que quieres eliminar este movimiento?')) return;

        try {
            await window.DataService.delete('bote', id);
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('Error deleting movement:', error);
            alert('Error al eliminar el movimiento');
        }
    }

    /**
     * Render Vista Cuadrante
     */
    renderVistaCuadrante(movements) {
        const container = document.getElementById('bote-content');
        if (!container) return;

        // Group by member and jornada
        const memberData = {};
        const jornadasInfo = [];

        // Get unique played jornadas from movements
        const uniqueJornadas = [...new Set(movements.map(m => m.jornadaNum))].sort((a, b) => a - b);
        const gMadrid = ['madrid', 'r. madrid', 'madr'];
        const gBarca = ['barcelona', 'barça', 'barca', 'fcb'];
        const gAtleti = ['atlétic', 'atletico', 'atleti', 'at. madrid', 'atm'];
        const groups = [gMadrid, gBarca, gAtleti];

        const checkIsPIG = (m) => {
            if (!m) return false;
            const h = m.home || '', a = m.away || '';
            const isMadrid = (t) => { const tl = t.toLowerCase(); return tl.includes('madrid') && !tl.includes('atlet') && !tl.includes('at.'); };
            const isBarca = (t) => { const tl = t.toLowerCase(); return tl.includes('barcelona') || tl.includes('barça') || tl.includes('barca') || tl.includes('fcb'); };
            const isAtleti = (t) => { const tl = t.toLowerCase(); return tl.includes('atleti') || tl.includes('atlétic') || tl.includes('atletico') || tl.includes('at. madrid'); };
            return (isMadrid(h) && (isBarca(a) || isAtleti(a))) || (isBarca(h) && (isMadrid(a) || isAtleti(a))) || (isAtleti(h) && (isMadrid(a) || isBarca(a)));
        };

        uniqueJornadas.forEach(num => {
            const j = this.jornadas.find(jor => jor.number === num);
            if (j && j.matches && j.matches.some(m => m.result && m.result !== '' && m.result.toLowerCase() !== 'por definir')) {
                let pigIdx = j.pigMatchIndex !== undefined ? j.pigMatchIndex : 14;
                if (j.matches && j.matches.length > 0) {
                    if (!checkIsPIG(j.matches[pigIdx])) {
                        const detected = j.matches.slice(0, 15).findIndex(mj => checkIsPIG(mj));
                        if (detected !== -1) pigIdx = detected;
                    }
                }
                const mPig = j.matches ? j.matches[pigIdx] : null;
                const hasPig = checkIsPIG(mPig);
                jornadasInfo.push({ ...j, hasPig });
            }
        });

        this.members.forEach(m => {
            memberData[m.id] = {
                id: m.id,
                name: window.AppUtils.getMemberName(m),
                jornadas: {}
            };
        });

        movements.forEach(m => {
            if (memberData[m.memberId]) {
                memberData[m.memberId].jornadas[m.jornadaNum] = m;
            }
        });

        let html = `
            <style>
                .cuadrante-cell-win { background-color: var(--cuadrante-win-bg, #1a73e8) !important; color: var(--cuadrante-win-text, #ffffff) !important; border: 3px solid var(--cuadrante-win-border, #ff9100) !important; font-weight: bold; }
                .cuadrante-cell-loss { background-color: var(--cuadrante-loss-bg, #d93025) !important; color: var(--cuadrante-loss-text, #ffffff) !important; border: 2px solid var(--cuadrante-loss-border, #f44336) !important; }
            </style>
            <div class="cuadrante-container" style="max-height: 92vh; overflow: auto; border: 1px solid var(--glass-border); border-radius: 12px; position: relative;">
                <table class="bote-table cuadrante-table" style="font-size: 0.8rem; min-width: 100%; border-collapse: separate; border-spacing: 0;">
                    <thead>
                        <tr>
                            <th style="position: sticky; top: 0; left: 0; z-index: 100; background: var(--cuadrante-header-bg); color: var(--cuadrante-header-text); border-right: 2px solid var(--cuadrante-win-border, var(--primary-color, #ff9100));">Socio</th>
        `;

        jornadasInfo.forEach(j => {
            let shortDate = '';
            const d = window.AppUtils.parseDate(j.date);
            if (d) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                shortDate = `<div style="font-size: 0.6rem; opacity: 0.8; font-weight: normal;">${day}/${month}</div>`;
            }
            html += `
                <th style="position: sticky; top: 0; min-width: 70px; background: var(--cuadrante-header-bg); color: var(--cuadrante-header-text); border-bottom: 2px solid var(--cuadrante-win-border, var(--primary-color, #ff9100));">
                    <div>J${j.number}${j.hasPig ? ' 🐷' : ''}</div>
                    ${shortDate}
                </th>`;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.members.forEach(member => {
            const data = memberData[member.id];
            html += `
                <tr>
                    <td style="position: sticky; left: 0; z-index: 50; background: var(--cuadrante-sticky-col); color: var(--cuadrante-sticky-text); font-weight: bold; border-right: 2px solid var(--cuadrante-win-border, var(--primary-color, #ff9100)); white-space: nowrap;">
                        ${data.name}
                    </td>
            `;

            jornadasInfo.forEach(j => {
                const mov = data.jornadas[j.number];
                let cellContent = '-';
                let style = '';

                if (mov) {
                    const penalties = (mov.penalizacionUnos || 0) + (mov.penalizacionBajosAciertos || 0) + (mov.penalizacionPIG || 0);
                    const payment = mov.aportacion + penalties;

                    cellContent = `<div style="font-size:1.1rem; font-weight:900; color: inherit;">${payment.toFixed(1)}€</div>`;
                    cellContent += `<div style="font-size:0.75rem; opacity: 0.8; font-weight:bold;">${mov.aciertos} ac.</div>`;
                    if (mov.premios > 0) {
                        cellContent += `<div style="background: rgba(76, 175, 80, 0.2); color: #81c784; font-weight: bold; font-size: 0.75rem; margin-top:4px; padding: 2px 4px; border-radius: 4px; border: 1px solid #4CAF50;">+${mov.premios.toFixed(2)}€ 🏆</div>`;
                    }

                    let cellClass = '';
                    if (mov.exento) style = `background: var(--cuadrante-exempt-bg, #424242); color: var(--cuadrante-exempt-text, #ffffff);`;

                    let clickHandler = '';
                    if (penalties > 0) {
                        style = `background: var(--cuadrante-penalty-bg, #422a00); color: var(--cuadrante-penalty-text, #ffcc80); border-left: 3px solid var(--cuadrante-penalty-border, #ff9100); cursor: pointer;`;
                        const tooltip = [];
                        if (mov.penalizacionUnos > 0) tooltip.push(`• Exceso de Unos: ${mov.penalizacionUnos.toFixed(2)}€`);
                        if (mov.penalizacionBajosAciertos > 0) tooltip.push(`• Bajos Aciertos: ${mov.penalizacionBajosAciertos.toFixed(2)}€`);
                        if (mov.penalizacionPIG > 0) tooltip.push(`• Fallo en PIG: ${mov.penalizacionPIG.toFixed(2)}€`);
                        clickHandler = `onclick="window.Bote.showPenaltyDetail('${member.name}', ${j.number}, '${tooltip.join('<br>')}')"`;
                    }

                    if (this.wasWinnerOfJornada(member.id, j)) {
                        cellClass = 'cuadrante-cell-win';
                    } else if (this.wasLoserOfJornada(member.id, j)) {
                        cellClass = 'cuadrante-cell-loss';
                    }

                    html += `<td ${clickHandler} class="${cellClass}" style="text-align:center; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); min-width:85px; ${style}">${cellContent}</td>`;
                } else {
                    html += `<td style="text-align:center; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); min-width:85px; ${style}">${cellContent}</td>`;
                }
            });

            html += `</tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
            <style>
                .cuadrante-container::-webkit-scrollbar { width: 10px; height: 10px; }
                .cuadrante-container::-webkit-scrollbar-track { background: var(--card-bg); }
                .cuadrante-container::-webkit-scrollbar-thumb { background: var(--primary-color); border-radius: 5px; }
                .cuadrante-table th { font-weight: 800; text-transform: uppercase; font-size: 0.7rem; }
            </style>
        `;

        container.innerHTML = html;
    }
    async runMaintenanceMigrations() {
        const migrationDone = localStorage.getItem('bote_maintenance_v17');
        if (migrationDone) return;

        console.log('Running maintenance migration v17 (Bulk Prize Sync)...');

        try {
            const allJ = await window.DataService.getAll('jornadas');

            // Clean J16
            const j16s = allJ.filter(j => j.number === 16);
            for (const j of j16s) await window.DataService.update('jornadas', j.id, { prizes: {} });

            // Group prizes by jornada number to avoid overwriting
            const rawUpdates = [
                { num: 2, hits: 11, val: 28.84 },
                { num: 2, hits: 10, val: 3.00 },
                { num: 3, hits: 11, val: 48.37 },
                { num: 5, hits: 10, val: 13.08 },
                { num: 7, hits: 10, val: 1.00 },
                { num: 26, hits: 10, val: 6.30 }
            ];

            const prizesByNum = {};
            rawUpdates.forEach(u => {
                if (!prizesByNum[u.num]) prizesByNum[u.num] = {};
                prizesByNum[u.num][String(u.hits)] = u.val;
            });

            for (const num of Object.keys(prizesByNum)) {
                const jDocs = allJ.filter(j => j.number === parseInt(num));
                const newPrizes = prizesByNum[num];
                for (const d of jDocs) {
                    // Combine with existing (if any) or overwrite with our clean set
                    await window.DataService.update('jornadas', d.id, { prizes: newPrizes });
                }
            }

            const marks = ['v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17'];
            marks.forEach(m => localStorage.setItem(`bote_maintenance_${m}`, 'true'));

            console.log('Migration v17 effective!');
            await this.loadData();
            this.render();
        } catch (e) { console.error('Migration v17 failed:', e); }
    }

    showPenaltyDetail(memberName, jNum, detailHtml) {
        const modal = document.getElementById('modal-detalle-socio');
        const content = document.getElementById('detalle-socio-content');
        const title = document.getElementById('detalle-socio-nombre');

        if (!modal || !content) return;

        title.textContent = `Penalización: ${memberName} (J${jNum})`;
        content.innerHTML = `
            <div style="padding: 2rem; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">⚖️</div>
                <h3 style="color: var(--primary-color); margin-bottom: 1.5rem;">Desglose de Penalizaciones</h3>
                <div style="background: rgba(255,145,0,0.1); border: 1px solid var(--primary-color); border-radius: 12px; padding: 1.5rem; display: inline-block; text-align: left; min-width: 250px;">
                    <div style="font-family: monospace; font-size: 1.1rem; line-height: 1.8;">
                        ${detailHtml}
                    </div>
                </div>
                <p style="margin-top: 2rem; opacity: 0.6; font-size: 0.9rem;">Estas penalizaciones se suman a la aportación semanal.</p>
            </div>
        `;
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';
    }

    async toggleSelladoCash(memberId, jornadaId, isCash) {
        const id = `${memberId}_${jornadaId}`;
        try {
            if (isCash) {
                const entry = { id, memberId, jornadaId, date: new Date().toISOString() };
                await window.DataService.save('reembolsos_efectivo', entry);
                this.cashPayments.push(entry);
            } else {
                await window.DataService.delete('reembolsos_efectivo', id);
                this.cashPayments = this.cashPayments.filter(cp => cp.id !== id);
            }
            this.render();
        } catch (error) {
            console.error('Error toggling sellado cash payment:', error);
            alert('Error al actualizar el tipo de reembolso');
        }
    }

    renderVistaRepartos(movements) {
        const totalBote = parseFloat(document.getElementById('total-bote').textContent);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <h2 style="margin:0; color: var(--primary-color);">Histórico de Repartos</h2>
            </div>
            
            <div style="overflow-x: auto; border-radius: 12px; border: 1px solid var(--glass-border);">
                <table class="bote-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Tipo</th>
                            <th>Importe Total</th>
                            <th>Info Detalle</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (this.repartos.length === 0) {
            html += `<tr><td colspan="6" style="text-align:center; padding: 2rem; opacity: 0.6;">No se han realizado repartos todavía.</td></tr>`;
        } else {
            [...this.repartos].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(r => {
                const isActividad = r.type === 'actividad';
                html += `
                    <tr>
                        <td style="font-weight:bold;">${new Date(r.date).toLocaleDateString()}</td>
                        <td>${r.description}</td>
                        <td>
                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; background: ${isActividad ? 'rgba(103, 58, 183, 0.2)' : 'rgba(76, 175, 80, 0.2)'}; color: ${isActividad ? '#b39ddb' : '#a5d6a7'}; border: 1px solid ${isActividad ? '#673ab7' : '#4caf50'};">
                                ${isActividad ? '🚀 Actividad' : '👥 Socios'}
                            </span>
                        </td>
                        <td style="font-weight:bold; color: var(--primary-red); shadow: 0 0 10px rgba(217, 48, 37, 0.3);">${r.totalAmount.toFixed(2)}€</td>
                        <td style="font-size: 0.85rem;">
                            ${isActividad ? '-' : `Reparto individual: ${(r.totalAmount / this.members.length).toFixed(2)}€`}
                        </td>
                        <td>
                           <button onclick="window.Bote.deleteReparto('${r.id}')" style="background: rgba(217, 48, 37, 0.1); color: var(--primary-red); border: 1px solid var(--primary-red); padding: 4px 8px; border-radius: 4px; cursor: pointer;">Eliminar</button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('bote-content').innerHTML = html;
    }

    openRepartoModal() {
        // Check current balance
        const totalBote = parseFloat(document.getElementById('total-bote').textContent);
        if (totalBote <= 0) {
            alert('No hay saldo suficiente en el bote para realizar un reparto.');
            return;
        }

        document.getElementById('reparto-fecha').valueAsDate = new Date();
        document.getElementById('reparto-importe').max = totalBote;
        document.getElementById('reparto-importe').placeholder = `Máximo: ${totalBote.toFixed(2)}€`;

        // Reset list of members settings
        const listDiv = document.getElementById('reparto-miembros-list');
        listDiv.innerHTML = '';

        this.members.sort((a, b) => parseInt(a.id) - parseInt(b.id)).forEach(m => {
            const div = document.createElement('div');
            div.style.padding = '8px';
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.borderRadius = '6px';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            div.innerHTML = `
                <span style="font-size: 0.85rem; font-weight: bold;">${m.name}</span>
                <select name="choice_${m.id}" style="font-size: 0.8rem; padding: 2px 4px; background: #222; color: #fff; border: 1px solid #444;">
                    <option value="bote" selected>Al Bote</option>
                    <option value="cash">En Efectivo</option>
                </select>
            `;
            listDiv.appendChild(div);
        });

        document.getElementById('modal-reparto').style.display = 'flex';
    }

    toggleRepartoType(val) {
        document.getElementById('reparto-socios-config').style.display = (val === 'socios') ? 'block' : 'none';
        if (val === 'actividad') {
            document.getElementById('reparto-descripcion').placeholder = "Ej: Cena Navidad / Pago Loteria";
        } else {
            document.getElementById('reparto-descripcion').placeholder = "Ej: Reparto parcial ganancias";
        }
    }

    async saveReparto() {
        const totalBote = parseFloat(document.getElementById('total-bote').textContent);
        const importe = parseFloat(document.getElementById('reparto-importe').value);
        const type = document.getElementById('reparto-tipo').value;

        if (importe > totalBote) {
            alert(`No se puede repartir más de lo que hay en el bote (${totalBote.toFixed(2)}€).`);
            return;
        }

        const choices = {};
        if (type === 'socios') {
            const selects = document.querySelectorAll('#reparto-miembros-list select');
            selects.forEach(s => {
                const mid = s.name.replace('choice_', '');
                choices[mid] = s.value;
            });
        }

        const reparto = {
            id: 'rep_' + Date.now(),
            date: document.getElementById('reparto-fecha').value,
            totalAmount: importe,
            type: type,
            description: document.getElementById('reparto-descripcion').value,
            memberChoices: choices,
            createdAt: new Date().toISOString()
        };

        try {
            await window.DataService.save('repartos', reparto);
            this.repartos.push(reparto);
            this.closeModal('modal-reparto');
            this.render();
            alert('Reparto registrado correctamente.');
        } catch (error) {
            console.error('Error saving reparto:', error);
            alert('Error al guardar el reparto.');
        }
    }

    async deleteReparto(id) {
        if (!confirm('¿Seguro que quieres eliminar este reparto? Esta acción revertirá todos los saldos.')) return;
        try {
            await window.DataService.delete('repartos', id);
            this.repartos = this.repartos.filter(r => r.id !== id);
            this.render();
        } catch (error) {
            console.error('Error deleting reparto:', error);
            alert('Error al eliminar el reparto.');
        }
    }
}

// Initialize on page load
window.Bote = new BoteManager();
