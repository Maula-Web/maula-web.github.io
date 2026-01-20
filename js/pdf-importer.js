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
            this.buildTeamDictionary();
        }
    }

    buildTeamDictionary() {
        this.knownTeams = new Set();
        this.jornadas.forEach(j => {
            if (j.matches) {
                j.matches.forEach(m => {
                    if (m.home) this.knownTeams.add(m.home.trim().toLowerCase());
                    if (m.away) this.knownTeams.add(m.away.trim().toLowerCase());
                });
            }
        });
        console.log(`DEBUG: Built team dictionary with ${this.knownTeams.size} teams.`);
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
            let firstDivCount = 0;
            j.matches.forEach(m => {
                m.home = AppUtils.formatTeamName(m.home);
                m.away = AppUtils.formatTeamName(m.away);
                if (AppUtils.isLaLigaTeam(m.home) || AppUtils.isLaLigaTeam(m.away)) firstDivCount++;
            });

            // STRICT FILTER 1: Must have at least 8 matches with LaLiga EA teams (to avoid mid-week/Champions)
            if (firstDivCount < 8) {
                console.log(`DEBUG: J${j.number} excluida - No es jornada de Primera (${firstDivCount} equipos encontrados)`);
                return;
            }

            // Clean date
            let dateClean = j.date.replace(/[\n\r]+/g, ' ').trim();
            dateClean = AppUtils.extractSundayFromRange(dateClean);
            const dateObj = AppUtils.parseDate(dateClean);

            // LOGIC FILTERS:
            const isSunday = AppUtils.isSunday(dateObj);
            const isLaLigaComp = /LaLiga|Primera/i.test(j.competition || "");
            const hasLaLigaTeams = firstDivCount >= 8;

            console.log(`DEBUG: J${j.number} - Domingo: ${isSunday}, Competición: ${j.competition}, Equipos 1ª: ${firstDivCount}`);

            if (!isSunday || !isLaLigaComp || !hasLaLigaTeams) {
                console.log(`DEBUG: J${j.number} RECHAZADA por no cumplir criterios Maula.`);
                return;
            }

            valid.push({
                number: j.number,
                date: dateClean,
                matches: j.matches.slice(0, 15),
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

            // 2. Find Date and Competition in header
            const headerText = rawText.substring(0, 1000);

            // Competition is usually between ( ) right after Jornada
            const compMatch = headerText.match(/\(([^)]+)\)/);
            const competition = compMatch ? compMatch[1].trim() : "";

            // Improved Date Match: Handles "24-25 de enero" and "24-25 / enero"
            const dateParts = headerText.match(/(\d{1,2}(?:[-–]\d{1,2})?)\s*[\/de\s]+\s*([a-z]+)(?:\s*[\/de\s]+\s*(\d{4}))?/i);
            const dateVal = dateParts ? `${dateParts[1]} de ${dateParts[2]} ${dateParts[3] || new Date().getFullYear()}` : "Por definir";

            // 3. Find Matches
            const matches = [];

            // 3. Find Matches (Fixed regex with stricter lookahead to avoid concatenation)
            for (let m = 1; m <= 14; m++) {
                // Determine what markers to look for next to avoid greedy capture
                const nextMarker = m < 14 ? `\\b${m + 1}[.\\s]` : `(?:P15|15\\b|\\*\\*P15|Jornada)`;
                const matchRegex = new RegExp(`(?:^|\\b)${m}[.\\s]\\s+([^\\n\\r-]+?)\\s*[-–]\\s+([^\\n\\r]+?)(?=\\s+${nextMarker}|$)`, 'i');
                const found = rawText.match(matchRegex);

                if (found) {
                    let home = found[1].trim();
                    let away = found[2].trim();

                    // Cleanup Away: if it caught next match numbers, strip them
                    away = away.split(/\s+\d+[.\s]/)[0].trim();

                    if (home.length > 1 && away.length > 1 && !AppUtils.isDateString(home)) {
                        matches.push({ position: m, home, away, result: '' });
                    }
                }
            }

            // Match 15 (Improved handling for **P15**)
            const p15Patterns = [
                /\*\*(?:P15|15)\*\*\s*([^\n\r-]+?)\s*[-–]\s*([^\n\r]+?)(?=\*\*|$)/i, // **P15** Home - Away **
                /\*\*(?:P15|15)\s+([^\n\r-]+?)\s*[-–]\s*([^\n\r]+?)\*\*/i,
                /(?:^|\s)P15\s+([^\n\r-]+?)\s*[-–]\s*([^\n\r]+?)(?=\s+Jornada|$)/i,
                /(?:^|\s)15[.\s]\s*([^\n\r-]+?)\s*[-–]\s*([^\n\r]+?)(?=\s+Jornada|$)/i
            ];

            for (const pattern of p15Patterns) {
                const p15Found = rawText.match(pattern);
                if (p15Found) {
                    let pHome = p15Found[1].trim();
                    let pAway = p15Found[2].trim().split(/\s{2,}/)[0].split(/Jornada/i)[0].trim();
                    if (pHome.length > 2 && pAway.length > 2) {
                        matches.push({ position: 15, home: pHome, away: pAway, result: '' });
                        break;
                    }
                }
            }

            if (matches.length >= 10) {
                extracted.push({
                    number: number,
                    date: dateVal,
                    competition: competition,
                    matches: matches.sort((a, b) => a.position - b.position)
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
