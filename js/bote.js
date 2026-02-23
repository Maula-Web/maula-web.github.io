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
            console.log('BoteManager: Starting initialization...');
            if (!window.DataService.db) await window.DataService.init();

            // Load data
            await this.loadData();
            await this.loadConfig();

            // Check dependencies
            if (!window.ScoringSystem) {
                console.warn('BoteManager: ScoringSystem not found, loading fallback...');
                // You could dynamically load it here if needed, but for now we'll just log
            }

            // Populate dropdowns
            this.populateSociosDropdown();

            // Set default date to today
            const fechaInput = document.getElementById('ingreso-fecha');
            if (fechaInput) fechaInput.valueAsDate = new Date();

            // Bind events
            const vistaSelect = document.getElementById('vista-select');
            if (vistaSelect) {
                vistaSelect.addEventListener('change', (e) => {
                    this.currentVista = e.target.value;
                    this.currentJornadaIndex = -1;
                    this.render();
                });
            }

            const formReparto = document.getElementById('form-reparto');
            if (formReparto) {
                formReparto.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveReparto();
                });
            }

            // Initial render
            this.render();

            // Run maintenance migrations (prizes request)
            await this.runMaintenanceMigrations();
            console.log('BoteManager: Initialization complete.');

        } catch (error) {
            console.error('CRITICAL Error initializing BoteManager:', error);
            alert('Error al cargar los datos del bote. Por favor, revisa la consola para más detalles.');
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

        // Load cierres vuelta (penalizaciones clasificacion)
        this.cierresVuelta = await window.DataService.getAll('cierres_vuelta') || [];
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
            'F. Lozano': 2, 'F. Ramirez': 42.91, 'Heradio': 10.22, 'JA Valdivieso': 2.00,
            'Valdi': 2.00, 'Javi Mora': 57.88, 'Juan Antonio': 17.90, 'Juanan': 17.90, 'Juanjo': -6.1, 'Luismi': 24.75,
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
                ...this.repartos.map(r => ({ type: 'reparto', date: r.date, data: r })),
                ...this.cierresVuelta.map(c => ({ type: 'cierre_vuelta', date: c.date, data: c }))
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
                        (p.jId == jornada.id || p.jornadaId == jornada.id) &&
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
                        totalIngresos: (manualIngresos + prizes),
                        totalGastos: (costs.aportacion + penalties), // User pays this
                        neto: netoForSocio,
                        boteAcumulado: boteAcumulado,
                        exento: costs.exento,
                        jugaDobles: costs.jugaDobles,
                        isSelladoInCash: isSelladoInCash,
                        pennaIn: costs.aportacion + penalties + prizes + extraPrizes,
                        // Fix: pennaOut should track reimbursements AND general expenses logic is separate. 
                        // But for member movement, pennaOut is only relevant if they receive cash.
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
            jugaDobles: false,
            isSustituto: false // Track if this member is substituting the original sealer
        };

        // If jornada is not sealed, NO COSTS apply
        if (jornada.noSellado) {
            // We still might want to calculate hits (aciertos) for stats?
            // User just mentioned "gasto".
            // If not sealed, maybe hits are irrelevant too or maybe just for fun.
            // But definitely 0 money.
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
            // LÓGICA DE SOBRECOSTE POR EXENTOS:
            // Por cada socio exento, el resto paga un extra fijo (e.g. 0.20€).
            if (infoRedist && infoRedist.payingCount > 0 && infoRedist.payingCount < numMembers) {
                const numExempt = numMembers - infoRedist.payingCount;
                const extraPerExempt = this.getHistoricalPrice('costeExtraExento', jDate) || 0.20;

                costs.aportacion = baseAportacion + (numExempt * extraPerExempt);
                // Costs column remains base? Usually 'columna' tracks the base cost of playing.
                // But the user pays 'aportacion'.
                costs.columna = baseColumna;
            } else {
                costs.aportacion = baseAportacion;
                costs.columna = baseColumna;
            }
        }

        // Plays doubles if there is a recorded pronostico_extra for this member/jornada
        const matchesExtra = this.pronosticosExtra.filter(p =>
            (String(p.jId) === String(jornada.id) || String(p.jId) === String(jornada.number))
        );
        const hasExtra = matchesExtra.some(p => String(p.mId) === String(memberId));

        if (hasExtra) {
            costs.jugaDobles = true;
        } else if (matchesExtra.length === 0 && jornadaIndex > 0) {
            // Fallback: Check if member won previous jornada (historical logic)
            // ONLY if NO extra columns are recorded for anyone in this jornada
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

        // check if jornada is NOT sealed
        if (jornada.noSellado) {
            // If jornada is explicitly marked as 'noSellado', then NO sellado cost applies to anyone
            costs.sellado = 0;
            return costs;
        }

        // Sellado Reimbursement
        let isMaula = false;
        let originalMaulaId = null;

        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            if (this.wasLoserOfJornada(memberId, prevJornada)) {
                isMaula = true;
                originalMaulaId = memberId;
            } else {
                // Check if I was the loser but someone else is substituting me
                // We need to know who was the loser first.
                // This logic checks if CURRENT member is Maula.
                // We need to invert: Find who WAS maula, check if substituted.
            }
        } else if (jornada.number === 1) {
            // Manual override for J1: Luismi sealed it (J0 maula)
            const member = this.members.find(m => String(m.id) === String(memberId));
            if (member && member.name && member.name.toLowerCase().includes('luismi')) {
                isMaula = true;
                originalMaulaId = memberId;
            }
        }

        // Logic for Substitution
        // If jornada has 'sustitutoSellado' field with a memberId
        const sustitutoId = jornada.sustitutoSellado;
        if (sustitutoId) {
            // If there is a substitute defined
            if (String(memberId) === String(sustitutoId)) {
                // I am the substitute, I pay the sellado (get reimbursed negative cost)
                isMaula = true;
                costs.isSustituto = true;
            } else if (isMaula) {
                // I WAS the maula, but I am being substituted. I do NOT pay.
                isMaula = false;
            }
        }

        if (isMaula) {
            const cCol = this.getHistoricalPrice('costeColumna', jDate);
            const cDob = this.getHistoricalPrice('costeDobles', jDate); // 12.00

            // Recalculate Total Cost based on actual playing members
            // Original logic: (numSocios * cCol) + cDob.
            // Correct logic: Sum of all 'columna' costs of all members + 'dobles' (usually 1, unless defined otherwise)
            // But we are inside 'calculateJornadaCosts' for ONE member. We can't sum others here easily without circular dep or passing full info.
            // However, 'numSocios' is constant? No, 'payingCount' varies but cost is redistributed so TOTAL is constant.
            // (NumMembers * BasePrice) is the Total Cost of Columns.
            // Exemption logic maintains Total Revenue constant?
            // "Cuando un socio queda exento, ... ese coste se reparte".
            // So Total Collected = NumMembers * BasePrice.
            // So Sellado Cost = (NumMembers * BasePrice) + DoublesPrice.

            // J1 Fix: User reported Coste Quinielas 26.25 but displayed 14.25
            // 20 members? 20 * 0.75 = 15.00. + 12.00 (Dobles) = 27.00?
            // User said 26.25. Maybe 19 members? 19 * 0.75 = 14.25. + 12 = 26.25.
            // So logic (numSocios * cCol) + cDob is correct IF numSocios is correct.

            // Detection of multiple Double columns (Quinielas de dobles)
            const extras = this.pronosticosExtra.filter(p => {
                const pJ = String(p.jId || p.jornadaId || '');
                return pJ === String(jornada.id) || pJ === String(jornada.number);
            });
            const numExtras = extras.length > 0 ? extras.length : 1;
            const totalCDob = numExtras * cDob;

            costs.sellado = -((numMembers * cCol) + totalCDob);
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
            if (setting.values && setting.values[value] !== undefined) {
                return parseFloat(setting.values[value]);
            }
            return 0; // If defined in config but value is missing for this int, assume 0
        }
        if (type === 'pig') {
            return setting.value !== undefined ? parseFloat(setting.value) : 1.00;
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
        if (!matches || !forecast) return 0;

        let aciertos = 0;
        // Iterate only up to the minimum of regular matches or forecast length
        const limit = Math.min(15, matches.length, forecast.length);

        for (let i = 0; i < limit; i++) {
            const match = matches[i];
            const pred = String(forecast[i] || '').trim().toUpperCase();

            if (!match.result || match.result === '' || match.result.toLowerCase() === 'por definir') continue;

            const rSign = this.normalizeSign(match.result);
            const rScore = String(match.result).trim().toUpperCase();

            let isHit = false;
            if (i === 14) {
                // P15: Exact match for score strings (e.g. "1-0" === "1-0") 
                // OR sign match as fallback if prediction is just a sign
                isHit = (rScore === pred) || (rSign === pred);
            } else {
                // 1-14: Support for multiple signs (e.g. "1X" contains "1")
                isHit = pred.includes(rSign);
            }

            if (isHit) aciertos++;
        }

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

    /**
     * Get prizes for the extra column (Doubles) in a jornada
     */
    getExtraPrizesForJornada(jornada) {
        if (!jornada.prizes || typeof jornada.prizes !== 'object') return 0;
        if (!this.pronosticosExtra) return 0;
        if (!window.ScoringSystem) {
            console.error("ScoringSystem not available for getExtraPrizesForJornada");
            return 0;
        }

        const extras = this.pronosticosExtra.filter(p => {
            const pJ = String(p.jId || p.jornadaId || '');
            return pJ === String(jornada.id) || pJ === String(jornada.number);
        });

        const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : this.parseDate(jornada.date);
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
                // REDUCED: Sum all prizes from the breakdown (already based on official categories)
                Object.keys(ev.breakdown).forEach(h => {
                    const count = ev.breakdown[h];
                    if (count > 0 && legacyPrizes[h]) {
                        totalExtraPrize += count * parseFloat(legacyPrizes[h] || 0);
                    }
                });
            } else if (ev) {
                // DIRECT: Use officialHits (P15 only if 14 hits)
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
            case 'premios_dobles':
                this.renderVistaPremiosDobles(movements);
                break;
            case 'evolucion':
                this.renderVistaEvolucion(movements);
                break;
            case 'excel':
                this.renderVistaExcel(movements);
                break;
        }
    }

    /**
     * Update summary cards
     */
    updateSummary(movements) {
        // SUMMARY FOR THE PEÑA
        // INCOMES: Member Contribs + Penalties + Member Prizes + Doubles Prizes + Manual Ingresos
        const totalIngresos = movements.reduce((sum, m) => sum + (m.pennaIn || 0) + (m.ingresosManual || 0), 0);

        // Calculate Expenses per Jornada (Quinielas + Dobles) using actual extra forecasts
        let totalGastosQuinielas = 0;
        this.jornadas.forEach(j => {
            const played = (j.matches || []).some(m => m.result && m.result !== '');
            if (!played) return;
            if (j.noSellado) return;

            const jDate = window.AppUtils.parseDate(j.date);
            const costCol = this.getHistoricalPrice('costeColumna', jDate);
            const costDob = this.getHistoricalPrice('costeDobles', jDate);
            const numSocios = this.members.length;

            // Count actual sealed double columns for this giornata
            const extras = this.pronosticosExtra.filter(p => {
                const pJ = String(p.jId || p.jornadaId || '');
                return pJ === String(j.id) || pJ === String(j.number);
            });
            const numExtras = extras.length > 0 ? extras.length : 1;

            totalGastosQuinielas += (numSocios * costCol) + (numExtras * costDob);
        });

        const totalRepartos = (this.repartos || []).reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const totalGastos = totalGastosQuinielas + totalRepartos;

        // Caja Real (Tesorería) = Dinero total acumulado menos gastos reales
        const cajaReal = (this.config.boteInicial || 0) + totalIngresos - totalGastos;

        // Caja Virtual (Suma de saldos de socios)
        const totalSaldosVirtuales = this.members.reduce((sum, member) => {
            const memberMovements = movements.filter(m => String(m.memberId) === String(member.id));
            const saldo = memberMovements.length > 0 ? memberMovements[memberMovements.length - 1].boteAcumulado : 0;
            return sum + saldo;
        }, 0);

        // Calculate total prizes for the new card - SHOW RAW TOTAL without subtractions
        const totalPremios = movements.reduce((sum, m) => sum + (m.premios || 0) + (m.extraPrizes || 0), 0);

        // Get processed jornadas (those with results)
        const playedJornadas = this.jornadas.filter(j =>
            j.matches && j.matches.some(match => match.result && match.result !== '' && match.result.toLowerCase() !== 'por definir')
        ).sort((a, b) => a.number - b.number);

        const uniqueJornadasCount = playedJornadas.length;

        document.getElementById('total-bote').innerHTML = `
            <div style="font-size: 1.8rem;">${cajaReal.toFixed(2)} €</div>
            <div style="font-size: 0.75rem; opacity: 0.7; margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                Suma Saldos: ${totalSaldosVirtuales.toFixed(2)} €
            </div>
        `;
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

        // Total Ingresos for the Peña = Contributions + Penalties + Member Prizes + Extra Prizes
        const totalIngresos = jornadaMovements.reduce((sum, m) => {
            const penalties = (m.penalizacionUnos || 0) + (m.penalizacionBajosAciertos || 0) + (m.penalizacionPIG || 0);
            return sum + (m.aportacion || 0) + penalties + (m.premios || 0);
        }, 0) + extraPrizes;

        // Total Gastos for the Peña = Reimbursed sellados (only if Bote option chosen)
        const totalGastos = jornadaMovements.reduce((sum, m) => {
            // Sellado is negative in movement. If isSelladoInCash is TRUE, Peña doesn't pay from Bote now.
            // If isSelladoInCash is FALSE, it's a debt/cost for the Peña bote relative to INITIAL BALANCES.
            return sum + (m.isSelladoInCash ? 0 : Math.abs(m.sellado || 0));
        }, 0);

        const neto = totalIngresos - totalGastos;

        let html = `
            <div class="jornada-nav">
                <button onclick="window.Bote.prevJornada()" ${this.currentJornadaIndex === 0 ? 'disabled' : ''}>← Anterior</button>
                
                <select id="jornada-select" onchange="window.Bote.goToJornada(this.value)" style="padding: 0.6rem 1rem; border-radius: 8px; background: rgba(30, 30, 30, 0.9); color: white; border: 1px solid var(--primary-color); font-weight: bold; cursor: pointer;">
                    ${jornadaNums.map((num, idx) => {
            const j = this.jornadas.find(jor => jor.number === parseInt(num));
            return `<option value="${idx}" ${idx === this.currentJornadaIndex ? 'selected' : ''}>Jornada ${num} - ${j ? j.date : ''}${j && j.noSellado ? ' 🚫' : ''}</option>`;
        }).join('')}
                </select>

                <button onclick="window.Bote.nextJornada()" ${this.currentJornadaIndex === jornadaNums.length - 1 ? 'disabled' : ''}>Siguiente →</button>
            </div>
            
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255, 145, 0, 0.08); border-radius: 8px; border: 1px solid rgba(255, 145, 0, 0.3);">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align:center;">
                    <div><strong style="color: #ff9100; font-size:0.75rem;">CAJA JORNADA (Socios + Premios)</strong><br><span class="positive">${totalIngresos.toFixed(2)}€</span></div>
                    <div><strong style="color: #ff9100; font-size:0.75rem;">GASTOS/REEMBOLSOS (Sellado)</strong><br><span class="negative">${totalGastos.toFixed(2)}€</span></div>
                    <div><strong style="color: #ff9100; font-size:0.75rem;">BALANCE NETO</strong><br><span class="${neto >= 0 ? 'positive' : 'negative'}">${neto.toFixed(2)}€</span></div>
                </div>
                <p style="margin-top: 0.8rem; font-size: 0.75rem; color: #ff9100; text-align: center; opacity: 0.8;">
                    📝 <em>Nota: Caja Jornada incluye aportaciones semanales, penalizaciones y todos los premios (Socio + Dobles).</em>
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
                        <td class="positive" title="Premio acumulado en el Bote Peña">${m.premios.toFixed(2)}€</td>
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
        document.getElementById('config-extra-exento').value = this.config.costeExtraExento !== undefined ? this.config.costeExtraExento : 0.20;
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
        this.config.costeExtraExento = parseFloat(document.getElementById('config-extra-exento').value);
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

    toggleExcelTheme() {
        this.useExcelTheme = !this.useExcelTheme;
        this.render();
    }

    /**
     * Render Excel View (Detailed History matching the legacy spreadsheet)
     */
    renderVistaExcel(movements) {
        const container = document.getElementById('bote-content');
        if (!container) return;

        // Group movements by member
        const memberData = {};
        this.members.forEach(m => {
            memberData[m.id] = {
                member: m,
                name: window.AppUtils.getMemberName(m),
                ganadas: 0,
                perdidas: 0,
                sellados: [],
                boteInicial: 0,
                boteFinal: 0,
                ingresos: 0,
                gastos: 0,
                jornadaCosts: {},
                jornadaHits: {}
            };
        });

        // Calculate Initial Botes correctly (since calculateMovements starts over)
        const initialBalances = {
            'Alvaro': 15, 'Carlos': 8.5, 'David Buzón': 56.29, 'Edu': 2, 'Emilio': 41.13,
            'F. Lozano': 2, 'F. Ramirez': 42.91, 'Heradio': 10.22, 'JA Valdivieso': 2.00,
            'Valdi': 2.00, 'Javi Mora': 57.88, 'Juan Antonio': 17.90, 'Juanan': 17.90, 'Juanjo': -6.1, 'Luismi': 24.75,
            'Marcelo': 0, 'Martin': 15.1, 'Rafa': 4.45, 'Ramon': 2, 'Raul Romera': 8.95,
            'Samuel': 1.5
        };
        const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        Object.values(memberData).forEach(md => {
            const mName = md.name;
            const entry = Object.entries(initialBalances).find(([k, v]) => norm(k) === norm(mName) || norm(mName).includes(norm(k)) || norm(k).includes(norm(mName)));
            if (entry) {
                md.boteInicial = entry[1];
                md.ingresos += entry[1]; // Initially counts as income in the sum
            }
        });

        const jListPlayed = this.jornadas.filter(j =>
            (j.matches || []).some(m => String(m.result || '').trim().toLowerCase() !== '' && String(m.result || '').trim().toLowerCase() !== 'por definir')
        ).sort((a, b) => a.number - b.number);

        jListPlayed.forEach(j => {
            // Calculate winners and losers
            this.members.forEach(m => {
                const md = memberData[m.id];
                const isWin = this.wasWinnerOfJornada(m.id, j);
                const isLoss = this.wasLoserOfJornada(m.id, j);
                if (isWin) md.ganadas++;
                if (isLoss) {
                    md.perdidas++;
                    const sustId = j.sustitutoSellado;
                    if (sustId) {
                        if (String(m.id) === String(sustId)) md.sellados.push(`J${j.number}`);
                    } else {
                        md.sellados.push(`J${j.number}`);
                    }
                } else if (j.sustitutoSellado && String(m.id) === String(j.sustitutoSellado)) {
                    md.sellados.push(`J${j.number}`);
                } else if (j.number === 1 && String(m.name).toLowerCase().includes('luismi')) {
                    // Hardcoded J1 exception mapped from legacy logic
                    md.sellados.push(`J1`);
                }
            });
        });

        movements.forEach(mov => {
            const md = memberData[mov.memberId];
            if (!md) return;

            md.boteFinal = mov.boteAcumulado;

            if (mov.type === 'jornada') {
                const manual = mov.ingresosManual || 0;
                const prizes = mov.premios || 0;
                const extraPrizes = (mov.memberId === this.members[0].id) ? (mov.extraPrizes || 0) : 0;
                const gastos = mov.totalGastos || 0;

                md.ingresos += manual + prizes;
                md.gastos += gastos;

                md.jornadaCosts[mov.jornadaNum] = gastos;
                md.jornadaHits[mov.jornadaNum] = mov.aciertos;
            } else if (mov.type === 'reparto') {
                md.gastos += Math.abs(mov.neto);
            } else if (mov.type === 'cierre_vuelta') {
                md.gastos += Math.abs(mov.neto);
            }
        });

        const t = this.useExcelTheme;

        // Theme Definitions
        const hBg1 = t ? '#1E8449' : 'var(--bote-header-bg-start, #ff9100)';
        const hBg2 = t ? '#1E8449' : 'var(--bote-header-bg-end, #ff6600)';
        const subH1 = t ? '#27AE60' : '#2a2a2a';
        const subH2 = t ? '#27AE60' : '#333';
        const txtMain = t ? '#000' : '#fff';
        const txtJ = t ? '#fff' : '#ff9100';

        const bgSellados = t ? '#fff' : '#1a1a1a';
        const bgName = t ? '#FEF9E7' : '#222';
        const bgPeach = t ? '#FADBD8' : 'transparent';
        const bgPurple = t ? '#E8DAEF' : 'transparent';
        const bgBlueRow = t ? '#D6EAF8' : 'rgba(40,40,40,0.8)';

        const cG = t ? '#117a65' : '#4caf50';
        const cP = t ? '#c0392b' : '#f44336';

        const borderC = t ? '#bdc3c7' : '#555';

        // Start HTML building
        let html = `
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <p style="margin:0; opacity:0.8;">Réplica de ordenamiento y matriz de la hoja de cálculo de gestión histórica.</p>
            <button class="btn-action" style="background: ${t ? '#2C3E50' : '#1E8449'}; color: white; padding: 6px 12px; border-radius: 4px; border:none; cursor:pointer;" onclick="window.Bote.toggleExcelTheme()">
                ${t ? '🌙 Cambiar a Tema Oscuro' : '🟢 Cambiar a Colores Excel'}
            </button>
        </div>
        <div style="overflow-x: auto; max-width: 100%; border-radius: 8px; background: ${t ? '#ecf0f1' : 'rgba(20,20,20,0.9)'}; padding: 10px; border: 1px solid rgba(255,145,0,0.3);">
            <table class="bote-table" style="min-width: 2000px; font-size: 0.85rem; border-collapse: separate; border-spacing: 0;">
                <thead>
                    <tr style="background: ${hBg1}; color: white;">
                        <!-- Static Columns Header -->
                        <th style="position: sticky; top:0; left: 0; z-index: 30; background: ${hBg1};">Sellados</th>
                        <th style="position: sticky; top:0; left: 100px; z-index: 30; background: ${hBg1};">G</th>
                        <th style="position: sticky; top:0; left: 140px; z-index: 30; background: ${hBg1};">P</th>
                        <th style="position: sticky; top:0; left: 180px; z-index: 30; background: ${hBg1}; border-right: 2px solid ${t ? '#117a65' : '#fff'}; min-width: 150px;">Nombre</th>
                        <th style="position: sticky; top:0; z-index: 20; background: ${hBg1};">Bote Inicial</th>
                        <th style="position: sticky; top:0; z-index: 20; background: ${hBg1};">SUMA</th>
                        <th style="position: sticky; top:0; z-index: 20; background: ${hBg1};">RESTA</th>
                        <th style="position: sticky; top:0; z-index: 20; background: ${hBg1}; border-right: 2px solid ${t ? '#117a65' : '#fff'};">Bote Final</th>
        `;

        // Iteration for Jornadas Header Dates
        jListPlayed.forEach(j => {
            const d = window.AppUtils.parseDate(j.date);
            const dStr = isNaN(d) ? '?' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
            html += `<th colspan="2" style="position: sticky; top:0; z-index: 20; background: ${hBg2}; border-right: 1px solid ${borderC}; text-align: center;">${dStr}</th>`;
        });

        html += `
                    </tr>
                    <tr style="background: ${subH1};">
                        <th style="position: sticky; top: 40px; left: 0; z-index: 29; background: ${subH1};"></th>
                        <th style="position: sticky; top: 40px; left: 100px; z-index: 29; background: ${subH1};"></th>
                        <th style="position: sticky; top: 40px; left: 140px; z-index: 29; background: ${subH1};"></th>
                        <th style="position: sticky; top: 40px; left: 180px; z-index: 29; background: ${subH1}; border-right: 2px solid ${borderC};"></th>
                        <th style="position: sticky; top: 40px; z-index: 10; background: ${subH1};"></th>
                        <th style="position: sticky; top: 40px; z-index: 10; background: ${subH1};"></th>
                        <th style="position: sticky; top: 40px; z-index: 10; background: ${subH1};"></th>
                        <th style="position: sticky; top: 40px; z-index: 10; background: ${subH1}; border-right: 2px solid ${borderC};"></th>
        `;

        // Sub Headers for Jornadas
        jListPlayed.forEach(j => {
            html += `
                        <th style="position: sticky; top: 40px; z-index: 10; background: ${subH2}; color: ${txtJ}; text-align: center;">J${j.number}</th>
                        <th style="position: sticky; top: 40px; z-index: 10; background: ${subH2}; color: ${txtJ}; border-right: 1px solid ${borderC}; text-align: center;">Ac.</th>
            `;
        });

        html += `
                    </tr>
                </thead>
                <tbody>
        `;

        // Data Rows
        const excelOrder = [
            'Alvaro', 'Carlos', 'David Buzón', 'Edu', 'Emilio',
            'F. Lozano', 'F. Ramirez', 'Heradio', 'JA Valdivieso', 'Valdi',
            'Javi Mora', 'Juanan', 'Juan Antonio', 'Juanjo', 'Luismi', 'Marcelo',
            'Martin', 'Rafa', 'Ramon', 'Raul Romera', 'Samuel'
        ];

        const getOrderIdx = (name) => {
            const nName = norm(name);
            const idx = excelOrder.findIndex(o => norm(o) === nName || nName.includes(norm(o)) || norm(o).includes(nName));
            return idx !== -1 ? idx : 999;
        };

        Object.values(memberData).sort((a, b) => getOrderIdx(a.name) - getOrderIdx(b.name)).forEach(md => {
            const sFinal = md.boteFinal.toFixed(2);
            let colorSaldo = parseFloat(sFinal) < 0 ? cP : (parseFloat(sFinal) > 0 ? cG : (t ? '#000' : '#fff'));
            if (t) colorSaldo = '#000'; // En excel los saldos son negros normales

            const cellTextCol = t ? '#000' : '#fff';

            html += `
                    <tr style="background: ${bgBlueRow}; color: ${txtMain};">
                        <td style="position: sticky; left: 0; z-index: 5; background: ${bgSellados}; font-size:0.75rem; color:${t ? '#555' : '#888'}; border-bottom: 1px solid ${borderC};">${md.sellados.join(', ')}</td>
                        <td style="position: sticky; left: 100px; z-index: 5; background: ${bgSellados}; font-weight: bold; color:${cG}; border-bottom: 1px solid ${borderC};">${md.ganadas}</td>
                        <td style="position: sticky; left: 140px; z-index: 5; background: ${bgSellados}; font-weight: bold; color:${cP}; border-bottom: 1px solid ${borderC};">${md.perdidas}</td>
                        <td style="position: sticky; left: 180px; z-index: 5; background: ${bgName}; font-weight: bold; border-right: 2px solid ${borderC}; border-bottom: 1px solid ${borderC}; color: ${cellTextCol};">${md.name}</td>
                        
                        <td style="text-align: right; background: ${bgPeach}; color: ${cellTextCol}; border-bottom: 1px solid ${borderC};">${md.boteInicial.toFixed(2)}</td>
                        <td style="text-align: right; background: ${bgPeach}; color:${cG}; border-bottom: 1px solid ${borderC};">${md.ingresos.toFixed(2)}</td>
                        <td style="text-align: right; background: ${bgPeach}; color:${cP}; border-bottom: 1px solid ${borderC};">${md.gastos.toFixed(2)}</td>
                        <td style="text-align: right; border-right: 2px solid ${borderC}; font-weight:bold; background: ${bgPurple}; color:${colorSaldo}; border-bottom: 1px solid ${borderC};">${sFinal}</td>
            `;

            jListPlayed.forEach(j => {
                const cost = md.jornadaCosts[j.number] !== undefined ? md.jornadaCosts[j.number].toFixed(2) : '-';
                const hits = md.jornadaHits[j.number] !== undefined ? md.jornadaHits[j.number] : '-';

                let textColor = cost !== '-' && parseFloat(cost) > 0 ? cP : (t ? '#555' : '#9e9e9e');
                if (cost === '0.00') textColor = (t ? '#555' : '#9e9e9e');

                html += `
                        <td style="text-align: right; color: ${textColor}; border-bottom: 1px solid ${borderC};">${cost !== '-' ? cost : ''}</td>
                        <td style="text-align: center; border-right: 1px solid ${borderC}; color: ${txtJ}; font-weight: bold; border-bottom: 1px solid ${borderC}; background: ${t ? '#fff' : 'transparent'};">${hits !== '-' ? hits : ''}</td>
                `;
            });



            html += `</tr>`;
        });

        // Totals Footer Rows
        html += `<tr style="background: transparent;"><td colspan="100%" style="height: 15px; border: none;"></td></tr>`;

        // Filas del Cuadrante Inferior:
        const labels = ['TOTAL RECAUDACIÓN', 'GASTO TOTAL SELLADO', 'PREMIOS JORNADA', 'BOTE JORNADA'];

        const footColorsT = ['#FADBD8', '#FADBD8', '#FCF3CF', '#D5F5E3']; // Colores Excel (peach, peach, yellow, green)
        const footTextT = ['#d35400', '#c0392b', '#d4ac0d', '#27ae60'];

        const footColorsFalse = ['#222', '#222', '#222', '#222']; // Colores Dark Mode
        const footTextFalse = ['#fff', '#f44336', '#4caf50', '#ff9100'];

        labels.forEach((label, i) => {
            const rowBg = t ? footColorsT[i] : 'rgba(40,40,40,1)';
            const stickyBg = t ? footColorsT[i] : '#222';
            const textC = t ? footTextT[i] : footTextFalse[i];

            html += `<tr style="background: ${rowBg};">
                <td colspan="7" style="position: sticky; left: 0; z-index: 5; text-align: right; font-weight: bold; color: ${textC}; background: ${stickyBg}; border-right: 2px solid ${borderC}; border-bottom: 2px solid ${borderC};">${label}</td>
                <td style="border-right: 2px solid ${borderC}; background: ${stickyBg}; border-bottom: 2px solid ${borderC};"></td>`;

            jListPlayed.forEach(j => {
                let val = '';
                const jDate = window.AppUtils.parseDate(j.date);
                const costCol = this.getHistoricalPrice('costeColumna', jDate);
                const costDob = this.getHistoricalPrice('costeDobles', jDate);

                if (label === 'TOTAL RECAUDACIÓN') {
                    let rec = 0;
                    Object.values(memberData).forEach(md => {
                        if (md.jornadaCosts[j.number] !== undefined) rec += md.jornadaCosts[j.number];
                    });
                    val = rec.toFixed(2);
                }
                else if (label === 'GASTO TOTAL SELLADO') {
                    const numSocios = this.members.length;
                    const numDobles = movements.filter(m => parseInt(m.jornadaNum) === j.number && m.jugaDobles).length;
                    const effDobles = (j.number === 1 && numDobles === 0) ? 1 : numDobles;
                    const gasto = (numSocios * costCol) + (effDobles * costDob);
                    val = gasto > 0 ? `-${gasto.toFixed(2)}` : '0.00';
                }
                else if (label === 'PREMIOS JORNADA') {
                    let prem = 0;
                    movements.filter(m => parseInt(m.jornadaNum) === j.number && m.type === 'jornada').forEach(m => {
                        prem += (m.premios || 0);
                        if (String(m.memberId) === String(this.members[0].id)) {
                            prem += (m.extraPrizes || 0);
                        }
                    });
                    val = prem > 0 ? `+${prem.toFixed(2)}` : '0.00';
                }
                else if (label === 'BOTE JORNADA') {
                    // Recaudación - Gasto + Premios
                    let rec = 0;
                    Object.values(memberData).forEach(md => {
                        if (md.jornadaCosts[j.number] !== undefined) rec += md.jornadaCosts[j.number];
                    });

                    const numSocios = this.members.length;
                    const numDobles = movements.filter(m => parseInt(m.jornadaNum) === j.number && m.jugaDobles).length;
                    const effDobles = (j.number === 1 && numDobles === 0) ? 1 : numDobles;
                    const gasto = (numSocios * costCol) + (effDobles * costDob);

                    let prem = 0;
                    movements.filter(m => parseInt(m.jornadaNum) === j.number && m.type === 'jornada').forEach(m => {
                        prem += (m.premios || 0);
                        if (String(m.memberId) === String(this.members[0].id)) {
                            prem += (m.extraPrizes || 0);
                        }
                    });

                    const saldo = rec - gasto + prem;
                    val = saldo > 0 ? `+${saldo.toFixed(2)}` : saldo.toFixed(2);
                }

                const cColor = parseFloat(val) < 0 ? '#f44336' : (parseFloat(val) > 0 ? '#4caf50' : '#888');

                html += `
                    <td style="text-align: right; font-weight: bold; color: ${cColor};">${val}</td>
                    <td style="border-right: 1px solid #555; background: #333;"></td>
                `;
            });
            html += `</tr>`;
        });

        html += `
                </tbody>
            </table>
        </div>
        `;

        container.innerHTML = html;
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
                    <div>J${j.number}${j.hasPig ? ' 🐷' : ''}${j.noSellado ? ' 🚫' : ''}</div>
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
        const migrationDone = localStorage.getItem('bote_maintenance_v23'); // Bumped to v23 to force re-run
        if (migrationDone) return;

        console.log('Running maintenance migration v23 (Bulk Prize Sync)...');

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
                { num: 7, hits: 13, val: 920.09 }, // UPDATED from 902.93 to 920.09 (Total prize correction)
                { num: 7, hits: 12, val: 16.16 },
                { num: 7, hits: 11, val: 1.83 },
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

            const marks = ['v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19', 'v20', 'v21', 'v22', 'v23'];
            marks.forEach(m => localStorage.setItem(`bote_maintenance_${m}`, 'true'));

            console.log('Migration v23 effective!');
            await this.loadData();
            this.render();
        } catch (e) { console.error('Migration v23 failed:', e); }
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
                        <td style="font-weight:bold; color: #ff1744; text-shadow: 0 0 8px rgba(255,23,68,0.4);">${r.totalAmount.toFixed(2)}€</td>
                        <td style="font-size: 0.85rem;">
                            ${isActividad ? '-' : `Reparto individual: ${(r.totalAmount / this.members.length).toFixed(2)}€`}
                        </td>
                        <td>
                           <div style="display:flex; gap:5px;">
                               <button onclick="window.Bote.openRepartoModal('${r.id}')" style="background: rgba(33, 150, 243, 0.1); color: #2196f3; border: 1px solid #2196f3; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Editar</button>
                               <button onclick="window.Bote.deleteReparto('${r.id}')" style="background: rgba(255, 23, 68, 0.15); color: #ff1744; border: 1px solid #ff1744; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Eliminar</button>
                           </div>
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

    openRepartoModal(repartoId = null) {
        // Check current balance
        const totalBoteCalculado = parseFloat(document.getElementById('total-bote').textContent);

        let reparto = null;
        if (repartoId) {
            reparto = this.repartos.find(r => r.id === repartoId);
        }

        const titleEl = document.getElementById('modal-reparto-title');
        const idInp = document.getElementById('reparto-id');
        const fechaInp = document.getElementById('reparto-fecha');
        const importeInp = document.getElementById('reparto-importe');
        const tipoInp = document.getElementById('reparto-tipo');
        const descInp = document.getElementById('reparto-descripcion');

        if (reparto) {
            titleEl.textContent = 'Editar Reparto de Ganancias';
            idInp.value = reparto.id;
            fechaInp.value = reparto.date;
            importeInp.value = reparto.totalAmount;
            tipoInp.value = reparto.type;
            descInp.value = reparto.description;
            // The max import for editing is current balance + amount of THIS reparto (since we would "return" it temporarily)
            importeInp.max = totalBoteCalculado + reparto.totalAmount;
            importeInp.placeholder = `Máximo disponible: ${(totalBoteCalculado + reparto.totalAmount).toFixed(2)}€`;
        } else {
            titleEl.textContent = 'Realizar Reparto de Ganancias';
            idInp.value = '';
            fechaInp.valueAsDate = new Date();
            importeInp.value = '';
            tipoInp.value = 'socios';
            descInp.value = '';
            importeInp.max = totalBoteCalculado;
            importeInp.placeholder = `Máximo: ${totalBoteCalculado.toFixed(2)}€`;
        }

        // Reset/Fill list of members settings
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

            const savedChoice = (reparto && reparto.memberChoices) ? (reparto.memberChoices[m.id] || 'bote') : 'bote';

            div.innerHTML = `
                <span style="font-size: 0.85rem; font-weight: bold;">${m.name}</span>
                <select name="choice_${m.id}" style="font-size: 0.8rem; padding: 2px 4px; background: #222; color: #fff; border: 1px solid #444;">
                    <option value="bote" ${savedChoice === 'bote' ? 'selected' : ''}>Al Bote</option>
                    <option value="cash" ${savedChoice === 'cash' ? 'selected' : ''}>En Efectivo</option>
                </select>
            `;
            listDiv.appendChild(div);
        });

        this.toggleRepartoType(tipoInp.value);
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
        const totalBoteCalculado = parseFloat(document.getElementById('total-bote').textContent);
        const editingId = document.getElementById('reparto-id').value;
        const importe = parseFloat(document.getElementById('reparto-importe').value);
        const type = document.getElementById('reparto-tipo').value;
        const date = document.getElementById('reparto-fecha').value;
        const description = document.getElementById('reparto-descripcion').value;

        if (isNaN(importe) || importe <= 0) {
            alert('Importe no válido.');
            return;
        }

        // Validation against balance
        let existingAmount = 0;
        if (editingId) {
            const existing = this.repartos.find(r => r.id === editingId);
            if (existing) existingAmount = existing.totalAmount;
        }

        if (importe > (totalBoteCalculado + existingAmount)) {
            alert('El importe del reparto no puede superar el saldo disponible en el Bote de la Peña.');
            return;
        }

        const choices = {};
        if (type === 'socios') {
            const selects = document.querySelectorAll('#reparto-miembros-list select');
            selects.forEach(s => {
                const mId = s.name.replace('choice_', '');
                choices[mId] = s.value;
            });
        }

        const reparto = {
            id: editingId || ('rep_' + Date.now()),
            date: date,
            totalAmount: importe,
            type: type,
            description: description,
            memberChoices: choices,
            updatedAt: new Date().toISOString()
        };
        if (!editingId) reparto.createdAt = reparto.updatedAt;

        try {
            await window.DataService.save('repartos', reparto);

            if (editingId) {
                const idx = this.repartos.findIndex(r => r.id === editingId);
                if (idx > -1) this.repartos[idx] = reparto;
            } else {
                this.repartos.push(reparto);
            }

            this.closeModal('modal-reparto');
            this.render();
            alert(editingId ? 'Reparto actualizado correctamente.' : 'Reparto registrado correctamente.');
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

    renderVistaPremiosDobles(movements) {
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <h2 style="margin:0; color: #ff9100;">🏆 Historial de Premios (Columnas Dobles)</h2>
            </div>
            <div style="overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255, 145, 0, 0.3); background: rgba(0,0,0,0.2);">
                <table class="bote-table">
                    <thead>
                        <tr>
                            <th>Jornada</th>
                            <th>Fecha</th>
                            <th>Columna Extra</th>
                            <th>Aciertos</th>
                            <th>Premio Ganado</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const winningExtras = [];
        this.jornadas.forEach(j => {
            const extras = this.pronosticosExtra ? this.pronosticosExtra.filter(p => String(p.jId || p.jornadaId) === String(j.id) || String(p.jId || p.jornadaId) === String(j.number)) : [];
            const jDate = window.AppUtils.parseDate(j.date);
            const officialResults = (j.matches || []).map(m => m.result);
            const legacyPrizes = j.prizes || {};

            extras.forEach(p => {
                const selection = p.selection || p.forecast;
                if (!selection) return;

                const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
                const isReduced = p.isReduced || (doubleCount === 7);
                const ev = window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced });

                let prize = 0;
                if (ev.breakdown) {
                    Object.keys(ev.breakdown).forEach(h => {
                        if (ev.breakdown[h] > 0 && legacyPrizes[h]) {
                            prize += ev.breakdown[h] * legacyPrizes[h];
                        }
                    });
                } else {
                    if (ev.hits >= (j.minHitsToWin || 10) && legacyPrizes[ev.hits]) {
                        prize = legacyPrizes[ev.hits];
                    }
                }

                if (prize > 0) {
                    winningExtras.push({
                        jNum: j.number,
                        jId: j.id,
                        date: j.date,
                        memberId: p.mId || p.memberId,
                        memberName: window.AppUtils.getMemberName(this.members.find(m => String(m.id) === String(p.mId || p.memberId))),
                        hits: ev.hits,
                        prize: prize,
                        isReduced: isReduced,
                        breakdown: ev.breakdown
                    });
                }
            });
        });

        if (winningExtras.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.6;">No hay premios registrados en columnas de dobles.</td></tr>`;
        } else {
            winningExtras.sort((a, b) => b.jNum - a.jNum).forEach(e => {
                const rowStyle = e.isReduced ? 'background: rgba(103, 58, 183, 0.05); border-left: 4px solid #673ab7;' : 'background: rgba(255, 145, 0, 0.05);';
                html += `
                    <tr style="${rowStyle}">
                        <td style="font-weight:bold;">J${e.jNum}</td>
                        <td style="opacity:0.8;">${e.date}</td>
                        <td><span style="color: #ff9100; font-weight:bold;">${typeof e.memberName === 'object' ? 'Socio' : e.memberName}</span></td>
                        <td>
                            <span style="background: #e65100; color:white; padding: 2px 8px; border-radius: 10px; font-weight:bold;">${e.hits} hits</span>
                            ${e.isReduced ? `<span style="background: #673ab7; color:white; padding: 2px 8px; border-radius: 10px; font-size:0.7rem; cursor:pointer;" onclick="window.Bote.showReducedBreakdown('${e.memberId}', '${e.jId}')">📋 Ver Reducción</span>` : ''}
                        </td>
                        <td class="positive" style="font-size:1.1rem; font-weight:900;">+ ${e.prize.toFixed(2)}€</td>
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

    /**
     * Render Evolution View (Jornada a Jornada)
     */
    renderVistaEvolucion(movements) {
        const container = document.getElementById('bote-content');
        container.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h2 style="margin:0; color: var(--primary-color);">Evolución del Bote de la Peña</h2>
                <p style="opacity: 0.8;">Histórico del saldo y movimientos jornada a jornada</p>
            </div>
        `;

        // Group movements by Jornada Number
        const jornadasMap = {};

        // Initialize map with all played jornadas
        this.jornadas.forEach(j => {
            // Only count if played
            const played = (j.matches || []).some(m => m.result && m.result !== '');
            if (played) {
                jornadasMap[j.number] = {
                    number: j.number,
                    date: j.date,
                    noSellado: j.noSellado,
                    boteInicial: 0,
                    aportaciones: 0,
                    penalizaciones: 0,
                    costeQuinielas: 0,
                    premios: 0,
                    boteFinal: 0,
                    repartos: 0
                };
            }
        });

        // Add movements per jornada
        movements.forEach(m => {
            if (m.type === 'jornada' && jornadasMap[m.jornadaNum]) {
                const jData = jornadasMap[m.jornadaNum];
                jData.aportaciones += (m.aportacion || 0);
                jData.penalizaciones += (m.penalizacionUnos || 0) + (m.penalizacionBajosAciertos || 0) + (m.penalizacionPIG || 0);
                // Note: m.premios are prizes kept by member (usually). Wait, in current model prizes > 0 make member EXEMPT from paying next time, but prizes go to the member? No, "peñaIn" includes prizes?
                // Let's re-read calculateAllMovements.
                // pennaIn: costs.aportacion + penalties + prizes + extraPrizes.
                // So prizes go into the FUND.
                jData.premios += (m.premios || 0) + (m.extraPrizes || 0);
            }
        });

        // We iterate jornadas chronologically to update Bote
        let currentBote = this.config.boteInicial || 0;
        const evolutionData = [];

        // Sort jornadas
        const sortedJornadas = Object.values(jornadasMap).sort((a, b) => {
            const numA = parseInt(a.number);
            const numB = parseInt(b.number);
            return numA - numB;
        });

        sortedJornadas.forEach((jData, idx) => {
            jData.boteInicial = currentBote;

            const jDate = window.AppUtils.parseDate(jData.date);
            const jNum = parseInt(jData.number);
            const jornadaObj = this.jornadas.find(j => parseInt(j.number) === jNum);

            if (jornadaObj && jornadaObj.noSellado) {
                jData.costeQuinielas = 0;
            } else {
                const costCol = this.getHistoricalPrice('costeColumna', jDate);
                const costDob = this.getHistoricalPrice('costeDobles', jDate);
                const numSocios = this.members.length;

                // Doubles Count - Count members who played doubles columns in this jornada
                const numDobles = movements.filter(m => parseInt(m.jornadaNum) === jNum && m.jugaDobles).length;

                // Fallback for J1 if no record found (ensure at least 1)
                const effectiveNumDobles = (jNum === 1 && numDobles === 0) ? 1 : numDobles;

                jData.costeQuinielas = (numSocios * costCol) + (effectiveNumDobles * costDob);
            }

            // Repartos Logic - Use index-based previous jornada to avoid gaps and duplicate counting
            const prevJornada = idx > 0 ? sortedJornadas[idx - 1] : null;
            const prevDate = prevJornada ? (window.AppUtils.parseDate(prevJornada.date) || new Date(0)) : new Date(0);
            const currDate = jDate || new Date(0);

            const repartosInPeriod = this.repartos.filter(r => {
                const rDate = new Date(r.date);
                if (isNaN(rDate.getTime())) return false;

                // If it's the first jornada, include all previous repartos
                if (idx === 0) {
                    return rDate <= currDate;
                }
                // Otherwise, include repartos between previous and current jornada
                return rDate > prevDate && rDate <= currDate;
            });

            jData.repartos = repartosInPeriod.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

            // Calculate Manual Ingresos for this Jornada
            const manualIngresosJ = movements
                .filter(m => parseInt(m.jornadaNum) === jNum)
                .reduce((sum, m) => sum + (m.ingresosManual || 0), 0);

            jData.ingresosExtra = manualIngresosJ;

            const ingresosJ = jData.aportaciones + jData.penalizaciones + jData.premios + jData.ingresosExtra;
            const gastosJ = jData.costeQuinielas + jData.repartos;

            jData.boteFinal = currentBote + ingresosJ - gastosJ;
            currentBote = jData.boteFinal;

            evolutionData.push(jData);
        });

        // Create Table
        const tableContainer = document.createElement('div');
        tableContainer.style.overflowX = 'auto';
        tableContainer.style.borderRadius = '12px';
        tableContainer.style.border = '1px solid var(--glass-border)';
        tableContainer.style.background = 'rgba(0,0,0,0.2)';

        const table = document.createElement('table');
        table.className = 'bote-table';
        table.style.minWidth = '1200px';

        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        const thConcept = document.createElement('th');
        thConcept.textContent = 'CONCEPTO / JORNADA';
        thConcept.style.minWidth = '220px';
        thConcept.style.position = 'sticky';
        thConcept.style.left = '0';
        thConcept.style.zIndex = '20';
        thConcept.style.background = 'var(--bote-header-bg-start, #ff9100)';
        thConcept.style.color = '#333';
        trHead.appendChild(thConcept);

        evolutionData.forEach(j => {
            const th = document.createElement('th');
            th.innerHTML = `<div style="font-size:1.1em;">J${j.number}${j.noSellado ? ' 🚫' : ''}</div><div style="font-size:0.75em; font-weight:normal; opacity:0.8;">${j.date}</div>`;
            th.style.textAlign = 'center';
            th.style.minWidth = '100px';
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        const createRow = (label, key, isCurrency = true, colorClass = '', isBold = false) => {
            const tr = document.createElement('tr');
            const tdLabel = document.createElement('td');
            tdLabel.textContent = label;
            tdLabel.style.fontWeight = 'bold';
            tdLabel.style.position = 'sticky';
            tdLabel.style.left = '0';
            tdLabel.style.background = 'var(--card-bg, #1a1a1a)';
            tdLabel.style.color = '#333';
            tdLabel.style.zIndex = '15';
            tdLabel.style.borderRight = '2px solid rgba(255,145,0,0.3)';
            tr.appendChild(tdLabel);

            evolutionData.forEach(j => {
                const td = document.createElement('td');
                const val = j[key];
                td.textContent = isCurrency ? (val !== 0 ? val.toFixed(2) + ' €' : '-') : val;
                td.style.textAlign = 'center';
                if (colorClass) td.classList.add(colorClass);
                // Manual style because simple add class might not work with styles definied in HTML head if scoping issues, but bote.html has global styles.
                if (colorClass === 'positive') td.style.color = '#4caf50';
                if (colorClass === 'negative') td.style.color = '#f44336';

                if (isBold) {
                    td.style.fontWeight = '900';
                    td.style.fontSize = '1.1em';
                    td.style.color = 'var(--primary-color, #ff9100)';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        };

        createRow('Bote Inicial', 'boteInicial');
        createRow('(+) Aportaciones Socios', 'aportaciones', true, 'positive');
        createRow('(+) Ingresos Extra (Bizum)', 'ingresosExtra', true, 'positive');
        createRow('(+) Penalizaciones', 'penalizaciones', true, 'positive');
        createRow('(+) Premios Cobrados', 'premios', true, 'positive');
        createRow('(-) Coste Quinielas', 'costeQuinielas', true, 'negative');
        createRow('(-) Repartos', 'repartos', true, 'negative');
        createRow('(=) BOTE FINAL', 'boteFinal', true, '', true);

        table.appendChild(tbody);
        tableContainer.appendChild(table);
        container.appendChild(tableContainer);
    }
    /**
     * Open Modal for Managing Jornada Settings and Reductions
     */
    openGestionJornadasModal() {
        const modal = document.getElementById('modal-gestion-jornada');
        const select = document.getElementById('gestion-jornada-select');
        const content = document.getElementById('gestion-jornada-details');

        // Populate Select
        select.innerHTML = '<option value="">Selecciona una jornada...</option>';
        [...this.jornadas].sort((a, b) => b.number - a.number).forEach(j => {
            select.innerHTML += `<option value="${j.id}">Jornada ${j.number} (${j.date})</option>`;
        });

        // Reset UI
        content.style.display = 'none';
        document.getElementById('gestion-no-sellado').checked = false;
        document.getElementById('gestion-sustituto').innerHTML = '<option value="">-- Sin sustituto --</option>';

        // Populate Member Select for Substitute
        const subSelect = document.getElementById('gestion-sustituto');
        this.members.sort((a, b) => a.name.localeCompare(b.name)).forEach(m => {
            subSelect.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        });

        // Event Listener for Change
        select.onchange = (e) => this.loadGestionJornadaDetails(e.target.value);

        modal.style.display = 'flex';
    }

    loadGestionJornadaDetails(jornadaId) {
        const content = document.getElementById('gestion-jornada-details');
        if (!jornadaId) {
            content.style.display = 'none';
            return;
        }

        const jornada = this.jornadas.find(j => String(j.id) === String(jornadaId));
        if (!jornada) return;

        // Settings Only
        document.getElementById('gestion-no-sellado').checked = !!jornada.noSellado;
        const subSelect = document.getElementById('gestion-sustituto');
        subSelect.value = jornada.sustitutoSellado || "";

        content.style.display = 'block';
    }

    async saveJornadaSettings() {
        const jId = document.getElementById('gestion-jornada-select').value;
        if (!jId) return;

        const noSellado = document.getElementById('gestion-no-sellado').checked;
        const sustituto = document.getElementById('gestion-sustituto').value;

        try {
            // Need to merge with existing jornada data to avoid overwriting everything else?
            // DataService.save usually overwrites or merges depending on implementation.
            // Assuming we must send FULL object or partial update if supported. 
            // Standard Firestore 'save' usually means set() with merge:true or similar.
            // Let's get the full object first.
            const jornada = this.jornadas.find(j => String(j.id) === String(jId));
            if (!jornada) return;

            const updateData = {
                ...jornada,
                noSellado: noSellado,
                sustitutoSellado: sustituto || null
            };

            await window.DataService.save('jornadas', updateData);

            // Update local state
            const idx = this.jornadas.findIndex(j => j.id === jId);
            if (idx !== -1) this.jornadas[idx] = updateData;

            alert('Configuración de jornada guardada correctamente.');
            this.render(); // Re-render to reflect changes
        } catch (e) {
            console.error(e);
            alert('Error al guardar configuración de jornada.');
        }
    }

    // --- NEW: PENALIZACIONES DE CLASIFICACIÓN (CIERRES VUELTA) ---

    openCierreVueltaModal() {
        const modal = document.getElementById('modal-cierre-vuelta');
        if (modal) modal.style.display = 'block';

        // Popule list of journeys
        const selectJ = document.getElementById('cierre-jornada-id');
        if (selectJ) {
            selectJ.innerHTML = '';
            this.jornadas.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j.id;
                const d = window.AppUtils.parseDate(j.date);
                const dStr = isNaN(d) ? '' : d.toLocaleDateString();
                opt.textContent = `Jornada ${j.number}` + (dStr ? ` (${dStr})` : '');
                selectJ.appendChild(opt);
            });
        }

        // Set date to today
        const fechaInput = document.getElementById('cierre-fecha');
        if (fechaInput) fechaInput.valueAsDate = new Date();

        this.showNuevaPenalizacionVueltaForm();
    }

    showNuevaPenalizacionVueltaForm() {
        const panelNueva = document.getElementById('panel-nueva-penalizacion');
        const panelHist = document.getElementById('panel-historico-penalizaciones');
        const preview = document.getElementById('preview-cierre-container');

        if (panelNueva) panelNueva.style.display = 'block';
        if (panelHist) panelHist.style.display = 'none';
        if (preview) preview.style.display = 'none';
    }

    loadHistoricoPenalizacionesVuelta() {
        const panelNueva = document.getElementById('panel-nueva-penalizacion');
        const panelHist = document.getElementById('panel-historico-penalizaciones');

        if (panelNueva) panelNueva.style.display = 'none';
        if (panelHist) panelHist.style.display = 'block';

        const content = document.getElementById('historico-cierre-content');
        if (!content) return;

        if (!this.cierresVuelta || this.cierresVuelta.length === 0) {
            content.innerHTML = '<p>No hay penalizaciones registradas.</p>';
            return;
        }

        let html = '<table class="detail-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Jornada Límite</th><th>Total Retenido</th><th>Acciones</th></tr></thead><tbody>';

        this.cierresVuelta.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(c => {
            const total = Object.values(c.penalizaciones || {}).reduce((sum, v) => sum + v, 0);
            const d = window.AppUtils.parseDate(c.date);
            const dStr = isNaN(d) ? c.date : d.toLocaleDateString();

            html += `<tr>
                <td>${dStr}</td>
                <td>${c.tipo === 'primera_vuelta' ? 'Primera Vuelta' : 'Fin Temporada'}</td>
                <td>J${c.jornadaNum}</td>
                <td><span style="color:#f44336; font-weight:bold;">${total.toFixed(2)} €</span></td>
                <td><button class="btn-action" style="background:#f44336;" onclick="window.Bote.deleteCierreVuelta('${c.id}')">Eliminar</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        content.innerHTML = html;
    }

    async deleteCierreVuelta(id) {
        if (!confirm('¿Estás seguro de eliminar este registro? Al eliminarlo, se reintegrarán automáticamente todas las penalizaciones a los botes de los socios correspondientes.')) return;
        try {
            await window.DataService.delete('cierres_vuelta', id);
            this.cierresVuelta = this.cierresVuelta.filter(c => c.id !== id);
            this.loadHistoricoPenalizacionesVuelta();
            this.render();
            alert('Registro eliminado correctamente.');
        } catch (e) { console.error(e); alert('Error al eliminar'); }
    }

    calcularClasificacionHasta(jornadaId) {
        const jIdx = this.jornadas.findIndex(j => String(j.id) === String(jornadaId));
        if (jIdx === -1) return [];

        // Inicializa estadísticas por socio
        const stats = this.members.map(m => ({
            id: m.id,
            name: window.AppUtils.getMemberName(m),
            puntos: 0,
            ganadas: 0,
            perdidas: 0
        }));

        // Simula la temporada hasta esa jornada
        for (let i = 0; i <= jIdx; i++) {
            const j = this.jornadas[i];

            const matchesWithResult = (j.matches || []).filter(match => match.result && String(match.result).trim() !== '' && String(match.result).toLowerCase() !== 'por definir');
            if (matchesWithResult.length === 0) continue;

            stats.forEach(s => {
                const isWin = this.wasWinnerOfJornada(s.id, j);
                const isLoss = this.wasLoserOfJornada(s.id, j);
                if (isWin) s.ganadas++;
                if (isLoss) s.perdidas++;

                const pronostico = this.pronosticos.find(p => (String(p.jId) === String(j.id) || String(p.jornadaId) === String(j.id)) && (String(p.mId) === String(s.id) || String(p.memberId) === String(s.id)));
                if (pronostico) {
                    const sel = pronostico.selection || pronostico.forecast;
                    const aciertos = this.calculateAciertos(j.matches, sel);
                    s.puntos += this.calculatePoints(aciertos, pronostico);
                }
            });
        }

        // Orden descendente por puntos. Si hay empate, por (ganadas - perdidas). Si persiste, por (ganadas).
        stats.sort((a, b) => {
            if (b.puntos !== a.puntos) return b.puntos - a.puntos;
            const difA = a.ganadas - a.perdidas;
            const difB = b.ganadas - b.perdidas;
            if (difB !== difA) return difB - difA;
            return b.ganadas - a.ganadas;
        });

        return stats;
    }

    previewCierreVuelta() {
        const jIdSelect = document.getElementById('cierre-jornada-id');
        if (!jIdSelect) return;
        const jId = jIdSelect.value;

        if (!jId) { alert('Selecciona una jornada límite'); return; }

        const stats = this.calcularClasificacionHasta(jId);

        if (!stats || stats.length === 0) {
            alert('No se ha podido calcular la clasificación. Asegúrate de que la jornada seleccionada ya tiene resultados.');
            return;
        }

        // Tabla de baremos definida por la directiva
        const penaltiesMap = [0, 0.50, 1.00, 1.40, 1.70, 1.90, 2.20, 2.40, 2.60, 2.80, 3.00];

        // Asignación de rangos (teniendo en cuenta los empates efectivos)
        let currentRank = 1;
        stats.forEach((s, i) => {
            if (i > 0) {
                const prev = stats[i - 1];
                if (prev.puntos === s.puntos && (prev.ganadas - prev.perdidas) === (s.ganadas - s.perdidas) && prev.ganadas === s.ganadas) {
                    s.rank = prev.rank; // Empate total en los 3 criterios
                } else {
                    s.rank = currentRank;
                }
            } else {
                s.rank = currentRank;
            }
            currentRank++;
            s.rawRank = i + 1;
        });

        const N = stats.length;
        this.currentPreviewCierre = {};

        // Agrupación de empates para prorratear
        const grouped = {};
        stats.forEach(s => {
            if (!grouped[s.rank]) grouped[s.rank] = [];
            grouped[s.rank].push(s);
        });

        let positionPointer = 1;
        for (const r in grouped) {
            const group = grouped[r];
            const size = group.length;

            let totalPenaltyGroup = 0;
            for (let k = 0; k < size; k++) {
                const pos = positionPointer + k;
                let penL = 0;

                if (pos === 1) penL = 0;
                else if (pos >= 2 && pos <= 11) penL = penaltiesMap[pos - 1];
                else if (pos === N) penL = 5.00; // Último
                else if (pos === N - 1) penL = 4.50; // Penúltimo
                else if (pos === N - 2) penL = 4.00; // Antepenúltimo
                else {
                    // Desde el 12º hasta anterior al antepenúltimo (N-3)
                    if (N > 23 && pos >= 20) {
                        penL = 3.90;
                    } else {
                        penL = 3.10 + (pos - 12) * 0.10;
                    }
                }
                totalPenaltyGroup += penL;
            }

            // "Si persiste el empate se pagará a medias" (Se suma el castigo de todas las posiciones bloqueadas y se divide)
            const sharedPenalty = (size > 0) ? (totalPenaltyGroup / size) : 0;

            group.forEach(s => {
                s.penalty = sharedPenalty;
                this.currentPreviewCierre[s.id] = sharedPenalty;
            });

            positionPointer += size;
        }

        // Render HTML Preview
        let html = '<table class="detail-table"><thead><tr><th>Posición</th><th>Socio</th><th>Pts</th><th>G</th><th>P</th><th>Dif</th><th>Penalización</th></tr></thead><tbody>';

        stats.forEach(s => {
            const dif = s.ganadas - s.perdidas;
            html += `<tr>
                <td><b>${s.rank}º</b></td>
                <td>${s.name}</td>
                <td>${s.puntos}</td>
                <td>${s.ganadas}</td>
                <td>${s.perdidas}</td>
                <td>${dif > 0 ? '+' : ''}${dif}</td>
                <td style="color: ${s.penalty > 0 ? '#f44336' : '#4CAF50'}; font-weight: bold;">
                    ${s.penalty > 0 ? '-' + s.penalty.toFixed(2) + ' €' : 'EXENTO'}
                </td>
            </tr>`;
        });
        html += '</tbody></table>';

        const wrapper = document.getElementById('cierre-preview-table-wrapper');
        const container = document.getElementById('preview-cierre-container');
        if (wrapper) wrapper.innerHTML = html;
        if (container) container.style.display = 'block';
    }

    async submitCierreVuelta(event) {
        event.preventDefault();

        if (!this.currentPreviewCierre || Object.keys(this.currentPreviewCierre).length === 0) {
            alert('Por favor, primero previsualiza para calcular las retenciones.');
            return;
        }

        const tipoSelect = document.getElementById('cierre-tipo');
        const jIdSelect = document.getElementById('cierre-jornada-id');
        const fechaInput = document.getElementById('cierre-fecha');

        if (!tipoSelect || !jIdSelect || !fechaInput) return;

        const tipo = tipoSelect.value;
        const jornadaId = jIdSelect.value;
        const fecha = fechaInput.value;
        const jornadaObj = this.jornadas.find(j => j.id === jornadaId);

        const record = {
            id: 'cierre_clasif_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            tipo: tipo,
            jornadaId: jornadaId,
            jornadaNum: jornadaObj ? jornadaObj.number : '?',
            date: fecha,
            penalizaciones: this.currentPreviewCierre,
            temporada: this.config.temporadaActual || '2025-2026'
        };

        try {
            await window.DataService.save('cierres_vuelta', record);
            if (!this.cierresVuelta) this.cierresVuelta = [];
            this.cierresVuelta.push(record);

            this.closeModal('modal-cierre-vuelta');
            this.render(); // Recalculate whole table
            alert('Penalizaciones aplicadas de forma exitosa. Se han restado los importes automáticamente del saldo en la Tabla General.');
        } catch (e) {
            console.error(e);
            alert('Error crítico al conectar con la base de datos.');
        }
    }

    // --- END NEW ---

    showReducedBreakdown(memberId, jId) {
        const p = this.pronosticosExtra.find(x => String(x.mId || x.memberId) === String(memberId) && String(x.jId || x.jornadaId) === String(jId));
        const j = this.jornadas.find(jor => String(jor.id) === String(jId));
        if (!p || !j) return;

        const selection = p.selection || p.forecast;
        const jDate = window.AppUtils.parseDate(j.date);
        const officialResults = (j.matches || []).map(m => m.result);
        const legacyPrizes = j.prizes || {};

        const multiIndices = [];
        selection.forEach((sel, idx) => {
            if (idx < 14 && sel && sel.length > 1) multiIndices.push(idx);
        });

        if (multiIndices.length !== 7) {
            alert("No se detectan exactamente 7 dobles para esta reducción.");
            return;
        }

        const matrix = window.ScoringSystem.reducciones['R2'];
        const bets = [];

        matrix.forEach((betRow, bIdx) => {
            let regHits = 0;
            let p15Hit = false;

            const betSelection = selection.map((sel, idx) => {
                if (idx >= 15) return sel;
                const mIdx = multiIndices.indexOf(idx);
                if (mIdx !== -1) {
                    return (betRow[mIdx] === '1') ? sel[0] : (sel[1] || sel[0]);
                }
                return sel;
            });

            // Calculate hits for this specific bet
            betSelection.forEach((sel, idx) => {
                if (idx >= 15) return;
                const res = officialResults[idx];
                if (!res || res === '' || res.toUpperCase() === 'POR DEFINIR') return;
                const rSign = window.ScoringSystem.normalizeSign(res);
                const rScore = String(res).trim().toUpperCase();

                if (idx < 14) {
                    // Main 14 matches
                    if (sel.includes(rSign)) regHits++;
                } else if (idx === 14) {
                    // Pleno al 15
                    p15Hit = (rScore === sel || rSign === sel);
                }
            });

            // Total Raw Hits (0-15) for peña stats
            bets.push({
                num: bIdx + 1,
                selection: betSelection,
                hits: regHits + (p15Hit ? 1 : 0),
                isWinner: regHits >= 10
            });
        });

        const ev = window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced: true });

        // Calculate Total Prize
        let totalPrizeValue = 0;
        Object.keys(ev.breakdown).forEach(h => {
            totalPrizeValue += ev.breakdown[h] * (legacyPrizes[h] || 0);
        });

        // Build HTML
        let html = `
            <div style="margin-bottom: 1.5rem; background: rgba(103, 58, 183, 0.05); padding: 1rem; border-radius: 12px; border: 1px solid #673ab7;">
                <h3 style="margin:0 0 10px 0; color:#673ab7; font-size:1.1rem;">Pronóstico Original (Columnas de Dobles):</h3>
                <div style="display:grid; grid-template-columns: repeat(15, 1fr); gap: 4px; text-align:center;">
                    ${selection.map((s, idx) => `
                        <div>
                            <div style="font-size:0.6rem; color:#9575cd; margin-bottom:2px;">${idx === 14 ? 'P15' : idx + 1}</div>
                            <div style="background:${s.length > 1 ? '#673ab7' : '#444'}; color:white; padding:4px 0; border-radius:4px; font-weight:900; font-size:0.9rem; border:1px solid ${s.length > 1 ? '#9575cd' : '#555'};">
                                ${s}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1.5fr 0.8fr; gap: 2rem;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom: 2px solid #673ab7; padding-bottom:0.75rem;">
                         <h3 style="margin:0; color:#673ab7; font-size:1.4rem;">Resumen de Premios Total:</h3>
                         <div style="background:#2e7d32; color:white; padding:8px 20px; border-radius:30px; font-weight:900; font-size:1.4rem; box-shadow:0 8px 16px rgba(0,0,0,0.4); border:2px solid #4caf50;">
                            TOTAL: ${totalPrizeValue.toFixed(2)}€
                         </div>
                    </div>

                    <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:1.5rem;">
                        ${Object.keys(ev.breakdown).sort((a, b) => b - a).map(h => {
            const count = ev.breakdown[h];
            const pVal = legacyPrizes[h] || 0;
            if (count === 0) return '';
            return `<div style="background:rgba(49, 27, 146, 0.9); border:2px solid #7e57c2; padding:12px; border-radius:10px; text-align:center; min-width:130px; box-shadow: 0 6px 15px rgba(0,0,0,0.3);">
                                <div style="font-weight:900; font-size:1.3rem; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${count} de ${h} ac.</div>
                                <div style="font-size:0.85rem; color:#e0e0e0; font-weight:bold; margin: 4px 0;">${pVal.toFixed(2)}€ / ud</div>
                                <div style="font-weight:900; color:#81c784; font-size:1.1rem;">${(count * pVal).toFixed(2)}€</div>
                            </div>`;
        }).join('')}
                    </div>

                    <h3 style="color:#673ab7; border-bottom: 2px solid #673ab7; padding-bottom:0.5rem; margin-top:2rem;">Desglose por Apuesta (16):</h3>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:center;">
                            <thead>
                                <tr style="background:#e0e0e0; color: #1a1a1a;">
                                    <th style="padding:6px; border:1px solid #999;">Apuesta</th>
                                    ${Array.from({ length: 15 }).map((_, i) => `<th style="padding:6px; border:1px solid #999; width:30px;">${i === 14 ? 'P15' : i + 1}</th>`).join('')}
                                    <th style="padding:6px; border:1px solid #999; background:#1a237e; color:white;">Hits</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bets.map(b => `
                                    <tr style="${b.isWinner ? 'background:rgba(76, 175, 80, 0.15); box-shadow: inset 4px 0 0 #2e7d32;' : ''}">
                                        <td style="padding:6px; border:1px solid #444; font-weight:bold; color:#eee;">#${b.num}</td>
                                        ${b.selection.map((s, idx) => {
            const res = officialResults[idx];
            const rSign = window.ScoringSystem.normalizeSign(res);
            const isHit = idx < 14 ? s.includes(rSign) : (s === officialResults[idx] || s === rSign);
            // Salmon for hits: #ff8a65 or #ffab91
            return `<td style="padding:6px; border:1px solid #444; ${isHit ? 'background:#ff8a65; color:#000; font-weight:700;' : 'color:#999;'}">${s}</td>`;
        }).join('')}
                                        <td style="padding:6px; border:1px solid #444; font-weight:900; background:${b.isWinner ? '#fbc02d' : '#283593'}; color:${b.isWinner ? '#000' : '#fff'};">
                                            ${b.hits}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.05); padding:1.5rem; border-radius:12px; border:1px solid #444;">
                    <h3 style="margin-top:0; font-size:1.1rem; color:#b0bec5; border-bottom:1px solid #444; padding-bottom:0.5rem;">Resultados Oficiales J${j.number}:</h3>
                    <div style="display:grid; grid-template-columns: 1fr; gap:8px; margin-top:1rem;">
                        ${j.matches.slice(0, 15).map((m, idx) => `
                            <div style="font-size:0.8rem; padding:6px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
                                <span style="color:#cfd8dc;">${idx + 1}. ${m.home.substring(0, 12)} - ${m.away.substring(0, 12)}</span>
                                <strong style="color:#ff8a65; font-size:1rem; background:rgba(255, 138, 101, 0.1); padding:2px 8px; border-radius:4px;">${m.result}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const modal = document.getElementById('modal-reducida-detalle');
        const content = document.getElementById('reducida-detalle-content');
        const title = document.getElementById('reducida-detalle-titulo');

        title.textContent = `Desglose Reducción - J${j.number} - ${window.AppUtils.getMemberName(this.members.find(m => String(m.id) === String(p.mId || p.memberId)))}`;
        content.innerHTML = html;
        modal.style.display = 'flex';
    }
}

// Initialize on page load
window.Bote = new BoteManager();
