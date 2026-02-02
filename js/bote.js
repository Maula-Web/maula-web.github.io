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
                this.currentJornadaIndex = 0; // Reset when changing view
                this.render();
            });

            // Initial render
            this.render();

        } catch (error) {
            console.error('Error initializing BoteManager:', error);
            alert('Error al cargar los datos del bote');
        }
    }

    async loadData() {
        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');

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

        // For each member
        this.members.forEach(member => {
            let boteAcumulado = 0;
            let totalIngresos = 0;
            let totalGastos = 0;

            // For each jornada
            this.jornadas.forEach((jornada, jornadaIndex) => {
                const jornadaNum = jornada.number;

                // Get member's pronostico for this jornada
                // BUSQUEDA POR APODO (Nickname) para asegurar compatibilidad
                const memberKey = (member.nickname || member.name).trim().toLowerCase();
                const pronostico = this.pronosticos.find(p =>
                    p.jornadaId === jornada.id &&
                    (p.memberName?.trim().toLowerCase() === memberKey || p.memberId === member.id)
                );

                // Calculate costs for this jornada
                const costs = this.calculateJornadaCosts(member.id, jornada, pronostico, jornadaIndex);

                // Get prizes for this jornada
                const prizes = this.getPrizesForJornada(member.id, jornada);

                // Get manual ingresos for this jornada
                const manualIngresos = this.getManualIngresosForJornada(member.id, jornada);

                // Calculate net movement
                const ingresos = costs.aportacion + prizes + manualIngresos;
                const gastos = costs.columna + costs.dobles + costs.penalizacionUnos + costs.sellado;
                const neto = ingresos - gastos;

                boteAcumulado += neto;
                totalIngresos += ingresos;
                totalGastos += gastos;

                movements.push({
                    memberId: member.id,
                    memberName: member.nickname || member.name, // USAR APODO
                    jornadaId: jornada.id,
                    jornadaNum: jornadaNum,
                    jornadaDate: jornada.date,
                    aportacion: costs.aportacion,
                    costeColumna: costs.columna,
                    costeDobles: costs.dobles,
                    penalizacionUnos: costs.penalizacionUnos,
                    sellado: costs.sellado,
                    premios: prizes,
                    ingresosManual: manualIngresos,
                    aciertos: costs.aciertos,
                    totalIngresos: ingresos,
                    totalGastos: gastos,
                    neto: neto,
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
        // Check if jornada has been played (has results)
        const jornadaPlayed = jornada.matches && jornada.matches.every(m => m.result && m.result !== '');

        const costs = {
            aportacion: jornadaPlayed ? this.config.aportacionSemanal : 0,
            columna: 0,
            dobles: 0,
            penalizacionUnos: 0,
            sellado: 0,
            aciertos: 0,
            exento: false,
            jugaDobles: false
        };

        if (!pronostico) {
            // No pronostico = still pays columna if jornada was played
            costs.columna = jornadaPlayed ? this.config.costeColumna : 0;
            return costs;
        }

        // CORRECCIÓN: Check if member won a PRIZE in previous jornada (not just won)
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            const hadPrize = this.getPrizesForJornada(memberId, prevJornada) > 0;

            if (hadPrize) {
                costs.exento = true;
                costs.columna = 0; // Exempt from paying
            } else {
                costs.columna = this.config.costeColumna;
            }
        } else {
            costs.columna = this.config.costeColumna;
        }

        // Check if plays doubles (winner of previous jornada)
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            const wasWinner = this.wasWinnerOfJornada(memberId, prevJornada);

            if (wasWinner) {
                costs.jugaDobles = true;
                // Dobles cost is shared among all members (1.50€ each covers it)
                // So individual doesn't pay extra here
            }
        }

        // Calculate penalty for too many 1s
        if (pronostico.forecast && Array.isArray(pronostico.forecast)) {
            const numUnos = pronostico.forecast.filter(f => f === '1').length;
            costs.penalizacionUnos = this.calculatePenalizacionUnos(numUnos);
        }

        // Calculate aciertos (hits)
        if (jornada.matches && pronostico.forecast) {
            costs.aciertos = this.calculateAciertos(jornada.matches, pronostico.forecast);
        } else {
            costs.aciertos = 0;
        }

        // Sellado: if member was loser of previous jornada
        if (jornadaIndex > 0) {
            const prevJornada = this.jornadas[jornadaIndex - 1];
            const wasLoser = this.wasLoserOfJornada(memberId, prevJornada);

            if (wasLoser) {
                // Calculate total sellado cost
                const numSocios = this.members.length;
                const totalSellado = (numSocios * this.config.costeColumna) + this.config.costeDobles;
                costs.sellado = -totalSellado; // Negative because it's reimbursed
            }
        }

        return costs;
    }

    /**
     * Calculate penalty for number of 1s
     */
    calculatePenalizacionUnos(numUnos) {
        if (numUnos < 10) return 0;

        const penalties = {
            10: 1.10,
            11: 1.20,
            12: 1.30,
            13: 1.50,
            14: 2.00
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

            const result = match.result.trim().toUpperCase();
            const prediction = forecast[idx].trim().toUpperCase();

            if (result === prediction && result !== '') {
                aciertos++;
            }
        });

        return aciertos;
    }

    /**
     * Check if member was winner of a jornada
     */
    wasWinnerOfJornada(memberId, jornada) {
        if (!jornada.matches || jornada.matches.some(m => !m.result || m.result === '')) {
            return false; // Jornada not complete
        }

        // Get all pronosticos for this jornada
        const jornadaPronosticos = this.pronosticos.filter(p => p.jornadaId === jornada.id);

        if (jornadaPronosticos.length === 0) return false;

        // Calculate points for each member
        const scores = jornadaPronosticos.map(p => {
            const aciertos = this.calculateAciertos(jornada.matches, p.forecast);
            const points = this.calculatePoints(aciertos, p);
            return {
                memberId: p.memberId,
                points: points,
                aciertos: aciertos
            };
        });

        // Find max points
        const maxPoints = Math.max(...scores.map(s => s.points));
        const winners = scores.filter(s => s.points === maxPoints);

        // If tie, resolve recursively (not implemented here for simplicity)
        // For now, just check if this member has max points
        return winners.some(w => w.memberId === memberId);
    }

    /**
     * Check if member was loser of a jornada
     */
    wasLoserOfJornada(memberId, jornada) {
        if (!jornada.matches || jornada.matches.some(m => !m.result || m.result === '')) {
            return false; // Jornada not complete
        }

        // Get all pronosticos for this jornada
        const jornadaPronosticos = this.pronosticos.filter(p => p.jornadaId === jornada.id);

        if (jornadaPronosticos.length === 0) return false;

        // Calculate points for each member
        const scores = jornadaPronosticos.map(p => {
            const aciertos = this.calculateAciertos(jornada.matches, p.forecast);
            const points = this.calculatePoints(aciertos, p);
            return {
                memberId: p.memberId,
                points: points,
                aciertos: aciertos
            };
        });

        // Find min points
        const minPoints = Math.min(...scores.map(s => s.points));
        const losers = scores.filter(s => s.points === minPoints);

        return losers.some(l => l.memberId === memberId);
    }

    /**
     * Calculate points based on aciertos and penalties
     * (Simplified version - should match scoring.js logic)
     */
    calculatePoints(aciertos, pronostico) {
        let points = aciertos;

        // Apply penalties for low hits
        if (aciertos <= 3) {
            points -= (4 - aciertos);
        }

        // Apply penalties for late submission
        if (pronostico.isLate && !pronostico.pardoned) {
            points -= 2;
        }

        // Apply penalty for too many 1s
        if (pronostico.forecast) {
            const numUnos = pronostico.forecast.filter(f => f === '1').length;
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
        // Check if member has prizes in this jornada
        // This would come from RSS data or manual entry
        // For now, return 0 (to be implemented with RSS integration)
        return 0;
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
        }
    }

    /**
     * Update summary cards
     */
    updateSummary(movements) {
        const totalIngresos = movements.reduce((sum, m) => sum + m.totalIngresos, 0);
        const totalGastos = movements.reduce((sum, m) => sum + m.totalGastos, 0);
        const boteTotal = totalIngresos - totalGastos + this.config.boteInicial;

        // Count unique jornadas
        const uniqueJornadas = new Set(movements.map(m => m.jornadaId)).size;

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
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.values(memberSummaries)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(summary => {
                const boteClass = summary.bote > 0 ? 'positive' : summary.bote < 0 ? 'negative' : 'neutral';

                html += `
                    <tr>
                        <td><strong>${summary.name}</strong></td>
                        <td class="positive">${summary.totalIngresos.toFixed(2)} €</td>
                        <td class="negative">${summary.totalGastos.toFixed(2)} €</td>
                        <td class="${boteClass}">${summary.bote.toFixed(2)} €</td>
                        <td>
                            <button class="btn-action" onclick="boteManager.showMemberDetail('${summary.name}')">
                                Ver Detalle
                            </button>
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

        const jornadaNums = Object.keys(jornadaGroups).sort((a, b) => parseInt(a) - parseInt(b));

        if (jornadaNums.length === 0) {
            document.getElementById('bote-content').innerHTML = '<p class="loading">No hay jornadas disponibles</p>';
            return;
        }

        // If currentJornadaIndex is -1 (first time), find most recent jornada with some results
        if (this.currentJornadaIndex === -1) {
            // Find the HIGHEST jornada number that has results
            let foundIndex = -1;
            for (let i = jornadaNums.length - 1; i >= 0; i--) {
                const jornadaNum = parseInt(jornadaNums[i]);
                const jornada = this.jornadas.find(j => j.number === jornadaNum);
                // Check if any match has a result
                if (jornada && jornada.matches && jornada.matches.some(m => m.result && m.result.trim() !== '')) {
                    foundIndex = i;
                    break;
                }
            }

            this.currentJornadaIndex = foundIndex !== -1 ? foundIndex : 0;
        }

        // Ensure currentJornadaIndex is valid
        if (this.currentJornadaIndex >= jornadaNums.length) {
            this.currentJornadaIndex = jornadaNums.length - 1;
        }
        if (this.currentJornadaIndex < 0) {
            this.currentJornadaIndex = 0;
        }

        const currentJornadaNum = jornadaNums[this.currentJornadaIndex];
        const jornadaMovements = jornadaGroups[currentJornadaNum];
        const jornada = this.jornadas.find(j => j.number === parseInt(currentJornadaNum));

        const totalIngresos = jornadaMovements.reduce((sum, m) => sum + m.totalIngresos, 0);
        const totalGastos = jornadaMovements.reduce((sum, m) => sum + m.totalGastos, 0);
        const neto = totalIngresos - totalGastos;

        let html = `
            <div class="jornada-nav">
                <button onclick="boteManager.prevJornada()" ${this.currentJornadaIndex === 0 ? 'disabled' : ''}>
                    ← Anterior
                </button>
                <span>Jornada ${currentJornadaNum} - ${jornada ? jornada.date : 'N/A'}</span>
                <button onclick="boteManager.nextJornada()" ${this.currentJornadaIndex === jornadaNums.length - 1 ? 'disabled' : ''}>
                    Siguiente →
                </button>
            </div>

            <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255, 145, 0, 0.08); border-radius: 8px; border: 1px solid rgba(255, 145, 0, 0.3);">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div>
                        <strong style="color: #ff9100;">Total Ingresos:</strong> 
                        <span class="positive">${totalIngresos.toFixed(2)} €</span>
                    </div>
                    <div>
                        <strong style="color: #ff9100;">Total Gastos:</strong> 
                        <span class="negative">${totalGastos.toFixed(2)} €</span>
                    </div>
                    <div>
                        <strong style="color: #ff9100;">Neto:</strong> 
                        <span class="${neto >= 0 ? 'positive' : 'negative'}">${neto.toFixed(2)} €</span>
                    </div>
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table class="bote-table">
                    <thead>
                        <tr>
                            <th rowspan="2">Socio</th>
                            <th rowspan="2">Aciertos</th>
                            <th rowspan="2">Aportación</th>
                            <th rowspan="2">Columna</th>
                            <th colspan="1" style="background: #e65100;">Penalizaciones</th>
                            <th rowspan="2">Sellado</th>
                            <th rowspan="2">Premios</th>
                            <th rowspan="2">Neto</th>
                            <th rowspan="2">Bote</th>
                        </tr>
                        <tr>
                            <th style="background: #ff9100; font-size: 0.7rem;">Unos</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        jornadaMovements
            .sort((a, b) => a.memberName.localeCompare(b.memberName))
            .forEach(m => {
                html += `
                    <tr>
                        <td>${m.memberName}${m.exento ? ' 🎁' : ''}${m.jugaDobles ? ' 2️⃣' : ''}</td>
                        <td>${m.aciertos}</td>
                        <td class="positive">${m.aportacion.toFixed(2)} €</td>
                        <td class="negative">${m.costeColumna.toFixed(2)} €</td>
                        <td class="negative">${m.penalizacionUnos.toFixed(2)} €</td>
                        <td class="${m.sellado < 0 ? 'positive' : 'negative'}">${m.sellado.toFixed(2)} €</td>
                        <td class="positive">${m.premios.toFixed(2)} €</td>
                        <td class="${m.neto >= 0 ? 'positive' : 'negative'}">${m.neto.toFixed(2)} €</td>
                        <td class="${m.boteAcumulado >= 0 ? 'positive' : 'negative'}">${m.boteAcumulado.toFixed(2)} €</td>
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
     * Render Vista Socios - Detailed by member
     */
    renderVistaSocios(movements) {
        let html = `
            <table class="bote-table">
                <thead>
                    <tr>
                        <th>Socio</th>
                        <th>Bote Actual</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.members
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(member => {
                const memberMovements = movements.filter(m => m.memberId === member.id);
                const bote = memberMovements.length > 0
                    ? memberMovements[memberMovements.length - 1].boteAcumulado
                    : 0;

                const boteClass = bote > 0 ? 'positive' : bote < 0 ? 'negative' : 'neutral';

                html += `
                    <tr>
                        <td><strong>${member.name}</strong></td>
                        <td class="${boteClass}">${bote.toFixed(2)} €</td>
                        <td>
                            <button class="btn-action" onclick="boteManager.showMemberDetail('${member.name}')">
                                Ver Detalle Completo
                            </button>
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
     * Show detailed modal for a specific member
     */
    showMemberDetail(memberName) {
        const member = this.members.find(m => m.name === memberName);
        if (!member) return;

        const movements = this.calculateAllMovements();
        const memberMovements = movements.filter(m => m.memberId === member.id);

        document.getElementById('detalle-socio-nombre').textContent = `Detalle de ${memberName}`;

        let html = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="color: #ff9100; margin-bottom: 0.5rem;">Resumen</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div>
                        <strong>Total Ingresos:</strong> 
                        <span class="positive">${memberMovements.reduce((s, m) => s + m.totalIngresos, 0).toFixed(2)} €</span>
                    </div>
                    <div>
                        <strong>Total Gastos:</strong> 
                        <span class="negative">${memberMovements.reduce((s, m) => s + m.totalGastos, 0).toFixed(2)} €</span>
                    </div>
                    <div>
                        <strong>Bote Actual:</strong> 
                        <span class="${memberMovements.length > 0 && memberMovements[memberMovements.length - 1].boteAcumulado >= 0 ? 'positive' : 'negative'}">
                            ${memberMovements.length > 0 ? memberMovements[memberMovements.length - 1].boteAcumulado.toFixed(2) : '0.00'} €
                        </span>
                    </div>
                </div>
            </div>
            
            <h3 style="color: #ff9100; margin-bottom: 0.5rem;">Movimientos por Jornada</h3>
            <div style="max-height: 400px; overflow-y: auto;">
                <table class="detail-table">
                    <thead>
                        <tr>
                            <th>J</th>
                            <th>Fecha</th>
                            <th>Aciertos</th>
                            <th>Ingresos</th>
                            <th>Gastos</th>
                            <th>Neto</th>
                            <th>Bote</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        memberMovements.forEach(m => {
            html += `
                <tr>
                    <td>${m.jornadaNum}</td>
                    <td>${m.jornadaDate}</td>
                    <td>${m.aciertos}${m.exento ? ' 🎁' : ''}${m.jugaDobles ? ' 2️⃣' : ''}</td>
                    <td class="positive">${m.totalIngresos.toFixed(2)} €</td>
                    <td class="negative">${m.totalGastos.toFixed(2)} €</td>
                    <td class="${m.neto >= 0 ? 'positive' : 'negative'}">${m.neto.toFixed(2)} €</td>
                    <td class="${m.boteAcumulado >= 0 ? 'positive' : 'negative'}">${m.boteAcumulado.toFixed(2)} €</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('detalle-socio-content').innerHTML = html;
        document.getElementById('modal-detalle-socio').style.display = 'block';
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
            </table>
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

        this.config.costeColumna = parseFloat(document.getElementById('config-coste-columna').value);
        this.config.costeDobles = parseFloat(document.getElementById('config-coste-dobles').value);
        this.config.aportacionSemanal = parseFloat(document.getElementById('config-aportacion').value);
        this.config.boteInicial = parseFloat(document.getElementById('config-bote-inicial').value);

        try {
            await this.saveConfig();

            alert('Configuración guardada correctamente');
            this.closeModal('modal-config');

            // Re-render
            this.render();

        } catch (error) {
            console.error('Error saving config:', error);
            alert('Error al guardar la configuración');
        }
    }

    /**
     * Export data to CSV
     */
    exportData() {
        const movements = this.calculateAllMovements();

        let csv = 'Socio,Jornada,Fecha,Aciertos,Aportación,Coste Columna,Pen. 1s,Sellado,Premios,Ingresos Manual,Total Ingresos,Total Gastos,Neto,Bote Acumulado,Exento,Juega Dobles\n';

        movements.forEach(m => {
            csv += `${m.memberName},${m.jornadaNum},${m.jornadaDate},${m.aciertos},${m.aportacion},${m.costeColumna},${m.penalizacionUnos},${m.sellado},${m.premios},${m.ingresosManual},${m.totalIngresos},${m.totalGastos},${m.neto},${m.boteAcumulado},${m.exento ? 'Sí' : 'No'},${m.jugaDobles ? 'Sí' : 'No'}\n`;
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
}

// Initialize on page load
let boteManager;
document.addEventListener('DOMContentLoaded', () => {
    boteManager = new BoteManager();
});
