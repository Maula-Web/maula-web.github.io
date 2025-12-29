
class PronosticoManager {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];

        this.currentMemberId = null;
        this.currentJornadaId = null;

        // Correction Mode State
        this.correctionMode = false;
        this.pendingSaveData = null; // To store data while audit modal is open

        this.init();
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');

        this.cacheDOM();
        this.populateDropdowns();
        this.renderSummaryTable(); // Initial render
        this.bindEvents();
    }


    cacheDOM() {
        this.selMember = document.getElementById('sel-member');
        this.selJornada = document.getElementById('sel-jornada');
        this.container = document.getElementById('forecast-container');
        this.statusMsg = document.getElementById('status-message');
        this.deadlineInfo = document.getElementById('deadline-info');
        this.btnSave = document.getElementById('btn-save');

        // Doubles DOM
        this.doublesSection = document.getElementById('doubles-section');
        this.doublesContainer = document.getElementById('doubles-container');
        this.doublesCounter = document.getElementById('doubles-counter');
        this.btnSaveDoubles = document.getElementById('btn-save-doubles');
        this.doublesStatus = document.getElementById('doubles-status');

        // Summary Table Elements
        this.summaryTable = document.getElementById('forecast-summary-table');
        this.summaryContainer = document.getElementById('summary-container');

        // Correction Mode Elements
        this.chkCorrection = document.getElementById('chk-correction-mode');
        this.lblCorrection = document.getElementById('lbl-correction');

        // Audit Modal Elements
        this.auditModal = document.getElementById('audit-modal-overlay');
        this.auditReason = document.getElementById('audit-reason');
        this.auditLateCheck = document.getElementById('audit-late-penalty');
        this.btnConfirmAudit = document.getElementById('btn-confirm-audit');
        this.btnCancelAudit = document.getElementById('btn-cancel-audit');
        this.btnToggleSummary = document.getElementById('btn-toggle-summary');
        if (this.btnToggleSummary) {
            this.btnToggleSummary.addEventListener('click', () => {
                const isHidden = this.summaryContainer.style.display === 'none';
                this.summaryContainer.style.display = isHidden ? 'block' : 'none';
            });
        }

        // Table Delegation for clicking cells
        if (this.summaryTable) {
            this.summaryTable.addEventListener('click', (e) => {
                const cell = e.target.closest('td.summary-cell');
                if (cell) {
                    const jId = cell.dataset.jid;
                    const mId = cell.dataset.mid;
                    if (jId && mId) {
                        this.selectAndLoad(jId, mId);
                    }
                }
            });
        }

        // Correction Toggle
        if (this.chkCorrection) {
            this.chkCorrection.addEventListener('change', (e) => {
                this.correctionMode = e.target.checked;
                this.updateCorrectionUI();
                this.loadForecast();
            });
        }

        // Audit Modal Actions
        if (this.btnConfirmAudit) this.btnConfirmAudit.addEventListener('click', () => this.executeAuditSave());
        if (this.btnCancelAudit) this.btnCancelAudit.addEventListener('click', () => {
            this.auditModal.style.display = 'none';
            document.body.style.overflow = '';
            this.pendingSaveData = null;
        });

        // Doubles Save
        if (this.btnSaveDoubles) this.btnSaveDoubles.addEventListener('click', () => this.saveDoubles());
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');
        this.pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || []; // New Collection

        this.cacheDOM();
        this.populateDropdowns();
        this.renderSummaryTable();
        this.bindEvents();
    }

    // ... (populateDropdowns, updateCorrectionUI, etc remains same) ...

    loadForecast() {
        this.container.innerHTML = '';
        this.container.classList.add('hidden');
        if (this.doublesSection) this.doublesSection.classList.add('hidden'); // Hide doubles by default
        this.btnSave.style.display = 'none';
        this.statusMsg.textContent = '';
        this.deadlineInfo.textContent = '';

        if (!this.currentMemberId || !this.currentJornadaId) return;

        const jornada = this.jornadas.find(j => j.id === this.currentJornadaId);
        if (!jornada) return;

        // ... (Deadline Logic: same as before) ...
        const deadline = this.calculateDeadline(jornada.date);
        const now = new Date();
        const isLate = now > deadline;
        const dateObj = AppUtils.parseDate(jornada.date);
        const closeDate = new Date(dateObj);
        closeDate.setDate(closeDate.getDate() + 2);
        closeDate.setHours(23, 59, 59);
        const isLockedRef = now > closeDate;
        const isLocked = this.correctionMode ? false : isLockedRef;

        if (deadline) {
            const dStr = deadline.toLocaleDateString() + ' ' + deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.deadlineInfo.innerHTML = isLate ?
                `<span style="color:var(--danger)">Plazo expirado (${dStr})</span>` :
                `<span style="color:var(--primary-green)">Cierre: ${dStr}</span>`;
        }

        if (isLockedRef) {
            if (this.correctionMode) {
                this.statusMsg.innerHTML = '<span class="badge-late" style="border:2px solid var(--primary-orange); color:var(--primary-orange);">🛠️ EDITANDO JORNADA CERRADA (Modo Corrección)</span>';
                this.container.style.border = "2px dashed var(--primary-orange)";
            } else {
                this.statusMsg.innerHTML = '<span class="badge-locked">🔒 JORNADA FINALIZADA - NO SE ADMITEN CAMBIOS</span>';
                this.container.style.border = "none";
            }
        } else if (isLate) {
            this.statusMsg.innerHTML = '<span class="badge-late">⚠️ FUERA DE PLAZO - SE MARCARÁ COMO RETRASADO</span>';
            this.container.style.border = "none";
        } else {
            this.container.style.border = "none";
        }

        const existing = this.pronosticos.find(p => p.jId === this.currentJornadaId && p.mId === this.currentMemberId);
        const currentSelections = existing ? existing.selection : Array(15).fill(null);

        // Render Normal Forecast
        if (jornada.matches) {
            this.container.classList.remove('hidden');
            this.btnSave.style.display = isLocked ? 'none' : 'block';

            jornada.matches.forEach((match, idx) => {
                const displayIdx = idx === 14 ? 'P15' : idx + 1;
                const row = document.createElement('div');
                row.className = 'match-row';

                const homeLogo = AppUtils.getTeamLogo(match.home);
                const awayLogo = AppUtils.getTeamLogo(match.away);

                row.innerHTML = `
                    <div class="match-info">
                        <span class="match-num">${displayIdx}</span>
                        <div class="teams-wrapper">
                            <div class="team-name home">
                                <img src="${homeLogo}" class="team-logo-small" onerror="this.style.display='none'">
                                <span>${match.home}</span>
                            </div>
                            <div class="team-name away">
                                <img src="${awayLogo}" class="team-logo-small" onerror="this.style.display='none'">
                                <span>${match.away}</span>
                            </div>
                        </div>
                    </div>
                    <div class="prediction-inputs" data-idx="${idx}">
                        ${this.renderRadioGroup(idx, currentSelections[idx], isLocked)}
                    </div>
                `;
                this.container.appendChild(row);
            });
        }

        // DOUBLES LOGIC
        // Only run if not locked (or is correction mode? let's stick to normal flow first)
        // Check eligibility
        if (!isLocked || this.correctionMode) {
            const eligibility = this.checkEligibility(jornada.number, this.currentMemberId);
            if (eligibility.eligible) {
                this.renderDoublesForm(jornada, isLocked);

                // If Doubles Section Exists, show it
                if (this.doublesSection) {
                    this.doublesSection.classList.remove('hidden');
                    // Update Title or Description if needed based on reason (Winner vs Prize)
                    // e.g. "Ganador Jornada Anterior" vs "Premiado Jornada Anterior"
                }
            }
        }
    }

    checkEligibility(currentJornadaNum, memberId) {
        if (currentJornadaNum <= 1) return { eligible: false };

        const prevNum = currentJornadaNum - 1;
        const prevJornada = this.jornadas.find(j => j.number === prevNum);

        if (!prevJornada || !prevJornada.matches) return { eligible: false };

        // Calculate scores for previous jornada
        const officialResults = prevJornada.matches.map(m => m.result);
        const jDate = AppUtils.parseDate(prevJornada.date);

        // 1. Calculate Everyone's stats
        let maxPoints = -1;
        let winners = [];

        // Map members to their result
        const results = this.members.map(m => {
            const p = this.pronosticos.find(pred => (pred.jId === prevJornada.id) && (pred.mId === m.id));
            if (!p) return { id: m.id, points: 0, hits: 0, late: false };

            const isLate = p.late && !p.pardoned;
            if (isLate) return { id: m.id, points: ScoringSystem.calculateScore(0, jDate), hits: 0, late: true };

            const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
            return { id: m.id, points: ev.points, hits: ev.hits, late: false };
        });

        // Determine Max
        results.forEach(r => {
            if (r.points > maxPoints) maxPoints = r.points;
        });
        winners = results.filter(r => r.points === maxPoints).map(r => r.id);

        // Check if current member is winner
        if (winners.includes(memberId)) return { eligible: true, reason: 'winner' };

        // Check if prize winner (RSS based Min Hits)
        const myResult = results.find(r => r.id === memberId);
        if (myResult) {
            const minHits = prevJornada.minHitsToWin || 15; // Default strict if missing
            // User said: "A veces 10 no tienen premio". RSS parser returns Min Hits.
            // If my hits >= minHits, I am eligible.
            if (myResult.hits >= minHits && minHits < 15) { // Ensure minHits is realistic "Prize" range
                return { eligible: true, reason: 'prize' };
            }
        }

        return { eligible: false };
    }

    renderDoublesForm(jornada, isLocked) {
        this.doublesContainer.innerHTML = '';
        this.doublesStatus.textContent = '';
        this.doublesStatus.className = '';
        this.btnSaveDoubles.style.display = isLocked ? 'none' : 'block';

        // Load existing doubles
        const existingExtra = this.pronosticosExtra.find(p => p.jId === this.currentJornadaId && p.mId === this.currentMemberId);
        const selections = existingExtra ? existingExtra.selection : Array(15).fill('');

        jornada.matches.forEach((match, idx) => {
            const displayIdx = idx === 14 ? 'P15' : idx + 1;
            const row = document.createElement('div');
            row.className = 'match-row';

            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            const isP15 = idx === 14;

            row.innerHTML = `
                <div class="match-info">
                    <span class="match-num" style="background:${isP15 ? '#6a1b9a' : '#eee'}; color:${isP15 ? 'white' : '#666'}">${displayIdx}</span>
                    <div class="teams-wrapper">
                        <div class="team-name home">
                            <img src="${homeLogo}" class="team-logo-small">
                            <span>${match.home}</span>
                        </div>
                        <div class="team-name away">
                            <img src="${awayLogo}" class="team-logo-small">
                            <span>${match.away}</span>
                        </div>
                    </div>
                </div>
                <div class="prediction-inputs" data-idx="${idx}">
                    ${this.renderMultiSelectButtons(idx, selections[idx], isLocked, isP15)}
                </div>
            `;
            this.doublesContainer.appendChild(row);
        });

        this.updateDoublesCounters();
    }

    renderMultiSelectButtons(idx, currentVal, disabled, isP15) {
        // currentVal is string "1", "1X", "1X2", etc.
        const options = ['1', 'X', '2'];
        // P15 Logic: Does it allow doubles? User said: "Si se tiene que rellenar el pleno al 15".
        // Usually P15 is SINGLE sign in reductions. I'll enforce Single for P15.

        let html = '';
        options.forEach(opt => {
            const isSelected = currentVal && currentVal.includes(opt);
            const activeClass = isSelected ? 'active' : '';
            // For P15, allow only single select behavior (handled in click)
            // For others, allow toggle.
            html += `<button type="button" class="btn-prediction ${activeClass}" 
                        onclick="window.app.handleDoubleToggle(this, ${idx}, '${opt}', ${isP15})" 
                        ${disabled ? 'disabled' : ''}>${opt}</button>`;
        });
        return html;
    }

    handleDoubleToggle(btn, idx, sign, isP15) {
        const parent = btn.parentElement;
        const allBtns = parent.querySelectorAll('button');

        if (isP15) {
            // Single Select behavior for P15
            allBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        } else {
            // Toggle
            if (btn.classList.contains('active')) {
                // Prevent deselecting last one? No, allow empty but validate later.
                btn.classList.remove('active');
            } else {
                btn.classList.add('active');
            }
        }
        this.updateDoublesCounters();
    }

    updateDoublesCounters() {
        // Scan all inputs
        let doubles = 0;
        let triples = 0;

        const rows = this.doublesContainer.querySelectorAll('.prediction-inputs');
        rows.forEach(row => {
            const idx = parseInt(row.dataset.idx);
            if (idx === 14) return; // Skip P15 for count (usually P15 doesn't count for reduction cost)

            const active = row.querySelectorAll('.btn-prediction.active').length;
            if (active === 2) doubles++;
            if (active === 3) triples++;
        });

        // Rules: 7 Doubles O 4 Triples (XOR logic usually implies purely one type? or mixed cost?)
        // User said: "7 dobles o cuatro triples simplificadas".
        // Usually means standard reduction tables.
        // I will display used count. Validation on save.

        this.doublesCounter.textContent = `Usado: ${doubles} Dobles, ${triples} Triples`;

        // Visual Warning
        const isValid = (doubles <= 7 && triples === 0) || (doubles === 0 && triples <= 4);
        // Is mixed allowed? "7D o 4T". Usually implies distinct reduction types.
        // If they mix, it's not a standard reduction usually supported by this simple rule.
        // I'll stick to strict XOR for now.

        if (!isValid) {
            this.doublesCounter.style.color = '#ff5252'; // Red
            this.doublesCounter.innerHTML += ' (Inválido: Elige solo Dobles (max 7) o solo Triples (max 4))';
        } else {
            this.doublesCounter.style.color = '#ffeb3b'; // Yellow
        }
        return isValid;
    }

    async saveDoubles() {
        if (!this.updateDoublesCounters()) {
            alert('La combinación no es válida. \nReglas: Máximo 7 Dobles (sin triples) O Máximo 4 Triples (sin dobles).');
            return;
        }

        const rows = this.doublesContainer.querySelectorAll('.prediction-inputs');
        const selection = [];
        let missing = false;

        rows.forEach((row, idx) => {
            const btns = row.querySelectorAll('.btn-prediction.active');
            if (btns.length === 0) missing = true;

            // Build string "1X", "2", "1X2"
            // Ensure order 1 - X - 2
            let val = '';
            if (row.querySelector('button:nth-child(1)').classList.contains('active')) val += '1';
            if (row.querySelector('button:nth-child(2)').classList.contains('active')) val += 'X';
            if (row.querySelector('button:nth-child(3)').classList.contains('active')) val += '2';
            selection.push(val);
        });

        if (missing) {
            alert('Debes rellenar todos los signos (incluido el Pleno al 15).');
            return;
        }

        const data = {
            id: `${this.currentJornadaId}_${this.currentMemberId}`,
            jId: this.currentJornadaId,
            mId: this.currentMemberId,
            selection: selection,
            date: new Date().toISOString()
        };

        this.btnSaveDoubles.textContent = 'Guardando...';
        this.btnSaveDoubles.disabled = true;

        try {
            await window.DataService.save('pronosticos_extra', data);

            // Update local cache
            const existingIdx = this.pronosticosExtra.findIndex(p => p.id === data.id);
            if (existingIdx >= 0) this.pronosticosExtra[existingIdx] = data;
            else this.pronosticosExtra.push(data);

            this.doublesStatus.textContent = '¡Guardado correctamente!';
            this.doublesStatus.style.color = 'green';
            setTimeout(() => {
                this.doublesStatus.textContent = '';
                this.btnSaveDoubles.textContent = '💾 Guardar Quiniela de Dobles';
                this.btnSaveDoubles.disabled = false;
            }, 3000);

        } catch (e) {
            console.error(e);
            alert('Error al guardar: ' + e.message);
            this.btnSaveDoubles.textContent = '💾 Guardar Quiniela de Dobles';
            this.btnSaveDoubles.disabled = false;
        }
    }


    updateCorrectionUI() {
        const slider = this.chkCorrection.nextElementSibling;
        if (this.correctionMode) {
            slider.style.backgroundColor = 'var(--primary-orange)';
            this.lblCorrection.style.color = 'var(--primary-orange)';
            this.lblCorrection.textContent = "MODO CORRECCIÓN ACTIVO";
        } else {
            slider.style.backgroundColor = '#ccc';
            this.lblCorrection.style.color = 'var(--text-secondary)';
            this.lblCorrection.textContent = "Modo Corrección";
        }
    }

    bindEvents() {
        this.selMember.addEventListener('change', (e) => {
            this.currentMemberId = parseInt(e.target.value);
            this.loadForecast();
        });

        this.selJornada.addEventListener('change', (e) => {
            this.currentJornadaId = parseInt(e.target.value);
            this.loadForecast();
        });

        this.btnSave.addEventListener('click', () => this.saveForecast());
    }

    selectAndLoad(jId, mId) {
        // Convert to proper types (IDs are usually generated strings or numbers, assuming check matches)
        // Check types in arrays. Firestore IDs are strings, but code used parseInt sometimes.
        // Let's rely on loose comparison or convert if needed. 
        // Based on existing code: `this.currentJornadaId = parseInt(e.target.value);`
        // So we should parse.
        const parsedJId = parseInt(jId) || jId;
        const parsedMId = parseInt(mId) || mId;

        this.currentJornadaId = parsedJId;
        this.currentMemberId = parsedMId;

        // Try to sync Dropdowns
        if (this.selJornada) {
            const opt = this.selJornada.querySelector(`option[value="${parsedJId}"]`);
            if (opt) {
                this.selJornada.value = parsedJId;
            } else {
                // If the jornada is not in the dropdown (e.g. inactive),
                // we might want to add a temp option or just accept it won't match visually
                console.warn('Jornada not in dropdown (maybe inactive)');
                this.selJornada.value = ''; // Reset or keep previous?
            }
        }

        if (this.selMember) {
            const opt = this.selMember.querySelector(`option[value="${parsedMId}"]`);
            if (opt) this.selMember.value = parsedMId;
        }

        this.loadForecast();

        // Scroll to top to see the forecast
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Highlight logic
        this.container.style.transition = 'background-color 0.3s';
        this.container.style.backgroundColor = '#fff8e1'; // Highlight flash
        setTimeout(() => {
            this.container.style.backgroundColor = 'transparent';
        }, 500);
    }

    populateDropdowns() {
        this.members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.name} ${m.surname || ''}`;
            this.selMember.appendChild(opt);
        });

        const sortedJornadas = [...this.jornadas].sort((a, b) => a.number - b.number);
        const now = new Date();

        sortedJornadas.forEach(j => {
            if (!j.active) return;

            // Filter: Only show jornadas on Sunday
            const dateObj = AppUtils.parseDate(j.date);
            if (!dateObj) return;
            if (!AppUtils.isSunday(dateObj)) return; // 0 = Sunday

            // Locked check

            const closeDate = new Date(dateObj.getTime());
            closeDate.setDate(closeDate.getDate() + 2);
            closeDate.setHours(23, 59, 59);

            // Removed closeDate check to allow viewing past forecasts
            /* if (now > closeDate) return; */

            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = `Jornada ${j.number} - ${j.date}`;
            this.selJornada.appendChild(opt);
        });
    }

    loadForecast() {
        this.container.innerHTML = '';
        this.container.classList.add('hidden');
        this.btnSave.style.display = 'none';
        this.statusMsg.textContent = '';
        this.deadlineInfo.textContent = '';

        if (!this.currentMemberId || !this.currentJornadaId) return;

        const jornada = this.jornadas.find(j => j.id === this.currentJornadaId);
        if (!jornada) return;

        const deadline = this.calculateDeadline(jornada.date);
        const now = new Date();
        const isLate = now > deadline;

        const dateObj = AppUtils.parseDate(jornada.date);
        const closeDate = new Date(dateObj);
        closeDate.setDate(closeDate.getDate() + 2);
        closeDate.setHours(23, 59, 59); // Close at end of Tuesday
        const isLockedRef = now > closeDate;

        // CORRECTION OVERRIDE: If Mode is Active, ignore lock
        const isLocked = this.correctionMode ? false : isLockedRef;

        if (deadline) {
            const dStr = deadline.toLocaleDateString() + ' ' + deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.deadlineInfo.innerHTML = isLate ?
                `<span style="color:var(--danger)">Plazo expirado (${dStr})</span>` :
                `<span style="color:var(--primary-green)">Cierre: ${dStr}</span>`;
        }

        if (isLockedRef) {
            if (this.correctionMode) {
                this.statusMsg.innerHTML = '<span class="badge-late" style="border:2px solid var(--primary-orange); color:var(--primary-orange);">🛠️ EDITANDO JORNADA CERRADA (Modo Corrección)</span>';
                this.container.style.border = "2px dashed var(--primary-orange)";
            } else {
                this.statusMsg.innerHTML = '<span class="badge-locked">🔒 JORNADA FINALIZADA - NO SE ADMITEN CAMBIOS</span>';
                this.container.style.border = "none";
            }
        } else if (isLate) {
            this.statusMsg.innerHTML = '<span class="badge-late">⚠️ FUERA DE PLAZO - SE MARCARÁ COMO RETRASADO</span>';
            this.container.style.border = "none";
        } else {
            this.container.style.border = "none";
        }

        const existing = this.pronosticos.find(p => p.jId === this.currentJornadaId && p.mId === this.currentMemberId);
        const currentSelections = existing ? existing.selection : Array(15).fill(null);

        jornada.matches.forEach((match, idx) => {
            const displayIdx = idx === 14 ? 'P15' : idx + 1;
            const row = document.createElement('div');
            row.className = 'pronostico-row';

            let disabledStr = isLocked ? 'style="pointer-events:none; opacity:0.6;"' : '';
            if (disabledStr === '' && this.correctionMode && isLockedRef) {
                // Visual cue that elements are unlocked specially
            }

            // Pleno Restriction
            if (idx === 14) {
                const bigThree = ['Real Madrid', 'Atlético de Madrid', 'FC Barcelona'];
                const isBigMatch = bigThree.includes(match.home) && bigThree.includes(match.away);
                if (!isBigMatch) {
                    disabledStr = 'style="pointer-events:none; opacity:0.3; background:#eee;" title="Pleno deshabilitado"';
                }
            }

            const val = currentSelections[idx];
            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            row.innerHTML = `
                <div class="p-match-info">
                    <span style="font-weight:bold; color:var(--primary-green); width:30px;">${displayIdx}</span>
                    
                    <div style="flex:1; display:flex; justify-content:flex-end; align-items:center; gap:8px;">
                        <span>${match.home}</span>
                        <img src="${homeLogo}" class="team-logo" style="width:25px; height:25px; object-fit:contain;" onerror="this.style.display='none'">
                    </div>

                    <span style="margin:0 10px; color:#aaa;">-</span>

                    <div style="flex:1; display:flex; justify-content:flex-start; align-items:center; gap:8px;">
                        <img src="${awayLogo}" class="team-logo" style="width:25px; height:25px; object-fit:contain;" onerror="this.style.display='none'">
                        <span>${match.away}</span>
                    </div>
                </div>
                <div class="p-options" ${disabledStr} data-idx="${idx}">
                    <div class="chk-option ${val === '1' ? 'selected' : ''}" onclick="app.selectOption(this, '1')">1</div>
                    <div class="chk-option ${val === 'X' ? 'selected' : ''}" onclick="app.selectOption(this, 'X')">X</div>
                    <div class="chk-option ${val === '2' ? 'selected' : ''}" onclick="app.selectOption(this, '2')">2</div>
                </div>
            `;
            this.container.appendChild(row);
        });

        this.container.classList.remove('hidden');
        if (!isLocked) {
            this.btnSave.style.display = 'block';
            if (isLockedRef && this.correctionMode) {
                this.btnSave.innerHTML = "🛠️ Guardar Corrección";
                this.btnSave.style.backgroundColor = "var(--primary-orange)";
            } else {
                this.btnSave.innerHTML = "💾 Guardar Pronóstico";
                this.btnSave.style.backgroundColor = "var(--primary-green)";
            }
        } else {
            this.btnSave.style.display = 'none';
        }

        // DOUBLES LOGIC
        if (!isLocked || this.correctionMode) {
            if (typeof this.checkEligibility === 'function') {
                const eligibility = this.checkEligibility(jornada.number, this.currentMemberId);
                if (eligibility && eligibility.eligible) {
                    if (this.renderDoublesForm) this.renderDoublesForm(jornada, isLocked);
                    if (this.doublesSection) this.doublesSection.classList.remove('hidden');
                }
            }
        }
    }

    selectOption(el, val) {
        const parent = el.parentElement;
        parent.querySelectorAll('.chk-option').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
    }

    async saveForecast() {
        try {
            console.log("🔵 PASO 1: saveForecast iniciado");
            console.log("IDs:", { mId: this.currentMemberId, jId: this.currentJornadaId });

            if (!this.currentMemberId || !this.currentJornadaId) {
                console.error("❌ Faltan IDs");
                alert("Error: No parece haber un socio o jornada seleccionados válidos. Intenta refrescar o seleccionar de nuevo.");
                return;
            }

            console.log("🔵 PASO 2: Obteniendo selecciones");
            const rows = this.container.querySelectorAll('.p-options');
            console.log("Filas encontradas:", rows.length);

            const selection = [];
            let missing = false;

            rows.forEach((r, i) => {
                const isPlenoDisabled = (i === 14 && (
                    r.style.pointerEvents === 'none' ||
                    r.style.opacity === '0.3' ||
                    parseFloat(window.getComputedStyle(r).opacity) < 0.5
                ));

                const sel = r.querySelector('.selected');
                if (sel) selection.push(sel.textContent);
                else {
                    selection.push(null);
                    if (!isPlenoDisabled) missing = true;
                }
            });

            console.log("🔵 PASO 3: Selección:", selection);
            console.log("¿Falta algo?", missing);

            if (missing) {
                alert('Debes rellenar todos los resultados disponibles.');
                return;
            }

            console.log("🔵 PASO 4: Buscando jornada");
            const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
            if (!jornada) {
                alert("Error: No se encuentra la jornada seleccionada.");
                return;
            }
            console.log("Jornada encontrada:", jornada.number);

            console.log("🔵 PASO 5: Calculando fechas");
            const deadline = this.calculateDeadline(jornada.date);
            const dateObj = AppUtils.parseDate(jornada.date);
            if (!dateObj) {
                alert("Error en el formato de fecha de la jornada.");
                return;
            }

            const closeDate = new Date(dateObj);
            closeDate.setDate(closeDate.getDate() + 2);
            closeDate.setHours(23, 59, 59);

            const now = new Date();
            const isLockedRef = now > closeDate;
            const isLate = now > deadline;

            console.log("🔵 PASO 6: Estado de bloqueo");
            console.log({ isLockedRef, isLate, correctionMode: this.correctionMode });

            const id = `${this.currentJornadaId}_${this.currentMemberId}`;
            const record = {
                id: id,
                jId: this.currentJornadaId,
                mId: this.currentMemberId,
                selection: selection,
                timestamp: new Date().toISOString(),
                late: isLate
            };

            console.log("🔵 PASO 7: Verificando si necesita auditoría");
            console.log("Condición:", `isLockedRef=${isLockedRef} && correctionMode=${this.correctionMode}`);

            // If LOCKED and CORRECTION MODE -> Audit Flow
            if (isLockedRef && this.correctionMode) {
                console.log("🟢 ABRIENDO MODAL DE AUDITORÍA");
                this.pendingSaveData = record;
                this.openAuditModal(isLate);
                return;
            }

            console.log("🔵 PASO 8: Guardado normal (sin auditoría)");
            await this.performFinalSave(record, isLate);

        } catch (error) {
            console.error("❌ ERROR CAPTURADO:", error);
            alert("Error inesperado al guardar: " + error.message);
        }
    }

    openAuditModal(isLateCurrent) {
        console.log("🟡 openAuditModal llamado");
        console.log("Modal element:", this.auditModal);

        if (!this.auditModal) {
            console.error("❌ auditModal es null!");
            alert("Error: No se encuentra el modal de auditoría en la página.");
            return;
        }

        // Bloquear scroll del body
        document.body.style.overflow = 'hidden';

        // Mostrar modal
        this.auditModal.style.display = 'flex';
        this.auditReason.value = '';
        this.auditLateCheck.checked = isLateCurrent;

        // Forzar que esté en el viewport
        this.auditModal.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Focus en el textarea
        setTimeout(() => {
            if (this.auditReason) this.auditReason.focus();
        }, 100);

        console.log("✅ Modal mostrado (display=flex)");
    }

    async executeAuditSave() {
        if (!this.pendingSaveData) return;

        const reason = this.auditReason.value.trim();
        if (!reason) {
            alert('Por favor, indica un motivo para la corrección.');
            return;
        }

        const isForceLate = this.auditLateCheck.checked;

        // 1. Prepare Log Entry
        const existing = this.pronosticos.find(p => p.id === this.pendingSaveData.id);
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'CORRECTION',
            memberId: this.currentMemberId,
            jornadaId: this.currentJornadaId,
            oldSelection: existing ? existing.selection : null,
            newSelection: this.pendingSaveData.selection,
            reason: reason,
            forcedLate: isForceLate
        };

        // 2. Save Log
        if (window.DataService) {
            await window.DataService.save('modification_logs', logEntry);
        }

        // 3. Update Record with Forced Late Status
        this.pendingSaveData.late = isForceLate;

        // 4. Save Record
        await this.performFinalSave(this.pendingSaveData, isForceLate, true);

        this.auditModal.style.display = 'none';
        document.body.style.overflow = ''; // Restaurar scroll
        this.pendingSaveData = null;
    }

    async performFinalSave(record, isLate, isCorrection = false) {
        const idx = this.pronosticos.findIndex(p => p.id === record.id);
        if (idx > -1) {
            this.pronosticos[idx] = { ...this.pronosticos[idx], ...record };
        } else {
            this.pronosticos.push(record);
        }

        await window.DataService.save('pronosticos', record);

        if (isCorrection) {
            alert('✅ CORRECCIÓN APLICADA Y REGISTRADA CORRECTAMENTE');
        } else {
            // Show random Maula phrase
            if (typeof FRASES_MAULA !== 'undefined' && FRASES_MAULA.length > 0) {
                const randomPhrase = FRASES_MAULA[Math.floor(Math.random() * FRASES_MAULA.length)];
                alert('PRONÓSTICO GUARDADO CORRECTAMENTE\n\n' + randomPhrase);
            } else {
                alert('Pronóstico guardado correctamente' + (isLate ? ' (CON RETRASO)' : '') + '.');
            }
        }

        this.renderSummaryTable(); // Refresh summary
    }

    calculateDeadline(dateStr) {
        const d = AppUtils.parseDate(dateStr);
        if (!d) return null;

        const deadline = new Date(d.getTime());
        deadline.setDate(d.getDate() - 3);  // 3 días antes (jueves si la jornada es domingo)
        deadline.setHours(17, 0, 0, 0);
        return deadline;
    }

    renderSummaryTable() {
        if (!this.summaryTable) return;

        const thead = this.summaryTable.querySelector('thead');
        const tbody = this.summaryTable.querySelector('tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // 1. Sort Members alphabetically
        const sortedMembers = [...this.members].sort((a, b) => a.name.localeCompare(b.name));

        // 2. Build Header
        const headerRow = document.createElement('tr');
        // Sticky first column header
        headerRow.innerHTML = '<th style="position:sticky; left:0; z-index:10; padding:1rem; background:var(--card-bg); border-bottom:2px solid var(--input-border); min-width:120px;">Jornada</th>';

        sortedMembers.forEach((m, index) => {
            // Zebra striping for columns in header too
            const bg = index % 2 !== 0 ? 'background-color: var(--pastel-bg);' : 'background-color: var(--card-bg);';
            const color = 'color: var(--text-main);';
            headerRow.innerHTML += `<th style="padding:1rem; min-width:140px; text-align:center; border-bottom:2px solid var(--input-border); ${bg} ${color}">${m.name}</th>`;
        });
        thead.appendChild(headerRow);

        // 3. Sort Jornadas (descending) & Filter empty ones
        let sortedJornadas = [...this.jornadas].sort((a, b) => b.number - a.number);

        // Filter: Keep only jornadas that have at least one forecast
        sortedJornadas = sortedJornadas.filter(j => {
            return this.pronosticos.some(p => p.jId === j.id && p.selection && p.selection.length > 0);
        });

        if (sortedJornadas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="100%" style="padding:2rem;">No hay pronósticos registrados aún.</td></tr>';
            return;
        }

        // 4. Build Rows
        sortedJornadas.forEach(j => {
            const row = document.createElement('tr');

            // Format date with Year: "dd/mm/yyyy"
            let dateFormatted = j.date;
            try {
                // Try parsing our standard format
                const d = AppUtils.parseDate(j.date);
                if (d) {
                    dateFormatted = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }
            } catch (e) { }

            // First col sticky
            row.innerHTML = `<td style="font-weight:bold; position:sticky; left:0; background:var(--card-bg); z-index:5; border-right:2px solid var(--input-border); padding:0.8rem;">
                <div style="font-size:1.1em; color:var(--primary-blue);">J${j.number}</div>
                <div style="font-size:0.75em; color:var(--text-secondary); margin-top:4px;">${dateFormatted}</div>
            </td>`;

            sortedMembers.forEach((m, index) => {
                const p = this.pronosticos.find(pr => pr.jId === j.id && pr.mId === m.id);

                // Zebra striping logic: Alternate column backgrounds
                let colBg = index % 2 !== 0 ? 'background-color: var(--pastel-bg);' : 'background-color: transparent;';

                let cellContent = '-';
                let cellStyle = `text-align:center; vertical-align:middle; padding:0.6rem; border-bottom:1px solid var(--input-border); ${colBg} cursor:pointer; transition:background-color 0.2s;`;
                let textStyle = '';

                if (p && p.selection) {
                    // Extract only first 14 matches (exclude Pleno/15)
                    const selection14 = p.selection.slice(0, 14);

                    // Create compact string: "1X2111..."
                    // Convert nulls to "-"
                    const summary = selection14.map(s => s || '-').join('');

                    // Status Check
                    if (p.late) {
                        // Late: Orange accent
                        textStyle = 'color: #e65100; font-weight:bold;';
                        cellContent = `<div style="font-family:monospace; font-size:0.95rem; letter-spacing:2px; white-space:nowrap; ${textStyle}" title="Enviado con retraso">${summary}</div>`;
                    } else {
                        // OK: Normal text (or green)
                        textStyle = 'color: var(--text-main); font-weight:500;';
                        cellContent = `<div style="font-family:monospace; font-size:0.95rem; letter-spacing:2px; white-space:nowrap; ${textStyle}">${summary}</div>`;
                    }
                } else {
                    // Missing
                    textStyle = 'color: #e57373; font-weight:bold;';
                    cellContent = `<span style="${textStyle}">-</span>`;
                }

                row.innerHTML += `<td class="summary-cell" data-jid="${j.id}" data-mid="${m.id}" style="${cellStyle}" onmouseover="this.style.backgroundColor='#e3f2fd'" onmouseout="this.style.backgroundColor='${colBg.includes('transparent') ? 'transparent' : 'var(--pastel-bg)'}'">${cellContent}</td>`;
            });

            tbody.appendChild(row);
        });
    }
    checkEligibility(currentJornadaNum, memberId) {
        if (currentJornadaNum <= 1) return { eligible: false };

        const prevNum = currentJornadaNum - 1;
        const prevJornada = this.jornadas.find(j => j.number === prevNum);

        if (!prevJornada || !prevJornada.matches) return { eligible: false };

        // Calculate scores for previous jornada
        const officialResults = prevJornada.matches.map(m => m.result);
        const jDate = AppUtils.parseDate(prevJornada.date);

        // Wait! If results are empty?
        if (officialResults.every(r => !r || r === '-')) return { eligible: false };

        // 1. Calculate Everyone's stats
        let maxPoints = -1;
        let winners = [];

        // Map members to their result
        const results = this.members.map(m => {
            const p = this.pronosticos.find(pred => (pred.jId === prevJornada.id) && (pred.mId === m.id));
            if (!p) return { id: m.id, points: 0, hits: 0, late: false };

            const isLate = p.late && !p.pardoned;
            if (isLate) return { id: m.id, points: ScoringSystem.calculateScore(0, jDate), hits: 0, late: true };

            const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
            return { id: m.id, points: ev.points, hits: ev.hits, late: false };
        });

        // Determine Max
        results.forEach(r => {
            if (r.points > maxPoints) maxPoints = r.points;
        });
        winners = results.filter(r => r.points === maxPoints).map(r => r.id);

        console.log(`DEBUG: J${prevNum} Max Points: ${maxPoints}. Winners:`, winners);
        console.log("DEBUG: Me:", memberId);

        // Check if current member is winner
        // Force String conversion for IDs comparison
        if (winners.map(String).includes(String(memberId))) return { eligible: true, reason: 'winner' };

        // Check if prize winner (RSS based Min Hits)
        const myResult = results.find(r => String(r.id) === String(memberId));
        if (myResult) {
            const minHits = prevJornada.minHitsToWin || 15; // Default strict if missing
            console.log(`DEBUG: Prize Check. My Hits: ${myResult.hits}, Min Required: ${minHits}`);
            if (myResult.hits >= minHits && minHits < 15) { // Ensure minHits is realistic "Prize" range
                return { eligible: true, reason: 'prize' };
            }
        }

        return { eligible: false };
    }

    renderDoublesForm(jornada, isLocked) {
        this.doublesContainer.innerHTML = '';
        this.doublesStatus.textContent = '';
        this.doublesStatus.className = '';
        this.btnSaveDoubles.style.display = isLocked ? 'none' : 'block';

        // Load existing doubles
        const existingExtra = this.pronosticosExtra.find(p => p.jId === this.currentJornadaId && p.mId === this.currentMemberId);
        const selections = existingExtra ? existingExtra.selection : Array(15).fill('');

        jornada.matches.forEach((match, idx) => {
            const displayIdx = idx === 14 ? 'P15' : idx + 1;
            const row = document.createElement('div');
            row.className = 'match-row';

            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            const isP15 = idx === 14;

            row.innerHTML = `
                <div class="match-info">
                    <span class="match-num" style="background:${isP15 ? '#6a1b9a' : '#eee'}; color:${isP15 ? 'white' : '#666'}">${displayIdx}</span>
                    <div class="teams-wrapper">
                        <div class="team-name home">
                            <img src="${homeLogo}" class="team-logo-small">
                            <span>${match.home}</span>
                        </div>
                        <div class="team-name away">
                            <img src="${awayLogo}" class="team-logo-small">
                            <span>${match.away}</span>
                        </div>
                    </div>
                </div>
                <div class="prediction-inputs" data-idx="${idx}">
                    ${this.renderMultiSelectButtons(idx, selections[idx], isLocked, isP15)}
                </div>
            `;
            this.doublesContainer.appendChild(row);
        });

        this.updateDoublesCounters();
    }

    renderMultiSelectButtons(idx, currentVal, disabled, isP15) {
        // currentVal is string "1", "1X", "1X2", etc.
        const options = ['1', 'X', '2'];
        let html = '';
        options.forEach(opt => {
            const isSelected = currentVal && currentVal.includes(opt);
            const activeClass = isSelected ? 'active' : '';
            html += `<button type="button" class="btn-prediction ${activeClass}" 
                        onclick="window.app.handleDoubleToggle(this, ${idx}, '${opt}', ${isP15})" 
                        ${disabled ? 'disabled' : ''}>${opt}</button>`;
        });
        return html;
    }

    handleDoubleToggle(btn, idx, sign, isP15) {
        const parent = btn.parentElement;
        const allBtns = parent.querySelectorAll('button');

        if (isP15) {
            // Single Select behavior for P15
            allBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        } else {
            // Toggle
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
            } else {
                btn.classList.add('active');
            }
        }
        this.updateDoublesCounters();
    }

    updateDoublesCounters() {
        // Scan all inputs
        let doubles = 0;
        let triples = 0;

        const rows = this.doublesContainer.querySelectorAll('.prediction-inputs');
        rows.forEach(row => {
            const idx = parseInt(row.dataset.idx);
            if (idx === 14) return; // Skip P15 for count (usually P15 doesn't count for reduction cost)

            const active = row.querySelectorAll('.btn-prediction.active').length;
            if (active === 2) doubles++;
            if (active === 3) triples++;
        });

        // Rules: 7 Doubles O 4 Triples
        this.doublesCounter.textContent = `Usado: ${doubles} Dobles, ${triples} Triples`;

        const isValid = (doubles <= 7 && triples === 0) || (doubles === 0 && triples <= 4);

        if (!isValid) {
            this.doublesCounter.style.color = '#ff5252'; // Red
            this.doublesCounter.innerHTML += ' (Inválido: Elige solo Dobles (max 7) o solo Triples (max 4))';
        } else {
            this.doublesCounter.style.color = '#ffeb3b'; // Yellow
        }
        return isValid;
    }

    async saveDoubles() {
        if (!this.updateDoublesCounters()) {
            alert('La combinación no es válida. \nReglas: Máximo 7 Dobles (sin triples) O Máximo 4 Triples (sin dobles).');
            return;
        }

        const rows = this.doublesContainer.querySelectorAll('.prediction-inputs');
        const selection = [];
        let missing = false;

        rows.forEach((row, idx) => {
            const btns = row.querySelectorAll('.btn-prediction.active');
            if (btns.length === 0) missing = true;

            // Build string "1X", "2", "1X2"
            let val = '';
            if (row.querySelector('button:nth-child(1)').classList.contains('active')) val += '1';
            if (row.querySelector('button:nth-child(2)').classList.contains('active')) val += 'X';
            if (row.querySelector('button:nth-child(3)').classList.contains('active')) val += '2';
            selection.push(val);
        });

        if (missing) {
            alert('Debes rellenar todos los signos (incluido el Pleno al 15).');
            return;
        }

        const data = {
            id: `${this.currentJornadaId}_${this.currentMemberId}`,
            jId: this.currentJornadaId,
            mId: this.currentMemberId,
            selection: selection,
            date: new Date().toISOString()
        };

        this.btnSaveDoubles.textContent = 'Guardando...';
        this.btnSaveDoubles.disabled = true;

        try {
            await window.DataService.save('pronosticos_extra', data);

            // Update local cache
            const existingIdx = this.pronosticosExtra.findIndex(p => p.id === data.id);
            if (existingIdx >= 0) this.pronosticosExtra[existingIdx] = data;
            else this.pronosticosExtra.push(data);

            this.doublesStatus.textContent = '¡Guardado correctamente!';
            this.doublesStatus.style.color = 'green';
            setTimeout(() => {
                this.doublesStatus.textContent = '';
                this.btnSaveDoubles.textContent = '💾 Guardar Quiniela de Dobles';
                this.btnSaveDoubles.disabled = false;
            }, 3000);

        } catch (e) {
            console.error(e);
            alert('Error al guardar: ' + e.message);
            this.btnSaveDoubles.textContent = '💾 Guardar Quiniela de Dobles';
            this.btnSaveDoubles.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new PronosticoManager();
});
