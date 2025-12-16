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
                document.getElementById('current-datetime').textContent = finalStr;
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
            // Sort by Number? Or Date? Number is safest for Official ID.
            return a.number - b.number;
        });

        sortedJornadas.forEach(j => {
            if (!j.active) return;

            // Filter: Only show jornadas on Sunday
            if (j.date && j.date.toLowerCase() !== 'por definir') {
                let dateObj = null;
                const clean = j.date.replace(/\(.*\)/, '').replace(/ de /g, ' ').trim();

                // Try format "dd mm yyyy" (from "17 agosto 2025")
                const parts = clean.split(' ');
                if (parts.length >= 3) {
                    // Check if part[1] is text month
                    if (isNaN(parseInt(parts[1]))) {
                        const day = parseInt(parts[0]);
                        const year = parseInt(parts[parts.length - 1]);
                        const monthStr = parts[1].toLowerCase();
                        const months = {
                            'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
                            'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
                        };
                        dateObj = new Date(year, months[monthStr] || 0, day);
                    }
                }

                // Try format "dd/mm/yyyy"
                if (!dateObj || isNaN(dateObj.getTime())) {
                    const partsSlash = j.date.split('/');
                    if (partsSlash.length === 3) {
                        dateObj = new Date(partsSlash[2], partsSlash[1] - 1, partsSlash[0]);
                    }
                }

                if (dateObj && !isNaN(dateObj.getTime())) {
                    if (dateObj.getDay() !== 0) return; // 0 = Sunday
                }
            }

            const card = document.createElement('div');
            card.className = 'jornada-card';
            card.onclick = () => this.openModalView(j.id);

            const filledMatches = j.matches.filter(m => m.result).length;
            const hasTeams = j.matches.some(m => m.home !== '' || m.away !== '');

            const statusColor = filledMatches === 15 ? '#2e7d32' : '#f57f17';
            const statusText = filledMatches === 15 ? 'Finalizada' : (filledMatches > 0 ? 'En Juego' : 'Pendiente');

            // Visual diff for empty jornadas
            if (!hasTeams) {
                card.style.opacity = '0.6';
                card.style.backgroundColor = '#f9f9f9';
                card.style.border = '1px dashed #ccc';
            }

            card.innerHTML = `
                <div class="jornada-header">
                    <span class="jornada-number">Jornada ${j.number}</span>
                    <span class="jornada-date">${j.date}</span>
                </div>
                <div style="font-size:0.9rem; color:#555;">
                    <div>${j.season}</div>
                    <div style="color:${statusColor}; font-weight:500; margin-top:0.5rem;">${statusText}</div>
                    ${!hasTeams ? '<div style="font-size:0.8rem; color:#999; margin-top:0.2rem;">(Sin partidos definidos)</div>' : ''}
                </div>
            `;
            this.grid.appendChild(card);
        });
    }

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
        this.renderMatches(jornada.matches);
    }

    renderMatches(matches) {
        this.matchesContainer.innerHTML = '';
        matches.forEach((m, idx) => {
            const isPleno = idx === 14;
            const row = document.createElement('div');
            row.className = 'match-row';
            row.style.alignItems = 'center';

            if (isPleno) {
                row.style.borderTop = '2px solid #ddd';
                row.style.marginTop = '10px';
                row.style.paddingTop = '10px';
            }

            const homeLogo = this.getTeamLogo(m.home);
            const awayLogo = this.getTeamLogo(m.away);

            row.innerHTML = `
                <span class="match-number">${isPleno ? 'P15' : idx + 1}</span>
                
                <div style="display:flex; align-items:center; flex:2; gap:5px;">
                    <img src="${homeLogo}" class="team-logo home-logo-img" onerror="this.style.display='none'">
                    <input type="text" placeholder="Local" class="inp-home" value="${m.home}" style="width:100%; box-sizing:border-box;">
                </div>

                <span style="color:#aaa; margin:0 5px;">-</span>

                <div style="display:flex; align-items:center; flex:2; gap:5px;">
                    <img src="${awayLogo}" class="team-logo away-logo-img" onerror="this.style.display='none'">
                    <input type="text" placeholder="Visitante" class="inp-away" value="${m.away}" style="width:100%; box-sizing:border-box;">
                </div>

                <input type="text" placeholder="Res" class="inp-res" value="${m.result}" style="flex:0.5; text-align:center; font-weight:bold; color:var(--primary-green); min-width:40px;" maxlength="3">
            `;

            // Add listeners for dynamic logo updates
            const inpHome = row.querySelector('.inp-home');
            const imgHome = row.querySelector('.home-logo-img');
            inpHome.addEventListener('input', (e) => {
                const src = this.getTeamLogo(e.target.value);
                imgHome.src = src;
                imgHome.style.display = src ? 'inline-block' : 'none';
            });

            const inpAway = row.querySelector('.inp-away');
            const imgAway = row.querySelector('.away-logo-img');
            inpAway.addEventListener('input', (e) => {
                const src = this.getTeamLogo(e.target.value);
                imgAway.src = src;
                imgAway.style.display = src ? 'inline-block' : 'none';
            });

            this.matchesContainer.appendChild(row);
        });
    }

    getTeamLogo(teamName) {
        if (!teamName) return '';

        // Normalize name for mapping
        const t = teamName.toLowerCase().trim();

        const map = {
            'alavés': 'escudos/primera/Escudo-Deportivo-Alavés-S.A.D..jpg',
            'alaves': 'escudos/primera/Escudo-Deportivo-Alavés-S.A.D..jpg',
            'almeria': 'escudos/segunda/ALMERIA.jpg',
            'almería': 'escudos/segunda/ALMERIA.jpg',
            'athletic club': 'escudos/primera/ATHLETIC_BILBAO-150x150.jpg',
            'athletic': 'escudos/primera/ATHLETIC_BILBAO-150x150.jpg',
            'at. madrid': 'escudos/primera/ATLÉTICO_MADRID-150x150.jpg',
            'atlético de madrid': 'escudos/primera/ATLÉTICO_MADRID-150x150.jpg',
            'atlético': 'escudos/primera/ATLÉTICO_MADRID-150x150.jpg',
            'barcelona': 'escudos/primera/BARCELONA-150x150.jpg',
            'betis': 'escudos/primera/REAL-BETIS-150x150.jpg',
            'real betis': 'escudos/primera/REAL-BETIS-150x150.jpg',
            'celta': 'escudos/primera/CELTA-150x150.jpg',
            'celta de vigo': 'escudos/primera/CELTA-150x150.jpg',
            'elche': 'escudos/primera/ELCHE-150x150.jpg',
            'espanyol': 'escudos/primera/ESPANYOL-150x150.jpg',
            'getafe': 'escudos/primera/GETAFE-150x150.jpg',
            'girona': 'escudos/primera/Escudo-Girona-FC-2022.jpg',
            'las palmas': 'escudos/segunda/LAS-PALMAS-150x150.jpg',
            'levante': 'escudos/primera/LEVANTE-150x150.jpg',
            'mallorca': 'escudos/primera/MALLORCA-150x150.jpg',
            'osasuna': 'escudos/primera/OSASUNA-150x150.jpg',
            'rayo vallecano': 'escudos/primera/RAYO-VALLECANO-150x150.jpg',
            'rayo': 'escudos/primera/RAYO-VALLECANO-150x150.jpg',
            'real madrid': 'escudos/primera/REAL-MADRID-150x150.jpg',
            'real sociedad': 'escudos/primera/REAL-SOCIEDAD-150x150.jpg',
            'sevilla': 'escudos/primera/SEVILLA-150x150.jpg',
            'valencia': 'escudos/primera/VALENCIA-150x150.jpg',
            'valladolid': 'escudos/segunda/Escudo-Real-Valladolid-CF.jpg',
            'real valladolid': 'escudos/segunda/Escudo-Real-Valladolid-CF.jpg',
            'villarreal': 'escudos/primera/VILLARREAL-150x150.jpg',

            // Segunda
            'albacete': 'escudos/segunda/ALBACETE-150x150.jpg',
            'andorra': 'escudos/segunda/ANDORRA-150x150.jpg',
            'burgos': 'escudos/segunda/BURGOS-150x150.jpg',
            'cádiz': 'escudos/segunda/CADIZ-150x150.jpg',
            'cadiz': 'escudos/segunda/CADIZ-150x150.jpg',
            'castellón': 'escudos/segunda/CASTELLON-150x150.jpg',
            'castellon': 'escudos/segunda/CASTELLON-150x150.jpg',
            'ceuta': 'escudos/segunda/Escudo-AgD-Ceuta-FC-150x150.jpg',
            'córdoba': 'escudos/segunda/CORDOBA-150x150.jpg',
            'cordoba': 'escudos/segunda/CORDOBA-150x150.jpg',
            'cultural leonesa': 'escudos/segunda/CULTURAL-150x150.jpg',
            'cultural': 'escudos/segunda/CULTURAL-150x150.jpg',
            'deportivo': 'escudos/segunda/DEPORTIVO-150x150.jpg',
            'depor': 'escudos/segunda/DEPORTIVO-150x150.jpg',
            'eibar': 'escudos/segunda/EIBAR-150x150.jpg',
            'granada': 'escudos/segunda/GRANADA-150x150.jpg',
            'huesca': 'escudos/segunda/HUESCA-150x150.jpg',
            'leganés': 'escudos/segunda/LEGANES-150x150.jpg',
            'leganes': 'escudos/segunda/LEGANES-150x150.jpg',
            'málaga': 'escudos/segunda/MALAGA-150x150.jpg',
            'malaga': 'escudos/segunda/MALAGA-150x150.jpg',
            'mirandés': 'escudos/segunda/MIRANDES-150x150.jpg',
            'mirandes': 'escudos/segunda/MIRANDES-150x150.jpg',
            'racing santander': 'escudos/segunda/REAL-RACING-150x150.jpg',
            'racing de santander': 'escudos/segunda/REAL-RACING-150x150.jpg',
            'racing': 'escudos/segunda/REAL-RACING-150x150.jpg',
            'r. oviedo': 'escudos/primera/REAL-OVIEDO-150x150.jpg',
            'real oviedo': 'escudos/primera/REAL-OVIEDO-150x150.jpg',
            'oviedo': 'escudos/primera/REAL-OVIEDO-150x150.jpg',
            'sporting': 'escudos/segunda/REAL-SPORTING-150x150.jpg',
            'real sporting': 'escudos/segunda/REAL-SPORTING-150x150.jpg',
            'r. zaragoza': 'escudos/segunda/REAL-ZARAGOZA-150x150.jpg',
            'real zaragoza': 'escudos/segunda/REAL-ZARAGOZA-150x150.jpg',
            'zaragoza': 'escudos/segunda/REAL-ZARAGOZA-150x150.jpg'
        };

        return map[t] || '';
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
            document.getElementById('modal-mode-badge').textContent = "Editando";
        } else {
            this.btnEdit.style.display = 'inline-block';
            this.btnSave.style.display = 'none';
            this.btnDelete.style.display = 'none';
            document.getElementById('modal-mode-badge').textContent = "Vista";
        }
    }

    saveJornada(e) {
        e.preventDefault();

        // VALIDATE DATE IS SUNDAY
        const dateStr = this.inpDate.value;
        const dateObj = this.parseDateString(dateStr);

        if (!dateObj || isNaN(dateObj.getTime())) {
            alert('Formato de fecha inválido. Usa "dd/mm/yyyy" o "dd de mes de yyyy".');
            return;
        }

        if (dateObj.getDay() !== 0) {
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
            matches: matches,
            active: true
        };

        if (existingIdx > -1) {
            this.jornadas[existingIdx] = jornadaData;
        } else {
            // Updated logic for new Jornada
            this.jornadas.push(jornadaData);
            this.currentJornadaId = jornadaData.id;
        }

        // Optimized save
        this.saveSingle(jornadaData);
        this.renderGrid();

        // Feedback visual
        const originalText = this.btnSave.innerHTML;
        this.btnSave.innerHTML = '✅ Guardado';
        this.btnSave.disabled = true;
        setTimeout(() => {
            this.btnSave.innerHTML = originalText;
            this.btnSave.disabled = false;
        }, 1500);
    }

    parseDateString(dateStr) {
        if (!dateStr || dateStr.toLowerCase() === 'por definir') return null;

        try {
            // Try standard "24/08/2025"
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
            }

            // Try "24 de agosto de 2025"
            const clean = dateStr.replace(/\(.*\)/, '').replace(/ de /g, ' ').trim();
            const parts = clean.split(' ');
            if (parts.length >= 3) {
                const day = parseInt(parts[0]);
                const year = parseInt(parts[parts.length - 1]);
                const monthStr = parts[1].toLowerCase();
                const months = {
                    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
                    'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
                };
                if (months.hasOwnProperty(monthStr)) {
                    return new Date(year, months[monthStr], day);
                }
            }
        } catch (e) { return null; }
        return null;
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
        // Saving all - iterating
        if (!window.DataService) return;
        for (const j of this.jornadas) {
            await window.DataService.save('jornadas', j);
        }
    }

    // Optimization: Add specific save method for single edits
    async saveSingle(jornada) {
        if (!window.DataService) return;
        await window.DataService.save('jornadas', jornada);
    }

    refreshData(silent = false) {
        if (!silent && !confirm('¿Importar DATOS REALES del fichero auxiliar? \n- Se sustituirán las jornadas por las oficiales.\n- Se generará calendario futuro desde Dic 2025.')) return;

        this.jornadas = [];

        // Hardcoded Data from DATOS_2025-2026.txt
        const textData = [
            {
                num: 1, date: '17/08/2025',
                matches: [
                    { h: 'Girona', a: 'Rayo Vallecano', r: '2' }, { h: 'Villarreal', a: 'R. Oviedo', r: '1' }, { h: 'Alavés', a: 'Levante', r: '1' },
                    { h: 'Mallorca', a: 'Barcelona', r: '2' }, { h: 'Valencia', a: 'Real Sociedad', r: 'X' }, { h: 'Celta', a: 'Getafe', r: '2' },
                    { h: 'Athletic Club', a: 'Sevilla', r: '1' }, { h: 'Espanyol', a: 'At. Madrid', r: '1' }, { h: 'Racing Santander', a: 'Castellón', r: '1' },
                    { h: 'Málaga', a: 'Eibar', r: 'X' }, { h: 'Granada', a: 'Deportivo', r: '2' }, { h: 'Cádiz', a: 'Mirandés', r: '1' },
                    { h: 'Huesca', a: 'Leganés', r: 'X' }, { h: 'Las Palmas', a: 'Andorra', r: 'X' }, { h: 'Elche', a: 'Betis', r: '1-1' }
                ]
            },
            {
                num: 2, date: '24/08/2025',
                matches: [
                    { h: 'Mallorca', a: 'Celta', r: 'X' }, { h: 'At. Madrid', a: 'Elche', r: 'X' }, { h: 'Levante', a: 'Barcelona', r: '2' },
                    { h: 'Osasuna', a: 'Valencia', r: '1' }, { h: 'Real Sociedad', a: 'Espanyol', r: 'X' }, { h: 'Villarreal', a: 'Girona', r: '1' },
                    { h: 'R. Oviedo', a: 'Real Madrid', r: '2' }, { h: 'Athletic Club', a: 'Rayo Vallecano', r: '1' }, { h: 'Mirandés', a: 'Huesca', r: '2' },
                    { h: 'Ceuta', a: 'Sporting', r: '2' }, { h: 'R. Zaragoza', a: 'Andorra', r: '2' }, { h: 'Deportivo', a: 'Burgos', r: 'X' },
                    { h: 'Cultural Leonesa', a: 'Almería', r: '2' }, { h: 'Albacete', a: 'Racing Santander', r: '2' }, { h: 'Sevilla', a: 'Getafe', r: '1-2' }
                ]
            },
            {
                num: 3, date: '31/08/2025',
                matches: [
                    { h: 'Alavés', a: 'At. Madrid', r: 'X' }, { h: 'R. Oviedo', a: 'Real Sociedad', r: '1' }, { h: 'Girona', a: 'Sevilla', r: '2' },
                    { h: 'Real Madrid', a: 'Mallorca', r: '1' }, { h: 'Celta', a: 'Villarreal', r: 'X' }, { h: 'Betis', a: 'Athletic Club', r: '2' },
                    { h: 'Espanyol', a: 'Osasuna', r: '1' }, { h: 'Racing Santander', a: 'Ceuta', r: '1' }, { h: 'Valladolid', a: 'Córdoba', r: 'X' },
                    { h: 'Castellón', a: 'Zaragoza', r: 'X' }, { h: 'Andorra', a: 'Burgos', r: '1' }, { h: 'Cádiz', a: 'Albacete', r: '1' },
                    { h: 'Las Palmas', a: 'Málaga', r: '2' }, { h: 'Granada', a: 'Mirandés', r: '2' }, { h: 'Rayo Vallecano', a: 'Barcelona', r: '1-1' }
                ]
            },
            {
                num: 5, date: '14/09/2025',
                matches: [
                    { h: 'Alavés', a: 'At. Madrid', r: 'X' }, { h: 'R. Oviedo', a: 'Real Sociedad', r: '1' }, { h: 'Girona', a: 'Sevilla', r: '2' },
                    { h: 'Real Madrid', a: 'Mallorca', r: '1' }, { h: 'Celta', a: 'Villarreal', r: '2' }, { h: 'Betis', a: 'Athletic Club', r: '1' },
                    { h: 'Espanyol', a: 'Osasuna', r: '1' }, { h: 'Racing Santander', a: 'Ceuta', r: '1' }, { h: 'Valladolid', a: 'Córdoba', r: '1' },
                    { h: 'Castellón', a: 'R. Zaragoza', r: 'X' }, { h: 'Andorra', a: 'Burgos', r: '1' }, { h: 'Cádiz', a: 'Albacete', r: '1' },
                    { h: 'Las Palmas', a: 'Málaga', r: 'X' }, { h: 'Granada', a: 'Mirandés', r: 'X' }, { h: 'Rayo Vallecano', a: 'Barcelona', r: '1' }
                ]
            },
            {
                num: 7, date: '21/09/2025',
                matches: [
                    { h: 'Alavés', a: 'Sevilla', r: '2' }, { h: 'Barcelona', a: 'Getafe', r: '1' }, { h: 'Betis', a: 'Real Sociedad', r: '1' },
                    { h: 'Elche', a: 'R. Oviedo', r: '1' }, { h: 'Girona', a: 'Levante', r: '2' }, { h: 'Mallorca', a: 'At. Madrid', r: 'X' },
                    { h: 'Rayo Vallecano', a: 'Celta', r: 'X' }, { h: 'Real Madrid', a: 'Espanyol', r: '1' }, { h: 'Villarreal', a: 'Osasuna', r: '1' },
                    { h: 'Albacete', a: 'Valladolid', r: '1' }, { h: 'Córdoba', a: 'Racing De Santander', r: 'X' }, { h: 'Deportivo', a: 'Huesca', r: '1' },
                    { h: 'Almería', a: 'Sporting', r: '1' }, { h: 'Málaga', a: 'Cádiz', r: '2' }, { h: 'Valencia', a: 'Athletic Club', r: '2-0' }
                ]
            },
            {
                num: 9, date: '28/09/2025',
                matches: [
                    { h: 'Getafe', a: 'Levante', r: 'X' }, { h: 'Mallorca', a: 'Alavés', r: '1' }, { h: 'Villarreal', a: 'Athletic Club', r: '1' },
                    { h: 'Rayo Vallecano', a: 'Sevilla', r: '2' }, { h: 'Elche', a: 'Celta', r: '1' }, { h: 'Betis', a: 'Osasuna', r: '1' },
                    { h: 'Barcelona', a: 'Real Sociedad', r: '1' }, { h: 'Valencia', a: 'R. Oviedo', r: '1' }, { h: 'Eibar', a: 'Deportivo', r: 'X' },
                    { h: 'Racing Santander', a: 'Andorra', r: '2' }, { h: 'Las Palmas', a: 'Almería', r: '2' }, { h: 'Burgos', a: 'Málaga', r: '1' },
                    { h: 'Cádiz', a: 'Ceuta', r: 'X' }, { h: 'Sporting', a: 'Albacete', r: '2' }, { h: 'At. Madrid', a: 'Real Madrid', r: 'M-2' }
                ]
            },
            {
                num: 11, date: '05/10/2025',
                matches: [
                    { h: 'R. Oviedo', a: 'Levante', r: '2' }, { h: 'Girona', a: 'Valencia', r: '1' }, { h: 'Athletic Club', a: 'Mallorca', r: '1' },
                    { h: 'Real Madrid', a: 'Villarreal', r: '1' }, { h: 'Sevilla', a: 'Barcelona', r: '1' }, { h: 'Alavés', a: 'Elche', r: '1' },
                    { h: 'Espanyol', a: 'Betis', r: '2' }, { h: 'Real Sociedad', a: 'Rayo Vallecano', r: '2' }, { h: 'Deportivo', a: 'Almería', r: 'X' },
                    { h: 'Andorra', a: 'Leganés', r: '2' }, { h: 'Huesca', a: 'Burgos', r: '1' }, { h: 'R. Zaragoza', a: 'Córdoba', r: '2' },
                    { h: 'Racing Santander', a: 'Málaga', r: '1' }, { h: 'Las Palmas', a: 'Cádiz', r: '1' }, { h: 'Celta', a: 'At. Madrid', r: '1-1' }
                ]
            },
            {
                num: 14, date: '19/10/2025',
                matches: [
                    { h: 'Sevilla', a: 'Mallorca', r: '2' }, { h: 'Barcelona', a: 'Girona', r: '1' }, { h: 'Villarreal', a: 'Betis', r: 'X' },
                    { h: 'At. Madrid', a: 'Osasuna', r: '1' }, { h: 'Elche', a: 'Athletic Club', r: 'X' }, { h: 'Celta', a: 'Real Sociedad', r: 'X' },
                    { h: 'Levante', a: 'Rayo Vallecano', r: '2' }, { h: 'Getafe', a: 'Real Madrid', r: '2' }, { h: 'R. Zaragoza', a: 'Cultural Leonesa', r: '2' },
                    { h: 'Leganés', a: 'Málaga', r: '1' }, { h: 'Castellón', a: 'Albacete', r: '2' }, { h: 'Valladolid', a: 'Sporting', r: '2' },
                    { h: 'Racing Santander', a: 'Deportivo', r: '1' }, { h: 'Córdoba', a: 'Almería', r: 'X' }, { h: 'Alavés', a: 'Valencia', r: '0-0' }
                ]
            },
            {
                num: 16, date: '26/10/2025',
                matches: [
                    { h: 'Girona', a: 'R. Oviedo', r: 'X' }, { h: 'Espanyol', a: 'Elche', r: '1' }, { h: 'Athletic Club', a: 'Getafe', r: '2' },
                    { h: 'Valencia', a: 'Villarreal', r: '2' }, { h: 'Mallorca', a: 'Levante', r: 'X' }, { h: 'Osasuna', a: 'Celta', r: '2' },
                    { h: 'Rayo Vallecano', a: 'Alavés', r: '1' }, { h: 'Betis', a: 'At. Madrid', r: '2' }, { h: 'Granada', a: 'Cádiz', r: 'X' },
                    { h: 'Mirandés', a: 'Racing Santander', r: '2' }, { h: 'Málaga', a: 'Andorra', r: '1' }, { h: 'Sporting', a: 'R. Zaragoza', r: '1' },
                    { h: 'Almería', a: 'Castellón', r: '1' }, { h: 'Deportivo', a: 'Valladolid', r: 'X' }, { h: 'Real Madrid', a: 'Barcelona', r: '2-1' }
                ]
            },
            {
                num: 17, date: '02/11/2025',
                matches: [
                    { h: 'Villarreal', a: 'Rayo Vallecano', r: '1' }, { h: 'At. Madrid', a: 'Sevilla', r: '1' }, { h: 'Real Madrid', a: 'Valencia', r: '1' },
                    { h: 'Levante', a: 'Celta', r: '2' }, { h: 'Alavés', a: 'Espanyol', r: '1' }, { h: 'Barcelona', a: 'Elche', r: '1' },
                    { h: 'Betis', a: 'Mallorca', r: '1' }, { h: 'R. Oviedo', a: 'Osasuna', r: 'X' }, { h: 'Leganés', a: 'Burgos', r: '2' },
                    { h: 'Almería', a: 'Eibar', r: '1' }, { h: 'Andorra', a: 'Cádiz', r: 'X' }, { h: 'Sporting', a: 'Las Palmas', r: 'X' },
                    { h: 'Castellón', a: 'Málaga', r: '1' }, { h: 'R. Zaragoza', a: 'Deportivo', r: '2' }, { h: 'Real Sociedad', a: 'Athletic Club', r: 'M-2' }
                ]
            },
            {
                num: 19, date: '09/11/2025',
                matches: [
                    { h: 'Girona', a: 'Alavés', r: '1' }, { h: 'Sevilla', a: 'Osasuna', r: '1' }, { h: 'At. Madrid', a: 'Levante', r: '1' },
                    { h: 'Espanyol', a: 'Villarreal', r: '2' }, { h: 'Athletic Club', a: 'R. Oviedo', r: '1' }, { h: 'Valencia', a: 'Betis', r: 'X' },
                    { h: 'Mallorca', a: 'Getafe', r: '1' }, { h: 'Celta', a: 'Barcelona', r: '2' }, { h: 'Huesca', a: 'Andorra', r: 'X' },
                    { h: 'Málaga', a: 'Córdoba', r: 'X' }, { h: 'Las Palmas', a: 'Racing De Santander', r: '1' }, { h: 'Ceuta', a: 'Almería', r: 'X' },
                    { h: 'Granada', a: 'R. Zaragoza', r: '1' }, { h: 'Cádiz', a: 'Valladolid', r: 'X' }, { h: 'Rayo Vallecano', a: 'Real Madrid', r: '0-0' }
                ]
            },
            {
                num: 22, date: '23/11/2025',
                matches: [
                    { h: 'Alavés', a: 'Celta', r: '2' }, { h: 'Barcelona', a: 'Athletic Club', r: '1' }, { h: 'Osasuna', a: 'Real Sociedad', r: '2' },
                    { h: 'Villarreal', a: 'Mallorca', r: '1' }, { h: 'R. Oviedo', a: 'Rayo Vallecano', r: 'X' }, { h: 'Betis', a: 'Girona', r: 'X' },
                    { h: 'Getafe', a: 'At. Madrid', r: '2' }, { h: 'Elche', a: 'Real Madrid', r: 'X' }, { h: 'Leganés', a: 'Almería', r: '2' },
                    { h: 'Granada', a: 'Córdoba', r: 'X' }, { h: 'Deportivo', a: 'Ceuta', r: '1' }, { h: 'Huesca', a: 'Sporting', r: '1' },
                    { h: 'Burgos', a: 'Racing Santander', r: '2' }, { h: 'Málaga', a: 'Mirandés', r: '1' }, { h: 'Espanyol', a: 'Sevilla', r: '2-1' }
                ]
            },
            {
                num: 24, date: '30/11/2025',
                matches: [
                    { h: 'Mallorca', a: 'Osasuna', r: 'X' }, { h: 'Barcelona', a: 'Alavés', r: '1' }, { h: 'Levante', a: 'Athletic Club', r: '2' },
                    { h: 'At. Madrid', a: 'R. Oviedo', r: '1' }, { h: 'Real Sociedad', a: 'Villarreal', r: '2' }, { h: 'Sevilla', a: 'Betis', r: '2' },
                    { h: 'Celta', a: 'Espanyol', r: '2' }, { h: 'Girona', a: 'Real Madrid', r: 'X' }, { h: 'Ceuta', a: 'Burgos', r: '1' },
                    { h: 'Albacete', a: 'Deportivo', r: '2' }, { h: 'Valladolid', a: 'Málaga', r: 'X' }, { h: 'R. Zaragoza', a: 'Leganés', r: '1' },
                    { h: 'Córdoba', a: 'Cádiz', r: '2' }, { h: 'Castellón', a: 'Las Palmas', r: '1' }, { h: 'Rayo Vallecano', a: 'Valencia', r: '1-1' }
                ]
            },
            {
                num: 26, date: '07/12/2025',
                matches: [
                    { h: 'Villarreal', a: 'Getafe', r: '1' }, { h: 'Alavés', a: 'Real Sociedad', r: '1' }, { h: 'Betis', a: 'Barcelona', r: '2' },
                    { h: 'Elche', a: 'Girona', r: '1' }, { h: 'Valencia', a: 'Sevilla', r: 'X' }, { h: 'Espanyol', a: 'Rayo Vallecano', r: '' },
                    { h: 'Real Madrid', a: 'Celta', r: '' }, { h: 'Osasuna', a: 'Levante', r: '' }, { h: 'Andorra', a: 'Almería', r: '2' },
                    { h: 'Huesca', a: 'Valladolid', r: '2' }, { h: 'Cádiz', a: 'Racing Santander', r: '2' }, { h: 'Leganés', a: 'Córdoba', r: 'X' },
                    { h: 'Deportivo', a: 'Castellón', r: '' }, { h: 'Granada', a: 'Ceuta', r: '' }, { h: 'Athletic Club', a: 'At. Madrid', r: '1-0' }
                ]
            }
        ];

        // Process Historical
        textData.forEach(jd => {
            // Convert dd/mm/yyyy to human readable ?? Or keep date string?
            // User's app uses "07 diciembre 2025" style. 
            // I should try to parse and format.
            const parts = jd.date.split('/'); // dd, mm, yyyy
            const dObj = new Date(parts[2], parts[1] - 1, parts[0]);
            const dateStr = dObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

            let cleanMatches = Array(15).fill(null).map(() => ({ home: '', away: '', result: '' }));
            if (jd.matches && jd.matches.length > 0) {
                jd.matches.forEach((m, i) => {
                    if (i < 15) cleanMatches[i] = { home: m.h, away: m.a, result: m.r };
                });
            }

            this.jornadas.push({
                id: Date.now() + jd.num,
                number: jd.num,
                season: '2025-2026',
                date: dateStr,
                matches: cleanMatches,
                active: true
            });
        });

        // FUTURE GENERATION (From Dec 2025 to May 2026)
        // Last one is J26 (Dec 7).
        // Let's generate from Dec 14 onwards.
        let futureDate = new Date(2025, 11, 14); // Dec 14
        let futureNum = 27; // Continue numbering
        const seasonEnd = new Date(2026, 4, 30);

        while (futureDate <= seasonEnd) {
            let cleanMatches = Array(15).fill(null).map(() => ({ home: '', away: '', result: '' }));

            // Check if date corresponds to Xmas break? 
            // Normally break is ~Dec 22 to Jan 2.
            const isXmas = (futureDate.getMonth() === 11 && futureDate.getDate() > 21) || (futureDate.getMonth() === 0 && futureDate.getDate() < 4);

            if (!isXmas) {
                const dStr = futureDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

                this.jornadas.push({
                    id: Date.now() + futureNum,
                    number: futureNum,
                    season: '2025-2026',
                    date: dStr,
                    matches: cleanMatches,
                    active: true
                });
                futureNum++;
            }

            futureDate.setDate(futureDate.getDate() + 7); // Next Sunday
        }

        // Final Sort by ID/Num
        this.jornadas.sort((a, b) => a.number - b.number);

        if (typeof importHistoricalData === 'function') {
            importHistoricalData();
        }

        this.saveToStorage();
        if (!silent) alert('Datos REALES 2025-2026 importados correctamente.');
        this.renderGrid();
    }
}

const jornadaManager = new JornadaManager();
