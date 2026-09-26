/**
 * Socios 2.0 Controller - Peña Maulas PWA
 * =========================================================================
 * Gestor avanzado de socios con estética Bote 2 (Glassmorphism + Tailwind)
 * Exclusivo en fase de pruebas para el evaluador: Fernando Lozano (ID: 6)
 * =========================================================================
 */

class SociosAppController {
    constructor() {
        this.members = [];
        this.pronosticos = [];
        this.jornadas = [];
        this.filteredMembers = [];
        
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.viewMode = localStorage.getItem('maulas_socios_view') || 'grid';
        this.deleteMode = false;
        
        this.sortColumn = 'id';
        this.sortAscending = true;

        this.initialized = false;
        this.init();
    }

    /**
     * Inicialización del controlador
     */
    async init() {
        // 1. Verificar permisos de acceso (Fernando Lozano)
        const hasAccess = this.checkAccessPermission();
        if (!hasAccess) {
            this.showRestrictedScreen();
            return;
        }

        this.showMainContent();

        // 2. Cargar datos de la base de datos
        await this.loadLiveFirebaseData();

        // 3. Configurar interfaz inicial
        this.setViewMode(this.viewMode, false);
        this.applyFilters();
    }

    /**
     * Comprueba si el usuario autenticado es Fernando Lozano
     */
    checkAccessPermission() {
        try {
            // Comprobar parámetros en URL (?evaluador=6 o ?user=6)
            const urlParams = new URLSearchParams(window.location.search);
            const evalParam = (urlParams.get('evaluador') || urlParams.get('user') || urlParams.get('socio') || '').toLowerCase();
            if (evalParam === '6' || evalParam === 'fernando' || evalParam === 'lozano') {
                const user = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
                sessionStorage.setItem('maulas_user', JSON.stringify(user));
                localStorage.setItem('maulas_user', JSON.stringify(user));
                return true;
            }

            const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
            if (!userStr) return false;

            const user = JSON.parse(userStr);
            const uid = String(user.id || '');
            const email = (user.email || '').toLowerCase().trim();
            const name = (user.name || '').toLowerCase().trim();
            const phone = (user.phone || '').toLowerCase().trim();

            return (
                uid === '6' ||
                email === 'lozano@maulas.com' ||
                name.includes('fernando lozano') ||
                (name.includes('lozano') && !name.includes('ram')) ||
                phone.includes('lozano')
            );
        } catch (e) {
            return false;
        }
    }

    showRestrictedScreen() {
        const rest = document.getElementById('restricted-access-screen');
        const main = document.getElementById('main-content');
        if (rest) rest.classList.remove('hidden');
        if (main) main.classList.add('hidden');
    }

    showMainContent() {
        const rest = document.getElementById('restricted-access-screen');
        const main = document.getElementById('main-content');
        if (rest) rest.classList.add('hidden');
        if (main) main.classList.remove('hidden');
    }

    quickAuth(memberId) {
        if (String(memberId) === '6') {
            const user = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
            sessionStorage.setItem('maulas_user', JSON.stringify(user));
            localStorage.setItem('maulas_user', JSON.stringify(user));
            this.showMainContent();
            this.init();
        }
    }

    /**
     * Carga de datos reales desde Firestore
     */
    async loadLiveFirebaseData() {
        try {
            if (window.DataService) {
                await window.DataService.init();
                this.members = await window.DataService.getAll('members') || [];
                this.pronosticos = await window.DataService.getAll('pronosticos') || [];
                this.jornadas = await window.DataService.getAll('jornadas') || [];
            }
        } catch (e) {
            console.error('[Socios 2.0] Error cargando datos de Firestore:', e);
        }
    }

