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

            // 3. Filter & Process Data (PDF Level)
            const validFromPDF = this.processExtractedData(extractedJornadas);

            // 4. Filter by Local State (App Logic)
            // Rule: Only offer to import if the local jornada doesn't exist OR corresponds to an incomplete/empty jornada.
            // If we already have 15 matches with defined teams, we assume it's done and don't spam the user.
            const toImport = validFromPDF.filter(nj => {
                const local = this.jornadas.find(l => l.number === nj.number && l.season === nj.season);

                // If not in DB, definitely import
                if (!local) return true;

                // If in DB, check if it's "full"
                // definition of full: 15 matches, all have Home and Away teams (not empty strings)
                let filledCount = 0;
                if (local.matches && Array.isArray(local.matches)) {
                    filledCount = local.matches.filter(m => m.home && m.home.trim().length > 0 && m.away && m.away.trim().length > 0).length;
                }

                if (filledCount === 15) {
                    // It's full. Do NOT offer import.
                    console.log(`DEBUG: Skipping Import for J${nj.number} - Local version is already complete (15 matches).`);
                    return false;
                }

                // If exists but not full (matches deleted or partial), allow import/update
                return true;
            });

            // 5. Verification Check
            if (toImport.length === 0) {
                loadingOverlay.remove();
                alert('No se encontraron jornadas nuevas válidas en el PDF (o las encontradas ya están completas en tu base de datos).');
                return;
            }

            // 6. Show Confirmation
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

            // Clean date
            let dateClean = j.date.replace(/[\n\r]+/g, ' ').trim();
            dateClean = AppUtils.extractSundayFromRange(dateClean);
            const dateObj = AppUtils.parseDate(dateClean);

            // LOGIC FILTERS (The "Maula" Rulebook):
            const isSunday = AppUtils.isSunday(dateObj);
            const isPorDefinir = dateClean.toLowerCase().includes('por definir');

            // Competition check: literal or high density of teams
            const isLaLigaComp = /1ª\s*La\s*Liga\s*EA|La\s*Liga\s*EA|Primera/i.test(j.competition || "");
            const hasLaLigaTeams = firstDivCount >= 8;

            console.log(`DEBUG: J${j.number} - Domingo: ${isSunday}, TBD: ${isPorDefinir}, Competición: "${j.competition}", Equipos 1ª: ${firstDivCount}`);

            // We allow it if:
            // 1. It satisfies the strict rules (Sunday + Literal)
            // OR 2. It has very high density (>=8) - In this case we TRUST the content over the date.
            // Many times date parsing fails or it's a "Wednesday" journey that we still want to see.
            // We rely on the user to check/fix date if needed, but we don't hide the data.
            const isValid = (isSunday && isLaLigaComp) || hasLaLigaTeams;

            if (!isValid) {
                console.log(`DEBUG: J${j.number} RECHAZADA. Sunday=${isSunday}, TBD=${isPorDefinir}, Density=${hasLaLigaTeams}, CompMatch=${isLaLigaComp}`);
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
            const rawText = textContent.items.map(item => item.str).join(' ');

            // Multiple jornadas per page: split by "Jornada" marker
            const blocks = rawText.split(/\bJornada\s+/i);

            blocks.forEach((block, bIdx) => {
                // If the text starts with "Jornada", the first block will be empty, so we skip it.
                // If it doesn't, the first block is header junk.
                if (bIdx === 0 && !rawText.trim().startsWith('Jornada')) return;

                // 1. Find Jornada Number
                const numMatch = block.match(/^(\d+)/);
                if (!numMatch) return;
                const number = parseInt(numMatch[1]);

                // 2. Extract header for this block (competition and date)
                const headerText = block.substring(0, 600);
                const compMatch = headerText.match(/\(([^)]+)\)/);
                const competition = compMatch ? compMatch[1].trim() : "";

                // Improved Date search: safe against "de" eating the start of the month
                // 1. Try complex range first
                const rangeParts = headerText.match(/(\d{1,2}\s+[a-zñáéíóúü]+\s*[-–]\s*\d{1,2}\s+[a-zñáéíóúü]+)(?:\s*(?:de|\/|-)\s*(\d{4}))?/i);

                let dateVal = "Por definir";
                if (rangeParts) {
                    dateVal = rangeParts[1] + (rangeParts[2] ? ` de ${rangeParts[2]}` : ` de ${new Date().getFullYear()}`);
                } else {
                    // 2. Try standard date or simple range
                    // Fix: Use non-greedy separator or explicit "de" to avoid eating 'e' from 'enero'
                    // separated: (\s+de\s+|\s*[\/-]\s*)
                    const dateParts = headerText.match(/(\d{1,2}(?:[-–]\d{1,2})?)(?:\s+de\s+|\s*[\/-]\s*)([a-zñáéíóúü]+)(?:\s*(?:de|\/|-)\s*(\d{4}))?/i);

                    if (dateParts) {
                        const day = dateParts[1];
                        let month = dateParts[2].replace(/\s+/g, '').toLowerCase();
                        const year = dateParts[3] || new Date().getFullYear();
                        dateVal = `${day} de ${month} de ${year}`;
                    } else if (headerText.toLowerCase().includes('por definir')) {
                        dateVal = "Por definir";
                    }
                }

                // DEBUG: Save block for user inspection
                if (!window.PDF_DEBUG_BLOCKS) window.PDF_DEBUG_BLOCKS = {};
                window.PDF_DEBUG_BLOCKS[number] = block;

                // 3. Find Matches (Robust Substring Method)
                const matches = [];

                // Helper to find the index of a match number
                const findMatchIndex = (text, matchNum, startIndex = 0) => {
                    const re = new RegExp(`(?:^|[\\s*])${matchNum}[.\\s]`, 'g');
                    re.lastIndex = startIndex;
                    let match;
                    while ((match = re.exec(text)) !== null) {
                        return match.index;
                    }
                    return -1;
                };

                // Helper to clean and parse a "Home - Away" string
                const parseMatchLine = (line, position) => {
                    // Try hyphen
                    let hyphenMatch = line.match(/\s*[-–]\s*/);
                    // Try wide gap if no hyphen (e.g. "TEAM A   TEAM B")
                    // require at least 3 spaces to differentiate from words in a name
                    if (!hyphenMatch) hyphenMatch = line.match(/\s{3,}/);

                    if (hyphenMatch) {
                        const mid = hyphenMatch.index;
                        let home = line.substring(0, mid).trim();
                        let away = line.substring(mid + hyphenMatch[0].length).trim();

                        // Cleanup artifacts
                        if (home.length > 1 && away.length > 1) {
                            if (AppUtils.isDateString(home)) return { isDate: true };

                            home = home.replace(/^[*]*\s*\d+[.\s]+\s*/, '');
                            home = home.replace(/^[*]+\s*/, '');

                            return { position, home, away, result: '' };
                        }
                    }
                    return null;
                };

                for (let m = 1; m <= 15; m++) {
                    let searchIdx = 0;
                    let foundValid = false;

                    // Loop to try candidates, skipping those that turn out to be dates
                    while (!foundValid && searchIdx < block.length) {
                        const idxCurrent = findMatchIndex(block, m, searchIdx);

                        if (idxCurrent === -1) {
                            break;
                        }

                        // Determine End Index for this line
                        let idxNext = -1;
                        if (m < 15) {
                            const reNext = new RegExp(`(?:^|[\\s*])${m + 1}[.\\s]`, 'g');
                            reNext.lastIndex = idxCurrent + 3;
                            const matchNext = reNext.exec(block);
                            if (matchNext) idxNext = matchNext.index;
                        }

                        let rawLine = '';
                        if (idxNext !== -1 && idxNext > idxCurrent) {
                            rawLine = block.substring(idxCurrent, idxNext);
                        } else {
                            if (m < 15) {
                                // Try finding ANY next number
                                const reAnyNext = /(?:^|[\s])(\d{1,2})[.\s]/g;
                                reAnyNext.lastIndex = idxCurrent + 4;
                                const nextM = reAnyNext.exec(block);
                                if (nextM) rawLine = block.substring(idxCurrent, nextM.index);
                                else {
                                    // Check for P15 marker
                                    const p15Idx = block.indexOf('P15', idxCurrent);
                                    if (p15Idx > idxCurrent) rawLine = block.substring(idxCurrent, p15Idx);
                                    else rawLine = block.substring(idxCurrent);
                                }
                            } else {
                                rawLine = block.substring(idxCurrent);
                            }
                        }

                        // Clean and Parse
                        const cleanLine = rawLine.replace(/[\r\n]+/g, ' ').trim();
                        const parsed = parseMatchLine(cleanLine, m);

                        // Check validity
                        if (parsed && !parsed.isDate) {
                            matches.push(parsed);
                            foundValid = true;
                        } else {
                            // It was a date artifact or garbage, try next occurrence
                            searchIdx = idxCurrent + 1;
                        }
                    }
                }

                // If regular loop for 15 failed (because it's P15), try P15 specific patterns
                if (!matches.find(x => x.position === 15)) {
                    // Normalize block end for regex consistency
                    const cleanBlock = block.trim();

                    const p15Patterns = [
                        // Robust P15: Look for "P15" or "15" followed eventually by "Team - Team" at the end of the text
                        // We use [\s\S] to match across newlines if needed, or simply greedy scan
                        // We explicitly allow NO space after P15/15 if it's there, but usually there is space
                        /(?:P15|15)(?:\.|[\s]+)\s*([^\d\n\r-]+?)\s*[-–]\s*([^\d\n\r]+?)$/i,

                        // Previous patterns just in case
                        /\*\*\s*(?:P15|15)[.\s]*\s*([^\n\r-]+?)\s*[-–]\s*([^\n\r*]+?)\s*\*\*/i,

                        // Fallback broad
                        /(?:^|[^\w])(?:P15|15)[.\s]\s*([^\n\r-]+?)\s*[-–]\s*([^\n\r]+?)(?=\s+Jornada|$)/i
                    ];

                    for (const pattern of p15Patterns) {
                        const p15Found = cleanBlock.match(pattern);
                        if (p15Found) {
                            let pHome = p15Found[1].trim();
                            let pAway = p15Found[2].trim();

                            // Clean noise
                            pAway = pAway.replace(/\*\*$/, '').replace(/Jornada.*/i, '').trim();
                            // Split by large gaps just in case
                            pAway = pAway.split(/\s{2,}/)[0].trim();

                            pHome = pHome.replace(/^\**\d+[.\s]+\s*/, '');
                            pHome = pHome.replace(/^\**\s*/, '');

                            if (pHome.length > 2 && pAway.length > 2) {
                                matches.push({ position: 15, home: pHome, away: pAway, result: '' });
                                break;
                            }
                        }
                    }
                }

                if (matches.length >= 10) {
                    extracted.push({
                        number,
                        date: dateVal,
                        competition,
                        matches: matches.sort((a, b) => a.position - b.position)
                    });
                }
            });
        }

        return extracted;
    }

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
                <div style="display:flex; justify-content:space-between; width:100%; align-items:flex-start; margin-top:1rem; padding-bottom:1rem;">
                    <button class="btn-action" style="background:#555; color:#fff; font-size:0.8rem;" onclick="viewRawPDFText()">👁️ Ver Texto PDF (Debug)</button>
                    
                    <div style="display:flex; gap:10px;">
                        <button class="btn-action" style="background:#ccc; color:#333;" id="btn-cancel-pdf">Cancelar</button>
                        <button class="btn-action btn-add" id="btn-confirm-pdf">Confirmar e Importar</button>
                    </div>
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
}

window.PDFImporter = new PDFImporter();
window.startPDFImport = () => window.PDFImporter.startImport();

window.viewRawPDFText = () => {
    if (!window.PDF_DEBUG_BLOCKS) {
        alert("No hay datos de depuración disponibles.");
        return;
    }

    // Create a simple modal on top
    const dbgOverlay = document.createElement('div');
    dbgOverlay.className = 'modal-overlay active';
    dbgOverlay.style.zIndex = '100000'; // Very high

    let content = "";
    for (const [num, text] of Object.entries(window.PDF_DEBUG_BLOCKS)) {
        content += `=== JORNADA ${num} RAW BLOCK START ===\n${text}\n=== END BLOCK ===\n\n`;
    }

    dbgOverlay.innerHTML = `
        <div class="modal" style="width:90%; height:90%; max-width:1000px; display:flex; flex-direction:column;">
            <h3>Texto Crudo del PDF (Debug)</h3>
            <textarea style="flex:1; width:100%; font-family:monospace; padding:1rem; white-space:pre;">${content}</textarea>
            <button class="btn-action" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
        </div>
    `;
    document.body.appendChild(dbgOverlay);
};
