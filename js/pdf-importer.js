/**
 * PDF Importer for Quiniela Jornadas
 * Imports upcoming jornadas from official PDF: https://www.loteriasyapuestas.es/f/loterias/documentos/Quiniela/Calendarios/Proximas_jornadas_deportivas.pdf
 * Uses PDF.js to parse the document client-side.
 */

class PDFImporter {
    constructor() {
        this.PDF_URL = 'https://www.loteriasyapuestas.es/f/loterias/documentos/Quiniela/Calendarios/Proximas_jornadas_deportivas.pdf';
        this.jornadas = []; // Existing DB jornadas
    }

    async init() {
        if (window.DataService) {
            await window.DataService.init();
            this.jornadas = await window.DataService.getAll('jornadas');
        }
    }

    /**
     * Entry point: Start the import process
     */
    async startImport() {
        const loadingOverlay = this.showLoadingModal();

        try {
            await this.init();

            // 1. Fetch PDF Data (via Proxy)
            const pdfData = await this.fetchPDF();

            // 2. Parse PDF Text
            const extractedJornadas = await this.parsePDF(pdfData);

            // 3. Filter & Process Data
            const toImport = this.processExtractedData(extractedJornadas);

            // 4. Verification Check
            if (toImport.length === 0) {
                loadingOverlay.remove();
                alert('No se encontraron jornadas nuevas válidas en el PDF.\n\nRecuerda: Solo se importan jornadas de DOMINGO con partidos de 1ª LaLiga EA.');
                return;
            }

            // 5. Show Confirmation
            loadingOverlay.remove();
            this.showConfirmationModal(toImport);

        } catch (err) {
            loadingOverlay.remove();
            console.error('PDF Import Error:', err);

            if (err.message === 'ManualPaste') {
                // Fallback to manual if implemented, or just error
                alert('No se pudo acceder al PDF automáticamente. Inténtalo más tarde.');
            } else {
                alert('Error en la importación PDF:\n' + err.message);
            }
        }
    }

    /**
     * Fetch PDF ArrayBuffer using CORS Proxy
     */
    async fetchPDF() {
        console.log('DEBUG: Fetching PDF...');

        // List of proxies to try
        const proxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url='
        ];

