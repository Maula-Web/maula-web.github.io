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
        this.jornadas = await window.DataService.getAll('jornadas');
        this.pronosticos = await window.DataService.getAll('pronosticos');
        this.pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || [];

        this.jornadas.sort((a, b) => a.number - b.number);
        this.data = this.calculateData();

        this.createModal();
        this.renderTotalsList();

        // Show global stats by default
        this.renderGlobalStats();

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
                <div class="modal" style="max-width:95%; width:1200px; max-height:90vh; overflow-y:auto;">
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
                history: [],
                prizes: []
            };
        });

        const activeJornadas = this.jornadas.filter(j =>
            j.active && j.matches && j.matches[0] && j.matches[0].result
        );

        activeJornadas.forEach(j => {
            const officialResults = j.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(j.date);
            const minHits = j.minHitsToWin || 10;

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

                        // Identify Prize
                        if (hits >= minHits) {
                            const money = (j.prizeRates && j.prizeRates[hits]) || 0;
                            stats[m.id].prizes.push({
                                jornadaNum: j.number,
                                hits: hits,
                                money: money
                            });
                        }
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
            <div style="text-align:center; padding:0.5rem; color:#666; font-size:0.9rem; display:flex; justify-content:space-between; align-items:center;">
                <span>Selecciona hasta 4 socios para comparar en la gráfica.</span>
                <button onclick="window.app.renderDoublesList()" style="background:#6a1b9a; color:white; border:none; border-radius:4px; padding:6px 12px; cursor:pointer; font-weight:bold; font-size:0.8rem;">
                    🏆 Ver Quinielas de Dobles
                </button>
            </div>
            <table class="rankings-table" style="width:100%; background:white; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
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
                    <td style="padding:1rem; font-weight:bold;">
                        <a href="javascript:void(0)" onclick="window.app.showMemberSummary(${r.id}, '${r.name.replace(/'/g, "\\'")}')" style="color:#ffb300; text-decoration:none; border-bottom:1px dashed #ffb300;">
                            ${r.name}
                        </a>
                    </td>
                    <td style="padding:1rem; text-align:right; font-size:1.2rem; color:#ffb300; font-weight:bold;">${r.points}</td>
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


    calculateMemberStats(memberId = null) {
        const stats = {
            hitsByMatch: Array(14).fill(0),
            totalByMatch: Array(14).fill(0),
            teamStats: {},
            jornadaPerformance: {}, // { jornadaNum: { hits: 0, total: 0 } }
            memberId: memberId
        };

        // Process all played jornadas
        this.jornadas.forEach(j => {
            const hasResult = j.matches && j.matches[0] && j.matches[0].result;
            if (!hasResult) return;

            const targets = memberId ?
                this.members.filter(m => m.id == memberId) :
                this.members;

            if (!stats.jornadaPerformance[j.number]) {
                stats.jornadaPerformance[j.number] = { hits: 0, total: 0 };
            }

            targets.forEach(m => {
                const p = this.pronosticos.find(pred =>
                    (pred.jId == j.id || pred.jornadaId == j.id) &&
                    (pred.mId == m.id || pred.memberId == m.id)
                );

                if (!p) return;

                const selection = p.selection || p.forecasts || [];
                const results = j.matches.map(m => m.result);

                j.matches.forEach((m, idx) => {
                    if (idx >= 14) return; // Exclude Pleno al 15

                    const userVal = selection[idx];
                    const officialVal = results[idx];
                    const isHit = userVal === officialVal && officialVal !== '';

                    // Stats per match number
                    stats.totalByMatch[idx]++;
                    if (isHit) stats.hitsByMatch[idx]++;

                    // Stats per team
                    [m.home, m.away].forEach(team => {
                        if (!stats.teamStats[team]) {
                            stats.teamStats[team] = { hits: 0, total: 0 };
                        }
                        stats.teamStats[team].total++;
                        if (isHit) stats.teamStats[team].hits++;
                    });

                    // Performance per jornada
                    stats.jornadaPerformance[j.number].total++;
                    if (isHit) stats.jornadaPerformance[j.number].hits++;
                });
            });
        });

        return stats;
    }

    renderGlobalStats() {
        const stats = this.calculateMemberStats(null);
        this.renderStatsHTML("PEÑA COMPLETA", stats, null);
    }

    showMemberSummary(id, name) {
        const stats = this.calculateMemberStats(id);
        this.renderStatsHTML(name, stats, null);
    }

    renderStatsHTML(titleName, stats, jornadaData = null) {
        let detailSection = document.getElementById('chart-detail-section');
        if (!detailSection) {
            const chartContainer = document.getElementById('evolutionChart').parentElement;
            detailSection = document.createElement('div');
            detailSection.id = 'chart-detail-section';
            detailSection.style.marginTop = '1rem';
            detailSection.style.borderTop = '2px solid #eee';
            detailSection.style.paddingTop = '1rem';
            chartContainer.parentElement.appendChild(detailSection);
        }

        // Team Results (Weighted Analysis)
        const teamResults = Object.entries(stats.teamStats)
            .map(([name, data]) => {
                const rate = (data.hits / data.total);
                // Relevance formula: rate * sqrt of total matches to reward consistency and volume
                const relevance = rate * Math.sqrt(data.total);
                return { name, rate: rate * 100, total: data.total, relevance, hits: data.hits };
            })
            .sort((a, b) => b.relevance - a.relevance || b.total - a.total);

        const teamResultsHtml = teamResults.map(t => {
            // Reliability level based on matches played
            const reliability = Math.min(t.total / 10, 1) * 100; // 10 matches = 100% reliability icon
            const relColor = reliability > 70 ? '#2e7d32' : reliability > 40 ? '#f57f17' : '#9e9e9e';

            return `
                <div style="border-bottom:1px solid rgba(21, 101, 192, 0.1); padding:6px 0;">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:2px;">
                        <span style="font-weight:600; color:#1565c0;">${t.name}</span>
                        <span style="font-weight:bold; color:${t.rate >= 50 ? '#2e7d32' : '#d84315'}">${t.rate.toFixed(0)}%</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1; height:4px; background:rgba(21, 101, 192, 0.1); border-radius:2px; overflow:hidden;">
                            <div style="height:100%; width:${t.rate}%; background:${t.rate >= 50 ? '#1976d2' : '#ef9a9a'};"></div>
                        </div>
                        <span style="font-size:0.6rem; color:#1565c0; opacity: 0.8; white-space:nowrap;">${t.total} matches</span>
                        <div title="Fiabilidad estadística" style="width:8px; height:8px; border-radius:50%; background:${relColor};"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Match Results (ALL 1-14)
        let maxMatchRate = -1, minMatchRate = 101;
        stats.hitsByMatch.forEach((hits, idx) => {
            const total = stats.totalByMatch[idx];
            if (total > 0) {
                const rate = (hits / total * 100);
                if (rate > maxMatchRate) maxMatchRate = rate;
                if (rate < minMatchRate) minMatchRate = rate;
            }
        });

        const matchResultsHtml = stats.hitsByMatch.map((hits, idx) => {
            const total = stats.totalByMatch[idx];
            const rate = total > 0 ? (hits / total * 100) : 0;
            const isBest = total > 0 && rate === maxMatchRate;
            const isWorst = total > 0 && rate === minMatchRate;
            const style = isBest ? 'background:#e3f2fd; font-weight:bold; border-left:3px solid #0288d1; padding-left:4px;' :
                isWorst ? 'background:#ffebee; font-weight:bold; border-left:3px solid #d32f2f; padding-left:4px;' : '';

            return `
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:4px 0; border-bottom:1px solid rgba(255, 179, 0, 0.2); ${style}">
                    <span style="color:#ffb300;">Partido #${idx + 1} ${isBest ? '⭐' : isWorst ? '🚩' : ''}</span>
                    <span style="color:${rate >= 50 ? '#2e7d32' : '#d84315'}">${rate.toFixed(0)}%</span>
                </div>
            `;
        }).join('');

        // Current Jornada view (optional)
        let leftColumn = '';
        if (jornadaData) {
            leftColumn = `
                <div style="border-right:1px solid #eee; padding-right:1rem;">
                    <h4 style="margin:0 0 0.8rem 0; font-size:0.9rem; color:#546e7a; text-transform:uppercase;">Resultado Jornada</h4>
                    <div style="display:flex; justify-content:space-around; background:#f5f7f9; padding:0.8rem; border-radius:8px; margin-bottom:1rem;">
                        <div style="text-align:center;">
                            <div style="font-size:1.4rem; font-weight:bold; color:var(--primary-orange);">${jornadaData.y}</div>
                            <div style="font-size:0.65rem; color:#777; font-weight:bold;">ACUMULADO</div>
                        </div>
                        <div style="text-align:center;">
                            <div style="font-size:1.4rem; font-weight:bold; color:#2e7d32;">+${jornadaData.dayPoints}</div>
                            <div style="font-size:0.65rem; color:#777; font-weight:bold;">PUNTOS J.</div>
                        </div>
                        <div style="text-align:center;">
                            <div style="font-size:1.4rem; font-weight:bold; color:#1976d2;">${jornadaData.dayHits}</div>
                            <div style="font-size:0.65rem; color:#777; font-weight:bold;">ACIERTOS J.</div>
                        </div>
                    </div>
                    <div style="max-height:430px; overflow-y:auto; border-radius:6px; border:1px solid #f0f0f0;">
                        ${jornadaData.matchesHtml}
                    </div>
                </div>
            `;
        } else {
            // Summary for global view
            const totalSocios = this.members.length;
            const playedJornadas = this.jornadas.filter(j => j.matches && j.matches[0] && j.matches[0].result).length;

            leftColumn = `
                <div style="border-right:1px solid #eee; padding-right:1rem; display:flex; flex-direction:column; justify-content:center;">
                    <div style="text-align:center; padding:2rem; background:#fff3e0; border-radius:12px; border:1px solid #ffe0b2;">
                        <div style="font-size:3rem; margin-bottom:1rem;">🏆</div>
                        <h4 style="margin:0; color:var(--primary-orange); line-height:1.2;">Resumen Acumulado<br>Toda la Peña</h4>
                        <div style="margin-top:2rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                            <div style="background:white; padding:1rem; border-radius:8px;">
                                <div style="font-size:1.5rem; font-weight:bold; color:#558b2f;">${totalSocios}</div>
                                <div style="font-size:0.7rem; color:#666; font-weight:bold; text-transform:uppercase;">Socios</div>
                            </div>
                            <div style="background:white; padding:1rem; border-radius:8px;">
                                <div style="font-size:1.5rem; font-weight:bold; color:#1976d2;">${playedJornadas}</div>
                                <div style="font-size:0.7rem; color:#666; font-weight:bold; text-transform:uppercase;">Jornadas</div>
                            </div>
                        </div>
                        <p style="margin-top:1.5rem; font-size:0.85rem; color:#795548; font-style:italic;">
                            Haz clic en un punto de la gráfica para ver el estudio individual de un socio y su jornada.
                        </p>
                    </div>
                </div>
            `;
        }

        // Jornada analysis
        const jornadaList = Object.entries(stats.jornadaPerformance)
            .map(([num, data]) => ({
                num: parseInt(num),
                rate: (data.hits / data.total * 100),
                hits: data.hits
            }))
            .sort((a, b) => a.num - b.num);

        let maxRate = -1, minRate = 101;
        jornadaList.forEach(j => {
            if (j.rate > maxRate) maxRate = j.rate;
            if (j.rate < minRate) minRate = j.rate;
        });

        const jPerformanceHtml = jornadaList.map(j => {
            const isBest = j.rate === maxRate && maxRate !== -1;
            const isWorst = j.rate === minRate && minRate !== 101;
            const barColor = isBest ? '#0288d1' : (isWorst ? '#d32f2f' : '#558b2f');
            const textColor = isBest ? '#01579b' : (isWorst ? '#c62828' : '#33691e');
            const bgColor = isBest ? '#e1f5fe' : (isWorst ? '#ffcdd2' : '#c5e1a5');

            return `
                <div style="flex: 0 0 55px; display:flex; flex-direction:column; align-items:center; border-radius:4px; padding:4px; background:${isBest || isWorst ? bgColor : 'transparent'};">
                    <div style="font-size:0.6rem; font-weight:bold; color:${textColor}; text-align:center; line-height:1.1;">
                        J${j.num}<br>${j.rate.toFixed(0)}%
                    </div>
                    <div style="width:12px; height:40px; background:#e0e0e0; border-radius:10px; position:relative; margin:4px 0; overflow:hidden;">
                        <div style="width:100%; height:${j.rate}%; background:${barColor}; position:absolute; bottom:0; transition: height 0.3s;"></div>
                    </div>
                    <div style="font-size:0.65rem; font-weight:bold; color:#555;">
                        ${(j.hits / (titleName === "PEÑA COMPLETA" ? this.members.length : 1)).toFixed(0)} ac.
                    </div>
                </div>
            `;
        }).join('');

        const bestJs = jornadaList.filter(j => j.rate === maxRate).map(j => j.num);

        // Summary Text Generation - Using Relevance instead of raw rate
        const mostRelevantTeam = teamResults[0] || { name: 'N/A', rate: 0 };

        const bestJText = bestJs.length > 1 ? `las Jornadas ${bestJs.join(', ')}` : `la Jornada ${bestJs[0]}`;

        const summaryText = titleName === "PEÑA COMPLETA"
            ? `La peña mantiene una efectividad media del **${(jornadaList.reduce((a, b) => a + b.rate, 0) / jornadaList.length || 0).toFixed(0)}%**. El equipo más fiable estadísticamente es el **${mostRelevantTeam.name}** (acierto del ${mostRelevantTeam.rate.toFixed(0)}% en ${mostRelevantTeam.total} partidos), mientras que **${bestJText}** han sido el techo histórico de la temporada.`
            : `**${titleName}** destaca especialmente en el **Partido #${stats.hitsByMatch.indexOf(Math.max(...stats.hitsByMatch)) + 1}**. Su mejor rendimiento se concentra en el **${mostRelevantTeam.name}** (${mostRelevantTeam.rate.toFixed(0)}% de acierto en ${mostRelevantTeam.total} partidos), con su pico máximo en **${bestJText}**.`;

        detailSection.innerHTML = `
            <div style="background:white; padding:1rem; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.1); border:1px solid #eee;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:2px solid var(--primary-orange); padding-bottom:0.8rem;">
                    <h3 style="margin:0; color:var(--primary-orange); display:flex; align-items:center; gap:0.5rem;">
                        <span style="background:var(--primary-orange); color:white; padding:2px 8px; border-radius:4px;">📊</span>
                        ${titleName === "PEÑA COMPLETA" ? "ESTUDIO ESTADÍSTICO - PEÑA COMPLETA" : "Resumen de " + titleName}
                    </h3>
                    <button onclick="document.getElementById('chart-detail-section').innerHTML=''; window.app.renderGlobalStats();" style="background:var(--primary-orange); color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:bold; font-size:0.8rem; box-shadow:0 2px 4px rgba(0,0,0,0.1); transition:all 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        Ver datos Peña
                    </button>
                </div>

                <div class="stats-detail-main-grid">
                    <!-- LEFT COLUMN -->
                    ${leftColumn}

                    <!-- RIGHT COLUMN: HISTORICAL STUDY -->
                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        ${titleName !== "PEÑA COMPLETA" ? `<h4 style="margin:0; font-size:0.9rem; color:#d84315; text-transform:uppercase;">📊 ESTUDIO ESTADÍSTICO - ${titleName.toUpperCase()}</h4>` : ''}
                        
                        <!-- Summary Text Box -->
                        <div style="background:#fff3e0; padding:0.8rem; border-radius:8px; border:1px solid #ffe0b2; font-size:0.85rem; color:#5d4037; line-height:1.4;">
                            ${summaryText.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--primary-orange)">$1</strong>')}
                        </div>

                        <div class="stats-sub-grid">
                            <!-- MATCH STATS -->
                            <div style="background:#fffde7; padding:0.8rem; border-radius:8px; border-top:4px solid #ffb300;">
                                <h5 style="margin:0 0 0.5rem 0; font-size:0.75rem; color:#ffb300; text-transform:uppercase; font-weight: 800;">ACIERTO POR PARTIDO</h5>
                                <div style="max-height:150px; overflow-y:auto; padding-right:5px;">
                                    ${matchResultsHtml}
                                </div>
                            </div>

                            <!-- TEAM STATS -->
                            <div style="background:#e3f2fd; padding:0.8rem; border-radius:8px; border-top:4px solid #1976d2;">
                                <h5 style="margin:0 0 0.5rem 0; font-size:0.75rem; color:#1976d2; text-transform:uppercase; font-weight: 800;">ACIERTO POR EQUIPOS</h5>
                                <div style="max-height:150px; overflow-y:auto; padding-right:5px;">
                                    ${teamResultsHtml}
                                </div>
                            </div>
                        </div>

                        ${this.renderPrizesHTML(stats.memberId)}

                        <div style="background:#f1f8e9; padding:1rem; border-radius:8px; border-left:4px solid #7cb342;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                                <h5 style="margin:0; font-size:0.8rem; color:#33691e; text-transform:uppercase;">RENDIMIENTO POR JORNADA</h5>
                                <div style="display:flex; gap:8px; font-size:0.6rem; font-weight:bold;">
                                    <span style="color:#01579b;">● MEJOR</span>
                                    <span style="color:#c62828;">● PEOR</span>
                                </div>
                            </div>
                            <div style="display:flex; gap:5px; overflow-x:auto; padding:5px 0 10px 0; scrollbar-width: thin;">
                                ${jPerformanceHtml}
                            </div>
                        </div>

                        <div style="font-size:0.7rem; color:#999; text-align:center; font-style:italic;">
                            * Basado en los 14 partidos base. Las jornadas se resaltan por su porcentaje de acierto relativo.
                        </div>
                    </div>
                </div>
            </div >
            `;
        detailSection.scrollIntoView({ behavior: 'smooth' });
    }

    showPointDetail(memberName, pointData) {
        const stats = this.calculateMemberStats(pointData.memberId);
        const jornada = this.jornadas.find(j => j.id == pointData.jornadaId);
        const pronostico = this.pronosticos.find(p =>
            (p.jId == pointData.jornadaId || p.jornadaId == pointData.jornadaId) &&
            (p.mId == pointData.memberId || p.memberId == pointData.memberId)
        );

        const selection = (pronostico && (pronostico.selection || pronostico.forecasts)) || [];

        // 1. Matches Table (Current Jornada)
        let matchesHtml = '';
        if (jornada && jornada.matches) {
            matchesHtml = `
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead>
                        <tr style="background:#546e7a; color:white;">
                            <th style="padding:4px;">#</th>
                            <th style="padding:4px; text-align:left;">Partido</th>
                            <th style="padding:4px; text-align:center;">Resultado</th>
                            <th style="padding:4px; text-align:center;">Pronóstico</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            jornada.matches.forEach((m, idx) => {
                const userVal = selection[idx] || '-';
                const officialVal = m.result;
                const isHit = userVal === officialVal && officialVal !== '';
                const color = isHit ? '#2e7d32' : (userVal !== '-' ? '#d32f2f' : '#999');
                const rowBg = isHit ? '#e8f5e9' : 'transparent';

                matchesHtml += `
                    <tr style="border-bottom:1px solid #eee; background-color:${rowBg};">
                        <td style="padding:4px; text-align:center; color:#666;">${idx + 1}</td>
                        <td style="padding:4px;">
                            <span style="font-weight:600;">${m.home}</span> - <span style="font-weight:600;">${m.away}</span>
                        </td>
                        <td style="padding:4px; text-align:center; font-weight:bold;">${officialVal}</td>
                        <td style="padding:4px; text-align:center; font-weight:bold; color:${color};">${userVal}</td>
                    </tr>
                `;
            });
            matchesHtml += '</tbody></table>';
        }

        // Check for Doubles in this Jornada
        const doublesP = this.pronosticosExtra.find(p =>
            (p.jId == pointData.jornadaId || p.jornadaId == pointData.jornadaId) &&
            (p.mId == pointData.memberId || p.memberId == pointData.memberId)
        );

        if (doublesP && jornada.matches) {
            const officialResults = jornada.matches.map(m => m.result);
            const dSel = doublesP.selection || [];
            let hits = 0;
            dSel.forEach((sel, idx) => {
                const res = officialResults[idx];
                if (res && sel && sel.includes(res)) hits++;
            });

            matchesHtml += `
                <div style="margin-top:1rem; background:#f3e5f5; padding:0.5rem; border-radius:6px; border:1px dashed #6a1b9a;">
                    <strong style="color:#6a1b9a;">🏆 Quiniela de Dobles Jugada:</strong> 
                    <span style="font-weight:bold; font-size:1.1rem; margin-left:10px;">${hits} Aciertos</span>
                    <div style="font-size:0.75rem; color:#555; margin-top:4px;">
                        Pronósticos: ${dSel.slice(0, 14).join(', ') || 'N/A'} (P15: ${dSel[14] || '-'})
                    </div>
                </div>
            `;
        }

        // Prepare data for renderStatsHTML
        const jornadaData = {
            matchesHtml: matchesHtml,
            y: pointData.y,
            dayPoints: pointData.dayPoints,
            dayHits: pointData.dayHits,
            jornadaNum: pointData.jornadaNum
        };

        this.renderStatsHTML(memberName, stats, jornadaData);
    }

    renderDoublesList() {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-detail-content');
        const title = document.getElementById('modal-detail-title');

        if (!modal || !content) return;

        title.textContent = "Histórico de Quinielas de Dobles";

        // Gather all doubles
        const doublesData = [];
        this.pronosticosExtra.forEach((p) => {
            const m = this.members.find(mem => mem.id == (p.mId || p.memberId));
            const j = this.jornadas.find(jor => jor.id == (p.jId || p.jornadaId));

            if (m && j) {
                // Evaluate
                const officialResults = j.matches ? j.matches.map(mat => mat.result) : [];
                let hits = 0;
                const sel = p.selection || [];
                if (officialResults.length > 0) {
                    sel.forEach((s, idx) => {
                        const res = officialResults[idx];
                        if (res && s && s.includes(res)) hits++;
                    });
                }

                doublesData.push({
                    jornadaNum: j.number,
                    memberName: m.name,
                    hits: hits,
                    selection: sel,
                    date: p.date
                });
            }
        });

        doublesData.sort((a, b) => b.jornadaNum - a.jornadaNum);

        let html = `
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f48100; color:white;">
                        <th style="padding:8px;">Jornada</th>
                        <th style="padding:8px; text-align:left;">Socio</th>
                        <th style="padding:8px; text-align:center;">Aciertos</th>
                        <th style="padding:8px; text-align:left;">Pronóstico</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (doublesData.length === 0) {
            html += `<tr><td colspan="4" style="padding:1rem; text-align:center; color:#777;">Aún no se han jugado quinielas de dobles.</td></tr>`;
        } else {
            doublesData.forEach(d => {
                html += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px; text-align:center; font-weight:bold;">J${d.jornadaNum}</td>
                        <td style="padding:8px;">${d.memberName}</td>
                        <td style="padding:8px; text-align:center;">
                            <span style="background:${d.hits >= 10 ? '#e8f5e9' : '#fff3e0'}; color:${d.hits >= 10 ? '#2e7d32' : '#f48100'}; padding:2px 8px; border-radius:12px; font-weight:bold;">
                                ${d.hits}
                            </span>
                        </td>
                         <td style="padding:8px; font-size:0.75rem; color:#fff; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${d.selection.join(', ')}
                        </td>
                    </tr>
                `;
            });
        }

        html += '</tbody></table>';

        content.innerHTML = html;
        modal.classList.add('active');
    }

    renderPrizesHTML(memberId) {
        if (!memberId || !this.data.stats[memberId]) return '';

        const prizes = this.data.stats[memberId].prizes || [];
        if (prizes.length === 0) {
            return `
                <div style="background:#f5f5f5; padding:0.8rem; border-radius:8px; border-left:4px solid #9e9e9e;">
                    <h5 style="margin:0; font-size:0.8rem; color:#616161; text-transform:uppercase;">🏆 PREMIOS OBTENIDOS</h5>
                    <p style="margin:0.5rem 0 0 0; font-size:0.8rem; color:#757575; font-style:italic;">Aún no se han obtenido premios esta temporada.</p>
                </div>
            `;
        }

        const itemsHtml = prizes.map(p => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #eee;">
                <span style="font-weight:600; font-size:0.85rem;">Jornada ${p.jornadaNum}</span>
                <div style="display:flex; gap:10px; align-items:center;">
                    <span style="background:#e8f5e9; color:#2e7d32; font-weight:bold; padding:2px 8px; border-radius:10px; font-size:0.75rem;">${p.hits} aciertos</span>
                    <span style="color:var(--primary-blue); font-weight:bold; font-size:0.85rem;">${p.money > 0 ? p.money.toFixed(2) + '€' : '-'}</span>
                </div>
            </div>
        `).join('');

        const totalMoney = prizes.reduce((s, p) => s + p.money, 0);

        return `
            <div style="background:#e8f5e9; padding:0.8rem; border-radius:8px; border-left:4px solid #2e7d32;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <h5 style="margin:0; font-size:0.8rem; color:#1b5e20; text-transform:uppercase;">🏆 PREMIOS OBTENIDOS</h5>
                    <span style="font-size:0.85rem; font-weight:bold; color:var(--primary-blue);">Total: ${totalMoney.toFixed(2)}€</span>
                </div>
                <div style="max-height:120px; overflow-y:auto; padding-right:5px;">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResumenManager();
});
