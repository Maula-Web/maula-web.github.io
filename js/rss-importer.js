/**
 * RSS Importer for Quiniela Results
 * Imports results from official RSS feed: https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS
 */

class RSSImporter {
    constructor() {
        this.RSS_URLS = [
            'https://servicios.elpais.com/sorteos/quiniela/',
            'https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS'
        ];
        this.jornadas = [];
        this.rssData = [];
    }

    /**
     * Initialize and load current jornadas from database
     */
    async init() {
        if (window.DataService) {
            await window.DataService.init();
            this.jornadas = await window.DataService.getAll('jornadas');
        }
    }

    /**
     * Fetch and parse RSS feed
     * Uses CORS proxies to avoid CORS issues
     */
    async fetchRSSFeed() {
        console.log('DEBUG: Starting RSS fetch process...');

        // 1. Try LOCAL CACHE first (GitHub Actions update)
        try {
            console.log('DEBUG: Trying local cache...');
            const localResponse = await fetch('datos_auxiliares/rss_cache.xml');
            if (localResponse.ok) {
                const text = await localResponse.text();
                // If it's HTML from El Pais or XML, it's fine
                if (text.trim().length > 100 && !text.includes('<!DOCTYPE html>')) {
                    // Note: GitHub script saves El Pais HTML as rss_cache.xml too
                }
                try {
                    const results = this.parseRSSXML(text);
                    console.log('DEBUG: Successfully parsed from local cache!');
                    return results;
                } catch (parseErr) {
                    console.warn('DEBUG: Local cache content failed parsing:', parseErr);
                }
            }
        } catch (err) {
            console.warn('DEBUG: Local cache fetch failed:', err);
        }

        const corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://thingproxy.freeboard.io/fetch/'
        ];

