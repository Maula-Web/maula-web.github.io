/**
 * Quiniela Scraper & Importer
 * Migrated to ElQuinielista.com for both matches and results.
 */

class QuinielaScraper {
    constructor() {
        // Use ElQuinielista:
        // - estadisticas page for RESULTS (has clear table structure)
        // - calendario page for PRIZES
        this.PROXIMAS_URL = 'https://www.elquinielista.com/Quinielista/calendario-quiniela';
        this.RESULTADOS_URL = 'https://www.elquinielista.com/Quinielista/Estadisticas-Quinielas';
        this.PREMIOS_URL = 'https://www.elquinielista.com/Quinielista/calendario-quiniela';

        this.CORS_PROXIES = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://corsproxy.org/?'
        ];

        this.jornadas = [];
    }

    async init() {
        if (window.DataService) {
            await window.DataService.init();
            this.jornadas = await window.DataService.getAll('jornadas');
        }
    }

    /**
     * Entry point for Importing RESULTS + PRIZES from ElQuinielista
     */
    async startResultImport() {
        await this.init();

        // Find active or incomplete jornadas
        const candidates = this.jornadas.filter(j => {
            // Filter out fully completed ones (15 results)
            const completed = j.matches ? j.matches.filter(m => m.result && m.result.trim()).length : 0;
            return completed < 15 && j.active !== false;
        });

        if (candidates.length === 0) {
            alert('Todas las jornadas activas están completas. No hay nada que actualizar.');
            return;
        }

        const loadingOverlay = this.showLoading('Buscando resultados en ElQuinielista...');
        let updates = 0;

        try {
            for (const jornada of candidates) {
                // SECURITY CHECK: Avoid future jornadas
                if (jornada.date && jornada.date.includes('-')) {
                    const parts = jornada.date.split('-'); // [dd, mm, yyyy]
                    const jDate = new Date(parts[2], parts[1] - 1, parts[0]);
                    const today = new Date();
                    const diffDays = (jDate - today) / (1000 * 60 * 60 * 24);

                    if (diffDays > 4) {
                        console.warn(`Skipping Results for J${jornada.number}: Date ${jornada.date} is too far in future.`);
                        continue;
                    }
                }

                this.updateLoading(loadingOverlay, `Consultando Jornada ${jornada.number}...`);

                // We need TWO pages: 
                // 1. Estadisticas (for 1/X/2 results, because they are plain text here)
                // 2. Calendario (for prizes)

                const resultsHtml = await this.fetchHTML(this.RESULTADOS_URL);
                const prizesHtml = await this.fetchHTML(this.PREMIOS_URL);

                const importData = {
                    matches: null,
                    prizes: null
                };

                if (resultsHtml) {
                    const matches = this.parseResultsFromEstadisticas(resultsHtml, jornada.number);
                    if (matches && matches.length > 0) {
                        importData.matches = matches;
                        console.log(`[Importer] Extracted ${matches.length} results for J${jornada.number}`);
                    }
                }

                if (prizesHtml) {
                    const prizes = this.parsePrizesFromCalendario(prizesHtml, jornada.number);
                    if (prizes) {
                        importData.prizes = prizes;
                        console.log(`[Importer] Extracted prizes for J${jornada.number}`);
                    }
                }

                if (importData.matches || importData.prizes) {
                    const updated = await this.applyResultsToJornada(jornada, importData);
                    if (updated) updates++;
                }
            }
        } catch (e) {
            console.error(e);
            alert('Error durante la importación: ' + e.message);
        } finally {
            loadingOverlay.remove();
            if (updates > 0) {
                alert(`✅ Se han actualizado ${updates} jornadas con nuevos resultados.`);
                window.location.reload();
            } else {
                alert('⚠️ No se encontraron nuevos resultados disponibles para las jornadas pendientes.');
            }
        }
    }

    /**
     * Entry point for Importing MATCHES (formerly PDF)
     * Auto-imports ALL upcoming valid jornadas (Sunday + 1st/2nd Div)
     */
    async startMatchImport() {
        const loadingOverlay = this.showLoading('Buscando próximas jornadas...');

        try {
            const html = await this.fetchHTML(this.PROXIMAS_URL);

            if (!html) throw new Error("No se pudo acceder a la web de Próximas Jornadas.");

            console.log("HTML Preview:", html.substring(0, 500)); // Debug

            // Parse ALL found jornadas
            const foundJornadas = this.parseAllProximas(html);

            if (foundJornadas.length === 0) {
                throw new Error("No se encontraron jornadas en la página de Próximas.");
            }

            console.log(`DEBUG: Encontradas ${foundJornadas.length} jornadas candidatas.`);

            // Filter relevant ones (Sunday + Logic)
            await this.init(); // Refresh DB
            let importedCount = 0;

            for (const jData of foundJornadas) {
                // 1. Validate Date (Weekend Strategy: Fri/Sat/Sun -> Sunday)
                if (!jData.dateObj || !this.isWeekend(jData)) {
                    console.log(`Skipping J${jData.number}: Not Weekend/Sunday (${jData.dateStr})`);
                    continue;
                }

                // 2. Validate League (Heavy check for Spanish Teams)
                // This prevents importing Premier League or International Breaks
                if (!this.isSpanishLeague(jData.matches)) {
                    console.log(`Skipping J${jData.number}: Not Spanish League (Detected teams: ${jData.matches[0].home} vs ${jData.matches[0].away}...)`);
                    continue;
                }

                // 3. Already exists? 
                const existing = this.jornadas.find(j => j.number === jData.number);
                if (existing) {
                    // CRITICAL: Do NOT overwrite if it already has valid match data
                    // We check if matches exist and have reasonable names
                    const hasValidData = existing.matches &&
                        existing.matches.length > 0 &&
                        existing.matches[0].home &&
                        existing.matches[0].home.length > 3;

                    if (hasValidData) {
                        console.log(`Skipping J${jData.number} Matches: Already exists with data.`);

                        // Optional: Still update date if needed
                        if (jData.dateObj && (!existing.dateObj || existing.date === 'Por definir' || existing.date.includes('Pendiente'))) {
                            existing.date = jData.dateStr;
                            // existing.dateObj could be added if schema supports it
                            await window.DataService.save('jornadas', existing);
                            console.log(`Updated date for J${jData.number}`);
                        }

                        continue; // SKIP THE REST (Matches update)
                    }

                    // Only overwrite if it was empty
                    existing.matches = jData.matches;
                    // Update date if "Pending"
                    if (existing.date === 'Por definir' || existing.date.includes('Pendiente')) {
                        existing.date = jData.dateStr;
                    }
                    await window.DataService.save('jornadas', existing);
                    importedCount++;
                } else {
                    // Create new
                    const newJornada = {
                        id: Date.now() + jData.number, // Ensure unique ID
                        number: jData.number,
                        season: '2025-2026',
                        date: jData.dateStr,
                        matches: jData.matches,
                        active: true
                    };
                    await window.DataService.save('jornadas', newJornada);
                    importedCount++;
                }
            }

            loadingOverlay.remove();

            if (importedCount > 0) {
                alert(`✅ Se han importado/actualizado ${importedCount} jornadas nuevas.`);
                window.location.reload();
            } else {
                alert('⚠️ No se encontraron jornadas nuevas que importar (las existentes se han respetado).');
            }

        } catch (e) {
            loadingOverlay.remove();
            console.error(e);
            alert('Error al importar partidos: ' + e.message);
        }
    }

    /**
     * Parses the "Proximas" page (now ElQuinielista) by scanning for blocks of 15 matches.
     */
    /**
     * Parses the "Proximas" page (now ElQuinielista) by scanning for blocks of 15 matches.
     * Pattern observed: 'Jornada :', '3', ... '1º', 'Alavés', 'At.Madrid'
     */
    parseAllProximas(html) {
        const results = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // CRITICAL FIX: Remove Scripts and Styles to avoid "Noise"
        const trash = doc.querySelectorAll('script, style, noscript, meta, link');
        trash.forEach(el => el.remove());

        // Extract clean text
        const fullText = doc.body.innerText || doc.body.textContent;
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

        console.log("DEBUG CLEAN LINES (First 20):", lines.slice(0, 20));

        let currentMatches = [];
        let bufferJornadaInfo = { number: 0, date: null };

        // ElQuinielista State Machine
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 1. Detect Jornada Start
            // Log shows: 'Jornada :', '3' -> unlikely to be same line in split?
            if (line.match(/^Jornada\s*:/i)) {
                let num = 0;
                // Check if number is in same line "Jornada : 34"
                const sameLineMatch = line.match(/^Jornada\s*:\s*(\d+)/i);
                if (sameLineMatch) {
                    num = parseInt(sameLineMatch[1]);
                } else if (i + 1 < lines.length) {
                    // Check next line
                    const nextLine = lines[i + 1];
                    if (nextLine.match(/^\d+$/)) {
                        num = parseInt(nextLine);
                    }
                }

                if (num > 0) {
                    // Save previous if valid set
                    // We need at least 14 matches to consider it a valid jornada import
                    if (currentMatches.length >= 14) {
                        this.saveFoundJornada(results, currentMatches, bufferJornadaInfo);
                    }
                    // Reset
                    currentMatches = [];
                    bufferJornadaInfo = { number: num, date: null };
                }
            }

            // 2. Detect Date
            if (line.match(/^Fecha\s*:/i)) {
                let dStr = line.split(':')[1] || '';
                if (dStr.trim() === '' && (i + 1 < lines.length)) dStr = lines[i + 1];

                const dateMatch = dStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                if (dateMatch) {
                    bufferJornadaInfo.date = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]));
                }
            }

            // 3. Detect Match "1º", "2º"... "15º" or just "15"
            const posMatch = line.match(/^(\d{1,2})[ºª\.]?$/);
            if (posMatch) {
                const pos = parseInt(posMatch[1]);

                // Validate it's likely a position marker by checking context
                // Next 2 lines should be texts (Teams)
                if (pos >= 1 && pos <= 15 && (i + 2 < lines.length)) {
                    const home = lines[i + 1];
                    const away = lines[i + 2];

                    // Basic validation: Teams shouldn't be too short or looking like metadata
                    // Exclude if it looks like a day "Sábado" or date
                    if (home.length > 2 && away.length > 2 && !home.match(/^\d+$/)) {

                        // Check for duplicates in current block (sometimes page repeats)
                        const exists = currentMatches.find(m => m.position === pos);
                        if (!exists) {
                            currentMatches.push({
                                position: pos,
                                home: this.cleanTeamName(home),
                                away: this.cleanTeamName(away),
                                result: ''
                            });
                        }

                        // Skip the lines we consumed
                        i += 2;
                    }
                }
            }
        }

        // Save last block
        if (currentMatches.length >= 14) {
            this.saveFoundJornada(results, currentMatches, bufferJornadaInfo);
        }

        return this.deduplicateJornadas(results);
    }

    saveFoundJornada(results, matches, info) {
        // Validation: Need at least a number. 
        // If number is 0, we can't reliably import it.
        if (!info.number || info.number === 0) return;

        let dDate = info.date;
        let dStr = dDate ? this.formatDate(dDate) : "Próximamente";

        results.push({
            number: info.number,
            dateStr: dStr,
            dateObj: dDate,
            matches: matches.slice(0, 15)
        });
    }

    processJsonList(list) {
        // Legacy support in case we switch back or for testing
        const parsed = [];
        return parsed;
    }

    deduplicateJornadas(list) {
        const seen = new Set();
        return list.filter(j => {
            if (seen.has(j.number)) return false;
            seen.add(j.number);
            return true;
        });
    }

    parseMatchesFromText(text) {
        // Helper used by scan strategy? Actually scan strategy parses internally.
        // Keeping this for reference or fallback.
        const matches = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // Match "1 R.MADRID - BARCELONA"
            // Or "15 RAYO AT.MADRID" 
            const match = trimmed.match(/^(\d{1,2})\s+([A-Z0-9\.\s]+?)\s*-\s*([A-Z0-9\.\s]+?)$/i);
            if (match) {
                const pos = parseInt(match[1]);
                if (pos >= 1 && pos <= 15) {
                    matches.push({
                        home: this.cleanTeamName(match[2]),
                        away: this.cleanTeamName(match[3]),
                        result: ''
                    });
                }
            }
        }
        return matches;
    }

    /**
     * Generic fetch with proxy rotation
     */
    async fetchHTML(targetUrl) {
        for (const proxy of this.CORS_PROXIES) {
            try {
                const finalUrl = proxy + encodeURIComponent(targetUrl);
                console.log(`Trying ${finalUrl}...`);
                const response = await fetch(finalUrl);
                if (response.ok) {
                    const text = await response.text();
                    if (text.length > 500) return text;
                }
            } catch (e) {
                console.warn(`Proxy ${proxy} failed`, e);
            }
        }
        return null;
    }

    /**
     * Parse Results (1, X, 2) from HTML using the "m-resultado" class
     * Confirmed strategy - OLD (Eduardo Losilla, no longer works)
     */
    parseResultsFromHTML(html, jornadaNumber) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Find buttons with class "m-resultado"
        const resultBtns = Array.from(doc.querySelectorAll('.m-resultado'));

        if (resultBtns.length === 0) return null;

        console.log(`Found ${resultBtns.length} result buttons for J${jornadaNumber}`);

        const matches = [];

        // Format: { position: 1, result: 'X' }

        for (let i = 0; i < Math.min(resultBtns.length, 15); i++) {
            const btn = resultBtns[i];
            let res = btn.getAttribute('data-casilla') || btn.textContent.trim();

            // Normalize
            if (res === '1') res = '1';
            else if (res === '2') res = '2';
            else if (res === 'X' || res === 'x') res = 'X';

            matches.push({
                position: i + 1,
                result: res
            });
        }

        return { matches };
    }

    /**
     * Parse Results from Estadisticas page
     * The page has a table with 15 rows of signs. 
     * Each row is a string like "12X1..." where index corresponds to Jornada - 1.
     */
    parseResultsFromEstadisticas(html, targetJornadaNum) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Aggressive cleanup: remove all noise before getting text
        // Note: We don't use .map(l => l.trim()) on all lines at once 
        // because we need to preserve horizontal alignment in the table rows.
        const noise = doc.querySelectorAll('script, style, noscript, iframe');
        noise.forEach(el => el.remove());

        const fullText = doc.body.innerText || doc.body.textContent;
        // Split but don't global-trim immediately to keep spaces that align columns
        const rawLines = fullText.split('\n');

        console.log(`[Estadisticas] Parsing J${targetJornadaNum}... Found ${rawLines.length} raw lines.`);

        // 1. Find the header line and the horizontal position (column index)
        let headerLineIndex = -1;
        let colIndex = -1;
        const targetStr = String(targetJornadaNum);

        for (let i = 0; i < Math.min(rawLines.length, 500); i++) {
            const line = rawLines[i];
            if (line.includes('Jornada') && line.includes(' 1 ') && line.includes(' 2 ')) {
                // Find horizontal position of targetJornadaNum as a whole number
                const regex = new RegExp(`(\\s|^|\\t)${targetStr}(\\s|$|\\t)`);
                const match = line.match(regex);
                if (match) {
                    headerLineIndex = i;
                    // match.index is the start of the whole match
                    // but we want the position of the number itself
                    colIndex = line.indexOf(targetStr, match.index);
                    console.log(`[Estadisticas] ✅ Header found at line ${i}. Column for J${targetJornadaNum} is at index ${colIndex}`);
                    break;
                }
            }
        }

        if (headerLineIndex === -1 || colIndex === -1) {
            console.warn(`[Estadisticas] ❌ Could not find column for J${targetJornadaNum}`);
            return null;
        }

        const matches = [];
        let matchCount = 0;

        // 2. Extract signs from rows below the header
        for (let i = headerLineIndex + 1; i < rawLines.length && matchCount < 15; i++) {
            const line = rawLines[i];

            if (line.length > colIndex) {
                const char = line[colIndex];

                // If it's a valid sign, we take it
                if (char && char.match(/[1X2x]/i)) {
                    matches.push({
                        position: matchCount + 1,
                        result: char.toUpperCase()
                    });
                    matchCount++;
                    console.log(`[Estadisticas] Match ${matchCount}: ${char.toUpperCase()} (from line ${i})`);
                }
            }
        }

        console.log(`[Estadisticas] Total extracted: ${matches.length} matches.`);
        return matches.length >= 14 ? matches : null;
    }

    /**
     * Parse Prizes from Calendario page
     */
    parsePrizesFromCalendario(html, targetJornadaNum) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const text = doc.body.innerText || doc.body.textContent;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

        let foundTarget = false;
        const prizes = {};

        for (let i = 0; i < lines.length; i++) {
            // Find J section: "Jornada :" on line i, number on line i+1
            if (lines[i] === 'Jornada :' && lines[i + 1] === String(targetJornadaNum)) {
                foundTarget = true;
                continue;
            }

            if (foundTarget) {
                // If we hit next Jornada, stop
                if (lines[i] === 'Jornada :') break;

                // Extract prizes: "14 Aciertos ... 21.154,80 €"
                const prizeLineMatch = lines[i].match(/(\d{1,2})\s+Aciertos.*?([\d.,]+)\s*€/i);
                if (prizeLineMatch) {
                    const category = prizeLineMatch[1];
                    const amountStr = prizeLineMatch[2].replace(/\./g, '').replace(',', '.');
                    const amount = parseFloat(amountStr);
                    if (!isNaN(amount)) prizes[category] = amount;
                } else {
                    // Alternative format (multi-line)
                    const prizeMatch = lines[i].match(/(\d{1,2})\s+Aciertos/i);
                    if (prizeMatch) {
                        const category = prizeMatch[1];
                        // Look at next few lines for €
                        for (let j = 1; j <= 3; j++) {
                            const amountMatch = (lines[i + j] || '').match(/([\d.,]+)\s*€/);
                            if (amountMatch) {
                                const amountStr = amountMatch[1].replace(/\./g, '').replace(',', '.');
                                const amount = parseFloat(amountStr);
                                if (!isNaN(amount)) prizes[category] = amount;
                                break;
                            }
                        }
                    }
                }
            }
        }

        return Object.keys(prizes).length > 0 ? prizes : null;
    }

    /**
     * Apply imported results (and prizes) to a jornada
     */
    async applyResultsToJornada(dbJornada, importData) {
        if (!importData || !importData.matches) return false;

        let hasChanges = false;

        // Update results for each match
        for (const imported of importData.matches) {
            const existing = dbJornada.matches.find(m => m.position === imported.position);
            if (existing && imported.result) {
                // Only update if different or was empty
                if (existing.result !== imported.result) {
                    existing.result = imported.result;
                    hasChanges = true;
                }
            }
        }

        // Update prizes if available
        if (importData.prizes && Object.keys(importData.prizes).length > 0) {
            if (!dbJornada.prizes) dbJornada.prizes = {};

            for (const [category, amount] of Object.entries(importData.prizes)) {
                if (dbJornada.prizes[category] !== amount) {
                    dbJornada.prizes[category] = amount;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            await window.DataService.save('jornadas', dbJornada);
            console.log(`Updated J${dbJornada.number} with results and prizes`);
            return true;
        }

        return false;
    }

    /**
     * Parse Matches (Teams) from HTML
     * Looks for team names in the structure
     */
    parseMatchesFromHTML(html, targetJornadaNum) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const matches = [];

        // Try to find the specific blocks
        // Based on previous view_file: c-detalle-partido-simple__equipos__equipo__nombre
        const nameElements = doc.querySelectorAll('.c-detalle-partido-simple__equipos__equipo__nombre');

        if (nameElements.length >= 30) {
            // We have pairs. 0=Home1, 1=Away1, 2=Home2...
            for (let i = 0; i < 15; i++) {
                const homeIdx = i * 2;
                const awayIdx = i * 2 + 1;

                if (nameElements[homeIdx] && nameElements[awayIdx]) {
                    matches.push({
                        home: this.cleanTeamName(nameElements[homeIdx].textContent),
                        away: this.cleanTeamName(nameElements[awayIdx].textContent),
                        result: ''
                    });
                }
            }
        } else {
            // Fallback for "Proximas" list if structure is different
            console.warn("Could not find standard match blocks. Trying fallback text search...");
        }

        return matches.length === 15 ? matches : null;
    }

    /**
     * Valida si es una jornada de fin de semana (Viernes, Sábado o Domingo).
     * Si es Viernes o Sábado, ajusta la fecha al Domingo.
     */
    isWeekend(jData) {
        if (!jData.dateObj) return false;

        const day = jData.dateObj.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab

        // Domingo (0) -> OK
        if (day === 0) return true;

        // Sábado (6) -> OK, ajustamos fecha a Domingo
        if (day === 6) {
            jData.dateObj.setDate(jData.dateObj.getDate() + 1);
            jData.dateStr = this.formatDate(jData.dateObj);
            return true;
        }

        // Viernes (5) -> OK, ajustamos fecha a Domingo (+2)
        if (day === 5) {
            jData.dateObj.setDate(jData.dateObj.getDate() + 2);
            jData.dateStr = this.formatDate(jData.dateObj);
            return true;
        }

        return false;
    }

    formatDate(date) {
        // dd-mm-yyyy
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}-${m}-${y}`;
    }

    /**
     * Heuristic: Check if > 50% of teams are recognized Spanish teams
     */
    isSpanishLeague(matches) {
        if (!matches || matches.length === 0) return false;

        const spanishTeams = [
            'REAL MADRID', 'BARCELONA', 'ATLÉTICO', 'AT.MADRID', 'SEVILLA', 'BETIS',
            'R.SOCIEDAD', 'ATHLETIC', 'ATH.CLUB', 'VALENCIA', 'VILLARREAL', 'GIRONA', 'OSASUNA',
            'CELTA', 'MALLORCA', 'RAYO', 'GETAFE', 'ALAVÉS', 'LAS PALMAS', 'LEGANÉS',
            'ESPANYOL', 'VALLADOLID', 'RACING', 'EIBAR', 'OVIEDO', 'R.OVIEDO', 'SPORTING',
            'ZARAGOZA', 'BURGOS', 'MIRANDÉS', 'LEVANTE', 'TENERIFE', 'HUESCA', 'ALBACETE',
            'CARTAGENA', 'FERROL', 'CASTELLÓN', 'CÓRDOBA', 'MÁLAGA', 'ELDA', 'ELDENSE',
            'ALMERÍA', 'CÁDIZ', 'GRANADA'
        ];

        let matchCount = 0;
        let totalTeams = matches.length * 2; // Home and Away for 15 matches

        for (const m of matches) {
            const home = m.home.toUpperCase();
            const away = m.away.toUpperCase();

            // Simple substring check (e.g. "REAL MADRID" matches "MADRID"?) No, better be explicit.
            // Our scraper returns "R.MADRID", "ATH.CLUB".
            // Let's check includes or startsWith to be flexible.

            const isSpanishHome = spanishTeams.some(t => home.includes(t));
            const isSpanishAway = spanishTeams.some(t => away.includes(t));

            if (isSpanishHome) matchCount++;
            if (isSpanishAway) matchCount++;
        }

        const percentage = matchCount / totalTeams;
        // If at least 40% of teams are recognized, it's Spanish league. 
        // (Premier League or Serie A would have close to 0%)
        return percentage > 0.4;
    }

    cleanTeamName(name) {
        let clean = name.trim().replace(/\./g, ''); // Remove dots first

        // Normalization Map for ElQuinielista abbreviations
        // Handles "R Madrid", "RMadrid", "RSociedad", "CultLeonesa", etc.
        const map = {
            'R Madrid': 'Real Madrid',
            'RMadrid': 'Real Madrid',
            'R Sociedad': 'Real Sociedad',
            'RSociedad': 'Real Sociedad',
            'R Zaragoza': 'Real Zaragoza',
            'RZaragoza': 'Real Zaragoza',
            'R Oviedo': 'Real Oviedo',
            'ROviedo': 'Real Oviedo',
            'R Racing': 'Racing',
            'R Sporting': 'Sporting',
            'RSporting': 'Sporting',
            'At Madrid': 'Atlético',
            'AtMadrid': 'Atlético',
            'Rayo V': 'Rayo Vallecano',
            'RayoV': 'Rayo Vallecano',
            'Espanyol': 'RCD Espanyol',
            'Athletic': 'Athletic Club',
            'Ath Club': 'Athletic Club',
            'CultLeonesa': 'Cultural Leonesa',
            'Castellon': 'Castellón',
            'Alaves': 'Alavés', // Add accent
            'Malaga': 'Málaga', // Add accent if missing
            'Cadiz': 'Cádiz',
            'Cordoba': 'Córdoba',
            'La Coruña': 'Deportivo',
            'Deportivo': 'Deportivo', // Sometimes 'RC Deportivo'
            'Elda': 'Eldense'
        };

        return map[clean] || clean;
    }

    async applyResultsToJornada(dbJornada, importData) {
        if (!importData) return false;
        let changed = false;

        // 1. Update Results if available
        if (importData.matches && Array.isArray(importData.matches)) {
            for (const impMatch of importData.matches) {
                // Find match at position (0-indexed in array vs 1-indexed import)
                const idx = impMatch.position - 1;

                if (dbJornada.matches[idx]) {
                    const current = dbJornada.matches[idx].result;
                    const imported = impMatch.result;

                    if (imported && imported !== current) {
                        dbJornada.matches[idx].result = imported;
                        changed = true;
                    }
                }
            }
        }

        // 2. Update Prizes if available
        if (importData.prizes && Object.keys(importData.prizes).length > 0) {
            if (!dbJornada.prizes) dbJornada.prizes = {};

            for (const [category, amount] of Object.entries(importData.prizes)) {
                if (dbJornada.prizes[category] !== amount) {
                    dbJornada.prizes[category] = amount;
                    changed = true;
                }
            }
        }

        if (changed) {
            if (window.DataService) {
                await window.DataService.save('jornadas', dbJornada);
            }

            // Check for completion & Telegram
            const isFinished = dbJornada.matches.every(m => m.result && m.result.trim() !== '');
            if (isFinished && window.TelegramService) {
                try {
                    await window.TelegramService.sendJornadaReport(dbJornada.id);
                } catch (e) { console.warn("Telegram error", e); }
            }
        }

        return changed;
    }

    showLoading(msg) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;justify-content:center;align-items:center;color:white;flex-direction:column';
        overlay.innerHTML = `<div style="font-size:3rem;">⏳</div><div id="loader-msg" style="margin-top:1rem;font-size:1.2rem;">${msg}</div>`;
        document.body.appendChild(overlay);
        return overlay;
    }

    updateLoading(overlay, msg) {
        const el = overlay.querySelector('#loader-msg');
        if (el) el.textContent = msg;
    }

    /**
     * DEBUG: Helper to test ElQuinielista parsing
     * Run in console: window.quinielaScraper.debugEscrutinio(39)
     */
    async debugEscrutinio(jornadaNum = 39) {
        console.log(`\n=== DEBUG ElQuinielista J${jornadaNum} (Dual Source) ===`);

        // 1. Check Results from Estadisticas
        console.log(`\n--- Source 1: Resultados (Estadisticas) ---`);
        console.log(`Fetching: ${this.RESULTADOS_URL}`);
        const resHtml = await this.fetchHTML(this.RESULTADOS_URL);
        if (resHtml) {
            console.log(`✅ Fetched ${resHtml.length} bytes`);
            const matches = this.parseResultsFromEstadisticas(resHtml, jornadaNum);
            if (matches && matches.length > 0) {
                console.log(`✅ Extracted ${matches.length} results:`, matches.map(m => m.result).join(' '));
            } else {
                console.log(`❌ Failed to extract results from Estadisticas.`);
                // Show a bit of text for context
                const lines = resHtml.replace(/<[^>]*>/g, '').split('\n').map(l => l.trim()).filter(l => l);
                console.log(`Sample lines around 100-115:`, lines.slice(100, 115));
            }
        } else {
            console.log(`❌ Failed to fetch Estadisticas.`);
        }

        // 2. Check Prizes from Calendario
        console.log(`\n--- Source 2: Premios (Calendario) ---`);
        console.log(`Fetching: ${this.PREMIOS_URL}`);
        const przHtml = await this.fetchHTML(this.PREMIOS_URL);
        if (przHtml) {
            console.log(`✅ Fetched ${przHtml.length} bytes`);
            const prizes = this.parsePrizesFromCalendario(przHtml, jornadaNum);
            if (prizes) {
                console.log(`✅ Extracted Prizes:`, prizes);
            } else {
                console.log(`❌ Failed to extract prizes for J${jornadaNum}.`);
                // Check if Jornada marker even exists
                const text = przHtml.replace(/<[^>]*>/g, '');
                console.log(`- Page contains 'Jornada :' keyword: ${text.includes('Jornada :')}`);
                console.log(`- Page contains J${jornadaNum} indicator: ${text.includes(String(jornadaNum))}`);
            }
        } else {
            console.log(`❌ Failed to fetch Calendario.`);
        }

        return { jornadaNum };
    }

    /**
     * DEBUG: Find the correct ElQuinielista results URL
     * Run: window.quinielaScraper.findCorrectResultsURL()
     */
    async findCorrectResultsURL() {
        const baseUrls = [
            'https://www.elquinielista.com/Quinielista/resultados-quiniela',
            'https://www.elquinielista.com/Quinielista/resultados-quiniela.aspx',
            'https://www.elquinielista.com/Quinielista/resultados',
            'https://www.elquinielista.com/Quinielista/historico-quiniela',
            'https://www.elquinielista.com/Quinielista/escrutinio',
            'https://sl.elquinielista.com/Quinielista/resultados-quiniela',
            'https://www.elquinielista.com/resultados-quiniela',
            'https://www.elquinielista.com/Quinielista/jornadas'
        ];

        console.log('\n=== Testing ElQuinielista URLs ===');

        for (const url of baseUrls) {
            console.log(`\nTesting: ${url}`);
            const html = await this.fetchHTML(url);

            if (html && html.length > 1000) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const trash = doc.querySelectorAll('script, style, noscript, meta, link');
                trash.forEach(el => el.remove());
                const text = doc.body.innerText;

                const hasJornada = text.includes('Jornada');
                const hasAciertos = text.includes('Aciertos');
                const has404 = text.includes('404') || text.includes('not found');

                console.log(`  - Length: ${html.length} bytes`);
                console.log(`  - Has "Jornada": ${hasJornada}`);
                console.log(`  - Has "Aciertos": ${hasAciertos}`);
                console.log(`  - ERROR page: ${has404}`);

                if (hasJornada && hasAciertos && !has404) {
                    console.log(`  ✅ LOOKS GOOD! Sample:`, text.substring(0, 200));
                    return url;
                }
            } else {
                console.log(`  ❌ Failed to fetch or too small`);
            }
        }

        console.log('\n❌ No valid URL found');
        return null;
    }
}

// Global Export for buttons
window.quinielaScraper = new QuinielaScraper();

// Mapear funciones antiguas a las nuevas
window.startRSSImport = () => window.quinielaScraper.startResultImport(); // "Importar Resultados"
window.startPDFImport = () => window.quinielaScraper.startMatchImport();  // "Importar Partidos"
