window.TelegramService = {
    async sendJornadaReport(jId, manualConfig = null) {
        if (!window.DataService) return;

        try {
            // 1. Get Config
            let tg = manualConfig;
            if (!tg) {
                const config = await window.DataService.getAll('config');
                tg = config.find(c => c.id === 'telegram');
            }

            if (!tg || (!manualConfig && !tg.enabled) || !tg.token || !tg.chatId) return;

            // 2. Fetch Data
            const members = await window.DataService.getAll('members');
            const jornadas = await window.DataService.getAll('jornadas');
            const pronosticos = await window.DataService.getAll('pronosticos');
            const pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || [];

            const currentJ = jornadas.find(jor => jor.id == jId);
            if (!currentJ) return;

            // 3. Process GLOBAL Classification
            const activeJornadas = jornadas.filter(j =>
                j.active && j.matches && j.matches[0] && j.matches[0].result
            );
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

            // 4. Current Jornada Stats
            const officialResults = currentJ.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(currentJ.date);
            const minHits = currentJ.minHitsToWin || 10;

            const currentResults = members.map(m => {
                const p = pronosticos.find(pred => (pred.jId == currentJ.id || pred.jornadaId == currentJ.id) && (pred.mId == m.id || pred.memberId == m.id));
                let hits = 0;
                let points = 0;
                let played = false;
                if (p && p.selection) {
                    played = true;
                    const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
                    hits = ev.hits;
                    points = ev.points;
                }
                const prize = (hits >= minHits) ? ((currentJ.prizeRates && currentJ.prizeRates[hits]) || 0) : 0;
                return { name: m.name, hits, points, prize, played };
            });

            // Winner logic (Max Points > Max Hits)
            const winnersArr = [...currentResults].filter(r => r.played).sort((a, b) => b.points - a.points || b.hits - a.hits);
            const maxP = winnersArr[0]?.points;
            const maxH = winnersArr[0]?.hits;
            const topNames = winnersArr.filter(r => r.points === maxP && r.hits === maxH).map(r => r.name).join(', ');

            // Loser logic (Min Hits > Min Points)
            const losersArr = [...currentResults].filter(r => r.played).sort((a, b) => a.hits - b.hits || a.points - b.points);
            const minH = losersArr[0]?.hits;
            const minP = losersArr[0]?.points;
            const bottomNames = losersArr.filter(r => r.hits === minH && r.points === minP).map(r => r.name).join(', ');

            // 5. Build Message
            let msg = `🏆 *PEÑA MAULAS - JORNADA ${currentJ.number}* 🏆\n`;
            msg += `📅 _${currentJ.date}_\n\n`;

            msg += `*📊 RESULTADOS:* \n`;
            [...currentResults].sort((a, b) => b.points - a.points || b.hits - a.hits).forEach((r, idx) => {
                let medal = '';
                if (idx === 0) medal = '🥇 ';
                else if (idx === 1) medal = '🥈 ';
                else if (idx === 2) medal = '🥉 ';
                else medal = '🔹 ';

                msg += `${medal}${r.name}: *${r.hits}* ac. (${r.points} pts)${r.prize > 0 ? ` 💰 *${r.prize.toFixed(2)}€*` : ''}\n`;
            });

            // Extra / Doubles (Anonymous)
            const extras = pronosticosExtra.filter(p => (p.jId == currentJ.id || p.jornadaId == currentJ.id));
            if (extras.length > 0) {
                msg += `\n*✨ ACIERTOS QUINIELA DE DOBLES:*\n`;
                extras.forEach(p => {
                    let hits = 0;
                    const sel = p.selection || [];
                    sel.forEach((s, idx) => {
                        if (officialResults[idx] && s && s.includes(officialResults[idx])) hits++;
                    });
                    msg += `🔹 Resultado: *${hits}* aciertos\n`;
                });
            }

            // Labels Update
            msg += `\n🎟️ Quiniela de dobles: *${topNames}*`;
            msg += `\n✍️ Sella: *${bottomNames}*`;

            // Full Global Ranking
            const fullRanking = Object.values(globalStats).sort((a, b) => b.totalPoints - a.totalPoints);
            msg += `\n\n*🏆 CLASIFICACIÓN GENERAL COMPLETA:*\n`;
            fullRanking.forEach((r, idx) => {
                let pos = (idx + 1).toString().padStart(2, ' ');
                msg += `${pos}. ${r.name}: *${r.totalPoints}* pts\n`;
            });

            msg += `\n🔗 [Web Peña Maulas](https://peñamaulas.com)`;

            return await this.sendRaw(tg.token, tg.chatId, msg);

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