    /**
     * Cálculo y renderizado de los KPIs superiores
     */
    renderKPIs() {
        const totalSocios = this.members.length;
        
        // Dados activos hoy
        const todayStr = new Date().toISOString().split('T')[0];
        let dadosActivosHoy = 0;
        let totalDadosUsados = 0;
        let conTelegram = 0;

        this.members.forEach(m => {
            const uses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;
            totalDadosUsados += uses;

            if (m.diceEnabled && m.diceStartDate && m.diceEndDate) {
                if (todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && uses < 3) {
                    dadosActivosHoy++;
                }
            }

            if (m.tgNick && m.tgNick.trim() !== '') {
                conTelegram++;
            }
        });

        const maxComodinesTemporada = totalSocios * 3;

        // Inyectar en el DOM
        const elTotal = document.getElementById('kpi-total-socios');
        const elActivos = document.getElementById('kpi-dados-activos');
        const elUsados = document.getElementById('kpi-dados-usados');
        const elTg = document.getElementById('kpi-telegram-vinculados');

        if (elTotal) elTotal.textContent = totalSocios;
        if (elActivos) elActivos.textContent = dadosActivosHoy;
        if (elUsados) elUsados.textContent = `${totalDadosUsados} / ${maxComodinesTemporada}`;
        if (elTg) elTg.textContent = `${conTelegram} / ${totalSocios}`;

        // Contadores en las píldoras de filtro
        this.updatePillCounters();
    }

    updatePillCounters() {
        const todayStr = new Date().toISOString().split('T')[0];
        let cAll = this.members.length;
        let cActive = 0;
        let cExhausted = 0;
        let cTg = 0;

        this.members.forEach(m => {
            const uses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;
            if (uses >= 3) cExhausted++;
            if (m.diceEnabled && m.diceStartDate && m.diceEndDate && todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && uses < 3) {
                cActive++;
            }
            if (m.tgNick && m.tgNick.trim() !== '') cTg++;
        });

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('count-all', cAll);
        setTxt('count-dice-active', cActive);
        setTxt('count-dice-exhausted', cExhausted);
        setTxt('count-telegram', cTg);
    }

