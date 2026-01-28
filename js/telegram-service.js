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

            // 3. Process ALL Results and History for Tie-breaking
            const activeJornadas = jornadas.filter(j =>
                j.active && j.matches && j.matches[0] && j.matches[0].result
            ).sort((a, b) => a.number - b.number);

            const memberHistory = {};
            members.forEach(m => memberHistory[m.id] = []);

            const globalStats = {};
            members.forEach(m => globalStats[m.id] = { name: AppUtils.getMemberName(m), totalPoints: 0 });

            // Build history up to current jornada
            activeJornadas.forEach(aj => {
                const ajResults = aj.matches.map(m => m.result);
                const ajDate = AppUtils.parseDate(aj.date);
                members.forEach(m => {
                    const p = pronosticos.find(pred => (pred.jId == aj.id || pred.jornadaId == aj.id) && (pred.mId == m.id || pred.memberId == m.id));
                    let h = 0;
                    let pts = 0;
                    if (p && p.selection) {
                        const ev = ScoringSystem.evaluateForecast(p.selection, ajResults, ajDate);
                        h = ev.hits;
                        pts = ev.points;
                        // Handle Late/Unpardoned in history too
                        if (p.late && !p.pardoned) {
                            h = 0;
                            pts = ScoringSystem.calculateScore(0, ajDate);
                        }
                    }
                    memberHistory[m.id].push({ hits: h, points: pts });
                    globalStats[m.id].totalPoints += pts;
                });
            });

            // 4. Current Jornada Evaluation
            const officialResults = currentJ.matches.map(m => m.result);
            const jDate = AppUtils.parseDate(currentJ.date);
            const minHits = currentJ.minHitsToWin || 10;

            const currentResults = members.map(m => {
                const p = pronosticos.find(pred => (pred.jId == currentJ.id || pred.jornadaId == currentJ.id) && (pred.mId == m.id || pred.memberId == m.id));
                let hits = 0;
                let points = 0;
                let played = false;
                let isLate = false;
                let isPardoned = false;

                if (p) {
                    played = true;
                    isLate = p.late || false;
                    isPardoned = p.pardoned || false;
                    if (isLate && !isPardoned) {
                        hits = 0;
                        points = ScoringSystem.calculateScore(0, jDate);
                    } else if (p.selection) {
                        const ev = ScoringSystem.evaluateForecast(p.selection, officialResults, jDate);
                        hits = ev.hits;
                        points = ev.points;
                    }
                }

                const prize = (hits >= minHits) ? ((currentJ.prizeRates && currentJ.prizeRates[hits]) || 0) : 0;
                return {
                    id: m.id,
                    name: AppUtils.getMemberName(m),
                    hits,
                    points,
                    prize,
                    played,
                    isLate,
                    isPardoned
                };
            });

            // --- WINNER LOGIC ---
            const maxPoints = Math.max(...currentResults.map(r => r.points));
            let winnerCandidates = currentResults.filter(r => r.points === maxPoints);

            if (winnerCandidates.length > 1) {
                winnerCandidates = this.resolveTie(winnerCandidates, memberHistory, 'points', 'max');
            }
            // Final fallback: Lower ID
            winnerCandidates.sort((a, b) => a.id - b.id);
            const winner = winnerCandidates[0];

            // --- LOSER LOGIC ---
            const offenders = currentResults.filter(r => !r.played || (r.isLate && !r.isPardoned && r.hits < minHits));
            let maulaCandidates = [];

            if (offenders.length > 0) {
                maulaCandidates = offenders;
            } else {
                const minPoints = Math.min(...currentResults.map(r => r.points));
                maulaCandidates = currentResults.filter(r => r.points === minPoints);
            }

            if (maulaCandidates.length > 1) {
                maulaCandidates = this.resolveTie(maulaCandidates, memberHistory, 'points', 'min');
            }
            // Final fallback: Higher ID
            maulaCandidates.sort((a, b) => b.id - a.id);
            const loser = maulaCandidates[0];

            // --- ELIGIBLE FOR NEXT DOBLES ---
            const eligibleForNext = currentResults
                .filter(r => r.id === winner.id || (r.hits >= minHits && r.played))
                .map(r => r.name);
            const eligibleNames = [...new Set(eligibleForNext)].sort().join(", ");

            // 5. Build Message
            let msg = `🏆 *PEÑA MAULAS - JORNADA ${currentJ.number}* 🏆\n`;
            msg += `📅 _${currentJ.date}_\n\n`;

            msg += `*📊 RESULTADOS:* \n`;
            [...currentResults].sort((a, b) => b.points - a.points || b.hits - a.hits || a.id - b.id).forEach((r, idx) => {
                let medal = '';
                if (idx === 0) medal = '🥇 ';
                else if (idx === 1) medal = '🥈 ';
                else if (idx === 2) medal = '🥉 ';
                else medal = '🔹 ';

                msg += `${medal}${r.name}: *${r.hits}* ac. (${r.points} pts)${r.prize > 0 ? ` 💰 *${r.prize.toFixed(2)}€*` : ''}\n`;
            });

            msg += `\n🎟️ Quiniela de dobles: *${eligibleNames}*`;
            msg += `\n✍️ Sella: *${loser.name}*`;

            // Extras / Doubles
            const extras = pronosticosExtra.filter(p => (p.jId == currentJ.id || p.jornadaId == currentJ.id));
            if (extras.length > 0) {
                msg += `\n*✨ ACIERTOS QUINIELA DE DOBLES:*\n`;
                extras.forEach(p => {
                    let hCount = 0;
                    const sel = p.selection || [];
                    sel.forEach((s, idx) => {
                        if (officialResults[idx] && s && s.includes(officialResults[idx])) hCount++;
                    });
                    msg += `🔹 Resultado: *${hCount}* aciertos\n`;
                });
            }

            msg += `\n🎟️ Quiniela de dobles: *${winner.name}*`;
            msg += `\n✍️ Sella: *${loser.name}*`;

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

    resolveTie(candidates, history, metric, goal) {
        if (!candidates || candidates.length <= 1) return candidates;

        let sampleId = candidates[0].id;
        let hLen = history[sampleId].length;
        let index = hLen - 2; // Start from the jornada BEFORE the current one
        let currentCandidates = [...candidates];

        while (currentCandidates.length > 1 && index >= 0) {
            const values = currentCandidates.map(c => ({
                id: c.id,
                val: history[c.id][index] ? history[c.id][index][metric] : 0
            }));

            let target;
            if (goal === 'max') {
                target = Math.max(...values.map(v => v.val));
            } else {
                target = Math.min(...values.map(v => v.val));
            }

            const survivors = values.filter(v => v.val === target).map(v => v.id);
            currentCandidates = currentCandidates.filter(c => survivors.includes(c.id));
            index--;
        }
        return currentCandidates;
    },

    async sendVoteNotification(vote) {
        if (!window.DataService) return;
        const tg = await window.DataService.getDoc('config', 'telegram');
        if (!tg || !tg.enabled) return;

        // The official direct app link is the only one that works reliably in groups
        const urlApp = "https://t.me/Maula_Penia_Bot/votaciones";

        const safeTitle = (vote.title || "").replace(/[*_`]/g, '');
        const safeDesc = (vote.description || "").replace(/[*_`]/g, '');
        const msg = `🆕 *NUEVA VOTACIÓN* 🗳️\n\n*${safeTitle}*\n${safeDesc ? `_${safeDesc}_` : ''}\n\n⌛ Límite: ${new Date(vote.deadline).toLocaleString()}\n✅ Mínimo para ganar: ${vote.threshold}%\n\nPuedes votar pulsando el botón de abajo:`;

        return await this.sendRaw(tg.token, tg.chatId, msg, {
            reply_markup: {
                inline_keyboard: [[{ text: "🗳️ VOTAR EN TELEGRAM", url: urlApp }]]
            }
        });
    },

    async sendVoteResultReport(v, members) {
        if (!window.DataService) return;
        const tg = await window.DataService.getDoc('config', 'telegram');
        if (!tg || !tg.enabled) return;

        const options = v.options || ["Sí", "No"];
        const votes = v.votes || {};
        const totalVoters = Object.keys(votes).length;

        // Count each option (works for both single values and arrays)
        const counts = options.map((_, idx) => {
            let c = 0;
            Object.values(votes).forEach(val => {
                if (Array.isArray(val)) {
                    if (val.includes(idx)) c++;
                } else if (val === idx) {
                    c++;
                }
            });
            return c;
        });

        const maxVal = Math.max(...counts);
        const winnerIndices = counts.reduce((acc, c, i) => (c === maxVal ? [...acc, i] : acc), []);
        const winnerPct = totalVoters > 0 ? (maxVal / totalVoters * 100) : 0;

        let resText = "";
        if (totalVoters === 0) resText = "❌ Sin votos.";
        else if (winnerIndices.length > 1) resText = `⚖️ EMPATE ENTRE: ${winnerIndices.map(i => options[i].toUpperCase()).join(', ')}`;
        else if (winnerPct >= v.threshold) resText = `🏆 GANADOR: *${options[winnerIndices[0]]}* (${winnerPct.toFixed(1)}%)`;
        else resText = `❌ NO ALCANZA MAYORÍA (${winnerPct.toFixed(1)}% < ${v.threshold}%)`;

        let msg = `🏁 *VOTACIÓN FINALIZADA* 🏁\n\n*Tema:* ${v.title.replace(/[*_`]/g, '')}\n${v.allowMultiple ? '_(Votación múltiple)_\n' : ''}\n*Resultados:*\n`;
        options.forEach((o, i) => {
            const pct = totalVoters > 0 ? (counts[i] / totalVoters * 100).toFixed(0) : 0;
            msg += `- ${o}: ${counts[i]} votos (${pct}%)\n`;
        });

        msg += `\n${resText}`;

        return await this.sendRaw(tg.token, tg.chatId, msg);
    },

    async sendRaw(token, chatId, text, extra = {}) {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            ...extra
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!data.ok) console.error("TGService Error Details:", data);
            return data;
        } catch (e) {
            console.error("TGService Fetch Error:", e);
            return { ok: false, description: e.message };
        }
    },
    async checkThursdayReminder() {
        if (!window.DataService) return;

        try {
            // 1. Get Config
            const config = await window.DataService.getAll('config');
            const tg = config.find(c => c.id === 'telegram');
            const rem = config.find(c => c.id === 'reminder') || {
                day: 4,
                hour: 9,
                message: '¡¡Por fin es jueves!! 🦅\n\nNo olvidéis rellenar la quiniela de la Jornada {jornada}.\n🔗 [Peña Maulas](https://peñamaulas.com)'
            };

            if (!tg || !tg.enabled || !tg.reminderEnabled || !tg.token || !tg.chatId) return;

            const now = new Date();

            // 2. Check Date Range
            if (rem.startDate) {
                const start = new Date(rem.startDate);
                if (now < start) return;
            }
            if (rem.endDate) {
                const end = new Date(rem.endDate);
                end.setHours(23, 59, 59, 999);
                if (now > end) return;
            }

            // 3. Check Day & Hour
            // rem.day is 0-6 (Sun-Sat)
            const dayOfWeek = now.getDay();
            const hour = now.getHours();

            if (dayOfWeek !== rem.day || hour < (rem.hour || 0)) return;

            // 4. Find target Jornada (upcoming)
            const jornadas = await window.DataService.getAll('jornadas');

            const targetJornada = jornadas.find(j => {
                if (!j.active) return false;
                // If already sent, skip
                if (j.thursdayReminderSent) return false;

                const jDate = AppUtils.parseDate(j.date);
                if (!jDate) return false;

                // Time diff in milliseconds
                const diff = jDate.getTime() - now.getTime();
                const diffDays = diff / (1000 * 3600 * 24);

                // We target the next Jornada within the next 6 days (to be safe across different configured days)
                return diffDays >= 0 && diffDays <= 6;
            });

            if (targetJornada) {
                console.log(`TelegramService: Sending Weekly Reminder (J${targetJornada.number})...`);

                let msg = rem.message || '¡¡Por fin es jueves!! 🦅\n\nNo olvidéis rellenar la quiniela de la Jornada {jornada}.\n🔗 [Peña Maulas](https://peñamaulas.com)';
                msg = msg.replace('{jornada}', targetJornada.number);

                const res = await this.sendRaw(tg.token, tg.chatId, msg);

                if (res.ok) {
                    targetJornada.thursdayReminderSent = true;
                    await window.DataService.save('jornadas', targetJornada);
                    console.log("TelegramService: Reminder sent and logged.");
                } else {
                    console.error("TelegramService: Failed to send reminder", res);
                }
            }

        } catch (e) {
            console.error("TelegramService (Reminder) Error:", e);
        }
    }
};

