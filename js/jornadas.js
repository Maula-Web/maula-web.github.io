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
            await this.loadData();
        }

        this.renderGrid();
        this.checkForUpdates();
        this.populateTeamsCache();
    }

    async loadData() {
        this.jornadas = await window.DataService.getAll('jornadas');
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
            console.log("Datos cargados desde fichero externo (2025-2026)");
        }, 1000);
    }

    cacheDOM() {
        this.grid = document.getElementById('jornadas-grid');
        this.modal = document.getElementById('jornada-modal');
        this.form = document.getElementById('jornada-form');
        this.matchesContainer = document.getElementById('matches-container');

        this.btnNew = document.getElementById('btn-new-jornada');
        this.btnClose = document.getElementById('btn-close-modal');
        this.btnEdit = document.getElementById('btn-edit-mode');
        this.btnSave = document.getElementById('btn-save-jornada');
        this.btnDelete = document.getElementById('btn-delete-jornada');
        this.btnDeleteAll = document.getElementById('btn-delete-all-jornadas');

        this.modalTitleNum = document.getElementById('modal-jornada-num');
        this.inpId = document.getElementById('inp-jornada-id');
        this.inpDate = document.getElementById('inp-date');
        this.inpMinHits = document.getElementById('inp-min-hits');
        this.teamsCache = [];
    }

    bindEvents() {
        if (this.btnNew) this.btnNew.addEventListener('click', () => this.openModalNew());
        if (this.btnClose) this.btnClose.addEventListener('click', () => this.closeModal());
        if (this.form) this.form.addEventListener('submit', (e) => this.saveJornada(e));
        if (this.btnEdit) this.btnEdit.addEventListener('click', () => this.toggleEditMode(true));
        if (this.btnDelete) this.btnDelete.addEventListener('click', () => this.deleteCurrentJornada());
        if (this.btnDeleteAll) this.btnDeleteAll.addEventListener('click', () => this.deleteAllJornadas());

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
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
            if (!j.active) return;

            // Filter: Only show jornadas on Sunday
            if (j.date && j.date.toLowerCase() !== 'por definir') {
                const dateObj = AppUtils.parseDate(j.date);
                if (dateObj && !AppUtils.isSunday(dateObj)) return;
            }

            const card = document.createElement('div');
            card.className = 'jornada-card';
            card.onclick = () => this.openModalView(j.id);

            const filledMatches = j.matches.filter(m => m.result).length;
            const hasTeams = j.matches.some(m => m.home !== '' || m.away !== '');

            const statusColor = filledMatches === 15 ? '#2e7d32' : '#f57f17';
            const statusText = filledMatches === 15 ? 'Finalizada' : (filledMatches > 0 ? 'En Juego' : 'Pendiente');

            if (!hasTeams) {
                // Using class for configurable empty state opacity/bg/border
                card.classList.add('jornada-empty');
            }

            card.innerHTML = `
                <div class="jornada-header">
                    <span class="jornada-number">Jornada ${j.number}</span>
                    <span class="jornada-date">${j.date}</span>
                </div>
                <div style="font-size:0.9rem; color:#555;">
                    <div class="jornada-season">${j.season}</div>
                    <div class="${filledMatches === 15 ? 'jornada-status-finished' : 'jornada-status-pending'}">${statusText}</div>
                    ${!hasTeams ? '<div style="font-size:0.8rem; color:#999; margin-top:0.2rem;">(Sin partidos definidos)</div>' : ''}
                </div>
            `;
            this.grid.appendChild(card);
        });
    }

    populateTeamsCache() {
        const teams = new Set();
        const commonTeams = [
            'Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Sevilla', 'Real Betis',
            'Real Sociedad', 'Athletic Club', 'Valencia', 'Villarreal', 'Girona', 'Osasuna',
            'Celta de Vigo', 'Mallorca', 'Rayo Vallecano', 'Getafe', 'Alavés', 'UD Las Palmas', 'Leganés',
            'Espanyol', 'Real Valladolid', 'Racing Santander', 'Eibar', 'Real Oviedo', 'Real Sporting',
            'Real Zaragoza', 'Burgos', 'Mirandés', 'Levante', 'Tenerife', 'Huesca', 'Albacete',
            'Cartagena', 'Ferrol', 'Castellón', 'Córdoba', 'Málaga'
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
    }

    openModalNew() {
        const nextNum = this.jornadas.length + 1;
        const newJornada = {
            id: Date.now(),
            number: nextNum,
            season: '2025-2026',
            date: 'Por definir',
            matches: Array(15).fill(null).map(() => ({ home: '', away: '', result: '' }))
        };
        this.currentJornadaId = newJornada.id;
        this.fillModalData(newJornada);
        this.toggleEditMode(true);
        this.modal.classList.add('active');

        this.btnDelete.style.display = 'none';
        this.btnEdit.style.display = 'none';
    }

    fillModalData(jornada) {
        this.modalTitleNum.textContent = jornada.number;
        this.inpId.value = jornada.id || '';
        this.inpDate.value = jornada.date;
        if (this.inpMinHits) this.inpMinHits.value = jornada.minHitsToWin || 10;
        this.renderMatches(jornada.matches);
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

            if (isPleno) {
                row.style.borderTop = '2px solid #ddd';
                row.style.marginTop = '10px';
                row.style.paddingTop = '10px';
            }

            if (!m) m = { home: '', away: '', result: '' }; // Safety fallback

            // Safe call to AppUtils
            const home = m.home || '';
            const away = m.away || '';
            const homeLogo = utilsAvailable ? AppUtils.getTeamLogo(home) : '';
            const awayLogo = utilsAvailable ? AppUtils.getTeamLogo(away) : '';

            row.innerHTML = `
                <span class="match-number">${isPleno ? 'P15' : idx + 1}</span>
                
                <div style="display:flex; align-items:center; flex:2; gap:5px;">
                    <img src="${homeLogo}" class="team-logo home-logo-img" onerror="this.style.display='none'" style="${homeLogo ? 'display:inline-block' : 'display:none'}">
                    <input type="text" placeholder="Local" class="inp-home" value="${home}" style="width:100%; box-sizing:border-box;">
                </div>

                <span style="color:#aaa; margin:0 5px;">-</span>

                <div style="display:flex; align-items:center; flex:2; gap:5px;">
                    <img src="${awayLogo}" class="team-logo away-logo-img" onerror="this.style.display='none'" style="${awayLogo ? 'display:inline-block' : 'display:none'}">
                    <input type="text" placeholder="Visitante" class="inp-away" value="${away}" style="width:100%; box-sizing:border-box;">
                </div>

                <input type="text" placeholder="Res" class="inp-res" value="${m.result || ''}" style="flex:0.5; text-align:center; font-weight:bold; color:var(--primary-green); min-width:40px;" maxlength="3">
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
        });
    }

    toggleEditMode(isEdit) {
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach(inp => {
            if (inp.id === 'inp-season') return;
            inp.readOnly = !isEdit;
            if (!isEdit) inp.style.border = 'none';
            else inp.style.border = '1px solid #ddd';
        });

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

        const jornadaData = {
            id: this.currentJornadaId || Date.now(),
            number: parseInt(this.modalTitleNum.textContent) || (this.jornadas.length + 1),
            season: '2025-2026',
            date: dateStr,
            minHitsToWin: parseInt(this.inpMinHits.value) || 10,
            matches: matches,
            active: true
        };

        if (existingIdx > -1) {
            this.jornadas[existingIdx] = jornadaData;
        } else {
            this.jornadas.push(jornadaData);
            this.currentJornadaId = jornadaData.id;
        }

        this.saveSingle(jornadaData);
        this.renderGrid();

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

    refreshData(silent = false) {
        // Warning: This reset logic is now removed. 
        // Use Import or Cloud Seed for initial data.
        alert("La función de restaurar datos 'hardcoded' se ha movido al proceso de carga inicial (CloudSeeder).");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.jornadaManager = new JornadaManager();
});