        // Try each URL with each proxy
        for (const url of this.RSS_URLS) {
            for (const proxy of corsProxies) {
                try {
                    console.log(`DEBUG: Trying URL ${url} via proxy ${proxy}...`);
                    const finalUrl = proxy + encodeURIComponent(url);

                    const response = await fetch(finalUrl, {
                        method: 'GET',
                        headers: { 'Accept': 'text/html,application/rss+xml,application/xml,text/xml,*/*' }
                    });

                    if (response.ok) {
                        const text = await response.text();
                        if (text.length > 500) {
                            try {
                                const results = this.parseRSSXML(text);
                                console.log('DEBUG: Successfully parsed from proxy!');
                                return results;
                            } catch (parseErr) {
                                console.warn(`DEBUG: Parse failed for ${url} via ${proxy}`);
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`DEBUG: Error with proxy ${proxy} for ${url}`);
                }
            }
        }

        console.log('DEBUG: All automatic methods failed. Falling back to manual paste.');
        return await this.showManualPasteDialog();
    }

    /**
     * Show dialog to manually paste XML content
     */
    async showManualPasteDialog() {
        return new Promise((resolve, reject) => {
            // Create OVERLAY first (which centers content)
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.id = 'manual-paste-overlay';

            // Create MODAL inside overlay
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px; margin: 0 auto;">
                    <h2 style="color: var(--primary-blue); margin-bottom: 1rem;">📋 Pegar Resultados Manualmente</h2>
                    <p style="margin-bottom: 1rem; color: #666;">
                        No se pudo acceder automáticamente a ninguna fuente (bloqueo de seguridad). Por favor, hazlo manualmente:
                    </p>
                    <ol style="text-align: left; margin-bottom: 1rem; color: #666; padding-left: 1.5rem;">
                        <li>Abre la web de resultados de <a href="https://servicios.elpais.com/sorteos/quiniela/" target="_blank" style="color: var(--primary-blue); font-weight: bold;">EL PAÍS pinchando aquí</a></li>
                        <li>Pulsa <strong>Ctrl+U</strong> (o haz clic derecho -> Ver código fuente)</li>
                        <li>Copia TODO el texto (Ctrl+A, Ctrl+C) y pégalo en el cuadro de abajo</li>
                    </ol>
                    <textarea id="manual-xml-input" style="width: 100%; height: 200px; font-family: monospace; font-size: 0.85rem; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;" placeholder="Pega aquí el contenido XML..." spellcheck="false"></textarea>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                        <button id="cancel-manual-paste" class="btn-secondary" style="padding: 0.75rem 1.5rem;">Cancelar</button>
                        <button id="confirm-manual-paste" class="btn-primary" style="padding: 0.75rem 1.5rem;">Continuar</button>
                    </div>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const cancelBtn = modal.querySelector('#cancel-manual-paste');
            const confirmBtn = modal.querySelector('#confirm-manual-paste');
            const textarea = modal.querySelector('#manual-xml-input');

            // Close function
            const close = () => {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            };

            cancelBtn.addEventListener('click', () => {
                close();
                reject(new Error('Importación cancelada por el usuario'));
            });

            confirmBtn.addEventListener('click', () => {
                const xmlText = textarea.value.trim();
                if (!xmlText) {
                    alert('Por favor, pega el contenido XML');
                    return;
                }
                close();
                try {
                    // Try to clean XML first if it seems to have browser artifacts
                    const cleanedXml = this.cleanXML(xmlText);
                    const results = this.parseRSSXML(cleanedXml);
                    resolve(results);
                } catch (err) {
                    console.error('Manual paste parse failed:', err);
                    reject(new Error('Error al parsear el XML: ' + err.message));
                }
            });

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    close();
                    reject(new Error('Importación cancelada por el usuario'));
                }
            });
        });
    }

    /**
     * Parse XML text and extract jornada results
     */
    parseRSSXML(xmlText) {
        console.log('DEBUG: Parsing XML/HTML content, length:', xmlText.length);

        // Check if it's El Pais HTML or standard RSS
        if (xmlText.includes('elpais.com') || xmlText.includes('cabecera_sorteo')) {
            console.log('DEBUG: Detected El Pais HTML format');
            return this.parseElPaisHTML(xmlText);
        }

        const parser = new DOMParser();
        let xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // Check for parsing errors
        let parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.warn('DEBUG: XML parsing error initially, trying to clean...', parserError.textContent);
            const cleaned = this.cleanXML(xmlText);
            xmlDoc = parser.parseFromString(cleaned, 'text/xml');
            parserError = xmlDoc.querySelector('parsererror');
        }

        if (parserError) {
            console.error('DEBUG: XML parsing error remains:', parserError.textContent);
            throw new Error('El XML no es válido. Asegúrate de copiar el código fuente (Ctrl+U) completo.');
        }

        const items = xmlDoc.querySelectorAll('item');
        console.log('DEBUG: Found', items.length, 'items in RSS');

        const results = [];

        items.forEach((item, index) => {
            const title = item.querySelector('title')?.textContent || '';
            const description = item.querySelector('description')?.textContent || '';

            console.log(`DEBUG: Item ${index + 1}:`, { title: title.substring(0, 100) });

            // Extract date from title: "La Quiniela: premios y ganadores del 21 de diciembre de 2025"
            const dateMatch = title.match(/del (\d{1,2}) de (\w+) de (\d{4})/);
            if (!dateMatch) {
                console.log(`DEBUG: Item ${index + 1}: No date match in title`);
                return;
            }

            const day = dateMatch[1];
            const monthName = dateMatch[2];
            const year = dateMatch[3];

            console.log(`DEBUG: Item ${index + 1}: Extracted date: ${day} ${monthName} ${year}`);

            // Parse matches from description
            const matches = this.parseMatches(description);
            console.log(`DEBUG: Item ${index + 1}: Found ${matches.length} matches`);

            if (matches.length === 0) {
                console.log(`DEBUG: Item ${index + 1}: Skipping - no matches found`);
                return;
            }

            // Parse Prize Info
            const prizeInfo = this.parsePrizeRates(description);

            results.push({
                date: `${day} ${monthName} ${year}`,
                matches: matches,
                minHitsToWin: prizeInfo.minHits,
                prizeRates: prizeInfo.rates,
                hasBote: prizeInfo.hasBote,
                rawDescription: description
            });
        });

        console.log('DEBUG: Total results parsed:', results.length);
        return results;
    }

    /**
     * Specialized parser for El Pais Results Page
     * Can handle multiple jornadas if they exist in the page
     */
    parseElPaisHTML(htmlText) {
        console.log('DEBUG: Parsing El Pais HTML...');
        const results = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // El Pais has multiple containers for draws. 
        // We look for any container that looks like a quiniela draw.
        const sections = doc.querySelectorAll('.bloque_sorteo, .caja_sorteo');

        const entries = sections.length > 0 ? Array.from(sections) : [doc.body];

        entries.forEach((section) => {
            // 1. Find Date
            const cabecera = section.querySelector('.cabecera_sorteo, h2, h3');
            let dateStr = "";
            if (cabecera) {
                const rawDate = cabecera.textContent.trim().toLowerCase();
                const dMatch = rawDate.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
                if (dMatch) dateStr = `${dMatch[1]} ${dMatch[2]} ${dMatch[3]}`;
            }

            if (!dateStr) return;

            // 2. Extract Matches
            const matches = [];
            const rows = section.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const posStr = cells[0].textContent.trim();
                    const teams = cells[1].textContent.trim();
                    const sign = cells[2].textContent.trim().toUpperCase();

                    const pos = posStr.includes('15') ? 15 : parseInt(posStr);
                    if (isNaN(pos)) return;

                    const teamParts = teams.split(/\s*-\s*/);
                    if (teamParts.length >= 2) {
                        matches.push({
                            position: pos,
                            home: teamParts[0].trim(),
                            away: teamParts[1].trim(),
                            result: sign
                        });
                    }
                }
            });

            // 3. Find Prizes (Optional)
            const prizeInfo = { minHits: 15, rates: {}, hasBote: section.textContent.toLowerCase().includes('bote') };
            const prizeRows = section.querySelectorAll('.tabla_premios tr');
            prizeRows.forEach(pRow => {
                const pCells = pRow.querySelectorAll('td');
                if (pCells.length >= 2) {
                    const catText = pCells[0].textContent;
                    const amountText = pCells[pCells.length - 1].textContent;

                    const hitsMatch = catText.match(/(\d{2})/);
                    const amountMatch = amountText.match(/([\d\.,]+)/);
                    if (hitsMatch && amountMatch) {
                        const hits = parseInt(hitsMatch[1]);
                        const val = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.'));
                        if (!isNaN(val) && val > 0) {
                            prizeInfo.rates[hits] = val;
                            if (hits < prizeInfo.minHits) prizeInfo.minHits = hits;
                        }
                    }
                }
            });

            if (matches.length >= 14) {
                results.push({
                    date: dateStr,
                    matches: matches.sort((a, b) => a.position - b.position),
                    minHitsToWin: prizeInfo.minHits,
                    prizeRates: prizeInfo.rates,
                    hasBote: prizeInfo.hasBote,
                    rawDescription: "Importado desde El Pais (Histórico)"
                });
            }
        });

        // Fallback for single draw page
        if (results.length === 0) {
            const rows = doc.querySelectorAll('tr');
            const matches = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const posStr = cells[0].textContent.trim();
                    const teams = cells[1].textContent.trim();
                    const sign = cells[2].textContent.trim().toUpperCase();
                    const pos = posStr.includes('15') ? 15 : parseInt(posStr);
                    if (!isNaN(pos)) {
                        const teamParts = teams.split(/\s*-\s*/);
                        if (teamParts.length >= 2) {
                            matches.push({ position: pos, home: teamParts[0].trim(), away: teamParts[1].trim(), result: sign });
                        }
                    }
                }
            });

            if (matches.length >= 14) {
                const dateEl = doc.querySelector('.cabecera_sorteo, h1, h2');
                let dateStr = "Fecha Desconocida";
                if (dateEl) {
                    const m = dateEl.textContent.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
                    if (m) dateStr = `${m[1]} ${m[2]} ${m[3]}`;
                }
                results.push({ date: dateStr, matches: matches.sort((a, b) => a.position - b.position), minHitsToWin: 10, prizeRates: {}, hasBote: htmlText.toLowerCase().includes('bote'), rawDescription: "Importado automático" });
            }
        }

        console.log(`DEBUG: El Pais Parser finished. Found ${results.length} jornadas.`);
        return results;
    }

    /**
     * Parse description to extract prize amounts for each category
     * Returns { minHits, rates: { "10": 1.5, "11": 5.2, ... } }
     */
    parsePrizeRates(description) {
        let minHits = 15;
        const rates = {};
        let hasBote = false;

        // Normalize
        const text = description.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

        // Check for explicit "Bote" mention
        if (text.toLowerCase().includes('bote') || text.toLowerCase().includes('jackpot')) {
            hasBote = true;
        }

        // 1. SPECIFIC FORMAT (User feedback): "5ª (10 Aciertos) 166.699 2,65 €"
        // Also captures: "Especial (Pleno al 15) 0 0,00 €"
        const specificRegex = /(\d+|Especial)\s*\((?:Pleno\s+al\s+15|(\d+)\s+Aciertos)\)\s+[\d\.,]+\s+([\d\.,]+)\s*(?:Euros|€)/gi;
        let sMatch;
        let foundSpecific = false;
        while ((sMatch = specificRegex.exec(text)) !== null) {
            const hits = sMatch[1] === 'Especial' ? 15 : parseInt(sMatch[2]);
            const prizeVal = parseFloat(sMatch[3].replace(/\./g, '').replace(',', '.'));

            if (!isNaN(hits) && !isNaN(prizeVal) && prizeVal > 0) {
                rates[hits] = prizeVal;
                if (hits < minHits) minHits = hits;
                foundSpecific = true;
            }
            if (hits === 15 && prizeVal === 0) hasBote = true;
        }

        // 2. FALLBACK: If specific matches didn't work, use the looser logic
        if (!foundSpecific) {
            const regexHits = /(\d{1,2})\s*Aciertos/gi;
            let mHits;
            while ((mHits = regexHits.exec(text)) !== null) {
                const hits = parseInt(mHits[1]);
                const searchSlice = text.substring(mHits.index, mHits.index + 200);
                const prizeMatch = searchSlice.match(/([\d\.,]+)\s*(?:Euros|€)/i);
                if (prizeMatch) {
                    const prizeVal = parseFloat(prizeMatch[1].replace(/\./g, '').replace(',', '.'));
                    if (hits >= 10 && hits <= 14 && !isNaN(prizeVal) && prizeVal > 0) {
                        rates[hits] = prizeVal;
                        if (hits < minHits) minHits = hits;
                    }
                }
            }
            const p15Marker = text.match(/(?:Pleno\s+al\s+15|P15)/i);
            if (p15Marker) {
                const searchSlice = text.substring(p15Marker.index, p15Marker.index + 200);
                const prizeMatch = searchSlice.match(/([\d\.,]+)\s*(?:Euros|€)/i);
                if (prizeMatch) {
                    const prizeVal = parseFloat(prizeMatch[1].replace(/\./g, '').replace(',', '.'));
                    if (!isNaN(prizeVal) && prizeVal > 0) {
                        rates[15] = prizeVal;
                        if (15 < minHits) minHits = 15;
                    }
                }
            }
        }

        // Final sanity check: if we have prize rates for 10 but minHits stayed 15
        if (rates[10] && minHits > 10) minHits = 10;

        console.log(`DEBUG: Parsed prize rates:`, rates, 'Has Bote:', hasBote, 'MinHits:', minHits);
        return { minHits, rates, hasBote };
    }

    /**
     * Parse match results from description text
     */
    parseMatches(description) {
        const matches = [];

        // Normalize description: replace <br/> or equivalents with newlines
        // If it's already text, it might have them as literal or spaces
        const normalizedDesc = description
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/&nbsp;/g, ' ');

        const lines = normalizedDesc.split('\n');

        // Pattern for a single match: "1 Team A - Team B 1"
        const singleMatchPattern = /^(Pleno al 15|\d{1,2})[^\w\s]*\s+(.+?)\s+-\s+(.+?)\s+([12XM]|M\s*-\s*\d+|\d+\s*-\s*\d+)\s*$/i;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            const match = trimmedLine.match(singleMatchPattern);

            if (match) {
                const position = match[1];
                const home = match[2].trim();
                const away = match[3].trim();
                let result = match[4].trim();

                // Normalize result format
                if (result.includes('-')) {
                    result = result.replace(/\s/g, '');
                }

                matches.push({
                    position: position === 'Pleno al 15' ? 15 : parseInt(position),
                    home: home,
                    away: away,
                    result: result
                });
            } else {
                // FALLBACK: If the line has multiple matches because newlines were lost
                // We look for patterns like "1 Team - Team X 2 Team - Team 1"
                // This regex is more complex as it needs to be global
                const globalPattern = /(Pleno al 15|\d{1,2})\s+([^-]+?)\s+-\s+(.+?)\s+([12XM]|M-\d+|\d+-\d+|M\s-\s\d+|\d\s-\s\d)(?=\s+(?:Pleno al 15|\d{1,2})|$)/gi;
                let gMatch;
                while ((gMatch = globalPattern.exec(trimmedLine)) !== null) {
                    const pos = gMatch[1];
                    const home = gMatch[2].trim();
                    const away = gMatch[3].trim();
                    let res = gMatch[4].trim();

                    if (res.includes('-')) res = res.replace(/\s/g, '');

                    // Avoid duplicates if already added by line split
                    const posNum = pos === 'Pleno al 15' ? 15 : parseInt(pos);
                    if (!matches.find(m => m.position === posNum)) {
                        matches.push({
                            position: posNum,
                            home: home,
                            away: away,
                            result: res
                        });
                    }
                }
            }
        }

        return matches.sort((a, b) => a.position - b.position);
    }

    /**
     * Clean XML from browser artifacts
     */
    cleanXML(xmlText) {
        if (!xmlText) return '';

        // 1. Remove browser +/- buttons (common if copied from rendered view)
        let cleaned = xmlText.replace(/^\s*[-+]\s*</gm, '<');

        // 2. Remove leading/trailing garbage
        cleaned = cleaned.trim();

        // 3. If it doesn't start with <, try to find the start
        if (cleaned[0] !== '<') {
            const startIdx = cleaned.indexOf('<');
            if (startIdx !== -1) cleaned = cleaned.substring(startIdx);
        }

        // 4. Basic entity fixes
        cleaned = cleaned.replace(/&nbsp;/g, ' ');

        return cleaned;
    }

    /**
     * Find jornadas that need results imported
     */
    async findJornadasToImport() {
        await this.init();
        const rssResults = await this.fetchRSSFeed();

        console.log('DEBUG: RSS Results:', rssResults.map(r => r.date));
        console.log('DEBUG: DB Jornadas:', this.jornadas.map(j => ({ num: j.number, date: j.date })));

        const toImport = [];

        for (const rssJornada of rssResults) {
            // Find matching jornada in database by date
            const dbJornada = this.findMatchingJornada(rssJornada.date);

            console.log(`DEBUG: RSS date "${rssJornada.date}" -> DB match:`, dbJornada ? `Jornada ${dbJornada.number}` : 'NO MATCH');

            if (dbJornada) {
                // WE SKIP re-importing if results are already complete (15/15)
                const completedCount = dbJornada.matches ? dbJornada.matches.filter(m => m.result && m.result.trim() !== '').length : 0;
                if (completedCount === 15) {
                    console.log(`DEBUG: Skipping J${dbJornada.number} - already has 15 results.`);
                    continue;
                }

                // Check if teams match (at least some of them)
                const teamsMatch = this.checkTeamsMatch(dbJornada, rssJornada);

                toImport.push({
                    jornadaId: dbJornada.id,
                    jornadaNumber: dbJornada.number,
                    jornadaDate: dbJornada.date,
                    rssDate: rssJornada.date,
                    rssMatches: rssJornada.matches,
                    dbMatches: JSON.parse(JSON.stringify(dbJornada.matches)),
                    minHitsToWin: rssJornada.minHitsToWin,
                    prizeRates: rssJornada.prizeRates,
                    hasBote: rssJornada.hasBote,
                    teamsMatch: teamsMatch,
                    confidence: teamsMatch ? 'high' : 'low'
                });
            }
        }

        return toImport;
    }

    /**
     * Find matching jornada in database by date
     */
    findMatchingJornada(rssDateStr) {
        // Parse RSS date: "21 diciembre 2025"
        const rssDate = AppUtils.parseDate(rssDateStr);

        if (!rssDate) {
            console.log(`DEBUG: Could not parse RSS date: "${rssDateStr}"`);
            return null;
        }

        console.log(`DEBUG: Parsed RSS date "${rssDateStr}" -> ${rssDate.toDateString()}`);

        // Improved Matching: Date +/- 2 days AND team check
        for (const jornada of this.jornadas) {
            const jornadaDate = AppUtils.parseDate(jornada.date);
            if (jornadaDate) {
                const diffDays = Math.abs(rssDate - jornadaDate) / (1000 * 60 * 60 * 24);

                // If same day, high confidence
                if (diffDays === 0) return jornada;

                // If within 2 days, only match if it's the closest one or we have no other
                // But let's actually let findJornadasToImport handle the team check
                if (diffDays <= 2.1) {
                    return jornada;
                }
            }
        }

        console.log(`DEBUG: ✗ NO MATCH for RSS date "${rssDateStr}"`);
        return null;
    }

    /**
     * Check if two dates are the same day
     */
    isSameDate(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    }

    /**
     * Check if teams in RSS match teams in database
     */
    checkTeamsMatch(dbJornada, rssJornada) {
        if (!dbJornada.matches || dbJornada.matches.length === 0) return false;
        if (!rssJornada.matches || rssJornada.matches.length === 0) return false;

        let matchCount = 0;
        const totalMatches = Math.min(dbJornada.matches.length, rssJornada.matches.length);

        for (let i = 0; i < totalMatches; i++) {
            const dbMatch = dbJornada.matches[i];
            const rssMatch = rssJornada.matches[i];

            if (AppUtils.normalizeName(dbMatch.home) === AppUtils.normalizeName(rssMatch.home) &&
                AppUtils.normalizeName(dbMatch.away) === AppUtils.normalizeName(rssMatch.away)) {
                matchCount++;
            }
        }

        // Consider it a match if at least 70% of teams match
        return (matchCount / totalMatches) >= 0.7;
    }

    /**
     * Import results into database
     */
    async importResults(importData) {
        const imported = [];

        for (const item of importData) {
            const jornada = this.jornadas.find(j => j.id === item.jornadaId);
            if (!jornada) continue;

            // Update matches with results
            for (let i = 0; i < Math.min(jornada.matches.length, item.rssMatches.length); i++) {
                if (jornada.matches[i]) {
                    jornada.matches[i].result = item.rssMatches[i].result;
                }
            }

            // Update minimum hits and rates if available
            if (item.minHitsToWin) jornada.minHitsToWin = item.minHitsToWin;
            if (item.prizeRates) jornada.prizeRates = item.prizeRates;
            if (item.hasBote !== undefined) jornada.hasBote = item.hasBote;

            // Save to database
            if (window.DataService) {
                await window.DataService.save('jornadas', jornada);
            }

            // TELEGRAM REPORT TRIGGER (only if Jornada was NOT finished before and IS finished now)
            const wasFinished = item.dbMatches && item.dbMatches.length === 15 && item.dbMatches.every(m => m.result && m.result.trim() !== '');
            const isFinishedNow = jornada.matches && jornada.matches.length === 15 && jornada.matches.every(m => m.result && m.result.trim() !== '');

            if (!wasFinished && isFinishedNow && window.TelegramService) {
                try {
                    await window.TelegramService.sendJornadaReport(jornada.id);
                    console.log(`DEBUG: Telegram report sent for J${jornada.number}`);
                } catch (tgErr) {
                    console.warn(`DEBUG: Failed to send Telegram report for J${jornada.number}:`, tgErr);
                }
            }

            imported.push({
                jornadaNumber: jornada.number,
                jornadaDate: jornada.date
            });
        }

        return imported;
    }

    /**
     * Show import confirmation modal
     */
    async showImportModal() {
        // Show loading indicator
        const loadingOverlay = this.showLoadingModal();

        try {
            const toImport = await this.findJornadasToImport();

            // Hide loading indicator
            loadingOverlay.remove();

            if (toImport.length === 0) {
                // Show debug info
                console.log('DEBUG: Jornadas en BD:', this.jornadas.map(j => ({
                    number: j.number,
                    date: j.date,
                    hasResults: j.matches && j.matches.some(m => m.result && m.result !== '')
                })));

                alert('✅ Todas las jornadas ya tienen resultados importados.\n\nNo hay nada que importar.\n\n(Revisa la consola del navegador para ver detalles de debug)');
                return;
            }

            // Create modal
            const modalOverlay = this.createImportModal(toImport);
            document.body.appendChild(modalOverlay);

            // Show modal (fade in)
            // Small delay to allow element to be added to DOM before adding 'active' class
            requestAnimationFrame(() => {
                setTimeout(() => modalOverlay.classList.add('active'), 10);
            });

        } catch (error) {
            // Hide loading indicator if still visible
            if (loadingOverlay && loadingOverlay.parentNode) {
                loadingOverlay.remove();
            }

            console.error('Error in import process:', error);
            // Don't alert if it was a manual cancellation
            if (error.message !== 'Importación cancelada por el usuario') {
                alert('❌ Error al cargar los resultados del RSS:\n\n' + error.message);
            }
        }
    }

    /**
     * Show loading modal
     */
    showLoadingModal() {
        // Create OVERLAY first
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.id = 'loading-overlay';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex'; // Enforce flex

        // Create modal inside
        const modal = document.createElement('div');
        modal.className = 'modal';
        // Override modal styles to be smaller and centered
        modal.style.maxWidth = '400px';
        modal.style.textAlign = 'center';
        modal.style.padding = '2rem';
        modal.style.margin = '0 auto'; // Ensure centering

        modal.innerHTML = `
            <div class="modal-content">
                <div style="font-size: 3rem; margin-bottom: 1rem; animation: spin 1s linear infinite;">⏳</div>
                <h3 style="color: var(--primary-blue); margin-bottom: 0.5rem;">Cargando resultados...</h3>
                <p style="color: #666; font-size: 0.9rem;">Descargando y procesando el feed RSS</p>
            </div>
            <style>
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * Create import confirmation modal
     */
    createImportModal(toImport) {
        // Create OVERLAY first
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'import-overlay';

        // Create MODAL inside
        const modal = document.createElement('div');
        modal.className = 'modal';

        let itemsHTML = '';
        toImport.forEach(item => {
            const confidenceBadge = item.confidence === 'high'
                ? '<span style="color: #2e7d32; font-weight: bold;">✓ Equipos coinciden</span>'
                : '<span style="color: #f57f17; font-weight: bold;">⚠ Verificar equipos</span>';

            itemsHTML += `
                <div style="border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; background: #f9f9f9;">
                    <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--primary-blue);">
                        Jornada ${item.jornadaNumber} - ${item.jornadaDate}
                    </div>
                    <div style="margin-bottom: 0.5rem;">${confidenceBadge}</div>
                    <div style="font-size: 0.9rem; color: #666;">
                        <strong>Resultados a importar:</strong> ${item.rssMatches.length} partidos
                    </div>
                    <details style="margin-top: 0.5rem;">
                        <summary style="cursor: pointer; color: var(--primary-blue);">Ver detalles</summary>
                        <div style="margin-top: 0.5rem; font-size: 0.85rem; max-height: 200px; overflow-y: auto;">
                            ${item.rssMatches.map((m, idx) => `
                                <div style="padding: 0.25rem 0; border-bottom: 1px solid #eee;">
                                    <strong>${m.position === 15 ? 'P15' : m.position}.</strong> 
                                    ${m.home} - ${m.away} 
                                    <span style="color: var(--primary-green); font-weight: bold;">${m.result}</span>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 2px solid var(--primary-blue); padding-bottom: 1rem;">
                    <h2 style="margin: 0; color: var(--primary-blue);">📥 Importar Resultados desde RSS</h2>
                    <button id="close-import-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #999;">✕</button>
                </div>

                <div style="background: #fff3e0; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #f57f17;">
                    <strong>📋 Se importarán resultados para ${toImport.length} jornada${toImport.length > 1 ? 's' : ''}:</strong>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    ${itemsHTML}
                </div>

                <div style="display: flex; gap: 1rem; justify-content: flex-end; border-top: 1px solid #ddd; padding-top: 1rem;">
                    <button id="cancel-import" class="btn-secondary" style="padding: 0.75rem 1.5rem;">
                        Cancelar
                    </button>
                    <button id="confirm-import" class="btn-primary" style="padding: 0.75rem 1.5rem; background: var(--primary-green);">
                        ✓ Confirmar Importación
                    </button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);

        // Event listeners
        const closeBtn = modal.querySelector('#close-import-modal');
        const cancelBtn = modal.querySelector('#cancel-import');
        const confirmBtn = modal.querySelector('#confirm-import');

        const closeModal = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '⏳ Importando...';

            try {
                const imported = await this.importResults(toImport);
                closeModal();

                alert(`✅ Importación completada con éxito!\n\nSe importaron resultados para ${imported.length} jornada${imported.length > 1 ? 's' : ''}:\n\n${imported.map(i => `• Jornada ${i.jornadaNumber} (${i.jornadaDate})`).join('\n')}`);

                // Reload page to show updated data
                window.location.reload();
            } catch (error) {
                console.error('Error importing results:', error);
                alert('❌ Error al importar resultados:\n\n' + error.message);
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '✓ Confirmar Importación';
            }
        });

        // Close on background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        return overlay;
    }
}

// Create global instance
window.RSSImporter = new RSSImporter();

// Add button to trigger import (can be called from HTML)
window.startRSSImport = async function () {
    await window.RSSImporter.showImportModal();
};
