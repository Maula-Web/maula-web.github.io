/**
 * SheetsImporter - Importador de pronósticos desde Google Sheets
 * Lee hojas públicas de Google Sheets via CSV export (sin API key).
 * Carpeta CAMPEONATO 2025-2026:
 *   https://drive.google.com/drive/folders/1e6AqHm8gDfJt4z979qmrJJbqHN6oWstk
 */

const SheetsImporter = (() => {

    // ─── Hojas conocidas de la carpeta de Drive (ID → metadata) ───────────────
    // Formato título: "Jornada XX - DD.MM.YYYY"
    const KNOWN_SHEETS = [
        { id: '1Jvfm9oTtBCSN1OIjWY59tP0zenJ0L_6-CTwiuVK53zo', title: 'Jornada 01 - 17.08.2025' },
        { id: '1zMBIWWvDp7twBfWAxwgFdtNnaZlE1Qu7bv0JpkCAdVU', title: 'Jornada 02 - 24.08.2025' },
        { id: '1tkZLfNer4qTxIYsh-jkp1200AZ13DREwFLXagYQX6EE', title: 'Jornada 03 - 31.08.2025' },
        { id: '1K2Skd7nFUZTsLO0AlTsCZ621MJI1sFjwXrYs6954iFw', title: 'Jornada 05 - 14.09.2025' },
        { id: '1BoukrEHJNmWjKS6dGa8EX9lhUAn0A4vANtY3fZssyhI', title: 'Jornada 07 - 21.09.2025' },
        { id: '1CTti2oQ9oiS_-BGkDEgeAzjpePK9FhCH64xuOsZGhU8', title: 'Jornada 09 - 28.09.2025' },
        { id: '1KSXSTRUa5PVp95p82N_jIb2K2N3j-7quVwj8X9bV_Uo', title: 'Jornada 11 - 05.10.2025' },
        { id: '1cnlSYJgAM3jt-QnO75GvRggeGkRfJ0QUcOX6GPXk6G8', title: 'Jornada 14 - 19.10.2025' },
        { id: '1S6Y6hiBBQaJOCkBgP8GAi3eerUQJxCxTJJofQ4dFqO4', title: 'Jornada 16 - 26.10.2025' },
        { id: '1BMlQOvez5piQ8GNvhhfLjz6axTIfA-AVlM3aJhE1Xv0', title: 'Jornada 17 - 02.11.2025' },
        { id: '1PA7zQRhzJ7w8EVjvOzdt47hUnA1fav4yTNtJvlaQHE4', title: 'Jornada 19 - 09.11.2025' },
        { id: '1JCBsjtCHvuDO72jWAxGHh2iIYQMSgoaDaZ1GU2c2lQI', title: 'Jornada 22 - 23.11.2025' },
        { id: '1uXeofNiVAWzn67xBCaaXz5YrwlMitQdZshRV3kue8RE', title: 'Jornada 24 - 30.11.2025' },
        { id: '1XNwR-Cf-zuoOqNWAwypo8VVASntSn0L_xIzwwfu6R0s', title: 'Jornada 26 - 07.12.2025' },
        { id: '1nsC93krT-zne2TjOMbmVvuO-msoQ_Qth30oVtppuqfQ', title: 'Jornada 28 - 14.12.2025' },
        { id: '1ED-ueSaRjgNlx-NM_mLmONvQzmNjy4P-p3kD6OSkA3Y', title: 'Jornada 30 - 21.12.2025' },
        { id: '16ehXQ1Z4GRuzeguPhlMBrT2TIIPtu9RPeRspmZIay00', title: 'Jornada 32 - 04.01.2026' },
        { id: '1KxlV9DPVXwONmZmZgIYtsKMTlwrCF1Qf3OA5Aq8bZ3c', title: 'Jornada 33 - 11.01.2026' },
        { id: '1jF3Ia4aVrVmCXGqkb8mn2hMiidCRRtjd9DTsgIsgABc', title: 'Jornada 35 - 18.01.2026' },
        { id: '1WoG4Y5KydJI5_y_cDCF5Y7KkaBjueL99SjXOHmShM50', title: 'Jornada 37 - 25.01.2026' },
        { id: '1lQ0K0eArpnVsg1_O-kf0R1E3UGuSVTSsKj5n34GZeu8', title: 'Jornada 39 - 01.02.2026' },
        { id: '1QO2WXJBMKQykl9sEEoMl9AYPiL6ovjnCDyjMB7uu9KI', title: 'Jornada 40 - 08.02.2026' },
        { id: '1UIoAAcPsCQ97B7XMQs5sO3jjTERhKH5rOvMxc06EDhY', title: 'Jornada 42 - 15.02.2026' },
        { id: '1gD5Jug_F6gvh4N62BBaAG9jySZM0y4RKBWPfp_m_Vcs', title: 'Jornada 44 - 22.02.2026' },
        { id: '13OEVNLFGyEd5MYVi5hQqubZeektH39M9cv6c3sgfLEE', title: 'Jornada 45 - 01.03.2026' },
        { id: '1k8iah0D6dO-of1b52MlSnO0CkjFGGWSj9UCFEHfGLN0', title: 'Jornada 46 - 08.03.2026' },
    ];

    // ─── Estado interno ────────────────────────────────────────────────────────
    let _pendingImport = null; // datos listos para confirmar e importar

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Construye la URL de exportación CSV para una pestaña de Google Sheets */
    function csvUrl(sheetId, tabName) {
        return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    }

    /** Descarga y parsea un CSV. Devuelve array de arrays de strings. */
    async function fetchCsv(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error HTTP ${res.status} al leer: ${url}`);
        const text = await res.text();
        return parseCsv(text);
    }

    /** Parser CSV básico que maneja comillas y comas dentro de campos */
    function parseCsv(text) {
        const rows = [];
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim() === '') continue;
            const cols = [];
            let inQuotes = false, cur = '';
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                    else inQuotes = !inQuotes;
                } else if (ch === ',' && !inQuotes) {
                    cols.push(cur.trim()); cur = '';
                } else {
                    cur += ch;
                }
            }
            cols.push(cur.trim());
            rows.push(cols);
        }
        return rows;
    }

    /** Extrae número de jornada y fecha del título de la hoja */
    function parseTitleMeta(title) {
        // "Jornada 44 - 22.02.2026" → { jornadaNum: 44, dateStr: "22.02.2026" }
        const m = title.match(/Jornada\s+(\d+)\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);
        if (!m) return null;
        return { jornadaNum: parseInt(m[1]), dateStr: m[2] };
    }

    /** Convierte "DD.MM.YYYY" → Date */
    function parseSheetDate(dateStr) {
        const [d, m, y] = dateStr.split('.');
        return new Date(`${y}-${m}-${d}`);
    }

    /**
     * Normaliza un nombre de equipo para comparación flexible.
     * Elimina puntos, acentos, mayúsculas, artículos comunes.
     */
    function normalizeTeam(name) {
        if (!name) return '';
        return name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\./g, '')
            .replace(/\b(cf|fc|rc|sd|ud|cd|rcd|ad|atletico|atletica|atletisme|real|sporting|racing|celta|rayo|betis|atletico de|de)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Compara dos nombres de equipo con tolerancia */
    function teamsMatch(a, b) {
        const na = normalizeTeam(a);
        const nb = normalizeTeam(b);
        if (na === nb) return true;
        // Containment check (uno contiene al otro y tienen long suficiente)
        if (na.length >= 3 && nb.length >= 3) {
            if (na.includes(nb) || nb.includes(na)) return true;
        }
        return false;
    }

    /**
     * Lee la pestaña "Partidos" y devuelve:
     * [ { home, away, result } ]  (15 partidos)
     */
    async function readPartidos(sheetId) {
        const rows = await fetchCsv(csvUrl(sheetId, 'Partidos'));
        // Fila 0 = cabecera (EQUIPO 1, EQUIPO 2, RESULTADO), filas 1..15 = datos
        const matches = [];
        for (let i = 1; i < rows.length && matches.length < 15; i++) {
            const [home = '', away = '', result = ''] = rows[i];
            if (!home && !away) continue; // fila vacía
            matches.push({ home: home.trim(), away: away.trim(), result: result.trim() });
        }
        return matches;
    }

    /**
     * Lee la pestaña "Pronósticos" y devuelve:
     * { memberName: [ '1','X','2', ... ] }  (15 signos)
     */
    async function readPronosticos(sheetId) {
        const rows = await fetchCsv(csvUrl(sheetId, 'Pronósticos'));
        if (rows.length < 2) return {};

        // Fila 0: col 0 = fecha/hora, col 1..N = nombres de socios
        const headerRow = rows[0];
        const memberNames = headerRow.slice(1).map(n => n.trim()).filter(n => n);

        const result = {};
        memberNames.forEach(name => { result[name] = []; });

        // Filas 1..15 (o hasta 17 con fila oculta) = partidos
        // Columna 0 = nombre partido, columnas 1..N = signos
        let matchCount = 0;
        for (let r = 1; r < rows.length && matchCount < 15; r++) {
            const row = rows[r];
            const partLabel = (row[0] || '').trim();
            // Ignorar filas vacías o sin etiqueta de partido
            if (!partLabel) continue;
            matchCount++;
            memberNames.forEach((name, colIdx) => {
                const sign = (row[colIdx + 1] || '').trim() || null;
                result[name].push(sign);
            });
        }

        return result;
    }

    /**
     * Busca en las jornadas de la BD la que corresponde al número de jornada
     * AND cuya fecha coincide aproximadamente (± 5 días) con la hoja.
     * Devuelve la jornada o null.
     */
    function matchJornada(allJornadas, jornadaNum, sheetDate) {
        // Primero intentar por número exacto
        const byNum = allJornadas.filter(j => parseInt(j.number) === jornadaNum);
        if (byNum.length === 0) return null;
        if (byNum.length === 1) return byNum[0];

        // Si hay varias (no debería), refinar por fecha
        return byNum.find(j => {
            const jd = window.AppUtils ? window.AppUtils.parseDate(j.date) : null;
            if (!jd) return false;
            const diff = Math.abs(jd - sheetDate);
            return diff < 5 * 24 * 3600 * 1000; // 5 días
        }) || byNum[0];
    }

    /**
     * Verifica que los partidos de la hoja coinciden (al menos 10 de 15)
     * con los de la jornada en la BD.
     */
    function verifyMatchesOverlap(sheetMatches, jornadaMatches) {
        if (!jornadaMatches || jornadaMatches.length === 0) return { ok: false, matched: 0 };
        let matched = 0;
        sheetMatches.forEach((sm, idx) => {
            const jm = jornadaMatches[idx];
            if (!jm) return;
            if (teamsMatch(sm.home, jm.home) && teamsMatch(sm.away, jm.away)) matched++;
        });
        return { ok: matched >= 10, matched };
    }

    /**
     * FUNCIÓN PRINCIPAL: analiza una hoja de Google Sheets y devuelve
     * los datos listos para importar (para mostrar en modal de confirmación).
     */
    async function analyzeSheet(sheetEntry) {
        const meta = parseTitleMeta(sheetEntry.title);
        if (!meta) throw new Error(`No se puede leer el título: ${sheetEntry.title}`);

        const sheetDate = parseSheetDate(meta.dateStr);

        // Cargar datos de la BD
        const [allJornadas, allMembers, allPronosticos] = await Promise.all([
            window.DataService.getAll('jornadas'),
            window.DataService.getAll('members'),
            window.DataService.getAll('pronosticos'),
        ]);

        // Buscar jornada en la BD
        const jornada = matchJornada(allJornadas, meta.jornadaNum, sheetDate);
        if (!jornada) {
            throw new Error(`No se encontró la Jornada ${meta.jornadaNum} en la base de datos.`);
        }

        // Leer datos de la hoja
        const [sheetMatches, sheetPronosticos] = await Promise.all([
            readPartidos(sheetEntry.id),
            readPronosticos(sheetEntry.id),
        ]);

        // Verificar que los partidos coinciden
        const overlap = verifyMatchesOverlap(sheetMatches, jornada.matches || []);
        if (!overlap.ok) {
            throw new Error(
                `Los partidos de la hoja (${sheetEntry.title}) no coinciden suficientemente con la Jornada ${meta.jornadaNum} de la BD. ` +
                `(${overlap.matched}/15 coincidentes, mínimo 10)`
            );
        }

        // Preparar lista de pronósticos a importar
        const toImport = [];
        const warnings = [];

        Object.entries(sheetPronosticos).forEach(([sheetMemberName, selection]) => {
            if (selection.length === 0) return;

            // Buscar socio en la BD por nombre exacto
            const member = allMembers.find(m => m.name === sheetMemberName);
            if (!member) {
                warnings.push(`⚠️ Socio no encontrado en la web: "${sheetMemberName}"`);
                return;
            }

            // Verificar que tiene al menos algún signo rellenado
            const filledCount = selection.filter(s => s && ['1', 'X', '2'].includes(s)).length;
            if (filledCount < 10) {
                warnings.push(`⚠️ ${sheetMemberName}: solo ${filledCount}/15 signos — se omite.`);
                return;
            }

            // Normalizar selección (null si no válido)
            const normalizedSel = selection.map(s => {
                if (s && ['1', 'X', '2'].includes(s)) return s;
                return null;
            });

            // ¿Ya tiene pronóstico en la web? (Excel prevalece siempre)
            const existingId = `${jornada.id}_${member.id}`;
            const existing = allPronosticos.find(p => p.id === existingId || (p.jId == jornada.id && p.mId == member.id));
            const hasExisting = !!existing;

            toImport.push({
                memberId: member.id,
                memberName: member.name,
                jornadaId: jornada.id,
                jornadaNum: jornada.number,
                selection: normalizedSel,
                overwrite: hasExisting,
                existingSelection: hasExisting ? existing.selection : null,
            });
        });

        return {
            sheetId: sheetEntry.id,
            sheetTitle: sheetEntry.title,
            jornadaNum: meta.jornadaNum,
            jornadaId: jornada.id,
            jornada,
            sheetMatches,
            matchedMatches: overlap.matched,
            toImport,
            warnings,
        };
    }

    /**
     * Ejecuta la importación real de los pronósticos ya confirmados.
     */
    async function executeImport(importData) {
        let saved = 0;
        const errors = [];

        for (const item of importData.toImport) {
            try {
                const record = {
                    id: `${item.jornadaId}_${item.memberId}`,
                    jId: item.jornadaId,
                    mId: item.memberId,
                    selection: item.selection,
                    isReduced: false,
                    timestamp: new Date().toISOString(),
                    late: false,
                    importedFromSheets: true,
                    sheetsSource: importData.sheetTitle,
                };
                await window.DataService.save('pronosticos', record);
                saved++;
            } catch (err) {
                errors.push(`Error guardando ${item.memberName}: ${err.message}`);
            }
        }

        return { saved, errors };
    }

    // ─── UI ───────────────────────────────────────────────────────────────────

    /** Abre el modal principal de selección de hoja */
    function openModal() {
        const modal = document.getElementById('sheets-importer-modal');
        if (!modal) { console.error('Modal sheets-importer-modal no encontrado'); return; }
        _pendingImport = null;
        document.getElementById('si-step-select').style.display = 'block';
        document.getElementById('si-step-loading').style.display = 'none';
        document.getElementById('si-step-confirm').style.display = 'none';
        document.getElementById('si-step-done').style.display = 'none';
        modal.style.display = 'flex';
    }

    function closeModal() {
        const modal = document.getElementById('sheets-importer-modal');
        if (modal) modal.style.display = 'none';
        _pendingImport = null;
    }

    async function handleSheetSelected() {
        const sel = document.getElementById('si-sheet-select');
        const sheetIdx = parseInt(sel.value);
        if (isNaN(sheetIdx)) return;

        const sheetEntry = KNOWN_SHEETS[sheetIdx];

        document.getElementById('si-step-select').style.display = 'none';
        document.getElementById('si-step-loading').style.display = 'flex';
        document.getElementById('si-loading-title').textContent = sheetEntry.title;

        try {
            const data = await analyzeSheet(sheetEntry);
            _pendingImport = data;
            renderConfirmStep(data);
            document.getElementById('si-step-loading').style.display = 'none';
            document.getElementById('si-step-confirm').style.display = 'block';
        } catch (err) {
            document.getElementById('si-step-loading').style.display = 'none';
            document.getElementById('si-step-select').style.display = 'block';
            alert(`❌ Error al leer la hoja:\n${err.message}`);
        }
    }

    function renderConfirmStep(data) {
        // Titulo
        document.getElementById('si-confirm-title').textContent =
            `${data.sheetTitle} → Jornada ${data.jornadaNum}`;

        // Resumen de partidos verificados
        document.getElementById('si-match-verification').textContent =
            `✅ Partidos verificados: ${data.matchedMatches}/15 coinciden con la BD`;

        // Tabla de pronósticos
        let html = `
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.08);">
                        <th style="padding:6px 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.15);">Socio</th>
                        <th style="padding:6px 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.15);">Pronóstico (15 signos)</th>
                        <th style="padding:6px 8px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Estado</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.toImport.forEach(item => {
            const signs = item.selection.map(s => s || '·').join(' ');
            const statusBadge = item.overwrite
                ? `<span style="background:rgba(255,152,0,0.2); color:#ffb74d; padding:2px 8px; border-radius:10px; font-size:0.75rem; border:1px solid #ff9800;">Sobreescribe</span>`
                : `<span style="background:rgba(76,175,80,0.2); color:#81c784; padding:2px 8px; border-radius:10px; font-size:0.75rem; border:1px solid #4caf50;">Nuevo</span>`;
            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:5px 8px; font-weight:bold;">${item.memberName}</td>
                    <td style="padding:5px 8px; font-family:monospace; letter-spacing:2px; color:#90caf9;">${signs}</td>
                    <td style="padding:5px 8px; text-align:center;">${statusBadge}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;

        if (data.warnings.length > 0) {
            html += `<div style="margin-top:12px; padding:10px; background:rgba(255,152,0,0.1); border:1px solid rgba(255,152,0,0.3); border-radius:8px; font-size:0.8rem; color:#ffcc80;">`;
            data.warnings.forEach(w => { html += `<div>${w}</div>`; });
            html += `</div>`;
        }

        document.getElementById('si-confirm-content').innerHTML = html;

        const totalNew = data.toImport.filter(i => !i.overwrite).length;
        const totalOver = data.toImport.filter(i => i.overwrite).length;
        document.getElementById('si-confirm-summary').textContent =
            `${data.toImport.length} pronósticos: ${totalNew} nuevos, ${totalOver} sobreescritos (Excel prevalece)`;
    }

    async function handleConfirmImport() {
        if (!_pendingImport) return;

        const btn = document.getElementById('si-btn-confirm');
        btn.disabled = true;
        btn.textContent = 'Importando...';

        try {
            const result = await executeImport(_pendingImport);
            document.getElementById('si-step-confirm').style.display = 'none';
            document.getElementById('si-step-done').style.display = 'block';
            document.getElementById('si-done-msg').innerHTML =
                `✅ <strong>${result.saved} pronósticos</strong> importados correctamente desde<br><em>${_pendingImport.sheetTitle}</em>`;

            if (result.errors.length > 0) {
                document.getElementById('si-done-msg').innerHTML +=
                    `<br><br>⚠️ Errores: ${result.errors.join(', ')}`;
            }

            // Log de acción
            try {
                const user = JSON.parse(sessionStorage.getItem('maulas_user'));
                if (user && window.Auth) {
                    await window.Auth.logAction(user.name, `Importó pronósticos desde Google Sheets: ${_pendingImport.sheetTitle} (${result.saved} socios)`);
                }
            } catch (_) { }

        } catch (err) {
            alert(`❌ Error durante la importación:\n${err.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '✅ Confirmar e Importar';
        }
    }

    // ─── Init público ─────────────────────────────────────────────────────────

    function init() {
        // Poblar el select de hojas
        const sel = document.getElementById('si-sheet-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Selecciona una jornada --</option>';
        KNOWN_SHEETS.forEach((sheet, idx) => {
            sel.innerHTML += `<option value="${idx}">${sheet.title}</option>`;
        });

        // Eventos
        document.getElementById('si-btn-close')?.addEventListener('click', closeModal);
        document.getElementById('si-btn-close-done')?.addEventListener('click', closeModal);
        document.getElementById('si-btn-cancel')?.addEventListener('click', () => {
            document.getElementById('si-step-confirm').style.display = 'none';
            document.getElementById('si-step-select').style.display = 'block';
            _pendingImport = null;
        });
        document.getElementById('si-btn-analyze')?.addEventListener('click', handleSheetSelected);
        document.getElementById('si-btn-confirm')?.addEventListener('click', handleConfirmImport);

        // Cerrar al hacer clic fuera
        document.getElementById('sheets-importer-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });
    }

    return { init, openModal, closeModal, KNOWN_SHEETS };
})();

window.SheetsImporter = SheetsImporter;
