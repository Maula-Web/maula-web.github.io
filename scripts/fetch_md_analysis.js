/**
 * scripts/fetch_md_analysis.js - Scraper y Bot de Análisis de Mundo Deportivo y Clasificaciones
 * =============================================================================================
 * 1. Extrae los análisis de los 15 partidos de Mundo Deportivo (textos, porcentajes y recomendaciones).
 * 2. Extrae las clasificaciones oficiales actualizadas de 1ª División (LaLiga) y 2ª División (Hypermotion).
 * 3. Valida estrictamente si el análisis corresponde a la próxima jornada de la Peña Maulas (fin de semana)
 *    o si pertenece a una jornada entre semana (Champions/Copa), en cuyo caso marca available: false.
 * =============================================================================================
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../datos_auxiliares');
const OUTPUT_FILE = path.join(DATA_DIR, 'analisis_mundodeportivo.json');

// Normalizar nombres de equipos para comparación
function normalizeTeamName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar tildes
        .replace(/r\.\s*|c\.\s*|u\.\s*|d\.\s*|at\.\s*|ath\.\s*/g, '')
        .replace(/\b(cf|cd|ud|sd|fc|de|club|real|atletico|athletic|racing|deportivo|balompie)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

// Similitud de cadenas
function areTeamsSimilar(teamA, teamB) {
    const a = normalizeTeamName(teamA);
    const b = normalizeTeamName(teamB);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    return false;
}

async function scrapeMDAnalysis() {
    console.log('🔍 [MD Bot] Consultando análisis oficial en Mundo Deportivo...');
    const url = 'https://www.mundodeportivo.com/servicios/quiniela';
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al conectar con Mundo Deportivo`);

    const html = await res.text();

    // Detección de jornada y cierre
    const jNumMatch = html.match(/<h2 class="title-ticket blue">\s*Jornada\s*<span class="js-num-jornada">(\d+)<\/span>/i);
    const jCloseMatch = html.match(/Horario CIERRE\s*>\s*([^<]+)/i);
    const jNum = jNumMatch ? jNumMatch[1] : null;
    const jClose = jCloseMatch ? jCloseMatch[1].trim() : null;

    const articleRegex = /<article class="comment-block js-comment-block[^"]*">([\s\S]*?)<\/article>/gi;
    let matchArt;
    const analysisList = [];

    while ((matchArt = articleRegex.exec(html)) !== null) {
        const block = matchArt[1];
        
        const titleMatch = block.match(/<h2 class="title-comment">([\s\S]*?)<\/h2>/i);
        const headerNumMatch = block.match(/data-comment="(\d+)"/i);
        const num = headerNumMatch ? parseInt(headerNumMatch[1], 10) : (analysisList.length + 1);

        let homeTeam = '';
        let awayTeam = '';
        let homeRank = '';
        let awayRank = '';

        if (titleMatch) {
            const rawTitle = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            // Formato típico: "1. RAYO (13º) - ATH.CLUB (14º)"
            const parts = rawTitle.split('-');
            if (parts.length >= 2) {
                homeTeam = parts[0].replace(/^\d+[\.\s]*/, '').replace(/\(.*?\)/g, '').trim();
                awayTeam = parts[1].replace(/\(.*?\)/g, '').trim();

                const hRankMatch = parts[0].match(/\((\d+)º?\)/);
                if (hRankMatch) homeRank = hRankMatch[1] + 'º';
                const aRankMatch = parts[1].match(/\((\d+)º?\)/);
                if (aRankMatch) awayRank = aRankMatch[1] + 'º';
            }
        }

        const dateMatch = block.match(/<p class="date">([^<]+)<\/p>/i);
        const dateStr = dateMatch ? dateMatch[1].trim() : '';

        const commentMatch = block.match(/<p class="comment-element">([\s\S]*?)<\/p>/i);
        const comment = commentMatch ? commentMatch[1].trim().replace(/\s+/g, ' ') : '';

        const qMatch = block.match(/% en quinielista<\/th>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>/i);
        const lMatch = block.match(/% en lae<\/th>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>/i);
        const rMatch = block.match(/probabilidad real<\/th>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>/i);

        let recommended = '';
        if (num === 15) {
            const p15RecMatches = block.match(/<td class="bg-blue[^"]*">([012M])<\/td>/gi) || [];
            if (p15RecMatches.length >= 2) {
                const hRec = p15RecMatches[0].replace(/<[^>]+>/g, '').trim();
                const aRec = p15RecMatches[1].replace(/<[^>]+>/g, '').trim();
                recommended = `${hRec}-${aRec}`;
            }
        } else {
            const recRowMatch = block.match(/recomendado<\/th>([\s\S]*?)<\/tr>/i);
            if (recRowMatch) {
                const cells = recRowMatch[1].match(/<td class="bg-blue[^"]*">([^<]*)<\/td>/gi) || [];
                cells.forEach(c => {
                    const val = c.replace(/<[^>]+>/g, '').trim();
                    if (val) recommended += val;
                });
            }
            if (!recommended && num < 15) {
                const pReal = rMatch ? { '1': parseInt(rMatch[1], 10), 'X': parseInt(rMatch[2], 10), '2': parseInt(rMatch[3], 10) } : null;
                const pQuin = qMatch ? { '1': parseInt(qMatch[1], 10), 'X': parseInt(qMatch[2], 10), '2': parseInt(qMatch[3], 10) } : null;
                const p = pReal || pQuin;
                if (p) {
                    const maxVal = Math.max(p['1'] || 0, p['X'] || 0, p['2'] || 0);
                    if (maxVal > 0) {
                        if (p['1'] === maxVal) recommended = '1';
                        else if (p['2'] === maxVal) recommended = '2';
                        else if (p['X'] === maxVal) recommended = 'X';
                    }
                }
            }
        }

        analysisList.push({
            num,
            home: homeTeam,
            away: awayTeam,
            homeRank,
            awayRank,
            schedule: dateStr,
            comment,
            percentages: {
                quinielista: qMatch ? { '1': parseInt(qMatch[1], 10), 'X': parseInt(qMatch[2], 10), '2': parseInt(qMatch[3], 10) } : null,
                lae: (lMatch && lMatch[1] !== '-') ? { '1': parseInt(lMatch[1], 10), 'X': parseInt(lMatch[2], 10), '2': parseInt(lMatch[3], 10) } : null,
                real: rMatch ? { '1': parseInt(rMatch[1], 10), 'X': parseInt(rMatch[2], 10), '2': parseInt(rMatch[3], 10) } : null
            },
            recommended: recommended || null
        });
    }

    return {
        detectedJornadaNum: jNum,
        closingSchedule: jClose,
        matches: analysisList
    };
}

async function scrapeStandingsForDivision(division) {
    const url = `https://resultados.as.com/resultados/futbol/${division}/clasificacion/`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} al obtener clasificación de ${division}`);

    const html = await res.text();
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const list = [];

    rows.forEach(r => {
        const posMatch = r.match(/<span class="a_tb_ps">(\d+)<\/span>/i);
        const nameMatch = r.match(/<span class="_hidden-xs">([^<]+)<\/span>/i);
        const logoMatch = r.match(/<img[^>]*class="a_bd_i"[^>]*src="([^"]+)"/i);
        const ptsMatch = r.match(/<td class="col col1 --bd">(\d+)<\/td>/i);
        const stats = (r.match(/<td class="col col1">([^<]+)<\/td>/gi) || []).map(td => td.replace(/<[^>]+>/g, '').trim());

        if (nameMatch && ptsMatch) {
            list.push({
                pos: posMatch ? parseInt(posMatch[1], 10) : (list.length + 1),
                team: nameMatch[1].trim(),
                logo: logoMatch ? logoMatch[1] : '',
                pts: parseInt(ptsMatch[1], 10),
                pj: parseInt(stats[0], 10) || 0,
                pg: parseInt(stats[1], 10) || 0,
                pe: parseInt(stats[2], 10) || 0,
                pp: parseInt(stats[3], 10) || 0,
                gf: parseInt(stats[4], 10) || 0,
                gc: parseInt(stats[5], 10) || 0,
                dif: parseInt(stats[6], 10) || 0
            });
        }
    });

    return list;
}

