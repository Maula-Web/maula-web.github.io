/**
 * RSS Importer for Quiniela Results
 * Imports results from official RSS feed: https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS
 */

class RSSImporter {
    constructor() {
        this.RSS_URL = 'https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS';
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

        const corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?'
        ];

        // Try each proxy
        for (const proxy of corsProxies) {
            try {
                console.log(`DEBUG: Trying proxy ${proxy}...`);
                const url = proxy + encodeURIComponent(this.RSS_URL);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
                });

                if (response.ok) {
                    const text = await response.text();
                    console.log(`DEBUG: Proxy ${proxy} returned ${text.length} chars.`);

                    // VALIDATION: Check if it looks like XML/RSS and NOT HTML error page
                    if (text.trim().startsWith('<') &&
                        !text.toLowerCase().includes('<!doctype html>') &&
                        !text.toLowerCase().includes('<html')) {

                        try {
                            // Try parsing immediately to validate structure
                            const results = this.parseRSSXML(text);
                            console.log('DEBUG: Successfully parsed RSS from proxy!');
                            return results;
                        } catch (parseErr) {
                            console.warn(`DEBUG: Proxy ${proxy} content failed parsing:`, parseErr);
                            // If parsing fails here, we continue to next proxy
                        }
                    } else {
                        console.warn(`DEBUG: Proxy ${proxy} returned HTML/Invalid content (likely blocked/error page).`);
                    }
                }
            } catch (err) {
                console.warn(`DEBUG: Proxy ${proxy} network/fetch error:`, err);
            }
        }

        // Try direct fetch fallback
        try {
            console.log('DEBUG: Trying direct fetch...');
            const response = await fetch(this.RSS_URL);
            if (response.ok) {
                const text = await response.text();
                // Basic validation
                if (text.trim().startsWith('<') && !text.includes('<!DOCTYPE html>')) {
                    try {
                        return this.parseRSSXML(text);
                    } catch (e) { console.warn('Direct fetch parse fail', e); }
                }
            }
        } catch (err) {
            console.warn('DEBUG: Direct fetch failed:', err);
        }

        console.log('DEBUG: All automatic methods failed. Falling back to manual paste.');
        // If we reach here, ALL automatic methods failed.
        // Return manual dialog result directly.
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
                    <h2 style="color: var(--primary-blue); margin-bottom: 1rem;">📋 Pegar XML del RSS</h2>
                    <p style="margin-bottom: 1rem; color: #666;">
                        No se pudo acceder automáticamente al feed RSS (posible bloqueo de seguridad). Por favor, sigue estos pasos:
                    </p>
                    <ol style="text-align: left; margin-bottom: 1rem; color: #666; padding-left: 1.5rem;">
                        <li>Abre <a href="${this.RSS_URL}" target="_blank" style="color: var(--primary-blue);">este enlace</a> en una nueva pestaña</li>
                        <li>Copia todo el contenido XML (Ctrl+A, Ctrl+C)</li>
                        <li>Pégalo en el área de texto a continuación</li>
                    </ol>
                    <textarea id="manual-xml-input" style="width: 100%; height: 200px; font-family: monospace; font-size: 0.85rem; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;" placeholder="Pega aquí el contenido XML..."></textarea>
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
                    const results = this.parseRSSXML(xmlText);
                    resolve(results);
                } catch (err) {
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
        console.log('DEBUG: Parsing XML, length:', xmlText.length);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // Check for parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('DEBUG: XML parsing error:', parserError.textContent);
            throw new Error('Error al parsear el XML del RSS');
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
                rawDescription: description
            });
        });

        console.log('DEBUG: Total results parsed:', results.length);

        return results;
    }

    /**
     * Parse description to extract prize amounts for each category
     * Returns { minHits, rates: { "10": 1.5, "11": 5.2, ... } }
     */
    parsePrizeRates(description) {
        let minHits = 15;
        const rates = {};

        // Normalize
        const text = description.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

        // 1. Standard categories (10 to 14 hits)
        // Format: "1ª (14 Aciertos) 1 793.436,76 €"
        // We match "XX Aciertos", then anything that isn't a Euro symbol, 
        // and capture the last numeric-looking group before the currency.
        const regexHits = /(\d{1,2})\s*Aciertos\)[^€E]*?\s+([\d\.,]+)\s*(?:Euros|€)/gi;
        let match;
        while ((match = regexHits.exec(text)) !== null) {
            const hits = parseInt(match[1]);
            const prizeVal = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
            if (prizeVal > 0) {
                rates[hits] = prizeVal;
                if (hits < minHits) minHits = hits;
            }
        }

        // 2. Pleno al 15
        // Format: "Pleno al 15 0 0,00 €"
        const regexP15 = /Pleno\s+al\s+15[^€E]*?\s+([\d\.,]+)\s*(?:Euros|€)/gi;
        const matchP15 = regexP15.exec(text);
        if (matchP15) {
            const prizeVal = parseFloat(matchP15[1].replace(/\./g, '').replace(',', '.'));
            if (prizeVal > 0) rates[15] = prizeVal;
        }

        console.log(`DEBUG: Parsed prize rates:`, rates);
        return { minHits, rates };
    }

    /**
     * Parse match results from description text
     */
    parseMatches(description) {
        const matches = [];
        const lines = description.split('\n');

        for (const line of lines) {
            // Match pattern: "1 Team A - Team B X" or "Pleno al 15 Team A - Team B 1 - 2"
            const matchPattern = /^(\d{1,2}|Pleno al 15)\s+(.+?)\s+-\s+(.+?)\s+([12XM]|M\s*-\s*\d+|\d+\s*-\s*\d+)\s*$/;
            const match = line.trim().match(matchPattern);

            if (match) {
                const position = match[1];
                const home = match[2].trim();
                const away = match[3].trim();
                let result = match[4].trim();

                // Normalize result format
                if (result.includes('-')) {
                    // It's a score like "1 - 2" or "M - 0"
                    result = result.replace(/\s/g, ''); // Remove spaces: "1-2" or "M-0"
                }

                matches.push({
                    position: position === 'Pleno al 15' ? 15 : parseInt(position),
                    home: home,
                    away: away,
                    result: result
                });
            }
        }

        return matches.sort((a, b) => a.position - b.position);
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
                // Check if results or prize info are already filled
                const hasResults = dbJornada.matches && dbJornada.matches.some(m => m.result && m.result !== '');
                const hasPrizeInfo = dbJornada.prizeRates && Object.keys(dbJornada.prizeRates).length > 0;

                // We import if it doesn't have results OR if it doesn't have complete prize info yet
                if (!hasResults || !hasPrizeInfo) {
                    // Check if teams match (at least some of them)
                    const teamsMatch = this.checkTeamsMatch(dbJornada, rssJornada);

                    toImport.push({
                        jornadaId: dbJornada.id,
                        jornadaNumber: dbJornada.number,
                        jornadaDate: dbJornada.date,
                        rssDate: rssJornada.date,
                        rssMatches: rssJornada.matches,
                        dbMatches: dbJornada.matches,
                        minHitsToWin: rssJornada.minHitsToWin,
                        prizeRates: rssJornada.prizeRates,
                        teamsMatch: teamsMatch,
                        confidence: teamsMatch ? 'high' : 'low'
                    });
                }
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

            // Save to database
            if (window.DataService) {
                await window.DataService.save('jornadas', jornada);
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