    /**
     * Aplica filtros y ordenación
     */
    applyFilters() {
        const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        this.searchQuery = query;

        // Botón limpiar búsqueda
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', query === '');
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Filtrar
        this.filteredMembers = this.members.filter(m => {
            const uses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;

            // Filtro por categoría
            if (this.currentCategory === 'dice_active') {
                const isActive = m.diceEnabled && m.diceStartDate && m.diceEndDate && todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && uses < 3;
                if (!isActive) return false;
            } else if (this.currentCategory === 'dice_exhausted') {
                if (uses < 3) return false;
            } else if (this.currentCategory === 'telegram') {
                if (!m.tgNick || m.tgNick.trim() === '') return false;
            }

            // Filtro por texto
            if (query !== '') {
                const name = (m.name || '').toLowerCase();
                const phone = (m.phone || '').toLowerCase();
                const email = (m.email || '').toLowerCase();
                const tg = (m.tgNick || '').toLowerCase();
                const idStr = String(m.id || '');

                const matches = (
                    name.includes(query) ||
                    phone.includes(query) ||
                    email.includes(query) ||
                    tg.includes(query) ||
                    idStr === query
                );
                if (!matches) return false;
            }

            return true;
        });

        // 2. Ordenar
        this.filteredMembers.sort((a, b) => {
            let valA = a[this.sortColumn];
            let valB = b[this.sortColumn];

            if (this.sortColumn === 'diceUses') {
                valA = window.DiceService ? window.DiceService.getDiceUsageCount(a.id, this.pronosticos) : 0;
                valB = window.DiceService ? window.DiceService.getDiceUsageCount(b.id, this.pronosticos) : 0;
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return this.sortAscending ? -1 : 1;
            if (valA > valB) return this.sortAscending ? 1 : -1;
            return a.id - b.id;
        });

        // 3. Renderizar vistas
        this.renderKPIs();
        this.renderGridView();
        this.renderTableView();
    }

    clearSearch() {
        const inp = document.getElementById('search-input');
        if (inp) inp.value = '';
        this.applyFilters();
    }

    setCategoryFilter(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-pill').forEach(btn => {
            const isTarget = btn.getAttribute('data-cat') === cat;
            if (isTarget) {
                btn.className = 'cat-pill px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-slate-950 shadow-md';
            } else {
                btn.className = 'cat-pill px-3 py-1.5 rounded-lg text-xs font-bold transition bg-slate-800 text-slate-400 hover:text-white border border-slate-700';
            }
        });
        this.applyFilters();
    }

    setViewMode(mode, save = true) {
        this.viewMode = mode;
        if (save) localStorage.setItem('maulas_socios_view', mode);

        const btnGrid = document.getElementById('view-mode-grid');
        const btnTable = document.getElementById('view-mode-table');
        const containerGrid = document.getElementById('members-grid-container');
        const containerTable = document.getElementById('members-table-container');

        if (mode === 'grid') {
            if (btnGrid) btnGrid.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-slate-950 shadow flex items-center gap-1.5';
            if (btnTable) btnTable.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white flex items-center gap-1.5';
            if (containerGrid) containerGrid.classList.remove('hidden');
            if (containerTable) containerTable.classList.add('hidden');
        } else {
            if (btnGrid) btnGrid.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white flex items-center gap-1.5';
            if (btnTable) btnTable.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-slate-950 shadow flex items-center gap-1.5';
            if (containerGrid) containerGrid.classList.add('hidden');
            if (containerTable) containerTable.classList.remove('hidden');
        }
    }

    sortBy(column) {
        if (this.sortColumn === column) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.sortColumn = column;
            this.sortAscending = true;
        }
        this.applyFilters();
    }

    toggleDeleteMode() {
        this.deleteMode = !this.deleteMode;
        const icon = document.getElementById('delete-mode-icon');
        const txt = document.getElementById('delete-mode-text');
        const btn = document.getElementById('btn-toggle-delete');

        if (this.deleteMode) {
            if (icon) icon.textContent = '✕';
            if (txt) txt.textContent = 'Terminar Bajas';
            if (btn) btn.className = 'px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition flex items-center gap-2 shadow-lg shadow-rose-600/30';
        } else {
            if (icon) icon.textContent = '➖';
            if (txt) txt.textContent = 'Modo Bajas';
            if (btn) btn.className = 'px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-sm transition flex items-center gap-2';
        }

        this.applyFilters();
    }

    /**
     * VISTA 1: FICHAS DEPORTIVAS (GRID)
     */
    renderGridView() {
        const container = document.getElementById('members-grid-container');
        if (!container) return;

        if (this.filteredMembers.length === 0) {
            container.innerHTML = `
                <div class="col-span-full glass-panel p-12 text-center text-slate-400">
                    <span class="text-4xl block mb-2">🔍</span>
                    <p class="font-bold text-white text-base">No se encontraron socios</p>
                    <p class="text-xs text-slate-500 mt-1">Prueba a cambiar el filtro o el término de búsqueda.</p>
                </div>
            `;
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        container.innerHTML = this.filteredMembers.map(m => {
            const diceUses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;
            const isExhausted = diceUses >= 3;
            const isActive = m.diceEnabled && m.diceStartDate && m.diceEndDate && todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && !isExhausted;

            // Formato de fechas
            let dateRangeStr = '';
            if (m.diceStartDate && m.diceEndDate) {
                const s = m.diceStartDate.split('-').reverse().slice(0, 2).join('/');
                const e = m.diceEndDate.split('-').reverse().slice(0, 2).join('/');
                dateRangeStr = `${s} - ${e}`;
            }

            // Iniciales del avatar
            const names = (m.name || 'Socio').trim().split(' ');
            const initials = names.length > 1 ? (names[0][0] + names[1][0]).toUpperCase() : names[0].slice(0, 2).toUpperCase();

            // Segmentos del dado (3 casillas)
            let segmentsHtml = '';
            for (let i = 1; i <= 3; i++) {
                if (i <= diceUses) {
                    segmentsHtml += `<div class="h-2 flex-1 rounded-full bg-rose-500 shadow-sm" title="Jornada ${i}: Usada"></div>`;
                } else if (isActive && i === diceUses + 1) {
                    segmentsHtml += `<div class="h-2 flex-1 rounded-full bg-amber-400 animate-pulse shadow-sm" title="Dado activo en curso"></div>`;
                } else {
                    segmentsHtml += `<div class="h-2 flex-1 rounded-full bg-slate-800 border border-slate-700" title="Comodín ${i}: Disponible"></div>`;
                }
            }

            // Badge de estado del dado
            let diceBadge = '';
            if (isExhausted) {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">⚠️ 3/3 Agotado</span>`;
            } else if (isActive) {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">🎲 Activo (${dateRangeStr})</span>`;
            } else if (m.diceEnabled && m.diceStartDate && m.diceEndDate) {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">Programado (${dateRangeStr})</span>`;
            } else {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-slate-500 border border-slate-800">⚪ Inactivo</span>`;
            }

            // Botón de acción
            let actionBtn = '';
            if (this.deleteMode) {
                actionBtn = `
                    <button onclick="window.SociosApp.deleteMember(${m.id})" class="w-full py-2 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow">
                        <span>🗑️</span>
                        <span>Dar de Baja</span>
                    </button>
                `;
            } else {
                actionBtn = `
                    <button onclick="window.SociosApp.editMember(${m.id})" class="w-full py-2 bg-slate-800 hover:bg-slate-700 hover:text-amber-400 text-slate-300 border border-slate-700/80 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5">
                        <span>✏️</span>
                        <span>Editar Socio y Dado</span>
                    </button>
                `;
            }

            return `
                <div class="glass-panel member-card p-5 flex flex-col justify-between border-slate-800/80">
                    <div>
                        <!-- Fila Superior: Avatar + Nº Socio -->
                        <div class="flex items-start justify-between gap-3 mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-base flex items-center justify-center shadow-md shadow-amber-500/10">
                                    ${initials}
                                </div>
                                <div>
                                    <h3 class="text-sm font-bold text-white leading-tight">${m.name}</h3>
                                    <p class="text-xs font-bold text-amber-400 mt-0.5">
                                        ${m.phone ? `"${m.phone}"` : '<span class="text-slate-500 italic font-normal">Sin apodo</span>'}
                                    </p>
                                </div>
                            </div>
                            <span class="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-900 text-slate-400 border border-slate-800">
                                #${String(m.id).padStart(2, '0')}
                            </span>
                        </div>

                        <!-- Información de Contacto -->
                        <div class="space-y-1.5 text-xs text-slate-400 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 font-mono">
                            <div class="flex items-center gap-2 truncate" title="${m.email}">
                                <span class="text-slate-500">✉️</span>
                                <a href="mailto:${m.email}" class="hover:text-amber-400 truncate text-slate-300">${m.email}</a>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-slate-500">💬</span>
                                ${m.tgNick ? `
                                    <a href="https://t.me/${m.tgNick}" target="_blank" rel="noopener" class="text-sky-400 hover:underline flex items-center gap-1">
                                        <span>@${m.tgNick}</span>
                                        <span class="text-[10px]">↗</span>
                                    </a>
                                ` : `
                                    <span class="text-slate-600 italic">Sin Telegram</span>
                                `}
                            </div>
                        </div>

                        <!-- Estado del Dado de Quinielas -->
                        <div class="space-y-2 mb-4">
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-400 font-semibold flex items-center gap-1">
                                    <span>🎲</span>
                                    <span>Dado</span>
                                </span>
                                ${diceBadge}
                            </div>
                            <div class="flex gap-1.5">
                                ${segmentsHtml}
                            </div>
                            <div class="text-[10px] text-slate-500 text-right">
                                ${diceUses} de 3 jornadas consumidas
                            </div>
                        </div>
                    </div>

                    <!-- Footer: Botón de Acción -->
                    <div>
                        ${actionBtn}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * VISTA 2: TABLA COMPACTA EN UNA SOLA LÍNEA (ESTILO BOTE 2)
     */
    renderTableView() {
        const tbody = document.getElementById('members-table-body');
        if (!tbody) return;

        if (this.filteredMembers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500">No se encontraron socios.</td></tr>`;
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        tbody.innerHTML = this.filteredMembers.map(m => {
            const diceUses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;
            const isExhausted = diceUses >= 3;
            const isActive = m.diceEnabled && m.diceStartDate && m.diceEndDate && todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && !isExhausted;

            let dateRangeStr = '';
            if (m.diceStartDate && m.diceEndDate) {
                const s = m.diceStartDate.split('-').reverse().slice(0, 2).join('/');
                const e = m.diceEndDate.split('-').reverse().slice(0, 2).join('/');
                dateRangeStr = `${s} - ${e}`;
            }

            let diceBadge = '';
            if (isExhausted) {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">⚠️ Agotado</span>`;
            } else if (isActive) {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">🎲 Activo (${dateRangeStr})</span>`;
            } else if (m.diceEnabled && m.diceStartDate) {
                diceBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">Prog. (${dateRangeStr})</span>`;
            } else {
                diceBadge = `<span class="text-slate-500 text-xs">Inactivo</span>`;
            }

            let actionBtn = '';
            if (this.deleteMode) {
                actionBtn = `<button onclick="window.SociosApp.deleteMember(${m.id})" class="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded text-[11px] font-bold transition">🗑️ Eliminar</button>`;
            } else {
                actionBtn = `<button onclick="window.SociosApp.editMember(${m.id})" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded text-[11px] font-bold transition border border-slate-700">✏️ Modificar</button>`;
            }

            return `
                <tr class="hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-slate-400">#${String(m.id).padStart(2, '0')}</td>
                    <td class="py-3 px-4 font-sans font-bold text-white">${m.name}</td>
                    <td class="py-3 px-4 text-amber-400 font-bold">${m.phone || '<span class="text-slate-600 font-normal italic">--</span>'}</td>
                    <td class="py-3 px-4 text-slate-300"><a href="mailto:${m.email}" class="hover:text-amber-400">${m.email}</a></td>
                    <td class="py-3 px-4">
                        ${m.tgNick ? `<a href="https://t.me/${m.tgNick}" target="_blank" rel="noopener" class="text-sky-400 hover:underline">@${m.tgNick}</a>` : '<span class="text-slate-600 italic">N/A</span>'}
                    </td>
                    <td class="py-3 px-4">${diceBadge}</td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2 py-0.5 rounded font-bold ${diceUses >= 3 ? 'text-rose-400 bg-rose-500/10' : 'text-slate-300 bg-slate-800'}">
                            ${diceUses} / 3
                        </span>
                    </td>
                    <td class="py-3 px-4 text-right">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * MODAL DE ALTA / EDICIÓN
     */
    openModal(member = null) {
        const modal = document.getElementById('modal-member-form');
        const title = document.getElementById('modal-form-title');
        const form = document.getElementById('member-edit-form');

        const inpId = document.getElementById('form-inp-id');
        const inpName = document.getElementById('form-inp-name');
        const inpPhone = document.getElementById('form-inp-phone');
        const inpTgNick = document.getElementById('form-inp-tgnick');
        const inpEmail = document.getElementById('form-inp-email');

        const inpDiceEnabled = document.getElementById('form-inp-dice-enabled');
        const inpDiceStart = document.getElementById('form-inp-dice-start');
        const inpDiceEnd = document.getElementById('form-inp-dice-end');
        const lblDiceCounter = document.getElementById('form-lbl-dice-counter');
        const alertExhausted = document.getElementById('form-dice-exhausted-alert');

        if (member) {
            if (title) title.textContent = 'Editar Socio #' + member.id;
            if (inpId) inpId.value = member.id;
            if (inpName) inpName.value = member.name || '';
            if (inpPhone) inpPhone.value = member.phone || '';
            if (inpTgNick) inpTgNick.value = member.tgNick || '';
            if (inpEmail) inpEmail.value = member.email || '';

            const diceUses = window.DiceService ? window.DiceService.getDiceUsageCount(member.id, this.pronosticos) : 0;
            if (lblDiceCounter) lblDiceCounter.textContent = `${diceUses} / 3 usadas`;

            const isExhausted = diceUses >= 3;
            if (alertExhausted) alertExhausted.classList.toggle('hidden', !isExhausted);

            if (inpDiceEnabled) {
                inpDiceEnabled.checked = !isExhausted && !!member.diceEnabled;
                inpDiceEnabled.disabled = isExhausted;
            }

            if (inpDiceStart) {
                inpDiceStart.value = member.diceStartDate || '';
                inpDiceStart.disabled = isExhausted;
            }
            if (inpDiceEnd) {
                inpDiceEnd.value = member.diceEndDate || '';
                inpDiceEnd.disabled = isExhausted;
            }
        } else {
            if (title) title.textContent = 'Alta de Nuevo Socio';
            if (form) form.reset();
            if (inpId) inpId.value = '';
            if (lblDiceCounter) lblDiceCounter.textContent = '0 / 3 usadas';
            if (alertExhausted) alertExhausted.classList.add('hidden');
            if (inpDiceEnabled) {
                inpDiceEnabled.checked = false;
                inpDiceEnabled.disabled = false;
            }
            if (inpDiceStart) inpDiceStart.disabled = false;
            if (inpDiceEnd) inpDiceEnd.disabled = false;
        }

        this.toggleDiceFields();

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeModal() {
        const modal = document.getElementById('modal-member-form');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    toggleDiceFields() {
        const chk = document.getElementById('form-inp-dice-enabled');
        const container = document.getElementById('form-dice-dates');
        if (chk && container) {
            const active = chk.checked && !chk.disabled;
            container.style.opacity = active ? '1' : '0.4';
            container.style.pointerEvents = active ? 'auto' : 'none';
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        // 1. Protección de broma para Emilio
        const userStr = sessionStorage.getItem('maulas_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const isEmilio = (user && (user.email || '').toLowerCase() === 'emilio@maulas.com');

        const idVal = document.getElementById('form-inp-id')?.value;

        if (isEmilio) {
            if (!idVal) {
                alert("Acceso Restringido. Emilio no tiene permiso para dar de alta nuevos socios.");
                return;
            }
            const memberToEdit = this.members.find(m => String(m.id) === String(idVal));
            if (memberToEdit && (memberToEdit.email || '').toLowerCase() !== 'emilio@maulas.com') {
                alert("Acceso Restringido. Emilio no tiene permiso para modificar datos de otros socios.");
                return;
            }
        }

        // 2. Validar fechas del dado
        const chkDice = document.getElementById('form-inp-dice-enabled');
        const sDate = document.getElementById('form-inp-dice-start')?.value;
        const eDate = document.getElementById('form-inp-dice-end')?.value;

        const isDice = chkDice && chkDice.checked && !chkDice.disabled;

        if (isDice) {
            if (!sDate || !eDate) {
                alert("Por favor, introduce la fecha de inicio y de fin para el Dado de Quinielas.");
                return;
            }
            if (sDate > eDate) {
                alert("La fecha de inicio del dado no puede ser posterior a la fecha de fin.");
                return;
            }
        }

        const name = document.getElementById('form-inp-name')?.value.trim();
        const phone = document.getElementById('form-inp-phone')?.value.trim();
        const tgNick = (document.getElementById('form-inp-tgnick')?.value || '').replace('@', '').trim();
        const email = document.getElementById('form-inp-email')?.value.trim().toLowerCase();

        let memberObj = null;

        if (idVal) {
            // Edición
            const id = parseInt(idVal, 10);
            memberObj = this.members.find(m => m.id === id);
            if (memberObj) {
                memberObj.name = name;
                memberObj.phone = phone;
                memberObj.tgNick = tgNick;
                memberObj.email = email;
                memberObj.diceEnabled = isDice;
                memberObj.diceStartDate = isDice ? sDate : '';
                memberObj.diceEndDate = isDice ? eDate : '';
            }
        } else {
            // Alta de nuevo socio
            const nextId = this.members.length > 0 ? Math.max(...this.members.map(m => m.id)) + 1 : 1;
            memberObj = {
                id: nextId,
                name: name,
                phone: phone,
                tgNick: tgNick,
                email: email,
                diceEnabled: isDice,
                diceStartDate: isDice ? sDate : '',
                diceEndDate: isDice ? eDate : '',
                joinedDate: new Date().toISOString()
            };
        }

        if (memberObj && window.DataService) {
            try {
                await window.DataService.save('members', memberObj);
                await this.loadLiveFirebaseData();
                this.applyFilters();
                this.closeModal();
                alert(`✅ Socio ${memberObj.name} guardado con éxito.`);
            } catch (err) {
                console.error('[Socios 2.0] Error guardando socio:', err);
                alert('Error al guardar socio: ' + err.message);
            }
        }
    }

    editMember(id) {
        const mem = this.members.find(m => m.id === id);
        if (mem) this.openModal(mem);
    }

    async deleteMember(id) {
        // Protección broma para Emilio
        const userStr = sessionStorage.getItem('maulas_user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (user && (user.email || '').toLowerCase() === 'emilio@maulas.com') {
            alert("Acceso Restringido. Emilio no tiene permiso para dar de baja a socios.");
            return;
        }

        const mem = this.members.find(m => m.id === id);
        const name = mem ? mem.name : `Socio #${id}`;

        if (confirm(`¿Estás seguro de que deseas dar de baja al socio ${name}?`)) {
            try {
                if (window.DataService) {
                    await window.DataService.delete('members', id);
                    await this.loadLiveFirebaseData();
                    this.applyFilters();
                    alert(`🗑️ Socio ${name} dado de baja correctamente.`);
                }
            } catch (err) {
                console.error('[Socios 2.0] Error eliminando socio:', err);
                alert('Error al eliminar socio: ' + err.message);
            }
        }
    }
}

// Exponer globalmente e instanciar
window.SociosApp = new SociosAppController();
