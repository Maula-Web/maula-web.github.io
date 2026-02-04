/**
 * Quiniela Scraper & Importer
 * Replaces old RSS and PDF importers.
 * Scrapes data directly from EduardoLosilla.es using client-side CORS proxies.
 */

class QuinielaScraper {
    constructor() {
        // We use specific URLs for different tasks
        this.BASE_URL = 'https://www.eduardolosilla.es/quiniela/ayudas/escrutinio';
        this.PROXIMAS_URL = 'https://www.eduardolosilla.es/quiniela/ayudas/proximas';

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
     * Entry point for Importing RESULTS (formerly RSS)
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

        const loadingOverlay = this.showLoading('Buscando resultados en EduardoLosilla.es...');
        let updates = 0;

        try {
            for (const jornada of candidates) {
                this.updateLoading(loadingOverlay, `Consultando Jornada ${jornada.number}...`);

                // Construct URL: .../jornada_X
                const url = `${this.BASE_URL}/jornada_${jornada.number}`;
                const html = await this.fetchHTML(url);

                if (html) {
                    const results = this.parseResultsFromHTML(html, jornada.number);
                    if (results && results.matches.length > 0) {
                        const updated = await this.applyResultsToJornada(jornada, results);
                        if (updated) updates++;
                    }
                }
            }
        } catch (e) {
            console.error(e);
            alert('Error durante la importación: ' + e.message);
        } finally {
            loadingOverlay.remove();
            if (updates > 0) {
                alert(`✅ Se han actualizado ${updates} jornadas con nuevos resultados.`);
                window.location.reload(); // Refresh grid
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

                // 3. Already exists? Update matches if empty
                const existing = this.jornadas.find(j => j.number === jData.number);
                if (existing) {
                    // Update only if existing has no matches or we want to refresh
                    // Let's assume we overwrite matches if they are placeholders? 
                    // User wants "import" so likely update or create.
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
                alert(`✅ Se han importado/actualizado ${importedCount} jornadas de Domingo.`);
                window.location.reload();
            } else {
                alert('⚠️ Se encontraron jornadas pero ninguna cumplía los requisitos (Domingo).');
            }

        } catch (e) {
            loadingOverlay.remove();
            console.error(e);
            alert('Error al importar partidos: ' + e.message);
        }
    }

    /**
     * Parses the "Proximas" page to find multiple jornadas
     */
    /**
     * Parses the "Proximas" page to find multiple jornadas
     * Strategy 1: "Hidden API" (JSON State embedded in HTML) - Most reliable
     * Strategy 2: Raw Text Parsing - Fallback
     */
    parseAllProximas(html) {
        let results = [];

        // STRATEGY 1: JSON State Extraction
        try {
            const jsonPattern = /<script id="eduardo-losilla-state" type="application\/json">([\s\S]*?)<\/script>/;
            const match = html.match(jsonPattern);

            if (match && match[1]) {
                // Decode HTML entities if present (e.g. &q;) - rudimentary check
                let rawJson = match[1].replace(/&q;/g, '"');
                const state = JSON.parse(rawJson);

                console.log("State encontrado:", state); // Debug
                console.log("State Keys:", Object.keys(state)); // Debug keys
                if (state.quiniela) console.log("State.quiniela keys:", Object.keys(state.quiniela)); // Debug quiniela keys


                // Navigate commonly known paths in their Redux-like state
                // Usually: state.quiniela.proximas OR state.quiniela.jornadas
                const candidateLists = [
                    state?.quiniela?.proximas,
                    state?.quiniela?.calendario,
                    state?.page?.props?.proximas // React specific sometimes
                ];

                for (const list of candidateLists) {
                    if (Array.isArray(list)) {
                        const parsed = this.processJsonList(list);
                        if (parsed.length > 0) results = results.concat(parsed);
                    } else if (list && typeof list === 'object') {
                        // Sometimes it's an object keyed by ID
                        const parsed = this.processJsonList(Object.values(list));
                        if (parsed.length > 0) results = results.concat(parsed);
                    }
                }
            }
        } catch (e) {
            console.warn("Error parsing JSON state:", e);
        }

        if (results.length > 0) {
            console.log(`Extracted ${results.length} jornadas via JSON State.`);
            return this.deduplicateJornadas(results);
        }

        // STRATEGY 2: Fallback to Text Parsing (Improved)
        console.log("Fallback to Text Parsing...");
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const fullText = doc.body.innerText || doc.body.textContent;
        // Normalize newlines
        const text = fullText.replace(/\n\s*\n/g, '\n');

        // Split explicitly by "Jornada" header
        const parts = text.split(/Jornada\s+(\d+)/i);

        for (let i = 1; i < parts.length; i += 2) {
            const num = parseInt(parts[i]);
            const content = parts[i + 1];

            // Attempt to extract date
            let dateStr = "Por definir";
            let dateObj = null;

            // Regex for date: dd/mm/yyyy or dd-mm-yyyy or dd/mm
            const dateMatch = content.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
            if (dateMatch) {
                const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
                dateStr = `${dateMatch[1]}-${dateMatch[2]}`;
                dateObj = new Date(year, parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]));
                // Adjust year if date is in past (crossing year boundary) - simplified for now
            }

            const matches = this.parseMatchesFromText(content);
            if (matches.length === 15) {
                results.push({
                    number: num,
                    dateStr: dateStr,
                    dateObj: dateObj,
                    matches: matches
                });
            }
        }

