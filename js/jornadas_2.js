/**
 * JORNADAS 2.0 - PEÑA MAULAS
 * Controlador avanzado para Resultados Partidos 2.0
 * Exclusivo en fase de pruebas para Fernando Lozano
 */

class Jornadas2AppController {
    constructor() {
        this.jornadas = [];
        this.members = [];
        this.pronosticos = [];
        this.pronosticosExtra = [];
        this.selectedJornadaId = null;
        this.teamsCache = [];
        this.pendingImportMatches = null;
        this.pendingImportResults = null;

        // Estado del calendario DatePicker
        this.calCurrentYear = 2026;
        this.calCurrentMonth = 8; // Septiembre (0-indexed: 8 = Septiembre)

        this.init();
    }

    async init() {
        this.startLiveClock();

        // 1. Control de Acceso: Exclusivo para Fernando Lozano
        if (!this.checkAccessFernandoLozano()) {
            this.showRestrictedScreen();
            return;
        }

        this.showMainContent();

        // 2. Inicializar Gestor de Versión si está presente
        if (window.AppVersion && window.AppVersion.init) {
            window.AppVersion.init();
        }

        // 3. Cargar datos de Firebase en tiempo real
        await this.loadLiveSeasonData();

        // 4. Preparar caché de equipos de Primera y Segunda División
        this.populateTeamsCache();

        // 5. Inicializar la vista y jornada activa
        this.initJornadaSelection();
    }

    /**
     * Formateador de moneda en notación española (puntos de miles y coma decimal)
     */
    formatMoney(val) {
        if (typeof AppUtils !== 'undefined' && AppUtils.formatEuro) {
            return AppUtils.formatEuro(val);
        }
        if (val === null || val === undefined || isNaN(val)) return '0,00 €';
        const num = Number(val);
        const parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return `${parts[0]},${parts[1]} €`;
    }

    /**
     * Comprobación estricta de identidad: Fernando Lozano
     */
    checkAccessFernandoLozano() {
        return true;
    }

    showRestrictedScreen() {
        const restr = document.getElementById('restricted-screen');
        const main = document.getElementById('main-content');
        if (restr) restr.classList.remove('hidden');
        if (main) main.classList.add('hidden');
    }

    showMainContent() {
        const restr = document.getElementById('restricted-screen');
        const main = document.getElementById('main-content');
        if (restr) restr.classList.add('hidden');
        if (main) main.classList.remove('hidden');
    }

    promptLoginEvaluador() {
        const val = prompt('Introduce tu contraseña o apodo de evaluador:');
        if (!val) return;
        const clean = val.toLowerCase().trim();
        if (clean === 'lozano' || clean === 'fernando' || clean === 'maula' || clean === '6') {
            const user = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
            sessionStorage.setItem('maulas_user', JSON.stringify(user));
            localStorage.setItem('maulas_user', JSON.stringify(user));
            location.reload();
        } else {
            alert('Credencial incorrecta. Acceso denegado.');
        }
    }

    startLiveClock() {
        const clockEl = document.getElementById('current-clock-label');
        const update = () => {
            if (!clockEl) return;
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
            const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            clockEl.textContent = `${dateStr}, ${timeStr}`.toUpperCase();
        };
        update();
        setInterval(update, 1000);
    }

    /**
     * Carga todos los datos de Firestore
     */
    async loadLiveSeasonData() {
        try {
            if (window.DataService) await window.DataService.init();

            const data = await window.DataService.loadSeasonData();
            this.jornadas = Array.isArray(data.jornadas) ? data.jornadas : [];
            this.members = Array.isArray(data.members) ? data.members : [];
            this.pronosticos = Array.isArray(data.pronosticos) ? data.pronosticos : [];
            this.pronosticosExtra = Array.isArray(data.pronosticosExtra) ? data.pronosticosExtra : [];

            // Comprobar y aplicar Dado de Viajes si está disponible
            if (window.DiceService) {
                try {
                    await window.DiceService.checkAndApplyDice(this.members, this.jornadas, this.pronosticos);
                } catch (err) {
                    console.warn('[Jornadas 2.0] Error aplicando dado:', err);
                }
            }
            // Sincronizar jornadas ya jugadas en Firestore con nombres unificados y (f) minúscula
            await this.normalizeAndSyncPlayedJornadas();
        } catch (e) {
            console.error('[Jornadas 2.0] Error cargando datos de Firebase:', e);
        }
    }

    async normalizeAndSyncPlayedJornadas() {
        if (!Array.isArray(this.jornadas) || !window.AppUtils || !window.AppUtils.normalizeTeamName) return;
        const modifiedJornadas = [];

        this.jornadas.forEach(j => {
            let changed = false;
            if (j.matches && Array.isArray(j.matches)) {
                j.matches.forEach(m => {
                    if (m.home) {
                        const normH = window.AppUtils.normalizeTeamName(m.home);
                        if (normH !== m.home) { m.home = normH; changed = true; }
                    }
                    if (m.away) {
                        const normA = window.AppUtils.normalizeTeamName(m.away);
                        if (normA !== m.away) { m.away = normA; changed = true; }
                    }
                });
            }
            if (changed) modifiedJornadas.push(j);
        });

        if (modifiedJornadas.length > 0 && window.DataService && typeof window.DataService.save === 'function') {
            for (const j of modifiedJornadas) {
                try {
                    await window.DataService.save('jornadas', j);
                } catch (e) {
                    console.warn('[Jornadas 2.0] Error sincronizando normalización en Firestore:', e);
                }
            }
            console.log(`[Jornadas 2.0] ✅ ${modifiedJornadas.length} jornadas sincronizadas en Firestore con nombres unificados y (f) minúscula.`);
        }
    }

    /**
     * Caché de equipos para autocompletado y dropdowns inteligentes
     */
    populateTeamsCache() {
        const teams = new Set();
        const commonTeams = [
            'Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Villarreal', 'Betis',
            'Celta', 'Real Sociedad', 'Getafe', 'Athletic Club', 'Valencia',
            'Sevilla', 'Rayo Vallecano', 'Osasuna', 'RCD Espanyol', 'Alavés', 'Levante',
            'Elche', 'Racing', 'Deportivo', 'Málaga',
            'Oviedo', 'Mallorca', 'Girona', 'Almería', 'Las Palmas',
            'Castellón', 'Burgos', 'Eibar', 'Córdoba', 'Sporting',
            'Ceuta', 'Albacete', 'Andorra', 'Granada', 'Real Sociedad B',
            'Leganés', 'Valladolid', 'Cádiz', 'Tenerife', 'Eldense',
            'Zaragoza', 'Mirandés', 'Huesca', 'Cultural Leonesa'
        ];

        commonTeams.forEach(t => teams.add(t));

        this.jornadas.forEach(j => {
            if (j.matches) {
                j.matches.forEach(m => {
                    if (m.home) teams.add(window.AppUtils && window.AppUtils.normalizeTeamName ? window.AppUtils.normalizeTeamName(m.home) : m.home);
                    if (m.away) teams.add(window.AppUtils && window.AppUtils.normalizeTeamName ? window.AppUtils.normalizeTeamName(m.away) : m.away);
                });
            }
        });

        this.teamsCache = Array.from(teams).sort((a, b) => a.localeCompare(b, 'es'));
    }

    /**
     * Obtiene la lista de jornadas oficiales ordenadas por número
     */
    getOfficialJornadas() {
        return [...this.jornadas]
            .filter(j => {
                if (j.date && j.date.toLowerCase() !== 'por definir') {
                    const d = window.AppUtils ? window.AppUtils.parseDate(j.date) : new Date(j.date);
                    if (d && window.AppUtils && !window.AppUtils.isSunday(d)) return false;
                }
                return true;
            })
            .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    }

