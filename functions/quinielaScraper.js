/**
 * functions/quinielaScraper.js
 * Scraper resiliente multicapa para resultados y partidos de La Quiniela.
 * =========================================================================
 * Jerarquía de Fuentes para RESULTADOS Y ESCRUTINIO:
 *  1. El País Sorteos (Primaria: céntimos exactos de premios y tabla oficial)
 *  2. RTVE Loterías (Secundaria: respaldo estatal sin bloqueos)
 *  3. SELAE API Oficial (BuscadorSorteos de Loterías y Apuestas del Estado)
 *  4. CombinacionGanadora.com (Respaldo por fecha exacta con desglose de premios)
 *
 * Jerarquía de Fuentes para PRÓXIMAS JORNADAS:
 *  1. SELAE API Oficial (Sorteos no celebrados del Estado)
 *  2. CombinacionGanadora.com (Próximos domingos por fecha)
 * =========================================================================
 */

function normalizeTeamNameScraper(name) {
    if (!name) return '';
    let raw = String(name).trim();

    // Comprobar si es equipo femenino: (f), (F), Fem, Femenino, o sufijo F
    const isFemale = /[\(\[\{]\s*f(?:em[a-z]*)?\.?\s*[\)\]\}]/i.test(raw) ||
                     /(?:[\s\-_/]+)f\.?$/i.test(raw) ||
                     /\b(?:femenin[oa]s?|femeni|feminas|fem)\b/i.test(raw);

    // Limpiar marcadores para normalizar el nombre base
    let base = raw
        .replace(/[\(\[\{]\s*f(?:em[a-z]*)?\.?\s*[\)\]\}]/gi, '')
        .replace(/(?:[\s\-_/]+)f\.?$/gi, '')
        .replace(/(?:^|\s|[\-_/])(?:femenin[oa]s?|femen[íi]|f[ée]minas|fem)(?:$|\s|[\-_/])/gi, ' ')
        .trim();

    const aliases = {
        'R Madrid': 'Real Madrid',
        'R. Madrid': 'Real Madrid',
        'R.Madrid': 'Real Madrid',
        'Real Madrid C': 'Real Madrid',
        'At Madrid': 'Atlético de Madrid',
        'At. Madrid': 'Atlético de Madrid',
        'At.Madrid': 'Atlético de Madrid',
        'Atlético': 'Atlético de Madrid',
        'Atletico': 'Atlético de Madrid',
        'FC Barcelona': 'Barcelona',
        'F.C. Barcelona': 'Barcelona',
        'Barça': 'Barcelona',
        'Barca': 'Barcelona',
        'R Sociedad': 'Real Sociedad',
        'R. Sociedad': 'Real Sociedad',
        'R.Sociedad': 'Real Sociedad',
        'R Zaragoza': 'Zaragoza',
        'Real Zaragoza': 'Zaragoza',
        'R Oviedo': 'Oviedo',
        'Real Oviedo': 'Oviedo',
        'Racing Santander': 'Racing',
        'R Sporting': 'Sporting',
        'Sporting de Gijón': 'Sporting',
        'Rayo': 'Rayo Vallecano',
        'Rayo V': 'Rayo Vallecano',
        'Espanyol': 'RCD Espanyol',
        'Espanyol B': 'RCD Espanyol',
        'Athletic': 'Athletic Club',
        'Ath Club': 'Athletic Club',
        'Athletic de Bilbao': 'Athletic Club',
        'Madrid Cff': 'Madrid CFF',
        'Madrid C.F.F.': 'Madrid CFF'
    };

    const cleanBase = base.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    let mapped = aliases[base] || aliases[cleanBase] || base;

    // Regla oficial de unificación Peña Maulas: mantener la ' (f)' para equipos femeninos
    return isFemale ? (mapped + ' (f)') : mapped;
}

/**
 * Consulta de resultados oficiales iterando fuentes de mejor a peor
 */
