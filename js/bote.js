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
            .sort((a, b) => a.name.localeCompare(b.name))
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
            'F. Lozano': 2, 'F. Ramirez': 42.91, 'Heradio': 10.22, 'Valdi': 2,
            'Javi Mora': 57.88, 'Juan Antonio': 17.9, 'Juanjo': -6.1, 'Luismi': 24.75,
            'Marcelo': 0, 'Martin': 15.1, 'Rafa': 4.45, 'Ramon': 2, 'Raul Romera': 8.95,
            'Samuel': 1.5
        };

        // For each member
        this.members.forEach(member => {
            const mName = member.name.trim();
            // Búsqueda de saldo inicial con normalización básica
            let boteAcumulado = 0;
            const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const entry = Object.entries(initialBalances).find(([k, v]) => norm(k) === norm(mName) || norm(mName).includes(norm(k)) || norm(k).includes(norm(mName)));
            if (entry) boteAcumulado = entry[1];

            let totalIngresos = 0;
            let totalGastos = 0;

            // For each jornada
            this.jornadas.forEach((jornada, jornadaIndex) => {
                const jornadaNum = jornada.number;

                // Get member's pronostico for this jornada
                const pronostico = this.pronosticos.find(p =>
                    (p.jId === jornada.id || p.jornadaId === jornada.id) &&
                    (p.mId === member.id || p.memberId === member.id)
                );

                // Calculate costs for this jornada
                const costs = this.calculateJornadaCosts(member.id, jornada, pronostico, jornadaIndex);

                // Get prizes for this jornada
                const prizes = this.getPrizesForJornada(member.id, jornada);

                // Get manual ingresos for this jornada
                const manualIngresos = this.getManualIngresosForJornada(member.id, jornada);

                // Calculate net movement
                const penalties = costs.penalizacionUnos + (costs.penalizacionBajosAciertos || 0) + (costs.penalizacionPIG || 0);
                const netoForSocio = manualIngresos - (costs.aportacion + penalties) - costs.sellado;
                boteAcumulado += netoForSocio;

                // PEÑA JACKPOT (Jackpot delta for this record)
                // The club gets: aportacion + penalties + prizes
                // The club pays: sealing costs (represented as negative costs.sellado)
                const netoForPenna = costs.aportacion + penalties + prizes + costs.sellado;

                totalIngresos += (costs.aportacion + penalties + prizes); // Total money entering club
                totalGastos += Math.abs(costs.sellado > 0 ? 0 : costs.sellado); // Total money leaving club (sealing)

                movements.push({
                    memberId: member.id,
                    memberName: window.AppUtils.getMemberName(member),
                    jornadaId: jornada.id,
                    jornadaNum: jornadaNum,
                    jornadaDate: jornada.date,
                    aportacion: costs.aportacion,
                    costeColumna: costs.columna,
                    costeDobles: costs.dobles,
                    penalizacionUnos: costs.penalizacionUnos,
                    penalizacionBajosAciertos: costs.penalizacionBajosAciertos || 0,
                    penalizacionPIG: costs.penalizacionPIG || 0,
                    sellado: costs.sellado,
                    premios: prizes,
                    ingresosManual: manualIngresos,
                    aciertos: costs.aciertos,
                    totalIngresos: (costs.aportacion + penalties + prizes),
                    totalGastos: Math.abs(costs.sellado > 0 ? 0 : costs.sellado),
                    neto: netoForSocio, // Balance change for socio
                    netoPenna: netoForPenna, // Jackpot change for club
                    boteAcumulado: boteAcumulado,
                    exento: costs.exento,
                    jugaDobles: costs.jugaDobles
                });
            });
        });

        return movements;
    }

    /**
     * Calculate costs for a specific member in a specific jornada
     */
    calculateJornadaCosts(memberId, jornada, pronostico, jornadaIndex) {
        // A jornada is considered "played" if at least one match has a result
        const jornadaPlayed = jornada.matches && jornada.matches.some(m => {
            const r = String(m.result || '').trim().toLowerCase();
            return r !== '' && r !== 'por definir';
        });

        const jDate = window.AppUtils.parseDate(jornada.date);

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

        // Calculate hits first
        const currentSelection = pronostico.selection || pronostico.forecast;
        if (jornada.matches && currentSelection) {
            costs.aciertos = this.calculateAciertos(jornada.matches, currentSelection);
        }

        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            const hadPrize = this.getPrizesForJornada(memberId, prevJornada) > 0;
            if (hadPrize) {
                costs.exento = true;
                costs.columna = 0;
                costs.aportacion = 0;
            } else {
                costs.columna = jornadaPlayed ? this.getHistoricalPrice('costeColumna', jDate) : 0;
                costs.aportacion = jornadaPlayed ? this.getHistoricalPrice('aportacionSemanal', jDate) : 0;
            }
        } else {
            costs.columna = jornadaPlayed ? this.getHistoricalPrice('costeColumna', jDate) : 0;
            costs.aportacion = jornadaPlayed ? this.getHistoricalPrice('aportacionSemanal', jDate) : 0;
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

            // 3. PIG (Partido Interés General: Enfrentamientos directos entre Madrid, Barça y Atleti)
            const isMadrid = (t) => {
                const tl = t.toLowerCase();
                return tl.includes('madrid') && !tl.includes('atlet') && !tl.includes('at.');
            };
            const isBarca = (t) => {
                const tl = t.toLowerCase();
                return tl.includes('barcelona') || tl.includes('barça') || tl.includes('barca') || tl.includes('fcb');
            };
            const isAtleti = (t) => {
                const tl = t.toLowerCase();
                return tl.includes('atleti') || tl.includes('atlétic') || tl.includes('atletico') || tl.includes('at. madrid');
            };

            const checkIsPIG = (m) => {
                if (!m) return false;
                const h = m.home || '';
                const a = m.away || '';
                const hM = isMadrid(h), aM = isMadrid(a);
                const hB = isBarca(h), aB = isBarca(a);
                const hA = isAtleti(h), aA = isAtleti(a);
                return (hM && (aB || aA)) || (hB && (aM || aA)) || (hA && (aM || aB));
            };

            let pigIdx = jornada.pigMatchIndex !== undefined ? jornada.pigMatchIndex : 14;
            // Auto-detect PIG if the current one doesn't match
            if (jornada.matches && jornada.matches.length > 0) {
                if (!checkIsPIG(jornada.matches[pigIdx])) {
                    const detected = jornada.matches.slice(0, 15).findIndex(mj => checkIsPIG(mj));
                    if (detected !== -1) pigIdx = detected;
                }
            }

            const pigMatch = jornada.matches[pigIdx];
            if (pigMatch && pigMatch.result && pigMatch.result !== '' && pigMatch.result.toLowerCase() !== 'por definir') {
                const result = String(pigMatch.result).trim().toUpperCase();
                const prediction = String(currentSelection[pigIdx] || '').trim().toUpperCase();
                if (result !== prediction) {
                    costs.penalizacionPIG = this.calculateHistoricalPenalty('pig', null, jDate);
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
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            if (this.wasLoserOfJornada(memberId, prevJornada)) {
                const numSocios = this.members.length;
                const cCol = this.getHistoricalPrice('costeColumna', jDate);
                const cDob = this.getHistoricalPrice('costeDobles', jDate);
                costs.sellado = -((numSocios * cCol) + cDob);
            }
        }

        return costs;
    }

    getHistoricalPrice(key, date) {
        if (!this.config.history || !this.config.history[key]) return this.config[key] || 0;
        // Sort history by date desc and find first one before or on target date
        const settings = this.config.history[key].filter(h => new Date(h.date) <= date).sort((a, b) => new Date(b.date) - new Date(a.date));
        return settings.length > 0 ? settings[0].value : (this.config[key] || 0);
    }

    calculateHistoricalPenalty(type, value, date) {
        const history = this.config.penalties_history || {};
        const settings = history[type] || [];

        // Find setting for that date
        const setting = settings.filter(s => new Date(s.date) <= date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        if (!setting) {
            // CRITICAL: If no historical setting for that date, DON'T assume current penalties
            // If the reconstruction date is OLDER than any entry, we should probably return 0 
            // unless we want to use current values as default (risky for J1).
            // Let's check: if we are reconstructing the START of the season, and we just added 
            // historical penalties TODAY, J1 shouldn't have them unless we manually set them for J1 date.

            // For now, if no history is found for that specific date in the past, return 0 to avoid "ghost penalties"
            // unless it's a very basic check.
            if (type === 'unos' && value >= 10) return this.calculatePenalizacionUnos(value);
            return 0;
        }

        if (type === 'unos' || type === 'bajos_aciertos') {
            return setting.values ? (setting.values[value] || 0) : 0;
        }
        if (type === 'pig') {
            return setting.value || 0;
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
     * Calculate number of hits (aciertos)
     */
    calculateAciertos(matches, forecast) {
        if (!matches || !forecast || matches.length !== forecast.length) return 0;

        let aciertos = 0;
        matches.forEach((match, idx) => {
            if (!match.result || match.result === '') return;

            const result = String(match.result || '').trim().toUpperCase();
            const prediction = String(forecast[idx] || '').trim().toUpperCase();

            if (result === prediction && result !== '' && result !== 'POR DEFINIR') {
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

        const jornadaPronosticos = this.pronosticos.filter(p => (p.jId === jornada.id || p.jornadaId === jornada.id));
        if (jornadaPronosticos.length === 0) return false;

        const scores = jornadaPronosticos.map(p => {
            const currentSelection = p.selection || p.forecast;
            const aciertos = this.calculateAciertos(jornada.matches, currentSelection);
            const points = this.calculatePoints(aciertos, p);
            return { memberId: p.memberId || p.mId, points: points };
        });

        const maxPoints = Math.max(...scores.map(s => s.points));
        const winners = scores.filter(s => s.points === maxPoints);

        if (winners.length === 1) return winners[0].memberId === memberId;

        // Recursive Tie-breaker
        const finalWinnerId = this.resolveTie(winners.map(w => w.memberId), jornada.number - 1, 'max');
        return finalWinnerId === memberId;
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
    getPrizesForJornada(memberId, jornada) {
        // Prizes are stored in jornada.matches[index].prizes or jornada.prizesByHits
        // But for retroactive check, we check if the member had 10+ hits and there were prizes
        if (!jornada.prizes || typeof jornada.prizes !== 'object') return 0;

        const pronostico = this.pronosticos.find(p => (p.jId === jornada.id || p.jornadaId === jornada.id) && (p.mId === memberId || p.memberId === memberId));
        if (!pronostico) return 0;

        const selection = pronostico.selection || pronostico.forecast;
        const aciertos = this.calculateAciertos(jornada.matches, selection);

        // Match aciertos with prize category
        return jornada.prizes[aciertos] || 0;
    }

    /**
     * Get manual ingresos for a member in a jornada
     */
    getManualIngresosForJornada(memberId, jornada) {
        const jornadaDate = this.parseDate(jornada.date);
        if (!jornadaDate) return 0;

        // Get ingresos for this member around this jornada date
        const relevantIngresos = this.ingresos.filter(ing => {
            if (ing.memberId !== memberId) return false;

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
        }
    }

    /**
     * Update summary cards
     */
    updateSummary(movements) {
        // SUMMARY FOR THE PEÑA (JACKPOT CLUB)
        // IN: aportacion + penalties + prize
        // OUT: sellado total
        const totalIngresos = movements.reduce((sum, m) => sum + m.totalIngresos, 0);
        const totalGastos = movements.reduce((sum, m) => sum + m.totalGastos, 0);
        const boteTotal = totalIngresos - totalGastos + this.config.boteInicial;

        // Count unique jornadas
        const uniqueJornadas = new Set(movements.map(m => m.jornadaNum)).size;

        document.getElementById('total-bote').textContent = boteTotal.toFixed(2) + ' €';
        document.getElementById('total-ingresos').textContent = totalIngresos.toFixed(2) + ' €';
        document.getElementById('total-gastos').textContent = totalGastos.toFixed(2) + ' €';
        document.getElementById('jornadas-count').textContent = uniqueJornadas;
    }

    /**
     * Render Vista General - Summary by member
     */
    renderVistaGeneral(movements) {
        const memberSummaries = {};

        // Aggregate by member
        this.members.forEach(member => {
            const memberMovements = movements.filter(m => m.memberId === member.id);

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

        // Render table
        let html = `
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
                return j && j.matches && j.matches.some(m => m.result && m.result !== '' && m.result !== 'por definir');
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

        const totalIngresos = jornadaMovements.reduce((sum, m) => sum + m.totalIngresos, 0);
        const totalGastos = jornadaMovements.reduce((sum, m) => sum + m.totalGastos, 0);
        const neto = totalIngresos - totalGastos;

        let html = `
            <div class="jornada-nav">
                <button onclick="window.Bote.prevJornada()" ${this.currentJornadaIndex === 0 ? 'disabled' : ''}>← Anterior</button>
                <span>Jornada ${currentJornadaNum} - ${jornada ? jornada.date : ''}</span>
                <button onclick="window.Bote.nextJornada()" ${this.currentJornadaIndex === jornadaNums.length - 1 ? 'disabled' : ''}>Siguiente →</button>
            </div>
            
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255, 145, 0, 0.08); border-radius: 8px; border: 1px solid rgba(255, 145, 0, 0.3);">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align:center;">
                    <div><strong style="color: #ff9100; font-size:0.75rem;">INGRESOS</strong><br><span class="positive">${totalIngresos.toFixed(2)}€</span></div>
                    <div><strong style="color: #ff9100; font-size:0.75rem;">GASTOS</strong><br><span class="negative">${totalGastos.toFixed(2)}€</span></div>
                    <div><strong style="color: #ff9100; font-size:0.75rem;">NETO</strong><br><span class="${neto >= 0 ? 'positive' : 'negative'}">${neto.toFixed(2)}€</span></div>
                </div>
            </div>

            <div style="overflow-x: auto; border-radius: 12px; border: 1px solid var(--glass-border);">
                <table class="bote-table">
                    <thead>
                        <tr>
                            <th rowspan="2">Socio</th>
                            <th rowspan="2">Aciertos</th>
                            <th rowspan="2">PAGA</th>
                            <th colspan="3" style="text-align:center; background: #e65100;">Penalizaciones</th>
                            <th rowspan="2">Sellado</th>
                            <th rowspan="2">Premios</th>
                            <th rowspan="2">Neto</th>
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
                html += `
                    <tr>
                        <td><strong>${m.memberName}${m.exento ? ' 🎁' : ''}${m.jugaDobles ? ' 2️⃣' : ''}</strong></td>
                        <td style="font-weight:900;">${m.aciertos}</td>
                        <td class="positive" style="font-weight:bold;">${(m.aportacion + (m.penalizacionUnos || 0) + (m.penalizacionBajosAciertos || 0) + (m.penalizacionPIG || 0)).toFixed(2)}€</td>
                        <td class="negative">${(m.penalizacionUnos || 0).toFixed(1)}€</td>
                        <td class="negative">${(m.penalizacionBajosAciertos || 0).toFixed(1)}€</td>
                        <td class="negative">${(m.penalizacionPIG || 0).toFixed(1)}€</td>
                        <td class="${m.sellado < 0 ? 'positive' : 'negative'}">${m.sellado.toFixed(1)}€</td>
                        <td class="positive">${m.premios.toFixed(1)}€</td>
                        <td class="${m.neto >= 0 ? 'positive' : 'negative'}">${m.neto.toFixed(2)}€</td>
                    </tr>
                `;
            });

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
        const jornadaNums = Object.keys(jornadaGroups).sort((a, b) => parseInt(a) - parseInt(b));

        if (this.currentJornadaIndex < jornadaNums.length - 1) {
            this.currentJornadaIndex++;
            this.render();
        }
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

        title.textContent = `Detalle de ${memberName}`;
        content.innerHTML = '<p style="text-align:center; padding:2rem;">Cargando movimientos...</p>';

        let html = `
            <div style="margin-bottom: 1.5rem; text-align:center;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                    <div class="summary-card" style="padding:0.5rem; border:1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div style="font-size:0.7rem; color:#888;">Ingresos</div>
                        <div class="positive" style="font-weight:bold;">${memberMovements.reduce((s, m) => s + m.totalIngresos, 0).toFixed(2)}€</div>
                    </div>
                    <div class="summary-card" style="padding:0.5rem; border:1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div style="font-size:0.7rem; color:#888;">Gastos</div>
                        <div class="negative" style="font-weight:bold;">${memberMovements.reduce((s, m) => s + m.totalGastos, 0).toFixed(2)}€</div>
                    </div>
                    <div class="summary-card" style="padding:0.5rem; border:1px solid rgba(76,175,80,0.1); border-left:3px solid var(--primary-color); background: rgba(0,0,0,0.2);">
                        <div style="font-size:0.7rem; color:#888;">Bote Actual</div>
                        <div style="font-weight:bold; color:var(--primary-color);">${memberMovements.length > 0 ? memberMovements[memberMovements.length - 1].boteAcumulado.toFixed(2) : '0.00'}€</div>
                    </div>
                </div>
            </div>
            
            <div style="max-height: 50vh; overflow-y: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                <table class="detail-table" style="width:100%; border-collapse: collapse;">
                    <thead style="position: sticky; top:0; background: var(--primary-color); z-index: 10;">
                        <tr>
                            <th style="padding:0.5rem; text-align:left;">J</th>
                            <th style="padding:0.5rem; text-align:left;">Fecha</th>
                            <th style="padding:0.5rem; text-align:left;">Aciertos</th>
                            <th style="padding:0.5rem; text-align:right;">Ingreso</th>
                            <th style="padding:0.5rem; text-align:right;">Gasto</th>
                            <th style="padding:0.5rem; text-align:right;">Bote</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (memberMovements.length === 0) {
            html += '<tr><td colspan="6" style="text-align:center; padding:2rem;">No hay movimientos</td></tr>';
        } else {
            memberMovements.forEach(m => {
                html += `
                    <tr>
                        <td style="padding:0.5rem;"><strong>${m.jornadaNum}</strong></td>
                        <td style="padding:0.5rem; font-size:0.7rem;">${m.jornadaDate}</td>
                        <td style="padding:0.5rem;">${m.aciertos}${m.exento ? ' 🎁' : ''}</td>
                        <td class="positive" style="padding:0.5rem; text-align:right;">${m.totalIngresos.toFixed(2)}€</td>
                        <td class="negative" style="padding:0.5rem; text-align:right;">${m.totalGastos.toFixed(2)}€</td>
                        <td style="padding:0.5rem; text-align:right; font-weight:bold;">${m.boteAcumulado.toFixed(2)}€</td>
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
            const member = this.members.find(m => m.id === ingreso.memberId);
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

        const member = this.members.find(m => m.id === ingreso.memberId);
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
            const hM = isMadrid(h), aM = isMadrid(a);
            const hB = isBarca(h), aB = isBarca(a);
            const hA = isAtleti(h), aA = isAtleti(a);
            return (hM && (aB || aA)) || (hB && (aM || aA)) || (hA && (aM || aB));
        };

        uniqueJornadas.forEach(num => {
            const j = this.jornadas.find(jor => jor.number === num);
            if (j) {
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
            <div class="cuadrante-container" style="max-height: 80vh; overflow: auto; border: 1px solid var(--glass-border); border-radius: 12px; position: relative;">
                <table class="bote-table cuadrante-table" style="font-size: 0.8rem; min-width: 100%; border-collapse: separate; border-spacing: 0;">
                    <thead>
                        <tr>
                            <th style="position: sticky; top: 0; left: 0; z-index: 100; background: var(--cuadrante-header-bg); color: var(--cuadrante-header-text); border-right: 2px solid var(--primary-color);">Socio</th>
        `;

        jornadasInfo.forEach(j => {
            html += `<th style="position: sticky; top: 0; min-width: 70px; background: var(--cuadrante-header-bg); color: var(--cuadrante-header-text); border-bottom: 2px solid var(--primary-color);">J${j.number}${j.hasPig ? ' 🐷' : ''}</th>`;
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
                    <td style="position: sticky; left: 0; z-index: 50; background: var(--cuadrante-sticky-col); color: var(--cuadrante-sticky-text); font-weight: bold; border-right: 2px solid var(--primary-color); white-space: nowrap;">
                        ${data.name}
                    </td>
            `;

            jornadasInfo.forEach(j => {
                const mov = data.jornadas[j.number];
                let cellContent = '-';
                let style = '';

                if (mov) {
                    const penalties = mov.penalizacionUnos + (mov.penalizacionBajosAciertos || 0) + (mov.penalizacionPIG || 0);
                    const payment = mov.aportacion + penalties;

                    cellContent = `<div style="font-size:1.1rem; font-weight:900; color: inherit;">${payment.toFixed(1)}€</div>`;
                    cellContent += `<div style="font-size:0.75rem; opacity: 0.8; font-weight:bold;">${mov.aciertos} ac.</div>`;

                    if (mov.exento) style = `background: var(--cuadrante-exempt-bg); color: var(--cuadrante-exempt-text);`;

                    let clickHandler = '';
                    if (penalties > 0) {
                        style = `background: var(--cuadrante-penalty-bg); color: var(--cuadrante-penalty-text); border-left: 3px solid var(--cuadrante-penalty-border); cursor: pointer;`;
                        const tooltip = [];
                        if (mov.penalizacionUnos > 0) tooltip.push(`• Exceso de Unos: ${mov.penalizacionUnos.toFixed(2)}€`);
                        if (mov.penalizacionBajosAciertos > 0) tooltip.push(`• Bajos Aciertos: ${mov.penalizacionBajosAciertos.toFixed(2)}€`);
                        if (mov.penalizacionPIG > 0) tooltip.push(`• Fallo en PIG: ${mov.penalizacionPIG.toFixed(2)}€`);
                        clickHandler = `onclick="window.Bote.showPenaltyDetail('${member.name}', ${j.number}, '${tooltip.join('<br>')}')"`;
                    }

                    if (this.wasWinnerOfJornada(member.id, j)) {
                        style += ` border: 2px solid var(--cuadrante-win-border); box-shadow: inset 0 0 10px var(--cuadrante-win-border);`;
                    } else if (this.wasLoserOfJornada(member.id, j)) {
                        style += ` border: 2px solid var(--cuadrante-loss-border);`;
                    }

                    html += `<td ${clickHandler} style="text-align:center; padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); ${style}">${cellContent}</td>`;
                } else {
                    html += `<td style="text-align:center; padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); ${style}">${cellContent}</td>`;
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
        const migrationDone = localStorage.getItem('bote_maintenance_v4');
        if (migrationDone) return;

        console.log('Running maintenance migration v4...');
        const updates = [
            { num: 2, hits: 10, val: 5.00 }, // Valdi J2 Prize (requested to trigger J3 exemption)
            { num: 3, hits: 11, val: 28.84 },
            { num: 5, hits: 10, val: 13.08 },
            { num: 7, hits: 10, val: 1.00 },
            { num: 26, hits: 10, val: 6.30 }
        ];

        const specialPrizes = [
            { num: 3, val: 69.20, desc: 'Premio Quiniela de Dobles' },
            { num: 7, val: 919.09, desc: 'Premio Quiniela de Dobles' }
        ];

        try {
            for (const up of updates) {
                const jornada = this.jornadas.find(j => j.number === up.num);
                if (jornada) {
                    const prizes = jornada.prizes || {};
                    prizes[up.hits] = up.val;
                    await window.DataService.update('jornadas', jornada.id, { prizes });
                }
            }

            for (const sp of specialPrizes) {
                const exists = this.ingresos.some(ing => ing.cantidad === sp.val && ing.observaciones === sp.desc);
                if (!exists) {
                    await window.DataService.save('ingresos', {
                        memberId: 'CLUB',
                        cantidad: sp.val,
                        fecha: new Date().toISOString(),
                        observaciones: sp.desc,
                        tipo: 'premio'
                    });
                }
            }

            localStorage.setItem('bote_maintenance_v4', 'true');
            console.log('Migration v4 completed successfully!');
            await this.loadData();
            this.render();
        } catch (e) {
            console.error('Migration failed:', e);
        }
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
}

// Initialize on page load
window.Bote = new BoteManager();
