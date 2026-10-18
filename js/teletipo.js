/**
 * PEÑA MAULAS - TELETIPO TICKER GLOBAL (v2.0)
 * Muestra la cinta inferior de noticias y resultados en tiempo real en todas las hojas.
 */
(function() {
    'use strict';

    class TeletipoService {
        constructor() {
            this.initialized = false;
            this.seasonData = null;
        }

        init() {
            if (this.initialized) return;
            this.initialized = true;

            // 1. Asegurar clase en body para evitar solapamientos
            document.body.classList.add('has-ticker');

            // 2. Inyectar o asegurar el contenedor HTML del ticker en el DOM
            this.ensureTickerElement();

            // 3. Cargar datos y renderizar
            this.loadAndRender();
        }

        ensureTickerElement() {
            let ticker = document.getElementById('news-ticker-bar');
            if (!ticker) {
                ticker = document.createElement('footer');
                ticker.id = 'news-ticker-bar';
                ticker.className = 'fixed bottom-0 left-0 right-0 z-[110] bg-slate-950/95 backdrop-blur-md border-t border-amber-500/40 text-xs shadow-2xl h-9 sm:h-10 md:h-11 lg:h-12 flex items-center overflow-hidden select-none';
                ticker.innerHTML = `
                    <div class="h-full px-2.5 sm:px-3 md:px-4 bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 font-black text-[11px] sm:text-xs md:text-xs lg:text-sm uppercase tracking-wider flex items-center gap-1.5 md:gap-2 shrink-0 z-10 shadow-md">
                        <span class="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                        <span class="hidden xs:inline">PEÑA AL DÍA</span>
                        <span class="xs:hidden">AL DÍA</span>
                    </div>
                    <div class="ticker-wrap flex-1 overflow-hidden relative h-full flex items-center" id="ticker-container" 
                         ontouchstart="document.getElementById('ticker-content')?.classList.add('is-paused')" 
                         ontouchend="document.getElementById('ticker-content')?.classList.remove('is-paused')">
                        <div class="ticker-move flex items-center whitespace-nowrap will-change-transform text-slate-200 text-[12.5px] sm:text-[13.5px] md:text-sm lg:text-[15px]" id="ticker-content">
                            <!-- Datos del teletipo -->
                        </div>
                    </div>
                `;
                document.body.appendChild(ticker);
            }
        }

        async loadAndRender() {
            // Si ya estamos en el Dashboard y DashboardApp tiene su propio renderizado, delegar o esperar
            if (window.DashboardApp && typeof window.DashboardApp.renderNewsTicker === 'function') {
                return;
            }

            try {
                let data = null;
                if (window.DataService) {
                    await window.DataService.init();
                    data = await window.DataService.loadSeasonData();
                }

                this.renderTickerWithData(data || {});
            } catch (err) {
                console.warn("[TeletipoService] Error cargando datos, usando fallback:", err);
                this.renderTickerWithData({});
            }
        }

        renderTickerWithData(data) {
            const container = document.getElementById('ticker-content');
            if (!container) return;

            const members = data.members || [];
            const jornadas = (data.jornadas || []).slice().sort((a, b) => b.number - a.number);
            const pronosticos = data.pronosticos || [];
            const pronosticosExtra = data.pronosticosExtra || [];

            // Identificar próxima jornada o en juego
            let currentJ = jornadas.find(j => j.active) || jornadas[0] || { number: 1, date: '' };
            const playedJornadas = jornadas.filter(j => j.matches && j.matches.some(m => m.result && m.result.trim() !== ''));
            const filledMatches = currentJ.matches ? currentJ.matches.filter(m => m.result && m.result.trim() !== '' && m.result.trim() !== '-').length : 0;
            const isNextInProgress = filledMatches > 0 && filledMatches < 15;

            // Calcular líder y farolillo rojo
            let leaderName = 'Calculando...';
            let leaderPoints = 0;
            let lastMemberName = 'Calculando...';
            let lastMemberPoints = 0;

            if (window.ClasificacionApp && window.ClasificacionApp.sortedRanking && window.ClasificacionApp.sortedRanking.length > 0) {
                const ranking = window.ClasificacionApp.sortedRanking;
                leaderName = ranking[0].name;
                leaderPoints = ranking[0].grandTotal;
                const last = ranking[ranking.length - 1];
                lastMemberName = last.name;
                lastMemberPoints = last.grandTotal;
            } else if (members.length > 0) {
                // Cálculo rápido de líderes si ClasificacionApp no está activa en esta página
                leaderName = members[0].name || members[0].alias || 'Socio';
                lastMemberName = members[members.length - 1].name || members[members.length - 1].alias || 'Socio';
            }

            // Fallback de tesorería / bote
            let cajaReal = 829.48;
            let superavit = 127.52;
            if (window.BOTE_FALLBACK_DATA && window.BOTE_FALLBACK_DATA['2026-2027'] && window.BOTE_FALLBACK_DATA['2026-2027'].summary) {
                const s = window.BOTE_FALLBACK_DATA['2026-2027'].summary;
                if (typeof s.cajaReal === 'number') cajaReal = s.cajaReal;
                if (typeof s.superavit === 'number') superavit = s.superavit;
            }
            const cajaFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(cajaReal) : `${cajaReal.toFixed(2).replace('.', ',')} €`;
            const superavitFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(superavit) : `${superavit.toFixed(2).replace('.', ',')} €`;

            // Detectar si hay PIG en la jornada
            let hasPig = false;
            let pigMatchStr = '';
            if (currentJ.matches && Array.isArray(currentJ.matches)) {
                const p15 = currentJ.matches[14];
                if (p15) {
                    const topTeams = ['REAL MADRID', 'BARCELONA', 'ATLÉTICO DE MADRID', 'ATLETICO DE MADRID'];
                    const h = (p15.home || '').toUpperCase();
                    const a = (p15.away || '').toUpperCase();
                    const isTopH = topTeams.some(t => h.includes(t));
                    const isTopA = topTeams.some(t => a.includes(t));
                    if (isTopH && isTopA) {
                        hasPig = true;
                        pigMatchStr = `${p15.home} vs ${p15.away}`;
                    }
                }
            }

            // Envíos realizados
            const submittedCount = pronosticos.filter(p => String(p.jId) === String(currentJ.id) || String(p.jornadaId) === String(currentJ.id)).length;
            const totalSocios = members.length > 0 ? members.length : 19;

            const items = [];

            // 1. Jornada en curso / Próxima jornada
            if (isNextInProgress) {
                items.push(`⚽ <strong class="text-amber-400">Jornada ${currentJ.number} en juego:</strong> Marcadores disputándose en directo.`);
            } else if (currentJ && currentJ.date) {
                items.push(`⚽ <strong class="text-amber-400">Próxima Jornada ${currentJ.number}:</strong> Boleto fijado para el ${currentJ.date}.`);
            } else {
                items.push(`⚽ <strong class="text-amber-400">Temporada 2026-2027:</strong> Competición oficial en marcha.`);
            }

            // 2. Líder de aciertos / Ganador de la jornada
            items.push(`👑 <strong class="text-amber-300">Rellena Dobles:</strong> Asignado al mejor pronosticador de la jornada semanal.`);

            // 3. Sellador de la semana
            items.push(`✍️ <strong class="text-rose-400">Sellador de la semana:</strong> Reembolsado al 100% por la caja común del Bote.`);

            // 4. Quiniela colectiva de dobles
            items.push(`👑 <strong class="text-amber-400">Quiniela de Dobles:</strong> 7 dobles reducidos financiados al 100% por el Bote.`);

            // 5. Caja Real de la Peña
            items.push(`💰 <strong class="text-emerald-400">Caja Real de la Peña:</strong> ${cajaFmt} disponibles en la tesorería común.`);

            // 6. Partido PIG
            if (hasPig) {
                items.push(`🐷 <strong class="text-pink-300">¡Alerta PIG en J.${currentJ.number}!:</strong> ${pigMatchStr} (Penalización: -1,00 € al fallo).`);
            } else {
                items.push(`🐷 <strong class="text-slate-300">Partido PIG:</strong> Sin derbi entre los 3 grandes esta semana (todos los socios exentos).`);
            }

            // 7. Límite para rellenar
            items.push(`⏳ <strong class="text-amber-300">Límite para rellenar:</strong> Jueves a las 17:00h cierre estricto de quinielas en la web.`);

            // 8. Estado de participación y envíos
            items.push(`📋 <strong class="text-sky-300">Envíos de la Peña:</strong> ${submittedCount} de ${totalSocios} socios han enviado su quiniela semanal.`);

            // 9. Líder de la clasificación general
            items.push(`🏆 <strong class="text-amber-400">1º en la General:</strong> ${leaderName} lidera la temporada oficial.`);

            // 10. Farolillo rojo (Rana)
            items.push(`🐸 <strong class="text-rose-400">Farolillo Rojo:</strong> La Rana de la peña busca escapar del colista.`);

            // 11. Premios conseguidos en la temporada
            items.push(`🎁 <strong class="text-emerald-400">Premios Temporada 2026-27:</strong> Premios oficiales LAE repartidos íntegramente.`);

            // 12. Resultados recientes
            if (currentJ.matches && currentJ.matches.some(m => m.result && m.result !== '')) {
                const sample = currentJ.matches.filter(m => m.result && m.result !== '').slice(0, 3).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                items.push(`⚽ <strong class="text-amber-300">Marcadores J.${currentJ.number}:</strong> ${sample}.`);
            } else {
                items.push(`⚽ <strong class="text-slate-300">Resultados Oficiales:</strong> Escrutinio avalado por Loterías y Apuestas del Estado.`);
            }

            // 13. Superávit y balance neto de la peña
            items.push(`📈 <strong class="text-emerald-300">Superávit Peña:</strong> ${superavit >= 0 ? '+' : ''}${superavitFmt} a favor de la caja común.`);

            // 14. Próxima Cena de la Peña
            items.push(`🍽️ <strong class="text-amber-300">Cenas de la Peña:</strong> 1ª Vuelta el Vie 29 Ene 2027 • Fin de Temporada el Vie 04 Jun 2027.`);

            // 15. Tradición Maula
            items.push(`🚩 <strong class="text-rose-300">Tradición Maula:</strong> Botón de expulsión de Emilio disponible salvo en la hora previa al cierre.`);

            // Duplicar items para scroll continuo infinito
            const htmlItems = items.map((it, idx) => `
                <span class="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-1 md:py-1.5 cursor-pointer hover:text-white transition" onclick="window.handleTeletipoClick(${idx})">
                    <span class="text-amber-400/80 font-mono text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-bold">#${idx + 1}</span>
                    <span>${it}</span>
                    <span class="text-amber-500/50 font-black ml-3 md:ml-5 text-sm md:text-base select-none">•</span>
                </span>
            `).join('');

            container.innerHTML = htmlItems + htmlItems;
        }
    }

    // Navegación universal al hacer clic en cualquier noticia del teletipo
    window.handleTeletipoClick = function(idx) {
        if (window.DashboardApp && typeof window.DashboardApp.handleTickerClick === 'function') {
            window.DashboardApp.handleTickerClick(idx);
            return;
        }

        switch (idx) {
            case 0:
            case 11:
                location.href = 'jornadas_2.html';
                break;
            case 1:
            case 3:
            case 6:
            case 7:
                location.href = 'pronosticos_2.html';
                break;
            case 2:
            case 4:
            case 12:
                location.href = 'bote_2.html';
                break;
            case 5:
            case 8:
            case 9:
                location.href = 'clasificacion_2.html';
                break;
            case 10:
                location.href = 'resumen_2.html';
                break;
            case 13:
                location.href = 'dashboard_2.html';
                break;
            case 14:
                location.href = 'socios_2.html';
                break;
            default:
                location.href = 'dashboard_2.html';
        }
    };

    window.TeletipoService = new TeletipoService();

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.TeletipoService.init());
    } else {
        window.TeletipoService.init();
    }
})();