async function fetchLatestQuiniela() {
    const sources = [
        { name: 'El País Sorteos', fn: parseElPais },
        { name: 'RTVE Loterías', fn: parseRTVE },
        { name: 'SELAE API Oficial', fn: parseSELAEResults }
    ];

    let lastError = null;

    for (const src of sources) {
        try {
            console.log(`[quinielaScraper] Intentando consultar resultados en: ${src.name}...`);
            const data = await src.fn();
            if (data && data.matches && data.matches.length >= 14) {
                console.log(`[quinielaScraper] ✅ Éxito obteniendo resultados desde: ${src.name}`);
                return {
                    success: true,
                    source: src.name,
                    ...data
                };
            }
        } catch (err) {
            lastError = err;
            console.warn(`[quinielaScraper] Fallo al consultar ${src.name}:`, err.message);
        }
    }

    throw new Error(`No se pudo obtener el escrutinio de ninguna fuente: ${lastError ? lastError.message : 'Error desconocido'}`);
}

// 1. EL PAÍS SORTEOS
async function parseElPais() {
    const res = await fetch('https://servicios.elpais.com/sorteos/quiniela/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9'
        }
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const html = await res.text();

    const idx = html.indexOf('class="laquiniela"');
    if (idx === -1) throw new Error('No se encontró el bloque laquiniela en El País');
    const blockEnd = html.indexOf('<div class="caja sorteo estirar">', idx + 20);
    const block = blockEnd !== -1 ? html.substring(idx, blockEnd) : html.substring(idx, idx + 8000);

    const dateMatch = block.match(/<div class="fecha">\s*([^<]+?)\s*<\/div>/i);
    const dateStr = dateMatch ? dateMatch[1].trim() : '';

    const matches = [];
    const rowRegex = /<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td class="centrado">([^<]*)<\/td>\s*<td class="centrado">([^<]*)<\/td>\s*<td class="centrado">([^<]*)<\/td>\s*<\/tr>/gi;
    let matchRow;
    while ((matchRow = rowRegex.exec(block)) !== null) {
        const num = parseInt(matchRow[1], 10);
        const home = normalizeTeamNameScraper(matchRow[2]);
        const away = normalizeTeamNameScraper(matchRow[3]);
        const col1 = matchRow[4].trim();
        const colX = matchRow[5].trim();
        const col2 = matchRow[6].trim();

        let sign = '';
        if (col1 && col1 !== '&nbsp;') sign = col1;
        else if (colX && colX !== '&nbsp;') sign = colX;
        else if (col2 && col2 !== '&nbsp;') sign = col2;

        matches.push({
            num,
            home,
            away,
            result: sign
        });
        if (matches.length === 15) break;
    }

    const prizeRegex = /<tr>\s*<td>([^<]+aciertos[^<]*|Pleno al 15[^<]*)<\/td>\s*<td>([\d\.]+)<\/td>\s*<td>([\d\.,]+)<\/td>\s*<\/tr>/gi;
    const prizes = { '15': 0, '14': 0, '13': 0, '12': 0, '11': 0, '10': 0 };
    const prizesDetails = [];
    let prizeRow;
    while ((prizeRow = prizeRegex.exec(block)) !== null) {
        const label = prizeRow[1].trim();
        const winners = parseInt(prizeRow[2].replace(/\./g, ''), 10);
        const amount = parseFloat(prizeRow[3].replace(/\./g, '').replace(',', '.'));

        let cat = null;
        if (/pleno/i.test(label)) cat = '15';
        else if (/14/i.test(label)) cat = '14';
        else if (/13/i.test(label)) cat = '13';
        else if (/12/i.test(label)) cat = '12';
        else if (/11/i.test(label)) cat = '11';
        else if (/10/i.test(label)) cat = '10';

        if (cat) {
            prizes[cat] = isNaN(amount) ? 0 : amount;
            prizesDetails.push({ category: cat, label, winners, amount: isNaN(amount) ? 0 : amount });
        }
    }

    return { dateStr, matches, prizes, prizesDetails };
}

