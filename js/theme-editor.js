const ThemeEditor = {
    // Definición completa de todas las variables configurables
    groups: {
        'ui': [
            { id: '--main-bg', label: 'Fondo Principal' },
            { id: '--modal-bg', label: 'Fondo Ventanas/Modales' },
            { id: '--card-bg', label: 'Fondo Tarjetas (Stats)' },
            { id: '--text-main', label: 'Texto Principal' },
            { id: '--text-secondary', label: 'Texto Secundario' },
            { id: '--input-bg', label: 'Fondo de Inputs' },
            { id: '--input-border', label: 'Borde de Inputs' },
            { id: '--glass-border', label: 'Borde Cristal/Transparente' },
            { id: '--pastel-card', label: 'Fondo Tarjetas Tenues' }
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
            { id: '--socios-text', label: 'Texto General Página' },
            { id: '--socios-title', label: 'Título Página (SOCIOS)' },
            { id: '--socios-card-bg', label: 'Fondo Tarjeta Socio' },
            { id: '--socios-btn-new-bg', label: 'Botón Nuevo (Fondo)' },
            { id: '--socios-btn-new-text', label: 'Botón Nuevo (Texto)' },
            { id: '--socios-btn-import-bg', label: 'Botón Importar (Fondo)' },
            { id: '--socios-btn-import-text', label: 'Botón Importar (Texto)' },
            { id: '--socios-btn-delete-bg', label: 'Botón Eliminar (Fondo)' },
            { id: '--socios-btn-delete-text', label: 'Botón Eliminar (Texto)' },
            { id: '--socios-field-id-label', label: 'Label ID' },
            { id: '--socios-field-id-value', label: 'Valor ID' },
            { id: '--socios-field-name-label', label: 'Label Nombre' },
            { id: '--socios-field-name-value', label: 'Valor Nombre' },
            { id: '--socios-field-email-label', label: 'Label Email' },
            { id: '--socios-field-email-value', label: 'Valor Email' },
            { id: '--socios-field-phone-label', label: 'Label Teléfono' },
            { id: '--socios-field-phone-value', label: 'Valor Teléfono' },
            { id: '--socios-field-action-label', label: 'Label Acción' },
            { id: '--socios-field-action-text', label: 'Texto Acción (Editar)' },
            { id: '--socios-btn-edit-bg', label: 'Botón Modificar (Fondo)' },
            { id: '--socios-btn-edit-text', label: 'Botón Modificar (Texto)' },
            { id: '--socios-main-card-bg', label: 'Fondo Contenedor Principal' }
        ],
        'jornadas': [
            { id: '--primary-blue', label: 'Azul Primario' },
            { id: '--dark-blue', label: 'Azul Oscuro' },
            { id: '--pastel-bg-blue', label: 'Fondo Muted' },
            { id: '--pastel-accent-blue', label: 'Acento Muted' },
            { id: '--jornadas-text', label: 'Texto General Página' },
            { id: '--jornadas-main-card-bg', label: 'Fondo Contenedor Principal' },
            { id: '--jornada-card-bg', label: 'Fondo Tarjeta Jornada' },
            { id: '--jornada-card-bg-active', label: 'Fondo Tarjeta Activa' },
            { id: '--jornada-card-number', label: 'Título Jornada (Color)' },
            { id: '--jornada-card-season', label: 'Temporada (Color)' },
            { id: '--jornada-status-finished', label: 'Estado Finalizada (Verde)' },
            { id: '--jornada-status-pending', label: 'Estado Pendiente (Naranja)' },
            { id: '--jornada-date-bg', label: 'Fondo Badge Fecha' },
            { id: '--jornada-date-text', label: 'Texto Badge Fecha' },
            { id: '--jornada-empty-bg', label: 'Fondo Tarjeta Vacía' },
            { id: '--jornada-header-time', label: 'Texto Fecha Cabecera' }
        ],
        'pronosticos': [
            { id: '--primary-red', label: 'Rojo Primario' },
            { id: '--dark-red', label: 'Rojo Oscuro' },
            { id: '--pastel-bg-red', label: 'Fondo Muted' },
            { id: '--pastel-accent-red', label: 'Acento Muted' },
            { id: '--pronosticos-text', label: 'Texto General Página' },
            { id: '--pronosticos-main-card-bg', label: 'Fondo Contenedor Principal' },
            { id: '--pronosticos-card-bg', label: 'Fondo Tarjetas Internas' },
            { id: '--pronosticos-btn-bg', label: 'Fondo Botones' },
            { id: '--pronosticos-btn-text', label: 'Texto Botones' },
            { id: '--pronosticos-select-bg', label: 'Fondo Desplegables' },
            { id: '--pronosticos-select-text', label: 'Texto Desplegables' },
            { id: '--pronosticos-select-border', label: 'Borde Desplegables' },
            { id: '--pronosticos-scroll-thumb', label: 'Barra Deslizante (Mando)' },
            { id: '--pronosticos-scroll-track', label: 'Barra Deslizante (Carril)' },
            { id: '--pronosticos-table-header-bg', label: 'Fondo Títulos Tabla' },
            { id: '--pronosticos-table-header-text', label: 'Texto Títulos Tabla' },
            { id: '--pronosticos-table-row-bg', label: 'Fondo Filas Tabla' },
            { id: '--pronosticos-table-row-text', label: 'Texto Filas Tabla' },
            { id: '--pronosticos-status-late-bg', label: 'Fondo Aviso Tarde' },
            { id: '--pronosticos-status-late-text', label: 'Texto Aviso Tarde' }
        ],
        'resultados': [
            { id: '--primary-purple', label: 'Color Primario' },
            { id: '--dark-purple', label: 'Color Oscuro' },
            { id: '--pastel-bg-purple', label: 'Fondo Muted' },
            { id: '--pastel-accent-purple', label: 'Acento Muted' },
            { id: '--resultados-text', label: 'Texto General Página' }
        ],
        'resumen': [
            { id: '--primary-orange', label: 'Naranja Primario' },
            { id: '--dark-orange', label: 'Naranja Oscuro' },
            { id: '--pastel-bg-orange', label: 'Fondo Muted' },
            { id: '--pastel-accent-orange', label: 'Acento Muted' },
            { id: '--resumen-text', label: 'Texto General Página' }
        ],
        'acceso': [
            { id: '--login-bg', label: 'Fondo Pantalla' },
            { id: '--login-card-bg', label: 'Fondo Tarjeta' },
            { id: '--login-btn-bg', label: 'Fondo Botón' },
            { id: '--login-text', label: 'Color Título' },
            { id: '--login-label', label: 'Color Etiquetas (Labels)' }
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
                row.innerHTML = `
                    <label>${v.label}</label>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <input type="text" id="text-${v.id}" onchange="ThemeEditor.updateFromText('${v.id}', this.value)">
                        <input type="color" id="picker-${v.id}" oninput="ThemeEditor.updateVariable('${v.id}', this.value)">
                    </div>
                `;
                container.appendChild(row);
            });
        }
    },

    loadCurrentValues: function () {
        const root = document.documentElement;
        const styles = getComputedStyle(root);

        for (const vars of Object.values(this.groups)) {
            vars.forEach(v => {
                let val = styles.getPropertyValue(v.id).trim();

                // Convert to Hex if it's RGB
                if (val.startsWith('rgb')) {
                    val = this.rgbToHex(val);
                }
                // Handle transparent or keywords decently (default to white/black if needed)
                if (!val.startsWith('#')) {
                    // Si es transparent o inherit, lo dejamos? El color input no lo soporta bien.
                    // Ponemos negro por defecto si falla
                    if (val === 'transparent') val = '#ffffff';
                }

                const picker = document.getElementById(`picker-${v.id}`);
                const text = document.getElementById(`text-${v.id}`);
                if (picker) picker.value = val;
                if (text) text.value = val;
            });
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
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            this.updateVariable(id, val);
            const picker = document.getElementById(`picker-${id}`);
            if (picker) picker.value = val;
        }
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
        for (const vars of Object.values(this.groups)) {
            vars.forEach(v => {
                const el = document.getElementById(`picker-${v.id}`);
                if (el) themeData[v.id] = el.value;
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
                        this.updateVariable(key, val); // Actualiza CSS y Inputs
                        // Forzar update visual del picker color
                        const picker = document.getElementById(`picker-${key}`);
                        if (picker) picker.value = val;
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
            await window.DataService.save('config', { id: 'theme', ...themeData });
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
