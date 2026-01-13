
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

        this.cacheDOM(); // Capture DOM elements immediately
        this.init();
    }




    cacheDOM() {
        this.selMember = document.getElementById('sel-member');
        this.selJornada = document.getElementById('sel-jornada');
        this.container = document.getElementById('forecast-container');
        this.statusMsg = document.getElementById('status-message');
        this.costInfo = document.getElementById('cost-info');
        this.deadlineInfo = document.getElementById('deadline-info');
        this.btnSave = document.getElementById('btn-save');

        // Doubles DOM
        this.doublesSection = document.getElementById('doubles-section');
        this.doublesContainer = document.getElementById('doubles-container');
        this.doublesCounter = document.getElementById('doubles-counter');
        this.btnSaveDoubles = document.getElementById('btn-save-doubles');
        this.btnCopyForecast = document.getElementById('btn-copy-forecast');
        this.doublesStatus = document.getElementById('doubles-status');
        this.doublesInfoHeader = document.getElementById('doubles-status-card');

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

        // Sticky Scrollbar Elements
        this.stickyScrollContainer = document.getElementById('sticky-scrollbar-container');
        this.stickyScrollContent = document.getElementById('sticky-scrollbar-content');

        // Collective View Modal
        this.btnViewJornada = document.getElementById('btn-view-jornada');
        this.viewJornadaModal = document.getElementById('view-jornada-modal');
        this.viewJornadaTitle = document.getElementById('view-jornada-title');
        this.viewJornadaContent = document.getElementById('view-jornada-content');
        this.btnCloseViewJornada = document.getElementById('btnCloseViewJornada');
        this.selModalJornada = document.getElementById('sel-modal-jornada');


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

        // Sync scroll events
        if (this.summaryContainer && this.stickyScrollContainer) {
            this.summaryContainer.addEventListener('scroll', () => {
                if (!this.isSyncingSticky) {
                    this.isSyncingFloating = true;
                    this.stickyScrollContainer.scrollLeft = this.summaryContainer.scrollLeft;
                    this.isSyncingFloating = false;
                }
            });

            this.stickyScrollContainer.addEventListener('scroll', () => {
                if (!this.isSyncingFloating) {
                    this.isSyncingSticky = true;
                    this.summaryContainer.scrollLeft = this.stickyScrollContainer.scrollLeft;
                    this.isSyncingSticky = false;
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

        // Collective View Events
        if (this.btnViewJornada) {
            this.btnViewJornada.addEventListener('click', (e) => {
                e.preventDefault();
                this.showJornadaForecasts();
            });
        }
        if (this.btnCloseViewJornada) {
            this.btnCloseViewJornada.addEventListener('click', () => {
                this.viewJornadaModal.style.display = 'none';
            });
        }
        if (this.selModalJornada) {
            this.selModalJornada.addEventListener('change', (e) => {
                this.showJornadaForecasts(e.target.value);
            });
        }

        // Doubles Save
        if (this.btnSaveDoubles) this.btnSaveDoubles.addEventListener('click', () => this.saveDoubles());
        if (this.btnCopyForecast) this.btnCopyForecast.addEventListener('click', () => this.handleCopyForecast());


        window.addEventListener('resize', () => this.updateStickyScrollbar());
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');
        this.pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || []; // New Collection

        this.populateDropdowns();
        this.renderSummaryTable();
        this.bindEvents();
    }

    // ... (populateDropdowns, updateCorrectionUI, etc remains same) ...




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
            this.currentMemberId = e.target.value; // Remove parseInt for flexibility
            this.loadForecast();
        });

        this.selJornada.addEventListener('change', (e) => {
            this.currentJornadaId = e.target.value; // Remove parseInt for flexibility
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

        // Filter journeys that have matches informed (at least one team name set)
        const informedJornadas = this.jornadas.filter(j => {
            if (!j.active || !j.matches) return false;
            return j.matches.some(m => m.home && m.home.trim() !== '');
        });

        // Sort by number descending (most recent first)
        const sortedJornadas = informedJornadas.sort((a, b) => b.number - a.number);

        sortedJornadas.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = `Jornada ${j.number} - ${j.date}`;
            this.selJornada.appendChild(opt);
        });
    }

    loadForecast() {
        this.container.innerHTML = '';
        this.container.classList.add('hidden');
        if (this.doublesSection) this.doublesSection.classList.add('hidden');
        if (this.doublesInfoHeader) this.doublesInfoHeader.style.display = 'none';
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

        // Fetch other members' forecasts for this jornada
        const othersForecasts = this.pronosticos.filter(p =>
            (p.jId === this.currentJornadaId || p.jornadaId === this.currentJornadaId) &&
            (p.mId !== this.currentMemberId && p.memberId !== this.currentMemberId)
        );

        jornada.matches.forEach((match, idx) => {
            const displayIdx = idx === 14 ? 'P15' : idx + 1;
            const row = document.createElement('div');
            row.className = 'pronostico-row';
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "15px";
            row.style.padding = "10px";
            row.style.borderBottom = "1px solid #f0f0f0";

            let disabledStr = isLocked ? 'style="pointer-events:none; opacity:0.6;"' : '';
            if (disabledStr === '' && this.correctionMode && isLockedRef) {
                // Visual cue that elements are unlocked specially
            }

            // Pleno Restriction
            if (idx === 14) {
                const bigThree = ['Real Madrid', 'Atlético de Madrid', 'FC Barcelona'];
                const isBigMatch = bigThree.includes(match.home) && bigThree.includes(match.away);
                if (!isBigMatch) {
                    disabledStr = 'style="pointer-events:none; opacity:0.3; background:transparent;" title="Pleno deshabilitado"';
                }
            }

            const val = currentSelections[idx];
            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            // Generate "Others" HTML - COMPACT VERSION (No initials, just boxes)
            let othersHtml = othersForecasts.map(of => {
                const member = this.members.find(m => m.id === of.mId || m.id === of.memberId);
                if (!member) return '';
                const sign = of.selection[idx];
                if (!sign) return '';

                const signColor = sign === '1' ? '#1976d2' : sign === 'X' ? '#757575' : '#d32f2f';

                return `
                    <div title="${member.name} ${member.surname || ''}: ${sign}" 
                         style="display:flex; justify-content:center; align-items:center; min-width:18px; height: 22px; cursor:default;">
                        <span style="font-size:0.7rem; font-weight:bold; color:${signColor}; border:1px solid ${signColor}; border-radius:3px; padding:0 4px; background:white; line-height:1;">${sign}</span>
                    </div>
                `;
            }).join('');

            // Calculate initial percentages
            const allSigns = othersForecasts.map(of => of.selection[idx]).filter(s => s);
            if (val) allSigns.push(val);
            const total = allSigns.length;
            let p1 = 0, pX = 0, p2 = 0;
            if (total > 0) {
                p1 = (allSigns.filter(s => s === '1').length / total * 100).toFixed(0);
                pX = (allSigns.filter(s => s === 'X').length / total * 100).toFixed(0);
                p2 = (allSigns.filter(s => s === '2').length / total * 100).toFixed(0);
            }

            row.innerHTML = `
                <div class="p-match-info" style="flex: 0 0 420px; min-width: 420px; border-right: 1px solid #eee; margin-right: 5px; padding-right: 10px;">
                    <span style="font-weight:bold; color:var(--primary-green); width:25px; font-size: 0.9rem;">${displayIdx}</span>
                    
                    <div style="flex:1; display:flex; justify-content:flex-end; align-items:center; gap:5px;">
                        <span style="font-size:0.95rem; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${match.home}</span>
                        <img src="${homeLogo}" class="team-logo" style="width:24px; height:24px; object-fit:contain;" onerror="this.style.display='none'">
                    </div>

                    <span style="margin:0 8px; color:#aaa;">-</span>

                    <div style="flex:1; display:flex; justify-content:flex-start; align-items:center; gap:5px;">
                        <img src="${awayLogo}" class="team-logo" style="width:24px; height:24px; object-fit:contain;" onerror="this.style.display='none'">
                        <span style="font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${match.away}</span>
                    </div>
                </div>

                <div class="p-others" style="flex: 1; display:flex; gap:2px; padding:4px; background:transparent; border:none; min-height:36px; align-items:center; justify-content: flex-start; flex-wrap: nowrap; overflow: visible;">
                    ${othersHtml || '<span style="font-size:0.65rem; color:#bbb; font-style:italic;">-</span>'}
                </div>

                <div class="p-options" ${disabledStr} data-idx="${idx}" style="flex: 0.6; display:flex; justify-content:center; gap:4px;">
                    <div class="chk-option ${val === '1' ? 'selected' : ''}" style="width:28px; height:28px; font-size:0.8rem;" onclick="window.app.selectOption(this, '1')">1</div>
                    <div class="chk-option ${val === 'X' ? 'selected' : ''}" style="width:28px; height:28px; font-size:0.8rem;" onclick="window.app.selectOption(this, 'X')">X</div>
                    <div class="chk-option ${val === '2' ? 'selected' : ''}" style="width:28px; height:28px; font-size:0.8rem;" onclick="window.app.selectOption(this, '2')">2</div>
                </div>

                <div id="consensus-${idx}" class="p-percentages" style="flex: 0.6; min-width: 75px; display:flex; flex-direction:column; justify-content:center; padding-left:10px; font-size:0.7rem; border-left: 1px solid #eee;">
                    <div style="display:flex; justify-content:space-between; color:#1976d2; line-height: 1;"><span>1:</span> <b>${p1}%</b></div>
                    <div style="display:flex; justify-content:space-between; color:#757575; line-height: 1;"><span>X:</span> <b>${pX}%</b></div>
                    <div style="display:flex; justify-content:space-between; color:#d32f2f; line-height: 1;"><span>2:</span> <b>${p2}%</b></div>
                </div>
            `;
            this.container.appendChild(row);

            // Add Dividers: 4-5 (idx 3), 8-9 (idx 7), 11-12 (idx 10), 14-15 (idx 13)
            if ([3, 7, 10, 13].includes(idx)) {
                const divider = document.createElement('div');
                divider.style.height = "2px";
                divider.style.backgroundColor = "#ccc";
                divider.style.margin = "5px 0";
                this.container.appendChild(divider);
            }
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

        // Initial cost update
        this.updateCost();
    }

    selectOption(el, val) {
        const parent = el.parentElement;
        const idx = parseInt(parent.dataset.idx);
        parent.querySelectorAll('.chk-option').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        // Update consensus in real-time
        this.updateRowConsensus(idx, val);

        // Update cost/penalty
        this.updateCost();
    }

    updateRowConsensus(idx, myVal) {
        const othersForecasts = this.pronosticos.filter(p =>
            (p.jId === this.currentJornadaId || p.jornadaId === this.currentJornadaId) &&
            (p.mId !== this.currentMemberId && p.memberId !== this.currentMemberId)
        );

        const signs = othersForecasts.map(of => of.selection[idx]).filter(s => s);
        if (myVal) signs.push(myVal);
        const total = signs.length;
        if (total === 0) return;

        const s1 = (signs.filter(s => s === '1').length / total * 100).toFixed(0);
        const sX = (signs.filter(s => s === 'X').length / total * 100).toFixed(0);
        const s2 = (signs.filter(s => s === '2').length / total * 100).toFixed(0);

        const consensusBox = document.getElementById(`consensus-${idx}`);
        if (consensusBox) {
            consensusBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; color:#1976d2;"><span>1:</span> <b>${s1}%</b></div>
                <div style="display:flex; justify-content:space-between; color:#757575;"><span>X:</span> <b>${sX}%</b></div>
                <div style="display:flex; justify-content:space-between; color:#d32f2f;"><span>2:</span> <b>${s2}%</b></div>
            `;
        }
    }

    updateCost() {
        if (!this.costInfo) return;

        // Count '1's in the first 14 matches
        let onesCount = 0;
        const rows = this.container.querySelectorAll('.p-options');
        rows.forEach(row => {
            const idx = parseInt(row.dataset.idx);
            if (idx === 14) return; // Skip P15
            const selected = row.querySelector('.chk-option.selected');
            if (selected && selected.textContent === '1') {
                onesCount++;
            }
        });

        let penalty = 0;
        let color = "var(--primary-green)";
        let msg = "";

        if (onesCount === 10) penalty = 0.10;
        else if (onesCount === 11) penalty = 0.20;
        else if (onesCount === 12) penalty = 0.30;
        else if (onesCount === 13) penalty = 0.50;
        else if (onesCount >= 14) penalty = 1.00;

        if (penalty > 0) {
            msg = `💰 Penalización: +${penalty.toFixed(2)} € (${onesCount} unos en 14 signos)`;
            color = "#ef6c00"; // Orange
        } else {
            msg = `✅ Sin penalización (${onesCount} unos)`;
            color = "var(--primary-green)";
        }

        this.costInfo.innerHTML = `<span style="font-weight:bold; color:${color}; padding: 5px 10px; border-radius: 4px; background: rgba(0,0,0,0.05);">${msg}</span>`;
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
        headerRow.innerHTML = '<th style="position:sticky; left:0; z-index:10; padding:1rem; background:var(--pronosticos-table-head-row-bg); color:var(--pronosticos-table-head-row-text); border-bottom:2px solid var(--input-border); min-width:120px;">Jornada</th>';

        sortedMembers.forEach((m, index) => {
            // Zebra striping for columns in header too
            const colBg = index % 2 !== 0 ? 'var(--pronosticos-table-col-even-bg)' : 'var(--pronosticos-table-col-odd-bg)';
            const colText = index % 2 !== 0 ? 'var(--pronosticos-table-col-even-text)' : 'var(--pronosticos-table-col-odd-text)';

            // Note: We use the column color for headers too to maintain the "column" look, 
            // but the text color comes from the header config
            headerRow.innerHTML += `<th style="padding:1rem; min-width:140px; text-align:center; border-bottom:2px solid var(--input-border); background-color: var(--pronosticos-table-head-col-bg); color: var(--pronosticos-table-head-col-text);">${m.name}</th>`;
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
            row.innerHTML = `<td style="font-weight:bold; position:sticky; left:0; background:var(--pronosticos-table-head-row-bg); color:var(--pronosticos-table-head-row-text); z-index:5; border-right:2px solid var(--input-border); padding:0.8rem;">
                <div style="font-size:1.1em; color:inherit;">J${j.number}</div>
                <div style="font-size:0.75em; opacity:0.8; margin-top:4px;">${dateFormatted}</div>
            </td>`;

            sortedMembers.forEach((m, index) => {
                const p = this.pronosticos.find(pr => pr.jId === j.id && pr.mId === m.id);

                // Alternating column colors
                const colBg = index % 2 !== 0 ? 'var(--pronosticos-table-col-even-bg)' : 'var(--pronosticos-table-col-odd-bg)';
                const colText = index % 2 !== 0 ? 'var(--pronosticos-table-col-even-text)' : 'var(--pronosticos-table-col-odd-text)';

                let cellContent = '-';
                let cellStyle = `text-align:center; vertical-align:middle; padding:0.6rem; border-bottom:1px solid var(--input-border); background-color:${colBg}; color:${colText}; cursor:pointer; transition:background-color 0.2s;`;
                let textStyle = '';

                if (p && p.selection) {
                    // Extract only first 14 matches (exclude Pleno/15)
                    const selection14 = p.selection.slice(0, 14);

                    // Create compact string: "1X2111..."
                    const summary = selection14.map(s => s || '-').join('');

                    // Status Check
                    if (p.late) {
                        textStyle = 'color: var(--pronosticos-status-late-text); font-weight:bold;';
                        cellContent = `<div style="font-family:monospace; font-size:0.95rem; letter-spacing:2px; white-space:nowrap; ${textStyle}" title="Enviado con retraso">${summary}</div>`;
                    } else {
                        textStyle = 'font-weight:500;';
                        cellContent = `<div style="font-family:monospace; font-size:0.95rem; letter-spacing:2px; white-space:nowrap; ${textStyle}">${summary}</div>`;
                    }
                } else {
                    textStyle = 'color: var(--danger); font-weight:bold;';
                    cellContent = `<span style="${textStyle}">-</span>`;
                }

                row.innerHTML += `<td class="summary-cell" data-jid="${j.id}" data-mid="${m.id}" style="${cellStyle}" onmouseover="this.style.filter='brightness(0.9)'" onmouseout="this.style.filter='none'">${cellContent}</td>`;
            });

            tbody.appendChild(row);
        });

        // After rendering, update floating scrollbar
        setTimeout(() => this.updateStickyScrollbar(), 500);
    }

    async showJornadaForecasts(specificJId = null) {
        try {
            let jId = specificJId || this.currentJornadaId;

            console.log("DEBUG: Opening Technical Panel for JID:", jId);

            // Auto-select latest jornada that HAS informed matches if none selected
            if (!jId) {
                const informed = this.jornadas
                    .filter(j => j.matches && j.matches.some(m => m.home && m.home.trim() !== ''))
                    .sort((a, b) => b.number - a.number);

                if (informed.length > 0) {
                    jId = informed[0].id;
                    console.log("DEBUG: No JID selected, auto-picked latest informed:", jId);
                }
            }

            if (!jId) {
                alert('No se puede abrir el panel: No hay jornadas configuradas con partidos.');
                return;
            }

            const jornada = this.jornadas.find(j => String(j.id) === String(jId));
            if (!jornada || !jornada.matches) {
                alert('No se encontró información de la jornada.');
                return;
            }

            // Populate Modal Dropdown if empty
            if (this.selModalJornada && (this.selModalJornada.options.length === 0 || this.selModalJornada.innerHTML.trim() === '')) {
                this.selModalJornada.innerHTML = '';
                const informed = this.jornadas
                    .filter(j => j.matches && j.matches.some(m => m.home))
                    .sort((a, b) => b.number - a.number);

                informed.forEach(j => {
                    const opt = document.createElement('option');
                    opt.value = j.id;
                    opt.textContent = `Jornada ${j.number}`;
                    this.selModalJornada.appendChild(opt);
                });
            }
            if (this.selModalJornada) this.selModalJornada.value = String(jId);

            console.log("SHOWING TECHNICAL PANEL FOR JORNADA:", jId);

            // Fetch all base forecasts for this jornada
            const allForecasts = this.pronosticos.filter(p => String(p.jId || p.jornadaId) === String(jId));

            // Fetch all doubles forecasts for this jornada
            const allDoubles = (this.pronosticosExtra || []).filter(p => String(p.jId || p.jornadaId) === String(jId));

            // Sort members alphabetically
            const sortedMembers = [...this.members].sort((a, b) => a.name.localeCompare(b.name));

            this.viewJornadaTitle.textContent = `Ver Pronósticos - Jornada ${jornada.number}`;
            this.viewJornadaContent.innerHTML = '<p style="padding:40px; font-size:1.2rem; font-weight:bold; color:#673ab7; animation: blink 1s infinite;">⚙️ Procesando datos y generando tabla...</p>';

            // Critical fix: Ensure opacity is 1 and z-index is high
            this.viewJornadaModal.style.display = 'flex';
            this.viewJornadaModal.style.opacity = '1';
            this.viewJornadaModal.style.zIndex = '999999';

            // Build Enhanced Table (Much LARGER as requested)
            let html = `
                <table style="border-collapse: collapse; font-size: 1.05rem; background: #fff; width: auto; min-width: 95%; margin-bottom: 40px; border: 3px solid var(--primary-orange); border-radius: 8px; overflow: hidden;">
                    <thead style="background: #e0e0e0; position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="border: 1px solid #ccc; padding: 15px; min-width: 50px; color: #333; font-size: 1.1rem;">#</th>
                            <th style="border: 1px solid #ccc; padding: 15px; text-align: right; min-width: 200px; color: #333; font-size: 1.1rem;">Local</th>
                            <th style="border: 1px solid #ccc; padding: 15px; text-align: left; min-width: 200px; color: #333; font-size: 1.1rem;">Visitante</th>
            `;

            // Member Columns
            sortedMembers.forEach(m => {
                html += `<th title="${m.name}" style="border: 1px solid #ccc; padding: 10px; writing-mode: vertical-lr; transform: rotate(180deg); text-align: center; height: 220px; width: 60px; min-width: 60px; font-size: 0.95rem; color: #333; font-weight: 600; white-space: nowrap;">${m.name}</th>`;
            });

            // Doubles Columns at the end
            allDoubles.forEach(() => {
                html += `<th style="border: 2px solid var(--primary-orange); padding: 10px; writing-mode: vertical-lr; transform: rotate(180deg); text-align: center; height: 220px; width: 60px; min-width: 60px; font-size: 1rem; color: #fff; background: var(--primary-orange); font-weight: bold; letter-spacing: 1px; white-space: nowrap;">Quiniela Dobles</th>`;
            });

            // "COLUMNA PERFECTA" Logic
            let perfectColumn = null;
            let perfectHits = 0;
            const allResolved = sortedMembers.every(m => allForecasts.some(p => String(p.mId || p.memberId) === String(m.id)));

            if (allResolved) {
                perfectColumn = this.calculatePerfectColumn(jornada);
                html += `<th style="border: 3px solid #ffd700; padding: 10px; writing-mode: vertical-lr; transform: rotate(180deg); text-align: center; height: 220px; width: 70px; min-width: 70px; font-size: 0.9rem; color: #000; background: linear-gradient(to bottom, #ffd700, #ffecb3); font-weight: 900; letter-spacing: 1px; white-space: nowrap; box-shadow: inset 0 0 10px rgba(0,0,0,0.1);">⭐ COLUMNA MAULA</th>`;
            }

            html += `</tr></thead><tbody>`;

            // Hit counters for summary row
            const baseHitsCount = {}; // { memberId: hits }
            const doublesHitsCount = {}; // { doubleIndex: hits }
            sortedMembers.forEach(m => baseHitsCount[m.id] = 0);
            allDoubles.forEach((_, idx) => doublesHitsCount[idx] = 0);

            jornada.matches.forEach((match, idx) => {
                const displayIdx = idx === 14 ? 'P15' : idx + 1;
                const rowStyle = [3, 7, 10, 13].includes(idx) ? 'border-bottom: 4px solid var(--primary-orange);' : 'border-bottom: 1px solid #ddd;';
                const bgColor = idx % 2 === 0 ? '#fff' : '#f5f5f5';

                const officialResult = match.result || null;

                html += `<tr style="background: ${bgColor}; ${rowStyle}">
                    <td style="border: 1px solid #ccc; padding: 10px; text-align: center; font-weight: bold; color: var(--primary-orange); font-size: 1.1rem;">${displayIdx}</td>
                    <td style="border: 1px solid #ccc; padding: 10px 20px; text-align: right; white-space: nowrap; font-weight: 600; color: #333;">${match.home}</td>
                    <td style="border: 1px solid #ccc; padding: 10px 20px; text-align: left; white-space: nowrap; font-weight: 600; color: #333;">${match.away}</td>
                `;

                // Individual Forecasts
                sortedMembers.forEach(m => {
                    const f = allForecasts.find(p => String(p.mId || p.memberId) === String(m.id));
                    let sign = '-';
                    let cellStyle = 'border: 1px solid #ccc; padding: 8px; text-align: center; width: 60px; min-width: 60px; font-weight: bold; font-size: 1.25rem;';

                    if (f && f.selection && f.selection[idx]) {
                        sign = f.selection[idx];
                        const isHit = officialResult && sign === officialResult;

                        if (sign === '1') cellStyle += 'color: #1976d2;';
                        else if (sign === 'X') cellStyle += 'color: #757575;';
                        else if (sign === '2') cellStyle += 'color: #d32f2f;';

                        if (isHit) {
                            cellStyle += 'background: #c8e6c9; border: 2px solid #2e7d32;'; // Light green for hit
                            baseHitsCount[m.id]++;
                        } else if (f.late && !f.pardoned) {
                            cellStyle += 'background: #fff3e0;';
                        }
                    }

                    html += `<td style="${cellStyle}">${sign}</td>`;
                });

                // Doubles Forecasts (Extra columns)
                allDoubles.forEach((db, dbIdx) => {
                    let sign = '-';
                    let cellStyle = 'border: 2px solid var(--primary-orange); padding: 8px; text-align: center; width: 60px; min-width: 60px; font-weight: 900; font-size: 1.3rem; color: #fff; background: var(--primary-orange);';

                    if (db.selection && db.selection[idx]) {
                        sign = db.selection[idx];
                        const isHit = officialResult && sign.includes(officialResult);

                        if (isHit) {
                            cellStyle += 'background: #81c784; color: #fff; border: 2px solid #1b5e20;'; // Darker green for doubles hit
                            doublesHitsCount[dbIdx]++;
                        }
                    }
                    html += `<td style="${cellStyle}">${sign}</td>`;
                });

                // Perfect Column Cell
                if (perfectColumn) {
                    const sign = perfectColumn[idx] || '-';
                    let cellStyle = 'border: 3px solid #ffd700; padding: 8px; text-align: center; width: 70px; min-width: 70px; font-weight: 900; font-size: 1.4rem; color: #b8860b; background: #fffde7;';
                    const isHit = officialResult && sign === officialResult;
                    if (isHit) {
                        cellStyle += 'background: #ffd700; color: #000; border: 3px solid #ffa000;';
                        perfectHits++;
                    }
                    html += `<td style="${cellStyle}">${sign}</td>`;
                }

                html += `</tr>`;
            });

            html += `</tbody>`;

            // SUMMARY ROW (Final Hits)
            html += `<tfoot style="background: #eee; position: sticky; bottom: 0; z-index: 10;">
                <tr style="border-top: 3px solid #673ab7; height: 60px;">
                    <td colspan="3" style="text-align: right; padding: 15px; font-weight: 900; color: #673ab7; font-size: 1.2rem; background: #f3e5f5;">TOTAL ACIERTOS:</td>
            `;

            sortedMembers.forEach(m => {
                const hits = baseHitsCount[m.id];
                html += `<td style="border: 1px solid #ccc; text-align: center; font-weight: 900; font-size: 1.5rem; color: #2e7d32; background: #e8f5e9;">${hits}</td>`;
            });

            allDoubles.forEach((_, idx) => {
                const hits = doublesHitsCount[idx];
                html += `<td style="border: 2px solid #673ab7; text-align: center; font-weight: 900; font-size: 1.6rem; color: #fff; background: #2e7d32;">${hits}</td>`;
            });

            if (perfectColumn) {
                html += `<td style="border: 3px solid #ffa000; text-align: center; font-weight: 900; font-size: 1.8rem; color: #000; background: #ffd700;">${perfectHits}</td>`;
            }

            html += `</tr></tfoot></table>`;

            this.viewJornadaContent.innerHTML = html;
            this.viewJornadaContent.style.overflowY = 'auto';

            // Verify visibility logic
            if (window.getComputedStyle(this.viewJornadaModal).opacity === "0") {
                this.viewJornadaModal.style.opacity = '1';
            }

        } catch (err) {
            console.error("CRITICAL ERROR IN TECHNICAL PANEL:", err);
            alert("Error al abrir el panel técnico: " + err.message);
            if (this.viewJornadaModal) this.viewJornadaModal.style.display = 'none';
        }
    }

    updateStickyScrollbar() {
        if (!this.summaryContainer || !this.stickyScrollContainer || !this.summaryTable) return;

        const tableWidth = this.summaryTable.offsetWidth;
        const containerWidth = this.summaryContainer.offsetWidth;

        if (tableWidth > containerWidth) {
            this.stickyScrollContainer.style.display = 'block';
            this.stickyScrollContent.style.width = tableWidth + 'px';
            // Sync initial state
            this.stickyScrollContainer.scrollLeft = this.summaryContainer.scrollLeft;
        } else {
            this.stickyScrollContainer.style.display = 'none';
        }
    }
    /**
     * REESCRITURA TOTAL: Lógica de elegibilidad para dobles.
     * Incluye sistema de DESEMPATE para garantizar un único ganador.
     */
    checkEligibility(currentJornadaNum, memberId) {
        if (currentJornadaNum <= 1) return { eligible: false };

        // 1. Encontrar la jornada previa REAL
        const sortedJornadas = [...this.jornadas].sort((a, b) => a.number - b.number);
        const prevJornada = sortedJornadas.filter(j => j.number < currentJornadaNum).pop();

        if (!prevJornada || !prevJornada.matches) {
            console.log("DOUBLES: No hay jornada previa registrada.");
            return { eligible: false };
        }

        // 2. Extraer resultados
        const officialResults = prevJornada.matches.map(m => m.result);
        const resultsFound = officialResults.filter(r => r && r !== '-').length;
        const jDate = AppUtils.parseDate(prevJornada.date);

        if (resultsFound < 14) {
            console.log(`DOUBLES: J${prevJornada.number} aún no tiene resultados suficientes.`);
            return { eligible: false };
        }

        // 3. CALCULAR DATOS DE TODOS LOS SOCIOS PARA LA JORNADA PREVIA
        const prizeThreshold = prevJornada.minHitsToWin || 10;
        const leaderboard = this.members.map(m => {
            const p = this.pronosticos.find(pred => {
                const pJid = String(pred.jId || pred.jornadaId || '');
                const pMid = String(pred.mId || pred.memberId || '');
                return pJid === String(prevJornada.id) && pMid === String(m.id);
            });

            if (!p || !p.selection) {
                return { id: String(m.id), name: m.name, points: -5, hits: 0, isLate: false, isPardoned: false };
            }

            const isLate = p.late && !p.pardoned;
            const isPardoned = p.pardoned || false;

            if (isLate) {
                return { id: String(m.id), name: m.name, points: ScoringSystem.calculateScore(0, jDate), hits: 0, isLate: true, isPardoned: false };
            }

            const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
            return { id: String(m.id), name: m.name, points: ev.points, hits: ev.hits, isLate: p.late || false, isPardoned: isPardoned };
        });

        // 4. FILTRAR CANDIDATOS ELEGIBLES: excluir tarde sin premio ni perdón
        const eligibleForWinner = leaderboard.filter(l => {
            // Can compete if: not late, OR late but pardoned, OR late but got prize
            if (!l.isLate) return true;
            if (l.isPardoned) return true;
            if (l.hits >= prizeThreshold) return true;
            return false;
        });

        if (eligibleForWinner.length === 0) {
            console.log(`DOUBLES: Ningún socio elegible en J${prevJornada.number}`);
            return { eligible: false };
        }

        // 5. ENCONTRAR MÁXIMO DE PUNTOS
        const maxPoints = Math.max(...eligibleForWinner.map(l => l.points));
        let winnerCandidates = eligibleForWinner.filter(l => l.points === maxPoints);

        console.log(`DOUBLES: J${prevJornada.number} - Candidatos con ${maxPoints} puntos:`, winnerCandidates.map(c => c.name));

        // 6. DESEMPATE RECURSIVO SI HAY EMPATE
        if (winnerCandidates.length > 1) {
            console.log(`DOUBLES: Empate detectado, aplicando desempate recursivo...`);
            winnerCandidates = this.resolveTieEligibility(winnerCandidates, prevJornada.number);
        }

        // 7. El ganador es el primero de la lista
        let absoluteWinnerId = null;
        if (winnerCandidates.length > 0 && winnerCandidates[0].points > -5) {
            absoluteWinnerId = winnerCandidates[0].id;
            console.log(`🏆 GANADOR ÚNICO J${prevJornada.number}: ${winnerCandidates[0].name} (${winnerCandidates[0].points} pts)`);
        }

        // 8. Verificación para el socio actual
        const isEligible = absoluteWinnerId && String(memberId) === String(absoluteWinnerId);

        if (isEligible) {
            console.log(`✅ ACCESO CONCEDIDO A DOBLES para ${this.members.find(m => String(m.id) === String(memberId))?.name}`);
        }

        return {
            eligible: isEligible,
            reason: isEligible ? 'winner' : 'not_winner'
        };
    }

    /**
     * Desempate recursivo: mira jornadas anteriores hasta encontrar un único ganador
     */
    resolveTieEligibility(candidates, currentJornadaNum) {
        const sortedJornadas = [...this.jornadas].sort((a, b) => a.number - b.number);
        let currentCandidates = [...candidates];

        // Empezar desde la jornada anterior a currentJornadaNum
        let checkJornadaNum = currentJornadaNum - 1;

        while (currentCandidates.length > 1 && checkJornadaNum >= 1) {
            const checkJornada = sortedJornadas.find(j => j.number === checkJornadaNum);

            if (!checkJornada || !checkJornada.matches) {
                checkJornadaNum--;
                continue;
            }

            const officialResults = checkJornada.matches.map(m => m.result);
            const resultsFound = officialResults.filter(r => r && r !== '-').length;

            if (resultsFound < 14) {
                checkJornadaNum--;
                continue;
            }

            const jDate = AppUtils.parseDate(checkJornada.date);

            // Calcular puntos de cada candidato en esta jornada histórica
            const historicalScores = currentCandidates.map(candidate => {
                const p = this.pronosticos.find(pred => {
                    const pJid = String(pred.jId || pred.jornadaId || '');
                    const pMid = String(pred.mId || pred.memberId || '');
                    return pJid === String(checkJornada.id) && pMid === String(candidate.id);
                });

                let points = -5;
                if (p && p.selection) {
                    const isLate = p.late && !p.pardoned;
                    if (isLate) {
                        points = ScoringSystem.calculateScore(0, jDate);
                    } else {
                        const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
                        points = ev.points;
                    }
                }

                return { id: candidate.id, name: candidate.name, points: points };
            });

            // Encontrar el máximo de puntos en esta jornada histórica
            const maxHistoricalPoints = Math.max(...historicalScores.map(s => s.points));
            const survivors = historicalScores.filter(s => s.points === maxHistoricalPoints);

            console.log(`DOUBLES: Desempate en J${checkJornadaNum} - Max puntos: ${maxHistoricalPoints}, Supervivientes:`, survivors.map(s => s.name));

            // Filtrar candidatos que sobreviven
            currentCandidates = currentCandidates.filter(c =>
                survivors.some(s => s.id === c.id)
            );

            checkJornadaNum--;
        }

        return currentCandidates;
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
            row.className = 'pronostico-row';
            // Force exact same inline styling as Main Forecast
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "15px";
            row.style.padding = "10px";
            row.style.borderBottom = "1px solid #f0f0f0";


            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            const isP15 = idx === 14;

            // Adjusted layout to be more compact
            row.innerHTML = `
                <div class="p-match-info" style="flex: 2; min-width: 0; border: none; padding-right: 5px;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-weight:bold; color:var(--primary-green); font-size: 0.8rem; width: 22px;">${displayIdx}</span>
                        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:2px;">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <img src="${homeLogo}" class="team-logo" style="width:16px; height:16px; object-fit:contain;" onerror="this.style.display='none'">
                                    <span style="font-size:0.8rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${match.home}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:5px;">
                                <img src="${awayLogo}" class="team-logo" style="width:16px; height:16px; object-fit:contain;" onerror="this.style.display='none'">
                                    <span style="font-size:0.8rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${match.away}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="prediction-inputs" data-idx="${idx}" style="flex: 0 0 auto; display:flex; gap:3px; align-items:center;">
                    ${isP15 ? this.renderP15Inputs(idx, selections[idx], isLocked) : this.renderMultiSelectButtons(idx, selections[idx], isLocked)}
                </div>
            `;
            this.doublesContainer.appendChild(row);

            // Add Dividers: 4-5 (idx 3), 8-9 (idx 7), 11-12 (idx 10), 14-15 (idx 13)
            if ([3, 7, 10, 13].includes(idx)) {
                const divider = document.createElement('div');
                divider.style.height = "2px";
                divider.style.backgroundColor = "#ccc";
                divider.style.margin = "5px 0";
                this.doublesContainer.appendChild(divider);
            }
        });

        this.updateDoublesCounters();
    }

    renderMultiSelectButtons(idx, currentVal, disabled, isP15) {
        // currentVal is string "1", "1X", "1X2", etc.
        const options = ['1', 'X', '2'];
        let html = '';
        options.forEach(opt => {
            const isSelected = currentVal && currentVal.includes(opt);
            // Use same styles as chk-option but slightly smaller for side panel
            const activeStyle = isSelected ? 'background-color:var(--primary-green); color:white; border-color:var(--primary-green);' : '';

            html += `<div class="chk-option ${isSelected ? 'selected' : ''}"
            style="width:30px; height:30px; font-size:0.9rem; ${activeStyle}"
            onclick="window.app.handleDoubleToggle(this, ${idx}, '${opt}', ${isP15})" 
                        ${disabled ? 'disabled' : ''}>${opt}</div>`;
        });
        return html;
    }

    renderP15Inputs(idx, currentVal, disabled) {
        // currentVal is usually "HomeGoals-AwayGoals" e.g "M-1"
        const [hVal, aVal] = currentVal ? currentVal.split('-') : ['', ''];
        const options = ['0', '1', '2', 'M'];

        const renderGroup = (team, selected) => {
            let html = `<div style="display:flex; gap:1px; margin-right:4px;">`;
            options.forEach(opt => {
                const isSel = opt === selected;
                const style = isSel ? 'background-color:var(--primary-orange); color:white; border-color:var(--primary-orange);' : 'font-size:0.75rem; padding:0;';
                html += `<div class="p15-option ${isSel ? 'selected' : ''}"
            data-team="${team}" data-val="${opt}"
            style="width:20px; height:20px; display:flex; align-items:center; justify-content:center; border:1px solid #ccc; cursor:pointer; ${style}"
            onclick="window.app.handleP15Toggle(this, ${idx}, '${team}', '${opt}')" 
                        ${disabled ? 'disabled' : ''}>${opt}</div>`;
            });
            html += `</div>`;
            return html;
        };

        return `<div style="display:flex; flex-direction:column; gap:2px;">
                ${renderGroup('home', hVal)}
                    ${renderGroup('away', aVal)}
                </div>`;
    }

    handleP15Toggle(btn, idx, team, val) {
        // Find parent container for this team
        const wrapper = btn.parentElement;
        const all = wrapper.querySelectorAll('.p15-option');
        all.forEach(b => {
            b.classList.remove('selected');
            b.style.backgroundColor = '';
            b.style.color = '';
            b.style.borderColor = '#ccc';
        });

        btn.classList.add('selected');
        btn.style.backgroundColor = 'var(--primary-orange)';
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--primary-orange)';
    }

    handleDoubleToggle(btn, idx, sign, isP15) {
        const parent = btn.parentElement;
        const allBtns = parent.querySelectorAll('.chk-option');

        if (isP15) {
            // Single Select behavior for P15
            // Single Select behavior for P15
            allBtns.forEach(b => {
                b.classList.remove('selected');
                b.style.backgroundColor = '';
                b.style.color = '';
                b.style.borderColor = '';
            });
            btn.classList.add('selected');
            btn.style.backgroundColor = 'var(--primary-green)';
            btn.style.color = 'white';
            btn.style.borderColor = 'var(--primary-green)';
        } else {
            // Toggle
            if (btn.classList.contains('selected')) {
                btn.classList.remove('selected');
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.borderColor = '';
            } else {
                btn.classList.add('selected');
                btn.style.backgroundColor = 'var(--primary-green)';
                btn.style.color = 'white';
                btn.style.borderColor = 'var(--primary-green)';
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

            const active = row.querySelectorAll('.chk-option.selected').length;
            if (active === 2) doubles++;
            if (active === 3) triples++;
        });

        // Rules: Exactly 7 Doubles OR Exactly 4 Triples
        const isValid = (doubles === 7 && triples === 0) || (doubles === 0 && triples === 4);

        this.doublesCounter.textContent = `${doubles} Dobles, ${triples} Triples`;

        if (!isValid) {
            this.doublesCounter.style.color = '#ff5252'; // Red
            this.doublesCounter.style.backgroundColor = '#ffebee';
            this.doublesCounter.style.border = "1px solid red";
            this.doublesCounter.innerHTML += '<br><span style="font-size:0.7rem;">(Error: Deben ser EXACTAMENTE 7 Dobles o 4 Triples)</span>';
        } else {
            this.doublesCounter.style.color = '#ffeb3b'; // Yellow
            this.doublesCounter.style.backgroundColor = 'rgba(0,0,0,0.2)';
            this.doublesCounter.style.border = "none";
        }
        return isValid;
    }

    async saveDoubles() {
        if (!this.updateDoublesCounters()) {
            alert('La combinación no es válida. \n\nPara poder guardar, debes seleccionar EXACTAMENTE:\n- 7 Dobles (y 0 Triples)\nO bien\n- 4 Triples (y 0 Dobles)');
            return;
        }

        const rows = this.doublesContainer.querySelectorAll('.prediction-inputs');
        const selection = [];
        let missing = false;

        rows.forEach((row, idx) => {
            if (idx === 14) {
                // P15 Logic
                const homeMsg = row.querySelector('.p15-option[data-team="home"].selected');
                const awayMsg = row.querySelector('.p15-option[data-team="away"].selected');

                if (!homeMsg || !awayMsg) {
                    missing = true;
                    selection.push('');
                } else {
                    selection.push(`${homeMsg.dataset.val}-${awayMsg.dataset.val}`);
                }
            } else {
                const btns = row.querySelectorAll('.chk-option.selected');
                if (btns.length === 0) missing = true;

                // Build string "1X", "2", "1X2"
                let val = '';
                // Assuming order 0=1, 1=X, 2=2
                const optionDivs = row.querySelectorAll('.chk-option');
                if (optionDivs[0].classList.contains('selected')) val += '1';
                if (optionDivs[1].classList.contains('selected')) val += 'X';
                if (optionDivs[2].classList.contains('selected')) val += '2';
                selection.push(val);
            }
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
    handleCopyForecast() {
        // 1. Get Normal Forecast
        const normalRows = this.container.querySelectorAll('.p-options');
        const normalSelections = [];
        let hasData = false;

        normalRows.forEach(row => {
            const selected = row.querySelector('.selected');
            if (selected) {
                normalSelections.push(selected.textContent.trim());
                hasData = true;
            } else {
                normalSelections.push('');
            }
        });

        if (!hasData) {
            alert("No hay pronóstico base seleccionado para copiar.");
            return;
        }

        // 2. Check Doubles Target
        const doublesRows = this.doublesContainer.querySelectorAll('.prediction-inputs');
        let hasExistingDoubles = false;
        doublesRows.forEach(row => {
            if (row.querySelectorAll('.chk-option.selected').length > 0) hasExistingDoubles = true;
        });

        if (hasExistingDoubles) {
            if (!confirm("⚠️ ¡ATENCIÓN!\n\nSe sobrescribirá tu quiniela de dobles actual con los datos del pronóstico base.\n\n¿Estás seguro de continuar?")) {
                return;
            }
        }

        // 3. Apply Copy
        doublesRows.forEach((row, idx) => {
            const val = normalSelections[idx];

            // Clear current row
            const options = row.querySelectorAll('.chk-option');
            options.forEach(opt => {
                opt.classList.remove('selected');
                opt.style.backgroundColor = '';
                opt.style.color = '';
                opt.style.borderColor = '';
            });

            if (val) {
                // Find correct button and click/activate it
                const targetBtn = Array.from(options).find(opt => opt.textContent.trim() === val);
                if (targetBtn) {
                    targetBtn.classList.add('selected');
                    targetBtn.style.backgroundColor = 'var(--primary-green)';
                    targetBtn.style.color = 'white';
                    targetBtn.style.borderColor = 'var(--primary-green)';
                }
            }
        });

        this.updateDoublesCounters();
        this.doublesStatus.innerHTML = '<span style="color:blue;">✅ Copiado desde base. Revisa y guarda.</span>';
    }

    calculatePerfectColumn(currentJornada) {
        // To build the perfect column, we need to analyze historical performance per match index
        const memberPerformancePerMatch = {}; // { memberId: [hits_at_idx_0, hits_at_idx_1, ...] }
        const currentClassification = [...this.members].map(m => {
            const forecasts = this.pronosticos.filter(p => String(p.mId || p.memberId) === String(m.id));
            let totalPoints = 0;
            forecasts.forEach(p => {
                const j = this.jornadas.find(jor => String(jor.id) === String(p.jId || p.jornadaId));
                if (j && j.matches) {
                    const results = j.matches.map(mt => mt.result);
                    if (results.some(r => r)) {
                        const ev = ScoringSystem.evaluateForecast(p.selection || [], results);
                        totalPoints += ev.points;
                    }
                }
            });
            return { id: m.id, points: totalPoints };
        }).sort((a, b) => b.points - a.points);

        // 1. Calculate how many times each member hit each match index
        this.members.forEach(m => {
            memberPerformancePerMatch[m.id] = Array(15).fill(0);
            const mForecasts = this.pronosticos.filter(p => String(p.mId || p.memberId) === String(m.id));

            mForecasts.forEach(p => {
                const j = this.jornadas.find(jor => String(jor.id) === String(p.jId || p.jornadaId));
                if (j && j.matches) {
                    const results = j.matches.map(mt => mt.result);
                    if (results.some(r => r)) {
                        (p.selection || []).forEach((sel, idx) => {
                            if (sel && sel === results[idx]) memberPerformancePerMatch[m.id][idx]++;
                        });
                    }
                }
            });
        });

        const perfectCol = [];
        const currentJForecasts = this.pronosticos.filter(p => String(p.jId || p.jornadaId) === String(currentJornada.id));

        for (let i = 0; i < 15; i++) {
            // Find member(s) with max historical hits for this specific match index i
            let maxHits = -1;
            let expertIds = [];
            this.members.forEach(m => {
                const hits = memberPerformancePerMatch[m.id][i];
                if (hits > maxHits) {
                    maxHits = hits;
                    expertIds = [m.id];
                } else if (hits === maxHits && hits > 0) {
                    expertIds.push(m.id);
                }
            });

            const currentSignFrequency = {}; // Sign -> count of experts choosing it
            expertIds.forEach(eid => {
                const p = currentJForecasts.find(f => String(f.mId || f.memberId) === String(eid));
                if (p && p.selection && p.selection[i]) {
                    const s = p.selection[i];
                    currentSignFrequency[s] = (currentSignFrequency[s] || 0) + 1;
                }
            });

            const signs = Object.keys(currentSignFrequency);
            if (signs.length === 0) {
                perfectCol.push('-');
                continue;
            }

            // Find sign(s) with max frequency among experts
            let maxFreq = -1;
            let topSigns = [];
            signs.forEach(s => {
                if (currentSignFrequency[s] > maxFreq) {
                    maxFreq = currentSignFrequency[s];
                    topSigns = [s];
                } else if (currentSignFrequency[s] === maxFreq) {
                    topSigns.push(s);
                }
            });

            if (topSigns.length === 1) {
                perfectCol.push(topSigns[0]);
            } else {
                // Tie-break: Sign chosen by the best-ranked member among those who chose a topSign
                let finalSign = topSigns[0];

                for (const rank of currentClassification) {
                    const p = currentJForecasts.find(f => String(f.mId || f.memberId) === String(rank.id));
                    if (p && p.selection && p.selection[i] && topSigns.includes(p.selection[i])) {
                        finalSign = p.selection[i];
                        break;
                    }
                }
                perfectCol.push(finalSign);
            }
        }

        return perfectCol;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new PronosticoManager();
});