        return this.deduplicateJornadas(results);
    }

    processJsonList(list) {
        const parsed = [];
        for (const item of list) {
            // Check if item looks like a jornada
            // Need keys like 'jornada', 'partidos' array, etc.
            if (item.jornada && item.partidos && Array.isArray(item.partidos)) {
                // Parse date (often in 'fecha_cierre' or similar)
                let dateObj = null;
                let dateStr = "F.Semana";
                if (item.fecha) {
                    dateObj = new Date(item.fecha);
                    dateStr = this.formatDate(dateObj);
                }

                // Parse matches
                const matches = [];
                // Sort by order just in case
                const sortedPartidos = item.partidos.sort((a, b) => (a.orden || 0) - (b.orden || 0));

                // Usually we need 15 matches.
                // item.partidos might contain objects with { local: "TeamA", visitante: "TeamB" }

                let position = 1;
                for (const p of sortedPartidos) {
                    if (position > 15) break;
                    matches.push({
                        home: this.cleanTeamName(p.local || p.equipo1 || ""),
                        away: this.cleanTeamName(p.visitante || p.equipo2 || ""),
                        result: ''
                    });
                    position++;
                }

                if (matches.length >= 14) { // Allow 14 associated with standard quiniela
                    // Ensure Pleno exists if missing? Usually 15 provided.
                    parsed.push({
                        number: parseInt(item.jornada),
                        dateStr: dateStr,
                        dateObj: dateObj,
                        matches: matches.slice(0, 15)
                    });
                }
            }
        }
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
            } else {
                // Try Pleno al 15 special format
                if (trimmed.startsWith('15 ') && !matches.find(m => m.position === 15)) {
                    // Fallback for "15 TEAM TEAM" if hyphen missing
                    // Heuristic: Last 2 words are teams? Dangerous.
                    // Let's rely on standard format for now.
                    // Sometimes "15 RAYO AT.MADRID" (no hyphen but specific string)
                    const parts = trimmed.substring(3).trim().split(/\s+/);
                    if (parts.length >= 2) {
                        // Assuming last word is away, rest is home?? Dictionary-based would be better.
                        // For now skip non-standard lines to avoid garbage.
                    }
                }
            }
        }

        // Remove duplicates and sort
        const unique = [];
        matches.forEach(m => {
            if (!unique.find(x => x.home === m.home && x.away === m.away)) unique.push(m);
        });

        return unique.slice(0, 15);
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
     * Confirmed strategy.
     */
    parseResultsFromHTML(html, jornadaNumber) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Find buttons with class "m-resultado"
        const resultBtns = Array.from(doc.querySelectorAll('.m-resultado'));

        if (resultBtns.length === 0) return null;

        console.log(`Found ${resultBtns.length} result buttons for J${jornadaNumber}`);

        const matches = [];

        // Pattern: id="1_1" -> first number is match index (1-based usually, check logic)
        // Wait, earlier inspection showed IDs like "1_1", "2_1", "3_0"... 
        // AND order in DOM usually follows match order.

        // Let's rely on data-casilla or text content
        // Also need to map to position 1-15.
        // We assume they appear in order 1..15

        // Filter unique matches (in case duplicates exist for UI reasons)
        // But usually it's one board per match.

        // Let's try to grab the parent row or just iterate
        // The previous analysis showed they are inside "c-detalle-partido-simple" or similar containers?
        // Actually, just taking the first 15 valid occurrences might work if the page structure is linear.

        // Better: Find the match containers to ensure order
        // The match name container: c-detalle-partido-simple__equipos__equipo__nombre

        // Let's stick to the simplest proven "salmon" class content for now
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
            // Often lists are "1. TeamA - TeamB" text
            // Try searching text content with regex
            const text = doc.body.textContent;
            const regex = new RegExp(`^\\s*${targetJornadaNum}\\s*[\\r\\n]+`, 'm'); // Find header "Jornada X"
            // This is hard on raw text.

            // Any table with "Partidos" class?
            // "tabla-partidos"?
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
        return name.trim()
            .replace(/\./g, '') // R.OVIEDO -> ROVIEDO (Maybe keep dots? No, user uses "Real Oviedo")
            // Actually, let's keep it simple, user can edit. 
            // Previous logic did normalization.
            .trim();
    }

    async applyResultsToJornada(dbJornada, importData) {
        let changed = false;

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
}

// Global Export for buttons
window.quinielaScraper = new QuinielaScraper();

// Mapear funciones antiguas a las nuevas
window.startRSSImport = () => window.quinielaScraper.startResultImport(); // "Importar Resultados"
window.startPDFImport = () => window.quinielaScraper.startMatchImport();  // "Importar Partidos"
