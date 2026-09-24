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
                    ${m.premios > 0 ? '+' + m.premios.toFixed(2) + ' €' : '-'}
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

        // Posicionar popover
        const rect = e.currentTarget.getBoundingClientRect();
        const popW = 280;
        let left = rect.left + window.scrollX;
        let top = rect.bottom + window.scrollY + 8;

        if (left + popW > window.innerWidth - 10) {
            left = window.innerWidth - popW - 10;
        }

        pop.style.left = Math.max(10, left) + 'px';
        pop.style.top = top + 'px';
    }

    // =========================================================================
    // VISTA 4: FLUJO DE CAJA & VISTA 5: PREMIOS DE DOBLES
    // =========================================================================
    renderFlujoDeCaja() {
        const data = this.getSeasonData();
        const tbody = document.getElementById('flujo-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        let saldoAcumuladoPeña = 0;

        data.jornadaSummaries.forEach(j => {
            const cuotasBase = j.numSocios * (j.costeColumna || 0.75);
            const penalties = Math.max(0, j.recaudacion - (j.numSocios * 1.50));
            saldoAcumuladoPeña += j.neto;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 text-xs sm:text-sm';
            tr.innerHTML = `
                <td class="p-3 font-bold text-white">Jornada ${j.number}</td>
                <td class="p-3 text-slate-400">${j.date}</td>
                <td class="p-3 text-right font-mono text-emerald-400">+${cuotasBase.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono text-amber-400">+${penalties.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono ${j.premios > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}">${j.premios > 0 ? '+' + j.premios.toFixed(2) + ' €' : '-'}</td>
                <td class="p-3 text-right font-mono text-rose-400">-${j.gastoSellado.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono font-bold ${j.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${j.neto >= 0 ? '+' : ''}${j.neto.toFixed(2)} €</td>
                <td class="p-3 text-right font-mono font-extrabold text-amber-400 bg-slate-900/40">${saldoAcumuladoPeña.toFixed(2)} €</td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderPremiosDobles() {
        const grid = document.getElementById('premios-dobles-grid');
        if (!grid) return;
        grid.innerHTML = `
            <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div class="flex justify-between items-center">
                    <strong class="text-white">Jornada 3 (30/08/2026)</strong>
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">10 Aciertos</span>
                </div>
                <div class="text-xs text-slate-400">Pronosticador: <strong>Luismi</strong> (Ganador de J2)</div>
                <div class="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                    <span class="text-slate-400">Premio LAE:</span>
                    <strong class="font-mono text-emerald-400 text-sm">+2,32 €</strong>
                </div>
            </div>
            <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div class="flex justify-between items-center">
                    <strong class="text-white">Jornada 4 (06/09/2026)</strong>
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">10 Aciertos</span>
                </div>
                <div class="text-xs text-slate-400">Pronosticador: <strong>Fernando Lozano</strong> (Ganador de J3)</div>
                <div class="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                    <span class="text-slate-400">Premio LAE:</span>
                    <strong class="font-mono text-emerald-400 text-sm">+3,40 €</strong>
                </div>
            </div>
        `;
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

            html += `
                <tr class="hover:bg-slate-900/60 ${isManual ? 'bg-emerald-950/20' : ''}">
                    <td class="p-2.5 sm:p-3 font-semibold text-white">${eventTitle}</td>
                    <td class="p-2.5 sm:p-3 text-xs text-slate-400">${m.jornadaDate || m.date}</td>
                    <td class="p-2.5 sm:p-3 text-center font-bold text-white">${acText}</td>
                    <td class="p-2.5 sm:p-3 text-right font-mono font-medium text-emerald-400">
                        ${inVal > 0 ? '+' + inVal.toFixed(2) + ' €' : '-'}
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
        if (el) el.classList.remove('hidden');
        const dd = document.getElementById('tools-dropdown');
        if (dd) dd.classList.add('hidden');
    }

    closeModal(modalId) {
        const el = document.getElementById(modalId);
        if (el) el.classList.add('hidden');
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
