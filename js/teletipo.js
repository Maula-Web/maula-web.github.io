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
            // Ordenar jornadas de menor a mayor (1..42)
            const allJornadas = (data.jornadas || []).slice().sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
            const pronosticos = data.pronosticos || [];
            const pronosticosExtra = data.pronosticosExtra || [];

            // 1. Identificar jornadas: jugadas, en curso y próxima
            const playedJornadas = allJornadas.filter(j => j.matches && Array.isArray(j.matches) && j.matches.some(m => m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-'));
            
            // Jornada en juego: aquella que tiene algún resultado pero menos de 15 completados
            const inProgressJ = allJornadas.find(j => {
                if (!j.matches || !Array.isArray(j.matches)) return false;
                const filled = j.matches.filter(m => m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-').length;
                return filled > 0 && filled < 15;
            });

            // Última jornada finalizada
            const lastPlayedJ = playedJornadas.length > 0 ? playedJornadas[playedJornadas.length - 1] : null;

            // Próxima jornada pendiente
            const upcomingJ = allJornadas.find(j => {
                if (!j.matches || !Array.isArray(j.matches)) return true;
                const filled = j.matches.filter(m => m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-').length;
                return filled < 15;
            }) || lastPlayedJ || { number: 1, date: '' };

            // Jornada activa prioritaria para mostrar resultados en el ticker
            const activeMatchJ = inProgressJ || lastPlayedJ;

            // 2. Calcular tesorería oficial (Caja Real y Superávit)
            let cajaReal = 1091.52;
            let superavit = 396.81;
            try {
                const cachedBote = localStorage.getItem('maulas_bote2_summary');
                if (cachedBote) {
                    const parsed = JSON.parse(cachedBote);
                    if (parsed && typeof parsed.cajaReal === 'number') {
                        cajaReal = parsed.cajaReal;
                        if (typeof parsed.superavit === 'number') superavit = parsed.superavit;
                    }
                }
            } catch (e) { }
            if (window.BoteApp && typeof window.BoteApp.getSeasonData === 'function') {
                const sd = window.BoteApp.getSeasonData();
                if (sd && sd.summary && typeof sd.summary.cajaReal === 'number') {
                    cajaReal = sd.summary.cajaReal;
                    if (typeof sd.summary.superavit === 'number') superavit = sd.summary.superavit;
                }
            }
            const cajaFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(cajaReal) : `${cajaReal.toFixed(2).replace('.', ',')} €`;
            const superavitFmt = (window.AppUtils && window.AppUtils.formatEuro) ? window.AppUtils.formatEuro(superavit) : `${superavit.toFixed(2).replace('.', ',')} €`;

            // 3. Calcular clasificación real y estadísticas deportivas
            const memberStats = {};
            members.forEach(m => {
                memberStats[m.id] = {
                    id: m.id,
                    name: (window.AppUtils && window.AppUtils.getMemberName) ? window.AppUtils.getMemberName(m) : (m.alias || m.name),
                    totalPoints: 0,
                    totalHits: 0
                };
            });

            // Mapa de pronósticos
            const pronosticosMap = new Map();
            (pronosticos || []).forEach(p => {
                const jId = String(p.jId !== undefined && p.jId !== null ? p.jId : (p.jornadaId || ''));
                const mId = String(p.mId !== undefined && p.mId !== null ? p.mId : (p.memberId || ''));
                if (jId && mId) pronosticosMap.set(`${jId}_${mId}`, p);
            });

            let weeklyWinnerName = 'Pendiente';
            let weeklyWinnerHits = 0;
            let weeklyLoserName = 'Pendiente';
            let totalPremiosAcumulados = 0;

            playedJornadas.forEach(j => {
                const offResults = (j.matches || []).map(m => m.result || '');
                let jMaxPts = -Infinity;
                let jMinPts = Infinity;
                let jWinner = null;
                let jLoser = null;

                members.forEach(m => {
                    const p = pronosticosMap.get(`${j.id}_${m.id}`) || pronosticosMap.get(`${j.number}_${m.id}`);
                    if (p && Array.isArray(p.selection)) {
                        let hits = 0;
                        p.selection.forEach((s, idx) => {
                            if (idx < 14 && s && offResults[idx]) {
                                const u = String(s).trim().toUpperCase();
                                const o = String(offResults[idx]).trim().toUpperCase();
                                if (u === o || (u.includes(o) && u.length === 1)) hits++;
                            }
                        });

                        let bonus = 0;
                        if (hits >= 14) bonus = 30;
                        else if (hits === 13) bonus = 15;
                        else if (hits === 12) bonus = 10;
                        else if (hits === 11) bonus = 5;
                        else if (hits === 10) bonus = 3;
                        else if (hits === 3) bonus = -1;
                        else if (hits === 2) bonus = -2;
                        else if (hits === 1) bonus = -3;
                        else if (hits === 0) bonus = -5;

                        const pts = hits + bonus;
                        memberStats[m.id].totalPoints += pts;
                        memberStats[m.id].totalHits += hits;

                        if (pts > jMaxPts) {
                            jMaxPts = pts;
                            jWinner = { name: memberStats[m.id].name, hits };
                        }
                        if (pts < jMinPts) {
                            jMinPts = pts;
                            jLoser = { name: memberStats[m.id].name, pts };
                        }
                    }
                });

                if (j === activeMatchJ && jWinner) {
                    weeklyWinnerName = jWinner.name;
                    weeklyWinnerHits = jWinner.hits;
                    if (jLoser) {
                        weeklyLoserName = jLoser.name;
                    }
                }
            });

            // Si ClasificacionApp ya está calculada en el DOM, sincronizar con sus datos
            let leader = null;
            let secondMember = null;
            let thirdMember = null;
            let lastMember = null;
            let leaderDiff = 0;

            if (window.ClasificacionApp && window.ClasificacionApp.sortedRanking && window.ClasificacionApp.sortedRanking.length > 0) {
                const ranking = window.ClasificacionApp.sortedRanking;
                leader = { name: ranking[0].name, totalPoints: ranking[0].grandTotal };
                if (ranking.length > 1) {
                    secondMember = { name: ranking[1].name, totalPoints: ranking[1].grandTotal };
                    leaderDiff = Math.max(0, leader.totalPoints - secondMember.totalPoints);
                }
                if (ranking.length > 2) {
                    thirdMember = { name: ranking[2].name, totalPoints: ranking[2].grandTotal };
                }
                lastMember = { name: ranking[ranking.length - 1].name, totalPoints: ranking[ranking.length - 1].grandTotal };
            } else {
                const sorted = Object.values(memberStats).sort((a, b) => b.totalPoints - a.totalPoints || b.totalHits - a.totalHits);
                if (sorted.length > 0) {
                    leader = sorted[0];
                    if (sorted.length > 1) {
                        secondMember = sorted[1];
                        leaderDiff = Math.max(0, leader.totalPoints - secondMember.totalPoints);
                    }
                    if (sorted.length > 2) {
                        thirdMember = sorted[2];
                    }
                    lastMember = sorted[sorted.length - 1];
                }
            }

            // Envíos de la próxima jornada
            const targetUpcomingJ = upcomingJ || activeMatchJ || { number: 1 };
            const submittedCount = pronosticos.filter(p => String(p.jId) === String(targetUpcomingJ.id) || String(p.jornadaId) === String(targetUpcomingJ.id)).length;
            const totalSocios = members.length > 0 ? members.length : 19;

            // Detectar PIG si hay derbi entre los 3 grandes
            let hasPig = false;
            let pigMatchStr = '';
            if (targetUpcomingJ.matches && Array.isArray(targetUpcomingJ.matches)) {
                const p15 = targetUpcomingJ.matches[14];
                if (p15) {
                    const topTeams = ['REAL MADRID', 'BARCELONA', 'ATLÉTICO DE MADRID', 'ATLETICO DE MADRID'];
                    const h = (p15.home || '').toUpperCase();
                    const a = (p15.away || '').toUpperCase();
                    if (topTeams.some(t => h.includes(t)) && topTeams.some(t => a.includes(t))) {
                        hasPig = true;
                        pigMatchStr = `${p15.home} vs ${p15.away}`;
                    }
                }
            }

            // Construir lista limpia de noticias y marcadores oficiales
            const items = [];

            // NOTICIA 1: Estado principal de la jornada
            if (inProgressJ) {
                const filled = inProgressJ.matches.filter(m => m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-').length;
                items.push(`⚽ <strong class="text-amber-400">Jornada ${inProgressJ.number} en juego:</strong> ${filled}/15 partidos disputados.`);
            } else if (upcomingJ && upcomingJ.date) {
                items.push(`⚽ <strong class="text-amber-400">Próxima Jornada ${upcomingJ.number}:</strong> Boleto fijado para el ${upcomingJ.date}.`);
            } else {
                items.push(`⚽ <strong class="text-amber-400">Temporada 2026-2027:</strong> Competición oficial en marcha.`);
            }

            // NOTICIA 2: NOVEDAD WEB - Maula Hero
            items.push({
                text: `🎮 <strong class="text-amber-400">¡Novedad en la Web!:</strong> Ya disponible el juego oficial <strong>Maula Hero</strong> en tu móvil. ¡Pon a prueba tus reflejos y compite por el récord de la Peña!`,
                url: 'juego.html'
            });

            // NOTICIAS 2 Y 3: MARCADORES Y RESULTADOS COMPLETOS DE LA JORNADA EN CURSO O RECIENTE
            if (activeMatchJ && Array.isArray(activeMatchJ.matches)) {
                const validMatches = activeMatchJ.matches.filter(m => m && m.result && String(m.result).trim() !== '' && String(m.result).trim() !== '-');
                if (validMatches.length > 0) {
                    const prefix = inProgressJ ? `Marcadores en juego (J.${activeMatchJ.number})` : `Resultados Oficiales J.${activeMatchJ.number}`;
                    const block1 = validMatches.slice(0, 5).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                    items.push(`⚽ <strong class="text-amber-300">${prefix}:</strong> ${block1}.`);

                    if (validMatches.length > 5) {
                        const block2 = validMatches.slice(5, 10).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                        items.push(`⚽ <strong class="text-amber-300">Más resultados J.${activeMatchJ.number}:</strong> ${block2}.`);
                    }
                    if (validMatches.length > 10) {
                        const block3 = validMatches.slice(10, 15).map(m => `${m.home} ${m.result} ${m.away}`).join(' • ');
                        items.push(`⚽ <strong class="text-amber-300">Partidos 11-15 J.${activeMatchJ.number}:</strong> ${block3}.`);
                    }
                }
            }

            // NOTICIA 4: Ganador / Líder semanal
            if (inProgressJ && weeklyWinnerName !== 'Pendiente') {
                items.push(`👑 <strong class="text-amber-300">Líder provisional en directo:</strong> ${weeklyWinnerName} encabeza la J.${inProgressJ.number} con ${weeklyWinnerHits} aciertos.`);
            } else if (weeklyWinnerName !== 'Pendiente') {
                items.push(`👑 <strong class="text-amber-300">Ganador Semanal (J.${activeMatchJ ? activeMatchJ.number : ''}):</strong> ${weeklyWinnerName} con ${weeklyWinnerHits} aciertos (rellena dobles).`);
            }

            // NOTICIA 5: Sellador designado
            if (weeklyLoserName !== 'Pendiente') {
                items.push(`✍️ <strong class="text-rose-400">Sellador designado:</strong> ${weeklyLoserName} es el encargado de sellar en loterías.`);
            }

            // NOTICIA 6: 1º en la Clasificación General
            if (leader) {
                const diffTxt = leaderDiff > 0 ? ` (+${leaderDiff} pts sobre el 2º)` : '';
                items.push(`🏆 <strong class="text-amber-400">1º en la General:</strong> ${leader.name} lidera la temporada con ${leader.totalPoints} pts${diffTxt}.`);
            }

            // NOTICIA 7: Podio de honor (2º y 3º puesto)
            if (secondMember) {
                const thirdTxt = thirdMember ? ` • 🥉 3º ${thirdMember.name} (${thirdMember.totalPoints} pts)` : '';
                items.push(`🏅 <strong class="text-slate-300">Podio General:</strong> 🥈 2º ${secondMember.name} (${secondMember.totalPoints} pts)${thirdTxt}.`);
            }

            // NOTICIA 8: Farolillo Rojo
            if (lastMember) {
                items.push(`🐸 <strong class="text-rose-400">Farolillo Rojo:</strong> ${lastMember.name} ocupa la última posición (${lastMember.totalPoints} pts).`);
            }

            // NOTICIA 9: Caja Real de la Peña (Dato real verificado)
            items.push(`💰 <strong class="text-emerald-400">Caja Real de la Peña:</strong> ${cajaFmt} disponibles en la tesorería común.`);

            // NOTICIA 10: Superávit acumulado
            items.push(`📈 <strong class="text-emerald-300">Superávit Peña:</strong> +${superavitFmt} a favor del fondo común.`);

            // NOTICIA 11: Estado de envíos
            items.push(`📋 <strong class="text-sky-300">Envíos Semanales:</strong> ${submittedCount} de ${totalSocios} socios han enviado su quiniela.`);

            // NOTICIA 12: Límite para rellenar
            items.push(`⏳ <strong class="text-amber-300">Límite para rellenar:</strong> Jueves a las 17:00h cierre estricto de quinielas.`);

            // NOTICIA 13: Partido PIG (solo si hay derbi)
            if (hasPig) {
                items.push(`🐷 <strong class="text-pink-300">¡Alerta PIG en J.${targetUpcomingJ.number}!:</strong> ${pigMatchStr} (Penalización: -1,00 € al fallo).`);
            }

            // NOTICIA 15: Cenas oficiales de la Peña
            items.push({ text: `🍽️ <strong class="text-amber-300">Cenas de la Peña:</strong> 1ª Vuelta el Vie 29 Ene 2027 • Fin de Temporada el Vie 04 Jun 2027.`, url: 'dashboard_2.html' });

            // NOTICIA 16: NOVEDAD WEB - Actualización Maula Hero
            items.push({
                text: `⚡ <strong class="text-cyan-400">Actualización Maula Hero:</strong> Nuevo teletipo de piques en la carátula, vidas blindadas en modo dobles y centrado vertical móvil.`,
                url: 'juego.html'
            });

            // Duplicar items para scroll continuo infinito
            const htmlItems = items.map((it, idx) => {
                const text = typeof it === 'object' ? it.text : it;
                const url = typeof it === 'object' && it.url ? it.url : '';
                return `
                    <span class="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-1 md:py-1.5 cursor-pointer hover:text-white transition" onclick="window.handleTeletipoClick(${idx}, this)" data-url="${url}">
                        <span class="text-amber-400/80 font-mono text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-bold">#${idx + 1}</span>
                        <span>${text}</span>
                        <span class="text-amber-500/50 font-black ml-3 md:ml-5 text-sm md:text-base select-none">•</span>
                    </span>
                `;
            }).join('');

            container.innerHTML = htmlItems + htmlItems;
        }
    }

    // Navegación universal al hacer clic en cualquier noticia del teletipo
    window.handleTeletipoClick = function(idx, el) {
        if (el) {
            const url = el.getAttribute('data-url');
            if (url) {
                location.href = url;
                return;
            }
        }

        if (window.DashboardApp && typeof window.DashboardApp.handleTickerClick === 'function') {
            window.DashboardApp.handleTickerClick(idx, el);
            return;
        }

        // Navegación contextual inteligente según el índice del ítem
        switch (idx) {
            case 0:
            case 1:
            case 2:
                location.href = 'jornadas_2.html';
                break;
            case 3:
            case 4:
                location.href = 'pronosticos_2.html';
                break;
            case 5:
            case 6:
            case 7:
                location.href = 'clasificacion_2.html';
                break;
            case 8:
            case 9:
                location.href = 'bote_2.html';
                break;
            case 10:
            case 11:
                location.href = 'pronosticos_2.html';
                break;
            case 12:
                location.href = 'jornadas_2.html';
                break;
            case 13:
                location.href = 'dashboard_2.html';
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
