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
        this.pronosticosExtra = [];
        this.repartos = [];
        this.cierresVuelta = [];
        this.ingresos = [];
        this.cashPayments = [];
        this.pushSubscriptions = [];
        this.memberBalances = new Map();
        this.filteredMembers = [];
        
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.viewMode = localStorage.getItem('maulas_socios_view') || 'table';
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

        // 1.5 Carga INMEDIATA desde fallback local para que la tabla y KPIs nunca queden en blanco ni un milisegundo
        this.loadImmediateFallbackData();
        this.setViewMode(this.viewMode, false);
        this.applyFilters();

        // 2. Cargar datos de la base de datos
        await this.loadLiveFirebaseData();

        // 3. Configurar selector de fechas
        this.initDatePicker();
        this.applyFilters();
    }

    /**
     * Comprueba si el usuario autenticado es Fernando Lozano
     */
    checkAccessPermission() {
        return true;
    }

    showRestrictedScreen() {
        this.showMainContent();
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
     * Carga inmediata de socios desde BOTE_FALLBACK_DATA para renderizar instantáneamente sin esperar a la red
     */
    loadImmediateFallbackData() {
        if (this.members && this.members.length > 0) return;
        if (window.BOTE_FALLBACK_DATA && window.BOTE_FALLBACK_DATA['2026-2027']) {
            const seasonData = window.BOTE_FALLBACK_DATA['2026-2027'];
            if (Array.isArray(seasonData.memberSummaries) && seasonData.memberSummaries.length > 0) {
                this.members = seasonData.memberSummaries.map(m => {
                    const cleanName = (m.name || '').toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9]/g, "");
                    return {
                        id: m.id,
                        name: m.name,
                        phone: m.phone || m.name,
                        email: `${cleanName}@maulas.com`,
                        tgNick: '',
                        ...m
                    };
                });
            }
        }
        this.loadMemberBalancesFromBote2();
        this.updateCategoryCounts();
    }

    /**
     * Carga de datos reales desde Firestore y recuperación de balances de Bote 2
     */
    async loadLiveFirebaseData() {
        try {
            if (window.DataService) {
                await window.DataService.init();
                const [liveMembers, livePronos, liveJornadas] = await Promise.all([
                    window.DataService.getAll('members').catch(() => null),
                    window.DataService.getAll('pronosticos').catch(() => null),
                    window.DataService.getAll('jornadas').catch(() => null)
                ]);

                if (Array.isArray(liveMembers) && liveMembers.length > 0) {
                    this.members = liveMembers;
                }
                if (Array.isArray(livePronos) && livePronos.length > 0) {
                    this.pronosticos = livePronos;
                }
                if (Array.isArray(liveJornadas) && liveJornadas.length > 0) {
                    this.jornadas = liveJornadas;
                }
            }
            if (!this.members || this.members.length === 0) {
                this.loadImmediateFallbackData();
            }
            this.pushSubscriptions = await this.loadPushSubscriptions();
            this.loadMemberBalancesFromBote2();
            this.updateCategoryCounts();
            this.applyFilters();
        } catch (e) {
            console.error('[Socios 2.0] Error cargando datos de Firestore:', e);
            if (!this.members || this.members.length === 0) {
                this.loadImmediateFallbackData();
            }
            this.loadMemberBalancesFromBote2();
            this.updateCategoryCounts();
            this.applyFilters();
        }
    }

    /**
     * Carga las suscripciones push de Firestore
     */
    async loadPushSubscriptions() {
        try {
            const db = window.db || (window.DataService && window.DataService.db);
            if (!db) return [];
            const snap = await db.collection('push_subscriptions').get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.warn('[Socios 2.0] Error cargando suscripciones push:', e);
            return [];
        }
    }

    /**
     * Recupera los balances oficiales consolidados de los socios directamente de Bote 2 (sin volver a calcular)
     */
    loadMemberBalancesFromBote2() {
        this.memberBalances = new Map();

        // 1. Obtener la fuente oficial consolidada de Bote 2
        let memberSummaries = [];
        if (window.BoteApp && typeof window.BoteApp.getSeasonData === 'function') {
            const sd = window.BoteApp.getSeasonData();
            if (sd && Array.isArray(sd.memberSummaries) && sd.memberSummaries.length > 0) {
                memberSummaries = sd.memberSummaries;
            }
        }
        if (memberSummaries.length === 0) {
            const cachedMembers = localStorage.getItem('maulas_bote2_members');
            if (cachedMembers) {
                try {
                    const parsed = JSON.parse(cachedMembers);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        memberSummaries = parsed;
                    }
                } catch (e) { }
            }
        }
        
        if (memberSummaries.length === 0 && window.BOTE_FALLBACK_DATA && window.BOTE_FALLBACK_DATA['2026-2027'] && window.BOTE_FALLBACK_DATA['2026-2027'].memberSummaries) {
            memberSummaries = window.BOTE_FALLBACK_DATA['2026-2027'].memberSummaries;
        }

        const norm = (s) => (s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        // 2. Mapear cada socio con su saldo y estado exacto de Bote 2
        memberSummaries.forEach(s => {
            const mId = parseInt(s.id);
            const saldo = typeof s.saldo === 'number' ? s.saldo : parseFloat(s.saldo || 0);
            const isTes = this.isTesorero(s);
            // Saldo deudor ordinario solo si es negativo (< -0.009) y NO es el Tesorero
            const isDeud = saldo < -0.009 && !isTes;

            const entry = {
                memberId: mId,
                name: s.name,
                saldo: saldo,
                totIn: s.totIn || 0,
                totOut: s.totOut || 0,
                isTesorero: isTes,
                isDeudor: isDeud,
                isActivoBote: !isDeud || isTes,
                status: isTes ? 'tesorero' : (isDeud ? 'deudor' : 'activo'),
                color: isTes ? 'amber' : (isDeud ? 'rose' : 'emerald')
            };

            this.memberBalances.set(mId, entry);
            if (s.name) {
                this.memberBalances.set(`name_${norm(s.name)}`, entry);
            }
        });
    }

    /**
     * Comprueba si el socio es Marcelo Pérez (Tesorero)
     */
    isTesorero(member) {
        if (!member) return false;
        if (window.BoteEngine && window.BoteEngine.isTesorero) {
            return window.BoteEngine.isTesorero(member);
        }
        if (String(member.id) === '14') return true;
        const name = (member.name || '').toLowerCase();
        return name.includes('marcelo');
    }

    /**
     * Comprueba si el socio tiene notificaciones push activas
     */
    hasPushActive(memberId) {
        const mIdStr = String(memberId);
        return this.pushSubscriptions.some(sub => {
            const matchId = String(sub.memberId || '') === mIdStr || sub.id === `member_${mIdStr}`;
            const isGranted = sub.permission === 'granted' || !!sub.fcmToken;
            return matchId && isGranted;
        });
    }

    /**
     * Determina el estado de deuda y bote del socio:
     * - Deudor (< 0): Rojo, derecho a pronóstico semanal, no activo en Bote.
     * - Tesorero (Marcelo): Amarillo, regulariza en repartos.
     * - Solvente (>= 0): Verde, activo en Bote.
     */
    getMemberDebtStatus(member) {
        if (!member) {
            return {
                status: 'activo',
                isTesorero: false,
                isDeudor: false,
                isActivo: true,
                saldo: 0,
                saldoFormatted: '+0,00 €',
                badgeText: '🟢 Al corriente (+0,00 €)',
                badgeTag: '🟢 Activo en Bote',
                subtext: 'Activo con derecho pleno al Bote',
                color: 'emerald',
                badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            };
        }

        const mIdNum = parseInt(member.id);
        const norm = (s) => (s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const bal = this.memberBalances.get(mIdNum) || 
                    this.memberBalances.get(String(member.id)) || 
                    this.memberBalances.get(`name_${norm(member.name)}`);

        const saldo = bal ? bal.saldo : 0;
        const isTes = this.isTesorero(member);
        const isDeud = saldo < -0.009 && !isTes;

        const saldoPrefix = saldo >= 0 ? "+" : "";
        const saldoTxt = `${saldoPrefix}${saldo.toFixed(2).replace(".", ",")} €`;

        if (isTes) {
            return {
                status: "tesorero",
                isTesorero: true,
                isDeudor: false,
                isActivo: true,
                saldo: saldo,
                saldoFormatted: saldoTxt,
                badgeText: `🟡 Tesorero (${saldoTxt})`,
                badgeTag: "🟡 Tesorero",
                subtext: "Regulariza en repartos de temporada",
                color: "amber",
                badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40"
            };
        }

        // Tramos de color fijos:
        // 💰 Tío Gilito: > 50,00 €
        // 🟢 Verde: 15,00 € a 50,00 €
        // 🟡 Amarillo: 5,00 € a 15,00 €
        // 🔴 Rojo: < 5,00 €
        if (saldo > 50) {
            return {
                status: "oro",
                isTesorero: false,
                isDeudor: false,
                isActivo: true,
                saldo: saldo,
                saldoFormatted: saldoTxt,
                badgeText: `💰 Tío Gilito (${saldoTxt})`,
                badgeTag: "💰 Tío Gilito",
                subtext: "Saldo excelente (> 50 €) · Modo Tío Gilito",
                color: "gold",
                badgeClass: "badge-gold-ingot"
            };
        }

        if (saldo >= 15) {
            return {
                status: "activo",
                isTesorero: false,
                isDeudor: false,
                isActivo: true,
                saldo: saldo,
                saldoFormatted: saldoTxt,
                badgeText: `🟢 Al corriente (${saldoTxt})`,
                badgeTag: "🟢 Activo en Bote",
                subtext: "Saldo adecuado (15 € - 50 €)",
                color: "emerald",
                badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
            };
        }

        if (saldo >= 5) {
            return {
                status: "normal",
                isTesorero: false,
                isDeudor: false,
                isActivo: true,
                saldo: saldo,
                saldoFormatted: saldoTxt,
                badgeText: `🟡 Al corriente (${saldoTxt})`,
                badgeTag: "🟡 Activo en Bote",
                subtext: "Saldo regular (5 € - 15 €)",
                color: "amber",
                badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40"
            };
        }

        // Saldo < 5 € (Rojo: saldo bajo si >= 0, o saldo deudor si < 0)
        const isDeudorReal = saldo < -0.009;
        return {
            status: isDeudorReal ? "deudor" : "saldo_bajo",
            isTesorero: false,
            isDeudor: isDeudorReal,
            isActivo: !isDeudorReal,
            saldo: saldo,
            saldoFormatted: saldoTxt,
            badgeText: isDeudorReal
                ? `🔴 Deudor (${saldoTxt}) · No activo`
                : `🔴 Saldo bajo (${saldoTxt})`,
            badgeTag: isDeudorReal ? "🔴 Saldo Deudor" : "🔴 Saldo Bajo",
            subtext: isDeudorReal
                ? "Excluido del Bote hasta regularizar"
                : "Saldo bajo (< 5 €) · Conviene recargar",
            color: "rose",
            badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40"
        };
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
        let conPush = 0;
        const tgMembers = [];
        const pushMembers = [];

        const deudores = [];
        let tesorero = null;
        let solventesCount = 0;

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
                tgMembers.push(m);
            }

            if (this.hasPushActive(m.id)) {
                conPush++;
                pushMembers.push(m);
            }

            const debtInfo = this.getMemberDebtStatus(m);
            if (debtInfo.isTesorero) {
                tesorero = { member: m, info: debtInfo };
            } else if (debtInfo.isDeudor) {
                deudores.push({ member: m, info: debtInfo });
            } else {
                solventesCount++;
            }
        });

        const maxComodinesTemporada = totalSocios * 3;

        // Inyectar en KPI 1: Censo Activo & Estado en Bote
        const elTotal = document.getElementById('kpi-total-socios');
        const elCensoStatus = document.getElementById('kpi-censo-status');
        const elCensoSubtext = document.getElementById('kpi-censo-subtext');
        const elTooltipBreakdown = document.getElementById('tooltip-censo-breakdown');

        const activeBoteCount = solventesCount + (tesorero ? 1 : 0);

        if (elTotal) {
            elTotal.textContent = totalSocios;
        }
        const elTotalComp = document.getElementById('kpi-total-socios-compact');
        if (elTotalComp) {
            elTotalComp.textContent = `${totalSocios} socios`;
        }

        // Resumen móvil
        const elMobTotal = document.getElementById('kpi-mobile-total');
        const elMobCensoSub = document.getElementById('kpi-mobile-censo-sub');
        if (elMobTotal) elMobTotal.textContent = totalSocios;
        if (elMobCensoSub) {
            if (deudores.length > 0) {
                elMobCensoSub.textContent = `${deudores.length} deuda`;
                elMobCensoSub.className = 'text-[9px] text-rose-400 font-bold truncate';
            } else {
                elMobCensoSub.textContent = '100% solv.';
                elMobCensoSub.className = 'text-[9px] text-emerald-400 font-bold truncate';
            }
        }

        if (elCensoStatus) {
            if (deudores.length > 0) {
                elCensoStatus.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
                elCensoStatus.textContent = `${deudores.length} con deuda`;
            } else {
                elCensoStatus.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                elCensoStatus.textContent = '100% Solventes';
            }
        }

        if (elCensoSubtext) {
            if (deudores.length > 0) {
                elCensoSubtext.innerHTML = `<span class="text-rose-400 font-semibold">${deudores.length} no activos en Bote</span> · ${solventesCount} solventes`;
            } else {
                elCensoSubtext.innerHTML = `${solventesCount} solventes · <span class="text-amber-400 font-semibold">1 en regularización</span>`;
            }
        }

        if (elTooltipBreakdown) {
            let breakdownHtml = '';

            // 1. Deudores (Rojo)
            if (deudores.length > 0) {
                breakdownHtml += `
                    <div class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30">
                        <div class="font-bold text-rose-400 flex items-center justify-between text-xs mb-1">
                            <span>🔴 Socios con Saldo Deudor (${deudores.length}):</span>
                            <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded">No Activos en Bote</span>
                        </div>
                        <div class="space-y-1 mt-1 text-slate-300 text-[11px] font-mono">
                            ${deudores.map(d => `
                                <div class="flex items-center justify-between">
                                    <span>${d.member.name} (#${d.member.id})</span>
                                    <strong class="text-rose-400 font-bold">${d.info.saldoFormatted}</strong>
                                </div>
                            `).join('')}
                        </div>
                        <p class="text-[10px] text-rose-300/90 mt-1.5 leading-snug">
                            * Conservan derecho a pronóstico semanal, pero quedan excluidos de participar en el bote y repartos hasta saldo &ge; 0.
                        </p>
                    </div>
                `;
            } else {
                breakdownHtml += `
                    <div class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-1.5">
                        <span>✅</span>
                        <span>Ningún socio ordinario mantiene deudas con el Bote.</span>
                    </div>
                `;
            }

            // 2. Tesorero Marcelo Pérez (Amarillo)
            if (tesorero) {
                breakdownHtml += `
                    <div class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 mt-2">
                        <div class="font-bold text-amber-400 flex items-center justify-between text-xs mb-1">
                            <span>🟡 Tesorero: ${tesorero.member.name} (#${tesorero.member.id})</span>
                            <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded">Régimen Especial</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] font-mono text-slate-300 mt-1">
                            <span>Saldo actual en Bote:</span>
                            <strong class="text-amber-400 font-bold">${tesorero.info.saldoFormatted}</strong>
                        </div>
                        <p class="text-[10px] text-amber-300/90 mt-1 leading-snug">
                            Único socio con saldo pendiente temporal (${tesorero.info.saldoFormatted}). Regulariza su situación de forma planificada al realizar los repartos a lo largo de la temporada.
                        </p>
                    </div>
                `;
            }

            // 3. Solventes (Verde)
            breakdownHtml += `
                <div class="flex items-center justify-between text-slate-300 text-[11px] pt-2 border-t border-slate-700/60 mt-2">
                    <span class="text-emerald-400 font-semibold">🟢 Socios solventes al corriente:</span>
                    <strong class="text-emerald-300 font-bold font-mono">${solventesCount} de ${totalSocios}</strong>
                </div>
            `;

            elTooltipBreakdown.innerHTML = breakdownHtml;
        }

        // Inyectar en KPI 2 & 3: Dados
        const elActivos = document.getElementById('kpi-dados-activos');
        const elUsados = document.getElementById('kpi-dados-usados');
        if (elActivos) elActivos.textContent = dadosActivosHoy;
        if (elUsados) elUsados.textContent = `${totalDadosUsados} / ${maxComodinesTemporada}`;

        const elActivosComp = document.getElementById('kpi-dados-activos-compact');
        if (elActivosComp) elActivosComp.textContent = `${dadosActivosHoy} hoy`;
        const elUsadosComp = document.getElementById('kpi-dados-usados-compact');
        if (elUsadosComp) elUsadosComp.textContent = `${totalDadosUsados} usadas`;

        // Resumen móvil dados
        const elMobDadosActivos = document.getElementById('kpi-mobile-dados-activos');
        const elMobDadosUsados = document.getElementById('kpi-mobile-dados-usados');
        if (elMobDadosActivos) elMobDadosActivos.textContent = dadosActivosHoy;
        if (elMobDadosUsados) elMobDadosUsados.textContent = `${totalDadosUsados} / ${maxComodinesTemporada}`;

        // Inyectar en KPI 4: Conectividad (Telegram + Push)
        const elTg = document.getElementById('kpi-telegram-vinculados');
        const elPush = document.getElementById('kpi-push-vinculados');
        const elBadgeConectividad = document.getElementById('kpi-conectividad-badge');

        if (elTg) elTg.textContent = `${conTelegram} / ${totalSocios}`;
        if (elPush) elPush.textContent = `${conPush} / ${totalSocios}`;
        if (elBadgeConectividad) {
            elBadgeConectividad.innerHTML = `🟢 ${conPush} Push · ${conTelegram} TG`;
        }
        const elConectComp = document.getElementById('kpi-conectividad-compact');
        if (elConectComp) {
            elConectComp.textContent = `${conPush} Push · ${conTelegram} TG`;
        }

        // Resumen móvil conectividad
        const elMobConect = document.getElementById('kpi-mobile-conectividad');
        if (elMobConect) {
            elMobConect.textContent = `${conTelegram} TG · ${conPush} Push`;
        }

        // Inyectar Desglose de Conectividad (Telegram + Push) en el desplegable
        const elDesglose = document.getElementById('conectividad-desglose-content');
        if (elDesglose) {
            // Ordenar por ID numérico ascendente
            tgMembers.sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
            pushMembers.sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));

            let desgloseHtml = `
                <!-- 1. Telegram -->
                <div>
                    <div class="flex items-center justify-between text-xs font-bold text-sky-400 mb-1.5 pb-1 border-b border-sky-500/20">
                        <span class="flex items-center gap-1.5">
                            <span>💬</span>
                            <span>Comunidad Telegram (${tgMembers.length})</span>
                        </span>
                        <span class="text-[10px] text-sky-300/80 font-normal">Canal & Bot</span>
                    </div>
                    <div class="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-1 custom-scroll">
                        ${tgMembers.length > 0 ? tgMembers.map(m => {
                            const nick = m.tgNick.startsWith('@') ? m.tgNick : `@${m.tgNick}`;
                            return `
                                <div class="flex items-center justify-between p-1.5 rounded-lg bg-sky-950/40 border border-sky-500/20 text-slate-200">
                                    <div class="flex items-center gap-1.5 truncate">
                                        <span class="w-5 h-5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-bold flex items-center justify-center shrink-0">#${m.id}</span>
                                        <span class="font-semibold truncate">${m.name}</span>
                                    </div>
                                    <span class="text-[10px] text-sky-400 font-mono shrink-0">${nick}</span>
                                </div>
                            `;
                        }).join('') : '<div class="text-slate-500 italic py-1 text-center">Sin socios en Telegram</div>'}
                    </div>
                </div>

                <!-- 2. Push PWA -->
                <div class="pt-2 border-t border-slate-800/80">
                    <div class="flex items-center justify-between text-xs font-bold text-amber-400 mb-1.5 pb-1 border-b border-amber-500/20">
                        <span class="flex items-center gap-1.5">
                            <span>🔔</span>
                            <span>Notificaciones Push PWA (${pushMembers.length})</span>
                        </span>
                        <span class="text-[10px] text-amber-300/80 font-normal">Móvil Activo</span>
                    </div>
                    <div class="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-1 custom-scroll">
                        ${pushMembers.length > 0 ? pushMembers.map(m => {
                            return `
                                <div class="flex items-center justify-between p-1.5 rounded-lg bg-amber-950/40 border border-amber-500/20 text-slate-200">
                                    <div class="flex items-center gap-1.5 truncate">
                                        <span class="w-5 h-5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0">#${m.id}</span>
                                        <span class="font-semibold truncate">${m.name}</span>
                                    </div>
                                    <span class="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">✓ Activa</span>
                                </div>
                            `;
                        }).join('') : '<div class="text-slate-500 italic py-1 text-center">Sin suscripciones push registradas</div>'}
                    </div>
                </div>
            `;
            elDesglose.innerHTML = desgloseHtml;
        }

        // Contadores en las píldoras de filtro
        this.updatePillCounters();
    }

    updatePillCounters() {
        const todayStr = new Date().toISOString().split('T')[0];
        let cAll = this.members.length;
        let cActive = 0;
        let cExhausted = 0;
        let cTg = 0;
        let cPush = 0;
        let cDebt = 0;

        this.members.forEach(m => {
            const uses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;
            if (uses >= 3) cExhausted++;
            if (m.diceEnabled && m.diceStartDate && m.diceEndDate && todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && uses < 3) {
                cActive++;
            }
            if (m.tgNick && m.tgNick.trim() !== '') cTg++;
            if (this.hasPushActive(m.id)) cPush++;
            
            const debtInfo = this.getMemberDebtStatus(m);
            if (debtInfo.isDeudor || debtInfo.isTesorero) {
                cDebt++;
            }
        });

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('count-all', cAll);
        setTxt('count-dice-active', cActive);
        setTxt('count-dice-exhausted', cExhausted);
        setTxt('count-telegram', cTg);
        setTxt('count-push', cPush);
        setTxt('count-debt', cDebt);

        // Actualizar opciones del desplegable en móvil
        const mobSelect = document.getElementById('mobile-filter-select');
        if (mobSelect) {
            const optAll = mobSelect.querySelector('option[value="all"]');
            if (optAll) optAll.textContent = `Todos (${cAll})`;
            const optActive = mobSelect.querySelector('option[value="dice_active"]');
            if (optActive) optActive.textContent = `🎲 Dado Activo (${cActive})`;
            const optExhausted = mobSelect.querySelector('option[value="dice_exhausted"]');
            if (optExhausted) optExhausted.textContent = `⚠️ Dado Agotado (${cExhausted})`;
            const optTg = mobSelect.querySelector('option[value="telegram"]');
            if (optTg) optTg.textContent = `💬 Con Telegram (${cTg})`;
            const optPush = mobSelect.querySelector('option[value="push"]');
            if (optPush) optPush.textContent = `🔔 Con Push (${cPush})`;
            const optDebt = mobSelect.querySelector('option[value="debt"]');
            if (optDebt) optDebt.textContent = `🔴 Saldo Deudor (${cDebt})`;
        }
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
            } else if (this.currentCategory === 'push') {
                if (!this.hasPushActive(m.id)) return false;
            } else if (this.currentCategory === 'debt') {
                const debtInfo = this.getMemberDebtStatus(m);
                if (!debtInfo.isDeudor && !debtInfo.isTesorero) return false;
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
            } else if (this.sortColumn === 'saldo') {
                valA = this.getMemberDebtStatus(a).saldo;
                valB = this.getMemberDebtStatus(b).saldo;
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

        const mobSelect = document.getElementById('mobile-filter-select');
        if (mobSelect && mobSelect.value !== cat) {
            mobSelect.value = cat;
        }

        this.applyFilters();
    }

    setViewMode(mode, save = true) {
        this.viewMode = mode;
        if (save) localStorage.setItem('maulas_socios_view', mode);

        const containerGrid = document.getElementById('members-grid-container');
        const containerTable = document.getElementById('members-table-container');

        const activeDesktop = 'view-btn-table px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-black transition flex items-center gap-2 bg-amber-500 text-slate-950 shadow-md';
        const inactiveDesktop = 'view-btn-table px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800/60';

        const activeMobile = 'view-btn-table px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 bg-amber-500 text-slate-950 shadow-md';
        const inactiveMobile = 'view-btn-table px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-400 hover:text-white';

        document.querySelectorAll('[data-view-btn="table"]').forEach(btn => {
            const isMob = btn.closest('.md\\:hidden') !== null;
            btn.className = (mode === 'table')
                ? (isMob ? activeMobile : activeDesktop)
                : (isMob ? inactiveMobile : inactiveDesktop);
        });

        document.querySelectorAll('[data-view-btn="grid"]').forEach(btn => {
            const isMob = btn.closest('.md\\:hidden') !== null;
            btn.className = (mode === 'grid')
                ? (isMob ? activeMobile.replace(/view-btn-table/g, 'view-btn-grid') : activeDesktop.replace(/view-btn-table/g, 'view-btn-grid'))
                : (isMob ? inactiveMobile.replace(/view-btn-table/g, 'view-btn-grid') : inactiveDesktop.replace(/view-btn-table/g, 'view-btn-grid'));
        });

        if (mode === 'grid') {
            if (containerGrid) containerGrid.classList.remove('hidden');
            if (containerTable) containerTable.classList.add('hidden');
        } else {
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
            if (btn) btn.className = 'px-3.5 sm:px-4 py-2 sm:py-2.5 bg-rose-600 hover:bg-rose-700 text-white border border-rose-400 font-extrabold rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-[0_0_22px_rgba(244,63,94,0.6)] animate-pulse';
        } else {
            if (icon) icon.textContent = '➖';
            if (txt) txt.textContent = 'Modo Bajas';
            if (btn) btn.className = 'px-3.5 sm:px-4 py-2 sm:py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 hover:border-rose-400 font-extrabold rounded-xl shadow-[0_0_15px_rgba(244,63,94,0.25)] hover:shadow-[0_0_22px_rgba(244,63,94,0.4)] flex items-center justify-center gap-2 text-xs sm:text-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0';
        }

        this.applyFilters();
    }

    /**
     * Calcula los 3 segmentos del indicador de dado para un socio según el código de 3 colores:
     * - Rojo: Jornadas ya jugadas con dado (pronóstico con isDice === true y jornada ya iniciada/disputada).
     * - Amarillo: Jornadas afectadas por dado que aún no se han jugado (rango activo/programado sin pronóstico previo).
     * - Verde: Jornadas disponibles (comodines libres, sin texto debajo).
     * @param {Object} m - Socio
     * @returns {Array<{ status: 'red'|'yellow'|'green', jNum: number|null }>}
     */
    getMemberDiceSegments(m) {
        const segments = [];
        const mStr = String(m.id);

        // 1. Identificar jornadas con pronóstico de dado ya registrado
        const diceForecasts = (this.pronosticos || []).filter(p => {
            const pMid = String(p.mId !== undefined && p.mId !== null ? p.mId : p.memberId || '');
            return pMid === mStr && p.isDice === true;
        });

        // Para cada pronóstico de dado, buscar la jornada asociada y verificar si YA SE HA JUGADO
        const playedDiceJornadas = [];
        const pendingDiceJornadas = [];

        diceForecasts.forEach(p => {
            const pJid = String(p.jId !== undefined && p.jId !== null ? p.jId : p.jornadaId || '');
            const j = (this.jornadas || []).find(item => String(item.id) === pJid);
            const jNum = j && j.number !== undefined ? Number(j.number) : null;

            // Comprobar si la jornada ya ha entrado en juego / disputado
            const hasStarted = j && Array.isArray(j.matches) && j.matches.some(match => {
                if (!match || !match.result) return false;
                const r = String(match.result).trim();
                return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
            });

            if (hasStarted) {
                // Jornada realmente jugada -> ROJO
                playedDiceJornadas.push({ jNum, jornada: j });
            } else {
                // Pronóstico registrado pero jornada aún sin jugar -> AMARILLO
                pendingDiceJornadas.push({ jNum, jornada: j });
            }
        });

        // Ordenar jornadas por número
        playedDiceJornadas.sort((a, b) => (a.jNum || 0) - (b.jNum || 0));
        pendingDiceJornadas.sort((a, b) => (a.jNum || 0) - (b.jNum || 0));

        // Añadir a segmentos los ya jugados en ROJO (máximo 3)
        playedDiceJornadas.slice(0, 3).forEach(item => {
            segments.push({
                status: 'red',
                jNum: item.jNum
            });
        });

        // Añadir a segmentos los que tienen pronóstico de dado pero aún no se han jugado en AMARILLO (hasta 3)
        pendingDiceJornadas.forEach(item => {
            if (segments.length < 3) {
                segments.push({
                    status: 'yellow',
                    jNum: item.jNum
                });
            }
        });

        // 2. Si aún quedan huecos (hasta 3) y el dado está configurado (diceEnabled + fechas):
        // Identificar jornadas afectadas por el rango que aún NO se han jugado ni tienen pronóstico del socio
        if (segments.length < 3 && m.diceEnabled && m.diceStartDate && m.diceEndDate) {
            const sortedJornadas = [...(this.jornadas || [])]
                .filter(j => j && j.active !== false)
                .sort((a, b) => (a.number || 0) - (b.number || 0));

            for (const j of sortedJornadas) {
                if (segments.length >= 3) break;

                // Comprobar si ya tiene pronóstico
                const hasForecast = (this.pronosticos || []).some(p => {
                    const pJid = String(p.jId !== undefined && p.jId !== null ? p.jId : p.jornadaId || '');
                    const pMid = String(p.mId !== undefined && p.mId !== null ? p.mId : p.memberId || '');
                    if (pJid === String(j.id) && pMid === mStr) {
                        return p.selection && Array.isArray(p.selection) && p.selection.some(s => s !== null && s !== '-');
                    }
                    return false;
                });
                if (hasForecast) continue;

                // Verificar si la fecha de la jornada cae en el rango del dado
                const jDate = typeof AppUtils !== 'undefined' ? AppUtils.parseDate(j.date) : new Date(j.date);
                const deadline = typeof AppUtils !== 'undefined' ? AppUtils.calculateDeadline(j.date) : null;

                const inRange = (window.DiceService && typeof window.DiceService.isDateInRange === 'function')
                    ? (window.DiceService.isDateInRange(jDate, m.diceStartDate, m.diceEndDate) || (deadline && window.DiceService.isDateInRange(deadline, m.diceStartDate, m.diceEndDate)))
                    : false;

                if (!inRange) continue;

                // Comprobar si ya se jugó / tiene resultados
                const hasStarted = Array.isArray(j.matches) && j.matches.some(match => {
                    if (!match || !match.result) return false;
                    const r = String(match.result).trim();
                    return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
                });

                // Si no se ha jugado, es una jornada afectada pendiente -> AMARILLO
                if (!hasStarted) {
                    segments.push({
                        status: 'yellow',
                        jNum: j.number !== undefined ? Number(j.number) : null
                    });
                }
            }
        }

        // 3. Rellenar los huecos restantes hasta 3 en VERDE (disponibles)
        while (segments.length < 3) {
            segments.push({
                status: 'green',
                jNum: null
            });
        }

        return segments;
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
            const debtStatus = this.getMemberDebtStatus(m);
            const pushActive = this.hasPushActive(m.id);

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

            // Segmentos del dado (3 casillas con código de 3 colores y etiqueta de jornada afectada debajo)
            const diceSegments = this.getMemberDiceSegments(m);
            const segmentsHtml = diceSegments.map(seg => {
                let barClass = '';
                let labelClass = '';
                let labelText = '';

                if (seg.status === 'red') {
                    barClass = 'bg-rose-500 shadow-sm';
                    labelText = seg.jNum ? `J${seg.jNum}` : 'Usada';
                    labelClass = 'text-rose-400 font-mono font-bold';
                } else if (seg.status === 'yellow') {
                    barClass = 'bg-amber-400 shadow-sm animate-pulse';
                    labelText = seg.jNum ? `J${seg.jNum}` : 'Pend.';
                    labelClass = 'text-amber-400 font-mono font-bold';
                } else {
                    barClass = 'bg-emerald-500 shadow-sm';
                    labelText = '';
                    labelClass = 'text-transparent select-none';
                }

                return `
                    <div class="flex-1 flex flex-col items-center">
                        <div class="h-2 w-full rounded-full ${barClass}"></div>
                        <span class="text-[10px] min-h-[14px] leading-tight mt-1 ${labelClass}">${labelText}</span>
                    </div>
                `;
            }).join('');

            const redCount = diceSegments.filter(s => s.status === 'red').length;
            const yellowCount = diceSegments.filter(s => s.status === 'yellow').length;
            let summaryCounterText = `${redCount} de 3 jornadas consumidas`;
            if (yellowCount > 0) {
                summaryCounterText += ` (${yellowCount} prog.)`;
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
                <div class="glass-panel member-card p-4 sm:p-5 flex flex-col justify-between border-amber-500/40 bg-slate-950/80">
                    <div>
                        <!-- Fila Superior: Avatar + Nº Socio -->
                        <div class="flex items-start justify-between gap-3 mb-3">
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

                        <!-- Estado en Bote (Solvencia / Deuda / Tesorería) -->
                        <div class="mb-3.5 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
                            <div class="flex items-center justify-between gap-2">
                                <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1 ${debtStatus.badgeClass}">
                                    ${debtStatus.badgeText}
                                </span>
                            </div>
                            <div class="text-[10px] text-slate-400 mt-1 pl-0.5">
                                ${debtStatus.subtext}
                            </div>
                        </div>

                        <!-- Canales de Conectividad Oficial (Telegram + Push) -->
                        <div class="space-y-2 text-xs text-slate-400 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 font-mono">
                            <div class="flex items-center gap-2 truncate" title="${m.email}">
                                <span class="text-slate-500">✉️</span>
                                <a href="mailto:${m.email}" class="hover:text-amber-400 truncate text-slate-300 text-[11px]">${m.email}</a>
                            </div>
                            <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60">
                                <div class="flex items-center gap-1 truncate">
                                    <span class="text-slate-500">💬</span>
                                    ${m.tgNick ? `
                                        <a href="https://t.me/${m.tgNick}" target="_blank" rel="noopener" class="text-sky-400 hover:underline flex items-center gap-1 text-[11px]">
                                            <span>@${m.tgNick}</span>
                                            <span class="text-[9px]">↗</span>
                                        </a>
                                    ` : `
                                        <span class="text-slate-600 text-[11px] italic">Sin TG</span>
                                    `}
                                </div>
                                <div class="flex items-center gap-1">
                                    ${pushActive ? `
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1" title="Notificaciones Push PWA activadas en su dispositivo">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                            Push ON
                                        </span>
                                    ` : `
                                        <span class="px-2 py-0.5 rounded-full text-[10px] text-slate-500 bg-slate-900 border border-slate-800" title="Push inactivo o no autorizado en su navegador">
                                            Push OFF
                                        </span>
                                    `}
                                </div>
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
                                ${summaryCounterText}
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
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-500">No se encontraron socios.</td></tr>`;
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        tbody.innerHTML = this.filteredMembers.map(m => {
            const diceUses = window.DiceService ? window.DiceService.getDiceUsageCount(m.id, this.pronosticos) : 0;
            const isExhausted = diceUses >= 3;
            const isActive = m.diceEnabled && m.diceStartDate && m.diceEndDate && todayStr >= m.diceStartDate && todayStr <= m.diceEndDate && !isExhausted;
            const debtStatus = this.getMemberDebtStatus(m);
            const pushActive = this.hasPushActive(m.id);

            let dateRangeStr = '';
            if (m.diceStartDate && m.diceEndDate) {
                const s = m.diceStartDate.split('-').reverse().slice(0, 2).join('/');
                const e = m.diceEndDate.split('-').reverse().slice(0, 2).join('/');
                dateRangeStr = `${s} - ${e}`;
            }

            let diceBadge = '';
            if (isExhausted) {
                diceBadge = `<span class="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-black bg-rose-500/25 text-rose-300 border border-rose-500/50 inline-flex items-center gap-1.5 shadow-sm">⚠️ Agotado</span>`;
            } else if (isActive) {
                diceBadge = `<span class="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-black bg-amber-500/25 text-amber-300 border border-amber-500/50 inline-flex items-center gap-1.5 animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.25)]">🎲 Activo (${dateRangeStr})</span>`;
            } else if (m.diceEnabled && m.diceStartDate) {
                diceBadge = `<span class="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-bold bg-slate-800 text-slate-200 border border-slate-700 inline-flex items-center gap-1.5">⏳ Prog. (${dateRangeStr})</span>`;
            } else {
                diceBadge = `<span class="px-2 py-0.5 rounded text-xs sm:text-sm font-semibold text-slate-400">⚪ Inactivo</span>`;
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
                        <span class="px-2 py-1 rounded text-[11px] font-bold border inline-flex items-center gap-1 ${debtStatus.badgeClass}">
                            ${debtStatus.badgeText}
                        </span>
                    </td>
                    <td class="py-3 px-4">
                        <div class="flex items-center gap-2">
                            ${m.tgNick ? `
                                <a href="https://t.me/${m.tgNick}" target="_blank" rel="noopener" class="text-sky-400 hover:underline text-[11px] font-mono flex items-center gap-0.5" title="Telegram: @${m.tgNick}">
                                    <span>💬</span>
                                    <span>@${m.tgNick}</span>
                                </a>
                            ` : `
                                <span class="text-slate-600 text-[11px] italic" title="Sin Telegram">💬 —</span>
                            `}
                            <span class="text-slate-700">|</span>
                            ${pushActive ? `
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1" title="Notificaciones Push PWA Activas">
                                    <span>🔔</span>
                                    <span>ON</span>
                                </span>
                            ` : `
                                <span class="px-1.5 py-0.5 rounded text-[10px] text-slate-500 bg-slate-900 border border-slate-800 flex items-center gap-1" title="Notificaciones Push PWA Inactivas">
                                    <span>🔕</span>
                                    <span>OFF</span>
                                </span>
                            `}
                        </div>
                    </td>
                    <td class="py-3 px-4">${diceBadge}</td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-black ${diceUses >= 3 ? 'text-rose-400 bg-rose-500/20 border border-rose-500/40' : 'text-slate-200 bg-slate-800 border border-slate-700'}">
                            ${diceUses} / 3
                        </span>
                    </td>
                    <td class="py-3 px-4 text-right">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * INICIALIZACIÓN DEL CALENDARIO FLATPICKR PARA EL DADO
     */
    initDatePicker() {
        if (typeof flatpickr === 'undefined') return;

        const rangeInput = document.getElementById('form-inp-dice-range');
        if (!rangeInput) return;

        try {
            this.fpInstance = flatpickr(rangeInput, {
                mode: 'range',
                locale: 'es',
                dateFormat: 'Y-m-d',
                altInput: true,
                altInputClass: 'w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 hover:border-amber-500 focus:border-amber-500 rounded-xl text-xs sm:text-sm font-bold text-white text-center focus:outline-none cursor-pointer transition shadow-inner select-none',
                altFormat: 'd/m/Y',
                conjunction: ' al ',
                minDate: '2026-01-01',
                theme: 'dark',
                static: false,
                onReady: (selectedDates, dateStr, instance) => {
                    if (instance.calendarContainer) {
                        instance.calendarContainer.style.zIndex = '100070';
                    }
                },
                onOpen: (selectedDates, dateStr, instance) => {
                    if (instance.calendarContainer) {
                        instance.calendarContainer.style.zIndex = '100070';
                    }
                },
                onChange: (selectedDates) => {
                    this.handleDatePickerChange(selectedDates);
                }
            });
        } catch (e) {
            console.warn('[Socios 2.0] Error inicializando Flatpickr:', e);
        }
    }

    handleDatePickerChange(selectedDates) {
        const inpStart = document.getElementById('form-inp-dice-start');
        const inpEnd = document.getElementById('form-inp-dice-end');
        const badge = document.getElementById('form-dice-duration-badge');

        if (!selectedDates || selectedDates.length === 0) {
            if (inpStart) inpStart.value = '';
            if (inpEnd) inpEnd.value = '';
            if (badge) {
                badge.classList.add('hidden');
                badge.textContent = '';
            }
            return;
        }

        const formatIso = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const sStr = formatIso(selectedDates[0]);
        if (inpStart) inpStart.value = sStr;

        if (selectedDates.length === 2) {
            const eStr = formatIso(selectedDates[1]);
            if (inpEnd) inpEnd.value = eStr;

            // Calcular diferencia de días
            const diffTime = Math.abs(selectedDates[1] - selectedDates[0]);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            if (badge) {
                badge.classList.remove('hidden');
                badge.textContent = `📅 ${diffDays} día${diffDays > 1 ? 's' : ''}`;
            }
        } else {
            if (inpEnd) inpEnd.value = sStr;
            if (badge) {
                badge.classList.remove('hidden');
                badge.textContent = '📅 1 día';
            }
        }
    }

    applyDatePreset(preset) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let startDate = new Date(today);
        let endDate = new Date(today);

        if (preset === 'weekend') {
            const dayOfWeek = today.getDay(); // 0: Dom, 1: Lun, ..., 5: Vie, 6: Sab
            if (dayOfWeek === 5) {
                // Viernes
                startDate = new Date(today);
                endDate = new Date(today);
                endDate.setDate(today.getDate() + 2);
            } else if (dayOfWeek === 6) {
                // Sábado
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 1);
                endDate = new Date(today);
                endDate.setDate(today.getDate() + 1);
            } else if (dayOfWeek === 0) {
                // Domingo
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 2);
                endDate = new Date(today);
            } else {
                // Lunes a Jueves -> Próximo viernes
                const daysUntilFriday = 5 - dayOfWeek;
                startDate.setDate(today.getDate() + daysUntilFriday);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 2);
            }
        } else if (preset === 'week') {
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 7);
        } else if (preset === 'fortnight') {
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 14);
        } else if (preset === 'month') {
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 30);
        }

        if (this.fpInstance) {
            this.fpInstance.setDate([startDate, endDate], true);
        } else {
            this.handleDatePickerChange([startDate, endDate]);
        }
    }

    clearDiceDates() {
        if (this.fpInstance) {
            this.fpInstance.clear();
        }
        const inpStart = document.getElementById('form-inp-dice-start');
        const inpEnd = document.getElementById('form-inp-dice-end');
        const badge = document.getElementById('form-dice-duration-badge');
        if (inpStart) inpStart.value = '';
        if (inpEnd) inpEnd.value = '';
        if (badge) {
            badge.classList.add('hidden');
            badge.textContent = '';
        }
    }

    openDatePicker() {
        if (this.fpInstance) {
            this.fpInstance.open();
        }
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
            }
            if (inpDiceEnd) {
                inpDiceEnd.value = member.diceEndDate || '';
            }

            // Sincronizar con calendario Flatpickr
            if (member.diceStartDate && member.diceEndDate && this.fpInstance) {
                try {
                    this.fpInstance.setDate([member.diceStartDate, member.diceEndDate], true);
                } catch (e) {
                    console.warn('[Socios 2.0] Error estableciendo fechas en picker:', e);
                }
            } else {
                this.clearDiceDates();
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
            if (inpDiceStart) inpDiceStart.value = '';
            if (inpDiceEnd) inpDiceEnd.value = '';
            this.clearDiceDates();
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
        if (this.fpInstance) {
            this.fpInstance.close();
        }
    }

    toggleDiceFields() {
        const chk = document.getElementById('form-inp-dice-enabled');
        const container = document.getElementById('form-dice-dates');
        if (chk && container) {
            const active = chk.checked && !chk.disabled;
            container.style.opacity = active ? '1' : '0.4';
            container.style.pointerEvents = active ? 'auto' : 'none';

            if (this.fpInstance && this.fpInstance.altInput) {
                if (active) {
                    this.fpInstance.altInput.removeAttribute('disabled');
                } else {
                    this.fpInstance.altInput.setAttribute('disabled', 'disabled');
                }
            }
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

// Cerrar dropdown de navegación al hacer clic fuera
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('nav-section-dropdown');
    const wrap = document.getElementById('nav-section-dropdown-wrap');
    if (dropdown && wrap && !wrap.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});
