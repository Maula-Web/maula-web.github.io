const ThemeEditor = {
    groups: {
        'ui': [
            { id: '--main-bg', label: 'Fondo Aplicación' },
            { id: '--modal-bg', label: 'Fondo Tarjetas/Modales' },
            { id: '--text-main', label: 'Texto Principal' },
            { id: '--text-secondary', label: 'Texto Secundario' },
            { id: '--input-bg', label: 'Fondo de Inputs' },
            { id: '--input-border', label: 'Borde de Inputs' }
        ],
        'socios': [
            { id: '--primary-green', label: 'Verde Primario' },
            { id: '--dark-green', label: 'Verde Oscuro' },
            { id: '--pastel-bg-green', label: 'Fondo Muted' }
        ],
        'jornadas': [
            { id: '--primary-blue', label: 'Azul Primario' },
            { id: '--dark-blue', label: 'Azul Oscuro' },
            { id: '--pastel-bg-blue', label: 'Fondo Muted' }
        ],
        'pronosticos': [
            { id: '--primary-red', label: 'Rojo Primario' },
            { id: '--dark-red', label: 'Rojo Oscuro' },
            { id: '--pastel-bg-red', label: 'Fondo Muted' }
        ],
        'resultados': [
            { id: '--primary-purple', label: 'Color Primario' },
            { id: '--dark-purple', label: 'Color Oscuro' },
            { id: '--pastel-bg-purple', label: 'Fondo Muted' }
        ],
        'resumen': [
            { id: '--primary-orange', label: 'Naranja Primario' },
            { id: '--dark-orange', label: 'Naranja Oscuro' },
            { id: '--pastel-bg-orange', label: 'Fondo Muted' }
        ]
    },

    init: async function () {
        if (window.DataService) await window.DataService.init();

        this.renderGroups();
        this.loadCurrentValues();
    },

    renderGroups: function () {
        for (const [groupId, vars] of Object.entries(this.groups)) {
            const container = document.getElementById(`group-${groupId}`);
            if (!container) continue;

            vars.forEach(v => {
                const row = document.createElement('div');
                row.className = 'color-row';
                row.innerHTML = `
                    <label>${v.label}</label>
                    <input type="text" id="text-${v.id}" onchange="ThemeEditor.updateFromText('${v.id}', this.value)">
                    <input type="color" id="picker-${v.id}" oninput="ThemeEditor.updateVariable('${v.id}', this.value)">
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

    save: async function () {
        const themeData = {};
        for (const vars of Object.values(this.groups)) {
            vars.forEach(v => {
                themeData[v.id] = document.getElementById(`picker-${v.id}`).value;
            });
        }

        try {
            // Save to a special document in Firestore
            await window.DataService.save('config', { id: 'theme', ...themeData });
            alert('Configuración de colores guardada correctamente. Se aplicará a todos los usuarios al recargar.');
        } catch (e) {
            console.error(e);
            alert('Error al guardar en la nube.');
        }
    },

    reset: async function () {
        if (confirm('¿Estás seguro de que quieres volver a los colores por defecto? (Se borrará la configuración de la nube)')) {
            try {
                if (window.DataService) await window.DataService.delete('config', 'theme');
                alert('Configuración personalizada eliminada. Los colores volverán a los originales del archivo CSS.');
                window.location.reload();
            } catch (e) {
                console.warn(e);
                window.location.reload();
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ThemeEditor.init());
