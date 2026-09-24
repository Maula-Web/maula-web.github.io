class JornadaManager {
    constructor() {
        this.jornadas = [];
        this.init();
    }

    async init() {
        this.cacheDOM();
        this.bindEvents();
        this.startClock();

        if (window.DataService) {
            await window.DataService.init();
            const data = await window.DataService.loadSeasonData();
            this.jornadas = data.jornadas;
            if (window.DiceService) {
                try {
                    await window.DiceService.checkAndApplyDice(data.members, this.jornadas, data.pronosticos);
                } catch (errDice) {
                    console.error("Error aplicando dado en jornadas:", errDice);
                }
            }
        }

        this.renderGrid();
        this.checkForUpdates();
        this.populateTeamsCache();
    }

    async loadData() {
        if (!this.jornadas || this.jornadas.length === 0) {
            const data = await window.DataService.loadSeasonData();
            this.jornadas = data.jornadas;
        }
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const str = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            // Capitalize first letter
            const finalStr = str.charAt(0).toUpperCase() + str.slice(1);
            if (document.getElementById('current-datetime')) {
                const el = document.getElementById('current-datetime');
                el.textContent = finalStr;
                el.className = 'header-time-text'; // Apply configurable class
            }
        };
        updateTime();
        setInterval(updateTime, 60000);
    }

    checkForUpdates() {
        setTimeout(() => {
            console.log("Datos cargados desde fichero externo (2026-2027)");
        }, 1000);
    }

    cacheDOM() {
        this.grid = document.getElementById('jornadas-grid');
        this.modal = document.getElementById('jornada-modal');
        this.form = document.getElementById('jornada-form');
        this.matchesContainer = document.getElementById('matches-container');
        this.prizesContainer = document.getElementById('prizes-container');

        this.btnNew = document.getElementById('btn-new-jornada');
        this.btnClose = document.getElementById('btn-close-modal');
        this.btnEdit = document.getElementById('btn-edit-mode');
        this.btnSave = document.getElementById('btn-save-jornada');
        this.btnDelete = document.getElementById('btn-delete-jornada');
        this.btnDeleteAll = document.getElementById('btn-delete-all-jornadas');

        this.inpNumber = document.getElementById('inp-jornada-num');
        this.inpId = document.getElementById('inp-jornada-id');
        this.inpDate = document.getElementById('inp-date');
        this.inpActive = document.getElementById('inp-active');
        this.teamsCache = [];

        // Text Importer DOM Elements (Matches)
        this.btnImportMatches = document.getElementById('btn-import-matches') || document.getElementById('btn-import-pdf');
        this.modalImport = document.getElementById('modal-import-matches');
        this.btnCloseImportModal = document.getElementById('btn-close-import-modal');
        this.importInputStep = document.getElementById('import-input-step');
        this.importSummaryStep = document.getElementById('import-summary-step');
        this.importTextarea = document.getElementById('import-matches-textarea');
        this.importErrorMsg = document.getElementById('import-error-msg');
        this.btnAnalyzeImport = document.getElementById('btn-analyze-import');
        this.btnCancelImport = document.getElementById('btn-cancel-import');
        this.importSummaryHeader = document.getElementById('import-summary-header');
        this.importWarningsCard = document.getElementById('import-warnings-card');
        this.importMatchesList = document.getElementById('import-matches-list');
        this.btnDiscardImport = document.getElementById('btn-discard-import');
        this.btnBackToText = document.getElementById('btn-back-to-text');
        this.btnConfirmCreateJornada = document.getElementById('btn-confirm-create-jornada');
        this.pendingImportData = null;

        // Text Importer DOM Elements (Results & Prizes)
        this.btnImportResults = document.getElementById('btn-import-results') || document.getElementById('btn-import-rss');
        this.modalImportResults = document.getElementById('modal-import-results');
        this.btnCloseResultsModal = document.getElementById('btn-close-results-modal');
        this.importResultsInputStep = document.getElementById('import-results-input-step');
        this.importResultsSummaryStep = document.getElementById('import-results-summary-step');
        this.importResultsTextarea = document.getElementById('import-results-textarea');
        this.importResultsErrorMsg = document.getElementById('import-results-error-msg');
        this.btnAnalyzeResultsImport = document.getElementById('btn-analyze-results-import');
        this.btnCancelResultsImport = document.getElementById('btn-cancel-results-import');
        this.importResultsSummaryHeader = document.getElementById('import-results-summary-header');
        this.importResultsWarningsCard = document.getElementById('import-results-warnings-card');
        this.importResultsMatchesList = document.getElementById('import-results-matches-list');
        this.importResultsPrizesList = document.getElementById('import-results-prizes-list');
        this.btnDiscardResultsImport = document.getElementById('btn-discard-results-import');
        this.btnBackToResultsText = document.getElementById('btn-back-to-results-text');
        this.btnConfirmImportResults = document.getElementById('btn-confirm-import-results');
        this.pendingResultsData = null;
    }

    bindEvents() {
        if (this.btnNew) this.btnNew.addEventListener('click', () => this.openModalNew());
        if (this.btnClose) this.btnClose.addEventListener('click', () => this.closeModal());
        if (this.form) this.form.addEventListener('submit', (e) => this.saveJornada(e));
        if (this.btnEdit) this.btnEdit.addEventListener('click', () => this.toggleEditMode(true));
        if (this.btnDelete) this.btnDelete.addEventListener('click', () => this.deleteCurrentJornada());
        if (this.btnDeleteAll) this.btnDeleteAll.addEventListener('click', () => this.deleteAllJornadas());

        // Text Importer Events (Matches)
        if (this.btnImportMatches) this.btnImportMatches.addEventListener('click', () => this.openImportTextModal());
        if (this.btnCloseImportModal) this.btnCloseImportModal.addEventListener('click', () => this.closeImportTextModal());
        if (this.btnCancelImport) this.btnCancelImport.addEventListener('click', () => this.closeImportTextModal());
        if (this.btnAnalyzeImport) this.btnAnalyzeImport.addEventListener('click', () => this.handleAnalyzeText());
        if (this.btnDiscardImport) this.btnDiscardImport.addEventListener('click', () => this.handleDiscardImport());
        if (this.btnBackToText) this.btnBackToText.addEventListener('click', () => this.handleBackToText());
        if (this.btnConfirmCreateJornada) this.btnConfirmCreateJornada.addEventListener('click', () => this.handleConfirmCreateJornada());

        // Text Importer Events (Results & Prizes)
        if (this.btnImportResults) this.btnImportResults.addEventListener('click', () => this.openImportResultsModal());
        if (this.btnCloseResultsModal) this.btnCloseResultsModal.addEventListener('click', () => this.closeImportResultsModal());
        if (this.btnCancelResultsImport) this.btnCancelResultsImport.addEventListener('click', () => this.closeImportResultsModal());
        if (this.btnAnalyzeResultsImport) this.btnAnalyzeResultsImport.addEventListener('click', () => this.handleAnalyzeResultsText());
        if (this.btnDiscardResultsImport) this.btnDiscardResultsImport.addEventListener('click', () => this.handleDiscardResultsImport());
        if (this.btnBackToResultsText) this.btnBackToResultsText.addEventListener('click', () => this.handleBackToResultsText());
        if (this.btnConfirmImportResults) this.btnConfirmImportResults.addEventListener('click', () => this.handleConfirmImportResults());

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
            if (e.target === this.modalImport) this.closeImportTextModal();
            if (e.target === this.modalImportResults) this.closeImportResultsModal();
        });
    }

    renderGrid() {
        this.grid.innerHTML = '';
        if (this.jornadas.length === 0) {
            this.grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 3rem; color:#666;">No hay jornadas. Pulsa 'Refrescar datos'.</div>`;
            return;
        }

        const sortedJornadas = [...this.jornadas].sort((a, b) => {
            return a.number - b.number;
        });

        sortedJornadas.forEach(j => {
            // Filter: Only show jornadas on Sunday (Maula rule)
            if (j.date && j.date.toLowerCase() !== 'por definir') {
                const dateObj = AppUtils.parseDate(j.date);
                if (dateObj && !AppUtils.isSunday(dateObj)) return;
            }

            const card = document.createElement('div');
            card.className = 'jornada-card';
            card.onclick = () => this.openModalView(j.id);

            const filledMatches = j.matches.filter(m => m.result).length;
            const hasTeams = j.matches.some(m => m.home !== '' || m.away !== '');
            const hasPig = j.matches && j.matches.some(m => m && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away));

            const statusColor = filledMatches === 15 ? '#2e7d32' : '#f57f17';
            const statusText = filledMatches === 15 ? 'Finalizada' : (filledMatches > 0 ? 'En Juego' : 'Pendiente');

            if (!hasTeams) {
                // Using class for configurable empty state opacity/bg/border
                card.classList.add('jornada-empty');
            }

            if (j.active === false) {
                card.style.opacity = '0.5';
                card.style.filter = 'grayscale(1)';
                card.style.border = '1px dashed #ccc';
            }

            card.innerHTML = `
                <div class="jornada-header">
                    <span class="jornada-number">Jornada ${j.number}${hasPig ? ' 🐷' : ''}</span>
                    <span class="jornada-date">${j.date}</span>
                </div>
                <div style="font-size:0.9rem; color:#555;">
                    <div class="jornada-season">${j.season}</div>
                    <div class="${filledMatches === 15 ? 'jornada-status-finished' : 'jornada-status-pending'}">${statusText}</div>
                    ${hasPig ? '<div style="font-size:0.8rem; color:#d81b60; font-weight:bold; margin-top:0.2rem;">🐷 Partido PIG</div>' : ''}
                    ${!hasTeams ? '<div style="font-size:0.8rem; color:#999; margin-top:0.2rem;">(Sin partidos definidos)</div>' : ''}
                </div>
            `;
            this.grid.appendChild(card);
        });
    }

    populateTeamsCache() {
        const teams = new Set();
        const commonTeams = [
            'Real Madrid', 'FC Barcelona', 'Villarreal', 'Atlético de Madrid', 'Real Betis',
            'Celta de Vigo', 'Real Sociedad', 'Getafe', 'Athletic Club', 'Valencia',
            'Sevilla', 'Rayo Vallecano', 'Osasuna', 'Espanyol', 'Alavés', 'Levante',
            'Elche', 'Racing de Santander', 'Deportivo de La Coruña', 'Málaga',
            'Real Oviedo', 'RCD Mallorca', 'Girona FC', 'UD Almería', 'UD Las Palmas',
            'CD Castellón', 'FC Burgos', 'SD Eibar', 'Córdoba CF', 'Sporting de Gijón',
            'AD Ceuta', 'Albacete Balompié', 'FC Andorra', 'Granada CF', 'Real Sociedad B',
            'CD Leganés', 'Real Valladolid', 'Cádiz CF', 'CD Tenerife', 'Eldense',
            'Celta Fortuna', 'CD Sabadell', 'Real Zaragoza', 'Mirandés', 'Cartagena',
            'Ferrol', 'Huesca'
        ];

        commonTeams.forEach(t => teams.add(AppUtils.formatTeamName(t)));
        this.jornadas.forEach(j => {
            if (j.matches) {
                j.matches.forEach(m => {
                    if (m.home) teams.add(AppUtils.formatTeamName(m.home));
                    if (m.away) teams.add(AppUtils.formatTeamName(m.away));
                });
            }
        });
        this.teamsCache = Array.from(teams).sort();
    }

    handleAutoFill(input, event) {
        // Skip if deleting or value is empty
        if (event.inputType === 'deleteContentBackward' || !input.value) return;

        const val = input.value.toLowerCase();
        // User says: "when it's resolved and no more possibilities"
        // We look for teams starting with current text
        const matches = this.teamsCache.filter(t => t.toLowerCase().startsWith(val));

        if (matches.length === 1) {
            const suggestion = matches[0];
            const originalLength = input.value.length;
            input.value = suggestion;

            // Select the added part so user can keep typing if they want
            input.setSelectionRange(originalLength, suggestion.length);
        }
    }

    // ... (openModalView, openModalNew, fillModalData remain same)

    openModalView(id) {
        const jornada = this.jornadas.find(j => j.id === id);
        if (!jornada) return;
        this.currentJornadaId = id;
        this.fillModalData(jornada);
        this.toggleEditMode(false);
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Lock scroll
    }

    openModalNew() {
        const nextNum = this.jornadas.length + 1;
        const newJornada = {
            id: Date.now(),
            number: nextNum,
            season: (window.AppUtils && AppUtils.activeSeason) || '2026-2027',
            date: 'Por definir',
            matches: Array(15).fill(null).map(() => ({ home: '', away: '', result: '' }))
        };
        this.currentJornadaId = newJornada.id;
        this.fillModalData(newJornada);
        this.toggleEditMode(true);
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Lock scroll

        this.btnDelete.style.display = 'none';
        this.btnEdit.style.display = 'none';
    }

    fillModalData(jornada) {
        if (this.inpNumber) this.inpNumber.value = jornada.number;
        this.inpId.value = jornada.id || '';
        this.inpDate.value = jornada.date;
        if (this.inpActive) this.inpActive.checked = jornada.active !== false; // Active by default

        const hasPig = jornada.matches && jornada.matches.some(m => m && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away));
        const modalTitle = document.getElementById('modal-title');
        let pigBadge = document.getElementById('modal-pig-badge');
        if (hasPig) {
            if (!pigBadge && modalTitle) {
                pigBadge = document.createElement('span');
                pigBadge.id = 'modal-pig-badge';
                pigBadge.style.cssText = 'font-size:0.8rem; background:#fce4ec; color:#c2185b; padding:2px 8px; border-radius:4px; font-weight:bold; vertical-align:middle; margin-left:6px;';
                pigBadge.innerHTML = '🐷 PIG';
                modalTitle.appendChild(pigBadge);
            } else if (pigBadge) {
                pigBadge.style.display = 'inline-block';
            }
        } else if (pigBadge) {
            pigBadge.style.display = 'none';
        }

        this.renderMatches(jornada.matches);
        this.renderPrizes(jornada.prizes || {});
    }

    selectAdminOption(el, val) {
        const parent = el.parentElement;
        const isEditMode = this.btnSave.style.display !== 'none';
        if (!isEditMode) return;
        
        const isAlreadySelected = el.classList.contains('selected');
        parent.querySelectorAll('.chk-option').forEach(c => c.classList.remove('selected'));
        
        const hiddenInput = parent.nextElementSibling;
        if (isAlreadySelected) {
            if (hiddenInput && hiddenInput.classList.contains('inp-res')) hiddenInput.value = '';
        } else {
            el.classList.add('selected');
            if (hiddenInput && hiddenInput.classList.contains('inp-res')) hiddenInput.value = val;
        }
    }

    selectAdminPlenoOption(el, team, val) {
        const parentGroup = el.parentElement;
        const container = parentGroup.parentElement;
        const isEditMode = this.btnSave.style.display !== 'none';
        if (!isEditMode) return;
        
        const isAlreadySelected = el.classList.contains('selected');
        parentGroup.querySelectorAll('.chk-option').forEach(c => c.classList.remove('selected'));
        if (!isAlreadySelected) el.classList.add('selected');
        
        const hiddenInput = container.nextElementSibling;
        if (hiddenInput && hiddenInput.classList.contains('inp-res')) {
            const homeSel = container.querySelector('.pleno-home-group .selected');
            const awaySel = container.querySelector('.pleno-away-group .selected');
            const hVal = homeSel ? homeSel.textContent : '';
            const aVal = awaySel ? awaySel.textContent : '';
            
            if (hVal || aVal) {
                hiddenInput.value = `${hVal}-${aVal}`;
            } else {
                hiddenInput.value = '';
            }
        }
    }

    renderMatches(matches) {
        this.matchesContainer.innerHTML = '';

        if (!matches || !Array.isArray(matches)) {
            console.error("renderMatches: 'matches' no es un array válido", matches);
            return;
        }

        const utilsAvailable = typeof AppUtils !== 'undefined';
        if (!utilsAvailable) console.error("CRITICAL: AppUtils no está definido. Comprueba js/utils.js");

        matches.forEach((m, idx) => {
            const isPleno = idx === 14;
            // ... creation logic
            const row = document.createElement('div');
            row.className = 'match-row';
            row.style.alignItems = 'center';

            if (!m) m = { home: '', away: '', result: '' }; // Safety fallback

            // Safe call to AppUtils
            const home = m.home || '';
            const away = m.away || '';
            const homeLogo = utilsAvailable ? AppUtils.getTeamLogo(home) : '';
            const awayLogo = utilsAvailable ? AppUtils.getTeamLogo(away) : '';

            let optionsHtml = '';
            if (!isPleno) {
                optionsHtml = `
                    <div class="admin-res-options" style="display:flex; gap:5px; flex:1; justify-content:center; align-items:center;">
                        <div class="chk-option ${m.result === '1' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminOption(this, '1')" style="width:25px; height:25px; font-size:0.85rem; line-height:25px; cursor:pointer;">1</div>
                        <div class="chk-option ${m.result === 'X' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminOption(this, 'X')" style="width:25px; height:25px; font-size:0.85rem; line-height:25px; cursor:pointer;">X</div>
                        <div class="chk-option ${m.result === '2' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminOption(this, '2')" style="width:25px; height:25px; font-size:0.85rem; line-height:25px; cursor:pointer;">2</div>
                    </div>
                `;
            } else {
                const resParts = (m.result || '').split('-');
                const homeRes = resParts[0] || '';
                const awayRes = resParts[1] || '';
                optionsHtml = `
                    <div class="admin-res-options pleno-options" style="display:flex; gap:8px; flex:1; justify-content:center; align-items:center;">
                        <div style="display:flex; gap:2px;" class="pleno-home-group">
                            <div class="chk-option ${homeRes === '0' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'home', '0')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">0</div>
                            <div class="chk-option ${homeRes === '1' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'home', '1')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">1</div>
                            <div class="chk-option ${homeRes === '2' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'home', '2')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">2</div>
                            <div class="chk-option ${homeRes === 'M' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'home', 'M')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">M</div>
                        </div>
                        <span style="color:#aaa; font-weight:bold;">-</span>
                        <div style="display:flex; gap:2px;" class="pleno-away-group">
                            <div class="chk-option ${awayRes === '0' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'away', '0')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">0</div>
                            <div class="chk-option ${awayRes === '1' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'away', '1')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">1</div>
                            <div class="chk-option ${awayRes === '2' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'away', '2')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">2</div>
                            <div class="chk-option ${awayRes === 'M' ? 'selected' : ''}" onclick="window.jornadaManager.selectAdminPlenoOption(this, 'away', 'M')" style="width:20px; height:20px; font-size:0.75rem; line-height:20px; cursor:pointer;">M</div>
                        </div>
                    </div>
                `;
            }

            const isPigMatch = utilsAvailable && AppUtils.isPigMatch(home, away);

            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:4px;">
                    <span class="match-number">${isPleno ? 'P15' : idx + 1}${isPigMatch ? ' 🐷' : ''}</span>
                    ${isPigMatch ? '<span style="font-size:0.75rem; background:#ffecb3; color:#e65100; border-radius:4px; padding:2px 5px; font-weight:bold;">🐷 PIG</span>' : ''}
                </div>
                
                <div style="display:flex; align-items:center; flex:2; gap:5px;">
                    <img src="${homeLogo}" class="team-logo home-logo-img" onerror="this.style.display='none'" style="${homeLogo ? 'display:inline-block' : 'display:none'}">
                    <input type="text" placeholder="Local" class="inp-home" value="${home}" style="width:100%; box-sizing:border-box;">
                </div>

                <span style="color:#aaa; margin:0 5px;">-</span>

                <div style="display:flex; align-items:center; flex:2; gap:5px;">
                    <img src="${awayLogo}" class="team-logo away-logo-img" onerror="this.style.display='none'" style="${awayLogo ? 'display:inline-block' : 'display:none'}">
                    <input type="text" placeholder="Visitante" class="inp-away" value="${away}" style="width:100%; box-sizing:border-box;">
                </div>

                ${optionsHtml}
                <input type="hidden" class="inp-res" value="${m.result || ''}">
            `;

            const inpHome = row.querySelector('.inp-home');
            const imgHome = row.querySelector('.home-logo-img');
            inpHome.addEventListener('input', (e) => {
                this.handleAutoFill(inpHome, e); // Suggest and fill
                if (utilsAvailable) {
                    const src = AppUtils.getTeamLogo(e.target.value);
                    imgHome.src = src;
                    imgHome.style.display = src ? 'inline-block' : 'none';
                }
            });

            const inpAway = row.querySelector('.inp-away');
            const imgAway = row.querySelector('.away-logo-img');
            inpAway.addEventListener('input', (e) => {
                this.handleAutoFill(inpAway, e); // Suggest and fill
                if (utilsAvailable) {
                    const src = AppUtils.getTeamLogo(e.target.value);
                    imgAway.src = src;
                    imgAway.style.display = src ? 'inline-block' : 'none';
                }
            });

            this.matchesContainer.appendChild(row);

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
                this.matchesContainer.appendChild(divider);
            }
        });
    }

    renderPrizes(prizes) {
        if (!this.prizesContainer) return;
        this.prizesContainer.innerHTML = '';

        const categories = ['15', '14', '13', '12', '11', '10'];
        categories.forEach(cat => {
            const amount = prizes[cat] || 0;
            const row = document.createElement('div');
            row.className = 'prize-row';
            row.dataset.category = cat;

            const formatted = AppUtils.formatEuro(amount);

            row.innerHTML = `
                <span class="prize-category">${cat === '15' ? 'Pleno al 15' : cat + ' Aciertos'}</span>
                <input type="text" class="inp-prize" value="${formatted}" placeholder="0,00 €">
            `;

            // Formatting on blur
            const inp = row.querySelector('input');
            inp.addEventListener('blur', () => {
                const val = AppUtils.parseEuro(inp.value);
                inp.value = AppUtils.formatEuro(val);
            });

            this.prizesContainer.appendChild(row);
        });
    }

    toggleEditMode(isEdit) {
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach(inp => {
            if (inp.id === 'inp-season') return;
            if (inp.type === 'hidden') return;
            inp.readOnly = !isEdit;
            if (inp.type === 'checkbox') inp.disabled = !isEdit;
            if (!isEdit) inp.style.border = 'none';
            else if (inp.type !== 'checkbox') inp.style.border = '1px solid #ddd';
        });

        const optionGroups = this.form.querySelectorAll('.admin-res-options');
        optionGroups.forEach(group => {
            group.style.opacity = isEdit ? '1' : '0.6';
            group.style.pointerEvents = isEdit ? 'auto' : 'none';
        });

        // Also handle prize inputs
        if (this.prizesContainer) {
            const prizeInputs = this.prizesContainer.querySelectorAll('input');
            prizeInputs.forEach(inp => {
                inp.readOnly = !isEdit;
                if (!isEdit) inp.style.border = 'none';
                else inp.style.border = '1px solid #ddd';
            });
        }

        if (this.inpNumber) {
            this.inpNumber.readOnly = !isEdit;
            this.inpNumber.style.border = isEdit ? '1px solid #ddd' : '1px solid transparent';
            this.inpNumber.style.background = isEdit ? '#fff' : 'transparent';
        }

        if (isEdit) {
            this.btnEdit.style.display = 'none';
            this.btnSave.style.display = 'inline-block';
            this.btnDelete.style.display = 'inline-block';
            if (document.getElementById('modal-mode-badge')) document.getElementById('modal-mode-badge').textContent = "Editando";
        } else {
            this.btnEdit.style.display = 'inline-block';
            this.btnSave.style.display = 'none';
            this.btnDelete.style.display = 'none';
            if (document.getElementById('modal-mode-badge')) document.getElementById('modal-mode-badge').textContent = "Vista";
        }
    }

    saveJornada(e) {
        e.preventDefault();

        // VALIDATE DATE IS SUNDAY
        const dateStr = this.inpDate.value;
        const dateObj = AppUtils.parseDate(dateStr);

        if (!dateObj || isNaN(dateObj.getTime())) {
            alert('Formato de fecha inválido. Usa "dd/mm/yyyy" o "dd de mes de yyyy".');
            return;
        }

        if (!AppUtils.isSunday(dateObj)) {
            alert('REGLA MAULA: Las jornadas solo pueden ser en DOMINGO.');
            return;
        }

        const matchRows = this.matchesContainer.querySelectorAll('.match-row');
        const matches = [];
        matchRows.forEach(row => {
            matches.push({
                home: row.querySelector('.inp-home').value,
                away: row.querySelector('.inp-away').value,
                result: row.querySelector('.inp-res').value
            });
        });

        const existingIdx = this.jornadas.findIndex(j => j.id == this.currentJornadaId);

        const prizes = {};
        if (this.prizesContainer) {
            const prizeRows = this.prizesContainer.querySelectorAll('.prize-row');
            prizeRows.forEach(row => {
                const category = row.dataset.category;
                const valueStr = row.querySelector('input').value;
                const value = AppUtils.parseEuro(valueStr);
                if (value > 0) prizes[category] = value;
            });
        }

        const jornadaData = {
            id: this.currentJornadaId || Date.now(),
            number: parseInt(this.inpNumber.value) || 0,
            season: '2026-2027',
            date: dateStr,
            matches: matches,
            prizes: prizes,
            active: this.inpActive ? this.inpActive.checked : true
        };

        if (existingIdx > -1) {
            this.jornadas[existingIdx] = jornadaData;
        } else {
            this.jornadas.push(jornadaData);
            this.currentJornadaId = jornadaData.id;
        }

        this.saveSingle(jornadaData);
        this.renderGrid();

        if (window.DiceService && window.DataService) {
            window.DataService.getAll('members').then(members => {
                window.DataService.getAll('pronosticos').then(pronosticos => {
                    window.DiceService.checkAndApplyDice(members, this.jornadas, pronosticos);
                });
            }).catch(err => console.error("Error aplicando dado tras guardar jornada:", err));
        }

        // TELEGRAM REPORT TRIGGER
        const isFinished = jornadaData.matches.every(m => m.result && m.result.trim() !== '');
        if (isFinished && window.TelegramService) {
            // Optional: Show a message or do it silently if enabled in config
            // The service already checks for tg.enabled
            window.TelegramService.sendJornadaReport(jornadaData.id);
        }

        const originalText = this.btnSave.innerHTML;
        this.btnSave.innerHTML = '✅ Guardado';
        this.btnSave.disabled = true;
        setTimeout(() => {
            this.btnSave.innerHTML = originalText;
            this.btnSave.disabled = false;
        }, 1500);
    }


    async deleteCurrentJornada() {
        if (confirm('¿Seguro que quieres borrar esta jornada?')) {
            const idToDelete = this.currentJornadaId;
            this.jornadas = this.jornadas.filter(j => j.id != idToDelete);

            if (window.DataService) {
                await window.DataService.delete('jornadas', idToDelete);
            }

            this.renderGrid();
            this.closeModal();
        }
    }

    deleteAllJornadas() {
        if (confirm('⚠️ PELIGRO:\n\n¿Estás seguro de que quieres BORRAR TODA LA INFORMACIÓN DE JORNADAS?\n\nEsta acción no se puede deshacer.')) {
            if (confirm('Confirma nuevamente: ¿Borrar TODO?')) {
                this.jornadas = [];
                this.saveToStorage();
                this.renderGrid();
                alert('Toda la información de jornadas ha sido eliminada.');
            }
        }
    }

    closeModal() {
        this.modal.classList.remove('active');
        document.body.style.overflow = ''; // Unlock scroll
    }

    async saveToStorage() {
        if (!window.DataService) return;
        for (const j of this.jornadas) {
            await window.DataService.save('jornadas', j);
        }
    }

    async saveSingle(jornada) {
        if (!window.DataService) return;
        await window.DataService.save('jornadas', jornada);
    }

    // --- TEXT IMPORTER METHODS ---
    openImportTextModal() {
        if (!this.modalImport) return;
        this.pendingImportData = null;
        if (this.importTextarea) this.importTextarea.value = '';
        if (this.importErrorMsg) {
            this.importErrorMsg.style.display = 'none';
            this.importErrorMsg.innerHTML = '';
        }
        if (this.importInputStep) this.importInputStep.style.display = 'block';
        if (this.importSummaryStep) this.importSummaryStep.style.display = 'none';
        this.modalImport.style.display = 'flex';
        this.modalImport.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (this.importTextarea) this.importTextarea.focus();
    }

    closeImportTextModal() {
        if (!this.modalImport) return;
        this.modalImport.style.display = 'none';
        this.modalImport.classList.remove('active');
        document.body.style.overflow = '';
        this.pendingImportData = null;
    }

    handleAnalyzeText() {
        if (!this.importTextarea) return;
        const raw = this.importTextarea.value.trim();

        if (!raw) {
            if (this.importErrorMsg) {
                this.importErrorMsg.innerHTML = '⚠️ Por favor, pega el texto de la jornada antes de analizar.';
                this.importErrorMsg.style.display = 'block';
            }
            return;
        }

        if (typeof TextImporterService === 'undefined') {
            alert('Error: No se encontró el servicio TextImporterService.');
            return;
        }

        const parsed = TextImporterService.parseMatchesText(raw);

        if (!parsed.success && parsed.errors.length > 0) {
            if (this.importErrorMsg) {
                this.importErrorMsg.innerHTML = `<strong>⚠️ No se pudo interpretar la jornada completa:</strong><ul style="margin:5px 0 0 0; padding-left:20px;">${parsed.errors.map(e => `<li>${e}</li>`).join('')}</ul>`;
                this.importErrorMsg.style.display = 'block';
            }
            return;
        }

        if (this.importErrorMsg) {
            this.importErrorMsg.style.display = 'none';
            this.importErrorMsg.innerHTML = '';
        }

        this.pendingImportData = parsed;
        this.renderImportSummary(parsed);

        if (this.importInputStep) this.importInputStep.style.display = 'none';
        if (this.importSummaryStep) this.importSummaryStep.style.display = 'block';
    }

    renderImportSummary(parsed) {
        if (!this.importSummaryHeader || !this.importMatchesList) return;

        const existing = this.jornadas.find(j => j.number === parsed.jNum);
        const isSunday = parsed.isSunday;

        let dateBadge = '';
        if (parsed.dateStr) {
            if (isSunday === true) {
                dateBadge = '<span style="background:rgba(46,125,50,0.12); color:#2e7d32; border:1px solid rgba(46,125,50,0.3); padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">📅 Domingo</span>';
            } else if (isSunday === false) {
                dateBadge = '<span style="background:rgba(255,152,0,0.15); color:#e65100; border:1px solid rgba(255,152,0,0.4); padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">⚠️ No es domingo</span>';
            }
        }

        let existingBanner = '';
        if (existing) {
            existingBanner = `
                <div style="background:rgba(33,150,243,0.1); border:1px solid rgba(33,150,243,0.3); border-radius:6px; padding:0.6rem 0.8rem; margin-top:0.8rem; color:#1976d2; font-size:0.85rem;">
                    ℹ️ <strong>Atención:</strong> Ya existe una <strong>Jornada ${parsed.jNum}</strong> registrada. Si confirmas, se actualizarán los partidos con los nuevos datos.
                </div>
            `;
        }

        this.importSummaryHeader.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <span style="font-size:1.2rem; font-weight:900; color:var(--primary-color, #1976d2);">Jornada ${parsed.jNum}</span>
                    <span style="font-size:0.85rem; color:var(--text-secondary, #666); margin-left:8px;">(Temporada 2026-2027)</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:600; color:var(--text-main, #333); font-size:0.95rem;">${parsed.dateStr || 'Sin fecha'}</span>
                    ${dateBadge}
                </div>
            </div>
            ${existingBanner}
        `;

        // Warnings
        if (parsed.warnings && parsed.warnings.length > 0) {
            this.importWarningsCard.innerHTML = `
                <ul style="margin:0; padding-left:1.2rem; list-style-type:disc;">
                    ${parsed.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            `;
            this.importWarningsCard.style.display = 'block';
        } else {
            this.importWarningsCard.style.display = 'none';
        }

        // Matches list
        let matchesHtml = '<div style="display:flex; flex-direction:column; gap:6px;">';
        parsed.matches.forEach((m, idx) => {
            const num = idx + 1;
            const isP15 = idx === 14;
            const numLabel = isP15 ? 'P15' : `${num}`;
            const numStyle = isP15 
                ? 'background: linear-gradient(135deg, #e65100, #ff9100); color: white; font-weight: 900;' 
                : 'background: var(--input-bg, #eee); color: var(--text-main, #333); font-weight: bold;';

            if (!m) {
                matchesHtml += `
                    <div style="display:flex; align-items:center; padding:6px 10px; border-radius:6px; background:rgba(244,67,54,0.06); border:1px dashed #ef9a9a;">
                        <span style="width:36px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; font-size:0.8rem; margin-right:10px; ${numStyle}">${numLabel}</span>
                        <span style="color:#d32f2f; font-size:0.85rem; font-style:italic;">⚠️ Partido no detectado</span>
                    </div>
                `;
                return;
            }

            const homeLogo = typeof AppUtils !== 'undefined' ? AppUtils.getTeamLogo(m.home) : '';
            const awayLogo = typeof AppUtils !== 'undefined' ? AppUtils.getTeamLogo(m.away) : '';
            const isPig = isP15 && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away);

            const pigBadge = isPig ? '<span style="background:rgba(233,30,99,0.12); color:#c2185b; border:1px solid rgba(233,30,99,0.3); border-radius:10px; padding:1px 6px; font-size:0.75rem; font-weight:bold; margin-left:6px;">🐷 PIG</span>' : '';

            matchesHtml += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-radius:6px; background:var(--pastel-bg, #fcfcfc); border:1px solid var(--input-border, #eee); font-size:0.9rem;">
                    <div style="display:flex; align-items:center; flex:1; overflow:hidden;">
                        <span style="width:36px; height:24px; min-width:36px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; font-size:0.8rem; margin-right:12px; ${numStyle}">${numLabel}</span>
                        <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end; text-align:right;">
                            <span style="font-weight:600; color:var(--text-main, #333); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.home}</span>
                            ${homeLogo ? `<img src="${homeLogo}" style="width:20px; height:20px; object-fit:contain;" alt="">` : ''}
                        </div>
                        <span style="margin:0 10px; color:#aaa; font-weight:bold; font-size:0.8rem;">vs</span>
                        <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-start; text-align:left;">
                            ${awayLogo ? `<img src="${awayLogo}" style="width:20px; height:20px; object-fit:contain;" alt="">` : ''}
                            <span style="font-weight:600; color:var(--text-main, #333); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.away}</span>
                        </div>
                    </div>
                    ${pigBadge}
                </div>
            `;
        });
        matchesHtml += '</div>';
        this.importMatchesList.innerHTML = matchesHtml;
    }

    async handleConfirmCreateJornada() {
        if (!this.pendingImportData) return;

        const parsed = this.pendingImportData;
        const existingIdx = this.jornadas.findIndex(j => j.number === parsed.jNum);
        const existing = existingIdx > -1 ? this.jornadas[existingIdx] : null;

        const jornadaData = {
            id: existing ? existing.id : Date.now(),
            number: parsed.jNum,
            season: '2026-2027',
            date: parsed.dateStr || (existing ? existing.date : 'Por definir'),
            matches: parsed.matches,
            prizes: existing ? (existing.prizes || {}) : {},
            active: existing ? existing.active : true
        };

        if (existingIdx > -1) {
            this.jornadas[existingIdx] = jornadaData;
        } else {
            this.jornadas.push(jornadaData);
        }

        if (this.btnConfirmCreateJornada) {
            this.btnConfirmCreateJornada.disabled = true;
            this.btnConfirmCreateJornada.textContent = '⏳ Guardando...';
        }

        try {
            await this.saveSingle(jornadaData);
            this.renderGrid();

            // Trigger dice for absent members if applicable
            if (window.DiceService && window.DataService) {
                try {
                    const members = await window.DataService.getAll('members');
                    const pronosticos = await window.DataService.getAll('pronosticos');
                    await window.DiceService.checkAndApplyDice(members, this.jornadas, pronosticos);
                } catch (errDice) {
                    console.error("Error aplicando dado tras importar partidos:", errDice);
                }
            }

            this.closeImportTextModal();
            alert(`✅ Jornada ${jornadaData.number} creada y guardada correctamente.`);
        } catch (err) {
            console.error("Error al guardar jornada importada:", err);
            alert("Error al guardar la jornada: " + err.message);
        } finally {
            if (this.btnConfirmCreateJornada) {
                this.btnConfirmCreateJornada.disabled = false;
                this.btnConfirmCreateJornada.textContent = '✅ Confirmar y Crear Jornada';
            }
        }
    }

    handleDiscardImport() {
        this.pendingImportData = null;
        this.closeImportTextModal();
    }

    handleBackToText() {
        if (this.importSummaryStep) this.importSummaryStep.style.display = 'none';
        if (this.importInputStep) this.importInputStep.style.display = 'block';
    }

    // --- RESULTS & PRIZES IMPORTER METHODS ---
    openImportResultsModal() {
        if (!this.modalImportResults) return;
        this.pendingResultsData = null;
        if (this.importResultsTextarea) this.importResultsTextarea.value = '';
        if (this.importResultsErrorMsg) {
            this.importResultsErrorMsg.style.display = 'none';
            this.importResultsErrorMsg.innerHTML = '';
        }
        if (this.importResultsInputStep) this.importResultsInputStep.style.display = 'block';
        if (this.importResultsSummaryStep) this.importResultsSummaryStep.style.display = 'none';
        this.modalImportResults.style.display = 'flex';
        this.modalImportResults.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (this.importResultsTextarea) this.importResultsTextarea.focus();
    }

    closeImportResultsModal() {
        if (!this.modalImportResults) return;
        this.modalImportResults.style.display = 'none';
        this.modalImportResults.classList.remove('active');
        document.body.style.overflow = '';
        this.pendingResultsData = null;
    }

    handleAnalyzeResultsText() {
        if (!this.importResultsTextarea) return;
        const raw = this.importResultsTextarea.value.trim();

        if (!raw) {
            if (this.importResultsErrorMsg) {
                this.importResultsErrorMsg.innerHTML = '⚠️ Por favor, pega el texto de resultados antes de analizar.';
                this.importResultsErrorMsg.style.display = 'block';
            }
            return;
        }

        if (typeof TextImporterService === 'undefined' || typeof TextImporterService.parseResultsText !== 'function') {
            alert('Error: TextImporterService.parseResultsText no está disponible.');
            return;
        }

        const parsed = TextImporterService.parseResultsText(raw);

        if (!parsed.success && parsed.errors.length > 0) {
            if (this.importResultsErrorMsg) {
                this.importResultsErrorMsg.innerHTML = `<strong>⚠️ No se pudieron interpretar los resultados:</strong><ul style="margin:5px 0 0 0; padding-left:20px;">${parsed.errors.map(e => `<li>${e}</li>`).join('')}</ul>`;
                this.importResultsErrorMsg.style.display = 'block';
            }
            return;
        }

        if (this.importResultsErrorMsg) {
            this.importResultsErrorMsg.style.display = 'none';
            this.importResultsErrorMsg.innerHTML = '';
        }

        this.pendingResultsData = parsed;
        this.renderResultsSummary(parsed);

        if (this.importResultsInputStep) this.importResultsInputStep.style.display = 'none';
        if (this.importResultsSummaryStep) this.importResultsSummaryStep.style.display = 'block';
    }

    renderResultsSummary(parsed) {
        if (!this.importResultsSummaryHeader || !this.importResultsMatchesList || !this.importResultsPrizesList) return;

        const existing = this.jornadas.find(j => j.number === parsed.jNum);
        const isSunday = parsed.isSunday;

        let dateBadge = '';
        if (parsed.dateStr) {
            if (isSunday === true) {
                dateBadge = '<span style="background:rgba(46,125,50,0.12); color:#2e7d32; border:1px solid rgba(46,125,50,0.3); padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">📅 Domingo</span>';
            } else if (isSunday === false) {
                dateBadge = '<span style="background:rgba(255,152,0,0.15); color:#e65100; border:1px solid rgba(255,152,0,0.4); padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">⚠️ No es domingo</span>';
            }
        }

        let existingBanner = '';
        if (existing) {
            existingBanner = `
                <div style="background:rgba(33,150,243,0.1); border:1px solid rgba(33,150,243,0.3); border-radius:6px; padding:0.6rem 0.8rem; margin-top:0.8rem; color:#1976d2; font-size:0.85rem;">
                    ℹ️ <strong>Jornada encontrada:</strong> Ya existe la <strong>Jornada ${parsed.jNum}</strong> registrada. Al confirmar, se actualizarán los resultados de sus partidos y su desglose de premios.
                </div>
            `;
        } else {
            existingBanner = `
                <div style="background:rgba(76,175,80,0.1); border:1px solid rgba(76,175,80,0.3); border-radius:6px; padding:0.6rem 0.8rem; margin-top:0.8rem; color:#2e7d32; font-size:0.85rem;">
                    ✨ <strong>Nueva Jornada:</strong> La <strong>Jornada ${parsed.jNum}</strong> no existe en el sistema. Al confirmar, se creará completa con estos resultados y premios.
                </div>
            `;
        }

        this.importResultsSummaryHeader.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <span style="font-size:1.2rem; font-weight:900; color:var(--primary-green, #2e7d32);">Jornada ${parsed.jNum}</span>
                    <span style="font-size:0.85rem; color:var(--text-secondary, #666); margin-left:8px;">(Temporada 2026-2027)</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:600; color:var(--text-main, #333); font-size:0.95rem;">${parsed.dateStr || 'Sin fecha'}</span>
                    ${dateBadge}
                </div>
            </div>
            ${existingBanner}
        `;

        // Warnings
        if (parsed.warnings && parsed.warnings.length > 0) {
            this.importResultsWarningsCard.innerHTML = `
                <ul style="margin:0; padding-left:1.2rem; list-style-type:disc;">
                    ${parsed.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            `;
            this.importResultsWarningsCard.style.display = 'block';
        } else {
            this.importResultsWarningsCard.style.display = 'none';
        }

        // Matches list
        let matchesHtml = '<div style="display:flex; flex-direction:column; gap:6px;">';
        parsed.matches.forEach((m, idx) => {
            const num = idx + 1;
            const isP15 = idx === 14;
            const numLabel = isP15 ? 'P15' : `${num}`;
            const numStyle = isP15 
                ? 'background: linear-gradient(135deg, #e65100, #ff9100); color: white; font-weight: 900;' 
                : 'background: var(--input-bg, #eee); color: var(--text-main, #333); font-weight: bold;';

            if (!m) {
                matchesHtml += `
                    <div style="display:flex; align-items:center; padding:6px 10px; border-radius:6px; background:rgba(244,67,54,0.06); border:1px dashed #ef9a9a;">
                        <span style="width:36px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; font-size:0.8rem; margin-right:10px; ${numStyle}">${numLabel}</span>
                        <span style="color:#d32f2f; font-size:0.85rem; font-style:italic;">⚠️ Partido no detectado</span>
                    </div>
                `;
                return;
            }

            const homeLogo = typeof AppUtils !== 'undefined' ? AppUtils.getTeamLogo(m.home) : '';
            const awayLogo = typeof AppUtils !== 'undefined' ? AppUtils.getTeamLogo(m.away) : '';
            const isPig = isP15 && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away);
            const pigBadge = isPig ? '<span style="background:rgba(233,30,99,0.12); color:#c2185b; border:1px solid rgba(233,30,99,0.3); border-radius:10px; padding:1px 6px; font-size:0.75rem; font-weight:bold; margin-right:6px;">🐷 PIG</span>' : '';

            // Sign Badge Styling
            let badgeStyle = 'background:#eee; color:#333;';
            if (m.result === '1') {
                badgeStyle = 'background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7;';
            } else if (m.result === 'X') {
                badgeStyle = 'background:#fff8e1; color:#f57f17; border:1px solid #ffe082;';
            } else if (m.result === '2') {
                badgeStyle = 'background:#ffebee; color:#c62828; border:1px solid #ef9a9a;';
            } else if (isP15) {
                badgeStyle = 'background: linear-gradient(135deg, #e65100, #ff9100); color: white; border:none;';
            }

            matchesHtml += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-radius:6px; background:var(--pastel-bg, #fcfcfc); border:1px solid var(--input-border, #eee); font-size:0.9rem;">
                    <div style="display:flex; align-items:center; flex:1; overflow:hidden;">
                        <span style="width:36px; height:24px; min-width:36px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; font-size:0.8rem; margin-right:12px; ${numStyle}">${numLabel}</span>
                        <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end; text-align:right;">
                            <span style="font-weight:600; color:var(--text-main, #333); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.home}</span>
                            ${homeLogo ? `<img src="${homeLogo}" style="width:20px; height:20px; object-fit:contain;" alt="">` : ''}
                        </div>
                        <span style="margin:0 10px; font-weight:bold; color:var(--text-secondary, #555); font-size:0.85rem; background:var(--input-bg, #eee); padding:2px 8px; border-radius:4px; min-width:44px; text-align:center;">${m.score || '-'}</span>
                        <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-start; text-align:left;">
                            ${awayLogo ? `<img src="${awayLogo}" style="width:20px; height:20px; object-fit:contain;" alt="">` : ''}
                            <span style="font-weight:600; color:var(--text-main, #333); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.away}</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; margin-left:12px;">
                        ${pigBadge}
                        <span style="display:inline-flex; align-items:center; justify-content:center; min-width:34px; height:26px; padding:0 6px; border-radius:6px; font-weight:bold; font-size:0.9rem; ${badgeStyle}">${m.result || '-'}</span>
                    </div>
                </div>
            `;
        });
        matchesHtml += '</div>';
        this.importResultsMatchesList.innerHTML = matchesHtml;

        // Prizes Table
        const formatEuro = typeof AppUtils !== 'undefined' ? AppUtils.formatEuro : (val) => val.toLocaleString('es-ES') + ' €';
        const prizesDetails = parsed.prizesDetails || [
            { category: '15', label: 'Pleno al 15', winners: 0, amount: parsed.prizes['15'] || 0 },
            { category: '14', label: '1ª (14 Aciertos)', winners: 0, amount: parsed.prizes['14'] || 0 },
            { category: '13', label: '2ª (13 Aciertos)', winners: 0, amount: parsed.prizes['13'] || 0 },
            { category: '12', label: '3ª (12 Aciertos)', winners: 0, amount: parsed.prizes['12'] || 0 },
            { category: '11', label: '4ª (11 Aciertos)', winners: 0, amount: parsed.prizes['11'] || 0 },
            { category: '10', label: '5ª (10 Aciertos)', winners: 0, amount: parsed.prizes['10'] || 0 }
        ];

        let prizesHtml = `
            <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:left;">
                <thead>
                    <tr style="border-bottom:2px solid var(--input-border, #ddd); color:var(--text-secondary, #666);">
                        <th style="padding:6px 10px;">Categoría</th>
                        <th style="padding:6px 10px; text-align:center;">Acertantes</th>
                        <th style="padding:6px 10px; text-align:right;">Premio</th>
                    </tr>
                </thead>
                <tbody>
        `;

        prizesDetails.forEach((pd, pidx) => {
            const rowBg = pidx % 2 === 0 ? 'background:var(--pastel-bg, #fafafa);' : 'background:var(--card-bg, #fff);';
            const formattedAmount = formatEuro(pd.amount);
            const winnersDisplay = (pd.winners !== null && pd.winners !== undefined) ? pd.winners.toLocaleString('es-ES') : '-';
            const isHighlight = pd.category === '15' || pd.category === '14';
            const catStyle = isHighlight ? 'font-weight:bold; color:var(--text-main, #333);' : 'color:var(--text-main, #444);';
            const prizeStyle = pd.amount > 0 ? 'font-weight:bold; color:#2e7d32;' : 'color:var(--text-secondary, #888);';

            prizesHtml += `
                <tr style="${rowBg} border-bottom:1px solid var(--input-border, #eee);">
                    <td style="padding:7px 10px; ${catStyle}">${pd.label}</td>
                    <td style="padding:7px 10px; text-align:center; color:var(--text-secondary, #555);">${winnersDisplay}</td>
                    <td style="padding:7px 10px; text-align:right; ${prizeStyle}">${formattedAmount}</td>
                </tr>
            `;
        });

        prizesHtml += `
                </tbody>
            </table>
        `;
        this.importResultsPrizesList.innerHTML = prizesHtml;
    }

    async handleConfirmImportResults() {
        if (!this.pendingResultsData) return;

        const parsed = this.pendingResultsData;
        const existingIdx = this.jornadas.findIndex(j => j.number === parsed.jNum);
        const existing = existingIdx > -1 ? this.jornadas[existingIdx] : null;

        let matches;
        if (existing && existing.matches && existing.matches.length === 15) {
            matches = existing.matches.map((em, idx) => {
                const pm = parsed.matches[idx];
                return {
                    home: em.home || (pm ? pm.home : ''),
                    away: em.away || (pm ? pm.away : ''),
                    score: pm && pm.score ? pm.score : (em.score || ''),
                    result: pm && pm.result ? pm.result : (em.result || '')
                };
            });
        } else {
            matches = parsed.matches.map(m => ({
                home: m ? m.home : '',
                away: m ? m.away : '',
                score: m ? m.score : '',
                result: m ? m.result : ''
            }));
        }

        const jornadaData = {
            id: existing ? existing.id : Date.now(),
            number: parsed.jNum,
            season: '2026-2027',
            date: parsed.dateStr || (existing ? existing.date : 'Por definir'),
            matches: matches,
            prizes: parsed.prizes,
            active: existing ? existing.active : true
        };

        if (existingIdx > -1) {
            this.jornadas[existingIdx] = jornadaData;
        } else {
            this.jornadas.push(jornadaData);
        }

        if (this.btnConfirmImportResults) {
            this.btnConfirmImportResults.disabled = true;
            this.btnConfirmImportResults.textContent = '⏳ Guardando resultados...';
        }

        try {
            await this.saveSingle(jornadaData);
            this.renderGrid();

            // Trigger dice for absent members if applicable
            if (window.DiceService && window.DataService) {
                try {
                    const members = await window.DataService.getAll('members');
                    const pronosticos = await window.DataService.getAll('pronosticos');
                    await window.DiceService.checkAndApplyDice(members, this.jornadas, pronosticos);
                } catch (errDice) {
                    console.error("Error aplicando dado tras importar resultados:", errDice);
                }
            }

            // Telegram Report trigger if all 15 matches finished
            const isFinished = jornadaData.matches.every(m => m.result && m.result.trim() !== '');
            if (isFinished && window.TelegramService) {
                try {
                    await window.TelegramService.sendJornadaReport(jornadaData.id);
                } catch (errTg) {
                    console.error("Error enviando reporte Telegram tras importar resultados:", errTg);
                }
            }

            this.closeImportResultsModal();
            alert(`✅ Jornada ${jornadaData.number}: Resultados y premios importados correctamente.`);
        } catch (err) {
            console.error("Error al guardar resultados importados:", err);
            alert("Error al guardar resultados: " + err.message);
        } finally {
            if (this.btnConfirmImportResults) {
                this.btnConfirmImportResults.disabled = false;
                this.btnConfirmImportResults.textContent = '✅ Confirmar e Importar Resultados';
            }
        }
    }

    handleDiscardResultsImport() {
        this.pendingResultsData = null;
        this.closeImportResultsModal();
    }

    handleBackToResultsText() {
        if (this.importResultsSummaryStep) this.importResultsSummaryStep.style.display = 'none';
        if (this.importResultsInputStep) this.importResultsInputStep.style.display = 'block';
    }

    refreshData(silent = false) {
        // Warning: This reset logic is now removed. 
        // Use Import or Cloud Seed for initial data.
        alert("La función de restaurar datos 'hardcoded' se ha movido al proceso de carga inicial (CloudSeeder).");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.jornadaManager = new JornadaManager();
});
