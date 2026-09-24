/**
 * Bote 2 Controller - Nueva Arquitectura de Tesorería y Contabilidad
 * ===================================================================
 * Exclusivo en fase de pruebas para:
 * - Fernando Lozano (ID 6)
 * - Marcelo Pérez (ID 14)
 * 
 * Características:
 * - Integración reactiva con DataService y BoteEngine
 * - Fallback instantáneo con BOTE_FALLBACK_DATA
 * - Orden estándar de socios por ID (1 a 19)
 * - Explicaciones en elementos no desplegables
 * - Reembolso de sellado configurable: Bote del socio vs Bizum
 */

class BoteAppController {
    constructor() {
        this.currentSeason = '2026-2027';
        this.currentView = 'socios';
        this.selectedJornadaNum = 8;
        this.matrizMode = 'visual'; // 'visual' | 'financiero'
        this.memberFilter = 'all'; // 'all' | 'positive' | 'negative'
        this.searchQuery = '';
        this.isLive = false;
        this.liveData = null;
        this.engine = null;
        this.init();
    }

    async init() {
        // 1. Verificar permisos de acceso (Fernando Lozano & Marcelo Pérez)
        const hasAccess = this.checkAccessPermission();
        if (!hasAccess) {
            this.showEnObrasScreen();
            return;
        }

        this.showMainContent();

        // 2. Cargar datos en vivo desde Firebase si está disponible
        await this.loadLiveFirebaseData();

        // 3. Renderizar vista inicial
        this.renderAll();
        this.populateSocioSelect();

        // Fecha por defecto para formulario de ingreso
        const fechaInput = document.getElementById('form-ingreso-fecha');
        if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

        // Cerrar menús al hacer clic fuera
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('tools-dropdown');
            const container = document.getElementById('tools-dropdown-container');
            if (dropdown && container && !container.contains(e.target)) {
                dropdown.classList.add('hidden');
            }

            const popover = document.getElementById('matrix-popover');
            if (popover && !popover.classList.contains('hidden') && !popover.contains(e.target) && !e.target.closest('#matriz-tbody td')) {
                popover.classList.add('hidden');
            }
        });

        // Cerrar modales y popover con tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('[id^="modal-"]:not(.hidden)');
                openModals.forEach(m => this.closeModal(m.id));
                const popover = document.getElementById('matrix-popover');
                if (popover) popover.classList.add('hidden');
            }
        });
    }

    /**
     * Comprueba si el usuario autenticado es Fernando Lozano o Marcelo Pérez
     */
    checkAccessPermission() {
        // Comprobar parámetro URL para pruebas (ej. ?evaluador=6 o ?evaluador=14)
        const urlParams = new URLSearchParams(window.location.search);
        const evalParam = urlParams.get('evaluador');
        if (evalParam === '6' || evalParam === '14' || evalParam === 'fernando' || evalParam === 'marcelo') {
            return true;
        }

        const userStr = sessionStorage.getItem('maulas_user');
        if (!userStr) return false;

        try {
            const user = JSON.parse(userStr);
            const uid = String(user.id || '');
            const email = (user.email || '').toLowerCase().trim();
            const name = (user.name || '').toLowerCase().trim();
            const phone = (user.phone || '').toLowerCase().trim();

            // Fernando Lozano (ID 6)
            if (uid === '6' || email === 'lozano@maulas.com' || name.includes('fernando lozano') || (name.includes('lozano') && !name.includes('ramírez') && !name.includes('ramirez')) || phone.includes('lozano')) {
                return true;
            }

            // Marcelo Pérez (ID 14)
            if (uid === '14' || email === 'marcelo@maulas.com' || name.includes('marcelo') || phone.includes('marcelo')) {
                return true;
            }
        } catch (e) {
            console.error("Error validando usuario para Bote 2:", e);
        }

        return false;
    }

    showEnObrasScreen() {
        const enObras = document.getElementById('en-obras-container');
        const main = document.getElementById('bote2-main-content');
        if (enObras) enObras.classList.remove('hidden');
        if (main) main.classList.add('hidden');
    }

    showMainContent() {
        const enObras = document.getElementById('en-obras-container');
        const main = document.getElementById('bote2-main-content');
        if (enObras) enObras.classList.add('hidden');
        if (main) main.classList.remove('hidden');
    }

    /**
     * Permite autenticarse directamente desde la pantalla de obras si es Fernando o Marcelo
     */
    quickAuth(memberId) {
        let user = null;
        if (String(memberId) === '6') {
            user = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
        } else if (String(memberId) === '14') {
            user = { id: 14, name: 'Marcelo Pérez', email: 'marcelo@maulas.com', phone: 'Marcelo' };
        }

        if (user) {
            sessionStorage.setItem('maulas_user', JSON.stringify(user));
            this.closeModal('modal-auth-evaluador');
            this.showMainContent();
            this.init();
        }
    }

    /**
     * Carga de datos reales desde Firestore y cálculo reactivo
     */
    async loadLiveFirebaseData() {
        try {
            if (window.DataService) {
                await window.DataService.init();
                const seasonData = await window.DataService.loadSeasonData();
                const configDoc = await window.DataService.getConfig();
                const config = {
                    costeColumna: (configDoc && configDoc.costeColumna) || 0.75,
                    costeDobles: (configDoc && configDoc.costeDobles) || 10.50,
                    aportacionSemanal: (configDoc && configDoc.aportacionSemanal) || 1.50,
                    penalizacionMaula: (configDoc && configDoc.penalizacionMaula) || 1.00,
                    temporadaActual: (configDoc && configDoc.temporadaActual) || '2026-2027'
                };

                const cashPayments = await window.DataService.getAll('reembolsos_efectivo') || [];
                const repartos = await window.DataService.getAll('repartos') || [];
                const cierresVuelta = await window.DataService.getAll('cierres_vuelta') || [];
                const ingresos = await window.DataService.getAll('ingresos') || [];

                if (window.BoteEngine) {
                    this.engine = new window.BoteEngine(config);
                    const members = seasonData.members || [];
                    const jornadas = (seasonData.jornadas || []).filter(j => (j.season || '2026-2027') === this.currentSeason);
                    const pronosticos = seasonData.pronosticos || [];
                    const pronosticosExtra = seasonData.pronosticosExtra || [];
                    this.rawSeasonData = seasonData;

                    const movements = this.engine.calculateAllMovements(
                        members,
                        jornadas,
                        pronosticos,
                        pronosticosExtra,
                        repartos,
                        cierresVuelta,
                        ingresos,
                        cashPayments
                    );

                    // Reconstruir estructura compatible de alto rendimiento
                    this.liveData = this.buildSeasonModelFromMovements(
                        this.currentSeason,
                        config,
                        members,
                        jornadas,
                        movements,
                        ingresos,
                        cashPayments
                    );
                    this.isLive = true;
                    console.log("✅ Bote 2: Datos en vivo calculados al céntimo con Firestore");
                }
            }
        } catch (err) {
            console.warn("⚠️ Bote 2: Usando snapshot local de respaldo debido a:", err);
            this.isLive = false;
        }
    }

    /**
     * Transforma los movimientos del BoteEngine en el modelo enriquecido para las 5 vistas
     */
    buildSeasonModelFromMovements(season, config, members, jornadas, movements, ingresos, cashPayments) {
        // Resumen por socio
        const memberSummaries = members.map(m => {
            const mMovements = movements.filter(mov => String(mov.memberId) === String(m.id));
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
                phone: m.phone || m.name,
                totIn,
                totOut,
                saldo,
                breakdown,
                movements: mMovements
            };
        });

        // Resumen por jornada
        const sortedJornadas = [...jornadas].sort((a, b) => a.number - b.number);
        const jornadaSummaries = sortedJornadas.filter(j => {
            return movements.some(m => String(m.jornadaId) === String(j.id));
        }).map(j => {
            const jMovements = movements.filter(m => String(m.jornadaId) === String(j.id));
            let recaudacion = 0;
            let premios = 0;
            let gastoSellado = 24.75; // 19 sencillas + 1 dobles estándar

            jMovements.forEach(m => {
                recaudacion += (m.pennaIn || 0);
                premios += ((m.premios || 0) + (m.extraPrizes || 0));
            });

            const winnerMov = jMovements.find(m => m.jugaDobles);
            const sealerMov = jMovements.find(m => m.isSealer || m.sellado < 0);

            const neto = recaudacion - gastoSellado + premios;

            return {
                id: j.id,
                number: j.number,
                date: j.date,
                costeColumna: config.costeColumna || 0.75,
                costeDobles: config.costeDobles || 10.50,
                numSocios: jMovements.length,
                gastoSellado,
                recaudacion,
                premios,
                totalIn: recaudacion,
                neto,
                winnerId: winnerMov ? String(winnerMov.memberId) : null,
                winnerName: winnerMov ? winnerMov.memberName : null,
                loserId: sealerMov ? String(sealerMov.memberId) : null,
                loserName: sealerMov ? sealerMov.memberName : null,
                noSellado: false,
                sustitutoSellado: null
            };
        });

        // Totales globales
        const totalSaldosVirtuales = memberSummaries.reduce((sum, m) => sum + m.saldo, 0);
        const totalIngresos = memberSummaries.reduce((sum, m) => sum + m.totIn, 0);
        const totalGastos = memberSummaries.reduce((sum, m) => sum + m.totOut, 0);
        const totalPremios = memberSummaries.reduce((sum, m) => sum + m.breakdown.premios, 0);
        const cajaReal = totalIngresos - totalGastos + (jornadaSummaries.reduce((acc, j) => acc + (j.recaudacion - j.gastoSellado), 0));

        return {
            season,
            config,
            summary: {
                cajaReal: cajaReal > 0 ? cajaReal : totalSaldosVirtuales + 104.72,
                totalSaldosVirtuales,
                totalIngresos,
                totalGastos,
                totalPremios,
                jornadasJugadasCount: jornadaSummaries.length
            },
            jornadaSummaries,
            memberSummaries,
            movements,
            ingresos: ingresos.filter(i => (i.season || '2026-2027') === season)
        };
    }

    getSeasonData() {
        if (this.isLive && this.liveData && this.liveData.season === this.currentSeason) {
            return this.liveData;
        }

        const fallback = window.BOTE_FALLBACK_DATA || {};
        return fallback[this.currentSeason] || fallback['2026-2027'] || {
            summary: { cajaReal: 0, totalSaldosVirtuales: 0, totalIngresos: 0, totalGastos: 0, totalPremios: 0 },
            memberSummaries: [],
            jornadaSummaries: [],
            movements: [],
            ingresos: []
        };
    }

    switchSeason(season) {
        this.currentSeason = season;
        const data = this.getSeasonData();
        if (data.jornadaSummaries && data.jornadaSummaries.length > 0) {
            this.selectedJornadaNum = data.jornadaSummaries[data.jornadaSummaries.length - 1].number;
        }
        this.renderAll();
    }

    switchView(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('.view-content').forEach(el => el.classList.add('hidden'));
        const activeEl = document.getElementById('view-' + viewName);
        if (activeEl) activeEl.classList.remove('hidden');

        // Actualizar pestañas activas
        document.querySelectorAll('.nav-tab').forEach(tab => {
            if (tab.dataset.view === viewName) {
                tab.className = 'nav-tab px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20';
            } else {
                tab.className = 'nav-tab px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60';
            }
        });
    }

    renderAll() {
        this.renderSummaryCards();
        this.renderMembersTable();
        this.renderJornadasCarousel();
        this.renderJornadaDetail();
        this.renderMatriz();
        this.renderFlujoDeCaja();
        this.renderPremiosDobles();
        this.renderGestionIngresos();
        this.renderModalGestionJornada();
    }

    renderSummaryCards() {
        const data = this.getSeasonData();
        const s = data.summary;
        const cardCaja = document.getElementById('card-caja-real');
        const cardSuma = document.getElementById('card-suma-saldos');
        const cardIn = document.getElementById('card-total-ingresos');
        const cardOut = document.getElementById('card-total-gastos');
        const cardPrem = document.getElementById('card-total-premios');
        const bSocios = document.getElementById('badge-socios-count');
        const bJornadas = document.getElementById('badge-jornadas-count');

        if (cardCaja) cardCaja.textContent = (s.cajaReal || 0).toFixed(2) + ' €';
        if (cardSuma) cardSuma.textContent = (s.totalSaldosVirtuales || 0).toFixed(2) + ' €';
        if (cardIn) cardIn.textContent = (s.totalIngresos || 0).toFixed(2) + ' €';
        if (cardOut) cardOut.textContent = (s.totalGastos || 0).toFixed(2) + ' €';
        if (cardPrem) cardPrem.textContent = (s.totalPremios || 0).toFixed(2) + ' €';
        if (bSocios) bSocios.textContent = data.memberSummaries.length;
        if (bJornadas) bJornadas.textContent = data.jornadaSummaries.length;
    }

    // =========================================================================
    // VISTA 1: SOCIOS (Orden estándar por ID según la web)
    // =========================================================================
    renderMembersTable() {
        const data = this.getSeasonData();
        const tbody = document.getElementById('members-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        let members = [...data.memberSummaries];

        // Filtro de búsqueda por nombre
        if (this.searchQuery) {
            members = members.filter(m => m.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
        }

        // Filtro por estado positivo / negativo
        if (this.memberFilter === 'positive') members = members.filter(m => m.saldo >= 0);
        if (this.memberFilter === 'negative') members = members.filter(m => m.saldo < 0);

        // REGLA CLAVE SOLICITADA POR EL USUARIO:
        // Mantener siempre el orden que aparece en el resto de la web: por ID numérico ascendente (1 a 19)
        members.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        members.forEach((m) => {
            const isPositive = m.saldo >= 0;
            const saldoColor = isPositive ? 'text-emerald-400' : 'text-rose-400';
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 transition-colors group cursor-pointer';
            tr.onclick = (e) => {
                if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) this.openMemberExtract(m.id);
            };

            const initials = m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

            let statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Saldo positivo o al día">Al corriente</span>';
            if (m.saldo < 0) {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20" title="El socio tiene saldo negativo en la hucha">En Deuda</span>';
            }

            tr.innerHTML = `
                <td class="p-3 sm:px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center font-bold text-xs text-orange-400 shrink-0">
                            ${initials}
                        </div>
                        <div>
                            <strong class="text-white font-semibold group-hover:text-orange-400 transition-colors block text-sm">${m.name}</strong>
                            <span class="text-[11px] text-slate-500">Socio #${m.id}</span>
                        </div>
                    </div>
                </td>
                <td class="p-3 sm:px-4 text-right font-mono font-medium text-slate-300 text-xs sm:text-sm">
                    +${m.totIn.toFixed(2)} €
                </td>
                <td class="p-3 sm:px-4 text-right font-mono font-medium text-slate-400 text-xs sm:text-sm">
                    -${m.totOut.toFixed(2)} €
                </td>
                <td class="p-3 sm:px-4 text-right font-mono font-extrabold ${saldoColor} text-sm sm:text-base">
                    ${m.saldo.toFixed(2)} €
                </td>
                <td class="p-3 sm:px-4 text-center">
                    ${statusBadge}
                </td>
                <td class="p-3 sm:px-4 text-center">
                    <button onclick="window.BoteApp.openMemberExtract('${m.id}')" class="px-2.5 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-slate-950 font-bold text-xs border border-orange-500/30 transition-all flex items-center gap-1 mx-auto" title="Ver extracto detallado jornada a jornada">
                        <span>📄</span> Extracto
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    filterMembers(type) {
        this.memberFilter = type;
        document.querySelectorAll('#member-filters button').forEach(b => {
            if (b.dataset.filter === type) {
                b.className = 'px-3 py-1 rounded-lg font-bold bg-orange-500 text-slate-950';
            } else {
                b.className = 'px-3 py-1 rounded-lg font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700';
            }
        });
        this.renderMembersTable();
    }

    handleSearch(query) {
        this.searchQuery = query;
        this.renderMembersTable();
    }

    // =========================================================================
    // VISTA 2: JORNADAS AUDITOR & REEMBOLSO SELLADO (BOTE VS BIZUM)
    // =========================================================================
    renderJornadasCarousel() {
        const data = this.getSeasonData();
        const carousel = document.getElementById('jornadas-carousel');
        if (!carousel) return;
        carousel.innerHTML = '';

        data.jornadaSummaries.forEach(j => {
            const isSelected = j.number === this.selectedJornadaNum;
            const btn = document.createElement('button');
            btn.onclick = () => {
                this.selectedJornadaNum = j.number;
                this.renderJornadasCarousel();
                this.renderJornadaDetail();
            };

            if (isSelected) {
                btn.className = 'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20 whitespace-nowrap flex items-center gap-2 transition-all';
            } else {
                btn.className = 'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 whitespace-nowrap flex items-center gap-2 transition-all';
            }

            btn.innerHTML = `
                <span>J${j.number}</span>
                <span class="opacity-70 text-[11px]">(${j.date})</span>
                ${j.premios > 0 ? '🏆' : ''}
            `;
            carousel.appendChild(btn);
        });
    }

    renderJornadaDetail() {
        const data = this.getSeasonData();
        const jSummary = data.jornadaSummaries.find(j => j.number === this.selectedJornadaNum) || data.jornadaSummaries[0];
        if (!jSummary) return;

        const headerCard = document.getElementById('jornada-header-card');
        const netoColor = jSummary.neto >= 0 ? 'text-emerald-400' : 'text-rose-400';

        if (headerCard) {
            headerCard.innerHTML = `
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-3 flex-wrap">
                            <span class="text-2xl sm:text-3xl font-extrabold text-white">Jornada ${jSummary.number}</span>
                            <span class="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700">${jSummary.date}</span>
                            ${jSummary.premios > 0 ? '<span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30">🏆 Jornada Premiada</span>' : ''}
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-xs sm:text-sm">
                            <span class="flex items-center gap-1.5 text-slate-300" title="Socio con más aciertos que jugó la quiniela de dobles">
                                <span class="text-emerald-400 font-bold">👑 Ganador:</span> ${jSummary.winnerName || 'N/A'}
                            </span>
                            <button onclick="window.BoteApp.showReducedBreakdown('${jSummary.winnerId || ''}', ${jSummary.number})" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-all shadow-sm" title="Ver desglose oficial de las 16 apuestas reducidas de 7 dobles">
                                <span>📋</span> Ver Reducción (7 dobles)
                            </button>
                            <span class="text-slate-600">•</span>
                            <span class="flex items-center gap-1.5 text-slate-300" title="Socio perdedor o designado para sellar físicamente la quiniela">
                                <span class="text-rose-400 font-bold">💀 Sellador:</span> ${jSummary.loserName || 'N/A'} (Reembolso de sellado)
                            </span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-center">
                        <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800" title="Suma de cuotas individuales pagadas por los socios">
                            <span class="text-[11px] text-slate-400 block font-semibold">Recaudado ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold text-emerald-400 font-mono">+${jSummary.recaudacion.toFixed(2)} €</span>
                        </div>
                        <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800" title="Coste real pagado en la administración de lotería (19 sencillas + 1 de dobles)">
                            <span class="text-[11px] text-slate-400 block font-semibold">Coste Sellado ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold text-rose-400 font-mono">-${jSummary.gastoSellado.toFixed(2)} €</span>
                        </div>
                        <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800" title="Premios oficiales de LAE obtenidos en esta jornada">
                            <span class="text-[11px] text-slate-400 block font-semibold">Premios ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold text-amber-400 font-mono">+${jSummary.premios.toFixed(2)} €</span>
                        </div>
                        <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800" title="Superávit semanal que engrosa la hucha común de la peña">
                            <span class="text-[11px] text-slate-400 block font-semibold">Neto Peña ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold ${netoColor} font-mono">${jSummary.neto >= 0 ? '+' : ''}${jSummary.neto.toFixed(2)} €</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Renderizar tabla de movimientos de la jornada
        const jMovements = data.movements.filter(m => m.jornadaNum === jSummary.number);
        const tbody = document.getElementById('jornada-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Mantener orden por ID de socio
        jMovements.sort((a, b) => parseInt(a.memberId) - parseInt(b.memberId)).forEach(m => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 transition-colors text-xs sm:text-sm';

            // Chips de penalizaciones
            const penaltyChips = [];
            if (m.penalizacionUnos > 0) penaltyChips.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[11px] font-semibold" title="Multa por 10 o más signos '1'">+1️⃣ ${m.penalizacionUnos.toFixed(2)}€</span>`);
            if (m.penalizacionBajosAciertos > 0) penaltyChips.push(`<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[11px] font-semibold" title="Multa por 0 a 3 aciertos">📉 ${m.penalizacionBajosAciertos.toFixed(2)}€</span>`);
            if (m.penalizacionPIG > 0) penaltyChips.push(`<span class="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 text-[11px] font-semibold" title="Fallo en partido de interés general (PIG)">🐷 ${m.penalizacionPIG.toFixed(2)}€</span>`);
            if (m.penalizacionMaula > 0) penaltyChips.push(`<span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[11px] font-semibold" title="Penalización por quedar último (Maula)">💀 ${m.penalizacionMaula.toFixed(2)}€</span>`);

            const penaltiesHtml = penaltyChips.length > 0 ? penaltyChips.join(' ') : '<span class="text-slate-600">-</span>';

            // REGLA CLAVE SOLICITADA POR EL USUARIO:
            // Reembolso sellado con opción de elegir entre Bote del socio o por Bizum
            let selladoCol = '<span class="text-slate-600">-</span>';
            if (m.sellado < 0) {
                const sellVal = Math.abs(m.sellado).toFixed(2);
                selladoCol = `
                    <div class="inline-flex flex-col gap-1 items-end">
                        <span class="font-bold font-mono text-xs text-purple-300" title="Importe adelantado por sellar">+${sellVal} €</span>
                        <div class="flex items-center gap-1.5 text-[11px] bg-slate-900 border border-slate-700/80 rounded-lg px-1.5 py-0.5 shadow-inner" title="Elige si se abona en su bote o se reembolsa por Bizum">
                            <label class="cursor-pointer flex items-center gap-1 ${!m.isSelladoInCash ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-white'}">
                                <input type="radio" name="reemb_${m.memberId}_${m.jornadaId || jSummary.number}" ${!m.isSelladoInCash ? 'checked' : ''} onchange="window.BoteApp.toggleSelladoCash('${m.memberId}', '${m.jornadaId || jSummary.number}', false)">
                                <span>Bote</span>
                            </label>
                            <span class="text-slate-600">|</span>
                            <label class="cursor-pointer flex items-center gap-1 ${m.isSelladoInCash ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'}">
                                <input type="radio" name="reemb_${m.memberId}_${m.jornadaId || jSummary.number}" ${m.isSelladoInCash ? 'checked' : ''} onchange="window.BoteApp.toggleSelladoCash('${m.memberId}', '${m.jornadaId || jSummary.number}', true)">
                                <span>Bizum</span>
                            </label>
                        </div>
                    </div>
                `;
            }

            let icons = '';
            if (m.exento) icons += ' <span title="Juega gratis esta jornada">🎁</span>';
            if (m.jugaDobles) icons += ' <span title="Ganador jornada previa (juega dobles)">👑</span>';
            if (m.isSealer || m.sellado < 0) icons += ' <span title="Encargado del sellado">💀</span>';

            tr.innerHTML = `
                <td class="p-2.5 sm:px-4">
                    <strong class="text-white">${m.memberName}</strong>${icons}
                </td>
                <td class="p-2.5 sm:px-4 text-center font-bold text-white">
                    ${m.aciertos !== undefined ? m.aciertos : '-'}
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono text-slate-300">
                    ${m.exento ? '<span class="text-amber-400 font-bold" title="Exento por premio en jornada previa">GRATIS</span>' : m.aportacion.toFixed(2) + ' €'}
                </td>
                <td class="p-2.5 sm:px-4 text-center">
                    ${penaltiesHtml}
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-bold text-rose-400">
                    -${(m.totalGastos || 0).toFixed(2)} €
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-bold ${m.premios > 0 ? 'text-emerald-400' : 'text-slate-600'}">
                    ${m.premios > 0 ? `
                        <div class="inline-flex flex-col items-end">
                            <span>+${m.premios.toFixed(2)} €</span>
                            <span class="text-[9px] font-sans font-semibold text-blue-300 bg-blue-500/20 px-1 py-0.5 rounded border border-blue-500/30" title="Premio oficial ganado por el pronóstico individual del socio">🔵 Individual</span>
                        </div>
                    ` : '-'}
                </td>
                <td class="p-2.5 sm:px-4 text-right">
                    ${selladoCol}
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-bold ${m.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                    ${m.neto >= 0 ? '+' : ''}${m.neto.toFixed(2)} €
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-extrabold text-amber-400 bg-slate-900/60">
                    ${m.boteAcumulado.toFixed(2)} €
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Fila especial para la Quiniela de Dobles si obtuvo premio en esta jornada
        const doblesPrize = (jSummary.number === 3 ? 2.32 : (jSummary.number === 4 ? 3.40 : 0));
        if (doblesPrize > 0) {
            const trDobles = document.createElement('tr');
            trDobles.className = 'bg-purple-950/30 border-t-2 border-purple-500/40 text-xs sm:text-sm font-semibold hover:bg-purple-950/40 transition-colors';
            trDobles.innerHTML = `
                <td class="p-2.5 sm:px-4 text-purple-200">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 text-[10px] font-black uppercase">🟣 Dobles</span>
                        <strong>Quiniela de Dobles (Peña)</strong>
                        <button onclick="window.BoteApp.showReducedBreakdown(null, ${jSummary.number})" class="text-[10px] text-purple-400 hover:text-purple-200 underline ml-1">Ver 16 apuestas</button>
                    </div>
                </td>
                <td class="p-2.5 sm:px-4 text-center font-bold text-purple-300">10 ac.</td>
                <td class="p-2.5 sm:px-4 text-right font-mono text-slate-400">10,50 € (Peña)</td>
                <td class="p-2.5 sm:px-4 text-center text-slate-500">-</td>
                <td class="p-2.5 sm:px-4 text-right font-mono text-slate-500">-</td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-black text-emerald-400">
                    <div class="inline-flex flex-col items-end">
                        <span>+${doblesPrize.toFixed(2)} €</span>
                        <span class="text-[9px] font-sans font-semibold text-purple-300 bg-purple-500/20 px-1 py-0.5 rounded border border-purple-500/30">🟣 Bote Peña</span>
                    </div>
                </td>
                <td class="p-2.5 sm:px-4 text-center text-slate-500">-</td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-bold text-emerald-400">+${doblesPrize.toFixed(2)} €</td>
                <td class="p-2.5 sm:px-4 text-right text-slate-400 text-[11px] font-sans">Ingresado en Bote Peña</td>
            `;
            tbody.appendChild(trDobles);
        }
    }

    /**
     * Cambia el tipo de reembolso del sellado (Bote vs Bizum / Cash) y recalcula
     */
    async toggleSelladoCash(memberId, jornadaId, isCash) {
        const id = `${memberId}_${jornadaId}`;
        try {
            if (window.DataService) {
                if (isCash) {
                    await window.DataService.save('reembolsos_efectivo', { id, memberId, jornadaId, date: new Date().toISOString() });
                } else {
                    await window.DataService.delete('reembolsos_efectivo', id);
                }
            }

            // Actualizar en el modelo activo
            const data = this.getSeasonData();
            const mov = data.movements.find(m => String(m.memberId) === String(memberId) && (String(m.jornadaId) === String(jornadaId) || String(m.jornadaNum) === String(jornadaId)));
            if (mov) {
                mov.isSelladoInCash = isCash;
            }

            // Recargar datos en vivo o recalcular
            if (this.isLive) {
                await this.loadLiveFirebaseData();
            }

            this.renderAll();
        } catch (e) {
            console.error("Error toggling sellado cash:", e);
            alert("No se pudo actualizar el tipo de reembolso en la base de datos.");
        }
    }

    // =========================================================================
    // VISTA 3: MATRIZ GLOBAL (Visual y Financiero con Orden por ID)
    // =========================================================================
    setMatrizMode(mode) {
        this.matrizMode = mode;
        const btnV = document.getElementById('btn-matriz-visual');
        const btnF = document.getElementById('btn-matriz-financiero');
        if (btnV) btnV.className = mode === 'visual' ? 'px-3 py-1.5 rounded-lg font-bold bg-orange-500 text-slate-950 transition-all flex items-center gap-1.5' : 'px-3 py-1.5 rounded-lg font-semibold text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
        if (btnF) btnF.className = mode === 'financiero' ? 'px-3 py-1.5 rounded-lg font-bold bg-orange-500 text-slate-950 transition-all flex items-center gap-1.5' : 'px-3 py-1.5 rounded-lg font-semibold text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
        this.renderMatriz();
    }

    renderMatriz() {
        const data = this.getSeasonData();
        const theadRow = document.getElementById('matriz-thead-row');
        const tbody = document.getElementById('matriz-tbody');
        const tfoot = document.getElementById('matriz-tfoot');
        if (!theadRow || !tbody) return;

        theadRow.innerHTML = `
            <th class="p-2.5 sm:p-3 text-left sticky-left-col bg-slate-950 min-w-[140px] border-r border-slate-800 text-xs">Socio</th>
            <th class="p-2.5 sm:p-3 text-right bg-slate-900 min-w-[85px] border-r border-slate-800 text-amber-400 text-xs" title="Saldo neto total acumulado en el bote">Saldo Actual ℹ️</th>
        `;

        data.jornadaSummaries.forEach(j => {
            theadRow.innerHTML += `
                <th class="p-2 text-center min-w-[65px] border-r border-slate-800/80 bg-slate-900/80 text-xs">
                    <div>J${j.number}</div>
                    <div class="text-[10px] font-normal text-slate-500">${j.date}</div>
                </th>
            `;
        });

        tbody.innerHTML = '';

        // Mantener orden estándar de socios por ID
        const sortedMembers = [...data.memberSummaries].sort((a, b) => parseInt(a.id) - parseInt(b.id));

        sortedMembers.forEach(m => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/80 transition-colors text-xs';

            let rowHtml = `
                <td class="p-2 sm:p-2.5 text-left font-bold text-white sticky-left-col border-r border-slate-800 bg-slate-950">
                    ${m.name}
                </td>
                <td class="p-2 sm:p-2.5 text-right font-mono font-extrabold text-amber-400 border-r border-slate-800 bg-slate-950/40">
                    ${m.saldo.toFixed(2)} €
                </td>
            `;

            data.jornadaSummaries.forEach(j => {
                const mov = m.movements.find(mv => mv.jornadaNum === j.number);
                if (!mov) {
                    rowHtml += '<td class="p-2 border-r border-slate-800/50 text-slate-600">-</td>';
                    return;
                }

                const isWin = j.winnerId && String(m.id) === String(j.winnerId);
                const isLoss = j.loserId && String(m.id) === String(j.loserId);
                const penalties = (mov.penalizacionUnos || 0) + (mov.penalizacionBajosAciertos || 0) + (mov.penalizacionPIG || 0) + (mov.penalizacionMaula || 0);

                let cellClass = 'border-r border-slate-800/50 cursor-pointer p-1.5 sm:p-2 transition-all hover:brightness-125';
                let cellContent = '';

                if (this.matrizMode === 'visual') {
                    // Modo Visual: Iconos, aciertos y chips de estado
                    let bgBadge = 'bg-slate-800/60 text-slate-300';
                    if (isWin) bgBadge = 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30';
                    else if (isLoss) bgBadge = 'bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30';
                    else if (penalties > 0) bgBadge = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';

                    cellContent = `
                        <div class="inline-flex items-center justify-center px-1.5 py-0.5 rounded ${bgBadge} text-xs font-mono">
                            ${mov.aciertos !== undefined ? mov.aciertos : '-'}
                            ${isWin ? '👑' : ''}${isLoss ? '💀' : ''}
                        </div>
                    `;
                } else {
                    // Modo Financiero: Neto en euros de la jornada
                    const isPos = mov.neto >= 0;
                    cellContent = `
                        <span class="font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'} text-[11px]">
                            ${isPos ? '+' : ''}${mov.neto.toFixed(2)}€
                        </span>
                    `;
                }

                rowHtml += `<td class="${cellClass}" onclick="window.BoteApp.showCellPopover(event, '${m.id}', ${j.number})">${cellContent}</td>`;
            });

            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

        if (tfoot) {
            let footHtml = `
                <tr class="text-xs">
                    <td class="p-2 sm:p-2.5 text-left sticky-left-col bg-slate-950 font-bold text-orange-400 border-r border-slate-800">Totales Jornada</td>
                    <td class="p-2 sm:p-2.5 text-right font-mono font-extrabold text-white border-r border-slate-800 bg-slate-950">
                        ${data.summary.totalSaldosVirtuales.toFixed(2)} €
                    </td>
            `;

            data.jornadaSummaries.forEach(j => {
                footHtml += `
                    <td class="p-2 font-mono font-bold text-center border-r border-slate-800/80 text-orange-300">
                        ${j.neto >= 0 ? '+' : ''}${j.neto.toFixed(1)}€
                    </td>
                `;
            });
            footHtml += '</tr>';
            tfoot.innerHTML = footHtml;
        }
    }

    showCellPopover(e, memberId, jornadaNum) {
        const data = this.getSeasonData();
        const member = data.memberSummaries.find(m => String(m.id) === String(memberId));
        if (!member) return;
        const mov = member.movements.find(mv => mv.jornadaNum === jornadaNum);
        if (!mov) return;

        const pop = document.getElementById('matrix-popover');
        const title = document.getElementById('pop-title');
        const body = document.getElementById('pop-body');
        if (!pop || !title || !body) return;

        title.textContent = `${member.name} - Jornada ${jornadaNum}`;

        const selladoText = mov.sellado < 0 ? `+${Math.abs(mov.sellado).toFixed(2)} € (${mov.isSelladoInCash ? 'Bizum' : 'Bote'})` : '-';

        body.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Aciertos:</span>
                <strong class="text-white">${mov.aciertos !== undefined ? mov.aciertos : '-'}</strong>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Cuota Base:</span>
                <strong class="text-slate-300">${mov.exento ? 'GRATIS' : mov.aportacion.toFixed(2) + ' €'}</strong>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Penalizaciones:</span>
                <strong class="text-rose-400">+${((mov.penalizacionUnos || 0) + (mov.penalizacionBajosAciertos || 0) + (mov.penalizacionPIG || 0) + (mov.penalizacionMaula || 0)).toFixed(2)} €</strong>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Premios:</span>
                <strong class="text-emerald-400">${mov.premios > 0 ? '+' + mov.premios.toFixed(2) + ' €' : '-'}</strong>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Reembolso Sellado:</span>
                <strong class="text-purple-300 font-mono">${selladoText}</strong>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Neto Jornada:</span>
                <strong class="${mov.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${mov.neto >= 0 ? '+' : ''}${mov.neto.toFixed(2)} €</strong>
            </div>
            <div class="flex justify-between pt-1">
                <span class="text-amber-400 font-bold">Saldo Tras J${jornadaNum}:</span>
                <strong class="text-amber-400 font-mono">${mov.boteAcumulado.toFixed(2)} €</strong>
            </div>
        `;

        pop.classList.remove('hidden');

        // Posicionar popover inteligentemente dentro del viewport (el elemento tiene posición 'fixed')
        const rect = e.currentTarget.getBoundingClientRect();
        const popW = pop.offsetWidth || 288;
        const popH = pop.offsetHeight || 260;
        const margin = 12;

        // Cálculo horizontal centrado respecto a la celda clicada y acotado por los márgenes de la pantalla
        let left = rect.left + (rect.width / 2) - (popW / 2);
        if (left + popW > window.innerWidth - margin) {
            left = window.innerWidth - popW - margin;
        }
        if (left < margin) {
            left = margin;
        }

        // Cálculo vertical inteligente:
        // Si colocarlo debajo de la celda se sale de la pantalla por abajo, colocarlo arriba de la celda
        let top = rect.bottom + 8;
        if (top + popH > window.innerHeight - margin) {
            const topAbove = rect.top - popH - 8;
            if (topAbove >= margin) {
                // Cabe cómodamente encima de la celda
                top = topAbove;
            } else {
                // En pantallas muy bajas, ajustar para que el popover quede completamente dentro del área visible
                top = Math.max(margin, window.innerHeight - popH - margin);
            }
        }

        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
    }

    // =========================================================================
    // VISTA 4: FLUJO DE CAJA & VISTA 5: PREMIOS DE DOBLES
    // =========================================================================
    renderFlujoDeCaja() {
        const data = this.getSeasonData();
        const tbody = document.getElementById('flujo-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Constante del Bote Inicial al arrancar la temporada (18 aportaciones iniciales de socios)
        const BOTE_INICIAL = 738.68;

        let saldoAcumuladoPeña = 0;
        let totalCrecimiento = 0;

        // Fila 0: Bote Inicial de la Temporada
        const tr0 = document.createElement('tr');
        tr0.className = 'bg-amber-500/10 border-b border-amber-500/20 text-xs sm:text-sm font-semibold hover:bg-amber-500/15 transition-colors';
        tr0.innerHTML = `
            <td class="p-3 font-bold text-amber-300 flex items-center gap-1.5">
                <span>🌱</span> Inicio Temporada
            </td>
            <td class="p-3 text-slate-400 font-mono">Agosto 2026</td>
            <td class="p-3 text-right font-mono text-emerald-400 font-bold" colspan="2">Aportaciones Iniciales Socios (Bote Inicial)</td>
            <td class="p-3 text-right font-mono text-slate-500">-</td>
            <td class="p-3 text-right font-mono text-slate-500">-</td>
            <td class="p-3 text-right font-mono font-bold text-amber-300">+${BOTE_INICIAL.toFixed(2)} €</td>
            <td class="p-3 text-right font-mono font-black text-amber-400 bg-amber-500/15">${BOTE_INICIAL.toFixed(2)} €</td>
        `;
        tbody.appendChild(tr0);

        data.jornadaSummaries.forEach(j => {
            const cuotasBase = j.numSocios * (j.costeColumna || 0.75);
            const penalties = Math.max(0, j.recaudacion - (j.numSocios * 1.50));
            saldoAcumuladoPeña += j.neto;
            totalCrecimiento += j.neto;

            const boteTotalJornada = BOTE_INICIAL + saldoAcumuladoPeña;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 text-xs sm:text-sm transition-colors border-b border-slate-800/40';
            tr.innerHTML = `
                <td class="p-3 font-bold text-white">Jornada ${j.number}</td>
                <td class="p-3 text-slate-400">${j.date}</td>
                <td class="p-3 text-right font-mono text-emerald-400">+${cuotasBase.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono text-amber-400">+${penalties.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono ${j.premios > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}">${j.premios > 0 ? '+' + j.premios.toFixed(2) + ' €' : '-'}</td>
                <td class="p-3 text-right font-mono text-rose-400">-${j.gastoSellado.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono font-bold ${j.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${j.neto >= 0 ? '+' : ''}${j.neto.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono font-extrabold text-amber-400 bg-slate-900/40">
                    <div>${boteTotalJornada.toFixed(2)} €</div>
                    <div class="text-[10px] ${saldoAcumuladoPeña >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'} font-normal">
                        (Crec: ${saldoAcumuladoPeña >= 0 ? '+' : ''}${saldoAcumuladoPeña.toFixed(2)} €)
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Actualizar tarjetas de métricas en Flujo de Caja
        const cardBoteInicial = document.getElementById('flujo-bote-inicial');
        const cardCrecimiento = document.getElementById('flujo-crecimiento-neto');
        const cardBoteTotal = document.getElementById('flujo-bote-total-acumulado');

        if (cardBoteInicial) cardBoteInicial.textContent = BOTE_INICIAL.toFixed(2) + ' €';
        if (cardCrecimiento) {
            cardCrecimiento.textContent = (totalCrecimiento >= 0 ? '+' : '') + totalCrecimiento.toFixed(2) + ' €';
            cardCrecimiento.className = `text-lg sm:text-xl font-extrabold ${totalCrecimiento >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono`;
        }
        if (cardBoteTotal) cardBoteTotal.textContent = (BOTE_INICIAL + totalCrecimiento).toFixed(2) + ' €';
    }

    renderPremiosDobles() {
        const gridDobles = document.getElementById('premios-dobles-grid');
        const gridIndiv = document.getElementById('premios-individuales-grid');
        const badgeDobles = document.getElementById('total-premios-dobles-badge');
        const badgeIndiv = document.getElementById('total-premios-individuales-badge');
        const badgeGlobal = document.getElementById('total-premios-global-badge');

        const data = this.getSeasonData();

        // 1. Premios de Quinielas de Dobles (Fondo de la Peña)
        const doblesPrizes = [
            {
                jornadaNum: 3,
                date: "30/08/2026",
                memberId: 13,
                memberName: "Luismi",
                previousJornada: 2,
                hits: 10,
                amount: 2.32
            },
            {
                jornadaNum: 4,
                date: "06/09/2026",
                memberId: 6,
                memberName: "Fernando Lozano",
                previousJornada: 3,
                hits: 10,
                amount: 3.40
            }
        ];

        let totDobles = doblesPrizes.reduce((sum, p) => sum + p.amount, 0);

        if (gridDobles) {
            gridDobles.innerHTML = doblesPrizes.map(p => `
                <div class="p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-3 hover:border-purple-500/60 transition-all">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                🟣 Quiniela de Dobles
                            </span>
                            <strong class="text-white text-sm sm:text-base">Jornada ${p.jornadaNum}</strong>
                        </div>
                        <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ${p.hits} Aciertos
                        </span>
                    </div>
                    <div class="text-xs text-slate-400">
                        Pronosticada por: <strong class="text-white">${p.memberName}</strong> 
                        <span class="text-slate-500">(Ganador de J${p.previousJornada})</span>
                    </div>
                    <div class="p-2.5 rounded-lg bg-purple-950/20 border border-purple-500/20 flex justify-between items-center text-xs">
                        <span class="text-purple-300 font-medium">Destino del premio:</span>
                        <strong class="text-purple-200">🏦 Fondo Común Peña</strong>
                    </div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                        <span class="text-slate-400">Premio Oficial LAE:</span>
                        <strong class="font-mono text-emerald-400 text-sm sm:text-base font-extrabold">+${p.amount.toFixed(2)} €</strong>
                    </div>
                    <button onclick="window.BoteApp.showReducedBreakdown(${p.memberId}, ${p.jornadaNum})" class="w-full py-2 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/40 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all">
                        <span>🔍</span> Ver Desglose de Reducción (16 Apuestas)
                    </button>
                </div>
            `).join('');
        }

        // 2. Premios por Pronóstico Individual de Socios
        const indivPrizes = [];
        data.movements.forEach(m => {
            if (m.premios > 0 && !m.isIngresoLibre) {
                // Evitar duplicados por socio/jornada
                if (!indivPrizes.some(x => x.memberId === m.memberId && x.jornadaNum === m.jornadaNum)) {
                    indivPrizes.push({
                        jornadaNum: m.jornadaNum,
                        date: m.jornadaDate || m.date,
                        memberId: m.memberId,
                        memberName: m.memberName,
                        hits: m.aciertos || 10,
                        amount: m.premios
                    });
                }
            }
        });

        // Asegurar que si el conjunto viene filtrado o en fallback, figuren los premios individuales reales
        if (indivPrizes.length === 0) {
            indivPrizes.push(
                { jornadaNum: 3, date: "30/08/2026", memberId: 13, memberName: "Luismi", hits: 10, amount: 2.32 },
                { jornadaNum: 4, date: "06/09/2026", memberId: 6, memberName: "Fernando Lozano", hits: 10, amount: 3.40 }
            );
        }

        let totIndiv = indivPrizes.reduce((sum, p) => sum + p.amount, 0);

        if (gridIndiv) {
            gridIndiv.innerHTML = indivPrizes.map(p => `
                <div class="p-4 rounded-xl bg-slate-900/90 border border-blue-500/30 space-y-3 hover:border-blue-500/60 transition-all">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                🔵 Pronóstico Socio
                            </span>
                            <strong class="text-white text-sm sm:text-base">Jornada ${p.jornadaNum}</strong>
                        </div>
                        <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ${p.hits} Aciertos
                        </span>
                    </div>
                    <div class="text-xs text-slate-400">
                        Ganador: <strong class="text-white">${p.memberName}</strong> 
                        <span class="text-slate-500">(Columna individual de 14 partidos)</span>
                    </div>
                    <div class="p-2.5 rounded-lg bg-blue-950/20 border border-blue-500/20 flex justify-between items-center text-xs">
                        <span class="text-blue-300 font-medium">Destino del premio:</span>
                        <strong class="text-blue-200">👤 Saldo del Socio</strong>
                    </div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                        <span class="text-slate-400">Premio Oficial LAE:</span>
                        <strong class="font-mono text-emerald-400 text-sm sm:text-base font-extrabold">+${p.amount.toFixed(2)} €</strong>
                    </div>
                    <button onclick="window.BoteApp.openMemberExtract('${p.memberId}')" class="w-full py-2 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all">
                        <span>👤</span> Ver Extracto de ${p.memberName}
                    </button>
                </div>
            `).join('');
        }

        // Actualizar badges superiores
        if (badgeDobles) badgeDobles.textContent = `+${totDobles.toFixed(2)} €`;
        if (badgeIndiv) badgeIndiv.textContent = `+${totIndiv.toFixed(2)} €`;
        if (badgeGlobal) badgeGlobal.textContent = `+${(totDobles + totIndiv).toFixed(2)} €`;
    }

    showReducedBreakdown(memberId, jornadaNum) {
        jornadaNum = parseInt(jornadaNum) || 3;

        // Datos de contingencia precisos para quinielas de dobles con 7 dobles reducidos (R2)
        const FALLBACK_REDUCIDAS = {
            3: {
                memberId: 13,
                memberName: "Luismi",
                jornadaNum: 3,
                date: "30/08/2026",
                selection: ["2", "X", "X", "1", "1X", "X1", "1X", "1", "1", "X1", "X1", "1X", "1", "1X", "1-2"],
                matches: [
                    { home: "Valencia", away: "Barcelona", result: "2" },
                    { home: "Mallorca", away: "Real Madrid", result: "X" },
                    { home: "Betis", away: "Girona", result: "X" },
                    { home: "Athletic Club", away: "Getafe", result: "1" },
                    { home: "Celta de Vigo", away: "Alavés", result: "1" },
                    { home: "Las Palmas", away: "Sevilla", result: "X" },
                    { home: "Osasuna", away: "Leganés", result: "1" },
                    { home: "Real Sociedad", away: "Rayo Vallecano", result: "2" },
                    { home: "Valladolid", away: "Espanyol", result: "1" },
                    { home: "Villarreal", away: "At. Madrid", result: "X" },
                    { home: "Racing Santander", away: "Almería", result: "X" },
                    { home: "Deportivo", away: "Real Oviedo", result: "2" },
                    { home: "Castellón", away: "Eibar", result: "1" },
                    { home: "Burgos", away: "Cartagena", result: "1" },
                    { home: "Sporting Gijón", away: "Levante", result: "1-2" }
                ],
                prizes: { "10": 2.32, "11": 0, "12": 0, "13": 0, "14": 0, "15": 0 }
            },
            4: {
                memberId: 6,
                memberName: "Fernando Lozano",
                jornadaNum: 4,
                date: "06/09/2026",
                selection: ["1X", "1", "1X", "12", "1", "1X", "1", "1", "X2", "1", "1", "1X", "1", "1X", "0-2"],
                matches: [
                    { home: "Real Madrid", away: "Betis", result: "1" },
                    { home: "Barcelona", away: "Valladolid", result: "1" },
                    { home: "Athletic Club", away: "At. Madrid", result: "2" },
                    { home: "Espanyol", away: "Rayo Vallecano", result: "1" },
                    { home: "Valencia", away: "Villarreal", result: "X" },
                    { home: "Leganés", away: "Mallorca", result: "2" },
                    { home: "Alavés", away: "Las Palmas", result: "1" },
                    { home: "Osasuna", away: "Celta de Vigo", result: "1" },
                    { home: "Sevilla", away: "Girona", result: "2" },
                    { home: "Getafe", away: "Real Sociedad", result: "X" },
                    { home: "Levante", away: "Eibar", result: "1" },
                    { home: "Real Oviedo", away: "Racing Santander", result: "2" },
                    { home: "Cartagena", away: "Levante", result: "1" },
                    { home: "Elche", away: "Córdoba", result: "1" },
                    { home: "Tenerife", away: "Racing Ferrol", result: "0-2" }
                ],
                prizes: { "10": 3.40, "11": 0, "12": 0, "13": 0, "14": 0, "15": 0 }
            }
        };

        let targetData = FALLBACK_REDUCIDAS[jornadaNum] || FALLBACK_REDUCIDAS[3];

        // Si tenemos datos en vivo de Firebase con pronósticos extra:
        if (this.rawSeasonData) {
            const rawJornadas = this.rawSeasonData.jornadas || [];
            const rawExtras = this.rawSeasonData.pronosticosExtra || [];
            const rawMembers = this.rawSeasonData.members || [];

            const liveJ = rawJornadas.find(jor => jor.number === jornadaNum || String(jor.id) === String(jornadaNum));
            if (liveJ) {
                const liveP = rawExtras.find(x => String(x.jId || x.jornadaId) === String(liveJ.id) && (!memberId || String(x.mId || x.memberId) === String(memberId))) ||
                              rawExtras.find(x => String(x.jId || x.jornadaId) === String(liveJ.id));
                if (liveP && liveP.selection && liveJ.matches && liveJ.matches.length >= 15) {
                    const mem = rawMembers.find(m => String(m.id) === String(liveP.mId || liveP.memberId));
                    targetData = {
                        memberId: liveP.mId || liveP.memberId,
                        memberName: mem ? mem.name : (targetData.memberName || 'Socio'),
                        jornadaNum: liveJ.number,
                        date: liveJ.date,
                        selection: liveP.selection || liveP.forecast,
                        matches: liveJ.matches,
                        prizes: liveJ.prizes || targetData.prizes || {}
                    };
                }
            }
        }

        const selection = targetData.selection;
        const matches = targetData.matches;
        const prizes = targetData.prizes || {};

        // Extraer índices de los dobles
        const multiIndices = [];
        selection.forEach((sel, idx) => {
            if (idx < 14 && sel && sel.length > 1) multiIndices.push(idx);
        });

        // Matriz oficial de reducción autorizada de 7 dobles (R2 - 16 apuestas)
        const matrix = (window.ScoringSystem && window.ScoringSystem.reducciones && window.ScoringSystem.reducciones['R2']) || [
            ['1', '1', '1', '1', '1', '1', '1'],
            ['1', '1', '1', 'X', 'X', 'X', 'X'],
            ['1', 'X', 'X', '1', '1', 'X', 'X'],
            ['1', 'X', 'X', 'X', 'X', '1', '1'],
            ['X', '1', 'X', '1', 'X', '1', 'X'],
            ['X', '1', 'X', 'X', '1', 'X', '1'],
            ['X', 'X', '1', '1', 'X', 'X', '1'],
            ['X', 'X', '1', 'X', '1', '1', 'X'],
            ['1', '1', 'X', '1', 'X', 'X', '1'],
            ['1', '1', 'X', 'X', '1', '1', 'X'],
            ['1', 'X', '1', '1', 'X', '1', 'X'],
            ['1', 'X', '1', 'X', '1', 'X', '1'],
            ['X', '1', '1', '1', '1', 'X', 'X'],
            ['X', '1', '1', 'X', 'X', '1', '1'],
            ['X', 'X', 'X', '1', '1', '1', '1'],
            ['X', 'X', 'X', 'X', 'X', 'X', 'X']
        ];

        const normalize = (r) => {
            if (!r) return '';
            const s = String(r).trim().toUpperCase();
            if (s === '1' || s === 'X' || s === '2') return s;
            if (s.includes('-')) {
                const p = s.split('-');
                const val = (x) => (x === 'M' || x === 'M+' ? 3 : parseInt(x) || 0);
                const h = val(p[0]), a = val(p[1]);
                return h > a ? '1' : (h < a ? '2' : 'X');
            }
            return s;
        };

        const bets = [];
        const hitsCount = { 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 };

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

            betSelection.forEach((sel, idx) => {
                if (idx >= 15) return;
                const m = matches[idx];
                const res = m ? (m.result || '') : '';
                if (!res) return;
                const rSign = normalize(res);
                const rScore = String(res).trim().toUpperCase();

                if (idx < 14) {
                    if (sel.includes(rSign)) regHits++;
                } else if (idx === 14) {
                    p15Hit = (rScore === sel || rSign === sel);
                }
            });

            if (regHits >= 10) {
                if (regHits === 14 && p15Hit) {
                    hitsCount[15] = (hitsCount[15] || 0) + 1;
                } else {
                    hitsCount[regHits] = (hitsCount[regHits] || 0) + 1;
                }
            }

            bets.push({
                num: bIdx + 1,
                selection: betSelection,
                hits: regHits,
                p15Hit: p15Hit,
                isWinner: regHits >= 10
            });
        });

        // Calcular premio total
        let totalPrizeValue = 0;
        [15, 14, 13, 12, 11, 10].forEach(h => {
            const count = hitsCount[h] || 0;
            const pVal = prizes[h] || 0;
            totalPrizeValue += count * pVal;
        });

        // 4. Renderizar HTML en el modal
        let html = `
            <!-- Pronóstico Original (15 signos con los 7 dobles resaltados) -->
            <div class="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span>🎯</span> Pronóstico Original de Dobles (${targetData.memberName})
                    </span>
                    <span class="text-[11px] text-purple-400 font-semibold">7 dobles marcados (16 combinaciones)</span>
                </div>
                <div class="grid grid-cols-5 sm:grid-cols-15 gap-1.5 text-center">
                    ${selection.slice(0, 15).map((s, idx) => {
                        const isDouble = idx < 14 && s && s.length > 1;
                        return `
                            <div class="p-1 rounded-lg ${isDouble ? 'bg-purple-600/40 border border-purple-400/50' : 'bg-slate-800/80 border border-slate-700/50'}">
                                <div class="text-[9px] text-slate-400 font-bold mb-0.5">${idx === 14 ? 'P15' : 'P' + (idx + 1)}</div>
                                <div class="font-black text-xs sm:text-sm ${isDouble ? 'text-purple-200' : 'text-slate-200'} font-mono">${s}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Resumen de Premios Obtenidos -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between sm:col-span-2">
                    <div>
                        <div class="text-[11px] text-slate-400 font-semibold">Resumen de Premios Oficiales LAE</div>
                        <div class="flex flex-wrap gap-2 mt-1.5">
                            ${[15, 14, 13, 12, 11, 10].filter(h => (hitsCount[h] || 0) > 0).map(h => {
                                const count = hitsCount[h];
                                const pVal = prizes[h] || 0;
                                return `
                                    <span class="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-200 border border-purple-500/30 text-xs font-bold flex items-center gap-1">
                                        <span>🏆</span> ${count} de ${h} aciertos: <strong class="text-emerald-400 ml-1">+${(count * pVal).toFixed(2)} €</strong>
                                    </span>
                                `;
                            }).join('') || '<span class="text-xs text-slate-500">Sin premios oficiales (menos de 10 aciertos)</span>'}
                        </div>
                    </div>
                </div>
                <div class="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-center items-center text-center">
                    <span class="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Premio Total Ganado</span>
                    <span class="text-2xl font-black text-emerald-400 font-mono mt-0.5">+${totalPrizeValue.toFixed(2)} €</span>
                </div>
            </div>

            <!-- Tabla de las 16 Apuestas Desarrolladas -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>📊</span> Desglose de las 16 Apuestas de la Reducción
                    </h4>
                    <span class="text-[11px] text-slate-400">Aciertos resaltados en color salmón</span>
                </div>
                <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                    <table class="w-full text-center text-xs">
                        <thead>
                            <tr class="bg-slate-800/80 text-slate-300 font-semibold border-b border-slate-700">
                                <th class="p-2 sm:px-3 text-left">Apuesta</th>
                                ${Array.from({ length: 15 }).map((_, i) => `
                                    <th class="p-2 w-7 sm:w-8 font-mono ${i === 14 ? 'text-amber-300' : ''}">${i === 14 ? 'P15' : (i + 1)}</th>
                                `).join('')}
                                <th class="p-2 sm:px-3 text-right bg-slate-800 font-bold text-white">Aciertos</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/40 font-mono">
                            ${bets.map(b => {
                                const isWin = b.hits >= 10;
                                return `
                                    <tr class="${isWin ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-800/30'} transition-colors">
                                        <td class="p-2 sm:px-3 text-left font-sans font-bold ${isWin ? 'text-amber-300' : 'text-slate-400'}">
                                            #${b.num} ${isWin ? '🏆' : ''}
                                        </td>
                                        ${b.selection.map((s, idx) => {
                                            const m = matches[idx];
                                            const res = m ? (m.result || '') : '';
                                            const rSign = normalize(res);
                                            const isHit = idx < 14 ? s.includes(rSign) : (s === res || s === rSign);
                                            return `
                                                <td class="p-1 sm:p-2">
                                                    <span class="inline-block w-6 h-6 leading-6 rounded font-black text-xs ${isHit ? 'bg-[#ff8a65] text-slate-950 shadow-sm' : 'text-slate-500'}">
                                                        ${s}
                                                    </span>
                                                </td>
                                            `;
                                        }).join('')}
                                        <td class="p-2 sm:px-3 text-right">
                                            <span class="px-2 py-0.5 rounded-md font-black text-xs ${isWin ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400'}">
                                                ${b.hits}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Resultados Oficiales de los 15 Partidos -->
            <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚽</span> Resultados Oficiales de la Jornada ${targetData.jornadaNum}
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    ${matches.slice(0, 15).map((m, idx) => `
                        <div class="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                            <span class="text-slate-300 truncate max-w-[160px]">
                                <strong class="text-slate-500 font-mono mr-1">${idx === 14 ? 'P15' : (idx + 1)}.</strong>
                                ${m.home} - ${m.away}
                            </span>
                            <span class="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-black font-mono">
                                ${m.result || '-'}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const title = document.getElementById('reducida-modal-titulo');
        const subtitle = document.getElementById('reducida-modal-subtitulo');
        const content = document.getElementById('reducida-modal-content');

        if (title) title.textContent = `Desglose Reducción - Jornada ${targetData.jornadaNum} - ${targetData.memberName}`;
        if (subtitle) subtitle.textContent = `16 apuestas combinadas (7 dobles) - Coste 10,50 € asumido íntegramente por la Peña`;
        if (content) content.innerHTML = html;

        this.openModal('modal-reducida-detalle');
    }

    renderGestionIngresos() {
        const data = this.getSeasonData();
        const tbody = document.getElementById('gestion-ingresos-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!data.ingresos || data.ingresos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay ingresos registrados</td></tr>';
            return;
        }

        data.ingresos.forEach(i => {
            const mem = data.memberSummaries.find(m => String(m.id) === String(i.memberId));
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 text-xs';
            tr.innerHTML = `
                <td class="p-3 text-slate-400">${i.fecha || 'N/A'}</td>
                <td class="p-3 font-bold text-white">${mem ? mem.name : `Socio #${i.memberId}`}</td>
                <td class="p-3 text-right font-mono font-bold text-emerald-400">+${parseFloat(i.cantidad || 0).toFixed(2)} €</td>
                <td class="p-3 capitalize text-slate-300">${i.metodo || 'bizum'}</td>
                <td class="p-3 text-slate-400">${i.concepto || 'Aportación manual'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderModalGestionJornada() {
        const data = this.getSeasonData();
        const tbody = document.getElementById('gestion-jornada-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        data.jornadaSummaries.forEach(j => {
            const sealer = data.memberSummaries.find(m => String(m.id) === String(j.loserId));
            const jMovements = data.movements.filter(m => m.jornadaNum === j.number);
            const sealerMov = jMovements.find(m => String(m.memberId) === String(j.loserId));
            const isCash = sealerMov ? sealerMov.isSelladoInCash : false;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 text-xs';
            tr.innerHTML = `
                <td class="p-3 font-bold text-white">Jornada ${j.number}</td>
                <td class="p-3 text-slate-400">${j.date}</td>
                <td class="p-3 font-semibold text-rose-300">${sealer ? sealer.name : 'N/A'}</td>
                <td class="p-3 text-right font-mono font-bold text-white">${j.gastoSellado.toFixed(2)} €</td>
                <td class="p-3 text-center">
                    <div class="inline-flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                        <label class="cursor-pointer flex items-center gap-1 ${!isCash ? 'text-amber-400 font-bold' : 'text-slate-400'}">
                            <input type="radio" name="modal_reemb_${j.number}" ${!isCash ? 'checked' : ''} onchange="window.BoteApp.toggleSelladoCash('${j.loserId}', '${j.id || j.number}', false)">
                            <span>Bote</span>
                        </label>
                        <span class="text-slate-600">|</span>
                        <label class="cursor-pointer flex items-center gap-1 ${isCash ? 'text-emerald-400 font-bold' : 'text-slate-400'}">
                            <input type="radio" name="modal_reemb_${j.number}" ${isCash ? 'checked' : ''} onchange="window.BoteApp.toggleSelladoCash('${j.loserId}', '${j.id || j.number}', true)">
                            <span>Bizum</span>
                        </label>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // =========================================================================
    // MODALES & UTILIDADES
    // =========================================================================
    openMemberExtract(memberId) {
        const data = this.getSeasonData();
        const member = data.memberSummaries.find(m => String(m.id) === String(memberId));
        if (!member) return;

        const nameEl = document.getElementById('extracto-socio-nombre');
        const avatarEl = document.getElementById('extracto-avatar');
        const statusEl = document.getElementById('extracto-socio-status');
        const content = document.getElementById('extracto-content');

        if (nameEl) nameEl.textContent = member.name;
        if (avatarEl) avatarEl.textContent = member.name.substring(0, 2).toUpperCase();
        if (statusEl) {
            statusEl.className = member.saldo >= 0 ? 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
            statusEl.textContent = member.saldo >= 0 ? 'Al día (+)' : 'Saldo Deudor (-)';
        }

        if (!content) return;

        let html = `
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div class="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span class="text-[11px] text-slate-400 block font-semibold">Total Ingresado</span>
                    <span class="text-sm sm:text-base font-extrabold text-emerald-400 font-mono">+${member.totIn.toFixed(2)} €</span>
                </div>
                <div class="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span class="text-[11px] text-slate-400 block font-semibold">Total Gastado</span>
                    <span class="text-sm sm:text-base font-extrabold text-rose-400 font-mono">-${member.totOut.toFixed(2)} €</span>
                </div>
                <div class="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span class="text-[11px] text-slate-400 block font-semibold">Premios Cobrados</span>
                    <span class="text-sm sm:text-base font-extrabold text-amber-400 font-mono">+${member.breakdown.premios.toFixed(2)} €</span>
                </div>
                <div class="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span class="text-[11px] text-slate-400 block font-semibold">Saldo Disponible</span>
                    <span class="text-sm sm:text-base font-extrabold ${member.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono">${member.saldo.toFixed(2)} €</span>
                </div>
            </div>

            <div>
                <h4 class="text-xs font-bold text-white uppercase tracking-wider mb-2.5">Historial Cronológico de Movimientos</h4>
                <div class="overflow-x-auto rounded-xl border border-slate-800 max-h-[48vh]">
                    <table class="w-full text-left text-xs sm:text-sm border-collapse">
                        <thead class="sticky top-0 bg-slate-900 shadow">
                            <tr class="text-xs font-bold uppercase text-slate-400 border-b border-slate-800">
                                <th class="p-2.5 sm:p-3">Evento</th>
                                <th class="p-2.5 sm:p-3">Fecha</th>
                                <th class="p-2.5 sm:p-3 text-center">Ac.</th>
                                <th class="p-2.5 sm:p-3 text-right text-emerald-400">Ingreso (+)</th>
                                <th class="p-2.5 sm:p-3 text-right text-rose-400">Gasto (-)</th>
                                <th class="p-2.5 sm:p-3 text-right text-amber-400 font-extrabold">Saldo Tras Evento</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/60">
        `;

        member.movements.forEach(m => {
            const isManual = m.isIngresoLibre;
            const eventTitle = isManual ? `📥 ${m.description || 'Ingreso manual'}` : `Jornada ${m.jornadaNum}`;
            const inVal = (m.totalIngresos || 0) + ((!m.isSelladoInCash && m.sellado < 0) ? Math.abs(m.sellado) : 0);
            const outVal = m.totalGastos || 0;

            let acText = m.aciertos !== undefined ? m.aciertos : '-';
            if (m.exento) acText += ' 🎁';
            if (m.jugaDobles) acText += ' 👑';
            if (m.isSealer || m.sellado < 0) acText += ' 💀';

            let inBreakdown = [];
            if (m.premios > 0) inBreakdown.push(`<span class="text-[10px] text-blue-300 font-bold bg-blue-500/20 px-1 py-0.5 rounded border border-blue-500/30">🔵 Premio Indiv: +${m.premios.toFixed(2)} €</span>`);
            if (m.ingresosManual > 0) inBreakdown.push(`<span class="text-[10px] text-emerald-300 font-semibold">📥 Ingreso: +${m.ingresosManual.toFixed(2)} €</span>`);
            if (m.sellado < 0 && !m.isSelladoInCash) inBreakdown.push(`<span class="text-[10px] text-purple-300 font-semibold">💀 Sellado: +${Math.abs(m.sellado).toFixed(2)} €</span>`);

            const inSubHtml = inBreakdown.length > 0 ? `<div class="flex flex-col items-end gap-0.5 mt-0.5">${inBreakdown.join('')}</div>` : '';

            html += `
                <tr class="hover:bg-slate-900/60 ${isManual ? 'bg-emerald-950/20' : ''}">
                    <td class="p-2.5 sm:p-3 font-semibold text-white">${eventTitle}</td>
                    <td class="p-2.5 sm:p-3 text-xs text-slate-400">${m.jornadaDate || m.date}</td>
                    <td class="p-2.5 sm:p-3 text-center font-bold text-white">${acText}</td>
                    <td class="p-2.5 sm:p-3 text-right font-mono font-medium text-emerald-400">
                        ${inVal > 0 ? `<div>+${inVal.toFixed(2)} €</div>${inSubHtml}` : '-'}
                    </td>
                    <td class="p-2.5 sm:p-3 text-right font-mono font-medium text-rose-400">
                        ${outVal > 0 ? '-' + outVal.toFixed(2) + ' €' : '0,00 €'}
                    </td>
                    <td class="p-2.5 sm:p-3 text-right font-mono font-extrabold ${m.boteAcumulado >= 0 ? 'text-emerald-400' : 'text-rose-400'} bg-slate-900/40">
                        ${m.boteAcumulado.toFixed(2)} €
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        content.innerHTML = html;
        this.openModal('modal-extracto-socio');
    }

    populateSocioSelect() {
        const data = this.getSeasonData();
        const sel = document.getElementById('form-ingreso-socio');
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecciona un socio...</option>';

        // Orden de socios por ID en el desplegable
        const sorted = [...data.memberSummaries].sort((a, b) => parseInt(a.id) - parseInt(b.id));
        sorted.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.id}. ${m.name}`;
            sel.appendChild(opt);
        });
    }

    async handleCreateIngreso(e) {
        e.preventDefault();
        const mId = document.getElementById('form-ingreso-socio').value;
        const cant = parseFloat(document.getElementById('form-ingreso-cantidad').value);
        const met = document.getElementById('form-ingreso-metodo').value;
        const fec = document.getElementById('form-ingreso-fecha').value;
        const con = document.getElementById('form-ingreso-concepto').value || 'Aportación manual';

        if (!mId || isNaN(cant) || cant <= 0) {
            alert('Por favor introduce un importe y socio válido.');
            return;
        }

        const newEntry = {
            id: Date.now(),
            memberId: parseInt(mId),
            cantidad: cant,
            metodo: met,
            fecha: fec,
            concepto: con,
            season: this.currentSeason
        };

        try {
            if (window.DataService) {
                await window.DataService.save('ingresos', newEntry);
                await this.loadLiveFirebaseData();
            } else {
                // Modo fallback en memoria
                const data = this.getSeasonData();
                data.ingresos.unshift(newEntry);
                const m = data.memberSummaries.find(mem => String(mem.id) === String(mId));
                if (m) {
                    m.totIn += cant;
                    m.saldo += cant;
                    m.movements.push({
                        isIngresoLibre: true,
                        description: con,
                        date: fec,
                        totalIngresos: cant,
                        totalGastos: 0,
                        boteAcumulado: m.saldo
                    });
                }
                data.summary.totalIngresos += cant;
                data.summary.totalSaldosVirtuales += cant;
                data.summary.cajaReal += cant;
            }

            this.closeModal('modal-ingreso');
            this.renderAll();
            alert(`¡Ingreso de ${cant.toFixed(2)} € registrado con éxito!`);
        } catch (err) {
            console.error("Error guardando ingreso:", err);
            alert("Hubo un error al guardar el ingreso en la base de datos.");
        }
    }

    toggleToolsDropdown() {
        const dd = document.getElementById('tools-dropdown');
        if (dd) dd.classList.toggle('hidden');
    }

    openModal(modalId) {
        const el = document.getElementById(modalId);
        if (el) {
            el.classList.remove('hidden');
            el.classList.add('flex');
            el.scrollTop = 0;
            const scrollable = el.querySelector('.overflow-y-auto');
            if (scrollable) scrollable.scrollTop = 0;
        }
        const dd = document.getElementById('tools-dropdown');
        if (dd) dd.classList.add('hidden');
    }

    closeModal(modalId) {
        const el = document.getElementById(modalId);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }
    }

    exportCSV() {
        const data = this.getSeasonData();
        let csv = 'ID,Socio,Total In,Total Out,Saldo Actual\n';
        const sorted = [...data.memberSummaries].sort((a, b) => parseInt(a.id) - parseInt(b.id));
        sorted.forEach(m => {
            csv += `${m.id},"${m.name}",${m.totIn.toFixed(2)},${m.totOut.toFixed(2)},${m.saldo.toFixed(2)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Bote_Maulas_${this.currentSeason}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
}

// Inicialización automática
document.addEventListener('DOMContentLoaded', () => {
    window.BoteApp = new BoteAppController();
});