async function main() {
    console.log('===============================================================');
    console.log('📰 PEÑA MAULAS - BOT DE ANÁLISIS DE PARTIDOS Y CLASIFICACIONES');
    console.log('===============================================================');

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // 0. Comprobar si ya tenemos los datos oficiales importados y válidos para la próxima jornada
    // Si ya están disponibles y verificados (available: true y matchCountWithTarget >= 8), no es necesario volver a raspar
    const forceRun = process.argv.includes('--force');
    if (!forceRun && fs.existsSync(OUTPUT_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            if (existing && existing.available === true && existing.matchCountWithTarget >= 8 && Array.isArray(existing.matches) && existing.matches.length >= 14) {
                console.log(`ℹ️ [MD Bot] Los análisis para la jornada ${existing.detectedJornadaNum || ''} ya han sido importados y verificados con éxito.`);
                console.log(`ℹ️ [MD Bot] Omitiendo descarga para evitar llamadas innecesarias (usa --force para forzar la actualización).`);
                return;
            }
        } catch (eCheck) {
            console.warn('⚠️ Error comprobando archivo existente de análisis:', eCheck.message);
        }
    }

    // 1. Extraer análisis de Mundo Deportivo
    let mdData = null;
    try {
        mdData = await scrapeMDAnalysis();
        console.log(`✅ [MD Bot] Extraídos ${mdData.matches.length} análisis de Mundo Deportivo.`);
        console.log(`ℹ️ [MD Bot] Jornada detectada en web: ${mdData.detectedJornadaNum || 'N/A'} | Cierre: ${mdData.closingSchedule || 'N/A'}`);
    } catch (e) {
        console.error('❌ Error al raspar Mundo Deportivo:', e.message);
    }

    // 2. Extraer clasificaciones de 1ª y 2ª
    let standingsPrimera = [];
    let standingsSegunda = [];
    try {
        console.log('📊 [MD Bot] Descargando clasificación de Primera División...');
        standingsPrimera = await scrapeStandingsForDivision('primera');
        console.log(`✅ [MD Bot] Primera División: ${standingsPrimera.length} equipos clasificados.`);
    } catch (e) {
        console.warn('⚠️ Error al obtener Primera División:', e.message);
    }

    try {
        console.log('📊 [MD Bot] Descargando clasificación de Segunda División...');
        standingsSegunda = await scrapeStandingsForDivision('segunda');
        console.log(`✅ [MD Bot] Segunda División: ${standingsSegunda.length} equipos clasificados.`);
    } catch (e) {
        console.warn('⚠️ Error al obtener Segunda División:', e.message);
    }

    // 3. Verificación de Jornada Próxima de la Peña Maulas
    let targetJornadas = [];
    const cacheJornadasPath = path.join(DATA_DIR, 'proximas_jornadas_cache.json');
    if (fs.existsSync(cacheJornadasPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(cacheJornadasPath, 'utf8'));
            if (Array.isArray(raw) && raw.length > 0) {
                targetJornadas = raw;
            }
        } catch (e) {
            console.warn('⚠️ Error al leer proximas_jornadas_cache.json:', e.message);
        }
    }

    // Si proximas_jornadas_cache.json está vacío, usar el catálogo de respaldo de QuinielaService
    if (targetJornadas.length === 0) {
        try {
            const { QuinielaService } = require('../js/quiniela-service');
            if (QuinielaService && Array.isArray(QuinielaService.BUILTIN_UPCOMING_JORNADAS)) {
                targetJornadas = QuinielaService.BUILTIN_UPCOMING_JORNADAS;
            }
        } catch (e) {
            console.warn('⚠️ Error al cargar QuinielaService.BUILTIN_UPCOMING_JORNADAS:', e.message);
        }
    }

    // Comprobar si el cierre es entre semana (Martes / Miércoles / Jueves)
    const isMidweek = mdData && mdData.closingSchedule && /martes|mi[eé]rcoles|jueves/i.test(mdData.closingSchedule);

    let isAvailableForTarget = false;
    let matchCount = 0;
    let matchedJornadaNum = null;

    if (mdData && mdData.matches.length >= 14 && targetJornadas.length > 0) {
        for (const tJornada of targetJornadas) {
            if (!tJornada || !Array.isArray(tJornada.matches)) continue;
            let currentMatchesMatched = 0;
            tJornada.matches.forEach(tMatch => {
                const found = mdData.matches.some(m =>
                    (areTeamsSimilar(m.home, tMatch.home) && areTeamsSimilar(m.away, tMatch.away)) ||
                    (areTeamsSimilar(m.home, tMatch.away) && areTeamsSimilar(m.away, tMatch.home))
                );
                if (found) currentMatchesMatched++;
            });

            if (currentMatchesMatched >= 8) {
                matchCount = currentMatchesMatched;
                matchedJornadaNum = tJornada.number;
                if (!isMidweek) {
                    isAvailableForTarget = true;
                }
                break;
            }
        }
    }

    console.log(`\n🔍 Verificación de jornada:`);
    console.log(`  • Partidos coincidentes con Peña Maulas: ${matchCount}/15 ${matchedJornadaNum ? `(Jornada ${matchedJornadaNum})` : ''}`);
    console.log(`  • Detección de jornada entre semana en MD: ${isMidweek ? 'SÍ (Champions/Copa)' : 'NO (Fin de semana)'}`);
    console.log(`  • Disponible para mostrar en el pronóstico: ${isAvailableForTarget ? '✅ SÍ' : '❌ NO'}`);

    const output = {
        updatedAt: new Date().toISOString(),
        available: isAvailableForTarget,
        matchCountWithTarget: matchCount,
        isMidweek,
        detectedJornadaNum: mdData ? mdData.detectedJornadaNum : null,
        closingSchedule: mdData ? mdData.closingSchedule : null,
        reason: isAvailableForTarget
            ? 'Análisis disponible y verificado para la próxima jornada oficial.'
            : (isMidweek
                ? 'Los análisis publicados en Mundo Deportivo corresponden a una jornada entre semana (Champions/Copa) y no a la jornada oficial de la Peña Maulas.'
                : 'Los análisis de la próxima jornada aún no han sido publicados por Mundo Deportivo.'),
        matches: mdData ? mdData.matches : [],
        standings: {
            primera: standingsPrimera,
            segunda: standingsSegunda
        }
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n💾 Archivo guardado con éxito en: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('❌ Error fatal en el bot:', err);
    process.exit(1);
});