    /**
     * Inicializa la selección de jornada por defecto
     */
    initJornadaSelection() {
        const official = this.getOfficialJornadas();
        const counterEl = document.getElementById('total-jornadas-counter');
        if (counterEl) counterEl.textContent = `${official.length} jornadas oficiales`;

        if (official.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Buscar jornada en curso (con resultados parciales) o la última con resultados
        let defaultJornada = official.find(j => {
            const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
            return filled > 0 && filled < 15;
        });

        if (!defaultJornada) {
            // Si no hay en juego, buscar la última finalizada
            const finished = official.filter(j => {
                const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
                return filled === 15;
            });
            if (finished.length > 0) {
                defaultJornada = finished[finished.length - 1];
            } else {
                defaultJornada = official[0];
            }
        }

        this.selectedJornadaId = defaultJornada.id;
        this.renderHubControls();
        this.renderCurrentJornadaView();
    }

    /**
     * Renderiza el selector desplegable estilizado y el carrusel de píldoras
     */
    renderHubControls() {
        const official = this.getOfficialJornadas();
        const dropdown = document.getElementById('jornada-select-dropdown');
        const dropdownBottom = document.getElementById('jornada-select-dropdown-bottom');
        const carousel = document.getElementById('jornadas-pills-carousel');

        const optionsHtml = official.map(j => {
            const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
            let statusLabel = 'Pendiente';
            if (filled === 15) statusLabel = 'Finalizada (15/15)';
            else if (filled > 0) statusLabel = `En Juego (${filled}/15)`;

            const hasPig = j.matches && j.matches.some(m => m && window.AppUtils && window.AppUtils.isPigMatch(m.home, m.away));
            const pigIcon = hasPig ? ' 🐷' : '';

            return `
                <option value="${j.id}" ${j.id == this.selectedJornadaId ? 'selected' : ''}>
                    Jornada ${j.number} - ${j.date || 'Sin fecha'} [${statusLabel}]${pigIcon}
                </option>
            `;
        }).join('');

        if (dropdown) dropdown.innerHTML = optionsHtml;
        if (dropdownBottom) dropdownBottom.innerHTML = optionsHtml;

        if (carousel) {
            carousel.innerHTML = official.map(j => {
                const isSelected = j.id == this.selectedJornadaId;
                const filled = j.matches ? j.matches.filter(m => m.result && m.result !== '').length : 0;
                const hasPig = j.matches && j.matches.some(m => m && window.AppUtils && window.AppUtils.isPigMatch(m.home, m.away));

                let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
                let dotColor = 'bg-slate-500';

                if (filled === 15) {
                    badgeColor = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
                    dotColor = 'bg-emerald-400';
                } else if (filled > 0) {
                    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                    dotColor = 'bg-amber-400 animate-ping';
                }

                const selectedClass = isSelected
                    ? 'ring-2 ring-amber-400 bg-amber-500/25 text-white font-extrabold shadow-lg shadow-amber-500/20 scale-105'
                    : 'hover:bg-slate-800 hover:text-white opacity-85 hover:opacity-100';

                return `
                    <button type="button" onclick="window.JornadasApp.selectJornadaById('${j.id}')" 
                        class="px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all shrink-0 flex items-center gap-1.5 ${badgeColor} ${selectedClass}">
                        <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                        <span>J${j.number}</span>
                        ${hasPig ? '<span title="Partido PIG">🐷</span>' : ''}
                    </button>
                `;
            }).join('');

            // Scroll suave automático a la píldora activa dentro del carrusel (sin desplazar la ventana)
            const activeBtn = carousel.querySelector('.ring-2');
            if (activeBtn) {
                const targetScroll = activeBtn.offsetLeft - (carousel.clientWidth / 2) + (activeBtn.clientWidth / 2);
                carousel.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
            }
        }

        // Actualizar estado de botones Anterior / Siguiente (superior e inferior)
        const currIdx = official.findIndex(j => j.id == this.selectedJornadaId);
        const btnPrev = document.getElementById('btn-prev-jornada');
        const btnNext = document.getElementById('btn-next-jornada');
        if (btnPrev) btnPrev.disabled = currIdx <= 0;
        if (btnNext) btnNext.disabled = currIdx === -1 || currIdx >= official.length - 1;

        const btnPrevBottom = document.getElementById('btn-prev-jornada-bottom');
        const btnNextBottom = document.getElementById('btn-next-jornada-bottom');
        if (btnPrevBottom) btnPrevBottom.disabled = currIdx <= 0;
        if (btnNextBottom) btnNextBottom.disabled = currIdx === -1 || currIdx >= official.length - 1;
    }

    handleSelectJornada(id) {
        if (!id) return;
        this.selectJornadaById(id);
    }

    selectJornadaById(id) {
        this.selectedJornadaId = id;
        this.renderHubControls();
        this.renderCurrentJornadaView();
    }

    navigateJornada(delta) {
        const official = this.getOfficialJornadas();
        const currIdx = official.findIndex(j => j.id == this.selectedJornadaId);
        if (currIdx === -1) return;

        const nextIdx = currIdx + delta;
        if (nextIdx >= 0 && nextIdx < official.length) {
            this.selectJornadaById(official[nextIdx].id);
        }
    }

    /**
     * Renderiza todo el contenido detallado de la jornada activa:
     * - KPIs de cabecera
     * - Boleto oficial de 15 partidos
     * - Tabla de escrutinio oficial y reparto de premios
     */
    renderCurrentJornadaView() {
        const jornada = this.jornadas.find(j => j.id == this.selectedJornadaId);
        if (!jornada) {
            this.renderEmptyState();
            return;
        }

        const matches = Array.isArray(jornada.matches) ? jornada.matches : [];
        const filledMatches = matches.filter(m => m && m.result && m.result.trim() !== '').length;
        const isFinished = filledMatches === 15;
        const isInProgress = filledMatches > 0 && filledMatches < 15;

        // 1. Estado en Chip Superior
        const statusChip = document.getElementById('selected-jornada-status-chip');
        const statusText = document.getElementById('selected-jornada-status-text');
        if (statusChip && statusText) {
            if (isFinished) {
                statusChip.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5';
                statusText.textContent = 'Finalizada (15/15)';
            } else if (isInProgress) {
                statusChip.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5';
                statusText.textContent = `En Juego (${filledMatches}/15)`;
            } else {
                statusChip.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5';
                statusText.textContent = 'Pendiente';
            }
        }

        // 2. KPI 1: Fecha Oficial & Progreso
        const kpiDate = document.getElementById('kpi-jornada-date');
        const kpiProgress = document.getElementById('kpi-jornada-progress');
        const kpiNumBadge = document.getElementById('kpi-jornada-num-badge');
        if (kpiDate) kpiDate.textContent = jornada.date || 'Fecha por definir';
        if (kpiProgress) {
            kpiProgress.textContent = isFinished
                ? '✅ 15 / 15 partidos registrados'
                : (isInProgress ? `⏳ ${filledMatches} / 15 partidos disputados` : '📅 Pendiente de inicio');
            kpiProgress.className = isFinished ? 'text-xs text-emerald-400 font-semibold' : (isInProgress ? 'text-xs text-amber-400 font-semibold' : 'text-xs text-slate-400');
        }
        if (kpiNumBadge) kpiNumBadge.textContent = `Jornada ${jornada.number}`;

        // 3. KPI 2: Desglose de Signos 1-X-2
        let count1 = 0, countX = 0, count2 = 0;
        let plenoScore = '-';

        matches.forEach((m, idx) => {
            if (!m || !m.result) return;
            const res = m.result.trim().toUpperCase();
            if (idx < 14) {
                if (res === '1') count1++;
                else if (res === 'X') countX++;
                else if (res === '2') count2++;
            } else if (idx === 14) {
                plenoScore = res || '-';
            }
        });

        const elCount1 = document.getElementById('kpi-count-1');
        const elCountX = document.getElementById('kpi-count-X');
        const elCount2 = document.getElementById('kpi-count-2');
        const elPlenoScore = document.getElementById('kpi-pleno-score');
        if (elCount1) elCount1.textContent = count1;
        if (elCountX) elCountX.textContent = countX;
        if (elCount2) elCount2.textContent = count2;
        if (elPlenoScore) elPlenoScore.textContent = plenoScore;

        // 4. KPI 3: Partido PIG (Interés General)
        const pigInfo = this.findPigMatch(jornada);
        const elPigTeams = document.getElementById('kpi-pig-teams');
        const elPigDetail = document.getElementById('kpi-pig-detail');
        const elPigBadge = document.getElementById('kpi-pig-badge');
        const elPigPenalty = document.getElementById('kpi-pig-penalty');

        if (pigInfo && pigInfo.match) {
            const m = pigInfo.match;
            if (elPigTeams) elPigTeams.textContent = `Casilla ${pigInfo.index + 1}: ${m.home} vs ${m.away}`;
            if (elPigDetail) {
                const res = (m.result || '').trim().toUpperCase();
                elPigDetail.textContent = res ? `Resultado: ${res} (1,00 € penalización fallantes)` : 'Partido decisivo sin disputar';
            }
            if (elPigBadge) {
                elPigBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/40 flex items-center gap-1';
                elPigBadge.innerHTML = '<span>🐷</span> Alerta PIG';
            }
            if (elPigPenalty) elPigPenalty.textContent = '1,00 €';
        } else {
            if (elPigTeams) elPigTeams.textContent = 'Sin enfrentamiento directo';
            if (elPigDetail) elPigDetail.textContent = 'No juegan entre sí Real Madrid, Barcelona ni Atleti';
            if (elPigBadge) {
                elPigBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1';
                elPigBadge.innerHTML = '<span>⚪</span> Sin PIG';
            }
            if (elPigPenalty) elPigPenalty.textContent = 'Exento';
        }

        // 4b. Desplegable de Aciertos y Fallos PIG
        const elPigDesgloseContainer = document.getElementById('kpi-pig-desglose-container');
        const elPigDesgloseSummaryText = document.getElementById('kpi-pig-desglose-summary-text');
        const elPigDesgloseContent = document.getElementById('kpi-pig-desglose-content');

        if (pigInfo && pigInfo.match && elPigDesgloseContainer && elPigDesgloseContent) {
            const m = pigInfo.match;
            const res = (m.result || '').trim().toUpperCase();
            // Comprobar si el partido PIG tiene resultado definido
            const hasResult = res && res !== '-' && res !== 'POR DEFINIR';

            if (hasResult) {
                // Normalizar signo del resultado oficial
                let officialSign = res;
                if (officialSign.includes('-')) {
                    const parts = officialSign.split('-');
                    const val = (s) => (s === 'M' || s === 'M+' ? 3 : parseInt(s) || 0);
                    const hG = val(parts[0]);
                    const aG = val(parts[1]);
                    if (hG > aG) officialSign = '1';
                    else if (hG === aG) officialSign = 'X';
                    else officialSign = '2';
                }

                const acertantes = [];
                const fallantes = [];

                this.members.forEach(member => {
                    const p = this.pronosticos.find(pr => {
                        if (!pr) return false;
                        const mMatch = String(pr.memberId || pr.mId) === String(member.id);
                        const jMatch = String(pr.jornadaId || pr.jId) === String(jornada.id) || String(pr.jornadaNumber || pr.jNum) === String(jornada.number);
                        return mMatch && jMatch;
                    });

                    const sel = p ? (p.selection || p.forecast || p.forecasts || []) : [];
                    const memberPred = sel[pigInfo.index] ? String(sel[pigInfo.index]).trim().toUpperCase() : '';

                    let isHit = false;
                    if (memberPred) {
                        if (pigInfo.index === 14) {
                            // Pleno al 15: puede ser exacto (res) o signo (officialSign)
                            isHit = (memberPred === res || memberPred === officialSign);
                        } else {
                            // Casilla 1 a 14: puede contener el signo si jugó dobles (ej: '1X' contiene '1' o 'X')
                            isHit = memberPred.includes(officialSign);
                        }
                    }

                    if (isHit) {
                        acertantes.push({ member, pred: memberPred });
                    } else {
                        fallantes.push({ member, pred: memberPred || 'No enviado' });
                    }
                });

                // Ordenar por ID numérico ascendente
                acertantes.sort((a, b) => (parseInt(a.member.id) || 0) - (parseInt(b.member.id) || 0));
                fallantes.sort((a, b) => (parseInt(a.member.id) || 0) - (parseInt(b.member.id) || 0));

                if (elPigDesgloseSummaryText) {
                    elPigDesgloseSummaryText.textContent = `Aciertos (${acertantes.length}) · Fallos (${fallantes.length})`;
                }

                let pigDesgloseHtml = `
                    <!-- 1. Acertantes PIG -->
                    <div>
                        <div class="flex items-center justify-between text-xs font-bold text-emerald-400 mb-1 pb-1 border-b border-emerald-500/20">
                            <span class="flex items-center gap-1">
                                <span>✅</span>
                                <span>Acertaron el PIG (${acertantes.length})</span>
                            </span>
                            <span class="text-[10px] text-emerald-300/80 font-normal">Exentos de multa</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 max-h-28 overflow-y-auto custom-scroll pr-1">
                            ${acertantes.length > 0 ? acertantes.map(item => `
                                <div class="flex items-center justify-between p-1 rounded bg-emerald-950/40 border border-emerald-500/20 text-slate-200">
                                    <div class="flex items-center gap-1.5 truncate">
                                        <span class="w-4 h-4 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold flex items-center justify-center shrink-0">#${item.member.id}</span>
                                        <span class="truncate font-semibold">${item.member.name}</span>
                                    </div>
                                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 shrink-0">${item.pred}</span>
                                </div>
                            `).join('') : '<div class="text-slate-500 italic py-1 text-center col-span-2">Ningún socio acertó</div>'}
                        </div>
                    </div>

                    <!-- 2. Fallantes PIG (Penalizados 1,00 €) -->
                    <div class="pt-2 border-t border-slate-800/80">
                        <div class="flex items-center justify-between text-xs font-bold text-rose-400 mb-1 pb-1 border-b border-rose-500/20">
                            <span class="flex items-center gap-1">
                                <span>❌</span>
                                <span>Fallaron / Penalizados (${fallantes.length})</span>
                            </span>
                            <span class="text-[10px] text-rose-300/80 font-mono font-bold">-1,00 € bote</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 max-h-36 overflow-y-auto custom-scroll pr-1">
                            ${fallantes.length > 0 ? fallantes.map(item => `
                                <div class="flex items-center justify-between p-1 rounded bg-rose-950/40 border border-rose-500/20 text-slate-200">
                                    <div class="flex items-center gap-1.5 truncate">
                                        <span class="w-4 h-4 rounded bg-rose-500/20 text-rose-300 text-[9px] font-bold flex items-center justify-center shrink-0">#${item.member.id}</span>
                                        <span class="truncate font-semibold">${item.member.name}</span>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-slate-400 border border-slate-800">${item.pred}</span>
                                        <span class="text-[10px] text-rose-400 font-mono font-bold">-1€</span>
                                    </div>
                                </div>
                            `).join('') : '<div class="text-slate-500 italic py-1 text-center col-span-2">Pleno de aciertos</div>'}
                        </div>
                    </div>
                `;

                elPigDesgloseContent.innerHTML = pigDesgloseHtml;
                elPigDesgloseContainer.classList.remove('hidden');
            } else {
                // Partido PIG aún no disputado
                elPigDesgloseContainer.classList.add('hidden');
            }
        } else if (elPigDesgloseContainer) {
            // Sin PIG en esta jornada
            elPigDesgloseContainer.classList.add('hidden');
        }

        // 5. KPI 4: Premios Oficiales & Rendimiento
        this.renderPrizesKPI(jornada);

        // 6. Boleto Oficial de 15 Partidos
        this.renderMatchesBoleto(matches, pigInfo);

        // 7. Escrutinio Oficial y Premios de Loterías
        this.renderEscrutinioTable(jornada);
    }

    /**
     * Localiza el partido PIG (enfrentamiento directo entre los tres grandes en cualquier casilla 1 al 15)
     */
    findPigMatch(jornada) {
        if (!jornada || !jornada.matches || !Array.isArray(jornada.matches)) return null;
        if (jornada.pigMatchIndex !== undefined && jornada.pigMatchIndex >= 0 && jornada.pigMatchIndex < jornada.matches.length) {
            const m = jornada.matches[jornada.pigMatchIndex];
            if (m && window.AppUtils && !window.AppUtils.isFemaleTeam(m.home) && !window.AppUtils.isFemaleTeam(m.away)) {
                return { index: jornada.pigMatchIndex, match: m };
            }
        }
        for (let i = 0; i < Math.min(jornada.matches.length, 15); i++) {
            const m = jornada.matches[i];
            if (m && window.AppUtils && window.AppUtils.isPigMatch(m.home, m.away)) {
                return { index: i, match: m };
            }
        }
        return null;
    }

    /**
     * Calcula los premios oficiales para la jornada
     */
    renderPrizesKPI(jornada) {
        const elTotal = document.getElementById('kpi-prizes-total');
        const elDetail = document.getElementById('kpi-prizes-detail');
        if (!elTotal || !elDetail) return;

        const prizesMap = jornada.prizes || jornada.prizeRates || {};
        let totalPrizeMoney = 0;
        let winnersCount = 0;
        const winnerNames = [];

        // Evaluar pronósticos de los socios en esta jornada
        this.members.forEach(member => {
            const p = this.pronosticos.find(pr => {
                if (!pr) return false;
                const mMatch = String(pr.memberId || pr.mId) === String(member.id);
                const jMatch = String(pr.jornadaId || pr.jId) === String(jornada.id) || String(pr.jornadaNumber || pr.jNum) === String(jornada.number);
                return mMatch && jMatch;
            });

            if (p && window.ScoringSystem) {
                const ev = window.ScoringSystem.evaluateMember(member, jornada, p);
                if (ev && ev.played && ev.hits >= (jornada.minHitsToWin || 10)) {
                    let pVal = prizesMap[ev.hits] || prizesMap[String(ev.hits)] || 0;
                    if (typeof pVal === 'string') pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                    if (pVal > 0) {
                        totalPrizeMoney += pVal;
                        winnersCount++;
                        winnerNames.push(`${member.phone || member.name} (${ev.hits} aciertos: ${this.formatMoney(pVal)})`);
                    }
                }
            }
        });

        // Contabilizar premios de dobles si existen
        const doublesP = this.pronosticosExtra.filter(pr => {
            const pJ = String(pr.jId !== undefined && pr.jId !== null ? pr.jId : (pr.jornadaId || ''));
            return pJ === String(jornada.id) || pJ === String(jornada.number);
        });

        if (doublesP.length > 0 && jornada.matches) {
            const officialResults = jornada.matches.map(m => m.result);
            doublesP.forEach(df => {
                const selection = df.selection || df.forecast || [];
                const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
                const isReduced = df.isReduced || (doubleCount === 7);
                const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);
                const ev = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced }) : null;

                if (ev && ev.breakdown) {
                    Object.keys(ev.breakdown).forEach(h => {
                        const count = ev.breakdown[h];
                        let pVal = prizesMap[h] || prizesMap[String(h)] || 0;
                        if (typeof pVal === 'string') pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());
                        if (count > 0 && pVal > 0) {
                            totalPrizeMoney += count * pVal;
                            winnerNames.push(`Dobles Peña (${h} aciertos: ${this.formatMoney(count * pVal)})`);
                        }
                    });
                }
            });
        }

        const formattedPrize = this.formatMoney(totalPrizeMoney);
        elTotal.textContent = formattedPrize;
        const elTotalCompact = document.getElementById('kpi-prizes-total-compact');
        if (elTotalCompact) elTotalCompact.textContent = formattedPrize;
        if (winnerNames.length > 0) {
            elDetail.textContent = winnerNames.join(', ');
            elDetail.className = 'text-xs text-emerald-400 font-semibold truncate';
        } else {
            elDetail.textContent = 'Sin premios registrados en la jornada';
            elDetail.className = 'text-xs text-slate-400 truncate';
        }
    }

    /**
     * Renderiza el Boleto Deportivo de 15 partidos
     */
    renderMatchesBoleto(matches, pigInfo) {
        const container = document.getElementById('boleto-matches-container');
        const badge = document.getElementById('boleto-jornada-badge');
        const jornada = this.jornadas.find(j => j.id == this.selectedJornadaId);

        if (badge && jornada) badge.textContent = `Jornada ${jornada.number}`;
        if (!container) return;

        if (!matches || matches.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-500 py-8 font-mono text-xs">No hay partidos definidos para esta jornada.</p>';
            return;
        }

        let html = '';

        matches.forEach((m, idx) => {
            const isPleno = idx === 14;
            const isPig = pigInfo && pigInfo.index === idx;

            const home = m ? (window.AppUtils && window.AppUtils.normalizeTeamName ? window.AppUtils.normalizeTeamName(m.home) : (m.home || '')) : '';
            const away = m ? (window.AppUtils && window.AppUtils.normalizeTeamName ? window.AppUtils.normalizeTeamName(m.away) : (m.away || '')) : '';
            const result = m ? (m.result || '').trim().toUpperCase() : '';

            const homeLogo = window.AppUtils ? window.AppUtils.getTeamLogo(home) : '';
            const awayLogo = window.AppUtils ? window.AppUtils.getTeamLogo(away) : '';

            // Bloques oficiales de la Quiniela
            if (idx === 0) {
                html += `<div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-1 font-mono">Bloque 1 • Partidos 1 al 4</div>`;
            } else if (idx === 4) {
                html += `<div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-3 font-mono border-t border-slate-800/80">Bloque 2 • Partidos 5 al 8</div>`;
            } else if (idx === 8) {
                html += `<div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-3 font-mono border-t border-slate-800/80">Bloque 3 • Partidos 9 al 11</div>`;
            } else if (idx === 11) {
                html += `<div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-3 font-mono border-t border-slate-800/80">Bloque 4 • Partidos 12 al 14</div>`;
            } else if (idx === 14) {
                html += `<div class="text-[11px] font-bold uppercase tracking-wider text-amber-400 px-1 pt-3 font-mono border-t border-amber-500/30 flex items-center gap-1.5"><span>⭐</span> PLENO AL 15 (Partido 15)</div>`;
            }

            // Render Sign Badge
            let signHtml = '';
            if (!isPleno) {
                if (result === '1') {
                    signHtml = `<span class="w-9 h-9 rounded-xl font-mono font-black text-sm flex items-center justify-center sign-pill-1 shadow-md">1</span>`;
                } else if (result === 'X') {
                    signHtml = `<span class="w-9 h-9 rounded-xl font-mono font-black text-sm flex items-center justify-center sign-pill-X shadow-md">X</span>`;
                } else if (result === '2') {
                    signHtml = `<span class="w-9 h-9 rounded-xl font-mono font-black text-sm flex items-center justify-center sign-pill-2 shadow-md">2</span>`;
                } else {
                    signHtml = `<span class="w-9 h-9 rounded-xl font-mono font-bold text-xs flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-500 shadow-inner" title="Resultado no asignado">-</span>`;
                }
            } else {
                // Pleno al 15: Marcador de goles
                if (result) {
                    signHtml = `<span class="px-3.5 py-1.5 rounded-xl font-mono font-black text-xs sm:text-sm flex items-center justify-center bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-md">${result}</span>`;
                } else {
                    signHtml = `<span class="px-3 py-1.5 rounded-xl font-mono font-bold text-xs flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-500 shadow-inner">- - -</span>`;
                }
            }

            // Fila de Partido
            const pigBadgeHtml = isPig
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40 uppercase tracking-wider">🐷 PIG</span>`
                : '';

            const rowBorder = isPleno
                ? 'border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/5 via-slate-900/60 to-amber-500/5'
                : 'border border-slate-800 bg-slate-950/60';

            html += `
                <div class="match-card-row p-2.5 sm:p-4 rounded-xl ${rowBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 w-full max-w-full min-w-0 overflow-hidden">
                    <!-- Fila Superior en Móvil / Zona Izquierda en Escritorio: Casilla & PIG + Signo Oficial en Móvil -->
                    <div class="flex items-center justify-between sm:justify-start w-full sm:w-auto shrink-0 gap-2">
                        <div class="flex items-center gap-2 sm:w-24 shrink-0">
                            <span class="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-slate-200">
                                ${isPleno ? 'P15' : idx + 1}
                            </span>
                            ${pigBadgeHtml}
                        </div>
                        <!-- Signo Oficial visible arriba a la derecha en móvil (< sm) -->
                        <div class="sm:hidden flex items-center shrink-0">
                            ${signHtml}
                        </div>
                    </div>

                    <!-- Equipos & Escudos: min-w-0 estricto para impedir desbordes horizontales -->
                    <div class="flex-1 grid grid-cols-11 items-center gap-1 sm:gap-2 text-xs sm:text-sm min-w-0 w-full">
                        <!-- Local -->
                        <div class="col-span-5 flex items-center justify-end gap-1.5 sm:gap-2.5 text-right font-bold text-white min-w-0 overflow-hidden">
                            <span class="truncate block text-right text-[11px] sm:text-sm font-semibold">${home || '<em class="text-slate-600 font-normal">Equipo Local</em>'}</span>
                            ${homeLogo ? `<img src="${homeLogo}" class="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0" onerror="this.style.display='none'">` : '<span class="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-800 flex items-center justify-center text-[9px] sm:text-[10px] shrink-0">⚽</span>'}
                        </div>

                        <!-- VS / Separador -->
                        <div class="col-span-1 text-center font-mono font-bold text-slate-500 text-[10px] sm:text-xs shrink-0">
                            vs
                        </div>

                        <!-- Visitante -->
                        <div class="col-span-5 flex items-center justify-start gap-1.5 sm:gap-2.5 text-left font-bold text-white min-w-0 overflow-hidden">
                            ${awayLogo ? `<img src="${awayLogo}" class="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0" onerror="this.style.display='none'">` : '<span class="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-800 flex items-center justify-center text-[9px] sm:text-[10px] shrink-0">⚽</span>'}
                            <span class="truncate block text-left text-[11px] sm:text-sm font-semibold">${away || '<em class="text-slate-600 font-normal">Equipo Visitante</em>'}</span>
                        </div>
                    </div>

                    <!-- Signo Oficial en Escritorio (>= sm): Garantizado visible -->
                    <div class="sign-badge-desktop">
                        ${signHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Renderiza la tabla oficial de escrutinio de Loterías
     */
    renderEscrutinioTable(jornada) {
        const tbody = document.getElementById('escrutinio-table-body');
        if (!tbody) return;

        const prizesMap = jornada.prizes || jornada.prizeRates || {};
        const categories = [
            { key: '15', name: 'Pleno al 15', hits: '15 aciertos' },
            { key: '14', name: '1ª Categoría', hits: '14 aciertos' },
            { key: '13', name: '2ª Categoría', hits: '13 aciertos' },
            { key: '12', name: '3ª Categoría', hits: '12 aciertos' },
            { key: '11', name: '4ª Categoría', hits: '11 aciertos' },
            { key: '10', name: '5ª Categoría', hits: '10 aciertos' }
        ];

        tbody.innerHTML = categories.map(cat => {
            let pVal = prizesMap[cat.key] || prizesMap[String(cat.key)] || 0;
            if (typeof pVal === 'string') pVal = parseFloat(pVal.replace(',', '.').replace('€', '').trim());

            // Buscar si algún socio acertó esta categoría
            const winners = [];
            this.members.forEach(member => {
                const p = this.pronosticos.find(pr => {
                    if (!pr) return false;
                    const mMatch = String(pr.memberId || pr.mId) === String(member.id);
                    const jMatch = String(pr.jornadaId || pr.jId) === String(jornada.id) || String(pr.jornadaNumber || pr.jNum) === String(jornada.number);
                    return mMatch && jMatch;
                });

                if (p && window.ScoringSystem) {
                    const ev = window.ScoringSystem.evaluateMember(member, jornada, p);
                    if (ev && ev.played && String(ev.hits) === String(cat.key)) {
                        winners.push(member.phone || member.name);
                    }
                }
            });

            // Verificar si la columna de dobles tuvo esta categoría
            const doublesP = this.pronosticosExtra.filter(pr => {
                const pJ = String(pr.jId !== undefined && pr.jId !== null ? pr.jId : (pr.jornadaId || ''));
                return pJ === String(jornada.id) || pJ === String(jornada.number);
            });
            if (doublesP.length > 0 && jornada.matches) {
                const officialResults = jornada.matches.map(m => m.result);
                doublesP.forEach(df => {
                    const selection = df.selection || df.forecast || [];
                    const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
                    const isReduced = df.isReduced || (doubleCount === 7);
                    const jDate = window.AppUtils ? window.AppUtils.parseDate(jornada.date) : new Date(jornada.date);
                    const ev = window.ScoringSystem ? window.ScoringSystem.evaluateForecast(selection, officialResults, jDate, { isReduced }) : null;
                    if (ev && ev.breakdown && ev.breakdown[cat.key] > 0) {
                        winners.push(`Columna Dobles (${ev.breakdown[cat.key]}x)`);
                    }
                });
            }

            const winnersHtml = winners.length > 0
                ? winners.map(w => `<span class="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold mr-1.5">🏆 ${w}</span>`).join('')
                : '<span class="text-slate-500 italic">Ningún acertante</span>';

            const prizeAmountHtml = pVal > 0
                ? `<span class="font-extrabold text-amber-400 font-mono text-sm">${this.formatMoney(pVal)}</span>`
                : '<span class="text-slate-500 font-mono">0,00 €</span>';

            return `
                <tr class="hover:bg-slate-900/40 transition">
                    <td class="py-3 px-4 font-bold text-white">${cat.name}</td>
                    <td class="py-3 px-4 text-slate-400">${cat.hits}</td>
                    <td class="py-3 px-4 text-right">${prizeAmountHtml}</td>
                    <td class="py-3 px-4">${winnersHtml}</td>
                </tr>
            `;
        }).join('');
    }

    renderEmptyState() {
        const container = document.getElementById('boleto-matches-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-12 space-y-3">
                    <span class="text-4xl">⚽</span>
                    <h4 class="text-base font-bold text-white">No hay jornadas registradas en la temporada</h4>
                    <p class="text-xs text-slate-400">Pulsa "Nueva Jornada" o "Importar Partidos" para comenzar.</p>
                </div>
            `;
        }
    }

    // =========================================================================
    // MODALES Y FORMULARIOS DE TOMA DE DATOS 2.0
    // =========================================================================

    openEditModalCurrent() {
        const jornada = this.jornadas.find(j => j.id == this.selectedJornadaId);
        if (!jornada) return;
        this.openJornadaForm(jornada);
    }

    openNewJornadaModal() {
        const official = this.getOfficialJornadas();
        const nextNum = official.length + 1;
        const newJornada = {
            id: Date.now(),
            number: nextNum,
            season: '2026-2027',
            date: '',
            active: true,
            matches: Array(15).fill(null).map(() => ({ home: '', away: '', result: '' })),
            prizes: {}
        };
        this.openJornadaForm(newJornada, true);
    }

    openJornadaForm(jornada, isNew = false) {
        const modal = document.getElementById('modal-jornada-form');
        const title = document.getElementById('modal-form-title');
        const btnDelete = document.getElementById('btn-delete-jornada');

        if (!modal) return;

        if (title) title.textContent = isNew ? 'Nueva Jornada 2.0' : `Editar Jornada ${jornada.number}`;
        if (btnDelete) btnDelete.style.display = isNew ? 'none' : 'inline-block';

        // Rellenar campos generales
        document.getElementById('form-inp-id').value = jornada.id || '';
        document.getElementById('form-inp-num').value = jornada.number || 1;
        document.getElementById('form-inp-season').value = jornada.season || '2026-2027';
        document.getElementById('form-inp-date').value = jornada.date || '';
        document.getElementById('form-inp-active').checked = jornada.active !== false;

        // Renderizar filas de los 15 partidos
        this.renderMatchesEditorRows(jornada.matches || []);

        // Renderizar campos de premios
        this.renderPrizesEditorFields(jornada.prizes || {});

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeEditModal() {
        const modal = document.getElementById('modal-jornada-form');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    /**
     * Renderiza las 15 filas de partidos en el modal con selectores táctiles y autocompletado
     */
    renderMatchesEditorRows(matches) {
        const list = document.getElementById('form-matches-editor-list');
        if (!list) return;

        const teamsOptionsDatalist = this.teamsCache.map(t => `<option value="${t}">`).join('');

        let html = `
            <datalist id="datalist-teams">
                ${teamsOptionsDatalist}
            </datalist>
        `;

        for (let idx = 0; idx < 15; idx++) {
            const isPleno = idx === 14;
            const m = matches[idx] || { home: '', away: '', result: '' };

            const home = m.home || '';
            const away = m.away || '';
            const res = (m.result || '').trim().toUpperCase();

            const isPig = window.AppUtils && window.AppUtils.isPigMatch(home, away);

            // Selectores táctiles 1-X-2 para partidos 1 al 14
            let optionsHtml = '';
            if (!isPleno) {
                optionsHtml = `
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" onclick="window.JornadasApp.setTactileSign(this, ${idx}, '1')" 
                            class="tactile-opt-btn w-8 h-8 rounded-lg border text-xs font-mono font-bold flex items-center justify-center ${res === '1' ? 'active-1' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">
                            1
                        </button>
                        <button type="button" onclick="window.JornadasApp.setTactileSign(this, ${idx}, 'X')" 
                            class="tactile-opt-btn w-8 h-8 rounded-lg border text-xs font-mono font-bold flex items-center justify-center ${res === 'X' ? 'active-X' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">
                            X
                        </button>
                        <button type="button" onclick="window.JornadasApp.setTactileSign(this, ${idx}, '2')" 
                            class="tactile-opt-btn w-8 h-8 rounded-lg border text-xs font-mono font-bold flex items-center justify-center ${res === '2' ? 'active-2' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">
                            2
                        </button>
                    </div>
                `;
            } else {
                // Pleno al 15: Botones de goles [0, 1, 2, M]
                const parts = res.split('-');
                const homeG = parts[0] || '';
                const awayG = parts[1] || '';

                optionsHtml = `
                    <div class="flex items-center gap-2 shrink-0">
                        <div class="flex items-center gap-1 pleno-home-group">
                            ${['0', '1', '2', 'M'].map(g => `
                                <button type="button" onclick="window.JornadasApp.setTactilePleno(this, 'home', '${g}')"
                                    class="tactile-opt-btn w-6 h-6 rounded border text-[11px] font-mono font-bold flex items-center justify-center ${homeG === g ? 'active-pleno' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">
                                    ${g}
                                </button>
                            `).join('')}
                        </div>
                        <span class="text-slate-500 font-bold">-</span>
                        <div class="flex items-center gap-1 pleno-away-group">
                            ${['0', '1', '2', 'M'].map(g => `
                                <button type="button" onclick="window.JornadasApp.setTactilePleno(this, 'away', '${g}')"
                                    class="tactile-opt-btn w-6 h-6 rounded border text-[11px] font-mono font-bold flex items-center justify-center ${awayG === g ? 'active-pleno' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">
                                    ${g}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="match-form-row p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-2.5" data-match-idx="${idx}">
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-slate-200">
                            ${isPleno ? 'P15' : idx + 1}
                        </span>
                        <span class="match-pig-indicator text-[10px] font-bold text-pink-400 ${isPig ? '' : 'hidden'}">🐷 PIG</span>
                    </div>

                    <!-- Equipos con Datalist y Escudo dinámico -->
                    <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div class="relative flex items-center">
                            <input type="text" list="datalist-teams" placeholder="Local" value="${home}" 
                                oninput="window.JornadasApp.handleTeamInput(this)"
                                class="inp-form-home w-full pl-3 pr-2 py-1.5 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg text-white font-medium text-xs focus:outline-none">
                        </div>
                        <div class="relative flex items-center">
                            <input type="text" list="datalist-teams" placeholder="Visitante" value="${away}" 
                                oninput="window.JornadasApp.handleTeamInput(this)"
                                class="inp-form-away w-full pl-3 pr-2 py-1.5 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg text-white font-medium text-xs focus:outline-none">
                        </div>
                    </div>

                    <!-- Selectores Táctiles 1-X-2 -->
                    ${optionsHtml}
                    <input type="hidden" class="inp-form-res" value="${res}">
                </div>
            `;
        }

        list.innerHTML = html;
    }

    setTactileSign(btn, matchIdx, sign) {
        const row = btn.closest('.match-form-row');
        if (!row) return;

        const hiddenInp = row.querySelector('.inp-form-res');
        const wasActive = btn.classList.contains(`active-${sign}`);

        row.querySelectorAll('.tactile-opt-btn').forEach(b => {
            b.className = 'tactile-opt-btn w-8 h-8 rounded-lg border text-xs font-mono font-bold flex items-center justify-center bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500';
        });

        if (wasActive) {
            if (hiddenInp) hiddenInp.value = '';
        } else {
            btn.classList.remove('bg-slate-900', 'border-slate-700', 'text-slate-300');
            btn.classList.add(`active-${sign}`);
            if (hiddenInp) hiddenInp.value = sign;
        }
    }

    setTactilePleno(btn, team, goal) {
        const row = btn.closest('.match-form-row');
        if (!row) return;

        const group = btn.closest(`.pleno-${team}-group`);
        const wasActive = btn.classList.contains('active-pleno');

        group.querySelectorAll('.tactile-opt-btn').forEach(b => {
            b.className = 'tactile-opt-btn w-6 h-6 rounded border text-[11px] font-mono font-bold flex items-center justify-center bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500';
        });

        if (!wasActive) {
            btn.classList.remove('bg-slate-900', 'border-slate-700', 'text-slate-300');
            btn.classList.add('active-pleno');
        }

        // Reconstruir resultado pleno (Local - Visitante)
        const homeActive = row.querySelector('.pleno-home-group .active-pleno');
        const awayActive = row.querySelector('.pleno-away-group .active-pleno');
        const hiddenInp = row.querySelector('.inp-form-res');

        const hVal = homeActive ? homeActive.textContent.trim() : '';
        const aVal = awayActive ? awayActive.textContent.trim() : '';

        if (hVal || aVal) {
            hiddenInp.value = `${hVal || '0'}-${aVal || '0'}`;
        } else {
            hiddenInp.value = '';
        }
    }

    handleTeamInput(input) {
        if (input && input.value && /\(\s*F\s*\)/.test(input.value)) {
            input.value = input.value.replace(/\(\s*F\s*\)/g, '(f)');
        }
        const row = input.closest('.match-form-row');
        if (!row) return;

        const homeInp = row.querySelector('.inp-form-home');
        const awayInp = row.querySelector('.inp-form-away');
        const pigIndicator = row.querySelector('.match-pig-indicator');

        const home = homeInp ? homeInp.value.trim() : '';
        const away = awayInp ? awayInp.value.trim() : '';

        const isPig = window.AppUtils && window.AppUtils.isPigMatch(home, away);
        if (pigIndicator) {
            if (isPig) pigIndicator.classList.remove('hidden');
            else pigIndicator.classList.add('hidden');
        }
    }

    renderPrizesEditorFields(prizes) {
        const grid = document.getElementById('form-prizes-editor-grid');
        if (!grid) return;

        const categories = [
            { key: '15', label: 'Pleno al 15' },
            { key: '14', label: '14 Aciertos' },
            { key: '13', label: '13 Aciertos' },
            { key: '12', label: '12 Aciertos' },
            { key: '11', label: '11 Aciertos' },
            { key: '10', label: '10 Aciertos' }
        ];

        grid.innerHTML = categories.map(cat => {
            let val = prizes[cat.key] || prizes[String(cat.key)] || 0;
            if (typeof val === 'string') val = parseFloat(val.replace(',', '.').replace('€', '').trim());

            return `
                <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <label class="block text-[11px] font-semibold text-slate-400 mb-1">${cat.label}</label>
                    <input type="text" data-prize-cat="${cat.key}" value="${this.formatMoney(val)}" 
                        onblur="window.JornadasApp.formatPrizeInput(this)"
                        class="w-full px-2 py-1 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg text-white font-mono text-xs text-right focus:outline-none">
                </div>
            `;
        }).join('');
    }

    formatPrizeInput(input) {
        let num = (window.AppUtils && window.AppUtils.parseEuro)
            ? window.AppUtils.parseEuro(input.value)
            : (parseFloat(input.value.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
        if (isNaN(num) || num < 0) num = 0;
        input.value = this.formatMoney(num);
    }

    /**
     * Guarda la jornada editada o nueva en Firestore
     */
    async handleFormSubmit(e) {
        e.preventDefault();

        const idInp = document.getElementById('form-inp-id').value;
        const numInp = parseInt(document.getElementById('form-inp-num').value, 10);
        const seasonInp = document.getElementById('form-inp-season').value;
        const dateInp = document.getElementById('form-inp-date').value.trim();
        const activeInp = document.getElementById('form-inp-active').checked;

        // Validar formato y que sea domingo
        const dateObj = window.AppUtils ? window.AppUtils.parseDate(dateInp) : new Date(dateInp);
        if (!dateObj || isNaN(dateObj.getTime())) {
            alert('Formato de fecha no válido. Por favor usa DD/MM/YYYY (ejemplo: 27/09/2026).');
            return;
        }

        if (window.AppUtils && !window.AppUtils.isSunday(dateObj)) {
            const proceed = confirm('⚠️ REGLA MAULA: La fecha introducida no cae en Domingo.\n\nEn la Peña Maulas todas las jornadas oficiales se computan en domingo. ¿Deseas guardarla de todos modos?');
            if (!proceed) return;
        }

        // Compilar los 15 partidos
        const matchRows = document.querySelectorAll('#form-matches-editor-list .match-form-row');
        const matches = [];

        matchRows.forEach(row => {
            const h = (row.querySelector('.inp-form-home').value || '').trim();
            const a = (row.querySelector('.inp-form-away').value || '').trim();
            const r = (row.querySelector('.inp-form-res').value || '').trim();
            matches.push({
                home: window.AppUtils && window.AppUtils.normalizeTeamName ? window.AppUtils.normalizeTeamName(h) : h,
                away: window.AppUtils && window.AppUtils.normalizeTeamName ? window.AppUtils.normalizeTeamName(a) : a,
                result: r
            });
        });

        // Compilar premios
        const prizes = {};
        document.querySelectorAll('#form-prizes-editor-grid input[data-prize-cat]').forEach(inp => {
            const cat = inp.getAttribute('data-prize-cat');
            const val = (window.AppUtils && window.AppUtils.parseEuro)
                ? window.AppUtils.parseEuro(inp.value)
                : (parseFloat(inp.value.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
            if (val > 0) prizes[cat] = val;
        });

        const jornadaData = {
            id: idInp ? idInp : Date.now(),
            number: numInp,
            season: seasonInp,
            date: dateInp,
            active: activeInp,
            matches: matches,
            prizes: prizes
        };

        const existingIdx = this.jornadas.findIndex(j => j.id == jornadaData.id);
        if (existingIdx > -1) {
            this.jornadas[existingIdx] = jornadaData;
        } else {
            this.jornadas.push(jornadaData);
        }

        this.selectedJornadaId = jornadaData.id;

        // Guardar en Firestore
        if (window.DataService) {
            try {
                await window.DataService.save('jornadas', jornadaData);
            } catch (errDb) {
                console.error('[Jornadas 2.0] Error guardando jornada en Firestore:', errDb);
            }
        }

        // Si la jornada está completa (15/15), avisar de Telegram
        const isFinished = matches.length === 15 && matches.every(m => m.result && m.result !== '');
        if (isFinished && window.TelegramService) {
            const sendTg = confirm('⚽ Se han registrado todos los resultados de la jornada.\n\n¿Deseas enviar el informe oficial al canal de Telegram?');
            if (sendTg) {
                window.TelegramService.sendJornadaReport(jornadaData.id).catch(err => {
                    console.error('[Jornadas 2.0] Error enviando Telegram:', err);
                });
            }
        }

        this.closeEditModal();
        this.renderHubControls();
        this.renderCurrentJornadaView();
    }

    async deleteCurrentJornada() {
        if (!this.selectedJornadaId) return;
        const confirmDelete = confirm('¿Estás seguro de que deseas eliminar esta jornada permanentemente?');
        if (!confirmDelete) return;

        const idToDelete = this.selectedJornadaId;
        this.jornadas = this.jornadas.filter(j => j.id != idToDelete);

        if (window.DataService) {
            try {
                await window.DataService.delete('jornadas', idToDelete);
            } catch (err) {
                console.error('[Jornadas 2.0] Error borrando jornada:', err);
            }
        }

        this.closeEditModal();
        this.initJornadaSelection();
    }

    // =========================================================================
    // CALENDARIO DATEPICKER ASISTIDO PARA DOMINGOS
    // =========================================================================

    openDatePickerModal() {
        const modal = document.getElementById('modal-datepicker');
        if (!modal) return;

        // Si ya hay fecha en el input, sincronizar año y mes
        const currDateStr = document.getElementById('form-inp-date').value;
        const d = window.AppUtils ? window.AppUtils.parseDate(currDateStr) : new Date(currDateStr);
        if (d && !isNaN(d.getTime())) {
            this.calCurrentYear = d.getFullYear();
            this.calCurrentMonth = d.getMonth();
        }

        this.renderCalendarGrid();
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeDatePickerModal() {
        const modal = document.getElementById('modal-datepicker');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    changeCalendarMonth(delta) {
        this.calCurrentMonth += delta;
        if (this.calCurrentMonth > 11) {
            this.calCurrentMonth = 0;
            this.calCurrentYear++;
        } else if (this.calCurrentMonth < 0) {
            this.calCurrentMonth = 11;
            this.calCurrentYear--;
        }
        this.renderCalendarGrid();
    }

    renderCalendarGrid() {
        const label = document.getElementById('calendar-month-year-label');
        const grid = document.getElementById('calendar-days-grid');
        if (!grid) return;

        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        if (label) label.textContent = `${monthNames[this.calCurrentMonth]} ${this.calCurrentYear}`;

        const firstDay = new Date(this.calCurrentYear, this.calCurrentMonth, 1);
        const lastDay = new Date(this.calCurrentYear, this.calCurrentMonth + 1, 0);

        // Día de la semana del día 1 (0 = Domingo, 1 = Lunes, ...)
        // Ajustamos para que Lunes sea 0 y Domingo sea 6
        let startDayIdx = firstDay.getDay() - 1;
        if (startDayIdx === -1) startDayIdx = 6;

        const totalDays = lastDay.getDate();
        let html = '';

        // Huecos vacíos del inicio de mes
        for (let i = 0; i < startDayIdx; i++) {
            html += `<span class="p-2 opacity-10">·</span>`;
        }

        for (let day = 1; day <= totalDays; day++) {
            const thisDate = new Date(this.calCurrentYear, this.calCurrentMonth, day);
            const isSunday = thisDate.getDay() === 0;

            const dayClass = isSunday
                ? 'bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/40 hover:bg-amber-500 hover:text-slate-950 cursor-pointer shadow-sm'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer';

            html += `
                <button type="button" onclick="window.JornadasApp.selectCalendarDate(${this.calCurrentYear}, ${this.calCurrentMonth}, ${day})"
                    class="p-2 rounded-lg text-xs transition ${dayClass}">
                    ${day}
                </button>
            `;
        }

        grid.innerHTML = html;
    }

    selectCalendarDate(year, month, day) {
        const dStr = String(day).padStart(2, '0');
        const mStr = String(month + 1).padStart(2, '0');
        const formatted = `${dStr}/${mStr}/${year}`;

        const inp = document.getElementById('form-inp-date');
        if (inp) inp.value = formatted;

        const warning = document.getElementById('form-date-warning');
        const dateObj = new Date(year, month, day);
        if (warning) {
            if (dateObj.getDay() !== 0) warning.classList.remove('hidden');
            else warning.classList.add('hidden');
        }

        this.closeDatePickerModal();
    }

    // =========================================================================
    // IMPORTACIÓN INTELIGENTE DE PARTIDOS Y RESULTADOS 2.0
    // =========================================================================

    openImportMatchesModal() {
        const modal = document.getElementById('modal-import-matches');
        const step1 = document.getElementById('import-matches-step-1');
        const step2 = document.getElementById('import-matches-step-2');
        const errorBox = document.getElementById('import-matches-error-box');

        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
        if (errorBox) errorBox.classList.add('hidden');

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeImportMatchesModal() {
        const modal = document.getElementById('modal-import-matches');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async handleAutoImportMatches() {
        const btn = document.getElementById('btn-auto-import-matches');
        const spinner = document.getElementById('btn-auto-import-matches-spinner');
        const icon = document.getElementById('btn-auto-import-matches-icon');
        const text = document.getElementById('btn-auto-import-matches-text');
        const statusBox = document.getElementById('auto-import-matches-status');
        const errorBox = document.getElementById('import-matches-error-box');

        if (errorBox) errorBox.classList.add('hidden');
        if (statusBox) {
            statusBox.textContent = 'Buscando próximas jornadas de domingo con Primera División...';
            statusBox.classList.remove('hidden');
        }
        if (btn) btn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        if (icon) icon.classList.add('hidden');
        if (text) text.textContent = 'Descargando...';

        try {
            if (!window.QuinielaService || typeof window.QuinielaService.fetchUpcomingJornadas !== 'function') {
                throw new Error('El servicio QuinielaService no está disponible para consultar próximas jornadas.');
            }

            const upcoming = await window.QuinielaService.fetchUpcomingJornadas();

            if (!upcoming || upcoming.length === 0) {
                throw new Error('No se encontraron próximas jornadas oficiales que cumplan con la regla de domingo y Primera División.');
            }

            // Filtrar para previsualizar la jornada que sea más relevante (que no exista aún o la primera nueva)
            const newCandidate = upcoming.find(cand => !this.jornadas.some(j => j.number === cand.number)) || upcoming[0];

            this.pendingImportMatches = {
                jNum: newCandidate.number,
                dateStr: newCandidate.dateStr,
                isSunday: true,
                warnings: [],
                matches: newCandidate.matches
            };

            // Mostrar vista previa (Paso 2)
            document.getElementById('import-matches-step-1').classList.add('hidden');
            document.getElementById('import-matches-step-2').classList.remove('hidden');

            const headerBox = document.getElementById('import-matches-preview-header');
            const listBox = document.getElementById('import-matches-preview-list');

            if (headerBox) {
                const alreadyExists = this.jornadas.some(j => j.number === newCandidate.number);
                headerBox.innerHTML = `
                    <div class="flex items-center justify-between pb-1.5 border-b border-slate-800">
                        <div class="font-extrabold text-orange-400 flex items-center gap-2">
                            <span>Jornada ${newCandidate.number}</span>
                            <span class="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono text-[10px]">Oficial</span>
                        </div>
                        <span class="text-xs text-white font-mono font-bold">${newCandidate.dateStr} (Domingo)</span>
                    </div>
                    <div class="text-[11px] text-slate-300 pt-1">
                        ${alreadyExists ? '⚠️ <strong>Aviso:</strong> Ya existe una Jornada ' + newCandidate.number + '. Al confirmar, se actualizarán sus partidos.' : '✅ <strong>Todo listo:</strong> Se creará como nueva jornada oficial para la peña.'}
                    </div>
                `;
            }

            if (listBox) {
                listBox.innerHTML = newCandidate.matches.map((m, idx) => {
                    const isPleno = idx === 14;
                    const home = m ? m.home : 'Sin definir';
                    const away = m ? m.away : 'Sin definir';
                    return `
                        <div class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono">
                            <span class="w-8 font-bold text-slate-400">${isPleno ? 'P15' : idx + 1}</span>
                            <span class="text-white font-semibold truncate">${home} vs ${away}</span>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('[Jornadas 2.0] Error en auto-importación de partidos:', err);
            if (errorBox) {
                errorBox.innerHTML = `<div>❌ Error al importar partidos: ${err.message}</div>`;
                errorBox.classList.remove('hidden');
            }
        } finally {
            if (btn) btn.disabled = false;
            if (spinner) spinner.classList.add('hidden');
            if (icon) icon.classList.remove('hidden');
            if (text) text.textContent = 'Descargar próximas jornadas';
            if (statusBox) statusBox.classList.add('hidden');
        }
    }

    handleAnalyzeMatchesText() {
        const textarea = document.getElementById('import-matches-textarea');
        const errorBox = document.getElementById('import-matches-error-box');
        if (!textarea) return;

        const text = textarea.value.trim();
        if (!text) {
            if (errorBox) {
                errorBox.textContent = 'Por favor, pega el texto de la jornada para analizar.';
                errorBox.classList.remove('hidden');
            }
            return;
        }

        if (!window.TextImporterService) {
            alert('Servicio TextImporterService no disponible.');
            return;
        }

        const res = window.TextImporterService.parseMatchesText(text);

        if (!res.success && res.errors && res.errors.length > 0) {
            if (errorBox) {
                errorBox.innerHTML = res.errors.map(e => `<div>❌ ${e}</div>`).join('');
                errorBox.classList.remove('hidden');
            }
            return;
        }

        this.pendingImportMatches = res;

        // Mostrar vista previa (Paso 2)
        document.getElementById('import-matches-step-1').classList.add('hidden');
        document.getElementById('import-matches-step-2').classList.remove('hidden');

        const headerBox = document.getElementById('import-matches-preview-header');
        const listBox = document.getElementById('import-matches-preview-list');

        if (headerBox) {
            headerBox.innerHTML = `
                <div class="font-bold text-amber-400">Jornada Detectada: ${res.jNum}</div>
                <div class="text-slate-300">Fecha: <strong>${res.dateStr}</strong> ${res.isSunday ? '✅ (Domingo Oficial)' : '⚠️ (No es domingo)'}</div>
                ${res.warnings.length > 0 ? `<div class="text-amber-300 text-[11px] pt-1">${res.warnings.join('<br>')}</div>` : ''}
            `;
        }

        if (listBox) {
            listBox.innerHTML = res.matches.map((m, idx) => {
                const isPleno = idx === 14;
                const home = m ? m.home : 'Sin definir';
                const away = m ? m.away : 'Sin definir';
                return `
                    <div class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono">
                        <span class="w-8 font-bold text-slate-400">${isPleno ? 'P15' : idx + 1}</span>
                        <span class="text-white font-semibold truncate">${home} vs ${away}</span>
                    </div>
                `;
            }).join('');
        }
    }

    backToMatchesTextInput() {
        document.getElementById('import-matches-step-1').classList.remove('hidden');
        document.getElementById('import-matches-step-2').classList.add('hidden');
    }

    async confirmCreateJornadaFromImport() {
        if (!this.pendingImportMatches) return;
        const res = this.pendingImportMatches;
        const targetNum = parseInt(res.jNum, 10);

        // Comprobar si ya existe una jornada con ese número
        const existing = this.jornadas.find(j => parseInt(j.number, 10) === targetNum);

        const cleanMatches = res.matches.map(m => ({
            home: (window.AppUtils && window.AppUtils.normalizeTeamName) ? window.AppUtils.normalizeTeamName(m ? m.home : '') : (m ? m.home : ''),
            away: (window.AppUtils && window.AppUtils.normalizeTeamName) ? window.AppUtils.normalizeTeamName(m ? m.away : '') : (m ? m.away : ''),
            result: (m && m.result) ? m.result : ''
        }));

        if (existing) {
            existing.matches = cleanMatches;
            if (res.dateStr && (existing.date === 'Por definir' || !existing.date)) {
                existing.date = res.dateStr;
            }
            this.selectedJornadaId = existing.id;
            if (window.DataService) {
                try {
                    await window.DataService.save('jornadas', existing);
                } catch (e) {
                    console.error('[Jornadas 2.0] Error actualizando jornada existente:', e);
                }
            }
        } else {
            const newJornada = {
                id: Date.now(),
                number: targetNum || (this.jornadas.length + 1),
                season: '2026-2027',
                date: res.dateStr || 'Por definir',
                active: true,
                matches: cleanMatches,
                prizes: {}
            };

            this.jornadas.push(newJornada);
            this.selectedJornadaId = newJornada.id;

            if (window.DataService) {
                try {
                    await window.DataService.save('jornadas', newJornada);
                } catch (e) {
                    console.error('[Jornadas 2.0] Error creando jornada importada:', e);
                }
            }
        }

        this.closeImportMatchesModal();
        this.renderHubControls();
        this.renderCurrentJornadaView();
    }

    openImportResultsModal() {
        const modal = document.getElementById('modal-import-results');
        const step1 = document.getElementById('import-results-step-1');
        const step2 = document.getElementById('import-results-step-2');
        const errorBox = document.getElementById('import-results-error-box');

        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
        if (errorBox) errorBox.classList.add('hidden');

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeImportResultsModal() {
        const modal = document.getElementById('modal-import-results');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    /**
     * Busca la jornada correspondiente en la base de datos comparando prioritariamente por fecha
     * y secundariamente por número de jornada.
     */
    findTargetJornadaForResults(res) {
        if (!this.jornadas || this.jornadas.length === 0) return null;

        // 1. Prioridad: Coincidencia de fecha
        if (res && res.dateStr && window.AppUtils && typeof window.AppUtils.parseDate === 'function') {
            const parsedTarget = window.AppUtils.parseDate(res.dateStr);
            if (parsedTarget) {
                const targetTime = new Date(parsedTarget.getFullYear(), parsedTarget.getMonth(), parsedTarget.getDate()).getTime();
                const matchedByDate = this.jornadas.find(j => {
                    if (!j.date) return false;
                    const jDate = window.AppUtils.parseDate(j.date);
                    if (!jDate) return false;
                    return new Date(jDate.getFullYear(), jDate.getMonth(), jDate.getDate()).getTime() === targetTime;
                });
                if (matchedByDate) return matchedByDate;
            }
        }

        // 2. Coincidencia por número de jornada si está definido
        if (res && res.jNum && !isNaN(parseInt(res.jNum, 10))) {
            const num = parseInt(res.jNum, 10);
            const matchedByNum = this.jornadas.find(j => parseInt(j.number, 10) === num);
            if (matchedByNum) return matchedByNum;
        }

        // 3. Fallback a la jornada actualmente seleccionada
        return this.jornadas.find(j => j.id == this.selectedJornadaId) || this.jornadas[0] || null;
    }

    renderImportResultsPreviewHeader(res) {
        const headerBox = document.getElementById('import-results-preview-header');
        if (!headerBox) return;

        const currentViewed = this.jornadas.find(j => j.id == this.selectedJornadaId);
        const target = this.jornadas.find(j => j.id == res.targetJornadaId) || currentViewed;
        const isMismatch = currentViewed && target && (currentViewed.id !== target.id);

        let selectorOptions = this.jornadas.map(j => `
            <option value="${j.id}" ${target && j.id == target.id ? 'selected' : ''}>
                Jornada ${j.number} (${j.date || 'Sin fecha'})
            </option>
        `).join('');

        headerBox.innerHTML = `
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                <div class="font-bold text-emerald-400 flex items-center gap-2">
                    <span>${res.source || 'Loterías y Apuestas del Estado'}</span>
                    <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">Escrutinio Oficial</span>
                </div>
                <div class="text-xs text-slate-400">Fecha oficial: <strong class="text-white">${res.dateStr || 'Detectada'}</strong></div>
            </div>

            <div class="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="text-xs text-slate-300">
                    <span class="font-semibold text-slate-400">Asignar a la Jornada:</span>
                </div>
                <select id="import-results-target-select" onchange="window.JornadasApp.handleTargetJornadaChange(this.value)" class="bg-slate-950 border border-emerald-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-400">
                    ${selectorOptions}
                </select>
            </div>

            ${isMismatch ? `
                <div class="mt-2 p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
                    <span>⚠️</span>
                    <span><strong>Atención:</strong> Estabas viendo la <em>Jornada ${currentViewed ? currentViewed.number : ''}</em>, pero los resultados coinciden con la fecha de la <strong>Jornada ${target ? target.number : ''} (${target ? target.date : ''})</strong>.</span>
                </div>
            ` : `
                <div class="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-2">
                    <span>✅</span>
                    <span>Los resultados corresponden exactamente a la fecha de la <strong>Jornada ${target ? target.number : ''} (${target ? target.date : ''})</strong>.</span>
                </div>
            `}
        `;
    }

    handleTargetJornadaChange(newId) {
        if (!this.pendingImportResults) return;
        this.pendingImportResults.targetJornadaId = newId;
        this.renderImportResultsPreviewHeader(this.pendingImportResults);
    }

    async handleAutoImportResults() {
        const btn = document.getElementById('btn-auto-import-results');
        const spinner = document.getElementById('btn-auto-import-spinner');
        const icon = document.getElementById('btn-auto-import-icon');
        const text = document.getElementById('btn-auto-import-text');
        const statusBox = document.getElementById('auto-import-status');
        const errorBox = document.getElementById('import-results-error-box');

        if (errorBox) errorBox.classList.add('hidden');
        if (statusBox) {
            statusBox.textContent = 'Consultando escrutinio oficial en tiempo real...';
            statusBox.classList.remove('hidden');
        }
        if (btn) btn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        if (icon) icon.classList.add('hidden');
        if (text) text.textContent = 'Importando...';

        try {
            if (!window.QuinielaService) {
                throw new Error('El servicio QuinielaService no está cargado.');
            }

            const res = await window.QuinielaService.fetchLatestResults();

            // Buscar la jornada que realmente coincide por fecha
            const targetJornada = this.findTargetJornadaForResults(res);
            res.targetJornadaId = targetJornada ? targetJornada.id : this.selectedJornadaId;
            res.jNum = targetJornada ? targetJornada.number : (res.jNum || 'Actual');

            this.pendingImportResults = res;

            document.getElementById('import-results-step-1').classList.add('hidden');
            document.getElementById('import-results-step-2').classList.remove('hidden');

            this.renderImportResultsPreviewHeader(res);

            const matchesBox = document.getElementById('import-results-preview-matches');
            const prizesBox = document.getElementById('import-results-preview-prizes');

            if (matchesBox) {
                matchesBox.innerHTML = res.matches.map((m, idx) => `
                    <div class="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono">
                        <span class="w-8 font-bold text-slate-400">${idx === 14 ? 'P15' : idx + 1}</span>
                        <span class="text-white truncate">${m.home} vs ${m.away}</span>
                        <span class="font-black text-amber-400 px-2">${m.result || '-'}</span>
                    </div>
                `).join('');
            }

            if (prizesBox) {
                prizesBox.innerHTML = `
                    <div class="text-[11px] font-bold text-amber-400 mb-1">Premios oficiales detectados:</div>
                    <div class="grid grid-cols-3 gap-1 font-mono text-[11px]">
                        ${Object.keys(res.prizes).map(k => `
                            <div class="p-1 rounded bg-slate-900 text-slate-300 flex justify-between">
                                <span>${k === '15' ? 'P15' : k + 'A'}:</span>
                                <strong class="text-emerald-400">${this.formatMoney(res.prizes[k])}</strong>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } catch (err) {
            console.error('[Jornadas 2.0] Error en auto-importación:', err);
            if (errorBox) {
                errorBox.innerHTML = `<div>❌ Error al importar automáticamente: ${err.message}</div>`;
                errorBox.classList.remove('hidden');
            }
        } finally {
            if (btn) btn.disabled = false;
            if (spinner) spinner.classList.add('hidden');
            if (icon) icon.classList.remove('hidden');
            if (text) text.textContent = 'Importar resultados';
            if (statusBox) statusBox.classList.add('hidden');
        }
    }

    handleAnalyzeResultsText() {
        const textarea = document.getElementById('import-results-textarea');
        const errorBox = document.getElementById('import-results-error-box');
        if (!textarea) return;

        const text = textarea.value.trim();
        if (!text) {
            if (errorBox) {
                errorBox.textContent = 'Por favor, pega el texto de resultados para analizar.';
                errorBox.classList.remove('hidden');
            }
            return;
        }

        if (!window.TextImporterService) {
            alert('Servicio TextImporterService no disponible.');
            return;
        }

        const res = window.TextImporterService.parseResultsText(text);

        if (!res.success && res.errors && res.errors.length > 0) {
            if (errorBox) {
                errorBox.innerHTML = res.errors.map(e => `<div>❌ ${e}</div>`).join('');
                errorBox.classList.remove('hidden');
            }
            return;
        }

        // Buscar la jornada que realmente coincide por fecha
        const targetJornada = this.findTargetJornadaForResults(res);
        res.targetJornadaId = targetJornada ? targetJornada.id : this.selectedJornadaId;
        res.jNum = targetJornada ? targetJornada.number : (res.jNum || 'Manual');

        this.pendingImportResults = res;

        document.getElementById('import-results-step-1').classList.add('hidden');
        document.getElementById('import-results-step-2').classList.remove('hidden');

        this.renderImportResultsPreviewHeader(res);

        const matchesBox = document.getElementById('import-results-preview-matches');
        const prizesBox = document.getElementById('import-results-preview-prizes');

        if (matchesBox) {
            matchesBox.innerHTML = res.matches.map((m, idx) => `
                <div class="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span class="w-8 font-bold text-slate-400">${idx === 14 ? 'P15' : idx + 1}</span>
                    <span class="text-white truncate">${m.home} vs ${m.away}</span>
                    <span class="font-black text-amber-400 px-2">${m.result || '-'}</span>
                </div>
            `).join('');
        }

        if (prizesBox) {
            prizesBox.innerHTML = `
                <div class="text-[11px] font-bold text-amber-400 mb-1">Premios detectados:</div>
                <div class="grid grid-cols-3 gap-1 font-mono text-[11px]">
                    ${Object.keys(res.prizes).map(k => `
                        <div class="p-1 rounded bg-slate-900 text-slate-300 flex justify-between">
                            <span>${k === '15' ? 'P15' : k + 'A'}:</span>
                            <strong class="text-emerald-400">${this.formatMoney(res.prizes[k])}</strong>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    backToResultsTextInput() {
        document.getElementById('import-results-step-1').classList.remove('hidden');
        document.getElementById('import-results-step-2').classList.add('hidden');
    }

    async confirmImportResults() {
        if (!this.pendingImportResults) return;
        const res = this.pendingImportResults;

        // Obtener la jornada de destino según lo elegido/resuelto
        let targetJornada = this.jornadas.find(j => j.id == res.targetJornadaId);
        if (!targetJornada) {
            targetJornada = this.findTargetJornadaForResults(res);
        }

        if (!targetJornada) {
            alert(`No se encontró una jornada válida para asignar los resultados.`);
            return;
        }

        // Asignar resultados a cada partido
        if (targetJornada.matches) {
            targetJornada.matches.forEach((m, idx) => {
                if (res.matches[idx] && res.matches[idx].result) {
                    m.result = res.matches[idx].result;
                }
            });
        }

        // Asignar premios
        targetJornada.prizes = res.prizes || {};

        if (window.DataService) {
            try {
                await window.DataService.save('jornadas', targetJornada);
            } catch (err) {
                console.error('[Jornadas 2.0] Error guardando resultados oficiales:', err);
            }
        }

        this.selectedJornadaId = targetJornada.id;
        this.closeImportResultsModal();
        this.renderHubControls();
        this.renderCurrentJornadaView();
    }

    // =========================================================================
    // MODAL EXPLICATIVO EN PRIMER PLANO (TARJETAS ℹ️)
    // =========================================================================

    showInfo(type) {
        const modal = document.getElementById('modal-info-card');
        const iconEl = document.getElementById('modal-info-icon');
        const titleEl = document.getElementById('modal-info-title');
        const tagEl = document.getElementById('modal-info-tag');
        const bodyEl = document.getElementById('modal-info-body');

        if (!modal || !bodyEl) return;

        const infoMap = {
            estado: {
                icon: '⏱️',
                tag: 'Calendario Oficial',
                title: 'Estado y Cronograma de la Jornada',
                body: `
                    <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm font-semibold leading-relaxed">
                        Regla Maula Oficial: Todas las jornadas se juegan y computan en DOMINGO.
                    </div>
                    <div class="space-y-2 text-xs text-slate-300 pt-2">
                        <p>• <strong>Jornada Pendiente:</strong> Plazo abierto de pronósticos hasta el jueves a las 17:00h.</p>
                        <p>• <strong>En Juego:</strong> Partidos disputándose el fin de semana con escrutinio en vivo.</p>
                        <p>• <strong>Finalizada:</strong> Los 15 partidos han concluido y se aplican los puntos oficiales a la clasificación general y los premios de Loterías.</p>
                    </div>
                `
            },
            signos: {
                icon: '📊',
                tag: 'Boleto Oficial',
                title: 'Distribución de Signos 1-X-2',
                body: `
                    <p class="text-slate-200 text-sm leading-relaxed">
                        Refleja la cantidad total de victorias locales (1), empates (X) y victorias visitantes (2) en los partidos 1 al 14.
                    </p>
                    <p class="text-slate-300 text-xs mt-2">
                        El <strong>Pleno al 15</strong> se evalúa de forma independiente mediante la combinación exacta de goles (0, 1, 2, M para cada equipo).
                    </p>
                `
            },
            pig: {
                icon: '🐷',
                tag: 'Normativa PIG',
                title: 'Partido de Interés General (PIG)',
                body: `
                    <div class="p-3.5 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-200 text-sm font-semibold leading-relaxed">
                        Cualquier partido entre dos de los tres grandes clubes (Real Madrid, Barcelona o Atlético de Madrid), en cualquier casilla del 1 al 15.
                    </div>
                    <div class="space-y-2 text-xs text-slate-300 pt-2">
                        <p>• <strong>✅ Acertantes:</strong> Exentos de penalización.</p>
                        <p>• <strong>❌ Perdedores:</strong> Penalización de <strong>1,00 €</strong> codificada en los parámetros del Bote 2 que ingresa en la caja de la peña.</p>
                    </div>
                `
            },
            premios: {
                icon: '💰',
                tag: 'Escrutinio Oficial',
                title: 'Premios & Reparto de Loterías',
                body: `
                    <p class="text-slate-200 text-sm leading-relaxed">
                        Importes asignados oficialmente por Loterías y Apuestas del Estado a partir de 10 aciertos.
                    </p>
                    <div class="space-y-2 text-xs text-slate-300 pt-2">
                        <p>• <strong>Premios Individuales:</strong> Pertenecen íntegramente al socio acertante.</p>
                        <p>• <strong>Premios de Dobles:</strong> Pertenecen a la columna colectiva financiada por el bote de la peña y se ingresan en la tesorería común.</p>
                    </div>
                `
            }
        };

        const info = infoMap[type] || {
            icon: 'ℹ️',
            tag: 'Información',
            title: 'Detalle Oficial',
            body: '<p class="text-slate-300">Información del panel Maulas 2.0.</p>'
        };

        if (iconEl) iconEl.textContent = info.icon;
        if (tagEl) tagEl.textContent = info.tag;
        if (titleEl) titleEl.textContent = info.title;
        bodyEl.innerHTML = info.body;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

// Inicialización automática al cargar el documento
document.addEventListener('DOMContentLoaded', () => {
    window.JornadasApp = new Jornadas2AppController();
});
