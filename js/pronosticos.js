
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

        // Mundo Deportivo Analysis & Standings State
        this.mdAnalysisData = null;
        this.currentJornadaHasMDAnalysis = false;
        this.selectedMDMatchIdx = 0;
        this.currentMDView = 'analysis';

        this.cacheDOM(); // Capture DOM elements immediately
        this.init();
    }

    cacheDOM() {
        this.selMember = document.getElementById('sel-member');
        this.selJornada = document.getElementById('sel-jornada');
        this.activeSelectionInfo = document.getElementById('active-selection-info');
        this.selMethod = document.getElementById('sel-method');
        this.container = document.getElementById('forecast-container');
        this.statusMsg = document.getElementById('status-message');
        this.costInfo = document.getElementById('cost-info');
        this.deadlineInfo = document.getElementById('deadline-info');
        this.btnSave = document.getElementById('btn-save');
        this.mdAnalysisSidebar = document.getElementById('md-analysis-sidebar');
        this.editorForecastCol = document.getElementById('editor-forecast-column');

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

        // Collective View Modal
        this.btnViewJornada = document.getElementById('btn-view-jornada');
        this.viewJornadaModal = document.getElementById('view-jornada-modal');
        this.viewJornadaTitle = document.getElementById('view-jornada-title');
        this.viewJornadaContent = document.getElementById('view-jornada-content');
        this.btnCloseViewJornada = document.getElementById('btnCloseViewJornada');
        this.btnCloseMobileFloat = document.getElementById('btn-close-mobilefloat');
        this.selModalJornada = document.getElementById('sel-modal-jornada');
        this.btnPrevJornada = document.getElementById('btn-prev-jornada');
        this.btnNextJornada = document.getElementById('btn-next-jornada');
        this.btnLoadForecast = document.getElementById('btn-load-forecast');
        this.btnClearForecast = document.getElementById('btn-clear-forecast');

        // Help Doubles Modal
        this.btnHelpDoubles = document.getElementById('btn-help-doubles');
        this.helpModal = document.getElementById('help-doubles-modal');
        this.btnCloseHelp = document.getElementById('btnCloseHelpDoubles');
        this.mobileTabs = document.getElementById('mobile-help-tabs');
        this.btnShowPhysical = document.getElementById('btn-show-physical');
        this.btnShowDigital = document.getElementById('btn-show-digital');
        this.physicalSection = document.getElementById('help-physical-section');
        this.digitalSection = document.getElementById('help-digital-section');
        this.marksPhysical = document.getElementById('marks-physical');
        this.marksDigital = document.getElementById('marks-digital');


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
                    if (jId) {
                        if (mId) {
                            this.selectAndLoad(jId, mId);
                        } else if (cell.dataset.isdoubles) {
                            const parsedJId = parseInt(jId) || jId;
                            const jornada = this.jornadas.find(j => j.id == parsedJId);
                            let targetMemberId = null;
                            if (jornada && typeof this.checkEligibility === 'function') {
                                let firstPrizeId = null;
                                for (const m of this.members) {
                                    const elig = this.checkEligibility(jornada.number, m.id);
                                    if (elig && elig.isWinner) {
                                        targetMemberId = m.id;
                                        break;
                                    }
                                    if (elig && elig.eligible && !firstPrizeId) {
                                        firstPrizeId = m.id;
                                    }
                                }
                                if (!targetMemberId && firstPrizeId) {
                                    targetMemberId = firstPrizeId;
                                }
                            }
                            if (!targetMemberId && this.members && this.members.length > 0) {
                                targetMemberId = this.members[0].id;
                            }
                            if (targetMemberId) {
                                this.selectAndLoad(parsedJId, targetMemberId);
                            }
                        }
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
            this.auditModal.classList.remove('active');
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
        if (this.btnCloseMobileFloat) {
            this.btnCloseMobileFloat.addEventListener('click', () => {
                this.viewJornadaModal.style.display = 'none';
            });
        }
        if (this.selModalJornada) {
            this.selModalJornada.addEventListener('change', (e) => {
                this.showJornadaForecasts(e.target.value);
            });
        }

        // Navigation Arrow Events
        if (this.btnPrevJornada) {
            this.btnPrevJornada.addEventListener('click', () => {
                this.navigateJornada('prev');
            });
        }
        if (this.btnNextJornada) {
            this.btnNextJornada.addEventListener('click', () => {
                this.navigateJornada('next');
            });
        }


        if (this.btnSaveDoubles) this.btnSaveDoubles.addEventListener('click', () => this.saveDoubles());
        if (this.btnCopyForecast) this.btnCopyForecast.addEventListener('click', () => this.handleCopyForecast());

        if (this.btnHelpDoubles) this.btnHelpDoubles.addEventListener('click', () => this.showHelpDoubles());
        if (this.btnCloseHelp) this.btnCloseHelp.addEventListener('click', () => {
            this.helpModal.style.display = 'none';
            this.helpModal.classList.remove('active');
        });
        if (this.btnShowPhysical) this.btnShowPhysical.addEventListener('click', () => this.switchHelpView('physical'));
        if (this.btnShowDigital) this.btnShowDigital.addEventListener('click', () => this.switchHelpView('digital'));
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        const data = await window.DataService.loadSeasonData();
        this.members = data.members;
        this.jornadas = data.jornadas;
        this.pronosticos = data.pronosticos;
        this.pronosticosExtra = data.pronosticosExtra;

        // Cargar análisis y clasificaciones de Mundo Deportivo
        await this.loadMDAnalysisData();

        if (window.DiceService) {
            try {
                const diceApplied = await window.DiceService.checkAndApplyDice(this.members, this.jornadas, this.pronosticos);
                if (diceApplied && diceApplied.length > 0 && window.TelegramService) {
                    const activeJornadas = (this.jornadas || []).filter(j => j && j.active).sort((a, b) => (parseInt(b.number) || 0) - (parseInt(a.number) || 0));
                    const targetJornada = activeJornadas[0] || (this.jornadas && this.jornadas[0]);
                    if (targetJornada) {
                        window.TelegramService.checkHabemusQuinielam(targetJornada.id, false, this.pronosticos);
                    }
                }
            } catch (errDice) {
                console.error("Error ejecutando DiceService:", errDice);
            }
        }

        // Auto-verificación de Habemus Quinielam en inicio: si la jornada activa está completa y no se ha enviado aún
        if (window.TelegramService) {
            try {
                const activeJornadas = (this.jornadas || []).filter(j => j && j.active).sort((a, b) => (parseInt(b.number) || 0) - (parseInt(a.number) || 0));
                const targetJornada = activeJornadas[0] || (this.jornadas && this.jornadas[0]);
                if (targetJornada && !targetJornada.habemusSent) {
                    window.TelegramService.checkHabemusQuinielam(targetJornada.id, false, this.pronosticos);
                }
            } catch (errHabInit) {
                console.error("Error comprobando Habemus en init:", errHabInit);
            }
        }

        this.populateDropdowns();

        // 1. Auto-selección inmediata del usuario autenticado en la sesión
        const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
        if (userStr) {
            try {
                const u = JSON.parse(userStr);
                const found = (this.members || []).find(m => 
                    String(m.id) === String(u.id) ||
                    (u.email && m.email && m.email.toLowerCase() === u.email.toLowerCase()) ||
                    (u.name && m.name && m.name.toLowerCase() === u.name.toLowerCase()) ||
                    (u.phone && m.phone && m.phone.toLowerCase() === u.phone.toLowerCase())
                );
                if (found) {
                    this.currentMemberId = String(found.id);
                    if (this.selMember) this.selMember.value = this.currentMemberId;
                }
            } catch(e) {}
        }

        if (!this.currentMemberId && this.selMember && this.selMember.value) {
            this.currentMemberId = this.selMember.value;
        }
        if (!this.currentJornadaId) {
            const nextJToPlay = this.getNextJornadaToPlay();
            if (nextJToPlay) {
                this.currentJornadaId = nextJToPlay.id;
                if (this.selJornada) this.selJornada.value = nextJToPlay.id;
            } else if (this.selJornada && this.selJornada.value) {
                this.currentJornadaId = this.selJornada.value;
            }
        }
        this.renderSummaryTable();
        this.bindEvents();
        this.updateActiveSelectionUI();
        if (this.currentMemberId && this.currentJornadaId) {
            this.loadForecast();
        }
        this._initialRenderDone = true;
    }

    // ... (populateDropdowns, updateCorrectionUI, etc remains same) ...




    updateCorrectionUI() {
        const chkMobile = document.getElementById('chk-correction-mode-mobile');
        if (this.chkCorrection) this.chkCorrection.checked = !!this.correctionMode;
        if (chkMobile) chkMobile.checked = !!this.correctionMode;

        if (this.chkCorrection) {
            const slider = this.chkCorrection.nextElementSibling;
            if (slider) {
                slider.style.backgroundColor = this.correctionMode ? 'var(--primary-orange)' : '';
            }
        }
        if (this.lblCorrection) {
            this.lblCorrection.style.color = this.correctionMode ? 'var(--primary-orange)' : '';
            this.lblCorrection.textContent = this.correctionMode ? "MODO CORRECCIÓN ACTIVO" : "Modo Corrección";
        }
    }

    bindEvents() {
        if (this.selMember) {
            this.selMember.addEventListener('change', (e) => {
                this.currentMemberId = e.target.value;
                this.loadForecast();
            });
        }

        if (this.selJornada) {
            this.selJornada.addEventListener('change', (e) => {
                this.currentJornadaId = e.target.value;
                this.loadForecast();
            });
        }

        this.btnSave.addEventListener('click', () => this.saveForecast());
        if (this.btnClearForecast) {
            this.btnClearForecast.addEventListener('click', () => this.handleClearForecast());
        }
    }

    selectAndLoad(jId, mId) {
        const parsedJId = parseInt(jId) || jId;
        const parsedMId = parseInt(mId) || mId;

        this.currentJornadaId = parsedJId;
        this.currentMemberId = parsedMId;

        this.updateSummaryHeaderLeds();

        // Try to sync Dropdowns if present
        if (this.selJornada) {
            const opt = this.selJornada.querySelector(`option[value="${parsedJId}"]`);
            if (opt) {
                this.selJornada.value = parsedJId;
            } else {
                this.selJornada.value = '';
            }
        }

        if (this.selMember) {
            const opt = this.selMember.querySelector(`option[value="${parsedMId}"]`);
            if (opt) this.selMember.value = parsedMId;
        }

        // Highlight active cell in summary table
        if (this.summaryTable) {
            this.summaryTable.querySelectorAll('.summary-cell.active-cell').forEach(c => c.classList.remove('active-cell'));
            const activeCell = this.summaryTable.querySelector(`td.summary-cell[data-jid="${parsedJId}"][data-mid="${parsedMId}"]`);
            if (activeCell) {
                activeCell.classList.add('active-cell');
            }
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

    updateActiveSelectionUI() {
        if (!this.activeSelectionInfo) return;

        if (!this.currentMemberId || !this.currentJornadaId) {
            this.activeSelectionInfo.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 0.95rem; flex-wrap: wrap;">
                    <span style="font-size: 1.2rem;">👇</span>
                    <span>Haz clic en una casilla del <strong>Resumen de Pronósticos</strong> inferior para ver o rellenar la quiniela.</span>
                </div>
            `;
            return;
        }

        const existing = this.pronosticos.find(p => (String(p.jId) === String(this.currentJornadaId) || String(p.jornadaId) === String(this.currentJornadaId)) && (String(p.mId) === String(this.currentMemberId) || String(p.memberId) === String(this.currentMemberId)));

        const diceBadgeHtml = (existing && existing.isDice) ? `
            <span style="background: rgba(103, 58, 183, 0.12); color: #a78bfa; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; border: 1px solid rgba(167, 139, 250, 0.4); display: inline-flex; align-items: center; gap: 6px;" title="Rellenado automáticamente por El Dado de Quinielas">
                🎲 <span>Relleno con Dado</span>
            </span>
        ` : '';

        this.activeSelectionInfo.innerHTML = diceBadgeHtml ? `
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                ${diceBadgeHtml}
            </div>
        ` : '';
    }

    closeForecast() {
        this.currentMemberId = null;
        this.currentJornadaId = null;
        this.container.innerHTML = '';
        this.container.classList.add('hidden');
        if (this.doublesSection) this.doublesSection.classList.add('hidden');
        if (this.doublesInfoHeader) this.doublesInfoHeader.style.display = 'none';
        this.btnSave.style.display = 'none';
        if (this.btnClearForecast) this.btnClearForecast.style.display = 'none';
        this.statusMsg.textContent = '';
        this.deadlineInfo.textContent = '';
        if (this.costInfo) this.costInfo.textContent = '';
        if (this.mdAnalysisSidebar) {
            this.mdAnalysisSidebar.classList.add('hidden');
            this.mdAnalysisSidebar.classList.remove('flex', 'lg:col-span-5', 'xl:col-span-4');
        }
        const mobileTopBar = document.getElementById('md-mobile-top-bar');
        if (mobileTopBar) {
            mobileTopBar.classList.add('hidden');
            mobileTopBar.classList.remove('flex');
        }
        const sourceBarBase = document.getElementById('md-source-bar-base');
        if (sourceBarBase) {
            sourceBarBase.classList.add('hidden');
            sourceBarBase.classList.remove('flex');
        }
        const mobileTopBarDoubles = document.getElementById('md-mobile-top-bar-doubles');
        if (mobileTopBarDoubles) {
            mobileTopBarDoubles.classList.add('hidden');
            mobileTopBarDoubles.classList.remove('flex');
        }
        const sourceBarDoubles = document.getElementById('md-source-bar-doubles');
        if (sourceBarDoubles) {
            sourceBarDoubles.classList.add('hidden');
            sourceBarDoubles.classList.remove('flex');
        }
        if (this.editorForecastCol) {
            this.editorForecastCol.classList.remove('lg:col-span-7', 'xl:col-span-8');
            this.editorForecastCol.classList.add('lg:col-span-12');
        }
        if (this.summaryTable) {
            this.summaryTable.querySelectorAll('.summary-cell.active-cell').forEach(c => c.classList.remove('active-cell'));
        }
        this.updateSummaryHeaderLeds();
        this.updateActiveSelectionUI();
    }

    populateDropdowns() {
        if (this.selMember) {
            this.selMember.innerHTML = '';
            const sortedMembers = [...this.members].sort((a, b) => parseInt(a.id) - parseInt(b.id));

            sortedMembers.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = AppUtils.getMemberName(m);
                this.selMember.appendChild(opt);
            });

            // Preseleccionar automáticamente el socio conectado
            try {
                const userStr = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
                if (userStr) {
                    const u = JSON.parse(userStr);
                    const found = this.members.find(m => 
                        String(m.id) === String(u.id) ||
                        (u.email && m.email && m.email.toLowerCase() === u.email.toLowerCase()) ||
                        (u.name && m.name && m.name.toLowerCase() === u.name.toLowerCase()) ||
                        (u.phone && m.phone && m.phone.toLowerCase() === u.phone.toLowerCase())
                    );
                    if (found && this.selMember.querySelector(`option[value="${found.id}"]`)) {
                        this.selMember.value = String(found.id);
                        this.currentMemberId = String(found.id);
                    }
                }
            } catch (e) {
                console.warn('Error preseleccionando socio logueado:', e);
            }
        }

        if (this.selJornada) {
            // Filter journeys that have matches informed (at least one team name set)
            const informedJornadas = this.jornadas.filter(j => {
                // Must be active AND have matches with at least one home team name
                return j.active && j.matches && j.matches.some(m => m.home && m.home.trim() !== '');
            });

            // Sort by number descending (most recent first)
            const sortedJornadas = informedJornadas.sort((a, b) => b.number - a.number);

            sortedJornadas.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j.id;
                opt.textContent = `Jornada ${j.number} - ${j.date}`;
                this.selJornada.appendChild(opt);
            });

            // Preseleccionar por defecto la siguiente jornada que se vaya a jugar (no la última disponible)
            const nextJToPlay = this.getNextJornadaToPlay();
            if (nextJToPlay && this.selJornada.querySelector(`option[value="${nextJToPlay.id}"]`)) {
                this.selJornada.value = String(nextJToPlay.id);
                this.currentJornadaId = String(nextJToPlay.id);
            }
        }
    }

    loadForecast() {
        this.container.innerHTML = '';
        this.container.classList.add('hidden');
        if (this.doublesSection) this.doublesSection.classList.add('hidden');
        if (this.doublesInfoHeader) this.doublesInfoHeader.style.display = 'none';
        this.btnSave.style.display = 'none';
        if (this.btnClearForecast) this.btnClearForecast.style.display = 'none';
        this.statusMsg.textContent = '';
        this.deadlineInfo.textContent = '';
        this._fullForecastNotified = false;

        // Ensure IDs are synced with selects if they exist and have a value
        if (this.selMember && this.selMember.value) this.currentMemberId = this.selMember.value;
        if (this.selJornada && this.selJornada.value) this.currentJornadaId = this.selJornada.value;

        if (!this.currentMemberId || !this.currentJornadaId) {
            this.updateActiveSelectionUI();
            return;
        }

        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        if (!jornada) {
            this.updateActiveSelectionUI();
            return;
        }

        this.updateActiveSelectionUI();

        // Determinar si hay análisis disponible de Mundo Deportivo para esta jornada
        this.currentJornadaHasMDAnalysis = this.checkIfJornadaHasMDAnalysis(jornada);
        const mobileTopBar = document.getElementById('md-mobile-top-bar');
        if (mobileTopBar) {
            if (this.currentJornadaHasMDAnalysis) {
                mobileTopBar.classList.remove('hidden');
                mobileTopBar.classList.add('flex');
                const label = document.getElementById('label-toggle-all-md');
                const arrow = document.getElementById('arrow-toggle-all-md');
                if (label) label.textContent = 'Ver todos';
                if (arrow) arrow.textContent = '▼';
            } else {
                mobileTopBar.classList.add('hidden');
                mobileTopBar.classList.remove('flex');
            }
        }
        const sourceBarBase = document.getElementById('md-source-bar-base');
        if (sourceBarBase) {
            sourceBarBase.classList.toggle('hidden', !this.currentJornadaHasMDAnalysis);
            sourceBarBase.classList.toggle('flex', !!this.currentJornadaHasMDAnalysis);
        }
        if (this.mdAnalysisSidebar && this.editorForecastCol) {
            if (this.currentJornadaHasMDAnalysis) {
                this.editorForecastCol.classList.remove('lg:col-span-12');
                this.editorForecastCol.classList.add('lg:col-span-7', 'xl:col-span-8');
                this.mdAnalysisSidebar.classList.remove('hidden');
                this.mdAnalysisSidebar.classList.add('flex', 'lg:col-span-5', 'xl:col-span-4');
                this.renderMDSidebar();
            } else {
                this.editorForecastCol.classList.remove('lg:col-span-7', 'xl:col-span-8');
                this.editorForecastCol.classList.add('lg:col-span-12');
                this.mdAnalysisSidebar.classList.add('hidden');
                this.mdAnalysisSidebar.classList.remove('flex', 'lg:col-span-5', 'xl:col-span-4');
            }
        }

        const { isLockedRef, isFinished, hasStarted } = this.isJornadaLocked(jornada);

        // CORRECTION OVERRIDE: If Mode is Active, ignore lock
        const isLocked = this.correctionMode ? false : isLockedRef;

        const deadline = this.calculateDeadline(jornada.date);
        const now = new Date();
        const isLate = deadline ? (now > deadline) : false;

        if (deadline) {
            const dStr = deadline.toLocaleDateString() + ' ' + deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.deadlineInfo.innerHTML = isLate ?
                `<span style="color:var(--danger)">Plazo expirado (${dStr})</span>` :
                `<span style="color:var(--primary-green)">Cierre: ${dStr}</span>`;
        }

        const existing = this.pronosticos.find(p => (p.jId == this.currentJornadaId || p.jornadaId == this.currentJornadaId) && (p.mId == this.currentMemberId || p.memberId == this.currentMemberId));

        if (isLockedRef) {
            if (this.correctionMode) {
                const label = isFinished ? 'JORNADA CERRADA' : 'JORNADA EN JUEGO';
                this.statusMsg.innerHTML = `<span class="badge-late" style="border:2px solid var(--primary-orange); color:var(--primary-orange);">🛠️ EDITANDO ${label} (Modo Corrección)</span>`;
                this.container.style.border = "2px dashed var(--primary-orange)";
            } else {
                const hasExistingForecast = existing && Array.isArray(existing.selection) && existing.selection.some(s => s && String(s).trim() !== '' && String(s).trim() !== '-');
                if (!hasExistingForecast && (hasStarted || isFinished)) {
                    this.statusMsg.innerHTML = `<span class="badge-locked" style="background:#d32f2f; color:white; border: 1.5px solid #b71c1c; font-weight: bold; padding: 6px 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">🔒 JORNADA EN JUEGO (HAY RESULTADOS) - NO SE ADMITEN PRONÓSTICOS</span>`;
                } else {
                    let label = isFinished ? 'JORNADA FINALIZADA' : (hasStarted ? 'JORNADA EN JUEGO' : 'JORNADA CERRADA (TODOS HAN RELLENADO)');
                    let lateBadgeHtml = '';
                    if (existing && existing.late) {
                        if (existing.pardoned) {
                            lateBadgeHtml = `
                                <div class="mt-2 flex flex-col items-center justify-center gap-1">
                                    <div class="flex items-center justify-center gap-2 flex-wrap">
                                        <span class="badge-late" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1.5px solid #10b981;">🕊️ RETRASO INDULTADO / JUSTIFICADO</span>
                                        <button type="button" onclick="window.app.togglePardon('${this.currentJornadaId}', '${this.currentMemberId}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer">Modificar / Revocar</button>
                                    </div>
                                    ${existing.pardonReason ? `<div class="text-[10px] text-emerald-400 font-medium italic">Justificación: "${existing.pardonReason}"</div>` : ''}
                                </div>
                            `;
                        } else {
                            lateBadgeHtml = `<div class="mt-2 flex items-center justify-center gap-2 flex-wrap"><span class="badge-late">⚠️ PRONÓSTICO ENVIADO CON RETRASO</span><button type="button" onclick="window.app.togglePardon('${this.currentJornadaId}', '${this.currentMemberId}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition flex items-center gap-1 cursor-pointer"><span>🕊️</span> Perdonar Retraso</button></div>`;
                        }
                    }
                    this.statusMsg.innerHTML = `<span class="badge-locked">🔒 ${label} - NO SE ADMITEN CAMBIOS</span>${lateBadgeHtml}`;
                }
                this.container.style.border = "none";
            }
        } else {
            this.container.style.border = "none";
            // Si la jornada no está bloqueada, el aviso FUERA DE PLAZO no se muestra al abrir
            // (a menos que ya se hubiera guardado con retraso anteriormente de forma informativa).
            if (existing && existing.isDice) {
                this.statusMsg.innerHTML = '<span class="badge-dice" style="background: rgba(103, 58, 183, 0.12); color: #673ab7; border: 1.5px solid #673ab7; font-weight: bold; padding: 4px 12px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">🎲 PRONÓSTICO AUTORRELLENADO CON DADO</span>';
            } else if (existing && existing.late) {
                if (existing.pardoned) {
                    this.statusMsg.innerHTML = `
                        <div class="flex flex-col items-center justify-center gap-1">
                            <div class="flex items-center justify-center gap-2 flex-wrap">
                                <span class="badge-late" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1.5px solid #10b981;">🕊️ RETRASO INDULTADO / JUSTIFICADO</span>
                                <button type="button" onclick="window.app.togglePardon('${this.currentJornadaId}', '${this.currentMemberId}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer">Modificar / Revocar</button>
                            </div>
                            ${existing.pardonReason ? `<div class="text-[10px] text-emerald-400 font-medium italic">Justificación: "${existing.pardonReason}"</div>` : ''}
                        </div>
                    `;
                } else {
                    this.statusMsg.innerHTML = `<div class="flex items-center justify-center gap-2 flex-wrap"><span class="badge-late">⚠️ PRONÓSTICO ENVIADO CON RETRASO</span><button type="button" onclick="window.app.togglePardon('${this.currentJornadaId}', '${this.currentMemberId}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition flex items-center gap-1 cursor-pointer"><span>🕊️</span> Perdonar Retraso</button></div>`;
                }
            } else {
                this.statusMsg.innerHTML = '';
            }
        }

        // Update Method Dropdown
        if (this.selMethod) {
            this.selMethod.value = (existing && existing.isReduced) ? 'reducido' : 'directo';
        }

        // Determinar si la jornada tiene resultados en juego o finalizados para evaluar aciertos
        let hitsCount = 0;
        let finishedHitsCount = 0;
        let hasAnyMatchResult = false;
        const officialResults = Array.isArray(jornada.matches) ? jornada.matches.map(m => m.result) : [];
        if (Array.isArray(jornada.matches)) {
            hasAnyMatchResult = jornada.matches.some(m => {
                const r = m && m.result ? String(m.result).trim() : '';
                return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
            });
        }

        const currentSelections = existing ? existing.selection : Array(15).fill(null);
        // Only consider the first 14 signs for the "completed" notification
        if (currentSelections.slice(0, 14).filter(s => s !== null).length === 14) {
            this._fullForecastNotified = true;
        }

        // Si hay resultados y pronóstico, calcular aciertos
        const matchHitStatus = Array(15).fill(null); // true = acertado, false = fallado, null = pendiente
        if (hasAnyMatchResult && Array.isArray(currentSelections)) {
            for (let i = 0; i < 15; i++) {
                const res = officialResults[i];
                if (!res || String(res).trim() === '' || String(res).trim() === '-' || String(res).trim().toLowerCase() === 'por definir') {
                    matchHitStatus[i] = null;
                    continue;
                }
                const sel = currentSelections[i];
                if (!sel) {
                    matchHitStatus[i] = false;
                    continue;
                }
                const rSign = window.ScoringSystem ? window.ScoringSystem.normalizeSign(res) : String(res).trim().toUpperCase();
                const rScore = String(res).trim().toUpperCase();
                const pred = String(sel).trim().toUpperCase();

                if (i < 14) {
                    const isHit = pred.includes(rSign) || pred === rSign;
                    matchHitStatus[i] = isHit;
                    if (isHit) hitsCount++;
                } else if (i === 14) {
                    const isHit = (pred === rScore) || (pred === rSign);
                    matchHitStatus[i] = isHit;
                }
            }

            // Inyectar o actualizar insignia de aciertos en el statusMsg
            const badgeHitsHtml = `
                <div class="mt-2 flex items-center justify-center gap-2 flex-wrap">
                    <span class="px-3 py-1 rounded-full text-xs font-mono font-black ${hasStarted && !isFinished ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 animate-pulse' : 'bg-amber-500/20 text-amber-300 border border-amber-500/50'} shadow-sm flex items-center gap-1.5">
                        <span>🎯</span> <strong>${hitsCount} / 14 aciertos</strong>${matchHitStatus[14] === true ? ' <span class="text-purple-300 font-bold">(+P15 ✅)</span>' : ''} ${hasStarted && !isFinished ? '<span class="text-[10px] text-emerald-400 font-sans uppercase font-bold tracking-wider ml-1">En Juego</span>' : ''}
                    </span>
                </div>
            `;
            if (this.statusMsg) {
                this.statusMsg.innerHTML += badgeHitsHtml;
            }
        }

        jornada.matches.forEach((match, idx) => {
            const displayIdx = idx === 14 ? 'P15' : idx + 1;
            const row = document.createElement('div');
            row.className = 'pronostico-row';
            row.dataset.idx = idx;

            let disabledStr = isLocked ? 'style="pointer-events:none; opacity:0.6;"' : '';
            if (disabledStr === '' && this.correctionMode && isLockedRef) {
                // Visual cue that elements are unlocked specially
            }

            // Pleno Restriction
            let isPigMatch = false;
            if (idx === 14) {
                isPigMatch = typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(match.home, match.away);
                if (!isPigMatch) {
                    disabledStr = 'style="pointer-events:none; opacity:0.3; background:transparent;" title="Pleno deshabilitado"';
                }
            }

            const val = currentSelections[idx];
            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            // Porcentajes del análisis de Mundo Deportivo (si está disponible para esta jornada)
            let percHtml = '';
            let mobileBtnHtml = '';
            let inlineAnalysisHtml = '';
            if (this.currentJornadaHasMDAnalysis) {
                const mdMatch = this.getMDMatchFor(match, idx);
                if (mdMatch && mdMatch.percentages) {
                    const mdRecInfo = this.getEffectiveMDRecommendation(mdMatch);
                    const p1 = mdRecInfo.p1;
                    const pX = mdRecInfo.pX;
                    const p2 = mdRecInfo.p2;
                    const isRec1 = mdRecInfo.isRec1;
                    const isRecX = mdRecInfo.isRecX;
                    const isRec2 = mdRecInfo.isRec2;
                    const recSign = mdRecInfo.recSign;

                    percHtml = `
                        <div id="consensus-${idx}" class="p-percentages" title="Probabilidad Mundo Deportivo: 1 (${p1}%), X (${pX}%), 2 (${p2}%)">
                            <div class="perc-row perc-1 ${isRec1 ? 'rec-sign' : ''}"><span>1:</span> <b>${p1}%</b></div>
                            <div class="perc-row perc-X ${isRecX ? 'rec-sign' : ''}"><span>X:</span> <b>${pX}%</b></div>
                            <div class="perc-row perc-2 ${isRec2 ? 'rec-sign' : ''}"><span>2:</span> <b>${p2}%</b></div>
                        </div>
                    `;
                    mobileBtnHtml = `
                        <button type="button" class="md-mobile-toggle-btn lg:hidden" onclick="event.stopPropagation(); window.app.toggleMDInlineAnalysis(${idx});" title="Ver análisis de Mundo Deportivo">
                            <span>💡 Análisis</span>
                            <span class="md-arrow" id="md-arrow-${idx}">▼</span>
                        </button>
                    `;

                    // Desplegable de análisis táctico inline para móvil
                    let homeRankStr = mdMatch.homeRank ? `${mdMatch.homeRank}º clasificado` : '';
                    let awayRankStr = mdMatch.awayRank ? `${mdMatch.awayRank}º clasificado` : '';
                    if (!homeRankStr && this.mdAnalysisData && this.mdAnalysisData.standings) {
                        const allSt = [...(this.mdAnalysisData.standings.primera || []), ...(this.mdAnalysisData.standings.segunda || [])];
                        const hFound = allSt.find(t => this.areTeamsSimilar(match.home, t.team));
                        if (hFound) homeRankStr = `${hFound.pos}º (${hFound.pts} pts)`;
                        const aFound = allSt.find(t => this.areTeamsSimilar(match.away, t.team));
                        if (aFound) awayRankStr = `${aFound.pos}º (${aFound.pts} pts)`;
                    }

                    inlineAnalysisHtml = `
                        <div id="md-inline-${idx}" class="md-inline-card hidden lg:hidden w-full mt-2 p-3 rounded-xl bg-slate-950/90 border border-sky-500/30 text-xs space-y-2.5 shadow-inner">
                            <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px]">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-sky-400 font-black uppercase tracking-wider">🎯 Recomendado:</span>
                                    <span class="px-2 py-0.5 rounded-lg bg-sky-500 text-slate-950 font-black text-xs shadow">${recSign}</span>
                                </div>
                                <span class="text-slate-400 font-mono text-[10px]">⏰ ${mdMatch.schedule || 'Fin de semana'}</span>
                            </div>
                            ${(homeRankStr || awayRankStr) ? `
                                <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
                                    <span>${match.home}: <b class="text-sky-400">${homeRankStr || '-'}</b></span>
                                    <span>${match.away}: <b class="text-sky-400">${awayRankStr || '-'}</b></span>
                                </div>
                            ` : ''}
                            ${mdMatch.comment ? `
                                <div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed font-sans">
                                    ${mdMatch.comment}
                                </div>
                            ` : '<div class="text-[10px] text-slate-500 italic">Sin comentario editorial disponible.</div>'}
                            <div class="pt-0.5 flex items-center justify-end">
                                <button type="button" onclick="event.stopPropagation(); window.app.openMDMobileDetail(${idx});" class="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1">
                                    <span>📊 Ver Ficha Completa & Clasificación →</span>
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    percHtml = `<div id="consensus-${idx}" class="p-percentages hidden" style="display:none !important;"></div>`;
                }
            } else {
                // Si la información no está disponible en el momento de rellenar el pronóstico, no mostrar nada
                percHtml = `<div id="consensus-${idx}" class="p-percentages hidden" style="display:none !important;"></div>`;
            }

            // Evaluación de acierto para este partido
            const hitStatus = matchHitStatus[idx];
            if (hitStatus === true) {
                row.classList.add('match-hit');
            } else if (hitStatus === false) {
                row.classList.add('match-miss');
            }

            const mResult = (match.result && String(match.result).trim() !== '' && String(match.result).trim() !== '-' && String(match.result).trim().toLowerCase() !== 'por definir') ? String(match.result).trim() : null;
            const normMResult = mResult && window.ScoringSystem ? window.ScoringSystem.normalizeSign(mResult) : (mResult ? mResult.toUpperCase() : null);

            let hitBadgeHtml = '';
            if (mResult) {
                if (hitStatus === true) {
                    hitBadgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 shrink-0" title="Resultado oficial: ${mResult}">✅ ${mResult}</span>`;
                } else if (hitStatus === false) {
                    hitBadgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1 shrink-0" title="Resultado oficial: ${mResult}">❌ ${mResult}</span>`;
                } else {
                    hitBadgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 border border-slate-700 shrink-0" title="Resultado oficial: ${mResult}">${mResult}</span>`;
                }
            }

            row.innerHTML = `
                <div class="p-match-info">
                    <span class="p-match-num">${displayIdx}${isPigMatch ? ' 🐷' : ''}</span>
                    <div class="match-team home-team">
                        <span class="team-name">${match.home}</span>
                        <img src="${homeLogo}" class="team-logo" onerror="this.style.display='none'">
                    </div>
                    <span class="match-vs-separator">-</span>
                    <div class="match-team away-team">
                        <img src="${awayLogo}" class="team-logo" onerror="this.style.display='none'">
                        <span class="team-name">${match.away}</span>
                    </div>
                    ${isPigMatch ? '<span style="font-size:0.75rem; background:#ffecb3; color:#e65100; border-radius:4px; padding:2px 6px; font-weight:bold; margin-left:6px;" title="Partido de Interés General">🐷 PIG</span>' : ''}
                    ${hitBadgeHtml}
                    ${mobileBtnHtml}
                </div>

                <div class="p-row-actions">
                    <div class="p-options" ${disabledStr} data-idx="${idx}">
                        <div class="chk-option ${val === '1' ? 'selected' : ''} ${val === '1' && hitStatus === true ? 'opt-hit' : ''} ${val === '1' && hitStatus === false ? 'opt-miss' : ''}" onclick="window.app.selectOption(this, '1')">1</div>
                        <div class="chk-option ${val === 'X' ? 'selected' : ''} ${val === 'X' && hitStatus === true ? 'opt-hit' : ''} ${val === 'X' && hitStatus === false ? 'opt-miss' : ''}" onclick="window.app.selectOption(this, 'X')">X</div>
                        <div class="chk-option ${val === '2' ? 'selected' : ''} ${val === '2' && hitStatus === true ? 'opt-hit' : ''} ${val === '2' && hitStatus === false ? 'opt-miss' : ''}" onclick="window.app.selectOption(this, '2')">2</div>
                    </div>

                    ${percHtml}
                </div>

                ${inlineAnalysisHtml}
            `;

            if (this.currentJornadaHasMDAnalysis) {
                row.addEventListener('mouseenter', () => this.hoverMDMatch(idx));
                row.addEventListener('click', (e) => {
                    if (!e.target.closest('.chk-option') && !e.target.closest('.md-mobile-toggle-btn') && !e.target.closest('.md-inline-card')) {
                        this.hoverMDMatch(idx);
                    }
                });
            }

            this.container.appendChild(row);

            // Add Block Dividers: 4, 4, 3, 3 + Pleno al 15
            // 4-5 (idx 3), 8-9 (idx 7), 11-12 (idx 10), 14-15 (idx 13)
            if ([3, 7, 10, 13].includes(idx)) {
                const divider = document.createElement('div');
                if (idx === 13) {
                    divider.className = "p-divider p-divider-p15";
                    divider.innerHTML = `<span class="boleto-block-label">PLENO AL 15</span>`;
                } else {
                    divider.className = "p-divider p-divider-block";
                }
                this.container.appendChild(divider);
            }
        });

        this.container.classList.remove('hidden');
        if (!isLocked) {
            this.btnSave.style.display = 'block';
            if (this.btnClearForecast) this.btnClearForecast.style.display = 'inline-block';

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
        const hasExistingDoubles = (this.pronosticosExtra || []).some(p => 
            (String(p.jId || p.jornadaId) === String(jornada.id) || String(p.jId || p.jornadaId) === String(jornada.number)) &&
            p.selection && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-')
        );
        let isEligibleForDoubles = false;
        if (typeof this.checkEligibility === 'function') {
            const eligibility = this.checkEligibility(jornada.number, this.currentMemberId, true);
            const isNewRule = parseInt(jornada.number) >= 16;
            isEligibleForDoubles = isNewRule
                ? Boolean(eligibility && (eligibility.eligible || eligibility.isWinner))
                : Boolean(eligibility && (eligibility.eligible || eligibility.isWinner || eligibility.hasPrize));
        }
        if (!isEligibleForDoubles && typeof window !== 'undefined' && typeof window.getEligibleDoublesMembers === 'function') {
            const dms = window.getEligibleDoublesMembers(jornada);
            if (dms && dms.some(m => String(m.id) === String(this.currentMemberId))) {
                isEligibleForDoubles = true;
            }
        }

        if (isEligibleForDoubles || hasExistingDoubles || this.correctionMode) {
            if (this.renderDoublesForm) this.renderDoublesForm(jornada, isLocked);
            if (this.doublesSection) this.doublesSection.classList.remove('hidden');
            if (this.doublesInfoHeader) this.doublesInfoHeader.style.display = 'flex';
        }

        // Initial cost update
        this.updateCost();
    }

    selectOption(el, val) {
        // Bloqueo estricto: si la jornada está bloqueada (en juego con resultados o finalizada) sin Modo Corrección, no permitir selección
        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        if (jornada) {
            const { isLockedRef } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) {
                return;
            }
        }

        const parent = el.parentElement;
        const idx = parseInt(parent.dataset.idx);
        const isAlreadySelected = el.classList.contains('selected');

        // Toggle Logic: Unselect if clicked again
        parent.querySelectorAll('.chk-option').forEach(c => c.classList.remove('selected'));

        let finalVal = val;
        if (isAlreadySelected) {
            finalVal = null;
        } else {
            el.classList.add('selected');
        }

        // Update consensus in real-time
        this.updateRowConsensus(idx, finalVal);

        // Update cost/penalty
        this.updateCost();

        // Si estamos fuera de plazo y se cambia el pronóstico:
        if (jornada) {
            const deadline = this.calculateDeadline(jornada.date);
            const isLate = deadline ? (new Date() > deadline) : false;
            const { isLockedRef } = this.isJornadaLocked(jornada);
            const existing = this.pronosticos.find(p => (p.jId == this.currentJornadaId || p.jornadaId == this.currentJornadaId) && (p.mId == this.currentMemberId || p.memberId == this.currentMemberId));
            const wasFilledOnTime = existing && !existing.late && Array.isArray(existing.selection) && 
                existing.selection.slice(0, 14).filter(s => s && String(s).trim() !== '' && String(s) !== '-').length >= 14;

            if (isLate && !wasFilledOnTime && (!isLockedRef || this.correctionMode)) {
                this.statusMsg.innerHTML = '<span class="badge-late">⚠️ FUERA DE PLAZO - SE MARCARÁ COMO RETRASADO</span>';
            }
        }

        // Trigger Auto-save
        this.autoSave();
    }

    updateRowConsensus(idx, myVal) {
        // En peña Maulas ya no se muestra el porcentaje de votos de otros socios
        // para evitar confusiones. Se muestran las probabilidades del análisis de Mundo Deportivo.
        if (this.currentJornadaHasMDAnalysis) {
            return;
        }
        const consensusBox = document.getElementById(`consensus-${idx}`);
        if (consensusBox) {
            consensusBox.style.display = 'none';
            consensusBox.innerHTML = '';
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
            msg = `💰 Penalización: +${penalty.toFixed(2).replace(".", ",")} € (${onesCount} unos en 14 signos)`;
            color = "#ef6c00"; // Orange
        } else {
            msg = `✅ Sin penalización (${onesCount} unos)`;
            color = "var(--primary-green)";
        }

        this.costInfo.innerHTML = `<span style="font-weight:bold; color:${color}; padding: 5px 10px; border-radius: 4px; background: rgba(0,0,0,0.05);">${msg}</span>`;
    }

    async autoSave() {
        if (!this.currentMemberId || !this.currentJornadaId) return;

        // Use a small timeout to debounce multiple clicks and avoid saturation
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);

        this._autoSaveTimer = setTimeout(async () => {
            try {
                const rows = this.container.querySelectorAll('.p-options');
                const selection = [];
                rows.forEach((r) => {
                    const sel = r.querySelector('.selected');
                    selection.push(sel ? sel.textContent : null);
                });

                const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
                if (!jornada) return;

                const { isLockedRef } = this.isJornadaLocked(jornada);
                // Locked check: don't auto-save if locked (in correctionMode, require manual save/audit modal)
                if (isLockedRef) return;

                const deadline = this.calculateDeadline(jornada.date);
                const now = new Date();
                const isLate = deadline ? (now > deadline) : false;

                const existing = this.pronosticos.find(p => (p.jId == this.currentJornadaId || p.jornadaId == this.currentJornadaId) && (p.mId == this.currentMemberId || p.memberId == this.currentMemberId));
                const wasFilledOnTime = existing && !existing.late && Array.isArray(existing.selection) && 
                    existing.selection.slice(0, 14).filter(s => s && String(s).trim() !== '' && String(s) !== '-').length >= 14;
                const recordLate = wasFilledOnTime ? false : isLate;

                const isReduced = this.selMethod && this.selMethod.value === 'reducido';
                const id = `${this.currentJornadaId}_${this.currentMemberId}`;

                const record = {
                    id: id,
                    jId: this.currentJornadaId,
                    mId: this.currentMemberId,
                    selection: selection,
                    isReduced: isReduced,
                    timestamp: new Date().toISOString(),
                    late: recordLate,
                    pardoned: existing ? (existing.pardoned || false) : false,
                    pardonReason: existing ? (existing.pardonReason || '') : '',
                    pardonedBy: existing ? (existing.pardonedBy || '') : '',
                    pardonedAt: existing ? (existing.pardonedAt || '') : '',
                    isDice: existing ? (existing.isDice || false) : false
                };

                await window.DataService.save('pronosticos', record);

                // Sync local state
                const idx = this.pronosticos.findIndex(p => p.id == record.id);
                if (idx > -1) {
                    this.pronosticos[idx] = { ...this.pronosticos[idx], ...record };
                } else {
                    this.pronosticos.push(record);
                }

                // Update summary table in background (debounced to avoid blocking UI during typing)
                if (window.clearEligibleDoublesCache) window.clearEligibleDoublesCache();
                if (this._renderSummaryDebounce) clearTimeout(this._renderSummaryDebounce);
                this._renderSummaryDebounce = setTimeout(() => {
                    this.renderSummaryTable();
                }, 500);
                console.log("Auto-save silenciado OK (Late:", isLate, ")");

                // NEW: Alert if completed (checking first 14 signs)
                const isFull14 = selection.slice(0, 14).filter(s => s !== null).length === 14;
                if (isFull14 && !this._fullForecastNotified) {
                    this._fullForecastNotified = true;
                    if (typeof FRASES_MAULA !== 'undefined' && FRASES_MAULA.length > 0) {
                        const randomPhrase = FRASES_MAULA[Math.floor(Math.random() * FRASES_MAULA.length)];
                        setTimeout(() => {
                            alert('¡PRONÓSTICO COMPLETADO Y GUARDADO!\n\n' + randomPhrase);
                        }, 50);
                    }
                }

            } catch (e) {
                console.error("Auto-save error:", e);
            }
        }, 800);
    }

    handleClearForecast() {
        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        if (jornada) {
            const { isLockedRef } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) {
                alert("No se puede borrar el pronóstico porque la jornada está bloqueada.");
                return;
            }
        }

        if (!confirm('¿Estás seguro de que quieres borrar todos los signos de este pronóstico?')) return;

        const options = this.container.querySelectorAll('.chk-option.selected');
        options.forEach(opt => opt.classList.remove('selected'));

        // Update cost/penalty display after clearing
        this.updateCost();

        // Trigger save immediately to persist the clearing
        this.saveForecast();
    }

    showHelpDoubles() {
        if (!this.helpModal) return;

        // Force visibility and override any CSS opacity 0
        this.helpModal.style.display = 'flex';
        this.helpModal.style.opacity = '1';
        this.helpModal.style.visibility = 'visible';
        this.helpModal.style.zIndex = '2000000';
        this.helpModal.classList.add('active');

        this.renderHelpMarks();

        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            if (this.mobileTabs) this.mobileTabs.style.display = 'flex';
            this.switchHelpView('physical'); // Default to physical on mobile
        } else {
            if (this.mobileTabs) this.mobileTabs.style.display = 'none';
            // On desktop show both side by side
            if (this.physicalSection) this.physicalSection.style.display = 'block';
            if (this.digitalSection) this.digitalSection.style.display = 'block';
        }
    }

    switchHelpView(view) {
        if (!this.physicalSection || !this.digitalSection) return;

        if (view === 'physical') {
            this.physicalSection.style.display = 'block';
            this.digitalSection.style.display = 'none';
            this.btnShowPhysical.style.background = '#607d8b';
            this.btnShowPhysical.style.color = 'white';
            this.btnShowDigital.style.background = '#cfd8dc';
            this.btnShowDigital.style.color = '#333';
        } else {
            this.physicalSection.style.display = 'none';
            this.digitalSection.style.display = 'block';
            this.btnShowPhysical.style.background = '#cfd8dc';
            this.btnShowPhysical.style.color = '#333';
            this.btnShowDigital.style.background = '#607d8b';
            this.btnShowDigital.style.color = 'white';
        }
    }

    renderHelpMarks() {
        // Deactivated for now as per user request
        if (!this.marksPhysical || !this.marksDigital) return;
        this.marksPhysical.innerHTML = '';
        this.marksDigital.innerHTML = '';
        return;
        // We look for ANY member's extra forecast that has valid signs, since normally only one is filled.
        const pExtra = (this.pronosticosExtra || []).find(p =>
            (String(p.jId || p.jornadaId) === String(this.currentJornadaId)) &&
            (p.selection && p.selection.some(s => s && s.trim() !== '' && s !== '-'))
        );

        if (!pExtra || !pExtra.selection) {
            const msg = '<div style="position:absolute; top:40%; left:50%; transform:translate(-50%,-50%); color:white; background:rgba(0,0,0,0.85); padding:30px; border-radius:15px; font-size:1.2rem; text-align:center; width:80%; box-shadow:0 15px 40px rgba(0,0,0,0.5); z-index:1000; border:2px solid #00e5ff;">⚠️ No se han encontrado dobles guardados para la Jornada ' + this.currentJornadaId + '.<br><br><span style="font-size:0.9rem; opacity:0.8;">Asegúrate de que alguien haya rellenado y guardado la quiniela de dobles primero.</span></div>';
            this.marksPhysical.innerHTML = msg;
            this.marksDigital.innerHTML = msg;
            return;
        }

        const sel = pExtra.selection;
        let doublesCount = 0;
        let doubleIndices = [];

        // ---------------------------------------------------------
        // 1. PHYSICAL GRID (Basado en Excel A1:AG33 = 33x33 celdas)
        // ---------------------------------------------------------
        const gC = 33;
        const gP = (c) => ((c - 0.5) / gC) * 100;

        const phys = {
            c1: gP(10), cX: gP(12), c2: gP(14),
            cP: gP(16), cT: gP(20),
            p15Cols: { '0': gP(2), '1': gP(4), '2': gP(6), 'M': gP(8) },
            r15E1: gP(28), r15E2: gP(29)
        };

        sel.forEach((sign, idx) => {
            if (idx === 14) return;
            const rE = 2 + (idx * 2);
            const y = gP(rE);
            if (sign.includes('1')) this.drawX(this.marksPhysical, phys.c1, y);
            if (sign.includes('X')) this.drawX(this.marksPhysical, phys.cX, y);
            if (sign.includes('2')) this.drawX(this.marksPhysical, phys.c2, y);
            if (sign.length === 2) {
                doublesCount++;
                doubleIndices.push(idx + 1);
            }
        });

        const p15Val = sel[14] || '';
        if (p15Val.includes('-')) {
            const [h, a] = p15Val.split('-');
            if (phys.p15Cols[h]) this.drawX(this.marksPhysical, phys.p15Cols[h], phys.r15E1);
            if (phys.p15Cols[a]) this.drawX(this.marksPhysical, phys.p15Cols[a], phys.r15E2);
        }

        if (doublesCount === 7) {
            this.drawX(this.marksPhysical, phys.cP, gP(14)); // P14 (7 dobles)
            this.drawX(this.marksPhysical, gP(26.8), gP(14.8)); // Casilla Reducción
        }

        doubleIndices.forEach(idx => {
            const rE = 2 + ((idx - 1) * 2);
            this.drawX(this.marksPhysical, phys.cT, gP(rE));
        });

        // ---------------------------------------------------------
        // 2. DIGITAL GRID
        // ---------------------------------------------------------
        const dig = { startY: 23.5, stepY: 4.02, c1: 60.5, cX: 62.1, c2: 63.7, sX: 72.2 };
        sel.forEach((sign, idx) => {
            if (idx === 14) return;
            const y = dig.startY + (idx * dig.stepY);
            if (sign.includes('1')) this.drawX(this.marksDigital, dig.c1, y);
            if (sign.includes('X')) this.drawX(this.marksDigital, dig.cX, y);
            if (sign.includes('2')) this.drawX(this.marksDigital, dig.c2, y);
            if (sign.length === 2) this.drawX(this.marksDigital, dig.sX, y);
        });

        this.marksDigital.innerHTML += '<div style="position:absolute; top:20px; right:20px; background:rgba(0, 71, 161, 0.95); color:white; padding:10px 20px; border-radius:30px; font-size:1rem; font-weight:900; box-shadow:0 8px 20px rgba(0,0,0,0.4); z-index:1000; border:2px solid #00e5ff;">GUÍA: ' + doublesCount + ' DOBLES</div>';
    }

    drawX(container, xPct, yPct) {
        const x = document.createElement('div');
        x.className = 'help-mark-x';
        x.textContent = 'X';
        x.style.left = xPct + '%';
        x.style.top = yPct + '%';
        container.appendChild(x);
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

            // Allow saving if it's completely empty (Clearing action)
            const isFullyEmpty = selection.every(s => s === null || s === '-');

            if (missing && !isFullyEmpty) {
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

            console.log("🔵 PASO 5: Comprobando estado de bloqueo");
            const { isLockedRef, hasStarted, isFinished, areAllCompleted } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) {
                const existing = this.pronosticos.find(p => (p.jId == this.currentJornadaId || p.jornadaId == this.currentJornadaId) && (p.mId == this.currentMemberId || p.memberId == this.currentMemberId));
                const hasExisting = existing && Array.isArray(existing.selection) && existing.selection.some(s => s && String(s).trim() !== '' && String(s).trim() !== '-');

                if (!hasExisting && hasStarted) {
                    alert("No es posible rellenar la quiniela: la jornada ya cuenta con resultados de partidos registrados. Solo se admiten pronósticos con retraso antes de que comience la jornada.");
                } else if (areAllCompleted && !hasStarted && !isFinished) {
                    alert("No se pueden cambiar los signos: todos los socios han terminado de rellenar sus pronósticos y la jornada ha quedado sellada. Para realizar modificaciones se requiere activar el Modo Corrección.");
                } else if (hasStarted) {
                    alert("No se pueden cambiar los signos: la jornada ya ha comenzado (o cuenta con resultados en juego). Para realizar modificaciones se requiere activar el Modo Corrección.");
                } else {
                    alert("Esta jornada está bloqueada y no admite cambios sin activar el Modo Corrección.");
                }
                return;
            }

            const deadline = this.calculateDeadline(jornada.date);
            const now = new Date();
            const isLate = deadline ? (now > deadline) : false;

            const existing = this.pronosticos.find(p => (p.jId == this.currentJornadaId || p.jornadaId == this.currentJornadaId) && (p.mId == this.currentMemberId || p.memberId == this.currentMemberId));
            const wasFilledOnTime = existing && !existing.late && Array.isArray(existing.selection) && 
                existing.selection.slice(0, 14).filter(s => s && String(s).trim() !== '' && String(s) !== '-').length >= 14;
            const finalLate = wasFilledOnTime ? false : isLate;

            const isReduced = this.selMethod && this.selMethod.value === 'reducido';
            if (isReduced) {
                const doubleCount = selection.filter((s, i) => i < 14 && s && s.length > 1).length;
                if (doubleCount !== 7) {
                    alert(`Error: El método 'Reducida' requiere exactamente 7 dobles. Actualmente tienes ${doubleCount}.`);
                    return;
                }
            }

            const id = `${this.currentJornadaId}_${this.currentMemberId}`;
            const record = {
                id: id,
                jId: this.currentJornadaId,
                mId: this.currentMemberId,
                selection: selection,
                isReduced: isReduced,
                timestamp: new Date().toISOString(),
                late: finalLate,
                pardoned: existing ? (existing.pardoned || false) : false,
                pardonReason: existing ? (existing.pardonReason || '') : '',
                pardonedBy: existing ? (existing.pardonedBy || '') : '',
                pardonedAt: existing ? (existing.pardonedAt || '') : '',
                isDice: false
            };

            console.log("🔵 PASO 7: Verificando si necesita auditoría");
            console.log("Condición:", `isLockedRef=${isLockedRef} && correctionMode=${this.correctionMode}`);

            // If LOCKED and CORRECTION MODE -> Audit Flow
            if (isLockedRef && this.correctionMode) {
                console.log("🟢 ABRIENDO MODAL DE AUDITORÍA");
                this.pendingSaveData = record;
                this.openAuditModal(finalLate);
                return;
            }

            console.log("🔵 PASO 8: Guardado normal (sin auditoría)");
            await this.performFinalSave(record, finalLate);

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
        this.auditModal.classList.add('active');
        this.auditReason.value = '';
        this.auditLateCheck.checked = isLateCurrent;

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

        // Disable button to prevent double clicking and show status
        if (this.btnConfirmAudit) {
            this.btnConfirmAudit.disabled = true;
            this.btnConfirmAudit.textContent = 'Guardando...';
        }

        try {
            console.log("🔵 Iniciando proceso de guardado de auditoría...");

            // 1. Prepare Log Entry
            const existing = this.pronosticos.find(p => p.id == this.pendingSaveData.id);
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
                console.log("Saving log entry...");
                await window.DataService.save('modification_logs', logEntry);
            }

            // 3. Update Record with Forced Late Status
            this.pendingSaveData.late = isForceLate;

            // 4. Save Record
            console.log("Saving record...");
            await this.performFinalSave(this.pendingSaveData, isForceLate, true);

            // 5. Success Flow: Close modal
            this.auditModal.classList.remove('active');
            document.body.style.overflow = ''; // Restaurar scroll
            this.pendingSaveData = null;

        } catch (error) {
            console.error("❌ ERROR CRÍTICO EN executeAuditSave:", error);
            alert("Error al guardar la corrección: " + error.message);
        } finally {
            if (this.btnConfirmAudit) {
                this.btnConfirmAudit.disabled = false;
                this.btnConfirmAudit.textContent = 'Confirmar Cambio';
            }
        }
    }

    async performFinalSave(record, isLate, isCorrection = false) {
        const idx = this.pronosticos.findIndex(p => p.id == record.id);
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

        if (window.clearEligibleDoublesCache) window.clearEligibleDoublesCache();
        if (this._prevJornadaEvalCache) this._prevJornadaEvalCache.clear();
        this.renderSummaryTable(); // Refresh summary

        // Check for Habemus Quinielam (Telegram) de inmediato y sin depender de temporizadores bloqueados por alertas
        if (window.TelegramService) {
            window.TelegramService.checkHabemusQuinielam(this.currentJornadaId, false, this.pronosticos);
        }

        // Verificación y auto-envío desatendido del boleto oficial a la administración
        if (window.SelladoService) {
            window.SelladoService.verificarYAutoEnviar(this.currentJornadaId);
        }
    }

    isJornadaLocked(jornada) {
        if (!jornada) return { isLockedRef: false, isFinished: false, hasStarted: false };

        const now = new Date();
        const dateObj = AppUtils.parseDate(jornada.date);
        let isPastCloseDate = false;
        if (dateObj) {
            const closeDate = new Date(dateObj);
            closeDate.setDate(closeDate.getDate() + 2);
            closeDate.setHours(23, 59, 59);
            isPastCloseDate = now > closeDate;
        }

        const hasStarted = Array.isArray(jornada.matches) && jornada.matches.some(m => {
            if (!m) return false;
            const r = (m.result !== undefined && m.result !== null) ? String(m.result).trim() : '';
            const isResultValid = r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
            const s = (m.score !== undefined && m.score !== null) ? String(m.score).trim() : '';
            const isScoreValid = s !== '' && s !== '-' && s.toLowerCase() !== 'por definir';
            return isResultValid || isScoreValid;
        });

        const isExplicitInactive = jornada.active === false;
        const isFinished = isExplicitInactive || isPastCloseDate || (Array.isArray(jornada.matches) && jornada.matches.length === 15 && jornada.matches.every(m => {
            if (!m || !m.result) return false;
            const r = String(m.result).trim();
            return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
        }));

        // Comprobar si todos los socios activos han completado su pronóstico
        let areAllCompleted = false;
        try {
            const activeMembers = (this.members || []).filter(m => m && m.active !== false);
            if (activeMembers.length > 0 && Array.isArray(this.pronosticos)) {
                const jIdStr = String(jornada.id);
                areAllCompleted = activeMembers.every(m => {
                    const mIdStr = String(m.id);
                    const p = this.pronosticos.find(pred => {
                        const pj = String(pred.jId !== undefined && pred.jId !== null ? pred.jId : pred.jornadaId || '');
                        const pm = String(pred.mId !== undefined && pred.mId !== null ? pred.mId : pred.memberId || '');
                        return pj === jIdStr && pm === mIdStr;
                    });
                    if (!p || !p.selection || !Array.isArray(p.selection)) return false;
                    const filled14 = p.selection.slice(0, 14).filter(s => s && String(s).trim() !== '' && String(s) !== '-').length;
                    return filled14 >= 14;
                });
            }
        } catch (e) {
            console.error("Error al comprobar si todos los socios han completado el pronóstico:", e);
        }

        const isLockedRef = isFinished || hasStarted || areAllCompleted;

        return { isLockedRef, isFinished, hasStarted, areAllCompleted };
    }

    calculateDeadline(dateStr) {
        return window.AppUtils ? window.AppUtils.calculateDeadline(dateStr) : null;
    }

    async togglePardon(jId, mId) {
        if (!jId || !mId) {
            jId = this.currentJornadaId;
            mId = this.currentMemberId;
        }
        const p = this.pronosticos.find(item => 
            (String(item.jId) === String(jId) || String(item.jornadaId) === String(jId)) &&
            (String(item.mId) === String(mId) || String(item.memberId) === String(mId))
        );
        if (!p) {
            alert('No se encontró el pronóstico correspondiente.');
            return;
        }

        const willPardon = !p.pardoned;
        let finalReason = '';

        if (willPardon) {
            const reason = prompt('Indica el motivo o justificación de perdonar la sanción por retraso:\n(Ej: "Avisó antes del cierre", "Fallo técnico", "Acuerdo de socios", etc.)', p.pardonReason || '');
            if (reason === null) return; // Cancelado por el usuario
            finalReason = reason.trim() || 'Acuerdo de socios';
            p.pardoned = true;
            p.pardonReason = finalReason;
        } else {
            const choice = prompt('Este retraso ya está indultado.\n\n- Escribe una nueva justificación para actualizarla.\n- O escribe "REVOCAR" para retirar el perdón y reactivar la sanción por retraso:', p.pardonReason || '');
            if (choice === null) return; // Cancelado
            if (choice.trim().toUpperCase() === 'REVOCAR') {
                p.pardoned = false;
                p.pardonReason = '';
                p.pardonedBy = '';
                p.pardonedAt = '';
            } else {
                finalReason = choice.trim() || 'Acuerdo de socios';
                p.pardonReason = finalReason;
            }
        }

        try {
            const forgiverData = JSON.parse(sessionStorage.getItem('maulas_user') || '{}');
            const forgiverName = window.AppUtils ? window.AppUtils.getMemberName(forgiverData) : (forgiverData.name || 'Administración');
            if (p.pardoned) {
                p.pardonedBy = forgiverName;
                p.pardonedAt = new Date().toISOString();
            }

            if (window.DataService) {
                await window.DataService.save('pronosticos', p);
            }

            if (p.pardoned && window.TelegramService) {
                try {
                    const forgiven = this.members ? this.members.find(m => String(m.id) === String(mId)) : null;
                    const forgivenName = forgiven && window.AppUtils ? window.AppUtils.getMemberName(forgiven) : (forgiven ? forgiven.name : 'Socio');
                    const jornada = this.jornadas ? this.jornadas.find(j => String(j.id) === String(jId)) : null;
                    const jNum = jornada ? jornada.number : '?';

                    await window.TelegramService.sendPardonNotification(forgiverName, forgivenName, jNum, p.pardonReason);
                } catch (te) {
                    console.warn('Error enviando notificación Telegram de indulto:', te);
                }
            }

            if (typeof this.loadForecast === 'function') this.loadForecast();
            if (typeof this.renderSummaryTable === 'function') this.renderSummaryTable();
            if (typeof this.updateKPIsCustom === 'function') this.updateKPIsCustom();
        } catch (err) {
            console.error('Error al guardar el indulto:', err);
            alert('Error al guardar el indulto en la base de datos.');
        }
    }

    /**
     * Devuelve el estado del indicador luminoso tipo LED para un socio y una jornada dada:
     * - 'green': Pronóstico completo (14 signos + P15 si es PIG), y dobles si le correspondían.
     * - 'yellow': Pronóstico completo, pero falta rellenar la Quiniela de Dobles (solo para el socio responsable de dobles).
     * - 'red': Falta algún signo del pronóstico o está pendiente.
     */
    getMemberStatusLed(memberId, targetJornada, precalculatedEligibleDoubles = null) {
        if (!targetJornada) return { status: 'red', title: 'Sin jornada' };
        const jIdStr = String(targetJornada.id);
        const mIdStr = String(memberId);

        // 1. Verificar pronóstico base del socio
        const p = (this.pronosticos || []).find(pred => {
            const pj = String(pred.jId !== undefined && pred.jId !== null ? pred.jId : pred.jornadaId);
            const pm = String(pred.mId !== undefined && pred.mId !== null ? pred.mId : pred.memberId);
            return pj === jIdStr && pm === mIdStr;
        });

        if (!p || !p.selection || !Array.isArray(p.selection)) {
            return { status: 'red', title: 'Pronóstico pendiente / sin rellenar' };
        }

        // Comprobar los primeros 14 partidos
        let normalComplete = true;
        for (let i = 0; i < 14; i++) {
            const val = p.selection[i];
            if (!val || String(val).trim() === '' || String(val).trim() === '-') {
                normalComplete = false;
                break;
            }
        }

        // Comprobar Pleno al 15 si es partido PIG
        if (normalComplete && targetJornada.matches && targetJornada.matches[14]) {
            const m15 = targetJornada.matches[14];
            const isPig = typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m15.home, m15.away);
            if (isPig) {
                const val15 = p.selection[14];
                if (!val15 || String(val15).trim() === '' || String(val15).trim() === '-') {
                    normalComplete = false;
                }
            }
        }

        if (!normalComplete) {
            return { status: 'red', title: 'Pronóstico incompleto (faltan signos)' };
        }

        // 2. El pronóstico normal está completo.
        // Comprobar si este socio es el responsable/elegible para la Quiniela de Dobles en esta jornada.
        let isEligibleDoubles = false;
        try {
            if (precalculatedEligibleDoubles !== null && Array.isArray(precalculatedEligibleDoubles)) {
                isEligibleDoubles = precalculatedEligibleDoubles.some(m => String(m.id) === mIdStr);
            } else if (typeof window !== 'undefined' && typeof window.getEligibleDoublesMembers === 'function') {
                const dms = window.getEligibleDoublesMembers(targetJornada);
                if (dms && dms.some(m => String(m.id) === mIdStr)) {
                    isEligibleDoubles = true;
                }
            } else if (typeof window !== 'undefined' && typeof window.getEligibleDoublesMember === 'function') {
                const dm = window.getEligibleDoublesMember(targetJornada);
                if (dm && String(dm.id) === mIdStr) {
                    isEligibleDoubles = true;
                }
            }
            if (!isEligibleDoubles && precalculatedEligibleDoubles === null && typeof this.checkEligibility === 'function') {
                const elig = this.checkEligibility(targetJornada.number, memberId, true);
                const isNewRule = parseInt(targetJornada.number) >= 16;
                if (isNewRule) {
                    if (elig && (elig.eligible || elig.isWinner)) isEligibleDoubles = true;
                } else {
                    if (elig && (elig.eligible || elig.isWinner || elig.hasPrize)) isEligibleDoubles = true;
                }
            }
        } catch (e) {
            console.error("Error al comprobar elegibilidad de dobles para LED:", e);
        }

        if (isEligibleDoubles) {
            // Comprobar si la quiniela de dobles de este socio en esta jornada está ya rellenada
            const pExtra = (this.pronosticosExtra || []).find(pe => {
                const pj = String(pe.jId !== undefined && pe.jId !== null ? pe.jId : pe.jornadaId);
                const pm = String(pe.mId !== undefined && pe.mId !== null ? pe.mId : pe.memberId);
                return pj === jIdStr && pm === mIdStr;
            });

            const hasDoublesFilled = pExtra && pExtra.selection && Array.isArray(pExtra.selection) &&
                pExtra.selection.filter(s => s && String(s).trim() !== '' && String(s) !== '-').length >= 14;

            if (!hasDoublesFilled) {
                return { status: 'yellow', title: 'Pronóstico completo, pero falta rellenar la Quiniela de Dobles' };
            }
        }

        return {
            status: 'green',
            title: isEligibleDoubles ? 'Pronóstico y Quiniela de Dobles completos' : 'Pronóstico completo'
        };
    }

    getNextJornadaToPlay() {
        if (!this.jornadas || !Array.isArray(this.jornadas) || this.jornadas.length === 0) return null;

        // 1. Filtrar jornadas candidatas que tengan partidos informados o pronósticos registrados
        const candidates = this.jornadas
            .filter(j => {
                if (!j) return false;
                const hasMatches = j.matches && Array.isArray(j.matches) && j.matches.some(m => m && m.home && String(m.home).trim() !== '');
                const hasForecasts = (this.pronosticos || []).some(p => String(p.jId || p.jornadaId) === String(j.id));
                const hasDobles = (this.pronosticosExtra || []).some(p => String(p.jId || p.jornadaId) === String(j.id));
                return j.active !== false && (hasMatches || hasForecasts || hasDobles);
            })
            .sort((a, b) => (parseInt(a.number || a.id) || 0) - (parseInt(b.number || b.id) || 0));

        if (candidates.length === 0) {
            return this.jornadas[0] || null;
        }

        // Helper para saber si una jornada ya está completamente finalizada/jugada
        const isFinished = (j) => {
            if (j.status === 'closed' || j.status === 'completed' || j.finalizada === true) return true;
            if (!j.matches || !Array.isArray(j.matches) || j.matches.length === 0) return false;
            const filledResults = j.matches.filter(m => {
                if (!m || !m.result) return false;
                const r = String(m.result).trim().toLowerCase();
                return r !== '' && r !== '-' && r !== 'por definir';
            }).length;
            // Si al menos 14 partidos tienen resultado oficial, la jornada ya se disputó
            return filledResults >= 14;
        };

        // La siguiente jornada a jugar es la primera (menor número) que aún NO haya finalizado
        const nextPending = candidates.find(j => !isFinished(j));
        if (nextPending) {
            return nextPending;
        }

        // Fallback: si todas han finalizado, la última de las candidatas
        return candidates[candidates.length - 1] || candidates[0];
    }

    updateSummaryHeaderLeds() {
        if (!this.summaryTable) return;
        // Estado de indicadores SIEMPRE de la siguiente jornada que se vaya a jugar (no de la última disponible para sellar)
        const targetJornada = this.getNextJornadaToPlay();
        if (!targetJornada) return;

        const ths = this.summaryTable.querySelectorAll('thead th[data-mid]');
        ths.forEach(th => {
            const mId = th.getAttribute('data-mid');
            const ledSpan = th.querySelector('.led-status-indicator');
            if (ledSpan && mId) {
                const led = this.getMemberStatusLed(mId, targetJornada);
                ledSpan.className = `led-status-indicator led-${led.status}`;
                ledSpan.title = `J${targetJornada.number}: ${led.title}`;
            }
        });
    }

    renderSummaryTable() {
        if (!this.summaryTable) return;

        const thead = this.summaryTable.querySelector('thead');
        const tbody = this.summaryTable.querySelector('tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // 1. Sort Members alphabetically
        const sortedMembers = [...this.members].sort((a, b) => parseInt(a.id) - parseInt(b.id));

        // Determine reference jornada for column headers: SIEMPRE la siguiente jornada que se vaya a jugar
        const targetJornadaForHeader = this.getNextJornadaToPlay();

        // 2. Build Header
        const headerRow = document.createElement('tr');
        const stickyTh = document.createElement('th');
        stickyTh.className = 'summary-sticky-col summary-header-cell';
        stickyTh.textContent = 'Jornada';
        headerRow.appendChild(stickyTh);

        sortedMembers.forEach((m, index) => {
            const th = document.createElement('th');
            th.className = 'summary-header-cell';
            th.setAttribute('data-mid', m.id);
            const led = this.getMemberStatusLed(m.id, targetJornadaForHeader);
            const jNumText = targetJornadaForHeader ? `J${targetJornadaForHeader.number}: ` : '';
            th.innerHTML = `
                <div style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                    <span class="led-status-indicator led-${led.status}" title="${jNumText}${led.title}"></span>
                    <span>${AppUtils.getMemberName(m)}</span>
                </div>
            `;
            headerRow.appendChild(th);
        });

        // Add Quiniela Dobles column header at the end
        const thDoubles = document.createElement('th');
        thDoubles.className = 'summary-header-cell summary-doubles-header';
        thDoubles.textContent = 'Quiniela Dobles';
        headerRow.appendChild(thDoubles);

        thead.appendChild(headerRow);

        // OPTIMIZATION: Build Maps for O(1) lookups
        const pronosticosMap = new Map();
        const jornadasConPronostico = new Set();
        
        if (this.pronosticos && Array.isArray(this.pronosticos)) {
            this.pronosticos.forEach(p => {
                if (!p) return;
                const jIds = [];
                if (p.jId !== undefined && p.jId !== null) jIds.push(String(p.jId));
                if (p.jornadaId !== undefined && p.jornadaId !== null) jIds.push(String(p.jornadaId));
                
                const mIds = [];
                if (p.mId !== undefined && p.mId !== null) mIds.push(String(p.mId));
                if (p.memberId !== undefined && p.memberId !== null) mIds.push(String(p.memberId));

                jIds.forEach(j => {
                    jornadasConPronostico.add(j);
                    mIds.forEach(m => {
                        const key = `${j}_${m}`;
                        if (!pronosticosMap.has(key)) {
                            pronosticosMap.set(key, p);
                        }
                    });
                });
            });
        }

        // Map for pronosticosExtra (Quiniela de Dobles)
        const pronosticosExtraMap = new Map();
        const jornadasConDobles = new Set();
        if (this.pronosticosExtra && Array.isArray(this.pronosticosExtra)) {
            this.pronosticosExtra.forEach(p => {
                if (!p) return;
                const jId = String(p.jId !== undefined && p.jId !== null ? p.jId : p.jornadaId);
                const hasValidSelection = p.selection && Array.isArray(p.selection) && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-');
                if (hasValidSelection) {
                    jornadasConDobles.add(jId);
                    pronosticosExtraMap.set(jId, p);
                }
            });
        }

        // 3. Sort Jornadas (descending) & Filter empty ones
        let sortedJornadas = [...this.jornadas].sort((a, b) => b.number - a.number);

        // Filter: Keep jornadas that have matches informed OR have at least one forecast saved
        sortedJornadas = sortedJornadas.filter(j => {
            const hasMatches = j.matches && j.matches.some(m => m.home && m.home.trim() !== '');
            const hasForecasts = jornadasConPronostico.has(String(j.id));
            const hasDobles = jornadasConDobles.has(String(j.id));

            return hasMatches || hasForecasts || hasDobles;
        });

        if (sortedJornadas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="100%" style="padding:2rem;">No hay pronósticos registrados aún.</td></tr>';
            return;
        }

        // 4. Build Rows using string concatenation for maximum performance
        let tbodyHtml = '';
        
        sortedJornadas.forEach(j => {
            let dateFormatted = j.date;
            try {
                const d = AppUtils.parseDate(j.date);
                if (d) {
                    dateFormatted = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }
            } catch (e) { }

            const hasPig = (j.matches || []).some(m => m && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away));
            let rowHtml = `<tr>
                <td class="summary-sticky-col summary-jornada-info">
                    <div class="summary-j-num">J${j.number}${hasPig ? ' 🐷' : ''}</div>
                    <div class="summary-j-date">${dateFormatted}</div>
                </td>`;

            sortedMembers.forEach((m, index) => {
                const jIdStr = String(j.id);
                const mIdStr = String(m.id);
                const p = pronosticosMap.get(`${jIdStr}_${mIdStr}`);
                const isEven = index % 2 !== 0;

                let cellContent = '-';
                let cellClass = `summary-cell ${isEven ? 'col-even' : 'col-odd'} hoverable-cell`;

                let isPlayed = false;
                if (p && p.selection && Array.isArray(p.selection)) {
                    isPlayed = p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-');
                }

                const cellLed = this.getMemberStatusLed(m.id, j);
                const showInCell = (cellLed.status === 'red' || cellLed.status === 'yellow');
                const cellLedHtml = showInCell ? `<span class="led-status-indicator led-${cellLed.status}" style="margin-right: 4px;" title="${cellLed.title}"></span>` : '';

                if (isPlayed) {
                    const selection14 = p.selection.slice(0, 14);
                    const b1 = selection14.slice(0, 4).map(s => s || '-').join('');
                    const b2 = selection14.slice(4, 8).map(s => s || '-').join('');
                    const b3 = selection14.slice(8, 11).map(s => s || '-').join('');
                    const b4 = selection14.slice(11, 14).map(s => s || '-').join('');

                    let p15Val = '';
                    if (p.selection && p.selection[14]) {
                        const raw = String(p.selection[14]).trim();
                        if (raw && raw !== '-') p15Val = raw;
                    }

                    const lateClass = p.late ? ' late' : '';
                    const lateTitle = p.late ? ' (Enviado con retraso)' : '';
                    const diceBadge = p.isDice ? '<span class="sf-dice-badge" title="Relleno con Dado 🎲">🎲</span>' : '';
                    const p15Badge = p15Val ? `<span class="sf-p15-badge" title="Pleno al 15: ${p15Val}">P15: ${p15Val}</span>` : '';

                    cellContent = `
                        <div class="summary-forecast${lateClass}" title="Pronóstico${lateTitle}${p.isDice ? ' (Relleno con Dado 🎲)' : ''} - ${cellLed.title}">
                            ${cellLedHtml}
                            ${diceBadge}
                            <span class="sf-block">${b1}</span>
                            <span class="sf-sep">|</span>
                            <span class="sf-block">${b2}</span>
                            <span class="sf-sep">|</span>
                            <span class="sf-block">${b3}</span>
                            <span class="sf-sep">|</span>
                            <span class="sf-block">${b4}</span>
                            ${p15Badge}
                        </div>
                    `;
                } else {
                    cellContent = `<span class="summary-no-data" title="${cellLed.title}">${cellLedHtml}-</span>`;
                }

                rowHtml += `<td class="${cellClass}" data-jid="${j.id}" data-mid="${m.id}">${cellContent}</td>`;
            });

            // 5. Add Quiniela de Dobles cell for this jornada
            const jIdStr = String(j.id);
            const pExtra = pronosticosExtraMap.get(jIdStr);
            let doublesContent = '-';
            let isDoublesPlayed = false;

            if (pExtra && pExtra.selection && Array.isArray(pExtra.selection)) {
                isDoublesPlayed = pExtra.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-');
            }

            if (isDoublesPlayed) {
                const selection14 = (pExtra.selection && Array.isArray(pExtra.selection)) ? pExtra.selection.slice(0, 14) : [];
                let gridColsHtml = '';

                for (let idx = 0; idx < 14; idx++) {
                    const s = selection14[idx];
                    const signStr = (s && typeof s === 'string') ? s.trim() : (s !== undefined && s !== null ? String(s).trim() : '');
                    
                    let mainSign = '-';
                    let subSign = '-';
                    let isSubActive = false;

                    if (signStr && signStr !== '-') {
                        mainSign = signStr.charAt(0) || '-';
                        if (signStr.length > 1) {
                            subSign = signStr.charAt(1);
                            isSubActive = true;
                        }
                    }

                    const isBlockEnd = [3, 7, 10].includes(idx);
                    const subClass = isSubActive ? 'sign-sub active' : 'sign-sub empty';
                    const blockEndClass = isBlockEnd ? ' block-end' : '';
                    gridColsHtml += `
                        <div class="doubles-col${blockEndClass}">
                            <span class="sign-main">${mainSign}</span>
                            <span class="${subClass}">${subSign}</span>
                        </div>
                    `;
                }

                let p15Val = '-';
                if (pExtra.selection && Array.isArray(pExtra.selection) && pExtra.selection[14]) {
                    const rawP15 = String(pExtra.selection[14]).trim();
                    if (rawP15 && rawP15 !== '-') {
                        p15Val = rawP15;
                    }
                }

                const p15BadgeClass = p15Val !== '-' ? 'doubles-p15-badge' : 'doubles-p15-badge empty';
                const p15Badge = `<span class="${p15BadgeClass}" title="Pleno al 15">P15: ${p15Val}</span>`;

                doublesContent = `
                    <div class="summary-doubles-container">
                        <div class="doubles-grid-wrapper">
                            <div class="doubles-grid">
                                ${gridColsHtml}
                            </div>
                            ${p15Badge}
                        </div>
                    </div>
                `;
            } else {
                doublesContent = `<span class="summary-no-data">-</span>`;
            }

            const doublesCellClass = `summary-cell summary-doubles-cell hoverable-cell`;
            const doublesMemberId = pExtra ? (pExtra.mId || pExtra.memberId || '') : '';
            rowHtml += `<td class="${doublesCellClass}" data-jid="${j.id}" data-mid="${doublesMemberId}" data-isdoubles="true">${doublesContent}</td>`;

            rowHtml += '</tr>';
            tbodyHtml += rowHtml;
        });
        
        tbody.innerHTML = tbodyHtml;

        // Horizontal Scroll Sync (Double Scrollbar)
        this.applyDoubleScrollbar();
    }

    applyDoubleScrollbar() {
        if (!this.summaryContainer || !this.summaryTable) return;

        // Create or find the top scroll wrapper
        let topWrapper = document.getElementById('top-scroll-wrapper');
        if (!topWrapper) {
            topWrapper = document.createElement('div');
            topWrapper.id = 'top-scroll-wrapper';
            topWrapper.style.overflowX = 'auto';
            topWrapper.style.overflowY = 'hidden';
            topWrapper.style.WebkitOverflowScrolling = 'touch'; // Habilita inercia
            topWrapper.style.width = '100%';
            topWrapper.style.height = '20px'; // Minimum height for scrollbar
            topWrapper.innerHTML = '<div id="top-scroll-content" style="height:1px;"></div>';
            this.summaryContainer.parentElement.insertBefore(topWrapper, this.summaryContainer);
        }

        const topContent = document.getElementById('top-scroll-content');
        const container = this.summaryContainer;
        const table = this.summaryTable;

        // En móviles/tablets, el doble scrollbar no es necesario y rompe la inercia nativa de iOS.
        const isTouch = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 1024;
        
        if (isTouch) {
            topWrapper.style.display = 'none';
            // Limpiamos los eventos por si se redimensiona la pantalla
            container.onscroll = null;
            topWrapper.onscroll = null;
            return;
        } else {
            topWrapper.style.display = 'block';
        }

        // Sync contents width
        const updateWidth = () => {
            topContent.style.width = table.offsetWidth + 'px';
        };

        // Initial and on resize
        updateWidth();
        window.addEventListener('resize', updateWidth);

        // Sync scroll events for Desktop (Mouse)
        let isSyncingLeft = false;
        let isSyncingRight = false;
        
        topWrapper.onscroll = function () {
            if (!isSyncingLeft) {
                isSyncingRight = true;
                window.requestAnimationFrame(() => {
                    container.scrollLeft = topWrapper.scrollLeft;
                    setTimeout(() => { isSyncingRight = false; }, 10);
                });
            }
        };
        container.onscroll = function () {
            if (!isSyncingRight) {
                isSyncingLeft = true;
                window.requestAnimationFrame(() => {
                    topWrapper.scrollLeft = container.scrollLeft;
                    setTimeout(() => { isSyncingLeft = false; }, 10);
                });
            }
        };
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

            // Sort members by ID (Member Number)
            const sortedMembers = [...this.members].sort((a, b) => parseInt(a.id) - parseInt(b.id));

            this.viewJornadaTitle.textContent = `Ver Pronósticos`;
            this.viewJornadaContent.innerHTML = '<p style="padding:40px; font-size:1rem; font-weight:bold; color:#f59e0b; text-align:center;">⚙️ Generando tabla...</p>';

            // Critical fix: Ensure opacity is 1 and z-index is high
            this.viewJornadaModal.style.display = 'flex';
            this.viewJornadaModal.style.opacity = '1';
            this.viewJornadaModal.style.zIndex = '999999';

            const isMobile = window.innerWidth <= 768;

            if (this.btnCloseMobileFloat) {
                this.btnCloseMobileFloat.style.display = isMobile ? 'block' : 'none';
            }



            // ────────────────────────────────────────────────────
            //  TABLA PRONÓSTICOS COLECTIVOS — estilo Bote 2 / v2
            // ────────────────────────────────────────────────────
            const isLightTheme = document.body.classList.contains('light-theme');

            // Color tokens (dark/light)
            const BG_TABLE        = isLightTheme ? '#f8fafc'       : '#0c1220';
            const BG_THEAD        = isLightTheme ? '#1e293b'       : '#060b14';
            const BG_STICKY       = isLightTheme ? '#f1f5f9'       : '#0a1120';
            const BG_ROW_EVEN     = isLightTheme ? '#f8fafc'       : 'rgba(15,23,42,0.6)';
            const BG_ROW_ODD      = isLightTheme ? '#f1f5f9'       : 'rgba(10,18,40,0.4)';
            const BG_RESULT_CELL  = isLightTheme ? '#1e293b'       : '#060b14';
            const BG_DOUBLES_COL  = isLightTheme ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.12)';
            const BG_HIT          = isLightTheme ? '#a7f3d0'       : 'rgba(16,185,129,0.32)';
            const BG_PERFECT      = isLightTheme ? '#fef9c3'       : 'rgba(234,179,8,0.15)';
            const BG_FOOT         = isLightTheme ? '#1e293b'       : '#060b14';
            const C_TEXT          = isLightTheme ? '#e2e8f0'       : '#94a3b8';
            const C_AMBER         = isLightTheme ? '#d97706'       : '#f59e0b';
            const C_TEAM          = isLightTheme ? '#0f172a'       : '#e2e8f0';
            const C_HIT_BORDER    = isLightTheme ? '#059669'       : '#10b981';
            const C_RESULT        = isLightTheme ? '#f8fafc'       : '#e2e8f0';
            const C_DOUBLES       = isLightTheme ? '#a78bfa'       : '#c4b5fd';
            const C_SIGN_1        = isLightTheme ? '#059669'       : '#34d399';
            const C_SIGN_X        = isLightTheme ? '#0284c7'       : '#38bdf8';
            const C_SIGN_2        = isLightTheme ? '#d97706'       : '#fbbf24';
            const C_SIGN_CUSTOM   = isLightTheme ? '#7c3aed'       : '#c084fc';
            const BORDER_COL      = isLightTheme ? 'rgba(148,163,184,0.25)' : 'rgba(51,65,85,0.5)';
            const BORDER_BLOCK    = isLightTheme ? 'rgba(217,119,6,0.6)'   : 'rgba(245,158,11,0.5)';

            const fSizeBase  = isMobile ? '0.72rem' : '0.82rem';
            const fSizeSign  = isMobile ? '0.95rem' : '1.1rem';
            const fSizeHits  = isMobile ? '1rem'    : '1.3rem';
            const padHdr     = isMobile ? '6px 4px' : '10px 8px';
            const padTeam    = isMobile ? '5px 6px' : '8px 14px';
            const padCell    = isMobile ? '4px 3px' : '7px 5px';
            const wNum       = isMobile ? '32px'    : '42px';
            const wTeam      = isMobile ? '110px'   : '210px';
            const wMem       = isMobile ? '30px'    : '50px';
            const hMem       = isMobile ? '100px'   : '180px';
            const leftHome   = isMobile ? '32px'    : '42px';
            const leftAway   = isMobile ? '142px'   : '252px';
            const leftNum    = '0px';

            const signColor = (s) => {
                if (!s || s === '-') return C_TEXT;
                if (s === '1') return C_SIGN_1;
                if (s === 'X') return C_SIGN_X;
                if (s === '2') return C_SIGN_2;
                return C_SIGN_CUSTOM;
            };

            const thBase    = `border-right: 1px solid ${BORDER_COL}; border-bottom: 2px solid ${BORDER_COL}; font-family:'JetBrains Mono',monospace; vertical-align:bottom; padding:${padHdr};`;
            const tdStickyBase = `position:sticky; z-index:5; background:${BG_STICKY}; border-right:1px solid ${BORDER_COL}; font-family:'JetBrains Mono',monospace; font-weight:700;`;

            let html = `
                <style>
                    #cjf-table { border-collapse: separate; border-spacing: 0; font-size: ${fSizeBase}; background: ${BG_TABLE}; width: auto; min-width: ${isMobile ? '100%' : '98%'}; border: 1px solid ${BORDER_COL}; border-radius: 10px; overflow: hidden; }
                    #cjf-table tr:hover td { background: rgba(245,158,11,0.05) !important; }
                </style>
                <table id="cjf-table">
                    <thead style="position:sticky; top:0; z-index:100; background:${BG_THEAD};">
                        <tr>
                            <th style="${thBase} position:sticky; left:${leftNum}; z-index:110; background:${BG_THEAD}; min-width:${wNum}; max-width:${wNum}; text-align:center; color:${C_AMBER}; font-size:${fSizeBase}; font-weight:900;">#</th>
                            <th style="${thBase} position:sticky; left:${leftHome}; z-index:110; background:${BG_THEAD}; min-width:${wTeam}; max-width:${wTeam}; text-align:right; color:${C_TEXT}; font-size:${fSizeBase}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Local</th>
                            <th style="${thBase} position:sticky; left:${leftAway}; z-index:110; background:${BG_THEAD}; min-width:${wTeam}; max-width:${wTeam}; text-align:left; color:${C_TEXT}; font-size:${fSizeBase}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Visitante</th>
            `;

            // Member headers (vertical text)
            sortedMembers.forEach(m => {
                const f = allForecasts.find(p => String(p.mId || p.memberId) === String(m.id));
                const diceIcon = (f && f.isDice) ? ' 🎲' : '';
                const led = this.getMemberStatusLed(m.id, jornada);
                html += `<th title="${m.name}${diceIcon} — ${led.title}" style="${thBase} border-right:1px solid ${BORDER_COL}; writing-mode:vertical-lr; transform:rotate(180deg); text-align:center; height:${hMem}; width:${wMem}; min-width:${wMem}; font-size:${fSizeBase}; color:${C_TEXT}; white-space:nowrap; overflow:hidden;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                        <span class="led-status-indicator led-${led.status}" style="transform:rotate(180deg);" title="${led.title}"></span>
                        <span>${m.name}${diceIcon}</span>
                    </div>
                </th>`;
            });

            // Doubles column headers
            allDoubles.forEach(() => {
                html += `<th style="${thBase} writing-mode:vertical-lr; transform:rotate(180deg); text-align:center; height:${hMem}; width:${wMem}; min-width:${wMem}; font-size:${fSizeBase}; color:${C_DOUBLES}; background:${BG_DOUBLES_COL}; border-left:2px solid rgba(139,92,246,0.5); white-space:nowrap;">Quiniela Dobles</th>`;
            });

            // Columna perfecta / Columna Maula (Ocultada temporalmente a petición)
            let perfectColumn = null;
            let perfectHits = 0;
            /* Ocultada temporalmente por no funcionar adecuadamente:
            const allResolved = sortedMembers.every(m => allForecasts.some(p => String(p.mId || p.memberId) === String(m.id)));
            if (allResolved) {
                perfectColumn = this.calculatePerfectColumn(jornada);
                html += `<th style="${thBase} writing-mode:vertical-lr; transform:rotate(180deg); text-align:center; height:${hMem}; width:${wMem}; min-width:${wMem}; font-size:${fSizeBase}; color:#fbbf24; background:rgba(234,179,8,0.15); border-left:2px solid rgba(234,179,8,0.5); white-space:nowrap;">⭐ COLUMNA MAULA</th>`;
            }
            */

            // Resultado
            html += `<th style="${thBase} writing-mode:vertical-lr; transform:rotate(180deg); text-align:center; height:${hMem}; width:${wMem}; min-width:${wMem}; font-size:${fSizeBase}; color:${C_AMBER}; border-left:2px solid ${BORDER_BLOCK}; white-space:nowrap;">RESULTADO</th>`;
            html += `</tr></thead><tbody>`;

            const baseHitsCount = {};
            const doublesHitsCount = {};
            sortedMembers.forEach(m => baseHitsCount[m.id] = 0);
            allDoubles.forEach((_, idx) => doublesHitsCount[idx] = 0);
            const totalCols = 3 + sortedMembers.length + allDoubles.length + (perfectColumn ? 1 : 0) + 1;

            jornada.matches.forEach((match, idx) => {
                const displayIdx = idx === 14 ? 'P15' : idx + 1;
                const isBlockEnd = [3, 7, 10, 13].includes(idx);
                const isP15Divider = idx === 13;
                const blockBorderStyle = isBlockEnd ? `border-bottom: 3px solid ${BORDER_BLOCK};` : '';
                const bgRow = idx % 2 === 0 ? BG_ROW_EVEN : BG_ROW_ODD;
                const officialResult = match.result || null;

                const homeLogo = AppUtils.getTeamLogo(match.home);
                const awayLogo = AppUtils.getTeamLogo(match.away);
                const logoImgHome = homeLogo ? `<img src="${homeLogo}" class="team-logo" style="width:18px; height:18px; object-fit:contain; vertical-align:middle; flex-shrink:0;" onerror="this.style.display='none'">` : '';
                const logoImgAway = awayLogo ? `<img src="${awayLogo}" class="team-logo" style="width:18px; height:18px; object-fit:contain; vertical-align:middle; flex-shrink:0;" onerror="this.style.display='none'">` : '';

                html += `<tr>
                    <td style="${tdStickyBase} left:${leftNum}; background:${BG_STICKY}; ${blockBorderStyle} padding:${padCell}; text-align:center; color:${C_AMBER}; font-size:${fSizeBase}; min-width:${wNum}; max-width:${wNum};">${displayIdx}</td>
                    <td style="${tdStickyBase} left:${leftHome}; background:${BG_STICKY}; ${blockBorderStyle} padding:${padTeam}; min-width:${wTeam}; max-width:${wTeam}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${C_TEAM}; font-size:${fSizeBase};">
                        <div style="display:flex; align-items:center; justify-content:flex-end; gap:6px; overflow:hidden;">
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${match.home}</span>
                            ${logoImgHome}
                        </div>
                    </td>
                    <td style="${tdStickyBase} left:${leftAway}; background:${BG_STICKY}; border-right:2px solid ${BORDER_BLOCK}; ${blockBorderStyle} padding:${padTeam}; min-width:${wTeam}; max-width:${wTeam}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${C_TEAM}; font-size:${fSizeBase};">
                        <div style="display:flex; align-items:center; justify-content:flex-start; gap:6px; overflow:hidden;">
                            ${logoImgAway}
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${match.away}</span>
                        </div>
                    </td>
                `;

                sortedMembers.forEach(m => {
                    const f = allForecasts.find(p => String(p.mId || p.memberId) === String(m.id));
                    let sign = '-';
                    let bg = bgRow;
                    let borderExtra = '';
                    let colorSign = C_TEXT;

                    if (f && f.selection && f.selection[idx]) {
                        sign = f.selection[idx];
                        colorSign = signColor(sign);
                        const isHit = officialResult && sign === officialResult;
                        if (isHit) {
                            bg = BG_HIT;
                            borderExtra = '';
                            baseHitsCount[m.id]++;
                        } else if (f.late && !f.pardoned) {
                            bg = isLightTheme ? '#fef9c3' : 'rgba(245,158,11,0.08)';
                        }
                    }

                    html += `<td style="background:${bg}; ${borderExtra} border-right:1px solid ${BORDER_COL}; ${blockBorderStyle} padding:${padCell}; text-align:center; min-width:${wMem}; font-weight:900; font-size:${fSizeSign}; color:${colorSign}; font-family:'JetBrains Mono',monospace;">${sign}</td>`;
                });

                allDoubles.forEach((db, dbIdx) => {
                    let sign = '-';
                    let bg = BG_DOUBLES_COL;
                    let borderExtra = `border-left:2px solid rgba(139,92,246,0.4);`;
                    let colorSign = C_DOUBLES;

                    if (db.selection && db.selection[idx]) {
                        sign = db.selection[idx];
                        const isHit = officialResult && sign.includes(officialResult);
                        if (isHit) {
                            bg = BG_HIT;
                            doublesHitsCount[dbIdx]++;
                        }
                    }
                    html += `<td style="background:${bg}; ${borderExtra} border-right:1px solid rgba(139,92,246,0.3); ${blockBorderStyle} padding:${padCell}; text-align:center; min-width:${wMem}; font-weight:900; font-size:${fSizeSign}; color:${colorSign}; font-family:'JetBrains Mono',monospace;">${sign}</td>`;
                });

                if (perfectColumn) {
                    const sign = perfectColumn[idx] || '-';
                    let bg = BG_PERFECT;
                    let colorSign = '#fbbf24';
                    let borderExtra = 'border-left:2px solid rgba(234,179,8,0.5);';
                    const isHit = officialResult && sign === officialResult;
                    if (isHit) {
                        bg = isLightTheme ? '#fef08a' : 'rgba(234,179,8,0.3)';
                        perfectHits++;
                    }
                    html += `<td style="background:${bg}; ${borderExtra} border-right:1px solid rgba(234,179,8,0.3); ${blockBorderStyle} padding:${padCell}; text-align:center; min-width:${wMem}; font-weight:900; font-size:${fSizeSign}; color:${colorSign}; font-family:'JetBrains Mono',monospace;">${sign}</td>`;
                }

                const resVal = officialResult || '-';
                const rColor = signColor(resVal);
                html += `<td style="background:${BG_RESULT_CELL}; border-left:2px solid ${BORDER_BLOCK}; ${blockBorderStyle} padding:${padCell}; text-align:center; min-width:${wMem}; font-weight:900; font-size:${fSizeSign}; color:${rColor}; font-family:'JetBrains Mono',monospace;">${resVal}</td>`;
                html += `</tr>`;

                if (isBlockEnd) {
                    if (isP15Divider) {
                        html += `<tr><td colspan="${totalCols}" style="background:linear-gradient(90deg,rgba(245,158,11,0.15),rgba(245,158,11,0.4),rgba(245,158,11,0.15)); height:20px; text-align:center; color:${C_AMBER}; font-size:0.72rem; font-weight:900; letter-spacing:3px; padding:2px 0; border-top:1px solid ${BORDER_BLOCK}; border-bottom:1px solid ${BORDER_BLOCK}; font-family:'JetBrains Mono',monospace;">★ PLENO AL 15 ★</td></tr>`;
                    } else {
                        html += `<tr><td colspan="${totalCols}" style="background:${BORDER_BLOCK}; height:2px; border:none; padding:0; opacity:0.8;"></td></tr>`;
                    }
                }
            });

            html += `</tbody>`;

            // Footer resumen
            const footCellBase = `font-family:'JetBrains Mono',monospace; font-weight:900; font-size:${fSizeHits}; text-align:center; border-right:1px solid ${BORDER_COL};`;
            html += `<tfoot style="position:sticky; bottom:0; z-index:10; background:${BG_FOOT};">
                <tr style="border-top:2px solid ${BORDER_BLOCK}; height:${isMobile ? '38px' : '52px'};">
                    <td colspan="3" style="text-align:right; padding:8px 14px; font-weight:900; color:${C_AMBER}; font-size:${fSizeBase}; font-family:'JetBrains Mono',monospace; border-right:2px solid ${BORDER_BLOCK};">TOTAL ACIERTOS</td>
            `;

            sortedMembers.forEach(m => {
                const hits = baseHitsCount[m.id];
                const hColor = hits > 10 ? '#34d399' : hits > 7 ? '#fbbf24' : C_TEXT;
                html += `<td style="${footCellBase} color:${hColor};">${hits}</td>`;
            });

            allDoubles.forEach((_, idx) => {
                const hits = doublesHitsCount[idx];
                html += `<td style="${footCellBase} color:${C_DOUBLES}; border-left:2px solid rgba(139,92,246,0.4);">${hits}</td>`;
            });

            if (perfectColumn) {
                html += `<td style="${footCellBase} color:#fbbf24; border-left:2px solid rgba(234,179,8,0.5);">${perfectHits}</td>`;
            }
            html += `<td style="background:${BG_RESULT_CELL}; border-left:2px solid ${BORDER_BLOCK};"></td>`;
            html += `</tr></tfoot></table>`;

            this.viewJornadaContent.innerHTML = html;
            this.viewJornadaContent.style.overflowY = 'auto';

            // Verify visibility logic
            if (window.getComputedStyle(this.viewJornadaModal).opacity === "0") {
                this.viewJornadaModal.style.opacity = '1';
            }

            // Update navigation button states
            this.updateNavigationButtons();


        } catch (err) {
            console.error("CRITICAL ERROR IN TECHNICAL PANEL:", err);
            alert("Error al abrir el panel técnico: " + err.message);
            if (this.viewJornadaModal) this.viewJornadaModal.style.display = 'none';
        }
    }

    navigateJornada(direction) {
        if (!this.selModalJornada || this.selModalJornada.options.length === 0) {
            console.warn('No se puede navegar: dropdown no disponible');
            return;
        }

        const currentIndex = this.selModalJornada.selectedIndex;
        let newIndex;

        // El dropdown está ordenado descendente: Jornada 10, 9, 8, 7...
        // Índice 0 = Jornada más reciente (número mayor)
        // Índice N = Jornada más antigua (número menor)

        if (direction === 'prev') {
            // Botón izquierdo: ir a jornada ANTERIOR (número menor)
            // Necesitamos avanzar en la lista (índice mayor)
            newIndex = currentIndex + 1;
        } else if (direction === 'next') {
            // Botón derecho: ir a jornada SIGUIENTE (número mayor)
            // Necesitamos retroceder en la lista (índice menor)
            newIndex = currentIndex - 1;
        } else {
            console.warn('Dirección de navegación no válida:', direction);
            return;
        }

        // Verificar límites
        if (newIndex >= 0 && newIndex < this.selModalJornada.options.length) {
            this.selModalJornada.selectedIndex = newIndex;
            const newJornadaId = this.selModalJornada.value;
            console.log(`Navegando a jornada ${newJornadaId} (índice ${newIndex})`);
            this.showJornadaForecasts(newJornadaId);
        } else {
            console.log('Límite alcanzado, no se puede navegar más');
        }

        // Actualizar estado de los botones
        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        if (!this.selModalJornada || !this.btnPrevJornada || !this.btnNextJornada) {
            console.warn('No se pueden actualizar botones de navegación: elementos no disponibles');
            return;
        }

        const currentIndex = this.selModalJornada.selectedIndex;
        const totalOptions = this.selModalJornada.options.length;

        console.log(`Actualizando botones: índice ${currentIndex} de ${totalOptions}`);

        // Botón PREV (◀): va a jornada anterior (número menor)
        // Está al final de la lista (índice mayor)
        const canGoPrev = currentIndex < totalOptions - 1;
        this.btnPrevJornada.disabled = !canGoPrev;
        this.btnPrevJornada.style.opacity = canGoPrev ? '1' : '0.3';
        this.btnPrevJornada.style.cursor = canGoPrev ? 'pointer' : 'not-allowed';

        // Botón NEXT (▶): va a jornada siguiente (número mayor)
        // Está al principio de la lista (índice menor)
        const canGoNext = currentIndex > 0;
        this.btnNextJornada.disabled = !canGoNext;
        this.btnNextJornada.style.opacity = canGoNext ? '1' : '0.3';
        this.btnNextJornada.style.cursor = canGoNext ? 'pointer' : 'not-allowed';
    }



    /**
     * REESCRITURA TOTAL: Lógica de elegibilidad para dobles.
     * Incluye sistema de DESEMPATE para garantizar un único ganador.
     */
    checkEligibility(currentJornadaNum, memberId, forceReal = false) {
        // CORRECTION MODE BYPASS: If we are in correction mode, always allow managing doubles (unless calculating real eligibility)
        if (this.correctionMode && !forceReal) return { eligible: true };

        if (currentJornadaNum <= 1) {
            if (currentJornadaNum === 1) {
                const member = this.members.find(m => String(m.id) === String(memberId));
                if (member && (member.name.toLowerCase() === 'alvaro' || member.name.toLowerCase() === 'álvaro')) {
                    return { eligible: true, reason: 'winner' };
                }
            }
            return { eligible: false };
        }

        const currentJornada = (this.jornadas || []).find(j => parseInt(j.number) === parseInt(currentJornadaNum) || String(j.id) === String(currentJornadaNum));

        // Asignación explícita configurada en la jornada (campo doblesMembers)
        if (currentJornada && Array.isArray(currentJornada.doblesMembers) && currentJornada.doblesMembers.length > 0) {
            const isAssigned = currentJornada.doblesMembers.some(id => String(id) === String(memberId));
            return {
                eligible: isAssigned,
                isWinner: isAssigned,
                hasPrize: false,
                reason: isAssigned ? 'assigned' : 'not_assigned'
            };
        }

        // 1. Encontrar la jornada previa REAL con resultados disputados
        const sortedJornadas = [...this.jornadas].sort((a, b) => a.number - b.number);
        const prevJornada = sortedJornadas.filter(j => 
            j.number < currentJornadaNum && 
            j.matches && 
            j.matches.filter(m => {
                const r = String(m.result !== undefined ? m.result : (m.r || '')).trim().toLowerCase();
                return r !== '' && r !== '-' && r !== 'por definir';
            }).length >= 14
        ).pop();

        if (!prevJornada || !prevJornada.matches) {
            console.log("DOUBLES: No hay jornada previa registrada con resultados suficientes.");
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

        // 3. CALCULAR DATOS DE TODOS LOS SOCIOS PARA LA JORNADA PREVIA (CON CACHÉ O(1))
        if (!this._prevJornadaEvalCache) this._prevJornadaEvalCache = new Map();
        const prevKey = `${prevJornada.id}_${prevJornada.number}`;
        let cachedEval = this._prevJornadaEvalCache.get(prevKey);

        if (!cachedEval) {
            const prizeMap = (prevJornada.prizes && typeof prevJornada.prizes === 'object' && Object.keys(prevJornada.prizes).length > 0)
                ? prevJornada.prizes 
                : (prevJornada.prizeRates || {});
            const leaderboard = this.members.map(m => {
                const p = this.pronosticos.find(pred => {
                    const pJid = String(pred.jId !== undefined && pred.jId !== null ? pred.jId : (pred.jornadaId || ''));
                    const pMid = String(pred.mId !== undefined && pred.mId !== null ? pred.mId : (pred.memberId || ''));
                    const matchJ = (pJid === String(prevJornada.id) || pJid === String(prevJornada.number));
                    const matchM = (pMid === String(m.id));
                    return matchJ && matchM;
                });

                if (!p || !p.selection) {
                    return { id: String(m.id), name: m.name, points: -5, hits: 0, prize: 0, isLate: false, isPardoned: false };
                }

                const isLate = p.late && !p.pardoned;
                const isPardoned = p.pardoned || false;

                if (isLate) {
                    return { id: String(m.id), name: m.name, points: ScoringSystem.calculateScore(0, jDate), hits: 0, prize: 0, isLate: true, isPardoned: false };
                }

                let evPoints = 0;
                let evHits = 0;
                let evPrize = 0;
                if (p.selection && Array.isArray(p.selection)) {
                    const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
                    evPoints = ev.points;
                    evHits = ev.hits;
                    const pVal = prizeMap[ev.hits] || prizeMap[String(ev.hits)] || 0;
                    evPrize = typeof pVal === 'number' ? pVal : parseFloat(String(pVal).replace(',', '.').replace('€', '').trim() || 0);
                }
                if (typeof ScoringSystem !== 'undefined' && typeof ScoringSystem.evaluateMember === 'function') {
                    try {
                        const evMem = ScoringSystem.evaluateMember(m, prevJornada, p, { forceFinished: true });
                        if (evMem) {
                            evPoints = evMem.points;
                            evHits = evMem.hits;
                            const pMemPrize = typeof evMem.prize === 'number' ? evMem.prize : parseFloat(String(evMem.prize || 0).replace(',', '.').replace('€', '').trim() || 0);
                            if (pMemPrize > 0) evPrize = pMemPrize;
                        }
                    } catch (e) {}
                }
                if (typeof BoteEngine !== 'undefined' && typeof BoteEngine.getPrizesForMemberJornada === 'function') {
                    try {
                        const bPrize = BoteEngine.getPrizesForMemberJornada(m.id, prevJornada, this.pronosticos);
                        if (bPrize > 0) evPrize = bPrize;
                    } catch (e) {}
                }

                return { id: String(m.id), name: m.name, points: evPoints, hits: evHits, prize: evPrize, isLate: p.late || false, isPardoned: isPardoned };
            });

            // 4. FILTRAR CANDIDATOS ELEGIBLES PARA GANADOR: excluir tarde sin perdón
            const eligibleForWinner = leaderboard.filter(l => {
                if (!l.isLate) return true;
                if (l.isPardoned) return true;
                if (l.prize > 0) return true;
                return false;
            });

            let absoluteWinnerId = null;
            if (eligibleForWinner.length > 0) {
                // 5. ENCONTRAR MÁXIMO DE PUNTOS
                const maxPoints = Math.max(...eligibleForWinner.map(l => l.points));
                let winnerCandidates = eligibleForWinner.filter(l => l.points === maxPoints);

                // 6. DESEMPATE RECURSIVO SI HAY EMPATE
                if (winnerCandidates.length > 1) {
                    winnerCandidates = this.resolveTieEligibility(winnerCandidates, prevJornada.number);
                }

                // 7. El ganador es el primero de la lista (desempate por ID si persiste)
                if (winnerCandidates.length > 1) {
                    winnerCandidates.sort((a, b) => Number(a.id) - Number(b.id));
                }
                if (winnerCandidates.length > 0 && winnerCandidates[0].points > -5) {
                    absoluteWinnerId = winnerCandidates[0].id;
                }
            }

            cachedEval = { leaderboard, absoluteWinnerId };
            this._prevJornadaEvalCache.set(prevKey, cachedEval);
        }

        const leaderboard = cachedEval.leaderboard;
        const absoluteWinnerId = cachedEval.absoluteWinnerId;

        // 8. Verificación para el socio actual:
        const myStats = leaderboard.find(l => String(l.id) === String(memberId));
        const isAbsoluteWinner = absoluteWinnerId && String(memberId) === String(absoluteWinnerId);

        // A) Premio económico en columna individual del socio
        let hasIndividualMoneyPrize = myStats && myStats.prize > 0;
        if (!hasIndividualMoneyPrize && typeof BoteEngine !== 'undefined' && typeof BoteEngine.getPrizesForMemberJornada === 'function') {
            try {
                const bPrize = BoteEngine.getPrizesForMemberJornada(memberId, prevJornada, this.pronosticos);
                if (bPrize > 0) hasIndividualMoneyPrize = true;
            } catch (e) {}
        }

        const hasEconomicPrize = hasIndividualMoneyPrize;

        // NUEVA REGLA (A partir de la Jornada 16):
        // SÓLO puede haber UN socio que rellena/sella la quiniela de dobles: el ganador de la jornada anterior.
        // Lo anterior (< Jornada 16) se conserva como estaba (ganador o premio económico individual).
        const isNewRuleActive = parseInt(currentJornadaNum) >= 16;
        let isEligible = false;
        let eligibleReason = 'not_winner';

        if (isNewRuleActive) {
            isEligible = Boolean(isAbsoluteWinner);
            eligibleReason = isEligible ? 'winner' : 'not_winner';
        } else {
            isEligible = isAbsoluteWinner || hasEconomicPrize;
            eligibleReason = isEligible ? (isAbsoluteWinner ? 'winner' : 'prize') : 'not_winner';
        }

        if (isEligible) {
            console.log(`✅ ACCESO CONCEDIDO A DOBLES para ${this.members.find(m => String(m.id) === String(memberId))?.name} (${isAbsoluteWinner ? 'Ganador Único' : (hasIndividualMoneyPrize ? 'Premio Individual' : 'Premio Dobles')})`);
        }

        return {
            eligible: isEligible,
            isWinner: isAbsoluteWinner,
            hasPrize: isNewRuleActive ? false : hasEconomicPrize,
            reason: eligibleReason
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
                    return (pJid === String(checkJornada.id) || pJid === String(checkJornada.number)) && pMid === String(candidate.id);
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

        // Load existing doubles: buscar EXCLUSIVAMENTE el del socio actual en esta jornada
        const existingExtra = (this.pronosticosExtra || []).find(p => 
            (String(p.jId || p.jornadaId) === String(this.currentJornadaId)) && 
            (String(p.mId || p.memberId) === String(this.currentMemberId)) &&
            (p.selection && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-'))
        ) || (this.pronosticosExtra || []).find(p => 
            (String(p.jId || p.jornadaId) === String(this.currentJornadaId)) && 
            (String(p.mId || p.memberId) === String(this.currentMemberId))
        );
        const selections = existingExtra && existingExtra.selection ? existingExtra.selection : Array(15).fill('');

        // Comprobar si la jornada tiene resultados para marcar aciertos en dobles
        let doublesHitsCount = 0;
        let hasAnyMatchResult = false;
        const officialResults = Array.isArray(jornada.matches) ? jornada.matches.map(m => m.result) : [];
        if (Array.isArray(jornada.matches)) {
            hasAnyMatchResult = jornada.matches.some(m => {
                const r = m && m.result ? String(m.result).trim() : '';
                return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
            });
        }

        const doublesHitStatus = Array(15).fill(null);
        if (hasAnyMatchResult && Array.isArray(selections)) {
            for (let i = 0; i < 15; i++) {
                const res = officialResults[i];
                if (!res || String(res).trim() === '' || String(res).trim() === '-' || String(res).trim().toLowerCase() === 'por definir') {
                    doublesHitStatus[i] = null;
                    continue;
                }
                const sel = selections[i];
                if (!sel) {
                    doublesHitStatus[i] = false;
                    continue;
                }
                const rSign = window.ScoringSystem ? window.ScoringSystem.normalizeSign(res) : String(res).trim().toUpperCase();
                const rScore = String(res).trim().toUpperCase();
                const pred = String(sel).trim().toUpperCase();

                if (i < 14) {
                    const isHit = pred.includes(rSign) || pred === rSign;
                    doublesHitStatus[i] = isHit;
                    if (isHit) doublesHitsCount++;
                } else if (i === 14) {
                    const isHit = (pred === rScore) || (pred === rSign);
                    doublesHitStatus[i] = isHit;
                }
            }

            if (this.doublesStatus) {
                const isFinished = Array.isArray(jornada.matches) && jornada.matches.length === 15 && jornada.matches.every(m => m && m.result && m.result !== '' && m.result !== '-');
                this.doublesStatus.innerHTML = `
                    <div class="p-2 mb-2 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-center justify-center gap-2">
                        <span class="text-xs font-mono font-bold text-purple-300">
                            🎯 Quiniela Colectiva: <strong class="text-emerald-400 text-sm">${doublesHitsCount} / 14 aciertos</strong>${doublesHitStatus[14] === true ? ' (+P15 ✅)' : ''}
                        </span>
                        ${!isFinished ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">En Juego</span>' : ''}
                    </div>
                `;
            }
        }

        // Activar visibilidad de las barras de análisis de Mundo Deportivo para dobles
        this.currentJornadaHasMDAnalysis = this.checkIfJornadaHasMDAnalysis(jornada);
        const mobileTopBarDoubles = document.getElementById('md-mobile-top-bar-doubles');
        if (mobileTopBarDoubles) {
            mobileTopBarDoubles.classList.toggle('hidden', !this.currentJornadaHasMDAnalysis);
            mobileTopBarDoubles.classList.toggle('flex', !!this.currentJornadaHasMDAnalysis);
            const labelDoubles = document.getElementById('label-toggle-all-md-doubles');
            const arrowDoubles = document.getElementById('arrow-toggle-all-md-doubles');
            if (labelDoubles) labelDoubles.textContent = 'Ver todos';
            if (arrowDoubles) arrowDoubles.textContent = '▼';
        }
        const sourceBarDoubles = document.getElementById('md-source-bar-doubles');
        if (sourceBarDoubles) {
            sourceBarDoubles.classList.toggle('hidden', !this.currentJornadaHasMDAnalysis);
            sourceBarDoubles.classList.toggle('flex', !!this.currentJornadaHasMDAnalysis);
        }

        if (this.mdAnalysisSidebar && this.editorForecastCol) {
            if (this.currentJornadaHasMDAnalysis) {
                this.editorForecastCol.classList.remove('lg:col-span-12');
                this.editorForecastCol.classList.add('lg:col-span-7', 'xl:col-span-8');
                this.mdAnalysisSidebar.classList.remove('hidden');
                this.mdAnalysisSidebar.classList.add('flex', 'lg:col-span-5', 'xl:col-span-4');
                this.renderMDSidebar();
            } else {
                this.editorForecastCol.classList.remove('lg:col-span-7', 'xl:col-span-8');
                this.editorForecastCol.classList.add('lg:col-span-12');
                this.mdAnalysisSidebar.classList.add('hidden');
                this.mdAnalysisSidebar.classList.remove('flex', 'lg:col-span-5', 'xl:col-span-4');
            }
        }

        jornada.matches.forEach((match, idx) => {
            const displayIdx = idx === 14 ? 'P15' : idx + 1;
            const row = document.createElement('div');
            row.className = 'pronostico-row doubles-row';
            row.setAttribute('data-idx', idx);

            const hitStatus = doublesHitStatus[idx];
            if (hitStatus === true) {
                row.classList.add('match-hit');
            } else if (hitStatus === false) {
                row.classList.add('match-miss');
            }

            const mResult = (match.result && String(match.result).trim() !== '' && String(match.result).trim() !== '-' && String(match.result).trim().toLowerCase() !== 'por definir') ? String(match.result).trim() : null;
            let hitBadgeHtml = '';
            if (mResult) {
                if (hitStatus === true) {
                    hitBadgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 shrink-0 ml-1.5" title="Resultado oficial: ${mResult}">✅ ${mResult}</span>`;
                } else if (hitStatus === false) {
                    hitBadgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1 shrink-0 ml-1.5" title="Resultado oficial: ${mResult}">❌ ${mResult}</span>`;
                } else {
                    hitBadgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 border border-slate-700 shrink-0 ml-1.5" title="Resultado oficial: ${mResult}">${mResult}</span>`;
                }
            }

            const homeLogo = AppUtils.getTeamLogo(match.home);
            const awayLogo = AppUtils.getTeamLogo(match.away);

            const isP15 = idx === 14;

            // Porcentajes del análisis de Mundo Deportivo para Dobles
            let percHtml = '';
            let mobileBtnHtml = '';
            let inlineAnalysisHtml = '';
            if (this.currentJornadaHasMDAnalysis) {
                const mdMatch = this.getMDMatchFor(match, idx);
                if (mdMatch && mdMatch.percentages) {
                    const mdRecInfo = this.getEffectiveMDRecommendation(mdMatch);
                    const p1 = mdRecInfo.p1;
                    const pX = mdRecInfo.pX;
                    const p2 = mdRecInfo.p2;
                    const isRec1 = mdRecInfo.isRec1;
                    const isRecX = mdRecInfo.isRecX;
                    const isRec2 = mdRecInfo.isRec2;
                    const recSign = mdRecInfo.recSign;

                    percHtml = `
                        <div id="doubles-consensus-${idx}" class="p-percentages" title="Probabilidad Mundo Deportivo: 1 (${p1}%), X (${pX}%), 2 (${p2}%)">
                            <div class="perc-row perc-1 ${isRec1 ? 'rec-sign' : ''}"><span>1:</span> <b>${p1}%</b></div>
                            <div class="perc-row perc-X ${isRecX ? 'rec-sign' : ''}"><span>X:</span> <b>${pX}%</b></div>
                            <div class="perc-row perc-2 ${isRec2 ? 'rec-sign' : ''}"><span>2:</span> <b>${p2}%</b></div>
                        </div>
                    `;
                    mobileBtnHtml = `
                        <button type="button" class="md-mobile-toggle-btn lg:hidden" onclick="event.stopPropagation(); window.app.toggleMDInlineAnalysis(${idx}, 'doubles');" title="Ver análisis de Mundo Deportivo">
                            <span>💡 Análisis</span>
                            <span class="md-arrow" id="md-arrow-doubles-${idx}">▼</span>
                        </button>
                    `;

                    // Desplegable de análisis táctico inline para móvil
                    let homeRankStr = mdMatch.homeRank ? `${mdMatch.homeRank}º clasificado` : '';
                    let awayRankStr = mdMatch.awayRank ? `${mdMatch.awayRank}º clasificado` : '';
                    if (!homeRankStr && this.mdAnalysisData && this.mdAnalysisData.standings) {
                        const allSt = [...(this.mdAnalysisData.standings.primera || []), ...(this.mdAnalysisData.standings.segunda || [])];
                        const hFound = allSt.find(t => this.areTeamsSimilar(match.home, t.team));
                        if (hFound) homeRankStr = `${hFound.pos}º (${hFound.pts} pts)`;
                        const aFound = allSt.find(t => this.areTeamsSimilar(match.away, t.team));
                        if (aFound) awayRankStr = `${aFound.pos}º (${aFound.pts} pts)`;
                    }

                    inlineAnalysisHtml = `
                        <div id="md-inline-doubles-${idx}" class="md-inline-card hidden lg:hidden w-full mt-2 p-3 rounded-xl bg-slate-950/90 border border-sky-500/30 text-xs space-y-2.5 shadow-inner">
                            <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px]">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-sky-400 font-black uppercase tracking-wider">🎯 Recomendado:</span>
                                    <span class="px-2 py-0.5 rounded-lg bg-sky-500 text-slate-950 font-black text-xs shadow">${recSign}</span>
                                </div>
                                <span class="text-slate-400 font-mono text-[10px]">⏰ ${mdMatch.schedule || 'Fin de semana'}</span>
                            </div>
                            ${(homeRankStr || awayRankStr) ? `
                                <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
                                    <span>${match.home}: <b class="text-sky-400">${homeRankStr || '-'}</b></span>
                                    <span>${match.away}: <b class="text-sky-400">${awayRankStr || '-'}</b></span>
                                </div>
                            ` : ''}
                            ${mdMatch.comment ? `
                                <div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed font-sans">
                                    ${mdMatch.comment}
                                </div>
                            ` : '<div class="text-[10px] text-slate-500 italic">Sin comentario editorial disponible.</div>'}
                            <div class="pt-0.5 flex items-center justify-end">
                                <button type="button" onclick="event.stopPropagation(); window.app.openMDMobileDetail(${idx});" class="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1">
                                    <span>📊 Ver Ficha Completa & Clasificación →</span>
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    percHtml = `<div id="doubles-consensus-${idx}" class="p-percentages hidden" style="display:none !important;"></div>`;
                }
            } else {
                percHtml = `<div id="doubles-consensus-${idx}" class="p-percentages hidden" style="display:none !important;"></div>`;
            }

            row.innerHTML = `
                <div class="p-match-info">
                    <div class="match-team home-team">
                        <span class="match-display-idx" style="font-weight:bold; color:var(--primary-green); font-size: 0.8rem; width: 22px;">${displayIdx}</span>
                        <div class="team-info-stacked">
                            <div class="team-line">
                                <img src="${homeLogo}" class="team-logo" style="width:16px; height:16px; object-fit:contain;" onerror="this.style.display='none'">
                                <span class="team-name" style="font-size:0.8rem;">${match.home}</span>
                            </div>
                            <div class="team-line">
                                <img src="${awayLogo}" class="team-logo" style="width:16px; height:16px; object-fit:contain;" onerror="this.style.display='none'">
                                <span class="team-name" style="font-size:0.8rem;">${match.away}</span>
                            </div>
                        </div>
                        ${hitBadgeHtml}
                        ${mobileBtnHtml}
                    </div>
                </div>

                <div class="p-row-actions">
                    <div class="prediction-inputs" data-idx="${idx}">
                        ${isP15 ? this.renderP15Inputs(idx, selections[idx], isLocked) : this.renderMultiSelectButtons(idx, selections[idx], isLocked, false, hitStatus, mResult)}
                    </div>
                    ${percHtml}
                </div>

                ${inlineAnalysisHtml}
            `;

            if (this.currentJornadaHasMDAnalysis) {
                row.addEventListener('mouseenter', () => this.hoverMDMatch(idx));
                row.addEventListener('click', (e) => {
                    if (!e.target.closest('.chk-option') && !e.target.closest('.p15-option') && !e.target.closest('.md-mobile-toggle-btn') && !e.target.closest('.md-inline-card')) {
                        this.hoverMDMatch(idx);
                    }
                });
            }

            this.doublesContainer.appendChild(row);

            // Add Block Dividers: 4, 4, 3, 3 + Pleno al 15
            // 4-5 (idx 3), 8-9 (idx 7), 11-12 (idx 10), 14-15 (idx 13)
            if ([3, 7, 10, 13].includes(idx)) {
                const divider = document.createElement('div');
                if (idx === 13) {
                    divider.className = "p-divider p-divider-p15";
                    divider.innerHTML = `<span class="boleto-block-label">PLENO AL 15</span>`;
                } else {
                    divider.className = "p-divider p-divider-block";
                }
                this.doublesContainer.appendChild(divider);
            }
        });

        this.updateDoublesCounters();
    }

    renderMultiSelectButtons(idx, currentVal, disabled, isP15, hitStatus, mResult) {
        // currentVal is string "1", "1X", "1X2", etc.
        const options = ['1', 'X', '2'];
        let html = '';
        const normResult = mResult && window.ScoringSystem ? window.ScoringSystem.normalizeSign(mResult) : (mResult ? String(mResult).trim().toUpperCase() : null);

        options.forEach(opt => {
            const isSelected = currentVal && currentVal.includes(opt);
            // Si el partido tiene resultado oficial
            let hitOptClass = '';
            if (isSelected && normResult) {
                if (opt === normResult) {
                    hitOptClass = 'opt-hit';
                } else if (hitStatus === false) {
                    hitOptClass = 'opt-miss';
                }
            }

            // Use same styles as chk-option but slightly smaller for side panel
            const activeStyle = isSelected ? 'background-color:var(--primary-green); color:white; border-color:var(--primary-green);' : '';

            html += `<div class="chk-option ${isSelected ? 'selected' : ''} ${hitOptClass}"
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
            let html = `<div class="p15-options-group">`;
            options.forEach(opt => {
                const isSel = opt === selected;
                html += `<div class="p15-option ${isSel ? 'selected' : ''}"
            data-team="${team}" data-val="${opt}"
            onclick="window.app.handleP15Toggle(this, ${idx}, '${team}', '${opt}')" 
                        ${disabled ? 'disabled' : ''}>${opt}</div>`;
            });
            html += `</div>`;
            return html;
        };

        return `<div class="p15-grid">
                ${renderGroup('home', hVal)}
                    ${renderGroup('away', aVal)}
                </div>`;
    }

    handleP15Toggle(btn, idx, team, val) {
        const jornada = this.jornadas ? this.jornadas.find(j => String(j.id) === String(this.currentJornadaId)) : null;
        if (jornada) {
            const { isLockedRef } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) return;
        }
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
        const jornada = this.jornadas ? this.jornadas.find(j => String(j.id) === String(this.currentJornadaId)) : null;
        if (jornada) {
            const { isLockedRef } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) return;
        }
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

        // Rules: Exactly 7 Doubles OR Exactly 4 Doubles (no triples)
        const isValid = (doubles === 7 && triples === 0) || (doubles === 4 && triples === 0);

        this.doublesCounter.textContent = `${doubles} Dobles, ${triples} Triples`;

        if (!isValid) {
            this.doublesCounter.style.color = '#ff5252'; // Red
            this.doublesCounter.style.backgroundColor = '#ffebee';
            this.doublesCounter.style.border = "1px solid red";
            this.doublesCounter.innerHTML += '<br><span style="font-size:0.7rem;">(Error: Deben ser EXACTAMENTE 7 Dobles o 4 Dobles)</span>';
        } else {
            this.doublesCounter.style.color = '#ffeb3b'; // Yellow
            this.doublesCounter.style.backgroundColor = 'rgba(0,0,0,0.2)';
            this.doublesCounter.style.border = "none";
        }
        return isValid;
    }

    async saveDoubles() {
        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        if (jornada) {
            const { isLockedRef, hasStarted } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) {
                if (hasStarted) {
                    alert("No se puede guardar la quiniela de dobles: la jornada ya cuenta con resultados registrados.");
                } else {
                    alert("Esta jornada está bloqueada y no admite cambios en la quiniela de dobles sin activar el Modo Corrección.");
                }
                return;
            }
        }

        if (!this.updateDoublesCounters()) {
            alert('La combinación no es válida. \n\nPara poder guardar, debes seleccionar EXACTAMENTE:\n- 7 Dobles (y 0 Triples)\nO bien\n- 4 Dobles (y 0 Triples)');
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

        const doubles = selection.filter((s, i) => i < 14 && s.length === 2).length;
        const isReduced = (doubles === 7);

        const data = {
            id: `${this.currentJornadaId}_${this.currentMemberId}`,
            jId: this.currentJornadaId,
            mId: this.currentMemberId,
            selection: selection,
            isReduced: isReduced,
            date: new Date().toISOString()
        };

        try {
            this.btnSaveDoubles.disabled = true;
            this.btnSaveDoubles.textContent = 'Guardando...';

            await window.DataService.save('pronosticos_extra', data);

            // Update in-memory state
            const existingIdx = this.pronosticosExtra.findIndex(p => p.id === data.id);
            if (existingIdx >= 0) this.pronosticosExtra[existingIdx] = data;
            else this.pronosticosExtra.push(data);

            this.doublesStatus.textContent = '✅ Quiniela de dobles guardada correctamente.';
            this.doublesStatus.className = 'success-message';
            this.btnSaveDoubles.textContent = '✅ ¡Guardado con Éxito!';
            this.btnSaveDoubles.style.backgroundColor = '#4caf50';

            // Refresh summary table to show the new/updated doubles row
            if (window.clearEligibleDoublesCache) window.clearEligibleDoublesCache();
            if (this._prevJornadaEvalCache) this._prevJornadaEvalCache.clear();
            this.renderSummaryTable();

            // Verificación y auto-envío desatendido del boleto oficial a la administración
            if (window.SelladoService) {
                window.SelladoService.verificarYAutoEnviar(this.currentJornadaId);
            }

            setTimeout(() => {
                this.btnSaveDoubles.style.backgroundColor = '';
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
        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        if (jornada) {
            const { isLockedRef, hasStarted } = this.isJornadaLocked(jornada);
            if (isLockedRef && !this.correctionMode) {
                if (hasStarted) {
                    alert("No se puede copiar el pronóstico: la jornada ya cuenta con resultados registrados.");
                } else {
                    alert("Esta jornada está bloqueada y no admite cambios sin activar el Modo Corrección.");
                }
                return;
            }
        }

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

    // =========================================================================
    // MUNDO DEPORTIVO ANALYSIS, RECOMMENDATIONS & STANDINGS INTEGRATION
    // =========================================================================

    async loadMDAnalysisData() {
        try {
            const cached = sessionStorage.getItem('maulas_md_analysis');
            if (cached) {
                try {
                    this.mdAnalysisData = JSON.parse(cached);
                    return;
                } catch(e) {}
            }
            const res = await fetch(`datos_auxiliares/analisis_mundodeportivo.json?v=20261017_v1`);
            if (res.ok) {
                this.mdAnalysisData = await res.json();
                try {
                    sessionStorage.setItem('maulas_md_analysis', JSON.stringify(this.mdAnalysisData));
                } catch(e) {}
            }
        } catch (e) {
            console.warn('No se pudo cargar el análisis de Mundo Deportivo:', e);
            this.mdAnalysisData = null;
        }
    }

    areTeamsSimilar(name1, name2) {
        if (!name1 || !name2) return false;
        const clean = s => s.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\(f\)/gi, '') // Ignorar marca femenino (f) en la comparación
            .replace(/[^a-z0-9]/g, '');
        const c1 = clean(name1);
        const c2 = clean(name2);
        if (!c1 || !c2) return false;
        if (c1 === c2) return true;
        if (c1.includes(c2) || c2.includes(c1)) return true;

        const aliases = [
            ['atletico', 'atmadrid', 'atm'],
            ['realmadrid', 'rmadrid', 'madrid'],
            ['barcelona', 'barca', 'fcb'],
            ['athletic', 'athclub', 'athbilbao', 'bilbao'],
            ['realsociedad', 'rsociedad', 'laerealsociedad'],
            ['rayovallecano', 'rayo'],
            ['celta', 'celtadevigo'],
            ['espanyol', 'rcdespanyol'],
            ['valladolid', 'realvalladolid'],
            ['zaragoza', 'realzaragoza'],
            ['racing', 'racingsantander'],
            ['sporting', 'sportinggijon'],
            ['deportivo', 'depor', 'deportivolacoruna'],
            ['castellon', 'cdcastellon'],
            ['albacete', 'albacitebp'],
            ['cadiz', 'cadizcf'],
            ['cordoba', 'cordobacf'],
            ['granada', 'granadacf'],
            ['almeria', 'udalmeria'],
            ['huesca', 'sdhuesca'],
            ['burgos', 'burgoscf'],
            ['eibar', 'sdeibar'],
            ['mirandes', 'cdmirandes'],
            ['ferrol', 'racingferrol'],
            ['levante', 'udlevante'],
            ['elche', 'elchecf'],
            ['malaga', 'malagacf'],
            ['eldense', 'cdeldense'],
            ['cartagena', 'fccartagena'],
            ['tenerife', 'cdtenerife']
        ];
        for (const group of aliases) {
            const m1 = group.some(alias => c1.includes(alias));
            const m2 = group.some(alias => c2.includes(alias));
            if (m1 && m2) return true;
        }
        return false;
    }

    checkIfJornadaHasMDAnalysis(jornada) {
        if (!this.mdAnalysisData || !jornada || !Array.isArray(jornada.matches)) return false;

        // Validación estricta con datos reales:
        // Si no está disponible, o los análisis corresponden a una jornada entre semana (Champions/Copa): no mostrar nada
        if (this.mdAnalysisData.available !== true || this.mdAnalysisData.isMidweek === true) {
            return false;
        }

        if (!Array.isArray(this.mdAnalysisData.matches) || this.mdAnalysisData.matches.length === 0) {
            return false;
        }

        let matchCount = 0;
        const mdMatches = this.mdAnalysisData.matches.filter(m => m.home && m.away);
        jornada.matches.forEach(jm => {
            if (!jm.home || !jm.away) return;
            const found = mdMatches.some(mdM => 
                (this.areTeamsSimilar(jm.home, mdM.home) && this.areTeamsSimilar(jm.away, mdM.away)) ||
                (this.areTeamsSimilar(jm.home, mdM.away) && this.areTeamsSimilar(jm.away, mdM.home))
            );
            if (found) matchCount++;
        });

        // Deben coincidir al menos 8 partidos con la jornada oficial de la peña
        return matchCount >= 8;
    }

    getMDMatchFor(match, idx) {
        if (!this.currentJornadaHasMDAnalysis || !this.mdAnalysisData || !Array.isArray(this.mdAnalysisData.matches)) return null;

        if (match && match.home && match.away) {
            // 1. Prioridad: si el partido de MD con el mismo número de orden (idx + 1) coincide con ambos equipos
            if (typeof idx === 'number') {
                const targetNum = idx + 1;
                const mdByNum = this.mdAnalysisData.matches.find(m => m.num === targetNum);
                if (mdByNum && (
                    (this.areTeamsSimilar(match.home, mdByNum.home) && this.areTeamsSimilar(match.away, mdByNum.away)) ||
                    (this.areTeamsSimilar(match.home, mdByNum.away) && this.areTeamsSimilar(match.away, mdByNum.home))
                )) {
                    return mdByNum;
                }
            }

            // 2. Búsqueda por equipos similares en cualquier posición
            const found = this.mdAnalysisData.matches.find(mdM =>
                (this.areTeamsSimilar(match.home, mdM.home) && this.areTeamsSimilar(match.away, mdM.away)) ||
                (this.areTeamsSimilar(match.home, mdM.away) && this.areTeamsSimilar(match.away, mdM.home))
            );
            if (found) return found;
        }

        return null;
    }

    getEffectiveMDRecommendation(mdMatch) {
        if (!mdMatch) return { recSign: '-', isRec1: false, isRecX: false, isRec2: false, p1: 0, pX: 0, p2: 0 };

        const pData = (mdMatch.percentages && (mdMatch.percentages.real || mdMatch.percentages.quinielista)) || {};
        const p1 = (pData['1'] !== undefined && pData['1'] !== null) ? Number(pData['1']) : 0;
        const pX = (pData['X'] !== undefined && pData['X'] !== null) ? Number(pData['X']) : 0;
        const p2 = (pData['2'] !== undefined && pData['2'] !== null) ? Number(pData['2']) : 0;
        const maxP = Math.max(p1, pX, p2);

        let rec = String(mdMatch.recommended || '').toUpperCase().trim();
        // Si no viene recomendación oficial de MD o viene vacía, inferir por mayor probabilidad
        if (!rec || rec === '-' || rec === 'NULL') {
            if (maxP > 0) {
                if (p1 === maxP) rec = '1';
                else if (p2 === maxP) rec = '2';
                else if (pX === maxP) rec = 'X';
            }
        }

        // Un signo recibe estrella (rec-sign) si:
        // 1. Está incluido en el signo recomendado por MD (o inferido)
        // 2. O tiene un porcentaje muy alto (>= 50%)
        // 3. O es el favorito destacado del partido (>= 40% y mayor que los demás)
        const isRec1 = rec.includes('1') || (p1 >= 50) || (maxP >= 40 && p1 === maxP);
        const isRecX = rec.includes('X') || (pX >= 50) || (maxP >= 40 && pX === maxP);
        const isRec2 = rec.includes('2') || (p2 >= 50) || (maxP >= 40 && p2 === maxP);

        return {
            recSign: rec || '-',
            isRec1,
            isRecX,
            isRec2,
            p1,
            pX,
            p2
        };
    }

    switchMDView(view) {
        this.currentMDView = view;
        const btnAnalysis = document.getElementById('md-tab-analysis');
        const btnStandings1 = document.getElementById('md-tab-standings-1');
        const btnStandings2 = document.getElementById('md-tab-standings-2');

        const boxAnalysis = document.getElementById('md-view-analysis-box');
        const boxStandings1 = document.getElementById('md-view-standings-1');
        const boxStandings2 = document.getElementById('md-view-standings-2');

        [btnAnalysis, btnStandings1, btnStandings2].forEach(btn => {
            if (!btn) return;
            btn.className = "px-2 py-1 rounded-lg text-slate-400 hover:text-white transition font-bold";
        });

        if (boxAnalysis) boxAnalysis.classList.add('hidden');
        if (boxStandings1) boxStandings1.classList.add('hidden');
        if (boxStandings2) boxStandings2.classList.add('hidden');

        if (view === 'analysis') {
            if (btnAnalysis) btnAnalysis.className = "px-2 py-1 rounded-lg bg-sky-500 text-slate-950 font-black shadow transition";
            if (boxAnalysis) {
                boxAnalysis.classList.remove('hidden');
                this.renderMDMatchDetail(this.selectedMDMatchIdx);
            }
        } else if (view === 'standings-1') {
            if (btnStandings1) btnStandings1.className = "px-2 py-1 rounded-lg bg-sky-500 text-slate-950 font-black shadow transition";
            if (boxStandings1) {
                boxStandings1.classList.remove('hidden');
                this.renderMDStandings('primera', boxStandings1);
            }
        } else if (view === 'standings-2') {
            if (btnStandings2) btnStandings2.className = "px-2 py-1 rounded-lg bg-sky-500 text-slate-950 font-black shadow transition";
            if (boxStandings2) {
                boxStandings2.classList.remove('hidden');
                this.renderMDStandings('segunda', boxStandings2);
            }
        }
    }

    hoverMDMatch(idx) {
        this.selectedMDMatchIdx = idx;

        const baseRows = this.container ? Array.from(this.container.querySelectorAll('.pronostico-row')) : [];
        const doublesRows = this.doublesContainer ? Array.from(this.doublesContainer.querySelectorAll('.doubles-row')) : [];
        const allRows = [...baseRows, ...doublesRows];
        allRows.forEach((r) => {
            const rIdx = parseInt(r.dataset.idx !== undefined ? r.dataset.idx : (r.getAttribute('data-idx') || -1));
            if (rIdx === idx) {
                r.classList.add('border-sky-500/80', 'bg-sky-950/20');
            } else {
                r.classList.remove('border-sky-500/80', 'bg-sky-950/20');
            }
        });

        if (this.currentMDView === 'analysis') {
            this.renderMDMatchDetail(idx);
        }
    }

    renderMDSidebar() {
        if (!this.mdAnalysisSidebar) return;
        this.switchMDView(this.currentMDView || 'analysis');
    }

    renderMDMatchDetail(idx) {
        const box = document.getElementById('md-view-analysis-box');
        if (!box) return;

        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        const match = (jornada && jornada.matches) ? jornada.matches[idx] : null;
        const mdMatch = this.getMDMatchFor(match, idx);

        if (!mdMatch) {
            box.innerHTML = `
                <div class="p-6 text-center text-slate-400 text-xs">
                    <p>No hay análisis disponible para este partido.</p>
                </div>
            `;
            return;
        }

        const matchNum = idx === 14 ? '15 (Pleno al 15)' : idx + 1;
        const homeName = (match && match.home) || mdMatch.home || 'Local';
        const awayName = (match && match.away) || mdMatch.away || 'Visitante';
        const homeLogo = AppUtils.getTeamLogo(homeName);
        const awayLogo = AppUtils.getTeamLogo(awayName);

        const mdRecInfo = this.getEffectiveMDRecommendation(mdMatch);
        const recSign = mdRecInfo.recSign;
        const pReal = (mdMatch.percentages && mdMatch.percentages.real) || {};
        const pQuin = (mdMatch.percentages && mdMatch.percentages.quinielista) || {};

        let homeRankStr = mdMatch.homeRank ? `${mdMatch.homeRank}º clasificado` : '';
        let awayRankStr = mdMatch.awayRank ? `${mdMatch.awayRank}º clasificado` : '';

        if (!homeRankStr && this.mdAnalysisData && this.mdAnalysisData.standings) {
            const allSt = [...(this.mdAnalysisData.standings.primera || []), ...(this.mdAnalysisData.standings.segunda || [])];
            const hFound = allSt.find(t => this.areTeamsSimilar(homeName, t.team));
            if (hFound) homeRankStr = `${hFound.pos}º (${hFound.pts} pts)`;
            const aFound = allSt.find(t => this.areTeamsSimilar(awayName, t.team));
            if (aFound) awayRankStr = `${aFound.pos}º (${aFound.pts} pts)`;
        }

        // Barra de chips selectores rápidos 1 al 15
        let chipsHtml = '';
        for (let i = 0; i < 15; i++) {
            const isSel = i === idx;
            const chipLabel = i === 14 ? '15' : (i + 1);
            chipsHtml += `
                <button type="button" onclick="window.app.hoverMDMatch(${i})" class="w-6 h-6 rounded-md text-[10px] font-black transition shrink-0 ${isSel ? 'bg-sky-500 text-slate-950 shadow-md ring-1 ring-sky-300' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}">
                    ${chipLabel}
                </button>
            `;
        }

        box.innerHTML = `
            <!-- Barra selectora rápida de partidos -->
            <div class="flex items-center gap-1 overflow-x-auto pb-1.5 custom-scroll">
                ${chipsHtml}
            </div>

            <!-- Ficha del Partido -->
            <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner space-y-3">
                <div class="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-slate-800/80">
                    <span class="font-black text-sky-400">PARTIDO ${matchNum}</span>
                    <span class="text-slate-400 font-mono text-[10px]">⏰ ${mdMatch.schedule || 'Fin de semana'}</span>
                </div>

                <!-- Equipos y Escudos -->
                <div class="grid grid-cols-2 gap-2 items-center text-center">
                    <div class="flex flex-col items-center p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                        <img src="${homeLogo}" class="w-8 h-8 object-contain mb-1" onerror="this.style.display='none'">
                        <span class="font-black text-white text-xs leading-tight">${homeName}</span>
                        ${homeRankStr ? `<span class="text-[10px] text-sky-400 font-mono mt-0.5">${homeRankStr}</span>` : ''}
                    </div>
                    <div class="flex flex-col items-center p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                        <img src="${awayLogo}" class="w-8 h-8 object-contain mb-1" onerror="this.style.display='none'">
                        <span class="font-black text-white text-xs leading-tight">${awayName}</span>
                        ${awayRankStr ? `<span class="text-[10px] text-sky-400 font-mono mt-0.5">${awayRankStr}</span>` : ''}
                    </div>
                </div>

                <!-- Tarjeta de Sugerencia Oficial y Probabilidad Real -->
                <div class="p-2.5 rounded-xl bg-gradient-to-r from-sky-950/50 to-indigo-950/40 border border-sky-500/30 flex items-center justify-between gap-2">
                    <div>
                        <div class="text-[9px] font-black uppercase text-sky-400 tracking-wider">🎯 Sugerencia Mundo Deportivo</div>
                        <div class="text-xs text-slate-300">Signo recomendado: <strong class="text-white">${recSign}</strong></div>
                    </div>
                    <div class="px-3 py-1 rounded-xl bg-sky-500 text-slate-950 font-black text-sm tracking-wider shadow-md">
                        ${recSign}
                    </div>
                </div>

                <!-- Desglose de Probabilidades -->
                <div class="space-y-1.5">
                    <div class="flex justify-between text-[10px] text-slate-400 font-bold">
                        <span>Probabilidad Estimada</span>
                        <span class="text-slate-500">1 / X / 2</span>
                    </div>
                    <div class="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
                        <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div class="text-[10px] font-bold text-emerald-400">1 (Victoria)</div>
                            <div class="font-black text-emerald-300 text-sm mt-0.5">${pReal['1'] ?? '-'}%</div>
                            ${pQuin['1'] !== undefined ? `<div class="text-[9px] text-slate-500">Quin: ${pQuin['1']}%</div>` : ''}
                        </div>
                        <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div class="text-[10px] font-bold text-sky-400">X (Empate)</div>
                            <div class="font-black text-sky-300 text-sm mt-0.5">${pReal['X'] ?? '-'}%</div>
                            ${pQuin['X'] !== undefined ? `<div class="text-[9px] text-slate-500">Quin: ${pQuin['X']}%</div>` : ''}
                        </div>
                        <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div class="text-[10px] font-bold text-amber-400">2 (Visitante)</div>
                            <div class="font-black text-amber-300 text-sm mt-0.5">${pReal['2'] ?? '-'}%</div>
                            ${pQuin['2'] !== undefined ? `<div class="text-[9px] text-slate-500">Quin: ${pQuin['2']}%</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Comentario Editorial -->
                ${mdMatch.comment ? `
                    <div class="space-y-1 pt-1">
                        <div class="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                            <span>📝</span> <span>Análisis del Partido</span>
                        </div>
                        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed font-sans max-h-[160px] lg:max-h-none overflow-y-auto lg:overflow-visible custom-scroll">
                            ${mdMatch.comment}
                        </div>
                    </div>
                ` : ''}

                <!-- Accesos rápidos a Clasificación -->
                <div class="pt-1 flex items-center gap-2">
                    <button type="button" onclick="window.app.switchMDView('standings-1')" class="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-800 flex items-center justify-center gap-1 transition">
                        <span>🏆</span> Ver 1ª División
                    </button>
                    <button type="button" onclick="window.app.switchMDView('standings-2')" class="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-800 flex items-center justify-center gap-1 transition">
                        <span>🥈</span> Ver 2ª División
                    </button>
                </div>
            </div>
        `;
    }

    renderMDStandings(divType, containerEl) {
        if (!containerEl || !this.mdAnalysisData || !this.mdAnalysisData.standings) {
            if (containerEl) {
                containerEl.innerHTML = `
                    <div class="p-6 text-center text-slate-400 text-xs">
                        <p>No se encontraron datos de clasificación disponibles.</p>
                    </div>
                `;
            }
            return;
        }

        const list = divType === 'primera' ? this.mdAnalysisData.standings.primera : this.mdAnalysisData.standings.segunda;
        if (!list || list.length === 0) {
            containerEl.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">Sin datos para esta división.</div>`;
            return;
        }

        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        const activeTeams = [];
        if (jornada && Array.isArray(jornada.matches)) {
            jornada.matches.forEach(m => {
                if (m.home) activeTeams.push(m.home);
                if (m.away) activeTeams.push(m.away);
            });
        }

        const rowsHtml = list.map(item => {
            const isPlayingThisJornada = activeTeams.some(t => this.areTeamsSimilar(t, item.team));
            let zoneClass = 'border-l-2 border-transparent';
            if (divType === 'primera') {
                if (item.pos <= 4) zoneClass = 'border-l-2 border-sky-400 bg-sky-950/20'; // Champions
                else if (item.pos <= 6) zoneClass = 'border-l-2 border-amber-400 bg-amber-950/20'; // Europa League
                else if (item.pos >= 18) zoneClass = 'border-l-2 border-rose-500 bg-rose-950/20'; // Descenso
            } else {
                if (item.pos <= 2) zoneClass = 'border-l-2 border-emerald-400 bg-emerald-950/20'; // Ascenso directo
                else if (item.pos <= 6) zoneClass = 'border-l-2 border-sky-400 bg-sky-950/20'; // Playoff
                else if (item.pos >= 19) zoneClass = 'border-l-2 border-rose-500 bg-rose-950/20'; // Descenso
            }

            return `
                <tr class="border-b border-slate-800/60 hover:bg-slate-800/50 transition ${zoneClass} ${isPlayingThisJornada ? 'font-bold text-white' : 'text-slate-300'}">
                    <td class="py-1 px-1.5 text-center text-[10px] font-mono font-bold">${item.pos}</td>
                    <td class="py-1 px-2 text-[11px] flex items-center gap-1.5">
                        <img src="${item.logo}" class="w-4 h-4 object-contain" onerror="this.style.display='none'">
                        <span class="truncate max-w-[110px]">${item.team}</span>
                        ${isPlayingThisJornada ? '<span class="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold" title="Juega en esta quiniela">⚽</span>' : ''}
                    </td>
                    <td class="py-1 px-1.5 text-center font-black text-amber-400 text-xs">${item.pts}</td>
                    <td class="py-1 px-1 text-center text-[10px] text-slate-400">${item.pj}</td>
                    <td class="py-1 px-1 text-center text-[10px] text-slate-400">${item.pg}</td>
                    <td class="py-1 px-1 text-center text-[10px] text-slate-400">${item.pe}</td>
                    <td class="py-1 px-1 text-center text-[10px] text-slate-400">${item.pp}</td>
                    <td class="py-1 px-1 text-center text-[10px] text-slate-400 font-mono">${item.dif > 0 ? '+' + item.dif : item.dif}</td>
                </tr>
            `;
        }).join('');

        const titleText = divType === 'primera' ? 'Clasificación LaLiga EA Sports (1ª)' : 'Clasificación LaLiga Hypermotion (2ª)';

        containerEl.innerHTML = `
            <div class="space-y-2">
                <div class="flex items-center justify-between pb-1 text-xs font-black text-white">
                    <span>${titleText}</span>
                    <button type="button" onclick="window.app.switchMDView('analysis')" class="text-[10px] text-sky-400 hover:underline">
                        ← Volver a análisis
                    </button>
                </div>
                <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 shadow-inner">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-900 border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-400 font-black">
                                <th class="py-1.5 px-1.5 text-center">#</th>
                                <th class="py-1.5 px-2">Equipo</th>
                                <th class="py-1.5 px-1.5 text-center text-amber-400">Pts</th>
                                <th class="py-1.5 px-1 text-center">PJ</th>
                                <th class="py-1.5 px-1 text-center">PG</th>
                                <th class="py-1.5 px-1 text-center">PE</th>
                                <th class="py-1.5 px-1 text-center">PP</th>
                                <th class="py-1.5 px-1 text-center">Dif</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    openMDMobileDetail(idx) {
        const sheet = document.getElementById('modal-md-mobile-sheet');
        const content = document.getElementById('md-mobile-sheet-content');
        if (!sheet || !content) return;

        this.selectedMDMatchIdx = idx;
        const jornada = this.jornadas.find(j => j.id == this.currentJornadaId);
        const match = (jornada && jornada.matches) ? jornada.matches[idx] : null;
        const mdMatch = this.getMDMatchFor(match, idx);

        if (!mdMatch) {
            content.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">No hay análisis disponible para este partido.</div>`;
            sheet.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            return;
        }

        const matchNum = idx === 14 ? '15 (Pleno al 15)' : idx + 1;
        const homeName = (match && match.home) || mdMatch.home || 'Local';
        const awayName = (match && match.away) || mdMatch.away || 'Visitante';
        const homeLogo = AppUtils.getTeamLogo(homeName);
        const awayLogo = AppUtils.getTeamLogo(awayName);

        const mdRecInfo = this.getEffectiveMDRecommendation(mdMatch);
        const recSign = mdRecInfo.recSign;
        const pReal = (mdMatch.percentages && mdMatch.percentages.real) || {};
        const pQuin = (mdMatch.percentages && mdMatch.percentages.quinielista) || {};

        let homeRankStr = mdMatch.homeRank ? `${mdMatch.homeRank}º clasificado` : '';
        let awayRankStr = mdMatch.awayRank ? `${mdMatch.awayRank}º clasificado` : '';

        if (!homeRankStr && this.mdAnalysisData && this.mdAnalysisData.standings) {
            const allSt = [...(this.mdAnalysisData.standings.primera || []), ...(this.mdAnalysisData.standings.segunda || [])];
            const hFound = allSt.find(t => this.areTeamsSimilar(homeName, t.team));
            if (hFound) homeRankStr = `${hFound.pos}º (${hFound.pts} pts)`;
            const aFound = allSt.find(t => this.areTeamsSimilar(awayName, t.team));
            if (aFound) awayRankStr = `${aFound.pos}º (${aFound.pts} pts)`;
        }

        content.innerHTML = `
            <div class="space-y-3 p-1">
                <div class="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                    <span class="font-black text-sky-400">PARTIDO ${matchNum}</span>
                    <span class="text-slate-400 font-mono text-[11px]">⏰ ${mdMatch.schedule || 'Fin de semana'}</span>
                </div>

                <!-- Equipos -->
                <div class="grid grid-cols-2 gap-2 text-center">
                    <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center">
                        <img src="${homeLogo}" class="w-10 h-10 object-contain mb-1" onerror="this.style.display='none'">
                        <span class="font-black text-white text-xs">${homeName}</span>
                        ${homeRankStr ? `<span class="text-[10px] text-sky-400 font-mono mt-0.5">${homeRankStr}</span>` : ''}
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center">
                        <img src="${awayLogo}" class="w-10 h-10 object-contain mb-1" onerror="this.style.display='none'">
                        <span class="font-black text-white text-xs">${awayName}</span>
                        ${awayRankStr ? `<span class="text-[10px] text-sky-400 font-mono mt-0.5">${awayRankStr}</span>` : ''}
                    </div>
                </div>

                <!-- Sugerencia -->
                <div class="p-3 rounded-xl bg-gradient-to-r from-sky-950/60 to-indigo-950/50 border border-sky-500/40 flex items-center justify-between">
                    <div>
                        <div class="text-[10px] font-black uppercase text-sky-400">🎯 Sugerencia Mundo Deportivo</div>
                        <div class="text-xs text-slate-300">Signo recomendado: <strong class="text-white">${recSign}</strong></div>
                    </div>
                    <div class="px-3.5 py-1.5 rounded-xl bg-sky-500 text-slate-950 font-black text-base shadow-md">
                        ${recSign}
                    </div>
                </div>

                <!-- Probabilidades -->
                <div class="space-y-1">
                    <div class="text-[11px] font-bold text-slate-400">Probabilidad Estimada</div>
                    <div class="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
                        <div class="p-2 rounded-xl bg-slate-950 border border-slate-800">
                            <div class="text-[10px] font-bold text-emerald-400">1</div>
                            <div class="font-black text-emerald-300 text-sm mt-0.5">${pReal['1'] ?? '-'}%</div>
                            ${pQuin['1'] !== undefined ? `<div class="text-[9px] text-slate-500">Quin: ${pQuin['1']}%</div>` : ''}
                        </div>
                        <div class="p-2 rounded-xl bg-slate-950 border border-slate-800">
                            <div class="text-[10px] font-bold text-sky-400">X</div>
                            <div class="font-black text-sky-300 text-sm mt-0.5">${pReal['X'] ?? '-'}%</div>
                            ${pQuin['X'] !== undefined ? `<div class="text-[9px] text-slate-500">Quin: ${pQuin['X']}%</div>` : ''}
                        </div>
                        <div class="p-2 rounded-xl bg-slate-950 border border-slate-800">
                            <div class="text-[10px] font-bold text-amber-400">2</div>
                            <div class="font-black text-amber-300 text-sm mt-0.5">${pReal['2'] ?? '-'}%</div>
                            ${pQuin['2'] !== undefined ? `<div class="text-[9px] text-slate-500">Quin: ${pQuin['2']}%</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Análisis Texto -->
                ${mdMatch.comment ? `
                    <div class="space-y-1">
                        <div class="text-[11px] font-black text-slate-400 flex items-center gap-1">
                            <span>📝</span> <span>Análisis Editorial</span>
                        </div>
                        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-[160px] overflow-y-auto custom-scroll">
                            ${mdMatch.comment}
                        </div>
                    </div>
                ` : ''}

                <!-- Accesos rápidos a Clasificación -->
                <div class="pt-2 flex items-center gap-2">
                    <button type="button" onclick="window.app.showMobileStandings('primera')" class="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700 flex items-center justify-center gap-1 transition">
                        <span>🏆</span> Ver 1ª División
                    </button>
                    <button type="button" onclick="window.app.showMobileStandings('segunda')" class="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700 flex items-center justify-center gap-1 transition">
                        <span>🥈</span> Ver 2ª División
                    </button>
                </div>
            </div>
        `;

        sheet.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    toggleMDInlineAnalysis(idx, context = 'base') {
        const cardId = context === 'doubles' ? `md-inline-doubles-${idx}` : `md-inline-${idx}`;
        const arrowId = context === 'doubles' ? `md-arrow-doubles-${idx}` : `md-arrow-${idx}`;
        let card = document.getElementById(cardId);
        let arrow = document.getElementById(arrowId);
        if (!card) {
            card = document.getElementById(`md-inline-doubles-${idx}`) || document.getElementById(`md-inline-${idx}`);
            arrow = document.getElementById(`md-arrow-doubles-${idx}`) || document.getElementById(`md-arrow-${idx}`);
        }
        if (!card) return;

        const isHidden = card.classList.contains('hidden');
        if (isHidden) {
            card.classList.remove('hidden');
            if (arrow) arrow.textContent = '▲';
        } else {
            card.classList.add('hidden');
            if (arrow) arrow.textContent = '▼';
        }
    }

    toggleAllMDInlineAnalysis() {
        const viewDoubles = document.getElementById('editor-view-doubles');
        const isDoublesActive = viewDoubles && !viewDoubles.classList.contains('hidden');

        const activeContainer = isDoublesActive ? this.doublesContainer : this.container;
        const targetCards = activeContainer ? Array.from(activeContainer.querySelectorAll('.md-inline-card')) : [];
        if (!targetCards.length) return;

        const hasHidden = targetCards.some(c => c.classList.contains('hidden'));
        const label = document.getElementById(isDoublesActive ? 'label-toggle-all-md-doubles' : 'label-toggle-all-md');
        const arrow = document.getElementById(isDoublesActive ? 'arrow-toggle-all-md-doubles' : 'arrow-toggle-all-md');

        targetCards.forEach(card => {
            const cardRow = card.closest('.pronostico-row');
            const cardArrow = cardRow ? cardRow.querySelector('.md-arrow') : null;
            if (hasHidden) {
                card.classList.remove('hidden');
                if (cardArrow) cardArrow.textContent = '▲';
            } else {
                card.classList.add('hidden');
                if (cardArrow) cardArrow.textContent = '▼';
            }
        });

        if (label) label.textContent = hasHidden ? 'Ocultar todos' : 'Ver todos';
        if (arrow) arrow.textContent = hasHidden ? '▲' : '▼';
    }

    showMobileStandings(divType) {
        const content = document.getElementById('md-mobile-sheet-content');
        if (!content) return;
        this.renderMDStandings(divType, content);
        const backBtn = content.querySelector('button[onclick*="switchMDView"]');
        if (backBtn) {
            backBtn.onclick = () => this.openMDMobileDetail(this.selectedMDMatchIdx !== undefined ? this.selectedMDMatchIdx : 0);
        }
    }

    closeMDMobileSheet() {
        const sheet = document.getElementById('modal-md-mobile-sheet');
        if (sheet) sheet.style.display = 'none';
        document.body.style.overflow = '';
    }
}

window.PronosticoManager = PronosticoManager;

document.addEventListener('DOMContentLoaded', () => {
    window.app = new PronosticoManager();
});
