const FONT_OPTIONS = [
    { value: "'Inter', sans-serif", label: 'Inter (Moderno)' },
    { value: "'Montserrat', sans-serif", label: 'Montserrat (Premium)' },
    { value: "'Outfit', sans-serif", label: 'Outfit (Geométrico)' },
    { value: "'Raleway', sans-serif", label: 'Raleway (Elegante)' },
    { value: "'Playfair Display', serif", label: 'Playfair (Clásico)' },
    { value: "system-ui, sans-serif", label: 'Sistema (Nativo)' }
];

const ThemeEditor = {
    // Definición completa de todas las variables configurables
    groups: {
        'ui': [
            { id: '--main-bg', label: 'Fondo Principal' },
            { id: '--modal-bg', label: 'Fondo Ventanas/Modales' },
            { id: '--modal-header-bg', label: 'Fondo Cabecera Modal (Sticky)' },
            { id: '--card-bg', label: 'Fondo Tarjetas (Stats)' },
            { id: '--text-main', label: 'Texto Principal', isText: true },
            { id: '--text-secondary', label: 'Texto Secundario', isText: true },
            { id: '--input-bg', label: 'Fondo de Inputs' },
            { id: '--input-border', label: 'Borde de Inputs' },
            { id: '--glass-border', label: 'Borde Cristal/Transparente' },
            { id: '--pastel-card', label: 'Fondo Tarjetas Tenues' }
        ],
        'typography': [
            {
                id: '--main-font-family', label: 'Tipo de Letra', type: 'select', options: [
                    { value: "'Inter', sans-serif", label: 'Inter (Moderno)' },
                    { value: "'Montserrat', sans-serif", label: 'Montserrat (Premium)' },
                    { value: "'Outfit', sans-serif", label: 'Outfit (Geométrico)' },
                    { value: "'Raleway', sans-serif", label: 'Raleway (Elegante)' },
                    { value: "'Playfair Display', serif", label: 'Playfair (Clásico)' },
                    { value: "system-ui, sans-serif", label: 'Sistema (Nativo)' }
                ]
            },
            { id: '--main-font-size', label: 'Tamaño de Texto Base', type: 'range', min: 10, max: 40, step: 1, suffix: 'px' }
        ],
        'sombras': [
            { id: '--main-shadow', label: 'Sombra Contenedor Principal', type: 'toggle', onValue: '0 20px 50px rgba(0,0,0,0.8)' },
            { id: '--card-shadow', label: 'Sombra Tarjetas Secundarias', type: 'toggle', onValue: '0 4px 6px -1px rgba(0,0,0,0.1)' },
            { id: '--title-text-shadow', label: 'Sombra Títulos de Página', type: 'toggle', onValue: '0 2px 4px var(--title-shadow-color)' },
            { id: '--title-shadow-color', label: 'Color Sombra Títulos' },
            { id: '--main-shadow-color', label: 'Color Sombra Principal' },
            { id: '--card-shadow-color', label: 'Color Sombra Tarjetas' }
        ],
        'dashboard': [
            { id: '--dash-bg', label: 'Fondo Dashboard' },
            { id: '--dash-card-bg', label: 'Fondo Tarjetas Stats' },
            { id: '--dash-card-title', label: 'Título Stats', isText: true },
            { id: '--dash-card-value', label: 'Valor Stats', isText: true },
            { id: '--dash-wide-bg', label: 'Fondo Tarjeta Ancha' },
            { id: '--dash-wide-text', label: 'Texto Tarjeta Ancha', isText: true },
            { id: '--dash-clock-bg', label: 'Fondo Cuenta Atrás' },
            { id: '--dash-clock-text', label: 'Texto Reloj', isText: true },
            { id: '--dash-clock-title', label: 'Texto Título Reloj', isText: true },
            { id: '--dash-bote-bg', label: 'Fondo Badge Bote' },
            { id: '--dash-bote-text', label: 'Texto Badge Bote', isText: true },
            { id: '--dash-winner-label', label: 'Label Ganador Quiniela', isText: true },
            { id: '--dash-winner-name', label: 'Nombre Ganador Quiniela', isText: true },
            { id: '--dash-loser-label', label: 'Label Perdedor (Maula)', isText: true },
            { id: '--dash-loser-name', label: 'Nombre Perdedor (Maula)', isText: true },
            { id: '--dash-doubles-label', label: 'Título Quiniela Dobles', isText: true }
        ],
        'tablas': [
            { id: '--table-bg', label: 'Fondo Tabla' },
            { id: '--table-header-bg', label: 'Fondo Cabecera/Par' },
            { id: '--table-text', label: 'Texto e Iconos' },
            { id: '--table-border', label: 'Borde Divisor' }
        ],
        'status': [
            { id: '--danger', label: 'Color Error/Eliminar' },
            { id: '--warning', label: 'Color Aviso/Pendiente' },
            { id: '--primary-gold', label: 'Color Oro/Líder' }
        ],
        'socios': [
            { id: '--primary-green', label: 'Verde Primario' },
            { id: '--dark-green', label: 'Verde Oscuro' },
            { id: '--pastel-bg-green', label: 'Fondo Muted' },
            { id: '--pastel-accent-green', label: 'Acento Muted' },
            { id: '--socios-text', label: 'Texto General Página', isText: true },
            { id: '--socios-title', label: 'Título Página (SOCIOS)', isText: true },
            { id: '--socios-card-bg', label: 'Fondo Tarjeta Socio' },
            { id: '--socios-btn-new-bg', label: 'Botón Nuevo (Fondo)' },
            { id: '--socios-btn-new-text', label: 'Botón Nuevo (Texto)', isText: true },
            { id: '--socios-btn-import-bg', label: 'Botón Importar (Fondo)' },
            { id: '--socios-btn-import-text', label: 'Botón Importar (Texto)', isText: true },
            { id: '--socios-btn-delete-bg', label: 'Botón Eliminar (Fondo)' },
            { id: '--socios-btn-delete-text', label: 'Botón Eliminar (Texto)', isText: true },
            { id: '--socios-field-id-label', label: 'Label ID', isText: true },
            { id: '--socios-field-id-value', label: 'Valor ID', isText: true },
            { id: '--socios-field-name-label', label: 'Label Nombre', isText: true },
            { id: '--socios-field-name-value', label: 'Valor Nombre', isText: true },
            { id: '--socios-field-email-label', label: 'Label Email', isText: true },
            { id: '--socios-field-email-value', label: 'Valor Email', isText: true },
            { id: '--socios-field-phone-label', label: 'Label Teléfono', isText: true },
            { id: '--socios-field-phone-value', label: 'Valor Teléfono', isText: true },
            { id: '--socios-field-action-label', label: 'Label Acción', isText: true },
            { id: '--socios-field-action-text', label: 'Texto Acción (Editar)', isText: true },
            { id: '--socios-btn-edit-bg', label: 'Botón Modificar (Fondo)' },
            { id: '--socios-btn-edit-text', label: 'Botón Modificar (Texto)', isText: true },
            { id: '--socios-main-card-bg', label: 'Fondo Contenedor Principal' }
        ],
        'jornadas': [
            { id: '--primary-blue', label: 'Azul Primario' },
            { id: '--dark-blue', label: 'Azul Oscuro' },
            { id: '--pastel-bg-blue', label: 'Fondo Muted' },
            { id: '--pastel-accent-blue', label: 'Acento Muted' },
            { id: '--jornadas-text', label: 'Texto General Página', isText: true },
            { id: '--jornadas-main-card-bg', label: 'Fondo Contenedor Principal' },
            { id: '--jornada-card-bg', label: 'Fondo Tarjeta Jornada' },
            { id: '--jornada-card-bg-active', label: 'Fondo Tarjeta Activa' },
            { id: '--jornada-card-number', label: 'Título Jornada (Color)', isText: true },
            { id: '--jornada-card-season', label: 'Temporada (Color)', isText: true },
            { id: '--jornada-status-finished', label: 'Estado Finalizada (Verde)', isText: true },
            { id: '--jornada-status-pending', label: 'Estado Pendiente (Naranja)', isText: true },
            { id: '--jornada-date-bg', label: 'Fondo Badge Fecha' },
            { id: '--jornada-date-text', label: 'Texto Badge Fecha', isText: true },
            { id: '--jornada-empty-bg', label: 'Fondo Tarjeta Vacía' },
            { id: '--jornada-header-time', label: 'Texto Fecha Cabecera', isText: true },
            { id: '--jornadas-btn-pdf-bg', label: 'Btn Importar PDF (Fondo)' },
            { id: '--jornadas-btn-pdf-text', label: 'Btn Importar PDF (Texto)', isText: true },
            { id: '--jornadas-btn-rss-bg', label: 'Btn Importar RSS (Fondo)' },
            { id: '--jornadas-btn-rss-text', label: 'Btn Importar RSS (Texto)', isText: true },
            { id: '--jornadas-btn-new-bg', label: 'Btn Nueva (Fondo)' },
            { id: '--jornadas-btn-new-text', label: 'Btn Nueva (Texto)', isText: true },
            { id: '--jornadas-btn-delete-bg', label: 'Btn Borrar Todo (Fondo)' },
            { id: '--jornadas-btn-delete-text', label: 'Btn Borrar Todo (Texto)', isText: true }
        ],
        'pronosticos': [
            { id: '--primary-red', label: 'Rojo Primario' },
            { id: '--dark-red', label: 'Rojo Oscuro' },
            { id: '--pastel-bg-red', label: 'Fondo Muted' },
            { id: '--pastel-accent-red', label: 'Acento Muted' },
            { id: '--pronosticos-text', label: 'Texto General Página', isText: true },
            { id: '--pronosticos-main-card-bg', label: 'Fondo Contenedor Principal' },
            { id: '--pronosticos-card-bg', label: 'Fondo Tarjetas Internas' },
            { id: '--pronosticos-btn-bg', label: 'Fondo Botones' },
            { id: '--pronosticos-btn-text', label: 'Texto Botones', isText: true },
            { id: '--pronosticos-select-bg', label: 'Fondo Desplegables' },
            { id: '--pronosticos-select-text', label: 'Texto Desplegables', isText: true },
            { id: '--pronosticos-select-border', label: 'Borde Desplegables' },
            { id: '--pronosticos-scroll-thumb', label: 'Barra Deslizante (Mando)' },
            { id: '--pronosticos-scroll-track', label: 'Barra Deslizante (Carril)' },
            { id: '--pronosticos-selection-card-bg', label: 'Fondo Tarjeta Superior (Selects)' },
            { id: '--pronosticos-table-head-col-bg', label: 'Fondo Cabecera Columnas (Top)' },
            { id: '--pronosticos-table-head-col-text', label: 'Texto Cabecera Columnas', isText: true },
            { id: '--pronosticos-table-head-row-bg', label: 'Fondo Cabecera Filas (Left)' },
            { id: '--pronosticos-table-head-row-text', label: 'Texto Cabecera Filas', isText: true },
            { id: '--pronosticos-table-col-odd-bg', label: 'Fondo Columna Impar' },
            { id: '--pronosticos-table-col-odd-text', label: 'Texto Columna Impar', isText: true },
            { id: '--pronosticos-table-col-even-bg', label: 'Fondo Columna Par' },
            { id: '--pronosticos-table-col-even-text', label: 'Texto Columna Par', isText: true },
            { id: '--pronosticos-status-late-bg', label: 'Fondo Aviso Tarde' },
            { id: '--pronosticos-status-late-text', label: 'Texto Aviso Tarde', isText: true }
        ],
        'resultados': [
            { id: '--primary-purple', label: 'Color Primario' },
            { id: '--dark-purple', label: 'Color Oscuro' },
            { id: '--pastel-bg-purple', label: 'Fondo Muted' },
            { id: '--pastel-accent-purple', label: 'Acento Muted' },
            { id: '--resultados-text', label: 'Texto General Página', isText: true },
            { id: '--resultados-header-bg', label: 'Fondo Cabecera Tabla (Nombres)' },
            { id: '--resultados-header-text', label: 'Texto Cabecera Tabla', isText: true },
            { id: '--resultados-corner-bg', label: 'Fondo Esquina Superior Izq.' },
            { id: '--resultados-sticky-col-bg', label: 'Fondo Columna Jornadas' },
            { id: '--resultados-sticky-col-text', label: 'Texto Columna Jornadas', isText: true },
            { id: '--resultados-summary-total-bg', label: 'Fondo Celda "Total Puntos"' },
            { id: '--resultados-summary-total-text', label: 'Texto Celda "Total Puntos"', isText: true },
            { id: '--resultados-summary-row-bg', label: 'Fondo Filas Resumen' },
            { id: '--resultados-summary-row-text', label: 'Texto Filas Resumen', isText: true },
            { id: '--resultados-summary-label-bg', label: 'Fondo Labels Resumen' },
            { id: '--resultados-summary-label-text', label: 'Texto Labels Resumen', isText: true },
            { id: '--resultados-winner-bg', label: 'Fondo Celda Ganador' },
            { id: '--resultados-winner-text', label: 'Texto Celda Ganador', isText: true },
            { id: '--resultados-loser-bg', label: 'Fondo Celda Perdedor' },
            { id: '--resultados-loser-text', label: 'Texto Celda Perdedor', isText: true },
            { id: '--resultados-bonus-positive', label: 'Color Bonificación (+)' },
            { id: '--resultados-bonus-negative', label: 'Color Penalización (-)' },
            { id: '--resultados-prize-text', label: 'Color Texto Premios', isText: true },
            { id: '--resultados-prize-bg', label: 'Fondo Celdas Premios' },
            { id: '--resultados-prize-label-bg', label: 'Fondo Label "Premios"' },
            { id: '--resultados-jornada-number', label: 'Texto Número Jornada', isText: true },
            { id: '--resultados-jornada-date', label: 'Texto Fecha Jornada', isText: true },
            { id: '--resultados-hits-number', label: 'Texto Número Aciertos', isText: true },
            { id: '--resultados-total-points-text', label: 'Texto Total Puntos', isText: true },
            { id: '--resultados-cell-bg', label: 'Fondo Celdas Tabla' },
            { id: '--resultados-cell-alt-bg', label: 'Fondo Celdas Alternas' }
        ],
        'resumen': [
            { id: '--primary-orange', label: 'Color Primario (Iconos/Títulos)' },
            { id: '--dark-orange', label: 'Color Oscuro' },
            { id: '--resumen-main-bg', label: 'Fondo Contenedor Principal' },
            { id: '--resumen-card-bg', label: 'Fondo Tarjetas Rankings' },
            { id: '--resumen-table-header-bg', label: 'Fondo Cabecera Tabla Ranking' },
            { id: '--resumen-table-header-text', label: 'Texto Cabecera Tabla Ranking', isText: true },
            { id: '--resumen-table-row-bg', label: 'Fondo Filas Ranking' },
            { id: '--resumen-table-text', label: 'Texto Filas Ranking', isText: true },
            { id: '--resumen-link-color', label: 'Color Enlaces Socios', isText: true },
            { id: '--resumen-row-points-text', label: 'Color Puntos Ranking', isText: true },
            { id: '--resumen-summary-bg', label: 'Fondo Texto Resumen IA' },
            { id: '--resumen-summary-text', label: 'Texto Resumen IA', isText: true },
            { id: '--resumen-match-box-bg', label: 'Fondo Ventana Acierto Partido' },
            { id: '--resumen-match-box-text', label: 'Texto Ventana Acierto Partido', isText: true },
            { id: '--resumen-team-box-bg', label: 'Fondo Ventana Acierto Equipo' },
            { id: '--resumen-team-box-text', label: 'Texto Ventana Acierto Equipo', isText: true },
            { id: '--resumen-performance-bg', label: 'Fondo Ventana Rendimiento' },
            { id: '--resumen-performance-text', label: 'Texto Ventana Rendimiento', isText: true },
            { id: '--resumen-detail-table-header-bg', label: 'Fondo Cabecera Tabla Detalle' },
            { id: '--resumen-detail-table-header-text', label: 'Texto Cabecera Tabla Detalle', isText: true },
            { id: '--resumen-detail-table-row-bg', label: 'Fondo Filas Tabla Detalle' },
            { id: '--resumen-detail-table-text', label: 'Texto Filas Tabla Detalle', isText: true },
            { id: '--resumen-detail-row-hit-bg', label: 'Fondo Fila Acierto (Detalle)' },
            { id: '--resumen-detail-match-text', label: 'Color Texto Partidos', isText: true },
            { id: '--resumen-detail-result-text', label: 'Color Texto Resultados', isText: true }
        ],
        'votaciones': [
            { id: '--votaciones-title', label: 'Título Página', isText: true },
            { id: '--votaciones-subtitle', label: 'Subtítulo Página', isText: true },
            { id: '--votaciones-btn-new-bg', label: 'Botón Nueva (Fondo)' },
            { id: '--votaciones-btn-new-text', label: 'Botón Nueva (Texto)', isText: true },
            { id: '--votaciones-card-bg', label: 'Fondo Tarjeta Voto' },
            { id: '--votaciones-card-title', label: 'Título Voto', isText: true },
            { id: '--votaciones-card-desc', label: 'Descripción Voto', isText: true },
            { id: '--votaciones-badge-active-bg', label: 'Badge Activo (Fondo)' },
            { id: '--votaciones-badge-finished-bg', label: 'Badge Finalizado (Fondo)' },
            { id: '--votaciones-timer-bg', label: 'Reloj/Tiempo (Fondo)' },
            { id: '--votaciones-timer-text', label: 'Reloj/Tiempo (Texto)', isText: true },
            { id: '--votaciones-option-bg', label: 'Opción (Fondo)' },
            { id: '--votaciones-option-text', label: 'Opción (Texto)', isText: true },
            { id: '--votaciones-option-border', label: 'Opción (Borde)' },
            { id: '--votaciones-option-selected-bg', label: 'Opción Elegida (Fondo)' },
            { id: '--votaciones-option-selected-text', label: 'Opción Elegida (Texto)', isText: true },
            { id: '--votaciones-progress-bg', label: 'Barra Progreso (Carril)' },
            { id: '--votaciones-progress-bar', label: 'Barra Progreso (Lleno)' },
            { id: '--votaciones-winning-bg', label: 'Info Ganador (Fondo)' },
            { id: '--votaciones-winning-text', label: 'Info Ganador (Texto)', isText: true }
        ],
        'importacion': [
            { id: '--import-modal-bg', label: 'Fondo Ventana Confirmación' },
            { id: '--import-modal-text', label: 'Texto Títulos/General', isText: true },
            { id: '--import-modal-card-bg', label: 'Fondo Bloque Jornada' },
            { id: '--import-modal-card-text', label: 'Texto Bloque Jornada', isText: true },
            { id: '--import-modal-title', label: 'Color Título Principal', isText: true }
        ],
        'acceso': [
            { id: '--login-bg', label: 'Fondo Pantalla' },
            { id: '--login-card-bg', label: 'Fondo Tarjeta' },
            { id: '--login-btn-bg', label: 'Fondo Botón' },
            { id: '--login-text', label: 'Color Título', isText: true },
            { id: '--login-label', label: 'Color Etiquetas (Labels)', isText: true }
        ]
    },

    init: async function () {
        if (window.DataService) await window.DataService.init();

        this.renderGroups();
        // Primero cargamos los valores actuales (colores)
        this.loadCurrentValues();
        // Cargar layout activo
        this.loadActiveLayout();
        // Luego cargamos la lista de presets
        this.loadPresetsList();
    },

    loadActiveLayout: function () {
        // Check cloud config or local storage? Let's check DOM state first based on auth.js application
        // actually auth.js isn't updated yet. Let's make this tool control it.
        const isVertical = localStorage.getItem('maulas_layout') === 'vertical';
        if (isVertical) {
            document.body.classList.add('layout-vertical');
        } else {
            document.body.classList.remove('layout-vertical');
        }
    },

    toggleLayout: function () {
        document.body.classList.toggle('layout-vertical');
        const isVertical = document.body.classList.contains('layout-vertical');
        localStorage.setItem('maulas_layout', isVertical ? 'vertical' : 'horizontal');

        // Update button text if needed, but for now we just toggle class
        // Optional: Save to cloud if "Apply to All" is clicked?
        // Let's add it to the form values so it gets saved with the theme!
    },

    renderGroups: function () {
        for (const [groupId, vars] of Object.entries(this.groups)) {
            const container = document.getElementById(`group-${groupId}`);
            if (!container) continue;

            container.innerHTML = ''; // Limpiar por si acaso
            vars.forEach(v => {
                const row = document.createElement('div');
                row.className = 'color-row';

                if (v.type === 'toggle') {
                    row.innerHTML = `
                        <label>${v.label}</label>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <input type="checkbox" id="check-${v.id}" onchange="ThemeEditor.updateToggle('${v.id}', this.checked, '${v.onValue}')">
                            <span style="font-size:0.8rem; color:var(--text-secondary)">Activar</span>
                        </div>
                    `;
                } else if (v.type === 'select') {
                    row.innerHTML = `
                        <label>${v.label}</label>
                        <select id="select-${v.id}" onchange="ThemeEditor.updateVariable('${v.id}', this.value)" style="padding:4px; border-radius:4px; border:1px solid var(--input-border); background:var(--input-bg); color:var(--text-main);">
                            ${v.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
                        </select>
                    `;
                } else if (v.type === 'range') {
                    row.innerHTML = `
                        <label>${v.label}</label>
                        <div style="display:flex; gap:10px; align-items:center; flex:1; justify-content:flex-end;">
                            <input type="range" id="range-${v.id}" min="${v.min}" max="${v.max}" step="${v.step}" oninput="ThemeEditor.updateRange('${v.id}', this.value, '${v.suffix}')" style="flex:1;">
                            <span id="val-${v.id}" style="font-size:0.8rem; min-width:35px; text-align:right; color:var(--text-main);">0${v.suffix}</span>
                        </div>
                    `;
                } else {
                    row.innerHTML = `
                        <label>${v.label}</label>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <input type="text" id="text-${v.id}" onchange="ThemeEditor.updateFromText('${v.id}', this.value)">
                            <input type="color" id="picker-${v.id}" oninput="ThemeEditor.updateVariable('${v.id}', this.value)">
                        </div>
                    `;
                }
                container.appendChild(row);

                // Si es un campo de texto, añadir controles extra de Fuente y Tamaño
                if (v.isText) {
                    const fontId = v.id + '-font';
                    const sizeId = v.id + '-size';

                    // Fila de Fuente
                    const fontRow = document.createElement('div');
                    fontRow.className = 'color-row submodule';
                    fontRow.innerHTML = `
                        <label style="padding-left:20px; font-size:0.85rem; opacity:0.8;">└ Fuente</label>
                        <select id="select-${fontId}" onchange="ThemeEditor.updateVariable('${fontId}', this.value)" style="padding:4px; border-radius:4px; border:1px solid var(--input-border); background:var(--input-bg); color:var(--text-main); font-size:0.8rem;">
                            ${FONT_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
                        </select>
                    `;
                    container.appendChild(fontRow);

                    // Fila de Tamaño
                    const sizeRow = document.createElement('div');
                    sizeRow.className = 'color-row submodule';
                    sizeRow.innerHTML = `
                        <label style="padding-left:20px; font-size:0.85rem; opacity:0.8;">└ Tamaño</label>
                        <div style="display:flex; gap:10px; align-items:center; flex:1; justify-content:flex-end;">
                            <input type="range" id="range-${sizeId}" min="8" max="80" step="1" oninput="ThemeEditor.updateRange('${sizeId}', this.value, 'px')" style="flex:1;">
                            <span id="val-${sizeId}" style="font-size:0.8rem; min-width:35px; text-align:right; color:var(--text-main);">0px</span>
                        </div>
                    `;
                    container.appendChild(sizeRow);
                }
            });
        }
    },

    loadCurrentValues: function () {
        const root = document.documentElement;
        const styles = getComputedStyle(root);

        for (const vars of Object.values(this.groups)) {
            vars.forEach(v => {
                let val = styles.getPropertyValue(v.id).trim();

                if (v.type === 'toggle') {
                    const check = document.getElementById(`check-${v.id}`);
                    if (check) check.checked = (val !== 'none' && val !== '');
                } else if (v.type === 'select') {
                    const sel = document.getElementById(`select-${v.id}`);
                    if (sel) {
                        // Normalize val (might have quotes from computed style)
                        const cleanVal = val.replace(/["']/g, "'");
                        sel.value = cleanVal;
                    }
                } else if (v.type === 'range') {
                    const rng = document.getElementById(`range-${v.id}`);
                    const num = parseInt(val);
                    if (rng && !isNaN(num)) {
                        rng.value = num;
                        const valDisplay = document.getElementById(`val-${v.id}`);
                        if (valDisplay) valDisplay.textContent = num + (v.suffix || '');
                    }
                } else {
                    // Convert to Hex if it's RGB
                    if (val.startsWith('rgb')) {
                        val = this.rgbToHex(val);
                    }
                    // Handle transparent or keywords decently (default to white/black if needed)
                    if (!val.startsWith('#')) {
                        if (val === 'transparent') val = '#ffffff';
                        // If it's rgba or something, rgbToHex should handle it or we default
                        if (!val.startsWith('#')) val = '#000000';
                    }

                    const picker = document.getElementById(`picker-${v.id}`);
                    const text = document.getElementById(`text-${v.id}`);
                    if (picker) picker.value = val;
                    if (text) text.value = val;
                }

                // Cargar valores de fuente y tamaño si aplica
                if (v.isText) {
                    const fontId = v.id + '-font';
                    const sizeId = v.id + '-size';

                    // Cargar fuente
                    let fontVal = styles.getPropertyValue(fontId).trim();
                    const sel = document.getElementById(`select-${fontId}`);
                    if (sel && fontVal) {
                        sel.value = fontVal.replace(/["']/g, "'");
                    }

                    // Cargar tamaño
                    let sizeVal = styles.getPropertyValue(sizeId).trim();
                    const rng = document.getElementById(`range-${sizeId}`);
                    const num = parseInt(sizeVal);
                    if (rng && !isNaN(num)) {
                        rng.value = num;
                        const valDisplay = document.getElementById(`val-${sizeId}`);
                        if (valDisplay) valDisplay.textContent = num + 'px';
                    }
                }
            });
        }
    },

    createIATheme: async function () {
        const iaTheme = {
            // UI
            '--main-bg': '#0f172a',
            '--modal-bg': '#1e293b',
            '--modal-header-bg': '#1e293b',
            '--card-bg': 'rgba(30, 41, 59, 0.7)',
            '--text-main': '#f1f5f9',
            '--text-main-font': "'Inter', sans-serif",
            '--text-main-size': '16px',
            '--text-secondary': '#94a3b8',
            '--text-secondary-font': "'Inter', sans-serif",
            '--text-secondary-size': '14px',
            '--input-bg': '#334155',
            '--input-border': '#475569',
            '--glass-border': 'rgba(255, 255, 255, 0.1)',
            '--pastel-card': '#1e293b',
            '--main-font-family': "'Inter', sans-serif",
            '--main-font-size': '16px',

            // Dashboard
            '--dash-bg': '#0f172a',
            '--dash-card-bg': '#1e293b',
            '--dash-card-title': '#10b981',
            '--dash-card-title-font': "'Outfit', sans-serif",
            '--dash-card-title-size': '14px',
            '--dash-card-value': '#ffffff',
            '--dash-card-value-font': "'Outfit', sans-serif",
            '--dash-card-value-size': '42px',
            '--dash-wide-bg': '#1e293b',
            '--dash-wide-text': '#f1f5f9',
            '--dash-wide-text-font': "'Inter', sans-serif",
            '--dash-wide-text-size': '16px',
            '--dash-winner-label': '#94a3b8',
            '--dash-winner-name': '#3b82f6',
            '--dash-loser-label': '#94a3b8',
            '--dash-loser-name': '#f43f5e',
            '--dash-doubles-label': '#f1f5f9',
            '--dash-doubles-label-font': "'Outfit', sans-serif",
            '--dash-doubles-label-size': '18px',

            // Socios (Green Modern)
            '--primary-green': '#10b981',
            '--dark-green': '#065f46',
            '--socios-text': '#f1f5f9',
            '--socios-text-font': "'Inter', sans-serif",
            '--socios-text-size': '16px',
            '--socios-title': '#10b981',
            '--socios-title-font': "'Outfit', sans-serif",
            '--socios-title-size': '45px',
            '--socios-card-bg': '#1e293b',
            '--socios-btn-new-bg': '#10b981',
            '--socios-btn-new-text': '#ffffff',
            '--socios-btn-import-bg': '#3b82f6',
            '--socios-btn-delete-bg': '#f43f5e',

            // Jornadas (Blue Modern)
            '--primary-blue': '#3b82f6',
            '--dark-blue': '#1d4ed8',
            '--jornadas-text': '#f1f5f9',
            '--jornada-card-bg': '#1e293b',
            '--jornada-card-number': '#3b82f6',
            '--jornada-card-number-font': "'Outfit', sans-serif",
            '--jornada-card-number-size': '30px',

            // Pronósticos (Red Modern)
            '--primary-red': '#f43f5e',
            '--dark-red': '#be123c',
            '--pronosticos-text': '#f1f5f9',
            '--pronosticos-btn-bg': '#f43f5e',
            '--pronosticos-table-head-col-bg': '#1e293b',
            '--pronosticos-table-head-col-text': '#f43f5e',

            // Resultados (Purple Modern)
            '--primary-purple': '#8b5cf6',
            '--resultados-text': '#f1f5f9',
            '--resultados-header-bg': '#8b5cf6',
            '--resultados-header-text': '#ffffff',
            '--resultados-cell-bg': '#0f172a',

            // Votaciones (Elegant)
            '--votaciones-title': '#ffffff',
            '--votaciones-title-font': "'Outfit', sans-serif",
            '--votaciones-title-size': '48px',
            '--votaciones-subtitle': '#94a3b8',
            '--votaciones-card-bg': '#1e293b',
            '--votaciones-btn-new-bg': '#ffffff',
            '--votaciones-btn-new-text': '#0f172a',

            // Resumen (Orange/Amber Modern)
            '--primary-orange': '#f59e0b',
            '--resumen-main-bg': '#0f172a',
            '--resumen-card-bg': '#1e293b',
            '--resumen-summary-bg': 'rgba(245, 158, 11, 0.1)',
            '--resumen-summary-text': '#fde68a',
            '--resumen-summary-text-font': "'Inter', sans-serif",
            '--resumen-summary-text-size': '15px',
            '--resumen-table-header-bg': '#f59e0b',
            '--resumen-table-header-text': '#0f172a'
        };

        // Aplicar al root para vista previa inmediata
        const root = document.documentElement;
        for (const [key, value] of Object.entries(iaTheme)) {
            root.style.setProperty(key, value);
        }

        // Guardar en Firebase como el preset oficial "Tema IA"
        if (window.DataService) {
            try {
                await window.DataService.save('config', 'preset_tema_ia', {
                    id: 'preset_tema_ia',
                    name: 'Tema IA',
                    type: 'preset',
                    data: iaTheme
                });
                alert('✨ ¡Tema IA (Elegante y Moderno) generado y guardado con éxito!');
                location.reload();
            } catch (e) {
                console.error(e);
                alert('Error al guardar el Tema IA en la nube.');
            }
        }
    },

    updateVariable: function (id, val) {
        document.documentElement.style.setProperty(id, val);
        const text = document.getElementById(`text-${id}`);
        if (text) text.value = val;
    },

    updateFromText: function (id, val) {
        if (!val.startsWith('#')) val = '#' + val;
        // Basic hex validation
        if (/^#[0-9A-F]{3,8}$/i.test(val)) {
            this.updateVariable(id, val);
            const picker = document.getElementById(`picker-${id}`);
            if (picker) picker.value = val;
        }
    },

    updateToggle: function (id, isChecked, onValue) {
        const val = isChecked ? onValue : 'none';
        document.documentElement.style.setProperty(id, val);
    },

    updateRange: function (id, val, suffix) {
        const finalVal = val + suffix;
        document.documentElement.style.setProperty(id, finalVal);
        const display = document.getElementById(`val-${id}`);
        if (display) display.textContent = finalVal;
    },

    rgbToHex: function (rgb) {
        const result = rgb.match(/\d+/g);
        if (!result) return '#000000';
        return "#" + result.slice(0, 3).map(x => {
            const hex = parseInt(x).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("");
    },

    // --- LOGICA DE PERSISTENCIA Y PRESETS ---

    getFormValues: function () {
        const themeData = {};
        for (const [groupId, vars] of Object.entries(this.groups)) {
            vars.forEach(v => {
                if (v.type === 'toggle') {
                    const el = document.getElementById(`check-${v.id}`);
                    if (el) themeData[v.id] = el.checked ? v.onValue : 'none';
                } else if (v.type === 'select') {
                    const el = document.getElementById(`select-${v.id}`);
                    if (el) themeData[v.id] = el.value;
                } else if (v.type === 'range') {
                    const el = document.getElementById(`range-${v.id}`);
                    if (el) themeData[v.id] = el.value + (v.suffix || '');
                } else {
                    const el = document.getElementById(`picker-${v.id}`);
                    if (el) themeData[v.id] = el.value;
                }

                // Extra values for text
                if (v.isText) {
                    const fontId = v.id + '-font';
                    const sizeId = v.id + '-size';

                    const fEl = document.getElementById(`select-${fontId}`);
                    if (fEl) themeData[fontId] = fEl.value;

                    const sEl = document.getElementById(`range-${sizeId}`);
                    if (sEl) themeData[sizeId] = sEl.value + 'px';
                }
            });
        }
        return themeData;
    },

    // 1. Guardar como Preset (Nuevo Tema)
    savePreset: async function () {
        const nameInput = document.getElementById('new-preset-name');
        const name = nameInput.value.trim();

        if (!name) {
            alert('Por favor, escribe un nombre para el nuevo tema.');
            return;
        }

        const themeData = this.getFormValues();
        // ID safe string
        const safeId = 'preset_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');

        const presetData = {
            id: safeId,
            name: name,
            type: 'preset', // Flag to distinguish from the active theme
            ...themeData
        };

        try {
            await window.DataService.save('config', presetData);
            alert(`Tema "${name}" guardado correctamente.`);
            nameInput.value = '';
            this.loadPresetsList(); // Recargar dropdown
        } catch (e) {
            console.error(e);
            alert('Error al guardar el tema.');
        }
    },

    // 2. Cargar lista de Presets en el Dropdown
    loadPresetsList: async function () {
        const select = document.getElementById('preset-select');
        select.innerHTML = '<option value="">-- Seleccionar Tema --</option>';

        try {
            const configDocs = await window.DataService.getAll('config');
            // Filter only presets
            const presets = configDocs.filter(doc => doc.type === 'preset' || doc.id.startsWith('preset_'));

            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                select.appendChild(opt);
            });
        } catch (e) {
            console.warn("Error cargando lista de temas", e);
        }
    },

    // 3. Aplicar un Preset (lo lee de la nube y rellena los inputs y la vista)
    loadSelectedPreset: async function () {
        const select = document.getElementById('preset-select');
        const id = select.value;
        if (!id) return;

        try {
            // No tenemos un getById directo expuesto, así que usaremos getAll y find
            // Ojo: DataService normalmente tiene getById? Vamos a chequear, sino getAll
            // El usuario tiene getAll en auth.js, usaremos ese pattern.
            const configDocs = await window.DataService.getAll('config');
            const preset = configDocs.find(d => d.id === id);

            if (preset) {
                // Aplicar valores
                Object.entries(preset).forEach(([key, val]) => {
                    if (key.startsWith('--')) {
                        document.documentElement.style.setProperty(key, val);

                        // Actualizar UI
                        const picker = document.getElementById(`picker-${key}`);
                        const text = document.getElementById(`text-${key}`);
                        const check = document.getElementById(`check-${key}`);

                        if (picker) picker.value = val;
                        if (text) text.value = val;
                        if (check) check.checked = (val !== 'none' && val !== '');

                        const sel = document.getElementById(`select-${key}`);
                        if (sel) sel.value = val.replace(/["']/g, "'");

                        const rng = document.getElementById(`range-${key}`);
                        if (rng) {
                            rng.value = parseInt(val);
                            const valDisplay = document.getElementById(`val-${key}`);
                            if (valDisplay) valDisplay.textContent = val;
                        }
                    }
                });
                alert(`Tema "${preset.name}" cargado. Recuerda pulsar "APLICAR A TODA LA WEB" si quieres que sea el definitivo.`);
            }
        } catch (e) {
            console.error(e);
            alert('Error cargando el tema.');
        }
    },

    // 4. Eliminar Preset
    deleteSelectedPreset: async function () {
        const select = document.getElementById('preset-select');
        const id = select.value;
        if (!id) return;

        if (confirm('¿Seguro que quieres eliminar este tema guardado?')) {
            try {
                await window.DataService.delete('config', id);
                alert('Tema eliminado.');
                this.loadPresetsList();
            } catch (e) {
                console.error(e);
                alert('Error al eliminar.');
            }
        }
    },

    // 5. Guardar como TEMA ACTIVO (Global) - Lo que antes era "Guardar en la Nube"
    applyTrace: async function () {
        const themeData = this.getFormValues();
        try {
            // Save to DB (Cloud/Mock)
            await window.DataService.save('config', { id: 'theme', ...themeData });

            // Save to LocalStorage for instant load on next visit
            localStorage.setItem('maulas_theme_cache', JSON.stringify(themeData));

            alert('¡Tema aplicado! Ahora todos los usuarios verán estos colores.');
        } catch (e) {
            console.error(e);
            alert('Error al aplicar tema global.');
        }
    },

    reset: async function () {
        if (confirm('¿Estás seguro de que quieres volver a los colores originales por defecto? Se borrará la configuración activa.')) {
            try {
                if (window.DataService) await window.DataService.delete('config', 'theme');
                alert('Configuración personalizada eliminada. Recargando...');
                window.location.reload();
            } catch (e) {
                console.warn(e);
                window.location.reload();
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ThemeEditor.init());
