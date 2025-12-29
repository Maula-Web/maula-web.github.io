
class ResultsManager {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];
        this.init();
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        console.log("ResultsManager: Loading data from Cloud...");
        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');

        this.calculateAndRender();
    }

    calculateAndRender() {
        const table = document.getElementById('matrix-table');
        const wrapper = document.getElementById('results-wrapper');
        const loading = document.getElementById('loading');

        const finishedJornadas = this.jornadas.filter(j => {
            // Filter: Only show jornadas on Sunday
            if (j.date) {
                const dateObj = AppUtils.parseDate(j.date);
                // Si la fecha es inválida o NO es domingo, la ignoramos para resultados finales
                // (Ojo: Si quieres permitir jornadas entre semana, quita isSunday)
                if (!dateObj || !AppUtils.isSunday(dateObj)) return false;
            }
            return j.matches && j.matches[0] && j.matches[0].result !== '';
        }).sort((a, b) => b.number - a.number);

        if (finishedJornadas.length === 0) {
            loading.textContent = "No hay jornadas finalizadas con resultados todavía.";
            return;
        }

        // --- CALCULATION PHASE ---
        const memberStats = {};
        this.members.forEach(m => {
            memberStats[m.id] = {
                name: m.name,
                grandTotal: 0,
                baseTotal: 0,
                bonusTotal: 0,
                unpardonedLates: 0, // Track validation if needed
                jornadaData: {} // { jId: { hits, score, bonus, isLate, isPardoned } }
            };
        });

        finishedJornadas.forEach(j => {
            const officialResults = j.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(j.date);

            // Track min/max for coloring
            let maxScore = -Infinity;
            let minScore = Infinity;

            // First pass: Calculate scores for all members
            this.members.forEach(m => {
                const p = this.pronosticos.find(pred => pred.jId === j.id && pred.mId === m.id);

                let hits = 0;
                let points = 0;
                let bonus = 0;
                let played = false;
                let isLate = false;
                let isPardoned = false; // Default false. In future, read from 'p.pardoned'

                if (p && p.selection) {
                    played = true;
                    isLate = p.late || false;
                    isPardoned = p.pardoned || false;

                    let ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);

                    // Late Logic: If late and NOT pardoned -> Hits = 0 -> Recalculate Score
                    if (isLate && !isPardoned) {
                        hits = 0;
                        points = ScoringSystem.calculateScore(0, jDate);
                        bonus = points; // points - hits(0)
                    } else {
                        hits = ev.hits;
                        points = ev.points;
                        bonus = ev.bonus;
                    }
                } else {
                    // Not played
                    hits = -1; // Flag for 'Not Played'
                    points = 0;
                    bonus = 0;
                }

                // Store
                memberStats[m.id].jornadaData[j.id] = { hits, points, bonus, isLate, isPardoned };

                if (hits !== -1) {
                    memberStats[m.id].grandTotal += points;
                    memberStats[m.id].baseTotal += hits;
                    memberStats[m.id].bonusTotal += bonus;

                    // Max/Min tracking (only for played)
                    if (points > maxScore) maxScore = points;
                    if (points < minScore) minScore = points;
                }
            });

            // Store Max/Min for this jornada to use in rendering
            j.stats = { maxScore, minScore };
        });

        // --- RENDER PHASE ---

        // Sorting by Member ID (as requested)
        const sortedMembers = [...this.members].sort((a, b) => {
            return a.id - b.id;
        });

        // Create THead with Summary Rows included to make them sticky
        // Use table-layout: fixed for equal widths
        let theadHtml = `<thead style="font-size:0.9rem;">`;

        // 1. Header Names
        // First col: Fixed width for 'Temporada'
        // Other cols: Auto or equal percentage? 
        // Better: min-width and allow wrap.
        theadHtml += `<tr><th style="width:120px; min-width:120px; white-space:nowrap; z-index:3; padding:10px; color:white;">Temporada 2025-2026</th>`;

        sortedMembers.forEach(m => {
            // Apply equal sizing
            theadHtml += `<th style="z-index:2; width:80px; min-width:80px; vertical-align:middle; padding:10px 2px; word-wrap: break-word; white-space: normal;">
                            <div style="font-weight:bold; line-height:1.2; font-size:0.95rem;">${m.name}</div>
                            <div style="font-size:0.7rem; font-weight:normal; color:#e0f2f1; opacity:0.8;">ID: ${m.id}</div>
                          </th>`;
        });
        theadHtml += `</tr>`;

        // 2. Grand Total (Sticky below names)
        theadHtml += `<tr class="total-row" style="position:sticky; top:60px; z-index:2;">
                        <td style="position:sticky; left:0; z-index:3; background-color:#e1bee7; border-right:2px solid #ddd;">TOTAL PUNTOS</td>`;
        sortedMembers.forEach(m => {
            theadHtml += `<td class="accumulated-score" style="font-size: 1.6rem;">${memberStats[m.id].grandTotal}</td>`;
        });
        theadHtml += `</tr>`;

        // 3. Base Hits
        theadHtml += `<tr class="summary-row" style="position:sticky; top:110px; z-index:2;">
                        <td style="position:sticky; left:0; z-index:3; background:#e1bee7; border-right:2px solid #ddd;">Aciertos Base</td>`;
        sortedMembers.forEach(m => {
            theadHtml += `<td style="color:#555; background:#f3e5f5;">${memberStats[m.id].baseTotal}</td>`;
        });
        theadHtml += `</tr>`;

        // 4. Bonus/Penalties
        theadHtml += `<tr class="summary-row" style="border-bottom:2px solid #ddd; position:sticky; top:150px; z-index:2;">
                        <td style="position:sticky; left:0; z-index:3; background:#e1bee7; border-right:2px solid #ddd;">Bonus / Penal.</td>`;
        sortedMembers.forEach(m => {
            const val = memberStats[m.id].bonusTotal;
            const color = val >= 0 ? '#7b1fa2' : '#c62828'; // Morado para positivo, rojo oscuro para negativo
            const sign = val > 0 ? '+' : '';
            theadHtml += `<td style="color:${color}; font-weight:bold; background:#f3e5f5;">${sign}${val}</td>`;
        });
        theadHtml += `</tr>`;

        theadHtml += `</thead>`;

        // TBody
        let tbodyHtml = `<tbody>`;

        // Jornada Rows
        finishedJornadas.forEach(j => {
            tbodyHtml += `<tr>`;
            tbodyHtml += `<td style="font-size:0.9rem; border-right:2px solid #ddd;">
                            <div style="font-weight:bold;">Jornada ${j.number}</div>
                            <div style="color:#777; font-size:0.8rem;">${j.date}</div>
                          </td>`;

            sortedMembers.forEach(m => {
                const data = memberStats[m.id].jornadaData[j.id];
                let cellHtml = '-';
                let styleClass = '';
                let cellStyle = '';

                if (data.hits !== -1) {
                    // MAIN CHANGE: Show HITS as main value
                    // If Bonus != 0, show it below.
                    cellHtml = `<div style="font-size:1.3rem; font-weight:bold;">${data.hits}</div>`;

                    if (data.bonus !== 0) {
                        const bColor = data.bonus > 0 ? 'var(--dark-green)' : 'red';
                        const bSign = data.bonus > 0 ? '+' : '';
                        cellHtml += `<div style="font-size:0.8rem; font-weight:bold; color:${bColor};">${bSign}${data.bonus}</div>`;
                    }

                    // Details tooltip
                    const bonusText = data.bonus !== 0 ? (data.bonus > 0 ? `+${data.bonus}` : `${data.bonus}`) : '0';
                    const title = `Puntos Totales: ${data.points}\n(Aciertos: ${data.hits} + Bonus: ${bonusText})`;

                    // Add wrapper for tooltip
                    cellHtml = `<div title="${title}">${cellHtml}</div>`;

                    // Coloring based on POINTS (still?) or Hits?
                    // User said "Muestra el resultado real... sin penalizacion o bonificacion en grande".
                    // But usually color coding (Green/Red) is based on the 'performance' which is Points.
                    // Or is it based on Hits? "14 aciertos" is usually green.
                    // Let's keep coloring based on POINTS for "Winning/Losing" relative to others, 
                    // or switch to standard quiniela colors (14=Green, <10=Red)?
                    // Existing logic used maxScore/minScore of the JORNADA.
                    // Let's keep using POINTS for comparison coloring as it reflects the "match outcome".

                    if (data.points === j.stats.maxScore) {
                        cellStyle += 'background-color:#bbdefb;'; // Azul claro en lugar de verde
                    } else if (data.points === j.stats.minScore) {
                        cellStyle += 'background-color:#ffcdd2;'; // Light Red
                    }

                    // Black/White for 0 Hits/Points logic
                    if (data.hits === 0) {
                        // If 0 hits, usually it's bad.
                        cellStyle += 'background-color:black; color:white;';
                    }

                    if (data.isLate && !data.isPardoned) {
                        cellHtml += `<div style="font-size:0.7rem; color:${data.hits === 0 ? 'white' : 'red'};">LATE</div>`;
                        // Toggle Pardon Button
                        cellHtml += `<button onclick="app.togglePardon('${j.id}','${m.id}')" style="font-size:0.6rem; margin-top:2px;">Perdonar</button>`;
                    }
                }

                tbodyHtml += `<td style="${cellStyle}">${cellHtml}</td>`;
            });
            tbodyHtml += `</tr>`;
        });

        tbodyHtml += `</tbody>`;

        table.innerHTML = theadHtml + tbodyHtml;
        loading.style.display = 'none';
        wrapper.classList.remove('hidden');
    }

    async togglePardon(jId, mId) {
        if (!confirm('¿Anular la sanción por retraso para este pronóstico?')) return;

        // Find pronostico
        const p = this.pronosticos.find(p => p.jId == jId && p.mId == mId);
        if (p) {
            p.pardoned = true;
            await window.DataService.save('pronosticos', p);
            this.calculateAndRender();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResultsManager();
});
