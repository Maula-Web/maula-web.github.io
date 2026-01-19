const TelegramService = {
    async sendJornadaReport(jId) {
        if (!window.DataService) return;

        try {
            // 1. Get Config
            const config = await window.DataService.getAll('config');
            const tg = config.find(c => c.id === 'telegram');
            if (!tg || !tg.enabled || !tg.token || !tg.chatId) {
                console.log("TelegramService: Disabled or not configured.");
                return;
            }

            // 2. Fetch Data
            const members = await window.DataService.getAll('members');
            const jornadas = await window.DataService.getAll('jornadas');
            const pronosticos = await window.DataService.getAll('pronosticos');
            const pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || [];

            // 3. Process Data
            const activeJornadas = jornadas.filter(j =>
                j.active && j.matches && j.matches[0] && j.matches[0].result
            );

            // Calculate GLOBAL Stats
            const globalStats = {};
            members.forEach(m => globalStats[m.id] = { name: m.name, totalPoints: 0 });

            activeJornadas.forEach(aj => {
                const ajResults = aj.matches.map(m => m.result);
                const ajDate = AppUtils.parseDate(aj.date);
                members.forEach(m => {
                    const p = pronosticos.find(pred => (pred.jId == aj.id || pred.jornadaId == aj.id) && (pred.mId == m.id || pred.memberId == m.id));
                    if (p && p.selection) {
                        const ev = ScoringSystem.evaluateForecast(p.selection, ajResults, ajDate);
                        globalStats[m.id].totalPoints += ev.points;
                    }
                });
            });

            // Current Jornada Stats (for the specific jId)
            const currentJ = jornadas.find(jor => jor.id == jId);
            if (!currentJ) return;
            const officialResults = currentJ.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(currentJ.date);
            const minHits = currentJ.minHitsToWin || 10;

            const currentResults = members.map(m => {
                const p = pronosticos.find(pred => (pred.jId == currentJ.id || pred.jornadaId == currentJ.id) && (pred.mId == m.id || pred.memberId == m.id));
                let hits = 0;
                let points = 0;
                if (p && p.selection) {
                    const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
                    hits = ev.hits;
                    points = ev.points;
                }
                const prize = (hits >= minHits) ? ((currentJ.prizeRates && currentJ.prizeRates[hits]) || 0) : 0;
                return { name: m.name, hits, points, prize };
            }).sort((a, b) => b.points - a.points || b.hits - a.hits);

            // 4. Extra/Doubles
            const extras = pronosticosExtra.filter(p => (p.jId == currentJ.id || p.jornadaId == currentJ.id));
            const extraStats = extras.map(p => {
                const mem = members.find(m => m.id == (p.mId || p.memberId));
                let hits = 0;
                const sel = p.selection || [];
                sel.forEach((s, idx) => {
                    if (officialResults[idx] && s && s.includes(officialResults[idx])) hits++;
                });
                return { name: mem ? mem.name : 'Socio', hits };
            });

            // 5. Build Message
            let msg = `🏆 *PEÑA MAULAS - REPORTE JORNADA ${currentJ.number}* 🏆\n`;
            msg += `📅 _${currentJ.date}_\n\n`;

            msg += `*📊 RESULTADOS DEL DÍA:*\n`;
            currentResults.forEach((r, idx) => {
                let medal = '';
                if (idx === 0) medal = '🥇 ';
                if (idx === 1) medal = '🥈 ';
                if (idx === 2) medal = '🥉 ';

                msg += `${medal}${r.name}: *${r.hits}* ac. (${r.points} pts)${r.prize > 0 ? ` 💰 *${r.prize.toFixed(2)}€*` : ''}\n`;
            });

            if (extraStats.length > 0) {
                msg += `\n*✨ QUINIELAS EXTRA/DOBLES:*\n`;
                extraStats.forEach(e => {
                    msg += `🔹 ${e.name}: *${e.hits}* aciertos\n`;
                });
            }

            // Winner / Loser
            const winner = currentResults[0];
            const loser = [...currentResults].reverse().find(r => r.hits !== -1);
            msg += `\n*🌟 DESTACADOS:*`;
            msg += `\n🔝 Ganador J${currentJ.number}: *${winner.name}*`;
            if (loser && loser !== winner) msg += `\n🐢 Farolillo J${currentJ.number}: *${loser.name}*`;

            // Global Ranking (TOP 5)
            const ranking = Object.values(globalStats).sort((a, b) => b.totalPoints - a.totalPoints);
            msg += `\n\n*🏆 CLASIFICACIÓN GENERAL (TOP 5):*\n`;
            ranking.slice(0, 5).forEach((r, idx) => {
                msg += `${idx + 1}. ${r.name}: *${r.totalPoints}* pts\n`;
            });

            msg += `\n🔗 [Consultar Web Completa](https://peñamaulas.com)`;

            // 6. Send
            await this.sendRaw(tg.token, tg.chatId, msg);

        } catch (e) {
            console.error("TelegramService Error:", e);
        }
    },

    async sendRaw(token, chatId, text) {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
        return await res.json();
    }
};
