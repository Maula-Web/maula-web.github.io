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
            // We look for patterns like: "1. Home - Away" or "1 Home - Away"
            // The regex needs to be flexible with spaces and dots.
            // We expect 14 or 15 matches.

            const matches = [];
            // Regex to capture: Number + dot(opt) + Home + hyphen + Away
            // Excluding lines that look like dates or titles.
            // Note: Team names allow letters, spaces, dots.
            const matchRegex = /(?:^|\s)(\d{1,2})[.,]?\s+([A-Za-zñÑáéíóúÁÉÍÓÚ\s.]+?)\s*[-–]\s*([A-Za-zñÑáéíóúÁÉÍÓÚ\s.]+?)(?=\s\d+[.,]|\sP15|\sPleno|$)/gi;

            // We can strictly look for 1 to 14
            for (let m = 1; m <= 14; m++) {
                // Specific regex for each number to avoid ordering issues
                // " 1. Celta - Valencia "
                const lineRegex = new RegExp(`(?:^|\\s)${m}[.,]?\\s+([A-Za-zñÑáéíóúÁÉÍÓÚ\\s.]+(?:\\s+[A-Za-zñÑáéíóúÁÉÍÓÚ]+)*?)\\s*[-–]\\s*([A-Za-zñÑáéíóúÁÉÍÓÚ\\s.]+(?:\\s+[A-Za-zñÑáéíóúÁÉÍÓÚ]+)*)`, 'i');

                const found = rawText.match(lineRegex);
                if (found) {
                    let home = found[1].trim();
                    let away = found[2].trim();

                    // Cleanup known artifacts
                    home = home.replace(/^\d+[.,]\s*/, '');

                    // Apply name normalization
                    home = this.fixTeamName(home);
                    away = this.fixTeamName(away);

                    // Validate length to avoid noise
                    if (home.length > 2 && away.length > 2 && !this.isDateString(home)) {
                        matches.push({ position: m, home, away, result: '' });
                    }
                }
            }

            // Pleno al 15
            const p15Regex = /(?:Pleno al 15|P15)\s*([A-Za-zñÑáéíóúÁÉÍÓÚ\s.]+?)\s*[-–]\s*([A-Za-zñÑáéíóúÁÉÍÓÚ\s.]+)/i;
            const p15Found = rawText.match(p15Regex);
            if (p15Found) {
                let pHome = this.fixTeamName(p15Found[1]);
                let pAway = this.fixTeamName(p15Found[2]);

                // Specific cleanup for P15 "Jornada" artifacts mentioned by user
                // Often 'Jornada' appears at end of Away team in P15 because it's next block
                pAway = pAway.replace(/\s*Jornada.*$/i, '');

                matches.push({ position: 15, home: pHome, away: pAway, result: '' });
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
            <div class="modal" style="max-width:600px;">
                <h2 style="color:var(--primary-blue); border-bottom:1px solid #eee; padding-bottom:0.5rem;">📥 Importar Jornadas PDF</h2>
                <div style="max-height:300px; overflow-y:auto; margin:1rem 0;">
        `;

        jornadas.forEach(j => {
            html += `
                <div style="padding:0.5rem; background:#f5f5f5; margin-bottom:0.5rem; border-radius:4px;">
                    <strong>Jornada ${j.number}</strong> (${j.date})
                    <div style="font-size:0.8rem; margin-top:0.3rem;">
                        ${j.matches.map((m, i) => `${i + 1}. ${m.home} - ${m.away}`).join('<br>')}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn-action" style="background:#ccc; color:#333;" id="btn-cancel-pdf">Cancelar</button>
                    <button class="btn-action btn-add" id="btn-confirm-pdf">Confirmar e Importar</button>
                </div>
            </div>
        `;

        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#btn-cancel-pdf').onclick = () => overlay.remove();
        overlay.querySelector('#btn-confirm-pdf').onclick = async () => {
            await this.importToDB(jornadas);
            overlay.remove();
            window.location.reload();
        };
    }

    async importToDB(newJornadas) {
        for (const nj of newJornadas) {
            // Check existence
            const existing = this.jornadas.find(j => j.number === nj.number && j.season === nj.season);

            // 1. Date Logic
            let finalDate = nj.date; // Default to PDF date
            if (existing && existing.date && existing.date !== 'Por definir') {
                finalDate = existing.date; // Keep existing date if valid
            } else {
                // Try to correct date to Sunday if it looks like a range "3-4" or "27-28"
                finalDate = this.ensureSundayDate(nj.date);
            }

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

    ensureSundayDate(dateStr) {
        // Simple heuristic: if date has range like "3-4 de enero", pick the second one (usually Sunday)
        if (dateStr.match(/\d+[-–]\d+/)) {
            // It's a range. Usually Sat-Sun or Tue-Wed. 
            // If Sat-Sun, the second number is Sunday.
            // Transform "3-4 de enero" -> "4 de enero"
            // Transform "27-28 de diciembre" -> "28 de diciembre"

            return dateStr.replace(/(\d+)[-–](\d+)/, '$2');
        }
        return dateStr;
    }

    fixTeamName(name) {
        if (!name) return '';
        // Lowercase first
        let fixed = name.toLowerCase().trim();

        // Remove trailing " P" or " Jornada" artifacts (specific req 2 & 3)
        // These often appear when PDF text capture overruns
        fixed = fixed.replace(/\s+p$/, '').replace(/\s+jornada$/, '');

        // Capitalize each word, respecting dots
        // "at. madrid" -> "At. Madrid"
        return fixed.replace(/(?:^|\s|\.)\S/g, function (a) { return a.toUpperCase(); });
    }

}

window.PDFImporter = new PDFImporter();
window.startPDFImport = () => window.PDFImporter.startImport();
