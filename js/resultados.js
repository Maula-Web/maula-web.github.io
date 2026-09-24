
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
        const data = await window.DataService.loadSeasonData();
        this.members = data.members;
        this.jornadas = data.jornadas;
        this.pronosticos = data.pronosticos;

        this.calculateAndRender();
    }

    calculateAndRender() {
        const table = document.getElementById('matrix-table');
        const wrapper = document.getElementById('results-wrapper');
        const loading = document.getElementById('loading');

        const visibleJornadas = this.jornadas.filter(j => {
            // Show all active jornadas, OR jornadas that have ANY result, OR jornadas with ANY forecasts
            if (!j.active) {
                const hasAnyResult = j.matches && j.matches.some(m => m.result && m.result.trim() !== '');
                const hasAnyForecast = this.pronosticos.some(p => String(p.jId) === String(j.id));
                return hasAnyResult || hasAnyForecast;
            }
            return true;
        }).sort((a, b) => b.number - a.number);

        console.log(`ResultsManager: Found ${visibleJornadas.length} visible jornadas`);

        if (visibleJornadas.length === 0) {
            loading.textContent = "No hay jornadas configuradas todavía.";
            return;
        }

        const finishedJornadas = visibleJornadas; // Renamed for compatibility with existing code

        // --- CALCULATION PHASE ---
        const memberStats = {};
        this.members.forEach(m => {
            memberStats[m.id] = {
                name: AppUtils.getMemberName(m),
                grandTotal: 0,
                baseTotal: 0,
                bonusTotal: 0,
                prizeTotal: 0,
                unpardonedLates: 0, // Track validation if needed
                jornadaData: {} // { jId: { hits, score, bonus, prize, isLate, isPardoned } }
            };
        });

        // Fast O(1) index for pronosticos
        const pronosticosMap = new Map();
        (this.pronosticos || []).forEach(p => {
            if (!p) return;
            const jIds = [p.jId, p.jornadaId].filter(x => x !== undefined && x !== null).map(String);
            const mIds = [p.mId, p.memberId].filter(x => x !== undefined && x !== null).map(String);
            jIds.forEach(jId => {
                mIds.forEach(mId => {
                    pronosticosMap.set(`${jId}_${mId}`, p);
                });
            });
        });

        finishedJornadas.forEach(j => {
            const officialResults = j.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(j.date);

            // Track min/max for coloring
            let maxScore = -Infinity;
            let minScore = Infinity;

            // First pass: Calculate scores for all members
            this.members.forEach(m => {
                // Find pronostico in O(1)
                const p = pronosticosMap.get(`${j.id}_${m.id}`);

                let hits = -1;
                let points = 0;
                let bonus = 0;
                let prize = 0;
                let isLate = false;
                let isPardoned = false;
                let potentialHits = null;

                if (p) {
                    const ev = ScoringSystem.evaluateMember(m, j, p);
                    if (ev.played) {
                        hits = ev.hits;
                        points = ev.points;
                        bonus = ev.bonus;
                        prize = ev.prize;
                        isLate = ev.isLate;
                        isPardoned = ev.isPardoned;
                        potentialHits = ev.potentialHits;
                        p.tempBreakdown = ev.tempBreakdown;
                    }
                }

                // Store
                memberStats[m.id].jornadaData[j.id] = { 
                    hits, points, bonus, prize, isLate, isPardoned,
                    potentialHits
                };

                if (hits !== -1) {
                    memberStats[m.id].grandTotal += points;
                    // Fix: Use potentialHits for baseTotal if late, so it matches the real performance
                    const hitsToSum = (memberStats[m.id].jornadaData[j.id].potentialHits !== null) ? memberStats[m.id].jornadaData[j.id].potentialHits : hits;
                    memberStats[m.id].baseTotal += hitsToSum;
                    memberStats[m.id].bonusTotal += bonus;
                    memberStats[m.id].prizeTotal += prize;

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
        theadHtml += `<tr><th class="col-temporada" style="z-index:3; padding:8px 4px; color:var(--resultados-header-text); line-height:1.2; text-align:center; white-space:normal; width:100px; max-width:110px; word-break:break-word;">TEMPORADA<br>${AppUtils.activeSeason || '2026-2027'}</th>`;

        sortedMembers.forEach(m => {
            // Apply equal sizing
            theadHtml += `<th style="z-index:2; width:80px; min-width:80px; vertical-align:middle; padding:10px 2px; word-wrap: break-word; white-space: normal; background-color: var(--resultados-header-bg);">
                            <div style="font-weight:bold; line-height:1.2; font-size:0.95rem; color:var(--resultados-header-text);">${AppUtils.getMemberName(m)}</div>
                            <div style="font-size:0.7rem; font-weight:normal; color:var(--resultados-header-text); opacity:0.8;">ID: ${m.id}</div>
                          </th>`;
        });
        theadHtml += `</tr>`;

        // 2. Grand Total (Sticky below names)
        theadHtml += `<tr class="total-row row-total">
                        <td class="sticky-col label-total">PUNTOS GENERAL</td>`;
        sortedMembers.forEach(m => {
            theadHtml += `<td class="accumulated-score" style="font-size: 1.6rem;">${memberStats[m.id].grandTotal}</td>`;
        });
        theadHtml += `</tr>`;

        // 3. Base Hits
        theadHtml += `<tr class="summary-row row-hits">
                        <td class="sticky-col label-hits">Puntos Semana</td>`;
        sortedMembers.forEach(m => {
            theadHtml += `<td style="color:var(--resultados-summary-row-text); background:var(--resultados-summary-row-bg);">${memberStats[m.id].baseTotal}</td>`;
        });
        theadHtml += `</tr>`;

        // 4. Bonus/Penalties
        theadHtml += `<tr class="summary-row row-bonus">
                        <td class="sticky-col label-bonus">Bonus / Penal.</td>`;
        sortedMembers.forEach(m => {
            const val = memberStats[m.id].bonusTotal;
            const color = val >= 0 ? 'var(--resultados-bonus-positive)' : 'var(--resultados-bonus-negative)';
            const sign = val > 0 ? '+' : '';
            theadHtml += `<td style="color:${color}; font-weight:bold; background:var(--resultados-summary-row-bg);">${sign}${val}</td>`;
        });
        theadHtml += `</tr>`;

        // 5. Total Prizes Money
        theadHtml += `<tr class="summary-row row-prizes">
                        <td class="sticky-col label-prizes">Premios (€)</td>`;
        sortedMembers.forEach(m => {
            const val = memberStats[m.id].prizeTotal;
            theadHtml += `<td style="color:var(--resultados-prize-text); font-weight:bold; background:var(--resultados-prize-bg); font-size:1.1rem;">${val.toFixed(2)}€</td>`;
        });
        theadHtml += `</tr>`;

        theadHtml += `</thead>`;

        // TBody
        let tbodyHtml = `<tbody>`;

        // Jornada Rows
        finishedJornadas.forEach(j => {
            const hasPig = j.matches && j.matches.some(m => m && typeof AppUtils !== 'undefined' && AppUtils.isPigMatch(m.home, m.away));
            tbodyHtml += `<tr>`;
            tbodyHtml += `<td style="font-size:0.9rem; border-right:2px solid #ddd;">
                            <div style="font-weight:bold; color:var(--resultados-jornada-number);">Jornada ${j.number}${hasPig ? ' 🐷' : ''}</div>
                            <div style="color:var(--resultados-jornada-date); font-size:0.8rem;">${j.date}</div>
                          </td>`;

            sortedMembers.forEach(m => {
                const data = memberStats[m.id].jornadaData[j.id];
                let cellHtml = '-';
                let styleClass = '';
                let cellStyle = '';

                if (data.hits !== -1) {
                    // MAIN CHANGE: Show HITS as main value
                    // If Bonus != 0, show it below.
                    let valDisplay = data.hits;
                    if (data.hits === 0 && data.potentialHits !== null) {
                        // Penalty case: struck through in clear gray (visible on black)
                        valDisplay = `<span style="text-decoration: line-through double; color: #bbb; opacity: 1;">${data.potentialHits}</span>`;
                    }
                    cellHtml = `<div style="font-size:1.3rem; font-weight:bold; color:var(--resultados-hits-number);">${valDisplay}</div>`;

                    if (data.bonus !== 0) {
                        const bColor = data.bonus > 0 ? 'var(--resultados-bonus-positive)' : 'var(--resultados-bonus-negative)';
                        const bSign = data.bonus > 0 ? '+' : '';
                        cellHtml += `<div style="font-size:0.8rem; font-weight:bold; color:${bColor};">${bSign}${data.bonus}</div>`;
                    }

                    if (data.prize > 0) {
                        cellHtml += `<div style="font-size:0.85rem; font-weight:bold; color:var(--resultados-prize-text); margin-top:2px;">${data.prize.toFixed(2)}€</div>`;
                    }

                    // Details tooltip
                    const bonusText = data.bonus !== 0 ? (data.bonus > 0 ? `+${data.bonus}` : `${data.bonus}`) : '0';
                    const prizeText = data.prize > 0 ? `\nPremio: ${data.prize.toFixed(2)}€` : '';
                    const title = `Puntos Totales: ${data.points}\n(Aciertos: ${data.hits} + Bonus: ${bonusText})${prizeText}`;

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

                    // Coloring based on POINTS
                    if (data.points === j.stats.maxScore) {
                        cellStyle += 'background-color:var(--resultados-winner-bg); color:var(--resultados-winner-text);';
                    } else if (data.points === j.stats.minScore) {
                        cellStyle += 'background-color:var(--resultados-loser-bg); color:var(--resultados-loser-text);';
                    }
                    
                    // Black background only for PENALTY (not for natural 0)
                    if (data.hits === 0 && data.potentialHits !== null) {
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

            // Send Telegram Notification
            try {
                const forgiverData = JSON.parse(sessionStorage.getItem('maulas_user'));
                const forgiverName = AppUtils.getMemberName(forgiverData);
                
                const forgiven = this.members.find(m => String(m.id) === String(mId));
                const forgivenName = AppUtils.getMemberName(forgiven);

                const jornada = this.jornadas.find(j => String(j.id) === String(jId));
                const jNum = jornada ? jornada.number : '?';

                if (window.TelegramService) {
                    await window.TelegramService.sendPardonNotification(forgiverName, forgivenName, jNum);
                }
            } catch (e) {
                console.error("Error sending pardon notification:", e);
            }

            this.calculateAndRender();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResultsManager();
});
