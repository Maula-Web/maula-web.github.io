/**
 * functions/quinielaScraper.js
 * Scraper resiliente para resultados y escrutinio oficial de La Quiniela.
 * Fuentes: El País Sorteos (primaria con céntimos exactos) + RTVE (secundaria de respaldo estatal).
 */

async function fetchLatestQuiniela() {
    let lastError = null;

    // 1. Fuente Primaria: El País (contiene céntimos exactos oficiales)
    try {
        const elPaisData = await parseElPais();
        if (elPaisData && elPaisData.matches && elPaisData.matches.length === 15) {
            return {
                success: true,
                source: 'El País Sorteos',
                ...elPaisData
            };
        }
    } catch (err) {
        lastError = err;
        console.warn('[quinielaScraper] Fallo al consultar El País:', err.message);
    }

    // 2. Fuente Secundaria: RTVE (respaldo garantizado sin bloqueos)
    try {
        const rtveData = await parseRTVE();
        if (rtveData && rtveData.matches && rtveData.matches.length === 15) {
            return {
                success: true,
                source: 'RTVE Loterías',
                ...rtveData
            };
        }
    } catch (err) {
        lastError = err;
        console.warn('[quinielaScraper] Fallo al consultar RTVE:', err.message);
    }

    throw new Error(`No se pudo obtener el escrutinio de ninguna fuente: ${lastError ? lastError.message : 'Error desconocido'}`);
}

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

    // Extraer fecha (ej: "domingo 04/10/2026")
    const dateMatch = block.match(/<div class="fecha">\s*([^<]+?)\s*<\/div>/i);
    const dateStr = dateMatch ? dateMatch[1].trim() : '';

    // Extraer los 15 partidos
    const matches = [];
    const rowRegex = /<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td class="centrado">([^<]*)<\/td>\s*<td class="centrado">([^<]*)<\/td>\s*<td class="centrado">([^<]*)<\/td>\s*<\/tr>/gi;
    let matchRow;
    while ((matchRow = rowRegex.exec(block)) !== null) {
        const num = parseInt(matchRow[1], 10);
        const home = matchRow[2].replace(/\s*\([mf]\)/gi, '').trim();
        const away = matchRow[3].replace(/\s*\([mf]\)/gi, '').trim();
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

    // Extraer premios oficiales
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

    return {
        dateStr,
        matches,
        prizes,
        prizesDetails
    };
}

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
            home: item[2].replace(/\s*\([mf]\)/gi, '').trim(),
            away: item[3].replace(/\s*\([mf]\)/gi, '').trim(),
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

    return {
        dateStr,
        matches,
        prizes,
        prizesDetails
    };
}

async function fetchUpcomingQuinielaJornadas() {
    try {
        const res = await fetch('https://www.elquinielista.com/Quinielista/calendario-quiniela', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const html = await res.text();

        function decodeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&#225;/g, 'á').replace(/&#233;/g, 'é').replace(/&#237;/g, 'í')
                .replace(/&#243;/g, 'ó').replace(/&#250;/g, 'ú').replace(/&#241;/g, 'ñ')
                .replace(/&#193;/g, 'Á').replace(/&#201;/g, 'É').replace(/&#205;/g, 'Í')
                .replace(/&#211;/g, 'Ó').replace(/&#218;/g, 'Ú').replace(/&#209;/g, 'Ñ')
                .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
        }

        const regexJ = /<span[^>]*id=['"]lbJornada['"][^>]*>([^<]+)<\/span>/gi;
        const regexF = /<span[^>]*id=['"]lbFecha['"][^>]*>([^<]+)<\/span>/gi;
        const regexCasa = /<span[^>]*id=['"]lbEquipoCasa['"][^>]*>([^<]+)<\/span>/gi;
        const regexVisit = /<span[^>]*id=['"]lbEquipoVisitante['"][^>]*>([^<]+)<\/span>/gi;

        let match;
        const jornadas = [];
        while ((match = regexJ.exec(html)) !== null) jornadas.push(parseInt(match[1].trim(), 10));

        const fechas = [];
        while ((match = regexF.exec(html)) !== null) fechas.push(match[1].trim());

        const casas = [];
        while ((match = regexCasa.exec(html)) !== null) casas.push(decodeHtml(match[1].trim()));

        const visitas = [];
        while ((match = regexVisit.exec(html)) !== null) visitas.push(decodeHtml(match[1].trim()));

        const primeraKeywords = [
            'alavés', 'athletic', 'atlético', 'at. madrid', 'barcelona', 'betis', 
            'celta', 'espanyol', 'getafe', 'girona', 'las palmas', 'leganés', 'mallorca', 
            'osasuna', 'rayo', 'real madrid', 'r. madrid', 'real sociedad', 'r. sociedad', 
            'sevilla', 'valencia', 'valladolid', 'villarreal'
        ];

        const validJornadas = [];

        for (let i = 0; i < jornadas.length; i++) {
            const jNum = jornadas[i];
            const fStr = fechas[i] || '';

            const dMatch = fStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!dMatch) continue;

            let dateObj = new Date(parseInt(dMatch[3], 10), parseInt(dMatch[2], 10) - 1, parseInt(dMatch[1], 10));
            const dayOfWeek = dateObj.getDay();

            // Regla: si cae en fin de semana, computa en domingo
            if (dayOfWeek === 6) dateObj.setDate(dateObj.getDate() + 1);
            else if (dayOfWeek === 5) dateObj.setDate(dateObj.getDate() + 2);
            else if (dayOfWeek !== 0) continue; // Descartar intersemanales

            // REGLA MAULA: La fecha debe ser igual o posterior a hoy (no jornadas pasadas)
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            if (dateObj.getTime() < todayMidnight.getTime()) {
                continue;
            }

            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            const matches = [];
            let primeraCount = 0;
            let hasCorruptOrInvalidTeam = false;

            const invalidRegex = /\b(Fem|Femenino|Plzen|Sparta|Slavia|Ceuta|Tenerife F|Eibar F|Athletic F|Celta B)\b/i;

            for (let m = 0; m < 15; m++) {
                const idx = i * 15 + m;
                if (casas[idx] && visitas[idx]) {
                    const home = casas[idx];
                    const away = visitas[idx];

                    if (invalidRegex.test(home) || invalidRegex.test(away)) {
                        hasCorruptOrInvalidTeam = true;
                        break;
                    }

                    matches.push({ position: m + 1, home, away, result: '' });
                    if (primeraKeywords.some(k => home.toLowerCase().includes(k))) primeraCount++;
                    if (primeraKeywords.some(k => away.toLowerCase().includes(k))) primeraCount++;
                }
            }

            if (hasCorruptOrInvalidTeam) continue;

            if (matches.length >= 14 && primeraCount >= 8) {
                validJornadas.push({
                    number: jNum,
                    dateStr: formattedDate,
                    season: '2026-2027',
                    isSunday: true,
                    matches: matches.slice(0, 15)
                });
            }
        }

        return validJornadas;
    } catch (e) {
        console.warn('[quinielaScraper] Error obteniendo próximas jornadas:', e.message);
        return [];
    }
}

module.exports = {
    fetchLatestQuiniela,
    fetchUpcomingQuinielaJornadas,
    parseElPais,
    parseRTVE
};
