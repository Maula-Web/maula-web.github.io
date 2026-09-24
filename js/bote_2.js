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
        this.sociosViewMode = 'table';
        this.chartFlujo = null;
        this.chartSocios = null;
        this.chartJornadas = null;
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
            if (popover && !popover.classList.contains('hidden') && !popover.contains(e.target) && !e.target.closest('#matriz-tbody td') && !e.target.closest('#flujo-table-body td')) {
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

        // Asegurar que cualquier tarjeta o panel con tooltip explicativo activo quede siempre en primer plano
        document.addEventListener('mouseover', (e) => {
            const trigger = e.target.closest('.group.cursor-help, .cursor-help');
            if (trigger) {
                const panel = trigger.closest('.glass-panel, [id="jornada-header-card"], .grid, section');
                if (panel) panel.style.zIndex = '100';
                const tr = trigger.closest('tr');
                if (tr) tr.style.zIndex = '60';
                const td = trigger.closest('td, th');
                if (td) td.style.zIndex = '70';
                trigger.style.zIndex = '110';
            }
        });

        document.addEventListener('mouseout', (e) => {
            const trigger = e.target.closest('.group.cursor-help, .cursor-help');
            if (trigger) {
                const panel = trigger.closest('.glass-panel, [id="jornada-header-card"], .grid, section');
                if (panel) panel.style.zIndex = '';
                const tr = trigger.closest('tr');
                if (tr) tr.style.zIndex = '';
                const td = trigger.closest('td, th');
                if (td) td.style.zIndex = '';
                trigger.style.zIndex = '';
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
                        cashPayments,
                        pronosticos
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
    buildSeasonModelFromMovements(season, config, members, jornadas, movements, ingresos, cashPayments, pronosticos) {
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

            // 1. Ganador real de ESTA jornada (el socio con más aciertos que ha ganado la jornada)
            let winnerId = null;
            let winnerName = null;
            if (this.engine && typeof this.engine.getWinnerOfJornada === 'function') {
                winnerId = this.engine.getWinnerOfJornada(j, members, jornadas, pronosticos);
            }
            const winnerMov = jMovements.find(m => m.isWinner || (winnerId && String(m.memberId) === String(winnerId)));
            if (winnerMov) {
                winnerId = String(winnerMov.memberId);
                winnerName = winnerMov.memberName;
            } else if (winnerId) {
                const wMem = members.find(m => String(m.id) === String(winnerId));
                winnerName = wMem ? wMem.name : null;
            } else if (jMovements.length > 0) {
                // Fallback por aciertos si no hay motor disponible
                const validMovs = jMovements.filter(m => typeof m.aciertos === 'number' && !isNaN(m.aciertos));
                if (validMovs.length > 0) {
                    const maxAc = Math.max(...validMovs.map(m => m.aciertos));
                    const best = validMovs.filter(m => m.aciertos === maxAc);
                    if (best.length === 1) {
                        winnerId = String(best[0].memberId);
                        winnerName = best[0].memberName;
                    }
                }
            }

            // 2. Socio que juega los dobles en esta jornada (ganador de la jornada anterior)
            const doblesPlayerMov = jMovements.find(m => m.jugaDobles);
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
                winnerId: winnerId,
                winnerName: winnerName,
                doblesPlayerId: doblesPlayerMov ? String(doblesPlayerMov.memberId) : null,
                doblesPlayerName: doblesPlayerMov ? doblesPlayerMov.memberName : null,
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

        // Actualizar gráficos según la vista activa
        if (viewName === 'flujo') {
            setTimeout(() => this.renderFlujoChart(), 60);
        } else if (viewName === 'jornadas') {
            setTimeout(() => this.renderJornadasChart(), 60);
        } else if (viewName === 'socios' && this.sociosViewMode === 'chart') {
            setTimeout(() => this.renderSociosChart(), 60);
        }
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

        // Renderizar gráficos si los contenedores están disponibles
        setTimeout(() => {
            this.renderFlujoChart();
            this.renderJornadasChart();
            if (this.sociosViewMode === 'chart') this.renderSociosChart();
        }, 100);
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

        const jMovements = data.movements.filter(m => m.jornadaNum === jSummary.number);
        const doblesPrize = jMovements.reduce((sum, m) => sum + (m.extraPrizes || 0), 0);
        const doblesBtn = (doblesPrize > 0) ? `
            <button onclick="window.BoteApp.showReducedBreakdown('${jSummary.doblesPlayerId || jSummary.winnerId || ''}', ${jSummary.number})" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-all shadow-sm" title="Ver desglose oficial de las 16 apuestas reducidas premiadas">
                <span>📋</span> Ver Reducción Premiada (+${doblesPrize.toFixed(2)} €)
            </button>
        ` : '';

        const exemptMovements = jMovements.filter(m => m.exento);
        const exemptNames = exemptMovements.map(m => m.memberName).join(', ');
        const exemptHtml = exemptMovements.length > 0 ? `
            <span class="text-slate-600">•</span>
            <div class="group relative cursor-help flex items-center gap-1.5 text-slate-300 hover:z-50">
                <span class="text-amber-400 font-bold">🎁 Gratis:</span> 
                <span class="underline decoration-dotted decoration-slate-500">${exemptNames}</span>
                <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-0 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-amber-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal">
                    <strong class="text-amber-400 block mb-1 font-bold">🎁 Socio Exento de Cuota</strong>
                    Juega gratis esta jornada al haber obtenido premio o ganado en la jornada anterior.
                </div>
            </div>
        ` : '';

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
                            <div class="group relative cursor-help flex items-center gap-1.5 text-slate-300 hover:z-50">
                                <span class="text-emerald-400 font-bold">👑 Ganador:</span> 
                                <span class="underline decoration-dotted decoration-slate-500">${jSummary.winnerName || 'N/A'}</span>
                                <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-0 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-emerald-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto">
                                    <strong class="text-emerald-400 block mb-1 font-bold">👑 Ganador de la Jornada</strong>
                                    Socio con más aciertos en esta jornada. Jugará gratis (🎁) y pronosticará la quiniela de 7 dobles en la siguiente jornada (coste de 10,50 € pagado al 100% por la peña).
                                </div>
                            </div>
                            ${doblesBtn}
                            ${exemptHtml}
                            <span class="text-slate-600">•</span>
                            <div class="group relative cursor-help flex items-center gap-1.5 text-slate-300 hover:z-50">
                                <span class="text-rose-400 font-bold">💀 Sellador:</span> 
                                <span class="underline decoration-dotted decoration-slate-500">${jSummary.loserName || 'N/A'}</span>
                                <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-0 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-rose-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto">
                                    <strong class="text-rose-400 block mb-1 font-bold">💀 Sellador Oficial</strong>
                                    Socio encargado de sellar físicamente los boletos en la administración de lotería. Recibe el reembolso íntegro de 24,75 € en su hucha personal o por Bizum.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-center relative z-20">
                        <div class="group relative cursor-help p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 hover:z-50 transition-colors">
                            <span class="text-[11px] text-slate-400 block font-semibold flex items-center justify-center gap-1">Recaudado ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold text-emerald-400 font-mono">+${jSummary.recaudacion.toFixed(2)} €</span>
                            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-emerald-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal">
                                <strong class="text-emerald-400 block mb-1 font-bold">📥 Recaudación de la Jornada</strong>
                                Suma de cuotas semanales de los 19 socios más las penalizaciones aplicadas por exceso de unos, bajos aciertos o fallos en PIG.
                            </div>
                        </div>
                        <div class="group relative cursor-help p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 hover:z-50 transition-colors">
                            <span class="text-[11px] text-slate-400 block font-semibold flex items-center justify-center gap-1">Coste Sellado ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold text-rose-400 font-mono">-${jSummary.gastoSellado.toFixed(2)} €</span>
                            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-rose-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal">
                                <strong class="text-rose-400 block mb-1 font-bold">🎟️ Gasto Oficial de Sellado</strong>
                                Coste total pagado en la administración de loterías: 19 quinielas sencillas (14,25 €) + 1 quiniela reducida de 7 dobles (10,50 €) = 24,75 €.
                            </div>
                        </div>
                        <div class="group relative cursor-help p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 hover:z-50 transition-colors">
                            <span class="text-[11px] text-slate-400 block font-semibold flex items-center justify-center gap-1">Premios ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold text-amber-400 font-mono">+${jSummary.premios.toFixed(2)} €</span>
                            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-amber-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal">
                                <strong class="text-amber-400 block mb-1 font-bold">🏆 Premios Oficiales LAE</strong>
                                Importe oficial de premios de Loterías del Estado en esta jornada (por pronósticos individuales o por la quiniela de dobles).
                            </div>
                        </div>
                        <div class="group relative cursor-help p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 hover:z-50 transition-colors">
                            <span class="text-[11px] text-slate-400 block font-semibold flex items-center justify-center gap-1">Neto Peña ℹ️</span>
                            <span class="text-xs sm:text-sm font-extrabold ${netoColor} font-mono">${jSummary.neto >= 0 ? '+' : ''}${jSummary.neto.toFixed(2)} €</span>
                            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-0 top-full mt-2 w-72 p-3.5 bg-slate-900/95 border border-emerald-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal">
                                <strong class="text-emerald-400 block mb-1 font-bold">📈 Superávit Neto Semanal</strong>
                                Margen neto semanal que se incorpora a la hucha colectiva de la peña tras descontar los 24,75 € de sellado oficial.
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Renderizar tabla de movimientos de la jornada
        const tbody = document.getElementById('jornada-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Mantener orden por ID de socio
        jMovements.sort((a, b) => parseInt(a.memberId) - parseInt(b.memberId)).forEach((m, rowIdx) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 transition-colors text-xs sm:text-sm';

            // Posicionamiento dinámico: mitad superior hacia abajo, mitad inferior hacia arriba
            const posClass = rowIdx < 10 ? 'left-1/2 -translate-x-1/2 top-full mt-1.5' : 'left-1/2 -translate-x-1/2 bottom-full mb-1.5';
            const prizePosClass = rowIdx < 10 ? 'right-0 top-full mt-1.5' : 'right-0 bottom-full mb-1.5';

            // Chips de penalizaciones con tarjetas explicativas formato Superávit Peña
            const penaltyChips = [];
            if (m.penalizacionUnos > 0) {
                penaltyChips.push(`
                    <div class="group relative cursor-help inline-block">
                        <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[11px] font-semibold border border-amber-500/30 inline-flex items-center gap-0.5 shadow-sm hover:brightness-125 transition-all">
                            +1️⃣ ${m.penalizacionUnos.toFixed(2)}€
                        </span>
                        <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${posClass} w-64 sm:w-72 p-3.5 bg-slate-900/95 border border-amber-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                            <strong class="text-amber-400 block mb-1 font-bold flex items-center gap-1.5">
                                <span>1️⃣</span> Multa por Exceso de Unos (+1)
                            </strong>
                            <p class="leading-relaxed">
                                Penalización de <strong>+${m.penalizacionUnos.toFixed(2)} €</strong> aplicada por pronosticar 10 o más signos "1" en la quiniela semanal. Se abona íntegramente al fondo común de la peña.
                            </p>
                        </div>
                    </div>
                `);
            }
            if (m.penalizacionBajosAciertos > 0) {
                penaltyChips.push(`
                    <div class="group relative cursor-help inline-block">
                        <span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[11px] font-semibold border border-rose-500/30 inline-flex items-center gap-0.5 shadow-sm hover:brightness-125 transition-all">
                            📉 ${m.penalizacionBajosAciertos.toFixed(2)}€
                        </span>
                        <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${posClass} w-64 sm:w-72 p-3.5 bg-slate-900/95 border border-rose-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                            <strong class="text-rose-400 block mb-1 font-bold flex items-center gap-1.5">
                                <span>📉</span> Multa por Bajos Aciertos
                            </strong>
                            <p class="leading-relaxed">
                                Penalización de <strong>+${m.penalizacionBajosAciertos.toFixed(2)} €</strong> aplicada por obtener entre 0 y 3 aciertos en los 14 primeros partidos del boleto semanal.
                            </p>
                        </div>
                    </div>
                `);
            }
            if (m.penalizacionPIG > 0) {
                penaltyChips.push(`
                    <div class="group relative cursor-help inline-block">
                        <span class="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 text-[11px] font-semibold border border-pink-500/30 inline-flex items-center gap-0.5 shadow-sm hover:brightness-125 transition-all">
                            🐷 ${m.penalizacionPIG.toFixed(2)}€
                        </span>
                        <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${posClass} w-64 sm:w-72 p-3.5 bg-slate-900/95 border border-pink-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                            <strong class="text-pink-400 block mb-1 font-bold flex items-center gap-1.5">
                                <span>🐷</span> Fallo en Partido de Interés General (PIG)
                            </strong>
                            <p class="leading-relaxed">
                                Multa de <strong>+${m.penalizacionPIG.toFixed(2)} €</strong> por no acertar el resultado en el partido fijado como Partido de Interés General de la jornada.
                            </p>
                        </div>
                    </div>
                `);
            }
            if (m.penalizacionMaula > 0) {
                penaltyChips.push(`
                    <div class="group relative cursor-help inline-block">
                        <span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[11px] font-semibold border border-purple-500/30 inline-flex items-center gap-0.5 shadow-sm hover:brightness-125 transition-all">
                            💀 ${m.penalizacionMaula.toFixed(2)}€
                        </span>
                        <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${posClass} w-64 sm:w-72 p-3.5 bg-slate-900/95 border border-purple-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                            <strong class="text-purple-400 block mb-1 font-bold flex items-center gap-1.5">
                                <span>💀</span> Penalización Maula de la Jornada
                            </strong>
                            <p class="leading-relaxed">
                                Multa de <strong>+${m.penalizacionMaula.toFixed(2)} €</strong> aplicada al socio que ha quedado en última posición de aciertos en la jornada.
                            </p>
                        </div>
                    </div>
                `);
            }

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
            if (m.isWinner || (jSummary.winnerId && String(m.memberId) === String(jSummary.winnerId))) {
                icons += ' <span title="Ganador de esta jornada">👑</span>';
            }
            if (m.exento) {
                icons += ' <span title="Juega gratis esta jornada (premio o ganador jornada previa)">🎁</span>';
            }
            if (m.isSealer || m.sellado < 0) {
                icons += ' <span title="Encargado del sellado">💀</span>';
            }

            tr.innerHTML = `
                <td class="p-2.5 sm:px-4">
                    <strong class="text-white">${m.memberName}</strong>${icons}
                </td>
                <td class="p-2.5 sm:px-4 text-center font-bold text-white">
                    ${m.aciertos !== undefined ? m.aciertos : '-'}
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono text-slate-300">
                    ${m.exento ? `
                        <div class="group relative cursor-help inline-block">
                            <span class="text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 hover:brightness-125 transition-all">GRATIS</span>
                            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${posClass} w-64 p-3.5 bg-slate-900/95 border border-amber-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                                <strong class="text-amber-400 block mb-1 font-bold flex items-center gap-1.5">
                                    <span>🎁</span> Cuota Gratis (Exento)
                                </strong>
                                <p class="leading-relaxed">
                                    El socio no paga cuota semanal (0,00 €) al haber obtenido premio oficial o ganado en la jornada anterior.
                                </p>
                            </div>
                        </div>
                    ` : m.aportacion.toFixed(2) + ' €'}
                </td>
                <td class="p-2.5 sm:px-4 text-center">
                    ${penaltiesHtml}
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-bold text-rose-400">
                    -${(m.totalGastos || 0).toFixed(2)} €
                </td>
                <td class="p-2.5 sm:px-4 text-right font-mono font-bold ${m.premios > 0 ? 'text-emerald-400' : 'text-slate-600'}">
                    ${m.premios > 0 ? `
                        <div class="group relative cursor-help inline-flex flex-col items-end">
                            <span>+${m.premios.toFixed(2)} €</span>
                            <span class="text-[9px] font-sans font-semibold text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30 shadow-sm flex items-center gap-1 hover:brightness-125 transition-all">
                                🔵 Individual ℹ️
                            </span>
                            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${prizePosClass} w-64 sm:w-72 p-3.5 bg-slate-900/95 border border-blue-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                                <strong class="text-blue-400 block mb-1 font-bold flex items-center gap-1.5">
                                    <span>🔵</span> Premio Oficial Individual (+${m.premios.toFixed(2)} €)
                                </strong>
                                <p class="leading-relaxed">
                                    Premio oficial de Loterías del Estado conseguido por el boleto individual del socio (${m.aciertos} aciertos). El socio disfruta de cuota gratis la jornada siguiente.
                                </p>
                            </div>
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
                    <div class="group relative cursor-help inline-flex flex-col items-end">
                        <span>+${doblesPrize.toFixed(2)} €</span>
                        <span class="text-[9px] font-sans font-semibold text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 shadow-sm flex items-center gap-1 hover:brightness-125 transition-all">
                            🟣 Bote Peña ℹ️
                        </span>
                        <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-0 bottom-full mb-1.5 w-64 sm:w-72 p-3.5 bg-slate-900/95 border border-purple-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                            <strong class="text-purple-300 block mb-1 font-bold flex items-center gap-1.5">
                                <span>🟣</span> Premio Reducción de Dobles (+${doblesPrize.toFixed(2)} €)
                            </strong>
                            <p class="leading-relaxed">
                                Premio oficial conseguido por las 16 apuestas reducidas (7 dobles) financiadas por la peña. Este importe entra directamente al fondo de la caja común.
                            </p>
                        </div>
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
            <th class="p-2.5 sm:p-3 text-right bg-slate-900 min-w-[110px] border-r border-slate-800 text-amber-400 text-xs group relative cursor-help select-none">
                <span class="inline-flex items-center gap-1">Saldo Actual <span class="text-[11px] text-amber-400">ℹ️</span></span>
                <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-0 top-full mt-2 w-72 sm:w-80 p-3.5 bg-slate-900/95 border border-amber-500/40 text-slate-300 rounded-xl shadow-2xl text-xs z-[99999] pointer-events-auto text-left font-normal normal-case">
                    <strong class="text-amber-400 block mb-1 font-bold flex items-center gap-1.5">
                        <span>🏦</span> Saldo Disponible en Hucha
                    </strong>
                    <p class="leading-relaxed">
                        Saldo individual consolidado de cada socio en la temporada actual. Se actualiza automáticamente tras cada jornada liquidada y al registrar recargas por Bizum.
                    </p>
                </div>
            </th>
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

                const isWin = (mov && mov.isWinner) || (j.winnerId && String(m.id) === String(j.winnerId));
                const isLoss = (mov && mov.isLoser) || (j.loserId && String(m.id) === String(j.loserId));
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

        const jSum = data.jornadaSummaries.find(j => j.number === jornadaNum);
        const isWin = (mov && mov.isWinner) || (jSum && String(member.id) === String(jSum.winnerId));
        const isLoss = (mov && mov.isLoser) || (jSum && String(member.id) === String(jSum.loserId));

        title.textContent = `${member.name} - Jornada ${jornadaNum}`;

        const selladoText = mov.sellado < 0 ? `+${Math.abs(mov.sellado).toFixed(2)} € (${mov.isSelladoInCash ? 'Bizum' : 'Bote'})` : '-';

        body.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Aciertos:</span>
                <strong class="text-white">${mov.aciertos !== undefined ? mov.aciertos : '-'}${isWin ? ' <span class="text-emerald-400 font-bold text-xs ml-1">👑 (Ganador)</span>' : ''}${isLoss ? ' <span class="text-rose-400 font-bold text-xs ml-1">💀 (Sellador)</span>' : ''}</strong>
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
        this.positionPopover(pop, e.currentTarget);
    }

    positionPopover(pop, targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const popW = pop.offsetWidth || 300;
        const popH = pop.offsetHeight || 280;
        const margin = 12;

        let left = rect.left + (rect.width / 2) - (popW / 2);
        if (left + popW > window.innerWidth - margin) {
            left = window.innerWidth - popW - margin;
        }
        if (left < margin) {
            left = margin;
        }

        let top = rect.bottom + 8;
        if (top + popH > window.innerHeight - margin) {
            const topAbove = rect.top - popH - 8;
            if (topAbove >= margin) {
                top = topAbove;
            } else {
                top = Math.max(margin, window.innerHeight - popH - margin);
            }
        }

        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
    }

    showFlujoPopover(e, type, jornadaNum, extra) {
        if (e && e.stopPropagation) e.stopPropagation();
        const pop = document.getElementById('matrix-popover');
        const title = document.getElementById('pop-title');
        const body = document.getElementById('pop-body');
        if (!pop || !title || !body) return;

        const data = this.getSeasonData();
        const BOTE_INICIAL = 738.68;

        if (type === 'inicial') {
            title.textContent = '🌱 Bote Inicial Temporada';
            body.innerHTML = `
                <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-2 text-amber-200">
                    <div class="text-[11px] font-semibold text-amber-300">Fondo de Apertura (Agosto 2026)</div>
                    <div class="text-base font-black font-mono mt-0.5 text-amber-400">+738,68 €</div>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Socios aportantes:</span>
                    <strong class="text-slate-200">18 socios</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Media aportada:</span>
                    <strong class="text-slate-200">~41,04 € / socio</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Origen:</span>
                    <strong class="text-slate-300 text-right">Remanente anterior + Cuotas reapertura</strong>
                </div>
                <div class="pt-1.5 text-[11px] text-slate-400 leading-relaxed">
                    💡 Fondo inicial que garantiza el sellado de las quinielas antes de recaudar cuotas semanales.
                </div>
            `;
            pop.classList.remove('hidden');
            this.positionPopover(pop, e.currentTarget);
            return;
        }

        const jSummary = data.jornadaSummaries.find(j => j.number === jornadaNum);
        if (!jSummary) return;

        const jMovements = data.movements.filter(m => m.jornadaNum === jornadaNum);

        // Desglose de penalizaciones
        const totUnos = jMovements.reduce((sum, m) => sum + (m.penalizacionUnos || 0), 0);
        const totBajos = jMovements.reduce((sum, m) => sum + (m.penalizacionBajosAciertos || 0), 0);
        const totPig = jMovements.reduce((sum, m) => sum + (m.penalizacionPIG || 0), 0);
        const totMaula = jMovements.reduce((sum, m) => sum + (m.penalizacionMaula || 0), 0);
        const totPenalties = totUnos + totBajos + totPig + totMaula;

        // Desglose de cuotas
        const numSocios = jSummary.numSocios || 19;
        const cuotaBase = jSummary.costeColumna || 0.75;
        const totCuotas = numSocios * cuotaBase;

        // Desglose de premios
        const doblesPrize = jMovements.reduce((sum, m) => sum + (m.extraPrizes || 0), 0);
        const indivPrizes = jMovements.filter(m => m.premios > 0);

        if (type === 'cuotas') {
            title.textContent = `📊 Cuotas Base - Jornada ${jornadaNum}`;
            body.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Socios activos:</span>
                    <strong class="text-white">${numSocios} socios</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Precio por columna:</span>
                    <strong class="text-slate-300 font-mono">${cuotaBase.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Cálculo:</span>
                    <strong class="text-slate-300 font-mono">${numSocios} × ${cuotaBase.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between pt-1.5 text-xs">
                    <span class="text-emerald-400 font-bold">Total Cuotas Base:</span>
                    <strong class="text-emerald-400 font-mono text-sm">+${totCuotas.toFixed(2)} €</strong>
                </div>
                <div class="pt-2 text-[11px] text-slate-400">
                    Aportación estándar de los socios para pagar sus columnas individuales semanales.
                </div>
            `;
        } else if (type === 'penalizaciones') {
            title.textContent = `⚠️ Penalizaciones - Jornada ${jornadaNum}`;
            body.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">1️⃣ Multa de Unos (≥10):</span>
                    <strong class="text-amber-400 font-mono">+${totUnos.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">📉 Bajos Aciertos (0-3 ac):</span>
                    <strong class="text-rose-400 font-mono">+${totBajos.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">🐷 Fallo en PIG:</span>
                    <strong class="text-pink-400 font-mono">+${totPig.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">💀 Maula de la jornada:</span>
                    <strong class="text-purple-400 font-mono">+${totMaula.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between pt-1.5 text-xs">
                    <span class="text-amber-300 font-bold">Total Penalizaciones:</span>
                    <strong class="text-amber-400 font-mono text-sm">+${totPenalties.toFixed(2)} €</strong>
                </div>
                <div class="pt-2 text-[11px] text-slate-400">
                    Las penalizaciones ingresan íntegramente en la caja de la Peña aumentando el superávit semanal.
                </div>
            `;
        } else if (type === 'premios') {
            title.textContent = `🏆 Premios LAE - Jornada ${jornadaNum}`;
            if (jSummary.premios > 0 || doblesPrize > 0) {
                let premiosHtml = '';
                if (doblesPrize > 0) {
                    premiosHtml += `
                        <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                            <span class="text-purple-300 font-semibold flex items-center gap-1">🟣 Quiniela Dobles:</span>
                            <strong class="text-emerald-400 font-mono">+${doblesPrize.toFixed(2)} €</strong>
                        </div>
                    `;
                }
                indivPrizes.forEach(ip => {
                    premiosHtml += `
                        <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                            <span class="text-blue-300 font-medium truncate max-w-[170px]">🔵 ${ip.memberName} (${ip.aciertos || 10} ac):</span>
                            <strong class="text-emerald-400 font-mono">+${ip.premios.toFixed(2)} €</strong>
                        </div>
                    `;
                });
                body.innerHTML = `
                    ${premiosHtml}
                    <div class="flex justify-between pt-1.5 text-xs">
                        <span class="text-emerald-400 font-bold">Total Premios Oficiales:</span>
                        <strong class="text-emerald-400 font-mono text-sm">+${jSummary.premios.toFixed(2)} €</strong>
                    </div>
                    <div class="pt-2 text-[11px] text-slate-400">
                        Premios oficiales de Loterías y Apuestas del Estado en esta jornada.
                    </div>
                `;
            } else {
                body.innerHTML = `
                    <div class="py-3 text-center text-slate-400 text-xs">
                        Sin premios oficiales en esta jornada (ninguna quiniela alcanzó 10 aciertos).
                    </div>
                `;
            }
        } else if (type === 'sellado') {
            title.textContent = `🎟️ Coste Sellado - Jornada ${jornadaNum}`;
            body.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">19 Quinielas Sencillas:</span>
                    <strong class="text-slate-200 font-mono">19 × 0,75 € = 14,25 €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">1 Reducida (7 Dobles):</span>
                    <strong class="text-purple-300 font-mono">16 × 0,75 € = 10,50 €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Socio encargado:</span>
                    <strong class="text-rose-300">${jSummary.loserName || 'Designado'}</strong>
                </div>
                <div class="flex justify-between pt-1.5 text-xs">
                    <span class="text-rose-400 font-bold">Total Sellado Lotería:</span>
                    <strong class="text-rose-400 font-mono text-sm">-${jSummary.gastoSellado.toFixed(2)} €</strong>
                </div>
                <div class="pt-2 text-[11px] text-slate-400">
                    Importe real abonado físicamente en la administración de lotería.
                </div>
            `;
        } else if (type === 'neto') {
            title.textContent = `📈 Margen Neto Peña - Jornada ${jornadaNum}`;
            body.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-emerald-400 font-medium">+ Recaudado (Cuotas + Multas):</span>
                    <strong class="text-emerald-400 font-mono">+${jSummary.recaudacion.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-rose-400 font-medium">- Coste Sellado Lotería:</span>
                    <strong class="text-rose-400 font-mono">-${jSummary.gastoSellado.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-amber-400 font-medium">+ Premios Oficiales:</span>
                    <strong class="text-amber-400 font-mono">+${jSummary.premios.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between pt-1.5 text-xs border-t border-slate-700">
                    <span class="${jSummary.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-black">Superávit Neto Semanal:</span>
                    <strong class="${jSummary.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono text-base font-extrabold">
                        ${jSummary.neto >= 0 ? '+' : ''}${jSummary.neto.toFixed(2)} €
                    </strong>
                </div>
                <div class="pt-2 text-[11px] text-slate-400">
                    Beneficio neto generado en la jornada que incrementa directamente el bote común de la peña.
                </div>
            `;
        } else if (type === 'acumulado') {
            const crecimiento = parseFloat(extra) || 0;
            const totalCaja = BOTE_INICIAL + crecimiento;
            title.textContent = `💰 Bote Acumulado tras J${jornadaNum}`;
            body.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-amber-300 font-semibold">🌱 Bote Inicial (Agosto 2026):</span>
                    <strong class="text-amber-400 font-mono">+${BOTE_INICIAL.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="${crecimiento >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-medium">Margen Neto Acumulado (J1-J${jornadaNum}):</span>
                    <strong class="${crecimiento >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono">
                        ${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(2)} €
                    </strong>
                </div>
                <div class="flex justify-between pt-1.5 text-xs border-t border-slate-700">
                    <span class="text-white font-black text-sm">Bote Total en Caja:</span>
                    <strong class="text-amber-400 font-mono text-base font-extrabold">${totalCaja.toFixed(2)} €</strong>
                </div>
                <div class="pt-2 text-[11px] text-slate-400">
                    Saldo total real de la peña acumulado en cuenta bancaria y caja física.
                </div>
            `;
        } else if (type === 'jornada') {
            title.textContent = `⚽ Resumen Jornada ${jornadaNum}`;
            body.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Fecha oficial:</span>
                    <strong class="text-white">${jSummary.date}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-emerald-400 font-semibold">👑 Ganador (juega dobles):</span>
                    <strong class="text-white">${jSummary.winnerName || 'N/A'}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-rose-400 font-semibold">💀 Sellador (reembolso):</span>
                    <strong class="text-white">${jSummary.loserName || 'N/A'}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-slate-800 text-xs">
                    <span class="text-slate-400">Recaudado / Sellado:</span>
                    <strong class="text-slate-300 font-mono">+${jSummary.recaudacion.toFixed(2)} € / -${jSummary.gastoSellado.toFixed(2)} €</strong>
                </div>
                <div class="flex justify-between pt-1.5 text-xs">
                    <span class="${jSummary.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">Neto Semanal Peña:</span>
                    <strong class="${jSummary.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono text-sm">${jSummary.neto >= 0 ? '+' : ''}${jSummary.neto.toFixed(2)} €</strong>
                </div>
            `;
        }

        pop.classList.remove('hidden');
        this.positionPopover(pop, e.currentTarget);
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
        tr0.className = 'bg-amber-500/10 border-b border-amber-500/20 text-xs sm:text-sm font-semibold hover:bg-amber-500/15 transition-colors cursor-pointer';
        tr0.title = 'Clic en cualquier celda para ver el desglose del Bote Inicial';
        tr0.innerHTML = `
            <td class="p-3 font-bold text-amber-300 flex items-center gap-1.5 cursor-pointer hover:underline" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">
                <span>🌱</span> Inicio Temporada
            </td>
            <td class="p-3 text-slate-400 font-mono cursor-pointer" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">Agosto 2026</td>
            <td class="p-3 text-right font-mono text-emerald-400 font-bold cursor-pointer" colspan="2" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">Aportaciones Iniciales Socios (Bote Inicial)</td>
            <td class="p-3 text-right font-mono text-slate-500 cursor-pointer" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">-</td>
            <td class="p-3 text-right font-mono text-slate-500 cursor-pointer" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">-</td>
            <td class="p-3 text-right font-mono font-bold text-amber-300 cursor-pointer hover:underline" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">+${BOTE_INICIAL.toFixed(2)} €</td>
            <td class="p-3 text-right font-mono font-black text-amber-400 bg-amber-500/15 cursor-pointer hover:underline" onclick="window.BoteApp.showFlujoPopover(event, 'inicial', 0)">${BOTE_INICIAL.toFixed(2)} €</td>
        `;
        tbody.appendChild(tr0);

        data.jornadaSummaries.forEach(j => {
            const cuotasBase = j.numSocios * (j.costeColumna || 0.75);
            const penalties = Math.max(0, j.recaudacion - (j.numSocios * 1.50));
            saldoAcumuladoPeña += j.neto;
            totalCrecimiento += j.neto;

            const boteTotalJornada = BOTE_INICIAL + saldoAcumuladoPeña;
            const currentCrecimiento = saldoAcumuladoPeña;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-900/60 text-xs sm:text-sm transition-colors border-b border-slate-800/40';
            tr.innerHTML = `
                <td class="p-3 font-bold text-white cursor-pointer hover:text-orange-400 transition-colors" onclick="window.BoteApp.showFlujoPopover(event, 'jornada', ${j.number})" title="Clic para ver resumen de la Jornada ${j.number}">
                    Jornada ${j.number}
                </td>
                <td class="p-3 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors" onclick="window.BoteApp.showFlujoPopover(event, 'jornada', ${j.number})" title="Clic para ver resumen">
                    ${j.date}
                </td>
                <td class="p-3 text-right font-mono text-emerald-400 cursor-pointer hover:bg-emerald-500/15 rounded transition-colors" onclick="window.BoteApp.showFlujoPopover(event, 'cuotas', ${j.number})" title="Clic para ver desglose de cuotas base">
                    +${cuotasBase.toFixed(2)} €
                </td>
                <td class="p-3 text-right font-mono text-amber-400 cursor-pointer hover:bg-amber-500/15 rounded transition-colors" onclick="window.BoteApp.showFlujoPopover(event, 'penalizaciones', ${j.number})" title="Clic para ver desglose de penalizaciones">
                    +${penalties.toFixed(2)} €
                </td>
                <td class="p-3 text-right font-mono cursor-pointer hover:bg-emerald-500/15 rounded transition-colors ${j.premios > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}" onclick="window.BoteApp.showFlujoPopover(event, 'premios', ${j.number})" title="Clic para ver desglose de premios">
                    ${j.premios > 0 ? '+' + j.premios.toFixed(2) + ' €' : '-'}
                </td>
                <td class="p-3 text-right font-mono text-rose-400 cursor-pointer hover:bg-rose-500/15 rounded transition-colors" onclick="window.BoteApp.showFlujoPopover(event, 'sellado', ${j.number})" title="Clic para ver desglose del ticket de sellado">
                    -${j.gastoSellado.toFixed(2)} €
                </td>
                <td class="p-3 text-right font-mono font-bold cursor-pointer hover:bg-slate-800 rounded transition-colors ${j.neto >= 0 ? 'text-emerald-400' : 'text-rose-400'}" onclick="window.BoteApp.showFlujoPopover(event, 'neto', ${j.number})" title="Clic para ver la fórmula del superávit neto">
                    ${j.neto >= 0 ? '+' : ''}${j.neto.toFixed(2)} €
                </td>
                <td class="p-3 text-right font-mono font-extrabold text-amber-400 bg-slate-900/40 cursor-pointer hover:bg-amber-500/20 rounded transition-colors" onclick="window.BoteApp.showFlujoPopover(event, 'acumulado', ${j.number}, ${currentCrecimiento})" title="Clic para ver el desglose del bote acumulado">
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
        // Se extraen de las jornadas donde la quiniela reducida de dobles realmente obtuvo premio (extraPrizes > 0)
        const doblesPrizes = [];
        data.movements.forEach(m => {
            if ((m.extraPrizes || 0) > 0) {
                if (!doblesPrizes.some(x => x.jornadaNum === m.jornadaNum)) {
                    doblesPrizes.push({
                        jornadaNum: m.jornadaNum,
                        date: m.jornadaDate || m.date,
                        memberId: m.memberId,
                        memberName: m.memberName,
                        previousJornada: m.jornadaNum - 1,
                        hits: m.extraHits || 10,
                        amount: m.extraPrizes
                    });
                }
            }
        });

        let totDobles = doblesPrizes.reduce((sum, p) => sum + p.amount, 0);

        if (gridDobles) {
            if (doblesPrizes.length > 0) {
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
            } else {
                gridDobles.innerHTML = `
                    <div class="col-span-full p-6 rounded-xl bg-slate-900/60 border border-purple-500/20 text-center space-y-2">
                        <div class="text-2xl">🟣</div>
                        <div class="text-sm font-semibold text-purple-200">Sin premios en Quinielas de Dobles esta temporada</div>
                        <p class="text-xs text-slate-400 max-w-md mx-auto">
                            Cuando la quiniela reducida de 7 dobles (16 apuestas) consiga 10 o más aciertos, aquí se mostrarán los premios obtenidos y el desglose completo de la reducción.
                        </p>
                    </div>
                `;
            }
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
        if (badgeDobles) badgeDobles.textContent = totDobles > 0 ? `+${totDobles.toFixed(2)} €` : `0,00 €`;
        if (badgeIndiv) badgeIndiv.textContent = totIndiv > 0 ? `+${totIndiv.toFixed(2)} €` : `0,00 €`;
        if (badgeGlobal) badgeGlobal.textContent = (totDobles + totIndiv) > 0 ? `+${(totDobles + totIndiv).toFixed(2)} €` : `0,00 €`;
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

            <!-- Tarjeta explicativa de la reducción (Formato Superávit Peña) -->
            <div class="p-3.5 bg-slate-900/95 border border-purple-500/40 text-slate-300 rounded-xl shadow-2xl text-xs space-y-1">
                <strong class="text-purple-300 block font-bold flex items-center gap-1.5">
                    <span>🟣</span> ¿Cómo funciona la Reducción Autorizada R2 (7 dobles - 16 apuestas)?
                </strong>
                <p class="leading-relaxed">
                    La quiniela base pronosticada por <strong>${targetData.memberName}</strong> contiene 7 dobles (que al directo serían 128 apuestas = 96,00 €). El método oficial de reducción autorizada de LAE optimiza la jugada en exactamente <strong>16 apuestas estratégicas (coste 10,50 € pagado al 100% por la peña)</strong> asegurando el 100% al 13 si se aciertan los 14 signos y altas garantías de 14. En la tabla se compara el <strong>pronóstico base</strong> junto a las <strong>16 apuestas</strong> generadas y el <strong>resultado oficial</strong> de cada partido.
                </p>
            </div>

            <!-- Tabla de Partidos con Pronóstico como Columna al Principio junto a las 16 Apuestas -->
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-1.5 pb-1">
                    <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>📊</span> Matriz de Reducción: Pronóstico vs 16 Apuestas Desarrolladas
                    </h4>
                </div>
                <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 max-h-[62vh] shadow-inner">
                    <table class="w-full text-center text-xs border-collapse select-none">
                        <thead class="sticky top-0 z-30 bg-slate-950 shadow-md">
                            <tr class="bg-slate-950 text-slate-300 font-bold border-b border-slate-700 text-xs">
                                <th class="p-1.5 sm:p-2 text-center sticky left-0 z-40 bg-slate-950 w-7 sm:w-8 border-r border-slate-800">#</th>
                                <th class="p-1.5 sm:p-2 text-left bg-slate-950 min-w-[200px] sm:min-w-[250px] border-r border-slate-800">Partido</th>
                                <th class="p-1.5 sm:p-2 text-center bg-purple-950 text-purple-200 border-r-2 border-purple-500/70 min-w-[60px] sm:min-w-[68px]">
                                    <div class="flex flex-col items-center">
                                        <span>Pronóstico</span>
                                        <span class="text-[9px] text-purple-400 font-normal">7 Dobles</span>
                                    </div>
                                </th>
                                ${bets.map(b => {
                                    const isWin = b.hits >= 10;
                                    return isWin ? `
                                        <th class="p-1 sm:p-1.5 min-w-[44px] sm:min-w-[48px] font-mono text-center bg-gradient-to-b from-amber-500/40 to-amber-500/20 border-x-2 border-t-2 border-amber-400 text-amber-300 font-black shadow-md">
                                            <div class="flex flex-col items-center">
                                                <span class="text-[8px] sm:text-[9px] px-1 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black whitespace-nowrap shadow-sm">🏆 PREMIO</span>
                                                <span class="text-amber-200 font-extrabold text-xs whitespace-nowrap">Ap.${b.num}</span>
                                            </div>
                                        </th>
                                    ` : `
                                        <th class="p-1 sm:p-1.5 min-w-[40px] sm:min-w-[45px] font-mono text-center text-slate-400 border-x border-slate-800/60">
                                            <span class="whitespace-nowrap text-xs" title="Apuesta #${b.num} (${b.hits} aciertos)">Ap.${b.num}</span>
                                        </th>
                                    `;
                                }).join('')}
                                <th class="p-1.5 sm:p-2 text-center bg-slate-900 border-l border-slate-700 text-amber-300 min-w-[48px] sm:min-w-[54px]">
                                    Resultado
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800 font-mono text-xs">
                            ${matches.slice(0, 15).map((m, idx) => {
                                const isP15 = idx === 14;
                                const pronosticoSign = selection[idx] || '-';
                                const isDouble = idx < 14 && pronosticoSign && pronosticoSign.length > 1;
                                const res = m ? (m.result || '') : '';
                                const rSign = normalize(res);

                                return `
                                    <tr class="${isP15 ? 'bg-purple-950/20 border-t-2 border-purple-500/50 font-bold' : 'hover:bg-slate-800/40'} transition-colors">
                                        <td class="p-1 sm:p-1.5 text-center font-sans font-bold text-slate-400 sticky left-0 z-10 bg-slate-950/95 border-r border-slate-800">
                                            ${isP15 ? 'P15' : (idx + 1)}
                                        </td>
                                        <td class="p-1.5 sm:p-2 text-left font-sans text-slate-200 bg-slate-950/95 border-r border-slate-800 whitespace-nowrap min-w-[200px] sm:min-w-[250px]" title="${m.home} - ${m.away}">
                                            ${m.home} - ${m.away}
                                        </td>
                                        <td class="p-1 sm:p-1.5 text-center bg-purple-950/95 border-r-2 border-purple-500/70">
                                            <span class="inline-block px-1.5 py-0.5 rounded font-black text-xs ${isDouble ? 'bg-purple-500/30 text-purple-200 border border-purple-400/40 shadow-sm' : 'text-slate-300'}">
                                                ${pronosticoSign}
                                            </span>
                                        </td>
                                        ${bets.map(b => {
                                            const s = b.selection[idx] || '';
                                            const isHit = idx < 14 ? s.includes(rSign) : (s === res || s === rSign);
                                            const isWin = b.hits >= 10;
                                            
                                            if (isWin) {
                                                return `
                                                    <td class="p-1 sm:p-1.5 text-center bg-amber-500/15 border-x-2 border-amber-400/50 min-w-[44px] sm:min-w-[48px]">
                                                        <span class="inline-block w-6 h-6 leading-6 rounded font-black text-xs ${isHit ? 'bg-gradient-to-br from-amber-400 to-[#ff8a65] text-slate-950 shadow-md ring-1 ring-amber-300 scale-105' : 'text-slate-400 font-bold'}">
                                                            ${s}
                                                        </span>
                                                    </td>
                                                `;
                                            } else {
                                                return `
                                                    <td class="p-1 sm:p-1.5 text-center border-x border-slate-800/40 min-w-[40px] sm:min-w-[45px]">
                                                        <span class="inline-block w-6 h-6 leading-6 rounded font-black text-xs ${isHit ? 'bg-[#ff8a65] text-slate-950 shadow-sm' : 'text-slate-500'}">
                                                            ${s}
                                                        </span>
                                                    </td>
                                                `;
                                            }
                                        }).join('')}
                                        <td class="p-1 sm:p-1.5 text-center bg-slate-900/90 border-l border-slate-700 min-w-[48px] sm:min-w-[54px]">
                                            <span class="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-black">
                                                ${res || '-'}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                        <tfoot class="sticky bottom-0 z-30 bg-slate-950 border-t-2 border-slate-700 font-sans text-xs shadow-lg">
                            <tr>
                                <th colspan="2" class="p-2 sm:px-3 text-right font-bold text-white bg-slate-950 border-r border-slate-800">
                                    Aciertos Totales:
                                </th>
                                <th class="p-2 sm:px-3 text-center bg-purple-950 border-r-2 border-purple-500/70 text-[11px] text-purple-300 font-semibold min-w-[60px] sm:min-w-[68px]">
                                    16 Ap.
                                </th>
                                ${bets.map(b => {
                                    const isWin = b.hits >= 10;
                                    return isWin ? `
                                        <th class="p-1 sm:p-1.5 text-center font-mono bg-gradient-to-t from-amber-500/50 via-amber-500/30 to-amber-500/20 border-x-2 border-b-2 border-amber-400 min-w-[44px] sm:min-w-[48px]">
                                            <div class="flex flex-col items-center">
                                                <span class="px-1.5 py-0.5 rounded text-xs font-black bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 shadow-xl ring-2 ring-amber-400/60 inline-flex items-center gap-0.5 whitespace-nowrap">
                                                    🏆 ${b.hits} ac.
                                                </span>
                                            </div>
                                        </th>
                                    ` : `
                                        <th class="p-1 sm:p-1.5 text-center font-mono text-slate-400 border-x border-slate-800/60 min-w-[40px] sm:min-w-[45px]">
                                            <span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 whitespace-nowrap inline-block">${b.hits} ac.</span>
                                        </th>
                                    `;
                                }).join('')}
                                <th class="p-1.5 sm:p-2 text-center bg-slate-900 text-slate-400 text-[10px] font-semibold border-l border-slate-700 min-w-[48px] sm:min-w-[54px]">
                                    LAE
                                </th>
                            </tr>
                        </tfoot>
                    </table>
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

        // Adaptar el tamaño del diálogo modal calculando el tamaño de pantalla del dispositivo
        const modalDialog = document.querySelector('#modal-reducida-detalle > div');
        if (modalDialog) {
            const screenW = window.innerWidth;
            if (screenW >= 1400) {
                modalDialog.style.maxWidth = 'min(1720px, 98vw)';
            } else if (screenW >= 1100) {
                modalDialog.style.maxWidth = 'min(1500px, 98vw)';
            } else if (screenW >= 900) {
                modalDialog.style.maxWidth = 'min(1320px, 98vw)';
            } else {
                modalDialog.style.maxWidth = '98vw';
            }
        }
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
            if (m.isWinner) acText += ' 👑';
            else if (m.jugaDobles) acText += ' 🎲';
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

    // =========================================================================
    // CUADROS DE MANDO / GRÁFICOS (Chart.js)
    // =========================================================================

    setSociosViewMode(mode) {
        this.sociosViewMode = mode;
        const btnTable = document.getElementById('btn-socios-mode-table');
        const btnChart = document.getElementById('btn-socios-mode-chart');
        const tableCont = document.getElementById('socios-table-container');
        const chartCont = document.getElementById('socios-chart-container');

        if (mode === 'chart') {
            if (btnChart) {
                btnChart.className = 'px-2.5 py-1 rounded-lg font-bold bg-orange-500 text-slate-950 text-xs flex items-center gap-1.5 transition-all';
            }
            if (btnTable) {
                btnTable.className = 'px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white text-xs flex items-center gap-1.5 transition-all';
            }
            if (tableCont) tableCont.classList.add('hidden');
            if (chartCont) chartCont.classList.remove('hidden');
            setTimeout(() => this.renderSociosChart(), 50);
        } else {
            if (btnTable) {
                btnTable.className = 'px-2.5 py-1 rounded-lg font-bold bg-orange-500 text-slate-950 text-xs flex items-center gap-1.5 transition-all';
            }
            if (btnChart) {
                btnChart.className = 'px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white text-xs flex items-center gap-1.5 transition-all';
            }
            if (chartCont) chartCont.classList.add('hidden');
            if (tableCont) tableCont.classList.remove('hidden');
        }
    }

    renderSociosChart() {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById('chart-socios-saldos');
        if (!canvas) return;

        if (this.chartSocios) {
            this.chartSocios.destroy();
            this.chartSocios = null;
        }

        const data = this.getSeasonData();
        // Ordenar socios por saldo descendente para efecto ranking / leaderboard
        const members = [...data.memberSummaries].sort((a, b) => b.saldo - a.saldo);

        const labels = members.map(m => m.name);
        const saldos = members.map(m => m.saldo);
        const bgColors = members.map(m => {
            if (m.saldo >= 40) return 'rgba(16, 185, 129, 0.85)'; // Emerald
            if (m.saldo >= 10) return 'rgba(245, 158, 11, 0.85)'; // Amber
            return 'rgba(244, 63, 94, 0.85)'; // Rose
        });
        const borderColors = members.map(m => {
            if (m.saldo >= 40) return '#10b981';
            if (m.saldo >= 10) return '#f59e0b';
            return '#f43f5e';
        });

        const ctx = canvas.getContext('2d');
        this.chartSocios = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo Actual',
                    data: saldos,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    borderRadius: 6,
                    maxBarThickness: 20
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(245, 158, 11, 0.4)',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        callbacks: {
                            label: (context) => {
                                const m = members[context.dataIndex];
                                return [
                                    ` Saldo: ${m.saldo.toFixed(2)} €`,
                                    ` Ingresos: +${m.totIn.toFixed(2)} €`,
                                    ` Gastos & Multas: -${m.totOut.toFixed(2)} €`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'JetBrains Mono', size: 11 },
                            callback: (v) => v + ' €'
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: '#e2e8f0',
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements && elements.length > 0) {
                        const idx = elements[0].index;
                        const m = members[idx];
                        if (m) this.openMemberExtract(m.id);
                    }
                }
            }
        });
    }

    toggleJornadasChart() {
        const wrapper = document.getElementById('jornadas-chart-wrapper');
        const text = document.getElementById('text-toggle-jornadas-chart');
        const icon = document.getElementById('icon-toggle-jornadas-chart');
        if (!wrapper) return;
        const isHidden = wrapper.classList.toggle('hidden');
        if (text) text.textContent = isHidden ? 'Mostrar Gráfico' : 'Ocultar Gráfico';
        if (icon) icon.textContent = isHidden ? '▼' : '▲';
        if (!isHidden) {
            setTimeout(() => this.renderJornadasChart(), 50);
        }
    }

    renderJornadasChart() {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById('chart-jornadas-sellado');
        if (!canvas) return;

        if (this.chartJornadas) {
            this.chartJornadas.destroy();
            this.chartJornadas = null;
        }

        const data = this.getSeasonData();
        const summaries = data.jornadaSummaries || [];
        if (summaries.length === 0) return;

        const labels = summaries.map(j => `J${j.number}`);
        const recaudacion = summaries.map(j => j.recaudacion);
        const sellado = summaries.map(j => j.gastoSellado);
        const neto = summaries.map(j => j.neto);

        const ctx = canvas.getContext('2d');
        this.chartJornadas = new Chart(ctx, {
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Recaudación (Cuotas + Multas)',
                        data: recaudacion,
                        backgroundColor: 'rgba(16, 185, 129, 0.75)',
                        borderColor: '#10b981',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'Coste Sellado LAE (24,75 €)',
                        data: sellado,
                        backgroundColor: 'rgba(244, 63, 94, 0.75)',
                        borderColor: '#f43f5e',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        order: 2
                    },
                    {
                        type: 'line',
                        label: 'Superávit Semanal (Margen Neto)',
                        data: neto,
                        borderColor: '#f59e0b',
                        backgroundColor: '#f59e0b',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#090d16',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.3,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#cbd5e1',
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            boxWidth: 12,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255, 145, 0, 0.4)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (context) => ` ${context.dataset.label}: ${context.raw >= 0 ? '+' : ''}${context.raw.toFixed(2)} €`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'JetBrains Mono', size: 11 },
                            callback: (v) => v + ' €'
                        }
                    }
                }
            }
        });
    }

    toggleFlujoChart() {
        const wrapper = document.getElementById('flujo-chart-wrapper');
        const text = document.getElementById('text-toggle-flujo-chart');
        const icon = document.getElementById('icon-toggle-flujo-chart');
        if (!wrapper) return;
        const isHidden = wrapper.classList.toggle('hidden');
        if (text) text.textContent = isHidden ? 'Mostrar Gráfico' : 'Ocultar Gráfico';
        if (icon) icon.textContent = isHidden ? '▼' : '▲';
        if (!isHidden) {
            setTimeout(() => this.renderFlujoChart(), 50);
        }
    }

    renderFlujoChart() {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById('chart-flujo-evolucion');
        if (!canvas) return;

        if (this.chartFlujo) {
            this.chartFlujo.destroy();
            this.chartFlujo = null;
        }

        const data = this.getSeasonData();
        const summaries = data.jornadaSummaries || [];

        const BOTE_INICIAL = 738.68;
        const labels = ['Inicio'];
        const values = [BOTE_INICIAL];

        let running = BOTE_INICIAL;
        summaries.forEach(j => {
            labels.push(`J${j.number}`);
            running += (j.neto || 0);
            values.push(parseFloat(running.toFixed(2)));
        });

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

        this.chartFlujo = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Bote Total de la Peña',
                    data: values,
                    borderColor: '#f59e0b',
                    borderWidth: 2.5,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#090d16',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(245, 158, 11, 0.4)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                const diff = val - BOTE_INICIAL;
                                return [
                                    ` Bote Acumulado: ${val.toFixed(2)} €`,
                                    ` Crecimiento Neto: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} €`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' }
                        }
                    },
                    y: {
                        min: Math.floor(BOTE_INICIAL - 20),
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'JetBrains Mono', size: 11 },
                            callback: (v) => v + ' €'
                        }
                    }
                }
            }
        });
    }
}

// Inicialización automática
document.addEventListener('DOMContentLoaded', () => {
    window.BoteApp = new BoteAppController();
});