        for (const proxy of proxies) {
            try {
                const url = proxy + encodeURIComponent(this.PDF_URL);
                const response = await fetch(url);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    if (buffer.byteLength > 100) {
                        return buffer;
                    }
                }
            } catch (e) {
                console.warn('Proxy try failed:', e);
            }
        }

        throw new Error('No se pudo descargar el PDF (Bloqueo CORS/Red).');
    }

    /**
     * Parse PDF ArrayBuffer using PDF.js
     */
    isDateString(str) {
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const low = str.toLowerCase();
        return months.some(m => low.includes(m));
    }

    processExtractedData(jornadasRaw) {
        const valid = [];

        jornadasRaw.forEach(j => {
            const firstDivTeams = ['real madrid', 'barcelona', 'atlético', 'at. madrid', 'sevilla', 'betis', 'real sociedad', 'athletic', 'valencia', 'villarreal', 'girona', 'osasuna', 'celta', 'mallorca', 'rayo', 'getafe', 'alavés', 'palmas', 'leganés', 'espanyol', 'valladolid', 'las palmas', 'leganes', 'bilbao'];

            let firstDivCount = 0;
            j.matches.forEach(m => {
                const h = m.home.toLowerCase();
                const a = m.away.toLowerCase();
                // Check if any part of the name matches known team keywords
                if (firstDivTeams.some(t => h.includes(t) || a.includes(t))) firstDivCount++;
            });

            // If at least 3 matches involve 1st div teams, it's likely a La Liga journey.
            if (firstDivCount < 3) return;

            // Clean Date
            const dateClean = j.date.replace(/[\n\r]+/g, ' ').trim();

            valid.push({
                number: j.number,
                date: dateClean,
                matches: j.matches.slice(0, 15), // Ensure max 15
                season: '2025-2026'
            });
        });

        return valid;
    }

    async parsePDF(arrayBuffer) {
        // Set worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let extracted = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Join all strings with a space to create a big text blob
            // This handles cases where "Team" "-" "Team" are split tokens
            const rawText = textContent.items.map(item => item.str).join(' '); // "Jornada 32 ... 1. Celta - Valencia ..."

            // 1. Find Jornada Number
            const jornadaMatch = rawText.match(/Jornada\s+(\d+)/i);
            if (!jornadaMatch) continue;

            const number = parseInt(jornadaMatch[1]);

            // 2. Find Date (Heuristic: Look for date pattern in the first 500 chars)
            // Pattern: "3-4 de enero" or "07 diciembre"
            const headerText = rawText.substring(0, 1000);
            const dateMatch = headerText.match(/(\d{1,2}(?:[-–]\d{1,2})?\s+de\s+[a-z]+(?:\s+de\s+\d{4})?)/i);
            const dateVal = dateMatch ? dateMatch[1] : "Por definir";

            // 3. Find Matches
            const matches = [];

            // We look for 1 to 15
            for (let m = 1; m <= 15; m++) {
                // REGEX FIX: Use non-greedy capture and lookahead for the next match number or P15 keyword
                // This prevents capturing "Team A - Team B 2 Team C - Team D" as a single match.
                const lineRegex = new RegExp(`(?:^|\\s)${m}[.,]?\\s+([^\\n\\r-]+?)\\s*[-–]\\s+([^\\n\\r]+?)(?=\\s+\\d{1,2}[.,]?\\s|\\s+P15|\\s+Pleno|\\s+Partido|$)`, 'i');

                const found = rawText.match(lineRegex);
                if (found) {
                    let home = found[1].trim();
                    let away = found[2].trim();

                    // Cleanup: remove any leading numbers if captured by mistake 
                    home = home.replace(/^\d+[.,]\s*/, '');

                    // Basic noise filter
                    if (home.length > 1 && away.length > 1 && !AppUtils.isDateString(home)) {
                        if (!matches.some(existing => existing.position === m)) {
                            matches.push({ position: m, home, away, result: '' });
                        }
                    }
                }
            }

            // Fallback for Pleno al 15 (if named "PLENO AL 15" without "15" number)
            if (!matches.some(m => m.position === 15)) {
                // Use the same lookahead logic for safety
                const p15Regex = /(?:Pleno al 15|P15|Partido 15)\s*[:.-]?\s*([^\n\r-]+?)\s*[-–]\s*([^\n\r]+?)(?=\s+\d{1,2}[.,]?\s|$)/i;
                const p15Found = rawText.match(p15Regex);
                if (p15Found) {
                    let pHome = p15Found[1].trim();
                    let pAway = p15Found[2].trim().split(/\s+Jornada/i)[0].split(/\r?\n/)[0].trim();
                    matches.push({ position: 15, home: pHome, away: pAway, result: '' });
                }
            }

            if (matches.length >= 10) {
                extracted.push({
                    number: number,
                    date: dateVal,
                    matches: matches.sort((a, b) => a.position - b.position),
                    isLaLiga: /LaLiga|Primera/i.test(rawText)
                });
            }
        }

        return extracted;
    }

    // ... helpers ...

    showLoadingModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal" style="max-width:300px; text-align:center;">
                <div style="font-size:2rem; margin-bottom:1rem;">⏳</div>
                <h3>Analizando PDF...</h3>
                <p>Descargando y extrayendo datos...</p>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    showConfirmationModal(jornadas) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';

        let html = `
            <div class="modal" style="max-width:600px; background:var(--import-modal-bg, #ffffff); color:var(--import-modal-text, #1b1b1b);">
                <h2 style="color:var(--import-modal-title, var(--primary-blue)); border-bottom:1px solid rgba(0,0,0,0.1); padding-bottom:0.5rem;">📥 Importar Jornadas PDF</h2>
                <div style="max-height:400px; overflow-y:auto; margin:1rem 0; padding-right:5px;">
        `;

        jornadas.forEach(j => {
            html += `
                <div style="padding:1rem; background:var(--import-modal-card-bg, #f5f5f5); color:var(--import-modal-card-text, #333); margin-bottom:0.8rem; border-radius:8px; border:1px solid rgba(0,0,0,0.05);">
                    <strong style="font-size:1.1rem;">Jornada ${j.number}</strong> <span style="opacity:0.8">(${j.date})</span>
                    <div style="font-size:0.9rem; margin-top:0.5rem; line-height:1.4;">
                        ${j.matches.map((m, i) => `<span style="opacity:0.6; font-weight:bold; width:20px; display:inline-block;">${i + 1}.</span> ${m.home} - ${m.away}`).join('<br>')}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:1rem; padding-bottom:1rem;">
                    <button class="btn-action" style="background:#ccc; color:#333;" id="btn-cancel-pdf">Cancelar</button>
                    <button class="btn-action btn-add" id="btn-confirm-pdf">Confirmar e Importar</button>
                </div>
            </div>
        `;

        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden'; // Lock scroll

        overlay.querySelector('#btn-cancel-pdf').onclick = () => {
            overlay.remove();
            document.body.style.overflow = ''; // Unlock scroll
        };
        overlay.querySelector('#btn-confirm-pdf').onclick = async () => {
            await this.importToDB(jornadas);
            overlay.remove();
            document.body.style.overflow = ''; // Unlock scroll
            window.location.reload();
        };
    }

    async importToDB(newJornadas) {
        for (const nj of newJornadas) {
            // Check existence
            const existing = this.jornadas.find(j => j.number === nj.number && j.season === nj.season);

            // 1. Date Logic
            let finalDate = nj.date;
            if (existing && existing.date && existing.date !== 'Por definir') {
                finalDate = existing.date; // Keep existing date if valid
            }
            // Note: date is already cleaned in processExtractedData via AppUtils.extractSundayFromRange

            const finalJornada = {
                id: existing ? existing.id : Date.now() + nj.number,
                number: nj.number,
                season: nj.season,
                date: finalDate,
                matches: nj.matches.map(m => ({ home: m.home, away: m.away, result: '' })),
                active: true
            };

            await window.DataService.save('jornadas', finalJornada);
        }
        alert('Jornadas importadas correctamente.');
    }

    processExtractedData(jornadasRaw) {
        const valid = [];

        jornadasRaw.forEach(j => {
            let firstDivCount = 0;
            j.matches.forEach(m => {
                // Formatting via Utils
                m.home = AppUtils.formatTeamName(m.home);
                m.away = AppUtils.formatTeamName(m.away);

                if (AppUtils.isLaLigaTeam(m.home) || AppUtils.isLaLigaTeam(m.away)) {
                    firstDivCount++;
                }
            });

            // If at least 3 matches involve 1st div teams, it's likely a La Liga journey.
            if (firstDivCount < 3) return;

            // Date Cleaning
            let dateClean = j.date.replace(/[\n\r]+/g, ' ').trim();
            dateClean = AppUtils.extractSundayFromRange(dateClean);

            valid.push({
                number: j.number,
                date: dateClean,
                matches: j.matches.slice(0, 15), // Ensure max 15
                season: '2025-2026'
            });
        });

        return valid;
    }

}

window.PDFImporter = new PDFImporter();
window.startPDFImport = () => window.PDFImporter.startImport();
