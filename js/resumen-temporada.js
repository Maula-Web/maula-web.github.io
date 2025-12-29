class ResumenManager {
    constructor() {
        this.members = [];
        this.jornadas = [];
        this.pronosticos = [];

        // Selection state
        this.selectedMembers = new Set();
        this.chart = null;

        this.init();
    }

    async init() {
        if (window.DataService) await window.DataService.init();

        this.members = await window.DataService.getAll('members');
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');

        // Ensure we have sorted jornadas
        this.jornadas.sort((a, b) => a.number - b.number);

        this.createModal();
        this.renderTotalsList();

        // Auto select top 4 logic moved here to ensure data is ready
        this.autoSelectTop4();
    }

    autoSelectTop4() {
        // Simple delay to ensure DOM render if needed, though sequential it should be mostly fine.
        // But renderTotalsList modifies innerHTML, which is synchronous.
        const inputs = document.querySelectorAll('#rankings-table-wrapper input[type="checkbox"]');
        let count = 0;
        inputs.forEach(inp => {
            if (count < 4) {
                inp.checked = true;
                const onChangeAttr = inp.getAttribute('onchange');
                const idMatch = onChangeAttr && onChangeAttr.match(/toggleSelection\((\d+)/);
                if (idMatch) {
                    this.selectedMembers.add(parseInt(idMatch[1]));
                }
                count++;
            }
        });
        if (inputs.length > 0) this.renderChart();
    }

    createModal() {
        // Inject modal if not exists
        if (!document.getElementById('detail-modal')) {
            const modal = document.createElement('div');
            modal.id = 'detail-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal" style="max-width:500px;">
                    <h2 id="modal-detail-title" style="margin-top:0;">Detalle</h2>
                    <div id="modal-detail-content"></div>
                    <div style="margin-top:1rem; text-align:right;">
                        <button class="btn-action" onclick="document.getElementById('detail-modal').classList.remove('active')">Cerrar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    }

    calculateData() {
        // Prepare structure
        const stats = {};
        this.members.forEach(m => {
            stats[m.id] = {
                name: m.name,
                points: 0,
                history: []
            };
        });

        const activeJornadas = this.jornadas.filter(j =>
            j.active && j.matches && j.matches[0] && j.matches[0].result
        );

        activeJornadas.forEach(j => {
            const officialResults = j.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(j.date);

            this.members.forEach(m => {
                const p = this.pronosticos.find(pred => (pred.jId === j.id || pred.jornadaId === j.id) && (pred.mId === m.id || pred.memberId === m.id));
                let points = 0;
                let hits = 0;

                if (p) {
                    const sel = p.selection || p.forecasts || [];
                    const isLate = p.late;
                    const isPardoned = p.pardoned;

                    if (isLate && !isPardoned) {
                        points = ScoringSystem.calculateScore(0, jDate);
                    } else {
                        const ev = ScoringSystem.evaluateForecast(sel, officialResults, jDate);
                        points = ev.points;
                        hits = ev.hits;
                    }
                }

                stats[m.id].points += points;
                stats[m.id].history.push({
                    x: 'J' + j.number,
                    y: stats[m.id].points,
                    jornadaId: j.id,
                    memberId: m.id, // Store ID for lookup
                    jornadaNum: j.number,
                    dayPoints: points,
                    dayHits: hits
                });
            });
        });

        return { stats, jornadas: activeJornadas };
    }

    renderTotalsList() {
        const container = document.getElementById('rankings-table-wrapper');
        if (!container) return;

        const { stats } = this.calculateData();
        const ranking = Object.entries(stats)
            .map(([id, s]) => ({ id: parseInt(id), ...s }))
            .sort((a, b) => b.points - a.points);

        let html = `
            <div style="text-align:center; padding:0.5rem; color:#666; font-size:0.9rem;">
                Selecciona hasta 4 socios para comparar en la gráfica.
            </div>
            <table class="rankings-table" style="width:100%; max-width:700px; margin:0 auto; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <thead style="background:var(--primary-purple); color:white;">
                    <tr>
                        <th style="padding:.5rem;">Ver</th>
                        <th style="padding:1rem;">Pos.</th>
                        <th style="padding:1rem; text-align:left;">Socio</th>
                        <th style="padding:1rem; text-align:right;">Puntos Totales</th>
                    </tr>
                </thead>
                <tbody>
        `;

        ranking.forEach((r, idx) => {
            let medal = '';
            if (idx === 0) medal = '🥇';
            if (idx === 1) medal = '🥈';
            if (idx === 2) medal = '🥉';

            const isChecked = this.selectedMembers.has(r.id) ? 'checked' : '';

            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="text-align:center;">
                        <input type="checkbox" onchange="window.app.toggleSelection(${r.id}, this)" ${isChecked}>
                    </td>
                    <td style="padding:1rem; text-align:center;">${medal || (idx + 1)}</td>
                    <td style="padding:1rem; font-weight:bold;">${r.name}</td>
                    <td style="padding:1rem; text-align:right; font-size:1.2rem; color:var(--primary-purple); font-weight:bold;">${r.points}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Auto select top 4 if selection is empty and list not empty
        if (this.selectedMembers.size === 0 && ranking.length > 0) {
            ranking.slice(0, 4).forEach(r => this.selectedMembers.add(r.id));
        }
    }

    toggleSelection(id, checkbox) {
        if (checkbox.checked) {
            if (this.selectedMembers.size >= 4) {
                alert('Máximo 4 socios permitidos en la gráfica.');
                checkbox.checked = false;
                return;
            }
            this.selectedMembers.add(id);
        } else {
            this.selectedMembers.delete(id);
        }
        this.renderChart();
    }

    renderChart() {
        const ctx = document.getElementById('evolutionChart');
        if (!ctx) return;

        const { stats, jornadas } = this.calculateData();
        const labels = jornadas.map(j => 'J' + j.number);

        const datasets = [];
        this.members.forEach((m, i) => {
            if (this.selectedMembers.has(m.id)) {
                const s = stats[m.id];
                // Fixed Colors: Blue, Green, Red, Yellow
                const fixedColors = ['#2b5788', '#2e7d32', '#c30000', '#fbc02d'];
                const color = fixedColors[i % 4];

                datasets.push({
                    label: s.name,
                    data: s.history.map(h => h.y),
                    fullData: s.history,
                    borderColor: color,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 6,
                    pointHoverRadius: 8
                });
            }
        });

        if (this.chart) this.chart.destroy();

        if (datasets.length === 0) return;

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const el = elements[0];
                        const dataset = this.chart.data.datasets[el.datasetIndex];
                        const index = el.index;
                        const pointData = dataset.fullData[index];
                        const memberName = dataset.label;

                        this.showPointDetail(memberName, pointData);
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 10, padding: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed.y;
                                const d = context.dataset.fullData[context.dataIndex];
                                return `${context.dataset.label}: ${val} pts (+${d.dayPoints})`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Puntos Acumulados' }
                    }
                }
            }
        });
    }


    showPointDetail(memberName, pointData) {
        let detailSection = document.getElementById('chart-detail-section');
        if (!detailSection) {
            const chartContainer = document.getElementById('evolutionChart').parentElement;
            detailSection = document.createElement('div');
            detailSection.id = 'chart-detail-section';
            // Adjusted styles for compact fit
            detailSection.style.marginTop = '1rem';
            detailSection.style.borderTop = '2px solid #eee';
            detailSection.style.paddingTop = '0.5rem';
            detailSection.style.minHeight = '300px';
            chartContainer.parentElement.appendChild(detailSection);
        }

        const jornada = this.jornadas.find(j => j.id == pointData.jornadaId);

        const pronostico = this.pronosticos.find(p =>
            (p.jId == pointData.jornadaId || p.jornadaId == pointData.jornadaId) &&
            (p.mId == pointData.memberId || p.memberId == pointData.memberId)
        );

        const selection = (pronostico && (pronostico.selection || pronostico.forecasts)) || [];

        let matchesHtml = '';
        if (jornada && jornada.matches) {
            matchesHtml = `
                <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:0.85rem;">
                    <thead>
                        <tr style="background:#546e7a; color:white;">
                            <th style="padding:4px;">Encuentro</th>
                            <th style="padding:4px;">Resultado</th>
                            <th style="padding:4px;">Pronóstico</th>
                            <th style="padding:4px;">ACIERTOS</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            jornada.matches.forEach((m, idx) => {
                const userVal = selection[idx] || '-';
                const officialVal = m.result;
                const isHit = userVal === officialVal && officialVal !== '';
                const color = isHit ? 'green' : (userVal !== '-' ? '#d32f2f' : '#999');
                const icon = isHit ? '✅' : (userVal !== '-' ? '❌' : '⚪');
                const rowBg = isHit ? '#e8f5e9' : 'transparent';

                const homeLogo = `<img src="${AppUtils.getTeamLogo(m.home)}" onerror="this.style.display='none'" style="height:20px; vertical-align:middle; margin-right:4px;">`;
                const awayLogo = `<img src="${AppUtils.getTeamLogo(m.away)}" onerror="this.style.display='none'" style="height:20px; vertical-align:middle; margin-left:4px;">`;

                matchesHtml += `
                    <tr style="border-bottom:1px solid #eee; background-color:${rowBg};">
                        <td style="padding:3px; text-align:center;">
                            <div style="display:flex; align-items:center; justify-content:center; white-space:nowrap;">
                                ${homeLogo} <span style="font-weight:bold;">${m.home}</span> <span style="margin:0 4px;">-</span> <span style="font-weight:bold;">${m.away}</span> ${awayLogo}
                            </div>
                        </td>
                        <td style="padding:3px; font-weight:bold; text-align:center; font-size:0.9rem;">${officialVal}</td>
                        <td style="padding:3px; font-weight:bold; text-align:center; color:${color}; font-size:0.9rem;">${userVal}</td>
                        <td style="padding:3px; text-align:center;">${icon}</td>
                    </tr>
                `;
            });
            matchesHtml += '</tbody></table>';
        } else {
            matchesHtml = '<div style="padding:1rem; text-align:center; color:#999;">Datos no encontrados.</div>';
        }

        detailSection.innerHTML = `
            <div style="background:white; padding:0.5rem 1rem; border-radius:8px; box-shadow:0 1px 5px rgba(0,0,0,0.1); height:100%; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; border-bottom:1px solid #ddd; padding-bottom:0.2rem;">
                    <h3 style="margin:0; color:var(--primary-purple); font-size:1.1rem;">${memberName} - J${pointData.jornadaNum}</h3>
                    <button onclick="document.getElementById('chart-detail-section').innerHTML=''; document.getElementById('chart-detail-section').style.minHeight='0';" style="background:none; border:none; cursor:pointer; font-size:1.1rem;">✖️</button>
                </div>

                <div style="display:flex; justify-content:space-around; align-items:center; margin-bottom:0.5rem; background:#f9f9f9; padding:0.5rem; border-radius:4px;">
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem; font-weight:bold; color:var(--primary-purple);">${pointData.y}</div>
                        <div style="font-size:0.7rem; color:#666;">Total</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.2rem; font-weight:bold; color:#2e7d32;">+${pointData.dayPoints}</div>
                        <div style="font-size:0.7rem; color:#666;">Jornada</div>
                    </div>
                    <div style="text-align:center;">
                         <div style="font-size:1.2rem; font-weight:bold; color:#1976d2;">${pointData.dayHits}</div>
                         <div style="font-size:0.7rem; color:#666;">Aciertos</div>
                    </div>
                </div>
                
                <div style="overflow-y:auto; flex:1;">
                    ${matchesHtml}
                </div>
            </div>
        `;

        detailSection.scrollIntoView({ behavior: 'smooth' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResumenManager();
});