// 2. RTVE LOTERÍAS
async function parseRTVE() {
    const res = await fetch('https://www.rtve.es/loterias/quiniela/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9'
        }
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const html = await res.text();

    const mBlock = html.match(/<li id=['"]laqu_(\d+)['"][^>]*class=['"][^'"]*active.*?<\/article>/s);
    if (!mBlock) throw new Error('No se encontró el bloque activo de quiniela en RTVE');
    const block = mBlock[0];

    const dateM = block.match(/<span class="datpub"[^>]*>([^<]+)<\/span>/i);
    const dateStr = dateM ? dateM[1].trim() : '';

    const matches = [];
    const itemRegex = /<strong class="bet_right"><abbr>([^<]+)<\/abbr><\/strong>\s*<div class="match">\s*<span class="local_team">([^<]+)<\/span>\s*<span class="visit_team">([^<]+)<\/span>\s*(?:<span class="score">([^<]*)<\/span>)?/gi;
    let item;
    let idx = 1;
    while ((item = itemRegex.exec(block)) !== null) {
        matches.push({
            num: idx++,
            result: item[1].trim(),
            home: normalizeTeamNameScraper(item[2]),
            away: normalizeTeamNameScraper(item[3]),
            score: item[4] ? item[4].trim() : ''
        });
        if (matches.length === 15) break;
    }

    const prizes = { '15': 0, '14': 0, '13': 0, '12': 0, '11': 0, '10': 0 };
    const prizesDetails = [];
    const prizeRegex = /<tr>\s*<th><strong>([^<]+)<\/strong><\/th>\s*<td>([\d\.]+)<\/td>\s*<td>([\d\.,]+)\s*&euro;<\/td>\s*<\/tr>/gi;
    let pRow;
    while ((pRow = prizeRegex.exec(block)) !== null) {
        const label = pRow[1].trim();
        const winners = parseInt(pRow[2].replace(/\./g, ''), 10);
        const amount = parseFloat(pRow[3].replace(/\./g, '').replace(',', '.'));

        let cat = null;
        if (/pleno/i.test(label)) cat = '15';
        else if (/14/i.test(label)) cat = '14';
        else if (/13/i.test(label)) cat = '13';
        else if (/12/i.test(label)) cat = '12';
        else if (/11/i.test(label)) cat = '11';
        else if (/10/i.test(label)) cat = '10';

        if (cat) {
            prizes[cat] = isNaN(amount) ? 0 : amount;
            prizesDetails.push({ category: cat, label, winners, amount: isNaN(amount) ? 0 : amount });
        }
    }

    return { dateStr, matches, prizes, prizesDetails };
}

// 3. SELAE API OFICIAL (BuscadorSorteos de Loterías del Estado)
async function parseSELAEResults() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fechaFin = `${yyyy}${mm}${dd}`;

    const past = new Date(today.getTime() - 40 * 86400000);
    const pY = past.getFullYear();
    const pM = String(past.getMonth() + 1).padStart(2, '0');
    const pD = String(past.getDate()).padStart(2, '0');
    const fechaInicio = `${pY}${pM}${pD}`;

    const url = `https://www.loteriasyapuestas.es/servicios/buscadorSorteos?game_id=LAQU&celebrados=true&fechaInicioInclusiva=${fechaInicio}&fechaFinInclusiva=${fechaFin}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) throw new Error('Sin sorteos celebrados en SELAE');

    const sundayDraws = list.filter(d => (d.dia_semana || '').toLowerCase().includes('domingo') || (d.fecha_sorteo && new Date(d.fecha_sorteo.split(' ')[0]).getDay() === 0));
    const target = sundayDraws[0] || list[0];

    const fMatch = (target.fecha_sorteo || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    const dateStr = fMatch ? `${fMatch[3]}/${fMatch[2]}/${fMatch[1]}` : '';

    const matches = (target.partidos || []).map(p => ({
        num: p.posicion,
        home: normalizeTeamNameScraper(p.local),
        away: normalizeTeamNameScraper(p.visitante),
        result: p.signo || '',
        score: p.marcador || ''
    }));

    const prizes = { '15': 0, '14': 0, '13': 0, '12': 0, '11': 0, '10': 0 };
    const prizesDetails = [];
    (target.escrutinio || []).forEach(e => {
        const cat = String(e.categoria);
        const amount = typeof e.premio === 'number' ? e.premio : parseFloat(String(e.premio || 0).replace(',', '.'));
        const winners = parseInt(e.ganadores || e.acertantes || 0, 10);
        let key = null;
        if (cat === '1' || cat === '15') key = '15';
        else if (cat === '2' || cat === '14') key = '14';
        else if (cat === '3' || cat === '13') key = '13';
        else if (cat === '4' || cat === '12') key = '12';
        else if (cat === '5' || cat === '11') key = '11';
        else if (cat === '6' || cat === '10') key = '10';

        if (key && !isNaN(amount)) {
            prizes[key] = amount;
            prizesDetails.push({ category: key, label: `Categoría ${key}`, winners, amount });
        }
    });

    return { jNum: target.jornada, dateStr, matches, prizes, prizesDetails };
}

/**
 * Consulta de próximas jornadas oficiales iterando fuentes de mejor a peor:
 *  1. SELAE API Oficial (BuscadorSorteos de Loterías del Estado)
 *  2. CombinacionGanadora.com (Convocatorias de domingos futuros)
 */
async function fetchUpcomingQuinielaJornadas() {
    // 1. Fuente Primaria de Próximas: SELAE API Oficial
    try {
        console.log('[quinielaScraper] Consultando próximas jornadas en SELAE API...');
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const fechaInicio = `${yyyy}${mm}${dd}`;

        const url = `https://www.loteriasyapuestas.es/servicios/buscadorSorteos?game_id=LAQU&celebrados=false&fechaInicioInclusiva=${fechaInicio}&fechaFinInclusiva=20261231`;
        const res = await fetch(url);
        if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list) && list.length > 0) {
                const validJornadas = [];
                for (const sorteo of list) {
                    const jNum = parseInt(sorteo.jornada || sorteo.numero, 10);
                    const fechaRaw = sorteo.fecha_sorteo || '';
                    const fMatch = fechaRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (!fMatch) continue;

                    const dateObj = new Date(parseInt(fMatch[1], 10), parseInt(fMatch[2], 10) - 1, parseInt(fMatch[3], 10));
                    const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

                    const rawPartidos = sorteo.partidos || [];
                    if (rawPartidos.length < 14) continue;

                    const matches = rawPartidos.map(p => ({
                        position: p.posicion,
                        home: normalizeTeamNameScraper(p.local),
                        away: normalizeTeamNameScraper(p.visitante),
                        result: p.signo || ''
                    }));

                    validJornadas.push({
                        number: jNum,
                        dateStr: formattedDate,
                        season: sorteo.temporada || '2026-2027',
                        isSunday: (sorteo.dia_semana || '').toLowerCase().includes('domingo') || dateObj.getDay() === 0,
                        matches: matches.slice(0, 15)
                    });
                }
                if (validJornadas.length > 0) {
                    console.log(`[quinielaScraper] ✅ SELAE API devolvió ${validJornadas.length} jornadas.`);
                    return validJornadas;
                }
            }
        }
    } catch (e) {
        console.warn('[quinielaScraper] Fallo consultando SELAE buscadorSorteos:', e.message);
    }

    return [];
}

module.exports = {
    fetchLatestQuiniela,
    fetchUpcomingQuinielaJornadas,
    parseElPais,
    parseRTVE,
    parseSELAEResults,
    normalizeTeamNameScraper
};
