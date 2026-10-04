/**
 * Universal Table Sorter Utility - Peña Maulas
 * Proporciona ordenación dinámica por columnas para tablas HTML estándar.
 * Excluye explícitamente matrices históricas (#matriz-table, #matrix-table).
 */
window.AppTableSorter = {
    /**
     * Ordena las filas de un <tbody> dado el elemento <th> clickeado.
     * @param {HTMLTableCellElement} th - Elemento <th> clickeado
     * @param {string} [type='auto'] - Tipo de dato: 'text' | 'number' | 'date' | 'auto'
     */
    sortColumn(th, type = 'auto') {
        const table = th.closest('table');
        if (!table) return;

        // Regla: No ordenar la Matriz Histórica
        if (table.id === 'matriz-table' || table.id === 'matrix-table' || table.closest('#view-matriz') || table.closest('#view-matrix')) {
            return;
        }

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const trHeader = th.parentElement;
        const colIndex = Array.from(trHeader.children).indexOf(th);
        if (colIndex === -1) return;

        // Determinar dirección actual (asc / desc)
        const currentDir = th.getAttribute('data-sort-dir');
        const newDir = currentDir === 'asc' ? 'desc' : 'asc';

        // Actualizar indicadores visuales en todas las cabeceras ordenables de esta fila
        trHeader.querySelectorAll('th[data-sortable="true"]').forEach(otherTh => {
            otherTh.removeAttribute('data-sort-dir');
            const icon = otherTh.querySelector('.sort-indicator, .sort-icon');
            if (icon) icon.textContent = '↕';
        });

        th.setAttribute('data-sort-dir', newDir);
        const curIcon = th.querySelector('.sort-indicator, .sort-icon');
        if (curIcon) {
            curIcon.textContent = newDir === 'asc' ? '↑' : '↓';
        }

        // Obtener filas de datos (excluyendo posibles filas especiales si las hubiera)
        const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => {
            // Ignorar filas de mensaje vacío
            return !tr.querySelector('td[colspan]');
        });

        if (rows.length <= 1) return;

        // Función de extracción y parseo de valor
        const getVal = (row) => {
            const cell = row.children[colIndex];
            if (!cell) return '';

            // Si la celda tiene data-sort-val explícito, usarlo
            if (cell.hasAttribute('data-sort-val')) {
                return cell.getAttribute('data-sort-val');
            }

            // De lo contrario extraer texto limpio
            return cell.innerText || cell.textContent || '';
        };

        const parseVal = (raw) => {
            const clean = String(raw).trim();
            if (type === 'number') {
                return this.parseNumber(clean);
            }
            if (type === 'date') {
                return this.parseDate(clean);
            }
            if (type === 'auto') {
                // Autodetección: ¿Es número / moneda?
                if (/^[-+]?[\d.,\s]+€?$/.test(clean) || /^[-+]?(\d{1,3}(\.\d{3})*|\d+)(,\d+)?\s*€?$/.test(clean)) {
                    const num = this.parseNumber(clean);
                    if (!isNaN(num)) return num;
                }
                // ¿Es fecha dd/mm/aaaa o aaaa-mm-dd?
                if (/^\d{4}-\d{2}-\d{2}$/.test(clean) || /^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
                    const dt = this.parseDate(clean);
                    if (!isNaN(dt)) return dt;
                }
            }
            return clean.toLowerCase();
        };

        rows.sort((rowA, rowB) => {
            const valA = parseVal(getVal(rowA));
            const valB = parseVal(getVal(rowB));

            if (typeof valA === 'number' && typeof valB === 'number') {
                return newDir === 'asc' ? valA - valB : valB - valA;
            }

            const strA = String(valA);
            const strB = String(valB);
            return newDir === 'asc' ? strA.localeCompare(strB, 'es', { numeric: true }) : strB.localeCompare(strA, 'es', { numeric: true });
        });

        // Reinsertar filas ordenadas en tbody
        rows.forEach(r => tbody.appendChild(r));
    },

    parseNumber(str) {
        if (!str) return 0;
        let s = String(str).replace(/[€%+\s]/g, '').trim();

        // Si empieza o contiene texto como "Jornada 12" o "J12", extraer el número
        const jMatch = s.match(/(?:jornada|j)?\s*(\d+(?:[.,]\d+)?)/i);
        if (jMatch && isNaN(parseFloat(s))) {
            const extracted = jMatch[1].replace(',', '.');
            const n = parseFloat(extracted);
            if (!isNaN(n)) return n;
        }

        // Si tiene formato español 1.234,56
        if (s.includes(',') && s.includes('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (s.includes(',')) {
            s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        if (!isNaN(n)) return n;

        // Búsqueda genérica de primer número en la cadena
        const anyNumMatch = s.match(/\d+(?:\.\d+)?/);
        return anyNumMatch ? parseFloat(anyNumMatch[0]) : 0;
    },

    parseDate(str) {
        if (!str) return 0;
        const s = String(str).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            return new Date(s).getTime();
        }
        if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
            const parts = s.split('/');
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        }
        const d = Date.parse(s);
        return isNaN(d) ? 0 : d;
    }
};
